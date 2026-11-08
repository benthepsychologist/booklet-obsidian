/*
 * The data files a note's `booklet data <file.json> <key.path>` blocks name (SPEC section 7, "Rows from a file"), read through the
 * vault and nothing else: no request leaves the device. A file is only read, with one exception: apply() and applyText() below write the
 * one value of an in-place edit the reader kept, a row the reader added or a row the reader removed (see core/apply.ts), and nothing else
 * of it. A file is read once for each read, however many blocks
 * name it (each block takes its own key path from what was read, and keeps its own fence `fields`). It is read again when the
 * vault says it changed and when the pane comes back into view, and only a file whose size or time changed is read again. Whatever the
 * reader has open or scrolled is the view's (query-controls.ts); this holds the files.
 */
import { DATA_FILE_MAX, DATA_WORDS, applyAct, dataMerge, dataRead, dataVaultPath, type ApplyResult, type ApplyWhy, type DataBlock, type DataFileError, type DataFound, type DataRows } from "./core";

/** The part of Obsidian's file adapter this reads with (a `.json` file need not be in the vault's index, so the adapter and not a TFile). */
export interface DataAdapter {
	read(path: string): Promise<string>;
	stat(path: string): Promise<{ size: number; mtime: number } | null>;
	/** Reads the file, calls `fn` with its text and writes what `fn` returns, in one step (the app's own, since 1.7.2); a `fn` that throws writes nothing. */
	process(path: string, fn: (data: string) => string): Promise<string>;
}

/** What became of an act that was to be written into a data file. */
export type Applied =
	/** Written into the file. */
	| { state: "written"; name: string }
	/** The file already held the value: nothing was written. */
	| { state: "same"; name: string }
	/** Not written because of what the file holds now. */
	| { state: "refused"; why: ApplyWhy; name: string }
	/** Not written: the file cannot be written, or the block names no file in the vault. */
	| { state: "failed"; name: string };

/** Thrown inside the app's read-and-write step to make it write nothing. */
class Refused extends Error {
	constructor(readonly why: ApplyWhy | "unchanged") {
		super(why);
	}
}

/** One file as last read: its size and time when it was (`stamp`), a count of reads (`gen`), and what it held or why it could not be read. */
interface Entry {
	/** Reads that landed. */
	gen: number;
	/** The latest read begun: one overtaken by a later one is dropped. */
	ticket: number;
	stamp: string;
	state: "loading" | "ok" | "error";
	json?: unknown;
	/** The text `json` was parsed from: a read that finds the same text again changes nothing. */
	text?: string;
	error?: DataFileError;
	/** A look at the file was asked for while its first read was under way: it is looked at again when that read ends. */
	again?: boolean;
}

export class DataFiles {
	private readonly files = new Map<string, Entry>();
	/** What each (file, key path) holds, worked out once for every block that names them: dropped when the file is read again. */
	private readonly found = new Map<string, DataFound>();
	private gens = 0;
	private dead = false;

	/**
	 * `adapter` and `notePath` are asked each time (the note may be renamed, and the adapter is the app's); `changed` is called when a
	 * read lands with something new for a view to draw.
	 */
	constructor(
		private readonly adapter: () => DataAdapter | null,
		private readonly notePath: () => string | null,
		private readonly changed: () => void,
	) {}

	/** The vault path of a block's file, or null when the block names none, or one that is never read. */
	pathOf(block: DataBlock): string | null {
		const note = this.notePath();
		return block.file && !block.file.bad && note !== null ? dataVaultPath(note, block.file.name) : null;
	}

	/**
	 * What a view draws for a block that names a file: its rows, with the block's own fence `fields` over the file's, or the words of the
	 * quiet box. A file not read yet starts to be, and says so.
	 */
	rows(block: DataBlock): { data: DataRows } | { note: string } {
		const file = block.file;
		if (!file) return { data: block };
		const path = this.pathOf(block);
		if (path === null) return { note: DATA_WORDS.refused(file.name) };
		const e = this.files.get(path) ?? this.start(path);
		if (e.state === "loading") return { note: DATA_WORDS.loading(file.name) };
		if (e.state === "error") return { note: DATA_WORDS[e.error ?? "failed"](file.name) };
		const at = `${path}\n${file.path}`;
		let got = this.found.get(at);
		if (!got) {
			got = dataRead(file, e.json);
			this.found.set(at, got);
		}
		return dataMerge(got, { fields: block.fields, edits: block.edits, idFormat: block.idFormat, idPattern: block.idPattern });
	}

	/** What a view compares to know the file under a block is not the one it drew: changes when the file is read again, or lands. */
	version(block: DataBlock): string {
		const path = this.pathOf(block);
		if (path === null) return "refused";
		const e = this.files.get(path);
		return e ? `${e.gen}:${e.state}` : "unread";
	}

	/**
	 * Applies one kept edit to the file a block names, at `path` (worked out when the act was kept, from the note it was kept in; core/apply.ts): the file is read again at the moment of writing and the act is applied
	 * to that text, so a change made outside since the page drew is seen; the value's own text is replaced and no other byte changes.
	 * Nothing is written when the act cannot be applied. A file written is put in the entry at once, so every block that names it is drawn
	 * again from the new text (once: the vault's own event for the same write finds nothing new).
	 */
	async apply(block: DataBlock, path: string | null, pick: unknown, field: string, was: unknown, a: unknown, eq: (x: unknown, y: unknown) => boolean): Promise<Applied> {
		return this.applyText(block, path, (text, keyPath) => applyAct(text, keyPath, pick, field, was, a, eq));
	}

	/**
	 * Applies a change to the file a block names, at `path`: `run` is given the file's text, read at the moment of writing, and the block's
	 * key path, and says the new text or why not (core/apply.ts: an edit, an added row, a removed row). The same rules as `apply`.
	 */
	async applyText(block: DataBlock, path: string | null, run: (text: string, keyPath: string) => ApplyResult): Promise<Applied> {
		const file = block.file;
		const adapter = this.adapter();
		if (!file || path === null || !adapter) return { state: "failed", name: file ? file.name : "" };
		const name = file.name;
		let after = "";
		try {
			await adapter.process(path, (text) => {
				const r = run(text, file.path);
				if (!r.ok) throw new Refused(r.why);
				// the value is already there: nothing to write
				if (r.text === text) throw new Refused("unchanged");
				after = r.text;
				return r.text;
			});
		} catch (err) {
			if (err instanceof Refused) {
				if (err.why === "unchanged") return { state: "same", name };
				// the file is not what the page drew: it is looked at again, so the cells show what it holds now
				void this.refresh();
				return { state: "refused", why: err.why, name };
			}
			return { state: "failed", name };
		}
		await this.landWritten(adapter, path, after);
		return { state: "written", name };
	}

	/** Puts the text just written in the file's entry, as a read of it would (the read that was under way is overtaken). */
	private async landWritten(adapter: DataAdapter, path: string, text: string): Promise<void> {
		const e = this.files.get(path);
		if (!e || this.dead) return;
		if (e.state === "loading") return;
		e.ticket = ++this.gens;
		try {
			const st = await adapter.stat(path);
			const json = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as unknown;
			this.land(path, e, { state: "ok", json, text }, st ? `${st.mtime}:${st.size}` : "");
		} catch {
			// what was written could not be put in the entry: it is read again
			e.stamp = "";
			this.read(path, e);
		}
	}

	/** The vault says a file changed (or was made, removed or renamed): every file named is looked at again. */
	touched(): void {
		void this.refresh();
	}

	/** The pane came back into view, or the vault changed: each file read is looked at, and read again if its size or time changed. */
	async refresh(): Promise<void> {
		const a = this.adapter();
		if (!a) return;
		await Promise.all(
			[...this.files].map(async ([path, e]) => {
				if (e.state === "loading") {
					e.again = true;
					return;
				}
				const now = await stampOf(a, path);
				if (this.dead || this.files.get(path) !== e || e.stamp === now) return;
				this.read(path, e);
			}),
		);
	}

	/** The files are no longer wanted (the note was closed or changed): what is in flight lands nowhere. */
	reset(): void {
		this.files.clear();
		this.found.clear();
	}

	close(): void {
		this.dead = true;
		this.reset();
	}

	private start(path: string): Entry {
		const e: Entry = { gen: 0, ticket: 0, stamp: "", state: "loading" };
		this.files.set(path, e);
		this.read(path, e);
		return e;
	}

	/** Reads the file (stat, then read, then parse) and puts the outcome in the entry; a read that has been overtaken is dropped. */
	private read(path: string, e: Entry): void {
		const a = this.adapter();
		const ticket = ++this.gens;
		e.ticket = ticket;
		void (async () => {
			let out: { state: "ok"; json: unknown; text: string } | { state: "error"; error: DataFileError };
			let stamp = "";
			try {
				if (!a) throw new Error("no adapter");
				const st = await a.stat(path);
				if (!st) {
					stamp = "missing";
					out = { state: "error", error: "missing" };
				} else {
					stamp = `${st.mtime}:${st.size}`;
					if (st.size > DATA_FILE_MAX) out = { state: "error", error: "big" };
					else {
						const text = await a.read(path);
						if (text.length > DATA_FILE_MAX) out = { state: "error", error: "big" };
						else {
							try {
								// a byte order mark some Windows tools write is no part of the JSON (the reference reads through fetch, which drops it)
								out = { state: "ok", json: JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as unknown, text };
							} catch {
								out = { state: "error", error: "wrong" };
							}
						}
					}
				}
			} catch {
				out = { state: "error", error: "failed" };
			}
			if (this.dead || this.files.get(path) !== e || e.ticket !== ticket) return;
			// a look asked for while the first read was under way is made now: the stamp held is from before the file was read
			const again = e.again;
			e.again = false;
			this.land(path, e, out, stamp);
			if (again) void this.refresh();
		})();
	}

	/** Puts the outcome of a read in the entry, and tells the views if it is something new to draw. */
	private land(path: string, e: Entry, out: { state: "ok"; json: unknown; text: string } | { state: "error"; error: DataFileError }, stamp: string): void {
		// A read that fails leaves good data as it is (the data is not the reader's work, and a half-written file or a flicker of the
		// disk is not news): the rows already drawn stay. Nothing is kept of the stamp, so the next look at the file reads it again.
		if (e.state === "ok" && out.state === "error") {
			e.stamp = "";
			return;
		}
		e.stamp = stamp;
		// the same text, or the same way of failing, as the last read: nothing new to draw (a generator that rewrites an identical file
		// must not redraw every query on it, which would interrupt a selection in an open part)
		if (out.state === "ok" ? e.state === "ok" && e.text === out.text : e.state === "error" && e.error === out.error) return;
		e.gen++;
		e.state = out.state;
		e.json = out.state === "ok" ? out.json : undefined;
		e.text = out.state === "ok" ? out.text : undefined;
		e.error = out.state === "error" ? out.error : undefined;
		for (const k of [...this.found.keys()]) if (k.startsWith(`${path}\n`)) this.found.delete(k);
		this.changed();
	}
}

async function stampOf(a: DataAdapter, path: string): Promise<string> {
	try {
		const st = await a.stat(path);
		return st ? `${st.mtime}:${st.size}` : "missing";
	} catch {
		return "failed";
	}
}
