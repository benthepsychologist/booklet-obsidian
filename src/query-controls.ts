/*
 * The reader's own sort and filter of a query's rows (SPEC section 6, "Sorting and filtering are the reader's"): from nine
 * rows a closed "Sort and filter" button opens a search, a "Sort by" menu with a direction button, a count line and Clear;
 * a table's headings sort too. A line chart keeps its order, so it has the search alone. What the reader sets lives in the
 * query's `QueryViewState`, kept by the open pane and saved nowhere: nothing here writes the note. The control is built
 * once, so typing keeps its focus while the rows below it are drawn again (what the state leaves: core/view-state.ts).
 */
import { setIcon } from "obsidian";
import { QUERY_WORDS, applyViewState, openAllRows, sortKeys, wantsControls, type QueryPlan, type QueryViewState } from "./core";
import { drawQueryPlan, type NestHooks, type QueryHost } from "./query-view";

type Plan = Extract<QueryPlan, { kind: "rows" }>;

/** A query's mount: call it with the plan each time the plan is worked out; `printRows` is the page's print (below). */
export interface QueryMount {
	/** Draws the plan. `keep`: the rows are drawn again over what the reader is looking at (the file changed, the pane came back), so scroll and focus stay. */
	(plan: () => QueryPlan, keep?: boolean): void;
	/**
	 * Printing prints everything: `printRows(true)` before a print opens every closed row and draws what it opens to at once (a toggle
	 * event comes too late to draw anything for the print); `printRows(false)` after it folds back exactly the rows it opened. The
	 * rows the reader has open (their `QueryViewState`) are not touched. A print that began and never ended (`afterprint` is not always
	 * sent) is folded back first, so each print starts from the reader's own rows.
	 */
	printRows(on: boolean): void;
}

/** Where the reader is looking in a query's drawn rows, to put back after they are drawn again: scroll (the page's and a wide table's) and the focused control. */
function placeOf(box: HTMLElement): () => void {
	const scrolls: [HTMLElement, number, number][] = [];
	for (let n: HTMLElement | null = box; n; n = n.parentElement) if (n.scrollTop || n.scrollLeft) scrolls.push([n, n.scrollTop, n.scrollLeft]);
	const wraps = Array.from(box.querySelectorAll<HTMLElement>(".booklet-q-wrap")).map((w) => w.scrollLeft);
	const FOCUSABLE = "summary, button, a[href], input, select";
	const active = box.ownerDocument.activeElement;
	const at = active && box.contains(active) ? Array.from(box.querySelectorAll(FOCUSABLE)).indexOf(active) : -1;
	return () => {
		for (const [n, top, left] of scrolls) {
			n.scrollTop = top;
			n.scrollLeft = left;
		}
		Array.from(box.querySelectorAll<HTMLElement>(".booklet-q-wrap")).forEach((w, i) => {
			if (wraps[i]) w.scrollLeft = wraps[i]!;
		});
		if (at >= 0) Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE))[at]?.focus({ preventScroll: true });
	};
}

/** The pieces of the control that change as the rows do. */
interface Controls {
	/** The fields the menu lists, which tells whether the control still fits the plan. */
	signature: string;
	/** Shows the reader's choices (menu, direction, Clear) and the count line. */
	tell(shown: number, total: number): void;
}

/**
 * Draws one query into `box`: the control above (when the view has enough rows) and the rows below. Returns what to call,
 * with the query's plan, each time the plan is worked out again. The first call draws.
 */
export function mountQuery(host: QueryHost, box: HTMLElement, st: QueryViewState): QueryMount {
	// a view with no control is drawn straight into the box; one with it holds the control (slot) above its rows (out)
	let slot: HTMLElement | null = null;
	let out: HTMLElement = box;
	let plan: QueryPlan | null = null;
	let controls: Controls | null = null;
	// the disclosures of what is drawn, and whether a search is on (a row opened or shut while it is on is not remembered)
	let hooks: NestHooks | null = null;
	let filtering = false;
	/**
	 * `lent`: the rows a print opened, each with whether the toggle event of that opening is still to come (true) or has come. That one
	 * event is the print's own and is not the reader's; any later toggle of a lent row is the reader's, and takes the row over (it is no
	 * longer lent, so a print that never ends with afterprint cannot swallow what the reader does next).
	 */
	const lent = new Map<HTMLDetailsElement, boolean>();
	// What the reader opens is kept with the rest of the query's state, and what a row opens to is drawn here, when it opens (or taken
	// away when it shuts, in a table, whose open rows are not inside the disclosure). A toggle does not bubble, so this listens on the
	// way down.
	box.addEventListener(
		"toggle",
		(evt) => {
			const d = evt.target as HTMLDetailsElement | null;
			if (!d || d.tagName.toLowerCase() !== "details") return;
			const h = hooks?.get(d);
			if (h) {
				if (d.open) h.open();
				else h.close();
			}
			const mine = lent.get(d);
			if (mine !== undefined) {
				if (mine && d.open) {
					lent.set(d, false);
					return;
				}
				lent.delete(d);
			}
			if (filtering) return;
			const id = d.getAttribute("data-id");
			if (id === null) return;
			if (d.open) st.opens.add(id);
			else st.opens.delete(id);
		},
		true,
	);
	const fold = (): void => {
		for (const d of Array.from(lent.keys()).reverse()) {
			d.open = false;
			hooks?.get(d)?.close();
		}
		lent.clear();
	};

	const paint = (focusHead?: string, keep = false): void => {
		if (!plan) return;
		// a print in flight belongs to rows that are about to be replaced
		lent.clear();
		const back = keep ? placeOf(box) : null;
		try {
			paintRows(focusHead);
		} finally {
			back?.();
		}
	};
	const paintRows = (focusHead?: string): void => {
		if (!plan) return;
		if (!wantsControls(plan)) {
			// too few rows (or none, or not rows at all): drawn as the query says, with no control; what the reader set is kept
			slot = null;
			out = box;
			controls = null;
			filtering = false;
			hooks = drawQueryPlan(host, box, plan, { state: st });
			return;
		}
		if (!slot) {
			box.empty();
			slot = box.createDiv({ cls: "booklet-qc-slot" });
			out = box.createDiv({ cls: "booklet-q-out" });
		}
		const sig = signatureOf(plan);
		if (!controls || controls.signature !== sig) {
			slot.empty();
			controls = drawControls(slot, plan, st, () => paint(), () => plan);
		}
		const shown = applyViewState(plan, st);
		controls.tell(shown.shown, shown.total);
		filtering = shown.filtering;
		if (shown.filtering && shown.shown === 0) {
			out.empty();
			hooks = null;
			return;
		}
		const keys = new Set(sortKeys(plan).map((k) => k.key));
		hooks = drawQueryPlan(host, out, shown.plan, {
			state: st,
			filtering: shown.filtering,
			force: shown.force,
			sort: {
				key: st.key,
				dir: st.dir,
				keys,
				on: (key) => {
					// a heading: ascending, then descending, then the original order again
					if (st.key !== key) {
						st.key = key;
						st.dir = 1;
					} else if (st.dir === 1) st.dir = -1;
					else {
						st.key = null;
						st.dir = 1;
					}
					paint(key);
				},
			},
		});
		box.setAttr("data-booklet-view", out.getAttribute("data-booklet-view") ?? "");
		if (focusHead) out.querySelector<HTMLElement>(`button.booklet-q-sort[data-key="${CSS.escape(focusHead)}"]`)?.focus();
	};
	const mount = ((make: () => QueryPlan, keep?: boolean) => {
		// one query that cannot be worked out or drawn says so in its own place, and the rest of the screen still draws
		try {
			plan = make();
			paint(undefined, keep);
		} catch (e) {
			plan = null;
			slot = null;
			out = box;
			controls = null;
			hooks = null;
			box.empty();
			box.removeAttribute("data-booklet-view");
			box.createEl("p", { cls: "booklet-muted booklet-q-error", text: QUERY_WORDS.failed(e instanceof Error ? e.message : String(e)) });
		}
	}) as QueryMount;
	mount.printRows = (on) => {
		if (!on) {
			fold();
			return;
		}
		fold();
		// opening a row draws its children, which may be closed too: go on until nothing closed is left
		for (let more = true; more; ) {
			more = false;
			for (const d of Array.from(box.querySelectorAll("details"))) {
				const h = hooks?.get(d);
				if (!h || d.open) continue;
				lent.set(d, true);
				d.open = true;
				h.open();
				more = true;
			}
		}
	};
	return mount;
}

/** What tells whether the control still fits the plan: the fields the menu lists, and whether the rows nest (Open all and Close all). */
const signatureOf = (p: Plan): string => `${sortKeys(p).map((k) => k.key).join("\n")}${p.tree ? "\u0000nest" : ""}`;

/** Builds the control (once for a view): its parts, and what to call when the count or the reader's choices change. */
function drawControls(into: HTMLElement, p: Plan, st: QueryViewState, changed: () => void, current: () => QueryPlan | null): Controls {
	const W = QUERY_WORDS.controls;
	const keys = sortKeys(p);
	const box = into.createDiv({ cls: "booklet-qc" });
	const toggle = box.createEl("button", { cls: "booklet-qc-toggle clickable-icon", attr: { type: "button", "aria-expanded": String(st.open) } });
	setIcon(toggle.createSpan({ cls: "booklet-qc-icon", attr: { "aria-hidden": "true" } }), "lucide-list-filter");
	toggle.createSpan({ cls: "booklet-qc-toggle-label", text: W.toggle });
	const bar = box.createDiv({ cls: "booklet-qc-bar" });
	bar.hidden = !st.open;
	toggle.addEventListener("click", (evt) => {
		evt.preventDefault();
		st.open = !st.open;
		bar.hidden = !st.open;
		toggle.setAttr("aria-expanded", String(st.open));
	});

	const searchBox = bar.createDiv({ cls: "search-input-container booklet-qc-search" });
	const input = searchBox.createEl("input", { attr: { type: "search", placeholder: W.search, "aria-label": W.search, spellcheck: "false", enterkeyhint: "search" } });
	input.value = st.q;
	const wipe = searchBox.createDiv({ cls: "search-input-clear-button", attr: { "aria-label": W.clearSearch, role: "button" } });

	// a line chart keeps its order: no menu, no direction
	let sel: HTMLSelectElement | null = null;
	let dir: HTMLButtonElement | null = null;
	if (keys.length) {
		const sortRow = bar.createDiv({ cls: "booklet-qc-sort" });
		sel = sortRow.createEl("select", { cls: "dropdown", attr: { "aria-label": W.sortBy } });
		sel.createEl("option", { value: "", text: W.original });
		for (const k of keys) sel.createEl("option", { value: k.key, text: `${W.sortBy} ${k.label}` });
		sel.value = st.key ?? "";
		dir = sortRow.createEl("button", { cls: "booklet-qc-dir clickable-icon", attr: { type: "button" } });
	}
	const count = bar.createDiv({ cls: "booklet-qc-count", attr: { "aria-live": "polite" } });
	// a nested view: Open all opens every row that opens (not only the ones a search keeps), Close all shuts them
	const openAll = p.tree ? bar.createEl("button", { cls: "booklet-qc-all booklet-qc-openall", text: W.openAll, attr: { type: "button" } }) : null;
	const closeAll = p.tree ? bar.createEl("button", { cls: "booklet-qc-all booklet-qc-closeall", text: W.closeAll, attr: { type: "button" } }) : null;
	const reset = bar.createEl("button", { cls: "booklet-qc-clear", text: W.clear, attr: { type: "button" } });

	const paintChoices = (): void => {
		if (sel) sel.value = st.key ?? "";
		if (dir) {
			dir.setAttr("aria-label", st.dir === 1 ? W.ascending : W.descending);
			dir.empty();
			setIcon(dir, st.dir === 1 ? "lucide-arrow-up" : "lucide-arrow-down");
			dir.disabled = st.key === null;
		}
		wipe.toggleClass("is-visible", st.q !== "");
		reset.hidden = st.q === "" && st.key === null;
	};
	paintChoices();
	input.addEventListener("input", () => {
		st.q = input.value;
		changed();
	});
	wipe.addEventListener("click", () => {
		st.q = "";
		input.value = "";
		changed();
		input.focus();
	});
	input.addEventListener("keydown", (evt: KeyboardEvent) => {
		if (evt.key === "Escape" && st.q !== "") {
			evt.preventDefault();
			evt.stopPropagation();
			wipe.click();
		}
	});
	sel?.addEventListener("change", () => {
		st.key = sel.value || null;
		if (st.key === null) st.dir = 1;
		changed();
	});
	dir?.addEventListener("click", (evt) => {
		evt.preventDefault();
		st.dir = st.dir === 1 ? -1 : 1;
		changed();
	});
	openAll?.addEventListener("click", (evt) => {
		evt.preventDefault();
		const now = current();
		if (now && now.kind === "rows") openAllRows(now, st);
		changed();
	});
	closeAll?.addEventListener("click", (evt) => {
		evt.preventDefault();
		st.opens.clear();
		changed();
	});
	reset.addEventListener("click", (evt) => {
		evt.preventDefault();
		st.q = "";
		st.key = null;
		st.dir = 1;
		input.value = "";
		changed();
	});
	return {
		signature: signatureOf(p),
		tell(shown, total) {
			count.setText(st.q.trim() === "" ? QUERY_WORDS.rows(total) : shown === 0 ? W.nothing : W.shown(shown, total));
			paintChoices();
		},
	};
}
