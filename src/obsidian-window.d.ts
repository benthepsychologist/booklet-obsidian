/*
 * Obsidian puts its DOM helpers (createEl, createDiv, createSpan, createFragment) on every window, a pop-out window included, and
 * `node.win` / `doc.win` is that window; its own typings declare them only as globals. This says so for `Window`, so that an element
 * made loose for a node's own document is `doc.win.createEl(...)` (which makes it in that document) with no cast at the call.
 * Never call these on a Document itself: `doc.createEl(...)` appends to the node it is called on and throws on a document.
 */
interface Window {
	createEl: typeof createEl;
	createDiv: typeof createDiv;
	createSpan: typeof createSpan;
	createFragment: typeof createFragment;
}
