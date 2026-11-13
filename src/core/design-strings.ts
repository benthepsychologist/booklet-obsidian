/*
 * The Design view's words, in one table. English is the source and is always there; Spanish and French have a slot each, left empty
 * until /localize fills them, and a key with no Spanish or French is shown in English (so a half-translated table never shows a hole).
 * Plain TypeScript: nothing here imports Obsidian; the shell passes the language Obsidian is in (`langOf(getLanguage())`).
 *
 * A word that has a count is two keys, `<name>.one` and `<name>.other` (`plural`); French takes 0 and 1 as the singular. A `{name}` in
 * a string is filled from the values handed to `say`. Words that come from the format's own pieces table (a piece's label) and from
 * core's reasons (why a place is refused, what a change touches) are English in their own files and are not in this table.
 */
import { EMPTY_TEXT } from "./design-places";

export type Lang = "en" | "es" | "fr";

export interface StringEntry {
	en: string;
	es?: string;
	fr?: string;
}

export type Table = Readonly<Record<string, StringEntry>>;

/** The language a code names (`es-MX` is Spanish), English when it is none of ours. */
export function langOf(code: string | null | undefined): Lang {
	const c = String(code ?? "").toLowerCase();
	return c === "es" || c.startsWith("es-") || c.startsWith("es_") ? "es" : c === "fr" || c.startsWith("fr-") || c.startsWith("fr_") ? "fr" : "en";
}

/** A string from `table`, in `lang` when it has that slot filled, else in English; `{name}` is replaced from `vars`. An unknown key is its own text. */
export function say(table: Table, lang: Lang, key: string, vars: Readonly<Record<string, string | number>> = {}): string {
	const e = table[key];
	const text = e ? ((lang === "en" ? undefined : e[lang]) ?? e.en) : key;
	return text.replace(/\{(\w+)\}/g, (m, name: string) => (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m));
}

/** `<key>.one` for one, `<key>.other` for the rest (French: for 0 and 1 too), with `{n}` filled in. */
export function plural(table: Table, lang: Lang, key: string, n: number, vars: Readonly<Record<string, string | number>> = {}): string {
	const one = lang === "fr" ? n === 0 || n === 1 : n === 1;
	return say(table, lang, `${key}.${one ? "one" : "other"}`, { n, ...vars });
}

const en = (s: string): StringEntry => ({ en: s });

/** Every key of the Design view, for the shell and for the list a translator is handed. */
export const DESIGN_STRINGS = {
	// ---- the mode buttons (the header of each view) and the view's own name
	"mode.markdown": en("Show Markdown"),
	"mode.booklet": en("Open as booklet"),
	"mode.design": en("Open in Design view"),
	"view.name": en("Design"),
	"setting.openIn.name": en("Open booklets in"),
	"setting.openIn.desc": en("The view a booklet note opens in. The other views stay one button away in the header of every note."),
	"setting.openIn.booklet": en("Booklet view"),
	"setting.openIn.design": en("Design view"),

	// ---- the toolbar and the breadcrumb
	"toolbar.label": en("Design view actions"),
	"undo": en("Undo"),
	"redo": en("Redo"),
	"undo.title": en("Undo the last change made in this view"),
	"redo.title": en("Redo the change that was undone"),
	"crumb.label": en("Where you are in the booklet"),
	"status.label": en("What the view did"),

	// ---- each level of the booklet, and what it is in plain words (written once, here)
	"level.booklet": en("Booklet"),
	"level.module": en("Module"),
	"level.module-tab": en("Module tab"),
	"level.activity": en("Activity"),
	"level.activity-tab": en("Activity tab"),
	"level.page": en("Page"),
	"level.block": en("Block"),
	"what.booklet": en("The booklet is the whole note. Its opening comes first, then its modules and activities."),
	"what.module": en("A module is a unit of the booklet. It holds activities."),
	"what.module-tab": en("A module tab groups a module's activities on the module's own screen."),
	"what.activity": en("An activity is one thing a reader does. It holds questions, tabs and pages."),
	"what.activity-tab": en("An activity tab is one part of an activity that the reader switches to. It holds pages."),
	"what.page": en("A page is one screen of an activity or a tab. It holds questions and words."),
	"what.block": en("A block is one piece of a page: words, a question, a reading aid, a view or a group."),

	// ---- the kinds of block, and what a card says
	"kind.front-matter": en("Front matter"),
	"kind.data-section": en("Data section"),
	"kind.records": en("Records"),
	"kind.group": en("Group"),
	"kind.row": en("Row"),
	"kind.question": en("Question"),
	"kind.callout": en("Reading callout"),
	"kind.notice": en("Notice"),
	"kind.menu": en("Menu"),
	"kind.query": en("View of data"),
	"kind.fence": en("Data block"),
	"kind.page-break": en("Page break"),
	"kind.prose": en("Words"),
	"kind.comment": en("Comment"),
	"kind.as-written": en("As written"),
	"card.lines": en("Its lines in the note"),
	"card.fold": en("Its opening lines"),
	"card.records": en("This is the booklet's kept data. This view never writes it."),
	"card.asWritten": en("This view cannot draw this, so it is shown exactly as it is in the note."),
	"card.untitled": en("(no title)"),

	// ---- actions on a block
	"act.add": en("+ Add"),
	"act.add.label": en("Add to {name}"),
	"act.delete": en("Delete"),
	"act.delete.label": en("Delete {name}"),
	"act.up": en("Move up"),
	"act.up.label": en("Move {name} up"),
	"act.down": en("Move down"),
	"act.down.label": en("Move {name} down"),
	"act.select.label": en("Select {name}"),

	// ---- what a container says it can take
	"add.needs": en("A {kind} needs another part first: {first}."),
	"add.nothing": en("Nothing can be added here."),
	"place.front-matter": en("Front matter"),
	"place.theme": en("Theme"),
	"place.module": en("Module"),
	"place.activity": en("Activity"),
	"place.module-tab": en("Module tab"),
	"place.activity-tab": en("Activity tab"),
	"place.page": en("Page"),
	"place.question": en("Question"),
	"place.copy": en("Copy button"),
	"place.row": en("Row"),
	"place.group": en("Group"),
	"place.query": en("View of data"),
	"place.menu": en("Menu"),
	"place.data-block": en("Data block"),
	"place.data-section": en("Data section"),
	"place.notice": en("Notice"),
	"place.page-break": en("Page break"),
	"place.callout": en("Reading callout"),
	"place.text": en("Words"),
	"piece.words": en("words"),
	"empty.booklet": en(EMPTY_TEXT["booklet"] ?? ""),
	"empty.module": en(EMPTY_TEXT["module"] ?? ""),
	"empty.module-tab": en(EMPTY_TEXT["module-tab"] ?? ""),
	"empty.activity": en(EMPTY_TEXT["activity"] ?? ""),
	"empty.activity-tab": en(EMPTY_TEXT["activity-tab"] ?? ""),
	"empty.page": en(EMPTY_TEXT["page"] ?? ""),
	"empty.group": en(EMPTY_TEXT["group"] ?? ""),
	"empty.row": en(EMPTY_TEXT["row"] ?? ""),
	"empty.data-section": en(EMPTY_TEXT["data-section"] ?? ""),

	// ---- the catalogue: the parts a container can take, in four folded groups, each with live samples
	"cat.label": en("Parts that can be added here"),
	"cat.structure.title": en("Structure"),
	"cat.structure.blurb": en("The parts a booklet is built of: modules, activities, tabs, pages and rows."),
	"cat.questions.title": en("Questions"),
	"cat.questions.blurb": en("What a reader answers: choices, text, numbers, scales, dates and matrices."),
	"cat.reading.title": en("Reading aids"),
	"cat.reading.blurb": en("Things to read: callouts, hints, quotes, citations and words."),
	"cat.views-data.title": en("Views and data"),
	"cat.views-data.blurb": en("Rows and figures a booklet keeps, and the tables, lists, cards, tiles, bars and lines that show them."),
	"cat.open.label": en("{group}: {blurb}"),
	"cat.keys": en("Keys: {keys}"),
	"cat.nokeys": en("No keys"),
	"cat.add": en("Add"),
	"cat.add.label": en("Add {name}"),
	"cat.sample.label": en("A sample of {name}"),
	"cat.card.label": en("The Markdown of {name}"),

	// ---- how a block in the tree is drawn, and why one is only its Markdown
	"draw.label": en("How this block looks to a reader, with nothing answered"),
	"draw.fold": en("Its lines in the note"),
	"draw.later": en("This is shown as its Markdown for now. A later beta draws it."),
	"draw.remote": en("This points at media on another site, so it is not drawn here and nothing is fetched. It is shown as its Markdown."),

	// ---- the keys: a first letter picks a group, a second a part, Enter adds it
	"keys.title": en("Add a part by keys"),
	"keys.label": en("Add a part: pick a letter, or type a word to narrow the list"),
	"keys.hint": en("Press a letter to pick. Type a word to narrow the list. Arrow keys move, Enter adds the highlighted part, Escape closes."),
	"keys.groups": en("Pick a group:"),
	"keys.in": en("{group}: pick a part."),
	"keys.variants": en("{name}: Enter adds it as it is, or pick a variant."),
	"keys.filter": en("Parts that match “{typed}”:"),
	"keys.none": en("Nothing matches “{typed}”. Backspace takes a letter back."),
	"keys.back": en("Back"),
	"keys.close": en("Close"),
	"keys.refused": en("{name} cannot go here: {reason}"),
	"keys.pick.label": en("Add {name} ({keys})"),
	"keys.group.label": en("{group} ({key})"),
	"keys.disabled": en("Not here: {reason}"),
	"keys.bar": en("Add a part by group"),
	"keys.addPiece": en("Add part…"),
	"keys.addPiece.title": en("Open the list of parts that can be added here"),

	// ---- the palette commands (no default keys: a person may bind her own)
	"cmd.addPiece": en("Design view: add a part…"),
	"cmd.group": en("Design view: add from {group}…"),

	// ---- the question before a change that touches kept data
	"confirm.title.delete": en("Delete this {kind}?"),
	"confirm.title.move": en("Move this {kind}?"),
	"confirm.lead.delete": en("{name} and everything in it will be taken out of the note."),
	"confirm.lead.move": en("{name} and everything in it will be moved in the note."),
	"confirm.lines.one": en("{n} line"),
	"confirm.lines.other": en("{n} lines"),
	"confirm.touches": en("Kept data in this booklet will no longer match what it was kept for:"),
	"confirm.stays": en("The kept entries, answers and rows stay in the note's records as they are. This view does not delete or rewrite them."),
	"confirm.blind": en("The reader cannot open this booklet as it is, so this view cannot count what this change touches."),
	"confirm.notes": en("Also:"),
	"confirm.undo": en("Undo in this view brings the note back as it was. This view keeps its own undo history, so the Markdown view's own undo is not affected."),
	"confirm.yes.delete": en("Delete"),
	"confirm.yes.move": en("Move"),
	"confirm.no": en("Cancel"),

	// ---- what the view says after it acts
	"status.added": en("Added {name}."),
	"status.deleted": en("Deleted {name}."),
	"status.moved": en("Moved {name}."),
	"status.undone": en("Undone."),
	"status.redone": en("Redone."),
	"status.cancelled": en("Nothing was changed."),
	"status.stale": en("The note changed after this view drew it, so nothing was written. It is drawn again from the note as it is now."),
	"status.failed": en("The note could not be written. Nothing was changed."),
	"status.nothingUndo": en("There is nothing to undo in this view."),
	"status.nothingRedo": en("There is nothing to redo in this view."),
	"status.undoChanged": en("The note was changed outside this view since that step, so this view cannot undo it safely. Nothing was changed."),
	"status.redoChanged": en("The note was changed outside this view since that step, so this view cannot redo it safely. Nothing was changed."),
	"note.notBooklet": en("This note has no booklet line in its properties, so it is not a booklet yet. You can add front matter below."),
} as const satisfies Table;

export type DesignKey = keyof typeof DESIGN_STRINGS;

/** One key of the Design view's table, in `lang`. */
export const t = (key: DesignKey, lang: Lang, vars?: Readonly<Record<string, string | number>>): string => say(DESIGN_STRINGS, lang, key, vars);

/** One counted key of the Design view's table (`confirm.lines` is `confirm.lines.one` and `.other`). */
export const tn = (key: "confirm.lines", n: number, lang: Lang): string => plural(DESIGN_STRINGS, lang, key, n);
