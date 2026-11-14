/*
 * The Design view's small words, in one place: what a level or a kind of block is called, how a block is named on screen, and the first
 * words of a block's own text (for the "After ..." line of a place, a card's one-line description and the breadcrumb). Every string goes
 * through ui() (core/design-strings.ts); nothing here draws.
 */
import { blockLines, levelOf, nameOf, type DesignKey, type DesignNode, type DesignKind, type Level } from "./core";
import { ui } from "./design-text";

export const LEVEL_KEY: Readonly<Record<Level, DesignKey>> = {
	booklet: "level.booklet",
	module: "level.module",
	"module-tab": "level.module-tab",
	activity: "level.activity",
	"activity-tab": "level.activity-tab",
	page: "level.page",
	block: "level.block",
};

export const KIND_KEY: Readonly<Partial<Record<DesignKind, DesignKey>>> = {
	"front-matter": "kind.front-matter",
	"data-section": "kind.data-section",
	records: "kind.records",
	group: "kind.group",
	row: "kind.row",
	question: "kind.question",
	callout: "kind.callout",
	notice: "kind.notice",
	menu: "kind.menu",
	query: "kind.query",
	fence: "kind.fence",
	"page-break": "kind.page-break",
	prose: "kind.prose",
	comment: "kind.comment",
	"as-written": "kind.as-written",
};

/** What an empty container says it holds nothing of (and what to add). */
export const EMPTY_KEY: Readonly<Partial<Record<DesignKind, DesignKey>>> = {
	booklet: "empty.booklet",
	module: "empty.module",
	"module-tab": "empty.module-tab",
	activity: "empty.activity",
	"activity-tab": "empty.activity-tab",
	page: "empty.page",
	group: "empty.group",
	row: "empty.row",
	"data-section": "empty.data-section",
};

export const capital = (s: string): string => (s ? (s[0] ?? "").toUpperCase() + s.slice(1) : s);

/** What a node is: its level's name for a part of the booklet, its kind's name for a block. */
export function kindName(n: DesignNode): string {
	const level = levelOf(n);
	return ui(level === "block" ? (KIND_KEY[n.kind] ?? "level.block") : LEVEL_KEY[level]);
}

/**
 * What a node is called on screen: its title or id; the booklet is called what its own `title:` says, else what its note is called.
 * `fallback` is the note's name.
 */
export function calledOf(n: DesignNode, bookletTitle: string, fallback: string): string {
	return n.parent ? nameOf(n) : bookletTitle || fallback;
}

/** A node's kind and its name, when it has one: "Question: Did you?". */
export function titledOf(n: DesignNode, bookletTitle: string, fallback: string): string {
	const name = calledOf(n, bookletTitle, fallback);
	return name ? `${kindName(n)}: ${name}` : kindName(n);
}

/** One line of a block's Markdown, as words: the `>` marks, the callout's `[!kind|id settings]` and a heading's or list's marks taken off. */
export function plainOf(line: string): string {
	return line
		.replace(/^(?:\s*>)+/, "")
		.replace(/\[!\s*[^\]]*\][+-]?/, "")
		.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, "")
		.replace(/[*_`~]|!?\[([^\]]*)\]\([^)]*\)/g, (m, text: string | undefined) => text ?? "")
		.replace(/\s+/g, " ")
		.trim();
}

/** The first `max` characters of a text, with an ellipsis when it was cut (at a word when it can be). */
export function clip(s: string, max: number): string {
	if (s.length <= max) return s;
	const cut = s.slice(0, max);
	const at = cut.lastIndexOf(" ");
	return `${(at > max / 2 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/** The first words of a block's own lines: its title when it has one, else its first line that says something. "" for a block with none. */
export function firstWords(text: string, n: DesignNode, max = 48): string {
	if (n.label.trim() && n.kind !== "prose") return clip(n.label.trim(), max);
	for (const l of blockLines(text, n)) {
		const p = plainOf(l);
		if (p) return clip(p, max);
	}
	return "";
}

let nameSeq = 0;

/**
 * Obsidian shows an element's `aria-label` as a tooltip when the pointer rests on it, which is right for a button and noise on a
 * region, a group or a list that merely has a name ("Words", "The left column"). This gives such an element the same accessible name
 * through `aria-labelledby`, from a visually hidden span, and takes the attribute off. Buttons, links, fields and summaries keep theirs:
 * a tooltip on a control says what it does. The left column and the breadcrumb, which are rebuilt in place, are named by the view itself.
 */
const CONTROLS = new Set(["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT", "SUMMARY", "ASIDE", "NAV"]);
export function quietNames(root: HTMLElement): void {
	for (const el of Array.from(root.querySelectorAll<HTMLElement>("[aria-label]"))) {
		if (CONTROLS.has(el.tagName) || el.hasAttribute("aria-live")) continue; // a live region has its text rewritten, which would take the hidden name with it
		const label = el.getAttribute("aria-label") ?? "";
		if (!label) continue;
		const id = `booklet-design-name-${++nameSeq}`;
		el.createSpan({ cls: "booklet-design-sr", text: label, attr: { id } });
		el.setAttribute("aria-labelledby", id);
		el.removeAttribute("aria-label");
	}
}
