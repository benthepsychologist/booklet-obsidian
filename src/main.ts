/*
 * Booklet: a booklet note opens in its own view, drawn with Obsidian's own components, and
 * answers are written into the note's records section and nowhere else. No Node or Electron API.
 */
import { FileView, MarkdownView, Notice, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { moveHeld } from "./held-store";
import { BookletSettingTab, MediaAllows } from "./settings";
import { moveDevice } from "./listen-store";
import { ListenWriter } from "./listen-writer";
import { NowPlaying } from "./now-playing";
import { BookletView, VIEW_TYPE } from "./view";
import { EditorSide } from "./editor-side";
import { installViewSwitch, isBookletFile, setLeafMode, type LeafMode } from "./switch";

export default class BookletPlugin extends Plugin {
	/** The "Open as booklet" button added to Markdown views of booklet notes. */
	private markdownActions = new Map<MarkdownView, HTMLElement>();
	/** The sites the reader has allowed media from (settings.ts), loaded from the plugin's data before any view is made. */
	media = new MediaAllows(null, () => {});
	/** Keeps a playing element going when its page goes, and writes its place when it stops (now-playing.ts, listen-writer.ts). */
	nowPlaying!: NowPlaying;
	/** Editor mode: the editing panel, its command and its drop (editor-side.ts). */
	editor = new EditorSide(this);

	override async onload(): Promise<void> {
		// a data.json that cannot be read must not stop the plugin loading (the booklets would open as plain Markdown, with no word why): it starts with empty lists, says so, and leaves the file alone until she changes a list
		let saved: unknown = null;
		try {
			saved = await this.loadData();
		} catch {
			new Notice("Booklet could not read its saved settings and started with none.");
		}
		this.media = new MediaAllows(saved, (data) => this.saveData(data));
		this.nowPlaying = new NowPlaying({
			app: this.app,
			writer: new ListenWriter({
				app: this.app,
				viewListen: (path, key) => {
					for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof BookletView && leaf.view.file?.path === path) return leaf.view.listenOf(key);
					return null;
				},
			}),
			showPage: (path, state) => void this.showPage(path, state),
		});
		this.addSettingTab(new BookletSettingTab(this.app, this, this.media));
		// the allow list changed (the card, the settings page, a rename): every open booklet is drawn again with it
		this.register(
			this.media.onChange(() => {
				for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof BookletView) leaf.view.redrawSoon();
			}),
		);
		// the look chosen in the settings changed: every open booklet takes it at once, with no new drawing
		this.register(
			this.media.onLookChange(() => {
				for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof BookletView) leaf.view.applyLook();
			}),
		);
		this.registerView(VIEW_TYPE, (leaf) => new BookletView(leaf, this));
		installViewSwitch(this, VIEW_TYPE);
		this.editor.install();

		this.addCommand({
			id: "toggle-view",
			name: "Toggle between the note view and Markdown",
			checkCallback: (checking) => {
				const bv = this.app.workspace.getActiveViewOfType(BookletView);
				const mv = bv ? null : this.app.workspace.getActiveViewOfType(MarkdownView);
				const view = bv ?? (mv && isBookletFile(this.app, mv.file) ? mv : null);
				if (!view) return false;
				if (!checking) void this.setMode(view.leaf, bv ? "markdown" : "booklet");
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file, source, leaf) => {
				if (source === "link-context-menu" || !leaf || !(file instanceof TFile)) return;
				const v = leaf.view;
				if (v instanceof MarkdownView && v.file === file && isBookletFile(this.app, file))
					menu.addItem((item) =>
						item
							.setTitle("Open as booklet")
							.setIcon("book-open")
							.setSection("pane")
							.onClick(() => void this.setMode(leaf, "booklet")),
					);
			}),
		);

		// before the app quits or a window closes, every booklet view writes what was typed and adds the reader's own
		// words not added yet, as leaving each field would (SPEC section 5). A reload gives no time for this: those words
		// are kept on the device as they are typed, and added when the note is next drawn (held-store.ts).
		this.registerEvent(
			this.app.workspace.on("quit", (tasks) => {
				for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
					const v = leaf.view;
					if (v instanceof BookletView && v.hasUnsaved()) tasks.add(() => v.saveTyped());
				}
				// media kept playing by the bar, whose page is gone: its place is written before the app goes
				if (this.nowPlaying.unsaved()) tasks.add(() => this.nowPlaying.flush());
			}),
		);
		// a note deleted in Obsidian takes the sites allowed for it with it
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.media.forgetNote(file.path);
				// what plays from it in the bar stops, and its places on this device go
				this.nowPlaying.deleted(file.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				moveHeld(this.app, oldPath, file.path);
				// a note renamed or moved in Obsidian keeps the sites allowed for it; one moved outside Obsidian asks again
				this.media.moveNote(oldPath, file.path);
				// the positions kept for a `listen` and the furthest page reached go with the note too (listen-store.ts)
				moveDevice(this.app, oldPath, file.path);
				this.nowPlaying.rename(oldPath, file.path);
			}),
		);

		const refresh = () => this.refreshMarkdownActions();
		this.registerEvent(this.app.workspace.on("layout-change", refresh));
		this.registerEvent(this.app.workspace.on("file-open", refresh));
		this.registerEvent(this.app.workspace.on("active-leaf-change", refresh));
		this.registerEvent(this.app.metadataCache.on("changed", refresh));
		this.app.workspace.onLayoutReady(refresh);
	}

	override onunload(): void {
		this.nowPlaying.dispose();
		for (const el of this.markdownActions.values()) el.remove();
		this.markdownActions.clear();
		// leave each note open, as Markdown, rather than in a view that is no longer there
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			const v = leaf.view;
			if (!(v instanceof BookletView) || !v.file) continue;
			setLeafMode(leaf, v.file.path, "markdown");
			void leaf.setViewState({ type: "markdown", state: leaf.getViewState().state });
		}
	}

	/** The toggle: shows the leaf's note as a booklet or as Markdown, and remembers the choice for that leaf. */
	async setMode(leaf: WorkspaceLeaf, mode: LeafMode): Promise<void> {
		const v = leaf.view;
		if (!(v instanceof FileView) || !v.file) return;
		setLeafMode(leaf, v.file.path, mode);
		const now = leaf.getViewState();
		await leaf.setViewState({ ...now, type: mode === "markdown" ? "markdown" : VIEW_TYPE, state: { ...now.state, file: v.file.path } }, { focus: true });
	}

	/** "Back to the page" in the now-playing bar: the note is shown as a booklet at the page the media was started on (the pane that has the note, else a new tab). */
	private async showPage(path: string, state: Record<string, unknown>): Promise<void> {
		let leaf: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((l) => {
			const v = l.view;
			if (!leaf && v instanceof FileView && v.file?.path === path) leaf = l;
		});
		leaf ??= this.app.workspace.getLeaf("tab");
		setLeafMode(leaf, path, "booklet");
		await leaf.setViewState({ type: VIEW_TYPE, state: { ...state, file: path }, active: true }, { focus: true });
		await this.app.workspace.revealLeaf(leaf);
		// revealing a tab that is hidden behind the active one does not make it the active one: the note must be what she sees
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	private refreshMarkdownActions(): void {
		const seen = new Set<MarkdownView>();
		this.app.workspace.iterateAllLeaves((leaf) => {
			const v = leaf.view;
			if (!(v instanceof MarkdownView)) return;
			seen.add(v);
			const want = isBookletFile(this.app, v.file);
			const have = this.markdownActions.get(v);
			if (want && !have) this.markdownActions.set(v, v.addAction("book-open", "Open as booklet", () => void this.setMode(leaf, "booklet")));
			else if (!want && have) {
				have.remove();
				this.markdownActions.delete(v);
			}
		});
		for (const [v, el] of this.markdownActions)
			if (!seen.has(v)) {
				el.remove();
				this.markdownActions.delete(v);
			}
	}
}
