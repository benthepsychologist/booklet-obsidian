/*
 * The seven common question kinds, drawn with Obsidian's own elements (buttons, text fields) and theme.
 * Each question registers a function that shows its answer again, so a write, or a change made to the
 * note elsewhere, updates the question without drawing the view again. That function leaves a field
 * alone while the reader is in it (it has focus, or holds typing not yet written), and is called again
 * when the reader leaves the field, so that the field then shows what the note holds.
 *
 * What a question stores is the reference renderer's shape (SPEC section 5's table; booklet.html
 * drawChoice, drawScale, drawText, drawLines, drawNumber): a choice's option position from 1 or the
 * reader's own words, a multi's list of those in the order picked, a scale's anchor number, a text's
 * string, a lines question's list of strings, a number, a date's `YYYY-MM-DD`. A choice or a multi whose
 * options come from a shared menu is drawn the same way, its answer a position in the menu. A widget is
 * drawn by engines.ts.
 */
import { setIcon } from "obsidian";
import { earlierLines, earlierOptions, holdsSomething, plainWords, sameWords, type Activity, type AnswerValue, type Entry, type Question } from "./core";
import { drawEach } from "./each-question";
import { drawWidget } from "./engines";

/** Where a question's answer is kept: its module (scope), and its activity (a repeating one keeps a draft). */
export interface Target {
	scope: string;
	activity: Activity;
}

/** What a question needs from the view that draws it. */
export interface QuestionHost {
	/** Draws inline Markdown from the file (a prompt, an option, an anchor) with Obsidian's own renderer. */
	md(markdown: string, el: HTMLElement): void;
	/** The answer the question shows now. */
	answerOf(t: Target, q: Question): unknown;
	/** A press: the answer is shown and written at once. `undefined` clears it. */
	answer(t: Target, q: Question, value: AnswerValue | undefined): void;
	/** Typing: the value is kept, and written after a pause or when the field loses focus. */
	typed(t: Target, q: Question, value: AnswerValue | undefined): void;
	flushTyped(t: Target, q: Question): void;
	/** What was typed and is not written yet, if anything. */
	pendingOf(t: Target, q: Question): { value: AnswerValue | undefined } | null;
	/** Registers the function that shows the question's answer again. */
	onShow(key: string, show: () => void): void;
	/**
	 * A widget's field for words of the reader's own: `commit` adds what is typed in it, as leaving the field does. The
	 * view calls it for words typed and not added yet before it lets go of the note, and before a Finalize.
	 */
	keepOwn(key: string, t: Target, commit: () => void): void;
	/** Words typed in a field that are not an answer yet (Add your own), kept across drawings of the view. */
	heldOf(key: string): string;
	hold(key: string, words: string): void;
	/**
	 * Where a question's earlier words come from (core/earlier.ts): the record being written, as shown (a daily draft
	 * with nothing in it shows today's entry), and the activity's kept entries, newest first, without today's in a
	 * `repeat daily` activity, which the draft will replace. An activity that does not repeat has no entries.
	 */
	earlierOf(t: Target): { record: Record<string, unknown>; entries: Entry[] };
	/** Shows every question's answer again (waits while a press is under way). */
	reshow(): void;
	/** A new id for an element of this drawing. */
	uid(): string;
	/**
	 * An answer of the wrong shape for its question (core/shape.ts): what the question keeps, and the answer as written
	 * (as JSON), or null. `answerOf` shows such an answer as no answer, and nothing writes over it.
	 */
	wrongOf(t: Target, q: Question): { issue: string; kept: string } | null;
	/** Draws the view again once the reader is not in a field or a press (when a question's answer changes shape). */
	redrawSoon(): void;
}

export const keyOf = (t: Target, q: Question): string => `${t.scope}/${t.activity.id}/${q.id}`;

/** An answer as a list of picks: positions and the reader's own words. */
export const picksOf = (v: unknown): Array<number | string> =>
	(Array.isArray(v) ? v : v === null || v === undefined || v === "" ? [] : [v]).filter((x): x is number | string => typeof x === "number" || typeof x === "string");

/** What a reader's own option is compared with, and how (SPEC section 5): kept in the core (core/earlier.ts). */
export { plainWords, sameWords };

const focused = (el: HTMLElement) => el.ownerDocument.activeElement === el;

/**
 * Draws one question into `card`. `locked`: shown, and not answerable. A question whose answer is of the wrong shape
 * (core/shape.ts) is drawn read-only, its answer shown as no answer, with a notice that says what the note holds.
 */
export function drawQuestion(host: QuestionHost, card: HTMLElement, t: Target, q: Question, locked: boolean): void {
	const wrong = host.wrongOf(t, q);
	const box = q.kind === "widget" ? drawWidget(host, card, t, q, locked || !!wrong) : drawCommon(host, card, t, q, locked || !!wrong);
	box.setAttr("data-booklet-q", q.id);
	guardShape(host, box, t, q, !!wrong);
}

/**
 * The notice for an answer of the wrong shape, under the question's words, kept up to date as the note changes. An
 * answer that comes to be of the wrong shape while the question is drawn has every control of the question switched
 * off at once; one that stops being so has the view drawn again (the reader's field and press are kept, see the view).
 */
function guardShape(host: QuestionHost, box: HTMLElement, t: Target, q: Question, drawnWrong: boolean): void {
	const note = box.createDiv({ cls: "booklet-kept-note" });
	const words = Array.from(box.children).filter((c) => c.matches(".booklet-prompt, .booklet-help")).pop();
	if (words) words.after(note);
	else box.prepend(note);
	let sig: string | null = null;
	const show = () => {
		const w = host.wrongOf(t, q);
		note.toggleClass("booklet-none", !w);
		// the field the reader is in keeps working until they leave it (what they typed is then not written over the answer)
		if (w) for (const el of Array.from(box.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>("button, input, textarea"))) if (el !== el.ownerDocument.activeElement) el.disabled = true;
		const now = w ? w.kept : "";
		if (now !== sig) {
			sig = now;
			note.empty();
			if (w) {
				note.createSpan({ text: `Kept as written: this answer is not in the shape this question keeps (${w.issue}), so it cannot be changed here. It can be changed in Markdown. The note holds ` });
				note.createEl("code", { text: w.kept });
			}
		}
		if (!!w !== drawnWrong) host.redrawSoon();
	};
	show();
	host.onShow(`${keyOf(t, q)}#shape`, show);
}

/** One of the seven common kinds. */
function drawCommon(host: QuestionHost, card: HTMLElement, t: Target, q: Question, locked: boolean): HTMLElement {
	const box = card.createDiv({ cls: `booklet-question booklet-kind-${q.kind}` });
	const promptId = host.uid();
	host.md(q.title || q.id, box.createDiv({ cls: "booklet-prompt markdown-rendered", attr: { id: promptId } }));
	let helpId: string | null = null;
	if (q.help) {
		helpId = host.uid();
		host.md(q.help, box.createDiv({ cls: "booklet-help markdown-rendered", attr: { id: helpId } }));
	}
	// named by its prompt for a screen reader (not aria-label, which Obsidian also shows as a tooltip on hover)
	const label = (el: HTMLElement) => {
		el.setAttr("aria-labelledby", promptId);
		if (helpId) el.setAttr("aria-describedby", helpId);
	};
	const key = keyOf(t, q);
	if (q.kind === "text") drawText(host, box, t, q, key, label, locked);
	else if (q.kind === "number") drawNumber(host, box, t, q, key, label, locked);
	else if (q.kind === "date") drawDate(host, box, t, q, key, label, locked);
	else if (q.kind === "lines") drawLines(host, box, t, q, key, label, locked);
	else if (q.kind === "scale") drawScale(host, box, t, q, key, label, locked);
	else if (q.each) drawEach(host, box, t, q, key, label, locked);
	else drawChoice(host, box, t, q, key, label, locked);
	return box;
}

export type Label = (el: HTMLElement) => void;

function drawText(host: QuestionHost, box: HTMLElement, t: Target, q: Question, key: string, label: Label, locked: boolean): void {
	const field = q.long ? box.createEl("textarea", { cls: "booklet-text booklet-long", attr: { rows: 4 } }) : box.createEl("input", { cls: "booklet-text", type: "text" });
	field.setAttr("data-booklet-key", key);
	label(field);
	field.disabled = locked;
	const show = () => {
		if (host.pendingOf(t, q) || focused(field)) return;
		const v = host.answerOf(t, q);
		field.value = typeof v === "string" ? v : "";
	};
	const typed = host.pendingOf(t, q);
	if (typed) field.value = typeof typed.value === "string" ? typed.value : "";
	else show();
	host.onShow(key, show);
	field.addEventListener("input", () => host.typed(t, q, field.value));
	field.addEventListener("blur", () => {
		host.flushTyped(t, q);
		show();
	});
}

function drawNumber(host: QuestionHost, box: HTMLElement, t: Target, q: Question, key: string, label: Label, locked: boolean): void {
	const field = box.createEl("input", { cls: "booklet-text booklet-number-field", type: "number", attr: { inputmode: "decimal" } });
	if (q.min !== null) field.setAttr("min", String(q.min));
	if (q.max !== null) field.setAttr("max", String(q.max));
	if (q.step !== null) field.setAttr("step", String(q.step));
	field.setAttr("data-booklet-key", key);
	label(field);
	field.disabled = locked;
	const range = q.min !== null && q.max !== null ? `From ${q.min} to ${q.max}` : q.min !== null ? `${q.min} or more` : q.max !== null ? `Up to ${q.max}` : "";
	if (range) box.createDiv({ cls: "booklet-muted", text: range });
	const shown = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "");
	const show = () => {
		if (host.pendingOf(t, q) || focused(field)) return;
		field.value = shown(host.answerOf(t, q));
	};
	const typed = host.pendingOf(t, q);
	if (typed) field.value = shown(typed.value);
	else show();
	host.onShow(key, show);
	field.addEventListener("input", () => {
		const raw = field.value.trim();
		const n = Number(raw);
		host.typed(t, q, raw === "" || !Number.isFinite(n) ? undefined : n);
	});
	field.addEventListener("blur", () => {
		host.flushTyped(t, q);
		show();
	});
}

function drawDate(host: QuestionHost, box: HTMLElement, t: Target, q: Question, key: string, label: Label, locked: boolean): void {
	const row = box.createDiv({ cls: "booklet-field-row" });
	const field = row.createEl("input", { cls: "booklet-text booklet-date-field", type: "date" });
	field.setAttr("data-booklet-key", key);
	label(field);
	field.disabled = locked;
	const clear = row.createEl("button", { cls: "booklet-clear", text: "Clear" });
	const asDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
	const other = box.createDiv({ cls: "booklet-muted" });
	const show = () => {
		const p = host.pendingOf(t, q);
		const v = p ? p.value : host.answerOf(t, q);
		clear.disabled = locked || !holdsSomething(v);
		// a date written another way by hand is kept as written, and said, since a date field cannot show it
		other.setText(typeof v === "string" && v.trim() && !asDate(v) ? `Kept as written: ${v}` : "");
		if (host.pendingOf(t, q) || focused(field)) return;
		field.value = asDate(v);
	};
	const typed = host.pendingOf(t, q);
	if (typed) field.value = asDate(typed.value);
	show();
	host.onShow(key, show);
	field.addEventListener("input", () => host.typed(t, q, field.value || undefined));
	field.addEventListener("blur", () => {
		host.flushTyped(t, q);
		show();
	});
	clear.addEventListener("click", (evt) => {
		evt.preventDefault();
		field.value = "";
		host.answer(t, q, undefined);
	});
}

function drawLines(host: QuestionHost, box: HTMLElement, t: Target, q: Question, key: string, label: Label, locked: boolean): void {
	const list = box.createDiv({ cls: "booklet-lines" });
	list.setAttr("role", "group");
	label(list);
	let inputs: HTMLInputElement[] = [];
	// every field's text, blank ones and the empty one at the end included, as the reference renderer stores a
	// lines answer (booklet.html drawLines); a kept entry leaves the blank lines out (finalizeDraft)
	const commit = () => {
		const lines = inputs.map((i) => i.value);
		host.typed(t, q, lines.some((v) => holdsSomething(v)) ? lines : undefined);
	};
	const add = (value: string) => {
		const inp = list.createEl("input", { cls: "booklet-text booklet-line", type: "text" });
		inp.value = value;
		inp.setAttr("data-booklet-key", `${key}#${inputs.length}`);
		label(inp);
		inp.disabled = locked;
		inp.addEventListener("input", () => {
			// one empty line is always there to type the next one in
			if (inp === inputs[inputs.length - 1] && holdsSomething(inp.value)) add("");
			commit();
		});
		inp.addEventListener("keydown", (evt) => {
			if (evt.key !== "Enter") return;
			evt.preventDefault();
			inputs[inputs.indexOf(inp) + 1]?.focus();
		});
		inputs.push(inp);
	};
	// what was typed is written when focus leaves the list, not when it moves from one line to the next; the lines
	// then show what the note holds
	list.addEventListener("focusout", (evt) => {
		const to = evt.relatedTarget;
		if (to instanceof Node && list.contains(to)) return;
		host.flushTyped(t, q);
		show();
	});
	const fill = (values: string[]) => {
		list.empty();
		inputs = [];
		for (const v of values) add(v);
		add("");
	};
	const linesOf = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && holdsSomething(x)) : []);
	// earlier lines, only where the line sets `earlier:<n>` (core/earlier.ts): a press fills the empty line at the end
	// with its words and opens a new empty line under it, as typing in it does; no line typed in is changed
	const take = (words: string) => {
		const last = inputs[inputs.length - 1];
		if (last && last.value === "") last.value = words;
		else add(words);
		add("");
		commit();
		host.flushTyped(t, q);
	};
	const earlier = q.earlier ? earlierGroup(host, box, locked, take) : null;
	const showEarlier = () => {
		if (earlier) earlier(earlierLines(q, host.earlierOf(t).entries, inputs.map((i) => i.value)));
	};
	const show = () => {
		const busy = host.pendingOf(t, q) || list.contains(list.ownerDocument.activeElement);
		const next = linesOf(host.answerOf(t, q));
		// the fields are made again only when the answer differs from what they hold, so a field that focus is
		// moving into is never taken away from under the pointer
		if (!busy && JSON.stringify(next) !== JSON.stringify(inputs.map((i) => i.value).filter((v) => holdsSomething(v)))) fill(next);
		showEarlier();
	};
	const typed = host.pendingOf(t, q);
	fill(linesOf(typed ? typed.value : host.answerOf(t, q)));
	showEarlier();
	host.onShow(key, show);
}

function drawScale(host: QuestionHost, box: HTMLElement, t: Target, q: Question, key: string, label: Label, locked: boolean): void {
	const row = box.createDiv({ cls: "booklet-choices booklet-scale" });
	row.setAttr("role", "group");
	label(row);
	const buttons = q.anchors.map((anchor) => {
		const button = row.createEl("button", { cls: "booklet-choice" });
		button.createSpan({ cls: "booklet-number", text: String(anchor.n) });
		host.md(anchor.text, button.createDiv({ cls: "booklet-words markdown-rendered" }));
		button.disabled = locked;
		button.addEventListener("click", (evt) => {
			evt.preventDefault();
			// pressing the picked one again clears it
			host.answer(t, q, host.answerOf(t, q) === anchor.n ? undefined : anchor.n);
		});
		return button;
	});
	const show = () => {
		const v = host.answerOf(t, q);
		buttons.forEach((b, n) => pressed(b, v === q.anchors[n]!.n));
	};
	show();
	host.onShow(key, show);
}

/**
 * A group of the reader's earlier words as unpressed buttons, under the words "Earlier words" (core/earlier.ts): a body
 * widget's place and a lines question draw one. A press on a word calls `take` with its words, which goes down the
 * path typing those words goes down. Returns the function that shows a list of words: the buttons are made again
 * only when the list changes, and a group with none is not shown. A long word is shortened to two lines on screen
 * (styles.css), and its full words are its button's name. When the button in focus goes (its word taken), focus
 * goes to the button now in its place, so a keyboard is not sent back to the top of the note.
 */
export function earlierGroup(host: QuestionHost, into: HTMLElement, locked: boolean, take: (words: string) => void): (words: readonly string[]) => void {
	const box = into.createDiv({ cls: "booklet-earlier booklet-earlier-none" });
	const headId = host.uid();
	box.createDiv({ cls: "booklet-earlier-label", text: "Earlier words", attr: { id: headId } });
	const row = box.createDiv({ cls: "booklet-choices" });
	row.setAttr("role", "group");
	row.setAttr("aria-labelledby", headId);
	let sig: string | null = null;
	return (words) => {
		const now = JSON.stringify(words);
		if (now === sig) return;
		sig = now;
		const buttons = () => Array.from(row.querySelectorAll("button"));
		const active = row.ownerDocument.activeElement;
		const at = active && row.contains(active) ? buttons().indexOf(active as HTMLButtonElement) : -1;
		row.empty();
		box.toggleClass("booklet-earlier-none", !words.length);
		for (const w of words) {
			const b = row.createEl("button", { cls: "booklet-choice booklet-earlier-word" });
			b.createSpan({ cls: "booklet-words", text: w });
			b.setAttr("aria-label", w);
			pressed(b, false);
			b.disabled = locked;
			b.addEventListener("click", (evt) => {
				evt.preventDefault();
				take(w);
			});
		}
		const next = buttons();
		if (at >= 0 && next.length) next[Math.min(at, next.length - 1)]!.focus();
	};
}

export function pressed(b: HTMLElement, on: boolean): void {
	b.toggleClass("mod-cta", on);
	b.toggleClass("is-selected", on);
	b.setAttr("aria-pressed", on ? "true" : "false");
}

function drawChoice(host: QuestionHost, box: HTMLElement, t: Target, q: Question, key: string, label: Label, locked: boolean): void {
	const multi = q.kind === "multi";
	const picks = () => picksOf(host.answerOf(t, q));
	const show = choiceBody(host, box, q, label, locked, {
		picks,
		put: (list) => host.answer(t, q, multi ? (list.length ? list : undefined) : list.length ? list[list.length - 1] : undefined),
		offered: (now) => {
			const { record, entries } = host.earlierOf(t);
			return earlierOptions(t.activity, q, record, entries, now);
		},
		ownKey: `${key}#own`,
	});
	if (q.options.some((o) => o.correct)) box.createDiv({ cls: "booklet-muted", text: "Marking an answer right or wrong is not yet supported." });
	show();
	host.onShow(key, show);
}

/** Where a choice's or a multi's options read and write their answer: the question's own, or one pick's (each:). */
export interface ChoiceIO {
	/** The positions and own options picked now. */
	picks(): Array<number | string>;
	/** The picks set to `list` (empty: none). */
	put(list: Array<number | string>): void;
	/** Own options to offer again, unpressed, given the picks shown now (core/earlier.ts earlierOptions). */
	offered(now: Array<number | string>): string[];
	/** The key under which the view holds what is typed in the Add your own field and not added yet. */
	ownKey: string;
}

/**
 * A choice's or a multi's options as buttons, the reader's own options (pressed, and offered again), the picked
 * options' replies, and with `open` a field to add one's own (Enter or Add, as booklet.html's drawChoice). Returns the
 * function that shows the picks again.
 */
export function choiceBody(host: QuestionHost, box: HTMLElement, q: Question, label: Label, locked: boolean, io: ChoiceIO): () => void {
	const multi = q.kind === "multi";
	const graded = q.options.some((o) => o.correct);
	const row = box.createDiv({ cls: "booklet-choices" });
	row.setAttr("role", "group");
	label(row);
	const toggle = (n: number | string) => {
		const c = io.picks();
		const on = c.includes(n);
		io.put(on ? c.filter((x) => x !== n) : multi ? [...c, n] : [n]);
	};
	const addOwn = (words: string) => {
		const s = words.trim();
		if (!s) return;
		const c = io.picks();
		// words equal to a listed option press that option instead (SPEC section 5)
		const at = q.options.findIndex((o) => sameWords(plainWords(o.text), s));
		if (at >= 0) {
			if (!c.includes(at + 1)) toggle(at + 1);
			return;
		}
		if (c.some((x) => typeof x === "string" && sameWords(x, s))) return;
		io.put(multi ? [...c, s] : [s]);
	};

	const listed = q.options.map((o, idx) => {
		const button = row.createEl("button", { cls: "booklet-choice" });
		host.md(o.text, button.createDiv({ cls: "booklet-words markdown-rendered" }));
		button.disabled = locked;
		button.addEventListener("click", (evt) => {
			evt.preventDefault();
			toggle(idx + 1);
		});
		return button;
	});
	// the reader's own options (`open`): those in the answer, pressed; those offered again, after them
	const ownBox = row.createDiv({ cls: "booklet-own-picks" });
	const replies = box.createDiv({ cls: "booklet-replies" });
	replies.setAttr("aria-live", "polite");

	let ownSig = "";
	let replySig = "";
	const show = () => {
		const c = io.picks();
		listed.forEach((b, n) => pressed(b, c.includes(n + 1)));
		const own = c.filter((x): x is string => typeof x === "string");
		const earlier = io.offered(c);
		const sig = JSON.stringify([own, earlier]);
		if (sig !== ownSig) {
			ownSig = sig;
			ownBox.empty();
			for (const s of own) {
				const b = ownBox.createEl("button", { cls: "booklet-choice booklet-own" });
				b.createSpan({ cls: "booklet-words", text: s });
				setIcon(b.createSpan({ cls: "booklet-own-x" }), "x");
				b.setAttr("aria-label", `Remove your option "${s}"`);
				pressed(b, true);
				b.disabled = locked;
				b.addEventListener("click", (evt) => {
					evt.preventDefault();
					io.put(io.picks().filter((x) => x !== s));
				});
			}
			for (const s of earlier) {
				// an earlier own option, drawn as today after the listed ones; a long one is shortened to two lines on
				// screen, and its full words are its name
				const b = ownBox.createEl("button", { cls: "booklet-choice booklet-own booklet-earlier-word" });
				b.createSpan({ cls: "booklet-words", text: s });
				b.setAttr("aria-label", s);
				pressed(b, false);
				b.disabled = locked;
				b.addEventListener("click", (evt) => {
					evt.preventDefault();
					addOwn(s);
				});
			}
		}
		// an option's reply shows under the options when it is picked; a multi that marks right answers keeps them for its Check
		const shownReplies = graded && multi ? [] : (c.filter((x): x is number => typeof x === "number").sort((a, b) => a - b) as number[]).slice(0, multi ? undefined : 1);
		const rs = JSON.stringify(shownReplies);
		if (rs !== replySig) {
			replySig = rs;
			replies.empty();
			for (const n of shownReplies) {
				const lines = q.options[n - 1]?.reply ?? [];
				if (!lines.length) continue;
				const r = replies.createDiv({ cls: "booklet-reply" });
				for (const l of lines) host.md(l, r.createDiv({ cls: "booklet-reply-line markdown-rendered" }));
			}
		}
	};

	if (q.open) {
		const ownRow = box.createDiv({ cls: "booklet-field-row booklet-own-row" });
		const field = ownRow.createEl("input", { cls: "booklet-text", type: "text", attr: { placeholder: "Add your own", autocomplete: "off" } });
		field.setAttr("data-booklet-key", io.ownKey);
		label(field);
		field.disabled = locked;
		// words typed and not added yet are not an answer; they are kept if the view is drawn again
		field.value = host.heldOf(io.ownKey);
		field.addEventListener("input", () => host.hold(io.ownKey, field.value));
		const add = ownRow.createEl("button", { cls: "booklet-add", text: "Add" });
		add.disabled = locked;
		const go = () => {
			const s = field.value;
			field.value = "";
			host.hold(io.ownKey, "");
			addOwn(s);
		};
		field.addEventListener("keydown", (evt) => {
			if (evt.key !== "Enter") return;
			evt.preventDefault();
			go();
		});
		add.addEventListener("click", (evt) => {
			evt.preventDefault();
			go();
			field.focus();
		});
	}
	return show;
}
