/*
 * Editor mode: the panel's own on and off. On, the "Booklet blocks" panel is open beside the note and says what the note holds; off,
 * it is closed and nothing of it is left. It is state and nothing else: a setting that hid a feature would be a different thing, and
 * this plugin has none. The plugin turns it on by opening the panel and off by closing it, and the other way round: a panel closed by
 * hand is editor mode off. Plain TypeScript: nothing here imports Obsidian.
 */
export class EditorMode {
	private state = false;
	private listeners = new Set<(on: boolean) => void>();

	get on(): boolean {
		return this.state;
	}

	/** Sets the mode; returns whether it changed. Listeners hear only a change. */
	set(on: boolean): boolean {
		if (on === this.state) return false;
		this.state = on;
		for (const f of [...this.listeners]) f(on);
		return true;
	}

	toggle(): boolean {
		this.set(!this.state);
		return this.state;
	}

	/** Calls `fn` on every change; returns the way to stop. */
	onChange(fn: (on: boolean) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}
}
