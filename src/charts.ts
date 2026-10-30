/*
 * A chart drawn (SPEC section 6, "bars" and "line"), from the numbers and words core/chart.ts works out. Plain SVG made with
 * createSvg: every number a drawing needs is an attribute (a viewBox, a position, a width), and every colour, dash and font
 * is a class that reads Obsidian's own variables, so the reader's theme and light or dark recolour it and nothing here
 * writes a style or a string of HTML. A chart names itself with a hidden line of text that it points at with
 * `aria-labelledby`, never with `aria-label` (Obsidian turns that into a hover tooltip, and its tooltip code threw on an
 * svg that carried one). The same numbers are always under a closed "Show the numbers" as a table, so nothing is shown only
 * as a picture; a chart that cannot be drawn says why in one plain sentence in its place.
 */
import { QUERY_WORDS, lineDomain, maxOf, minOf, niceScale, thinLabels, type Chart } from "./core";

/** The line chart's markers, one shape for each series (so two lines differ by more than colour). */
const MARKERS = ["circle", "square", "triangle", "diamond"] as const;
/** How many series colours there are before they cycle (CSS: .booklet-ch-s0 to s5). */
const SERIES = 6;

let counter = 0;
/** A fresh id for a chart's hidden name. */
const nextId = (): string => `booklet-ch-name-${++counter}`;

/** Obsidian's createSvg takes a class as one name or a list: a string with a space in it throws (found in real Obsidian 1.14.5). So a class here is a list. */
function sv(parent: Node, tag: string, o: { cls?: string[]; attr?: Record<string, string> }): SVGElement {
	return parent.createSvg(tag as "svg", { cls: o.cls, attr: o.attr }) as SVGElement;
}

const num = (x: number): string => String(Math.round(x * 100) / 100);

/** The table behind a chart, closed until asked for. */
function numbers(into: HTMLElement, c: Chart): void {
	const d = into.createEl("details", { cls: "booklet-ch-nums" });
	d.createEl("summary", { text: QUERY_WORDS.chart.numbers });
	const t = d.createDiv({ cls: "booklet-q-wrap" }).createEl("table", { cls: "booklet-q-table" });
	const head = t.createEl("thead").createEl("tr");
	c.table.head.forEach((h, i) => head.createEl("th", { cls: i ? "booklet-q-num" : "", text: h, attr: { scope: "col" } }));
	const body = t.createEl("tbody");
	for (const row of c.table.rows) {
		const tr = body.createEl("tr");
		row.forEach((x, i) => tr.createEl("td", { cls: i ? "booklet-q-num" : "", text: x }));
	}
}

/* ---- bars ---- */

function bars(into: HTMLElement, c: Chart): void {
	const vals = c.series[0]?.values ?? [];
	const nums = vals.filter((x): x is number => x !== null);
	// always from zero, on a round scale: a negative value runs left of the zero line
	const sc = niceScale(Math.min(0, minOf(nums)), Math.max(0, maxOf(nums)));
	const span = sc.max - sc.min;
	const zero = ((0 - sc.min) / span) * 100;
	const nameId = nextId();
	const root = into.createDiv({ cls: "booklet-ch booklet-ch-bars", attr: { role: "group", "aria-labelledby": nameId } });
	root.createSpan({ cls: "booklet-sr", attr: { id: nameId }, text: c.name });
	const ul = root.createEl("ul", { cls: "booklet-ch-barlist" });
	c.labels.forEach((label, i) => {
		const v = vals[i] ?? null;
		const tone = c.tones[i] ?? null;
		const li = ul.createEl("li", { cls: "booklet-ch-row" });
		li.createSpan({ cls: "booklet-ch-l", text: label });
		const track = sv(li, "svg", { cls: ["booklet-ch-track"], attr: { viewBox: "0 0 100 10", preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" } });
		if (sc.min < 0) sv(track, "line", { cls: ["booklet-ch-zero"], attr: { x1: num(zero), x2: num(zero), y1: "0", y2: "10" } });
		if (v !== null && v !== 0) {
			const w = Math.max(Math.abs(v) / span * 100, 0.6);
			const x = v < 0 ? zero - w : zero;
			sv(track, "rect", { cls: tone ? ["booklet-ch-bar", `booklet-tone-${tone}`] : ["booklet-ch-bar"], attr: { x: num(x), y: "1", width: num(w), height: "8" } });
		}
		li.createSpan({ cls: "booklet-ch-v", text: v === null ? "–" : c.fmt(v) });
		if (tone) li.createSpan({ cls: "booklet-sr", text: ` (${QUERY_WORDS.tone[tone] ?? tone})` });
	});
	if (c.note) root.createEl("p", { cls: "booklet-muted booklet-ch-note", text: c.note });
}

/* ---- line ---- */

function marker(parent: SVGElement, i: number, x: number, y: number, r: number, cls: string[]): SVGElement {
	const shape = MARKERS[i % MARKERS.length]!;
	if (shape === "circle") return sv(parent, "circle", { cls, attr: { cx: num(x), cy: num(y), r: num(r) } });
	if (shape === "square") return sv(parent, "rect", { cls, attr: { x: num(x - r), y: num(y - r), width: num(2 * r), height: num(2 * r) } });
	const pts = shape === "triangle" ? `${num(x)},${num(y - r - 1)} ${num(x + r + 1)},${num(y + r)} ${num(x - r - 1)},${num(y + r)}` : `${num(x)},${num(y - r - 1)} ${num(x + r + 1)},${num(y)} ${num(x)},${num(y + r + 1)} ${num(x - r - 1)},${num(y)}`;
	return sv(parent, "polygon", { cls, attr: { points: pts } });
}

/** A label cut to 14 characters, as the reference cuts the along-the-bottom labels. */
const clip = (s: string, n = 14): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function line(into: HTMLElement, c: Chart): void {
	const root = into.createDiv({ cls: "booklet-ch booklet-ch-line" });
	const n = c.labels.length;
	if (c.series.length > 1) {
		// the legend: a sample of each line (its colour, dash and marker shape), then its name
		const lg = root.createEl("ul", { cls: "booklet-ch-legend" });
		c.series.forEach((s, i) => {
			const li = lg.createEl("li");
			const sw = sv(li, "svg", { cls: ["booklet-ch-sw"], attr: { viewBox: "0 0 28 12", width: "28", height: "12", "aria-hidden": "true", focusable: "false" } });
			sv(sw, "line", { cls: ["booklet-ch-path", `booklet-ch-s${i % SERIES}`], attr: { x1: "2", x2: "26", y1: "6", y2: "6" } });
			marker(sw, i, 14, 6, 3, ["booklet-ch-pt", `booklet-ch-s${i % SERIES}`]);
			li.createSpan({ text: s.name });
		});
	}
	const nameId = nextId();
	root.createSpan({ cls: "booklet-sr", attr: { id: nameId }, text: c.name });
	const plot = root.createDiv({ cls: "booklet-ch-plot" });
	const readout = root.createDiv({ cls: "booklet-ch-readout", attr: { "aria-live": "polite" } });
	readout.setText(QUERY_WORDS.chart.readout);
	let active = -1;
	let drawnW = 0;
	const all = c.series.flatMap((s) => s.values).filter((x): x is number => x !== null);

	const draw = (w: number): void => {
		plot.empty();
		const W = Math.max(240, Math.round(w || 640));
		drawnW = w;
		const H = Math.round(Math.min(340, Math.max(200, W * 0.42)));
		const sc = lineDomain(all);
		const yw = maxOf(sc.ticks.map((t) => c.fmt(t).length)) * 7 + 10;
		const lw = Math.min(14, Math.max(1, maxOf(c.labels.map((l) => l.length)))) * 6.6 + 10;
		const L = Math.max(yw, 10);
		const R = Math.max(10, Math.ceil(lw / 2));
		const padTop = 12;
		const B = 30;
		const x0 = Math.max(L + 8, Math.ceil(lw / 2));
		const x1 = W - R;
		const pw = Math.max(x1 - x0, 1);
		const ph = H - padTop - B;
		const X = (i: number): number => (n === 1 ? (x0 + x1) / 2 : x0 + (i * pw) / (n - 1));
		const Y = (t: number): number => padTop + ph - ((t - sc.min) / (sc.max - sc.min)) * ph;
		const svg = sv(plot, "svg", { cls: ["booklet-ch-svg"], attr: { viewBox: `0 0 ${W} ${H}`, width: String(W), height: String(H), role: "img", tabindex: "0", "aria-labelledby": nameId, focusable: "true" } });
		for (const t of sc.ticks) {
			sv(svg, "line", { cls: [t === sc.min ? "booklet-ch-axis" : "booklet-ch-grid"], attr: { x1: num(L), x2: num(W - R + 2), y1: num(Y(t)), y2: num(Y(t)) } });
			sv(svg, "text", { cls: ["booklet-ch-tick"], attr: { x: num(L - 6), y: num(Y(t) + 4), "text-anchor": "end" } }).textContent = c.fmt(t);
		}
		for (const i of thinLabels(n, pw, lw)) sv(svg, "text", { cls: ["booklet-ch-tick"], attr: { x: num(X(i)), y: num(H - B + 17), "text-anchor": "middle" } }).textContent = clip(c.labels[i] ?? "");
		// the dotted line that marks the point being read: off until one is read (an svg element has no `hidden`, so a class hides it)
		const guide = sv(svg, "line", { cls: ["booklet-ch-guide", "is-off"], attr: { x1: "0", x2: "0", y1: String(padTop), y2: String(padTop + ph) } });
		const dots: (SVGElement | undefined)[][] = c.series.map(() => []);
		c.series.forEach((s, si) => {
			// one polyline for each unbroken run of numbers: a value that is not a number is a gap
			let run: string[] = [];
			const flush = (): void => {
				if (run.length > 1) sv(svg, "polyline", { cls: ["booklet-ch-path", `booklet-ch-s${si % SERIES}`], attr: { points: run.join(" ") } });
				run = [];
			};
			s.values.forEach((v, i) => {
				if (v === null) return flush();
				run.push(`${num(X(i))},${num(Y(v))}`);
			});
			flush();
			s.values.forEach((v, i) => {
				if (v !== null) dots[si]![i] = marker(svg, si, X(i), Y(v), 3.5, ["booklet-ch-pt", `booklet-ch-s${si % SERIES}`]);
			});
		});
		const show = (i: number): void => {
			active = i;
			guide.toggleClass("is-off", false);
			guide.setAttr("x1", num(X(i)));
			guide.setAttr("x2", num(X(i)));
			dots.forEach((col) => col.forEach((el, k) => el?.toggleClass("is-active", k === i)));
			readout.setText(`${c.labels[i]}: ` + c.series.map((s) => `${s.name}${s.name ? " " : ""}${s.values[i] === null ? "–" : c.fmt(s.values[i]!)}`).join(" · "));
		};
		// one tall band for each point catches a finger or a pointer anywhere in its column (there is no hover on a phone)
		const band = n === 1 ? pw : pw / (n - 1);
		for (let i = 0; i < n; i++) {
			const b = sv(svg, "rect", { cls: ["booklet-ch-hit"], attr: { x: num(X(i) - band / 2), y: String(padTop), width: num(band), height: num(ph) } });
			b.addEventListener("pointerenter", () => show(i));
			b.addEventListener("click", () => show(i));
		}
		svg.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "ArrowRight") show(Math.min(n - 1, active + 1));
			else if (e.key === "ArrowLeft") show(Math.max(0, active < 0 ? 0 : active - 1));
			else if (e.key === "Home") show(0);
			else if (e.key === "End") show(n - 1);
			else return;
			e.preventDefault();
		});
		if (active >= 0) show(Math.min(active, n - 1));
	};
	draw(plot.clientWidth);
	if (typeof ResizeObserver === "function") {
		const watch = new ResizeObserver(() => {
			if (!plot.isConnected) return watch.disconnect();
			const w = plot.clientWidth;
			if (w > 0 && Math.abs(w - drawnW) >= 4) draw(w);
		});
		watch.observe(plot);
	}
	if (c.note) root.createEl("p", { cls: "booklet-muted booklet-ch-note", text: c.note });
}

/** Draws a chart into `into`: bars or a line, its note under it, and the numbers behind it; or, when it cannot be drawn, why, in its place. */
export function drawChart(into: HTMLElement, c: Chart): void {
	if (c.cannot) into.createEl("p", { cls: "booklet-muted booklet-ch-cannot", text: c.cannot });
	else if (c.kind === "bars") bars(into, c);
	else line(into, c);
	numbers(into, c);
}
