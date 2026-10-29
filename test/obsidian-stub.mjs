/*
 * The few parts of Obsidian's API that the Booklet view uses, so that the view itself can run in Node over a jsdom
 * document (test/view.test.mjs). test/build-for-tests.mjs bundles src/view.ts with "obsidian" pointing here. Only what
 * the view calls is here, and it does only what the view relies on: this is not a model of Obsidian.
 */
export class Component {
	constructor() {
		this._children = [];
		this._cleanups = [];
	}
	load() {
		this.onload();
	}
	unload() {
		for (const f of this._cleanups.splice(0)) f();
		this.onunload();
	}
	onload() {}
	onunload() {}
	addChild(c) {
		this._children.push(c);
		return c;
	}
	removeChild(c) {
		this._children = this._children.filter((x) => x !== c);
		return c;
	}
	register(cb) {
		this._cleanups.push(cb);
	}
	registerEvent() {}
	registerDomEvent(el, type, cb, options) {
		el.addEventListener(type, cb, options);
		this._cleanups.push(() => el.removeEventListener(type, cb, options));
	}
}

/** A view on a file: its content element is in the document, so that focus works as in a pane. */
export class TextFileView extends Component {
	constructor(leaf) {
		super();
		this.leaf = leaf;
		this.app = leaf.app;
		this.file = null;
		this.data = "";
		this.containerEl = document.body.createDiv({ cls: "workspace-leaf-content" });
		this.contentEl = this.containerEl.createDiv({ cls: "view-content" });
	}
	addAction() {
		return this.containerEl.createDiv();
	}
	onPaneMenu() {}
	async onUnloadFile() {}
	getState() {
		return this.file ? { file: this.file.path } : {};
	}
	/** The real one loads the file named in the state; a test sets `view.file` and hands the text itself. */
	async setState() {}
	getEphemeralState() {
		return {};
	}
	setEphemeralState() {}
}

/** What the view asks of a click: a plain click opens in the pane. */
export const Keymap = { isModEvent: () => false };

/** One class, shared by the copy bundled into test/.build/view.mjs and a test that imports this file. */
export const MarkdownView = (globalThis.__bookletStubMarkdownView ??= class MarkdownView {});

/** Every notice's words, in order (one class, shared as MarkdownView is, so a test reads what the view said). */
export const Notice = (globalThis.__bookletStubNotice ??= class Notice {
	static said = [];
	constructor(message) {
		Notice.said.push(String(message));
	}
	hide() {}
});

/** Markdown is drawn as its plain words: enough to see which text a drawing came from. */
export const MarkdownRenderer = {
	render(_app, markdown, el) {
		el.appendText(markdown);
		return Promise.resolve();
	},
};

/** An icon drawn into an element: an svg named for the id, for the ids Obsidian's set has here (the few below); any other draws nothing, as Obsidian's does. */
const DRAWN = /^(lucide-(?!zzz)[a-z0-9-]+|book-open|file-text|chevron-right)$/;
export function setIcon(el, id) {
	el.empty?.();
	if (!DRAWN.test(id) || /^lucide-nothing/.test(id)) return;
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("data-icon", id);
	el.appendChild(svg);
}

/** An icon by name, as Obsidian's (Lucide) set has it: a few names stand for the set here; any other is none. */
const ICONS = new Set(["heart", "sun", "moon", "book-open", "check"]);
export function getIcon(name) {
	if (!ICONS.has(name)) return null;
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("data-icon", name);
	return svg;
}
