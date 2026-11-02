// Short WAV tones for the real-Obsidian checks. Pure Node: 16-bit mono PCM, 8 kHz (small and plays everywhere).
//   const { wav, writeTones } = require("./tones");
//   node tones.js <folder>      -> writes tone-2s.wav, tone-5s.wav, tone-10s.wav, tone-60s.wav and tone-180s.wav
const fs = require("fs"), path = require("path");

/** A WAV file (Buffer) of `seconds` seconds of a sine at `freq` Hz. */
function wav(seconds, freq = 440, rate = 8000) {
	const n = Math.round(seconds * rate), data = Buffer.alloc(n * 2);
	for (let i = 0; i < n; i++) {
		const fade = Math.min(1, i / 200, (n - i) / 200); // no click at either end
		data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 9000 * fade), i * 2);
	}
	const h = Buffer.alloc(44);
	h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
	h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
	h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
	return Buffer.concat([h, data]);
}

/** Writes the standard set into `dir`; returns the file names. */
function writeTones(dir) {
	fs.mkdirSync(dir, { recursive: true });
	const set = { "tone-2s.wav": [2, 330], "tone-5s.wav": [5, 440], "tone-10s.wav": [10, 550], "tone-60s.wav": [60, 660], "tone-180s.wav": [180, 770] };
	for (const [name, [s, f]] of Object.entries(set)) fs.writeFileSync(path.join(dir, name), wav(s, f));
	return Object.keys(set);
}

module.exports = { wav, writeTones };
if (require.main === module) {
	const dir = process.argv[2];
	if (!dir) { console.error("usage: node tones.js <folder>"); process.exit(2); }
	console.log(writeTones(dir).join("\n"));
}
