/*
 * Acts on the rows of a data view, drawn (format 0.19; SPEC section 5, "A question asked for each row" and "Editing a field in place"):
 * a question asked for each row is drawn in the row's open part, or in a column that a query's `fields:` names for it; a field marked
 * `edit` is drawn as its value and turns into a box when it is pressed. What is kept, the display states and the rules are the core's
 * (core/ask.ts, core/write.ts); this draws them with the plugin's own controls (questions.ts), and names every control for a screen reader
 * by the field's or question's words and the row's.
 *
 * An act is one pair `{ pick, a, was }` in a new kept entry of the activity that holds the query, so the activity must repeat: in any
 * other the field is drawn as its value, and a question is answered as any `each:` question is, as it is typed. Typing in a question
 * is a draft (the view's, as every draft is); typing in an edit box is the reader's until Enter or leaving the box keeps it as one act,
 * and is kept through a redraw of the rows (a data file read again) in `sessions`, so nothing typed is lost.
 */
import {
	answerWords,
	asValue,
	heldOf,
	keptAdds,
	newestSent,
	pairFor,
	pickKey,
	plainOf,
	roleText,
	sameOption,
	sameValue,
	showsOf,
	startOf,
	textOf,
	valueText,
	whenText,
	type Activity,
	type Entry,
	type PickValue,
	type Question,
	type QueryPlan,
	type Row,
	type Shows,
	type EditSpec,
} from "./core";
import { drawWidgetBody } from "./engines";
import { drawBody, keyOf, labeller, type QuestionHost, type Target } from "./questions";
import type { RowsUi } from "./query-view";

type Plan = Extract<QueryPlan, { kind: "rows" }>;

/** An edit box that is open: the words in it, the data's value when the box was opened (`was`), and whether the reader was in it. Kept by the view. */
export interface EditSession {
	text: string;
	was: unknown;
	focused: boolean;
	/** The query that drew the box, the row's id, and the cell now holding the box (the view keeps the words of a row that goes, view.ts). */
	vkey: string;
	pick: PickValue;
	cell?: HTMLElement;
	/** Keeps what is in the box as leaving it would: set while the box is drawn, and called before the screen is left. */
	commit?: () => void;
}

/** What the rows' acts need from the view: the question host, the kept entries, and the writes. */
export interface RowsView extends QuestionHost {
	/** The activity's kept entries as the view holds them. */
	keptOf(t: Target): Entry[];
	/** Says something to the reader, politely (a notice). */
	say(message: string): void;
	/** Keeps one act as a new entry of the activity, under `key`; `failed` runs when it could not be written (the reader's words are then given back). */
	keepAct(t: Target, key: string, pair: Record<string, unknown>, failed: () => void): void;
	/** A row's Finalize: keeps that row's draft pairs of the questions `ids` as one entry, and takes them out of the draft. */
	keepRow(t: Target, ids: readonly string[], pick: PickValue): void;
	/** Does the draft (or typing not written yet) hold an answer for this row to one of these questions? */
	draftHas(t: Target, ids: readonly string[], pick: PickValue): boolean;
	/** The edit boxes that are open, by cell. */
	sessions: Map<string, EditSession>;
}

/** A row's name in words, for a screen reader: its label, else its first field, else its id. */
export function rowName(p: Plan, r: Row): string {
	const label = roleText(r, p.roles.label).trim();
	if (label) return label;
	for (const k of p.set.own) {
		const t = (r.cells[k]?.text ?? "").trim();
		if (t) return t;
	}
	return r.id === undefined ? "" : String(r.id);
}

/** A field's or a question's answer put in plain words. */
function wordsOf(q: Question, v: unknown): string {
	const w = answerWords(plainOf(q), v);
	if (!w || "kept" in w) return "";
	return "list" in w ? w.list.join("; ") : textOf(w.parts);
}

/** What the rows of one query can do, for the activity that holds it: its questions drawn in rows, its edit boxes, and the row's Finalize. */
export function makeRowsUi(view: RowsView, a: Activity, vkey: string): RowsUi {
	const t: Target = { scope: a.scope, activity: a };
	/**
	 * Can an act be kept: the activity keeps entries and has an id to keep them under. A daily activity keeps one entry a day, made by its
	 * own Finalize, so an act (an entry of its own) has no place in it: there a field is its value, and a question is a draft as any is.
	 */
	const keeps = a.repeat && !!a.id && !a.daily;

	const ask: RowsUi["ask"] = (into, p, r, q, where) => {
		const plan = p.ask!;
		const id = r.id!;
		const raw = r.raw!;
		const held = heldOf(raw, q.id);
		const inPlace = held.shape === "value";
		const locked = plan.readonly(q.id) || (a.repeat && !a.id) || !!view.wrongOf(t, q);
		const key = `${keyOf(t, q)}#row:${vkey}:${pickKey(id)}`;
		const box = into.createDiv({ cls: `booklet-row-ask booklet-kind-${q.kind}${where === "column" ? " booklet-row-ask-col" : ""}`, attr: { "data-booklet-q": q.id, "data-booklet-pick": String(id) } });
		const promptId = view.uid();
		const nameId = view.uid();
		// the question's words head it in a row's open part; in a column the column's heading says them, and a hidden copy names the control
		const prompt = box.createDiv({ cls: `booklet-prompt markdown-rendered${where === "column" ? " booklet-sr" : ""}`, attr: { id: promptId } });
		view.md(q.title || q.id, prompt);
		box.createSpan({ cls: "booklet-sr", attr: { id: nameId }, text: ` (${rowName(p, r)})` });
		let helpId: string | null = null;
		if (q.help && where === "open") {
			helpId = view.uid();
			view.mdBlock(q.help, box.createDiv({ cls: "booklet-help markdown-rendered", attr: { id: helpId } }));
		}
		const named = `${promptId} ${nameId}`;
		const eq = q.kind === "choice" || q.kind === "multi" ? sameOption : sameValue;
		const now = held.shape === "value" ? held.value : undefined;
		const shows = (): Shows => {
			if (!inPlace || !keeps) return { state: "none" };
			const sent = newestSent(view.keptOf(t), q.id, id);
			return showsOf(sent, sent ? asValue(q, sent.a) : undefined, now, eq);
		};
		const draftPair = () => pairFor(view.answerOf(t, q), id);
		/** What the control shows: the reader's draft over all; else the value, or (in the waiting state) what was sent. An adding question starts empty. */
		const shownAnswer = (): unknown => {
			const d = draftPair();
			if (d) return d.a;
			if (!inPlace) return undefined;
			const sh = shows();
			return sh.state === "waiting" ? sh.sent.a : startOf(q, now);
		};
		// a pair for a value that is replaced says what the value was when the reader began to change it
		const extra = (): Record<string, unknown> | undefined => (inPlace && keeps ? { was: now ?? null } : undefined);
		const updaters: Array<() => void> = [];
		const rowHost: QuestionHost = {
			md: (markdown, el) => view.md(markdown, el),
			mdBlock: (markdown, el) => view.mdBlock(markdown, el),
			answerOf: () => shownAnswer(),
			answer: (_t, _q, value) => view.answer(t, q, value, id, extra()),
			typed: (_t, _q, value) => view.typed(t, q, value, id, extra()),
			flushTyped: () => view.flushTyped(t, q, id),
			pendingOf: () => view.pendingOf(t, q, id),
			onShow: (_k, show) => updaters.push(show),
			keepOwn: (k, tt, commit) => view.keepOwn(k, tt, commit),
			pressTarget: () => view.pressTarget(),
			heldOf: (k) => view.heldOf(k),
			hold: (k, words) => view.hold(k, words),
			earlierOf: () => ({ ...view.earlierOf(t), pick: id }),
			reshow: () => view.reshow(),
			uid: () => view.uid(),
			wrongOf: () => view.wrongOf(t, q),
			redrawSoon: () => view.redrawSoon(),
			listens: view.listens,
		};
		const controls = box.createDiv({ cls: "booklet-row-controls" });
		if (q.kind === "listen") controls.createEl("p", { cls: "booklet-muted", text: "A listen question is not asked for each row." });
		else if (q.kind === "widget") drawWidgetBody(rowHost, controls, t, q, key, named, locked);
		else drawBody(rowHost, controls, t, q, key, labeller(named, helpId), locked);

		// the display states and the history are words, so nothing is said by colour alone
		const state = box.createDiv({ cls: "booklet-row-state", attr: { "aria-live": "polite" } });
		const history = inPlace ? null : box.createEl("ul", { cls: "booklet-row-history" });
		const printed = box.createDiv({ cls: "booklet-print-value" });
		const show = (): void => {
			const typing = !!draftPair() || !!view.pendingOf(t, q, id);
			state.empty();
			state.removeAttribute("data-state");
			if (inPlace && !typing) {
				const sh = shows();
				if (sh.state === "waiting") {
					state.setAttr("data-state", "waiting");
					state.setText("Sent, waiting to be applied.");
				} else if (sh.state === "changed") {
					state.setAttr("data-state", "changed");
					state.setText(`You sent “${wordsOf(q, sh.sent.a)}”, but the value has changed since.`);
				}
			}
			if (history) {
				history.empty();
				const adds = keeps ? keptAdds(view.keptOf(t), q.id, id) : [];
				const items = held.shape === "list" ? held.items : [];
				const listed: string[] = [];
				for (const add of adds) {
					const w = wordsOf(q, add.a);
					const applied = items.some((x) => sameOption(x, w));
					listed.push(w);
					const li = history.createEl("li", { cls: "booklet-row-kept" });
					li.appendText(w);
					li.createSpan({ cls: "booklet-row-time", text: ` · ${whenText(add.ts)}${applied ? "" : " · waiting to be applied"}` });
				}
				for (const x of items) if (!listed.some((w) => sameOption(w, x))) history.createEl("li", { cls: "booklet-row-held", text: x });
				history.toggleClass("booklet-none", !history.childElementCount);
			}
			const pending = view.pendingOf(t, q, id);
			printed.setText(wordsOf(q, pending ? pending.value : shownAnswer()));
		};
		updaters.push(show);
		show();
		view.onShow(key, () => updaters.forEach((u) => u()));
	};

	/** A row's Finalize, under its questions: keeps that row's answers as one entry and leaves the rest of the draft (SPEC section 5). */
	const finish: RowsUi["finish"] = (into, p, r, qs) => {
		const plan = p.ask!;
		const id = r.id!;
		if (!keeps || qs.every((q) => plan.readonly(q.id))) return;
		const ids = plan.questions.map((q) => q.id);
		const box = into.createDiv({ cls: "booklet-row-finish" });
		const nameId = view.uid();
		const btnId = view.uid();
		box.createSpan({ cls: "booklet-sr", attr: { id: nameId }, text: `(${rowName(p, r)})` });
		const b = box.createEl("button", { cls: "booklet-row-finalize", text: "Finalize", attr: { type: "button", id: btnId, "aria-labelledby": `${btnId} ${nameId}` } });
		const upd = (): void => {
			b.disabled = !view.draftHas(t, ids, id);
		};
		upd();
		view.onShow(`${a.scope}/${a.id}#finish:${vkey}:${pickKey(id)}`, upd);
		b.addEventListener("click", (evt) => {
			evt.preventDefault();
			view.keepRow(t, ids, id);
		});
	};

	const edit: RowsUi["edit"] = (into, p, r, key, spec) => {
		const id = r.id!;
		const raw = r.raw!;
		const now = heldOf(raw, key).shape === "value" ? (heldOf(raw, key) as { value: unknown }).value : undefined;
		const label = textOf(p.set.label(key));
		const name = rowName(p, r);
		const sk = `${vkey}|${pickKey(id)}|${key}`;
		const eq = spec.kind === "choice" ? sameOption : sameValue;
		const cell = into.createSpan({ cls: "booklet-edit", attr: { "data-booklet-edit": key, "data-booklet-pick": String(id) } });
		const sent = keeps ? newestSent(view.keptOf(t), key, id) : null;
		const sh = showsOf(sent, sent?.a, now, eq);
		/** What the cell shows when it is not open: the value, or (waiting) what was sent. */
		const start: unknown = sh.state === "waiting" ? sh.sent.a : now;

		/** The words of a waiting or changed value, beside it; the value's button is described by them. */
		const mark = (c: HTMLElement, s: Shows): HTMLElement | null => {
			if (s.state === "waiting") return c.createSpan({ cls: "booklet-row-state", attr: { "data-state": "waiting", id: view.uid() }, text: " Sent, waiting to be applied." });
			if (s.state === "changed") return c.createSpan({ cls: "booklet-row-state booklet-row-sent", attr: { "data-state": "changed", id: view.uid() }, text: ` You sent “${valueText(s.sent.a)}”, but the value has changed since.` });
			return null;
		};
		const shut = (shown: unknown, s: Shows): void => {
			cell.empty();
			const text = valueText(shown);
			if (!keeps) {
				cell.appendText(text);
				return;
			}
			const b = cell.createEl("button", { cls: "booklet-edit-open", attr: { type: "button" } });
			b.createSpan({ cls: "booklet-sr", text: `Edit ${label}, ${name}: ` });
			b.createSpan({ cls: text ? "booklet-edit-value" : "booklet-edit-value booklet-muted", text: text || "–" });
			if (!text) b.createSpan({ cls: "booklet-sr", text: "empty" });
			// pressing the value turns it into a box; a press never reaches the row's own disclosure
			b.addEventListener("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				view.sessions.set(sk, { text, was: now, focused: true, vkey, pick: id });
				open();
			});
			const said = mark(cell, s);
			if (said) b.setAttr("aria-describedby", said.id);
		};

		const open = (): void => {
			const sess = view.sessions.get(sk);
			if (!sess) return;
			sess.cell = cell;
			cell.empty();
			const nameId = view.uid();
			cell.createSpan({ cls: "booklet-sr", attr: { id: nameId }, text: `${label}, ${name}` });
			let box: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
			if (spec.kind === "long") box = cell.createEl("textarea", { cls: "booklet-text booklet-long booklet-edit-box", attr: { rows: 3 } });
			else if (spec.kind === "choice") {
				const sel = cell.createEl("select", { cls: "dropdown booklet-edit-box" });
				const words = [...spec.options];
				const has = (x: string) => words.some((o) => sameOption(o, x));
				// a value the options do not list, and an empty one, are kept as the box's first words: nothing is changed by opening it
				if (sess.text !== "" && !has(sess.text)) words.unshift(sess.text);
				if (sess.text === "") sel.createEl("option", { value: "", text: "" });
				for (const w of words) sel.createEl("option", { value: w, text: w });
				box = sel;
			} else box = cell.createEl("input", { cls: "booklet-text booklet-edit-box", type: spec.kind === "number" ? "number" : spec.kind === "date" ? "date" : "text", attr: spec.kind === "number" ? { inputmode: "decimal" } : {} });
			box.setAttr("aria-labelledby", nameId);
			box.setAttr("data-booklet-key", `${key}#${String(id)}`);
			// the box's words as plain text, which is what prints (the box itself does not), and a place for a word to the reader
			const printed = cell.createSpan({ cls: "booklet-edit-print", text: sess.text });
			const warn = cell.createSpan({ cls: "booklet-row-state", attr: { "data-state": "invalid", role: "alert", id: view.uid() } });
			box.setAttr("aria-describedby", warn.id);
			if (box.tagName === "SELECT") {
				const at = Array.from((box as HTMLSelectElement).options).findIndex((o) => sameOption(o.value, sess.text));
				(box as HTMLSelectElement).selectedIndex = Math.max(0, at);
			} else box.value = sess.text;
			const read = (): string => box.value;
			/** A number box whose text is no number (the browser gives value "" and says badInput for "3e"): it holds words that cannot be kept. */
			const unreadable = (): boolean => spec.kind === "number" && ((box as HTMLInputElement).validity?.badInput === true || (read().trim() !== "" && !Number.isFinite(Number(read()))));
			const typedIn = (): void => {
				// unreadable text is not the box's value: the session keeps the last words that were
				if (!unreadable()) {
					sess.text = read();
					printed.setText(sess.text);
					warn.setText("");
				}
			};
			box.addEventListener("input", typedIn);
			box.addEventListener("change", typedIn);
			let over = false;
			const finish = (keepIt: boolean, leaving = false): void => {
				if (over) return;
				if (keepIt && unreadable()) {
					if (!leaving) {
						// the box stays open with the reader's text in it, and says why nothing is kept
						warn.setText("That is not a number, so nothing is kept. Correct the number to keep it.");
						return;
					}
					// the screen is being left: the text cannot be read as a number, so it cannot be kept
					over = true;
					view.sessions.delete(sk);
					shut(start, sh);
					view.say(`Booklet: ${label} of ${name} was not changed, because what was typed is not a number.`);
					return;
				}
				over = true;
				view.sessions.delete(sk);
				const typed = read();
				if (!keepIt) return void shut(start, sh);
				const next: unknown = spec.kind === "number" ? (typed.trim() === "" ? null : Number(typed)) : typed;
				// leaving a box as it was found keeps nothing
				if (eq(next, start)) return void shut(start, sh);
				const was = sess.was ?? null;
				// what was typed shows at once, as waiting, until the note holds it (the view draws the rows again then)
				shut(next, { state: "waiting", sent: { ts: "", a: next, was, hasWas: true } });
				view.keepAct(t, key, { pick: id, a: next, was }, () => {
					view.sessions.set(sk, { text: typed, was, focused: false, vkey, pick: id, cell });
					if (cell.isConnected) {
						over = false;
						open();
					}
				});
			};
			sess.commit = () => finish(true, true);
			// a key in the box belongs to the box: it never reaches the row's disclosure, which Space and Enter would toggle
			const own = (evt: Event) => evt.stopPropagation();
			const el: HTMLElement = box;
			// (a key let go is not stopped: the row's summary reads it, to cancel the browser's own Space for the summary, query-view.ts ownKeys)
			el.addEventListener("keypress", own);
			el.addEventListener("keydown", (evt) => {
				evt.stopPropagation();
				if (evt.key === "Enter" && !(spec.kind === "long" && evt.shiftKey)) {
					evt.preventDefault();
					finish(true);
					const back = cell.querySelector<HTMLElement>("button");
					back?.focus();
				} else if (evt.key === "Escape") {
					evt.preventDefault();
					finish(false);
					cell.querySelector<HTMLElement>("button")?.focus();
				}
			});
			el.addEventListener("click", own);
			box.addEventListener("focus", () => {
				sess.focused = true;
			});
			// leaving the box keeps the change; a box taken away by a redraw is not left, the reader's words wait in the session
			box.addEventListener("blur", () => {
				if (over || !box.isConnected) return;
				sess.focused = false;
				finish(true);
			});
			if (sess.focused) {
				box.focus();
				if (box.tagName === "INPUT" && (spec.kind === "text" || spec.kind === "number")) (box as HTMLInputElement).select?.();
			}
		};

		if (view.sessions.has(sk) && keeps) open();
		else shut(start, sh);
	};

	return { ask, edit, finish };
}

export type { EditSpec };
