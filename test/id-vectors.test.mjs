/*
 * The id test vectors (test/id-vectors.json, copied from the spec's repo, SPEC section 7, "The id of a new row"): every case is run against
 * parseIdFormat and makeId. A case gives the format, the ids the block holds (and the adds waiting), the parent, the text in each box and
 * what is expected: an id (a string, or a number for the bare {n}) or a refusal (invalid-format, empty-slug, clash, empty-id).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { core } from "./helpers.mjs";

const vectors = JSON.parse(readFileSync(new URL("./id-vectors.json", import.meta.url), "utf8"));
const bytes = (uuid) => (uuid.replace(/-/g, "").match(/../g) ?? []).map((h) => parseInt(h, 16));

test("the vectors file is the shape this test reads", () => {
	assert.ok(vectors.cases.length >= 30, `${vectors.cases.length} cases`);
	assert.match(vectors.now, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
	assert.match(vectors.uuid, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
});

for (const c of vectors.cases) {
	test(`id vector: ${c.name}`, () => {
		const now = new Date(c.now ?? vectors.now);
		const uuid = c.uuid ?? vectors.uuid;
		const got = core.makeId(c.format, {
			ids: c.ids,
			values: c.fields ?? {},
			parent: c.parent === null || c.parent === undefined ? undefined : c.parent,
			now,
			random: () => bytes(uuid),
			labelOf: (f) => f,
		});
		const x = c.expect;
		if ("id" in x) {
			assert.equal(got.ok, true, JSON.stringify(got));
			assert.strictEqual(got.id, x.id);
			return;
		}
		assert.equal(got.ok, false, `refuses (${x.refuse}), got ${JSON.stringify(got)}`);
		const why = { "invalid-format": "format", "empty-slug": "slug", clash: "clash", "empty-id": "empty" }[x.refuse];
		assert.equal(got.why, why);
		if (x.field) assert.equal(got.field, x.field);
		// the format is checked first: an invalid one is never valid to parseIdFormat
		if (x.refuse === "invalid-format") assert.equal(core.parseIdFormat(c.format).ok, false);
		else assert.equal(core.parseIdFormat(c.format).ok, true);
	});
}
