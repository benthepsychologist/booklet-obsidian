/*
 * The Design view's left column, Outline tab: the navigator and, at its foot, what the reader says about the note. Plain functions over a
 * context the view hands in; nothing here owns state or writes the note.
 *
 *   drawNav       the tree of core/design-canvas.ts `navEntries`: the booklet's settings first, then the booklet, its modules, their tabs and
 *                 activities, an activity's tabs, and pages nested under the page their `parent:` names. Each entry has its level's icon and
 *                 colour; a container folds (and the fold is remembered by the view); a press selects the entry and the canvas draws it
 *   drawTroubles  the two lists the beta drew in its side panel: lines the reader cannot read, and kept data that matches nothing now, each
 *                 entry going to its block
 */
import { LEVEL_ICONS, iconNamesOf, nameOf, type DesignNode, type NavEntry, type Trouble } from "./core";
import { drawIcon } from "./design-picture";
import { ui } from "./design-text";
import { kindName } from "./design-words";

/** What the navigator asks of the view. */
export interface NavCtx {
	entries: readonly NavEntry[];
	/** The entry the canvas is drawing. */
	isCurrent(e: NavEntry): boolean;
	isFolded(key: string): boolean;
	fold(key: string): void;
	select(e: NavEntry): void;
}

/** What an entry is called: the settings and a first page by the view's words, a part by its name, else by what it is. */
export function navLabel(e: NavEntry): string {
	if (e.kind === "settings") return ui("form.heading");
	if (e.kind === "first-page") return ui("nav.firstPage");
	if (e.node && e.node.parent) return nameOf(e.node) || kindName(e.node);
	return e.label;
}

/** An entry's place in the fold memory: its kind, its label and which of those it is, so it survives an edit that moves its line. */
export function foldKeys(entries: readonly NavEntry[]): string[] {
	const seen = new Map<string, number>();
	return entries.map((e) => {
		const base = `${e.kind}|${e.label}`;
		const n = seen.get(base) ?? 0;
		seen.set(base, n + 1);
		return `${base}|${n}`;
	});
}

const iconsOf = (e: NavEntry): readonly string[] => (e.node ? iconNamesOf(e.node) : LEVEL_ICONS.page);

export function drawNav(host: HTMLElement, ctx: NavCtx): void {
	const keys = foldKeys(ctx.entries);
	const list = host.createEl("ul", { cls: "booklet-design-nav", attr: { role: "tree", "aria-label": ui("outline.label") } });
	// the entries under a folded one are not drawn: a skipped depth says where its subtree ends
	let hiddenBelow: number | null = null;
	ctx.entries.forEach((e, i) => {
		if (hiddenBelow !== null) {
			if (e.depth > hiddenBelow) return;
			hiddenBelow = null;
		}
		const next = ctx.entries[i + 1];
		const container = !!next && next.depth > e.depth;
		const key = keys[i] ?? "";
		const folded = container && ctx.isFolded(key);
		if (folded) hiddenBelow = e.depth;
		const current = ctx.isCurrent(e);
		const li = list.createEl("li", {
			cls: ["booklet-design-nav-row", `is-level-${e.level}`, `is-depth-${Math.min(e.depth, 8)}`, ...(current ? ["is-current"] : [])],
			attr: { role: "treeitem", "aria-level": String(e.depth + 1), "aria-selected": String(current), ...(container ? { "aria-expanded": String(!folded) } : {}), "data-kind": e.kind },
		});
		const label = navLabel(e);
		if (container) {
			const caret = li.createEl("button", { cls: "booklet-design-nav-caret", attr: { type: "button", "aria-label": ui(folded ? "nav.unfold" : "nav.fold", { name: label }), "data-focus": `fold:${key}` } });
			caret.createSpan({ text: folded ? "▸" : "▾", attr: { "aria-hidden": "true" } });
			caret.addEventListener("click", () => ctx.fold(key));
		} else li.createSpan({ cls: "booklet-design-nav-caret is-spacer" });
		const pick = li.createEl("button", {
			cls: "booklet-design-nav-item",
			attr: { type: "button", "data-focus": `nav:${key}`, "data-kind": e.kind, "data-start": e.node ? String(e.node.start) : "", ...(current ? { "aria-current": "page" } : {}) },
		});
		const icon = pick.createSpan({ cls: "booklet-design-nav-icon" });
		drawIcon(icon, iconsOf(e));
		pick.createSpan({ cls: "booklet-design-nav-label", text: label });
		pick.addEventListener("click", () => ctx.select(e));
	});
}

/** What the reader says of the note: two folded lists, each entry going to the block it is about. */
export interface TroubleCtx {
	open: boolean;
	remember(open: boolean): void;
	go(node: DesignNode): void;
}

const TROUBLE_KEYS = {
	problems: { title: "problems.title", count: "problems.title.count", label: "problems.label", none: "problems.none" },
	leftovers: { title: "leftovers.title", count: "leftovers.title.count", label: "leftovers.label", none: "leftovers.none" },
} as const;

export function drawTroubles(side: HTMLElement, list: readonly Trouble[], name: "problems" | "leftovers", ctx: TroubleCtx): void {
	const det = side.createEl("details", { cls: `booklet-design-${name}`, attr: { "data-count": String(list.length) } });
	det.open = ctx.open;
	const words = TROUBLE_KEYS[name];
	det.createEl("summary", { text: list.length ? ui(words.count, { n: list.length }) : ui(words.title) });
	det.addEventListener("toggle", () => ctx.remember(det.open));
	if (!list.length) {
		det.createEl("p", { cls: "booklet-design-hint", text: ui(words.none) });
		return;
	}
	const ul = det.createEl("ul", { cls: "booklet-design-trouble-list", attr: { "aria-label": ui(words.label) } });
	for (const { problem: p, node } of list) {
		const li = ul.createEl("li", { cls: `booklet-design-trouble booklet-design-${p.kind}` });
		const where = p.line === null ? ui("problems.note") : ui("problems.line", { n: p.line + 1 });
		const said = `${where}: ${p.why}`;
		if (!node) {
			li.createSpan({ text: said });
			continue;
		}
		const b = li.createEl("button", { cls: "booklet-design-jump", attr: { type: "button", "data-start": String(node.start), "aria-label": ui("problems.go", { where, why: p.why }) } });
		b.createSpan({ cls: "booklet-design-trouble-why", text: said });
		if (p.text) b.createEl("code", { cls: "booklet-design-trouble-line", text: p.text });
		b.addEventListener("click", () => ctx.go(node));
	}
}
