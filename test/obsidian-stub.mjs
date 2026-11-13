/*
 * The few parts of Obsidian's API that the Booklet view uses, so that the view itself can run in Node over a jsdom
 * document (test/view.test.mjs). test/build-for-tests.mjs bundles src/view.ts with "obsidian" pointing here. Only what
 * the view calls is here, and it does only what the view relies on: this is not a model of Obsidian.
 *
 * For the 0.12.0 tests (the allow list, the settings page, media and `listen`), the names to use are:
 *   Plugin.loadData() / saveData(d)   an in-memory data.json: loadData is null until saveData has been called; a copy goes in and
 *                                     a copy comes out, so a test sees what was stored and not a shared object. `plugin.savedData` is
 *                                     the stored value (what data.json would hold), for a test to read or to seed.
 *   Plugin.addSettingTab(tab)         recorded in `plugin.settingTabs`.
 *   PluginSettingTab                  `display()` and `hide()` do nothing; `containerEl` is a div in the document (a test or the
 *                                     tab's own display() fills it); `app` and `plugin` are kept.
 *   Setting                           every method is a chainable no-op that records itself: `Setting.calls` is the list of
 *                                     { id, method, args } across every Setting made (`Setting.reset()` empties it); `setting.calls`
 *                                     is the same for one. `Setting.made` is every Setting made, in order, so a test can find a row of a
 *                                     form by its name. addText, addTextArea, addButton, addToggle, addDropdown and
 *                                     addSlider call their callback with a component that records too, and a test drives it:
 *                                     `component.change(value)` runs the onChange handler, `component.click()` the onClick handler;
 *                                     an input event on `component.inputEl` and a click on `component.buttonEl` run them too.
 *                                     `setting.components` holds them, in order. The words (setName, setDesc) are also drawn into
 *                                     the setting's element, `setting.settingEl`, so a test can read the page as text.
 *   MarkdownRenderer.render           draws the markdown as its plain words, unless `useMediaRender()` has been called: then
 *                                     `![alt](url)`, `![alt][id]` (with its `[id]: url` line) and `![[file]]` become <img>,
 *                                     <audio> or <video> by the extension of the address, and the raw tags <img>, <audio>, <video>,
 *                                     <iframe>, <source> and <embed> are made as written. Every element made with a src is
 *                                     recorded in `mediaRequests` (as a browser starts a fetch when a src is set), so a test can
 *                                     say "nothing remote was requested". `useMediaRender()` returns the function that puts the
 *                                     plain renderer back; `mediaRequests.length = 0` empties the record.
 * The fake media element a test puts in a drawing by hand is in test/helpers.mjs (`fakeMedia`).
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
		// what the real TextFileView puts on every instance (read from Obsidian 1.14.5 and 1.11.7 in the real app, check 64): a view of
		// ours must not name a member of its own after one of these, or the instance's value hides it (a method `dirty` did, in the real app only)
		this.lastSavedData = null;
		this.saving = false;
		this.saveAgain = false;
		this.isPlaintext = true;
		this.dirty = false;
		this.requestSave = () => {};
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

/** A view in a pane (the editing panel): a content element in the document; the real one has more. */
export const ItemView = (globalThis.__bookletStubItemView ??= class ItemView extends Component {
	constructor(leaf) {
		super();
		this.leaf = leaf;
		this.app = leaf.app;
		this.containerEl = document.body.createDiv({ cls: "workspace-leaf-content" });
		this.contentEl = this.containerEl.createDiv({ cls: "view-content" });
	}
	addAction() {
		return this.containerEl.createDiv();
	}
});

/** A dialog: opening it puts its content in the document, closing it takes it out and calls onClose. */
export class Modal extends Component {
	constructor(app) {
		super();
		this.app = app;
		this.modalEl = document.createElement("div");
		this.titleEl = this.modalEl.createDiv();
		this.contentEl = this.modalEl.createDiv();
		this.scope = new Scope();
	}
	open() {
		document.body.appendChild(this.modalEl);
		this.onOpen();
	}
	close() {
		this.modalEl.remove();
		this.onClose();
	}
	setTitle(t) {
		this.titleEl.textContent = t;
		return this;
	}
	onOpen() {}
	onClose() {}
}

/** The language Obsidian is in ("en" unless a test sets `globalThis.__bookletStubLanguage`). */
export function getLanguage() {
	return globalThis.__bookletStubLanguage ?? "en";
}

/** What the plugin asks of the platform. */
export const Platform = { isMobile: false, isDesktop: true };

/** A plugin: what main.ts's onload calls on itself, doing nothing (a test hands onload an app that records what it is given). */
export class Plugin extends Component {
	constructor(app, manifest) {
		super();
		this.app = app;
		this.manifest = manifest;
	}
	registerView() {}
	addCommand() {}
	/** What data.json would hold; null until saveData is called (Obsidian's loadData gives null when the file is not there). */
	savedData = null;
	settingTabs = [];
	async loadData() {
		return this.savedData === null ? null : JSON.parse(JSON.stringify(this.savedData));
	}
	async saveData(data) {
		this.savedData = JSON.parse(JSON.stringify(data));
	}
	addSettingTab(tab) {
		this.settingTabs.push(tab);
	}
}

/** A settings page: its content element is in the document, and display() and hide() do nothing until a test or the plugin's tab fills it. */
export class PluginSettingTab extends Component {
	constructor(app, plugin) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.containerEl = document.body.createDiv({ cls: "vertical-tab-content" });
	}
	display() {}
	hide() {}
}

/**
 * A sub-page of a settings tab (Obsidian 1.13 and later): it has a titlebar and a container of its own, as the real one does
 * (`.setting-page-titlebar` and `.setting-page-content`, measured in 1.14.5), and the tab gives it display() and hide().
 * Before 1.13 the class is not there, so making one on an app that old throws, as extending `undefined` would.
 */
export class SettingPage {
	constructor() {
		if (!requireApiVersion("1.13.0")) throw new TypeError("SettingPage is not there before Obsidian 1.13");
		this.rootEl = document.body.createDiv({ cls: "setting-page vertical-tab-content" });
		this.titlebarEl = this.rootEl.createDiv({ cls: "setting-page-titlebar" });
		this.containerEl = this.rootEl.createDiv({ cls: "setting-page-content" });
		this.title = "";
	}
	hide() {}
}

/** One control of a Setting: records what is called on it, and a test drives its handler with change(value) or click(). */
class StubComponent {
	constructor(kind, log) {
		this.kind = kind;
		this.value = kind === "toggle" ? false : "";
		this.disabled = false;
		this.calls = [];
		this.inputEl = document.createElement(kind === "textarea" ? "textarea" : kind === "dropdown" ? "select" : "input");
		if (kind === "text") this.inputEl.setAttribute("type", "text");
		this.buttonEl = document.createElement("button");
		this._log = log;
	}
	/** A dropdown's select element (Obsidian's DropdownComponent has it by this name). */
	get selectEl() {
		return this.inputEl;
	}
	_note(method, args) {
		this.calls.push({ method, args });
		this._log(this.kind + "." + method, args);
		return this;
	}
	setValue(v) {
		this.value = v;
		if ("value" in this.inputEl) this.inputEl.value = v === true || v === false ? "" : String(v);
		return this._note("setValue", [v]);
	}
	getValue() {
		return this.value;
	}
	setPlaceholder(v) {
		this.inputEl.setAttribute("placeholder", v);
		return this._note("setPlaceholder", [v]);
	}
	setDisabled(v) {
		this.disabled = v;
		return this._note("setDisabled", [v]);
	}
	setButtonText(v) {
		this.buttonEl.textContent = v;
		return this._note("setButtonText", [v]);
	}
	setCta() {
		return this._note("setCta", []);
	}
	setWarning() {
		return this._note("setWarning", []);
	}
	setTooltip(v) {
		return this._note("setTooltip", [v]);
	}
	setLimits(...a) {
		return this._note("setLimits", a);
	}
	addOption(value, label) {
		this.options = { ...(this.options ?? {}), [value]: label };
		if (this.kind === "dropdown") this.inputEl.appendChild(Object.assign(document.createElement("option"), { value, textContent: label }));
		return this._note("addOption", [value, label]);
	}
	addOptions(o) {
		this.options = { ...(this.options ?? {}), ...o };
		if (this.kind === "dropdown") for (const [value, label] of Object.entries(o)) this.inputEl.appendChild(Object.assign(document.createElement("option"), { value, textContent: label }));
		return this._note("addOptions", [o]);
	}
	/** The handler also hears the element itself, as in Obsidian: typing in the box (an input event) or pressing the button (a click). */
	onChange(fn) {
		this._onChange = fn;
		this.inputEl.addEventListener("input", () => fn(this.inputEl.value));
		return this._note("onChange", []);
	}
	onClick(fn) {
		this._onClick = fn;
		this.buttonEl.addEventListener("click", () => fn());
		return this._note("onClick", []);
	}
	/** A test changes the value as the reader would: the value is set, then the handler runs (its promise is returned). */
	change(v) {
		this.value = v;
		return this._onChange?.(v);
	}
	click() {
		return this._onClick?.();
	}
}

let settingCount = 0;

/** A row of a settings page: every method records itself and returns the setting, so a chain reads as in Obsidian. */
export const Setting = (globalThis.__bookletStubSetting ??= class Setting {
	/** Every call on every Setting, in order: { id, method, args }. */
	static calls = [];
	/** Every Setting made, in order (a test finds a row by its name and drives its components). */
	static made = [];
	static reset() {
		Setting.calls.length = 0;
		Setting.made.length = 0;
	}
	constructor(containerEl) {
		this.id = ++settingCount;
		Setting.made.push(this);
		this.containerEl = containerEl;
		this.calls = [];
		this.components = [];
		this.settingEl = containerEl?.createDiv ? containerEl.createDiv({ cls: "setting-item" }) : document.createElement("div");
		this.nameEl = this.settingEl.createDiv ? this.settingEl.createDiv({ cls: "setting-item-name" }) : document.createElement("div");
		this.descEl = this.settingEl.createDiv ? this.settingEl.createDiv({ cls: "setting-item-description" }) : document.createElement("div");
		this.controlEl = this.settingEl.createDiv ? this.settingEl.createDiv({ cls: "setting-item-control" }) : document.createElement("div");
	}
	_note(method, args) {
		this.calls.push({ method, args });
		Setting.calls.push({ id: this.id, method, args });
		return this;
	}
	setName(v) {
		this.nameEl.textContent = String(v);
		return this._note("setName", [v]);
	}
	setDesc(v) {
		this.descEl.textContent = String(v);
		return this._note("setDesc", [v]);
	}
	setHeading() {
		this.settingEl.classList.add("setting-item-heading");
		return this._note("setHeading", []);
	}
	setClass(v) {
		this.settingEl.classList.add(v);
		return this._note("setClass", [v]);
	}
	setDisabled(v) {
		return this._note("setDisabled", [v]);
	}
	_add(kind, method, cb) {
		const c = new StubComponent(kind, (m, a) => Setting.calls.push({ id: this.id, method: m, args: a }));
		this.components.push(c);
		(kind === "button" ? c.buttonEl : c.inputEl) && this.controlEl.appendChild(kind === "button" ? c.buttonEl : c.inputEl);
		this._note(method, []);
		cb?.(c);
		return this;
	}
	addText(cb) {
		return this._add("text", "addText", cb);
	}
	addTextArea(cb) {
		return this._add("textarea", "addTextArea", cb);
	}
	addButton(cb) {
		return this._add("button", "addButton", cb);
	}
	addToggle(cb) {
		return this._add("toggle", "addToggle", cb);
	}
	addDropdown(cb) {
		return this._add("dropdown", "addDropdown", cb);
	}
	addSlider(cb) {
		return this._add("slider", "addSlider", cb);
	}
});

/**
 * Obsidian's requireApiVersion: true when the app's API version is at least `v`. The app here is 1.14.5 unless a test sets
 * `globalThis.__bookletStubApiVersion` (the settings tests set "1.11.7" to see the page as the oldest supported Obsidian draws it).
 */
export function requireApiVersion(v) {
	const have = String(globalThis.__bookletStubApiVersion ?? "1.14.5").split(".").map(Number);
	const want = String(v).split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		const d = (have[i] ?? 0) - (want[i] ?? 0);
		if (d) return d > 0;
	}
	return true;
}

/** The classes main.ts and switch.ts name: a view on a file, a note, and the leaf whose prototype the view switch wraps. */
/** A key scope: the handlers registered on it, by modifiers and key. The app's keymap (`app.keymap`) keeps a stack of them. */
export class Scope {
	constructor(parent) {
		this.parent = parent;
		this.handlers = [];
	}
	register(modifiers, key, func) {
		const h = { modifiers, key, func };
		this.handlers.push(h);
		return h;
	}
	unregister(h) {
		this.handlers = this.handlers.filter((x) => x !== h);
	}
}

/** One class, shared by the copy bundled into test/.build/view.mjs and a test that imports this file (main.ts tests `instanceof FileView`). */
export const FileView = (globalThis.__bookletStubFileView ??= class FileView extends Component {});
export class TFile {}
export class WorkspaceLeaf {
	async setViewState() {}
}

/** What the view asks of a click: a plain click opens in the pane, Ctrl or Cmd in a new one. */
export const Keymap = { isModEvent: (evt) => (evt && (evt.ctrlKey || evt.metaKey) ? "tab" : false) };

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

/** Every element a media-aware render made with a src, in order: { tag, src }. One list, shared by every copy of this file. */
export const mediaRequests = (globalThis.__bookletStubMediaRequests ??= []);

const AUDIO = /\.(mp3|m4a|ogg|opus|wav|flac)$/i;
const VIDEO = /\.(mp4|webm|mov|mkv|ogv|3gp)$/i;
/** An element for an address, by the extension of its path: audio, video, or a picture. */
function mediaEl(addr, alt) {
	const path = addr.split(/[?#]/)[0];
	const tag = AUDIO.test(path) ? "audio" : VIDEO.test(path) ? "video" : "img";
	const el = document.createElement(tag);
	if (tag === "img") el.setAttribute("alt", alt);
	else {
		el.setAttribute("controls", "");
		el.setAttribute("aria-label", alt);
	}
	el.setAttribute("src", addr);
	mediaRequests.push({ tag, src: addr });
	return el;
}

/**
 * A render that draws pictures and media: the draft of what Obsidian does, enough to see which elements a piece of prose
 * would have made, and so which addresses a browser would have been asked for. A raw tag is made as written.
 */
export function mediaRender(markdown, el) {
	const defs = new Map();
	const lines = [];
	for (const line of String(markdown).split("\n")) {
		const d = /^\[([^\]]+)\]:\s*<?([^>\s]+)>?(?:\s+"[^"]*")?\s*$/.exec(line);
		if (d) defs.set(d[1].toLowerCase(), d[2]);
		else lines.push(line);
	}
	const FORM =
		/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]|!\[([^\]]*)\]\[([^\]]*)\]|!\[([^\]]+)\](?!\()|<(img|audio|video|iframe|source|embed)\b([^>]*)>(?:<\/\7>)?/gi;
	const text = lines.join("\n");
	let at = 0;
	for (const m of text.matchAll(FORM)) {
		if (m.index > at) el.appendText(text.slice(at, m.index));
		at = m.index + m[0].length;
		if (m[7]) {
			const raw = document.createElement(m[7].toLowerCase());
			for (const a of m[8].matchAll(/([a-z-]+)(?:="([^"]*)")?/gi)) raw.setAttribute(a[1], a[2] ?? "");
			if (raw.getAttribute("src")) mediaRequests.push({ tag: raw.localName, src: raw.getAttribute("src") });
			el.appendChild(raw);
			continue;
		}
		const [alt, addr] =
			m[2] !== undefined
				? [m[1], m[2]]
				: m[3] !== undefined
					? [m[3], m[3]]
					: m[5] !== undefined || m[6] !== undefined
						? [m[4] || m[6] || m[5], defs.get((m[5] || m[4] || m[6]).toLowerCase())]
						: [m[0], undefined];
		if (addr === undefined) el.appendText(m[0]);
		else el.appendChild(mediaEl(addr, alt));
	}
	if (at < text.length) el.appendText(text.slice(at));
}

/** Makes the stub renderer draw pictures and media (mediaRender) until the returned function is called. */
export function useMediaRender() {
	const was = globalThis.__bookletStubRender;
	globalThis.__bookletStubRender = mediaRender;
	return () => {
		globalThis.__bookletStubRender = was;
	};
}

/** Markdown is drawn as its plain words: enough to see which text a drawing came from (see useMediaRender for media). */
export const MarkdownRenderer = {
	render(_app, markdown, el) {
		// a test that needs links or other parts may stand in for the renderer
		if (globalThis.__bookletStubRender) return Promise.resolve(globalThis.__bookletStubRender(markdown, el));
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

/**
 * An icon by name, as Obsidian's (Lucide) set has it: a few names stand for the set here; any other is none. A test that draws icons
 * sets `globalThis.__bookletStubIcons` to a Set of the names Obsidian is to have (the Design view tests model an Obsidian whose set lacks
 * the newer names).
 */
const ICONS = new Set(["heart", "sun", "moon", "book-open", "check"]);
export function getIcon(name) {
	if (!(globalThis.__bookletStubIcons ?? ICONS).has(name)) return null;
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("data-icon", name);
	return svg;
}
