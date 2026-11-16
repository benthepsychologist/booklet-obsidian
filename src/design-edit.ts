/*
 * The Design view's in-place editor: the box a block opens in when it is clicked, in the page where the block is. One DRAFT per open
 * block (`Editing`, owned by the view); the box has four parts that all work on that one draft:
 *
 *   AS THE READER SEES IT   a live preview of the draft, drawn by the same code as the page (design-canvas-draw.ts), redrawn about 150 ms
 *                           after a change; a block with no drawing shows its card
 *   settings                the rows of the draft's opening line (core `formOfLine`), or of the front matter (`frontMatterFormOfLines`). A row
 *                           changes the DRAFT (`applyFormChange`, `applyFrontMatterChange`), never the note; an id the note already uses, and
 *                           anything the format will not take, is refused inline, in words, with nothing changed
 *   Markdown                the draft's text, always visible; typing in it re-reads the rows (about 150 ms later), so the two stay in step
 *   Cancel and Save         Save is the view's: the draft's lines go in as one `changeLines`, counted and asked about like any change
 *
 * Nothing here writes the note, and nothing throws a draft away: the box is rebuilt from the draft at every drawing of the view, with the
 * caret and the focus put back. Esc with changes keeps them as Unsaved, a second Esc discards (the view decides, `escEditor`).
 */
import { Component, Setting, type App } from "obsidian";
import {
	applyFormChange,
	applyFrontMatterChange,
	formIdClash,
	formOfLine,
	frontMatterFormOfLines,
	type DesignKind,
	type DesignNode,
	type Form,
	type FormChange,
	type FrontMatterForm,
} from "./core";
import { drawBlockBody, type Drawer } from "./design-canvas-draw";
import { pickIcon } from "./editor-modals";
import { RowsPanel, type RowsState } from "./design-rows";
import { questionOfPiece } from "./design-sample";
import { ui } from "./design-text";
import { kindName } from "./design-words";

/** One draft: the block it is open on, the lines it opened with, and what is in the box now. Kept by the view across every drawing. */
/** The property that makes a note a booklet: a YAML key, shown as it is written. */
const MARKER_KEY: string = "booklet";

export interface Editing {
	/** The block it is open on: its first line and its kind. */
	start: number;
	kind: DesignKind;
	/** The block's own lines as they were when the editor opened. */
	base: string[];
	/** What is in the box. */
	draft: string;
	/** Esc was pressed once with changes: the next Esc throws them away. */
	armed: boolean;
	/** Where the caret was in the box, kept across a drawing. */
	caret: [number, number] | null;
	/** Why the last change in the settings was refused, in words; "" when none was. */
	refusal: string;
	/** The question's own options, put away while it names a shared menu (the rows give them back when the menu is taken off again). */
	stash?: string[] | null;
}

/** What the box asks of the view. */
export interface EditHost extends Drawer {
	/** The note as the view has it now. */
	text(): string;
	/** What owns the preview's drawings (the page's Component), or null when nothing is drawn. */
	owner(): Component | null;
	app: App;
	save(): void;
	cancel(): void;
	esc(): void;
	/** The box has the focus: Ctrl or Cmd with Enter is Save while it does (the view's scope). */
	hold(): void;
	release(): void;
	/** Selects and opens the shared menu block that starts on this line of the note. */
	openMenu(line: number): void;
}

/** How long a change in the Markdown waits before the settings and the preview follow it. */
const FOLLOW_MS = 150;

const linesOfDraft = (draft: string): string[] => {
	const lines = draft.split("\n").map((l) => l.replace(/\r$/, ""));
	while (lines.length > 1 && !(lines[lines.length - 1] ?? "").trim()) lines.pop();
	return lines;
};

/** The blocks the editor's preview draws; a group, a row, a part of the booklet and the front matter have none (their lines are settings). */
const PREVIEWED: ReadonlySet<DesignKind> = new Set<DesignKind>(["question", "callout", "prose", "menu", "notice", "query", "fence", "page-break", "comment", "as-written"]);

export class EditorBox {
	readonly box: HTMLElement;
	readonly area: HTMLTextAreaElement;
	private readonly state: HTMLElement;
	private readonly mark: HTMLElement;
	private readonly refusal: HTMLElement;
	private readonly formHost: HTMLElement;
	private readonly rowsHost: HTMLElement;
	private readonly rows: RowsPanel;
	private readonly previewHost: HTMLElement | null;
	private previewOwner: Component | null = null;
	private followTimer: number | null = null;
	private previewTimer: number | null = null;

	/**
	 * @param node the block in the tree drawn now, or null when it is not there any more (a moved block's draft stays on screen, and cannot be saved)
	 * @param where "detached": the block is not on the page drawn (or is gone), so the box stands above the page
	 */
	constructor(
		private readonly host: EditHost,
		private readonly ed: Editing,
		private readonly node: DesignNode | null,
		parent: HTMLElement,
		where: "here" | "detached" | "gone",
	) {
		const name = node ? kindName(node) : ui("editor.detached.name");
		this.box = parent.createDiv({ cls: ["booklet-design-editbox", ...(where === "here" ? [] : ["is-detached"])], attr: { role: "group", "aria-label": ui("editor.label", { name }) } });
		const head = this.box.createDiv({ cls: "booklet-design-edit-head" });
		head.createSpan({ cls: "booklet-design-edit-title", text: ui("edit.heading", { kind: name }) });
		this.mark = head.createSpan({ cls: "booklet-design-edit-mark" });
		if (where === "gone") this.box.createDiv({ cls: "booklet-design-editor-moved", text: ui("editor.moved") });
		else if (where === "detached") this.box.createDiv({ cls: "booklet-design-editor-moved", text: ui("editor.elsewhere") });

		this.previewHost = null;
		if (PREVIEWED.has(ed.kind)) {
			const sec = this.box.createDiv({ cls: "booklet-design-edit-section is-preview" });
			sec.createDiv({ cls: "booklet-design-edit-label", text: ui("edit.preview") });
			this.previewHost = sec.createDiv({ cls: "booklet-design-edit-previewhost" });
		}
		this.formHost = this.box.createDiv({ cls: "booklet-design-edit-section is-form booklet-design-settings" });
		this.rowsHost = this.box.createDiv({ cls: "booklet-design-edit-section is-rows booklet-design-rows booklet-design-settings" });
		this.rows = new RowsPanel(
			this.rowsHost,
			{
				note: () => host.text(),
				start: () => node?.start ?? null,
				lines: () => this.draftLines(),
				put: (lines, quiet) => this.takeLines(lines, !quiet),
				refuse: (reason, redraw) => this.refuse(reason, redraw),
				stash: () => ed.stash ?? null,
				setStash: (lines) => void (ed.stash = lines),
				openMenu: (line) => host.openMenu(line),
				commitOnLeave: (input, commit) => this.commitOnLeave(input, commit),
			},
			() => ed.kind,
		);
		const md = this.box.createDiv({ cls: "booklet-design-edit-section is-markdown" });
		md.createDiv({ cls: "booklet-design-edit-label", text: ui("edit.markdown") });
		this.area = md.createEl("textarea", {
			cls: "booklet-design-textarea",
			attr: { "aria-label": ui("editor.textarea", { name }), spellcheck: "false", autocapitalize: "off", autocomplete: "off", autocorrect: "off", rows: "3", "data-focus": "editor" },
		});
		this.area.value = ed.draft;
		this.area.spellcheck = false;
		this.refusal = this.box.createDiv({ cls: "booklet-design-edit-refusal", attr: { role: "status", "aria-live": "polite" } });
		this.refusal.setText(ed.refusal);
		this.state = this.box.createDiv({ cls: "booklet-design-editor-state", attr: { role: "status", "aria-live": "polite", "aria-label": ui("editor.status") } });
		const foot = this.box.createDiv({ cls: "booklet-design-edit-foot" });
		foot.createSpan({ cls: "booklet-design-edit-hint", text: ui("edit.hint") });
		const buttons = foot.createDiv({ cls: "booklet-design-editor-buttons" });
		const cancel = buttons.createEl("button", { text: ui("editor.cancel"), cls: "booklet-design-cancel", attr: { type: "button", title: ui("editor.cancel.title") } });
		const save = buttons.createEl("button", { text: ui("editor.save"), cls: ["mod-cta", "booklet-design-save"], attr: { type: "button", title: ui("editor.save.title") } });
		save.disabled = !node;

		this.showState();
		this.drawForm();
		this.refreshPreview();

		this.area.addEventListener("input", () => {
			ed.draft = this.area.value;
			ed.armed = false;
			ed.refusal = "";
			this.refusal.setText("");
			this.showState();
			this.followSoon();
		});
		// the box's keys are its own: the view's hotkeys do not hear them (see the view's `keyPress`); only Escape is the editor's here, and
		// Ctrl or Cmd with Enter, which Obsidian's own hotkeys take before the box hears it (see `holdSaveKey`), but is kept as a fallback
		this.box.addEventListener("keydown", (evt) => {
			if (evt.key === "Escape") {
				evt.preventDefault();
				evt.stopPropagation();
				host.esc();
			} else if (evt.key === "Enter" && (evt.ctrlKey || evt.metaKey)) {
				evt.preventDefault();
				evt.stopPropagation();
				host.save();
			}
		});
		this.box.addEventListener("focusin", () => host.hold());
		this.box.addEventListener("focusout", (evt) => {
			const to = evt.relatedTarget as Node | null;
			if (!to || !this.box.contains(to)) host.release();
		});
		// a press on a button must not take the focus out of a row first: leaving the row makes the box show "Unsaved" and move the buttons down
		// before the press is finished, and the click then lands on nothing. The click itself pays what the row owes (`remember`).
		for (const b of [save, cancel]) b.addEventListener("mousedown", (evt) => evt.preventDefault());
		save.addEventListener("click", () => host.save());
		cancel.addEventListener("click", () => host.cancel());
	}

	/** Lets go of what the box holds: its timers and its preview's drawings. */
	dispose(): void {
		if (this.followTimer !== null) window.clearTimeout(this.followTimer);
		if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
		this.followTimer = this.previewTimer = null;
		this.dropPreview();
	}

	/** What a row's typing still owes the draft: set when a row is typed in, run when the row is left, and run first by anything that reads the draft. */
	private pending: (() => void) | null = null;

	/** A row's value reaches the draft when the row is left or Enter is pressed (never at each key); until then it is owed, and `flush` pays it. */
	private commitOnLeave(input: HTMLInputElement, commit: () => void): void {
		input.addEventListener("input", () => void (this.pending = commit));
		input.addEventListener("change", () => {
			// `flush` is paying this row's typing now, and drawing the rows again takes the row out while it has the focus: the browser then
			// reports the row left, and that must not pay it a second time (nor draw the rows again in the middle of drawing them)
			if (this.flushing) return;
			this.pending = null;
			commit();
		});
	}

	/** Puts a row's typing that is still owed into the draft (Save, Ctrl or Cmd with Enter and a redraw all read the draft, and must find it there). */
	flush(): void {
		const owed = this.pending;
		this.pending = null;
		this.flushing = true;
		try {
			owed?.();
		} finally {
			this.flushing = false;
		}
	}

	/** True while `flush` is paying a row's typing (see `commitOnLeave`). */
	private flushing = false;

	/** Reads the box into the draft (before a drawing), and gives whether the box had the focus. */
	remember(): boolean {
		this.flush();
		this.ed.draft = this.area.value;
		const had = this.area.ownerDocument.activeElement === this.area;
		if (had) this.ed.caret = [this.area.selectionStart, this.area.selectionEnd];
		return had;
	}

	focus(): void {
		this.area.focus();
		if (this.ed.caret) this.area.setSelectionRange(this.ed.caret[0], this.ed.caret[1]);
	}

	/** The Unsaved mark and the line under the box, from the draft. */
	showState(): void {
		const ed = this.ed;
		const changed = ed.draft !== ed.base.join("\n");
		this.state.setText(changed ? ui(ed.armed ? "editor.armed" : "editor.unsaved") : "");
		this.mark.setText(changed ? ui("edit.mark") : "");
		this.box.toggleClass("is-unsaved", changed);
		this.box.toggleClass("is-armed", changed && ed.armed);
		this.area.rows = Math.min(30, Math.max(3, this.area.value.split("\n").length + 1));
	}

	// ---------------------------------------------------------------- the settings, from the draft

	private followSoon(): void {
		if (this.followTimer !== null) window.clearTimeout(this.followTimer);
		this.followTimer = window.setTimeout(() => {
			this.followTimer = null;
			this.drawForm();
			this.refreshPreview();
		}, FOLLOW_MS);
	}

	/** Runs the settings and the preview at once (a test, or a change made in a row, does not wait). */
	followNow(): void {
		if (this.followTimer !== null) window.clearTimeout(this.followTimer);
		this.followTimer = null;
		this.drawForm();
		this.refreshPreview();
	}

	private draftLines(): string[] {
		return linesOfDraft(this.ed.draft);
	}

	/** The draft is now these lines: the box takes them, the rows read them again, the preview follows. */
	private takeLines(lines: readonly string[], draw = true): void {
		this.ed.draft = lines.join("\n");
		this.ed.armed = false;
		this.ed.refusal = "";
		this.refusal.setText("");
		this.area.value = this.ed.draft;
		this.showState();
		// the rows a person is typing in are in step already, and are not drawn again under the caret
		if (draw) this.drawForm();
		this.schedulePreview();
	}

	private refuse(reason: string, draw = true): void {
		this.ed.refusal = ui("form.refused", { reason });
		this.refusal.setText(this.ed.refusal);
		// the row goes back to what the draft has
		if (draw) this.drawForm();
	}

	/** One row of a Booklet line's settings changed. */
	private change(change: FormChange): void {
		if (change.what === "id" && this.node) {
			const clash = formIdClash(this.host.text(), this.node, change.value);
			if (clash) return this.refuse(clash);
		}
		const made = applyFormChange(this.draftLines(), change);
		if (!made.ok) return this.refuse(made.reason);
		this.takeLines(made.lines);
	}

	/** One row of the front matter changed. */
	private changeFront(key: string, value: string): void {
		const made = applyFrontMatterChange(this.draftLines(), { key, value });
		if (!made.ok) return this.refuse(made.reason);
		this.takeLines(made.lines);
	}

	/** The settings rows, from the draft's opening line (or its front matter), put back where they were with the focus on the row that had it. */
	private drawForm(): void {
		const doc = this.formHost.ownerDocument;
		const active = doc.activeElement;
		// the rows are drawn again: what an old row owed belongs to a row that is gone
		this.pending = null;
		const field = active && this.formHost.contains(active) ? (active.closest("[data-field]")?.getAttribute("data-field") ?? null) : null;
		this.formHost.empty();
		const lines = this.draftLines();
		// the rows of a list come first: when they are offered they hold the shared menu, which the settings then leave out
		const rows: RowsState = this.ed.kind === "front-matter" ? "none" : this.rows.draw(lines);
		if (this.ed.kind === "front-matter") {
			const form = frontMatterFormOfLines(lines);
			if (form) this.drawFrontRows(form);
		} else {
			const form = formOfLine(lines[0] ?? "");
			if (form) this.drawRows(form, rows === "rows");
		}
		this.formHost.toggleClass("is-empty", !this.formHost.childElementCount);
		if (field) {
			const row = Array.from(this.formHost.querySelectorAll<HTMLElement>("[data-field]")).find((e) => e.getAttribute("data-field") === field);
			row?.querySelector<HTMLElement>("input, select, button")?.focus();
		}
	}

	private drawRows(form: Form, menuInRows = false): void {
		const host = this.formHost;
		new Setting(host).setName(ui("form.heading")).setHeading();
		const change = (what: FormChange): void => this.change(what);
		for (const f of form.fields) {
			if (menuInRows && f.type === "value" && f.name === "menu") continue;
			const row = new Setting(host);
			if (f.type === "id" || f.type === "title") {
				row.setName(ui(f.type === "id" ? "form.id" : "form.title")).setDesc(ui(f.type === "id" ? "form.id.desc" : "form.title.desc"));
				row.settingEl.setAttribute("data-field", f.type);
				row.addText((c) => {
					c.setValue(f.value);
					// a change is made when the box is left or Enter is pressed, never on each key typed
					this.commitOnLeave(c.inputEl, () => change({ what: f.type, value: c.inputEl.value.trim() }));
				});
			} else if (f.type === "flag") {
				row.setName(f.name);
				row.settingEl.setAttribute("data-field", f.name);
				row.addToggle((c) => c.setValue(f.on).onChange((on) => change({ what: "flag", name: f.name, on })));
			} else {
				row.setName(f.icon ? ui("form.icon") : f.name);
				row.settingEl.setAttribute("data-field", f.name);
				row.addText((c) => {
					c.setValue(f.value);
					if (f.numeric) c.inputEl.inputMode = "decimal";
					this.commitOnLeave(c.inputEl, () => change({ what: "value", name: f.name, value: c.inputEl.value.trim() }));
				});
				if (f.icon)
					row.addButton((b) => {
						b.setButtonText(ui("form.icon.choose")).onClick(() => {
							void pickIcon(this.host.app, f.value).then((icon) => {
								if (icon !== null) change({ what: "value", name: "icon", value: icon });
							});
						});
						b.buttonEl.setAttribute("aria-label", ui("form.icon.choose.label"));
					});
			}
		}
		if (form.stray.length) {
			new Setting(host).setName(ui("form.stray")).setHeading();
			for (const w of form.stray) {
				const row = new Setting(host).setName(w.text);
				row.settingEl.setAttribute("data-field", `stray-${w.index}`);
				row.addButton((b) => {
					b.setButtonText(ui("form.stray.remove")).onClick(() => change({ what: "stray", index: w.index }));
					b.buttonEl.setAttribute("aria-label", ui("form.stray.remove.label", { word: w.text }));
				});
			}
		}
	}

	private drawFrontRows(form: FrontMatterForm): void {
		const host = this.formHost;
		new Setting(host).setName(ui("form.heading")).setHeading();
		if (form.marker) {
			const row = new Setting(host).setName(MARKER_KEY).setDesc(`${form.marker}. ${ui("form.fm.marker")}`);
			row.settingEl.setAttribute("data-field", "marker");
		}
		for (const f of form.fields) {
			const row = new Setting(host).setName(f.key);
			row.settingEl.setAttribute("data-field", f.key);
			if (f.locked) {
				row.setDesc(f.locked);
				row.addText((c) => c.setValue(f.value).setDisabled(true));
				continue;
			}
			if (f.type === "choice") {
				row.addDropdown((c) => {
					for (const o of f.options ?? []) c.addOption(o, o === "" ? ui("form.fm.none") : o);
					c.setValue(f.value);
					c.onChange((v) => this.changeFront(f.key, v));
				});
				continue;
			}
			row.addText((c) => {
				c.setValue(f.value);
				this.commitOnLeave(c.inputEl, () => this.changeFront(f.key, c.inputEl.value.trim()));
			});
		}
		if (form.other.length) {
			new Setting(host).setName(ui("form.fm.more")).setHeading();
			for (const o of form.other) {
				const row = new Setting(host).setName(o.key).setDesc(o.text);
				row.settingEl.setAttribute("data-field", `other-${o.line}`);
			}
		}
	}

	// ---------------------------------------------------------------- the preview, from the draft

	private dropPreview(): void {
		const old = this.previewOwner;
		this.previewOwner = null;
		if (!old) return;
		this.host.owner()?.removeChild(old);
		old.unload();
	}

	private schedulePreview(): void {
		if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
		this.previewTimer = window.setTimeout(() => {
			this.previewTimer = null;
			this.refreshPreview();
		}, FOLLOW_MS);
	}

	/** Draws the draft as the reader sees it, in the place of what was drawn. */
	refreshPreview(): void {
		const into = this.previewHost;
		if (!into) return;
		this.dropPreview();
		into.empty();
		const parent = this.host.owner();
		if (!parent) return;
		const owner = parent.addChild(new Component());
		this.previewOwner = owner;
		const lines = this.draftLines();
		const first = lines[0] ?? "";
		const kind = this.ed.kind;
		// the kind of a callout or a question is what its first line says now: a draft may turn one into another
		const detail = kind === "query" || kind === "fence" ? (/^\s*(?:>\s*)*(?:`{3,}|~{3,})\s*(.*)$/.exec(first)?.[1] ?? "") : (/\[!\s*([\w-]+)/.exec(first)?.[1] ?? "");
		drawBlockBody(this.host, owner, into, {
			kind,
			detail: kind === "question" || kind === "callout" ? detail : (this.node?.detail ?? detail),
			id: this.node?.id ?? null,
			label: this.node?.label ?? "",
			lines,
			found: kind === "question" ? (questionOfPiece(lines.join("\n")) ?? null) : null,
		});
	}
}
