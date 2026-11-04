// The result file. One Results object collects every check; write() makes results.json and results.md next to the screenshots.
import fs from "node:fs";
import path from "node:path";

/** pass and fail are graded. limit is a recorded limitation of the emulator (not a failure). observation is written down, never graded. skipped did not run. */
export const STATUSES = ["pass", "fail", "limit", "observation", "skipped"];
const LABEL = { pass: "PASS", fail: "FAIL", limit: "LIMIT", observation: "OBSERVED", skipped: "SKIPPED" };

export class Results {
	constructor(meta = {}) {
		this.meta = meta;
		this.checks = [];
		this.notes = [];
	}

	add(c) {
		if (!STATUSES.includes(c.status)) throw new RangeError(`unknown status ${c.status}`);
		if (!c.id || !c.title) throw new TypeError("a check needs an id and a title");
		this.checks.push({ id: c.id, title: c.title, status: c.status, detail: c.detail ?? "", step: c.step ?? null, screenshots: c.screenshots ?? [], facts: c.facts ?? {}, ms: c.ms ?? null });
	}

	note(text) {
		this.notes.push(text);
	}

	get counts() {
		const n = Object.fromEntries(STATUSES.map((s) => [s, 0]));
		for (const c of this.checks) n[c.status]++;
		return n;
	}

	/** "fail" if any graded check failed; "pass" if at least one passed and none failed; else "incomplete". */
	get verdict() {
		const n = this.counts;
		if (n.fail) return "fail";
		if (n.pass) return "pass";
		return "incomplete";
	}

	toJSON() {
		return { meta: this.meta, verdict: this.verdict, counts: this.counts, checks: this.checks, notes: this.notes };
	}

	toMarkdown() {
		const m = this.meta;
		const n = this.counts;
		const out = [];
		out.push("# Booklet on Obsidian Android: result", "");
		out.push(`**Verdict: ${this.verdict.toUpperCase()}** (${n.pass} passed, ${n.fail} failed, ${n.limit} limited by the emulator, ${n.skipped} skipped, ${n.observation} observed)`, "");
		out.push("## What was run", "");
		for (const [k, v] of Object.entries(m.summary ?? {})) out.push(`- **${k}**: ${v}`);
		out.push("");
		out.push("## Checks", "");
		out.push("| # | Check | Result |", "| - | - | - |");
		this.checks.forEach((c, i) => out.push(`| ${i + 1} | ${c.id} | ${LABEL[c.status]} |`));
		out.push("");
		this.checks.forEach((c, i) => {
			out.push(`### ${i + 1}. ${c.title}`, "", `**${LABEL[c.status]}**${c.ms != null ? ` (${(c.ms / 1000).toFixed(1)} s)` : ""}`, "");
			if (c.step) out.push(`Step that failed: ${c.step}`, "");
			if (c.detail) out.push(c.detail, "");
			for (const s of c.screenshots) out.push(`- screenshot: \`${s}\``);
			if (c.screenshots.length) out.push("");
		});
		if (this.notes.length) {
			out.push("## Notes", "");
			for (const t of this.notes) out.push(`- ${t}`);
			out.push("");
		}
		out.push("## What this run cannot tell you", "");
		for (const t of m.limits ?? []) out.push(`- ${t}`);
		out.push("");
		return out.join("\n");
	}

	write(dir) {
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(this.toJSON(), null, 2) + "\n");
		fs.writeFileSync(path.join(dir, "results.md"), this.toMarkdown());
	}
}

/** A folder name from a date: "2026-11-04T10-31-22Z" (no colons, which Macs and zip files dislike). */
export function stamp(d = new Date()) {
	return d.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
}
