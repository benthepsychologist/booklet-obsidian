// The vault the emulated phone opens: the repository's test-vault (made-up notes) plus three made-up notes and a tone written here.
// Nothing in it is about a real person. The plugin is NOT taken from test-vault/.obsidian: it comes from the build under test.
import fs from "node:fs";
import path from "node:path";

export const NOTES = Object.freeze({
	view: "Check-in.booklet.md", // from test-vault: the note the Booklet view check opens
	listen: "Android listen.booklet.md",
	pages: "Android pages.booklet.md",
});
export const TONE = "android-tone.wav";
/** The screens of the listen note (the activity key is "activity:" + module + "/" + id; this note has no module). */
export const LISTEN_A1 = "activity:/a1";
export const LISTEN_A2 = "activity:/a2";

/** A WAV file (Buffer): `seconds` of a sine tone, 16-bit mono PCM. Quiet (amplitude 3000 of 32767) because it plays aloud on the Mac. */
export function makeWav(seconds, freq = 440, rate = 8000, amp = 3000) {
	if (!(seconds > 0)) throw new RangeError("seconds must be positive");
	const n = Math.round(seconds * rate);
	const data = Buffer.alloc(n * 2);
	for (let i = 0; i < n; i++) {
		const fade = Math.min(1, i / 200, (n - i) / 200); // no click at either end
		data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * amp * fade), i * 2);
	}
	const h = Buffer.alloc(44);
	h.write("RIFF", 0);
	h.writeUInt32LE(36 + data.length, 4);
	h.write("WAVE", 8);
	h.write("fmt ", 12);
	h.writeUInt32LE(16, 16);
	h.writeUInt16LE(1, 20);
	h.writeUInt16LE(1, 22);
	h.writeUInt32LE(rate, 24);
	h.writeUInt32LE(rate * 2, 28);
	h.writeUInt16LE(2, 32);
	h.writeUInt16LE(16, 34);
	h.write("data", 36);
	h.writeUInt32LE(data.length, 40);
	return Buffer.concat([h, data]);
}

const front = (id, title, extra = "") => `---\nbooklet: "0.19"\nid: booklet-test/${id}\ntitle: ${title}\nlang: en\n${extra}---\n\n`;

/** Two activities. The first has a two-minute tone, a write-in and a choice; "Next" is a page move to the second. */
export const listenNote = () =>
	front("android-listen", "Android listen", "media-from:\n  - https://media.android-pass.invalid\n") +
	`> [!activity|a1] Listening

> [!listen|l1] A long tone
> ![[${TONE}]]

> [!text|t1] What did you hear?

> [!choice|q1] A question?
- [ ] Yes
- [ ] No

> [!activity|a2] Second activity

> [!choice|q2] Another question?
- [ ] Yes
- [ ] No
`;

/** A made-up garden wiki: one activity, a tree of pages three levels deep, so the Pages button and its menu are drawn. */
export const pagesNote = () =>
	`---
booklet: "0.19"
title: A small garden
---

> [!module|garden] A small garden

> [!activity|garden icon:sprout] Garden notes

Start with [[#Soil]], then [[#Water]] and [[#Sun]]. The compost heap is on [[#Compost]].

> [!page|soil icon:shovel] Soil

What the plants stand in. It changes from one corner to the next.

> [!page|clay parent:soil] Clay

Heavy and slow to dry.

> [!page|sand parent:soil] Sand

Light and quick to dry.

> [!page|loam parent:soil] Loam

A mix of both, the easiest to grow in.

> [!page|drainage parent:loam] Drainage

How fast the water leaves. Dig a hole, fill it, and time it.

> [!page|compost parent:loam] Compost

Kitchen scraps and dry leaves, turned now and then.

> [!page|water] Water

Water early in the day, at the roots.

> [!page|sun] Sun

Most vegetables want six hours of direct sun.
`;

/**
 * Builds the vault in `dest` (made fresh). `testVault` is the repository's test-vault folder.
 * Returns the notes written, relative to the vault.
 */
export function buildVault({ testVault, dest }) {
	if (!fs.existsSync(path.join(testVault, NOTES.view))) throw new Error(`${path.join(testVault, NOTES.view)} is missing: is --plugin-dir / the repository the Booklet plugin repository?`);
	fs.rmSync(dest, { recursive: true, force: true });
	fs.cpSync(testVault, dest, { recursive: true, filter: (src) => path.relative(testVault, src).split(path.sep)[0] !== ".obsidian" });
	const written = [];
	const put = (rel, body) => {
		fs.writeFileSync(path.join(dest, rel), body);
		written.push(rel);
	};
	put(NOTES.listen, listenNote());
	put(NOTES.pages, pagesNote());
	put(TONE, makeWav(120, 440));
	return written;
}
