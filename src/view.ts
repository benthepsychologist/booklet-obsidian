/*
 * The Booklet view: a TextFileView over a booklet note, drawn with Obsidian's own Markdown renderer,
 * elements and theme. It never writes the whole file. Every answer goes into the records region,
 * computed from the note's fresh text by the core's setAnswer.
 */
import { Component, MarkdownRenderer, MarkdownView, Notice, TextFileView, type Menu, type TFile, type WorkspaceLeaf } from "obsidian";
import {
	designText,
	parseBooklet,
	setAnswer,
	type Activity,
	type AnswerValue,
	type Booklet,
	type Question,
} from "./core";
import type { LeafMode } from "./switch";

export const VIEW_TYPE = "booklet";

/** What the view needs from the plugin. */
export interface ViewHost {
	setMode(leaf: WorkspaceLeaf, mode: LeafMode): Promise<void>;
}

/** How long a text field waits after the last key before its answer is written. */
const TYPING_PAUSE_MS = 700;

const keyOf = (scope: string, id: string) => `${scope}/${id}`;

interface Pending {
	scope: string;
	id: string;
	value: string;
	timer: number | null;
}

export class BookletView extends TextFileView {
	/** The note's text as last read or written by this view: what getViewData returns. */
	private text = "";
	private book: Booklet | null = null;
	/** Child component for one drawing's rendered Markdown, unloaded at the next drawing. */
	private drawing: Component | null = null;
	/** One updater per drawn question, so an answer can be shown without drawing the view again. */
	private widgets = new Map<string, () => void>();
	/** Text typed and not yet written, by question. */
	private pending = new Map<string, Pending>();
	/** Writes run one after another. */
	private writes: Promise<void> = Promise.resolve();

	constructor(
		leaf: WorkspaceLeaf,
		private readonly host: ViewHost,
	) {
		super(leaf);
		// TextFileView's own save path writes getViewData() over the whole file, after a 2-second debounce
		// and when the view closes. This view never writes the whole file, so both are switched off here and
		// in save() below: every write goes through setAnswer on the note's fresh text (see write()).
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
		const designChanged = designText(data) !== designText(this.text);
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
		this.text = "";
		this.data = "";
		this.book = null;
		if (this.drawing) this.removeChild(this.drawing);
		this.drawing = null;
		this.contentEl.empty();
	}

	override async onUnloadFile(file: TFile): Promise<void> {
		// write what was typed and is still waiting, before the view lets go of the file
		for (const p of [...this.pending.values()]) this.flushTyped(p.scope, p.id);
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

	/* ---- drawing ---- */

	private md(markdown: string, el: HTMLElement): void {
		if (!this.drawing) return;
		void MarkdownRenderer.render(this.app, markdown, el, this.file ? this.file.path : "", this.drawing);
	}

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

		const shown = book.activities.filter((a) => !a.hidden);
		if (!shown.length) page.createEl("p", { cls: "booklet-muted", text: "This booklet has no activity to draw." });
		for (const a of shown) this.drawActivity(page, a);
		this.restoreFocus(focus);
	}

	private drawActivity(page: HTMLElement, a: Activity): void {
		const card = page.createDiv({ cls: "booklet-card" });
		const title = card.createDiv({ cls: "booklet-card-title markdown-rendered" });
		this.md(a.title, title);
		if (a.repeat)
			card.createEl("p", {
				cls: "booklet-muted",
				text: "This activity repeats, and keeping its entries is not yet supported, so its questions are shown and not answerable.",
			});
		for (const s of a.segments) {
			if (s.type === "prose") this.md(s.markdown, card.createDiv({ cls: "booklet-prose markdown-rendered" }));
			else if (s.type === "tab") this.md(s.title, card.createDiv({ cls: "booklet-tab markdown-rendered" }));
			else if (s.type === "unsupported") {
				const box = card.createDiv({ cls: "booklet-unsupported" });
				this.md(s.title || s.kind, box.createDiv({ cls: "booklet-prompt markdown-rendered" }));
				box.createEl("p", { cls: "booklet-muted", text: "Not yet supported" });
			} else this.drawQuestion(card, a, s);
		}
	}

	private drawQuestion(card: HTMLElement, a: Activity, q: Question): void {
		const box = card.createDiv({ cls: "booklet-question" });
		this.md(q.title || q.id, box.createDiv({ cls: "booklet-prompt markdown-rendered" }));
		if (q.help) this.md(q.help, box.createDiv({ cls: "booklet-help markdown-rendered" }));
		const key = keyOf(a.scope, q.id);
		const locked = a.repeat;

		if (q.kind === "text") {
			const field = q.long
				? box.createEl("textarea", { cls: "booklet-text booklet-long", attr: { rows: 4 } })
				: box.createEl("input", { cls: "booklet-text", type: "text" });
			field.setAttr("data-booklet-key", key);
			field.setAttr("aria-label", q.title || q.id);
			field.disabled = locked;
			const show = () => {
				if (this.pending.has(key) || field.ownerDocument.activeElement === field) return;
				const v = this.answerOf(a.scope, q.id);
				field.value = typeof v === "string" ? v : "";
			};
			const typed = this.pending.get(key);
			if (typed) field.value = typed.value;
			else show();
			this.widgets.set(key, show);
			field.addEventListener("input", () => this.typed(a.scope, q.id, field.value));
			field.addEventListener("blur", () => this.flushTyped(a.scope, q.id));
			return;
		}

		const row = box.createDiv({ cls: q.kind === "scale" ? "booklet-choices booklet-scale" : "booklet-choices" });
		row.setAttr("role", "group");
		row.setAttr("aria-label", q.title || q.id);
		const values: number[] = q.kind === "choice" ? q.options.map((_, n) => n + 1) : q.anchors.map((x) => x.n);
		const buttons: HTMLButtonElement[] = values.map((value, n) => {
			const button = row.createEl("button", { cls: "booklet-choice" });
			if (q.kind === "scale") {
				const anchor = q.anchors[n]!;
				button.createSpan({ cls: "booklet-number", text: String(anchor.n) });
				this.md(anchor.text, button.createDiv({ cls: "booklet-words markdown-rendered" }));
			} else this.md(q.options[n]!.text, button.createDiv({ cls: "booklet-words markdown-rendered" }));
			button.disabled = locked;
			button.addEventListener("click", (evt) => {
				evt.preventDefault();
				// picking the picked one again clears it
				const now = this.answerOf(a.scope, q.id);
				this.answer(a.scope, q.id, now === value ? undefined : value);
			});
			return button;
		});
		const show = () => {
			const v = this.answerOf(a.scope, q.id);
			buttons.forEach((b, n) => {
				const on = v === values[n];
				b.toggleClass("mod-cta", on);
				b.toggleClass("is-selected", on);
				b.setAttr("aria-pressed", on ? "true" : "false");
			});
		};
		show();
		this.widgets.set(key, show);
	}

	private answerOf(scope: string, id: string): unknown {
		const a = this.book?.records.answers[scope];
		return a && Object.prototype.hasOwnProperty.call(a, id) ? a[id] : undefined;
	}

	private syncWidgets(): void {
		for (const show of this.widgets.values()) show();
	}

	/** The text field that has focus, so a drawing can give it back with its caret where it was. */
	private focusedField(): { key: string; start: number | null; end: number | null } | null {
		const el = this.contentEl.ownerDocument.activeElement;
		if (!el || !(el.instanceOf(HTMLInputElement) || el.instanceOf(HTMLTextAreaElement)) || !this.contentEl.contains(el)) return null;
		const key = el.getAttribute("data-booklet-key");
		return key ? { key, start: el.selectionStart, end: el.selectionEnd } : null;
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

	private typed(scope: string, id: string, value: string): void {
		const key = keyOf(scope, id);
		const p = this.pending.get(key) ?? { scope, id, value, timer: null };
		p.value = value;
		if (p.timer !== null) window.clearTimeout(p.timer);
		p.timer = window.setTimeout(() => this.flushTyped(scope, id), TYPING_PAUSE_MS);
		this.pending.set(key, p);
	}

	private flushTyped(scope: string, id: string): void {
		const key = keyOf(scope, id);
		const p = this.pending.get(key);
		if (!p) return;
		if (p.timer !== null) window.clearTimeout(p.timer);
		this.pending.delete(key);
		this.answer(scope, id, p.value.trim() === "" ? undefined : p.value);
	}

	private answer(scope: string, id: string, value: AnswerValue | undefined): void {
		const file = this.file;
		if (!file) return;
		// show the pick at once; the note's text after the write is what counts
		if (this.book) {
			const all = this.book.records.answers;
			const into = all[scope] ?? (all[scope] = Object.create(null) as Record<string, unknown>);
			if (value === undefined) delete into[id];
			else into[id] = value;
			this.widgets.get(keyOf(scope, id))?.();
		}
		this.writes = this.writes
			.then(() => this.write(file, scope, id, value))
			.catch((e: unknown) => {
				new Notice(`Booklet: the answer was not saved. ${e instanceof Error ? e.message : String(e)}`);
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

	private async write(file: TFile, scope: string, id: string, value: AnswerValue | undefined): Promise<void> {
		let result: string;
		const md = this.markdownViewOf(file);
		if (md) {
			// The note is also open as Markdown. Its editor holds what was typed there and is not saved yet,
			// so the change goes into that editor, as the smallest edit (only the records region differs),
			// and the Markdown view saves it. Obsidian's guidelines: use the Editor for an open note.
			const editor = md.editor;
			const before = editor.getValue();
			const after = setAnswer(before, scope, id, value);
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
			// Atomic read-modify-write of the note on disk: setAnswer runs on the fresh text, never on this view's copy.
			let failure: unknown = null;
			result = await this.app.vault.process(file, (fresh) => {
				try {
					return setAnswer(fresh, scope, id, value);
				} catch (e) {
					failure = e;
					return fresh;
				}
			});
			if (failure) throw failure instanceof Error ? failure : new Error("The answer could not be written.");
		}
		if (this.file !== file) return;
		const designChanged = designText(result) !== designText(this.text);
		this.text = result;
		this.data = result;
		if (designChanged) this.draw(false);
		else {
			this.book = parseBooklet(result);
			this.syncWidgets();
		}
	}
}
