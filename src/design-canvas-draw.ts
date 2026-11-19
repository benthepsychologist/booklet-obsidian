/*
 * The Design view's canvas: ONE PAGE of the booklet drawn as the reader sees it, with a thin "+" between its blocks. Plain functions over
 * a context the view hands in; nothing here owns state or writes the note (every press goes back to the view through `PageCtx`).
 *
 *   drawBlockBody  one block drawn as a reader sees it: words by Obsidian's renderer, a question or a reading callout inert (design-sample.ts),
 *                  and every block the view does not draw yet as a friendly CARD (its picture, its kind in words, one line of detail), never as
 *                  Markdown code. The two exceptions are text the reader cannot read, which is shown exactly as it is in the note, and the
 *                  records, which are named and left alone.
 *   drawPage       the page of a canvas (core/design-canvas.ts): its title, its blocks with a slot between each, its cards, and the blocks
 *                  after the cards, read-only. A selected block gets a small floating bar; a block open for editing gets the editor box.
 *   drawSlot, paintSlot   one "+" and how it looks: idle, lit (a picked piece may go here) or the target (the "+" a person clicked)
 *
 * Everything drawn of a question or a callout is inert: no handler, no live control (design-sample.ts says how). Nothing here fetches.
 */
import type { App, Component } from "obsidian";
import {
	DRAWN_QUESTIONS,
	hasRemoteMedia,
	isLaterKind,
	levelOf,
	moveTargets,
	nameOf,
	slotsOf,
	walkDesign,
	whyImmovable,
	whyUnchangeable,
	type Activity,
	type Canvas,
	type DesignKind,
	type DesignNode,
	type Question,
	type Slot,
} from "./core";
import { drawArt, drawIcon, artOf, type Art } from "./design-picture";
import { drawInertQuestion, drawInertReading, renderWords, type InertOptions } from "./design-sample";
import { uin, ui } from "./design-text";
import { EMPTY_KEY, clip, firstWords, kindName, plainOf, titledOf } from "./design-words";

/** What a drawing needs of the app and of the note. */
export interface Drawer {
	app: App;
	sourcePath: string;
	triplet: boolean;
}

/** A question the drawing code can draw: the parsed question and the activity it belongs to. */
export interface Found {
	activity: Activity;
	question: Question;
}

/** What a block is, as the drawing needs to know it: from the tree for a block of the note. */
export interface BlockFacts {
	kind: DesignKind;
	/** A question's kind (`choice`), a callout's kind (`tip`), a fence's info (`booklet query`). */
	detail: string;
	id: string | null;
	label: string;
	/** The block's own lines, without the `>` marks of the groups around it. */
	lines: readonly string[];
	/** An as-written block's lines exactly as the note has them (the `>` marks of its groups included). */
	written?: readonly string[];
	/** The parsed question, for a question. */
	found?: Found | null;
}

const inertOf = (d: Drawer, owner: Component, into: HTMLElement): InertOptions => ({ app: d.app, owner, sourcePath: d.sourcePath, into, triplet: d.triplet });

// ---------------------------------------------------------------- a block as a reader sees it, or as a card

/** The question kinds' pieces, for the picture of a question that is drawn as a card. */
const QUESTION_PIECE: Readonly<Record<string, string>> = {
	choice: "Q - choice.md",
	multi: "Q - multi.md",
	matrix: "Q - matrix.md",
	lines: "Q - lines.md",
	text: "Q - text.md",
	number: "Q - number.md",
	scale: "Q - scale.md",
	date: "Q - date.md",
	listen: "Q - listen.md",
	widget: "Q - widget (grid).md",
};

interface CardSpec {
	/** A drawn picture, or the names of an Obsidian icon. */
	art: Art | null;
	icons: readonly string[];
	kind: string;
	detail: string;
	note: string;
}

/** The `as:` of a query's lines (`bars`), "" when it has none. */
const viewOf = (lines: readonly string[]): string => lines.map((l) => /^\s*as:\s*(\S+)/i.exec(l)?.[1]).find(Boolean) ?? "";

const joined = (...parts: readonly (string | null | undefined)[]): string => parts.filter((p): p is string => !!p && p.trim() !== "").join(" · ");

/** The card of a block the view does not draw as a reader sees it. */
function cardOf(f: BlockFacts, why: "plain" | "later" | "remote"): CardSpec {
	const first = clip(plainOf(f.lines[0] ?? ""), 60);
	const named = joined(f.label.trim() || undefined, f.id ?? undefined);
	const note = why === "later" ? ui("draw.later.card") : why === "remote" ? ui("draw.remote.card") : "";
	switch (f.kind) {
		case "question":
			return { art: artOf({ file: QUESTION_PIECE[f.detail.toLowerCase()] ?? "", group: "questions" }), icons: [], kind: ui("kind.question"), detail: joined(f.detail, named), note };
		case "query": {
			const as = viewOf(f.lines);
			return { art: artOf({ file: "", group: "views", views: [as] }), icons: [], kind: ui("kind.query"), detail: joined(as, f.id ?? undefined), note: note || ui("draw.later.card") };
		}
		case "fence":
			return { art: null, icons: ["code-xml", "code", "square"], kind: ui("kind.fence"), detail: joined(f.detail, f.id ?? undefined), note };
		case "menu":
			return { art: artOf({ file: "Q - menu (shared list).md", group: "questions" }), icons: [], kind: ui("kind.menu"), detail: named, note };
		case "notice":
			return { art: artOf({ file: "Structure - notice.md", group: "structure" }), icons: [], kind: ui("kind.notice"), detail: clip(plainOf(f.lines[1] ?? ""), 60), note };
		case "records":
			return { art: null, icons: ["lock", "database"], kind: ui("kind.records"), detail: "", note: ui("card.records") };
		case "callout":
			if (f.detail.toLowerCase() === "copy") return { art: artOf({ file: "Reading - copy button.md", group: "reading" }), icons: [], kind: ui("place.copy"), detail: named || first, note };
			return { art: artOf({ file: "Reading - image.md", group: "reading" }), icons: [], kind: ui("kind.callout"), detail: first, note };
		default:
			return { art: null, icons: ["square"], kind: ui("level.block"), detail: first, note };
	}
}

function drawCardBody(into: HTMLElement, spec: CardSpec): void {
	const card = into.createDiv({ cls: "booklet-design-friendly", attr: { role: "group", "aria-label": spec.kind } });
	const picture = card.createDiv({ cls: "booklet-design-friendly-art" });
	if (spec.art) drawArt(picture, spec.art);
	else drawIcon(picture, spec.icons);
	const words = card.createDiv({ cls: "booklet-design-friendly-words" });
	words.createDiv({ cls: "booklet-design-friendly-kind", text: spec.kind });
	if (spec.detail) words.createDiv({ cls: "booklet-design-friendly-detail", text: spec.detail });
	if (spec.note) words.createDiv({ cls: "booklet-design-friendly-note", text: spec.note });
}

/**
 * One block drawn as a reader sees it. A question of a kind the drawing code draws, and a reading callout, are drawn inert; words are
 * rendered; a page break is a rule; a comment is a muted line; text the view cannot read is shown exactly as written; and the rest is a
 * card. Nothing is fetched: a callout that points at media on another site is a card.
 */
export function drawBlockBody(d: Drawer, owner: Component, into: HTMLElement, f: BlockFacts): void {
	const markdown = f.lines.join("\n");
	switch (f.kind) {
		case "prose": {
			const words = into.createDiv({ cls: "booklet-design-prose markdown-rendered" });
			renderWords(d.app, owner, markdown, words, d.sourcePath);
			return;
		}
		case "as-written": {
			// text the view cannot read is shown exactly as the note has it, `>` marks of any group around it included
			const raw = [...(f.written ?? f.lines)].map((l) => l.replace(/\r$/, ""));
			while (raw.length > 1 && !(raw[raw.length - 1] ?? "").trim()) raw.pop();
			const wrap = into.createDiv({ cls: "booklet-design-aswritten" });
			wrap.createDiv({ cls: "booklet-design-what", text: f.detail ? `${ui("card.asWritten")} ${f.detail}` : ui("card.asWritten") });
			wrap.createEl("pre", { cls: "booklet-design-lines", attr: { "aria-label": ui("card.lines") }, text: raw.join("\n") });
			return;
		}
		case "page-break": {
			const rule = into.createDiv({ cls: "booklet-design-pagebreak" });
			rule.createSpan({ cls: "booklet-design-pagebreak-label", text: kindWordsOf("page-break") });
			return;
		}
		case "comment": {
			const text = f.lines.map((l) => plainOf(l.replace(/^\s*(?:%%|<!--)|(?:%%|-->)\s*$/g, ""))).filter(Boolean).join(" ");
			into.createDiv({ cls: "booklet-design-comment", text: joined(kindWordsOf("comment"), clip(text, 90)) });
			return;
		}
		case "question": {
			const q = f.found;
			if (q && DRAWN_QUESTIONS.has(f.detail.toLowerCase())) {
				const host = into.createDiv({ cls: "booklet-design-drawn", attr: { role: "group", "aria-label": ui("draw.label") } });
				if (drawInertQuestion(inertOf(d, owner, host), q.activity, q.question)) return;
				host.remove();
			}
			const later = isLaterKind(f.detail) || (q?.question.each ?? null) !== null;
			drawCardBody(into, cardOf(f, later ? "later" : "plain"));
			return;
		}
		case "callout": {
			if (f.detail.toLowerCase() !== "copy") {
				if (hasRemoteMedia(markdown)) {
					drawCardBody(into, cardOf(f, "remote"));
					return;
				}
				const host = into.createDiv({ cls: "booklet-design-drawn", attr: { role: "group", "aria-label": ui("draw.label") } });
				drawInertReading(inertOf(d, owner, host), markdown);
				return;
			}
			drawCardBody(into, cardOf(f, "plain"));
			return;
		}
		case "query":
			drawCardBody(into, cardOf(f, "later"));
			return;
		default:
			drawCardBody(into, cardOf(f, "plain"));
	}
}

/** The kind's own name as the view says it, for a block that is not a level (`Page break`, `Comment`). */
function kindWordsOf(kind: "page-break" | "comment"): string {
	return ui(kind === "page-break" ? "kind.page-break" : "kind.comment");
}

// ---------------------------------------------------------------- slots

export type SlotMode = "idle" | "lit" | "target";

/** The words of a slot at the end of a container: what it adds there, by the kind of container. */
export function childSlotWords(holder: DesignNode): string {
	switch (holder.kind) {
		case "booklet":
			return ui("slot.child.module");
		case "module":
			return ui("slot.child.activity");
		case "activity":
		case "activity-tab":
			return ui("slot.child.page");
		default:
			return ui("slot.child.part");
	}
}

/** What a slot is called to a screen reader. */
export function slotLabel(slot: Slot, canvas: Canvas): string {
	return slot.where === "child" ? childSlotWords(canvas.holder) : ui("slot.add");
}

/** Where a slot is, in words: after the words of the block above it, at the start or at the end. */
export function whereWords(slot: Slot, text: string): string {
	if (slot.where === "start") return ui("where.start");
	if (slot.where === "between" && slot.after) return ui("where.after", { words: firstWords(text, slot.after, 40) || kindName(slot.after) });
	return ui("where.end");
}

/** One "+" slot: a real button, a faint line with a small plus that strengthens on hover or focus (the stylesheet), always there on a phone. */
export function drawSlot(parent: HTMLElement, slot: Slot, canvas: Canvas): HTMLButtonElement {
	const b = parent.createEl("button", {
		cls: ["booklet-design-slot", `is-${slot.where}`],
		attr: { type: "button", "data-slot": slot.id, "data-where": slot.where, "data-focus": `slot:${slot.id}`, "aria-label": slotLabel(slot, canvas), "aria-pressed": "false" },
	});
	b.createSpan({ cls: "booklet-design-slot-plus", text: "+", attr: { "aria-hidden": "true" } });
	b.createSpan({ cls: "booklet-design-slot-words" });
	return b;
}

/** How a slot looks and says: idle (a faint "+"), lit (the picked piece may go here) or the target (the "+" a person clicked). */
export function paintSlot(el: HTMLElement, mode: SlotMode, slot: Slot, canvas: Canvas): void {
	el.toggleClass("is-lit", mode === "lit");
	el.toggleClass("is-target", mode === "target");
	el.setAttribute("aria-pressed", String(mode === "target"));
	const words = el.querySelector(".booklet-design-slot-words");
	const label = slotLabel(slot, canvas);
	const shown = mode === "lit" ? ui("slot.place") : mode === "target" ? ui("slot.here") : "";
	if (words) words.textContent = slot.where === "child" && mode === "idle" ? label : shown;
	el.setAttribute("aria-label", mode === "idle" ? label : `${label}. ${shown}`);
}

// ---------------------------------------------------------------- the page

/** What the page asks of the view. */
export interface PageCtx extends Drawer {
	text: string;
	root: DesignNode;
	/** What owns every drawing of the page: unloaded at the next drawing. */
	owner: Component;
	bookletTitle: string;
	/** The note's own name, for the booklet when it has no title. */
	noteName: string;
	questionAt(line: number): Found | undefined;
	/** The editor is open on this node. */
	isOpen(n: DesignNode): boolean;
	pressBlock(n: DesignNode): void;
	openCard(n: DesignNode): void;
	/** Open a node's own lines in the editor (the page's title and the bar's Markdown button); `markdown`: with its Markdown section open and the focus in it. */
	editNode(n: DesignNode, markdown?: boolean): void;
	/** Move a block up or down: the place it goes to is worked out from the note as it is when the press is acted on, not from when the page was drawn. */
	move(n: DesignNode, dir: "up" | "down"): void;
	remove(n: DesignNode): void;
	/** The editor box, into a host. */
	drawEditor(host: HTMLElement, n: DesignNode): void;
	/** A block's own lines, and as-written text exactly as the note has it. */
	linesOf(n: DesignNode): string[];
	writtenOf(n: DesignNode): string[];
}

/** Every element a press can land on that is not the block's own: a press on one of them is that control's. */
const OWN_CONTROLS = "button, summary, a, input, textarea, select, .booklet-design-editbox, .booklet-design-floatbar";

const claimed = new WeakSet<Event>();

function iconButton(parent: HTMLElement, cls: string, icons: readonly string[], label: string, withWords: boolean): HTMLButtonElement {
	const b = parent.createEl("button", { cls: ["booklet-design-iconbutton", cls], attr: { type: "button", "aria-label": label, title: label } });
	const drew = drawIcon(b, icons);
	if (withWords || !drew) b.createSpan({ cls: "booklet-design-iconbutton-words", text: withWords ? "Markdown" : label });
	return b;
}

/**
 * The bar of a block or a card: Move up, Move down, Edit as Markdown (a block only) and Delete, where the view changes it at all. A selected
 * block's bar floats over its corner; a card's stands in the card, since a part of the booklet (a module, an activity, a tab, a page) has
 * no other place to be moved or deleted from.
 */
function drawBar(box: HTMLElement, n: DesignNode, ctx: PageCtx, card: boolean): void {
	const movable = !whyImmovable(n, "moved");
	const deletable = !whyImmovable(n, "deleted");
	if (!movable && !deletable) return;
	const name = titledOf(n, ctx.bookletTitle, ctx.noteName);
	const bar = box.createDiv({ cls: card ? "booklet-design-cardbar" : "booklet-design-floatbar", attr: { role: "toolbar", "aria-label": ui("bar.label", { name }) } });
	if (movable) {
		const to = moveTargets(n);
		const up = iconButton(bar, "booklet-design-up", ["arrow-up", "chevron-up"], ui("act.up"), false);
		const down = iconButton(bar, "booklet-design-down", ["arrow-down", "chevron-down"], ui("act.down"), false);
		up.disabled = !to.up;
		down.disabled = !to.down;
		up.addEventListener("click", () => ctx.move(n, "up"));
		down.addEventListener("click", () => ctx.move(n, "down"));
	}
	if (!card && !whyUnchangeable(n)) {
		const edit = iconButton(bar, "booklet-design-edit", ["pencil", "file-pen"], ui("form.editMarkdown"), true);
		edit.addEventListener("click", () => ctx.editNode(n, true));
	}
	if (deletable) {
		const del = iconButton(bar, "booklet-design-delete", ["trash-2", "trash"], ui("act.delete"), false);
		del.addEventListener("click", () => ctx.remove(n));
	}
}

function drawBlock(parent: HTMLElement, n: DesignNode, ctx: PageCtx, canvas: Canvas): HTMLElement {
	const selected = canvas.focus === n;
	const open = ctx.isOpen(n);
	const container = n.kind === "group" || n.kind === "row";
	const box = parent.createDiv({
		cls: ["booklet-design-block", `is-kind-${n.kind}`, ...(selected ? ["is-selected"] : []), ...(open ? ["is-open"] : [])],
		attr: { "data-kind": n.kind, "data-start": String(n.start), role: "group", "aria-label": titledOf(n, ctx.bookletTitle, ctx.noteName), tabindex: "0", "data-focus": `block:${n.kind}@${n.start}` },
	});
	// a press anywhere on a block that is not on a control of its own selects it, and opens it in place; of nested blocks, the innermost
	box.addEventListener("click", (evt) => {
		if (claimed.has(evt)) return;
		const hit = evt.target as Element | null;
		if (hit && typeof hit.closest === "function" && hit.closest(OWN_CONTROLS)) return;
		claimed.add(evt);
		ctx.pressBlock(n);
	});
	box.addEventListener("keydown", (evt) => {
		if (evt.target !== box || (evt.key !== "Enter" && evt.key !== " ")) return;
		evt.preventDefault();
		evt.stopPropagation();
		ctx.pressBlock(n);
	});
	if (selected) box.createSpan({ cls: "booklet-design-chip", text: kindName(n) });
	if (selected && !open) drawBar(box, n, ctx, false);
	if (open) ctx.drawEditor(box, n);

	if (container) {
		const head = box.createDiv({ cls: "booklet-design-group-head" });
		head.createSpan({ cls: "booklet-design-group-kind", text: kindName(n) });
		const name = nameOf(n);
		if (name) head.createSpan({ cls: "booklet-design-group-name", text: name });
		const body = box.createDiv({ cls: ["booklet-design-group-body", ...(n.kind === "row" ? ["is-row"] : [])] });
		const kids = n.children;
		if (!kids.length) body.createDiv({ cls: "booklet-design-empty", text: ui(n.kind === "row" ? "empty.row" : "empty.group") });
		for (const c of kids) drawBlock(body, c, ctx, canvas);
		return box;
	}
	// when the editor is open on a leaf, its box is the block (its words are fields drawn in place): the page does not draw it twice
	if (open) return box;
	drawBlockBody(ctx, ctx.owner, box, {
		kind: n.kind,
		detail: n.detail,
		id: n.id,
		label: n.label,
		lines: ctx.linesOf(n),
		written: n.kind === "as-written" ? ctx.writtenOf(n) : undefined,
		found: n.kind === "question" ? (ctx.questionAt(n.start) ?? null) : null,
	});
	return box;
}

// ---------------------------------------------------------------- cards

/** The first words of a container's own prose, as a card's description; "" when it has none. */
function descriptionOf(n: DesignNode, ctx: PageCtx): string {
	for (const c of n.children) if (c.kind === "prose") return firstWords(ctx.text, c, 110);
	return "";
}

interface Counts {
	tabs: number;
	pages: number;
	questions: number;
}

function countsOf(n: DesignNode): Counts {
	const out: Counts = { tabs: 0, pages: 0, questions: 0 };
	for (const x of walkDesign(n)) {
		if (x.kind === "module-tab" || x.kind === "activity-tab") out.tabs++;
		else if (x.kind === "page") out.pages++;
		else if (x.kind === "question") out.questions++;
	}
	return out;
}

function drawCard(parent: HTMLElement, n: DesignNode, ctx: PageCtx): void {
	const level = levelOf(n);
	const name = nameOf(n) || ui("card.untitled");
	const card = parent.createEl("article", { cls: ["booklet-design-card", `is-level-${level}`], attr: { "data-kind": n.kind, "data-start": String(n.start), "aria-label": `${kindName(n)}: ${name}` } });
	const body = card.createDiv({ cls: "booklet-design-card-body" });
	body.createDiv({ cls: "booklet-design-card-kind", text: kindName(n) });
	body.createDiv({ cls: "booklet-design-card-title", text: name });
	const desc = descriptionOf(n, ctx);
	if (desc) body.createDiv({ cls: "booklet-design-card-desc", text: desc });
	const counts = countsOf(n);
	const chips = body.createDiv({ cls: "booklet-design-card-chips" });
	if (counts.tabs) chips.createSpan({ cls: "booklet-design-chip-count", text: uin("card.tabs", counts.tabs) });
	if (counts.pages) chips.createSpan({ cls: "booklet-design-chip-count", text: uin("card.pages", counts.pages) });
	if (counts.questions) chips.createSpan({ cls: "booklet-design-chip-count", text: uin("card.questions", counts.questions) });
	// an activity that keeps what the reader enters says `repeat` on its line
	if (n.kind === "activity" && n.flags.includes("repeat")) chips.createSpan({ cls: ["booklet-design-chip-count", "is-keeps"], text: ui("card.keeps") });
	if (!chips.childElementCount) chips.remove();
	drawBar(card, n, ctx, true);
	const open = card.createEl("button", { cls: "booklet-design-card-open", text: ui("card.open"), attr: { type: "button", "aria-label": ui("card.open.label", { name }), "data-focus": `card:${n.kind}@${n.start}` } });
	open.addEventListener("click", () => ctx.openCard(n));
}

// ---------------------------------------------------------------- the page

/** The slots of a canvas, in order, with the element drawn for each. */
export interface DrawnPage {
	page: HTMLElement;
	slots: { slot: Slot; el: HTMLButtonElement }[];
}

/**
 * Draws a canvas into `parent`: the page's head (what it is and its title; a press on the title opens the container's own lines), its
 * blocks with a "+" slot above, between and below them, then its cards, the slot at the end of a container, and the blocks after the cards
 * (read-only, drawn as the note has them, with no slot).
 */
export function drawPage(parent: HTMLElement, canvas: Canvas, ctx: PageCtx): DrawnPage {
	const holder = canvas.holder;
	const level = levelOf(holder);
	const settings = canvas.focus?.kind === "front-matter";
	const page = parent.createDiv({ cls: ["booklet-design-page", `is-level-${level}`], attr: { "data-kind": holder.kind, "data-start": String(holder.start), role: "region", "aria-label": canvas.title } });
	const head = page.createDiv({ cls: "booklet-design-page-head" });
	head.createDiv({ cls: "booklet-design-page-kind", text: settings ? ui("form.heading") : canvas.firstPage ? ui("nav.firstPage") : kindName(holder) });
	const editable = !whyUnchangeable(holder) && !settings;
	if (editable) {
		const h = head.createEl("h1", { cls: "booklet-design-page-title" });
		const t = h.createEl("button", { cls: "booklet-design-page-titlebutton", text: canvas.title, attr: { type: "button", title: ui("page.edit.title") } });
		t.addEventListener("click", () => ctx.editNode(holder));
		const edit = head.createEl("button", { cls: "booklet-design-page-edit", text: ui("page.edit"), attr: { type: "button", "data-focus": "page-edit" } });
		edit.addEventListener("click", () => ctx.editNode(holder));
	} else head.createEl("h1", { cls: "booklet-design-page-title", text: canvas.title });

	// the page's own settings: the editor opened on its opening lines, or (for the booklet) on its front matter
	const front = canvas.focus?.kind === "front-matter" ? canvas.focus : null;
	if (ctx.isOpen(holder) && !front) ctx.drawEditor(page, holder);
	if (front) {
		if (ctx.isOpen(front)) ctx.drawEditor(page, front);
		else {
			const row = page.createDiv({ cls: "booklet-design-settings-row" });
			row.createSpan({ text: ui("settings.closed") });
			const b = row.createEl("button", { cls: "booklet-design-page-edit", text: ui("page.edit"), attr: { type: "button", "data-focus": "page-edit" } });
			b.addEventListener("click", () => ctx.editNode(front));
		}
	}

	const slots = slotsOf(canvas);
	const drawn: DrawnPage["slots"] = [];
	const put = (slot: Slot | undefined, into: HTMLElement): void => {
		if (slot) drawn.push({ slot, el: drawSlot(into, slot, canvas) });
	};
	const body = page.createDiv({ cls: "booklet-design-page-body" });
	const blockSlots = slots.filter((s) => s.where !== "child");
	if (!canvas.blocks.length) put(blockSlots[0], body);
	canvas.blocks.forEach((b, i) => {
		put(blockSlots[i], body);
		drawBlock(body, b, ctx, canvas);
	});
	if (canvas.blocks.length) put(blockSlots[canvas.blocks.length], body);

	if (canvas.cards.length) {
		const cards = page.createDiv({ cls: "booklet-design-cards", attr: { role: "list" } });
		for (const c of canvas.cards) drawCard(cards, c, ctx);
		put(slots.find((s) => s.where === "child"), page);
	}
	if (canvas.later.length) {
		// text left between the parts is kept, drawn as it is in the note and with no slot of its own
		const later = page.createDiv({ cls: "booklet-design-later" });
		for (const b of canvas.later) drawBlock(later, b, ctx, canvas);
	}
	const emptyKey = EMPTY_KEY[holder.kind];
	if (emptyKey && !canvas.cards.length && !canvas.blocks.length && !canvas.later.length) page.createDiv({ cls: "booklet-design-empty", text: ui(emptyKey) });
	return { page, slots: drawn };
}
