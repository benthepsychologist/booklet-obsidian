/*
 * Reading, drawn with Obsidian's own parts (SPEC sections 3 and 6): a callout that holds Booklet lines and a group (a
 * titled container, a fold when written `> [!group]- Title`), a row (cells side by side where there is room), the steps
 * of a part taken one at a time, and a footnote's mark with the source it leads to. What each of these keeps is the view's
 * and never the note's: which callout is folded, which step is on show, which source is open.
 */
import { setIcon } from "obsidian";
import { MARK_OPEN, MARK_CLOSE, noteFor, type Booklet, type CalloutBox, type Note, type Step } from "./core";

export interface ReadingHost {
	/** Inline or block Markdown, drawn by Obsidian. */
	md(markdown: string, el: HTMLElement): void;
	uid(): string;
}

/** The word a kind is called when its line has no title: `note` is "Note". */
const kindWord = (kind: string): string => kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase();

/** The icon Obsidian (or this plugin's styles, for the reading kinds) gives a callout kind, found in the theme's own variable. */
function iconOf(el: HTMLElement): string {
	const v = el.ownerDocument.defaultView?.getComputedStyle(el).getPropertyValue("--callout-icon").trim() ?? "";
	return v && /^[a-z0-9-]+$/i.test(v) ? v : "lucide-pencil";
}

/** What a folded callout is called when it has no title: the first words of what it holds. */
export function firstWords(box: CalloutBox): string {
	const words = (n: CalloutBox["children"][number]): string => {
		if (n.type === "prose") return n.markdown.replace(/^[#>\s-]+/gm, " ").replace(/\s+/g, " ").trim();
		if (n.type === "question") return n.title || n.id;
		if (n.type === "callout-box") return n.children.map(words).find(Boolean) ?? "";
		return "";
	};
	const w = box.children.map(words).find(Boolean) ?? "";
	return w.length > 80 ? `${w.slice(0, 79).trimEnd()}…` : w;
}

/**
 * Draws a callout that holds Booklet lines into `into`, and gives back where its body goes. `open` is whether a folded one
 * is open now and `toggled` is told when the reader opens or folds it, so a redrawing keeps what they chose.
 */
export function drawCallout(host: ReadingHost, into: HTMLElement, box: CalloutBox, open: boolean, toggled: (open: boolean) => void): HTMLElement {
	const kind = box.start.kind.toLowerCase();
	const group = kind === "group";
	const foldable = box.start.fold !== "";
	const bodyId = host.uid();
	const outer = into.createDiv({ cls: group ? "booklet-group" : "callout booklet-callout", attr: { "data-callout": kind, "data-booklet-callout": kind } });
	if (foldable) outer.addClass(group ? "is-foldable" : "is-collapsible");
	const head = outer.createDiv({ cls: group ? "booklet-group-title" : "callout-title" });
	if (!group) setIcon(head.createDiv({ cls: "callout-icon", attr: { "aria-hidden": "true" } }), iconOf(head));
	const words = box.start.title || (group ? (foldable ? firstWords(box) : "") : kindWord(kind));
	const label = head.createDiv({ cls: group ? "booklet-group-words markdown-rendered" : "callout-title-inner" });
	if (words) host.md(words, label);
	else if (!foldable) head.addClass("booklet-none");
	const body = outer.createDiv({ cls: group ? "booklet-group-body" : "callout-content", attr: { id: bodyId } });
	if (foldable) {
		const chevron = head.createDiv({ cls: group ? "booklet-fold-chevron" : "callout-fold", attr: { "aria-hidden": "true" } });
		head.setAttr("role", "button");
		head.setAttr("tabindex", "0");
		head.setAttr("aria-controls", bodyId);
		const show = (now: boolean) => {
			outer.toggleClass("is-collapsed", !now);
			body.hidden = !now;
			head.setAttr("aria-expanded", now ? "true" : "false");
			chevron.empty();
			setIcon(chevron, now ? "lucide-chevron-down" : "lucide-chevron-right");
		};
		let now = open;
		show(now);
		const flip = (evt: Event) => {
			// a link in the title is its own press
			if ((evt.target as HTMLElement | null)?.closest("a")) return;
			evt.preventDefault();
			now = !now;
			show(now);
			toggled(now);
		};
		head.addEventListener("click", flip);
		head.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === " ") flip(evt);
		});
	}
	return body;
}

/* ---- steps ---- */

/**
 * The steps of a part, every one drawn and the ones not on show only hidden, so no answer is lost on a step (as the
 * reference renderer does it). `draw` draws a step's nodes into its box. Returns the boxes and what shows the step on show.
 */
export function drawSteps(into: HTMLElement, steps: readonly Step[], at: number, done: (i: number) => boolean, draw: (el: HTMLElement, step: Step) => void): { show: (at: number) => void; box: (i: number) => HTMLElement | undefined } {
	const holder = into.createDiv({ cls: "booklet-steps" });
	const head = holder.createDiv({ cls: "booklet-steps-head" });
	const progress = head.createSpan({ cls: "booklet-steps-progress", attr: { role: "status" } });
	const dots = head.createSpan({ cls: "booklet-steps-dots", attr: { "aria-hidden": "true" } });
	const dotEls = steps.map(() => dots.createSpan({ cls: "booklet-steps-dot" }));
	const boxes = steps.map((s, i) => {
		const titled = !!s.group.start.title;
		const box = holder.createDiv({ cls: "booklet-step", attr: { tabindex: "-1", "data-booklet-step": String(i + 1) } });
		// a step with no title is named by its place
		if (!titled) {
			box.setAttr("role", "group");
			box.setAttr("aria-label", `Step ${i + 1} of ${steps.length}`);
		}
		draw(box, s);
		return box;
	});
	let shown = at;
	const show = (now: number) => {
		shown = Math.max(0, Math.min(steps.length - 1, now));
		boxes.forEach((b, i) => b.toggleAttribute("hidden", i !== shown));
		// set only when it changes: a status line read out again on every answer is noise to a screen reader
		const line = `Step ${shown + 1} of ${steps.length}`;
		if (progress.textContent !== line) progress.setText(line);
		dotEls.forEach((d, i) => {
			d.toggleClass("is-done", done(i));
			d.toggleClass("is-current", i === shown);
		});
	};
	show(at);
	return { show, box: (i) => boxes[i] };
}

/* ---- footnotes ---- */

const TOKEN = new RegExp(`${MARK_OPEN}(\\d+)${MARK_CLOSE}`, "g");

/** A date written `2026-09-20` in words, in the view's language. */
function longDate(iso: string): string {
	const d = new Date(`${iso}T00:00:00Z`);
	return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** What a footnote's mark leads to, drawn into `into`: its source, its place, its quotation and the date it was checked. */
export function drawSource(host: ReadingHost, into: HTMLElement, note: Note): void {
	const s = note.source;
	if (!s) {
		// not a citation: a plain reference, its words as written, with no quotation marks and no line about a missing source
		host.md(note.text, into.createDiv({ cls: "booklet-cite-plain markdown-rendered" }));
		return;
	}
	const src = into.createDiv({ cls: "booklet-cite-source" });
	src.createEl("cite", { text: s.title });
	if (s.detail) src.appendText(`, ${s.detail}`);
	if (s.page) into.createDiv({ cls: "booklet-cite-page", text: s.page });
	into.createEl("blockquote", { cls: "booklet-cite-quote", text: s.quote });
	if (s.verified) {
		const badge = into.createDiv({ cls: "booklet-cite-badge" });
		setIcon(badge.createSpan({ cls: "booklet-cite-badge-icon", attr: { "aria-hidden": "true" } }), "lucide-check");
		badge.createSpan({ text: `Verified ${longDate(s.verified)}` });
	}
}

export interface CiteScope {
	/** The module whose notes a mark is read in ("" for the bare activities). */
	scope: string;
	notes: Pick<Booklet, "notes">;
	numbers: Map<string, number>;
}

/**
 * Swaps the tokens `tokenise` left in the rendered text of `el` for numbered marks. A mark whose note is not in the file is
 * drawn as it was written, flagged. One panel is open at a time in a view: `panel` holds it.
 */
export function drawMarks(host: ReadingHost, el: HTMLElement, ids: readonly string[], cite: CiteScope | null, panel: { open: { mark: HTMLElement; el: HTMLElement } | null }): void {
	const doc = el.ownerDocument;
	const walker = doc.createTreeWalker(el, 4);
	const texts: Text[] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes(MARK_OPEN) && !(n.parentElement?.closest("code, pre"))) texts.push(n as Text);
	for (const t of texts) {
		const parts = t.data.split(TOKEN);
		const frag = doc.createDocumentFragment();
		parts.forEach((part, n) => {
			if (n % 2 === 0) {
				if (part) frag.appendChild(doc.createTextNode(part));
				return;
			}
			const id = ids[Number(part)] ?? "";
			const note = cite ? noteFor(cite.notes, cite.scope, id) : undefined;
			const num = cite?.numbers.get(id);
			// a mark where there are no sources to number it (the booklet's opening, a title) is left out
			if (!cite) return;
			const sup = doc.createElement("sup");
			sup.className = "booklet-cite";
			if (!note || num === undefined) {
				const bad = sup.createSpan({ cls: "booklet-cite-broken", text: `[?${id}]` });
				bad.setAttr("title", `No footnote for ${id} in this module`);
				frag.appendChild(sup);
				return;
			}
			const button = sup.createEl("button", { cls: "booklet-cite-mark", text: String(num), attr: { "aria-label": `Source ${num}`, "aria-expanded": "false", "data-booklet-cite": id } });
			button.addEventListener("click", (evt) => {
				evt.preventDefault();
				toggle(host, button, note, num, panel);
			});
			// Escape shuts the source its mark opened, from the mark as from inside the source
			button.addEventListener("keydown", (evt) => {
				if (evt.key !== "Escape" || panel.open?.mark !== button) return;
				evt.preventDefault();
				evt.stopPropagation();
				closePanel(panel);
			});
			frag.appendChild(sup);
		});
		t.replaceWith(frag);
	}
}

function closePanel(panel: { open: { mark: HTMLElement; el: HTMLElement } | null }): void {
	if (!panel.open) return;
	panel.open.el.remove();
	panel.open.mark.setAttr("aria-expanded", "false");
	panel.open = null;
}

/**
 * A mark pressed: its source opens under the block it is in (a second press, or Escape, shuts it). Where the block is a
 * list item the source goes inside the item, after its content, and where it is a table cell it goes in a row of its own
 * under the cell's row, across the table: a `div` beside an `li` or a `td` would be a child its parent cannot have.
 */
function toggle(host: ReadingHost, mark: HTMLElement, note: Note, num: number, panel: { open: { mark: HTMLElement; el: HTMLElement } | null }): void {
	const was = panel.open?.mark === mark;
	closePanel(panel);
	if (was) return;
	const block = mark.closest("p, li, blockquote, td, th, h1, h2, h3, h4, h5, h6") ?? mark.parentElement;
	if (!block) return;
	const el = mark.ownerDocument.createElement("div");
	el.className = "booklet-cite-panel";
	el.setAttribute("role", "region");
	el.setAttribute("aria-label", `Source ${num}`);
	let put: Element = el;
	if (block.matches("li")) block.appendChild(el);
	else if (block.matches("td, th") && block.closest("tr")) {
		const tr = block.closest("tr") as HTMLTableRowElement;
		put = mark.ownerDocument.createElement("tr");
		put.className = "booklet-cite-row";
		put.appendChild(mark.ownerDocument.createElement("td")).setAttribute("colspan", String(tr.children.length));
		(put.firstElementChild as Element).appendChild(el);
		tr.insertAdjacentElement("afterend", put);
	} else block.insertAdjacentElement("afterend", el);
	drawSource(host, el, note);
	const close = el.createEl("button", { cls: "booklet-cite-close", text: "Close", attr: { "aria-label": `Close source ${num}` } });
	close.addEventListener("click", (evt) => {
		evt.preventDefault();
		closePanel(panel);
		mark.focus();
	});
	el.addEventListener("keydown", (evt) => {
		if (evt.key !== "Escape") return;
		evt.preventDefault();
		evt.stopPropagation();
		closePanel(panel);
		mark.focus();
	});
	mark.setAttr("aria-expanded", "true");
	panel.open = { mark, el: put as HTMLElement };
}
