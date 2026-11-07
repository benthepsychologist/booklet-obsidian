/*
 * The data files a note's `booklet data <file.json> <key.path>` blocks name (SPEC section 7, "Rows from a file"), read through the
 * vault and nothing else: no request leaves the device, and nothing is written. A file is read once for each read, however many blocks
 * name it (each block takes its own key path from what was read, and keeps its own fence `fields`). It is read again when the
 * vault says it changed and when the pane comes back into view, and only a file whose size or time changed is read again. Whatever the
 * reader has open or scrolled is the view's (query-controls.ts); this holds the files.
 */
import { DATA_FILE_MAX, DATA_WORDS, dataMerge, dataRead, dataVaultPath, type DataBlock, type DataFileError, type DataFound, type DataRows } from "./core";

/** The part of Obsidian's file adapter this reads with (a `.json` file need not be in the vault's index, so the adapter and not a TFile). */
export interface DataAdapter {
	read(path: string): Promise<string>;
	stat(path: string): Promise<{ size: number; mtime: number } | null>;
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
	error?: DataFileError;
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
		return dataMerge(got, { fields: block.fields, edits: block.edits });
	}

	/** What a view compares to know the file under a block is not the one it drew: changes when the file is read again, or lands. */
	version(block: DataBlock): string {
		const path = this.pathOf(block);
		if (path === null) return "refused";
		const e = this.files.get(path);
		return e ? `${e.gen}:${e.state}` : "unread";
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
				if (e.state === "loading") return;
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
			let out: { state: "ok"; json: unknown } | { state: "error"; error: DataFileError };
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
								out = { state: "ok", json: JSON.parse(text) as unknown };
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
			e.gen++;
			e.stamp = stamp;
			e.state = out.state;
			e.json = out.state === "ok" ? out.json : undefined;
			e.error = out.state === "error" ? out.error : undefined;
			for (const k of [...this.found.keys()]) if (k.startsWith(`${path}\n`)) this.found.delete(k);
			this.changed();
		})();
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
