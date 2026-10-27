/* Shared by the tests: the bundled core, the byte-identity check, and the linter. */
import { spawnSync } from "node:child_process";
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

/** JSON values as plain data (the core's objects have no prototype). */
export const norm = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

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
 * The errors the reference linter (format 0.15) is expected to report on a test-vault note, and no others: what the
 * plugin draws ahead of the format. The check-in note asks a question for each feeling picked (`each:`, format 0.16)
 * and colours two cells `blue` and `purple`, which 0.15 does not name. Every check that lints a note expects exactly
 * these (e2e/plugin-check.js keeps the same list).
 */
export const EXPECTED_LINT = {
	"Check-in.booklet.md": [/a multi line takes no `each:` setting/, /a lines line takes no `earlier:` setting/, /has the colour 'blue', which is not a colour name/, /has the colour 'purple', which is not a colour name/],
};

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
