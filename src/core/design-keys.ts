/*
 * The Design view's nested hotkeys, as data. Plain TypeScript: nothing here imports Obsidian or the DOM, so the tree is tested without
 * a view.
 *
 * The first key picks a group: `s` Structure, `q` Questions, `r` Reading aids, `v` Views, `d` Data. The second picks a piece in it,
 * and a third picks a variant of that piece (an activity that repeats daily is a variant of the activity that keeps entries). Enter on
 * a piece takes it as it stands. `s` `m` Enter adds a module and `q` `m` Enter adds a matrix.
 *
 * The pieces are the panel's own pieces table (editor-pieces.ts, 56 of them), so the keys can never drift from it: every piece is in the
 * tree exactly once, as an entry or as a variant, and the tests walk all of them.
 *
 * The letters. Structure and Questions use exactly the proposal of the design note (2026-11-13, section 6; Ben's answer D5: ship them as
 * proposed). Every other piece, and the pieces the proposal does not name, take the FIRST FREE letter of their label in their group:
 *   1. the pieces are taken in the pieces table's order (the file names, alphabetical);
 *   2. a piece takes the first letter of its label (a to z, in the order they are written, counting only letters) that no earlier piece
 *      of the group has;
 *   3. if every letter of the label is taken, the first free letter of the alphabet, then the digits 1 to 9.
 * A variant takes the first free letter of its own qualifier among the variants of its piece. A piece written `name (qualifier)` is a
 * variant of the piece `name` when that piece is in the group; when it is not, the first of such pieces is the entry (its label is the
 * name) and the rest are its variants (`group (folded)`, `group (steps)`). Two exceptions are written out below, because the proposal
 * makes them so: the activity that keeps entries is its own key, and `activity (repeat daily)` is its variant.
 */
import { PIECES, type Piece, type PieceGroup } from "./editor-pieces";

export interface KeyGroup {
	/** The key that picks the group. */
	key: string;
	id: PieceGroup;
	title: string;
	/** One sentence for the popup. */
	blurb: string;
}

export const KEY_GROUPS: readonly KeyGroup[] = [
	{ key: "s", id: "structure", title: "Structure", blurb: "The parts a booklet is built of: modules, activities, tabs, pages, rows, and the lines around them." },
	{ key: "q", id: "questions", title: "Questions", blurb: "What a reader answers: choices, text, numbers, scales, dates, matrices, listening and widgets." },
	{ key: "r", id: "reading", title: "Reading aids", blurb: "Things to read: callouts, hints, quotes, images, citations and groups." },
	{ key: "v", id: "views", title: "Views", blurb: "Kept entries and data shown as a table, list, cards, tiles, bars or a line." },
	{ key: "d", id: "data", title: "Data", blurb: "Rows and figures a booklet keeps for its views and activities to read." },
];

/** The proposed letters (design note, section 6): letter -> the piece's label, in the order the note lists them. */
const PROPOSED: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
	structure: [
		["m", "module"],
		["a", "activity"],
		["t", "tab"],
		["p", "page"],
		["r", "row"],
		["n", "notice"],
		["e", "activity (repeat)"],
		["d", "data section"],
		["b", "page break"],
		["f", "front matter"],
	],
	questions: [
		["c", "choice"],
		["x", "multi"],
		["m", "matrix"],
		["l", "lines"],
		["t", "text"],
		["n", "number"],
		["s", "scale"],
		["d", "date"],
		["a", "listen"],
		["w", "widget (grid)"],
	],
};

/** What a proposed entry is called when its piece's label would not say it. */
const ENTRY_TITLE: Readonly<Record<string, string>> = { "activity (repeat)": "activity that keeps entries", multi: "multi (checkboxes)" };

/** `activity (repeat)` is an entry of its own, and `activity (repeat daily)` hangs under it, not under the plain activity. */
const STANDS_ALONE: ReadonlySet<string> = new Set(["activity (repeat)"]);
const VARIANT_OF: Readonly<Record<string, string>> = { "activity (repeat daily)": "activity (repeat)" };
const VARIANT_TITLE: Readonly<Record<string, string>> = { "activity (repeat daily)": "daily" };

export interface KeyVariant {
	key: string;
	label: string;
	piece: Piece;
}

export interface KeyEntry {
	key: string;
	label: string;
	/** What Enter on this entry places. */
	piece: Piece;
	variants: KeyVariant[];
}

export interface KeyGroupTree extends KeyGroup {
	entries: KeyEntry[];
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz123456789";

/** The first letter of the label that is free, else the first free of a to z and 1 to 9. */
function freeLetter(label: string, taken: ReadonlySet<string>): string {
	for (const ch of label.toLowerCase()) if (/[a-z]/.test(ch) && !taken.has(ch)) return ch;
	for (const ch of ALPHABET) if (!taken.has(ch)) return ch;
	return "";
}

const baseOf = (label: string): { base: string; qualifier: string } | null => {
	const m = /^(.*?)\s*\((.*)\)\s*$/.exec(label);
	return m ? { base: (m[1] ?? "").trim(), qualifier: (m[2] ?? "").trim() } : null;
};

function treeOf(group: KeyGroup): KeyGroupTree {
	const pieces = PIECES.filter((p) => p.group === group.id);
	const byLabel = new Map(pieces.map((p) => [p.label, p]));
	// which pieces hang under which: the variants of each entry piece, in table order
	const entryOf = new Map<Piece, Piece>();
	const bases = new Map<string, Piece[]>();
	for (const p of pieces) {
		const b = baseOf(p.label);
		if (b && !STANDS_ALONE.has(p.label)) bases.set(b.base, [...(bases.get(b.base) ?? []), p]);
	}
	for (const p of pieces) {
		const forced = VARIANT_OF[p.label];
		if (forced) {
			const up = byLabel.get(forced);
			if (up) entryOf.set(p, up);
			continue;
		}
		const b = baseOf(p.label);
		if (!b || STANDS_ALONE.has(p.label)) continue;
		const plain = byLabel.get(b.base);
		if (plain) entryOf.set(p, plain);
		else {
			// no plain piece: the first of the family is the entry, the rest hang under it
			const family = bases.get(b.base) ?? [];
			const head = family[0];
			if (head && head !== p) entryOf.set(p, head);
		}
	}
	const entryPieces = pieces.filter((p) => !entryOf.has(p));
	const proposed = PROPOSED[group.id] ?? [];
	const order: Piece[] = [];
	const letters = new Map<Piece, string>();
	const taken = new Set<string>();
	for (const [letter, label] of proposed) {
		const p = byLabel.get(label);
		if (!p) continue;
		order.push(p);
		letters.set(p, letter);
		taken.add(letter);
	}
	const label = (p: Piece): string => {
		if (ENTRY_TITLE[p.label]) return ENTRY_TITLE[p.label] as string;
		const fam = [...entryOf.entries()].some(([, e]) => e === p);
		const b = baseOf(p.label);
		// a piece with variants and no plain piece of that name is called by the name its family shares
		return fam && b && !byLabel.has(b.base) ? b.base : p.label;
	};
	for (const p of entryPieces) {
		if (order.includes(p)) continue;
		order.push(p);
		const l = freeLetter(label(p), taken);
		letters.set(p, l);
		taken.add(l);
	}
	const entries: KeyEntry[] = order.map((p) => {
		const kids = pieces.filter((x) => entryOf.get(x) === p);
		const used = new Set<string>();
		const variants = kids.map<KeyVariant>((v) => {
			const text = VARIANT_TITLE[v.label] ?? baseOf(v.label)?.qualifier ?? v.label;
			const key = freeLetter(text, used);
			used.add(key);
			return { key, label: text, piece: v };
		});
		return { key: letters.get(p) ?? "", label: label(p), piece: p, variants };
	});
	return { ...group, entries };
}

/** The whole tree: the five groups, their pieces with their letters, and the variants under them. */
export const KEY_TREE: readonly KeyGroupTree[] = KEY_GROUPS.map(treeOf);

/** The keys that reach a piece, such as `sm` (module), `qm` (matrix) or `sed` (an activity that keeps one entry a day); null when it is not in the tree. */
export function keysOf(piece: Pick<Piece, "file">): string | null {
	for (const g of KEY_TREE) {
		for (const e of g.entries) {
			if (e.piece.file === piece.file) return g.key + e.key;
			const v = e.variants.find((x) => x.piece.file === piece.file);
			if (v) return g.key + e.key + v.key;
		}
	}
	return null;
}

export interface KeyOption {
	key: string;
	label: string;
}

export interface KeyLookup {
	/** Where the keys typed so far stand: nothing yet, a group, a piece (Enter takes it), a variant of one, or nowhere. */
	level: "root" | "group" | "entry" | "variant" | "none";
	group?: KeyGroupTree;
	entry?: KeyEntry;
	variant?: KeyVariant;
	/** What Enter would place: at an entry or a variant. */
	piece?: Piece;
	/** What the next key may be: the groups, a group's pieces, an entry's variants. */
	options: KeyOption[];
}

/** Where a key sequence stands. Letters are read without regard to case; a sequence longer than three keys, or a key that is nothing's, is `none`. */
export function lookupKeys(sequence: string): KeyLookup {
	const seq = sequence.toLowerCase();
	if (!seq) return { level: "root", options: KEY_TREE.map((g) => ({ key: g.key, label: g.title })) };
	const g = KEY_TREE.find((x) => x.key === seq[0]);
	if (!g) return { level: "none", options: [] };
	if (seq.length === 1) return { level: "group", group: g, options: g.entries.map((e) => ({ key: e.key, label: e.label })) };
	const e = g.entries.find((x) => x.key === seq[1]);
	if (!e) return { level: "none", group: g, options: [] };
	if (seq.length === 2) return { level: "entry", group: g, entry: e, piece: e.piece, options: e.variants.map((v) => ({ key: v.key, label: v.label })) };
	const v = e.variants.find((x) => x.key === seq[2]);
	if (!v || seq.length > 3) return { level: "none", group: g, entry: e, options: [] };
	return { level: "variant", group: g, entry: e, variant: v, piece: v.piece, options: [] };
}

export interface KeyHit {
	/** The keys that reach it. */
	keys: string;
	group: KeyGroupTree;
	label: string;
	piece: Piece;
	/** The variant's words, when the hit is a variant. */
	variant?: string;
}

/** Every piece of the tree with its keys, in tree order. */
export function allKeyed(): KeyHit[] {
	const out: KeyHit[] = [];
	for (const g of KEY_TREE) {
		for (const e of g.entries) {
			out.push({ keys: g.key + e.key, group: g, label: e.label, piece: e.piece });
			for (const v of e.variants) out.push({ keys: g.key + e.key + v.key, group: g, label: e.label, piece: v.piece, variant: v.label });
		}
	}
	return out;
}

/**
 * The pieces a typed word narrows the popup to: each space-separated word must appear (any case) in the group's title, the piece's label
 * or its variant's words. No words gives every piece.
 */
export function filterKeyed(typed: string): KeyHit[] {
	const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
	return allKeyed().filter((h) => {
		const hay = [h.group.title, h.group.id, h.label, h.piece.label, h.variant ?? ""].join(" ").toLowerCase();
		return words.every((w) => hay.includes(w));
	});
}

export interface KeyRow {
	/** The letter after the group's key. */
	key: string;
	label: string;
	piece: Piece;
	variants: KeyOption[];
}

/** One group's pieces with their letters, for the popup that opens when the group's key is pressed; null for a key that is no group's. */
export function groupListing(groupKey: string): KeyRow[] | null {
	const g = KEY_TREE.find((x) => x.key === groupKey.toLowerCase());
	if (!g) return null;
	return g.entries.map((e) => ({ key: e.key, label: e.label, piece: e.piece, variants: e.variants.map((v) => ({ key: v.key, label: v.label })) }));
}
