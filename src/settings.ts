/*
 * The reader's list of sites media may load from, and the plugin's settings page that shows it (plan-v2: three scopes). "This
 * vault" and "this note" live in the plugin's own data (`data.json`: `allowedMediaHosts`, and `noteAllows` by the note's path),
 * never in a note and never read from one. "Once" is kept nowhere: it is a press on one piece of media (media-view.ts). The card
 * (allow-card.ts) and this page edit the same list, so whatever one writes the other shows.
 */
import { Notice, PluginSettingTab, Setting, SettingPage, requireApiVersion, type App, type Plugin, type SettingDefinitionItem } from "obsidian";
import { SUGGESTED_HOSTS, alsoCovers, hostList, normaliseEntry, type Allows, type EntryResult } from "./core";

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
	/** Whatever else the data file holds is written back as it was. No prototype, so that a key called `__proto__` is a key like any other and is kept. */
	private extra: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
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

	/** A note deleted in Obsidian (or a folder with notes in it): the sites allowed for it are forgotten, so a list does not outlive its note and a new note at that path does not start with it. */
	forgetNote(path: string): void {
		const gone = Object.keys(this.notes).filter((k) => k === path || k.startsWith(`${path}/`));
		if (!gone.length) return;
		for (const k of gone) delete this.notes[k];
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

const INTRO =
	"Audio and video hosted on these sites can load once you press Play. Sites are written by their name, like youtube.com; https is assumed, and a site covers its subdomains. A note can never allow a site for you. This list is for every note in this vault; the Allow list button at the top of a note also lets you allow a site for that note alone.";

/**
 * The rows of the settings page, drawn into rows that the caller makes (`new Setting(container)`): `display()` does it into the
 * tab's container on Obsidian before 1.13, and the page of the settings entry into its own container on 1.13 and later. The
 * drawing and the behaviour (the focus after Remove, the words said to a screen reader, Enter to add, the error line) are these
 * methods, once, so the two ways to show the page cannot drift apart. The list, the error line and the status message are
 * siblings of the rows, so the container must be one of ours: Obsidian 1.14.5 drops them beside a row it makes itself.
 * Each `draw…` gives back what takes its parts away again.
 */
class AllowPage {
	private input: HTMLInputElement | null = null;
	private live: HTMLElement | null = null;
	private cleanups: (() => void)[] = [];

	constructor(private readonly allows: MediaAllows) {}

	/** What a screen reader is told about a change, without moving focus. */
	private say(text: string): void {
		this.live?.setText(text);
	}

	private keep(fn: () => void): () => void {
		let done = false;
		const once = (): void => {
			if (done) return;
			done = true;
			fn();
		};
		this.cleanups.push(once);
		return once;
	}

	dispose(): void {
		for (const f of this.cleanups.splice(0)) f();
	}

	/** The explanation, and under it the vault's list (a div of its own, put right after the row). */
	drawIntro(row: Setting): () => void {
		// the row has no name: the words are the description
		row.setName("").setDesc(INTRO);
		// only the list is drawn again after a change, so the box below it, the focus and the words said to a screen reader stay where they are
		const listEl = row.settingEl.createDiv();
		row.settingEl.after(listEl);
		const draw = (): void => {
			listEl.empty();
			const list = this.allows.vaultList();
			if (!list.length) new Setting(listEl).setDesc("No site is allowed yet.");
			for (const entry of list) {
				const covers = alsoCovers(entry);
				const item = new Setting(listEl).setName(entry);
				if (covers.length) item.setDesc(`Also covers ${hostList(covers)}, which its player uses.`);
				item.addButton((b) => {
					b.setButtonText("Remove").onClick(() => {
						const at = this.allows.vaultList().indexOf(entry);
						this.allows.removeVault(entry);
						// the button that had the focus is gone: it goes to the next one, else the one before, else the box
						const left = listEl.querySelectorAll<HTMLElement>("button");
						(left[Math.min(at, left.length - 1)] ?? this.input)?.focus();
						this.say(`Removed ${entry}`);
					});
					b.buttonEl.setAttribute("aria-label", `Remove ${entry}`);
				});
			}
		};
		draw();
		const off = this.allows.onChange(draw);
		return this.keep(() => {
			off();
			listEl.remove();
		});
	}

	/** The box, its button and the error line and the live region before it. */
	drawAdd(row: Setting): () => void {
		const error = row.settingEl.createDiv({ cls: "setting-item-description booklet-allow-error", attr: { role: "alert" } });
		// what a change did, said to a screen reader without moving focus
		const live = row.settingEl.createDiv({ cls: "booklet-sr", attr: { role: "status", "aria-live": "polite" } });
		row.settingEl.before(error, live);
		this.live = live;
		let typed = "";
		let field!: { setValue(v: string): unknown };
		let input!: HTMLInputElement;
		const add = (): void => {
			const n = normaliseEntry(typed);
			// a site already on the list is said so, not added a second time and not passed over in silence
			const had = n.ok && this.allows.vaultList().includes(n.entry);
			const r = this.allows.addVault(typed);
			if (!r.ok) {
				error.setText(r.why);
				return;
			}
			error.setText("");
			typed = "";
			field.setValue("");
			input.focus();
			this.say(had ? `${r.entry} is already on the list` : `Added ${r.entry}`);
		};
		row.setName("Add a site")
			.setDesc("The site's name, like youtube.com. Enter adds it.")
			.addText((t) => {
				field = t;
				input = t.inputEl;
				this.input = input;
				t.setPlaceholder("youtube.com").onChange((v) => {
					typed = v;
					error.setText("");
				});
				// the visible name is "Add a site": the accessible name says the same words
				t.inputEl.setAttribute("aria-label", "Add a site");
				t.inputEl.addEventListener("keydown", (evt) => {
					if (evt.key === "Enter") add();
				});
			})
			.addButton((b) => b.setButtonText("Add").onClick(add));
		return this.keep(() => {
			error.remove();
			live.remove();
			if (this.live === live) this.live = null;
			if (this.input === input) this.input = null;
		});
	}

	/** The one-time button that puts the suggested services on the list. */
	drawSuggested(row: Setting): () => void {
		row.setName("Suggested services")
			.setDesc(`Adds ${SUGGESTED_HOSTS.join(", ")} to the list above. Nothing is allowed until you do this, and you can remove any of them again.`)
			.addButton((b) =>
				b.setButtonText("Add suggested services").onClick(() => {
					const n = this.allows.addSuggested();
					const said = n ? `Added ${n} suggested ${n === 1 ? "site" : "sites"}.` : "The suggested services are already on the list.";
					new Notice(said);
					this.say(said);
				}),
			);
		return this.keep(() => undefined);
	}
}

/**
 * What the entry in the settings list says about the page it opens. Measured in Obsidian 1.14.5: the settings search looks in
 * the NAME of a page entry only (not its description, and it ignores `aliases`), so the words a reader types ("allow", "site",
 * "suggested") are in the name. The title of the page itself is short, because Obsidian shows it in its header beside the back button
 * and, at a phone's width with 200% text, a longer one is cut off (measured by check 55: "Allowed media sites" was, "Allow list", the words of
 * the Allow list button in a note, is not).
 */
const PAGE_NAME = "Allowed media sites and suggested services";
const PAGE_TITLE = "Allow list";
const PAGE_DESC = `The sites audio and video may load from once you press Play: the allow list for every note in this vault, the box to add a site, and the suggested services (${SUGGESTED_HOSTS.join(", ")}). Remove a site here at any time.`;

/**
 * The plugin's settings page: the vault's list and the way to add to it.
 *
 * Obsidian 1.13 and later call `getSettingDefinitions()` and draw the tab from what it gives (and do not call `display()` when
 * it gives something). It gives one navigable entry, whose page is drawn by `AllowSettingPage` with the same code as `display()`
 * (`AllowPage`), into a container of its own. Before 1.13 nothing calls it and `display()` draws the page, as it always did.
 */
export class BookletSettingTab extends PluginSettingTab {
	private pages = new Set<AllowPage>();

	constructor(
		app: App,
		plugin: Plugin,
		private readonly allows: MediaAllows,
	) {
		super(app, plugin);
	}

	/** A page of rows to draw into, one for each time the settings are shown; taken away when the tab is hidden. */
	private newPage(): AllowPage {
		const page = new AllowPage(this.allows);
		this.pages.add(page);
		return page;
	}

	private releasePage(page: AllowPage): void {
		page.dispose();
		this.pages.delete(page);
	}

	private disposePages(): void {
		for (const page of this.pages) page.dispose();
		this.pages.clear();
	}

	/** How the entry sums up the list: it is read each time the entry is drawn. */
	private summary(): string {
		const n = this.allows.vaultList().length;
		return n ? `${n} ${n === 1 ? "site" : "sites"}` : "None";
	}

	/**
	 * Obsidian 1.13 and later: one entry that opens the page. Obsidian searches the entry's name and words, so the words a reader
	 * would look for are in them. Nothing before 1.13 calls this; if something does, it is empty and `display()` is the page.
	 */
	override getSettingDefinitions(): SettingDefinitionItem[] {
		if (!requireApiVersion("1.13.0")) return [];
		return [
			{
				type: "page",
				name: PAGE_NAME,
				desc: PAGE_DESC,
				displayValue: () => this.summary(),
				page: () => allowSettingPage(this.newPage(), (page) => this.releasePage(page)),
			},
		];
	}

	override display(): void {
		const { containerEl } = this;
		this.disposePages();
		containerEl.empty();
		containerEl.addClass("booklet-settings");
		drawRows(this.newPage(), containerEl);
	}

	override hide(): void {
		this.disposePages();
	}
}

/** The three rows, the same on a tab's container (before 1.13) and on a page's. */
function drawRows(page: AllowPage, into: HTMLElement): void {
	page.drawIntro(new Setting(into));
	page.drawAdd(new Setting(into));
	page.drawSuggested(new Setting(into));
}

/**
 * The page an entry opens on Obsidian 1.13 and later. `SettingPage` is only there from 1.13, so the class is made when the
 * page is asked for, never when the plugin loads. The page's container is ours: the rows are drawn into it, the page class
 * is on it (the rules of styles.css depend on it), and `hide()` takes the rows' listeners away.
 */
function allowSettingPage(rows: AllowPage, release: (page: AllowPage) => void): SettingPage {
	// the guard is what the directory's linter reads (obsidianmd/no-unsupported-api) to know that SettingPage is not used below 1.13
	if (requireApiVersion("1.13.0")) {
		class AllowSettingPage extends SettingPage {
			override display(): void {
				// Obsidian draws a page again when it comes back to the top of the stack: the first draw's listeners go first
				rows.dispose();
				this.title = PAGE_TITLE;
				this.containerEl.empty();
				this.containerEl.addClass("booklet-settings");
				drawRows(rows, this.containerEl);
			}

			override hide(): void {
				release(rows);
				super.hide();
			}
		}
		return new AllowSettingPage();
	}
	// only asked for by an entry that getSettingDefinitions() gives, which it does from 1.13
	throw new Error("The Booklet settings page needs Obsidian 1.13 or later.");
}
