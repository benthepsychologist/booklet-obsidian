/*
 * The patterns the editing panel reads a booklet with. Every module-level pattern is the linter's own (lint-booklet.py), carried
 * over as source into linter-tables.ts and compiled here, so the panel reads a line the way the linter does: "the same callout
 * rule as the linter" is literally the same expression. test/editor-patterns.test.mjs runs each one in Python and here over the
 * same lines and requires the same answers.
 *
 * A few patterns sit inside the linter's functions rather than at module level, so they cannot be read out; those are ported by
 * hand below, each written exactly as the linter writes it (the test finds each one, verbatim, in the linter's source) and naming
 * where it lives.
 *
 * Python and JavaScript read the same source alike on one line of text, but for a few escapes whose meaning differs outside
 * ASCII. Python's str patterns are Unicode: `\d` is any decimal digit, `\s` any character Python counts as space, `\b` a boundary
 * between word characters (letters, digits, underscore, in any script) and the rest. Those are written out here in their Python
 * meaning; `.` takes the `s` flag so it matches `\r`, U+2028 and U+2029 as Python's does (a line never holds `\n`). An escape this
 * file does not know stops the plugin from loading rather than reading lines differently from the linter. Plain TypeScript:
 * nothing here imports Obsidian.
 */
import { LINTER_TABLES } from "./linter-tables";

// what Python's str.isspace() is true of (and so `\s` in a str pattern)
const PY_SPACE = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
// what Python's `\w` matches in a str pattern: str.isalnum() and underscore
const PY_WORD = "\\p{L}\\p{N}_";
const SYNTAX = "^$\\.*+?()[]{}|/";

/** A Python pattern's source, as a JavaScript RegExp with the same meaning on one line. */
export function pyRegExp(source: string, flags = ""): RegExp {
	let out = "";
	let inClass = false;
	for (let i = 0; i < source.length; i++) {
		const ch = source.charAt(i);
		if (ch === "\\") {
			const nx = source.charAt(++i);
			if (nx === "d") out += "\\p{Nd}";
			else if (nx === "s") out += inClass ? PY_SPACE : "[" + PY_SPACE + "]";
			else if (nx === "S" && !inClass) out += "[^" + PY_SPACE + "]";
			else if (nx === "b" && !inClass) out += "(?:(?<=[" + PY_WORD + "])(?![" + PY_WORD + "])|(?<![" + PY_WORD + "])(?=[" + PY_WORD + "]))";
			else if (SYNTAX.includes(nx) || "tnrfv".includes(nx) || /[1-9]/.test(nx)) out += "\\" + nx; // the same in both
			else if (nx === "-") out += inClass ? "\\-" : "-";
			else if (/[ !"#%&',:;<=>@_`~]/.test(nx)) out += nx; // a mark escaped without need: the mark itself
			else throw new Error("booklet: the pattern " + JSON.stringify(source) + " uses \\" + nx + ", which this plugin does not read as Python does");
			continue;
		}
		if (ch === "[" && !inClass) {
			if (/^\^?\]/.test(source.slice(i + 1))) throw new Error("booklet: the pattern " + JSON.stringify(source) + " opens a class with ]");
			inClass = true;
		} else if (ch === "]" && inClass) inClass = false;
		out += ch;
	}
	return new RegExp(out, flags + "su");
}

function compiled(name: string): RegExp {
	const p = LINTER_TABLES.patterns[name];
	if (!p) throw new Error("booklet: linter-tables.ts has no pattern " + name);
	return pyRegExp(p.source, p.flags);
}

/** Ported by hand from inside the linter's functions: [name, source as the linter writes it, flags, where]. */
export const PORTED: readonly (readonly [string, string, string, string])[] = [
	["FENCE_CLOSE", String.raw`^ {0,3}(` + "`" + String.raw`{3,}|~{3,})[ \t]*$`, "", "fence_end, and check_format's fence loop"],
	["BLOCK_ID", String.raw`^\^([A-Za-z0-9-]+)$`, "", "check_format: the `^id` line after a fence (the line stripped first)"],
	["FOOTNOTE_DEF", String.raw`^\[\^([A-Za-z0-9][A-Za-z0-9_.:-]*)\]:[ \t]+\S`, "", "check_format: a footnote's definition"],
	["SETTING_WORD", String.raw`^([A-Za-z][A-Za-z0-9-]*):(.*)$`, "", "callout_words: a `key:value` word"],
	["RECORDS_LINE", String.raw`^>[ \t]?\[!records\b`, "i", "records_regions: the line a region opens on"],
	["LINK_DEF", String.raw`^ {0,3}\[([^\]]+)\]:[ \t]*(<[^>]*>|\S+)`, "", "check_images: a reference definition, `[label]: address`"],
	["DASH_START", String.raw`^ {0,3}-`, "", "check_format: a thematic break written with dashes"],
	["QUOTE", String.raw`^>[ \t]?`, "", "check_format: a group's body, read with one `>` less"],
];

const ported = (name: string): RegExp => {
	const p = PORTED.find((x) => x[0] === name);
	if (!p) throw new Error("booklet: no ported pattern " + name);
	return pyRegExp(p[1], p[2]);
};

/** The linter's patterns, by the linter's own names. */
export const LP = {
	/** `> [!kind|id words]fold Title`: (1) kind, (2) the words after the bar, (3) the fold marker, (4) the title. */
	CALLOUT_LINE: compiled("CALLOUT_LINE"),
	/** Any line that starts like a Booklet line, readable or not. */
	CALLOUT_ANY: compiled("CALLOUT_ANY"),
	ID_PATTERN: compiled("ID_PATTERN"),
	FENCE_LINE: compiled("FENCE_LINE"),
	THEMATIC_BREAK: compiled("THEMATIC_BREAK"),
	BULLET: compiled("BULLET"),
	TASK: compiled("TASK"),
	NUMBERED: compiled("NUMBERED"),
	NESTED_BULLET: compiled("NESTED_BULLET"),
	/** The words of a callout's bar, split as Python's str.split() splits them (callout_words). */
	WORDS: pyRegExp(String.raw`\S+`, "g"),
	FENCE_CLOSE: ported("FENCE_CLOSE"),
	BLOCK_ID: ported("BLOCK_ID"),
	FOOTNOTE_DEF: ported("FOOTNOTE_DEF"),
	SETTING_WORD: ported("SETTING_WORD"),
	RECORDS_LINE: ported("RECORDS_LINE"),
	LINK_DEF: ported("LINK_DEF"),
	DASH_START: ported("DASH_START"),
	QUOTE: ported("QUOTE"),
};

/** The table pieces and settings are read from, by the linter's names (Maps and Sets made once). */
export const KIND_SETTINGS_MAP: ReadonlyMap<string, readonly string[]> = new Map(LINTER_TABLES.KIND_SETTINGS.map(([k, v]) => [k, v]));
export const LINTER_NO_ID: ReadonlySet<string> = new Set(LINTER_TABLES.NO_ID_KINDS);
export const LINTER_QUESTIONS: ReadonlySet<string> = new Set(LINTER_TABLES.QUESTION_KINDS);
export const LINTER_ICON_SET: ReadonlySet<string> = new Set(LINTER_TABLES.ICON_NAMES);

/** The settings a kind takes, split the way a line writes them: flags (a bare word) and keys (`key:` written key:value). An unknown kind takes none. */
export function settingsOf(kind: string): { flags: string[]; keys: string[]; all: readonly string[] } {
	const all = KIND_SETTINGS_MAP.get(kind) ?? [];
	return { flags: all.filter((s) => !s.endsWith(":")), keys: all.filter((s) => s.endsWith(":")).map((s) => s.slice(0, -1)), all };
}

export const isKnownKind = (kind: string): boolean => KIND_SETTINGS_MAP.has(kind);
export const takesId = (kind: string): boolean => !LINTER_NO_ID.has(kind);
