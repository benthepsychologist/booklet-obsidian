/*
 * Inert drawings for the Design view: a question drawn as a reader sees it, a reading callout drawn as Obsidian draws it, and neither able to
 * change anything. The same code draws the samples in the catalogue (from a piece's own template text, fixed local content) and the blocks
 * of the note in the tree (from what the note says). It draws no control of its own: `drawQuestion` (questions.ts), the widget engines
 * (engines.ts) and the matrix (matrix.ts) draw, and what is inert about them is three things at once.
 *
 *   1. `locked` = true to `drawQuestion`, which switches off every button and field the kind draws. That stops a person, not a script.
 *   2. The drawing's wrapper has the class `booklet-sample` (its stylesheet rule turns pointer events off) and the `inert` attribute, where
 *      the app's browser has it. A capture-phase listener on the wrapper also drops every event aimed at a control inside it, so even an
 *      event a script makes never reaches a handler.
 *   3. The host it draws with is a stand-in for the Booklet view: it keeps no answer, writes nothing, and lists every call that would have
 *      changed something in `writes`. This is the guard that holds when the other two do not (a test calls it directly).
 *
 * A `listen` is drawn by the reader's own `drawListen` over a `Listens` (listen-view.ts) built on an io that holds nothing and writes nothing,
 * and its media is said as plain words, its name and its address (`mediaWords`): no player, no Play slot, nothing loaded or read from the vault.
 * A question asked for each pick is drawn once, as one copy of it (see `drawInertQuestion`).
 *
 * A query's rows (`drawInertQuery`) are drawn by the reader's own `drawQueryPlan`, with a host that has no row actions (so rows are plain
 * values), no sort or filter control (that is `mountQuery`, which is not used), and a link that opens nothing. The same wrapper holds it.
 *
 * Never a reader's kept answers: the stand-in's `answerOf` gives the answer the caller hands it, and the Design view hands none, so a
 * drawing shows the empty state. A query is planned over the note with its records taken out, so an activity's rows are the empty line. Words go through plain `MarkdownRenderer.render`, with the Component of the drawing, unloaded when the
 * drawing is: no footnote marks, no reference links, and no media of any kind (Markdown that would fetch from another site is shown as its
 * words, `hasRemoteMedia`). A matrix's resize observer is disconnected with the drawing.
 */
import { MarkdownRenderer, type App, type Component } from "obsidian";
import { askedOfRows, hasRemoteMedia, mediaWords, parseBooklet, planQuery, type Activity, type Booklet, type Question, type QuerySegment, type RecordsRead } from "./core";
import { drawQueryPlan, type QueryHost } from "./query-view";
import { Listens, type ListenIO } from "./listen-view";
import { drawQuestion, type QuestionHost, type Target } from "./questions";

/** A call the drawing made that, in a real view, would have changed an answer or held typed words. */
export interface AttemptedWrite {
	method: "answer" | "typed" | "flushTyped" | "keepOwn" | "hold";
	id: string;
	value?: unknown;
}

/** One drawing's places to be torn down: where it is, what it would have written, and its stand-in host. */
export interface InertDrawing {
	/** The wrapper the question was drawn into. */
	card: HTMLElement;
	/** Every write the drawing or a press attempted; the stand-in store discards them. */
	writes: AttemptedWrite[];
	/** The stand-in host the drawing used. */
	host: QuestionHost;
}

export interface InertOptions {
	/** Obsidian's App, and the Component that owns what is rendered: unloaded when the drawing is taken away (and the matrix's observer with it). */
	app: App;
	owner: Component;
	/** The note's path, for the renderer's links and local files; "" for a sample. */
	sourcePath: string;
	into: HTMLElement;
	/** An answer to show, as the question stores it; none by default, and the Design view hands none. */
	shown?: unknown;
	/** Obsidian gives a callout's colour as an `r, g, b` triplet in some versions (reading.ts `calloutColourIsTriplet`): the styles need to be told. */
	triplet?: boolean;
}

let uids = 0;

/** Renders Markdown into `el` with Obsidian's own renderer; a failure or Markdown that would fetch media leaves its words. */
export function renderWords(app: App, owner: Component, markdown: string, el: HTMLElement, sourcePath: string): void {
	if (hasRemoteMedia(markdown)) return el.setText(markdown);
	void MarkdownRenderer.render(app, markdown, el, sourcePath, owner).catch(() => el.setText(markdown));
}

/** Every event a script could aim at a control: dropped on the way down, so no handler of the drawing runs. */
const SWALLOWED = ["pointerenter", "pointerover", "mouseover", "mouseenter", "click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "input", "change", "keydown", "keyup", "keypress", "focusin", "focusout", "blur", "focus", "submit", "paste", "cut", "drop", "beforeinput"] as const;

const CONTROLS = "button, input, textarea, select, summary, a";

/** What a drawn view answers to besides a control: a line chart's picture takes the pointer and the keys (a readout) and is a stop of the keyboard. */
const VIEW_CONTROLS = `${CONTROLS}, svg, [tabindex]`;

function inertWrapper(into: HTMLElement, triplet: boolean | undefined, controls: string, ...cls: string[]): HTMLElement {
	const card = into.createDiv({ cls: ["booklet-sample", ...(triplet ? ["booklet-callout-triplet"] : []), ...cls], attr: { inert: "" } });
	for (const type of SWALLOWED)
		card.addEventListener(
			type,
			(evt) => {
				const target = evt.target as Element | null;
				if (target && typeof target.closest === "function" && target.closest(controls)) {
					evt.stopPropagation();
					evt.preventDefault();
				}
			},
			true,
		);
	return card;
}

/** The stand-in host: it answers from `shown`, keeps nothing, and lists what it was asked to write. */
function standIn(o: InertOptions, writes: AttemptedWrite[]): QuestionHost {
	const render = (md: string, el: HTMLElement): void => renderWords(o.app, o.owner, md, el, o.sourcePath);
	// the reader's follower of a `listen`, over an io that holds no answer, has no note, writes nothing and never asks for a drawing; no media
	// event reaches it (the canvas draws no player), so it makes no timer and no observer, and what it noted is let go of with the drawing
	const io: ListenIO = {
		app: () => o.app,
		path: () => null,
		held: () => undefined,
		wrong: () => false,
		write: (_t, q, value) => void writes.push({ method: "answer", id: q.id, value }),
		idle: () => {},
	};
	const listens = new Listens(io);
	o.owner.register(() => listens.reset());
	return {
		md: render,
		mdBlock: render,
		// a listen's media is its name, and its address when it has one, as plain words: never a player, never loaded, never read from the vault
		media: (markdown, el) => el.setText(mediaWords(markdown)),
		answerOf: () => o.shown,
		answer: (_t, q, value) => void writes.push({ method: "answer", id: q.id, value }),
		typed: (_t, q, value) => void writes.push({ method: "typed", id: q.id, value }),
		flushTyped: (_t, q) => void writes.push({ method: "flushTyped", id: q.id }),
		pendingOf: () => null,
		onShow: () => {},
		keepOwn: (key) => void writes.push({ method: "keepOwn", id: key }),
		pressTarget: () => null,
		heldOf: () => "",
		hold: (key, words) => void writes.push({ method: "hold", id: key, value: words }),
		earlierOf: () => ({ record: {}, entries: [] }),
		reshow: () => {},
		uid: () => `booklet-sample-${++uids}`,
		wrongOf: () => null,
		redrawSoon: () => {},
		listens,
		own: (dispose) => o.owner.register(dispose),
	};
}

/**
 * Draws one question, as a reader sees it with nothing answered, with nothing live. Gives null (and draws nothing) when the question is
 * asked for each row of a data block (`askedOfRows`: the reader draws it in the rows of a view of the block, with acts a stand-in does not
 * have, and nothing where it is written), or when the drawing code draws nothing for it. A `widget` is drawn by the reader's engines
 * (engines.ts), a `listen` by the reader's `drawListen` with its media as words, each locked, with the stand-in host.
 *
 * A question asked for each pick of another is drawn ONCE, as the reader draws a copy of it without the pick's heading: the reader draws
 * nothing at all until something is picked (its box is hidden, each-question.ts), and the canvas has no pick, so a hidden block would be
 * an empty place on the page. What is drawn is the question's own words and controls, off, with nothing in them.
 */
export function drawInertQuestion(o: InertOptions, activity: Activity, question: Question): InertDrawing | null {
	if (askedOfRows(activity, question)) return null;
	const writes: AttemptedWrite[] = [];
	const host = standIn(o, writes);
	const card = inertWrapper(o.into, o.triplet, CONTROLS, "booklet-sample-question");
	const target: Target = { scope: activity.scope, activity };
	drawQuestion(host, card, target, question.each === null ? question : { ...question, each: null }, true);
	if (!card.childElementCount) {
		card.remove();
		return null;
	}
	// a question's folded hint and solution come after it, drawn as the callouts they are
	for (const [kind, words] of [["hint", question.hint], ["solution", question.solution]] as const)
		if (words !== null) renderWords(o.app, o.owner, `> [!${kind}]- ${kind === "hint" ? "Hint" : "Solution"}\n${words ? words.split("\n").map((l) => `> ${l}`).join("\n") : ">"}`, card.createDiv({ cls: "booklet-sample-part markdown-rendered" }), o.sourcePath);
	return { card, writes, host };
}

/** A reading callout, citation or words, rendered as Obsidian renders them, inside an inert wrapper. */
export function drawInertReading(o: InertOptions, markdown: string): HTMLElement {
	const card = inertWrapper(o.into, o.triplet, CONTROLS, "booklet-sample-reading", "markdown-rendered");
	renderWords(o.app, o.owner, markdown, card, o.sourcePath);
	return card;
}

/** A query the canvas can draw: the note read whole (the source of `from:` is found in it), the query's segment and the activity that holds it. */
export interface FoundQuery {
	book: Booklet;
	segment: QuerySegment;
	activity: Activity;
}

/** What drawing a query did: its wrapper, and every note a press asked to open (the drawing opens none). */
export interface InertQueryDrawing {
	card: HTMLElement;
	/** The paths a row's link would have opened in a reader's view; the stand-in opens nothing and lists them here. */
	opened: string[];
}

/** The records of a note that holds none: the drawing of a query is over the design, never over a reader's kept answers. */
const NO_RECORDS = (): RecordsRead => ({ regions: [], recordsLines: [], blocks: [], answers: {}, drafts: {}, entries: {}, problems: [] });

/**
 * A query's rows, as the reader draws them with nothing kept and no control: the reader's `planQuery` over the note with its records taken
 * out, drawn by the reader's `drawQueryPlan` (so a table is a table, an activity with no entries says what the reader's empty line says,
 * and a data block that names a file gives the reader's quiet line, as no file is read here). No sort or filter control is drawn (that is
 * `mountQuery`'s) and no row has an act (the host has no `rows`). A line chart's observer is let go of with the drawing's owner.
 */
export function drawInertQuery(o: InertOptions, found: FoundQuery, drawn: Date = new Date()): InertQueryDrawing {
	const opened: string[] = [];
	const host: QueryHost = {
		md: (markdown, el) => renderWords(o.app, o.owner, markdown, el, o.sourcePath),
		openNote: (path) => void opened.push(path),
		own: (dispose) => o.owner.register(dispose),
	};
	const card = inertWrapper(o.into, o.triplet, VIEW_CONTROLS, "booklet-sample-query");
	const box = card.createDiv({ cls: "booklet-query" });
	box.setAttr("data-booklet-query", found.segment.query.from);
	drawQueryPlan(host, box, planQuery(found.book, found.segment, { drawn, activity: found.activity }));
	return { card, opened };
}

const WRAP = (block: string): string => `---\nbooklet: "0.20"\n---\n\n> [!activity|sample] Sample\n\n${block}\n`;

/** The first question a piece's own text holds, read as it would be in an activity, with the activity it is in (a shared menu the piece carries is found). */
export function questionOfPiece(text: string): { activity: Activity; question: Question } | null {
	const book = parseBooklet(WRAP(text));
	const activity = book.activities[0];
	const question = activity?.segments.find((s): s is Question => s.type === "question");
	return activity && question ? { activity, question } : null;
}

/** What the canvas finds in a note by the line each piece is on (0-based, as the tree counts; the reader's own `line` counts from 1). */
export interface NoteDrawn {
	questions: Map<number, { activity: Activity; question: Question }>;
	queries: Map<number, FoundQuery>;
}

/**
 * The questions and the queries of a booklet by the line each is on, with their activities: how the tree finds what to draw. The note is
 * read once; a query is found with the whole note (its `from:` is resolved there) but with its records taken out, so a drawing is of the
 * design and never of a reader's kept answers.
 */
export function drawnByLine(text: string): NoteDrawn {
	const out: NoteDrawn = { questions: new Map(), queries: new Map() };
	const read = parseBooklet(text);
	if (!read.ok) return out;
	const book: Booklet = { ...read, records: NO_RECORDS() };
	for (const activity of read.activities)
		for (const s of activity.segments) {
			if (s.type === "question") out.questions.set(s.line - 1, { activity, question: s });
			else if (s.type === "query" && s.source) out.queries.set(s.line - 1, { book, segment: s, activity });
		}
	return out;
}
