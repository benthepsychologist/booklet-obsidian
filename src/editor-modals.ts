/*
 * The panel's two dialogs: the question before a change that would detach kept data (Change or Cancel, with the counts), and the
 * icon picker (the names of Booklet's icon set, drawn, searchable). Each opens, and gives back a promise that settles when it closes.
 */
import { Modal, setIcon, type App } from "obsidian";
import { BOOKLET_ICONS } from "./booklet-icons";
import { BLIND, impactWords, type Impact } from "./core/editor-guard";

class AskToChange extends Modal {
	private done = false;

	constructor(
		app: App,
		private readonly impacts: Impact[],
		private readonly blind: boolean,
		private readonly settle: (change: boolean) => void,
	) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle("Change this?");
		const el = this.contentEl;
		el.addClass("booklet-blocks-ask");
		if (this.blind) el.createEl("p", { text: BLIND });
		else {
			el.createEl("p", { text: "This change would leave kept data in this booklet not matching what it was kept for:" });
			const list = el.createEl("ul");
			for (const i of this.impacts) list.createEl("li", { text: impactWords(i) });
			el.createEl("p", { text: "The kept entries, answers and rows stay in the note as they are. The panel does not delete or rewrite them." });
		}
		const buttons = el.createDiv({ cls: "modal-button-container" });
		const change = buttons.createEl("button", { text: "Change", cls: "mod-warning", attr: { "aria-label": "Change it, and leave the kept data not matching" } });
		const cancel = buttons.createEl("button", { text: "Cancel", attr: { "aria-label": "Cancel, and leave the note as it is" } });
		change.addEventListener("click", () => this.finish(true));
		cancel.addEventListener("click", () => this.finish(false));
		// Obsidian puts the focus on the first button when a dialog opens: Cancel is the one to start on
		window.setTimeout(() => cancel.focus(), 0);
	}

	private finish(change: boolean): void {
		if (this.done) return;
		this.done = true;
		this.settle(change);
		this.close();
	}

	override onClose(): void {
		this.contentEl.empty();
		// Escape, or a click outside, is Cancel
		this.finish(false);
	}
}

/** Asks before a change that would detach kept data, or (`blind`) that cannot be counted because the reader refuses the booklet; true when she chose Change. */
export function askToChange(app: App, impacts: Impact[], blind = false): Promise<boolean> {
	return new Promise((resolve) => new AskToChange(app, impacts, blind, resolve).open());
}

class IconPicker extends Modal {
	private done = false;

	constructor(
		app: App,
		private readonly current: string,
		private readonly settle: (icon: string | null) => void,
	) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle("Choose an icon");
		const el = this.contentEl;
		el.addClass("booklet-blocks-icons");
		const search = el.createEl("input", { type: "text", cls: "booklet-blocks-icon-search", attr: { "aria-label": "Search the icons", placeholder: "Search the icons" } });
		const none = el.createEl("button", { text: "No icon", attr: { "aria-label": "No icon: take the icon off this line" } });
		none.addEventListener("click", () => this.finish(""));
		const grid = el.createDiv({ cls: "booklet-blocks-icon-grid", attr: { role: "group", "aria-label": "Icons" } });
		const buttons: { name: string; el: HTMLButtonElement }[] = [];
		for (const name of [...BOOKLET_ICONS].sort()) {
			const b = grid.createEl("button", { cls: "booklet-blocks-icon", attr: { "aria-label": name, title: name } });
			setIcon(b, name);
			if (name === this.current) b.addClass("is-current");
			b.addEventListener("click", () => this.finish(name));
			buttons.push({ name, el: b });
		}
		search.addEventListener("input", () => {
			const q = search.value.trim().toLowerCase();
			for (const b of buttons) b.el.toggleClass("booklet-blocks-hidden", !!q && !b.name.includes(q));
		});
		search.focus();
	}

	private finish(icon: string | null): void {
		if (this.done) return;
		this.done = true;
		this.settle(icon);
		this.close();
	}

	override onClose(): void {
		this.contentEl.empty();
		this.finish(null);
	}
}

/** The icon chosen (a name, or "" for none), or null when she closed the dialog without choosing. */
export function pickIcon(app: App, current: string): Promise<string | null> {
	return new Promise((resolve) => new IconPicker(app, current, resolve).open());
}
