/*
 * The "Booklet blocks" panel: the editing surface for a booklet note, in the side bar beside the note.
 *
 *   top line   what the booklet holds (kept entries, saved answers, rows) and that changing an id, an option or a field can detach them
 *   Add        every piece the linter's format has, grouped; a click or tap puts it at the cursor of the note's Markdown editor, a drag
 *              (desktop) at the line it is dropped on (editor-drop.ts)
 *   This line  with the cursor on a Booklet line: its id, its switches and its fields, an icon picker; a change rewrites that line only
 *   Data fields  with the cursor in a data block: its declared fields, renamed or taken out of the declaration (rows are never written)
 *   Outline    modules, activities, tabs, pages and questions; a click jumps to the line
 *   Problems   lines the reader cannot read, with why, and kept data that matches nothing now; a click jumps to the line
 *
 * Everything the panel writes is the note's text before and after (core/editor-actions.ts); the editor is given only the bytes that
 * differ, and before a change that would detach kept data the panel asks (editor-modals.ts). The records section and the data rows are
 * never written. Every control has an accessible name and is reached by keyboard: they are native buttons, inputs and checkboxes,
 * and the sections are `<details>`. The words are English; the plugin does not localise.
 */
import { ItemView, MarkdownView, Notice, Platform, type Editor, type WorkspaceLeaf } from "obsidian";
import { changeLine, removeField, removeOption, renameField, renameId, renameOption, type FieldBlock, type LineView, type OptionList, type SettingsModel } from "./core/editor-actions";
import { analyse, panelModel } from "./core/editor-analysis";
import { removeWord, setFlag, setValue } from "./core/editor-line";
import { type OutlineNode } from "./core/editor-outline";
import { PIECE_GROUPS, piecesOf, type Piece } from "./core/editor-pieces";
import { HAS_FRONT } from "./core/editor-place";
import { type Problem } from "./core/editor-problems";
import { PIECE_MIME } from "./editor-drop";
import { pickIcon } from "./editor-modals";
import { forEachWindow, type EditorSide } from "./editor-side";
import { placePiece, writeNote } from "./editor-write";

export const PANEL_TYPE = "booklet-blocks";

let uid = 0;

/** A section of the panel: a `<details>` whose body is drawn again only when what it shows has changed. */
class Section {
	readonly el: HTMLDetailsElement;
	readonly body: HTMLElement;
	private readonly summary: HTMLElement;
	private signature: string | null = null;

	constructor(into: HTMLElement, private readonly title: string, open: boolean, cls: string) {
		this.el = into.createEl("details", { cls: `booklet-blocks-section ${cls}` });
		this.el.open = open;
		this.summary = this.el.createEl("summary", { text: title });
		this.body = this.el.createDiv({ cls: "booklet-blocks-body" });
	}

	/** Draws the body if `signature` is not what it was drawn from. */
	update(signature: string, draw: (body: HTMLElement) => void, title?: string): boolean {
		if (title !== undefined) this.summary.setText(title);
		if (signature === this.signature) return false;
		this.signature = signature;
		this.body.empty();
		draw(this.body);
		return true;
	}

	show(on: boolean): void {
		this.el.toggleClass("booklet-blocks-hidden", !on);
	}

	/** Forget what was drawn, so the next update draws. */
	forget(): void {
		this.signature = null;
	}

	get name(): string {
		return this.title;
	}
}

export class EditorPanel extends ItemView {
	private timer: number | null = null;
	/** The front matter block in the palette, and the line that says why it cannot be used when the note has properties. */
	private frontButton: HTMLButtonElement | null = null;
	private frontWhy: HTMLElement | null = null;
	private holds!: HTMLElement;
	private about!: HTMLElement;
	private add!: Section;
	private line!: Section;
	private options!: Section;
	private fields!: Section;
	private tree!: Section;
	private problems!: Section;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly side: EditorSide,
	) {
		super(leaf);
	}

	getViewType(): string {
		return PANEL_TYPE;
	}

	getDisplayText(): string {
		return "Booklet blocks";
	}

	override getIcon(): string {
		return "puzzle";
	}

	override onOpen(): Promise<void> {
		const el = this.contentEl;
		el.empty();
		el.addClass("booklet-blocks");
		this.holds = el.createDiv({ cls: "booklet-blocks-holds", attr: { role: "status" } });
		this.about = el.createDiv({ cls: "booklet-blocks-about" });
		this.add = new Section(el, "Add a block", true, "booklet-blocks-add");
		this.line = new Section(el, "This line", true, "booklet-blocks-line");
		this.options = new Section(el, "Options", true, "booklet-blocks-options");
		this.fields = new Section(el, "Data fields", true, "booklet-blocks-fields");
		this.tree = new Section(el, "Outline", false, "booklet-blocks-outline");
		this.problems = new Section(el, "Problems", false, "booklet-blocks-problems");
		this.drawPalette();

		const ws = this.app.workspace;
		this.registerEvent(ws.on("active-leaf-change", () => this.refreshSoon()));
		this.registerEvent(ws.on("editor-change", () => this.refreshSoon()));
		this.registerEvent(ws.on("file-open", () => this.refreshSoon()));
		this.registerEvent(ws.on("layout-change", () => this.refreshSoon()));
		// the cursor moves in the editor of any window, a popout's included
		forEachWindow(this, this.app, (doc) => this.registerDomEvent(doc, "selectionchange", () => this.refreshSoon()));
		this.register(() => {
			if (this.timer !== null) window.clearTimeout(this.timer);
		});
		this.refresh();
		return Promise.resolve();
	}

	override onClose(): Promise<void> {
		this.contentEl.empty();
		return Promise.resolve();
	}

	// ---------------------------------------------------------------- what the panel is looking at

	/**
	 * The Markdown view the panel writes to, found in the workspace each time (the panel keeps no view of its own, so one restored from
	 * the saved layout, or left over from a pane that has been closed, never holds on to anything Obsidian has let go).
	 */
	private live(): MarkdownView | null {
		return this.side.markdownView();
	}

	private refreshSoon(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.refresh();
		}, 200);
	}

	/** Draws what has changed since the last time; a control that had the keyboard keeps it. */
	refresh(): void {
		const had = activeDocument.activeElement;
		const key = had instanceof HTMLElement && this.contentEl.contains(had) ? had.getAttribute("data-key") : null;
		this.draw();
		if (key) this.contentEl.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
	}

	private draw(): void {
		const view = this.live();
		const ed = view?.editor;
		const doc = ed?.getValue() ?? "";

		if (!view || !ed) {
			const src = this.side.bookletOpen();
			this.holds.setText(src ? "A booklet is open as a reading page. Its Markdown is where blocks are placed." : "Open a booklet note in the editor to place blocks.");
			this.about.empty();
			if (src) {
				const b = this.about.createEl("button", { text: "Open this note's Markdown", attr: { "aria-label": "Open this note's Markdown beside the page, to place blocks in it" } });
				b.addEventListener("click", () => void this.side.openMarkdownOf(src));
			}
			this.frontAvailable(true);
			for (const s of [this.line, this.options, this.fields, this.tree, this.problems]) s.show(false);
			return;
		}
		this.about.empty();
		this.about.setText(`Note: ${view.file?.basename ?? ""}`);

		// the note is read once for this refresh: the reader's reading and the scan, and all that is drawn comes from them
		const a = analyse(doc);
		const cursor = ed.getCursor();
		const m = panelModel(a, cursor.line);
		this.frontAvailable(!a.scan.hasFrontMatter);
		if (!m.booklet) {
			this.holds.setText("This note is not a booklet: it has no `booklet:` line in its properties. The front matter block under Structure makes a note with no properties one.");
			for (const s of [this.line, this.options, this.fields, this.tree, this.problems]) s.show(false);
			return;
		}
		this.holds.setText(m.holds);

		const text = a.text.split("\n")[cursor.line] ?? "";

		// This line
		this.line.show(true);
		this.line.update(`${cursor.line}\u0000${m.line.held ?? ""}\u0000${text}`, (b) => this.drawSettings(b, m.line, cursor.line, text));

		// Options
		this.options.show(!!m.options);
		this.options.update(JSON.stringify(m.options), (b) => (m.options ? this.drawOptions(b, m.options, cursor.line) : undefined));

		// Data fields
		this.fields.show(!!m.block);
		this.fields.update(JSON.stringify(m.block), (b) => (m.block ? this.drawFields(b, m.block, cursor.line) : undefined));

		// Outline and problems
		this.tree.show(true);
		this.tree.update(m.outline.map((f) => `${f.depth}|${f.node.line}|${nodeText(f.node)}`).join("\n"), (b) => this.drawOutline(b, m.outline));
		this.problems.show(true);
		this.problems.update(
			JSON.stringify(m.problems),
			(b) => this.drawProblems(b, m.problems),
			m.problems.length ? `Problems (${m.problems.length})` : "Problems",
		);
	}

	/** The front matter block goes at the top of a note that has no properties: with properties it stays in the palette, unavailable, and says why. */
	private frontAvailable(on: boolean): void {
		const b = this.frontButton;
		if (!b) return;
		b.toggleClass("is-disabled", !on);
		if (on) b.removeAttribute("aria-disabled");
		else b.setAttribute("aria-disabled", "true");
		b.title = on ? "" : HAS_FRONT;
		b.setAttribute("aria-label", on ? "Add Front matter (structure)" : `Add Front matter (structure). Not available: ${HAS_FRONT}`);
		this.frontWhy?.toggleClass("booklet-blocks-hidden", on);
	}

	// ---------------------------------------------------------------- add a block

	private drawPalette(): void {
		const b = this.add.body;
		b.empty();
		b.createEl("p", { cls: "booklet-blocks-hint", text: Platform.isMobile ? "Tap a block to put it at the cursor." : "Click a block to put it at the cursor, or drag it onto the note." });
		for (const g of PIECE_GROUPS) {
			const group = b.createDiv({ cls: "booklet-blocks-group", attr: { role: "group", "aria-label": g.title } });
			group.createDiv({ cls: "booklet-blocks-group-title", text: g.title });
			const row = group.createDiv({ cls: "booklet-blocks-pieces" });
			for (const p of piecesOf(g.id)) {
				const btn = this.drawPiece(row, p, g.title);
				if (p.front) {
					this.frontButton = btn;
					this.frontWhy = group.createDiv({ cls: "booklet-blocks-hint booklet-blocks-hidden", text: HAS_FRONT });
				}
			}
		}
	}

	private drawPiece(into: HTMLElement, p: Piece, groupTitle: string): HTMLButtonElement {
		const b = into.createEl("button", { cls: "booklet-blocks-piece", text: p.label, attr: { type: "button", "aria-label": `Add ${p.label} (${groupTitle.toLowerCase()})` } });
		b.addEventListener("click", () => this.place(p));
		if (Platform.isMobile) return b;
		b.draggable = true;
		b.addEventListener("dragstart", (e) => {
			if (!e.dataTransfer) return;
			e.dataTransfer.setData(PIECE_MIME, p.file);
			e.dataTransfer.effectAllowed = "copy";
		});
		return b;
	}

	private place(p: Piece): void {
		const view = this.live();
		const ed = view?.editor;
		if (!view || !ed) {
			new Notice("Open a booklet note in the editor first.");
			return;
		}
		void placePiece(this.app, ed, p, null).then((plan) => {
			if (!plan) return;
			this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
			ed.focus();
			if (Platform.isMobile) this.app.workspace.rightSplit.collapse();
			this.refreshSoon();
		});
	}

	// ---------------------------------------------------------------- the line under the cursor

	private drawSettings(b: HTMLElement, v: LineView, line: number, text: string): void {
		const m: SettingsModel | null = v.model;
		if (v.held) {
			b.createEl("p", { cls: "booklet-blocks-hint", text: v.why });
			return;
		}
		if (!m) {
			b.createEl("p", { cls: "booklet-blocks-hint", text: "Put the cursor on a Booklet line (one that starts `> [!`) to change its settings." });
			return;
		}
		b.createEl("p", { cls: "booklet-blocks-kind", text: `A ${m.kind} line, line ${line + 1}` });
		if (!m.known) b.createEl("p", { cls: "booklet-blocks-hint", text: "The linter does not know this kind, so there is nothing to set." });
		if (m.takesId) this.textRow(b, "Id", m.id ?? "", `id-${line}`, (val) => this.edit(line, text, (doc) => renameId(doc, line, val.trim())));
		for (const f of m.flags) this.switchRow(b, f.name, f.on, `flag-${f.name}`, (on) => this.edit(line, text, (doc) => changeLine(doc, line, (p) => setFlag(p, f.name, on))));
		for (const k of m.values) {
			if (k.name === "icon") this.iconRow(b, k.value, line, text);
			else this.textRow(b, k.name, k.value, `field-${k.name}`, (val) => this.edit(line, text, (doc) => changeLine(doc, line, (p) => setValue(p, k.name, val.trim()))), /^(min|max|step)$/.test(k.name));
		}
		if (m.stray.length) {
			b.createEl("p", { cls: "booklet-blocks-hint", text: "Words this kind does not take:" });
			for (const s of m.stray) {
				const row = b.createDiv({ cls: "booklet-blocks-row" });
				row.createEl("code", { text: s.text });
				const rm = row.createEl("button", { text: "Remove", attr: { type: "button", "aria-label": `Remove the word ${s.text} from this line`, "data-key": `stray-${s.index}` } });
				rm.addEventListener("click", () => this.edit(line, text, (doc) => changeLine(doc, line, (p) => removeWord(p, s.index))));
			}
		}
		if (!m.any) b.createEl("p", { cls: "booklet-blocks-hint", text: `A ${m.kind} line has no id, switches or fields.` });
	}

	private textRow(into: HTMLElement, name: string, value: string, key: string, commit: (v: string) => void, numeric = false): void {
		const row = into.createDiv({ cls: "booklet-blocks-row" });
		const id = `booklet-blocks-${++uid}`;
		row.createEl("label", { text: name, attr: { for: id } });
		const input = row.createEl("input", { type: "text", attr: { id, "data-key": key } });
		input.value = value;
		if (numeric) input.inputMode = "decimal";
		input.addEventListener("change", () => commit(input.value));
	}

	private switchRow(into: HTMLElement, name: string, on: boolean, key: string, commit: (on: boolean) => void): void {
		const row = into.createDiv({ cls: "booklet-blocks-row" });
		const id = `booklet-blocks-${++uid}`;
		const box = row.createEl("input", { type: "checkbox", attr: { id, "data-key": key } });
		box.checked = on;
		row.createEl("label", { text: name, attr: { for: id } });
		box.addEventListener("change", () => commit(box.checked));
	}

	private iconRow(into: HTMLElement, value: string, line: number, text: string): void {
		const row = into.createDiv({ cls: "booklet-blocks-row" });
		const id = `booklet-blocks-${++uid}`;
		row.createEl("label", { text: "Icon", attr: { for: id } });
		const input = row.createEl("input", { type: "text", attr: { id, "data-key": "field-icon" } });
		input.value = value;
		input.addEventListener("change", () => this.edit(line, text, (doc) => changeLine(doc, line, (p) => setValue(p, "icon", input.value.trim()))));
		const pick = row.createEl("button", { text: "Choose", attr: { type: "button", "aria-label": "Choose an icon from the list", "data-key": "pick-icon" } });
		pick.addEventListener("click", () => {
			void pickIcon(this.app, value).then((icon) => {
				if (icon !== null) this.edit(line, text, (doc) => changeLine(doc, line, (p) => setValue(p, "icon", icon)));
			});
		});
	}

	/** Change the line the panel drew its controls from: only if the note still has that line there. */
	private edit(line: number, shown: string, make: (doc: string) => { text: string } | { error: string }): void {
		const ed = this.live()?.editor;
		if (!ed) return;
		const before = ed.getValue();
		if (before.split("\n")[line] !== shown) {
			new Notice("The note changed under the panel. Try again.");
			this.line.forget();
			this.refresh();
			return;
		}
		const r = make(before);
		if ("error" in r) {
			new Notice(r.error);
			this.line.forget();
			this.refresh();
			return;
		}
		void this.write(ed, before, r.text).then((done) => {
			if (!done) this.line.forget();
			this.refresh();
		});
	}

	// ---------------------------------------------------------------- the options of a choice, multi or scale

	private drawOptions(b: HTMLElement, list: OptionList, cursor: number): void {
		b.createEl("p", { cls: "booklet-blocks-kind", text: `Options of ${list.kind} ${list.id ?? ""}`.trim() });
		b.createEl("p", { cls: "booklet-blocks-hint", text: "Kept answers are stored by position. Removing or renaming an option can detach the answers that chose it." });
		const what = list.kind === "scale" ? "Anchor" : "Option";
		for (const item of list.items) {
			const row = b.createDiv({ cls: "booklet-blocks-row" });
			const id = `booklet-blocks-${++uid}`;
			row.createEl("label", { text: `${what} ${item.position}`, attr: { for: id } });
			const input = row.createEl("input", { type: "text", attr: { id, "data-key": `opt-${item.line}` } });
			input.value = item.text;
			input.addEventListener("change", () => this.editNote(this.options, (doc) => renameOption(doc, cursor, item.line, input.value)));
			const rm = row.createEl("button", { text: "Remove", attr: { type: "button", "aria-label": `Remove ${what.toLowerCase()} ${item.position}, ${item.text}`, "data-key": `orm-${item.line}` } });
			rm.addEventListener("click", () => this.editNote(this.options, (doc) => removeOption(doc, cursor, item.line)));
		}
	}

	// ---------------------------------------------------------------- the declared fields of a data block

	private drawFields(b: HTMLElement, block: FieldBlock, cursor: number): void {
		b.createEl("p", { cls: "booklet-blocks-kind", text: block.id ? `Fields of the data block ${block.id}` : "Fields of this data block" });
		b.createEl("p", { cls: "booklet-blocks-hint", text: "Changing a field here changes its declaration only. The rows keep what they hold." });
		for (const key of block.keys) {
			const used = block.used[key] ?? 0;
			const row = b.createDiv({ cls: "booklet-blocks-row" });
			const id = `booklet-blocks-${++uid}`;
			row.createEl("label", { text: "Field", attr: { for: id } });
			const input = row.createEl("input", { type: "text", attr: { id, "data-key": `fkey-${key}` } });
			input.value = key;
			input.addEventListener("change", () => this.editNote(this.fields, (doc) => renameField(doc, cursor, key, input.value.trim())));
			row.createSpan({ cls: "booklet-blocks-count", text: used === 1 ? "1 row" : `${used} rows` });
			const rm = row.createEl("button", { text: "Remove", attr: { type: "button", "aria-label": `Remove the field ${key} from the declaration (${used} ${used === 1 ? "row holds" : "rows hold"} it)`, "data-key": `frm-${key}` } });
			rm.addEventListener("click", () => this.editNote(this.fields, (doc) => removeField(doc, cursor, key)));
		}
	}

	/** A change to the note that is not one line: made from the note as it is now, asked about first if it detaches data. */
	private editNote(section: Section, make: (doc: string) => { text: string } | { error: string }): void {
		const ed = this.live()?.editor;
		if (!ed) return;
		const before = ed.getValue();
		const r = make(before);
		if ("error" in r) {
			new Notice(r.error);
			section.forget();
			this.refresh();
			return;
		}
		void this.write(ed, before, r.text).then((done) => {
			if (!done) section.forget();
			this.line.forget();
			this.refresh();
		});
	}

	// ---------------------------------------------------------------- the one way the panel writes

	/** Make the note `after` (editor-write.ts: only the bytes that differ, and the question first when it would detach kept data). */
	private write(ed: Editor, before: string, after: string): Promise<boolean> {
		return writeNote(this.app, ed, before, after);
	}

	// ---------------------------------------------------------------- outline and problems

	private jump(line: number): void {
		const view = this.live();
		const ed = view?.editor;
		if (!view || !ed) return;
		const pos = { line, ch: 0 };
		this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
		ed.setCursor(pos);
		ed.scrollIntoView({ from: pos, to: pos }, true);
		ed.focus();
		if (Platform.isMobile) this.app.workspace.rightSplit.collapse();
	}

	private drawOutline(b: HTMLElement, flat: { node: OutlineNode; depth: number }[]): void {
		if (!flat.length) {
			b.createEl("p", { cls: "booklet-blocks-hint", text: "Nothing to list yet." });
			return;
		}
		const list = b.createEl("ul", { cls: "booklet-blocks-list", attr: { "aria-label": "Outline of the booklet" } });
		for (const { node, depth } of flat) {
			const li = list.createEl("li", { cls: `booklet-blocks-depth-${Math.min(depth, 6)}` });
			const label = nodeText(node);
			const btn = li.createEl("button", { text: label, cls: `booklet-blocks-jump booklet-blocks-type-${node.type}`, attr: { type: "button", "aria-label": `${label}, line ${node.line + 1}. Go to it.` } });
			btn.addEventListener("click", () => this.jump(node.line));
		}
	}

	private drawProblems(b: HTMLElement, problems: Problem[]): void {
		if (!problems.length) {
			b.createEl("p", { cls: "booklet-blocks-hint", text: "No problems found." });
			return;
		}
		const list = b.createEl("ul", { cls: "booklet-blocks-list", attr: { "aria-label": "Problems in the booklet" } });
		for (const p of problems) {
			const li = list.createEl("li", { cls: `booklet-blocks-problem booklet-blocks-${p.kind}` });
			const where = p.line === null ? "The whole note" : `Line ${p.line + 1}`;
			const words = `${where}: ${p.why}`;
			if (p.line === null) {
				li.createSpan({ text: words });
				continue;
			}
			const line = p.line;
			const btn = li.createEl("button", { cls: "booklet-blocks-jump", attr: { type: "button", "aria-label": `${words}. Go to the line.` } });
			btn.createSpan({ cls: "booklet-blocks-problem-why", text: words });
			if (p.text) btn.createEl("code", { cls: "booklet-blocks-problem-line", text: p.text });
			btn.addEventListener("click", () => this.jump(line));
		}
	}
}

/** The words for an outline node: what it is, its id, its title. */
function nodeText(n: OutlineNode): string {
	const what = n.type === "question" ? (n.kind ?? "question") : n.type === "group" ? "group" : n.type;
	const id = n.id ? ` ${n.id}` : "";
	const label = n.label ? `: ${n.label}` : "";
	return `${what}${id}${label}`;
}
