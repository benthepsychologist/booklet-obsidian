import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeWav, buildVault, listenNote, pagesNote, NOTES, TONE, LISTEN_A1, LISTEN_A2 } from "../lib/vault.mjs";

const testVault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "test-vault");

test("makeWav: a valid 16-bit mono PCM header, the right length, quiet", () => {
	const w = makeWav(2, 440, 8000, 3000);
	assert.equal(w.toString("ascii", 0, 4), "RIFF");
	assert.equal(w.toString("ascii", 8, 12), "WAVE");
	assert.equal(w.readUInt16LE(20), 1); // PCM
	assert.equal(w.readUInt16LE(22), 1); // mono
	assert.equal(w.readUInt32LE(24), 8000);
	assert.equal(w.readUInt16LE(34), 16);
	assert.equal(w.readUInt32LE(40), 2 * 8000 * 2);
	assert.equal(w.length, 44 + 2 * 8000 * 2);
	assert.equal(w.readUInt32LE(4), w.length - 8);
	let peak = 0;
	for (let i = 44; i < w.length; i += 2) peak = Math.max(peak, Math.abs(w.readInt16LE(i)));
	assert.ok(peak > 2900 && peak <= 3000, `peak ${peak}`);
	assert.throws(() => makeWav(0), RangeError);
});

test("the notes: the screens the checks go to are in the notes", () => {
	const l = listenNote();
	assert.match(l, /\[!activity\|a1\]/);
	assert.match(l, /\[!activity\|a2\]/);
	assert.match(l, /\[!listen\|l1\]/);
	assert.match(l, /\[!text\|t1\]/);
	assert.ok(l.includes(`![[${TONE}]]`));
	assert.equal(LISTEN_A1, "activity:/a1");
	assert.equal(LISTEN_A2, "activity:/a2");
	const p = pagesNote();
	assert.equal((p.match(/\[!page\|/g) || []).length, 8);
	assert.ok(p.startsWith('---\nbooklet: "0.18"'));
	for (const n of [l, p]) assert.ok(!/@|https?:\/\/(?!media\.android-pass\.invalid)/.test(n), "made-up content only");
});

test("buildVault: test-vault copied without its .obsidian, the made-up notes and the tone added", () => {
	const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "android-pass-vault-")), "vault");
	const written = buildVault({ testVault, dest });
	assert.deepEqual(written.sort(), [NOTES.listen, NOTES.pages, TONE].sort());
	assert.ok(fs.existsSync(path.join(dest, NOTES.view)), "Check-in note from test-vault");
	assert.ok(fs.existsSync(path.join(dest, "Every kind.booklet.md")));
	assert.ok(!fs.existsSync(path.join(dest, ".obsidian")), "the plugin must come from the build under test, not from test-vault/.obsidian");
	assert.equal(fs.readFileSync(path.join(dest, TONE)).readUInt32LE(40), 120 * 8000 * 2);
	// building again replaces the folder
	fs.writeFileSync(path.join(dest, "stray.md"), "x");
	buildVault({ testVault, dest });
	assert.ok(!fs.existsSync(path.join(dest, "stray.md")));
});

test("buildVault: a wrong test-vault says so", () => {
	assert.throws(() => buildVault({ testVault: os.tmpdir(), dest: path.join(os.tmpdir(), "x-vault") }), /is missing/);
});
