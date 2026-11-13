/*
 * The Design view: the third way to open a booklet note, beside the Booklet view (the reading page) and Markdown. It draws the note as the
 * tree the format is (design-tree.ts): the booklet's opening, modules, their tabs, activities, their tabs, pages and blocks, each level
 * with its own icon, indent, rail and one line saying what it is, and lets a person add, delete and move parts without writing a line of
 * Markdown. It is stage B1: the tree drawn, a strict "+ Add", and changes written through the plugin's one write path.
 *
 * It never writes the whole file (note-view.ts). Every change is a smallest-byte replacement of the note (core/design-ops.ts, then
 * `minimalChange`), written into an open Markdown pane's editor or with `vault.process`; nothing else is touched or tidied. The view
 * keeps its own undo and redo of those replacements (core/design-undo.ts), since a `vault.process` write is not documented to join an
 * editor's undo. A person may delete her own work freely: a delete or a move that would leave kept data not matching says what, with
 * counts, and asks; it never blocks.
 */
import { Component, MarkdownRenderer, Scope, type Menu, type WorkspaceLeaf } from "obsidian";
import {
	DesignHistory,
	WORDS_PIECE,
	addChoices,
	blockLines,
	containerAdds,
	crumbOf,
	deleteBlock,
	iconNamesOf,
	insertPiece,
	isBookletText,
	isContainer,
	levelOf,
	minimalChange,
	moveBlock,
	moveTargets,
	nameOf,
	needsAsking,
	parseDesign,
	walkDesign,
	whyImmovable,
	type AddGroup,
	type AddPiece,
	type DesignKey,
	type DesignKind,
	type DesignNode,
	type Level,
	type OpResult,
	type PlaceKind,
} from "./core";
import { askDesign } from "./design-modals";
import { MODE_ICONS, iconEl, iconName, ui, uin } from "./design-text";
import { markdownViewOf } from "./markdown-view";
import { LockedTextView, writeThrough } from "./note-view";
import type { LeafMode } from "./switch";

export const DESIGN_VIEW_TYPE = "booklet-design";

export interface DesignHost {
	setMode(leaf: WorkspaceLeaf, mode: LeafMode): Promise<void>;
}

const LEVEL_KEY: Readonly<Record<Level, DesignKey>> = {
	booklet: "level.booklet",
	module: "level.module",
	"module-tab": "level.module-tab",
	activity: "level.activity",
	"activity-tab": "level.activity-tab",
	page: "level.page",
	block: "level.block",
};

const WHAT_KEY: Readonly<Record<Level, DesignKey>> = {
	booklet: "what.booklet",
	module: "what.module",
	"module-tab": "what.module-tab",
	activity: "what.activity",
	"activity-tab": "what.activity-tab",
	page: "what.page",
	block: "what.block",
};

const KIND_KEY: Readonly<Partial<Record<DesignKind, DesignKey>>> = {
	"front-matter": "kind.front-matter",
	"data-section": "kind.data-section",
	records: "kind.records",
	group: "kind.group",
	row: "kind.row",
	question: "kind.question",
	callout: "kind.callout",
	notice: "kind.notice",
	menu: "kind.menu",
	query: "kind.query",
	fence: "kind.fence",
	"page-break": "kind.page-break",
	prose: "kind.prose",
	comment: "kind.comment",
	"as-written": "kind.as-written",
};

const PLACE_KEY: Readonly<Record<PlaceKind, DesignKey>> = {
	"front-matter": "place.front-matter",
	theme: "place.theme",
	module: "place.module",
	activity: "place.activity",
	"module-tab": "place.module-tab",
	"activity-tab": "place.activity-tab",
	page: "place.page",
	question: "place.question",
	copy: "place.copy",
	row: "place.row",
	group: "place.group",
	query: "place.query",
	menu: "place.menu",
	"data-block": "place.data-block",
	"data-section": "place.data-section",
	notice: "place.notice",
	"page-break": "place.page-break",
	callout: "place.callout",
	text: "place.text",
};

const EMPTY_KEY: Readonly<Partial<Record<DesignKind, DesignKey>>> = {
	booklet: "empty.booklet",
	module: "empty.module",
	"module-tab": "empty.module-tab",
	activity: "empty.activity",
	"activity-tab": "empty.activity-tab",
	page: "empty.page",
	group: "empty.group",
	row: "empty.row",
	"data-section": "empty.data-section",
};

const capital = (s: string): string => (s ? s[0]?.toUpperCase() + s.slice(1) : s);

/** A node's place in the drawing: its kind and first line (no two nodes share both). */
const keyOf = (n: DesignNode): string => `${n.kind}@${n.start}`;

/** Is a field of text, or anything a person types in, where the keys go? Then a key is hers, not the view's. */
function typing(el: Element | null): boolean {
	return !!el && el.matches("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
}

export class DesignView extends LockedTextView {
	/** The note's text as last read or written by this view: what getViewData returns. */
	private text = "";
	/** The tree of `text`, made at each drawing: the nodes the buttons act on. */
	private root: DesignNode | null = null;
	/** The block selected: its first line, and its kind when known (a line alone picks the outermost block that starts there). */
	private sel: { start: number; kind: DesignKind | null } | null = null;
	private readonly history = new DesignHistory();
	/** The containers whose "+ Add" is open, by `keyOf`. */
	private readonly adding = new Set<string>();
	private renderer: Component | null = null;
	private readonly boxes = new Map<string, HTMLElement>();
	private crumbEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private undoBtn: HTMLButtonElement | null = null;
	private redoBtn: HTMLButtonElement | null = null;
	/** What the view last said, kept across a drawing. */
	private message = "";
	/** A change is under way (a question open, a write landing): another press waits for it to finish. */
	private busy: Promise<void> | null = null;
	/** The presses a block has already taken (a press goes up through the blocks around it). */
	private readonly claimed = new WeakSet<Event>();
	/** The block `sel` names in the tree drawn now. */
	private selected: DesignNode | null = null;
	private followTimer: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly host: DesignHost,
	) {
		super(leaf);
	}

	override onload(): void {
		super.onload();
		this.contentEl.addClass("booklet-design");
		// the other two ways to open this note, one button each; the Markdown view is always one press away
		this.addAction(iconName(MODE_ICONS.markdown, "file-text"), ui("mode.markdown"), () => void this.host.setMode(this.leaf, "markdown"));
		this.addAction(iconName(MODE_ICONS.booklet, "book-open"), ui("mode.booklet"), () => void this.host.setMode(this.leaf, "booklet"));
		// undo and redo by key, only when no field has the focus: in a field the key is the field's own
		this.scope ??= new Scope(this.app.scope);
		this.scope.register(["Mod"], "z", (evt) => this.undoKey(evt, "undo"));
		this.scope.register(["Mod", "Shift"], "z", (evt) => this.undoKey(evt, "redo"));
		// words typed in a Markdown pane of the same note are in its editor before they are saved: this view follows them
		this.registerEvent(
			this.app.workspace.on("editor-change", (_editor, info) => {
				if (this.file && info.file === this.file) this.followSoon();
			}),
		);
		this.register(() => {
			if (this.followTimer !== null) window.clearTimeout(this.followTimer);
			this.followTimer = null;
			this.drop();
		});
		this.history.onChange(() => this.showUndo());
	}

	getViewType(): string {
		return DESIGN_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : ui("view.name");
	}

	override getIcon(): string {
		return iconName(MODE_ICONS.design, "pencil");
	}

	override onPaneMenu(menu: Menu, source: string): void {
		for (const [mode, key, icon] of [
			["markdown", "mode.markdown", "file-text"],
			["booklet", "mode.booklet", "book-open"],
		] as const)
			menu.addItem((item) =>
				item
					.setTitle(ui(key))
					.setIcon(icon)
					.setSection("pane")
					.onClick(() => void this.host.setMode(this.leaf, mode)),
			);
		super.onPaneMenu(menu, source);
	}

	/* ---- the note in: what Obsidian hands the view ---- */

	getViewData(): string {
		return this.text;
	}

	setViewData(data: string, clear: boolean): void {
		// While the note is also open as Markdown, that pane's editor holds the newest text (words typed and not saved yet); the text
		// handed over is the file as last saved, which can be older. So the editor's text is taken, as the Booklet view takes it.
		const md = this.file ? markdownViewOf(this.app, this.file.path) : null;
		const live = md ? md.editor.getValue() : "";
		if (md && live && live !== data) data = live;
		if (clear) {
			this.sel = null;
			this.adding.clear();
			this.history.clear();
			this.message = "";
		} else if (data === this.text && this.root) return; // Obsidian hands the view its own write back: nothing to draw
		this.text = data;
		this.data = data;
		this.draw();
	}

	clear(): void {
		this.text = "";
		this.data = "";
		this.drop();
		this.history.clear();
		this.sel = null;
		this.adding.clear();
		this.contentEl.empty();
	}

	/** The renderer's Component: made for a drawing and unloaded at the next, so its work never outlives what it drew. */
	private drop(): void {
		if (!this.renderer) return;
		const old = this.renderer;
		this.renderer = null;
		this.removeChild(old);
		old.unload();
	}

	private followSoon(): void {
		if (this.followTimer !== null) window.clearTimeout(this.followTimer);
		this.followTimer = window.setTimeout(() => {
			this.followTimer = null;
			const md = this.file ? markdownViewOf(this.app, this.file.path) : null;
			const live = md ? md.editor.getValue() : "";
			if (live && live !== this.text && !this.busy) {
				this.text = live;
				this.data = live;
				this.draw();
			}
		}, 150);
	}

	/** Resolves when no change is under way (for the tests, and for whatever must wait for a write). */
	async whenIdle(): Promise<void> {
		while (this.busy) await this.busy;
	}

	/* ---- drawing ---- */

	private draw(): void {
		const el = this.contentEl;
		const top = el.scrollTop;
		this.drop();
		this.renderer = this.addChild(new Component());
		el.empty();
		this.boxes.clear();
		const root = parseDesign(this.text);
		this.root = root;
		this.selected = this.find(root);
		if (!this.selected) this.sel = null;

		this.drawBar(el);
		if (!isBookletText(this.text)) el.createDiv({ cls: "booklet-design-banner", text: ui("note.notBooklet") });
		this.crumbEl = el.createEl("nav", { cls: "booklet-design-crumb", attr: { "aria-label": ui("crumb.label") } });
		this.statusEl = el.createDiv({ cls: "booklet-design-status", attr: { role: "status", "aria-live": "polite", "aria-label": ui("status.label") } });
		this.statusEl.setText(this.message);
		const tree = el.createDiv({ cls: "booklet-design-tree" });
		this.drawNode(tree, root);
		this.drawCrumb();
		this.showUndo();
		el.scrollTop = top;
	}

	private drawBar(parent: HTMLElement): void {
		const bar = parent.createDiv({ cls: "booklet-design-bar", attr: { role: "toolbar", "aria-label": ui("toolbar.label") } });
		this.undoBtn = bar.createEl("button", { text: ui("undo"), cls: "booklet-design-undo", attr: { type: "button", title: ui("undo.title") } });
		this.redoBtn = bar.createEl("button", { text: ui("redo"), cls: "booklet-design-redo", attr: { type: "button", title: ui("redo.title") } });
		this.undoBtn.addEventListener("click", () => void this.stepBack("undo"));
		this.redoBtn.addEventListener("click", () => void this.stepBack("redo"));
	}

	private showUndo(): void {
		if (this.undoBtn) this.undoBtn.disabled = !this.history.canUndo;
		if (this.redoBtn) this.redoBtn.disabled = !this.history.canRedo;
	}

	/** The block the view's selection names, found in a tree. */
	private find(root: DesignNode): DesignNode | null {
		const s = this.sel;
		if (!s) return null;
		return walkDesign(root).find((n) => n.start === s.start && (s.kind === null || n.kind === s.kind)) ?? null;
	}

	private kindName(n: DesignNode): string {
		const level = levelOf(n);
		return ui(level === "block" ? (KIND_KEY[n.kind] ?? "level.block") : LEVEL_KEY[level]);
	}

	/** What a node is called: its title or id; the booklet is called what its note is. */
	private called(n: DesignNode): string {
		return n.parent ? nameOf(n) : (this.file?.basename ?? "");
	}

	/** What a block is called on screen: its kind, and its title or id when it has one. */
	private titled(n: DesignNode): string {
		const name = this.called(n);
		return name ? `${this.kindName(n)}: ${name}` : this.kindName(n);
	}

	private drawNode(parent: HTMLElement, n: DesignNode): void {
		const level = levelOf(n);
		const container = isContainer(n);
		const selected = this.selected === n;
		const box = parent.createDiv({
			cls: ["booklet-design-node", `is-level-${level}`, `is-kind-${n.kind}`, container ? "is-container" : "is-leaf", ...(selected ? ["is-selected"] : [])],
			attr: { "data-kind": n.kind, "data-level": level, "data-start": String(n.start), role: "group", "aria-label": this.titled(n) },
		});
		this.boxes.set(keyOf(n), box);
		// a press anywhere on a block that is not on a control of its own selects it; of nested blocks, the innermost
		box.addEventListener("click", (evt) => {
			if (this.claimed.has(evt)) return;
			// (the target is an element of whichever window the view is in, so it is not tested with `instanceof`)
			const hit = evt.target as Element | null;
			if (hit && typeof hit.closest === "function" && hit.closest("button, summary, a, input, textarea, select")) return;
			this.claimed.add(evt);
			this.select(n);
		});

		const head = box.createDiv({ cls: "booklet-design-head" });
		const icon = head.createSpan({ cls: "booklet-design-icon", attr: { "aria-hidden": "true" } });
		const svg = iconEl(iconNamesOf(n));
		if (svg) icon.appendChild(svg);
		const pick = head.createEl("button", { cls: "booklet-design-pick", attr: { type: "button", "aria-pressed": String(selected), "aria-label": ui("act.select.label", { name: this.titled(n) }) } });
		pick.createSpan({ cls: "booklet-design-kind", text: this.kindName(n), attr: { title: ui(WHAT_KEY[level]) } });
		const name = this.called(n);
		pick.createSpan({ cls: "booklet-design-name", text: name || ui("card.untitled") });
		// what a card shows of a block the view does not draw yet: its kind, as the format names it, and its id
		const more = [n.kind === "question" || n.kind === "callout" || n.kind === "fence" ? n.detail : "", n.id && n.id !== name ? n.id : ""].filter(Boolean).join(" · ");
		if (more) head.createSpan({ cls: "booklet-design-more", text: more });
		pick.addEventListener("click", () => this.select(n));
		this.drawActions(head, n);

		if (container) {
			box.createDiv({ cls: "booklet-design-what", text: ui(WHAT_KEY[level]) });
			if (n.parent) this.drawLines(box, n, "card.fold");
			const body = box.createDiv({ cls: "booklet-design-body" });
			for (const c of n.children) this.drawNode(body, c);
			this.drawAdd(body, n);
		} else this.drawLeaf(box, n);
	}

	/** Delete, Move up and Move down: visible buttons, no hover and no drag, so a phone has every one. Not where the view never touches the block. */
	private drawActions(head: HTMLElement, n: DesignNode): void {
		const movable = !!n.parent && !whyImmovable(n, "moved");
		const deletable = !!n.parent && !whyImmovable(n, "deleted");
		if (!movable && !deletable) return;
		const acts = head.createDiv({ cls: "booklet-design-actions", attr: { role: "group", "aria-label": this.titled(n) } });
		if (movable) {
			const to = moveTargets(n);
			const up = acts.createEl("button", { text: ui("act.up"), cls: "booklet-design-up", attr: { type: "button", "aria-label": ui("act.up.label", { name: this.titled(n) }) } });
			const down = acts.createEl("button", { text: ui("act.down"), cls: "booklet-design-down", attr: { type: "button", "aria-label": ui("act.down.label", { name: this.titled(n) }) } });
			up.disabled = !to.up;
			down.disabled = !to.down;
			up.addEventListener("click", () => void this.move(n, to.up));
			down.addEventListener("click", () => void this.move(n, to.down));
		}
		if (deletable) {
			const del = acts.createEl("button", { text: ui("act.delete"), cls: "booklet-design-delete", attr: { type: "button", "aria-label": ui("act.delete.label", { name: this.titled(n) }) } });
			del.addEventListener("click", () => void this.remove(n));
		}
	}

	/** A block's own lines, as the note has them, in a fold: nothing the view draws is hidden from the person who wants to see the Markdown. */
	private drawLines(box: HTMLElement, n: DesignNode, label: DesignKey): void {
		const lines = blockLines(this.text, n);
		const fold = box.createEl("details", { cls: "booklet-design-fold" });
		fold.createEl("summary", { text: ui(label) });
		fold.createEl("pre", { cls: "booklet-design-lines", text: lines.join("\n") });
	}

	private drawLeaf(box: HTMLElement, n: DesignNode): void {
		if (n.kind === "records") {
			box.createDiv({ cls: "booklet-design-what", text: ui("card.records") });
			return;
		}
		const lines = blockLines(this.text, n);
		if (n.kind === "prose") {
			// words are drawn as Obsidian draws Markdown; the Component is the drawing's, unloaded at the next
			const words = box.createDiv({ cls: "booklet-design-prose markdown-rendered" });
			const markdown = lines.join("\n");
			const renderer = this.renderer;
			if (renderer) void MarkdownRenderer.render(this.app, markdown, words, this.file?.path ?? "", renderer).catch(() => words.setText(markdown));
			else words.setText(markdown);
			return;
		}
		// text the view cannot read is shown exactly as the note has it, `>` marks of any group around it included
		if (n.kind === "as-written") {
			box.createDiv({ cls: "booklet-design-what", text: n.detail ? `${ui("card.asWritten")} ${n.detail}` : ui("card.asWritten") });
			const raw = this.text.split("\n").slice(n.start, n.end).map((l) => l.replace(/\r$/, ""));
			while (raw.length > 1 && !(raw[raw.length - 1] ?? "").trim()) raw.pop();
			box.createEl("pre", { cls: "booklet-design-lines", attr: { "aria-label": ui("card.lines") }, text: raw.join("\n") });
			return;
		}
		// every other block is a small labelled card in this stage: its kind, id and Markdown lines
		box.createEl("pre", { cls: "booklet-design-lines", attr: { "aria-label": ui("card.lines") }, text: lines.join("\n") });
	}

	/** What a container says it holds nothing and what to add, then its "+ Add". */
	private drawAdd(body: HTMLElement, n: DesignNode): void {
		const k = keyOf(n);
		const adds = containerAdds(n);
		const emptyKey = EMPTY_KEY[n.kind];
		if (adds.empty !== null && emptyKey) body.createDiv({ cls: "booklet-design-empty", text: ui(emptyKey) });
		const row = body.createDiv({ cls: "booklet-design-addrow" });
		const open = this.adding.has(k);
		const button = row.createEl("button", { text: ui("act.add"), cls: "booklet-design-add", attr: { type: "button", "aria-expanded": String(open), "aria-label": ui("act.add.label", { name: this.titled(n) }) } });
		button.addEventListener("click", () => {
			if (this.adding.has(k)) this.adding.delete(k);
			else this.adding.add(k);
			this.draw();
			this.boxes.get(k)?.querySelector<HTMLElement>(":scope > .booklet-design-body > .booklet-design-addrow .booklet-design-add")?.focus();
		});
		if (open) this.drawPanel(row, n);
	}

	/** Only what is legal where it would go (core/design-model.ts `addChoices`); a part that waits on another says which. */
	private drawPanel(row: HTMLElement, n: DesignNode): void {
		const choices = addChoices(n);
		const panel = row.createDiv({ cls: "booklet-design-panel", attr: { role: "group", "aria-label": ui("add.panel") } });
		for (const f of choices.first) panel.createDiv({ cls: "booklet-design-needs", text: ui("add.needs", { kind: ui(PLACE_KEY[f.kind]).toLowerCase(), first: ui(PLACE_KEY[f.first]).toLowerCase() }) });
		if (!choices.groups.length && !choices.first.length) panel.createDiv({ cls: "booklet-design-needs", text: ui("add.nothing") });
		for (const g of choices.groups) {
			const group = panel.createDiv({ cls: "booklet-design-addgroup", attr: { "data-kind": g.kind } });
			group.createDiv({ cls: "booklet-design-addkind", text: ui(PLACE_KEY[g.kind]) });
			const buttons = group.createDiv({ cls: "booklet-design-addbuttons" });
			for (const p of g.pieces) {
				const label = p.file === WORDS_PIECE.file ? ui("piece.words") : p.label;
				const b = buttons.createEl("button", { text: capital(label), cls: "booklet-design-piece", attr: { type: "button", "data-piece": p.file } });
				b.addEventListener("click", () => void this.add(n, g, p, label));
			}
		}
	}

	private drawCrumb(): void {
		const nav = this.crumbEl;
		const root = this.root;
		if (!nav || !root) return;
		nav.empty();
		const trail = crumbOf(this.selected ?? root);
		trail.forEach((n, i) => {
			if (i) nav.createSpan({ cls: "booklet-design-crumb-sep", text: "›", attr: { "aria-hidden": "true" } });
			const label = this.titled(n);
			const b = nav.createEl("button", { text: label, cls: "booklet-design-crumb-item", attr: { type: "button" } });
			if (i === trail.length - 1) b.setAttribute("aria-current", "true");
			b.addEventListener("click", () => this.select(n));
		});
	}

	private select(n: DesignNode): void {
		const root = this.root;
		if (!root) return;
		const before = this.selected;
		this.sel = n === root ? null : { start: n.start, kind: n.kind };
		this.selected = n === root ? null : n;
		if (before) {
			this.boxes.get(keyOf(before))?.removeClass("is-selected");
			this.boxes.get(keyOf(before))?.querySelector(":scope > .booklet-design-head .booklet-design-pick")?.setAttribute("aria-pressed", "false");
		}
		const box = this.boxes.get(keyOf(n));
		if (n !== root) {
			box?.addClass("is-selected");
			box?.querySelector(":scope > .booklet-design-head .booklet-design-pick")?.setAttribute("aria-pressed", "true");
		}
		this.drawCrumb();
	}

	private say(words: string): void {
		this.message = words;
		this.statusEl?.setText(words);
	}

	/* ---- changes: each one is an operation on the text, asked about when it counts something, then written ---- */

	private later(work: () => Promise<void>): Promise<void> {
		if (this.busy) return this.busy;
		const run = work().finally(() => {
			this.busy = null;
		});
		this.busy = run;
		return run;
	}

	private add(container: DesignNode, group: AddGroup, piece: AddPiece, label: string): Promise<void> {
		return this.later(async () => {
			this.adding.delete(keyOf(container));
			const op = insertPiece(this.text, group.position, { file: piece.file, text: piece.text });
			await this.carryOut(op, { how: "add", name: capital(label), select: "lines" });
		});
	}

	private remove(n: DesignNode): Promise<void> {
		return this.later(async () => {
			const op = deleteBlock(this.text, n);
			await this.carryOut(op, { how: "delete", name: this.titled(n), node: n, select: n.parent ? { start: n.parent.start, kind: n.parent.kind } : "lines" });
		});
	}

	private move(n: DesignNode, to: ReturnType<typeof moveTargets>["up"]): Promise<void> {
		return this.later(async () => {
			if (!to) return;
			const op = moveBlock(this.text, n, to);
			await this.carryOut(op, { how: "move", name: this.titled(n), node: n, select: "lines" });
		});
	}

	/**
	 * Makes a change: a refusal is said in words and nothing is written; a change that reports kept data it would leave not matching is
	 * asked about first (a no changes nothing); then it is written as the smallest replacement, recorded for undo, and drawn.
	 */
	private async carryOut(op: OpResult, how: { how: "add" | "delete" | "move"; name: string; node?: DesignNode; select: "lines" | { start: number; kind: DesignKind } }): Promise<void> {
		this.message = "";
		if (!op.ok) {
			this.say(op.reason);
			this.draw();
			return;
		}
		if (!op.change) {
			this.draw();
			return;
		}
		if (how.how !== "add" && needsAsking(op) && how.node) {
			const yes = await askDesign(this.app, {
				how: how.how,
				kind: this.kindName(how.node),
				name: `“${nameOf(how.node) || this.kindName(how.node)}”`,
				lines: uin("confirm.lines", this.lineCount(how.node)),
				impacts: op.impact,
				blind: op.blind,
				notes: op.notes,
			});
			if (!yes) {
				this.say(ui("status.cancelled"));
				this.draw();
				return;
			}
		}
		const before = this.text;
		const landed = await this.commit(before, op.text);
		if (!landed) return;
		this.history.record(before, op.text);
		this.text = op.text;
		this.data = op.text;
		this.sel = how.select === "lines" ? (op.lines ? { start: op.lines.start, kind: null } : null) : how.select;
		this.say([ui(how.how === "add" ? "status.added" : how.how === "delete" ? "status.deleted" : "status.moved", { name: how.name }), ...op.notes].join(" "));
		this.draw();
		this.focusSelected();
	}

	/** The lines a block takes with it, not counting the blank lines after it. */
	private lineCount(n: DesignNode): number {
		const lines = this.text.split("\n");
		let end = n.end;
		while (end - 1 > n.start && !(lines[end - 1] ?? "").trim()) end--;
		return end - n.start;
	}

	private focusSelected(): void {
		const root = this.root;
		if (!root) return;
		this.boxes.get(keyOf(this.selected ?? root))?.querySelector<HTMLElement>(":scope > .booklet-design-head .booklet-design-pick")?.focus();
	}

	/**
	 * Writes `after` in place of `before`, the note as this view read it, as the smallest replacement: into an open Markdown pane's editor or
	 * with `vault.process`. Written only when the note is still exactly `before`; if it is anything else (changed since this view drew
	 * it) nothing is written, the view takes the note as it is, and says so. Gives true when the note is now `after`.
	 */
	private async commit(before: string, after: string): Promise<boolean> {
		const file = this.file;
		if (!file || !minimalChange(before, after)) return false;
		let result: string;
		try {
			result = await writeThrough(this.app, file, (fresh) => (fresh === before ? after : fresh));
		} catch {
			this.say(ui("status.failed"));
			this.draw();
			return false;
		}
		if (result === after) return true;
		this.text = result;
		this.data = result;
		this.say(ui("status.stale"));
		this.draw();
		return false;
	}

	/* ---- undo and redo: this view's own, of its own writes ---- */

	private undoKey(evt: KeyboardEvent, which: "undo" | "redo"): false | undefined {
		// in a field the key is the field's: the view does nothing and the key goes on to it
		if (typing(this.contentEl.ownerDocument.activeElement)) return undefined;
		evt.preventDefault();
		void this.stepBack(which);
		return false;
	}

	/** Undo or redo the last step of this view, on the note as it is now; refused, with a reason, when the note is not as that step left it. */
	stepBack(which: "undo" | "redo"): Promise<void> {
		return this.later(async () => {
			this.message = "";
			const undo = which === "undo";
			const plan = undo ? this.history.planUndo(this.text) : this.history.planRedo(this.text);
			if (!plan.ok) {
				this.say(ui(plan.reason === "empty" ? (undo ? "status.nothingUndo" : "status.nothingRedo") : undo ? "status.undoChanged" : "status.redoChanged"));
				return;
			}
			const before = this.text;
			if (!(await this.commit(before, plan.text))) return;
			if (undo) this.history.settleUndo();
			else this.history.settleRedo();
			this.text = plan.text;
			this.data = plan.text;
			this.sel = null;
			this.say(ui(undo ? "status.undone" : "status.redone"));
			this.draw();
		});
	}
}
