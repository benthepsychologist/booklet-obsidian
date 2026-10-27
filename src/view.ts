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
	finalizeDraft,
	holdsSomething,
	isoSecond,
	localDay,
	parseBooklet,
	setAnswer,
	setDraftAnswer,
	shownDraft,
	type Activity,
	type AnswerValue,
	type Booklet,
	type DayRule,
	type Entry,
	type Finalized,
	type Question,
	type ShownDraft,
} from "./core";
import { drawQuestion, keyOf, picksOf, type QuestionHost, type Target } from "./questions";
import type { LeafMode } from "./switch";

export const VIEW_TYPE = "booklet";

/** What the view needs from the plugin. */
export interface ViewHost {
	setMode(leaf: WorkspaceLeaf, mode: LeafMode): Promise<void>;
}

/** How long a text field waits after the last key before its answer is written. */
const TYPING_PAUSE_MS = 700;
/** How many kept entries an activity lists before "Show all". */
const ENTRIES_SHOWN = 10;

/** The words for a part this view does not draw yet ("Not yet supported: …"). */
const UNSUPPORTED: Record<string, string> = {
	matrix: "a matrix question",
	widget: "a widget",
	query: "a query of kept entries or data",
	"menu-list": "a question whose options come from a shared menu",
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

/** A kept entry's moment, in the reader's own words and time zone: "Tue, 27 Oct 2026, 14:02". */
function when(ts: unknown): string {
	const t = Date.parse(String(ts));
	if (!Number.isFinite(t)) return String(ts);
	return new Date(t).toLocaleString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const newestFirst = (a: Entry, b: Entry) => {
	const x = Date.parse(String(a.ts));
	const y = Date.parse(String(b.ts));
	return Number.isFinite(x) && Number.isFinite(y) ? y - x : String(b.ts).localeCompare(String(a.ts));
};

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
	/** Writes run one after another. */
	private writes: Promise<void> = Promise.resolve();
	/** Activities whose whole list of kept entries is open. */
	private showAll = new Set<string>();
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
		if (clear || !this.book) {
			this.text = data;
			this.data = data;
			this.draw(true);
			return;
		}
		// Obsidian hands the view its own write back: nothing to draw, and a text field keeps its focus.
		if (data === this.text) return;
		// The note changed elsewhere (the Markdown tab, sync): draw again if its design changed, else
		// only show the answers it now holds.
		const designChanged = designKey(data) !== designKey(this.text);
		this.text = data;
		this.data = data;
		if (designChanged) this.draw(false);
		else {
			this.book = parseBooklet(data);
			this.syncWidgets();
		}
	}

	clear(): void {
		for (const p of this.pending.values()) if (p.timer !== null) window.clearTimeout(p.timer);
		this.pending.clear();
		this.widgets.clear();
		this.showAll.clear();
		this.text = "";
		this.data = "";
		this.book = null;
		if (this.drawing) this.removeChild(this.drawing);
		this.drawing = null;
		this.contentEl.empty();
	}

	override async onUnloadFile(file: TFile): Promise<void> {
		// write what was typed and is still waiting, before the view lets go of the file
		for (const p of [...this.pending.values()]) this.flushTyped(p.t, p.q);
		await this.writes;
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

	answerOf(t: Target, q: Question): unknown {
		if (t.activity.repeat) {
			const d = this.shown(t.activity).values;
			return own(d, q.id) ? d[q.id] : undefined;
		}
		const a = this.book?.records.answers[t.scope];
		return a && own(a, q.id) ? a[q.id] : undefined;
	}

	pendingOf(t: Target, q: Question): { value: AnswerValue | undefined } | null {
		const p = this.pending.get(keyOf(t, q));
		return p ? { value: p.value } : null;
	}

	earlierOwn(t: Target, q: Question): string[] {
		if (!t.activity.repeat) return [];
		const kept = [...(this.book?.records.entries[t.scope]?.[t.activity.id] ?? [])].sort(newestFirst);
		const out: string[] = [];
		for (const e of kept)
			for (const x of picksOf(e[q.id])) {
				if (typeof x !== "string" || !x.trim() || out.some((o) => o.trim().toLowerCase() === x.trim().toLowerCase())) continue;
				out.push(x.trim());
				if (out.length >= 12) return out;
			}
		return out;
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
		const focus = this.focusedField();
		const book = parseBooklet(this.text);
		this.book = book;
		this.widgets.clear();
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

		if (book.unshown.length) {
			// openings and notices are outside every activity: said once, at the top, with where they are
			const names = book.unshown.map((u) => {
				const m = book.modules.find((x) => x.id === u.scope);
				const where = u.scope ? `the module "${m ? m.title : u.scope}"` : "the booklet";
				return u.kind === "notice" ? `the notice of ${where}` : `the opening text of ${where}`;
			});
			page.createEl("p", { cls: "booklet-muted booklet-unshown", text: `Not yet supported: ${names.join(", ")}. This view draws the activities only; the rest is in the Markdown.` });
		}

		const shown = book.activities.filter((a) => !a.hidden);
		if (!shown.length) page.createEl("p", { cls: "booklet-muted", text: "This booklet has no activity to draw." });
		for (const a of shown) this.drawActivity(page, a);
		this.restoreFocus(focus);
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
				seed.setText(s ? `Showing today's entry, kept ${when(s.ts)}. Change an answer and finalize again to replace it.` : "");
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
			} else if (s.type === "unsupported") {
				const box = card.createDiv({ cls: "booklet-unsupported" });
				box.setAttr("data-booklet-unsupported", s.kind);
				// a group's or a callout's own words are drawn just above, as Obsidian draws the callout
				const inCallout = s.kind === "group" || s.kind === "in-callout";
				if (!inCallout) this.md(s.title || s.kind, box.createDiv({ cls: "booklet-prompt markdown-rendered" }));
				const said = (COMMON_KINDS as readonly string[]).includes(s.kind)
					? `This ${s.kind} question has no id, so it cannot hold an answer. Give it an id in Markdown.`
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
		const qs = a.segments.filter((s): s is Question => s.type === "question");
		for (const e of open ? all : all.slice(0, ENTRIES_SHOWN)) {
			const item = list.createDiv({ cls: "booklet-entry" });
			item.createDiv({ cls: "booklet-entry-when", text: when(e.ts) });
			const dl = item.createEl("dl");
			let rows = 0;
			for (const q of qs) {
				const w = answerWords(q, e[q.id]);
				if (!w) continue;
				rows++;
				this.md(q.title || q.id, dl.createEl("dt", { cls: "markdown-rendered" }));
				const dd = dl.createEl("dd");
				if ("list" in w) {
					const ul = dd.createEl("ul");
					for (const l of w.list) ul.createEl("li", { text: l });
				} else
					for (const p of w.parts) {
						if ("md" in p) this.md(p.md, dd.createSpan({ cls: "booklet-inline markdown-rendered" }));
						else dd.appendText(p.text);
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

	private dayRule(): DayRule {
		return { today: localDay(new Date()) };
	}

	/** What a repeating activity's draft shows now (for a daily one with nothing in its draft, today's entry). */
	private shown(a: Activity): ShownDraft {
		if (!this.book) return { values: nullMap<unknown>(), seededFrom: null };
		return shownDraft(this.book, a.scope, a, this.dayRule());
	}

	private syncWidgets(): void {
		for (const show of this.widgets.values()) show();
	}

	/** The text field that has focus, so a drawing can give it back with its caret where it was. */
	private focusedField(): { key: string; start: number | null; end: number | null } | null {
		const el = this.contentEl.ownerDocument.activeElement;
		if (!el || !(el.instanceOf(HTMLInputElement) || el.instanceOf(HTMLTextAreaElement)) || !this.contentEl.contains(el)) return null;
		const key = el.getAttribute("data-booklet-key");
		if (!key) return null;
		const typed = el.instanceOf(HTMLTextAreaElement) || el.type === "text";
		return { key, start: typed ? el.selectionStart : null, end: typed ? el.selectionEnd : null };
	}

	private restoreFocus(f: { key: string; start: number | null; end: number | null } | null): void {
		if (!f) return;
		for (const el of Array.from(this.contentEl.querySelectorAll("[data-booklet-key]"))) {
			if (el.getAttribute("data-booklet-key") !== f.key) continue;
			if (el.instanceOf(HTMLInputElement) || el.instanceOf(HTMLTextAreaElement)) {
				el.focus();
				if (f.start !== null && f.end !== null) el.setSelectionRange(f.start, f.end);
			}
			return;
		}
	}

	/* ---- answering ---- */

	/** Shows an answer at once, then writes it: into the activity's draft when it repeats, else into the answers. */
	private commit(t: Target, q: Question, value: AnswerValue | undefined): void {
		const file = this.file;
		if (!file) return;
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
		const designChanged = designKey(result) !== designKey(this.text);
		this.text = result;
		this.data = result;
		if (designChanged) this.draw(false);
		else {
			this.book = parseBooklet(result);
			this.syncWidgets();
		}
	}
}
