/*
 * Lines, fences and Booklet lines, read the way the reference renderer (booklet.html) and the
 * reference linter (lint-booklet.py) read them. Plain TypeScript: nothing here imports Obsidian.
 */

/** One line of a file: its text without the line ending, and the ending itself ("\n", "\r\n" or "" for the last line). */
export interface Line {
	text: string;
	eol: string;
}

/**
 * Splits a file into lines, keeping each line's own ending so that joining `text + eol` gives back
 * the file byte for byte. A file that ends with a newline has a last, empty line (as `split("\n")`).
 */
export function splitLines(text: string): Line[] {
	const out: Line[] = [];
	let pos = 0;
	for (;;) {
		const nl = text.indexOf("\n", pos);
		if (nl < 0) {
			out.push({ text: text.slice(pos), eol: "" });
			return out;
		}
		const cr = nl > pos && text.charCodeAt(nl - 1) === 13;
		out.push({ text: text.slice(pos, cr ? nl - 1 : nl), eol: cr ? "\r\n" : "\n" });
		pos = nl + 1;
	}
}

export function joinLines(lines: Line[]): string {
	let s = "";
	for (const l of lines) s += l.text + l.eol;
	return s;
}

/** The line ending a file mostly uses: the first one found, else "\n". */
export function eolOf(lines: Line[], from = 0, to = lines.length): string {
	for (let i = from; i < to && i < lines.length; i++) {
		const l = lines[i];
		if (l && l.eol) return l.eol;
	}
	for (const l of lines) if (l.eol) return l.eol;
	return "\n";
}

/** `> [!kind|id words]- Title`, exactly the renderer's CALLOUT_LINE. */
export const CALLOUT_LINE = /^>[ \t]?\[!([A-Za-z0-9][A-Za-z0-9-]*)(?:\|([^\]]*))?\]([+-]?)[ \t]*(.*)$/;
/** Any line that starts like a Booklet line, readable or not. */
export const CALLOUT_ANY = /^>[ \t]?\[!/;
export const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
export const BLOCK_ID_LINE = /^\^([A-Za-z0-9-]+)$/;
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

/** The index of the line that closes the fence opened at `i` with `mark`, or `lines.length` when it never closes. */
export function fenceEnd(lines: readonly string[], i: number, mark: string): number {
	let k = i + 1;
	for (; k < lines.length; k++) {
		const c = FENCE_CLOSE.exec(lines[k] ?? "");
		if (c && c[1] && c[1][0] === mark[0] && c[1].length >= mark.length) break;
	}
	return k;
}

/** Per line: is it a fence line (its opening, its closing) or inside a fenced code block? An unclosed fence runs to the end. */
export function fencedLines(lines: readonly string[]): boolean[] {
	const out = lines.map(() => false);
	for (let i = 0; i < lines.length; i++) {
		const f = FENCE_OPEN.exec(lines[i] ?? "");
		if (!f || !f[1]) continue;
		const k = Math.min(fenceEnd(lines, i, f[1]), lines.length - 1);
		for (let j = i; j <= k; j++) out[j] = true;
		i = k;
	}
	return out;
}

/**
 * A comment, HTML (`<!-- ... -->`) or Obsidian's own (`%% ... %%`): not words a reader sees. A mark with no closer after it matches nothing.
 * Global; `String.replace` starts again each call, so one pattern is shared. (This one strips comments out of a piece of prose; it does not
 * know code spans. Where a line is hidden, or an opener is inside code, `visibleLines` is what decides.)
 */
export const COMMENT = /<!--[\s\S]*?-->|%%[\s\S]*?%%/g;

/** The marks `visibleLines` looks for, earliest first: a run of backticks, `<!--`, `%%`, `<pre` and `$$`. Global; each use sets `lastIndex`. */
const OPENERS = /`+|<!--|%%|<pre[\s>]|\$\$/gi;
const BACKTICK_RUN = /`+/g;
const PRE_CLOSE = /<\/pre>/gi;

/**
 * What a reader sees of each line, by one short scan shared by the heading links and the page line: outside a fenced code block, an HTML
 * comment, an Obsidian `%%` comment, a `<pre>` block and a `$$` math block. `hidden[i]` is true when line `i` STARTS inside a comment, a `<pre>` or a `$$` block, so
 * a line-start mark such as `> [!page` there is not read. `text[i]` is the line with its comments and its `$$ ... $$` spans taken out, or
 * null when nothing of it is seen (a fenced line, or a line wholly inside a comment, `<pre>` or `$$` block). `from` is the first line read.
 * `skip` marks lines that are not part of what is read, the records section (SPEC section 8): they are not scanned (`hidden` false, `text`
 * null), and no region reaches across one, so a saved answer that holds `-->` or `$$` can never close a mark written in the body.
 *
 * A region hides only what it really encloses. The scan goes in order, and a mark counts as an opener only when its closer (`-->`,
 * `</pre>`, the next `$$`, the next `%%`) is found later in the note, before the next skipped line: a `<!--` with no `-->` after it, a `<pre>` with no
 * `</pre>`, and a lone or odd `$$` (a price such as `$$$`) hide nothing, so every line after them stays visible, as before this scan
 * existed. A mark inside an inline code span (one run of backticks, closed by a run of the same length on its line) is not an opener.
 * A fence line is only a fence when it starts outside a region: a "```" line inside a comment is part of the comment. Text in a fenced code
 * block is code, so it is never a closer either. A mark that starts its line (up to three spaces in) opens a block, as Markdown's HTML
 * block and a math block do, and a fence line inside it is part of it. A mark further along a line sits in a paragraph, and a fence line
 * ends that paragraph, so the search for its closer stops there and finds none. A single-line `<!-- ... -->`, `$$ ... $$` or
 * `<pre>...</pre>` is a span of its line, not a region over lines.
 */
export function visibleLines(lines: readonly string[], from = 0, skip?: readonly boolean[]): { hidden: boolean[]; text: (string | null)[] } {
	const n = lines.length;
	const hidden = lines.map(() => false);
	const text: (string | null)[] = lines.map(() => null);
	// A search for a closer that found none will find none for any later opener either, up to the line where it stopped, so each kind of
	// region remembers that line (the scan stays linear). `block` is a mark that starts its line, whose search runs over fence lines.
	const dead = { comment: [0, 0], percent: [0, 0], pre: [0, 0], math: [0, 0] } as Record<"comment" | "percent" | "pre" | "math", [number, number]>;
	/** The end (index just past the closer) of the first closer at or after column `col` of line `i`, as the line and the column, or null. */
	const closeOf = (kind: "comment" | "percent" | "pre" | "math", i: number, col: number, block: boolean): { line: number; end: number } | null => {
		const d = dead[kind];
		if (i < (block ? d[0] : Math.max(d[0], d[1]))) return null;
		let j = i;
		for (; j < n; j++) {
			if (skip?.[j]) break;
			const l = lines[j] ?? "";
			if (!block && j > i && FENCE_OPEN.test(l)) break;
			const at = j === i ? col : 0;
			let end = -1;
			if (kind === "comment") {
				const x = l.indexOf("-->", at);
				if (x >= 0) end = x + 3;
			} else if (kind === "math" || kind === "percent") {
				const x = l.indexOf(kind === "math" ? "$$" : "%%", at);
				if (x >= 0) end = x + 2;
			} else {
				PRE_CLOSE.lastIndex = at;
				const m = PRE_CLOSE.exec(l);
				if (m) end = m.index + m[0].length;
			}
			if (end >= 0) return { line: j, end };
		}
		// stopped at a fence line (a search over fence lines never stops there) or at the end of what is read
		if (j < n && !skip?.[j]) d[1] = j;
		else d[0] = j;
		return null;
	};
	for (let i = from; i < n; ) {
		if (skip?.[i]) {
			i++;
			continue;
		}
		const f = FENCE_OPEN.exec(lines[i] ?? "");
		if (f && f[1]) {
			i = Math.min(fenceEnd(lines, i, f[1]), n - 1) + 1;
			continue;
		}
		let cur = i;
		let p = 0;
		let kept = "";
		for (;;) {
			const l = lines[cur] ?? "";
			OPENERS.lastIndex = p;
			const m = OPENERS.exec(l);
			if (!m) {
				kept += l.slice(p);
				break;
			}
			kept += l.slice(p, m.index);
			const mark = m[0];
			const after = m.index + mark.length;
			p = after;
			if (mark[0] === "`") {
				// an inline code span: its text is kept, and nothing in it opens anything. A run with no run of its own length after it is plain text.
				BACKTICK_RUN.lastIndex = after;
				let c: RegExpExecArray | null;
				let end = after;
				while ((c = BACKTICK_RUN.exec(l))) {
					if (c[0].length === mark.length) {
						end = c.index + c[0].length;
						break;
					}
				}
				kept += l.slice(m.index, end);
				p = end;
				continue;
			}
			const kind = mark === "<!--" ? "comment" : mark === "%%" ? "percent" : mark === "$$" ? "math" : "pre";
			const close = closeOf(kind, cur, after, /^ {0,3}$/.test(l.slice(0, m.index)));
			if (!close) {
				kept += mark;
				continue;
			}
			if (close.line === cur) {
				// a span of this line. A comment (either kind) and a `$$` span are taken out of what is seen; a `<pre>` with its end on its line is read as text
				if (kind === "pre") kept += mark;
				else p = close.end;
				continue;
			}
			// a region over lines: this line is seen up to the opener, the lines inside are hidden, and the closing line is seen after the closer
			text[cur] = kept;
			for (let j = cur + 1; j <= close.line; j++) hidden[j] = true;
			cur = close.line;
			p = close.end;
			kept = "";
		}
		text[cur] = kept;
		i = cur + 1;
	}
	return { hidden, text };
}

/** The kinds that take no id: every word after the bar is a setting (SPEC section 4). */
export const NO_ID_KINDS = new Set(["row", "notice", "manifest", "hint", "solution", "group", "diff", "law", "opinion"]);

export interface Words {
	id: string | null;
	flags: Set<string>;
	set: Record<string, string>;
}

/**
 * `id words key:value` after the bar, as the renderer's calloutWords reads it (SPEC section 4): on every kind that takes an id the first
 * word is the id, except that a first word that holds `:` is a setting and the line has no written id, so `> [!page|parent:map] Title`
 * keeps its parent. Every later word is a setting, and a kind that takes no id has settings only.
 */
export function calloutWords(kind: string, s: string | undefined): Words {
	const out: Words = { id: null, flags: new Set(), set: Object.create(null) as Record<string, string> };
	const noId = NO_ID_KINDS.has(kind);
	String(s ?? "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.forEach((w, n) => {
			const kv = /^([A-Za-z][A-Za-z0-9-]*):(.*)$/.exec(w);
			if (n === 0 && !noId && !w.includes(":")) out.id = w;
			else if (kv && kv[1] !== undefined) out.set[kv[1].toLowerCase()] = kv[2] ?? "";
			else out.flags.add(w.toLowerCase());
		});
	return out;
}

/**
 * What each kind of booklet line takes after its id: a flag is a bare word, `key:` a setting written key:value.
 * This is SPEC section 4's table for format 0.18: `each:` on every question kind but a listen, `earlier:` on a choice, a
 * multi, a lines and a widget, and `left:` on a listen. A kind outside the table is an unknown kind, said on its own.
 */
export const KIND_SETTINGS: Readonly<Record<string, readonly string[]>> = {
	module: ["end", "icon:"],
	activity: ["repeat", "daily", "hidden", "icon:", "status:", "tab:", "entries:"],
	row: ["end"],
	text: ["long", "each:"],
	lines: ["each:", "earlier:"],
	scale: ["each:"],
	matrix: ["each:"],
	date: ["each:"],
	menu: [],
	hint: [],
	solution: [],
	data: [],
	records: [],
	manifest: [],
	notice: [],
	group: [],
	diff: [],
	law: [],
	opinion: [],
	tab: [],
	page: ["icon:", "parent:"],
	choice: ["open", "menu:", "each:", "earlier:"],
	multi: ["open", "menu:", "each:", "earlier:"],
	number: ["min:", "max:", "step:", "each:"],
	widget: ["readonly", "describe", "each:", "earlier:"],
	listen: ["left:"],
};

/**
 * The settings a line's kind does not take (SPEC section 4): each is said, and taken off the line so that it is
 * ignored. `where` begins the problem ("Line 12"). A kind outside KIND_SETTINGS gives nothing here.
 */
export function settingProblems(kind: string, w: Words, where: string): string[] {
	return ignoredSettings(kind, w).map((s) => `${where}: ${s.why}, so it was ignored.`);
}

/**
 * The same, with each ignored setting as its name (no colon) and the clause that says why ("a text line takes no `hidden` setting"), so
 * that the notice can list it beside the line it stands on. Each is taken off the line.
 */
export function ignoredSettings(kind: string, w: Words): { name: string; why: string }[] {
	const allowed = Object.prototype.hasOwnProperty.call(KIND_SETTINGS, kind) ? KIND_SETTINGS[kind] : undefined;
	if (!allowed) return [];
	const out: { name: string; why: string }[] = [];
	const a = /^[aeiou]/.test(kind) ? "an" : "a";
	for (const key of Object.keys(w.set)) {
		if (allowed.includes(key + ":")) continue;
		out.push({ name: key, why: `${a} ${kind} line takes no \`${key}:\` setting` });
		delete w.set[key];
	}
	for (const f of [...w.flags]) {
		if (allowed.includes(f)) continue;
		out.push({ name: f, why: `${a} ${kind} line takes no \`${f}\` setting` });
		w.flags.delete(f);
	}
	return out;
}

/** `earlier:`'s value: a whole number written in digits only (`[0-9]+`, so `012` is 12), or null when it is not one. */
export function earlierValue(v: string): number | null {
	return /^[0-9]+$/.test(v) ? Number(v) : null;
}

/** The index past the `>` lines that belong to the Booklet line at `i` (a `> [!` line ends them). */
export function bodyEnd(lines: readonly string[], i: number): number {
	let k = i + 1;
	while (k < lines.length && (lines[k] ?? "").startsWith(">") && !CALLOUT_ANY.test(lines[k] ?? "")) k++;
	return k;
}

export const isBlank = (s: string | undefined): boolean => !s || !s.trim();

/** An id made from a name, as SPEC section 3 makes a tab's: accents dropped, lowercase, other runs one dash, at most 60 characters; a name that leaves nothing is `<prefix>-<n>`. */
export function idFromName(name: string, n: number, prefix: string): string {
	const id = name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");
	return id || `${prefix}-${n}`;
}

/** A tab's id: the one written after the bar, else its name as SPEC section 3 makes an id of it (`n` is its place, for a name that leaves nothing). */
export const tabIdOf = (name: string, n: number): string => idFromName(name, n, "tab");

/** Tab ids made unique as SPEC says: the second of two with one id is numbered (`plan-2`). */
export function uniqueIds(ids: string[]): string[] {
	const seen = new Map<string, number>();
	return ids.map((id) => {
		const n = (seen.get(id) ?? 0) + 1;
		seen.set(id, n);
		return n === 1 ? id : `${id}-${n}`;
	});
}
