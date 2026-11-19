/*
 * The panel reads lines with the linter's own patterns. Each is run here and in Python over the same lines, including the lines where
 * Python and JavaScript read the same source differently (digits, spaces and word characters outside ASCII, U+2028 in a title), and
 * the answers must be the same. The patterns ported by hand are found, verbatim, in the linter's source.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { core, LINTER, py, pythonAvailable } from "./helpers.mjs";

const { LP, PORTED, LINTER_TABLES, pyRegExp } = core;
const skip = pythonAvailable() ? false : "the linter (BOOKLET_REPO) or python3 is not here";

const LINES = [
	"> [!choice|q1 open menu:m] Pick one",
	">[!choice|q1] tight",
	"> [!Choice|Q-1]- Folded, mixed case",
	"> [!activity|a1 repeat daily icon:book]+ Open",
	"> [!module|m1 end]",
	"> [!note] A reading callout",
	"> [!note]",
	"> [!records|m1]",
	"> [!RECORDS|m1]",
	"> [!recordsx|m1]",
	"> [!recordsé|m1]",
	"> [!records|m1",
	"> [!-bad|x] Not a kind",
	"> > [!choice|q] Inside a group",
	">\t[!text|t] Tab after the mark",
	"> [!text|t] A title with   a line separator",
	"> [!text|t] A title with \r a return",
	"> [!text|t]  ",
	"```",
	"~~~booklet data",
	"   ````js",
	"    ```",
	"```  ",
	"---",
	"- - -",
	"***",
	"_ _ _ _",
	"--",
	"- [ ] An option",
	"- [x] Checked",
	"* [X] Star",
	"  + plain bullet",
	"-no space",
	"1. First",
	"12) Twelfth",
	"١. Arabic-Indic one",
	"１. Fullwidth one",
	"1.No space",
	"^figure-1",
	"^bad id",
	"[^src-1]: A source",
	"[^src-1]: nbsp then text",
	"[^src-1]: \u001ctext after a file separator",
	"[^src-1]:",
	"[label]: images/a.jpg",
	"[label]: <images/a b.jpg>",
	"[label]:　x",
	"   [label]: x",
	"    [label]: x",
	"icon:book",
	"Icon:Book",
	"1icon:x",
	"menu:",
	"q1",
	"Q-1",
	"-q",
	"été",
	"",
];

function pythonAnswers(patterns) {
	return py(
		`
import json, re, sys
pats = json.loads(sys.argv[1]); lines = json.loads(sys.argv[2])
out = {}
for name, (src, flags) in pats.items():
    r = re.compile(src, re.I if "i" in flags else 0)
    out[name] = [(lambda m: None if m is None else [m.group(0)] + list(m.groups()))(r.match(l)) for l in lines]
print(json.dumps(out))
`,
		[JSON.stringify(patterns), JSON.stringify(LINES)],
	);
}

const js = (re, line) => {
	re.lastIndex = 0;
	const m = re.exec(line);
	return m === null ? null : [...m].map((g) => (g === undefined ? null : g));
};

test("the linter's module-level patterns match as Python matches them", { skip }, () => {
	const pats = Object.fromEntries(Object.entries(LINTER_TABLES.patterns).map(([n, p]) => [n, [p.source, p.flags]]));
	const want = pythonAnswers(pats);
	for (const name of Object.keys(pats)) LINES.forEach((line, k) => assert.deepEqual(js(LP[name], line), want[name][k], `${name} on ${JSON.stringify(line)}`));
});

test("the hand-ported patterns match as Python matches them", { skip }, () => {
	const pats = Object.fromEntries(PORTED.map(([n, src, flags]) => [n, [src, flags]]));
	const want = pythonAnswers(pats);
	for (const name of Object.keys(pats)) LINES.forEach((line, k) => assert.deepEqual(js(LP[name], line), want[name][k], `${name} on ${JSON.stringify(line)}`));
});

test("each hand-ported pattern is written in the linter exactly so", { skip }, () => {
	const src = readFileSync(LINTER, "utf8");
	for (const [name, source] of PORTED) assert.ok(src.includes(`r'${source}'`) || src.includes(`r"${source}"`), `${name} is not in the linter as ${source}`);
});

test("a Python escape the panel cannot read as Python does stops it, rather than reading differently", () => {
	assert.throws(() => pyRegExp(String.raw`^\w+$`), /does not read as Python does/);
	assert.throws(() => pyRegExp(String.raw`^[]x]$`), /opens a class with \]/);
	assert.equal(pyRegExp(String.raw`^a\-b$`).test("a-b"), true);
});
