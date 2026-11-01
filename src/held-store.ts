/*
 * Words typed in Add your own or a widget's field and not yet added, kept on the device by note (SPEC section 5: words
 * typed and not yet added are added, exactly as Enter or Add would add them, when the page is closed or reloaded).
 * Closing the window and quitting give the plugin time to add them to the note (main.ts, the workspace's "quit"
 * event). A reload does not: Obsidian reloads the page at once and waits for no write. So every keystroke in such a
 * field is also kept here, in the vault's own local storage, and the next time the note is drawn the words are added
 * as leaving the field would add them. Nothing here is a record: it never goes in the note, and it is taken out as
 * soon as the words are added. The same store keeps one more thing of the reader's, never the note's: whether the steps of
 * a note's parts show one at a time (SPEC section 12), by note. It is the vault-specific store Obsidian keeps for each vault
 * (`app.loadLocalStorage`, since 1.8.7): never synced, and the device's.
 */
import type { App } from "obsidian";

const PREFIX = "booklet-held:";

type Held = Record<string, string>;

/** The words held for a note, by field. */
export function loadHeld(app: App, path: string): Held {
	const out = Object.create(null) as Held;
	try {
		const v = app.loadLocalStorage(PREFIX + path) as unknown;
		if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, w] of Object.entries(v as Record<string, unknown>)) if (typeof w === "string" && w.trim()) out[k] = w;
	} catch {
		// a store that cannot be read holds nothing
	}
	return out;
}

/** The words held for one field of a note set, or taken out when `words` holds nothing. */
export function keepHeld(app: App, path: string, field: string, words: string): void {
	try {
		const now = loadHeld(app, path);
		if (words.trim()) now[field] = words;
		else delete now[field];
		app.saveLocalStorage(PREFIX + path, Object.keys(now).length ? now : null);
	} catch {
		// a store that cannot be written keeps nothing: the words are still added when the field is left
	}
}

/** A note renamed or moved: its held words go with it, and so does the choice of its steps. */
export function moveHeld(app: App, from: string, to: string): void {
	try {
		const held = loadHeld(app, from);
		if (Object.keys(held).length) {
			app.saveLocalStorage(PREFIX + from, null);
			app.saveLocalStorage(PREFIX + to, { ...loadHeld(app, to), ...held });
		}
		if (loadStepsOne(app, from)) {
			keepStepsOne(app, from, false);
			keepStepsOne(app, to, true);
		}
	} catch {
		// as above
	}
}

/** Do the steps of a note's parts show one at a time? The reader's choice for this note on this device, never part of the note. */
export function loadStepsOne(app: App, path: string): boolean {
	try {
		return app.loadLocalStorage(`booklet-steps:${path}`) === "one";
	} catch {
		return false;
	}
}

export function keepStepsOne(app: App, path: string, one: boolean): void {
	try {
		app.saveLocalStorage(`booklet-steps:${path}`, one ? "one" : null);
	} catch {
		// a store that cannot be written keeps the choice for this drawing only
	}
}
