/*
 * A module's notice, `> [!notice]` and its `key: value` lines (SPEC section 3, "A module's notice"), as four fields of the Design view's
 * box: the licence, the copyright, the source and the version. Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * The format and the linter (lint-booklet.py `check_notice`, `NOTICE_KEYS`) and the reference renderer (booklet.html `onNotice`) agree:
 * each line of the body is `key: value`, the key is one of the four (in any case), any may be left out, and anything else is an error in
 * the linter and is skipped by the renderer. A notice takes no id and no settings. Every value is text. A key said twice is read by the
 * renderer as the last one with a value, which a field could not show as one value, so that notice stays in the Markdown.
 *
 * ONLY WHAT IS LOSSLESS. The fields show the value as it is written after the colon (trimmed, as the renderer trims it). A line that is not
 * one of the four keys (an unknown key, or words that are no `key: value`) is shown as "kept as written": no field touches it and it is
 * never dropped. Every change writes one line: a value changed in place keeps the line's own `> ` and key and spacing; a value cleared
 * takes its line out; a value filled where there was none adds the line after the last line of the notice that has words. The order of the
 * lines is kept, and so is every line a change does not name.
 *
 * A value is refused, with the reason in words and nothing written, when it would break the line's shape (a line break), when it begins a
 * comment (`<!--` would hide the lines under it), or when it is wrapped in matching quotation marks (the renderer reads such a value
 * without them, so what the field shows and what the reader shows would differ).
 */
import { parseLine } from "./editor-line";
import { LP } from "./editor-patterns";

export const NOTICE_KEYS = ["license", "copyright", "source", "version"] as const;
export type NoticeKey = (typeof NOTICE_KEYS)[number];

const KV = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/;
const QUOTED = /^>[ \t]?/;

export interface NoticeField {
	/** The index among the block's lines of the line that holds it. */
	line: number;
	/** The key as the line writes it (`License`, `license`). */
	written: string;
	/** The value as it is written after the colon, trimmed. "" when the line has a key and nothing after it. */
	value: string;
}

export interface NoticeKept {
	line: number;
	/** The line's words, without its `>` mark. */
	text: string;
	/** Why no field holds it. */
	why: string;
}

export interface ModuleNotice {
	fields: Record<NoticeKey, NoticeField | null>;
	/** The lines the fields do not hold, in order. */
	kept: NoticeKept[];
	/** The index past the last line of the notice that has words (where a new line goes). */
	end: number;
}

export interface NoticeRefused {
	refused: string;
}

const refuse = (refused: string): NoticeRefused => ({ refused });

/** The index past the callout's body: its `>` lines, up to a line that opens another callout (the reader's `bodyEnd`). */
function bodyEnd(lines: readonly string[]): number {
	let k = 1;
	while (k < lines.length && (lines[k] ?? "").startsWith(">") && !LP.CALLOUT_ANY.test(lines[k] ?? "")) k++;
	return k;
}

/** A notice's lines read into its four fields and the lines kept as written, or why they cannot be edited as fields. */
export function readNotice(lines: readonly string[]): ModuleNotice | NoticeRefused {
	const first = parseLine(lines[0] ?? "");
	if (!first || first.kind !== "notice") return refuse("This is not a notice.");
	if (first.quotes) return refuse("The first line starts with extra > marks.");
	if (first.flags.has("end")) return refuse("This is a closing line.");
	for (const l of lines) if (l.includes("\r")) return refuse("A line holds a stray carriage return, which the fields would not keep as it is.");
	const end = bodyEnd(lines);
	if (end < lines.length) return refuse(`There is a line under the notice's own that is not part of it: “${clip(lines[end] ?? "")}”.`);
	const fields: Record<NoticeKey, NoticeField | null> = { license: null, copyright: null, source: null, version: null };
	const kept: NoticeKept[] = [];
	const seen = new Map<NoticeKey, number>();
	let last = 0;
	for (let i = 1; i < end; i++) {
		const body = (lines[i] ?? "").replace(QUOTED, "").trim();
		if (!body) continue;
		last = i;
		const kv = KV.exec(body);
		if (!kv) {
			kept.push({ line: i, text: body, why: "It is not written key: value, so the reader skips it." });
			continue;
		}
		const key = (kv[1] ?? "").toLowerCase();
		if (!(NOTICE_KEYS as readonly string[]).includes(key)) {
			kept.push({ line: i, text: body, why: `A notice has license, copyright, source and version, not “${kv[1] ?? ""}”, so the reader skips it.` });
			continue;
		}
		const k = key as NoticeKey;
		if (seen.has(k)) return refuse(`The notice says “${k}” more than once, so it is edited in the Markdown below.`);
		seen.set(k, i);
		fields[k] = { line: i, written: kv[1] ?? "", value: (kv[2] ?? "").trim() };
	}
	return { fields, kept, end: last + 1 };
}

const clip = (s: string): string => (s.trim().length > 40 ? `${s.trim().slice(0, 40)}…` : s.trim());

/** Does the reader link a notice's source? Only an address that starts `http://` or `https://` is a link; any other text is shown as words. */
export function sourceIsLink(value: string): boolean {
	return /^https?:\/\//i.test(value.trim());
}

/** Why a value cannot be written in a notice's line, or null. */
export function noticeValueProblem(value: string): string | null {
	if (/[\r\n]/.test(value)) return "A notice's value is one line: it has no line break.";
	if (value.includes("<!--")) return "A value that holds <!-- would begin a comment and hide the lines under it.";
	const v = value.trim();
	if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))))
		return "A value wrapped in quotation marks is read without them, so it would show differently there. Write it without the quotation marks.";
	return null;
}

type Made = { ok: true; lines: string[] } | { ok: false; reason: string };
const no = (reason: string): Made => ({ ok: false, reason });

/**
 * The notice's lines with one field's value changed: the line of a field that has one is rewritten in its own style, an empty value takes the
 * line out, and a value for a field that has no line adds one after the last line of the notice that has words. Refused, with a reason and
 * nothing changed, when the lines are not shown as fields, the value cannot be written, or the notice read again would not have exactly the
 * change that was asked for.
 */
export function writeNoticeField(lines: readonly string[], key: NoticeKey, value: string): Made {
	const now = readNotice(lines);
	if ("refused" in now) return no(now.refused);
	const v = value.trim();
	const bad = noticeValueProblem(value);
	if (bad && v !== "") return no(bad);
	const field = now.fields[key];
	let out: string[];
	if (field) {
		if (field.value === v) return { ok: true, lines: [...lines] };
		if (v === "") out = [...lines.slice(0, field.line), ...lines.slice(field.line + 1)];
		else {
			const line = lines[field.line] ?? "";
			const m = /^(>[ \t]?[ \t]*[A-Za-z][A-Za-z0-9_-]*:)([ \t]*)/.exec(line);
			if (!m) return no("That line is not written key: value.");
			out = lines.map((l, i) => (i === field.line ? `${m[1]}${m[2] === "" ? " " : (m[2] ?? "")}${v}` : l));
		}
	} else {
		if (v === "") return { ok: true, lines: [...lines] };
		// the style of the lines already there: a `>` and a space, or `>` alone
		const style = lines.slice(1, now.end).find((l) => (l ?? "").trim() !== ">" && l.startsWith(">")) ?? "> ";
		const mark = /^>[ \t]?/.exec(style)?.[0] ?? "> ";
		out = [...lines.slice(0, now.end), `${mark}${key}: ${v}`, ...lines.slice(now.end)];
	}
	// read again: the field has what was asked, every other field and every kept line is as it was
	const again = readNotice(out);
	if ("refused" in again) return no(again.refused);
	const wanted = (k: NoticeKey): string => (k === key ? v : (now.fields[k]?.value ?? ""));
	for (const k of NOTICE_KEYS) if ((again.fields[k]?.value ?? "") !== wanted(k)) return no("The notice would not be read back with the same words, so it is not written.");
	if (JSON.stringify(again.kept.map((x) => x.text)) !== JSON.stringify(now.kept.map((x) => x.text))) return no("A line of the notice would change with this, so it is not written.");
	return { ok: true, lines: out };
}
