/*
 * What the Design view's catalogue lists and how a block is drawn, decided from data, so it is tested without a DOM. Plain TypeScript:
 * nothing here imports Obsidian or the DOM.
 *
 *   CATALOGUE_GROUPS   the four groups the catalogue folds: Structure, Questions, Reading aids, Views and data (Views and Data merged)
 *   catalogueListing   a container's legal pieces (design-model `addChoices`) laid out in those groups, each with its hotkey letters and
 *                      what its sample is (`sampleOf`)
 *   sampleOf           how a piece is shown in the catalogue: a question drawn inert, a reading callout rendered, a view drawn as its rows, or its picture
 *   blockDrawing       how a block already in the note is shown in the tree, by the same three
 *   hasRemoteMedia     Markdown that would make the renderer fetch something from another site (a drawing never does)
 *   placeFor           where a piece goes for the keys: the selected block's legal place, else the end of the booklet's
 *
 * The list comes from the pieces table (editor-pieces.ts) through `addChoices`, so it cannot drift from it.
 */
import { isContainer, type DesignNode } from "./design-tree";
import { addPosition, canPlacePiece, needsOf, positionAfter, type DesignPosition, type PlaceKind } from "./design-places";
import { WORDS_PIECE, type AddChoices, type AddGroup } from "./design-model";
import { keysOf } from "./design-keys";
import type { Piece, PieceGroup } from "./editor-pieces";

export type CatalogueId = "structure" | "questions" | "reading" | "views-data";

export interface CatalogueGroup {
	id: CatalogueId;
	/** The pieces-table groups it holds, in the order they are listed. */
	holds: readonly PieceGroup[];
}

export const CATALOGUE_GROUPS: readonly CatalogueGroup[] = [
	{ id: "structure", holds: ["structure"] },
	{ id: "questions", holds: ["questions"] },
	{ id: "reading", holds: ["reading"] },
	{ id: "views-data", holds: ["views", "data"] },
];

/** The catalogue group a pieces-table group is listed under. */
export const catalogueOf = (group: PieceGroup): CatalogueId => CATALOGUE_GROUPS.find((g) => g.holds.includes(group))?.id ?? "structure";

/** The question kinds the canvas draws as a reader sees them, with nothing answered (questions.ts `drawBody`, matrix.ts, a widget's engines in engines.ts and listen-view.ts `drawListen`). The one question left a card is one asked for each row of a data block (`askedOfRows`), which is a setting of a line, not a kind: the view finds it in the parsed question. */
export const DRAWN_QUESTIONS: ReadonlySet<string> = new Set(["choice", "multi", "matrix", "lines", "text", "number", "scale", "date", "widget", "listen"]);

/** The reading callouts that are drawn as callouts (Obsidian draws them, and the styles give the format's own three their look). */
export const READING_KINDS: ReadonlySet<string> = new Set(["note", "tip", "example", "hint", "solution", "warning", "law", "diff", "opinion", "question", "quote"]);

export type SampleKind = "question" | "reading" | "view" | "card";

/**
 * How a piece is shown in the catalogue, drawn the way the canvas draws the same piece of a note. A question of a kind the drawing code draws
 * (a widget and a listen among them) is drawn inert; a reading callout, a citation and plain words are rendered; a view of data is drawn as
 * its rows. Everything else (structure, a data block, a lone menu, a group, an image or a figure) is its picture, larger. A piece that holds an
 * image or a fenced block is a picture: a sample is fixed local content and draws no media.
 */
export function sampleOf(p: Pick<Piece, "group" | "text"> & { kinds?: readonly string[] }): SampleKind {
	const kinds = p.kinds ?? [];
	if (p.group === "questions") return kinds.some((k) => DRAWN_QUESTIONS.has(k)) ? "question" : "card";
	if (p.group === "views") return "view";
	if (p.group === "reading") {
		if (/!\[|```/.test(p.text)) return "card";
		if (kinds.length === 0) return "reading";
		return kinds.length === 1 && READING_KINDS.has(kinds[0] ?? "") ? "reading" : "card";
	}
	return "card";
}

export type BlockDrawing = "question" | "reading" | "view" | "card";

/** How a block already in the note is drawn in the tree: a question of a kind the drawing code draws, inert; a reading callout, rendered; a query, its rows; the rest a labelled card. */
export function blockDrawing(n: Pick<DesignNode, "kind" | "detail">): BlockDrawing {
	const detail = n.detail.toLowerCase();
	if (n.kind === "question") return DRAWN_QUESTIONS.has(detail) ? "question" : "card";
	if (n.kind === "query") return "view";
	if (n.kind === "callout") return detail === "copy" ? "card" : "reading";
	return "card";
}

const MEDIA = /!\[|<\s*(?:img|iframe|video|audio|source|embed|object)\b/i;
const URL_ISH = /(?:[a-z][a-z0-9+.-]*:)?\/\/[^\s)\]"'>]+/i;

/**
 * Does this Markdown hold an image, embed or media tag together with an address on another site? Drawing it with Obsidian's renderer would
 * make the app fetch it, and the Design view fetches nothing: it is shown as its Markdown instead. Conservative on purpose: a media mark and
 * any address in the same text is enough. A plain link is not media and is drawn as a link.
 */
export const hasRemoteMedia = (markdown: string): boolean => MEDIA.test(markdown) && URL_ISH.test(markdown);

export interface CatalogueEntry {
	file: string;
	label: string;
	text: string;
	group: PieceGroup;
	/** The hotkey letters that reach it (`sm`), null when the tree does not carry it (the plain "words"). */
	keys: string | null;
	sample: SampleKind;
	/** Where choosing it puts it, in the container the listing was made for. */
	place: AddGroup;
}

export interface CatalogueListing {
	id: CatalogueId;
	entries: CatalogueEntry[];
}

/** The pieces a container may take, laid out in the catalogue's four groups, in the pieces table's order; a group with none is left out. */
export function catalogueListing(choices: AddChoices, pieces: readonly Piece[]): CatalogueListing[] {
	const byFile = new Map<string, Piece>(pieces.map((p) => [p.file, p]));
	const seen = new Set<string>();
	const entries: CatalogueEntry[] = [];
	for (const place of choices.groups)
		for (const p of place.pieces) {
			if (seen.has(p.file)) continue;
			seen.add(p.file);
			const whole = byFile.get(p.file);
			entries.push({ file: p.file, label: p.label, text: p.text, group: p.group, keys: whole ? keysOf(whole) : null, sample: sampleOf(whole ?? { ...p, kinds: [] }), place });
		}
	const order = (e: CatalogueEntry): number => (e.file === WORDS_PIECE.file ? 1 : 0);
	return CATALOGUE_GROUPS.map((g) => ({
		id: g.id,
		entries: g.holds.flatMap((h) => entries.filter((e) => e.group === h)).sort((a, b) => order(a) - order(b)),
	})).filter((g) => g.entries.length > 0);
}

export type Placed = { ok: true; position: DesignPosition; note?: string } | { ok: false; reason: string };

/** The kind a piece's first part is, as `addPosition` knows it: a tab is a module's or an activity's by the container it would go in. */
function placeKindFor(piece: Pick<Piece, "file" | "text">, container: DesignNode): PlaceKind {
	const need = needsOf(piece)[0];
	if (need === "tab") return container.kind === "module" ? "module-tab" : "activity-tab";
	return need ?? "text";
}

/**
 * Where a piece goes for the keys. With a block selected: inside it when it is a container and the format allows the piece there (at the
 * end of what it holds, or where `addPosition` puts that kind), else just after it, else just after each block around it, innermost first;
 * the first place the format allows. With nothing selected: the end of the booklet's own place for that kind. Never a place the format
 * refuses: when there is none, the reason is the one the first place gave (the selected block's own), in the words of design-places.
 */
export function placeFor(root: DesignNode, selected: DesignNode | null, piece: Pick<Piece, "file" | "text">): Placed {
	const start = selected ?? root;
	const places: DesignPosition[] = [];
	if (isContainer(start)) places.push(addPosition(start, placeKindFor(piece, start)));
	for (let c: DesignNode = start; c.parent; c = c.parent) {
		const after = positionAfter(c);
		if (after) places.push(after);
	}
	let first: Placed | null = null;
	for (const position of places) {
		const r = canPlacePiece(position, piece);
		if (r.ok) return r.note ? { ok: true, position, note: r.note } : { ok: true, position };
		first ??= { ok: false, reason: r.reason };
	}
	return first ?? { ok: false, reason: "There is no place for it here." };
}
