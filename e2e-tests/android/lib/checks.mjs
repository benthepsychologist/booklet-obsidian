// The checks. Each takes (phone, env) and returns { status?, detail, facts? } or throws a StepError (a fail) or a Limit (a recorded limitation).
// env: { plugin: {manifest}, obsidian, adb, state: {} }
import { BOOK, APP_ID } from "./phone.mjs";
import { NOTES, LISTEN_A1, LISTEN_A2 } from "./vault.mjs";
import { StepError, sleep } from "./wait.mjs";

/** The emulator could not do what the check needs. Recorded as "limit", not as a failure of the plugin. */
export class Limit extends Error {
	constructor(message, facts) {
		super(message);
		this.facts = facts;
	}
}

export const ANSWER = "Android pass: a made-up answer";
const CHECK_IN_SCREEN = "activity:day-check/today"; // what the desktop checks open the test-vault's Check-in note on

const j = (o) => JSON.stringify(o);

/* ---- 1. the plugin loads and can be switched on ---- */
export async function pluginLoads(ph, env) {
	const id = env.plugin.manifest.id;
	const read = () => ph.ev((id) => {
		const p = app.plugins.plugins[id];
		return {
			enabled: app.plugins.enabledPlugins.has(id), loaded: !!p, version: p && p.manifest && p.manifest.version,
			obsidian: app.appVersion, mobile: document.body.classList.contains("is-mobile"), phone: document.body.classList.contains("is-phone"),
			android: document.body.classList.contains("is-android"), width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
			ua: navigator.userAgent.slice(0, 160),
		};
	}, id);
	await ph.wait(async () => (await read()).loaded, { what: `the plugin "${id}" to be loaded by Obsidian`, timeout: 90000, interval: 1000 });
	const s = await read();
	await ph.shot("plugin-loaded");
	if (!s.enabled) throw new StepError("plugin enabled", `Obsidian has the plugin loaded but not in its enabled list: ${j(s)}`);
	if (s.version !== env.plugin.manifest.version) throw new StepError("plugin version", `the app runs plugin ${s.version}, the build under test is ${env.plugin.manifest.version}`);
	// switch it off and on again, as a reader does in Settings > Community plugins
	await ph.ev(async (id) => { await app.plugins.disablePlugin(id); }, id);
	await ph.wait(async () => { const x = await read(); return !x.enabled && !x.loaded; }, { what: "the plugin to switch off", timeout: 20000, interval: 500 });
	await ph.ev(async (id) => { await app.plugins.enablePlugin(id); }, id);
	await ph.wait(async () => { const x = await read(); return x.enabled && x.loaded; }, { what: "the plugin to switch on again", timeout: 30000, interval: 500 });
	env.state.app = { obsidian: s.obsidian, width: s.width, height: s.height, dpr: s.dpr, phoneClass: s.phone, mobileClass: s.mobile, androidClass: s.android, ua: s.ua };
	return { detail: `Booklet ${s.version} is loaded and enabled in Obsidian ${s.obsidian}. It switched off and on again without error. The page is ${s.width} x ${s.height} CSS px (device pixel ratio ${s.dpr}), classes is-mobile ${s.mobile}, is-phone ${s.phone}.`, facts: s };
}

/* ---- 2. a Booklet note opens in the Booklet view ---- */
export async function bookletView(ph) {
	await ph.openNote(NOTES.view);
	await ph.goScreen(CHECK_IN_SCREEN);
	const m = await ph.metrics();
	const shown = await ph.ev(() => {
		const v = app.workspace.getLeavesOfType("booklet")[0].view;
		return { type: v.getViewType(), file: v.file.path };
	});
	await ph.shot("booklet-view");
	if (shown.file !== NOTES.view) throw new StepError("the view shows the note", `the Booklet view shows ${shown.file}, not ${NOTES.view}`);
	return { detail: `${NOTES.view} opened as a Booklet view (view type "${shown.type}") on the screen ${m.screen}.`, facts: { ...shown, screen: m.screen } };
}

/* ---- 3. a page tree: the Pages button and its menu, no sideways scroll ---- */
export async function pagesMenu(ph) {
	await ph.openNote(NOTES.pages);
	await ph.wait(() => ph.ev((sel) => !!document.querySelector(sel + " .booklet-pagesbtn"), BOOK), { what: "the Pages button to be drawn", timeout: 20000 });
	const closed = await ph.metrics();
	await ph.shot("pages-closed");
	const problems = [];
	const inside = (r, w) => r && r.left >= -1 && r.right <= w + 1;
	if (!(closed.innerWidth <= 500)) problems.push(`the page is ${closed.innerWidth} CSS px wide: not a phone width`);
	if (closed.sideways > 1) problems.push(`the page scrolls sideways by ${closed.sideways} px with the menu closed`);
	if (!inside(closed.btn, closed.innerWidth)) problems.push(`the Pages button is not inside the window: ${j(closed.btn)}`);
	await ph.tap(`${BOOK} .booklet-pagesbtn`, "the Pages button");
	await ph.wait(() => ph.ev((sel) => { const b = document.querySelector(sel + " .booklet-pagesbtn"); return b && b.getAttribute("aria-expanded") === "true"; }, BOOK), { what: "the Pages menu to open (aria-expanded true)", timeout: 10000 });
	await ph.wait(() => ph.ev((sel) => document.querySelectorAll(sel + " .booklet-pagelist a").length >= 6, BOOK), { what: "the Pages menu to list the pages", timeout: 10000 });
	const open = await ph.metrics();
	await ph.shot("pages-open");
	if (open.sideways > 1) problems.push(`the page scrolls sideways by ${open.sideways} px with the menu open`);
	if (open.list && !inside(open.list, open.innerWidth)) problems.push(`the menu list is not inside the window: ${j(open.list)}`);
	if (open.links < 6) problems.push(`the menu lists ${open.links} pages; the garden wiki has the activity's own page and eight pages under it, so 9 are expected (the check accepts 6 or more)`);
	if (problems.length) throw new StepError("Pages button and menu at phone width", problems.join("; "), { detail: j({ closed, open }) });
	return { detail: `At ${closed.innerWidth} px wide the Pages button sits inside the window (${closed.btn.w} x ${closed.btn.h} px), the menu opens and lists ${open.links} pages, and the page does not scroll sideways (${closed.sideways} px closed, ${open.sideways} px open).`, facts: { closed, open } };
}

/* ---- 4. the Allow card opens and closes ---- */
export async function allowCard(ph) {
	await ph.openNote(NOTES.listen);
	await ph.goScreen(LISTEN_A1);
	await ph.tap(`${BOOK} .booklet-allow-btn`, "the Allow list button");
	await ph.wait(() => ph.ev(() => !!document.querySelector(".booklet-allow-card")), { what: "the Allow card to open", timeout: 10000 });
	const card = await ph.ev(() => {
		const c = document.querySelector(".booklet-allow-card");
		const x = c.getBoundingClientRect();
		return { left: Math.round(x.left), right: Math.round(x.right), top: Math.round(x.top), bottom: Math.round(x.bottom), innerWidth, innerHeight, text: c.textContent.replace(/\s+/g, " ").trim().slice(0, 200), sideways: c.scrollWidth - c.clientWidth };
	});
	await ph.shot("allow-card-open");
	const problems = [];
	if (card.left < -1 || card.right > card.innerWidth + 1) problems.push(`the card is not inside the window width: ${card.left} to ${card.right} of ${card.innerWidth}`);
	if (card.sideways > 1) problems.push(`the card scrolls sideways by ${card.sideways} px`);
	await ph.tap(".booklet-allow-card .modal-button-container button", "the card's Close button");
	await ph.wait(() => ph.ev(() => !document.querySelector(".booklet-allow-card")), { what: "the Allow card to close", timeout: 10000 });
	await ph.shot("allow-card-closed");
	if (problems.length) throw new StepError("Allow card layout", problems.join("; "));
	return { detail: `The Allow list button opened the card (${card.right - card.left} px wide in a ${card.innerWidth} px window) and its Close button closed it. Card text begins: "${card.text.slice(0, 120)}"`, facts: card };
}

/* ---- the now-playing bar (also used by the lock observation) ---- */

/** Opens the listen note on its first page and presses Play on the tone. Throws Limit if the audio would not start in the emulator. */
export async function startPlaying(ph, env) {
	await ph.openNote(NOTES.listen);
	await ph.goScreen(LISTEN_A1);
	await ph.wait(() => ph.ev((sel) => !!document.querySelector(sel + " [data-booklet-listen='/l1'] audio, .booklet-nowplaying audio"), BOOK), { what: "the tone's audio element to be on the page", timeout: 20000 });
	const how = [];
	const hasButton = await ph.ev((sel) => !!document.querySelector(sel + " [data-booklet-listen='/l1'] .booklet-media-play"), BOOK);
	if (hasButton) {
		await ph.tap(`${BOOK} [data-booklet-listen='/l1'] .booklet-media-play`, "the tone's Play button");
		how.push("a tap on the Play button");
	}
	let started = await waitPlaying(ph, hasButton ? 8000 : 1);
	let playError = null;
	if (!started) {
		// the page's own audio element, started by a script: a web view may refuse it without a finger
		playError = await ph.ev(() => {
			const a = document.querySelector(".booklet-nowplaying audio") || document.querySelector("[data-booklet-listen='/l1'] audio");
			if (!a) return { ok: false, name: "NoElement", message: "no audio element" };
			return a.play().then(() => ({ ok: true }), (e) => ({ ok: false, name: e.name, message: e.message }));
		});
		how.push(`audio.play() from a script (${playError.ok ? "accepted" : `refused: ${playError.name} ${playError.message}`})`);
		started = await waitPlaying(ph, 15000);
	}
	const audio = await ph.ev(() => {
		const a = document.querySelector(".booklet-nowplaying audio") || document.querySelector("[data-booklet-listen='/l1'] audio");
		return a ? { paused: a.paused, t: a.currentTime, readyState: a.readyState, networkState: a.networkState, error: a.error ? a.error.code : null, src: (a.currentSrc || "").slice(-40) } : null;
	});
	if (!started) {
		await ph.shot("audio-did-not-play");
		throw new Limit(`The tone did not start playing in the emulator within the wait (tried: ${how.join("; ")}). Audio element: ${j(audio)}. The emulator may have no usable audio device (was it started with --mute?) or the web view refuses autoplay. Rerun without --mute, or judge the bar on a real phone.`, { how, audio, playError });
	}
	await ph.ev(() => {
		const a = document.querySelector(".booklet-nowplaying audio");
		window.__apPauses = [];
		a.addEventListener("pause", () => window.__apPauses.push({ t: a.currentTime, at: performance.now() }));
		window.__apVis = [];
		document.addEventListener("visibilitychange", () => window.__apVis.push({ state: document.visibilityState, at: performance.now() }));
	});
	env.state.playHow = how;
	return how;
}

const waitPlaying = async (ph, ms) => {
	try {
		return await ph.wait(() => ph.ev(() => {
			const a = document.querySelector(".booklet-nowplaying audio");
			return !!a && !a.paused && a.currentTime > 0.3;
		}), { what: "the tone to be playing in the now-playing bar", timeout: ms, interval: 300 });
	} catch {
		return false;
	}
};

const barState = (ph) => ph.ev((sel) => {
	const bar = document.querySelector(".booklet-nowplaying");
	const a = bar && bar.querySelector("audio");
	const r = bar && bar.getBoundingClientRect();
	const page = document.querySelector(sel + " .booklet-page");
	return a ? {
		t: a.currentTime, now: performance.now(), paused: a.paused, ended: a.ended, items: document.querySelectorAll(".booklet-nowplaying-item").length,
		label: (document.querySelector(".booklet-nowplaying-label") || {}).textContent || null, pauses: (window.__apPauses || []).length,
		bodyClass: document.body.classList.contains("booklet-has-nowplaying"), screen: page ? page.getAttribute("data-booklet-screen") : null,
		barBottom: Math.round(r.bottom), barHeight: Math.round(r.height), innerHeight, innerWidth,
	} : { missing: true, screen: page ? page.getAttribute("data-booklet-screen") : null };
}, BOOK);

async function survives(ph, what) {
	const s1 = await barState(ph);
	await sleep(2000); // a window to measure the rate over: not a wait for a condition
	const s2 = await barState(ph);
	if (s1.missing || s2.missing) throw new StepError(`the bar ${what}`, `the now-playing bar is gone ${what} (page ${s2.screen || s1.screen})`);
	const rate = (s2.t - s1.t) / ((s2.now - s1.now) / 1000);
	const problems = [];
	if (s2.paused) problems.push("the audio is paused");
	if (s2.ended) problems.push("the audio has ended (a slow run? the tone is two minutes)");
	if (!(rate > 0.7 && rate < 1.3)) problems.push(`the audio advanced ${rate.toFixed(2)} s per second`);
	if (s2.pauses > 0) problems.push(`${s2.pauses} pause events on the audio element`);
	if (s2.items !== 1) problems.push(`${s2.items} rows in the bar`);
	if (!s2.bodyClass) problems.push("the page lost its has-nowplaying class");
	if (s2.barBottom > s2.innerHeight + 1 || s2.barHeight <= 0) problems.push(`the bar is not on screen (bottom ${s2.barBottom} of ${s2.innerHeight})`);
	if (problems.length) throw new StepError(`the bar ${what}`, problems.join("; "), { detail: j({ s1, s2 }) });
	return { ...s2, rate };
}

export async function nowPlaying(ph, env) {
	const how = await startPlaying(ph, env); // throws Limit when the audio will not play
	const s0 = await barState(ph);
	await ph.shot("bar-playing-page-1");
	if (s0.missing) throw new StepError("the bar appears", "the tone plays but there is no now-playing bar");
	await ph.tap(`${BOOK} .booklet-pager-next`, "the page's Next button");
	await ph.wait(() => ph.ev((sel, s) => !!document.querySelector(`${sel} .booklet-page[data-booklet-screen='${s}']`), BOOK, LISTEN_A2), { what: "the second page to be drawn after Next", timeout: 20000 });
	const after = await survives(ph, "after Next (a page move)");
	await ph.shot("bar-after-next");
	await ph.tap(`${BOOK} .booklet-pager-back`, "the page's Back button");
	await ph.wait(() => ph.ev((sel, s) => !!document.querySelector(`${sel} .booklet-page[data-booklet-screen='${s}']`), BOOK, LISTEN_A1), { what: "the first page to be drawn after Back", timeout: 20000 });
	const back = await survives(ph, "after Back (a second page move)");
	await ph.shot("bar-after-back");
	return { detail: `Started by ${how.join(", then ")}. The bar ("${s0.label}") stayed in place through two page moves with the tone playing at ${after.rate.toFixed(2)} and ${back.rate.toFixed(2)} s per second and no pause events. Whether you can hear it is not tested.`, facts: { first: s0, afterNext: after, afterBack: back } };
}

/* ---- force-stop and reopen: one procedure, two checks ---- */

/** Types an answer, goes to the second page, waits for the app to have saved, force-stops Obsidian, reopens it, and records what it finds. Never throws; stores the outcome in env.state.cycle. */
export async function forceStopCycle(ph, env) {
	const c = { ok: false };
	env.state.cycle = c;
	try {
		await ph.ev(() => { for (const b of document.querySelectorAll(".booklet-nowplaying-close")) b.click(); }).catch(() => {});
		await ph.openNote(NOTES.listen);
		await ph.goScreen(LISTEN_A1);
		c.typed = await ph.typeInto(`${BOOK} .booklet-text`, ANSWER, "the write-in field");
		await ph.ev(() => { if (document.activeElement) document.activeElement.blur(); });
		await ph.tap(`${BOOK} .booklet-pager-next`, "the page's Next button");
		await ph.wait(() => ph.ev((sel, s) => !!document.querySelector(`${sel} .booklet-page[data-booklet-screen='${s}']`), BOOK, LISTEN_A2), { what: "the second page to be drawn", timeout: 20000 });
		await ph.shot("before-force-stop");
		const t0 = Date.now();
		c.savedInNote = await ph.wait(() => ph.ev(async (rel, text) => (await app.vault.read(app.vault.getAbstractFileByPath(rel))).includes(text), NOTES.listen, ANSWER), { what: "the answer to appear in the note's file", timeout: 20000, interval: 500 }).catch(() => false);
		c.savedInNoteAfterMs = Date.now() - t0;
		const t1 = Date.now();
		// Obsidian on a phone keeps its layout in workspace-mobile.json; the desktop file is workspace.json. Wait for whichever has the page.
		c.layoutFile = await ph.wait(() => ph.ev(async (s) => {
			const dir = app.vault.configDir;
			for (const f of [`${dir}/workspace-mobile.json`, `${dir}/workspace.json`]) {
				try {
					if ((await app.vault.adapter.exists(f)) && (await app.vault.adapter.read(f)).includes(s)) return f;
				} catch (e) { /* not readable yet */ }
			}
			return null;
		}, LISTEN_A2), { what: "Obsidian to write the open page into its layout file", timeout: 20000, interval: 500 }).catch(() => null);
		c.layoutSaved = !!c.layoutFile;
		if (!c.layoutFile) c.layoutFilesPresent = await ph.ev(async () => {
			const dir = app.vault.configDir;
			const out = [];
			for (const f of [`${dir}/workspace-mobile.json`, `${dir}/workspace.json`]) out.push(`${f}: ${(await app.vault.adapter.exists(f)) ? "present" : "absent"}`);
			return out.join(", ");
		}).catch(() => "could not be listed");
		c.layoutSavedAfterMs = Date.now() - t1;
		await ph.adb.shell(`am force-stop ${APP_ID}`);
		await ph.wait(async () => (await ph.adb.pidOf(APP_ID)) === "", { what: "Obsidian's process to be gone after force-stop", timeout: 20000, interval: 500 });
		await ph.shot("after-force-stop");
		await ph.reattach({ launch: true });
		await ph.shot("after-reopen");
		const state = await ph.ev((sel, rel) => {
			const leaves = app.workspace.getLeavesOfType("booklet");
			const mine = leaves.find((l) => l.view && l.view.file && l.view.file.path === rel);
			const st = mine ? mine.getViewState().state : null;
			return { leaves: leaves.length, file: mine ? mine.view.file.path : null, screen: st ? st.screen : null, drawn: mine ? !!mine.view.contentEl.querySelector(".booklet-page") : false, vault: app.vault.getName() };
		}, BOOK, NOTES.listen);
		c.reopened = state;
		await ph.goScreen(LISTEN_A1);
		await ph.wait(() => ph.ev((sel) => !!document.querySelector(sel + " .booklet-text"), BOOK), { what: "the write-in field to be drawn after reopening", timeout: 20000 });
		c.field = await ph.ev((sel) => document.querySelector(sel + " .booklet-text").value, BOOK);
		c.inNoteNow = await ph.ev(async (rel, text) => (await app.vault.read(app.vault.getAbstractFileByPath(rel))).includes(text), NOTES.listen, ANSWER);
		await ph.shot("answer-after-reopen");
		c.ok = true;
	} catch (e) {
		c.error = e instanceof StepError ? e.message : `${e.message}`;
		c.step = e.step || "force-stop and reopen";
		await ph.shot("force-stop-failed");
	}
	return c;
}

export async function answersKept(ph, env) {
	const c = env.state.cycle;
	if (!c.ok) throw new StepError(c.step, c.error);
	if (c.field !== ANSWER) throw new StepError("the typed answer after reopening", `typed "${ANSWER}" (${c.typed}); after the force-stop and reopen the field holds ${j(c.field)}; the note's file ${c.inNoteNow ? "has" : "does not have"} the text`, { detail: j(c) });
	return { detail: `Typed "${ANSWER}" (${c.typed}). It was ${c.savedInNote ? `in the note's file ${c.savedInNoteAfterMs} ms after the move to the next page` : "NOT in the note's file within 20 s (it was kept some other way, or not at all)"}. After force-stop and reopen the field shows it${c.inNoteNow ? " and the note's file has it" : " but the note's file does not have it"}.`, facts: c };
}

/** What is known about Obsidian saving the open page before the force-stop, in words. */
const layoutText = (c) => (c.layoutSaved ? `${c.layoutFile} had the page ${c.layoutSavedAfterMs} ms after the move` : `neither workspace-mobile.json nor workspace.json had the page within 20 s of the move (${c.layoutFilesPresent ?? "files not listed"})`);

export async function pageKept(ph, env) {
	const c = env.state.cycle;
	if (!c.ok) throw new StepError(c.step, c.error);
	const r = c.reopened;
	if (!r.file || r.screen !== LISTEN_A2) throw new StepError("the open page after reopening", `before the force-stop the open page was ${LISTEN_A2} of ${NOTES.listen}; after the reopen Obsidian shows ${j(r)} (${layoutText(c)})`, { detail: j(c) });
	return { detail: `Before the force-stop ${NOTES.listen} was open on ${LISTEN_A2}. After the reopen Obsidian had the same note open in the Booklet view on ${r.screen}${r.drawn ? ", drawn" : ""}. ${layoutText(c)}.`, facts: c };
}

/* ---- observation: idle and lock with the bar present (no pass or fail) ---- */

const audioLines = async (adb) => (await adb.shell("dumpsys audio | grep -i -E 'piid|player' | head -n 8", { loose: true })).split("\n").map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, 200));
const power = async (adb) => ({
	wakefulness: (await adb.shell("dumpsys power | grep -m1 mWakefulness=", { loose: true })).trim(),
	deepIdle: (await adb.shell("dumpsys deviceidle get deep", { loose: true })).trim(),
	lightIdle: (await adb.shell("dumpsys deviceidle get light", { loose: true })).trim(),
});

async function lockObservationInner(ph, env) {
	const lines = [];
	const say = (s) => { lines.push(s); ph.log(`  ${s}`); };
	const adb = ph.adb;
	let playing = true;
	try {
		await startPlaying(ph, env);
	} catch (e) {
		if (!(e instanceof Limit)) throw e;
		playing = false;
		say(`The tone could not be started, so there was no audio to watch: ${e.message}`);
	}
	const before = await barState(ph);
	say(`Before: bar ${before.missing ? "absent" : `present, audio at ${before.t.toFixed(1)} s, ${before.paused ? "paused" : "playing"}`}.`);
	for (const l of await audioLines(adb)) say(`  audio service (before): ${l}`);
	await ph.shot("lock-before");
	const restore = [];
	try {
		await adb.shell("dumpsys battery unplug", { loose: true });
		restore.push(() => adb.shell("dumpsys battery reset", { loose: true }));
		await adb.shell("svc power stayon false", { loose: true });
		await adb.shell("dumpsys deviceidle enable", { loose: true });
		const forced = await adb.shell("dumpsys deviceidle force-idle", { loose: true });
		restore.push(() => adb.shell("dumpsys deviceidle unforce", { loose: true }));
		say(`force-idle answered: ${forced.split("\n")[0] || "(nothing)"}`);
		await adb.shell("input keyevent 26", { loose: true }); // power: screen off
		const asleep = await ph.wait(async () => /Asleep|Dozing/.test((await power(adb)).wakefulness), { what: "the screen to go off (mWakefulness Asleep)", timeout: 20000, interval: 500 }).catch(() => false);
		say(`Screen ${asleep ? "went off" : "did not go off within 20 s"}.`);
		const dwell = 20000; // the observation window: how long the phone stays idle and locked. Not a wait for a condition.
		for (const at of [0, dwell / 2, dwell]) {
			if (at) await sleep(dwell / 2);
			const p = await power(adb);
			say(`During (${at / 1000} s in): ${p.wakefulness}; deep idle ${p.deepIdle}; light idle ${p.lightIdle}.`);
			for (const l of await audioLines(adb)) say(`  audio service: ${l}`);
		}
		await ph.shot("lock-screen-off"); // usually a black picture; kept as evidence
	} finally {
		for (const f of restore.reverse()) await f().catch(() => {});
		await adb.shell("svc power stayon true", { loose: true }).catch(() => {});
	}
	await adb.shell("input keyevent 224", { loose: true }); // wake up
	await adb.shell("wm dismiss-keyguard", { loose: true });
	await adb.shell("input keyevent 82", { loose: true }); // menu: dismisses a swipe lock screen
	const awake = await ph.wait(async () => /Awake/.test((await power(adb)).wakefulness), { what: "the screen to come back on", timeout: 20000, interval: 500 }).catch(() => false);
	say(`Unlocked: screen ${awake ? "on" : "did not come on within 20 s"}.`);
	await ph.shot("lock-after-unlock");
	let after = null;
	try {
		after = await ph.wait(async () => { const s = await barState(ph); return s; }, { what: "Obsidian's page to answer after unlock", timeout: 30000, interval: 1000 });
		await sleep(3000); // a window to see whether the audio is advancing
		const later = await barState(ph);
		const events = await ph.ev(() => ({ pauses: window.__apPauses || [], vis: window.__apVis || [] }));
		say(`After: bar ${after.missing ? "ABSENT" : "present"}; ${later.missing ? "no audio element" : `audio at ${later.t.toFixed(1)} s (was ${before.missing ? "n/a" : before.t.toFixed(1)} s before), ${later.paused ? "PAUSED" : "playing"}${later.ended ? ", ended" : ""}`}.`);
		say(`Page events while locked: ${events.pauses.length} pause event(s), ${events.vis.length} visibility change(s) ${j(events.vis.map((v) => v.state))}.`);
	} catch (e) {
		say(`After unlocking, the page could not be read: ${e.message}`);
	}
	for (const l of await audioLines(adb)) say(`  audio service (after): ${l}`);
	await ph.shot("lock-after-read");
	return { status: "observation", detail: ["Forced Doze (`dumpsys deviceidle force-idle`, battery shown as unplugged) and pressed Power (keyevent 26) with the tone " + (playing ? "playing in the bar" : "NOT playing (see below)") + ", waited 20 s, woke and unlocked.", "", ...lines.map((l) => `    ${l}`), "", "An emulator does not model a phone maker's battery killer or a real lock screen's audio rules. This is an observation for the report; a real phone is the judge."].join("\n") };
}

/** Never a fail: whatever goes wrong becomes the observation's text. This part of the run is written down, not graded. */
export async function lockObservation(ph, env) {
	try {
		return await lockObservationInner(ph, env);
	} catch (e) {
		for (const cmd of ["dumpsys battery reset", "dumpsys deviceidle unforce", "input keyevent 224", "svc power stayon true"]) await ph.adb.shell(cmd, { loose: true }).catch(() => {});
		return { status: "observation", detail: `The observation could not be completed, so there is nothing to report from it. What stopped it: ${e instanceof StepError ? `${e.step}: ${e.reason}` : String(e && e.message || e)}` };
	}
}
