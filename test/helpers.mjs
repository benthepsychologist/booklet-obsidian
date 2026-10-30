/* Shared by the tests: the bundled core, the byte-identity check, and the linter. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import * as core from "./.build/core.mjs";

export { core };

/*
 * Where the corpus lives. These paths exist on the box the plugin was built on; anywhere else, set the
 * environment variables (or leave them unset, and the tests that need them are skipped with a message):
 *   BOOKLET_REPO       a checkout of the booklet format repository (default /workspace/booklet)
 *   BOOKLET_EXAMPLES   its examples folder (default $BOOKLET_REPO/examples)
 *   BOOKLET_LINTER     its reference linter (default $BOOKLET_REPO/lint-booklet.py)
 *   BOOKLET_STARTERS   a folder of kit starter booklets (default the booklet hub's Obsidian kit starters)
 */
export const BOOKLET = process.env.BOOKLET_REPO || "/workspace/booklet";
export const EXAMPLES = process.env.BOOKLET_EXAMPLES || join(BOOKLET, "examples");
export const LINTER = process.env.BOOKLET_LINTER || join(BOOKLET, "lint-booklet.py");
export const STARTERS = process.env.BOOKLET_STARTERS || "/workspace/fleet/hubs/booklet-hub/tools/booklet-obsidian/kit/Starter";
export const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/** The sampler booklet the navigation tests open (made-up). */
export const SKETCH = readFileSync(join(ROOT, "test-vault", "Learning to sketch.booklet.md"), "utf8");
/** The made-up check-in note (a repeating activity with a grid, a body map, and a question asked for each pick). */
export const CHECKIN = readFileSync(join(ROOT, "test-vault", "Check-in.booklet.md"), "utf8");

/** The made-up wiki note the page-tree tests open: a check-in with a wiki tab, a quiz tab and a dashboard tab. */
export const WIKI = readFileSync(join(ROOT, "test", "page-notes", "Check-in with a wiki.booklet.md"), "utf8");
/** The screen of its one activity. */
export const WIKI_SCREEN = "activity:calm/check-in";
/** A version 1 saved place of that screen (release 0.6.0 and 0.7.0 wrote these). */
export const wikiAt = (tab, part) => ({ version: 1, screen: WIKI_SCREEN, tab, part });

/** A note read, then its navigation model built. */
export const build = (text) => {
	const book = core.parseBooklet(text);
	return { book, nav: core.buildNav(book, text) };
};

/** A string's sha256 in hex, for "the file is byte for byte what it was". */
export const sha = (s) => createHash("sha256").update(s).digest("hex");

/** Waits `ms` milliseconds. */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** JSON values as plain data (the core's objects have no prototype). */
export const norm = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** `text` with these made-up days kept in an activity: each day's answers put in the draft, then finalized at its `ts`. */
export function keepDays(text, scope, id, days) {
	for (const [ts, ans] of days) {
		for (const [k, v] of Object.entries(ans)) text = core.setDraftAnswer(text, scope, id, k, v);
		text = core.finalizeDraft(text, scope, id, { ts }).text;
	}
	return text;
}

/** The text of a file outside its records regions: [before the first, between each two, after the last]. */
export function outsideRegions(text) {
	const L = core.splitLines(text);
	const lines = L.map((l) => l.text);
	const regions = core.findRegions(lines, core.frontMatterOf(lines).bodyStart);
	const offsets = [];
	let o = 0;
	for (const l of L) {
		offsets.push(o);
		o += l.text.length + l.eol.length;
	}
	offsets.push(o);
	const parts = [];
	let from = 0;
	for (const r of regions) {
		parts.push(text.slice(from, offsets[r.start]));
		from = offsets[r.end + 1];
	}
	parts.push(text.slice(from));
	return { parts, regions };
}

/**
 * The writer's rule: every byte before the region and after its closing `%%` is unchanged. With no
 * region in the original, the new text is the original, then line breaks only, then the new region.
 */
export function assertOutsideUnchanged(orig, next, what = "") {
	const a = outsideRegions(orig);
	if (!a.regions.length) {
		assert.ok(next.startsWith(orig), `${what}: the original text is no longer a prefix of the new text`);
		const added = next.slice(orig.length);
		assert.match(added, /^(\r?\n)*%%\r?\n/, `${what}: only line breaks may come between the body and the new region`);
		assert.equal(outsideRegions(next).regions.length, 1, `${what}: the new text has one region`);
		return;
	}
	const b = outsideRegions(next);
	assert.equal(b.regions.length, a.regions.length, `${what}: the number of records regions changed`);
	assert.deepEqual(b.parts, a.parts, `${what}: text outside the records region changed`);
}

/**
 * The errors the reference linter is expected to report on a test-vault note, by its file name, and no others. The
 * format 0.16 linter reports none on any of them: the check-in note's `each:`, `earlier:` and `blue` and `purple`
 * cells, which the 0.15 linter reported, are format 0.16's. Every check that lints a note expects exactly these
 * (e2e/plugin-check.js keeps the same list).
 */
export const EXPECTED_LINT = {};

/** The expected errors for a note, by its file name (none for any other). */
export const expectedLint = (file) => EXPECTED_LINT[String(file).split("/").pop()] ?? [];

/**
 * Whether a linter run reports exactly the expected errors, each once, and nothing else: null if so, else what differs.
 */
export function lintDiffers(r, expected = []) {
	const errors = r.out.split("\n").filter((l) => l.startsWith("ERROR"));
	const unmatched = errors.filter((l) => !expected.some((re) => re.test(l)));
	const missing = expected.filter((re) => errors.filter((l) => re.test(l)).length !== 1);
	const count = new RegExp(` ${expected.length} errors? `);
	if (unmatched.length || missing.length || !count.test(r.out) || r.status !== (expected.length ? 1 : 0))
		return `exit ${r.status}; unexpected: ${JSON.stringify(unmatched)}; expected once and not so: ${missing.map(String).join(", ")}\n${r.out}`;
	return null;
}

/** Runs the reference linter on `text` saved as a booklet file. Returns null when it cannot run. */
export function lint(text, name = "written.booklet.md") {
	if (!existsSync(LINTER)) return null;
	const dir = mkdtempSync(join(tmpdir(), "booklet-"));
	const file = join(dir, name);
	writeFileSync(file, text);
	const r = spawnSync("python3", [LINTER, file], { encoding: "utf8", timeout: 60000 });
	rmSync(dir, { recursive: true, force: true });
	if (r.error) return null;
	return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

export const pythonAvailable = () => {
	const r = spawnSync("python3", ["--version"], { encoding: "utf8" });
	return !r.error && r.status === 0 && existsSync(LINTER);
};

/** The folders the corpus test reads, and whether each is there. The test vault is always there. */
export function corpusDirs() {
	return [
		{ name: "booklet examples (BOOKLET_EXAMPLES)", dir: EXAMPLES, filter: (f) => f.endsWith(".booklet.md"), external: true },
		{ name: "kit starters (BOOKLET_STARTERS)", dir: STARTERS, filter: (f) => f.endsWith(".md"), external: true },
		{ name: "the test vault", dir: join(ROOT, "test-vault"), filter: (f) => f.endsWith(".booklet.md"), external: false },
		{ name: "made-up page-tree notes (test/page-notes)", dir: join(ROOT, "test", "page-notes"), filter: (f) => f.endsWith(".booklet.md"), external: false },
	].map((d) => ({ ...d, present: existsSync(d.dir) }));
}

/** Every booklet file the corpus test runs over: the external folders that are there, and the test vault. */
export function corpusFiles() {
	const out = [];
	for (const d of corpusDirs()) {
		if (!d.present) continue;
		for (const f of readdirSync(d.dir).sort()) if (d.filter(f)) out.push(join(d.dir, f));
	}
	return out;
}

export const read = (f) => readFileSync(f, "utf8");

// the set-up the 0.9.0 test files share: a note's front matter, a query fence, the day the views are drawn on, a plan's rows
export const fm = `---\nbooklet: "0.16"\ntitle: Garden\n---\n`;
export const fence = (body) => "```booklet query\n" + body + "\n```";
export const DRAWN = new Date("2026-10-28T12:00:00Z");
export const rowsOf = (p) => p.groups.flatMap((g) => g.rows);
