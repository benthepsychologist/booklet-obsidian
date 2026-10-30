/*
 * Reads a booklet's design: its front matter and marker, its module fences, the booklet's and each
 * module's opening, its activities, the common question kinds (choice, multi, scale, text, lines,
 * number, date, matrix), the widget questions with the widget blocks they embed, the shared menus a choice
 * or a multi takes its options from, and the queries an activity's prose holds, with what each reads.
 * Everything else is recorded, by kind and title, as not yet supported. Plain TypeScript: nothing here
 * imports Obsidian.
 */
import {
	CALLOUT_ANY,
	CALLOUT_LINE,
	BLOCK_ID_LINE,
	FENCE_OPEN,
	ID_PATTERN,
	bodyEnd,
	calloutWords,
	earlierValue,
	fenceEnd,
	isBlank,
	settingProblems,
	splitLines,
} from "./lines";
import { readDataRows, type DataRows } from "./data";
import { readRecords, regionMask, findRegions, type RecordsRead } from "./records";
import { shapeIssue } from "./shape";

/** A block or a menu by its id, as a module sees it: in its own module first, then a shared one (`module` null), never another module's. */
function inScope<T extends { id: string; module: string | null }>(list: readonly T[], id: string, module: string | null): T | undefined {
	return list.find((x) => x.id === id && x.module === module) ?? list.find((x) => x.id === id && x.module === null);
}

/** A thematic break line: three or more of one of `-`, `*`, `_`, with spaces between allowed. */
export const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/**
 * Is this line a thematic break, as Markdown reads it? A run of hyphens straight under a line of text is that line's heading
 * underline instead; `- - -` (spaces between the hyphens) is no underline, so it breaks even there.
 */
export function isThematicBreak(line: string, textAbove: boolean): boolean {
	return THEMATIC_BREAK.test(line) && !(textAbove && /^ {0,3}-+[ \t]*$/.test(line));
}

export const FORMAT_VERSION = "0.16";
/** The marker of the next format, whose page lines this view reads ahead of SPEC (page trees; design/pages/proposal.md). */
export const NEXT_FORMAT = "0.17";

export interface Option {
	text: string;
	/** `[x]`: a correct option in a study booklet. Never an answer given. */
	correct: boolean;
	/** The option's reply: the bullets nested under it, one line each, as inline Markdown. Content, never an answer. */
	reply: string[];
}

export interface Anchor {
	/** The number as written: it is the stored answer. */
	n: number;
	text: string;
}

/** The question kinds this plugin draws and answers besides a widget: the seven common ones, and a matrix (SPEC section 5). */
export const COMMON_KINDS = ["choice", "multi", "scale", "text", "lines", "number", "date", "matrix"] as const;
/** The question kinds this plugin draws and answers: the common ones, and a widget (SPEC section 7). */
export type QuestionKind = (typeof COMMON_KINDS)[number] | "widget";

/**
 * A `booklet widget` block: JSON data, never code (SPEC section 7). It belongs to the module whose fence
 * holds it, or whose data section (`> [!data|module-id]`) it sits in; `module` is null for a shared one
 * (outside every fence, or in the plain data section), as booklet.html reads it.
 */
export interface WidgetBlock {
	id: string;
	module: string | null;
	/** The block's JSON object, as read. */
	data: Record<string, unknown>;
	line: number;
}

/**
 * A `booklet data` block with its block id: `module` as for a widget block. Its rows are read once (data.ts) and drawn by a
 * query that names the block; the block is never written. A block that cannot be read is reported and is not here.
 */
export interface DataBlock extends DataRows {
	id: string;
	module: string | null;
	line: number;
}

/** A shared menu (`> [!menu|id]` and its bullets): `module` as for a widget block. */
export interface MenuBlock {
	id: string;
	module: string | null;
	/** Each bullet's words, inline Markdown. */
	items: string[];
	line: number;
}

/**
 * The booklet's opening (`module` null) or a module's (SPEC section 3): the prose and reading callouts
 * before the file's first module or activity line, or inside a module's fence before its first activity
 * (its notice and tab lines aside). `title` is what the opening stands under: the booklet's front matter
 * title or the module's title. A leading heading that repeats it is taken out of `markdown`, since the
 * title is drawn once (SPEC section 3).
 */
export interface Opening {
	module: string | null;
	title: string;
	markdown: string;
	line: number;
}

export interface Question {
	type: "question";
	kind: QuestionKind;
	id: string;
	title: string;
	/** The `>` lines under the question line, as Markdown. */
	help: string;
	line: number;
	/** A choice's or a multi's options, in order: an answer is a position from 1. */
	options: Option[];
	/** A scale's or a matrix's anchors: an answer is an anchor's number. */
	anchors: Anchor[];
	/** A matrix's items (inline Markdown), the bulleted list under its line: its answer holds one anchor number for each, by position. */
	items: string[];
	/** A text's `long`: a bigger box. */
	long: boolean;
	/** A choice's or a multi's `open`: the reader may add options of their own, stored as their words. */
	open: boolean;
	/** A number's `min:`, `max:` and `step:`, when they are numbers. */
	min: number | null;
	max: number | null;
	step: number | null;
	/** A choice's or a multi's shared menu (`menu:id`) when its options came from it, else null. Its answers are positions in the menu. */
	menu: string | null;
	/** A widget question: the block id its body embeds (`![[#^id]]`). */
	embed: string | null;
	/** The widget block found for the embed, looked up as SPEC section 4 says (its own module, then the shared blocks); null when there is none. */
	widget: WidgetBlock | null;
	/** A widget line's `readonly` (shown, not operated) and `describe` (what each part says about itself). */
	readonly: boolean;
	describe: boolean;
	/**
	 * A question's `each:<id>`, when the setting holds (see readEach): the id of its source, a choice, a multi or a widget
	 * in the same activity. The question, of any kind, is asked once for each pick in the source's answer, and its answer
	 * is a list of `{ "pick", "a" }` pairs, `a` the answer its kind stores (SPEC section 5, "A question asked for each
	 * pick"). Null otherwise.
	 */
	each: string | null;
	/**
	 * `earlier:<n>` on a choice, a multi, a lines or a widget line (SPEC section 5, "Words the reader wrote before"):
	 * how many of the reader's earlier words are offered at each place. Null when the line does not set it
	 * or sets a value that is not digits (reported), and the question offers its default: 12 for own options and a
	 * body widget's places, none for a lines question.
	 */
	earlier: number | null;
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

/**
 * A named page (page trees, ahead of the format: format 0.17, not yet in SPEC): `> [!page|id parent:x icon:name] Title` starts a page of
 * the tab it stands in, which runs to the next page, tab, activity or module line. The tree it makes is built by core/nav.ts.
 */
export interface PageHeading {
	type: "page";
	/** The id written after the bar and valid, else null (the page's id is then made from its title, by nav.ts). */
	id: string | null;
	/** The title as written: inline Markdown, "" when the line has none. */
	title: string;
	/** `parent:`, the id of the page it sits under in the same tab, as written; null when there is none. */
	parent: string | null;
	/** `icon:` as written (a name in Booklet's set is drawn; the view checks). */
	icon: string | null;
	line: number;
}

export interface Unsupported {
	type: "unsupported";
	/** The line's kind: one this plugin does not draw yet, or a question kind written with no id (a group, or a callout that holds a question, is read as a callout and is not this). */
	kind: string;
	id: string | null;
	title: string;
	line: number;
}

/* ---- queries (SPEC section 6, "Queries: showing kept entries and data" and "A span of days, and summaries") ---- */

/** A query's fifteen keys (written as one string, so that no line here reads as an import to test/safety.test.mjs). */
export const QUERY_KEYS: readonly string[] = "from as fields group limit parent empty label value note badge tone link icon summary".split(" ");
/** The six views. */
export const QUERY_VIEWS = ["cards", "table", "list", "tiles", "bars", "line"] as const;
export type ViewName = (typeof QUERY_VIEWS)[number];
/** The seven roles a field plays in a row, each read from the field of its own name unless the query names another. */
export const ROLE_NAMES = ["label", "value", "note", "badge", "tone", "link", "icon"] as const;
export type Role = (typeof ROLE_NAMES)[number];

/** A `booklet query` block's settings, as read: a key that was ignored (and reported) is not here. */
export interface Query {
	from: string;
	as: ViewName | null;
	/** `fields:`, comma-separated, in order. */
	fields: string[] | null;
	empty: string | null;
	/** `limit: 7`: the first (for kept entries, the newest) that many rows. */
	limit: number | null;
	/** `limit: 7 days`: the entries of today and the 6 dates before it. */
	days: number | null;
	/** `summary: on`. */
	summary: boolean;
	group: string | null;
	parent: string | null;
	/** The roles the query points at a field of another name (`label: bucket`). */
	roles: Partial<Record<Role, string>>;
}

/** What a query reads: an activity's kept entries, one question's answers, or a data block's rows. */
export type QuerySource =
	| { kind: "activity"; act: Activity }
	| { kind: "question"; act: Activity; q: Question; id: string; title: string }
	| { kind: "data"; id: string; block: DataBlock };

export interface QuerySegment {
	type: "query";
	line: number;
	query: Query;
	/** Found once the whole file is read; a query whose source cannot be found is reported and not drawn. */
	source: QuerySource | null;
}

/**
 * A callout that holds Booklet lines, opened (SPEC section 6, "A group holds blocks"): a `group` always, and any other
 * reading callout that has a question inside it. The segments of its body follow, up to the matching `CalloutEnd`; a
 * callout inside it opens and closes in the same way. A body is read with one `>` less, as the activity's own text is.
 */
export interface CalloutStart {
	type: "callout";
	kind: string;
	title: string;
	/** The fold marker after the bracket: `-` starts folded, `+` starts open, empty is no fold. */
	fold: "" | "-" | "+";
	line: number;
}

export interface CalloutEnd {
	type: "callout-end";
}

/**
 * A row's opening line or its closing line (`> [!row]`, `> [!row|end]`; SPEC section 3, "Rows"): what is between them is
 * laid side by side where there is room.
 */
export interface RowMark {
	type: "row";
	end: boolean;
	line: number;
}

export type Segment = Question | Prose | TabHeading | PageHeading | Unsupported | QuerySegment | CalloutStart | CalloutEnd | RowMark;

/**
 * A footnote's definition, `[^id]: …` (SPEC section 6, "Citations"), read where the file puts it and never drawn as
 * prose. `scope` is the module it is in ("" for the bare activities), or null in a plain data section, which every
 * module may use for an id it does not define itself.
 */
export interface Note {
	id: string;
	scope: string | null;
	/** The note's words as written, one paragraph, as inline Markdown. */
	text: string;
	line: number;
	/** What the pattern `*Title*, details, p. N: "quote" Verified YYYY-MM-DD.` read out of it, when the note fits it. */
	source: { title: string; detail: string; page: string; quote: string; verified: string } | null;
}

export interface Activity {
	id: string;
	title: string;
	/** The module the activity is in, or "" for a bare activity (the module with no name). */
	scope: string;
	line: number;
	/** `repeat`: each completion is kept as a dated entry; what is typed is kept as its draft until then. */
	repeat: boolean;
	/** `repeat daily`: one kept entry per day; completing again replaces today's. */
	daily: boolean;
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
	/** The booklet's opening and each module's, in file order. */
	openings: Opening[];
	widgets: WidgetBlock[];
	menus: MenuBlock[];
	/** The footnotes' definitions, in file order. */
	notes: Note[];
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

/** [major, minor] for a marker like "0.16", else null. 0.10 is later than 0.9. */
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

/**
 * What decides whether the view must draw a note again: its design, with the records region(s) and the
 * blank lines and spaces at its end left out. A first answer adds one blank line between the body and
 * the new records region; that line changes nothing that is drawn, so it is not a change of design.
 */
export const designKey = (text: string): string => designText(text).replace(/\s+$/, "");

/* ---- the design ---- */

const QUESTION_KINDS = new Set(["text", "lines", "widget", "choice", "multi", "scale", "number", "date", "matrix"]);
/** Every kind the format defines (SPEC section 4's table). */
const KNOWN_KINDS = new Set([
	"module", "activity", "row", "text", "lines", "scale", "matrix", "date", "menu", "hint", "solution", "data",
	"records", "manifest", "notice", "group", "diff", "law", "opinion", "tab", "choice", "multi", "number", "widget",
]);

/** The callout kinds Obsidian itself draws (and its aliases): a line of one of these is an ordinary callout, never a kind of a newer format. */
const OBSIDIAN_CALLOUTS = new Set([
	"note", "abstract", "summary", "tldr", "info", "todo", "tip", "hint", "important", "success", "check", "done", "question", "help", "faq",
	"warning", "caution", "attention", "failure", "fail", "missing", "danger", "error", "bug", "example", "quote", "cite",
]);

/** The kinds of line that make structure: none can go inside a callout's body (SPEC section 6, "A group holds blocks"). */
const STRUCTURE_KINDS = new Set(["module", "activity", "tab", "row", "data", "records"]);
/** A footnote's definition line: `[^id]: words`. */
const NOTE_DEF = /^ {0,3}\[\^([A-Za-z0-9][A-Za-z0-9_.:-]*)\]:[ \t]*(.*)$/;
/** A page or a place in a footnote's details: `p. 12`, `pp. 12-14`, `art. 14`. */
const PLACE_WORDS = /^(?:p|pp|art|sec|ch|para)\.[ \t]*\S|^§/i;

/**
 * What a footnote's words read out as a source and a citation, where they fit the pattern
 * `*Title*, details, p. N: "quote" Verified YYYY-MM-DD.` (SPEC section 6, "A footnote's note, read into a citation"; the
 * title and the quote are required, the rest optional); null when they do not, and the note is a plain reference.
 */
export function sourceOfNote(text: string): Note["source"] {
	const m = /^\*([^*]+)\*[ \t]*(?:,[ \t]*([^:]*?))?[ \t]*:[ \t]*["\u201C](.+)["\u201D][ \t]*(?:Verified[ \t]+(\d{4}-\d{2}-\d{2})\.?)?[ \t]*$/.exec(text.trim());
	if (!m) return null;
	const parts = (m[2] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
	const last = parts[parts.length - 1];
	const page = last && PLACE_WORDS.test(last) ? (parts.pop() as string) : "";
	return { title: (m[1] ?? "").trim(), detail: parts.join(", "), page, quote: (m[3] ?? "").trim(), verified: m[4] ?? "" };
}

const isCommon = (k: string): k is QuestionKind => (COMMON_KINDS as readonly string[]).includes(k);

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
			items.push({ text: (m[2] ?? "").trim(), correct: /[xX]/.test(m[1] ?? ""), reply: [] });
			at = textColOf(ln);
			bullet = -1;
			continue;
		}
		const b = /^[ \t]*[-*+][ \t]+(.*)$/.exec(ln);
		const ind = indentOf(ln);
		if (!items.length || !ln.trim()) break;
		const reply = items[items.length - 1]!.reply;
		if (b && ind >= at) {
			bullet = ind;
			reply.push((b[1] ?? "").trim()); // each nested bullet is one line of the reply
			continue;
		}
		if (!b && bullet >= 0 && ind > bullet) {
			if (reply.length) reply[reply.length - 1] += " " + ln.trim(); // a deeper line goes on with the line above
			continue;
		}
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

/** The embed in a widget line's body that names its data block (booklet.html's widget question). */
const WIDGET_EMBED = /!\[\[[^\]#|]*#\^([A-Za-z0-9-]+)[^\]]*\]\]/;
/** A heading line's words, trailing spaces and marks off (booklet.html HEADING_WORDS). */
export const HEADING_WORDS = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/;
/** The scope of the ids of menus shared by every module (outside every fence, or in the plain data section). */
const SHARED = "\u0000shared";

/** Inline Markdown's words without their marks, compared without case or the spaces around them. */
const plainWords = (md: string): string =>
	md
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
		.replace(/[*_~=`]/g, "")
		.replace(/\\(.)/g, "$1")
		.trim()
		.toLowerCase();

/** An opening's lines as Markdown: the blank lines around it off, and a leading heading that repeats `title` off too. */
export function openingMarkdown(ls: readonly string[], title: string): string {
	let from = 0;
	let to = ls.length;
	while (from < to && isBlank(ls[from])) from++;
	while (to > from && isBlank(ls[to - 1])) to--;
	const h = from < to ? HEADING_WORDS.exec(ls[from] ?? "") : null;
	if (h && title && plainWords(h[1] ?? "") === plainWords(title)) {
		from++;
		while (from < to && isBlank(ls[from])) from++;
	}
	return ls.slice(from, to).join("\n");
}

/** A question line with an `each:` setting, as read: `source` is the id the setting names. */
interface EachUse {
	q: Question;
	act: Activity;
	source: string;
	line: number;
}

/** The kinds a source of `each:` may be: their picks are identities, added and taken away but never edited. */
const SOURCE_KINDS = new Set(["choice", "multi", "widget"]);

/**
 * `each:<id>` on a question line (SPEC section 5, "A question asked for each pick"): the question is asked
 * once for each pick in its source's answer. The setting holds when it names a choice, a multi or a widget in the
 * same activity, not the question itself, and one level only: the source has no `each:` of its own (the question
 * that names such a source is the one reported; the source keeps its own). One that does not hold is reported and
 * ignored, and the question is drawn as its kind. A question of any kind follows its source.
 */
function readEach(uses: readonly EachUse[], problems: string[]): void {
	for (const u of uses) {
		const { q, act, source } = u;
		if (!act.segments.includes(q)) continue; // not drawn (its shared menu was not found), already said
		const said = `Line ${u.line}: the ${q.kind} "${q.id}" is to be asked for each pick`;
		const ignored = "so its each: is ignored";
		const src = act.segments.find((x) => (x.type === "question" || x.type === "unsupported") && x.id === source);
		const why = !source
			? `${said}, and its each: names nothing, ${ignored}.`
			: source === q.id
				? `${said} of itself, ${ignored}.`
				: !src
					? `${said} of "${source}", which is no question or widget in its activity, ${ignored}.`
					: uses.some((o) => o.act === act && o.q.id === source)
						? `${said} of "${source}", which is itself asked for each pick of another (one level only), ${ignored}.`
						: src.type !== "question" || !SOURCE_KINDS.has(src.kind)
							? `${said} of "${source}", a ${src.type === "question" || src.type === "unsupported" ? src.kind : "part"}: only a choice, a multi or a widget can be a source, ${ignored}.`
							: null;
		if (why) {
			problems.push(why);
			continue;
		}
		q.each = source;
	}
}

/**
 * In an activity with tab lines, what comes before the first one is the activity's opening, drawn above every tab, so it cannot be a
 * page of any one tab: a page line there is said and ignored, and what follows it is drawn as the opening it is in (page trees; the
 * pages round, 2.6).
 */
function dropOpeningPages(act: Activity, problems: string[]): void {
	const firstTab = act.segments.findIndex((s) => s.type === "tab");
	if (firstTab <= 0) return;
	act.segments = act.segments.filter((s, n) => {
		if (n >= firstTab || s.type !== "page") return true;
		problems.push(`Line ${s.line}: a page line in the opening that every tab shows, before the activity's first tab line, belongs to no tab, so it was ignored.`);
		return false;
	});
}

/**
 * Reads a booklet. Never throws on a file's content: what it cannot read goes into `problems`, and a
 * file it must refuse (no marker, a non-0.x marker, broken module fences, an id used twice in a
 * module) comes back with `ok: false` and the reason, still with whatever structure was found.
 */
export function parseBooklet(text: string): Booklet {
	/** The file's lines; while a callout's body is read it is the file's lines with that body's `>` taken off, down to the body's end. */
	let lines = splitLines(text).map((l) => l.text);
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
	let pagesMarker = false;
	let unread = 0;
	if (!marker) refusals.push("This note has no booklet: marker in its front matter, so it is not a booklet.");
	else if (!ver || ver[0] !== 0) refusals.push(`This note says booklet: ${marker}, which is not a 0.x version, so it is not a booklet for format ${FORMAT_VERSION}.`);
	else if (marker === NEXT_FORMAT)
		// page trees are ahead of the format: this view draws what 0.17's page lines say, so it says nothing of the marker unless the file
		// then holds a line or a setting this view does not read (counted in `unread`, and said at the end)
		pagesMarker = true;
	else if (marker !== FORMAT_VERSION)
		problems.push(`This file says booklet: ${marker}. This view reads format ${FORMAT_VERSION} and has opened it as it is; some of it may not draw.`);

	const regions = findRegions(lines, fm.bodyStart);
	const inRegion = regionMask(lines.length, regions);
	const modules: Module[] = [];
	const activities: Activity[] = [];
	const idsByScope = new Map<string, Set<string>>();
	const notes: Note[] = [];
	const widgets: WidgetBlock[] = [];
	const menus: MenuBlock[] = [];
	const dataBlocks: DataBlock[] = [];
	const menuUses: { q: Question; act: Activity; menu: string; module: string | null; line: number }[] = [];
	const eachUses: EachUse[] = [];
	const openingLines = new Map<string | null, { lines: string[]; line: number }>();
	const at = (i: number) => `Line ${i + 1}`;

	let mod: Module | null = null;
	let act: Activity | null = null;
	let section: "content" | "data" = "content";
	/** The module a data section's blocks belong to (`> [!data|module-id]`), or null for the plain data section. */
	let dataMod: Module | null = null;
	/** A module or an activity line has been met: text outside every activity is no longer the booklet's opening. */
	let started = false;
	let buf: string[] = [];
	let bufAt = 0;

	/** The module a block or a menu here belongs to, or null for a shared one (booklet.html scopeMod). */
	const blockModule = (): string | null => (section === "content" ? (mod ? mod.id : null) : dataMod ? dataMod.id : null);
	const claimId = (id: string | null, i: number, scope: string = mod ? mod.id : "") => {
		if (!id) return;
		const set = idsByScope.get(scope) ?? new Set<string>();
		idsByScope.set(scope, set);
		const where = scope === SHARED ? "the menus every module shares" : scope ? `the module "${scope}"` : "the activities outside every module";
		if (set.has(id)) refusals.push(`${at(i)}: the id "${id}" is used twice in ${where}.`);
		set.add(id);
	};
	const readMenu = (id: string | null, i: number) => {
		const module = blockModule();
		claimId(id, i, module ?? SHARED);
		const r = listUnder(lines, bodyEnd(lines, i), BULLET_RE, (m) => (m[1] ?? "").trim());
		// a menu with no bullets under it holds nothing a question could take (booklet.html onMenu)
		if (id && r) menus.push({ id, module, items: r.items, line: i + 1 });
	};
	const readWidget = (i: number, close: number, id: string | null) => {
		const where = at(i);
		let data: unknown;
		try {
			data = JSON.parse(lines.slice(i + 1, Math.min(close, lines.length)).join("\n"));
		} catch {
			problems.push(`${where}: a widget block that is not JSON, so nothing can draw it.`);
			return;
		}
		if (!data || typeof data !== "object" || Array.isArray(data)) {
			problems.push(`${where}: a widget block that is not a JSON object, so nothing can draw it.`);
			return;
		}
		if (!id) {
			problems.push(`${where}: a widget block with no block id (^id) after it, so no widget line can embed it.`);
			return;
		}
		widgets.push({ id, module: blockModule(), data: data as Record<string, unknown>, line: i + 1 });
	};
	/** A data block's rows: JSON read as SPEC section 7 says; a block that cannot be read is reported and no query can name it. */
	const readData = (i: number, close: number, id: string) => {
		let json: unknown;
		try {
			json = JSON.parse(lines.slice(i + 1, Math.min(close, lines.length)).join("\n"));
		} catch {
			problems.push(`${at(i)}: the data block "${id}" is not JSON, so no query can draw it.`);
			return;
		}
		const r = readDataRows(json);
		if ("bad" in r) problems.push(`${at(i)}: the data block "${id}" ${r.bad}, so no query can draw it.`);
		else dataBlocks.push({ id, module: blockModule(), line: i + 1, rows: r.rows, fields: r.fields });
	};
	const flush = () => {
		if (act && buf.some((l) => l.trim())) {
			const md = buf.join("\n").replace(/^\n+|\n+$/g, "");
			act.segments.push({ type: "prose", markdown: md, line: bufAt + 1 });
		}
		buf = [];
	};
	const pushText = (ls: readonly string[], i: number) => {
		if (!act && section === "content") {
			// before a module's first activity, the module's opening; before the file's first module or activity
			// line, the booklet's; text anywhere else outside every activity belongs to nothing that is drawn
			const key = mod ? mod.id : !started ? null : undefined;
			if (key === undefined) return;
			const o = openingLines.get(key) ?? { lines: [], line: i + 1 };
			if (!o.lines.some((l) => l.trim())) o.line = i + 1;
			o.lines.push(...ls);
			openingLines.set(key, o);
			return;
		}
		if (!act || section !== "content") return;
		if (!buf.length) bufAt = i;
		buf.push(...ls);
	};
	/** A row is open: its `> [!row]` line was read and its `> [!row|end]` line has not been. */
	let rowOpen = false;
	const closeRow = (why: string, i: number) => {
		if (rowOpen) problems.push(`${at(i)}: a row is still open ${why}, so it ends there.`);
		rowOpen = false;
	};
	const endActivity = () => {
		flush();
		if (act) dropOpeningPages(act, problems);
		act = null;
	};
	/** The footnote ids by scope are said once each (a repeat is ignored: the first wins, booklet.html registries). */
	const noteScope = (): string | null => (section === "content" ? (mod ? mod.id : "") : dataMod ? dataMod.id : null);
	/** The callouts being read: where to go on in the file's own lines once a callout's body is read (the body's segments are in the activity's). */
	const open: { lines: string[]; resume: number }[] = [];

	for (let i = fm.bodyStart; ; i++) {
		if (i >= lines.length) {
			// the end of a callout's body: what it held is closed, and the file's own lines go on after it
			const was = open.pop();
			if (!was) break;
			flush();
			// a row line cannot go inside a callout, so a row open here was opened outside it and ends at its own end line
			if (act) act.segments.push({ type: "callout-end" });
			lines = was.lines;
			i = was.resume - 1;
			continue;
		}
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
				const what = (info[1] ?? "").toLowerCase();
				// a widget's data is read wherever it sits, and drawn only where a widget line embeds it
				if (what === "widget") readWidget(i, k, hasId ? (lines[n] ?? "").trim().slice(1) : null);
				if (what === "data" && hasId) readData(i, k, (lines[n] ?? "").trim().slice(1));
				if (what === "query") {
					// a query is read where it stands in an activity's prose, and drawn there (booklet.html FENCE_KIND.query)
					if (section === "data") problems.push(`${at(i)}: a query belongs in an activity's prose, not in the data section, so it was ignored.`);
					else if (!act) problems.push(`${at(i)}: a query belongs in an activity's prose, so it was refused.`);
					else {
						const query = readQuery(lines.slice(i + 1, Math.min(k, lines.length)), i + 1, problems);
						if (query) act.segments.push({ type: "query", line: i + 1, query, source: null });
					}
				}
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
			const sp = settingProblems(kind, w, at(i));
			// a setting a page line does not take is the author's to fix, not a sign of a newer format: said, and not counted as unread
			if (kind !== "page") unread += sp.length;
			problems.push(...sp);
			// a line of a kind that is none of the format's nor Obsidian's, with no words after the bar, is drawn as the callout it looks like:
			// a newer format may mean more by it
			if (!hasWords && !KNOWN_KINDS.has(kind) && kind !== "page" && !OBSIDIAN_CALLOUTS.has(kind)) unread++;
			const earlier = w.set["earlier"];
			if (earlier !== undefined && earlierValue(earlier) === null) {
				// a whole number in digits only; anything else is ignored and said, and the question keeps its default
				problems.push(`${at(i)}: \`earlier:${earlier}\` is not a whole number written in digits, so it was ignored and the question offers its default.`);
				delete w.set["earlier"];
			}
			if (open.length && (STRUCTURE_KINDS.has(kind) || kind === "page")) {
				// a line that makes structure cannot go inside a callout's body: ignored, with its own lines. A page line there is that
				// body's text, not a page: a page is a part of a tab, and a callout is a part of a page (the body is read with one `>`
				// less, so a `> > [!page]` there looks like a page line)
				const k = bodyEnd(lines, i);
				if (kind === "page") pushText(lines.slice(i, k), i);
				else problems.push(`${at(i)}: a ${kind} line cannot go inside a callout, so it was ignored.`);
				i = k - 1;
				continue;
			}
			if (kind === "module") {
				closeRow("when the module line came", i);
				endActivity();
				section = "content";
				dataMod = null;
				started = true;
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
				closeRow("when the activity line came", i);
				endActivity();
				section = "content";
				dataMod = null;
				started = true;
				if (!w.id) problems.push(`${at(i)}: an activity line has no id, so it cannot keep entries here.`);
				claimId(w.id, i);
				const repeat = w.flags.has("repeat");
				if (w.flags.has("daily") && !repeat) problems.push(`${at(i)}: \`daily\` needs \`repeat\`, so it was ignored.`);
				act = {
					id: w.id ?? "",
					title: title || w.id || "Activity",
					scope: mod ? mod.id : "",
					line: i,
					repeat,
					daily: repeat && w.flags.has("daily"),
					hidden: w.flags.has("hidden"),
					segments: [],
				};
				activities.push(act);
				i = bodyEnd(lines, i) - 1; // the `>` lines under it are its card's status line, drawn nowhere else
				continue;
			}
			if (kind === "data") {
				closeRow("when the data section came", i);
				endActivity();
				section = "data";
				// the module id on a data line says whose its blocks are, until the next data, module or activity line;
				// a module this file does not open is said, and its blocks are read as shared (booklet.html onData)
				dataMod = w.id ? (modules.find((x) => x.id === w.id) ?? null) : null;
				if (w.id && !dataMod) problems.push(`${at(i)}: a data section for the module "${w.id}", which this file does not open; its blocks are read as shared.`);
				i = bodyEnd(lines, i) - 1;
				continue;
			}
			if (section === "data") {
				// in a data section only its blocks are read: a shared menu among them
				if (kind === "menu") readMenu(w.id, i);
				if (kind === "page") problems.push(`${at(i)}: a page line in a data section, where only blocks are read, so it was ignored.`);
				i = claimEnd(kind, lines, i) - 1;
				continue;
			}
			if (kind === "row") {
				flush();
				// a row's two marker lines: what is between them is laid side by side where there is room (SPEC section 3, "Rows")
				if (act) {
					if (w.flags.has("end")) {
						if (!rowOpen) problems.push(`${at(i)}: a row is closed that was never opened, so its line was ignored.`);
						else act.segments.push({ type: "row", end: true, line: i + 1 });
						rowOpen = false;
					} else if (rowOpen) problems.push(`${at(i)}: a row opens inside a row (rows do not nest), so its line was ignored.`);
					else {
						act.segments.push({ type: "row", end: false, line: i + 1 });
						rowOpen = true;
					}
				}
				i = bodyEnd(lines, i) - 1;
				continue;
			}
			if (kind === "notice" || kind === "manifest" || kind === "records") {
				flush();
				i = bodyEnd(lines, i) - 1;
				continue;
			}
			if (kind === "tab") {
				flush();
				closeRow("when the tab line came", i);
				if (act) act.segments.push({ type: "tab", title: title || w.id || "Tab", line: i + 1 });
				const k = bodyEnd(lines, i);
				pushText(lines.slice(i + 1, k).map(stripQuote), i + 1); // a tab line's `>` lines are the tab's first prose
				i = k - 1;
				continue;
			}
			if (kind === "page") {
				flush();
				const where = at(i);
				let id = w.id;
				if (id && !ID_PATTERN.test(id)) {
					problems.push(`${where}: the page id "${id}" is not letters, digits and dashes, so the page's id is made from its title.`);
					id = null;
				}
				// a page is never folded: the marker means nothing on a page line (page trees; the pages round, 2.1)
				if (m[3]) problems.push(`${where}: a page is never folded, so the \`${m[3]}\` after its bracket was ignored.`);
				const k = bodyEnd(lines, i);
				if (!act) problems.push(`${where}: a page line belongs in an activity, so it was ignored.`);
				else if (rowOpen) problems.push(`${where}: a page line inside a row, which cannot hold one, so it was ignored.`);
				else act.segments.push({ type: "page", id, title, parent: w.set["parent"] || null, icon: w.set["icon"] || null, line: i + 1 });
				pushText(lines.slice(i + 1, k).map(stripQuote), i + 1); // a page line's `>` lines are the page's first prose
				i = k - 1;
				continue;
			}
			if (kind === "menu" || QUESTION_KINDS.has(kind) || (!KNOWN_KINDS.has(kind) && hasWords)) {
				flush();
				const k = claimEnd(kind, lines, i);
				if (kind === "menu") {
					readMenu(w.id, i); // a shared menu is never drawn: its list is kept for the questions that name it
					i = k - 1;
					continue;
				}
				if (QUESTION_KINDS.has(kind)) claimId(w.id, i);
				if (!act) {
					if (QUESTION_KINDS.has(kind)) problems.push(`${at(i)}: a question before the first activity belongs to no activity, so it is not drawn.`);
					i = k - 1;
					continue;
				}
				if (!KNOWN_KINDS.has(kind)) {
					unread++;
					problems.push(`${at(i)}: "${kind}" is not a kind this format defines.`);
				}
				if ((isCommon(kind) || kind === "widget") && w.id) {
					const body = lines.slice(i + 1, bodyEnd(lines, i)).map(stripQuote);
					const num = (x: string | undefined) => (x !== undefined && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : null);
					const q: Question = {
						type: "question",
						kind: kind as QuestionKind,
						id: w.id,
						title,
						// a widget line's embed is not its help (booklet.html helpOf)
						help: (kind === "widget" ? body.filter((l) => !/^\s*!\[\[/.test(l)) : body).join("\n").trim(),
						line: i + 1,
						options: [],
						anchors: [],
						items: [],
						long: kind === "text" && w.flags.has("long"),
						open: (kind === "choice" || kind === "multi") && w.flags.has("open"),
						min: kind === "number" ? num(w.set["min"]) : null,
						max: kind === "number" ? num(w.set["max"]) : null,
						step: kind === "number" ? num(w.set["step"]) : null,
						menu: null,
						embed: null,
						widget: null,
						readonly: kind === "widget" && w.flags.has("readonly"),
						describe: kind === "widget" && w.flags.has("describe"),
						each: null,
						earlier: w.set["earlier"] !== undefined ? earlierValue(w.set["earlier"]) : null,
					};
					if (w.set["each"] !== undefined) eachUses.push({ q, act, source: w.set["each"].trim(), line: i + 1 });
					const after = bodyEnd(lines, i);
					let drawn = true;
					if (kind === "choice" || kind === "multi") {
						// options of its own are its options; with none, `menu:` names the shared menu they come from
						// (booklet.html choiceBlock), found once the whole file is read
						const r = optionsUnder(lines, after);
						if (r) q.options = r.items;
						else if (w.set["menu"]) menuUses.push({ q, act, menu: w.set["menu"], module: mod ? mod.id : null, line: i + 1 });
						else problems.push(`${at(i)}: the ${kind} "${w.id}" has no options under it.`);
					} else if (kind === "scale") {
						const r = listUnder(lines, after, ANCHOR_RE, (mm) => ({ n: Number(mm[1]), text: (mm[2] ?? "").trim() }));
						if (!r) problems.push(`${at(i)}: the scale "${w.id}" has no anchors under it.`);
						q.anchors = r?.items ?? [];
					} else if (kind === "matrix") {
						// the bulleted list of items, then the numbered list of anchors (booklet.html's matrix line)
						const r = listUnder(lines, after, BULLET_RE, (mm) => (mm[1] ?? "").trim());
						const an = r ? listUnder(lines, r.next, ANCHOR_RE, (mm) => ({ n: Number(mm[1]), text: (mm[2] ?? "").trim() })) : null;
						if (!r) problems.push(`${at(i)}: the matrix "${w.id}" has no items under it (a bulleted list).`);
						else if (!an) problems.push(`${at(i)}: the matrix "${w.id}" has no anchors under its items (a numbered list).`);
						q.items = r?.items ?? [];
						q.anchors = an?.items ?? [];
					} else if (kind === "widget") {
						const emb = WIDGET_EMBED.exec(body.join("\n"));
						if (emb) q.embed = emb[1] ?? null;
						else {
							problems.push(`${at(i)}: the widget "${w.id}" embeds no widget block (a ![[#^id]] line under it), so it is not drawn.`);
							drawn = false;
						}
					}
					if (drawn) act.segments.push(q);
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
				const nested = lines.slice(i + 1, k).some((l) => {
					const mm = CALLOUT_LINE.exec(l.replace(/^(?:>[ \t]?)+/, "> "));
					return !!mm && QUESTION_KINDS.has((mm[1] ?? "").toLowerCase());
				});
				// a group is always a container (it is how steps are made); another callout is one when a question is inside it
				if (kind === "group" || nested) {
					flush();
					act.segments.push({ type: "callout", kind, title, fold: (m[3] ?? "") as "" | "-" | "+", line: i + 1 });
					// its body is read with one `>` less, from here to its end, as the activity's own text is
					open.push({ lines, resume: k });
					lines = lines.slice(0, k);
					for (let j = i + 1; j < k; j++) lines[j] = stripQuote(lines[j] ?? "");
					continue;
				}
				pushText(lines.slice(i, k), i);
				i = k - 1;
				continue;
			}
			pushText(lines.slice(i, k), i);
			i = k - 1;
			continue;
		}
		if (CALLOUT_ANY.test(ln)) problems.push(`${at(i)}: this line starts like a Booklet line but cannot be read, so it is shown as text.`);
		const def = NOTE_DEF.exec(ln);
		if (def && def[1] && !open.length) {
			// a footnote's definition: one paragraph, its first line and the indented lines straight after it; never drawn as prose
			const words = [(def[2] ?? "").trim()];
			let j = i + 1;
			while (j < lines.length && !inRegion[j] && /^[ \t]+\S/.test(lines[j] ?? "")) words.push((lines[j] ?? "").trim()), j++;
			const text = words.filter(Boolean).join(" ");
			notes.push({ id: def[1], scope: noteScope(), text, line: i + 1, source: sourceOfNote(text) });
			i = j - 1;
			continue;
		}
		if (section !== "content") continue;
		// outside every activity a page break is no page, and is not drawn (`---` under a line of text is its heading)
		if (!act && isThematicBreak(ln, !isBlank(lines[i - 1]))) continue;
		pushText([ln], i);
	}
	closeRow("at the end of the file", lines.length);
	endActivity();
	if (mod) refusals.push(`The module "${mod.id}" is opened and never closed.`);

	// a question that names a shared menu takes its options from it: from its own module's menus first, then
	// from the shared ones, never from another module's (SPEC section 4; booklet.html resolveMenus)
	for (const u of menuUses) {
		const hit = inScope(menus, u.menu, u.module);
		if (!hit) {
			const sees = u.module ? `the module "${u.module}"` : "the activities outside every module";
			problems.push(`Line ${u.line}: the ${u.q.kind} "${u.q.id}" takes its options from the menu "${u.menu}", which ${sees} cannot see, so it is not drawn.`);
			u.act.segments = u.act.segments.filter((s) => s !== u.q);
			continue;
		}
		u.q.options = hit.items.map((text) => ({ text, correct: false, reply: [] }));
		u.q.menu = hit.id;
	}
	readEach(eachUses, problems);
	// a widget line's block: in its own module first (its fence, then its data section), then a shared one (booklet.html widgetOf)
	for (const a of activities)
		for (const s of a.segments)
			if (s.type === "question" && s.kind === "widget" && s.embed)
				s.widget = inScope(widgets, s.embed, a.scope || null) ?? null;
	linkQueries(activities, dataBlocks, problems);

	// a file with no module and no activity line is one activity, and so has no opening (SPEC section 3)
	const openings: Opening[] = [];
	if (started)
		for (const [key, o] of openingLines) {
			const title = key === null ? (frontMatter["title"] ?? "") : (modules.find((x) => x.id === key)?.title ?? "");
			const markdown = openingMarkdown(o.lines, title);
			if (markdown || o.lines.some((l) => l.trim())) openings.push({ module: key, title, markdown, line: o.line });
		}

	const moduleIds = new Set(modules.map((x) => x.id).filter(Boolean));
	const bareActivityIds = new Set(activities.filter((a) => !a.scope && a.id).map((a) => a.id));
	const records = readRecords(lines, fm.bodyStart, { moduleIds, bareActivityIds }, regions);
	problems.push(...records.problems);
	for (const r of regions.slice(1)) problems.push(`Line ${r.start + 1}: a second records section; its records are read as if they sat in the first.`);
	const afterRegion = regions[0] && regions[0].closed ? lines.slice(regions[0].end + 1).some((l, n) => !inRegion[regions[0]!.end + 1 + n] && l.trim()) : false;
	if (afterRegion) problems.push("There is text after the records section; the reference renderer would move it above the records when it saves.");
	const wrong = wrongShapes(activities, records);
	if (wrong)
		problems.push(
			wrong === 1
				? "One answer is not in the shape its question keeps, so it is kept as written: shown read-only with a notice, and left out of what views show."
				: `${wrong} answers are not in the shape their questions keep, so they are kept as written: shown read-only with a notice, and left out of what views show.`,
		);
	if (pagesMarker && unread) problems.unshift(`This file says booklet: ${marker}. This view reads format ${FORMAT_VERSION} and the page lines of ${marker}, and has opened the rest as it is: the lines listed below, and anything else new in ${marker}, may not draw.`);
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
		openings,
		widgets,
		menus,
		notes,
		records,
	};
}

/** The questions of an activity this view draws, in its order. */
export const questionsOf = (a: Pick<Activity, "segments">): Question[] => a.segments.filter((s): s is Question => s.type === "question");

/**
 * How many answers are of the wrong shape (SPEC section 8), in the answers, the drafts and the kept entries, for the
 * questions this view draws: said once among the file's problems (booklet.html noteShapes). Each such question also
 * says so where it is drawn.
 */
function wrongShapes(activities: readonly Activity[], records: RecordsRead): number {
	let n = 0;
	for (const a of activities) {
		const qs = questionsOf(a);
		const recs = a.repeat ? [records.drafts[a.scope]?.[a.id], ...(records.entries[a.scope]?.[a.id] ?? [])] : [records.answers[a.scope]];
		for (const r of recs) if (r) for (const q of qs) if (Object.prototype.hasOwnProperty.call(r, q.id) && shapeIssue(q, r[q.id])) n++;
	}
	return n;
}

/* ---- queries ---- */

const LIMIT_RE = /^([1-9]\d*)([ \t]+days?)?$/;

/**
 * A query block's `key: value` lines (booklet.html readQuery). A line that is not one refuses the block; a key a query
 * does not have, a `limit:` that is neither a positive whole number nor a number of days (`7 days`), and a `summary:`
 * that is not `on` are ignored and reported.
 */
function readQuery(body: readonly string[], line: number, problems: string[]): Query | null {
	const at = `Line ${line}`;
	const o = Object.create(null) as Record<string, string>;
	for (const raw of body) {
		const ln = raw.trim();
		if (!ln) continue;
		const kv = kvLine(ln);
		if (!kv) {
			problems.push(`${at}: the query block has a line that is not \`key: value\` (${ln}), so it was refused.`);
			return null;
		}
		o[kv[0].toLowerCase()] = kv[1];
	}
	for (const k of Object.keys(o)) if (!QUERY_KEYS.includes(k)) problems.push(`${at}: a query has no setting "${k}", so it was ignored.`);
	const lim = o["limit"] === undefined ? null : LIMIT_RE.exec(o["limit"].trim());
	if (o["limit"] !== undefined && !lim) problems.push(`${at}: the query's \`limit: ${o["limit"]}\` is not a positive whole number or a number of days (such as \`7 days\`), so it was ignored.`);
	if (o["summary"] !== undefined && o["summary"] !== "on") problems.push(`${at}: the query's \`summary: ${o["summary"]}\` is not \`on\`, so it was ignored.`);
	const text = (k: string): string | null => (o[k] !== undefined && o[k] !== "" ? o[k]! : null);
	const roles: Partial<Record<Role, string>> = {};
	for (const r of ROLE_NAMES) {
		const v = text(r);
		if (v !== null) roles[r] = v;
	}
	const as = text("as");
	return {
		from: o.from ?? "",
		as: as === null ? null : (as.toLowerCase() as ViewName),
		fields:
			text("fields")
				?.split(",")
				.map((x) => x.trim())
				.filter(Boolean) ?? null,
		empty: text("empty"),
		limit: lim && !lim[2] ? Number(lim[1]) : null,
		days: lim && lim[2] ? Number(lim[1]) : null,
		summary: o["summary"] === "on",
		group: text("group"),
		parent: text("parent"),
		roles,
	};
}

/** What of an activity a query may name as a question: one drawn here. */
function questionNamed(a: Activity, id: string): { q: Question; title: string } | null {
	for (const s of a.segments) if (s.type === "question" && s.id === id) return { q: s, title: s.title };
	return null;
}

/**
 * Where each query reads (booklet.html linkQueries), within its own module only: an activity or a question of an
 * activity in the query's module (the activities outside every module are one module), else a data block in its
 * module or the shared data section. One that names nothing there, names something in another module, names an
 * activity that keeps no entries, or has an `as:` that is not one of the six views, cannot be drawn: it is reported
 * and taken out, and the note still opens. A span of days and a summary read kept entries: on a data block, or on a
 * question whose activity keeps none, they are ignored and reported; so is `group:` on a summary.
 */
/**
 * A data block whose id is also an activity's or a question's (SPEC section 7 forbids it), or another block's, is said among the
 * note's problems. Which one a query reads is not changed: the activity, then the question, then the first block.
 */
function checkDataIds(activities: readonly Activity[], data: readonly DataBlock[], problems: string[]): void {
	data.forEach((d, i) => {
		const seen = activities.filter((a) => d.module === null || a.scope === d.module);
		const act = seen.find((a) => a.id === d.id);
		const asked = act ? null : seen.find((a) => questionNamed(a, d.id) !== null);
		if (act || asked) problems.push(`Line ${d.line}: the data block "${d.id}" has the same id as ${act ? "an activity" : "a question"}, so a query that names it reads that, not the block.`);
		else if (data.slice(0, i).some((x) => x.id === d.id && x.module === d.module)) problems.push(`Line ${d.line}: a second data block has the id "${d.id}", so a query that names it reads the first one.`);
	});
}

function linkQueries(activities: readonly Activity[], data: readonly DataBlock[], problems: string[]): void {
	checkDataIds(activities, data, problems);
	for (const act of activities)
		act.segments = act.segments.filter((s) => {
			if (s.type !== "query") return true;
			const why = linkQuery(s, act, activities, data, problems);
			if (why) problems.push(`Line ${s.line}: a query in "${act.id || act.title}" ${why}, so it is not drawn.`);
			return !why;
		});
}

function linkQuery(s: QuerySegment, act: Activity, activities: readonly Activity[], data: readonly DataBlock[], problems: string[]): string | null {
	const q = s.query;
	if (q.as !== null && !(QUERY_VIEWS as readonly string[]).includes(q.as)) return `has \`as: ${q.as}\`, which is not cards, table, list, tiles, bars or line`;
	if (!q.from) return "has no from:, the activity, question or data block it shows";
	const here = activities.filter((a) => a.scope === act.scope);
	const a = here.find((x) => x.id === q.from);
	let source: QuerySource | null = a ? { kind: "activity", act: a } : null;
	for (const x of here) {
		if (source) break;
		const named = questionNamed(x, q.from);
		if (named) source = { kind: "question", act: x, q: named.q, id: q.from, title: named.title };
	}
	if (!source) {
		const d = inScope(data, q.from, act.scope || null);
		if (d) source = { kind: "data", id: d.id, block: d };
	}
	if (!source) {
		const elsewhere =
			activities.some((x) => x.scope !== act.scope && (x.id === q.from || questionNamed(x, q.from) !== null)) ||
			data.some((z) => z.id === q.from && z.module !== null && z.module !== act.scope);
		return elsewhere ? `names "${q.from}", which is in another module` : `names "${q.from}", which is nothing in this module`;
	}
	if (source.kind === "activity" && !source.act.repeat) return `names "${q.from}", which keeps no entries (only a repeat activity does)`;
	const keeps = source.kind === "activity" || (source.kind === "question" && source.act.repeat);
	if (!keeps && (q.days !== null || q.summary)) {
		const ks = [...(q.days !== null ? [`\`limit: ${q.days} ${q.days === 1 ? "day" : "days"}\``] : []), ...(q.summary ? ["`summary: on`"] : [])];
		problems.push(`Line ${s.line}: the query's ${ks.join(" and ")} ${ks.length > 1 ? "read" : "reads"} kept entries only, so ${ks.length > 1 ? "they were" : "it was"} ignored.`);
		q.days = null;
		q.summary = false;
	}
	if (q.summary && q.group !== null) {
		problems.push(`Line ${s.line}: the query's \`group: ${q.group}\` is ignored: summary rows have nothing to group by.`);
		q.group = null;
	}
	s.source = source;
	return null;
}

