/*
 * The allow card (plan-v2): one dialog that lists the sites the reader has allowed, for every note in the vault and for this note,
 * with a box to untick each, and a blank to write one in. It opens from the Allow list button at the top of a booklet, on its own when
 * a booklet names sites the reader has not allowed, and when a press on media from a site not allowed asks. It sits in the window
 * itself, not in the note's drawing, so that it stays up while the note behind it is drawn again after a change. Every choice says
 * what it costs; the default is Not now.
 */
import { alsoCovers, hostList } from "./core";
import type { MediaAllows } from "./settings";

export type CardRequest =
	/** A press on media from a site not allowed. `host` is what will be asked for it (a host, or a service with its hosts), `entry` the site that would be allowed. `once` plays that one piece and keeps nothing. `again` is told, with the press, when the site is allowed for this note or this vault, before the list changes: the slot is started when the booklet is drawn again. */
	| { kind: "media"; host: string; entry: string; once: (evt: Event) => void; again: (evt: Event) => void }
	/** The booklet names these sites (as entries) and the reader has not allowed them. */
	| { kind: "declared"; hosts: string[] };

export interface CardOptions {
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

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

export function openAllowCard(o: CardOptions): AllowCard {
	open.get(o.doc)?.close();
	const uid = ++ids;
	const root = o.doc.body.createDiv({ cls: "modal-container mod-dim booklet-allow" });
	const backdrop = root.createDiv({ cls: "modal-bg" });
	const card = root.createDiv({ cls: "modal booklet-allow-card", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": `booklet-allow-title-${uid}` } });
	const req = o.request;
	const title = card.createEl("h2", {
		cls: "modal-title",
		text: !req ? "Allowed media sites" : req.kind === "media" ? `Allow media from ${req.host}?` : "This booklet plays media from other sites",
		attr: { id: `booklet-allow-title-${uid}`, tabindex: "-1" },
	});
	const body = card.createDiv({ cls: "modal-content" });

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
		if (closed) return;
		closed = true;
		stopGuard?.();
		if (open.get(o.doc) === handle) open.delete(o.doc);
		root.remove();
		if (restore) o.returnFocus?.()?.focus();
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
		box.createEl("p", { text: cost(req.host) });
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
			const done = () => {
				answered = true;
				row.remove();
				left.delete(host);
				if (!left.size) close();
			};
			button(row, "Allow for this note", `Allow ${host} for this note`, () => {
				noteAdd(host);
				done();
			});
			button(row, "Allow for this vault", `Allow ${host} for this vault`, () => {
				vaultAdd(host);
				done();
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
		section("vault", "Allowed for every note in this vault", shown.vault, (e) => o.allows.vaultList().includes(e), (e) => o.allows.addVault(e), (e) => o.allows.removeVault(e));
		section("note", "Allowed for this note", shown.note, (e) => o.allows.noteList(o.notePath).includes(e), (e) => o.allows.addNote(o.notePath, e), (e) => o.allows.removeNote(o.notePath, e));
	};
	draw();

	// the blank
	const blank = body.createDiv({ cls: "booklet-allow-add" });
	const inputId = `booklet-allow-input-${uid}`;
	blank.createEl("label", { text: "Add a site", attr: { for: inputId } });
	const input = blank.createEl("input", { attr: { id: inputId, type: "text", placeholder: "youtube.com", autocapitalize: "off", autocorrect: "off", spellcheck: "false", inputmode: "url", "aria-describedby": `booklet-allow-hint-${uid}` } });
	blank.createEl("p", { cls: "booklet-allow-hint", text: "https is assumed. Type the site and its ending, like youtube.com. It covers the site and its subdomains: https://*.youtube.com/*.", attr: { id: `booklet-allow-hint-${uid}` } });
	const error = blank.createEl("p", { cls: "booklet-allow-error", attr: { role: "alert" } });
	const put = (scope: "vault" | "note") => {
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
	};
	const row = blank.createDiv({ cls: "booklet-allow-choice" });
	button(row, "Add for every note", null, () => put("vault"));
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

	// Escape closes, and Tab stays inside the card
	root.addEventListener("keydown", (evt) => {
		if (evt.key === "Escape") {
			evt.preventDefault();
			evt.stopPropagation();
			close();
			return;
		}
		if (evt.key !== "Tab") return;
		const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
		const first = items[0];
		const last = items[items.length - 1];
		if (!first || !last) return;
		const at = o.doc.activeElement;
		if (evt.shiftKey && (at === first || at === title || !card.contains(at))) {
			evt.preventDefault();
			last.focus();
		} else if (!evt.shiftKey && (at === last || !card.contains(at))) {
			evt.preventDefault();
			first.focus();
		}
	});
	backdrop.addEventListener("click", () => close());

	const first = notNow ?? title;
	first.focus();
	// A card that opens as a note opens (the sites a booklet names) is blurred a moment later, when Obsidian makes the pane active
	// (measured: about 2 ms). For the first moments the default focus is put back if it was lost to nothing, and never taken from a
	// place she chose: any press or key of hers ends this, and so does focus that is somewhere else.
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
	return handle;
}
