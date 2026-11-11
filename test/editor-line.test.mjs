/*
 * One Booklet line, as the editing panel reads and rewrites it: read as the linter reads it (its callout_words, run in Python over the
 * same lines), and each setting changed in place with an exact round trip: on then off, or set then cleared, gives back the line as it
 * was, character for character. Carried over from the personal editor's line tests, at format 0.20.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, LINTER, py, pythonAvailable } from "./helpers.mjs";

const { parseLine, strayWords, setFlag, setValue, setId, removeWord, valueProblem, settingsOf, takesId, isKnownKind, LINTER_TABLES } = core;
const skip = pythonAvailable() ? false : "the linter (BOOKLET_REPO) or python3 is not here";

// Python's reading of each line: the linter's CALLOUT_LINE, then callout_words on the kind and the bar
function linterReads(lines) {
	return py(
		`
import importlib.util, json, re, sys
spec = importlib.util.spec_from_file_location("lint_booklet_line", sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
out = []
for line in json.loads(sys.argv[2]):
    t = line
    while True:
        mm = m.CALLOUT_LINE.match(t)
        if mm or not t.startswith(">"): break
        t = re.sub(r'^>[ \\t]?', '', t, count=1)
    if not mm or not t.startswith(">"):
        out.append(None); continue
    kind = mm.group(1).lower()
    w = m.callout_words(kind, mm.group(2))
    out.append({"kind": kind, "id": w["id"], "flags": sorted(w["flags"]), "set": w["set"], "fold": mm.group(3), "title": mm.group(4)})
print(json.dumps(out))
`,
		[LINTER, JSON.stringify(lines)],
	);
}

function reads(p) {
	if (!p) return null;
	return { kind: p.kind, id: p.id, flags: [...p.flags].sort(), set: Object.fromEntries(p.values), fold: p.fold, title: p.title };
}

const SAMPLES = [
	"> [!choice|q1 open menu:m] Pick one",
	"> [!Choice|Q1 OPEN Menu:M]- Mixed case",
	"> [!activity|a1 repeat daily icon:book status:off tab:t1 entries:folded]+ Everything",
	"> [!activity|a1   hidden\ticon:x icon:y]   Spacing, and the last value wins",
	"> [!module|m1 end]",
	"> [!row end]",
	"> [!row]",
	"> [!notice] Notice",
	"> [!group]- Steps",
	"> [!hint]- A hint",
	"> [!number|n1 min:0 max:10 step:0.5] How many",
	"> [!widget|w1 readonly describe] A widget",
	"> [!text|t1 long] Long text",
	"> [!text|] Empty bar",
	"> [!text] No bar",
	"> [!page|parent:map] A page whose first word holds a colon, so it has no id",
	"> [!page|map icon:book parent:top] A page with an id",
	"> [!copy|of:a,b] Copy with no id",
	"> [!copy|ask of:a,b/solution] Copy",
	"> [!listen|u1 left:60] Listen",
	"> [!text|t1　wide-space] A word split by U+3000",
	"> [!text|t1 nbsp] U+00A0",
	"> [!text|t1\u001cfs] U+001C",
	"> > [!choice|q2 open] Inside a group",
	"> > > [!text|deep] Two groups down",
	">[!scale|s1] tight",
	"> [!unknown|x y] Not a kind",
	"> [!note] Reading",
	"Not a callout",
	"> just a quote",
];

test("a line is read as the linter reads it: kind, id, flags, settings, fold, title", { skip }, () => {
	const want = linterReads(SAMPLES);
	SAMPLES.forEach((line, k) => assert.deepEqual(reads(parseLine(line)), want[k], JSON.stringify(line)));
});

test("positions: the title starts where the linter's title starts, and the quotes in front are kept", () => {
	const p = parseLine("> > [!choice|q2 open]- Inside a group");
	assert.equal(p.quotes, "> ");
	assert.equal(p.title, "Inside a group");
	assert.equal(p.text.slice(p.titleStart), "Inside a group");
	assert.equal(p.kindText, "choice");
	assert.equal(p.id, "q2");
	assert.equal(p.text.slice(p.idStart, p.idEnd), "q2");
});

// every kind with settings, with an odd-looking line, and each flag and each key turned on and off again
function baseLines(kind) {
	const id = takesId(kind) ? `${kind}-1` : null;
	const bar = (rest) => (id ? `|${id}${rest ? ` ${rest}` : ""}` : rest ? `|${rest}` : "");
	return [
		`> [!${kind}${bar("")}] A title`,
		`> [!${kind.toUpperCase()}${bar("")}]-   Folded, spaced  `,
		`> > [!${kind}${bar("")}] In a group`,
		id ? `> [!${kind}|${id}   ] Trailing space in the bar` : `> [!${kind}|   ] Only space in the bar`,
	];
}

test("each flag of each kind: on, then off, gives back the line exactly; the linter reads the flag on", { skip }, () => {
	const cases = [];
	for (const [kind] of LINTER_TABLES.KIND_SETTINGS) {
		for (const f of settingsOf(kind).flags) {
			for (const line of baseLines(kind)) {
				const p = parseLine(line);
				const on = f === "daily" ? setFlag(parseLine(setFlag(p, "repeat", true).text), "daily", true) : setFlag(p, f, true);
				assert.ok(!on.error, `${kind} ${f}: ${on.error}`);
				const back = setFlag(parseLine(on.text), f === "daily" ? "repeat" : f, false);
				assert.equal(back.text, line, `${kind} ${f} on and off, on ${JSON.stringify(line)}`);
				cases.push([on.text, kind, f]);
			}
		}
	}
	const want = linterReads(cases.map((c) => c[0]));
	cases.forEach(([text, kind, f], k) => {
		assert.equal(want[k].kind, kind);
		assert.ok(want[k].flags.includes(f), `${text} has ${f}`);
		if (takesId(kind)) assert.equal(want[k].id, `${kind}-1`, text);
	});
});

test("each key of each kind: set, then cleared, gives back the line exactly; the linter reads the value set", { skip }, () => {
	const cases = [];
	for (const [kind] of LINTER_TABLES.KIND_SETTINGS) {
		for (const key of settingsOf(kind).keys) {
			for (const line of baseLines(kind)) {
				const set = setValue(parseLine(line), key, "v-1");
				assert.ok(!set.error, `${kind} ${key}: ${set.error}`);
				const changed = setValue(parseLine(set.text), key, "v-2");
				const back = setValue(parseLine(changed.text), key, "");
				assert.equal(back.text, line, `${kind} ${key} set and cleared, on ${JSON.stringify(line)}`);
				cases.push([changed.text, kind, key]);
			}
		}
	}
	const want = linterReads(cases.map((c) => c[0]));
	cases.forEach(([text, kind, key], k) => {
		assert.equal(want[k].set[key], "v-2", text);
		if (takesId(kind)) assert.equal(want[k].id, `${kind}-1`, text);
	});
});

test("a value already on the line keeps its key's spelling and its place; only the last one, the one read, changes", () => {
	const p = parseLine("> [!activity|a1 Icon:book hidden icon:star] T");
	assert.equal(setValue(p, "icon", "leaf").text, "> [!activity|a1 Icon:book hidden icon:leaf] T");
	assert.equal(setValue(p, "icon", "").text, "> [!activity|a1 hidden] T");
	assert.equal(setValue(parseLine("> [!activity|a1 Icon:book] T"), "icon", "leaf").text, "> [!activity|a1 Icon:leaf] T");
});

test("daily needs repeat: it is refused alone, written after repeat, and goes when repeat goes", () => {
	const p = parseLine("> [!activity|a1 hidden icon:x] T");
	assert.match(setFlag(p, "daily", true).error, /needs `repeat`/);
	const rep = setFlag(p, "repeat", true).text;
	assert.equal(rep, "> [!activity|a1 hidden icon:x repeat] T");
	const daily = setFlag(parseLine(rep), "daily", true).text;
	assert.equal(daily, "> [!activity|a1 hidden icon:x repeat daily] T");
	assert.equal(setFlag(parseLine(daily), "repeat", false).text, "> [!activity|a1 hidden icon:x] T");
	assert.equal(setFlag(parseLine(daily), "daily", false).text, rep);
	// with other words after `repeat`, `daily` still goes right after it
	assert.equal(setFlag(parseLine("> [!activity|a1 repeat hidden icon:x] T"), "daily", true).text, "> [!activity|a1 repeat daily hidden icon:x] T");
});

test("a line that needs an id and has none takes no bare word until the id is written; a key:value word is a setting, not an id", () => {
	for (const line of ["> [!choice] Pick", "> [!choice|] Pick"]) {
		assert.match(setFlag(parseLine(line), "open", true).error, /no id yet/);
		// `menu:m` holds a colon, so it is read as a setting and the line still has no id (SPEC section 4)
		assert.equal(setValue(parseLine(line), "menu", "m").text.includes("menu:m"), true);
	}
	// a page's id is optional: its icon goes straight after the bar
	assert.equal(setValue(parseLine("> [!page] A page"), "icon", "book").text, "> [!page|icon:book] A page");
	// a kind with no id takes settings straight after the bar
	assert.equal(setFlag(parseLine("> [!row] "), "end", true).text, "> [!row|end] ");
	assert.equal(setFlag(parseLine("> [!row|end] "), "end", false).text, "> [!row] ");
});

test("words a kind does not take are listed, and each can be removed; the id cannot", () => {
	const p = parseLine("> [!choice|q1 open mx:5 bogus menu:m] Pick");
	const stray = strayWords(p).map((s) => p.words[s.index].text);
	assert.deepEqual(stray, ["mx:5", "bogus"]);
	assert.equal(removeWord(p, 2).text, "> [!choice|q1 open bogus menu:m] Pick");
	assert.equal(removeWord(p, 3).text, "> [!choice|q1 open mx:5 menu:m] Pick");
	assert.match(removeWord(p, 0).error, /id/);
	let q = parseLine("> [!choice|q1 a b c] T");
	q = parseLine(removeWord(q, 1).text);
	q = parseLine(removeWord(q, 1).text);
	assert.equal(q.text, "> [!choice|q1 c] T");
	assert.equal(removeWord(parseLine("> [!notice|x] T"), 0).text, "> [!notice] T");
});

test("a value with a space or a ] is refused; anything else is written as typed", () => {
	assert.ok(valueProblem("a b"));
	assert.ok(valueProblem("a]"));
	assert.equal(valueProblem("1.5"), null);
	assert.ok(setValue(parseLine("> [!number|n] N"), "min", "1 2").error);
	assert.equal(setValue(parseLine("> [!number|n] N"), "min", "-3").text, "> [!number|n min:-3] N");
});

test("renaming an id changes that word and nothing else; a bad id is refused", () => {
	assert.equal(setId(parseLine("> [!choice|q1 open menu:m]- Pick"), "q2").text, "> [!choice|q2 open menu:m]- Pick");
	assert.equal(setId(parseLine("> > [!text|a   long] Pick  "), "b-2").text, "> > [!text|b-2   long] Pick  ");
	assert.equal(setId(parseLine("> [!text] Pick"), "t1").text, "> [!text|t1] Pick");
	assert.equal(setId(parseLine("> [!text|long:x] Pick"), "t1").text, "> [!text|t1 long:x] Pick");
	assert.ok(setId(parseLine("> [!text|q1] Pick"), "has space").error);
	assert.ok(setId(parseLine("> [!text|q1] Pick"), "-dash").error);
	assert.ok(setId(parseLine("> [!text|q1] Pick"), "").error);
	assert.ok(setId(parseLine("> [!row] "), "r").error);
});

test("the tables follow the linter: kinds, flags, keys, what takes an id", () => {
	assert.deepEqual(settingsOf("activity"), {
		flags: ["repeat", "daily", "hidden"],
		keys: ["icon", "status", "tab", "entries"],
		all: ["repeat", "daily", "hidden", "icon:", "status:", "tab:", "entries:"],
	});
	assert.deepEqual(settingsOf("choice").flags, ["open"]);
	assert.deepEqual(settingsOf("number").keys, ["min", "max", "step", "each"]);
	assert.deepEqual(settingsOf("page").keys, ["icon", "parent"]);
	assert.equal(takesId("row"), false);
	assert.equal(takesId("choice"), true);
	assert.equal(isKnownKind("note"), false);
});
