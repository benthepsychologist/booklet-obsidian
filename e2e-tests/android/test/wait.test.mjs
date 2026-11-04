import { test } from "node:test";
import assert from "node:assert/strict";
import { waitFor, retry, StepError, scaled } from "../lib/wait.mjs";

const clock = () => {
	let t = 0;
	return { now: () => t, pause: async (ms) => void (t += ms) };
};

test("waitFor returns the first truthy value", async () => {
	const c = clock();
	let n = 0;
	const v = await waitFor(() => (++n >= 3 ? "ready" : null), { what: "a thing", timeout: 5000, interval: 100, ...c });
	assert.equal(v, "ready");
	assert.equal(n, 3);
});

test("waitFor: errors count as not yet, then the failure names the step and the last error", async () => {
	const c = clock();
	await assert.rejects(
		waitFor(() => { throw new Error("page not loaded\nstack..."); }, { what: "the Pages button to be drawn", timeout: 1000, interval: 250, ...c }),
		(e) => e instanceof StepError && e.step === "the Pages button to be drawn" && /not done within 1 s/.test(e.message) && /last error: page not loaded/.test(e.message) && !/stack/.test(e.message),
	);
});

test("waitFor: a condition that stays false says so", async () => {
	const c = clock();
	await assert.rejects(waitFor(() => false, { what: "x", timeout: 300, interval: 100, ...c }), /stayed false/);
});

test("waitFor: --timeout-scale stretches the limit", async () => {
	const c = clock();
	let n = 0;
	await assert.rejects(waitFor(() => { n++; return false; }, { what: "x", timeout: 1000, interval: 100, scale: 3, ...c }), /not done within 3 s/);
	assert.ok(n >= 30);
	assert.equal(scaled(1000, 2), 2000);
	assert.equal(scaled(1000, 0), 1000);
});

test("waitFor insists on a `what`", async () => {
	await assert.rejects(waitFor(() => true, {}), TypeError);
});

test("retry returns on success and gives up with a StepError", async () => {
	let n = 0;
	assert.equal(await retry(async () => (++n < 2 ? Promise.reject(new Error("no")) : "yes"), { times: 3, gap: 0 }), "yes");
	await assert.rejects(retry(async () => { throw new Error("always"); }, { times: 2, gap: 0, what: "attach" }), (e) => e instanceof StepError && /failed 2 times; last error: always/.test(e.message));
});

test("waitFor rethrows a fatal StepError at once, with its own message, and does not try again", async () => {
	const c = clock();
	let n = 0;
	await assert.rejects(
		waitFor(() => { n++; throw new StepError("boot the emulator", "the emulator process exited early (code 1); see emulator.log", { fatal: true }); }, { what: "boot", timeout: 420000, interval: 3000, ...c }),
		(e) => e instanceof StepError && e.fatal === true && /exited early \(code 1\)/.test(e.message) && !/not done within/.test(e.message),
	);
	assert.equal(n, 1);
	assert.equal(c.now(), 0, "no waiting happened");
});

test("a StepError that is not fatal is still 'not yet'", async () => {
	const c = clock();
	let n = 0;
	await assert.rejects(waitFor(() => { n++; throw new StepError("x", "still loading"); }, { what: "x", timeout: 500, interval: 100, ...c }), /not done within/);
	assert.ok(n > 1);
});
