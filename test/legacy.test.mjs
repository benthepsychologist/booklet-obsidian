/*
 * A note with no page line is read, modelled and drawn in every place the view can show, and nothing is written to the note. The golden file
 * (legacy-golden.json) holds, for each such note, its reading and navigation model and a hash of the drawing of each place; test/legacy-structure.mjs
 * makes it and says how to make it again. It covers every note of the test vault that has no page line and no activity `parent:`, and made-up
 * ones for what the vault lacks. A change to the reading, the navigation or the drawing shows here as a note and a place whose hash moved.
 */
import "./fixed-date.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXTRA, drawnHash, modelOf, placesOf, vaultNotes } from "./legacy-structure.mjs";

const golden = JSON.parse(readFileSync(new URL("./legacy-golden.json", import.meta.url), "utf8"));
const notes = { ...vaultNotes(), ...Object.fromEntries(Object.entries(EXTRA).map(([k, v]) => [`${k} (made up here)`, v])) };

for (const [name, want] of Object.entries(golden)) {
	test(`note unchanged: ${name}: the same reading and model, the same drawing in every place, and nothing written`, async () => {
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
			assert.equal(got.sha, want.places[key].sha, `${name}: ${key} draws differently from the golden file`);
			assert.deepEqual(got.saved, want.places[key].saved, `${name}: ${key} saves a different place from the golden file`);
		}
	});
}

test("every note in the test vault that has no page line is in the golden file (a new note with no page line must be added to it)", () => {
	for (const [name, text] of Object.entries(vaultNotes())) if (!/^>[ \t]?\[!page/m.test(text)) assert.ok(golden[name], `${name} has no page line and is not in legacy-golden.json`);
});
