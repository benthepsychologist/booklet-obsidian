/*
 * The gate (plan-v2, "The gate is allowed"): Markdown with every remote media form swapped, before Obsidian draws it, for a token
 * that stands for a slot the view draws (media-view.ts). Nothing here can request an address: a remote embed is a token or words,
 * never left for Obsidian to fetch, so nothing remote is requested before a press. Pure: Obsidian, the DOM and the network are not
 * imported or touched.
 *
 * What it rewrites, outside code, maths and comments: the three embed forms (`![alt](address "title")`, `![alt][id]` with `![id][]`
 * and `![id]`), a link, an autolink or a bare address standing alone on its line when it leads to a service the plugin plays, and the
 * raw tags `iframe frame object embed audio video source track` that carry a remote address (and `img`, `image`, when what they
 * load is audio, video or a page Obsidian would turn into a frame). A local audio or video file written as `![alt][id]`, `![id][]`
 * or `![id]` becomes `![alt](path)`, since Obsidian draws a reference embed of it as a broken picture and the inline form as a
 * player (spike S1). A remote image, any other local embed and everything that is not one of these stay Obsidian's.
 *
 * An address is read the way a browser reads it, not the way it is written: character references (`&#104;ttps://`, `&colon;`) are
 * undone, tabs and line breaks inside it dropped, and `https:/host` and `https:host` are as remote as `https://host` (spike B2,
 * Obsidian 1.14.5: each of these loads at render).
 */
import { inertLines, inertSpans } from "./blocks";
import { entryFor, isAllowed, type Allows } from "./allow";
import { hostOf, mediaClass } from "./media";
import { referenceSource } from "./references";
import { isEmbedAddress, serviceAllowed, serviceOf, type Service } from "./services";

/** Private-use characters round the number of a slot in rewritten text (U+E000 and U+E001 stand for footnote marks, blocks.ts). */
export const SLOT_OPEN = "";
export const SLOT_CLOSE = "";

/** `block`: prose, help and openings, where media is drawn. `inline`: a title, option, anchor, label, matrix item, card or trail, where media is never drawn and a media embed is its alt text. */
export type GateMode = "block" | "inline";

export interface GateContext {
	mode: GateMode;
	allows: Allows;
	/** The note's path: its own list of allowed sites is the one that applies. */
	notePath: string;
}

/**
 * What a token stands for. `media`: a remote file with an audio or video extension, a Play slot (`allowed`) or one that asks first.
 * `service`: a page of a service the plugin plays, the same (`embedUrl`: its own framed player; `native`: the address Obsidian is handed to draw the player itself, YouTube's). `refused`: media at an address that can never be allowed (not https).
 * `link`: a frame, a raw media tag, or an address that is not media, drawn as a link naming its host and never loaded.
 */
export type MediaSlot =
	| { type: "media"; media: "audio" | "video"; addr: string; alt: string; host: string; entry: string; allowed: boolean }
	| { type: "service"; media: "audio" | "video"; name: string; addr: string; embedUrl: string | null; native: string | null; shown: string[]; allow: string; alt: string; host: string; entry: string; allowed: boolean }
	| { type: "refused"; media: "audio" | "video"; addr: string; alt: string; host: string }
	| { type: "link"; addr: string; alt: string; host: string; why: "frame" | "address" };

export interface Gated {
	text: string;
	/** The slots the tokens in `text` stand for, by the number in the token. */
	slots: MediaSlot[];
}

/** One rewrite of the source: its characters from `from` up to `to` become `repl` (words), or a token for the slot `repl` is. */
interface Edit {
	from: number;
	to: number;
	repl: string | MediaSlot;
}

/** Text that holds nothing the gate looks at is handed back as it is. */
const MAYBE = /!\[|\]\(|\]\[|<https?:|https?:|&|<(?:iframe|frame|object|embed|audio|video|source|track|img|image)\b/i;
const RAW_TAG = /<(iframe|frame|object|embed|audio|video|source|track|img|image)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const PAIRED = new Set(["iframe", "object", "audio", "video"]);
/** The start of a line that is a quote, a list item, or nothing: a link alone on its line stands alone in its block. */
const BLOCK_START = "(?:[ \\t]*(?:>|[-*+][ \\t]|\\d{1,9}[.)][ \\t]))*[ \\t]*";
const SEARCH = 4000;

const blank = (s: string): string => s.replace(/[^\n]/g, " ");
const norm = (label: string): string => label.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The text with code, inline maths and comments blanked to spaces (newlines kept), so every offset in it is an offset in the text.
 * An unclosed comment is no comment, and a block of maths between `$$` lines is not skipped (one that never closes would hide the
 * rest of the text from the gate, and Obsidian draws what follows it): media in either is gated all the same.
 */
function maskInert(text: string): string {
	const lines = text.split("\n");
	const inert = inertLines(lines.map((l) => (l.trim() === "$$" ? "x" : l)));
	let out = lines.map((l, i) => (inert[i] ? blank(l) : inertSpans(l))).join("\n");
	for (const [open, close] of [["<!--", "-->"], ["%%", "%%"]] as const) {
		let at = 0;
		for (;;) {
			const a = out.indexOf(open, at);
			if (a < 0) break;
			const b = out.indexOf(close, a + open.length);
			if (b < 0) break;
			const end = b + close.length;
			out = out.slice(0, a) + blank(out.slice(a, end)) + out.slice(end);
			at = end;
		}
	}
	return out;
}

/** The definitions Obsidian is handed, by label: the first of a label wins. */
function definitionsOf(text: string): Map<string, string> {
	const out = new Map<string, string>();
	if (!text.includes("]:")) return out;
	for (const d of referenceSource(text).definitions.values()) {
		const m = /^\[((?:\\.|[^\\\]])*)\]:[ \t]+(<[^>]*>|\S+)/.exec(d.text);
		if (!m || m[1] === undefined || m[2] === undefined) continue;
		const label = norm(m[1]);
		if (!out.has(label)) out.set(label, m[2].startsWith("<") ? m[2].slice(1, -1) : m[2]);
	}
	return out;
}

/** The `]` that closes the `[` at `open` (brackets nest, a backslash escapes, a blank line ends the search), else -1. */
function closeBracket(s: string, open: number): number {
	let depth = 0;
	const stop = Math.min(s.length, open + SEARCH);
	for (let i = open; i < stop; i++) {
		const c = s[i];
		if (c === "\\") i++;
		else if (c === "\n" && s[i + 1] === "\n") return -1;
		else if (c === "[") depth++;
		else if (c === "]" && --depth === 0) return i;
	}
	return -1;
}

/** The target of an inline link or image whose `(` is at `open`: its address (read from `text`) and the offset after its `)`, else null. */
function parseInline(s: string, text: string, open: number): { dest: string; end: number } | null {
	let i = open + 1;
	const space = (): boolean => {
		let lines = 0;
		while (i < s.length && /[ \t\r\n]/.test(s[i] ?? "")) if (s[i++] === "\n" && ++lines > 1) return false;
		return true;
	};
	if (!space()) return null;
	let dest: string;
	if (s[i] === "<") {
		const j = s.indexOf(">", i + 1);
		const nl = s.indexOf("\n", i + 1);
		if (j < 0 || (nl >= 0 && nl < j)) return null;
		dest = text.slice(i + 1, j);
		i = j + 1;
	} else {
		const start = i;
		let depth = 0;
		for (; i < s.length; i++) {
			const c = s[i] ?? "";
			if (c === "\\") i++;
			else if (c === "(") depth++;
			else if (c === ")") {
				if (depth === 0) break;
				depth--;
			} else if (/\s/.test(c)) break;
		}
		dest = text.slice(start, i);
	}
	if (!space()) return null;
	const q = s[i];
	if (q === '"' || q === "'" || q === "(") {
		const close = q === "(" ? ")" : q;
		let j = i + 1;
		for (; j < s.length && s[j] !== close; j++) if (s[j] === "\\") j++;
		if (j >= s.length) return null;
		i = j + 1;
		if (!space()) return null;
	}
	return s[i] === ")" ? { dest, end: i + 1 } : null;
}

/** The characters a named reference can write that an address is made of; a numbered reference is read whatever it writes. */
const NAMED: Record<string, string> = { amp: "&", AMP: "&", lt: "<", gt: ">", quot: '"', apos: "'", colon: ":", sol: "/", bsol: "\\", period: ".", num: "#", quest: "?", equals: "=", percnt: "%", comma: ",", semi: ";", lpar: "(", rpar: ")", plus: "+", lowbar: "_", excl: "!", ast: "*", commat: "@", dollar: "$", Tab: "\t", NewLine: "\n" };

/** Character references undone once, as a browser reads an attribute (`&#104;`, `&#x68;`, `&colon;`; a number may lack its `;`). */
function undoReferences(s: string): string {
	if (!s.includes("&")) return s;
	return s.replace(/&(?:#(\d{1,7});?|#[xX]([0-9a-fA-F]{1,6});?|([A-Za-z][A-Za-z0-9]{1,31});)/g, (m, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
		if (name !== undefined) return Object.prototype.hasOwnProperty.call(NAMED, name) ? (NAMED[name] as string) : m;
		const n = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? "", 16);
		return n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : m;
	});
}

/** An address as a browser reads it: character references undone once, tabs and line breaks inside it gone, controls and spaces at its ends gone. */
const addressOf = (raw: string): string => undoReferences(raw).replace(/[\t\n\r]/g, "").replace(/^[\0-\x20]+|[\0-\x20]+$/g, "");

/** An address as written in a target: backslash escapes undone, then read as a browser reads it. */
const clean = (dest: string): string => addressOf(dest.replace(/\\([!-/:-@[-`{-~])/g, "$1"));

/** Alt or link text as plain words: marks gone, a size suffix (`|300`) gone. */
const altText = (raw: string): string =>
	raw
		.replace(/\|\d+(?:x\d+)?\s*$/, "")
		.replace(/\\(.)/g, "$1")
		.replace(/[[\]*`]/g, "")
		.replace(/\s+/g, " ")
		.trim();

/** Words put back into Markdown as words. */
const escapeMd = (s: string): string => s.replace(/[\\`*_{}[\]<>#|~]/g, "\\$&");

/** The last part of an address or path, as a name for the thing. */
function nameOf(addr: string): string {
	const part = (addr.split(/[?#]/, 1)[0] ?? "").split("/").filter(Boolean).pop() ?? addr;
	try {
		return decodeURIComponent(part);
	} catch {
		return part;
	}
}

/** Where an address leads: `https`, `http`, `proto` (starts `//`), or `local` (a path in the vault, or a scheme that is Obsidian's). A scheme with one slash or none (`https:host`) leads where `https://host` does: a browser reads it so. */
function whereIs(dest: string): "https" | "http" | "proto" | "local" {
	if (/^https:/i.test(dest)) return "https";
	if (/^http:/i.test(dest)) return "http";
	if (dest.startsWith("//")) return "proto";
	return "local";
}

function absolute(dest: string, where: "https" | "http" | "proto"): string | null {
	try {
		return new URL(where === "proto" ? `https:${dest}` : dest).href;
	} catch {
		return null;
	}
}

/** The slot of a service's page: its player, and what the press will ask. */
function serviceSlot(svc: Service, addr: string, alt: string, host: string, allowed: boolean): MediaSlot {
	return { type: "service", media: svc.kind, name: svc.name, addr, embedUrl: svc.embedUrl, native: svc.native, shown: svc.shown, allow: svc.allow, alt: alt || svc.name, host, entry: svc.hosts[0] ?? host, allowed };
}

class Gate {
	readonly inline: boolean;
	constructor(
		readonly ctx: GateContext,
		readonly defs: Map<string, string>,
	) {
		this.inline = ctx.mode === "inline";
	}

	/** What stands in place of a media embed whose address is `dest` (words, or a slot); null leaves it to Obsidian. */
	embed(dest: string, altRaw: string, viaDefinition = false): string | MediaSlot | null {
		const alt = altText(altRaw);
		const where = whereIs(dest);
		const cls = mediaClass(dest);
		if (where === "local") {
			if (cls !== "audio" && cls !== "video") return null;
			if (this.inline) return escapeMd(alt || nameOf(dest));
			// Obsidian draws a reference embed of a local file as a broken `img`, and the inline form as a player: so it is handed the inline form
			return viaDefinition && !/[<>]/.test(dest) ? `![${alt}](${/[\s()]/.test(dest) ? `<${dest}>` : dest})` : null;
		}
		const addr = absolute(dest, where);
		// Obsidian draws a YouTube or Twitter address as a frame whatever the rest of it says (even a picture's ending): it is never left to Obsidian
		const tube = !!addr && isEmbedAddress(addr);
		if (cls === "image" && !tube) return null;
		const host = addr ? hostOf(addr) : null;
		if (!addr || !host) return null;
		if (this.inline) return escapeMd(alt || (cls ? nameOf(dest) : host));
		const { allows, notePath } = this.ctx;
		const media = !tube && (cls === "audio" || cls === "video") ? cls : null;
		if (where !== "https") return media ? { type: "refused", media, addr, alt, host } : { type: "link", addr, alt, host, why: "address" };
		if (media) return { type: "media", media, addr, alt, host, entry: entryFor(addr) ?? host, allowed: isAllowed(addr, allows, notePath) };
		const svc = serviceOf(addr);
		if (!svc) return { type: "link", addr, alt, host, why: "address" };
		return serviceSlot(svc, addr, alt, host, serviceAllowed(svc, addr, allows, notePath));
	}

	/** A link, autolink or bare address that stands alone and leads to an allowed service: its player's slot; null leaves the link as it is. */
	link(dest: string, textRaw: string): MediaSlot | null {
		const where = whereIs(dest);
		const addr = where === "https" ? absolute(dest, where) : null;
		const svc = addr ? serviceOf(addr) : null;
		const host = addr ? hostOf(addr) : null;
		if (!addr || !svc || !host || !serviceAllowed(svc, addr, this.ctx.allows, this.ctx.notePath)) return null;
		return serviceSlot(svc, addr, altText(textRaw), host, true);
	}

	/** A raw `img` or `image` whose address is audio, video or a page Obsidian would draw as a frame: what a Markdown embed of it would be. Any other picture stays Obsidian's. */
	image(src: string, alt: string): string | MediaSlot | null {
		const cls = mediaClass(src);
		const where = whereIs(src);
		if (where === "local") return null;
		const addr = absolute(src, where);
		return addr && (cls === "audio" || cls === "video" || isEmbedAddress(addr)) ? this.embed(src, alt) : null;
	}

	/** A raw tag with a remote address: a link naming its host (nothing is loaded), or in a title the host alone. */
	frame(src: string, alt: string): string | MediaSlot | null {
		const where = whereIs(src);
		if (where === "local") return null;
		const addr = absolute(src, where);
		const host = addr ? hostOf(addr) : null;
		if (!addr || !host) return null;
		return this.inline ? escapeMd(host) : { type: "link", addr, alt, host, why: "frame" };
	}
}

/** One attribute's value in a tag's attributes, read as a browser reads it (see `addressOf`). */
function attr(attrs: string, name: string): string | null {
	const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(attrs);
	const v = m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
	return v === null ? null : addressOf(v);
}

/** The addresses of the `source`, `track` and `embed` tags inside a paired tag's text. */
function childAddresses(inside: string): string[] {
	const out: string[] = [];
	for (const n of inside.matchAll(/<(?:source|track|embed)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)) out.push(attr(n[1] ?? "", "src") ?? "");
	return out;
}

/**
 * The edits for raw tags that carry a remote address. A tag with an address of its own plays from it (and a browser ignores the
 * `source` tags inside); one without plays from the first of its `source` and `track` tags that is remote (spike B2: with a local
 * first, the second loads).
 */
function rawTags(mask: string, text: string, g: Gate, edits: Edit[]): void {
	for (const m of mask.matchAll(RAW_TAG)) {
		const tag = (m[1] ?? "").toLowerCase();
		const from = m.index;
		let to = from + m[0].length;
		if (PAIRED.has(tag)) {
			const close = new RegExp(`</${tag}\\s*>`, "i").exec(mask.slice(to));
			if (close) to += close.index + close[0].length;
		}
		const attrs = text.slice(from, from + m[0].length);
		const own = attr(attrs, tag === "object" ? "data" : "src") ?? (tag === "object" ? attr(attrs, "src") : null);
		const src = own !== null ? own : (childAddresses(text.slice(from + m[0].length, to)).find((a) => a && whereIs(a) !== "local") ?? null);
		if (!src) continue;
		const alt = attr(attrs, tag === "img" || tag === "image" ? "alt" : "title") ?? "";
		const repl = tag === "img" || tag === "image" ? g.image(src, alt) : g.frame(src, alt);
		if (repl !== null) edits.push({ from, to, repl });
	}
}

/** Does the source from `from` to `to` stand alone on its line, after a quote or list marker at most? */
function alone(text: string, from: number, to: number): boolean {
	const ls = text.lastIndexOf("\n", from - 1) + 1;
	const le = text.indexOf("\n", to);
	const before = text.slice(ls, from);
	return new RegExp(`^${BLOCK_START}$`).test(before) && text.slice(to, le < 0 ? text.length : le).trim() === "";
}

/**
 * The text with every remote media form gated. In `block` mode a media embed becomes a token (see MediaSlot); in `inline` mode it
 * becomes its alt text, a local audio or video embed too, and no request is possible. The same definitions Obsidian is handed
 * (the lines the caller appends to the text) resolve `![alt][id]`. Anything else is returned exactly as it was.
 */
export function gateMedia(markdown: string, ctx: GateContext): Gated {
	// a private-use mark already in the text could stand for a slot it is not: they draw nothing, so they are dropped
	const text = markdown.replace(/[]/g, "");
	if (!MAYBE.test(text)) return { text, slots: [] };
	const mask = maskInert(text);
	const g = new Gate(ctx, definitionsOf(text));
	const edits: Edit[] = [];
	const slots: MediaSlot[] = [];

	// `![alt](address)`, `![alt][id]`, `![id][]`, `![id]`
	for (let i = mask.indexOf("!["); i >= 0; i = mask.indexOf("![", i + 2)) {
		if (mask[i + 2] === "[") continue;
		const close = closeBracket(mask, i + 1);
		if (close < 0) continue;
		const altRaw = text.slice(i + 2, close);
		let dest: string | null = null;
		let end = close + 1;
		if (mask[close + 1] === "(") {
			const p = parseInline(mask, text, close + 1);
			if (!p) continue;
			dest = p.dest;
			end = p.end;
		} else if (mask[close + 1] === "[") {
			const c2 = closeBracket(mask, close + 1);
			if (c2 < 0) continue;
			const id = text.slice(close + 2, c2);
			dest = g.defs.get(norm(id.trim() ? id : altRaw)) ?? null;
			end = c2 + 1;
		} else dest = g.defs.get(norm(altRaw)) ?? null;
		if (dest === null) continue;
		const repl = g.embed(clean(dest), altRaw, mask[close + 1] !== "(");
		if (repl !== null) edits.push({ from: i, to: end, repl });
	}

	// `![[x.mp3]]` is Obsidian's own, except in a title or a label, where media is never drawn
	if (g.inline && mask.includes("![[")) {
		for (const m of mask.matchAll(/!\[\[([^[\]\n]+)\]\]/g)) {
			const target = ((m[1] ?? "").split("|", 1)[0] ?? "").split("#", 1)[0] ?? "";
			const cls = mediaClass(target.trim());
			if (cls === "audio" || cls === "video") edits.push({ from: m.index, to: m.index + m[0].length, repl: escapeMd(nameOf(target.trim())) });
		}
	}

	rawTags(mask, text, g, edits);

	// a link to a service, alone on its line, becomes the service's player once the service is allowed
	if (!g.inline) {
		for (let i = mask.indexOf("["); i >= 0; i = mask.indexOf("[", i + 1)) {
			if (mask[i - 1] === "!" || mask[i + 1] === "[" || mask[i - 1] === "[" || mask[i - 1] === "\\") continue;
			const close = closeBracket(mask, i);
			if (close < 0) continue;
			let dest: string | null = null;
			let end = close + 1;
			if (mask[close + 1] === "(") {
				const p = parseInline(mask, text, close + 1);
				if (!p) continue;
				dest = p.dest;
				end = p.end;
			} else if (mask[close + 1] === "[") {
				const c2 = closeBracket(mask, close + 1);
				if (c2 < 0) continue;
				const id = text.slice(close + 2, c2);
				dest = g.defs.get(norm(id.trim() ? id : text.slice(i + 1, close))) ?? null;
				end = c2 + 1;
			}
			if (dest === null || !alone(text, i, end)) continue;
			const repl = g.link(clean(dest), text.slice(i + 1, close));
			if (repl !== null) edits.push({ from: i, to: end, repl });
		}
		for (const re of [new RegExp(`^(${BLOCK_START})<(https://[^\\s<>]+)>[ \\t\\r]*$`, "gm"), new RegExp(`^(${BLOCK_START})(https://[^\\s<>]+)[ \\t\\r]*$`, "gm")]) {
			for (const m of mask.matchAll(re)) {
				const from = m.index + (m[1] ?? "").length;
				const to = m.index + m[0].replace(/[ \t\r]*$/, "").length;
				const repl = g.link(clean(text.slice(from, to).replace(/^<|>$/g, "")), "");
				if (repl !== null) edits.push({ from, to, repl });
			}
		}
	}

	if (!edits.length) return { text, slots };
	// the edits are made in the order of the text, an edit inside another is dropped, and the slots are numbered as they come
	edits.sort((a, b) => a.from - b.from || b.to - a.to);
	let out = "";
	let at = 0;
	for (const e of edits) {
		if (e.from < at) continue;
		out += text.slice(at, e.from) + (typeof e.repl === "string" ? e.repl : `${SLOT_OPEN}${slots.push(e.repl) - 1}${SLOT_CLOSE}`);
		at = e.to;
	}
	return { text: out + text.slice(at), slots };
}
