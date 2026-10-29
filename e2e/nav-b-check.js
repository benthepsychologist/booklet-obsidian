// Navigation checks that need the real app (0.6.0, stage B): a link from another note, every one of Booklet's 161 icon names, the
// finish rule, and the phone (Obsidian's own phone mode at 390 x 844). Prints PASS/FAIL lines; exit 1 on any FAIL.
//   PLAYWRIGHT=/path/to/node_modules node nav-b-check.js --obsidian /path/to/obsidian --vault test-vault --config /scratch/cfg-nav \
//        --out /scratch/shots-nav-b [--port 43602]
// The vault is copied first (under <config>), and every note this check needs is written into the copy: nothing is written to --vault.
// Every note is made up.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { launch } = require("./drive");

const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
opt.obsidian = opt.obsidian || process.env.OBSIDIAN; opt.vault = opt.vault || process.env.VAULT; opt.config = opt.config || process.env.CONFIG_DIR;
if (!opt.obsidian || !opt.vault || !opt.config) { console.error("need --obsidian, --vault, --config (or OBSIDIAN, VAULT, CONFIG_DIR)"); process.exit(2); }
const out = path.resolve(opt.out || path.join(opt.config, "shots"));
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

const SKETCH = "Learning to sketch.booklet.md", CHECKIN = "Check-in.booklet.md";

const LINKS = `# Links into booklets

An ordinary note, made up.

- [[Learning to sketch.booklet#Cast shadows]]
- [[Learning to sketch.booklet#Ten in a row]]
- [[Learning to sketch.booklet#Cylinders]]
- [[Check-in.booklet#Today]]
- [[Finish test.booklet#Answer]]
`;

const FINISH = `---
booklet: "0.16"
title: Finish test
---

> [!activity|log repeat daily] Log

Words above every tab.

> [!tab] Read

Some words to read.

> [!tab] Answer

> [!text|what] What happened?
`;

// long titles: the trail and the pager have to wrap on a phone
const LONG = `---
booklet: "0.16"
title: A booklet with a rather long title that cannot fit on one line of a phone
---

> [!module|long] A module whose own title is also rather long indeed

> [!activity|first] The first activity, whose title runs on and on and on

One.

***

Two.

> [!activity|second parent:first] The second activity, whose title also runs on and on

Three.

> [!activity|third] The third activity, whose title runs on and on and on and on

Four.

> [!module|long end] End
`;

function iconNames() {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "booklet-icons.ts"), "utf8");
  return [...src.matchAll(/^\t"([a-z0-9-]+)",$/gm)].map(m => m[1]);
}
function iconsBooklet(names) {
  let t = `---\nbooklet: "0.16"\ntitle: All icons\n---\n\n> [!module|icons] All icons\n\n`;
  for (const n of names) t += `> [!activity|a-${n} icon:${n}] ${n}\n\nIcon ${n}.\n\n`;
  return t + `> [!module|icons end] End\n`;
}

(async () => {
  fs.mkdirSync(path.resolve(opt.config), { recursive: true });
  const vault = fs.mkdtempSync(path.join(path.resolve(opt.config), "vaultcopy-"));
  fs.cpSync(path.resolve(opt.vault), vault, { recursive: true });
  const names = iconNames();
  ok(names.length === 161, "src/booklet-icons.ts lists " + names.length + " icon names (161 expected)");
  fs.writeFileSync(path.join(vault, "Links.md"), LINKS);
  fs.writeFileSync(path.join(vault, "Finish test.booklet.md"), FINISH);
  fs.writeFileSync(path.join(vault, "Long titles.booklet.md"), LONG);
  fs.writeFileSync(path.join(vault, "All icons.booklet.md"), iconsBooklet(names));
  const before = { sk: sha(path.join(vault, SKETCH)), ck: sha(path.join(vault, CHECKIN)), fin: sha(path.join(vault, "Finish test.booklet.md")) };

  const o = await launch({ obsidian: opt.obsidian, vault, configDir: opt.config, port: opt.port ? +opt.port : undefined });
  const state = () => o.evaluate(() => {
    const l = app.workspace.getLeavesOfType("booklet")[0];
    const pg = l && l.view.contentEl.querySelector(".booklet-page");
    const tab = l && l.view.contentEl.querySelector(".booklet-tabbtn.is-active");
    const at = l && l.view.contentEl.querySelector(".booklet-pager-at");
    return { screen: pg && pg.getAttribute("data-booklet-screen"), tab: tab && tab.textContent, at: at ? at.textContent : "", back: l && l.history ? l.history.backHistory.length : null, file: l && l.view.file && l.view.file.path, leaves: app.workspace.getLeavesOfType("booklet").length };
  });
  const shot = n => o.screenshot(path.join(out, n + ".png"));
  const open = async rel => { await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, rel); await o.page.waitForSelector(".booklet-page", { timeout: 10000 }); await sleep(500); };
  try {
    // ---- 1. links from another note, clicked in Reading view as a reader does
    const link = async (text, rel = "Links.md") => {
      await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel), { state: { mode: "preview" } }); }, rel);
      await o.page.waitForSelector(".markdown-preview-view a.internal-link", { timeout: 8000 }); await sleep(300);
      await o.evaluate(() => document.querySelectorAll(".hover-popover").forEach(e => e.remove()));
      await o.page.mouse.move(5, 5);
      await o.page.locator(".markdown-preview-view a.internal-link", { hasText: text }).first().click();
      await o.page.waitForSelector(".booklet-page", { timeout: 8000 }); await sleep(900);
      return state();
    };
    let s = await link("Cast shadows");
    ok(s.screen === "activity:basics/shadow" && s.file === SKETCH, "link to an activity's title opens it: " + s.screen);
    console.log("INFO  history entries after the link: " + s.back);
    await shot("link-activity-light");
    await o.setScheme("dark"); await sleep(300); await shot("link-activity-dark"); await o.setScheme("light"); await sleep(200);
    s = await link("Ten in a row");
    ok(s.screen === "activity:basics/lines" && /Page 3 of 3/.test(s.at), "link to a heading on a later page opens that page: " + s.screen + ", " + s.at);
    s = await link("Cylinders");
    ok(s.screen === "activity:basics/shapes" && s.tab === "Cylinders", "link to a tab's name opens that tab: " + s.screen + ", " + s.tab);
    s = await link("Today");
    ok(s.screen === "activity:day-check/today" && s.file === CHECKIN, "[[Check-in.booklet#Today]] opens Today: " + s.screen);
    s = await link("Answer");
    ok(s.screen === "activity:/log" && s.tab === "Answer", "link to the tab that holds the question: " + s.screen + ", " + s.tab);
    // the booklet is open already in the pane: a second link in the same pane moves it
    const n0 = (await state()).back;
    await o.evaluate(async () => { await app.workspace.openLinkText("Learning to sketch.booklet#Cast shadows", "Links.md"); });
    await sleep(900); s = await state();
    ok(s.screen === "activity:basics/shadow", "openLinkText from a note while another booklet is in the pane: " + s.screen);
    await o.evaluate(async () => { await app.workspace.openLinkText("Learning to sketch.booklet#Ten in a row", "Links.md"); });
    await sleep(900); s = await state();
    ok(s.screen === "activity:basics/lines" && /Page 3 of 3/.test(s.at), "the same booklet already open in the pane, a second link: " + s.screen + ", " + s.at);
    console.log("INFO  history entries before/after: " + n0 + " -> " + s.back);
    // a link to a block does nothing (stays where it is)
    await o.evaluate(async () => { await app.workspace.openLinkText("Learning to sketch.booklet#^abc", "Links.md"); });
    await sleep(600); s = await state();
    ok(s.screen === "activity:basics/lines", "a block link leaves the place alone: " + s.screen);

    // ---- 2. every icon name draws, opened as the plugin draws it, and a name that draws nothing is caught
    await open("All icons.booklet.md");
    const icons = await o.evaluate(() => {
      const l = app.workspace.getLeavesOfType("booklet")[0], rows = [...l.view.contentEl.querySelectorAll(".booklet-cardrow")];
      return rows.map(r => ({ title: (r.querySelector(".booklet-cardtitle-words") || {}).textContent, svg: !!r.querySelector(".booklet-pic svg"), paths: r.querySelectorAll(".booklet-pic svg *").length }));
    });
    const blank = icons.filter(r => !r.svg || !r.paths).map(r => r.title);
    ok(icons.length === 161 && blank.length === 0, "all 161 cards draw their picture by lucide- id" + (blank.length ? "; draw nothing: " + blank.join(", ") : "") + " (" + icons.length + " cards)");
    // the detector, on Obsidian's own setIcon (a ribbon button draws its icon with it): it sees a drawing, and sees none for a name Obsidian lacks
    const draws = names_ => o.evaluate(ns => ns.map(n => { const el = app.plugins.plugins.booklet.addRibbonIcon("lucide-" + n, "probe", () => {}); const d = !!el.querySelector("svg *"); el.remove(); return d; }), names_);
    const bogus = await draws(["not-an-icon-at-all", "pencil"]);
    ok(bogus[0] === false && bogus[1] === true, "the check's own detector: a name Obsidian lacks draws nothing, a real one draws (" + bogus.join(", ") + ")");
    const ribbon = await draws(names);
    const missing = names.filter((n, i) => !ribbon[i]);
    ok(missing.length === 0, "setIcon draws every one of the 161 names by its lucide- id" + (missing.length ? "; draws nothing: " + missing.join(", ") : ""));
    await shot("icons-light");
    await o.setScheme("dark"); await sleep(300); await shot("icons-dark"); await o.setScheme("light"); await sleep(200);

    // ---- 3. the finish
    await open("Finish test.booklet.md");
    const fin = () => o.evaluate(() => document.querySelectorAll(".workspace-leaf-content[data-type='booklet'] .booklet-finalize").length);
    ok(await fin() === 0, "a reading tab has no Finalize");
    await o.page.locator(".booklet-tabbtn", { hasText: "Answer" }).click(); await sleep(400);
    ok(await fin() === 1, "the tab that holds the question has its Finalize");
    await shot("finish-answer-light");
    await o.setScheme("dark"); await sleep(300); await shot("finish-answer-dark"); await o.setScheme("light"); await sleep(200);
    await o.page.locator(".booklet-tabbtn", { hasText: "Read" }).click(); await sleep(400);
    ok(await fin() === 0, "back on the reading tab: no Finalize");
    await shot("finish-read-light");

    // ---- 4. the phone
    await o.page.setViewportSize({ width: 390, height: 844 });
    await o.evaluate(() => app.emulateMobile(true)); await sleep(1500);
    const phone = await o.evaluate(() => ({ phone: document.body.classList.contains("is-phone"), w: window.innerWidth, h: window.innerHeight }));
    ok(phone.phone && phone.w === 390, "Obsidian's phone mode on: is-phone " + phone.phone + ", window " + phone.w + " x " + phone.h);
    const metrics = () => o.evaluate(() => {
      const v = app.workspace.getLeavesOfType("booklet")[0].view.contentEl, r = e => e.getBoundingClientRect();
      const min = sel => { const h = [...v.querySelectorAll(sel)].map(e => r(e).height); return h.length ? Math.min(...h) : null; };
      const pager = v.querySelector(".booklet-pager"), bar = document.querySelector(".mobile-navbar"), trail = v.querySelector(".booklet-trail"), tabbar = v.querySelector(".booklet-tabbar");
      const tops = el => el ? [...new Set([...el.children].map(c => Math.round(r(c).top)))].length : 0;
      return {
        sideways: Math.max(v.scrollWidth - v.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        card: min(".booklet-cardrow"), tab: min(".booklet-tabbtn"), pager: min(".booklet-pager button"),
        trailRows: tops(trail), tabRows: tops(tabbar), pagerRows: pager ? new Set([...pager.querySelectorAll("button")].map(b => Math.round(r(b).top))).size : 0,
        tabbarSideways: tabbar ? tabbar.scrollWidth - tabbar.clientWidth : 0,
        pagerBottom: pager ? r(pager).bottom : null, barTop: bar ? r(bar).top : null,
      };
    });
    const atEnd = () => o.evaluate(() => { const v = app.workspace.getLeavesOfType("booklet")[0].view.contentEl; v.scrollTop = v.scrollHeight; });
    for (const scheme of ["light", "dark"]) {
      await o.setScheme(scheme); await sleep(300);
      await open(SKETCH); await sleep(300);
      let m = await metrics();
      ok(m.sideways <= 0 && m.card >= 44, `[${scheme}] home: no sideways scroll (${m.sideways}), card rows >= 44 px (${m.card})`);
      await shot(`phone-home-${scheme}`);
      await o.page.locator(".booklet-cardrow", { hasText: "A sketch a day" }).click(); await sleep(600);
      await o.page.locator(".booklet-cardrow", { hasText: "Seven studies" }).click(); await sleep(600);
      m = await metrics();
      ok(m.sideways <= 0 && m.tab >= 44 && m.tabRows >= 2 && m.tabbarSideways <= 0, `[${scheme}] seven tabs wrap onto ${m.tabRows} rows, none scrolls (bar ${m.tabbarSideways}), tabs ${m.tab} px, page ${m.sideways}`);
      ok(m.trailRows >= 1 && m.pager >= 44, `[${scheme}] trail rows ${m.trailRows}, pager buttons ${m.pager} px`);
      await shot(`phone-tabs-${scheme}`);
      await atEnd(); await sleep(300);
      m = await metrics();
      ok(m.barTop === null || m.pagerBottom < m.barTop, `[${scheme}] pager clear of Obsidian's floating bar: pager ends ${Math.round(m.pagerBottom)}, bar starts ${m.barTop && Math.round(m.barTop)}`);
      await shot(`phone-tabs-end-${scheme}`);
      await open("Long titles.booklet.md"); await sleep(300);
      await o.page.locator(".booklet-cardrow", { hasText: "The first activity" }).click(); await sleep(600);
      await o.page.locator(".booklet-cardrow", { hasText: "The second activity" }).click(); await sleep(600);
      m = await metrics();
      ok(m.sideways <= 0 && m.trailRows >= 2, `[${scheme}] long trail wraps onto ${m.trailRows} rows, no sideways scroll (${m.sideways})`);
      m = await metrics();
      ok(m.sideways <= 0 && m.pager >= 44 && m.pagerRows >= 2, `[${scheme}] both pager labels long: buttons ${m.pager} px, no sideways scroll (${m.sideways}), the pager wraps onto ${m.pagerRows} rows`);
      await shot(`phone-long-${scheme}`);
      await atEnd(); await sleep(300);
      m = await metrics();
      ok(m.barTop === null || m.pagerBottom < m.barTop, `[${scheme}] long pager clear of the bar: ends ${Math.round(m.pagerBottom)}, bar ${m.barTop && Math.round(m.barTop)}`);
      await shot(`phone-long-end-${scheme}`);
      // a long page: the check-in's Today scrolled to its foot, the pager above the bar
      await open(CHECKIN); await sleep(300);
      await o.page.locator(".booklet-cardrow", { hasText: "Today" }).first().click(); await sleep(700);
      await atEnd(); await sleep(400);
      m = await metrics();
      const tall = await o.evaluate(() => { const v = app.workspace.getLeavesOfType("booklet")[0].view.contentEl; return v.scrollHeight - v.clientHeight; });
      ok(tall > 200 && m.pagerBottom < m.barTop, `[${scheme}] a long page (scrolls ${tall} px): pager ends ${Math.round(m.pagerBottom)}, bar starts ${m.barTop && Math.round(m.barTop)}`);
      await shot(`phone-today-end-${scheme}`);
    }
    // arrow keys, Home and End on the tab bar
    await o.setScheme("light");
    await open(SKETCH);
    await o.page.locator(".booklet-cardrow", { hasText: "A sketch a day" }).click(); await sleep(500);
    await o.page.locator(".booklet-cardrow", { hasText: "Seven studies" }).click(); await sleep(500);
    const tabOn = () => o.evaluate(() => (document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-tabbtn.is-active") || {}).textContent);
    await o.page.locator(".booklet-tabbtn.is-active").focus();
    await o.page.keyboard.press("ArrowRight"); await sleep(300);
    ok(await tabOn() === "Cups", "ArrowRight chooses the next tab: " + await tabOn());
    await o.page.keyboard.press("End"); await sleep(300);
    ok(await tabOn() === "Clouds", "End chooses the last tab: " + await tabOn());
    await o.page.keyboard.press("Home"); await sleep(300);
    ok(await tabOn() === "Hands", "Home chooses the first tab: " + await tabOn());
    await o.page.keyboard.press("ArrowLeft"); await sleep(300);
    ok(await tabOn() === "Hands", "ArrowLeft on the first tab stays: " + await tabOn());
    await o.evaluate(() => app.emulateMobile(false));

    // ---- 5. none of it wrote into a note
    await sleep(1500);
    const after = { sk: sha(path.join(vault, SKETCH)), ck: sha(path.join(vault, CHECKIN)), fin: sha(path.join(vault, "Finish test.booklet.md")) };
    ok(JSON.stringify(after) === JSON.stringify(before), "no note changed: links, moves, tabs and the phone wrote nothing");
  } catch (e) {
    console.log("ERROR " + (e && e.stack || e)); fails++;
    try { await shot("error"); } catch (e2) { /* nothing to show */ }
  } finally {
    await o.close();
    fs.rmSync(vault, { recursive: true, force: true });
  }
  console.log(fails ? "FAILED " + fails : "ALL PASS");
  process.exit(fails ? 1 : 0);
})();
