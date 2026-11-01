/**
 * A ResizeObserver that does its work on the next frame, once for any number of changes before it, and not inside the observer: work that
 * changes the observed box's size from inside its own observer makes Chromium report "ResizeObserver loop completed with undelivered
 * notifications" as an uncaught error (Obsidian 1.8). The caller observes what it needs; `work` gets the observer, to disconnect it.
 */
export function frameObserver(win: Window, work: (watch: ResizeObserver) => void): ResizeObserver {
	let queued = false;
	const watch: ResizeObserver = new ResizeObserver(() => {
		if (queued) return;
		queued = true;
		win.requestAnimationFrame(() => {
			queued = false;
			work(watch);
		});
	});
	return watch;
}
