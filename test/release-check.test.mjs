/*
 * release-check.mjs, which the release workflow runs first: a plain x.y.z tag is a real release, x.y.z-<suffix> is a pre-release of
 * x.y.z (for BRAT), and the x.y.z must be the version in manifest.json, package.json and versions.json. Made-up versions only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRelease } from "../release-check.mjs";
import { ROOT } from "./helpers.mjs";

const files = (version = "2.3.4") => ({
	manifest: { version, minAppVersion: "1.5.0" },
	pkg: { version },
	versions: { "2.0.0": "1.4.0", [version]: "1.5.0" },
});

test("release-check: a plain x.y.z tag that is the version everywhere is a real release", () => {
	assert.deepEqual(checkRelease("2.3.4", files()), { kind: "release", base: "2.3.4", problems: [] });
});

test("release-check: x.y.z-suffix tags are pre-releases of x.y.z", () => {
	for (const tag of ["2.3.4-beta.1", "2.3.4-rc1", "2.3.4-test", "2.3.4-pr-12.2", "2.3.4-0", "2.3.4-a-", "2.3.4-0a", "2.3.4-1.0.beta"]) {
		assert.deepEqual(checkRelease(tag, files()), { kind: "prerelease", base: "2.3.4", problems: [] }, tag);
	}
});

test("release-check: a plain tag that is not the version in a file is refused, naming the file", () => {
	const r = checkRelease("2.3.5", files());
	assert.equal(r.kind, "release");
	assert.equal(r.problems.length, 3);
	assert.match(r.problems[0], /manifest\.json says 2\.3\.4/);
	assert.match(r.problems[1], /package\.json says 2\.3\.4/);
	assert.match(r.problems[2], /versions\.json does not give 2\.3\.5/);
	const f = files();
	f.pkg.version = "2.3.3";
	assert.deepEqual(checkRelease("2.3.4", f).problems.map((p) => p.split(" says ")[0]), ["package.json"]);
});

test("release-check: a pre-release whose x.y.z is not the version in the files is refused", () => {
	const r = checkRelease("2.3.5-beta.1", files());
	assert.equal(r.kind, "prerelease");
	assert.equal(r.base, "2.3.5");
	assert.equal(r.problems.length, 3);
	assert.match(r.problems[0], /the tag is 2\.3\.5-beta\.1, whose version is 2\.3\.5/);
	// the suffix is not the version: the tag that was the version before the suffix passes, one release behind does not
	assert.equal(checkRelease("2.3.3-beta.1", files()).problems.length, 3);
});

test("release-check: versions.json must give the version the manifest's minAppVersion", () => {
	const f = files();
	f.versions["2.3.4"] = "1.0.0";
	assert.match(checkRelease("2.3.4", f).problems.join("\n"), /does not give 2\.3\.4 the manifest's minAppVersion 1\.5\.0/);
	assert.equal(checkRelease("2.3.4-beta.1", f).problems.length, 1);
	delete f.versions["2.3.4"];
	assert.equal(checkRelease("2.3.4", f).problems.length, 1);
});

test("release-check: tags that are neither kind are refused with no kind", () => {
	for (const tag of ["", "v2.3.4", "2.3", "2.3.4.5", "2.3.4-", "2.3.4-.1", "2.3.4-beta..1", "2.3.4+build", "2.3.4-beta+1", "2.3.x", "02.3.4", "01.0.1", "2.03.4", "2.3.04", "2.3.4-01", "2.3.4-beta.01", "2.3.4-00", "2.3.4-1.01", "02.3.4 ", " 2.3.4", "2.3.4-be ta", "main", "2.3.4\n"]) {
		const r = checkRelease(tag, files());
		assert.equal(r.kind, null, JSON.stringify(tag));
		assert.equal(r.problems.length, 1, JSON.stringify(tag));
		assert.match(r.problems[0], /neither a plain x\.y\.z version nor x\.y\.z-<suffix>/);
	}
});

/** The script as the workflow runs it: in a folder holding the three files, with the tag as its argument. */
function run(tag, { version = "2.3.4", output = true } = {}) {
	const dir = mkdtempSync(join(tmpdir(), "booklet-release-"));
	const f = files(version);
	writeFileSync(join(dir, "manifest.json"), JSON.stringify(f.manifest));
	writeFileSync(join(dir, "package.json"), JSON.stringify(f.pkg));
	writeFileSync(join(dir, "versions.json"), JSON.stringify(f.versions));
	const out = join(dir, "github-output");
	writeFileSync(out, "");
	const env = { ...process.env };
	delete env.GITHUB_OUTPUT;
	if (output) env.GITHUB_OUTPUT = out;
	const r = spawnSync(process.execPath, [join(ROOT, "release-check.mjs"), tag], { cwd: dir, env, encoding: "utf8" });
	return { code: r.status, stdout: r.stdout, stderr: r.stderr, output: readFileSync(out, "utf8") };
}

test("release-check: run as the workflow runs it, a real release writes kind=release", () => {
	const r = run("2.3.4");
	assert.equal(r.code, 0);
	assert.equal(r.output, "kind=release\n");
	assert.match(r.stdout, /2\.3\.4 is the version everywhere \(a real release\)/);
});

test("release-check: run as the workflow runs it, a pre-release writes kind=prerelease", () => {
	const r = run("2.3.4-beta.1");
	assert.equal(r.code, 0);
	assert.equal(r.output, "kind=prerelease\n");
	assert.match(r.stdout, /2\.3\.4-beta\.1 is a pre-release of 2\.3\.4/);
});

test("release-check: run as the workflow runs it, a refused tag exits 1 and writes no kind", () => {
	for (const tag of ["2.3.5", "2.3.5-beta.1", "v2.3.4", "2.3.4-"]) {
		const r = run(tag);
		assert.equal(r.code, 1, tag);
		assert.equal(r.output, "", tag);
		assert.match(r.stderr, /^release-check: /, tag);
	}
});

test("release-check: with no GITHUB_OUTPUT (run by hand) it only prints", () => {
	const r = run("2.3.4-rc.2", { output: false });
	assert.equal(r.code, 0);
	assert.equal(r.output, "");
});

test("release-check: the repository's own files pass for their own version, as a release and as a pre-release", () => {
	const v = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")).version;
	const read = (f) => JSON.parse(readFileSync(join(ROOT, f), "utf8"));
	const own = { manifest: read("manifest.json"), pkg: read("package.json"), versions: read("versions.json") };
	assert.deepEqual(checkRelease(v, own).problems, []);
	assert.deepEqual(checkRelease(`${v}-beta.1`, own).problems, []);
});
