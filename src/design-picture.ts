/*
 * Pictures in the Design view's shell: a piece's art (design-art.ts, which is plain data) turned into elements. A drawn picture is SVG
 * built element by element with createSvg (no HTML string is ever parsed: the plugin directory's checker rejects that, and a piece's text
 * is never markup); an icon is one of Obsidian's own, found by name with a fallback, because a few Lucide names are newer than the oldest
 * Obsidian the plugin supports and a missing one must be a plain gap, never an error.
 *
 *   drawArt     a piece's art into an element, as an <svg> (drawn) or an Obsidian icon (named), both marked as decoration
 *   drawIcon    one of Obsidian's icons by the first name of a list it has, into an element; nothing when it has none
 */
import { artOf, type Art, type SvgPart } from "./design-art";
import { iconEl } from "./design-text";

export { artOf };
export type { Art };

/** One SVG part (and its children) made inside `parent`. `text` goes in as the element's text content, never as markup. */
function build(parent: Element, part: SvgPart): void {
	const attr: Record<string, string> = {};
	for (const [k, v] of Object.entries(part.attrs)) attr[k] = String(v);
	const el = parent.createSvg(part.tag as keyof SVGElementTagNameMap, { attr });
	if (part.text !== undefined) el.textContent = part.text;
	for (const c of part.children ?? []) build(el, c);
}

/** The first icon of the list that Obsidian has, put in `host` (marked as decoration); false when it has none of them. */
export function drawIcon(host: Element, names: readonly string[], cls?: string): boolean {
	const svg = iconEl(names);
	if (!svg) return false;
	svg.setAttribute("aria-hidden", "true");
	if (cls) svg.classList.add(cls);
	host.appendChild(svg);
	return true;
}

/**
 * A piece's picture inside `host`. Drawn art is an <svg> with the piece's view box; an icon is Obsidian's, drawn in the colour of the
 * art's tone (the stylesheet colours `is-tone-structure`, `is-tone-question`, ...). The host is emptied first.
 */
export function drawArt(host: HTMLElement, art: Art): void {
	host.empty();
	if (art.kind === "svg") {
		const svg = host.createSvg("svg", { attr: { viewBox: art.viewBox, "aria-hidden": "true", focusable: "false" } });
		for (const p of art.parts) build(svg, p);
		return;
	}
	host.addClass("is-icon", `is-tone-${art.tone}`);
	// the fallbacks are names that have been in Lucide for years: a picture is a shape, never a hole
	drawIcon(host, [art.icon, "shapes", "square"]);
}
