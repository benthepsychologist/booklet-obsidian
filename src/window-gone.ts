/*
 * Waiting for a pop-out window to finish closing. Obsidian 1.11 throws a bare "illegal access", uncaught, in the main window when a note
 * is written while a pop-out window is being closed: measured in the real app, a write that starts within about 30 ms of the window's
 * closing does it every time, one that starts 100 ms or more after does not. A view that has typing to write as its window closes
 * writes it once the window's `closed` is true and `SETTLE` ms more have passed (the typing is kept in the view until then).
 */

/** How long after the window reports closed the write waits, in ms. */
export const SETTLE = 200;

/** Resolves `SETTLE` ms after `win` is closed, or after `limit` ms in all (a window that stays open does not hold the write back for good). A null window is already gone. */
export function windowGone(win: Window | null, limit = 2000, step = 25, settle = SETTLE): Promise<void> {
	return new Promise((resolve) => {
		let waited = 0;
		const look = (): void => {
			if (!win || win.closed) window.setTimeout(resolve, settle);
			else if (waited >= limit) resolve();
			else {
				waited += step;
				window.setTimeout(look, step);
			}
		};
		look();
	});
}
