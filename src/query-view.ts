/*
 * A query's rows drawn (SPEC section 6): as a table, a list, tiles or cards, each by the parts its fields play (the
 * roles), from the plan the core works out (core/query.ts). Words are set as text, and the file's own inline Markdown
 * (an option, a title) through Obsidian's renderer; a value from the rows is never read as Markdown or HTML. Nothing
 * here is saved: a reader's sorting and filtering, and the rows they open, are the view's to keep for as long as the pane
 * is open, on this device (core/view-state.ts). A row that opens (SPEC section 6, "Rows that open") is a native disclosure whose
 * open part, and its child rows, are drawn when it opens, or at once if the reader had it open.
 */
import { getIcon, setIcon } from "obsidian";
import { drawChart } from "./charts";
import { QUERY_WORDS, badgesOf, buildChart, linkOf, opensRow, roleText, toneOf, type Cell, type Group, type MoreField, type QueryPlan, type QueryViewState, type Role, type Row, type RowSet, type Tree, type WordPart } from "./core";

/** What drawing a query needs from the view. */
export interface QueryHost {
	md(markdown: string, el: HTMLElement): void;
	/** Opens a note a row's link leads to, from this note. */
	openNote(path: string): void;
}

/** How many levels of a nested list are drawn inside one another. */
const MAX_NEST = 200;
/** How far in a nested table's row is set: a chain deeper than this is drawn at this depth (its real depth stays in `data-depth`). */
const MAX_INDENT = 12;

/** What a row that opens does when its disclosure opens or shuts (drawn when it opens, taken away when it shuts). */
export interface NestHook {
	open(): void;
	close(): void;
}
/** The disclosures of one drawing, by element: the view's `toggle` listener calls these (query-controls.ts). */
export type NestHooks = WeakMap<HTMLElement, NestHook>;

/** A small stack of drawing jobs, run until none are left: a chain of rows thousands deep is drawn without a call for each level. */
class Work {
	private readonly jobs: (() => void)[] = [];
	private on = false;
	push(later: readonly (() => void)[]): void {
		for (let i = later.length - 1; i >= 0; i--) this.jobs.push(later[i]!);
	}
	run(): void {
		if (this.on) return;
		this.on = true;
		try {
			while (this.jobs.length) this.jobs.pop()!();
		} finally {
			this.on = false;
		}
	}
}

/** The tree a nested view draws, with what the reader has open and the drawing's own disclosures. */
interface Nest {
	tree: Tree;
	hooks: NestHooks;
	work: Work;
	has(r: Row): boolean;
	isOpen(r: Row): boolean;
	key(r: Row): string;
}

function nestOf(p: Plan, ui?: QueryUi): Nest | null {
	const tree = p.tree;
	if (!tree) return null;
	const key = (r: Row): string => tree.keyOf.get(r) ?? "";
	return {
		tree,
		hooks: new WeakMap(),
		work: new Work(),
		has: (r) => opensRow(tree, r),
		isOpen: (r) => !!ui && (!!ui.force?.has(r) || ui.state.opens.has(key(r))),
		key,
	};
}

type Roles = Record<Role, string | null>;
type Plan = Extract<QueryPlan, { kind: "rows" }>;

/** What the reader has done to the view that drawing needs: the parents they opened, and the parents a search has opened. */
export interface QueryUi {
	state: QueryViewState;
	/** A search is on: the parents of a match stand open, and a parent the reader opens or closes now is not remembered. */
	filtering?: boolean;
	force?: ReadonlySet<Row>;
	/** The table headings sort (the control is offered): the field sorted by and which way, the fields that may be, and what a click on a heading does. */
	sort?: { key: string | null; dir: 1 | -1; keys: ReadonlySet<string>; on(key: string): void };
}

/**
 * Words with nothing in them Markdown reads: letters and digits with single spaces between, starting with a letter (so not a list
 * mark or a number). Obsidian's renderer returns exactly these words, so they are set as text: a table of thousands of kept days
 * with a choice and a scale among its columns would otherwise render the same few option words thousands of times.
 */
const PLAIN_WORDS = /^\p{L}[\p{L}\p{N}]*(?: [\p{L}\p{N}]+)*$/u;

/** Words, as text and the file's own inline Markdown. */
export function words(host: Pick<QueryHost, "md">, into: HTMLElement, parts: readonly WordPart[]): void {
	for (const p of parts) {
		if (!("md" in p)) into.appendText(p.text);
		else if (PLAIN_WORDS.test(p.md)) into.createSpan({ cls: "booklet-inline markdown-rendered", text: p.md });
		else host.md(p.md, into.createSpan({ cls: "booklet-inline markdown-rendered" }));
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
		const a = into.createEl("a", { cls: "external-link", attr: { href: to.to, target: "_blank", rel: "noopener noreferrer" } });
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

/** The most characters a table cell may hold and still be kept on one line (a date and its time is 27). */
const SHORT_CELL = 32;

function groupHead(into: HTMLElement, g: Group): void {
	if (g.name === null) return;
	const h = into.createDiv({ cls: "booklet-q-group", attr: { role: "heading", "aria-level": "2" } });
	h.appendText(g.name || "–");
	h.createSpan({ cls: "booklet-q-count", text: QUERY_WORDS.rows(g.rows.length) });
}

/* ---- the views ---- */

/** The columns that hold a number in every cell they have, and at least one cell. */
export function numericColumns(rows: readonly Row[], cols: readonly string[]): Set<string> {
	return new Set(cols.filter((k) => rows.some((r) => r.cells[k]) && rows.every((r) => !r.cells[k] || r.cells[k].num !== undefined)));
}

/** A nameless row's name to a screen reader (a disclosure with nothing in it to read). */
function nameIfBlank(summary: HTMLElement): void {
	if ((summary.textContent ?? "").trim() === "") summary.createSpan({ cls: "booklet-sr", text: QUERY_WORDS.row });
}

/** A row's open part (SPEC section 6, "What opens"): its other fields, each under its label as plain text with the line breaks kept. */
function moreInto(host: QueryHost, into: HTMLElement, m: readonly MoreField[]): void {
	if (!m.length) return;
	const dl = into.createEl("dl", { cls: "booklet-q-more" });
	for (const f of m) {
		words(host, dl.createEl("dt"), f.label);
		dl.createEl("dd", { cls: "booklet-q-text", text: f.text });
	}
}

/** The heading of a group of child rows, the field they came from. */
function kidHead(host: QueryHost, into: HTMLElement, label: readonly WordPart[]): void {
	words(host, into.createDiv({ cls: "booklet-q-ghead", attr: { role: "heading", "aria-level": "3" } }), label);
}

function table(host: QueryHost, into: HTMLElement, p: Plan, ui?: QueryUi): NestHooks | null {
	const { set, roles, cols } = p;
	const all = p.groups.flatMap((g) => g.rows);
	// a column of numbers is set to the right (worked out once for each column, not for each cell)
	const numeric = numericColumns(all, cols);
	// a column whose every cell is a few words (a date, a name, a number) keeps each cell on one line: a table wider than its card scrolls
	// across, and a date broken into five lines by that squeeze is harder to read than one that scrolls
	const short = new Set(cols.filter((k) => all.every((r) => !r.cells[k]?.list && (r.cells[k]?.text ?? "").length <= SHORT_CELL)));
	const wrap = into.createDiv({ cls: "booklet-q-wrap" });
	const t = wrap.createEl("table", { cls: "booklet-q-table" });
	const head = t.createEl("thead").createEl("tr");
	for (const k of cols) {
		const th = head.createEl("th", { cls: numeric.has(k) ? "booklet-q-num" : "", attr: { scope: "col" } });
		const sort = ui?.sort;
		if (!sort || !sort.keys.has(k)) {
			words(host, th, set.label(k));
			continue;
		}
		// a heading that sorts: a button holding the field's words and which way it is sorted
		const mine = sort.key === k;
		if (mine) th.setAttr("aria-sort", sort.dir === 1 ? "ascending" : "descending");
		const b = th.createEl("button", { cls: `booklet-q-sort${mine ? " is-sorted" : ""}`, attr: { type: "button", "data-key": k } });
		words(host, b.createSpan({ cls: "booklet-q-sort-label" }), set.label(k));
		setIcon(b.createSpan({ cls: "booklet-q-sort-icon", attr: { "aria-hidden": "true" } }), mine ? (sort.dir === 1 ? "lucide-arrow-up" : "lucide-arrow-down") : "lucide-chevrons-up-down");
		b.addEventListener("click", (evt) => {
			evt.preventDefault();
			sort.on(k);
		});
	}
	// the first column that is not the badge leads the row: it carries the row's picture and its link
	const leadKey = cols.find((k) => k !== roles.badge);
	/** One cell's contents, in `td` or in the part of it that is the row's lead (`into`). */
	const fill = (td: HTMLElement, into: HTMLElement, r: Row, k: string): void => {
		td.toggleClass("booklet-q-num", numeric.has(k));
		td.toggleClass("booklet-q-short", short.has(k));
		if (k === roles.badge) {
			const tone = toneOf(r, roles);
			pills(into, badgesOf(r, roles), tone);
			toneWords(into, tone);
		} else if (k === leadKey && (roles.link || roles.icon)) {
			iconInto(into, r, roles);
			lead(host, into, r, roles, (el) => cellInto(host, el, r.cells[k], true));
		} else cellInto(host, into, r.cells[k], true);
	};
	const nest = nestOf(p, ui);
	if (!nest) {
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
					const td = tr.createEl("td");
					fill(td, td, r, k);
				}
			}
		}
		return null;
	}
	// A nested table: one body, every row a row of the same columns, a child one step in from its parent. A row that opens carries a
	// native disclosure in its lead cell; what it opens to (its other fields, its children) is a few rows after it, drawn when it
	// opens and taken away when it shuts. `data-depth` says how far in a row is.
	const body = t.createEl("tbody");
	const span = String(cols.length || 1);
	const nlead = leadKey ?? cols[0];
	const { tree, work } = nest;
	const leadBox = (td: HTMLElement, depth: number): HTMLElement => {
		const box = td.createDiv({ cls: "booklet-q-lead" });
		for (let i = Math.min(depth, MAX_INDENT); i > 0; i--) box.createSpan({ cls: "booklet-q-ind", attr: { "aria-hidden": "true" } });
		return box;
	};
	const rowJob = (r: Row, depth: number): (() => void) => () => {
		const tr = body.createEl("tr", { cls: "booklet-q-trow", attr: { "data-depth": String(depth) } });
		const opens = nest.has(r);
		let details: HTMLDetailsElement | null = null;
		for (const k of cols) {
			const td = tr.createEl("td");
			if (k !== nlead) {
				fill(td, td, r, k);
				continue;
			}
			const box = leadBox(td, depth);
			if (!opens) {
				box.createSpan({ cls: "booklet-q-nocaret", attr: { "aria-hidden": "true" } });
				fill(td, box.createSpan({ cls: "booklet-q-leadtext" }), r, k);
				continue;
			}
			details = box.createEl("details", { attr: { "data-id": nest.key(r) } });
			details.open = nest.isOpen(r);
			const summary = details.createEl("summary");
			fill(td, summary, r, k);
			nameIfBlank(summary);
		}
		if (!opens || !details) return;
		const below = (): (() => void)[] => {
			const jobs: (() => void)[] = [];
			const m = tree.more(r);
			if (m.length)
				jobs.push(() => {
					const td = body.createEl("tr", { cls: "booklet-q-trmore", attr: { "data-depth": String(depth + 1) } }).createEl("td", { attr: { colspan: span } });
					moreInto(host, leadBox(td, depth + 1), m);
				});
			for (const g of tree.groups.get(r) ?? []) {
				if (g.label)
					jobs.push(() => {
						const th = body.createEl("tr", { cls: "booklet-q-grouprow", attr: { "data-depth": String(depth + 1) } }).createEl("th", { attr: { scope: "rowgroup", colspan: span } });
						words(host, leadBox(th, depth + 1), g.label!);
					});
				for (const c of g.rows) jobs.push(rowJob(c, depth + 1));
			}
			return jobs;
		};
		let drawn = nest.isOpen(r);
		if (drawn) work.push(below());
		nest.hooks.set(details, {
			open() {
				if (drawn) return;
				drawn = true;
				// the rows are made at the end of the body, in order, and moved to follow this one
				const last = body.lastElementChild;
				work.push(below());
				work.run();
				const fresh: Element[] = [];
				for (let n = last ? last.nextElementSibling : body.firstElementChild; n; n = n.nextElementSibling) fresh.push(n);
				tr.after(...fresh);
			},
			close() {
				if (!drawn) return;
				drawn = false;
				for (let n = tr.nextElementSibling; n && Number(n.getAttribute("data-depth")) > depth; ) {
					const gone = n;
					n = n.nextElementSibling;
					gone.remove();
				}
			},
		});
	};
	// rows that do not nest may still be grouped, and then each group is headed as in a flat table
	const tops: (() => void)[] = [];
	for (const g of tree.tops) {
		if (g.name !== null)
			tops.push(() => {
				const th = body.createEl("tr", { cls: "booklet-q-grouprow" }).createEl("th", { attr: { scope: "rowgroup", colspan: span } });
				th.appendText(g.name || "–");
				th.createSpan({ cls: "booklet-q-count", text: QUERY_WORDS.rows(g.rows.length) });
			});
		for (const r of g.rows) tops.push(rowJob(r, 0));
	}
	work.push(tops);
	work.run();
	return nest.hooks;
}

function listView(host: QueryHost, into: HTMLElement, p: Plan, ui?: QueryUi): NestHooks | null {
	const { set, roles, cols } = p;
	/** One row's parts, in the element that holds it: an `li`, or the `summary` of a row that opens. */
	const fill = (li: HTMLElement, r: Row) => {
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
	const row = (ul: HTMLElement, r: Row) => {
		const li = ul.createEl("li", { cls: "booklet-q-row" });
		fill(li, r);
		return li;
	};
	const nest = nestOf(p, ui);
	if (!nest) {
		for (const g of p.groups) {
			groupHead(into, g);
			const ul = into.createEl("ul", { cls: "booklet-q-list" });
			for (const r of g.rows) row(ul, r);
		}
		return null;
	}
	// A nested list: a row that opens is a native details, shut until the reader opens it (what they open is kept with the query's
	// view, on this device, and never in the note). Its open part and its child rows are drawn when it opens, or at once if it was
	// kept open. Drawn with a stack of jobs, not a call for each level: a chain thousands deep must not overflow the stack. Past
	// MAX_NEST levels a row's children are drawn in the same list as it, not inside it (a browser lays out a tree that deep very
	// slowly, and no reader opens two hundred levels one by one).
	const { tree, work } = nest;
	const node = (ul: HTMLElement, r: Row, depth: number): (() => void) => () => {
		if (!nest.has(r)) {
			row(ul, r);
			return;
		}
		if (depth >= MAX_NEST) {
			const li = row(ul, r);
			moreInto(host, li, tree.more(r));
			work.push((tree.groups.get(r) ?? []).flatMap((g) => g.rows.map((c) => node(ul, c, depth))));
			return;
		}
		const d = ul.createEl("li", { cls: "booklet-q-node" }).createEl("details", { attr: { "data-id": nest.key(r) } });
		d.open = nest.isOpen(r);
		const summary = d.createEl("summary", { cls: "booklet-q-row" });
		fill(summary, r);
		nameIfBlank(summary);
		let drawn = false;
		const draw = (): void => {
			if (drawn) return;
			drawn = true;
			moreInto(host, d, tree.more(r));
			const jobs: (() => void)[] = [];
			for (const g of tree.groups.get(r) ?? []) {
				if (g.label) jobs.push(() => kidHead(host, d, g.label!));
				jobs.push(() => {
					const kids = d.createEl("ul", { cls: "booklet-q-list" });
					work.push(g.rows.map((c) => node(kids, c, depth + 1)));
				});
			}
			work.push(jobs);
		};
		nest.hooks.set(d, {
			open() {
				draw();
				work.run();
			},
			close() {},
		});
		if (d.open) work.push([draw]);
	};
	const tops: (() => void)[] = [];
	for (const g of tree.tops) {
		tops.push(() => {
			groupHead(into, g);
			const ul = into.createEl("ul", { cls: "booklet-q-list booklet-q-tree" });
			work.push(g.rows.map((r) => node(ul, r, 0)));
		});
	}
	work.push(tops);
	work.run();
	return nest.hooks;
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

/** A kept entry as a dated card, its lines the questions; a summary row as a card led by its label; a data row that opens as a card that folds. */
function cards(host: QueryHost, into: HTMLElement, p: Plan, ui?: QueryUi): NestHooks | null {
	const { set, roles, cols } = p;
	const box = into.createDiv({ cls: "booklet-q-cards" });
	const nest = nestOf(p, ui);
	/** A data row's lines: every field that plays no role, under the title, as on a kept entry's card. */
	const linesInto = (card: HTMLElement, r: Row): void => {
		const lines = set.kind === "data" ? cols.filter((k) => r.cells[k]) : [];
		if (!lines.length) return;
		const dl = card.createEl("dl");
		for (const k of lines) {
			words(host, dl.createEl("dt"), set.label(k));
			cellInto(host, dl.createEl("dd"), r.cells[k], true);
		}
	};
	const plain = (at: HTMLElement, r: Row): HTMLElement => {
		const tone = toneOf(r, roles);
		const card = at.createDiv({ cls: `booklet-q-card${tone ? ` booklet-tone-${tone}` : ""}` });
		const head = card.createDiv({ cls: "booklet-q-card-title" });
		iconInto(head, r, roles);
		if (roles.label && r.cells[roles.label]) lead(host, head, r, roles, (el) => cellInto(host, el, r.cells[roles.label!], false));
		pills(card, badgesOf(r, roles), tone);
		if (roles.value && r.cells[roles.value]) cellInto(host, card.createDiv({ cls: "booklet-q-big" }), r.cells[roles.value], false);
		if (roles.note && r.cells[roles.note]) cellInto(host, card.createDiv({ cls: "booklet-q-note" }), r.cells[roles.note], false);
		linesInto(card, r);
		toneWords(card, tone);
		return card;
	};
	if (!nest) {
		for (const g of p.groups) {
			groupHead(box, g);
			for (const r of g.rows) {
				if (set.kind === "entries") entryCard(host, box, set, r, roles, cols);
				else plain(box, r);
			}
		}
		return null;
	}
	// A card that opens (SPEC section 6, "Rows that open") is a card that folds: its title, badges, value, note and lines stay in sight, and its
	// open part and child cards are drawn when it opens, or at once if it was kept open.
	const { tree, work } = nest;
	const card = (at: HTMLElement, r: Row, depth: number): (() => void) => () => {
		if (!nest.has(r)) {
			plain(at, r);
			return;
		}
		if (depth >= MAX_NEST) {
			const c = plain(at, r);
			moreInto(host, c, tree.more(r));
			work.push((tree.groups.get(r) ?? []).flatMap((g) => g.rows.map((k) => card(at, k, depth))));
			return;
		}
		const tone = toneOf(r, roles);
		const wrap = at.createDiv({ cls: `booklet-q-card booklet-q-fold${tone ? ` booklet-tone-${tone}` : ""}` });
		const d = wrap.createEl("details", { attr: { "data-id": nest.key(r) } });
		d.open = nest.isOpen(r);
		const summary = d.createEl("summary");
		const head = summary.createSpan({ cls: "booklet-q-card-title" });
		iconInto(head, r, roles);
		if (roles.label && r.cells[roles.label]) lead(host, head, r, roles, (el) => cellInto(host, el, r.cells[roles.label!], false));
		pills(summary, badgesOf(r, roles), tone);
		if (roles.value && r.cells[roles.value]) cellInto(host, summary.createSpan({ cls: "booklet-q-big" }), r.cells[roles.value], false);
		if (roles.note && r.cells[roles.note]) cellInto(host, summary.createSpan({ cls: "booklet-q-note" }), r.cells[roles.note], false);
		// the query's `fields:` lines are on the card's closed face (SPEC section 6, "Rows that open"), as on a card that does not open
		linesInto(summary, r);
		toneWords(summary, tone);
		nameIfBlank(summary);
		let drawn = false;
		const draw = (): void => {
			if (drawn) return;
			drawn = true;
			const body = d.createDiv({ cls: "booklet-q-fold-body" });
			moreInto(host, body, tree.more(r));
			const jobs: (() => void)[] = [];
			for (const g of tree.groups.get(r) ?? []) {
				if (g.label) jobs.push(() => kidHead(host, body, g.label!));
				jobs.push(() => {
					const kids = body.createDiv({ cls: "booklet-q-cards booklet-q-sub" });
					work.push(g.rows.map((k) => card(kids, k, depth + 1)));
				});
			}
			work.push(jobs);
		};
		nest.hooks.set(d, {
			open() {
				draw();
				work.run();
			},
			close() {},
		});
		if (d.open) work.push([draw]);
	};
	const tops: (() => void)[] = [];
	for (const g of tree.tops)
		tops.push(() => {
			groupHead(box, g);
			work.push(g.rows.map((r) => card(box, r, 0)));
		});
	work.push(tops);
	work.run();
	return nest.hooks;
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

/**
 * Draws a query's plan into `into` (emptied first). Gives back the disclosures of a nested view (the view's `toggle` listener draws
 * and takes away what a row opens to, query-controls.ts), or null when nothing in it opens.
 */
export function drawQueryPlan(host: QueryHost, into: HTMLElement, p: QueryPlan, ui?: QueryUi): NestHooks | null {
	into.empty();
	into.setAttr("data-booklet-view", p.view);
	if (p.empty !== null) {
		into.createEl("p", { cls: `booklet-muted booklet-q-empty${p.quiet ? " booklet-q-quiet" : ""}`, text: p.empty });
		return null;
	}
	if (p.chart) drawChart(into, buildChart(p, p.groups.flatMap((g) => g.rows)));
	else if (p.view === "table") return table(host, into, p, ui);
	else if (p.view === "list") return listView(host, into, p, ui);
	else if (p.view === "tiles") tiles(host, into, p);
	else return cards(host, into, p, ui);
	return null;
}
