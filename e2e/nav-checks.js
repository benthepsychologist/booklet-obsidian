// Checks 16 to 23 of plugin-check.js: the 0.6.0 navigation, in the real app. Every note is made up.
//   16 the three screens and the moves (cards, trail, pager, tabs, pages, parent:, heading links, a restart, nothing written)
//   17 to 21 design section 4.9, one check each: Back is free; no step for a tab; no move is lost; outside links; icons
//   22 the finish (only under a tab that holds a question) and the kept-entries fold (0, 1, 4 and 25 entries; desktop and phone)
//   23 the phone: no sideways scroll, controls 44 px, the pager clear of the floating bar, the trail and the pager wrapping, the tab keys
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check functions.
const fs = require("fs"), path = require("path"), crypto = require("crypto");

module.exports = function navChecks(env) {
  const { withApp, Check, launch, opt, SHOTS, sleep, BOOK, read, SRC_VAULT, waitActiveType } = env;
  const SKETCH = "Learning to sketch.booklet.md", CHECKIN = "Check-in.booklet.md", WEEKLY = "Weekly plan.booklet.md";
  const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  const shot = (o, name) => o.screenshot(path.join(SHOTS, name + ".png"));

  /* ---- made-up notes the checks write into their own copy of the vault ---- */
  const WEEKLY_NOTE = `---
booklet: "0.16"
title: Weekly plan
---

> [!module|plan] Plan the week

Choose a few small things and put each on its day.

> [!tab] Monday to Wednesday

Early in the week.

> [!tab] Thursday to Sunday

Later in the week.

> [!activity|goals icon:target tab:monday-to-wednesday] Goals
> 2 pages

Write one goal for the week.

> [!text|goal] What is the goal?

***

Now one thing you will do first.

> [!text|first] What is first?

> [!activity|review tab:thursday-to-sunday] Review

How did the week go?

> [!scale|went] How did it go?

1. Badly
2. Fine
3. Well

> [!module|plan end] End
`;
  const LINKS_NOTE = `# Links into booklets

An ordinary note, made up.

- [[Learning to sketch.booklet#Cast shadows]]
- [[Learning to sketch.booklet#Ten in a row]]
- [[Learning to sketch.booklet#Cylinders]]
- [[Check-in.booklet#Today]]
- [[Finish test.booklet#Answer]]
`;
  const FINISH_NOTE = `---
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
  const LONG_NOTE = `---
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
  const TABBED_NOTE = `---
booklet: "0.16"
title: Tabs and pages
---

> [!activity|a] A

> [!tab] One

One p1
***
One p2
***
One p3

> [!tab] Two

Two p1
***
Two p2
`;
  // a note of one repeating activity ("Log") with `n` made-up kept entries; with `two`, a second one ("More") with 4
  function foldNote(n, two) {
    const entries = (id, k) => `\`\`\`booklet entries ${id}\n{"items": [\n${Array.from({ length: k }, (_, i) => `{"ts": "2026-09-${String(i + 1).padStart(2, "0")}T09:00:00Z", "${id === "log" ? "what" : "else"}": "Made-up entry ${i + 1} of ${id}"}`).join(",\n")}\n]}\n\`\`\`\n`;
    let t = `---\nbooklet: "0.16"\ntitle: Fold ${n}\n---\n\n> [!activity|log repeat] Log\n\n> [!text|what] What happened?\n`;
    if (two) t += `\n> [!activity|more repeat] More\n\n> [!text|else] What else?\n`;
    const blocks = (n ? entries("log", n) : "") + (two ? entries("more", 4) : "");
    return blocks ? t + `\n%%\n> [!records] App record — do not edit below this line\n\n${blocks}%%\n` : t;
  }
  function iconNames() {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "booklet-icons.ts"), "utf8");
    return [...src.matchAll(/^\t"([a-z0-9-]+)",$/gm)].map(m => m[1]);
  }
  function iconsNote(names) {
    let t = `---\nbooklet: "0.16"\ntitle: All icons\n---\n\n> [!module|icons] All icons\n\n`;
    for (const n of names) t += `> [!activity|a-${n} icon:${n}] ${n}\n\nIcon ${n}.\n\n`;
    return t + `> [!module|icons end] End\n`;
  }
  const put = (vault, name, text) => fs.writeFileSync(path.join(vault, name), text);

  /* ---- what the checks read and press ---- */
  const state = o => o.evaluate(() => {
    const l = app.workspace.getLeavesOfType("booklet")[0], root = l && l.view.contentEl;
    const pg = root && root.querySelector(".booklet-page"), tab = root && root.querySelector(".booklet-tabbtn.is-active"), at = root && root.querySelector(".booklet-pager-at");
    return {
      screen: pg && pg.getAttribute("data-booklet-screen"), tab: tab && tab.textContent, at: at ? at.textContent : "", file: l && l.view.file && l.view.file.path,
      back: l && l.history ? l.history.backHistory.length : null, fwd: l && l.history ? l.history.forwardHistory.length : null, vs: l && l.getViewState().state,
      cards: root ? [...root.querySelectorAll(".booklet-cardrow .booklet-cardtitle")].map(x => x.textContent) : [],
      pager: root ? [...root.querySelectorAll(".booklet-pager button")].map(x => x.textContent.trim()) : [],
      trail: root ? [...root.querySelectorAll(".booklet-trail > *")].map(x => x.textContent) : [],
      title: root && (root.querySelector(".booklet-screentitle") || {}).textContent,
    };
  });
  const click = async (o, sel, text, wait = 500) => { await o.page.locator(BOOK + " " + sel).filter({ hasText: text }).first().click({ timeout: 6000 }); await sleep(wait); };
  const ready = async (o, rel) => {
    // a note written into the vault after Obsidian started is not known to it for a moment
    // and the plugin knows a note is a booklet only from its front matter in Obsidian's cache
    await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, rel, { timeout: 10000, polling: 100 });
    await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, rel);
    const typed = await waitActiveType(o, "booklet", 20000);
    // the pane's old page stays on screen until the new note is drawn: wait for the page of this note
    try { await o.page.waitForFunction(r => { const l = app.workspace.getLeavesOfType("booklet")[0]; return !!(l && l.view.file && l.view.file.path === r && l.view.contentEl.querySelector(".booklet-page")); }, rel, { timeout: 20000, polling: 100 }); } catch (e) { throw new Error("no page for " + rel + " (booklet view " + typed + ", active type " + await o.evaluate(() => app.workspace.activeLeaf.view.getViewType()) + ")"); }
    await sleep(700);
  };
  const back = async o => { await o.evaluate(() => app.commands.executeCommandById("app:go-back")); await sleep(500); };
  const forward = async o => { await o.evaluate(() => app.commands.executeCommandById("app:go-forward")); await sleep(500); };
  const toKey = k => JSON.stringify([k.screen, k.tab, k.at]);

  /* ================= CHECK 16 ================= */
  async function check16() {
    const c = new Check(16, "the three screens and the moves: home, a module, an activity; cards, trail, pager, tabs, pages, parent:, links, a restart, nothing written into a note");
    await withApp("c16", async (o, vault) => {
      put(vault, WEEKLY, WEEKLY_NOTE);
      const before = { sk: sha(path.join(vault, SKETCH)), wk: sha(path.join(vault, WEEKLY)), ck: sha(path.join(vault, CHECKIN)) };
      await ready(o, SKETCH);
      let s = await state(o);
      c.ok(s.screen === "home" && s.back === 0, "a booklet of a bare activity and two modules opens on home: " + s.screen);
      c.ok(JSON.stringify(s.cards) === JSON.stringify(["1.Warm up", "2.The basics", "3.A sketch a day"]), "home: one card for each module and each activity outside a module, numbered by place: " + s.cards.join(" | "));
      await shot(o, "nav-home-light");
      await click(o, ".booklet-cardrow", "The basics");
      s = await state(o);
      c.ok(s.screen === "module:basics" && s.back === 1, `into a module is a step: ${s.screen}, history ${s.back}`);
      c.ok(s.vs && s.vs.version === 1 && s.vs.screen === "module:basics" && s.vs.part === 0, "the view state is { version, screen, tab, part }: " + JSON.stringify(s.vs));
      await click(o, ".booklet-tabbtn", "Read first");
      s = await state(o);
      c.ok(s.tab === "Read first" && s.back === 1, `another tab is no step: ${s.tab}, history ${s.back}`);
      await click(o, ".booklet-tabbtn", "Practice");
      await click(o, ".booklet-cardrow", "Boxes and cylinders");
      s = await state(o);
      c.ok(s.screen === "activity:basics/shapes" && s.back === 2 && s.trail.join("|") === "Learning to sketch|The basics|Boxes and cylinders", `into an activity is a step, and the trail leads up: ${s.screen}, ${s.trail.join(" / ")}`);
      await click(o, ".booklet-tabbtn", "Cylinders");
      await click(o, ".booklet-tabbtn", "Boxes");
      await click(o, ".booklet-pager button", "Next");
      s = await state(o);
      c.ok(/Page 2 of 2/.test(s.at) && s.back === 3, `another page is a step: ${s.at}, history ${s.back}`);
      await click(o, ".booklet-tabbtn", "Cylinders");
      await click(o, ".booklet-tabbtn", "Boxes");
      s = await state(o);
      c.ok(/Page 2 of 2/.test(s.at), "each tab keeps the page last seen while the pane is open: Boxes is on " + s.at);
      await click(o, ".booklet-pager button", "Next");
      s = await state(o);
      c.ok(s.screen === "activity:basics/light" && s.back === 4 && s.pager.join("|") === "Back to the overview|Next: 4. Cast shadows", `Next on the last page goes to the next activity, labelled with its number: ${s.screen}, ${s.pager.join(" | ")}`);
      c.ok(JSON.stringify(s.cards) === JSON.stringify(["4.Cast shadows", "5.Reflected light"]), "parent: drawn plainly, the children as cards under the parent: " + s.cards.join(" | "));
      await click(o, ".booklet-cardrow", "Cast shadows");
      s = await state(o);
      c.ok(s.trail.join("|") === "Learning to sketch|The basics|Where the light falls|Cast shadows" && s.pager[0] === "Up: Where the light falls", `the trail names the ancestors and the pager's left button leads up: ${s.trail.join(" / ")}; ${s.pager[0]}`);
      await shot(o, "nav-child-light");
      await click(o, ".booklet-pager button", "Up: Where the light falls");
      await click(o, ".booklet-trail-link", "The basics");
      s = await state(o);
      c.ok(s.screen === "module:basics" && s.tab === "Read first", `up by the trail: the module's screen on the tab that holds the activity: ${s.screen}, ${s.tab}`);
      // heading link inside the note: page 3 of Lines that hold points to a heading on page 2
      await click(o, ".booklet-tabbtn", "Practice");
      await click(o, ".booklet-cardrow", "Lines that hold");
      await click(o, ".booklet-pager button", "Next"); await click(o, ".booklet-pager button", "Next");
      const nb = (await state(o)).back;
      await o.page.locator(BOOK + " .booklet-pagebody a.internal-link").first().click(); await sleep(700);
      s = await state(o);
      c.ok(/Page 2 of 3/.test(s.at) && s.back === nb + 1, `a heading link inside the note opens the page that holds the heading, as a step: ${s.at}, history ${nb} -> ${s.back}`);
      // a link to a module the booklet lacks is drawn as a chip, and one to a module it holds opens it (Weekly plan is another booklet: its own copy)
      // a restart: the place comes back, the history is Obsidian's own
      await click(o, ".booklet-trail-link", "The basics");
      await click(o, ".booklet-cardrow", "Boxes and cylinders");
      await click(o, ".booklet-tabbtn", "Cylinders");
      const wanted = await state(o);
      await o.evaluate(() => app.workspace.requestSaveLayout()); await sleep(2500);
      const { vault: v2, configDir } = o;
      await o.close(); await sleep(1500);
      const o2 = await launch({ obsidian: path.resolve(opt.obsidian), vault: v2, configDir });
      try {
        await o2.page.waitForSelector(BOOK + " .booklet-page", { timeout: 15000 }); await sleep(900);
        const r = await state(o2);
        c.ok(r.screen === wanted.screen && r.tab === wanted.tab && r.vs.version === 1, `after closing Obsidian and starting it again the pane is in the same place: ${r.screen}, ${r.tab} (was ${wanted.screen}, ${wanted.tab})`);
        await shot(o2, "nav-after-restart-light");
        // the one-module booklet opens on its module screen
        await ready(o2, WEEKLY);
        s = await state(o2);
        c.ok(s.screen === "module:plan" && JSON.stringify(s.cards) === JSON.stringify(["1.Goals"]), `a booklet with one module of several activities opens on that module's screen, the tab's activities as cards: ${s.screen}, ${s.cards.join(" | ")}`);
        await ready(o2, CHECKIN);
        s = await state(o2);
        c.ok(s.screen === "module:day-check", "the check-in is reached through its module screen: " + s.screen);
        const opening = () => o2.evaluate(() => [...document.querySelectorAll(".workspace-leaf-content[data-type='booklet'] .booklet-opening")].map(x => x.textContent.replace(/\s+/g, " ").slice(0, 60)));
        const mo = await opening();
        c.ok(mo.length === 1 && /^Five short questions/.test(mo[0]), "the module's own opening text is drawn on its screen: " + JSON.stringify(mo));
        await click(o2, ".booklet-trail-link", "Check-in");
        const ho = await opening();
        c.ok((await state(o2)).screen === "home" && ho.length === 1 && /^A made-up check-in/.test(ho[0]), "the booklet's opening text is drawn on home: " + JSON.stringify(ho));
        await sleep(1500);
        const after = { sk: sha(path.join(v2, SKETCH)), wk: sha(path.join(v2, WEEKLY)), ck: sha(path.join(v2, CHECKIN)) };
        c.ok(JSON.stringify(after) === JSON.stringify(before), "the SHA-256 of three notes is the same after every move and a restart: nothing about the place is written into a note");
      } finally { await o2.close(); }
    });
    return c;
  }

  /* ================= CHECK 17 to 19 (design 4.9) ================= */
  async function check17() {
    const c = new Check(17, "Back is free: Back then Forward returns to the same place, and the step list does not grow");
    await withApp("c17", async o => {
      await ready(o, SKETCH);
      await click(o, ".booklet-cardrow", "The basics");
      await click(o, ".booklet-cardrow", "Boxes and cylinders");
      await click(o, ".booklet-pager button", "Next");
      const here = await state(o);
      c.ok(here.back === 3 && here.fwd === 0, `three steps taken: ${here.back} back, ${here.fwd} forward`);
      await back(o);
      const one = await state(o);
      c.ok(one.back === 2 && one.fwd === 1 && /Page 1 of 2/.test(one.at), `Back goes to the page before and adds no step: ${one.back} back, ${one.fwd} forward, ${one.at}`);
      await forward(o);
      const again = await state(o);
      c.ok(toKey(again) === toKey(here) && again.back === here.back && again.fwd === here.fwd, `Forward returns to the same place, and the list is as long as before: ${again.screen}, ${again.at}, ${again.back} back, ${again.fwd} forward`);
      await back(o); await back(o); await back(o);
      const top = await state(o);
      c.ok(top.screen === "home" && top.back === 0 && top.fwd === 3, `Back three times is home, with every step ahead: ${top.screen}, ${top.back} back, ${top.fwd} forward`);
    });
    return c;
  }
  async function check18() {
    const c = new Check(18, "no step for a tab: choosing a tab that opens on another page adds no step");
    await withApp("c18", async (o, vault) => {
      put(vault, "Tabs and pages.booklet.md", TABBED_NOTE);
      await ready(o, "Tabs and pages.booklet.md");
      await click(o, ".booklet-pager button", "Next"); await click(o, ".booklet-pager button", "Next");
      const a = await state(o);
      c.ok(a.tab === "One" && /Page 3 of 3/.test(a.at) && a.back === 2, `tab One on page 3 after two page steps: ${a.tab}, ${a.at}, history ${a.back}`);
      await click(o, ".booklet-tabbtn", "Two");
      const b = await state(o);
      c.ok(b.tab === "Two" && /Page 1 of 2/.test(b.at) && b.back === a.back && b.fwd === a.fwd, `Two opens on its own page 1 and the list is the same length: ${b.tab}, ${b.at}, history ${b.back}`);
      await click(o, ".booklet-tabbtn", "One");
      const d = await state(o);
      c.ok(d.tab === "One" && /Page 3 of 3/.test(d.at) && d.back === a.back, `One comes back on the page last seen there, with no step: ${d.at}, history ${d.back}`);
      await back(o);
      const e = await state(o);
      c.ok(e.tab === "One" && /Page 2 of 3/.test(e.at), `Back from there goes to the page before, not to the other tab: ${e.tab}, ${e.at}`);
    });
    return c;
  }
  async function check19() {
    const c = new Check(19, "no move is lost: a tab chosen while a page is turning ends on that tab; a double press on Next turns one page");
    await withApp("c19", async (o, vault) => {
      put(vault, "Tabs and pages.booklet.md", TABBED_NOTE);
      await ready(o, "Tabs and pages.booklet.md");
      // the press on Next and the tab chosen in the same moment, as a quick hand does
      await o.evaluate(sel => {
        const root = document.querySelector(sel);
        const next = [...root.querySelectorAll(".booklet-pager button")].find(b => /^Next/.test(b.textContent.trim()));
        const two = [...root.querySelectorAll(".booklet-tabbtn")].find(b => b.textContent === "Two");
        next.click(); two.click();
      }, BOOK);
      await sleep(900);
      let s = await state(o);
      c.ok(s.tab === "Two", `a tab chosen while the page was turning: the pane ends on that tab: ${s.tab}, ${s.at}`);
      await click(o, ".booklet-tabbtn", "One");
      s = await state(o);
      c.ok(/Page 2 of 3/.test(s.at), `and the turn itself landed: tab One is on page 2: ${s.at}`);
      const n0 = s.back;
      await o.evaluate(sel => {
        const next = [...document.querySelector(sel).querySelectorAll(".booklet-pager button")].find(b => /^Next/.test(b.textContent.trim()));
        next.click(); next.click();
      }, BOOK);
      await sleep(900);
      s = await state(o);
      c.ok(/Page 3 of 3/.test(s.at) && s.back === n0 + 1, `a double press on Next turns one page: ${s.at}, one step (${n0} -> ${s.back})`);
      await o.evaluate(sel => { const b = [...document.querySelector(sel).querySelectorAll(".booklet-pager button")].find(x => /^Back/.test(x.textContent.trim())); b.click(); b.click(); }, BOOK);
      await sleep(900);
      s = await state(o);
      c.ok(/Page 2 of 3/.test(s.at), `a double press on Back turns one page: ${s.at}`);
    });
    return c;
  }

  /* ================= CHECK 20 ================= */
  async function check20() {
    const c = new Check(20, "outside links: a link from another note to an activity's title, a heading on a later page, a tab and a daily check-in opens each");
    await withApp("c20", async (o, vault) => {
      put(vault, "Links.md", LINKS_NOTE);
      put(vault, "Finish test.booklet.md", FINISH_NOTE);
      const link = async text => {
        await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel), { state: { mode: "preview" } }); }, "Links.md");
        await o.page.waitForSelector(".markdown-preview-view a.internal-link", { timeout: 8000 }); await sleep(300);
        await o.evaluate(() => document.querySelectorAll(".hover-popover").forEach(e => e.remove()));
        await o.page.mouse.move(5, 5);
        await o.page.locator(".markdown-preview-view a.internal-link", { hasText: text }).first().click();
        await o.page.waitForSelector(BOOK + " .booklet-page", { timeout: 8000 }); await sleep(900);
        return state(o);
      };
      let s = await link("Cast shadows");
      c.ok(s.screen === "activity:basics/shadow" && s.file === SKETCH, "[[Learning to sketch.booklet#Cast shadows]], an activity's title (no Markdown heading): " + s.screen);
      await shot(o, "nav-link-activity-light");
      s = await link("Ten in a row");
      c.ok(s.screen === "activity:basics/lines" && /Page 3 of 3/.test(s.at), "a heading on a later page opens that page: " + s.screen + ", " + s.at);
      s = await link("Cylinders");
      c.ok(s.screen === "activity:basics/shapes" && s.tab === "Cylinders", "a tab's name opens that tab: " + s.screen + ", " + s.tab);
      s = await link("Today");
      c.ok(s.screen === "activity:day-check/today" && s.file === CHECKIN, "[[Check-in.booklet#Today]] from an ordinary note opens Today: " + s.screen);
      s = await link("Answer");
      c.ok(s.screen === "activity:/log" && s.tab === "Answer", "the tab that holds the question: " + s.screen + ", " + s.tab);
      await o.evaluate(async () => { await app.workspace.openLinkText("Learning to sketch.booklet#Cast shadows", "Links.md"); }); await sleep(900);
      s = await state(o);
      c.ok(s.screen === "activity:basics/shadow", "a second link while a booklet is in the pane moves it: " + s.screen);
      await o.evaluate(async () => { await app.workspace.openLinkText("Learning to sketch.booklet#Ten in a row", "Links.md"); }); await sleep(900);
      s = await state(o);
      c.ok(s.screen === "activity:basics/lines" && /Page 3 of 3/.test(s.at), "the same booklet already open in the pane, a second link to a later page: " + s.screen + ", " + s.at);
      await o.evaluate(async () => { await app.workspace.openLinkText("Learning to sketch.booklet#^abc", "Links.md"); }); await sleep(600);
      s = await state(o);
      c.ok(s.screen === "activity:basics/lines", "a link to a block leaves the place alone: " + s.screen);
      c.ok(sha(path.join(vault, SKETCH)) === sha(path.join(SRC_VAULT, SKETCH)), "no link wrote into the booklet");
    });
    return c;
  }

  /* ================= CHECK 21 ================= */
  async function check21() {
    const c = new Check(21, "icons: every one of Booklet's 161 names draws by its lucide- id, on a card and by Obsidian's own setIcon; a name that draws nothing is caught");
    await withApp("c21", async (o, vault) => {
      const names = iconNames();
      c.ok(names.length === 161, "src/booklet-icons.ts lists " + names.length + " names");
      put(vault, "All icons.booklet.md", iconsNote(names));
      await ready(o, "All icons.booklet.md");
      const cards = await o.evaluate(sel => [...document.querySelector(sel).querySelectorAll(".booklet-cardrow")].map(r => ({ title: (r.querySelector(".booklet-cardtitle-words") || {}).textContent, shapes: r.querySelectorAll(".booklet-pic svg *").length })), BOOK);
      const blank = cards.filter(r => !r.shapes).map(r => r.title);
      c.ok(cards.length === 161 && blank.length === 0, "all 161 cards draw their picture" + (blank.length ? "; draw nothing: " + blank.join(", ") : "") + " (" + cards.length + " cards)");
      const draws = list => o.evaluate(ns => ns.map(n => { const el = app.plugins.plugins.booklet.addRibbonIcon("lucide-" + n, "probe", () => {}); const d = !!el.querySelector("svg *"); el.remove(); return d; }), list);
      const probe = await draws(["not-an-icon-at-all", "pencil"]);
      c.ok(probe[0] === false && probe[1] === true, "the check's own detector: a name Obsidian lacks draws nothing, a real one draws (" + probe.join(", ") + ")");
      const each = await draws(names);
      const missing = names.filter((n, i) => !each[i]);
      c.ok(missing.length === 0, "Obsidian's setIcon draws every one of the 161 names by lucide-<name>" + (missing.length ? "; draws nothing: " + missing.join(", ") : ""));
      await shot(o, "nav-icons-light");
      await o.setScheme("dark"); await sleep(300); await shot(o, "nav-icons-dark");
    });
    return c;
  }

  /* ================= CHECK 22 ================= */
  async function check22() {
    const c = new Check(22, "the finish only under a tab that holds a question; the kept-entries fold: its count, open and shut by a press and by the keyboard, kept for each activity, nothing written; 0, 1, 4 and 25 entries");
    await withApp("c22", async (o, vault) => {
      put(vault, "Finish test.booklet.md", FINISH_NOTE);
      for (const n of [0, 1, 4, 25]) put(vault, `Fold ${n}.booklet.md`, foldNote(n, false));
      put(vault, "Fold two.booklet.md", foldNote(4, true));
      // the finish
      await ready(o, "Finish test.booklet.md");
      const fin = () => o.evaluate(sel => document.querySelectorAll(sel + " .booklet-finalize").length, BOOK);
      c.ok(await fin() === 0, "a reading tab has no Finalize");
      await click(o, ".booklet-tabbtn", "Answer");
      c.ok(await fin() === 1, "the tab that holds the question has its Finalize");
      await click(o, ".booklet-tabbtn", "Read");
      c.ok(await fin() === 0, "back on the reading tab: no Finalize");
      // the fold, desktop
      const info = () => o.evaluate(sel => {
        const f = document.querySelector(sel + " .booklet-fold"), list = document.querySelector(sel + " .booklet-entry-list");
        const r = f.getBoundingClientRect();
        return { label: f.textContent, expanded: f.getAttribute("aria-expanded"), controls: f.getAttribute("aria-controls") === list.id, visible: list.getClientRects().length > 0, entries: list.querySelectorAll(".booklet-entry").length, height: Math.round(r.height), tag: f.tagName, icon: (f.querySelector("svg") || {}).getAttribute && f.querySelector("svg").getAttribute("class") };
      }, BOOK);
      const toggle = async (key) => { if (key === "click") await o.page.locator(BOOK + " .booklet-fold").click(); else { await o.page.locator(BOOK + " .booklet-fold").focus(); await o.page.keyboard.press(key); } await sleep(300); };
      for (const n of [0, 1, 4, 25]) {
        await ready(o, `Fold ${n}.booklet.md`);
        let i = await info();
        c.ok(i.tag === "BUTTON" && i.label === `Kept entries (${n})` && i.expanded === "true" && i.visible && i.controls, `${n} entries: the heading is a button reading "${i.label}", open to begin with, aria-expanded ${i.expanded}`);
        c.ok(n === 0 ? i.entries === 0 : i.entries >= 1, `${n} entries: the list shows ${i.entries} (a long list shows its first ones, with Show all)`);
        for (const scheme of ["light", "dark"]) { await o.setScheme(scheme); await sleep(400); await shot(o, `fold-${n}-open-${scheme}`); }
        await o.setScheme("light");
        await toggle("click");
        i = await info();
        c.ok(i.expanded === "false" && !i.visible && i.entries === (await o.evaluate(sel => document.querySelectorAll(sel + " .booklet-entry").length, BOOK)), `${n} entries: a press folds the list (aria-expanded ${i.expanded}, list hidden), the same entries still in the page`);
        for (const scheme of ["light", "dark"]) { await o.setScheme(scheme); await sleep(400); await shot(o, `fold-${n}-closed-${scheme}`); }
        await o.setScheme("light");
        await toggle("Enter");
        i = await info();
        c.ok(i.expanded === "true" && i.visible, `${n} entries: Enter opens it again`);
        await toggle(" ");
        i = await info();
        c.ok(i.expanded === "false" && !i.visible, `${n} entries: Space shuts it`);
        await toggle("click");
        if (n === 25) {
          const more = await o.evaluate(sel => { const b = document.querySelector(sel + " .booklet-more"); return b ? b.textContent : null; }, BOOK);
          c.ok(/Show all 25 entries/.test(more || ""), "25 entries: Show all is inside the fold: " + more);
          await o.page.locator(BOOK + " .booklet-more").click(); await sleep(400);
          const all = await o.evaluate(sel => document.querySelectorAll(sel + " .booklet-entry").length, BOOK);
          c.ok(all === 25, "25 entries: Show all lists every one: " + all);
        }
      }
      // kept for each activity, and written nowhere
      const two = path.join(vault, "Fold two.booklet.md"), h0 = sha(two);
      await ready(o, "Fold two.booklet.md");
      c.info("Fold two opens on " + JSON.stringify(await state(o)));
      await o.page.locator(BOOK + " .booklet-cardrow").first().click({ timeout: 5000 }); await sleep(600);
      let st = await state(o);
      c.ok(/^activity:\/log$/.test(st.screen || ""), "Fold two: the first activity: " + st.screen);
      await toggle("click");
      const stateBefore = JSON.stringify(st.vs);
      await click(o, ".booklet-trail-link", "Fold 4");
      await click(o, ".booklet-cardrow", "More");
      let i2 = await info();
      c.ok(i2.expanded === "true" && i2.label === "Kept entries (4)", "the second activity has its own choice: open, " + i2.label);
      await click(o, ".booklet-trail-link", "Fold 4");
      await click(o, ".booklet-cardrow", "Log");
      i2 = await info();
      c.ok(i2.expanded === "false", "coming back, the first activity is still folded: " + i2.expanded);
      st = await state(o);
      c.ok(JSON.stringify(st.vs) === stateBefore && Object.keys(st.vs).every(k => ["file", "version", "screen", "tab", "page", "part"].includes(k)), "the saved place holds only file, version, screen, tab, page and part: " + JSON.stringify(st.vs));
      await sleep(1500);
      c.ok(sha(two) === h0, "folding wrote nothing into the note");
      // the fold on a phone
      await o.page.setViewportSize({ width: 390, height: 844 });
      await o.evaluate(() => app.emulateMobile(true)); await sleep(1500);
      for (const n of [0, 1, 4, 25]) {
        await ready(o, `Fold ${n}.booklet.md`);
        const i = await info();
        c.ok(i.height >= 44, `phone, ${n} entries: the fold's control is ${i.height} px tall`);
        for (const scheme of ["light", "dark"]) {
          await o.setScheme(scheme); await sleep(400);
          await o.evaluate(sel => document.querySelector(sel + " .booklet-fold").scrollIntoView({ block: "center" }), BOOK); await sleep(200);
          await shot(o, `fold-phone-${n}-open-${scheme}`);
          if (n >= 4) {
            await o.page.locator(BOOK + " .booklet-fold").click(); await sleep(400);
            await shot(o, `fold-phone-${n}-closed-${scheme}`);
            await o.page.locator(BOOK + " .booklet-fold").click(); await sleep(300);
          }
        }
        await o.setScheme("light");
      }
      await o.evaluate(() => app.emulateMobile(false));
    });
    return c;
  }

  /* ================= CHECK 23 ================= */
  async function check23() {
    const c = new Check(23, "the phone (Obsidian's phone mode, 390 x 844, light and dark): no sideways scroll, controls 44 px, the pager clear of the floating bar, the trail and the pager wrapping, seven tabs on rows, the tab keys");
    await withApp("c23", async (o, vault) => {
      put(vault, "Long titles.booklet.md", LONG_NOTE);
      await o.page.setViewportSize({ width: 390, height: 844 });
      await o.evaluate(() => app.emulateMobile(true)); await sleep(1500);
      const phone = await o.evaluate(() => ({ phone: document.body.classList.contains("is-phone"), w: window.innerWidth }));
      c.ok(phone.phone && phone.w === 390, "phone mode on: is-phone " + phone.phone + ", window " + phone.w + " px");
      const metrics = () => o.evaluate(sel => {
        const v = app.workspace.getLeavesOfType("booklet")[0].view.contentEl, r = e => e.getBoundingClientRect(), root = document.querySelector(sel);
        const min = q => { const h = [...root.querySelectorAll(q)].map(e => r(e).height); return h.length ? Math.min(...h) : null; };
        const pager = root.querySelector(".booklet-pager"), bar = document.querySelector(".mobile-navbar"), trail = root.querySelector(".booklet-trail"), tabbar = root.querySelector(".booklet-tabbar");
        const rows = el => el ? new Set([...el.children].map(x => Math.round(r(x).top))).size : 0;
        return { sideways: Math.max(v.scrollWidth - v.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth), card: min(".booklet-cardrow"), tab: min(".booklet-tabbtn"), pager: min(".booklet-pager button"), trailRows: rows(trail), tabRows: rows(tabbar), pagerRows: pager ? new Set([...pager.querySelectorAll("button")].map(b => Math.round(r(b).top))).size : 0, tabbarSideways: tabbar ? tabbar.scrollWidth - tabbar.clientWidth : 0, pagerBottom: pager ? r(pager).bottom : null, barTop: bar ? r(bar).top : null, scrolls: v.scrollHeight - v.clientHeight };
      }, BOOK);
      const atEnd = () => o.evaluate(() => { const v = app.workspace.getLeavesOfType("booklet")[0].view.contentEl; v.scrollTop = v.scrollHeight; });
      for (const scheme of ["light", "dark"]) {
        await o.setScheme(scheme); await sleep(300);
        await ready(o, SKETCH);
        let m = await metrics();
        c.ok(m.sideways <= 0 && m.card >= 44, `[${scheme}] home: no sideways scroll (${m.sideways}), card rows ${Math.round(m.card)} px`);
        await shot(o, `nav-phone-home-${scheme}`);
        await click(o, ".booklet-cardrow", "A sketch a day"); await click(o, ".booklet-cardrow", "Seven studies", 700);
        m = await metrics();
        c.ok(m.sideways <= 0 && m.tab >= 44 && m.tabRows >= 2 && m.tabbarSideways <= 0, `[${scheme}] seven tabs wrap onto ${m.tabRows} rows, the bar does not scroll (${m.tabbarSideways}), tabs ${m.tab} px`);
        c.ok(m.trailRows >= 1 && m.pager >= 44, `[${scheme}] trail rows ${m.trailRows}, pager buttons ${m.pager} px`);
        await shot(o, `nav-phone-tabs-${scheme}`);
        if (scheme === "light") {
          const tabOn = () => o.evaluate(sel => (document.querySelector(sel + " .booklet-tabbtn.is-active") || {}).textContent, BOOK);
          await o.page.locator(BOOK + " .booklet-tabbtn.is-active").focus();
          await o.page.keyboard.press("ArrowRight"); await sleep(300);
          const a = await tabOn();
          await o.page.keyboard.press("End"); await sleep(300);
          const b = await tabOn();
          await o.page.keyboard.press("Home"); await sleep(300);
          const d = await tabOn();
          await o.page.keyboard.press("ArrowLeft"); await sleep(300);
          const e = await tabOn();
          c.ok(a === "Cups" && b === "Clouds" && d === "Hands" && e === "Hands", `the tab bar takes ArrowRight (${a}), End (${b}), Home (${d}) and ArrowLeft on the first (${e})`);
        }
        await ready(o, "Long titles.booklet.md");
        await click(o, ".booklet-cardrow", "The first activity", 600); await click(o, ".booklet-cardrow", "The second activity", 700);
        m = await metrics();
        c.ok(m.sideways <= 0 && m.trailRows >= 2, `[${scheme}] a long trail wraps onto ${m.trailRows} rows, no sideways scroll (${m.sideways})`);
        c.ok(m.sideways <= 0 && m.pager >= 44 && m.pagerRows >= 2, `[${scheme}] both pager labels long: buttons ${Math.round(m.pager)} px, no sideways scroll, wrapped onto ${m.pagerRows} rows`);
        await atEnd(); await sleep(300);
        m = await metrics();
        c.ok(m.barTop === null || m.pagerBottom < m.barTop, `[${scheme}] the long pager is clear of Obsidian's floating bar: ends ${Math.round(m.pagerBottom)}, bar starts ${Math.round(m.barTop)}`);
        await shot(o, `nav-phone-long-${scheme}`);
        await ready(o, CHECKIN);
        await click(o, ".booklet-cardrow", "Today", 800);
        await atEnd(); await sleep(400);
        m = await metrics();
        c.ok(m.scrolls > 200 && m.pagerBottom < m.barTop, `[${scheme}] a long page (scrolls ${m.scrolls} px): the pager ends at ${Math.round(m.pagerBottom)}, the bar starts at ${Math.round(m.barTop)}`);
        await shot(o, `nav-phone-today-end-${scheme}`);
      }
      await o.evaluate(() => app.emulateMobile(false));
    });
    return c;
  }

  return { 16: check16, 17: check17, 18: check18, 19: check19, 20: check20, 21: check21, 22: check22, 23: check23 };
};
