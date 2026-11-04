// The Node side of the checks (their order, waits, pass/fail/limit decisions and messages), run against a stand-in for the phone.
// The functions that run inside Obsidian's page are NOT executed here (they need the real app); the stand-in answers each by recognising its source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Phone } from "../lib/phone.mjs";
import * as C from "../lib/checks.mjs";
import { StepError } from "../lib/wait.mjs";

/** rules: [[substring of the page function's source, answer or (args, calls) => answer]]. First match wins; no match is a test failure. */
function fakePhone(rules, { adbShell = async () => "" } = {}) {
	const calls = [];
	const ph = new Phone({ browser: {}, adb: { shell: adbShell, pidOf: async () => "", screenshot: async () => Buffer.alloc(0) }, runDir: "/nonexistent", scale: 0.05 });
	ph.ev = async (fn, ...args) => {
		const src = String(fn);
		const rule = rules.find(([k]) => src.includes(k));
		if (!rule) throw new Error(`no stand-in answer for: ${src.slice(0, 120)}`);
		calls.push(rule[0]);
		return typeof rule[1] === "function" ? rule[1](args, calls) : rule[1];
	};
	ph.shot = async (n) => `screenshots/${n}.png`;
	ph.tap = async (sel, what) => void calls.push(`tap ${what}`);
	ph.typeInto = async () => "typed with the WebDriver";
	ph.openNote = async (rel) => void calls.push(`open ${rel}`);
	ph.goScreen = async (s) => void calls.push(`go ${s}`);
	ph.log = () => {};
	return { ph, calls };
}
const env = (extra = {}) => ({ plugin: { manifest: { id: "booklet", version: "1.0.1" } }, adb: {}, state: {}, ...extra });

const metrics = (o = {}) => ({ innerWidth: 411, innerHeight: 731, dpr: 2.6, phone: true, mobile: true, sideways: 0, btn: { left: 12, right: 100, top: 90, bottom: 134, w: 88, h: 44 }, expanded: "false", list: { left: 12, right: 380, top: 140, bottom: 600, w: 368, h: 460 }, links: 8, screen: "activity:garden/garden", ...o });

test("pagesMenu passes at phone width with no sideways scroll", async () => {
	let n = 0;
	const { ph, calls } = fakePhone([["scrollWidth", () => metrics({ expanded: ++n > 1 ? "true" : "false" })], ["booklet-pagesbtn", true], ["aria-expanded", true], ["booklet-pagelist a", true]]);
	const r = await C.pagesMenu(ph, env());
	assert.match(r.detail, /411 px wide.*lists 8 pages.*does not scroll sideways/);
	assert.ok(calls.includes("tap the Pages button"));
});

test("pagesMenu fails with the numbers when the page scrolls sideways or the button is off screen", async () => {
	const { ph } = fakePhone([["scrollWidth", () => metrics({ sideways: 37, btn: { left: 300, right: 500, top: 0, bottom: 44, w: 200, h: 44 } })], ["booklet-pagesbtn", true], ["aria-expanded", true], ["booklet-pagelist a", true]]);
	await assert.rejects(C.pagesMenu(ph, env()), (e) => e instanceof StepError && /scrolls sideways by 37 px/.test(e.message) && /Pages button is not inside the window/.test(e.message));
});

test("allowCard: open, then Close; fails if the card is wider than the window", async () => {
	const card = (o = {}) => ({ left: 8, right: 400, top: 80, bottom: 600, innerWidth: 411, innerHeight: 731, text: "Allow media from", sideways: 0, ...o });
	const mk = (c) => fakePhone([["getBoundingClientRect", c], ["!document.querySelector(\".booklet-allow-card\")", true], ["!!document.querySelector(\".booklet-allow-card\")", true]]);
	const good = mk(card());
	const r = await C.allowCard(good.ph, env());
	assert.match(r.detail, /opened the card.*closed it/);
	assert.deepEqual(good.calls.filter((c) => c.startsWith("tap")), ["tap the Allow list button", "tap the card's Close button"]);
	const wide = mk(card({ right: 520 }));
	await assert.rejects(C.allowCard(wide.ph, env()), /not inside the window width/);
});

function playingRules({ plays = true, paused = false, pauses = 0, rate = 1 } = {}) {
	let started = false;
	let t = 0;
	let clock = 0;
	return [
		["document.querySelector(sel + \" [data-booklet-listen='/l1'] audio, .booklet-nowplaying audio\")", true],
		["booklet-media-play", false],
		["a.play()", () => ((started = plays), { ok: plays, name: "NotAllowedError", message: "play() failed because the user didn't interact" })],
		["!a.paused && a.currentTime > 0.3", () => started],
		["readyState", () => ({ paused: !started, t, readyState: 4, networkState: 1, error: null, src: "android-tone.wav" })],
		["__apPauses = []", true],
		["barBottom", () => ({ t: (t += rate * 2), now: (clock += 2000), paused, ended: false, items: 1, label: "A long tone", pauses, bodyClass: true, screen: "activity:/a2", barBottom: 700, barHeight: 60, innerHeight: 731, innerWidth: 411 })],
		["data-booklet-screen", true],
	];
}

test("nowPlaying passes when the audio runs through two page moves", async () => {
	const { ph, calls } = fakePhone(playingRules());
	const r = await C.nowPlaying(ph, env());
	assert.match(r.detail, /stayed in place through two page moves/);
	assert.deepEqual(calls.filter((c) => c.startsWith("tap")), ["tap the page's Next button", "tap the page's Back button"]);
});

test("nowPlaying fails when the audio pauses, with the step named", async () => {
	const { ph } = fakePhone(playingRules({ paused: true }));
	await assert.rejects(C.nowPlaying(ph, env()), (e) => e instanceof StepError && /the bar after Next/.test(e.step) && /audio is paused/.test(e.message));
});

test("nowPlaying records a limitation, not a failure, when the audio never starts", async () => {
	const { ph } = fakePhone(playingRules({ plays: false }));
	await assert.rejects(C.nowPlaying(ph, env()), (e) => e instanceof C.Limit && /did not start playing/.test(e.message) && /NotAllowedError/.test(e.message));
});

test("answersKept and pageKept read the cycle and say what was found", async () => {
	const { ph } = fakePhone([]);
	const ok = { ok: true, typed: "typed with the WebDriver", savedInNote: true, savedInNoteAfterMs: 800, layoutSaved: true, layoutSavedAfterMs: 1500, field: C.ANSWER, inNoteNow: true, reopened: { file: "Android listen.booklet.md", screen: "activity:/a2", drawn: true } };
	assert.match((await C.answersKept(ph, env({ state: { cycle: ok } }))).detail, /field shows it and the note's file has it/);
	assert.match((await C.pageKept(ph, env({ state: { cycle: ok } }))).detail, /activity:\/a2/);
	await assert.rejects(C.answersKept(ph, env({ state: { cycle: { ...ok, field: "" } } })), /holds ""/);
	await assert.rejects(C.pageKept(ph, env({ state: { cycle: { ...ok, reopened: { file: null, screen: null } } } })), /did NOT have the page|had the page/);
	await assert.rejects(C.answersKept(ph, env({ state: { cycle: { ok: false, step: "reopen", error: "reopen: Obsidian never came back" } } })), /never came back/);
});

test("forceStopCycle never throws: a failure is stored for the two checks to report", async () => {
	const { ph } = fakePhone([["booklet-nowplaying-close", true]]);
	const e = env();
	const c = await C.forceStopCycle(ph, e);
	assert.equal(c.ok, false);
	assert.ok(c.error.length > 0);
	assert.equal(e.state.cycle, c);
});

test("forceStopCycle, whole path: type, move on, save, force-stop, reopen, read back", async () => {
	const killed = [];
	const rules = [
		["booklet-nowplaying-close", true], ["document.activeElement.blur", true],
		["data-booklet-screen", true],
		["vault.read", () => true],
		["workspace-mobile.json", () => "/.obsidian/workspace-mobile.json"],
		["getLeavesOfType(\"booklet\");\n\t\t\tconst mine", () => ({ leaves: 1, file: "Android listen.booklet.md", screen: "activity:/a2", drawn: true, vault: "vault" })],
		["booklet-text\").value", () => C.ANSWER],
		["!!document.querySelector(sel + \" .booklet-text\")", true],
	];
	const { ph, calls } = fakePhone(rules, { adbShell: async (cmd) => (killed.push(cmd), "") });
	ph.reattach = async () => void calls.push("reattach");
	const e = env();
	const c = await C.forceStopCycle(ph, e);
	assert.equal(c.ok, true, c.error);
	assert.ok(killed.includes("am force-stop md.obsidian"));
	assert.ok(calls.indexOf("reattach") > -1);
	assert.equal(c.field, C.ANSWER);
	assert.equal(c.reopened.screen, "activity:/a2");
});

test("lockObservation never fails: any error becomes the observation's text, and the phone is put back", async () => {
	const shell = [];
	const { ph } = fakePhone([], { adbShell: async (cmd) => (shell.push(cmd), "") });
	const r = await C.lockObservation(ph, env()); // openNote works, the next page function has no stand-in answer, so something throws
	assert.equal(r.status, "observation");
	assert.match(r.detail, /could not be completed/);
	for (const cmd of ["dumpsys battery reset", "dumpsys deviceidle unforce", "input keyevent 224"]) assert.ok(shell.includes(cmd), cmd);
	const ph2 = fakePhone([]).ph;
	ph2.openNote = async () => { throw new StepError("open the note", "the Booklet view never drew"); };
	const r2 = await C.lockObservation(ph2, env());
	assert.equal(r2.status, "observation");
	assert.match(r2.detail, /open the note: the Booklet view never drew/);
});

test("pageKept names the layout file that had the page, or says neither had it", async () => {
	const { ph } = fakePhone([]);
	const base = { ok: true, savedInNote: true, field: C.ANSWER, inNoteNow: true, reopened: { file: "Android listen.booklet.md", screen: "activity:/a2", drawn: true } };
	const good = await C.pageKept(ph, env({ state: { cycle: { ...base, layoutSaved: true, layoutFile: ".obsidian/workspace-mobile.json", layoutSavedAfterMs: 700 } } }));
	assert.match(good.detail, /\.obsidian\/workspace-mobile\.json had the page 700 ms after the move/);
	await assert.rejects(C.pageKept(ph, env({ state: { cycle: { ...base, reopened: { file: null, screen: null }, layoutSaved: false, layoutFile: null, layoutFilesPresent: "x: absent" } } })), /neither workspace-mobile\.json nor workspace\.json had the page within 20 s.*x: absent/);
});
