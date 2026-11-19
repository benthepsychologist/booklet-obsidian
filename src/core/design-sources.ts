/*
 * What a question can name on its line, from the note around it: the source of an `each:` (a choice, a multi or a widget of the same
 * activity, or a data block in reach, SPEC section 5, "A question asked for each pick" and "A question asked for each row") and the data
 * block a widget embeds (SPEC section 7). The Design view's pickers offer these, as its shared-menu picker offers the menus
 * (design-options.ts `menusVisibleTo`). Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * The lists are the ones the reader and the linter would accept: a source is never the question itself, never a question that has an
 * `each:` of its own (one level only), and never of a kind other than a choice, a multi or a widget; a data block is in reach when it is in
 * the question's module or shared by every module (SPEC section 4). The note is read as the reader reads it, so a note the reader cannot
 * read gives nothing.
 */
import { parseBooklet, questionsOf, type Booklet } from "./reader";

export interface EachSource {
	id: string;
	/** A choice, a multi or a widget of the same activity, or a data block in reach. */
	kind: "choice" | "multi" | "widget" | "data";
}

export interface WidgetRef {
	id: string;
	/** The module the block is written in, or null for one every module shares. */
	module: string | null;
	/** The line the block's fence starts on (0-based). */
	line: number;
	/** What `engine` the block names (`svg-regions`, `grid-select`), or "" when it names none. */
	engine: string;
}

/** The activity and module the question that starts on this line (0-based) is in, or null when the reader finds no such question. */
function placeOf(book: Booklet, questionLine: number): { act: Booklet["activities"][number]; module: string | null } | null {
	for (const a of book.activities) for (const q of questionsOf(a)) if (q.line === questionLine + 1) return { act: a, module: a.scope || null };
	return null;
}

/** The things the question that starts on this line can take as the source of its `each:`, in the order the note has them (questions first, then data blocks). */
export function eachSourcesFor(text: string, questionLine: number): EachSource[] {
	const book = parseBooklet(text);
	const at = placeOf(book, questionLine);
	if (!at) return [];
	const self = questionsOf(at.act).find((q) => q.line === questionLine + 1);
	const out: EachSource[] = [];
	for (const q of questionsOf(at.act)) {
		if (!q.id || q === self || q.id === self?.id) continue;
		if (q.kind !== "choice" && q.kind !== "multi" && q.kind !== "widget") continue;
		if (q.each !== null) continue;
		if (!out.some((x) => x.id === q.id)) out.push({ id: q.id, kind: q.kind });
	}
	for (const d of book.data) {
		if (d.module !== null && d.module !== at.module) continue;
		if (!out.some((x) => x.id === d.id)) out.push({ id: d.id, kind: "data" });
	}
	return out;
}

/** The widget data blocks the question that starts on this line can embed: the ones of its own module and the ones every module shares. */
export function widgetBlocksFor(text: string, questionLine: number): WidgetRef[] {
	const book = parseBooklet(text);
	const at = placeOf(book, questionLine);
	if (!at) return [];
	return book.widgets
		.filter((w) => w.module === null || w.module === at.module)
		.map((w) => ({ id: w.id, module: w.module, line: w.line - 1, engine: typeof w.data["engine"] === "string" ? w.data["engine"] : "" }));
}
