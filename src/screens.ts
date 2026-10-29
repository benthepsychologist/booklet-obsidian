/*
 * What every screen has in common (design: "The screens and the moves between them"): the trail at the top, a card's
 * rows, the picture beside a title, the tab bar, the pager at the foot of an activity, and a module's notice. Drawn
 * with Obsidian's own parts (its buttons, its Lucide icons, its CSS variables); the plugin's CSS only lays them out.
 * The view decides what a press does: this file only draws, and calls back.
 */
import { setIcon } from "obsidian";
import { inlineMd, linkless, plainText, type Place } from "./core";
import { BOOKLET_ICONS } from "./booklet-icons";

/** What these parts need from the view. */
export interface ScreenHost {
	/** Draws inline Markdown from the file with Obsidian's own renderer. */
	md(markdown: string, el: HTMLElement): void;
	/** The reader asked for a place (a link of the trail, a card, a pager button). */
	go(to: Place): void;
	/** Is there a request to put focus back on the tab bar's chosen tab (a key moved the choice, and the screen was drawn again)? Taken once. */
	takeTabFocus(): boolean;
	/** A fresh id for the page's elements to point at each other with. */
	uid(): string;
}

/** One link of the trail: a place to go to, or (the last) the screen itself. */
export interface Crumb {
	md: string;
	to: Place | null;
}

/** A press on a link or a button: its own action only (a link's address is `#`, so the default is stopped). */
function onPress(el: HTMLElement, fn: () => void): void {
	el.addEventListener("click", (evt) => {
		evt.preventDefault();
		fn();
	});
}

/** The trail: from the booklet down, each step above the screen a link ("Learning to sketch / The basics / Lines that hold"). `noCurrent`: the last step is plain text and not marked as the page (the page menu marks it, and a screen has one). */
export function drawTrail(host: ScreenHost, page: HTMLElement, crumbs: Crumb[], noCurrent = false): void {
	const nav = page.createEl("nav", { cls: "booklet-trail", attr: { "aria-label": "Where you are" } });
	// the slash after each crumb but the last is drawn by the stylesheet, so it stays on the line its crumb ends on
	crumbs.forEach((c) => {
		const to = c.to;
		if (to) {
			const link = nav.createEl("a", { cls: "booklet-trail-link", attr: { href: "#" } });
			host.md(inlineMd(linkless(c.md)), link.createSpan({ cls: "booklet-inline markdown-rendered" }));
			onPress(link, () => host.go(to));
		} else host.md(inlineMd(linkless(c.md)), nav.createSpan({ cls: "booklet-trail-here booklet-inline markdown-rendered", attr: noCurrent ? {} : { "aria-current": "page" } }));
	});
}

/**
 * A card's picture (SPEC section 3): the line's `icon:` if it is a name in Booklet's set, drawn from Obsidian's Lucide by
 * its prefixed id (a bare name can be another plugin's icon or an older alias), else a leading emoji. A name outside the
 * set, or one Obsidian cannot draw, is no picture: the card shows its number. Returns whether a picture was drawn.
 */
export function drawPicture(into: HTMLElement, icon: string | null, emoji: string | null, big = false): boolean {
	const tile = into.createDiv({ cls: big ? "booklet-pic booklet-pic-big" : "booklet-pic", attr: { "aria-hidden": "true" } });
	if (icon && BOOKLET_ICONS.has(icon)) {
		setIcon(tile, "lucide-" + icon);
		if (tile.querySelector("svg")) return true;
	}
	if (emoji) {
		tile.setText(emoji);
		tile.addClass("booklet-pic-emoji");
		return true;
	}
	tile.remove();
	return false;
}

/** One row of a list of cards: a module, an activity. */
export interface CardRow {
	/** The title's words (inline Markdown), emoji already taken out. */
	title: string;
	emoji: string | null;
	icon: string | null;
	blurb: string;
	/** The status line: inline Markdown when the file wrote it, else plain words. */
	status: string;
	statusMd: boolean;
	/** The number written before the title. */
	n: number;
	to: Place;
}

/**
 * A list of cards drawn as a contents list, one row to a card as the reference renderer does: the number before every
 * title, a picture tile kept only for an icon or an emoji and empty in a row that has neither, so that every title starts at
 * one left edge. The whole row is a link; Enter and Space open it too.
 */
export function drawCards(host: ScreenHost, page: HTMLElement, rows: CardRow[]): void {
	const list = page.createEl("ol", { cls: "booklet-cards" });
	// the tile is empty in a row with no picture only when some row of the list has one
	const pictured = rows.some((r) => (r.icon && BOOKLET_ICONS.has(r.icon)) || r.emoji);
	for (const r of rows) {
		const li = list.createEl("li");
		const row = li.createDiv({ cls: "booklet-cardrow", attr: { role: "link", tabindex: "0" } });
		if (pictured && !drawPicture(row, r.icon, r.emoji)) row.createDiv({ cls: "booklet-pic booklet-pic-none", attr: { "aria-hidden": "true" } });
		const text = row.createDiv({ cls: "booklet-cardtext" });
		const title = text.createDiv({ cls: "booklet-cardtitle" });
		title.createSpan({ cls: "booklet-num", text: `${r.n}.` });
		host.md(inlineMd(linkless(r.title)), title.createSpan({ cls: "booklet-cardtitle-words booklet-inline markdown-rendered" }));
		if (r.blurb) text.createDiv({ cls: "booklet-blurb", text: r.blurb });
		if (r.status) {
			const st = text.createDiv({ cls: "booklet-status" });
			if (r.statusMd) host.md(inlineMd(linkless(r.status)), st.createSpan({ cls: "booklet-inline markdown-rendered" }));
			else st.setText(r.status);
		}
		setIcon(row.createDiv({ cls: "booklet-chevron", attr: { "aria-hidden": "true" } }), "lucide-chevron-right");
		const open = () => host.go(r.to);
		onPress(row, open);
		row.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === " ") {
				evt.preventDefault();
				open();
			}
		});
	}
}

/**
 * The tab bar: Obsidian's own buttons that wrap onto another row when they do not fit, the chosen one in the accent colour.
 * A tablist for a screen reader: arrow keys, Home and End move the choice (as the reference's does). It returns what makes
 * the chosen tab's content its panel: the tab names the panel it controls, and the panel is named by the tab.
 */
export function drawTabBar(host: ScreenHost, into: HTMLElement, tabs: { id: string; title: string }[], current: string, label: string, choose: (id: string) => void): (panel: HTMLElement) => void {
	const bar = into.createDiv({ cls: "booklet-tabbar", attr: { role: "tablist", "aria-label": plainText(label) } });
	const buttons: HTMLElement[] = [];
	const panelId = host.uid();
	let chosen: HTMLElement | null = null;
	for (const t of tabs) {
		const on = t.id === current;
		const b = bar.createEl("button", { cls: on ? "booklet-tabbtn is-active mod-cta" : "booklet-tabbtn", attr: { role: "tab", id: host.uid(), "aria-selected": on ? "true" : "false", tabindex: on ? "0" : "-1", "data-booklet-tab": t.id } });
		if (on) {
			b.setAttr("aria-controls", panelId);
			chosen = b;
		}
		host.md(inlineMd(linkless(t.title)), b.createSpan({ cls: "booklet-inline markdown-rendered" }));
		onPress(b, () => {
			if (!on) choose(t.id);
		});
		buttons.push(b);
	}
	bar.addEventListener("keydown", (evt) => {
		const at = tabs.findIndex((t) => t.id === current);
		const to = evt.key === "ArrowRight" || evt.key === "ArrowDown" ? at + 1 : evt.key === "ArrowLeft" || evt.key === "ArrowUp" ? at - 1 : evt.key === "Home" ? 0 : evt.key === "End" ? tabs.length - 1 : -1;
		const t = tabs[Math.min(Math.max(to, 0), tabs.length - 1)];
		if (to < 0 || !t) return;
		evt.preventDefault();
		if (t.id !== current) choose(t.id);
	});
	if (host.takeTabFocus()) buttons[Math.max(0, tabs.findIndex((t) => t.id === current))]?.focus({ preventScroll: true });
	return (panel) => {
		panel.setAttr("id", panelId);
		panel.setAttr("role", "tabpanel");
		if (chosen) panel.setAttr("aria-labelledby", chosen.id);
	};
}

/** What the pager's two buttons say and do. */
export interface PagerButton {
	/** Plain words ("Back"), or inline Markdown (a title) when `md`. */
	words: string;
	md: boolean;
	to: Place;
	/** What a press does in place of going to `to` (one step of a page, Back or Next within it). */
	press?: () => void;
}

/**
 * Back, "Page 2 of 3" and Next, at the foot of an activity (SPEC section 3, pages), after the page, not pinned: the reader meets
 * Next where they finish reading. Back leads out from the first page ("Up: <parent>", else "Back to the overview"); Next on the last
 * page goes to the next activity ("Next: 3. Title", no number between bare activities). In a tab of pages (page trees) `at` and `of` count
 * the parts of the page on show, and the counter says "2 of 3" (`noPageWord`), not "Page 2 of 3": a part is not a page there.
 */
export function drawPager(host: ScreenHost, page: HTMLElement, back: PagerButton | null, at: number, of: number, next: PagerButton | null, noPageWord = false): void {
	const foot = page.createDiv({ cls: "booklet-pager" });
	const button = (b: PagerButton, cls: string, icon: string, before: boolean) => {
		const el = foot.createEl("button", { cls });
		const icon_ = () => setIcon(el.createSpan({ cls: "booklet-pager-icon", attr: { "aria-hidden": "true" } }), icon);
		if (before) icon_();
		const words = el.createSpan({ cls: b.md ? "booklet-inline markdown-rendered" : "booklet-pager-words" });
		if (b.md) host.md(inlineMd(linkless(b.words)), words);
		else words.setText(b.words);
		if (!before) icon_();
		onPress(el, () => (b.press ? b.press() : host.go(b.to)));
	};
	if (back) button(back, "booklet-pager-back", "lucide-arrow-left", true);
	else foot.createSpan({ cls: "booklet-pager-gap" });
	// the counter keeps the middle even when nothing follows the page
	if (of > 1) foot.createSpan({ cls: "booklet-pager-at", text: noPageWord ? `${at + 1} of ${of}` : `Page ${at + 1} of ${of}` });
	else foot.createSpan({ cls: "booklet-pager-gap" });
	if (next) button(next, "mod-cta booklet-pager-next", "lucide-arrow-right", false);
}

/** A module's terms, a quiet disclosure closed until opened (SPEC section 3): a source is a link only when it is an http or https address. */
export function drawNotice(into: HTMLElement, notice: [string, string][]): void {
	if (!notice.length) return;
	const d = into.createEl("details", { cls: "booklet-notice" });
	d.createEl("summary", { text: "About this module" });
	const dl = d.createEl("dl");
	const names: Record<string, string> = { license: "Licence", copyright: "Copyright", source: "Source", version: "Version" };
	for (const [k, v] of notice) {
		dl.createEl("dt", { text: names[k] ?? k });
		const dd = dl.createEl("dd");
		if (k === "source" && /^https?:\/\//i.test(v)) dd.createEl("a", { cls: "external-link", text: v, attr: { href: v, rel: "noopener", target: "_blank" } });
		else dd.setText(v);
	}
}
