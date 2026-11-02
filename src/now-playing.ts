/*
 * Playback that outlives its page (plan point 12). Obsidian stops the media of a note when the page moves, another note opens in the pane
 * or the note closes (spike S11); the one thing that keeps a native audio or video element playing is to move it, in one synchronous
 * task, into an element of `document.body`. Nothing but the element's own `play` event is early enough for a close, so the view hands
 * every `play` here (view.ts onload). This file is the "now playing" bar that holds the element, and the rest of its life:
 *
 *   - lift: at the press, the element moves into a bar fixed at the bottom of the window, with its native controls, a label, "Back to the
 *     page" and "Close". A placeholder stays where it was, so the page does not look emptied. Obsidian's player is not replaced, and the
 *     plugin holds no `Audio` of its own.
 *   - put it back: when a drawing makes a slot for the same media (the note's path and the source address, less the `?mtime` Obsidian adds),
 *     a paused element takes the new slot's place and the bar lets go of it; one that plays stays in the bar and the slot shows the
 *     placeholder (an element never stays in a page while it plays: removing it from the page stops it, and a page can go at any time).
 *   - stop and end: the end writes once and lets the element go; a pause writes her place and leaves it in the bar until she closes it or
 *     returns; closing the plugin pauses, writes and removes the bar.
 *   - events after the lift: the view's capture listeners no longer see the element, so it carries its own listeners. While a view still
 *     follows the box it came from (`from.follow`), the event goes to that view; otherwise this file keeps the position on the device and
 *     writes it through the plugin-level writer (listen-writer.ts), which uses a view's write path when one shows the note.
 *
 * A framed player (an iframe: a video service) cannot move without reloading, so it is never lifted and stops with its page.
 */
import type { App } from "obsidian";
import type { ListenEvent } from "./core";
import type { ListenWriter } from "./listen-writer";
import { posIn } from "./listen-writer";
import { dropListen, keepListen } from "./listen-store";
import { MEDIA_EVENTS, Track } from "./playing";

/** What a view tells the bar about the page an element is in. */
export interface LiftFrom {
	/** The note the page is of. */
	path: string | null;
	/** The view's state at that page (view.getState()): the way back to it. */
	state: Record<string, unknown>;
	/** The `listen` followed in a box, else null. */
	about(box: HTMLElement): { key: string; left: number } | null;
	/** Hands the view an event of an element lifted out of `box`; false when the view follows nothing in it now (closed, or drawn again). */
	follow(evt: Event, box: HTMLElement): boolean;
}

/** A page's source of the above, made when something needs it. */
export type FromSource = () => LiftFrom;

export interface NowPlayingDeps {
	app: App;
	writer: ListenWriter;
	/** Opens the note at the page (main.ts showPage); `state` is a view state. */
	showPage(path: string, state: Record<string, unknown>): void;
}

interface Entry {
	el: HTMLMediaElement;
	key: string;
	path: string | null;
	label: string;
	from: LiftFrom;
	track: Track;
	/** Its row in the bar: null while it is in a page. */
	item: HTMLElement | null;
	/** What stands where it was in the page; null when nothing does. */
	here: HTMLElement | null;
	/** The `listen` it is the media of, as last told. */
	listen: { key: string; left: number } | null;
	/** The whole second noted for the device store, and whether it is in the note yet. */
	pos: number;
	dirty: boolean;
	/** The `pos` the note held when this session's first position was noted. */
	base: number | null;
	reading: boolean;
	/** The reader closed it: events of the element itself no longer count (the ones made here do). */
	closing: boolean;
	listeners: [string, (evt: Event) => void][];
}

interface Bar {
	root: HTMLElement;
	live: HTMLElement;
}

const MEDIA = "audio, video";
const BOX = "[data-booklet-listen]";
const HERE = "Its player is in the bar at the bottom of the window.";

/** The file name at the end of an address, as a reader would say it. */
function fileName(src: string): string {
	const tail = src.replace(/[?#].*$/, "").split("/").pop() ?? "";
	try {
		return decodeURIComponent(tail);
	} catch {
		return tail;
	}
}

/** The key two elements of one media share: the note and the address, less the hash and the `?<mtime>` Obsidian adds to a vault file. */
function keyOf(path: string | null, src: string | null): string | null {
	return src ? `${path ?? ""}\n${src.replace(/#.*$/, "").replace(/\?\d+$/, "")}` : null;
}

const isMedia = (n: EventTarget | null): n is HTMLMediaElement => !!n && (n as Element).localName !== undefined && ((n as Element).localName === "audio" || (n as Element).localName === "video");

export class NowPlaying {
	private byEl = new Map<HTMLMediaElement, Entry>();
	private byKey = new Map<string, Entry>();
	private bars = new Map<Document, Bar>();
	/** Events this file made itself (a pause for a Close): they count where the element's own do not. */
	private mine = new WeakSet<Event>();
	private gone = false;

	constructor(private readonly deps: NowPlayingDeps) {}

	/** Is this element held in the bar (and so to be left alone as its page goes)? */
	holds(el: HTMLElement): boolean {
		const e = isMedia(el) ? this.byEl.get(el) : undefined;
		return !!e && e.item !== null;
	}

	/** Is anything in the bar playing or holding a position not in the note yet? (main.ts: the quit hook waits for the write.) */
	unsaved(): boolean {
		for (const e of this.byEl.values()) if (e.item && e.listen && (e.dirty || e.track.live)) return true;
		return false;
	}

	/**
	 * The element's own `play` (the view's capture listener): the element moves into the bar in this very task. A placeholder takes its
	 * place in the page. An element that plays from the bar already, or is not audio or video, is left alone.
	 */
	lift(evt: Event, source: FromSource): void {
		const el = evt.target;
		if (this.gone || !isMedia(el) || !el.isConnected) return;
		const known = this.byEl.get(el);
		if (known?.item) return;
		const from = source();
		const doc = el.ownerDocument;
		const had = doc.activeElement === el;
		const e = known ?? this.make(el, from);
		e.from = from;
		e.closing = false;
		const box = el.closest<HTMLElement>(BOX);
		if (box) e.listen = from.about(box) ?? e.listen;
		e.label = this.labelOf(el, box);
		e.track.adopt(el);
		e.pos = Math.floor(el.currentTime) || 0;
		e.dirty = false;
		e.base = null;
		const bar = this.barOf(doc);
		const item = this.itemOf(doc, e);
		// one synchronous task from here: a gap that yields to the event loop would pause the element
		const here = doc.createElement("span");
		here.className = "booklet-nowplaying-here";
		here.tabIndex = -1;
		here.textContent = HERE;
		el.before(here);
		bar.root.appendChild(item);
		item.insertBefore(el, item.querySelector(".booklet-nowplaying-back"));
		e.item = item;
		e.here = here;
		this.say(bar, e.label);
		if (had) el.focus({ preventScroll: true });
	}

	/**
	 * A drawing has made media in `root` (the Markdown renderer's, however late): where it is the media of one the bar holds, the bar's
	 * takes its place (a paused one) or a placeholder does (one that plays).
	 */
	restore(root: Element, source: FromSource): void {
		if (!this.byKey.size) return;
		const found = root.matches(MEDIA) ? [root] : Array.from(root.querySelectorAll(MEDIA));
		for (const m of found) {
			if (!isMedia(m) || this.byEl.has(m)) continue;
			const from = source();
			const e = this.byKey.get(keyOf(from.path, m.getAttribute("src")) ?? "");
			const node = e && this.claim(e, from);
			if (node) m.replaceWith(node);
		}
	}

	/** A slot is drawn for media at `src` in the note at `path`: the node that stands for the media the bar holds, else null (media-view.ts). */
	take(src: string, source: FromSource): HTMLElement | null {
		if (!this.byKey.size) return null;
		const from = source();
		const e = this.byKey.get(keyOf(from.path, src) ?? "");
		return (e && this.claim(e, from)) ?? null;
	}

	/** The pause and write of every element in the bar that plays or holds a position, for the quit hook. */
	async flush(): Promise<void> {
		const done: Promise<unknown>[] = [];
		for (const e of this.byEl.values()) if (e.item && e.listen && (e.dirty || e.track.live)) done.push(this.settle(e, "pause"));
		await Promise.all(done);
	}

	/** The plugin unloads: whatever plays is paused and its place written, and the bars go. */
	dispose(): void {
		this.gone = true;
		for (const e of [...this.byEl.values()]) {
			if (e.item && e.listen && (e.dirty || e.track.live)) void this.settle(e, "pause");
			if (e.item) e.el.pause();
			this.forget(e);
		}
		for (const [doc, b] of this.bars) {
			b.root.remove();
			doc.body.classList.remove("booklet-has-nowplaying");
		}
		this.bars.clear();
	}

	/* ---- the entry and its row ---- */

	private make(el: HTMLMediaElement, from: LiftFrom): Entry {
		const key = keyOf(from.path, el.getAttribute("src")) ?? `\n${Math.random()}`;
		const e: Entry = { el, key, path: from.path, label: "", from, track: new Track(), item: null, here: null, listen: null, pos: 0, dirty: false, base: null, reading: false, closing: false, listeners: [] };
		for (const type of MEDIA_EVENTS) {
			const h = (evt: Event) => this.onEvent(e, evt);
			el.addEventListener(type, h);
			e.listeners.push([type, h]);
		}
		this.byEl.set(el, e);
		this.byKey.set(key, e);
		return e;
	}

	/** What names the media: the prompt of its `listen`, the words of its embed, its player's name, else its file. */
	private labelOf(el: HTMLMediaElement, box: HTMLElement | null): string {
		const plain = el.getAttribute("data-booklet-player") ? el.getAttribute("aria-label") : null;
		const named = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
		const generic = (s: string) => s === "Audio" || s === "Video";
		return (
			named(box?.querySelector(".booklet-prompt")?.textContent) ||
			named(el.closest(".internal-embed")?.getAttribute("alt")) ||
			(plain && !generic(named(plain)) ? named(plain) : "") ||
			fileName(el.getAttribute("src") ?? "") ||
			(el.localName === "video" ? "Video" : "Audio")
		);
	}

	private barOf(doc: Document): Bar {
		let bar = this.bars.get(doc);
		if (bar?.root.isConnected) return bar;
		const root = doc.createElement("div");
		root.className = "booklet-nowplaying";
		root.setAttribute("role", "region");
		root.setAttribute("aria-label", "Now playing");
		const live = root.createDiv({ cls: "booklet-sr", attr: { "aria-live": "polite" } });
		bar = { root, live };
		this.bars.set(doc, bar);
		doc.body.appendChild(root);
		doc.body.classList.add("booklet-has-nowplaying");
		return bar;
	}

	private say(bar: Bar, label: string): void {
		bar.live.textContent = `Now playing: ${label}`;
	}

	/** A row of the bar: the label, then (where the element goes) the two buttons. */
	private itemOf(doc: Document, e: Entry): HTMLElement {
		const item = doc.createElement("div");
		item.className = "booklet-nowplaying-item";
		item.setAttribute("role", "group");
		const labelId = `booklet-nowplaying-${++uid}`;
		item.setAttribute("aria-labelledby", labelId);
		item.createSpan({ cls: "booklet-nowplaying-label", text: e.label, attr: { id: labelId } });
		const back = item.createEl("button", { cls: "booklet-nowplaying-back", text: "Back to the page", attr: { type: "button", "aria-describedby": labelId } });
		const close = item.createEl("button", { cls: "booklet-nowplaying-close", text: "Close", attr: { type: "button", "aria-describedby": labelId } });
		back.addEventListener("click", () => this.back(e));
		close.addEventListener("click", () => this.close(e));
		return item;
	}

	/* ---- putting it back ---- */

	/**
	 * What takes the place of fresh media for an entry in a drawing that is now the page, else null (nothing does: it is somewhere
	 * already, or it is gone). Binds the entry to that page's view.
	 */
	private claim(e: Entry, from: LiftFrom): HTMLElement | null {
		if (e.here?.isConnected) return null;
		if (e.item) {
			e.from = from;
			if (this.playing(e)) {
				const here = e.el.ownerDocument.createElement("span");
				here.className = "booklet-nowplaying-here";
				here.tabIndex = -1;
				here.textContent = HERE;
				e.here = here;
				return here;
			}
			this.leaveBar(e);
			return e.el;
		}
		// paused and left behind by a page that is gone
		if (e.el.isConnected) return null;
		e.from = from;
		return e.el;
	}

	/** Is it playing now: not paused, not at its end? */
	private playing(e: Entry): boolean {
		return !e.el.paused && !e.el.ended;
	}

	/** The row of an entry leaves the bar (the element has been, or is being, put in a page). */
	private leaveBar(e: Entry): void {
		const doc = e.el.ownerDocument;
		e.item?.remove();
		e.item = null;
		e.here = null;
		this.tidy(doc);
	}

	/** The bar goes when it holds no row. */
	private tidy(doc: Document): void {
		const bar = this.bars.get(doc);
		if (!bar || bar.root.querySelector(".booklet-nowplaying-item")) return;
		bar.root.remove();
		this.bars.delete(doc);
		doc.body.classList.remove("booklet-has-nowplaying");
	}

	/** An entry is done with: its listeners go, and the element too, unless a placeholder stands for it in a page that is showing. */
	private release(e: Entry): void {
		const doc = e.el.ownerDocument;
		if (e.here?.isConnected) e.here.replaceWith(e.el);
		else e.el.remove();
		e.item?.remove();
		e.item = null;
		e.here = null;
		this.forget(e);
		this.tidy(doc);
	}

	private forget(e: Entry): void {
		for (const [type, h] of e.listeners) e.el.removeEventListener(type, h);
		e.listeners = [];
		this.byEl.delete(e.el);
		if (this.byKey.get(e.key) === e) this.byKey.delete(e.key);
	}

	/* ---- the buttons ---- */

	/** "Back to the page": the page is showing, so the element returns to it (or the placeholder is shown, if it plays); else the note is opened at the page. */
	private back(e: Entry): void {
		if (e.here?.isConnected) {
			if (this.playing(e)) {
				e.here.scrollIntoView?.({ block: "nearest" });
				e.here.focus();
				return;
			}
			const doc = e.el.ownerDocument;
			e.here.replaceWith(e.el);
			this.leaveBar(e);
			doc.defaultView?.setTimeout(() => e.el.focus(), 0);
			return;
		}
		if (e.path) this.deps.showPage(e.path, e.from.state);
	}

	/** "Close": paused, her place written, and the row gone; the element returns to the page if the page is showing. */
	private close(e: Entry): void {
		if (!e.item) return;
		const doc = e.el.ownerDocument;
		const was = !e.el.paused;
		e.closing = true;
		e.el.pause();
		if (was) {
			const evt = new Event("pause");
			this.mine.add(evt);
			e.el.dispatchEvent(evt);
		}
		const back = !!e.here?.isConnected;
		// the entry goes with the row: a later press on the element in the page lifts it afresh
		const el = e.el;
		this.release(e);
		if (back) el.focus();
		else doc.defaultView?.setTimeout(() => doc.body.focus?.(), 0);
	}

	/* ---- the element's events, from the bar ---- */

	private onEvent(e: Entry, evt: Event): void {
		if (!e.item || (e.closing && !this.mine.has(evt))) return;
		const box = e.here?.isConnected ? e.here.closest<HTMLElement>(BOX) : null;
		if (box) e.listen = e.from.about(box) ?? e.listen;
		if (!(box && e.from.follow(evt, box))) this.headless(e, evt);
		if (evt.type === "ended") this.release(e);
		else if (evt.type === "error") this.failed(e);
	}

	/** No view follows the box it came from: the device store keeps the position as it plays, and the writer puts it in the note. */
	private headless(e: Entry, evt: Event): void {
		if (!e.listen || !e.path) return;
		switch (evt.type) {
			case "timeupdate":
			case "seeked":
				this.note(e);
				break;
			case "pause":
				if (!e.el.ended) void this.settle(e, "pause");
				break;
			case "ended":
				void this.settle(e, "end");
				break;
		}
	}

	/** The element is at a second: kept on the device when it is a new one. Nothing goes into the note. */
	private note(e: Entry): void {
		const sec = e.track.second;
		if (!Number.isFinite(sec) || sec < 0 || sec === e.pos || !e.path || !e.listen) return;
		e.pos = sec;
		e.dirty = true;
		if (e.base !== null) return this.keep(e);
		if (e.reading) return;
		// the first position of the session: the note's own is what a later start compares with (listen-store.ts)
		e.reading = true;
		const { path, listen } = e;
		void this.deps.writer.held(path, listen.key).then((v) => {
			e.reading = false;
			if (e.base === null) e.base = posIn(v);
			this.keep(e);
		});
	}

	private keep(e: Entry): void {
		if (e.path && e.listen && e.base !== null) keepListen(this.deps.app, e.path, e.listen.key, { pos: e.pos, base: e.base });
	}

	/** Writes what the element says into the note; the device store's entry is taken out once it landed, unless a newer position was noted. */
	private settle(e: Entry, ev: ListenEvent): Promise<boolean> {
		const { path, listen, el } = e;
		if (!path || !listen) return Promise.resolve(true);
		e.dirty = false;
		e.base = null;
		e.pos = ev === "end" ? 0 : Math.floor(el.currentTime) || 0;
		return this.deps.writer.apply(path, listen.key, ev, ev === "end" ? {} : { pos: el.currentTime, duration: el.duration }, listen.left).then((ok) => {
			if (ok && !e.dirty) dropListen(this.deps.app, path, listen.key);
			return ok;
		});
	}

	/** The media failed after it was lifted: the row goes, and the page is left as its own drawing has it. */
	private failed(e: Entry): void {
		// a player the plugin made shows its own error and Play button in the page; Obsidian's element is put back to show its own state
		if (e.el.hasAttribute("data-booklet-player")) e.here?.remove();
		this.release(e);
	}
}

let uid = 0;
