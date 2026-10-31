/*
 * The Booklet view: a TextFileView over a booklet note, drawn with Obsidian's own Markdown renderer,
 * elements and theme. It never writes the whole file. Every answer, draft and kept entry goes into the
 * records region, computed from the note's fresh text by the core (setAnswer, setDraftAnswer,
 * finalizeDraft), which changes only what the reader changed.
 */
import { Component, Keymap, MarkdownRenderer, MarkdownView, Notice, TextFileView, setIcon, type Menu, type TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import {
	COMMON_KINDS,
	HOME,
	RecordsWriteError,
	entryKey,
	removeEntry,
	activityPlace,
	activityStatus,
	answerWords,
	referenceContext,
	barTabs,
	type CalloutBox,
	buildNav,
	designKey,
	earlierEntries,
	eachWords,
	entryPlace,
	finalizeDraft,
	findHeading,
	hasScreen,
	holdsSomething,
	noteNumbers,
	tokenise,
	questionsIn,
	stepsOf,
	treeOf,
	homePlace,
	inlineMd,
	isStep,
	isoSecond,
	localDay,
	modulePlaceFor,
	moduleLinkName,
	moduleMeta,
	moduleNamed,
	moduleStatus,
	moduleTitle,
	newestFirst,
	mentionsOf,
	pagerOf,
	parseBooklet,
	pickKey,
	placeFrom,
	placeState,
	plainText,
	newViewState,
	planQuery,
	questionsOf,
	resolvePlace,
	samePlace,
	setAnswer,
	setPair,
	shapeIssue,
	setDraftAnswer,
	shownDraft,
	whenText,
	type ActTab,
	type Activity,
	type AnswerValue,
	type Booklet,
	type DayRule,
	type Entry,
	type AnswerWords,
	type Finalized,
	type ModTab,
	type Block,
	type Step,
	type NavAct,
	type PickValue,
	type NavMod,
	type NavModel,
	type PagerStep,
	type Place,
	type Question,
	type QuerySegment,
	type QueryViewState,
	type Segment,
	type TreePage,
	type ShownDraft,
	type WordPart,
} from "./core";
import { keepHeld, keepStepsOne, loadHeld, loadStepsOne } from "./held-store";
import { drawMentions, drawPageMenu, type MenuState } from "./page-menu";
import { drawCallout, drawMarks, drawSteps, type CiteScope } from "./reading";
import { mountQuery } from "./query-controls";
import { words } from "./query-view";
import { drawQuestion, keyOf, pressed, type QuestionHost, type Target } from "./questions";
import { drawCards, drawNotice, drawPager, drawPicture, drawTabBar, drawTrail, pagerCount, type CardRow, type Crumb, type PagerButton, type ScreenHost } from "./screens";
import type { LeafMode } from "./switch";

export const VIEW_TYPE = "booklet";

/** What the view needs from the plugin. */
export interface ViewHost {
	setMode(leaf: WorkspaceLeaf, mode: LeafMode): Promise<void>;
}

/** How long a text field waits after the last key before its answer is written. */
const TYPING_PAUSE_MS = 700;
/** After a press ends with no click (a touch that scrolled, say), how long a drawing that waits is held back still. */
const PRESS_END_MS = 300;
/** How many kept entries an activity lists before "Show all". */
const ENTRIES_SHOWN = 10;
/** Ids handed out by every view, so two panes in one window never share one (a tab names its panel by id). */
let uidCount = 0;

/** What the pager asks of the steps of the page on show. */
interface SteppingView {
	count: number;
	at(): number;
	go(to: number): void;
	/** Called after a move, so the pager can say what Back and Next now do. */
	onMove: (() => void) | null;
}

interface Pending {
	t: Target;
	q: Question;
	/** The pick the typing is the answer of, for a question asked for each pick (each.ts). */
	pick?: PickValue;
	value: AnswerValue | undefined;
	timer: number | null;
}

/** What identifies typing that is not written yet: its question, and under `each:` its pick. */
const pendingKey = (t: Target, q: Question, pick?: PickValue): string => (pick === undefined ? keyOf(t, q) : `${keyOf(t, q)}@${pickKey(pick)}`);

/** Where each pane was, in memory, for a pane that shows the note as Markdown for a while and comes back (see draw). Never saved anywhere. */
const lastPlace = new WeakMap<WorkspaceLeaf, { path: string; place: Place }>();

const own = (o: object | undefined, k: string) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const nullMap = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;
const sameAct = (a: Activity, b: Activity) => a.scope === b.scope && a.id === b.id;

/** Does this part ask for an answer: a question, or a question of a common kind that cannot be drawn (it has no id)? */
const asksAnAnswer = (s: Segment): boolean => s.type === "question" || (s.type === "unsupported" && (COMMON_KINDS as readonly string[]).includes(s.kind));

/** The last second of a moment's day, on the device's calendar. */
function endOfDay(d: Date): number {
	const e = new Date(d.getTime());
	e.setHours(23, 59, 59, 0);
	return e.getTime();
}

export class BookletView extends TextFileView implements QuestionHost, ScreenHost {
	/** The note's text as last read or written by this view: what getViewData returns. */
	private text = "";
	private book: Booklet | null = null;
	/** The module whose text is being drawn; null denotes the booklet opening. */
	private mdScope: string | null = null;
	/** Child component for one drawing's rendered Markdown, unloaded at the next drawing. */
	private drawing: Component | null = null;
	/** One updater per drawn question (and per repeating activity), so an answer is shown without drawing the view again. */
	private widgets = new Map<string, () => void>();
	/** Questions are being drawn off the page, to add held words (commitHeldOffscreen): no Markdown is rendered. */
	private offscreen = false;
	/** Text typed and not yet written, by question. */
	private pending = new Map<string, Pending>();
	/** Words typed in a field that are not an answer yet (Add your own), by field: kept across drawings. */
	private held = new Map<string, string>();
	/** The note's design changed while the reader was in a field or pressing: the view is drawn again when they are done. */
	private stale = false;
	/** A pointer press in the view has begun and not ended: a button under it must not be taken away. */
	private pressing = false;
	/** What the press under way began on (see pressTarget). */
	private pressOn: EventTarget | null = null;
	private settleTimer: number | null = null;
	/** Writes run one after another. */
	private writes: Promise<void> = Promise.resolve();
	/** The note's text was handed over while a Markdown pane of it held a different text: follow that pane's next change. */
	private following = false;
	/** A press has ended and its click has not come yet: the buttons are still kept (see syncWidgets). */
	private pressTail = false;
	private tailTimer: number | null = null;
	/** Answers to show again once the press under way is over. */
	private showPending = false;
	/** Each field for words of the reader's own (Add your own, a widget's), by key: what adds the words typed in it (see keepOwn). */
	private ownFields = new Map<string, { t: Target; commit: () => void }>();
	/** Activities whose whole list of kept entries is open. */
	private showAll = new Set<string>();
	/** The reader's choice of folding an activity's kept entries, by activity, for as long as the pane is open: never written anywhere, and no part of the saved place. */
	private entriesFolded = new Map<string, boolean>();
	/** Callouts the reader opened or folded, by place: for as long as the pane is open, never written. */
	private calloutOpen = new Map<string, boolean>();
	/** The step on show in each part with steps, by place (SPEC section 12, "one at a time"): never saved, and no step in Back and Forward. */
	private stepAt = new Map<string, number>();
	/** The notes' marks of the screen being drawn, and the one source open (see reading.ts); null where marks are left out. */
	private cite: CiteScope | null = null;
	private source: { open: { mark: HTMLElement; el: HTMLElement } | null } = { open: null };
	/**
	 * When the view was last drawn. Today is its date (SPEC section 8): a check-in left open past midnight keeps
	 * writing to the day it shows, and a span of days counts back from it. The view is drawn again, taking a new today,
	 * when it comes back into use on a later day (see onload).
	 */
	private drawnAt = new Date();
	/* ---- where the reader is: the view's state, which Obsidian saves with the pane and never the note (design 4.1) ---- */
	private nav: NavModel | null = null;
	private place: Place | null = null;
	/** A place handed over by setState before the note was drawn (a restored pane, Back and Forward). */
	private wanted: Place | null = null;
	/** The place the last drawing was made for. */
	private drawnPlace: Place | null = null;
	/** The part each tab was last seen on, for as long as the pane is open: choosing a tab returns to it. */
	private tabPart = new Map<string, number>();
	/** The tree menu of each tab of pages, open or not, and the words in its search box: kept for as long as the pane is open, never saved. */
	private menus = new Map<string, MenuState>();
	/** What the reader has done to each query's view (the parents opened in a nested list; the sort and filter): kept for as long as the pane is open, never saved. */
	private queryViews = new Map<string, QueryViewState>();
	/** A step through the pane is under way (Obsidian drops a second one asked for meanwhile: a double press turns one page). */
	private moving = false;
	/** A tab chosen while a step was under way: made when the step has landed, so that the last move asked for is the one that lands. */
	private afterMove: (() => void) | null = null;
	/** The move now being asked for is a step whatever the places say (a heading link that moves). */
	private stepWanted = false;
	/** The tab bar's chosen tab takes focus when the screen is drawn (a key moved the choice). */
	private focusTab = false;
	/** A press moved to another screen or page: after the drawing, focus goes to its title, or to the page, so a keyboard reader starts there. */
	private focusScreen = false;
	/** A heading to scroll to once the screen is drawn (a heading link). */
	private headingTo: string | null = null;
	/** The words of a link from another note (`[[Note.booklet#Words]]`), handed over before the note was drawn. */
	private subpath: string | null = null;
	/** Pieces of Markdown in this drawing still being rendered, and which drawing they belong to. */
	private rendering = 0;
	private gen = 0;
	/** A scroll position to come back to once the drawing is finished (Back and Forward, a redraw of the same place). */
	private scrollWanted: number | null = null;
	private scrollKept: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly host: ViewHost,
	) {
		super(leaf);
		// TextFileView's own save path writes getViewData() over the whole file, after a 2-second debounce
		// and when the view closes. This view never writes the whole file, so both are switched off here and
		// in save() below: every write goes through the core on the note's fresh text (see write()).
		this.requestSave = () => {};
	}

	override onload(): void {
		super.onload();
		this.addAction("file-text", "Show Markdown", () => void this.host.setMode(this.leaf, "markdown"));
		// A drawing that waits (see update) is made once the reader has left the field and no press is under way. A
		// press moves focus out of a field before its click, so the button under the pointer is kept until the click.
		this.registerDomEvent(this.contentEl, "focusout", () => this.settleSoon(0));
		this.registerDomEvent(this.contentEl, "click", () => {
			// the click's own handler has run: what waited to be shown is shown now
			this.endPressTail();
			this.settleSoon(0);
		});
		this.registerDomEvent(this.contentEl, "pointerdown", (evt) => this.pressBegan(evt.target), { capture: true });
		// a link in the note's own words (SPEC section 3): a heading link opens the place its words name, a link to a module opens it
		this.registerDomEvent(this.contentEl, "click", (evt) => this.followLink(evt));
		// a change to the file that a Markdown pane of the note takes into its editor after this view was handed it (see setViewData)
		this.registerEvent(
			this.app.workspace.on("editor-change", (_editor, info) => {
				if (!this.following || !this.file || info.file !== this.file) return;
				this.following = false;
				window.setTimeout(() => this.followMarkdown(), 0);
			}),
		);
		this.register(() => {
			this.cancelSettle();
			this.pressing = false;
			this.endPressTail();
		});
		// back in use on a later day than the one drawn (the window or the app shown again, the pane made active): drawn
		// again, so today is today. While the reader is in the middle of an answer the day it shows is kept.
		const later = () => {
			if (this.book && localDay(new Date()) !== localDay(this.drawnAt) && !this.busy()) this.draw(false);
		};
		const doc = this.contentEl.ownerDocument;
		this.registerDomEvent(doc, "visibilitychange", () => {
			if (doc.visibilityState === "visible") later();
		});
		if (doc.defaultView) this.registerDomEvent(doc.defaultView, "focus", later);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf === this.leaf) later();
			}),
		);
	}

	/**
	 * Writes everything typed and not yet written, and adds the words typed in Add your own and widget fields, as
	 * leaving each field would: the plugin runs this before the app quits or the window closes (main.ts).
	 */
	async saveTyped(): Promise<void> {
		this.flushAll();
		await this.writes;
	}

	override async save(_clear?: boolean): Promise<void> {
		// Deliberately nothing: see the constructor.
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : "Booklet";
	}

	override getIcon(): string {
		return "book-open";
	}

	/* ---- the view's state: where the reader is, Obsidian's Back and Forward, a restored pane (design section 4) ---- */

	/** Saved by Obsidian into the workspace layout, beside which note the pane shows: never into the note. */
	override getState(): Record<string, unknown> {
		const s = super.getState();
		if (this.place) Object.assign(s, placeState(this.place, this.nav ?? undefined));
		return s;
	}

	override async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const want = placeFrom(state);
		const before = this.file;
		const step = this.stepWanted;
		this.stepWanted = false;
		if (want) this.wanted = want;
		await super.setState(state, result);
		// a note newly loaded took the place as it was drawn; for the note already shown, the place is shown here
		if (!want || this.wanted !== want || this.file !== before || !this.book || !this.nav) return;
		this.wanted = null;
		const to = resolvePlace(this.nav, want);
		if (samePlace(this.place, to)) return;
		const moved = step || isStep(this.place, to);
		this.flushAll();
		this.setPlace(to);
		this.draw(false);
		// a move to another screen or part is a step in the pane's history (Obsidian's Back and Forward); choosing a tab is not
		if (moved) result.history = true;
		this.app.workspace.requestSaveLayout();
	}

	override getEphemeralState(): Record<string, unknown> {
		return { ...super.getEphemeralState(), scroll: this.contentEl.scrollTop };
	}

	override setEphemeralState(state: unknown): void {
		super.setEphemeralState(state);
		const o = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
		// A link from another note, `[[Note.booklet#Words]]`: Obsidian opens the note in the pane and hands the view the `#Words`
		// part as `subpath` (Obsidian's code, not its API). A block link (`#^id`) does nothing here (design 4.6).
		const sub = o["subpath"];
		if (typeof sub === "string" && sub.startsWith("#") && !sub.startsWith("#^") && sub.length > 1) {
			this.followSubpath(sub.slice(1));
			return;
		}
		const y = o["scroll"];
		if (typeof y !== "number") return;
		// Back and Forward hand the scroll back: applied once the screen is drawn (a drawing that is finished already takes it at once)
		if (this.rendering > 0 || !this.nav) this.scrollWanted = y;
		else this.contentEl.scrollTop = y;
	}

	/**
	 * A link from outside belongs to no module, so the whole file is searched and the first match in file order opens (design
	 * decision 9, call c). Typed words are written first, as before every other move. A note not drawn yet takes the place when it is.
	 */
	private followSubpath(words: string): void {
		if (!this.nav) {
			this.subpath = words;
			return;
		}
		const hit = findHeading(this.nav, words, null);
		if (!hit) return;
		// Obsidian hands this over while it is still opening the note in the pane, and drops a second move asked of the pane then
		// (design 4.2), so the place is taken here, not through the pane: Obsidian's own opening is the step the reader's Back undoes.
		const place = resolvePlace(this.nav, this.keepTabFor(hit, this.place));
		this.flushAll();
		if (samePlace(this.place, place)) {
			if (hit.heading) this.scrollToHeading(hit.heading);
			return;
		}
		this.headingTo = hit.heading;
		this.setPlace(place);
		this.draw(false);
		this.app.workspace.requestSaveLayout();
	}

	/** Takes `p` as the place on show: remembered for this pane, and the part of its tab remembered for as long as the pane is open. */
	private setPlace(p: Place): void {
		this.place = p;
		if (p.tab) this.tabPart.set(`${p.screen}#${p.tab}`, p.part);
		if (this.file) lastPlace.set(this.leaf, { path: this.file.path, place: p });
	}

	/** The tab bar's chosen tab takes focus on this drawing, if a key moved the choice (ScreenHost). */
	takeTabFocus(): boolean {
		const f = this.focusTab;
		this.focusTab = false;
		return f;
	}

	/**
	 * A move (design 3.4). A tab is chosen in place; another screen or another part goes through the pane (`setViewState`), so
	 * that Obsidian records the step. Obsidian drops a second move asked for while one is under way, which is right for a
	 * double press on Next (one page turns) and wrong for a tab chosen during a turn: that one waits for the turn to land
	 * and is made then, so the last move the reader asked for is the one that lands.
	 */
	go(to: Place, opts: { heading?: string | null; step?: boolean; focusTab?: boolean } = {}): void {
		if (!this.file || !this.nav) return;
		const p = resolvePlace(this.nav, to);
		const step = !!opts.step || isStep(this.place, p);
		if (this.moving) {
			if (!step) this.afterMove = () => this.go(to, opts);
			return;
		}
		this.flushAll();
		if (opts.focusTab) this.focusTab = true;
		if (samePlace(this.place, p)) {
			if (opts.heading) this.scrollToHeading(opts.heading);
			return;
		}
		this.headingTo = opts.heading ?? null;
		if (!opts.focusTab && !opts.heading) this.focusScreen = true;
		if (!step) {
			this.setPlace(p);
			this.draw(false);
			this.app.workspace.requestSaveLayout();
			return;
		}
		this.moving = true;
		this.stepWanted = true;
		const state: Record<string, unknown> = { ...this.getState(), ...placeState(p, this.nav) };
		if (!p.tab) delete state["tab"];
		void this.leaf
			.setViewState({ type: VIEW_TYPE, state, active: true })
			.catch(() => {
				// the move did not happen, so no draw is coming to take the focus
				this.focusScreen = false;
			})
			.finally(() => {
				this.moving = false;
				this.stepWanted = false;
				const later = this.afterMove;
				this.afterMove = null;
				later?.();
			});
	}

	/** Writes what was typed and not written yet, and adds the own words typed and not added (leaving a field does), before the screen is left. */
	private flushAll(): void {
		for (const p of [...this.pending.values()]) this.flushTyped(p.t, p.q, p.pick);
		this.flushOwn(null);
	}

	/** The place a heading hit opens: a heading in the opening of an activity with tabs is drawn above every tab, so the tab and part on show stay. */
	private keepTabFor(hit: { place: Place; keepTab: boolean }, now: Place | null): Place {
		const place = { ...hit.place };
		if (hit.keepTab && now && now.screen === place.screen) {
			place.tab = now.tab;
			place.part = now.part;
		}
		return place;
	}

	/** A heading link's place, opened as the reader's press asks: in this pane (a step if it moves), or in a new one (Ctrl or Cmd). */
	private followHeading(hit: { place: Place; heading: string | null; keepTab: boolean }, pane: ReturnType<typeof Keymap.isModEvent>): void {
		const place = this.keepTabFor(hit, this.place);
		if (pane && this.file && this.nav) {
			void this.app.workspace.getLeaf(pane).setViewState({ type: VIEW_TYPE, state: { file: this.file.path, ...placeState(resolvePlace(this.nav, place), this.nav) }, active: true });
			return;
		}
		this.go(place, { heading: hit.heading, step: true });
	}

	/** Inside the note: a heading link opens the place its words name; a link to a module the booklet holds opens it. Anything else is Obsidian's. */
	private followLink(evt: MouseEvent): void {
		const t = evt.target as Node | null;
		const a = t && t.instanceOf(HTMLElement) ? t.closest("a") : null;
		const nav = this.nav;
		if (!a || !nav || !this.file) return;
		const href = a.getAttribute("data-href") ?? a.getAttribute("href") ?? "";
		if (href.startsWith("#") && !href.startsWith("#^")) {
			evt.preventDefault();
			evt.stopPropagation();
			const hit = findHeading(nav, href.slice(1), this.scopeNow());
			if (hit) this.followHeading(hit, Keymap.isModEvent(evt));
			return;
		}
		const name = /^[a-z][a-z0-9+.-]*:/i.test(href) ? null : moduleLinkName(href);
		if (name === null) return;
		// a link to a whole module is the view's, never Obsidian's: opening it there would make an empty note of that name
		evt.preventDefault();
		evt.stopPropagation();
		const m = moduleNamed(nav, name);
		const to = m ? entryPlace(m) : null;
		if (to) this.go(to, { step: true });
	}

	/** Links the booklet cannot follow are not links: words nothing in their module has, and a module this booklet does not hold (SPEC section 3). */
	private fixLinks(el: HTMLElement): void {
		const nav = this.nav;
		if (!nav) return;
		const scope = this.scopeNow();
		for (const a of Array.from(el.querySelectorAll("a"))) {
			const href = a.getAttribute("data-href") ?? a.getAttribute("href") ?? "";
			if (href.startsWith("#") && !href.startsWith("#^")) {
				if (!findHeading(nav, href.slice(1), scope)) a.replaceWith(a.ownerDocument.createTextNode(a.textContent ?? ""));
				continue;
			}
			const name = /^[a-z][a-z0-9+.-]*:/i.test(href) ? null : moduleLinkName(href);
			if (name === null || moduleNamed(nav, name)) continue;
			const chip = a.ownerDocument.createElement("span");
			chip.className = "booklet-module-chip";
			chip.textContent = `${a.textContent ?? name} \u00b7 not in this booklet`;
			a.replaceWith(chip);
		}
	}

	getViewData(): string {
		return this.text;
	}

	setViewData(data: string, clear: boolean): void {
		// While the note is also open as Markdown, that pane's editor holds the newest text: what was typed there, and
		// every answer this view has written into it since it was last saved. The text handed over is the file as last
		// saved, which can be older (a Markdown pane saves as it loses focus, so a press in this view can land in the
		// editor before the save's text is handed over; and a note opened again here while that pane has not saved
		// yet is handed the file), and taking it would take back answers just given. So the editor's text is taken. A
		// change made to the file elsewhere reaches that editor a moment after this view is handed it, and is followed
		// from there.
		const md = this.file ? this.markdownViewOf(this.file) : null;
		const live = md ? md.editor.getValue() : "";
		if (md && live && live !== data) {
			this.following = true;
			data = live;
		}
		if (clear || !this.book) {
			this.text = data;
			this.data = data;
			// a note newly loaded into the view opens where the pane last was in it, else where the booklet opens (design 4.4)
			if (clear) {
				this.place = null;
				this.drawnPlace = null;
				this.tabPart.clear();
				this.menus.clear();
				this.queryViews.clear();
			}
			this.draw(true);
			return;
		}
		this.take(data);
	}

	/** The text a Markdown pane of the note holds now, if it differs from the view's (see setViewData). */
	private followMarkdown(): void {
		const md = this.file && this.book ? this.markdownViewOf(this.file) : null;
		const live = md ? md.editor.getValue() : "";
		if (live) this.take(live);
	}

	private take(data: string): void {
		// Obsidian hands the view its own write back: nothing to draw, and a text field keeps its focus.
		if (data === this.text) return;
		// The note changed elsewhere (a Markdown pane of the same note, Sync, another plugin): draw again if its
		// design changed, else only show the answers it now holds. Either way, a field the reader is in is left as it is.
		const designChanged = designKey(data) !== designKey(this.text);
		this.text = data;
		this.data = data;
		this.update(designChanged);
	}

	clear(): void {
		for (const p of this.pending.values()) if (p.timer !== null) window.clearTimeout(p.timer);
		this.pending.clear();
		this.held.clear();
		this.cancelSettle();
		this.stale = false;
		this.pressing = false;
		this.endPressTail();
		this.showPending = false;
		this.following = false;
		this.widgets.clear();
		this.ownFields.clear();
		this.showAll.clear();
		this.entriesFolded.clear();
		this.nav = null;
		this.place = null;
		this.drawnPlace = null;
		this.tabPart.clear();
		this.queryViews.clear();
		this.afterMove = null;
		this.headingTo = null;
		this.text = "";
		this.data = "";
		this.book = null;
		if (this.drawing) this.removeChild(this.drawing);
		this.drawing = null;
		this.contentEl.empty();
	}

	override async onUnloadFile(file: TFile): Promise<void> {
		// write what was typed and is still waiting, and own words typed in Add your own or a widget's field and not
		// added yet, before the view lets go of the file (another note opened in the pane, the pane closed, the view
		// switched to Markdown): leaving the note adds them as leaving the field would (SPEC section 5)
		await this.saveTyped();
		await super.onUnloadFile(file);
	}

	override onPaneMenu(menu: Menu, source: string): void {
		menu.addItem((item) =>
			item
				.setTitle("Show Markdown")
				.setIcon("file-text")
				.setSection("pane")
				.onClick(() => void this.host.setMode(this.leaf, "markdown")),
		);
		super.onPaneMenu(menu, source);
	}

	/* ---- QuestionHost ---- */

	/** Drawn by Obsidian. A footnote's mark in `markdown` is a numbered mark when `marks` (prose), and left out otherwise (a title, a label). */
	md(markdown: string, el: HTMLElement, marksOrScope: boolean | string | null = false, scope: string | null = this.mdScope): void {
		const marks = typeof marksOrScope === "boolean" ? marksOrScope : false;
		const at = typeof marksOrScope === "string" || marksOrScope === null ? marksOrScope : scope;
		if (!this.drawing || this.offscreen) return;
		const gen = this.gen;
		const ids: string[] = [];
		const context = referenceContext(this.book?.references ?? [], at);
		const text = tokenise(context ? `${markdown}\n\n${context}` : markdown, ids);
		this.rendering++;
		const cite = marks ? this.cite : null;
		void MarkdownRenderer.render(this.app, text, el, this.file ? this.file.path : "", this.drawing)
			.then(() => {
				if (ids.length) drawMarks(this, el, ids, cite, this.source);
				// a task box in the file's prose is drawn, not operated: a press here must never edit the design
				for (const box of Array.from(el.querySelectorAll("input[type=checkbox]"))) if (box.instanceOf(HTMLInputElement)) box.disabled = true;
				this.fixLinks(el);
			})
			.finally(() => {
				if (gen === this.gen && --this.rendering === 0) this.drawn();
			});
	}

	uid(): string {
		return `booklet-${++uidCount}`;
	}

	onShow(key: string, show: () => void): void {
		this.widgets.set(key, show);
	}

	keepOwn(key: string, t: Target, commit: () => void): void {
		this.ownFields.set(key, { t, commit });
	}

	pressTarget(): EventTarget | null {
		return this.pressing || this.pressTail ? this.pressOn : null;
	}

	/** Adds the own words typed and not added yet in Add your own and widget fields (of one activity, or all), as leaving each field would. */
	private flushOwn(a: Activity | null): void {
		for (const [key, f] of [...this.ownFields]) if (this.held.get(key) && (!a || sameAct(f.t.activity, a))) f.commit();
	}

	heldOf(key: string): string {
		return this.held.get(key) ?? "";
	}

	hold(key: string, words: string): void {
		if (words) this.held.set(key, words);
		else this.held.delete(key);
		// the reader's own words, kept on the device as they are typed, so a reload does not lose them (held-store.ts)
		if (this.file && this.ownFields.has(key)) keepHeld(this.app, this.file.path, key, words);
	}

	/** The answer the note holds for a question, as written. */
	private heldAnswer(t: Target, q: Question): unknown {
		if (t.activity.repeat) {
			const d = this.shown(t.activity).values;
			return own(d, q.id) ? d[q.id] : undefined;
		}
		const a = this.book?.records.answers[t.scope];
		return a && own(a, q.id) ? a[q.id] : undefined;
	}

	answerOf(t: Target, q: Question): unknown {
		// an answer of the wrong shape is shown as no answer: its question is drawn read-only, with a notice (wrongOf)
		const v = this.heldAnswer(t, q);
		return shapeIssue(q, v) ? undefined : v;
	}

	wrongOf(t: Target, q: Question): { issue: string; kept: string } | null {
		const v = this.heldAnswer(t, q);
		const issue = shapeIssue(q, v);
		return issue ? { issue, kept: JSON.stringify(v) } : null;
	}

	redrawSoon(): void {
		this.stale = true;
		this.settleSoon(0);
	}

	pendingOf(t: Target, q: Question, pick?: PickValue): { value: AnswerValue | undefined } | null {
		const p = this.pending.get(pendingKey(t, q, pick));
		return p ? { value: p.value } : null;
	}

	earlierOf(t: Target): { record: Record<string, unknown>; entries: Entry[] } {
		if (!this.book) return { record: nullMap<unknown>(), entries: [] };
		// the record being written as it is shown (a daily draft with nothing in it shows today's entry), and the kept
		// entries, newest first, without today's in a daily activity: the draft will replace it (core/earlier.ts)
		const record = t.activity.repeat ? this.shown(t.activity).values : (this.book.records.answers[t.scope] ?? nullMap<unknown>());
		return { record, entries: earlierEntries(this.book, t.scope, t.activity, this.dayRule()) };
	}

	reshow(): void {
		this.syncWidgets();
	}

	answer(t: Target, q: Question, value: AnswerValue | undefined, pick?: PickValue): void {
		const key = pendingKey(t, q, pick);
		const p = this.pending.get(key);
		if (p) {
			if (p.timer !== null) window.clearTimeout(p.timer);
			this.pending.delete(key);
		}
		this.commit(t, q, this.whole(t, q, value, pick));
	}

	typed(t: Target, q: Question, value: AnswerValue | undefined, pick?: PickValue): void {
		const key = pendingKey(t, q, pick);
		const p = this.pending.get(key) ?? { t, q, pick, value, timer: null };
		p.value = value;
		if (p.timer !== null) window.clearTimeout(p.timer);
		p.timer = window.setTimeout(() => this.flushTyped(t, q, pick), TYPING_PAUSE_MS);
		this.pending.set(key, p);
	}

	flushTyped(t: Target, q: Question, pick?: PickValue): void {
		const key = pendingKey(t, q, pick);
		const p = this.pending.get(key);
		if (!p) return;
		if (p.timer !== null) window.clearTimeout(p.timer);
		this.pending.delete(key);
		this.commit(p.t, p.q, this.whole(p.t, p.q, p.value, pick));
	}

	/**
	 * What a question's answer becomes when its answer is `value`: for a question asked for each pick, `value` is the answer
	 * of one pick (the `a` of its pair), and the rest of the pairs stay as they are (each.ts setPair).
	 */
	private whole(t: Target, q: Question, value: AnswerValue | undefined, pick?: PickValue): AnswerValue | undefined {
		if (pick === undefined) return value;
		const next = setPair(this.heldAnswer(t, q), pick, value);
		return next.length ? next : undefined;
	}

	/* ---- drawing ---- */

	private draw(opened: boolean): void {
		this.stale = false;
		this.cancelSettle();
		this.drawnAt = new Date();
		// words typed in a field for the reader's own and not added when the app last reloaded: shown in their fields and
		// added below, as leaving the field would have added them (held-store.ts)
		const restored = opened && this.file ? Object.entries(loadHeld(this.app, this.file.path)).filter(([k]) => !this.held.has(k)) : [];
		for (const [k, w] of restored) this.held.set(k, w);
		const book = parseBooklet(this.text);
		this.book = book;
		this.widgets.clear();
		this.ownFields.clear();
		this.cite = null;
		this.source.open = null;
		// a drawing is finished when every piece of Markdown in it is rendered (see md and drawn)
		this.gen++;
		this.rendering = 0;
		if (this.drawing) this.removeChild(this.drawing);
		this.drawing = this.addChild(new Component());
		const root = this.contentEl;
		root.empty();
		root.addClass("booklet-view");
		const page = root.createDiv({ cls: "booklet-page" });

		if (!book.ok) {
			this.nav = null;
			const box = page.createDiv({ cls: "booklet-refusal" });
			box.createEl("p", { text: book.refusal ?? "This note cannot be opened as a booklet." });
			const back = box.createEl("button", { text: "Show Markdown", cls: "mod-cta" });
			back.addEventListener("click", () => void this.host.setMode(this.leaf, "markdown"));
			return;
		}

		// one screen at a time: the booklet's home, a module's screen, an activity's screen (design section 3)
		const nav = buildNav(book, this.text);
		this.nav = nav;
		const problems = [...book.problems, ...nav.problems]; // the reader's, then the pages' trees'
		if (problems.length) {
			const n = problems.length;
			const said = n === 1 ? "1 thing in this note could not be read" : `${n} things in this note could not be read`;
			if (opened) new Notice(`Booklet: ${said}. They are listed at the top of the view.`);
			const details = page.createEl("details", { cls: "booklet-problems" });
			details.createEl("summary", { text: said });
			const list = details.createEl("ul");
			for (const p of problems) list.createEl("li", { text: p });
		}

		const remembered = lastPlace.get(this.leaf);
		const asked = this.wanted ?? this.place ?? (opened && remembered && this.file && remembered.path === this.file.path ? remembered.place : null);
		this.wanted = null;
		let place = resolvePlace(nav, asked);
		const outside = this.subpath !== null ? findHeading(nav, this.subpath, null) : null;
		this.subpath = null;
		if (outside) {
			place = resolvePlace(nav, this.keepTabFor(outside, place));
			this.headingTo = outside.heading;
		}
		this.setPlace(place);
		const shown = this.drawnPlace;
		this.drawnPlace = place;
		const moved = !shown || !samePlace(shown, place);
		this.scrollKept = moved ? null : root.scrollTop;
		page.setAttr("data-booklet-screen", place.screen);
		if (!nav.mods.some((m) => m.acts.length))
			page.createEl("p", {
				cls: "booklet-muted",
				text: book.activities.length || book.modules.length ? "This booklet has no activity to draw." : "This note has no activity line. Drawing a note with none as one activity is not yet supported.",
			});
		else if (place.screen === HOME) this.drawHome(page, nav, book);
		else if (place.screen.startsWith("module:")) {
			const m = nav.mods.find((x) => !x.bare && x.id === place.screen.slice(7));
			if (m) this.drawModuleScreen(page, nav, book, m, place);
		} else {
			const na = nav.byKey.get(place.screen.slice(9));
			if (na) this.drawActivityScreen(page, nav, na, place);
		}
		if (moved) {
			root.scrollTop = 0;
			if (this.focusScreen) this.focusMoved(page, !!shown && shown.screen === place.screen);
		}
		this.commitHeldOffscreen(nav, restored.map(([k]) => k));
		for (const [k] of restored) this.ownFields.get(k)?.commit();
		if (this.rendering === 0) this.drawn();
	}

	/**
	 * Words held for a field on another screen than the one drawn are added too: 0.5.0 drew every activity at once, so a reload added
	 * every held word, and a reload that shortly follows a move reopens on the screen before it. Each owning activity's questions are
	 * drawn once, off the page (nothing of Markdown, nothing kept of what they register), so that the words are added by the very
	 * closure the field's own commit runs: the same write, the same bytes. The drawing then keeps only the fields on the screen.
	 */
	private commitHeldOffscreen(nav: NavModel, keys: string[]): void {
		const want = keys.filter((k) => !this.ownFields.has(k));
		const acts = want.length ? [...nav.byKey.values()].filter((na) => want.some((k) => k.startsWith(`${na.key}/`))) : [];
		if (!acts.length) return;
		const widgets = new Set(this.widgets.keys());
		const fields = new Set(this.ownFields.keys());
		this.offscreen = true;
		try {
			for (const na of acts) {
				const into = this.contentEl.createDiv();
				into.remove();
				for (const segs of [na.opening, ...na.tabs.flatMap((t) => t.pages)]) this.drawSegs(into, na.act, segs.filter(asksAnAnswer));
			}
			for (const k of want) this.ownFields.get(k)?.commit();
		} finally {
			this.offscreen = false;
			for (const k of [...this.widgets.keys()]) if (!widgets.has(k)) this.widgets.delete(k);
			for (const k of [...this.ownFields.keys()]) if (!fields.has(k)) this.ownFields.delete(k);
		}
	}

	/** After a press that moved: focus goes to the new screen's title, or (the same screen, another page) to the page, as a keyboard reader's next step. */
	private focusMoved(page: HTMLElement, samePage: boolean): void {
		this.focusScreen = false;
		// on the same screen a named page's title is the start of the page (it is a heading, so a screen reader reads it as one)
		const to = (samePage ? (page.querySelector<HTMLElement>(".booklet-pagetitle") ?? page.querySelector<HTMLElement>(".booklet-pagebody")) : null) ?? page.querySelector<HTMLElement>(".booklet-screentitle");
		if (!to) return;
		to.setAttr("tabindex", "-1");
		to.focus({ preventScroll: true });
	}

	/** Every piece of Markdown in the drawing is rendered: a heading a link led to is scrolled into view, a scroll position kept is restored. */
	private drawn(): void {
		const heading = this.headingTo;
		this.headingTo = null;
		if (heading) {
			this.scrollKept = null;
			this.scrollWanted = null;
			this.scrollToHeading(heading);
			return;
		}
		const y = this.scrollWanted ?? this.scrollKept;
		this.scrollWanted = null;
		this.scrollKept = null;
		if (y !== null) this.contentEl.scrollTop = y;
	}

	private scrollToHeading(words: string): void {
		const want = plainText(words).toLowerCase();
		const found = Array.from(this.contentEl.querySelectorAll("h1, h2, h3, h4, h5, h6, .booklet-prompt, .callout-title-inner")).find((h) => plainText(h.textContent ?? "").toLowerCase() === want);
		// a heading inside a folded callout: open the callout first
		for (let p: Element | null = found?.parentElement ?? null; p && p !== this.contentEl; p = p.parentElement) if (p.classList.contains("is-collapsed")) p.classList.remove("is-collapsed");
		if (found && typeof found.scrollIntoView === "function") found.scrollIntoView({ block: "start" });
	}

	/* ---- the screens ---- */

	/** The booklet's own name: its front matter's title, else the note's. */
	private bookTitle(nav: NavModel): string {
		return nav.title || (this.file ? this.file.basename.replace(/\.booklet$/i, "") : "Booklet");
	}

	/** The module a heading link on the screen on show is looked for in (SPEC section 3): the bare activities are one module, "". */
	private scopeNow(): string {
		const s = this.place?.screen ?? HOME;
		if (s.startsWith("module:")) return s.slice(7);
		if (s.startsWith("activity:")) return this.nav?.byKey.get(s.slice(9))?.mod.id ?? "";
		return "";
	}

	/** A screen's head: the picture (an icon or an emoji), then the title. */
	private head(into: HTMLElement, title: string, icon: string | null, emoji: string | null): void {
		const head = into.createDiv({ cls: "booklet-screenhead" });
		if (icon || emoji) drawPicture(head, icon, emoji, true);
		const t = head.createDiv({ cls: "booklet-screentitle booklet-card-title markdown-rendered", attr: { role: "heading", "aria-level": "1" } });
		this.md(inlineMd(title), t);
	}

	/** The booklet's opening, or a module's: its first paragraph larger, the rest under it (SPEC section 3). */
	private opening(into: HTMLElement, markdown: string): void {
		if (markdown.trim()) this.md(markdown, into.createDiv({ cls: "booklet-opening booklet-prose markdown-rendered" }), true);
	}

	private actRow(na: NavAct, n: number): CardRow {
		const st = activityStatus(na, this.book as Booklet);
		return { title: na.title, emoji: na.emoji, icon: na.icon, blurb: na.blurb, status: st.text, statusMd: st.md, n, to: activityPlace(na), scope: na.act.scope };
	}

	/** The home screen's cards: a module is a card; a module of one activity is its activity's card (SPEC section 3); each bare activity at the top is its own. */
	private homeRows(nav: NavModel, book: Booklet): CardRow[] {
		return nav.cards.map((c, i) => {
			if (c.kind === "module") {
				const t = moduleTitle(nav, c.mod);
				return { title: t.title, emoji: t.emoji, icon: c.mod.icon, blurb: c.mod.blurb, status: moduleStatus(c.mod, book), statusMd: false, n: i + 1, to: entryPlace(c.mod) ?? homePlace(), scope: c.mod.id };
			}
			const na = c.act;
			const row = this.actRow(na, i + 1);
			if (na.mod.bare) return row;
			// a module of one activity is one card: the module's title, blurb and picture first, else the activity's
			const t = moduleTitle(nav, na.mod);
			return { ...row, title: t.title, emoji: t.emoji ?? na.emoji, icon: na.mod.icon ?? na.icon, blurb: na.mod.blurb || na.blurb };
		});
	}

	/** Cards whose statuses change when the note's answers do: drawn again when one reads differently (nothing on these screens is a field). */
	private watchCards(rows: () => CardRow[]): void {
		const sig = () => JSON.stringify(rows().map((r) => [r.status, r.statusMd]));
		const was = sig();
		this.onShow("screen-cards", () => {
			if (sig() !== was) this.draw(false);
		});
	}

	private drawHome(page: HTMLElement, nav: NavModel, book: Booklet): void {
		this.mdScope = null;
		const t = page.createDiv({ cls: "booklet-screenhead" }).createDiv({ cls: "booklet-screentitle", attr: { role: "heading", "aria-level": "1" } });
		t.addClass("markdown-rendered");
		this.md(inlineMd(this.bookTitle(nav)), t);
		const o = book.openings.find((x) => x.module === null);
		if (o) this.opening(page, o.markdown);
		drawCards(this, page, this.homeRows(nav, book));
		this.watchCards(() => this.homeRows(nav, this.book as Booklet));
	}

	private drawModuleScreen(page: HTMLElement, nav: NavModel, book: Booklet, m: NavMod, place: Place): void {
		this.mdScope = m.id;
		drawTrail(this, page, [
			{ md: this.bookTitle(nav), to: homePlace(), scope: null },
			{ md: m.title, to: null, scope: m.id },
		]);
		this.head(page, m.title, m.icon, m.emoji);
		// a module's own screen numbers the sources of its opening and its tabs' prose, in that order
		this.cite = this.citeScope(book, m.id, [m.opening, ...m.tabs.map((x) => x.md)]);
		this.opening(page, m.opening);
		page.createDiv({ cls: "booklet-meta", text: moduleMeta(m, book) });
		let tops = m.top;
		const bar = m.tabs.length > 1;
		const tab = bar ? (m.tabs.find((x) => x.id === place.tab) ?? (m.tabs[0] as ModTab)) : (m.tabs[0] ?? null);
		// what a tab holds (its prose and its cards) is the tab's panel
		let panel = page;
		if (tab) {
			if (bar) {
				const asPanel = drawTabBar(this, page, m.tabs, tab.id, m.title, (id) => this.go({ screen: place.screen, tab: id, part: 0 }, { focusTab: true }));
				panel = page.createDiv({ cls: "booklet-tabpanel" });
				asPanel(panel);
			}
			// with no tab bar, a module's one tab is shown under its name, as an activity's is
			else this.md(inlineMd(tab.title), page.createDiv({ cls: "booklet-tab markdown-rendered" }));
			if (tab.md) this.md(tab.md, panel.createDiv({ cls: "booklet-prose markdown-rendered" }), true);
			if (bar) tops = m.top.filter((x) => x.modTab === tab.id);
		}
		const rows = (): CardRow[] => tops.map((x) => this.actRow(x, x.number));
		drawCards(this, panel, rows());
		this.watchCards(rows);
		drawNotice(page, m.notice);
	}

	private drawActivityScreen(page: HTMLElement, nav: NavModel, na: NavAct, place: Place): void {
		const a = na.act;
		const m = na.mod;
		this.mdScope = a.scope;
		// a module of one activity has no screen of its own: this one is also the module's, its title, picture and opening first
		const single = !m.bare && m.acts.length === 1;
		const crumbs: Crumb[] = [{ md: this.bookTitle(nav), to: homePlace(), scope: null }];
		if (hasScreen(m)) crumbs.push({ md: m.title || m.id, to: modulePlaceFor(na), scope: m.id });
		const ups: NavAct[] = [];
		for (let p = na.parent; p; p = p.parent) ups.unshift(p);
		for (const p of ups) crumbs.push({ md: p.title, to: activityPlace(p), scope: p.act.scope });
		const mt = single ? moduleTitle(nav, m) : null;
		// the pages above the one on show (page trees): the trail then goes on past the activity, through the tab (when the activity has
		// a tab bar) and the pages above, to the page itself; on a top page it ends at the activity, as it did
		const bar = barTabs(na);
		const tab = bar.length ? (bar.find((x) => x.id === place.tab) ?? (bar[0] as ActTab)) : (na.tabs[0] as ActTab);
		const pager = pagerOf(na, tab, place);
		const here = pager.page;
		const above: TreePage[] = [];
		for (let q = here.parent; q; q = q.parent) above.unshift(q);
		const onTree = here.named && !!here.parent;
		crumbs.push({ md: mt ? mt.title : na.title, to: onTree ? activityPlace(na) : null });
		if (onTree) {
			if (bar.length) crumbs.push({ md: tab.title, to: { screen: place.screen, tab: tab.id, part: 0 } });
			for (const q of above) crumbs.push({ md: q.title, to: { screen: place.screen, tab: place.tab, part: q.at } });
			crumbs.push({ md: here.title, to: null });
		}
		// a tab with a menu marks the page on show there, and a screen marks one: its trail ends in plain words
		const menu = pager.pageLines && tab.tree.length > 1;
		drawTrail(this, page, crumbs, menu);

		const card = page.createDiv({ cls: "booklet-card booklet-act" });
		card.setAttr("data-booklet-activity", `${a.scope}/${a.id}`);
		this.head(card, mt ? mt.title : na.title, single ? (m.icon ?? na.icon) : na.icon, mt ? (mt.emoji ?? na.emoji) : na.emoji);
		if (a.repeat) card.addClass("booklet-repeats");
		if (a.repeat && !a.id) card.createEl("p", { cls: "booklet-muted booklet-repeat-note", text: "This activity repeats, and its line has no id, so its entries cannot be kept. Give it an id in Markdown." });
		const keeps = a.repeat && !!a.id;
		if (keeps) {
			const seed = card.createDiv({ cls: "booklet-muted booklet-seed" });
			const showSeed = () => {
				const s = this.shown(a).seededFrom;
				seed.setText(s ? `Showing today's entry, kept ${whenText(s.ts)}. Change an answer and finalize again to replace it.` : "");
			};
			showSeed();
			this.onShow(`activity:${a.scope}/${a.id}:seed`, showSeed);
		}
		// the sources an activity's screen numbers: its module's opening when that is this activity's too, then every page, in order
		this.cite = this.citeScope(this.book as Booklet, a.scope, [single ? m.opening : "", ...[na.opening, ...na.tabs.flatMap((x) => x.pages)].flatMap((segs) => segs.map((x) => (x.type === "prose" ? x.markdown : "")))]);
		if (single) this.opening(card, m.opening);
		// what comes before the first tab line is the activity's opening, shown above the tab bar and on every tab
		this.drawSegs(card, a, na.opening);
		const asPanel = bar.length ? drawTabBar(this, card, bar, tab.id, na.title, (id) => this.go({ screen: place.screen, tab: id, part: this.tabPart.get(`${place.screen}#${id}`) ?? 0 }, { focusTab: true })) : null;
		// with no tab bar, an activity's one tab is shown under its name
		if (!asPanel && na.named) this.md(inlineMd(tab.title), card.createDiv({ cls: "booklet-tab markdown-rendered" }));
		const pages = tab.pages;
		const at = Math.min(place.part, pages.length - 1);
		// a tab of named pages with two or more pages has a menu of its tree, with a search (a tab with none is a 0.16 tab and is drawn as it was)
		if (menu) {
			const key = `${place.screen}#${tab.id}`;
			const state = this.menus.get(key) ?? { open: false, query: "" };
			this.menus.set(key, state);
			drawPageMenu(this, card, tab, pager.page, (q) => ({ screen: place.screen, tab: place.tab, part: q.at }), state);
		}
		const counter = pager.of > 1 ? pagerCount(pager.at, pager.of, pager.pageLines) : null;
		// the group keeps its own name with the count: "Soil, 2 of 3" on a named page ("2 of 3" alone says nothing of what it counts)
		const label = counter && pager.page.named ? `${plainText(pager.page.title)}, ${counter}` : counter;
		const body = card.createDiv({ cls: "booklet-pagebody", attr: label ? { role: "group", "aria-label": label } : {} });
		// under a tab bar the page body is the chosen tab's panel (named by its tab, so the page group's own label stays but does not name it; the page count is also its description)
		if (asPanel) {
			asPanel(body);
			if (label) body.setAttr("aria-description", label);
		}
		// a named page's title heads each of its parts (the trail names only the pages above it); it is a heading, and a move lands on it
		if (pager.page.named) {
			const title = body.createEl("h2", { cls: "booklet-pagetitle markdown-rendered", attr: { tabindex: "-1" } });
			this.md(inlineMd(pager.page.written || pager.page.title), title);
		}
		const stepKey = (part: number) => `${place.screen}#${tab.id}#${part}`;
		const blocks = treeOf(pages[at] ?? []);
		const { lead, steps } = stepsOf(blocks);
		// two or more groups on a page may be taken one at a time (SPEC section 12): the reader's choice, kept on the device
		const one = steps.length >= 2 && !!this.file && loadStepsOne(this.app, this.file.path);
		if (steps.length >= 2) this.drawStepChoice(body, one);
		const stepping = one ? this.drawStepsOf(body, a, lead, steps, stepKey(at)) : null;
		if (!one) this.drawNodes(body, a, blocks);
		// under the last part of a page come the pages under it, as cards, and the pages that link to it
		if (pager.pageLines && pager.at === pager.of - 1) {
			if (pager.page.children.length) {
				card.createDiv({ cls: "booklet-meta booklet-treelabel", text: "Pages under this one" });
				drawCards(
					this,
					card,
					pager.page.children.map((c, i) => ({ title: c.title, emoji: c.emoji, icon: c.icon, blurb: c.blurb, status: "", statusMd: false, n: i + 1, to: { screen: place.screen, tab: place.tab, part: c.at } })),
				);
			}
			drawMentions(this, card, mentionsOf(nav, na, tab, pager.page));
		}
		if (na.children.length) {
			card.createDiv({ cls: "booklet-meta", text: "Under this one" });
			drawCards(
				this,
				card,
				na.children.map((c, i) => this.actRow(c, m.bare ? i + 1 : c.number)),
			);
		}
		if (this.showsFinish(na, tab)) this.drawFinish(card, a);

		// the pager: Back, the counter, Next (SPEC section 3, pages); one step at a time, Back and Next move a step first, then a part, then a page
		const holder = page.createDiv({ cls: "booklet-foot" });
		const foot = () => {
			holder.empty();
			const cur = stepping ? stepping.at() : 0;
			const n = stepping ? stepping.count : 0;
			// a move to another part or page of this tab: the first step of where it arrives, or (turning back to the part before) its last
			const arrive = (to: Place, last: boolean) => () => {
				if (last) this.stepAt.set(stepKey(to.part), Number.POSITIVE_INFINITY);
				else this.stepAt.delete(stepKey(to.part));
				this.go(to);
			};
			const button = (st: PagerStep): PagerButton => {
				switch (st.kind) {
					case "part":
						return { words: st.to.part < place.part ? "Back" : "Next", md: false, to: st.to, press: arrive(st.to, st.to.part < place.part) };
					case "before":
						return { words: "Back", md: false, to: st.to, press: arrive(st.to, false) };
					case "up":
						return { words: `Up: ${st.page.title}`, md: true, to: st.to, press: arrive(st.to, false) };
					case "next-page":
						return { words: `Next: ${st.page.title}`, md: true, to: st.to, press: arrive(st.to, false) };
					case "up-activity":
						return { words: `Up: ${st.act.title}`, md: true, to: st.to };
					case "next-activity":
						return { words: m.bare ? `Next: ${st.act.title}` : `Next: ${st.act.number}. ${st.act.title}`, md: true, to: st.to };
					case "overview":
						return { words: "Back to the overview", md: false, to: st.to };
				}
			};
			const back: PagerButton = stepping && cur > 0 ? { words: "Back", md: false, to: place, press: () => stepping.go(cur - 1) } : button(pager.back);
			const next: PagerButton | null = stepping && cur < n - 1 ? { words: "Next", md: false, to: place, press: () => stepping.go(cur + 1) } : pager.next ? button(pager.next) : null;
			drawPager(this, holder, back, pager.at, pager.of, next, pager.pageLines);
		};
		if (stepping) stepping.onMove = foot;
		foot();
		if (single) drawNotice(page, m.notice);
	}

	/**
	 * Is the activity's finish (Finalize, its notes and its kept entries) drawn under the page on show? Only where the tab on show
	 * holds a question of the activity, or the opening above every tab does (design decision 8, call H): a reading tab, or a
	 * tab of queries, has nothing to finalize. Applies to 0.16 files too.
	 */
	private showsFinish(na: NavAct, tab: ActTab): boolean {
		return na.opening.some(asksAnAnswer) || tab.pages.some((pg) => pg.some(asksAnAnswer));
	}

	private drawSegs(into: HTMLElement, a: Activity, segs: readonly Segment[]): void {
		this.drawNodes(into, a, treeOf(segs));
	}

	/** The notes' marks a screen draws: its own numbering of the notes its texts mark, read as its module reads them. */
	private citeScope(book: Booklet, scope: string, texts: readonly string[]): CiteScope {
		return { scope, notes: book, numbers: noteNumbers(book, scope, texts) };
	}

	/** `step` is the group a step draws, which is open however the note wrote it (SPEC section 12) until the reader folds it. */
	private drawNodes(into: HTMLElement, a: Activity, blocks: readonly Block[], step?: CalloutBox): void {
		this.mdScope = a.scope;
		const t: Target = { scope: a.scope, activity: a };
		for (const s of blocks) {
			if (s.type === "prose") this.md(s.markdown, into.createDiv({ cls: "booklet-prose markdown-rendered" }), true);
			else if (s.type === "tab" || s.type === "page") continue;
			else if (s.type === "query") this.drawQuery(into, a, s);
			else if (s.type === "callout-box") {
				const key = `${a.scope}/${a.id}#${s.start.line}`;
				// a folded callout that holds an answer is drawn open, and one the reader opened or folded stays as they left it
				const held = questionsIn(s.children).some((q) => holdsSomething(this.heldAnswer(t, q)));
				const open = this.calloutOpen.get(key) ?? (s === step || s.start.fold !== "-" || held);
				const body = drawCallout(this, into, s, open, (now) => this.calloutOpen.set(key, now));
				this.drawNodes(body, a, s.children);
			} else if (s.type === "row-box") {
				const row = into.createDiv({ cls: "booklet-row", attr: { "data-booklet-cells": String(s.cells.length) } });
				for (const cell of s.cells) this.drawNodes(row.createDiv({ cls: "booklet-rowcell" }), a, cell);
			} else if (s.type === "unsupported") {
				const box = into.createDiv({ cls: "booklet-unsupported" });
				box.setAttr("data-booklet-unsupported", s.kind);
				this.md(s.title || s.kind, box.createDiv({ cls: "booklet-prompt markdown-rendered" }));
				const said = (COMMON_KINDS as readonly string[]).includes(s.kind)
					? `This ${s.kind} question has no id, so it cannot hold an answer. Give it an id in Markdown.`
					: `Not yet supported: the kind "${s.kind}".`;
				box.createEl("p", { cls: "booklet-muted", text: said });
			} else drawQuestion(this, into, t, s, a.repeat && !a.id);
		}
	}

	/** The choice between one step at a time and all at once, shown where a part holds two or more groups. */
	private drawStepChoice(body: HTMLElement, one: boolean): void {
		const ctl = body.createDiv({ cls: "booklet-steps-choice" });
		for (const [words, now] of [["One at a time", true], ["All at once", false]] as const) {
			const b = ctl.createEl("button", { text: words });
			pressed(b, one === now);
			b.addEventListener("click", (evt) => {
				evt.preventDefault();
				if (one === now || !this.file) return;
				keepStepsOne(this.app, this.file.path, now);
				this.draw(false);
				window.setTimeout(() => this.contentEl.querySelector<HTMLElement>(".booklet-steps-choice [aria-pressed=true]")?.focus(), 0);
			});
		}
	}

	/**
	 * A part's steps (SPEC section 12, "one at a time"): what comes before its first group whole above them, then each group
	 * as a step with Back and Next in the pager. Which step is on show is the view's: no step goes into Back and Forward.
	 */
	private drawStepsOf(body: HTMLElement, a: Activity, lead: readonly Block[], steps: readonly Step[], key: string): SteppingView {
		const t: Target = { scope: a.scope, activity: a };
		this.drawNodes(body, a, lead);
		const said = (i: number) => questionsIn(steps[i]?.nodes ?? []).some((q) => holdsSomething(this.heldAnswer(t, q)));
		// a step is done when each of its questions holds an answer; one with no question, once a step after it holds one
		const done = (i: number): boolean => {
			const qs = questionsIn(steps[i]?.nodes ?? []);
			return qs.length ? qs.every((q) => holdsSomething(this.heldAnswer(t, q))) : steps.some((_s, j) => j > i && said(j));
		};
		const first = steps.findIndex((_s, i) => !done(i));
		const clamp = (n: number) => Math.max(0, Math.min(steps.length - 1, n));
		let cur = clamp(this.stepAt.get(key) ?? (first < 0 ? 0 : first));
		this.stepAt.set(key, cur);
		const drawn = drawSteps(body, steps, cur, done, (el, step) => this.drawNodes(el, a, step.nodes, step.group));
		const view: SteppingView = {
			count: steps.length,
			at: () => cur,
			onMove: null,
			go: (to) => {
				cur = clamp(to);
				this.stepAt.set(key, cur);
				drawn.show(cur);
				view.onMove?.();
				const box = drawn.box(cur);
				box?.focus();
				if (box && typeof box.scrollIntoView === "function") box.scrollIntoView({ block: "start" });
			},
		};
		// a step's dots follow its answers
		this.onShow(`steps:${key}`, () => drawn.show(cur));
		return view;
	}

	/** A repeating activity's note on how it keeps entries, Finalize, and its kept entries. */
	private drawFinish(card: HTMLElement, a: Activity): void {
		if (!a.repeat || !a.id) return;
		card.createEl("p", {
			cls: "booklet-muted booklet-repeat-note",
			text: a.daily ? "Daily: Finalize keeps today's entry, and finalizing again today replaces it." : "Repeats: each time you finalize, your answers are kept as a dated entry.",
		});
		const foot = card.createDiv({ cls: "booklet-finish" });
		const button = foot.createEl("button", { cls: "mod-cta booklet-finalize", text: "Finalize" });
		foot.createSpan({
			cls: "booklet-muted",
			text: a.daily ? "Keeps today's entry with the time. Finalizing again today replaces it." : "Keeps this entry with the date and time, then clears the fields.",
		});
		button.addEventListener("click", (evt) => {
			evt.preventDefault();
			this.finalize(a);
		});
		const kept = card.createDiv({ cls: "booklet-entries" });
		const key = `${a.scope}/${a.id}`;
		const uid = this.uid();
		// the list folds: its heading is a button that says how many are kept (Obsidian's own chevron, aria-expanded)
		const fold = kept.createEl("button", { cls: "booklet-entries-title booklet-fold", attr: { "aria-expanded": "true", "aria-controls": uid } });
		const chevron = fold.createSpan({ cls: "booklet-fold-chevron", attr: { "aria-hidden": "true" } });
		const label = fold.createSpan({ cls: "booklet-fold-label" });
		const list = kept.createDiv({ cls: "booklet-entry-list", attr: { id: uid } });
		const shown = () => !(this.entriesFolded.get(key) ?? this.entriesStartFolded(a));
		const setFold = () => {
			const open = shown();
			fold.setAttr("aria-expanded", open ? "true" : "false");
			list.hidden = !open;
			setIcon(chevron, open ? "lucide-chevron-down" : "lucide-chevron-right");
		};
		fold.addEventListener("click", (evt) => {
			evt.preventDefault();
			this.entriesFolded.set(key, shown());
			setFold();
		});
		let sig = "";
		const showEntries = () => {
			const all = [...(this.book?.records.entries[a.scope]?.[a.id] ?? [])].sort(newestFirst);
			const open = this.showAll.has(key);
			label.setText(`${a.daily ? "Kept days" : "Kept entries"} (${all.length})`);
			const now = JSON.stringify([open, all]);
			if (now === sig) return;
			sig = now;
			this.drawEntries(list, a, all, open);
		};
		setFold();
		showEntries();
		this.onShow(`activity:${a.scope}/${a.id}:entries`, showEntries);
	}

	/**
	 * Does an activity's list of kept entries start folded? Always open for now, as it was drawn before it could fold. Whether an
	 * activity starts folded is a mark in the file that the format does not have yet: it is read here once the format names it.
	 */
	private entriesStartFolded(_a: Activity): boolean {
		return false;
	}

	/** An activity's kept entries, newest first, each with its date and its answers in words from the file's own lists. */
	private drawEntries(list: HTMLElement, a: Activity, all: Entry[], open: boolean): void {
		list.empty();
		if (!all.length) {
			list.createEl("p", { cls: "booklet-muted", text: "No entries kept yet." });
			return;
		}
		const qs = questionsOf(a);
		// the activity's entries as this drawing's book holds them, in file order: a card's Delete names its entry by place in this list
		const base = this.book?.records.entries[a.scope]?.[a.id] ?? [];
		for (const e of open ? all : all.slice(0, ENTRIES_SHOWN)) {
			const item = list.createDiv({ cls: "booklet-entry" });
			item.createDiv({ cls: "booklet-entry-when", text: whenText(e.ts) });
			const dl = item.createEl("dl");
			let rows = 0;
			for (const q of qs) {
				// a question asked for each pick: one line for each pick its source holds in the entry, "<title> · <pick>"
				const rowsOf: { pick: WordPart | null; w: AnswerWords }[] = q.each
					? (() => {
							const ew = eachWords(a, q, e);
							return Array.isArray(ew) ? ew.map((x) => ({ pick: x.pick, w: x.words })) : [{ pick: null, w: ew }];
						})()
					: [{ pick: null, w: answerWords(q, e[q.id]) }];
				for (const { pick, w } of rowsOf) {
					if (!w) continue;
					rows++;
					const dt = dl.createEl("dt", { cls: "markdown-rendered" });
					this.md(q.title || q.id, pick ? dt.createSpan({ cls: "booklet-inline markdown-rendered" }) : dt);
					if (pick) words(this, dt, [{ text: " · " }, pick]);
					const dd = dl.createEl("dd");
					if ("kept" in w) {
						// an answer of the wrong shape is not put in words: it is said, and shown as written
						dd.createSpan({ cls: "booklet-muted", text: `Kept as written, not in the shape this question keeps (${w.issue}): ` });
						dd.createEl("code", { text: w.kept });
					} else if ("list" in w) {
						const ul = dd.createEl("ul");
						for (const l of w.list) ul.createEl("li", { text: l });
					} else words(this, dd, w.parts);
				}
			}
			const ids = new Set(qs.map((q) => q.id));
			const other = Object.keys(e).filter((k) => k !== "ts" && !ids.has(k) && holdsSomething(e[k])).length;
			if (!rows && !other) item.createDiv({ cls: "booklet-muted", text: "No answers in this entry." });
			if (other) item.createDiv({ cls: "booklet-muted", text: `${other === 1 ? "One answer" : `${other} answers`} kept here ${other === 1 ? "is" : "are"} for a question this view does not show yet.` });
			this.drawRemove(item, list, a, e, base.indexOf(e), entryKey(e));
		}
		if (all.length > ENTRIES_SHOWN) {
			const more = list.createEl("button", { cls: "booklet-more", text: open ? "Show fewer" : `Show all ${all.length} entries` });
			more.addEventListener("click", (evt) => {
				evt.preventDefault();
				const k = `${a.scope}/${a.id}`;
				if (open) this.showAll.delete(k);
				else this.showAll.add(k);
				this.syncWidgets();
			});
		}
	}

	/**
	 * The Delete button on a kept entry's card. It asks first, in place ("Delete this entry?", Yes or No), and nothing is
	 * written until Yes. It is only in the Kept entries list under Finalize, never on a query's cards. `at` is the entry's place
	 * among the activity's kept entries and `key` what it read as, both taken when the card was drawn: the pane's later copies
	 * of the note hold new objects for the same entries, so the card cannot look its entry up by object.
	 */
	private drawRemove(item: HTMLElement, list: HTMLElement, a: Activity, e: Entry, at: number, key: string): void {
		const foot = item.createDiv({ cls: "booklet-entry-foot" });
		// each button and the question are named with the entry they are for, by hidden words (ten cards would otherwise be ten buttons named "Delete")
		const which = this.uid();
		foot.createSpan({ cls: "booklet-sr", attr: { id: which }, text: `(the entry from ${whenText(e.ts)})` });
		const delId = this.uid();
		const del = foot.createEl("button", { cls: "booklet-entry-delete", text: "Delete", attr: { type: "button", id: delId, "aria-labelledby": `${delId} ${which}` } });
		const ask = foot.createDiv({ cls: "booklet-entry-ask", attr: { role: "group" } });
		ask.hidden = true;
		const askId = this.uid();
		ask.createSpan({ cls: "booklet-entry-ask-text", text: "Delete this entry?", attr: { id: askId } });
		ask.setAttr("aria-labelledby", `${askId} ${which}`);
		const yesId = this.uid();
		const yes = ask.createEl("button", { cls: "mod-warning", text: "Yes, delete", attr: { type: "button", id: yesId, "aria-labelledby": `${yesId} ${which}` } });
		const noId = this.uid();
		const no = ask.createEl("button", { text: "No", attr: { type: "button", id: noId, "aria-labelledby": `${noId} ${which}` } });
		const back = (): void => {
			ask.hidden = true;
			del.hidden = false;
			yes.disabled = false;
			no.disabled = false;
		};
		del.addEventListener("click", (evt) => {
			evt.preventDefault();
			del.hidden = true;
			ask.hidden = false;
			no.focus();
		});
		no.addEventListener("click", (evt) => {
			evt.preventDefault();
			back();
			del.focus();
		});
		// Escape is the usual way out of a question
		ask.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key !== "Escape") return;
			evt.preventDefault();
			evt.stopPropagation();
			back();
			del.focus();
		});
		yes.addEventListener("click", (evt) => {
			evt.preventDefault();
			yes.disabled = true;
			no.disabled = true;
			// a refusal or a failure leaves the card as it was, with its Delete button, so the reader can try again
			this.removeKept(list, a, e, at, key, () => {
				back();
				del.focus();
			});
		});
	}

	/** Takes one kept entry out of the note, by its place among the activity's entries and its time and what it read as (core/write.ts removeEntry). */
	private removeKept(list: HTMLElement, a: Activity, e: Entry, at: number, key: string, undone: () => void): void {
		const file = this.file;
		if (!file) return;
		const ts = String(e.ts);
		let removed = 0;
		this.queue(
			file,
			(text) => {
				const r = at < 0 ? { text, removed: 0 } : removeEntry(text, a.scope, a.id, at, ts, key);
				removed = r.removed;
				return r.text;
			},
			"The entry was not deleted.",
			() => {
				if (!removed) {
					new Notice("Booklet: that entry is no longer where it was in the note, so nothing was deleted.");
					undone();
					return;
				}
				// the card is gone: keep the reader's place in the list
				(list.closest(".booklet-entries")?.querySelector(".booklet-entries-title") as HTMLElement | null)?.focus();
			},
			undone,
		);
	}

	/** A query's rows, from the kept entries (never a draft), worked out again when the records change; nothing is written. */
	private drawQuery(card: HTMLElement, a: Activity, s: QuerySegment): void {
		const box = card.createDiv({ cls: "booklet-query" });
		box.setAttr("data-booklet-query", s.query.from);
		// the reader's own view of this query is found by the activity and the query's place among its queries, so a change above it does not move it
		const vkey = `${a.scope}/${a.id}#${a.segments.filter((x) => x.type === "query").indexOf(s)}`;
		const st = this.queryViews.get(vkey) ?? newViewState();
		this.queryViews.set(vkey, st);
		const host = {
			md: (markdown: string, el: HTMLElement) => this.md(markdown, el, false, a.scope),
			openNote: (path: string) => void this.app.workspace.openLinkText(path, this.file ? this.file.path : ""),
		};
		const draw = mountQuery(host, box, st);
		let sig = "";
		const show = () => {
			if (!this.book) return;
			const src = s.source;
			const act = src && src.kind !== "data" ? src.act : null;
			const rec = this.book.records;
			const now = JSON.stringify(act ? (act.repeat ? (rec.entries[act.scope]?.[act.id] ?? []) : (rec.answers[act.scope] ?? {})) : null);
			if (now === sig) return;
			sig = now;
			const book = this.book;
			draw(() => planQuery(book, s, { drawn: this.drawnAt }));
		};
		show();
		this.onShow(`query:${s.line}`, show);
	}

	private dayRule(): DayRule {
		return { today: localDay(this.drawnAt), until: endOfDay(this.drawnAt) };
	}

	/** What a repeating activity's draft shows now (for a daily one with nothing in its draft, today's entry). */
	private shown(a: Activity): ShownDraft {
		if (!this.book) return { values: nullMap<unknown>(), seededFrom: null };
		return shownDraft(this.book, a.scope, a, this.dayRule());
	}

	/**
	 * Shows every question's answer again. While a press is under way (from the pointer going down to its click), this
	 * waits: leaving a field for words of the reader's own adds them at once (the press's blur), and showing that could
	 * take away the button under the pointer (a summary row, an own word) before its click. The click's handler reads
	 * the answer as it is then, so it lands after the added words, as in booklet.html; then everything is shown.
	 */
	private syncWidgets(): void {
		if (this.pressing || this.pressTail) {
			this.showPending = true;
			return;
		}
		this.showPending = false;
		for (const show of this.widgets.values()) show();
	}

	/** The press is over (its click has come, or it never will): show what waited. */
	private endPressTail(): void {
		if (this.tailTimer !== null) window.clearTimeout(this.tailTimer);
		this.tailTimer = null;
		this.pressTail = false;
		if (!this.pressing) this.pressOn = null;
		if (this.showPending && !this.pressing) this.syncWidgets();
	}

	/*
	 * The rule for a change to the note (from elsewhere, or carried back by the view's own write): a field the reader
	 * is in is never overwritten or replaced. Each question's updater leaves a field alone while it has focus or holds
	 * typing not yet written, and brings it up to date when the reader leaves it (questions.ts). A change to the
	 * design would draw the whole view again, replacing every field: while the reader is in a field, or in the middle
	 * of a press, that drawing waits, and the answers are shown in the drawing there is. Typing not yet written is then
	 * written when the reader leaves the field, over whatever the change held for that question: it is the newer change.
	 */
	private update(designChanged: boolean): void {
		if (designChanged && !this.busy()) {
			this.draw(false);
			return;
		}
		if (designChanged) this.stale = true;
		this.book = parseBooklet(this.text);
		this.syncWidgets();
	}

	/** Is the reader in the middle of an answer (a field of this view has focus, or holds typing not yet written) or of a press (until its click)? */
	private busy(): boolean {
		if (this.pressing || this.pressTail || this.pending.size) return true;
		const el = this.contentEl.ownerDocument.activeElement;
		return !!el && this.contentEl.contains(el) && (el.instanceOf(HTMLInputElement) || el.instanceOf(HTMLTextAreaElement));
	}

	/** A drawing that waits is made after `ms`, if the reader is done by then (else at the next chance). */
	private settleSoon(ms: number): void {
		if (!this.stale) return;
		this.cancelSettle();
		this.settleTimer = window.setTimeout(() => {
			this.settleTimer = null;
			if (this.stale && !this.busy()) this.draw(false);
		}, ms);
	}

	private cancelSettle(): void {
		if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
		this.settleTimer = null;
	}

	private pressBegan(target: EventTarget | null): void {
		this.pressing = true;
		this.pressOn = target;
		// the press ends wherever the pointer is let go, in the window the view is in now (a pane can move to a window of its own)
		const doc = this.contentEl.ownerDocument;
		const end = () => {
			doc.removeEventListener("pointerup", end, true);
			doc.removeEventListener("pointercancel", end, true);
			this.pressEnded();
		};
		doc.addEventListener("pointerup", end, true);
		doc.addEventListener("pointercancel", end, true);
	}

	private pressEnded(): void {
		if (!this.pressing) return;
		this.pressing = false;
		// the click that ends most presses comes next and settles at once; this is for a press with no click (on a
		// touch screen the field is left, and the click comes, only after the pointer is lifted)
		this.pressTail = true;
		if (this.tailTimer !== null) window.clearTimeout(this.tailTimer);
		this.tailTimer = window.setTimeout(() => this.endPressTail(), PRESS_END_MS);
		this.settleSoon(PRESS_END_MS);
	}

	/* ---- answering ---- */

	/** Shows an answer at once, then writes it: into the activity's draft when it repeats, else into the answers. */
	private commit(t: Target, q: Question, value: AnswerValue | undefined): void {
		const file = this.file;
		if (!file) return;
		// an answer of the wrong shape is kept as written: nothing typed or pressed replaces it (the writer refuses too)
		const wrong = this.wrongOf(t, q);
		if (wrong) {
			new Notice(`Booklet: the answer was not saved. The note holds an answer to "${q.title || q.id}" that is not in the shape this question keeps, and it is kept as written.`);
			this.syncWidgets();
			return;
		}
		if (this.book) {
			const rec = this.book.records;
			if (t.activity.repeat) {
				const d = nullMap<unknown>();
				Object.assign(d, this.shown(t.activity).values);
				if (value === undefined) delete d[q.id];
				else d[q.id] = value;
				(rec.drafts[t.scope] ?? (rec.drafts[t.scope] = nullMap<Record<string, unknown>>()))[t.activity.id] = d;
			} else {
				const into = rec.answers[t.scope] ?? (rec.answers[t.scope] = nullMap<unknown>());
				if (value === undefined) delete into[q.id];
				else into[q.id] = value;
			}
			this.syncWidgets();
		}
		const rule = this.dayRule();
		const a = t.activity;
		this.queue(file, (text) => (a.repeat ? setDraftAnswer(text, t.scope, a.id, q.id, value, a.daily ? rule : undefined) : setAnswer(text, t.scope, q.id, value)), "The answer was not saved.");
	}

	/** Finalize: what was typed is written first, then the draft is kept as a dated entry. */
	private finalize(a: Activity): void {
		for (const p of [...this.pending.values()]) if (sameAct(p.t.activity, a)) this.flushTyped(p.t, p.q, p.pick);
		this.flushOwn(a);
		const file = this.file;
		if (!file) return;
		let done: Finalized | null = null;
		const rule = this.dayRule();
		this.queue(
			file,
			(text) => {
				done = finalizeDraft(text, a.scope, a.id, { ts: isoSecond(new Date()), rule: a.daily ? rule : undefined });
				return done.text;
			},
			"The entry was not kept.",
			() => {
				if (done) new Notice(done.replaced ? "Booklet: today's entry is replaced." : "Booklet: entry kept.");
			},
		);
	}

	private queue(file: TFile, change: (text: string) => string, failed: string, after?: () => void, undone?: () => void): void {
		this.writes = this.writes
			.then(() => this.write(file, change))
			.then(() => after?.())
			.catch((e: unknown) => {
				// a refusal the reader can act on (nothing to keep yet) is said as it is; anything else, as a failure
				const why = e instanceof Error ? e.message : String(e);
				new Notice(e instanceof RecordsWriteError ? `Booklet: ${why}` : `Booklet: ${failed} ${why}`);
				undone?.();
				if (this.file === file) {
					this.book = parseBooklet(this.text);
					this.syncWidgets();
				}
			});
	}

	/** An open Markdown view of the same note, if there is one. */
	private markdownViewOf(file: TFile): MarkdownView | null {
		let found: MarkdownView | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			const v = leaf.view;
			if (!found && v instanceof MarkdownView && v.file === file) found = v;
		});
		return found;
	}

	private async write(file: TFile, change: (text: string) => string): Promise<void> {
		let result: string;
		const md = this.markdownViewOf(file);
		if (md) {
			// The note is also open as Markdown. Its editor holds what was typed there and is not saved yet,
			// so the change goes into that editor, as the smallest edit (only the records region differs),
			// and the Markdown view saves it. Obsidian's guidelines: use the Editor for an open note.
			const editor = md.editor;
			const before = editor.getValue();
			const after = change(before);
			if (after !== before) {
				let p = 0;
				const max = Math.min(before.length, after.length);
				while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p++;
				let s = 0;
				while (s < max - p && before.charCodeAt(before.length - 1 - s) === after.charCodeAt(after.length - 1 - s)) s++;
				editor.replaceRange(after.slice(p, after.length - s), editor.offsetToPos(p), editor.offsetToPos(before.length - s));
			}
			result = editor.getValue();
		} else {
			// Atomic read-modify-write of the note on disk: the change runs on the fresh text, never on this view's copy.
			let failure: unknown = null;
			result = await this.app.vault.process(file, (fresh) => {
				try {
					return change(fresh);
				} catch (e) {
					failure = e;
					return fresh;
				}
			});
			if (failure) throw failure instanceof Error ? failure : new Error("The answer could not be written.");
		}
		if (this.file !== file) return;
		// the text written can carry a change the view had not seen (words typed in a Markdown pane, not yet saved)
		const designChanged = designKey(result) !== designKey(this.text);
		this.text = result;
		this.data = result;
		this.update(designChanged);
	}
}
