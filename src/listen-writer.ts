/*
 * A `listen`'s place written into its note when no Booklet view can write it: the reader started the media, left the page, and closed
 * the note, and the media (kept playing by the now-playing bar, now-playing.ts) paused or ended after that. One writer for a place,
 * wherever it comes from: when a Booklet view shows the note and has it drawn, the change goes through that view's own write path
 * (view.ts commit: shown at once, queued behind its other writes); otherwise it is made here, on the note's fresh text, as the core's
 * `setAnswer` makes any answer, so that every byte outside the answer stays as it was written and nothing is normalised.
 */
import { Notice, type App, type MarkdownView } from "obsidian";
import { holdsSomething, listenNext, parseBooklet, RecordsWriteError, setAnswer, type AnswerValue, type ListenAt, type ListenEvent } from "./core";

const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);

/** The `pos` an answer holds, else 0 (the start). */
export function posIn(v: unknown): number {
	const p = isObj(v) ? v["pos"] : undefined;
	return typeof p === "number" && Number.isInteger(p) && p > 0 ? p : 0;
}

/** One `listen` as a Booklet view holds it (view.ts listenOf). */
export interface ViewListen {
	/** The answer the view holds, as written. */
	held: unknown;
	/** The answer is of the wrong shape: kept as written, never written over. */
	wrong: boolean;
	/** Writes an answer (undefined clears it): shown at once and queued; `written` runs when it has landed. */
	write(value: AnswerValue | undefined, written: () => void): void;
}

export interface ListenWriterDeps {
	app: App;
	/** The `listen` with this key in the note, in a Booklet view that shows the note drawn; else null. */
	viewListen(path: string, key: string): ViewListen | null;
}

/** The scope and question id of a `<scope>/<id>` key. */
const splitKey = (key: string): { scope: string; id: string } => {
	const at = key.lastIndexOf("/");
	return { scope: key.slice(0, at), id: key.slice(at + 1) };
};

export class ListenWriter {
	constructor(private readonly deps: ListenWriterDeps) {}

	/** The answer the note holds for a `listen`, as written (undefined when there is none or the note cannot be read). */
	async held(path: string, key: string): Promise<unknown> {
		const v = this.deps.viewListen(path, key);
		if (v) return v.held;
		const file = this.deps.app.vault.getFileByPath(path);
		if (!file) return undefined;
		try {
			const { scope, id } = splitKey(key);
			const a = parseBooklet(await this.deps.app.vault.cachedRead(file)).records.answers[scope];
			return a && Object.prototype.hasOwnProperty.call(a, id) ? a[id] : undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * Applies what happened to a `listen` (core/listen.ts listenNext decides what the answer becomes) to the note. Resolves true when the note
	 * holds the result, and false when it could not be written.
	 */
	async apply(path: string, key: string, ev: ListenEvent, at: ListenAt, left: number): Promise<boolean> {
		const v = this.deps.viewListen(path, key);
		if (v) {
			if (v.wrong) return true;
			const next = listenNext(v.held, ev, at, left);
			if (next === null) return true;
			return new Promise<boolean>((done) => v.write(holdsSomething(next) ? (next as AnswerValue) : undefined, () => done(true)));
		}
		const file = this.deps.app.vault.getFileByPath(path);
		if (!file) return false;
		const { scope, id } = splitKey(key);
		const change = (text: string): string => {
			const a = parseBooklet(text).records.answers[scope];
			const next = listenNext(a && Object.prototype.hasOwnProperty.call(a, id) ? a[id] : undefined, ev, at, left);
			return next === null ? text : setAnswer(text, scope, id, holdsSomething(next) ? (next as AnswerValue) : undefined);
		};
		try {
			const md = this.markdownViewOf(path);
			if (md) {
				// the note is also open as Markdown, whose editor may hold words not saved yet: the change goes into the editor as the smallest edit
				const editor = md.editor;
				const before = editor.getValue();
				const after = change(before);
				if (after !== before) {
					let p = 0;
					const max = Math.min(before.length, after.length);
					while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p++;
					let s = 0;
					while (s < max - p && before.charCodeAt(before.length - 1 - s) === after.charCodeAt(after.length - 1 - s)) s++;
					editor.replaceRange(after.slice(p, after.length - s), editor.offsetToPos(p), editor.offsetToPos(before.length - s));
				}
			} else {
				let failure: unknown = null;
				await this.deps.app.vault.process(file, (fresh) => {
					try {
						return change(fresh);
					} catch (e) {
						failure = e;
						return fresh;
					}
				});
				if (failure) throw failure;
			}
			return true;
		} catch (e) {
			const why = e instanceof Error ? e.message : String(e);
			new Notice(e instanceof RecordsWriteError ? `Booklet: ${why}` : `Booklet: the place in the media was not saved. ${why}`);
			return false;
		}
	}

	/** An open Markdown view of the note, if there is one. */
	private markdownViewOf(path: string): MarkdownView | null {
		let found: MarkdownView | null = null;
		this.deps.app.workspace.iterateAllLeaves((leaf) => {
			const v = leaf.view as Partial<MarkdownView>;
			if (!found && v.getViewType?.() === "markdown" && v.file?.path === path && v.editor) found = leaf.view as MarkdownView;
		});
		return found;
	}
}
