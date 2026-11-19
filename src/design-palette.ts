/*
 * The Design view's left column, Add tab: the palette of pieces, drawn as picture tiles. Plain functions over a context the view hands in;
 * nothing here owns the choice of a piece or of a place (the view does) and nothing writes the note.
 *
 *   the "adding here" card   where a clicked "+" is, in words, or a hint when none is
 *   the Common row           six small chips for the pieces most often added
 *   the groups               Questions, Reading aids, Structure, Views and data, each foldable; EVERY piece is a tile with its picture
 *                            (design-art.ts), its name and its hotkey letters as a small badge (design-keys.ts)
 *   a hover sample           after a moment on a tile, a small sample of the real piece (drawn inert, from the piece's own text) in a popover
 *                            that is taken down on leave; its drawings belong to a Component that is unloaded then
 *
 * A tile is lit when the piece may go where the person is working (core `tileState`), and greyed, with the reason, when it may not.
 * `paintPieceButton` is how a tile or chip looks for a state; the view calls it for every one of them when the state changes, so a
 * press, a pick or a drag never redraws the palette.
 */
import { Component } from "obsidian";
import {
	CATALOGUE_GROUPS,
	KEY_GROUPS,
	PIECES,
	WORDS_PIECE,
	keysOf,
	sampleOf,
	type CatalogueId,
	type Piece,
} from "./core";
import { drawArt, artOf } from "./design-picture";
import { drawInertQuestion, drawInertReading, questionOfPiece } from "./design-sample";
import type { Drawer } from "./design-canvas-draw";
import { ui } from "./design-text";
import { capital, quietNames } from "./design-words";

/** A piece the palette offers: a piece of the pieces table, or the plain "words" the view can always add. */
export type PalettePiece = Pick<Piece, "file" | "group" | "label" | "text"> & { kinds?: readonly string[]; views?: readonly string[] };

/** The six pieces most often added, in the order of the Common row: Choice, Text, Scale, Tip, Image, Page. */
export const COMMON_FILES: readonly string[] = ["Q - choice.md", "Q - text.md", "Q - scale.md", "Reading - tip.md", "Reading - image.md", "Structure - page.md"];

/** The groups in the order the palette lists them (the catalogue's own order is different: Structure leads it). */
export const PALETTE_ORDER: readonly CatalogueId[] = ["questions", "reading", "structure", "views-data"];

const TITLE_KEY = { structure: "cat.structure.title", questions: "cat.questions.title", reading: "cat.reading.title", "views-data": "cat.views-data.title" } as const;

/** The groups of the palette with every piece in each; the plain "words" is the last of Reading aids. */
export function paletteGroups(): { id: CatalogueId; pieces: PalettePiece[] }[] {
	return PALETTE_ORDER.map((id) => {
		const holds = CATALOGUE_GROUPS.find((g) => g.id === id)?.holds ?? [];
		const pieces: PalettePiece[] = holds.flatMap((h) => PIECES.filter((p) => p.group === h));
		if (id === "reading") pieces.push(WORDS_PIECE);
		return { id, pieces };
	});
}

/** A piece of the palette by its file. */
export function pieceByFile(file: string): PalettePiece | undefined {
	return file === WORDS_PIECE.file ? WORDS_PIECE : PIECES.find((p) => p.file === file);
}

/** A piece's name on a tile. */
export const pieceName = (p: Pick<PalettePiece, "file" | "label">): string => capital(p.file === WORDS_PIECE.file ? ui("piece.words") : p.label);

/** The letters that reach a piece, as a badge says them: `q c`. "" for the plain words. */
export const keysText = (p: Pick<PalettePiece, "file">): string => (p.file === WORDS_PIECE.file ? "" : (keysOf(p) ?? "").split("").join(" "));

/** The group letters of a palette group, as its header says them (`v d` for Views and data). */
const groupKeys = (id: CatalogueId): string =>
	KEY_GROUPS.filter((g) => (id === "views-data" ? g.id === "views" || g.id === "data" : g.id === id))
		.map((g) => g.key)
		.join(" ");

/** The group a hotkey letter marks: `v` and `d` both mark Views and data. */
export function groupOfKey(key: string): CatalogueId | null {
	return PALETTE_ORDER.find((id) => groupKeys(id).split(" ").includes(key)) ?? null;
}

/** What the palette asks of the view. */
export interface PaletteCtx extends Drawer {
	/** The shell the hover sample stands in. */
	shell: HTMLElement;
	/** What owns a sample's drawings (the view's Component), or null. */
	owner(): Component | null;
	phone: boolean;
	isOpen(id: CatalogueId): boolean;
	toggle(id: CatalogueId): void;
	/** The group a hotkey letter marked, or null. */
	keyed: CatalogueId | null;
	press(piece: PalettePiece): void;
	dragStart(piece: PalettePiece, evt: DragEvent): void;
	dragEnd(): void;
}

export interface PaletteHandle {
	dispose(): void;
}

/** How a tile or chip looks: lit or greyed (with its reason) and picked or not. */
export function paintPieceButton(el: HTMLElement, state: { ok: boolean; reason: string; armed: boolean }): void {
	el.toggleClass("is-off", !state.ok);
	el.toggleClass("is-armed", state.armed);
	el.setAttribute("aria-disabled", String(!state.ok));
	el.setAttribute("aria-pressed", String(state.armed));
	if (state.ok) {
		el.removeAttribute("title");
		el.removeAttribute("data-why");
	} else {
		el.setAttribute("title", state.reason);
		el.setAttribute("data-why", state.reason);
	}
}

/** The "adding here" card: the place a clicked "+" is, or the hint to pick a piece and then a lit spot. */
export function paintWhere(card: HTMLElement, where: string | null): void {
	card.empty();
	card.toggleClass("is-target", where !== null);
	if (where === null) {
		card.createDiv({ cls: "booklet-design-where-hint", text: ui("where.hint") });
		return;
	}
	card.createEl("b", { text: ui("where.adding") });
	card.createEl("i", { text: where });
}

export function drawPalette(host: HTMLElement, ctx: PaletteCtx): PaletteHandle {
	let hover: number | null = null;
	let pop: { el: HTMLElement; owner: Component | null } | null = null;

	const hide = (): void => {
		if (hover !== null) window.clearTimeout(hover);
		hover = null;
		if (!pop) return;
		const { el, owner } = pop;
		pop = null;
		if (owner) {
			ctx.owner()?.removeChild(owner);
			owner.unload();
		}
		el.remove();
	};

	const show = (piece: PalettePiece): void => {
		hide();
		if (ctx.phone) return;
		const name = pieceName(piece);
		const el = ctx.shell.createDiv({ cls: "booklet-design-samplepop", attr: { role: "group", "aria-label": ui("cat.sample.label", { name }) } });
		const owner = ctx.owner()?.addChild(new Component()) ?? null;
		pop = { el, owner };
		const kind = sampleOf({ group: piece.group, text: piece.text, kinds: piece.kinds ?? [] });
		const into = el.createDiv({ cls: "booklet-design-samplepop-body" });
		let drawn = false;
		if (owner && kind === "question") {
			const q = questionOfPiece(piece.text);
			if (q) drawn = !!drawInertQuestion({ app: ctx.app, owner, sourcePath: "", into, triplet: ctx.triplet }, q.activity, q.question);
		} else if (owner && kind === "reading") {
			drawInertReading({ app: ctx.app, owner, sourcePath: "", into, triplet: ctx.triplet }, piece.text.trimEnd());
			drawn = true;
		}
		// a piece with no drawing is its picture, larger: never its Markdown
		if (!drawn) {
			into.remove();
			drawArt(el.createDiv({ cls: "booklet-design-samplepop-art" }), artOf(piece));
		}
		el.createDiv({ cls: "booklet-design-samplepop-name", text: name });
		quietNames(el);
	};

	const watch = (el: HTMLElement, piece: PalettePiece, why: HTMLElement): void => {
		const start = (): void => {
			if (hover !== null) window.clearTimeout(hover);
			hover = window.setTimeout(() => {
				hover = null;
				show(piece);
			}, 400);
			why.setText(el.getAttribute("data-why") ?? "");
		};
		const stop = (): void => {
			hide();
			why.setText("");
		};
		el.addEventListener("mouseenter", start);
		el.addEventListener("focus", start);
		el.addEventListener("mouseleave", stop);
		el.addEventListener("blur", stop);
	};

	// the "adding here" card (its words are painted by the view: `paintWhere`)
	host.createDiv({ cls: "booklet-design-where", attr: { "data-where-card": "" } });

	// the Common row
	const common = host.createDiv({ cls: "booklet-design-common", attr: { role: "group", "aria-label": ui("pal.common") } });
	common.createDiv({ cls: "booklet-design-pal-label", text: ui("pal.common") });
	const chips = common.createDiv({ cls: "booklet-design-chips" });
	const commonWhy = common.createDiv({ cls: "booklet-design-pal-why", attr: { "aria-live": "polite" } });
	for (const file of COMMON_FILES) {
		const piece = pieceByFile(file);
		if (!piece) continue;
		const chip = chips.createEl("button", {
			cls: "booklet-design-commonchip",
			text: pieceName(piece),
			attr: { type: "button", "data-piece": piece.file, "data-focus": `chip:${piece.file}`, "aria-pressed": "false", "aria-disabled": "false" },
		});
		chip.addEventListener("click", () => ctx.press(piece));
		watch(chip, piece, commonWhy);
	}

	for (const g of paletteGroups()) {
		const open = ctx.isOpen(g.id);
		const wrap = host.createDiv({ cls: ["booklet-design-pal-group", ...(open ? ["is-open"] : []), ...(ctx.keyed === g.id ? ["is-keyed"] : [])], attr: { "data-group": g.id } });
		const head = wrap.createEl("button", { cls: "booklet-design-pal-head", attr: { type: "button", "aria-expanded": String(open), "data-focus": `group:${g.id}` } });
		head.createSpan({ cls: "booklet-design-pal-caret", text: open ? "▾" : "▸", attr: { "aria-hidden": "true" } });
		head.createSpan({ cls: "booklet-design-pal-title", text: ui(TITLE_KEY[g.id]) });
		head.createSpan({ cls: "booklet-design-pal-keys", text: groupKeys(g.id), attr: { "aria-hidden": "true" } });
		head.addEventListener("click", () => ctx.toggle(g.id));
		if (!open) continue;
		const grid = wrap.createDiv({ cls: "booklet-design-pal-grid" });
		const why = wrap.createDiv({ cls: "booklet-design-pal-why", attr: { "aria-live": "polite" } });
		for (const piece of g.pieces) {
			const name = pieceName(piece);
			const tile = grid.createEl("button", {
				cls: ["booklet-design-tile"],
				attr: { type: "button", draggable: "true", "data-piece": piece.file, "data-focus": `tile:${piece.file}`, "aria-pressed": "false", "aria-disabled": "false", "aria-label": name },
			});
			drawArt(tile.createSpan({ cls: "booklet-design-tile-art", attr: { "aria-hidden": "true" } }), artOf(piece));
			tile.createSpan({ cls: "booklet-design-tile-label", text: name });
			const keys = keysText(piece);
			if (keys) tile.createSpan({ cls: "booklet-design-tile-key", text: keys, attr: { "aria-hidden": "true" } });
			tile.addEventListener("click", () => {
				hide();
				ctx.press(piece);
			});
			tile.addEventListener("dragstart", (evt) => {
				hide();
				ctx.dragStart(piece, evt);
			});
			tile.addEventListener("dragend", () => ctx.dragEnd());
			watch(tile, piece, why);
		}
	}
	return { dispose: hide };
}
