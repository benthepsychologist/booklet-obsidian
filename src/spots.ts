/*
 * Spot drawings: the flat 100 by 100 illustrations the reference renderer (booklet.html, art/spots/) shows in a card's
 * picture tile in its "teaching" style. Ported here from that renderer's art/spots/ (24 drawings).
 * Licence: Apache License 2.0, Copyright 2026 Ben Armstrong (the licence of the renderer and of this plugin).
 *
 * The key is a Lucide icon name that is also in Booklet's icon set (src/booklet-icons.ts), so a card whose `icon:` names
 * one can show the spot as well as the line icon. A drawing carries no colour: its shapes take a class, and
 * themes/pictures.css gives each its colour from the paper look's tokens:
 *   a accent fill      w card fill       s sun fill        p brand fill
 *   l accent stroke    lw card stroke    "w l" card fill with an accent outline    "l s" sun stroke
 * Every shape is self-closing, so a spot is drawn with createSvg (spotElement) and never by assigning markup.
 */

export const SPOTS: Record<string, string> = {
	compass: '<svg viewBox="0 0 100 100"><circle class="a" cx="50" cy="50" r="38"/><circle class="w" cx="50" cy="50" r="29"/><path class="s" d="M50 24 58 50H42z"/><path class="a" d="M50 76 42 50h16z"/><circle class="p" cx="50" cy="50" r="4"/></svg>',
	fence: '<svg viewBox="0 0 100 100"><path class="a" d="M20 30 L28 20 L36 30 L36 84 L20 84 Z"/><path class="a" d="M42 30 L50 20 L58 30 L58 84 L42 84 Z"/><path class="a" d="M64 30 L72 20 L80 30 L80 84 L64 84 Z"/><rect class="w l" x="14" y="44" width="72" height="7" stroke-width="2"/><rect class="w l" x="14" y="64" width="72" height="7" stroke-width="2"/></svg>',
	gavel: '<svg viewBox="0 0 100 100"><rect class="a" x="30" y="18" width="34" height="18" rx="4" transform="rotate(35 47 27)"/><line class="l" x1="50" y1="38" x2="30" y2="70" stroke-width="6" stroke-linecap="round"/><rect class="w l" x="46" y="74" width="40" height="10" rx="3" stroke-width="2.5"/></svg>',
	heart: '<svg viewBox="0 0 100 100"><path class="a" d="M50 82C22 64 14 50 14 37c0-11 9-20 20-20 7 0 13 4 16 9 3-5 9-9 16-9 11 0 20 9 20 20 0 13-8 27-36 45z"/><path class="lw" d="M34 40c0-5 3-8 7-8" stroke-width="5" stroke-linecap="round"/><circle class="s" cx="76" cy="20" r="6"/></svg>',
	house: '<svg viewBox="0 0 100 100"><path class="a" d="M14 48 L50 18 L86 48 L78 48 L78 84 L22 84 L22 48 Z"/><rect class="w" x="42" y="58" width="16" height="26"/></svg>',
	key: '<svg viewBox="0 0 100 100"><circle class="a" cx="32" cy="50" r="18"/><circle class="w" cx="32" cy="50" r="7"/><rect class="a" x="46" y="46" width="40" height="8" rx="2"/><rect class="a" x="72" y="54" width="7" height="12"/><rect class="a" x="60" y="54" width="7" height="9"/></svg>',
	landmark: '<svg viewBox="0 0 100 100"><path class="a" d="M14 36 L50 16 L86 36 Z"/><rect class="a" x="20" y="36" width="60" height="6"/><rect class="w l" x="26" y="44" width="8" height="30" stroke-width="2.5"/><rect class="w l" x="46" y="44" width="8" height="30" stroke-width="2.5"/><rect class="w l" x="66" y="44" width="8" height="30" stroke-width="2.5"/><rect class="a" x="16" y="76" width="68" height="8" rx="2"/></svg>',
	lightbulb: '<svg viewBox="0 0 100 100"><circle class="a" cx="50" cy="40" r="22"/><rect class="w l" x="40" y="62" width="20" height="16" rx="3" stroke-width="2.5"/><line class="l" x1="42" y1="84" x2="58" y2="84" stroke-width="3"/><path class="lw" d="M44 44 L50 34 L56 44" stroke-width="3"/></svg>',
	"list-ordered": '<svg viewBox="0 0 100 100"><rect class="a" x="26" y="12" width="8" height="78" rx="4"/><rect class="a" x="66" y="12" width="8" height="78" rx="4"/><rect class="a" x="30" y="24" width="40" height="7" rx="3.5"/><rect class="a" x="30" y="44" width="40" height="7" rx="3.5"/><rect class="a" x="30" y="64" width="40" height="7" rx="3.5"/><circle class="s" cx="50" cy="84" r="6"/></svg>',
	map: '<svg viewBox="0 0 100 100"><path class="a" d="M16 26 L38 18 L62 26 L84 18 L84 76 L62 84 L38 76 L16 84 Z"/><line class="lw" x1="38" y1="18" x2="38" y2="76" stroke-width="2.5"/><line class="lw" x1="62" y1="26" x2="62" y2="84" stroke-width="2.5"/></svg>',
	"messages-square": '<svg viewBox="0 0 100 100"><path class="a" d="M14 26c0-6 5-10 10-10h34c6 0 10 4 10 10v18c0 6-4 10-10 10H34l-12 10V54c-5 0-8-4-8-10z"/><path class="lw" d="M28 32h26M28 42h16" stroke-width="5" stroke-linecap="round"/><path class="s" d="M86 48c0-5-4-9-9-9H56c-5 0-9 4-9 9v14c0 5 4 9 9 9h14l10 8v-8c4 0 6-4 6-9z"/></svg>',
	"refresh-cw": '<svg viewBox="0 0 100 100"><path class="l" d="M20 44a31 31 0 0 1 56-12M80 56a31 31 0 0 1-56 12" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path class="a" d="M70 14l13 19-23 2zM30 86 17 67l23-2z"/><circle class="s" cx="50" cy="50" r="10"/></svg>',
	scale: '<svg viewBox="0 0 100 100"><line class="l" x1="50" y1="14" x2="50" y2="72" stroke-width="3"/><line class="l" x1="24" y1="30" x2="76" y2="30" stroke-width="3"/><path class="a" d="M50 78 L34 86 L66 86 Z"/><circle class="w l" cx="24" cy="46" r="11" stroke-width="2.5"/><circle class="w l" cx="76" cy="46" r="11" stroke-width="2.5"/><line class="l" x1="24" y1="30" x2="24" y2="35" stroke-width="2.5"/><line class="l" x1="76" y1="30" x2="76" y2="35" stroke-width="2.5"/></svg>',
	search: '<svg viewBox="0 0 100 100"><circle class="a" cx="44" cy="44" r="26"/><circle class="w" cx="44" cy="44" r="17"/><path class="l" d="M63 63l17 17" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle class="s" cx="44" cy="44" r="6"/></svg>',
	send: '<svg viewBox="0 0 100 100"><rect class="a" x="20" y="30" width="60" height="50" rx="10"/><path class="lw" d="M34 56l16 12 16-12" stroke-width="5" stroke-linecap="round"/><path class="l s" d="M50 12v34M38 34l12 12 12-12" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
	shield: '<svg viewBox="0 0 100 100"><path class="a" d="M50 14 L80 26 L80 50 Q80 74 50 88 Q20 74 20 50 L20 26 Z"/><path class="lw" d="M36 50 L46 60 L66 38" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
	"ship-wheel": '<svg viewBox="0 0 100 100"><circle class="a" cx="50" cy="50" r="40"/><circle class="w" cx="50" cy="50" r="30"/><circle class="a" cx="50" cy="50" r="9"/><path class="l" d="M50 41V22M42 55 26 66M58 55l16 11" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle class="s" cx="50" cy="12" r="5"/></svg>',
	sparkles: '<svg viewBox="0 0 100 100"><rect class="a" x="18" y="28" width="52" height="40" rx="12"/><path class="lw" d="M32 48h24" stroke-width="5" stroke-linecap="round"/><path class="s" d="M74 14l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"/><path class="p" d="M58 56l22 8-9 4 8 10-5 4-8-10-4 9z"/></svg>',
	sprout: '<svg viewBox="0 0 100 100"><rect class="a" x="26" y="62" width="48" height="24" rx="8"/><path class="l" d="M50 62V36" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path class="a" d="M50 44c-16 0-22-10-22-20 14 0 22 8 22 20zM50 38c0-14 8-22 22-22 0 12-8 22-22 22z"/><circle class="s" cx="72" cy="74" r="4"/></svg>',
	target: '<svg viewBox="0 0 100 100"><circle class="a" cx="50" cy="50" r="40"/><circle class="w" cx="50" cy="50" r="28"/><circle class="a" cx="50" cy="50" r="16" opacity=".55"/><circle class="s" cx="50" cy="50" r="6"/></svg>',
	trees: '<svg viewBox="0 0 100 100"><circle class="a" cx="36" cy="40" r="18"/><rect class="a" x="33" y="54" width="6" height="22"/><circle class="w l" cx="66" cy="48" r="13" stroke-width="2.5"/><rect class="a" x="64" y="60" width="5" height="16"/><rect class="a" x="12" y="76" width="76" height="6" rx="2"/></svg>',
	user: '<svg viewBox="0 0 100 100"><circle class="a" cx="50" cy="32" r="14"/><path class="a" d="M24 84 Q24 54 50 54 Q76 54 76 84 Z"/><path class="w l" d="M62 60 L82 50 L82 72 Q82 80 72 84 Q62 80 62 72 Z" stroke-width="2.5"/></svg>',
	waves: '<svg viewBox="0 0 100 100"><path class="l" d="M14 40c9-10 17-10 24 0s15 10 24 0 17-10 24 0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path class="l s" d="M14 62c9-10 17-10 24 0s15 10 24 0 17-10 24 0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
	wrench: '<svg viewBox="0 0 100 100"><path class="a" d="M66 14 A20 20 0 0 0 48 42 L18 72 A7 7 0 0 0 28 82 L58 52 A20 20 0 0 0 86 34 L74 40 L62 30 Z"/></svg>',
};

/** The spot drawing's markup for an icon name, or null when that name has none (or is not a name at all). */
export function spotFor(icon: string | null): string | null {
	if (!icon || !Object.prototype.hasOwnProperty.call(SPOTS, icon)) return null;
	return SPOTS[icon] ?? null;
}

/** Draws a spot's markup into `into` as <svg class="booklet-spot" aria-hidden="true">, built with createSvg shape by shape. */
export function drawSpot(into: HTMLElement, markup: string): SVGElement {
	const svg = into.createSvg("svg", { cls: "booklet-spot", attr: { viewBox: "0 0 100 100", "aria-hidden": "true", focusable: "false" } });
	const shape = /<([a-z]+)((?:\s+[a-zA-Z0-9-]+="[^"]*")*)\s*\/>/g;
	for (const m of markup.matchAll(shape)) {
		const attr: Record<string, string> = {};
		let cls: string[] = [];
		for (const a of (m[2] ?? "").matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/g)) {
			if (a[1] === "class") cls = (a[2] ?? "").split(/\s+/).filter(Boolean);
			else attr[a[1] ?? ""] = a[2] ?? "";
		}
		svg.createSvg(m[1] as "path", { cls, attr });
	}
	return svg;
}
