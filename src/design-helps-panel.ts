/*
 * The hint and the solution of a question, in the Design view's editor in place: for each of the two, its title, its words, a switch for
 * whether it starts folded, and a button that takes it out; where there is none, a button that adds one. Like the media part
 * (design-media-panel.ts) it holds no copy of the text: it is drawn from the note's own lines, and every change is made on the note's lines
 * as they are when it is made (core `writeHelpWords`, `writeHelpTitle`, `writeHelpFold`, `addHelp`, `removeHelp`, core/design-helps.ts)
 * and handed to the box, which writes it as one step.
 *
 * Offered only for a hint or a solution the core can write back without changing another byte: one whose body is nothing but words. A
 * hint or a solution that holds a list, a second callout or a fenced block says so in words, shows its title and its fold switch (which
 * only touch its first line), and keeps its body in the Markdown below. A question the lines of which cannot be carved (two hints, a
 * stray line among the callouts) shows the reason and no controls.
 */
import { Setting } from "obsidian";
import { addHelp, helpOf, readHelps, removeHelp, writeHelpFold, writeHelpTitle, writeHelpWords, type DesignKind, type HelpKind, type RichWhere } from "./core";
import type { DesignKey } from "./core";
import type { Made } from "./design-rows";
import { ui } from "./design-text";
import { quietNames } from "./design-words";

/** What the part asks of the box that holds it. */
export interface HelpsIO {
	/** The block's own lines in the note now. */
	lines(): string[];
	/** A control of words, applied when it is left (see the box's `field`); `rich` gives it the formatting keys. */
	field(el: HTMLInputElement | HTMLTextAreaElement, make: (value: string, lines: string[], was: string) => Made, back: (lines: string[]) => string | null, rich?: RichWhere): void;
	/** A control pressed: one change, made on the block's lines as they are when it runs. `focus` is the control the focus goes to when the part is drawn again. */
	act(make: (lines: string[]) => Made, focus: string | null): void;
}

/** What the part shows: nothing (not a question), the reason it has no controls, or its controls (`some`: one of them is a callout the Markdown below holds). */
export type HelpsState = "none" | "refused" | "helps" | "some";

const KINDS: readonly HelpKind[] = ["hint", "solution"];
const NAME: Record<HelpKind, DesignKey> = { hint: "helps.hint", solution: "helps.solution" };
const ADD: Record<HelpKind, DesignKey> = { hint: "helps.add.hint", solution: "helps.add.solution" };
const REMOVE: Record<HelpKind, DesignKey> = { hint: "helps.remove.hint", solution: "helps.remove.solution" };
const PLACEHOLDER: Record<HelpKind, DesignKey> = { hint: "helps.placeholder.hint", solution: "helps.placeholder.solution" };

/** The shape of what is drawn: which of the two there are and whether each is shown as fields (the words, titles and marks are not part of it). */
function shapeOf(kind: DesignKind, lines: readonly string[]): string {
	if (kind !== "question") return "none";
	const h = readHelps(lines);
	if ("refused" in h) return `refused:${h.refused}`;
	return h.parts.map((p) => `${p.kind}:${p.words ? "words" : (p.why ?? "")}`).join("|") || "nothing";
}

export class HelpsPanel {
	private shape = "";

	constructor(
		private readonly host: HTMLElement,
		private readonly io: HelpsIO,
		private readonly nodeKind: () => DesignKind,
	) {}

	/** Does the part show something different from what these lines make (it must be drawn again)? */
	differs(lines: readonly string[]): boolean {
		return shapeOf(this.nodeKind(), lines) !== this.shape;
	}

	/** Draws the controls of these lines (the note's) in place of what was drawn, and says what it drew. `wanted`: the control the focus goes to after. */
	draw(lines: readonly string[], wanted: string | null = null): HelpsState {
		const doc = this.host.ownerDocument;
		const active = doc.activeElement;
		const key = wanted ?? (active && this.host.contains(active) ? (active.closest("[data-key]")?.getAttribute("data-key") ?? null) : null);
		this.host.empty();
		this.shape = shapeOf(this.nodeKind(), lines);
		const isQuestion = this.nodeKind() === "question";
		this.host.toggleClass("is-empty", !isQuestion);
		if (!isQuestion) return "none";
		const helps = readHelps(lines);
		if ("refused" in helps) {
			this.host.createDiv({ cls: "booklet-design-rows-refused", text: ui("helps.refused", { reason: helps.refused }) });
			return "refused";
		}
		let state: HelpsState = "helps";
		const missing: HelpKind[] = [];
		for (const kind of KINDS) {
			const part = helps.parts.find((p) => p.kind === kind);
			if (!part) {
				missing.push(kind);
				continue;
			}
			if (!part.words) state = "some";
			this.drawPart(kind, part.words, part.why);
		}
		if (missing.length) {
			const adds = this.host.createDiv({ cls: "booklet-design-rows-usedby is-adds" });
			for (const kind of missing) {
				const b = adds.createEl("button", { text: ui(ADD[kind]), cls: "booklet-design-rows-button", attr: { type: "button", "aria-label": ui(ADD[kind]), "data-key": `${kind}-add` } });
				b.addEventListener("click", () => this.io.act((cur) => addHelp(cur, kind), `${kind}-words`));
			}
		}
		quietNames(this.host);
		if (key) this.host.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
		return state;
	}

	/** Puts the fold switches' marks of these lines into the part that is drawn (the shape has not changed). The words and titles are the box's `Field`s. */
	sync(lines: readonly string[]): void {
		for (const kind of KINDS) {
			const p = helpOf(lines, kind);
			const sw = this.host.querySelector<HTMLElement>(`[data-key="${kind}-fold"]`);
			if (p && sw) sw.setAttribute("aria-checked", String(p.fold === "-"));
			const note = this.host.querySelector<HTMLElement>(`[data-help="${kind}"] .booklet-design-help-plus`);
			if (p && note) note.hidden = p.fold !== "+";
		}
	}

	private drawPart(kind: HelpKind, words: boolean, why: string | null): void {
		const name = ui(NAME[kind]);
		const sec = this.host.createDiv({ cls: "booklet-design-help", attr: { role: "group", "aria-label": name, "data-help": kind } });
		new Setting(sec).setName(name).setHeading();
		const first = helpOf(this.io.lines(), kind);
		const bar = sec.createDiv({ cls: "booklet-design-help-bar" });
		const main = bar.createDiv({ cls: "booklet-design-rows-main" });
		const title = main.createEl("input", { cls: "booklet-design-rows-input", attr: { type: "text", "aria-label": ui("helps.title", { name }), "data-key": `${kind}-title`, "data-field": `${kind}-title`, spellcheck: "false", autocomplete: "off" } });
		title.value = first?.title ?? "";
		this.io.field(
			title,
			(value, cur, was) => {
				const now = helpOf(cur, kind);
				// the title on screen is the note's: else it is not known which callout this typing was for
				if (!now || now.title !== was) return { ok: false, reason: ui("edit.changed"), keep: true };
				const made = writeHelpTitle(cur, kind, value.replace(/\s*[\r\n]+\s*/g, " ").trim());
				return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
			},
			(cur) => helpOf(cur, kind)?.title ?? null,
			"title",
		);
		const ctl = bar.createDiv({ cls: "booklet-design-rows-controls" });
		const sw = ctl.createEl("button", {
			text: ui("fold.switch"),
			cls: "booklet-design-strip-switch",
			attr: { type: "button", role: "switch", "aria-checked": String(first?.fold === "-"), "aria-label": ui("helps.fold", { name }), "data-key": `${kind}-fold` },
		});
		sw.addEventListener("click", () =>
			this.io.act((cur) => {
				const now = helpOf(cur, kind);
				if (!now) return { ok: false, reason: ui("edit.changed") };
				const made = writeHelpFold(cur, kind, now.fold !== "-");
				return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
			}, `${kind}-fold`),
		);
		if (words) {
			const rm = ctl.createEl("button", { text: ui("helps.remove"), cls: "booklet-design-rows-button", attr: { type: "button", "aria-label": ui(REMOVE[kind]), "data-key": `${kind}-remove` } });
			rm.addEventListener("click", () =>
				this.io.act((cur) => {
					const made = removeHelp(cur, kind);
					return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
				}, `${kind}-add`),
			);
		}
		const plus = sec.createDiv({ cls: "booklet-design-rows-usedby booklet-design-help-plus", text: ui("fold.plus") });
		plus.hidden = first?.fold !== "+";
		if (!words) {
			// a body of more than words: the controls above only touch its first line; the body is edited in the Markdown below
			sec.createDiv({ cls: "booklet-design-rows-refused", text: why ?? "" });
			return;
		}
		const area = sec.createEl("textarea", {
			cls: ["booklet-design-field", "is-desc"],
			attr: { rows: "1", "aria-label": ui("helps.words", { name }), placeholder: ui(PLACEHOLDER[kind]), spellcheck: "true", "data-key": `${kind}-words`, "data-field": `${kind}-words` },
		});
		area.value = first?.text ?? "";
		area.rows = Math.min(30, Math.max(1, area.value.split("\n").length));
		this.io.field(
			area,
			(value, cur, was) => {
				const now = helpOf(cur, kind);
				if (!now || !now.words || now.text !== was) return { ok: false, reason: ui("edit.changed"), keep: true };
				const made = writeHelpWords(cur, kind, value);
				return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
			},
			(cur) => {
				const now = helpOf(cur, kind);
				return now && now.words ? now.text : null;
			},
			"help",
		);
	}
}
