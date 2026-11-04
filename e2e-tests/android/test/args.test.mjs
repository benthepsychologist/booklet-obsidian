import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseArgs, ArgError, systemImage, usage, isReleaseTag, DEFAULTS, CHECK_IDS } from "../lib/args.mjs";

const ctx = { repoRoot: "/repo", here: "/repo/e2e-tests/android" };
const parse = (...a) => parseArgs(a, ctx);

test("defaults: the repository's own build, Obsidian 1.15.0, API 36 arm64 google_apis", () => {
	const o = parse();
	assert.equal(o.pluginDir, path.resolve("/repo"));
	assert.equal(o.release, undefined);
	assert.equal(o.obsidian, "1.15.0");
	assert.equal(systemImage(o), "system-images;android-36;google_apis;arm64-v8a");
	assert.equal(o.out, path.resolve("/repo/e2e-tests/android/results"));
	assert.equal(o.cache, path.resolve("/repo/e2e-tests/android/.cache"));
	assert.equal(o.emulatorPort, 5554);
	assert.equal(o.timeoutScale, 1);
});

test("value flags in both spellings, boolean flags", () => {
	const o = parse("--release", "1.0.1", "--obsidian=1.14.4", "--api", "35", "--headless", "--mute", "--timeout-scale", "2", "--only", "now-playing,allow-card");
	assert.equal(o.release, "1.0.1");
	assert.equal(o.pluginDir, undefined);
	assert.equal(o.obsidian, "1.14.4");
	assert.equal(systemImage(o), "system-images;android-35;google_apis;arm64-v8a");
	assert.equal(o.headless, true);
	assert.equal(o.mute, true);
	assert.equal(o.timeoutScale, 2);
	assert.deepEqual(o.only, ["now-playing", "allow-card"]);
});

test("--obsidian: one version, min (the plugin's minAppVersion), or both", () => {
	assert.deepEqual(parse().versions, ["1.15.0"]);
	assert.deepEqual(parse("--obsidian", "1.11.7").versions, ["1.11.7"]);
	assert.deepEqual(parse("--obsidian", "min").versions, ["min"]);
	assert.deepEqual(parse("--obsidian", "both").versions, ["1.15.0", "min"]);
	assert.throws(() => parse("--obsidian", "latest"), /"min".*"both"/);
});

test("--plugin-dir is made absolute; --apk too", () => {
	const o = parse("--plugin-dir", "build", "--apk", "x.apk");
	assert.equal(o.pluginDir, path.resolve("build"));
	assert.equal(o.apk, path.resolve("x.apk"));
});

test("errors name the option", () => {
	const bad = (args, re) => assert.throws(() => parse(...args), (e) => e instanceof ArgError && re.test(e.message));
	bad(["--nope"], /unknown option --nope/);
	bad(["--release"], /--release needs a value/);
	bad(["--release", "--mute"], /--release needs a value/);
	bad(["--release", "v1.0.1"], /no leading "v"/);
	bad(["--release", "1.0.1", "--plugin-dir", "x"], /not both/);
	bad(["--obsidian", "latest"], /expected a version/);
	bad(["--obsidian", "1.11"], /expected a version/);
	bad(["--avd", "a b"], /--avd/);
	bad(["--api", "thirty-six"], /--api/);
	bad(["--emulator-port", "5555"], /even number/);
	bad(["--appium-port", "80"], /port/);
	bad(["--timeout-scale", "0"], /--timeout-scale/);
	bad(["--only", "nothing"], /unknown check nothing/);
	bad(["--mute=yes"], /takes no value/);
});

test("isReleaseTag", () => {
	for (const t of ["1.0.1", "1.0.2-beta.1", "0.13.0"]) assert.equal(isReleaseTag(t), true, t);
	for (const t of ["v1.0.1", "1.0", "latest", "", "1.0.1 "]) assert.equal(isReleaseTag(t), false, t);
});

test("usage lists every check id and the main flags", () => {
	const u = usage();
	for (const id of CHECK_IDS) assert.match(u, new RegExp(id));
	for (const f of ["--plugin-dir", "--release", "--dry-run", "--check", "--timeout-scale", "--skip-lock"]) assert.match(u, new RegExp(f));
	assert.match(u, new RegExp(DEFAULTS.obsidian.replace(/\./g, "\\.")));
	assert.match(u, /"both"/);
});
