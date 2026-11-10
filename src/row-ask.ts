/*
 * Acts on the rows of a data view, drawn (format 0.19; SPEC section 5, "A question asked for each row" and "Editing a field in place"):
 * a question asked for each row is drawn in the row's open part, or in a column that a query's `fields:` names for it; a field marked
 * `edit` is drawn as its value and turns into a box when it is pressed. What is kept, the display states and the rules are the core's
 * (core/ask.ts, core/write.ts); this draws them with the plugin's own controls (questions.ts), and names every control for a screen reader
 * by the field's or question's words and the row's.
 *
 * An edit also writes the data, in the vault file or in the data block of the note (view.ts applyAct, data-files.ts apply, core/apply.ts).
 * Adding a row (the form for a new row) and removing one (a confirmed Remove) keep an entry of their own, `$add` or `$delete` (core/rows-act.ts),
 * and then write the data the same way; the id of a new row is made when the reader presses Add (core/row-id.ts).
 *
 * An act is one pair `{ pick, a, was }` in a new kept entry of the activity that holds the query, so the activity must repeat: in any
 * other the field is drawn as its value, and a question is answered as any `each:` question is, as it is typed. Typing in a question
 * is a draft (the view's, as every draft is); typing in an edit box is the reader's until Enter or leaving the box keeps it as one act,
 * and is kept through a redraw of the rows (a data file read again) in `sessions`, so nothing typed is lost.
 */
import { setIcon } from "obsidian";
import {
	ADD_KEY,
	DELETE_KEY,
	answerWords,
	asValue,
	checkTypedId,
	childListKey,
	makeId,
	rowsUnder,
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
	type DataBlock,
	type Entry,
	type PickValue,
	type Question,
	type QueryPlan,
	type Row,
	type Shows,
	type AddField,
	type EditSpec,
} from "./core";
import { drawWidgetBody } from "./engines";
import { drawBody, keyOf, labeller, type QuestionHost, type Target } from "./questions";
import type { RowsUi } from "./query-view";

type Plan = Extract<QueryPlan, { kind: "rows" }>;

/** The words of the display states, as the reference renderer says them (booklet.html, the strings called waiting and sent). */
const WAITING = " · sent, waiting";
const SENT = "You sent:";

/** What the view needs to apply a kept act to a data file: the block that names the file, and how the data's value is compared with `was`. */
export interface ActApply {
	block: DataBlock;
	eq: (a: unknown, b: unknown) => boolean;
}

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

/**
 * A form for a new row that is open: the words typed in each box (by field), the id typed when the block declares no format, the word to the
 * reader that is showing, and the box the reader was in (put back when the rows are drawn again). Kept by the view; never saved.
 */
export interface AddSession {
	values: Record<string, string>;
	id: string;
	message: string;
	focus: string | null;
}

/** The key of the id box in `AddSession.focus`. */
const ID_BOX = "\u0000id";

/** What the rows' acts need from the view: the question host, the kept entries, and the writes. */
export interface RowsView extends QuestionHost {
	/** The activity's kept entries as the view holds them. */
	keptOf(t: Target): Entry[];
	/** Says something to the reader, politely (a notice). */
	say(message: string): void;
	/**
	 * Keeps one act as a new entry of the activity, under `key`; `failed` runs when it could not be written (the reader's words are then given
	 * back). With `apply`, once the entry is kept the act is also written into the data file the block names, if the data still holds `pair.was`.
	 */
	keepAct(t: Target, key: string, pair: Record<string, unknown>, failed: () => void, apply?: ActApply): void;
	/** A row's Finalize: keeps that row's draft pairs of the questions `ids` as one entry, and takes them out of the draft. */
	keepRow(t: Target, ids: readonly string[], pick: PickValue): void;
	/** Does the draft (or typing not written yet) hold an answer for this row to one of these questions? */
	draftHas(t: Target, ids: readonly string[], pick: PickValue): boolean;
	/** The edit boxes that are open, by cell. */
	sessions: Map<string, EditSession>;
	/** The forms for a new row that are open, by query and parent. */
	addForms: Map<string, AddSession>;
	/** The rows that have asked "Remove this row?" and wait for the answer, by query and row. */
	removeAsks: Set<string>;
	/** Every id of the block's rows and of the adds waiting: what a new row's id is made against. */
	idsOf(t: Target, block: DataBlock): PickValue[];
	/**
	 * A click that ended at its own button (it never reaches the view's click listener) is over: a drawing that waited for the press is made
	 * once the writes it started have landed, as after any other click.
	 */
	clicked(): void;
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
export function makeRowsUi(view: RowsView, a: Activity, vkey: string, block: DataBlock): RowsUi {
	const t: Target = { scope: a.scope, activity: a };
	/**
	 * Can an act be kept: the activity keeps entries and has an id to keep them under. A daily activity keeps one entry a day, made by its
	 * own Finalize, so an act (an entry of its own) has no place in it: there a field is its value, and a question is a draft as any is.
	 */
	const keeps = a.repeat && !!a.id && !a.daily;
	/**
	 * Can the plugin write this block: a file of the vault (a file that cannot be found is not drawn at all), or JSON written in the note
	 * itself between plain fences. One in a callout or a comment can be read and cannot be written, so it gets no control that would write.
	 */
	const writable = !!block.file || !!block.inner;

	const ask: RowsUi["ask"] = (into, p, r, q, where) => {
		const plan = p.ask!;
		const id = r.id!;
		const raw = r.raw!;
		const held = heldOf(raw, q.id);
		const inPlace = held.shape === "value";
		const readonly = plan.readonly(q.id) || (inPlace && !writable);
		const locked = readonly || (a.repeat && !a.id) || !!view.wrongOf(t, q);
		const key = `${keyOf(t, q)}#row:${vkey}:${pickKey(id)}`;
		const eq = q.kind === "choice" || q.kind === "multi" ? sameOption : sameValue;
		const now = held.shape === "value" ? held.value : undefined;
		const shows = (): Shows => {
			if (!inPlace || !keeps) return { state: "none" };
			const sent = newestSent(view.keptOf(t), q.id, id);
			return showsOf(sent, sent ? asValue(q, sent.a) : undefined, now, eq);
		};
		const draftPair = () => pairFor(view.answerOf(t, q), id, true);
		/** What the control shows: the reader's draft over all; else the value, or (in the waiting state) what was sent. An adding question starts empty. */
		const shownAnswer = (): unknown => {
			const d = draftPair();
			if (d) return d.a;
			if (!inPlace) return undefined;
			const sh = shows();
			return sh.state === "waiting" ? sh.sent.a : startOf(q, now);
		};
		// a question the query locks shows the answer as plain words (the renderer's way), and nothing at all when there is nothing to show
		const lockedWords = (): string => {
			const w = wordsOf(q, shownAnswer());
			return w !== "" ? w : inPlace ? valueText(now) : "";
		};
		if (readonly && q.kind !== "listen" && lockedWords() === "" && shows().state === "none" && !(held.shape === "list" && held.items.length) && !(keeps && !inPlace && keptAdds(view.keptOf(t), q.id, id).length)) return;
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
		else if (readonly) controls.createDiv({ cls: "booklet-row-roval", text: lockedWords() });
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
					state.setText(WAITING);
				} else if (sh.state === "changed") {
					state.setAttr("data-state", "changed");
					state.setText(`${SENT} ${wordsOf(q, sh.sent.a)}`);
				}
			}
			if (history) {
				history.empty();
				// what the data holds as a list, then the kept answers newest first: the time, then the words
				const adds = keeps ? keptAdds(view.keptOf(t), q.id, id) : [];
				for (const x of held.shape === "list" ? held.items : []) history.createEl("li", { cls: "booklet-row-held", text: x });
				for (const add of adds) {
					const li = history.createEl("li", { cls: "booklet-row-kept" });
					li.createSpan({ cls: "booklet-row-time", text: `${whenText(add.ts)} · ` });
					li.appendText(wordsOf(q, add.a));
				}
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
			if (s.state === "waiting") return c.createSpan({ cls: "booklet-row-state", attr: { "data-state": "waiting", id: view.uid() }, text: WAITING });
			if (s.state === "changed") return c.createSpan({ cls: "booklet-row-state booklet-row-sent", attr: { "data-state": "changed", id: view.uid() }, text: `${SENT} ${valueText(s.sent.a)}` });
			return null;
		};
		const shut = (shown: unknown, s: Shows): void => {
			cell.empty();
			const text = valueText(shown);
			// an edit is drawn only where it can be written: the activity keeps entries, and the block is a file or JSON written in the note
			if (!keeps || !writable) {
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
			} else box = cell.createEl("input", { cls: "booklet-text booklet-edit-box", type: spec.kind === "number" ? "number" : spec.kind === "date" ? "date" : "text", attr: spec.kind === "number" ? { inputmode: "decimal" } : spec.kind === "date" ? {} : { size: String(Math.min(30, Math.max(8, sess.text.length + 2))) } }); // `size`: a text box asks its column for the room of its words, not a browser's default width
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
				// an edit also changes the data when the rows come from a file of the vault (the plugin is that file's host, docs/hosting.md);
				// rows written in the note itself are only kept, and so is a question's answer (it has no `was` and goes another way)
				view.keepAct(
					t,
					key,
					{ pick: id, a: next, was },
					() => {
						view.sessions.set(sk, { text: typed, was, focused: false, vkey, pick: id, cell });
						if (cell.isConnected) {
							over = false;
							open();
						}
					},
					{ block, eq },
				);
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

		if (view.sessions.has(sk) && keeps && writable) open();
		else shut(start, sh);
	};

	/* ---- adding and removing rows (rows-act.ts) ---- */

	/** Is the control of an add drawn for this view: the activity keeps entries, and the query asks for it. */
	const adds = (p: Plan): boolean => keeps && writable && !!p.acts && p.acts.add;

	/** Draws the form for a new row into `into`, closed (its button) or open, for the parent `parent` (null: a top row). */
	const form = (into: HTMLElement, p: Plan, parent: Row | null): void => {
		const acts = p.acts!;
		const box = into.createDiv({ cls: `booklet-row-add${parent ? " booklet-row-add-under" : ""}`, attr: { "data-booklet-add": parent ? String(parent.id) : "" } });
		const fkey = `${vkey}|${parent ? pickKey(parent.id!) : ""}`;
		const name = parent ? rowName(p, parent) : "";
		const title = parent ? "Add under this row" : "Add a row";
		const closed = (): void => {
			box.empty();
			// a plus and a word, Obsidian's icon button: the rest of the name ("a row", "this row" and which) is for a screen reader
			const b = box.createEl("button", { cls: "clickable-icon booklet-row-act booklet-row-add-open", attr: { type: "button" } });
			setIcon(b, "plus");
			b.createSpan({ text: parent ? "Add under" : "Add" });
			b.createSpan({ cls: "booklet-sr", text: parent ? ` this row (${name})` : " a row" });
			b.addEventListener("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				view.clicked();
				view.addForms.set(fkey, { values: {}, id: "", message: "", focus: acts.fields[0]?.key ?? (acts.idFormat === undefined ? ID_BOX : null) });
				open();
			});
		};
		const open = (): void => {
			const sess = view.addForms.get(fkey);
			if (!sess) return closed();
			box.empty();
			const group = box.createDiv({ cls: "booklet-row-addform", attr: { role: "group", "aria-label": parent ? `${title}: ${name}` : title } });
			const boxes = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
			const warn = group.createDiv({ cls: "booklet-row-state booklet-row-addmsg", attr: { "data-state": "invalid", role: "alert" } });
			warn.setText(sess.message);
			const field = (key: string, label: string, make: (id: string, into: HTMLElement) => HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void => {
				const row = group.createDiv({ cls: "booklet-row-addfield" });
				const id = view.uid();
				row.createEl("label", { text: label, attr: { for: id } });
				const el = make(id, row);
				const node: HTMLElement = el;
				boxes.set(key, el);
				const keep = (): void => {
					if (key === ID_BOX) sess.id = el.value;
					else sess.values[key] = el.value;
					if (sess.message) {
						sess.message = "";
						warn.setText("");
					}
				};
				node.addEventListener("input", keep);
				node.addEventListener("change", keep);
				node.addEventListener("focus", () => {
					sess.focus = key;
				});
				// a key in a box belongs to the box: it never reaches the row's disclosure
				node.addEventListener("keypress", (evt) => evt.stopPropagation());
				node.addEventListener("click", (evt) => evt.stopPropagation());
				node.addEventListener("keydown", (evt: KeyboardEvent) => {
					evt.stopPropagation();
					// Esc in a box closes the form: the box keeps the key from reaching the form's own listener below
					if (evt.key === "Escape") {
						evt.preventDefault();
						stop();
						return;
					}
					if (evt.key === "Enter" && el.tagName !== "TEXTAREA" && el.tagName !== "SELECT") {
						evt.preventDefault();
						submit();
					}
				});
			};
			for (const f of acts.fields) {
				const k = f.key;
				field(k, f.label, (id, at) => {
					const v = sess.values[k] ?? "";
					if (f.spec.kind === "long") {
						const t = at.createEl("textarea", { cls: "booklet-text booklet-long booklet-edit-box", attr: { id, rows: 3 } });
						t.value = v;
						return t;
					}
					if (f.spec.kind === "choice") {
						const sel = at.createEl("select", { cls: "dropdown booklet-edit-box", attr: { id } });
						sel.createEl("option", { value: "", text: "" });
						for (const w of f.spec.options) sel.createEl("option", { value: w, text: w });
						sel.value = v;
						return sel;
					}
					const i = at.createEl("input", { cls: "booklet-text booklet-edit-box", type: f.spec.kind === "number" ? "number" : f.spec.kind === "date" ? "date" : "text", attr: { id, ...(f.spec.kind === "number" ? { inputmode: "decimal" } : {}) } });
					i.value = v;
					return i;
				});
			}
			if (acts.idFormat === undefined) {
				field(ID_BOX, "Id", (id, at) => {
					const i = at.createEl("input", { cls: "booklet-text booklet-edit-box", type: "text", attr: { id } });
					i.value = sess.id;
					return i;
				});
			}
			const actions = group.createDiv({ cls: "booklet-row-addactions" });
			const add = actions.createEl("button", { cls: "booklet-row-act mod-cta booklet-row-add-go", text: "Add", attr: { type: "button" } });
			const cancel = actions.createEl("button", { cls: "booklet-row-act booklet-row-add-cancel", text: "Cancel", attr: { type: "button" } });
			const stop = (): void => {
				view.addForms.delete(fkey);
				closed();
				box.querySelector<HTMLElement>("button")?.focus();
			};
			cancel.addEventListener("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				view.clicked();
				stop();
			});
			group.addEventListener("keydown", (evt: KeyboardEvent) => {
				if (evt.key !== "Escape") return;
				evt.preventDefault();
				evt.stopPropagation();
				stop();
			});
			const submit = (): void => {
				const row: Record<string, string | number> = {};
				const text: Record<string, string> = {};
				for (const f of acts.fields) {
					const el = boxes.get(f.key)!;
					const raw = el.value;
					text[f.key] = sess.values[f.key] ?? raw;
					if (f.spec.kind === "number") {
						const badInput = (el as HTMLInputElement).validity?.badInput === true;
						if (badInput || (raw.trim() !== "" && !Number.isFinite(Number(raw)))) return say(`${f.label}: that is not a number, so nothing is kept. Correct the number to keep it.`, f.key);
						if (raw.trim() !== "") row[f.key] = Number(raw);
					} else if (raw.trim() !== "") row[f.key] = raw;
				}
				const ids = view.idsOf(t, block);
				const parentId = parent ? parent.id : undefined;
				const label = (k: string): string => acts.fields.find((f) => f.key === k)?.label ?? p.set.label(k).map((x) => ("text" in x ? x.text : x.md)).join("");
				const made: { ok: true; id: string | number } | { ok: false; message: string; field?: string } =
					acts.idFormat !== undefined
						? makeId(acts.idFormat, { ids, values: text, parent: parentId, now: new Date(), random: (n) => crypto.getRandomValues(new Uint8Array(n)), labelOf: label })
						: checkTypedId(sess.id, acts.idPattern, ids);
				if (!made.ok) {
					const named = made.field;
					return say(made.message, named !== undefined && boxes.has(named) ? named : acts.idFormat === undefined ? ID_BOX : null);
				}
				const pair: Record<string, unknown> = { in: block.id, pick: made.id, ...(parentId !== undefined ? { under: parentId } : {}), row };
				view.addForms.delete(fkey);
				closed();
				box.querySelector<HTMLElement>("button")?.focus();
				view.keepAct(
					t,
					ADD_KEY,
					pair,
					() => {
						// not kept: the reader's words are given back
						view.addForms.set(fkey, sess);
						if (box.isConnected) open();
					},
					{ block, eq: sameValue },
				);
			};
			const say = (message: string, focus: string | null): void => {
				sess.message = message;
				warn.setText(message);
				if (focus !== null) boxes.get(focus)?.focus();
			};
			add.addEventListener("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				view.clicked();
				submit();
			});
			if (sess.focus !== null) boxes.get(sess.focus)?.focus();
		};
		if (view.addForms.has(fkey)) open();
		else closed();
	};

	const addTop: RowsUi["addTop"] = (into, p) => {
		if (!adds(p)) return;
		if (p.acts!.idProblem) {
			into.createEl("p", { cls: "booklet-muted booklet-row-add-quiet", text: p.acts!.idProblem });
			return;
		}
		form(into, p, null);
	};

	/** A row can take a child when its id names it, it is in the data, and it holds exactly one list of rows. */
	const offersUnder: RowsUi["offersUnder"] = (p, r) => adds(p) && !p.acts!.idProblem && r.id !== undefined && r.act !== "adding" && !!r.raw && childListKey(r.raw) !== null;

	const addUnder: RowsUi["addUnder"] = (into, p, r) => {
		if (offersUnder(p, r)) form(into, p, r);
	};

	const removes: RowsUi["removes"] = (p) => keeps && writable && !!p.acts && p.acts.remove;

	const remove: RowsUi["remove"] = (into, p, r) => {
		// a row still on its way into the data (a pending add) can be removed too: the removal records it as the entry made it, and the data, which never held it, is left alone
		if (!removes(p) || r.id === undefined || r.act === "removing" || !r.raw) return;
		const id = r.id;
		const rkey = `${vkey}|${pickKey(id)}`;
		const name = rowName(p, r);
		const gone = r.data ?? r.raw;
		const wrap = into.createSpan({ cls: "booklet-row-remove", attr: { "data-booklet-remove": String(id), "aria-live": "polite" } });
		/** Is the question showing: a key in it belongs to it, not to the row's disclosure. */
		let asking = false;
		const back = (): void => {
			view.removeAsks.delete(rkey);
			closed();
			wrap.querySelector<HTMLElement>("button")?.focus();
		};
		// once for the wrap, not once for each question: a press of Remove asks again and again on the same wrap
		wrap.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (!asking) return;
			evt.stopPropagation();
			if (evt.key !== "Escape") return;
			evt.preventDefault();
			back();
		});
		wrap.addEventListener("keypress", (evt) => {
			if (asking) evt.stopPropagation();
		});
		const closed = (): void => {
			asking = false;
			wrap.empty();
			// a trash icon, Obsidian's icon button: a press asks first (below). aria-label gives a mouse Obsidian's tooltip; the hidden words are the same name
			const b = wrap.createEl("button", { cls: "clickable-icon booklet-row-act booklet-row-remove-open", attr: { type: "button", "aria-label": `Remove ${name}` } });
			setIcon(b, "trash-2");
			b.createSpan({ cls: "booklet-sr", text: `Remove ${name}` });
			b.addEventListener("click", (evt) => {
				// a press never reaches the row's own disclosure
				evt.preventDefault();
				evt.stopPropagation();
				view.clicked();
				view.removeAsks.add(rkey);
				ask();
			});
		};
		const ask = (): void => {
			asking = true;
			wrap.empty();
			const n = rowsUnder(gone);
			wrap.createSpan({ cls: "booklet-row-remove-q", text: n ? `Remove this row and the ${n} ${n === 1 ? "row" : "rows"} under it?` : "Remove this row?" });
			const yes = wrap.createEl("button", { cls: "booklet-row-act mod-warning booklet-row-remove-yes", attr: { type: "button" } });
			yes.appendText("Remove");
			yes.createSpan({ cls: "booklet-sr", text: ` ${name}` });
			const no = wrap.createEl("button", { cls: "booklet-row-act booklet-row-remove-no", text: "Cancel", attr: { type: "button" } });
			no.addEventListener("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				view.clicked();
				back();
			});
			yes.addEventListener("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				view.clicked();
				view.removeAsks.delete(rkey);
				asking = false;
				wrap.empty();
				wrap.createSpan({ cls: "booklet-row-state", attr: { "data-state": "waiting" }, text: "removing, waiting" });
				view.keepAct(
					t,
					DELETE_KEY,
					{ in: block.id, pick: id, was: JSON.parse(JSON.stringify(gone)) as unknown },
					() => {
						if (wrap.isConnected) closed();
					},
					{ block, eq: sameValue },
				);
			});
			no.focus();
		};
		if (view.removeAsks.has(rkey)) ask();
		else closed();
	};

	return { ask, edit, finish, addTop, offersUnder, addUnder, removes, remove };
}

export type { EditSpec, AddField };
