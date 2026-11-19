/*
 * A module's notice in the Design view's editor in place: four fields (the license, the copyright, the source, the version) and, in words,
 * the lines of the notice that no field holds. Like the media part (design-media-panel.ts) it holds no copy of the text: it is drawn from
 * the note's own lines, and every change is made on the lines as they are when it is made (core `writeNoticeField`, core/design-notice.ts)
 * and handed to the box, which writes it as one step, when the field is left.
 *
 * A notice the fields cannot show faithfully (a key said twice, a line under it that is not part of it) says so in words and keeps its lines:
 * the Markdown below is how it is edited. A line that is not one of the four keys is listed as kept as written, and is never touched.
 */
import { Setting } from "obsidian";
import { NOTICE_KEYS, readNotice, sourceIsLink, writeNoticeField, type DesignKind, type NoticeKey } from "./core";
import type { DesignKey } from "./core";
import type { Made, RowsIO } from "./design-rows";
import { ui } from "./design-text";
import { quietNames } from "./design-words";

/** What the part asks of the box that holds it. */
export type NoticeIO = Pick<RowsIO, "lines" | "field">;

/** What the part shows: nothing (not a notice), the reason it has no fields, or its fields. */
export type NoticeState = "none" | "refused" | "fields";

const LABEL: Record<NoticeKey, DesignKey> = { license: "notice.license", copyright: "notice.copyright", source: "notice.source", version: "notice.version" };

/** The shape of what is drawn: which lines are listed as kept, or the reason there are no fields (the values are not part of it). */
function shapeOf(kind: DesignKind, lines: readonly string[]): string {
	if (kind !== "notice") return "none";
	const n = readNotice(lines);
	return "refused" in n ? `refused:${n.refused}` : `fields:${JSON.stringify(n.kept.map((k) => k.text))}`;
}

export class NoticePanel {
	private shape = "";
	private note: HTMLElement | null = null;

	constructor(
		private readonly host: HTMLElement,
		private readonly io: NoticeIO,
		private readonly nodeKind: () => DesignKind,
	) {}

	/** Does the part show something different from what these lines make (it must be drawn again)? */
	differs(lines: readonly string[]): boolean {
		return shapeOf(this.nodeKind(), lines) !== this.shape;
	}

	/** Draws the fields of these lines (the note's) in place of what was drawn, and says what it drew. `wanted`: the control the focus goes to after. */
	draw(lines: readonly string[], wanted: string | null = null): NoticeState {
		const doc = this.host.ownerDocument;
		const active = doc.activeElement;
		const key = wanted ?? (active && this.host.contains(active) ? (active.closest("[data-key]")?.getAttribute("data-key") ?? null) : null);
		this.host.empty();
		this.note = null;
		this.shape = shapeOf(this.nodeKind(), lines);
		const isNotice = this.nodeKind() === "notice";
		this.host.toggleClass("is-empty", !isNotice);
		if (!isNotice) return "none";
		const read = readNotice(lines);
		if ("refused" in read) {
			this.host.createDiv({ cls: "booklet-design-rows-refused", text: ui("notice.refused", { reason: read.refused }) });
			return "refused";
		}
		new Setting(this.host).setName(ui("notice.heading")).setHeading();
		for (const k of NOTICE_KEYS) this.drawField(k, read.fields[k]?.value ?? "");
		this.host.createDiv({ cls: "booklet-design-rows-usedby", text: ui("notice.hint") });
		if (read.kept.length) {
			const kept = this.host.createDiv({ cls: "booklet-design-rows-usedby is-kept", attr: { "data-notice": "kept" } });
			kept.createDiv({ text: ui("notice.kept") });
			const list = kept.createEl("ul");
			for (const l of read.kept) list.createEl("li").createEl("code", { text: l.text });
		}
		quietNames(this.host);
		if (key) this.host.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
		return "fields";
	}

	/** Puts the quiet note about the source into step with the note's lines (the values themselves are the box's `Field`s). */
	sync(lines: readonly string[]): void {
		const n = readNotice(lines);
		if (!("refused" in n)) this.showLink(n.fields.source?.value ?? "");
	}

	private showLink(value: string): void {
		if (this.note) this.note.hidden = value.trim() === "" || sourceIsLink(value);
	}

	private drawField(key: NoticeKey, value: string): void {
		const label = ui(LABEL[key]);
		const row = new Setting(this.host).setName(label);
		row.settingEl.setAttribute("data-field", `notice-${key}`);
		row.addText((c) => {
			c.setValue(value);
			c.inputEl.setAttribute("data-key", `notice-${key}`);
			c.inputEl.setAttribute("aria-label", label);
			c.inputEl.setAttribute("spellcheck", "false");
			c.inputEl.setAttribute("autocomplete", "off");
			if (key === "source") c.inputEl.addEventListener("input", () => this.showLink(c.inputEl.value));
			const make = (v: string, cur: string[], was: string): Made => {
				const now = readNotice(cur);
				// the value on screen is the note's: else it is not known which line this typing was for
				if ("refused" in now || (now.fields[key]?.value ?? "") !== was) return { ok: false, reason: ui("edit.changed"), keep: true };
				const made = writeNoticeField(cur, key, v);
				return made.ok ? { ok: true, lines: made.lines } : { ok: false, reason: made.reason };
			};
			this.io.field(c.inputEl, make, (cur) => {
				const now = readNotice(cur);
				return "refused" in now ? null : (now.fields[key]?.value ?? "");
			});
		});
		if (key === "source") {
			this.note = this.host.createDiv({ cls: "booklet-design-rows-usedby", text: ui("notice.sourceNotLink"), attr: { "data-notice": "not-a-link" } });
			this.showLink(value);
		}
	}
}
