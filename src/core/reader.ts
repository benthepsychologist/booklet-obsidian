/*
 * Reads a booklet's design: its front matter and marker, its module fences, its activities, and the
 * question kinds this plugin draws. Everything else is recorded, by kind
 * and title, as not yet supported. Plain TypeScript: nothing here imports Obsidian.
 */
import {
	CALLOUT_ANY,
	CALLOUT_LINE,
	BLOCK_ID_LINE,
	FENCE_OPEN,
	bodyEnd,
	calloutWords,
	fenceEnd,
	isBlank,
	splitLines,
} from "./lines";
import { readRecords, regionMask, findRegions, type RecordsRead } from "./records";

export const FORMAT_VERSION = "0.15";

export interface Option {
	text: string;
	/** `[x]`: a correct option in a study booklet. Never an answer given. */
	correct: boolean;
}

export interface Anchor {
	/** The number as written: it is the stored answer. */
	n: number;
	text: string;
}

export type QuestionKind = "choice" | "scale" | "text";

export interface Question {
	type: "question";
	kind: QuestionKind;
	id: string;
	title: string;
	/** The `>` lines under the question line, as Markdown. */
	help: string;
	line: number;
	options: Option[];
	anchors: Anchor[];
	long: boolean;
}

export interface Prose {
	type: "prose";
	/** Raw Markdown, for Obsidian's own renderer. */
	markdown: string;
	line: number;
}

export interface TabHeading {
	type: "tab";
	title: string;
	line: number;
}

export interface Unsupported {
	type: "unsupported";
	kind: string;
	id: string | null;
	title: string;
	line: number;
}

export type Segment = Question | Prose | TabHeading | Unsupported;

export interface Activity {
	id: string;
	title: string;
	/** The module the activity is in, or "" for a bare activity (the module with no name). */
	scope: string;
	line: number;
	repeat: boolean;
	hidden: boolean;
	segments: Segment[];
}

export interface Module {
	id: string;
	title: string;
	line: number;
	endLine: number | null;
}

export interface Booklet {
	/** False when the file is not a booklet for this version, or is refused (SPEC sections 2 and 12). */
	ok: boolean;
	refusal: string | null;
	marker: string;
	frontMatter: Record<string, string>;
	title: string;
	bodyStart: number;
	modules: Module[];
	activities: Activity[];
	/** What could not be read, first among them a note about another 0.x marker. */
	problems: string[];
	records: RecordsRead;
}

/* ---- front matter ---- */

export interface FrontMatter {
	head: string[] | null;
	bodyStart: number;
}

/** The lines between an opening `---` on line 1 and the next `---` (booklet.html frontMatter). */
export function frontMatterOf(lines: readonly string[]): FrontMatter {
	const first = (lines[0] ?? "").replace(/^\uFEFF/, "");
	if (first.trim() !== "---") return { head: null, bodyStart: 0 };
	let j = 1;
	while (j < lines.length && (lines[j] ?? "").trim() !== "---") j++;
	return { head: lines.slice(1, j), bodyStart: Math.min(j + 1, lines.length) };
}

/** One `key: value` line, quotes off (booklet.html kvLine). */
export function kvLine(ln: string): [string, string] | null {
	const m = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(ln);
	if (!m || m[1] === undefined) return null;
	let v = (m[2] ?? "").trim();
	if (/^".*"$/.test(v)) {
		try {
			const parsed: unknown = JSON.parse(v);
			v = typeof parsed === "string" ? parsed : v.slice(1, -1);
		} catch {
			v = v.slice(1, -1);
		}
	} else if (/^'.*'$/.test(v)) v = v.slice(1, -1).replace(/''/g, "'");
	return [m[1], v];
}

/** The marker as text, quotes off, or "" when there is no `booklet:` line. */
export function markerOf(head: readonly string[] | null): string {
	for (const l of head ?? []) {
		const m = /^booklet:[ \t]*(.*?)[ \t]*$/.exec(l);
		if (m) return (m[1] ?? "").replace(/^(["'])(.*)\1$/, "$2");
	}
	return "";
}

/** [major, minor] for a marker like "0.15", else null. 0.10 is later than 0.9. */
export function versionOf(v: string): [number, number] | null {
	const m = /^(\d+)\.(\d+)$/.exec(v.trim());
	return m ? [Number(m[1]), Number(m[2])] : null;
}

/** The note's text with its records region(s) taken out: what the view draws from. */
export function designText(text: string): string {
	const L = splitLines(text);
	const lines = L.map((l) => l.text);
	const mask = regionMask(lines.length, findRegions(lines, frontMatterOf(lines).bodyStart));
	let s = "";
	L.forEach((l, i) => {
		if (!mask[i]) s += l.text + l.eol;
	});
	return s;
}

/* ---- the design ---- */

const QUESTION_KINDS = new Set(["text", "lines", "widget", "choice", "multi", "scale", "number", "date", "matrix"]);
/** Every kind the format defines (SPEC section 4's table). */
const KNOWN_KINDS = new Set([
	"module", "activity", "row", "text", "lines", "scale", "matrix", "date", "menu", "hint", "solution", "data",
	"records", "manifest", "notice", "group", "diff", "law", "opinion", "tab", "choice", "multi", "number", "widget",
]);

const OPTION_RE = /^[ \t]*[-*+][ \t]+\[([ xX])\][ \t]+(.*)$/;
const ANCHOR_RE = /^[ \t]*(\d+)[.)][ \t]+(.*)$/;
const BULLET_RE = /^[ \t]*[-*+][ \t]+(?:\[[ xX]\][ \t]+)?(.*)$/;

const colOf = (s: string) => s.replace(/\t/g, "    ").length;
const indentOf = (ln: string) => colOf((/^[ \t]*/.exec(ln) ?? [""])[0]);
const textColOf = (ln: string) => {
	const m = /^([ \t]*[-*+][ \t]+)\[/.exec(ln);
	return m && m[1] !== undefined ? colOf(m[1]) : indentOf(ln) + 2;
};

/** The task list under a choice or multi, with nested replies skipped (booklet.html optionsUnder). */
function optionsUnder(lines: readonly string[], i: number): { items: Option[]; next: number } | null {
	let j = i;
	let blanks = 0;
	while (j < lines.length && isBlank(lines[j])) {
		j++;
		if (++blanks > 1) return null;
	}
	const items: Option[] = [];
	let at = 0;
	let bullet = -1;
	for (; j < lines.length; j++) {
		const ln = lines[j] ?? "";
		const m = OPTION_RE.exec(ln);
		if (m) {
			items.push({ text: (m[2] ?? "").trim(), correct: /[xX]/.test(m[1] ?? "") });
			at = textColOf(ln);
			bullet = -1;
			continue;
		}
		const b = /^[ \t]*[-*+][ \t]+(.*)$/.exec(ln);
		const ind = indentOf(ln);
		if (!items.length || !ln.trim()) break;
		if (b && ind >= at) {
			bullet = ind;
			continue;
		}
		if (!b && bullet >= 0 && ind > bullet) continue;
		break;
	}
	return items.length ? { items, next: j } : null;
}

/** A list right under a line, zero or one blank line above it (booklet.html listUnder). */
function listUnder<T>(lines: readonly string[], i: number, re: RegExp, item: (m: RegExpExecArray) => T): { items: T[]; next: number } | null {
	let j = i;
	let blanks = 0;
	while (j < lines.length && isBlank(lines[j])) {
		j++;
		if (++blanks > 1) return null;
	}
	const items: T[] = [];
	while (j < lines.length) {
		const m = re.exec(lines[j] ?? "");
		if (!m) break;
		items.push(item(m));
		j++;
	}
	return items.length ? { items, next: j } : null;
}

/** The index past everything a Booklet line claims: its `>` body and the list a kind takes under it. */
function claimEnd(kind: string, lines: readonly string[], i: number): number {
	const k = bodyEnd(lines, i);
	if (kind === "choice" || kind === "multi") return optionsUnder(lines, k)?.next ?? k;
	if (kind === "scale") return listUnder(lines, k, ANCHOR_RE, () => 0)?.next ?? k;
	if (kind === "menu") return listUnder(lines, k, BULLET_RE, () => 0)?.next ?? k;
	if (kind === "matrix") {
		const b = listUnder(lines, k, BULLET_RE, () => 0);
		if (!b) return k;
		return listUnder(lines, b.next, ANCHOR_RE, () => 0)?.next ?? b.next;
	}
	return k;
}

const stripQuote = (l: string) => l.replace(/^>[ \t]?/, "");

/**
 * Reads a booklet. Never throws on a file's content: what it cannot read goes into `problems`, and a
 * file it must refuse (no marker, a non-0.x marker, broken module fences, an id used twice in a
 * module) comes back with `ok: false` and the reason, still with whatever structure was found.
 */
export function parseBooklet(text: string): Booklet {
	const lines = splitLines(text).map((l) => l.text);
	const fm = frontMatterOf(lines);
	const frontMatter: Record<string, string> = Object.create(null) as Record<string, string>;
	for (const l of fm.head ?? []) {
		const kv = kvLine(l);
		if (kv) frontMatter[kv[0]] = kv[1];
	}
	const problems: string[] = [];
	const refusals: string[] = [];
	const marker = markerOf(fm.head);
	const ver = versionOf(marker);
	if (!marker) refusals.push("This note has no booklet: marker in its front matter, so it is not a booklet.");
	else if (!ver || ver[0] !== 0) refusals.push(`This note says booklet: ${marker}, which is not a 0.x version, so it is not a booklet for format ${FORMAT_VERSION}.`);
	else if (marker !== FORMAT_VERSION)
		problems.push(`This file says booklet: ${marker}. This view reads format ${FORMAT_VERSION} and has opened it as it is; some of it may not draw.`);

	const regions = findRegions(lines, fm.bodyStart);
	const inRegion = regionMask(lines.length, regions);
	const modules: Module[] = [];
	const activities: Activity[] = [];
	const idsByScope = new Map<string, Set<string>>();
	const at = (i: number) => `Line ${i + 1}`;

	let mod: Module | null = null;
	let act: Activity | null = null;
	let section: "content" | "data" = "content";
	let buf: string[] = [];
	let bufAt = 0;

	const claimId = (id: string | null, i: number) => {
		if (!id) return;
		const scope = mod ? mod.id : "";
		const set = idsByScope.get(scope) ?? new Set<string>();
		idsByScope.set(scope, set);
		if (set.has(id)) refusals.push(`${at(i)}: the id "${id}" is used twice in ${scope ? `the module "${scope}"` : "the activities outside every module"}.`);
		set.add(id);
	};
	const flush = () => {
		if (act && buf.some((l) => l.trim())) {
			const md = buf.join("\n").replace(/^\n+|\n+$/g, "");
			act.segments.push({ type: "prose", markdown: md, line: bufAt + 1 });
		}
		buf = [];
	};
	const pushText = (ls: readonly string[], i: number) => {
		if (!act || section !== "content") return;
		if (!buf.length) bufAt = i;
		buf.push(...ls);
	};
	const endActivity = () => {
		flush();
		act = null;
	};

	for (let i = fm.bodyStart; i < lines.length; i++) {
		if (inRegion[i]) {
			flush();
			continue;
		}
		const ln = lines[i] ?? "";
		const f = FENCE_OPEN.exec(ln);
		if (f && f[1]) {
			const k = fenceEnd(lines, i, f[1]);
			let n = k + 1;
			while (n < lines.length && isBlank(lines[n])) n++;
			const hasId = n < lines.length && BLOCK_ID_LINE.test((lines[n] ?? "").trim());
			const last = hasId ? n : Math.min(k, lines.length - 1);
			const info = (f[2] ?? "").trim().split(/\s+/);
			if (/^booklet$/i.test(info[0] ?? "")) {
				flush();
				if (act && section === "content" && (info[1] ?? "").toLowerCase() === "query")
					act.segments.push({ type: "unsupported", kind: "query", id: null, title: "A query of kept entries or data", line: i + 1 });
			} else if (hasId) {
				flush(); // a figure or data block placed by reference: drawn at its embed, not here
			} else pushText(lines.slice(i, Math.min(k + 1, lines.length)), i);
			i = last;
			continue;
		}
		const m = CALLOUT_LINE.exec(ln);
		if (m && m[1]) {
			const kind = m[1].toLowerCase();
			const w = calloutWords(kind, m[2]);
			const title = (m[4] ?? "").trim();
			const hasWords = !!(w.id || w.flags.size || Object.keys(w.set).length);
			if (kind === "module") {
				endActivity();
				section = "content";
				if (w.flags.has("end")) {
					if (!mod) refusals.push(`${at(i)}: a module is closed that was never opened.`);
					else if (w.id !== mod.id) refusals.push(`${at(i)}: the module "${mod.id}" is closed by a line naming "${w.id ?? ""}".`);
					else mod.endLine = i;
					mod = null;
				} else {
					if (mod) refusals.push(`${at(i)}: a module opens inside the module "${mod.id}", which is not closed.`);
					const id = w.id ?? "";
					if (!id) problems.push(`${at(i)}: a module line has no id.`);
					if (modules.some((x) => x.id === id && id)) refusals.push(`${at(i)}: the module id "${id}" is used twice in this file.`);
					mod = { id, title: title || id, line: i, endLine: null };
					modules.push(mod);
				}
				i = bodyEnd(lines, i) - 1;
				continue;
			}
			if (kind === "activity") {
				endActivity();
				section = "content";
				if (!w.id) problems.push(`${at(i)}: an activity line has no id, so it is named from its title here.`);
				claimId(w.id, i);
				const repeat = w.flags.has("repeat");
				act = { id: w.id ?? "", title: title || w.id || "Activity", scope: mod ? mod.id : "", line: i, repeat, hidden: w.flags.has("hidden"), segments: [] };
				activities.push(act);
				i = bodyEnd(lines, i) - 1; // the `>` lines under it are its card's status line, drawn nowhere else
				continue;
			}
			if (kind === "data") {
				endActivity();
				section = "data";
				i = bodyEnd(lines, i) - 1;
				continue;
			}
			if (section === "data") {
				i = claimEnd(kind, lines, i) - 1;
				continue;
			}
			if (kind === "notice" || kind === "manifest" || kind === "row" || kind === "records") {
				flush();
				i = bodyEnd(lines, i) - 1; // a row's two marker lines: its cells are drawn one under another
				continue;
			}
			if (kind === "tab") {
				flush();
				if (act) act.segments.push({ type: "tab", title: title || w.id || "Tab", line: i + 1 });
				const k = bodyEnd(lines, i);
				pushText(lines.slice(i + 1, k).map(stripQuote), i + 1); // a tab line's `>` lines are the tab's first prose
				i = k - 1;
				continue;
			}
			if (kind === "menu" || QUESTION_KINDS.has(kind) || (!KNOWN_KINDS.has(kind) && hasWords)) {
				flush();
				const k = claimEnd(kind, lines, i);
				if (kind === "menu" || QUESTION_KINDS.has(kind)) claimId(w.id, i);
				if (kind === "menu") {
					i = k - 1; // a shared menu is never drawn
					continue;
				}
				if (!act) {
					if (QUESTION_KINDS.has(kind)) problems.push(`${at(i)}: a question before the first activity belongs to no activity, so it is not drawn.`);
					i = k - 1;
					continue;
				}
				if (!KNOWN_KINDS.has(kind)) problems.push(`${at(i)}: "${kind}" is not a kind this format defines.`);
				if ((kind === "choice" || kind === "scale" || kind === "text") && w.id) {
					const body = lines.slice(i + 1, bodyEnd(lines, i)).map(stripQuote);
					const q: Question = { type: "question", kind, id: w.id, title, help: body.join("\n").trim(), line: i + 1, options: [], anchors: [], long: w.flags.has("long") };
					const after = bodyEnd(lines, i);
					if (kind === "choice") {
						const r = optionsUnder(lines, after);
						if (!r) problems.push(`${at(i)}: the choice "${w.id}" has no options under it.`);
						q.options = r?.items ?? [];
					} else if (kind === "scale") {
						const r = listUnder(lines, after, ANCHOR_RE, (mm) => ({ n: Number(mm[1]), text: (mm[2] ?? "").trim() }));
						if (!r) problems.push(`${at(i)}: the scale "${w.id}" has no anchors under it.`);
						q.anchors = r?.items ?? [];
					}
					act.segments.push(q);
				} else {
					if (!w.id && QUESTION_KINDS.has(kind)) problems.push(`${at(i)}: a ${kind} question has no id, so it cannot hold an answer.`);
					act.segments.push({ type: "unsupported", kind, id: w.id, title, line: i + 1 });
				}
				i = k - 1;
				continue;
			}
			// a reading callout (note, tip, hint, solution, group, diff, law, opinion, …): Obsidian draws it
			const k = bodyEnd(lines, i);
			if (act && section === "content") {
				const nested = lines.slice(i + 1, k).find((l) => {
					const t = l.replace(/^(?:>[ \t]?)+/, "> ");
					const mm = CALLOUT_LINE.exec(t);
					return !!mm && QUESTION_KINDS.has((mm[1] ?? "").toLowerCase());
				});
				if (nested !== undefined) problems.push(`${at(i)}: a question inside a ${kind} callout is drawn as text here, not as a question (not yet supported).`);
			}
			pushText(lines.slice(i, k), i);
			i = k - 1;
			continue;
		}
		if (CALLOUT_ANY.test(ln)) problems.push(`${at(i)}: this line starts like a Booklet line but cannot be read, so it is shown as text.`);
		if (section !== "content") continue;
		pushText([ln], i); // a page break (`***`) stays in the prose: pages are drawn one under another
	}
	endActivity();
	if (mod) refusals.push(`The module "${mod.id}" is opened and never closed.`);

	const moduleIds = new Set(modules.map((x) => x.id).filter(Boolean));
	const bareActivityIds = new Set(activities.filter((a) => !a.scope && a.id).map((a) => a.id));
	const records = readRecords(lines, fm.bodyStart, { moduleIds, bareActivityIds }, regions);
	problems.push(...records.problems);
	for (const r of regions.slice(1)) problems.push(`Line ${r.start + 1}: a second records section; its records are read as if they sat in the first.`);
	const afterRegion = regions[0] && regions[0].closed ? lines.slice(regions[0].end + 1).some((l, n) => !inRegion[regions[0]!.end + 1 + n] && l.trim()) : false;
	if (afterRegion) problems.push("There is text after the records section; the reference renderer would move it above the records when it saves.");
	const refusal = refusals[0] ?? null;
	return {
		ok: !refusal,
		refusal,
		marker,
		frontMatter,
		title: frontMatter["title"] ?? "",
		bodyStart: fm.bodyStart,
		modules,
		activities,
		problems: [...refusals.slice(1), ...problems],
		records,
	};
}

