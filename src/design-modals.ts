/*
 * The Design view's one question: before a delete, a move or a change that would leave kept data not matching (or the reader unable to
 * open the booklet), what it touches, with counts, and a yes or a no. A person may delete her own work freely, so this never blocks: it says, and asks. The answer is a promise that
 * settles when the dialog closes (Escape and a click outside are no).
 */
import { Modal, type App } from "obsidian";
import { impactWords, type Impact } from "./core";
import { ui } from "./design-text";

export interface Ask {
	/** "delete", "move" or "change": the words of the title and the yes button. */
	how: "delete" | "move" | "change";
	/** The kind of block, in words ("Module"). */
	kind: string;
	/** What it is called, quoted ("Money"). */
	name: string;
	/** How many lines of the note it takes with it, in words ("12 lines"); "" for a change, which rewrites only some of a block's lines. */
	lines: string;
	impacts: Impact[];
	/** The reader could not open the note, so nothing was counted. */
	blind: boolean;
	/** Other things the change leaves, in words (core's notes). */
	notes: string[];
}

const TITLE = { delete: "confirm.title.delete", move: "confirm.title.move", change: "confirm.title.change" } as const;
const LEAD = { delete: "confirm.lead.delete", move: "confirm.lead.move", change: "confirm.lead.change" } as const;
const YES = { delete: "confirm.yes.delete", move: "confirm.yes.move", change: "confirm.yes.change" } as const;

class AskDesign extends Modal {
	private done = false;

	constructor(
		app: App,
		private readonly ask: Ask,
		private readonly settle: (yes: boolean) => void,
	) {
		super(app);
	}

	override onOpen(): void {
		const a = this.ask;
		this.setTitle(ui(TITLE[a.how], { kind: a.kind.toLowerCase() }));
		this.modalEl.addClass("booklet-design-ask-card");
		const el = this.contentEl;
		el.addClass("booklet-design-ask");
		el.createEl("p", { text: ui(LEAD[a.how], { name: a.name }) + (a.lines ? ` (${a.lines})` : "") });
		if (a.blind) el.createEl("p", { text: ui("confirm.blind") });
		else if (a.impacts.length) {
			el.createEl("p", { text: ui("confirm.touches") });
			const list = el.createEl("ul");
			for (const i of a.impacts) list.createEl("li", { text: impactWords(i) });
			el.createEl("p", { text: ui("confirm.stays") });
		}
		if (a.notes.length) {
			el.createEl("p", { text: ui("confirm.notes") });
			const list = el.createEl("ul");
			for (const n of a.notes) list.createEl("li", { text: n });
		}
		el.createEl("p", { text: ui("confirm.undo") });
		const buttons = el.createDiv({ cls: "modal-button-container" });
		const yes = buttons.createEl("button", { text: ui(YES[a.how]), cls: "mod-warning" });
		const no = buttons.createEl("button", { text: ui("confirm.no") });
		yes.addEventListener("click", () => this.finish(true));
		no.addEventListener("click", () => this.finish(false));
		// Obsidian puts the focus on the first button when a dialog opens: Cancel is the one to start on
		window.setTimeout(() => no.focus(), 0);
	}

	private finish(yes: boolean): void {
		if (this.done) return;
		this.done = true;
		this.settle(yes);
		this.close();
	}

	override onClose(): void {
		this.contentEl.empty();
		// Escape, or a click outside, is no
		this.finish(false);
	}
}

/** Asks before a delete, a move or a change that reports kept data it would leave not matching (or a booklet the reader could not open); true when she said yes. */
export function askDesign(app: App, ask: Ask): Promise<boolean> {
	return new Promise((resolve) => new AskDesign(app, ask, resolve).open());
}
