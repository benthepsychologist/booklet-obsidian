/*
 * The surfaces of a tab of pages that the tree adds: the "Pages" button with the panel of the tab's tree and its search, and the
 * "Mentioned on" list. Drawn with Obsidian's own parts (a button, a search box, lists, links); the plugin's CSS only lays them out. The view
 * decides what a press does (`go`); this file only draws. Nothing here is ever written to the note: whether the panel is open and the
 * words in its search box are the pane's, in memory.
 */
import { searchPages, searchWords, type ActTab, type Mention, type Place, type TreePage } from "./core";
import { placeLink, type ScreenHost } from "./screens";

/** What the menu keeps while the pane is open: is it open, and the words in its search box. */
export interface MenuState {
	open: boolean;
	query: string;
}

/**
 * A button "Pages" on the left of the page area, closed to begin with. It opens a panel (a `nav` landmark, "Pages in this tab") holding a
 * search box and the tab's tree as nested lists (the page on show marked with `aria-current`, every level open), each page a link to its first
 * part. The panel is a side panel beside the page on a wide pane and a drawer over it on a narrow one or a phone (the CSS decides which). With
 * words in the search box the tree gives way to the pages whose title or words hold them, titles first; Enter opens the first. Opening moves
 * focus to the search box (to the panel on a phone, so no keyboard rises), and Escape clears the words first, then closes the panel and
 * returns focus to the button. `placeOf` is a page's place. A tab of one page has no menu: the caller does not draw it.
 * Returns the element that holds the page itself and what comes under it.
 */
export function drawPageMenu(host: ScreenHost, into: HTMLElement, tab: ActTab, here: TreePage, placeOf: (p: TreePage) => Place, state: MenuState): HTMLElement {
	const area = into.createDiv({ cls: "booklet-pagearea" });
	const frame = area.createDiv({ cls: "booklet-pageframe" });
	const side = frame.createDiv({ cls: "booklet-pagenav" });
	const id = host.uid();
	const button = side.createEl("button", { cls: "booklet-pagesbtn", text: "Pages", attr: { type: "button", "aria-controls": id } });
	const panel = side.createEl("nav", { cls: "booklet-pagemenu", attr: { id, "aria-label": "Pages in this tab", tabindex: "-1" } });
	const head = panel.createDiv({ cls: "booklet-pagemenu-head" });
	const box = head.createDiv({ cls: "search-input-container booklet-pagesearch" });
	const input = box.createEl("input", { attr: { type: "search", placeholder: "Search these pages", "aria-label": "Search the pages of this tab", enterkeyhint: "go", spellcheck: "false" } });
	input.value = state.query;
	const close = head.createEl("button", { cls: "booklet-pagemenu-close", text: "Close", attr: { type: "button", "aria-label": "Close the list of pages" } });
	const list = panel.createDiv({ cls: "booklet-pagelist" });
	const main = frame.createDiv({ cls: "booklet-pagemain" });

	const link = (li: HTMLElement, p: TreePage) => {
		const a = placeLink(host, li, p === here ? "booklet-pagelink is-active" : "booklet-pagelink", p.written || p.title, placeOf(p));
		if (p === here) a.setAttr("aria-current", "page");
	};
	const branch = (into_: HTMLElement, pages: TreePage[]) => {
		const ul = into_.createEl("ul");
		for (const p of pages) {
			const li = ul.createEl("li");
			link(li, p);
			if (p.children.length) branch(li, p.children);
		}
	};
	/** Bring the page on show into view inside the panel's own scroll, a third of the way down, so a long tree opens where the reader is. */
	const showHere = () => {
		const a = list.querySelector<HTMLElement>("a.is-active");
		if (!a || panel.hidden) return;
		list.scrollTop += a.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 3;
	};
	const draw = () => {
		list.empty();
		const found = searchPages(tab, state.query);
		if (!state.query.trim()) branch(list, tab.top);
		else if (!found.length) list.createEl("p", { cls: "booklet-muted", text: "No page has those words." });
		else {
			const ul = list.createEl("ul");
			for (const p of found) link(ul.createEl("li"), p);
		}
	};
	const set = (open: boolean) => {
		state.open = open;
		panel.hidden = !open;
		frame.toggleClass("is-open", open);
		button.setAttr("aria-expanded", String(open));
	};
	set(state.open);
	draw();
	showHere();
	/** A drawer lies over the page it opens: choosing a page closes it. A side panel stays, with the words in its box. */
	const overPage = () => panel.ownerDocument.defaultView?.getComputedStyle(panel).position === "absolute";
	const go = (to: Place) => {
		if (overPage()) set(false);
		host.go(to);
	};
	list.addEventListener(
		"click",
		() => {
			if (overPage()) set(false);
		},
		true,
	);
	button.addEventListener("click", () => {
		set(!state.open);
		if (!state.open) return;
		showHere();
		// a drawer opens over the page, down from the button: bring the button to the top of the window so the drawer has the room
		if (overPage()) button.scrollIntoView?.({ block: "start" });
		// a phone's keyboard must not rise on its own: the panel takes focus there, the search box elsewhere
		(panel.ownerDocument.body.classList.contains("is-mobile") ? panel : input).focus();
	});
	close.addEventListener("click", () => {
		set(false);
		button.focus();
	});
	input.addEventListener("input", () => {
		state.query = input.value;
		draw();
	});
	// Escape is heard on the button as well as in the panel: with the panel open, a reader who has Shift+Tabbed back to the button closes it there
	side.addEventListener("keydown", (evt) => {
		if (evt.key === "Escape") {
			if (!state.open) return;
			evt.preventDefault();
			evt.stopPropagation();
			if (evt.target === input && input.value) {
				input.value = "";
				state.query = "";
				draw();
			} else {
				set(false);
				button.focus();
			}
		} else if (evt.key === "Enter" && evt.target === input && searchWords(state.query).length) {
			// with no words in the box there is nothing to open: a phone keyboard's "go" key must not move the reader
			const first = searchPages(tab, state.query)[0];
			if (first) {
				evt.preventDefault();
				go(placeOf(first));
			}
		}
	});
	return main;
}

/** "Mentioned on": the pages that link to the one on show, each a link to the place that holds the link. */
export function drawMentions(host: ScreenHost, into: HTMLElement, mentions: Mention[]): void {
	if (!mentions.length) return;
	into.createDiv({ cls: "booklet-meta booklet-treelabel", text: "Mentioned on" });
	const ul = into.createEl("ul", { cls: "booklet-mentioned" });
	for (const m of mentions) {
		placeLink(host, ul.createEl("li"), "booklet-pagelink", m.title, m.place);
	}
}
