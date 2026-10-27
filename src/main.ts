/*
 * Booklet: a booklet note opens in its own view, drawn with Obsidian's own components, and
 * answers are written into the note's records section and nowhere else. No Node or Electron API.
 */
import { FileView, MarkdownView, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { BookletView, VIEW_TYPE } from "./view";
import { installViewSwitch, isBookletFile, setLeafMode, type LeafMode } from "./switch";

export default class BookletPlugin extends Plugin {
	/** The "Open as booklet" button added to Markdown views of booklet notes. */
	private markdownActions = new Map<MarkdownView, HTMLElement>();

	override async onload(): Promise<void> {
		this.registerView(VIEW_TYPE, (leaf) => new BookletView(leaf, this));
		installViewSwitch(this, VIEW_TYPE);

		this.addCommand({
			id: "toggle-view",
			name: "Toggle between booklet view and Markdown",
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

		const refresh = () => this.refreshMarkdownActions();
		this.registerEvent(this.app.workspace.on("layout-change", refresh));
		this.registerEvent(this.app.workspace.on("file-open", refresh));
		this.registerEvent(this.app.workspace.on("active-leaf-change", refresh));
		this.registerEvent(this.app.metadataCache.on("changed", refresh));
		this.app.workspace.onLayoutReady(refresh);
	}

	override onunload(): void {
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
