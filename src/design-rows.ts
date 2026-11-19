/*
 * The rows of the Design view's editor in place: the part of the box that shows a choice or a multi's options, a shared menu's items, or a
 * matrix's items and anchors as one row each. There is no draft: the rows are drawn from the note's own lines, and every change is made on
 * the note's lines as they are when it is made (core `editRows`, design-options.ts) and handed to the box, which writes it as one step
 * (`act` for a press, `field` for words typed in a row). Nothing here writes, and nothing holds a copy of the text.
 *
 * Rows are offered only for a block they can show without changing a byte of what is written (core `readRows`); any other block shows
 * the reason, and the Markdown below it is how it is edited.
 *
 * Words typed in a row are applied when the row is left or Enter is pressed (never at each key). A change that adds, removes or moves a
 * row draws the rows again, with the focus on the control the person was on, or on the one a move, an add or a remove leads to; a change
 * that only changes words or a switch is put into the rows that are there (`sync`), so no control is taken away from a press under way.
 */
import { Setting } from "obsidian";
import {
	chooseMenu,
	editRows,
	isChoiceRows,
	menuUsers,
	menusVisibleTo,
	readRows,
	rowsKindOf,
	type ChoiceRows,
	type DesignKind,
	type MatrixRows,
	type MenuRef,
	type MenuRows,
	type Rows,
	type RowsEdit,
} from "./core";
import type { DesignKey } from "./core";
import { drawIcon } from "./design-picture";
import { ui } from "./design-text";
import { quietNames } from "./design-words";

/** The words of a row's three buttons, by the kind of row (each key is written out, so a search for it finds where it is asked for). */
const WORDS: Record<"option" | "item" | "anchor", { up: DesignKey; down: DesignKey; remove: DesignKey }> = {
	option: { up: "rows.option.up", down: "rows.option.down", remove: "rows.option.remove" },
	item: { up: "rows.item.up", down: "rows.item.down", remove: "rows.item.remove" },
	anchor: { up: "rows.anchor.up", down: "rows.anchor.down", remove: "rows.anchor.remove" },
};

/** What a change comes to: the block's new lines (with what to do once they are written), or why it is not made. `keep`: it was typed text, which stays where it is. */
export type Made = { ok: true; lines: string[]; landed?: () => void } | { ok: false; reason: string; keep?: boolean };

/** What the rows ask of the box that holds them. */
export interface RowsIO {
	/** The note as the view has it now (the shared menus a question can name are found in it). */
	note(): string;
	/** The line the block starts on in the note, or null when it is not there. */
	start(): number | null;
	/** The block's own lines in the note now. */
	lines(): string[];
	/**
	 * A control of words, applied when it is left or Enter is pressed. `make` makes the block's new lines from what was typed, the block's
	 * lines now and what the control showed when the note last matched it; `back` gives what the note has for the control, to put back.
	 */
	field(el: HTMLInputElement, make: (value: string, lines: string[], was: string) => Made, back: (lines: string[]) => string | null): void;
	/** A control pressed: one change, made on the block's lines as they are when it runs. `focus` is the control the focus goes to when the rows are drawn again. */
	act(make: (lines: string[]) => Made, focus: string | null): void;
	/** The options put away when a shared menu was chosen, and the setter. */
	stash(): string[] | null;
	setStash(lines: string[] | null): void;
	/** Selects and opens the menu block that starts on this line. */
	openMenu(line: number): void;
}

/** What the rows part shows: nothing (the block is not such a block), the reason it has no rows, or the rows. */
export type RowsState = "none" | "refused" | "rows";

/** The words and marks of a block's rows by the `data-key` of the control that shows them: what `sync` puts into the rows that are there. */
function shownOf(rows: Rows): { text: Map<string, string>; on: Map<string, boolean> } {
	const text = new Map<string, string>();
	const on = new Map<string, boolean>();
	if (isChoiceRows(rows)) {
		text.set("menu", rows.menu ?? "");
		rows.options.forEach((o, i) => {
			text.set(`o${i}-text`, o.text);
			on.set(`o${i}-correct`, o.mark !== " ");
			o.replies.forEach((r, j) => text.set(`o${i}-r${j}-text`, r.text));
		});
	} else if (rows.kind === "menu") rows.items.forEach((it, i) => text.set(`i${i}-text`, it.text));
	else {
		if (rows.kind === "matrix") rows.items.forEach((it, i) => text.set(`i${i}-text`, it.text));
		rows.anchors.forEach((a, i) => {
			text.set(`a${i}-number`, a.number);
			text.set(`a${i}-text`, a.text);
		});
	}
	return { text, on };
}

/** The shape of a block's rows: what must be drawn again when it changes (the words and the marks are not part of it). */
function shapeOf(lines: readonly string[]): string {
	const kind = rowsKindOf(lines);
	if (!kind) return "none";
	const rows = readRows(lines, kind);
	if ("refused" in rows) return `refused:${rows.refused}`;
	if (isChoiceRows(rows)) return rows.menu ? `${rows.kind}:menu:${rows.menu}` : `${rows.kind}:${rows.options.map((o) => o.replies.length).join(",")}`;
	if (rows.kind === "menu") return `menu:${rows.items.length}`;
	if (rows.kind === "scale") return `scale:${rows.anchors.length}`;
	return `matrix:${rows.items.length}:${rows.anchors.length}`;
}

export class RowsPanel {
	private rows: Rows | null = null;
	/** The shape the rows on the screen were drawn for. */
	private shape = "";

	constructor(
		private readonly host: HTMLElement,
		private readonly io: RowsIO,
		private readonly nodeKind: () => DesignKind,
	) {}

	/** Does the block's rows part show something different from what these lines make (it must be drawn again)? */
	differs(lines: readonly string[]): boolean {
		return this.shapeNow(lines) !== this.shape;
	}

	private shapeNow(lines: readonly string[]): string {
		const holds = this.nodeKind() === "question" || this.nodeKind() === "menu";
		return holds ? shapeOf(lines) : "none";
	}

	/** Draws the rows of these lines (the note's) in place of what was drawn, and says what it drew. `wanted`: the control the focus goes to after. */
	draw(lines: readonly string[], wanted: string | null = null): RowsState {
		const doc = this.host.ownerDocument;
		const active = doc.activeElement;
		const key = wanted ?? (active && this.host.contains(active) ? (active.closest("[data-key]")?.getAttribute("data-key") ?? null) : null);
		this.host.empty();
		this.rows = null;
		this.shape = this.shapeNow(lines);
		const kind = rowsKindOf(lines);
		const holds = this.nodeKind() === "question" || this.nodeKind() === "menu";
		this.host.toggleClass("is-empty", true);
		if (!kind || !holds) return "none";
		this.host.toggleClass("is-empty", false);
		const heading = kind === "menu" || kind === "matrix" ? "rows.items" : kind === "scale" ? "rows.anchors" : "rows.options";
		new Setting(this.host).setName(ui(heading)).setHeading();
		const rows = readRows(lines, kind);
		if ("refused" in rows) {
			this.host.createDiv({ cls: "booklet-design-rows-refused", text: ui("rows.refused", { reason: rows.refused }) });
			return "refused";
		}
		this.rows = rows;
		if (isChoiceRows(rows)) this.drawChoice(rows);
		else if (rows.kind === "menu") this.drawMenu(rows);
		else if (rows.kind === "scale") this.anchors(rows.anchors);
		else this.drawMatrix(rows);
		// a row that merely has a name is named without the tooltip an aria-label would raise, as the rest of the page is
		quietNames(this.host);
		if (key) this.host.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
		return "rows";
	}

	/**
	 * Puts the marks of these lines (the correct switches, the shared-menu picker) into the rows that are drawn (the shape has not changed).
	 * The WORDS of the rows are not put in here: they are controls of the box's `Field`s, which remember what they were last given (`sent`),
	 * and only the box may set one (it sets the value and `sent` together, and leaves a control with typing in it alone). A value set here
	 * would leave `sent` behind, and the box would think the row was still being typed in (found in the real app: rows stale after a move).
	 */
	sync(lines: readonly string[]): void {
		const kind = rowsKindOf(lines);
		if (!kind) return;
		const rows = readRows(lines, kind);
		if ("refused" in rows) return;
		this.rows = rows;
		const shown = shownOf(rows);
		for (const el of Array.from(this.host.querySelectorAll<HTMLElement>("[data-key]"))) {
			const key = el.getAttribute("data-key") ?? "";
			const text = shown.text.get(key);
			const field = el as HTMLSelectElement;
			if (text !== undefined && el.tagName === "SELECT" && field.value !== text) field.value = text;
			const mark = shown.on.get(key);
			if (mark !== undefined) el.setAttribute("aria-checked", String(mark));
		}
	}

	// ---------------------------------------------------------------- one change

	/** The rows of these lines, when they are the rows that are drawn (else null: the note is not what the rows show). */
	private current(lines: readonly string[]): Rows | null {
		const kind = rowsKindOf(lines);
		if (!kind || shapeOf(lines) !== this.shape) return null;
		const rows = readRows(lines, kind);
		return "refused" in rows ? null : rows;
	}

	private made(lines: readonly string[], build: (rows: Rows) => RowsEdit | null, typed: boolean): Made {
		const rows = this.current(lines);
		if (!rows) return { ok: false, reason: ui("edit.changed"), keep: typed };
		const edit = build(rows);
		if (!edit) return { ok: false, reason: ui("edit.changed"), keep: typed };
		const made = editRows(rows, edit);
		return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
	}

	/** Makes one edit of the rows when a control is pressed. `focus` is the control that has the focus after (when the rows are drawn again). */
	private edit(build: (rows: Rows) => RowsEdit | null, focus: string | null): void {
		this.io.act((lines) => this.made(lines, build, false), focus);
	}

	// ---------------------------------------------------------------- the parts every list has

	/** A row's words: applied when the row is left or Enter is pressed, as one change (`edit` says which, from what was typed). */
	private textInput(parent: HTMLElement, key: string, label: string, value: string, edit: (v: string) => RowsEdit): HTMLInputElement {
		const el = parent.createEl("input", { cls: "booklet-design-rows-input", attr: { type: "text", "aria-label": label, "data-key": key, spellcheck: "false", autocomplete: "off" } });
		el.value = value;
		this.io.field(
			el,
			(v, lines, was) => {
				// the rows on the screen are the note's, and this row still has the words it had: else it is not known which row this typing was for
				const rows = this.current(lines);
				if (!rows || shownOf(rows).text.get(key) !== was) return { ok: false, reason: ui("edit.changed"), keep: true };
				return this.made(lines, () => edit(v), true);
			},
			(lines) => {
				const rows = this.current(lines);
				return rows ? (shownOf(rows).text.get(key) ?? null) : null;
			},
		);
		return el;
	}

	/** A button of a row: its words, or (when `icons` names some Obsidian has) a small picture that its `label` names. */
	private button(parent: HTMLElement, key: string, text: string, label: string, onClick: () => void, disabled = false, icons: readonly string[] = []): HTMLButtonElement {
		const b = parent.createEl("button", { cls: "booklet-design-rows-button", attr: { type: "button", "aria-label": label, "data-key": key } });
		if (!icons.length || !drawIcon(b, icons)) b.setText(text);
		else b.addClass("is-icon");
		b.disabled = disabled;
		b.addEventListener("click", onClick);
		return b;
	}

	/** Move up, Move down and Remove for the row `i` of `count`; the focus follows the row, or goes to the next one a removal leaves. */
	private controls(parent: HTMLElement, prefix: "o" | "i" | "a", i: number, count: number, name: "option" | "item" | "anchor", edit: (what: "move" | "remove", by?: -1 | 1) => void): void {
		const n = i + 1;
		const up = this.button(parent, `${prefix}${i}-up`, ui("rows.up"), ui(WORDS[name].up, { n }), () => edit("move", -1), i === 0, ["arrow-up", "chevron-up"]);
		const down = this.button(parent, `${prefix}${i}-down`, ui("rows.down"), ui(WORDS[name].down, { n }), () => edit("move", 1), i === count - 1, ["arrow-down", "chevron-down"]);
		this.button(parent, `${prefix}${i}-remove`, ui("rows.remove"), ui(WORDS[name].remove, { n }), () => edit("remove"), false, ["x", "trash-2"]);
		up.addClass("booklet-design-rows-move");
		down.addClass("booklet-design-rows-move");
	}

	/** The key of the control the focus goes to after a move: the same button at the row's new place, or its twin when that one is not there to press. */
	private movedKey(prefix: string, i: number, by: -1 | 1, count: number): string {
		const to = i + by;
		const same = by < 0 ? `${prefix}${to}-up` : `${prefix}${to}-down`;
		const stillThere = by < 0 ? to > 0 : to < count - 1;
		return stillThere ? same : by < 0 ? `${prefix}${to}-down` : `${prefix}${to}-up`;
	}

	/** The key of the text of the row a removal leaves where the removed one was, else of the row before it, else of the Add button. */
	private afterRemove(prefix: string, i: number, count: number, add: string): string {
		return count > 1 ? `${prefix}${i < count - 1 ? i : i - 1}-text` : add;
	}

	// ---------------------------------------------------------------- a choice or a multi

	private drawChoice(rows: ChoiceRows): void {
		const visible = menusVisibleTo(this.io.note(), this.io.start() ?? -1);
		// a question names a menu the way it is found: its own module's first, then a shared one
		const ref = rows.menu ? (visible.find((m) => m.id === rows.menu && m.module !== null) ?? visible.find((m) => m.id === rows.menu)) : undefined;
		this.menuPicker(rows, visible, ref);
		if (rows.menu) {
			const line = this.host.createDiv({ cls: "booklet-design-rows-usesmenu" });
			if (ref) {
				line.createSpan({ text: ui("rows.menu.uses", { id: rows.menu }) });
				this.button(line, "menu-open", ui("rows.menu.open"), ui("rows.menu.open.label", { id: rows.menu }), () => this.io.openMenu(ref.line));
			} else line.createSpan({ text: ui("rows.menu.lost", { id: rows.menu }) });
			return;
		}
		const list = this.host.createDiv({ cls: "booklet-design-rows-list" });
		const count = rows.options.length;
		if (!count) list.createDiv({ cls: "booklet-design-rows-none", text: ui("rows.none") });
		rows.options.forEach((o, i) => {
			const n = i + 1;
			const row = list.createDiv({ cls: "booklet-design-optrow", attr: { role: "group", "aria-label": ui("rows.option.group", { n }) } });
			const main = row.createDiv({ cls: "booklet-design-rows-main" });
			main.createSpan({ cls: "booklet-design-rows-num", text: String(n), attr: { "aria-hidden": "true" } });
			this.textInput(main, `o${i}-text`, ui("rows.option.text", { n }), o.text, (v) => ({ what: "option-text", index: i, text: v }));
			const ctl = row.createDiv({ cls: "booklet-design-rows-controls" });
			const sw = ctl.createEl("button", { text: ui("rows.option.correct"), cls: "booklet-design-rows-switch", attr: { type: "button", role: "switch", "aria-checked": o.mark === " " ? "false" : "true", "aria-label": ui("rows.option.correct.label", { n }), "data-key": `o${i}-correct` } });
			sw.addEventListener("click", () => this.edit((rows) => (isChoiceRows(rows) ? { what: "option-correct", index: i, on: rows.options[i]?.mark === " " } : null), `o${i}-correct`));
			this.controls(ctl, "o", i, count, "option", (what, by) => {
				if (what === "move" && by) this.edit(() => ({ what: "option-move", index: i, by }), this.movedKey("o", i, by, count));
				else this.edit(() => ({ what: "option-remove", index: i }), this.afterRemove("o", i, count, "o-add"));
			});
			const replies = row.createDiv({ cls: "booklet-design-rows-replies" });
			o.replies.forEach((r, j) => {
				const rr = replies.createDiv({ cls: "booklet-design-reply" });
				this.textInput(rr, `o${i}-r${j}-text`, ui("rows.reply.text", { n, m: j + 1 }), r.text, (v) => ({ what: "reply-text", index: i, reply: j, text: v }));
				this.button(
					rr,
					`o${i}-r${j}-remove`,
					ui("rows.remove"),
					ui("rows.reply.remove", { n, m: j + 1 }),
					() => this.edit(() => ({ what: "reply-remove", index: i, reply: j }), o.replies.length > 1 ? `o${i}-r${Math.min(j, o.replies.length - 2)}-text` : `o${i}-r-add`),
					false,
					["x", "trash-2"],
				);
			});
			this.button(replies, `o${i}-r-add`, ui("rows.reply.add"), ui("rows.reply.add.label", { n }), () => this.edit(() => ({ what: "reply-add", index: i }), `o${i}-r${o.replies.length}-text`));
		});
		this.button(this.host, "o-add", ui("rows.option.add"), ui("rows.option.add"), () => this.edit(() => ({ what: "option-add" }), `o${count}-text`));
	}

	/** The shared menu a question names: the menus it can see, and none. A menu it names that it cannot see is listed too, so the row says what the line says. */
	private menuPicker(rows: ChoiceRows, visible: MenuRef[], ref: MenuRef | undefined): void {
		const row = new Setting(this.host).setName(ui("rows.menu.name")).setDesc(ui("rows.menu.desc"));
		row.settingEl.setAttribute("data-field", "menu");
		row.addDropdown((c) => {
			c.addOption("", ui("rows.menu.none"));
			const seen = new Set<string>();
			for (const m of visible) {
				if (seen.has(m.id)) continue;
				seen.add(m.id);
				c.addOption(m.id, m.id);
			}
			if (rows.menu && !ref && !seen.has(rows.menu)) c.addOption(rows.menu, ui("rows.menu.missing", { id: rows.menu }));
			c.setValue(rows.menu ?? "");
			c.selectEl.setAttribute("data-key", "menu");
			c.onChange((v) =>
				this.io.act((lines) => {
					const made = chooseMenu(lines, v || null, this.io.stash());
					if (!made.ok) return { ok: false, reason: made.reason };
					return { ok: true, lines: made.lines, landed: () => this.io.setStash(made.stash) };
				}, "menu"),
			);
		});
	}

	// ---------------------------------------------------------------- a shared menu

	private drawMenu(rows: MenuRows): void {
		const start = this.io.start();
		const users = start === null ? [] : menuUsers(this.io.note(), start);
		this.host.createDiv({ cls: "booklet-design-rows-usedby", text: users.length ? ui("rows.menu.usedby", { ids: users.join(", ") }) : ui("rows.menu.unused") });
		this.items(rows.items);
	}

	/** The rows of a list of items (a menu's, a matrix's) with the Add button under them. */
	private items(items: { text: string }[]): void {
		const list = this.host.createDiv({ cls: "booklet-design-rows-list" });
		const count = items.length;
		if (!count) list.createDiv({ cls: "booklet-design-rows-none", text: ui("rows.none") });
		items.forEach((it, i) => {
			const n = i + 1;
			const row = list.createDiv({ cls: "booklet-design-optrow", attr: { role: "group", "aria-label": ui("rows.item.group", { n }) } });
			const main = row.createDiv({ cls: "booklet-design-rows-main" });
			main.createSpan({ cls: "booklet-design-rows-num", text: String(n), attr: { "aria-hidden": "true" } });
			this.textInput(main, `i${i}-text`, ui("rows.item.text", { n }), it.text, (v) => ({ what: "item-text", index: i, text: v }));
			const ctl = row.createDiv({ cls: "booklet-design-rows-controls" });
			this.controls(ctl, "i", i, count, "item", (what, by) => {
				if (what === "move" && by) this.edit(() => ({ what: "item-move", index: i, by }), this.movedKey("i", i, by, count));
				else this.edit(() => ({ what: "item-remove", index: i }), this.afterRemove("i", i, count, "i-add"));
			});
		});
		this.button(this.host, "i-add", ui("rows.item.add"), ui("rows.item.add"), () => this.edit(() => ({ what: "item-add" }), `i${count}-text`));
	}

	// ---------------------------------------------------------------- a matrix

	private drawMatrix(rows: MatrixRows): void {
		this.items(rows.items);
		new Setting(this.host).setName(ui("rows.anchors")).setHeading();
		this.anchors(rows.anchors);
	}

	/** The rows of a list of anchors (a scale's, a matrix's): the number that is kept, the words, move, remove, and the Add button under them. */
	private anchors(anchors: { number: string; text: string }[]): void {
		const list = this.host.createDiv({ cls: "booklet-design-rows-list" });
		const count = anchors.length;
		if (!count) list.createDiv({ cls: "booklet-design-rows-none", text: ui("rows.none") });
		anchors.forEach((a, i) => {
			const n = i + 1;
			const row = list.createDiv({ cls: "booklet-design-optrow", attr: { role: "group", "aria-label": ui("rows.anchor.group", { n }) } });
			const main = row.createDiv({ cls: "booklet-design-rows-main" });
			const num = main.createEl("input", { cls: ["booklet-design-rows-input", "booklet-design-rows-number"], attr: { type: "text", inputmode: "numeric", "aria-label": ui("rows.anchor.number", { n }), "data-key": `a${i}-number`, autocomplete: "off" } });
			num.value = a.number;
			// a number is the answer that is kept: it is taken when the box is left or Enter is pressed, as every row's words are
			this.io.field(
				num,
				(v, lines, was) => {
					const rows = this.current(lines);
					if (!rows || shownOf(rows).text.get(`a${i}-number`) !== was) return { ok: false, reason: ui("edit.changed"), keep: true };
					return this.made(lines, () => ({ what: "anchor-number", index: i, number: v.trim() }), true);
				},
				(lines) => {
					const rows = this.current(lines);
					return rows ? (shownOf(rows).text.get(`a${i}-number`) ?? null) : null;
				},
			);
			this.textInput(main, `a${i}-text`, ui("rows.anchor.text", { n }), a.text, (v) => ({ what: "anchor-text", index: i, text: v }));
			const ctl = row.createDiv({ cls: "booklet-design-rows-controls" });
			this.controls(ctl, "a", i, count, "anchor", (what, by) => {
				if (what === "move" && by) this.edit(() => ({ what: "anchor-move", index: i, by }), this.movedKey("a", i, by, count));
				else this.edit(() => ({ what: "anchor-remove", index: i }), this.afterRemove("a", i, count, "a-add"));
			});
		});
		this.button(this.host, "a-add", ui("rows.anchor.add"), ui("rows.anchor.add"), () => this.edit(() => ({ what: "anchor-add" }), `a${count}-text`));
	}
}
