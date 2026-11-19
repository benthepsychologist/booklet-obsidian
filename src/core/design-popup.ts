/*
 * The state of the Design view's key popup, as data: what the keys typed so far mean and what the popup lists. Plain TypeScript: nothing
 * here imports Obsidian or the DOM, so every sequence is tested without a view.
 *
 * A group letter (`s q r v d`) opens the popup on that group. The next letter picks a piece (`s` `m` is the module) and a third a variant of
 * it; Enter takes what is highlighted. A letter that is no piece's letter turns what is typed into a filter: each word typed must appear in
 * a piece's name, its group's name or its variant's words (`filterKeyed`), pieces of the open group first. Arrow keys move the highlight,
 * Backspace takes back one key (and from a group, back to the groups), Escape closes.
 */
import { KEY_TREE, filterKeyed, lookupKeys, type KeyGroupTree } from "./design-keys";
import type { Piece } from "./editor-pieces";

export interface PopupState {
	/** The open group's key, or null at the groups. */
	group: string | null;
	/** What was typed after the group's key. */
	rest: string;
	/** The row an arrow key moved the highlight to; null follows what the letters picked. */
	cursor: number | null;
}

export interface PopupRow {
	/** The letters that reach it, from the first key (`s m`, or `s e d`); empty for a row that is the piece the keys stand on. */
	keys: string;
	label: string;
	/** What the row says of itself: a group's sentence, a variant's words. */
	detail: string;
	/** The piece Enter on this row adds; null for a group's row, which Enter opens. */
	piece: Piece | null;
	/** The group's key a row of the groups opens. */
	opens: string | null;
}

export interface PopupListing {
	mode: "groups" | "pieces" | "variants" | "filter";
	/** The group the listing is in, when there is one. */
	group: KeyGroupTree | null;
	rows: PopupRow[];
	/** The highlighted row, -1 when there are none. */
	cursor: number;
	typed: string;
}

export const popupFor = (groupKey: string | null = null): PopupState => ({ group: groupKey, rest: "", cursor: null });

const spaced = (keys: string): string => keys.split("").join(" ");

/** What the popup lists for a state. */
export function listingOf(state: PopupState): PopupListing {
	const typed = state.rest;
	const group = KEY_TREE.find((g) => g.key === state.group) ?? null;
	if (!group) {
		const rows = KEY_TREE.map<PopupRow>((g) => ({ keys: g.key, label: g.title, detail: g.blurb, piece: null, opens: g.key }));
		return { mode: "groups", group: null, rows, cursor: rows.length ? Math.min(state.cursor ?? 0, rows.length - 1) : -1, typed };
	}
	const look = /\s/.test(typed) ? null : lookupKeys(group.key + typed);
	const clamp = (rows: PopupRow[], auto: number): number => (rows.length ? Math.max(0, Math.min(state.cursor ?? auto, rows.length - 1)) : -1);
	const entryRows = group.entries.map<PopupRow>((e) => ({ keys: spaced(group.key + e.key), label: e.label, detail: "", piece: e.piece, opens: null }));
	if (look && look.level === "group") return { mode: "pieces", group, rows: entryRows, cursor: clamp(entryRows, 0), typed };
	if (look && (look.level === "entry" || look.level === "variant") && look.entry) {
		const e = look.entry;
		if (look.level === "entry" && !e.variants.length) return { mode: "pieces", group, rows: entryRows, cursor: clamp(entryRows, group.entries.indexOf(e)), typed };
		// a piece with variants: the piece as it stands first (Enter takes it), then each variant with its letters
		const rows: PopupRow[] = [{ keys: "", label: e.label, detail: "", piece: e.piece, opens: null }];
		for (const v of e.variants) rows.push({ keys: spaced(group.key + e.key + v.key), label: `${e.label}: ${v.label}`, detail: v.label, piece: v.piece, opens: null });
		return { mode: "variants", group, rows, cursor: clamp(rows, look.variant ? 1 + e.variants.indexOf(look.variant) : 0), typed };
	}
	// no piece has this letter: what is typed filters, the open group's pieces first
	const hits = filterKeyed(typed.trim());
	hits.sort((a, b) => Number(b.group.key === group.key) - Number(a.group.key === group.key));
	const rows = hits.map<PopupRow>((h) => ({ keys: spaced(h.keys), label: h.variant ? `${h.label}: ${h.variant}` : h.label, detail: h.group.title, piece: h.piece, opens: null }));
	return { mode: "filter", group, rows, cursor: clamp(rows, 0), typed };
}

export interface PopupStep {
	/** The popup after the key, null when it closed. */
	state: PopupState | null;
	/** The row Enter took, when the key was Enter on a piece. */
	choose?: PopupRow;
}

/** One key into the popup. A key it has no use for leaves it as it was. */
export function stepPopup(state: PopupState, key: string): PopupStep {
	const list = listingOf(state);
	if (key === "Escape") return { state: null };
	if (key === "Backspace") {
		if (state.rest) return { state: { ...state, rest: state.rest.slice(0, -1), cursor: null } };
		if (state.group) return { state: popupFor() };
		return { state: null };
	}
	if (key === "ArrowDown" || key === "ArrowUp") {
		if (!list.rows.length) return { state };
		const at = Math.max(0, list.cursor) + (key === "ArrowDown" ? 1 : -1);
		return { state: { ...state, cursor: Math.max(0, Math.min(at, list.rows.length - 1)) } };
	}
	if (key === "Enter") {
		const row = list.rows[list.cursor];
		if (!row) return { state };
		if (row.opens) return { state: popupFor(row.opens) };
		return { state, choose: row };
	}
	if (key.length !== 1) return { state };
	const ch = key.toLowerCase();
	if (!state.group) {
		const g = KEY_TREE.find((x) => x.key === ch);
		return g ? { state: popupFor(g.key) } : { state };
	}
	if (ch === " ") return state.rest && !state.rest.endsWith(" ") ? { state: { ...state, rest: state.rest + " ", cursor: null } } : { state };
	if (!/[a-z0-9]/.test(ch)) return { state };
	return { state: { ...state, rest: state.rest + ch, cursor: null } };
}
