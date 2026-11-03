/*
 * The notice at the top of a note that holds something this view does not read: each kind of line, setting, query key or block it left
 * out, with the line it stands on. A note's marker alone never makes one: a reader that lags the format opens a note of another 0.x
 * version quietly, and says something only about what it cannot draw. The words are all here. Plain TypeScript: nothing here imports Obsidian.
 */
import { FORMAT_VERSION, versionOf, type Booklet } from "./reader";

export interface OpeningNotice {
	/** The notice's sentences, in order: the plugin and its format, what is not read, how to update. */
	paragraphs: string[];
	/** Where `paragraphs` list what is not read: the lines after the sentence that introduces them, one for each place. */
	entries: string[];
	/** Where in `paragraphs` the entries are listed: they come after that paragraph. */
	entriesAfter: number;
	/** How many things the notice counts among the note's problems: one for each entry. */
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
 * The notice for a note, or null when it holds nothing that is not read, whatever its 0.x marker (earlier, later or the same). `plugin` is the
 * plugin's version, from its manifest ("" when that is not known). The note still draws what it can and still takes answers; whatever
 * is not read stays in the file exactly as written.
 */
export function openingNotice(book: Pick<Booklet, "marker" | "unread">, plugin: string): OpeningNotice | null {
	if (!book.unread.length) return null;
	const n = book.unread.length;
	const entries = book.unread.map((u) => `Line ${u.line}: ${u.text} (${u.why})`);
	const paragraphs = [
		`This is Booklet ${plugin ? `plugin ${plugin}` : "plugin"}, which reads format ${FORMAT_VERSION}.`,
		n === 1
			? "This view does not read this part of the note. It stays in the file exactly as written, and the rest of the note works as usual:"
			: `This view does not read these ${n} parts of the note. They stay in the file exactly as written, and the rest of the note works as usual:`,
	];
	const entriesAfter = 1;
	// a newer plugin might read what is left out of a note that says it is from a later format, a kind or block no version here knows, or a
	// setting that is not a mistake on a known name (see `looksLikeMistake`); a mistyped setting is for the note's author to fix
	const some = book.unread.some((u) => u.newer);
	if (markerAgainstFormat(book.marker) === "later") paragraphs.push(`A newer version of the plugin may read this note. ${HOW_TO_UPDATE}`);
	else if (some) {
		const lead = book.unread.every((u) => u.newer) ? "A newer version of the plugin may read" : "A newer version of the plugin may read some of";
		paragraphs.push(`${lead} ${n === 1 ? "this" : "these"}. ${HOW_TO_UPDATE}`);
	}
	return { paragraphs, entries, entriesAfter, count: n };
}
