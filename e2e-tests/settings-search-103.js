// Obsidian's Settings search, and the Booklet settings tab, in a real Obsidian (plugin 1.0.3). Run by hand, once for each Obsidian version:
//   PLAYWRIGHT=<node_modules> node settings-search-103.js --obsidian <binary> --out <dir> [--tag name] [--vault ../test-vault] [--expect declarative|legacy] [--dry] [--help]
// Not part of plugin-check.js. One Obsidian at a time, on a scratch config and a vault of the plugin's files with an empty allow list.
// (E2E_PORT_RANGE="9341-9349" keeps the debugging port inside a range of your own; drive.js reads it.)
//
// What it measures. From Obsidian 1.13 the plugin gives the settings page as ONE navigable setting definition (settings.ts getSettingDefinitions:
// a `page` entry named 'Allowed media sites and suggested services', whose page holds the rows), so the Settings search can find the entry. (Measured
// in 1.14.5: the search looks in the NAME of a page entry only, not its description and not `aliases`; a first design of three `render` rows with sibling
// divs for the list was dropped by Obsidian and is why the page form is used.) On Obsidian 1.11.7 nothing calls the definitions: the old Booklet tab
// is drawn by display() and the search is not expected to find anything of the plugin's.
//  1. For each query ('allow', 'site', 'suggested', 'media', 'booklet') it types into the Settings search box, waits, and reads the search results
//     (`.setting-search-results`): whether the entry is listed (with the result's text). 'allow', 'site' and 'suggested' have an expected answer by
//     version (found from 1.13, not found before; Obsidian 1.11.7 has no settings search box at all, which is reported); 'media' and 'booklet' are reported only. For 'suggested' on 1.13+ it also presses the result and
//     checks that the entry's page opens (title 'Allow list', the 'Add a site' box there).
//  2. Whichever way the version draws it, it opens the Booklet tab (on 1.13+ it presses the entry to open its page), checks the three rows, adds
//     'example.org' (text box and Enter), reads the status message and the list, removes it with its Remove button and checks the focus moved to the
//     box (it is the only entry), with a screenshot after each step. This repeats what the accessibility pass measured (docs/accessibility-100.md).
// The Settings search box is found by its look (type=search, or a placeholder that says search), not by a class name that changes between
// versions: the candidates are printed as INFO lines so a wrong guess can be fixed from one run's output. `--expect` overrides the version rule.
// Output: <out>/<tag>-NN-*.png and <out>/<tag>-settings-search.json. Exit 1 on any FAIL.
const fs = require("fs"), path = require("path");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const USAGE = "usage: PLAYWRIGHT=<node_modules> node settings-search-103.js --obsidian <binary> --out <dir> [--tag name] [--vault ../test-vault] [--expect declarative|legacy] [--dry] [--help]";
if (process.argv.includes("--help") || process.argv.includes("-h")) { console.log(USAGE); process.exit(0); }
const opt = { obsidian: arg("obsidian"), out: arg("out"), vault: arg("vault", path.join(__dirname, "..", "test-vault")), tag: arg("tag", "run"), expect: arg("expect", "auto") };
const dry = process.argv.includes("--dry");
if (!opt.out || (!opt.obsidian && !dry)) { console.error("needs --obsidian <binary> and --out <dir>\n" + USAGE); process.exit(2); }
if (!["auto", "declarative", "legacy"].includes(opt.expect)) { console.error("--expect is declarative or legacy\n" + USAGE); process.exit(2); }
const SRC_VAULT = path.resolve(opt.vault), OUT = path.resolve(opt.out);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = (...a) => console.log(...a);

if (dry) {
  // a dry run: the arguments, the files it would use and the libraries it would load; nothing is launched
  const need = ["main.js", "manifest.json", "styles.css"].map(f => path.join(SRC_VAULT, ".obsidian", "plugins", "booklet", f));
  let bad = 0;
  for (const f of need) { const ok = fs.existsSync(f); if (!ok) bad++; say((ok ? "ok   " : "MISSING ") + f); }
  if (opt.obsidian) { const ok = fs.existsSync(path.resolve(opt.obsidian)); if (!ok) bad++; say((ok ? "ok   " : "MISSING ") + "obsidian binary " + path.resolve(opt.obsidian)); }
  try { require("./drive"); require("./waits"); require("./media-lib"); say("ok   harness modules load"); } catch (e) { bad++; say("MISSING harness module: " + e.message); }
  const P = process.env.PLAYWRIGHT; let pwOk = false;
  for (const c of P ? [P, path.join(P, "playwright-core"), path.join(P, "node_modules", "playwright-core")] : ["playwright-core"]) { try { require(c); pwOk = true; break; } catch (e) { /* next */ } }
  if (!pwOk) bad++;
  say((pwOk ? "ok   " : "MISSING ") + "playwright-core (PLAYWRIGHT=" + P + ")");
  say("would write to " + OUT + " with tag " + opt.tag + "; queries: allow, site, suggested, media, booklet");
  say(bad ? "dry run: " + bad + " problem(s)" : "dry run: ok");
  process.exit(bad ? 1 : 0);
}

const { launch } = require("./drive");
const { bookletPage } = require("./waits");
fs.mkdirSync(OUT, { recursive: true });
const WORK = path.join(OUT, "work-" + Date.now());
let pass = 0, fail = 0;
const fact = (ok, text, extra) => { ok ? pass++ : fail++; say((ok ? "PASS " : "FAIL ") + text + (extra ? "  " + extra : "")); };

const consoleReport = [], sessions = [];
const env = { launch, opt: { obsidian: opt.obsidian }, WORK, consoleReport, sessions, SRC_VAULT, SHOTS: OUT, BOOK: ".workspace-leaf-content[data-type='booklet']" };
const { withMedia } = require("./media-lib")(env);

const QUERIES = [
  { q: "allow", gated: true }, { q: "site", gated: true }, { q: "suggested", gated: true },
  { q: "media", gated: false }, { q: "booklet", gated: false },
];
const ADDED = "example.org";

/* in the page (the Settings window): the visible rows of the plugin, by what each row holds. The 'Allowed sites' row is drawn with an empty
   name and its explanation as the description (settings.ts drawIntro), so it is told by that sentence as well as by the name. */
const ROWS = () => {
  const shown = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const flat = s => (s || "").replace(/\s+/g, " ").trim();
  const out = { allowed: [], add: [], suggested: [], visibleNames: [], content: "" };
  const items = [...document.querySelectorAll(".setting-item")].filter(shown);
  for (const it of items) {
    const name = flat(it.querySelector(".setting-item-name") && it.querySelector(".setting-item-name").textContent);
    const text = flat(it.innerText || it.textContent);
    out.visibleNames.push(name || text.slice(0, 40));
    if (name === "Allowed sites" || /Audio and video hosted on these sites/.test(text)) out.allowed.push(text);
    if (name === "Add a site" || it.querySelector("input[aria-label='Add a site']")) out.add.push(text);
    if (name === "Suggested services" || /Add suggested services/.test(text)) out.suggested.push(text);
  }
  const c = document.querySelector(".vertical-tab-content");
  out.content = c ? flat(c.innerText).slice(0, 400) : "";
  out.visibleNames = out.visibleNames.slice(0, 30);
  return out;
};
/* in the page (the Settings window): what the search lists. Each result group is a tab (label, and for a plugin's tab the plugin's name as the sublabel) with the
   rows found in it; a page entry of a plugin is listed as a tab-like result whose label is the entry's name and whose sublabel is the plugin ('Booklet'). The
   plugin's results are the ones whose label or title is the entry's name or one of the old rows' names, or whose sublabel is 'Booklet'. */
const RESULTS = () => {
  const flat = s => (s || "").replace(/\s+/g, " ").trim();
  const groups = [...document.querySelectorAll(".setting-search-result-group")].map(g => ({
    label: flat((g.querySelector(".setting-search-result-tab-label") || {}).textContent),
    sub: flat((g.querySelector(".setting-search-result-tab-sublabel") || {}).textContent),
    items: [...g.querySelectorAll(".setting-search-result-item")].map(i => flat(i.textContent)),
  }));
  const ours = /Allowed media sites|Allowed sites|Add a site|Suggested services/;
  const plugin = groups.filter(g => g.sub === "Booklet" || ours.test(g.label) || g.items.some(t => ours.test(t)));
  return { groups, plugin, text: flat((document.querySelector(".setting-search-results") || {}).innerText).slice(0, 300) };
};
/* mark the settings search box (type=search, or a box whose placeholder says search) so Playwright can find it, and list the candidates */
const MARK_SEARCH = () => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inputs = [...document.querySelectorAll("input")].filter(vis);
  const cands = inputs.map(i => ({ type: i.type, placeholder: i.placeholder, cls: i.className, parent: i.parentElement && i.parentElement.className, label: i.getAttribute("aria-label") }));
  /* the settings search is the box in the sidebar ('Search settings...'); the 'Search installed plugins...' box on the Community plugins page is not it (Obsidian 1.11.7 has no settings search at all, only that one) */
  const pick = inputs.find(i => /search settings/i.test(i.placeholder || "")) || inputs.find(i => i.closest(".setting-search-container"));
  document.querySelectorAll("[data-e2e-search]").forEach(e => e.removeAttribute("data-e2e-search"));
  if (pick) pick.setAttribute("data-e2e-search", "1");
  return { found: !!pick, cands };
};

(async () => {
  say("Obsidian:", opt.obsidian, "tag", opt.tag);
  const result = { tag: opt.tag, queries: {}, tab: {} };
  await withMedia("settings-search", { note: "", files: {}, data: { allowedMediaHosts: [], noteAllows: {} } }, async (o, ctx) => {
    const version = await o.evaluate(() => (navigator.userAgent.match(/obsidian\/([\d.]+)/i) || [])[1]);
    const num = String(version || "0").split(".").map(Number);
    const atLeast = (a, b, c) => num[0] > a || (num[0] === a && (num[1] > b || (num[1] === b && (num[2] || 0) >= c)));
    const declarative = opt.expect === "auto" ? atLeast(1, 13, 0) : opt.expect === "declarative";
    result.version = version; result.declarative = declarative;
    say(`version ${version}; expecting the search to ${declarative ? "FIND" : "NOT find"} the plugin's entry (${opt.expect === "auto" ? "by version" : "by --expect"})`);
    const shot = async (sp, name) => { const f = path.join(OUT, `${opt.tag}-${name}.png`); await sp.screenshot({ path: f }).catch(e => say("INFO screenshot " + name + ": " + e.message.slice(0, 80))); return f; };
    const settingsPage = async () => {
      for (let i = 0; i < 40; i++) {
        for (const p of o.page.context().pages()) if (await p.evaluate(() => !!document.querySelector(".vertical-tab-content")).catch(() => false)) return p;
        await sleep(250);
      }
      return null;
    };
    const openSettings = async tab => {
      await o.evaluate(async tab => { await app.setting.open(); if (tab) await app.setting.openTabById(tab); }, tab || null);
      const sp = await settingsPage();
      if (!sp) throw new Error("Settings did not open");
      await sp.bringToFront().catch(() => {});
      await sleep(600);
      return sp;
    };
    const closeSettings = async () => { await o.evaluate(() => { app.setting.close && app.setting.close(); }); await sleep(500); await o.page.bringToFront().catch(() => {}); };

    // what the plugin itself decided: does its tab give setting definitions here?
    const defs = await o.evaluate(() => { try { const t = (app.setting.pluginTabs || []).find(x => x.id === "booklet"); return t && t.getSettingDefinitions ? t.getSettingDefinitions().length : null; } catch (e) { return "error: " + e.message; } });
    result.definitions = defs;
    fact(declarative ? defs === 1 : (defs === 0 || defs === null), `the Booklet tab offers ${declarative ? "1 setting definition (the page entry)" : "no setting definitions"} on ${version} (it offers ${defs})`);

    // ---- 1. the search ----
    let sp = await openSettings(null);
    say("INFO Settings is drawn in " + (sp !== o.page ? "a window of its own" : "the main window"));
    const mk = await sp.evaluate(MARK_SEARCH);
    say("INFO search box candidates: " + JSON.stringify(mk.cands));
    if (declarative) fact(mk.found, "the Settings window has a search box ('Search settings...')");
    else say(`INFO ${mk.found ? "the Settings window has a search box" : "this Obsidian has no settings search box (only the 'Search installed plugins' box of Community plugins), so the plugin's rows cannot be found by search"}`);
    await shot(sp, "00-settings-open");
    if (mk.found) {
      const box = sp.locator("[data-e2e-search]").first();
      let n = 0;
      for (const { q, gated } of QUERIES) {
        n++;
        await box.click();
        await sp.keyboard.press("Control+A"); await sp.keyboard.press("Backspace"); await sleep(250);
        await sp.keyboard.type(q, { delay: 40 });
        await sleep(900);
        const r = await sp.evaluate(RESULTS);
        const found = r.plugin.length > 0;
        result.queries[q] = { found, plugin: r.plugin, groups: r.groups.map(g => g.label + (g.sub ? " / " + g.sub : "")), text: r.text };
        await shot(sp, `${String(n).padStart(2, "0")}-search-${q}`);
        say(`INFO '${q}': the plugin is listed: ${found}; the search lists ${r.groups.length} group(s): ${JSON.stringify(r.groups.map(g => g.label + (g.sub ? " / " + g.sub : "")).slice(0, 12))}`);
        for (const g of r.plugin) say(`INFO '${q}' the plugin's result: ${JSON.stringify(g)}`);
        if (gated) fact(found === declarative, `search '${q}' ${declarative ? "finds" : "does not find"} the Booklet entry on ${version} (listed: ${found})`);
        else say(`INFO search '${q}' (no expectation): ${found ? "finds" : "does not find"} the Booklet entry`);
        if (q === "suggested" && declarative && found) {
          // pressing the result opens the entry's page
          await sp.locator(".setting-search-result-tab", { hasText: "Allowed media sites" }).first().click();
          await sleep(900);
          const pg = await sp.evaluate(() => ({ title: ((document.querySelector(".setting-page-title") || document.querySelector(".modal-title") || {}).innerText || "").trim(), box: !!document.querySelector("input[aria-label='Add a site']"), page: !!document.querySelector(".setting-page-content.booklet-settings") }));
          result.queries[q].opened = pg;
          await shot(sp, `${String(n).padStart(2, "0")}-search-${q}-opened`);
          fact(pg.box && pg.page, `pressing the search result opens the entry's page: the 'Add a site' box is there and the page has the booklet-settings class (title "${pg.title}")`);
          await sp.keyboard.press("Escape"); await sleep(700);
        }
      }
      await box.click(); await sp.keyboard.press("Control+A"); await sp.keyboard.press("Backspace"); await sleep(300);
    }
    await closeSettings();

    // ---- 2. the Booklet tab: add, read, remove ----
    sp = await openSettings("booklet");
    const entered = await bookletPage(sp).catch(e => { say("INFO bookletPage: " + e.message.slice(0, 100)); return null; });
    say("INFO the Booklet tab " + (entered ? "lists one entry; it was pressed to open the page" : "is the page itself"));
    fact(entered === declarative, `the Booklet tab ${declarative ? "lists an entry that opens the page" : "is the page itself"} on ${version} (entry pressed: ${entered})`);
    const tab = await sp.evaluate(ROWS);
    result.tab.rows = { allowed: tab.allowed, add: tab.add, suggested: tab.suggested };
    await shot(sp, "10-tab-open");
    fact(tab.allowed.length >= 1 && tab.add.length >= 1 && tab.suggested.length >= 1, `the Booklet tab shows the three rows (allowed ${tab.allowed.length}, add ${tab.add.length}, suggested ${tab.suggested.length})`);
    for (const [k, t] of Object.entries({ allowed: tab.allowed[0], add: tab.add[0], suggested: tab.suggested[0] })) say(`INFO tab [${k}] DOM text: ${(t || "(none)").slice(0, 200)}`);
    const has = await sp.evaluate(() => ({ button: [...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Add suggested services"), input: !!document.querySelector("input[aria-label='Add a site']"), empty: /No site is allowed yet\./.test(document.body.innerText) }));
    fact(has.button && has.input && has.empty, `the controls are there: 'Add suggested services' button ${has.button}, 'Add a site' box ${has.input}, the empty list says so ${has.empty}`);

    const input = sp.locator("input[aria-label='Add a site']").first();
    const read = () => sp.evaluate(added => {
      const a = document.activeElement;
      const names = [...document.querySelectorAll(".setting-item-name")].map(e => e.textContent.trim()).filter(Boolean);
      const status = document.querySelector(".booklet-sr[role='status']");
      const err = document.querySelector(".booklet-allow-error");
      return {
        names, listed: names.filter(n => n === added).length, status: status ? status.textContent.trim() : null, error: err ? err.textContent.trim() : null,
        removeBtn: !!document.querySelector(`button[aria-label='Remove ${added}']`),
        empty: /No site is allowed yet\./.test(document.body.innerText),
        value: (document.querySelector("input[aria-label='Add a site']") || {}).value,
        onBox: !!(a && a.matches && a.matches("input[aria-label='Add a site']")),
        active: a ? (a.tagName + " " + (a.getAttribute("aria-label") || (a.textContent || "").trim().slice(0, 30))) : "none",
      };
    }, ADDED);
    await input.click();
    await sp.keyboard.type(ADDED, { delay: 30 });
    await sp.keyboard.press("Enter");
    await sleep(600);
    let s = await read();
    result.tab.afterAdd = s;
    await shot(sp, "11-tab-added");
    fact(s.status === `Added ${ADDED}` && !s.error, `Enter adds '${ADDED}': the status message says "${s.status}" and the error line is empty ("${s.error}")`);
    fact(s.listed === 1 && s.removeBtn && !s.empty, `the list shows '${ADDED}' once with its Remove button (listed ${s.listed}, Remove button ${s.removeBtn}, "no site yet" gone ${!s.empty})`);
    fact(s.value === "" && s.onBox, `the box is emptied and keeps the focus (value "${s.value}", focus: ${s.active})`);
    const d1 = ctx.data(); say("INFO data.json after the add: " + (d1 ? d1.replace(/\s+/g, " ").slice(0, 200) : "(none)"));

    // move the focus away first, so the move back to the box is seen to be the plugin's doing
    await sp.evaluate(() => { const a = document.activeElement; a && a.blur && a.blur(); });
    await sp.locator(`button[aria-label='Remove ${ADDED}']`).first().click({ timeout: 5000 });
    await sleep(600);
    s = await read();
    result.tab.afterRemove = s;
    await shot(sp, "12-tab-removed");
    fact(s.listed === 0 && s.empty && !s.removeBtn, `Remove takes '${ADDED}' off the list and the list says no site is allowed yet (listed ${s.listed}, empty ${s.empty})`);
    fact(s.status === `Removed ${ADDED}`, `the status message says "${s.status}"`);
    fact(s.onBox, `with it the only entry, the focus moves to the 'Add a site' box (focus: ${s.active})`);
    const d2 = ctx.data(); say("INFO data.json after the remove: " + (d2 ? d2.replace(/\s+/g, " ").slice(0, 200) : "(none)"));
    await closeSettings();
  });
  say(`done; ${pass} passed, ${fail} failed`);
  fs.writeFileSync(path.join(OUT, opt.tag + "-settings-search.json"), JSON.stringify({ ...result, pass, fail, console: consoleReport.filter(c => !/harness noise/.test(c.kind)) }, null, 1));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
