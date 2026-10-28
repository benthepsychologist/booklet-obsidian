/*
 * Words typed in Add your own or a widget's field and not yet added, kept on the device by note (SPEC section 5: words
 * typed and not yet added are added, exactly as Enter or Add would add them, when the page is closed or reloaded).
 * Closing the window and quitting give the plugin time to add them to the note (main.ts, the workspace's "quit"
 * event). A reload does not: Obsidian reloads the page at once and waits for no write. So every keystroke in such a
 * field is also kept here, in the vault's own local storage, and the next time the note is drawn the words are added
 * as leaving the field would add them. Nothing here is a record: it never goes in the note, and it is taken out as
 * soon as the words are added.
 */
import type { App } from "obsidian";

const PREFIX = "booklet-held:";

type Held = Record<string, string>;

/** The vault-specific store: Obsidian's (since 1.8.7), else the window's, by the vault's name. */
interface Store {
	load(key: string): unknown;
	save(key: string, data: unknown): void;
}

function storeOf(app: App): Store | null {
	const a = app as Partial<Pick<App, "loadLocalStorage" | "saveLocalStorage">> & App;
	if (typeof a.loadLocalStorage === "function" && typeof a.saveLocalStorage === "function")
		return { load: (k) => a.loadLocalStorage(k), save: (k, d) => a.saveLocalStorage(k, d) };
	const ls = (() => {
		try {
			return typeof window !== "undefined" ? window.localStorage : null;
		} catch {
			return null;
		}
	})();
	const vault = typeof app.vault?.getName === "function" ? app.vault.getName() : "";
	if (!ls) return null;
	return {
		load: (k) => {
			const s = ls.getItem(`${vault}:${k}`);
			try {
				return s === null ? null : (JSON.parse(s) as unknown);
			} catch {
				return null;
			}
		},
		save: (k, d) => (d === null ? ls.removeItem(`${vault}:${k}`) : ls.setItem(`${vault}:${k}`, JSON.stringify(d))),
	};
}

/** The words held for a note, by field. */
export function loadHeld(app: App, path: string): Held {
	const out = Object.create(null) as Held;
	try {
		const v = storeOf(app)?.load(PREFIX + path);
		if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, w] of Object.entries(v as Record<string, unknown>)) if (typeof w === "string" && w.trim()) out[k] = w;
	} catch {
		// a store that cannot be read holds nothing
	}
	return out;
}

/** The words held for one field of a note set, or taken out when `words` holds nothing. */
export function keepHeld(app: App, path: string, field: string, words: string): void {
	try {
		const store = storeOf(app);
		if (!store) return;
		const now = loadHeld(app, path);
		if (words.trim()) now[field] = words;
		else delete now[field];
		store.save(PREFIX + path, Object.keys(now).length ? now : null);
	} catch {
		// a store that cannot be written keeps nothing: the words are still added when the field is left
	}
}

/** A note renamed or moved: its held words go with it. */
export function moveHeld(app: App, from: string, to: string): void {
	try {
		const store = storeOf(app);
		if (!store) return;
		const held = loadHeld(app, from);
		if (!Object.keys(held).length) return;
		store.save(PREFIX + from, null);
		store.save(PREFIX + to, { ...loadHeld(app, to), ...held });
	} catch {
		// as above
	}
}
