// Check 24 of plugin-check.js: the 0.7.0 stage A of the plugin, in the real app. Every note is made up (test-vault "Study quiz").
//   right and wrong marked on a choice and a multi (with each option's reply), a matrix (a grid on a desktop, separate
//   questions on a phone), and a question asked for each pick of another (`each:`), of several kinds.
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check function.
const fs = require("fs"), path = require("path");
const { quiet, drawing, frames, mobile, kit } = require("./waits");

module.exports = function studyChecks(env) {
  const { withApp, Check, BOOK } = env;
  const STUDY = "Study quiz.booklet.md";
  const { shot, sha, goTo, open, recordsOf } = kit(env, STUDY);
  const q = id => BOOK + " [data-booklet-q='" + id + "']";
  const press = async (o, sel, text) => { await o.page.locator(sel + " button").filter({ hasText: text }).first().click({ timeout: 6000 }); await quiet(o); };
  const scrollTo = async (o, sel) => { await o.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: "start" }), sel); await frames(o); };
  // what a question box shows about marking
  const marks = (o, sel) => o.evaluate(sel => {
    const box = document.querySelector(sel);
    const vis = e => e.getClientRects().length > 0;
    return {
      marks: [...box.querySelectorAll("button.booklet-choice")].map(b => { const m = b.querySelector(".booklet-mark"); return b.textContent.trim().replace(/\s+/g, " ") + (m && vis(m) ? " [" + [...b.classList].filter(k => /^booklet-(right|wrong|answer)$/.test(k)).join("").replace("booklet-", "") + "]" : ""); }),
      live: (box.querySelector(".booklet-live") || {}).textContent || "",
      replies: [...box.querySelectorAll(".booklet-reply")].filter(vis).map(r => r.textContent.trim()),
      check: (() => { const a = box.querySelector(".booklet-acts"); return a ? vis(a) : null; })(),
    };
  }, sel);
  // the size of every control, and whether the view scrolls sideways
  const layout = o => o.evaluate(sel => {
    const v = document.querySelector(sel + " .view-content"), page = document.querySelector(sel + " .booklet-page");
    const small = [...page.querySelectorAll("button, input.booklet-text")].filter(b => b.getClientRects().length && b.getBoundingClientRect().height < 44).map(b => b.textContent.trim().slice(0, 20) + " " + Math.round(b.getBoundingClientRect().height));
    return { sideways: v.scrollWidth - v.clientWidth, small };
  }, BOOK);

  async function check24() {
    const c = new Check(24, "stage A: right and wrong marked (a choice, a multi, replies), a matrix (grid and stacked), and each: of every kind, in the real app; desktop and phone, light and dark; nothing about marking is written");
    await withApp("c24", async (o, vault) => {
      const file = path.join(vault, STUDY);
      await open(o, STUDY);

      /* ---- a marked choice ---- */
      await goTo(o, "activity:/marked");
      let m = await marks(o, q("flyer"));
      c.ok(m.marks.every(x => !/\[/.test(x)) && m.live === "" && m.replies.length === 0, "a choice with a right answer marks nothing before a pick, and shows no reply: " + JSON.stringify(m));
      await press(o, q("flyer"), "A sparrow");
      m = await marks(o, q("flyer"));
      c.ok(m.marks[1].endsWith("[right]") && m.live === "Right." && m.replies.length === 1 && /flies/.test(m.replies[0]), "the right pick is marked right, the line says so, and its reply shows: " + JSON.stringify(m));
      await shot(o, "marked-choice-right-desktop-light");
      await press(o, q("flyer"), "A penguin");
      m = await marks(o, q("flyer"));
      c.ok(m.marks[0].endsWith("[wrong]") && m.marks[1].endsWith("[answer]") && /^Not quite\. The answer is/.test(m.live) && m.replies.length === 1 && /swim/.test(m.replies[0]), "a wrong pick is marked wrong, the answer is shown, and the pick's own reply shows: " + JSON.stringify(m));
      await shot(o, "marked-choice-wrong-desktop-light");
      await o.setScheme("dark"); await frames(o); await shot(o, "marked-choice-wrong-desktop-dark");
      await o.setScheme("light"); await frames(o);
      m = await marks(o, q("drink"));
      await press(o, q("drink"), "Tea");
      m = await marks(o, q("drink"));
      c.ok(m.marks.every(x => !/\[/.test(x)) && m.live === "" && m.replies.length === 1, "a choice with no [x] marks nothing, and its reply shows: " + JSON.stringify(m));

      /* ---- a marked multi ---- */
      await press(o, q("primaries"), "Red");
      await press(o, q("primaries"), "Blue");
      m = await marks(o, q("primaries"));
      c.ok(m.check === true && m.marks.every(x => !/\[/.test(x)) && m.replies.length === 0, "a multi shows Check once something is picked, and marks and replies nothing until it is pressed: " + JSON.stringify(m));
      await press(o, q("primaries") + " .booklet-acts", "Check");
      m = await marks(o, q("primaries"));
      c.ok(m.marks[0].endsWith("[right]") && m.marks[2].endsWith("[right]") && m.marks[3].endsWith("[answer]") && /^Not quite/.test(m.live), "Check marks the picks right and the one missed as the answer: " + JSON.stringify(m));
      await press(o, q("primaries"), "Green");
      m = await marks(o, q("primaries"));
      c.ok(m.marks.every(x => !/\[/.test(x)), "a pick after Check clears the marks (they were for the picks Check was pressed on): " + JSON.stringify(m.marks));
      await press(o, q("primaries"), "Green");
      await press(o, q("primaries"), "Yellow");
      await press(o, q("primaries") + " .booklet-acts", "Check");
      m = await marks(o, q("primaries"));
      c.ok(m.live === "Right." && m.marks.filter(x => x.endsWith("[right]")).length === 3 && m.replies.length >= 1, "all the right ones and no other: Right., each marked right, replies shown: " + JSON.stringify(m));
      await scrollTo(o, q("primaries"));
      await shot(o, "marked-multi-right-desktop-light");
      await press(o, q("primaries"), "Purple");
      await press(o, q("primaries") + " .booklet-acts", "Check");
      await scrollTo(o, q("primaries"));
      await shot(o, "marked-multi-wrong-desktop-light");
      await o.setScheme("dark"); await frames(o); await shot(o, "marked-multi-wrong-desktop-dark");
      await o.setScheme("light"); await frames(o);
      await quiet(o);
      const a1 = recordsOf(vault, "marked");
      const text1 = fs.readFileSync(file, "utf8");
      c.ok(a1.flyer === 1 && JSON.stringify(a1.primaries) === "[1,3,4,5]" && !/right|wrong|checked/i.test(text1.slice(text1.indexOf("%%"))), "the answers kept are the picks only (flyer 1, primaries 1 3 4 5), and no mark is written into the note: " + JSON.stringify(a1));

      /* ---- a matrix, on a desktop ---- */
      await goTo(o, "activity:/grid-quiz");
      let g = await o.evaluate(sel => { const b = document.querySelector(sel); return { stacked: b.classList.contains("booklet-mx-stacked"), rows: b.querySelectorAll(".booklet-mxitem").length, cols: [...b.querySelectorAll(".booklet-mxitem")].map(r => r.querySelectorAll("button").length), inRow: (() => { const r = b.querySelector(".booklet-mxitem"), w = r.querySelector(".booklet-mxwords").getBoundingClientRect(), o = r.querySelector(".booklet-mxopts").getBoundingClientRect(); return o.left >= w.right - 1; })() }; }, q("topics"));
      c.ok(!g.stacked && g.rows === 3 && g.cols.join() === "3,3,3" && g.inRow, "on a desktop the matrix is a grid: three rows, three anchors each, each row's words beside its anchors: " + JSON.stringify(g));
      await press(o, q("topics") + " .booklet-mxitem:nth-child(1)", "Sure");
      await press(o, q("topics") + " .booklet-mxitem:nth-child(3)", "Getting there");
      await scrollTo(o, q("topics"));
      await shot(o, "matrix-grid-desktop-light");
      await o.setScheme("dark"); await frames(o); await shot(o, "matrix-grid-desktop-dark");
      await o.setScheme("light"); await frames(o);
      await quiet(o);
      c.ok(JSON.stringify(recordsOf(vault, "grid-quiz").topics) === "[2,null,1]", "pressing an anchor for the first and third item keeps [2, null, 1]: " + JSON.stringify(recordsOf(vault, "grid-quiz")));
      await press(o, q("topics") + " .booklet-mxitem:nth-child(1)", "Sure");
      await press(o, q("topics") + " .booklet-mxitem:nth-child(3)", "Getting there");
      await quiet(o);
      c.ok(recordsOf(vault, "grid-quiz").topics === undefined, "pressing the picked anchors again clears them, and an answer with no item left is not kept: " + JSON.stringify(recordsOf(vault, "grid-quiz")));
      await press(o, q("topics") + " .booklet-mxitem:nth-child(2)", "Not yet");

      /* ---- each: of every kind ---- */
      await goTo(o, "activity:/each-quiz");
      let e = await o.evaluate(() => document.querySelectorAll(".workspace-leaf-content[data-type='booklet'] .booklet-copy").length);
      c.ok(e === 0, "nothing is drawn for a question asked for each pick while nothing is picked: " + e);
      await press(o, q("crops"), "Carrot");
      await press(o, q("crops"), "Potato");
      e = await o.evaluate(sel => ["crop-where", "crop-rate", "crop-note", "crop-pests"].map(id => { const b = document.querySelector(sel + " [data-booklet-q='" + id + "']"); return id + ":" + [...b.querySelectorAll(".booklet-copy")].map(x => x.querySelector(".booklet-pick-head").textContent.trim()).join("+"); }), BOOK);
      c.ok(e.every(x => /:Carrot\+Potato$/.test(x)), "after two picks each of the four questions (choice, scale, text, matrix) has a copy for Carrot and one for Potato: " + JSON.stringify(e));
      await press(o, q("crop-where") + " [data-booklet-pick='n:1']", "Under the ground");
      await press(o, q("crop-where") + " [data-booklet-pick='n:3']", "Above the ground");
      await press(o, q("crop-rate") + " [data-booklet-pick='n:3']", "Well");
      await o.page.locator(q("crop-note") + " [data-booklet-pick='n:1'] input.booklet-text").fill("Sweet and crunchy");
      await o.page.locator(q("crop-note") + " [data-booklet-pick='n:1'] input.booklet-text").blur();
      await press(o, q("crop-pests") + " [data-booklet-pick='n:3'] .booklet-mxitem:nth-child(2)", "A few");
      await quiet(o);
      const ea = recordsOf(vault, "each-quiz");
      c.ok(JSON.stringify((ea["crop-where"] || []).map(p => [p.pick, p.a])) === "[[1,1],[3,2]]", "the choice copies keep a pair for each pick: " + JSON.stringify(ea["crop-where"]));
      c.ok(JSON.stringify(ea["crop-rate"].map(p => [p.pick, p.a])) === "[[3,2]]" && JSON.stringify(ea["crop-note"].map(p => [p.pick, p.a])) === '[[1,"Sweet and crunchy"]]' && JSON.stringify(ea["crop-pests"].map(p => [p.pick, p.a])) === "[[3,[null,1]]]", "and so do the scale, text and matrix copies: " + JSON.stringify([ea["crop-rate"], ea["crop-note"], ea["crop-pests"]]));
      m = await marks(o, q("crop-where") + " [data-booklet-pick='n:1']");
      c.ok(m.marks[0].endsWith("[wrong]") && /ground/.test(m.live), "a copy of a marked choice is marked on its own (Carrot picked the wrong one): " + JSON.stringify(m));
      m = await marks(o, q("crop-where") + " [data-booklet-pick='n:3']");
      c.ok(m.marks[1].endsWith("[right]") && m.live === "Right.", "and Potato's copy is marked right: " + JSON.stringify(m));
      await scrollTo(o, q("crop-where"));
      await shot(o, "each-copies-desktop-light");
      await o.setScheme("dark"); await frames(o); await shot(o, "each-copies-desktop-dark");
      await o.setScheme("light"); await frames(o);
      await press(o, q("crops"), "Carrot");
      e = await o.evaluate(sel => document.querySelectorAll(sel + " [data-booklet-q='crop-where'] .booklet-copy").length, BOOK);
      await quiet(o);
      c.ok(e === 1 && (recordsOf(vault, "each-quiz")["crop-where"] || []).length === 2, "taking Carrot back removes its copy from the screen and keeps its pair in the note: copies " + e + ", pairs " + (recordsOf(vault, "each-quiz")["crop-where"] || []).length);
      await press(o, q("crops"), "Carrot");

      /* ---- a restart: what was kept is drawn again ---- */
      await quiet(o);
      const h0 = sha(file);
      await open(o, STUDY);
      await goTo(o, "activity:/each-quiz");
      e = await o.evaluate(sel => ({ copies: document.querySelectorAll(sel + " [data-booklet-q='crop-note'] .booklet-copy").length, note: document.querySelector(sel + " [data-booklet-q='crop-note'] [data-booklet-pick='n:1'] input.booklet-text").value }), BOOK);
      c.ok(e.note === "Sweet and crunchy", "opened again, the copies come back with what was kept: " + JSON.stringify(e));
      c.ok(sha(file) === h0, "drawing the note again writes nothing");

      /* ---- the phone ---- */
      await o.page.setViewportSize({ width: 390, height: 844 });
      await mobile(o, true);
      await open(o, STUDY);
      for (const scheme of ["light", "dark"]) {
        await o.setScheme(scheme); await frames(o);
        await goTo(o, "activity:/marked");
        await scrollTo(o, q("flyer"));
        await shot(o, "marked-choice-wrong-phone-" + scheme);
        await scrollTo(o, q("primaries"));
        await shot(o, "marked-multi-wrong-phone-" + scheme);
        await goTo(o, "activity:/grid-quiz");
        g = await o.evaluate(sel => ({ stacked: document.querySelector(sel).classList.contains("booklet-mx-stacked"), wrapStacked: document.querySelector(sel + " .booklet-mxwrap").classList.contains("booklet-mx-stacked") }), q("topics"));
        c.ok(g.stacked && g.wrapStacked, "phone (" + scheme + "): the matrix is drawn as separate questions: " + JSON.stringify(g));
        if (scheme === "light") { await press(o, q("topics") + " .booklet-mxitem:nth-child(1)", "Sure"); await press(o, q("topics") + " .booklet-mxitem:nth-child(3)", "Getting there"); }
        await scrollTo(o, q("topics"));
        await shot(o, "matrix-stacked-phone-" + scheme);
        await goTo(o, "activity:/each-quiz");
        await scrollTo(o, q("crop-where"));
        await shot(o, "each-copies-phone-" + scheme);
        for (const act of ["marked", "grid-quiz", "each-quiz"]) {
          await goTo(o, "activity:/" + act);
          const l = await layout(o);
          c.ok(l.sideways <= 0 && l.small.length === 0, "phone (" + scheme + ", " + act + "): no sideways scroll (" + l.sideways + "), and every control 44 px or taller: " + JSON.stringify(l.small));
        }
      }
      await o.setScheme("light");
      // the stem is held above the stacked items
      await goTo(o, "activity:/grid-quiz");
      const held = await o.evaluate(sel => getComputedStyle(document.querySelector(sel + " > .booklet-prompt")).position, q("topics"));
      c.ok(held === "sticky", "phone: the matrix's own words are held at the top while its items scroll (position " + held + ")");
      await o.page.setViewportSize({ width: 1280, height: 800 });
      await mobile(o, false);
      await open(o, STUDY);
      await goTo(o, "activity:/grid-quiz");
      g = await o.evaluate(sel => document.querySelector(sel).classList.contains("booklet-mx-stacked"), q("topics"));
      c.ok(g === false, "widened again, the matrix is a grid again, with the answers it had: stacked " + g);
    });
    return c;
  }
  return { 24: check24 };
};
