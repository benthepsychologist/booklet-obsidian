/*
 * A `booklet data` block's rows (SPEC section 7, "Data: rows a generator wrote"), read from the block's JSON as booklet.html's
 * readData reads them: an object with `rows` (and, optionally, `fields`: each key's label, in the order they are shown),
 * or just the list of rows. A value is a string, a number, `true`, `false`, `null` or a flat list of those; nothing nests
 * deeper. The block belongs to whoever wrote the file: it is read here, drawn by a query, and never written. Plain
 * TypeScript: nothing here imports Obsidian.
 */

/** One value of a data row: a list of these is shown comma-separated, and nothing nests deeper. */
export type DataValue = string | number | boolean | null;

/** A data row: flat, each key a field. */
export type DataRow = Record<string, DataValue | DataValue[]>;

/** The rows of a data block, and its declared fields (key to label, in order), or null when it declares none. */
export interface DataRows {
	rows: DataRow[];
	fields: Record<string, string> | null;
}

/** Why a block cannot be read, in the words the note's problems use ("a data block ..."). */
export const DATA_PROBLEMS = {
	noRows: "holds no list of rows (an object with `rows`, or the list itself)",
	rowNotObject: "has a row that is not an object",
	nestsDeep: "has a value that nests deeper than a list",
	fieldsBad: "has `fields` that is not an object of labels",
};

const flat = (v: unknown): v is DataValue => v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/** The rows of a data block's JSON, or the reason it cannot be read. */
export function readDataRows(json: unknown): DataRows | { bad: string } {
	const obj = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
	const rows = Array.isArray(json) ? json : obj ? obj["rows"] : null;
	if (!Array.isArray(rows)) return { bad: DATA_PROBLEMS.noRows };
	for (const r of rows) {
		if (!r || typeof r !== "object" || Array.isArray(r)) return { bad: DATA_PROBLEMS.rowNotObject };
		for (const v of Object.values(r as Record<string, unknown>)) if (!flat(v) && !(Array.isArray(v) && v.every(flat))) return { bad: DATA_PROBLEMS.nestsDeep };
	}
	let fields: Record<string, string> | null = null;
	if (obj && obj["fields"] !== undefined) {
		const f = obj["fields"];
		if (!f || typeof f !== "object" || Array.isArray(f) || !Object.values(f).every((x) => typeof x === "string")) return { bad: DATA_PROBLEMS.fieldsBad };
		fields = f as Record<string, string>;
	}
	return { rows: rows as DataRow[], fields };
}
