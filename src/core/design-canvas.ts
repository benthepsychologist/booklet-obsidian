/*
 * What the Design view's canvas draws, decided from the tree, so it is tested without a DOM. Plain TypeScript: nothing here imports
 * Obsidian or the DOM.
 *
 * The view is a page you edit: a left column (the navigator and the Add palette) and a canvas that draws ONE PAGE at a time as the reader
 * sees it, with a thin "+" slot between blocks. This file is what sits behind that:
 *
 *   canvasOf      the page a selected node draws: its blocks, its cards (the parts it holds), the block in focus, the breadcrumb
 *   slotsOf       every place a block could be added on that page: before the first, between each pair, after the last, and (a page that
 *                 holds cards) the end of the container, where a card goes
 *   slotAccepts   may this piece stand in this slot? (design-places answers: `canPlacePiece`, the one place that knows the format)
 *   legalSlots    the slots a piece may stand in
 *   tileState     is an Add tile lit for this page, and when it is not, the reason the first refusing slot gives
 *   navEntries    the navigator's tree: the settings, the booklet, modules, tabs, activities, pages (blocks are not in it)
 *
 * Nothing here decides a rule of the format: every yes and no is design-places' (`canPlacePiece`, `placeCheck`, `addPosition`), and every
 * reason is its own words. Nothing here writes: a slot is a `DesignPosition` and the shell inserts at it through design-ops.
 */
import { pageTree, walkDesign, type DesignKind, type DesignNode, type PageEntry } from "./design-tree";
import { addPosition, ancestorsOf, canPlacePiece, needsOf, positionIn, type DesignPosition, type PlaceKind, type PlaceResult } from "./design-places";
import { crumbOf, nameOf, type Level } from "./design-model";
import { frontMatterOf, kvLine } from "./reader";
import type { Piece } from "./editor-pieces";

// ---------------------------------------------------------------- the page a selection draws

/**
 * The kinds that stand for a whole page of their own when selected: the booklet, a module, a module tab, an activity, an activity tab, a
 * page, and a data section (a card of the booklet or a module, drawn as a page of the blocks it holds). Anything else is a block, and a
 * selected block draws the page that holds it.
 */
const PAGE_KINDS: ReadonlySet<DesignKind> = new Set<DesignKind>(["booklet", "module", "module-tab", "activity", "activity-tab", "page", "data-section"]);

/**
 * The kinds that are cards on the page of the container that holds them: the parts a container is made of, each drawn as a small
 * tile that opens its own page. A page's own children are all blocks (a page is never a card of a page: pages are cards of a tab or of an
 * activity).
 */
const CARD_KINDS: ReadonlySet<DesignKind> = new Set<DesignKind>(["module", "module-tab", "activity", "activity-tab", "page", "data-section"]);

export interface Canvas {
	/**
	 * The node whose page is drawn: the selected node when it is a page-like container (a page, a tab, an activity, a module, the
	 * booklet, a data section), else the container that holds the selected block. Slots are positions in it.
	 */
	holder: DesignNode;
	/** `holder` when it is a `page` node, else null: a page is drawn as its own blocks, any other container as one page of its own. */
	page: DesignNode | null;
	/**
	 * The blocks drawn on the page, in order. For a `page` node, all its children. For any other container, its LEADING non-structural
	 * children: the words before its first part (the booklet's opening, a module's opening with its notice, a tab's or an activity's words
	 * before its first page line, which for a tab or an activity with pages is the format's "first page" of it). The front matter is
	 * never one (it is the settings form), the records section is when it leads (a locked block).
	 */
	blocks: DesignNode[];
	/**
	 * The parts the container holds, in file order, each a card that opens its own page: modules, module tabs, activities, activity tabs,
	 * pages, data sections. Empty for a `page`. Pages are listed flat in file order, not nested by `parent:` (`pageTree` has the drawn
	 * tree: the navigator nests them; a card per page needs no nesting).
	 */
	cards: DesignNode[];
	/**
	 * Blocks that stand AFTER the first card (text left between modules in the booklet, the records section after a module). The tree
	 * keeps them, so the page does not lose them: they are drawn after the cards, read as written, and have no slot.
	 */
	later: DesignNode[];
	/** The selected node when it is a block (or the front matter), else null: the one the view highlights. */
	focus: DesignNode | null;
	/** The child of `holder` that holds `focus` (the group, when the focus is a question inside one), else null. */
	focusBlock: DesignNode | null;
	/** The nodes from the booklet down to `holder`, for the breadcrumb. */
	crumb: DesignNode[];
	/** What the page is called: its name, else the words for its kind (`Module`). */
	title: string;
	/**
	 * True when only the first page of a tab or an activity is drawn (`canvasOf` with `firstPage`): its blocks, and no cards.
	 */
	firstPage: boolean;
}

export interface CanvasOptions {
	/** Draw only the leading blocks of a tab or an activity, with no cards: the navigator's "First page" entry. */
	firstPage?: boolean;
	/** The booklet's own name (`bookletTitleOf`), used as the title of the booklet's page and of an activity that has no line of its own. */
	title?: string;
}

/** The words for a node with no name of its own. English, as core's other reasons are; the shell may translate by `kind`. */
export const KIND_WORDS: Readonly<Partial<Record<DesignKind, string>>> = {
	booklet: "Booklet",
	"front-matter": "Settings",
	module: "Module",
	"module-tab": "Tab",
	activity: "Activity",
	"activity-tab": "Tab",
	page: "Page",
	"data-section": "Data",
	records: "Records",
};

/** The booklet's `title:` as written in the front matter, or "". */
export function bookletTitleOf(text: string): string {
	const head = frontMatterOf(text.split("\n")).head ?? [];
	for (const l of head) {
		const kv = kvLine(l.replace(/\r$/, ""));
		if (kv && kv[0] === "title") return kv[1];
	}
	return "";
}

const titleOf = (n: DesignNode, booklet: string | undefined): string => {
	const own = nameOf(n);
	if (own) return own;
	if ((n.kind === "booklet" || (n.kind === "activity" && n.implicit === true)) && booklet) return booklet;
	return KIND_WORDS[n.kind] ?? "";
};

/** The canvas for a node and the node's own enclosing page. */
const holderOf = (n: DesignNode): DesignNode => {
	for (let c: DesignNode | null = n; c; c = c.parent) if (PAGE_KINDS.has(c.kind)) return c;
	return n;
};

/**
 * What the canvas draws for a selected node (null is the booklet).
 *
 *   a `page`                       its own blocks (all its children), no cards
 *   a booklet, module, module tab, activity, activity tab, data section
 *                                  ONE PAGE OF ITS OWN: `blocks` are its leading non-structural children (the words before its first
 *                                  part; for a tab or an activity with pages, the format's first page), then `cards` are its parts
 *   a block (a question, a callout, a group, ...)
 *                                  the page that holds it, with the block as `focus`; a question inside a group draws the page that holds
 *                                  the group, with `focusBlock` the group
 *   the front matter               the booklet's page, with the front matter as `focus` (the view draws its form)
 */
export function canvasOf(root: DesignNode, selected: DesignNode | null, opts: CanvasOptions = {}): Canvas {
	const sel = selected ?? root;
	const holder = PAGE_KINDS.has(sel.kind) ? sel : holderOf(sel);
	const isBlock = holder !== sel;
	const kids = holder.children.filter((c) => c.kind !== "front-matter");
	const firstCard = kids.findIndex((c) => CARD_KINDS.has(c.kind));
	let blocks: DesignNode[];
	let cards: DesignNode[] = [];
	let later: DesignNode[] = [];
	if (holder.kind === "page" || firstCard < 0) {
		blocks = kids;
	} else {
		blocks = kids.slice(0, firstCard);
		if (opts.firstPage !== true) {
			const rest = kids.slice(firstCard);
			cards = rest.filter((c) => CARD_KINDS.has(c.kind));
			later = rest.filter((c) => !CARD_KINDS.has(c.kind));
		}
	}
	let focusBlock: DesignNode | null = null;
	if (isBlock) for (let c: DesignNode | null = sel; c; c = c.parent) if (c.parent === holder) focusBlock = c;
	return {
		holder,
		page: holder.kind === "page" ? holder : null,
		blocks,
		cards,
		later,
		focus: isBlock ? sel : null,
		focusBlock,
		crumb: crumbOf(holder),
		title: titleOf(holder, opts.title),
		firstPage: opts.firstPage === true && holder.kind !== "page",
	};
}

// ---------------------------------------------------------------- slots

export type SlotWhere = "start" | "between" | "end" | "child";

export interface Slot {
	/** Where the piece goes: a container and an index among its children (for `child`, the end of the container; see `slotPositionFor`). */
	position: DesignPosition;
	/**
	 *   start    above the first block (the only slot of a page with no block)
	 *   between  between two blocks
	 *   end      below the last block (above the first card, when the page holds cards)
	 *   child    the end of the container's content, for adding a part (a card): which end depends on the kind of the part, so it is
	 *            decided per piece (`slotPositionFor`), as "+ Add" does (`addPosition`)
	 */
	where: SlotWhere;
	/** The block just above it on the page, or null. */
	after: DesignNode | null;
	/** The block just below it on the page, or null. */
	before: DesignNode | null;
	/** Stable for the same tree: the holder, the kind of slot and the lines of the blocks around it. */
	id: string;
}

const slotId = (holder: DesignNode, where: SlotWhere, after: DesignNode | null, before: DesignNode | null): string => `${holder.kind}${holder.start}|${where}|${after ? after.start : ""}|${before ? before.start : ""}`;

/**
 * Every place a block could be added on a canvas, in order: above the first block, between each pair, below the last (n blocks make
 * n + 1 slots; none make one), and, when the page holds cards, the child slot after them. Out of scope for stage 1: the places inside a
 * group's or a row's own blocks (a group is one block on its page).
 */
export function slotsOf(canvas: Canvas): Slot[] {
	const { holder, blocks, cards } = canvas;
	const out: Slot[] = [];
	const at = (n: DesignNode): number => holder.children.indexOf(n);
	if (!blocks.length) {
		// the page has no block: its one slot is where its words would begin, above its first part (and below the front matter)
		const kids = holder.children;
		const firstCard = kids.findIndex((c) => CARD_KINDS.has(c.kind));
		const index = firstCard >= 0 ? firstCard : kids.length;
		out.push({ position: { parent: holder, index }, where: "start", after: null, before: null, id: slotId(holder, "start", null, null) });
	} else {
		const first = blocks[0] as DesignNode;
		out.push({ position: { parent: holder, index: at(first) }, where: "start", after: null, before: first, id: slotId(holder, "start", null, first) });
		for (let i = 0; i < blocks.length - 1; i++) {
			const a = blocks[i] as DesignNode;
			const b = blocks[i + 1] as DesignNode;
			out.push({ position: { parent: holder, index: at(a) + 1 }, where: "between", after: a, before: b, id: slotId(holder, "between", a, b) });
		}
		const last = blocks[blocks.length - 1] as DesignNode;
		out.push({ position: { parent: holder, index: at(last) + 1 }, where: "end", after: last, before: null, id: slotId(holder, "end", last, null) });
	}
	if (cards.length) {
		const lastCard = cards[cards.length - 1] as DesignNode;
		out.push({ position: positionIn(holder), where: "child", after: lastCard, before: null, id: slotId(holder, "child", lastCard, null) });
	}
	return out;
}

/** The kind "+ Add" files a piece's first part under for a container, or null when the piece has no part. */
function addKindOf(holder: DesignNode, piece: Pick<Piece, "file" | "text">): PlaceKind | null {
	const need = needsOf(piece)[0];
	if (!need) return null;
	return need === "tab" ? (holder.kind === "module" ? "module-tab" : "activity-tab") : need;
}

/**
 * Where a piece would go in a slot. A block slot is its own position. A child slot is the end of the container's content, which for a
 * module's tab, notice or opening words is above its first activity, and for a module or an activity added to the booklet is above its
 * data and records sections: `addPosition`, as "+ Add" in the container uses it.
 */
export function slotPositionFor(slot: Slot, piece: Pick<Piece, "file" | "text">): DesignPosition {
	if (slot.where !== "child") return slot.position;
	const kind = addKindOf(slot.position.parent, piece);
	return kind ? addPosition(slot.position.parent, kind) : slot.position;
}

/** What a piece's first part may be for it to be added as a part (a card) at the end of a container, not as a block among its blocks. */
const PART_NEEDS: ReadonlySet<string> = new Set(["module", "activity", "tab", "page", "data-section"]);

/**
 * May this piece stand in this slot? design-places answers (`canPlacePiece`). Two refusals are the slot's own and say so: a slot read from
 * another reading of the note, and a block offered to the child slot (that slot is where a part is added; a block lands among the blocks,
 * where `canPlacePiece` has already said whether it may: at the end of an activity's content a question would land in its last tab).
 */
export function slotAccepts(root: DesignNode, slot: Slot, piece: Pick<Piece, "file" | "text">): PlaceResult {
	if (ancestorsOf(slot.position.parent)[0] !== root) return { ok: false, reason: "This place is from another reading of the note. Open the view again." };
	if (slot.where === "child" && !PART_NEEDS.has(needsOf(piece)[0] ?? "")) return { ok: false, reason: "This place at the end adds a part of this page (a tab, a page, an activity, a module). A block goes between the blocks." };
	return canPlacePiece(slotPositionFor(slot, piece), piece);
}

/** The slots of the canvas this piece may stand in, in order. */
export function legalSlots(root: DesignNode, canvas: Canvas, piece: Pick<Piece, "file" | "text">): Slot[] {
	return slotsOf(canvas).filter((s) => slotAccepts(root, s, piece).ok);
}

/**
 * Is an Add tile lit for this page? It is when any slot of the page accepts the piece, or, with `slotId`, when that one slot does. When it
 * is not, `reason` is the first refusing slot's, in design-places' words (for example "A tab starts at the activity's own level: ...").
 */
export function tileState(root: DesignNode, canvas: Canvas, piece: Pick<Piece, "file" | "text">, slotId?: string): { ok: true } | { ok: false; reason: string } {
	const slots = slotsOf(canvas);
	const chosen = slotId === undefined ? slots : slots.filter((s) => s.id === slotId);
	if (!chosen.length) return { ok: false, reason: "That place is not on this page." };
	let why = "";
	for (const s of chosen) {
		const r = slotAccepts(root, s, piece);
		if (r.ok) return { ok: true };
		if (!why) why = r.reason;
	}
	return { ok: false, reason: why };
}

// ---------------------------------------------------------------- the navigator

export type NavKind = "settings" | "booklet" | "module" | "module-tab" | "activity" | "activity-tab" | "page" | "first-page" | "data-section";

export interface NavEntry {
	/** The node the entry stands for; null for a tab's or an activity's first page, which is words and no node of its own. */
	node: DesignNode | null;
	/** How far in it is drawn: the booklet and its settings 0, a module 1, a module's tab or activity 2. */
	depth: number;
	level: Level;
	/** What to show: the name of the node, else the words for its kind (`First page`, `Settings`). English; the shell may translate by `kind`. */
	label: string;
	kind: NavKind;
	/**
	 * The node whose page the entry opens (`canvasOf(root, holder)`): the node itself, the booklet for the settings, and for a first page the
	 * tab or activity whose words it is (draw it with `canvasOf(root, holder, { firstPage: true })`).
	 */
	holder: DesignNode;
}

const FIRST_PAGE_LABEL = "First page";
const SETTINGS_LABEL = "Settings";

/**
 * The navigator's tree in file order. The first entry is the booklet's settings (it opens the front matter as a form) when the note has
 * front matter, and the booklet's own entry follows it (so its opening and its modules stay reachable); with no front matter the booklet
 * is the first. Then: modules, and under each its tabs and activities; under an activity its tabs; under a tab (or under an activity with
 * no tab) its pages, nested under the page their `parent:` names (`pageTree`), the first one being the words before the first page line
 * when there are any (a tab or an activity with no page line has no "First page" entry: its own entry is that page). A data section is listed where the file has it. Blocks are not in the navigator.
 */
export function navEntries(root: DesignNode, opts: { title?: string } = {}): NavEntry[] {
	const out: NavEntry[] = [];
	const push = (node: DesignNode | null, depth: number, kind: NavKind, level: Level, label: string, holder: DesignNode): void => {
		out.push({ node, depth, level, label, kind, holder });
	};
	const front = root.children.find((c) => c.kind === "front-matter");
	if (front) push(front, 0, "settings", "booklet", SETTINGS_LABEL, root);
	push(root, 0, "booklet", "booklet", titleOf(root, opts.title), root);

	const pages = (holder: DesignNode, depth: number): void => {
		const walk = (list: readonly PageEntry[], d: number): void => {
			for (const e of list) {
				if (e.page) push(e.page, d, "page", "page", nameOf(e.page) || KIND_WORDS.page || "", e.page);
				else push(null, d, "first-page", "page", FIRST_PAGE_LABEL, holder);
				walk(e.children, d + 1);
			}
		};
		const tree = pageTree(holder);
		// a tab or an activity with no page line is one page, drawn by its own entry: a "First page" under it would be the same page twice
		if (tree.some((e) => e.page)) walk(tree, depth);
	};
	const activity = (a: DesignNode, depth: number): void => {
		push(a, depth, "activity", "activity", titleOf(a, opts.title), a);
		const tabs = a.children.filter((c) => c.kind === "activity-tab");
		if (tabs.length) {
			// an activity with tabs has its own opening (drawn above every tab, no page of any tab); its pages are its tabs'
			for (const t of tabs) {
				push(t, depth + 1, "activity-tab", "activity-tab", nameOf(t) || KIND_WORDS["activity-tab"] || "", t);
				pages(t, depth + 2);
			}
		} else pages(a, depth + 1);
	};
	const visit = (n: DesignNode, depth: number): void => {
		for (const c of n.children) {
			switch (c.kind) {
				case "module":
					push(c, depth, "module", "module", titleOf(c, undefined), c);
					visit(c, depth + 1);
					break;
				case "module-tab":
					push(c, depth, "module-tab", "module-tab", nameOf(c) || KIND_WORDS["module-tab"] || "", c);
					break;
				case "activity":
					activity(c, depth);
					break;
				case "data-section":
					push(c, depth, "data-section", "block", nameOf(c) || KIND_WORDS["data-section"] || "", c);
					break;
				default:
			}
		}
	};
	visit(root, 1);
	return out;
}

/** The nodes of the tree that a navigator entry could stand for (the structural ones), for a test of its completeness. */
export const navigableNodes = (root: DesignNode): DesignNode[] => walkDesign(root).filter((n) => n.parent !== null && PAGE_KINDS.has(n.kind));
