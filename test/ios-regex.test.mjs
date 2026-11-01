/*
 * Regular expressions with a lookbehind do not run on iOS before 16.4, and the plugin is not desktop-only. The source
 * has none, and the one place that wanted one (a link to a heading, but not an embed of it) reads the same without.
 * Made-up text only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { core, ROOT } from "./helpers.mjs";

const sources = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []));

test("no source file of the plugin holds a lookbehind", () => {
	const bad = sources(join(ROOT, "src")).filter((f) => /\(\?<[=!]/.test(readFileSync(f, "utf8")));
	assert.deepEqual(bad, []);
});

test("a link to a heading is found, an embed of it is not, and a markdown link is", () => {
	assert.deepEqual(core.headingLinksIn("See [[#Seen]] and ![[#Embedded]] and [a](#md-target) and !![[#Twice]] and [[#Last|alias]]"), ["Seen", "md-target", "Last"]);
});
