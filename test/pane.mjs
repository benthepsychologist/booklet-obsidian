/*
 * A pane as Obsidian runs it, for the tests of the view's moves (test/navigation*.test.mjs): the booklet view on a fake leaf, over a
 * jsdom document, with the helpers that press a card, a tab or a pager button by its words.
 */
import { testApp, window as w } from "./dom.mjs";
import { sleep } from "./helpers.mjs";
import assert from "node:assert/strict";

process.env.TZ = "UTC";

export const { BookletView } = await import("./.build/view.mjs");
export { sleep };

/**
 * A pane as Obsidian runs it, as far as the moves need: `setViewState` hands the state to the view and, when the view marks the
 * move a step, keeps the place left in a Back list; a second move asked for while one is under way is dropped (design 4.2);
 * Back and Forward hand a kept state to the view without adding a step.
 */
export function pane(text, { path = "Note.booklet.md", screen, delay = 0, state = null, drawLater = false } = {}) {
	const disk = { text, writes: 0 };
	const hist = { back: [], fwd: [] };
	const flight = { busy: false, dropped: 0, calls: 0 };
	const app = testApp(disk, { workspace: { getLeaf: () => leaf } });

	const leaf = {
		app,
		setViewState: async (vs) => {
			flight.calls++;
			if (flight.busy) {
				flight.dropped++;
				return;
			}
			flight.busy = true;
			try {
				if (delay) await sleep(delay);
				const before = view.getState();
				const result = {};
				await view.setState(vs.state, result);
				if (result.history) {
					hist.back.push(before);
					hist.fwd.length = 0;
				}
			} finally {
				flight.busy = false;
			}
		},
	};
	const view = new BookletView(leaf, { setMode: async () => {} });
	view.file = { path, basename: path.replace(/\.md$/, "") };
	view.load();
	void view.setState(state ?? (screen ? { version: 1, screen } : {}), {});
	if (!drawLater) view.setViewData(text, true);
	const el = view.contentEl;
	const all = (sel) => [...el.querySelectorAll(sel)];
	const words = (n) => (n.textContent ?? "").replace(/\s+/g, " ").trim();
	const p = {
		view,
		disk,
		hist,
		flight,
		leaf,
		el,
		all,
		words,
		/** With `drawLater`: hands the note to the view now. */
		draw: () => view.setViewData(text, true),
		get screen() {
			return el.querySelector(".booklet-page")?.getAttribute("data-booklet-screen");
		},
		trail: () => all(".booklet-trail > *").map(words),
		cards: () => all(".booklet-cardrow").map((r) => words(r.querySelector(".booklet-cardtitle"))),
		cardRows: () => all(".booklet-cardrow"),
		tabs: () => all(".booklet-tabbtn").map(words),
		tabOn: () => words(el.querySelector(".booklet-tabbtn.is-active") ?? { textContent: "" }),
		pager: () => ({ at: words(el.querySelector(".booklet-pager-at") ?? { textContent: "" }), buttons: all(".booklet-pager button").map(words) }),
		title: () => words(el.querySelector(".booklet-screentitle")),
		/** Presses a button or card by its words (the first whose words start with them). */
		async press(sel, label) {
			const hit = all(sel).find((b) => words(b).startsWith(label));
			assert.ok(hit, `no ${sel} reading "${label}" on ${p.screen}; there are: ${all(sel).map(words).join(" | ")}`);
			hit.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
			await p.settled();
		},
		card: (label) => p.press(".booklet-cardrow", label),
		trailTo: (label) => p.press(".booklet-trail-link", label),
		tab: (label) => p.press(".booklet-tabbtn", label),
		pageNext: () => p.press(".booklet-pager button", "Next"),
		pageBack: () => p.press(".booklet-pager button", "Back"),
		settled: async () => {
			await sleep(delay + 12);
			await view.writes;
		},
		async back() {
			const s = hist.back.pop();
			assert.ok(s, "nothing to go back to");
			hist.fwd.push(view.getState());
			await view.setState(s, {});
		},
		async forward() {
			const s = hist.fwd.pop();
			assert.ok(s, "nothing to go forward to");
			hist.back.push(view.getState());
			await view.setState(s, {});
		},
		close() {
			view.unload();
			view.containerEl.remove();
		},
	};
	return p;
}

export const sleepFor = async (p) => {
	await sleep(15);
	await p.view.writes;
};
