/*
 * The Design view: the third way to open a booklet note, beside the Booklet view (the reading page) and Markdown. It draws the note as the
 * tree the format is (design-tree.ts): the booklet's opening, modules, their tabs, activities, their tabs, pages and blocks, each level
 * with its own icon, indent, rail and one line saying what it is, and lets a person add, delete and move parts without writing a line of
 * Markdown. Stage B1 drew the tree, a strict "+ Add" and the changes. Stage C draws a question and a reading callout inert, as a reader sees
 * them (design-sample.ts); lists what "+ Add" offers as a catalogue in four folded groups, each part with a live sample and its keys; and
 * adds the nested hotkeys: a letter opens a popup on a group, a second picks a part, Enter adds it at the selected block's legal place.
 *
 * It never writes the whole file (note-view.ts). Every change is a smallest-byte replacement of the note (core/design-ops.ts, then
 * `minimalChange`), written into an open Markdown pane's editor or with `vault.process`; nothing else is touched or tidied. The view
 * keeps its own undo and redo of those replacements (core/design-undo.ts), since a `vault.process` write is not documented to join an
 * editor's undo. A person may delete her own work freely: a delete or a move that would leave kept data not matching says what, with
 * counts, and asks; it never blocks.
 */
import { Component, Scope, type Menu, type WorkspaceLeaf } from "obsidian";
import {
	DesignHistory,
	KEY_GROUPS,
	PIECES,
	WORDS_PIECE,
	addChoices,
	blockDrawing,
	blockLines,
	catalogueListing,
	containerAdds,
	crumbOf,
	deleteBlock,
	iconNamesOf,
	hasRemoteMedia,
	insertPiece,
	isBookletText,
	isContainer,
	isLaterKind,
	levelOf,
	minimalChange,
	moveBlock,
	moveTargets,
	nameOf,
	needsAsking,
	listingOf,
	parseDesign,
	placeFor,
	popupFor,
	stepPopup,
	walkDesign,
	whyImmovable,
	type AddGroup,
	type Activity,
	type AddPiece,
	type CatalogueId,
	type CatalogueListing,
	type DesignKey,
	type DesignKind,
	type DesignNode,
	type Level,
	type OpResult,
	type Piece,
	type PlaceKind,
	type PopupRow,
	type PopupState,
	type Question,
} from "./core";
import { askDesign } from "./design-modals";
import { drawInertQuestion, drawInertReading, questionOfPiece, questionsByLine, renderWords, type InertOptions } from "./design-sample";
import { MODE_ICONS, iconEl, iconName, ui, uin } from "./design-text";
import { markdownViewOf } from "./markdown-view";
import { LockedTextView, writeThrough } from "./note-view";
import { calloutColourIsTriplet } from "./reading";
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

/** Is this a field of text, or anything a person types in, or inside one? Then a key is hers, not the view's. */
export function isEditable(el: Element | null): boolean {
	return !!el && typeof el.closest === "function" && el.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}

/** The keys the view's scope listens on: letters and digits for the popup's letters, and the keys that drive it. A key outside the popup is left alone. */
const POPUP_KEYS: readonly string[] = [..."abcdefghijklmnopqrstuvwxyz123456789", " ", "Backspace", "Enter", "Escape", "ArrowUp", "ArrowDown"];

const CAT_TITLE: Readonly<Record<CatalogueId, DesignKey>> = { structure: "cat.structure.title", questions: "cat.questions.title", reading: "cat.reading.title", "views-data": "cat.views-data.title" };
const CAT_BLURB: Readonly<Record<CatalogueId, DesignKey>> = { structure: "cat.structure.blurb", questions: "cat.questions.blurb", reading: "cat.reading.blurb", "views-data": "cat.views-data.blurb" };

const spaced = (keys: string): string => keys.split("").join(" ");

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
	/** The catalogue's groups that are open, by container and group: a group is drawn (its samples with it) only while it is in here. */
	private readonly catOpen = new Set<string>();
	/** What each open group's samples are owned by, so closing the group (or drawing again) unloads them and everything they hold. */
	private readonly catParts = new Map<string, Component>();
	/** Where the key popup stands, or null when it is closed. */
	private popup: PopupState | null = null;
	private popupEl: HTMLElement | null = null;
	/** The questions of the note by their line, with their activities, found once for each drawing. */
	private questions = new Map<number, { activity: Activity; question: Question }>();
	/** Obsidian gives a callout's colour as a triplet (see reading.ts): said to every inert drawing. */
	private triplet = false;

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
		// the nested hotkeys: a scope of this view, never a command hotkey. Each key acts only when no field of text has the focus and no
		// modifier is held, so a key typed into a field (the small editor, a later stage) is the field's. What the scope does when a user has
		// bound the same key herself, and whether it hears a bare letter while a field has the focus, is not known without the real app: the
		// handler therefore checks the key's own target and the focused element before it acts, and passes the key on otherwise.
		for (const key of POPUP_KEYS) {
			this.scope.register([], key, (evt) => this.keyPress(evt, key));
			if (/^[a-z]$/.test(key)) this.scope.register(["Shift"], key, (evt) => this.keyPress(evt, key));
		}
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
			this.catOpen.clear();
			this.popup = null;
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
		this.catOpen.clear();
		this.popup = null;
		this.contentEl.empty();
	}

	/** The renderer's Component: made for a drawing and unloaded at the next, so its work never outlives what it drew. */
	private drop(): void {
		for (const part of this.catParts.values()) part.unload();
		this.catParts.clear();
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

		this.questions = isBookletText(this.text) ? questionsByLine(this.text) : new Map<number, { activity: Activity; question: Question }>();
		this.triplet = calloutColourIsTriplet(el);
		this.drawBar(el);
		this.popupEl = el.createDiv({ cls: "booklet-design-popup-host" });
		this.showPopup();
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
		// every keyboard action has a button: a phone has no hover and may have no keyboard
		const add = bar.createEl("button", { text: ui("keys.addPiece"), cls: "booklet-design-addpiece", attr: { type: "button", title: ui("keys.addPiece.title") } });
		add.addEventListener("click", () => this.openCatalogue());
		const groups = bar.createDiv({ cls: "booklet-design-groupbar", attr: { role: "group", "aria-label": ui("keys.bar") } });
		for (const g of KEY_GROUPS) {
			const b = groups.createEl("button", { text: g.title, cls: "booklet-design-group", attr: { type: "button", "data-key": g.key, "aria-label": ui("keys.group.label", { group: g.title, key: g.key }), title: g.blurb } });
			b.addEventListener("click", () => this.openKeys(g.key));
		}
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

	/** The options every inert drawing of this view is made with: what owns it, where the note is, and where it goes. */
	private inertOptions(into: HTMLElement, owner: Component): InertOptions {
		return { app: this.app, owner, sourcePath: this.file?.path ?? "", into, triplet: this.triplet };
	}

	private drawLeaf(box: HTMLElement, n: DesignNode): void {
		if (n.kind === "records") {
			box.createDiv({ cls: "booklet-design-what", text: ui("card.records") });
			return;
		}
		const lines = blockLines(this.text, n);
		const renderer = this.renderer;
		if (n.kind === "prose") {
			// words are drawn as Obsidian draws Markdown; the Component is the drawing's, unloaded at the next
			const words = box.createDiv({ cls: "booklet-design-prose markdown-rendered" });
			const markdown = lines.join("\n");
			if (renderer) renderWords(this.app, renderer, markdown, words, this.file?.path ?? "");
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
		// a block the drawing code draws is drawn as a reader sees it with nothing answered, and cannot be answered here; its lines stay one fold away
		const how = blockDrawing(n);
		const found = how === "question" ? this.questions.get(n.start) : undefined;
		let later = n.kind === "question" && isLaterKind(n.detail);
		let remote = false;
		if (renderer && how === "question" && found) {
			const into = box.createDiv({ cls: "booklet-design-drawn", attr: { role: "group", "aria-label": ui("draw.label") } });
			if (drawInertQuestion(this.inertOptions(into, renderer), found.activity, found.question)) {
				this.drawLines(box, n, "draw.fold");
				return;
			}
			into.remove();
			later = later || found.question.each !== null;
		} else if (renderer && how === "reading") {
			remote = hasRemoteMedia(lines.join("\n"));
			if (!remote) {
				const into = box.createDiv({ cls: "booklet-design-drawn", attr: { role: "group", "aria-label": ui("draw.label") } });
				drawInertReading(this.inertOptions(into, renderer), lines.join("\n"));
				this.drawLines(box, n, "draw.fold");
				return;
			}
		}
		// a labelled card: its kind, id and Markdown lines (a listen, a widget, a question asked for each pick and every view of data stay one in this beta)
		if (later) box.createDiv({ cls: "booklet-design-what", text: ui("draw.later") });
		else if (remote) box.createDiv({ cls: "booklet-design-what", text: ui("draw.remote") });
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

	/**
	 * The catalogue: only what is legal where it would go (core/design-model.ts `addChoices`, so no illegal part is ever listed); a part that
	 * waits on another says which. The parts are laid out in four groups, each folded to its name and one sentence and opened on a press;
	 * only an open group is drawn, with each part's live sample, so closed groups cost nothing.
	 */
	private drawPanel(row: HTMLElement, n: DesignNode): void {
		const choices = addChoices(n);
		const panel = row.createDiv({ cls: "booklet-design-panel", attr: { role: "group", "aria-label": ui("cat.label") } });
		for (const f of choices.first) panel.createDiv({ cls: "booklet-design-needs", text: ui("add.needs", { kind: ui(PLACE_KEY[f.kind]).toLowerCase(), first: ui(PLACE_KEY[f.first]).toLowerCase() }) });
		if (!choices.groups.length && !choices.first.length) panel.createDiv({ cls: "booklet-design-needs", text: ui("add.nothing") });
		for (const g of catalogueListing(choices, PIECES)) this.drawCatGroup(panel, n, g);
	}

	private drawCatGroup(panel: HTMLElement, n: DesignNode, g: CatalogueListing): void {
		const id = `${keyOf(n)}|${g.id}`;
		const wrap = panel.createDiv({ cls: "booklet-design-catgroup", attr: { "data-group": g.id } });
		const title = ui(CAT_TITLE[g.id]);
		const blurb = ui(CAT_BLURB[g.id]);
		const head = wrap.createEl("button", { cls: "booklet-design-cathead", attr: { type: "button", "aria-expanded": String(this.catOpen.has(id)), "aria-label": ui("cat.open.label", { group: title, blurb }) } });
		head.createSpan({ cls: "booklet-design-cattitle", text: title });
		head.createSpan({ cls: "booklet-design-catblurb", text: blurb });
		const fill = (): void => {
			wrap.querySelector(":scope > .booklet-design-catbody")?.remove();
			this.catParts.get(id)?.unload();
			this.catParts.delete(id);
			const open = this.catOpen.has(id);
			head.setAttribute("aria-expanded", String(open));
			wrap.toggleClass("is-open", open);
			if (!open) return;
			// the samples belong to a Component of their own, so closing the group lets go of them and of every observer they made
			const owner = this.renderer?.addChild(new Component());
			if (owner) this.catParts.set(id, owner);
			const body = wrap.createDiv({ cls: "booklet-design-catbody" });
			for (const e of g.entries) this.drawCatEntry(body, n, e, owner ?? null);
		};
		head.addEventListener("click", () => {
			if (this.catOpen.has(id)) this.catOpen.delete(id);
			else this.catOpen.add(id);
			fill();
		});
		if (this.catOpen.has(id)) fill();
	}

	private drawCatEntry(body: HTMLElement, n: DesignNode, e: CatalogueListing["entries"][number], owner: Component | null): void {
		const label = e.file === WORDS_PIECE.file ? ui("piece.words") : e.label;
		const name = capital(label);
		const item = body.createDiv({ cls: "booklet-design-catitem", attr: { "data-entry": e.file, "data-place": e.place.kind } });
		const head = item.createDiv({ cls: "booklet-design-catitem-head" });
		head.createSpan({ cls: "booklet-design-catlabel", text: name });
		head.createSpan({ cls: "booklet-design-catkeys", text: e.keys ? ui("cat.keys", { keys: spaced(e.keys) }) : ui("cat.nokeys") });
		const add = head.createEl("button", { text: ui("cat.add"), cls: "booklet-design-piece", attr: { type: "button", "data-piece": e.file, "aria-label": ui("cat.add.label", { name }) } });
		add.addEventListener("click", () => void this.add(n, e.place, e, label));
		// its sample: drawn from the piece's own text, which is fixed local content; a piece with no drawing is its Markdown, labelled
		const sample = item.createDiv({ cls: "booklet-design-catsample" });
		if (owner && e.sample === "question") {
			const q = questionOfPiece(e.text);
			sample.setAttribute("aria-label", ui("cat.sample.label", { name }));
			sample.setAttribute("role", "group");
			if (q && drawInertQuestion(this.inertOptions(sample, owner), q.activity, q.question)) return;
		} else if (owner && e.sample === "reading") {
			sample.setAttribute("aria-label", ui("cat.sample.label", { name }));
			sample.setAttribute("role", "group");
			drawInertReading(this.inertOptions(sample, owner), e.text.trimEnd());
			return;
		}
		sample.createEl("pre", { cls: "booklet-design-lines", attr: { "aria-label": ui("cat.card.label", { name }) }, text: e.text.trimEnd() });
	}

	/** Opens the catalogue of the container the selection is in (the booklet when nothing is selected), and puts the focus on its first group. */
	openCatalogue(): void {
		const root = this.root;
		if (!root) return;
		const at = this.selected ?? root;
		const container = isContainer(at) ? at : (at.parent ?? root);
		this.adding.add(keyOf(container));
		this.draw();
		this.boxes.get(keyOf(container))?.querySelector<HTMLElement>(":scope > .booklet-design-body > .booklet-design-addrow .booklet-design-cathead")?.focus();
	}

	/* ---- the key popup: a letter picks a group, a second a part, Enter adds it where the selection's legal place is ---- */

	/** Opens the popup on a group (or on the groups, with null). */
	openKeys(groupKey: string | null = null): void {
		this.popup = popupFor(groupKey);
		this.showPopup();
	}

	private closeKeys(): void {
		this.popup = null;
		this.showPopup();
	}

	/** One key of the scope. It acts only in a view with no field of text focused and no modifier held; every other key goes on to whatever it was for. */
	private keyPress(evt: KeyboardEvent, key: string): false | undefined {
		const doc = this.contentEl.ownerDocument;
		if (isEditable(evt.target as Element | null) || isEditable(doc.activeElement)) return undefined;
		if (evt.ctrlKey || evt.metaKey || evt.altKey) return undefined;
		if (!this.popup) {
			// closed: only a group's letter does anything (Shift and every other key are not the view's)
			const g = evt.shiftKey ? undefined : KEY_GROUPS.find((x) => x.key === key);
			if (!g) return undefined;
			this.openKeys(g.key);
			return false;
		}
		// open: Enter and Space on a button of the popup itself are that button's; everywhere else they are the popup's
		const target = evt.target as Element | null;
		if ((key === "Enter" || key === " ") && target && typeof target.closest === "function" && target.closest(".booklet-design-popup button")) return undefined;
		const step = stepPopup(this.popup, key);
		this.popup = step.state;
		if (step.choose) void this.chooseRow(step.choose);
		else this.showPopup();
		return false;
	}

	/** Where a piece would go for the keys, from the tree drawn now and the block selected. */
	private placeOf(piece: Piece): ReturnType<typeof placeFor> {
		return this.root ? placeFor(this.root, this.selected, piece) : { ok: false, reason: "There is nothing drawn yet." };
	}

	/** Takes a row of the popup: adds its piece, or says why it cannot go here and leaves the popup as it is. */
	private chooseRow(row: PopupRow): Promise<void> {
		const piece = row.piece;
		if (!piece) return Promise.resolve();
		const name = capital(piece.label);
		const placed = this.placeOf(piece);
		if (!placed.ok) {
			this.say(ui("keys.refused", { name, reason: placed.reason }));
			this.showPopup();
			return Promise.resolve();
		}
		return this.addAt(placed.position, piece, piece.label, null);
	}

	private showPopup(): void {
		const host = this.popupEl;
		if (!host) return;
		host.empty();
		const state = this.popup;
		if (!state) return;
		const list = listingOf(state);
		const box = host.createDiv({ cls: "booklet-design-popup", attr: { role: "group", "aria-label": ui("keys.label") } });
		const head = box.createDiv({ cls: "booklet-design-popup-head" });
		head.createSpan({ cls: "booklet-design-popup-title", text: ui("keys.title") });
		const back = head.createEl("button", { text: ui("keys.back"), cls: "booklet-design-popup-back", attr: { type: "button" } });
		back.addEventListener("click", () => {
			if (!this.popup) return;
			this.popup = this.popup.rest || this.popup.group ? stepPopup(this.popup, "Backspace").state : null;
			this.showPopup();
		});
		const close = head.createEl("button", { text: ui("keys.close"), cls: "booklet-design-popup-close", attr: { type: "button" } });
		close.addEventListener("click", () => this.closeKeys());
		box.createDiv({ cls: "booklet-design-popup-hint", text: ui("keys.hint") });
		const gname = list.group?.title ?? "";
		const typed = list.typed.trim();
		const line = list.mode === "groups" ? ui("keys.groups") : list.mode === "pieces" ? ui("keys.in", { group: gname }) : list.mode === "variants" ? ui("keys.variants", { name: capital(list.rows[0]?.label ?? "") }) : list.rows.length ? ui("keys.filter", { typed }) : ui("keys.none", { typed });
		box.createDiv({ cls: "booklet-design-popup-line", text: line, attr: { role: "status", "aria-live": "polite" } });
		const ul = box.createEl("ul", { cls: "booklet-design-popup-rows" });
		list.rows.forEach((r, i) => {
			const li = ul.createEl("li", { cls: ["booklet-design-popup-item", ...(i === list.cursor ? ["is-cursor"] : [])] });
			const placed = r.piece ? this.placeOf(r.piece) : null;
			const b = li.createEl("button", {
				cls: "booklet-design-popup-row",
				attr: {
					type: "button",
					"data-keys": r.keys.replace(/ /g, ""),
					...(r.piece ? { "data-piece": r.piece.file } : {}),
					...(i === list.cursor ? { "aria-current": "true" } : {}),
					"aria-label": r.opens ? ui("keys.group.label", { group: r.label, key: r.keys }) : ui("keys.pick.label", { name: capital(r.label), keys: r.keys || "Enter" }),
				},
			});
			b.createSpan({ cls: "booklet-design-popup-keys", text: r.keys || "↵" });
			b.createSpan({ cls: "booklet-design-popup-label", text: capital(r.label) });
			if (r.detail && r.opens) b.createSpan({ cls: "booklet-design-popup-detail", text: r.detail });
			else if (r.detail && list.mode === "filter") b.createSpan({ cls: "booklet-design-popup-detail", text: r.detail });
			if (placed && !placed.ok) {
				b.disabled = true;
				li.addClass("is-disabled");
				li.createDiv({ cls: "booklet-design-popup-why", text: ui("keys.disabled", { reason: placed.reason }) });
			}
			b.addEventListener("click", () => {
				if (!this.popup) return;
				if (r.opens) {
					this.popup = popupFor(r.opens);
					this.showPopup();
				} else void this.chooseRow(r);
			});
		});
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
		// the popup says which parts can go where the selection is
		if (this.popup) this.showPopup();
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
		return this.addAt(group.position, piece, label, keyOf(container));
	}

	/** Puts a piece at a position of the tree drawn now: the one insertion, from the catalogue and from the keys alike. `closes` is the container whose catalogue shuts. */
	private addAt(position: AddGroup["position"], piece: Pick<AddPiece, "file" | "text">, label: string, closes: string | null): Promise<void> {
		return this.later(async () => {
			if (closes) this.adding.delete(closes);
			this.popup = null;
			const op = insertPiece(this.text, position, { file: piece.file, text: piece.text });
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
		if (isEditable(evt.target as Element | null) || isEditable(this.contentEl.ownerDocument.activeElement)) return undefined;
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
