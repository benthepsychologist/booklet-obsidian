/*
 * A `listen`'s place written into its note when no Booklet view can write it: the reader started the media, left the page, and closed
 * the note, and the media (kept playing by the now-playing bar, now-playing.ts) paused or ended after that. One writer for a place,
 * wherever it comes from: when a Booklet view shows the note and has it drawn, the change goes through that view's own write path
 * (view.ts commit: shown at once, queued behind its other writes); otherwise it is made here, on the note's fresh text, as the core's
 * `setAnswer` makes any answer, so that every byte outside the answer stays as it was written and nothing is normalised.
 */
import { Notice, type App } from "obsidian";
import { holdsSomething, listenNext, parseBooklet, RecordsWriteError, setAnswer, splitKey, type AnswerValue, type ListenAt, type ListenEvent } from "./core";
import { markdownViewOf, replaceInEditor } from "./markdown-view";

/** One `listen` as a Booklet view holds it (view.ts listenOf). */
export interface ViewListen {
	/** The answer the view holds, as written. */
	held: unknown;
	/** The answer is of the wrong shape: kept as written, never written over. */
	wrong: boolean;
	/** Writes an answer (undefined clears it): shown at once and queued; `written` runs when it has landed, `failed` when it could not be written (and then `written` never runs). */
	write(value: AnswerValue | undefined, written: () => void, failed: () => void): void;
}

export interface ListenWriterDeps {
	app: App;
	/** The `listen` with this key in the note, in a Booklet view that shows the note drawn; else null. */
	viewListen(path: string, key: string): ViewListen | null;
}

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
			// the promise always settles: the view says when the write landed and when it could not be made (a block it cannot write into)
			return new Promise<boolean>((done) => {
				try {
					v.write(holdsSomething(next) ? (next as AnswerValue) : undefined, () => done(true), () => done(false));
				} catch {
					done(false);
				}
			});
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
			const md = markdownViewOf(this.deps.app, path);
			if (md) {
				// the note is also open as Markdown, whose editor may hold words not saved yet: the change goes into the editor as the smallest edit
				const before = md.editor.getValue();
				replaceInEditor(md, before, change(before));
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
}
