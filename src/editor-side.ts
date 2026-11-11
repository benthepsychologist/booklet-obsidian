/*
 * Editor mode, on the plugin's side: the "Booklet: Editor mode" command, the panel's place in the side bar, the drop of a piece on an
 * editor, and the note the panel writes to (the last Markdown view of a note that was in focus).
 *
 * Editor mode is on while the panel is open and off when it is closed (core/editor-mode.ts), whichever way it was opened or closed:
 * the command, the button on the Booklet view, or the panel's own close button. Turning it on from a booklet's reading page opens the
 * note's Markdown beside it, since that is where blocks are placed. Turning it off closes the panel and nothing else; the notes are
 * as they were. There is no setting that hides it.
 */
import { MarkdownView, type Plugin, type WorkspaceLeaf } from "obsidian";
import { EditorMode } from "./core/editor-mode";
import { allowDrop, dropPiece } from "./editor-drop";
import { EditorPanel, PANEL_TYPE } from "./editor-view";
import { setLeafMode } from "./switch";
import { BookletView } from "./view";

export class EditorSide {
	readonly mode = new EditorMode();
	/** The Markdown view of the note last in focus, and the Booklet view last in focus: where the panel writes, and what it offers. */
	lastMarkdown: MarkdownView | null = null;
	lastBooklet: BookletView | null = null;

	constructor(private readonly plugin: Plugin) {}

	install(): void {
		const p = this.plugin;
		const ws = p.app.workspace;
		p.registerView(PANEL_TYPE, (leaf) => new EditorPanel(leaf, this));
		// a piece dragged from the panel onto an editor (editor-drop.ts)
		p.registerDomEvent(activeDocument, "dragover", allowDrop, { capture: true });
		p.registerEvent(ws.on("editor-drop", (evt, editor) => dropPiece(evt, editor)));
		p.addCommand({ id: "editor-mode", name: "Editor mode", callback: () => void this.toggle() });
		const follow = (leaf: WorkspaceLeaf | null) => {
			const v = leaf?.view;
			if (v instanceof MarkdownView) {
				this.lastMarkdown = v;
				this.lastBooklet = null;
			} else if (v instanceof BookletView) this.lastBooklet = v;
		};
		p.registerEvent(ws.on("active-leaf-change", follow));
		p.registerEvent(ws.on("layout-change", () => this.sync()));
		ws.onLayoutReady(() => {
			follow(ws.getMostRecentLeaf());
			this.sync();
		});
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
		if (reading?.file && !this.hasMarkdownOf(reading.file.path)) await this.openMarkdownOf(reading);
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
	async openMarkdownOf(reading: BookletView): Promise<void> {
		const file = reading.file;
		if (!file) return;
		const leaf = this.plugin.app.workspace.getLeaf("split", "vertical");
		setLeafMode(leaf, file.path, "markdown");
		await leaf.setViewState({ type: "markdown", state: { file: file.path }, active: true });
		if (leaf.view instanceof MarkdownView) {
			this.lastMarkdown = leaf.view;
			this.lastBooklet = null;
		}
	}
}
