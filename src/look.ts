/*
 * The look a booklet view is drawn in. The view's root carries it as `data-booklet-look`, and the CSS (styles.css, built from
 * themes/) draws from there: "obsidian" has no rules of its own and is today's look, the fallback and the off state; the two
 * paper looks are the Booklet themes. This file only decides which one; it imports nothing from Obsidian, so a test can run it.
 */

export type Look = "paper-light" | "paper-dark" | "obsidian";

/** In the order the settings dropdown lists them. */
export const LOOKS: readonly Look[] = ["paper-light", "paper-dark", "obsidian"];

export const LOOK_LABELS: Record<Look, string> = {
	"paper-light": "Paper and petrol: light",
	"paper-dark": "Paper and petrol: dark",
	obsidian: "Obsidian",
};

/**
 * What one view's menu has chosen for that view only, for as long as the view lives (it is never saved): "obsidian" draws the
 * view in Obsidian's look, "paper" draws it in the Booklet look, and nothing leaves the view with whatever the settings give.
 */
export type ViewLook = "obsidian" | "paper" | undefined;

export function isLook(v: unknown): v is Look {
	return v === "paper-light" || v === "paper-dark" || v === "obsidian";
}

/** The Booklet look that matches Obsidian's mode. */
function matching(dark: boolean): Look {
	return dark ? "paper-dark" : "paper-light";
}

/**
 * The look to draw in. `stored` is what the reader chose in the settings (anything: a value that is not a look counts as no choice).
 * With no choice the default is Paper and petrol in the variant that matches Obsidian's mode, so the themes are on from the start.
 * A choice of one paper look is kept in both modes. `view` is the view menu's choice for this view alone.
 */
export function resolveLook(stored: unknown, dark: boolean, view?: ViewLook): Look {
	if (view === "obsidian") return "obsidian";
	const chosen = isLook(stored) ? stored : undefined;
	if (view === "paper") return chosen === "paper-light" || chosen === "paper-dark" ? chosen : matching(dark);
	return chosen ?? matching(dark);
}

/**
 * What the view menu's one item does from here: the choice to keep for this view after it is pressed. A view in a paper look
 * goes to Obsidian's; a view in Obsidian's goes to the Booklet look. When that is what the settings would give anyway, nothing
 * is kept, so the view follows the settings again.
 */
export function flipViewLook(stored: unknown, dark: boolean, view?: ViewLook): ViewLook {
	const next: ViewLook = resolveLook(stored, dark, view) === "obsidian" ? "paper" : "obsidian";
	return resolveLook(stored, dark, next) === resolveLook(stored, dark) ? undefined : next;
}
