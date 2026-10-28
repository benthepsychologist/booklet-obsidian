/*
 * The view switch. Obsidian has no API for "open a .md note whose front matter has a key in my view",
 * so this wraps WorkspaceLeaf.prototype.setViewState the way the Kanban and Excalidraw plugins do
 * (with monkey-around): a `markdown` view state for a booklet note becomes a Booklet view state,
 * unless the toggle set that leaf to Markdown for that note.
 */
import { around } from "monkey-around";
import { WorkspaceLeaf, type App, type Plugin, type TFile, type ViewState } from "obsidian";

export type LeafMode = "booklet" | "markdown";

/** The mode the toggle set on a leaf, for the note it was showing. A leaf showing another note has none. */
const modes = new WeakMap<WorkspaceLeaf, { path: string; mode: LeafMode }>();

export function setLeafMode(leaf: WorkspaceLeaf, path: string, mode: LeafMode): void {
	modes.set(leaf, { path, mode });
}

export function leafModeFor(leaf: WorkspaceLeaf, path: string): LeafMode | null {
	const m = modes.get(leaf);
	return m && m.path === path ? m.mode : null;
}

/** A Markdown note whose front matter, as Obsidian's metadata cache read it, has a `booklet` key with a value. */
export function isBookletFile(app: App, file: TFile | null | undefined): boolean {
	if (!file || file.extension !== "md") return false;
	const fm: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm || typeof fm !== "object" || !Object.prototype.hasOwnProperty.call(fm, "booklet")) return false;
	const v: unknown = (fm as Record<string, unknown>)["booklet"];
	// YAML reads `booklet: "0.16"` as a string and `booklet: 0.16` as a number; the view checks the version
	return (typeof v === "string" && v.trim() !== "") || typeof v === "number";
}

/** Installs the switch; it is removed when the plugin unloads. */
export function installViewSwitch(plugin: Plugin, viewType: string): void {
	const app = plugin.app;
	let active = true;
	const uninstall = around(WorkspaceLeaf.prototype, {
		setViewState(next) {
			return function (this: WorkspaceLeaf, state: ViewState, eState?: unknown) {
				const path = state.state?.["file"];
				if (active && state.type === "markdown" && typeof path === "string") {
					const m = modes.get(this);
					if (m && m.path !== path) modes.delete(this); // the leaf shows another note: its mode resets
					if (leafModeFor(this, path) !== "markdown" && isBookletFile(app, app.vault.getFileByPath(path)))
						return next.call(this, { ...state, type: viewType }, eState);
				}
				return next.call(this, state, eState);
			};
		},
	});
	plugin.register(() => {
		active = false;
		uninstall();
	});
}
