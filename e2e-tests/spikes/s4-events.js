// S4 event reach: media events do not bubble, but a capture-phase listener on an ancestor sees them. Does a capture listener on a Booklet view's contentEl see
// loadedmetadata/play/pause/timeupdate/ended from the element Obsidian made? Does currentTime set on loadedmetadata stick? Does removing a playing element
// from the DOM fire pause? Does a plain (bubbling) listener see anything?
//   PLAYWRIGHT=<node_modules> node s4-events.js --obsidian <binary> --out <dir> --media <folder from make-media.js> --plugin <built plugin folder>
const L = require("./lib");
(async () => {
	const o = L.args();
	const vault = L.makeVault(o.out + "/v-s4", { "A.booklet.md": L.bookletNote("a", "No media on this one."), "B.booklet.md": L.bookletNote("b", "![[tone-2s.wav]]\n\nAfter the player.") }, { plugin: o.plugin, copyFrom: o.media });
	const r = await L.start(o, { vault, plugin: true, name: "s4" });
	const { page } = r;
	try {
		await L.openNote(page, "A.booklet.md", { type: "booklet", mode: "", wait: 1500 });
		const setup = await page.evaluate(() => {
			const leaf = app.workspace.getLeavesOfType("booklet")[0], v = leaf.view; window.__v = v; window.__cap = []; window.__bub = [];
			const names = ["loadedmetadata", "play", "playing", "pause", "timeupdate", "ended", "seeked"];
			for (const n of names) {
				v.contentEl.addEventListener(n, e => { window.__cap.push({ n, t: Math.round(performance.now()), ct: Math.round(e.target.currentTime * 100) / 100, tag: e.target.tagName, inContentEl: v.contentEl.contains(e.target) }); if (n === "loadedmetadata") e.target.currentTime = 1.0; }, true);
				v.contentEl.addEventListener(n, e => window.__bub.push(n), false);
			}
			return { type: leaf.view.getViewType(), contentElClass: v.contentEl.className };
		});
		console.log("view:", JSON.stringify(setup));
		// move the same leaf to note B (a new element appears inside the same contentEl)
		await page.evaluate(async () => { const leaf = app.workspace.getLeavesOfType("booklet")[0]; await leaf.openFile(app.vault.getAbstractFileByPath("B.booklet.md")); });
		await L.sleep(1500);
		const same = await page.evaluate(() => { const v = app.workspace.getLeavesOfType("booklet")[0].view; return { sameViewObject: v === window.__v, sameContentEl: v.contentEl === window.__v.contentEl, audio: !!v.contentEl.querySelector("audio"), cap: window.__cap.slice() }; });
		console.log("after opening B in the same leaf:", JSON.stringify(same));
		const played = await page.evaluate(async () => {
			const v = window.__v, a = v.contentEl.querySelector("audio"); window.__cap.length = 0; window.__bub.length = 0;
			const ct0 = a.currentTime; /* 2 s tone: the first 1200 ms of play from 1.0 s runs into the end, so "ended" counts twice below */ a.muted = true; await a.play(); await new Promise(r => setTimeout(r, 1200));
			const ct1 = a.currentTime; a.pause(); await new Promise(r => setTimeout(r, 100));
			a.currentTime = a.duration - 0.5; await a.play(); await new Promise(r => setTimeout(r, 900));
			const counts = {}; for (const e of window.__cap) counts[e.n] = (counts[e.n] || 0) + 1;
			return { currentTimeSetOnLoadedmetadata_thenReadBeforePlay: ct0, currentTimeAfter1200msPlay: ct1, captureCounts: counts, bubbleListenerSaw: window.__bub.length, targetsAllInContentEl: window.__cap.every(e => e.inContentEl) };
		});
		console.log("play / pause / end:", JSON.stringify(played));
		// removal of a playing element
		const removed = await page.evaluate(async () => {
			const v = window.__v, a = v.contentEl.querySelector("audio"); window.__cap.length = 0; const own = []; for (const n of ["pause", "emptied", "abort", "suspend"]) a.addEventListener(n, () => own.push(n)); a.currentTime = 0.2; a.muted = true; await a.play(); await new Promise(r => setTimeout(r, 400));
			const before = { paused: a.paused, ct: a.currentTime }; a.remove(); await new Promise(r => setTimeout(r, 400));
			return { before, afterRemove: { paused: a.paused, ct: a.currentTime, connected: a.isConnected }, events: window.__cap.map(e => e.n), sawByContentElCapture: window.__cap.length, eventsOnTheElementItself: own };
		});
		console.log("removing a playing element from the DOM:", JSON.stringify(removed));
	} finally { await r.stop(); }
})().catch(e => { console.error(e); process.exit(1); });
