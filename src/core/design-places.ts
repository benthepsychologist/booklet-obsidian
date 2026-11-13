/*
 * Where a piece may stand: given a position in the design tree, which kinds of piece are legal there, and what each container's
 * "+ Add" lists. Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * Today's panel puts a piece at the cursor and the linter objects afterwards. Here each rule is the format's own (SPEC v0.20), quoted
 * where it is written, so a position offers only what the reader will read. Every rule answers a question about the text a piece
 * would make, not about the tree it is drawn in: a line placed at a position lands where the file's lines put it (a block under the
 * last tab of an activity is that tab's), so `placeCheck` reads both ways: the boundary the new line makes (`up`) and what it would
 * land in (`down`).
 *
 * A position is a container and an index among its children: the piece goes before `children[index]`, or at the end of the container's
 * content when `index` is the number of children. A piece in a group is quoted with one more `>` for each group around it (ops).
 *
 * Judgment calls that the format leaves open are marked "judgment" in their comment and listed in the build report.
 */
import { PIECES, type Piece } from "./editor-pieces";
import { isContainer, parseDesign, walkDesign, type DesignNode } from "./design-tree";

/** What a thing placed is, for where it may stand. A piece is made of one or more of these (`needsOf`). */
export type PlaceKind =
	| "front-matter"
	| "theme"
	| "module"
	| "activity"
	| "module-tab"
	| "activity-tab"
	| "page"
	| "question"
	| "copy"
	| "row"
	| "group"
	| "query"
	| "menu"
	| "data-block"
	| "data-section"
	| "notice"
	| "page-break"
	| "callout"
	| "text";

/** A tab line is a module's or an activity's by where it stands; a piece that is one needs "tab". */
export type NeedKind = PlaceKind | "tab";

/** The kinds in the order a list shows them. */
export const PLACE_KINDS: readonly PlaceKind[] = [
	"front-matter",
	"theme",
	"module",
	"activity",
	"module-tab",
	"activity-tab",
	"page",
	"question",
	"copy",
	"row",
	"group",
	"query",
	"menu",
	"data-block",
	"data-section",
	"notice",
	"page-break",
	"callout",
	"text",
];

export interface DesignPosition {
	parent: DesignNode;
	/** The piece goes before `parent.children[index]`; `parent.children.length` is the end of the container's content. */
	index: number;
}

export type PlaceResult = { ok: true; note?: string } | { ok: false; reason: string; needs?: PlaceKind };

// ---------------------------------------------------------------- positions

/** The line a position is: the start of the child it is before, or where the container's own tail begins. */
export function positionLine(p: DesignPosition): number {
	const c = p.parent.children[p.index];
	return c ? c.start : p.parent.tailStart;
}

/** The end of a container's content. */
export const positionIn = (container: DesignNode): DesignPosition => ({ parent: container, index: container.children.length });
/** The start of a container's content, below its own lines. */
export const positionAtStart = (container: DesignNode): DesignPosition => ({ parent: container, index: 0 });

export function positionBefore(n: DesignNode): DesignPosition | null {
	return n.parent ? { parent: n.parent, index: n.parent.children.indexOf(n) } : null;
}

export function positionAfter(n: DesignNode): DesignPosition | null {
	return n.parent ? { parent: n.parent, index: n.parent.children.indexOf(n) + 1 } : null;
}

/**
 * The position just above a line. A line inside a block (not its first) is taken to be after the block, as the panel treats a cursor
 * in a block; a line inside a container's own lines is the start of its content; the first line of a block is before it. A line where
 * two positions are the same line (the end of an activity and the start of the next) gives the one at the outer container.
 */
export function positionAtLine(root: DesignNode, line: number): DesignPosition {
	line = Math.max(0, Math.min(line, root.end));
	let node = root;
	for (;;) {
		if (line < node.headEnd) line = node.headEnd;
		const idx = node.children.findIndex((c) => c.end > line);
		if (idx < 0) return { parent: node, index: node.children.length };
		const c = node.children[idx];
		if (!c) return { parent: node, index: node.children.length };
		if (line <= c.start) return { parent: node, index: idx };
		if (isContainer(c) && line <= c.tailStart) {
			if (line < c.headEnd) return { parent: c, index: 0 };
			node = c;
			continue;
		}
		return { parent: node, index: idx + 1 };
	}
}

/** The nodes enclosing a node, outermost first, the node included. */
export function ancestorsOf(n: DesignNode): DesignNode[] {
	const out: DesignNode[] = [];
	for (let c: DesignNode | null = n; c; c = c.parent) out.unshift(c);
	return out;
}

/** The container a new line is read into when it stands after these: a block placed after an activity's last line is the activity's, since an activity runs to the next activity line. */
const CONTINUES: ReadonlySet<string> = new Set(["activity", "activity-tab", "module-tab", "page", "data-section"]);

/** What a block placed here would land in, outermost first (`down`): the container and whatever ran up to this line and is still open. */
function landing(pos: DesignPosition): DesignNode[] {
	const chain = ancestorsOf(pos.parent);
	let node = pos.parent;
	let idx = pos.index;
	for (;;) {
		const prev = idx > 0 ? node.children[idx - 1] : undefined;
		if (!prev || !CONTINUES.has(prev.kind)) break;
		chain.push(prev);
		node = prev;
		idx = prev.children.length;
	}
	return chain;
}

/**
 * The boundary a new structure line makes (`up`): the end of a container that runs to the next line of its kind is the same line as the
 * start of what follows it, so a position at the end of a page, a tab or an activity is also a position among the things around it.
 * How far out it climbs depends on the line: a tab line stops at its activity, a page line at its tab or activity, an activity or a
 * module line climbs to the module or the booklet.
 */
function boundary(pos: DesignPosition, stop: readonly string[]): DesignPosition {
	let { parent, index } = pos;
	while (parent.parent && index === parent.children.length && CONTINUES.has(parent.kind) && !stop.includes(parent.kind)) {
		index = parent.parent.children.indexOf(parent) + 1;
		parent = parent.parent;
	}
	return { parent, index };
}

// ---------------------------------------------------------------- the rules

const GROUP_HOLDS: ReadonlySet<PlaceKind> = new Set<PlaceKind>(["question", "copy", "query", "text", "callout", "group"]);
const ROW_HOLDS: ReadonlySet<PlaceKind> = new Set<PlaceKind>(["question", "copy", "query", "text", "callout", "group", "data-block", "menu"]);

const last = <T>(xs: readonly T[], pick: (x: T) => boolean): T | undefined => {
	for (let i = xs.length - 1; i >= 0; i--) {
		const x = xs[i];
		if (x !== undefined && pick(x)) return x;
	}
	return undefined;
};

const no = (reason: string, needs?: PlaceKind): PlaceResult => (needs ? { ok: false, reason, needs } : { ok: false, reason });

const rootOf = (n: DesignNode): DesignNode => ancestorsOf(n)[0] ?? n;

/** Is there an activity in the container (a module, or the booklet) at all: if not, one would have to come first. */
function activityFirst(container: DesignNode | undefined, root: DesignNode): PlaceKind | undefined {
	const holder = container ?? root;
	return holder.children.some((c) => c.kind === "activity") ? undefined : "activity";
}

/**
 * May a piece of this kind stand at this position? `ok: true` carries a note when the format allows it but does not recommend it. On a
 * no, `reason` says why in a sentence and `needs` names the kind that would have to come first when the only thing missing is a parent
 * (a page in a module with no activity needs an activity).
 */
export function placeCheck(kind: PlaceKind, pos: DesignPosition): PlaceResult {
	const root = rootOf(pos.parent);
	const line = positionLine(pos);
	const down = landing(pos);
	const mod = last(down, (n) => n.kind === "module");
	const act = last(down, (n) => n.kind === "activity");
	const data = last(down, (n) => n.kind === "data-section");
	const inGroup = down.some((n) => n.kind === "group");
	const inRow = down.some((n) => n.kind === "row");
	const front = root.children.find((c) => c.kind === "front-matter");
	const implicit = root.children.find((c) => c.kind === "activity" && c.implicit === true);

	if (kind === "front-matter") {
		// "A piece that has front matter goes at the very top of a note that has none" (the panel's rule, editor-place.ts)
		return front ? no("This note has properties already. The front matter block goes at the top of a note that has none.") : { ok: true };
	}
	if (front && line < front.end) return no("The front matter comes first: place the piece below it.");
	// SPEC section 8: the records section is kept data, written by the app; a piece is never placed in it or after one that runs on
	const records = root.children.find((c) => c.kind === "records" && c.closed !== true);
	if (records && line >= records.end) return no("The records section holds kept data and runs to the end of the note, so nothing is placed after it.");
	if (kind === "data-section" || kind === "module" || kind === "activity") {
		// handled below: a structure line ends what it follows
	} else if (data && kind !== "data-block" && kind !== "menu") {
		// "A data section holds blocks, menus and footnotes" and is not drawn (SPEC section 3, 'Where data goes'; the linter warns)
		return no("A data section holds blocks and menus and is not drawn, so this does not go in it.");
	}

	// what a group and a row hold
	if (inGroup && !GROUP_HOLDS.has(kind)) {
		// "A line that makes structure (module, activity, tab, page, row, data, records) cannot go inside a group" (SPEC section 6, 'A group holds blocks')
		return no("A group holds prose, callouts, query views and questions, and can hold no structure line (SPEC section 6).");
	}
	if (inRow && !ROW_HOLDS.has(kind)) {
		// "Rows do not nest, and a row does not cross a thematic break, a tab line, a page line, an activity line or a module fence" (SPEC section 3, 'Rows')
		return no("A row does not nest and does not cross a break, a tab, a page, an activity or a module (SPEC section 3, 'Rows').");
	}

	const needsActivity = (): PlaceResult | null => {
		if (act && !data) return null;
		const first = activityFirst(mod, root);
		if (kind === "question") {
			// the format is silent on a question in a module's opening, and forbids it only before the file's first module or activity
			// line ("A question line before the file's first module or activity line belongs to no activity", SPEC section 3).
			// Judgment, Ben's ruling (design note, open call 4): not offered in a module's opening either; a hand-written one is drawn as written.
			return no(mod ? "A question belongs inside an activity. It is not offered in a module's opening." : "A question belongs inside an activity, not before the file's first module or activity line (SPEC section 3).", first);
		}
		if (kind === "copy") {
			// "In an activity, wherever a question may stand ... Not in a module's opening, not before the file's first module or activity line" (SPEC section 6, 'Copy')
			return no("A copy button belongs inside an activity (SPEC section 6, 'Copy').", first);
		}
		if (kind === "query") {
			// "a query belongs in an activity's prose" (the linter, check_query; SPEC section 6, 'Queries')
			return no("A query view belongs in an activity's prose (SPEC section 6, 'Queries').", first);
		}
		if (kind === "page-break") return no("A page break splits an activity, a tab or a page into sections (SPEC section 3), so it needs an activity.", first);
		if (kind === "row") return no("A row stands in an activity.", first);
		if (kind === "group") {
			// "Outside an activity (in a module's opening or the booklet's) a group is a plain fold of Markdown" (SPEC section 6, 'A group holds blocks')
			return no("A group holds blocks only in an activity; outside one it is a plain fold of Markdown.", first);
		}
		return no("This belongs inside an activity.", first);
	};

	switch (kind) {
		case "theme": {
			// "One theme block per file, outside any module fence" (SPEC section 7, 'A theme')
			if (walkDesign(root).some((n) => n.kind === "fence" && /^booklet\s+theme\b/i.test(n.detail))) return no("A booklet has one theme block.");
			if (mod) return no("A theme belongs to the booklet, not to a module: put it outside the module's fence (SPEC section 7, 'A theme').");
			if (data) return no("A theme goes in the booklet's own text, not in a data section.");
			return { ok: true };
		}
		case "module": {
			// "A module is fenced: an opening line and a closing line, both required" and the linter's "opens before ... is closed" (SPEC section 3)
			const up = boundary(pos, []);
			if (up.parent.kind !== "booklet") return no("A module stands at the top of the booklet, never inside another module, an activity or a data section (SPEC section 3).");
			if (implicit) return no("This note is one activity with no activity line (SPEC section 3). Add an activity first, then a module.");
			return { ok: true };
		}
		case "activity": {
			// "An activity starts at an activity line and runs to the next one"; "A bare activity sits outside any module fence, by convention before the first one" (SPEC section 3)
			let up = boundary(pos, []);
			// the top of a note that is one activity with no activity line is the top of the booklet: the new line takes all of it in
			if (implicit && line === implicit.start) up = { parent: root, index: root.children.indexOf(implicit) };
			if (up.parent.kind !== "booklet" && up.parent.kind !== "module") return no("An activity stands in a module, or on its own at the top of the booklet (SPEC section 3), not inside another activity, a tab or a page.");
			if (up.parent.kind === "module" && up.parent.children.some((c) => c.kind === "module-tab" && c.start >= line)) {
				// "Tab lines in a module's opening (inside its fence, before its first activity) declare the module's tabs" (SPEC section 3, 'A module's tabs')
				return no("A module's tabs are declared in its opening, before its first activity (SPEC section 3, 'A module's tabs'): put the activity below them.");
			}
			if (implicit && line !== implicit.start) {
				return no("This note is one activity with no activity line (SPEC section 3). An activity can only be added above all of it, and then the text becomes that activity's.");
			}
			const anyModule = root.children.some((c) => c.kind === "module" && c.start < line);
			return up.parent.kind === "booklet" && anyModule ? { ok: true, note: "A bare activity comes before the first module by convention (SPEC section 3)." } : { ok: true };
		}
		case "module-tab": {
			// "Tab lines in a module's opening (inside its fence, before its first activity) declare the module's tabs" (SPEC section 3, 'A module's tabs')
			const up = boundary(pos, []);
			if (up.parent.kind !== "module") return no(act ? "A tab inside an activity is the activity's own. A module's tabs stand in the module's opening." : "A module's tabs stand in the module's opening, inside its fence.");
			if (up.parent.children.slice(0, up.index).some((c) => c.kind === "activity")) return no("A module's tabs are declared in its opening, before its first activity (SPEC section 3, 'A module's tabs').");
			return { ok: true };
		}
		case "activity-tab": {
			// "A tab line, `> [!tab] Name`, inside an activity starts a tab that runs to the next tab line or to the end of the activity" (SPEC section 3, 'Tabs')
			const up = boundary(pos, ["activity"]);
			if (up.parent.kind !== "activity") {
				if (up.parent.kind === "module") return no("A tab inside a module's opening is a module tab. An activity's tabs go in an activity.");
				return no("A tab starts at the activity's own level: add it after the tab it follows, not inside a page or another tab.");
			}
			// "A page line before the activity's first tab line stands in the activity's opening ... no page of any tab" (the linter): a first tab line must not come after a page
			if (up.parent.children.slice(0, up.index).some((c) => c.kind === "page")) return no("A tab line cannot come after a page line of an activity with no tabs: the page would stand in the activity's opening, which is no page of any tab (SPEC section 3, 'Pages').");
			return { ok: true };
		}
		case "page": {
			// "Where a page line may stand. In an activity: in one of its tabs, or anywhere in an activity with no tab line" (SPEC section 3, 'Pages')
			const up = boundary(pos, ["activity", "activity-tab"]);
			const k = up.parent.kind;
			if (k !== "activity" && k !== "activity-tab") {
				if (!act) return no("A page needs an activity above it (SPEC section 3, 'Pages').", activityFirst(mod, root));
				return no("A page starts at the level of a tab or an activity: add it after the page it follows, not inside one.");
			}
			const after = up.index > 0 ? up.parent.children[up.index - 1] : undefined;
			const inTab = k === "activity-tab" || after?.kind === "activity-tab";
			if (!inTab && up.parent.children.some((c) => c.kind === "activity-tab")) {
				return no("That is the activity's opening, shown above every tab, so it is no page of any tab: put the page in a tab (SPEC section 3, 'Pages').");
			}
			return { ok: true };
		}
		case "question":
		case "copy": {
			const miss = needsActivity();
			if (miss) return miss;
			return { ok: true };
		}
		case "query":
		case "row":
		case "group":
		case "page-break": {
			const miss = needsActivity();
			if (miss) return miss;
			if (kind === "page-break" && inGroup) return no("A rule inside a group stays a drawn rule and does not split the page (SPEC section 3).");
			return { ok: true };
		}
		case "notice": {
			// "A module has at most one, and it sits inside the module's fence before the module's first activity" (SPEC section 3, 'A module's notice')
			if (!mod) return no("A notice sits inside a module's fence (SPEC section 3, 'A module's notice').");
			if (act) return no("A notice sits before the module's first activity (SPEC section 3, 'A module's notice').");
			if (walkDesign(mod).some((n) => n.kind === "notice")) return no("A module has at most one notice (SPEC section 3, 'A module's notice').");
			return { ok: true };
		}
		case "menu": {
			// "A list used by several questions is written once, in the module whose questions use it (or in the data section)" (SPEC section 5, 'Shared menus');
			// judgment: not offered in a group, which the format says holds prose, callouts, queries and questions
			if (inGroup) return no("A shared menu is written once in its module, not inside a group.");
			return { ok: true };
		}
		case "data-block": {
			// "The blocks a module's activities refer to ... sit in one of three places: inside the module's fence, under a data line, under a plain data line" (SPEC section 3, 'Where data goes')
			return { ok: true };
		}
		case "data-section": {
			// "Under a plain `> [!data] Data` line, at the end of the file" and "A file may have several data sections" (SPEC section 3); judgment: only between the
			// top-level parts of the note, so it never cuts an activity or a module in two. The view never writes the records section.
			const up = boundary(pos, []);
			if (up.parent.kind !== "booklet") return no("A data section stands at the top of the booklet, between modules and activities or at the end (SPEC section 3, 'Where data goes').");
			return { ok: true };
		}
		case "callout":
		case "text": {
			// "Prose, and reading callouts, before the file's first module or activity line are the booklet's opening" and a module's opening is "prose ... and reading callouts" (SPEC section 3)
			return { ok: true };
		}
		default:
			return no("Not a place for this.");
	}
}

/** The kinds that may stand at this position, in list order. */
export function legalKinds(root: DesignNode, pos: DesignPosition): PlaceKind[] {
	if (rootOf(pos.parent) !== root) return [];
	return PLACE_KINDS.filter((k) => placeCheck(k, pos).ok);
}

/** The kinds a position refuses only because a parent is missing, each with the kind to add first (a page in a module with no activity needs an activity). */
export function missingParents(root: DesignNode, pos: DesignPosition): { kind: PlaceKind; first: PlaceKind }[] {
	if (rootOf(pos.parent) !== root) return [];
	const out: { kind: PlaceKind; first: PlaceKind }[] = [];
	for (const k of PLACE_KINDS) {
		const r = placeCheck(k, pos);
		if (!r.ok && r.needs) out.push({ kind: k, first: r.needs });
	}
	return out;
}

// ---------------------------------------------------------------- what a container's "+ Add" lists

/** Each container's own list: what the format lets stand directly in it. The first of each pair is what is offered; `page` in a module is there so it can say an activity comes first. */
const ADDS: Readonly<Record<string, readonly PlaceKind[]>> = {
	booklet: ["front-matter", "theme", "module", "activity", "data-section", "callout", "text"],
	module: ["activity", "module-tab", "notice", "callout", "text", "menu", "data-block", "page"],
	"module-tab": ["callout", "text"],
	activity: ["activity-tab", "page", "question", "copy", "row", "group", "query", "menu", "data-block", "page-break", "callout", "text"],
	"activity-tab": ["page", "question", "copy", "row", "group", "query", "menu", "data-block", "page-break", "callout", "text"],
	page: ["question", "copy", "row", "group", "query", "menu", "data-block", "page-break", "callout", "text"],
	group: ["question", "copy", "query", "group", "callout", "text"],
	row: ["question", "copy", "query", "group", "menu", "data-block", "callout", "text"],
	"data-section": ["data-block", "menu"],
};

/**
 * Where "+ Add <kind>" in a container puts it. Most kinds go at the end of the container's content. A module's own opening things (a tab,
 * a notice, prose, a callout) go above its first activity, and a module or an activity added to the booklet goes above the data and
 * records sections that close it. A page in an activity with tabs goes at the end of the last tab.
 */
export function addPosition(container: DesignNode, kind: PlaceKind): DesignPosition {
	if (container.kind === "module" && (kind === "module-tab" || kind === "notice" || kind === "callout" || kind === "text")) {
		const i = container.children.findIndex((c) => c.kind === "activity");
		return { parent: container, index: i < 0 ? container.children.length : i };
	}
	if (container.kind === "booklet") {
		if (kind === "front-matter") return { parent: container, index: 0 };
		const firstAct = container.children.findIndex((c) => c.kind === "module" || c.kind === "activity" || c.kind === "data-section" || c.kind === "records");
		if (kind === "theme" || kind === "callout" || kind === "text") return { parent: container, index: firstAct < 0 ? container.children.length : firstAct };
		const tail = container.children.findIndex((c) => c.kind === "data-section" || c.kind === "records");
		return { parent: container, index: tail < 0 ? container.children.length : tail };
	}
	return positionIn(container);
}

export interface ContainerAdds {
	/** The kinds "+ Add" lists, in order. */
	kinds: PlaceKind[];
	/** Kinds the container would list, each held up only by a missing parent: the kind to add first. */
	first: { kind: PlaceKind; first: PlaceKind }[];
	/** What to say when the container holds nothing yet, or null. */
	empty: string | null;
}

const EMPTY: Readonly<Record<string, string>> = {
	booklet: "This booklet is empty. Add a module, or an activity.",
	module: "This module is empty. Add an activity.",
	"module-tab": "This module tab has no words. Add some prose, or give an activity `tab:` with its id.",
	activity: "This activity is empty. Add a question, a tab or a page.",
	"activity-tab": "This tab is empty. Add a question or a page.",
	page: "This page is empty. Add a question or some words.",
	group: "This group is empty. Add a question or some words.",
	row: "This row is empty. Add some words or a question.",
	"data-section": "This data section is empty. Add a block of data.",
};

/** What the container's "+ Add" lists: the kinds legal where each would go, and the ones that wait on a parent. */
export function containerAdds(node: DesignNode): ContainerAdds {
	const list = ADDS[node.kind] ?? [];
	const kinds: PlaceKind[] = [];
	const first: ContainerAdds["first"] = [];
	for (const k of list) {
		const r = placeCheck(k, addPosition(node, k));
		if (r.ok) kinds.push(k);
		else if (r.needs && node.kind === "module") first.push({ kind: k, first: r.needs });
	}
	const bare = node.children.length === 0 || (node.kind === "booklet" && node.children.every((c) => c.kind === "front-matter" || (c.kind === "activity" && c.implicit === true && c.children.length === 0)));
	return { kinds, first, empty: bare ? (EMPTY[node.kind] ?? null) : null };
}

// ---------------------------------------------------------------- pieces

const NEEDS = new Map<string, NeedKind[]>();

/** What one node is, for where it may stand; null for what the view never places (the booklet, the records, an unreadable line). */
export function needOfNode(n: DesignNode): NeedKind | null {
	switch (n.kind) {
		case "front-matter":
		case "module":
		case "activity":
		case "page":
		case "row":
		case "group":
		case "notice":
		case "menu":
		case "query":
		case "question":
		case "page-break":
		case "data-section":
			return n.kind;
		case "module-tab":
		case "activity-tab":
			return "tab";
		case "fence":
			return /^booklet\s+theme\b/i.test(n.detail) ? "theme" : "data-block";
		case "callout":
			return n.detail === "copy" ? "copy" : "callout";
		case "prose":
		case "comment":
		case "as-written":
			return "text";
		default:
			return null;
	}
}

/** What a piece is made of, for where it may stand: the kinds of its top-level blocks, read from its own text, so the list cannot drift from the pieces table. */
export function needsOf(piece: Pick<Piece, "file" | "text">): NeedKind[] {
	const hit = NEEDS.get(piece.file);
	if (hit) return hit;
	const root = parseDesign(piece.text, { lenient: true });
	const tops: DesignNode[] = [];
	for (const c of root.children) {
		if (c.kind === "activity" && c.implicit === true) tops.push(...c.children);
		else tops.push(c);
	}
	const out: NeedKind[] = [];
	for (const n of tops) {
		const k = n.kind === "as-written" ? null : needOfNode(n);
		if (k && !out.includes(k)) out.push(k);
	}
	NEEDS.set(piece.file, out);
	return out;
}

/** May something of this kind stand at this position? A tab is a module's or an activity's by where it stands. */
export function checkNeed(pos: DesignPosition, need: NeedKind): PlaceResult {
	if (need !== "tab") return placeCheck(need, pos);
	const m = placeCheck("module-tab", pos);
	if (m.ok) return m;
	const a = placeCheck("activity-tab", pos);
	if (a.ok) return a;
	// a tab line after a module's first activity is neither: say what a module's tab needs, unless the position is inside an activity
	return boundary(pos, []).parent.kind === "module" || (landing(pos).some((n) => n.kind === "module") && !landing(pos).some((n) => n.kind === "activity")) ? m : a;
}

/** May this piece stand at this position? It may when every kind it is made of may. */
export function canPlacePiece(pos: DesignPosition, piece: Pick<Piece, "file" | "text">): PlaceResult {
	let note: string | undefined;
	for (const need of needsOf(piece)) {
		const r = checkNeed(pos, need);
		if (!r.ok) return r;
		if (r.note) note = r.note;
	}
	return note ? { ok: true, note } : { ok: true };
}

/** The pieces that may stand at this position. */
export function legalPieces(root: DesignNode, pos: DesignPosition): Piece[] {
	if (rootOf(pos.parent) !== root) return [];
	return PIECES.filter((p) => canPlacePiece(pos, p).ok);
}
