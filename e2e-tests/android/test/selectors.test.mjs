// Every Booklet class name and data attribute the checks look for must still exist in the plugin's source.
// If the plugin renames one, this fails here, on any machine, instead of as a confusing timeout on the Mac.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const read = (f) => fs.readFileSync(f, "utf8");
const srcDir = path.join(root, "src");
const plugin = fs.readdirSync(srcDir).filter((f) => f.endsWith(".ts")).map((f) => read(path.join(srcDir, f))).join("\n");

const used = new Set();
for (const f of ["checks.mjs", "phone.mjs"]) {
	const text = read(path.join(here, "..", "lib", f));
	for (const m of text.matchAll(/\.(booklet-[a-z0-9-]+)/g)) used.add(m[1]);
	for (const m of text.matchAll(/\b(data-booklet-[a-z]+)/g)) used.add(m[1]);
}
used.add("booklet-has-nowplaying"); // added to the body, named without a dot in checks.mjs

test("the checks use some Booklet selectors (the scan itself works)", () => {
	assert.ok(used.size >= 12, `only ${used.size} found`);
	for (const s of ["booklet-pagesbtn", "booklet-allow-card", "booklet-nowplaying", "data-booklet-screen"]) assert.ok(used.has(s), s);
});

test("each one is in the plugin's source", () => {
	const missing = [...used].filter((s) => !plugin.includes(s));
	assert.deepEqual(missing, [], `the checks look for ${missing.join(", ")} but src/ does not contain it`);
});

test("the test-vault note the view check opens, and the screen it goes to, exist", () => {
	const note = read(path.join(root, "test-vault", "Check-in.booklet.md"));
	assert.match(note, /\[!module\|day-check\]/);
	assert.match(note, /\[!activity\|today /);
});
