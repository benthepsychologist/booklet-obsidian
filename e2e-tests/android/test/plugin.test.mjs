import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stagePlugin, readManifest, problemsWith } from "../lib/plugin.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "android-pass-plugin-"));
const build = (dir, manifest = { id: "booklet", name: "Booklet", version: "1.0.1", minAppVersion: "1.11.7" }) => {
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "main.js"), "console.log(1)");
	fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
	fs.writeFileSync(path.join(dir, "styles.css"), "a{}");
	return dir;
};

test("stagePlugin copies a folder build and reports hashes", async () => {
	const src = build(path.join(tmp(), "src"));
	const r = await stagePlugin({ pluginDir: src, stageDir: path.join(tmp(), "stage") });
	assert.equal(r.manifest.version, "1.0.1");
	assert.deepEqual(r.files.map((f) => f.name), ["main.js", "manifest.json", "styles.css"]);
	assert.ok(r.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && f.bytes > 0));
	assert.ok(fs.existsSync(path.join(r.dir, "main.js")));
});

test("stagePlugin: a folder without main.js says to run npm run build", async () => {
	const src = build(path.join(tmp(), "src"));
	fs.rmSync(path.join(src, "main.js"));
	await assert.rejects(stagePlugin({ pluginDir: src, stageDir: path.join(tmp(), "stage") }), /main\.js is missing.*npm run build/);
});

test("stagePlugin with a release downloads the three files from the tag's URLs", async () => {
	const urls = [];
	const download = async (url, dest) => {
		urls.push(url);
		fs.writeFileSync(dest, url.endsWith("manifest.json") ? JSON.stringify({ id: "booklet", version: "1.0.2-beta.1", minAppVersion: "1.11.7" }) : "x");
	};
	const r = await stagePlugin({ release: "1.0.2-beta.1", stageDir: path.join(tmp(), "stage"), download });
	assert.deepEqual(urls, ["main.js", "manifest.json", "styles.css"].map((f) => `https://github.com/benthepsychologist/booklet-obsidian/releases/download/1.0.2-beta.1/${f}`));
	assert.equal(r.source, "GitHub release 1.0.2-beta.1");
});

test("readManifest and problemsWith", () => {
	const d = build(path.join(tmp(), "m"), { id: "booklet", version: "1.0.1" });
	assert.throws(() => readManifest(d), /no "minAppVersion"/);
	assert.throws(() => readManifest(path.join(tmp(), "nothing")), /cannot read/);
	fs.writeFileSync(path.join(d, "styles.css"), "");
	assert.match(problemsWith(d).join(), /styles\.css.*empty/);
});
