// Check 25 of plugin-check.js: the 0.7.0 stage B of the plugin, in the real app. Every note is made up (test-vault "Reading and steps").
//   a question inside a group and inside a tip, a folded group, steps (one group at a time, none of them a step in Obsidian's
//   Back and Forward), a row's cells side by side (stacked on a phone), footnotes as numbered marks with a source under the
//   paragraph, and the format's own reading kinds (diff, law, opinion) in their own colour, picture and border.
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check function.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { quiet, drawing, frames, mobile } = require("./waits");

module.exports = function readingChecks(env) {
  const { withApp, Check, SHOTS, sleep, BOOK, waitActiveType } = env;
  const READ = "Reading and steps.booklet.md";
  const shot = (o, name) => o.screenshot(path.join(SHOTS, name + ".png"));
  const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

  const answers = vault => {
    const text = fs.readFileSync(path.join(vault, READ), "utf8"), out = {};
    for (const m of text.matchAll(/```booklet answers([^\n]*)\n([\s\S]*?)```/g)) out[m[1].trim()] = JSON.parse(m[2]);
    return out;
  };
  // the text of the note from its records region on
  const records = f => { const t = fs.readFileSync(f, "utf8"), i = t.indexOf("%%"); return i < 0 ? "" : t.slice(i); };
  const recordsOf = (vault, act) => { const a = answers(vault); return a[act] || a[""] || {}; };
  const goTo = async (o, screen) => {
    await o.evaluate(async screen => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 1, screen, part: 0 }, active: true }); }, screen);
    await o.page.waitForSelector(BOOK + " .booklet-page[data-booklet-screen='" + screen + "']", { timeout: 8000 });
    await quiet(o);
  };
  const open = async (o, rel) => {
    await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, rel, { timeout: 10000, polling: 100 });
    await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, rel);
    await waitActiveType(o, "booklet", 20000);
    await o.page.waitForSelector(BOOK + " .booklet-page", { timeout: 20000 });
    await quiet(o);
  };
  const q = id => BOOK + " [data-booklet-q='" + id + "']";
  const press = async (o, sel, text) => { await o.page.locator(sel).filter({ hasText: text }).first().click({ timeout: 6000 }); await quiet(o); };
  const scrollTo = async (o, sel) => { await o.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: "center" }), sel); await frames(o); };
  const backLength = o => o.evaluate(() => app.workspace.getLeavesOfType("booklet")[0].history.backHistory.length);
  // which step is on show, and the progress line
  const steps = o => o.evaluate(sel => {
    const all = [...document.querySelectorAll(sel + " .booklet-step")];
    return { n: all.length, shown: all.map((s, i) => (s.hidden || s.getClientRects().length === 0 ? 0 : i + 1)).filter(Boolean), progress: (document.querySelector(sel + " .booklet-steps-progress") || {}).textContent || "", pager: [...document.querySelectorAll(sel + " .booklet-pager button")].map(b => b.textContent.trim()) };
  }, BOOK);
  // the size of every control, and whether the view scrolls sideways (an inline source mark is left out: its touch area is a
  // wider invisible one around a number set in a line of words, as a footnote mark is everywhere)
  const layout = o => o.evaluate(sel => {
    const v = document.querySelector(sel + " .view-content"), page = document.querySelector(sel + " .booklet-page");
    const small = [...page.querySelectorAll("button, input.booklet-text, [role=button]")].filter(b => !b.classList.contains("booklet-cite-mark") && b.getClientRects().length && b.getBoundingClientRect().height < 44).map(b => (b.className + " " + b.textContent.trim()).slice(0, 40) + " " + Math.round(b.getBoundingClientRect().height));
    return { sideways: v.scrollWidth - v.clientWidth, small };
  }, BOOK);
  const kindLook = (o, kind) => o.evaluate(([sel, kind]) => {
    const c = document.querySelector(sel + " .callout[data-callout='" + kind + "']");
    if (!c) return null;
    const s = getComputedStyle(c), icon = c.querySelector(".callout-icon svg");
    return { style: s.borderLeftStyle, width: s.borderLeftWidth, colour: s.getPropertyValue("--callout-color").trim(), icon: icon ? [...icon.classList].filter(k => /^lucide-/.test(k)).join() : "", title: (c.querySelector(".callout-title-inner") || {}).textContent, bg: s.backgroundColor };
  }, [BOOK, kind]);

  async function check25() {
    const c = new Check(25, "stage B: a question in a group and in a tip, a folded group, steps (no step in Back and Forward), rows side by side, sources, and diff/law/opinion, in the real app; desktop and phone, light and dark");
    await withApp("c25", async (o, vault) => {
      const file = path.join(vault, READ);
      await open(o, READ);

      /* ---- the reading kinds, and sources ---- */
      await goTo(o, "activity:/sources");
      const looks = {};
      for (const [k, style, icon] of [["diff", "dashed", "lucide-git-compare"], ["law", "double", "lucide-scale"], ["opinion", "dotted", "lucide-message-circle"]]) {
        looks[k] = await kindLook(o, k);
        c.ok(looks[k] && looks[k].style === style && looks[k].icon.includes(icon) && parseFloat(looks[k].width) >= 3 && looks[k].colour !== "", k + " is drawn in its own border (" + style + "), picture (" + icon + ") and colour: " + JSON.stringify(looks[k]));
      }
      c.ok(new Set([looks.diff.colour, looks.law.colour, looks.opinion.colour]).size === 3, "the three have three colours: " + [looks.diff.colour, looks.law.colour, looks.opinion.colour].join(" | "));
      c.ok(looks.diff.title === "Your guide says the tide turns every six hours", "a callout's title is the title as written: " + looks.diff.title);
      for (const [k, sel] of [["diff", "diff"], ["law", "law"], ["opinion", "opinion"]]) {
        await scrollTo(o, BOOK + " .callout[data-callout='" + sel + "']");
        await shot(o, k + "-desktop-light");
      }
      await o.setScheme("dark"); await frames(o);
      for (const k of ["diff", "law", "opinion"]) { await scrollTo(o, BOOK + " .callout[data-callout='" + k + "']"); await shot(o, k + "-desktop-dark"); }
      await o.setScheme("light"); await frames(o);

      // footnotes
      let marks = await o.evaluate(sel => [...document.querySelectorAll(sel + " button.booklet-cite-mark")].map(b => b.textContent.trim() + ":" + b.getAttribute("aria-expanded")), BOOK);
      c.ok(marks.join() === "1:false,2:false,1:false", "three marks, numbered by first use, the same note the same number, all shut: " + marks.join());
      const text0 = await o.evaluate(sel => document.querySelector(sel + " .booklet-page").textContent, BOOK);
      c.ok(!/\[\^/.test(text0) && !/Harbour Tide Atlas/.test(text0), "no mark is left as written, and no source shows until a mark is pressed");
      await o.page.locator(BOOK + " button.booklet-cite-mark").first().click();
      await quiet(o);
      const panel = await o.evaluate(sel => { const p = document.querySelector(sel + " .booklet-cite-panel"); if (!p) return null; const r = p.getBoundingClientRect(), mark = document.querySelector(sel + " button.booklet-cite-mark"); return { text: p.textContent.replace(/\s+/g, " ").trim(), quote: (p.querySelector("blockquote") || {}).textContent, badge: (p.querySelector(".booklet-cite-badge") || {}).textContent, expanded: mark.getAttribute("aria-expanded"), visible: r.height > 0, under: p.previousElementSibling === mark.closest("p, li, blockquote, td, th") }; }, BOOK);
      c.ok(panel && panel.visible && panel.under && panel.expanded === "true" && /Harbour Tide Atlas/.test(panel.text) && panel.quote === "The tide rises and falls twice in each lunar day." && /Verified September 20, 2026/.test(panel.badge), "pressing a mark opens its source under its paragraph, with title, page, quotation and verified date: " + JSON.stringify(panel));
      await shot(o, "source-open-desktop-light");
      await o.setScheme("dark"); await frames(o); await shot(o, "source-open-desktop-dark");
      await o.setScheme("light"); await frames(o);
      await o.page.locator(BOOK + " button.booklet-cite-mark").nth(1).click();
      await quiet(o);
      const second = await o.evaluate(sel => ({ panels: document.querySelectorAll(sel + " .booklet-cite-panel").length, text: (document.querySelector(sel + " .booklet-cite-panel") || {}).textContent, quote: !!document.querySelector(sel + " .booklet-cite-panel blockquote") }), BOOK);
      c.ok(second.panels === 1 && /leaflet/.test(second.text) && !second.quote, "another mark opens a plain reference with its words and no quotation, and the first shuts (one open at a time): " + JSON.stringify(second));
      await o.page.keyboard.press("Escape"); await quiet(o);
      const closed = await o.evaluate(sel => document.querySelectorAll(sel + " .booklet-cite-panel").length, BOOK);
      c.ok(closed === 0, "Escape shuts the source: " + closed);

      // a question inside a tip
      await scrollTo(o, q("tip-q"));
      const inTip = await o.evaluate(sel => { const b = document.querySelector(sel + " [data-booklet-q='tip-q']"), call = b.closest(".callout"); return { kind: call && call.getAttribute("data-callout"), inContent: !!b.closest(".callout-content"), icon: !!(call && call.querySelector(".callout-icon svg")) }; }, BOOK);
      c.ok(inTip.kind === "tip" && inTip.inContent && inTip.icon, "a question inside a tip is drawn in Obsidian's own callout: " + JSON.stringify(inTip));
      await press(o, q("tip-q") + " button.booklet-choice", "A sandwich");
      await shot(o, "tip-question-desktop-light");
      await quiet(o);
      c.ok(recordsOf(vault, "sources")["tip-q"] === 2, "its answer is kept in the note's records, as outside a callout: " + JSON.stringify(recordsOf(vault, "sources")));
      c.ok(!/booklet-cite|Verified/.test(records(file)), "nothing about a source is written into the note");

      /* ---- rows ---- */
      await goTo(o, "activity:/rows");
      const rowLay = () => o.evaluate(sel => { const cells = [...document.querySelectorAll(sel + " .booklet-row > .booklet-rowcell")].map(x => x.getBoundingClientRect()); return { n: cells.length, side: cells.length === 2 && cells[1].left >= cells[0].right - 1 && Math.abs(cells[1].top - cells[0].top) < 4, stacked: cells.length === 2 && cells[1].top >= cells[0].bottom - 1 && Math.abs(cells[1].left - cells[0].left) < 4, text: [...document.querySelectorAll(sel + " .booklet-rowcell")].map(x => x.textContent.replace(/\s+/g, " ").trim().slice(0, 30)) }; }, BOOK);
      let r = await rowLay();
      c.ok(r.n === 2 && r.side, "on a desktop a row's two cells (one for each heading) are side by side: " + JSON.stringify(r));
      await o.page.locator(q("neap-note") + " input.booklet-text").fill("Small and slow");
      await o.page.locator(q("neap-note") + " input.booklet-text").blur();
      await quiet(o);
      c.ok(recordsOf(vault, "rows")["neap-note"] === "Small and slow", "the question in the second cell is answered and kept: " + JSON.stringify(recordsOf(vault, "rows")));
      await shot(o, "rows-desktop-light");
      await o.setScheme("dark"); await frames(o); await shot(o, "rows-desktop-dark");
      await o.setScheme("light"); await frames(o);

      /* ---- groups, a folded one, and steps ---- */
      await goTo(o, "activity:/lesson");
      let st = await steps(o);
      c.ok(st.n === 0, "all at once is how a page with groups is drawn first: " + JSON.stringify(st));
      const grp = await o.evaluate(sel => ({ groups: document.querySelectorAll(sel + " .booklet-group").length, moonIn: !!document.querySelector(sel + " .booklet-group [data-booklet-q='moon']"), extraFolded: document.querySelector(sel + " .booklet-group [data-booklet-q='extra']").closest(".booklet-group").classList.contains("is-collapsed"), choice: [...document.querySelectorAll(sel + " .booklet-steps-choice button")].map(b => b.textContent.trim() + ":" + b.getAttribute("aria-pressed")) }), BOOK);
      c.ok(grp.groups === 4 && grp.moonIn && grp.extraFolded && grp.choice.join() === "One at a time:false,All at once:true", "four groups drawn, the question in the first, the written-folded one closed, and the switch offers one at a time: " + JSON.stringify(grp));
      await press(o, q("moon") + " button.booklet-choice", "The moon");
      await scrollTo(o, q("moon"));
      await shot(o, "group-question-desktop-light");
      await o.setScheme("dark"); await frames(o); await scrollTo(o, q("moon")); await shot(o, "group-question-desktop-dark");
      await o.setScheme("light"); await frames(o);
      await quiet(o);
      c.ok(recordsOf(vault, "lesson").moon === 1, "the answer to a question in a group is kept as outside one: " + JSON.stringify(recordsOf(vault, "lesson")));
      // the folded group opens and shuts
      await o.page.locator(BOOK + " .booklet-group-title").filter({ hasText: "Extra reading" }).click();
      await quiet(o);
      let fold = await o.evaluate(sel => { const g = document.querySelector(sel + " [data-booklet-q='extra']").closest(".booklet-group"); return { collapsed: g.classList.contains("is-collapsed"), shown: g.querySelector(".booklet-group-body").getClientRects().length > 0 }; }, BOOK);
      c.ok(!fold.collapsed && fold.shown, "pressing a folded group's title opens it: " + JSON.stringify(fold));
      await o.page.locator(BOOK + " .booklet-group-title").filter({ hasText: "Extra reading" }).click();
      await quiet(o);
      fold = await o.evaluate(sel => { const g = document.querySelector(sel + " [data-booklet-q='extra']").closest(".booklet-group"); return { collapsed: g.classList.contains("is-collapsed"), shown: g.querySelector(".booklet-group-body").getClientRects().length > 0 }; }, BOOK);
      c.ok(fold.collapsed && !fold.shown, "and again shuts it: " + JSON.stringify(fold));

      // steps
      const back0 = await backLength(o);
      await press(o, BOOK + " .booklet-steps-choice button", "One at a time");
      st = await steps(o);
      c.ok(st.n === 4 && st.shown.join() === "2" && /Step 2 of 4/.test(st.progress), "one at a time: four steps, the first one not yet answered (the moon is answered) is on show, with the progress line: " + JSON.stringify(st));
      await press(o, BOOK + " .booklet-pager button", "Back");
      st = await steps(o);
      c.ok(st.shown.join() === "1" && /Step 1 of 4/.test(st.progress), "Back moves to the step before: " + JSON.stringify(st));
      c.ok(await o.evaluate(sel => document.querySelector(sel + " [data-booklet-q='sun']") !== null && document.querySelector(sel + " .booklet-step[hidden] [data-booklet-q='sun']") !== null, BOOK), "a step not on show keeps its questions in the page");
      await scrollTo(o, BOOK + " .booklet-steps");
      await shot(o, "step-desktop-light");
      await o.setScheme("dark"); await frames(o); await scrollTo(o, BOOK + " .booklet-steps"); await shot(o, "step-desktop-dark");
      await o.setScheme("light"); await frames(o);
      for (let i = 0; i < 3; i++) await press(o, BOOK + " .booklet-pager button", "Next");
      st = await steps(o);
      c.ok(st.shown.join() === "4" && /Step 4 of 4/.test(st.progress) && /Next: A page with one group/.test(st.pager.join(" | ")), "Next moves a step at a time to the last, where it offers the next activity: " + JSON.stringify(st));
      const back1 = await backLength(o), part = await o.evaluate(() => app.workspace.getLeavesOfType("booklet")[0].getViewState().state.part);
      c.ok(back1 === back0 && part === 0, "no step was a step in Obsidian's Back and Forward: history " + back0 + " -> " + back1 + ", part " + part);
      await press(o, BOOK + " .booklet-pager button", "Next: A page with one group");
      await page_screen(o, c, "activity:/plain");
      // the choice is the device's: it stays when the note is opened again
      await open(o, READ);
      await goTo(o, "activity:/lesson");
      st = await steps(o);
      c.ok(st.n === 4, "the switch to one at a time is kept on the device, and opened again the page is in steps: " + JSON.stringify(st));
      await quiet(o);
      c.ok(!/steps|one at a time/i.test(records(file)), "the choice is not written into the note");
      await press(o, BOOK + " .booklet-steps-choice button", "All at once");
      st = await steps(o);
      c.ok(st.n === 0, "all at once draws the page whole again: " + JSON.stringify(st));
      await press(o, BOOK + " .booklet-steps-choice button", "One at a time");

      /* ---- the phone ---- */
      await o.page.setViewportSize({ width: 390, height: 844 });
      await mobile(o, true);
      await open(o, READ);
      for (const scheme of ["light", "dark"]) {
        await o.setScheme(scheme); await frames(o);
        await goTo(o, "activity:/sources");
        for (const k of ["diff", "law", "opinion"]) { await scrollTo(o, BOOK + " .callout[data-callout='" + k + "']"); await shot(o, k + "-phone-" + scheme); }
        const markH = await o.evaluate(sel => { const b = document.querySelector(sel + " button.booklet-cite-mark"); return { mark: Math.round(b.getBoundingClientRect().height), line: Math.round(parseFloat(getComputedStyle(b.closest("p")).lineHeight)) }; }, BOOK);
        c.ok(markH.mark <= markH.line + 4, "phone (" + scheme + "): an inline source mark does not stretch its line (mark " + markH.mark + " px, line " + markH.line + " px): " + JSON.stringify(markH));
        if (scheme === "light") {
          await o.page.locator(BOOK + " button.booklet-cite-mark").first().click(); await quiet(o);
          await shot(o, "source-open-phone-light");
          await o.page.keyboard.press("Escape"); await quiet(o);
        }
        await scrollTo(o, q("tip-q")); await shot(o, "tip-question-phone-" + scheme);
        await goTo(o, "activity:/rows");
        r = await rowLay();
        c.ok(r.n === 2 && r.stacked, "phone (" + scheme + "): a row's cells are stacked, one under the other: " + JSON.stringify(r));
        await shot(o, "rows-phone-" + scheme);
        await goTo(o, "activity:/lesson");
        st = await steps(o);
        c.ok(st.n === 4, "phone (" + scheme + "): the page is in steps, as chosen on this device: " + JSON.stringify(st));
        await scrollTo(o, BOOK + " .booklet-steps");
        await shot(o, "step-phone-" + scheme);
        await press(o, BOOK + " .booklet-steps-choice button", "All at once");
        await scrollTo(o, q("moon"));
        await shot(o, "group-question-phone-" + scheme);
        await press(o, BOOK + " .booklet-steps-choice button", "One at a time");
        for (const act of ["sources", "rows", "lesson", "plain"]) {
          await goTo(o, "activity:/" + act);
          const l = await layout(o);
          c.ok(l.sideways <= 0 && l.small.length === 0, "phone (" + scheme + ", " + act + "): no sideways scroll (" + l.sideways + "), and every control 44 px or taller (inline source marks apart: their touch area is a wider invisible one): " + JSON.stringify(l.small));
        }
      }
      await o.setScheme("light");
      await o.page.setViewportSize({ width: 1280, height: 800 });
      await mobile(o, false);
      await open(o, READ);
      await goTo(o, "activity:/rows");
      r = await rowLay();
      c.ok(r.side, "widened again, the row's cells are side by side again: " + JSON.stringify(r));
    });
    return c;
  }
  async function page_screen(o, c, screen) {
    const at = await o.evaluate(sel => (document.querySelector(sel + " .booklet-page") || { getAttribute: () => null }).getAttribute("data-booklet-screen"), BOOK);
    c.ok(at === screen, "past the last step, Next goes on to the next activity: " + at);
  }
  return { 25: check25 };
};
