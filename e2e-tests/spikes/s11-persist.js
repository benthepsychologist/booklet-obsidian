// S11 persistent playback. Does a playing native <audio> keep playing when the reader turns to another note, closes the note, or changes pane; in stock Obsidian
// (Reading view), in the 0.11.0 Booklet view (a page move), and after "lifting" the same element into another parent? Where does the pause happen, and what survives what?
//   PLAYWRIGHT=<node_modules> node s11-persist.js --obsidian <binary> --out <dir> --media <folder> --plugin <built 0.11.0 plugin folder>
// Two launches, one after the other: stock Obsidian (no plugin), then the Booklet plugin. A trial = play a 60 s tone, do something, look at the element 100 ms and 1.1 s later.
const L = require("./lib");

const HELPERS = () => {
	const S = window.S = {};
	S.sleep = ms => new Promise(r => setTimeout(r, ms));
	S.reset = async () => {
		for (const e of document.querySelectorAll("audio")) { try { e.pause(); } catch (x) { /* gone */ } }
		if (window.__held) { window.__held.pause(); window.__held = null; }
		document.querySelectorAll(".s11-bar").forEach(b => b.remove());
		app.workspace.iterateAllLeaves(l => { if (l.getRoot() === app.workspace.rootSplit) l.detach(); });
		await S.sleep(200);
		const l = app.workspace.getLeaf(true); S.leaf = l; return l;
	};
	S.open = async (leaf, file, type = "markdown") => { await leaf.setViewState({ type, state: { file, mode: type === "markdown" ? "preview" : undefined } }, { focus: true }); await S.sleep(type === "booklet" ? 1200 : 700); if (type === "booklet") { const card = leaf.view.contentEl.querySelector(".booklet-cardrow"); if (card) card.click(); await S.sleep(900); } };
	S.audioOf = leaf => leaf.view.containerEl.querySelector("audio");
	S.watch = a => { a.__ev = { play: 0, pause: 0, ended: 0, emptied: 0 }; for (const n of Object.keys(a.__ev)) a.addEventListener(n, () => a.__ev[n]++); return a; };
	S.state = a => ({ paused: a.paused, ct: Math.round(a.currentTime * 100) / 100, connected: a.isConnected, pauseEvents: a.__ev.pause, emptied: a.__ev.emptied, srcAttr: a.hasAttribute("src"), readyState: a.readyState, ended: a.ended });
	S.start = async leaf => { const a = S.watch(S.audioOf(leaf)); a.muted = false; await a.play(); await S.sleep(800); a.__ev.pause = 0; return a; };
	// look 100 ms and 1.1 s after `act`
	S.after = async (a, act) => { const before = S.state(a); await act(); await S.sleep(100); const s1 = S.state(a); await S.sleep(1000); const s2 = S.state(a); return { before: before.ct, at100ms: { paused: s1.paused, connected: s1.connected, pauseEvents: s1.pauseEvents, emptied: s1.emptied, srcAttr: s1.srcAttr, readyState: s1.readyState }, at1100ms: { paused: s2.paused, connected: s2.connected, ctAdvance: Math.round((s2.ct - s1.ct) * 100) / 100, pauseEvents: s2.pauseEvents }, playing: !s2.paused && s2.ct - s1.ct > 0.7 }; };
	S.bar = parent => { const b = document.createElement("div"); b.className = "s11-bar"; b.style.cssText = "padding:4px;border:1px solid gray"; parent.appendChild(b); return b; };
};

async function trials(page, label, kind) {
	const run = async (name, f) => { try { const v = await f(); console.log(`  ${name.padEnd(52)} ${JSON.stringify(v)}`); return v; } catch (e) { console.log(`  ${name.padEnd(52)} ERROR ${e.message.split("\n")[0]}`); } };
	const note = kind === "booklet" ? "A.booklet.md" : "A.md", type = kind === "booklet" ? "booklet" : "markdown";
	const other = kind === "booklet" ? "B.booklet.md" : "B.md";
	const ev = (fn, arg) => page.evaluate(fn, arg);
	const fresh = () => ev(async ([n, t]) => { const l = await S.reset(); await S.open(l, n, t); window.__a = await S.start(l); return true; }, [note, type]);
	console.log(`\n=== ${label}`);
	if (kind === "stock") {
		await run("a. switch to another note in the same pane", async () => { await fresh(); return ev(() => S.after(window.__a, () => S.leaf.openFile(app.vault.getAbstractFileByPath("B.md")))); });
		await run("a2. toggle Reading view -> source mode -> back", async () => { await fresh(); return ev(() => S.after(window.__a, async () => { await S.leaf.setViewState({ type: "markdown", state: { file: "A.md", mode: "source" } }); })); });
		await run("b. close the note (leaf.detach), another pane stays", async () => { await ev(async () => { const l = await S.reset(); await S.open(l, "A.md"); const l2 = app.workspace.getLeaf("split", "vertical"); await S.open(l2, "B.md"); S.l2 = l2; window.__a = await S.start(l); return true; }); return ev(() => S.after(window.__a, () => S.leaf.detach())); });
		await run("c. switch to another pane (other pane active)", async () => { await ev(async () => { const l = await S.reset(); await S.open(l, "A.md"); const l2 = app.workspace.getLeaf("split", "vertical"); await S.open(l2, "B.md"); S.l2 = l2; window.__a = await S.start(l); return true; }); return ev(() => S.after(window.__a, async () => { app.workspace.setActiveLeaf(S.l2, { focus: true }); })); });
		await run("d. switch to another tab in the same tab group", async () => { await ev(async () => { const l = await S.reset(); await S.open(l, "A.md"); const l2 = app.workspace.getLeaf("tab"); await S.open(l2, "B.md"); S.l2 = l2; app.workspace.setActiveLeaf(S.leaf, { focus: true }); await S.sleep(300); window.__a = await S.start(S.leaf); return true; }); return ev(() => S.after(window.__a, async () => { app.workspace.setActiveLeaf(S.l2, { focus: true }); })); });
		await run("e. close the OTHER tab (control: A stays open)", async () => ev(() => S.after(window.__a, () => S.l2.detach())));
		await run("f. open A again after closing it: a new element, from 0", async () => ev(async () => { const l = await S.reset(); await S.open(l, "A.md"); const a = S.audioOf(l); return { fresh: a.currentTime === 0, paused: a.paused }; }));
		// lifting
		console.log("  -- lift: move the playing element in ONE synchronous task (appendChild moves it), then do the second step");
		const targets = { "document.body": () => document.body, "bar in the view's container (leaf-owned)": () => S.bar(S.leaf.view.containerEl), "bar in the status bar (app-owned)": () => S.bar(document.querySelector(".status-bar") || document.body), "bar in .app-container (app-owned)": () => S.bar(document.querySelector(".app-container")) };
		for (const [tn, tfn] of Object.entries(targets)) {
			for (const [an, act] of [["then switch note in the pane", () => S.leaf.openFile(app.vault.getAbstractFileByPath("B.md"))], ["then close the leaf", () => S.leaf.detach()]]) {
				await run(`lift to ${tn}; ${an}`, async () => {
					await fresh();
					return ev(([t, an]) => { const parent = ({ "document.body": () => document.body, "bar in the view's container (leaf-owned)": () => S.bar(S.leaf.view.containerEl), "bar in the status bar (app-owned)": () => S.bar(document.querySelector(".status-bar") || document.body), "bar in .app-container (app-owned)": () => S.bar(document.querySelector(".app-container")) })[t](); const a = window.__a; parent.appendChild(a);
						const act = an.includes("close") ? () => S.leaf.detach() : () => S.leaf.openFile(app.vault.getAbstractFileByPath("B.md"));
						return S.after(a, act); }, [tn, an]);
				});
			}
		}
		console.log("  -- lift with a gap: remove from the DOM, wait, put in document.body");
		for (const gap of ["sync (no gap)", "microtask (await Promise.resolve())", "setTimeout(0)", "requestAnimationFrame", "50 ms", "300 ms"]) {
			await run(`gap: ${gap}`, async () => {
				await fresh();
				return ev(async gap => { const a = window.__a; a.remove(); if (gap.startsWith("microtask")) await Promise.resolve(); else if (gap.startsWith("setTimeout")) await new Promise(r => setTimeout(r, 0)); else if (gap.startsWith("request")) await new Promise(r => requestAnimationFrame(() => r())); else if (gap === "50 ms") await new Promise(r => setTimeout(r, 50)); else if (gap === "300 ms") await new Promise(r => setTimeout(r, 300)); document.body.appendChild(a); const s0 = S.state(a); await S.sleep(1000); const s1 = S.state(a); return { pausedRightAfterReattach: s0.paused, pauseEvents: s1.pauseEvents, pausedAfter1s: s1.paused, ctAdvance: Math.round((s1.ct - s0.ct) * 100) / 100 }; }, gap);
			});
		}
		await run("remove from the document and keep the object", async () => { await fresh(); return ev(async () => { const a = window.__a; a.remove(); await S.sleep(300); const s0 = S.state(a); await S.sleep(1000); const s1 = S.state(a); const ct = a.currentTime; await a.play(); await S.sleep(500); return { pausedAfterRemove: s0.paused, pauseEvents: s1.pauseEvents, ctFrozen: s1.ct === s0.ct, ctKept: ct, resumedByPlay: !a.paused && a.currentTime > ct + 0.3, ctNow: Math.round(a.currentTime * 100) / 100, keptPlayingWhileDetached: !a.paused }; }); });
		await run("detached new Audio(url) held by a variable, leaf closed", async () => { await ev(async () => { const l = await S.reset(); await S.open(l, "A.md"); const url = S.audioOf(l).src; const h = window.__held = S.watch(new Audio(url)); await h.play(); await S.sleep(600); window.__a = h; return true; }); return ev(() => S.after(window.__a, () => S.leaf.detach())); });
	} else {
		await run("1. press Next (page move) with no lift", async () => { await fresh(); return ev(() => S.after(window.__a, async () => { [...S.leaf.view.contentEl.querySelectorAll("button")].find(b => /next/i.test(b.textContent)).click(); })); });
		await run("2. switch to another booklet note in the same pane", async () => { await fresh(); return ev(() => S.after(window.__a, () => S.leaf.openFile(app.vault.getAbstractFileByPath("B.booklet.md")))); });
		await run("3. close the note", async () => { await fresh(); return ev(() => S.after(window.__a, () => S.leaf.detach())); });
		await run("4. toggle to Markdown (plugin's own switch)", async () => { await fresh(); return ev(() => S.after(window.__a, async () => { await S.leaf.setViewState({ type: "markdown", state: { file: "A.booklet.md", mode: "source" } }); })); });
		await run("5. lift to document.body, then press Next", async () => { await fresh(); return ev(() => { const a = window.__a; document.body.appendChild(a); return S.after(a, async () => { [...S.leaf.view.contentEl.querySelectorAll("button")].find(b => /next/i.test(b.textContent)).click(); }); }); });
		await run("6. lift to document.body, then close the note", async () => { await fresh(); return ev(() => { const a = window.__a; document.body.appendChild(a); return S.after(a, () => S.leaf.detach()); }); });
		await run("7. lift to a bar in the view's container, press Next", async () => { await fresh(); return ev(() => { const a = window.__a; S.bar(S.leaf.view.containerEl).appendChild(a); return S.after(a, async () => { [...S.leaf.view.contentEl.querySelectorAll("button")].find(b => /next/i.test(b.textContent)).click(); }); }); });
		await run("8. lift to a bar in the view's container, close the note", async () => { await fresh(); return ev(() => { const a = window.__a; S.bar(S.leaf.view.containerEl).appendChild(a); return S.after(a, () => S.leaf.detach()); }); });
		await run("9. lift to document.body, then switch note", async () => { await fresh(); return ev(() => { const a = window.__a; document.body.appendChild(a); return S.after(a, () => S.leaf.openFile(app.vault.getAbstractFileByPath("B.booklet.md"))); }); });
		await run("10. lift, then a new page: is the lifted element the one drawn again?", async () => { await fresh(); return ev(async () => { const a = window.__a; document.body.appendChild(a); [...S.leaf.view.contentEl.querySelectorAll("button")].find(b => /next/i.test(b.textContent)).click(); await S.sleep(500); [...S.leaf.view.contentEl.querySelectorAll("button")].find(b => /back/i.test(b.textContent)).click(); await S.sleep(600); const again = S.leaf.view.contentEl.querySelector("audio"); return { newElementOnReturn: again !== a, newElementStartsAt: again && again.currentTime, liftedStillPlaying: !a.paused }; }); });
		await run("11. lift, press Next, Back, reopen the page, put the lifted element in the new page's slot", async () => { await fresh(); return ev(async () => {
			const a = window.__a; document.body.appendChild(a); const c = () => S.leaf.view.contentEl, click = re => [...c().querySelectorAll("button")].find(b => re.test(b.textContent)).click();
			click(/next/i); await S.sleep(500); click(/back/i); await S.sleep(600); c().querySelector(".booklet-cardrow").click(); await S.sleep(800);
			const fresh = c().querySelector("audio"); const ctBefore = a.currentTime; fresh.replaceWith(a); await S.sleep(1000);
			return { newElementWasDrawn: !!fresh && fresh !== a, liftedBackInPage: c().contains(a), pausedAfterReplace: a.paused, pauseEvents: a.__ev.pause, ctAdvance: Math.round((a.currentTime - ctBefore) * 100) / 100 }; }); });
		// Obsidian resets the media element of a view it tears down (emptied, readyState 0), so the lift has to come BEFORE the teardown. Which view hooks run early enough?
		for (const hook of ["onUnloadFile", "onClose", "unload (Component.register callback)"]) {
			for (const [an, act] of [["close the note", "detach"], ["switch note in the pane", "openFile"]]) {
				await run(`hook ${hook} lifts to document.body; ${an}`, async () => { await fresh(); return ev(([hook, act]) => {
					const v = S.leaf.view, a = window.__a, lift = () => { const e = v.contentEl.querySelector("audio"); if (e) document.body.appendChild(e); };
					if (hook.startsWith("unload")) v.register(lift); else { const orig = v[hook].bind(v); v[hook] = async (...x) => { lift(); return orig(...x); }; }
					return S.after(a, () => act === "detach" ? S.leaf.detach() : S.leaf.openFile(app.vault.getAbstractFileByPath("B.booklet.md")));
				}, [hook, act]); });
			}
		}
		// the lift at the press: no hook is needed at close time if the element is already outside the view when it starts playing
		for (const [an, act] of [["close the note", "detach"], ["press Next", "next"], ["switch note in the pane", "openFile"]]) {
			await run(`lift inside the play event (at the press); ${an}`, async () => {
				await ev(async ([n, t]) => { const l = await S.reset(); await S.open(l, n, t); const a = S.watch(S.audioOf(l)); a.addEventListener("play", () => document.body.appendChild(a), { once: true }); await a.play(); await S.sleep(800); a.__ev.pause = 0; window.__a = a; }, [note, type]);
				return ev(act2 => S.after(window.__a, async () => { if (act2 === "detach") S.leaf.detach(); else if (act2 === "next") [...S.leaf.view.contentEl.querySelectorAll("button")].find(b => /next/i.test(b.textContent)).click(); else await S.leaf.openFile(app.vault.getAbstractFileByPath("B.booklet.md")); }), act);
			});
		}
	}
}

(async () => {
	const o = L.args();
	const notes = (ext, wrap) => ({ ["A" + ext]: wrap("![[tone-60s.wav]]\n\nA made-up note with a minute of tone."), ["B" + ext]: wrap("Another made-up note.") });
	// stock launch
	{
		const vault = L.makeVault(o.out + "/v-s11-stock", notes(".md", t => "# Note\n\n" + t + "\n"), { copyFrom: o.media });
		const r = await L.start(o, { vault, name: "s11-stock" });
		try { await r.page.evaluate(HELPERS); console.log("Obsidian", await r.page.evaluate(() => navigator.userAgent.match(/obsidian\/[\d.]+/)[0]), "plugins:", await r.page.evaluate(() => [...app.plugins.enabledPlugins].join(",") || "(none)")); await trials(r.page, "STOCK Obsidian 1.14.5, no plugin, Reading view", "stock"); } finally { await r.stop(); }
	}
	// plugin launch
	{
		const bk = (id, body) => L.bookletNote(id, body).replace("> [!text|q] A question?\n", "> [!text|q] A question?\n\n> [!activity|b] Second page\n\nThe second page.\n\n> [!text|q2] Another question?\n");
		const vault = L.makeVault(o.out + "/v-s11-plugin", { "A.booklet.md": bk("a", "![[tone-60s.wav]]\n\nA made-up booklet with a minute of tone."), "B.booklet.md": bk("b", "Another made-up booklet.") }, { plugin: o.plugin, copyFrom: o.media });
		const r = await L.start(o, { vault, plugin: true, name: "s11-plugin" });
		try { await r.page.evaluate(HELPERS); await trials(r.page, "Booklet plugin 0.11.0, Booklet view", "booklet"); } finally { await r.stop(); }
	}
})().catch(e => { console.error(e); process.exit(1); });
