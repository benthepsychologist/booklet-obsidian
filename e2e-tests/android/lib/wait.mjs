// Waiting for a condition, with a clear error that says which step failed. No fixed sleeps stand in for a condition.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A failure of one named step. `step` is what was being waited for or done, in words; the message is what the reader of results.md sees. */
export class StepError extends Error {
	/** `fatal: true` means no amount of waiting will help (the emulator or Appium died): waitFor rethrows it at once instead of trying again. */
	constructor(step, message, { cause, detail, fatal = false } = {}) {
		super(`${step}: ${message}`);
		this.name = "StepError";
		this.step = step;
		this.reason = message;
		this.detail = detail;
		this.fatal = fatal;
		if (cause) this.cause = cause;
	}
}

/** Multiplies a time by the run's `--timeout-scale` (a slow Mac). Whole milliseconds. */
export function scaled(ms, scale = 1) {
	return Math.round(ms * (Number.isFinite(scale) && scale > 0 ? scale : 1));
}

/**
 * Calls `fn` until it returns something truthy, then returns that. If `timeout` ms pass first, throws a StepError naming `what`.
 * An error thrown by `fn` counts as "not yet" (a page that is still loading throws all the time); the last one is quoted in the failure.
 * Except a StepError with `fatal: true`, which is rethrown immediately with its own message.
 * `timeout` and `interval` are in ms and are multiplied by `scale`.
 */
export async function waitFor(fn, { what, timeout = 10000, interval = 250, scale = 1, now = Date.now, pause = sleep } = {}) {
	if (!what) throw new TypeError("waitFor needs `what`: the words for the step that is being waited on");
	const limit = scaled(timeout, scale);
	const t0 = now();
	let lastError = null;
	let lastValue;
	let tries = 0;
	for (;;) {
		tries++;
		try {
			lastValue = await fn();
			if (lastValue) return lastValue;
			lastError = null;
		} catch (e) {
			if (e && e.fatal === true) throw e;
			lastError = e;
		}
		if (now() - t0 >= limit) break;
		await pause(interval);
	}
	const why = lastError ? `last error: ${String(lastError.message || lastError).split("\n")[0].slice(0, 300)}` : `the condition stayed false (last value ${JSON.stringify(lastValue)})`;
	throw new StepError(what, `not done within ${Math.round(limit / 1000)} s (${tries} tries); ${why}`, { cause: lastError || undefined });
}

/** Runs `fn`; if it throws, tries again up to `times` in all, waiting `gap` ms between. Returns fn's value. */
export async function retry(fn, { times = 3, gap = 1000, what = "a step", pause = sleep } = {}) {
	let last;
	for (let i = 1; i <= times; i++) {
		try {
			return await fn(i);
		} catch (e) {
			last = e;
			if (i < times) await pause(gap);
		}
	}
	throw new StepError(what, `failed ${times} times; last error: ${String(last?.message || last).split("\n")[0].slice(0, 300)}`, { cause: last });
}
