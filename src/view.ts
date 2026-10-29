/*
 * The Booklet view: a TextFileView over a booklet note, drawn with Obsidian's own Markdown renderer,
 * elements and theme. It never writes the whole file. Every answer, draft and kept entry goes into the
 * records region, computed from the note's fresh text by the core (setAnswer, setDraftAnswer,
 * finalizeDraft), which changes only what the reader changed.
 */
import { Component, MarkdownRenderer, MarkdownView, Notice, TextFileView, type Menu, type TFile, type WorkspaceLeaf } from "obsidian";
import {
	COMMON_KINDS,
	RecordsWriteError,
	answerWords,
	designKey,
	earlierEntries,
	eachWords,
	finalizeDraft,
	holdsSomething,
	isoSecond,
	localDay,
	newestFirst,
	parseBooklet,
	planQuery,
	questionsOf,
	setAnswer,
	shapeIssue,
	setDraftAnswer,
	shownDraft,
	whenText,
	type Activity,
	type AnswerValue,
	type Booklet,
	type DayRule,
	type Entry,
	type AnswerWords,
	type Finalized,
	type Opening,
	type Question,
	type QuerySegment,
	type ShownDraft,
	type WordPart,
} from "./core";
import { keepHeld, loadHeld } from "./held-store";
import { drawQueryPlan, words } from "./query-view";
import { drawQuestion, keyOf, type QuestionHost, type Target } from "./questions";
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

/** The words for a part this view does not draw yet ("Not yet supported: …"). */
const UNSUPPORTED: Record<string, string> = {
	matrix: "a matrix question",
	group: "questions inside a group",
	"in-callout": "a question inside a callout",
};

interface Pending {
	t: Target;
	q: Question;
	value: AnswerValue | undefined;
	timer: number | null;
}

const own = (o: object | undefined, k: string) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const nullMap = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;
const sameAct = (a: Activity, b: Activity) => a.scope === b.scope && a.id === b.id;

/** The last second of a moment's day, on the device's calendar. */
function endOfDay(d: Date): number {
	const e = new Date(d.getTime());
	e.setHours(23, 59, 59, 0);
	return e.getTime();
}

export class BookletView extends TextFileView implements QuestionHost {
	/** The note's text as last read or written by this view: what getViewData returns. */
	private text = "";
	private book: Booklet | null = null;
	/** Child component for one drawing's rendered Markdown, unloaded at the next drawing. */
	private drawing: Component | null = null;
	/** One updater per drawn question (and per repeating activity), so an answer is shown without drawing the view again. */
	private widgets = new Map<string, () => void>();
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
	/**
	 * When the view was last drawn. Today is its date (SPEC section 8): a check-in left open past midnight keeps
	 * writing to the day it shows, and a span of days counts back from it. The view is drawn again, taking a new today,
	 * when it comes back into use on a later day (see onload).
	 */
	private drawnAt = new Date();
	private seq = 0;

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
		for (const p of [...this.pending.values()]) this.flushTyped(p.t, p.q);
		this.flushOwn(null);
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

	md(markdown: string, el: HTMLElement): void {
		if (!this.drawing) return;
		void MarkdownRenderer.render(this.app, markdown, el, this.file ? this.file.path : "", this.drawing).then(() => {
			// a task box in the file's prose is drawn, not operated: a press here must never edit the design
			for (const box of Array.from(el.querySelectorAll("input[type=checkbox]"))) if (box.instanceOf(HTMLInputElement)) box.disabled = true;
		});
	}

	uid(): string {
		return `booklet-${++this.seq}`;
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

	pendingOf(t: Target, q: Question): { value: AnswerValue | undefined } | null {
		const p = this.pending.get(keyOf(t, q));
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

	answer(t: Target, q: Question, value: AnswerValue | undefined): void {
		const p = this.pending.get(keyOf(t, q));
		if (p) {
			if (p.timer !== null) window.clearTimeout(p.timer);
			this.pending.delete(keyOf(t, q));
		}
		this.commit(t, q, value);
	}

	typed(t: Target, q: Question, value: AnswerValue | undefined): void {
		const key = keyOf(t, q);
		const p = this.pending.get(key) ?? { t, q, value, timer: null };
		p.value = value;
		if (p.timer !== null) window.clearTimeout(p.timer);
		p.timer = window.setTimeout(() => this.flushTyped(t, q), TYPING_PAUSE_MS);
		this.pending.set(key, p);
	}

	flushTyped(t: Target, q: Question): void {
		const key = keyOf(t, q);
		const p = this.pending.get(key);
		if (!p) return;
		if (p.timer !== null) window.clearTimeout(p.timer);
		this.pending.delete(key);
		this.commit(p.t, p.q, p.value);
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
		if (this.drawing) this.removeChild(this.drawing);
		this.drawing = this.addChild(new Component());
		const root = this.contentEl;
		root.empty();
		root.addClass("booklet-view");
		const page = root.createDiv({ cls: "booklet-page" });

		if (!book.ok) {
			const box = page.createDiv({ cls: "booklet-refusal" });
			box.createEl("p", { text: book.refusal ?? "This note cannot be opened as a booklet." });
			const back = box.createEl("button", { text: "Show Markdown", cls: "mod-cta" });
			back.addEventListener("click", () => void this.host.setMode(this.leaf, "markdown"));
			return;
		}

		if (book.problems.length) {
			const n = book.problems.length;
			const said = n === 1 ? "1 thing in this note could not be read" : `${n} things in this note could not be read`;
			if (opened) new Notice(`Booklet: ${said}. They are listed at the top of the view.`);
			const details = page.createEl("details", { cls: "booklet-problems" });
			details.createEl("summary", { text: said });
			const list = details.createEl("ul");
			for (const p of book.problems) list.createEl("li", { text: p });
		}

		// the booklet's opening, under its title (SPEC section 3); a module's is drawn above its first activity
		const opening = (o: Opening | undefined) => {
			if (!o) return;
			const box = page.createDiv({ cls: "booklet-opening" });
			box.setAttr("data-booklet-opening", o.module ?? "");
			if (o.title) {
				const title = box.createDiv({ cls: o.module === null ? "booklet-opening-title booklet-booklet-title" : "booklet-opening-title" });
				// a module's title is a booklet line's words, inline Markdown; the booklet's is its front matter's, plain text
				if (o.module === null) title.setText(o.title);
				else {
					title.addClass("markdown-rendered");
					this.md(o.title, title);
				}
			}
			if (o.markdown) this.md(o.markdown, box.createDiv({ cls: "booklet-prose markdown-rendered" }));
		};
		opening(book.openings.find((o) => o.module === null));

		if (book.unshown.length) {
			// a module's notice is outside every activity: said once, at the top, with where it is
			const names = book.unshown.map((u) => {
				const m = book.modules.find((x) => x.id === u.scope);
				return `the notice of the module "${m ? m.title : u.scope}"`;
			});
			page.createEl("p", { cls: "booklet-muted booklet-unshown", text: `Not yet supported: ${names.join(", ")}. It is in the Markdown.` });
		}

		const shown = book.activities.filter((a) => !a.hidden);
		if (!shown.length)
			page.createEl("p", {
				cls: "booklet-muted",
				text: book.activities.length || book.modules.length ? "This booklet has no activity to draw." : "This note has no activity line. Drawing a note with none as one activity is not yet supported.",
			});
		const headed = new Set<string>();
		for (const a of shown) {
			if (a.scope && !headed.has(a.scope)) {
				headed.add(a.scope);
				opening(book.openings.find((o) => o.module === a.scope));
			}
			this.drawActivity(page, a);
		}
		for (const [k] of restored) this.ownFields.get(k)?.commit();
	}

	private drawActivity(page: HTMLElement, a: Activity): void {
		const card = page.createDiv({ cls: "booklet-card" });
		card.setAttr("data-booklet-activity", `${a.scope}/${a.id}`);
		this.md(a.title, card.createDiv({ cls: "booklet-card-title markdown-rendered" }));
		const keeps = a.repeat && !!a.id;
		if (a.repeat) {
			card.addClass("booklet-repeats");
			card.createEl("p", {
				cls: "booklet-muted booklet-repeat-note",
				text: !a.id
					? "This activity repeats, and its line has no id, so its entries cannot be kept. Give it an id in Markdown."
					: a.daily
						? "Daily: Finalize keeps today's entry, and finalizing again today replaces it."
						: "Repeats: each time you finalize, your answers are kept as a dated entry.",
			});
		}
		if (keeps) {
			const seed = card.createDiv({ cls: "booklet-muted booklet-seed" });
			const showSeed = () => {
				const s = this.shown(a).seededFrom;
				seed.setText(s ? `Showing today's entry, kept ${whenText(s.ts)}. Change an answer and finalize again to replace it.` : "");
			};
			showSeed();
			this.onShow(`activity:${a.scope}/${a.id}:seed`, showSeed);
		}
		if (a.pages) card.createEl("p", { cls: "booklet-muted", text: "Pages are shown one under another here: moving page by page is not yet supported." });
		const t: Target = { scope: a.scope, activity: a };
		let tabs = 0;
		for (const s of a.segments) {
			if (s.type === "prose") this.md(s.markdown, card.createDiv({ cls: "booklet-prose markdown-rendered" }));
			else if (s.type === "tab") {
				this.md(s.title, card.createDiv({ cls: "booklet-tab markdown-rendered" }));
				if (!tabs++) card.createEl("p", { cls: "booklet-muted", text: "Tabs are shown one under another here: a tab bar is not yet supported." });
			} else if (s.type === "query") this.drawQuery(card, s);
			else if (s.type === "unsupported") {
				const box = card.createDiv({ cls: "booklet-unsupported" });
				box.setAttr("data-booklet-unsupported", s.kind);
				// a group's or a callout's own words are drawn just above, as Obsidian draws the callout
				const inCallout = s.kind === "group" || s.kind === "in-callout";
				if (!inCallout) this.md(s.title || s.kind, box.createDiv({ cls: "booklet-prompt markdown-rendered" }));
				const said = (COMMON_KINDS as readonly string[]).includes(s.kind)
					? `This ${s.kind} question has no id, so it cannot hold an answer. Give it an id in Markdown.`
					: s.kind === "each"
						? `Not yet supported: a ${s.of ?? "question"} question asked for each pick (each:). Its answers are kept.`
						: `Not yet supported: ${UNSUPPORTED[s.kind] ?? `the kind "${s.kind}"`}.${inCallout ? " The callout above is shown as Markdown." : ""}`;
				box.createEl("p", { cls: "booklet-muted", text: said });
			} else drawQuestion(this, card, t, s, a.repeat && !a.id);
		}
		if (!keeps) return;

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
		kept.createDiv({ cls: "booklet-entries-title", text: a.daily ? "Kept days" : "Kept entries" });
		const list = kept.createDiv({ cls: "booklet-entry-list" });
		let sig = "";
		const showEntries = () => {
			const all = [...(this.book?.records.entries[a.scope]?.[a.id] ?? [])].sort(newestFirst);
			const open = this.showAll.has(`${a.scope}/${a.id}`);
			const now = JSON.stringify([open, all]);
			if (now === sig) return;
			sig = now;
			this.drawEntries(list, a, all, open);
		};
		showEntries();
		this.onShow(`activity:${a.scope}/${a.id}:entries`, showEntries);
	}

	/** An activity's kept entries, newest first, each with its date and its answers in words from the file's own lists. */
	private drawEntries(list: HTMLElement, a: Activity, all: Entry[], open: boolean): void {
		list.empty();
		if (!all.length) {
			list.createEl("p", { cls: "booklet-muted", text: "No entries kept yet." });
			return;
		}
		const qs = questionsOf(a);
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

	/** A query's rows, from the kept entries (never a draft), worked out again when the records change; nothing is written. */
	private drawQuery(card: HTMLElement, s: QuerySegment): void {
		const box = card.createDiv({ cls: "booklet-query" });
		box.setAttr("data-booklet-query", s.query.from);
		const host = {
			md: (markdown: string, el: HTMLElement) => this.md(markdown, el),
			openNote: (path: string) => void this.app.workspace.openLinkText(path, this.file ? this.file.path : ""),
		};
		let sig = "";
		const show = () => {
			if (!this.book) return;
			const src = s.source;
			const act = src && src.kind !== "data" ? src.act : null;
			const rec = this.book.records;
			const now = JSON.stringify(act ? (act.repeat ? (rec.entries[act.scope]?.[act.id] ?? []) : (rec.answers[act.scope] ?? {})) : null);
			if (now === sig) return;
			sig = now;
			drawQueryPlan(host, box, planQuery(this.book, s, { drawn: this.drawnAt }));
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
		for (const p of [...this.pending.values()]) if (sameAct(p.t.activity, a)) this.flushTyped(p.t, p.q);
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

	private queue(file: TFile, change: (text: string) => string, failed: string, after?: () => void): void {
		this.writes = this.writes
			.then(() => this.write(file, change))
			.then(() => after?.())
			.catch((e: unknown) => {
				// a refusal the reader can act on (nothing to keep yet) is said as it is; anything else, as a failure
				const why = e instanceof Error ? e.message : String(e);
				new Notice(e instanceof RecordsWriteError ? `Booklet: ${why}` : `Booklet: ${failed} ${why}`);
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
