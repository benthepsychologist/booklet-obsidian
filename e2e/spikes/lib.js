// Shared helpers for the 0.12.0 measuring spikes: argument parsing, a scratch vault, the https media server, and Obsidian
// launched through ../drive.js with the flags the spikes need. Nothing here touches the repository's test-vault.
const fs = require("fs"), path = require("path");
const { launch } = require("../drive");
const { startServer } = require("../media-server");
const { wav, writeTones } = require("../tones");

const sleep = ms => new Promise(r => setTimeout(r, ms));

function args() {
	const a = process.argv.slice(2), o = {};
	for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : "1"; }
	o.obsidian = o.obsidian || process.env.OBSIDIAN;
	if (!o.obsidian || !o.vault && !o.out) { console.error("need --obsidian <binary>, --out <dir> (and optionally --vault <scratch vault folder>, made if absent)"); process.exit(2); }
	o.out = path.resolve(o.out || path.dirname(o.vault)); fs.mkdirSync(o.out, { recursive: true });
	return o;
}

/** Makes (or refills) a scratch vault of `files` ({ "path": string | Buffer }); `plugin` is a folder with main.js, manifest.json, styles.css. */
function makeVault(dir, files, { plugin, helper = false, tones = true, copyFrom } = {}) {
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(path.join(dir, ".obsidian"), { recursive: true });
	fs.writeFileSync(path.join(dir, ".obsidian", "app.json"), JSON.stringify({ promptDelete: false }));
	if (tones) { writeTones(dir); writeTones(path.join(dir, "media")); }
	// recorded media (see make-media.js): every file in `copyFrom` goes to the vault root and to media/
	if (copyFrom && fs.existsSync(copyFrom)) for (const f of fs.readdirSync(copyFrom)) for (const sub of ["", "media"]) { fs.mkdirSync(path.join(dir, sub), { recursive: true }); fs.copyFileSync(path.join(copyFrom, f), path.join(dir, sub, f)); }
	for (const [p, c] of Object.entries(files || {})) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), c); }
	const ids = [];
	if (plugin) {
		const d = path.join(dir, ".obsidian", "plugins", "booklet"); fs.mkdirSync(d, { recursive: true });
		for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(plugin, f), path.join(d, f));
		ids.push("booklet");
	}
	if (helper) {
		// a do-nothing plugin that only hands the spike scripts the obsidian module (window.__obs), so they can call MarkdownRenderer themselves
		const d = path.join(dir, ".obsidian", "plugins", "spike-helper"); fs.mkdirSync(d, { recursive: true });
		fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ id: "spike-helper", name: "Spike helper", version: "0.0.1", minAppVersion: "1.8.10", description: "x", author: "x", isDesktopOnly: true }));
		fs.writeFileSync(path.join(d, "main.js"), 'const o = require("obsidian"); module.exports = class extends o.Plugin { onload() { window.__obs = o; } };\n');
		ids.push("spike-helper");
	}
	if (ids.length) fs.writeFileSync(path.join(dir, ".obsidian", "community-plugins.json"), JSON.stringify(ids));
	return dir;
}

/**
 * Starts the media server (serving `mediaDir`) and Obsidian on `vault`.
 * extra: more Chromium flags (e.g. "--autoplay-policy=no-user-gesture-required"); hosts: map of host -> "127.0.0.1" (host-resolver-rules).
 * Returns { ob, page, server, vault, out, stop() }.
 */
async function start(o, { vault, mediaDir, plugin = false, helper = false, extra = [], hosts = {}, name = "run" } = {}) {
	const logFile = path.join(o.out, name + "-requests.jsonl"); fs.rmSync(logFile, { force: true });
	// `vault` may be a function of the server's port, for notes that name https://127.0.0.1:<port>/...; the server then serves mediaDir (else the vault)
	const server = await startServer({ dir: mediaDir || (typeof vault === "string" ? vault : undefined), logFile });
	if (typeof vault === "function") { vault = vault(server.port); if (!mediaDir) server.setDir(vault); }
	const rules = Object.keys(hosts).map(h => `MAP ${h} 127.0.0.1:${server.port}`).join(", ");
	const flags = ["--ignore-certificate-errors", ...(rules ? ["--host-resolver-rules=" + rules] : []), ...extra];
	const ob = await launch({ obsidian: o.obsidian, vault, configDir: path.join(o.out, "cfg-" + name), args: flags, enablePlugins: plugin || helper, timeout: 90000 });
	const page = ob.page;
	// the harness can see a plugin as enabled while Obsidian is still loading it: wait for each, and load by call if it never appears
	if (plugin || helper) await page.evaluate(async ids => {
		for (const id of ids) { for (let i = 0; i < 30 && !app.plugins.plugins[id]; i++) await new Promise(r => setTimeout(r, 100)); if (!app.plugins.plugins[id]) await app.plugins.loadPlugin(id); }
	}, [plugin && "booklet", helper && "spike-helper"].filter(Boolean));
	const consoleLines = []; page.on("console", m => consoleLines.push(m.type() + ": " + m.text()));
	return { ob, page, server, vault, out: o.out, flags, consoleLines, stop: async () => { await ob.close().catch(() => {}); await server.close().catch(() => {}); } };
}

/** Opens `file` in a fresh leaf in the given mode ("preview" = Reading view, "source", or the plugin's view type), waits a little. */
async function openNote(page, file, { type = "markdown", mode = "preview", newLeaf = false, wait = 800 } = {}) {
	await page.evaluate(async ({ file, type, mode, newLeaf }) => {
		const f = app.vault.getAbstractFileByPath(file);
		if (!f) throw new Error("no note " + file);
		const leaf = newLeaf ? app.workspace.getLeaf("tab") : app.workspace.getMostRecentLeaf() || app.workspace.getLeaf(false);
		await leaf.setViewState({ type, state: { file, mode } }, { focus: true });
		app.workspace.setActiveLeaf(leaf, { focus: true });
	}, { file, type, mode, newLeaf });
	await sleep(wait);
}

/** Records every audio/video/iframe/img/source element added to the document (with the time, in epoch ms) into window.__added. */
async function watchAdded(page) {
	await page.evaluate(() => {
		if (window.__mo) window.__mo.disconnect();
		window.__added = [];
		const desc = el => ({ t: Date.now(), tag: el.tagName.toLowerCase(), src: el.getAttribute("src"), currentSrc: el.currentSrc || null, preload: el.getAttribute("preload"), controls: el.hasAttribute("controls"),
			cls: el.className && el.className.baseVal === undefined ? el.className : null, attached: el.isConnected, inReading: !!el.closest(".markdown-reading-view,.markdown-preview-view"), inBooklet: !!el.closest(".booklet-view,[data-type='booklet']") });
		window.__mo = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) {
			for (const el of [n, ...n.querySelectorAll("audio,video,iframe,img,source,embed,object")]) if (/^(audio|video|iframe|img|source|embed|object)$/i.test(el.tagName)) window.__added.push(desc(el));
		} });
		window.__mo.observe(document.body, { childList: true, subtree: true });
	});
}

/** An MP3 of silence (valid MPEG-1 layer III frames, 128 kbit/s, 44.1 kHz; 26.12 ms a frame): plays and has a clock, with no encoder. */
function silentMp3(seconds) {
	const frame = Buffer.alloc(417); frame.set([0xff, 0xfb, 0x90, 0x00]);
	return Buffer.concat(Array.from({ length: Math.ceil(seconds / 0.026122) }, () => frame));
}

/**
 * Records short media files with the app's own MediaRecorder (no encoder is installed on the machine) and writes them into `dir`:
 * clip.webm, clip.mp4 (video with a tone), sound.m4a (audio/mp4), sound.webm (audio); and sound.mp3 (silence, written here). Returns the names written.
 */
async function generateMedia(page, dir, seconds = 4) {
	const made = [];
	for (const [name, mime, video] of [["clip.webm", "video/webm;codecs=vp8,opus", true], ["clip.mp4", "video/mp4", true], ["sound.m4a", "audio/mp4", false], ["sound.webm", "audio/webm;codecs=opus", false]]) {
		const b64 = await page.evaluate(async ({ mime, video, seconds }) => {
			const ac = new AudioContext(), osc = ac.createOscillator(), dest = ac.createMediaStreamDestination();
			osc.frequency.value = 440; osc.connect(dest); osc.start();
			const tracks = [...dest.stream.getAudioTracks()];
			let timer;
			if (video) {
				const c = document.createElement("canvas"); c.width = 160; c.height = 90; const g = c.getContext("2d"); let n = 0;
				timer = setInterval(() => { g.fillStyle = `hsl(${(n++ * 9) % 360},60%,50%)`; g.fillRect(0, 0, 160, 90); }, 40);
				tracks.push(...c.captureStream(25).getVideoTracks());
			}
			const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime }), chunks = [];
			rec.ondataavailable = e => chunks.push(e.data);
			const stopped = new Promise(r => (rec.onstop = r));
			rec.start(); await new Promise(r => setTimeout(r, seconds * 1000)); rec.stop(); await stopped;
			clearInterval(timer); osc.stop(); await ac.close();
			const buf = new Uint8Array(await new Blob(chunks).arrayBuffer()); let s = "";
			for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
			return btoa(s);
		}, { mime, video, seconds }).catch(e => { console.error("could not record " + name + ": " + e.message); return null; });
		if (b64) { fs.writeFileSync(path.join(dir, name), Buffer.from(b64, "base64")); made.push(name); }
	}
	fs.writeFileSync(path.join(dir, "sound.mp3"), silentMp3(seconds)); made.push("sound.mp3");
	return made;
}

module.exports = { generateMedia, silentMp3, args, makeVault, start, openNote, watchAdded, sleep, wav, writeTones, fs, path };
