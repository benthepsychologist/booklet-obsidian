/*
 * A reader's own words offered again (src/core/earlier.ts, drawn by src/questions.ts and src/engines.ts), as the
 * approved earlier-answers design for format 0.16 has it: the `earlier:<n>` setting and its bad values, the settings a
 * kind does not take (now reported, as SPEC section 4 says), and for each place that offers words (own options, a body
 * widget's places, a lines question) where the words come from, how many, in what order and how they are matched; the
 * source rule's edge cases (today's entry in a daily activity, pairs whose pick was taken back, a stale word id); and
 * what a press on an offered word stores, byte for byte. Every word here is made up.
 */
import { openView, typeInto, window as w, until } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, core, corpusFiles, lint, norm, pythonAvailable, read } from "./helpers.mjs";

const CHECKIN = readFileSync(join(ROOT, "test-vault", "Check-in.booklet.md"), "utf8");
const S = "day-check";
const A = "today";

/* ---- the setting, and the settings a kind does not take ---- */

const head = (body) => `---\nbooklet: "0.16"\nid: test/settings\ntitle: Settings\nlang: en\n---\n\n${body}\n`;
const problemsOf = (body) => core.parseBooklet(head(body)).problems;
const questionOf = (body, id) => {
	for (const a of core.parseBooklet(head(body)).activities) for (const s of a.segments) if (s.type === "question" && s.id === id) return s;
	return null;
};

test("earlier: read on a choice, a multi, a lines and a widget line: digits only, 012 is 12, 0 offers none; any other value is ignored and reported, and the default kept", () => {
	const body = [
		"> [!activity|log repeat] A log",
		"",
		"> [!multi|m open earlier:4] M",
		"- [ ] One",
		"",
		"> [!choice|c open earlier:012] C",
		"- [ ] One",
		"",
		"> [!lines|l earlier:0] L",
		"",
		"> [!lines|plain] Plain",
		"",
		"> [!widget|w earlier:7] W",
		"> ![[#^made-up]]",
	].join("\n");
	assert.equal(questionOf(body, "m").earlier, 4);
	assert.equal(questionOf(body, "c").earlier, 12, "earlier:012 is 12");
	assert.equal(questionOf(body, "l").earlier, 0, "earlier:0 is 0: none offered");
	assert.equal(questionOf(body, "plain").earlier, null, "no setting: the default");
	assert.equal(core.earlierLimit(questionOf(body, "plain")), 0, "a lines question offers none unless its line asks");
	assert.equal(core.earlierLimit(questionOf(body, "m")), 4);
	assert.equal(core.earlierLimit({ kind: "multi", earlier: null }), 12, "own options: 12 by default");
	assert.equal(core.earlierLimit({ kind: "widget", earlier: null }), 12, "a body widget's places: 12 by default");
	assert.ok(!problemsOf(body).some((p) => /earlier|takes no/.test(p)), problemsOf(body).join(" | "));

	for (const bad of ["+3", "3.0", "-1", "", "abc", "1e2"]) {
		const b = `> [!activity|log repeat] A log\n\n> [!lines|l earlier:${bad}] L`;
		const q = questionOf(b, "l");
		assert.equal(q.earlier, null, `earlier:${bad} is ignored`);
		assert.deepEqual(
			problemsOf(b).filter((p) => /earlier/.test(p)),
			[`Line 10: \`earlier:${bad}\` is not a whole number written in digits, so it was ignored and the question offers its default.`],
			`earlier:${bad} is reported`,
		);
	}
	// on a kind that does not take it: reported as any setting the kind does not take, and not read
	const t = "> [!activity|log repeat] A log\n\n> [!text|t earlier:3] T";
	assert.equal(questionOf(t, "t").earlier, null);
	assert.deepEqual(problemsOf(t), ["Line 10: a text line takes no `earlier:` setting, so it was ignored."]);
});

test("settings a kind does not take are reported and ignored (SPEC section 4); no setting of the 0.16 table is reported", () => {
	// every setting the 0.16 table gives each kind
	const good = [
		"> [!module|m icon:book] A module",
		"",
		"> [!activity|log repeat daily hidden icon:pencil parent:other status:off tab:t1] A log",
		"",
		"> [!multi|src open menu:made-up each:none-such earlier:3] Source",
		"- [ ] One",
		"",
		"> [!text|a long each:src] Text",
		"",
		"> [!lines|b each:src earlier:2] Lines",
		"",
		"> [!scale|c each:src] Scale",
		"1. Low",
		"2. High",
		"",
		"> [!number|d min:0 max:9 step:1 each:src] Number",
		"",
		"> [!date|e each:src] Date",
		"",
		"> [!choice|f open menu:x each:src earlier:1] Choice",
		"- [ ] One",
		"",
		"> [!widget|g readonly describe each:src earlier:5] Widget",
		"> ![[#^made-up]]",
		"",
		"> [!row]",
		"",
		"Side by side.",
		"",
		"> [!row|end]",
		"",
		"> [!hint]- A hint",
		"> Words.",
		"",
		"> [!module|m end]",
	].join("\n");
	const p = problemsOf(good);
	assert.ok(!p.some((x) => /takes no/.test(x)), p.join(" | "));

	const bad = [
		"> [!module|m colour:red] A module",
		"",
		"> [!activity|log repeat weekly] A log",
		"",
		"> [!text|a lng mx:5] Text",
		"",
		"> [!number|n mx:5 min:0] Number",
		"",
		"> [!scale|s open] Scale",
		"1. Low",
		"",
		"> [!hint|aside]- A hint",
		"> Words.",
		"",
		"> [!module|m end]",
	].join("\n");
	assert.deepEqual(
		problemsOf(bad).filter((x) => /takes no/.test(x)),
		[
			"Line 8: a module line takes no `colour:` setting, so it was ignored.",
			"Line 10: an activity line takes no `weekly` setting, so it was ignored.",
			"Line 12: a text line takes no `mx:` setting, so it was ignored.",
			"Line 12: a text line takes no `lng` setting, so it was ignored.",
			"Line 14: a number line takes no `mx:` setting, so it was ignored.",
			"Line 16: a scale line takes no `open` setting, so it was ignored.",
			"Line 19: a hint line takes no `aside` setting, so it was ignored.",
		],
	);
	// a setting taken off is not read: `open` on a scale does nothing, `min:0` on the number stays
	const book = core.parseBooklet(head(bad));
	const n = book.activities[0].segments.find((x) => x.id === "n");
	assert.equal(n.min, 0);
	// a records line's setting, inside the records region
	const rec = head("> [!activity|log] A log\n\n> [!text|a] A\n") + "\n%%\n> [!records|m stray] App record\n\n```booklet answers\n{}\n```\n%%\n";
	assert.ok(core.parseBooklet(rec).problems.some((x) => x === "Line 14: a records line takes no `stray` setting, so it was ignored."), core.parseBooklet(rec).problems.join(" | "));
});

test("settings: on every booklet file of the corpus and the test vault, the plugin reports the settings a kind does not take where the linter does", { skip: !pythonAvailable() && "python3 or the linter is not here" }, () => {
	const files = corpusFiles();
	assert.ok(files.length >= 5, `files: ${files.length}`);
	for (const file of files) {
		const text = read(file);
		const book = core.parseBooklet(text);
		const said = (re, s) => [...s.matchAll(re)].map((m) => `${m[1]} ${m[2]} ${m[3].replace(/:$/, "").toLowerCase()}`);
		const mine = book.problems.flatMap((p) => said(/^Line (\d+): an? (\S+) line takes no `([^`]+)`/g, p));
		const r = lint(text, file.split("/").pop());
		const theirs = said(/line (\d+): an? (\S+) line takes no `([^`]+)`/g, r.out);
		assert.deepEqual(mine.sort(), theirs.sort(), file);
	}
});

/* ---- where the words come from: the core ---- */

const NOTE = head(
	[
		"> [!activity|log repeat] A log",
		"",
		"> [!multi|tools open] Which tools?",
		"- [ ] Pencil",
		"- [ ] Ruler",
		"- [ ] Glue *stick*",
		"",
		"> [!multi|why each:tools open] Why that one?",
		"- [ ] It was near",
		"",
		"> [!choice|one open earlier:2] One",
		"- [ ] First",
		"",
		"> [!widget|spots] Some places",
		"> ![[#^made-up-spots]]",
		"",
		"> [!lines|notes earlier:3] Notes",
		"",
		"> [!lines|plain] Plain lines",
		"",
		"> [!activity|daily repeat daily] A daily one",
		"",
		"> [!lines|notes earlier:5] Notes",
		"",
		"> [!activity|once] Once",
		"",
		"> [!lines|notes earlier:5] Notes",
		"",
		"> [!data] Data",
		"",
		"```booklet widget",
		JSON.stringify({
			engine: "svg-regions",
			regions: [{ id: "top", label: "Top" }, { id: "mid", label: "Mid" }, { id: "base", label: "Base" }],
			senses: [
				{ id: "feel", label: "Feel", words: [{ id: "warm", label: "Warm" }, { id: "feel:1", label: "Damp" }] },
				{ id: "move", label: "Move", words: [{ id: "still", label: "Still" }] },
			],
			chips: ["top", "mid", "base"],
		}),
		"```",
		"^made-up-spots",
	].join("\n"),
);
const book = core.parseBooklet(NOTE);
const act = (id) => book.activities.find((a) => a.id === id);
const q = (a, id) => act(a).segments.find((s) => s.type === "question" && s.id === id);
const withQ = (x, over) => ({ ...x, ...over });

test("the kept entries words come from: none for an activity that keeps none; newest first by time; in a daily activity not today's, which the draft will replace", () => {
	const entries = [
		{ ts: "2026-10-20T08:00:00Z", notes: ["older"] },
		{ ts: "2026-10-21T01:00:00+05:00", notes: ["by time, before the 20th's evening"] },
		{ ts: "2026-10-20T22:00:00Z", notes: ["the 20th's evening"] },
		{ ts: "2026-10-27T07:00:00Z", notes: ["today"] },
	];
	const fake = (actId) => ({ records: { entries: { "": { [actId]: entries } } } });
	const rule = { today: "2026-10-27", dayOf: (ts) => String(ts).slice(0, 10) };
	assert.deepEqual(core.earlierEntries(fake("once"), "", act("once"), rule), [], "an activity that does not repeat keeps no entries");
	assert.deepEqual(
		core.earlierEntries(fake("log"), "", act("log"), rule).map((e) => e.notes[0]),
		["today", "the 20th's evening", "by time, before the 20th's evening", "older"],
		"a repeat activity: every entry, newest first by the time in its ts (an offset read as a time, not as text)",
	);
	assert.deepEqual(
		core.earlierEntries(fake("daily"), "", act("daily"), rule).map((e) => e.notes[0]),
		["the 20th's evening", "by time, before the 20th's evening", "older"],
		"a repeat daily activity: not today's entry",
	);
});

test("own options: from the kept entries newest first; listed words, the answer's words and repeats left out before the count (section 5's matching); the limit; only answers in their shape", () => {
	const tools = q("log", "tools");
	const entries = [
		{ ts: "3", tools: [1, " Tape ", "glue STICK", "Twine"] },
		{ ts: "2", tools: "Clamp" },
		{ ts: "1", tools: ["tape", "Wire", 2, "Hook", "", "  "] },
	];
	assert.deepEqual(core.earlierOptions(act("log"), tools, {}, entries, []), ["Tape", "Twine", "Wire", "Hook"], "the newest spelling, trimmed; Glue *stick* is listed (its marks aside); a lone string under a multi is not read");
	assert.deepEqual(core.earlierOptions(act("log"), tools, {}, entries, [1, "TWINE"]), ["Tape", "Wire", "Hook"], "a word in the answer now is left out");
	assert.deepEqual(core.earlierOptions(act("log"), withQ(tools, { earlier: 2 }), {}, entries, []), ["Tape", "Twine"], "earlier:2");
	assert.deepEqual(core.earlierOptions(act("log"), withQ(tools, { earlier: 2 }), {}, entries, ["tape"]), ["Twine", "Wire"], "words left out do not count");
	assert.deepEqual(core.earlierOptions(act("log"), withQ(tools, { earlier: 0 }), {}, entries, []), [], "earlier:0 offers none");
	assert.deepEqual(core.earlierOptions(act("log"), withQ(tools, { open: false }), {}, entries, []), [], "without open, nothing");
	const many = Array.from({ length: 15 }, (_, i) => ({ ts: String(100 - i), tools: [`Made-up ${i + 1}`] }));
	assert.equal(core.earlierOptions(act("log"), tools, {}, many, []).length, 12, "12 by default");
	// a choice: its one answer, a position or the reader's words
	const one = q("log", "one");
	assert.deepEqual(core.earlierOptions(act("log"), one, {}, [{ ts: "2", one: "Second try" }, { ts: "1", one: 1 }, { ts: "0", one: "Third" }, { ts: "-1", one: "Fourth" }], []), ["Second try", "Third"], "a choice's own answers, at most earlier:2");
});

test("own options under each:: the record's other picks first, in the source's order; then the entries, only the pairs whose pick the source holds; a removed option's pick still gives words", () => {
	const why = q("log", "why");
	const rec = { tools: [2, "Tape", 1], why: [{ pick: 1, a: ["Near the door"] }, { pick: 9, a: ["Hidden now"] }, { pick: 2, a: ["Handy"] }, { pick: "Tape", a: [1, "Sticky"] }] };
	assert.deepEqual(core.earlierOptions(act("log"), why, rec, [], [], 2), ["Sticky", "Near the door"], "under Ruler: Tape's then Pencil's, as the source holds them; the pair for a pick not held is not read");
	assert.deepEqual(core.earlierOptions(act("log"), why, rec, [], ["near THE door"], 1), ["Handy", "Sticky"], "under Pencil: its own answer left out");
	const entries = [
		{ ts: "2", tools: [3], why: [{ pick: 1, a: ["Taken back"] }, { pick: 3, a: ["Gluey"] }] },
		{ ts: "1", tools: [7], why: [{ pick: 7, a: ["From a removed option"] }] },
		{ ts: "0", tools: [1], why: [1, 2] },
	];
	assert.deepEqual(core.earlierOptions(act("log"), why, {}, entries, [], 1), ["Gluey", "From a removed option"], "a pair whose pick was taken back gives nothing; a pick of an option since removed still does; an answer of the wrong shape gives nothing");
	assert.deepEqual(core.ownOptionsIn(act("log"), why, entries[0]), ["Gluey"]);
});

test("a body place's words: the own-word rule (not a word id, not a group id and a colon), the widget's order of places, other places first, then entries newest first; section 7's matching; commas; the limit", () => {
	const spots = q("log", "spots");
	const rg = core.regionsOf(spots.widget.data);
	assert.equal(core.isOwnPlaceWord(rg, "Prickly"), true);
	assert.equal(core.isOwnPlaceWord(rg, "warm"), false, "a word id");
	assert.equal(core.isOwnPlaceWord(rg, "feel:1"), false, "a word id with a colon");
	assert.equal(core.isOwnPlaceWord(rg, "feel:9"), false, "a word id the widget has since dropped: its group id and a colon");
	assert.equal(core.isOwnPlaceWord(rg, "move:"), false);
	assert.equal(core.isOwnPlaceWord(rg, "feelings: mixed"), true, "not a group id and a colon");
	assert.equal(core.isOwnPlaceWord(rg, "  "), false);
	assert.equal(core.isOwnPlaceWord(rg, 3), false);
	// the widget's order of places; rows for a place it no longer lists after the rest; within a place as written
	const answer = [{ id: "gone", s: ["From a gone place"] }, { id: "base", s: ["Fizzy", "still"] }, { id: "top", s: ["Hollow", "warm", "Dull ache"] }];
	assert.deepEqual(core.ownPlaceWordsIn(spots, rg, answer), ["Hollow", "Dull ache", "Fizzy", "From a gone place"]);
	assert.deepEqual(core.ownPlaceWordsIn(spots, rg, { id: "top" }), [], "an answer of the wrong shape gives nothing");
	const entries = [
		{ ts: "2", spots: [{ id: "mid", s: ["Buzzing", "hollow", "feel:9", "Light, airy"] }] },
		{ ts: "1", spots: [{ id: "top", s: ["Prickly", "DAMP", "dull  ache"] }] },
	];
	// under Mid, with Top and Base answered now: the answer's other places, then the entries; Mid's own row left out
	const now = [{ id: "top", s: ["Hollow"] }, { id: "mid", s: ["warm", "Fizzy "] }, { id: "base", s: ["Fizzy"] }];
	assert.deepEqual(core.earlierPlaceWords(spots, rg, now, entries, "mid"), ["Hollow", "Buzzing", "Prickly", "dull  ache"], "Fizzy is at Mid already; Damp is the widget's word; a stale id and a word holding a comma are not offered");
	assert.deepEqual(core.earlierPlaceWords(spots, rg, now, entries, "top"), ["Fizzy", "Buzzing", "Prickly", "dull  ache"]);
	assert.deepEqual(core.earlierPlaceWords(spots, rg, [{ id: "top", s: ["DULL   ache "] }], entries, "top"), ["Buzzing", "hollow", "Prickly"], "matched as section 7 matches words: case and runs of spaces aside");
	assert.deepEqual(core.earlierPlaceWords(spots, rg, [{ id: "top", s: ["sore — dull"] }], [{ ts: "1", spots: [{ id: "mid", s: ["Sore – dull"] }] }], "top"), [], "long and short dashes read alike");
	assert.deepEqual(core.earlierPlaceWords(spots, rg, [{ id: "top", s: ["it’s sore"] }], [{ ts: "1", spots: [{ id: "mid", s: ["IT'S SORE"] }] }], "top"), [], "curly and straight quotes read alike");
	assert.deepEqual(core.earlierPlaceWords(withQ(spots, { earlier: 1 }), rg, now, entries, "mid"), ["Hollow"], "earlier:1");
	assert.deepEqual(core.earlierPlaceWords(withQ(spots, { earlier: 0 }), rg, now, entries, "mid"), [], "earlier:0, nothing from the answer either");
	const many = [{ ts: "1", spots: [{ id: "top", s: Array.from({ length: 14 }, (_, i) => `Made-up ${i + 1}`) }] }];
	assert.equal(core.earlierPlaceWords(spots, rg, [], many, "base").length, 12, "12 at each place by default");
});

test("a lines question's earlier lines: none unless its line sets earlier:; then the entries' lines newest first, as written; blank lines, lines in the fields and repeats left out; only answers in their shape", () => {
	const notes = q("log", "notes");
	const entries = [
		{ ts: "3", notes: ["The car service", " RENT ", "", "   "] },
		{ ts: "2", notes: "A lone string" },
		{ ts: "1", notes: ["rent", "The dentist on Friday", "Seeds to sow"] },
	];
	assert.deepEqual(core.earlierLines(notes, entries, []), ["The car service", "RENT", "The dentist on Friday"], "earlier:3, the newest spelling, trimmed");
	assert.deepEqual(core.earlierLines(notes, entries, ["the CAR service ", ""]), ["RENT", "The dentist on Friday", "Seeds to sow"], "a line in the fields is left out, and does not count");
	assert.deepEqual(core.earlierLines(q("log", "plain"), entries, []), [], "no earlier: on the line: none");
	assert.deepEqual(core.earlierLines(withQ(notes, { earlier: 0 }), entries, []), []);
});

/* ---- the view: what is drawn, and what a press stores ---- */

const draftBody = (text) => {
	const m = /```booklet draft today\n([^\n]*)\n```/.exec(text);
	return m ? m[1] : null;
};
const entriesBlock = (text) => {
	const m = /```booklet entries today\n[\s\S]*?\n```/.exec(text);
	return m ? m[0] : null;
};

/** The check-in note with entries kept on the days given (`YYYY-MM-DD`, or "today" for the device's today, now). */
function withEntries(list, text = CHECKIN) {
	let t = text;
	for (const [day, answers] of list) {
		const now = new Date();
		const d = day === "today" ? core.localDay(now) : day;
		const ts = day === "today" ? core.isoSecond(now) : `${day}T09:00:00Z`;
		const rule = day === "today" ? { today: d } : { today: d, dayOf: (x) => String(x).slice(0, 10) };
		for (const [k, value] of Object.entries(answers)) t = core.setDraftAnswer(t, S, A, k, value, rule);
		t = core.finalizeDraft(t, S, A, { ts, rule }).text;
	}
	return t;
}

function open(text) {
	const v = openView(text, { path: "Check-in.booklet.md", screen: "activity:day-check/today" });
	const q = (id) => v.view.contentEl.querySelector(`[data-booklet-q="${id}"]`);
	const places = () => q("places");
	return {
		...v,
		q,
		place: (label) => [...places().querySelectorAll("button.booklet-place")].find((b) => b.textContent.trim().startsWith(label)),
		panel: () => places().querySelector(".booklet-panel"),
		group: (root) => root.querySelector(".booklet-earlier"),
		offeredIn: (root) => {
			const g = root.querySelector(".booklet-earlier");
			return g && !g.classList.contains("booklet-earlier-none") ? [...g.querySelectorAll("button")].map((b) => b.textContent.trim()) : [];
		},
	};
}
const enter = (el) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
const button = (root, words) => {
	const b = [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === words);
	assert.ok(b, `a button "${words}"`);
	return b;
};

const BODY_DAYS = [
	["2026-10-10", { places: [{ id: "chest", s: ["prickly", "hollow", "tight"] }] }],
	["2026-10-11", { places: [{ id: "head", s: ["temperature:9", "warm", "fizzy, light"] }, { id: "stomach", s: ["buzzing", "Prickly"] }] }],
];

test("view: a body place offers the reader's earlier words under every place, after the widget's words, in a group named Earlier words; nothing is written by offering them", async () => {
	const text = withEntries(BODY_DAYS);
	const v = open(text);
	v.place("Jaw").click();
	await v.settled();
	const g = v.group(v.panel());
	assert.ok(g, "a group of its own");
	assert.equal(g.querySelector(".booklet-earlier-label").textContent, "Earlier words");
	const row = g.querySelector("[role=group]");
	assert.equal(row.getAttribute("aria-labelledby"), g.querySelector(".booklet-earlier-label").id, "the group is named by its label");
	assert.deepEqual(v.offeredIn(v.panel()), ["buzzing", "Prickly", "hollow"], "newest first, in the widget's order of places; the newest spelling; no word id, stale id or word holding a comma");
	// after the widget's own words, before the reader's words at this place and the field
	const kids = [...v.panel().children];
	const at = (cls) => kids.findIndex((x) => x.classList.contains(cls));
	const lastSense = kids.length - 1 - [...kids].reverse().findIndex((x) => x.classList.contains("booklet-sense-group"));
	assert.ok(lastSense < at("booklet-earlier") && at("booklet-earlier") < at("booklet-own-words") && at("booklet-own-words") < at("booklet-own-row"), kids.map((x) => x.className).join(" | "));
	for (const b of g.querySelectorAll("button")) assert.equal(b.getAttribute("aria-pressed"), "false", "unpressed");
	// the same words under another place, as the widget's are
	v.place("Feet").click();
	await v.settled();
	assert.deepEqual(v.offeredIn(v.panel()), ["buzzing", "Prickly", "hollow"]);
	assert.equal(v.disk.text, text, "nothing written");
	v.close();
});

test("view: a tap on a body place's earlier word stores what typing it there would, byte for byte; the answer's other places come first; the entries are not touched; Enter never takes an offered word", async () => {
	const text = withEntries(BODY_DAYS);
	const before = entriesBlock(text);
	const v = open(text);
	v.place("Chest").click();
	await v.settled();
	// a word of the reader's own typed at the chest now: offered under every other place first
	const field = () => v.panel().querySelector(".booklet-own-row input");
	typeInto(field(), "dull ache");
	enter(field());
	await v.settled();
	assert.equal(draftBody(v.disk.text), '{"places":[{"id":"chest","s":["dull ache"]}]}');
	assert.deepEqual(v.offeredIn(v.panel()), ["buzzing", "Prickly", "hollow"], "at the chest: its own word is there already");
	v.place("Jaw").click();
	await v.settled();
	assert.deepEqual(v.offeredIn(v.panel()), ["dull ache", "buzzing", "Prickly", "hollow"], "under the jaw, the answer's other places first");
	// Enter in the empty field takes nothing
	field().focus();
	enter(field());
	await v.settled();
	assert.equal(draftBody(v.disk.text), '{"places":[{"id":"chest","s":["dull ache"]}]}', "Enter takes no offered word");
	// a tap: the words at the end of the jaw's row, a new row at the end of the answer, as typing them there would
	const typed = core.regionAddOwn(core.regionsOf(core.parseBooklet(v.disk.text).activities[0].segments.find((s) => s.id === "places").widget.data), [{ id: "chest", s: ["dull ache"] }], "jaw", "Prickly");
	button(v.group(v.panel()), "Prickly").click();
	await v.settled();
	assert.equal(draftBody(v.disk.text), '{"places":[{"id":"chest","s":["dull ache"]},{"id":"jaw","s":["Prickly"]}]}');
	assert.deepEqual(norm(typed), [{ id: "chest", s: ["dull ache"] }, { id: "jaw", s: ["Prickly"] }], "the same as typing it");
	assert.deepEqual(v.offeredIn(v.panel()), ["dull ache", "buzzing", "hollow"], "taken: no longer offered at the jaw");
	assert.equal(field().value, "", "the field's text is not changed");
	assert.equal(entriesBlock(v.disk.text), before, "the kept entries are not touched");
	// half a word typed, then a tap: leaving the field adds what is typed, then the tap adds its words (nothing dropped)
	typeInto(field(), "pri");
	const hollow = button(v.group(v.panel()), "hollow");
	hollow.focus();
	hollow.click();
	await v.settled();
	assert.equal(draftBody(v.disk.text), '{"places":[{"id":"chest","s":["dull ache"]},{"id":"jaw","s":["Prickly","pri","hollow"]}]}');
	v.close();
});

test("view: a daily activity's earlier words leave out today's kept entry, which the draft will replace, at every place that offers them", async () => {
	let text = withEntries([
		["2026-10-12", { places: [{ id: "chest", s: ["from the 12th"] }], where: ["Garden shed"], thoughts: ["A line from the 12th"] }],
		["today", { places: [{ id: "jaw", s: ["today's word"] }], where: ["Today's spot"], thoughts: ["Today's line"] }],
	]);
	// the reader has started again today, and took those words out: a draft that holds other answers
	text = core.setDraftAnswer(text, S, A, "where", [1], { today: core.localDay(new Date()) });
	text = core.setDraftAnswer(text, S, A, "places", [{ id: "chest", s: ["now"] }], { today: core.localDay(new Date()) });
	text = core.setDraftAnswer(text, S, A, "thoughts", ["Now"], { today: core.localDay(new Date()) });
	const v = open(text);
	v.place("Neck").click();
	await v.settled();
	assert.deepEqual(v.offeredIn(v.panel()), ["now", "from the 12th"], "a body place");
	assert.deepEqual([...v.q("where").querySelectorAll("button.booklet-own[aria-pressed=false]")].map((b) => b.textContent.trim()), ["Garden shed"], "own options");
	assert.deepEqual(v.offeredIn(v.q("thoughts")), ["A line from the 12th"], "a lines question");
	v.close();
});

test("view: a lines question with earlier:12 offers its earlier lines under its fields; a tap fills the empty last line and opens a new one, never changing a typed line; nothing else is stored", async () => {
	const long = "A made-up thought that runs on and on, ".repeat(6).trim();
	const text = withEntries([
		["2026-10-13", { thoughts: ["rent", "The dentist on Friday"] }],
		["2026-10-14", { thoughts: ["The car service", "RENT", long] }],
	]);
	const before = entriesBlock(text);
	const v = open(text);
	const box = v.q("thoughts");
	const g = v.group(box);
	assert.ok(g && g.previousElementSibling.classList.contains("booklet-lines"), "the group is under the fields");
	assert.equal(g.querySelector(".booklet-earlier-label").textContent, "Earlier words");
	assert.deepEqual(v.offeredIn(box), ["The car service", "RENT", long, "The dentist on Friday"]);
	// a long line: shortened on screen (styles.css), its full words its name
	const lb = button(g, long);
	assert.ok(lb.classList.contains("booklet-earlier-word"));
	assert.equal(lb.getAttribute("aria-label"), long);
	const fields = () => [...box.querySelectorAll("input.booklet-line")];
	// a tap with nothing typed: the empty line takes it, and a new empty line follows
	button(g, "RENT").click();
	await v.settled();
	assert.equal(draftBody(v.disk.text), '{"thoughts":["RENT",""]}', "stored as typing RENT in the empty line stores it");
	assert.deepEqual(fields().map((f) => f.value), ["RENT", ""]);
	assert.deepEqual(v.offeredIn(box), ["The car service", long, "The dentist on Friday"]);
	// a line typed, then a tap: the typed line is kept as typed, the tap fills the empty line after it
	typeInto(fields()[1], "Seeds  to sow ");
	fields()[1].dispatchEvent(new w.FocusEvent("focusout", { bubbles: true }));
	await v.settled();
	assert.equal(draftBody(v.disk.text), '{"thoughts":["RENT","Seeds  to sow ",""]}');
	button(g, long).click();
	await v.settled();
	assert.equal(draftBody(v.disk.text), JSON.stringify({ thoughts: ["RENT", "Seeds  to sow ", long, ""] }), "the full words, and the typed line unchanged");
	assert.deepEqual(fields().map((f) => f.value), ["RENT", "Seeds  to sow ", long, ""]);
	// Enter in a line moves to the next line, and takes no offered word
	fields()[3].focus();
	enter(fields()[3]);
	await until(() => draftBody(v.disk.text) === JSON.stringify({ thoughts: ["RENT", "Seeds  to sow ", long, ""] }), "the line written");
	await v.settled();
	assert.equal(draftBody(v.disk.text), JSON.stringify({ thoughts: ["RENT", "Seeds  to sow ", long, ""] }));
	assert.equal(entriesBlock(v.disk.text), before, "the kept entries are not touched");
	v.close();
});

test("view: a lines question offers nothing without earlier:, or with earlier:0; earlier:1 offers one", async () => {
	const days = [["2026-10-13", { thoughts: ["rent", "The dentist on Friday"] }]];
	for (const [line, want] of [
		["> [!lines|thoughts] What is on your mind?", null],
		["> [!lines|thoughts earlier:0] What is on your mind?", null],
		["> [!lines|thoughts earlier:1] What is on your mind?", ["rent"]],
		["> [!lines|thoughts earlier:+3] What is on your mind?", null],
	]) {
		const note = CHECKIN.replace("> [!lines|thoughts earlier:12] What is on your mind?", line);
		assert.notEqual(note, CHECKIN);
		const v = open(withEntries(days, note));
		const g = v.group(v.q("thoughts"));
		if (want === null) assert.equal(g, null, `${line}: no group`);
		else assert.deepEqual(v.offeredIn(v.q("thoughts")), want, line);
		// a bad value is listed on screen with the note's other problems
		const listed = [...v.view.contentEl.querySelectorAll(".booklet-problems li")].map((x) => x.textContent);
		if (line.includes("+3")) assert.ok(listed.includes("Line 31: `earlier:+3` is not a whole number written in digits, so it was ignored and the question offers its default."), listed.join(" | "));
		else assert.ok(!listed.some((x) => /earlier/.test(x)), listed.join(" | "));
		v.close();
	}
});

test("view: an own option offered again under each: comes only from pairs whose pick the entry's source holds; a long one keeps its full words as its name", async () => {
	const long = "Somewhere with a very long made-up name, ".repeat(5).trim();
	const text = withEntries([
		["2026-10-15", { feelings: ["lively"], felt: [{ pick: "tense", a: ["Elbow"] }, { pick: "lively", a: ["Wrist", long] }] }],
	]);
	const v = open(text);
	button(v.q("feelings"), "Tired").click();
	await v.settled();
	const copy = v.q("felt").querySelector('.booklet-copy[data-booklet-pick="s:tired"]');
	const offered = [...copy.querySelectorAll("button.booklet-own[aria-pressed=false]")];
	assert.deepEqual(offered.map((b) => b.textContent.trim()), ["Wrist", long], "Elbow, under a feeling taken back, is not offered");
	assert.equal(offered[1].getAttribute("aria-label"), long);
	assert.ok(offered[1].classList.contains("booklet-earlier-word"));
	offered[1].click();
	await v.settled();
	assert.equal(draftBody(v.disk.text), JSON.stringify({ feelings: ["tired"], felt: [{ pick: "tired", a: [long] }] }), "a tap stores the full words, as Add your own would");
	v.close();
});
