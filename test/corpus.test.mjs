/*
 * Over every example in the booklet repository, every kit starter and every test-vault note: set an
 * answer to the first choice, the first scale and the first text question, then check
 *   (a) every byte outside the records region is unchanged,
 *   (b) every record block that was there is still there, with equal values,
 *   (c) reading the new text back gives the answers set,
 *   (d) the reference linter reports no error on the written file,
 *   (e) clearing an answer removes it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { assertOutsideUnchanged, core, corpusDirs, corpusFiles, lint, norm, pythonAvailable, read } from "./helpers.mjs";

// the external corpus exists only on the box the plugin was built on: a folder that is not there is skipped, not failed
for (const d of corpusDirs())
	if (d.external && !d.present) test(`corpus: ${d.name}`, { skip: `not found at ${d.dir}; set the environment variable to run these files` }, () => {});

const TEXT_ANSWER = 'A made-up answer, with "quotes", a backslash \\ and %% in it';

/** The first question of each kind this plugin answers, with the scope (module) it is in. */
function firstQuestions(book) {
	const found = {};
	for (const a of book.activities)
		for (const s of a.segments)
			if (s.type === "question" && !found[s.kind]) found[s.kind] = { q: s, scope: a.scope };
	return found;
}

function valueFor(kind, q) {
	if (kind === "choice") return 1;
	if (kind === "scale") return q.anchors[q.anchors.length - 1].n;
	return TEXT_ANSWER;
}

/** (b): each block of `before` is in `after`, in order, unchanged, but for the answers `set` (one new block per scope allowed). */
function assertBlocksKept(before, after, set) {
	const O = core.parseBooklet(before).records.blocks;
	const N = core.parseBooklet(after).records.blocks;
	const setKeys = new Map(set.map((s) => [`${s.scope}/${s.id}`, s.value]));
	let j = 0;
	for (const n of N) {
		const o = O[j];
		if (!o) break;
		if (o.what === "answers" && o.value && n.what === "answers" && n.value && o.scope === n.scope) {
			const keys = new Set([...Object.keys(o.value), ...Object.keys(n.value)]);
			let same = true;
			for (const k of keys) {
				const was = norm(o.value[k]);
				const now = norm(n.value[k]);
				if (setKeys.has(`${o.scope}/${k}`)) {
					if (now !== undefined && JSON.stringify(now) !== JSON.stringify(was) && JSON.stringify(now) !== JSON.stringify(norm(setKeys.get(`${o.scope}/${k}`)))) same = false;
				} else if (JSON.stringify(was) !== JSON.stringify(now)) same = false;
			}
			if (same) j++;
		} else if (n.raw === o.raw) j++;
	}
	assert.equal(j, O.length, `a record block that was in the file is missing or changed (kept ${j} of ${O.length})`);
	assert.ok(N.length - O.length <= set.length, "more new blocks than answers set");
}

const canLint = pythonAvailable();
if (!canLint) console.log("# (d) skipped: python3 or the linter (BOOKLET_LINTER) is not available");

for (const file of corpusFiles()) {
	test(`corpus: ${file.split("/").slice(-2).join("/")}`, () => {
		const orig = read(file);
		const book = core.parseBooklet(orig);
		assert.ok(book.ok, `the file is refused: ${book.refusal}`);
		const before = book.records.answers;
		const firsts = firstQuestions(book);
		const set = [];
		let text = orig;
		for (const kind of ["choice", "scale", "text"]) {
			const f = firsts[kind];
			if (!f) continue;
			const value = valueFor(kind, f.q);
			text = core.setAnswer(text, f.scope, f.q.id, value);
			set.push({ kind, scope: f.scope, id: f.q.id, value });
		}
		if (!set.length) {
			// a file with no question this plugin draws (a status page of queries): an answer for an id the
			// file does not have is still a record, and goes through the same checks
			const scope = book.activities[0]?.scope ?? "";
			text = core.setAnswer(text, scope, "plugin-made-up", TEXT_ANSWER);
			set.push({ kind: "text", scope, id: "plugin-made-up", value: TEXT_ANSWER });
		}

		// (a)
		assertOutsideUnchanged(orig, text, "after setting");
		// (b)
		assertBlocksKept(orig, text, set);
		// (c)
		const back = core.parseBooklet(text);
		assert.ok(back.ok, "the written file is refused");
		for (const s of set) assert.deepEqual(norm(back.records.answers[s.scope]?.[s.id]), norm(s.value), `${s.kind} ${s.id} reads back`);
		for (const [scope, answers] of Object.entries(before))
			for (const [k, v] of Object.entries(answers))
				if (!set.some((s) => s.scope === scope && s.id === k)) assert.deepEqual(norm(back.records.answers[scope]?.[k]), norm(v), `the answer ${scope}/${k} is kept`);
		// (d)
		if (canLint) {
			const r = lint(text);
			assert.ok(r, "the linter could not run");
			assert.equal(r.status, 0, `lint-booklet.py reports errors on the written file:\n${r.out}`);
			assert.match(r.out, / 0 errors/);
		}
		// (e)
		for (const s of set) {
			const cleared = core.setAnswer(text, s.scope, s.id, undefined);
			assertOutsideUnchanged(orig, cleared, `after clearing ${s.id}`);
			const c = core.parseBooklet(cleared).records.answers[s.scope] ?? {};
			assert.ok(!Object.prototype.hasOwnProperty.call(c, s.id), `${s.id} is cleared`);
			for (const t of set) if (t !== s && t.scope === s.scope) assert.deepEqual(norm(c[t.id]), norm(t.value), `clearing ${s.id} keeps ${t.id}`);
			if (canLint) assert.equal(lint(cleared).status, 0, "lint after clearing");
		}
		// clearing everything that was set leaves the other answers that were there
		let all = text;
		for (const s of set) all = core.setAnswer(all, s.scope, s.id, undefined);
		const strip = (answers, drop) => {
			const out = {};
			for (const [scope, a] of Object.entries(norm(answers)))
				for (const [k, v] of Object.entries(a)) if (!drop.some((s) => s.scope === scope && s.id === k)) (out[scope] ??= {})[k] = v;
			return out;
		};
		assert.deepEqual(strip(core.parseBooklet(all).records.answers, []), strip(before, set), "clearing all");
		assertOutsideUnchanged(orig, all, "after clearing all");
	});
}
