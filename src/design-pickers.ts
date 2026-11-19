/*
 * The Design view's controls for the settings that name another part of the note, and for the fold mark, drawn in the strip under a block's
 * words and (for a copy button's list) in a part of their own: a switch for whether a callout starts folded, pickers for an activity's tab,
 * a page's parent and a copy button's `of:`, and a switch for a repeat activity's `entries:folded`. The sources and the edits are core's
 * (design-fold.ts, design-structure.ts); nothing here holds a copy of the text, and nothing here writes: a control hands the box a change of
 * the block's lines (`act`), made on the lines as they are when it runs.
 *
 * A value the note already holds that a picker cannot offer (a tab that is not there, a page that would make a loop, a block's id in an
 * `of:`) is listed in the picker as what it is, "kept as written", and is changed only when the person chooses something else.
 */
import { Setting } from "obsidian";
import { applyFormChange, copyChoices, copyItems, editCopyOf, entriesState, foldOfLine, formOfLine, parentChoices, parentProblem, setFold, tabChoices, tabProblem, type CopyChoice, type DesignNode, type FormChange } from "./core";
import type { Made } from "./design-rows";
import { drawIcon } from "./design-picture";
import { ui } from "./design-text";
import { quietNames } from "./design-words";

/** What the strip's controls ask of the box. */
export interface StripCtx {
	/** The note as the view has it now. */
	text(): string;
	/** The open block's node in the note now, or null. */
	node(): DesignNode | null;
	/** The block's own lines in the note now. */
	lines(): string[];
	/** A control pressed: one change on the block's lines as they are when it runs. */
	act(make: (lines: string[]) => Made, focus: string | null): void;
	/** One setting's change of the block's first line. */
	change(lines: string[], change: FormChange): Made;
	/** What the note has for a setting of the first line now. */
	valueOf(lines: string[], name: string): string | null;
	/** A control that is put back in step with the note after every write (see the box's `formSyncs`). */
	sync(fn: (lines: string[]) => void): void;
	/** The controls are being put back to what the note has after a change that did not land. */
	reverting(): boolean;
	/** One item of the strip, named in words. */
	item(name: string, label: string, cls?: string): HTMLElement;
}

// ---------------------------------------------------------------- the fold switch

/** The switch for whether a callout starts folded (the `-` right after its bracket), for a block whose first line can fold. */
export function drawFoldSwitch(ctx: StripCtx): void {
	const first = foldOfLine(ctx.lines()[0] ?? "");
	if (!first.ok) return;
	const el = ctx.item("fold", "", "is-switch");
	el.empty();
	const sw = el.createEl("button", { text: ui("fold.switch"), cls: "booklet-design-strip-switch", attr: { type: "button", role: "switch", "aria-checked": String(first.mark === "-"), "data-key": "fold" } });
	const plus = el.createSpan({ cls: "booklet-design-strip-label", text: ui("fold.plus") });
	plus.hidden = first.mark !== "+";
	sw.addEventListener("click", () =>
		ctx.act((lines) => {
			const now = foldOfLine(lines[0] ?? "");
			if (!now.ok) return { ok: false, reason: now.reason };
			const made = setFold(lines, now.mark !== "-");
			return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
		}, "fold"),
	);
	ctx.sync((lines) => {
		const now = foldOfLine(lines[0] ?? "");
		if (!now.ok) return;
		sw.setAttribute("aria-checked", String(now.mark === "-"));
		plus.hidden = now.mark !== "+";
	});
}

// ---------------------------------------------------------------- the kept entries' switch

/**
 * `entries:folded` on an activity: a switch where it does something (a `repeat` activity), and in words where it does not. A line that
 * holds `entries:` with any other value says so, and keeps it as written until the switch is turned on (which writes `folded`).
 */
export function drawEntriesSwitch(ctx: StripCtx): void {
	const st = entriesState(ctx.lines()[0] ?? "");
	if (!st) return;
	const el = ctx.item("entries", "", "is-switch");
	el.empty();
	const sw = el.createEl("button", { text: ui("entries.switch"), cls: "booklet-design-strip-switch", attr: { type: "button", role: "switch", "aria-checked": String(st.folded), "data-key": "entries" } });
	const note = el.createSpan({ cls: "booklet-design-strip-label" });
	const show = (lines: string[]): void => {
		const now = entriesState(lines[0] ?? "");
		if (!now) return;
		sw.setAttribute("aria-checked", String(now.folded));
		// it is a switch where it does something, or where the line already says something to turn off; else it is named in words and cannot be pressed
		const live = now.applies || now.folded || now.other !== null;
		sw.disabled = !live;
		note.setText(now.other !== null ? ui("entries.differs", { value: now.other }) : !now.applies ? ui("entries.needsRepeat") : "");
		note.hidden = !note.textContent;
	};
	show(ctx.lines());
	sw.addEventListener("click", () =>
		ctx.act((lines) => {
			const now = entriesState(lines[0] ?? "");
			if (!now) return { ok: false, reason: ui("edit.changed") };
			return ctx.change(lines, { what: "value", name: "entries", value: now.folded ? "" : "folded" });
		}, "entries"),
	);
	ctx.sync(show);
}

// ---------------------------------------------------------------- a picker of one setting (tab, parent)

interface PickerSpec {
	/** The setting's word on the line, and its `data-field` and `data-key`. */
	name: "tab" | "parent";
	label: string;
	/** What is offered, as [value, words] pairs, "nothing" first; the value the line holds is in it, kept as written, when it is not one of the others. */
	options(node: DesignNode, held: string): [string, string][];
	/** Why a choice cannot be written, or null. */
	problem(node: DesignNode, value: string): string | null;
}

/** A picker of one setting that names another part of the note: applied the moment it is chosen, as the `each:` and shared-menu pickers are. */
function drawPicker(ctx: StripCtx, spec: PickerSpec): void {
	const el = ctx.item(spec.name, spec.label);
	const sel = el.createEl("select", { cls: "booklet-design-strip-input", attr: { "aria-label": spec.label, "data-key": spec.name } });
	const held = (): string => ctx.valueOf(ctx.lines(), spec.name) ?? "";
	const fill = (): void => {
		const node = ctx.node();
		const now = sel.value;
		const wanted = held();
		const options = node ? spec.options(node, wanted) : [["", ""] as [string, string]];
		// the list is made again only when it has changed: a list taken away under a press would swallow it
		const sig = JSON.stringify(options);
		sel.disabled = options.length < 2;
		if (sel.dataset["sig"] === sig) return;
		sel.dataset["sig"] = sig;
		sel.empty();
		for (const [v, label] of options) sel.createEl("option", { value: v, text: label });
		sel.value = now && options.some(([v]) => v === now) ? now : wanted;
	};
	fill();
	sel.value = held();
	// the list is looked at again when the person goes to it, so a tab or a page added since the box was drawn is in it
	sel.addEventListener("focus", fill);
	sel.addEventListener("mousedown", fill);
	sel.addEventListener("change", () => {
		const chosen = sel.value;
		ctx.act((lines) => {
			const node = ctx.node();
			const bad = node ? spec.problem(node, chosen) : ui("edit.changed");
			return bad ? { ok: false, reason: bad } : ctx.change(lines, { what: "value", name: spec.name, value: chosen });
		}, spec.name);
	});
	ctx.sync((lines) => {
		const now = ctx.valueOf(lines, spec.name) ?? "";
		fill();
		if (sel.value !== now && (ctx.reverting() || sel.ownerDocument.activeElement !== sel)) sel.value = now;
	});
}

const titled = (value: string, title: string): string => (title ? ui("pick.titled", { title, id: value }) : value);

/** An activity's `tab:`: the tabs of its module, "no tab" (the first one), and a tab the line names that the module does not have, kept as written. */
export function drawTabPicker(ctx: StripCtx): void {
	drawPicker(ctx, {
		name: "tab",
		label: ui("setting.tab"),
		options: (node, held) => {
			const tabs = tabChoices(node);
			const out: [string, string][] = [["", ui("tab.none")], ...tabs.map((t): [string, string] => [t.value, titled(t.value, t.title)])];
			if (held && !tabs.some((t) => t.value === held)) out.push([held, ui("tab.missing", { id: held })]);
			return out;
		},
		problem: tabProblem,
	});
}

/** A page's `parent:`: the other pages of its tab (never itself or one of its own sub-pages), "no parent", and a value the line holds that is not one of those, kept as written. */
export function drawParentPicker(ctx: StripCtx): void {
	drawPicker(ctx, {
		name: "parent",
		label: ui("setting.parent"),
		options: (node, held) => {
			const pages = parentChoices(node);
			const out: [string, string][] = [["", ui("parent.none")], ...pages.map((p): [string, string] => [p.value, titled(p.value, p.title)])];
			if (held && !pages.some((p) => p.value === held)) {
				const inTab = (node.parent?.children ?? []).some((c) => c.kind === "page" && c.id === held);
				out.push([held, ui(inTab ? "parent.loop" : "parent.missing", { id: held })]);
			}
			return out;
		},
		problem: parentProblem,
	});
}

// ---------------------------------------------------------------- a copy button's `of:`

/** What the copy list asks of the box that holds it. */
export type CopyIO = Pick<StripCtx, "text" | "node" | "lines" | "act">;

const clip = (s: string): string => (s.trim().length > 40 ? `${s.trim().slice(0, 40)}…` : s.trim());

/** The words a copy choice is offered by. */
function choiceWords(c: CopyChoice): string {
	if (c.what === "hint") return ui("copy.hint", { id: c.value.replace(/\/hint$/, "") });
	if (c.what === "solution") return ui("copy.solution", { id: c.value.replace(/\/solution$/, "") });
	return c.title.trim() ? ui("copy.q", { id: c.value, title: clip(c.title) }) : c.value;
}

/** The `of:` of a copy line's lines, or null when the first line is not a copy line. */
function ofOf(lines: readonly string[]): string | null {
	const form = formOfLine(lines[0] ?? "");
	if (!form || form.kind !== "copy") return null;
	const of = form.fields.find((f) => f.type === "value" && f.name === "of");
	return of && of.type === "value" ? of.value : "";
}

/**
 * A copy button's list of what it copies: one row for each word of `of:`, in the order written, with a picker of the questions of the
 * button's own activity (and their folded hint and solution), move up, move down and remove, and a picker that adds one at the end. A word
 * the picker cannot offer (a block's id, a question that is not there) is a row of its own, shown as kept as written, and every change of
 * another row leaves it exactly as it was.
 */
export class CopyPanel {
	private shape = "";

	constructor(
		private readonly host: HTMLElement,
		private readonly io: CopyIO,
	) {}

	private shapeNow(lines: readonly string[]): string {
		const of = ofOf(lines);
		if (of === null) return "none";
		const node = this.io.node();
		return `${of}|${node ? copyChoices(this.io.text(), node).map((c) => c.value).join(",") : ""}`;
	}

	/** Does the part show something different from what these lines make (it must be drawn again)? */
	differs(lines: readonly string[]): boolean {
		return this.shapeNow(lines) !== this.shape;
	}

	/** Draws the list of these lines (the note's) in place of what was drawn. `wanted`: the control the focus goes to after. */
	draw(lines: readonly string[], wanted: string | null = null): void {
		const doc = this.host.ownerDocument;
		const active = doc.activeElement;
		const key = wanted ?? (active && this.host.contains(active) ? (active.closest("[data-key]")?.getAttribute("data-key") ?? null) : null);
		this.host.empty();
		this.shape = this.shapeNow(lines);
		const of = ofOf(lines);
		this.host.toggleClass("is-empty", of === null);
		if (of === null) return;
		const node = this.io.node();
		const choices = node ? copyChoices(this.io.text(), node) : [];
		const items = copyItems(of);
		new Setting(this.host).setName(ui("copy.heading")).setHeading();
		const list = this.host.createDiv({ cls: "booklet-design-rows-list" });
		if (!items.length) list.createDiv({ cls: "booklet-design-rows-none", text: ui(choices.length ? "copy.none" : "copy.noQuestions") });
		items.forEach((item, i) => {
			const n = i + 1;
			const row = list.createDiv({ cls: "booklet-design-optrow", attr: { role: "group", "aria-label": ui("copy.group", { n }) } });
			const main = row.createDiv({ cls: "booklet-design-rows-main" });
			main.createSpan({ cls: "booklet-design-rows-num", text: String(n), attr: { "aria-hidden": "true" } });
			const sel = main.createEl("select", { cls: "booklet-design-strip-input", attr: { "aria-label": ui("copy.item", { n }), "data-key": `c${i}-pick` } });
			const offered = choices.some((c) => c.value === item);
			// a word the picker cannot offer is the first thing it lists, as itself, and stays chosen until another is
			if (!offered) sel.createEl("option", { value: item, text: item === "" ? ui("copy.kept.empty") : ui("copy.kept", { item }) });
			for (const c of choices) sel.createEl("option", { value: c.value, text: choiceWords(c) });
			sel.value = item;
			sel.addEventListener("change", () => this.edit(i, item, { op: "set", index: i, value: sel.value }, `c${i}-pick`));
			const ctl = row.createDiv({ cls: "booklet-design-rows-controls" });
			const up = this.button(ctl, `c${i}-up`, ui("rows.up"), ui("copy.up", { n }), () => this.edit(i, item, { op: "move", index: i, by: -1 }, this.movedKey(i, -1, items.length)), i === 0, ["arrow-up", "chevron-up"]);
			const down = this.button(ctl, `c${i}-down`, ui("rows.down"), ui("copy.down", { n }), () => this.edit(i, item, { op: "move", index: i, by: 1 }, this.movedKey(i, 1, items.length)), i === items.length - 1, ["arrow-down", "chevron-down"]);
			this.button(ctl, `c${i}-remove`, ui("rows.remove"), ui("copy.remove", { n }), () => this.edit(i, item, { op: "remove", index: i }, items.length > 1 ? `c${Math.min(i, items.length - 2)}-pick` : "c-add"), false, ["x", "trash-2"]);
			up.addClass("booklet-design-rows-move");
			down.addClass("booklet-design-rows-move");
		});
		if (choices.length) {
			const add = this.host.createEl("select", { cls: "booklet-design-strip-input", attr: { "aria-label": ui("copy.add"), "data-key": "c-add" } });
			add.createEl("option", { value: "", text: ui("copy.add") });
			for (const c of choices) add.createEl("option", { value: c.value, text: choiceWords(c) });
			add.value = "";
			add.addEventListener("change", () => {
				if (add.value) this.edit(-1, null, { op: "add", value: add.value }, "c-add");
			});
		}
		quietNames(this.host);
		if (key) this.host.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
	}

	/** The control the focus goes to after a move: the same button at the item's new place, or its twin when that one is not there to press. */
	private movedKey(i: number, by: -1 | 1, count: number): string {
		const to = i + by;
		const stillThere = by < 0 ? to > 0 : to < count - 1;
		return stillThere ? `c${to}-${by < 0 ? "up" : "down"}` : `c${to}-${by < 0 ? "down" : "up"}`;
	}

	private button(parent: HTMLElement, key: string, text: string, label: string, onClick: () => void, disabled: boolean, icons: readonly string[]): HTMLButtonElement {
		const b = parent.createEl("button", { cls: "booklet-design-rows-button", attr: { type: "button", "aria-label": label, "data-key": key } });
		if (!drawIcon(b, icons)) b.setText(text);
		else b.addClass("is-icon");
		b.disabled = disabled;
		b.addEventListener("click", onClick);
		return b;
	}

	/** One change of the list, made on the line as it is when it runs: only if the word at that place is still the word that was drawn there. */
	private edit(index: number, shown: string | null, change: Parameters<typeof editCopyOf>[1], focus: string): void {
		this.io.act((lines) => {
			const of = ofOf(lines);
			if (of === null) return { ok: false, reason: ui("edit.changed") };
			if (shown !== null && copyItems(of)[index] !== shown) return { ok: false, reason: ui("edit.changed") };
			const made = editCopyOf(of, change);
			if (!made.ok) return { ok: false, reason: made.reason };
			const out = applyFormChange(lines, { what: "value", name: "of", value: made.value });
			return out.ok ? { ok: true, lines: out.lines } : { ok: false, reason: out.reason };
		}, focus);
	}
}
