/*
 * The pictures of a prose block, as two fields each in the Design view's box: the words that describe the picture and where it is. Plain
 * TypeScript: nothing here imports Obsidian or the DOM, and nothing is fetched or uploaded.
 *
 * SPEC section 6, "Images": a picture is written in reference style, `![alt][id]` with `[id]: images/a.jpg` among the data; the inline form
 * `![alt](images/a.jpg)` and Obsidian's file embed `![[a.png]]` are accepted as well. The linter reads the three the same way
 * (`collect_embeds`, `check_images`). The extension says what an embed is, so one that ends in an audio or a video extension is media, not a
 * picture, and is no part of this file.
 *
 * ONLY WHAT IS LOSSLESS. A picture is shown as fields where it is one of those three shapes, written the plain way this file reads without
 * guessing: an alt text with no bracket, an address with no space or parenthesis (inline), a definition on one line whose address is a bare
 * word or in `<angle brackets>`. Anything else is kept as written and counted in `other`, with the reason in words, and the Markdown below is
 * how it is edited. A change rewrites only the pieces it was asked to change: the alt text, the address (at the picture's own line, or on the
 * definition's line for the reference style), the other bytes of both lines stay. For the reference style the two lines change as one write.
 *
 * THE DEFINITION is found the way the reader finds it (SPEC section 3, "Where data goes"): written in the picture's own place, else in its
 * module's data section, else in the shared one, never in another module's; the first of those, in file order. One that is not there is
 * said in words, and adding it is a change of its own, offered and never made unasked.
 *
 * THE PATH'S RULES are the format's (letters, digits, `_ . / -`, at most 200 characters, no leading `/`, no empty part, no part that begins
 * with a dot, an image extension). A path that breaks them is kept and WARNED about, in words (`pathWarning`), as the linter warns; it is
 * refused only when it cannot be written in the line at all (a space in a line that would end at it), or when it would no longer be a picture.
 */
import { referenceSource } from "./references";
import { inertLines, inertSpans } from "./blocks";
import { blockLines, changeLines } from "./design-ops";
import { nodeAtLine } from "./design-outline";
import { definitionRank, definitionScopeOf, inGroup, type DefinitionScope } from "./design-scope";
import { parseDesign, type DesignNode } from "./design-tree";
import { mediaClass } from "./media";

export type ImageForm = "reference" | "inline" | "file";

/** The line that says where a reference-style picture is: `[id]: path`. */
export interface Definition {
	/** The note's line (0-based) and the span of the address in it (inside `<angle brackets>` when it has them). */
	line: number;
	from: number;
	to: number;
	angle: boolean;
	address: string;
	/** Where the reader found it, in words. */
	scope: DefinitionScope;
}

export interface Picture {
	/** Its place among the block's pictures, in reading order. */
	index: number;
	/** The index among the block's lines of the line it is on, and its span in that line. */
	line: number;
	from: number;
	to: number;
	form: ImageForm;
	/** The words in the brackets, as written; null for a file embed, which has none of its own. */
	alt: string | null;
	altFrom: number;
	altTo: number;
	/** A reference-style picture's id, as written. */
	id: string | null;
	/** The address: an inline picture's, a file embed's name (the size suffix kept apart), a reference-style picture's from its definition; null when there is no definition. */
	path: string | null;
	/** Where the address stands in the picture's line (inline and file embed), else -1. */
	pathFrom: number;
	pathTo: number;
	/** Inline: the address is in `<angle brackets>`. */
	angle: boolean;
	definition: Definition | null;
	/** Why the fields cannot be offered for it, or null. */
	problem: string | null;
}

export interface Pictures {
	pictures: Picture[];
	/** Pictures in the words that are written in a shape the fields do not read: they stay as written. */
	other: number;
}

export interface PicturesRefused {
	refused: string;
}

// the three shapes, read from a line whose code and maths are blanked out
const ESC = String.raw`(?:\\.|[^\][\\])`;
const REF = new RegExp(String.raw`!\[(${ESC}*)\]\[(${ESC}+)\]`, "g");
const INLINE = new RegExp(String.raw`!\[(${ESC}*)\]\((<[^<>\n]*>|[^()\s<>"]*)((?:[ \t]+"[^"\n]*")?)\)`, "g");
const WIKI = /!\[\[([^\][\n#|]+)(\|[^\][\n]*)?\]\]/g;
const DEF_LABEL = /^( {0,3}(?:>[ \t]?)*)\[((?:\\.|[^\\\]])*)\]:/;
const DEF_ADDRESS = /^( {0,3}(?:>[ \t]?)*\[(?:\\.|[^\\\]])*\]:[ \t]+)(<[^<>\n]*>|\S+)/;

/** A reference label the way a reader compares it: case and runs of spaces do not count. */
const labelOf = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The definition of a reference-style picture `label`, as the reader would find it from this block, or null when there is none it could see. */
function findDefinition(text: string, root: DesignNode, node: DesignNode, label: string): Definition | { problem: string } | null {
	const src = referenceSource(text);
	if (!src.definitions.size) return null;
	const raw = text.split("\n");
	const at = definitionScopeOf(node);
	const found: { line: number; rank: number; scope: DefinitionScope }[] = [];
	for (const line of src.definitions.keys()) {
		const m = DEF_LABEL.exec((raw[line] ?? "").replace(/\r$/, ""));
		if (!m || labelOf(m[2] ?? "") !== labelOf(label)) continue;
		const n = nodeAtLine(root, line);
		const scope = definitionScopeOf(n);
		const rank = definitionRank(at, scope);
		if (rank !== null) found.push({ line, rank, scope });
	}
	found.sort((a, b) => a.rank - b.rank || a.line - b.line);
	const hit = found[0];
	if (!hit) return null;
	const line = (raw[hit.line] ?? "").replace(/\r$/, "");
	const m = DEF_ADDRESS.exec(line);
	if (!m) return { problem: "The line that says where the picture is is written in a way the field does not read." };
	const token = m[2] ?? "";
	const angle = token.startsWith("<");
	const from = (m[1] ?? "").length + (angle ? 1 : 0);
	const address = angle ? token.slice(1, -1) : token;
	if (!address.trim()) return { problem: "The line that says where the picture is has no address." };
	return { line: hit.line, from, to: from + address.length, angle, address, scope: hit.scope };
}

/** What a line's pictures are, with the spans of their parts, in the order they stand. */
function scanLine(l: string, line: number): { pics: Omit<Picture, "index" | "path" | "definition" | "problem">[]; covered: [number, number][] } {
	const pics: Omit<Picture, "index" | "path" | "definition" | "problem">[] = [];
	const covered: [number, number][] = [];
	for (const m of l.matchAll(REF)) {
		const from = m.index ?? 0;
		const altFrom = from + 2;
		pics.push({ line, from, to: from + m[0].length, form: "reference", alt: m[1] ?? "", altFrom, altTo: altFrom + (m[1] ?? "").length, id: m[2] ?? "", pathFrom: -1, pathTo: -1, angle: false });
		covered.push([from, from + m[0].length]);
	}
	for (const m of l.matchAll(INLINE)) {
		const from = m.index ?? 0;
		const altFrom = from + 2;
		const altTo = altFrom + (m[1] ?? "").length;
		const token = m[2] ?? "";
		const angle = token.startsWith("<");
		const pathFrom = altTo + 2 + (angle ? 1 : 0);
		pics.push({ line, from, to: from + m[0].length, form: "inline", alt: m[1] ?? "", altFrom, altTo, id: null, pathFrom, pathTo: pathFrom + (angle ? token.length - 2 : token.length), angle });
		covered.push([from, from + m[0].length]);
	}
	for (const m of l.matchAll(WIKI)) {
		const from = m.index ?? 0;
		const pathFrom = from + 3;
		pics.push({ line, from, to: from + m[0].length, form: "file", alt: null, altFrom: -1, altTo: -1, id: null, pathFrom, pathTo: pathFrom + (m[1] ?? "").length, angle: false });
		covered.push([from, from + m[0].length]);
	}
	pics.sort((a, b) => a.from - b.from);
	return { pics, covered };
}

/** The pictures the block's words hold, with where each is, or why the block has none to show. */
export function picturesOf(text: string, node: DesignNode): Pictures | PicturesRefused {
	if (node.kind !== "prose") return { refused: "Only words hold pictures here." };
	const root = rootOf(node);
	const lines = blockLines(text, node);
	const inert = inertLines(lines);
	const out: Picture[] = [];
	let other = 0;
	for (let i = 0; i < lines.length; i++) {
		if (inert[i]) continue;
		const l = inertSpans(lines[i] ?? "");
		const { pics, covered } = scanLine(l, i);
		for (const p of pics) {
			let path: string | null = null;
			let definition: Definition | null = null;
			let problem: string | null = null;
			if (p.form === "reference") {
				const d = findDefinition(text, root, node, p.id ?? "");
				if (d && "problem" in d) problem = d.problem;
				else if (d) {
					definition = d;
					path = d.address;
				}
			} else path = l.slice(p.pathFrom, p.pathTo);
			// an address that is audio or video is media (SPEC section 6, "Audio and video"), and this box does not edit it
			if (path !== null && (mediaClass(path) === "audio" || mediaClass(path) === "video")) continue;
			out.push({ ...p, index: out.length, path, definition, problem });
		}
		// a picture mark in a shape that is none of the three, or a block embed (`![[#^id]]`, a figure), is counted apart
		for (const m of l.matchAll(/!\[(?!\[)|!\[\[(?![^\]]*#)/g)) {
			const at = m.index ?? 0;
			if (!covered.some(([a, b]) => at >= a && at < b)) other++;
		}
	}
	return { pictures: out, other };
}

function rootOf(node: DesignNode): DesignNode {
	let n = node;
	while (n.parent) n = n.parent;
	return n;
}

// ---------------------------------------------------------------- the path's rules

const IMAGE_EXT = /\.(?:svg|png|jpe?g|webp|gif)$/i;

/**
 * What is wrong with a picture's address, in words, or null when the reader would read it. The format's rules (section 6, "Images") and
 * the linter's warnings: a remote address is kept and never requested unasked, a scheme other than http and https is never used, and a
 * relative path has to be made of letters, digits, `_ . / -`, at most 200 of them, with no leading `/`, no empty part, no part that begins
 * with a dot and an image extension.
 */
export function pathWarning(path: string): string | null {
	const p = path.trim();
	if (!p) return null;
	if (/^(?:https?:)?\/\//i.test(p)) return "This is a remote address. It is kept as written, but the reader never requests it unasked, so it shows the words and the address as text, and the linter warns.";
	const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(p);
	if (scheme) return `An address with the scheme ${(scheme[1] ?? "").toLowerCase()}: is never used for a picture, and the linter reports it as an error. A picture is a path beside the booklet.`;
	const flat = p.replace(/\s+/g, "");
	let why: string | null = null;
	if (flat.startsWith("/")) why = "it starts with a /";
	else if (/[^A-Za-z0-9_./-]/.test(p)) why = "it has a character other than letters, digits, _ . / and -";
	else if (p.split("/").some((x) => x === "" || x.startsWith("."))) why = "it has an empty part or a part that begins with a dot (so no .. either)";
	else if (p.length > 200) why = "it is longer than 200 characters";
	else if (!IMAGE_EXT.test(p)) why = "it does not end in .svg, .png, .jpg, .jpeg, .webp or .gif";
	return why ? `This path breaks the format's rules for a picture: ${why}. The reader does not read it, and the linter warns.` : null;
}

/** Why an address cannot be written in the shape of this picture's line (or its definition), or null. */
function shapeProblem(pic: Picture, address: string): string | null {
	if (!address.trim()) return "A picture needs a place: an address cannot be empty. To take the picture away, delete the block or its line in the Markdown.";
	if (/[\r\n]/.test(address)) return "An address is one line: it has no line break.";
	const angle = pic.form === "reference" ? (pic.definition?.angle ?? false) : pic.angle;
	if (angle) return /[<>]/.test(address) ? "An address between < and > has no < or >." : null;
	if (pic.form === "inline") return /[()\s<>"]/.test(address) ? "In this shape an address has no space, parenthesis, quotation mark or angle bracket, so it cannot be written in the line." : null;
	if (pic.form === "file") return /[\][#|]/.test(address) ? "A file's name has no bracket, # or | in it." : null;
	return /[\s<>]/.test(address) ? "In this shape an address has no space or angle bracket, so it cannot be written in the definition." : null;
}

/** Why alt words cannot be written in the picture's line, or null. */
function altProblem(alt: string): string | null {
	if (/[\r\n]/.test(alt)) return "The words that describe a picture are one line: they have no line break.";
	if (/[\][]/.test(alt)) return "The words that describe a picture have no square bracket, which would end them.";
	return null;
}

// ---------------------------------------------------------------- the change

export interface PictureChange {
	alt?: string;
	path?: string;
}

type Made = { ok: true; text: string } | { ok: false; reason: string };
const no = (reason: string): Made => ({ ok: false, reason });

/** The note's text with line `at` (0-based) replaced; every other byte stays. */
function withLine(text: string, at: number, next: string): string {
	const raw = text.split("\n");
	const cr = (raw[at] ?? "").endsWith("\r") && !next.endsWith("\r") ? "\r" : "";
	raw[at] = next + cr;
	return raw.join("\n");
}

const sameOther = (a: Picture, b: Picture): boolean => a.form === b.form && a.alt === b.alt && a.path === b.path && a.id === b.id;

/**
 * The note's text with a picture's words or place changed: the pieces asked for are rewritten, and every other byte of the picture's line,
 * and of the definition's line, stays. A reference-style picture's address is the definition's, so the two lines change as one write.
 * Refused, with a reason and nothing changed, when the picture is not shown as fields, when what was typed cannot be written in the line,
 * when the picture would stop being one, or when the block read again would not hold exactly what was asked for.
 */
export function changePicture(text: string, node: DesignNode, index: number, change: PictureChange): Made {
	const before = picturesOf(text, node);
	if ("refused" in before) return no(before.refused);
	const pic = before.pictures[index];
	if (!pic) return no("There is no such picture in these words.");
	if (pic.problem) return no(pic.problem);
	const alt = change.alt?.trim();
	const altChanged = alt !== undefined && alt !== pic.alt;
	if (altChanged) {
		if (pic.alt === null) return no("A file embed has no words of its own to change: its picture is described where it is used.");
		const bad = altProblem(alt);
		if (bad) return no(bad);
	}
	let address = change.path?.trim();
	if (address !== undefined && address === pic.path) address = undefined;
	if (address !== undefined) {
		if (pic.form === "reference" && !pic.definition) return no("There is no line that says where this picture is. Add it first, and then it can be changed.");
		const bad = shapeProblem(pic, address);
		if (bad) return no(bad);
		const kind = mediaClass(address);
		if (kind === "audio" || kind === "video") return no(`That is ${kind === "audio" ? "an audio" : "a video"} file, so this would stop being a picture. Sound and video are added as a listen question.`);
	}
	if (!altChanged && address === undefined) return { ok: true, text };
	let next = text;
	// the definition first (the same number of lines), then the block's own line
	if (address !== undefined && pic.form === "reference" && pic.definition) {
		const d = pic.definition;
		const raw = (text.split("\n")[d.line] ?? "").replace(/\r$/, "");
		next = withLine(next, d.line, raw.slice(0, d.from) + address + raw.slice(d.to));
	}
	const lineEdit = altChanged || (address !== undefined && pic.form !== "reference");
	if (lineEdit) {
		const now = picturesOf(next, node);
		const p = "refused" in now ? undefined : now.pictures[index];
		if (!p) return no("The picture is not where it was, so nothing is written.");
		const lines = blockLines(next, node);
		let l = lines[p.line] ?? "";
		// from the end, so that the spans before stay where they are
		if (address !== undefined && pic.form !== "reference") l = l.slice(0, p.pathFrom) + address + l.slice(p.pathTo);
		if (altChanged && p.alt !== null) l = l.slice(0, p.altFrom) + (alt ?? "") + l.slice(p.altTo);
		const out = lines.map((x, i) => (i === p.line ? l : x));
		const op = changeLines(next, node, out);
		if (!op.ok) return no(op.reason);
		next = op.text;
	}
	// read again: the picture has what was asked, and every other picture is as it was
	const after = picturesOf(next, node);
	if ("refused" in after || after.pictures.length !== before.pictures.length || after.other !== before.other) return no("The picture would be read as something else, so it is not written.");
	for (const p of after.pictures) {
		const was = before.pictures[p.index];
		if (!was) return no("The picture would be read as something else, so it is not written.");
		if (p.index !== index) {
			// another picture that shares the definition changes its address with this one
			const shared = pic.form === "reference" && was.form === "reference" && was.definition && pic.definition && was.definition.line === pic.definition.line;
			if (!sameOther(p, was) && !(shared && address !== undefined && p.path === address && p.alt === was.alt && p.id === was.id && p.form === was.form)) return no("Another picture would change with this, so it is not written.");
			continue;
		}
		if (p.form !== was.form || p.id !== was.id || p.alt !== (altChanged ? (alt ?? "") : was.alt) || p.path !== (address !== undefined ? address : was.path))
			return no("The picture would not be read back with the words and the place that were typed, so it is not written.");
	}
	return { ok: true, text: next };
}

/** The address a new definition is given: the folder the format reads pictures from, and the id as a file name. */
export function defaultPicturePath(id: string): string {
	return `images/${id.trim().replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "picture"}.jpg`;
}

/**
 * The note's text with the line that says where a reference-style picture is added after the block, as the piece the Add panel inserts has
 * it (a blank line, then `[id]: images/id.jpg`). Refused when the picture has one already, is not reference style, or is in a group (whose
 * lines are quoted and where the line is added in the Markdown).
 */
export function addDefinition(text: string, node: DesignNode, index: number): Made {
	const before = picturesOf(text, node);
	if ("refused" in before) return no(before.refused);
	const pic = before.pictures[index];
	if (!pic || pic.form !== "reference" || pic.id === null) return no("Only a picture in the reference style has a line that says where it is.");
	if (pic.definition || pic.problem) return no("This picture has a line that says where it is already.");
	if (inGroup(node)) return no("This block is inside a group, so the line is added in the Markdown.");
	const raw = text.split("\n");
	const at = node.start + blockLines(text, node).length;
	const eol = (raw[at - 1] ?? "").endsWith("\r") ? "\r" : "";
	const label = pic.id.trim();
	if (/[\][\\\s]/.test(label)) return no("The picture's id has a space or a bracket, so its line is added in the Markdown.");
	const add = ["", `[${label}]: ${defaultPicturePath(label)}`].map((l) => l + eol);
	const nextBlank = at >= raw.length || (raw[at] ?? "").trim() === "";
	const out = [...raw.slice(0, at), ...add, ...(nextBlank ? [] : [eol]), ...raw.slice(at)];
	const next = out.join("\n");
	// the new text is read as a new tree: the old one ends where the old text did, and a line added after its last line is outside it
	const fresh = nodeAtLine(parseDesign(next), node.start);
	const again = fresh.kind === "prose" ? picturesOf(next, fresh) : null;
	if (!again || "refused" in again || !again.pictures[index]?.definition) return no("The line would not be found where it is added, so it is not written.");
	return { ok: true, text: next };
}
