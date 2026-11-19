/*
 * The Design view's in-place editor: the box a block opens in when it is clicked, in the page where the block is. There is NO DRAFT: the
 * note on disk is the one truth, the box shows it, and every change a person makes in the box is written as soon as it is made, as one
 * step of Undo (the view's `change`: operation, the question about kept data, one write, one history step, a drawing).
 *
 * THE BOX IS THE BLOCK, OPENED. Its words are fields drawn in the type of the block, where they stand, and nothing shows the block a second
 * time (there is no preview). From the top:
 *
 *   title, description   the words of the block (core `readParts`): a question's title and the help under it, a callout's title and body,
 *                        a prose block's text. Fields that grow with their words, with no box until the pointer or the focus is on them
 *   rows                 a choice's or a multi's options, a menu's items, a matrix's items and anchors (design-rows.ts)
 *   strip                the rest of the block's opening line: its id, its switches and values, and the move and delete buttons
 *   Markdown             the block's own lines, in a section that is closed until it is opened (open at once when nothing else of the
 *                        block can be edited in place, with the reason said)
 *
 * VERY MODEST RICH TEXT. Over the words there is a small bar (Bold, Italic, Link, Bullets) and the keys Ctrl/Cmd+B, I, K and Shift+8. They
 * only put Markdown markers into, or take them out of, the text of the focused title, description or prose field (core `richFormat`): the
 * field shows and saves the Markdown, nothing else exists. The bar is always in the box while the block has words, the same size whatever
 * has the focus (its buttons only go quiet), and a press on it never moves the focus: so nothing moves, and a press right after typing is not
 * lost. A format changes the field in place and is then applied when the field is left, like typing (one write, one step of Undo).
 *
 * WHEN A CONTROL IS APPLIED. A switch, a button and a choice are applied the moment they are pressed. A control of words (the title, the
 * description, a settings value, a row's words, the Markdown) is applied when it is LEFT, when Enter is pressed in a one-line one, and by
 * whatever is about to end the block's life first (`applyAll`, called by the view in its own lane: Esc, Ctrl/Cmd+Enter, another block, Undo,
 * a mode switch, the pane closing). Nothing is applied at each key, so nothing is redrawn under a caret.
 *
 * WHY NOTHING IS LOST OR WRITTEN TWICE. A control remembers what was last handed over to be applied (`sent`); it has typing in it that is
 * owed only while its value is another. Applying hands the value over first and writes after, so the `change` that follows an Enter, or
 * the one a removal from the page makes, finds nothing owed. Every event handler here only QUEUES work on the view's one lane
 * (`host.queue`); nothing runs a write, or draws, inside an event. The work, when it runs, is made from the block's lines as the note
 * has them THEN, never from lines kept from when the control was drawn: a control that is not in step with the note (a row typed in
 * after the note changed under it) is not applied; its text is kept where it is, with the reason in words (`hold`).
 *
 * WHY A PRESS IS NOT SWALLOWED. The view draws the page again after every write, which would take a control away from under a press that
 * has begun. The box is therefore kept across drawings (`lift`, `attach`): its elements stay the same elements, and what a write changed
 * is put into them (`render`): the words of a control that is not being typed in, the marks of a switch. Only a change of SHAPE (a row
 * added, removed or moved, a switch that adds or takes away other rows, the block becoming one the fields cannot show) draws that part
 * again, with the focus put on the control the person was on, or the one the press leads to.
 */
import { Platform, Setting, type App } from "obsidian";
import {
	applyFormChange,
	applyFrontMatterChange,
	eachSourcesFor,
	formIdClash,
	formOfLine,
	frontMatterFormOfLines,
	readHelps,
	readParts,
	richFormat,
	richTakes,
	writeDescription,
	type DesignKind,
	type DesignNode,
	type Form,
	type FormChange,
	type FrontMatterForm,
	type RichAction,
	type RichRefusal,
	type RichWhere,
} from "./core";
import { pickIcon } from "./editor-modals";
import { drawIcon } from "./design-picture";
import { MediaPanel, type MediaState } from "./design-media-panel";
import { HelpsPanel, type HelpsState } from "./design-helps-panel";
import { CopyPanel, drawEntriesSwitch, drawFoldSwitch, drawParentPicker, drawTabPicker, type StripCtx } from "./design-pickers";
import { RowsPanel, type Made, type RowsState } from "./design-rows";
import { ui } from "./design-text";
import { kindName, quietNames } from "./design-words";
import type { DesignKey } from "./core";

/** The property that makes a note a booklet: a YAML key, shown as it is written. */
const MARKER_KEY: string = "booklet";

/**
 * The block the box is open on: a line and a kind, and nothing else the note does not have. This is all the view keeps of an open editor;
 * the text is the note's.
 */
export interface Editing {
	start: number;
	kind: DesignKind;
	/**
	 * The question's own options, put away while it names a shared menu (the rows give them back when the menu is taken off again). It is
	 * view-level state of the OPEN block: with no draft, nothing else could keep it. It goes when the block is closed (the options are in
	 * the step Undo takes back); see `chooseMenu`, core/design-options.ts.
	 */
	stash?: string[] | null;
}

/** Which of the block's move and delete buttons the box shows, and which are on. */
export interface BarState {
	move: boolean;
	up: boolean;
	down: boolean;
	del: boolean;
}

/** What happened to a change the box asked the view to make. */
export type Outcome = "landed" | "unchanged" | "declined" | "refused" | "stale" | "failed";

/** What the box asks of the view. */
export interface EditHost {
	/** The note as the view has it now. */
	text(): string;
	/** The open block's node in the note as it is now, or null when the note has no such block. */
	node(): DesignNode | null;
	/** The open block's own lines as the note has them now, or null when the note has no such block. */
	lines(): string[] | null;
	app: App;
	/** Makes the block's lines these: one write and one step of Undo, asked about first when kept data is touched. Runs in the view's lane. */
	change(lines: string[]): Promise<Outcome>;
	/** Runs `work` in the view's one lane of writes: after what is queued, never dropped, one at a time. */
	queue(work: () => Promise<void>): Promise<void>;
	/** Esc, or Ctrl/Cmd with Enter, in the box: what is typed is applied and the block closes. */
	confirm(): void;
	/** The box has the focus (the view holds Ctrl/Cmd+Enter for it) and no longer has it. */
	hold(): void;
	release(): void;
	/** Selects and opens the shared menu block that starts on this line of the note. */
	openMenu(line: number): void;
	/** What the open block can be moved and deleted by (null when none of it: the front matter), as the note has it now. */
	bar(): BarState | null;
	/** A press of the box's move or delete button: the block is closed (what is typed is applied first) and then moved or deleted. */
	press(what: "up" | "down" | "delete"): void;
	/** Says it in the view's status line. */
	say(words: string): void;
}

/** One control of words: what it was last given to apply, what the note had for it, and how to apply it. */
interface Field {
	el: HTMLInputElement | HTMLTextAreaElement;
	part: "form" | "rows" | "media" | "helps" | "area" | "words";
	/** The value last handed over to be applied (or drawn from the note). The control has typing in it that is owed while its value is another. */
	sent: string;
	/** What the note had for the control when they last matched. */
	was: string;
	make: (value: string, lines: string[], was: string) => Made;
	back: (lines: string[]) => string | null;
	/** Its typing was not applied (the note changed under it, or the block is gone) and stays in it, with the reason said. */
	held: boolean;
	/** Its typing is being applied now (a write is under way): drawings made for that write leave it alone. */
	applying: boolean;
}

/**
 * The block's lines from a text typed in the Markdown: the trailing blank lines are not part of a block (its own lines have none), and
 * a text of nothing but blank lines is no lines at all, which the change then refuses (a block with no lines is a deleted block).
 */
const linesOfText = (text: string): string[] => {
	const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
	while (lines.length && !(lines[lines.length - 1] ?? "").trim()) lines.pop();
	return lines;
};

const sameLines = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((l, i) => l === b[i]);

/** What the fields can show of a block: its title, its description (a question's help, or the words of a callout or a prose block), or why neither. */
interface Cap {
	title: boolean;
	desc: "help" | "words" | null;
	why: string | null;
}

/** A line of nothing but spaces holds nothing. */
const filled = (l: string): boolean => l.trim() !== "";

/** A text area is as many lines high as its words have (a browser that sizes it by its words, `field-sizing`, makes it taller when they wrap). */
const fit = (el: HTMLTextAreaElement | HTMLInputElement): void => {
	if (el.tagName === "TEXTAREA") (el as HTMLTextAreaElement).rows = Math.min(30, Math.max(1, el.value.split("\n").length));
};

/** The settings of the kinds this stage gives controls to, by the word the line writes: their name in words (`long` is a big box). The rest of the strip names a setting by its own word. */
const SETTING_WORDS: Readonly<Record<string, DesignKey>> = {
	long: "setting.long",
	min: "setting.min",
	max: "setting.max",
	step: "setting.step",
	each: "setting.each",
	earlier: "setting.earlier",
	left: "setting.left",
	readonly: "setting.readonly",
	describe: "setting.describe",
};

/** A setting's name in words, with the word the line writes after it (`Smallest number (min)`): the Markdown stays recognisable. */
const settingName = (name: string): string => {
	const key = SETTING_WORDS[name];
	return key ? `${ui(key)} (${name})` : name;
};

/** The settings whose value is a whole number of digits (a phone shows its number pad). */
const WHOLE_SETTINGS: ReadonlySet<string> = new Set(["earlier", "left"]);

/** A title is one line: a break pasted into it is a space. */
const oneLine = (v: string): string => v.replace(/\s*[\r\n]+\s*/g, " ");

/** What is said when a format is refused, by the core's code (the status line of the view; nothing in the box moves). */
const REFUSAL_WORDS: Readonly<Record<RichRefusal, DesignKey>> = {
	"no-bullets": "rich.no.bullets",
	nothing: "rich.no.nothing",
	rule: "rich.no.rule",
	block: "rich.no.block",
	crowded: "rich.no.crowded",
	"link-lines": "rich.no.linkLines",
	"link-brackets": "rich.no.linkBrackets",
	"link-image": "rich.no.linkImage",
	"bullet-kind": "rich.no.bulletKind",
};

/** The format a key asks for: Ctrl (Cmd on a Mac) with B, I or K, or with Shift and 8 for a bullet list; null for any other key. */
export function richKeyOf(evt: KeyboardEvent): RichAction | null {
	if (evt.isComposing || evt.altKey) return null;
	// on a Mac Ctrl+B and Ctrl+I are the caret's own (back one character, and a tab), so only Cmd; elsewhere Ctrl, never the Windows key
	if (Platform.isMacOS ? !evt.metaKey || evt.ctrlKey : !evt.ctrlKey || evt.metaKey) return null;
	if (evt.shiftKey) return evt.code === "Digit8" || evt.key === "*" ? "bullets" : null;
	const k = evt.key.toLowerCase();
	return k === "b" ? "bold" : k === "i" ? "italic" : k === "k" ? "link" : null;
}

/**
 * Puts `next` into the field in place of what it has, over only the stretch that differs, by the editing command route so that the
 * browser's own Undo in the field goes back one step per format (a plain `value =` would empty its undo history); a browser without the
 * command gets `setRangeText` and an input event, as typing would have raised.
 */
function putText(el: HTMLTextAreaElement, next: string): void {
	const old = el.value;
	let p = 0;
	while (p < old.length && p < next.length && old[p] === next[p]) p++;
	let q = 0;
	while (q < old.length - p && q < next.length - p && old[old.length - 1 - q] === next[next.length - 1 - q]) q++;
	// never between the two halves of a character
	if (p > 0 && /[\ud800-\udbff]/.test(old[p - 1] ?? "")) p--;
	if (q > 0 && /[\udc00-\udfff]/.test(old[old.length - q] ?? "")) q--;
	const from = p;
	const to = old.length - q;
	const text = next.slice(p, next.length - q);
	el.setSelectionRange(from, to);
	let done = false;
	try {
		const doc = el.ownerDocument;
		// the editing command is deprecated, but it is the one route that puts a change on the field's own Undo stack (setRangeText does not)
		const command = (doc as unknown as { execCommand?: (name: string, ui?: boolean, value?: string) => boolean }).execCommand;
		done = typeof command !== "function" ? false : text === "" ? command.call(doc, "delete") : command.call(doc, "insertText", false, text);
	} catch {
		done = false;
	}
	if (done && el.value === next) return;
	if (el.value !== next) {
		el.value = old;
		el.setRangeText(text, from, to, "end");
		el.dispatchEvent(new Event("input", { bubbles: true }));
	}
}

export class EditorBox {
	readonly box: HTMLElement;
	readonly area: HTMLTextAreaElement;
	/** The open block this box is for (the view keeps one box for as long as the same block is open). */
	get editing(): Editing {
		return this.ed;
	}
	private readonly state: HTMLElement;
	private readonly refusal: HTMLElement;
	private readonly noticeHost: HTMLElement;
	/** The small formatting bar over the words (Bold, Italic, Link, Bullets): always there while the block has words, so nothing moves when a field has the focus or loses it. */
	private readonly richBar: HTMLElement;
	private readonly richButtons = new Map<RichAction, HTMLButtonElement>();
	/** The field of words that has the focus now (the bar's buttons act on it), or null. */
	private richActive: Field | null = null;
	/** The key events that have been done as a format already (the scope and the field may both hear one). */
	private readonly keysDone = new WeakSet<Event>();
	private readonly wordsHost: HTMLElement;
	private readonly formHost: HTMLElement;
	private readonly rowsHost: HTMLElement;
	private readonly mediaHost: HTMLElement;
	private readonly helpsHost: HTMLElement;
	private readonly copyHost: HTMLElement;
	private readonly restNote: HTMLElement;
	private readonly md: HTMLDetailsElement;
	private readonly rows: RowsPanel;
	private readonly media: MediaPanel;
	private readonly helps: HelpsPanel;
	private readonly copy: CopyPanel;
	private node: DesignNode | null;
	private fields: Field[] = [];
	/** What each part was last drawn from: the shape of the words, of the settings strip and of the rows (words and marks are not in it). */
	private wordsShape = "";
	private formShape = "";
	private shown: string | null = null;
	private shownKind: DesignKind | null = null;
	private rowsState: RowsState = "none";
	private mediaState: MediaState = "none";
	private helpsState: HelpsState = "none";
	/** Updates what is not words (a switch, a choice) in the form rows that are drawn, from the note's lines. */
	private formSyncs: ((lines: string[]) => void)[] = [];
	/** True while the controls are put back to what the note has after a change that did not land (a picker with the focus goes back too). */
	private reverting = false;
	/** The control the focus goes to when the rows are drawn again for the change that is being made. */
	private wanted: string | null = null;
	/** The control that had the focus when the page was taken away, with its selection, to be put back by `attach`. */
	private lifted: { el: HTMLElement; sel: [number, number] | null } | null = null;
	/** The box has said once that text it holds was not applied: the next close goes ahead. */
	private warned = false;
	private saveHeld = false;

	/**
	 * @param node the block in the tree drawn now, or null when it is not there any more
	 * @param where "detached": the block is not on the page drawn, so the box stands above the page; "gone": the note has no such block
	 */
	constructor(
		private readonly host: EditHost,
		private readonly ed: Editing,
		node: DesignNode | null,
		parent: HTMLElement,
		where: "here" | "detached" | "gone",
	) {
		this.node = node;
		const name = node ? kindName(node) : ui("editor.detached.name");
		this.box = parent.createDiv({ cls: ["booklet-design-editbox", `is-kind-${ed.kind}`], attr: { role: "group", "aria-label": ui("editor.label", { name }) } });
		this.noticeHost = this.box.createDiv({ cls: "booklet-design-editor-moved" });
		this.noticeHost.hidden = true;
		this.richBar = this.box.createDiv({ cls: "booklet-design-richbar", attr: { role: "toolbar", "aria-label": ui("rich.bar") } });
		this.drawRichBar();
		this.wordsHost = this.box.createDiv({ cls: "booklet-design-edit-words" });
		this.rowsHost = this.box.createDiv({ cls: "booklet-design-edit-section is-rows booklet-design-rows booklet-design-settings" });
		this.mediaHost = this.box.createDiv({ cls: "booklet-design-edit-section is-media booklet-design-rows booklet-design-settings" });
		this.helpsHost = this.box.createDiv({ cls: "booklet-design-edit-section is-helps booklet-design-helps booklet-design-settings" });
		this.copyHost = this.box.createDiv({ cls: "booklet-design-edit-section is-copy booklet-design-rows booklet-design-settings" });
		this.restNote = this.box.createDiv({ cls: "booklet-design-edit-rest", text: ui("edit.rest") });
		this.restNote.hidden = true;
		this.rows = new RowsPanel(
			this.rowsHost,
			{
				note: () => host.text(),
				start: () => this.node?.start ?? null,
				lines: () => host.lines() ?? [],
				field: (el, make, back) => void this.field("rows", el, make, back),
				act: (make, focus) => this.act(make, focus),
				stash: () => ed.stash ?? null,
				setStash: (lines) => void (ed.stash = lines),
				openMenu: (line) => host.openMenu(line),
			},
			() => ed.kind,
		);
		this.media = new MediaPanel(this.mediaHost, {
			note: () => host.text(),
			start: () => this.node?.start ?? null,
			lines: () => host.lines() ?? [],
			field: (el, make, back) => void this.field("media", el, make, back),
			act: (make, focus) => this.act(make, focus),
			openMenu: (line) => host.openMenu(line),
		});
		this.helps = new HelpsPanel(
			this.helpsHost,
			{
				lines: () => host.lines() ?? [],
				field: (el, make, back, rich) => {
					const f = this.field("helps", el, make, back);
					if (rich) this.richen(f, rich);
				},
				act: (make, focus) => this.act(make, focus),
			},
			() => ed.kind,
		);
		this.copy = new CopyPanel(this.copyHost, { text: () => host.text(), node: () => host.node(), lines: () => host.lines() ?? [], act: (make, focus) => this.act(make, focus) });
		this.formHost = this.box.createDiv({ cls: "booklet-design-edit-section is-form" });
		this.refusal = this.box.createDiv({ cls: "booklet-design-edit-refusal", attr: { role: "status", "aria-live": "polite" } });
		this.state = this.box.createDiv({ cls: "booklet-design-editor-state", attr: { role: "status", "aria-live": "polite", "aria-label": ui("editor.status") } });
		// the Markdown: the block's own lines, in a section that is closed until it is opened by one press
		this.md = this.box.createEl("details", { cls: "booklet-design-edit-md" });
		this.md.createEl("summary", { text: ui("edit.markdown") });
		this.area = this.md.createEl("textarea", {
			cls: "booklet-design-textarea",
			attr: { "aria-label": ui("editor.textarea", { name }), spellcheck: "false", autocapitalize: "off", autocomplete: "off", autocorrect: "off", rows: "3", "data-focus": "editor" },
		});
		this.area.spellcheck = false;
		const foot = this.box.createDiv({ cls: "booklet-design-edit-foot" });
		foot.createSpan({ cls: "booklet-design-edit-hint", text: ui("edit.keys") });

		// the Markdown is a control of words like the others: applied when it is left, and by Esc and Ctrl/Cmd+Enter
		this.field(
			"area",
			this.area,
			(value, lines, was) => (lines.join("\n") !== was ? { ok: false, reason: ui("edit.changed"), keep: true } : { ok: true, lines: linesOfText(value) }),
			(lines) => lines.join("\n"),
		);

		// the box's keys are its own: the view's hotkeys do not hear them (see the view's `keyPress`); only Escape is the editor's here, and
		// Ctrl or Cmd with Enter, which Obsidian's own hotkeys take before the box hears it (see the view's `holdSaveKey`), but is kept as a fallback
		this.box.addEventListener("keydown", (evt) => {
			if (evt.key === "Escape" || (evt.key === "Enter" && (evt.ctrlKey || evt.metaKey))) {
				evt.preventDefault();
				evt.stopPropagation();
				host.confirm();
			}
		});
		this.box.addEventListener("focusin", (evt) => {
			this.holdSave();
			this.syncBar(evt.target as Element | null);
		});
		this.box.addEventListener("focusout", (evt) => {
			const to = evt.relatedTarget as Node | null;
			if (!to || !this.box.contains(to)) this.releaseSave();
			this.syncBar(to && to.nodeType === 1 ? (to as Element) : null);
		});
		this.place(where);
		this.render(this.host.lines() ?? [], true);
	}

	private holdSave(): void {
		if (this.saveHeld) return;
		this.saveHeld = true;
		this.host.hold();
	}

	private releaseSave(): void {
		if (!this.saveHeld) return;
		this.saveHeld = false;
		this.host.release();
	}

	// ---------------------------------------------------------------- living across the view's drawings

	/** The view is about to take the page away: the focus is noted (it is put back by `attach`). */
	lift(): void {
		const at = this.box.ownerDocument.activeElement;
		this.lifted = null;
		if (at && this.box.contains(at)) {
			const el = at as HTMLInputElement;
			this.lifted = { el: at as HTMLElement, sel: typeof el.selectionStart === "number" && typeof el.selectionEnd === "number" ? [el.selectionStart, el.selectionEnd] : null };
		}
		this.releaseSave();
	}

	/** The page is drawn again and the box goes back into it: the same elements, with what the note says now put into them. */
	attach(node: DesignNode | null, parent: HTMLElement, where: "here" | "detached" | "gone"): void {
		this.node = node;
		parent.appendChild(this.box);
		this.place(where);
		this.render(this.host.lines() ?? [], false);
		const at = this.lifted;
		this.lifted = null;
		// the focus goes back to where it was only when the drawing did not put it somewhere (the control a change was made in)
		const now = this.box.ownerDocument.activeElement;
		if (at && at.el.isConnected && !(now && now !== at.el && this.box.contains(now))) {
			at.el.focus();
			if (at.sel) (at.el as HTMLInputElement).setSelectionRange(at.sel[0], at.sel[1]);
		}
	}

	private place(where: "here" | "detached" | "gone"): void {
		this.box.toggleClass("is-detached", where !== "here");
		if (where === "gone") this.moved(ui("editor.moved"));
		else if (where === "detached") this.moved(ui("editor.elsewhere"));
		else this.moved("");
	}

	private moved(words: string): void {
		this.noticeHost.hidden = !words;
		this.noticeHost.setText(words);
	}

	/** Lets go of what the box holds. */
	dispose(): void {
		this.releaseSave();
	}

	// ---------------------------------------------------------------- what is typed

	private field(part: Field["part"], el: HTMLInputElement | HTMLTextAreaElement, make: Field["make"], back: Field["back"]): Field {
		const f: Field = { el, part, sent: el.value, was: el.value, make, back, held: false, applying: false };
		this.fields.push(f);
		el.addEventListener("input", () => {
			// typing again: what was held is the person's to settle, and a close is not warned about any more
			f.held = false;
			this.warned = false;
			this.say("");
			if (part === "area") this.area.rows = Math.min(30, Math.max(3, this.area.value.split("\n").length + 1));
			else if (part === "words" || part === "helps") fit(el);
		});
		// leaving the control (or Enter in a one-line one) hands it over; nothing runs here
		el.addEventListener("change", () => this.leave(f));
		// a one-line control: an input, or the title (a text area that wraps its words like the drawn title does, and takes no line break)
		if (el.tagName === "INPUT" || el.hasAttribute("data-oneline"))
			el.addEventListener("keydown", (evt: Event) => {
				const key = evt as KeyboardEvent;
				if (key.key !== "Enter" || key.ctrlKey || key.metaKey || key.altKey || key.shiftKey || key.isComposing) return;
				evt.preventDefault();
				this.leave(f);
			});
		return f;
	}

	private leave(f: Field): void {
		if (!this.fields.includes(f) || f.el.value === f.sent) return;
		void this.host.queue(() => this.applyField(f));
	}

	private owes(f: Field): boolean {
		return f.el.value !== f.sent && !f.held;
	}

	/** Has any control of words typing in it that is not applied? */
	dirty(): boolean {
		return this.fields.some((f) => this.owes(f));
	}

	/** Does the box hold typing that could not be applied (and stays in its control)? */
	holds(): boolean {
		return this.fields.some((f) => f.held);
	}

	/** The text that is held, for a notice when the view closes with it. */
	heldText(): string {
		return this.fields
			.filter((f) => f.held)
			.map((f) => f.el.value)
			.join("\n");
	}

	/**
	 * A close was asked for while text is held: the first time says so and does not close; the next goes ahead. Gives true when the
	 * close may go ahead.
	 */
	mayClose(): boolean {
		if (!this.holds() || this.warned) return true;
		this.warned = true;
		this.host.say(ui("editor.busy"));
		return false;
	}

	/** Applies every control that is owed, in the order they stand. Runs in the view's lane. */
	async applyAll(): Promise<void> {
		for (const f of [...this.fields]) if (this.owes(f)) await this.applyField(f);
	}

	private async applyField(f: Field): Promise<void> {
		// while it is being applied the control is still the person's: a drawing made for the write puts nothing into it
		f.applying = true;
		try {
			await this.applyFieldTries(f);
		} finally {
			f.applying = false;
			// a drawing made for the write left a part undrawn because this control was being applied (typing an address into a listen with no
			// media adds a line, and so changes the shape of the part the control is in): it is drawn now
			if (this.shown === null && this.fields.includes(f)) this.render(this.host.lines() ?? [], false);
		}
	}

	private async applyFieldTries(f: Field): Promise<void> {
		for (let tries = 0; tries < 3; tries++) {
			const value = f.el.value;
			// on the first try a control that is as it was handed over has nothing to apply; a retry is the same typing again
			if ((tries === 0 && value === f.sent) || !this.fields.includes(f)) return;
			const cur = this.host.lines();
			if (!cur) return this.hold(f, ui("editor.moved"));
			const made = f.make(value, cur, f.was);
			if (!made.ok) {
				if (made.keep) return this.hold(f, made.reason);
				// refused: the note is as it was, the reason is said, and the control goes back to what the note has
				f.sent = value;
				this.showRefusal(made.reason);
				return this.putBack(f, cur);
			}
			f.sent = value;
			if (sameLines(made.lines, cur)) return this.putBack(f, cur);
			this.showRefusal("");
			const out = await this.host.change(made.lines);
			if (out === "stale") continue; // the note changed under the write: the same typing, made again on the note as it is now
			if (out === "landed") {
				// what the note has for the control now (the format may have written it a little differently from what was typed)
				const now = this.host.lines();
				const back = now ? f.back(now) : null;
				if (back !== null) {
					f.was = back;
					// the control shows the note's words, not the typing: the drawing made for the write left it alone (it was being applied),
					// and typing that the format took differently (a title trimmed, Markdown whose last lines are another block's now) is read back
					if (f.el.value === value && back !== value) {
						f.el.value = back;
						f.sent = back;
						if (f.part === "area") this.area.rows = Math.min(30, Math.max(3, back.split("\n").length + 1));
						else if (f.part === "words" || f.part === "helps") fit(f.el);
					}
				}
				made.landed?.();
			} else if (out !== "unchanged") this.putBack(f, this.host.lines());
			return;
		}
		// the note kept changing under it: the typing stays where it is
		this.hold(f, ui("edit.changed"));
	}

	/** The control shows what the note has for it again (its typing was not applied, and was said not to be). */
	private putBack(f: Field, lines: string[] | null): void {
		const back = lines ? f.back(lines) : null;
		if (back !== null) f.el.value = back;
		f.sent = f.was = f.el.value;
		f.held = false;
	}

	/** Typing that cannot be applied stays in its control; the reason is said in the box and in the status line. */
	private hold(f: Field, reason: string): void {
		f.sent = f.el.value;
		f.held = true;
		this.warned = false;
		this.say(reason);
		this.host.say(reason);
	}

	/** One change from a press (a switch, a button, a choice): made on the block's lines as they are when it runs, after what is typed is applied. */
	private act(make: (lines: string[]) => Made, focus: string | null): void {
		void this.host.queue(async () => {
			await this.applyAll();
			for (let tries = 0; tries < 3; tries++) {
				const cur = this.host.lines();
				if (!cur) return this.say(ui("editor.moved"));
				const made = make(cur);
				if (!made.ok) {
					this.showRefusal(made.reason);
					this.resync();
					return;
				}
				if (sameLines(made.lines, cur)) return;
				this.showRefusal("");
				this.wanted = focus;
				let out: Outcome = "failed";
				try {
					out = await this.host.change(made.lines);
				} finally {
					// the drawing for a landed change may wait for the pointer to be up (the view's `requestDraw`): the box draws it, and lets go of this then
					if (out !== "landed") this.wanted = null;
				}
				if (out === "stale") continue;
				if (out === "landed") made.landed?.();
				else if (out !== "unchanged") this.resync();
				return;
			}
		});
	}

	/** Said in the box, under its controls (a refusal, or typing that is held). */
	private say(words: string): void {
		this.state.setText(words);
	}

	private showRefusal(reason: string): void {
		this.refusal.setText(reason ? ui("form.refused", { reason }) : "");
	}

	/** After a change that did not land: what the note has goes back into every control. */
	private resync(): void {
		// a change that did not land: even a picker the person still has the focus on goes back to what the note has (it would else say what was declined)
		this.reverting = true;
		try {
			this.render(this.host.lines() ?? [], true);
		} finally {
			this.reverting = false;
		}
	}

	/** The Markdown section opens and has the focus (the bar's "Edit as Markdown"). */
	openMarkdown(): void {
		this.md.open = true;
		this.area.focus();
	}

	/** The focus goes to the block's first words (its title, else its description), or to the Markdown when nothing else of it can be edited in place. */
	focus(): void {
		const first = this.fields.find((f) => f.part === "words");
		if (first) return first.el.focus();
		this.md.open = true;
		this.area.focus();
	}

	// ---------------------------------------------------------------- the controls, from the note

	/**
	 * Puts the note's lines for the block into the box. A part whose SHAPE is what is drawn gets its words and marks put into the
	 * controls it has (the ones with typing in them are left alone); a part whose shape changed is drawn again. A part with typing in it is
	 * not drawn again at all, and the box tries it again the next time.
	 */
	private render(lines: string[], force: boolean): void {
		const joined = lines.join("\n");
		if (!force && joined === this.shown && this.ed.kind === this.shownKind) return;
		let complete = true;
		if (this.shownKind !== null && this.shownKind !== this.ed.kind) {
			this.box.removeClass(`is-kind-${this.shownKind}`);
			this.box.addClass(`is-kind-${this.ed.kind}`);
		}
		// the words first: the title and the description, or the reason the block is edited as Markdown
		const cap = this.capOf(lines);
		// the bar is there for as long as the block has words to format, whatever has the focus (it never comes and goes under a press)
		this.richBar.hidden = cap.why !== null || (!cap.title && !cap.desc);
		const capShape = JSON.stringify(cap);
		if (capShape !== this.wordsShape) {
			if (this.anyTyping("words")) complete = false;
			else {
				this.fields = this.fields.filter((f) => f.part !== "words");
				this.drawWords(cap, lines);
				this.wordsShape = capShape;
				// a block with nothing else of it to edit in place shows its Markdown open, with the reason
				this.md.open = cap.why !== null || (!cap.title && !cap.desc && this.ed.kind !== "front-matter");
			}
		}
		this.formHost.hidden = cap.why !== null;
		this.rowsHost.hidden = cap.why !== null;
		this.mediaHost.hidden = cap.why !== null;
		// the rows next: when they are offered they hold the shared menu, which the settings then leave out
		if (this.rows.differs(lines) || this.shownKind !== this.ed.kind) {
			if (this.anyTyping("rows")) complete = false;
			else {
				this.fields = this.fields.filter((f) => f.part !== "rows");
				this.rowsState = this.rows.draw(lines, this.wanted);
				// the rows say the block is edited in the Markdown below: the section opens, so what the words point at is there
				if (this.rowsState === "refused") this.md.open = true;
			}
		} else this.rows.sync(lines);
		// a listen's media and a widget's data block next
		if (this.media.differs(lines) || this.shownKind !== this.ed.kind) {
			if (this.anyTyping("media")) complete = false;
			else {
				this.fields = this.fields.filter((f) => f.part !== "media");
				this.mediaState = this.media.draw(lines, this.wanted);
				if (this.mediaState === "unshown") this.md.open = true;
			}
		} else this.media.sync(lines);
		// a question's hint and solution next, and a copy button's list of what it copies
		if (this.helps.differs(lines) || this.shownKind !== this.ed.kind) {
			if (this.anyTyping("helps")) complete = false;
			else {
				this.fields = this.fields.filter((f) => f.part !== "helps");
				this.helpsState = this.helps.draw(lines, this.wanted);
				// a hint or solution that holds more than words, or lines that cannot be carved, are edited in the Markdown: the section opens, so they are there
				if (this.helpsState === "refused" || this.helpsState === "some") this.md.open = true;
			}
		} else this.helps.sync(lines);
		this.helpsHost.hidden = cap.why !== null;
		this.copyHost.hidden = cap.why !== null;
		if (this.copy.differs(lines) || this.shownKind !== this.ed.kind) this.copy.draw(lines, this.wanted);
		const shape = this.shapeOfForm(lines);
		if (shape !== this.formShape) {
			if (this.anyTyping("form")) complete = false;
			else {
				this.fields = this.fields.filter((f) => f.part !== "form");
				this.drawForm(lines);
				this.formShape = shape;
			}
		} else for (const sync of this.formSyncs) sync(lines);
		// the words of every control that is not being typed in
		for (const f of this.fields) {
			if (!f.el.isConnected || f.held || f.applying || f.el.value !== f.sent) continue;
			const back = f.back(lines);
			if (back === null) continue;
			if (f.el.value !== back) f.el.value = back;
			f.sent = f.was = back;
		}
		for (const f of this.fields) if (f.part === "words" || f.part === "helps") fit(f.el);
		this.area.rows = Math.min(30, Math.max(3, this.area.value.split("\n").length + 1));
		this.restNote.hidden = !(cap.why === null && this.rowsState !== "rows" && this.undrawn(lines));
		this.shown = complete ? joined : null;
		this.shownKind = this.ed.kind;
		// the control the person is working in keeps the focus (a click does not always give it, and a part drawn again lost it). It is asked for
		// by the change that is being made, and only the drawing that has the control gives it: a drawing made for an EARLIER write (the one the
		// typing before a press asked for, held until the pointer was up) comes while the new change is under way, finds no such control yet,
		// and leaves the wish for the drawing of the change itself (found in the real app: the focus was lost about one press in three)
		const want = this.wanted ? this.box.querySelector<HTMLElement>(`[data-key="${this.wanted}"]`) : null;
		if (want) {
			want.focus();
			this.wanted = null;
		}
		this.syncBar(this.box.ownerDocument.activeElement);
	}

	// ---------------------------------------------------------------- the formatting bar: Markdown markers, nothing else

	/** The buttons: Bold, Italic, Link, Bullets. A press never takes the focus from the field (see `drawRichBar`), so the selection it acts on is kept. */
	private drawRichBar(): void {
		const chord = (k: string): string => `${Platform.isMacOS ? "\u2318" : "Ctrl+"}${k}`;
		const make = (what: RichAction, key: DesignKey, glyph: string | string[], shortcut: string, aria: string): void => {
			const label = ui(key);
			const b = this.richBar.createEl("button", {
				cls: ["booklet-design-rich-button", `is-${what}`],
				// the keys are the way in for the keyboard, so the buttons stay out of the Tab order (they are for the pointer and the finger)
				attr: { type: "button", tabindex: "-1", "aria-label": label, "aria-disabled": "true", "aria-keyshortcuts": aria, title: `${label} (${shortcut})`, "data-rich": what },
			});
			if (typeof glyph === "string") b.createSpan({ cls: `booklet-design-rich-glyph is-${what}`, text: glyph, attr: { "aria-hidden": "true" } });
			else if (!drawIcon(b, glyph)) b.setText(label);
			// the press does not move the focus: the field keeps it and its selection (a press right after typing is not lost, and nothing is
			// redrawn for it); a touch is the same, since the focus moves on the mouse event it makes
			b.addEventListener("pointerdown", (evt) => evt.preventDefault());
			b.addEventListener("mousedown", (evt) => evt.preventDefault());
			b.addEventListener("click", () => this.formatBy(what));
			this.richButtons.set(what, b);
		};
		make("bold", "rich.bold", "B", chord("B"), `${Platform.isMacOS ? "Meta" : "Control"}+B`);
		make("italic", "rich.italic", "I", chord("I"), `${Platform.isMacOS ? "Meta" : "Control"}+I`);
		make("link", "rich.link", ["link"], chord("K"), `${Platform.isMacOS ? "Meta" : "Control"}+K`);
		make("bullets", "rich.bullets", ["list"], chord("Shift+8"), `${Platform.isMacOS ? "Meta" : "Control"}+Shift+8`);
		this.richBar.hidden = true;
	}

	/** Gives a field of words the formatting keys, and applies it when it is left even if its words were changed by the bar (which does not raise a change event). */
	private richen(f: Field, where: RichWhere): void {
		f.el.setAttribute("data-rich", where);
		f.el.addEventListener("keydown", (evt: Event) => {
			const what = richKeyOf(evt as KeyboardEvent);
			if (!what || !richTakes(where, what)) return;
			evt.preventDefault();
			evt.stopPropagation();
			if (this.keysDone.has(evt)) return;
			this.keysDone.add(evt);
			this.formatBy(what);
		});
		f.el.addEventListener("blur", () => this.leave(f));
	}

	/** Which buttons are on: only while a field of words has the focus, and bullets only in a field of prose. */
	private syncBar(target: Element | null): void {
		const f = target ? (this.fields.find((x) => x.el === target && x.el.hasAttribute("data-rich")) ?? null) : null;
		this.richActive = f;
		const where = f ? (f.el.getAttribute("data-rich") as RichWhere) : null;
		for (const [what, b] of this.richButtons) b.setAttribute("aria-disabled", where && richTakes(where, what) ? "false" : "true");
	}

	/**
	 * A formatting chord heard by the view's scope (the app's key map takes these chords before a field hears them, see the view's
	 * `holdSaveKey`): gives true when it was a format of the field that has the focus, and has done it. Each event is done once, whichever of
	 * the scope and the field heard it.
	 */
	formatKey(evt: KeyboardEvent): boolean {
		const f = this.richActive;
		const what = richKeyOf(evt);
		if (!f || !what || !richTakes(f.el.getAttribute("data-rich") as RichWhere, what)) return false;
		if (!this.keysDone.has(evt)) {
			this.keysDone.add(evt);
			this.formatBy(what);
		}
		return true;
	}

	/** A format asked for by a button or a key: the field's text and selection become what the core says, or why not is said. */
	private formatBy(what: RichAction): void {
		const f = this.richActive;
		if (!f || !f.el.isConnected) return;
		const el = f.el as HTMLTextAreaElement;
		const where = el.getAttribute("data-rich") as RichWhere;
		if (!richTakes(where, what)) return;
		const r = richFormat(el.value, el.selectionStart, el.selectionEnd, what, where);
		if (!r.ok) {
			this.host.say(ui(REFUSAL_WORDS[r.code]));
			return;
		}
		if (r.changed) putText(el, r.text);
		el.setSelectionRange(r.start, r.end);
	}

	/** What the fields can show of these lines: a title and a description for a question, a callout or a prose block; a title for any other Booklet line. */
	private capOf(lines: string[]): Cap {
		const kind = this.ed.kind;
		if (kind === "front-matter") return { title: false, desc: null, why: null };
		if (kind === "question" || kind === "callout" || kind === "prose") {
			const p = readParts(lines, kind);
			if ("refused" in p) return { title: false, desc: null, why: p.refused };
			return { title: p.title !== null, desc: p.described ? (kind === "question" ? "help" : "words") : null, why: null };
		}
		return { title: !!formOfLine(lines[0] ?? ""), desc: null, why: null };
	}

	/** Does the block have lines under its description that no field of the box shows (they are edited in the Markdown)? */
	private undrawn(lines: string[]): boolean {
		const kind = this.ed.kind;
		if (kind !== "question") return false;
		const p = readParts(lines, kind);
		if ("refused" in p) return false;
		// the hint and the solution under the question have fields of their own, when they are drawn
		const helps = this.helpsState === "helps" || this.helpsState === "some" ? readHelps(lines) : null;
		const mine = helps && !("refused" in helps) ? helps.at : lines.length;
		return p.rest.some((l, i) => filled(l) && p.to + i !== p.mediaAt && p.to + i < mine);
	}

	/** The title and the description, drawn as fields in the block's own type; or, for a block they cannot show, the reason in words. */
	private drawWords(cap: Cap, lines: string[]): void {
		const host = this.wordsHost;
		host.empty();
		host.toggleClass("is-empty", !cap.title && !cap.desc && !cap.why);
		const kind = this.ed.kind;
		if (cap.why !== null) {
			host.createDiv({ cls: "booklet-design-edit-why", text: ui("edit.markdownOnly", { reason: cap.why }) });
			return;
		}
		const field = (cls: string, label: string, hint: string, value: string, oneLine_: boolean): HTMLTextAreaElement => {
			const el = host.createEl("textarea", { cls: ["booklet-design-field", cls], attr: { rows: "1", "aria-label": label, placeholder: hint, spellcheck: "true", "data-field": cls === "is-title" ? "title" : "description" } });
			if (oneLine_) el.setAttribute("data-oneline", "1");
			el.value = value;
			return el;
		};
		if (cap.title) {
			const el = field("is-title", ui("form.title"), ui("form.title"), this.valueOf(lines, { type: "title" }) ?? "", true);
			this.richen(
				this.field(
					"words",
					el,
					(value, cur) => this.formChange(cur, { what: "title", value: oneLine(value).trim() }),
					(cur) => this.valueOf(cur, { type: "title" }),
				),
				"title",
			);
		}
		if (cap.desc) {
			const p = readParts(lines, kind);
			const el = field("is-desc", ui(cap.desc === "help" ? "edit.desc" : "edit.words"), ui(cap.desc === "help" ? "edit.desc" : "edit.words"), "refused" in p ? "" : p.description, false);
			this.richen(this.field(
				"words",
				el,
				(value, cur, was) => {
					const now = readParts(cur, this.ed.kind);
					// the description on screen is the note's: else it is not known which words this typing was for
					if ("refused" in now || now.description !== was) return { ok: false, reason: ui("edit.changed"), keep: true };
					const made = writeDescription(cur, this.ed.kind, value);
					return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
				},
				(cur) => {
					const now = readParts(cur, this.ed.kind);
					return "refused" in now || !now.described ? null : now.description;
				},
			), cap.desc === "help" ? "help" : "prose");
		}
	}

	private anyTyping(part: Field["part"]): boolean {
		return this.fields.some((f) => f.part === part && (f.el.value !== f.sent || f.held || f.applying));
	}

	/** The shape of the settings rows: which rows there are (their words are not part of it). */
	private shapeOfForm(lines: string[]): string {
		if (this.ed.kind === "front-matter") {
			const f = frontMatterFormOfLines(lines);
			return f ? JSON.stringify([f.marker, f.fields.map((x) => [x.key, x.type, x.locked ? x.value : "", x.options ?? null]), f.other.map((o) => [o.key, o.text])]) : "none";
		}
		const form = formOfLine(lines[0] ?? "");
		if (!form) return "none";
		return JSON.stringify([this.rowsState, form.kind, form.known, form.fields.map((x) => (x.type === "id" || x.type === "title" ? [x.type] : [x.type, x.name])), form.stray.map((w) => [w.index, w.text]), this.host.bar()]);
	}

	/** The settings rows, from the block's opening line (or its front matter), drawn again with the focus put back on the row that had it. */
	private drawForm(lines: string[]): void {
		const doc = this.formHost.ownerDocument;
		const active = doc.activeElement;
		const key = active && this.formHost.contains(active) ? (active.closest("[data-field]")?.getAttribute("data-field") ?? null) : null;
		this.formHost.empty();
		this.formSyncs = [];
		this.formHost.toggleClass("booklet-design-settings", this.ed.kind === "front-matter");
		if (this.ed.kind === "front-matter") {
			const form = frontMatterFormOfLines(lines);
			if (form) this.drawFrontRows(form);
		} else this.drawStrip(formOfLine(lines[0] ?? ""), this.rowsState === "rows");
		this.formHost.toggleClass("is-empty", !this.formHost.childElementCount);
		if (key) {
			const row = Array.from(this.formHost.querySelectorAll<HTMLElement>("[data-field]")).find((e) => e.getAttribute("data-field") === key);
			row?.querySelector<HTMLElement>("input, select, button")?.focus();
		}
	}

	/** One row of a Booklet line's settings: the line's own words changed by core, on the block's lines as they are. */
	private formChange(lines: string[], change: FormChange): Made {
		if (change.what === "id") {
			const node = this.host.node();
			if (node) {
				const clash = formIdClash(this.host.text(), node, change.value);
				if (clash) return { ok: false, reason: clash };
			}
		}
		const made = applyFormChange(lines, change);
		return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
	}

	/** The value a settings row of the note has: its `back`. */
	private valueOf(lines: string[], f: { type: "id" | "title" } | { type: "value"; name: string }): string | null {
		const form = formOfLine(lines[0] ?? "");
		const hit = form?.fields.find((x) => (f.type === "value" ? x.type === "value" && x.name === f.name : x.type === f.type));
		return hit && (hit.type === "id" || hit.type === "title" || hit.type === "value") ? hit.value : null;
	}

	/**
	 * The strip under the block's words: the rest of its opening line (its id, its switches, its values and the words its kind does not
	 * take, one small control each; the title is a field above) and, at its end, the move and delete buttons. A block with no Booklet line
	 * has only the buttons.
	 */
	private drawStrip(form: Form | null, menuInRows: boolean): void {
		const strip = this.formHost.createDiv({ cls: "booklet-design-strip" });
		const item = (name: string, label: string, cls?: string): HTMLElement => {
			const el = strip.createDiv({ cls: cls ? ["booklet-design-strip-item", cls] : "booklet-design-strip-item", attr: { "data-field": name } });
			el.createSpan({ cls: "booklet-design-strip-label", text: label });
			return el;
		};
		// what the stage 4 controls (the fold switch, the pickers, the kept entries' switch) ask of the box
		const ctx: StripCtx = {
			text: () => this.host.text(),
			node: () => this.host.node(),
			lines: () => this.host.lines() ?? [],
			act: (make, focus) => this.act(make, focus),
			change: (lines, change) => this.formChange(lines, change),
			valueOf: (lines, name) => this.valueOf(lines, { type: "value", name }),
			sync: (fn) => void this.formSyncs.push(fn),
			reverting: () => this.reverting,
			item,
		};
		const text = (el: HTMLElement, label: string, value: string): HTMLInputElement => {
			const input = el.createEl("input", { cls: "booklet-design-strip-input", attr: { type: "text", "aria-label": label, spellcheck: "false", autocomplete: "off" } });
			input.value = value;
			return input;
		};
		for (const f of form?.fields ?? []) {
			if (f.type === "title" || (menuInRows && f.type === "value" && f.name === "menu")) continue;
			if (f.type === "id") {
				const el = item("id", ui("form.id"));
				// a change is made when the box is left or Enter is pressed, never on each key typed
				this.field(
					"form",
					text(el, ui("form.id"), f.value),
					(value, lines) => this.formChange(lines, { what: "id", value: value.trim() }),
					(lines) => this.valueOf(lines, { type: "id" }),
				);
			} else if (f.type === "flag") {
				const name = f.name;
				const el = strip.createDiv({ cls: "booklet-design-strip-item is-switch", attr: { "data-field": name } });
				const sw = el.createEl("button", { text: settingName(name), cls: "booklet-design-strip-switch", attr: { type: "button", role: "switch", "aria-checked": String(f.on) } });
				sw.addEventListener("click", () =>
					this.act((lines) => {
						const now = formOfLine(lines[0] ?? "")?.fields.find((x) => x.type === "flag" && x.name === name);
						return this.formChange(lines, { what: "flag", name, on: !(now && now.type === "flag" && now.on) });
					}, null),
				);
				this.formSyncs.push((lines) => {
					const now = formOfLine(lines[0] ?? "")?.fields.find((x) => x.type === "flag" && x.name === name);
					if (now && now.type === "flag") sw.setAttribute("aria-checked", String(now.on));
				});
			} else if (f.name === "each") {
				this.drawEach(item("each", settingName("each")), f.value);
			} else if (form?.kind === "activity" && f.name === "tab") {
				drawTabPicker(ctx);
			} else if (form?.kind === "activity" && f.name === "entries") {
				drawEntriesSwitch(ctx);
			} else if (form?.kind === "page" && f.name === "parent") {
				drawParentPicker(ctx);
			} else if (form?.kind === "copy" && f.name === "of") {
				// a copy button's list of what it copies has a part of its own (the `copy` list above the strip)
				continue;
			} else {
				const name = f.name;
				const el = item(name, f.icon ? ui("form.icon") : settingName(name));
				const input = text(el, f.icon ? ui("form.icon") : settingName(name), f.value);
				if (f.numeric) input.inputMode = "decimal";
				else if (WHOLE_SETTINGS.has(name)) input.inputMode = "numeric";
				this.field(
					"form",
					input,
					(value, lines) => this.formChange(lines, { what: "value", name, value: value.trim() }),
					(lines) => this.valueOf(lines, { type: "value", name }),
				);
				if (f.icon) {
					const b = el.createEl("button", { text: ui("form.icon.choose"), cls: "booklet-design-strip-button", attr: { type: "button", "aria-label": ui("form.icon.choose.label") } });
					b.addEventListener("click", () => {
						void pickIcon(this.host.app, this.valueOf(this.host.lines() ?? [], { type: "value", name }) ?? "").then((icon) => {
							if (icon !== null) this.act((lines) => this.formChange(lines, { what: "value", name: "icon", value: icon }), null);
						});
					});
				}
			}
		}
		if (form) drawFoldSwitch(ctx);
		for (const w of form?.stray ?? []) {
			const el = strip.createDiv({ cls: "booklet-design-strip-item is-stray", attr: { "data-field": `stray-${w.index}`, role: "group", title: ui("form.stray"), "aria-label": ui("form.stray") } });
			el.createSpan({ cls: "booklet-design-strip-label", text: w.text });
			const b = el.createEl("button", { text: ui("form.stray.remove"), cls: "booklet-design-strip-button", attr: { type: "button", "aria-label": ui("form.stray.remove.label", { word: w.text }) } });
			// the word is removed only if it is still the word at that place in the note
			b.addEventListener("click", () =>
				this.act((lines) => {
					const now = formOfLine(lines[0] ?? "")?.stray.find((x) => x.index === w.index);
					return now && now.text === w.text ? this.formChange(lines, { what: "stray", index: w.index }) : { ok: false, reason: ui("edit.changed") };
				}, null),
			);
		}
		const bar = this.host.bar();
		if (bar && (bar.move || bar.del)) {
			const acts = strip.createDiv({ cls: "booklet-design-strip-actions", attr: { role: "toolbar", "aria-label": ui("edit.bar") } });
			const button = (what: "up" | "down" | "delete", icons: string[], label: string, on: boolean): void => {
				const b = acts.createEl("button", { cls: ["booklet-design-strip-button", `is-${what}`], attr: { type: "button", "aria-label": label, title: label } });
				if (!drawIcon(b, icons)) b.setText(label);
				b.disabled = !on;
				b.addEventListener("click", () => this.host.press(what));
			};
			if (bar.move) {
				button("up", ["arrow-up", "chevron-up"], ui("act.up"), bar.up);
				button("down", ["arrow-down", "chevron-down"], ui("act.down"), bar.down);
			}
			if (bar.del) button("delete", ["trash-2", "trash"], ui("act.delete"), true);
		}
		if (strip.childElementCount) quietNames(strip);
		else strip.remove();
	}

	/**
	 * The `each:` picker: the choice, multi or widget of the question's activity, or the data block in reach, that this question is asked
	 * for each pick (or row) of; "nothing" takes the setting off. A source the line names that the note does not offer is listed too, so
	 * the picker says what the line says (and the linter would report). It is applied the moment it is chosen, as the shared-menu picker is.
	 */
	private drawEach(el: HTMLElement, value: string): void {
		const sel = el.createEl("select", { cls: "booklet-design-strip-input", attr: { "aria-label": settingName("each"), "data-key": "each" } });
		const fill = (): void => {
			const now = sel.value;
			const node = this.node;
			const sources = node ? eachSourcesFor(this.host.text(), node.start) : [];
			const wanted = this.valueOf(this.host.lines() ?? [], { type: "value", name: "each" }) ?? value;
			const options: [string, string][] = [["", ui("each.none")]];
			for (const s of sources) options.push([s.id, s.kind === "data" ? ui("each.data", { id: s.id }) : ui("each.kind", { id: s.id, kind: s.kind })]);
			if (wanted && !sources.some((s) => s.id === wanted)) options.push([wanted, ui("rows.menu.missing", { id: wanted })]);
			// the list is made again only when it has changed: a list taken away under a press would swallow it
			const sig = JSON.stringify(options);
			if (sel.dataset["sig"] === sig) return;
			sel.dataset["sig"] = sig;
			sel.empty();
			for (const [v, label] of options) sel.createEl("option", { value: v, text: label });
			sel.value = now && options.some(([v]) => v === now) ? now : wanted;
		};
		fill();
		sel.value = value;
		// the list is looked at again when the person goes to it, so a question added since the box was drawn is in it
		sel.addEventListener("focus", fill);
		sel.addEventListener("mousedown", fill);
		sel.addEventListener("change", () => {
			const chosen = sel.value;
			this.act((lines) => this.formChange(lines, { what: "value", name: "each", value: chosen }), "each");
		});
		this.formSyncs.push((lines) => {
			const now = this.valueOf(lines, { type: "value", name: "each" }) ?? "";
			fill();
			if (sel.value !== now && (this.reverting || sel.ownerDocument.activeElement !== sel)) sel.value = now;
		});
	}

	private frontValue(lines: string[], key: string): string | null {
		const hit = frontMatterFormOfLines(lines)?.fields.find((x) => x.key === key);
		return hit ? hit.value : null;
	}

	private changeFront(lines: string[], key: string, value: string): Made {
		const made = applyFrontMatterChange(lines, { key, value });
		return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
	}

	private drawFrontRows(form: FrontMatterForm): void {
		const host = this.formHost;
		new Setting(host).setName(ui("form.heading")).setHeading();
		if (form.marker) {
			const row = new Setting(host).setName(MARKER_KEY).setDesc(`${form.marker}. ${ui("form.fm.marker")}`);
			row.settingEl.setAttribute("data-field", "marker");
		}
		for (const f of form.fields) {
			const key = f.key;
			const row = new Setting(host).setName(key);
			row.settingEl.setAttribute("data-field", key);
			if (f.locked) {
				row.setDesc(f.locked);
				row.addText((c) => c.setValue(f.value).setDisabled(true));
				continue;
			}
			if (f.type === "choice") {
				row.addDropdown((c) => {
					for (const o of f.options ?? []) c.addOption(o, o === "" ? ui("form.fm.none") : o);
					c.setValue(f.value);
					c.onChange((v) => this.act((lines) => this.changeFront(lines, key, v), null));
					this.formSyncs.push((lines) => {
						const now = this.frontValue(lines, key);
						if (now !== null && c.getValue() !== now) c.setValue(now);
					});
				});
				continue;
			}
			row.addText((c) => {
				c.setValue(f.value);
				this.field(
					"form",
					c.inputEl,
					(value, lines) => this.changeFront(lines, key, value.trim()),
					(lines) => this.frontValue(lines, key),
				);
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
}
