/*
 * The line under a `listen` or a `widget` question that holds what the question is about, as one control of the Design view's editor in
 * place: a listen's media (an embed or a link, SPEC section 5, "Listen") and a widget's data block (the block embed `![[#^id]]` under the
 * line, SPEC section 7). Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * ONLY WHAT IS LOSSLESS. The controls are offered for a line that is nothing but that one embed or link, in a form this file reads without
 * guessing:
 *
 *   `> ![alt](address "title")`   an embed in the image syntax (a listen's)
 *   `> [words](address "title")`  a link (a listen's: a video service's page is a link and never an embed)
 *   `> ![[file.mp3]]`             Obsidian's file embed (a listen's)
 *   `> ![[#^block-id]]`           the block embed that names a widget's data block (a widget's)
 *
 * and only when it is the line the READER takes as the question's media (`listenBody`, the first embed, else the first link; for a
 * widget, the first block embed in its words). A reference-style embed, an address that holds a space or a bracket, an embed in the middle
 * of a sentence, a second embed: no control, and the line stays in the question's words and in the Markdown, as written. A change rewrites
 * the pieces it was asked to change (the alt text, the address, the block id) and keeps every other byte of the line (the `>` and its
 * space, the title in quotes, the spaces at the end), and no other line.
 */
import { listenBody } from "./listen";
import { mediaClass } from "./media";
import { LP } from "./editor-patterns";
import { parseLine } from "./editor-line";

export type MediaForm = "embed" | "link" | "file" | "block";

/** The media line of a block, as read. */
export interface MediaLine {
	/** The line's index among the block's own lines (0 is the question's line). */
	index: number;
	form: MediaForm;
	/** The words in the brackets (the alt text of an embed, the words of a link); null for a file embed and a block embed. */
	alt: string | null;
	/** The address (an embed's or a link's), the file name (a file embed, with any size suffix), or the block id (a block embed). */
	target: string;
}

const QUOTED = /^>[ ]?/;
const INLINE = /^(>[ ]?)(!?)\[([^\][\n]*)\]\(([^()\s"<>]*)((?:[ \t]+"[^"\n]*")?)\)([ \t]*)$/;
const FILE = /^(>[ ]?)!\[\[([^\][\n#|][^\][\n]*)\]\]([ \t]*)$/;
const BLOCK = /^(>[ ]?)!\[\[#\^([A-Za-z0-9-]+)\]\]([ \t]*)$/;
/** The first block embed in a widget's words (the reader's own search, reader.ts). */
const BLOCK_ANYWHERE = /!\[\[[^\]#|]*#\^([A-Za-z0-9-]+)[^\]]*\]\]/;

/** The index past the first line and the `>` lines of its body (a `> [!` line ends them), as the reader's `bodyEnd`. */
export function bodyEndOf(lines: readonly string[]): number {
	let k = 1;
	while (k < lines.length && (lines[k] ?? "").startsWith(">") && !LP.CALLOUT_ANY.test(lines[k] ?? "")) k++;
	return k;
}

/** The kind written on a block's first line (`listen`, `widget`), or null when it is not a Booklet line of the question kinds that have a media line. */
export function mediaKindOf(lines: readonly string[]): "listen" | "widget" | null {
	const p = parseLine(lines[0] ?? "");
	if (!p || p.quotes || p.flags.has("end")) return null;
	return p.kind === "listen" || p.kind === "widget" ? p.kind : null;
}

/** What one `>` line is, as a media line of this kind, or null. */
function parseOne(line: string, kind: "listen" | "widget"): { form: MediaForm; alt: string | null; target: string } | null {
	if (kind === "widget") {
		const b = BLOCK.exec(line);
		return b ? { form: "block", alt: null, target: b[2] ?? "" } : null;
	}
	const i = INLINE.exec(line);
	if (i) return { form: i[2] ? "embed" : "link", alt: i[3] ?? "", target: i[4] ?? "" };
	const f = FILE.exec(line);
	return f ? { form: "file", alt: null, target: f[2] ?? "" } : null;
}

/** The media line of a `listen` or a `widget` block's own lines, or null when it has none in a form the control can show (see the top of this file). */
export function mediaIn(lines: readonly string[]): MediaLine | null {
	const kind = mediaKindOf(lines);
	if (!kind) return null;
	const end = bodyEndOf(lines);
	const body = lines.slice(1, end).map((l) => l.replace(QUOTED, ""));
	let at = -1;
	let shown: { form: MediaForm; alt: string | null; target: string } | null = null;
	for (let i = 1; i < end && !shown; i++) {
		const one = parseOne(lines[i] ?? "", kind);
		if (one) {
			at = i;
			shown = one;
		}
	}
	if (!shown) return null;
	// the line has to be the one the reader takes: the first embed or link of a listen, the first block embed of a widget
	if (kind === "listen") {
		const media = listenBody(body).media;
		if (media === null || media !== (lines[at] ?? "").replace(QUOTED, "").trim()) return null;
	} else {
		const first = body.findIndex((l) => BLOCK_ANYWHERE.test(l));
		if (first !== at - 1) return null;
	}
	return { index: at, form: shown.form, alt: shown.alt, target: shown.target };
}

/** Do the words under a listen's or a widget's line hold what the reader takes as its media (an embed, else a link) or its data block's embed, in any form at all? */
export function holdsMedia(lines: readonly string[]): boolean {
	const kind = mediaKindOf(lines);
	if (!kind) return false;
	const body = lines.slice(1, bodyEndOf(lines)).map((l) => l.replace(QUOTED, ""));
	return kind === "listen" ? listenBody(body).media !== null : body.some((l) => BLOCK_ANYWHERE.test(l));
}

/** What a person changes of a media line. A `null` leaves that piece as it is. */
export interface MediaChange {
	alt?: string | null;
	target?: string | null;
}

const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** Why an address cannot be written in the line, or null: no break, space, bracket or parenthesis (the line would be another thing). */
function targetProblem(form: MediaForm, target: string): string | null {
	if (!target.trim()) return form === "block" ? "A widget needs a data block to draw." : "The media needs an address.";
	if (form === "block") return /^[A-Za-z0-9-]+$/.test(target) ? null : "A block id has letters, digits and dashes only.";
	if (form === "file" && !(/^[^\][\n#|]/.test(target) && !/[\][\n]/.test(target))) return "A file name has no line break or bracket and does not start with #.";
	if (form !== "file" && !/^[^()\s"<>]+$/.test(target)) return "An address has no space, parenthesis, quotation mark or angle bracket, so it cannot be written in the line.";
	// the extension decides what an embed is (SPEC section 6): an embed of an address that is no audio or video is not media, and the linter reports it
	if (form !== "link" && !isPlayable(target.split("|")[0] ?? target)) return "An embed's address ends in an audio or video extension (.mp3, .m4a, .mp4 and the like). A video service's page is a link, written without the !.";
	return null;
}

const isPlayable = (address: string): boolean => {
	const c = mediaClass(address);
	return c === "audio" || c === "video";
};

/**
 * The block's lines with the media line's alt text or address changed: the pieces asked for are rewritten and every other byte of the
 * line, and every other line, stays. Refused, with a reason and nothing changed, when the block has no media line the controls can
 * show, when the new text cannot be written in the line, or when the line would then be read as something else.
 */
export function writeMedia(lines: readonly string[], change: MediaChange): { ok: true; lines: string[] } | { ok: false; reason: string } {
	const kind = mediaKindOf(lines);
	const m = mediaIn(lines);
	if (!kind || !m) return refuse("This block has no media line the controls can show.");
	const line = lines[m.index] ?? "";
	let out: string;
	if (m.form === "block") {
		const b = BLOCK.exec(line);
		if (!b) return refuse("This line is not one the controls can write.");
		if (change.target == null) return { ok: true, lines: [...lines] };
		const bad = targetProblem("block", change.target);
		if (bad) return refuse(bad);
		out = `${b[1]}![[#^${change.target}]]${b[3]}`;
	} else if (m.form === "file") {
		const f = FILE.exec(line);
		if (!f) return refuse("This line is not one the controls can write.");
		// a file embed has an address and no words of its own: a change of words is no change
		if (change.target == null) return { ok: true, lines: [...lines] };
		const bad = targetProblem("file", change.target);
		if (bad) return refuse(bad);
		out = `${f[1]}![[${change.target}]]${f[3]}`;
	} else {
		const i = INLINE.exec(line);
		if (!i) return refuse("This line is not one the controls can write.");
		const target = change.target ?? i[4] ?? "";
		const alt = change.alt ?? i[3] ?? "";
		const bad = targetProblem(m.form, target);
		if (bad) return refuse(bad);
		if (/[\][\n\r]/.test(alt)) return refuse("The words of the media have no line break or bracket.");
		out = `${i[1]}${i[2]}[${alt}](${target}${i[5]})${i[6]}`;
	}
	if (out === line) return { ok: true, lines: [...lines] };
	const next = lines.map((l, k) => (k === m.index ? out : l));
	// the line read again is the media line the change asked for
	const again = mediaIn(next);
	const wantTarget = change.target ?? m.target;
	if (!again || again.index !== m.index || again.form !== m.form || again.target !== wantTarget) return refuse("The reader would take that line for something else, so it is not written.");
	return { ok: true, lines: next };
}

/**
 * The block's lines with a media line added under the question's own line, for a `listen` (an embed when the address is an audio or video
 * file, else a link, as a video service's page is, with the question's words as its name) or a `widget` (the block embed of the data
 * block with this id). Refused when the block already holds an embed, a link or a block embed in any form (the reader would take the
 * first, and a second line would not be the media), or when the address cannot be written.
 */
export function addMedia(lines: readonly string[], target: string, name: string): { ok: true; lines: string[] } | { ok: false; reason: string } {
	const kind = mediaKindOf(lines);
	if (!kind) return refuse("Only a listen or a widget has a media line.");
	if (holdsMedia(lines)) return refuse("The block already has one, in a form the controls cannot change: edit it in the Markdown.");
	const t = target.trim();
	let line: string;
	if (kind === "widget") {
		const bad = targetProblem("block", t);
		if (bad) return refuse(bad);
		line = `> ![[#^${t}]]`;
	} else {
		const words = name.replace(/[\][\n\r]+/g, " ").trim();
		const form: MediaForm = isPlayable(t) ? "embed" : "link";
		const bad = targetProblem(form, t);
		if (bad) return refuse(bad);
		line = form === "embed" ? `> ![${words}](${t})` : `> [${words || t}](${t})`;
	}
	const next = [lines[0] ?? "", line, ...lines.slice(1)];
	const again = mediaIn(next);
	if (!again || again.index !== 1) return refuse("The reader would take that line for something else, so it is not written.");
	return { ok: true, lines: next };
}
