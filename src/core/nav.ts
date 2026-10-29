/*
 * The booklet's navigation model (SPEC 0.16 section 3): what a booklet shows one screen at a time. It reads the parts
 * of the design the reader (reader.ts) does not keep, from the note's own lines: a card's picture, blurb and status
 * line, `parent:` and `tab:`, a module's tabs and notice, and the page breaks inside an activity. It also holds
 * the rules for where a booklet opens, what is next, where a heading link leads, and how a saved place is read back.
 * Plain TypeScript: nothing here imports Obsidian, and nothing here ever writes the note.
 */
import { BLOCK_ID_LINE, CALLOUT_ANY, CALLOUT_LINE, FENCE_OPEN, bodyEnd, calloutWords, fenceEnd, fencedLines, isBlank, splitLines } from "./lines";
import { treeOf, questionsIn } from "./blocks";
import { COMMON_KINDS, HEADING_WORDS, isThematicBreak, kvLine, openingMarkdown, type Activity, type Booklet, type Segment } from "./reader";
import { holdsSomething } from "./shape";

/* ---- places ---- */

export const HOME = "home";

/** The version written with a saved place: a later release can tell a place that came from this one (view state). */
export const PLACE_VERSION = 1;

/**
 * Where the reader is: the screen (`home`, `module:<id>` or `activity:<module id>/<activity id>`, the module id empty
 * for a bare activity), the tab on show (a tab's id, null where the screen has no tab bar), and the part of the tab on
 * show, counted from 0 (a stretch between page breaks: SPEC's "page", the pages round's working word).
 */
export interface Place {
	screen: string;
	tab: string | null;
	part: number;
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

/** A place as the view saves it: `{ version, screen, tab, part }`, `tab` left out when there is none. */
export function placeState(p: Place): { version: number; screen: string; tab?: string; part: number } {
	return { version: PLACE_VERSION, screen: p.screen, ...(p.tab ? { tab: p.tab } : {}), part: p.part };
}

/** A place read back from a saved view state: null when it is not one this release wrote (another version, or not a place). */
export function placeFrom(state: unknown): Place | null {
	if (!state || typeof state !== "object") return null;
	const s = state as Record<string, unknown>;
	if (s["version"] !== PLACE_VERSION || typeof s["screen"] !== "string" || !s["screen"]) return null;
	const part = s["part"];
	const tab = s["tab"];
	return {
		screen: s["screen"],
		tab: typeof tab === "string" && tab ? tab : null,
		part: typeof part === "number" && Number.isInteger(part) && part >= 0 ? part : 0,
	};
}

/* ---- the model ---- */

/** One tab of an activity: its pages (the stretches between page breaks, empty ones left out). An activity with no tab line has one, unnamed. */
export interface ActTab {
	id: string;
	title: string;
	pages: Segment[][];
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

/** A tab's id: the one written after the bar, else its name as SPEC section 3 makes an id of it (`n` is its place, for a name that leaves nothing). */
export function tabIdOf(name: string, n: number): string {
	const id = name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");
	return id || `tab-${n}`;
}

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
	/** A row is open: it does not cross a page break, so a break closes it (SPEC section 3, "Rows"). */
	let row = false;
	const page = () => pages[pages.length - 1] as Segment[];
	for (const s of segs) {
		if (s.type === "callout") depth++;
		else if (s.type === "callout-end") depth--;
		else if (s.type === "row") row = !s.end;
		if (s.type !== "prose" || depth > 0) {
			page().push(s);
			continue;
		}
		let at = 0;
		splitAtBreaks(s.markdown).forEach((ls, n) => {
			if (n) {
				if (row) {
					page().push({ type: "row", end: true, line: s.line + at });
					row = false;
				}
				pages.push([]);
			}
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
			} else if (!NOT_IN_AN_OPENING.has(kind)) into.push(...lines.slice(i, k));
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
		const raw: { id: string | null; title: string; segs: Segment[] }[] = [];
		for (const s of a.segments) {
			if (s.type === "tab") {
				const tm = CALLOUT_LINE.exec(lines[s.line - 1] ?? "");
				raw.push({ id: calloutWords("tab", tm?.[2]).id, title: s.title, segs: [] });
			} else if (raw.length) (raw[raw.length - 1] as (typeof raw)[number]).segs.push(s);
			else opening.push(s);
		}
		const ids = uniqueIds(raw.map((r, n) => r.id ?? tabIdOf(r.title, n + 1)));
		const tabs: ActTab[] = raw.length
			? raw.map((r, n) => ({ id: ids[n] as string, title: r.title, pages: pagesOf(r.segs) }))
			: [{ id: "", title: "", pages: pagesOf(opening) }];
		const first = a.segments[0];
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
	return { title: book.title, startHome: (book.frontMatter["start"] ?? "").trim() === "home", mods, byKey, cards };
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
	const shown = bar.length ? (bar.find((t) => t.id === tab) as ActTab) : (a.tabs[0] as ActTab);
	return { screen: p.screen, tab, part: Math.min(Math.max(0, p.part), Math.max(0, shown.pages.length - 1)) };
}

/** The next activity: its first child, then its next sibling, then back up (SPEC section 3, `parent:`), within its module. Null on the last. */
export function nextOf(na: NavAct): NavAct | null {
	const o = na.mod.order;
	return o[o.indexOf(na) + 1] ?? null;
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
	const is = (s: string) => {
		const n = linkNorm(s);
		return n === w || (!!ws && linkSlug(s) === ws);
	};
	type Entry = { line: number; hit: () => Hit | null };
	const entries: Entry[] = [];
	for (const mod of nav.mods) {
		if (scope !== null && mod.id !== scope) continue;
		if (hasScreen(mod))
			for (const t of mod.tabs) if (is(t.title)) entries.push({ line: mod.line, hit: () => ({ place: { screen: modScreen(mod), tab: t.id, part: 0 }, heading: null, keepTab: false }) });
		for (const na of mod.acts) entries.push({ line: na.line, hit: () => inActivity(na, is) });
	}
	entries.sort((a, b) => a.line - b.line);
	for (const e of entries) {
		const h = e.hit();
		if (h) return h;
	}
	return null;
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

function inActivity(na: NavAct, is: (s: string) => boolean): Hit | null {
	const own = (tab: string | null, part: number, heading: string | null, keepTab = false): Hit => ({ place: { screen: actScreen(na), tab, part }, heading, keepTab });
	const bar = barTabs(na);
	if (is(na.title) || is(na.act.title)) return own(bar[0]?.id ?? null, 0, null);
	const look = (segs: readonly Segment[], tab: string | null, part: number, keepTab: boolean): Hit | null => {
		for (const s of segs) {
			if (s.type === "question" && s.title && is(s.title)) return own(tab, part, s.title, keepTab);
			if (s.type === "prose") for (const h of proseHeadings(s.markdown)) if (is(h)) return own(tab, part, h, keepTab);
		}
		return null;
	};
	if (na.named) {
		const o = look(na.opening, null, 0, true);
		if (o) return o;
	}
	for (const t of na.tabs) {
		const tabId = bar.length ? t.id : null;
		if (na.named && is(t.title)) return own(tabId, 0, null);
		for (let p = 0; p < t.pages.length; p++) {
			const h = look(t.pages[p] ?? [], tabId, p, false);
			if (h) return h;
		}
	}
	return null;
}
