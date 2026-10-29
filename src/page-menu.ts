/*
 * The surfaces of a tab of pages that the tree adds (page trees; design/pages/proposal.md section 3, decision 6 calls F and K): the menu
 * of the tab's tree with its search ("Pages in this tab"), and the "Mentioned on" list. Drawn with Obsidian's own parts (a disclosure,
 * its search box, links); the plugin's CSS only lays them out. The view decides what a press does (`go`); this file only draws.
 * Nothing here is ever written to the note: the menu's open state and its search words are the pane's, in memory.
 */
import { inlineMd, linkless, searchPages, type ActTab, type Mention, type Place, type TreePage } from "./core";
import type { ScreenHost } from "./screens";

/** What the menu keeps while the pane is open: is it open, and the words in its search box. */
export interface MenuState {
	open: boolean;
	query: string;
}

/** A press on a link: its own action only (a link's address is `#`, so the default is stopped). */
function onPress(el: HTMLElement, fn: () => void): void {
	el.addEventListener("click", (evt) => {
		evt.preventDefault();
		fn();
	});
}

/**
 * A closed disclosure "Pages in this tab", holding a search box and the tab's tree as nested lists (the page on show marked), each page a
 * link to its first part. With words in the search box the tree gives way to the pages whose title or words hold them, titles first;
 * Enter opens the first. `placeOf` is a page's place. A tab of one page has no menu: the caller does not draw it.
 */
export function drawPageMenu(host: ScreenHost, into: HTMLElement, tab: ActTab, here: TreePage, placeOf: (p: TreePage) => Place, state: MenuState): void {
	const d = into.createEl("details", { cls: "booklet-pagemenu" });
	d.open = state.open;
	d.createEl("summary", { text: "Pages in this tab" });
	d.addEventListener("toggle", () => {
		state.open = d.open;
	});
	const box = d.createDiv({ cls: "search-input-container booklet-pagesearch" });
	const input = box.createEl("input", { attr: { type: "search", placeholder: "Search these pages", "aria-label": "Search the pages of this tab", enterkeyhint: "go", spellcheck: "false" } });
	input.value = state.query;
	const list = d.createDiv({ cls: "booklet-pagelist" });

	const link = (li: HTMLElement, p: TreePage) => {
		const a = li.createEl("a", { cls: p === here ? "booklet-pagelink is-active" : "booklet-pagelink", attr: { href: "#" } });
		if (p === here) a.setAttr("aria-current", "page");
		host.md(inlineMd(linkless(p.written || p.title)), a.createSpan({ cls: "booklet-inline markdown-rendered" }));
		onPress(a, () => host.go(placeOf(p)));
	};
	const branch = (into_: HTMLElement, pages: TreePage[]) => {
		const ul = into_.createEl("ul");
		for (const p of pages) {
			const li = ul.createEl("li");
			link(li, p);
			if (p.children.length) branch(li, p.children);
		}
	};
	const draw = () => {
		list.empty();
		const found = searchPages(tab, state.query);
		if (!state.query.trim()) branch(list, tab.top);
		else if (!found.length) list.createEl("p", { cls: "booklet-muted", text: "No page has those words." });
		else {
			const ul = list.createEl("ul", { cls: "booklet-pagehits" });
			for (const p of found) link(ul.createEl("li"), p);
		}
	};
	draw();
	input.addEventListener("input", () => {
		state.query = input.value;
		if (state.query) state.open = true;
		draw();
	});
	input.addEventListener("keydown", (evt) => {
		if (evt.key === "Escape" && input.value) {
			evt.preventDefault();
			evt.stopPropagation();
			input.value = "";
			state.query = "";
			draw();
		} else if (evt.key === "Enter") {
			const first = searchPages(tab, state.query)[0];
			if (first) {
				evt.preventDefault();
				host.go(placeOf(first));
			}
		}
	});
}

/** "Mentioned on": the pages that link to the one on show, each a link to the place that holds the link. */
export function drawMentions(host: ScreenHost, into: HTMLElement, mentions: Mention[]): void {
	if (!mentions.length) return;
	into.createDiv({ cls: "booklet-meta", text: "Mentioned on" });
	const ul = into.createEl("ul", { cls: "booklet-mentioned" });
	for (const m of mentions) {
		const a = ul.createEl("li").createEl("a", { cls: "booklet-pagelink", attr: { href: "#" } });
		host.md(inlineMd(linkless(m.title)), a.createSpan({ cls: "booklet-inline markdown-rendered" }));
		onPress(a, () => host.go(m.place));
	}
}
