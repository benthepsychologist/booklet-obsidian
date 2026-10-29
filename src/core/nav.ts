/*
 * The booklet's navigation model (SPEC 0.16 section 3): what a booklet shows one screen at a time. It reads the parts
 * of the design the reader (reader.ts) does not keep, from the note's own lines: a card's picture, blurb and status
 * line, `parent:` and `tab:`, a module's tabs and notice, and the page breaks inside an activity. It also holds
 * the rules for where a booklet opens, what is next, where a heading link leads, and how a saved place is read back.
 * Plain TypeScript: nothing here imports Obsidian, and nothing here ever writes the note.
 */
import { BLOCK_ID_LINE, CALLOUT_ANY, CALLOUT_LINE, FENCE_OPEN, bodyEnd, calloutWords, fenceEnd, fencedLines, isBlank, splitLines } from "./lines";
import { treeOf, questionsIn } from "./blocks";
import { COMMON_KINDS, HEADING_WORDS, isThematicBreak, kvLine, openingMarkdown, type Activity, type Booklet, type PageHeading, type Segment } from "./reader";
import { holdsSomething } from "./shape";

/* ---- places ---- */

export const HOME = "home";

/**
 * The version written with a saved place that names a page: a later release can tell a place that came from this one (view state).
 * Version 1 (releases 0.6.0 and 0.7.0) had no page key; 2 (page trees) adds it. A place with no page key is still written as version 1,
 * so a note with no named page on show saves exactly what 0.6.0 did and an older device restores it. Places of either version are read
 * (placeFrom).
 */
export const PLACE_VERSION = 2;
const PLACE_VERSION_1 = 1;

/**
 * Where the reader is: the screen (`home`, `module:<id>` or `activity:<module id>/<activity id>`, the module id empty
 * for a bare activity), the tab on show (a tab's id, null where the screen has no tab bar), and the part of the tab on
 * show, counted from 0 (a stretch between page breaks: SPEC's "page", the pages round's working word). With a tree of named pages, `part`
 * counts every part of the tab in reading order (the tab's `pages`); a place read from a saved view state may instead carry `page`, the
 * id of a named page, and then `part` counts within that page (resolvePlace turns it into the first kind; a drawn place never has `page`).
 */
export interface Place {
	screen: string;
	tab: string | null;
	part: number;
	page?: string;
}

export const actKey = (scope: string, id: string) => `${scope}/${id}`;
export const actScreen = (a: NavAct) => `activity:${a.key}`;
export const modScreen = (m: NavMod) => `module:${m.id}`;
export const homePlace = (): Place => ({ screen: HOME, tab: null, part: 0 });

export const samePlace = (a: Place | null, b: Place | null): boolean => !!a && !!b && a.screen === b.screen && a.tab === b.tab && a.part === b.part;

/**
 * Is a move from one place to the other a step in Obsidian's Back and Forward (design 3.4)? Another screen is, and so is
 * another part of the same tab; choosing a tab never is, even when the tab opens on another part than the one left.
 * Both places are resolved ones (resolvePlace).
 */
export function isStep(from: Place | null, to: Place): boolean {
	if (!from || from.screen !== to.screen) return true;
	return from.tab === to.tab && from.part !== to.part;
}

/**
 * A place as the view saves it: `{ version, screen, tab, page, part }`, `tab` left out when there is none and `page` left out unless a
 * named page is on show (the page's id; `part` is then within that page, and the version is 2). With no page key, or with no `nav` to
 * find the page in, the version is 1 and `part` counts every part of the tab, exactly as release 0.6.0 saved it: a 0.16 note saves
 * what it always did.
 */
export function placeState(p: Place, nav?: NavModel): { version: number; screen: string; tab?: string; page?: string; part: number } {
	const base = { screen: p.screen, ...(p.tab ? { tab: p.tab } : {}) };
	const a = nav && p.screen.startsWith("activity:") ? nav.byKey.get(p.screen.slice(9)) : undefined;
	const tab = a ? tabShown(a, p.tab) : null;
	const at = tab ? pageAtPart(tab, p.part) : null;
	if (at?.page.named) return { version: PLACE_VERSION, ...base, page: at.page.id, part: at.part };
	return { version: PLACE_VERSION_1, ...base, part: p.part };
}

/**
 * A place read back from a saved view state: null when it is not one this or release 0.6.0 wrote (another version, or not a place). A
 * version 1 place has no page key and its `part` counts every part of the tab, as 0.6.0 read it; one saved by a device on 0.6.0 or 0.7.0
 * therefore opens where it was.
 */
export function placeFrom(state: unknown): Place | null {
	if (!state || typeof state !== "object") return null;
	const s = state as Record<string, unknown>;
	const version = s["version"];
	if ((version !== PLACE_VERSION_1 && version !== PLACE_VERSION) || typeof s["screen"] !== "string" || !s["screen"]) return null;
	const part = s["part"];
	const tab = s["tab"];
	const page = s["page"];
	return {
		screen: s["screen"],
		tab: typeof tab === "string" && tab ? tab : null,
		part: typeof part === "number" && Number.isInteger(part) && part >= 0 ? part : 0,
		...(version === PLACE_VERSION && typeof page === "string" && page ? { page } : {}),
	};
}

/* ---- the model ---- */

/**
 * One tab of an activity. An activity with no tab line has one, unnamed.
 *
 * `pages` is every part of the tab (a part is a stretch between page breaks, empty ones left out) in reading order, one after another:
 * the 0.16 list, which a place's `part` counts in and the pager walks until the view moves through the tree (page trees, below). `tree`
 * is the tab's named pages and its first page, depth first; `top` the ones at the top of the tree. A tab with no page line has a tree
 * of one page, whose parts are exactly `pages`.
 */
export interface ActTab {
	id: string;
	title: string;
	pages: Segment[][];
	tree: TreePage[];
	top: TreePage[];
}

/**
 * A page of a tab's tree (page trees, ahead of the format: format 0.17, not yet in SPEC; design/pages/proposal.md). The words before a
 * tab's first page line are the tab's first page, named by the tab (by the activity, in an activity with no tab line); with those
 * empty the first named page is the first. A tab with no page line is one such page. `parts` are the stretches a `***` splits a page
 * into: one empty part for a page with no words.
 */
export interface TreePage {
	/** Unique among the tab's pages (a second of one id is numbered, `grid-2`); "" for a page no page line made: it has no id, so no page can name it as parent. */
	id: string;
	/** Does a page line start it? False for the words before a tab's first page line, and for the one page of a tab with no page line. */
	named: boolean;
	/** The title's words, a leading emoji taken out (it is the picture). The id for a page line with no words. */
	title: string;
	/** The title as written (inline Markdown), "" when the page line has none; the tab's or the activity's name for a page no page line made. */
	written: string;
	emoji: string | null;
	/** `icon:` as written (a name in Booklet's set is drawn; the view checks). */
	icon: string | null;
	/** The first paragraph of the page's own words as plain words ("" if none): the `>` lines under the page line are its first prose. */
	blurb: string;
	/** `parent:` as written. */
	parentId: string | null;
	/** The page it sits under (a missing parent, a cycle: the top); null at the top. */
	parent: TreePage | null;
	children: TreePage[];
	parts: Segment[][];
	/** Where its first part is in the tab's `pages`. */
	at: number;
	/** The line of its page line (1-based); the tab's, or the activity's, for a page no page line made. */
	line: number;
}

export interface NavAct {
	act: Activity;
	key: string;
	mod: NavMod;
	/** The title's words, a leading emoji taken out (it is the picture). */
	title: string;
	emoji: string | null;
	/** `icon:` as written (a name in Booklet's set is drawn; the view checks). */
	icon: string | null;
	/** The first paragraph under the activity's line, as plain words ("" if none). */
	blurb: string;
	/** The `>` lines under the activity line, joined: inline Markdown. Null when there are none. */
	statusMd: string | null;
	statusOff: boolean;
	parentId: string | null;
	/** The activity it sits under (a hidden parent is passed over); null at the top. */
	parent: NavAct | null;
	children: NavAct[];
	/** The module tab it is in, a tab's id (the first when it names none or one the module lacks); null where the module has no tab bar. */
	modTab: string | null;
	/** What comes before the first tab line: shown above every tab. Empty with no tab line. */
	opening: Segment[];
	tabs: ActTab[];
	/** Does the activity have tab lines at all (its single tab is then named)? */
	named: boolean;
	/** Folded callouts that are there to be read: the status line counts them. */
	reads: number;
	/** Its place in its module's reading order, from 1 (for a bare activity, the order among the bare ones). */
	number: number;
	line: number;
}

export interface ModTab {
	id: string;
	title: string;
	/** The prose and reading callouts under the tab line, up to the next one. */
	md: string;
}

export interface NavMod {
	/** "" for the bare activities, which are one module with no name. */
	id: string;
	bare: boolean;
	/** What the module line says, emoji out; with no words, the id (the booklet's title for a module of one activity: see cardTitle). */
	title: string;
	/** The title as written: "" when the module line has none. */
	written: string;
	emoji: string | null;
	icon: string | null;
	/** The opening before its first tab line (a notice and the tab lines aside): its own screen shows it. */
	opening: string;
	blurb: string;
	tabs: ModTab[];
	/** The notice: `[key, value]` in the order written (licence, copyright, source, version). */
	notice: [string, string][];
	/** The offered activities (not `hidden`), file order. */
	acts: NavAct[];
	/** The ones at the top (under no other), file order. */
	top: NavAct[];
	/** Parent first, then its children, then the next sibling: the order Next follows (SPEC 3). */
	order: NavAct[];
	line: number;
}

export type NavCard = { kind: "module"; mod: NavMod; line: number } | { kind: "activity"; act: NavAct; line: number };

export interface NavModel {
	/** What could not be read in the pages' trees (a parent that is not in the tab, a cycle, a shared id), beside the reader's own problems. */
	problems: string[];
	title: string;
	/** `start: home` in the front matter. */
	startHome: boolean;
	/** The bare activities as one module first (when there are any), then the modules in file order. */
	mods: NavMod[];
	byKey: Map<string, NavAct>;
	/** The cards of the home screen, in file order. */
	cards: NavCard[];
}

/** Has the module a screen of its own? A module of one activity has none: its activity's screen is its screen. */
export const hasScreen = (m: NavMod): boolean => !m.bare && m.acts.length > 1;

const LEAD_EMOJI = /^(\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*️?)\s*/u;
const stripQuote = (l: string) => l.replace(/^>[ \t]?/, "");
const QUESTION_LINE_KINDS = new Set<string>([...COMMON_KINDS, "widget"]);
/** The kinds a module's opening cannot hold: a question or a menu line there belongs to nothing (the reader reports it). */
const NOT_IN_AN_OPENING = new Set<string>([...QUESTION_LINE_KINDS, "menu", "row", "manifest", "records"]);

/** An id made from a name, as SPEC section 3 makes a tab's: accents dropped, lowercase, other runs one dash, at most 60 characters; a name that leaves nothing is `<prefix>-<n>`. */
function idFromName(name: string, n: number, prefix: string): string {
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

/** A page's id, when the page line writes none: its title made into an id as a tab's name is, `page-<n>` for a title that leaves nothing (the pages round, 2.5). */
export const pageIdOf = (title: string, n: number): string => idFromName(title, n, "page");

/** Tab ids made unique as SPEC says: the second of two with one id is numbered (`plan-2`). */
function uniqueIds(ids: string[]): string[] {
	const seen = new Map<string, number>();
	return ids.map((id) => {
		const n = (seen.get(id) ?? 0) + 1;
		seen.set(id, n);
		return n === 1 ? id : `${id}-${n}`;
	});
}

function splitEmoji(title: string): { title: string; emoji: string | null } {
	const m = LEAD_EMOJI.exec(title.trim());
	const t = title.trim();
	if (!m || !m[1] || !t.slice(m[0].length).trim()) return { title, emoji: null };
	return { title: t.slice(m[0].length), emoji: m[1] };
}

/** Inline Markdown as plain words: marks, link addresses and footnote marks gone, a link its label, an image its alt text. */
export function plainText(md: string): string {
	return md
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/!\[\[[^\]]*\]\]/g, "")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, (_m, a: string) => a.replace(/^#/, ""))
		.replace(/\[\^[^\]]*\]/g, "")
		.replace(/(\*\*|__|~~|==|[*`])/g, "")
		.replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, "$1$2")
		.replace(/\\([\\`*_{}[\]()#+\-.!|>~=])/g, "$1")
		.replace(/\s*\n\s*/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * The first paragraph of some Markdown that is plain prose (not a heading, a quote, a list or a fence), as plain words. A paragraph
 * ends at a thematic break written straight under its text (`- - -`, `***`); one underlined as a heading (`===`, `---`) is a heading.
 */
export function firstParagraph(md: string): string {
	for (const p of md.replace(/<!--[\s\S]*?-->/g, "").split(/\n{2,}/)) {
		if (!p.trim() || /^\s*(#|>|[-*+] |\d+[.)] |`{3}|~{3})/.test(p)) continue;
		const lines = p.split("\n");
		if (lines.some((l, i) => i > 0 && /^ {0,3}(=+|-+)[ \t]*$/.test(l))) continue;
		const cut = lines.findIndex((l, i) => i > 0 && isThematicBreak(l, true));
		return plainText((cut < 0 ? lines : lines.slice(0, cut)).join("\n"));
	}
	return "";
}

/** A card or a button holds no link: a link is its words (the words of an inline link, `[[a|b]]` its b). */
export function linkless(md: string): string {
	return md.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, (_m, a: string) => a.replace(/^#/, "")).replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

/**
 * A title, a crumb or a status line is one line of inline Markdown (SPEC: every title is inline Markdown): words that would start a
 * block when the line is rendered on its own ("2026. Mood log" is an ordered list, "# x" a heading, "- x" a bullet, "> x" a quote)
 * are read as the words they are, by escaping the character that would start the block.
 */
export function inlineMd(md: string): string {
	const text = md.replace(/\s*\n\s*/g, " ").trim();
	const num = /^(\d{1,9})([.)])(?=\s|$)/.exec(text);
	if (num) return `${num[1]}\\${text.slice(num[1]!.length)}`;
	if (/^([#>]|[-+*](?=\s|$)|`{3,}|~{3,}|([-*_=])\2{2,}\s*$)/.test(text)) return `\\${text}`;
	return text;
}

/* ---- pages ---- */

/**
 * The pieces of Markdown between page breaks (SPEC section 3, "Pages are pagination"): a thematic break is a break by
 * Markdown's own rules, so `***` and `___` break even under a line of text, `---` only with a blank line above (else it
 * underlines a heading), and nothing inside a fenced code block or a quoted callout (a group) breaks a page.
 */
function splitAtBreaks(markdown: string): string[][] {
	const lines = markdown.split("\n");
	const out: string[][] = [[]];
	const fenced = fencedLines(lines);
	lines.forEach((l, i) => {
		const here = out[out.length - 1] as string[];
		if (fenced[i]) {
			here.push(l);
			return;
		}
		const above = lines[i - 1];
		const textAbove = i > 0 && !isBlank(above) && !(above ?? "").startsWith(">");
		if (isThematicBreak(l, textAbove)) out.push([]);
		else here.push(l);
	});
	return out;
}

/**
 * An activity's (or a tab's) segments as pages: prose is cut at its page breaks, a question, a query or a notice stays on
 * the page it stands in. A page with nothing on it is no page, unless it is the only one.
 */
export function pagesOf(segs: readonly Segment[]): Segment[][] {
	const pages: Segment[][] = [[]];
	/** How deep in callouts: a page break inside a callout is a rule drawn in it, not a break (SPEC section 6, "A group holds blocks"). */
	let depth = 0;
	const page = () => pages[pages.length - 1] as Segment[];
	for (const s of segs) {
		if (s.type === "callout") depth++;
		else if (s.type === "callout-end") depth--;
		if (s.type !== "prose" || depth > 0) {
			page().push(s);
			continue;
		}
		let at = 0;
		splitAtBreaks(s.markdown).forEach((ls, n) => {
			if (n) pages.push([]);
			const md = ls.join("\n").replace(/^\n+|\n+$/g, "");
			if (md.trim()) page().push({ type: "prose", markdown: md, line: s.line + at });
			at += ls.length + 1;
		});
	}
	const kept = pages.filter((p) => p.length);
	return kept.length ? kept : [[]];
}

/** The folded callouts that hold booklet lines and no question, read as the folded callouts of prose are (not a hint or a solution). */
function foldedGroups(segs: readonly Segment[]): number {
	return treeOf(segs).reduce(function count(n: number, x): number {
		if (x.type !== "callout-box") return n;
		const kind = x.start.kind.toLowerCase();
		const here = x.start.fold === "-" && kind !== "hint" && kind !== "solution" && !questionsIn(x.children).length ? 1 : 0;
		return x.children.reduce(count, n + here);
	}, 0);
}

/** The folded callouts of some prose that are there to be read: not a hint or a solution, holding no question; the outer one only. */
function readsOf(markdown: string): number {
	const lines = markdown.split("\n");
	const fenced = fencedLines(lines);
	let n = 0;
	for (let i = 0; i < lines.length; i++) {
		if (fenced[i]) continue;
		const l = lines[i] ?? "";
		const m = CALLOUT_LINE.exec(l);
		if (!m || !m[1]) continue;
		const k = bodyEnd(lines, i);
		const kind = m[1].toLowerCase();
		const holdsQuestion = lines.slice(i + 1, k).some((x) => {
			const mm = CALLOUT_LINE.exec(x.replace(/^(?:>[ \t]?)+/, "> "));
			return !!mm && QUESTION_LINE_KINDS.has((mm[1] ?? "").toLowerCase());
		});
		if (m[3] === "-" && kind !== "hint" && kind !== "solution" && !holdsQuestion) n++;
		i = k - 1;
	}
	return n;
}

/* ---- page trees (ahead of the format: format 0.17, not yet in SPEC; design/pages/proposal.md) ---- */

/** Does a run of segments hold anything but blank lines, comments and page breaks? Only then are the words before a tab's first page line a page (the pages round, 2.3). */
function holdsWords(segs: readonly Segment[]): boolean {
	return segs.some((s) => s.type !== "prose" || pagesOf([{ ...s, markdown: s.markdown.replace(/<!--[\s\S]*?-->/g, "") }]).some((pg) => pg.length));
}

/** The blurb of a page: the first paragraph of its words, when they begin with prose (as an activity's card reads its own). */
function pageBlurb(parts: readonly Segment[][]): string {
	const f = parts[0]?.[0];
	return f && f.type === "prose" ? firstParagraph(f.markdown) : "";
}

/**
 * The tree of one tab's pages (the pages round's shape (b)). The words before the first page line are the first page, named `first`;
 * with none, the first named page is the first. Pages with no `parent:` stand side by side after it in the file's order; `parent:`
 * names a page of the same tab by its id and puts the page under it. A parent that is not a page of the tab (another tab's, or none),
 * a page that is its own ancestor and a page under itself stand at the top, said in `problems`; of two pages with one id the second is
 * numbered and the first is the parent. The reading order is depth first (a page, its first child, that child's children, its next
 * sibling), and `pages` of the result is every part of every page in that order.
 */
function pageTreeOf(segs: readonly Segment[], first: { title: string; line: number }, problems: string[]): { tree: TreePage[]; top: TreePage[]; pages: Segment[][] } {
	const mk = (o: Partial<TreePage> & Pick<TreePage, "id" | "named" | "written" | "parts" | "line">): TreePage => {
		const t = splitEmoji(o.written);
		return { title: t.title || o.id, emoji: t.emoji, icon: null, blurb: pageBlurb(o.parts), parentId: null, parent: null, children: [], at: 0, ...o };
	};
	const heads: { seg: PageHeading; segs: Segment[] }[] = [];
	const before: Segment[] = [];
	for (const s of segs) {
		if (s.type === "page") heads.push({ seg: s, segs: [] });
		else if (heads.length) (heads[heads.length - 1] as (typeof heads)[number]).segs.push(s);
		else before.push(s);
	}
	// a tab with no page line is one page, its words: every 0.16 tab (the pages are only its parts)
	if (!heads.length) {
		const parts = pagesOf(segs);
		const only = mk({ id: "", named: false, written: first.title, parts, line: first.line });
		return { tree: [only], top: [only], pages: parts };
	}
	const list: TreePage[] = [];
	if (holdsWords(before)) list.push(mk({ id: "", named: false, written: first.title, parts: pagesOf(before), line: first.line }));
	const written = heads.map((h, n) => h.seg.id ?? pageIdOf(h.seg.title, n + 1));
	// a page's id must name one page, since a saved place and a `parent:` name it: a second `g` is `g-2`, and when a later page wrote `g-2`
	// itself the next free number is taken (`g`, `g`, `g-2` are `g`, `g-2`, `g-3`), each decided in the file's order so the ids stay as they are
	const taken = new Set<string>();
	const ids = written.map((w) => {
		let id = w;
		if (taken.has(id)) {
			// the next number after the one the id ends in (`g-2` taken: `g-3`), else the second (`g` taken: `g-2`)
			const m = /^(.*)-(\d+)$/.exec(w);
			const base = m ? (m[1] as string) : w;
			for (let n = m ? Number(m[2]) + 1 : 2; taken.has((id = `${base}-${n}`)); n++);
		}
		taken.add(id);
		return id;
	});
	heads.forEach((h, n) => {
		const id = ids[n] as string;
		if (id !== written[n]) problems.push(`Line ${h.seg.line}: the page id "${written[n]}" is used twice in this tab, so this page is "${id}" (a parent: of "${written[n]}" is the first page).`);
		list.push(mk({ id, named: true, written: h.seg.title, parts: pagesOf(h.segs), line: h.seg.line, icon: h.seg.icon, parentId: h.seg.parent }));
	});
	const named = list.filter((p) => p.named);
	// `parent:` names the first page that wrote that id; failing that, the id a page ended up with
	const firstWriter = new Map<string, TreePage>();
	const byId = new Map<string, TreePage>();
	named.forEach((p, n) => {
		const w = written[n] as string;
		if (!firstWriter.has(w)) firstWriter.set(w, p);
		byId.set(p.id, p);
	});
	const up = (x: TreePage): TreePage | null => {
		const p = x.parentId ? (firstWriter.get(x.parentId) ?? byId.get(x.parentId)) : undefined;
		return p && p !== x ? p : null;
	};
	// a page is on a cycle when its parent chain comes back to it; found once for every page (a page whose chain only leads into a
	// cycle keeps its parent), by following each unvisited chain and noting where it meets itself
	const onCycle = new Set<TreePage>();
	const state = new Map<TreePage, 1 | 2>();
	for (const x of named) {
		if (state.has(x)) continue;
		const path: TreePage[] = [];
		let cur: TreePage | null = x;
		while (cur && !state.has(cur)) {
			state.set(cur, 1);
			path.push(cur);
			cur = up(cur);
		}
		if (cur && state.get(cur) === 1) for (const c of path.slice(path.indexOf(cur))) onCycle.add(c);
		for (const c of path) state.set(c, 2);
	}
	for (const x of named) {
		const p = onCycle.has(x) ? null : up(x);
		if (x.parentId && !p) {
			const why = x.parentId === x.id ? "is its own parent" : firstWriter.has(x.parentId) || byId.has(x.parentId) ? `is its own ancestor (through "${x.parentId}")` : `names the parent "${x.parentId}", which is no page of this tab (a parent is a page of the same tab)`;
			problems.push(`Line ${x.line}: the page "${x.id}" ${why}, so it stands at the top of the tab.`);
		}
		x.parent = p;
		if (p) p.children.push(x);
	}
	const top = list.filter((p) => !p.parent);
	const tree: TreePage[] = [];
	const pages: Segment[][] = [];
	// depth first, a loop and not a recursion: a chain of thousands of pages must not overflow the stack
	const stack: TreePage[] = [...top].reverse();
	while (stack.length) {
		const x = stack.pop() as TreePage;
		tree.push(x);
		x.at = pages.length;
		for (const part of x.parts) pages.push(part);
		for (let n = x.children.length - 1; n >= 0; n--) stack.push(x.children[n] as TreePage);
	}
	return { tree, top, pages };
}

function tabOf(id: string, title: string, segs: readonly Segment[], first: { title: string; line: number }, problems: string[]): ActTab {
	const t = pageTreeOf(segs, first, problems);
	return { id, title, pages: t.pages, tree: t.tree, top: t.top };
}

/* ---- reading a module's opening ---- */

interface ModuleParts {
	opening: string;
	tabs: { id: string; title: string; md: string }[];
	notice: [string, string][];
	hasNotice: boolean;
}

/**
 * What a module holds before its first activity (SPEC section 3): its opening, its tab lines each with the prose after
 * it, and its notice. Read from lines [from, to) the way the reader reads them, so a fenced block and a widget
 * placed by reference are left out of the prose.
 */
function moduleParts(lines: readonly string[], from: number, to: number, title: string): ModuleParts {
	const open: string[] = [];
	const found: { title: string; id: string | null; body: string[] }[] = [];
	const notice: [string, string][] = [];
	let hasNotice = false;
	let into = open;
	for (let i = from; i < to; i++) {
		const ln = lines[i] ?? "";
		const f = FENCE_OPEN.exec(ln);
		if (f && f[1]) {
			const k = fenceEnd(lines, i, f[1]);
			let n = k + 1;
			while (n < lines.length && isBlank(lines[n])) n++;
			const hasId = n < lines.length && BLOCK_ID_LINE.test((lines[n] ?? "").trim());
			const info = (f[2] ?? "").trim().split(/\s+/);
			if (!/^booklet$/i.test(info[0] ?? "") && !hasId) into.push(...lines.slice(i, Math.min(k + 1, lines.length)));
			i = hasId ? n : Math.min(k, lines.length - 1);
			continue;
		}
		const m = CALLOUT_LINE.exec(ln);
		if (m && m[1]) {
			const kind = m[1].toLowerCase();
			const k = bodyEnd(lines, i);
			if (kind === "tab") {
				const w = calloutWords("tab", m[2]);
				const t = { title: (m[4] ?? "").trim() || w.id || "Tab", id: w.id, body: lines.slice(i + 1, k).map(stripQuote) };
				found.push(t);
				into = t.body;
			} else if (kind === "notice") {
				hasNotice = true;
				for (const l of lines.slice(i + 1, k)) {
					const kv = kvLine(stripQuote(l).trim());
					if (kv && ["license", "copyright", "source", "version"].includes(kv[0].toLowerCase())) notice.push([kv[0].toLowerCase(), kv[1]]);
				}
			} else if (kind === "page") into.push(...lines.slice(i + 1, k).map(stripQuote)); // a page line outside every activity is not read; its `>` lines are text (the reader says so)
			else if (!NOT_IN_AN_OPENING.has(kind)) into.push(...lines.slice(i, k));
			i = k - 1;
			continue;
		}
		// outside every activity a page break is no page, and is not drawn (`---` under a line of text is its heading)
		if (isThematicBreak(ln, !isBlank(lines[i - 1]))) continue;
		into.push(ln);
	}
	const ids = uniqueIds(found.map((t, n) => t.id ?? tabIdOf(t.title, n + 1)));
	return {
		opening: openingMarkdown(open, title),
		tabs: found.map((t, n) => ({ id: ids[n] as string, title: t.title, md: t.body.join("\n").replace(/^\s*\n|\s+$/g, "") })),
		notice,
		hasNotice,
	};
}

/* ---- building it ---- */

/** The `>` lines under a line, joined as the one line of inline Markdown the status line is. */
function statusOf(lines: readonly string[], at: number): string | null {
	const k = bodyEnd(lines, at);
	const s = lines
		.slice(at + 1, k)
		.map((l) => stripQuote(l).trim())
		.filter(Boolean)
		.join(" ");
	return s || null;
}

export function buildNav(book: Booklet, text: string): NavModel {
	const lines = splitLines(text).map((l) => l.text);
	const mods: NavMod[] = [];
	const byKey = new Map<string, NavAct>();
	const problems: string[] = [];
	const bare: NavMod = { id: "", bare: true, title: "", written: "", emoji: null, icon: null, opening: "", blurb: "", tabs: [], notice: [], acts: [], top: [], order: [], line: -1 };

	for (const m of book.modules) {
		const line = CALLOUT_LINE.exec(lines[m.line] ?? "");
		const w = calloutWords("module", line?.[2]);
		const written = (line?.[4] ?? "").trim();
		const t = splitEmoji(m.title);
		const firstAct = book.activities.find((a) => a.scope === m.id);
		const parts = moduleParts(lines, bodyEnd(lines, m.line), firstAct ? firstAct.line : (m.endLine ?? lines.length), m.title);
		mods.push({
			id: m.id,
			bare: false,
			title: t.title,
			written,
			emoji: t.emoji,
			icon: w.set["icon"] || null,
			opening: parts.opening,
			blurb: firstParagraph(parts.opening),
			tabs: parts.tabs,
			notice: parts.hasNotice ? parts.notice : [],
			acts: [],
			top: [],
			order: [],
			line: m.line,
		});
	}
	const modOf = (scope: string): NavMod => (scope ? (mods.find((m) => m.id === scope) ?? bare) : bare);

	// the front matter's licence, copyright and source are the notice of a file's one module that has none (SPEC section 3)
	const holders = mods.filter((m) => book.activities.some((a) => a.scope === m.id));
	if (holders.length === 1 && holders[0] && !holders[0].notice.length) {
		const n: [string, string][] = [];
		for (const k of ["license", "copyright", "source"]) if (book.frontMatter[k]) n.push([k, book.frontMatter[k] as string]);
		holders[0].notice = n;
	}

	const all: NavAct[] = [];
	for (const a of book.activities) {
		const mod = modOf(a.scope);
		const lm = CALLOUT_LINE.exec(lines[a.line] ?? "");
		const w = calloutWords("activity", lm?.[2]);
		const t = splitEmoji(a.title);
		const opening: Segment[] = [];
		const raw: { id: string | null; title: string; segs: Segment[]; line: number }[] = [];
		const hasTabLine = a.segments.some((x) => x.type === "tab");
		for (const s of a.segments) {
			if (s.type === "tab") {
				const tm = CALLOUT_LINE.exec(lines[s.line - 1] ?? "");
				raw.push({ id: calloutWords("tab", tm?.[2]).id, title: s.title, segs: [], line: s.line });
			} else if (raw.length) (raw[raw.length - 1] as (typeof raw)[number]).segs.push(s);
			else if (s.type !== "page" || !hasTabLine) opening.push(s); // a page line in the opening above the tabs is not read (the reader says so)
		}
		const ids = uniqueIds(raw.map((r, n) => r.id ?? tabIdOf(r.title, n + 1)));
		const tabs: ActTab[] = raw.length
			? raw.map((r, n) => tabOf(ids[n] as string, r.title, r.segs, { title: r.title, line: r.line }, problems))
			: [tabOf("", "", opening, { title: t.title, line: a.line + 1 }, problems)];
		// the card's blurb: the first paragraph under the activity's line, and that may stand under its first page line (the pages round, 2.7)
		const first = a.segments.find((s) => s.type !== "page");
		const reads = a.segments.reduce((n, s) => n + (s.type === "prose" ? readsOf(s.markdown) : 0), 0) + foldedGroups(a.segments);
		const na: NavAct = {
			act: a,
			key: actKey(a.scope, a.id),
			mod,
			title: t.title,
			emoji: t.emoji,
			icon: w.set["icon"] || null,
			blurb: first && first.type === "prose" ? firstParagraph(first.markdown) : "",
			statusMd: statusOf(lines, a.line),
			statusOff: (w.set["status"] ?? "").toLowerCase() === "off",
			parentId: w.set["parent"] || null,
			parent: null,
			children: [],
			modTab: w.set["tab"] || null,
			opening: raw.length ? opening : [],
			tabs,
			named: raw.length > 0,
			reads,
			number: 0,
			line: a.line,
		};
		all.push(na);
	}

	// the tree: `parent:` places an activity under another of its module (a missing parent leaves it at the top, one that is
	// its own ancestor is drawn at the top, a hidden parent is passed over and its children take its place)
	const effective = new Map<NavAct, NavAct | null>();
	for (const mod of [bare, ...mods]) {
		const here = all.filter((x) => x.mod === mod);
		const byId = new Map<string, NavAct>();
		for (const x of here) if (x.act.id && !byId.has(x.act.id)) byId.set(x.act.id, x);
		const up = (x: NavAct): NavAct | null => {
			const p = x.parentId ? byId.get(x.parentId) : undefined;
			return p && p !== x ? p : null;
		};
		const loops = (x: NavAct): boolean => {
			const seen = new Set<NavAct>();
			for (let p = up(x); p; p = up(p)) {
				if (p === x) return true;
				if (seen.has(p)) return false;
				seen.add(p);
			}
			return false;
		};
		for (const x of here) {
			let p = loops(x) ? null : up(x);
			for (let n = 0; p && p.act.hidden && n < here.length; n++) p = loops(p) ? null : up(p);
			effective.set(x, p && !p.act.hidden ? p : null);
		}
	}
	for (const x of all) {
		if (x.act.hidden) continue;
		x.mod.acts.push(x);
		byKey.set(x.key, x);
	}
	if (bare.acts.length) mods.unshift(bare);
	for (const mod of mods) {
		for (const x of mod.acts) {
			const p = effective.get(x) ?? null;
			x.parent = p;
			if (p) p.children.push(x);
		}
		mod.top = mod.acts.filter((x) => !x.parent);
		const walk = (xs: NavAct[]) => {
			for (const x of xs) {
				mod.order.push(x);
				walk(x.children);
			}
		};
		walk(mod.top);
		mod.order.forEach((x, n) => (x.number = n + 1));
		// an activity whose `tab:` names no tab of its module is in the first tab
		if (mod.tabs.length > 1) for (const x of mod.acts) if (!x.modTab || !mod.tabs.some((t) => t.id === x.modTab)) x.modTab = (mod.tabs[0] as ModTab).id;
	}

	// the home screen: a module is a card (a module of one activity is its activity's card); each bare activity at the top is its own
	const cards: NavCard[] = [];
	for (const mod of mods) {
		if (mod.bare) for (const x of mod.top) cards.push({ kind: "activity", act: x, line: x.line });
		else if (mod.acts.length > 1) cards.push({ kind: "module", mod, line: mod.line });
		else if (mod.acts[0]) cards.push({ kind: "activity", act: mod.acts[0], line: mod.line });
	}
	cards.sort((x, y) => x.line - y.line);
	return { problems, title: book.title, startHome: (book.frontMatter["start"] ?? "").trim() === "home", mods, byKey, cards };
}

/* ---- where a booklet opens, and what a saved place means ---- */

const allActs = (nav: NavModel): NavAct[] => nav.mods.flatMap((m) => m.acts);

/** The tabs a screen's tab bar draws: two or more, else none. */
export const barTabs = (na: NavAct): ActTab[] => (na.named && na.tabs.length > 1 ? na.tabs : []);

/** The place an activity opens on: its first tab, its first part. */
export function activityPlace(na: NavAct): Place {
	return { screen: actScreen(na), tab: barTabs(na)[0]?.id ?? null, part: 0 };
}

/** The place a module opens on: its screen on its first tab, or (a module of one activity) its activity. Null for a module with nothing to show. */
export function entryPlace(m: NavMod): Place | null {
	if (hasScreen(m)) return { screen: modScreen(m), tab: m.tabs.length > 1 ? (m.tabs[0] as ModTab).id : null, part: 0 };
	return m.acts[0] ? activityPlace(m.acts[0]) : null;
}

/** The place of a module's screen for the reader coming from `na`: on the tab of the activity, or of its top ancestor (the reference's rule). */
export function modulePlaceFor(na: NavAct): Place {
	const m = na.mod;
	let top = na;
	while (top.parent) top = top.parent;
	return { screen: modScreen(m), tab: m.tabs.length > 1 ? (top.modTab ?? (m.tabs[0] as ModTab).id) : null, part: 0 };
}

/**
 * Where a booklet opens (SPEC section 2, `start`): a booklet that holds exactly one activity opens into it; exactly one
 * module with several activities, on that module's screen; any other, on home. `start: home` keeps home. Only offered
 * activities count, not hidden ones.
 */
export function startPlace(nav: NavModel): Place {
	if (nav.startHome) return homePlace();
	const acts = allActs(nav);
	if (acts.length === 1 && acts[0]) return activityPlace(acts[0]);
	const holders = nav.mods.filter((m) => !m.bare).length + (nav.mods.find((m) => m.bare)?.acts.length ?? 0);
	const only = nav.mods.find((m) => !m.bare);
	if (holders === 1 && only && hasScreen(only)) return entryPlace(only) ?? homePlace();
	return homePlace();
}

/** A place this note has, as it is drawn: a screen and a tab it has, a part within its tab's pages. Anything else falls back to where the note opens. */
export function resolvePlace(nav: NavModel, p: Place | null): Place {
	const start = startPlace(nav);
	if (!p) return start;
	if (p.screen === HOME) return nav.cards.length ? homePlace() : start;
	if (p.screen.startsWith("module:")) {
		const m = nav.mods.find((x) => !x.bare && x.id === p.screen.slice(7));
		if (!m) return start;
		if (!hasScreen(m)) return entryPlace(m) ?? start;
		return { screen: p.screen, tab: m.tabs.length > 1 ? (m.tabs.find((t) => t.id === p.tab)?.id ?? (m.tabs[0] as ModTab).id) : null, part: 0 };
	}
	const a = p.screen.startsWith("activity:") ? nav.byKey.get(p.screen.slice(9)) : undefined;
	if (!a) return start;
	const bar = barTabs(a);
	const tab = bar.length ? (bar.find((t) => t.id === p.tab)?.id ?? (bar[0] as ActTab).id) : null;
	const shown = tabShown(a, tab) as ActTab;
	// a place that names a page (version 2) counts its part within that page; a page the note no longer has opens the tab's first page
	if (p.page !== undefined) {
		const pg = shown.tree.find((x) => x.named && x.id === p.page);
		return { screen: p.screen, tab, part: pg ? pg.at + Math.min(Math.max(0, p.part), pg.parts.length - 1) : 0 };
	}
	return { screen: p.screen, tab, part: Math.min(Math.max(0, p.part), Math.max(0, shown.pages.length - 1)) };
}

/** The tab a screen shows for a tab id: the one with the id on a screen with a tab bar (the first when it has none of that id), else the activity's one tab. */
function tabShown(a: NavAct, id: string | null | undefined): ActTab | null {
	const bar = barTabs(a);
	return bar.length ? (bar.find((t) => t.id === id) ?? (bar[0] as ActTab)) : (a.tabs[0] ?? null);
}

const partOwners = new WeakMap<ActTab, number[]>();

/** The page that holds the part at `at` of a tab's parts, and the part's place within it. */
export function pageAtPart(tab: ActTab, at: number): { page: TreePage; part: number; index: number } {
	let owners = partOwners.get(tab);
	if (!owners) {
		// the tree index of the page that holds each part, made once per tab (the first page that holds it): a lookup, not a search of every page
		owners = [];
		tab.tree.forEach((x, n) => {
			for (let k = x.at; k < x.at + x.parts.length; k++) if (owners && owners[k] === undefined) owners[k] = n;
		});
		partOwners.set(tab, owners);
	}
	const index = owners[at] ?? 0;
	const page = tab.tree[index] as TreePage;
	return { page, part: Math.min(Math.max(0, at - page.at), page.parts.length - 1), index };
}

/** The next activity: its first child, then its next sibling, then back up (SPEC section 3, `parent:`), within its module. Null on the last. */
export function nextOf(na: NavAct): NavAct | null {
	const o = na.mod.order;
	return o[o.indexOf(na) + 1] ?? null;
}

/**
 * One button of the pager: where it leads and what it is called by. `part` is another part of the page on show; `before` the top page
 * before the one on show; `up` the page above it; `next-page` the next page in reading order; `up-activity`, `overview` and
 * `next-activity` leave the tab as 0.6.0 did (the activity above, the module's screen or home, the next activity).
 */
export type PagerStep =
	| { kind: "part"; to: Place }
	| { kind: "before" | "up" | "next-page"; page: TreePage; to: Place }
	| { kind: "up-activity" | "next-activity"; act: NavAct; to: Place }
	| { kind: "overview"; to: Place };

export interface Pager {
	back: PagerStep;
	/** Null on the last part of the tab's last page when no activity follows. */
	next: PagerStep | null;
	/** The part on show within its page, counted from 0, and how many parts the page has. */
	at: number;
	of: number;
	/** Does the tab hold a page line? Then the counter reads "2 of 3" (pages round, call D (b)); else "Page 2 of 3" as 0.6.0 did. */
	pageLines: boolean;
	/** The page on show. */
	page: TreePage;
}

/**
 * Back and Next (design/pages/proposal.md section 3). Back on a later part goes to the part before; on a page's first part it goes up
 * to the page above, else to the top page before it (on its first part), and from the tab's first page it leaves the activity as
 * 0.6.0 did. Next on a part before the last goes to the next part; on a page's last part it goes to the next page in reading order,
 * and from the tab's last page to the next activity. Back and Next never go to another tab. `place` is a resolved one.
 */
export function pagerOf(na: NavAct, tab: ActTab, place: Place): Pager {
	const at = Math.min(place.part, tab.pages.length - 1);
	const { page, part, index } = pageAtPart(tab, at);
	const go = (flat: number): Place => ({ screen: place.screen, tab: place.tab, part: flat });
	const m = na.mod;
	let back: PagerStep;
	if (part > 0) back = { kind: "part", to: go(page.at + part - 1) };
	else if (index === 0) back = na.parent ? { kind: "up-activity", act: na.parent, to: activityPlace(na.parent) } : { kind: "overview", to: hasScreen(m) ? modulePlaceFor(na) : homePlace() };
	else if (page.parent) back = { kind: "up", page: page.parent, to: go(page.parent.at) };
	else {
		const before = tab.top[tab.top.indexOf(page) - 1] ?? (tab.tree[index - 1] as TreePage);
		back = { kind: "before", page: before, to: go(before.at) };
	}
	const following = nextOf(na);
	let next: PagerStep | null = null;
	if (part < page.parts.length - 1) next = { kind: "part", to: go(page.at + part + 1) };
	else if (tab.tree[index + 1]) next = { kind: "next-page", page: tab.tree[index + 1] as TreePage, to: go((tab.tree[index + 1] as TreePage).at) };
	else if (following) next = { kind: "next-activity", act: following, to: activityPlace(following) };
	return { back, next, at: part, of: page.parts.length, pageLines: tab.tree.some((x) => x.named), page };
}

/** The activity a module link names (`[[week-2.booklet]]`: the module `week-2`), if the booklet holds that module with something to show. */
export function moduleNamed(nav: NavModel, name: string): NavMod | null {
	return nav.mods.find((m) => !m.bare && m.id === name && m.acts.length > 0) ?? null;
}

/** The module a link's target names: the file's name before `.booklet`, any `#` part dropped (SPEC section 3). Null when it names none. */
export function moduleLinkName(target: string): string | null {
	const t = target.split("#")[0] ?? "";
	const file = t.split("/").pop() ?? "";
	const m = /^(.+?)\.booklet(?:\.md)?$/i.exec(file);
	if (!m || !m[1]) return null;
	try {
		return decodeURIComponent(m[1]);
	} catch {
		return m[1];
	}
}

/* ---- the words a card and a status line say (the reference renderer's, SPEC: a default is the same everywhere) ---- */

/** A card's title for a module: its words, else for a module of one activity the booklet's title, else the id. */
export function moduleTitle(nav: NavModel, m: NavMod): { title: string; emoji: string | null } {
	if (m.written) return { title: m.title, emoji: m.emoji };
	if (m.acts.length === 1 && nav.title) return { title: nav.title, emoji: null };
	return { title: m.title || m.id, emoji: m.emoji };
}

const isQuestionLike = (s: Segment): boolean => s.type === "question";

interface Progress {
	repeats: boolean;
	kept: number;
	total: number;
	answered: number;
	tracked: boolean;
	started: boolean;
}

function progressOf(na: NavAct, book: Booklet): Progress {
	const a = na.act;
	const repeats = a.repeat;
	const kept = repeats ? (book.records.entries[a.scope]?.[a.id]?.length ?? 0) : 0;
	const qs = repeats ? [] : a.segments.filter(isQuestionLike);
	const ans = book.records.answers[a.scope] ?? {};
	const answered = qs.filter((q) => "id" in q && q.id && holdsSomething(ans[q.id])).length;
	return { repeats, kept, total: qs.length, answered, tracked: repeats || qs.length > 0, started: repeats ? kept > 0 : answered > 0 };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The status line under an activity's card when the file sets none: its reads, its questions, then how far the reader is. "" when it holds none of these. */
export function workedOutStatus(na: NavAct, book: Booklet): string {
	const p = progressOf(na, book);
	const qn = na.act.segments.filter(isQuestionLike).length;
	const state = p.repeats ? (p.kept ? `${p.kept} kept` : "Not started") : !p.total ? "" : p.answered === 0 ? "Not started" : p.answered >= p.total ? "Done" : `${p.answered} of ${p.total} answered`;
	const partial = !p.repeats && p.total > 0 && p.answered > 0 && p.answered < p.total;
	return [na.reads ? plural(na.reads, "read", "reads") : "", qn && !partial ? plural(qn, "question", "questions") : "", state].filter(Boolean).join(" · ");
}

/** An activity card's status: nothing with `status:off`, else the file's own `>` lines (inline Markdown), else the worked-out line. */
export function activityStatus(na: NavAct, book: Booklet): { text: string; md: boolean } {
	if (na.statusOff) return { text: "", md: false };
	if (na.statusMd) return { text: na.statusMd, md: true };
	return { text: workedOutStatus(na, book), md: false };
}

/** A module card's status: "Not started" or "N of M started", counting the activities that hold a question or keep entries; none when none does. */
export function moduleStatus(m: NavMod, book: Booklet): string {
	const ps = m.acts.map((x) => progressOf(x, book)).filter((p) => p.tracked);
	if (!ps.length) return "";
	const n = ps.filter((p) => p.started).length;
	return n ? `${n} of ${ps.length} started` : "Not started";
}

/** The line under a module's opening on its screen: how many activities, and how many are started. */
export function moduleMeta(m: NavMod, book: Booklet): string {
	const n = m.acts.map((x) => progressOf(x, book)).filter((p) => p.tracked && p.started).length;
	return [plural(m.acts.length, "activity", "activities"), n ? `${n} started` : ""].filter(Boolean).join(" · ");
}

/* ---- heading links ---- */

const linkNorm = (s: string) => plainText(s).replace(/\s+/g, " ").trim().toLowerCase();
/** A heading as a link target by its slug (GitHub's and Obsidian's rule: Unicode letters kept, the rest dropped). */
const linkSlug = (s: string) =>
	linkNorm(s.normalize("NFC").replace(/[️‍]/g, ""))
		.replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
		.replace(/\s/g, "-")
		.replace(/^-+|-+$/g, "");

export interface Hit {
	place: Place;
	/** The words of a heading to scroll to once drawn; null when the place is the whole of what is wanted (a title, a tab). */
	heading: string | null;
	/** The heading is in the opening of an activity with tabs, drawn above every tab: the tab and part on show stay. */
	keepTab: boolean;
}

/**
 * A heading link's words (SPEC section 3, "Links between activities"): the first place, in file order, whose heading or title reads
 * them: a module's tab name, an activity's title, a tab's name, a heading, a question's prompt or a callout's title. `scope` is the
 * link's own module ("" for the bare activities); null looks through the whole file (a link from another note belongs to no module).
 * A link to words nothing in its module has is no link: null.
 */
export function findHeading(nav: NavModel, target: string, scope: string | null): Hit | null {
	let want = target;
	try {
		want = decodeURIComponent(target);
	} catch {
		/* a target with a stray % is read as written */
	}
	const w = linkNorm(want);
	const ws = linkSlug(want);
	if (!w && !ws) return null;
	const index = headingIndex(nav);
	// every place whose words read as the link's, by the words and by the slug; the first in file order (then in the order the activity reads them) wins
	let best: Candidate | null = null;
	const consider = (list: readonly Candidate[] | undefined) => {
		for (const c of list ?? []) {
			if (scope !== null && c.module !== scope) continue;
			if (!best || c.rank < best.rank || (c.rank === best.rank && c.seq < best.seq)) best = c;
		}
	};
	consider(index.get(`n:${w}`));
	if (ws) consider(index.get(`s:${ws}`));
	const hit = best as Candidate | null;
	return hit ? { place: { ...hit.hit.place }, heading: hit.hit.heading, keepTab: hit.hit.keepTab } : null;
}

/** One place a heading link can lead to: its rank in file order, its order within its activity, the module it is in, and the hit. */
interface Candidate {
	rank: number;
	seq: number;
	module: string;
	hit: Hit;
}

const headingIndexes = new WeakMap<NavModel, Map<string, Candidate[]>>();

/**
 * Every title and heading a link can name, by its words and by its slug, made once for a note (the note's model does not change): a
 * link then finds its place by a lookup instead of a walk through every activity's every part. The order a link is answered in is the
 * order `findHeading` always read them: a module's tab names and the activities by the line they stand on (a module's tabs first), and
 * within an activity its title, its opening's headings, then tab by tab the tab's name, each page's title and the headings of its parts.
 */
function headingIndex(nav: NavModel): Map<string, Candidate[]> {
	const have = headingIndexes.get(nav);
	if (have) return have;
	const index = new Map<string, Candidate[]>();
	const entries: { line: number; add: (rank: number) => void }[] = [];
	const put = (rank: number, seq: number, module: string, text: string, hit: Hit) => {
		const c: Candidate = { rank, seq, module, hit };
		const keys = [`n:${linkNorm(text)}`];
		const slug = linkSlug(text);
		if (slug) keys.push(`s:${slug}`);
		for (const k of keys) {
			const list = index.get(k);
			if (list) list.push(c);
			else index.set(k, [c]);
		}
	};
	for (const mod of nav.mods) {
		if (hasScreen(mod))
			for (const t of mod.tabs) entries.push({ line: mod.line, add: (rank) => put(rank, 0, mod.id, t.title, { place: { screen: modScreen(mod), tab: t.id, part: 0 }, heading: null, keepTab: false }) });
		for (const na of mod.acts) entries.push({ line: na.line, add: (rank) => addActivity(na, mod.id, rank, put) });
	}
	entries.sort((a, b) => a.line - b.line);
	entries.forEach((e, rank) => e.add(rank));
	headingIndexes.set(nav, index);
	return index;
}

function addActivity(na: NavAct, module: string, rank: number, put: (rank: number, seq: number, module: string, text: string, hit: Hit) => void): void {
	const own = (tab: string | null, part: number, heading: string | null, keepTab = false): Hit => ({ place: { screen: actScreen(na), tab, part }, heading, keepTab });
	let seq = 0;
	const bar = barTabs(na);
	for (const text of [na.title, na.act.title]) put(rank, seq, module, text, own(bar[0]?.id ?? null, 0, null));
	seq++;
	const look = (segs: readonly Segment[], tab: string | null, part: number, keepTab: boolean) => {
		for (const s of segs) {
			if (s.type === "question" && s.title) put(rank, seq++, module, s.title, own(tab, part, s.title, keepTab));
			if (s.type === "prose") for (const h of proseHeadings(s.markdown)) put(rank, seq++, module, h, own(tab, part, h, keepTab));
		}
	};
	if (na.named) look(na.opening, null, 0, true);
	for (const t of na.tabs) {
		const tabId = bar.length ? t.id : null;
		if (na.named) put(rank, seq++, module, t.title, own(tabId, 0, null));
		const starts = new Map<number, TreePage>();
		for (const x of t.tree) if (x.named && !starts.has(x.at)) starts.set(x.at, x);
		for (let p = 0; p < t.pages.length; p++) {
			// a page's title is a place too: it opens the page on its first part
			const pg = starts.get(p);
			if (pg) {
				put(rank, seq, module, pg.title, own(tabId, p, null));
				put(rank, seq++, module, pg.written, own(tabId, p, null));
			}
			look(t.pages[p] ?? [], tabId, p, false);
		}
	}
}

/** The words a piece of prose offers as link targets, in order: its headings and its callouts' titles, outside code fences. */
function proseHeadings(markdown: string): string[] {
	const out: string[] = [];
	const lines = markdown.split("\n");
	const fenced = fencedLines(lines);
	for (const [i, l] of lines.entries()) {
		if (fenced[i]) continue;
		const h = HEADING_WORDS.exec(l);
		if (h && h[1]) out.push(h[1]);
		else if (CALLOUT_ANY.test(l)) {
			const c = CALLOUT_LINE.exec(l);
			if (c && c[4] && c[4].trim()) out.push(c[4].trim());
		}
	}
	return out;
}

/* ---- the tree's own surfaces: the menu's search, and "Mentioned on" (page trees; design/pages/proposal.md section 3, decision 6 calls F and K) ---- */

/** The words of a page as plain text, for the search: its prose and the prompts of its questions. */
function pageWords(p: TreePage): string {
	const out: string[] = [];
	for (const part of p.parts)
		for (const s of part) {
			if (s.type === "prose") out.push(plainText(s.markdown));
			else if (s.type === "question" && s.title) out.push(plainText(s.title));
		}
	return out.join(" ");
}

/** The words of a search box's text: case and marks aside, none when it holds only spaces or marks. */
export const searchWords = (query: string): string[] => linkNorm(query).split(" ").filter(Boolean);

/**
 * The pages of a tab whose title or words hold every word of `query` (case and marks aside), the ones whose title holds them first, then
 * the rest, each in reading order. A query of no words is every page, as the tree reads.
 */
export function searchPages(tab: ActTab, query: string): TreePage[] {
	const words = searchWords(query);
	if (!words.length) return tab.tree;
	const inTitle: TreePage[] = [];
	const inWords: TreePage[] = [];
	for (const p of tab.tree) {
		const title = linkNorm(p.title);
		if (words.every((w) => title.includes(w))) inTitle.push(p);
		else if (words.every((w) => `${title} ${linkNorm(pageWords(p))}`.includes(w))) inWords.push(p);
	}
	return [...inTitle, ...inWords];
}

/**
 * The target of every heading link in some Markdown, in order: `[[#Words]]`, `[[#Words|label]]` and `[label](#words)`. A block link (`#^id`)
 * is none. What is not text a reader sees is left out, as far as a short scan can tell: a code fence, inline code, an HTML comment, a
 * `<pre>` block, a `$$` math block and an indented code block (four spaces or a tab after a blank line, outside a list).
 */
export function headingLinksIn(markdown: string): string[] {
	const out: string[] = [];
	const lines = markdown.split("\n");
	const fenced = fencedLines(lines);
	let comment = false;
	let math = false;
	let pre = false;
	let code = false;
	let list = false;
	let blank = true;
	for (const [i, raw] of lines.entries()) {
		if (fenced[i]) continue;
		let l = raw;
		if (comment) {
			const end = l.indexOf("-->");
			if (end < 0) continue;
			l = l.slice(end + 3);
			comment = false;
		}
		l = l.replace(/<!--[\s\S]*?-->/g, "");
		const open = l.indexOf("<!--");
		if (open >= 0) {
			l = l.slice(0, open);
			comment = true;
		}
		if (pre) {
			if (/<\/pre>/i.test(l)) pre = false;
			continue;
		}
		if (/<pre[\s>]/i.test(l) && !/<\/pre>/i.test(l)) {
			pre = true;
			continue;
		}
		if (math) {
			if (l.includes("$$")) math = false;
			continue;
		}
		l = l.replace(/\$\$[^$]*\$\$/g, "");
		const dollars = l.indexOf("$$");
		if (dollars >= 0) {
			l = l.slice(0, dollars);
			math = true;
		}
		if (!l.trim()) {
			blank = true;
			continue;
		}
		const indented = /^( {4,}|\t)/.test(l);
		if (indented && (code || (blank && !list))) {
			code = true;
			blank = false;
			continue;
		}
		code = false;
		blank = false;
		list = /^\s*(?:[-*+]|\d+[.)])\s/.test(l) || (list && indented);
		for (const m of l.replace(/`[^`]*`/g, "").matchAll(/(?<!!)\[\[#([^\]|#]+)(?:\|[^\]]*)?\]\]|\]\(#([^)\s]+)\)/g)) {
			const t = m[1] ?? m[2];
			if (t && !t.startsWith("^")) out.push(t);
		}
	}
	return out;
}

/** One place that links to a page: how to name it, and where it leads. */
export interface Mention {
	title: string;
	place: Place;
}

const mentionCache = new WeakMap<NavModel, Map<string, Mention[]>>();
const pageKey = (screen: string, tab: string | null, at: number) => `${screen}|${tab ?? ""}|${at}`;

/**
 * "Mentioned on": the pages whose words hold a heading link that opens the page, from anywhere in the link's module (call K: every link
 * that opens the page; the same search the view follows a link by). A link in an activity's opening, which stands above every tab, is
 * the activity's. A page does not mention itself, and a source is listed once. In reading order.
 */
export function mentionsOf(nav: NavModel, na: NavAct, tab: ActTab, page: TreePage): Mention[] {
	let all = mentionCache.get(nav);
	if (!all) {
		all = new Map();
		mentionCache.set(nav, all);
		const listed = new Set<string>();
		for (const mod of nav.mods)
			for (const src of mod.acts) {
				const bar = barTabs(src);
				const from: { md: string; label: (target: NavAct, targetTab: ActTab) => string; place: Place; same: (target: NavAct, targetTab: ActTab, targetPage: TreePage) => boolean }[] = [];
				const add = (markdown: string, t: ActTab | null, pg: TreePage | null) => {
					const place: Place = t && pg ? { screen: actScreen(src), tab: bar.length ? t.id : null, part: pg.at } : activityPlace(src);
					from.push({
						md: markdown,
						place,
						same: (target, targetTab, targetPage) => !!t && !!pg && target === src && targetTab === t && targetPage === pg,
						label: (target, targetTab) => {
							const bits = [target !== src || !t ? src.title : "", t && bar.length > 1 && (target !== src || targetTab !== t) ? t.title : "", pg ? pg.title : ""].filter(Boolean);
							return bits.filter((b, i) => b !== bits[i - 1]).join(" › ");
						},
					});
				};
				const open = src.opening.flatMap((s) => (s.type === "prose" ? [s.markdown] : [])).join("\n\n");
				if (open.trim()) add(open, null, null);
				for (const t of src.tabs) for (const pg of t.tree) add(pg.parts.flatMap((part) => part.flatMap((s) => (s.type === "prose" ? [s.markdown] : []))).join("\n\n"), t, pg);
				for (const [n, f] of from.entries())
					for (const target of headingLinksIn(f.md)) {
						const hit = findHeading(nav, target, mod.id);
						if (!hit || hit.keepTab || !hit.place.screen.startsWith("activity:")) continue;
						const at = resolvePlace(nav, hit.place);
						const ta = nav.byKey.get(at.screen.slice(9));
						const tt = ta ? tabShown(ta, at.tab) : null;
						if (!ta || !tt) continue;
						const tp = pageAtPart(tt, at.part).page;
						if (f.same(ta, tt, tp)) continue;
						const key = pageKey(at.screen, at.tab, tp.at);
						const list = all.get(key) ?? [];
						const once = `${key}#${mod.id}/${src.key}#${n}`;
						if (!listed.has(once)) {
							listed.add(once);
							list.push({ title: f.label(ta, tt), place: f.place });
						}
						all.set(key, list);
					}
			}
	}
	return all.get(pageKey(actScreen(na), barTabs(na).length ? tab.id : null, page.at)) ?? [];
}
