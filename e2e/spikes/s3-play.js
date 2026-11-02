// S3 headless play: does play() advance currentTime and fire play/timeupdate/pause/ended for each format under Xvfb, is the autoplay flag needed,
// and does the same hold for the element Obsidian itself makes in Reading view?
//   PLAYWRIGHT=<node_modules> node s3-play.js --obsidian <binary> --out <dir> --media <folder from make-media.js> [--autoplay]
// Without --autoplay the app is started with no autoplay flag at all (the default is what the plugin gets); with it, --autoplay-policy=no-user-gesture-required.
const L = require("./lib");
(async () => {
	const o = L.args();
	const files = ["tone-2s.wav", "sound.mp3", "sound.m4a", "sound.webm", "clip.webm", "clip.mp4"];
	const vault = L.makeVault(o.out + "/v-s3", { "Native.md": "# Native\n\n![[tone-5s.wav]]\n\n![[clip.webm]]\n" }, { copyFrom: o.media });
	const r = await L.start(o, { vault, name: "s3", extra: o.autoplay ? ["--autoplay-policy=no-user-gesture-required"] : [] });
	const { page } = r;
	console.log(`launch flags: ${r.flags.join(" ")}  | autoplay flag: ${!!o.autoplay}`);
	try {
		const run = (src, tag, native) => page.evaluate(async ({ src, tag, native }) => {
			const ev = {}, log = []; const t0 = performance.now();
			let a = native || document.createElement(tag); if (!native) { a.src = src; document.body.appendChild(a); }
			for (const n of ["play", "playing", "timeupdate", "pause", "ended", "loadedmetadata", "canplay", "seeked", "error"]) a.addEventListener(n, () => { ev[n] = (ev[n] || 0) + 1; if (n !== "timeupdate" && log.length < 14) log.push(n + "@" + Math.round(performance.now() - t0)); });
			a.muted = false; a.volume = 0.01;
			await new Promise(res => { if (a.readyState >= 1) res(); else { a.addEventListener("loadedmetadata", res, { once: true }); a.addEventListener("error", res, { once: true }); setTimeout(res, 4000); } });
			const dur = a.duration; let playErr = null; const p0 = performance.now();
			try { await a.play(); } catch (e) { playErr = e.name + ": " + e.message; }
			await new Promise(r => setTimeout(r, 1500));
			const ct1 = a.currentTime, wall = (performance.now() - p0) / 1000;
			a.pause(); await new Promise(r => setTimeout(r, 200));
			// run it out when short
			let ended = false;
			if (dur <= 5) { a.currentTime = Math.max(0, dur - 0.6); try { await a.play(); } catch (e) { /* counted below */ } await new Promise(r => setTimeout(r, 1500)); ended = a.ended; }
			if (!native) a.remove(); else a.pause();
			return { dur: Math.round(dur * 100) / 100, playErr, ct_after_1500ms: Math.round(ct1 * 1000) / 1000, wall_s: Math.round(wall * 1000) / 1000, ratio: Math.round(ct1 / wall * 100) / 100, ended, ev, first: log.join(" ") };
		}, { src, tag, native });
		console.log("\n=== created elements (document.createElement, attached to body), play() called from a script with no user gesture");
		for (const f of files) {
			const src = await page.evaluate(f => app.vault.adapter.getResourcePath(f), f);
			console.log(f.padEnd(14), JSON.stringify(await run(src, /clip/.test(f) ? "video" : "audio")));
		}
		// Obsidian's own elements
		await L.openNote(page, "Native.md", { mode: "preview", wait: 1500 });
		console.log("\n=== Obsidian's own elements in Reading view");
		for (const sel of [".markdown-reading-view audio", ".markdown-reading-view video"]) {
			const h = await page.evaluateHandle(sel => document.querySelector(sel), sel);
			const out = await page.evaluate(async ([el, sel]) => {
				if (!el) return "none"; const ev = {}; for (const n of ["play", "timeupdate", "pause", "ended"]) el.addEventListener(n, () => ev[n] = (ev[n] || 0) + 1);
				await new Promise(r => el.readyState >= 1 ? r() : (el.addEventListener("loadedmetadata", r, { once: true }), setTimeout(r, 3000)));
				el.muted = true; let err = null; try { await el.play(); } catch (e) { err = e.name; } await new Promise(r => setTimeout(r, 1500)); const ct = el.currentTime; el.pause();
				return { err, ct, ev, dur: el.duration };
			}, [h, sel]);
			console.log(sel.padEnd(34), JSON.stringify(out));
		}
		// a click on Obsidian's own play button (a real gesture), for the reference
		const box = await page.evaluate(() => { const a = document.querySelector(".markdown-reading-view audio"); a.scrollIntoView(); a.currentTime = 0; const b = a.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, paused: a.paused }; });
		await page.mouse.click(box.x + 20, box.y + box.h / 2); await L.sleep(1200);
		console.log("\nreal click on the native control's play button:", JSON.stringify(await page.evaluate(() => { const a = document.querySelector(".markdown-reading-view audio"); const r = { paused: a.paused, currentTime: Math.round(a.currentTime * 100) / 100 }; a.pause(); return r; })));
	} finally { await r.stop(); }
})().catch(e => { console.error(e); process.exit(1); });
