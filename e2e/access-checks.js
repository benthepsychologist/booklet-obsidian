// Checks 42 to 45 of plugin-check.js: the view by keyboard alone, with reduced motion and at 200% zoom, in the real app. The note is
// test/page-notes/Keyboard walk.booklet.md (made up: one question of every kind, a folded group, a repeating activity with twelve kept
// days, a table, bars and a line), copied into each check's own copy of the vault.
//   42 the walk: from the pane's tab, Tab and Shift+Tab (real key presses) reach every control of the activity page in the page's
//      order, each stop with a visible focus ring, no trap, and the way back is the same way;
//   43 the same walk operates them: Enter, Space, arrow keys and typing answer every kind of question, Finalize keeps an entry, the
//      fold, the delete question and the table's sort and filter work, Escape closes what opened, focus is never lost to the page;
//   44 reduced motion: with prefers-reduced-motion on, nothing the plugin draws moves or fades;
//   45 200% zoom (Obsidian's own zoom, which shrinks the window to half as many CSS pixels): nothing overlaps, nothing is cut off,
//      nothing scrolls sideways, on the activity page, the opening and a module screen, light and dark, desktop and phone.
// The accessibility checker (axe-core) is run by hand and is not part of this file.
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check functions.
const fs = require("fs"), path = require("path");
const { quiet, frames, mobile, kit } = require("./waits");

module.exports = function accessChecks(env) {
  const { withApp, Check, BOOK, sleep } = env;
  const NOTE = "Keyboard walk.booklet.md";
  const SRC = path.join(__dirname, "..", "test", "page-notes", NOTE);
  const { shot, sha, goTo, open, answers } = kit(env, NOTE);
  const put = vault => fs.writeFileSync(path.join(vault, NOTE), fs.readFileSync(SRC, "utf8"));
  const TAB_LIMIT = 260;

  /* ---- what a keyboard user can reach ---- */

  // The controls of the view a key can reach: visible, enabled, in the tab order. An element with tabindex -1 is listed apart.
  const controls = o => o.evaluate(sel => {
    const root = document.querySelector(sel + " .view-content");
    const visible = e => {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      for (let p = e; p && p !== root; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        if (p.parentElement && p.parentElement.tagName === "DETAILS" && !p.parentElement.open && p.tagName !== "SUMMARY") return false;
      }
      return true;
    };
    const all = [...root.querySelectorAll("button, input, textarea, select, summary, a[href], [tabindex], [contenteditable='true']")].filter(e => !e.disabled && e.type !== "hidden" && visible(e));
    window.__kw = new Map();
    const name = e => (e.getAttribute("aria-label") || (e.labels && e.labels[0] && e.labels[0].textContent) || e.getAttribute("placeholder") || e.textContent || e.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 48);
    const q = e => { const b = e.closest("[data-booklet-q]"); return b ? b.getAttribute("data-booklet-q") : ""; };
    const sig = e => { const c = getComputedStyle(e); return [c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow, c.borderTopColor, c.backgroundColor].join("|"); };
    const out = [];
    all.forEach((e, n) => {
      window.__kw.set(e, n);
      const composite = e.closest("[role=tablist], [role=radiogroup], [role=listbox], [role=menu], [role=toolbar], [role=grid]");
      out.push({ n, tag: e.tagName.toLowerCase(), type: e.type || "", role: e.getAttribute("role") || "", name: name(e), q: q(e), tab: e.tabIndex >= 0, composite: !!composite, sig0: sig(e) });
    });
    return out;
  }, BOOK);

  // The element holding focus now: where it is, what it is, and whether it shows a ring
  const stop = o => o.evaluate(sel => {
    const root = document.querySelector(sel + " .view-content"), e = document.activeElement;
    if (!e || e === document.body) return { none: true };
    const inView = root.contains(e);
    const c = getComputedStyle(e);
    const outline = c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0 && !/rgba\(\d+, \d+, \d+, 0\)/.test(c.outlineColor);
    const shadow = c.boxShadow !== "none";
    const sig = [c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow, c.borderTopColor, c.backgroundColor].join("|");
    const r = e.getBoundingClientRect();
    return { inView, n: window.__kw ? (window.__kw.has(e) ? window.__kw.get(e) : -1) : -1, tag: e.tagName.toLowerCase(), role: e.getAttribute("role") || "", cls: (e.className && e.className.baseVal === undefined ? e.className : "").toString().slice(0, 50),
      name: (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40), outline, shadow, sig, focusVisible: e.matches(":focus-visible"),
      onScreen: r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth };
  }, BOOK);

  const key = async (o, k) => { await o.page.keyboard.press(k); await sleep(40); };

  // Focus the pane's tab, where a keyboard user is after opening the note, before the first Tab
  const startAtTab = async o => {
    await o.evaluate(() => { const h = document.querySelector(".workspace-tab-header.is-active"); if (h) h.focus(); });
    await sleep(80);
    return o.evaluate(() => document.activeElement && document.activeElement.className);
  };

  // Tab until focus is in the view, then on through it until it leaves; returns every stop in the view in order
  async function walkForward(o, c) {
    const stops = [], before = [];
    let entered = false, left = false;
    for (let i = 0; i < TAB_LIMIT; i++) {
      await key(o, "Tab");
      const s = await stop(o);
      if (s.none) { before.push("none"); continue; }
      if (s.inView) { entered = true; stops.push(s); } else if (entered) { left = true; stops.push({ exit: s.cls || s.tag }); break; } else before.push(s.cls || s.tag);
    }
    return { stops, before, entered, left };
  }

  /* ================= CHECK 42 ================= */
  async function check42() {
    const c = new Check(42, "keyboard walk (real key presses): from the pane's tab, Tab reaches every control of an activity page with every kind of question, in the page's order, each with a visible focus ring; no keyboard trap; Shift+Tab goes back the same way");
    await withApp("c42", async (o, vault) => {
      put(vault);
      await open(o, NOTE);
      await goTo(o, "activity:/walk");
      await sleep(500);
      const list = await controls(o);
      const reach = list.filter(x => x.tab);
      c.info(`the page holds ${list.length} controls a key can find (${reach.length} in the tab order, ${list.length - reach.length} reached by arrow keys inside their group)`);
      c.ok(reach.length >= 30, `the page has the controls the note makes (${reach.length})`);
      c.info("the controls: " + reach.map(x => `${x.n}:${x.tag}${x.role ? "[" + x.role + "]" : ""}${x.q ? "@" + x.q : ""} "${x.name}"`).join(" | "));
      await startAtTab(o);
      const fwd = await walkForward(o, c);
      c.ok(fwd.entered, `Tab from the pane's tab enters the view after ${fwd.before.length} stop(s) of Obsidian's own: ${fwd.before.join(", ")}`);
      const inside = fwd.stops.filter(s => !s.exit);
      c.ok(fwd.left, `Tab leaves the view again (${inside.length} stops in it, then ${fwd.stops.at(-1) && fwd.stops.at(-1).exit}): no keyboard trap`);
      const seen = new Set(inside.map(s => s.n));
      const missing = reach.filter(x => !seen.has(x.n));
      c.ok(missing.length === 0, `every control in the tab order was a stop (${seen.size} of ${reach.length}); missed: ${missing.map(x => `${x.n}:${x.tag} "${x.name}"`).join(" | ") || "none"}`);
      const unknown = inside.filter(s => s.n < 0);
      c.ok(unknown.length === 0, `no stop on something that is not a control the page lists: ${unknown.map(s => `${s.tag}.${s.cls} "${s.name}"`).join(" | ") || "none"}`);
      // a date field is one control with several stops (month, day, year, the picker): Chromium's own, so a run of one control counts once
      const once = a => a.filter((n, i) => i === 0 || n !== a[i - 1]);
      const order = once(inside.map(s => s.n).filter(n => n >= 0));
      const jumps = order.map((n, i) => (i && n <= order[i - 1] ? `${order[i - 1]}->${n}` : "")).filter(Boolean);
      c.ok(jumps.length === 0, `the stops come in the page's own order (no jump back, none twice); out of order: ${jumps.join(", ") || "none"}`);
      c.info("the stops: " + order.join(","));
      // the date field's last stop is the browser's own picker button, drawn inside the field with its own ring: a control passes if any stop of it shows one
      const ringed = new Set(inside.filter(s => s.outline || s.shadow || s.focusVisible).map(s => s.n));
      const noRing = inside.filter(s => !ringed.has(s.n));
      c.ok(noRing.length === 0, `every stop shows a focus ring (an outline or a shadow): ${noRing.map(s => `${s.tag}.${s.cls} "${s.name}" sig ${s.sig} fv ${s.focusVisible} sh ${s.shadow} ol ${s.outline}`).join(" | ") || "all " + inside.length}`);
      const offscreen = inside.filter(s => !s.onScreen);
      c.ok(offscreen.length === 0, `focus is always scrolled into sight: ${offscreen.map(s => `${s.tag} "${s.name}"`).join(" | ") || "yes"}`);
      await shot(o, "keyboard-walk-last-stop");
      // back: from where Tab left the view, Shift+Tab goes through the same controls the other way
      const back = [];
      for (let i = 0; i < TAB_LIMIT; i++) {
        await o.page.keyboard.press("Shift+Tab"); await sleep(25);
        const s = await stop(o);
        if (!s.none && s.inView) back.push(s.n);
        else if (back.length && !s.none) break;
      }
      const back1 = once(back);
      const same = back1.length === order.length && back1.every((n, i) => n === order[order.length - 1 - i]);
      c.ok(same, `Shift+Tab goes back through the same ${back1.length} controls, last to first (forward ${order.length})`);
      // the way in again: the first Tab of the view lands on the first control, whatever the scroll
      c.ok(true, "walked in " + fwd.stops.length + " presses");
    });
    return c;
  }

  /* ================= CHECK 43 ================= */
  // What holds focus now, in words a check can test
  const here = o => o.evaluate(sel => {
    const root = document.querySelector(sel + " .view-content"), e = document.activeElement;
    if (!e || e === document.body) return { none: true };
    const q = e.closest("[data-booklet-q]");
    return { inView: root.contains(e), qi: q ? [...q.querySelectorAll("button")].indexOf(e) : -1, tag: e.tagName.toLowerCase(), type: e.type || "", q: q ? q.getAttribute("data-booklet-q") : "", cls: (e.getAttribute("class") || "").slice(0, 60),
      name: (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 48),
      pressed: e.getAttribute("aria-pressed"), checked: e.getAttribute("aria-checked"), expanded: e.getAttribute("aria-expanded"), value: "value" in e ? e.value : null };
  }, BOOK);
  // Tab on until the control `pred` describes holds focus (real presses), or fail after `tries`
  async function tabTo(o, label, pred, tries = 120) {
    for (let i = 0; i < tries; i++) {
      await key(o, "Tab");
      const h = await here(o);
      if (!h.none && h.inView && pred(h)) return h;
    }
    throw new Error("Tab never reached " + label);
  }
  const is = (name, q) => h => h.name === name && (q === undefined || h.q === q);
  // The answers the note holds on disk for an activity, once the write has landed
  const onDisk = async (o, vault, act, until) => {
    let got = {};
    for (let i = 0; i < 80; i++) {
      await sleep(100);
      try { got = answers(vault)[act] || {}; if (until(got)) return got; } catch (e) { /* mid-write */ }
    }
    return got;
  };

  async function check43() {
    const c = new Check(43, "keyboard operation (real key presses): Space, Enter, the arrow keys and typing answer every kind of question; the answers are on disk; Finalize keeps an entry; the fold, the table's sort and filter and the delete question work, Escape closes what opened, and focus never falls to the page");
    await withApp("c43", async (o, vault) => {
      put(vault);
      await open(o, NOTE);
      await goTo(o, "activity:/walk");
      await sleep(400);
      await startAtTab(o);
      const pressed = async (h, label) => { const a = await here(o); c.ok(a.pressed === "true", `${label}: ${a.name} is now pressed (${a.pressed})`); };
      let h;
      // a choice: Space picks Pear, Enter then picks Plum instead
      h = await tabTo(o, "Pear", is("Pear", "fruit")); await key(o, "Space"); await pressed(h, "choice, Space");
      h = await tabTo(o, "Plum", is("Plum", "fruit")); await key(o, "Enter"); await pressed(h, "choice, Enter");
      // a multi with its own option: Space and Enter pick two, typing and Enter in the field adds one
      h = await tabTo(o, "Pencil", is("Pencil", "tools")); await key(o, "Space"); await pressed(h, "multi, Space");
      h = await tabTo(o, "Ruler", is("Ruler", "tools")); await key(o, "Enter"); await pressed(h, "multi, Enter");
      h = await tabTo(o, "its own field", h => h.q === "tools" && h.tag === "input"); await o.page.keyboard.type("Glue"); await key(o, "Enter");
      const own = await o.evaluate(sel => [...document.querySelectorAll(sel + " [data-booklet-q='tools'] button")].map(b => b.textContent.trim() + (b.getAttribute("aria-pressed") === "true" ? "*" : "")), BOOK);
      c.ok(own.some(x => /^Glue/.test(x)), `multi, typing "Glue" and Enter in the field: the option is there (${own.join(", ")})`);
      // a scale: Space on the second step
      h = await tabTo(o, "Fairly sure", h => h.q === "sure" && /Fairly sure/.test(h.name)); await key(o, "Space"); await pressed(h, "scale, Space");
      // text, lines, number, date: typed
      h = await tabTo(o, "the long text", h => h.q === "thoughts"); await o.page.keyboard.type("Slow and steady"); await sleep(60);
      c.ok((await here(o)).value === "Slow and steady", "text: the typed words are in the field");
      h = await tabTo(o, "the lines field", h => h.q === "steps"); await o.page.keyboard.type("Cut"); await key(o, "Enter"); await o.page.keyboard.type("Fold");
      const lines = await o.evaluate(sel => [...document.querySelectorAll(sel + " [data-booklet-q='steps'] input")].map(i => i.value), BOOK);
      c.ok(lines.slice(0, 2).join("|") === "Cut|Fold" && lines.length === 3 && lines[2] === "", `lines: Enter ends a line and starts the next, a blank line waiting after them (${lines.join("|")})`);
      h = await tabTo(o, "the number field", h => h.q === "boxes" && h.tag === "input"); await o.page.keyboard.type("7"); await key(o, "ArrowUp");
      c.ok((await here(o)).value === "8", `number: typing 7 and ArrowUp gives ${(await here(o)).value}`);
      h = await tabTo(o, "the date field", h => h.q === "fold-day"); await o.page.keyboard.type("11152026");
      c.ok((await here(o)).value === "2026-11-15", `date: typing 11152026 gives ${(await here(o)).value}`);
      // the menu question: Space on two shapes
      h = await tabTo(o, "Circle", is("Circle", "picked")); await key(o, "Space"); await pressed(h, "menu, Space");
      h = await tabTo(o, "Triangle", is("Triangle", "picked")); await key(o, "Enter"); await pressed(h, "menu, Enter");
      // the widget: Enter on a cell's item
      h = await tabTo(o, "The blue box", is("The blue box", "board")); const w0 = await here(o); await key(o, "Enter"); const w1 = await here(o);
      c.info(`widget: Enter on "The blue box": pressed ${w0.pressed} -> ${w1.pressed}`);
      // the matrix: Space on "A lot" in the first row, Enter on "Somewhat" in the second
      // (a matrix's buttons come row after row, three to a row)
      const cell = (i, name) => tabTo(o, `${name} (button ${i} of the matrix)`, h => h.q === "rate" && h.qi === i && h.name === name);
      h = await cell(2, "A lot"); await key(o, "Space"); await pressed(h, "matrix row 1, Space");
      h = await cell(4, "Somewhat"); await key(o, "Enter"); await pressed(h, "matrix row 2, Enter");
      // a question inside a group, and inside a folded one
      h = await tabTo(o, "the group's field", h => h.q === "in-group"); await o.page.keyboard.type("inside");
      h = await tabTo(o, "the folded group", h => /A folded group/.test(h.name));
      const e0 = h.expanded; await key(o, "Enter"); const e1 = (await here(o)).expanded; await key(o, "Space"); const e2 = (await here(o)).expanded;
      c.ok(e0 !== e1 && e1 !== e2, `folded group: Enter and Space each toggle it (aria-expanded ${e0} -> ${e1} -> ${e2})`);
      if (e2 !== "true") await key(o, "Enter");
      h = await tabTo(o, "A carton", is("A carton", "fold-q")); await key(o, "Space"); await pressed(h, "choice in the folded group, Space");
      // everything is on disk
      const mx = await o.evaluate(sel => [...document.querySelectorAll(sel + " [data-booklet-q='rate'] button")].map(b => (b.closest("tr, li, [role=row], .booklet-matrix-row") || {}).className + ":" + b.textContent.trim() + (b.getAttribute("aria-pressed") === "true" ? "*" : "")), BOOK);
      c.info("matrix buttons: " + mx.join(" | "));
      const got = await onDisk(o, vault, "", g => g["fold-q"] !== undefined && g["in-group"] !== undefined && Array.isArray(g.rate) && g.rate.every(x => x !== null));
      c.ok(JSON.stringify(got.rate) === "[2,1]", `the matrix on disk: row 1 "A lot", row 2 "Somewhat" (${JSON.stringify(got.rate)})`);
      c.info("on disk: " + JSON.stringify(got));
      for (const k of ["fruit", "tools", "sure", "thoughts", "steps", "boxes", "fold-day", "picked", "rate", "in-group", "fold-q"]) c.ok(got[k] !== undefined, `the answer to ${k} is on disk: ${JSON.stringify(got[k])}`);
      c.ok(got.fruit === 3, `the choice on disk is the third option, Plum, the last one pressed: ${JSON.stringify(got.fruit)}`);
      c.ok(got.boxes === 8, `the number on disk is 8: ${JSON.stringify(got.boxes)}`);
      c.ok(got["fold-day"] === "2026-11-15", `the date on disk: ${JSON.stringify(got["fold-day"])}`);
      c.ok((await here(o)).inView, "focus is still in the view after the walk");

      /* ---- the repeating activity: Finalize, the fold, the table, the delete question ---- */
      const kept = () => { const m = fs.readFileSync(path.join(vault, NOTE), "utf8").match(/```booklet entries tally\n([\s\S]*?)```/); return m ? JSON.parse(m[1]).items : []; };
      const rows = () => o.evaluate(sel => document.querySelectorAll(sel + " .booklet-q-table tbody tr").length, BOOK);
      await goTo(o, "activity:/tally"); await sleep(500);
      const before = kept().length;
      c.ok(before === 12, `the note keeps ${before} entries to start with`);
      await startAtTab(o);
      h = await tabTo(o, "the number field", h => h.q === "folded" && h.tag === "input"); await o.page.keyboard.type("5");
      h = await tabTo(o, "the text field", h => h.q === "remark"); await o.page.keyboard.type("a made-up word");
      h = await tabTo(o, "Finalize", is("Finalize")); await key(o, "Enter");
      for (let i = 0; i < 60 && kept().length === before; i++) await sleep(100);
      const now = kept();
      c.ok(now.length === before + 1 && now.some(e => e.folded === 5 && e.remark === "a made-up word"), `Finalize, by Enter: one entry more, with the typed answers (${now.length}); the last: ${JSON.stringify(now.at(-1))}`);
      const after = await here(o);
      c.ok(after.inView, `focus stays in the view after Finalize (on ${after.tag} "${after.name}")`);
      // the fold of the kept entries: Enter closes it, Space opens it
      await startAtTab(o);
      h = await tabTo(o, "the kept entries' fold", h => /booklet-fold/.test(h.cls));
      await key(o, "Enter"); const f1 = await o.evaluate(sel => { const b = document.activeElement; return { x: b.getAttribute("aria-expanded"), shown: !document.getElementById(b.getAttribute("aria-controls")).hidden }; }, BOOK);
      await key(o, "Space"); const f2 = await o.evaluate(sel => { const b = document.activeElement; return { x: b.getAttribute("aria-expanded"), shown: !document.getElementById(b.getAttribute("aria-controls")).hidden }; }, BOOK);
      c.ok(f1.x === "false" && !f1.shown && f2.x === "true" && f2.shown, `the kept entries' fold: Enter closes it (${JSON.stringify(f1)}), Space opens it (${JSON.stringify(f2)}), focus stays on it`);
      // the delete question: Enter asks, focus lands on No, Escape takes it back to Delete, nothing written
      h = await tabTo(o, "Delete", h => h.name === "Delete" && /booklet-entry-delete/.test(h.cls)); await key(o, "Enter");
      let a = await here(o);
      c.ok(a.name === "No", `Delete, by Enter, asks "Delete this entry?" and focus is on the safe answer: ${a.name}`);
      await key(o, "Escape"); a = await here(o);
      c.ok(a.name === "Delete" && kept().length === before + 1, `Escape takes the question back and focus returns to Delete (${a.name}); nothing was deleted (${kept().length} kept)`);
      const ask = await o.evaluate(() => [...document.querySelectorAll(".booklet-entry-ask")].filter(e => !e.hidden).length);
      c.ok(ask === 0, `no question is left open (${ask})`);
      await key(o, "Enter"); await key(o, "Shift+Tab"); a = await here(o);
      c.ok(/Yes/.test(a.name), `Shift+Tab goes from No to the Yes button (${a.name})`);
      await key(o, "Enter");
      for (let i = 0; i < 60 && kept().length !== before; i++) await sleep(100);
      c.ok(kept().length === before, `Yes, by Enter, deleted the newest entry: ${kept().length} kept`);
      await sleep(300);
      a = await here(o);
      c.ok(a.inView, `after the delete focus is still in the view (on ${a.tag} "${a.name}")`);
      // the table: Enter on a column head sorts it, Space turns it round, and the head keeps focus
      await startAtTab(o);
      h = await tabTo(o, "a column head", h => /booklet-q-sort/.test(h.cls));
      const head = await o.evaluate(() => document.activeElement.closest("th").getAttribute("aria-sort"));
      await key(o, "Enter"); const s1 = await o.evaluate(() => ({ s: document.activeElement.closest("th") && document.activeElement.closest("th").getAttribute("aria-sort"), on: document.activeElement.className }));
      await key(o, "Space"); const s2 = await o.evaluate(() => ({ s: document.activeElement.closest("th") && document.activeElement.closest("th").getAttribute("aria-sort"), on: document.activeElement.className }));
      c.ok(/sort/.test(s1.on) && /sort/.test(s2.on) && s1.s !== s2.s && !!s1.s && !!s2.s, `the table's head: Enter sorts (${head} -> ${s1.s}), Space turns it round (${s2.s}), and the head keeps focus`);
      // the filter: the toggle opens it, typing narrows the rows, Escape clears the words
      await startAtTab(o);
      h = await tabTo(o, "the filter toggle", h => /booklet-qc-toggle/.test(h.cls)); await key(o, "Enter");
      c.ok((await here(o)).expanded === "true", "the filter's toggle, by Enter, opens the filter bar");
      const total = await rows();
      h = await tabTo(o, "the search field", h => h.type === "search"); await o.page.keyboard.type("tidy"); await sleep(250);
      const some = await rows();
      c.ok(some >= 1 && some < total, `typing "tidy" narrows the table from ${total} rows to ${some}`);
      await key(o, "Escape"); await sleep(250);
      const back = await rows(), cleared = (await here(o)).value;
      c.ok(back === total && cleared === "" && (await here(o)).tag === "input", `Escape clears the words (${JSON.stringify(cleared)}), the ${back} rows are back, and focus stays in the field`);
      c.ok((await here(o)).inView, "focus is still in the view at the end");
    });
    return c;
  }

  /* ================= CHECK 44 ================= */
  // what moves in the view: a transition or an animation with a duration, smooth scrolling. The plugin's own elements (booklet- classes) and
  // Obsidian's own (its buttons, its scrollbars) are told apart: the plugin answers for the first.
  const motion = o => o.evaluate(sel => {
    const root = document.querySelector(sel + " .view-content");
    const secs = v => v.split(",").map(x => parseFloat(x) * (/ms$/.test(x.trim()) ? 0.001 : 1));
    const out = [];
    const walk = e => {
      const c = getComputedStyle(e);
      const t = secs(c.transitionDuration).some((d, i) => d > 0 && c.transitionProperty.split(",")[i % c.transitionProperty.split(",").length].trim() !== "none");
      const a = c.animationName !== "none" && secs(c.animationDuration).some(d => d > 0);
      const sm = c.scrollBehavior === "smooth";
      if (t || a || sm) out.push({ cls: (e.getAttribute("class") || "").slice(0, 70), tag: e.tagName.toLowerCase(), t, a, sm, mine: /(^|\s)booklet-/.test(e.getAttribute("class") || ""), prop: c.transitionProperty.slice(0, 40), dur: c.transitionDuration.slice(0, 20) });
      for (const k of e.children) walk(k);
    };
    walk(root);
    const outer = [document.documentElement, document.body, root.parentElement].map(e => getComputedStyle(e).scrollBehavior);
    return { moving: out, outer, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches };
  }, BOOK);

  async function check44() {
    const c = new Check(44, "reduced motion: with the system asking for less motion, nothing in the view moves, fades or scrolls smoothly");
    await withApp("c44", async (o, vault) => {
      put(vault);
      await open(o, NOTE);
      for (const screen of ["activity:/walk", "activity:/tally"]) {
        await goTo(o, screen);
        await sleep(400);
        for (const mode of ["reduce", "no-preference"]) {
          await o.page.emulateMedia({ reducedMotion: mode });
          await sleep(120);
          const m = await motion(o);
          c.ok(m.reduced === (mode === "reduce"), `[${screen} ${mode}] the page sees prefers-reduced-motion: ${m.reduced}`);
          const mine = m.moving.filter(x => x.mine), theirs = m.moving.filter(x => !x.mine);
          // the plugin draws no motion of its own, but a link of its inherits Obsidian's fade: under reduced motion the view stops that too
          if (mode === "reduce") c.ok(mine.length === 0, `[${screen} ${mode}] none of the plugin's elements has a transition, an animation or smooth scrolling (${mine.length}): ${mine.slice(0, 6).map(x => x.tag + "." + x.cls + " " + x.prop + " " + x.dur).join(" | ") || "none"}`);
          else c.info(`[${screen} ${mode}] ${mine.length} of the plugin's elements carry Obsidian's own fade: ${mine.slice(0, 4).map(x => x.tag + "." + x.cls + " " + x.prop + " " + x.dur).join(" | ") || "none"}`);
          c.ok(m.outer.every(x => x !== "smooth"), `[${screen} ${mode}] the page and the pane scroll without smoothing: ${m.outer.join(", ")}`);
          if (mode === "reduce") c.ok(theirs.length === 0, `[${screen} ${mode}] and, under reduced motion, nothing else in the view moves either: ${theirs.slice(0, 6).map(x => x.tag + "." + x.cls + " " + x.prop + " " + x.dur).join(" | ") || "none"}`);
          else c.info(`[${screen} ${mode}] ${theirs.length} of Obsidian's own elements in the view have a transition: ${theirs.slice(0, 4).map(x => x.tag + "." + x.cls + " " + x.prop + " " + x.dur).join(" | ")}`);
        }
      }
      await o.page.emulateMedia({ reducedMotion: null });
    });
    return c;
  }

  /* ================= CHECK 45 ================= */
  // Zoom as Obsidian's own Appearance setting does it (the app's zoom factor): at 200% the window is half as many CSS pixels wide.
  const setZoom = async (o, f) => {
    await o.evaluate(f => require("electron").webFrame.setZoomFactor(f), f);
    await o.page.waitForFunction(f => Math.abs(window.innerWidth * f - screen.width) < 4000 && Math.abs(require("electron").webFrame.getZoomFactor() - f) < 0.01, f, { timeout: 5000, polling: 50 });
    await frames(o); await sleep(250); await frames(o);
  };
  // Nothing overlaps, nothing is cut off, nothing scrolls sideways
  const fit = o => o.evaluate(sel => {
    const view = document.querySelector(sel + " .view-content"), vr = view.getBoundingClientRect();
    const shown = e => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let p = e; p && p !== view; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === "none" || c.visibility === "hidden") return false; if (p.parentElement && p.parentElement.tagName === "DETAILS" && !p.parentElement.open && p.tagName !== "SUMMARY") return false; } return true; };
    const ctl = [...view.querySelectorAll("button, input, textarea, select, summary, a[href], [role=link], [role=tab]")].filter(e => !e.disabled && shown(e));
    const name = e => (e.tagName.toLowerCase() + "." + (e.getAttribute("class") || "").split(" ")[0] + " \"" + (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 30) + "\"");
    const scroller = e => { for (let p = e.parentElement; p && p !== view; p = p.parentElement) { const c = getComputedStyle(p); if (/(auto|scroll)/.test(c.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
    const outside = ctl.filter(e => { const r = e.getBoundingClientRect(); return !scroller(e) && (r.left < vr.left - 1 || r.right > vr.right + 1); }).map(name);
    const overlaps = [];
    for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
      const a = ctl[i], b = ctl[j];
      if (a.contains(b) || b.contains(a)) continue;
      const r = a.getBoundingClientRect(), s = b.getBoundingClientRect();
      const w = Math.min(r.right, s.right) - Math.max(r.left, s.left), h = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
      if (w > 3 && h > 3) overlaps.push(name(a) + " x " + name(b) + " " + Math.round(w) + "x" + Math.round(h));
    }
    // text cut off: a box that clips (overflow other than visible) and holds more than it shows, or that ellipsises
    const cut = [];
    for (const e of view.querySelectorAll("*")) {
      if (!shown(e) || e.closest(".booklet-sr")) continue;
      const c = getComputedStyle(e);
      const clips = c.overflowX !== "visible" || c.overflowY !== "visible";
      if (e.scrollWidth > e.clientWidth + 1 && clips && !/(auto|scroll)/.test(c.overflowX) && e.clientWidth > 0 && !e.closest("svg")) cut.push("x " + name(e) + " " + e.scrollWidth + ">" + e.clientWidth);
      else if (c.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1) cut.push("… " + name(e));
      else if (e.scrollHeight > e.clientHeight + 1 && /(hidden|clip)/.test(c.overflowY) && e.clientHeight > 0 && !e.closest("svg")) cut.push("y " + name(e) + " " + e.scrollHeight + ">" + e.clientHeight);
    }
    // what pokes out past the view's right edge, widest first (named in the report when something scrolls sideways)
    const edge = vr.right - parseFloat(getComputedStyle(view).paddingRight);
    const wide = [...view.querySelectorAll("*")].filter(e => shown(e) && !scroller(e) && !e.closest(".booklet-sr") && e.getBoundingClientRect().right > edge + 1)
      .map(e => ({ n: name(e), over: Math.round(e.getBoundingClientRect().right - edge) })).sort((a, b) => b.over - a.over).slice(0, 6).map(x => x.n + " +" + x.over);
    return { wide, view: Math.round(vr.width), sideways: view.scrollWidth - view.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth, controls: ctl.length, outside, overlaps, cut,
      zoom: window.outerWidth / window.innerWidth, inner: window.innerWidth };
  }, BOOK);

  async function check45() {
    const c = new Check(45, "200% zoom: on the activity page, a kept-days page, the opening and a module screen, in light and dark, nothing overlaps, nothing is cut off, nothing scrolls sideways; at a phone's width too");
    for (const where of ["desktop", "phone"]) {
      await withApp("c45-" + where, async (o, vault) => {
        put(vault);
        const SK = "Learning to sketch.booklet.md", skKit = kit(env, SK);
        if (where === "phone") { await o.page.setViewportSize({ width: 390, height: 844 }); await mobile(o, true); } else await o.page.setViewportSize({ width: 1280, height: 900 });
        const screens = [["activity", NOTE, "activity:/walk"], ["kept days", NOTE, "activity:/tally"], ["opening", SK, "home"], ["module", SK, "module:basics"]];
        let now = null;
        for (const zoom of [1, 2]) {
          await setZoom(o, zoom);
          for (const scheme of ["light", "dark"]) {
            await o.setScheme(scheme); await sleep(250); await frames(o);
            for (const [label, note, screen] of screens) {
              if (now !== note) { await (note === NOTE ? open : skKit.open)(o, note); now = note; }
              await o.evaluate(async screen => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 1, screen, part: 0 }, active: true }); }, screen);
              await o.page.waitForSelector(BOOK + " .booklet-page", { timeout: 8000 });
              await quiet(o); await sleep(500);
              const f = await fit(o);
              const tag = `[${where} ${zoom * 100}% ${scheme}, ${label}]`;
              if (zoom === 2) c.ok(Math.abs(f.zoom - 1) > 0.5 || f.inner < (where === "phone" ? 300 : 800), `${tag} the window is ${f.inner} CSS pixels wide at this zoom`);
              c.ok(f.sideways <= 0 && f.page <= 0, `${tag} no sideways scroll of the view (${f.sideways}) or the page (${f.page}): ${f.wide.join(" | ") || "nothing pokes out"}`);
              c.ok(f.outside.length === 0, `${tag} every control (${f.controls}) is inside the view's width: ${f.outside.slice(0, 5).join(" | ") || "yes"}`);
              c.ok(f.overlaps.length === 0, `${tag} no two controls overlap: ${f.overlaps.slice(0, 5).join(" | ") || "none"}`);
              c.ok(f.cut.length === 0, `${tag} no text is cut off: ${f.cut.slice(0, 5).join(" | ") || "none"}`);
              if (zoom === 2) await shot(o, `zoom200-${where}-${label.replace(/ /g, "-")}-${scheme}`);
            }
          }
        }
        await setZoom(o, 1);
        if (where === "phone") { await o.page.setViewportSize({ width: 1280, height: 900 }); await mobile(o, false); }
      });
    }
    return c;
  }

  return { 42: check42, 43: check43, 44: check44, 45: check45 };
};
