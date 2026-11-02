/*
 * What the device keeps for a `listen` and for Continue, never the note's (SPEC section 5, "Listen", renderer notes; section 12). The file
 * syncs between devices, so a `listen`'s position is written into it only when playback pauses or ends, when the reader leaves the page
 * and when the app quits. While media plays, each whole second is kept here instead, by note, so that a kill (the one stop no hook sees)
 * loses less: the next start finds the entry and adds it to the note. How much less is the browser's, not ours. Chromium commits
 * `localStorage` to disk late, so a hard kill finds the last value it committed, not the last one written. Measured in the real app
 * (e2e check 51, Obsidian 1.14.5): on a profile's first launch nothing survived a kill at 3 to 29 s of playback; on a second launch the
 * value that survived was about 3 s old. It is the vault-specific store Obsidian keeps for
 * each vault (`app.loadLocalStorage`, since 1.8.7), the one held-store.ts uses: never synced, and the device's.
 *
 *   booklet-listen:<path>   { "<scope>/<id>": { pos, base } } for a position not written yet. `base` is the `pos` the note held when
 *                           the session began: if the note holds another at the next start, another device wrote since, and the note
 *                           wins. An entry is taken out as soon as the position is in the note.
 *   booklet-place:<path>    the furthest page the reader has reached in the note on this device, as `pageIndexOf` counts pages
 *                           (Continue starts after it). A hint: Continue never goes back for one.
 */
import type { App } from "obsidian";

const LISTEN = "booklet-listen:";
const PLACE = "booklet-place:";

/** A position kept and not yet in the note, and the position the note held when the session began. */
export interface ListenKept {
	pos: number;
	base: number;
}

const isWhole = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;

/** The positions held for a note, by `<scope>/<id>`. An entry that is not a pair of whole numbers is not one. */
export function loadListens(app: App, path: string): Record<string, ListenKept> {
	const out = Object.create(null) as Record<string, ListenKept>;
	try {
		const v = app.loadLocalStorage(LISTEN + path) as unknown;
		if (v && typeof v === "object" && !Array.isArray(v))
			for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
				const o = e as { pos?: unknown; base?: unknown } | null;
				if (o && typeof o === "object" && isWhole(o.pos) && isWhole(o.base)) out[k] = { pos: o.pos, base: o.base };
			}
	} catch {
		// a store that cannot be read holds nothing
	}
	return out;
}

/** Keeps the position of one `listen` of a note. */
export function keepListen(app: App, path: string, key: string, kept: ListenKept): void {
	try {
		app.saveLocalStorage(LISTEN + path, { ...loadListens(app, path), [key]: kept });
	} catch {
		// a store that cannot be written keeps nothing: the position is still written when playback pauses
	}
}

/** Takes the entry of one `listen` out: its position is in the note now, or the note's is the newer. */
export function dropListen(app: App, path: string, key: string): void {
	try {
		const now = loadListens(app, path);
		if (!(key in now)) return;
		delete now[key];
		app.saveLocalStorage(LISTEN + path, Object.keys(now).length ? now : null);
	} catch {
		// as above
	}
}

/** The furthest page reached in a note on this device, else null. */
export function loadFurthest(app: App, path: string): number | null {
	try {
		const v = app.loadLocalStorage(PLACE + path) as unknown;
		return isWhole(v) ? v : null;
	} catch {
		return null;
	}
}

/** Keeps the furthest page reached, if `index` is further than the one kept. */
export function keepFurthest(app: App, path: string, index: number): void {
	try {
		const was = loadFurthest(app, path);
		if (was === null || index > was) app.saveLocalStorage(PLACE + path, index);
	} catch {
		// a store that cannot be written keeps no place: Continue then works from the note's records
	}
}

/** A note renamed or moved: what the device keeps for it goes with it, as held words do (held-store.ts moveHeld). */
export function moveDevice(app: App, from: string, to: string): void {
	try {
		const kept = loadListens(app, from);
		if (Object.keys(kept).length) {
			app.saveLocalStorage(LISTEN + from, null);
			app.saveLocalStorage(LISTEN + to, { ...loadListens(app, to), ...kept });
		}
		const furthest = loadFurthest(app, from);
		if (furthest !== null) {
			app.saveLocalStorage(PLACE + from, null);
			keepFurthest(app, to, furthest);
		}
	} catch {
		// as above
	}
}
