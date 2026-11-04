// Helpers for driving Obsidian's web view on the emulated phone. `browser` is a WebdriverIO browser whose context is WEBVIEW_md.obsidian.
// The page-side functions below run inside Obsidian (they are serialised by WebdriverIO, so each is self-contained).
import fs from "node:fs";
import path from "node:path";
import { StepError, waitFor, sleep } from "./wait.mjs";

export const BOOK = ".workspace-leaf-content[data-type='booklet']";
export const APP_ID = "md.obsidian";
export const WEBVIEW = "WEBVIEW_md.obsidian";

export class Phone {
	/**
	 * @param {object} p
	 * @param {WebdriverIO.Browser} p.browser  @param {import("./sdk.mjs").Adb} p.adb
	 * @param {string} p.runDir  folder of this run (screenshots/ goes inside)
	 * @param {number} p.scale  --timeout-scale
	 * @param {(s: string) => void} p.log
	 * @param {() => Promise<WebdriverIO.Browser>} [p.newSession]  makes a fresh Appium session when switching context does not work after a restart
	 */
	constructor({ browser, adb, runDir, scale = 1, log = () => {}, newSession }) {
		this.browser = browser;
		this.adb = adb;
		this.runDir = runDir;
		this.scale = scale;
		this.log = log;
		this.newSession = newSession;
		this.shotNo = 0;
		this.shots = []; // screenshots taken since takeShots() was last called
		this.jsClicks = 0; // taps that had to be sent as a script click because the WebDriver click was refused
	}

	/** Runs a function inside Obsidian's page. */
	ev(fn, ...args) {
		return this.browser.execute(fn, ...args);
	}

	wait(fn, opts) {
		return waitFor(fn, { scale: this.scale, ...opts });
	}

	/** A screenshot of the whole phone screen (status bar included), via adb. Returns the path relative to the run folder. */
	async shot(name) {
		const rel = path.posix.join("screenshots", `${String(++this.shotNo).padStart(2, "0")}-${name.replace(/[^A-Za-z0-9_-]+/g, "-")}.png`);
		try {
			fs.mkdirSync(path.join(this.runDir, "screenshots"), { recursive: true });
			fs.writeFileSync(path.join(this.runDir, rel), await this.adb.screenshot());
			this.shots.push(rel);
			return rel;
		} catch (e) {
			this.log(`  (screenshot ${name} failed: ${e.message})`);
			return null;
		}
	}

	takeShots() {
		const s = this.shots;
		this.shots = [];
		return s;
	}

	/** Taps an element: a WebDriver click, and if that is refused, a click sent by script (counted, and written in the results). */
	async tap(selector, what, { timeout = 10000 } = {}) {
		await this.wait(async () => (await this.browser.$(selector)).isExisting(), { what: `${what} to be on the page (${selector})`, timeout });
		const el = await this.browser.$(selector);
		try {
			await el.scrollIntoView({ block: "center" }).catch(() => {});
			await el.waitForClickable({ timeout: Math.round(timeout * this.scale) });
			await el.click();
		} catch (e) {
			this.jsClicks++;
			this.log(`  (the WebDriver click on ${what} was refused: ${String(e.message).split("\n")[0].slice(0, 120)}; clicked by script)`);
			const ok = await this.ev((s) => {
				const b = document.querySelector(s);
				if (!b) return false;
				b.click();
				return true;
			}, selector);
			if (!ok) throw new StepError(`tap ${what}`, `${selector} is not on the page`);
		}
	}

	async typeInto(selector, text, what) {
		await this.wait(async () => (await this.browser.$(selector)).isExisting(), { what: `${what} to be on the page`, timeout: 10000 });
		const el = await this.browser.$(selector);
		try {
			await el.scrollIntoView({ block: "center" }).catch(() => {});
			await el.setValue(text);
			return "typed with the WebDriver";
		} catch (e) {
			this.log(`  (typing into ${what} by WebDriver failed: ${String(e.message).split("\n")[0].slice(0, 120)}; set by script)`);
			await this.ev((s, t) => {
				const f = document.querySelector(s);
				f.focus();
				f.value = t;
				f.dispatchEvent(new Event("input", { bubbles: true }));
				f.dispatchEvent(new Event("change", { bubbles: true }));
			}, selector, text);
			return "set by script (the WebDriver could not type)";
		}
	}

	/** Opens a note as a Booklet view in an otherwise empty workspace and waits for its page. */
	async openNote(rel) {
		await this.wait(() => this.ev((r) => {
			const f = app.vault.getAbstractFileByPath(r);
			const c = f && app.metadataCache.getFileCache(f);
			return !!(c && c.frontmatter && c.frontmatter.booklet);
		}, rel), { what: `Obsidian to index ${rel} (its front matter in the metadata cache)`, timeout: 60000 });
		await this.ev(() => {
			app.workspace.detachLeavesOfType("booklet");
			app.workspace.detachLeavesOfType("markdown");
		});
		let tries = 0;
		await this.wait(async () => {
			if (tries++ % 8 === 0) {
				await this.ev(async (r) => {
					await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(r));
				}, rel);
			}
			return this.ev((r) => app.workspace.getLeavesOfType("booklet").some((l) => l.view && l.view.file && l.view.file.path === r), rel);
		}, { what: `${rel} to open in the Booklet view`, timeout: 40000, interval: 500 });
		await this.wait(() => this.ev((sel) => !!document.querySelector(sel + " .booklet-page"), BOOK), { what: `a Booklet page to be drawn for ${rel}`, timeout: 20000 });
	}

	/** Moves the open Booklet view to a screen (the same call the desktop checks make) and waits for it. */
	async goScreen(screen) {
		await this.ev(async (screen) => {
			const l = app.workspace.getLeavesOfType("booklet")[0];
			await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 2, screen, part: 0 }, active: true });
		}, screen);
		await this.wait(() => this.ev((sel, s) => !!document.querySelector(`${sel} .booklet-page[data-booklet-screen='${s}']`), BOOK, screen), { what: `the page for ${screen} to be drawn`, timeout: 20000 });
	}

	/** Width and sideways overflow of the open Booklet view, and where its Pages button sits. */
	metrics() {
		return this.ev((sel) => {
			const l = app.workspace.getLeavesOfType("booklet")[0];
			const v = l ? l.view.contentEl : document.body;
			const d = document.documentElement;
			const r = (e) => {
				if (!e) return null;
				const x = e.getBoundingClientRect();
				return { left: Math.round(x.left), right: Math.round(x.right), top: Math.round(x.top), bottom: Math.round(x.bottom), w: Math.round(x.width), h: Math.round(x.height) };
			};
			const btn = v.querySelector(".booklet-pagesbtn");
			const list = v.querySelector(".booklet-pagelist");
			return {
				innerWidth, innerHeight, dpr: devicePixelRatio,
				phone: document.body.classList.contains("is-phone"), mobile: document.body.classList.contains("is-mobile"),
				sideways: Math.max(v.scrollWidth - v.clientWidth, d.scrollWidth - d.clientWidth),
				btn: r(btn), expanded: btn ? btn.getAttribute("aria-expanded") : null,
				list: r(list), links: v.querySelectorAll(".booklet-pagelist a").length,
				screen: (v.querySelector(".booklet-page") || { getAttribute: () => null }).getAttribute("data-booklet-screen"),
			};
		}, BOOK);
	}

	/** After Obsidian has been stopped and started: get the web view again and wait until the vault is open with Booklet loaded. */
	async reattach({ launch = true } = {}) {
		if (launch) await this.adb.shell(`monkey -p ${APP_ID} -c android.intent.category.LAUNCHER 1`, { loose: true, timeout: 30000 });
		await this.wait(async () => (await this.adb.pidOf(APP_ID)) !== "", { what: "Obsidian to be running again", timeout: 60000, interval: 500 });
		await this.wait(async () => /webview_devtools_remote_/.test(await this.adb.shell("cat /proc/net/unix", { loose: true })), { what: "Obsidian's web view to be inspectable", timeout: 90000, interval: 1000 });
		const attach = async (browser) => {
			await browser.switchContext("NATIVE_APP").catch(() => {});
			await this.wait(async () => (await browser.getContexts()).includes(WEBVIEW), { what: `the context ${WEBVIEW} to be listed`, timeout: 60000, interval: 500 });
			await browser.switchContext(WEBVIEW);
			await this.wait(() => browser.execute(() => !!window.app && !!app.workspace && app.workspace.layoutReady === true), { what: "Obsidian to have its workspace ready", timeout: 120000, interval: 500 });
		};
		try {
			await attach(this.browser);
		} catch (first) {
			if (!this.newSession) throw first;
			this.log(`  (switching context after the restart failed: ${String(first.message).split("\n")[0].slice(0, 160)}; starting a new Appium session)`);
			try {
				await this.browser.deleteSession();
			} catch {
				/* the old session may already be unusable */
			}
			this.browser = await this.newSession();
			await attach(this.browser);
			this.reattachedWithNewSession = true;
		}
		await this.wait(() => this.ev(() => !!(app.plugins && app.plugins.plugins && app.plugins.plugins.booklet)), { what: "the Booklet plugin to be loaded again", timeout: 60000 });
	}

	async close() {
		try {
			await this.browser.deleteSession();
		} catch {
			/* already gone */
		}
	}
}

export { sleep };
