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
 * string, a lines question's list of strings, a number, a date's `YYYY-MM-DD`.
 */
import { setIcon } from "obsidian";
import { holdsSomething, type Activity, type AnswerValue, type Question } from "./core";

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
	/** Words typed in a field that are not an answer yet (Add your own), kept across drawings of the view. */
	heldOf(key: string): string;
	hold(key: string, words: string): void;
	/** The reader's own options for this question in the activity's earlier kept entries, newest first. */
	earlierOwn(t: Target, q: Question): string[];
	/** A new id for an element of this drawing. */
	uid(): string;
}

export const keyOf = (t: Target, q: Question): string => `${t.scope}/${t.activity.id}/${q.id}`;

/** An answer as a list of picks: positions and the reader's own words. */
export const picksOf = (v: unknown): Array<number | string> =>
	(Array.isArray(v) ? v : v === null || v === undefined || v === "" ? [] : [v]).filter((x): x is number | string => typeof x === "number" || typeof x === "string");

/** Markdown's words without their marks: what a reader's own option is compared with (SPEC section 5). */
export const plainWords = (md: string): string =>
	md
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
		.replace(/[*_~=`]/g, "")
		.replace(/\\(.)/g, "$1");

const sameWords = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const focused = (el: HTMLElement) => el.ownerDocument.activeElement === el;

/** Draws one question into `card`. `locked`: shown, and not answerable. */
export function drawQuestion(host: QuestionHost, card: HTMLElement, t: Target, q: Question, locked: boolean): void {
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
	else drawChoice(host, box, t, q, key, label, locked);
}

type Label = (el: HTMLElement) => void;

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
	const show = () => {
		if (host.pendingOf(t, q) || list.contains(list.ownerDocument.activeElement)) return;
		const next = linesOf(host.answerOf(t, q));
		// the fields are made again only when the answer differs from what they hold, so a field that focus is
		// moving into is never taken away from under the pointer
		if (JSON.stringify(next) === JSON.stringify(inputs.map((i) => i.value).filter((v) => holdsSomething(v)))) return;
		fill(next);
	};
	const typed = host.pendingOf(t, q);
	fill(linesOf(typed ? typed.value : host.answerOf(t, q)));
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

function pressed(b: HTMLElement, on: boolean): void {
	b.toggleClass("mod-cta", on);
	b.toggleClass("is-selected", on);
	b.setAttr("aria-pressed", on ? "true" : "false");
}

function drawChoice(host: QuestionHost, box: HTMLElement, t: Target, q: Question, key: string, label: Label, locked: boolean): void {
	const multi = q.kind === "multi";
	const graded = q.options.some((o) => o.correct);
	const row = box.createDiv({ cls: "booklet-choices" });
	row.setAttr("role", "group");
	label(row);
	const picks = () => picksOf(host.answerOf(t, q));
	const put = (list: Array<number | string>) => host.answer(t, q, multi ? (list.length ? list : undefined) : list.length ? list[list.length - 1] : undefined);
	const toggle = (n: number | string) => {
		const c = picks();
		const on = c.includes(n);
		put(on ? c.filter((x) => x !== n) : multi ? [...c, n] : [n]);
	};
	const addOwn = (words: string) => {
		const s = words.trim();
		if (!s) return;
		const c = picks();
		// words equal to a listed option press that option instead (SPEC section 5)
		const at = q.options.findIndex((o) => sameWords(plainWords(o.text), s));
		if (at >= 0) {
			if (!c.includes(at + 1)) toggle(at + 1);
			return;
		}
		if (c.some((x) => typeof x === "string" && sameWords(x, s))) return;
		put(multi ? [...c, s] : [s]);
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
	// the reader's own options (`open`): those in the answer, pressed; those from earlier kept entries, offered again
	const ownBox = row.createDiv({ cls: "booklet-own-picks" });
	const replies = box.createDiv({ cls: "booklet-replies" });
	replies.setAttr("aria-live", "polite");
	if (graded) box.createDiv({ cls: "booklet-muted", text: "Marking an answer right or wrong is not yet supported." });

	let ownSig = "";
	let replySig = "";
	const show = () => {
		const c = picks();
		listed.forEach((b, n) => pressed(b, c.includes(n + 1)));
		const own = c.filter((x): x is string => typeof x === "string");
		const earlier = q.open ? host.earlierOwn(t, q).filter((s) => !own.some((x) => sameWords(x, s)) && !q.options.some((o) => sameWords(plainWords(o.text), s))) : [];
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
					put(picks().filter((x) => x !== s));
				});
			}
			for (const s of earlier) {
				const b = ownBox.createEl("button", { cls: "booklet-choice booklet-own" });
				b.createSpan({ cls: "booklet-words", text: s });
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
	show();
	host.onShow(key, show);

	if (q.open) {
		const ownRow = box.createDiv({ cls: "booklet-field-row booklet-own-row" });
		const field = ownRow.createEl("input", { cls: "booklet-text", type: "text", attr: { placeholder: "Add your own", autocomplete: "off" } });
		const ownKey = `${key}#own`;
		field.setAttr("data-booklet-key", ownKey);
		label(field);
		field.disabled = locked;
		// words typed and not added yet are not an answer; they are kept if the view is drawn again
		field.value = host.heldOf(ownKey);
		field.addEventListener("input", () => host.hold(ownKey, field.value));
		const add = ownRow.createEl("button", { cls: "booklet-add", text: "Add" });
		add.disabled = locked;
		const go = () => {
			const s = field.value;
			field.value = "";
			host.hold(ownKey, "");
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
}
