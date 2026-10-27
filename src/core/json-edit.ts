/*
 * Small edits to a record's JSON text, made where the change is and nowhere else. A record block holds
 * other answers and other entries the reader did not change, and those come back exactly as written:
 * no respacing, no re-ordering, no rounding (SPEC section 8; Ben: "in general we don't want it
 * normalizing or standardizing"). So a change is made to the one member or the one item it is about,
 * in the layout the block already uses. Plain TypeScript: nothing here imports Obsidian.
 */

export interface JsonSpan {
	/** The offset of the value's first character, and the offset just past its last. */
	start: number;
	end: number;
}

export interface JsonMember {
	key: string;
	keyStart: number;
	keyEnd: number;
	value: JsonNode;
}

export type JsonNode =
	| (JsonSpan & { kind: "object"; members: JsonMember[] })
	| (JsonSpan & { kind: "array"; elements: JsonNode[] })
	| (JsonSpan & { kind: "value" });

const WS = /[ \t\n\r]/;

/**
 * Reads where each value, member and element of a JSON text sits. Returns null for text that is not
 * one JSON value (the caller only edits blocks that JSON.parse has already read).
 */
export function scanJson(s: string): JsonNode | null {
	let p = 0;
	const ws = () => {
		while (p < s.length && WS.test(s[p]!)) p++;
	};
	const fail = (): never => {
		throw new Error("not JSON");
	};
	const str = (): number => {
		if (s[p] !== '"') fail();
		p++;
		while (p < s.length) {
			const c = s[p];
			if (c === "\\") p += 2;
			else if (c === '"') return ++p;
			else p++;
		}
		return fail();
	};
	const value = (): JsonNode => {
		ws();
		const start = p;
		const c = s[p];
		if (c === "{") {
			p++;
			const members: JsonMember[] = [];
			ws();
			if (s[p] === "}") return { kind: "object", start, end: ++p, members };
			for (;;) {
				ws();
				const keyStart = p;
				const keyEnd = str();
				const key = JSON.parse(s.slice(keyStart, keyEnd)) as string;
				ws();
				if (s[p] !== ":") fail();
				p++;
				const v = value();
				members.push({ key, keyStart, keyEnd, value: v });
				ws();
				if (s[p] === ",") p++;
				else if (s[p] === "}") return { kind: "object", start, end: ++p, members };
				else fail();
			}
		}
		if (c === "[") {
			p++;
			const elements: JsonNode[] = [];
			ws();
			if (s[p] === "]") return { kind: "array", start, end: ++p, elements };
			for (;;) {
				elements.push(value());
				ws();
				if (s[p] === ",") p++;
				else if (s[p] === "]") return { kind: "array", start, end: ++p, elements };
				else fail();
			}
		}
		if (c === '"') return { kind: "value", start, end: str() };
		while (p < s.length && !WS.test(s[p]!) && !",]}".includes(s[p]!)) p++;
		if (p === start) fail();
		return { kind: "value", start, end: p };
	};
	try {
		const v = value();
		ws();
		return p === s.length ? v : null;
	} catch {
		return null;
	}
}

/** How a block lays out its members (or items): written one to a line, or on one line, and with what spacing. */
interface Layout {
	multiline: boolean;
	/** What starts a member's line, after the line break (multi-line layouts only). */
	indent: string;
	/** What comes between one value and the next member: ",\n " or ", " or ",". */
	sep: string;
	/** What comes between a key and its value: ": " or ":". */
	colon: string;
}

const lineIndent = (s: string, at: number): string => {
	const nl = s.lastIndexOf("\n", at - 1);
	const lead = s.slice(nl + 1, at);
	return /^[ \t]*$/.test(lead) ? lead : "";
};

function layoutOf(s: string, node: JsonSpan & { kind: "object" | "array" }, starts: number[], ends: number[], colon: string): Layout {
	const first = starts[0];
	const multiline = first !== undefined && s.slice(node.start, first).includes("\n");
	const last = starts.length - 1;
	const indent = multiline && last >= 0 ? lineIndent(s, starts[last]!) : "";
	let sep: string;
	if (starts.length >= 2) sep = s.slice(ends[last - 1]!, starts[last]!);
	else if (multiline) sep = ",\n" + indent;
	else sep = colon.includes(" ") ? ", " : ",";
	return { multiline, indent, sep, colon };
}

/** A value written to sit in a layout: across lines at the layout's indent, or on one line with its spacing. */
function valueText(v: unknown, layout: Layout): string {
	if (layout.multiline) {
		const step = /^[ \t]{1,10}$/.test(layout.indent) ? layout.indent : " ";
		return JSON.stringify(v, null, step).split("\n").join("\n" + layout.indent);
	}
	const comma = layout.sep.includes(" ") ? ", " : ",";
	const inline = (x: unknown): string => {
		if (Array.isArray(x)) return "[" + x.map(inline).join(comma) + "]";
		if (x && typeof x === "object") return "{" + Object.entries(x).map(([k, y]) => JSON.stringify(k) + layout.colon + inline(y)).join(comma) + "}";
		return JSON.stringify(x);
	};
	return inline(v);
}

const splice = (s: string, from: number, to: number, put: string) => s.slice(0, from) + put + s.slice(to);

function objectAt(code: string): (JsonSpan & { kind: "object"; members: JsonMember[] }) | null {
	const n = scanJson(code);
	return n && n.kind === "object" ? n : null;
}

/**
 * Sets one member of the JSON object `code` to `value`, and returns the new text: the member's value is
 * replaced where it stands, or a new member is added after the last, in the layout the object uses.
 * `fresh` writes a whole new object, for one that holds no member yet. Returns `code` itself when the
 * member already holds that value, and null when `code` is not an object.
 */
export function setMember(code: string, key: string, value: unknown, fresh: (o: Record<string, unknown>) => string): string | null {
	const obj = objectAt(code);
	if (!obj) return null;
	const ms = obj.members;
	if (!ms.length) {
		const o = Object.create(null) as Record<string, unknown>;
		o[key] = value;
		return splice(code, obj.start, obj.end, fresh(o));
	}
	const colonOf = (m: JsonMember) => code.slice(m.keyEnd, m.value.start);
	const layout = layoutOf(code, obj, ms.map((m) => m.keyStart), ms.map((m) => m.value.end), colonOf(ms[ms.length - 1]!));
	const at = ms.map((m) => m.key).lastIndexOf(key);
	if (at >= 0) {
		const m = ms[at]!;
		const was: unknown = JSON.parse(code.slice(m.value.start, m.value.end));
		if (JSON.stringify(was) === JSON.stringify(value)) return code;
		return splice(code, m.value.start, m.value.end, valueText(value, { ...layout, indent: layout.multiline ? lineIndent(code, m.keyStart) : "" }));
	}
	const last = ms[ms.length - 1]!;
	return splice(code, last.value.end, last.value.end, layout.sep + JSON.stringify(key) + layout.colon + valueText(value, layout));
}

/**
 * Removes every member named `key` from the JSON object `code` (a key written twice is read as its last,
 * so leaving an earlier one would bring it back), and returns the new text. An object left with no
 * member is written `{}`. Returns `code` itself when there is no such member, null when it is not an object.
 */
export function removeMember(code: string, key: string): string | null {
	let out = code;
	for (;;) {
		const obj = objectAt(out);
		if (!obj) return null;
		const ms = obj.members;
		const at = ms.map((m) => m.key).lastIndexOf(key);
		if (at < 0) return out;
		if (ms.length === 1) return splice(out, obj.start, obj.end, "{}");
		const m = ms[at]!;
		out = at > 0 ? splice(out, ms[at - 1]!.value.end, m.value.end, "") : splice(out, m.keyStart, ms[1]!.keyStart, "");
	}
}

/** The `items` list of an entries block's object (the last, if the key is written twice), or null. */
function itemsOf(code: string): (JsonSpan & { kind: "array"; elements: JsonNode[] }) | null {
	const obj = objectAt(code);
	if (!obj) return null;
	const m = [...obj.members].reverse().find((x) => x.key === "items");
	return m && m.value.kind === "array" ? m.value : null;
}

/** The span of each item of an entries block's `items` list, or null when the block holds no such list. */
export function itemSpans(code: string): JsonSpan[] | null {
	const arr = itemsOf(code);
	return arr ? arr.elements.map((e) => ({ start: e.start, end: e.end })) : null;
}

/**
 * Adds `itemText` (one entry, already written) after the last item of an entries block's `items` list, in
 * the layout the list uses; an empty list becomes the reference renderer's layout, one item to a line.
 */
export function appendItem(code: string, itemText: string): string | null {
	const arr = itemsOf(code);
	if (!arr) return null;
	const el = arr.elements;
	if (!el.length) return splice(code, arr.start, arr.end, "[\n" + itemText + "\n]");
	const layout = layoutOf(code, arr, el.map((e) => e.start), el.map((e) => e.end), ": ");
	const last = el[el.length - 1]!;
	return splice(code, last.end, last.end, layout.sep + itemText);
}

/** Puts `itemText` in place of the item at `index` of an entries block's `items` list. */
export function replaceItem(code: string, index: number, itemText: string): string | null {
	const arr = itemsOf(code);
	const e = arr?.elements[index];
	if (!arr || !e) return null;
	return splice(code, e.start, e.end, itemText);
}

/** Takes the item at `index` out of an entries block's `items` list, with the comma that joined it. */
export function removeItem(code: string, index: number): string | null {
	const arr = itemsOf(code);
	const el = arr?.elements;
	const e = el?.[index];
	if (!arr || !el || !e) return null;
	if (el.length === 1) return splice(code, arr.start, arr.end, "[]");
	return index > 0 ? splice(code, el[index - 1]!.end, e.end, "") : splice(code, e.start, el[1]!.start, "");
}
