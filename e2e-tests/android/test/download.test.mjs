import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expectedApkUrl, apkFor, versionsWithApk, fetchVersions, NoApkError, VERSIONS_URL, pluginAssetUrl, downloadTo, sha256File } from "../lib/download.mjs";

const REL = "https://github.com/obsidianmd/obsidian-releases/releases/download";
/** Shaped like the test tool's obsidian-versions.json (checked against the real file on 2026-11-04). */
const META = {
	versions: [
		{ version: "1.11.6", isBeta: false, downloads: { asar: `${REL}/v1.11.6/obsidian-1.11.6.asar.gz` } },
		{ version: "1.11.7", isBeta: false, downloads: { apk: `${REL}/v1.11.7/Obsidian-1.11.7.apk` } },
		{ version: "1.14.4", isBeta: false, downloads: { apk: `${REL}/v1.14.4/Obsidian-1.14.4.apk` } },
		{ version: "1.14.5", isBeta: false, downloads: { apk: `${REL}/v1.14.4/Obsidian-1.14.4.apk` } },
		{ version: "1.15.0", isBeta: false, downloads: { apk: `${REL}/v1.15.0/Obsidian-1.15.0.apk` } },
		{ version: "1.16.0", isBeta: true, downloads: { apk: `${REL}/v1.16.0/Obsidian-1.16.0.apk` } },
	],
};

test("expectedApkUrl: Obsidian's own releases page, tag v1.15.0, asset Obsidian-1.15.0.apk", () => {
	assert.equal(expectedApkUrl("1.15.0"), `${REL}/v1.15.0/Obsidian-1.15.0.apk`);
	assert.throws(() => expectedApkUrl("latest"));
	assert.throws(() => expectedApkUrl("1.15.0/../x"));
});

test("apkFor: 1.15.0 and the plugin's minimum 1.11.7 both have an APK", () => {
	assert.deepEqual(apkFor(META, "1.15.0"), { url: `${REL}/v1.15.0/Obsidian-1.15.0.apk`, apkVersion: "1.15.0", mapped: false });
	assert.deepEqual(apkFor(META, "1.11.7"), { url: `${REL}/v1.11.7/Obsidian-1.11.7.apk`, apkVersion: "1.11.7", mapped: false });
});

test("apkFor follows the list when a patch release has no APK of its own (1.14.5 -> the 1.14.4 APK)", () => {
	assert.deepEqual(apkFor(META, "1.14.5"), { url: `${REL}/v1.14.4/Obsidian-1.14.4.apk`, apkVersion: "1.14.4", mapped: true });
});

test("apkFor refuses a version with no APK and lists the ones that have one (not betas)", () => {
	assert.throws(() => apkFor(META, "1.11.6"), (e) => e instanceof NoApkError && /1\.11\.6 has no Android APK.*has no APK.*1\.11\.7, 1\.14\.4, 1\.14\.5, 1\.15\.0\./.test(e.message) && !/1\.16\.0/.test(e.message));
	assert.throws(() => apkFor(META, "1.99.0"), /not in the list/);
	assert.throws(() => apkFor(META, "latest"), NoApkError);
	assert.deepEqual(versionsWithApk(META), ["1.11.7", "1.14.4", "1.14.5", "1.15.0"]);
});

test("apkFor refuses an address that is not Obsidian's own releases page", () => {
	const evil = { versions: [{ version: "1.15.0", downloads: { apk: "https://example.invalid/Obsidian-1.15.0.apk" } }] };
	assert.throws(() => apkFor(evil, "1.15.0"), /unexpected APK address/);
});

test("fetchVersions reads the list and complains about anything else", async () => {
	const ok = async (url) => (assert.equal(url, VERSIONS_URL), new Response(JSON.stringify(META), { status: 200 }));
	assert.equal((await fetchVersions({ fetchImpl: ok })).versions.length, 6);
	await assert.rejects(fetchVersions({ fetchImpl: async () => new Response("no", { status: 404 }) }), /404/);
	await assert.rejects(fetchVersions({ fetchImpl: async () => new Response("{}", { status: 200 }) }), /not a version list/);
});

test("pluginAssetUrl: tags have no leading v; only the three release files", () => {
	assert.equal(pluginAssetUrl("1.0.1", "main.js"), "https://github.com/benthepsychologist/booklet-obsidian/releases/download/1.0.1/main.js");
	assert.equal(pluginAssetUrl("1.0.2-beta.1", "styles.css"), "https://github.com/benthepsychologist/booklet-obsidian/releases/download/1.0.2-beta.1/styles.css");
	assert.throws(() => pluginAssetUrl("v1.0.1", "main.js"));
	assert.throws(() => pluginAssetUrl("1.0.1", "../secret"));
});

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "android-pass-test-"));
const fakeFetch = (body, { status = 200, length = body.length } = {}) => async () => new Response(body, { status, headers: { "content-length": String(length) } });

test("downloadTo writes the file whole and leaves no .part file", async () => {
	const dir = tmp();
	const dest = path.join(dir, "sub", "a.bin");
	const body = Buffer.alloc(100000, 7);
	const r = await downloadTo("https://example.invalid/a", dest, { fetchImpl: fakeFetch(body) });
	assert.equal(r.bytes, body.length);
	assert.deepEqual(fs.readFileSync(dest), body);
	assert.deepEqual(fs.readdirSync(path.dirname(dest)), ["a.bin"]);
	assert.equal(await sha256File(dest), crypto.createHash("sha256").update(body).digest("hex"));
});

test("downloadTo: a bad status or a short body leaves nothing behind", async () => {
	const dir = tmp();
	const dest = path.join(dir, "b.bin");
	await assert.rejects(downloadTo("https://example.invalid/b", dest, { fetchImpl: fakeFetch("no", { status: 404 }) }), /404/);
	await assert.rejects(downloadTo("https://example.invalid/b", dest, { fetchImpl: fakeFetch(Buffer.alloc(10), { length: 99 }) }), /got 10 bytes of 99/);
	assert.deepEqual(fs.readdirSync(dir), []);
});
