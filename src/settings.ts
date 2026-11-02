/*
 * The reader's list of sites media may load from, and the plugin's settings page that shows it (plan-v2: three scopes). "This
 * vault" and "this note" live in the plugin's own data (`data.json`: `allowedMediaHosts`, and `noteAllows` by the note's path),
 * never in a note and never read from one. "Once" is kept nowhere: it is a press on one piece of media (media-view.ts). The card
 * (allow-card.ts) and this page edit the same list, so whatever one writes the other shows.
 */
import { Notice, PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import { SUGGESTED_HOSTS, alsoCovers, hostList, normaliseEntry, type Allows, type EntryResult } from "./core";

/** The shape of the plugin's data.json: the names are kept (README, "What stays put"). */
export interface MediaData {
	allowedMediaHosts: string[];
	noteAllows: Record<string, string[]>;
}

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Entries read from saved data: the ones that are entries, once each, in the order they were saved. */
function entriesOf(raw: unknown): string[] {
	const out: string[] = [];
	if (Array.isArray(raw))
		for (const v of raw) {
			const n = typeof v === "string" ? normaliseEntry(v) : null;
			if (n && n.ok && !out.includes(n.entry)) out.push(n.entry);
		}
	return out;
}

/** The allow lists, in memory, with the data they are saved in. Changes are told to whoever listens, and saved after. */
export class MediaAllows {
	private vault: string[];
	private notes: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
	/** Whatever else the data file holds is written back as it was. */
	private extra: Record<string, unknown> = {};
	private listeners = new Set<() => void>();
	private saving: Promise<void> = Promise.resolve();
	private snapshot: Allows | null = null;

	/** `raw`: what the plugin's loadData gave (anything); `save`: writes the data file. */
	constructor(
		raw: unknown,
		private readonly save: (data: Record<string, unknown>) => Promise<void> | void,
	) {
		const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
		for (const [k, v] of Object.entries(o)) if (k !== "allowedMediaHosts" && k !== "noteAllows") this.extra[k] = v;
		this.vault = entriesOf(o["allowedMediaHosts"]);
		const notes = o["noteAllows"];
		if (notes && typeof notes === "object" && !Array.isArray(notes))
			for (const [path, v] of Object.entries(notes)) {
				const list = entriesOf(v);
				if (list.length) this.notes[path] = list;
			}
	}

	/** The lists as the gate reads them. The same object until something changes; read it, never write it. */
	allows(): Allows {
		if (!this.snapshot) {
			const notes = Object.create(null) as Record<string, string[]>;
			for (const [path, list] of Object.entries(this.notes)) notes[path] = [...list];
			this.snapshot = { vault: [...this.vault], notes };
		}
		return this.snapshot;
	}

	vaultList(): string[] {
		return [...this.vault];
	}

	noteList(path: string): string[] {
		return own(this.notes, path) ? [...(this.notes[path] ?? [])] : [];
	}

	/** What data.json holds. */
	toData(): Record<string, unknown> {
		return { ...this.extra, allowedMediaHosts: [...this.vault], noteAllows: Object.fromEntries(Object.entries(this.notes).map(([k, v]) => [k, [...v]])) };
	}

	/** Tells `cb` after every change, from the card, the settings page or a rename; gives back what stops it. */
	onChange(cb: () => void): () => void {
		this.listeners.add(cb);
		return () => void this.listeners.delete(cb);
	}

	private changed(): void {
		this.snapshot = null;
		const data = this.toData();
		this.saving = this.saving.then(() => this.save(data)).catch(() => {
			// a list that cannot be saved is still in force for this session
		});
		for (const cb of [...this.listeners]) {
			try {
				cb();
			} catch {
				// one listener's mistake does not stop the others hearing it
			}
		}
	}

	/** Waits until every change so far is saved. */
	saved(): Promise<void> {
		return this.saving;
	}

	/** Adds a site to the vault's list. `text` is what the reader typed. A site already there is not added twice. */
	addVault(text: string): EntryResult {
		const n = normaliseEntry(text);
		if (n.ok && !this.vault.includes(n.entry)) {
			this.vault.push(n.entry);
			this.changed();
		}
		return n;
	}

	removeVault(entry: string): void {
		const at = this.vault.indexOf(entry);
		if (at < 0) return;
		this.vault.splice(at, 1);
		this.changed();
	}

	addNote(path: string, text: string): EntryResult {
		const n = normaliseEntry(text);
		if (n.ok) {
			const list = own(this.notes, path) ? (this.notes[path] ?? []) : [];
			if (!list.includes(n.entry)) {
				this.notes[path] = [...list, n.entry];
				this.changed();
			}
		}
		return n;
	}

	removeNote(path: string, entry: string): void {
		const list = own(this.notes, path) ? (this.notes[path] ?? []) : [];
		if (!list.includes(entry)) return;
		const rest = list.filter((e) => e !== entry);
		if (rest.length) this.notes[path] = rest;
		else delete this.notes[path];
		this.changed();
	}

	/** A note renamed or moved inside Obsidian: its list goes with it. One moved outside Obsidian is a note with no list: it asks again. */
	moveNote(from: string, to: string): void {
		if (from === to || !own(this.notes, from)) return;
		const moved = this.notes[from] ?? [];
		const there = own(this.notes, to) ? (this.notes[to] ?? []) : [];
		this.notes[to] = [...there, ...moved.filter((e) => !there.includes(e))];
		delete this.notes[from];
		this.changed();
	}

	/** The one-time action of the settings page: the suggested services are put on the vault's list. Gives how many were new. */
	addSuggested(): number {
		const fresh = SUGGESTED_HOSTS.filter((h) => !this.vault.includes(h));
		if (!fresh.length) return 0;
		this.vault.push(...fresh);
		this.changed();
		return fresh.length;
	}
}

/** The plugin's settings page: the vault's list and the way to add to it. */
export class BookletSettingTab extends PluginSettingTab {
	private off: (() => void) | null = null;

	constructor(
		app: App,
		plugin: Plugin,
		private readonly allows: MediaAllows,
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		this.off?.();
		this.off = this.allows.onChange(() => this.display());
		containerEl.empty();
		containerEl.addClass("booklet-settings");
		new Setting(containerEl).setName("Media from other sites").setHeading();
		new Setting(containerEl).setDesc(
			"Audio and video hosted on these sites can load once you press Play. https is assumed, and a site covers its subdomains: youtube.com stands for https://*.youtube.com/*. A note can never allow a site for you. This list is for every note in this vault; the Allow list button at the top of a note also lets you allow a site for that note alone.",
		);

		const list = this.allows.vaultList();
		if (!list.length) new Setting(containerEl).setDesc("No site is allowed yet.");
		for (const entry of list) {
			const covers = alsoCovers(entry);
			const row = new Setting(containerEl).setName(entry);
			if (covers.length) row.setDesc(`Also covers ${hostList(covers)}, which its player uses.`);
			row.addButton((b) => {
				b.setButtonText("Remove").onClick(() => this.allows.removeVault(entry));
				b.buttonEl.setAttribute("aria-label", `Remove ${entry}`);
			});
		}

		const error = containerEl.createDiv({ cls: "setting-item-description booklet-allow-error", attr: { role: "alert" } });
		let typed = "";
		const add = () => {
			const r = this.allows.addVault(typed);
			if (!r.ok) error.setText(r.why);
		};
		new Setting(containerEl)
			.setName("Add a site")
			.setDesc("The site and its ending, like youtube.com.")
			.addText((t) => {
				t.setPlaceholder("youtube.com").onChange((v) => {
					typed = v;
					error.setText("");
				});
				t.inputEl.setAttribute("aria-label", "Site to allow");
				t.inputEl.addEventListener("keydown", (evt) => {
					if (evt.key === "Enter") add();
				});
			})
			.addButton((b) => b.setButtonText("Add").onClick(add));

		new Setting(containerEl)
			.setName("Suggested services")
			.setDesc(`Adds ${SUGGESTED_HOSTS.join(", ")} to the list above. Nothing is allowed until you do this, and you can remove any of them again.`)
			.addButton((b) =>
				b.setButtonText("Add suggested services").onClick(() => {
					const n = this.allows.addSuggested();
					new Notice(n ? `Added ${n} suggested ${n === 1 ? "site" : "sites"}.` : "The suggested services are already on the list.");
				}),
			);
	}

	override hide(): void {
		this.off?.();
		this.off = null;
	}
}
