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
export const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
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

/** The kinds that take no id: every word after the bar is a setting (SPEC section 4). */
export const NO_ID_KINDS = new Set(["row", "notice", "manifest", "hint", "solution", "group", "diff", "law", "opinion"]);

export interface Words {
	id: string | null;
	flags: Set<string>;
	set: Record<string, string>;
}

/**
 * `id words key:value` after the bar, as the renderer's calloutWords reads it. A page line is read by the pages round's rule (page trees,
 * ahead of the format): a first word that holds `:` is a setting and the line has no written id, so `> [!page|parent:map] Title` keeps its
 * parent. Every other kind reads its first word as the id, as 0.16 does.
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
			if (n === 0 && !noId && !(kind === "page" && w.includes(":"))) out.id = w;
			else if (kv && kv[1] !== undefined) out.set[kv[1].toLowerCase()] = kv[2] ?? "";
			else out.flags.add(w.toLowerCase());
		});
	return out;
}

/**
 * What each kind of booklet line takes after its id: a flag is a bare word, `key:` a setting written key:value.
 * This is SPEC section 4's table for format 0.16: `each:` on every question kind, and `earlier:` on a choice, a
 * multi, a lines and a widget. A kind outside the table is an unknown kind, said on its own.
 */
export const KIND_SETTINGS: Readonly<Record<string, readonly string[]>> = {
	module: ["end", "icon:"],
	activity: ["repeat", "daily", "hidden", "icon:", "parent:", "status:", "tab:"],
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
};

/**
 * The settings a line's kind does not take (SPEC section 4): each is said, and taken off the line so that it is
 * ignored. `where` begins the problem ("Line 12"). A kind outside KIND_SETTINGS gives nothing here.
 */
export function settingProblems(kind: string, w: Words, where: string): string[] {
	const allowed = Object.prototype.hasOwnProperty.call(KIND_SETTINGS, kind) ? KIND_SETTINGS[kind] : undefined;
	if (!allowed) return [];
	const out: string[] = [];
	const a = /^[aeiou]/.test(kind) ? "an" : "a";
	for (const key of Object.keys(w.set)) {
		if (allowed.includes(key + ":")) continue;
		out.push(`${where}: ${a} ${kind} line takes no \`${key}:\` setting, so it was ignored.`);
		delete w.set[key];
	}
	for (const f of [...w.flags]) {
		if (allowed.includes(f)) continue;
		out.push(`${where}: ${a} ${kind} line takes no \`${f}\` setting, so it was ignored.`);
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
