/*
 * The pieces the panel places, grouped. The list is the pieces/ folder (pieces-table.ts, generated); what each piece is made of is
 * read from its own text with the same scan the panel places with, so the panel and the tests agree on what a piece holds. Nothing
 * here is a hand-written list of kinds: test/editor-tables.test.mjs holds the pieces against the linter's kinds and query views.
 * Plain TypeScript: nothing here imports Obsidian.
 */
import { PIECE_SOURCES, type PieceSource } from "./pieces-table";
import { LP } from "./editor-patterns";
import { scan } from "./editor-scan";

export type PieceGroup = PieceSource["group"];

export interface Piece extends PieceSource {
	/** The Booklet kinds its lines hold (`activity`, `choice`, ...), in the order met, each once. */
	kinds: string[];
	/** The `as:` of each query it holds. */
	views: string[];
}

/** The groups as the panel lists them, in order, with their headings. */
export const PIECE_GROUPS: readonly { id: PieceGroup; title: string }[] = [
	{ id: "structure", title: "Structure" },
	{ id: "questions", title: "Questions" },
	{ id: "reading", title: "Reading" },
	{ id: "data", title: "Data" },
	{ id: "views", title: "Views of data" },
];

function holds(text: string): { kinds: string[]; views: string[] } {
	const kinds: string[] = [];
	const views: string[] = [];
	const s = scan(text);
	const lines = text.split("\n");
	for (const l of lines) {
		const m = LP.CALLOUT_LINE.exec(l.replace(/^(?:>[ \t]?)+(?=>)/, ""));
		const k = (m?.[1] ?? "").toLowerCase();
		if (k && !kinds.includes(k)) kinds.push(k);
	}
	for (const it of s.items) {
		if (it.type !== "fence" || !/^booklet[ \t]+query\b/i.test(it.info ?? "")) continue;
		const body = lines.slice(it.line + 1, it.end ?? it.line + 1);
		const as = body.map((x) => /^as:[ \t]*(\S+)/i.exec(x)?.[1]).find(Boolean);
		views.push((as ?? "").toLowerCase());
	}
	return { kinds, views };
}

export const PIECES: readonly Piece[] = PIECE_SOURCES.map((p) => ({ ...p, ...holds(p.text) }));

export const piecesOf = (group: PieceGroup): Piece[] => PIECES.filter((p) => p.group === group);
