/*
 * The gate (plan-v2, "The gate is allowed"): Markdown with every remote audio or video form swapped, before Obsidian draws it, for a
 * token that stands for a slot the view draws (media-view.ts). Nothing here requests an address, and what it hands back holds no
 * remote audio or video address that Obsidian would fetch at render, however the address is written: a remote embed is a token or
 * words. A few forms are Obsidian's by design and stay as written, because they request nothing or are pictures: a remote image
 * (an image address with a picture's ending, unless it is a host Obsidian turns into a frame), `![[https://...]]`, a plain link, and
 * a `file:` picture. Pure: Obsidian, the DOM and the network are not imported or touched.
 *
 * What it rewrites, outside code, maths and comments: the three embed forms (`![alt](address "title")`, `![alt][id]` with `![id][]`
 * and `![id]`), a link, an autolink or a bare address standing alone on its line when it leads to a service the plugin plays, and the
 * raw tags `iframe frame object embed audio video source track` that carry a remote address (and `img`, `image`, when what they
 * load is audio, video or a page Obsidian would turn into a frame). A local audio or video file written as `![alt][id]`, `![id][]`
 * or `![id]` becomes `![alt](path)`, since Obsidian draws a reference embed of it as a broken picture and the inline form as a
 * player (spike S1).
 *
 * An address is read the way a browser reads it, not the way it is written: character references (`&#104;ttps://`, `&colon;`) are
 * undone, tabs and line breaks inside it dropped, and `https:/host` and `https:host` are as remote as `https://host` (spike B2,
 * Obsidian 1.14.5: each of these loads at render). A `file:` address with a host is a share on another machine and is as remote.
 * An `http:` or `https:` address that leads to the reader's own machine and nowhere else (`isLoopback` in media.ts: `localhost`, `*.localhost`,
 * 127.0.0.0/8 and `[::1]`, written in those forms) is local, as a vault file is: left to Obsidian, in a media embed and a media tag, but not a frame's.
 * A destination is read raw (a code span, maths or a comment inside it is part of the address), the way CommonMark reads it; a raw tag
 * is read the way an HTML tokenizer reads it (a `/` or no space between attributes, quoted or bare values, references undone).
 *
 * Where the gate cannot tell whether a span is inert (code, maths, a comment), it is not: a slot that was not needed costs a press, an
 * embed that was missed costs a request. The work is linear in the text: brackets and destinations are paired in one pass each, and a
 * search that failed once is not repeated.
 */
import { entryFor, isAllowed, type Allows } from "./allow";
import { hostOf, isLoopback, mediaClass, parseUrl } from "./media";
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
 * `service`: a page of a service the plugin plays, the same (`embedUrl`: its own framed player; `native`: the address Obsidian is handed to draw the player itself, YouTube's; a service has one or the other). `refused`: media at an address that can never be allowed (not https).
 * `link`: a frame, a raw media tag, or an address that is not media, drawn as a link naming its host and never loaded.
 */
export type MediaSlot =
	| { type: "media"; media: "audio" | "video"; addr: string; alt: string; host: string; entry: string; allowed: boolean }
	| ({ type: "service"; media: "audio" | "video"; name: string; addr: string; shown: string[]; allow: string; alt: string; host: string; entry: string; allowed: boolean } & ({ native: string; embedUrl: null } | { native: null; embedUrl: string }))
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
const TAGS = new Set(["iframe", "frame", "object", "embed", "audio", "video", "source", "track", "img", "image"]);
const PAIRED = new Set(["iframe", "object", "audio", "video"]);
const CHILDREN = new Set(["source", "track", "embed"]);
/** The raw tags that play a file or draw a picture, whose address on the reader's own machine is left to Obsidian. */
const MEDIA_TAGS = new Set(["audio", "video", "source", "track", "img", "image"]);
/** The start of a line that is a quote, a list item, or nothing: a link alone on its line stands alone in its block. */
const BLOCK_START = "(?:[ \\t]*(?:>|[-*+][ \\t]|\\d{1,9}[.)][ \\t]))*[ \\t]*";
const ALONE_BEFORE = new RegExp(`^${BLOCK_START}$`);
const AUTOLINKS = [new RegExp(`^(${BLOCK_START})<(https://[^\\s<>]+)>[ \\t\\r]*$`, "gm"), new RegExp(`^(${BLOCK_START})(https://[^\\s<>]+)[ \\t\\r]*$`, "gm")];
/** A definition's label (up to 999 characters, brackets escaped), after the marks of the quotes and lists it sits in. */
const DEFINITION = new RegExp(`^${BLOCK_START}\\[((?:\\\\.|[^\\\\\\[\\]]){1,999})\\]:`, "gm");
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const FENCE_END = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;
const COMMENT_START = /^ {0,3}(<!--|%%)/;
const LIST_ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]/;
/** The longest destination read for its address; a longer one is cut there (its host is long since read) and the rest is still taken with it. */
const DEST_MAX = 4096;
/** Could this start of a destination be remote once character references and escapes are undone? Anything else is a path in the vault. */
const MAYBE_REMOTE = /[&\\\t\n\r]|^[\0-\x20]*(?:https?:|\/\/|file:)/i;

const blank = (s: string): string => s.replace(/[^\n]/g, " ");
/** A reference label as CommonMark compares it: spaces collapsed, Unicode case folded (`ẞ` and `SS` are one label). */
const norm = (label: string): string => label.trim().replace(/\s+/g, " ").toLowerCase().toUpperCase().toLowerCase();
/** Is this character code ASCII punctuation (the characters a backslash escapes)? */
const isPunct = (c: number): boolean => (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126);
const isHtmlSpace = (c: number): boolean => c === 32 || c === 9 || c === 10 || c === 12 || c === 13;

/** `indexOf` that remembers its last answer: asked again from further on, it costs nothing while that answer still stands, so a hostile text of many openers and no closer stays linear. */
class Next {
	private from = 0;
	private at = -2;
	constructor(private readonly search: (from: number) => number) {}
	find(from: number): number {
		if (this.at !== -2 && from >= this.from && (this.at < 0 || from <= this.at)) return this.at;
		this.from = from;
		return (this.at = this.search(from));
	}
}

/** The index of the first of the sorted numbers `arr` that is at least `pos` (`arr.length` when none is). */
function lowerBound(arr: readonly number[], pos: number): number {
	let lo = 0;
	let hi = arr.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if ((arr[mid] as number) < pos) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** The first of the sorted numbers `arr` that is at least `pos`, else -1. */
function firstFrom(arr: readonly number[] | undefined, pos: number): number {
	if (!arr) return -1;
	const at = lowerBound(arr, pos);
	return at < arr.length ? (arr[at] as number) : -1;
}

/** The lines of a text: where each starts, and where the paragraph a line is in ends (at the first line of nothing but spaces and quote marks). */
class Lines {
	readonly starts: number[] = [0];
	private readonly stops: number[];
	constructor(readonly text: string) {
		for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) this.starts.push(i + 1);
		this.stops = new Array<number>(this.starts.length);
		let stop = text.length;
		for (let k = this.starts.length - 1; k >= 0; k--) {
			if (this.empty(k)) stop = this.starts[k] as number;
			this.stops[k] = stop;
		}
	}
	/** Where line `k` ends (at its line break, or the end of the text). */
	end(k: number): number {
		return k + 1 < this.starts.length ? (this.starts[k + 1] as number) - 1 : this.text.length;
	}
	private empty(k: number): boolean {
		for (let i = this.starts[k] as number, e = this.end(k); i < e; i++) {
			const c = this.text.charCodeAt(i);
			if (c !== 32 && c !== 9 && c !== 13 && c !== 62) return false;
		}
		return true;
	}
	/** The line the offset is in. */
	at(off: number): number {
		let lo = 0;
		let hi = this.starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if ((this.starts[mid] as number) <= off) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	}
	/** Where the paragraph that holds the offset ends: the start of the blank line after it, else the end of the text. */
	limit(off: number): number {
		return this.stops[this.at(off)] as number;
	}
}

/** The columns of a line's indent (a tab goes to the next multiple of four). */
function columns(line: string): number {
	let c = 0;
	for (let i = 0; i < line.length; i++) {
		const ch = line.charCodeAt(i);
		if (ch === 32) c++;
		else if (ch === 9) c += 4 - (c % 4);
		else break;
	}
	return c;
}

/**
 * The text with code, inline maths and comments blanked to spaces (newlines kept), so every offset in it is an offset in the text.
 * Read once from the start, so that what comes first wins, as in CommonMark: a code span or a comment that starts inside another
 * is part of it. A backslash makes the next character plain, so an escaped delimiter opens nothing. Only what is surely inert is
 * blanked: a fence indented four columns or more is not a fence, and an indented one is code only if it closes with every line in it
 * indented as far (a list item may have ended inside it); a code span or maths stays on its line; a comment that starts
 * inside a paragraph ends in it (a blank line stops it), and one that starts a line ends wherever its closing mark is (CommonMark's
 * HTML block, and the reader's own reading of `%%`); one that never closes is no comment; and a block of maths between `$$` lines
 * is not skipped (one that never closes would hide the rest of the text from the gate, and Obsidian draws what follows it).
 * A span of maths or a comment is set aside only if its square brackets are balanced: otherwise a reader that reads links before
 * it would find, in the text round the span, an embed whose address is in it. Code, fences and HTML comments are inert to any
 * reader; maths and `%%` comments are Obsidian's, and the raw tags in them are still read (`strong`).
 */
function maskInert(text: string, lines: Lines): { all: string; strong: string } {
	// the spans to blank: `weak` ones (maths, `%%` comments) are not blanked in the copy the raw tags are read from
	const cuts: [number, number, boolean][] = [];
	let brackets: { balance: Int32Array; drop: Int32Array } | null = null;
	const balanced = (a: number, b: number): boolean => bracketsBalanced((brackets ??= drops(text, 91, 93)), a, b);
	const dashes = new Next((f) => text.indexOf("-->", f));
	const percents = new Next((f) => text.indexOf("%%", f));
	// where a backslash, a backtick, `$`, `<` or `%` is: the only places a span can start, found once
	const marks: number[] = [];
	for (const m of text.matchAll(/[\\`$<%]/g)) marks.push(m.index);
	const count = lines.starts.length;

	/** Looks for inert spans in the text from `from` to `eol`; the offset it got to (past `eol` when a comment goes on to another line). */
	const scan = (from: number, eol: number): number => {
		let runs: Map<number, number[]> | null = null;
		let i = from;
		for (;;) {
			const next = firstFrom(marks, i);
			if (next < 0 || next >= eol) return eol;
			i = next;
			const c = text.charCodeAt(i);
			if (c === 92) {
				i += 2;
			} else if (c === 96) {
				let j = i;
				while (j < eol && text.charCodeAt(j) === 96) j++;
				if (!runs) {
					runs = new Map();
					for (const r of text.slice(from, eol).matchAll(/`+/g)) {
						const at = runs.get(r[0].length);
						if (at) at.push(from + r.index);
						else runs.set(r[0].length, [from + r.index]);
					}
				}
				const close = firstFrom(runs.get(j - i), j);
				if (close >= 0) {
					cuts.push([i, close + (j - i), false]);
					i = close + (j - i);
				} else i = j;
			} else if (c === 36) {
				const dbl = text.charCodeAt(i + 1) === 36;
				const w = dbl ? 2 : 1;
				const inner = /\S/.test(text[i + w] ?? " ");
				let found = -1;
				if (dbl || inner) {
					for (let q = i + w; q < eol; q++) {
						const d = text.charCodeAt(q);
						if (d === 92) q++;
						else if (d === 36 && (!dbl || text.charCodeAt(q + 1) === 36)) {
							found = q;
							break;
						}
					}
				}
				// `$...$` has no space inside its ends and no digit after it; `$$...$$` is any
				if (found >= 0 && (dbl || (found > i + 1 && /\S/.test(text[found - 1] ?? " ") && !/\d/.test(text[found + 1] ?? ""))) && balanced(i, found + w)) {
					cuts.push([i, found + w, true]);
					i = found + w;
				} else i++;
			} else if (c === 60 || c === 37) {
				const html = c === 60;
				if (html ? text.startsWith("<!--", i) : text.charCodeAt(i + 1) === 37) {
					const e = (html ? dashes : percents).find(i + 2);
					const end = e + (html ? 3 : 2);
					if (e >= 0 && e < lines.limit(i) && balanced(i, end)) {
						cuts.push([i, end, !html]);
						if (end > eol) return end;
						i = end;
						continue;
					}
					i += html ? 4 : 2;
				} else i++;
			}
		}
	};
	/** Looks at the rest of the line `from` is in, and past it when a comment runs on; the line after the last one looked at. */
	const rest = (from: number): number => {
		for (;;) {
			const k = lines.at(from);
			const eol = lines.end(k);
			const got = scan(from, eol);
			if (got <= eol) return k + 1;
			from = got;
		}
	};

	const lineText = (k: number): string => text.slice(lines.starts[k], lines.end(k)).replace(/\r$/, "");
	// the lines that could close a fence (nothing but a run of backticks or tildes), found once
	let closers: { at: number[]; ch: string[]; len: number[] } | null = null;
	/** The first line after `k` that closes a fence of `len` marks `ch`, else -1. */
	const closerOf = (k: number, ch: string, len: number): number => {
		if (!closers) {
			closers = { at: [], ch: [], len: [] };
			for (let n = 0; n < count; n++) {
				const m = FENCE_END.exec(lineText(n));
				if (m) {
					closers.at.push(n);
					closers.ch.push((m[1] as string)[0] as string);
					closers.len.push((m[1] as string).length);
				}
			}
		}
		for (let n = lowerBound(closers.at, k + 1); n < closers.at.length; n++) if (closers.ch[n] === ch && (closers.len[n] as number) >= len) return closers.at[n] as number;
		return -1;
	};

	let inList = false;
	let codeOk = true;
	for (let k = 0; k < count; ) {
		const ls = lines.starts[k] as number;
		const le = lines.end(k);
		const line = lineText(k);
		if (!/\S/.test(line)) {
			codeOk = true;
			k++;
			continue;
		}
		const f = FENCE.exec(line);
		if (f && !((f[2] as string)[0] === "`" && (f[3] ?? "").includes("`"))) {
			// it ends at the first line that closes it (a run as long, any indent), or at the end of the text. An indented one may be in a
			// list item that ends before that line, and what is between could be live: it is code only if every line in it is indented as far
			const indent = (f[1] as string).length;
			const j = closerOf(k, (f[2] as string)[0] as string, (f[2] as string).length);
			let last = j >= 0 ? j : count - 1;
			if (indent > 0) {
				if (j < 0) last = -1;
				for (let m = k + 1; last >= 0 && m < j; m++) {
					const t = lineText(m);
					if (/\S/.test(t) && columns(t) < indent) last = -1;
				}
			}
			if (last >= 0) {
				cuts.push([ls, lines.end(last), false]);
				codeOk = true;
				k = last + 1;
				continue;
			}
		}
		const bc = COMMENT_START.exec(line);
		if (bc) {
			const html = bc[1] === "<!--";
			const open = ls + bc[0].length - (bc[1] as string).length;
			const e = (html ? dashes : percents).find(open + 2);
			const end = e + (html ? 3 : 2);
			if (e >= 0 && balanced(open, end)) {
				cuts.push([open, end, !html]);
				codeOk = false;
				k = rest(end);
				continue;
			}
		}
		if (codeOk && !inList && /^(?: {4,}|\t)\S/.test(line)) {
			cuts.push([ls, le, false]);
			k++;
			continue;
		}
		// a list item goes on through the lines indented under it (its second paragraph, a nested item); an unindented line ends it
		inList = LIST_ITEM.test(line) || (inList && /^(?: {2,}|\t)/.test(line));
		codeOk = false;
		k = rest(ls);
	}

	const apply = (weak: boolean): string => {
		let out = "";
		let at = 0;
		for (const [a, b, w] of cuts) {
			if (w && !weak) continue;
			out += text.slice(at, a) + blank(text.slice(a, b));
			at = b;
		}
		return out + text.slice(at);
	};
	const all = apply(true);
	return { all, strong: cuts.some((c) => c[2]) ? apply(false) : all };
}

/** For each `[` of the text, the `]` that closes it (brackets nest, a backslash escapes, a blank line ends every open one), else -1; found in one pass. */
function bracketPairs(s: string): Int32Array {
	const out = new Int32Array(s.length).fill(-1);
	const open: number[] = [];
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c === 92) {
			if (s.charCodeAt(i + 1) !== 10) i++;
		} else if (c === 91) open.push(i);
		else if (c === 93) {
			const o = open.pop();
			if (o !== undefined) out[o] = i;
		} else if (c === 10) {
			let j = i + 1;
			while (j < s.length && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9 || s.charCodeAt(j) === 13)) j++;
			if (s.charCodeAt(j) === 10) open.length = 0;
		}
	}
	return out;
}

/**
 * The balance of `open` and `close` characters before every offset of the text (a backslash escapes ASCII punctuation), and for each
 * offset `d` the first offset after `d` where the balance is lower than at `d` (else -1): found in one pass. Between `d` and any
 * later offset the characters are balanced exactly when the balance there is the same and `drop[d]` is not before it.
 */
function drops(t: string, open: number, close: number): { balance: Int32Array; drop: Int32Array } {
	const n = t.length;
	const balance = new Int32Array(n + 2);
	for (let x = 0; x < n; ) {
		const c = t.charCodeAt(x);
		if (c === 92 && x + 1 < n && isPunct(t.charCodeAt(x + 1))) {
			balance[x + 1] = balance[x] as number;
			balance[x + 2] = balance[x] as number;
			x += 2;
		} else {
			balance[x + 1] = (balance[x] as number) + (c === open ? 1 : c === close ? -1 : 0);
			x++;
		}
	}
	const drop = new Int32Array(n + 1).fill(-1);
	const stack: number[] = [];
	for (let d = n; d >= 0; d--) {
		while (stack.length && (balance[stack[stack.length - 1] as number] as number) >= (balance[d] as number)) stack.pop();
		drop[d] = stack.length ? (stack[stack.length - 1] as number) : -1;
		stack.push(d);
	}
	return { balance, drop };
}

/** Are the square brackets from `a` up to `b` balanced (every `[` closed and every `]` opened inside)? A span that is not cannot be set aside without changing which brackets belong together, and a reader that reads links first would find the embed it hid. */
function bracketsBalanced(d: { balance: Int32Array; drop: Int32Array }, a: number, b: number): boolean {
	const drop = d.drop[a] as number;
	return d.balance[a] === d.balance[b] && (drop < 0 || drop > b);
}

/** The text being gated, and the readings of it every part shares: its masked copy, its brackets, its destinations. */
class Source {
	readonly lines: Lines;
	/** The text with code, maths and comments blanked (same offsets): where an embed may start. */
	readonly mask: string;
	/** The same without maths and `%%` comments blanked: where a raw tag may start (a reader that reads HTML first would find one there). */
	readonly tagMask: string;
	private pairs: Int32Array | null = null;
	private parens: { balance: Int32Array; drop: Int32Array } | null = null;
	private readonly gt: Next;
	private readonly newline: Next;
	private readonly space: Next;
	private readonly quotes = new Map<string, Next>();

	constructor(readonly text: string) {
		this.lines = new Lines(text);
		const masks = maskInert(text, this.lines);
		this.mask = masks.all;
		this.tagMask = masks.strong;
		this.gt = new Next((f) => text.indexOf(">", f));
		this.newline = new Next((f) => text.indexOf("\n", f));
		const ws = /[\0-\x20\x7f]/g;
		this.space = new Next((f) => {
			ws.lastIndex = f;
			const m = ws.exec(text);
			return m ? m.index : -1;
		});
	}

	/** The `]` that closes the `[` at `open` (the masked text decides what is a bracket), else -1. */
	closeBracket(open: number): number {
		if (!this.pairs) this.pairs = bracketPairs(this.mask);
		return this.pairs[open] ?? -1;
	}

	/** The next unescaped `close` from `from` (the end of a title), else -1. */
	private quote(close: string, from: number): number {
		let next = this.quotes.get(close);
		if (!next) {
			next = new Next((f) => {
				for (let k = this.text.indexOf(close, f); k >= 0; k = this.text.indexOf(close, k + 1)) {
					let b = 0;
					while (k - 1 - b >= f && this.text[k - 1 - b] === "\\") b++;
					if (b % 2 === 0) return k;
				}
				return -1;
			});
			this.quotes.set(close, next);
		}
		return next.find(from);
	}

	/** The target of an inline link or image whose `(` is at `open`, read from the raw text as CommonMark reads it: its address (cut at `DEST_MAX`) and the offset after its `)`, else null. */
	inline(open: number): { dest: string; end: number } | null {
		const t = this.text;
		let i = open + 1;
		const spaces = (): boolean => {
			let lines = 0;
			while (i < t.length) {
				const c = t.charCodeAt(i);
				if (c === 10) {
					if (++lines > 1) return false;
				} else if (c !== 32 && c !== 9 && c !== 13) break;
				i++;
			}
			return true;
		};
		if (!spaces()) return null;
		let dest: string;
		if (t[i] === "<") {
			const j = this.gt.find(i + 1);
			const nl = this.newline.find(i + 1);
			if (j < 0 || (nl >= 0 && nl < j)) return null;
			dest = t.slice(i + 1, Math.min(j, i + 1 + DEST_MAX));
			i = j + 1;
		} else {
			// up to a space or control character (ASCII only: U+00A0 and the like are part of the address) or the `)` that closes the link
			const w = this.space.find(i);
			const stop = w < 0 ? t.length : w;
			if (!this.parens) this.parens = drops(t, 40, 41);
			// the first `)` that nothing opened after the address began: the one that closes the link
			const c = (this.parens.drop[i] ?? -1) - 1;
			const e = c >= 0 && c < stop ? c : stop;
			dest = t.slice(i, Math.min(e, i + DEST_MAX));
			i = e;
		}
		if (!spaces()) return null;
		const q = t[i];
		if (q === '"' || q === "'" || q === "(") {
			const j = this.quote(q === "(" ? ")" : q, i + 1);
			// a title does not run across a blank line
			if (j < 0 || j >= this.lines.limit(i)) return null;
			i = j + 1;
			if (!spaces()) return null;
		}
		return t[i] === ")" ? { dest, end: i + 1 } : null;
	}
}

/**
 * The definitions Obsidian is handed, by label: the first of a label wins. Read here and not by the reader's `referenceSource`,
 * which reads a definition only when its address is on the line of its label: CommonMark takes one on the next line too.
 */
function definitionsOf(src: Source): Map<string, string> {
	const out = new Map<string, string>();
	const t = src.text;
	if (!t.includes("]:")) return out;
	const gt = new Next((f) => t.indexOf(">", f));
	const newline = new Next((f) => t.indexOf("\n", f));
	for (const m of src.mask.matchAll(DEFINITION)) {
		const end = m.index + m[0].length;
		const label = norm(t.slice(end - 2 - (m[1] ?? "").length, end - 2));
		if (out.has(label) || label.startsWith("^")) continue;
		// the address is after spaces and at most one line break
		let i = end;
		while (t[i] === " " || t[i] === "\t") i++;
		if (t[i] === "\r") i++;
		if (t[i] === "\n") {
			i++;
			while (t[i] === " " || t[i] === "\t") i++;
		}
		let dest: string;
		if (t[i] === "<") {
			const j = gt.find(i + 1);
			const nl = newline.find(i + 1);
			if (j < 0 || (nl >= 0 && nl < j)) continue;
			dest = t.slice(i + 1, Math.min(j, i + 1 + DEST_MAX));
		} else {
			let j = i;
			while (j < t.length && j - i < DEST_MAX && t.charCodeAt(j) > 32 && t.charCodeAt(j) !== 127) j++;
			dest = t.slice(i, j);
		}
		if (dest) out.set(label, dest);
	}
	return out;
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

/** Is this `file:` address a share on another machine (a host, or the `//host/share` a browser on Windows reads from an empty host)? */
function remoteFile(dest: string): boolean {
	const u = parseUrl(dest);
	return !!u && u.protocol === "file:" && ((u.hostname !== "" && u.hostname !== "localhost") || u.pathname.startsWith("//"));
}

/** Where an address leads: `https`, `http`, `file` (a share on another machine), `proto` (starts `//`), or `local` (a path in the vault, or a scheme that is Obsidian's). A scheme with one slash or none (`https:host`) leads where `https://host` does: a browser reads it so. */
function whereIs(dest: string): "https" | "http" | "file" | "proto" | "local" {
	if (/^https:/i.test(dest)) return "https";
	if (/^http:/i.test(dest)) return "http";
	if (dest.startsWith("//")) return "proto";
	if (/^file:/i.test(dest) && remoteFile(dest)) return "file";
	return "local";
}

function absolute(dest: string, where: "https" | "http" | "file" | "proto"): string | null {
	if (where === "file") return parseUrl(dest)?.href ?? null;
	try {
		return new URL(where === "proto" ? `https:${dest}` : dest).href;
	} catch {
		return null;
	}
}

/** The host of an address `absolute` gave: for a share the machine it is on. */
function hostFor(addr: string): string | null {
	if (!/^file:/i.test(addr)) return hostOf(addr);
	const u = parseUrl(addr);
	if (!u) return null;
	return u.hostname !== "" ? u.host : (/^\/\/+([^/]+)/.exec(u.pathname)?.[1] ?? null);
}

/** The slot of a service's page: its player, and what the press will ask. */
function serviceSlot(svc: Service, addr: string, alt: string, host: string, allowed: boolean): MediaSlot {
	const player = svc.native !== null ? { native: svc.native, embedUrl: null } : { native: null, embedUrl: svc.embedUrl };
	return { type: "service", media: svc.kind, name: svc.name, addr, shown: svc.shown, allow: svc.allow, alt: alt || svc.name, host, entry: svc.hosts[0] ?? host, allowed, ...player };
}

/** Is a slot's media allowed now, by the list as it stands? (A slot's own `allowed` is what the list said when the slot was drawn.) */
export function slotAllowed(slot: Extract<MediaSlot, { type: "media" | "service" }>, allows: Allows, notePath: string): boolean {
	return slot.type === "media" ? isAllowed(slot.addr, allows, notePath) : serviceAllowed(slot, allows, notePath);
}

/* ---- raw tags, read the way an HTML tokenizer reads them ---- */

interface Attr {
	name: string;
	/** As written, character references not yet undone. */
	value: string;
}

interface Tag {
	name: string;
	from: number;
	/** After its `>`, or the end of the text when it never closes (a tag a browser drops is read all the same). */
	end: number;
	attrs: Attr[];
}

/**
 * The tag of `TAGS` that starts at `at` (a `<`), else null. Attributes are read as an HTML tokenizer reads them: a space or `/`
 * separates them (and none is needed after a quoted value), a name runs to a space, `/`, `=` or `>`, a value is quoted or runs to a
 * space or `>`, and the first of a name's values is not the only one (all are kept).
 */
function readTag(t: string, at: number): Tag | null {
	const n = t.length;
	let i = at + 1;
	// a name in TAGS is six letters at most: a longer run is not one, and is not read to its end
	while (i < n && i - at <= 8) {
		const c = t.charCodeAt(i);
		if (isHtmlSpace(c) || c === 47 || c === 62) break;
		i++;
	}
	const name = t.slice(at + 1, i).toLowerCase();
	if (!TAGS.has(name)) return null;
	const attrs: Attr[] = [];
	for (;;) {
		while (i < n && (isHtmlSpace(t.charCodeAt(i)) || t.charCodeAt(i) === 47)) i++;
		if (i >= n) break;
		if (t.charCodeAt(i) === 62) {
			i++;
			break;
		}
		const s = i++;
		while (i < n) {
			const c = t.charCodeAt(i);
			if (isHtmlSpace(c) || c === 47 || c === 62 || c === 61) break;
			i++;
		}
		const attr = t.slice(s, i).toLowerCase();
		let j = i;
		while (j < n && isHtmlSpace(t.charCodeAt(j))) j++;
		if (t.charCodeAt(j) !== 61) {
			attrs.push({ name: attr, value: "" });
			continue;
		}
		j++;
		while (j < n && isHtmlSpace(t.charCodeAt(j))) j++;
		const q = t[j];
		let value: string;
		if (q === '"' || q === "'") {
			const e = t.indexOf(q, j + 1);
			value = e < 0 ? t.slice(j + 1) : t.slice(j + 1, e);
			i = e < 0 ? n : e + 1;
		} else {
			let e = j;
			while (e < n && !isHtmlSpace(t.charCodeAt(e)) && t.charCodeAt(e) !== 62) e++;
			value = t.slice(j, e);
			i = e;
		}
		attrs.push({ name: attr, value });
	}
	return { name, from: at, end: i, attrs };
}

/** The tags of `TAGS` in `text` that start where `mask` has a `<` (so not in code or a comment), in order, each read once. */
function readTags(text: string, mask: string): Tag[] {
	const out: Tag[] = [];
	for (let at = mask.indexOf("<"); at >= 0; ) {
		const c = mask.charCodeAt(at + 1);
		const tag = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ? readTag(text, at) : null;
		if (tag) out.push(tag);
		at = mask.indexOf("<", tag ? tag.end : at + 1);
	}
	return out;
}

class Gate {
	readonly inline: boolean;
	constructor(
		readonly ctx: GateContext,
		readonly defs: Map<string, string>,
	) {
		this.inline = ctx.mode === "inline";
	}

	/**
	 * What stands in place of a media embed whose address is `dest` (words, or a slot); null leaves it to Obsidian. `picture`: the
	 * embed is a raw `img` or `image`, which is gated only when what it loads is audio, video or a page Obsidian would draw as a frame
	 * (any other picture stays Obsidian's, and so does a local one).
	 */
	embed(dest: string, altRaw: string, viaDefinition = false, picture = false): string | MediaSlot | null {
		// an address on the reader's own machine is read as a vault file is (see `isLoopback`)
		const where = isLoopback(dest) ? "local" : whereIs(dest);
		const cls = mediaClass(dest);
		if (where === "local") {
			if (picture || (cls !== "audio" && cls !== "video")) return null;
			const alt = altText(altRaw);
			if (this.inline) return escapeMd(alt || nameOf(dest));
			// Obsidian draws a reference embed of a local file as a broken `img`, and the inline form as a player: so it is handed the inline form
			return viaDefinition && !/[<>]/.test(dest) ? `![${alt}](${/[\s()]/.test(dest) ? `<${dest}>` : dest})` : null;
		}
		const addr = absolute(dest, where);
		// Obsidian draws a YouTube or Twitter address as a frame whatever the rest of it says (even a picture's ending): it is never left to Obsidian
		const tube = !!addr && isEmbedAddress(addr);
		if (picture ? !(tube || cls === "audio" || cls === "video") : cls === "image" && !tube) return null;
		const host = addr ? hostFor(addr) : null;
		if (!addr || !host) return null;
		const alt = altText(altRaw);
		if (this.inline) return escapeMd(alt || (cls ? nameOf(dest) : host));
		const { allows, notePath } = this.ctx;
		const media = !tube && (cls === "audio" || cls === "video") ? cls : null;
		if (where !== "https") return media ? { type: "refused", media, addr, alt, host } : { type: "link", addr, alt, host, why: "address" };
		if (media) return { type: "media", media, addr, alt, host, entry: entryFor(addr) ?? host, allowed: isAllowed(addr, allows, notePath) };
		const svc = serviceOf(addr);
		if (!svc) return { type: "link", addr, alt, host, why: "address" };
		return serviceSlot(svc, addr, alt, host, serviceAllowed(svc, allows, notePath));
	}

	/** A link, autolink or bare address that stands alone and leads to an allowed service: its player's slot; null leaves the link as it is. */
	link(dest: string, textRaw: string): MediaSlot | null {
		const where = whereIs(dest);
		const addr = where === "https" ? absolute(dest, where) : null;
		const svc = addr ? serviceOf(addr) : null;
		const host = addr ? hostOf(addr) : null;
		if (!addr || !svc || !host || !serviceAllowed(svc, this.ctx.allows, this.ctx.notePath)) return null;
		return serviceSlot(svc, addr, altText(textRaw), host, true);
	}

	/** A raw tag with a remote address: a link naming its host (nothing is loaded), or in a title the host alone. */
	frame(src: string, alt: string): string | MediaSlot | null {
		const where = whereIs(src);
		if (where === "local") return null;
		const addr = absolute(src, where);
		const host = addr ? hostFor(addr) : null;
		if (!addr || !host) return null;
		return this.inline ? escapeMd(host) : { type: "link", addr, alt, host, why: "frame" };
	}

	/** Is this a picture's address that Obsidian would not leave as a picture: audio, video, or a page it draws as a frame? */
	loadsMedia(src: string): boolean {
		const where = whereIs(src);
		if (where === "local" || isLoopback(src)) return false;
		const cls = mediaClass(src);
		if (cls === "audio" || cls === "video") return true;
		const addr = absolute(src, where);
		return !!addr && isEmbedAddress(addr);
	}

	/**
	 * The remote address a tag loads from itself, else null. `src` (and an `object`'s `data`) of any value that is remote, in any
	 * of the tag's attributes of that name (a browser reads the first, the gate every one); `srcset` candidates, and a picture's
	 * `src`, only when they are audio, video or a frame of Obsidian's (any other picture stays Obsidian's); a video's `poster`
	 * when it has no `src` (a poster is part of a remote media tag); and a `srcdoc`, which is markup of its own: the first remote
	 * address in it. `any`: a picture's address counts whatever it is (inside a `srcdoc`, nothing is left to Obsidian).
	 */
	address(tag: Tag, any = false, depth = 0): string | null {
		const picture = tag.name === "img" || tag.name === "image";
		const values = (name: string): string[] => tag.attrs.filter((a) => a.name === name).map((a) => a.value);
		// a media tag's own address on the reader's machine is read as a vault file is; a frame's (`iframe`, `frame`, `object`, `embed`)
		// and anything inside a `srcdoc` (`any`) is not: a page from a local server is a page, not a file to play
		const away = (v: string): boolean => whereIs(v) !== "local" && (any || !MEDIA_TAGS.has(tag.name) || !isLoopback(v));
		const fires = (v: string, pic: boolean): boolean => (pic && !any ? this.loadsMedia(v) : away(v));
		for (const raw of [...values("src"), ...(tag.name === "object" ? values("data") : [])]) {
			const v = addressOf(raw);
			if (fires(v, picture)) return v;
		}
		for (const raw of values("srcset")) {
			for (const part of undoReferences(raw).split(/[\s,]+/)) {
				const v = addressOf(part);
				if (v && fires(v, true)) return v;
			}
		}
		if (tag.name === "video" && !values("src").length) {
			for (const raw of values("poster")) {
				const v = addressOf(raw);
				if (away(v)) return v;
			}
		}
		for (const raw of values("srcdoc")) {
			const found = this.markup(undoReferences(raw), depth + 1);
			if (found) return found;
		}
		return null;
	}

	/** The first remote address in markup that was an attribute's value (a `srcdoc`, which may hold a `srcdoc` of its own, a level of references deeper). */
	private markup(inner: string, depth: number): string | null {
		if (depth > 8) {
			// no deeper is read: any address in what is left is taken
			const m = /(?:https?:)?\/\/[^\s"'<>]+/i.exec(inner);
			return m ? addressOf(m[0]) : null;
		}
		for (const tag of readTags(inner, inner)) {
			const found = this.address(tag, true, depth);
			if (found) return found;
		}
		return null;
	}
}

/**
 * The edits for raw tags that carry a remote address. A tag with an address of its own plays from it (and a browser ignores the
 * `source` tags inside); one without plays from the first of its `source`, `track` and `embed` tags that is remote (spike B2: with a
 * local first, the second loads).
 */
function rawTags(src: Source, g: Gate, edits: Edit[]): void {
	const tags = readTags(src.text, src.tagMask);
	if (!tags.length) return;
	// where each paired tag is closed, and the children that carry an address, by where they start: found once, so many tags stay linear
	const closers = new Map<string, { starts: number[]; ends: number[] }>();
	for (const m of src.tagMask.matchAll(/<\/(iframe|object|audio|video)[\t\n\f\r ]*>/gi)) {
		const name = (m[1] as string).toLowerCase();
		const at = closers.get(name) ?? { starts: [], ends: [] };
		at.starts.push(m.index);
		at.ends.push(m.index + m[0].length);
		closers.set(name, at);
	}
	const kids: { from: number; src: string }[] = [];
	for (const tag of tags) {
		if (!CHILDREN.has(tag.name)) continue;
		const a = g.address(tag);
		if (a !== null) kids.push({ from: tag.from, src: a });
	}
	const kidStarts = kids.map((k) => k.from);

	let skip = 0;
	for (const tag of tags) {
		if (tag.from < skip) continue;
		let to = tag.end;
		let close = -1;
		const shut = PAIRED.has(tag.name) ? closers.get(tag.name) : undefined;
		if (shut) {
			const at = lowerBound(shut.starts, tag.end);
			if (at < shut.starts.length) {
				close = shut.starts[at] as number;
				to = shut.ends[at] as number;
			}
		}
		let address = g.address(tag);
		const own = tag.attrs.some((a) => a.name === "src" || (tag.name === "object" && a.name === "data"));
		if (address === null && !own && close >= 0) {
			const k = lowerBound(kidStarts, tag.end);
			if (k < kids.length && (kids[k] as { from: number }).from < close) address = (kids[k] as { src: string }).src;
		}
		if (address === null) continue;
		const picture = tag.name === "img" || tag.name === "image";
		const alt = undoReferences(tag.attrs.find((a) => a.name === (picture ? "alt" : "title"))?.value ?? "").trim();
		const repl = picture ? g.embed(address, alt, false, true) : g.frame(address, alt);
		if (repl !== null) {
			edits.push({ from: tag.from, to, repl });
			skip = to;
		}
	}
}

/** Does the source from `from` to `to` stand alone on its line, after a quote or list marker at most? */
function alone(src: Source, from: number, to: number): boolean {
	const text = src.text;
	const ls = src.lines.starts[src.lines.at(from)] as number;
	// a marker is a few characters: a longer start is not one (and a long line of links stays linear)
	if (from - ls > 200 || !ALONE_BEFORE.test(text.slice(ls, from))) return false;
	for (let i = to; i < text.length && text.charCodeAt(i) !== 10; i++) {
		const c = text.charCodeAt(i);
		if (c !== 32 && c !== 9 && c !== 13) return false;
	}
	return true;
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
	const src = new Source(text);
	const mask = src.mask;
	const g = new Gate(ctx, definitionsOf(src));
	const edits: Edit[] = [];
	const slots: MediaSlot[] = [];

	// `![alt](address)`, `![alt][id]`, `![id][]`, `![id]`
	for (let i = mask.indexOf("!["); i >= 0; i = mask.indexOf("![", i + 2)) {
		if (mask[i + 2] === "[") continue;
		const close = src.closeBracket(i + 1);
		if (close < 0) continue;
		let dest: string | null = null;
		let end = close + 1;
		if (mask[close + 1] === "(") {
			const p = src.inline(close + 1);
			if (!p) continue;
			dest = p.dest;
			end = p.end;
		} else if (mask[close + 1] === "[") {
			const c2 = src.closeBracket(close + 1);
			// a label is at most 999 characters
			if (c2 < 0 || c2 - close > 1000) continue;
			const id = text.slice(close + 2, c2);
			dest = g.defs.get(norm(id.trim() ? id : text.slice(i + 2, close))) ?? null;
			end = c2 + 1;
		} else if (close - i <= 1001) dest = g.defs.get(norm(text.slice(i + 2, close))) ?? null;
		if (dest === null) continue;
		// a path in the vault is Obsidian's and is not read further (a reference to one is read, since Obsidian draws it wrongly; so is a local audio or video file in a title, which is not drawn there, unless its path is very long)
		if (mask[close + 1] === "(" && !MAYBE_REMOTE.test(dest.slice(0, 48)) && (!g.inline || dest.length > 256)) continue;
		const repl = g.embed(clean(dest), text.slice(i + 2, close), mask[close + 1] !== "(");
		if (repl !== null) {
			edits.push({ from: i, to: end, repl });
			// what is inside this embed is part of it
			i = end - 2;
		}
	}

	// `![[x.mp3]]` is Obsidian's own, except in a title or a label, where media is never drawn
	if (g.inline && mask.includes("![[")) {
		for (const m of mask.matchAll(/!\[\[([^[\]\n]+)\]\]/g)) {
			const target = ((m[1] ?? "").split("|", 1)[0] ?? "").split("#", 1)[0] ?? "";
			const cls = mediaClass(target.trim());
			if (cls === "audio" || cls === "video") edits.push({ from: m.index, to: m.index + m[0].length, repl: escapeMd(nameOf(target.trim())) });
		}
	}

	rawTags(src, g, edits);

	// a link to a service, alone on its line, becomes the service's player once the service is allowed
	if (!g.inline) {
		for (let i = mask.indexOf("["); i >= 0; i = mask.indexOf("[", i + 1)) {
			if (mask[i - 1] === "!" || mask[i + 1] === "[" || mask[i - 1] === "[" || mask[i - 1] === "\\") continue;
			const close = src.closeBracket(i);
			if (close < 0) continue;
			let dest: string | null = null;
			let end = close + 1;
			if (mask[close + 1] === "(") {
				const p = src.inline(close + 1);
				if (!p) continue;
				dest = p.dest;
				end = p.end;
			} else if (mask[close + 1] === "[") {
				const c2 = src.closeBracket(close + 1);
				if (c2 < 0 || c2 - close > 1000) continue;
				const id = text.slice(close + 2, c2);
				dest = g.defs.get(norm(id.trim() ? id : text.slice(i + 1, close))) ?? null;
				end = c2 + 1;
			}
			if (dest === null || !MAYBE_REMOTE.test(dest.slice(0, 48))) continue;
			const repl = g.link(clean(dest), text.slice(i + 1, close));
			if (repl !== null && alone(src, i, end)) {
				edits.push({ from: i, to: end, repl });
				i = end - 1;
			}
		}
		for (const re of AUTOLINKS) {
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
