/*
 * One Booklet line, `> [!kind|id setting:value flag]fold Title`: read it, and change one setting in place.
 *
 * Reading follows the linter's callout_words: for a kind that takes an id the first word after the bar is the id (unless it holds a
 * `:`, which makes it a setting and the line has no written id), and every later word is a setting; a kind in NO_ID_KINDS has
 * settings only. A setting is a flag (a bare word) or `key:value`. Kinds, flags and keys are read without regard to case; ids and
 * values are exact.
 *
 * Editing changes the words after the bar and nothing else: every other character of the line, the quote marks in front of a
 * question inside a group (`> > [!choice|...]`), the kind as written, the fold marker, the title and its spacing, stays as it was.
 * Removing the last word removes the bar too (a bar the author wrote as spaces only keeps them), so adding a setting and removing
 * it gives back the line it started from. Plain TypeScript: nothing here imports Obsidian.
 */
import { LP, isKnownKind, settingsOf, takesId } from "./editor-patterns";

const MAX_QUOTES = 8; // a Booklet line inside groups nested this deep is still read

export interface Word {
	text: string;
	start: number;
	end: number;
}

export type Setting =
	| { index: number; type: "flag"; name: string }
	| { index: number; type: "value"; name: string; keyText: string; value: string };

export interface ParsedLine {
	text: string;
	/** The `> ` marks in front of a Booklet line that sits inside groups. */
	quotes: string;
	kindText: string;
	kind: string;
	hasBar: boolean;
	kindEnd: number;
	barStart: number;
	barEnd: number;
	bar: string;
	words: Word[];
	fold: string;
	title: string;
	titleStart: number;
	takesId: boolean;
	id: string | null;
	/** The offsets of the id word in the line, when there is one. */
	idStart: number;
	idEnd: number;
	settings: Setting[];
	flags: Set<string>;
	values: Map<string, string>;
	known: boolean;
}

/** The line's parts and the position of each, or null when it is not a Booklet line. */
export function parseLine(text: string): ParsedLine | null {
	let at = 0;
	for (let depth = 0; depth <= MAX_QUOTES; depth++) {
		const rest = text.slice(at);
		const m = LP.CALLOUT_LINE.exec(rest);
		if (m) return parts(text, at, m);
		const q = LP.QUOTE.exec(rest);
		if (!q || !rest.slice(q[0].length).startsWith(">")) return null;
		at += q[0].length;
	}
	return null;
}

function parts(text: string, at: number, m: RegExpExecArray): ParsedLine {
	const head = (/^>[ \t]?\[!/.exec(text.slice(at)) ?? [""])[0];
	const kindText = m[1] ?? "";
	const kindStart = at + head.length;
	const kindEnd = kindStart + kindText.length;
	const hasBar = text.charAt(kindEnd) === "|";
	const barStart = hasBar ? kindEnd + 1 : kindEnd;
	const barEnd = hasBar ? text.indexOf("]", barStart) : kindEnd;
	const kind = kindText.toLowerCase();
	const bar = text.slice(barStart, barEnd);
	const words: Word[] = [];
	for (const w of bar.matchAll(LP.WORDS)) words.push({ text: w[0], start: w.index ?? 0, end: (w.index ?? 0) + w[0].length });
	const wantsId = takesId(kind);
	const first = words[0];
	const idWord = wantsId && first && !first.text.includes(":") ? first : null;
	const settings: Setting[] = [];
	words.forEach((w, n) => {
		if (n === 0 && idWord) return;
		const kv = LP.SETTING_WORD.exec(w.text);
		if (kv) settings.push({ index: n, type: "value", name: (kv[1] ?? "").toLowerCase(), keyText: kv[1] ?? "", value: kv[2] ?? "" });
		else settings.push({ index: n, type: "flag", name: w.text.toLowerCase() });
	});
	const flags = new Set<string>();
	const values = new Map<string, string>();
	for (const s of settings) {
		if (s.type === "flag") flags.add(s.name);
		else values.set(s.name, s.value); // the last one wins, as in the linter
	}
	const title = m[4] ?? "";
	return {
		text,
		quotes: text.slice(0, at),
		kindText,
		kind,
		hasBar,
		kindEnd,
		barStart,
		barEnd,
		bar,
		words,
		fold: m[3] ?? "",
		title,
		titleStart: text.length - title.length,
		takesId: wantsId,
		id: idWord ? idWord.text : null,
		idStart: idWord ? barStart + idWord.start : -1,
		idEnd: idWord ? barStart + idWord.end : -1,
		settings,
		flags,
		values,
		known: isKnownKind(kind),
	};
}

/** The words on the line that its kind does not take (a mistyped `mx:5`, a flag from another kind), each with its index. */
export function strayWords(p: ParsedLine): Setting[] {
	const { flags, keys } = settingsOf(p.kind);
	return p.settings.filter((s) => (s.type === "flag" ? !flags.includes(s.name) : !keys.includes(s.name)));
}

export type Edit = { text: string } | { error: string };

// ---------------------------------------------------------------- edits on the words after the bar

/** The line with its bar's text replaced. An empty bar goes with its `|`; a bar of spaces only (the author's) is kept. */
function withBar(p: ParsedLine, bar: string): string {
	const t = p.text;
	if (bar === "") return p.hasBar ? t.slice(0, p.barStart - 1) + t.slice(p.barEnd) : t;
	if (p.hasBar) return t.slice(0, p.barStart) + bar + t.slice(p.barEnd);
	return t.slice(0, p.kindEnd) + "|" + bar + t.slice(p.kindEnd);
}

/**
 * The bar with the words at these indexes taken out. Each word that stays keeps the spaces written before it; a word taken out
 * goes with the spaces before it, and the word that becomes the first goes with none. The spaces before the first word and after
 * the last stay where they were.
 */
function removeWords(p: ParsedLine, indexes: number[]): string {
	const drop = new Set(indexes);
	const kept = p.words.map((_, i) => i).filter((i) => !drop.has(i));
	const bar = p.bar;
	const first = p.words[0];
	const last = p.words[p.words.length - 1];
	if (!first || !last) return bar;
	if (!kept.length) return bar.slice(0, first.start) + bar.slice(last.end);
	let out = bar.slice(0, first.start) + (p.words[kept[0] ?? 0]?.text ?? "");
	for (let j = 1; j < kept.length; j++) {
		const i = kept[j] ?? 0;
		out += bar.slice(p.words[i - 1]?.end ?? 0, p.words[i]?.start ?? 0) + (p.words[i]?.text ?? "");
	}
	return out + bar.slice(last.end);
}

/** The bar with `word` added after the word at `after`, or after the last word. */
function addWord(p: ParsedLine, word: string, after?: number): string {
	const bar = p.bar;
	const lastWord = p.words[p.words.length - 1];
	if (!lastWord) return bar + word;
	const at = after === undefined ? lastWord.end : (p.words[after]?.end ?? lastWord.end);
	return bar.slice(0, at) + " " + word + bar.slice(at);
}

/** A bare word added to a line that has no id would be read as its id (SPEC section 4), so the id comes first; a `key:value` word is always a setting. */
function needsId(p: ParsedLine, word: string): string | null {
	return p.takesId && !p.id && !word.includes(":") ? "This line has no id yet. A setting written first would be read as the id, so write the id first." : null;
}

/**
 * Turn a flag on or off. `daily` needs `repeat` (SPEC section 3): it is written right after `repeat`, and turning `repeat` off
 * takes `daily` with it, so the line never says `daily` alone.
 */
export function setFlag(p: ParsedLine, flag: string, on: boolean): Edit {
	flag = flag.toLowerCase();
	if (on) {
		const why = needsId(p, flag);
		if (why) return { error: why };
		if (p.flags.has(flag)) return { text: p.text };
		if (flag === "daily") {
			const rep = p.settings.filter((s) => s.type === "flag" && s.name === "repeat").pop();
			if (!rep) return { error: "`daily` needs `repeat`: turn on repeat first." };
			return { text: withBar(p, addWord(p, flag, rep.index)) };
		}
		return { text: withBar(p, addWord(p, flag)) };
	}
	const drop = p.settings.filter((s) => s.type === "flag" && (s.name === flag || (flag === "repeat" && s.name === "daily")));
	if (!drop.length) return { text: p.text };
	return { text: withBar(p, removeWords(p, drop.map((s) => s.index))) };
}

/**
 * Why a value cannot be written after `key:` on a line, or null. A space would split it into two words and a `]` would end the
 * bar; anything else is written as typed and the linter says whether the kind takes it.
 */
export function valueProblem(value: string): string | null {
	if (/\s/.test(value)) return "A setting's value has no spaces.";
	if (value.includes("]")) return "A setting's value cannot hold `]`.";
	return null;
}

/**
 * Set `key:value`, or remove the key when value is "". An existing key keeps its spelling and its place: only the value of its last
 * occurrence changes (the one the linter reads); a new one goes at the end.
 */
export function setValue(p: ParsedLine, key: string, value: string): Edit {
	key = key.toLowerCase();
	const same = p.settings.filter((s): s is Extract<Setting, { type: "value" }> => s.type === "value" && s.name === key);
	if (value === "") return same.length ? { text: withBar(p, removeWords(p, same.map((s) => s.index))) } : { text: p.text };
	const bad = valueProblem(value);
	if (bad) return { error: bad };
	if (!same.length) return { text: withBar(p, addWord(p, key + ":" + value)) };
	const last = same[same.length - 1];
	const w = last ? p.words[last.index] : undefined;
	if (!last || !w) return { text: p.text };
	return { text: withBar(p, p.bar.slice(0, w.start) + last.keyText + ":" + value + p.bar.slice(w.end)) };
}

/** Remove one word (by its index among the words after the bar): used for the words a kind does not take. */
export function removeWord(p: ParsedLine, index: number): Edit {
	if (index < 0 || index >= p.words.length) return { text: p.text };
	if (p.takesId && p.id && index === 0) return { error: "That word is the line's id." };
	return { text: withBar(p, removeWords(p, [index])) };
}

/** Why a word cannot be a line's id, or null: letters, digits and dashes, starting with a letter or digit (SPEC section 4). */
export function idProblem(id: string): string | null {
	if (!id) return "An id cannot be empty.";
	if (!LP.ID_PATTERN.test(id)) return "An id has letters, digits and dashes only, and starts with a letter or a digit.";
	return null;
}

/** Rename the line's id: the one word after the bar that is the id, and nothing else on the line. */
export function setId(p: ParsedLine, id: string): Edit {
	if (!p.takesId) return { error: "This kind of line takes no id." };
	const bad = idProblem(id);
	if (bad) return { error: bad };
	if (!p.id) {
		// no id yet: it goes first after the bar, in front of any setting
		if (!p.hasBar) return { text: p.text.slice(0, p.kindEnd) + "|" + id + p.text.slice(p.kindEnd) };
		const lead = p.bar.length - p.bar.trimStart().length;
		const bar = p.bar.slice(0, lead) + id + (p.words.length ? " " : "") + p.bar.slice(lead);
		return { text: withBar(p, bar) };
	}
	return { text: p.text.slice(0, p.idStart) + id + p.text.slice(p.idEnd) };
}
