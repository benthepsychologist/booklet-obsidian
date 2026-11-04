/*
 * SPIKE (plugin 0.13.0, lane M): the allow card built on Obsidian's own `Modal` instead of by hand. It offers what src/allow-card.ts offers
 * (same triggers, same three scopes, same callbacks to the view, same words) and drops what the Modal does for it: the keydown handler for
 * Escape, the Tab loop, the backdrop, the removal of the card, the focus-regain timers. This file is NOT part of the build; it is copied
 * over src/allow-card.ts for a measuring build only (e2e-tests/spikes/modal-0130/README in docs/modal-0130.md). `app` is the one new option.
 */
import { Modal, type App } from "obsidian";
import { alsoCovers, hostList, normaliseEntry } from "./core";
import type { MediaAllows } from "./settings";

/** The spike builds with these on; the "plain" build turns them off to show what the Modal exposes by itself. */
const ADD_ARIA = true;
const ADD_REGAIN = false;

export type CardRequest =
	/** A press on media from a site not allowed. `host` is what will be asked for it (a host, or a service with its hosts), `entry` the site that would be allowed. `once` plays that one piece and keeps nothing. `again` is told, with the press, when the site is allowed for this note or this vault, before the list changes: the slot is started when the booklet is drawn again. */
	| { kind: "media"; host: string; entry: string; once: (evt: Event) => void; again: (evt: Event) => void }
	/** The booklet names these sites (as entries) and the reader has not allowed them. */
	| { kind: "declared"; hosts: string[] };

export interface CardOptions {
	app: App;
	doc: Document;
	allows: MediaAllows;
	notePath: string;
	request?: CardRequest;
	/** What takes focus when the card closes, found when it does: the button that opened it may have been drawn again meanwhile. */
	returnFocus?: () => HTMLElement | null;
	/** Told when the card has closed. `changed`: a site was allowed or taken off while it was open. `answered`: for a request, a choice was made. `left`: the sites of a request for the sites a booklet names that were not dealt with. */
	onClose?: (state: { changed: boolean; answered: boolean; left: string[] }) => void;
}

export interface AllowCard {
	el: HTMLElement;
	close(): void;
}

let ids = 0;
const open = new WeakMap<Document, AllowCard>();

class AllowModal extends Modal {
	/** Whether closing puts the focus back (not after "Allow once": the piece's own player has it). */
	restore = true;
	private finish: () => void = () => {};
	/** What takes focus when the card opens (Not now, else the title). The Modal puts focus on its first control by itself as it opens, so this is set after `open()` returns. */
	first: HTMLElement | null = null;

	constructor(private readonly o: CardOptions) {
		super(o.app);
	}

	onOpen(): void {
		const o = this.o;
		const uid = ++ids;
		const root = this.containerEl;
		root.addClass("booklet-allow");
		const card = this.modalEl;
		card.addClass("booklet-allow-card");
		if (ADD_ARIA) card.setAttr("role", "dialog");
		if (ADD_ARIA) card.setAttr("aria-modal", "true");
		if (ADD_ARIA) card.setAttr("aria-labelledby", `booklet-allow-title-${uid}`);
		const req = o.request;
		// a service arrives as "YouTube (youtube.com, releases.obsidian.md)": its name is the title, the hosts are said in the line below
		const asked = req?.kind === "media" ? /^(.+) \((.+)\)$/.exec(req.host) : null;
		const askedName = asked ? (asked[1] ?? "") : req?.kind === "media" ? req.host : "";
		const askedHosts = asked ? (asked[2] ?? "").split(", ") : [];
		const title = this.titleEl;
		title.setText(!req ? "Allow list" : req.kind === "media" ? `Allow media from ${askedName}?` : "This booklet plays media from other sites");
		title.setAttr("id", `booklet-allow-title-${uid}`);
		title.setAttr("tabindex", "-1");
		const body = this.contentEl;

		// what a change did, said to a screen reader without moving focus: a row that goes away, a site added
		const live = card.createDiv({ cls: "booklet-sr", attr: { role: "status", "aria-live": "polite" } });
		const say = (text: string): void => live.setText(text);

		let changed = false;
		let answered = false;
		let closed = false;
		const left = new Set(req?.kind === "declared" ? req.hosts : []);
		const vaultAdd = (text: string) => {
			const r = o.allows.addVault(text);
			if (r.ok) changed = true;
			return r;
		};
		const noteAdd = (text: string) => {
			const r = o.allows.addNote(o.notePath, text);
			if (r.ok) changed = true;
			return r;
		};

		let stopGuard: (() => void) | null = null;
		const close = (restore = true): void => {
			this.restore = restore;
			this.close();
		};
		// the Modal calls onClose for every way out (Escape, the backdrop, the header button, close()): the one place the card's end is handled
		this.finish = (): void => {
			if (closed) return;
			closed = true;
			stopGuard?.();
			if (open.get(o.doc) === handle) open.delete(o.doc);
			if (this.restore) o.returnFocus?.()?.focus();
			o.onClose?.({ changed, answered, left: [...left] });
		};
		const handle: AllowCard = { el: root, close: () => close() };
		open.set(o.doc, handle);

		const cost = (host: string): string => `${host} will see when you play and from where.`;
		const covers = (entry: string): string => {
			const more = alsoCovers(entry);
			return more.length ? `Allowing ${entry} also covers ${hostList(more)}, which its player uses.` : "";
		};
		const button = (into: HTMLElement, text: string, label: string | null, cb: (evt: MouseEvent) => void): HTMLElement => {
			const b = into.createEl("button", { text, cls: "booklet-allow-btn-choice", attr: label ? { "aria-label": label, type: "button" } : { type: "button" } });
			b.addEventListener("click", cb);
			return b;
		};

		let notNow: HTMLElement | null = null;
		if (req?.kind === "media") {
			const box = body.createDiv({ cls: "booklet-allow-request" });
			if (askedHosts.length) box.createEl("p", { text: `Plays from ${hostList(askedHosts)}.` });
			box.createEl("p", { text: cost(askedName) });
			const more = covers(req.entry);
			if (more) box.createEl("p", { cls: "booklet-allow-covers", text: more });
			const choices: [string, string][] = [
				["Allow once", "Plays this piece only. Nothing is kept."],
				["Allow for this note", `Kept in this plugin's data for this note: ${req.entry} and its subdomains.`],
				["Allow for this vault", `Kept in this plugin's data for every note in this vault: ${req.entry} and its subdomains.`],
			];
			choices.forEach(([text, said], n) => {
				const row = box.createDiv({ cls: "booklet-allow-choice" });
				const did = `booklet-allow-choice-${uid}-${n}`;
				button(row, text, null, (evt) => {
					if (n === 0) req.once(evt);
					else {
						req.again(evt);
						(n === 1 ? noteAdd : vaultAdd)(req.entry);
					}
					answered = true;
					close(n !== 0);
				}).setAttribute("aria-describedby", did);
				row.createEl("span", { cls: "booklet-allow-said", text: said, attr: { id: did } });
			});
			notNow = button(box.createDiv({ cls: "booklet-allow-choice" }), "Not now", null, () => close());
		} else if (req?.kind === "declared") {
			const box = body.createDiv({ cls: "booklet-allow-request" });
			box.createEl("p", { text: "The booklet names these sites. A booklet cannot allow a site for you: only you can." });
			for (const host of req.hosts) {
				const row = box.createDiv({ cls: "booklet-allow-choice booklet-allow-declared" });
				row.createEl("strong", { text: host });
				row.createEl("span", { cls: "booklet-allow-said", text: cost(host) });
				// the buttons say their own words and the site after them, so the name holds what is shown ("Allow for this note: media.example.org")
				const done = (scope: string) => {
					answered = true;
					// the row goes, and with it the button that had the focus: it moves to the next row's first button, else to Not now
					let next: Element | null = row.nextElementSibling;
					while (next && !next.classList.contains("booklet-allow-declared")) next = next.nextElementSibling;
					row.remove();
					left.delete(host);
					if (!left.size) return close();
					(next?.querySelector<HTMLElement>("button") ?? notNow)?.focus();
					say(`${host} allowed for this ${scope}`);
				};
				button(row, "Allow for this note", `Allow for this note: ${host}`, () => {
					noteAdd(host);
					done("note");
				});
				button(row, "Allow for this vault", `Allow for this vault: ${host}`, () => {
					vaultAdd(host);
					done("vault");
				});
			}
			notNow = button(box.createDiv({ cls: "booklet-allow-choice" }), "Not now", null, () => close());
		}

		// the lists: each site a box, ticked while it is allowed. A box unticked takes the site off at once; the row stays until the card
		// closes, so a slip is one tick to undo.
		const shown = { vault: new Set(o.allows.vaultList()), note: new Set(o.allows.noteList(o.notePath)) };
		const lists = body.createDiv({ cls: "booklet-allow-lists" });
		const draw = (): void => {
			lists.empty();
			const section = (key: string, heading: string, set: Set<string>, has: (e: string) => boolean, add: (e: string) => void, remove: (e: string) => void) => {
				const sec = lists.createDiv({ cls: "booklet-allow-section" });
				const hid = `booklet-allow-h-${uid}-${key}`;
				sec.createEl("h3", { text: heading, attr: { id: hid } });
				if (!set.size) sec.createEl("p", { cls: "booklet-muted", text: "Nothing yet." });
				const ul = sec.createEl("ul", { cls: "booklet-allow-list", attr: { "aria-labelledby": hid } });
				for (const entry of set) {
					const li = ul.createEl("li");
					const label = li.createEl("label", { cls: "booklet-allow-row" });
					const box = label.createEl("input", { attr: { type: "checkbox" } });
					box.checked = has(entry);
					label.createSpan({ text: entry });
					const more = covers(entry);
					if (more) li.createEl("span", { cls: "booklet-allow-covers", text: more });
					box.addEventListener("change", () => {
						if (box.checked) add(entry);
						else remove(entry);
						changed = true;
					});
				}
			};
			section("vault", "Allowed for this vault", shown.vault, (e) => o.allows.vaultList().includes(e), (e) => o.allows.addVault(e), (e) => o.allows.removeVault(e));
			section("note", "Allowed for this note", shown.note, (e) => o.allows.noteList(o.notePath).includes(e), (e) => o.allows.addNote(o.notePath, e), (e) => o.allows.removeNote(o.notePath, e));
		};
		draw();

		// the blank
		const blank = body.createDiv({ cls: "booklet-allow-add" });
		const inputId = `booklet-allow-input-${uid}`;
		blank.createEl("label", { text: "Add a site", attr: { for: inputId } });
		const input = blank.createEl("input", { attr: { id: inputId, type: "text", placeholder: "youtube.com", autocapitalize: "off", autocorrect: "off", spellcheck: "false", inputmode: "url", "aria-describedby": `booklet-allow-hint-${uid}` } });
		blank.createEl("p", { cls: "booklet-allow-hint", text: "Add a site by its name, for example youtube.com. https is assumed: only secure addresses are covered, and the site's subdomains with them. Enter adds it for this note.", attr: { id: `booklet-allow-hint-${uid}` } });
		const error = blank.createEl("p", { cls: "booklet-allow-error", attr: { role: "alert" } });
		const put = (scope: "vault" | "note") => {
			const typed = normaliseEntry(input.value);
			// a site already on that list is said so, not added a second time and not passed over in silence
			const had = typed.ok && (scope === "vault" ? o.allows.vaultList() : o.allows.noteList(o.notePath)).includes(typed.entry);
			const r = scope === "vault" ? vaultAdd(input.value) : noteAdd(input.value);
			if (!r.ok) {
				error.setText(r.why);
				input.focus();
				return;
			}
			error.setText("");
			input.value = "";
			(scope === "vault" ? shown.vault : shown.note).add(r.entry);
			draw();
			input.focus();
			say(had ? `${r.entry} is already on the list for this ${scope}` : `Added ${r.entry} for this ${scope}`);
		};
		const row = blank.createDiv({ cls: "booklet-allow-choice" });
		button(row, "Add for this vault", null, () => put("vault"));
		button(row, "Add for this note", null, () => put("note"));
		input.addEventListener("keydown", (evt) => {
			// Enter adds for this note, the narrower of the two
			if (evt.key === "Enter") {
				evt.preventDefault();
				put("note");
			}
		});
		input.addEventListener("input", () => error.setText(""));

		if (!req) button(card.createDiv({ cls: "modal-button-container" }), "Close", null, () => close());

		const first = notNow ?? title;
		this.first = first;
		if (!ADD_REGAIN) return;
		// the same regain as the hand-built card, kept for the measuring build that asks whether the Modal needs it
		const win = o.doc.defaultView;
		if (win) {
			const timers: number[] = [];
			let live = true;
			const stop = (): void => {
				live = false;
				for (const t of timers) win.clearTimeout(t);
				timers.length = 0;
				o.doc.removeEventListener("pointerdown", stop, true);
				o.doc.removeEventListener("keydown", stop, true);
			};
			const regain = (): void => {
				const at = o.doc.activeElement;
				if (live && !closed && !card.contains(at) && (!at || at === o.doc.body)) first.focus();
			};
			o.doc.addEventListener("pointerdown", stop, true);
			o.doc.addEventListener("keydown", stop, true);
			root.addEventListener("focusout", () => live && timers.push(win.setTimeout(regain, 0)));
			for (const ms of [30, 120, 300, 700]) timers.push(win.setTimeout(regain, ms));
			timers.push(win.setTimeout(stop, 1000));
			stopGuard = stop;
		}
	}

	onClose(): void {
		this.finish();
	}
}

export function openAllowCard(o: CardOptions): AllowCard {
	open.get(o.doc)?.close();
	const modal = new AllowModal(o);
	modal.open();
	modal.first?.focus();
	return open.get(o.doc) ?? { el: modal.containerEl, close: () => modal.close() };
}
