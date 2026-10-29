/*
 * A matrix question (SPEC section 5, "Matrix: items and anchors"): several items answered on one shared scale of anchors.
 * The answer is a list with one anchor number per item, by position, `null` for an item not yet answered
 * (booklet.html drawMatrix).
 *
 * How it is drawn is the renderer's business, and it follows the format's one rule: where each item's words, at a
 * readable width, and the row of anchors fit side by side, the matrix is a grid of rows; where they do not (a phone, a
 * narrow pane), each item is drawn as a single-choice question of its own, the anchors its options, and the matrix's
 * own words are the stem above them, held at the top of the screen while the items scroll. The answer is the same list
 * under the same key either way, so a pane made narrower and wider again loses no answer. The two are one set of
 * buttons laid out two ways (a class on the question), so a press, the focus and the keyboard are not disturbed when
 * the pane changes width.
 */
import type { Question } from "./core";
import { pressed, type Label, type QuestionHost, type Target } from "./questions";

/** Draws a matrix's items and anchors into `box` (below its words). */
export function drawMatrix(host: QuestionHost, box: HTMLElement, t: Target, q: Question, key: string, label: Label, locked: boolean): void {
	const wrap = box.createDiv({ cls: "booklet-mxwrap" });
	// measured, never seen: the anchors in one row, after room for an item's words (the grid's width, in styles.css)
	const probe = wrap.createDiv({ cls: "booklet-mxprobe", attr: { "aria-hidden": "true" } });
	for (const a of q.anchors) host.md(a.text, probe.createSpan({ cls: "booklet-mxprobe-anchor markdown-rendered" }));

	const rows = wrap.createDiv({ cls: "booklet-mx" });
	const buttons: HTMLButtonElement[][] = [];
	const cur = (i: number): number | null => {
		const v = host.answerOf(t, q);
		return Array.isArray(v) && typeof v[i] === "number" ? v[i] : null;
	};
	/** An item's answer set to an anchor, or to `null`; the other items' stay as they are. */
	const set = (i: number, n: number | null): void => {
		const v = host.answerOf(t, q);
		const next: unknown[] = Array.isArray(v) ? v.slice() : [];
		while (next.length < q.items.length) next.push(null);
		next[i] = n;
		host.answer(t, q, next.some((x) => typeof x === "number") ? next : undefined);
	};
	q.items.forEach((item, i) => {
		const row = rows.createDiv({ cls: "booklet-mxitem" });
		const wordsId = host.uid();
		host.md(item, row.createDiv({ cls: "booklet-mxwords markdown-rendered", attr: { id: wordsId } }));
		const opts = row.createDiv({ cls: "booklet-choices booklet-mxopts" });
		opts.setAttr("role", "group");
		opts.setAttr("aria-labelledby", wordsId);
		buttons.push(
			q.anchors.map((a) => {
				const b = opts.createEl("button", { cls: "booklet-choice" });
				host.md(a.text, b.createDiv({ cls: "booklet-words markdown-rendered" }));
				b.disabled = locked;
				b.addEventListener("click", (evt) => {
					evt.preventDefault();
					// pressing the picked anchor again clears the item
					set(i, cur(i) === a.n ? null : a.n);
				});
				return b;
			}),
		);
	});
	label(rows);
	rows.setAttr("role", "group");

	const show = (): void => {
		buttons.forEach((bs, i) => bs.forEach((b, k) => pressed(b, cur(i) === q.anchors[k]!.n)));
	};
	show();
	host.onShow(key, show);

	fitToWidth(box, wrap, probe);
}

/**
 * Lays the matrix out as a grid while its room fits the grid, else as separate questions (a class on `box`, when the
 * box is a question of its own, and on `wrap`). Measured when the box is shown and whenever its width changes, and
 * whenever the anchors' words are rendered or change size (the probe).
 */
function fitToWidth(box: HTMLElement, wrap: HTMLElement, probe: HTMLElement): void {
	const place = (): void => {
		const w = wrap.clientWidth;
		if (!w) return;
		const stacked = w < probe.offsetWidth;
		wrap.toggleClass("booklet-mx-stacked", stacked);
		if (box.hasClass("booklet-question")) box.toggleClass("booklet-mx-stacked", stacked);
	};
	if (typeof ResizeObserver !== "function") return;
	const watch = new ResizeObserver(place);
	watch.observe(wrap);
	watch.observe(probe);
	// an item the keyboard moves into under the held stem is scrolled clear of it, as far as the screen has room
	// (SPEC section 5); only the keyboard's focus: a press is never moved
	wrap.addEventListener("focusin", (evt) => {
		const target = evt.target;
		if (!(target instanceof HTMLElement) || !wrap.hasClass("booklet-mx-stacked")) return;
		const stem = box.querySelector<HTMLElement>(":scope > .booklet-prompt");
		const item = target.closest<HTMLElement>(".booklet-mxitem");
		const scroller = box.closest<HTMLElement>(".view-content");
		let visible = false;
		try {
			visible = target.matches(":focus-visible");
		} catch {
			// a browser without :focus-visible
		}
		if (!stem || !item || !scroller || !visible) return;
		const held = stem.getBoundingClientRect().bottom;
		const itemTop = item.getBoundingClientRect().top;
		if (itemTop >= held) return;
		const r = target.getBoundingClientRect();
		const by = Math.max(held + 12 - r.top, Math.min(held + 12 - itemTop, scroller.getBoundingClientRect().bottom - 12 - r.bottom));
		if (by) scroller.scrollBy(0, -by);
	});
}
