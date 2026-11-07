/*
 * The view asks Obsidian once which format it gives a callout's colour in (an `r, g, b` triplet in the older ones, a plain colour in the newer),
 * and says so with a class on the view, so the stylesheet has a tint, a border and an edge in the callout's own colour in either (0.13.0).
 * The probe callout it asks with is never left in the page. Every note is made up.
 */
import { openView, window as w } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const NOTE = `---\nbooklet: "0.19"\n---\n\n> [!activity|a] A\n\nSome words.\n`;

/** The view over a note, with `colour` as the callout colour Obsidian reports for a callout of the kind `note`. */
async function openWith(colour) {
	const real = w.getComputedStyle;
	w.getComputedStyle = (el, ...rest) => {
		const s = real.call(w, el, ...rest);
		return new Proxy(s, {
			get: (t, k) => (k === "getPropertyValue" ? (n) => (n === "--callout-color" ? colour : t.getPropertyValue(n)) : typeof t[k] === "function" ? t[k].bind(t) : t[k]),
		});
	};
	try {
		const v = openView(NOTE, { screen: "activity:/a" });
		await v.settled();
		return v;
	} finally {
		w.getComputedStyle = real;
	}
}

test("callout colour: a triplet puts booklet-callout-triplet on the view, and the probe is gone", async () => {
	const v = await openWith("8, 109, 221");
	const root = v.view.contentEl;
	assert.ok(root.classList.contains("booklet-view"));
	assert.ok(root.classList.contains("booklet-callout-triplet"));
	assert.equal(root.querySelectorAll(".booklet-probe").length, 0, "the probe callout is taken away");
	v.close();
});

test("callout colour: a plain colour leaves the class off, and so does no answer at all", async () => {
	for (const colour of ["#086ddd", "rgb(8, 109, 221)", "oklch(0.55 0.19 256)", ""]) {
		const v = await openWith(colour);
		assert.ok(!v.view.contentEl.classList.contains("booklet-callout-triplet"), `"${colour}" is not a triplet`);
		v.close();
	}
});
