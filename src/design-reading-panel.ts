/*
 * The pictures, the figures and the citations of a prose block, in the Design view's editor in place: for each picture two fields (the
 * words that describe it, and where it is), for each figure a picker of the diagrams the page can see, and for each citation the fields of
 * its source (title, edition or detail, page or place, quote, verified date), shown in the box of the sentence that holds the mark. Like the
 * media part (design-media-panel.ts) it holds no copy of the text: it is drawn from the note, and every change is made on the note as it is
 * when it is made (core `changePicture`, `changeFigure`, `changeCitation`, `addDefinition`, `addNote`) and handed to the box, which writes
 * it as one step. A picture in the reference style and a citation touch two places of the note; they are written together, as one change.
 *
 * Offered only for what the core can write back without changing another byte. A shape it cannot show says so in words and stays in the
 * Markdown; a note that does not fit the source pattern is just a note, said so and kept as it is; an address that breaks the format's rules
 * for a picture is kept and warned about, never refused or rewritten; a figure whose diagram is not there is kept and shown as missing.
 * Nothing is fetched or uploaded.
 */
import { Setting } from "obsidian";
import {
	addDefinition,
	addNote,
	blockLines,
	changeCitation,
	changeFigure,
	changePicture,
	citationsOf,
	diagramsFor,
	figuresIn,
	pathWarning,
	picturesOf,
	type Citation,
	type CitationChange,
	type DesignKind,
	type DesignNode,
	type Diagram,
	type Figures,
	type Pictures,
	type PicturesRefused,
	type SourceFields,
} from "./core";
import type { DesignKey } from "./core";
import type { Made, RowsIO } from "./design-rows";
import { ui } from "./design-text";
import { quietNames } from "./design-words";

/** What the part asks of the box that holds it. */
export interface ReadingIO extends Pick<RowsIO, "note" | "lines" | "field" | "act"> {
	/** The open block's node in the note now, or null. */
	node(): DesignNode | null;
}

/** What the part shows: nothing (not a prose block, or no picture, figure or mark in it), or its controls. */
export type ReadingState = "none" | "reading";

interface Read {
	pics: Pictures | PicturesRefused;
	figs: Figures;
	diagrams: Diagram[];
	cites: Citation[];
}

const CITE_FIELDS: readonly { field: keyof SourceFields; label: DesignKey }[] = [
	{ field: "title", label: "citation.title" },
	{ field: "detail", label: "citation.detail" },
	{ field: "page", label: "citation.page" },
	{ field: "quote", label: "citation.quote" },
	{ field: "verified", label: "citation.verified" },
];

export class ReadingPanel {
	private shape = "";
	private memo: { note: string; start: number | null; read: Read } | null = null;
	/** What puts the drawn controls back in step with the note after a write that did not change the shape. */
	private syncs: (() => void)[] = [];

	constructor(
		private readonly host: HTMLElement,
		private readonly io: ReadingIO,
		private readonly nodeKind: () => DesignKind,
	) {}

	/** What the block holds, read from the note as it is now (read once for each text of the note). */
	private read(): Read | null {
		const node = this.io.node();
		if (!node || this.nodeKind() !== "prose") return null;
		const note = this.io.note();
		if (this.memo && this.memo.note === note && this.memo.start === node.start) return this.memo.read;
		const figs = figuresIn(blockLines(note, node));
		const read: Read = { pics: picturesOf(note, node), figs, diagrams: figs.embeds.length ? diagramsFor(note, node) : [], cites: citationsOf(note, node) };
		this.memo = { note, start: node.start, read };
		return read;
	}

	private holds(r: Read | null): boolean {
		return !!r && (("pictures" in r.pics && (r.pics.pictures.length > 0 || r.pics.other > 0)) || r.figs.embeds.length > 0 || r.figs.other > 0 || r.cites.length > 0);
	}

	/** The parts of the note outside the block that its controls show: the box draws again, and puts the words into its fields, when they change. */
	reach(): string {
		const r = this.read();
		if (!r || !this.holds(r)) return "";
		return JSON.stringify([
			"pictures" in r.pics ? r.pics.pictures.map((p) => [p.path, p.definition?.line ?? null]) : null,
			r.diagrams.map((d) => d.id),
			r.cites.map((c) => [c.id, c.note?.line ?? null, c.note?.fields ?? null, c.note?.why ?? null]),
		]);
	}

	/** The shape of what is drawn: which controls there are (the words in them are not part of it). */
	private shapeOf(r: Read | null): string {
		if (!r || !this.holds(r)) return "none";
		return JSON.stringify([
			"pictures" in r.pics ? [r.pics.pictures.map((p) => [p.form, p.alt === null, p.id, p.definition ? p.definition.line : null, p.problem]), r.pics.other] : null,
			[r.figs.embeds.map((e) => e.id), r.figs.other, r.diagrams.map((d) => d.id)],
			r.cites.map((c) => [c.id, c.note ? (c.note.fields ? "fields" : c.note.why) : "none", c.note?.line ?? null]),
		]);
	}

	/** Does the part show something different from what the note makes now (it must be drawn again)? */
	differs(): boolean {
		return this.shapeOf(this.read()) !== this.shape;
	}

	/** Draws the controls for the note as it is in place of what was drawn, and says what it drew. `wanted`: the control the focus goes to after. */
	draw(wanted: string | null = null): ReadingState {
		const doc = this.host.ownerDocument;
		const active = doc.activeElement;
		const key = wanted ?? (active && this.host.contains(active) ? (active.closest("[data-key]")?.getAttribute("data-key") ?? null) : null);
		this.host.empty();
		this.syncs = [];
		const r = this.read();
		this.shape = this.shapeOf(r);
		this.host.toggleClass("is-empty", !r || !this.holds(r));
		if (!r || !this.holds(r)) return "none";
		if ("pictures" in r.pics) this.drawPictures(r.pics);
		this.drawFigures(r);
		for (const c of r.cites) this.drawCitation(c);
		quietNames(this.host);
		if (key) this.host.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
		return "reading";
	}

	/** Puts what the note says into the controls that are drawn (the shape has not changed). The words in the fields are the box's `Field`s. */
	sync(): void {
		for (const s of this.syncs) s();
	}

	// ---------------------------------------------------------------- the pieces the controls are made of

	private text(host: HTMLElement, label: string, key: string, value: string, placeholder: string | null, make: (v: string, was: string) => Made, back: () => string | null, oninput?: (v: string) => void): HTMLInputElement {
		const row = new Setting(host).setName(label);
		row.settingEl.setAttribute("data-field", key);
		let input: HTMLInputElement | null = null;
		row.addText((c) => {
			c.setValue(value);
			c.inputEl.setAttribute("data-key", key);
			c.inputEl.setAttribute("aria-label", label);
			if (placeholder) c.inputEl.setAttribute("placeholder", placeholder);
			c.inputEl.setAttribute("spellcheck", "false");
			c.inputEl.setAttribute("autocomplete", "off");
			if (oninput) c.inputEl.addEventListener("input", () => oninput(c.inputEl.value));
			this.io.field(c.inputEl, (v, _cur, was) => make(v, was), () => back());
			input = c.inputEl;
		});
		return input as unknown as HTMLInputElement;
	}

	/** The change a field makes: the note's whole new text, written as one change, or why it is not made. */
	private made(result: { ok: true; text: string } | { ok: false; reason: string }, node: DesignNode): Made {
		return result.ok ? { ok: true, lines: blockLines(result.text, node), note: result.text } : { ok: false, reason: result.reason };
	}

	private stale = (): Made => ({ ok: false, reason: ui("edit.changed"), keep: true });

	// ---------------------------------------------------------------- pictures

	private drawPictures(pics: Pictures): void {
		const total = pics.pictures.length;
		pics.pictures.forEach((p, i) => {
			const sec = this.host.createDiv({ cls: "booklet-design-help", attr: { role: "group", "aria-label": ui(total > 1 ? "image.heading.n" : "image.heading", { n: i + 1 }), "data-reading": `picture-${i}` } });
			new Setting(sec).setName(ui(total > 1 ? "image.heading.n" : "image.heading", { n: i + 1 })).setHeading();
			if (p.problem) {
				sec.createDiv({ cls: "booklet-design-rows-refused", text: ui("image.refused", { reason: p.problem }) });
				return;
			}
			const now = (): { node: DesignNode; pic: NonNullable<Pictures["pictures"][number]> } | null => {
				const node = this.io.node();
				const r = node ? picturesOf(this.io.note(), node) : null;
				const pic = r && "pictures" in r ? r.pictures[i] : undefined;
				return node && pic ? { node, pic } : null;
			};
			if (p.alt !== null) {
				const empty = sec.createDiv({ cls: "booklet-design-rows-usedby", text: ui("image.alt.empty"), attr: { "data-reading": "alt-empty" } });
				const show = (v: string): void => void (empty.hidden = v.trim() !== "");
				const input = this.text(
					sec,
					ui("image.alt"),
					`picture-${i}-alt`,
					p.alt,
					null,
					(v, was) => {
						const n = now();
						if (!n || n.pic.alt !== was) return this.stale();
						return this.made(changePicture(this.io.note(), n.node, i, { alt: v }), n.node);
					},
					() => now()?.pic.alt ?? null,
					show,
				);
				// the note about an empty description sits under its field
				input.closest(".setting-item")?.after(empty);
				show(p.alt);
				this.syncs.push(() => show(now()?.pic.alt ?? ""));
			} else sec.createDiv({ cls: "booklet-design-rows-usedby", text: ui("image.alt.none") });
			const warn = sec.createDiv({ cls: "booklet-design-rows-refused", attr: { role: "status", "data-reading": "path-warning" } });
			const showWarn = (v: string): void => {
				const w = pathWarning(v);
				warn.setText(w ?? "");
				warn.hidden = !w;
			};
			if (p.form === "reference" && !p.definition) {
				sec.createDiv({ cls: "booklet-design-rows-usedby", text: ui("image.missing", { id: p.id ?? "" }) });
				const add = sec.createEl("button", { text: ui("image.missing.add"), cls: "booklet-design-rows-button", attr: { type: "button", "aria-label": ui("image.missing.add.label", { id: p.id ?? "" }), "data-key": `picture-${i}-add` } });
				add.addEventListener("click", () =>
					this.io.act(() => {
						const n = now();
						return n ? this.made(addDefinition(this.io.note(), n.node, i), n.node) : { ok: false, reason: ui("edit.changed") };
					}, `picture-${i}-path`),
				);
				warn.hidden = true;
				return;
			}
			const pathInput = this.text(
				sec,
				ui("image.path"),
				`picture-${i}-path`,
				p.path ?? "",
				"images/name.jpg",
				(v, was) => {
					const n = now();
					if (!n || n.pic.path !== was) return this.stale();
					return this.made(changePicture(this.io.note(), n.node, i, { path: v }), n.node);
				},
				() => now()?.pic.path ?? null,
				showWarn,
			);
			// the warning sits under its field
			pathInput.closest(".setting-item")?.after(warn);
			showWarn(p.path ?? "");
			this.syncs.push(() => showWarn(now()?.pic.path ?? ""));
			if (p.form === "reference" && p.definition) sec.createDiv({ cls: "booklet-design-rows-usedby", text: ui("image.where", { line: p.definition.line + 1, id: p.id ?? "" }) });
		});
		if (total > 0) this.host.createDiv({ cls: "booklet-design-rows-usedby", text: ui("image.note") });
		if (pics.other > 0) this.host.createDiv({ cls: "booklet-design-rows-usedby", text: ui("image.shape") });
	}

	// ---------------------------------------------------------------- figures

	private drawFigures(r: Read): void {
		const total = r.figs.embeds.length;
		r.figs.embeds.forEach((e, i) => {
			const title = ui(total > 1 ? "figure.heading.n" : "figure.heading", { n: i + 1 });
			const sec = this.host.createDiv({ cls: "booklet-design-help", attr: { role: "group", "aria-label": title, "data-reading": `figure-${i}` } });
			new Setting(sec).setName(title).setHeading();
			const row = new Setting(sec).setName(ui("figure.pick"));
			row.settingEl.setAttribute("data-field", `figure-${i}`);
			const lost = !r.diagrams.some((d) => d.id === e.id);
			row.addDropdown((c) => {
				for (const d of r.diagrams) c.addOption(d.id, d.id);
				if (lost) c.addOption(e.id, ui("rows.menu.missing", { id: e.id }));
				c.setValue(e.id);
				c.selectEl.setAttribute("data-key", `figure-${i}`);
				c.selectEl.setAttribute("aria-label", ui("figure.pick"));
				c.onChange((v) =>
					this.io.act(() => {
						const node = this.io.node();
						return node ? this.made(changeFigure(this.io.note(), node, i, v), node) : { ok: false, reason: ui("edit.changed") };
					}, `figure-${i}`),
				);
				this.syncs.push(() => {
					const node = this.io.node();
					const now = node ? figuresIn(blockLines(this.io.note(), node)).embeds[i] : undefined;
					if (now && c.selectEl.value !== now.id) c.selectEl.value = now.id;
				});
			});
			if (lost) sec.createDiv({ cls: "booklet-design-rows-usedby", text: ui("figure.lost", { id: e.id }), attr: { "data-reading": "figure-lost" } });
			else if (!r.diagrams.length) sec.createDiv({ cls: "booklet-design-rows-usedby", text: ui("figure.none") });
			sec.createDiv({ cls: "booklet-design-rows-usedby", text: ui("figure.where") });
		});
		if (r.figs.other > 0) this.host.createDiv({ cls: "booklet-design-rows-usedby", text: ui("figure.shape") });
	}

	// ---------------------------------------------------------------- citations

	private drawCitation(c: Citation): void {
		const title = ui("citation.heading", { id: c.id });
		const sec = this.host.createDiv({ cls: "booklet-design-help", attr: { role: "group", "aria-label": title, "data-reading": `citation-${c.id}` } });
		new Setting(sec).setName(title).setHeading();
		const note = c.note;
		if (!note) {
			sec.createDiv({ cls: "booklet-design-rows-usedby", text: ui("citation.missing", { id: c.id }) });
			const add = sec.createEl("button", { text: ui("citation.missing.add"), cls: "booklet-design-rows-button", attr: { type: "button", "aria-label": ui("citation.missing.add.label", { id: c.id }), "data-key": `cite-${c.id}-add` } });
			add.addEventListener("click", () =>
				this.io.act(() => {
					const node = this.io.node();
					return node ? this.made(addNote(this.io.note(), node, c.id), node) : { ok: false, reason: ui("edit.changed") };
				}, `cite-${c.id}-title`),
			);
			return;
		}
		if (!note.fields) {
			sec.createDiv({ cls: "booklet-design-rows-refused", text: ui(note.lines > 1 ? "citation.severalLines" : "citation.notPattern"), attr: { "data-reading": "citation-words" } });
			sec.createDiv({ cls: "booklet-design-rows-usedby", text: ui("citation.where.words", { line: note.line + 1 }) });
			return;
		}
		const now = (): { node: DesignNode; fields: SourceFields } | null => {
			const node = this.io.node();
			const f = node ? citationsOf(this.io.note(), node).find((x) => x.id === c.id)?.note?.fields : undefined;
			return node && f ? { node, fields: f } : null;
		};
		for (const { field, label } of CITE_FIELDS) {
			this.text(
				sec,
				ui(label),
				`cite-${c.id}-${field}`,
				note.fields[field],
				field === "verified" ? "2026-09-20" : field === "page" ? "p. 12" : null,
				(v, was) => {
					const n = now();
					if (!n || n.fields[field] !== was) return this.stale();
					const change: CitationChange = { [field]: v };
					return this.made(changeCitation(this.io.note(), n.node, c.id, change), n.node);
				},
				() => now()?.fields[field] ?? null,
			);
		}
		sec.createDiv({ cls: "booklet-design-rows-usedby", text: ui("citation.where", { line: note.line + 1 }) });
	}
}
