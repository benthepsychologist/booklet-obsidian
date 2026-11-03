// Plugin 0.13.0, lane M: measures the allow card (hand-built, src/allow-card.ts) against the same card built on Obsidian's `Modal`
// (allow-card.modal.ts), in the real app: desktop and phone width, light and dark. Nothing is written to the repository.
//   PLAYWRIGHT=<node_modules path> node measure.js --obsidian <binary> --plugin <folder with main.js, manifest.json, styles.css> \
//       --label <name of this build> --out <scratch folder> --port <debugging port> [--bare] [--only a,b] [--no-phone]
// `--bare` measures a plain `new Modal(app)` (a helper plugin makes one) instead of the plugin's card: what the Modal gives with nothing added.
// Writes <out>/<label>.json (every number) and prints one line per fact. All content is made up (example.org hosts, no network is used).
const fs = require("fs"), path = require("path");
const { launch } = require("../../drive");

const sleep = ms => new Promise(r => setTimeout(r, ms));
function args() {
	const a = process.argv.slice(2), o = {};
	for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : "1"; }
	for (const k of ["obsidian", "label", "out", "port"]) if (!o[k]) { console.error("need --" + k); process.exit(2); }
	if (!o.bare && !o.plugin) { console.error("need --plugin or --bare"); process.exit(2); }
	o.out = path.resolve(o.out); fs.mkdirSync(o.out, { recursive: true });
	o.only = o.only ? o.only.split(",") : null;
	return o;
}
const A = args();
const BOOK = ".workspace-leaf-content[data-type='booklet']";
const R = {};   // every number, by pass and fact
let pass = "";
const rec = (key, val) => { (R[pass] = R[pass] || {})[key] = val; console.log(`[${pass}] ${key}: ${typeof val === "string" ? val : JSON.stringify(val)}`); };

// ---- the vault ----
const front = (id, title, extra = "") => `---\nbooklet: "0.18"\nid: booklet-test/${id}\ntitle: ${title}\nlang: en\n${extra}---\n\n`;
const filler = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}: a made-up line of study text, long enough to wrap on a narrow screen so the page behind the card has something to scroll.`).join("\n\n");
const PASSES = ["desktop-light", "desktop-dark", "phone-light", "phone-dark"];
function makeVault(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(path.join(dir, ".obsidian", "plugins"), { recursive: true });
	fs.writeFileSync(path.join(dir, ".obsidian", "app.json"), JSON.stringify({ promptDelete: false }));
	const note = (rel, text) => fs.writeFileSync(path.join(dir, rel), text);
	note("Plain.booklet.md", front("plain", "Plain") + `> [!activity|a] Plain\n\n${filler}\n\nA piece to play: ![the tone](https://media.example.org/tone.wav)\n\n> [!text|q] A question?\n`);
	for (const p of PASSES) {
		// one booklet for each way the card opens by itself, each pass: a booklet asks about a site once for each run of the app
		note(`Open-${p}.booklet.md`, front(`open-${p}`, "Open " + p, `media-from:\n  - https://declared.example.org\n  - https://second.example.org\n`) + `> [!activity|a] Open\n\n${filler}\n\n> [!text|q] A question?\n`);
		note(`Blur-${p}.booklet.md`, front(`blur-${p}`, "Blur " + p, `media-from:\n  - https://blurred.example.org\n`) + `> [!activity|a] Blur\n\nA page.\n\n> [!text|q] A question?\n`);
		note(`Redraw-${p}.booklet.md`, front(`redraw-${p}`, "Redraw " + p, `media-from:\n  - https://one.example.org\n  - https://two.example.org\n`) + `> [!activity|a] Redraw\n\n${filler}\n\n> [!text|q] A question?\n`);
	}
	fs.writeFileSync(path.join(dir, "tone.txt"), "x");
	const ids = [];
	if (A.bare) {
		// a helper plugin that opens a plain Modal with the kinds of control the card has, from a button of the page
		const d = path.join(dir, ".obsidian", "plugins", "bare"); fs.mkdirSync(d, { recursive: true });
		fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ id: "bare", name: "Bare", version: "0.0.1", minAppVersion: "1.8.10", description: "x", author: "x", isDesktopOnly: false }));
		fs.writeFileSync(path.join(d, "main.js"), `const o = require("obsidian");
class Bare extends o.Modal {
	onOpen() {
		this.containerEl.addClass("bare"); this.modalEl.addClass("bare-card");
		this.titleEl.setText("Bare modal");
		const b = this.contentEl;
		for (const t of ["One", "Two", "Three"]) b.createEl("button", { text: t });
		b.createEl("label", { text: "A box" }).createEl("input", { attr: { type: "checkbox" } });
		b.createEl("input", { attr: { type: "text", "aria-label": "A site" } });
		b.createEl("p", { text: "Some words. ".repeat(80) });
		const f = this.modalEl.createDiv({ cls: "modal-button-container" });
		f.createEl("button", { text: "Close" }).addEventListener("click", () => this.close());
	}
}
module.exports = class extends o.Plugin { onload() { window.__openBare = () => new Bare(this.app).open(); } };
`);
		ids.push("bare");
	} else {
		const d = path.join(dir, ".obsidian", "plugins", "booklet"); fs.mkdirSync(d, { recursive: true });
		for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(A.plugin, f), path.join(d, f));
		fs.writeFileSync(path.join(d, "data.json"), JSON.stringify({ allowedMediaHosts: ["vault.example.org"], noteAllows: { "Plain.booklet.md": ["note.example.org"] } }));
		ids.push("booklet");
	}
	fs.writeFileSync(path.join(dir, ".obsidian", "community-plugins.json"), JSON.stringify(ids));
	return dir;
}

// ---- what the page side needs ----
const SEL = A.bare
	? { container: ".modal-container.bare", card: ".bare-card", title: ".bare-card .modal-title", opener: "#bare-opener", close: ".bare-card .modal-button-container button" }
	: { container: ".modal-container.booklet-allow", card: ".booklet-allow-card", title: ".booklet-allow-card .modal-title", opener: BOOK + " .booklet-allow-btn", close: ".booklet-allow-card .modal-button-container button" };

async function install(page) {
	await page.evaluate(() => {
		if (window.__m) return;
		const ids = new WeakMap(); let n = 0;
		const label = e => (e.getAttribute("aria-label") || e.textContent || e.value || "").replace(/\s+/g, " ").trim().slice(0, 30);
		const d = e => !e ? "null" : e === document.body ? "BODY" : `${e.tagName.toLowerCase()}#${ids.get(e) || (ids.set(e, ++n), n)}:${label(e)}`;
		window.__m = { ids, d, trace: [], t0: performance.now() };
		const log = k => ev => window.__m.trace.push([Math.round(performance.now() - window.__m.t0), k, d(ev.target)]);
		document.addEventListener("focusin", log("in"), true);
		document.addEventListener("focusout", log("out"), true);
	});
}
const reset = page => page.evaluate(() => { window.__m.trace = []; window.__m.t0 = performance.now(); });
const trace = page => page.evaluate(() => window.__m.trace);
const active = (page, sel) => page.evaluate(([sel, card]) => {
	const a = document.activeElement, c = document.querySelector(card);
	return { d: window.__m.d(a), inCard: !!(c && a && c.contains(a)), onBody: !a || a === document.body, isTitle: !!(a && a.matches(sel)) };
}, [SEL.title, SEL.card]);
const cardUp = page => page.evaluate(sel => !!document.querySelector(sel), SEL.container);
const waitCard = async (page, up = true, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await cardUp(page)) === up) return true; await sleep(50); } return false; };

async function closeAll(o) {
	await o.page.evaluate(() => {
		for (const l of app.workspace.getLeavesOfType("booklet")) { const v = l.view; if (v && v.card) v.card.close(); }
		if (app.setting && app.setting.close) app.setting.close();
		for (const el of document.querySelectorAll(".modal-container")) { const b = el.querySelector(".modal-close-button, .modal-header-button"); if (b) b.click(); }
	}).catch(() => {});
	await waitCard(o.page, false, 2000);
	// whatever is left (a bare modal): Escape
	for (let i = 0; i < 3 && await o.page.evaluate(() => !!document.querySelector(".modal-container")); i++) { await o.page.keyboard.press("Escape"); await sleep(200); }
	await o.page.evaluate(() => { const e = document.activeElement; if (e && e.blur) e.blur(); });
}

async function openBooklet(o, rel) {
	const page = o.page;
	await page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, rel, { timeout: 30000, polling: 100 });
	await page.evaluate(async r => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(r)); }, rel);
	await page.waitForSelector(BOOK + " .booklet-page", { timeout: 20000 });
	await sleep(500);
}
const goActivity = async o => {
	// the note opens on its home screen; the Allow list button is at the top of every screen, so nothing more is needed
	await o.page.waitForSelector(BOOK + " .booklet-allow-btn", { timeout: 8000 });
};

/** Opens the card the way a reader does (a real click on the Allow list button; in bare mode on the test button). Returns once it is up. */
async function openByClick(o) {
	if (A.bare) {
		await o.page.evaluate(() => { let b = document.getElementById("bare-opener"); if (!b) { b = document.body.createEl("button", { text: "Open the bare modal", attr: { id: "bare-opener" } }); b.style.position = "fixed"; b.style.top = "4px"; b.style.left = "4px"; b.style.zIndex = "1"; b.addEventListener("click", () => window.__openBare()); } });
	}
	await o.page.locator(SEL.opener).first().click({ timeout: 5000 });
	const up = await waitCard(o.page, true);
	await sleep(1300);   // past the hand-built card's own first second
	return up;
}

// ---- measurements ----
async function ax(cdp, page) {
	// the accessibility tree as a screen reader gets it: the card, its parts, and what lies behind it
	const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
	const { nodes } = await cdp.send("Accessibility.getFullAXTree");
	const byBackend = new Map(), byId = new Map();
	for (const n of nodes) { byId.set(n.nodeId, n); if (n.backendDOMNodeId) byBackend.set(n.backendDOMNodeId, n); }
	const find = async css => {
		const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: css });
		const out = [];
		for (const nodeId of nodeIds) { const { node } = await cdp.send("DOM.describeNode", { nodeId }); out.push(byBackend.get(node.backendNodeId)); }
		return out;
	};
	const props = n => Object.fromEntries((n.properties || []).filter(p => ["modal", "focusable", "disabled", "checked", "level"].includes(p.name)).map(p => [p.name, p.value.value]));
	const show = n => !n ? null : { role: n.role && n.role.value, name: n.name && n.name.value, ignored: !!n.ignored, ...props(n) };
	const dialogOf = n => { for (let p = n; p; p = byId.get(p.parentId)) if (p.role && p.role.value === "dialog") return { name: p.name && p.name.value, ...props(p) }; return null; };
	const out = {};
	const card = (await find(SEL.card))[0];
	out.card = show(card);
	out.dialogAbove = card ? dialogOf(card) : null;
	out.title = show((await find(SEL.title))[0]);
	out.buttons = (await find(SEL.card + " button")).map(show);
	out.checkboxes = (await find(SEL.card + " input[type=checkbox]")).map(show).slice(0, 3);
	out.textbox = show((await find(SEL.card + " input[type=text]"))[0]);
	out.live = show((await find(SEL.card + " [role=status]"))[0]);
	out.headerButton = show((await find(".modal-container .modal-header-button, .modal-container .modal-close-button"))[0]);
	// the page behind: is it still read while the card is up?
	out.behind = show((await find(A.bare ? "#bare-opener" : SEL.opener))[0]);
	return out;
}

async function tabWalk(page, shift) {
	const seq = [];
	const start = await active(page, SEL.title);
	for (let i = 0; i < 40; i++) {
		await page.keyboard.press(shift ? "Shift+Tab" : "Tab");
		seq.push(await active(page, SEL.title));
	}
	const names = seq.map(s => s.d);
	const firstRepeat = names.findIndex((x, i) => names.indexOf(x) < i);
	const outside = seq.map((s, i) => (s.inCard ? null : [i + 1, s.d])).filter(Boolean);
	const focusables = await page.evaluate(card => document.querySelector(card).querySelectorAll("button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])").length, SEL.card);
	return { start: start.d, focusablesInCard: focusables, cycleAfterPresses: firstRepeat >= 0 ? firstRepeat : null, presses: names.length, leftCardAt: outside.length ? outside[0] : null, leftCardCount: outside.length, first6: names.slice(0, 6) };
}

async function focusReturn(o, how) {
	const page = o.page;
	if (!(await openByClick(o))) return { error: "card did not open" };
	const opener = await page.evaluate(sel => { const b = document.querySelector(sel); return window.__m.d(b); }, SEL.opener);
	if (how === "escape") await page.keyboard.press("Escape");
	else if (how === "close-button") await page.locator(SEL.close).first().click({ timeout: 4000 });
	else if (how === "header-x") {
		const b = page.locator(".modal-container .modal-header-button, .modal-container .modal-close-button").first();
		if (!(await b.count())) { await closeAll(o); return { skipped: "this Obsidian has no header button" }; }
		await b.click({ timeout: 4000 });
	} else if (how === "outside") {
		const pt = await page.evaluate(([cont, card]) => {
			const vw = innerWidth, vh = innerHeight, c = document.querySelector(card).getBoundingClientRect();
			for (const [x, y] of [[8, 8], [vw - 8, vh - 8], [vw / 2, 8], [8, vh / 2], [vw - 8, vh / 2], [vw / 2, vh - 8]]) {
				if (x >= c.left && x <= c.right && y >= c.top && y <= c.bottom) continue;
				const e = document.elementFromPoint(x, y);
				if (e && e.closest(cont) && !e.closest(".modal")) return [x, y];
			}
			return null;
		}, [SEL.container, SEL.card]);
		if (!pt) { await closeAll(o); return { skipped: "no part of the backdrop is visible (the card fills the window)" }; }
		await page.mouse.click(pt[0], pt[1]);
	}
	const gone = await waitCard(page, false, 2500);
	await sleep(400);
	const at = await active(page, SEL.title);
	return { opener, closed: gone, focusAfter: at.d, backOnOpener: at.d === opener, onBody: at.onBody };
}

async function section(name, fn) {
	if (A.only && !A.only.includes(name)) return;
	try { await fn(); } catch (e) { rec(name + ".ERROR", String(e && e.message || e).slice(0, 300)); }
}

async function runPass(o, cdp, scheme, phone) {
	const page = o.page;
	pass = (phone ? "phone-" : "desktop-") + scheme;
	console.log("=== " + pass);
	await o.setScheme(scheme);
	await install(page);
	await closeAll(o);
	const shot = n => o.screenshot(path.join(A.out, "shots", `${A.label}-${pass}-${n}.png`)).catch(() => {});
	rec("viewport", await page.evaluate(() => [innerWidth, innerHeight, document.body.classList.contains("is-phone") ? "is-phone" : document.body.classList.contains("is-mobile") ? "is-mobile" : "desktop"]));

	if (!A.bare) { await openBooklet(o, "Plain.booklet.md"); await goActivity(o); }
	await sleep(500);

	await section("opening", async () => {
		// the card opens from the button (and, plugin only, from a press and on its own: below)
		await reset(page);
		const up = await openByClick(o);
		rec("opens-from-button", up);
		const at = await active(page, SEL.title);
		rec("focus-at-open", at.d + (at.inCard ? " (in the card)" : " (NOT in the card)"));
		rec("focus-trace-first-2s", (await trace(page)).slice(0, 12));
		rec("hasFocus-window", await page.evaluate(() => document.hasFocus()));
		rec("dom", await page.evaluate(([cont, card]) => { const c = document.querySelector(cont), m = document.querySelector(card); return { containerClass: c.className, modalClass: m.className, tag: m.tagName, titleTag: m.querySelector(".modal-title").tagName, hasHeaderX: !!c.querySelector(".modal-header-button, .modal-close-button"), bgStyle: c.querySelector(".modal-bg").getAttribute("style") }; }, [SEL.container, SEL.card]));
		await shot("card");
	});

	await section("a11y", async () => {
		if (!(await cardUp(page))) await openByClick(o);
		rec("accessibility-tree", await ax(cdp, page));
	});

	await section("keys", async () => {
		if (!(await cardUp(page))) await openByClick(o);
		// where focus is: put it on the first thing the reader would reach, then walk
		rec("tab-walk", await tabWalk(page, false));
		rec("shift-tab-walk", await tabWalk(page, true));
		// Escape with focus on the page behind (not in the card)
		await page.evaluate(() => { const e = document.activeElement; if (e && e.blur) e.blur(); });
		await page.keyboard.press("Escape");
		const closedOnBody = await waitCard(page, false, 1500);
		rec("escape-with-focus-on-body-closes", closedOnBody);
		if (!closedOnBody) await closeAll(o);
	});

	await section("focus-return", async () => {
		for (const how of ["escape", "close-button", "header-x", "outside"]) {
			await closeAll(o);
			rec("focus-return-after-" + how, await focusReturn(o, how));
			await closeAll(o);
		}
	});

	await section("write-in-redraw", async () => {
		if (A.bare) return;
		// the plain card, a site written in: the note is drawn again behind the card; the card stays, focus stays in the box, the lists gain a row
		await closeAll(o);
		await openByClick(o);
		const before = await page.evaluate(([card, book]) => { window.__m.page = document.querySelector(book + " .booklet-page"); return { rows: document.querySelectorAll(card + " li").length }; }, [SEL.card, BOOK]);
		const input = page.locator(SEL.card + " input[type=text]").first();
		await input.click({ timeout: 4000 });
		await reset(page);
		await input.fill(`written-${pass}.example.org`);
		await input.press("Enter");
		await sleep(1500);
		const after = await page.evaluate(([card, book]) => ({ rows: document.querySelectorAll(card + " li").length, pageRedrawn: window.__m.page !== document.querySelector(book + " .booklet-page") || !window.__m.page.isConnected, live: (document.querySelector(card + " [role=status]") || {}).textContent, hasFocus: window.__m.d(document.activeElement) }), [SEL.card, BOOK]);
		rec("write-in", { cardStillUp: await cardUp(page), before, after, focusTrace: (await trace(page)).slice(0, 10) });
		await closeAll(o);
	});

	if (A.bare) return;

	await section("press", async () => {
		await closeAll(o);
		await openBooklet(o, "Plain.booklet.md"); await goActivity(o);
		await reset(page);
		const btn = page.locator(BOOK + " .booklet-media-play").first();
		await btn.click({ timeout: 6000 });
		const up = await waitCard(page, true);
		await sleep(1300);
		const at = await active(page, SEL.title);
		rec("press-opens-card", { up, title: await page.evaluate(sel => (document.querySelector(sel) || {}).textContent, SEL.title), focus: at.d, inCard: at.inCard });
		await page.keyboard.press("Escape");
		await waitCard(page, false, 2000); await sleep(300);
		const back = await active(page, SEL.title);
		rec("press-escape-returns-focus-to-the-play-button", { focus: back.d, onBody: back.onBody });
		await closeAll(o);
	});

	await section("open-on-note-open", async () => {
		await closeAll(o);
		await reset(page);
		const t0 = Date.now();
		await page.evaluate(async r => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(r)); }, `Open-${pass}.booklet.md`);
		await page.waitForSelector(BOOK + " .booklet-page", { timeout: 20000 });
		const up = await waitCard(page, true, 5000);
		const upAt = Date.now() - t0;
		const samples = [];
		for (const ms of [0, 50, 150, 400, 800, 1500]) { await sleep(ms ? ms - (samples.length ? samples[samples.length - 1].at : 0) : 0); samples.push({ at: ms, ...(await active(page, SEL.title)) }); }
		const last = samples[samples.length - 1];
		rec("open-on-note-open", { cardOpened: up, msFromOpenFileToCard: upAt, focusSamples: samples.map(s => `${s.at}ms ${s.d}${s.inCard ? "" : " (not in card)"}`), finalFocusInCard: last.inCard, finalFocus: last.d, trace: (await trace(page)).slice(0, 14) });
		await shot("open-on-note-open");
		await closeAll(o);
	});

	await section("blur-at-open", async () => {
		await closeAll(o);
		await openBooklet(o, `Blur-${pass}.booklet.md`);
		// the card did not open on note-open here because ... it did: the note names a site. Close it, then open again with another control focused.
		await waitCard(page, true, 3000); await sleep(1300);
		await closeAll(o);
		await page.evaluate(() => { const i = document.querySelector(".booklet-page input, .booklet-page textarea, .booklet-page button"); if (i) i.focus(); });
		const before = await active(page, SEL.title);
		await reset(page);
		await page.evaluate(() => { const v = app.workspace.getLeavesOfType("booklet")[0].view; v.openCard(undefined, document.activeElement); });
		await waitCard(page, true, 3000);
		const at0 = await active(page, SEL.title);
		await sleep(1300);
		const at1 = await active(page, SEL.title);
		rec("open-with-another-control-focused", { beforeOpen: before.d, rightAfterOpen: at0.d + (at0.inCard ? "" : " (not in card)"), after1300ms: at1.d + (at1.inCard ? "" : " (not in card)"), hasFocus: await page.evaluate(() => document.hasFocus()) });
		await closeAll(o);
		// the same with the window reported as not focused (an emulation switch; Xvfb has no window manager, so this is the closest to a blurred window)
		await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false }).catch(() => {});
		await page.evaluate(() => { const e = document.activeElement; if (e && e.blur) e.blur(); });
		await reset(page);
		await page.evaluate(() => { const v = app.workspace.getLeavesOfType("booklet")[0].view; v.openCard(undefined, null); });
		await waitCard(page, true, 3000); await sleep(1300);
		const at2 = await active(page, SEL.title);
		rec("open-with-nothing-focused", { focus: at2.d + (at2.inCard ? "" : " (not in card)"), hasFocus: await page.evaluate(() => document.hasFocus()), trace: (await trace(page)).slice(0, 8) });
		await closeAll(o);
	});

	await section("blur-window", async () => {
		if (phone || pass !== "desktop-light") return;
		await closeAll(o);
		// the window really not focused: a second window (a popout) takes the focus, then the card is asked for by the first window's view
		const r = await page.evaluate(async () => {
			const v = app.workspace.getLeavesOfType("booklet")[0].view;
			const leaf = app.workspace.openPopoutLeaf();
			await new Promise(r => setTimeout(r, 1200));
			const win = leaf.getContainer().win;
			win.focus();
			await new Promise(r => setTimeout(r, 800));
			const before = document.hasFocus();
			v.openCard(undefined, null);
			await new Promise(r => setTimeout(r, 1300));
			const a = document.activeElement, c = document.querySelector(".modal-container");
			const out = { mainWindowHasFocusWhenOpened: before, cardUp: !!c, activeIsInCard: !!(c && a && c.contains(a)), active: a ? a.tagName + ":" + (a.textContent || "").slice(0, 20) : null };
			leaf.detach();
			return out;
		});
		rec("open-while-the-window-is-not-focused", r);
		await closeAll(o);
	});

	await section("redraw-declared", async () => {
		await closeAll(o);
		await reset(page);
		await page.evaluate(async r => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(r)); }, `Redraw-${pass}.booklet.md`);
		await page.waitForSelector(BOOK + " .booklet-page", { timeout: 20000 });
		const up = await waitCard(page, true, 5000);
		await sleep(1300);
		const rows = () => page.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-allow-declared strong")].map(e => e.textContent), SEL.card);
		const r0 = await rows();
		await page.evaluate(book => { window.__m.page = document.querySelector(book + " .booklet-page"); }, BOOK);
		await reset(page);
		await page.locator(SEL.card + " .booklet-allow-declared").nth(0).locator("button", { hasText: /^Allow for this note$/ }).click({ timeout: 5000 });
		await sleep(1500);
		const r1 = await rows();
		const st = await page.evaluate(([card, book]) => ({ pageRedrawn: window.__m.page !== document.querySelector(book + " .booklet-page") || !window.__m.page.isConnected, live: (document.querySelector(card + " [role=status]") || {}).textContent }), [SEL.card, BOOK]);
		const f = await active(page, SEL.title);
		rec("redraw-declared", { opened: up, rowsBefore: r0, rowsAfter: r1, cardStillUp: await cardUp(page), ...st, focusAfter: f.d, focusInCard: f.inCard, focusTrace: (await trace(page)).slice(0, 10) });
		await page.keyboard.press("Escape"); await waitCard(page, false, 2000); await sleep(400);
		const back = await active(page, SEL.title);
		rec("redraw-declared-escape-focus", { focus: back.d, onBody: back.onBody });
		await closeAll(o);
	});

	await section("stacking", async () => {
		if (phone) return;
		await closeAll(o);
		await openBooklet(o, "Plain.booklet.md"); await goActivity(o);
		await openByClick(o);
		await page.evaluate(async () => { await app.setting.open(); await app.setting.openTabById("booklet"); });
		await sleep(800);
		const stack = await page.evaluate(() => [...document.querySelectorAll("body > .modal-container")].map(c => ({ cls: c.className.replace(/\s+/g, " "), z: getComputedStyle(c).zIndex, title: (c.querySelector(".modal-title") || {}).textContent })));
		const top = await page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); const c = e && e.closest(".modal-container"); return c ? c.className.replace(/\s+/g, " ") : null; });
		await page.keyboard.press("Escape"); await sleep(500);
		const afterEsc = await page.evaluate(() => [...document.querySelectorAll("body > .modal-container")].map(c => c.className.replace(/\s+/g, " ")));
		const where = await page.evaluate(() => ({ settingsIsOpen: app.setting.isOpen, settingsAsOwnWindow: !!app.setting.popout, settingsContainerInThisWindow: app.setting.containerEl.isConnected && document.contains(app.setting.containerEl) })); const windows = page.context().pages().length;
		rec("card-then-settings", { where, windowsOpen: windows, stack, centreBelongsTo: top, afterOneEscape: afterEsc });
		await closeAll(o);
		// settings first, then the card (a press cannot reach the page then; the card is asked for by the view, as a press or an opening note would)
		await page.evaluate(async () => { await app.setting.open(); await app.setting.openTabById("booklet"); }); await sleep(800);
		await page.evaluate(() => { app.workspace.getLeavesOfType("booklet")[0].view.openCard(undefined, null); }); await sleep(1300);
		const stack2 = await page.evaluate(() => [...document.querySelectorAll("body > .modal-container")].map(c => ({ cls: c.className.replace(/\s+/g, " "), title: (c.querySelector(".modal-title") || {}).textContent })));
		const a2 = await active(page, SEL.title);
		await page.keyboard.press("Escape"); await sleep(500);
		const afterEsc2 = await page.evaluate(() => [...document.querySelectorAll("body > .modal-container")].map(c => c.className.replace(/\s+/g, " ")));
		rec("settings-then-card", { windowsOpen: page.context().pages().length, stack: stack2, focus: a2.d, inCard: a2.inCard, afterOneEscape: afterEsc2 });
		await closeAll(o);
		rec("z-index", await page.evaluate(() => { const bar = document.createElement("div"); bar.className = "booklet-nowplaying"; document.body.appendChild(bar); const z = getComputedStyle(bar).zIndex; bar.remove(); const m = document.createElement("div"); m.className = "modal-container"; document.body.appendChild(m); const zm = getComputedStyle(m).zIndex; m.remove(); return { nowPlayingBar: z, modalContainer: zm }; }));
	});

	await section("popout", async () => {
		if (phone || pass !== "desktop-light") return;
		await closeAll(o);
		// the view's own window: a card asked for by a view in a popout window opens in that window with the hand-built card; the Modal opens "on the active window"
		const res = await page.evaluate(async () => {
			const leaf = app.workspace.openPopoutLeaf();
			await leaf.openFile(app.vault.getAbstractFileByPath("Plain.booklet.md"));
			await new Promise(r => setTimeout(r, 2500));
			const v = app.workspace.getLeavesOfType("booklet").map(l => l.view).find(v => v.contentEl.ownerDocument !== document);
			if (!v) return { error: "no booklet view in a popout window", types: app.workspace.getLeavesOfType("booklet").length };
			const doc = v.contentEl.ownerDocument;
			v.openCard(undefined, null);
			await new Promise(r => setTimeout(r, 1200));
			const inPopout = !!doc.querySelector(".modal-container");
			const inMain = !!document.querySelector(".modal-container");
			const ae = doc.activeElement;
			return { cardInPopoutWindow: inPopout, cardInMainWindow: inMain, focusInPopout: ae ? ae.tagName + ":" + (ae.textContent || "").slice(0, 20) : null };
		});
		rec("card-asked-for-by-a-view-in-a-popout-window", res);
		// the realistic way: a reader presses the Allow list button in the popout window itself (a real click there), so that window is the active one
		const pop = await (async () => {
			await page.evaluate(async () => { const leaf = app.workspace.openPopoutLeaf(); await leaf.openFile(app.vault.getAbstractFileByPath("Plain.booklet.md")); await new Promise(r => setTimeout(r, 2500)); });
			let other = null;
			for (const p of page.context().pages()) if (p !== page && await p.evaluate(() => !!document.querySelector(".booklet-allow-btn")).catch(() => false)) other = p;
			const pages = page.context().pages().map(p => p.url().slice(-40));
			if (!other) return { error: "no page for the popout window", pages };
			await other.locator(".booklet-allow-btn").first().click({ timeout: 5000 });
			await sleep(1500);
			const inPop = await other.evaluate(() => { const c = document.querySelector(".modal-container"); const a = document.activeElement; return { cardInPopoutWindow: !!c, focusIn: !!(c && a && c.contains(a)) }; });
			const inMain = await page.evaluate(() => !!document.querySelector(".modal-container"));
			return { ...inPop, cardInMainWindow: inMain, pages };
		})().catch(e => ({ error: String(e.message).slice(0, 200) }));
		rec("card-opened-by-a-click-in-the-popout-window", pop);
		await page.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) { const v = l.view; if (v && v.card) v.card.close(); } app.workspace.iterateAllLeaves(l => { if (l.getContainer && l.getContainer() !== app.workspace.rootSplit.getContainer()) l.detach(); }); });
		await sleep(500);
	});

	if (phone) await section("phone", async () => {
		await closeAll(o);
		await openBooklet(o, "Plain.booklet.md"); await goActivity(o);
		await page.evaluate(book => { const s = document.querySelector(book + " .booklet-page"); s && s.scrollIntoView && s.scrollIntoView(); }, BOOK);
		for (const kind of ["plain", "declared"]) {
			await closeAll(o);
			if (kind === "plain") await openByClick(o);
			else { await page.evaluate(async r => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(r)); }, `Blur-${pass}.booklet.md`); await sleep(800); await closeAll(o); await page.evaluate(() => app.workspace.getLeavesOfType("booklet")[0].view.openCard({ kind: "declared", hosts: ["a.example.org", "b.example.org", "c.example.org", "d.example.org", "e.example.org", "f.example.org", "g.example.org", "h.example.org"] }, null)); await waitCard(page, true, 3000); await sleep(1300); }
			const m = await page.evaluate(([card, cont, book]) => {
				const c = document.querySelector(card), r = c.getBoundingClientRect(), cs = getComputedStyle(c);
				const scrollers = [...document.querySelectorAll(book + " *")].filter(e => e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(e).overflowY));
				const smalls = [...c.querySelectorAll("button, input[type=text], input[type=checkbox]")].map(e => { const b = e.getBoundingClientRect(); const lab = e.tagName === "INPUT" && e.type === "checkbox" ? e.closest("label") : null; const h = lab ? lab.getBoundingClientRect().height : b.height; return { what: e.tagName.toLowerCase() + ":" + (e.getAttribute("aria-label") || e.textContent || e.type || "").trim().slice(0, 22), h: Math.round(h) }; }).filter(x => x.h > 0);
				return { viewport: [innerWidth, innerHeight], card: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }, fits: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1, overflowY: cs.overflowY, scrollsInside: c.scrollHeight > c.clientHeight + 1, scrollHeight: c.scrollHeight, clientHeight: c.clientHeight, controlsUnder44: smalls.filter(x => x.h < 44), controlCount: smalls.length, minControl: Math.min(...smalls.map(x => x.h)), pageScrollers: scrollers.length, cardScrollers: [c, ...c.querySelectorAll("*")].filter(e => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)).map(e => e.className.toString().split(" ")[0] + " " + e.clientHeight + "/" + e.scrollHeight) };
			}, [SEL.card, SEL.container, BOOK]);
			rec("phone-card-" + kind, m);
			// scroll the card with the wheel (over it, and past its end): the page behind must not move
			const behind = () => page.evaluate(book => { const t = [...document.querySelectorAll(book + " *")].filter(e => e.scrollHeight > e.clientHeight + 2).map(e => Math.round(e.scrollTop)); return { scrollTops: t, doc: Math.round(document.scrollingElement.scrollTop) }; }, BOOK);
			const b0 = await behind();
			const box = await page.locator(SEL.card).boundingBox();
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 400); await sleep(40); }
			const b1 = await behind();
			const cardTop = await page.evaluate(sel => [document.querySelector(sel), ...document.querySelectorAll(sel + " *")].filter(e => e.scrollTop > 0).map(e => e.className.toString().split(" ")[0] + " " + Math.round(e.scrollTop)), SEL.card);
			// Close (or the last button): reachable at the end of the scroll, and not under anything
			const lastBtn = await page.evaluate(([card]) => { const bs = [...document.querySelectorAll(card + " button")]; const b = bs[bs.length - 1]; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { label: b.textContent.trim(), inViewport: r.top >= 0 && r.bottom <= innerHeight + 1, top: Math.round(r.top), bottom: Math.round(r.bottom), topmost: !!e && (e === b || b.contains(e)) }; }, [SEL.card]);
			rec("phone-scroll-" + kind, { pageBehindUnchanged: JSON.stringify(b0) === JSON.stringify(b1), pageBefore: b0, pageAfter: b1, cardScrolledTo: cardTop, lastButton: lastBtn });
			await shot("phone-" + kind);
			// animation on opening
			rec("phone-motion-" + kind, await page.evaluate(sel => { const c = document.querySelector(sel); const s = getComputedStyle(c); return { animationName: s.animationName, animationDuration: s.animationDuration, transition: s.transition.slice(0, 80) }; }, SEL.card));
		}
		await closeAll(o);
	});

	if (!phone) await section("desktop-motion", async () => {
		await closeAll(o);
		await openByClick(o);
		rec("desktop-motion", await page.evaluate(sel => { const c = document.querySelector(sel); const s = getComputedStyle(c); return { animationName: s.animationName, animationDuration: s.animationDuration, transition: s.transition.slice(0, 80), maxHeight: s.maxHeight, overflowY: s.overflowY, width: Math.round(c.getBoundingClientRect().width), height: Math.round(c.getBoundingClientRect().height) }; }, SEL.card));
		await closeAll(o);
	});
}

(async () => {
	const dir = path.join(A.out, "work-" + A.label);
	const vault = makeVault(path.join(dir, "vault"));
	const cfg = path.join(dir, "config");
	fs.rmSync(cfg, { recursive: true, force: true });
	const o = await launch({ obsidian: A.obsidian, vault, configDir: cfg, port: +A.port, enablePlugins: true, timeout: 90000 });
	// If this script dies early the app and its virtual display must not be left running: kill ONLY the pids this run started (the Obsidian whose
	// command line carries our debugging port, and the Xvfb on the display drive.js made). No pattern kills.
	const reap = () => {
		for (const d of fs.readdirSync("/proc")) if (/^\d+$/.test(d)) {
			let c; try { c = fs.readFileSync("/proc/" + d + "/cmdline", "utf8").split("\0"); } catch (e) { continue; }
			const line = c.join(" ");
			if (line.includes(" --remote-debugging-port=" + o.port + " ") && !/ --type=/.test(line)) { try { process.kill(-d, "SIGKILL"); } catch (e) { try { process.kill(+d, "SIGKILL"); } catch (e2) { /* gone */ } } }
			if (!process.env.DISPLAY && /(^|\/)Xvfb$/.test(c[0] || "") && c[1] === o.display) { try { process.kill(+d, "SIGKILL"); } catch (e) { /* gone */ } }
		}
	};
	process.on("exit", reap); for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => process.exit(1));
	try {
		const page = o.page, cdp = await page.context().newCDPSession(page);
		rec0("obsidian", await page.evaluate(() => (navigator.userAgent.match(/obsidian\/([\d.]+)/i) || [])[1] || navigator.userAgent.slice(-60)));
		rec0("label", A.label);
		await cdp.send("DOM.enable"); await cdp.send("Accessibility.enable");
		if (!A.bare) await page.evaluate(async () => { for (let i = 0; i < 100 && !app.plugins.plugins.booklet; i++) await new Promise(r => setTimeout(r, 100)); });
		else await page.evaluate(async () => { for (let i = 0; i < 100 && !window.__openBare; i++) await new Promise(r => setTimeout(r, 100)); });
		for (const scheme of ["light", "dark"]) await runPass(o, cdp, scheme, false);
		if (!A.noPhone && !A["no-phone"]) {
			pass = "phone-setup";
			const canEmulate = await page.evaluate(() => typeof app.emulateMobile === "function");
			rec("app.emulateMobile-exists", canEmulate);
			if (canEmulate) {
				await page.evaluate(() => app.emulateMobile(true));
				await page.waitForFunction(() => !!(window.app && app.workspace && app.workspace.layoutReady) && document.body.classList.contains("is-mobile"), null, { timeout: 40000, polling: 100 });
				await page.evaluate(async bare => { for (let i = 0; i < 100 && !(bare ? window.__openBare : app.plugins.plugins.booklet); i++) await new Promise(r => setTimeout(r, 100)); }, !!A.bare);
				await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
				await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
				await sleep(1500);
				await install(page);
				for (const scheme of ["light", "dark"]) await runPass(o, cdp, scheme, true);
			}
		}
	} catch (e) {
		console.log("FATAL " + (e && e.stack || e));
		console.log("Obsidian's last words: " + o.output().split("\n").slice(-8).join(" | ").slice(-800));
		R.fatal = String(e && e.message || e);
	} finally {
		fs.writeFileSync(path.join(A.out, A.label + ".json"), JSON.stringify(R, null, 1));
		await o.close();
	}
})();
function rec0(k, v) { (R.meta = R.meta || {})[k] = v; console.log(`[meta] ${k}: ${v}`); }
