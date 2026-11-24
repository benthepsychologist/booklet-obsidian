/*
 * A figure placed by reference, as a picker in the Design view's box: the embed `![[#^id]]` in the words of a prose block, and the diagram
 * it names, a ```mermaid fence in the data section with `^id` on the line after the fence (SPEC section 6, "Figures: diagrams placed by
 * reference"). Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * The picker offers the diagrams the page can see, by the rule of SPEC section 3, "Where data goes": the module's own fence, then its own
 * data section, then the shared data section, never another module's fence or data section. Only a fence whose info is `mermaid` is a
 * diagram here (a widget's or a data block's fence has an id too, and is no figure). A change rewrites the id in the embed and nothing
 * else; the diagram's own text is not edited here. An id the note holds that no diagram has is kept as written and said to be missing, and
 * is changed only when something else is chosen for it.
 */
import { inertLines, inertSpans } from "./blocks";
import { blockLines, changeLines } from "./design-ops";
import { moduleOf } from "./design-scope";
import type { DesignNode } from "./design-tree";
import { FENCE_OPEN } from "./lines";
import { parseBooklet } from "./reader";

export interface FigureEmbed {
	index: number;
	/** The index among the block's lines of the line it is on, and its span in that line. */
	line: number;
	from: number;
	to: number;
	/** The block id it names. */
	id: string;
}

export interface Figures {
	embeds: FigureEmbed[];
	/** Block embeds in the words that are not `![[#^id]]` (they name a file, or say more after the id): they stay as written. */
	other: number;
}

const SIMPLE = /!\[\[#\^([A-Za-z0-9-]+)\]\]/g;
const ANY = /!\[\[[^\]]*#\^[^\]]*\]\]/g;

/** The figure embeds in these lines of a prose block, in reading order, and the count of block embeds in another shape. */
export function figuresIn(lines: readonly string[]): Figures {
	const inert = inertLines(lines);
	const embeds: FigureEmbed[] = [];
	let other = 0;
	for (let i = 0; i < lines.length; i++) {
		if (inert[i]) continue;
		const l = inertSpans(lines[i] ?? "");
		const simple: [number, number][] = [];
		for (const m of l.matchAll(SIMPLE)) {
			const from = m.index ?? 0;
			simple.push([from, from + m[0].length]);
			embeds.push({ index: embeds.length, line: i, from, to: from + m[0].length, id: m[1] ?? "" });
		}
		for (const m of l.matchAll(ANY)) if (!simple.some(([a]) => a === m.index)) other++;
	}
	return { embeds, other };
}

export interface Diagram {
	id: string;
	/** The module whose fence or data section it is in, or null for the shared one. */
	module: string | null;
	/** The line its fence starts on (0-based). */
	line: number;
}

/**
 * The diagrams a prose block can embed, in the order the reader looks for them: those of its own module first, then the shared ones, each
 * id once (the first is the one the reader draws). A note the reader cannot open has none.
 */
export function diagramsFor(text: string, node: DesignNode): Diagram[] {
	const book = parseBooklet(text);
	const raw = text.split("\n");
	const mine = moduleOf(node);
	const all: Diagram[] = [];
	for (const b of book.blocks) {
		const open = FENCE_OPEN.exec((raw[b.line - 1] ?? "").replace(/\r$/, ""));
		if (!open || (open[2] ?? "").trim().split(/\s+/)[0]?.toLowerCase() !== "mermaid") continue;
		all.push({ id: b.id, module: b.module, line: b.line - 1 });
	}
	const seen = new Set<string>();
	const out: Diagram[] = [];
	for (const d of [...all.filter((x) => mine !== null && x.module === mine), ...all.filter((x) => x.module === null)]) {
		if (seen.has(d.id)) continue;
		seen.add(d.id);
		out.push(d);
	}
	return out;
}

type Made = { ok: true; text: string } | { ok: false; reason: string };
const no = (reason: string): Made => ({ ok: false, reason });

/**
 * The note's text with one figure embed pointing at another diagram: the id in the embed is rewritten and every other byte stays. Refused,
 * with a reason and nothing changed, when there is no such embed, when the diagram is not one the page can see, or when the block read
 * again would not hold exactly that change.
 */
export function changeFigure(text: string, node: DesignNode, index: number, id: string): Made {
	if (node.kind !== "prose") return no("Only words hold a figure here.");
	const lines = blockLines(text, node);
	const now = figuresIn(lines);
	const e = now.embeds[index];
	if (!e) return no("There is no such figure in these words.");
	if (id === e.id) return { ok: true, text };
	if (!diagramsFor(text, node).some((d) => d.id === id)) return no("That is not a diagram this page can see: the module's own, or one every module shares.");
	const out = lines.map((l, i) => (i === e.line ? l.slice(0, e.from) + `![[#^${id}]]` + l.slice(e.to) : l));
	const op = changeLines(text, node, out);
	if (!op.ok) return no(op.reason);
	const again = figuresIn(blockLines(op.text, node));
	if (again.other !== now.other || again.embeds.length !== now.embeds.length || again.embeds.some((x) => x.id !== (x.index === index ? id : (now.embeds[x.index]?.id ?? ""))))
		return no("The figure would be read as something else, so it is not written.");
	return { ok: true, text: op.text };
}
