/*
 * The reader's own sort and filter of a query's rows (SPEC section 6, "Sorting and filtering are the reader's"): from nine
 * rows a closed "Sort and filter" button opens a search, a "Sort by" menu with a direction button, a count line and Clear;
 * a table's headings sort too. A line chart keeps its order, so it has the search alone. What the reader sets lives in the
 * query's `QueryViewState`, kept by the open pane and saved nowhere: nothing here writes the note. The control is built
 * once, so typing keeps its focus while the rows below it are drawn again (what the state leaves: core/view-state.ts).
 */
import { setIcon } from "obsidian";
import { QUERY_WORDS, applyViewState, sortKeys, wantsControls, type QueryPlan, type QueryViewState } from "./core";
import { drawQueryPlan, type QueryHost } from "./query-view";

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
export function mountQuery(host: QueryHost, box: HTMLElement, st: QueryViewState): (plan: () => QueryPlan) => void {
	// a view with no control is drawn straight into the box; one with it holds the control (slot) above its rows (out)
	let slot: HTMLElement | null = null;
	let out: HTMLElement = box;
	let plan: QueryPlan | null = null;
	let controls: Controls | null = null;

	const paint = (focusHead?: string): void => {
		if (!plan) return;
		if (!wantsControls(plan)) {
			// too few rows (or none, or not rows at all): drawn as the query says, with no control; what the reader set is kept
			slot = null;
			out = box;
			controls = null;
			drawQueryPlan(host, box, plan, { state: st });
			return;
		}
		if (!slot) {
			box.empty();
			slot = box.createDiv({ cls: "booklet-qc-slot" });
			out = box.createDiv({ cls: "booklet-q-out" });
		}
		const sig = sortKeys(plan).map((k) => k.key).join("\n");
		if (!controls || controls.signature !== sig) {
			slot.empty();
			controls = drawControls(slot, plan, st, () => paint());
		}
		const shown = applyViewState(plan, st);
		controls.tell(shown.shown, shown.total);
		if (shown.filtering && shown.shown === 0) {
			out.empty();
			return;
		}
		const keys = new Set(sortKeys(plan).map((k) => k.key));
		drawQueryPlan(host, out, shown.plan, {
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
	return (make) => {
		// one query that cannot be worked out or drawn says so in its own place, and the rest of the screen still draws
		try {
			plan = make();
			paint();
		} catch (e) {
			plan = null;
			slot = null;
			out = box;
			controls = null;
			box.empty();
			box.removeAttribute("data-booklet-view");
			box.createEl("p", { cls: "booklet-muted booklet-q-error", text: QUERY_WORDS.failed(e instanceof Error ? e.message : String(e)) });
		}
	};
}

/** Builds the control (once for a view): its parts, and what to call when the count or the reader's choices change. */
function drawControls(into: HTMLElement, p: Extract<QueryPlan, { kind: "rows" }>, st: QueryViewState, changed: () => void): Controls {
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
		st.key = sel!.value || null;
		if (st.key === null) st.dir = 1;
		changed();
	});
	dir?.addEventListener("click", (evt) => {
		evt.preventDefault();
		st.dir = st.dir === 1 ? -1 : 1;
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
		signature: keys.map((k) => k.key).join("\n"),
		tell(shown, total) {
			count.setText(st.q.trim() === "" ? QUERY_WORDS.rows(total) : shown === 0 ? W.nothing : W.shown(shown, total));
			paintChoices();
		},
	};
}
