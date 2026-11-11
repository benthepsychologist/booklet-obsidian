/*
 * Editor mode, on the plugin's side: the "Booklet: Editor mode" command, the panel's place in the side bar, the drop of a piece on an
 * editor, and the note the panel writes to (the last Markdown view of a note that was in focus).
 *
 * Editor mode is on while the panel is open and off when it is closed (core/editor-mode.ts), whichever way it was opened or closed:
 * the command, the button on the Booklet view, or the panel's own close button. Turning it on from a booklet's reading page opens the
 * note's Markdown beside it, since that is where blocks are placed. Turning it off closes the panel and nothing else; the notes are
 * as they were. There is no setting that hides it.
 */
import { MarkdownView, type App, type Component, type Plugin, type TAbstractFile, type TFile, type WorkspaceLeaf } from "obsidian";
import { EditorMode } from "./core/editor-mode";
import { allowDrop, dropPiece } from "./editor-drop";
import { EditorPanel, PANEL_TYPE } from "./editor-view";
import { setLeafMode } from "./switch";
import { BookletView, VIEW_TYPE } from "./view";

/**
 * Call `hear` with the document of the main window, of every popout window already open, and of each one that opens later. A listener
 * a panel or a drop needs is put on every window's document, since a note can be edited in a popout. `owner` is the component the
 * listeners belong to: its own cleanup removes them.
 */
export function forEachWindow(owner: Component, app: App, hear: (doc: Document) => void): void {
	const seen = new Set<Document>();
	const add = (doc: Document): void => {
		if (seen.has(doc)) return;
		seen.add(doc);
		hear(doc);
	};
	add(activeDocument);
	// the popouts the saved layout has open are there once the layout is ready (at once, when it is already)
	app.workspace.onLayoutReady(() => app.workspace.iterateAllLeaves((l) => add(l.view.containerEl.ownerDocument)));
	owner.registerEvent(app.workspace.on("window-open", (_win, win) => add(win.document)));
}

export class EditorSide {
	readonly mode = new EditorMode();
	/**
	 * The paths of the note last in focus as Markdown and as a reading page: where the panel writes, and what it offers. Paths only: the
	 * views are looked up in the workspace each time they are needed, since Obsidian owns them and may close or replace them.
	 */
	markdownPath: string | null = null;
	bookletPath: string | null = null;

	constructor(private readonly plugin: Plugin) {}

	install(): void {
		const p = this.plugin;
		const ws = p.app.workspace;
		p.registerView(PANEL_TYPE, (leaf) => new EditorPanel(leaf, this));
		// a piece dragged from the panel onto an editor (editor-drop.ts), in any window
		forEachWindow(p, p.app, (doc) => p.registerDomEvent(doc, "dragover", allowDrop, { capture: true }));
		p.registerEvent(ws.on("editor-drop", (evt, editor) => void dropPiece(p.app, evt, editor)));
		p.addCommand({ id: "editor-mode", name: "Editor mode", callback: () => void this.toggle() });
		const follow = (leaf: WorkspaceLeaf | null) => {
			const v = leaf?.view;
			if (v instanceof MarkdownView && v.file) {
				this.markdownPath = v.file.path;
				this.bookletPath = null;
			} else if (v instanceof BookletView && v.file) this.bookletPath = v.file.path;
		};
		p.registerEvent(ws.on("active-leaf-change", follow));
		// a pane that opens another note (a link, the quick switcher) keeps its leaf, so no leaf change is heard: the file-open is
		p.registerEvent(ws.on("file-open", (file) => follow(file ? this.leafShowing(file.path) : null)));
		p.registerEvent(ws.on("layout-change", () => this.sync()));
		// a note renamed, or a folder renamed: the typings do not say whether Obsidian then also announces each note inside it, so a path
		// under the old folder name is moved here, and a note announced after that no longer matches its old path (nothing is moved twice)
		const moved = (path: string | null, file: TAbstractFile, old: string): string | null => {
			if (path === null) return null;
			if (path === old) return file.path;
			return path.startsWith(old + "/") ? file.path + path.slice(old.length) : path;
		};
		p.registerEvent(
			p.app.vault.on("rename", (file, old) => {
				this.markdownPath = moved(this.markdownPath, file, old);
				this.bookletPath = moved(this.bookletPath, file, old);
			}),
		);
		ws.onLayoutReady(() => {
			follow(ws.getMostRecentLeaf());
			this.sync();
		});
	}

	/**
	 * The leaf that shows a note just opened, in whichever window it is: the active one when it shows it, else the most recent one of the
	 * main window, else any leaf that does. (`getMostRecentLeaf()` with no argument looks only in the main window, and a note opened in a
	 * pop-out would be missed.)
	 */
	private leafShowing(path: string): WorkspaceLeaf | null {
		const ws = this.plugin.app.workspace;
		const shows = (leaf: WorkspaceLeaf | null): boolean => {
			const v = leaf?.view;
			return (v instanceof MarkdownView || v instanceof BookletView) && v.file?.path === path;
		};
		const active = ws.getActiveViewOfType(MarkdownView)?.leaf ?? ws.getActiveViewOfType(BookletView)?.leaf ?? null;
		if (shows(active)) return active;
		const recent = ws.getMostRecentLeaf();
		if (shows(recent)) return recent;
		let found: WorkspaceLeaf | null = null;
		ws.iterateAllLeaves((l) => {
			if (!found && shows(l)) found = l;
		});
		return found;
	}

	/**
	 * The Markdown view the panel writes to, found in the workspace now: the pane of the note last in focus (the most recent one, when
	 * the note is open twice); with none, the active Markdown pane, or the most recently used pane when that is Markdown. A panel
	 * restored with the saved layout finds its note this way before any pane has been switched to.
	 */
	markdownView(): MarkdownView | null {
		const ws = this.plugin.app.workspace;
		const open: MarkdownView[] = [];
		ws.iterateAllLeaves((l) => {
			if (l.view instanceof MarkdownView && l.view.file) open.push(l.view);
		});
		const recent = ws.getMostRecentLeaf()?.view;
		const named = open.filter((v) => v.file?.path === this.markdownPath);
		if (named.length) return named.find((v) => v === recent) ?? named[0] ?? null;
		const active = ws.getActiveViewOfType(MarkdownView);
		if (active?.file) return active;
		return recent instanceof MarkdownView && recent.file ? recent : null;
	}

	/** The file of the booklet reading page last in focus, when that page is still open. */
	bookletOpen(): TFile | null {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			if (leaf.view instanceof BookletView && leaf.view.file && leaf.view.file.path === this.bookletPath) return leaf.view.file;
		}
		return null;
	}

	/** Editor mode is on when the panel is open. */
	sync(): void {
		this.mode.set(this.plugin.app.workspace.getLeavesOfType(PANEL_TYPE).length > 0);
	}

	async toggle(): Promise<void> {
		if (this.mode.on) this.close();
		else await this.open();
	}

	async open(): Promise<void> {
		const ws = this.plugin.app.workspace;
		const reading = ws.getActiveViewOfType(BookletView);
		if (reading?.file && !this.hasMarkdownOf(reading.file.path)) await this.openMarkdownOf(reading.file);
		const leaf = ws.getLeavesOfType(PANEL_TYPE)[0] ?? ws.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: PANEL_TYPE, active: true });
		await ws.revealLeaf(leaf);
		this.sync();
	}

	close(): void {
		this.plugin.app.workspace.detachLeavesOfType(PANEL_TYPE);
		this.sync();
	}

	private hasMarkdownOf(path: string): boolean {
		let found = false;
		this.plugin.app.workspace.iterateAllLeaves((l) => {
			if (l.view instanceof MarkdownView && l.view.file?.path === path) found = true;
		});
		return found;
	}

	/** A booklet's reading page has no editor: its Markdown is opened in a pane beside it, and becomes the panel's note. */
	async openMarkdownOf(file: TFile): Promise<void> {
		const leaf = this.plugin.app.workspace.getLeaf("split", "vertical");
		setLeafMode(leaf, file.path, "markdown");
		await leaf.setViewState({ type: "markdown", state: { file: file.path }, active: true });
		if (leaf.view instanceof MarkdownView && leaf.view.file) {
			this.markdownPath = leaf.view.file.path;
			this.bookletPath = null;
		}
	}
}
