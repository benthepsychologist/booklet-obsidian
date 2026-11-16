/*
 * The rows of the Design view's editor in place: the part of the box that shows a choice or a multi's options, a shared menu's items, or a
 * matrix's items and anchors as one row each. Like the settings above it, it works on the one DRAFT the box holds and never on the note:
 * a row's change is made by core (`editRows`, design-options.ts) on the rows read from the draft, the draft is the lines they write, and
 * nothing is written until Save, which is the view's (one `changeLines`, counted and asked about like any change).
 *
 * Rows are offered only for a block they can show without changing a byte of what is written (core `readRows`); any other block shows
 * the reason, and the Markdown below it is how it is edited. A change in the Markdown reads the rows again.
 *
 * Words typed in a row reach the draft at each key (so the preview follows the typing), and the rows are not drawn again for that, so the
 * caret stays where it is. Every other change (a switch, a button, a number, a menu) draws the rows again, and the focus goes to the
 * control the person was on, or to the one a move, an add or a remove leads to.
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
import { ui } from "./design-text";
import { quietNames } from "./design-words";

/** The words of a row's three buttons, by the kind of row (each key is written out, so a search for it finds where it is asked for). */
const WORDS: Record<"option" | "item" | "anchor", { up: DesignKey; down: DesignKey; remove: DesignKey }> = {
	option: { up: "rows.option.up", down: "rows.option.down", remove: "rows.option.remove" },
	item: { up: "rows.item.up", down: "rows.item.down", remove: "rows.item.remove" },
	anchor: { up: "rows.anchor.up", down: "rows.anchor.down", remove: "rows.anchor.remove" },
};

/** What the rows ask of the box that holds them. */
export interface RowsIO {
	/** The note as the view has it now (the shared menus a question can name are found in it). */
	note(): string;
	/** The line the block starts on in the note, or null when it is not there. */
	start(): number | null;
	/** The draft's lines now. */
	lines(): string[];
	/** The draft is now these lines. `quiet`: the rows are in step already and are not drawn again. */
	put(lines: string[], quiet: boolean): void;
	/** Says why a change was not made, and changes nothing. */
	refuse(reason: string, redraw: boolean): void;
	/** The options put away when a shared menu was chosen, and the setter. */
	stash(): string[] | null;
	setStash(lines: string[] | null): void;
	/** Selects and opens the menu block that starts on this line. */
	openMenu(line: number): void;
	/** A typed value that is taken when its control is left: the box runs `commit` first when it is asked to read the draft, and forgets it after `commit` runs. */
	commitOnLeave(input: HTMLInputElement, commit: () => void): void;
}

/** What the rows part shows: nothing (the draft is not such a block), the reason it has no rows, or the rows. */
export type RowsState = "none" | "refused" | "rows";

export class RowsPanel {
	private rows: Rows | null = null;
	private wanted: string | null = null;

	constructor(
		private readonly host: HTMLElement,
		private readonly io: RowsIO,
		private readonly nodeKind: () => DesignKind,
	) {}

	/** Draws the rows of these lines (the draft's) in place of what was drawn, and says what it drew. */
	draw(lines: readonly string[]): RowsState {
		const doc = this.host.ownerDocument;
		const active = doc.activeElement;
		const key = this.wanted ?? (active && this.host.contains(active) ? (active.closest("[data-key]")?.getAttribute("data-key") ?? null) : null);
		this.wanted = null;
		this.host.empty();
		this.rows = null;
		const kind = rowsKindOf(lines);
		const holds = this.nodeKind() === "question" || this.nodeKind() === "menu";
		this.host.toggleClass("is-empty", true);
		if (!kind || !holds) return "none";
		this.host.toggleClass("is-empty", false);
		const heading = kind === "menu" || kind === "matrix" ? "rows.items" : "rows.options";
		new Setting(this.host).setName(ui(heading)).setHeading();
		const rows = readRows(lines, kind);
		if ("refused" in rows) {
			this.host.createDiv({ cls: "booklet-design-rows-refused", text: ui("rows.refused", { reason: rows.refused }) });
			return "refused";
		}
		this.rows = rows;
		if (isChoiceRows(rows)) this.drawChoice(rows);
		else if (rows.kind === "menu") this.drawMenu(rows);
		else this.drawMatrix(rows);
		// a row that merely has a name is named without the tooltip an aria-label would raise, as the rest of the page is
		quietNames(this.host);
		if (key) this.host.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
		return "rows";
	}

	// ---------------------------------------------------------------- one change

	/** Makes one edit of the rows: the draft takes the lines they write. `focus` is the control that has the focus after (when the rows are drawn again). */
	private edit(edit: RowsEdit, focus: string | null, quiet = false, input?: HTMLInputElement): void {
		if (!this.rows) return;
		const made = editRows(this.rows, edit);
		if (!made.ok) {
			input?.setAttribute("aria-invalid", "true");
			this.io.refuse(made.reason, !quiet);
			return;
		}
		input?.removeAttribute("aria-invalid");
		this.rows = made.rows;
		if (!quiet) this.wanted = focus;
		this.io.put(made.lines, quiet);
	}

	// ---------------------------------------------------------------- the parts every list has

	private textInput(parent: HTMLElement, key: string, label: string, value: string, onInput: (v: string, el: HTMLInputElement) => void): HTMLInputElement {
		const el = parent.createEl("input", { cls: "booklet-design-rows-input", attr: { type: "text", "aria-label": label, "data-key": key, spellcheck: "false", autocomplete: "off" } });
		el.value = value;
		el.addEventListener("input", () => onInput(el.value, el));
		return el;
	}

	private button(parent: HTMLElement, key: string, text: string, label: string, onClick: () => void, disabled = false): HTMLButtonElement {
		const b = parent.createEl("button", { text, cls: "booklet-design-rows-button", attr: { type: "button", "aria-label": label, "data-key": key } });
		b.disabled = disabled;
		b.addEventListener("click", onClick);
		return b;
	}

	/** Move up, Move down and Remove for the row `i` of `count`; the focus follows the row, or goes to the next one a removal leaves. */
	private controls(parent: HTMLElement, prefix: "o" | "i" | "a", i: number, count: number, name: "option" | "item" | "anchor", edit: (what: "move" | "remove", by?: -1 | 1) => void): void {
		const n = i + 1;
		const up = this.button(parent, `${prefix}${i}-up`, ui("rows.up"), ui(WORDS[name].up, { n }), () => edit("move", -1), i === 0);
		const down = this.button(parent, `${prefix}${i}-down`, ui("rows.down"), ui(WORDS[name].down, { n }), () => edit("move", 1), i === count - 1);
		this.button(parent, `${prefix}${i}-remove`, ui("rows.remove"), ui(WORDS[name].remove, { n }), () => edit("remove"));
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
			this.textInput(main, `o${i}-text`, ui("rows.option.text", { n }), o.text, (v, el) => this.edit({ what: "option-text", index: i, text: v }, null, true, el));
			const ctl = row.createDiv({ cls: "booklet-design-rows-controls" });
			const sw = ctl.createEl("button", { text: ui("rows.option.correct"), cls: "booklet-design-rows-switch", attr: { type: "button", role: "switch", "aria-checked": o.mark === " " ? "false" : "true", "aria-label": ui("rows.option.correct.label", { n }), "data-key": `o${i}-correct` } });
			sw.addEventListener("click", () => this.edit({ what: "option-correct", index: i, on: sw.getAttribute("aria-checked") !== "true" }, `o${i}-correct`));
			this.controls(ctl, "o", i, count, "option", (what, by) => {
				if (what === "move" && by) this.edit({ what: "option-move", index: i, by }, this.movedKey("o", i, by, count));
				else this.edit({ what: "option-remove", index: i }, this.afterRemove("o", i, count, "o-add"));
			});
			const replies = row.createDiv({ cls: "booklet-design-rows-replies" });
			o.replies.forEach((r, j) => {
				const rr = replies.createDiv({ cls: "booklet-design-reply" });
				this.textInput(rr, `o${i}-r${j}-text`, ui("rows.reply.text", { n, m: j + 1 }), r.text, (v, el) => this.edit({ what: "reply-text", index: i, reply: j, text: v }, null, true, el));
				this.button(rr, `o${i}-r${j}-remove`, ui("rows.remove"), ui("rows.reply.remove", { n, m: j + 1 }), () =>
					this.edit({ what: "reply-remove", index: i, reply: j }, o.replies.length > 1 ? `o${i}-r${Math.min(j, o.replies.length - 2)}-text` : `o${i}-r-add`),
				);
			});
			this.button(replies, `o${i}-r-add`, ui("rows.reply.add"), ui("rows.reply.add.label", { n }), () => this.edit({ what: "reply-add", index: i }, `o${i}-r${o.replies.length}-text`));
		});
		this.button(this.host, "o-add", ui("rows.option.add"), ui("rows.option.add"), () => this.edit({ what: "option-add" }, `o${count}-text`));
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
			c.onChange((v) => {
				const made = chooseMenu(this.io.lines(), v || null, this.io.stash());
				if (!made.ok) return this.io.refuse(made.reason, true);
				this.io.setStash(made.stash);
				this.wanted = "menu";
				this.io.put(made.lines, false);
			});
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
			this.textInput(main, `i${i}-text`, ui("rows.item.text", { n }), it.text, (v, el) => this.edit({ what: "item-text", index: i, text: v }, null, true, el));
			const ctl = row.createDiv({ cls: "booklet-design-rows-controls" });
			this.controls(ctl, "i", i, count, "item", (what, by) => {
				if (what === "move" && by) this.edit({ what: "item-move", index: i, by }, this.movedKey("i", i, by, count));
				else this.edit({ what: "item-remove", index: i }, this.afterRemove("i", i, count, "i-add"));
			});
		});
		this.button(this.host, "i-add", ui("rows.item.add"), ui("rows.item.add"), () => this.edit({ what: "item-add" }, `i${count}-text`));
	}

	// ---------------------------------------------------------------- a matrix

	private drawMatrix(rows: MatrixRows): void {
		this.items(rows.items);
		new Setting(this.host).setName(ui("rows.anchors")).setHeading();
		const list = this.host.createDiv({ cls: "booklet-design-rows-list" });
		const count = rows.anchors.length;
		if (!count) list.createDiv({ cls: "booklet-design-rows-none", text: ui("rows.none") });
		rows.anchors.forEach((a, i) => {
			const n = i + 1;
			const row = list.createDiv({ cls: "booklet-design-optrow", attr: { role: "group", "aria-label": ui("rows.anchor.group", { n }) } });
			const main = row.createDiv({ cls: "booklet-design-rows-main" });
			const num = main.createEl("input", { cls: ["booklet-design-rows-input", "booklet-design-rows-number"], attr: { type: "text", inputmode: "numeric", "aria-label": ui("rows.anchor.number", { n }), "data-key": `a${i}-number`, autocomplete: "off" } });
			num.value = a.number;
			// a number is the answer that is kept: it is taken when the box is left or Enter is pressed, never at each key
			this.io.commitOnLeave(num, () => this.edit({ what: "anchor-number", index: i, number: num.value.trim() }, `a${i}-number`));
			this.textInput(main, `a${i}-text`, ui("rows.anchor.text", { n }), a.text, (v, el) => this.edit({ what: "anchor-text", index: i, text: v }, null, true, el));
			const ctl = row.createDiv({ cls: "booklet-design-rows-controls" });
			this.controls(ctl, "a", i, count, "anchor", (what, by) => {
				if (what === "move" && by) this.edit({ what: "anchor-move", index: i, by }, this.movedKey("a", i, by, count));
				else this.edit({ what: "anchor-remove", index: i }, this.afterRemove("a", i, count, "a-add"));
			});
		});
		this.button(this.host, "a-add", ui("rows.anchor.add"), ui("rows.anchor.add"), () => this.edit({ what: "anchor-add" }, `a${count}-text`));
	}
}
