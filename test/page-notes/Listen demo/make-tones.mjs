/*
 * Makes the three tone files of the listen demo (media/steep-1.wav, steep-2.wav, steep-3.wav): mono, 8 kHz, 16-bit WAV, each under
 * 50 KB, with a short fade in and out so nothing clicks. The sound is made up (a plain sine tone); the files are committed, and this
 * script makes them again, byte for byte. Run it from anywhere: node "test/page-notes/Listen demo/make-tones.mjs"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 8000;
/** name, seconds and pitch (Hz) of each tone. steep-1 is 3 s so that `left:1` on its question makes a pause count as done from 2 s on, which is past half of its length. */
const TONES = [
	["steep-1.wav", 3.0, 440],
	["steep-2.wav", 2.5, 523.25],
	["steep-3.wav", 2.0, 392],
];

function wav(seconds, hz) {
	const n = Math.round(seconds * RATE);
	const buf = Buffer.alloc(44 + n * 2);
	buf.write("RIFF", 0);
	buf.writeUInt32LE(36 + n * 2, 4);
	buf.write("WAVEfmt ", 8);
	buf.writeUInt32LE(16, 16); // fmt chunk size
	buf.writeUInt16LE(1, 20); // PCM
	buf.writeUInt16LE(1, 22); // mono
	buf.writeUInt32LE(RATE, 24);
	buf.writeUInt32LE(RATE * 2, 28); // bytes a second
	buf.writeUInt16LE(2, 32); // bytes a frame
	buf.writeUInt16LE(16, 34);
	buf.write("data", 36);
	buf.writeUInt32LE(n * 2, 40);
	const fade = Math.round(0.05 * RATE);
	for (let i = 0; i < n; i++) {
		const edge = Math.min(1, i / fade, (n - 1 - i) / fade);
		buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / RATE) * 0.3 * 32767 * edge), 44 + i * 2);
	}
	return buf;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "media");
mkdirSync(dir, { recursive: true });
for (const [name, seconds, hz] of TONES) {
	const data = wav(seconds, hz);
	writeFileSync(join(dir, name), data);
	console.log(`${name}: ${seconds} s, ${hz} Hz, ${data.length} bytes`);
}
