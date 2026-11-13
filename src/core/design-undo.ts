/*
 * The Design view's own undo and redo. Every change the view makes is a smallest-byte replacement of the note (`minimalChange`), so a
 * step is just that replacement turned both ways: the bytes it took out and the bytes it put in, and where. Obsidian does not say that a
 * write made with `vault.process` joins an editor's undo history, so the view keeps its own stack and replays it as writes of its own.
 * Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * A step is replayed only on the exact text it left behind: each step holds a fingerprint of the note before and after it, and an undo
 * whose note is anything else (a word typed in a Markdown pane, a sync) is refused with a reason, never forced. The history never
 * writes: `planUndo` and `planRedo` say what the note would become, the shell writes it, and only when the write landed does it call
 * `settleUndo` or `settleRedo` to move the step across.
 */
import { minimalChange, type Change } from "./editor-actions";

/** A note's length and a 32-bit hash of it: enough to tell "the note as the step left it" from any other text. */
export function fingerprint(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return `${text.length}:${(h >>> 0).toString(16)}`;
}

export interface UndoStep {
	/** Where the replacement starts, in the text before it. */
	from: number;
	/** The bytes it took out. */
	removed: string;
	/** The bytes it put in. */
	inserted: string;
	/** The note's fingerprint before the step and after it. */
	before: string;
	after: string;
}

export type UndoPlan = { ok: true; change: Change; text: string } | { ok: false; reason: "empty" | "changed" };

const apply = (text: string, from: number, take: number, put: string): string => text.slice(0, from) + put + text.slice(from + take);

export class DesignHistory {
	private undos: UndoStep[] = [];
	private redos: UndoStep[] = [];
	private listeners = new Set<() => void>();

	get canUndo(): boolean {
		return this.undos.length > 0;
	}

	get canRedo(): boolean {
		return this.redos.length > 0;
	}

	/** How many steps can be undone and redone (for the tests and the buttons' words). */
	get depth(): { undo: number; redo: number } {
		return { undo: this.undos.length, redo: this.redos.length };
	}

	/** Calls `fn` after every change to what can be undone or redone; gives back the way to stop. */
	onChange(fn: () => void): () => void {
		this.listeners.add(fn);
		return () => void this.listeners.delete(fn);
	}

	private told(): void {
		for (const f of [...this.listeners]) f();
	}

	/**
	 * A change the view wrote: the note was `before`, and is `after`. A new change ends the redo line. A change made on a note other than
	 * the one the last step left (something else edited it in between) cuts the steps before it off: they could not be replayed on it.
	 */
	record(before: string, after: string): void {
		const c = minimalChange(before, after);
		if (!c) return;
		const last = this.undos[this.undos.length - 1];
		if (last && last.after !== fingerprint(before)) this.undos = [];
		this.undos.push({ from: c.from, removed: before.slice(c.from, c.to), inserted: c.text, before: fingerprint(before), after: fingerprint(after) });
		this.redos = [];
		this.told();
	}

	/** Forgets every step (another note is loaded into the view). */
	clear(): void {
		if (!this.undos.length && !this.redos.length) return;
		this.undos = [];
		this.redos = [];
		this.told();
	}

	private plan(step: UndoStep | undefined, current: string, from: "after" | "before"): UndoPlan {
		if (!step) return { ok: false, reason: "empty" };
		const [take, put] = from === "after" ? [step.inserted, step.removed] : [step.removed, step.inserted];
		if (fingerprint(current) !== step[from] || current.slice(step.from, step.from + take.length) !== take) return { ok: false, reason: "changed" };
		return { ok: true, change: { from: step.from, to: step.from + take.length, text: put }, text: apply(current, step.from, take.length, put) };
	}

	/** What undoing the last step would do to `current`, the note as it is now. Nothing moves until `settleUndo`. */
	planUndo(current: string): UndoPlan {
		return this.plan(this.undos[this.undos.length - 1], current, "after");
	}

	/** The undo was written: its step moves to the redo line. */
	settleUndo(): void {
		const s = this.undos.pop();
		if (s) this.redos.push(s);
		this.told();
	}

	planRedo(current: string): UndoPlan {
		return this.plan(this.redos[this.redos.length - 1], current, "before");
	}

	settleRedo(): void {
		const s = this.redos.pop();
		if (s) this.undos.push(s);
		this.told();
	}
}
