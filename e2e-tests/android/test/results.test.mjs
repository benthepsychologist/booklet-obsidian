import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Results, stamp } from "../lib/results.mjs";

const make = () => {
	const r = new Results({ summary: { Plugin: "Booklet 1.0.1" }, limits: ["iOS is not covered."] });
	r.add({ id: "plugin-loads", title: "The plugin loads", status: "pass", detail: "loaded", screenshots: ["screenshots/01-a.png"], ms: 1500 });
	r.add({ id: "now-playing", title: "The bar stays", status: "limit", detail: "the tone did not play" });
	r.add({ id: "page-kept", title: "Page kept", status: "fail", step: "the open page after reopening", detail: "it was lost" });
	r.add({ id: "lock-observation", title: "Idle and lock", status: "observation", detail: "bar present" });
	r.add({ id: "x", title: "Skipped one", status: "skipped", detail: "because" });
	return r;
};

test("counts and verdict: a fail makes the run fail; limits and observations do not", () => {
	const r = make();
	assert.deepEqual(r.counts, { pass: 1, fail: 1, limit: 1, observation: 1, skipped: 1 });
	assert.equal(r.verdict, "fail");
	const ok = new Results();
	ok.add({ id: "a", title: "A", status: "pass" });
	ok.add({ id: "b", title: "B", status: "limit" });
	ok.add({ id: "c", title: "C", status: "observation" });
	assert.equal(ok.verdict, "pass");
	assert.equal(new Results().verdict, "incomplete");
});

test("add refuses an unknown status or a nameless check", () => {
	const r = new Results();
	assert.throws(() => r.add({ id: "a", title: "A", status: "maybe" }), RangeError);
	assert.throws(() => r.add({ status: "pass" }), TypeError);
});

test("markdown carries the verdict, one row per check, the failing step and the limits", () => {
	const md = make().toMarkdown();
	assert.match(md, /\*\*Verdict: FAIL\*\*/);
	assert.match(md, /\| 1 \| plugin-loads \| PASS \|/);
	assert.match(md, /\| 3 \| page-kept \| FAIL \|/);
	assert.match(md, /Step that failed: the open page after reopening/);
	assert.match(md, /`screenshots\/01-a\.png`/);
	assert.match(md, /iOS is not covered\./);
	assert.match(md, /Booklet 1\.0\.1/);
	for (const line of md.split("\n").filter((l) => l.startsWith("|"))) assert.ok(line.length < 100, line);
});

test("write makes results.md and results.json that agree", () => {
	const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "android-pass-res-")), "run");
	make().write(dir);
	const j = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
	assert.equal(j.verdict, "fail");
	assert.equal(j.checks.length, 5);
	assert.equal(j.checks[2].step, "the open page after reopening");
	assert.ok(fs.readFileSync(path.join(dir, "results.md"), "utf8").includes("page-kept"));
});

test("stamp has no colons", () => {
	assert.equal(stamp(new Date("2026-11-04T10:31:22.456Z")), "2026-11-04T10-31-22Z");
});

test("observations never count towards the verdict", () => {
	const r = new Results();
	r.add({ id: "lock-observation", title: "Lock", status: "observation", detail: "the observation could not be completed" });
	assert.equal(r.verdict, "incomplete", "an observation alone is not a pass");
	r.add({ id: "a", title: "A", status: "pass" });
	assert.equal(r.verdict, "pass", "and does not spoil one");
	assert.equal(r.counts.fail, 0);
});
