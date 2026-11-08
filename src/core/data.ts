/*
 * A `booklet data` block's rows (SPEC section 7, "Data: rows a generator wrote"), read from the block's JSON as booklet.html's
 * readData reads them: an object with `rows` (and, optionally, `fields`: each key's label, in the order they are shown),
 * or just the list of rows. A value is a string, a number, `true`, `false`, `null`, a flat list of those, a list of rows (objects)
 * or one row (an object): a row that holds rows has children, to any depth (format 0.19). A list is all values or all rows. A
 * field's label in `fields` is a string, or an object `{ label, edit, options }`: the label is read, and `edit` and `options` are
 * used by a reader that edits (ask.ts editSpecOf; the view draws a marked field as a box). The block belongs to whoever wrote the file: it is read here, drawn by a
 * query, and never written. Plain TypeScript: nothing here imports Obsidian.
 */

/** One plain value of a data row: a list of these is shown comma-separated. */
export type DataValue = string | number | boolean | null;

/** A data row: each key a field. A field that holds a list of rows, or one row, makes those rows the row's children. */
export interface DataRow {
	[key: string]: DataValue | DataValue[] | DataRow | DataRow[];
}

/** What a field's label object said about editing it. Read here, used by ask.ts (editSpecOf) to say which fields are edited and in what kind of box. */
export interface FieldEdit {
	edit?: unknown;
	options?: unknown;
}

/**
 * The rows of a data block, its declared fields (key to label, in order, or null when it declares none) and the `edit` marks of its labels.
 * `idFormat` and `idPattern` are the two optional keys beside `fields` that say how the id of a row the reader adds is made (row-id.ts):
 * kept as written, whatever they hold, and checked by whoever uses them (absent: undefined).
 */
export interface DataRows {
	rows: DataRow[];
	fields: Record<string, string> | null;
	edits: Record<string, FieldEdit>;
	idFormat?: unknown;
	idPattern?: unknown;
}

/** Why a block cannot be read, in the words the note's problems use ("a data block ..."). */
export const DATA_PROBLEMS = {
	noRows: "holds no list of rows (an object with `rows`, or the list itself)",
	rowNotObject: "has a row that is not an object",
	mixed: "has a list that mixes values and rows (a list is all values or all rows)",
	fieldsBad: "has `fields` that is not an object of labels (each label a string, or an object with a `label`)",
};

const flat = (v: unknown): v is DataValue => v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/** Is this a row: a plain object (not a list, not nothing)? */
export const isRowObj = (v: unknown): v is DataRow => !!v && typeof v === "object" && !Array.isArray(v);

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** A block's `fields`: each label a string or an object with a string `label` (or none: the key is its own label). */
export function readFields(f: unknown): { fields: Record<string, string>; edits: Record<string, FieldEdit> } | { bad: string } {
	if (!isRowObj(f)) return { bad: DATA_PROBLEMS.fieldsBad };
	// built with fromEntries, which makes each key an own property of its own: a key named `__proto__` stays a key
	const labels: [string, string][] = [];
	const marks: [string, FieldEdit][] = [];
	for (const [k, v] of Object.entries(f)) {
		if (typeof v === "string") {
			labels.push([k, v]);
			continue;
		}
		if (isRowObj(v) && (v["label"] === undefined || typeof v["label"] === "string")) {
			labels.push([k, v["label"] === undefined ? k : v["label"]]);
			if (v["edit"] !== undefined || v["options"] !== undefined) marks.push([k, { edit: v["edit"], options: v["options"] }]);
			continue;
		}
		return { bad: DATA_PROBLEMS.fieldsBad };
	}
	return { fields: Object.fromEntries(labels), edits: Object.fromEntries(marks) };
}

/**
 * The rows of a data block's JSON, or the reason it cannot be read. Rows are walked with a stack of their own, so a chain
 * thousands deep is a file that opens, not a stack overflow.
 */
export function readDataRows(json: unknown): DataRows | { bad: string } {
	const obj = isRowObj(json) ? json : null;
	const rows = Array.isArray(json) ? json : obj ? obj["rows"] : null;
	if (!Array.isArray(rows)) return { bad: DATA_PROBLEMS.noRows };
	const todo: unknown[] = rows.slice().reverse();
	while (todo.length) {
		const r = todo.pop();
		if (!isRowObj(r)) return { bad: DATA_PROBLEMS.rowNotObject };
		for (const v of Object.values(r)) {
			if (flat(v)) continue;
			if (isRowObj(v)) {
				todo.push(v);
				continue;
			}
			if (!Array.isArray(v)) return { bad: DATA_PROBLEMS.mixed };
			if (v.every(flat)) continue;
			if (!v.every(isRowObj)) return { bad: DATA_PROBLEMS.mixed };
			for (const x of v) todo.push(x);
		}
	}
	let fields: Record<string, string> | null = null;
	let edits: Record<string, FieldEdit> = {};
	if (obj && obj["fields"] !== undefined) {
		const f = readFields(obj["fields"]);
		if ("bad" in f) return f;
		fields = f.fields;
		edits = f.edits;
	}
	const out: DataRows = { rows: rows as DataRow[], fields, edits };
	if (obj && obj["idFormat"] !== undefined) out.idFormat = obj["idFormat"];
	if (obj && obj["idPattern"] !== undefined) out.idPattern = obj["idPattern"];
	return out;
}

/** A field's value as a list of child rows: a non-empty list whose first member is a row, or one row. Else none (the value is plain). */
export function childRowsOf(v: unknown): DataRow[] | null {
	if (Array.isArray(v)) return v.length && isRowObj(v[0]) ? (v as DataRow[]) : null;
	return isRowObj(v) ? [v] : null;
}

/** A row's own value of a field, never a member the object inherits (a field named `constructor` or `toString`). */
export const ownValue = (r: DataRow, k: string): DataRow[string] | undefined => (own(r, k) ? r[k] : undefined);

/**
 * The field of a row that new child rows are added to (contract section 9, item 3): its only candidate, a candidate being a field whose
 * value is a list whose items are all objects. An empty list is a candidate, so a row with `"jobs": []` takes its first child. Null when it
 * has no candidate (no list, a list of values, a child held as one object) or more than one.
 */
export function childListKey(r: DataRow): string | null {
	let key: string | null = null;
	for (const [k, v] of Object.entries(r)) {
		if (!Array.isArray(v) || !v.every(isRowObj)) continue;
		if (key !== null) return null;
		key = k;
	}
	return key;
}
