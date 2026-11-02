/*
 * The media element a `listen` tracks, and nothing else about it: which element it is, whether it is playing, where it is, and how it is
 * put at a place. This is the one place that notices, follows and lets go of a playing element for a view. The view's capture listeners
 * (view.ts onload) hand every media event to listen-view.ts, which asks this file what the element is. The now-playing bar (now-playing.ts)
 * reads an element too, once it holds it: its position to keep and write, its state to put it back; it asks this file only which element
 * is a box's media.
 */

/** The media events the view listens for. They do not bubble, but a capture listener on an ancestor sees them. */
export const MEDIA_EVENTS = ["loadedmetadata", "play", "pause", "ended", "timeupdate", "seeked", "error"] as const;

/** What stands in a page where the bar holds the element that was there (now-playing.ts). */
export const HERE_CLASS = "booklet-nowplaying-here";

/**
 * What a `listen` box draws its media into (listen-view.ts drawListen): the one embed or link it holds. A second embed in the help is
 * not its media, and a press on it is nothing to the `listen`.
 */
const MEDIA_PART = ".booklet-listen-media";

/** The first thing in a box's media part that is a media element or stands for one the bar holds; null when there is none. */
function mediaSlot(box: Element): Element | null {
	return box.querySelector(`${MEDIA_PART} audio, ${MEDIA_PART} video, ${MEDIA_PART} .${HERE_CLASS}`);
}

/**
 * The media element a box is about: the first in its media part. When the bar holds that element (a placeholder stands in its place),
 * or the media part has none, the box has no element in the page: null, and the help's embeds never take its place.
 */
export function firstMedia(box: Element): HTMLMediaElement | null {
	const slot = mediaSlot(box);
	return slot && (slot.localName === "audio" || slot.localName === "video") ? (slot as HTMLMediaElement) : null;
}

/**
 * The box (a `[data-booklet-listen]`) and the media element an event is about, when the element is the box's first: Obsidian's own
 * element, however late it appears, and the plugin's own, are seen the same way. Null for any other target. An element lifted out
 * of its box (now-playing.ts) is in no box, so the box it came from is `home`; it counts as that box's media only while a placeholder
 * stands first in the box's media part, which is where the bar left the box's own element (one lifted from the help is not that).
 */
export function mediaEvent(evt: Event, home?: HTMLElement): { el: HTMLMediaElement; box: HTMLElement } | null {
	const el = evt.target as HTMLMediaElement | null;
	if (!el || (el.localName !== "audio" && el.localName !== "video")) return null;
	if (home) return mediaSlot(home)?.classList.contains(HERE_CLASS) ? { el, box: home } : null;
	const box = el.closest<HTMLElement>("[data-booklet-listen]");
	return box && firstMedia(box) === el ? { el, box } : null;
}

/** One listen's media, as far as the view follows it. */
export class Track {
	/** The element whose events count now: the box's first, as the last event named it. */
	el: HTMLMediaElement | null = null;
	/** Its metadata has been seen, so the place it starts at has been set. */
	ready = false;

	/** An event from `el`: it is followed from here on, and a new element (the box was drawn again, a player was made) starts unready. */
	adopt(el: HTMLMediaElement): void {
		if (this.el === el) return;
		this.el = el;
		this.ready = false;
	}

	/** Is it playing now: in the page, not paused, not at its end? (The element's own state, so a missed event cannot hold the view back.) */
	get live(): boolean {
		const el = this.el;
		return !!el && el.isConnected && !el.paused && !el.ended;
	}

	/** Where it is, in whole seconds. */
	get second(): number {
		return this.el ? Math.floor(this.el.currentTime) : NaN;
	}

	/** Its length in seconds; NaN until its metadata is in, Infinity for a stream. */
	get length(): number {
		return this.el ? this.el.duration : NaN;
	}

	get ended(): boolean {
		return !!this.el && this.el.ended;
	}

	/** Can it be put at a place? Only once its length is known. */
	get seekable(): boolean {
		return !!this.el && this.el.isConnected && Number.isFinite(this.el.duration);
	}

	/** Puts it at `sec` seconds. */
	seek(sec: number): void {
		if (this.el) this.el.currentTime = sec;
	}

	/** The drawing it belongs to is going: the element is let go of, never paused here (the page being left stops it). */
	release(): void {
		this.el = null;
		this.ready = false;
	}
}
