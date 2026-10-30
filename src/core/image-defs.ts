/*
 * Image definitions for one piece of prose: a piece drawn on its own does not hold the file's link
 * reference definitions, so an image written `![alt][name]` cannot be resolved. These functions read the
 * image references a piece uses and the definitions the file holds. Plain TypeScript: nothing here
 * imports Obsidian.
 */
import { fencedLines, splitLines } from "./lines";

/** A label as CommonMark matches one: white space read as one space, and case does not matter. */
function labelKey(label: string): string {
	return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/** `text` with each inline code span blanked out, keeping its line breaks. */
function maskCodeSpans(text: string): string {
	const chars = text.split("");
	let i = 0;
	while (i < text.length) {
		if (text[i] !== "`") {
			i++;
			continue;
		}
		let n = 0;
		while (text[i + n] === "`") n++;
		let j = i + n;
		let close = -1;
		while (j < text.length) {
			if (text[j] !== "`") {
				j++;
				continue;
			}
			let m = 0;
			while (text[j + m] === "`") m++;
			if (m === n) {
				close = j;
				break;
			}
			j += m;
		}
		if (close < 0) {
			i += n;
			continue;
		}
		for (let k = i; k < close + n; k++) if (chars[k] !== "\n" && chars[k] !== "\r") chars[k] = " ";
		i = close + n;
	}
	return chars.join("");
}

/** `text` with each fenced code block and inline code span blanked out, keeping its line breaks. */
function withoutCode(text: string): string {
	const lines = splitLines(text);
	const fenced = fencedLines(lines.map((l) => l.text));
	const kept = lines.map((l, i) => (fenced[i] ? l.text.replace(/[^\r\n]/g, " ") : l.text));
	return maskCodeSpans(kept.join("\n"));
}

/** The labels of the image references in `piece`, in order of first use, as CommonMark matches them. */
function imageLabels(piece: string): string[] {
	const text = withoutCode(piece);
	const out: string[] = [];
	for (const m of text.matchAll(/!\[([^\]]*)\](?:\[([^\]]*)\])?/g)) {
		const end = (m.index ?? 0) + m[0].length;
		let label = m[2];
		if (label === undefined) {
			// the shortcut form, unless this is an inline image or the start of another label
			if (text[end] === "(" || text[end] === "[") continue;
			label = m[1];
		} else if (label === "") {
			label = m[1]; // the collapsed form
		}
		const key = labelKey(label ?? "");
		if (key) out.push(key);
	}
	return out;
}

/** The file's image definition lines, by label: the first definition for a label wins (CommonMark). */
function definitions(fileText: string): Map<string, string> {
	const lines = splitLines(fileText);
	const fenced = fencedLines(lines.map((l) => l.text));
	const out = new Map<string, string>();
	for (let i = 0; i < lines.length; i++) {
		if (fenced[i]) continue;
		const m = /^ {0,3}\[([^\]]+)\]:[ \t]+(\S.*)$/.exec(lines[i]?.text ?? "");
		if (!m || m[1] === undefined) continue;
		const key = labelKey(m[1]);
		if (!key || key.startsWith("^") || out.has(key)) continue;
		out.set(key, lines[i]?.text ?? "");
	}
	return out;
}

/**
 * `piece`, then a blank line, then the file's definition lines for the image references the piece uses.
 * A piece with no image reference, or none with a definition, is returned exactly as it was.
 */
export function appendImageDefs(piece: string, fileText: string): string {
	if (!piece.includes("![")) return piece; // the common case: no image, so the file is not read for each piece
	const defs = definitions(fileText);
	const found: string[] = [];
	const seen = new Set<string>();
	for (const label of imageLabels(piece)) {
		if (seen.has(label)) continue;
		seen.add(label);
		const line = defs.get(label);
		if (line !== undefined) found.push(line);
	}
	return found.length ? `${piece}\n\n${found.join("\n")}` : piece;
}
