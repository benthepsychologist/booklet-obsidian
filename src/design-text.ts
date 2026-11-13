/*
 * The Design view's words and icons, in the shell: the table is in core (core/design-strings.ts, plain TypeScript); this puts the
 * language Obsidian is in to it, and finds icons in Obsidian's set.
 */
import { getIcon, getLanguage } from "obsidian";
import { langOf, t, tn, type DesignKey, type Lang } from "./core";

/** The language Obsidian is in, as far as the table has it (English otherwise). */
export const lang = (): Lang => langOf(getLanguage());

/** A string of the Design view in the language Obsidian is in. */
export const ui = (key: DesignKey, vars?: Readonly<Record<string, string | number>>): string => t(key, lang(), vars);

/** A counted string of the Design view (`confirm.lines`). */
export const uin = (key: "confirm.lines", n: number): string => tn(key, n, lang());

/** The first icon of the list that Obsidian's set has, or `fallback`: an icon name newer than the floor release is not drawn as a hole. */
export function iconName(candidates: readonly string[], fallback: string): string {
	for (const name of candidates) if (getIcon(name)) return name;
	return fallback;
}

/** The first icon of the list that Obsidian's set has, drawn (a new element each time); null when it has none. */
export function iconEl(candidates: readonly string[]): SVGSVGElement | null {
	for (const name of candidates) {
		const svg = getIcon(name);
		if (svg) return svg;
	}
	return null;
}

/** The icons of the three header buttons (the last in each list has been in Obsidian for years). */
export const MODE_ICONS = {
	markdown: ["file-text"],
	booklet: ["book-open"],
	design: ["pencil-ruler", "ruler", "layout-list", "pencil"],
} as const;
