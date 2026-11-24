/*
 * The settings that name another part of the note, as pickers in the Design view's box: an activity's `tab:` (a tab of its module), a
 * page's `parent:` (another page of its tab), a copy button's `of:` (the questions of its activity, in the order they are copied) and
 * an activity's `entries:folded`. Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * What a picker offers is what the reader and the linter would accept (SPEC section 3 for `tab:` and `parent:`, section 3 "Kept entries,
 * folded" and section 6 "Copy" for `entries:` and `of:`), read from the tree of the note. A value the note already holds that a picker
 * cannot offer (a tab that is not there, a page that is not in this tab, a block's id in an `of:`) is NEVER rewritten by the picker: it is
 * shown as what it is, kept as written, and changes only when the person chooses something else for it. Every change is a change of
 * one setting's value on the block's opening line, through `formChange` (design-form.ts): the other words of the line keep their bytes.
 */
import { COPY_KINDS } from "./copy";
import { helpOf } from "./design-helps";
import { blockLines } from "./design-ops";
import { walkDesign, type DesignNode } from "./design-tree";
import { parseLine } from "./editor-line";

/** One thing a picker offers: the value it writes and the words that say what it is. */
export interface Choice {
	value: string;
	/** The title it has in the note, "" when it has none. */
	title: string;
}

// ---------------------------------------------------------------- an activity's tab

/** The tabs of the module an activity stands in, in the order the module lists them; none when the activity is not in a module or its module has no tab. */
export function tabChoices(activity: DesignNode): Choice[] {
	const m = activity.parent;
	if (activity.kind !== "activity" || !m || m.kind !== "module") return [];
	const out: Choice[] = [];
	for (const t of m.children) if (t.kind === "module-tab" && t.id && !out.some((x) => x.value === t.id)) out.push({ value: t.id, title: t.label });
	return out;
}

/** Why `value` cannot be written as this activity's `tab:`, or null: it must name a tab of the module (or be nothing, which takes the setting off). */
export function tabProblem(activity: DesignNode, value: string): string | null {
	if (activity.kind !== "activity") return "Only an activity takes a tab.";
	if (value === "") return null;
	if (!tabChoices(activity).some((c) => c.value === value)) return "That is not a tab of this module.";
	return null;
}

// ---------------------------------------------------------------- a page's parent

/** The page the `parent:` id names in this tab: the first page with that id (SPEC section 3: "of two pages with one id the first is the parent"). */
function pageById(pages: readonly DesignNode[], id: string): DesignNode | undefined {
	return pages.find((p) => p.id === id);
}

/** The pages of the tab (or of the activity with no tab) that this page stands in, itself included, in the file's order. */
export function tabPages(page: DesignNode): DesignNode[] {
	return page.kind === "page" && page.parent ? page.parent.children.filter((c) => c.kind === "page") : [];
}

/**
 * Would `parent:<id>` on this page make a loop: the id names the page itself, or one of its own sub-pages (a page whose `parent:` chain,
 * read as the format reads it, reaches this one)? The format draws such a page once, at the top, and the linter warns.
 */
export function makesLoop(page: DesignNode, id: string): boolean {
	const pages = tabPages(page);
	let cur = pageById(pages, id);
	const seen = new Set<DesignNode>();
	while (cur && !seen.has(cur)) {
		if (cur === page) return true;
		seen.add(cur);
		const up = cur.set["parent"];
		cur = up ? pageById(pages, up) : undefined;
	}
	return false;
}

/** The pages this page may sit under: the others of its tab, never itself and never one of its own sub-pages, each id once, in the file's order. */
export function parentChoices(page: DesignNode): Choice[] {
	const out: Choice[] = [];
	for (const p of tabPages(page)) {
		if (!p.id || out.some((c) => c.value === p.id) || p === page || makesLoop(page, p.id)) continue;
		out.push({ value: p.id, title: p.label });
	}
	return out;
}

/** Why `value` cannot be written as this page's `parent:`, or null: a loop is refused, and so is a page that is not in this tab (nothing takes the setting off). */
export function parentProblem(page: DesignNode, value: string): string | null {
	if (page.kind !== "page") return "Only a page takes a parent.";
	if (value === "") return null;
	if (!tabPages(page).some((p) => p.id === value)) return "That is not a page of this tab.";
	if (makesLoop(page, value)) return "A page cannot sit under itself or under one of its own sub-pages: that would make a loop.";
	return null;
}

// ---------------------------------------------------------------- a copy button's `of:`

export interface CopyChoice {
	/** The word `of:` holds: `id`, `id/hint` or `id/solution`. */
	value: string;
	/** What it names. */
	what: "question" | "hint" | "solution";
	/** The question's kind (`text`, `choice`). */
	kind: string;
	/** The question's title, "" when it has none. */
	title: string;
}

/** The activity a block stands in (the implicit one of a note with no activity line included), or null. */
function activityOf(node: DesignNode): DesignNode | null {
	for (let n: DesignNode | null = node.parent; n; n = n.parent) if (n.kind === "activity") return n;
	return null;
}

/**
 * What a copy button of this activity can copy and the picker offers: the questions of its own activity of the kinds a copy takes and
 * not asked for each pick of another, in the file's order, each followed by its `id/hint` and `id/solution` when it has one folded
 * straight under it (SPEC section 6, "Copy"). A fenced block with a `^id` is a valid word too, and the picker does not offer it: such
 * a word is kept as written.
 */
export function copyChoices(text: string, copy: DesignNode): CopyChoice[] {
	const act = activityOf(copy);
	if (!act) return [];
	const out: CopyChoice[] = [];
	for (const n of walkDesign(act)) {
		if (n.kind !== "question" || !n.id || n.set["each"] !== undefined || !COPY_KINDS.includes(n.detail) || out.some((c) => c.value === n.id)) continue;
		out.push({ value: n.id, what: "question", kind: n.detail, title: n.label });
		const lines = blockLines(text, n);
		for (const part of ["hint", "solution"] as const) {
			const h = helpOf(lines, part);
			// the reader takes the first FOLDED one of the kind as the question's own
			if (h && h.fold === "-") out.push({ value: `${n.id}/${part}`, what: part, kind: n.detail, title: n.label });
		}
	}
	return out;
}

/** The words of an `of:` value, as written, in order; an empty place between two commas is an item of its own (the linter reports it). */
export const copyItems = (value: string): string[] => (value === "" ? [] : value.split(","));

export type CopyEdit =
	| { op: "set"; index: number; value: string }
	| { op: "add"; value: string }
	| { op: "move"; index: number; by: -1 | 1 }
	| { op: "remove"; index: number };

/**
 * An `of:` value after one change of its list: an item chosen in place of another, one added at the end, one moved a place up or down, one
 * taken out. Every item the change does not name is kept exactly as written, in its place. Refused, with a reason, when the item is not
 * a word `of:` can hold, or when the last item would go (a copy button with nothing to copy is an error in the linter).
 */
export function editCopyOf(value: string, edit: CopyEdit): { ok: true; value: string } | { ok: false; reason: string } {
	const items = copyItems(value);
	const no = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
	const word = (v: string): string | null => (/^[A-Za-z0-9][A-Za-z0-9-]*(?:\/(?:solution|hint))?$/.test(v) ? null : "A word to copy is an id, or an id with /hint or /solution after it.");
	if (edit.op === "add" || edit.op === "set") {
		const bad = word(edit.value);
		if (bad) return no(bad);
	}
	if (edit.op === "add") return { ok: true, value: [...items, edit.value].join(",") };
	if (edit.index < 0 || edit.index >= items.length) return no("There is no such item in the list.");
	if (edit.op === "set") items[edit.index] = edit.value;
	else if (edit.op === "remove") {
		if (items.length === 1) return no("A copy button needs something to copy, so the last item stays. Delete the button instead.");
		items.splice(edit.index, 1);
	} else {
		const to = edit.index + edit.by;
		if (to < 0 || to >= items.length) return no("That item is already at the end of the list.");
		const a = items[edit.index] ?? "";
		items[edit.index] = items[to] ?? "";
		items[to] = a;
	}
	return { ok: true, value: items.join(",") };
}

// ---------------------------------------------------------------- an activity's kept entries

export interface EntriesState {
	/** The activity is a `repeat` one: the setting does something there (SPEC section 3), and nowhere else. */
	applies: boolean;
	/** The line says `entries:folded`. */
	folded: boolean;
	/** The line says `entries:` with another value, which is kept as written (the format reports it and ignores it); null when it has none or says `folded`. */
	other: string | null;
}

/** What an activity's opening line says about its kept entries, or null when the line is not an activity's. */
export function entriesState(line: string): EntriesState | null {
	const p = parseLine(line);
	if (!p || p.kind !== "activity") return null;
	const v = p.values.get("entries");
	return { applies: p.flags.has("repeat"), folded: v === "folded", other: v === undefined || v === "folded" ? null : v };
}
