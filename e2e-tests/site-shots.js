// Screenshots of the real Obsidian app for the "install the Booklet plugin and open your first booklet" walkthrough on bookletmd.org.
//
// For each (platform, scheme) pair it starts a brand-new empty vault (a folder named `Notes`) and a brand-new config folder, so
// Obsidian is exactly as a new user sees it: Restricted mode (community plugins off), nothing installed, Obsidian's default theme,
// set to the light or dark scheme. It then walks the real interface with clicks and typing, as a person would, and takes one PNG per step.
//
// Usage:   PLAYWRIGHT=<node_modules with playwright-core> node site-shots.js \
//            --obsidian <binary> --out <dir> [--booklet <path to a .booklet.md>] [--plugin-dir <fallback plugin files>] \
//            [--platforms computer,phone] [--schemes light,dark] [--keep] [--search <word>]
//   --out         where the PNGs and shots.json go. The scratch vault and config folder of each run are made under <out>/.work-<platform>-<scheme>
//                 (never ~/.config, never a real vault) and removed at the end of the run (--keep leaves them).
//   --booklet     the note copied into the vault at step 6. Default: site-paper/static/downloads/samples/what-is-a-booklet.booklet.md of the
//                 worktree beside this repository's, else /workspace/fleet/sites/bookletmd-site/static/downloads/samples/what-is-a-booklet.booklet.md.
//   --search      the word typed in the browser's search box (default Booklet; a word the directory lacks is how the fallback is tested).
//   --plugin-dir  only used when the community plugin directory cannot be reached: the folder with main.js, manifest.json and styles.css that is
//                 copied into the vault's .obsidian/plugins/booklet/. Default: /workspace/booklet-obsidian/test-vault/.obsidian/plugins/booklet.
//
// Shots (file: <out>/<platform>-<NN>-<slug>-<scheme>.png), each with the control to press ringed (3px outline, 3px offset, #1E5E6B on light and
// #55D0E8 on dark; a stylesheet and a class added to the element for the shot and removed after it; nothing else of Obsidian is altered):
//   01-settings           the main window of the fresh vault, the Settings gear ringed. Computer: the gear at the bottom left of the sidebar.
//                         Phone: the sidebar is a drawer, so a person taps the sidebar button at the top left, then the gear; the shot shows
//                         the drawer open with the gear ringed.
//   02-turn-on            Settings open at Community plugins, the "Exit Restricted mode" button ringed (then pressed).
//   03-browse             after "Browse", the community plugin browser with "Booklet" typed in its search, the Booklet result ringed.
//   04-install            Booklet's page in the browser, Install ringed (then pressed, and waited for until Enable shows).
//   05-enable             the same page after the install, Enable ringed (then pressed).
//   06-file               Settings closed, the booklet note copied into the vault, the file list with that file ringed.
//   07-open               the file opened by clicking it: the booklet view as a fresh install shows it (no Booklet look is set).
//   08-open-as-booklet    the same note as plain text (via the plugin's own "Show Markdown"), the "Open as booklet" control ringed.
// On the computer, the Settings and the community plugin browser are windows of their own in Obsidian 1.14.5 (a second and a third page over
// CDP), so steps 2 to 5 are shots of those windows (the 03 shot is clipped to the top of the browser window, as the rest of it is empty);
// the other computer shots are the main window at 1100x800. On the phone (Obsidian's phone mode, `app.emulateMobile(true)`, 390x844 with touch,
// as themes-shots.js) Settings and the browser are panels of the one window.
//
// What is real: steps 3 to 5 use Obsidian's own community plugin directory and download Booklet from GitHub. If the directory cannot be
// reached (the browser does not load, or Booklet is not in it) nothing is faked: the run records what Obsidian showed, takes no 03 to 05 shots,
// installs the plugin by copying the files of --plugin-dir into the vault, enables it, and marks every later shot of that run "real": false.
// Output: <out>/shots.json, one entry per file: file, platform, scheme, step, slug, shows (alt text), real, size, and a note where one applies.
const fs = require("fs"), path = require("path");
const { launch } = require("./drive");           // needs PLAYWRIGHT=<node_modules path> in the environment
const { quiet, mobile } = require("./waits");

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const list = s => String(s).split(",").map(x => x.trim()).filter(Boolean);
const say = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PLATFORMS = list(arg("platforms", "computer,phone")), SCHEMES = list(arg("schemes", "light,dark"));
for (const p of PLATFORMS) if (!["computer", "phone"].includes(p)) { console.error("unknown platform " + p); process.exit(2); }
for (const s of SCHEMES) if (!["light", "dark"].includes(s)) { console.error("unknown scheme " + s); process.exit(2); }
const SAMPLE = "static/downloads/samples/what-is-a-booklet.booklet.md";
const sampleDefault = [path.join("/workspace/booklet-wt/site-paper", SAMPLE), path.join("/workspace/fleet/sites/bookletmd-site", SAMPLE)].find(f => fs.existsSync(f));
const opt = {
  obsidian: arg("obsidian"), out: arg("out"), keep: argv.includes("--keep"),
  booklet: path.resolve(arg("booklet", sampleDefault || "")),
  pluginDir: path.resolve(arg("plugin-dir", "/workspace/booklet-obsidian/test-vault/.obsidian/plugins/booklet")),
};
if (!opt.obsidian || !opt.out) { console.error("needs --obsidian <binary> and --out <dir>; see the header of this file"); process.exit(2); }
if (!fs.existsSync(opt.booklet)) { console.error("no booklet file at " + opt.booklet + " (give --booklet)"); process.exit(2); }
const OUT = path.resolve(opt.out), HOME_CONFIG = path.join(process.env.HOME || "", ".config");
if (OUT === HOME_CONFIG || OUT.startsWith(HOME_CONFIG + path.sep)) { console.error("refusing to write under ~/.config"); process.exit(2); }
const BOOKLET_NAME = path.basename(opt.booklet);
// --search is for testing the fallback only: a word the directory does not hold makes the run take the files-copied-in path.
const SEARCH = arg("search", "Booklet");
const RING = { light: "#1E5E6B", dark: "#55D0E8" };

const entries = [];
let failures = 0;

/* ---------- ring ---------- */
async function ringOn(page, loc, scheme, offset = 3) {
  await page.evaluate(css => {
    let s = document.getElementById("site-shots-ring-style");
    if (!s) { s = document.createElement("style"); s.id = "site-shots-ring-style"; document.head.appendChild(s); }
    s.textContent = css;
  }, `.site-shots-ring { outline: 3px solid ${RING[scheme]} !important; outline-offset: ${offset}px !important; }`);
  await loc.first().scrollIntoViewIfNeeded().catch(() => {});
  await loc.first().evaluate(el => el.classList.add("site-shots-ring"));
}
const ringOff = page => page.evaluate(() => {
  document.querySelectorAll(".site-shots-ring").forEach(e => e.classList.remove("site-shots-ring"));
  const s = document.getElementById("site-shots-ring-style"); if (s) s.remove();
}).catch(() => {});

/* ---------- finding windows and elements ---------- */
const pagesOf = o => o.page.context().pages();
/* The page (the main window or another window) in which `sel` is present and visible. */
async function pageWith(o, sel, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const p of pagesOf(o)) {
      if (p.isClosed()) continue;
      const ok = await p.evaluate(s => { const e = document.querySelector(s); return !!(e && e.getClientRects().length); }, sel).catch(() => false);
      if (ok) return p;
    }
    await sleep(150);
  }
  throw new Error("nothing visible matches " + sel + " in any Obsidian window");
}
const quietPage = async p => { await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await sleep(150); };
const noNotice = (p, ms = 12000) => p.waitForFunction(() => !document.querySelector(".notice"), null, { timeout: ms }).catch(() => {});

/* ---------- one (platform, scheme) run ---------- */
async function run(platform, scheme) {
  const tag = platform + "-" + scheme, phone = platform === "phone";
  const work = path.join(OUT, ".work-" + tag), vault = path.join(work, "Notes"), cfg = path.join(work, "cfg");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(vault, { recursive: true });
  say(`\n== ${tag}: vault ${vault}`);
  const o = await launch({ obsidian: opt.obsidian, vault, configDir: cfg, enablePlugins: false, timeout: 90000 });
  const bye = () => { o.close().catch(() => {}).finally(() => process.exit(130)); };
  process.on("SIGINT", bye); process.on("SIGTERM", bye);
  let real = true, runNote = null, taken = 0;
  const labels = {};
  const note = t => { say("NOTE " + tag + ": " + t); runNote = runNote ? runNote + " " + t : t; };

  const shot = async (page, step, slug, ring, shows, { clip, offset } = {}) => {
    const file = `${platform}-${String(step).padStart(2, "0")}-${slug}-${scheme}.png`;
    await page.mouse.move(0, 0).catch(() => {});
    if (ring) await ringOn(page, ring, scheme, offset);
    await quietPage(page);
    const fullPath = path.join(OUT, file);
    fs.rmSync(fullPath, { force: true });
    await page.screenshot(clip ? { path: fullPath, clip } : { path: fullPath });
    if (ring) await ringOff(page);
    const size = await page.evaluate(() => innerWidth + "x" + innerHeight);
    const e = { file, platform, scheme, step, slug, shows, real: real, size: clip ? clip.width + "x" + clip.height + " (clipped from " + size + ")" : size };
    if (!e.real && runNote) e.note = runNote;
    entries.push(e); taken++;
    say(`PASS ${file} ${e.size} real=${e.real}`);
  };

  try {
    const cdp = await o.page.context().newCDPSession(o.page);
    if (phone) {
      await mobile(o, true);
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    } else {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
    }
    await o.setScheme(scheme);
    await o.evaluate(() => { const e = document.activeElement; if (e && e.blur) e.blur(); });
    await o.page.waitForFunction(() => app.workspace.layoutReady, null, { timeout: 15000 });
    const startState = await o.evaluate(() => ({ restricted: !app.plugins.isEnabled(), enabled: [...app.plugins.enabledPlugins], installed: Object.keys(app.plugins.manifests), body: document.body.className }));
    say(`start state: restricted=${startState.restricted} installed=[${startState.installed}] enabled=[${startState.enabled}]`);
    if (!startState.restricted || startState.installed.length) throw new Error("the vault did not start fresh (community plugins on, or a plugin installed)");
    await sleep(800);
    const main = o.page;

    /* 1. Settings */
    let gear;
    if (phone) {
      await main.locator(".view-action.mod-left-split-toggle").locator("visible=true").first().click();
      await main.waitForSelector(".workspace-drawer-header-icon.mod-settings", { state: "visible", timeout: 8000 });
      await sleep(700);
      gear = main.locator(".workspace-drawer-header-icon.mod-settings");
      labels.settings = "gear at the bottom right of the sidebar drawer (opened with the sidebar button at the top left); no text label, no tooltip";
    } else {
      gear = main.locator(".workspace-drawer-vault-actions .clickable-icon:has(.lucide-settings)");
      labels.settings = "gear at the bottom left of the sidebar; no text label, no tooltip";
    }
    await shot(main, 1, "settings", gear,
      phone ? "The Obsidian sidebar drawer of a new, empty vault named Notes, with the Settings gear at the bottom right ringed."
            : "The Obsidian window of a new, empty vault named Notes, with the Settings gear at the bottom left of the sidebar ringed.");
    await gear.first().click();

    /* 2. Community plugins, turn on */
    const sp = await pageWith(o, ".vertical-tab-nav-item");
    await sp.locator(".vertical-tab-nav-item", { hasText: "Community plugins" }).first().click();
    const turnOn = sp.locator("button", { hasText: /Exit Restricted mode|Turn on community plugins/i });
    await turnOn.first().waitFor({ state: "visible", timeout: 10000 });
    labels.communityTab = await sp.locator(".vertical-tab-nav-item", { hasText: "Community plugins" }).first().innerText();
    labels.turnOn = (await turnOn.first().innerText()).trim();
    labels.turnOnRow = await sp.evaluate(() => { const b = [...document.querySelectorAll(".vertical-tab-content .setting-item")].find(r => /Allow community plugins/i.test(r.innerText)); return b ? b.innerText.replace(/\s+/g, " ").trim() : null; });
    await shot(sp, 2, "turn-on", turnOn,
      `The Settings window open at Community plugins, with the "${labels.turnOn}" button, which turns community plugins on, ringed.`.replace("window", phone ? "panel" : "window"));
    await turnOn.first().click();
    const browse = sp.locator("button", { hasText: /^Browse$/ });
    await browse.first().waitFor({ state: "visible", timeout: 15000 });
    labels.browse = (await browse.first().innerText()).trim();
    await sleep(500);

    /* 3. Browse, search */
    await browse.first().click();
    let bp = null, card = null, reached = false;
    try {
      bp = await pageWith(o, ".mod-community-modal input[type=search]", 25000);
      const search = bp.locator(".mod-community-modal input[type=search]");
      labels.searchPlaceholder = await search.getAttribute("placeholder");
      await search.click();
      await bp.keyboard.type(SEARCH, { delay: 70 });
      card = bp.locator(".mod-community-modal .community-item", { hasText: /By Benjamin Armstrong III/ });
      await card.first().waitFor({ state: "visible", timeout: 30000 });
      reached = true;
    } catch (e) {
      const seen = bp ? await bp.evaluate(() => (document.querySelector(".mod-community-modal") || document.body).innerText.replace(/\s+/g, " ").slice(0, 400)).catch(() => "") : "(the browser did not open)";
      note(`Obsidian's community plugin browser did not show Booklet (${String(e.message).split("\n")[0]}). It showed: "${seen}".`);
    }
    if (reached) {
      await sleep(600);
      labels.cardClass = await card.first().evaluate(e => e.className);
      const clip = phone ? undefined : { x: 0, y: 0, width: 1100, height: 400 };
      await shot(bp, 3, "browse", card,
        `The community plugin browser with "Booklet" typed in the search box ("${labels.searchPlaceholder}") and the Booklet result, by Benjamin Armstrong III, ringed.`, { clip });

      /* 4. Booklet's page, Install */
      await card.first().click();
      const install = bp.locator(".mod-community-modal button", { hasText: /^Install$/ });
      await install.first().waitFor({ state: "visible", timeout: 15000 });
      labels.install = (await install.first().innerText()).trim();
      await shot(bp, 4, "install", install, `Booklet's page in the community plugin browser, with the "${labels.install}" button ringed.`);
      await install.first().click();
      const enable = bp.locator(".mod-community-modal button", { hasText: /^Enable$/ });
      await enable.first().waitFor({ state: "visible", timeout: 90000 });
      labels.enable = (await enable.first().innerText()).trim();
      await noNotice(bp);

      /* 5. Enable */
      await shot(bp, 5, "enable", enable, `Booklet's page after it has installed, now marked Installed, with the "${labels.enable}" button ringed.`);
      await enable.first().click();
      await o.page.waitForFunction(() => app.plugins.enabledPlugins.has("booklet"), null, { timeout: 20000 });
      labels.installedVersion = await o.evaluate(() => app.plugins.manifests.booklet && app.plugins.manifests.booklet.version);
      say(`installed from the directory: Booklet ${labels.installedVersion}`);
      await sleep(500);
    } else {
      real = false;
    }

    /* close the browser and Settings */
    if (phone) {
      // the X at the top right of each panel, until no panel is left (the browser, then Settings)
      for (let n = 0; n < 4 && await main.locator(".modal-container").count(); n++) {
        const x = main.locator(".modal-container .modal-header-button").locator("visible=true");
        if (await x.count()) await x.last().click(); else await main.keyboard.press("Escape");
        await sleep(700);
      }
    } else {
      for (const p of pagesOf(o)) if (p !== main && !p.isClosed()) {
        await p.evaluate(() => { const b = document.querySelector(".titlebar-button.mod-close"); if (b) b.click(); else window.close(); }).catch(() => {});
        await sleep(400);
      }
      await o.evaluate(() => { if (app.setting) app.setting.close(); });
    }
    await main.waitForFunction(() => !document.querySelector(".modal-container"), null, { timeout: 8000 }).catch(() => {});
    if (!reached) {
      // the fallback: the files copied in, as a person who sideloads would, and the plugin enabled
      const pdir = path.join(vault, ".obsidian", "plugins", "booklet");
      fs.mkdirSync(pdir, { recursive: true });
      for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(opt.pluginDir, f), path.join(pdir, f));
      await o.evaluate(async () => { await app.plugins.loadManifests(); await app.plugins.enablePluginAndSave("booklet"); });
      labels.installedVersion = await o.evaluate(() => app.plugins.manifests.booklet && app.plugins.manifests.booklet.version);
      note(`Booklet ${labels.installedVersion} was installed by copying the files of ${opt.pluginDir}, not from the directory.`);
    }
    if (!(await o.evaluate(() => app.plugins.enabledPlugins.has("booklet")))) throw new Error("Booklet is not enabled");
    for (const p of pagesOf(o)) if (p !== main && !p.isClosed()) throw new Error("a second Obsidian window is still open: " + p.url());

    /* 6. The file */
    if (phone && !(await main.evaluate(() => !!document.querySelector(".workspace-drawer.mod-left.is-pinned, .workspace-drawer.mod-left.is-visible, .workspace-drawer-active-tab-container .nav-files-container")))) {
      await main.locator(".view-action.mod-left-split-toggle").locator("visible=true").first().click();
    }
    fs.copyFileSync(opt.booklet, path.join(vault, BOOKLET_NAME));
    const rel = BOOKLET_NAME;
    await main.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), c = f && app.metadataCache.getFileCache(f); return !!(c && c.frontmatter && c.frontmatter.booklet); }, rel, { timeout: 30000, polling: 100 });
    const fileRow = main.locator(`.nav-file-title[data-path="${rel}"]`);
    await fileRow.first().waitFor({ state: "visible", timeout: 15000 });
    labels.fileRowText = (await fileRow.first().innerText()).trim();
    await sleep(500);
    await shot(main, 6, "file", fileRow,
      phone ? `The file list in the sidebar drawer, now holding the note "${labels.fileRowText}", ringed.`
            : `The Obsidian window with the file list at the left holding the note "${labels.fileRowText}", ringed.`, { offset: phone ? 3 : 1 });

    /* 7. Open it */
    await fileRow.first().click();
    await main.waitForFunction(() => app.workspace.activeLeaf && app.workspace.activeLeaf.view.getViewType() === "booklet", null, { timeout: 20000 });
    await main.waitForSelector(".workspace-leaf-content[data-type='booklet'] .booklet-page", { state: "visible", timeout: 20000 });
    await quiet(o);
    await main.evaluate(() => document.fonts.ready);
    await sleep(500);
    labels.bookletLook = await main.evaluate(() => { const v = document.querySelector(".booklet-view"); return v ? (v.dataset.bookletLook || "(no look attribute)") : null; });
    await shot(main, 7, "open", null, phone ? "The note opened as a booklet on a phone, drawn in the plugin's default look." : "The note opened as a booklet in Obsidian, drawn in the plugin's default look.");

    /* 8. Show Markdown, then Open as booklet */
    const act = async (label) => {   // a header button; on the phone it may be in the "More options" menu instead
      const direct = main.locator(`.workspace-leaf.mod-active .view-header .view-action[aria-label="${label}"]`).locator("visible=true");
      if (await direct.count()) return { loc: direct.first(), via: "header button" };
      await main.locator(".workspace-leaf.mod-active .view-header .view-action[aria-label='More options']").locator("visible=true").first().click();
      const item = main.locator(".menu .menu-item", { hasText: new RegExp("^" + label + "$") });
      await item.first().waitFor({ state: "visible", timeout: 5000 });
      return { loc: item.first(), via: "More options menu" };
    };
    const show = await act("Show Markdown");
    labels.showMarkdown = "Show Markdown (" + show.via + ")";
    await show.loc.click();
    await main.waitForFunction(() => app.workspace.activeLeaf && app.workspace.activeLeaf.view.getViewType() === "markdown", null, { timeout: 15000 });
    await sleep(800);
    let back = await act("Open as booklet");
    labels.openAsBooklet = "Open as booklet (" + back.via + ")";
    await shot(main, 8, "open-as-booklet", back.loc,
      `The same note shown as plain text, with the "Open as booklet" ${back.via === "header button" ? "button in the header" : "item in the More options menu"} ringed.`);
    if (back.via !== "header button") await main.keyboard.press("Escape");
  } catch (e) {
    failures++; say(`FAIL ${tag}: ${e && e.stack || e}`);
    try { await o.screenshot(path.join(OUT, `.failed-${tag}.png`)); } catch (e2) { /* nothing to show */ }
  } finally {
    const out = o.output().split("\n").filter(l => /warn|error|fail|uncaught/i.test(l) && !/Updates disabled|devtools|dbus/i.test(l));
    if (out.length) say(`app output (${tag}): ` + out.join(" | ").slice(0, 1500));
    await o.close().catch(() => {});
    process.removeListener("SIGINT", bye); process.removeListener("SIGTERM", bye);
    if (!opt.keep) fs.rmSync(work, { recursive: true, force: true });
  }
  say(`labels (${tag}): ` + JSON.stringify(labels));
  say(`${taken} shots for ${tag}`);
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(OUT, { recursive: true });
  for (const platform of PLATFORMS) for (const scheme of SCHEMES) await run(platform, scheme);
  const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, "shots.json"), "utf8")); } catch (e) { return []; } })();
  const ran = new Set(entries.map(e => e.platform + "-" + e.scheme));
  const all = prev.filter(e => !ran.has(e.platform + "-" + e.scheme)).concat(entries).sort((a, b) => a.file.localeCompare(b.file));
  fs.writeFileSync(path.join(OUT, "shots.json"), JSON.stringify(all, null, 2) + "\n");
  say(`${entries.length} shots, ${failures} failed runs, ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
