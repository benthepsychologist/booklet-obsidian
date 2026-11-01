/*
 * The notice at the top of a note that holds something this view does not read: the note's marker when it is not the format this view
 * reads (SPEC section 2), and each kind of line, setting, query key or block it left out, with the line it stands on. The words are all
 * here. Plain TypeScript: nothing here imports Obsidian.
 */
import { FORMAT_VERSION, versionOf, type Booklet } from "./reader";

export interface OpeningNotice {
	/** The notice's sentences, in order: the marker, the plugin and its format, what is not read, how to update. */
	paragraphs: string[];
	/** Where `paragraphs` list what is not read: the lines after the sentence that introduces them, one for each place. */
	entries: string[];
	/** Where in `paragraphs` the entries are listed (they come after that paragraph), or -1 when there are none. */
	entriesAfter: number;
	/** How many things the notice counts among the note's problems: one for the marker, one for each entry. */
	count: number;
}

/** Is the marker an earlier 0.x than this view reads, a later one, or the same? Null for a marker that is none of them (not a 0.x version). */
export function markerAgainstFormat(marker: string): "same" | "earlier" | "later" | null {
	const have = versionOf(marker);
	const read = versionOf(FORMAT_VERSION);
	if (!have || !read || have[0] !== 0) return null;
	if (have[0] === read[0] && have[1] === read[1]) return "same";
	return have[1] < read[1] ? "earlier" : "later";
}

/** How a person updates the plugin. */
const HOW_TO_UPDATE = "To update: Settings, Community plugins, Check for updates.";

/**
 * The notice for a note, or null when its marker is the format this view reads and it holds nothing that is not read. `plugin` is the
 * plugin's version, from its manifest ("" when that is not known). The note still draws what it can and still takes answers; whatever
 * is not read stays in the file exactly as written.
 */
export function openingNotice(book: Pick<Booklet, "marker" | "unread">, plugin: string): OpeningNotice | null {
	const against = markerAgainstFormat(book.marker);
	const off = against === "earlier" || against === "later";
	if (!off && !book.unread.length) return null;
	const paragraphs: string[] = [];
	if (off) paragraphs.push(`This file says booklet: ${book.marker}. This view reads format ${FORMAT_VERSION} and has opened it as it is; some of it may not draw.`);
	if (against === "later") paragraphs.push(`Format ${book.marker} is newer than the format this view reads.`);
	paragraphs.push(`This is Booklet ${plugin ? `plugin ${plugin}` : "plugin"}, which reads format ${FORMAT_VERSION}.`);
	const n = book.unread.length;
	let entriesAfter = -1;
	const entries = book.unread.map((u) => `Line ${u.line}: ${u.text} (${u.why})`);
	if (n) {
		paragraphs.push(
			n === 1
				? "This view does not read this part of the note. It stays in the file exactly as written, and the rest of the note works as usual:"
				: `This view does not read these ${n} parts of the note. They stay in the file exactly as written, and the rest of the note works as usual:`,
		);
		entriesAfter = paragraphs.length - 1;
	}
	// a newer plugin might read a note that says it is from a later format, a kind or block no version here knows, or a setting that is not a
	// mistake on a known name (see `looksLikeMistake`); an earlier marker alone, or a mistyped setting, is for the note's author to fix
	const some = book.unread.some((u) => u.newer);
	if (against === "later") paragraphs.push(`A newer version of the plugin may read this note. ${HOW_TO_UPDATE}`);
	else if (some) paragraphs.push(`${book.unread.every((u) => u.newer) ? "A newer version of the plugin may read" : "A newer version of the plugin may read some of"} ${n === 1 ? "this" : "these"}. ${HOW_TO_UPDATE}`);
	return { paragraphs, entries, entriesAfter, count: (off ? 1 : 0) + n };
}
