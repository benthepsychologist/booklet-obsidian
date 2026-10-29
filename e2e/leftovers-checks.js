// Check 26 of plugin-check.js: the 0.7.0 stage C, the small leftovers of 0.6.0, in the real app. The note is made up and written into
// the check's own copy of the vault:
//   a tab bar and its panel (module screen and activity screen), a tab bar named in plain words, focus after a press that moves
//   (a card, the pager) for a keyboard reader, a `- - -` line under text as a page break, and a long table's numeric column.
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check function.
const fs = require("fs"), path = require("path");
const { quiet, drawing, frames, mobile, kit } = require("./waits");

module.exports = function leftoversChecks(env) {
  const { withApp, Check, BOOK } = env;
  const NOTE = "Leftovers.booklet.md";
  const { shot, sha, goTo, open } = kit(env, NOTE);

  const noteText = () => {
    const rows = Array.from({ length: 240 }, (_, i) => `{"ts": "2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}T09:00:00Z", "steps": ${1000 + i * 7}, "note": "Made-up entry ${i + 1}"}`).join(",\n");
    return `---\nbooklet: "0.16"\ntitle: Leftovers\n---\n\n> [!module|mod] **Bold** and *slanted* module\n\n> [!tab|a] First tab\n\nWords under the first tab.\n\n> [!tab|b] Second tab\n\nWords under the second tab.\n\n`
      + `> [!activity|walk tab:a] A **walk** [with a link](https://example.org)\n\nA line of text\n- - -\nAfter the break.\n\n> [!activity|talk tab:b] Talk it over\n\nWords for talking.\n\n> [!module|mod end] End\n\n`
      + `> [!activity|multi] Two tabs\n\n> [!tab|one] One\n\nPage one text.\n\n***\n\nPage two text.\n\n> [!tab|two] Two\n\nOther tab text.\n\n> [!activity|log repeat] Log\n\n> [!number|steps] How many steps?\n\n> [!text|note] A note\n\n\`\`\`booklet query\nfrom: log\nas: table\nfields: steps, note\nlimit: 500\n\`\`\`\n\n`
      + `%%\n> [!records] App record — do not edit below this line\n\n\`\`\`booklet entries log\n{"items": [\n${rows}\n]}\n\`\`\`\n%%\n`;
  };
  const panelInfo = o => o.evaluate(sel => {
    const root = document.querySelector(sel), list = root.querySelector("[role=tablist]");
    const tabs = [...root.querySelectorAll("[role=tab]")], on = tabs.find(t => t.getAttribute("aria-selected") === "true");
    const panels = [...root.querySelectorAll("[role=tabpanel]")], p = panels[0];
    return { label: list && list.getAttribute("aria-label"), tabs: tabs.length, panels: panels.length, controls: on && on.getAttribute("aria-controls"), panelId: p && p.id, named: p && on && p.getAttribute("aria-labelledby") === on.id, panelText: p ? p.textContent.replace(/\s+/g, " ").trim().slice(0, 60) : null, desc: p && p.getAttribute("aria-description") };
  }, BOOK);
  const focused = o => o.evaluate(() => { const a = document.activeElement; return { cls: a && a.className, role: a && a.getAttribute("role"), text: a && a.textContent.replace(/\s+/g, " ").trim().slice(0, 40), tabindex: a && a.getAttribute("tabindex") }; });

  async function check26() {
    const c = new Check(26, "stage C: the 0.6.0 leftovers in the real app: tab panels, plain-word names, focus after a move for a keyboard reader, `- - -` as a page break, a long table's numeric column; desktop and phone, light and dark; nothing written");
    await withApp("c26", async (o, vault) => {
      const file = path.join(vault, NOTE);
      fs.writeFileSync(file, noteText());
      const h0 = sha(file);
      await open(o, NOTE);

      for (const where of ["desktop", "phone"]) {
        if (where === "phone") {
          await o.page.setViewportSize({ width: 390, height: 844 });
          await mobile(o, true);
          await open(o, NOTE);
        }
        await goTo(o, "module:mod");
        let p = await panelInfo(o);
        c.ok(p.label === "Bold and slanted module" && p.tabs === 2, where + ": the tab bar is named in plain words, with no Markdown marks: " + JSON.stringify(p.label));
        c.ok(p.panels === 1 && p.controls === p.panelId && p.named && /Words under the first tab/.test(p.panelText), where + ": the chosen tab controls one panel, which holds the tab's words and is named by the tab: " + JSON.stringify(p));
        const blurb = await o.evaluate(sel => (document.querySelector(sel + " .booklet-cardrow .booklet-cardblurb, " + sel + " .booklet-cardrow .booklet-cardtext") || {}).textContent, BOOK);
        c.ok(/A line of text/.test(blurb || "") && !/- - -|After the break/.test(blurb || ""), where + ": a card's blurb stops at the `- - -` break under its text: " + JSON.stringify(blurb));
        // a key moves the choice: focus stays on the tab, the panel is the new tab's
        await o.page.locator(BOOK + " [role=tab][aria-selected=true]").focus();
        await o.page.keyboard.press("ArrowRight"); await quiet(o);
        p = await panelInfo(o);
        const f1 = await focused(o);
        c.ok(p.panels === 1 && p.controls === p.panelId && p.named && /Words under the second tab/.test(p.panelText) && f1.role === "tab", where + ": ArrowRight chooses the next tab, its panel follows, and focus stays on the tab: " + JSON.stringify({ p, f1 }));
        await o.page.keyboard.press("ArrowLeft"); await quiet(o);
        for (const scheme of ["light", "dark"]) { await o.setScheme(scheme); await frames(o); await shot(o, `leftovers-tabpanel-${where}-${scheme}`); }
        await o.setScheme("light"); await frames(o);

        // a card pressed with the keyboard: focus goes to the new screen's title
        await o.page.locator(BOOK + " .booklet-cardrow").first().focus();
        await drawing(o, () => o.page.keyboard.press("Enter"));
        let f = await focused(o);
        const screen = await o.evaluate(sel => document.querySelector(sel + " .booklet-page").getAttribute("data-booklet-screen"), BOOK);
        c.ok(screen === "activity:mod/walk" && /booklet-screentitle/.test(f.cls) && f.tabindex === "-1" && f.text === "A walk with a link", where + ": Enter on a card opens the activity and focus is on its title: " + screen + ", " + JSON.stringify(f));
        const out = await o.evaluate(sel => { const a = document.activeElement; return a ? getComputedStyle(a).outlineStyle : null; }, BOOK);
        c.ok(out === "none", where + ": the title that takes focus shows no ring (it is not a control): outline " + out);
        const named = await o.evaluate(sel => { const l = document.querySelector(sel + " [role=tablist]"); return l ? l.getAttribute("aria-label") : "(no tab bar)"; }, BOOK);
        c.ok(named === "(no tab bar)", where + ": an activity with no tab line has no tab bar and no tab panel: " + named);

        // `- - -` under text is a page break
        const pg = await o.evaluate(sel => ({ at: (document.querySelector(sel + " .booklet-pager-at") || {}).textContent, text: document.querySelector(sel + " .booklet-pagebody").textContent.replace(/\s+/g, " ").trim(), panels: document.querySelectorAll(sel + " [role=tabpanel]").length, role: document.querySelector(sel + " .booklet-pagebody").getAttribute("role") }), BOOK);
        c.ok(/Page 1 of 2/.test(pg.at) && /A line of text/.test(pg.text) && !/After the break/.test(pg.text) && !/- - -/.test(pg.text) && pg.panels === 0 && pg.role === "group", where + ": `- - -` under a line of text is a page break (page 1 of 2, no rule drawn, its page a group): " + JSON.stringify(pg));
        await shot(o, `leftovers-break-page1-${where}-light`);
        // Next with the keyboard: focus goes to the page
        await o.page.locator(BOOK + " .booklet-pager button").filter({ hasText: "Next" }).first().focus();
        await drawing(o, () => o.page.keyboard.press("Enter"));
        f = await focused(o);
        const pg2 = await o.evaluate(sel => ({ at: document.querySelector(sel + " .booklet-pager-at").textContent, text: document.querySelector(sel + " .booklet-pagebody").textContent.replace(/\s+/g, " ").trim() }), BOOK);
        c.ok(/Page 2 of 2/.test(pg2.at) && /After the break/.test(pg2.text) && /booklet-pagebody/.test(f.cls), where + ": Next with the keyboard turns the page and focus is on the page: " + JSON.stringify({ pg2, f }));
        await o.setScheme("dark"); await frames(o); await shot(o, `leftovers-break-page2-${where}-dark`);
        await o.setScheme("light"); await frames(o);

        // an activity's tab bar: the page body is the chosen tab's panel
        await goTo(o, "activity:/multi");
        const ap = await o.evaluate(sel => { const root = document.querySelector(sel), on = root.querySelector("[role=tab][aria-selected=true]"), panel = root.querySelector("[role=tabpanel]"); return { panel: !!panel, isBody: !!panel && panel.classList.contains("booklet-pagebody"), controls: on && panel && on.getAttribute("aria-controls") === panel.id, named: on && panel && panel.getAttribute("aria-labelledby") === on.id, desc: panel && panel.getAttribute("aria-description"), label: panel && panel.getAttribute("aria-label"), label2: root.querySelector("[role=tablist]").getAttribute("aria-label") }; }, BOOK);
        c.ok(ap.panel && ap.isBody && ap.controls && ap.named && ap.desc === "Page 1 of 2" && ap.label === "Page 1 of 2", where + ": under an activity's tab bar the page body is the tab's panel, named by the tab, described by its page, and still carrying the page group's label: " + JSON.stringify(ap));
        // a long table: its numeric column is set to the right once for the column
        await goTo(o, "activity:/log");
        const t = await o.evaluate(sel => {
          const table = document.querySelector(sel + " table.booklet-q-table");
          if (!table) return null;
          const heads = [...table.querySelectorAll("thead th")].map(h => [h.textContent.trim(), h.classList.contains("booklet-q-num")]);
          const cols = heads.map((h, i) => { const cells = [...table.querySelectorAll("tbody tr")].filter(r => r.children.length === heads.length).map(r => r.children[i]); return { name: h[0], head: h[1], cells: cells.length, num: cells.filter(x => x.classList.contains("booklet-q-num")).length }; });
          return { rows: table.querySelectorAll("tbody tr").length, cols };
        }, BOOK);
        const stepsCol = t && t.cols.find(x => /step/i.test(x.name)), noteCol = t && t.cols.find(x => /note/i.test(x.name));
        c.ok(t && t.rows >= 200 && stepsCol && stepsCol.head && stepsCol.num === stepsCol.cells && stepsCol.cells >= 200 && noteCol && !noteCol.head && noteCol.num === 0, where + ": a table of " + (t && t.rows) + " rows: the steps column is numeric in its head and every cell, the note column is not: " + JSON.stringify(t && t.cols));
        await frames(o);
        await shot(o, `leftovers-table-${where}-light`);
        const l = await o.evaluate(sel => { const v = document.querySelector(sel + " .view-content"); return v.scrollWidth - v.clientWidth; }, BOOK);
        if (where === "phone") c.ok(l <= 0, "phone: the long table does not make the view scroll sideways (" + l + ")");
      }
      await o.page.setViewportSize({ width: 1280, height: 800 });
      await mobile(o, false);
      await open(o, NOTE);
      await quiet(o);
      c.ok(sha(file) === h0, "all of it wrote nothing into the note");
    });
    return c;
  }
  return { 26: check26 };
};
