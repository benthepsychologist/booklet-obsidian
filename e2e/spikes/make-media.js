// Records the short media files the other spikes need (clip.webm, clip.mp4, sound.m4a, sound.webm, sound.mp3) into --media <folder>.
// Uses the app's own MediaRecorder, so nothing is installed. Run once; the other spikes take --media <that folder>.
//   cd e2e/spikes && PLAYWRIGHT=<node_modules> node make-media.js --obsidian <binary> --out <dir> --media <folder>
const L = require("./lib");
(async () => {
	const o = L.args(); if (!o.media) { console.error("need --media <folder>"); process.exit(2); }
	L.fs.mkdirSync(o.media, { recursive: true });
	const vault = L.makeVault(o.out + "/v-make-media", { "x.md": "x" }, { helper: true });
	const r = await L.start(o, { vault, helper: true, name: "make-media", extra: ["--autoplay-policy=no-user-gesture-required"] });
	try { console.log("wrote " + (await L.generateMedia(r.page, L.path.resolve(o.media))).join(", ") + " to " + o.media); } finally { await r.stop(); }
})().catch(e => { console.error(e); process.exit(1); });
