/*
 * The id of a row the reader adds (docs: writable data; the data block's `idFormat` and `idPattern`, beside `fields`). A format is literal
 * text and parts in braces, in any order: `{n}` the next whole number, `{n:3}` the same zero-padded to 3 digits (1 to 9), `{time}` UTC
 * `YYYYMMDDhhmmss`, `{date}` UTC `YYYYMMDD`, `{epoch}` seconds since 1970, `{uuid}` a random version-4 UUID, `{field:NAME}` the slug of
 * the new row's value in the field NAME, `{parent}` the parent row's id (empty for a top row). `{{` and `}}` are a literal brace.
 *
 * Everything here is pure: the time ("now") and the random bytes are handed in, so a test is exact, and a refusal is data (a reason and
 * the words the reader is told). Plain TypeScript: nothing here imports Obsidian, Node or Electron; the caller gets random bytes from
 * `crypto.getRandomValues`.
 */

/** One piece of a parsed format. */
export type IdPart =
	| { kind: "text"; text: string }
	| { kind: "n"; width: number }
	| { kind: "time" }
	| { kind: "date" }
	| { kind: "epoch" }
	| { kind: "uuid" }
	| { kind: "field"; name: string }
	| { kind: "parent" };

/** A format read: its parts in order, or why it cannot be (an empty format, an unknown part, an unclosed or a stray brace). */
export type IdFormat = { ok: true; parts: IdPart[]; bare: boolean } | { ok: false; why: string };

/** The words of the id's refusals (the plugin's notices and the form say them as they are). */
export const ID_WORDS = {
	formatBad: "The id format is not valid, so rows cannot be added here.",
	patternBad: "The id pattern is not valid, so rows cannot be added here.",
	/** `label` is the field's label, lowercase. */
	noSlug: (label: string) => `Give it a ${label} first.`,
	clash: "A row with that id exists. Add a part to the id format that tells rows apart (a number, a time or a UUID).",
	/** A format that makes nothing at all (only constants and `{parent}`, and the row has no parent). */
	empty: "That id format makes an empty id here.",
	/** The box was filled but holds no letter a to z or digit once accents are removed. `label` is the field's label as written. */
	noUsable: (label: string) => `'${label}' has no letters or digits an id can use. Type an id, or use another part.`,
	/** A `{field:NAME}` part whose field the form has no box for. `label` is the field's label as written. */
	noBox: (label: string) => `The id format uses ${label}, which this table does not ask for.`,
	typedEmpty: "Give it an id first.",
	typedClash: "A row with that id exists. Choose another id.",
	typedPattern: (pattern: string) => `That id does not fit the pattern ${pattern}.`,
	typedBreak: "An id is one line.",
};

const WIDTHS = /^[1-9]$/;

/**
 * Reads a format. A bare `{n}` (nothing else) is `bare`: the id is then a JSON number. Anything else is a string. A format with two
 * number parts (`{n}` or `{n:W}`) is not valid: it would be the same number written twice (SPEC section 7, "One number part at most").
 */
export function parseIdFormat(format: unknown): IdFormat {
	if (typeof format !== "string" || format === "") return { ok: false, why: "the id format is empty" };
	const parts: IdPart[] = [];
	let text = "";
	const flush = (): void => {
		if (text) parts.push({ kind: "text", text });
		text = "";
	};
	for (let i = 0; i < format.length; ) {
		const c = format[i]!;
		if (c === "{") {
			if (format[i + 1] === "{") {
				text += "{";
				i += 2;
				continue;
			}
			const close = format.indexOf("}", i + 1);
			if (close < 0) return { ok: false, why: "a brace is not closed" };
			const name = format.slice(i + 1, close);
			flush();
			if (name === "n") parts.push({ kind: "n", width: 0 });
			else if (name.startsWith("n:") && WIDTHS.test(name.slice(2))) parts.push({ kind: "n", width: Number(name.slice(2)) });
			else if (name === "time" || name === "date" || name === "epoch" || name === "uuid" || name === "parent") parts.push({ kind: name });
			else if (name.startsWith("field:") && name.length > 6) parts.push({ kind: "field", name: name.slice(6) });
			else return { ok: false, why: `“{${name}}” is not a part of an id` };
			i = close + 1;
			continue;
		}
		if (c === "}") {
			if (format[i + 1] !== "}") return { ok: false, why: "a closing brace has no opening one" };
			text += "}";
			i += 2;
			continue;
		}
		text += c;
		i++;
	}
	flush();
	// a number part is told from its neighbours only by a constant: next to text of any length, or digits, or hex, where it ends is a guess
	for (let i = 0; i < parts.length; i++) {
		if (parts[i]!.kind !== "n") continue;
		for (const j of [i - 1, i + 1]) {
			const k = parts[j]?.kind;
			if (k === "field" || k === "parent" || k === "time" || k === "date" || k === "epoch" || k === "uuid")
				return { ok: false, why: "a number part sits next to another part that is not a constant; put a constant (a hyphen, a letter) between them" };
		}
	}
	if (parts.filter((x) => x.kind === "n").length > 1) return { ok: false, why: "the id format has two number parts; it can have only one" };
	const bare = parts.length === 1 && parts[0]!.kind === "n" && (parts[0] as { width: number }).width === 0;
	return { ok: true, parts, bare };
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/**
 * What an id must look like to count as made by this format: the format turned into a matcher over the whole id. A constant is itself,
 * `{n}` and `{n:W}` are digits, `{time}`, `{date}` and `{epoch}` digits of their length (epoch: one or more), `{uuid}` a UUID, `{field:…}`
 * and `{parent}` any text. The first number part's digits are group 1.
 */
export function idMatcher(parts: readonly IdPart[]): RegExp {
	let first = true;
	const body = parts
		.map((p) => {
			switch (p.kind) {
				case "text":
					return esc(p.text);
				case "n": {
					const g = first ? "(\\d+)" : "\\d+";
					first = false;
					return g;
				}
				case "time":
					return "\\d{14}";
				case "date":
					return "\\d{8}";
				case "epoch":
					return "\\d+";
				case "uuid":
					return UUID;
				default:
					return "[\\s\\S]*";
			}
		})
		.join("");
	return new RegExp(`^${body}$`);
}

/**
 * The next whole number for a format: the highest number found in an id that matches it, plus one; 1 when none does. `ids` are the ids of
 * the block at every depth and of the adds still waiting (a number is read as its digits).
 */
export function nextNumber(parts: readonly IdPart[], ids: readonly (string | number)[]): number {
	if (!parts.some((p) => p.kind === "n")) return 1;
	const re = idMatcher(parts);
	let top = 0;
	for (const id of ids) {
		const m = re.exec(String(id));
		if (!m || m[1] === undefined) continue;
		const n = Number(m[1]);
		if (Number.isSafeInteger(n) && n > top) top = n;
	}
	return top + 1;
}

/**
 * A value as a slug: accents removed (NFD, the combining marks dropped), lowercase; every run of characters other than letters (a to z),
 * digits and hyphens becomes one hyphen; leading and trailing hyphens go. Empty when nothing is left (日本語, an emoji).
 */
export function slugOf(value: unknown): string {
	const s = value === null || value === undefined ? "" : String(value);
	return s
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

const pad = (n: number, w: number): string => String(n).padStart(w, "0");

/** UTC `YYYYMMDDhhmmss` of a moment. */
const timeText = (d: Date): string => `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}${pad(d.getUTCSeconds(), 2)}`;

/** A random version-4 UUID, lowercase, from 16 random bytes. */
export function uuidOf(bytes: ArrayLike<number>): string {
	const b = Array.from({ length: 16 }, (_, i) => (bytes[i] ?? 0) & 255);
	b[6] = (b[6]! & 0x0f) | 0x40;
	b[8] = (b[8]! & 0x3f) | 0x80;
	const h = b.map((x) => x.toString(16).padStart(2, "0")).join("");
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** What an id is made from. */
export interface IdInputs {
	/** Every id of the block at every depth, and the ids of the adds still waiting in the note. */
	ids: readonly (string | number)[];
	/** The new row's values by field name (what the form was given), as words. */
	values: Readonly<Record<string, unknown>>;
	/** The parent row's id; undefined for a top row. */
	parent?: string | number;
	/** The moment of the add. */
	now: Date;
	/** Random bytes (16 are used for a UUID): the caller's `crypto.getRandomValues`. */
	random: (length: number) => ArrayLike<number>;
	/** A field's label, for the words of an empty slug. */
	labelOf?: (field: string) => string;
}

export type MadeId = { ok: true; id: string | number } | { ok: false; why: "format" | "slug" | "clash" | "empty"; message: string; field?: string };

/** How many seconds past the moment of the add a time or epoch id may move to find a free id. */
export const ID_BUMP_SECONDS = 60;

/**
 * Makes the id of a new row from a format. A `{time}` or `{epoch}` id that already exists is tried again one second on, up to 60; any
 * other clash refuses (no silent change). A bare `{n}` makes a number; every other format makes a string. An empty slug refuses, naming the field.
 */
export function makeId(format: unknown, input: IdInputs): MadeId {
	const f = parseIdFormat(format);
	if (!f.ok) return { ok: false, why: "format", message: ID_WORDS.formatBad };
	const taken = new Set(input.ids.map(String));
	const n = nextNumber(f.parts, input.ids);
	// the fixed pieces are worked out once; only time and epoch move
	let uuid: string | null = null;
	for (const p of f.parts) {
		if (p.kind === "field") {
			const slug = slugOf(input.values[p.name]);
			if (!slug) {
				const raw = (input.labelOf ? input.labelOf(p.name) : p.name).trim() || p.name;
				const typed = input.values[p.name];
				const filled = typed !== null && typed !== undefined && String(typed).trim() !== "";
				return { ok: false, why: "slug", field: p.name, message: filled ? ID_WORDS.noUsable(raw) : ID_WORDS.noSlug(raw.toLowerCase()) };
			}
		}
		if (p.kind === "uuid" && uuid === null) uuid = uuidOf(input.random(16));
	}
	const moves = f.parts.some((p) => p.kind === "time" || p.kind === "epoch");
	for (let bump = 0; bump <= (moves ? ID_BUMP_SECONDS : 0); bump++) {
		const at = new Date(input.now.getTime() + bump * 1000);
		let uuidsMade = 0;
		const text = f.parts
			.map((p) => {
				switch (p.kind) {
					case "text":
						return p.text;
					case "n":
						return pad(n, p.width);
					case "time":
						return timeText(at);
					case "date":
						return timeText(at).slice(0, 8);
					case "epoch":
						return String(Math.floor(at.getTime() / 1000));
					case "uuid":
						// each {uuid} in a format is its own UUID
						return uuidsMade++ === 0 ? uuid! : uuidOf(input.random(16));
					case "field":
						return slugOf(input.values[p.name]);
					case "parent":
						return input.parent === undefined ? "" : String(input.parent);
				}
			})
			.join("");
		if (text === "") return { ok: false, why: "empty", message: ID_WORDS.empty };
		if (!taken.has(text)) return { ok: true, id: f.bare ? n : text };
	}
	return { ok: false, why: "clash", message: ID_WORDS.clash };
}

/** The pattern a typed id must fit, or why there is none to use: a pattern that is not a regular expression. */
export function patternOf(pattern: unknown): { ok: true; re: RegExp | null } | { ok: false } {
	if (pattern === undefined || pattern === null) return { ok: true, re: null };
	if (typeof pattern !== "string") return { ok: false };
	try {
		return { ok: true, re: new RegExp(pattern) };
	} catch {
		return { ok: false };
	}
}

/** Checks an id the reader typed (no `idFormat`): not empty, one line, fits the pattern if there is one, and is not an id of the block or a waiting add. */
export function checkTypedId(text: string, pattern: unknown, ids: readonly (string | number)[]): { ok: true; id: string } | { ok: false; message: string } {
	const id = text.trim();
	if (!id) return { ok: false, message: ID_WORDS.typedEmpty };
	if (/[\r\n]/.test(id)) return { ok: false, message: ID_WORDS.typedBreak };
	const p = patternOf(pattern);
	if (!p.ok) return { ok: false, message: ID_WORDS.patternBad };
	if (p.re && !p.re.test(id)) return { ok: false, message: ID_WORDS.typedPattern(String(pattern)) };
	if (ids.some((x) => String(x) === id)) return { ok: false, message: ID_WORDS.typedClash };
	return { ok: true, id };
}
