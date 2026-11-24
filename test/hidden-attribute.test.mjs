/*
 * An element the plugin hides with the `hidden` attribute must be hidden whatever display its class gives it (beta.2: the sentence about
 * a "+" stayed under every folded hint because `.booklet-design-rows-usedby` is a flex row, and a class beats the browser's own [hidden] rule).
 * The real-app proof is check 96; this holds the rule itself, in the source sheet and in the built one, and that it needs no !important.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROOT } from "./helpers.mjs";

const RULE = /:is\(\.booklet-design, \.booklet-view, \.booklet-blocks, \.booklet-settings, \.booklet-sample\) \[hidden\]\[hidden\] \{\s*display: none;\s*\}/;

test("the sheet hides every [hidden] element under the plugin's own roots", () => {
	for (const f of ["styles.base.css", "styles.css", "test-vault/.obsidian/plugins/booklet/styles.css"]) {
		const css = readFileSync(`${ROOT}/${f}`, "utf8");
		assert.match(css, RULE, `${f} carries the rule`);
	}
});

test("every class the plugin's roots are given in the code is one the rule covers", () => {
	const roots = new Map([
		["src/design-view.ts", "booklet-design"],
		["src/view.ts", "booklet-view"],
		["src/editor-view.ts", "booklet-blocks"],
		["src/settings.ts", "booklet-settings"],
	]);
	for (const [file, cls] of roots) {
		assert.ok(readFileSync(`${ROOT}/${file}`, "utf8").includes(`"${cls}"`), `${file} still adds ${cls}`);
		assert.ok(RULE.source.includes(cls), `the rule names ${cls}`);
	}
});
