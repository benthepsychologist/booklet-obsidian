/* Markdown definition lines, read from the current text by a small scanner that leaves out code and comments. */
import { FENCE_OPEN, fenceEnd, splitLines } from "./lines";

export interface ReferenceDefinition { text: string; module: string | null; section: "content" | "data"; }
export interface ReferenceSource { definitions: Map<number, { end: number; text: string }>; }

interface BlockPrefix {
	/** Where the line's own content starts, after blockquote and list markers. */
	offset: number;
	/** How many blockquote markers the line begins with. */
	quote: number;
	/** How many list markers the line begins with. */
	list: number;
}

interface LineIndex {
	lines: ReturnType<typeof splitLines>;
	starts: number[];
}

/** Read a line's blockquote and list markers, so a definition can be found inside a callout or a list. */
function blockPrefix(line: string): BlockPrefix {
	let offset = 0;
	let quote = 0;
	let list = 0;
	for (;;) {
		let j = offset;
		let spaces = 0;
		while (spaces < 3 && line[j] === " ") {
			j++;
			spaces++;
		}
		if (line[j] === ">") {
			quote++;
			j++;
			if (line[j] === " " || line[j] === "\t") j++;
			offset = j;
			continue;
		}
		const c = line[j];
		if ((c === "-" || c === "+" || c === "*") && (line[j + 1] === " " || line[j + 1] === "\t")) {
			list++;
			let k = j + 1;
			while (line[k] === " " || line[k] === "\t") k++;
			offset = k;
			continue;
		}
		if (c !== undefined && c >= "0" && c <= "9") {
			let k = j;
			while (k < line.length && k - j < 9) {
				const digit = line[k];
				if (digit === undefined || digit < "0" || digit > "9") break;
				k++;
			}
			if (k > j && (line[k] === "." || line[k] === ")") && (line[k + 1] === " " || line[k + 1] === "\t")) {
				list++;
				let content = k + 1;
				while (line[content] === " " || line[content] === "\t") content++;
				offset = content;
				continue;
			}
		}
		return { offset, quote, list };
	}
}

/** A title that is only a quoted word, on its own line or after a definition's target. */
function isTitle(s: string): boolean {
	if (s.length < 2) return false;
	const open = s[0];
	const close = open === "(" ? ")" : open;
	if (open !== '"' && open !== "'" && open !== "(") return false;
	for (let i = 1; i < s.length; i++) {
		if (s[i] === "\\") {
			i++;
			continue;
		}
		if (s[i] === close) return i === s.length - 1;
	}
	return false;
}

/** The offset after a definition's target (a bare word or `<angle brackets>`), or -1 when there is none. */
function targetEnd(s: string): number {
	if (s.startsWith("<")) {
		const close = s.indexOf(">", 1);
		return close < 0 ? -1 : close + 1;
	}
	let depth = 0;
	let i = 0;
	for (; i < s.length; i++) {
		const c = s[i];
		if (c === "\\") {
			i++;
			continue;
		}
		if (c === "(") depth++;
		else if (c === ")") {
			if (depth === 0) break;
			depth--;
		} else if (c === " " || c === "\t" || c === "<") break;
	}
	return i === 0 || depth !== 0 ? -1 : i;
}

/** Whether the rest of a definition line is a target, optionally followed by a same-line title. */
function definitionRest(s: string): boolean {
	const end = targetEnd(s);
	if (end < 0) return false;
	const rest = s.slice(end);
	if (!rest.trim()) return true;
	if (!/^[ \t]+/.test(rest)) return false;
	return isTitle(rest.trim());
}

/** The index of the line holding a source offset. */
function lineAt(starts: readonly number[], offset: number): number {
	let lo = 0;
	let hi = starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if ((starts[mid] ?? 0) <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** The line start offsets of a text, for slicing exact source ranges. */
function indexLines(text: string): LineIndex {
	const lines = splitLines(text);
	const starts: number[] = [];
	let at = 0;
	for (const line of lines) {
		starts.push(at);
		at += line.text.length + line.eol.length;
	}
	return { lines, starts };
}

/** The marks that start a comment and the text that ends it. A `%%` comment runs past its line only when it starts a block. */
const COMMENT_MARKS = [
	{ open: "<!--", close: "-->", block: false },
	{ open: "%%", close: "%%", block: true },
] as const;
type CommentMark = (typeof COMMENT_MARKS)[number];

/** The ranges of a line that are inline code: a run of backticks up to the next run of the same length. */
function codeSpans(line: string): [number, number][] {
	const spans: [number, number][] = [];
	for (let i = 0; i < line.length; i++) {
		if (line[i] !== "`") continue;
		let n = 1;
		while (line[i + n] === "`") n++;
		let at = i + n;
		for (;;) {
			at = line.indexOf("`", at);
			if (at < 0) break;
			let m = 1;
			while (line[at + m] === "`") m++;
			if (m === n) {
				spans.push([i, at + m]);
				break;
			}
			at += m;
		}
		i = at < 0 ? i + n - 1 : at + n - 1;
	}
	return spans;
}

/** The first comment mark at or after `pos` that is not inside inline code. */
function nextMark(line: string, pos: number, spans: readonly [number, number][]): { at: number; mark: CommentMark } | null {
	let best: { at: number; mark: CommentMark } | null = null;
	for (const mark of COMMENT_MARKS) {
		let at = line.indexOf(mark.open, pos);
		for (let span = spans.find((s) => at >= s[0] && at < s[1]); span; span = spans.find((s) => at >= s[0] && at < s[1])) at = line.indexOf(mark.open, span[1]);
		if (at >= 0 && (!best || at < best.at)) best = { at, mark };
	}
	return best;
}

/** Per line: a fence line or inside a fenced block (also in a blockquote or list item, ending where its quote does), or an indented code line. */
function codeLines(index: LineIndex): boolean[] {
	const raw = index.lines.map((line) => line.text);
	const prefixes = raw.map(blockPrefix);
	const stripped = raw.map((line, i) => line.slice(prefixes[i]?.offset ?? 0));
	const out = raw.map(() => false);
	for (let i = 0; i < raw.length; i++) {
		const f = FENCE_OPEN.exec(stripped[i] ?? "");
		if (f && f[1]) {
			const quote = prefixes[i]?.quote ?? 0;
			let k = Math.min(fenceEnd(quote || prefixes[i]?.list ? stripped : raw, i, f[1]), raw.length - 1);
			for (let j = i + 1; j <= k; j++) {
				if ((prefixes[j]?.quote ?? 0) < quote) {
					k = j - 1;
					break;
				}
			}
			for (let j = i; j <= k; j++) out[j] = true;
			i = k;
			continue;
		}
		// four spaces or a tab, straight under a blank line, a fence or more indented code (a list item's own lines are not code)
		const before = i === 0 || !(stripped[i - 1] ?? "").trim() || !!out[i - 1];
		out[i] = before && prefixes[i]?.list === 0 && /^(?: {4}|\t)/.test(stripped[i] ?? "") && !!(stripped[i] ?? "").trim();
	}
	return out;
}

/** Find HTML and Obsidian comments, marking the lines they touch: a definition is not read on those. */
function readComments(text: string, index: LineIndex, code: readonly boolean[], covered: boolean[]): void {
	const { lines, starts } = index;
	let i = 0;
	let pos = 0;
	while (i < lines.length) {
		const line = lines[i]?.text ?? "";
		const found = code[i] || pos >= line.length ? null : nextMark(line, pos, codeSpans(line));
		if (!found) {
			i++;
			pos = 0;
			continue;
		}
		const { at, mark } = found;
		const start = (starts[i] ?? 0) + at;
		const close = text.indexOf(mark.close, start + mark.open.length);
		const end = close < 0 ? text.length : close + mark.close.length;
		const endLine = close < 0 ? lines.length - 1 : lineAt(starts, end - 1);
		if (mark.block && endLine > i && line.slice(blockPrefix(line).offset, at).trim()) {
			pos = at + mark.open.length;
			continue;
		}
		for (let n = i; n <= endLine; n++) covered[n] = true;
		if (close < 0) return;
		i = endLine;
		pos = end - (starts[endLine] ?? 0);
	}
}

/** Whether the line before a definition is paragraph text, which a definition cannot interrupt (CommonMark). */
function continuesParagraph(before: string, prefix: BlockPrefix): boolean {
	const p = blockPrefix(before);
	if (p.quote < prefix.quote || p.list < prefix.list) return false;
	const body = before.slice(p.offset).trim();
	// blank, another definition or footnote line, a callout line, a heading or a rule: a new block starts after it
	return !!body && !/^\[[^\]]*\]:/.test(body) && !/^\[!/.test(body) && !/^#{1,6}(?:[ \t]|$)/.test(body) && !/^(?:([-*_])[ \t]*){3,}$|^=+$/.test(body);
}

/** Find Markdown definition lines, including a title on the line after the target. */
function readDefinitions(index: LineIndex, code: readonly boolean[], covered: readonly boolean[], definitions: ReferenceSource["definitions"], text: string): void {
	const { lines, starts } = index;
	let lastEnd = -1;
	for (let i = 0; i < lines.length; i++) {
		if (code[i] || covered[i]) continue;
		const line = lines[i]?.text ?? "";
		const prefix = blockPrefix(line);
		const m = /^ {0,3}\[((?:\\.|[^\\\]])*)\]:[ \t]+(\S.*)$/.exec(line.slice(prefix.offset));
		if (!m || m[1] === undefined || m[2] === undefined) continue;
		const label = m[1];
		if (!label.trim() || label.startsWith("^") || !definitionRest(m[2])) continue;
		if (i > 0 && i - 1 > lastEnd && !code[i - 1] && !covered[i - 1] && continuesParagraph(lines[i - 1]?.text ?? "", prefix)) continue;
		let endLine = i;
		const next = lines[i + 1]?.text;
		if (next !== undefined && !code[i + 1] && !covered[i + 1]) {
			const nextPrefix = blockPrefix(next);
			if (nextPrefix.quote === prefix.quote && nextPrefix.list === prefix.list && isTitle(next.slice(nextPrefix.offset).trim())) endLine = i + 1;
		}
		const end = (starts[endLine] ?? 0) + (lines[endLine]?.text.length ?? 0);
		definitions.set(i, { end: endLine, text: text.slice((starts[i] ?? 0) + prefix.offset, end) });
		lastEnd = endLine;
		i = endLine;
	}
}

/** Find Markdown definitions in one linear pass over the text; source slices preserve the author's spelling. */
export function referenceSource(text: string): ReferenceSource {
	const definitions: ReferenceSource["definitions"] = new Map();
	if (!text.includes("]:")) return { definitions };
	const index = indexLines(text);
	const code = codeLines(index);
	const covered = index.lines.map(() => false);
	readComments(text, index, code, covered);
	readDefinitions(index, code, covered, definitions, text);
	return { definitions };
}

/** Definitions ordered so Obsidian resolves the current scope's own first, then its data section, then the shared data section. The booklet's opening is scope null. */
export function referenceContext(defs: readonly ReferenceDefinition[], scope: string | null): string {
	const own = defs.filter(d => d.module === scope && d.section === "content");
	const data = scope !== null ? defs.filter(d => d.module === scope && d.section === "data") : [];
	const shared = defs.filter(d => d.module === null && d.section === "data");
	return [...own, ...data, ...shared].map(d => d.text).join("\n");
}
