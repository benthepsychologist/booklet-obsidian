/*
 * A query's rows drawn (SPEC section 6): as a table, a list, tiles or cards, each by the parts its fields play (the
 * roles), from the plan the core works out (core/query.ts). Words are set as text, and the file's own inline Markdown
 * (an option, a title) through Obsidian's renderer; a value from the rows is never read as Markdown or HTML. Nothing
 * here is saved: a reader's sorting and filtering are not offered yet.
 */
import { getIcon } from "obsidian";
import { QUERY_WORDS, badgesOf, linkOf, roleText, toneOf, type Cell, type Group, type QueryPlan, type Role, type Row, type RowSet, type WordPart } from "./core";

/** What drawing a query needs from the view. */
export interface QueryHost {
	md(markdown: string, el: HTMLElement): void;
	/** Opens a note a row's link leads to, from this note. */
	openNote(path: string): void;
}

type Roles = Record<Role, string | null>;
type Plan = Extract<QueryPlan, { kind: "rows" }>;

/** Words, as text and the file's own inline Markdown. */
export function words(host: Pick<QueryHost, "md">, into: HTMLElement, parts: readonly WordPart[]): void {
	for (const p of parts) {
		if ("md" in p) host.md(p.md, into.createSpan({ cls: "booklet-inline markdown-rendered" }));
		else into.appendText(p.text);
	}
}

/** A cell's words: a list as a list, else its words. */
function cellInto(host: QueryHost, into: HTMLElement, c: Cell | undefined, asList: boolean): void {
	if (!c) return;
	if (c.list && asList) {
		const ul = into.createEl("ul", { cls: "booklet-q-lines" });
		for (const l of c.list) ul.createEl("li", { text: l });
		return;
	}
	words(host, into, c.parts);
}

/** A tone, said in words to a screen reader too. */
function toneWords(into: HTMLElement, tone: string | null): void {
	if (tone) into.createSpan({ cls: "booklet-sr", text: ` (${QUERY_WORDS.tone[tone] ?? tone})` });
}

/** The row's picture: its `icon` value, when it is the name of an icon; any other name draws nothing. */
function iconInto(into: HTMLElement, r: Row, roles: Roles): void {
	const name = roleText(r, roles.icon).trim();
	const svg = name ? getIcon(name) : null;
	if (!svg) return;
	into.createSpan({ cls: "booklet-q-icon" }).appendChild(svg);
}

/** The words that lead a row, leading where its `link` value goes: a web address or a note; any other target stays plain text. */
function lead(host: QueryHost, into: HTMLElement, r: Row, roles: Roles, draw: (el: HTMLElement) => void): void {
	const to = linkOf(roleText(r, roles.link));
	if (!to) {
		draw(into);
		return;
	}
	if (to.kind === "web") {
		const a = into.createEl("a", { cls: "external-link", attr: { href: to.to, target: "_blank", rel: "noopener" } });
		draw(a);
		return;
	}
	const a = into.createEl("a", { cls: "internal-link", attr: { href: to.to, "data-href": to.to } });
	a.addEventListener("click", (evt) => {
		evt.preventDefault();
		host.openNote(to.to);
	});
	draw(a);
}

function pills(into: HTMLElement, list: readonly string[], tone: string | null): void {
	if (!list.length) return;
	const box = into.createSpan({ cls: "booklet-q-badges" });
	for (const b of list) box.createSpan({ cls: `booklet-q-pill${tone ? ` booklet-tone-${tone}` : ""}`, text: b });
}

function groupHead(into: HTMLElement, g: Group): void {
	if (g.name === null) return;
	const h = into.createDiv({ cls: "booklet-q-group", attr: { role: "heading", "aria-level": "4" } });
	h.appendText(g.name || "–");
	h.createSpan({ cls: "booklet-q-count", text: QUERY_WORDS.rows(g.rows.length) });
}

/* ---- the views ---- */

function table(host: QueryHost, into: HTMLElement, p: Plan): void {
	const { set, roles, cols } = p;
	const all = p.groups.flatMap((g) => g.rows);
	// a column of numbers is set to the right
	const numeric = (k: string) => all.some((r) => r.cells[k]) && all.every((r) => !r.cells[k] || r.cells[k]!.num !== undefined);
	const wrap = into.createDiv({ cls: "booklet-q-wrap" });
	const t = wrap.createEl("table", { cls: "booklet-q-table" });
	const head = t.createEl("thead").createEl("tr");
	for (const k of cols) words(host, head.createEl("th", { cls: numeric(k) ? "booklet-q-num" : "", attr: { scope: "col" } }), set.label(k));
	// the first column that is not the badge leads the row: it carries the row's picture and its link
	const leadKey = cols.find((k) => k !== roles.badge);
	for (const g of p.groups) {
		const body = t.createEl("tbody");
		if (g.name !== null) {
			const th = body.createEl("tr", { cls: "booklet-q-grouprow" }).createEl("th", { attr: { scope: "rowgroup", colspan: String(cols.length) } });
			th.appendText(g.name || "–");
			th.createSpan({ cls: "booklet-q-count", text: QUERY_WORDS.rows(g.rows.length) });
		}
		for (const r of g.rows) {
			const tr = body.createEl("tr");
			for (const k of cols) {
				const td = tr.createEl("td", { cls: numeric(k) ? "booklet-q-num" : "" });
				if (k === roles.badge) {
					const tone = toneOf(r, roles);
					pills(td, badgesOf(r, roles), tone);
					toneWords(td, tone);
				} else if (k === leadKey && (roles.link || roles.icon)) {
					iconInto(td, r, roles);
					lead(host, td, r, roles, (el) => cellInto(host, el, r.cells[k], true));
				} else cellInto(host, td, r.cells[k], true);
			}
		}
	}
}

function listView(host: QueryHost, into: HTMLElement, p: Plan): void {
	const { set, roles, cols } = p;
	const row = (ul: HTMLElement, r: Row) => {
		const li = ul.createEl("li", { cls: "booklet-q-row" });
		const tone = toneOf(r, roles);
		const badges = badgesOf(r, roles);
		const line = li.createDiv({ cls: "booklet-q-line" });
		iconInto(line, r, roles);
		pills(line, badges, tone);
		if (roles.label && r.cells[roles.label]) lead(host, line.createSpan({ cls: "booklet-q-label" }), r, roles, (el) => cellInto(host, el, r.cells[roles.label!], false));
		const extras = cols.filter((k) => (r.cells[k]?.text ?? "") !== "");
		if (extras.length) {
			const x = line.createSpan({ cls: "booklet-q-extras" });
			for (const k of extras) {
				const f = x.createSpan({ cls: "booklet-q-extra" });
				const sr = f.createSpan({ cls: "booklet-sr" });
				words(host, sr, set.label(k));
				sr.appendText(": ");
				cellInto(host, f, r.cells[k], false);
			}
		}
		if (roles.value && r.cells[roles.value]) cellInto(host, line.createSpan({ cls: `booklet-q-value${tone && !badges.length ? ` booklet-tone-${tone}` : ""}` }), r.cells[roles.value], false);
		toneWords(line, tone);
		if (roles.note && r.cells[roles.note]) cellInto(host, li.createDiv({ cls: "booklet-q-note" }), r.cells[roles.note], false);
	};
	for (const g of p.groups) {
		groupHead(into, g);
		const ul = into.createEl("ul", { cls: "booklet-q-list" });
		for (const r of g.rows) row(ul, r);
	}
}

function tiles(host: QueryHost, into: HTMLElement, p: Plan): void {
	const { roles } = p;
	// no row carries a value: there is no big figure to draw, so the tiles are a strip of pills
	const pillsOnly = !roles.value;
	for (const g of p.groups) {
		groupHead(into, g);
		const ul = into.createEl("ul", { cls: pillsOnly ? "booklet-q-tiles booklet-q-pills" : "booklet-q-tiles" });
		for (const r of g.rows) {
			const tone = toneOf(r, roles);
			const li = ul.createEl("li", { cls: `booklet-q-tile${tone ? ` booklet-tone-${tone}` : ""}` });
			iconInto(li, r, roles);
			if (!pillsOnly) cellInto(host, li.createSpan({ cls: "booklet-q-big" }), r.cells[roles.value!], false);
			if (roles.label) lead(host, li.createSpan({ cls: "booklet-q-label" }), r, roles, (el) => cellInto(host, el, r.cells[roles.label!], false));
			if (roles.note && r.cells[roles.note]) cellInto(host, li.createSpan({ cls: "booklet-q-note" }), r.cells[roles.note], false);
			toneWords(li, tone);
		}
	}
}

/** A kept entry as a dated card, its lines the questions; a summary row as a card led by its label. */
function cards(host: QueryHost, into: HTMLElement, p: Plan): void {
	const { set, roles, cols } = p;
	const box = into.createDiv({ cls: "booklet-q-cards" });
	for (const g of p.groups) {
		groupHead(box, g);
		for (const r of g.rows) {
			if (set.kind === "entries") entryCard(host, box, set, r, roles, cols);
			else {
				const tone = toneOf(r, roles);
				const card = box.createDiv({ cls: `booklet-q-card${tone ? ` booklet-tone-${tone}` : ""}` });
				const head = card.createDiv({ cls: "booklet-q-card-title" });
				iconInto(head, r, roles);
				if (roles.label && r.cells[roles.label]) lead(host, head, r, roles, (el) => cellInto(host, el, r.cells[roles.label!], false));
				pills(card, badgesOf(r, roles), tone);
				if (roles.value && r.cells[roles.value]) cellInto(host, card.createDiv({ cls: "booklet-q-big" }), r.cells[roles.value], false);
				if (roles.note && r.cells[roles.note]) cellInto(host, card.createDiv({ cls: "booklet-q-note" }), r.cells[roles.note], false);
				toneWords(card, tone);
			}
		}
	}
}

function entryCard(host: QueryHost, box: HTMLElement, set: RowSet, r: Row, roles: Roles, cols: readonly string[]): void {
	const card = box.createDiv({ cls: "booklet-entry booklet-q-card" });
	const fields = cols.flatMap(set.expand).filter((k) => r.cells[k]);
	if (r.cells["date"]) {
		const when = card.createDiv({ cls: "booklet-entry-when" });
		iconInto(when, r, roles);
		lead(host, when, r, roles, (el) => el.appendText(r.cells["date"]!.text));
	}
	if (!fields.length) return;
	const dl = card.createEl("dl");
	for (const k of fields) {
		words(host, dl.createEl("dt"), set.label(k));
		cellInto(host, dl.createEl("dd"), r.cells[k], true);
	}
}

/** Draws a query's plan into `into` (emptied first). */
export function drawQueryPlan(host: QueryHost, into: HTMLElement, p: QueryPlan): void {
	into.empty();
	if (p.kind === "not-yet") {
		into.createEl("p", { cls: "booklet-muted", text: p.text });
		return;
	}
	into.setAttr("data-booklet-view", p.view);
	if (p.empty !== null) into.createEl("p", { cls: "booklet-muted booklet-q-empty", text: p.empty });
	else if (p.view === "table") table(host, into, p);
	else if (p.view === "list") listView(host, into, p);
	else if (p.view === "tiles") tiles(host, into, p);
	else cards(host, into, p);
}
