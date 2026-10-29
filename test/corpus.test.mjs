/*
 * Over every example in the booklet repository, every kit starter and every test-vault note, as the
 * reader would use them:
 *   answer   every question of the common kinds (a matrix, and a choice or a multi whose options come from a
 *            shared menu, among them; each of them also asked for each pick of another), and every widget the plugin draws (a grid-select: an item pressed
 *            and a word of the reader's own; an svg-regions: a sense word and a word of the reader's own
 *            in one region, a word of their own in another), worked out by the core's engine functions
 *            as the view works them out, in every activity: into the answers of an activity answered
 *            once, into the draft of a `repeat` one;
 *   keep     Finalize every `repeat` activity that holds a draft; for a `repeat daily` one, change an
 *            answer and finalize again the same day, which replaces that day's entry;
 *   clear    clear every answer that was set.
 * After every step:
 *   (a) every byte outside the records region is unchanged;
 *   (b) every record block the step did not need to change is still there, exactly as written; in a
 *       block it changed, every answer and every entry it did not change keeps its bytes, and entries
 *       keep their order;
 *   (c) reading the new text back gives what was set (and what was there and not set);
 *   (d) the reference linter reports no error on the written file.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { assertOutsideUnchanged, core, corpusDirs, corpusFiles, expectedLint, lint, lintDiffers, norm, pythonAvailable, read } from "./helpers.mjs";

// the external corpus exists only on the box the plugin was built on: a folder that is not there is skipped, not failed
for (const d of corpusDirs())
	if (d.external && !d.present) test(`corpus: ${d.name}`, { skip: `not found at ${d.dir}; set the environment variable to run these files` }, () => {});

const canLint = pythonAvailable();
if (!canLint) console.log("# (d) skipped: python3 or the linter (BOOKLET_LINTER) is not available");

const TEXT_ANSWER = 'A made-up answer, with "quotes", a backslash \\ and %% in it';
/** A lines answer as the view (and the reference renderer) stores it: every field, the empty one at the end included. */
const LINES = ["A first made-up line", 'A second, with "quotes"', ""];
/** What a kept entry holds for an answer: a lines answer without its blank lines. */
const keptValue = (q, v) =>
	q.kind !== "lines" || !Array.isArray(v) ? v : q.each ? v.map((p) => ({ ...p, a: p.a.filter((x) => x.trim()) })) : v.filter((x) => x.trim());
const DATE = "2026-10-27";
/** A fixed calendar, so the run does not depend on the machine's clock or time zone. */
const RULE = { today: "2026-10-27", dayOf: (ts) => String(ts).slice(0, 10) };
const TS = "2026-10-27T12:00:00Z";
const TS_AGAIN = "2026-10-27T18:30:00Z";

const OWN_WORD = 'a made-up "word" of my own';

/** Whether the view lets the reader answer this question (a widget it draws, not read-only). */
const answerable = (q) => q.kind !== "widget" || (!!q.widget && !q.readonly && core.ENGINES.includes(core.engineOf(q.widget.data)));

/** A widget's answer, made by the core's engine functions as the view makes it from presses and typing. */
function widgetValue(q) {
	if (!answerable(q)) return undefined;
	const data = q.widget.data;
	if (core.engineOf(data) === "grid-select") {
		const g = core.gridOf(data);
		let v = [];
		if (g.items.length) v = core.gridToggle(v, g.items[0].id);
		if (g.cells.length) v = core.gridAddOwn(g, v, g.cells[0].id, OWN_WORD);
		return v.length ? v : undefined;
	}
	const rg = core.regionsOf(data);
	const places = [...new Set([...rg.chips, ...rg.regions.map((r) => r.id)])];
	if (!places.length) return undefined;
	const word = rg.senses.flatMap((x) => x.words)[0];
	let v = word ? core.regionToggleWord([], places[0], word.id) : [];
	v = core.regionAddOwn(rg, v, places[0], OWN_WORD);
	if (places[1]) v = core.regionAddOwn(rg, v, places[1], "another made-up word");
	return v;
}

/** The value each common kind is given: the reference renderer's stored shape for it. */
function valueFor(q, act) {
	// a question asked for each pick (each:): a pair for every pick of its source's value, each with its kind's answer
	if (q.each) {
		const src = core.sourceOf(act, q);
		const picks = src ? core.sourcePicks(src, valueFor(src, act)) : [];
		const plain = { ...q, each: null };
		return picks.length ? picks.map((pick, i) => ({ pick, a: i ? otherValueFor(plain) : valueFor(plain, act) })) : undefined;
	}
	switch (q.kind) {
		case "widget":
			return widgetValue(q);
		case "choice":
			return q.options.length ? q.options.length : "An option of my own";
		case "multi": {
			const picks = q.options.length >= 2 ? [2, 1] : q.options.length ? [1] : [];
			return q.open || !picks.length ? [...picks, "One of my own"] : picks;
		}
		case "scale":
			return q.anchors.length ? q.anchors[q.anchors.length - 1].n : undefined;
		case "text":
			return TEXT_ANSWER;
		case "lines":
			return LINES;
		case "number":
			return q.max !== null ? q.max : (q.min ?? 0) + 3;
		case "date":
			return DATE;
		case "matrix":
			return q.items.length && q.anchors.length ? q.items.map((_, i) => q.anchors[i % q.anchors.length].n) : undefined;
	}
	return undefined;
}

/** A second value, for answering again on the same day. */
function otherValueFor(q) {
	if (q.kind === "text") return "Changed later the same day";
	if (q.kind === "number") return q.min !== null ? q.min : 1;
	if (q.kind === "date") return "2026-11-02";
	if (q.kind === "lines") return ["Only one line now"];
	if (q.kind === "scale" && q.anchors.length) return q.anchors[0].n;
	if (q.kind === "matrix") return q.items.map((_, i) => (i ? null : q.anchors[0].n));
	if (q.kind === "choice" && q.options.length) return 1;
	if (q.kind === "widget") return core.engineOf(q.widget.data) === "grid-select" ? ["x|cell|changed later"] : [{ id: "somewhere", s: ["changed later"] }];
	return ["Something else of my own"];
}

const blockKey = (b) => `${b.what}|${b.scope}|${b.name}`;

/** The text of each member of an object block, as written ("key": value), or null. */
function memberTexts(code) {
	const n = core.scanJson(code);
	if (!n || n.kind !== "object") return null;
	return new Map(n.members.map((m) => [m.key, code.slice(m.keyStart, m.value.end)]));
}

/**
 * (b). `may` says which blocks the step may change: a key `what|scope|name`, with the answer ids it may
 * change (for answers and drafts) or the ts it may replace (for entries).
 */
function assertRecordsKept(before, after, may, what) {
	const O = core.parseBooklet(before).records.blocks;
	const N = core.parseBooklet(after).records.blocks;
	const byKey = (list) => {
		const m = new Map();
		for (const b of list) m.set(blockKey(b), [...(m.get(blockKey(b)) ?? []), b]);
		return m;
	};
	const ok = byKey(O);
	const nk = byKey(N);
	for (const [key, olds] of ok) {
		const news = nk.get(key) ?? [];
		const allowed = may.get(key);
		if (!allowed) {
			assert.deepEqual(news.map((b) => b.raw), olds.map((b) => b.raw), `${what}: a ${key} block the step did not need was changed`);
			continue;
		}
		// a draft block may go (Finalize); every other kind keeps its count, and may gain one new block
		if (olds[0].what === "draft") assert.ok(news.length <= olds.length + 1, `${what}: ${key}`);
		else assert.ok(news.length === olds.length || (news.length === olds.length + 1 && !olds.some((b) => b.value)), `${what}: ${key} blocks ${olds.length} -> ${news.length}`);
		olds.forEach((o, i) => {
			const n = news[i];
			if (!n || o.raw === n.raw) return;
			assert.ok(o.value, `${what}: an unreadable ${key} block was written into`);
			assert.equal(n.raw.split("\n")[0], o.raw.split("\n")[0], `${what}: a fence line changed`);
			if (o.what === "entries") {
				// every entry the step did not replace keeps its bytes, in the order it had
				const spans = core.itemSpans(o.code) ?? [];
				const items = core.entryItems(o.value) ?? [];
				let from = 0;
				spans.forEach((s, k) => {
					if (allowed.has(String(items[k]?.ts))) return;
					const t = o.code.slice(s.start, s.end);
					const at = n.code.indexOf(t, from);
					assert.ok(at >= 0, `${what}: the entry ${t} is changed, moved or gone`);
					from = at + t.length;
				});
			} else {
				const was = memberTexts(o.code);
				const now = n.code;
				for (const [k, t] of was ?? []) if (!allowed.has(k)) assert.ok(now.includes(t), `${what}: in ${key}, the answer ${t} lost its bytes`);
			}
		});
	}
	for (const key of nk.keys()) if (!ok.has(key)) assert.ok(may.has(key), `${what}: a new ${key} block`);
}

/** (d): the linter reports no error, or for a note that lists some (helpers.mjs EXPECTED_LINT), exactly its expected ones. */
function assertLints(text, what, expected = []) {
	if (!canLint) return;
	const r = lint(text);
	assert.ok(r, "the linter could not run");
	const d = lintDiffers(r, expected);
	assert.equal(d, null, `${what}: lint-booklet.py does not report what is expected on the written file: ${d}`);
}

const add = (may, key, ...ids) => {
	const s = may.get(key) ?? new Set();
	for (const id of ids) s.add(String(id));
	may.set(key, s);
};

for (const file of corpusFiles()) {
	test(`corpus: ${file.split("/").slice(-2).join("/")}`, () => {
		const orig = read(file);
		const lintWant = expectedLint(file);
		const book = core.parseBooklet(orig);
		assert.ok(book.ok, `the file is refused: ${book.refusal}`);

		/* ---- answer every common question ---- */
		const set = []; // { scope, act, q, value }
		let text = orig;
		const may = new Map();
		for (const a of book.activities) {
			if (a.repeat && !a.id) continue;
			for (const q of a.segments) {
				if (q.type !== "question") continue;
				const value = valueFor(q, a);
				if (value === undefined) continue;
				if (a.repeat) {
					text = core.setDraftAnswer(text, a.scope, a.id, q.id, value, a.daily ? RULE : undefined);
					add(may, `draft|${a.scope}|${a.id}`, q.id);
				} else {
					text = core.setAnswer(text, a.scope, q.id, value);
					add(may, `answers|${a.scope}|`, q.id);
				}
				set.push({ scope: a.scope, act: a, q, value });
			}
		}
		const kinds = new Set(set.map((s) => s.q.kind));
		const common = new Set(book.activities.flatMap((a) => a.segments.filter((s) => s.type === "question" && answerable(s)).map((s) => s.kind)));
		for (const k of common) assert.ok(kinds.has(k), `the ${k} questions were answered`);
		if (!set.length) {
			// a file with no question this plugin draws (a status page of queries): an answer for an id the
			// file does not have is still a record, and goes through the same checks
			const scope = book.activities[0]?.scope ?? "";
			text = core.setAnswer(text, scope, "plugin-made-up", TEXT_ANSWER);
			add(may, `answers|${scope}|`, "plugin-made-up");
			set.push({ scope, act: { repeat: false }, q: { id: "plugin-made-up", kind: "text" }, value: TEXT_ANSWER });
		}
		const answered = text;
		assertOutsideUnchanged(orig, answered, "answered");
		assertRecordsKept(orig, answered, may, "answered");
		const back = core.parseBooklet(answered);
		assert.ok(back.ok, "the written file is refused");
		for (const s of set) {
			const got = s.act.repeat ? back.records.drafts[s.scope]?.[s.act.id]?.[s.q.id] : back.records.answers[s.scope]?.[s.q.id];
			assert.deepEqual(norm(got), norm(s.value), `${s.q.kind} ${s.q.id} reads back`);
		}
		for (const [scope, answers] of Object.entries(book.records.answers))
			for (const [k, v] of Object.entries(answers))
				if (!set.some((s) => !s.act.repeat && s.scope === scope && s.q.id === k)) assert.deepEqual(norm(back.records.answers[scope]?.[k]), norm(v), `the answer ${scope}/${k} is kept`);
		assertLints(answered, "answered", lintWant);

		/* ---- keep: Finalize every repeating activity that holds a draft ---- */
		let kept = answered;
		const repeating = book.activities.filter((a) => a.repeat && a.id && set.some((s) => s.act === a));
		for (const a of repeating) {
			const before = kept;
			const was = core.parseBooklet(before).records.entries[a.scope]?.[a.id] ?? [];
			const f = core.finalizeDraft(before, a.scope, a.id, { ts: TS, rule: a.daily ? RULE : undefined });
			kept = f.text;
			const kmay = new Map([[`draft|${a.scope}|${a.id}`, new Set()], [`entries|${a.scope}|${a.id}`, new Set()]]);
			if (f.replaced) for (const e of was) if (RULE.dayOf(e.ts) === RULE.today) kmay.get(`entries|${a.scope}|${a.id}`).add(String(e.ts));
			assertOutsideUnchanged(orig, kept, `finalize ${a.id}`);
			assertRecordsKept(before, kept, kmay, `finalize ${a.id}`);
			const r = core.parseBooklet(kept).records;
			assert.equal(r.drafts[a.scope]?.[a.id], undefined, `${a.id}: the draft is emptied`);
			const now = r.entries[a.scope]?.[a.id] ?? [];
			assert.equal(now.length, f.replaced ? was.length : was.length + 1, `${a.id}: one entry more`);
			const e = norm(now.find((x) => x.ts === f.entry.ts));
			assert.ok(e, `${a.id}: the new entry is there`);
			assert.match(e.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
			for (const s of set.filter((x) => x.act === a)) {
				assert.deepEqual(e[s.q.id], norm(keptValue(s.q, s.value)), `${a.id}: the entry keeps ${s.q.id}`);
				// a kept widget answer, a menu's positions among them, reads back in words
				if (s.q.each) assert.ok(core.eachWords(a, s.q, e).length, `${a.id}: the kept ${s.q.id} reads back in words, one line for each pick`);
				else if (s.q.kind === "widget" || s.q.menu) assert.ok(core.answerWords(s.q, e[s.q.id]), `${a.id}: the kept ${s.q.id} reads back in words`);
			}
			for (const old of was) if (!(f.replaced && RULE.dayOf(old.ts) === RULE.today)) assert.ok(now.some((x) => x.ts === old.ts), `${a.id}: the entry ${old.ts} is kept`);
			assertLints(kept, `finalize ${a.id}`, lintWant);

			if (!a.daily) continue;
			// the same day again: the draft shows today's entry; one change, and Finalize replaces it
			const shown = core.shownDraft(core.parseBooklet(kept), a.scope, a, RULE);
			assert.equal(shown.seededFrom?.ts, f.entry.ts, `${a.id}: the draft shows today's entry`);
			const q = set.find((x) => x.act === a).q;
			const changed = core.setDraftAnswer(kept, a.scope, a.id, q.id, otherValueFor(q), RULE);
			const g = core.finalizeDraft(changed, a.scope, a.id, { ts: TS_AGAIN, rule: RULE });
			assert.equal(g.replaced, true, `${a.id}: finishing again the same day replaces`);
			const after = core.parseBooklet(g.text).records.entries[a.scope]?.[a.id] ?? [];
			assert.equal(after.length, now.length, `${a.id}: still one entry for the day`);
			assert.equal(after.filter((x) => RULE.dayOf(x.ts) === RULE.today).length, 1);
			assertRecordsKept(kept, g.text, new Map([[`draft|${a.scope}|${a.id}`, new Set()], [`entries|${a.scope}|${a.id}`, new Set([f.entry.ts])]]), `again ${a.id}`);
			assertOutsideUnchanged(orig, g.text, `again ${a.id}`);
			assertLints(g.text, `again ${a.id}`, lintWant);
			kept = g.text;
		}

		/* ---- clear every answer that was set ---- */
		let cleared = answered;
		for (const s of set) {
			cleared = s.act.repeat ? core.setDraftAnswer(cleared, s.scope, s.act.id, s.q.id, undefined) : core.setAnswer(cleared, s.scope, s.q.id, undefined);
			const r = core.parseBooklet(cleared).records;
			const holder = s.act.repeat ? r.drafts[s.scope]?.[s.act.id] : r.answers[s.scope];
			assert.ok(!holder || !Object.prototype.hasOwnProperty.call(holder, s.q.id), `${s.q.id} is cleared`);
		}
		assertOutsideUnchanged(orig, cleared, "cleared");
		assertRecordsKept(answered, cleared, may, "cleared");
		const c = core.parseBooklet(cleared).records;
		const strip = (answers) => {
			const out = {};
			for (const [scope, a] of Object.entries(norm(answers)))
				for (const [k, v] of Object.entries(a)) if (!set.some((s) => !s.act.repeat && s.scope === scope && s.q.id === k)) (out[scope] ??= {})[k] = v;
			return out;
		};
		assert.deepEqual(strip(c.answers), strip(book.records.answers), "clearing keeps every answer that was not set");
		for (const a of repeating)
			if (!book.records.drafts[a.scope]?.[a.id]) assert.equal(c.drafts[a.scope]?.[a.id], undefined, `${a.id}: a draft cleared of every answer is gone`);
		// the records that were there before any of this are all still there, as written
		assertRecordsKept(orig, cleared, may, "cleared, against the original");
		assertLints(cleared, "cleared", lintWant);
	});
}
