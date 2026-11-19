/*
 * Inert drawings for the Design view: a question drawn as a reader sees it, a reading callout drawn as Obsidian draws it, and neither able to
 * change anything. The same code draws the samples in the catalogue (from a piece's own template text, fixed local content) and the blocks
 * of the note in the tree (from what the note says). It draws no control of its own: `drawQuestion` (questions.ts) and the matrix (matrix.ts)
 * draw, and what is inert about them is three things at once.
 *
 *   1. `locked` = true to `drawQuestion`, which switches off every button and field the kind draws. That stops a person, not a script.
 *   2. The drawing's wrapper has the class `booklet-sample` (its stylesheet rule turns pointer events off) and the `inert` attribute, where
 *      the app's browser has it. A capture-phase listener on the wrapper also drops every event aimed at a control inside it, so even an
 *      event a script makes never reaches a handler.
 *   3. The host it draws with is a stand-in for the Booklet view: it keeps no answer, writes nothing, and lists every call that would have
 *      changed something in `writes`. This is the guard that holds when the other two do not (a test calls it directly).
 *
 * Never a reader's kept answers: the stand-in's `answerOf` gives the answer the caller hands it, and the Design view hands none, so a
 * drawing shows the empty state. Words go through plain `MarkdownRenderer.render`, with the Component of the drawing, unloaded when the
 * drawing is: no footnote marks, no reference links, and no media of any kind (Markdown that would fetch from another site is shown as its
 * words, `hasRemoteMedia`). A matrix's resize observer is disconnected with the drawing.
 */
import { MarkdownRenderer, type App, type Component } from "obsidian";
import { hasRemoteMedia, parseBooklet, type Activity, type Question } from "./core";
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
const SWALLOWED = ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "input", "change", "keydown", "keyup", "keypress", "focusin", "focusout", "blur", "focus", "submit", "paste", "cut", "drop", "beforeinput"] as const;

const CONTROLS = "button, input, textarea, select, summary, a";

function inertWrapper(into: HTMLElement, triplet: boolean | undefined, ...cls: string[]): HTMLElement {
	const card = into.createDiv({ cls: ["booklet-sample", ...(triplet ? ["booklet-callout-triplet"] : []), ...cls], attr: { inert: "" } });
	for (const type of SWALLOWED)
		card.addEventListener(
			type,
			(evt) => {
				const target = evt.target as Element | null;
				if (target && typeof target.closest === "function" && target.closest(CONTROLS)) {
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
	return {
		md: render,
		mdBlock: render,
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
		// only a `listen` question touches this, and a listen is never drawn here (a labelled card, in this beta)
		listens: null as never,
		own: (dispose) => o.owner.register(dispose),
	};
}

/** The question kinds this module will not draw even if asked: they need more of a host than a stand-in has. */
const refused = (q: Question): boolean => q.kind === "listen" || q.kind === "widget" || q.each !== null;

/**
 * Draws one question, as a reader sees it with nothing answered, with nothing live. Gives null (and draws nothing) when the question is
 * one of the three this beta leaves as a card (`listen`, `widget`, and a question asked for each pick), or when the drawing code draws
 * nothing for it.
 */
export function drawInertQuestion(o: InertOptions, activity: Activity, question: Question): InertDrawing | null {
	if (refused(question)) return null;
	const writes: AttemptedWrite[] = [];
	const host = standIn(o, writes);
	const card = inertWrapper(o.into, o.triplet, "booklet-sample-question");
	const target: Target = { scope: activity.scope, activity };
	drawQuestion(host, card, target, question, true);
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
	const card = inertWrapper(o.into, o.triplet, "booklet-sample-reading", "markdown-rendered");
	renderWords(o.app, o.owner, markdown, card, o.sourcePath);
	return card;
}

const WRAP = (block: string): string => `---\nbooklet: "0.20"\n---\n\n> [!activity|sample] Sample\n\n${block}\n`;

/** The first question a piece's own text holds, read as it would be in an activity, with the activity it is in (a shared menu the piece carries is found). */
export function questionOfPiece(text: string): { activity: Activity; question: Question } | null {
	const book = parseBooklet(WRAP(text));
	const activity = book.activities[0];
	const question = activity?.segments.find((s): s is Question => s.type === "question");
	return activity && question ? { activity, question } : null;
}

/** The questions of a booklet by the line each is on (0-based, as the tree counts; the reader's own `line` counts from 1), with their activities: how the tree finds what to draw. */
export function questionsByLine(text: string): Map<number, { activity: Activity; question: Question }> {
	const out = new Map<number, { activity: Activity; question: Question }>();
	const book = parseBooklet(text);
	if (!book.ok) return out;
	for (const activity of book.activities) for (const s of activity.segments) if (s.type === "question") out.set(s.line - 1, { activity, question: s });
	return out;
}
