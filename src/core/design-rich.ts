/*
 * Very modest rich text for the Design view's fields: Bold, Italic, Link and Bullets, as plain Markdown markers put into (or taken out
 * of) the field's own text. Plain TypeScript: strings in, strings out, nothing here imports Obsidian or the DOM.
 *
 * THERE IS NO SECOND REPRESENTATION. The field shows and saves the Markdown; this only says what the text and the selection become when a
 * button or a key is pressed. Nothing is stored but the Markdown, and no change is made to the text except the markers asked for:
 *
 *   bold      `**` around the selection          (SPEC section 10 lists `**strong**` and `__strong__`; `**` is the one used)
 *   italic    `*` around the selection           (`*em*` and `_em_`; `*` is the one used, so that bold and italic nest as `***x***`)
 *   link      `[words](https://)`, the address selected so that the person types it. A web address needs a character after `https://` to
 *             be a link at all, so the placeholder is drawn as the plain words until it is filled in: nothing is left that a reader sees
 *             as a broken link (booklet.html `mkLink`)
 *   bullets   `- ` at the start of every selected line (prose bodies only: not a title, not a question's help text)
 *
 * TOGGLES. The markers just outside the selection, or at its very ends, are the format already applied, and are taken off again. Bold
 * is on when two or more asterisks stand on each side, italic when an odd number does (1 or 3), so `***x***` is both and either comes off
 * alone. Four or more on each side is refused as too crowded to tell which are marks. With no selection the word at the caret is the
 * selection (the caret stays where it was inside it); with no word, the marker pair is inserted with the caret between, and pressing again
 * takes the empty pair away. Applying a format and then taking it off gives back the text and the selection exactly, except where the
 * selection had some lines already formatted and some not (the rest are formatted, and taking it off then clears all), and for a link whose
 * start was a caret (the words come back selected).
 *
 * A MARKER NEVER CROSSES A LINE. A selection over several lines is marked line by line, each line's own words: leading and trailing
 * spaces, a line's own `>`, `-`, `1.` or `#` mark and blank lines are left outside the markers (`**` round a line's leading space would
 * not be bold at all).
 *
 * A LINE KEEPS WHAT IT WAS. A change that would turn a line into something the format reads as another thing (a `***` rule, a heading, a
 * list, a quote, a line opening a callout with `[!`) is refused, with the reason, and nothing is changed. The text of a field is never given
 * a booklet line, a `>` mark or a rule by this. Selections are UTF-16 offsets as a text area gives them; an edge that falls inside a
 * character (a surrogate pair, a letter with its accents, an emoji sequence) is moved out to the whole character, so no marker splits one.
 *
 * What is on is judged by what stands next to the selection, not by reading the whole line: `**a**[b]**c**` has two bold words and a
 * plain one between them, and bold on `b` takes the neighbours' marks as its own. That is the cost of not parsing; the text keeps its
 * asterisks and nothing but asterisks changes.
 *
 * Underscore emphasis already in the text is left as it is (`_x_` is text to this, not a toggle). A link that has a real address is not
 * unlinked by the key (that would throw the address away): the address is selected instead.
 */

export type RichAction = "bold" | "italic" | "link" | "bullets";

/** The field the text is of: a one-line title, a question's help, or the prose of a callout or a prose block (the only one with bullets). */
export type RichWhere = "title" | "help" | "prose";

export type RichRefusal = "no-bullets" | "nothing" | "rule" | "block" | "crowded" | "link-lines" | "link-brackets" | "link-image" | "bullet-kind";

export interface RichDone {
	ok: true;
	text: string;
	/** The selection after, as UTF-16 offsets (start <= end). */
	start: number;
	end: number;
	/** False when the text is the same (a link's address was only selected). */
	changed: boolean;
	did: "wrap" | "unwrap" | "insert" | "select";
	/** Some of the selected lines had the format already and the rest were given it. */
	partial: boolean;
}

export interface RichRefused {
	ok: false;
	code: RichRefusal;
	/** In English, for a log or a test; the shell says it in the person's language by `code`. */
	reason: string;
}

export type RichResult = RichDone | RichRefused;

const REASONS: Readonly<Record<RichRefusal, string>> = {
	"no-bullets": "A bullet list is for the prose of a note or a callout, not for a title or a question's help.",
	nothing: "Nothing is selected to mark: select some words first.",
	rule: "That would leave a line of nothing but marks, which the format reads as a rule: select some words first.",
	block: "That would change what a line is (a heading, a list, a quote, a rule or a callout line), so it was not done.",
	crowded: "There are four or more asterisks round the selection, too many to tell which are marks: edit them in the text.",
	"link-lines": "A link is on one line: select words on a single line.",
	"link-brackets": "The selection already holds a square bracket, so a link made of it would be read as another one.",
	"link-image": "A link straight after an exclamation mark would be read as an image: put a space between them.",
	"bullet-kind": "A line that is already a heading, a numbered item, a rule or a quote cannot also be a bullet here.",
};

const refuse = (code: RichRefusal): RichRefused => ({ ok: false, code, reason: REASONS[code] });

/** What a field takes: bullets only in prose. */
export const richTakes = (where: RichWhere, action: RichAction): boolean => action !== "bullets" || where === "prose";

/** The placeholder a new link is given: a web address with nothing after it is no link to the renderer, so it shows the words only. */
export const LINK_PLACEHOLDER = "https://";

// ---------------------------------------------------------------------------------------------------- characters

type SegmenterLike = { segment(s: string): Iterable<{ index: number; segment: string }> };
const SegmenterCtor = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => SegmenterLike }).Segmenter;

const CONTINUES = /^(?:\p{M}|\u{200D}|\u{FE0F}|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}])/u;

/**
 * The offsets at which a character (a grapheme: a letter with its accents, an emoji with its joiners) starts or ends, 0 and the length
 * included. From the platform's own grapheme rules; `plain` forces the fallback (a code point with what clings to it), which is what a
 * platform with no `Intl.Segmenter` gets.
 */
export function graphemeBreaks(text: string, plain = false): Set<number> {
	const out = new Set<number>([0, text.length]);
	if (SegmenterCtor && !plain) {
		for (const s of new SegmenterCtor(undefined, { granularity: "grapheme" }).segment(text)) out.add(s.index);
		return out;
	}
	let i = 0;
	while (i < text.length) {
		out.add(i);
		let j = i + (text.codePointAt(i)! > 0xffff ? 2 : 1);
		if (/^[\u{1F1E6}-\u{1F1FF}]/u.test(text.slice(i, j)) && /^[\u{1F1E6}-\u{1F1FF}]/u.test(text.slice(j, j + 2))) j += 2;
		for (;;) {
			const rest = text.slice(j, j + 2);
			if (CONTINUES.test(rest)) {
				const joiner = rest.startsWith("\u{200D}");
				j += rest.codePointAt(0)! > 0xffff ? 2 : 1;
				if (joiner && j < text.length) j += text.codePointAt(j)! > 0xffff ? 2 : 1;
			} else break;
		}
		i = j;
	}
	return out;
}

const WORD = /[\p{L}\p{N}]/u;
const isSpace = (c: string): boolean => /\s/.test(c);

interface Line {
	from: number;
	to: number;
}

/** The lines of the text by their words: a break is `\r\n`, `\n` or `\r`, and is no part of a line. */
function linesOf(text: string): Line[] {
	const out: Line[] = [];
	let from = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === "\n" || c === "\r") {
			out.push({ from, to: i });
			if (c === "\r" && text[i + 1] === "\n") i++;
			from = i + 1;
		}
	}
	out.push({ from, to: text.length });
	return out;
}

const lineIndexAt = (lines: readonly Line[], pos: number): number => {
	for (let i = 0; i < lines.length; i++) if (pos <= (lines[i] as Line).to) return i;
	return lines.length - 1;
};

/** How much of a line's start is not its words: its own indent and `>`, `-`, `1.` or `#` mark (none of it in a title, which is not at a line's start). */
function prefixLen(line: string, where: RichWhere): number {
	if (where === "title") return 0;
	return /^[ \t]*(?:>[ \t]?)*(?:(?:[-+*]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)?/.exec(line)?.[0].length ?? 0;
}

type LineKind = "blank" | "rule" | "callout" | "heading" | "quote" | "bullet" | "ordered" | "text";

/** What the format reads a line as, as far as this has to tell. */
function kindOfLine(l: string): LineKind {
	if (!l.trim()) return "blank";
	if (/^ {0,3}([*_-])([ \t]*\1){2,}[ \t]*$/.test(l)) return "rule";
	if (/^[ \t]*\[!/.test(l)) return "callout";
	if (/^ {0,3}#{1,6}([ \t]|$)/.test(l)) return "heading";
	if (/^ {0,3}>/.test(l)) return "quote";
	if (/^ {0,3}[-+*]([ \t]|$)/.test(l)) return "bullet";
	if (/^ {0,3}\d{1,9}[.)]([ \t]|$)/.test(l)) return "ordered";
	return "text";
}

// ---------------------------------------------------------------------------------------------------- edits

interface Edit {
	pos: number;
	/** Characters taken out from `pos`. */
	del: number;
	ins: string;
	/** A position exactly at an insertion goes after what is inserted (an opening mark: the selection starts after it). */
	carry: boolean;
}

/** Where a position goes when the edits (in order of position, not overlapping) are made. */
function mapPos(p: number, edits: readonly Edit[]): number {
	let shift = 0;
	for (const e of edits) {
		if (e.del > 0) {
			if (p >= e.pos + e.del) shift -= e.del;
			else if (p >= e.pos) return e.pos + shift;
		} else if (p > e.pos || (p === e.pos && e.carry)) shift += e.ins.length;
	}
	return p + shift;
}

function applyEdits(text: string, edits: readonly Edit[]): string {
	let out = text;
	for (const e of [...edits].sort((x, y) => y.pos - x.pos)) out = out.slice(0, e.pos) + e.ins + out.slice(e.pos + e.del);
	return out;
}

const clampSel = (n: number, len: number): number => (Number.isFinite(n) ? Math.min(len, Math.max(0, Math.trunc(n))) : 0);

/** Every line that changed is still the kind of line it was (and none became a rule). */
function keepsLines(before: string, after: string, where: RichWhere): RichRefusal | null {
	if (where === "title") return null;
	const a = linesOf(before);
	const b = linesOf(after);
	if (a.length !== b.length) return "block";
	for (let i = 0; i < a.length; i++) {
		const x = before.slice((a[i] as Line).from, (a[i] as Line).to);
		const y = after.slice((b[i] as Line).from, (b[i] as Line).to);
		if (x === y) continue;
		const kx = kindOfLine(x);
		const ky = kindOfLine(y);
		// a rule is not words to mark (and none is made)
		if (ky === "rule" || kx === "rule") return "rule";
		// words put on a blank line are only words, and a line emptied of its marks is a blank line; any other change of kind is another line
		if (kx !== ky && !(kx === "blank" && ky === "text") && ky !== "blank") return "block";
		// what follows a line's own mark is not a rule either (`- ***`)
		const px = prefixLen(x, where);
		const py = prefixLen(y, where);
		if (kindOfLine(y.slice(py)) === "rule" && kindOfLine(x.slice(px)) !== "rule") return "rule";
	}
	return null;
}

// ---------------------------------------------------------------------------------------------------- words

interface Ctx {
	text: string;
	where: RichWhere;
	lines: Line[];
	breaks: Set<number>;
}

const prevBreak = (c: Ctx, i: number): number => {
	let k = i - 1;
	while (k > 0 && !c.breaks.has(k)) k--;
	return Math.max(0, k);
};
const nextBreak = (c: Ctx, i: number): number => {
	let k = i + 1;
	while (k < c.text.length && !c.breaks.has(k)) k++;
	return Math.min(c.text.length, k);
};
const snapBack = (c: Ctx, i: number): number => {
	let k = i;
	while (k > 0 && !c.breaks.has(k)) k--;
	return k;
};
const snapForward = (c: Ctx, i: number): number => {
	let k = i;
	while (k < c.text.length && !c.breaks.has(k)) k++;
	return k;
};

/** Is the character (grapheme) between these two offsets part of a word: a letter or a digit, or an apostrophe between two. */
function wordChar(c: Ctx, from: number, to: number): boolean {
	const g = c.text.slice(from, to);
	if (WORD.test(g)) return true;
	if (g === "'" || g === "\u{2019}") return /[\p{L}\p{N}]$/u.test(c.text.slice(Math.max(0, from - 2), from)) && /^[\p{L}\p{N}]/u.test(c.text.slice(to, to + 2));
	return false;
}

/** The word the caret is in or touches on its line, or null. */
function wordAt(c: Ctx, caret: number, lo: number, hi: number): [number, number] | null {
	let s = caret;
	let e = caret;
	while (s > lo) {
		const p = Math.max(lo, prevBreak(c, s));
		if (!wordChar(c, p, s)) break;
		s = p;
	}
	while (e < hi) {
		const n = Math.min(hi, nextBreak(c, e));
		if (!wordChar(c, e, n)) break;
		e = n;
	}
	return e > s ? [s, e] : null;
}

const runBefore = (text: string, i: number, ch: string): number => {
	let n = 0;
	while (i - n - 1 >= 0 && text[i - n - 1] === ch) n++;
	return n;
};
const runAfter = (text: string, i: number, ch: string): number => {
	let n = 0;
	while (text[i + n] === ch) n++;
	return n;
};

// ---------------------------------------------------------------------------------------------------- the entry

/**
 * What the text and the selection become when `action` is pressed with the selection `start`..`end` (a caret when they are equal), or
 * why it cannot be done. `where` says which field the text is of. Offsets are UTF-16, as a text area has them.
 */
export function richFormat(text: string, start: number, end: number, action: RichAction, where: RichWhere): RichResult {
	if (!richTakes(where, action)) return refuse("no-bullets");
	let a0 = clampSel(start, text.length);
	let b0 = clampSel(end, text.length);
	if (a0 > b0) [a0, b0] = [b0, a0];
	const c: Ctx = { text, where, lines: linesOf(text), breaks: graphemeBreaks(text) };
	const caret = a0 === b0;
	a0 = snapBack(c, a0);
	b0 = caret ? a0 : snapForward(c, b0);
	if (action === "bullets") return bullets(c, a0, b0);
	if (action === "link") return link(c, a0, b0);
	return emphasis(c, a0, b0, action === "bold" ? 2 : 1);
}

/** Finishes a result: the lines checked, the text made, the selection mapped (or given). */
function finish(c: Ctx, edits: Edit[], a0: number, b0: number, did: RichDone["did"], partial: boolean, sel?: [number, number]): RichResult {
	const sorted = [...edits].sort((x, y) => x.pos - y.pos);
	const text = applyEdits(c.text, sorted);
	const broken = keepsLines(c.text, text, c.where);
	if (broken) return refuse(broken);
	const [start, end] = sel ?? [mapPos(a0, sorted), mapPos(b0, sorted)];
	return { ok: true, text, start: Math.min(start, end), end: Math.max(start, end), changed: text !== c.text, did, partial };
}

// ---------------------------------------------------------------------------------------------------- bold and italic

interface Seg {
	a: number;
	b: number;
	/** The format is on: its markers stand against the words, just outside them or just inside the selection's edge. */
	on: boolean;
}

/**
 * The words of a selected stretch without the asterisks and spaces at its edges (the asterisks are marks, whether the selection took
 * them in or not); a stretch of nothing but asterisks and spaces has no words (null): it is not marked, for it could not be told from the
 * marks of what is round it.
 */
function core(text: string, a: number, b: number): [number, number] | null {
	const seg = text.slice(a, b);
	const lead = /^[*\s]*/.exec(seg)?.[0].length ?? 0;
	if (lead === seg.length) return null;
	return [a + lead, b - (/[*\s]*$/.exec(seg)?.[0].length ?? 0)];
}

function emphasis(c: Ctx, a0: number, b0: number, m: 1 | 2): RichResult {
	const { text, lines, where } = c;
	const mark = "*".repeat(m);
	const caret = a0 === b0;
	const raw: [number, number][] = [];
	let pair: number | null = null;
	const here = lines[lineIndexAt(lines, a0)] as Line;
	// a caret in a line's own mark (`- |item`) is taken to be at the start of its words
	const caretFloor = here.from + prefixLen(text.slice(here.from, here.to), where);
	if (caret) {
		const at = Math.max(a0, caretFloor);
		const w = wordAt(c, at, caretFloor, here.to);
		if (w) raw.push(w);
		else {
			a0 = b0 = at;
			pair = at;
		}
	} else {
		for (const li of lines) {
			let a = Math.max(a0, li.from + prefixLen(text.slice(li.from, li.to), where));
			let b = Math.min(b0, li.to);
			if (b0 <= li.from || a0 >= li.to || a >= b) continue;
			while (a < b && isSpace(text[a] as string)) a++;
			while (b > a && isSpace(text[b - 1] as string)) b--;
			a = snapForward(c, a);
			b = snapBack(c, b);
			const words = a < b ? core(text, a, b) : null;
			if (words) raw.push(words);
		}
		if (!raw.length) return refuse("nothing");
	}
	const segs: Seg[] = [];
	if (pair !== null) raw.push([pair, pair]);
	for (const [a, b] of raw) {
		const n = Math.min(runBefore(text, a, "*"), runAfter(text, b, "*"));
		if (n >= 4) return refuse("crowded");
		segs.push({ a, b, on: isOn(n, m) });
	}
	const unwrapping = segs.every((s) => s.on);
	const partial = !unwrapping && segs.some((s) => s.on);
	const edits: Edit[] = [];
	for (const s of segs) {
		if (unwrapping) edits.push({ pos: s.a - m, del: m, ins: "", carry: false }, { pos: s.b, del: m, ins: "", carry: false });
		else if (!s.on) {
			if (pair !== null) edits.push({ pos: s.a, del: 0, ins: mark + mark, carry: false });
			else edits.push({ pos: s.a, del: 0, ins: mark, carry: true }, { pos: s.b, del: 0, ins: mark, carry: false });
		}
	}
	if (pair !== null && !unwrapping) return finish(c, edits, a0, b0, "insert", false, [pair + m, pair + m]);
	// the caret stays where it was (in its word); a selection becomes the words that were marked, from the first to the last, with none of
	// the spaces, line marks or asterisks it had at its edges (so that the next press sees the same words, markers just outside)
	const sorted = [...edits].sort((x, y) => x.pos - y.pos);
	const first = segs[0] as Seg;
	const last = segs[segs.length - 1] as Seg;
	const at = Math.max(a0, caretFloor);
	const sel: [number, number] = caret ? [mapPos(at, sorted), mapPos(at, sorted)] : [mapPos(first.a, sorted), mapPos(last.b, sorted)];
	return finish(c, edits, a0, b0, unwrapping ? "unwrap" : "wrap", partial, sel);
}

/** Bold is on from two asterisks a side, italic from an odd number. */
const isOn = (n: number, m: 1 | 2): boolean => (m === 2 ? n >= 2 : n % 2 === 1);

// ---------------------------------------------------------------------------------------------------- link

const LINK = /\[([^[\]]*)\]\(([^()\s]*)\)/g;

function link(c: Ctx, a0: number, b0: number): RichResult {
	const { text, lines, where } = c;
	const ia = lineIndexAt(lines, a0);
	const li = lines[ia] as Line;
	if (b0 > li.to) return refuse("link-lines");
	const body = text.slice(li.from, li.to);
	// a link that is there already: the selection or the caret is in it
	for (const m of body.matchAll(LINK)) {
		const s = li.from + (m.index ?? 0);
		const e = s + m[0].length;
		if (a0 < s || b0 > e) continue;
		if (s > 0 && text[s - 1] === "!") return refuse("link-brackets");
		const words = m[1] as string;
		const address = m[2] as string;
		if (address !== "" && address !== LINK_PLACEHOLDER) {
			// a real address is never thrown away by a key: it is selected, to be changed
			return { ok: true, text, start: e - 1 - address.length, end: e - 1, changed: false, did: "select", partial: false };
		}
		const edits: Edit[] = [
			{ pos: s, del: 1, ins: "", carry: false },
			{ pos: s + 1 + words.length, del: e - (s + 1 + words.length), ins: "", carry: false },
		];
		return finish(c, edits, a0, b0, "unwrap", false, a0 === b0 ? [mapPos(a0, edits), mapPos(a0, edits)] : [s, s + words.length]);
	}
	let a = a0;
	let b = b0;
	if (a0 === b0) {
		const lo = li.from + prefixLen(body, where);
		const at = Math.max(a0, lo);
		const w = wordAt(c, at, lo, li.to);
		if (!w) {
			if (text[at - 1] === "!") return refuse("link-image");
			const edits: Edit[] = [{ pos: at, del: 0, ins: `[](${LINK_PLACEHOLDER})`, carry: false }];
			return finish(c, edits, at, at, "insert", false, [at + 1, at + 1]);
		}
		[a, b] = w;
	} else {
		a = Math.max(a, li.from + prefixLen(body, where));
		while (a < b && isSpace(text[a] as string)) a++;
		while (b > a && isSpace(text[b - 1] as string)) b--;
		a = snapForward(c, a);
		b = snapBack(c, b);
		if (a >= b) return refuse("nothing");
	}
	if (/[[\]]/.test(text.slice(a, b))) return refuse("link-brackets");
	if (text[a - 1] === "!") return refuse("link-image");
	const edits: Edit[] = [
		{ pos: a, del: 0, ins: "[", carry: true },
		{ pos: b, del: 0, ins: `](${LINK_PLACEHOLDER})`, carry: false },
	];
	const from = b + 3;
	const made = finish(c, edits, a, b, "wrap", false, [from, from + LINK_PLACEHOLDER.length]);
	return made;
}

// ---------------------------------------------------------------------------------------------------- bullets

const BULLET = /^([ \t]*)[-+*]([ \t])/;

function bullets(c: Ctx, a0: number, b0: number): RichResult {
	const { text, lines } = c;
	const touched: Line[] = [];
	if (a0 === b0) touched.push(lines[lineIndexAt(lines, a0)] as Line);
	else for (const li of lines) if (li.to >= a0 && li.from <= b0 && !(li.from === b0) && !(li.to === a0 && li.from < a0)) touched.push(li);
	const filled = touched.filter((l) => text.slice(l.from, l.to).trim() !== "");
	if (!filled.length) return refuse("nothing");
	const have = filled.filter((l) => BULLET.test(text.slice(l.from, l.to)));
	const removing = have.length === filled.length;
	const edits: Edit[] = [];
	for (const l of filled) {
		const s = text.slice(l.from, l.to);
		const m = BULLET.exec(s);
		if (removing) {
			// what is left of the line must not be read as another kind of line (`- ***` is a bullet holding a rule; `- # x` a bullet holding a heading)
			const left = kindOfLine(s.slice((m?.[1] as string).length + 2));
			if (left !== "text" && left !== "blank" && left !== "bullet") return refuse("block");
			edits.push({ pos: l.from + (m?.[1] as string).length, del: 2, ins: "", carry: false });
		}
		else if (!m) {
			const k = kindOfLine(s);
			if (k === "heading" || k === "ordered" || k === "rule" || k === "quote" || /^[ \t]*[-+*]$/.test(s)) return refuse("bullet-kind");
			edits.push({ pos: l.from + (/^[ \t]*/.exec(s)?.[0].length ?? 0), del: 0, ins: "- ", carry: true });
		}
	}
	const sorted = [...edits].sort((x, y) => x.pos - y.pos);
	const made = applyEdits(text, sorted);
	const [start, end] = [mapPos(a0, sorted), mapPos(b0, sorted)];
	return { ok: true, text: made, start, end, changed: made !== text, did: removing ? "unwrap" : "wrap", partial: !removing && have.length > 0 };
}
