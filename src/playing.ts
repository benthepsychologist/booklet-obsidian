/*
 * The media element a `listen` tracks, and nothing else about it: which element it is, whether it is playing, where it is, and how it is
 * put at a place. This is the one place that notices, follows and lets go of a playing element. The view's capture listeners (view.ts
 * onload) hand every media event to listen-view.ts, which asks this file what the element is; no other code reads a media element.
 * Whether a playing episode survives a page move or a close is decided by spike S11 and is not built: it would change what `release`
 * does (move the element instead of letting it go) and nothing outside this file.
 */

/** The media events the view listens for. They do not bubble, but a capture listener on an ancestor sees them. */
export const MEDIA_EVENTS = ["loadedmetadata", "play", "pause", "ended", "timeupdate", "seeked", "error"] as const;

/** The first audio or video element in a box: the one the box's position, pauses and end are about. */
export function firstMedia(box: Element): HTMLMediaElement | null {
	return box.querySelector<HTMLMediaElement>("audio, video");
}

/**
 * The box (a `[data-booklet-listen]`) and the media element an event is about, when the element is the box's first: Obsidian's own
 * element, however late it appears, and the plugin's own, are seen the same way. Null for any other target.
 */
export function mediaEvent(evt: Event): { el: HTMLMediaElement; box: HTMLElement } | null {
	const el = evt.target as HTMLMediaElement | null;
	if (!el || (el.localName !== "audio" && el.localName !== "video")) return null;
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
