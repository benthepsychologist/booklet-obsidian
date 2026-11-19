/*
 * The media part of the Design view's editor in place: a `listen` question's media (the address of its embed or link, and the words that
 * name it) and a `widget` question's data block (a choice of the blocks it can see, and a button to the block's own Markdown). Like the
 * rows (design-rows.ts) it holds no copy of the text: it is drawn from the note's own lines, and every change is made on the note's lines
 * as they are when it is made (core `writeMedia`, `addMedia`, design-media.ts) and handed to the box, which writes it as one step.
 *
 * Offered only for a media line the core can read and write back without changing another byte. A block with a media line in another
 * shape says so in words, and the Markdown below it is how it is edited. A widget's data (the JSON in its fenced block) is never rewritten
 * by controls: the box says what it is, and the button opens the block's own Markdown.
 */
import { Setting } from "obsidian";
import { addMedia, holdsMedia, mediaIn, mediaKindOf, readParts, widgetBlocksFor, writeMedia, type WidgetRef } from "./core";
import type { Made, RowsIO } from "./design-rows";
import { ui } from "./design-text";
import { quietNames } from "./design-words";

/** What the media part asks of the box that holds it: what the rows ask, less the stash. */
export type MediaIO = Pick<RowsIO, "note" | "start" | "lines" | "field" | "act" | "openMenu">;

/** What the part shows: nothing (not a listen or a widget), the reason it has no controls, or its controls. */
export type MediaState = "none" | "unshown" | "media";

/** The shape of what is drawn: what must be drawn again when it changes (the words are not part of it). */
function shapeOf(note: string, start: number | null, lines: readonly string[]): string {
	const kind = mediaKindOf(lines);
	if (!kind) return "none";
	const m = mediaIn(lines);
	if (kind === "listen") return `listen:${m ? m.form : hasUnshown(lines) ? "unshown" : "none"}`;
	const blocks = start === null ? [] : widgetBlocksFor(note, start);
	return `widget:${m ? m.form : hasUnshown(lines) ? "unshown" : "none"}:${m?.target ?? ""}:${blocks.map((b) => `${b.id}/${b.line}/${b.engine}`).join(",")}`;
}

/** A media line the controls could not read: the reader finds the media (or the embed) among the words, and `mediaIn` shows none. */
const hasUnshown = (lines: readonly string[]): boolean => holdsMedia(lines) && !mediaIn(lines);

export class MediaPanel {
	private shape = "";

	constructor(
		private readonly host: HTMLElement,
		private readonly io: MediaIO,
	) {}

	/** Does the part show something different from what these lines make (it must be drawn again)? */
	differs(lines: readonly string[]): boolean {
		return shapeOf(this.io.note(), this.io.start(), lines) !== this.shape;
	}

	/** Draws the controls of these lines (the note's) in place of what was drawn, and says what it drew. */
	draw(lines: readonly string[], wanted: string | null = null): MediaState {
		const doc = this.host.ownerDocument;
		const active = doc.activeElement;
		const key = wanted ?? (active && this.host.contains(active) ? (active.closest("[data-key]")?.getAttribute("data-key") ?? null) : null);
		this.host.empty();
		this.shape = shapeOf(this.io.note(), this.io.start(), lines);
		const kind = mediaKindOf(lines);
		this.host.toggleClass("is-empty", !kind);
		if (!kind) return "none";
		const m = mediaIn(lines);
		const unshown = !m && hasUnshown(lines);
		new Setting(this.host).setName(ui(kind === "listen" ? "media.heading" : "widget.heading")).setHeading();
		let state: MediaState = "media";
		if (unshown) {
			this.host.createDiv({ cls: "booklet-design-rows-refused", text: ui("media.unshown") });
			state = "unshown";
		} else if (kind === "listen") this.drawListen(lines);
		else this.drawWidget(lines);
		quietNames(this.host);
		if (key) this.host.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
		return state;
	}

	/** Puts the select's value of these lines into the part that is drawn (the shape has not changed). The words are the box's `Field`s: only the box sets those. */
	sync(lines: readonly string[]): void {
		const m = mediaIn(lines);
		const sel = this.host.querySelector<HTMLSelectElement>('select[data-key="widget-block"]');
		if (sel && m && sel.value !== m.target) sel.value = m.target;
	}

	// ---------------------------------------------------------------- a listen

	private text(label: string, key: string, value: string, hint: string | null, make: (v: string, lines: string[], was: string) => Made, back: (lines: string[]) => string | null): void {
		const row = new Setting(this.host).setName(label);
		row.settingEl.setAttribute("data-field", key);
		row.addText((c) => {
			c.setValue(value);
			c.inputEl.setAttribute("data-key", key);
			c.inputEl.setAttribute("aria-label", label);
			if (hint) c.inputEl.setAttribute("placeholder", hint);
			c.inputEl.setAttribute("spellcheck", "false");
			c.inputEl.setAttribute("autocomplete", "off");
			this.io.field(c.inputEl, make, back);
		});
	}

	private drawListen(lines: readonly string[]): void {
		const m = mediaIn(lines);
		if (!m) {
			// no media at all: typing an address adds the line under the question's own
			this.text(
				ui("media.address"),
				"media-target",
				"",
				null,
				(v, cur, was) => {
					if (mediaIn(cur) || was !== "") return { ok: false, reason: ui("edit.changed"), keep: true };
					if (!v.trim()) return { ok: true, lines: cur };
					const parts = readParts(cur, "question");
					const made = addMedia(cur, v.trim(), "refused" in parts ? "" : (parts.title ?? ""));
					return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
				},
				(cur) => (mediaIn(cur) ? null : ""),
			);
			this.host.createDiv({ cls: "booklet-design-rows-none", text: ui("media.add") });
			return;
		}
		this.text(
			ui("media.address"),
			"media-target",
			m.target,
			null,
			(v, cur, was) => {
				const now = mediaIn(cur);
				if (!now || now.target !== was) return { ok: false, reason: ui("edit.changed"), keep: true };
				const made = writeMedia(cur, { target: v.trim() });
				return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
			},
			(cur) => mediaIn(cur)?.target ?? null,
		);
		if (m.alt !== null)
			this.text(
				ui("media.name"),
				"media-alt",
				m.alt,
				null,
				(v, cur, was) => {
					const now = mediaIn(cur);
					if (!now || now.alt !== was) return { ok: false, reason: ui("edit.changed"), keep: true };
					const made = writeMedia(cur, { alt: v.trim() });
					return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
				},
				(cur) => mediaIn(cur)?.alt ?? null,
			);
		if (m.form === "link") this.host.createDiv({ cls: "booklet-design-rows-usedby", text: ui("media.link") });
	}

	// ---------------------------------------------------------------- a widget

	private drawWidget(lines: readonly string[]): void {
		const m = mediaIn(lines);
		const start = this.io.start();
		const blocks: WidgetRef[] = start === null ? [] : widgetBlocksFor(this.io.note(), start);
		// a widget names a block the way it is found: its own module's first, then a shared one
		const ref = m ? (blocks.find((b) => b.id === m.target && b.module !== null) ?? blocks.find((b) => b.id === m.target)) : undefined;
		const row = new Setting(this.host).setName(ui("widget.block"));
		row.settingEl.setAttribute("data-field", "widget-block");
		row.addDropdown((c) => {
			if (!m) c.addOption("", ui("widget.block.none"));
			const seen = new Set<string>();
			for (const b of blocks) {
				if (seen.has(b.id)) continue;
				seen.add(b.id);
				c.addOption(b.id, b.engine ? `${b.id} (${b.engine})` : b.id);
			}
			if (m && !seen.has(m.target)) c.addOption(m.target, ui("rows.menu.missing", { id: m.target }));
			c.setValue(m ? m.target : "");
			c.selectEl.setAttribute("data-key", "widget-block");
			c.selectEl.setAttribute("aria-label", ui("widget.block"));
			c.onChange((v) =>
				this.io.act((cur) => {
					if (!v) return { ok: false, reason: ui("widget.block.none") };
					const made = mediaIn(cur) ? writeMedia(cur, { target: v }) : addMedia(cur, v, "");
					return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
				}, "widget-block"),
			);
		});
		if (!m) return;
		const line = this.host.createDiv({ cls: "booklet-design-rows-usesmenu" });
		if (ref) {
			line.createSpan({ text: ref.engine ? ui("widget.block.engine", { engine: ref.engine }) : ui("widget.block.plain") });
			const b = line.createEl("button", { text: ui("widget.block.open"), cls: "booklet-design-rows-button", attr: { type: "button", "aria-label": ui("widget.block.open.label", { id: ref.id }), "data-key": "widget-open" } });
			b.addEventListener("click", () => this.io.openMenu(ref.line));
		} else line.createSpan({ text: ui("widget.block.lost", { id: m.target }) });
	}
}
