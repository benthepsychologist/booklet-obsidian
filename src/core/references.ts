/* Markdown definitions and comment spans, read from the current text by a small scanner. */
import { fencedLines, splitLines } from "./lines";

export interface ReferenceDefinition { text: string; module: string | null; section: "content" | "data"; }
export interface ReferenceSource { definitions: Map<number, { end: number; text: string }>; comments: Set<number>; }

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

/** Add one comment span: every covered line, the first only when white space comes before its start. */
function addComment(text: string, index: LineIndex, start: number, endLine: number, comments: Set<number>, covered: boolean[]): void {
	const startLine = lineAt(index.starts, start);
	for (let i = startLine; i <= endLine; i++) covered[i] = true;
	const prefix = text.slice(index.starts[startLine] ?? 0, start);
	if (!prefix.trim()) comments.add(startLine);
	for (let i = startLine + 1; i <= endLine; i++) comments.add(i);
}

/** Find HTML and Obsidian comments, marking their lines and the lines definitions must not be read on. */
function readComments(text: string, index: LineIndex, fenced: readonly boolean[], comments: Set<number>, covered: boolean[]): void {
	const { lines, starts } = index;
	let i = 0;
	let pos = 0;
	while (i < lines.length) {
		if (fenced[i]) {
			i++;
			pos = 0;
			continue;
		}
		const line = lines[i]?.text ?? "";
		if (pos >= line.length) {
			i++;
			pos = 0;
			continue;
		}
		const htmlAt = line.indexOf("<!--", pos);
		const percentAt = line.indexOf("%%", pos);
		if (htmlAt < 0 && percentAt < 0) {
			i++;
			pos = 0;
			continue;
		}
		if (htmlAt >= 0 && (percentAt < 0 || htmlAt < percentAt)) {
			const start = (starts[i] ?? 0) + htmlAt;
			const close = text.indexOf("-->", start + 4);
			const end = close < 0 ? text.length : close + 3;
			const endLine = close < 0 ? lines.length - 1 : lineAt(starts, end - 1);
			addComment(text, index, start, endLine, comments, covered);
			if (close < 0) return;
			i = endLine;
			pos = end - (starts[endLine] ?? 0);
			continue;
		}
		const start = (starts[i] ?? 0) + percentAt;
		const sameLine = line.indexOf("%%", percentAt + 2);
		if (sameLine < 0) {
			const before = line.slice(blockPrefix(line).offset, percentAt);
			if (before.trim()) {
				pos = percentAt + 2;
				continue;
			}
			const close = text.indexOf("%%", start + 2);
			const end = close < 0 ? text.length : close + 2;
			const endLine = close < 0 ? lines.length - 1 : lineAt(starts, end - 1);
			addComment(text, index, start, endLine, comments, covered);
			if (close < 0) return;
			i = endLine;
			pos = end - (starts[endLine] ?? 0);
			continue;
		}
		const end = (starts[i] ?? 0) + sameLine + 2;
		addComment(text, index, start, i, comments, covered);
		pos = sameLine + 2;
	}
}

/** Find Markdown definition lines, including a title on the line after the target. */
function readDefinitions(text: string, index: LineIndex, fenced: readonly boolean[], covered: readonly boolean[], definitions: ReferenceSource["definitions"]): void {
	const { lines, starts } = index;
	for (let i = 0; i < lines.length; i++) {
		if (fenced[i] || covered[i]) continue;
		const line = lines[i]?.text ?? "";
		const prefix = blockPrefix(line);
		const m = /^ {0,3}\[((?:\\.|[^\\\]])*)\]:[ \t]+(\S.*)$/.exec(line.slice(prefix.offset));
		if (!m || m[1] === undefined || m[2] === undefined) continue;
		const label = m[1];
		if (!label || label.startsWith("^") || !definitionRest(m[2])) continue;
		let endLine = i;
		const next = lines[i + 1]?.text;
		if (next !== undefined && !fenced[i + 1] && !covered[i + 1]) {
			const nextPrefix = blockPrefix(next);
			if (nextPrefix.quote === prefix.quote && nextPrefix.list === prefix.list && isTitle(next.slice(nextPrefix.offset).trim())) endLine = i + 1;
		}
		const end = (starts[endLine] ?? 0) + (lines[endLine]?.text.length ?? 0);
		definitions.set(i, { end: endLine, text: text.slice((starts[i] ?? 0) + prefix.offset, end) });
		i = endLine;
	}
}

/** Find Markdown definitions and comments in one linear pass over the text; source slices preserve the author's spelling. */
export function referenceSource(text: string): ReferenceSource {
	const definitions: ReferenceSource["definitions"] = new Map();
	const comments = new Set<number>();
	// Definitions need `]:`; comments also need a marker.
	if (!text.includes("]:") && !text.includes("<!--") && !text.includes("%%")) return { definitions, comments };
	const index = indexLines(text);
	const fenced = fencedLines(index.lines.map((line) => line.text));
	const covered = index.lines.map(() => false);
	readComments(text, index, fenced, comments, covered);
	readDefinitions(text, index, fenced, covered, definitions);
	return { definitions, comments };
}

/** Definitions ordered so Obsidian resolves the current module before shared data. */
export function referenceContext(defs: readonly ReferenceDefinition[], scope: string | null): string {
	const own = scope !== null ? defs.filter(d => d.module === scope && d.section === "content") : [];
	const data = scope !== null ? defs.filter(d => d.module === scope && d.section === "data") : [];
	const shared = defs.filter(d => d.module === null);
	return [...own, ...data, ...shared].map(d => d.text).join("\n");
}
