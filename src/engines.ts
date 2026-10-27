/*
 * A widget question (SPEC section 7), drawn with Obsidian's own buttons and fields: the two engines this
 * plugin has, a grid-select (cells of items to press, and a field in each for words of the reader's own)
 * and an svg-regions without its figure (the places in its `chips` as buttons, then what it is like
 * there). What a press or the reader's words store is worked out by the core (core/widgets.ts), as
 * booklet.html's engines work it out. Data values are plain text: nothing from a widget's data is read
 * as Markdown, and no SVG is drawn.
 *
 * As for every question, the function registered with onShow shows the answer again after a write or a
 * change to the note. It never touches a field for the reader's own words: those keep what is typed in
 * them (held by the view across drawings) until the reader adds it.
 */
import { setIcon } from "obsidian";
import {
	copyOf,
	engineOf,
	gridAddOwn,
	gridChosen,
	gridLabel,
	gridOf,
	gridToggle,
	cellItems,
	cellOwn,
	regionAddOwn,
	regionClear,
	regionClearAt,
	regionLabel,
	regionOwn,
	regionRemoveWord,
	regionRows,
	regionSummary,
	regionToggleWord,
	regionsOf,
	rowFor,
	type Question,
} from "./core";
import { keyOf, pressed, type QuestionHost, type Target } from "./questions";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Draws a widget question into `card`. `locked`: shown, and not answerable. */
export function drawWidget(host: QuestionHost, card: HTMLElement, t: Target, q: Question, locked: boolean): void {
	const box = card.createDiv({ cls: "booklet-question booklet-kind-widget" });
	const data = q.widget?.data;
	const C = data ? copyOf(data) : (Object.create(null) as Record<string, string>);
	// the head is the widget line's title, else the widget's own `h`; the lead its help, else `p` (booklet.html drawWidget)
	const promptId = host.uid();
	const prompt = box.createDiv({ cls: "booklet-prompt", attr: { id: promptId } });
	if (q.title) {
		prompt.addClass("markdown-rendered");
		host.md(q.title, prompt);
	} else prompt.setText(C["h"] || q.id);
	if (q.help) host.md(q.help, box.createDiv({ cls: "booklet-help markdown-rendered" }));
	else if (C["p"]) box.createDiv({ cls: "booklet-help", text: C["p"] });
	for (const k of ["stance", "invite"]) if (C[k]) box.createEl("p", { cls: "booklet-muted", text: C[k] });
	if (!data) {
		box.createEl("p", { cls: "booklet-muted", text: `This widget needs a widget block the note does not carry (^${q.embed ?? "?"}).` });
		return;
	}
	const engine = engineOf(data);
	if (engine === "grid-select") drawGrid(host, box, t, q, data, promptId, locked);
	else if (engine === "svg-regions") drawRegions(host, box, t, q, data, C, promptId, locked);
	else box.createEl("p", { cls: "booklet-muted", text: `Not yet supported: a widget drawn by the engine "${engine || "?"}".` });
}

/**
 * A field and an Add button for words of the reader's own. What is typed and not added is held by the view
 * (`key`), so a drawing of the view keeps it; `add` gets the words, commas between them, when they are added.
 */
function ownField(host: QuestionHost, into: HTMLElement, key: string, labelledBy: string, placeholder: string, locked: boolean, add: (words: string) => void): void {
	const row = into.createDiv({ cls: "booklet-field-row booklet-own-row" });
	const field = row.createEl("input", { cls: "booklet-text", type: "text", attr: { placeholder, autocomplete: "off" } });
	field.setAttr("data-booklet-key", key);
	field.setAttr("aria-labelledby", labelledBy);
	field.disabled = locked;
	field.value = host.heldOf(key);
	field.addEventListener("input", () => host.hold(key, field.value));
	const button = row.createEl("button", { cls: "booklet-add", text: "Add" });
	button.disabled = locked;
	const go = () => {
		const s = field.value;
		field.value = "";
		host.hold(key, "");
		if (s.trim()) add(s);
	};
	field.addEventListener("keydown", (evt) => {
		if (evt.key !== "Enter") return;
		evt.preventDefault();
		go();
	});
	button.addEventListener("click", (evt) => {
		evt.preventDefault();
		go();
		field.focus();
	});
}

/** A pressed button for one of the reader's own words: a press takes it out. */
function ownButton(into: HTMLElement, word: string, locked: boolean, remove: () => void): void {
	const b = into.createEl("button", { cls: "booklet-choice booklet-own" });
	b.createSpan({ cls: "booklet-words", text: word });
	setIcon(b.createSpan({ cls: "booklet-own-x" }), "x");
	b.setAttr("aria-label", `Remove your word "${word}"`);
	pressed(b, true);
	b.disabled = locked;
	b.addEventListener("click", (evt) => {
		evt.preventDefault();
		remove();
	});
}

/* ---- grid-select ---- */

function drawGrid(host: QuestionHost, box: HTMLElement, t: Target, q: Question, data: Record<string, unknown>, promptId: string, locked: boolean): void {
	const g = gridOf(data);
	const key = keyOf(t, q);
	const chosen = () => gridChosen(host.answerOf(t, q));
	const put = (next: unknown[]) => {
		if (!same(next, chosen())) host.answer(t, q, next.length ? next : undefined);
	};
	// the four edge labels around the cells, as booklet.html lays them out: top, left, the cells, right, bottom
	const wrap = box.createDiv({ cls: "booklet-grid" });
	const axis = (where: string, text: string) => {
		const a = wrap.createDiv({ cls: `booklet-axis booklet-axis-${where}`, text });
		if (!text) a.addClass("booklet-axis-none");
	};
	axis("top", g.axes.top);
	axis("left", g.axes.left);
	const cells = wrap.createDiv({ cls: "booklet-cells" });
	cells.setAttr("role", "group");
	cells.setAttr("aria-labelledby", promptId);
	axis("right", g.axes.right);
	axis("bottom", g.axes.bottom);

	const shows: Array<() => void> = [];
	for (const c of g.cells) {
		const cell = cells.createDiv({ cls: "booklet-cell" });
		if (c.colour) cell.addClass(`booklet-colour-${c.colour}`);
		cell.setAttr("data-booklet-cell", c.id);
		const nameId = host.uid();
		cell.createDiv({ cls: "booklet-cell-name", text: c.label, attr: { id: nameId } });
		const items = cell.createDiv({ cls: "booklet-choices booklet-cell-items" });
		items.setAttr("role", "group");
		items.setAttr("aria-labelledby", nameId);
		if (q.readonly) {
			// read-only: the cell's items as plain words, and nothing to press (SPEC section 7)
			for (const it of cellItems(g, c.id)) items.createSpan({ cls: "booklet-word", text: it.label });
			for (const id of cellOwn(g, host.answerOf(t, q), c.id)) items.createSpan({ cls: "booklet-word", text: gridLabel(g, id) });
			continue;
		}
		const buttons = cellItems(g, c.id).map((it) => {
			const b = items.createEl("button", { cls: "booklet-choice booklet-item", text: it.label });
			b.disabled = locked;
			b.addEventListener("click", (evt) => {
				evt.preventDefault();
				put(gridToggle(chosen(), it.id));
			});
			return { b, id: it.id };
		});
		const own = items.createDiv({ cls: "booklet-own-picks" });
		let sig = "";
		shows.push(() => {
			const c0 = chosen();
			for (const { b, id } of buttons) pressed(b, c0.includes(id));
			const mine = cellOwn(g, c0, c.id);
			const now = JSON.stringify(mine);
			if (now === sig) return;
			sig = now;
			own.empty();
			for (const id of mine) ownButton(own, gridLabel(g, id), locked, () => put(gridToggle(chosen(), id)));
		});
		ownField(host, cell, `${key}#own:${c.id}`, nameId, "Add your own", locked, (words) => put(gridAddOwn(g, chosen(), c.id, words)));
	}
	if (q.describe && g.cells.some((c) => c.note)) {
		const notes = box.createDiv({ cls: "booklet-notes" });
		for (const c of g.cells) {
			if (!c.note) continue;
			const n = notes.createDiv({ cls: "booklet-note" });
			if (c.colour) n.addClass(`booklet-colour-${c.colour}`);
			n.createEl("strong", { text: c.label });
			n.appendText(" " + c.note);
		}
	}
	const show = () => {
		for (const s of shows) s();
	};
	show();
	host.onShow(key, show);
}

/* ---- svg-regions, without its figure ---- */

function drawRegions(
	host: QuestionHost,
	box: HTMLElement,
	t: Target,
	q: Question,
	data: Record<string, unknown>,
	C: Record<string, string>,
	promptId: string,
	locked: boolean,
): void {
	const rg = regionsOf(data);
	const key = keyOf(t, q);
	const rows = () => regionRows(host.answerOf(t, q));
	const put = (next: unknown[]) => {
		if (!same(next, rows())) host.answer(t, q, next.length ? next : undefined);
	};
	const clearWord = C["clear"] || "Clear";
	if (rg.figures) box.createEl("p", { cls: "booklet-muted", text: "Not yet supported: drawing the widget's figure." });
	const describe = () => {
		if (!q.describe || !rg.regions.some((r) => r.note)) return;
		const notes = box.createDiv({ cls: "booklet-notes" });
		for (const r of rg.regions) {
			if (!r.note) continue;
			const n = notes.createDiv({ cls: "booklet-note" });
			n.createEl("strong", { text: r.label });
			n.appendText(" " + r.note);
		}
	};
	if (q.readonly) {
		// read-only: the regions named, and nothing to point at or answer (named from `regions`, as there is no figure)
		const names = box.createDiv({ cls: "booklet-choices booklet-places" });
		for (const r of rg.regions) names.createSpan({ cls: "booklet-word", text: r.label });
		describe();
		return;
	}

	// which place is open is the view's, not the answer's: kept with the view's held words across drawings
	const activeKey = `${key}#open`;
	let active: string | null = host.heldOf(activeKey) || null;

	const chips = box.createDiv({ cls: "booklet-choices booklet-places" });
	chips.setAttr("role", "group");
	chips.setAttr("aria-labelledby", promptId);
	const chipButtons = rg.chips.map((id) => {
		const b = chips.createEl("button", { cls: "booklet-choice booklet-place" });
		b.createSpan({ cls: "booklet-words", text: regionLabel(rg, id) });
		const count = b.createSpan({ cls: "booklet-count" });
		b.disabled = locked;
		b.addEventListener("click", (evt) => {
			evt.preventDefault();
			open(id);
		});
		return { b, id, count };
	});

	const panel = box.createDiv({ cls: "booklet-panel" });
	const summary = box.createDiv({ cls: "booklet-summary" });
	describe();

	// the panel: the open place's sense words, its own words, a field for more and Clear. Drawn again only when
	// another place is opened (a press, never while the reader is in its field); otherwise shown again in place.
	let showPanel = () => {};
	const drawPanel = () => {
		panel.empty();
		showPanel = () => {};
		if (!active) {
			if (C["none"]) panel.createEl("p", { cls: "booklet-muted", text: C["none"] });
			return;
		}
		const place = active;
		const titleId = host.uid();
		panel.createDiv({ cls: "booklet-panel-title", text: regionLabel(rg, place), attr: { id: titleId } });
		if (C["pick"]) panel.createEl("p", { cls: "booklet-muted", text: C["pick"] });
		const words: { b: HTMLElement; id: string }[] = [];
		for (const g of rg.senses) {
			const set = panel.createDiv({ cls: "booklet-sense-group" });
			const gid = host.uid();
			set.createDiv({ cls: "booklet-sense-label", text: g.label, attr: { id: gid } });
			const row = set.createDiv({ cls: "booklet-choices" });
			row.setAttr("role", "group");
			row.setAttr("aria-labelledby", gid);
			for (const w of g.words) {
				const b = row.createEl("button", { cls: "booklet-choice booklet-sense", text: w.label });
				b.disabled = locked;
				b.addEventListener("click", (evt) => {
					evt.preventDefault();
					put(regionToggleWord(rows(), place, w.id));
				});
				words.push({ b, id: w.id });
			}
		}
		const own = panel.createDiv({ cls: "booklet-choices booklet-own-words" });
		ownField(host, panel, `${key}#own:${place}`, titleId, "Add your own words", locked, (typed) => put(regionAddOwn(rg, rows(), place, typed)));
		const foot = panel.createDiv({ cls: "booklet-panel-foot" });
		const clear = foot.createEl("button", { cls: "booklet-clear", text: clearWord });
		clear.addEventListener("click", (evt) => {
			evt.preventDefault();
			put(regionClear(rows(), place));
		});
		let sig = "";
		showPanel = () => {
			const r = rowFor(rows(), place);
			const s = r && Array.isArray(r.s) ? r.s : [];
			for (const { b, id } of words) pressed(b, s.includes(id));
			clear.disabled = locked || !r;
			const mine = regionOwn(rg, rows(), place);
			const now = JSON.stringify(mine);
			if (now === sig) return;
			sig = now;
			own.empty();
			for (const word of mine) ownButton(own, word, locked, () => put(regionRemoveWord(rg, rows(), place, word)));
		};
		showPanel();
	};
	const open = (id: string) => {
		active = id;
		host.hold(activeKey, id);
		drawPanel();
		show();
	};

	let summarySig = "";
	const show = () => {
		const v = rows();
		for (const { b, id, count } of chipButtons) {
			const r = rowFor(v, id);
			const n = r && Array.isArray(r.s) ? r.s.length : 0;
			pressed(b, id === active);
			b.toggleClass("booklet-marked", !!r);
			count.setText(n ? String(n) : "");
		}
		showPanel();
		const list = regionSummary(rg, v);
		const now = JSON.stringify(list);
		if (now === summarySig) return;
		summarySig = now;
		summary.empty();
		for (const r of list) {
			const line = summary.createDiv({ cls: "booklet-summary-row" });
			const name = line.createEl("button", { cls: "booklet-link", text: r.label });
			name.disabled = locked;
			name.addEventListener("click", (evt) => {
				evt.preventDefault();
				open(r.region);
			});
			line.createSpan({ cls: "booklet-summary-words", text: r.words.length ? `— ${r.words.join(", ")}` : "" });
			const x = line.createEl("button", { cls: "booklet-clear booklet-summary-x" });
			setIcon(x, "x");
			x.setAttr("aria-label", `${clearWord}: ${r.label}`);
			x.disabled = locked;
			x.addEventListener("click", (evt) => {
				evt.preventDefault();
				put(regionClearAt(rows(), r.index));
			});
		}
	};
	drawPanel();
	show();
	host.onShow(key, show);
}
