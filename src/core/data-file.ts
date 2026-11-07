/*
 * A `booklet data <file.json> [key.path]` block (SPEC section 7, "Rows from a file"): its rows come from a JSON file beside the
 * note, in the note's own folder or below, and not from the fence. Here is the pure part, as booklet.html's region 12 does it: the
 * checked file name and key path, what a file holds at a key path (read once for each file and path), the fence's own `fields` laid
 * over the file's, and the words of the quiet box that stands in a view's place when the file cannot be read. Reading the file from
 * the vault, and drawing again when it changes, are the view's (data-files.ts). Plain TypeScript: nothing here imports Obsidian.
 */
import { isRowObj, readDataRows, type DataRows, type FieldEdit } from "./data";

/** The most characters of a data file's name (the images' limit, SPEC section 6). */
export const DATA_NAME_MAX = 200;
/** The largest data file read, in bytes (booklet.html's LINK_BYTES: the same file reads the same way here). */
export const DATA_FILE_MAX = 5 * 1024 * 1024;

/** What a `booklet data` fence line names: the file, the key path inside it, and whether either is a name that is never read. */
export interface DataFileRef {
	name: string;
	path: string;
	bad: boolean;
}

/** A data fence's key path: none, or keys joined by dots, each of letters, digits, `_` and `-`. */
export function dataKeyPathOk(k: string): boolean {
	return k === "" || k.split(".").every((x) => /^[A-Za-z0-9_-]+$/.test(x));
}

/**
 * The file name, when it is one a data block may name: letters, digits, `_`, `.`, `/` and `-`, at most 200 characters, relative to
 * the note's own folder, no part that is empty or begins with a dot (so no `..`, no `./`, no leading `/`, no `//`), no scheme and no
 * backslash, and ending `.json`. Null for any other.
 */
export function dataFilePath(raw: unknown): string | null {
	const p = typeof raw === "string" ? raw : "";
	if (!p || p.length > DATA_NAME_MAX || p.charAt(0) === "/" || !/^[A-Za-z0-9_./-]+$/.test(p)) return null;
	if (p.split("/").some((x) => x === "" || x.charAt(0) === ".")) return null;
	return /\.json$/.test(p) && p.length > 5 ? p : null;
}

/** The vault path of a checked file name: the note's own folder, then the name. Null when the name is not one that is read. */
export function dataVaultPath(notePath: string, name: string): string | null {
	const p = dataFilePath(name);
	if (p === null) return null;
	const slash = notePath.lastIndexOf("/");
	return slash < 0 ? p : `${notePath.slice(0, slash)}/${p}`;
}

/** The quiet box's words, in the renderer's own. The file's name is the one the fence line gave. */
export const DATA_WORDS = {
	loading: (f: string) => `Loading ${f}…`,
	refused: (f: string) => `Data not shown: “${f}” is not a name this plugin reads (a .json file beside the note).`,
	missing: (f: string) => `Data not shown: the file ${f} was not found.`,
	big: (f: string) => `Data not shown: the file ${f} is too big (the limit is 5 MB).`,
	wrong: (f: string) => `Data not shown: the file ${f} is not JSON.`,
	failed: (f: string) => `Data not shown: the file ${f} could not be read.`,
	nopath: (f: string, k: string) => `Data not shown: the file ${f} has nothing at “${k}”.`,
	bad: (f: string, why: string) => `Data not shown: the file ${f} ${why}.`,
};

/** Why a file was not read, as a key of the words above. */
export type DataFileError = "missing" | "big" | "wrong" | "failed";

/** What the file holds at a block's key path: the words for the quiet box, or the rows (readDataRows) the file holds there. */
export type DataFound = { note: string } | { d: DataRows };

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** What a file's JSON holds at a block's key path. It does not depend on the block, so it is made once for every block that names the file and the path. */
export function dataRead(file: DataFileRef, json: unknown): DataFound {
	let at: unknown = json;
	const path = file.path === "" ? [] : file.path.split(".");
	for (const k of path) {
		if (!isRowObj(at) || !own(at, k)) return { note: DATA_WORDS.nopath(file.name, file.path) };
		at = at[k];
	}
	const d = readDataRows(at);
	if ("bad" in d) return { note: DATA_WORDS.bad(file.name, d.bad) };
	return { d };
}

/** What a block's fence says over the file: its own `fields` (labels) and `edit` marks, laid over the file's block by block. */
export interface FenceOver {
	fields: Record<string, string> | null;
	edits: Record<string, FieldEdit>;
}

/** The rows of one block from what the file holds there: the block's own fence labels and marks laid over the file's. */
export function dataMerge(found: DataFound, fence: FenceOver | null): { data: DataRows } | { note: string } {
	if ("note" in found) return found;
	const d = found.d;
	const fields = fence && (fence.fields || d.fields) ? { ...(d.fields ?? {}), ...(fence.fields ?? {}) } : null;
	return { data: { rows: d.rows, fields, edits: { ...d.edits, ...(fence ? fence.edits : {}) } } };
}
