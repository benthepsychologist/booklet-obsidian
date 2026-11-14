/*
 * The pictures on the Design view's Add tiles: one for every piece in pieces/. A tile LOOKS like the thing it adds, or at least
 * indicates it. Plain TypeScript: no Obsidian import, no DOM, no innerHTML (the plugin directory's checker rejects innerHTML), so
 * the artwork is DATA. The view turns an `svg` art into SVG elements with createSvg (tag, attrs, children) and an `icon` art into
 * one of Obsidian's own (lucide) icons by name.
 *
 * Which pieces are drawn and which are icons:
 *   drawn (viewBox "0 0 80 46")  every structure piece, every question piece, and the twelve reading callouts (tip, note,
 *                                warning, example, hint, solution, law, diff, opinion, question, quote, citation), which are
 *                                the small callout card the reader draws: a rounded card, a coloured bar down its left edge, a
 *                                small sign in the kind's colour and two grey text lines
 *   icons                        image, figure, copy button and the two groups (reading); every view; every data piece
 *
 * NO COLOUR IS WRITTEN HERE. Every fill and stroke is `none`, `currentColor` or a custom property, so light and dark themes both
 * work. The view's stylesheet defines these custom properties on the tile's picture (from Obsidian's theme variables):
 *
 *   --bd-ink            the strong line and the filled marks (a radio that is chosen, a table header, a cylinder's outline)
 *   --bd-ink-soft       the quiet marks: grey text lines, grid lines, the unchosen choices
 *   --bd-paper          the face of a drawn card, field or page; also a tick drawn on a filled mark
 *   --bd-accent         the one bright mark of a picture (the chosen answer, a handle, a bar, a badge)
 *   --bd-callout-tip, --bd-callout-hint, --bd-callout-note, --bd-callout-warning, --bd-callout-example,
 *   --bd-callout-solution, --bd-callout-law, --bd-callout-diff, --bd-callout-opinion, --bd-callout-question,
 *   --bd-callout-quote, --bd-callout-citation
 *                       the colour of each reading callout's bar and sign: the colours the reader draws that callout in
 *
 * A custom property the stylesheet leaves undefined draws that mark in the browser's initial colour, never throws.
 */

/** One SVG element as data: its tag, its attributes and its children. */
export interface SvgPart {
	tag: string;
	attrs: Record<string, string | number>;
	children?: SvgPart[];
	/** The words of a `text` element (the view sets them as the element's text content; no markup is ever built from it). */
	text?: string;
}

/** The picture of a piece: a drawing, or the name of one of Obsidian's icons with the tone its tile draws it in. */
export type Art =
	| { kind: "svg"; viewBox: string; parts: SvgPart[] }
	| { kind: "icon"; icon: string; tone: "structure" | "question" | "reading" | "view" | "data" };

type Tone = "structure" | "question" | "reading" | "view" | "data";

const INK = "var(--bd-ink)";
const SOFT = "var(--bd-ink-soft)";
const PAPER = "var(--bd-paper)";
const ACC = "var(--bd-accent)";

const VIEWBOX = "0 0 80 46";

type Attrs = Record<string, string | number>;

const el = (tag: string, attrs: Attrs, children?: SvgPart[]): SvgPart => (children ? { tag, attrs, children } : { tag, attrs });
const rect = (x: number, y: number, width: number, height: number, rx: number, attrs: Attrs): SvgPart => el("rect", { x, y, width, height, rx, ...attrs });
const circle = (cx: number, cy: number, r: number, attrs: Attrs): SvgPart => el("circle", { cx, cy, r, ...attrs });
const path = (d: string, attrs: Attrs): SvgPart => el("path", { d, ...attrs });
const text = (x: number, y: number, size: number, content: string, attrs: Attrs): SvgPart => ({
	tag: "text",
	attrs: { x, y, "text-anchor": "middle", "font-size": size, "font-weight": 700, "font-family": "system-ui", ...attrs },
	text: content,
});

/** The face of a card, field or page. */
const face = (w = 1.5, extra: Attrs = {}): Attrs => ({ fill: PAPER, stroke: INK, "stroke-width": w, ...extra });
/** A grey line of text. */
const bar = (x: number, y: number, w: number, h = 3.5): SvgPart => rect(x, y, w, h, h / 2, { fill: SOFT });
/** A line drawn with a stroke: round caps, no fill. */
const stroke = (colour: string, width: number, extra: Attrs = {}): Attrs => ({ fill: "none", stroke: colour, "stroke-width": width, "stroke-linecap": "round", "stroke-linejoin": "round", ...extra });

const svg = (...parts: SvgPart[]): Art => ({ kind: "svg", viewBox: VIEWBOX, parts });
const icon = (name: string, tone: Tone): Art => ({ kind: "icon", icon: name, tone });

/** A can (data's cylinder): its body and seam, then its top ellipse; `cx` its middle, `top` the centre of the top ellipse. */
function cylinder(cx: number, top: number, rx: number, ry: number, height: number): SvgPart[] {
	const l = cx - rx;
	return [
		path(`M${l} ${top}v${height}a${rx} ${ry} 0 0 0 ${rx * 2} 0v-${height}`, face(1.6)),
		path(`M${l} ${top + height / 2}a${rx} ${ry} 0 0 0 ${rx * 2} 0`, stroke(SOFT, 1.4)),
		ellipse(cx, top, rx, ry, face(1.6)),
	];
}
const ellipse = (cx: number, cy: number, rx: number, ry: number, attrs: Attrs): SvgPart => el("ellipse", { cx, cy, rx, ry, ...attrs });

// ---------------------------------------------------------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------------------------------------------------------

/** Three cards, one behind the other: an activity that keeps what the reader enters. */
function stack(): SvgPart[] {
	return [
		rect(26, 4, 42, 28, 4, { fill: PAPER, stroke: SOFT, "stroke-width": 1.4 }),
		rect(20, 9, 42, 28, 4, { fill: PAPER, stroke: INK, "stroke-width": 1.4, opacity: 0.7 }),
		rect(14, 14, 42, 28, 4, face(1.6)),
		bar(21, 22, 26),
		bar(21, 30, 18),
	];
}

const MODULE = svg(
	rect(14, 5, 52, 36, 5, face(1.6)),
	rect(21, 12, 38, 9, 2, { fill: PAPER, stroke: SOFT, "stroke-width": 1.2 }),
	rect(21, 26, 38, 9, 2, { fill: PAPER, stroke: SOFT, "stroke-width": 1.2 }),
	bar(25, 15.2, 20, 2.6),
	bar(25, 29.2, 14, 2.6),
);

const ACTIVITY = svg(
	rect(18, 5, 44, 36, 4, face(1.6)),
	path("M25 15l2.5 2.5L33 12M25 27l2.5 2.5L33 24", stroke(ACC, 1.6)),
	bar(38, 13, 18),
	bar(38, 25, 14),
);

const ACTIVITY_REPEAT = svg(...stack());

const ACTIVITY_DAILY = svg(
	...stack(),
	circle(63, 34, 8, face(1.6, { fill: ACC, stroke: PAPER })),
	path("M63 29v5l3.2 2", stroke(PAPER, 1.6)),
);

const TAB = svg(
	path("M10 17h22v-7a2 2 0 012-2h14a2 2 0 012 2v7h20v24H10z", face(1.6, { "stroke-linejoin": "round" })),
	bar(36, 12, 10, 3),
	path("M18 28h44M18 34h30", stroke(SOFT, 3)),
);

const PAGE = svg(
	path("M26 5h22l10 10v26H26z", face(1.6, { "stroke-linejoin": "round" })),
	path("M48 5v10h10", stroke(INK, 1.6, { "stroke-linecap": "butt" })),
	path("M32 24h20M32 31h14", stroke(SOFT, 3)),
);

const ROW = svg(
	rect(8, 16, 64, 14, 3, face(1.6)),
	path("M28 16v14M50 16v14", stroke(SOFT, 1.4)),
	circle(18, 23, 2.2, { fill: ACC }),
	circle(39, 23, 2.2, { fill: SOFT }),
	circle(61, 23, 2.2, { fill: SOFT }),
);

const NOTICE = svg(
	rect(12, 8, 56, 30, 4, face(1.5, { "stroke-dasharray": "4 3" })),
	text(40, 29, 17, "!", { fill: ACC }),
);

const PAGE_BREAK = svg(
	rect(22, 4, 36, 14, 3, face(1.5)),
	rect(22, 28, 36, 14, 3, face(1.5)),
	path("M10 23h60", stroke(ACC, 1.6, { "stroke-dasharray": "5 4", "stroke-linecap": "butt" })),
);

const FRONT_MATTER = svg(
	rect(18, 5, 44, 36, 4, face(1.5)),
	path("M24 12h32M24 34h32", stroke(INK, 1.6, { "stroke-dasharray": "3 2", "stroke-linecap": "butt" })),
	bar(24, 17.5, 10, 2.8),
	bar(37, 17.5, 18, 2.8),
	bar(24, 22.5, 8, 2.8),
	bar(35, 22.5, 20, 2.8),
	bar(24, 27.5, 12, 2.8),
	bar(39, 27.5, 14, 2.8),
);

const THEME = svg(
	circle(28, 20, 9, { fill: ACC, stroke: PAPER, "stroke-width": 1.5 }),
	circle(40, 20, 9, { fill: INK, stroke: PAPER, "stroke-width": 1.5, opacity: 0.85 }),
	circle(52, 20, 9, { fill: SOFT, stroke: PAPER, "stroke-width": 1.5 }),
	text(40, 41, 10, "Aa", { fill: INK }),
);

const DATA_SECTION = svg(...cylinder(40, 11, 20, 5.5, 24));

const DATA_SECTION_MODULE = svg(
	rect(7, 4, 66, 38, 5, face(1.5, { "stroke-dasharray": "4 3" })),
	...cylinder(40, 14, 15, 4.5, 22),
);

const PIECE_MARKER = svg(
	rect(8, 14, 64, 18, 4, face(1.4, { "stroke-dasharray": "4 3" })),
	text(40, 26.5, 9, "<!-- -->", { fill: SOFT, "font-family": "ui-monospace, monospace" }),
);

// ---------------------------------------------------------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------------------------------------------------------

/** A radio of the choice drawings: chosen (filled) or not. */
const radio = (cy: number, chosen: boolean): SvgPart => (chosen ? circle(16, cy, 4.5, { fill: ACC }) : circle(16, cy, 4.5, { fill: "none", stroke: INK, "stroke-width": 1.6 }));

/** A checkbox of the multi drawings at (x, y), `s` wide: ticked (filled, with a tick) or empty. */
function checkbox(x: number, y: number, s: number, ticked: boolean, extra: Attrs = {}): SvgPart[] {
	if (!ticked) return [rect(x + 0.5, y + 0.5, s - 1, s - 1, 2, { fill: "none", stroke: INK, "stroke-width": 1.5, ...extra })];
	return [rect(x, y, s, s, 2, { fill: ACC }), path(`M${x + 2} ${y + s / 2}l2 2 3.5-4.5`, stroke(PAPER, 1.5))];
}

const CHOICE = svg(
	radio(11, true),
	bar(28, 9, 36, 4),
	radio(23, false),
	bar(28, 21, 30, 4),
	radio(35, false),
	bar(28, 33, 34, 4),
);

const MULTI = svg(
	...checkbox(11, 6.5, 9, true),
	bar(28, 9, 36, 4),
	...checkbox(11, 18.5, 9, false),
	bar(28, 21, 30, 4),
	...checkbox(11, 30.5, 9, true),
	bar(28, 33, 34, 4),
);

const MULTI_OWN = svg(
	...checkbox(11, 5, 9, true),
	bar(28, 7.5, 36, 4),
	...checkbox(11, 18, 9, false),
	bar(28, 20.5, 30, 4),
	rect(11.5, 31.5, 8, 8, 2, { fill: "none", stroke: ACC, "stroke-width": 1.5, "stroke-dasharray": "2 1.5" }),
	path("M15.5 33.5v4M13.5 35.5h4", stroke(ACC, 1.3)),
	rect(28, 33, 34, 4, 2, { fill: "none", stroke: ACC, "stroke-width": 1.2, "stroke-dasharray": "3 2" }),
);

const MULTI_MENU = svg(
	rect(5, 7, 26, 32, 3, face(1.4)),
	bar(10, 12, 16, 3),
	bar(10, 21, 12, 3),
	bar(10, 30, 15, 3),
	path("M33 23h8M38.5 20l3 3-3 3", stroke(ACC, 1.6)),
	...checkbox(46, 8, 8, true),
	bar(58, 10, 15, 3.5),
	...checkbox(46, 19, 8, false),
	bar(58, 21, 11, 3.5),
	...checkbox(46, 30, 8, true),
	bar(58, 32, 14, 3.5),
);

const MENU = svg(
	rect(6, 5, 34, 36, 3, face(1.5)),
	circle(13, 13, 1.8, { fill: ACC }),
	bar(18, 11.3, 16, 3.4),
	circle(13, 23, 1.8, { fill: ACC }),
	bar(18, 21.3, 12, 3.4),
	circle(13, 33, 1.8, { fill: ACC }),
	bar(18, 31.3, 15, 3.4),
	path("M40 23c6 0 6-10 12-10M40 23c6 0 6 10 12 10", stroke(SOFT, 1.3)),
	rect(52, 8, 22, 10, 3, face(1.4)),
	path("M66 11.8l2.5 2.6 2.5-2.6", stroke(INK, 1.3)),
	bar(56, 11.6, 7, 2.8),
	rect(52, 28, 22, 10, 3, face(1.4)),
	path("M66 31.8l2.5 2.6 2.5-2.6", stroke(INK, 1.3)),
	bar(56, 31.6, 7, 2.8),
);

const MATRIX = svg(
	rect(10, 6, 60, 34, 3, { fill: "none", stroke: INK, "stroke-width": 1.4 }),
	path("M30 6v34M50 6v34M10 17.5h60M10 28.5h60", stroke(SOFT, 1.2, { "stroke-linecap": "butt" })),
	circle(20, 23, 3, { fill: ACC }),
	circle(40, 34, 3, { fill: ACC }),
	circle(60, 12, 3, { fill: ACC }),
);

const LINES = svg(
	path("M12 14h42M12 24h42M12 34h42", stroke(SOFT, 3)),
	circle(64, 34, 7, { fill: ACC }),
	path("M64 31v6M61 34h6", stroke(PAPER, 1.6)),
);

const TEXT = svg(
	rect(10, 14, 60, 18, 4, face(1.5)),
	bar(16, 21.2, 28, 3.6),
	path("M47 18v10", stroke(ACC, 1.6)),
);

const TEXT_LONG = svg(
	rect(10, 5, 60, 36, 4, face(1.5)),
	bar(16, 11, 44),
	bar(16, 18, 36),
	bar(16, 25, 40),
	bar(16, 32, 18),
	path("M62 37l5-5M65 37l2-2", stroke(SOFT, 1.2)),
);

const NUMBER = svg(
	rect(12, 11, 56, 24, 5, face(1.5)),
	text(40, 29, 15, "42", { fill: ACC }),
);

const SCALE = svg(
	rect(10, 21, 60, 4, 2, { fill: SOFT }),
	rect(10, 21, 36, 4, 2, { fill: ACC }),
	circle(46, 23, 6, face(2, { stroke: ACC })),
	path("M10 33v4M25 33v4M40 33v4M55 33v4M70 33v4", stroke(SOFT, 1.2, { "stroke-linecap": "butt" })),
);

const DATE = svg(
	rect(17, 6, 46, 35, 4, face(1.5)),
	path("M17 15V10a4 4 0 014-4h38a4 4 0 014 4v5z", { fill: INK }),
	circle(27, 23, 2, { fill: SOFT }),
	circle(40, 23, 2, { fill: SOFT }),
	circle(53, 23, 2, { fill: ACC }),
	circle(27, 32, 2, { fill: SOFT }),
	circle(40, 32, 2, { fill: SOFT }),
);

const LISTEN = svg(
	circle(24, 23, 11, { fill: ACC }),
	path("M21 18v10l9-5z", { fill: PAPER }),
	path("M46 17v12M52 13v20M58 18v10M64 21v4", stroke(SOFT, 2.4)),
);

const WIDGET = svg(
	rect(16, 6, 22, 16, 3, { fill: SOFT }),
	rect(42, 6, 22, 16, 3, { fill: ACC }),
	rect(16, 25, 22, 16, 3, { fill: ACC }),
	rect(42, 25, 22, 16, 3, { fill: SOFT }),
);

// ---------------------------------------------------------------------------------------------------------------------------
// Reading callouts: the card the reader draws, with a sign in the kind's colour
// ---------------------------------------------------------------------------------------------------------------------------

/** The points of a five-pointed star centred on (cx, cy). */
function starPoints(cx: number, cy: number, outer: number, inner: number): string {
	const pts: string[] = [];
	for (let i = 0; i < 10; i++) {
		const r = i % 2 === 0 ? outer : inner;
		const a = (Math.PI / 5) * i - Math.PI / 2;
		pts.push(`${+(cx + r * Math.cos(a)).toFixed(2)},${+(cy + r * Math.sin(a)).toFixed(2)}`);
	}
	return pts.join(" ");
}

/** The sign each callout carries, in its colour `c`, inside the box x 18..34, y 15..31. */
const SIGNS: Record<string, (c: string) => SvgPart[]> = {
	tip: (c) => [el("polygon", { points: starPoints(26, 23.5, 7.5, 3.2), ...stroke(c, 1.5, { fill: c }) })],
	hint: (c) => [circle(26, 20.5, 5, stroke(c, 1.6)), path("M23.5 28.2h5M24.5 31h3", stroke(c, 1.5))],
	note: (c) => [circle(26, 23, 6.5, stroke(c, 1.6)), path("M26 22.5v5M26 19.2v.1", stroke(c, 1.8))],
	warning: (c) => [path("M26 15.5l8 14h-16z", stroke(c, 1.6)), path("M26 20.5v4M26 27v.1", stroke(c, 1.8))],
	example: (c) => [text(26, 26.5, 9, "e.g.", { fill: c })],
	solution: (c) => [path("M19.5 23.5l4.5 4.5 8.5-9.5", stroke(c, 2.2))],
	law: (c) => [text(26, 29, 16, "\u00a7", { fill: c, "font-family": "Georgia, serif" })],
	diff: (c) => [path("M19.5 20h13M19.5 26.5h13M23.5 31.5l5-17", stroke(c, 1.8))],
	opinion: (c) => [path("M20 17h12a2 2 0 012 2v6a2 2 0 01-2 2h-7l-4.5 4v-4H20a2 2 0 01-2-2v-6a2 2 0 012-2z", stroke(c, 1.6))],
	question: (c) => [text(26, 30, 19, "?", { fill: c })],
	quote: (c) => [text(26, 38, 30, "\u201c", { fill: c, "font-family": "Georgia, serif" })],
	citation: (c) => [text(26, 26.5, 9, "[1]", { fill: c })],
};

/** The sign of `kind` in `colour`; a kind with no sign of its own gets the note's. */
function sign(kind: string, colour: string): SvgPart[] {
	const draw = SIGNS[kind] ?? SIGNS["note"];
	return draw ? draw(colour) : [];
}

/** The small callout drawing for `kind`: a card, a bar down its left edge in the kind's colour, its sign and two grey lines of text. */
function callout(kind: string): Art {
	const colour = `var(--bd-callout-${kind})`;
	return svg(
		rect(10, 9, 60, 28, 4, { fill: PAPER, stroke: SOFT, "stroke-width": 1.2 }),
		rect(10, 9, 5, 28, 2, { fill: colour }),
		...sign(kind, colour),
		bar(38, 16, 24),
		bar(38, 25, 18),
	);
}

/** The callout kinds that are drawn: the twelve reading pieces that are a callout (or, for the citation, a footnote). */
const CALLOUT_KINDS: readonly string[] = ["tip", "note", "warning", "example", "hint", "solution", "law", "diff", "opinion", "question", "quote", "citation"];

// ---------------------------------------------------------------------------------------------------------------------------
// The table: one entry for each file in pieces/
// ---------------------------------------------------------------------------------------------------------------------------

const ART: Readonly<Record<string, Art>> = {
	// structure: drawn
	"Structure - module.md": MODULE,
	"Structure - activity.md": ACTIVITY,
	"Structure - activity (repeat).md": ACTIVITY_REPEAT,
	"Structure - activity (repeat daily).md": ACTIVITY_DAILY,
	"Structure - tab.md": TAB,
	"Structure - page.md": PAGE,
	"Structure - row.md": ROW,
	"Structure - notice.md": NOTICE,
	"Structure - page break.md": PAGE_BREAK,
	"Structure - front matter.md": FRONT_MATTER,
	"Structure - theme.md": THEME,
	"Structure - data section.md": DATA_SECTION,
	"Structure - data section (module).md": DATA_SECTION_MODULE,
	"Structure - piece marker.md": PIECE_MARKER,

	// questions: drawn
	"Q - choice.md": CHOICE,
	"Q - multi.md": MULTI,
	"Q - multi (own options).md": MULTI_OWN,
	"Q - multi (from a menu).md": MULTI_MENU,
	"Q - menu (shared list).md": MENU,
	"Q - matrix.md": MATRIX,
	"Q - lines.md": LINES,
	"Q - text.md": TEXT,
	"Q - text (long).md": TEXT_LONG,
	"Q - number.md": NUMBER,
	"Q - scale.md": SCALE,
	"Q - date.md": DATE,
	"Q - listen.md": LISTEN,
	"Q - widget (grid).md": WIDGET,

	// reading: the callouts are drawn, the rest are icons
	"Reading - tip.md": callout("tip"),
	"Reading - note.md": callout("note"),
	"Reading - warning.md": callout("warning"),
	"Reading - example.md": callout("example"),
	"Reading - hint.md": callout("hint"),
	"Reading - solution.md": callout("solution"),
	"Reading - law.md": callout("law"),
	"Reading - diff.md": callout("diff"),
	"Reading - opinion.md": callout("opinion"),
	"Reading - question.md": callout("question"),
	"Reading - quote.md": callout("quote"),
	"Reading - citation.md": callout("citation"),
	"Reading - image.md": icon("image", "reading"),
	"Reading - figure (embed).md": icon("shapes", "reading"),
	"Reading - copy button.md": icon("copy", "reading"),
	"Reading - group (folded).md": icon("chevrons-up-down", "reading"),
	"Reading - group (steps).md": icon("list-ordered", "reading"),

	// views: icons
	"View - table.md": icon("table", "view"),
	"View - table (the reader adds and removes rows).md": icon("table-properties", "view"),
	"View - bars.md": icon("chart-column", "view"),
	"View - line.md": icon("chart-line", "view"),
	"View - cards.md": icon("sticky-note", "view"),
	"View - tiles.md": icon("layout-grid", "view"),
	"View - list.md": icon("list", "view"),
	"View - kept entries (a log and its list).md": icon("clipboard-list", "view"),

	// data: icons
	"Data - rows.md": icon("database", "data"),
	"Data - rows (the reader can edit).md": icon("notebook-pen", "data"),
	"Data - figure (diagram).md": icon("route", "data"),
};

/** Every piece file that has art, for the test that holds this table against pieces/. */
export const ART_FILES: readonly string[] = Object.keys(ART);

// ---------------------------------------------------------------------------------------------------------------------------
// The lookup, and what it falls back to
// ---------------------------------------------------------------------------------------------------------------------------

/** The icon of a view (the `as:` of a query) that has no file of its own in the table, by name; a stranger falls back to the group's icon. */
const VIEW_ICONS: Readonly<Record<string, string>> = {
	table: "table",
	bars: "chart-column",
	line: "chart-line",
	cards: "sticky-note",
	tiles: "layout-grid",
	list: "list",
};

/** The icon and the tone a piece of a group has when nothing more is known of it. */
const GROUP_FALLBACK: Readonly<Record<string, { icon: string; tone: Tone }>> = {
	structure: { icon: "layers", tone: "structure" },
	questions: { icon: "circle-help", tone: "question" },
	question: { icon: "circle-help", tone: "question" },
	reading: { icon: "book-open", tone: "reading" },
	views: { icon: "chart-column", tone: "view" },
	view: { icon: "chart-column", tone: "view" },
	data: { icon: "database", tone: "data" },
};

/** The group's own generic icon; a group nobody knows is drawn as a plain shape, never as nothing. */
const GENERIC: { icon: string; tone: Tone } = { icon: "shapes", tone: "structure" };

/**
 * The art of a piece. A piece in the table (every file in pieces/) has the picture drawn for it. A piece that is not in the table
 * (a file added to pieces/ before its picture is drawn) is looked up by what it holds: a reading piece holding a known callout is
 * drawn as that callout, a view piece holding a known view gets that view's icon; anything else falls back to a generic icon for its
 * group. It never throws.
 */
export function artOf(piece: { file: string; group: string; kinds?: readonly string[]; views?: readonly string[] }): Art {
	const own = Object.prototype.hasOwnProperty.call(ART, piece.file) ? ART[piece.file] : undefined;
	if (own) return own;
	const group = GROUP_FALLBACK[piece.group] ?? GENERIC;
	if (piece.group === "reading") {
		const kind = (piece.kinds ?? []).find((k) => CALLOUT_KINDS.includes(k));
		if (kind) return callout(kind);
	}
	if (piece.group === "views" || piece.group === "view") {
		for (const v of piece.views ?? []) {
			const name = Object.prototype.hasOwnProperty.call(VIEW_ICONS, v) ? VIEW_ICONS[v] : undefined;
			if (name) return icon(name, "view");
		}
	}
	return icon(group.icon, group.tone);
}
