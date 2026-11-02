/*
 * The `listen` question drawn and followed (SPEC section 5, "Listen"): the prompt, the media where the author wrote it, a "Done" box the
 * reader can tick, and where she left off. The media is Obsidian's own element (or lane B's slot and player); this file never plays
 * it, never pauses it, and never seeks it while it plays. What it does is follow it:
 *
 *   - one set of capture listeners on the view (view.ts onload) hands every media event to `Listens.onMedia`, which finds the box
 *     the element is in (playing.ts) and acts only when it is the box's first media element;
 *   - while it plays, each whole second goes to the device store (listen-store.ts), never to the note, which syncs;
 *   - on pause, on the end, and when the reader leaves the page, the position is written into the note (core/listen.ts listenNext
 *     decides what the answer becomes: the done rule, the reset on the end, every other key kept);
 *   - a position left in the device store by a kill is added to the note at the next start, if the note was not changed since.
 */
import type { App } from "obsidian";
import { answeredOf, clock, plainText, holdsSomething, listenNext, questionsOf, type AnswerValue, type ListenEvent, type NavModel, type Question } from "./core";
import { dropListen, keepListen, loadListens } from "./listen-store";
import { mediaEvent, Track } from "./playing";
import { posIn } from "./listen-writer";
import { keyOf, pressed, type QuestionHost, type Target } from "./questions";

/** What the follower needs from the view. */
export interface ListenIO {
	app: () => App;
	/** The note's path, else null (the device store is by note). */
	path: () => string | null;
	/** The answer the note holds for the question, as written. */
	held: (t: Target, q: Question) => unknown;
	/** Is the answer of the wrong shape (kept as written, never written over)? */
	wrong: (t: Target, q: Question) => boolean;
	/** Writes an answer (undefined clears it): shown at once and queued; `written` runs when the write has landed. */
	write: (t: Target, q: Question, value: AnswerValue | undefined, written: () => void) => void;
	/** Playback stopped: a drawing that waited for it can be made. */
	idle: () => void;
}

/** One drawn `listen` that the view follows. */
export interface ListenState {
	/** `<scope>/<id>`: where the answer is kept, and the device store's key. */
	key: string;
	box: HTMLElement;
	t: Target;
	q: Question;
	track: Track;
	/** The whole second the reader is at, as far as the note and the device store are concerned: the note's, or the one noted from the element. */
	pos: number;
	/** The position noted from the element is not in the note yet (the device store holds it). */
	dirty: boolean;
	/** The `pos` the note held when this session's first position was noted; null before then. */
	base: number | null;
	/** Shows the box again from the note and from this state. */
	show: () => void;
}

/** The `listen` of a note by its store key (`<scope>/<id>`), outside a repeating activity. */
export function locate(nav: NavModel, key: string): { t: Target; q: Question } | null {
	const at = key.lastIndexOf("/");
	const scope = key.slice(0, at);
	const id = key.slice(at + 1);
	for (const na of nav.byKey.values()) {
		if (na.act.scope !== scope || na.act.repeat) continue;
		const q = questionsOf(na.act).find((x) => x.kind === "listen" && x.id === id);
		if (q) return { t: { scope, activity: na.act }, q };
	}
	return null;
}

/** Follows the `listen` boxes of the drawing on show. */
export class Listens {
	private states = new Map<string, ListenState>();

	constructor(private readonly io: ListenIO) {}

	/** A `listen` has been drawn into `box` and is followed from here on (a drawn box of a repeating activity is not: it has no answer). */
	track(box: HTMLElement, t: Target, q: Question, show: () => void): ListenState {
		const key = `${t.scope}/${q.id}`;
		const st: ListenState = { key, box, t, q, track: new Track(), pos: posIn(this.io.held(t, q)), dirty: false, base: null, show };
		this.states.set(key, st);
		return st;
	}

	/**
	 * What a box shows now, from the answer the note holds. Where the reader is: the element's own second while it plays or holds a
	 * position not written yet, else the note's. A change that reaches the note from elsewhere puts a paused element at the new
	 * place, and never one that plays or holds a position of the reader's own (never discard what she did).
	 */
	view(st: ListenState, v: unknown): { pos: number; playing: boolean } {
		const playing = st.track.live;
		if (playing || st.dirty) return { pos: st.pos, playing };
		const file = posIn(v);
		const tr = st.track;
		// whole seconds: a place at or past the end is the start
		const at = tr.seekable && file >= tr.length ? 0 : file;
		st.pos = at;
		if (tr.seekable && !tr.ended && tr.second !== at) tr.seek(at);
		return { pos: file, playing: false };
	}

	/** Is any followed element playing? Then a drawing that would replace it waits (view.ts busy). */
	playing(): boolean {
		for (const st of this.states.values()) if (st.track.live) return true;
		return false;
	}

	/** Is a position still on its way into the note: playing, or noted and not written? (view.ts hasUnsaved: the quit hook waits for the write.) */
	unsaved(): boolean {
		for (const st of this.states.values()) if (st.dirty || st.track.live) return true;
		return false;
	}

	/** The key and `left:` of the box a `listen` is followed in, else null (a lifted player asks, now-playing.ts). */
	about(box: HTMLElement): { key: string; left: number } | null {
		const st = this.states.get(box.getAttribute("data-booklet-listen") ?? "");
		return st && st.box === box ? { key: st.key, left: st.q.left } : null;
	}

	/**
	 * One media event, seen by the view's capture listener, or handed over for an element lifted out of its box (`home`: now-playing.ts).
	 * False when this follows nothing it is about (the box was drawn again, or the view closed): the caller then deals with it.
	 */
	onMedia(evt: Event, home?: HTMLElement): boolean {
		const hit = mediaEvent(evt, home);
		if (!hit) return false;
		const st = this.states.get(hit.box.getAttribute("data-booklet-listen") ?? "");
		if (!st || st.box !== hit.box) return false;
		const tr = st.track;
		tr.adopt(hit.el);
		switch (evt.type) {
			case "loadedmetadata":
				this.start(st);
				break;
			case "play":
				// an element that was ready before it was seen (its metadata event came earlier) is put at its place now
				if (!tr.ready && tr.seekable) this.start(st);
				st.show();
				break;
			case "timeupdate":
			case "seeked":
				this.note(st);
				break;
			case "pause":
				// the end pauses the element too: the `ended` event deals with that
				if (!tr.ended) this.settle(st, "pause");
				this.afterStop(st);
				break;
			case "ended":
				this.settle(st, "end");
				this.afterStop(st);
				break;
			case "error":
				this.afterStop(st);
				break;
		}
		return true;
	}

	/** Its metadata is in: it starts where the note says the reader left off (a place at or past its end is the start). */
	private start(st: ListenState): void {
		const tr = st.track;
		tr.ready = true;
		// a position of hers not written yet is hers: nothing puts the element anywhere else
		if (st.dirty) return;
		const file = posIn(this.io.held(st.t, st.q));
		const at = file >= tr.length ? 0 : file;
		st.pos = at;
		if (at !== tr.second) tr.seek(at);
		st.show();
	}

	/** The element is at a second: kept in the device store when the second is a new one. Nothing is written to the note. */
	private note(st: ListenState): void {
		const sec = st.track.second;
		if (!Number.isFinite(sec) || sec < 0 || sec === st.pos) return;
		st.pos = sec;
		st.dirty = true;
		const path = this.io.path();
		if (!path || this.io.wrong(st.t, st.q)) return;
		if (st.base === null) st.base = posIn(this.io.held(st.t, st.q));
		keepListen(this.io.app(), path, st.key, { pos: sec, base: st.base });
	}

	/** Playback stopped (a pause, the end, an error): the box shows where she left off, and a drawing that waited is made. */
	private afterStop(st: ListenState): void {
		st.show();
		this.io.idle();
	}

	/**
	 * Writes what the element says into the note, as the event asks (core/listen.ts listenNext). The device store's entry is taken
	 * out once the write has landed, unless a newer position has been noted since.
	 */
	private settle(st: ListenState, ev: ListenEvent): void {
		const el = st.track.el;
		st.dirty = false;
		st.base = null;
		st.pos = ev === "end" || !el ? 0 : Math.floor(el.currentTime);
		if (this.io.wrong(st.t, st.q)) {
			this.forget(st);
			return;
		}
		const at = el ? { pos: el.currentTime, duration: el.duration } : {};
		const next = listenNext(this.io.held(st.t, st.q), ev, at, st.q.left);
		if (next === null) {
			this.forget(st);
			return;
		}
		this.io.write(st.t, st.q, holdsSomething(next) ? next : undefined, () => {
			if (!st.dirty) this.forget(st);
		});
	}

	private forget(st: ListenState): void {
		const path = this.io.path();
		if (path) dropListen(this.io.app(), path, st.key);
	}

	/**
	 * The page is being left, or the app is closing: every position that is playing or noted and not written goes into the note,
	 * read from the element now (view.ts flushAll runs this before the drawing, and so the element, is gone).
	 */
	flush(): void {
		for (const st of this.states.values()) {
			if (!st.track.el || st.track.ended || (!st.dirty && !st.track.live)) continue;
			this.settle(st, "pause");
		}
	}

	/** The drawing is replaced: its elements are let go of (flush first; whatever is noted and not written is in the device store). */
	reset(): void {
		for (const st of this.states.values()) st.track.release();
		this.states.clear();
	}

	/**
	 * At the start of a note: a position the device store kept and the note does not hold (the app was killed while the media played)
	 * is added to the note, as held words are, if the note still holds the position it held when the session began. If the note holds
	 * another, a second device wrote since, and the note wins: the entry is dropped.
	 */
	resume(nav: NavModel): void {
		const path = this.io.path();
		if (!path) return;
		const app = this.io.app();
		for (const [key, kept] of Object.entries(loadListens(app, path))) {
			const found = locate(nav, key);
			const held = found && !this.io.wrong(found.t, found.q) ? this.io.held(found.t, found.q) : undefined;
			const next = found && posIn(held) === kept.base ? listenNext(held, "pause", { pos: kept.pos }, found.q.left) : null;
			if (!found || next === null) {
				dropListen(app, path, key);
				continue;
			}
			this.io.write(found.t, found.q, holdsSomething(next) ? next : undefined, () => dropListen(app, path, key));
		}
	}
}

/**
 * Draws one `listen` into `card`: its prompt, its media where the author wrote it (the embed, or the link of a video service, as the
 * note has it), the rest of the `>` lines as help, and a row with the "Done" box and where the reader left off. A `listen` in a repeating
 * activity has no answer of its own to keep (SPEC section 5), so it is the prompt, the media and the help, with no box.
 */
export function drawListen(host: QuestionHost, card: HTMLElement, t: Target, q: Question, locked: boolean): HTMLElement {
	const repeats = t.activity.repeat;
	const box = card.createDiv({ cls: "booklet-question booklet-kind-listen booklet-listen" });
	// the key of a followed box; a box of a repeating activity is marked and followed by nothing
	box.setAttr("data-booklet-listen", repeats ? "" : `${t.scope}/${q.id}`);
	// the prompt in plain words: the name of Obsidian's player inside the box (media-view.ts nameLocalMedia)
	box.setAttr("data-booklet-name", plainText(q.title || q.id));
	const promptId = host.uid();
	host.md(q.title || q.id, box.createDiv({ cls: "booklet-prompt markdown-rendered", attr: { id: promptId } }));
	if (q.media) host.mdBlock(q.media, box.createDiv({ cls: "booklet-listen-media markdown-rendered" }));
	let helpId: string | null = null;
	if (q.help) {
		helpId = host.uid();
		host.mdBlock(q.help, box.createDiv({ cls: "booklet-help markdown-rendered", attr: { id: helpId } }));
	}
	if (repeats) return box;

	const row = box.createDiv({ cls: "booklet-listen-row" });
	const tickId = host.uid();
	// named by the prompt and its own word: "Episode 1: Foundations Done", pressed or not
	const tick = row.createEl("button", { cls: "booklet-listen-tick", text: "Done", attr: { id: tickId, type: "button", "aria-labelledby": `${promptId} ${tickId}` } });
	if (helpId) tick.setAttr("aria-describedby", helpId);
	tick.disabled = locked;
	const where = row.createSpan({ cls: "booklet-muted booklet-listen-where" });
	// a change the reader makes is said to a screen reader, not shown twice
	const said = row.createSpan({ cls: "booklet-sr", attr: { "aria-live": "polite" } });

	let st: ListenState | null = null;
	const show = () => {
		const v = host.answerOf(t, q);
		pressed(tick, answeredOf(q, v));
		const at = st ? host.listens.view(st, v) : { pos: posIn(v), playing: false };
		where.setText(!at.playing && at.pos > 0 ? `Left off at ${clock(at.pos)}` : "");
	};
	st = host.listens.track(box, t, q, show);
	show();
	host.onShow(keyOf(t, q), show);
	tick.addEventListener("click", (evt) => {
		evt.preventDefault();
		const v = host.answerOf(t, q);
		const on = answeredOf(q, v);
		const next = listenNext(v, on ? "untick" : "tick", {}, q.left);
		if (!next) return;
		host.answer(t, q, holdsSomething(next) ? (next as AnswerValue) : undefined);
		said.setText(on ? "Marked not done" : "Marked done");
	});
	return box;
}
