/*
 * A query drawn as bars or as a line (SPEC section 6, "bars" and "line"), worked out as numbers and words that the drawing
 * (src/charts.ts) turns into SVG. A chart is made from the rows left after the reader's filter, so the plan holds only what
 * is plotted (`ChartSpec`) and this makes the chart from those rows. Bars are always drawn from zero; a line runs from the
 * oldest to the newest entry; a value that is not a number draws nothing (no bar; a gap in a line); and the same numbers
 * are always offered as a table. A chart that cannot be drawn says why in words, in the chart's place. The scale
 * helpers are booklet.html's (niceScale, lineDomain, thinLabels), so a chart is scaled as the reference renderer scales
 * it. Plain TypeScript: nothing here imports Obsidian.
 */
import { QUERY_WORDS, formatNumber, maxOf, minOf, numberOf, roleText, textOf, toneOf, type QueryPlan, type Row } from "./query";

type Plan = Extract<QueryPlan, { kind: "rows" }>;

export interface ChartSeries {
	/** The field's name in words (a line chart's legend, a table's heading). */
	name: string;
	/** One number for each row, or null where the row has none (no bar; a gap in the line). */
	values: (number | null)[];
}

export interface Chart {
	kind: "bars" | "line";
	/** One label for each row: the `label` field, or for a kept entry's date the day without the year ("Oct 27"). */
	labels: string[];
	/** A bar chart has one; a line chart has a line for each field. */
	series: ChartSeries[];
	/** Bars only: a row's tone, which colours its bar. */
	tones: ("good" | "warn" | "bad" | null)[];
	/** The chart in words, for a screen reader: how many bars or points, and from what to what. */
	name: string;
	/** The lowest and highest number plotted, or null when there is none. */
	range: [number, number] | null;
	/** A number as the chart writes it (at most 2 decimals, in the locale). */
	fmt: (n: number) => string;
	/** Set when the chart cannot be drawn: one plain sentence for the chart's place. The numbers table is still offered. */
	cannot: string | null;
	/** Under a chart that is drawn: "One reading so far." for one row, or that every bar value is 0. */
	note: string | null;
	/** "Show the numbers": the same rows as a table, as words. */
	table: { head: string[]; rows: string[][] };
}

const finite = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n);

/** A kept entry's day without the year, in the reader's own way of writing it: "Oct 27". */
export function shortDay(ts: string): string {
	const t = Date.parse(ts);
	return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ts;
}

/** The chart for these rows (the plan's rows, or those the reader's filter and sort left). */
export function buildChart(p: Plan, rows: readonly Row[]): Chart {
	const spec = p.chart!;
	const { set, roles } = p;
	const fmt = (n: number) => formatNumber(n, spec.locale, 2);
	const labels = rows.map((r) => (roles.label === "date" && r.ts !== undefined ? shortDay(r.ts) : roleText(r, roles.label)));
	const series: ChartSeries[] = spec.keys.map((k) => ({
		name: k ? textOf(set.label(k)) : "",
		values: rows.map((r) => {
			const n = k ? numberOf(r.cells[k]) : undefined;
			return finite(n) ? n : null;
		}),
	}));
	const tones = rows.map((r) => (spec.kind === "bars" ? toneOf(r, roles) : null));
	const all = series.flatMap((s) => s.values).filter((x): x is number => x !== null);
	const range: [number, number] | null = all.length ? [minOf(all), maxOf(all)] : null;
	const what = spec.kind === "bars" ? "bars" : "a line";
	let cannot: string | null = null;
	if (!all.length && rows.length) {
		const named = spec.keys.some((k) => k !== null);
		cannot = QUERY_WORDS.chart.cannot(what, named ? QUERY_WORDS.chart.notNumbers(series.filter((s, i) => spec.keys[i] !== null).map((s) => s.name)) : QUERY_WORDS.chart.noField(spec.kind));
	}
	let note: string | null = null;
	if (!cannot) {
		if (spec.kind === "bars" && all.every((x) => x === 0)) note = QUERY_WORDS.chart.zero;
		else if (rows.length === 1) note = QUERY_WORDS.chart.one;
	}
	const lo = range ? fmt(range[0]) : "–";
	const hi = range ? fmt(range[1]) : "–";
	const name =
		spec.kind === "bars"
			? QUERY_WORDS.chart.bars(rows.length, range ? lo : null, range ? hi : null)
			: QUERY_WORDS.chart.line(series.map((s) => s.name).join(", "), rows.length, lo, hi);
	const head = [roles.label ? textOf(set.label(roles.label)) : "", ...series.map((s) => s.name)];
	const table = { head, rows: rows.map((_, i) => [labels[i]!, ...series.map((s) => (s.values[i] === null || s.values[i] === undefined ? "–" : fmt(s.values[i]!)))]) };
	return { kind: spec.kind, labels, series, tones, name, range, fmt, cannot, note, table };
}

/* ---- scale (booklet.html niceNum, niceScale, lineDomain, thinLabels) ---- */

export interface Scale {
	min: number;
	max: number;
	step: number;
	ticks: number[];
}

const decimalsOf = (s: number): number => {
	const x = Math.abs(s);
	return x >= 1 ? 0 : Math.min(10, Math.ceil(-Math.log10(x)));
};

function niceNum(x: number, round: boolean): number {
	const e = Math.floor(Math.log10(x));
	const f = x / Math.pow(10, e);
	const n = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
	return n * Math.pow(10, e);
}

/** A "nice" scale over [lo, hi]: its ends are multiples of a round step, with 3 to 5 ticks where that can be had. */
export function niceScale(lo: number, hi: number): Scale {
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
		lo = 0;
		hi = 1;
	}
	if (lo > hi) [lo, hi] = [hi, lo];
	if (lo === hi) {
		if (lo === 0) hi = 1;
		else if (lo > 0) lo = 0;
		else hi = 0;
	}
	let best: Scale = { min: lo, max: hi, step: hi - lo, ticks: [lo, hi] };
	// a range so small or so large that no round step fits it keeps its own ends, never NaN or Infinity in a drawing
	if (!(hi - lo > 0) || !Number.isFinite(hi - lo)) return { min: 0, max: 1, step: 1, ticks: [0, 1] };
	for (const want of [4, 5, 3, 6, 2]) {
		const step = niceNum(niceNum(hi - lo, false) / (want - 1), true);
		const d = decimalsOf(step) + 1;
		const min = Number((Math.floor(lo / step + 1e-9) * step).toFixed(d));
		const max = Number((Math.ceil(hi / step - 1e-9) * step).toFixed(d));
		const ticks: number[] = [];
		for (let k = 0; k <= Math.round((max - min) / step) && k < 50; k++) ticks.push(Number((min + k * step).toFixed(d)));
		if (!(max > min) || !Number.isFinite(step) || ticks.length < 2) continue;
		best = { min, max, step, ticks };
		if (ticks.length >= 3 && ticks.length <= 5) break;
	}
	return best;
}

/** Where a line's y scale begins: zero when zero is within reach of the data, else a nice value under the smallest. */
export function lineDomain(values: readonly number[]): Scale {
	if (!values.length) return niceScale(0, 1);
	const lo = minOf(values);
	const hi = maxOf(values);
	return niceScale(lo >= 0 && lo < 0.6 * hi ? 0 : lo, hi);
}

/** Which of n labels to write along an axis so none overlaps: the first, then every step-th, then the last. */
export function thinLabels(n: number, plotW: number, labelW: number): number[] {
	if (n <= 0) return [];
	if (n === 1) return [0];
	const per = plotW / (n - 1);
	const step = Math.max(1, Math.ceil(labelW / Math.max(per, 0.0001)));
	const out: number[] = [];
	for (let i = 0; i <= n - 1 - step; i += step) out.push(i);
	if (out[out.length - 1] !== n - 1) out.push(n - 1);
	return out;
}
