/*
 * The button a `copy` callout draws (core/copy.ts): one Obsidian button, and beside it a line that says "Copied" in a live region, so a screen
 * reader announces it. It puts one piece of text on the clipboard and does nothing else: it writes nothing to the note or the records, and
 * sends nothing anywhere. `navigator.clipboard.writeText` is called inside the click handler (the phone app only copies for a tap). If the
 * clipboard refuses it, the line says so and the text is shown in a read-only field, selected, for the reader to copy by hand.
 */
import { plainWords, type CopyResult, type CopySegment } from "./core";

/** How long the "Copied" line stays before it is emptied again. */
const SAID_MS = 6000;

/** Puts `text` on the clipboard: true when it went. The call into the clipboard happens before this returns, still inside the tap. */
export function writeClipboard(doc: Document, text: string): Promise<boolean> {
	const clipboard = doc.defaultView?.navigator.clipboard;
	if (!clipboard || typeof clipboard.writeText !== "function") return Promise.resolve(false);
	try {
		return clipboard.writeText(text).then(
			() => true,
			() => false,
		);
	} catch {
		return Promise.resolve(false);
	}
}

/** What the line beside the button says after a try. */
export function copiedWords(ok: boolean, missing: readonly string[]): string {
	if (!ok) return "Could not copy automatically. The text is below: select it and copy it.";
	return missing.length ? `Copied. Left out because nothing can be copied under ${missing.length === 1 ? "this word" : "these words"}: ${missing.join(", ")}.` : "Copied";
}

/** Draws a copy callout: its button, and the line that says what happened. `copy` makes the text from the note and the answers as they are now. */
export function drawCopy(into: HTMLElement, s: CopySegment, copy: () => CopyResult): void {
	const wrap = into.createDiv({ cls: "booklet-clip", attr: { "data-booklet-clip": s.id ?? "" } });
	const button = wrap.createEl("button", { cls: "booklet-clip-button", text: plainWords(s.label).trim() || "Copy", attr: { type: "button" } });
	// the line exists, empty, before the tap: a live region announces words put into it, and one made with its words is not announced
	const said = wrap.createSpan({ cls: "booklet-clip-said booklet-muted", attr: { role: "status", "aria-live": "polite", "aria-atomic": "true" } });
	let timer: number | null = null;
	let field: HTMLTextAreaElement | null = null;
	button.addEventListener("click", (evt) => {
		evt.preventDefault();
		const win = wrap.ownerDocument.defaultView ?? window;
		const result = copy();
		void writeClipboard(wrap.ownerDocument, result.text).then((ok) => {
			if (timer !== null) win.clearTimeout(timer);
			said.setText(copiedWords(ok, result.missing));
			// a copy that went leaves nothing but its line, which empties after a while; one that did not stays until the next try
			timer = ok ? win.setTimeout(() => said.setText(""), SAID_MS) : null;
			field?.remove();
			field = null;
			if (ok) return;
			field = wrap.createEl("textarea", { cls: "booklet-clip-text", attr: { readonly: "", "aria-label": "The text to copy", rows: "8" } });
			field.value = result.text;
			field.focus();
			field.select();
		});
	});
}
