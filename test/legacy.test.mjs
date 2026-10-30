/*
 * A note with no page line is exactly what it was in release 0.7.0 (page trees, 0.8.0): the same reading, the same navigation model, and
 * the same drawing in every place the view can show, with nothing written to the note. The golden file (legacy-golden.json) was made
 * from the code of 0.7.0 (bb9283e) by test/legacy-structure.mjs, which says how to make it again. It covers every 0.16 note in the test
 * vault, and made-up ones for what the vault lacks: a wiki written with `parent:` on activities, in a module and bare.
 */
import "./fixed-date.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXTRA, drawnHash, modelOf, placesOf, vaultNotes } from "./legacy-structure.mjs";

const golden = JSON.parse(readFileSync(new URL("./legacy-golden.json", import.meta.url), "utf8"));
const notes = { ...vaultNotes(), ...Object.fromEntries(Object.entries(EXTRA).map(([k, v]) => [`${k} (made up here)`, v])) };

for (const [name, want] of Object.entries(golden)) {
	test(`0.16 note unchanged: ${name}: the same reading and model, the same drawing in every place, and nothing written`, async () => {
		const text = notes[name];
		assert.ok(text !== undefined, `${name} is in the golden file but is not a note any more`);
		assert.deepEqual(modelOf(text), want.model, `${name}: its reading or navigation model changed`);
		const places = placesOf(text).map((p) => p.join("|"));
		assert.deepEqual(places, Object.keys(want.places), `${name}: the places it can show changed`);
		for (const pl of placesOf(text)) {
			const key = pl.join("|");
			const got = await drawnHash(text, pl, name);
			assert.equal(got.drawn, key.split("|")[0], `${name}: ${key} did not open on its screen`);
			assert.equal(got.writes, 0, `${name}: drawing ${key} wrote to the note`);
			assert.ok(got.same, `${name}: drawing ${key} changed the note's text`);
			assert.equal(got.sha, want.places[key].sha, `${name}: ${key} draws differently from 0.7.0`);
			assert.deepEqual(got.saved, want.places[key].saved, `${name}: ${key} saves a different place from 0.7.0`);
		}
	});
}

test("every note in the test vault that has no page line is in the golden file (a new 0.16 note must be added to it)", () => {
	for (const [name, text] of Object.entries(vaultNotes())) if (!/^>[ \t]?\[!page/m.test(text)) assert.ok(golden[name], `${name} has no page line and is not in legacy-golden.json`);
});
