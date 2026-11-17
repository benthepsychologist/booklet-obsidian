/*
 * The Design view: the third way to open a booklet note, beside the Booklet view (the reading page) and Markdown. It is a page you edit,
 * drawn the way a reader sees it: a left column of two tabs and a canvas that shows ONE PAGE of the booklet at a time.
 *
 *   Outline tab   the navigator (design-nav.ts): the booklet's settings, the booklet, modules, tabs, activities and pages; and what the reader
 *                 says of the note (lines it cannot read, kept data that matches nothing). A press selects an entry and the canvas draws it
 *   Add tab       the palette (design-palette.ts): every piece the format has as a picture tile, a Common row, and the place a clicked "+" is.
 *                 Placing works like chess: pick a tile and the places it may go light up, or click a "+" and only the tiles that may go
 *                 there stay lit; a tile can also be dragged. Letters still work (a group's, then a piece's): they pick a tile, Enter places it
 *   canvas        the page (design-canvas-draw.ts): words, questions and callouts as a reader sees them, a friendly card for what is not drawn
 *                 yet, a "+" between blocks, the parts of a container as cards. A press on a block selects it AND opens it in place
 *                 (design-edit.ts): its words become fields where they stand, its list rows and a strip of settings come under them,
 *                 and its Markdown waits in a closed section; a small bar floats on the selected block
 *
 * It never writes the whole file (note-view.ts). Every change is a smallest-byte replacement of the note (core/design-ops.ts, then
 * `minimalChange`), written into an open Markdown pane's editor or with `vault.process`; nothing else is touched or tidied. The view keeps
 * its own undo and redo of those replacements (core/design-undo.ts), since a `vault.process` write is not documented to join an editor's
 * undo. A person may delete her own work freely: a delete or a move that would leave kept data not matching says what, with counts, and
 * asks; it never blocks. THERE IS NO DRAFT and no Save: what is changed in an open block is written as it is changed, one step of Undo
 * for each change (see "the lane" below), and what is typed and not left yet is applied by whatever would end the block's life first
 * (`flushEdits`). Every drawing of a question or a callout is inert, and the view fetches nothing.
 *
 * This file owns the state (the note, the selection, the open block, the piece picked, the place chosen, the open panel); the other files
 * draw what it hands them and report presses back.
 */
import { Component, Notice, Platform, Scope, type Menu, type TFile, type WorkspaceLeaf } from "obsidian";
import {
	DesignHistory,
	KEY_GROUPS,
	WORDS_PIECE,
	blockLines,
	bookletTitleOf,
	canvasOf,
	changeLines,
	crumbOf,
	deleteBlock,
	insertPiece,
	isBookletText,
	listingOf,
	minimalChange,
	moveBlock,
	moveTargets,
	nameOf,
	navEntries,
	navigableNodes,
	needsAsking,
	needsOf,
	parseDesign,
	placeFor,
	popupFor,
	problemsOf,
	slotAccepts,
	slotPositionFor,
	stepPopup,
	tileState,
	troublesOf,
	walkDesign,
	whyImmovable,
	whyUnchangeable,
	type Activity,
	type CatalogueId,
	type Canvas,
	type DesignKind,
	type DesignNode,
	type NavEntry,
	type OpResult,
	type PopupRow,
	type PopupState,
	type Question,
	type Slot,
	type Trouble,
} from "./core";
import { askDesign } from "./design-modals";
import { windowGone } from "./window-gone";
import { drawPage, paintSlot, whereWords, type DrawnPage, type PageCtx, type SlotMode } from "./design-canvas-draw";
import { EditorBox, type BarState, type Editing, type Outcome } from "./design-edit";
import { drawNav, drawTroubles, foldKeys, type NavCtx } from "./design-nav";
import { drawPalette, groupOfKey, paintPieceButton, paintWhere, pieceByFile, pieceName, type PaletteHandle, type PalettePiece } from "./design-palette";
import { drawIcon } from "./design-picture";
import { questionsByLine } from "./design-sample";
import { MODE_ICONS, iconName, ui, uin } from "./design-text";
import { capital, kindName, quietNames, titledOf } from "./design-words";
import { markdownViewOf } from "./markdown-view";
import { LockedTextView, writeThrough } from "./note-view";
import { LOOKS, isLook, resolveDesignLook, type Look } from "./look";
import { calloutColourIsTriplet } from "./reading";
import type { LeafMode } from "./switch";

export const DESIGN_VIEW_TYPE = "booklet-design";

export interface DesignHost {
	setMode(leaf: WorkspaceLeaf, mode: LeafMode): Promise<void>;
	/** The plugin's settings, for the look the reader chose there (look.ts). */
	readonly media: { look(): Look | undefined };
}

/** Is this a field of text, or anything a person types in, or inside one? Then a key is hers, not the view's. */
export function isEditable(el: Element | null): boolean {
	return !!el && typeof el.closest === "function" && el.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}

/** The keys the view's scope listens on: letters and digits for the hotkeys, and the keys that drive them. A key outside them is left alone. */
const POPUP_KEYS: readonly string[] = [..."abcdefghijklmnopqrstuvwxyz123456789", " ", "Backspace", "Enter", "Escape", "ArrowUp", "ArrowDown"];

const spaced = (keys: string): string => keys.split("").join(" ");

/** A pane narrower than this (in pixels) is drawn as a phone is: the left column is a panel that slides over the canvas. */
const NARROW = 700;

/** The mime type a tile carries while it is dragged. */
const PIECE_MIME = "application/x-booklet-design-piece";

/** The pieces that are a part of the booklet (a card of a container), not a block among its blocks: placing one leaves the view where it was. */
const PART_NEEDS: ReadonlySet<string> = new Set(["module", "activity", "tab", "page", "data-section"]);

type Tab = "outline" | "add";

/** What is selected: a line, its kind when known (a line alone picks the outermost block that starts there), and whether only the first page of a part is drawn. */
interface Selection {
	start: number;
	kind: DesignKind | null;
	firstPage?: boolean;
}

export class DesignView extends LockedTextView {
	/** The note's text as last read or written by this view: what getViewData returns. */
	private text = "";
	/** The tree of `text`, made at each drawing: the nodes the buttons act on. */
	private root: DesignNode | null = null;
	private sel: Selection | null = null;
	/** The node `sel` names in the tree drawn now (null is the booklet). */
	private selected: DesignNode | null = null;
	/** The page drawn now, and the slots it has. */
	private canvas: Canvas | null = null;
	private drawn: DrawnPage | null = null;
	private readonly history = new DesignHistory<Selection | null>();
	private renderer: Component | null = null;
	private shellEl: HTMLElement | null = null;
	private leftEl: HTMLElement | null = null;
	private scrollEl: HTMLElement | null = null;
	/** The look selector in the header bar (drawn again with the bar). */
	private lookEl: HTMLSelectElement | null = null;
	/** What the look selector chose for this view alone: kept while the view lives, never saved; none until a choice, and the canvas then follows the settings. */
	private lookChoice: Look | undefined;
	private crumbEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private armedEl: HTMLElement | null = null;
	private scrimEl: HTMLElement | null = null;
	private menuBtn: HTMLButtonElement | null = null;
	private undoBtn: HTMLButtonElement | null = null;
	private redoBtn: HTMLButtonElement | null = null;
	private palette: PaletteHandle | null = null;
	/** What the view last said, kept across a drawing. */
	private message = "";
	/** The status line is saying which keys have been typed. */
	private keysSaid = false;
	/**
	 * THE LANE. Every write the view makes runs in one lane, one at a time: a change from the open block, a move, a delete, a placing, an
	 * undo, a close. A change from the box is never dropped (typed text is made of them), it waits its turn; a press of a button of the
	 * page (an "op") is dropped when another op is queued or running, so a double press does one thing. `busy` is the lane's last job while
	 * anything is queued or running, else null.
	 */
	private busy: Promise<void> | null = null;
	private lane: Promise<void> = Promise.resolve();
	private queued = 0;
	private opsQueued = 0;
	/** Bumped when the view is given another note: a job queued for the old one writes nothing to the new one. */
	private epoch = 0;
	/** The view is closed (or closing): nothing is drawn, what is queued still writes. */
	private closed = false;
	/** The window this view is drawn in, once the workspace has said it is closing (`window-close`): a write waits for it (window-gone.ts). */
	private closingWindow: Window | null = null;
	/** The questions of the note by their line, with their activities, found once for each drawing. */
	private questions = new Map<number, { activity: Activity; question: Question }>();
	/** Obsidian gives a callout's colour as a triplet (see reading.ts): said to every inert drawing. */
	private triplet = false;
	private bookletTitle = "";
	private followTimer: number | null = null;

	/** The block that is open in place, when one is; at most one. It is only WHICH block: the text it edits is the note's. */
	private edit: Editing | null = null;
	private editor: EditorBox | null = null;
	/** The scope that holds Ctrl/Cmd+Enter for the editor while its box has the focus (see `holdSaveKey`). */
	private saveScope: Scope | null = null;
	/**
	 * Drawing. A press is under way (the pointer is down): a drawing asked for by a write waits for it to end, so the control pressed is
	 * still there when the click lands. A drawing is never made inside another (`drawing`), and one asked for in it is made after it.
	 */
	private pressing = false;
	private pressTimer: number | null = null;
	/** Where the last press in the view began (a click that began on a field and ended on the page, a text being selected, is not a press on the page). */
	private pressedAt: Node | null = null;
	private drawPending = false;
	private drawing = false;
	private drawAgain = false;
	/**
	 * The last replacements this view made, so a press on a page as it was drawn finds its block where it is now (`live`), however many
	 * drawings came in between: each tree the view parsed remembers how many replacements had been made when it was parsed (`rootAt`).
	 */
	private steps: { before: string; after: string; from: number; to: number; delta: number }[] = [];
	/** How many replacements were made before `steps[0]` (the older ones are let go, to keep the notes they hold from piling up). */
	private stepBase = 0;
	private rootAt = new WeakMap<DesignNode, number>();
	/** The number of lines the page was drawn from. */
	private drawnLines = 0;
	/** The tree of the note as it is now, for the box and for the presses (parsed when the text changed). */
	private parsed: { text: string; root: DesignNode } | null = null;

	/** The left column's tab, and what each tab remembers. */
	private tab: Tab = "outline";
	private readonly folds = new Set<string>();
	private readonly groupsOpen = new Map<CatalogueId, boolean>();
	private problemsOpen = false;
	private leftoversOpen = false;
	private troubled: { text: string; list: Trouble[] } | null = null;

	/** The piece picked (by its file), the "+" a person clicked (by its id) and whether a tile is being dragged. */
	private armed: string | null = null;
	private target: string | null = null;
	private dragging = false;
	/** Where the hotkeys stand, or null when they are closed. */
	private popup: PopupState | null = null;

	/** The pane is narrow (set from its width), and the left column is open as a panel. */
	private narrow = false;
	private panelOpen = false;
	/** The page last drawn (its kind and line), to keep the scroll when the same page is drawn again. */
	private pageKey = "";

	constructor(
		leaf: WorkspaceLeaf,
		private readonly host: DesignHost,
	) {
		super(leaf);
	}

	override onload(): void {
		super.onload();
		this.closed = false;
		this.contentEl.addClass("booklet-design");
		// the other two ways to open this note, one button each; the Markdown view is always one press away
		this.addAction(iconName(MODE_ICONS.markdown, "file-text"), ui("mode.markdown"), () => void this.host.setMode(this.leaf, "markdown"));
		this.addAction(iconName(MODE_ICONS.booklet, "book-open"), ui("mode.booklet"), () => void this.host.setMode(this.leaf, "booklet"));
		// undo and redo by key, only when no field has the focus: in a field the key is the field's own
		this.scope ??= new Scope(this.app.scope);
		this.scope.register(["Mod"], "z", (evt) => this.undoKey(evt, "undo"));
		this.scope.register(["Mod", "Shift"], "z", (evt) => this.undoKey(evt, "redo"));
		// the hotkeys: a scope of this view, never a command hotkey. Each key acts only when no field of text has the focus and no
		// modifier is held, so a key typed into a field (the editor's box) is the field's. What the scope does when a user has bound the
		// same key herself, and whether it hears a bare letter while a field has the focus, is not known without the real app: the handler
		// therefore checks the key's own target and the focused element before it acts, and passes the key on otherwise.
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
		// Obsidian's theme or its light and dark mode changed: a canvas whose look nobody chose takes the matching one
		this.registerEvent(this.app.workspace.on("css-change", () => this.applyLook()));
		// a pane narrower than a tablet draws the left column as a panel (a phone is one whatever its width)
		if (typeof ResizeObserver !== "undefined") {
			const watch = new ResizeObserver((entries) => {
				const w = entries[0]?.contentRect.width ?? this.contentEl.clientWidth;
				this.setNarrow(w > 0 && w < NARROW);
			});
			watch.observe(this.contentEl);
			this.register(() => watch.disconnect());
		}
		// a press under way (the pointer is down in the view): a drawing a write asks for waits until it is up, so a press that began on a
		// control is not lost when the typing that was just left is written and the page is drawn again (see `requestDraw`)
		const doc = this.contentEl.ownerDocument;
		const down = (evt: Event): void => {
			const at = evt.target as Node | null;
			if (!at || !this.contentEl.contains(at)) return;
			this.pressedAt = at;
			this.pressing = true;
			if (this.pressTimer !== null) window.clearTimeout(this.pressTimer);
			// a pointer that never comes up (the window lost it) does not hold a drawing back for good
			this.pressTimer = window.setTimeout(() => this.pressEnded(), 1500);
		};
		const up = (): void => this.pressEnded();
		this.registerDomEvent(doc, "pointerdown", down, true);
		this.registerDomEvent(doc, "mousedown", down, true);
		this.registerDomEvent(doc, "pointerup", up, true);
		this.registerDomEvent(doc, "mouseup", up, true);
		this.registerDomEvent(doc, "pointercancel", up, true);
		this.registerDomEvent(doc, "dragend", up, true);
		// a press on the empty page (not on a block, a control or the open box) ends the editing: what is typed is applied and the block closes
		this.registerDomEvent(this.contentEl, "click", (evt: MouseEvent) => this.backgroundClick(evt));
		// a view in a pop-out window knows when that window is closing: what it has typed is written once the window is gone
		this.registerEvent(
			this.app.workspace.on("window-close", (_w, closing) => {
				if (closing.document === this.contentEl.ownerDocument) this.closingWindow = closing;
			}),
		);
		this.register(() => {
			if (this.followTimer !== null) window.clearTimeout(this.followTimer);
			this.followTimer = null;
			if (this.pressTimer !== null) window.clearTimeout(this.pressTimer);
			this.pressTimer = null;
			// what is typed and not left yet is queued to be written before the view goes (the lane runs on after it is closed)
			this.endEdits();
			this.closed = true;
			this.releaseSaveKey();
			this.drop();
		});
		this.history.onChange(() => this.showUndo());
	}

	/** Is this element empty page: inside the canvas, and not on a block, a card, a slot, the open box or any control? */
	private isBackground(el: Node | null): boolean {
		const at = el && (el as Element).closest ? (el as Element) : (el?.parentElement ?? null);
		if (!at || !this.scrollEl?.contains(at)) return false;
		return at.closest(".booklet-design-block, .booklet-design-editbox, .booklet-design-card, .booklet-design-slot, .booklet-design-floatbar, button, a, input, select, textarea, summary, label") === null;
	}

	/** A click on the empty page, that began there too, closes the open block (its typed words are applied first, as Esc does). */
	private backgroundClick(evt: MouseEvent): void {
		const from = this.pressedAt;
		this.pressedAt = null;
		if (!this.edit || evt.button !== 0 || !this.isBackground(evt.target as Node | null) || !this.isBackground(from)) return;
		void this.closeEditor();
	}

	/** The pointer is up: a drawing that waited for it is made now, after the click that follows the press has run. */
	private pressEnded(): void {
		if (this.pressTimer !== null) window.clearTimeout(this.pressTimer);
		this.pressTimer = null;
		this.pressing = false;
		if (!this.drawPending) return;
		window.setTimeout(() => {
			if (this.pressing || !this.drawPending) return;
			this.drawPending = false;
			this.draw();
		}, 0);
	}

	/**
	 * Everything typed in the open block is applied, in order, and this waits for the writes. Called by whatever would end the block's life:
	 * the pane closing, a switch to the Booklet or Markdown view, another note, quitting. A pending text that cannot be applied stays in its
	 * box and is said (design-edit.ts), it is never dropped without a word.
	 */
	async flushEdits(): Promise<void> {
		for (let round = 0; round < 4; round++) {
			this.queueTyped();
			await this.whenIdle();
			if (!this.editor?.dirty()) return;
		}
	}

	/** Queues the application of what is typed in the open block, if anything is. */
	private queueTyped(): void {
		const box = this.editor;
		if (box?.dirty()) void this.enqueue(() => box.applyAll(), false);
	}

	/** The view is closing: typed text is queued, and text that was held and cannot be applied is told to the person in a notice. */
	private endEdits(): void {
		const box = this.editor;
		if (!box) return;
		this.queueTyped();
		if (box.holds()) new Notice(ui("edit.lost", { text: box.heldText().slice(0, 400) }));
	}

	/** Is anything typed and not applied, or being written? (The quit event waits for the view when it is.) */
	hasPending(): boolean {
		return this.queued > 0 || !!this.editor?.dirty();
	}

	/** The quit event's task: what is typed is written before the app goes, after a pop-out window it is in has closed. */
	async saveTypedAtQuit(): Promise<void> {
		const win = this.contentEl.ownerDocument.defaultView;
		if (win && win !== window) await windowGone(win);
		await this.flushEdits();
	}

	override async onUnloadFile(file: TFile): Promise<void> {
		// the pane closing, another note opened in it and a switch to another view all unload the file: what is typed is written first
		await this.flushEdits();
		await super.onUnloadFile(file);
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
			this.edit = null;
			this.armed = this.target = null;
			this.popup = null;
			this.panelOpen = false;
			this.history.clear();
			this.message = "";
		} else if (data === this.text && this.root) return; // Obsidian hands the view its own write back: nothing to draw
		this.text = data;
		this.data = data;
		this.draw();
		// a change that came from outside: what is typed in the open block is applied to the note as it is now (or kept, and said, if it cannot be)
		if (!clear) this.queueTyped();
	}

	clear(): void {
		this.epoch++;
		this.text = "";
		this.data = "";
		this.parsed = null;
		this.steps = [];
		this.stepBase = 0;
		this.rootAt = new WeakMap();
		this.drop();
		this.history.clear();
		this.sel = null;
		this.edit = null;
		this.armed = this.target = null;
		this.popup = null;
		this.root = null;
		this.canvas = null;
		this.drawn = null;
		this.releaseSaveKey();
		this.contentEl.empty();
	}

	/** Lets go of everything a drawing made: the editor's timers and drawings, the palette's sample, and the renderer's Component. */
	private drop(keepEditor = false): void {
		if (!keepEditor || !this.edit || this.editor?.editing !== this.edit) {
			this.editor?.dispose();
			this.editor = null;
		}
		this.palette?.dispose();
		this.palette = null;
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
				this.queueTyped();
			}
		}, 150);
	}

	/** Resolves when no change is under way (for the tests, and for whatever must wait for a write). */
	async whenIdle(): Promise<void> {
		while (this.busy) await this.busy;
	}

	/**
	 * Queues `work` in the lane: after what is queued, one at a time, never dropped. A job that fails says so in the status line and goes
	 * on; the lane never rejects. A job queued for a note that is no longer the view's does nothing.
	 */
	private enqueue(work: () => Promise<void>, op: boolean): Promise<void> {
		const epoch = this.epoch;
		// a press of the page's own buttons starts at once when the lane is idle; what the box asks for always starts after the event that asked
		const now = op && this.queued === 0;
		this.queued++;
		if (op) this.opsQueued++;
		const go = (): Promise<void> => (epoch === this.epoch ? work() : Promise.resolve());
		const first: Promise<void> = now ? go() : this.lane.then(go);
		const run: Promise<void> = first
			.catch((e: unknown) => this.failedJob(e))
			.finally(() => {
				this.queued--;
				if (op) this.opsQueued--;
				if (!this.queued) this.busy = null;
			});
		this.lane = run;
		this.busy = run;
		return run;
	}

	/** A job threw: nothing escapes to the caller; the status line says what, and the page is drawn from the note as it is. */
	private failedJob(e: unknown): void {
		this.say(ui("status.failedWhy", { reason: e instanceof Error ? e.message : String(e) }));
		this.recover();
	}

	/** Draws the page from the note as it is, whatever state a failed job left (never half drawn, never an error to the console). */
	private recover(): void {
		try {
			this.drawPending = false;
			this.draw();
		} catch {
			// the page could not be drawn either: it is emptied rather than left half drawn, and the status line has said why
			this.contentEl.empty();
		}
	}

	/** Runs `work` now when nothing is typed or being written, else after it has been applied (a press on the page while typing is owed). */
	private afterEdits(work: () => void): void {
		if (!this.queued && !this.editor?.dirty()) return work();
		void this.enqueue(async () => {
			if (this.editor?.dirty()) await this.editor.applyAll();
			work();
		}, false);
	}

	/* ---- the phone: the left column as a panel ---- */

	private get phone(): boolean {
		return this.narrow || Platform.isPhone;
	}

	private setNarrow(narrow: boolean): void {
		if (narrow === this.narrow) return;
		this.narrow = narrow;
		if (!narrow) this.panelOpen = false;
		if (this.root) this.draw();
	}

	/** The panel's state shown: the left column and the scrim, hidden or not, and the menu button's `aria-expanded`. */
	private showPanel(): void {
		const open = this.phone && this.panelOpen;
		if (this.leftEl) this.leftEl.hidden = this.phone && !open;
		if (this.scrimEl) this.scrimEl.hidden = !open;
		this.menuBtn?.setAttribute("aria-expanded", String(open));
		this.shellEl?.toggleClass("has-panel", open);
	}

	private openPanel(): void {
		if (!this.phone || this.panelOpen) return;
		this.panelOpen = true;
		this.showPanel();
	}

	private closePanel(): void {
		if (!this.panelOpen) return;
		this.panelOpen = false;
		this.showPanel();
	}

	/* ---- drawing ---- */

	/** Puts the focus back on the control that had it (by its `data-focus`), after a drawing took the element away. */
	private keepFocus(work: () => void): void {
		const doc = this.contentEl.ownerDocument;
		const at = doc.activeElement;
		const had = at && this.contentEl.contains(at) ? at.getAttribute("data-focus") : null;
		work();
		if (!had) return;
		// a control inside the page that took the focus while it was drawn (the open box puts it where the person is working) keeps it
		const now = doc.activeElement;
		if (now && now !== at && now !== doc.body && this.contentEl.contains(now)) return;
		const again = Array.from(this.contentEl.querySelectorAll<HTMLElement>("[data-focus]")).find((e) => e.getAttribute("data-focus") === had);
		again?.focus();
	}

	/**
	 * Draws the page from the note as it is. A drawing is never made inside another: one asked for while the page is being drawn (an event
	 * the drawing itself raises, such as the browser reporting a field left as it is taken away) is made after it, once.
	 */
	private draw(): void {
		if (this.closed) return;
		if (this.drawing) {
			this.drawAgain = true;
			return;
		}
		this.drawing = true;
		try {
			for (let round = 0; round < 3; round++) {
				this.drawAgain = false;
				this.paint();
				if (!this.drawAgain) break;
			}
		} finally {
			this.drawing = false;
			this.drawAgain = false;
		}
	}

	/** A drawing a write asks for: made now, or when the pointer that is down comes up (see `pressEnded`), so the press is not lost. */
	private requestDraw(): void {
		if (this.pressing) this.drawPending = true;
		else this.draw();
	}

	private paint(): void {
		const el = this.contentEl;
		const top = this.scrollEl?.scrollTop ?? 0;
		this.drawPending = false;
		// the open block's box is kept (the same elements), so a press that has begun on one of its controls is not lost to this drawing
		this.editor?.lift();
		this.keepFocus(() => {
			this.drop(true);
			this.renderer = this.addChild(new Component());
			el.empty();
			el.toggleClass("is-phone", this.phone);
			const root = parseDesign(this.text);
			this.root = root;
			this.parsed = { text: this.text, root };
			this.rootAt.set(root, this.stepBase + this.steps.length);
			this.drawnLines = this.text.split("\n").length;
			this.selected = this.find(root);
			if (!this.selected) this.sel = null;
			this.questions = isBookletText(this.text) ? questionsByLine(this.text) : new Map<number, { activity: Activity; question: Question }>();
			this.triplet = calloutColourIsTriplet(el);
			this.bookletTitle = bookletTitleOf(this.text);
			const canvas = canvasOf(root, this.selected, { firstPage: this.sel?.firstPage === true, title: this.bookletTitle });
			this.canvas = canvas;

			const shell = el.createDiv({ cls: "booklet-design-shell" });
			this.shellEl = shell;
			this.leftEl = shell.createEl("aside", { cls: "booklet-design-left", attr: { id: "booklet-design-left" } });
			this.scrimEl = shell.createEl("button", { cls: "booklet-design-scrim", attr: { type: "button", "aria-label": ui("panel.close") } });
			this.scrimEl.addEventListener("click", () => this.closePanel());
			const main = shell.createDiv({ cls: "booklet-design-main" });
			this.drawTop(main);
			// the status line lies over the page and takes no room, so a write's words never move the page under a press (see styles.base.css)
			this.statusEl = main.createDiv({ cls: "booklet-design-status-line" }).createDiv({ cls: "booklet-design-status", attr: { role: "status", "aria-live": "polite", "aria-label": ui("status.label") } });
			this.statusEl.setText(this.message);
			if (!isBookletText(this.text)) main.createDiv({ cls: "booklet-design-banner", text: ui("note.notBooklet") });
			this.armedEl = main.createDiv({ cls: "booklet-design-armedbar", attr: { role: "status" } });
			this.armedEl.hidden = true;
			const scroll = main.createDiv({ cls: "booklet-design-scroll" });
			this.scrollEl = scroll;
			this.applyLook();

			// a draft whose block is not on this page (or not in the note any more) keeps its text on the screen, above the page
			if (this.edit) {
				const node = walkDesign(root).find((n) => this.editsNode(n)) ?? null;
				if (!node) this.drawEditorBox(scroll, null, "gone");
				else if (!this.onPage(canvas, node)) this.drawEditorBox(scroll, node, "detached");
			}
			this.drawn = drawPage(scroll, canvas, this.pageCtx(root));
			// a place a person chose belongs to the page it was chosen on
			if (this.target && !this.slotById(this.target)) this.target = null;
			for (const { slot, el: slotEl } of this.drawn.slots) this.wireSlot(slotEl, slot);
			this.drawLeft();
			this.repaint();
			this.showPanel();
			this.drawCrumb();
			this.showUndo();
			quietNames(el);
		});
		const key = this.canvas ? `${this.canvas.holder.kind}@${this.canvas.holder.start}|${this.canvas.firstPage}` : "";
		if (this.scrollEl) this.scrollEl.scrollTop = key === this.pageKey ? top : 0;
		this.pageKey = key;
	}

	/** Is this node drawn on the page (it is the page, the settings, or inside one of its blocks)? */
	private onPage(canvas: Canvas, n: DesignNode): boolean {
		if (n === canvas.holder || n === canvas.focus) return true;
		return [...canvas.blocks, ...canvas.later].some((b) => walkDesign(b).includes(n));
	}

	private drawTop(main: HTMLElement): void {
		const top = main.createDiv({ cls: "booklet-design-top" });
		if (this.phone) {
			const menu = top.createEl("button", { cls: "booklet-design-menubutton", attr: { type: "button", "aria-label": ui("panel.show"), "aria-expanded": "false", "aria-controls": "booklet-design-left" } });
			if (!drawIcon(menu, ["panel-left", "menu", "list"])) menu.setText("☰");
			menu.addEventListener("click", () => (this.panelOpen ? this.closePanel() : this.openPanel()));
			this.menuBtn = menu;
		} else this.menuBtn = null;
		const bar = top.createDiv({ cls: "booklet-design-bar", attr: { role: "toolbar", "aria-label": ui("toolbar.label") } });
		this.undoBtn = bar.createEl("button", { text: ui("undo"), cls: "booklet-design-undo", attr: { type: "button", title: ui("undo.title") } });
		this.redoBtn = bar.createEl("button", { text: ui("redo"), cls: "booklet-design-redo", attr: { type: "button", title: ui("redo.title") } });
		this.undoBtn.addEventListener("click", () => void this.stepBack("undo"));
		this.redoBtn.addEventListener("click", () => void this.stepBack("redo"));
		this.drawLookSelect(bar);
		// named by a hidden line, not by an aria-label (Obsidian would show that as a tooltip over the trail)
		const crumbName = top.createSpan({ cls: "booklet-design-sr", text: ui("crumb.label"), attr: { id: "booklet-design-crumb-name" } });
		this.crumbEl = top.createEl("nav", { cls: "booklet-design-crumb", attr: { "aria-labelledby": crumbName.id } });
	}

	/** The look selector: one dropdown of the three looks, named by a visible word, that changes the canvas of this view and nothing else. */
	private drawLookSelect(bar: HTMLElement): void {
		const label = bar.createEl("label", { cls: "booklet-design-look", attr: { title: ui("look.title") } });
		label.createSpan({ cls: "booklet-design-look-label", text: ui("look.label") });
		const select = label.createEl("select", { cls: ["dropdown", "booklet-design-look-select"] });
		const words: Record<Look, string> = { "paper-light": ui("look.paper-light"), "paper-dark": ui("look.paper-dark"), obsidian: ui("look.obsidian") };
		for (const look of LOOKS) select.createEl("option", { text: words[look], attr: { value: look } });
		select.addEventListener("change", () => {
			if (!isLook(select.value)) return;
			this.lookChoice = select.value;
			this.applyLook();
		});
		this.lookEl = select;
		this.showLook();
	}

	/** Is the Obsidian this view is in dark? Asked of the view's own document, since a pop-out window has one of its own. */
	private isDark(): boolean {
		return this.contentEl.ownerDocument.body.classList.contains("theme-dark");
	}

	/** The look the canvas is drawn in now (look.ts). */
	currentLook(): Look {
		return resolveDesignLook(this.host.media.look(), this.isDark(), this.lookChoice);
	}

	/**
	 * Puts the look on the canvas, for the CSS to read (the paper rules are written for `.booklet-view[data-booklet-look]`, so a canvas in a paper look
	 * is a `.booklet-view`; in Obsidian's look it has neither the class nor a rule of its own and draws as it always did). Only the canvas: the left
	 * column and the header stay in Obsidian's look. Done at each drawing, when the selector is used, and when the settings or Obsidian's theme change.
	 */
	applyLook(): void {
		const look = this.currentLook();
		const scroll = this.scrollEl;
		if (scroll) {
			scroll.setAttribute("data-booklet-look", look);
			scroll.toggleClass("booklet-view", look !== "obsidian");
		}
		this.showLook();
	}

	private showLook(): void {
		if (this.lookEl) this.lookEl.value = this.currentLook();
	}

	private showUndo(): void {
		if (this.undoBtn) this.undoBtn.disabled = !this.history.canUndo;
		if (this.redoBtn) this.redoBtn.disabled = !this.history.canRedo;
	}

	/** The block the view's selection names, found in a tree. */
	private find(root: DesignNode): DesignNode | null {
		const s = this.sel;
		if (!s) return null;
		return walkDesign(root).find((n) => n.parent !== null && n.start === s.start && (s.kind === null || n.kind === s.kind)) ?? null;
	}

	private titled(n: DesignNode): string {
		return titledOf(n, this.bookletTitle, this.file?.basename ?? "");
	}

	private say(words: string): void {
		this.message = words;
		this.keysSaid = false;
		this.statusEl?.setText(words);
	}

	private drawCrumb(): void {
		const nav = this.crumbEl;
		const root = this.root;
		if (!nav || !root) return;
		nav.empty();
		const trail = crumbOf(this.selected ?? root);
		trail.forEach((n, i) => {
			if (i) nav.createSpan({ cls: "booklet-design-crumb-sep", text: "›", attr: { "aria-hidden": "true" } });
			const b = nav.createEl("button", { text: this.titled(n), cls: "booklet-design-crumb-item", attr: { type: "button" } });
			if (i === trail.length - 1) b.setAttribute("aria-current", "true");
			b.addEventListener("click", () => this.navigate(n));
		});
	}

	/* ---- the left column ---- */

	private drawLeft(): void {
		const left = this.leftEl;
		const root = this.root;
		if (!left || !root) return;
		this.keepFocus(() => {
			this.palette?.dispose();
			this.palette = null;
			left.empty();
			const head = left.createDiv({ cls: "booklet-design-lefthead" });
			const title = head.createSpan({ cls: "booklet-design-lefttitle", text: this.file?.basename ?? ui("view.name"), attr: { id: "booklet-design-left-title" } });
			// named by what it shows, not by an aria-label: Obsidian would show that as a tooltip over the whole column
			left.setAttribute("aria-labelledby", title.id);
			const close = head.createEl("button", { cls: "booklet-design-panelclose", attr: { type: "button", "aria-label": ui("panel.close") } });
			if (!drawIcon(close, ["x"])) close.setText("×");
			close.addEventListener("click", () => this.closePanel());

			const tabs = left.createDiv({ cls: "booklet-design-tabs", attr: { role: "tablist", "aria-label": ui("tabs.label") } });
			const order: Tab[] = ["outline", "add"];
			for (const t of order) {
				const b = tabs.createEl("button", {
					text: ui(t === "outline" ? "tab.outline" : "tab.add"),
					cls: "booklet-design-tab",
					attr: { type: "button", role: "tab", "aria-selected": String(this.tab === t), tabindex: this.tab === t ? "0" : "-1", "data-tab": t, "data-focus": `tab:${t}`, id: `booklet-design-tab-${t}`, "aria-controls": "booklet-design-pane" },
				});
				b.addEventListener("click", () => this.setTab(t));
				b.addEventListener("keydown", (evt) => {
					const at = order.indexOf(this.tab);
					const to = evt.key === "ArrowRight" ? order[(at + 1) % order.length] : evt.key === "ArrowLeft" ? order[(at + order.length - 1) % order.length] : evt.key === "Home" ? order[0] : evt.key === "End" ? order[order.length - 1] : undefined;
					if (!to) return;
					evt.preventDefault();
					evt.stopPropagation();
					this.setTab(to, true);
				});
			}
			const pane = left.createDiv({ cls: ["booklet-design-pane", `is-${this.tab}`], attr: { role: "tabpanel", id: "booklet-design-pane", "aria-labelledby": `booklet-design-tab-${this.tab}` } });
			if (this.tab === "outline") this.drawOutline(pane, root);
			else this.drawAdd(pane);
			quietNames(left);
		});
	}

	private setTab(tab: Tab, focus = false): void {
		this.tab = tab;
		this.drawLeft();
		this.repaint();
		if (focus) this.leftEl?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.focus();
	}

	private drawOutline(pane: HTMLElement, root: DesignNode): void {
		const entries = navEntries(root, { title: this.bookletTitle || this.file?.basename || "" });
		const ctx: NavCtx = {
			entries,
			isCurrent: (e) => this.isCurrent(e),
			isFolded: (k) => this.folds.has(k),
			fold: (k) => {
				if (this.folds.has(k)) this.folds.delete(k);
				else this.folds.add(k);
				this.drawLeft();
			},
			select: (e) => this.pressEntry(e),
		};
		drawNav(pane.createDiv({ cls: "booklet-design-navwrap" }), ctx);
		// what the reader says of the note: only a booklet is read
		const foot = pane.createDiv({ cls: "booklet-design-navfoot" });
		if (!this.troubled || this.troubled.text !== this.text) {
			const list = isBookletText(this.text) ? troublesOf(root, problemsOf(this.text)) : [];
			this.troubled = { text: this.text, list };
		}
		const list = this.troubled.list;
		drawTroubles(
			foot,
			list.filter((t) => t.problem.kind !== "leftover"),
			"problems",
			{ open: this.problemsOpen, remember: (o) => void (this.problemsOpen = o), go: (n) => this.reveal(n) },
		);
		drawTroubles(
			foot,
			list.filter((t) => t.problem.kind === "leftover"),
			"leftovers",
			{ open: this.leftoversOpen, remember: (o) => void (this.leftoversOpen = o), go: (n) => this.reveal(n) },
		);
	}

	private isCurrent(e: NavEntry): boolean {
		const c = this.canvas;
		if (!c) return false;
		if (e.kind === "settings") return c.focus?.kind === "front-matter";
		if (c.focus?.kind === "front-matter") return false;
		if (e.kind === "first-page") return c.firstPage && c.holder === e.holder;
		return !c.firstPage && e.node === c.holder;
	}

	private drawAdd(pane: HTMLElement): void {
		const keyed = this.popup?.group ? groupOfKey(this.popup.group) : null;
		this.palette = drawPalette(pane, {
			app: this.app,
			sourcePath: "",
			triplet: this.triplet,
			shell: this.shellEl ?? pane,
			owner: () => this.renderer,
			phone: this.phone,
			isOpen: (id) => this.groupsOpen.get(id) ?? id === "questions",
			toggle: (id) => {
				this.groupsOpen.set(id, !(this.groupsOpen.get(id) ?? id === "questions"));
				this.drawLeft();
				this.repaint();
			},
			keyed,
			press: (piece) => this.pressPiece(piece),
			dragStart: (piece, evt) => this.dragStart(piece, evt),
			dragEnd: () => this.dragEnd(),
		});
	}

	/* ---- the page ---- */

	private pageCtx(root: DesignNode): PageCtx {
		return {
			app: this.app,
			sourcePath: this.file?.path ?? "",
			triplet: this.triplet,
			text: this.text,
			root,
			owner: this.renderer ?? new Component(),
			bookletTitle: this.bookletTitle,
			noteName: this.file?.basename ?? "",
			questionAt: (line) => this.questions.get(line),
			isOpen: (n) => this.editsNode(n),
			pressBlock: (n) => this.openEditor(n),
			openCard: (n) => this.navigate(n),
			editNode: (n, markdown) => this.openEditor(n, markdown === true),
			move: (n, dir) => void this.moveDir(n, dir),
			remove: (n) => void this.remove(n),
			drawEditor: (host, n) => this.drawEditorBox(host, n, "here"),
			linesOf: (n) => blockLines(this.text, n),
			writtenOf: (n) => this.text.split("\n").slice(n.start, n.end).map((l) => l.replace(/\r$/, "")),
		};
	}

	/** Puts the open block's box into the page: the box that is open (the same elements, kept across drawings), or a new one for another block. */
	private drawEditorBox(parent: HTMLElement, node: DesignNode | null, where: "here" | "detached" | "gone"): void {
		const ed = this.edit;
		if (!ed) return;
		if (this.editor && this.editor.editing === ed) {
			this.editor.attach(node, parent, where);
			return;
		}
		this.editor?.dispose();
		this.editor = new EditorBox(
			{
				app: this.app,
				text: () => this.text,
				node: () => this.openNode(),
				lines: () => {
					const n = this.openNode();
					return n ? blockLines(this.text, n) : null;
				},
				change: (lines) => this.changeBlock(lines),
				queue: (work) => this.enqueue(work, false),
				confirm: () => void this.closeEditor(),
				hold: () => this.holdSaveKey(),
				release: () => this.releaseSaveKey(),
				openMenu: (line) => this.openMenuBlock(line),
				bar: () => this.barOf(),
				press: (what) => this.barPress(what),
				say: (words) => this.say(words),
			},
			ed,
			node,
			parent,
			where,
		);
	}

	/** The tree of the note as it is now (the page's own, or parsed again when the note has changed since it was drawn). */
	private liveRoot(): DesignNode {
		if (!this.parsed || this.parsed.text !== this.text) {
			const root = parseDesign(this.text);
			this.parsed = { text: this.text, root };
			this.rootAt.set(root, this.stepBase + this.steps.length);
		}
		return this.parsed.root;
	}

	/** The open block as the note has it now, or null when the note has no such block. */
	private openNode(): DesignNode | null {
		const ed = this.edit;
		if (!ed) return null;
		return walkDesign(this.liveRoot()).find((n) => n.parent !== null && n.start === ed.start && n.kind === ed.kind) ?? null;
	}

	/** The open block's move and delete buttons as the note has it now, or null when the block has none (the front matter, a block the view never moves). */
	private barOf(): BarState | null {
		const n = this.openNode();
		if (!n) return null;
		const move = !whyImmovable(n, "moved");
		const del = !whyImmovable(n, "deleted");
		if (!move && !del) return null;
		const to = move ? moveTargets(n) : { up: null, down: null };
		return { move, up: !!to.up, down: !!to.down, del };
	}

	/**
	 * A press of the box's move or delete button: what is typed is applied and the block is closed (with its text held, it stays open and
	 * says so, and nothing is moved), then the block is moved or deleted as the page's own bar does it, as one step of Undo.
	 */
	private barPress(what: "up" | "down" | "delete"): void {
		const n = this.openNode();
		if (!n) return;
		void this.closeEditor().then(() => {
			if (this.edit) return;
			if (what === "delete") void this.remove(n);
			else void this.moveDir(n, what);
		});
	}

	/** The shared menu a question names, opened in its own editor (what is typed in the block that is open is applied first: openEditor says so). */
	private openMenuBlock(line: number): void {
		const menu = walkDesign(this.liveRoot()).find((x) => x.kind === "menu" && x.start === line);
		if (menu) this.openEditor(menu);
	}

	/* ---- selecting and navigating ---- */

	/**
	 * Draws the page of a node (the booklet's when it is the booklet). What is typed in the open block is applied first; the block closes
	 * (but stays open, with its text and a word, when text it holds could not be applied: that is never dropped).
	 */
	private navigate(n: DesignNode, firstPage = false): void {
		this.afterEdits(() => {
			const node = this.live(n);
			if (!node) return this.draw();
			if (this.editor?.holds()) {
				this.say(ui("editor.busy"));
				return;
			}
			this.sel = node === this.liveRoot() && !firstPage ? null : { start: node.start, kind: node.kind, ...(firstPage ? { firstPage: true } : {}) };
			this.edit = null;
			this.unfoldTo(node);
			this.closePanel();
			this.draw();
		});
	}

	private pressEntry(e: NavEntry): void {
		if (e.kind === "settings") {
			const front = this.root?.children.find((c) => c.kind === "front-matter");
			if (front) this.openEditor(front);
			return;
		}
		if (e.kind === "first-page") return this.navigate(e.holder, true);
		this.navigate(e.node ?? e.holder);
	}

	/** Selects a block and brings it into view, with the focus on it. */
	private reveal(n: DesignNode): void {
		this.afterEdits(() => {
			const node = this.live(n);
			if (!node) return this.draw();
			if (this.editor?.holds()) {
				this.say(ui("editor.busy"));
				return;
			}
			this.sel = node === this.liveRoot() ? null : { start: node.start, kind: node.kind };
			this.edit = null;
			this.unfoldTo(node);
			this.closePanel();
			this.draw();
			const box = Array.from(this.contentEl.querySelectorAll<HTMLElement>(".booklet-design-block, .booklet-design-page")).find((b) => b.getAttribute("data-start") === String(node.start) && b.getAttribute("data-kind") === node.kind);
			box?.scrollIntoView?.({ block: "center" });
			box?.focus();
		});
	}

	/** The navigator's folds above a node are opened, so the entry that is drawn is one that can be seen. */
	private unfoldTo(n: DesignNode): void {
		const root = this.root;
		if (!root) return;
		const entries = navEntries(root, { title: this.bookletTitle });
		const keys = foldKeys(entries);
		for (const a of crumbOf(n)) {
			const at = entries.findIndex((e) => e.node === a);
			if (at >= 0) this.folds.delete(keys[at] ?? "");
		}
	}

	/* ---- placing: a piece picked, a "+" clicked, a tile dragged ---- */

	private slotById(id: string): Slot | undefined {
		return this.drawn?.slots.find((s) => s.slot.id === id)?.slot;
	}

	private armedPiece(): PalettePiece | null {
		return this.armed ? (pieceByFile(this.armed) ?? null) : null;
	}

	/** The state every tile, chip and slot shows, from what is picked and what is chosen. Nothing is redrawn. */
	private repaint(): void {
		const root = this.root;
		const canvas = this.canvas;
		if (!root || !canvas || !this.drawn) return;
		const piece = this.armedPiece();
		const target = this.target ? this.slotById(this.target) : undefined;
		for (const { slot, el } of this.drawn.slots) {
			let mode: SlotMode = "idle";
			if (target && target.id === slot.id) mode = "target";
			else if (piece && !target && slotAccepts(root, slot, piece).ok) mode = "lit";
			paintSlot(el, mode, slot, canvas);
		}
		for (const el of Array.from(this.contentEl.querySelectorAll<HTMLElement>("[data-piece]"))) {
			const p = pieceByFile(el.getAttribute("data-piece") ?? "");
			if (!p) continue;
			const st = tileState(root, canvas, p, target?.id);
			paintPieceButton(el, { ok: st.ok, reason: st.ok ? "" : st.reason, armed: this.armed === p.file });
		}
		const card = this.contentEl.querySelector<HTMLElement>("[data-where-card]");
		if (card) paintWhere(card, target ? whereWords(target, this.text) : null);
		const bar = this.armedEl;
		if (bar) {
			bar.empty();
			bar.hidden = !piece;
			if (piece) {
				bar.createSpan({ text: ui("armed.banner", { name: pieceName(piece) }) });
				const back = bar.createEl("button", { cls: "booklet-design-putback", text: ui("armed.back"), attr: { type: "button" } });
				back.addEventListener("click", () => this.cancelPlacing());
			}
		}
	}

	/** Lets go of a picked piece, a chosen "+" and the keys. Gives whether there was anything to let go of. */
	private cancelPlacing(): boolean {
		const had = this.armed !== null || this.target !== null || this.popup !== null;
		this.armed = null;
		this.target = null;
		this.popup = null;
		this.dragging = false;
		if (!had) return false;
		if (this.keysSaid) this.say("");
		if (this.tab === "add") this.drawLeft();
		this.repaint();
		return true;
	}

	/** A tile or a chip was pressed. */
	private pressPiece(piece: PalettePiece): void {
		const root = this.root;
		const canvas = this.canvas;
		if (!root || !canvas) return;
		this.popup = null;
		const target = this.target ? this.slotById(this.target) : undefined;
		const st = tileState(root, canvas, piece, target?.id);
		if (!st.ok) {
			this.say(ui("pal.off", { name: pieceName(piece), reason: st.reason }));
			this.repaint();
			return;
		}
		// a "+" was clicked first: the piece goes there at once
		if (target) {
			void this.placeAt(target, piece);
			return;
		}
		// a tile picked first: the places it may go light up (a second press puts it back)
		if (this.armed === piece.file) this.armed = null;
		else {
			this.armed = piece.file;
			this.say("");
			this.closePanel();
		}
		this.repaint();
	}

	/** A "+" on the page was pressed: with a piece picked it places it (if it may go there); else it becomes the place to add at. */
	private pressSlot(slot: Slot): void {
		const root = this.root;
		if (!root) return;
		const piece = this.armedPiece();
		if (piece) {
			const may = slotAccepts(root, slot, piece);
			if (!may.ok) {
				this.say(ui("pal.off", { name: pieceName(piece), reason: may.reason }));
				return;
			}
			void this.placeAt(slot, piece);
			return;
		}
		this.target = this.target === slot.id ? null : slot.id;
		this.popup = null;
		if (this.target) {
			this.tab = "add";
			this.openPanel();
			this.drawLeft();
		}
		this.repaint();
	}

	/** Puts a piece in a slot of the page: the one insertion, from a press, a drop and Enter alike. Adds never ask. */
	private placeAt(slot: Slot, piece: PalettePiece): Promise<void> {
		return this.later(async () => {
			// what is typed is applied first; a "+" of a page whose lines have since changed is for a page that is not there: it is drawn again
			if (this.editor?.dirty()) await this.editor.applyAll();
			if (this.stalePage()) return this.draw();
			const part = PART_NEEDS.has(needsOf(piece)[0] ?? "");
			this.armed = this.target = null;
			this.popup = null;
			this.dragging = false;
			this.closePanel();
			const op = insertPiece(this.text, slotPositionFor(slot, piece), { file: piece.file, text: piece.text });
			// the new block is selected; a new part of the booklet (a tab, a page, an activity) is a card of this page, and the view stays on it
			await this.carryOut(op, { how: "add", name: capital(piece.file === WORDS_PIECE.file ? ui("piece.words") : piece.label), select: part ? "keep" : "lines" });
		});
	}

	/** Puts a piece where the keys say: the chosen "+", else the selected block's legal place. */
	private placeKeyed(piece: PalettePiece): Promise<void> {
		const root = this.root;
		const name = pieceName(piece);
		if (!root) return Promise.resolve();
		const target = this.target ? this.slotById(this.target) : undefined;
		if (target) {
			const may = slotAccepts(root, target, piece);
			if (!may.ok) {
				this.say(ui("keys.refused", { name, reason: may.reason }));
				return Promise.resolve();
			}
			return this.placeAt(target, piece);
		}
		const placed = placeFor(root, this.selected, piece);
		if (!placed.ok) {
			this.say(ui("keys.refused", { name, reason: placed.reason }));
			this.repaint();
			return Promise.resolve();
		}
		return this.later(async () => {
			if (this.editor?.dirty()) await this.editor.applyAll();
			if (this.stalePage()) return this.draw();
			const part = PART_NEEDS.has(needsOf(piece)[0] ?? "");
			this.armed = this.target = null;
			this.popup = null;
			this.closePanel();
			const op = insertPiece(this.text, placed.position, { file: piece.file, text: piece.text });
			await this.carryOut(op, { how: "add", name: capital(name), select: part ? "keep" : "lines" });
		});
	}

	/** The listeners of a "+": a press, and the three events of a drop. */
	private wireSlot(el: HTMLElement, slot: Slot): void {
		el.addEventListener("click", () => this.pressSlot(slot));
		const dragged = (): PalettePiece | null => (this.dragging ? this.armedPiece() : null);
		const may = (): boolean => {
			const p = dragged();
			return !!p && !!this.root && slotAccepts(this.root, slot, p).ok;
		};
		el.addEventListener("dragover", (evt) => {
			// a place that may not take the piece shows nothing and takes nothing
			if (!may()) return;
			evt.preventDefault();
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = "copy";
			el.addClass("is-over");
		});
		el.addEventListener("dragleave", () => el.removeClass("is-over"));
		el.addEventListener("drop", (evt) => {
			el.removeClass("is-over");
			const p = dragged();
			if (!p || !may()) return;
			evt.preventDefault();
			void this.placeAt(slot, p);
		});
	}

	private dragStart(piece: PalettePiece, evt: DragEvent): void {
		this.dragging = true;
		this.armed = piece.file;
		this.target = null;
		if (evt.dataTransfer) {
			evt.dataTransfer.setData(PIECE_MIME, piece.file);
			evt.dataTransfer.setData("text/plain", pieceName(piece));
			evt.dataTransfer.effectAllowed = "copy";
		}
		this.repaint();
	}

	private dragEnd(): void {
		if (!this.dragging) return;
		this.dragging = false;
		this.armed = null;
		this.repaint();
	}

	/* ---- the hotkeys: a group's letter, then a piece's letters, Enter places it; Esc lets go ---- */

	/** Opens the hotkeys on a group (or on the groups, with null). */
	openKeys(groupKey: string | null = null): void {
		this.popup = popupFor(groupKey);
		this.keysChanged();
	}

	/** Shows the Add tab (the command "Add part"), with the focus on its first group. */
	openCatalogue(): void {
		this.tab = "add";
		this.openPanel();
		this.drawLeft();
		this.repaint();
		this.leftEl?.querySelector<HTMLElement>(".booklet-design-pal-head, .booklet-design-commonchip")?.focus();
	}

	/** What the keys typed so far mean: the Add tab with their group marked, the piece they reach picked, and the keys said in the status line. */
	private keysChanged(): void {
		const p = this.popup;
		if (p?.group) {
			const g = groupOfKey(p.group);
			if (g) this.groupsOpen.set(g, true);
		}
		if (p) {
			this.tab = "add";
			this.openPanel();
		}
		const list = p ? listingOf(p) : null;
		const reached = p && list && p.group && list.mode !== "groups" && (p.rest !== "" || p.cursor !== null) ? (list.rows[list.cursor]?.piece ?? null) : null;
		this.armed = reached ? reached.file : null;
		this.say(p ? ui("keys.pending", { keys: spaced(p.group ?? "") + (p.rest ? ` ${spaced(p.rest.replace(/ /g, ""))}` : "") }) : "");
		this.keysSaid = !!p;
		this.drawLeft();
		this.repaint();
	}

	/** One key of the scope. It acts only in a view with no field of text focused and no modifier held; every other key goes on to whatever it was for. */
	private keyPress(evt: KeyboardEvent, key: string): false | undefined {
		const doc = this.contentEl.ownerDocument;
		if (isEditable(evt.target as Element | null) || isEditable(doc.activeElement)) return undefined;
		if (evt.ctrlKey || evt.metaKey || evt.altKey) return undefined;
		const target = evt.target as Element | null;
		if (key === "Escape") {
			if (this.cancelPlacing()) return false;
			if (this.panelOpen) {
				this.closePanel();
				return false;
			}
			if (this.edit) {
				void this.closeEditor();
				return false;
			}
			return undefined;
		}
		if (!this.popup) {
			if (key === "Enter" && !evt.shiftKey) {
				// a picked piece is placed at the chosen "+", else at the selected block's legal place (not when Enter is a button's own press)
				const piece = this.armedPiece();
				if (piece && !this.isControl(target)) {
					void this.placeKeyed(piece);
					return false;
				}
				// Enter on the selected block opens its Markdown in place (not when the key is a button's or a link's own press)
				const at = this.selected;
				if (!at || whyUnchangeable(at) || !this.enterIsFree(target, at)) return undefined;
				this.openEditor(at);
				return false;
			}
			// closed: only a group's letter does anything (Shift and every other key are not the view's)
			const g = evt.shiftKey ? undefined : KEY_GROUPS.find((x) => x.key === key);
			if (!g) return undefined;
			this.openKeys(g.key);
			return false;
		}
		// open: Enter and Space on a tile are that tile's own press; everywhere else they are the keys'
		if ((key === "Enter" || key === " ") && target && typeof target.closest === "function" && target.closest(".booklet-design-tile, .booklet-design-commonchip, .booklet-design-pal-head")) return undefined;
		const step = stepPopup(this.popup, key);
		this.popup = step.state;
		if (step.choose) void this.chooseRow(step.choose);
		else this.keysChanged();
		return false;
	}

	private isControl(el: Element | null): boolean {
		return !!el && typeof el.closest === "function" && el.closest("button, a, summary, input, select, textarea, [contenteditable]") !== null;
	}

	/** Enter on the keys: places the piece the row stands for, at the chosen "+" or at the selected block's legal place, or says why not. */
	private chooseRow(row: PopupRow): Promise<void> {
		const piece = row.piece;
		if (!piece) return Promise.resolve();
		return this.placeKeyed(piece);
	}

	/* ---- the editor in place ---- */

	private editsNode(n: DesignNode): boolean {
		return !!this.edit && this.edit.start === n.start && this.edit.kind === n.kind;
	}

	/** May Enter open the editor here? Not when it is a button's, a link's or a field's own press (other than the selected block itself). */
	private enterIsFree(target: Element | null, at: DesignNode): boolean {
		const control = target && typeof target.closest === "function" ? target.closest("button, a, summary, input, select, textarea, [contenteditable]") : null;
		if (!control) return true;
		const box = Array.from(this.contentEl.querySelectorAll<HTMLElement>(".booklet-design-block")).find((b) => b.getAttribute("data-start") === String(at.start));
		return control === box;
	}

	/**
	 * Selects a block and opens its own lines in the editor, in place. What is typed in the block that is open is applied first (and when
	 * it cannot be, that block stays open and says so: typed text is never dropped to make room). A block the view never changes is
	 * selected and nothing opens. `markdown`: the block's Markdown section is opened too, with the focus in it (the bar's "Edit as Markdown").
	 */
	private openEditor(n: DesignNode, markdown = false): void {
		this.afterEdits(() => {
			const node = this.live(n);
			if (!node) return this.draw();
			if (this.edit && this.editsNode(node)) {
				this.sel = { start: node.start, kind: node.kind };
				if (markdown) this.editor?.openMarkdown();
				else this.editor?.focus();
				return;
			}
			if (this.editor?.holds()) {
				this.say(ui("editor.busy"));
				return;
			}
			this.edit = null;
			const why = whyUnchangeable(node);
			this.sel = { start: node.start, kind: node.kind };
			if (why) {
				this.say(why);
				this.draw();
				return;
			}
			this.edit = { start: node.start, kind: node.kind };
			this.closePanel();
			this.draw();
			if (markdown) this.editor?.openMarkdown();
			else this.editor?.focus();
		});
	}

	/**
	 * Esc, and Ctrl or Cmd with Enter: what is typed in the open block is applied, and the block closes. Nothing is thrown away because
	 * nothing is waiting. The one exception is text that could not be applied (the note changed under it): the first press says so and
	 * leaves the block open, with the text in it, and the next closes it.
	 */
	private closeEditor(): Promise<void> {
		// nothing typed and nothing being written: it closes at once
		if (!this.queued && !this.editor?.dirty()) {
			this.finishClose();
			return Promise.resolve();
		}
		return this.later(async () => {
			if (!this.edit) return;
			if (this.editor?.dirty()) await this.editor.applyAll();
			this.finishClose();
		});
	}

	private finishClose(): void {
		if (!this.edit) return;
		if (this.editor && !this.editor.mayClose()) return;
		this.edit = null;
		this.draw();
		this.focusSelected();
	}

	/**
	 * Ctrl+Enter or Cmd+Enter closes the editor, after applying what is typed in it. Obsidian's own default hotkey for that chord ("open link
	 * in new tab") is run by the app's key map in the capture phase of the window and stops the event, so the box never hears it (found in
	 * the real app: a listener on the box alone never fired). The chord is therefore held by a scope of the view's own, put on the app's
	 * stack only while the box has the focus, and taken off when the box loses it, is drawn again or is gone: no other key of Obsidian's
	 * is touched outside that moment.
	 */
	private holdSaveKey(): void {
		if (!this.saveScope) {
			const scope = new Scope(this.scope ?? this.app.scope);
			scope.register(["Mod"], "Enter", () => {
				void this.closeEditor();
				return false;
			});
			this.saveScope = scope;
		}
		this.app.keymap.pushScope(this.saveScope);
	}

	private releaseSaveKey(): void {
		if (this.saveScope) this.app.keymap.popScope(this.saveScope);
	}

	/** The open block's lines are now these: one change from the box, asked about and written like any other; the box stays open. Runs in the lane. */
	private async changeBlock(lines: string[]): Promise<Outcome> {
		const node = this.openNode();
		if (!node) {
			this.say(ui("editor.moved"));
			return "refused";
		}
		const op = changeLines(this.text, node, lines);
		return this.runChange(op, { how: "change", name: this.titled(node), node, select: "lines", inBox: true });
	}

	/* ---- the page as it was drawn: a press on it finds its block where the block is now ---- */

	/** A replacement just written is noted, so a press on the page as it was drawn can be carried to where its block has gone (`live`). */
	private noted(before: string, after: string): void {
		const c = minimalChange(before, after);
		if (!c) return;
		this.steps.push({ before, after, from: c.from, to: c.to, delta: c.text.length - (c.to - c.from) });
		const extra = this.steps.length - 40;
		if (extra > 0) {
			this.steps.splice(0, extra);
			this.stepBase += extra;
		}
	}

	/** Where a line of a tree parsed after `parsedAt` replacements is now: carried through every replacement since, or null when one was made across its first character (or the tree is too old to carry). */
	private shifted(line: number, parsedAt: number): number | null {
		if (parsedAt < this.stepBase) return null;
		let at = line;
		for (const s of this.steps.slice(parsedAt - this.stepBase)) {
			let offset = 0;
			for (let i = 0; i < at; i++) offset = s.before.indexOf("\n", offset) + 1;
			if (offset < s.from) continue;
			if (offset < s.to) return null;
			const moved = offset + s.delta;
			at = s.after.slice(0, moved).split("\n").length - 1;
		}
		return at;
	}

	/** The node of the page as it was drawn, as the note has it now (the same kind, at the line it has been carried to), or null when it is not there. */
	private live(n: DesignNode): DesignNode | null {
		const root = this.liveRoot();
		if (n.parent === null) return root;
		// a node of the note as it is now needs no carrying
		let top = n;
		while (top.parent) top = top.parent;
		if (top === root) return n;
		const parsedAt = this.rootAt.get(top);
		const at = parsedAt === undefined ? n.start : this.shifted(n.start, parsedAt);
		if (at === null) return null;
		return walkDesign(root).find((x) => x.parent !== null && x.kind === n.kind && x.start === at) ?? null;
	}

	/** Has the number of lines changed since the page was drawn (a "+" of that page is then for lines that are not there)? */
	private stalePage(): boolean {
		return this.text.split("\n").length !== this.drawnLines;
	}

	/* ---- changes: each one is an operation on the text, asked about when it counts something, then written ---- */

	/**
	 * A press of the page's own buttons (a move, a delete, a placing, an undo, a close): one thing at a time, in the lane, after what is
	 * typed has been applied. Pressed again while one is queued or running, it is dropped: a double press does one thing.
	 */
	private later(work: () => Promise<void>): Promise<void> {
		// a view that is closed does no press: only what was queued before it closed (typed text) still writes
		if (this.closed) return Promise.resolve();
		if (this.opsQueued) return this.busy ?? Promise.resolve();
		return this.enqueue(work, true);
	}

	private remove(n: DesignNode): Promise<void> {
		return this.later(async () => {
			if (this.editor?.dirty()) await this.editor.applyAll();
			const node = this.live(n);
			if (!node) return this.draw();
			const op = deleteBlock(this.text, node);
			await this.carryOut(op, { how: "delete", name: this.titled(node), node, select: node.parent ? { start: node.parent.start, kind: node.parent.kind } : "lines" });
		});
	}

	/** A move by a place (the page's own buttons give a direction: `moveDir`). */
	private move(n: DesignNode, to: ReturnType<typeof moveTargets>["up"]): Promise<void> {
		return this.later(async () => {
			if (this.editor?.dirty()) await this.editor.applyAll();
			const node = this.live(n);
			if (!node) return this.draw();
			await this.moveTo(n, node, to);
		});
	}

	/** A move up or down: the place it goes to is worked out from the note as it is when the press is acted on, not from when the page was drawn. */
	private moveDir(n: DesignNode, dir: "up" | "down"): Promise<void> {
		return this.later(async () => {
			if (this.editor?.dirty()) await this.editor.applyAll();
			const node = this.live(n);
			if (!node) return this.draw();
			await this.moveTo(n, node, moveTargets(node)[dir]);
		});
	}

	private async moveTo(n: DesignNode, node: DesignNode, to: ReturnType<typeof moveTargets>["up"]): Promise<void> {
		if (!to) return;
		const op = moveBlock(this.text, node, to);
		// a part of the booklet is a card of this page, and the page stays; a block is selected where it lands
		const card = !!this.canvas?.cards.includes(n);
		await this.carryOut(op, { how: "move", name: this.titled(node), node, select: card ? "keep" : "lines" });
	}

	/**
	 * Makes a change: a refusal is said in words and nothing is written; a change that reports kept data it would leave not matching (or a
	 * booklet the reader could no longer open) is asked about first (a no changes nothing); then it is written as the smallest
	 * replacement, recorded for undo, and drawn. Gives true when the change landed, or was no change at all.
	 */
	private async carryOut(op: OpResult, how: ChangeHow): Promise<boolean> {
		const out = await this.runChange(op, how);
		return out === "landed" || out === "unchanged";
	}

	/** `carryOut`, saying how it came out. A change from the open block (`inBox`) draws only when no press is under way, and says nothing when it changes nothing. */
	private async runChange(op: OpResult, how: ChangeHow): Promise<Outcome> {
		this.message = "";
		const draw = (): void => (how.inBox ? this.requestDraw() : this.draw());
		if (!op.ok) {
			this.say(how.how === "change" ? ui("form.refused", { reason: op.reason }) : op.reason);
			draw();
			return "refused";
		}
		if (!op.change) {
			// nothing to write, so nothing is written, recorded or said: no empty step of Undo
			if (!how.inBox) draw();
			return "unchanged";
		}
		if (how.how !== "add" && needsAsking(op) && how.node) {
			const yes = await askDesign(this.app, {
				how: how.how,
				kind: kindName(how.node),
				name: `“${nameOf(how.node) || kindName(how.node)}”`,
				lines: how.how === "change" ? "" : uin("confirm.lines", this.lineCount(how.node)),
				impacts: op.impact,
				blind: op.blind,
				notes: op.notes,
			});
			if (!yes) {
				this.say(ui("status.cancelled"));
				draw();
				return "declined";
			}
		}
		const before = this.text;
		const was = this.sel ? { ...this.sel } : null; // where the person stood before this step: undo takes them back there
		const landed = await this.commit(before, op.text);
		if (landed !== "landed") return landed;
		this.noted(before, op.text);
		this.text = op.text;
		this.data = op.text;
		if (how.inBox) this.followOpen(op);
		else if (how.select === "lines") this.sel = op.lines ? { start: op.lines.start, kind: null } : null;
		else if (how.select !== "keep") this.sel = how.select;
		this.history.record(before, op.text, { before: was, after: this.sel ? { ...this.sel } : null });
		const said = ui(how.how === "add" ? "status.added" : how.how === "delete" ? "status.deleted" : how.how === "move" ? "status.moved" : "status.changed", { name: how.name });
		// every line ends its sentence after the name; a name that ends its own (a question, a sentence) is not given a second stop
		const line = /[.?!…]$/.test(how.name) && said.endsWith(`${how.name}.`) ? said.slice(0, -1) : said;
		this.say([line, ...op.notes].join(" "));
		draw();
		this.focusSelected();
		return "landed";
	}

	/** A change from the open block landed: the box stays open on the block, which is where its first line now is (a change can turn it into another kind of block). */
	private followOpen(op: OpResult & { ok: true }): void {
		const ed = this.edit;
		if (!ed) return;
		const start = op.lines ? op.lines.start : ed.start;
		const all = walkDesign(parseDesign(op.text)).filter((n) => n.parent !== null && n.start === start);
		const hit = all.find((n) => n.kind === ed.kind) ?? all[0];
		if (!hit) {
			// the block is not a block any more (its lines were written into something else): the box has nothing to stand on
			this.edit = null;
			this.sel = null;
			return;
		}
		ed.start = start;
		ed.kind = hit.kind;
		this.sel = { start, kind: hit.kind };
	}

	/** The lines a block takes with it, not counting the blank lines after it. */
	private lineCount(n: DesignNode): number {
		const lines = this.text.split("\n");
		let end = n.end;
		while (end - 1 > n.start && !(lines[end - 1] ?? "").trim()) end--;
		return end - n.start;
	}

	/** The focus goes to the selected block, so a keyboard user keeps their place (not when an editor has it). */
	private focusSelected(): void {
		const sel = this.selected;
		if (!sel || this.editor) return;
		const box = Array.from(this.contentEl.querySelectorAll<HTMLElement>(".booklet-design-block")).find((b) => b.getAttribute("data-start") === String(sel.start) && b.getAttribute("data-kind") === sel.kind);
		box?.focus();
	}

	/**
	 * Writes `after` in place of `before`, the note as this view read it, as the smallest replacement: into an open Markdown pane's editor or
	 * with `vault.process`. Written only when the note is still exactly `before`; if it is anything else (changed since this view drew
	 * it) nothing is written, the view takes the note as it is, and says so. Gives how it came out: "landed" when the note is now `after`.
	 */
	private async commit(before: string, after: string): Promise<"landed" | "stale" | "failed"> {
		const file = this.file;
		if (!file || !minimalChange(before, after)) return "failed";
		// a pop-out window that is closing is let go first (window-gone.ts)
		if (this.closingWindow) await windowGone(this.closingWindow);
		let result: string;
		try {
			result = await writeThrough(this.app, file, (fresh) => (fresh === before ? after : fresh));
		} catch {
			this.say(ui("status.failed"));
			this.requestDraw();
			return "failed";
		}
		if (result === after) return "landed";
		this.noted(before, result);
		this.text = result;
		this.data = result;
		this.say(ui("status.stale"));
		this.requestDraw();
		return "stale";
	}

	/* ---- undo and redo: this view's own, of its own writes ---- */

	private undoKey(evt: KeyboardEvent, which: "undo" | "redo"): false | undefined {
		// in a field the key is the field's: the view does nothing and the key goes on to it
		if (isEditable(evt.target as Element | null) || isEditable(this.contentEl.ownerDocument.activeElement)) return undefined;
		evt.preventDefault();
		void this.stepBack(which);
		return false;
	}

	/**
	 * Undo or redo the last step of this view, on the note as it is now; refused, with a reason, when the note is not as that step left it
	 * (the step stays where it is, unmoved). What is typed in the open block is applied first, so the step undone is that typing's own.
	 * Nothing here throws: whatever goes wrong becomes a line in the status line and a drawing from the note as it is.
	 */
	stepBack(which: "undo" | "redo"): Promise<void> {
		return this.later(async () => {
			const undo = which === "undo";
			try {
				if (this.editor?.dirty()) await this.editor.applyAll();
				this.message = "";
				const plan = undo ? this.history.planUndo(this.text) : this.history.planRedo(this.text);
				if (!plan.ok) {
					this.say(ui(plan.reason === "empty" ? (undo ? "status.nothingUndo" : "status.nothingRedo") : undo ? "status.undoChanged" : "status.redoChanged"));
					// a step that cannot be replayed leaves the view as the note is, never half drawn
					if (plan.reason !== "empty") this.draw();
					return;
				}
				const before = this.text;
				if ((await this.commit(before, plan.text)) !== "landed") return;
				if (undo) this.history.settleUndo();
				else this.history.settleRedo();
				this.noted(before, plan.text);
				this.text = plan.text;
				this.data = plan.text;
				// back where the person stood: before the step for an undo, after it for a redo
				if (plan.mark !== undefined) this.sel = this.reachable(plan.mark, plan.text);
				this.say(ui(undo ? "status.undone" : "status.redone"));
				this.draw();
			} catch (e) {
				this.say(ui(undo ? "status.undoFailed" : "status.redoFailed", { reason: e instanceof Error ? e.message : String(e) }));
				this.recover();
			}
		});
	}

	/**
	 * The selection to go back to, if the note still has it: the same line holding the same kind of block. When it does not (the note was
	 * changed since, or the step is one that took the block away), the nearest page around that line, and the booklet only when no page is.
	 */
	private reachable(sel: Selection | null, text: string): Selection | null {
		if (!sel) return null;
		const root = parseDesign(text);
		const all = walkDesign(root);
		if (all.some((n) => n.parent !== null && n.start === sel.start && (sel.kind === null || n.kind === sel.kind))) return sel;
		const page = navigableNodes(root).filter((n) => n.start <= sel.start && sel.start < n.end).pop();
		return page ? { start: page.start, kind: page.kind } : null;
	}
}

/** What a change says about itself. `inBox`: it comes from the open block's box, which stays open and is not drawn over a press under way. */
interface ChangeHow {
	how: "add" | "delete" | "move" | "change";
	name: string;
	node?: DesignNode;
	select: "lines" | "keep" | { start: number; kind: DesignKind };
	inBox?: boolean;
}
