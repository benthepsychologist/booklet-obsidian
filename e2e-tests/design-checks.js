// Checks 64 to 95 of plugin-check.js (plugin 1.6.0; 78 to 85 are stage 3, the other kinds' controls and the rich-text bar; 86 to 95 are stage 4, the fold switch, the pickers, hint and solution, notice, picture, figure and citation): the Design view, in the real Obsidian (not jsdom). Every note is a made-up one of test/fixtures.mjs
// (written into the check's source vault) or is made up here and written into the check's own copy of the vault; nothing is written into --vault.
//   64 the three modes: a booklet note opens in the Booklet view; the header buttons go between Markdown, Booklet and Design (all six
//      moves); the setting "Open booklets in"; an ordinary note stays Markdown; a restart brings the Design view pane back (a pane that
//      Obsidian has not loaded is a placeholder: loadIfDeferred) and the header icons; no member of the view hidden by the base class
//   65 the navigator and ONE page at a time, on four notes (Every kind, Check-in, Reading and steps, Cards): the entries with their icons,
//      levels, indent and colours; every entry draws exactly its page and the crumb follows; the inert drawings; the friendly cards for what
//      is not drawn; the reading callouts; nothing live: real mouse and keyboard on a drawn question change nothing on disk
//   66 the Add tab (a Common row, four foldable groups, 57 tiles lit and greyed with a reason, a sample on hover only), a "+" first then a tile,
//      a tile first then a lit "+", a tile dragged to a "+", and the hotkeys with the real keyboard (letters, status line, Enter, Esc, silent
//      in a field, Obsidian's own keys, a user's own hotkey, the palette commands); the tiles' icon names on this Obsidian
//   67 delete and move (the floating bar, a card's bar), the count-and-ask dialog, undo and redo by button and key, the in-place editor
//      (stage 2b: no draft, no Save or Cancel; every field applies when it is left, as one write; the Markdown section; Esc and Ctrl+Enter
//      apply and close; typed text held when the note changed on disk meanwhile), the navigator, the lines the reader cannot read;
//      each write compared byte for byte
//   68 the same writes with the note also open in a Markdown pane (they go through that editor; its buffer equals the disk)
//   69 a phone (Obsidian's phone mode at 390 x 844): the menu button and the panel, the Add tab on a phone, placing, the editor, the dialog;
//      light and dark, with screenshots
//   70 and 71 Obsidian in Spanish and in French: the view's words in that language, and each scene fits, at a desktop's width and on a phone
//   72 the row editors (a choice or multi, a shared menu, a matrix) applied as you go: each write byte for byte, the ask on a change that moves a
//      kept answer (Cancel writes nothing), a block the rows cannot show falls back to the Markdown, the phone's 44 px, light and dark, Spanish and French
//   73 typing in a field and leaving the box at once, with real keys and a real mouse: Ctrl+Enter, a real press on a button of the box (not swallowed, one
//      write each), Esc (applies and closes), a matrix anchor's number
//   74 the canvas in Paper and petrol, light or dark, or in Obsidian's look: the look selector in the header, the page, a callout, a choice, a matrix and an open edit box in each of the three looks and
//      both Obsidian modes (screenshots, the paper tokens or Obsidian's variables on the canvas, the left column and header unchanged, contrast of the edit box), and the selector on a phone
//   75 the in-place flow with real keys and a real mouse: a title left by Tab (one write, one Undo step, the same elements kept), a description with Enter
//      and a real press on another block, a real press on "Add an option" straight after typing, Esc, Ctrl+Enter and a press on the page applying and
//      closing, a drag that ends on the page, the Markdown section, a mode switch and a closed pane with typing pending, typing held when the note changed
//   76 Undo and Redo in the real app: twelve changes of mixed kinds undone and redone byte for byte, typing pending, nothing to undo, rapid presses, an outside
//      edit of the note, a dialog open; no console or page error
//   77 the view stands still: header, trail, status strip, scroll area under a press and a write, at three widths
//   78 a scale's anchors as rows (edit, move, add, remove, Undo and Redo byte for byte; the kept-answer ask; the blank line of a list not starting at 1)
//   79 number, text, date and lines settings: named, refused with a reason and put back, -2 and 0.5 accepted, digits-only fields
//   80 the each: picker (only valid sources, one write, Nothing clears it, the kept-data ask and a declined choice put back)
//   81 a listen's media (an embed or a link, a refused non-media address, a line the controls cannot show stays Markdown)
//   82 a widget's data block picker and the button that opens the block's Markdown (writes nothing)
//   83 the rich-text bar and keys (Ctrl+B, I, K, Ctrl+Shift+8), refusals in the status strip, native Ctrl+Z, none in the id field or Markdown box
//   84 nothing moves under a press on the new controls and the bar, at a wide pane, 740 px and the phone layout
//   85 the new controls on a phone (44 px, nothing wider than the screen) and in the three looks (contrast)
//   86 the Starts folded switch on a callout, a group, and a hint or solution under a question (a hint nested in a group, a solution with no blank line above it)
//   87 an activity's tab picker, a page's parent picker (a loop refused in words), the kept entries' switch
//   88 a copy button's list: add, move, remove, change, a word kept as written surviving
//   89 a question's Hint and Solution fields: add, type, fold switch, remove, Undo each
//   90 a module's notice: four fields, an unknown line kept, a refused value
//   91 a picture: its description and place (a reference-style one changes a definition line elsewhere), the remote-address warning in words
//   92 a figure's picker: only the id inside the embed changes
//   93 a citation's five fields, a note outside the source pattern, a mark with no note
//   94 focus and Undo: a drop-down, a text field and a words box changed, then the app's Undo (button, and key) and Redo
//   95 the stage 4 controls on a phone: every control 44 x 44 px or more, no sideways scroll
//   (86 to 93 also run the reference linter on each result and require nothing new but what the check says is expected)
//   77 the view stands still: with long titles, at a wide pane, at about 740 px and at 390 px, a press on a block and the block opening and closing change neither the header, the trail
//      nor the page's place; the status line is a strip in the flow of one fixed height that never covers the page, so a message moves nothing
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check functions.
const fs = require("fs"), path = require("path"), crypto = require("crypto"), cp = require("child_process");
const { frames, mobile } = require("./waits");

module.exports = function designChecks(env) {
  const { withApp, Check, SHOTS, sleep, waitActiveType, launch, opt, SRC_VAULT, consoleReport } = env;
  const DV = ".workspace-leaf.mod-active .workspace-leaf-content[data-type='booklet-design']", BV = ".workspace-leaf.mod-active .workspace-leaf-content[data-type='booklet']";
  const EVERY = "Every kind.booklet.md", CHECKIN = "Check-in.booklet.md", READING = "Reading and steps.booklet.md", KEPT = "Kept records.booklet.md", ORDINARY = "Ordinary note.md";
  const VER = (/obsidian-(\d+\.\d+\.\d+)/.exec(opt.obsidian || "") || [0, "x"])[1].replace(/\./g, "");
  const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  const text = f => fs.readFileSync(f, "utf8");
  const put = (vault, rel, data) => { const f = path.join(vault, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
  const lineOf = (t, needle) => { const i = t.split("\n").findIndex(l => l.includes(needle)); if (i < 0) throw new Error("no line with " + needle); return i; };
  const shot = (o, name) => o.screenshot(path.join(SHOTS, "design-" + name + "-" + VER + ".png"));
  /** The one place two texts differ: what was taken out and what was put in, with the text before and after it the same. */
  const region = (a, b) => {
    let i = 0; const n = Math.min(a.length, b.length);
    while (i < n && a[i] === b[i]) i++;
    let j = 0;
    while (j < n - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
    return { at: i, removed: a.slice(i, a.length - j), added: b.slice(i, b.length - j) };
  };
  /**
   * What a placing changed, by whole lines (a byte-level `region` can start inside the new block when the text before and after it happen to agree):
   * the first line that differs, the lines taken out and the lines put in. A placing takes nothing out and puts in one block and one blank line.
   */
  const placed = (a, b) => {
    const x = a.split("\n"), y = b.split("\n");
    let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++;
    let j = 0; while (j < x.length - i && j < y.length - i && x[x.length - 1 - j] === y[y.length - 1 - j]) j++;
    return { at: i, removed: x.slice(i, x.length - j).join("\n"), added: y.slice(i, y.length - j).join("\n") };
  };
  const onlyBlank = s => s.trim() === "";
  const linesDiffering = (a, b) => { const x = a.split("\n"), y = b.split("\n"); if (x.length !== y.length) return -1; return x.filter((l, i) => l !== y[i]).length; };
  async function waitDisk(file, pred, timeout = 8000) {
    const t0 = Date.now(); let t = "";
    while (Date.now() - t0 < timeout) { t = text(file); try { if (pred(t)) return { ok: true, text: t }; } catch (e) { /* not yet */ } await sleep(80); }
    return { ok: false, text: t };
  }
  const idle = async o => {
    await o.evaluate(async () => { const v = app.workspace.getLeavesOfType("booklet-design")[0]?.view; if (v) await Promise.race([v.whenIdle(), new Promise(r => setTimeout(r, 8000))]); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    await sleep(200);
  };
  /**
   * The harness's window has no window manager, so Obsidian's `activeWindow` is a stale object until the first Escape and its key map
   * hears nothing (not even Ctrl+P): one Escape puts it right. A person's window has the focus already. Gives what it found.
   */
  async function warm(o) {
    const was = await o.evaluate(() => activeWindow === window);
    for (let i = 0; i < 3 && !(await o.evaluate(() => activeWindow === window)); i++) { await o.page.keyboard.press("Escape"); await sleep(100); }
    return was;
  }
  const bookletNote = (o, rel) => o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, rel, { timeout: 30000, polling: 100 });
  /**
   * The note opened in a pane and put in the Design view with the plugin's own mode switch (the header buttons are check 64's). `wide`
   * closes both side bars, so the pane is wider than the 700 px under which the view draws its left column as a phone's panel (a 1024 px
   * window with the file explorer open leaves the pane about 668 px wide: that is the narrow layout, and `wide: false` keeps it).
   */
  async function openDesign(o, rel, where = "tab", closeOthers = true, wide = true) {
    await bookletNote(o, rel);
    if (closeOthers) await o.evaluate(() => { const ls = []; app.workspace.iterateRootLeaves(l => { ls.push(l); }); ls.forEach(l => l.detach()); });
    await o.evaluate(async ([rel, where]) => { const leaf = app.workspace.getLeaf(where); await leaf.openFile(app.vault.getAbstractFileByPath(rel)); }, [rel, where]);
    if (!(await waitActiveType(o, "booklet", 15000)) && !(await waitActiveType(o, "booklet-design", 100))) throw new Error("the note did not open as a booklet");
    if (await o.evaluate(() => app.workspace.activeLeaf.view.getViewType()) !== "booklet-design") {
      await o.evaluate(async () => { await app.plugins.plugins.booklet.setMode(app.workspace.activeLeaf, "design"); });
      if (!(await waitActiveType(o, "booklet-design", 8000))) throw new Error("the Design view did not open");
    }
    await o.page.waitForSelector(DV + " .booklet-design-page", { timeout: 10000 });
    await warm(o);
    if (wide && await o.evaluate(() => window.innerWidth) >= 900) {
      await o.evaluate(() => { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); });
      await o.page.waitForFunction(sel => { const e = document.querySelector(sel); return !!e && !e.classList.contains("is-phone") && e.clientWidth >= 700; }, DV + " .view-content, " + DV + " .booklet-design", { timeout: 8000, polling: 50 }).catch(() => {});
    }
    await idle(o);
  }
  /** What a person can see of the view's state: the selected block, the status line, what is picked, the "+" chosen, the tab, the editor, a dialog, the panel. */
  const state = o => o.evaluate(() => {
    const v = app.workspace.getLeavesOfType("booklet-design")[0]?.view; if (!v) return null;
    const el = v.contentEl, sel = el.querySelector(".booklet-design-block.is-selected"), banner = el.querySelector(".booklet-design-armedbar"), tab = el.querySelector(".booklet-design-tab[aria-selected='true']");
    const left = el.querySelector(".booklet-design-left");
    return {
      selected: sel ? sel.getAttribute("data-kind") + "@" + sel.getAttribute("data-start") : null,
      status: (el.querySelector(".booklet-design-status") || {}).textContent || "",
      armed: [...new Set([...el.querySelectorAll("[data-piece][aria-pressed='true']")].map(e => e.getAttribute("data-piece")))],
      banner: banner && !banner.hidden ? banner.textContent : null,
      lit: el.querySelectorAll(".booklet-design-slot.is-lit").length,
      target: (el.querySelector(".booklet-design-slot.is-target") || { getAttribute: () => null }).getAttribute("data-slot"),
      tab: tab ? tab.getAttribute("data-tab") : null,
      editBox: !!el.querySelector(".booklet-design-editbox"), editor: !!el.querySelector(".booklet-design-edit-md[open] .booklet-design-textarea"),
      modal: !!document.querySelector(".modal-container .modal"),
      phone: el.classList.contains("is-phone"), leftHidden: !!left && left.hidden, panel: !!el.querySelector(".booklet-design-shell.has-panel"),
      page: (el.querySelector(".booklet-design-page") || { getAttribute: () => null }).getAttribute("data-kind") + "@" + (el.querySelector(".booklet-design-page") || { getAttribute: () => null }).getAttribute("data-start"),
      title: (el.querySelector(".booklet-design-page-title") || {}).textContent || "",
    };
  });
  const block = (kind, start) => `${DV} .booklet-design-block[data-kind='${kind}'][data-start='${start}']`;
  const card = (kind, start) => `${DV} .booklet-design-card[data-kind='${kind}'][data-start='${start}']`;
  /** A button of a block's floating bar (the selected block) or of a card's bar: cls is up, down, edit or delete. */
  const barBtn = (kind, start, cls) => `${block(kind, start)} > .booklet-design-floatbar .booklet-design-${cls}`;
  const cardBtn = (kind, start, cls) => `${card(kind, start)} > .booklet-design-cardbar .booklet-design-${cls}`;
  const tile = file => `${DV} .booklet-design-tile[data-piece='${file}']`;
  const chip = file => `${DV} .booklet-design-commonchip[data-piece='${file}']`;
  /** The left column open (on a phone a press on the menu button), on the tab asked for. */
  async function leftTab(o, tab) {
    const st = await state(o);
    if (st.phone && st.leftHidden) { await o.page.locator(DV + " .booklet-design-menubutton").click(); await o.page.waitForFunction(sel => { const e = document.querySelector(sel); return !!e && !e.hidden; }, DV + " .booklet-design-left", { timeout: 4000, polling: 30 }); }
    if ((await state(o)).tab !== tab) await o.page.locator(`${DV} .booklet-design-tab[data-tab='${tab}']`).click();
    await sleep(150);
  }
  /** Press a navigator entry (a phone's panel opens first and shuts on the choice), and wait for its page. */
  async function goNav(o, kind, start) {
    await leftTab(o, "outline");
    const sel = `${DV} .booklet-design-nav-item[data-kind='${kind}']` + (start === undefined ? "" : `[data-start='${start}']`);
    await o.page.locator(sel).first().click();
    await idle(o);
  }
  /** A press on a block: it is selected and opens in place (its box is drawn in it; the first words field has the focus). */
  async function clickBlock(o, kind, start) {
    const sel = block(kind, start);
    await o.page.locator(sel).scrollIntoViewIfNeeded();
    await o.page.locator(sel).click();
    await o.page.waitForSelector(sel + ".is-open .booklet-design-editbox", { timeout: 5000 });
    await sleep(150);
  }
  /** The open block's controls (stage 2b): the words fields, the Markdown section (closed until its summary is pressed), the strip. */
  const TITLE_F = `${DV} .booklet-design-editbox .booklet-design-field.is-title`, DESC_F = `${DV} .booklet-design-editbox .booklet-design-field.is-desc`;
  const MD_SUMMARY = `${DV} .booklet-design-editbox .booklet-design-edit-md > summary`, MD_AREA = `${DV} .booklet-design-editbox .booklet-design-textarea`;
  /** The Markdown section of the open block opened by one real press on its summary (nothing is done when it is open already). */
  async function openMd(o) {
    if (!(await o.evaluate(() => !!document.querySelector(".workspace-leaf.mod-active .booklet-design-editbox .booklet-design-edit-md[open]")))) await o.page.locator(MD_SUMMARY).click();
    await o.page.waitForSelector(MD_AREA, { state: "visible", timeout: 3000 });
  }
  /** The block's own lines as the open box's Markdown holds them (the text area is there, closed or open). */
  const markdownOf = o => o.evaluate(() => { const a = document.querySelector(".workspace-leaf.mod-active .booklet-design-editbox .booklet-design-textarea"); return a ? a.value : null; });
  /** Writes to a note, counted with a vault modify listener of the page's own (armed once per note). */
  const armWrites = (o, rel) => o.evaluate(rel => { window.__wr = window.__wr || {}; window.__wr[rel] = 0; if (!window.__wrRef) window.__wrRef = app.vault.on("modify", f => { window.__wr[f.path] = (window.__wr[f.path] || 0) + 1; }); }, rel);
  const writesOf = (o, rel) => o.evaluate(rel => (window.__wr || {})[rel] || 0, rel);
  /** The page and console errors the harness has collected since `n` (the stdout noise of a missing per-vault json is another kind and is not counted). */
  const errorsSince = n => consoleReport.slice(n).filter(r => r.kind === "pageerror" || r.kind === "console.error" || (r.kind === "console.warning" && /booklet/i.test(r.text + " " + r.url)));
  /** A block selected and shut, with its floating bar: pressed (it opens) and Escape (nothing changed, so it closes and stays selected). */
  async function selectBlock(o, kind, start) {
    await clickBlock(o, kind, start);
    await o.page.keyboard.press("Escape");
    await o.page.waitForSelector(block(kind, start) + ".is-selected:not(.is-open) > .booklet-design-floatbar", { timeout: 5000 });
    await sleep(100);
  }
  /** A real tap on the dimmed strip right of a phone's panel (the part of the scrim the panel does not cover). */
  const tapScrim = async (o, strict) => { const w = await o.evaluate(() => { const e = document.querySelector(".workspace-leaf.mod-active .booklet-design-scrim"); return e ? Math.round(e.getBoundingClientRect().right) : window.innerWidth; }); await o.page.mouse.click(w - 12, 400); await sleep(250); if (!strict && (await state(o)).panel) await o.page.keyboard.press("Escape"); };
  const blurFocus = o => o.evaluate(() => { const b = document.activeElement; if (b && b.blur) b.blur(); });
  const modalInfo = o => o.evaluate(() => { const m = document.querySelector(".modal-container .modal"); if (!m) return null; const a = document.activeElement; return { title: (m.querySelector(".modal-title") || {}).textContent, text: m.innerText, buttons: [...m.querySelectorAll("button")].map(b => b.textContent.trim()), focus: a ? a.textContent.trim() : null, focusIsButton: !!a && a.tagName === "BUTTON" && m.contains(a) }; });
  const waitModal = async (o, want = true, ms = 5000) => { try { await o.page.waitForFunction(w => !!document.querySelector(".modal-container .modal") === w, want, { timeout: ms, polling: 30 }); return true; } catch (e) { return false; } };
  const clickModal = async (o, label) => { await o.page.locator(".modal-container .modal button", { hasText: new RegExp("^" + label + "$") }).click(); await waitModal(o, false); await sleep(200); };
  const typeFast = async (o, s) => { for (const ch of s) await o.page.keyboard.press(ch === " " ? "Space" : ch); };
  const relaunch = async (o, name) => {
    const o2 = await launch({ obsidian: path.resolve(opt.obsidian), vault: o.vault, configDir: o.configDir });
    env.sessions.push(name);
    o2.page.on("console", m => { if (m.type() === "error" || m.type() === "warning") env.consoleReport.push({ where: name, kind: "console." + m.type(), text: m.text().slice(0, 400), url: (m.location() || {}).url || "" }); });
    o2.page.on("pageerror", e => env.consoleReport.push({ where: name, kind: "pageerror", text: String((e && (e.stack || e.message)) || e).slice(0, 600), url: "" }));
    return o2;
  };
  const settingsPage = o => (async () => { for (const p of o.page.context().pages()) if (await p.evaluate(() => !!document.querySelector(".vertical-tab-content")).catch(() => false)) return p; return null; })();
  /** The names of the header buttons and of the tab's icon of the active pane. */
  const headerOf = o => o.evaluate(() => {
    const leaf = app.workspace.activeLeaf, el = leaf.view.containerEl, icon = n => { const s = n && n.querySelector("svg"); return s ? ([...s.classList].find(c => /^lucide-/.test(c)) || "svg").replace(/^lucide-/, "") : null; };
    const buttons = [...el.querySelectorAll(".view-header .view-actions .clickable-icon")].map(b => ({ label: b.getAttribute("aria-label"), icon: icon(b) }));
    const tab = document.querySelector(".mod-root .workspace-tab-header.is-active .workspace-tab-header-inner-icon");
    return { type: leaf.view.getViewType(), buttons, tabIcon: icon(tab), viewIcon: leaf.view.getIcon() };
  });
  const clickHeader = async (o, label) => {
    const b = o.page.locator(".workspace-leaf.mod-active .view-header .view-actions .clickable-icon[aria-label='" + label + "']");
    if (await b.count() !== 1) throw new Error("no header button " + label + " (" + await b.count() + ")");
    await b.click();
  };

  /* ================= CHECK 64 ================= */
  async function check64() {
    const c = new Check(64, "the three modes: a booklet note opens in the Booklet view; the header buttons move between Markdown, Booklet and Design (all six moves); \"Open booklets in\" = Design view; an ordinary note stays Markdown; a restart brings the Design view pane back (deferred pane); the header icons; no member of the view hidden by Obsidian's own");
    const L = { md: "Show Markdown", booklet: "Open as booklet", design: "Open in Design view" };
    await withApp("c64", async (o, vault) => {
      const note = path.join(vault, EVERY), before = sha(note);
      await bookletNote(o, EVERY);
      // the file explorer, as a person opens a note
      await o.page.locator(".nav-file-title[data-path='" + EVERY + "']").click();
      c.ok(await waitActiveType(o, "booklet", 15000), "a click on a booklet note in the file explorer opens it in the " + (await o.evaluate(() => app.workspace.activeLeaf.view.getViewType())) + " view (the Booklet view is the default)");
      await o.page.waitForSelector(BV + " .booklet-page", { timeout: 15000 });
      const ordinary = await o.evaluate(async () => { const l = app.workspace.getLeaf("tab"); await l.openFile(app.vault.getAbstractFileByPath("Ordinary note.md")); return l.view.getViewType(); });
      c.ok(ordinary === "markdown", "an ordinary note opens as Markdown: " + ordinary);
      await o.page.locator(".nav-file-title[data-path='" + EVERY + "']").click();
      await waitActiveType(o, "booklet", 8000);
      const panes = () => o.evaluate(() => { let n = 0; app.workspace.iterateRootLeaves(() => { n++; }); return n; });
      const n0 = await panes();
      // all six moves by the header buttons
      const moves = [["booklet", "design"], ["design", "md"], ["md", "design"], ["design", "booklet"], ["booklet", "md"], ["md", "booklet"]];
      const type = { md: "markdown", booklet: "booklet", design: "booklet-design" };
      const seen = [];
      for (const [from, to] of moves) {
        const h = await headerOf(o);
        if (h.type !== type[from]) { c.ok(false, "before the move " + from + " to " + to + " the pane is " + h.type); continue; }
        const labels = h.buttons.map(b => b.label);
        const others = Object.keys(L).filter(k => k !== from).map(k => L[k]);
        seen.push(from + ": " + JSON.stringify(h.buttons));
        c.ok(others.every(l => labels.includes(l)), `in ${from} mode the header has a button for each of the other two (${others.join(", ")}): ${JSON.stringify(labels)}`);
        await clickHeader(o, L[to]);
        const ok = await waitActiveType(o, type[to], 8000);
        c.ok(ok, `the header button "${L[to]}" moves ${from} to ${to}: the pane is now ${await o.evaluate(() => app.workspace.activeLeaf.view.getViewType())}`);
        if (to === "design") await o.page.waitForSelector(DV + " .booklet-design-page", { timeout: 8000 });
        if (to === "booklet") await o.page.waitForSelector(BV + " .booklet-page", { timeout: 8000 });
        if (to === "md") await o.page.waitForSelector(".workspace-leaf.mod-active .cm-content", { timeout: 8000 });
        await sleep(300);
      }
      c.ok(await panes() === n0, "all six moves stayed in the one pane (" + n0 + " panes before and " + await panes() + " after)");
      c.ok(sha(note) === before, "six moves wrote nothing: the note is byte for byte as it was");
      c.info("the header buttons seen, by mode (label and the lucide icon Obsidian drew): " + seen.join(" | "));
      // the icons: the tab's and the three buttons; a name Obsidian lacks is replaced, not a hole
      await clickHeader(o, L.design); await waitActiveType(o, "booklet-design", 8000);
      const h = await headerOf(o);
      c.ok(h.buttons.every(b => b.icon && b.icon !== "svg") && !!h.tabIcon, `every header button and the tab show an icon, none a hole: ${JSON.stringify(h.buttons)}, tab icon ${h.tabIcon}, view.getIcon() ${h.viewIcon}`);
      const names = await o.evaluate(() => { const { getIcon } = window; return null; });
      void names;
      // a booklet note moved to a second tab stays in its mode; the command toggle goes to Markdown and back to the setting's view
      await o.evaluate(() => app.commands.executeCommandById("booklet:toggle-view")); await sleep(500);
      const toggled = await o.evaluate(() => app.workspace.activeLeaf.view.getViewType());
      await o.evaluate(() => app.commands.executeCommandById("booklet:toggle-view")); await sleep(500);
      const toggled2 = await o.evaluate(() => app.workspace.activeLeaf.view.getViewType());
      c.ok(toggled === "markdown" && toggled2 === "booklet", `the command "Toggle between the note view and Markdown" goes Design to ${toggled} and then to ${toggled2} (the setting's view, the Booklet view)`);
      // the setting, set on the real settings page
      await o.evaluate(async () => { await app.setting.open(); await app.setting.openTabById("booklet"); });
      await sleep(800);
      let sp = await settingsPage(o);
      let rowAt = sp ? await sp.locator(".booklet-openin-row select[aria-label='Open booklets in']").count() : 0;
      if (sp && !rowAt) { const entry = sp.locator(".vertical-tab-content .mod-navigable").first(); if (await entry.count()) { await entry.click(); await sleep(500); rowAt = await sp.locator(".booklet-openin-row select[aria-label='Open booklets in']").count(); } }
      c.ok(!!sp && rowAt === 1, "the settings page has the row \"Open booklets in\" with one drop-down" + (sp ? "" : " (no settings page found)"));
      if (sp && rowAt) {
        const opts = await sp.locator(".booklet-openin-row select[aria-label='Open booklets in'] option").evaluateAll(es => es.map(e => e.value + "=" + e.textContent));
        const val0 = await sp.locator(".booklet-openin-row select[aria-label='Open booklets in']").inputValue();
        c.ok(val0 === "booklet" && opts.join() === "booklet=Booklet view,design=Design view", `the row offers ${opts.join(" / ")} and starts on ${val0}`);
        await sp.locator(".booklet-openin-row select[aria-label='Open booklets in']").selectOption("design"); await sleep(400);
        const saved = JSON.parse(text(path.join(vault, ".obsidian/plugins/booklet/data.json")));
        c.ok(saved.openIn === "design", "choosing Design view saves openIn in the plugin's data file: " + JSON.stringify(saved.openIn));
      }
      await o.evaluate(() => app.setting.close()); await sleep(400);
      await o.page.bringToFront().catch(() => {});
      // a note opened now, by the explorer and by a link, is in the Design view; an ordinary note is still Markdown; a leaf the buttons gave Markdown keeps it
      await o.page.locator(".nav-file-title[data-path='" + CHECKIN + "']").click();
      c.ok(await waitActiveType(o, "booklet-design", 15000), "with the setting on Design view a click on Check-in in the explorer opens the Design view: " + await o.evaluate(() => app.workspace.activeLeaf.view.getViewType()));
      await o.page.waitForSelector(DV + " .booklet-design-page", { timeout: 10000 });
      await o.page.locator(".nav-file-title[data-path='" + ORDINARY + "']").click(); await sleep(600);
      c.ok(await o.evaluate(() => app.workspace.activeLeaf.view.getViewType()) === "markdown", "an ordinary note is still Markdown with the setting on Design view");
      await o.evaluate(async () => { const l = app.workspace.getLeaf("tab"); await l.openFile(app.vault.getAbstractFileByPath("Daily tracker.booklet.md")); });
      c.ok(await waitActiveType(o, "booklet-design", 15000), "another booklet note opened by the API is in the Design view too");
      const md = await o.evaluate(async () => { const l = app.workspace.activeLeaf; await app.plugins.plugins.booklet.setMode(l, "markdown"); await new Promise(r => setTimeout(r, 400)); return l.view.getViewType(); });
      c.ok(md === "markdown", "the header's Show Markdown on it leaves it on Markdown (the leaf keeps the choice)");
      // the plugin's own data file keeps nothing else changed
      await sleep(300);
    });
    // a restart: two panes on a booklet note in the Design view, one in the background (a deferred pane after a restart), the setting back on the Booklet view
    await withApp("c64-restart", async (o, vault) => {
      const f = path.join(vault, EVERY), before = sha(f);
      await openDesign(o, EVERY);
      await o.evaluate(async () => { const l = app.workspace.getLeaf("tab"); await l.openFile(app.vault.getAbstractFileByPath("Check-in.booklet.md")); await app.plugins.plugins.booklet.setMode(l, "design"); });
      await waitActiveType(o, "booklet-design", 8000);
      await o.evaluate(async () => { const l = app.workspace.getLeaf("tab"); await l.openFile(app.vault.getAbstractFileByPath("Ordinary note.md")); });
      await sleep(500);
      await o.evaluate(async () => { const l = app.workspace.getLeaf("tab"); await l.openFile(app.vault.getAbstractFileByPath("Reading and steps.booklet.md")); });
      await waitActiveType(o, "booklet", 15000);
      const types0 = await o.evaluate(() => { const r = []; app.workspace.iterateRootLeaves(l => { r.push(l.getViewState().type + ":" + ((l.getViewState().state || {}).file || "")); }); return r; });
      o.page.on("dialog", d => { d.accept().catch(() => {}); });
      await o.evaluate(() => { window.addEventListener("beforeunload", () => {}); });
      await sleep(3500);
      const saved = JSON.stringify(JSON.parse(text(path.join(vault, ".obsidian", "workspace.json"))));
      c.ok(/"type":"booklet-design"/.test(saved), "the layout file keeps the Design view pane as its own view type: " + (saved.match(/"type":"booklet-design","state":\{[^}]*\}/) || ["not found"])[0]);
      const pid = cpPid(o.port);
      await o.evaluate(() => { setTimeout(() => require("electron").remote.getCurrentWindow().close(), 0); }).catch(() => {});
      for (let n = 0; n < 60; n++) { try { process.kill(pid, 0); } catch (e) { break; } await sleep(100); }
      await o.close();
      const o2 = await relaunch(o, "c64-restart-again");
      try {
        await o2.page.waitForFunction(() => app.workspace.layoutReady, null, { timeout: 30000 });
        await sleep(1500);
        const info = await o2.evaluate(() => { const r = []; app.workspace.iterateRootLeaves(l => { r.push({ type: l.getViewState().type, file: (l.getViewState().state || {}).file || "", deferred: l.isDeferred === true, live: l.view.getViewType(), active: l === app.workspace.activeLeaf }); }); return r; });
        c.info("after the restart the panes are: " + JSON.stringify(info));
        const designs = info.filter(p => p.type === "booklet-design");
        c.ok(designs.length === 2, "after a restart both Design view panes are back as Design view panes (" + designs.length + "): " + JSON.stringify(types0));
        const deferred = designs.filter(p => p.deferred);
        c.ok(deferred.length >= 1, "at least one of them is a deferred pane (a placeholder until it is shown): " + deferred.map(p => p.file).join(", "));
        const loaded = await o2.evaluate(async () => {
          const out = [];
          for (const l of app.workspace.getLeavesOfType("booklet-design")) {
            const was = l.isDeferred === true;
            await l.loadIfDeferred();
            const v = l.view;
            out.push({ was, type: v.getViewType(), file: v.file && v.file.path, drawn: v.contentEl.querySelectorAll(".booklet-design-nav-item").length + v.contentEl.querySelectorAll(".booklet-design-page").length, page: v.contentEl.querySelectorAll(".booklet-design-page").length, text: !!v.getViewData() });
          }
          return out;
        });
        c.ok(loaded.length === 2 && loaded.every(l => l.type === "booklet-design" && l.drawn > 3 && l.page === 1), "after loadIfDeferred each Design view pane is a drawn Design view (a navigator and one page): " + JSON.stringify(loaded));
        // a deferred pane the user activates: the mode is the Design view, with the tree and the header buttons
        await o2.evaluate(() => { const l = app.workspace.getLeavesOfType("booklet-design")[0]; app.workspace.setActiveLeaf(l, { focus: true }); });
        await o2.page.waitForSelector(DV + " .booklet-design-page", { timeout: 8000 });
        const hh = await headerOf(o2);
        c.ok(hh.type === "booklet-design" && hh.buttons.some(b => b.label === L.md) && hh.buttons.some(b => b.label === L.booklet), "the restored pane has both header buttons (Markdown, Booklet): " + JSON.stringify(hh.buttons.map(b => b.label)));
        // the header button works on a pane that was deferred
        await clickHeader(o2, L.md);
        c.ok(await waitActiveType(o2, "markdown", 8000), "the header button Show Markdown works on the restored pane");
        c.ok(sha(f) === before, "a restart and the moves wrote nothing: the note is as it was");
        const md = info.filter(p => p.file === "Ordinary note.md" || p.type === "markdown");
        c.info("the Ordinary note pane after the restart: " + JSON.stringify(md));
      } finally { await o2.close(); }
    });
    // no member of a view hidden by Obsidian's own: the real TextFileView's instance fields against the Design view's methods
    await withApp("c64-members", async (o, vault) => {
      await openDesign(o, EVERY);
      const r = await o.evaluate(() => {
        const dv = app.workspace.getLeavesOfType("booklet-design")[0].view, D = Object.getPrototypeOf(dv);
        const TF = Object.getPrototypeOf(Object.getPrototypeOf(D)).constructor;
        class X extends TF { getViewData() { return ""; } setViewData() {} clear() {} getViewType() { return "x"; } }
        const x = new X(app.workspace.getLeaf("tab")), base = Object.getOwnPropertyNames(x);
        const own = Object.getOwnPropertyNames(D).filter(n => n !== "constructor");
        const hidden = own.filter(n => base.includes(n) && typeof Object.getOwnPropertyDescriptor(D, n).value === "function" && typeof dv[n] !== "function");
        x.leaf.detach();
        return { base, hidden, ownMethods: own.length };
      });
      c.ok(r.hidden.length === 0, `no method of the Design view is hidden by a field the real TextFileView puts on the instance (${r.ownMethods} methods; the field names: ${r.base.join(", ")}): hidden ${JSON.stringify(r.hidden)}`);
    });
    return c;
  }
  const cpPid = port => {
    const cp = require("child_process");
    const pids = cp.execSync(`pgrep -f -- "--remote-debugging-port=${port}"`, { encoding: "utf8" }).trim().split("\n").map(Number);
    return pids.find(p => !/--type=/.test(fs.readFileSync(`/proc/${p}/cmdline`, "utf8").replace(/\0/g, " ")));
  };


  /* ================= CHECK 65 ================= */
  const CARDS = "Cards.booklet.md";
  const CARDS_TEXT = `---
booklet: "0.20"
id: booklet-test/cards
title: Cards
lang: en
---

> [!activity|a] Cards

Words of the activity.

> [!listen|tone] A short tone
> ![A short tone](media/tone.wav)

> [!bad

> [!text|t1] A question

> [!choice|c1 each:t1] Asked for each
- [ ] One
- [ ] Two

> [!module|zzz end]
`;
  /** The structure the note's text says, counted by plain patterns (not by the plugin's own reader). */
  const countsOf = t => {
    const r = { module: 0, activity: 0, tab: 0, page: 0, question: 0 };
    for (const l of t.split("\n")) {
      let m;
      if ((m = /^> \[!module\|([^\]]*)\]/.exec(l))) { if (!/(^|\s)end$/.test(m[1])) r.module++; }
      else if (/^> \[!activity\|/.test(l)) r.activity++;
      else if (/^> \[!tab\|/.test(l)) r.tab++;
      else if (/^> \[!page\|/.test(l)) r.page++;
      else if (/^> \[!(choice|multi|scale|text|lines|number|date|matrix|listen|widget)[|\]\s]/.test(l)) r.question++;
    }
    return r;
  };
  /** The navigator as drawn: each row with its level, depth, icon, colour, label and where its button stands. */
  const navFacts = o => o.evaluate(() => {
    const el = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl;
    const rows = [...el.querySelectorAll(".booklet-design-nav-row")].map(r => {
      const b = r.querySelector(".booklet-design-nav-item"), ic = r.querySelector(".booklet-design-nav-icon");
      return { kind: r.getAttribute("data-kind"), level: (/is-level-(\S+)/.exec(r.className) || [])[1], depth: +(/is-depth-(\d+)/.exec(r.className) || [])[1], ariaLevel: +r.getAttribute("aria-level"), label: (r.querySelector(".booklet-design-nav-label") || {}).textContent || "", start: b.getAttribute("data-start"), icon: !!(ic && ic.querySelector("svg")), colour: ic ? getComputedStyle(ic).color : "", left: Math.round(ic ? ic.getBoundingClientRect().left : 0), current: b.getAttribute("aria-current") };
    });
    return rows;
  });
  /** The page drawn now: how many, which part, its title, the crumb, what the navigator calls current. */
  const pageFacts = o => o.evaluate(() => {
    const el = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl, pg = [...el.querySelectorAll(".booklet-design-page")];
    const crumb = [...el.querySelectorAll(".booklet-design-crumb button")].map(b => ({ t: b.textContent, cur: b.getAttribute("aria-current") }));
    return { pages: pg.length, kind: pg[0] && pg[0].getAttribute("data-kind"), start: pg[0] && pg[0].getAttribute("data-start"), what: (el.querySelector(".booklet-design-page-kind") || {}).textContent, title: (el.querySelector(".booklet-design-page-title") || {}).textContent, crumb, current: [...el.querySelectorAll(".booklet-design-nav-item[aria-current='page']")].map(b => b.textContent.trim()), editBox: !!el.querySelector(".booklet-design-editbox"), area: (el.querySelector(".booklet-design-textarea") || {}).value || null, blocks: el.querySelectorAll(".booklet-design-block").length, cards: el.querySelectorAll(".booklet-design-card").length };
  });
  /** Every block of the page drawn now, as it is drawn: its kind, its line, whether an inert drawing or a card is in it. */
  const blocksOf = o => o.evaluate(() => {
    const el = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl;
    return [...el.querySelectorAll(".booklet-design-block")].map(n => {
      const s = n.querySelector(":scope > .booklet-design-drawn .booklet-sample");
      const controls = s ? [...s.querySelectorAll("button, input, textarea, select")] : [];
      const reading = n.querySelector(":scope > .booklet-design-drawn .booklet-sample-reading");
      const callouts = reading ? [...reading.querySelectorAll(".callout")] : [];
      const cardEl = n.querySelector(":scope > .booklet-design-friendly");
      const asw = n.querySelector(":scope > .booklet-design-aswritten");
      return { kind: n.getAttribute("data-kind"), start: n.getAttribute("data-start"), drawn: !!n.querySelector(":scope > .booklet-design-drawn"), sample: !!s, inert: !!s && s.hasAttribute("inert"), controls: controls.length, live: controls.filter(x => !x.disabled && !x.closest("[inert]")).length, pre: !!n.querySelector(":scope pre"), callouts: callouts.map(c => c.getAttribute("data-callout")), calloutIcons: callouts.filter(c => c.querySelector(".callout-icon svg")).length, rendered: !!(reading && reading.classList.contains("markdown-rendered")), card: cardEl ? { kind: (cardEl.querySelector(".booklet-design-friendly-kind") || {}).textContent, detail: (cardEl.querySelector(".booklet-design-friendly-detail") || {}).textContent || "", note: (cardEl.querySelector(".booklet-design-friendly-note") || {}).textContent || "", art: !!cardEl.querySelector(".booklet-design-friendly-art svg") } : null, written: asw ? { what: (asw.querySelector(".booklet-design-what") || {}).textContent, pre: (asw.querySelector("pre") || {}).textContent } : null };
    });
  });
  /** Every page of the open note, one navigator press each: `fn` is given the entry and what the page shows; the results come back in order. */
  async function crawl(o, fn) {
    const out = [];
    const n = (await navFacts(o)).length;
    for (let i = 0; i < n; i++) {
      await leftTab(o, "outline");
      const rows = await navFacts(o);
      if (rows[i].kind === "settings") continue;
      await o.page.locator(DV + " .booklet-design-nav-item").nth(i).click();
      await idle(o);
      out.push(await fn(rows[i], i));
    }
    return out;
  }
  async function check65() {
    const c = new Check(65, "the navigator and one page at a time, on four notes (Every kind, Check-in, Reading and steps, Cards): entries with icons, levels, indent and colours; every entry draws exactly its page and the crumb follows; the inert drawings; the friendly cards for what is not drawn; reading callouts as callouts; as-written text; nothing live: real mouse and keyboard on a drawn question write nothing; screenshots in light and dark");
    await withApp("c65", async (o, vault) => {
      put(vault, CARDS, CARDS_TEXT);
      for (const [rel, tag] of [[EVERY, "every"], [CHECKIN, "checkin"], [READING, "reading"]]) {
        const f = path.join(vault, rel), t = text(f), want = countsOf(t), before = sha(f);
        await openDesign(o, rel);
        const rows = await navFacts(o);
        const by = {}; for (const r of rows) by[r.level] = (by[r.level] || 0) + 1;
        const tabs = (by["module-tab"] || 0) + (by["activity-tab"] || 0);
        c.ok((by.module || 0) === want.module && (by.activity || 0) === want.activity && tabs === want.tab && (by.page || 0) === want.page, `${rel}: the navigator's entries match the note's own lines: modules ${by.module || 0}/${want.module}, activities ${by.activity || 0}/${want.activity}, tabs ${tabs}/${want.tab}, pages ${by.page || 0}/${want.page}; ${rows.length} entries in all (levels ${JSON.stringify(by)})`);
        c.ok(rows[0].kind === "settings" && rows[1].kind === "booklet" && rows[1].depth === 0 && rows.filter(r => r.kind === "booklet").length === 1, `${rel}: the settings come first, then the booklet itself once at the top: ${rows.slice(0, 2).map(r => r.kind + " " + r.label).join(", ")}`);
        const noIcon = rows.filter(r => !r.icon).map(r => r.label), noLabel = rows.filter(r => !r.label.trim()).length;
        const bad = []; rows.forEach((r, i) => { if (r.depth > 0) { for (let j = i - 1; j >= 0; j--) if (rows[j].depth === r.depth - 1) { if (r.left <= rows[j].left) bad.push(r.label); break; } } });
        const ariaBad = rows.filter(r => r.ariaLevel !== r.depth + 1).map(r => r.label);
        c.ok(noIcon.length === 0 && noLabel === 0 && bad.length === 0 && ariaBad.length === 0, `${rel}: every entry has an icon and words, every child sits right of its parent, and each one's aria-level is its depth plus one (without icon ${JSON.stringify(noIcon)}, without words ${noLabel}, not indented ${JSON.stringify(bad)}, wrong aria-level ${JSON.stringify(ariaBad)})`);
        const colours = {}; for (const r of rows) if (r.level !== "booklet") colours[r.level] = r.colour; colours.booklet = rows.find(r => r.level === "booklet").colour;
        c.ok(new Set(Object.values(colours)).size === Object.keys(colours).length, `${rel}: each level present has an icon colour of its own: ${JSON.stringify(colours)}`);
        // every entry draws exactly its page, and the crumb follows
        const seen = await crawl(o, async (r) => ({ r, p: await pageFacts(o) }));
        const wrong = [];
        for (const { r, p } of seen) {
          const okPage = p.pages === 1 && (r.kind === "booklet" ? p.kind === "booklet" : p.start === r.start) && p.title === r.label;
          const okCrumb = p.crumb.length === r.depth + 1 && p.crumb[p.crumb.length - 1].cur === "true" && p.crumb.filter(x => x.cur === "true").length === 1;
          const okNav = p.current.length === 1 && p.current[0] === r.label;
          if (!(okPage && okCrumb && okNav)) wrong.push({ label: r.label, depth: r.depth, page: [p.pages, p.kind, p.start, p.title], crumb: p.crumb.map(x => x.t), current: p.current });
        }
        c.ok(seen.length === rows.length - 1 && wrong.length === 0, `${rel}: a press on each of the ${seen.length} entries after the settings draws one page, that part's own, with its name as the title; the trail names every level down to it (its last item the current one) and the navigator marks that entry current${wrong.length ? "; wrong: " + JSON.stringify(wrong.slice(0, 3)) : ""}`);
        // the settings entry opens the front matter in place
        await leftTab(o, "outline");
        await o.page.locator(DV + " .booklet-design-nav-item[data-kind='settings']").click(); await idle(o);
        const sp = await pageFacts(o);
        c.ok(sp.editBox && /^---/.test(sp.area || "") && /^booklet:/m.test(sp.area || "") && /Settings/.test(sp.what || ""), `${rel}: the Settings entry opens the booklet's front matter in the editor in place (the page says "${sp.what}", the box starts ${JSON.stringify((sp.area || "").slice(0, 30))})`);
        await blurFocus(o); await o.page.keyboard.press("Escape"); await idle(o);
        // a click on the first crumb goes back to the booklet's page
        await goNav(o, rows.find(r => r.level !== "booklet" && r.kind !== "settings" && r.depth >= 1).kind, rows.find(r => r.level !== "booklet" && r.kind !== "settings" && r.depth >= 1).start);
        await o.page.locator(`${DV} .booklet-design-crumb button`).first().click(); await idle(o);
        const back = await pageFacts(o);
        c.ok(back.kind === "booklet" && back.crumb.length === 1, `${rel}: a click on the first crumb draws the booklet's own page again (${back.kind}, trail of ${back.crumb.length})`);
        c.ok(sha(f) === before, `${rel}: drawing every page and the settings, and selecting in them, wrote nothing (sha256 of the note unchanged)`);
        // screenshots: the booklet's page, then the deepest page with blocks, in light and dark
        await shot(o, "page-" + tag + "-booklet-light");
        const deep = seen.filter(x => x.p.blocks > 0).sort((a, b) => b.p.blocks - a.p.blocks)[0];
        if (deep) {
          await goNav(o, deep.r.kind, deep.r.start === "" ? undefined : deep.r.start);
          await o.evaluate(() => { app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.querySelector(".booklet-design-scroll").scrollTop = 0; });
          await sleep(300);
          await shot(o, "page-" + tag + "-page-light");
          await o.evaluate(() => { const s = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.querySelector(".booklet-design-scroll"); s.scrollTop = s.scrollHeight * 0.4; });
          await sleep(300);
          await shot(o, "page-" + tag + "-mid-light");
          await o.setScheme("dark"); await sleep(400);
          await shot(o, "page-" + tag + "-mid-dark");
          await o.evaluate(() => { app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.querySelector(".booklet-design-scroll").scrollTop = 0; });
          await sleep(300);
          await shot(o, "page-" + tag + "-page-dark");
          await o.setScheme("light"); await sleep(300);
        }
      }
      // inert drawings of every common kind, on Every kind (its pages, one after the other)
      {
        const f = path.join(vault, EVERY), before = sha(f), t = text(f);
        await openDesign(o, EVERY);
        const pages = await crawl(o, async r => ({ r, blocks: await blocksOf(o) }));
        const kindAt = start => (/^> \[!(\w+)/.exec(t.split("\n")[+start]) || [])[1] || "?";
        const byKind = {};
        for (const { blocks } of pages) for (const b of blocks) if (b.kind === "question") (byKind[kindAt(b.start)] = byKind[kindAt(b.start)] || []).push(b);
        for (const k of ["choice", "multi", "matrix", "lines", "scale", "date"]) {
          const x = (byKind[k] || [])[0];
          c.ok(!!x && x.drawn && x.sample && x.inert && x.live === 0 && !x.pre, `a ${k} question is drawn as a reader sees it (${x ? x.controls : 0} controls in an inert drawing, none live, no Markdown code in the block)`);
        }
        c.info("every question kind on Every kind and how the block shows it: " + JSON.stringify(Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.map(x => (x.sample ? "drawn" : x.card ? "card" : "?"))]))));
        // nothing live: a real click on a drawn choice button, then the keyboard
        await goNav(o, "activity", lineOf(t, "[!activity|kinds"));
        const btn = await o.evaluate(() => { const b = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.querySelector(".booklet-design-block[data-kind='question'] .booklet-sample button"); b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: b.textContent.trim() }; });
        await sleep(300);
        const hit = await o.evaluate(p => { const e = document.elementFromPoint(p.x, p.y); return { inSample: !!e.closest(".booklet-sample"), box: !!e.closest(".booklet-design-block") }; }, btn);
        c.ok(!hit.inSample && hit.box, `the point on a drawn button (${btn.text}) belongs to the block under the drawing, not to the drawing (pointer events are off)`);
        await o.page.mouse.click(btn.x, btn.y); await sleep(500);
        const st = await state(o);
        c.ok(sha(f) === before && /^question@/.test(st.selected || "") && st.editBox, `a real click on the drawn button "${btn.text}" selected its block (${st.selected}) and opened it in place for editing, and wrote nothing: the note's sha256 is unchanged`);
        const focusOnSample = await o.evaluate(() => { const b = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.querySelector(".booklet-sample button, .booklet-sample input, .booklet-sample textarea"); b.focus(); return !!document.activeElement.closest(".booklet-sample"); });
        c.ok(!focusOnSample, "a script's focus() on a control inside a drawing (or inside the editor's preview) does not take the focus (the inert attribute holds in Obsidian's own browser)");
        const hits = [];
        for (let i = 0; i < 90; i++) { await o.page.keyboard.press("Tab"); const e = await o.evaluate(() => { const a = document.activeElement; return { inSample: !!(a && a.closest(".booklet-sample")), tag: a && a.tagName }; }); if (e.inSample) hits.push(i); }
        c.ok(hits.length === 0, "90 presses of Tab walk the view and the page and never stop on a control of a drawing (" + hits.length + " stops)");
        c.ok(sha(f) === before, "90 presses of Tab wrote nothing");
        // keys with the focus on the page itself: first the editor is closed (nothing was changed in it), then the keys go to the selected block
        await o.page.locator(block("question", st.selected.split("@")[1]) + " .booklet-design-textarea").focus().catch(() => {});
        await o.page.keyboard.press("Escape"); await sleep(300);
        await blurFocus(o);
        for (const k of ["Space", "ArrowRight", "ArrowDown", "1", "2", "a", "Backspace", "Enter", "Escape"]) { await o.page.keyboard.press(k); await sleep(80); }
        await idle(o);
        c.ok(sha(f) === before, "keys with the focus on the page (Space, arrows, digits, a letter, Backspace, Enter on the selected block, Escape) wrote nothing: the note's sha256 is unchanged");
      }
      // the cards for what is not drawn, the reading callouts and the as-written cards
      {
        await openDesign(o, CHECKIN);
        const ci = (await crawl(o, async r => ({ r, blocks: await blocksOf(o) }))).flatMap(x => x.blocks);
        const t = text(path.join(vault, CHECKIN)), lineText = b => t.split("\n")[+b.start];
        const widgets = ci.filter(b => b.kind === "question" && /^> \[!widget/.test(lineText(b))), each = ci.filter(b => b.kind === "question" && /each:/.test(lineText(b)));
        c.ok(widgets.length === 2 && widgets.every(b => !b.sample && !b.drawn && b.card && /later beta/.test(b.card.note) && !b.pre && b.card.art), `Check-in: the two widgets are friendly cards with a picture, their kind in words and the line "drawn in a later beta", not drawings and not Markdown code: ${JSON.stringify(widgets.map(b => b.card))}`);
        c.ok(each.length >= 1 && each.every(b => !b.sample && b.card && /later beta/.test(b.card.note) && !b.pre), `Check-in: a question asked for each feeling picked is a friendly card too (${each.length}): ${JSON.stringify(each.map(b => b.card))}`);
        await openDesign(o, READING);
        const rs = (await crawl(o, async r => ({ r, blocks: await blocksOf(o) }))).flatMap(x => x.blocks);
        const kinds = rs.flatMap(b => b.callouts), icons = rs.reduce((n, b) => n + b.calloutIcons, 0);
        c.ok(["diff", "law", "opinion", "tip"].every(k => kinds.includes(k)) && icons === kinds.length && rs.filter(b => b.callouts.length).every(b => b.rendered && b.live === 0), `Reading and steps: reading callouts are drawn as Obsidian draws callouts, inside an inert drawing (kinds ${kinds.join(", ")}; ${icons} of ${kinds.length} with their icon)`);
        await openDesign(o, CARDS);
        const cd = (await crawl(o, async r => ({ r, blocks: await blocksOf(o) }))).flatMap(x => x.blocks);
        const as = cd.filter(b => b.written), lt = cd.filter(b => b.kind === "question" && /^> \[!listen/.test(text(path.join(vault, CARDS)).split("\n")[+b.start]));
        c.ok(as.length >= 1 && as.some(b => /> \[!bad/.test(b.written.pre)), `Cards: text the plugin cannot read is shown exactly as written, with a line saying so: ${JSON.stringify(as.map(b => b.written))}`);
        const media = await o.evaluate(() => app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.querySelectorAll("audio, video, iframe, source").length);
        c.ok(lt.length === 1 && lt[0].card && /later beta/.test(lt[0].card.note) && !lt[0].pre && media === 0, `Cards: a listen question is a friendly card ("${lt[0] && lt[0].card && lt[0].card.kind}", "${lt[0] && lt[0].card && lt[0].card.note}") with no player: no media element is in the view (${media}) and no Markdown code`);
        await goNav(o, "activity", lineOf(text(path.join(vault, CARDS)), "[!activity|a"));
        await shot(o, "cards-light");
      }
    });
    return c;
  }


  /* ================= CHECK 66 ================= */
  const EMPTYM = "Empty module.booklet.md";
  const EMPTYM_TEXT = `---
booklet: "0.20"
id: booklet-test/empty-module
title: Empty module
lang: en
---

> [!module|m] A module with nothing in it

> [!module|m end]
`;
  /** The Add tab as drawn: the Common row, the groups in order with what each holds, and every tile. */
  const paletteFacts = o => o.evaluate(() => {
    const el = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl;
    const tiles = [...el.querySelectorAll(".booklet-design-tile")];
    return {
      tablist: !!el.querySelector(".booklet-design-tabs[role='tablist']"), tabs: [...el.querySelectorAll(".booklet-design-tabs [role='tab']")].map(t => t.textContent + ":" + t.getAttribute("aria-selected")),
      panel: !!el.querySelector(".booklet-design-pane[role='tabpanel']"),
      chips: [...el.querySelectorAll(".booklet-design-commonchip")].map(b => ({ name: b.textContent, piece: b.getAttribute("data-piece") })),
      groups: [...el.querySelectorAll(".booklet-design-pal-group")].map(g => ({ id: g.getAttribute("data-group"), open: g.classList.contains("is-open"), expanded: g.querySelector(".booklet-design-pal-head").getAttribute("aria-expanded"), tiles: g.querySelectorAll(".booklet-design-tile").length, keys: g.querySelector(".booklet-design-pal-keys").textContent })),
      tiles: tiles.map(t => ({ piece: t.getAttribute("data-piece"), name: t.getAttribute("aria-label"), label: (t.querySelector(".booklet-design-tile-label") || {}).textContent, art: !!t.querySelector(".booklet-design-tile-art svg"), artIcon: t.querySelector(".booklet-design-tile-art").classList.contains("is-icon"), key: (t.querySelector(".booklet-design-tile-key") || {}).textContent || null, pressed: t.getAttribute("aria-pressed"), disabled: t.getAttribute("aria-disabled"), why: t.getAttribute("title") || "", draggable: t.getAttribute("draggable"), group: t.closest(".booklet-design-pal-group").getAttribute("data-group") })),
      where: (el.querySelector(".booklet-design-where") || {}).textContent, pops: el.querySelectorAll(".booklet-design-samplepop").length,
    };
  });
  const openGroups = async o => { for (const g of ["questions", "reading", "structure", "views-data"]) { const open = await o.evaluate(g => document.querySelector(".workspace-leaf.mod-active .booklet-design-pal-group[data-group='" + g + "']").classList.contains("is-open"), g); if (!open) { await o.page.locator(`${DV} .booklet-design-pal-group[data-group='${g}'] .booklet-design-pal-head`).click(); await sleep(120); } } };
  const slotIds = o => o.evaluate(() => [...app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.querySelectorAll(".booklet-design-slot")].map(s => s.getAttribute("data-slot")));
  /** A real drag with the mouse: the tile picked up, the "+" found again once the page has lit its places, then let go over it. */
  async function dragTile(o, tileSel, slotSel, log) {
    const m = o.page.mouse;
    await o.evaluate(() => { window.__drag = []; if (!window.__dragOn) { window.__dragOn = true; for (const t of ["dragstart", "dragover", "drop", "dragend"]) document.addEventListener(t, e => window.__drag.push(t + ":" + String(e.target.className && e.target.className.baseVal === undefined ? e.target.className : "svg").slice(0, 30)), true); } });
    await o.page.locator(tileSel).scrollIntoViewIfNeeded();
    await o.page.locator(slotSel).evaluate(e => e.scrollIntoView({ block: "center" })); // in the middle of the page: near an edge the browser scrolls it by itself during a drag
    const tb = await o.page.locator(tileSel).boundingBox();
    await m.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await m.down();
    await m.move(tb.x + tb.width / 2 + 10, tb.y + tb.height / 2 + 10, { steps: 5 });
    await sleep(300);
    // the places light up (they grow a little), so the one wanted can have moved out of sight: scroll it back before aiming
    await o.page.locator(slotSel).evaluate(e => e.scrollIntoView({ block: "center" }));
    const sb = await o.page.locator(slotSel).boundingBox();
    await m.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 15 });
    // the spot shows it takes the drop (is-over) while the pointer moves over it: sampled after each small move
    let over = false;
    for (let k = 1; k <= 4; k++) { await m.move(sb.x + sb.width / 2 + k, sb.y + sb.height / 2 + (k % 2), { steps: 2 }); await sleep(80); over = over || await o.evaluate(sel => document.querySelector(sel).classList.contains("is-over"), slotSel); }
    await m.up();
    if (log) log.over = over;
    await sleep(300);
    if (log) log.events = (await o.evaluate(() => window.__drag)).filter((e, i, a) => i === 0 || e !== a[i - 1]).join(" ");
  }
  const PALETTE_ORDER = "questions,reading,structure,views-data";
  async function check66() {
    const c = new Check(66, "the Add tab (a Common row of six, four foldable groups, 57 tiles each lit or greyed with its reason, a sample only on hover), a \"+\" first then a tile, a tile first then a lit \"+\", a tile dragged to a \"+\", only legal pieces, the hotkeys with the real keyboard (letters, status line, Enter, Esc, silent in a field, Obsidian's own keys, a user's own hotkey, the palette commands) and the tiles' icon names on this Obsidian");
    await withApp("c66", async (o, vault) => {
      put(vault, EMPTYM, EMPTYM_TEXT);
      const file = path.join(vault, EVERY), t0 = text(file);
      const KINDS = lineOf(t0, "[!activity|kinds"), FRUIT = lineOf(t0, "[!choice|fruit]"), TOOLS = lineOf(t0, "[!multi|tools"), PROSE = KINDS + 2;
      await openDesign(o, EVERY);
      // ---- the Add tab: a tab list, the Common row, four groups, 57 tiles
      await goNav(o, "activity", KINDS);
      await leftTab(o, "add");
      let p = await paletteFacts(o);
      c.ok(p.tablist && p.panel && p.tabs.join() === "Outline:false,Add:true", `the left column is a tab list of two tabs, Outline and Add, with Add selected and a tab panel: ${p.tabs.join(" ")}`);
      c.ok(p.chips.length === 6 && p.chips.map(x => x.name).join() === "Choice,Text,Scale,Tip,Image,Page", `the Common row holds six chips, in order: ${p.chips.map(x => x.name).join(", ")}`);
      c.ok(p.groups.map(g => g.id).join() === PALETTE_ORDER && p.groups.map(g => g.keys).join("|") === "q|r|s|v d", `four groups in the order Questions, Reading aids, Structure, Views and data, each head with its letters: ${p.groups.map(g => g.id + " " + g.keys).join(" | ")}`);
      c.ok(p.groups.find(g => g.id === "questions").open && p.groups.find(g => g.id === "questions").tiles >= 10 && p.groups.filter(g => g.id !== "questions").every(g => !g.open && g.expanded === "false" && g.tiles === 0), `Questions is open to begin with (${p.groups[0].tiles} tiles) and the other three are folded with no tile drawn: ${JSON.stringify(p.groups.map(g => [g.id, g.expanded, g.tiles]))}`);
      await openGroups(o); p = await paletteFacts(o);
      c.ok(p.tiles.length === 57, `with every group open the palette holds 57 tiles (${p.tiles.length}: ${p.groups.map(g => g.id + " " + g.tiles).join(", ")})`);
      const noArt = p.tiles.filter(t => !t.art).map(t => t.piece), noKey = p.tiles.filter(t => !t.key).map(t => t.name), badAttr = p.tiles.filter(t => t.pressed !== "false" || !["true", "false"].includes(t.disabled) || t.draggable !== "true" || !t.label).map(t => t.name);
      c.ok(noArt.length === 0 && badAttr.length === 0 && JSON.stringify(noKey) === JSON.stringify(["Words"]), `every tile has its picture, its name, aria-pressed and aria-disabled, and can be dragged; every tile but the plain Words has its hotkey letters as a badge (no picture: ${JSON.stringify(noArt)}; wrong attributes: ${JSON.stringify(badAttr)}; no badge: ${JSON.stringify(noKey)})`);
      c.ok(p.tiles.filter(t => t.key).every(t => /^[a-z](?: [a-z0-9])+$/.test(t.key)), `a badge is the group's letter and the piece's letters, spaced: e.g. ${p.tiles.filter(t => t.key).slice(0, 4).map(t => t.name + " " + t.key).join(", ")}`);
      await shot(o, "add-tab-light");
      // ---- lit and greyed, with the reason, on an activity's page; nothing picked, nothing chosen
      const off = p.tiles.filter(t => t.disabled === "true"), on = p.tiles.filter(t => t.disabled === "false");
      const name = n => p.tiles.find(t => t.name === n);
      c.ok(name("Choice").disabled === "false" && name("Text").disabled === "false" && name("Page").disabled === "false" && off.map(t => t.name).sort().join() === "Front matter,Notice", `on an activity's page a question's tile is lit, and only Front matter (the note has properties) and Notice (a module's) are greyed (${on.length} lit, ${off.length} greyed: ${off.map(t => t.name).join(", ")}); Module and Activity are lit too, for the "+" at the end of the page`);
      c.ok(off.every(t => t.why.length > 15) && on.every(t => t.why === ""), `every greyed tile carries the format's reason as its title and every lit one carries none; e.g. Notice: ${JSON.stringify(name("Notice").why)}`);
      let st = await state(o);
      c.ok(st.lit === 0 && st.armed.length === 0 && st.target === null && st.banner === null, "with nothing picked and no \"+\" chosen no place is lit and no banner shows");
      await o.page.locator(tile("Structure - notice.md")).click({ force: true }); await sleep(300); // aria-disabled: Playwright would wait for it to be enabled; force still sends the real mouse press
      st = await state(o);
      c.ok(/cannot go here/.test(st.status) && st.armed.length === 0 && st.lit === 0 && text(file) === t0, `a press on a greyed tile says why in the status line (${JSON.stringify(st.status.slice(0, 120))}), picks nothing and writes nothing`);
      // ---- a sample of the real piece, only on hover
      c.ok(p.pops === 0 && (await o.page.locator(DV + " .booklet-design-samplepop").count()) === 0, "no sample is drawn until a tile is hovered");
      await o.page.locator(tile("Q - choice.md")).hover();
      await o.page.waitForSelector(DV + " .booklet-design-samplepop", { timeout: 3000 });
      const pop = await o.evaluate(() => { const e = document.querySelector(".workspace-leaf.mod-active .booklet-design-samplepop"), s = e.querySelector(".booklet-sample"); return { name: (e.querySelector(".booklet-design-samplepop-name") || {}).textContent, drawn: !!s, inert: !!s && s.hasAttribute("inert"), live: s ? [...s.querySelectorAll("button, input, textarea, select")].filter(x => !x.disabled && !x.closest("[inert]")).length : -1, md: !!e.querySelector("pre"), right: Math.round(e.getBoundingClientRect().right), w: window.innerWidth }; });
      c.ok(pop.name === "Choice" && pop.drawn && pop.inert && pop.live === 0 && !pop.md && pop.right <= pop.w, `after a moment on the Choice tile a sample of the real piece appears (a choice question drawn inert, nothing live, no Markdown code, on the screen): ${JSON.stringify(pop)}`);
      await shot(o, "add-sample-light");
      await o.page.mouse.move(700, 20);
      await o.page.waitForFunction(() => !document.querySelector(".workspace-leaf.mod-active .booklet-design-samplepop"), null, { timeout: 2000 }).catch(() => {});
      c.ok((await o.page.locator(DV + " .booklet-design-samplepop").count()) === 0, "the sample goes when the pointer leaves the tile");
      await o.page.locator(tile("Structure - module.md")).hover();
      await o.page.waitForSelector(DV + " .booklet-design-samplepop", { timeout: 3000 });
      const pop2 = await o.evaluate(() => { const e = document.querySelector(".workspace-leaf.mod-active .booklet-design-samplepop"); return { art: !!e.querySelector(".booklet-design-samplepop-art svg"), md: !!e.querySelector("pre, code"), name: (e.querySelector(".booklet-design-samplepop-name") || {}).textContent }; });
      c.ok(pop2.art && !pop2.md && pop2.name === "Module", `a piece with no drawing (Module) shows its picture larger, never its Markdown: ${JSON.stringify(pop2)}`);
      await o.page.mouse.move(700, 20); await sleep(300);
      c.ok(text(file) === t0, "hovering wrote nothing");
      // ---- a "+" first: the Add tab opens with that spot chosen, tiles lit for it, one tap places at once
      const between = (a, b) => `${DV} .booklet-design-slot[data-slot$='|between|${a}|${b}']`;
      await leftTab(o, "outline");
      await o.page.locator(between(FRUIT, TOOLS)).scrollIntoViewIfNeeded();
      await o.page.locator(between(FRUIT, TOOLS)).click(); await sleep(400);
      st = await state(o);
      const w = await paletteFacts(o);
      c.ok(st.tab === "add" && st.target && /\|between\|\d+\|\d+$/.test(st.target) && /Adding here/.test(w.where || "") && /After “Which fruit would you pack\?”/.test(w.where || ""), `a click on the "+" between the fruit question and the tools question opens the Add tab with that spot chosen: the card says ${JSON.stringify(w.where)}`);
      const slotState = await o.evaluate(sel => { const s = document.querySelector(sel); return { pressed: s.getAttribute("aria-pressed"), target: s.classList.contains("is-target"), words: s.querySelector(".booklet-design-slot-words").textContent, label: s.getAttribute("aria-label") }; }, between(FRUIT, TOOLS));
      c.ok(slotState.pressed === "true" && slotState.target && slotState.words === "Adding here", `the chosen "+" is marked (aria-pressed true, "${slotState.words}")`);
      await openGroups(o); p = await paletteFacts(o);
      c.ok(p.tiles.find(t => t.name === "Text").disabled === "false" && p.tiles.find(t => t.name === "Page").disabled === "false" && p.tiles.find(t => t.name === "Module").disabled === "true" && p.tiles.find(t => t.name === "Activity").disabled === "true" && p.tiles.every(t => (t.disabled === "true") === (t.why !== "")), "with a spot between two blocks chosen the tiles that may go there are lit (Text, Page) and the others greyed with their reason (Module and Activity, which go only after the page's last block, Notice, Front matter)");
      await shot(o, "add-plus-first-light");
      await o.page.locator(tile("Structure - module.md")).click({ force: true }); await sleep(250);
      st = await state(o);
      c.ok(/cannot go here/.test(st.status) && text(file) === t0 && st.target, "a press on a greyed tile with a spot chosen says why, writes nothing and keeps the spot");
      await o.page.locator(tile("Q - text.md")).click();
      let r = await waitDisk(file, tx => tx !== t0);
      let rg = placed(t0, r.text);
      const iText = r.text.indexOf("[!text|text-1]");
      c.ok(r.ok && rg.removed === "" && /^\s*> \[!text\|text-1\] [^\n]*\s*$/.test(rg.added) && iText > r.text.indexOf("[!choice|fruit]") && iText < r.text.indexOf("[!multi|tools"), `one tap on the Text tile puts the piece in at that spot: between the fruit and the tools questions, no line taken out, every other line as it was (put in at line ${rg.at + 1}: ${JSON.stringify(rg.added)})`);
      await idle(o); st = await state(o);
      c.ok(/^Added Text\./.test(st.status) && st.target === null && st.armed.length === 0 && /^question@/.test(st.selected || "") && !st.editBox && (await o.evaluate(() => document.activeElement.getAttribute("data-focus"))) === "block:" + st.selected, `after it the status says "${st.status}", the spot is let go, nothing is picked, the new block is selected with the focus on it (${st.selected}) and no editor opened`);
      const t1 = r.text;
      // ---- a tile first: lit spots, a banner, Put it back, a second press, Escape; an unlit spot refuses
      await leftTab(o, "add");
      const total = (await slotIds(o)).length;
      await o.page.locator(tile("Q - choice.md")).click(); await sleep(250);
      st = await state(o);
      c.ok(st.armed.join() === "Q - choice.md" && st.lit === total && st.banner && /^Choice is picked\./.test(st.banner) && st.banner.includes("Put it back"), `a press on the Choice tile picks it: it is pressed, every one of the page's ${total} "+" lights (${st.lit}) and a banner says ${JSON.stringify(st.banner)}`);
      await shot(o, "add-tile-first-light");
      await o.page.locator(DV + " .booklet-design-putback").click(); await sleep(200);
      st = await state(o);
      c.ok(st.armed.length === 0 && st.lit === 0 && st.banner === null && text(file) === t1, "Put it back lets the piece go: nothing lit, no banner, nothing written");
      await o.page.locator(tile("Q - choice.md")).click(); await sleep(150);
      await o.page.locator(tile("Q - choice.md")).click(); await sleep(150);
      st = await state(o);
      c.ok(st.armed.length === 0 && st.lit === 0, "a second press on the picked tile puts it back");
      await o.page.locator(tile("Q - choice.md")).click(); await sleep(150);
      await blurFocus(o); await o.page.keyboard.press("Escape"); await sleep(200);
      st = await state(o);
      c.ok(st.armed.length === 0 && st.lit === 0 && st.banner === null && text(file) === t1, "Escape lets a picked piece go, writes nothing");
      await o.page.locator(tile("Structure - page.md")).click(); await sleep(150);
      await o.page.locator(tile("Q - choice.md")).click(); await sleep(150);
      st = await state(o);
      c.ok(st.armed.join() === "Q - choice.md", "a second tile picked takes the place of the first (only one is picked)");
      const slots1 = await slotIds(o), startSlot = slots1.find(s => /\|start\|/.test(s));
      await o.page.locator(`${DV} .booklet-design-slot[data-slot='${startSlot}']`).scrollIntoViewIfNeeded();
      await o.page.locator(`${DV} .booklet-design-slot[data-slot='${startSlot}']`).click();
      r = await waitDisk(file, tx => tx !== t1); rg = placed(t1, r.text);
      c.ok(r.ok && rg.removed === "" && /\[!choice\|[\w-]+\]/.test(rg.added) && r.text.indexOf(rg.added.trim().split("\n")[0]) < r.text.indexOf("A made-up test note"), `a press on the lit "+" at the start of the page places the picked Choice there: one block put in before the page's words, nothing taken out (line ${rg.at + 1}: ${JSON.stringify(rg.added.slice(0, 60))})`);
      await idle(o); st = await state(o);
      c.ok(st.armed.length === 0 && st.lit === 0 && st.banner === null && /^Added Choice\./.test(st.status), `then nothing is picked and the status says "${st.status}"`);
      const t2 = r.text;
      // a picked piece with no lit spot: a press on a "+" says why and keeps the piece
      await leftTab(o, "add");
      await o.page.locator(tile("Structure - module.md")).click(); await sleep(200);
      st = await state(o);
      const modLit = await o.evaluate(() => [...document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-slot.is-lit")].map(s => s.getAttribute("data-slot")));
      c.ok(st.armed.length === 1 && modLit.length === 1 && /\|end\|/.test(modLit[0]), `a Module picked on an activity's page lights one spot only: the "+" after its last block (${JSON.stringify(modLit)})`);
      await o.page.locator(`${DV} .booklet-design-slot`).first().scrollIntoViewIfNeeded();
      await o.page.locator(`${DV} .booklet-design-slot`).first().click(); await sleep(300);
      st = await state(o);
      c.ok(/cannot go here/.test(st.status) && st.armed.length === 1 && text(file) === t2, `a press on a "+" that does not light says why (${JSON.stringify(st.status.slice(0, 100))}), keeps the piece picked and writes nothing`);
      await blurFocus(o); await o.page.keyboard.press("Escape"); await sleep(200);
      // ---- a tile dragged to a "+": a legal one places it; an illegal one takes nothing
      await leftTab(o, "add");
      const slots2 = await slotIds(o), endSlot = slots2.find(s => /\|end\|/.test(s));
      const dlog = {};
      await dragTile(o, tile("Q - text.md"), `${DV} .booklet-design-slot[data-slot='${endSlot}']`, dlog);
      r = await waitDisk(file, tx => tx !== t2); rg = placed(t2, r.text);
      c.ok(dlog.over === true && r.ok && rg.removed === "" && /\[!text\|text-\d+\]/.test(rg.added), `a Text tile dragged with the real mouse over the lit "+" at the end of the page (the spot takes the hover: ${dlog.over}; events ${dlog.events}) and dropped there places it: one block put in, nothing taken out (line ${rg.at + 1}: ${JSON.stringify(rg.added.slice(0, 50))})`);
      await idle(o); st = await state(o);
      c.ok(st.armed.length === 0 && st.lit === 0 && /^Added Text\./.test(st.status), `after the drop nothing is picked or lit (${JSON.stringify(st.status)})`);
      const t3 = r.text;
      await leftTab(o, "add");
      const dlog2 = {};
      const midSlot = (await slotIds(o)).find(s => /\|between\|/.test(s));
      await dragTile(o, tile("Structure - module.md"), `${DV} .booklet-design-slot[data-slot='${midSlot}']`, dlog2);
      await sleep(400);
      c.ok(dlog2.over === false && text(file) === t3, `a Module dragged over a "+" that may not take it (a place between two blocks) shows nothing there (hover ${dlog2.over}) and the drop writes nothing`);
      await idle(o); st = await state(o);
      c.ok(st.armed.length === 0 && st.lit === 0, "when the drag ends nothing stays picked or lit");
      // the Common row: a chip places like a tile
      await leftTab(o, "add");
      const cs = (await slotIds(o)).find(s => /\|between\|/.test(s));
      await o.page.locator(`${DV} .booklet-design-slot[data-slot='${cs}']`).scrollIntoViewIfNeeded();
      await o.page.locator(`${DV} .booklet-design-slot[data-slot='${cs}']`).click(); await sleep(300);
      await o.page.locator(chip("Q - scale.md")).click();
      r = await waitDisk(file, tx => tx !== t3);
      c.ok(r.ok && placed(t3, r.text).removed === "" && /\[!scale\|[\w-]+\]/.test(placed(t3, r.text).added), "a chip of the Common row (Scale) with a spot chosen places the piece at once, like a tile");
      await idle(o);
      // ---- legal pieces only: an empty module
      await openDesign(o, EMPTYM);
      await leftTab(o, "outline");
      await o.page.locator(DV + " .booklet-design-nav-item[data-kind='module']").first().click(); await idle(o);
      const em = await o.evaluate(() => { const m = document.querySelector(".workspace-leaf.mod-active .booklet-design-page .booklet-design-empty"); return m ? m.textContent : null; });
      c.ok(!!em && em.length > 10, "an empty module says what to add: " + JSON.stringify(em));
      await leftTab(o, "add"); await openGroups(o);
      const pe = await paletteFacts(o), nm = n => pe.tiles.find(t => t.name === n);
      const qOn = pe.tiles.filter(t => t.group === "questions" && t.disabled === "false").map(t => t.name);
      c.ok(qOn.every(n => /^Menu/.test(n)) && nm("Activity").disabled === "false" && nm("Page").disabled === "true" && /activity/i.test(nm("Page").why) && nm("Choice").disabled === "true", `in a module with no activity no question is lit (only the shared menu: ${qOn.join(", ")}), Activity is lit and Page is greyed with a reason that names an activity: ${JSON.stringify(nm("Page").why)}`);
      await shot(o, "add-empty-module-light");
      // ---- the nested hotkeys, with the real keyboard, on a fresh copy of Every kind
      fs.writeFileSync(file, t0);
      await openDesign(o, EVERY);
      await blurFocus(o);
      await o.page.keyboard.press("s"); await sleep(300);
      st = await state(o); p = await paletteFacts(o);
      c.ok(st.tab === "add" && /^Keys: s$/.test(st.status) && (await o.page.locator(DV + " .booklet-design-pal-group.is-keyed[data-group='structure']").count()) === 1 && p.groups.find(g => g.id === "structure").open, `the key "s" shows the Add tab with Structure marked and open, and the status line says "${st.status}"`);
      await shot(o, "keys-structure-light");
      await o.page.keyboard.press("m"); await sleep(300);
      st = await state(o);
      c.ok(st.armed.join() === "Structure - module.md" && st.status === "Keys: s m", `after s then m the Module tile is the one picked (${st.armed.join()}) and the status says "${st.status}"`);
      await o.page.keyboard.press("Enter");
      r = await waitDisk(file, tx => tx !== t0); rg = placed(t0, r.text);
      await idle(o); st = await state(o);
      c.ok(r.ok && rg.removed === "" && /> \[!module\|[^\]]*\]/.test(rg.added) && /> \[!module\|[^\]]* end\]/.test(rg.added) && /^Added Module\./.test(st.status) && st.armed.length === 0 && st.page.startsWith("booklet@"), `s, m, Enter adds a module: one block in with its opening and closing line, nothing taken out, the view stays on the booklet's page (a module is a card of it), nothing picked, the status says "${st.status}"`);
      const cardsNow = await o.evaluate(() => [...document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-card")].map(x => x.getAttribute("data-kind")));
      c.ok(cardsNow.includes("module"), `the new module is a card on the booklet's page: ${cardsNow.join(", ")}`);
      const k2 = r.text;
      await goNav(o, "activity", KINDS);
      await blurFocus(o);
      await o.page.keyboard.press("q"); await sleep(250);
      await o.page.keyboard.press("m"); await o.page.keyboard.press("Enter");
      r = await waitDisk(file, tx => tx !== k2); rg = placed(k2, r.text);
      await idle(o); st = await state(o);
      c.ok(r.ok && rg.removed === "" && r.text.split("[!matrix|").length === k2.split("[!matrix|").length + 1 && /^Added Matrix\./.test(st.status), `q, m, Enter adds a matrix at the legal place of the page, nothing taken out (status "${st.status}"; at line ${rg.at + 1})`);
      // Escape, filter, Backspace
      const k3 = r.text;
      await blurFocus(o);
      await o.page.keyboard.press("r"); await sleep(200);
      st = await state(o);
      await o.page.keyboard.press("Escape"); await sleep(250);
      const st2 = await state(o);
      c.ok(st.status === "Keys: r" && st2.status === "" && st2.armed.length === 0 && (await o.page.locator(DV + " .booklet-design-pal-group.is-keyed").count()) === 0 && text(file) === k3, "r then Escape: the keys were pending (\"Keys: r\"), now the status line is empty, nothing is picked or marked and nothing is written");
      await o.page.keyboard.press("q"); await sleep(200);
      await typeFast(o, "matrix"); await sleep(300);
      st = await state(o);
      c.ok(st.armed.length === 1 && /matrix/.test(st.armed[0]) && st.status === "Keys: q m a t r i x", `q then typing "matrix" narrows to the Matrix tile (${st.armed.join()}); the status says "${st.status}"`);
      await shot(o, "keys-filter-light");
      await o.page.keyboard.press("Escape"); await sleep(200);
      await o.page.keyboard.press("s"); await o.page.keyboard.press("Backspace"); await sleep(250);
      st = await state(o);
      c.ok(st.armed.length === 0 && (await o.page.locator(DV + " .booklet-design-pal-group.is-keyed").count()) === 0, `Backspace from a group goes back to the groups: nothing picked, no group marked (status ${JSON.stringify(st.status)})`);
      await o.page.keyboard.press("Escape"); await sleep(150);
      // a key is the field's in a words field and in the Markdown: nothing opens, nothing is picked
      const tF = text(file);
      const fruitAt = lineOf(tF, "[!choice|fruit]");
      await clickBlock(o, "question", fruitAt);
      const orig = await o.page.locator(TITLE_F).inputValue();
      await o.page.locator(TITLE_F).click();
      await o.page.keyboard.press("End");
      await typeFast(o, "sqmrvd");
      const typedIn = await o.page.locator(TITLE_F).inputValue();
      st = await state(o);
      c.ok(typedIn === orig + "sqmrvd" && !/^Keys/.test(st.status) && st.armed.length === 0, `typing s q m r v d in the block's title field goes into the field (${JSON.stringify(typedIn.slice(-8))}); no keys are pending and nothing is picked`);
      await o.page.locator(TITLE_F).fill(orig); await o.page.locator(TITLE_F).evaluate(e => e.blur()); await sleep(300);
      c.ok(text(file) === tF, "the field put back to what the note has and left: nothing is written (a field applies only when what is in it differs from the note)");
      await openMd(o);
      const mdOrig = await markdownOf(o);
      await o.page.locator(MD_AREA).click();
      await o.page.keyboard.press("Control+End");
      await typeFast(o, "qmsr");
      const areaVal = await markdownOf(o);
      st = await state(o);
      c.ok(areaVal === mdOrig + "qmsr" && !/^Keys/.test(st.status) && st.armed.length === 0, "in the Markdown section the letters q m s r are text, and open no keys");
      await o.page.locator(MD_AREA).fill(mdOrig); // put back: Esc applies what is typed, so the note must not be asked to take the letters
      await o.page.keyboard.press("Escape"); await sleep(400);
      st = await state(o);
      c.ok(!st.editBox && text(file) === tF, "Escape closes the block at once (what was typed was put back, so nothing is written)");
      // Obsidian's own keys and the palette commands
      await blurFocus(o);
      await o.page.keyboard.press("Control+p"); await sleep(500);
      const pal = await o.evaluate(() => ({ prompt: !!document.querySelector(".prompt") }));
      await typeFast(o, "design");
      const palText = await o.evaluate(() => ({ value: (document.querySelector(".prompt-input") || {}).value, results: [...document.querySelectorAll(".prompt-results .suggestion-item")].map(x => x.textContent).slice(0, 8), keys: /^Keys/.test((document.querySelector(".workspace-leaf.mod-active .booklet-design-status") || {}).textContent || "") }));
      c.ok(pal.prompt && palText.value === "design" && !palText.keys, `Ctrl+P still opens Obsidian's command palette in the Design view; letters typed there (design) go to its box and start no keys of ours: ${JSON.stringify(palText.results.slice(0, 6))}`);
      await o.page.keyboard.press("Escape"); await sleep(300);
      await o.page.keyboard.press("Control+o"); await sleep(500);
      const qs = await o.evaluate(() => !!document.querySelector(".prompt"));
      await o.page.keyboard.press("Escape"); await sleep(300);
      c.ok(qs, "Ctrl+O still opens the quick switcher");
      const cmds = await o.evaluate(() => { const ids = Object.keys(app.commands.commands).filter(k => k.startsWith("booklet:design-")); return ids.map(k => ({ id: k, name: app.commands.commands[k].name, hotkeys: (app.hotkeyManager.getDefaultHotkeys(k) || []).length, custom: (app.hotkeyManager.getHotkeys(k) || []).length })); });
      c.ok(cmds.length === 6 && cmds.every(x => x.hotkeys === 0 && x.custom === 0), "the six Design commands (add a part and one for each of the five groups) have no default hotkey: " + JSON.stringify(cmds.map(x => x.id)));
      await blurFocus(o);
      await o.page.keyboard.press("Control+p"); await sleep(400);
      await typeFast(o, "add a part"); await sleep(400);
      await o.page.keyboard.press("Enter"); await sleep(600);
      st = await state(o);
      c.ok(st.tab === "add" && (await o.evaluate(() => /pal-head|commonchip/.test(document.activeElement.className))), `the palette command "Add a part…" shows the Add tab with the focus on its first control (tab ${st.tab}, focus ${await o.evaluate(() => document.activeElement.className.slice(0, 40))})`);
      await o.page.keyboard.press("Control+p"); await sleep(400);
      await typeFast(o, "add from questions"); await sleep(400);
      await o.page.keyboard.press("Enter"); await sleep(500);
      st = await state(o);
      c.ok(/^Keys: q$/.test(st.status), `the palette command for one group ("add from Questions…") starts the keys on it: status ${JSON.stringify(st.status)}`);
      await o.page.keyboard.press("Escape"); await sleep(200);
      // ---- a user's own hotkey on the same letter (check 66 of the old view, carried over)
      await openDesign(o, EVERY);
      await goNav(o, "activity", KINDS);
      const side0 = await o.evaluate(() => app.workspace.leftSplit.collapsed);
      await o.evaluate(() => { app.hotkeyManager.setHotkeys("app:toggle-left-sidebar", [{ modifiers: [], key: "q" }]); app.hotkeyManager.bake(); });
      await blurFocus(o);
      await o.page.keyboard.press("q"); await sleep(500);
      const won = await o.evaluate(() => ({ keys: /^Keys: q$/.test((document.querySelector(".workspace-leaf.mod-active .booklet-design-status") || {}).textContent || ""), side: app.workspace.leftSplit.collapsed }));
      c.ok(won.keys !== (won.side !== side0), `a user's own hotkey (the bare key q, bound to "Toggle left sidebar") and the view's q: exactly one acts. Observed: the view's keys ${won.keys ? "started" : "did not start"} and the sidebar ${won.side !== side0 ? "toggled" : "did not toggle"}`);
      c.info("scope order, observed: " + (won.keys ? "the view's scope key beats the user's own hotkey on the same bare letter" : "the user's own hotkey beats the view's scope key"));
      await o.page.keyboard.press("Escape"); await sleep(200);
      if (won.side !== side0) await o.evaluate(() => app.workspace.leftSplit.collapse());
      // the same bare key in a text field: the field gets the letter; does the user's hotkey also run?
      const sideNow = await o.evaluate(() => app.workspace.leftSplit.collapsed);
      await clickBlock(o, "question", lineOf(text(file), "[!choice|fruit]"));
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.press("q"); await sleep(300);
      const inField = await o.evaluate(sel => ({ v: document.querySelector(sel).value, side: app.workspace.leftSplit.collapsed }), TITLE_F);
      c.info(`the user's bare-q hotkey while the block's title field has the focus: the field ${/q$/.test(inField.v) ? "gets the letter" : "does not get the letter"} and the sidebar ${inField.side !== sideNow ? "toggles too (Obsidian runs a user's own bare-letter hotkey even in a field; the plugin never takes a key from a field)" : "does not toggle"}`);
      await o.page.keyboard.press("Backspace"); await o.page.keyboard.press("Escape"); await sleep(300); // the letter taken out again, so nothing is owed when the block closes
      if ((await state(o)).editBox) await o.page.keyboard.press("Escape");
      if (inField.side !== sideNow) await o.evaluate(() => app.workspace.leftSplit.collapse());
      await o.evaluate(() => { app.hotkeyManager.setHotkeys("app:toggle-left-sidebar", []); app.hotkeyManager.bake(); });
      c.ok(text(file) === k3, "after the three parts were added by keys, everything else of this run (Escape, filter, a field typed in and put back, the Markdown section, Ctrl+P, Ctrl+O, the palette commands, a user's hotkey) wrote nothing: the note is as the additions left it");
      // ---- the tiles' icon names on this Obsidian: an icon that this Obsidian lacks falls back to a plain shape, never a hole
      await openDesign(o, EVERY);
      await leftTab(o, "add"); await openGroups(o);
      const icons = await o.evaluate(() => {
        const probe = n => { const v = app.workspace.activeLeaf.view; const el = v.addAction(n, "probe", () => {}); const has = !!el.querySelector("svg"); el.remove(); return has; };
        const want = { "Reading - copy button.md": "copy", "Reading - group (folded).md": "chevrons-up-down", "View - table (the reader adds and removes rows).md": "table-properties" };
        const all = [...document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-tile")].filter(t => t.querySelector(".booklet-design-tile-art").classList.contains("is-icon"));
        const lucide = t => { const s = t.querySelector(".booklet-design-tile-art svg"); return s ? ([...s.classList].find(c => /^lucide-/.test(c)) || "svg") : null; };
        return { named: Object.entries(want).map(([p, n]) => ({ piece: p, want: n, has: probe(n), drawn: lucide(document.querySelector(".workspace-leaf.mod-active .booklet-design-tile[data-piece='" + p + "']")) })), iconTiles: all.length, holes: all.filter(t => !t.querySelector(".booklet-design-tile-art svg")).map(t => t.getAttribute("data-piece")), plain: all.filter(t => ["lucide-shapes", "lucide-square"].includes(lucide(t))).map(t => t.getAttribute("data-piece") + "=" + lucide(t)), version: ((navigator.userAgent.match(/obsidian\/([\d.]+)/i) || [])[1] || "?") };
      });
      c.ok(icons.holes.length === 0 && icons.named.every(x => x.drawn), `every tile whose picture is an Obsidian icon (${icons.iconTiles} of them) has one on Obsidian ${icons.version}: no hole; the three newer names: ${JSON.stringify(icons.named)}`);
      c.info(`on Obsidian ${icons.version}: ${icons.named.map(x => x.want + (x.has ? " exists" : " is missing, drawn as " + x.drawn)).join("; ")}; icon tiles that fell back to a plain shape: ${JSON.stringify(icons.plain)}`);
    });
    return c;
  }


  /* ================= CHECK 67 ================= */
  /** A block's own lines as the note has them: from its first line to the line before the next blank one. */
  const blockText = (t, needle) => { const L = t.split("\n"), i = lineOf(t, needle); let j = i; while (j < L.length && L[j].trim() !== "") j++; return L.slice(i, j).join("\n"); };
  /** The note with the block that has `needle` taken out, and one blank line beside it (the one after it, or the one before at the end). */
  const withoutBlock = (t, needle) => { const L = t.split("\n"), i = lineOf(t, needle); let j = i; while (j < L.length && L[j].trim() !== "") j++; const after = L.slice(0, i).concat(L.slice(j + 1)), before = L.slice(0, Math.max(0, i - 1)).concat(L.slice(j)); return [after.join("\n"), before.join("\n")]; };
  /** The note with the block of `a` and the block of `b` (the next one, one blank line between) swapped. */
  const swapped = (t, a, b) => { const L = t.split("\n"), i = lineOf(t, a), k = lineOf(t, b); let m = k + 1; while (m < L.length && !L[m].startsWith("> [!")) m++; return L.slice(0, i).concat(L.slice(k, m), L.slice(i, k), L.slice(m)).join("\n"); };
  const undoBtn = o => o.page.locator(`${DV} .booklet-design-undo`);
  const redoBtn = o => o.page.locator(`${DV} .booklet-design-redo`);
  async function check67() {
    const c = new Check(67, "delete and move (the selected block's floating bar, a card's bar) with the count-and-ask dialog (Cancel has the focus, the counts shown, No writes nothing, Yes writes exactly the change); undo and redo by buttons and by Ctrl+Z; the in-place editor (settings rows change a draft, Save writes one line, Cancel, Esc twice, Ctrl+Enter, a draft kept, a note changed on disk meanwhile is refused as stale and the text kept); the navigator and the lines the reader cannot read; every write compared byte for byte; screenshots");
    await withApp("c67", async (o, vault) => {
      put(vault, CARDS, CARDS_TEXT);
      const every = path.join(vault, EVERY), kept = path.join(vault, KEPT);
      const E0 = text(every), K0 = text(kept);
      const KINDS = lineOf(E0, "[!activity|kinds");
      // ---------- Every kind: a delete that asks nothing, then undo and redo
      await openDesign(o, EVERY);
      await goNav(o, "activity", KINDS);
      const fruitBlock = blockText(E0, "[!choice|fruit]"), fruit = lineOf(E0, "[!choice|fruit]");
      c.ok(await undoBtn(o).isDisabled() && await redoBtn(o).isDisabled(), "before any change Undo and Redo are both off");
      c.ok((await o.page.locator(`${DV} .booklet-design-block .booklet-design-floatbar`).count()) === 0, "no block shows its floating bar until one is selected");
      await selectBlock(o, "question", fruit);
      const bar = await o.evaluate(sel => [...document.querySelector(sel).querySelectorAll("button")].map(b => ({ cls: b.className.replace("booklet-design-iconbutton ", ""), label: b.getAttribute("aria-label"), off: b.disabled, icon: !!b.querySelector("svg") })), block("question", fruit) + " > .booklet-design-floatbar");
      c.ok(bar.map(b => b.label).join() === "Move up,Move down,Edit as Markdown,Delete" && bar.every(b => b.icon), `the selected block's floating bar has Move up, Move down, Edit as Markdown and Delete, each with an icon and a name: ${JSON.stringify(bar.map(b => b.label + (b.off ? " (off)" : "")))}`);
      await shot(o, "bar-light");
      await o.page.locator(barBtn("question", fruit, "delete")).click();
      let r = await waitDisk(every, tx => tx !== E0);
      let rg = region(E0, r.text);
      const gonePair = withoutBlock(E0, "[!choice|fruit]");
      let st = await state(o);
      c.ok(r.ok && !st.modal && gonePair.includes(r.text), `Delete on a question that holds no kept data asks nothing and takes out exactly its ${fruitBlock.split("\n").length} lines (${JSON.stringify(fruitBlock.split("\n")[0])}) and one blank line beside them, nothing else (the whole note equals the old one without them)`);
      const E1 = r.text;
      await idle(o); st = await state(o);
      c.ok(/^Deleted /.test(st.status) && st.page.startsWith("activity@") && !st.editBox, `the status says "${st.status}" and the view stays on the page of the activity the block was in (${st.page})`);
      c.ok(await undoBtn(o).isEnabled() && await redoBtn(o).isDisabled(), "after the delete Undo is on and Redo is off");
      await undoBtn(o).click();
      r = await waitDisk(every, tx => tx !== E1);
      c.ok(r.ok && r.text === E0, "the Undo button gives back the note byte for byte (the whole file equals what it was before the delete)");
      await idle(o);
      await redoBtn(o).click();
      r = await waitDisk(every, tx => tx === E1);
      c.ok(r.ok && r.text === E1, "the Redo button deletes the block again, byte for byte as the first delete left the note");
      await idle(o);
      // the keys: focus is on a button, not in a field
      await blurFocus(o);
      await o.page.keyboard.press("Control+z");
      r = await waitDisk(every, tx => tx === E0);
      c.ok(r.ok && r.text === E0, "Ctrl+Z with no field focused undoes in this view: the note is as it was, byte for byte");
      await idle(o);
      await o.page.keyboard.press("Control+Shift+z");
      r = await waitDisk(every, tx => tx === E1);
      c.ok(r.ok && r.text === E1, "Ctrl+Shift+Z redoes it");
      await idle(o);
      // in a field the key is the field's: Ctrl+Z in the block's title field does not undo the delete
      const toolsAt = lineOf(E1, "[!multi|tools");
      await clickBlock(o, "question", toolsAt);
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("Control+z"); await sleep(500);
      c.ok(text(every) === E1, "Ctrl+Z while the block's title field has the focus is the field's own (the view undoes nothing: the note still has the delete)");
      await o.page.keyboard.press("Escape"); await sleep(300);
      await blurFocus(o);
      await o.page.keyboard.press("Control+z"); r = await waitDisk(every, tx => tx === E0); await idle(o);
      c.ok(r.ok, "and with the focus out of the box Ctrl+Z undoes it (the note is whole again)");

      // ---------- a move
      const tools = lineOf(E0, "[!multi|tools"), toolsBlock = blockText(E0, "[!multi|tools");
      await selectBlock(o, "question", tools);
      await o.page.locator(barBtn("question", tools, "down")).click();
      r = await waitDisk(every, tx => tx !== E0); rg = region(E0, r.text);
      const nextBlock = blockText(E0, "[!scale|sure") + "\n(and its list)";
      c.ok(r.ok && r.text === swapped(E0, "[!multi|tools", "[!scale|sure"), `Move down swaps the question with the one after it: the whole note equals the old one with the two blocks (${toolsBlock.split("\n").length} and ${nextBlock.split("\n").length} lines) in the other order, every other byte as it was; the change spans ${rg.removed.split("\n").length} lines`);
      const afterMove = r.text.split("\n"), ti = afterMove.findIndex(l => l.includes("[!multi|tools")), si = afterMove.findIndex(l => l.includes("[!scale|sure"));
      c.ok(si < ti, "after Move down the scale question comes before the multi (new line order: scale at " + (si + 1) + ", multi at " + (ti + 1) + ")");
      await idle(o); st = await state(o);
      c.ok(/^Moved /.test(st.status) && /^question@/.test(st.selected || ""), `the status says "${st.status}" and the moved block is still the selected one (${st.selected})`);
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); c.ok(r.ok, "Undo puts the two questions back, byte for byte"); await idle(o);
      // Move up on the first block of the page is off, the last one's Move down is off
      st = await state(o);
      await shot(o, "after-undo-of-move-light");
      c.ok(st.page === "activity@7", `after Undo of a move the view stays on the page it was on (the activity's page): it shows "${st.title}" (${st.page}), selected ${st.selected}`);
      if (st.page !== "activity@7") await goNav(o, "activity", 7);
      // Move up from the other block: the same swap
      { const scaleAt = lineOf(E0, "[!scale|sure");
        await selectBlock(o, "question", scaleAt);
        await o.page.locator(barBtn("question", scaleAt, "up")).click();
        r = await waitDisk(every, tx => tx !== E0);
        c.ok(r.ok && r.text === swapped(E0, "[!multi|tools", "[!scale|sure"), "Move up on the scale question swaps it with the multi before it: the whole note equals the old one with the two blocks in the other order, every other byte as it was");
        await idle(o);
        await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); c.ok(r.ok, "Undo puts them back, byte for byte"); await idle(o);
        if ((await state(o)).page !== "activity@7") await goNav(o, "activity", 7); }
      await selectBlock(o, "question", fruit);
      c.info("Move up on the first question of the activity (a paragraph stands above it, so it may go above that) is " + ((await o.page.locator(barBtn("question", fruit, "up")).isDisabled()) ? "off" : "on"));
      await o.page.keyboard.press("Escape");

      // ---------- the editor in place (stage 2b): no draft, no Save, no Cancel; every field applies when it is left, as one write and one step of Undo
      await clickBlock(o, "question", fruit);
      const lay = await o.evaluate(sel => { const box = document.querySelector(sel), a = document.activeElement, md = box.querySelector("details.booklet-design-edit-md"); return { title: (box.querySelector(".is-title") || {}).value, desc: (box.querySelector(".is-desc") || {}).value, focus: a && a.className, buttons: [...box.querySelectorAll("button")].map(x => x.textContent.trim() || x.getAttribute("aria-label")), preview: !!box.querySelector(".booklet-design-edit-previewhost"), mdOpen: md.open, summary: md.querySelector("summary").textContent, mark: !!box.querySelector(".booklet-design-edit-mark"), header: !!box.querySelector(".booklet-design-edit-title") }; }, block("question", fruit) + " .booklet-design-editbox");
      c.ok(lay.title === "Which fruit would you pack?" && lay.desc === "Pick one." && /is-title/.test(lay.focus || "") && !lay.mdOpen && lay.summary === "Markdown", `a press on a block opens it in place: the title and the description are fields holding the note's own words (${JSON.stringify([lay.title, lay.desc])}), the title has the focus, and the Markdown is a closed section named ${JSON.stringify(lay.summary)}`);
      c.ok(!lay.buttons.some(b => /^(Save|Cancel)$/.test(b)) && !lay.preview && !lay.mark && !lay.header, `there is no Save, no Cancel, no preview, no "Unsaved" mark and no "Editing:" header in the box (buttons: ${JSON.stringify(lay.buttons)})`);
      await shot(o, "editor-light");
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("Which fruit would you take?"); await o.page.keyboard.press("Enter");
      r = await waitDisk(every, tx => tx !== E0); await idle(o);
      c.ok(r.ok && linesDiffering(E0, r.text) === 1 && r.text.includes("> [!choice|fruit] Which fruit would you take?\n"), `Enter in the title field writes that block's opening line and no other line (${linesDiffering(E0, r.text)} line differs): ${JSON.stringify(region(E0, r.text))}`);
      st = await state(o);
      c.ok(st.editBox && /^Changed /.test(st.status) && st.selected === "question@" + fruit, `the block stays open and selected, and the status says "${st.status}"`);
      const E2 = r.text;
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      c.ok(r.ok, "one Undo takes that change back: the note is whole again, byte for byte (one change was one step)");
      await redoBtn(o).click(); r = await waitDisk(every, tx => tx === E2); await idle(o);
      c.ok(r.ok, "and one Redo makes it again, byte for byte");
      // a switch of the strip writes the moment it is pressed
      if (!(await state(o)).editBox) await clickBlock(o, "question", fruit);
      const sw = `${DV} .booklet-design-editbox .booklet-design-strip-item[data-field='open'] button[role=switch]`;
      await o.page.waitForSelector(sw, { timeout: 4000 });
      c.ok(await o.page.locator(sw).getAttribute("aria-checked") === "false", "the strip has the flag \"open\" as a switch, off");
      await o.page.locator(sw).click();
      r = await waitDisk(every, tx => tx !== E2); await idle(o);
      c.ok(r.ok && linesDiffering(E2, r.text) === 1 && /> \[!choice\|fruit open\] Which fruit would you take\?/.test(r.text) && await o.page.locator(sw).getAttribute("aria-checked") === "true", `the switch writes at once: the flag is added to the opening line only, and the switch reads on: ${JSON.stringify(r.text.split("\n")[fruit])}`);
      await undoBtn(o).click(); await waitDisk(every, tx => tx === E2); await idle(o);
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      c.ok(r.ok, "two Undos take both changes back: the note is whole again, byte for byte");
      await closeAll(o);

      // ---------- the Markdown section of the box: closed, opened by one press, applied when left
      await clickBlock(o, "question", fruit);
      await openMd(o);
      let mdv = await markdownOf(o);
      c.ok(mdv === fruitBlock, "one press on the Markdown summary opens the block's own lines in a text box, and holds nothing but those lines");
      await shot(o, "editor-md-light");
      const rowsBefore = await o.evaluate(sel => document.querySelectorAll(sel + " .booklet-design-rows [data-key]").length, block("question", fruit));
      await o.page.locator(MD_AREA).click(); await o.page.keyboard.press("Control+End"); await o.page.keyboard.type("\n- [ ] Cherry"); await sleep(250);
      c.ok(text(every) === E0, "typing in the Markdown writes nothing while the text area has the focus (it is applied when it is left, never at a key)");
      await o.page.locator(TITLE_F).click(); // leaving it
      r = await waitDisk(every, tx => tx !== E0); await idle(o);
      { const pl = placed(E0, r.text); c.ok(r.ok && pl.removed === "" && pl.added === "- [ ] Cherry" && r.text.split("\n").length === E0.split("\n").length + 1, `leaving the Markdown writes just that one line, nothing taken out (${JSON.stringify(pl)})`); }
      const rowsAfter = await o.evaluate(sel => document.querySelectorAll(sel + " .booklet-design-rows [data-key]").length, block("question", fruit));
      c.ok(rowsAfter > rowsBefore && await o.page.locator(MD_AREA).isVisible(), `the option rows follow the Markdown (${rowsBefore} controls, then ${rowsAfter}) and the section stays open`);
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      c.ok(r.ok, "Undo takes the added option back, byte for byte");
      await closeAll(o);
      // Esc with nothing typed closes at once; Esc after typing in the Markdown applies it and closes; Ctrl+Enter does the same
      await clickBlock(o, "question", fruit);
      await o.page.keyboard.press("Escape"); await sleep(300);
      st = await state(o);
      c.ok(!st.editBox && st.selected === "question@" + fruit && text(every) === E0, "Escape with nothing typed closes the block and leaves it selected, and writes nothing");
      await clickBlock(o, "question", fruit); await openMd(o);
      await o.page.locator(MD_AREA).click(); await o.page.keyboard.press("Control+End"); await o.page.keyboard.type("\n- [ ] Cherry"); await sleep(150);
      await o.page.keyboard.press("Escape");
      r = await waitDisk(every, tx => tx !== E0); await idle(o);
      st = await state(o);
      c.ok(r.ok && placed(E0, r.text).added === "- [ ] Cherry" && !st.editBox, `Escape after typing in the Markdown applies it (one line put in) and closes the block: nothing is thrown away, nothing is waiting`);
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      await clickBlock(o, "question", fruit);
      await o.page.locator(DESC_F).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("Pick any.");
      await o.page.keyboard.press("Control+Enter");
      r = await waitDisk(every, tx => tx !== E0); await idle(o);
      c.ok(r.ok && linesDiffering(E0, r.text) === 1 && r.text.includes("> Pick any.") && !(await state(o)).editBox, `Ctrl+Enter applies the typed description and closes the block: only the one changed line differs: ${JSON.stringify(region(E0, r.text))}`);
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      c.ok(r.ok, "Undo takes it back, byte for byte");
      // typed text is never lost: a press on a navigator entry applies it first
      await clickBlock(o, "question", fruit);
      await o.page.locator(DESC_F).click(); await o.page.keyboard.press("Control+End"); await o.page.keyboard.type(" Or none.");
      await goNav(o, "activity", lineOf(E0, "[!activity|shared"));
      r = await waitDisk(every, tx => tx !== E0); await idle(o);
      st = await state(o);
      c.ok(r.ok && r.text.includes("> Pick one. Or none.") && linesDiffering(E0, r.text) === 1 && st.page.startsWith("activity@") && !st.editBox, `another page drawn with words typed in a field applies them first (one line differs) and then draws that page (${st.page})`);
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      await goNav(o, "activity", KINDS);
      // typing in the Markdown while the note changes on disk meanwhile: held, in the box, with the reason; nothing of the other writer's is overwritten
      await clickBlock(o, "question", fruit); await openMd(o);
      await o.page.locator(MD_AREA).click(); await o.page.keyboard.press("Control+End"); await o.page.keyboard.type("\n- [ ] Mine"); await sleep(150);
      const external = E0.replace("> Pick one.\n- [ ] Apple", "> Pick several.\n- [ ] Apple");
      fs.writeFileSync(every, external);
      await o.page.waitForFunction(() => { const v = app.workspace.getLeavesOfType("booklet-design")[0].view; return /Pick several/.test(v.getViewData()); }, null, { timeout: 8000 }).catch(() => {});
      await sleep(400);
      await o.page.keyboard.press("Escape"); await sleep(700); // the first Esc: it cannot apply the typing, so it says so and the block stays open
      const stale = await o.evaluate(() => ({ status: (document.querySelector(".workspace-leaf.mod-active .booklet-design-status") || {}).textContent, area: (document.querySelector(".workspace-leaf.mod-active .booklet-design-textarea") || {}).value || null, open: !!document.querySelector(".workspace-leaf.mod-active .booklet-design-editbox") }));
      c.ok(text(every) === external && /could not be applied/i.test(stale.status || "") && stale.open && !!stale.area && stale.area.includes("- [ ] Mine"), `text typed while the note changed on disk is not applied: the note is as the other writer left it, the status says "${stale.status}", the block stays open and the typed text is still in the Markdown`);
      c.ok((await state(o)).editBox, "the first Escape with held text keeps the block open (and says why)");
      await o.page.keyboard.press("Escape"); await sleep(400);
      c.ok(!(await state(o)).editBox && text(every) === external, "the second Escape closes it: nothing written over the other writer's text");
      fs.writeFileSync(every, E0); await sleep(800);
      await idle(o);

      // ---------- the navigator
      await leftTab(o, "outline");
      const entries = await navFacts(o);
      c.ok(entries.length >= 6 && entries[0].kind === "settings", `the navigator lists the booklet's parts (${entries.length}) as buttons, the settings first: ${entries.slice(0, 4).map(x => x.label).join("; ")}`);
      const lastE = entries[entries.length - 1];
      await o.page.locator(DV + " .booklet-design-nav-item").last().click(); await idle(o);
      const jp = await pageFacts(o);
      c.ok(jp.title === lastE.label && jp.start === lastE.start && jp.current.join() === lastE.label && jp.crumb[jp.crumb.length - 1].t.includes(lastE.label), `a click on the navigator's last entry (${lastE.label}) draws that page, marks the entry current and ends the trail on it: ${JSON.stringify({ title: jp.title, start: jp.start, crumb: jp.crumb.map(x => x.t) })}`);
      // a fold: a container's caret folds its entries away and the page stays
      const fold = await o.evaluate(() => { const el = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl, car = el.querySelector(".booklet-design-nav-caret:not(.is-spacer)"), n0 = el.querySelectorAll(".booklet-design-nav-row").length; return { has: !!car, n0, label: car && car.getAttribute("aria-label") }; });
      if (fold.has) {
        await o.page.locator(DV + " .booklet-design-nav-caret:not(.is-spacer)").first().click(); await sleep(300);
        const n1 = await o.evaluate(() => app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.querySelectorAll(".booklet-design-nav-row").length);
        await o.page.locator(DV + " .booklet-design-nav-caret:not(.is-spacer)").first().click(); await sleep(300);
        const n2 = await o.evaluate(() => app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.querySelectorAll(".booklet-design-nav-row").length);
        c.ok(n1 < fold.n0 && n2 === fold.n0 && text(every) === E0, `a caret (${JSON.stringify(fold.label)}) folds the entries under it (${fold.n0} rows, ${n1} folded, ${n2} unfolded) and writes nothing`);
      }

      // ---------- Kept records: the count-and-ask dialog
      await openDesign(o, KEPT);
      const colour = lineOf(K0, "[!choice|colour]"), colourBlock = blockText(K0, "[!choice|colour]"), recordsAt = K0.indexOf("%%\n> [!records");
      await goNav(o, "activity", lineOf(K0, "[!activity|warm-up"));
      await selectBlock(o, "question", colour);
      await o.page.locator(barBtn("question", colour, "delete")).click();
      c.ok(await waitModal(o, true), "Delete on a question with a kept answer opens a dialog");
      const m1 = await modalInfo(o);
      c.ok(m1 && /Delete this question\?/.test(m1.title) && m1.buttons.join() === "Delete,Cancel" && m1.focus === "Cancel" && m1.focusIsButton, `the dialog is titled ${JSON.stringify(m1 && m1.title)}, has the buttons ${JSON.stringify(m1 && m1.buttons)} and the focus is on ${JSON.stringify(m1 && m1.focus)}`);
      c.ok(m1 && /\d/.test(m1.text) && /colour/i.test(m1.text) && /kept/i.test(m1.text) && /lines?\)/.test(m1.text), "it says what is deleted, how many lines go with it, and what kept data no longer matches, with counts: " + JSON.stringify((m1 && m1.text || "").replace(/\s+/g, " ").slice(0, 420)));
      await shot(o, "confirm-light");
      await clickModal(o, "Cancel");
      st = await state(o);
      c.ok(text(kept) === K0 && /Nothing was changed/.test(st.status), `No (Cancel) writes nothing: the note is byte for byte as it was; the status says "${st.status}"`);
      await o.page.locator(barBtn("question", colour, "delete")).click(); await waitModal(o, true);
      await o.page.keyboard.press("Escape"); await waitModal(o, false); await sleep(300);
      c.ok(text(kept) === K0, "Escape in the dialog is a No: nothing written");
      await o.page.locator(barBtn("question", colour, "delete")).click(); await waitModal(o, true);
      await clickModal(o, "Delete");
      r = await waitDisk(kept, tx => tx !== K0);
      c.ok(r.ok && withoutBlock(K0, "[!choice|colour]").includes(r.text) && r.text.endsWith(K0.slice(recordsAt)), `Yes writes exactly the change: the question's ${colourBlock.split("\n").length} lines and one blank line beside them are taken out (the whole note equals the old one without them) and the records section is byte for byte what it was (kept answer and entries stay; ${K0.length - r.text.length} bytes removed)`);
      await idle(o);
      // the kept answer now matches nothing: the list says so
      await leftTab(o, "outline");
      await o.page.locator(`${DV} .booklet-design-leftovers summary`).click(); await sleep(200);
      const left = await o.evaluate(() => ({ count: document.querySelector(".workspace-leaf.mod-active .booklet-design-leftovers").dataset.count, text: document.querySelector(".workspace-leaf.mod-active .booklet-design-leftovers").innerText }));
      c.ok(+left.count >= 1 && /saved answer/i.test(left.text), `the list "Kept data that matches nothing now" counts the answer left behind (it gives the line of the kept data and the count, not the question's id) (${left.count}): ${JSON.stringify(left.text.replace(/\s+/g, " ").slice(0, 160))}`);
      await undoBtn(o).click(); r = await waitDisk(kept, tx => tx === K0); await idle(o);
      c.ok(r.ok, "Undo brings the question back and the note is byte for byte as it was");
      // a module with kept entries: its card on the booklet's page has its own bar; delete asks with the counts of its entries
      const walks = lineOf(K0, "[!module|walks]");
      await goNav(o, "booklet");
      await o.page.locator(cardBtn("module", walks, "delete")).click(); await waitModal(o, true);
      const m2 = await modalInfo(o);
      c.ok(m2 && /Delete this module\?/.test(m2.title) && /entr/i.test(m2.text) && m2.focus === "Cancel", `deleting the module Walks (two kept entries) from its card's own bar asks, with the focus on Cancel: ${JSON.stringify((m2 && m2.text || "").replace(/\s+/g, " ").slice(0, 380))}`);
      await clickModal(o, "Cancel");
      c.ok(text(kept) === K0, "No on the module's dialog writes nothing");
      // a move that asks?
      const walkLog = lineOf(K0, "[!activity|walk-log");
      await goNav(o, "module", walks);
      const downBtn = o.page.locator(cardBtn("activity", walkLog, "down"));
      c.ok(await downBtn.count() === 1 && await downBtn.isEnabled(), "on the module's page the card of the activity Log a walk has its own Move down");
      await downBtn.click(); await sleep(700);
      const mv = await modalInfo(o);
      if (mv) { c.info("Move down on the activity with kept entries asks: " + JSON.stringify(mv.text.replace(/\s+/g, " ").slice(0, 300))); await clickModal(o, "Cancel"); c.ok(text(kept) === K0, "Cancel on a move writes nothing"); }
      else { r = await waitDisk(kept, tx => tx !== K0); c.info("Move down on the activity with kept entries wrote at once (no dialog)"); await idle(o); await undoBtn(o).click(); await waitDisk(kept, tx => tx === K0); c.ok(text(kept) === K0, "the move undone: the note is byte for byte as it was"); await idle(o); }

      // ---------- the lines the reader cannot read
      await openDesign(o, CARDS);
      await leftTab(o, "outline");
      await o.page.locator(`${DV} .booklet-design-problems summary`).click(); await sleep(300);
      const prob = await o.evaluate(() => { const d = document.querySelector(".workspace-leaf.mod-active .booklet-design-problems"); return { count: d.dataset.count, summary: d.querySelector("summary").textContent, items: [...d.querySelectorAll(".booklet-design-jump")].map(b => ({ start: b.dataset.start, text: b.innerText })) }; });
      c.ok(+prob.count >= 2 && prob.items.length >= 2, `the list "${prob.summary}" names the lines the reader cannot read, each a button: ${JSON.stringify(prob.items.map(x => x.text.replace(/\s+/g, " ")).slice(0, 3))}`);
      await shot(o, "problems-light");
      const target = prob.items[0];
      await o.page.locator(`${DV} .booklet-design-problems .booklet-design-jump[data-start='${target.start}']`).click(); await sleep(500);
      const pj = await o.evaluate(() => { const n = document.querySelector(".workspace-leaf.mod-active .booklet-design-block.is-selected"); const r = n && n.getBoundingClientRect(), v = document.querySelector(".workspace-leaf.mod-active .booklet-design-scroll").getBoundingClientRect(); return { start: n && n.dataset.start, kind: n && n.dataset.kind, inView: !!r && r.top < v.bottom && r.bottom > v.top, focus: document.activeElement.className }; });
      c.ok(pj.start === target.start && pj.inView && /booklet-design-block/.test(pj.focus), `a click on a problem draws the page of its block, selects the block, brings it into view and puts the focus on it: ${JSON.stringify(pj)}`);
    });
    return c;
  }


  /* ================= CHECK 68 ================= */
  async function check68() {
    const c = new Check(68, "the same writes with the note also open in a Markdown pane: they go through that pane's editor (the vault's own write is not used), its buffer equals the file on disk afterwards, and text typed there and not yet saved is kept");
    await withApp("c68", async (o, vault) => {
      const every = path.join(vault, EVERY), E0 = text(every);
      await bookletNote(o, EVERY);
      await o.evaluate(() => { const ls = []; app.workspace.iterateRootLeaves(l => { ls.push(l); }); ls.forEach(l => l.detach()); });
      await sleep(300);
      await o.evaluate(async rel => { const leaf = app.workspace.getLeaf("tab"); await leaf.openFile(app.vault.getAbstractFileByPath(rel)); }, EVERY);
      if (!(await waitActiveType(o, "booklet", 15000)) && !(await waitActiveType(o, "booklet-design", 100)) && !(await waitActiveType(o, "markdown", 100))) throw new Error("the note did not open");
      await o.evaluate(async () => { await app.plugins.plugins.booklet.setMode(app.workspace.activeLeaf, "markdown"); });
      c.ok(await waitActiveType(o, "markdown", 8000), "the note is open in a Markdown pane");
      await openDesign(o, EVERY, "split", false);
      const types = await o.evaluate(() => { const t = []; app.workspace.iterateRootLeaves(l => { t.push(l.view.getViewType()); }); return t; });
      c.ok(types.includes("markdown") && types.includes("booklet-design"), "and the same note is open in a Design pane beside it: " + JSON.stringify(types));
      c.info("the Design pane beside the Markdown pane is " + await o.evaluate(() => Math.round(app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.clientWidth)) + " px wide: " + ((await state(o)).phone ? "the narrow layout (the left column is behind its menu button)" : "the wide layout"));
      await o.evaluate(() => { window.__proc = 0; const p = app.vault.process.bind(app.vault); app.vault.process = (...a) => { window.__proc++; return p(...a); }; });
      const md = () => o.evaluate(() => { const l = app.workspace.getLeavesOfType("markdown")[0]; return l.view.editor.getValue(); });
      const procs = () => o.evaluate(() => window.__proc);
      const agree = async (label, want) => {
        const r = await waitDisk(every, tx => want(tx));
        // the Markdown pane saves what it holds after a moment: wait for the disk to be what the buffer is
        const t = Date.now(); let b = await md(); while (Date.now() - t < 6000 && text(every) !== b) { await sleep(150); b = await md(); }
        c.ok(r.ok && text(every) === b, `${label}: the Markdown pane's buffer is the file on disk, byte for byte (${b.length} characters)`);
        return text(every);
      };
      const KINDS = lineOf(E0, "[!activity|kinds");
      await goNav(o, "activity", KINDS);
      const fruit = lineOf(E0, "[!choice|fruit]"), gonePair = withoutBlock(E0, "[!choice|fruit]");
      await selectBlock(o, "question", fruit);
      await o.page.locator(barBtn("question", fruit, "delete")).click();
      let t = await agree("Delete", tx => gonePair.includes(tx));
      c.ok(gonePair.includes(t), "the delete took out the question's lines and one blank line beside them: the whole note equals the old one without them");
      c.ok(await procs() === 0, `no write went through the vault's own write (vault.process called ${await procs()} times); they went through the Markdown pane's editor`);
      await idle(o);
      await undoBtn(o).click();
      t = await agree("Undo", tx => tx === E0);
      c.ok(t === E0, "Undo puts the note back byte for byte");
      await idle(o);
      // move
      const tools = lineOf(E0, "[!multi|tools");
      await selectBlock(o, "question", tools);
      await o.page.locator(barBtn("question", tools, "down")).click();
      t = await agree("Move down", tx => tx !== E0);
      c.ok(t === swapped(E0, "[!multi|tools", "[!scale|sure"), "Move down swaps the two questions and changes no other byte");
      await idle(o);
      await undoBtn(o).click(); t = await agree("Undo of the move", tx => tx === E0); await idle(o);
      { const stp = await state(o); if (stp.page !== "activity@" + lineOf(E0, "[!activity|kinds")) { c.info("after the Undo of the move the Design pane drew " + stp.page + " (the finding of check 67: the view leaves the activity page); going back by the navigator"); await goNav(o, "activity", lineOf(E0, "[!activity|kinds")); } }
      // the open block: a title typed and left by Enter is applied through the Markdown pane's editor too
      await clickBlock(o, "question", fruit);
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("Which fruit would you take?");
      c.ok(text(every) === E0 && (await md()) === E0, "typing in the title field writes nothing yet: the file and the Markdown pane's buffer are as they were");
      await o.page.keyboard.press("Enter");
      t = await agree("The title field's Enter", tx => tx !== E0); await idle(o);
      c.ok(linesDiffering(E0, t) === 1 && t.includes("> [!choice|fruit] Which fruit would you take?\n"), "the field changed that block's opening line and no other line (" + linesDiffering(E0, t) + " line differs)");
      c.ok(await procs() === 0, `the typed title too went through the Markdown pane's editor (vault.process called ${await procs()} times)`);
      await undoBtn(o).click(); t = await agree("Undo of the title", tx => tx === E0); await idle(o);
      // Ctrl+Enter in a words field: applied and closed, through the pane
      const fruitBlock = blockText(E0, "[!choice|fruit]");
      if (!(await state(o)).editBox) await clickBlock(o, "question", fruit);
      await o.page.locator(DESC_F).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("Pick any.");
      await o.page.keyboard.press("Control+Enter");
      t = await agree("The description's Ctrl+Enter", tx => tx !== E0); await idle(o);
      c.ok(linesDiffering(E0, t) === 1 && t.includes("> Pick any.") && !(await state(o)).editBox, "Ctrl+Enter applied the one line the user changed, no other, and closed the block");
      await undoBtn(o).click(); t = await agree("Undo of the description", tx => tx === E0); await idle(o);
      void fruitBlock;
      // text typed in the Markdown pane and not yet on disk
      const thoughts = lineOf(E0, "[!text|thoughts long]");
      await o.evaluate(n => { const ed = app.workspace.getLeavesOfType("markdown")[0].view.editor; const l = ed.getLine(n); ed.replaceRange(" (typed)", { line: n, ch: l.length }); }, thoughts);
      const typedAt = text(every) === E0; // not yet written: the Markdown pane saves after a moment
      await sleep(60);
      await selectBlock(o, "question", fruit);
      await o.page.locator(barBtn("question", fruit, "delete")).click();
      const typedWant = E0.split("\n").map((l, i) => i === thoughts ? l + " (typed)" : l).join("\n"), wantPair = withoutBlock(typedWant, "[!choice|fruit]");
      t = await agree("Delete after text was typed in the Markdown pane", tx => wantPair.includes(tx));
      c.ok(wantPair.includes(t) && t.includes("Anything else about the plan? (typed)"), `the text typed in the Markdown pane (not yet saved when the delete was made: ${typedAt ? "it was not on disk" : "it had already been saved"}) is kept and the delete is made in the same text`);
      await shot(o, "markdown-pane-beside-light");
      // text typed in a field of the box while the Markdown pane changes that block: it is held (with the reason), not applied over the pane's words
      await undoBtn(o).click(); await agree("Undo of the delete", tx => tx.includes("[!choice|fruit]")); await idle(o);
      const nowText = text(every), fr2 = lineOf(nowText, "[!choice|fruit]");
      await clickBlock(o, "question", fr2);
      await o.page.locator(DESC_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type(" Mine.");
      await o.evaluate(n => { const ed = app.workspace.getLeavesOfType("markdown")[0].view.editor; const l = ed.getLine(n + 1); ed.replaceRange(" and more", { line: n + 1, ch: l.length }); }, fr2);
      await sleep(900);
      await o.page.keyboard.press("Tab"); await sleep(800);
      const sd = await o.evaluate(() => ({ status: (document.querySelector(".workspace-leaf.mod-active .booklet-design-status") || {}).textContent, field: (document.querySelector(".workspace-leaf.mod-active .booklet-design-field.is-desc") || {}).value || null }));
      c.ok(/changed/i.test(sd.status || "") && !!sd.field && sd.field.includes("Mine.") && (await md()).includes("Pick one. and more") && !(await md()).includes("Mine."), `a change typed in the Markdown pane under words typed in the box: the box's words are held (${JSON.stringify(sd.status)}), they stay in the field and the typed words stay in the Markdown pane`);
    });
    return c;
  }

  /* ================= CHECK 69 ================= */
  /** What a phone needs of the open Design view: nothing wider than the screen, and every control big enough to press. */
  const phoneFacts = o => o.evaluate(() => {
    const root = document.querySelector(".workspace-leaf.mod-active .workspace-leaf-content[data-type='booklet-design']");
    const vc = root.querySelector(".view-content"), W = window.innerWidth;
    const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !e.closest("[inert]") && !e.closest(".is-measuring") && !e.closest("[hidden]") && !e.closest("details:not([open]) > :not(summary)"); };
    const name = e => e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "") + (e.getAttribute("aria-label") ? "[" + e.getAttribute("aria-label") + "]" : e.textContent ? "(" + e.textContent.trim().slice(0, 18) + ")" : "");
    const ctl = [...root.querySelectorAll("button, summary, input:not([type=hidden]), select, textarea, .checkbox-container, [role=button], .clickable-icon")].filter(vis);
    const small = ctl.map(e => { const r = e.getBoundingClientRect(); return { n: name(e), w: Math.round(r.width), h: Math.round(r.height), own: /(^|\s)booklet-design/.test(e.className || "") }; }).filter(x => x.h < 43.5 || x.w < 43.5 && !/(input|textarea|select)/.test(x.n));
    const wide = [...root.querySelectorAll("*")].filter(e => vis(e)).filter(e => { const r = e.getBoundingClientRect(); return r.right > W + 1 || r.left < -1; }).filter(e => { for (let p = e.parentElement; p && p !== root; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return false; } return true; }).map(name);
    return { W, docScroll: document.documentElement.scrollWidth, vcScroll: vc.scrollWidth, vcClient: vc.clientWidth, bodyMobile: document.body.classList.contains("is-mobile"), controls: ctl.length, small, wide: wide.slice(0, 6), wideCount: wide.length };
  });
  /** The panel as drawn: whether the column and the scrim show, how wide the column is, the menu button's state. */
  const panelFacts = o => o.evaluate(() => {
    const el = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl, left = el.querySelector(".booklet-design-left"), scrim = el.querySelector(".booklet-design-scrim"), btn = el.querySelector(".booklet-design-menubutton"), W = window.innerWidth;
    const shown = e => !!e && !e.hidden && e.getBoundingClientRect().width > 0;
    const lr = left.getBoundingClientRect(), br = btn ? btn.getBoundingClientRect() : null;
    return { phone: el.classList.contains("is-phone"), leftShown: shown(left), scrimShown: shown(scrim), leftW: Math.round(lr.width), leftLeft: Math.round(lr.left), leftRight: Math.round(lr.right), ratio: shown(left) ? lr.width / W : 0, scrimW: shown(scrim) ? Math.round(scrim.getBoundingClientRect().width) : 0, hasPanel: !!el.querySelector(".booklet-design-shell.has-panel"), btn: btn ? { label: btn.getAttribute("aria-label"), expanded: btn.getAttribute("aria-expanded"), controls: btn.getAttribute("aria-controls"), w: Math.round(br.width), h: Math.round(br.height), icon: !!btn.querySelector("svg"), top: Math.round(br.top) } : null, closeBtn: shown(el.querySelector(".booklet-design-panelclose")), W };
  });
  async function check69() {
    const c = new Check(69, "a phone (Obsidian's phone mode at 390 x 844): the left column behind a menu button as a panel of about 90 % with a scrim (closed by a choice, a tile with no place, placing, the scrim, Escape and its own close button), no sideways scroll, controls at least 44 px, the Add tab, placing by a tile and by a \"+\", the editor and the confirm dialog, in light and dark; screenshots");
    await withApp("c69", async (o, vault) => {
      const kept = path.join(vault, KEPT), K0 = text(kept), every = path.join(vault, EVERY), E0 = text(every);
      const KINDS = lineOf(E0, "[!activity|kinds"), fruit = lineOf(E0, "[!choice|fruit]");
      await openDesign(o, EVERY);
      const narrowed = await o.page.setViewportSize({ width: 390, height: 844 }).then(() => true, e => String(e).slice(0, 120));
      c.ok(narrowed === true, "the window is 390 x 844: " + narrowed);
      await mobile(o, true);
      await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
      if (await o.evaluate(() => app.workspace.getLeavesOfType("booklet-design").length) === 0) await openDesign(o, EVERY, "tab", true, false);
      await o.page.waitForSelector(DV + " .booklet-design-page", { timeout: 15000 });
      await idle(o); await warm(o);
      const judge = async (label) => {
        const f = await phoneFacts(o);
        const ours = f.small.filter(x => x.own), others = f.small.filter(x => !x.own);
        c.ok(f.bodyMobile && f.docScroll <= f.W + 1 && f.vcScroll <= f.vcClient + 1 && f.wideCount === 0, `${label}: no sideways scroll (page ${f.docScroll} of ${f.W} px, the view ${f.vcScroll} of ${f.vcClient}); nothing sticks out of the screen${f.wideCount ? ": " + JSON.stringify(f.wide) : ""}`);
        c.ok(ours.length === 0, `${label}: every control of the plugin's is at least 44 px each way (${f.controls} controls looked at)${ours.length ? "; smaller: " + JSON.stringify(ours.slice(0, 8)) : ""}`);
        if (others.length) c.info(`${label}: Obsidian's own controls under 44 px (not the plugin's): ${JSON.stringify(others.slice(0, 5))}`);
        return f;
      };
      // ---- the page, the menu button, the panel
      let pf = await panelFacts(o);
      c.ok(pf.phone && !pf.leftShown && !pf.scrimShown && pf.btn && pf.btn.label === "Show the menu" && pf.btn.expanded === "false" && pf.btn.controls === "booklet-design-left" && pf.btn.w >= 43.5 && pf.btn.h >= 43.5 && pf.btn.icon, `on a phone the left column is out of sight and a menu button stands in the top row (named ${JSON.stringify(pf.btn && pf.btn.label)}, aria-expanded ${pf.btn && pf.btn.expanded}, ${pf.btn && pf.btn.w} x ${pf.btn && pf.btn.h} px, with an icon)`);
      await judge("the booklet's page");
      await shot(o, "phone-page-light");
      const hdr = await headerOf(o);
      c.info("on the phone the header shows: " + JSON.stringify(hdr.buttons) + "; tab icon " + hdr.tabIcon);
      await o.page.locator(DV + " .booklet-design-menubutton").click(); await sleep(500);
      pf = await panelFacts(o);
      c.ok(pf.leftShown && pf.scrimShown && pf.hasPanel && pf.btn.expanded === "true" && pf.ratio >= 0.8 && pf.ratio <= 0.95 && pf.leftLeft >= 0 && pf.leftRight <= pf.W, `the menu button opens the panel: about ninety percent of the screen (${pf.leftW} of ${pf.W} px, ${Math.round(pf.ratio * 100)} %), a scrim over the rest (${pf.scrimW} px wide) and aria-expanded true`);
      await judge("the Outline panel");
      await shot(o, "phone-panel-outline-light");
      await o.setScheme("dark"); await sleep(500);
      await shot(o, "phone-panel-outline-dark");
      await o.setScheme("light"); await sleep(300);
      // closes by: the scrim, Escape, the close button, the menu button
      { const g = await o.evaluate(() => { const q = x => document.querySelector(".workspace-leaf.mod-active " + x), r = e => e.getBoundingClientRect(); const sc = r(q(".booklet-design-scrim")), lf = r(q(".booklet-design-left")); const e = document.elementFromPoint(sc.right - 12, 400); return { scrimH: Math.round(sc.height), leftH: Math.round(lf.height), scrimW: Math.round(sc.width), hit: e ? e.className : null }; });
        c.ok(g.scrimH >= g.leftH * 0.95 && /scrim/.test(g.hit || ""), `the scrim covers the whole height beside the panel: it is ${g.scrimW} x ${g.scrimH} px next to a panel ${g.leftH} px tall, and what is under a finger at the right edge, half way down, is "${g.hit}"`); }
      await tapScrim(o, true); await sleep(300);
      pf = await panelFacts(o);
      if (pf.leftShown) { await o.page.keyboard.press("Escape"); await sleep(300); }
      c.ok(!pf.leftShown && !pf.scrimShown && pf.btn.expanded === "false", "a press on the scrim shuts the panel");
      await o.page.locator(DV + " .booklet-design-menubutton").click(); await sleep(300);
      await blurFocus(o); await o.page.keyboard.press("Escape"); await sleep(300);
      pf = await panelFacts(o);
      c.ok(!pf.leftShown && !pf.scrimShown, "Escape shuts the panel");
      await o.page.locator(DV + " .booklet-design-menubutton").click(); await sleep(300);
      c.ok((await panelFacts(o)).closeBtn, "the open panel has its own close button");
      await o.page.locator(DV + " .booklet-design-panelclose").click(); await sleep(300);
      c.ok(!(await panelFacts(o)).leftShown, "the panel's close button shuts it");
      await o.page.locator(DV + " .booklet-design-menubutton").click(); await sleep(300);
      // the menu button is under the open panel on a phone (decided: acceptable): it does not toggle the panel shut, and the panel says so by
      // the other ways out, each asserted here: the close button (twice over, below), the scrim, Escape, a second Escape and a navigator choice
      { const x = (await panelFacts(o)).btn.expanded; c.ok(x === "true", `with the panel open the menu button says aria-expanded true (${x})`); }
      await o.page.locator(DV + " .booklet-design-panelclose").click(); await sleep(300);
      { const pf2 = await panelFacts(o); c.ok(!pf2.leftShown && !pf2.scrimShown && pf2.btn.expanded === "false", `the close button shuts the panel again and the menu button goes back to aria-expanded false (${pf2.btn.expanded})`); }
      // a navigator choice shuts the panel and draws its page
      await goNav(o, "activity", KINDS);
      pf = await panelFacts(o); let st = await state(o);
      c.ok(!pf.leftShown && !pf.scrimShown && st.page === "activity@" + KINDS, `a navigator choice shuts the panel and draws that page (${st.page})`);
      await judge("an activity's page");
      await shot(o, "phone-activity-light");
      // ---- the Add tab in the panel, placing by a tile and by a "+"
      await leftTab(o, "add");
      pf = await panelFacts(o);
      await judge("the Add tab");
      await shot(o, "phone-add-light");
      await o.setScheme("dark"); await sleep(500); await shot(o, "phone-add-dark"); await o.setScheme("light"); await sleep(300);
      const hov = await o.evaluate(() => document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-samplepop").length);
      await o.page.locator(tile("Q - choice.md")).hover(); await sleep(900);
      c.ok(hov === 0 && (await o.page.locator(DV + " .booklet-design-samplepop").count()) === 0, "on a phone no sample popover is drawn (nothing to hover)");
      await o.page.locator(tile("Q - choice.md")).click(); await sleep(400);
      pf = await panelFacts(o); st = await state(o);
      c.ok(!pf.leftShown && st.armed.join() === "Q - choice.md" && st.lit > 0 && st.banner && /^Choice is picked\./.test(st.banner), `a tap on a tile with no place chosen shuts the panel and picks it: the banner says ${JSON.stringify(st.banner)} and ${st.lit} places are lit`);
      const ba = await o.evaluate(() => { const b = document.querySelector(".workspace-leaf.mod-active .booklet-design-armedbar"), r = b.getBoundingClientRect(); return { visible: !b.hidden && r.height > 0, left: Math.round(r.left), right: Math.round(r.right), btnH: Math.round(b.querySelector("button").getBoundingClientRect().height), W: window.innerWidth }; });
      c.ok(ba.visible && ba.left >= 0 && ba.right <= ba.W + 1 && ba.btnH >= 43.5, `the banner and its Put it back button fit the screen and the button is 44 px high: ${JSON.stringify(ba)}`);
      await judge("a piece picked, the places lit");
      await shot(o, "phone-picked-light");
      const slots = await slotIds(o), mid = slots.find(s => /\|between\|/.test(s));
      await o.page.locator(`${DV} .booklet-design-slot[data-slot='${mid}']`).scrollIntoViewIfNeeded();
      await o.page.locator(`${DV} .booklet-design-slot[data-slot='${mid}']`).click();
      let r = await waitDisk(every, tx => tx !== E0);
      let rg = placed(E0, r.text);
      c.ok(r.ok && rg.removed === "" && /\[!choice\|[\w-]+\]/.test(rg.added), `a tap on a lit "+" places the picked Choice: one block put in, nothing taken out (${JSON.stringify(rg.added.slice(0, 50))})`);
      await idle(o);
      await o.page.locator(`${DV} .booklet-design-undo`).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      c.ok(r.ok, "Undo (a 44 px button) takes it back, byte for byte");
      // a "+" first: the panel opens on the Add tab with that spot chosen; a tap on a tile places at once and shuts the panel
      const mid2 = (await slotIds(o)).find(s => /\|between\|/.test(s));
      await o.page.locator(`${DV} .booklet-design-slot[data-slot='${mid2}']`).scrollIntoViewIfNeeded();
      await o.page.locator(`${DV} .booklet-design-slot[data-slot='${mid2}']`).click(); await sleep(500);
      pf = await panelFacts(o); st = await state(o);
      c.ok(pf.leftShown && pf.scrimShown && st.tab === "add" && st.target, `a tap on a "+" opens the panel on the Add tab with that spot chosen`);
      await judge("the Add tab with a spot chosen");
      await shot(o, "phone-plus-first-light");
      await o.page.locator(tile("Q - text.md")).click();
      r = await waitDisk(every, tx => tx !== E0); rg = placed(E0, r.text);
      await idle(o); pf = await panelFacts(o);
      c.ok(r.ok && rg.removed === "" && /\[!text\|text-1\]/.test(rg.added) && !pf.leftShown, "a tap on a tile with the spot chosen places the piece at once and shuts the panel");
      await o.page.locator(`${DV} .booklet-design-undo`).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      // ---- the selected block: the floating bar, the editor
      await selectBlock(o, "question", fruit);
      await o.page.locator(block("question", fruit)).scrollIntoViewIfNeeded();
      await judge("a block selected, with its floating bar");
      await shot(o, "phone-bar-light");
      await o.page.locator(barBtn("question", fruit, "edit")).click(); await sleep(500);
      st = await state(o);
      c.ok(st.editBox && st.editor, "the bar's Edit as Markdown opens the block in place on the phone with its Markdown section open (the words of the button are what it does)");
      c.ok((await o.evaluate(sel => { const st = document.querySelector(sel + " .booklet-design-status"), r = st.getBoundingClientRect(), sc = document.querySelector(sel + " .booklet-design-scroll").getBoundingClientRect(); return getComputedStyle(st).position !== "absolute" && r.height >= 16 && r.bottom <= sc.top + 0.5; }, DV)) === true, "phone: the status line is a strip in the flow with its one line of height, above the page's scroll area (it covers nothing), so a write's words move nothing");
      await judge("the open block");
      await shot(o, "phone-editor-light");
      await o.setScheme("dark"); await sleep(500); await shot(o, "phone-editor-dark"); await o.setScheme("light"); await sleep(300);
      // the bar's Edit as Markdown opened the section: a tap on its summary shuts it, and a second tap opens it again
      await o.page.locator(MD_SUMMARY).click(); await sleep(300);
      c.ok(!(await state(o)).editor, "a tap on the open Markdown section's summary shuts it on the phone");
      await o.page.locator(MD_SUMMARY).click(); await sleep(300);
      c.ok((await state(o)).editor, "a tap on the Markdown summary opens the block's own lines on the phone");
      await judge("the open block with its Markdown section open");
      await shot(o, "phone-editor-md-light");
      // typing in a field and tapping away applies it (one write), and Escape closes the block
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type("?");
      await o.page.locator(DESC_F).click();
      await sleep(300);
      r = await waitDisk(every, tx => tx !== E0); await idle(o);
      c.ok(r.ok && linesDiffering(E0, r.text) === 1 && r.text.split("\n")[fruit].endsWith("?"), `on the phone a title typed and left by touching the next field is written at once (one line differs): ${JSON.stringify(r.text.split("\n")[fruit])}`);
      await o.page.keyboard.press("Escape"); await sleep(300);
      c.ok(!(await state(o)).editBox, "Escape closes the block on the phone");
      await o.page.locator(`${DV} .booklet-design-undo`).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      c.ok(r.ok, "Undo takes the title back, byte for byte");
      // the page in the dark theme
      await o.setScheme("dark"); await sleep(500);
      await judge("the page in the dark theme");
      await shot(o, "phone-activity-dark");
      await o.setScheme("light"); await sleep(300);
      // the hotkeys on a phone (a keyboard attached): s shows the Add tab as a panel
      await blurFocus(o);
      await o.page.keyboard.press("s"); await sleep(500);
      pf = await panelFacts(o); st = await state(o);
      c.ok(pf.leftShown && st.tab === "add" && st.status === "Keys: s", "the key s on a phone (a keyboard is attached) opens the panel on the Add tab with the keys pending");
      await judge("the keys pending in the panel");
      await o.page.keyboard.press("Escape"); await sleep(300);
      pf = await panelFacts(o); st = await state(o);
      c.ok(st.status === "" && st.armed.length === 0, `Escape lets the pending keys go first (the status is ${JSON.stringify(st.status)}, picked ${JSON.stringify(st.armed)}); the panel stays: ${pf.leftShown}`);
      await o.page.keyboard.press("Escape"); await sleep(300); pf = await panelFacts(o);
      c.ok(!pf.leftShown && !pf.scrimShown, "a second Escape shuts the panel");
      c.ok(text(every) === E0, "nothing was left written by any of the above");
      // ---- the confirm dialog, on Kept records
      await openDesign(o, KEPT, "tab", true, false);
      const colour = lineOf(K0, "[!choice|colour]");
      await goNav(o, "activity", lineOf(K0, "[!activity|warm-up"));
      await selectBlock(o, "question", colour);
      await o.page.locator(barBtn("question", colour, "delete")).click();
      c.ok(await waitModal(o, true), "Delete on a question with a kept answer asks on the phone");
      const mi = await o.evaluate(() => { const m = document.querySelector(".modal-container .modal"); const r = m.getBoundingClientRect(); return { l: Math.round(r.left), rt: Math.round(r.right), w: window.innerWidth, buttons: [...m.querySelectorAll("button")].map(b => { const x = b.getBoundingClientRect(); return { t: b.textContent.trim(), h: Math.round(x.height), w: Math.round(x.width) }; }), sw: m.scrollWidth, cw: m.clientWidth }; });
      c.ok(mi.l >= 0 && mi.rt <= mi.w + 1 && mi.sw <= mi.cw + 1, "the dialog fits the screen: " + JSON.stringify({ left: mi.l, right: mi.rt, screen: mi.w }));
      c.ok(mi.buttons.every(b => b.h >= 43.5), "its buttons are at least 44 px high: " + JSON.stringify(mi.buttons));
      await shot(o, "phone-confirm-light");
      await o.setScheme("dark"); await sleep(400); await shot(o, "phone-confirm-dark");
      await clickModal(o, "Cancel");
      c.ok(text(kept) === K0, "Cancel writes nothing");
      await o.setScheme("light");
      // the lines the reader cannot read, in the panel
      put(vault, CARDS, CARDS_TEXT);
      await openDesign(o, CARDS, "tab", true, false);
      await leftTab(o, "outline");
      await o.page.locator(`${DV} .booklet-design-problems summary`).click(); await sleep(300);
      await judge("the list of lines the reader cannot read, in the panel");
      await shot(o, "phone-problems-light");
      const first = await o.page.locator(`${DV} .booklet-design-problems .booklet-design-jump`).first();
      await first.click(); await sleep(500);
      pf = await panelFacts(o); st = await state(o);
      c.ok(!pf.leftShown && /^as-written@|^question@|^[\w-]+@/.test(st.selected || ""), `a press on a problem shuts the panel and selects its block (${st.selected})`);
    });
    return c;
  }

  /* ================= CHECKS 70 AND 71 ================= */
  // The Design view with Obsidian itself in Spanish (70) and in French (71): the language is Obsidian's own (localStorage "language", then
  // the app reloads, as the Language setting does). Every scene is judged at a desktop's width and at Obsidian's phone mode (390 x 844), in the light theme.
  const STRINGS_TS = path.join(__dirname, "..", "src", "core", "design-strings.ts");
  /**
   * The table's strings as the source file spells them: key -> {en, es, fr}. A key is written `tr("en", "es", "fr")` or `{ en: "...", es: "...", fr: "..." }`;
   * a string with no Spanish or French yet has no slot (the view shows it in English). The count of those is read from the file at run time, not fixed here.
   */
  const tableOf = () => {
    const out = {}, js = "\"(?:[^\"\\\\]|\\\\.)*\"", src = text(STRINGS_TS);
    const re1 = new RegExp("^\\t\"([^\"]+)\": tr\\((" + js + "), (" + js + "), (" + js + ")\\),$", "gm");
    const re2 = new RegExp("^\\t\"([^\"]+)\": \\{ en: (" + js + ")(?:, es: (" + js + "))?(?:, fr: (" + js + "))? \\},$", "gm");
    let m;
    while ((m = re1.exec(src))) out[m[1]] = { en: JSON.parse(m[2]), es: JSON.parse(m[3]), fr: JSON.parse(m[4]) };
    while ((m = re2.exec(src))) out[m[1]] = { en: JSON.parse(m[2]), es: m[3] === undefined ? undefined : JSON.parse(m[3]), fr: m[4] === undefined ? undefined : JSON.parse(m[4]) };
    return out;
  };
  /** What a person can read in the open Design view, its header, a dialog and the panel: every text, label and title, once each. */
  const readable = o => o.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !e.closest("[hidden]") && !e.closest("details:not([open]) > :not(summary)") && !e.closest(".is-measuring"); };
    const roots = [document.querySelector(".workspace-leaf.mod-active .view-header"), document.querySelector(".workspace-leaf.mod-active .workspace-leaf-content[data-type='booklet-design']"), document.querySelector(".modal-container .modal")].filter(Boolean);
    const seen = new Set(), out = [];
    const add = (kind, s, e) => { s = (s || "").replace(/\s+/g, " ").trim(); if (!s) return; const k = kind + "|" + s; if (!seen.has(k)) { seen.add(k); out.push({ kind, text: s, cls: ((e.closest("[inert]") ? "drawn " : "") + (typeof e.className === "string" ? e.className : "")).trim().split(/\s+/).filter(x => /^drawn$|^booklet|^modal|^view/.test(x)).slice(0, 2).join(" ") }); } };
    for (const r of roots) for (const e of [r, ...r.querySelectorAll("*")]) {
      if (!vis(e)) continue;
      if (e.getAttribute("aria-label")) add("label", e.getAttribute("aria-label"), e);
      if (e.getAttribute("title")) add("title", e.getAttribute("title"), e);
      if (e.getAttribute("placeholder")) add("placeholder", e.getAttribute("placeholder"), e);
      if (e.tagName === "TEXTAREA" || e.tagName === "INPUT") add("value", e.value, e);
      const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(" ");
      if (own.trim()) add("text", own, e);
    }
    return out;
  });
  /** Anything of the view, its dialog or its panel that is cut off, wider than its box or off the screen. */
  const fitOf = o => o.evaluate(() => {
    const W = window.innerWidth;
    const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !e.closest("[inert]") && !e.closest("[hidden]") && !e.closest("details:not([open]) > :not(summary)") && !e.closest(".is-measuring") && !e.closest(".booklet-design-sr"); }; // the screen-reader-only text is clipped to one pixel on purpose
    const name = e => e.tagName.toLowerCase() + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "") + "(" + (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30) + ")";
    const roots = [document.querySelector(".workspace-leaf.mod-active .workspace-leaf-content[data-type='booklet-design']"), document.querySelector(".modal-container .modal")].filter(Boolean);
    const clipped = [], off = [];
    for (const r of roots) for (const e of r.querySelectorAll("*")) {
      if (!vis(e)) continue;
      const cs = getComputedStyle(e), clips = ["hidden", "clip"].includes(cs.overflowX) || cs.textOverflow === "ellipsis";
      const own = /^(INPUT|TEXTAREA)$/.test(e.tagName) || !!e.closest(".view-header-title"); // a field's own text scrolls; the note's file name in the header is Obsidian's
      const isCtl = /^(BUTTON|SUMMARY|LABEL)$/.test(e.tagName) || /booklet-design-(tile|commonchip|slot|nav-item|iconbutton|tab|card-open|page-edit|pal-head|putback|undo|redo|save|cancel|crumb-item)/.test(e.className || "");
      if (!own && (clips || isCtl) && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && cs.display !== "inline") clipped.push(name(e) + " " + e.scrollWidth + ">" + e.clientWidth);
      if ((cs.overflowY === "hidden" || cs.overflowY === "clip") && e.scrollHeight > e.clientHeight + 1 && e.clientHeight > 0) clipped.push(name(e) + " tall " + e.scrollHeight + ">" + e.clientHeight);
      const b = e.getBoundingClientRect();
      if (b.right > W + 1 || b.left < -1) { let scrolled = false; for (let p = e.parentElement; p && !roots.includes(p); p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") scrolled = true; } if (!scrolled) off.push(name(e) + " " + Math.round(b.left) + ".." + Math.round(b.right)); }
    }
    const vc = document.querySelector(".workspace-leaf.mod-active .workspace-leaf-content[data-type='booklet-design'] .view-content");
    return { W, clipped: clipped.slice(0, 8), clippedCount: clipped.length, off: off.slice(0, 8), offCount: off.length, sideways: vc ? vc.scrollWidth - vc.clientWidth : 0, docSideways: document.documentElement.scrollWidth - W };
  });

  async function languageCheck(n, code, label, expect) {
    const c = new Check(n, `the Design view with Obsidian in ${label} (localStorage language "${code}", then a reload): the header buttons, toolbar, navigator, Add tab, keys line, editor and confirm dialog are in ${label} (nothing a translated key still shows in English, no {placeholder} left showing), and each scene fits at a desktop's width and at Obsidian's phone mode (390 x 844, the left column opened as a panel), light theme; screenshots and the readable text of each scene are kept`);
    const table = tableOf();
    c.ok(Object.keys(table).length > 150, `read the table from design-strings.ts: ${Object.keys(table).length} keys`);
    // strings with no slot for this language yet: shown in English (by design, until /localize fills them). Counted from the file now, never fixed here
    const noSlot = Object.entries(table).filter(([, v]) => v[code] === undefined).map(([k]) => k);
    c.info(`${noSlot.length} of ${Object.keys(table).length} strings have no ${label} yet in this build's table (the view shows them in English: nothing is asserted about their words)${noSlot.length ? ": " + noSlot.slice(0, 12).join(", ") + (noSlot.length > 12 ? ", ..." : "") : ""}`);
    // a translated key still shown as its English: the English must be one whole text, label or title on screen, and differ from the translation
    const english = Object.entries(table).filter(([, v]) => v[code] !== undefined && v.en !== v[code] && !/\{/.test(v.en) && v.en.length >= 4).map(([k, v]) => ({ k, en: v.en }));
    // what a key reads in this language now: its slot, else its English (the view's own fallback), so a string /localize has not reached yet is expected in English
    const exp = k => (table[k] ? (table[k][code] ?? table[k].en) : "?" + k);
    await withApp("c" + n, async (o, vault) => {
      await o.setScheme("light");
      await o.evaluate(code => { localStorage.setItem("language", code); }, code);
      await o.evaluate(() => { app.commands.executeCommandById("app:reload"); });
      await o.page.waitForFunction(code => !!(window.app && app.workspace && app.workspace.layoutReady) && window.i18next && window.i18next.language === code, code, { timeout: 40000, polling: 100 });
      await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
      c.ok(await o.evaluate(() => window.i18next.language) === code, `Obsidian is in ${label} (i18next language ${code})`);
      const every = path.join(vault, EVERY), kept = path.join(vault, KEPT), E0 = text(every), K0 = text(kept);
      const fruit = lineOf(E0, "[!choice|fruit]"), KINDS = lineOf(E0, "[!activity|kinds"), colour = lineOf(K0, "[!choice|colour]");
      const judge = async (where, scene, tagWidth) => {
        const items = await readable(o), fit = await fitOf(o);
        fs.writeFileSync(path.join(SHOTS, `design-${code}-${tagWidth}-${scene}-text-${VER}.json`), JSON.stringify(items, null, 1));
        // the pieces' labels (a tile, a chip, a sample's name, the banner and the status line's piece name) and the drawings of a question (the renderer's own words, in an inert sample)
        // are English in their own files (known, not translated in this release): a table string that happens to read the same there is not a leak; anywhere else it is
        const BY_DESIGN = /^drawn |booklet-design-(group|popup-label|tile-label|commonchip|samplepop-name|samplepop|tile)\b/;
        const wrong = english.filter(e => items.some(i => i.text === e.en && !BY_DESIGN.test(i.cls))).map(e => e.k);
        const holes = items.filter(i => /\{\w+\}/.test(i.text)).map(i => i.text.slice(0, 60));
        c.ok(wrong.length === 0, `${where}: no translated key shows in English (${items.length} texts read)${wrong.length ? ": " + wrong.join(", ") : ""}`);
        c.ok(holes.length === 0, `${where}: no {placeholder} left showing${holes.length ? ": " + JSON.stringify(holes) : ""}`);
        c.ok(fit.clippedCount === 0 && fit.offCount === 0 && fit.sideways <= 1 && fit.docSideways <= 1, `${where}: nothing cut off, nothing off the screen, no sideways scroll${fit.clippedCount || fit.offCount ? ": " + JSON.stringify({ clipped: fit.clipped, off: fit.off }) : ""} (view ${fit.sideways}, page ${fit.docSideways} px wider than its box)`);
        await shot(o, `${code}-${tagWidth}-${scene}`);
        return items;
      };
      const scenes = async tagWidth => {
        await openDesign(o, EVERY, "tab", true, false);
        if (tagWidth === "desktop") { await o.evaluate(() => { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); }); await sleep(600); }
        await sleep(300);
        let st = await state(o);
        c.ok(tagWidth === "desktop" ? !st.phone : st.phone, `${tagWidth}: the view is drawn in its ${tagWidth === "desktop" ? "wide" : "phone"} layout`);
        // the Outline tab (on a phone: the panel opened by the menu button)
        await leftTab(o, "outline");
        const items0 = await judge(`${tagWidth} Outline`, "outline", tagWidth);
        const texts = items0.map(i => i.text);
        c.ok(texts.includes(expect.undo) && texts.includes(expect.redo), `${tagWidth}: the toolbar says ${JSON.stringify(expect.undo)} and ${JSON.stringify(expect.redo)}`);
        c.ok(texts.includes(exp("tab.outline")) && texts.includes(exp("tab.add")), `${tagWidth}: the two tabs are named ${JSON.stringify(exp("tab.outline"))} and ${JSON.stringify(exp("tab.add"))} (in ${label} when the table has them, else in English)`);
        const hdr = await headerOf(o);
        c.ok(hdr.buttons.some(b => b.label === expect.toBooklet) && hdr.buttons.some(b => b.label === expect.toMarkdown), `${tagWidth}: the header buttons are ${JSON.stringify(expect.toBooklet)} and ${JSON.stringify(expect.toMarkdown)} (found ${JSON.stringify(hdr.buttons.map(b => b.label))})`);
        if (st.phone) { await tapScrim(o); await sleep(300); }
        // the page of an activity
        await goNav(o, "activity", KINDS);
        await judge(`${tagWidth} page`, "page", tagWidth);
        // the Add tab with Questions open
        await leftTab(o, "add");
        await judge(`${tagWidth} Add tab`, "add", tagWidth);
        if (st.phone) { await tapScrim(o); await sleep(300); }
        else await leftTab(o, "outline");
        // a "+" chosen: the card says where; a tile picked: the banner
        await blurFocus(o);
        const slot = (await slotIds(o)).find(s => /\|between\|/.test(s));
        await o.page.locator(`${DV} .booklet-design-slot[data-slot='${slot}']`).scrollIntoViewIfNeeded();
        await o.page.locator(`${DV} .booklet-design-slot[data-slot='${slot}']`).click(); await sleep(400);
        await judge(`${tagWidth} Add tab with a spot chosen`, "plus", tagWidth);
        await blurFocus(o); await o.page.keyboard.press("Escape"); await sleep(300);
        if (st.phone && (await state(o)).panel) { await tapScrim(o); await sleep(300); }
        await leftTab(o, "add");
        await o.page.locator(tile("Q - choice.md")).click(); await sleep(400);
        st = await state(o);
        c.ok(!!st.banner, `${tagWidth}: a tile picked shows its banner (${JSON.stringify(st.banner)})`);
        await judge(`${tagWidth} a piece picked`, "picked", tagWidth);
        await blurFocus(o); await o.page.keyboard.press("Escape"); await sleep(300);
        // the keys' status line
        await blurFocus(o);
        await o.page.keyboard.press("q"); await sleep(400);
        st = await state(o);
        c.ok(/q/.test(st.status) && st.status.length > 2, `${tagWidth}: the key q shows the keys pending in the status line (${JSON.stringify(st.status)})`);
        await judge(`${tagWidth} keys pending`, "keys", tagWidth);
        await o.page.keyboard.press("Escape"); await sleep(300);
        st = await state(o);
        if (st.phone && st.panel) { await tapScrim(o); await sleep(300); }
        // the editor in place (no Save and no Cancel any more: the box is the block, its own words and its controls)
        await goNav(o, "activity", KINDS);
        await clickBlock(o, "question", fruit);
        const eitems = await judge(`${tagWidth} editor`, "editor", tagWidth);
        const et = eitems.map(i => i.text);
        const want = ["form.title", "edit.desc", "edit.markdown", "edit.keys", "act.up", "act.down", "act.delete"].filter(k => !et.includes(exp(k)));
        c.ok(want.length === 0, `${tagWidth}: the open block's field names, its Markdown section, its hint and its buttons read in ${label} when the table has them (looked for ${JSON.stringify(["form.title", "edit.desc", "edit.markdown", "edit.keys", "act.up", "act.down", "act.delete"].map(exp))}); not found: ${JSON.stringify(want)}`);
        c.ok(!et.some(t => t === "Save" || t === "Cancel" || t === exp("editor.save") || t === exp("editor.cancel")), `${tagWidth}: the box has no Save and no Cancel`);
        await o.page.locator(MD_SUMMARY).click(); await sleep(250);
        await judge(`${tagWidth} editor with the Markdown open`, "editor-md", tagWidth);
        await o.page.keyboard.press("Escape"); await sleep(300);
        await closeAll(o);
        // the confirm dialog, on Kept records (a kept answer is touched)
        await openDesign(o, KEPT, "tab", true, false);
        if (tagWidth === "desktop") { await o.evaluate(() => { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); }); await sleep(500); }
        await goNav(o, "activity", lineOf(K0, "[!activity|warm-up"));
        await selectBlock(o, "question", colour);
        await o.page.locator(barBtn("question", colour, "delete")).click();
        c.ok(await waitModal(o, true), `${tagWidth}: Delete on a question with a kept answer asks`);
        const mi = await modalInfo(o);
        c.ok(mi && mi.buttons.includes(expect.cancel) && mi.buttons.includes(expect.yes), `${tagWidth}: the dialog's buttons are ${JSON.stringify(expect.cancel)} and ${JSON.stringify(expect.yes)} (found ${JSON.stringify(mi && mi.buttons)})`);
        c.info(`${tagWidth} dialog title: ` + JSON.stringify(await o.evaluate(() => { const t = document.querySelector(".modal-container .modal .modal-title"), cs = getComputedStyle(t), r = t.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(t); return { text: t.textContent, w: Math.round(r.width), h: Math.round(r.height), sw: t.scrollWidth, cw: t.clientWidth, sh: t.scrollHeight, ch: t.clientHeight, ov: cs.overflow, ws: cs.whiteSpace, to: cs.textOverflow, lines: new Set([...rg.getClientRects()].map(x => Math.round(x.top))).size }; })));
        const under = await o.evaluate(() => { const t = document.querySelector(".modal-container .modal .modal-title"), x = document.querySelector(".modal-container .modal .modal-header-button, .modal-container .modal .modal-close-button"); if (!t || !x) return null; const rg = document.createRange(); rg.selectNodeContents(t); const b = x.getBoundingClientRect(); return [...rg.getClientRects()].some(r => r.width > 0 && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top); });
        const mclass = under === null ? await o.evaluate(() => [...document.querySelectorAll(".modal-container .modal *")].filter(e => /close|button|icon/i.test(e.className && e.className.baseVal === undefined ? e.className : "")).map(e => e.tagName + "." + e.className).slice(0, 10)) : [];
        c.ok(under === false, `${tagWidth}: the dialog's title does not run under its close button${under === null ? " (no close button found; the modal's controls: " + JSON.stringify(mclass) + ")" : ""}`);
        await judge(`${tagWidth} confirm dialog`, "confirm", tagWidth);
        await o.page.keyboard.press("Escape"); await waitModal(o, false); await sleep(200);
        c.ok(text(kept) === K0 && text(every) === E0, `${tagWidth}: closing the dialog writes nothing`);
      };
      await scenes("desktop");
      const narrowed = await o.page.setViewportSize({ width: 390, height: 844 }).then(() => true, e => String(e).slice(0, 120));
      c.ok(narrowed === true, "the window is 390 x 844: " + narrowed);
      await mobile(o, true);
      await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
      c.ok(await o.evaluate(() => window.i18next.language) === code, `still in ${label} in phone mode`);
      await scenes("phone");
      c.ok(text(kept) === K0 && text(every) === E0, "nothing was written to either note during the run");
    });
    return c;
  }
  const check70 = () => languageCheck(70, "es", "Spanish", { undo: "Deshacer", redo: "Rehacer", cancel: "Cancelar", yes: "Borrar", toBooklet: "Abrir como cuadernillo", toMarkdown: "Mostrar Markdown" });
  const check71 = () => languageCheck(71, "fr", "French", { undo: "Annuler", redo: "Rétablir", cancel: "Ne pas modifier", yes: "Supprimer", toBooklet: "Ouvrir en carnet", toMarkdown: "Afficher le Markdown" });

  /* ================= CHECK 72 ================= */
  // The row editors of stage 2, in the real app: a choice and a multi by rows, a shared menu, a matrix. Every note is made up here and written into
  // the check's own copy of the vault (one note per scene, so a scene never reads what an earlier one left).
  const WHERE72 = ["> [!choice|where] Where are you right now?", "- [ ] Calm", "  - That is the settling system at work.", "- [x] Wound up", "  - That is the activating family.", "  - It is also useful.", "- [ ] Numb", "", "> [!hint]- A hint", "> Think about your body."];
  const KEPT72 = { where: 2, morning: [1, 3], evening: [2], outside: [1], topics: [1, 2] };
  const rowsNote = (name, kept, both = false) => [
    "---", "booklet: \"0.20\"", `id: booklet-test/rows-${name}`, `title: Rows ${name}`, "lang: en", "---", "",
    "> [!module|m] Feelings", "", "> [!activity|a] How it went", "",
    "> [!menu|places]", "- Park", "- Garden", "- Library", "",
    ...WHERE72, "",
    "> [!multi|morning menu:places] This morning I went to…", "",
    "> [!multi|evening menu:places] This evening I went to…", "",
    "> [!multi|outside open] What did you do outside?", "- [ ] Walked", "- [ ] Gardened", "",
    "> [!matrix|topics] How sure are you of each topic?", "", "- Spring tides", "- Neap tides", "", "0. Not yet", "1. Getting there", "2. Sure", "",
    "> [!matrix|fresh] A matrix with no anchors yet", "", "- Tides", "",
    "> [!choice|odd] Odd one", "- [ ] One", "  - Said", "    and more", "",
    ...(both ? ["> [!choice|both menu:places] Menu and own options", "- [ ] Mine", ""] : []),
    "> [!module|m end]", "",
    ...(kept ? ["%%", "> [!records] App record — do not edit below this line", "", "> [!records|m] Feelings", "", "```booklet answers", JSON.stringify(KEPT72), "```", "%%", ""] : []),
  ].join("\n");
  /** `t` with the first `a` replaced by `b`; fails when `a` is not there, so a wrong expectation is never a silent no-op. */
  const sub = (t, a, b) => { if (!t.includes(a)) throw new Error("expected text not in the note: " + JSON.stringify(a)); return t.replace(a, () => b); };
  const RW = k => `${DV} .booklet-design-rows [data-key='${k}']`;
  const openBox = `${DV} .booklet-design-block.is-open`;

  async function check72() {
    const c = new Check(72, "the row editors in the real app, applied as you go (no Save, no draft): a choice and a multi by rows (words, the correct switch, replies, add, move, remove, the open switch, the shared-menu picker), a shared menu's rows with Used by, a matrix with anchors from 0; every change compared byte for byte with the whole expected note, one write each; a change that moves a kept answer asks first and Cancel writes nothing and the rows go back to the note, one that moves none asks nothing; typing in a row and in the Markdown keep each other in step, the same elements stay and the focus stays; a block the rows cannot show without changing a byte has the Markdown open and the reason; a phone (44 px, light and dark); Spanish and French");
    const table = tableOf();
    await withApp("c72", async (o, vault) => {
      let seq = 0;
      const vp0 = await o.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
      const mk = (kept, both = false) => { const name = "s" + (++seq) + (kept ? "k" : "b"), rel = `Rows ${name}.booklet.md`, t = rowsNote(name, kept, both); return { rel, file: put(vault, rel, t), t, name }; };
      const q = (n, needle) => lineOf(text(n.file), needle);
      const start = async (kept, wide = true, both = false) => { const n = mk(kept, both); await openDesign(o, n.rel, "tab", true, wide); await goNav(o, "activity", q(n, "[!activity|a]")); await armWrites(o, n.rel); lastW.v = 0; return n; };
      const openQ = async (n, needle, kind = "question") => { await clickBlock(o, kind, q(n, needle)); await sleep(150); };
      const reopen = async (n, needle) => { if (!(await state(o)).editBox) await openQ(n, needle); };
      const closeBox = async () => { for (let i = 0; i < 3 && (await state(o)).editBox; i++) { await o.page.keyboard.press("Escape"); await sleep(250); } };
      const area = () => markdownOf(o);
      const focusKey = () => o.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute("data-key") || a.className || a.tagName) : null; });
      const inputs = () => o.evaluate(sel => [...document.querySelectorAll(sel + " input[data-key]")].map(e => e.getAttribute("data-key") + "=" + e.value), `${DV} .booklet-design-rows`);
      const refused = () => o.evaluate(sel => { const e = document.querySelector(sel + " .booklet-design-rows-refused"); return e ? e.textContent : null; }, DV);
      const rowsShown = () => o.evaluate(sel => document.querySelectorAll(sel + " .booklet-design-rows [data-key]").length, DV);
      const checked = k => o.page.locator(RW(k)).getAttribute("aria-checked");
      /** Real typing in a row: a click into it, the words (the old ones replaced, or added to), the row NOT left yet. */
      const typeIn = async (key, s, replace = true) => { const l = o.page.locator(RW(key)); await l.click(); await o.page.keyboard.press(replace ? "Control+a" : "End"); await o.page.keyboard.type(s); await sleep(150); };
      /** Real typing, then Tab: the row is left, and what was typed is applied. */
      const typeLeave = async (key, s, replace = true) => { await typeIn(key, s, replace); await o.page.keyboard.press("Tab"); };
      const press = async key => { await o.page.locator(RW(key)).click(); await sleep(200); };
      const diff = (want, got) => want === got ? "" : "; DIFFERS " + JSON.stringify(region(want, got)).slice(0, 360);
      /** A screenshot with the rows at the top of the view. */
      const rshot = async name => { await o.evaluate(sel => { const e = document.querySelector(sel + " .booklet-design-rows"); if (e) e.scrollIntoView({ block: "start" }); }, DV); await sleep(250); await shot(o, name); };
      /** The note's text once it has changed from `before`, read again after a moment: a write that truncates first can be read half done. */
      const lastW = { v: 0 };
      const disk = async (n, before) => { const pre = lastW.v; const r = await waitDisk(n.file, tx => tx !== before && tx.length > 0); await sleep(300); lastW.v = await writesOf(o, n.rel); return { ok: r.ok, text: text(n.file), writes: lastW.v - pre }; };
      const cancelled = table["status.cancelled"] ? table["status.cancelled"].en : "Nothing was changed.";
      /** A change that asks nothing: the note on disk equals `want`, no dialog, the box still open, and `writes` more writes (one by default). */
      const applied = async (n, before, want, label, writes = 1) => {
        const r = await disk(n, before); await idle(o);
        const st = await state(o), w = r.writes;
        c.ok(r.ok && r.text === want && !st.modal && st.editBox && w === writes, `${label}: the whole expected note was written byte for byte, nothing was asked, the box is still open, ${w} write(s)${diff(want, r.text)}`);
        return r.text;
      };
      /** A change that must ask: the dialog's text and the focus on Cancel; Cancel writes nothing, says so, and the rows show the note again. */
      const asks = async (n, before, label, words, rowsNow) => {
        const w0 = await writesOf(o, n.rel);
        const shown = await waitModal(o, true);
        const m = shown ? await modalInfo(o) : null;
        c.ok(!!m && words.every(w => w.test(m.text)) && m.focus === "Cancel", `${label}: it opens the count-and-ask dialog (${JSON.stringify(m && m.text.replace(/\s+/g, " ").slice(0, 200))}), the focus is on Cancel`);
        if (shown) {
          await clickModal(o, "Cancel"); await idle(o);
          const st = await state(o);
          c.ok(text(n.file) === before && st.editBox && st.status === cancelled && (await writesOf(o, n.rel)) === w0 && (!rowsNow || (await inputs()).join("|") === rowsNow), `${label}: Cancel writes nothing (the note is byte for byte as it was), says ${JSON.stringify(st.status)}, and the rows are the note's again`);
        }
        return m;
      };
      /** A press on Undo: a step that moves a kept answer asks, as the change did (the dialog says Undo brings the note back); it is answered Change, and said. */
      const undoStep = async () => {
        await undoBtn(o).click();
        if (await waitModal(o, true, 1200)) { c.info("Undo of a step that touched a kept answer opened the count-and-ask dialog; answered Change"); await clickModal(o, "Change"); }
      };
      /** The Markdown section left by Tab: a block change made there cannot be told row by row, so one that touches a kept answer asks, and is answered Change. */
      const leaveMd = async () => {
        await o.page.keyboard.press("Tab");
        if (await waitModal(o, true, 1500)) { c.info("a change typed in the Markdown section touched a kept answer: the count-and-ask dialog opened when the section was left; answered Change"); await clickModal(o, "Change"); }
      };
      const changed = async (n, before, want, label) => {
        await clickModal(o, "Change");
        const r = await disk(n, before); await idle(o);
        c.ok(r.ok && r.text === want, `${label}: Change wrote the whole expected note byte for byte${diff(want, r.text)}`);
        return r.text;
      };

      let n, cur, m, u2;
      // ================= 1. a choice by rows, with kept answers
      try {
        n = await start(true);
        cur = n.t;
        await openQ(n, "[!choice|where]");
        const blockWhere = WHERE72.join("\n");
        c.ok((await area()) === blockWhere && !(await o.evaluate(() => document.querySelector(".workspace-leaf.mod-active .booklet-design-edit-md").open)), "the box opens with the Markdown section closed, and it holds the choice's own lines, byte for byte (hint and all)");
        const rows0 = (await inputs()).join("|");
        c.ok(rows0 === "o0-text=Calm|o0-r0-text=That is the settling system at work.|o1-text=Wound up|o1-r0-text=That is the activating family.|o1-r1-text=It is also useful.|o2-text=Numb", "the rows show the three options and the three replies as inputs: " + JSON.stringify(await inputs()));
        c.ok([await checked("o0-correct"), await checked("o1-correct"), await checked("o2-correct")].join() === "false,true,false", "the correct switches read false, true, false (aria-checked) as the Markdown's [ ] [x] [ ]");
        const names = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-rows button")].slice(0, 5).map(b => b.getAttribute("aria-label")), DV);
        c.ok(names.join("|") === "Option 1: correct answer|Option 1: move up|Option 1: move down|Option 1: remove|Option 1, reply 1: remove", "every button of a row has its own name for a screen reader: " + JSON.stringify(names));
        const heads = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-rows .setting-item-heading")].map(e => e.textContent.trim()), DV);
        c.ok(heads.join() === "Options", "the section is headed " + JSON.stringify(heads));
        await rshot("rows-choice-light");
        await o.setScheme("dark"); await sleep(400); await rshot("rows-choice-dark"); await o.setScheme("light"); await sleep(300);
        // typing: nothing is written at a key; leaving the row applies it, the same input stays, the focus moves on by Tab
        await o.evaluate(sel => { window.__row = document.querySelector(sel + " [data-key='o0-text']"); }, DV);
        await typeIn("o0-text", " and steady", false);
        let f = await o.evaluate(() => { const a = document.activeElement; return { key: a.getAttribute("data-key"), end: a.selectionStart === a.value.length, value: a.value }; });
        c.ok(f.key === "o0-text" && f.end && f.value === "Calm and steady", `typing in a row keeps the focus and the caret in that same input (${JSON.stringify(f)})`);
        c.ok(text(n.file) === cur && (await area()).split("\n")[1] === "- [ ] Calm", "nothing is written at a key: the note and the Markdown section still hold the old words while the row is being typed in");
        await o.page.keyboard.press("Tab");
        cur = await applied(n, cur, sub(cur, "- [ ] Calm\n", "- [ ] Calm and steady\n"), "a reworded option 1 (a kept answer exists but picked option 2) is applied on leaving the row");
        c.ok(await o.evaluate(sel => document.querySelector(sel + " [data-key='o0-text']") === window.__row, DV), "the row's input is the same element after the write (nothing in the box was drawn again under the typing)");
        c.ok((await area()).split("\n")[1] === "- [ ] Calm and steady", "the Markdown section follows the note");
        // the correct switch
        await press("o2-correct");
        c.ok((await checked("o2-correct")) === "true" && (await focusKey()) === "o2-correct" && (await area()).split("\n").includes("- [x] Numb"), "the switch turns on at once, keeps the focus, and the Markdown reads - [x] Numb");
        cur = await applied(n, cur, sub(cur, "- [ ] Numb\n", "- [x] Numb\n"), "the correct switch on option 3");
        // a reply: added by its own button (one write), then its words typed (one more)
        await press("o2-r-add");
        c.ok((await focusKey()) === "o2-r0-text", "Add a reply puts the focus in the new reply's words: " + await focusKey());
        const cur1 = await applied(n, cur, sub(cur, "- [x] Numb\n", "- [x] Numb\n  - \n"), "a reply added to option 3 (an empty reply row)");
        await typeLeave("o2-r0-text", "Numbness protects.");
        cur = await applied(n, cur1, sub(cur, "- [x] Numb\n", "- [x] Numb\n  - Numbness protects.\n"), "the new reply's words typed and left");
        await press("o1-r1-remove");
        cur = await applied(n, cur, sub(cur, "  - It is also useful.\n", ""), "the second reply of option 2 removed");
        // an option added at the end
        await press("o-add");
        c.ok((await focusKey()) === "o3-text", "Add an option puts the focus in the new row's words: " + await focusKey());
        const cur2 = await applied(n, cur, sub(cur, "  - Numbness protects.\n", "  - Numbness protects.\n- [ ] \n"), "an option added after the last one (before the hint)");
        await typeLeave("o3-text", "Tense");
        cur = await applied(n, cur2, sub(cur, "  - Numbness protects.\n", "  - Numbness protects.\n- [ ] Tense\n"), "its words typed and left");
        // a move that shifts the kept answer: asked, at the press
        const before3 = (await inputs()).join("|");
        await press("o2-up");
        const swapped72 = sub(cur, "- [x] Wound up\n  - That is the activating family.\n- [x] Numb\n  - Numbness protects.\n", "- [x] Numb\n  - Numbness protects.\n- [x] Wound up\n  - That is the activating family.\n");
        m = await asks(n, cur, "Move option 3 up (the kept answer is option 2)", [/where/, /saved answer/i], before3);
        await rshot("rows-ask-light");
        await press("o2-up"); await waitModal(o, true);
        const beforeMove = cur;
        cur = await changed(n, cur, swapped72, "Move option 3 up");
        await undoStep(); const ur = await disk(n, swapped72); await idle(o);
        c.ok(ur.ok && ur.text === beforeMove, "Undo gives the options back in their old order, byte for byte (the move was one step)");
        cur = ur.text;
        // a removal: asked; Cancel writes nothing
        await reopen(n, "[!choice|where]");
        await press("o0-remove");
        await asks(n, cur, "Remove option 1 (the kept answer is option 2)", [/where/], (await inputs()).join("|"));
        c.ok(text(n.file) === cur, "after Cancel the note is as it was");
        // the Markdown section and the rows follow each other both ways: the section is applied when it is left
        await openMd(o);
        const ta = o.page.locator(MD_AREA);
        const d0 = await area();
        await ta.fill(sub(d0, "- [x] Numb\n", "- [x] Numbed\n"));
        c.ok(text(n.file) === cur, "words typed in the Markdown are not written at a key");
        await leaveMd();
        cur = await applied(n, cur, sub(cur, "- [x] Numb\n", "- [x] Numbed\n"), "words typed in the Markdown and left are applied (the Markdown is the one control that can change the whole block)");
        c.ok((await inputs()).includes("o2-text=Numbed"), "and they are read back into the rows (option 3 now reads Numbed)");
        await undoStep(); const uv = await disk(n, cur); await idle(o);
        await reopen(n, "[!choice|where]");
        c.ok(uv.ok && uv.text === sub(cur, "- [x] Numbed\n", "- [x] Numb\n"), "Undo takes the Markdown change back, byte for byte"); cur = uv.text;
        const curBeforeCont = cur;
        await reopen(n, "[!choice|where]"); await openMd(o);
        // a second line of a REPLY (indented under the reply): the block stays whole and the rows cannot show it. (A line indented under an OPTION, with no reply above it,
        // is prose to the format: the question ends there and the line is another block's, which is not what this step is about.)
        const cont = sub(d0, "  - That is the settling system at work.\n", "  - That is the settling system at work.\n    and more\n");
        await ta.fill(cont); await leaveMd();
        cur = await applied(n, cur, sub(cur, "  - That is the settling system at work.\n", "  - That is the settling system at work.\n    and more\n"), "Markdown that the rows cannot show as it stands is applied as typed");
        const why = await refused();
        c.ok(!!why && /^The rows are not offered for this block/.test(why) && (await rowsShown()) === 0 && (await area()) === cont, `the rows give way to the reason (${JSON.stringify(why && why.slice(0, 150))}) and the Markdown is as typed`);
        await ta.fill(d0); await leaveMd();
        cur = await applied(n, cur, curBeforeCont, "the Markdown put back as the rows can show it: applied, byte for byte as before the continued line");
        c.ok((await rowsShown()) > 0 && (await refused()) === null, "and the rows come back");
        await closeBox();

      } catch (e) { c.ok(false, `script error in scene 1. a choice by rows, with kept answers (the scene stopped here, the next one goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); }
      // ================= 2. a choice with nothing kept: moves and removals write at once, no question
      try {
        n = await start(false); cur = n.t;
        await openQ(n, "[!choice|where]");
        await press("o2-up");
        cur = await applied(n, cur, sub(cur, "- [x] Wound up\n  - That is the activating family.\n  - It is also useful.\n- [ ] Numb\n", "- [ ] Numb\n- [x] Wound up\n  - That is the activating family.\n  - It is also useful.\n"), "option 3 moved up with nothing kept (replies travel with their option)");
        await press("o0-remove");
        cur = await applied(n, cur, sub(cur, "- [ ] Calm\n  - That is the settling system at work.\n", ""), "option 1 removed with nothing kept (its reply goes with it)");
        await undoStep(); u2 = await disk(n, cur); await idle(o);
        c.ok(u2.ok && u2.text === sub(cur, "- [ ] Numb\n", "- [ ] Calm\n  - That is the settling system at work.\n- [ ] Numb\n"), "Undo gives the removed option and its reply back, byte for byte");
        await closeBox();

      } catch (e) { c.ok(false, `script error in scene 2. a choice with nothing kept: moves and removals write at once, no question (the scene stopped here, the next one goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); }
      // ================= 3. a multi on a shared menu, the menu's own rows, a multi with open
      try {
        n = await start(true); cur = n.t;
        await openQ(n, "[!multi|morning");
        let picker = await o.page.locator(`${DV} .booklet-design-rows [data-key='menu']`).evaluate(e => ({ value: e.value, options: [...e.options].map(x => x.value + ":" + x.textContent) }));
        const usesLine = await o.evaluate(sel => (document.querySelector(sel + " .booklet-design-rows-usesmenu") || {}).textContent, DV);
        c.ok(picker.value === "places" && picker.options.join("|") === ":None: the question has its own options|places:places" && /^Uses the shared menu places\./.test(usesLine || "") && (await rowsShown()) === 2, `a multi on a menu shows the picker at "places" (${JSON.stringify(picker.options)}), the line ${JSON.stringify(usesLine)}, no option rows (only the picker and the button: ${await rowsShown()} controls)`);
        await rshot("rows-usesmenu-light");
        await press("menu-open"); await sleep(400);
        const menuAt = q(n, "[!menu|places]");
        c.ok(await o.page.locator(block("menu", menuAt) + ".is-open").count() === 1, "\"Go to the menu\" selects the shared menu's own block and opens it in place");
        const usedBy = await o.evaluate(sel => (document.querySelector(sel + " .booklet-design-rows-usedby") || {}).textContent, DV);
        c.ok(usedBy === "Used by: morning, evening", "the menu's rows say who uses it: " + JSON.stringify(usedBy));
        c.ok((await inputs()).join("|") === "i0-text=Park|i1-text=Garden|i2-text=Library", "the menu's three items are three rows: " + JSON.stringify(await inputs()));
        await rshot("rows-menu-light");
        await press("i-add");
        const cur3 = await applied(n, cur, sub(cur, "- Library\n", "- Library\n- \n"), "an item added at the end of the shared menu (nothing picked can move)");
        await typeLeave("i3-text", "Beach");
        cur = await applied(n, cur3, sub(cur, "- Library\n", "- Library\n- Beach\n"), "its words typed and left");
        const itemsBefore = (await inputs()).join("|");
        await press("i0-remove");
        m = await asks(n, cur, "Remove the menu's first item", [/morning/, /evening/, /saved answer/i], itemsBefore);
        c.ok(/morning/.test(m.text) && /evening/.test(m.text), "the dialog counts the answers of every question that uses the menu (morning and evening)");
        await press("i0-remove"); await waitModal(o, true);
        cur = await changed(n, cur, sub(cur, "- Park\n", ""), "Remove the menu's first item");
        await undoStep(); u2 = await disk(n, cur); await idle(o);
        c.ok(u2.ok && u2.text === sub(cur, "- Garden\n", "- Park\n- Garden\n"), "Undo puts the item back, byte for byte" + (u2.ok ? diff(sub(cur, "- Garden\n", "- Park\n- Garden\n"), u2.text) : "; the note did not change")); cur = u2.text;
        await closeBox();
        // the picker: none (the question has a kept answer, which counts), an own option, the menu again, none again
        await openQ(n, "[!multi|morning");
        await o.page.locator(RW("menu")).selectOption("");
        const askNone = await waitModal(o, true, 2500);
        if (askNone) {
          const mn = await modalInfo(o); c.info("choosing None on `morning` (a kept answer picked menu items 1 and 3) asks: " + JSON.stringify(mn.text.replace(/\s+/g, " ").slice(0, 240)) + " buttons " + JSON.stringify(mn.buttons));
          await clickModal(o, "Change");
        }
        cur = await applied(n, cur, sub(cur, "> [!multi|morning menu:places] This morning I went to…", "> [!multi|morning] This morning I went to…"), "choosing None takes menu:places off the opening line");
        c.ok((await o.evaluate(sel => (document.querySelector(sel + " .booklet-design-rows-none") || {}).textContent, DV)) === "Nothing here yet.", "and the rows say there are no options yet");
        await press("o-add");
        const cur4 = await applied(n, cur, sub(cur, "> [!multi|morning] This morning I went to…\n", "> [!multi|morning] This morning I went to…\n- [ ] \n"), "an own option added (one write)");
        await typeLeave("o0-text", "Own thing");
        // `morning` has a kept answer that picked options 1 and 3, so words typed into its first own option touch a kept answer: it asks, in the open (never a silent drop)
        c.info(`after typing "Own thing" in the new own option and Tab: the dialog is ${(await waitModal(o, true, 2500)) ? "open" : "NOT open"}; the field holds ${JSON.stringify(await o.page.locator(RW("o0-text")).inputValue())}`);
        await asks(n, cur4, "typing the words of the first own option (a kept answer of `morning` picked option 1)", [/morning/, /saved answer/i], "o0-text=");
        await typeLeave("o0-text", "Own thing");
        await waitModal(o, true, 2500);
        cur = await changed(n, cur4, sub(cur, "> [!multi|morning] This morning I went to…\n", "> [!multi|morning] This morning I went to…\n- [ ] Own thing\n"), "its words typed and left, and Change");
        await idle(o);
        c.ok((await state(o)).editBox && (await o.page.locator(RW("o0-text")).inputValue()) === "Own thing", "the box is still open and the row shows the words that were written");
        const own = cur;
        await o.page.locator(RW("menu")).selectOption("places");
        if (await waitModal(o, true, 2500)) { const mn = await modalInfo(o); c.info("choosing the menu again over an own option asks: " + JSON.stringify(mn.text.replace(/\s+/g, " ").slice(0, 240))); await clickModal(o, "Change"); }
        cur = await applied(n, cur, sub(cur, "> [!multi|morning] This morning I went to…\n- [ ] Own thing\n", "> [!multi|morning menu:places] This morning I went to…\n"), "choosing the menu again puts the own options away (they leave the note and are in the Undo step)");
        c.ok(/^Uses the shared menu places\./.test(await o.evaluate(sel => (document.querySelector(sel + " .booklet-design-rows-usesmenu") || {}).textContent, DV)), "the rows say the question uses the menu");
        await o.page.locator(RW("menu")).selectOption("");
        if (await waitModal(o, true, 2500)) await clickModal(o, "Change");
        cur = await applied(n, cur, own, "choosing None again brings the own options back as they were, byte for byte");
        c.ok((await inputs()).join("|") === "o0-text=Own thing", "and the row shows them: " + JSON.stringify(await inputs()));
        await closeBox();
        // the open switch with rows present, then choosing a menu for a question with a kept answer
        await openQ(n, "[!multi|outside");
        await o.page.locator(`${DV} .booklet-design-editbox .booklet-design-strip-item[data-field='open'] button[role=switch]`).click();
        cur = await applied(n, cur, sub(cur, "[!multi|outside open]", "[!multi|outside]"), "the open switch of the strip writes at once (the opening line only; both option rows are still there)");
        c.ok((await inputs()).length === 2, "both option rows are still there");
        await o.page.locator(RW("menu")).selectOption("places");
        await asks(n, cur, "Choose the menu for `outside`", [/outside/], (await inputs()).join("|"));
        c.ok(text(n.file) === cur, "declined: the note is as it was");
        await closeBox();

      } catch (e) { c.ok(false, `script error in scene 3. a multi on a shared menu, the menu's own rows, a multi with open (the scene stopped here, the next one goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); }
      // ================= 4. a matrix with anchors from 0, with a kept answer
      try {
        n = await start(true); cur = n.t;
        await openQ(n, "[!matrix|topics]");
        c.ok((await inputs()).join("|") === "i0-text=Spring tides|i1-text=Neap tides|a0-number=0|a0-text=Not yet|a1-number=1|a1-text=Getting there|a2-number=2|a2-text=Sure", "the matrix shows two items and three anchors, numbers 0 1 2, as rows: " + JSON.stringify(await inputs()));
        const heads4 = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-rows .setting-item-heading")].map(e => e.textContent.trim()), DV);
        c.ok(heads4.join("|") === "Items|Anchors (the number is the answer that is kept)", "two sections: " + JSON.stringify(heads4));
        await rshot("rows-matrix-light");
        await press("a-add");
        c.ok((await o.page.locator(RW("a3-number")).inputValue()) === "3" && (await focusKey()) === "a3-text", "Add an anchor takes the next number after the last (3) and puts the focus in its words");
        const cur5 = await applied(n, cur, sub(cur, "2. Sure\n", "2. Sure\n3. \n"), "an anchor added at the end (kept answers cannot move)");
        await typeLeave("a3-text", "Expert");
        cur = await applied(n, cur5, sub(cur, "2. Sure\n", "2. Sure\n3. Expert\n"), "its words typed and left");
        await press("i-add");
        const cur6 = await applied(n, cur, sub(cur, "- Neap tides\n", "- Neap tides\n- \n"), "an item added at the end of the items (the blank line above the anchors stays)");
        await typeLeave("i2-text", "Rip currents");
        cur = await applied(n, cur6, sub(cur, "- Neap tides\n", "- Neap tides\n- Rip currents\n"), "its words typed and left");
        await typeLeave("a0-text", "Not at all yet");
        cur = await applied(n, cur, sub(cur, "0. Not yet\n", "0. Not at all yet\n"), "an anchor nobody kept is reworded (the kept answers pick 1 and 2)");
        let rows4 = (await inputs()).join("|");
        await press("i1-up");
        await asks(n, cur, "Move item 2 up (items are answered by position)", [/topics/, /saved answer/i], rows4);
        await press("a1-remove");
        await asks(n, cur, "Remove the anchor \"Getting there\" (a kept answer picked number 1)", [/topics/, /saved answer/i], rows4);
        await typeIn("a2-text", "Very sure"); await o.page.keyboard.press("Tab");
        await asks(n, cur, "Reword the anchor \"Sure\" (a kept answer picked number 2)", [/topics/], null);
        c.ok(text(n.file) === cur && (await inputs()).join("|") === rows4, "the three declined changes left the note as it was, and the rows read what the note has");
        await press("a0-remove");
        const beforeAnchor = cur;
        cur = await applied(n, cur, sub(cur, "0. Not at all yet\n", ""), "the anchor 0 removed (no kept answer picked it: nothing is lost, so nothing is asked)");
        await undoStep(); const ua = await disk(n, cur); await idle(o);
        c.ok(ua.ok && ua.text === beforeAnchor, "Undo gives anchor 0 back, byte for byte"); cur = ua.text;
        await reopen(n, "[!matrix|topics]");
        await press("a1-down");
        cur = await applied(n, cur, sub(cur, "1. Getting there\n2. Sure\n", "2. Sure\n1. Getting there\n"), "anchors 2 and 3 swapped with their numbers (the numbers are the answers, so none moves)");
        await closeBox();
        // a matrix with no anchors: a first anchor, and the blank line a 0 list needs
        await openQ(n, "[!matrix|fresh]");
        c.ok((await o.evaluate(sel => (document.querySelector(sel + " .booklet-design-rows-none") || {}).textContent, DV)) === "Nothing here yet.", "a matrix with no anchors says so");
        await press("a-add");
        cur = await applied(n, cur, sub(cur, "- Tides\n", "- Tides\n1. \n"), "the first anchor is numbered 1 and needs no blank line");
        await typeLeave("a0-text", "Low");
        cur = await applied(n, cur, sub(cur, "1. \n", "1. Low\n"), "its words typed and left");
        await o.page.locator(RW("a0-number")).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("0"); await o.page.keyboard.press("Tab");
        cur = await applied(n, cur, sub(cur, "- Tides\n1. Low\n", "- Tides\n\n0. Low\n"), "numbering it 0 puts the blank line above it (a 0 list after a bullet list would else be read as part of it)");
        await closeBox();

      } catch (e) { c.ok(false, `script error in scene 4. a matrix with anchors from 0, with a kept answer (the scene stopped here, the next one goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); }
      // ================= 5. the blocks the rows cannot show
      try {
        n = await start(true, true, true); cur = n.t;
        await openQ(n, "[!choice|odd]");
        let why5 = await refused();
        c.ok(!!why5 && /^The rows are not offered for this block, so it is edited in the Markdown below\./.test(why5) && (await rowsShown()) === 0 && (await area()) === "> [!choice|odd] Odd one\n- [ ] One\n  - Said\n    and more", `a reply that goes on over a second line has no rows: the box says why (${JSON.stringify(why5)}) and the Markdown is as written`);
        c.ok(await o.page.locator(MD_AREA).isVisible(), "the reason says to edit in \"the Markdown below\" and the Markdown section is open when the block opens, so what it points at is there");
        c.info("reason shown for the continued reply: " + JSON.stringify(why5));
        await rshot("rows-refused-light");
        await closeBox();
        await openQ(n, "[!choice|both");
        let why5b = await refused();
        c.ok(!!why5b && (await rowsShown()) === 0 && (await o.page.locator(`${DV} .booklet-design-editbox .booklet-design-strip-item[data-field='menu']`).count()) === 1, `a question that names a menu and has its own options has no rows either (${JSON.stringify(why5b)}); its strip keeps the menu as a text field`);
        c.info("reason shown for menu plus own options: " + JSON.stringify(why5b));
        await closeBox();
        c.ok(text(n.file) === cur && (await writesOf(o, n.rel)) === 0, "opening and closing the blocks the rows refuse wrote nothing (no line was rewritten)");

      } catch (e) { c.ok(false, `script error in scene 5. the blocks the rows cannot show (the scene stopped here, the next one goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); }
      // ================= 6. a phone
      try {
        await o.page.setViewportSize({ width: 390, height: 844 });
        await mobile(o, true);
        await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
        n = await start(true, false);
        const judge = async label => {
          const pf = await phoneFacts(o), ours = pf.small.filter(x => x.own), others = pf.small.filter(x => !x.own), fit = await fitOf(o);
          c.ok(pf.bodyMobile && pf.docScroll <= pf.W + 1 && pf.vcScroll <= pf.vcClient + 1 && pf.wideCount === 0, `${label}: no sideways scroll (page ${pf.docScroll} of ${pf.W} px) and nothing sticks out${pf.wideCount ? ": " + JSON.stringify(pf.wide) : ""}`);
          const sc = await o.evaluate(sel => { const e = document.querySelector(sel + " .booklet-design-scroll"); return e ? { sw: e.scrollWidth, cw: e.clientWidth } : null; }, DV);
          c.ok(!sc || sc.sw <= sc.cw + 1, `${label}: the page's own scroller does not scroll sideways (${sc && sc.sw} of ${sc && sc.cw} px)`);
          c.ok(ours.length === 0, `${label}: every control of the plugin's is at least 44 px each way (${pf.controls} looked at)${ours.length ? "; smaller: " + JSON.stringify(ours.slice(0, 8)) : ""}`);
          c.ok(fit.clippedCount === 0 && fit.offCount === 0, `${label}: nothing cut off or off the screen${fit.clippedCount || fit.offCount ? ": " + JSON.stringify({ clipped: fit.clipped, off: fit.off }) : ""}`);
          if (others.length) c.info(`${label}: Obsidian's own controls under 44 px (not the plugin's): ${JSON.stringify(others.slice(0, 5))}`);
        };
        for (const [needle, kind, tag] of [["[!choice|where]", "question", "choice"], ["[!multi|morning", "question", "multi-menu"], ["[!multi|outside", "question", "multi-open"], ["[!menu|places]", "menu", "menu"], ["[!matrix|topics]", "question", "matrix"], ["[!choice|odd]", "question", "refused"]]) {
          await closeBox();
          await openQ(n, needle, kind);
          await judge("phone " + tag);
          await rshot("phone-rows-" + tag + "-light");
          if (tag === "choice" || tag === "matrix") { await o.setScheme("dark"); await sleep(400); await rshot("phone-rows-" + tag + "-dark"); await o.setScheme("light"); await sleep(300); }
        }
        // a move that asks, and a typed row, on the phone
        await closeBox(); await openQ(n, "[!choice|where]");
        await press("o2-up");
        await asks(n, n.t, "phone: Move option 3 up", [/where/], null);
        await rshot("phone-rows-ask-light");
        await closeBox();
        c.ok(text(n.file) === n.t, "phone: nothing written");

      } catch (e) { c.ok(false, `script error in scene 6. a phone (the scene stopped here, the next one goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); }
      // ================= 7. Spanish and French
      try {
        const rowKeys = Object.keys(table).filter(k => k.startsWith("rows."));
        const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k]));
        for (const [code, label] of [["es", "Spanish"], ["fr", "French"]]) {
          await o.page.setViewportSize({ width: vp0.w, height: vp0.h }).catch(() => {}); await mobile(o, false);
          await o.evaluate(code => { localStorage.setItem("language", code); }, code);
          await o.evaluate(() => { app.commands.executeCommandById("app:reload"); });
          await o.page.waitForFunction(code => !!(window.app && app.workspace && app.workspace.layoutReady) && window.i18next && window.i18next.language === code, code, { timeout: 40000, polling: 100 });
          await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
          c.ok(await o.evaluate(() => window.i18next.language) === code, `Obsidian is in ${label}`);
          const english = rowKeys.filter(k => table[k][code] !== undefined && table[k].en !== table[k][code] && !/\{/.test(table[k].en) && table[k].en.length >= 4).map(k => ({ k, en: table[k].en }));
          const scenes = async (tagWidth) => {
            const nn = await start(true, false);
            const want = (items, tag, list) => { const missing = list.filter(([k, v]) => { const w = fill(table[k][code] ?? table[k].en, v || {}); return !items.some(i => i.text === w); }).map(([k]) => k); c.ok(missing.length === 0, `${tagWidth} ${code} ${tag}: the words read in ${label} (${list.length} strings looked for)${missing.length ? "; not found: " + missing.join(", ") : ""}`); };
            const scene = async (needle, kind, tag, list) => {
              await closeBox(); await openQ(nn, needle, kind);
              const items = await readable(o), fit = await fitOf(o);
              fs.writeFileSync(path.join(SHOTS, `design-${code}-${tagWidth}-rows-${tag}-text-${VER}.json`), JSON.stringify(items, null, 1));
              want(items, tag, list);
              const wrong = english.filter(e => items.some(i => i.text === e.en && !/^drawn |booklet-design-(group|popup-label|tile-label|commonchip|samplepop-name|samplepop|tile)\b/.test(i.cls))).map(e => e.k);
              c.ok(wrong.length === 0, `${tagWidth} ${code} ${tag}: no row string shows in English (${items.length} texts read)${wrong.length ? ": " + wrong.join(", ") : ""}`);
              c.ok(items.filter(i => /\{\w+\}/.test(i.text)).length === 0, `${tagWidth} ${code} ${tag}: no {placeholder} left showing`);
              c.ok(fit.clippedCount === 0 && fit.offCount === 0 && fit.sideways <= 1 && fit.docSideways <= 1, `${tagWidth} ${code} ${tag}: nothing cut off, off the screen or scrolling sideways${fit.clippedCount || fit.offCount ? ": " + JSON.stringify({ clipped: fit.clipped, off: fit.off }) : ""}`);
              if (tagWidth === "phone") { const pf = await phoneFacts(o); const ours = pf.small.filter(x => x.own); c.ok(ours.length === 0 && pf.docScroll <= pf.W + 1, `phone ${code} ${tag}: every control of the plugin's is at least 44 px and nothing scrolls sideways${ours.length ? ": " + JSON.stringify(ours.slice(0, 6)) : ""}`); }
              await rshot(`${code}-${tagWidth}-rows-${tag}`);
            };
            // the row buttons are small pictures named by their label (a number is in each name), so those labels are what is looked for
            await scene("[!choice|where]", "question", "choice", [["rows.options"], ["rows.option.add"], ["rows.reply.add"], ["rows.menu.name"], ["rows.option.text", { n: 1 }], ["rows.option.correct.label", { n: 1 }], ["rows.reply.add.label", { n: 1 }], ["rows.option.remove", { n: 3 }], ["rows.option.up", { n: 1 }], ["rows.option.down", { n: 1 }]]);
            { await closeBox(); await openQ(nn, "[!choice|where]"); const pick = await o.page.locator(RW("menu")).evaluate(e => [...e.options].map(x => x.textContent)); c.ok(pick[0] === (table["rows.menu.none"][code] ?? table["rows.menu.none"].en), `${tagWidth} ${code}: the picker's first choice reads ${JSON.stringify(pick[0])}`); }
            await scene("[!multi|morning", "question", "multi-menu", [["rows.menu.uses", { id: "places" }], ["rows.menu.open"], ["rows.menu.open.label", { id: "places" }]]);
            await scene("[!menu|places]", "menu", "menu", [["rows.items"], ["rows.item.add"], ["rows.menu.usedby", { ids: "morning, evening" }], ["rows.item.text", { n: 1 }], ["rows.item.remove", { n: 1 }]]);
            await scene("[!matrix|topics]", "question", "matrix", [["rows.items"], ["rows.anchors"], ["rows.anchor.add"], ["rows.item.add"], ["rows.anchor.number", { n: 1 }], ["rows.anchor.text", { n: 1 }], ["rows.anchor.up", { n: 1 }]]);
            await scene("[!choice|odd]", "question", "refused", []);
            // the ask dialog with a row move
            await closeBox(); await openQ(nn, "[!choice|where]");
            await press("o2-up"); await waitModal(o, true);
            const mi = await modalInfo(o), fit = await fitOf(o);
            const mw = await o.evaluate(() => { const r = document.querySelector(".modal-container .modal").getBoundingClientRect(); return { l: r.left, r: r.right, w: window.innerWidth }; });
            c.ok(!!mi && mi.buttons.length === 2 && mw.l >= 0 && mw.r <= mw.w + 1 && fit.clippedCount === 0, `${tagWidth} ${code}: the ask dialog fits (${JSON.stringify(mi && mi.buttons)}, ${Math.round(mw.l)}..${Math.round(mw.r)} of ${mw.w} px)`);
            await rshot(`${code}-${tagWidth}-rows-ask`);
            await o.page.keyboard.press("Escape"); await waitModal(o, false); await sleep(200);
            await closeBox();
            c.ok(text(nn.file) === nn.t, `${tagWidth} ${code}: nothing written by the scene`);
          };
          await scenes("desktop");
          await o.page.setViewportSize({ width: 390, height: 844 }); await mobile(o, true);
          await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
          await scenes("phone");
        }
      } catch (e) { c.ok(false, `script error in scene 7. Spanish and French (the scene stopped here, the next one goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); }
    });
    return c;
  }

  const closeAll = async o => { for (let i = 0; i < 3 && (await state(o)).editBox; i++) { await o.page.keyboard.press("Escape"); await sleep(250); } };

  /* ================= CHECK 73 ================= */
  // Typing in a field of the open block and then leaving it at once, with REAL input only: Playwright's keyboard (keystrokes) and mouse (move, press,
  // release at a button's centre), never fill() or a dispatched event for what is under test. This is the guard against "typing and then immediately
  // clicking is swallowed" and against a write drawing the box again under a press that has begun (beta.2: the press took the focus out of a row, the
  // typing was written, the box was drawn again with its buttons moved, and the release landed on nothing). In stage 2b there is no Save and no Cancel,
  // so the old scenes are these: (a) Ctrl+Enter applies the typed title and closes; (b) one real press on "Add an option" straight after typing in the
  // title lands on its button: two writes (the title, the new row), the buttons did not move under the press, no error; (c) one Esc after typing applies
  // it and closes (it used to keep the box and say "Unsaved"; now nothing is ever waiting); (d) a matrix anchor's number typed and Ctrl+Enter at once.
  // On Linux Obsidian's Mod key is Control, so Ctrl+Enter is what is pressed; Cmd+Enter (Meta+Enter on a Mac) goes through a fallback keydown listener
  // that a unit test covers. A write is counted with a vault "modify" listener on the note (the check's own, in the page).
  async function check73() {
    const c = new Check(73, "typing in a field of the open block and leaving the box at once, real keys and mouse: Ctrl+Enter applies the typed title and closes (one write, the note otherwise byte for byte); one real press on \"Add an option\" straight after typing lands on its button, the buttons do not move under the press, and the title and the new row are two writes with no error; one Esc applies the typing and closes (nothing is ever \"Unsaved\"); a typed matrix anchor number is applied by Ctrl+Enter without asking (Cmd+Enter is not pressed: no Mac here)");
    const NEWT = "Which fruit would you pick?", OLDT = "Which fruit would you take?";
    const note73 = name => [
      "---", "booklet: \"0.20\"", `id: booklet-test/typing-${name}`, `title: Typing ${name}`, "lang: en", "---", "",
      "> [!module|m] Fruit", "", "> [!activity|a] Choosing", "",
      `> [!choice|fruit] ${OLDT}`, "- [ ] Apple", "- [x] Pear", "",
      "> [!matrix|sure] How sure are you of each topic?", "", "- Spring tides", "- Neap tides", "", "0. Not yet", "1. Sure", "",
      "> [!module|m end]", "",
    ].join("\n");
    await withApp("c73", async (o, vault) => {
      let seq = 0;
      const errs0 = consoleReport.length;
      const mk = () => { const name = "s" + (++seq), rel = `Typing ${name}.booklet.md`, t = note73(name); return { rel, file: put(vault, rel, t), t }; };
      const start = async () => { const n = mk(); await openDesign(o, n.rel); await goNav(o, "activity", lineOf(n.t, "[!activity|a]")); await armWrites(o, n.rel); return n; };
      const open = async (n, needle) => { await clickBlock(o, "question", lineOf(n.t, needle)); await sleep(150); };
      /** What the box shows now, as a person sees it: where the focus is and where the box's buttons stand. */
      const geom = () => o.evaluate(sel => { const q = s => document.querySelector(sel + " " + s), r = e => { const b = e && e.getBoundingClientRect(); return b ? [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10] : null; }; const st = document.querySelector(sel + " .booklet-design-status"); return { status: st ? st.textContent : null, statusPos: st ? getComputedStyle(st).position : null, strip: r(st), top: r(q(".booklet-design-top")), scroll: r(q(".booklet-design-scroll")), title: r(q(".booklet-design-field.is-title")), add: r(q("[data-key='o-add']")), box: r(q(".booklet-design-editbox")) }; }, DV);
      const look = () => o.evaluate(sel => {
        const g = s => document.querySelector(sel + " " + s), a = document.activeElement, add = g("[data-key='o-add']"), r = add && add.getBoundingClientRect();
        return { focus: a ? (a.closest("[data-field]") ? a.closest("[data-field]").getAttribute("data-field") : (a.getAttribute("data-key") || a.className || a.tagName)) : null, add: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null, unsaved: /unsaved/i.test((g(".booklet-design-editbox") || { textContent: "" }).textContent) };
      }, DV);
      /** A real click into the title field and real keystrokes that replace its words; the field is NOT left. */
      const typeTitle = async () => { await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type(NEWT); await sleep(200); };
      const wantNew = n => sub(n.t, `[!choice|fruit] ${OLDT}`, `[!choice|fruit] ${NEWT}`);
      const diffs = (want, got) => want === got ? "" : "; DIFFERS " + JSON.stringify(region(want, got)).slice(0, 300);

      let n, lk, r, st, w;
      // ----- a. Ctrl+Enter at once
      try {
        n = await start();
        await open(n, "[!choice|fruit]");
        c.ok(await o.page.locator(TITLE_F).inputValue() === OLDT, "the title field of the choice reads " + JSON.stringify(OLDT));
        await typeTitle();
        lk = await look();
        c.ok(lk.focus === "title" && await o.page.locator(TITLE_F).inputValue() === NEWT && text(n.file) === n.t, "a: the typed words are in the title field, the focus is still there, nothing is written yet (a key is never a write)");
        await shot(o, "typing-a-typed");
        await o.page.keyboard.press("Control+Enter");
        r = await waitDisk(n.file, tx => tx !== n.t); await sleep(700); await idle(o);
        st = await state(o), w = await writesOf(o, n.rel);
        c.ok(r.ok && text(n.file) === wantNew(n), `a: Ctrl+Enter at once wrote the typed title and nothing else (the whole expected note, byte for byte)${diffs(wantNew(n), text(n.file))}`);
        c.ok(!st.editBox && !st.modal && /^Changed /.test(st.status), `a: the block closed, nothing was asked, and the status says what changed (${JSON.stringify(st.status)})`);
        c.ok(w === 1, `a: exactly one write to the note (${w} modify events)`);
        await shot(o, "typing-a-saved");
        await closeAll(o);

      } catch (e) { c.ok(false, `script error in scene a. Ctrl+Enter at once (the scene stopped here, the next one goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); }
      // ----- b. one real press on a button of the box straight after typing: the typing is applied, the press lands
      try {
        n = await start();
        await open(n, "[!choice|fruit]");
        await typeTitle();
        await o.page.locator(`${DV} [data-key='o-add']`).scrollIntoViewIfNeeded(); await sleep(250);
        lk = await look();
        const before = lk.add;
        c.ok(!!before && before.y >= 0 && before.y + before.h <= await o.evaluate(() => window.innerHeight), `b: the "Add an option" button is on the screen (y ${Math.round(before.y)}, ${Math.round(before.h)} px high) and the title still has the focus (${lk.focus})`);
        const th0 = await o.evaluate(sel => document.querySelector(sel).getBoundingClientRect().height, TITLE_F);
        // the status line is empty before the first write (this is what moved the page by its own height in beta: the first words in it pushed the page down); its strip is in the flow with its one line of height already, so the first words take no room
        const g0 = await geom();
        c.ok(g0.status === "" && g0.statusPos !== "absolute" && g0.statusPos !== "fixed" && !!g0.strip && g0.strip[3] >= 16, `b: before the first write the status line is empty and its strip is in the flow with its height already (position ${g0.statusPos}, ${JSON.stringify(g0.strip)}, text ${JSON.stringify(g0.status)})`);
        await o.page.mouse.move(before.x + before.w / 2, before.y + before.h / 2);
        await o.page.mouse.down();
        await sleep(300);
        const during = await look();
        const g1 = await geom();
        c.ok(/^Changed /.test(g1.status || ""), `b: the press had already written the typed title while it was held (status ${JSON.stringify(g1.status)}), so the geometry below was measured after a write`);
        c.ok(JSON.stringify([g0.top, g0.strip, g0.scroll, g0.title, g0.add, g0.box]) === JSON.stringify([g1.top, g1.strip, g1.scroll, g1.title, g1.add, g1.box]), `b: a write moved nothing: the header, the status strip, the scroll area, the title, the Add button and the box have the same rectangles before and after it (${JSON.stringify({ add0: g0.add, add1: g1.add, scroll0: g0.scroll, scroll1: g1.scroll })})`);
        c.info(`b: the title field is ${await o.evaluate(sel => document.querySelector(sel).getBoundingClientRect().height, TITLE_F)} px high while the button is held; lines of the title: ${JSON.stringify(await o.evaluate(sel => document.querySelector(sel).value, TITLE_F))}; was ${th0}`);
        c.ok(!!during.add && Math.abs(during.add.y - before.y) < 1 && Math.abs(during.add.x - before.x) < 1 && !during.unsaved, `b: while the button is held down the box did not move or change (the button at y ${Math.round(before.y)} then ${Math.round(during.add && during.add.y)}; the focus is on ${during.focus})`);
        await shot(o, "typing-b-pressed");
        await o.page.mouse.up();
        r = await waitDisk(n.file, tx => tx !== n.t && /\n- \[ \] ?\n/.test(tx)); await sleep(700); await idle(o);
        st = await state(o); w = await writesOf(o, n.rel);
        const wantB = text(n.file);
        c.ok(r.ok && wantB === sub(wantNew(n), "- [x] Pear\n", "- [x] Pear\n- [ ] \n"), `b: the first and only press on the button wrote the typed title AND added the row, nothing else, byte for byte${diffs(sub(wantNew(n), "- [x] Pear\n", "- [x] Pear\n- [ ] \n"), wantB)}`);
        c.ok(st.editBox && !st.modal && w === 2, `b: the box is still open, nothing was asked, ${w} write(s): the title and the new row`);
        const fAfter = await o.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute("data-key") || a.getAttribute("data-field") || a.className || a.tagName) : null; });
        c.ok(fAfter === "o2-text", `b: the focus is in the new row's words (it is on ${JSON.stringify(fAfter)})`);
        await shot(o, "typing-b-saved");
        await undoBtn(o).click(); r = await waitDisk(n.file, tx => tx === wantNew(n)); await idle(o);
        await undoBtn(o).click(); const ub = await waitDisk(n.file, tx => tx === n.t); await idle(o);
        c.ok(r.ok && ub.ok, "b: two Undos give the note back byte for byte (each write was its own step)");
        await closeAll(o);

      } catch (e) { c.ok(false, `script error in scene b. one real press on a button of the box straight after typing: the typing is applied, the press lands (the scene stopped here, the next one goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); }
      // ----- b2. a LONG new title, then a real press on the button: the write happens at the press, and the page (drawn again only when the pointer is up; the trail above it is the page's and does not change) does not move under it
      try {
        n = await start();
        await open(n, "[!choice|fruit]");
        const LONGT = "Which fruit would you pick if you could only have one of them for the whole of the rest of this long and rather tiring week, and why that one and not another?";
        await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type(LONGT); await sleep(200);
        await o.page.locator(`${DV} [data-key='o-add']`).scrollIntoViewIfNeeded(); await sleep(250);
        const q0 = await geom();
        await o.page.mouse.move(q0.add[0] + q0.add[2] / 2, q0.add[1] + q0.add[3] / 2);
        await o.page.mouse.down(); await sleep(400);
        const q1 = await geom();
        c.ok(/^Changed /.test(q1.status || "") && JSON.stringify([q0.top, q0.strip, q0.scroll, q0.add]) === JSON.stringify([q1.top, q1.strip, q1.scroll, q1.add]), `b2: a long title written at the press moved neither the header, the page nor the button while it was held (button ${JSON.stringify(q0.add)} then ${JSON.stringify(q1.add)}, header ${JSON.stringify(q0.top)} then ${JSON.stringify(q1.top)}; status ${JSON.stringify((q1.status || "").slice(0, 40))})`);
        await o.page.mouse.up();
        r = await waitDisk(n.file, tx => tx !== n.t && /\n- \[ \] ?\n/.test(tx)); await sleep(700); await idle(o);
        w = await writesOf(o, n.rel);
        c.ok(r.ok && w === 2, `b2: the press landed: the long title and the new row are two writes (${w})`);
        await closeAll(o);
      } catch (e) { c.ok(false, `script error in scene b2. a long title, then a press on a button: ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); }
      // ----- c. Escape after typing applies and closes
      try {
        n = await start();
        await open(n, "[!choice|fruit]");
        await typeTitle();
        await o.page.keyboard.press("Escape");
        r = await waitDisk(n.file, tx => tx !== n.t); await sleep(500); await idle(o);
        st = await state(o); w = await writesOf(o, n.rel); lk = await look();
        c.ok(r.ok && text(n.file) === wantNew(n) && !st.editBox && w === 1, `c: one Esc after typing wrote the typed title (byte for byte${diffs(wantNew(n), text(n.file))}) and closed the block (${w} write(s)); the status says ${JSON.stringify(st.status)}`);
        c.ok(!lk.unsaved && !/Unsaved|thrown away/i.test(st.status), "c: nothing says Unsaved or that anything was thrown away");
        await shot(o, "typing-c-closed");
        await closeAll(o);

      } catch (e) { c.ok(false, `script error in scene c. Escape after typing applies and closes (the scene stopped here, the next one goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); }
      // ----- d. a matrix anchor's number, Ctrl+Enter at once; no kept answers, so nothing is asked
      try {
        n = await start();
        await open(n, "[!matrix|sure]");
        const ins = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-rows input[data-key]")].map(e => e.getAttribute("data-key") + "=" + e.value).join("|"), DV);
        c.ok(ins === "i0-text=Spring tides|i1-text=Neap tides|a0-number=0|a0-text=Not yet|a1-number=1|a1-text=Sure", "d: the matrix shows its two items and its two anchors as rows: " + ins);
        const NUM = `${DV} .booklet-design-rows [data-key='a1-number']`;
        await o.page.locator(NUM).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("4"); await sleep(200);
        lk = await look();
        c.ok(lk.focus === "a1-number" && await o.page.locator(NUM).inputValue() === "4" && text(n.file) === n.t, "d: the new number is typed in the anchor's field, the focus is still there, nothing is written yet");
        await shot(o, "typing-d-typed");
        await o.page.keyboard.press("Control+Enter");
        r = await waitDisk(n.file, tx => tx !== n.t); await sleep(700); await idle(o);
        st = await state(o); w = await writesOf(o, n.rel);
        const wantD = sub(n.t, "1. Sure\n", "4. Sure\n");
        c.ok(r.ok && text(n.file) === wantD, `d: Ctrl+Enter at once wrote the new anchor number (the words are unchanged) and nothing else, byte for byte${diffs(wantD, text(n.file))}`);
        c.ok(!st.editBox && !st.modal && w === 1, `d: it asked nothing (no kept answers), the block closed, status ${JSON.stringify(st.status)}, ${w} write(s)`);
        await shot(o, "typing-d-saved");
        c.info("Cmd+Enter (Meta+Enter) is not pressed: on Linux Obsidian's Mod key is Control; the Meta path is a fallback keydown listener covered by a unit test");
        const errs = errorsSince(errs0);
        c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
      } catch (e) { c.ok(false, `script error in scene d. a matrix anchor's number, Ctrl+Enter at once; no kept answers, so nothing is asked (the scene stopped here, the next one goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); }
    });
    return c;
  }


  /* ================= CHECK 74 ================= */
  // The canvas drawn in the plugin's own looks. One made-up note; the Design view's canvas (the scroll element with the page on it) takes Paper and petrol
  // light or dark, or Obsidian's look, from the selector in the header; the left column, the header and the trail stay in Obsidian's look.
  const LOOKS74 = [["paper-light", "Paper and petrol: light"], ["paper-dark", "Paper and petrol: dark"], ["obsidian", "Obsidian"]];
  const note74 = [
    "---", "booklet: \"0.20\"", "id: booklet-test/looks", "title: Looks of the page", "lang: en", "---", "",
    "> [!module|m] Feelings", "", "> [!activity|a] How it went", "",
    "Some words to start with: **bold**, *slanted* and a [[Link]].", "",
    "> [!note] A callout", "> Words in the callout, as a reader sees them.", "",
    "> [!choice|where] Where are you right now?", "- [ ] Calm", "  - That is the settling system at work.", "- [x] Wound up", "  - That is the activating family.", "- [ ] Numb", "",
    "> [!matrix|topics] How sure are you of each topic?", "", "- Spring tides", "- Neap tides", "", "0. Not yet", "1. Getting there", "2. Sure", "",
    "> [!module|m end]", "",
  ].join("\n");
  const CV = `${DV} .booklet-design-scroll`, SEL74 = `${DV} .booklet-design-look-select`;
  /** What the canvas, the left column and the header look like now, as computed styles; and the paper tokens or Obsidian's variables to compare with. */
  const facts74 = o => o.evaluate(([cv, dvSel]) => {
    const rgb = css => { const cx = (window.__c74cx ||= document.createElement("canvas").getContext("2d", { willReadFrequently: true })); cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]].join(","); };
    const scroll = document.querySelector(cv), dv = document.querySelector(dvSel);
    const cs = e => getComputedStyle(e);
    const probe = (host, prop) => { const p = host.ownerDocument.createElement("div"); p.setAttribute("style", `color:var(${prop});position:absolute;visibility:hidden`); host.appendChild(p); const c = cs(p).color; p.remove(); return rgb(c); };
    const q = dv.querySelector(".booklet-design-scroll .booklet-sample-question .booklet-prompt, .booklet-design-scroll .booklet-sample-question .booklet-question-text, .booklet-design-scroll .booklet-sample-question");
    const lookAttr = scroll.getAttribute("data-booklet-look");
    const sel = dv.querySelector(".booklet-design-look-select");
    return {
      attr: lookAttr, isView: scroll.classList.contains("booklet-view"), select: sel ? sel.value : null,
      canvasBg: rgb(cs(scroll).backgroundColor), questionInk: q ? rgb(cs(q).color) : null,
      paper: probe(scroll, "--bk-paper"), ink: probe(scroll, "--bk-ink"), obsBg: probe(document.body, "--background-secondary-alt"), obsInk: probe(document.body, "--text-normal"),
      left: [".booklet-design-left", ".booklet-design-top", ".booklet-design-crumb", ".booklet-design-tab[aria-selected='true']", ".booklet-design-undo"].map(s => { const e = dv.querySelector(s); if (!e) return s + ":none"; const c = cs(e); return [s, c.backgroundColor, c.color, c.fontFamily, c.fontSize, c.borderTopColor].join("|"); }),
      pageBg: rgb(cs(dv.querySelector(".booklet-design-page")).backgroundColor), pageFont: cs(dv.querySelector(".booklet-design-page-title")).fontFamily,
      callout: (() => { const e = dv.querySelector(".booklet-design-scroll .callout"); if (!e) return null; const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }, lum = k => { const [r, g, b] = rgb(k).split(",").map(Number); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }, ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05); const body = e.querySelector(".callout-content, p") || e, c = cs(e); return { blend: c.mixBlendMode, onPage: Math.round(ratio(c.backgroundColor, cs(dv.querySelector(".booklet-design-page")).backgroundColor) * 100) / 100, text: Math.round(ratio(cs(body).color, c.backgroundColor) * 100) / 100 }; })(),
    };
  }, [CV, DV]);
  /** Contrast of everything in the open edit box: each text against what is behind it (4.5), each control's edge or fill against what is behind it (3). */
  const edit74 = (o, sel = `${DV} .booklet-design-editbox`, skip = null, only = null) => o.evaluate(([sel, skip, only]) => {
    const root = document.querySelector(sel); if (!root) return null;
    const cx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const px = css => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; };
    const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const hex = c => "#" + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
    const behind = (el, self) => { const chain = []; for (let p = self ? el : el.parentElement; p; p = p.parentElement) chain.push(p); let col = { r: 255, g: 255, b: 255, a: 1 }; for (let i = chain.length - 1; i >= 0; i--) { const b = px(getComputedStyle(chain[i]).backgroundColor); if (b.a > 0) col = over(b, col); } return col; };
    const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !e.closest("[hidden]") && !e.closest("[inert]") && !e.closest("details:not([open]) > :not(summary)"); };
    const name = e => e.tagName.toLowerCase() + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "") + (e.getAttribute("data-key") ? "[" + e.getAttribute("data-key") + "]" : "") + "(" + ((e.getAttribute("aria-label") || e.value || e.textContent || "").trim().slice(0, 18)) + ")";
    const texts = [], controls = [], seen = new Set();
    const isControl = e => e.matches("button, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select, [role=switch], [role=checkbox], .checkbox-container");
    // the box's own words and controls are measured (a drawing inside it, if any, is inert and has its own check in 65: `skip` leaves such a part out)
    for (const e of root.querySelectorAll("*")) {
      if ((skip && e.closest(skip)) || !vis(e)) continue;
      const cs = getComputedStyle(e), own = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(" ");
      if (e.matches("input[type=checkbox], input[type=radio]") || parseFloat(cs.opacity) === 0) { /* a toggle's own box is measured as its container below */ } 
      const live = e.matches("input[type=checkbox], input[type=radio]") || parseFloat(cs.opacity) === 0 ? "" : e.matches("input:not([type=hidden]), textarea, select") ? (e.value || e.placeholder || "x") : own;
      if (live && !seen.has(e)) {
        seen.add(e);
        const under = behind(e, true), fg = over(px(cs.color), under), size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700, large = size >= 24 || (size >= 18.66 && bold);
        texts.push({ n: name(e), fg: hex(fg), bg: hex(under), ratio: Math.round(ratio(fg, under) * 100) / 100, need: large ? 3 : 4.5, disabled: !!e.disabled, ph: !e.value && !!e.placeholder });
      }
      if (only ? e.matches(only) : isControl(e)) {
        // a words field of the open block is drawn as the block's own words, with a rule under it as its edge: its bottom edge is the one measured
        const bottom = e.matches(".booklet-design-field"), side = bottom ? "Bottom" : "Top";
        const under = behind(e, false), fill = over(px(cs.backgroundColor), under), bw = parseFloat(cs["border" + side + "Width"]) || 0, edge = bw > 0 && cs["border" + side + "Style"] !== "none" ? over(px(cs["border" + side + "Color"]), under) : null;
        const fr = ratio(fill, under), er = edge ? ratio(edge, under) : 0;
        controls.push({ n: name(e), edge: edge ? hex(edge) : null, edgeRatio: Math.round(er * 100) / 100, fill: hex(fill), fillRatio: Math.round(fr * 100) / 100, under: hex(under), best: Math.round(Math.max(er, fr) * 100) / 100, role: e.getAttribute("role") || e.tagName.toLowerCase(), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) });
      }
    }
    return { texts, controls };
  }, [sel, skip, only]);
  /** Scrolls the canvas (and only it: scrollIntoView would also move the panes around it) so that `sel` is at its top or middle. */
  const toCanvas = (o, sel, block = "center") => o.evaluate(([cv, s, b]) => {
    const sc = document.querySelector(cv), e = document.querySelector(s); if (!sc || !e) return;
    for (let p = sc; p && p !== document.body; p = p.parentElement) if (p !== sc && p.scrollTop) p.scrollTop = 0;
    const r = e.getBoundingClientRect(), c = sc.getBoundingClientRect();
    sc.scrollTop += b === "start" ? r.top - c.top - 8 : r.top - c.top - (c.height - r.height) / 2;
  }, [CV, sel, block]);
  const shotEl = async (o, name, sel, block = "center") => { await toCanvas(o, sel, block); await sleep(250); await shot(o, name); };

  async function check74() {
    const c = new Check(74, "the canvas in its own looks: the Design view's page, callout, choice, matrix and open edit box drawn in Paper and petrol light, Paper and petrol dark and Obsidian's look, in both Obsidian modes, from a look selector in the header (a dropdown named \"Look\", keyboard operable, kept while the view lives, not saved); the paper tokens on the canvas and Obsidian's variables in Obsidian's look; the left column and the header unchanged by the selector; the edit box's text 4.5 to 1 and controls' edges 3 to 1 in both paper looks; on a phone the selector is reachable and 44 px; screenshots");
    await withApp("c74", async (o, vault) => {
      const vp0 = await o.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
      const rel = "Looks of the page.booklet.md";
      const file = put(vault, rel, note74), T0 = text(file);
      await openDesign(o, rel);
      await goNav(o, "activity", lineOf(T0, "[!activity|a]"));
      const pick = async look => { await o.page.selectOption(SEL74, look); await o.page.waitForFunction(([cv, l]) => document.querySelector(cv).getAttribute("data-booklet-look") === l, [CV, look], { timeout: 4000, polling: 30 }); await sleep(250); };
      const sameness = {};
      // ---- the selector itself
      const names = await o.evaluate(sel => { const s = document.querySelector(sel), l = s.closest("label"); return { options: [...s.options].map(x => x.value + "=" + x.textContent), label: l ? l.textContent.trim().slice(0, 12) : null, tag: s.tagName, inBar: !!s.closest(".booklet-design-bar[role='toolbar']"), shown: s.getBoundingClientRect().width > 0 }; }, SEL74);
      c.ok(names.tag === "SELECT" && names.shown && names.inBar && names.options.join("|") === LOOKS74.map(([v, t]) => v + "=" + t).join("|"), "the header's toolbar has a dropdown of the three looks, in the plugin's own words: " + JSON.stringify(names.options));
      const accName = await o.page.locator(SEL74).evaluate(e => { const l = e.closest("label"); return l ? l.textContent.replace(e.textContent, "").trim() : ""; });
      c.ok(accName === "Look", "the dropdown is named by the visible word " + JSON.stringify(accName));
      // ---- by default: the look follows Obsidian's mode, with nothing chosen
      await o.setScheme("light"); await sleep(400);
      let f = await facts74(o);
      c.ok(f.attr === "paper-light" && f.select === "paper-light" && f.isView, `nothing chosen, Obsidian light: the canvas is in Paper and petrol light and the dropdown says so (${f.attr}, ${f.select})`);
      await o.setScheme("dark"); await sleep(500);
      f = await facts74(o);
      c.ok(f.attr === "paper-dark" && f.select === "paper-dark", `nothing chosen, Obsidian dark: the canvas follows to Paper and petrol dark (${f.attr}, ${f.select})`);
      await o.setScheme("light"); await sleep(400);
      // a choice is kept while the mode changes
      await pick("obsidian");
      await o.setScheme("dark"); await sleep(500);
      f = await facts74(o);
      c.ok(f.attr === "obsidian" && f.select === "obsidian" && !f.isView, `a choice (Obsidian) is kept when Obsidian's mode changes (${f.attr}); the canvas is not a .booklet-view in Obsidian's look`);
      await o.setScheme("light"); await sleep(400);
      // keyboard: the dropdown has the focus and the arrow keys change the look
      await o.page.focus(SEL74); await o.page.keyboard.press("ArrowUp"); await sleep(300);
      f = await facts74(o);
      c.ok(f.attr === "paper-dark" && f.select === "paper-dark", `the dropdown works from the keyboard: the focus on it and the Up arrow took Obsidian's look to ${f.attr}`);
      await o.page.keyboard.press("ArrowUp"); await sleep(300);
      c.ok((await facts74(o)).attr === "paper-light", "and once more to Paper and petrol light");
      c.ok(text(file) === T0, "choosing a look writes nothing to the note");
      // a reload of the view starts from the default again (the choice is not saved)
      // ---- every look in both modes
      const SHOTS74 = [["head", `${CV} .booklet-design-page-head`, "start"], ["callout", `${CV} .callout`, "center"], ["choice", `${CV} .booklet-design-block[data-kind='question'] .booklet-sample-question, ${CV} .booklet-design-block[data-kind='question']`, "center"], ["matrix", `${CV} .booklet-design-block[data-kind='question'][data-start='${lineOf(T0, "[!matrix|topics]")}']`, "center"]];
      const byLook = {};
      for (const scheme of ["light", "dark"]) {
        await o.setScheme(scheme); await sleep(500);
        for (const [look] of LOOKS74) {
          await pick(look);
          await goNav(o, "activity", lineOf(T0, "[!activity|a]"));
          const tag = `${look}-${scheme}`;
          f = await facts74(o); byLook[tag] = f;
          c.ok(f.attr === look && f.select === look && f.isView === (look !== "obsidian"), `${tag}: the canvas carries data-booklet-look=${look}`);
          if (look === "obsidian") c.ok(f.canvasBg === f.obsBg && f.questionInk === f.obsInk, `${tag}: the canvas background (${f.canvasBg}) and the question text (${f.questionInk}) are Obsidian's own variables (${f.obsBg}, ${f.obsInk})`);
          else c.ok(f.canvasBg === f.paper && f.questionInk === f.ink && f.paper !== f.obsBg, `${tag}: the canvas background (${f.canvasBg}) is --bk-paper (${f.paper}) and the question text (${f.questionInk}) is --bk-ink (${f.ink})`);
          if (look !== "obsidian") c.ok(!!f.callout && f.callout.blend === "normal" && f.callout.text >= 4.5 && f.callout.onPage >= 1.05, `${tag}: the callout is drawn as it is (mix-blend-mode ${f.callout && f.callout.blend}, not blended into the sheet by Obsidian's mode), its words are ${f.callout && f.callout.text} to 1 on its tint and the tint shows against the page (${f.callout && f.callout.onPage} to 1)`);
          for (const [name, sel, block] of SHOTS74) await shotEl(o, `looks-${tag}-${name}`, sel, block);
          // an open edit box, with rows: the choice
          await clickBlock(o, "question", lineOf(T0, "[!choice|where]")); await sleep(250);
          const ed = await edit74(o);
          byLook[tag].edit = ed;
          await shotEl(o, `looks-${tag}-edit`, `${DV} .booklet-design-editbox`, "start");
          await shotEl(o, `looks-${tag}-edit-rows`, `${DV} .booklet-design-rows`, "start");
          if (look !== "obsidian") {
            const lowText = ed.texts.filter(t => !t.disabled && t.ratio < t.need), lowCtl = ed.controls.filter(x => x.best < 3);
            c.ok(ed.texts.length > 8 && lowText.length === 0, `${tag}: the open edit box's ${ed.texts.length} texts all reach their contrast (4.5 to 1)${lowText.length ? "; below: " + JSON.stringify(lowText.slice(0, 8)) : ""}`);
            c.ok(ed.controls.length > 8 && lowCtl.length === 0, `${tag}: the open edit box's ${ed.controls.length} controls each have an edge or fill of 3 to 1 on what is behind them${lowCtl.length ? "; below: " + JSON.stringify(lowCtl.slice(0, 10)) : ""}`);
          }
          await closeAll(o);
          await sleep(200);
          // the selection outline, the floating bar and the "+" slots on a shut selected block
          await o.evaluate(sel => { const e = document.querySelector(sel); if (e) e.scrollTop = 0; }, CV);
          await selectBlock(o, "question", lineOf(T0, "[!choice|where]"));
          await shotEl(o, `looks-${tag}-selected`, `${CV} .booklet-design-block.is-selected`, "center");
          if (look !== "obsidian") {
            // the page with a block selected (its outline, label and floating bar), the "+" slots and the page head: the canvas' own words and the plus marks
            const pg = await edit74(o, CV, ".booklet-sample, [inert]", ".booklet-design-slot-plus, .booklet-design-floatbar");
            const lowText = pg.texts.filter(t => !t.disabled && t.ratio < t.need), lowCtl = pg.controls.filter(x => x.best < 3);
            c.ok(pg.texts.length > 10 && lowText.length === 0 && lowCtl.length === 0, `${tag}: the canvas' own words (${pg.texts.length}: kind label, title, chip, bar, cards) reach 4.5 to 1 and the ${pg.controls.length} controls drawn (slot plus marks, bar buttons) have an edge or fill of 3 to 1${lowText.length || lowCtl.length ? "; below: " + JSON.stringify([...lowText, ...lowCtl].slice(0, 8)) : ""}`);
          }
          await o.page.keyboard.press("Escape"); await sleep(150);
        }
      }
      // the left column, the header and the trail do not change with the look
      for (const scheme of ["light", "dark"]) {
        const a = byLook[`paper-light-${scheme}`], b = byLook[`paper-dark-${scheme}`], d = byLook[`obsidian-${scheme}`];
        c.ok(JSON.stringify(a.left) === JSON.stringify(b.left) && JSON.stringify(a.left) === JSON.stringify(d.left), `${scheme}: the left column, the header bar, the trail, a tab and Undo draw the same in all three looks`);
      }
      c.ok(byLook["paper-light-light"].canvasBg !== byLook["paper-dark-light"].canvasBg && byLook["paper-light-light"].canvasBg !== byLook["obsidian-light"].canvasBg, "the three looks draw three different canvases");
      c.ok(byLook["paper-light-light"].canvasBg === byLook["paper-light-dark"].canvasBg && byLook["paper-dark-light"].canvasBg === byLook["paper-dark-dark"].canvasBg, "a paper look is the same canvas in a light and in a dark Obsidian");
      c.ok(text(file) === T0, "nothing was written to the note by all of this");
      // ---- a phone
      await pick("paper-light");
      const narrowed = await o.page.setViewportSize({ width: 390, height: 844 }).then(() => true, e => String(e).slice(0, 120));
      c.ok(narrowed === true, "the window is 390 x 844: " + narrowed);
      await mobile(o, true);
      await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
      if (await o.evaluate(() => app.workspace.getLeavesOfType("booklet-design").length) === 0) await openDesign(o, rel, "tab", true, false);
      await o.page.waitForSelector(DV + " .booklet-design-page", { timeout: 15000 });
      await idle(o); await warm(o);
      await goNav(o, "activity", lineOf(T0, "[!activity|a]"));
      const phoneSel = async label => {
        const g = await o.evaluate(sel => { const s = document.querySelector(sel), r = s.getBoundingClientRect(), l = s.closest("label").getBoundingClientRect(), W = window.innerWidth, e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { w: Math.round(r.width), h: Math.round(r.height), lh: Math.round(l.height), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), W, hit: !!e && (e === s || s.contains(e)), mobile: document.body.classList.contains("is-mobile") }; }, SEL74);
        c.ok(g.mobile && g.w >= 44 && g.h >= 44 && g.lh >= 44 && g.left >= 0 && g.right <= g.W && g.top >= 0 && g.hit, `${label}: on a phone the look dropdown is on the screen, ${g.w} x ${g.h} px (its label ${g.lh} px high), and a finger at its centre lands on it`);
      };
      await phoneSel("light");
      const pf = await phoneFacts(o);
      c.ok(pf.docScroll <= pf.W + 1 && pf.wideCount === 0, `the phone's header with the dropdown has no sideways scroll (page ${pf.docScroll} of ${pf.W} px)${pf.wideCount ? ": " + JSON.stringify(pf.wide) : ""}`);
      c.ok(pf.small.filter(x => x.own).length === 0, `every control of the plugin's is at least 44 px (${pf.controls} looked at)${pf.small.length ? "; smaller: " + JSON.stringify(pf.small.slice(0, 6)) : ""}`);
      for (const [look] of LOOKS74) {
        await pick(look);
        c.ok((await facts74(o)).attr === look, `phone: the dropdown set the canvas to ${look}`);
        await shotEl(o, `looks-phone-${look}-choice`, `${CV} .booklet-design-block[data-kind='question']`, "center");
        await o.evaluate(sel => { const e = document.querySelector(sel); if (e) e.scrollTop = 0; }, CV); await sleep(200);
        await shot(o, `looks-phone-${look}-head`);
        await clickBlock(o, "question", lineOf(T0, "[!choice|where]")); await sleep(250);
        await shotEl(o, `looks-phone-${look}-edit`, `${DV} .booklet-design-editbox`, "start");
        if (look !== "obsidian") {
          const ed = await edit74(o);
          const lowText = ed.texts.filter(t => !t.disabled && t.ratio < t.need), lowCtl = ed.controls.filter(x => x.best < 3);
          c.ok(lowText.length === 0 && lowCtl.length === 0, `phone, ${look}: the open edit box keeps its contrast (${ed.texts.length} texts, ${ed.controls.length} controls)${lowText.length || lowCtl.length ? "; below: " + JSON.stringify([...lowText, ...lowCtl].slice(0, 6)) : ""}`);
        }
        await closeAll(o);
      }
      await o.setScheme("dark"); await sleep(500);
      await pick("paper-dark"); await phoneSel("dark");
      await shotEl(o, "looks-phone-paper-dark-dark-choice", `${CV} .booklet-design-block[data-kind='question']`, "center");
      await o.setScheme("light"); await sleep(300);
      await mobile(o, false);
      await o.page.setViewportSize({ width: vp0.w, height: vp0.h });
      c.ok(text(file) === T0, "nothing was written to the note on the phone either");
    });
    return c;
  }


  /* ================= CHECK 75 ================= */
  // The in-place flow of stage 2b with REAL keys and a REAL mouse (Playwright's keyboard and mouse: keystrokes and a move, press and release at a point, never
  // fill() or a dispatched event for what is under test). Every note is made up here and written into the check's own copy of the vault, one note per scene.
  // A write is counted with a vault "modify" listener in the page; the note's whole text is compared byte for byte.
  const note75 = name => [
    "---", "booklet: \"0.20\"", `id: booklet-test/inplace-${name}`, `title: In place ${name}`, "lang: en", "---", "",
    "> [!module|m] Fruit", "", "> [!activity|a] Choosing", "",
    "> [!choice|fruit] Which fruit would you take?", "> Pick one.", "- [ ] Apple", "- [x] Pear", "",
    "> [!choice|veg] Which vegetable would you take?", "> Pick any one.", "- [ ] Leek", "- [ ] Kale", "",
    "> [!text|why] Why that one?", "",
    "> [!module|m end]", "",
  ].join("\n");
  /** A point on the empty page: left of the sheet, inside the scrolling canvas, on nothing the view treats as a block, a card, a control or the box. */
  const emptyPoint = o => o.evaluate(() => {
    const sc = document.querySelector(".workspace-leaf.mod-active .booklet-design-scroll"), pg = sc.querySelector(".booklet-design-page"), s = sc.getBoundingClientRect(), r = pg.getBoundingClientRect();
    const x = Math.max(s.left + 4, r.left - 6), y = s.top + 20, e = document.elementFromPoint(x, y);
    return { x, y, hit: e ? e.className : null, bg: !!e && !e.closest(".booklet-design-block, .booklet-design-editbox, .booklet-design-card, .booklet-design-slot, .booklet-design-floatbar, button, a, input, select, textarea, summary, label") };
  });
  async function check75() {
    const c = new Check(75, "the in-place flow, real keys and mouse: a title left by Tab is one write and one Undo step and the box keeps its elements; a description takes Enter as a newline and a real press on another block applies it and opens that block (one write, the press not swallowed); typing in an option row and a real click straight on \"Add an option\" make two writes with no page error; Esc after typing, Ctrl+Enter and a press on the empty page each apply and close; a drag that begins in the box and ends on the page does not close it; the Markdown section opens on one press and applies when left; a mode switch (a header press, and a command with no blur) and a closed pane with text pending write it first; text typed while the note changed on disk is held with a reason, not applied over the other writer's words; every note compared byte for byte");
    const table = tableOf();
    const say = k => (table[k] ? table[k].en : "?" + k);
    await withApp("c75", async (o, vault) => {
      let seq = 0;
      const errs0 = consoleReport.length;
      const mk = () => { const name = "s" + (++seq), rel = `In place ${name}.booklet.md`, t = note75(name); return { rel, file: put(vault, rel, t), t }; };
      const start = async () => { const n = mk(); await openDesign(o, n.rel); await goNav(o, "activity", lineOf(n.t, "[!activity|a]")); await armWrites(o, n.rel); return n; };
      const open = async (n, needle) => { await clickBlock(o, "question", lineOf(text(n.file), needle)); };
      const diffs = (want, got) => want === got ? "" : "; DIFFERS " + JSON.stringify(region(want, got)).slice(0, 300);
      const fieldFocus = () => o.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute("data-key") || a.getAttribute("data-field") || a.className || a.tagName) : null; });
      const statusOf = async () => (await state(o)).status;
      /** After the note has changed from `from`: its text, read again once the write has settled. */
      const settled = async (n, from) => { const r = await waitDisk(n.file, tx => tx !== from); await sleep(450); await idle(o); return { ok: r.ok, text: text(n.file) }; };
      const W = n => writesOf(o, n.rel);
      const T = "Which fruit would you take?";

      // ---------- A. a title typed and left by Tab: one write, one step of Undo, the box and its elements stay
      let n = await start();
      let t0 = n.t;
      await open(n, "[!choice|fruit]");
      const fruit = lineOf(t0, "[!choice|fruit]");
      c.ok(/is-title/.test(await o.evaluate(() => document.activeElement.className)) && await o.page.locator(TITLE_F).inputValue() === T, "A: a press on the block opens it with the title field holding the note's words and the focus in it");
      await o.evaluate(([a, b]) => { window.__t = document.querySelector(a); window.__d = document.querySelector(b); window.__box = document.querySelector(".workspace-leaf.mod-active .booklet-design-editbox"); }, [TITLE_F, DESC_F]);
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type(" today");
      c.ok(text(n.file) === t0 && await W(n) === 0, "A: typing writes nothing while the field has the focus");
      await o.page.keyboard.press("Tab");
      let r = await settled(n, t0);
      const wantA = sub(t0, `[!choice|fruit] ${T}`, `[!choice|fruit] ${T} today`);
      let st = await state(o);
      c.ok(r.ok && r.text === wantA && await W(n) === 1, `A: Tab wrote the typed title and nothing else, in one write (${await W(n)}), byte for byte${diffs(wantA, r.text)}`);
      c.ok(st.editBox && st.selected === "question@" + fruit, `A: the block stays open and selected (${st.selected})`);
      c.ok(await o.evaluate(([a, b]) => document.querySelector(a) === window.__t && document.querySelector(b) === window.__d && document.querySelector(".workspace-leaf.mod-active .booklet-design-editbox") === window.__box, [TITLE_F, DESC_F]), "A: the title field, the description field and the box are the same elements after the write (nothing was drawn again under the person)");
      c.ok(await o.page.locator(TITLE_F).inputValue() === T + " today" && await fieldFocus() === "description", `A: the title shows the typed words and the focus went on to the next field (${await fieldFocus()})`);
      await undoBtn(o).click();
      r = await waitDisk(n.file, tx => tx === t0); await idle(o);
      c.ok(r.ok && await W(n) === 2, "A: one press on Undo gave the note back byte for byte (the typing was one step), in one more write");
      await redoBtn(o).click(); r = await waitDisk(n.file, tx => tx === wantA); await idle(o);
      c.ok(r.ok, "A: and one Redo made it again, byte for byte");
      await closeAll(o);

      // ---------- B. a description: Enter is a newline, and a real press on another block applies it and opens that block
      n = await start(); t0 = n.t;
      await open(n, "[!choice|fruit]");
      await o.page.locator(DESC_F).click(); await o.page.keyboard.press("Control+End"); await o.page.keyboard.press("Enter");
      let dv = await o.page.locator(DESC_F).inputValue();
      c.ok(dv === "Pick one.\n" && text(n.file) === t0, `B: Enter in the description is a newline in the field (${JSON.stringify(dv)}) and writes nothing`);
      await o.page.keyboard.type("A second line.");
      const vegSel = block("question", lineOf(t0, "[!choice|veg]"));
      await o.page.locator(vegSel).scrollIntoViewIfNeeded();
      await o.page.locator(vegSel).click(); // a real press: move, down, up, at the middle of the other block
      await sleep(500);
      r = await settled(n, t0);
      const wantB = sub(t0, "> Pick one.\n", "> Pick one.\n> A second line.\n");
      st = await state(o);
      c.ok(r.ok && r.text === wantB && await W(n) === 1, `B: the press on another block applied the description in one write, byte for byte${diffs(wantB, r.text)}`);
      c.ok(st.editBox && st.selected === "question@" + lineOf(r.text, "[!choice|veg]") && await o.page.locator(block("question", lineOf(r.text, "[!choice|veg]")) + ".is-open").count() === 1, `B: and that press was not swallowed: the vegetable block is selected and open (${st.selected}), the fruit block is shut`);
      await closeAll(o);

      // ---------- C. typing in an option row, then a real click straight on "Add an option": two writes, no page error
      n = await start(); t0 = n.t;
      const errsC = consoleReport.length;
      await open(n, "[!choice|fruit]");
      await o.page.locator(RW("o0-text")).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type(" and more");
      const addBtn = `${DV} [data-key='o-add']`;
      await o.page.locator(addBtn).scrollIntoViewIfNeeded();
      await o.page.locator(addBtn).click(); // move, down, up: the typing is applied on the press, the press must still reach its button
      await sleep(500); await idle(o);
      const wantC1 = sub(t0, "- [ ] Apple\n", "- [ ] Apple and more\n"), wantC = sub(wantC1, "- [x] Pear\n", "- [x] Pear\n- [ ] \n");
      r = await waitDisk(n.file, tx => tx === wantC); await sleep(300); await idle(o);
      c.ok(r.ok && text(n.file) === wantC && await W(n) === 2, `C: the typed words and the pressed button are two writes (${await W(n)}), the note equals the old one with the option reworded and a new empty option added, byte for byte${diffs(wantC, text(n.file))}`);
      c.ok(await fieldFocus() === "o2-text", `C: the focus went to the new option's words (${await fieldFocus()})`);
      c.ok(errorsSince(errsC).length === 0, `C: no page error and no console error for it (${errorsSince(errsC).length})`);
      await closeAll(o);

      // ---------- D. Esc after typing applies and closes; E. Ctrl+Enter applies and closes
      n = await start(); t0 = n.t;
      await open(n, "[!choice|veg]");
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type("?");
      await o.page.keyboard.press("Escape");
      r = await settled(n, t0);
      const wantD = sub(t0, "[!choice|veg] Which vegetable would you take?", "[!choice|veg] Which vegetable would you take??");
      st = await state(o);
      c.ok(r.ok && r.text === wantD && await W(n) === 1 && !st.editBox && st.selected === "question@" + lineOf(t0, "[!choice|veg]"), `D: Esc after typing applied the title (one write) and closed the block, which stays selected (${st.selected}); byte for byte${diffs(wantD, r.text)}`);
      await open(n, "[!choice|veg]");
      await o.page.locator(DESC_F).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("Pick two.");
      await o.page.keyboard.press("Control+Enter");
      const r2 = await settled(n, wantD);
      const wantE = sub(wantD, "> Pick any one.\n", "> Pick two.\n");
      st = await state(o);
      c.ok(r2.ok && r2.text === wantE && await W(n) === 2 && !st.editBox, `E: Ctrl+Enter after typing applied the description (one more write) and closed the block, byte for byte${diffs(wantE, r2.text)}`);

      // ---------- F. a real press on the empty page applies and closes; G. a drag that begins in the box and ends on the page does not
      n = await start(); t0 = n.t;
      await open(n, "[!choice|fruit]");
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type("!");
      const bg = await emptyPoint(o);
      c.ok(bg.bg, `F: the point chosen on the empty page is on nothing of the view's (${bg.hit})`);
      await o.page.mouse.click(bg.x, bg.y);
      r = await settled(n, t0);
      st = await state(o);
      c.ok(r.ok && r.text === sub(t0, `[!choice|fruit] ${T}`, `[!choice|fruit] ${T}!`) && await W(n) === 1 && !st.editBox, `F: a press on the empty page applied the typed title (one write) and closed the block, byte for byte${diffs(sub(t0, `[!choice|fruit] ${T}`, `[!choice|fruit] ${T}!`), r.text)}`);
      t0 = r.text;
      await open(n, "[!choice|fruit]");
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type("?");
      const tb = await o.page.locator(TITLE_F).boundingBox();
      const bg2 = await emptyPoint(o);
      await o.page.mouse.move(tb.x + 8, tb.y + tb.height / 2); await o.page.mouse.down();
      await o.page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 4 });
      await o.page.mouse.move(bg2.x, bg2.y, { steps: 10 });
      await o.page.mouse.up(); await sleep(500);
      st = await state(o);
      c.ok(st.editBox && await o.page.locator(TITLE_F).inputValue() === T + "!?" && text(n.file) === t0, `G: a drag that began in the box's field and ended on the empty page did not close the block, lost no typing, and wrote nothing (the field holds ${JSON.stringify(await o.page.locator(TITLE_F).inputValue())})`);
      await o.page.keyboard.press("Tab");
      r = await settled(n, t0);
      c.ok(r.ok && r.text === sub(t0, `${T}!`, `${T}!?`), "G: and the typing is applied when the field is left (Tab), byte for byte");
      await closeAll(o);

      // ---------- H. the Markdown section: one press opens it; it is applied when left
      n = await start(); t0 = n.t;
      await open(n, "[!choice|fruit]");
      const mdOpenBefore = await o.evaluate(() => document.querySelector(".workspace-leaf.mod-active .booklet-design-editbox .booklet-design-edit-md").open);
      await o.page.locator(MD_SUMMARY).click();
      const mdVisible = await o.page.locator(MD_AREA).isVisible();
      c.ok(!mdOpenBefore && mdVisible, `H: the Markdown section is closed on a new block and one real press on its summary opens it (open before ${mdOpenBefore}, text area visible after ${mdVisible})`);
      c.ok(await markdownOf(o) === "> [!choice|fruit] Which fruit would you take?\n> Pick one.\n- [ ] Apple\n- [x] Pear", "H: it holds the block's own lines, byte for byte");
      await o.page.locator(MD_AREA).click(); await o.page.keyboard.press("Control+End"); await o.page.keyboard.type("\n- [ ] Plum");
      c.ok(text(n.file) === t0, "H: nothing is written while the Markdown has the focus");
      await o.page.locator(TITLE_F).click();
      r = await settled(n, t0);
      const wantH = sub(t0, "- [x] Pear\n", "- [x] Pear\n- [ ] Plum\n");
      c.ok(r.ok && r.text === wantH && await W(n) === 1 && await o.page.locator(MD_AREA).isVisible(), `H: leaving it applied the typed line in one write, byte for byte, and the section stays open${diffs(wantH, r.text)}`);
      await closeAll(o);

      // ---------- I. a switch of view with typing pending writes it first: a real press on the header button, and a command that takes no blur
      n = await start(); t0 = n.t;
      await open(n, "[!choice|fruit]");
      await o.page.locator(DESC_F).click(); await o.page.keyboard.press("Control+End"); await o.page.keyboard.type(" Last words.");
      await o.page.locator(".workspace-leaf.mod-active .view-header .view-actions .clickable-icon[aria-label='Show Markdown']").click();
      const wantI = sub(t0, "> Pick one.\n", "> Pick one. Last words.\n");
      r = await settled(n, t0);
      const swOk = await waitActiveType(o, "markdown", 8000);
      const mdBuf = swOk ? await o.evaluate(() => app.workspace.activeLeaf.view.editor.getValue()) : null;
      c.ok(r.ok && r.text === wantI && swOk && mdBuf === wantI && await W(n) === 1, `I: a real press on "Show Markdown" with typing pending wrote it first (one write), the Markdown pane then holds exactly the note, byte for byte${diffs(wantI, r.text)}`);
      await o.evaluate(async () => { await app.plugins.plugins.booklet.setMode(app.workspace.activeLeaf, "design"); });
      await waitActiveType(o, "booklet-design", 8000); await o.page.waitForSelector(DV + " .booklet-design-page", { timeout: 8000 }); await idle(o);
      await goNav(o, "activity", lineOf(wantI, "[!activity|a]"));
      await open(n, "[!choice|veg]");
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type(" Now.");
      await o.evaluate(() => { app.commands.executeCommandById("booklet:toggle-view"); }); // no blur: the field still has the focus when the view changes
      const wantI2 = sub(wantI, "[!choice|veg] Which vegetable would you take?", "[!choice|veg] Which vegetable would you take? Now.");
      r = await settled(n, wantI);
      const sw2 = await waitActiveType(o, "markdown", 8000);
      c.ok(r.ok && r.text === wantI2 && sw2 && await W(n) === 2, `I: the command that toggles the view, with the field still holding the focus and the typing, also wrote it first (one more write), byte for byte${diffs(wantI2, r.text)}`);

      // ---------- J. the pane closed with typing pending (Ctrl+W: the field keeps the focus, nothing blurs it): the typed text is in the note on disk
      n = await start(); t0 = n.t;
      await open(n, "[!choice|fruit]");
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type(" Soon.");
      c.ok(text(n.file) === t0, "J: the typed words are not yet in the note");
      await o.page.keyboard.press("Control+w");
      let gone = await o.page.waitForFunction(() => app.workspace.getLeavesOfType("booklet-design").length === 0, null, { timeout: 4000 }).then(() => true, () => false);
      let how = "Ctrl+W";
      if (!gone) { how = "the command workspace:close (Ctrl+W did not close the pane here)"; await o.evaluate(() => { app.commands.executeCommandById("workspace:close"); }); gone = await o.page.waitForFunction(() => app.workspace.getLeavesOfType("booklet-design").length === 0, null, { timeout: 4000 }).then(() => true, () => false); }
      r = await settled(n, t0);
      const wantJ = sub(t0, `[!choice|fruit] ${T}`, `[!choice|fruit] ${T} Soon.`);
      c.ok(gone && r.ok && r.text === wantJ && await W(n) === 1, `J: the pane was closed by ${how} with words pending in the title, and they are in the note on disk (one write), byte for byte${diffs(wantJ, r.text)}`);

      // ---------- K. typing held when the note changed on disk meanwhile: kept in the field with a reason, the other writer's words not overwritten
      n = await start(); t0 = n.t;
      await open(n, "[!choice|fruit]");
      await o.page.locator(DESC_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type(" Mine.");
      const external = sub(t0, "> Pick one.\n", "> Pick several.\n");
      fs.writeFileSync(n.file, external);
      await o.page.waitForFunction(() => { const v = app.workspace.getLeavesOfType("booklet-design")[0].view; return /Pick several/.test(v.getViewData()); }, null, { timeout: 8000 }).catch(() => {});
      await sleep(500);
      c.ok(await o.page.locator(DESC_F).inputValue() === "Pick one. Mine.", "K: the note changed on disk under the typing and the field still holds what was typed (it was not redrawn over)");
      await o.page.keyboard.press("Tab"); await sleep(900); await idle(o);
      const held = await o.evaluate(() => ({ field: (document.querySelector(".workspace-leaf.mod-active .booklet-design-field.is-desc") || {}).value, reason: (document.querySelector(".workspace-leaf.mod-active .booklet-design-editor-state") || {}).textContent || "", status: (document.querySelector(".workspace-leaf.mod-active .booklet-design-status") || {}).textContent || "" }));
      c.ok(text(n.file) === external && held.field === "Pick one. Mine.", `K: leaving the field applied nothing: the note is as the other writer left it, byte for byte, and the typed words are still in the field`);
      c.ok(held.reason === say("edit.changed") && held.status === say("edit.changed"), `K: the reason is said in words in the box and in the status line (${JSON.stringify(held.status.slice(0, 80))})`);
      await o.page.keyboard.press("Escape"); await sleep(400);
      st = await state(o);
      c.ok(st.editBox && st.status === say("editor.busy"), `K: the first Esc says the text could not be applied and keeps the block open (${JSON.stringify(st.status.slice(0, 60))})`);
      await o.page.keyboard.press("Escape"); await sleep(400);
      c.ok(!(await state(o)).editBox && text(n.file) === external && await W(n) === 1, `K: the second Esc closes it; the note is still the other writer's text, byte for byte (the only write is the external one: ${await W(n)})`);

      // ---------- L. an option moved up and then one removed: the rows on the screen are the note's rows after each
      n = await start(); t0 = n.t;
      await open(n, "[!choice|fruit]");
      const rowTexts = () => o.evaluate(() => [...document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-rows input[data-key$='-text']")].map(e => e.value).join("|"));
      await o.page.locator(RW("o1-up")).click(); // Pear above Apple
      r = await settled(n, t0);
      const wantL1 = sub(t0, "- [ ] Apple\n- [x] Pear\n", "- [x] Pear\n- [ ] Apple\n");
      c.ok(r.ok && r.text === wantL1 && await rowTexts() === "Pear|Apple", `L: an option moved up is one write, byte for byte, and the rows show Pear then Apple (${await rowTexts()})${diffs(wantL1, r.text)}`);
      await o.page.locator(RW("o0-remove")).click(); // the first option (Pear) removed
      r = await settled(n, wantL1);
      c.ok(r.ok && r.text === sub(wantL1, "- [x] Pear\n", "") && await rowTexts() === "Apple", `L: the first option removed after the move is one write, byte for byte, and the rows are redrawn without it (the screen shows ${JSON.stringify(await rowTexts())}, the note has Apple only)`);
      await closeAll(o);

      // ---------- M. the selected block's bar says Edit as Markdown: the box opens with the Markdown section open and the focus in it; a press on the block opens it closed
      n = await start(); t0 = n.t;
      const fruitAt = lineOf(n.t, "[!choice|fruit]");
      await selectBlock(o, "question", fruitAt);
      await o.page.locator(barBtn("question", fruitAt, "edit")).click(); await sleep(500);
      const viaBar = await o.evaluate(() => { const b = document.querySelector(".workspace-leaf.mod-active .booklet-design-editbox"), md = b && b.querySelector("details.booklet-design-edit-md"), a = document.activeElement; return { box: !!b, open: !!md && md.open, focus: a && a.classList.contains("booklet-design-textarea") }; });
      c.ok(viaBar.box && viaBar.open && viaBar.focus, `M: the bar's Edit as Markdown opens the box with the Markdown section open and the focus in it (${JSON.stringify(viaBar)})`);
      await closeAll(o);

      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page error and no console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 160))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 76 ================= */
  // Undo and Redo in the real app, over a run of twelve changes of mixed kinds made the way a person makes them (real keys and mouse), each snapshot of the note kept
  // so every step back and forward is compared byte for byte; then the edges: typing pending, nothing to undo, rapid presses, a note changed from outside, a dialog open.
  const note76 = [
    "---", "booklet: \"0.20\"", "id: booklet-test/undo-run", "title: Undo run", "lang: en", "---", "",
    "> [!module|m] Fruit", "", "> [!activity|a] Choosing", "",
    "> [!choice|fruit] Which fruit would you take?", "> Pick one.", "- [ ] Apple", "- [x] Pear", "- [ ] Plum", "",
    "> [!multi|tools open] Which tools did you use?", "- [ ] Pencil", "- [ ] Ruler", "",
    "> [!text|why] Why that one?", "",
    "> [!scale|sure] How sure are you?", "", "1. Not sure", "2. Sure", "",
    "> [!module|m end]", "",
  ].join("\n");
  async function check76() {
    const c = new Check(76, "Undo and Redo in the real app: twelve changes of mixed kinds (titles, a description, options added, reworded, moved and removed, a flag switch, a block moved and a block deleted) made with real keys and mouse, then Undo all the way and Redo all the way, the note compared byte for byte with a snapshot at every step; Undo with typing pending (real press, and a direct call with no blur) applies it first and undoes that step; Undo and Redo with nothing to do say so and throw nothing; rapid repeated presses never interleave or double-apply; a note changed from outside makes Undo refuse with a reason and keeps the stack; Undo with a dialog open does nothing; no console or page error, whatever Obsidian itself says besides the known harness noise");
    const table = tableOf();
    const say = k => (table[k] ? table[k].en : "?" + k);
    await withApp("c76", async (o, vault) => {
      const errs0 = consoleReport.length;
      const rel = "Undo run.booklet.md", file = put(vault, rel, note76), N0 = text(file);
      await openDesign(o, rel);
      await goNav(o, "activity", lineOf(N0, "[!activity|a]"));
      await armWrites(o, rel);
      const snaps = [N0];
      const pushSnap = async (label) => {
        const before = snaps[snaps.length - 1];
        const r = await waitDisk(file, tx => tx !== before); await sleep(350); await idle(o);
        c.ok(r.ok && text(file) !== before, `change ${snaps.length}: ${label}: the note changed`);
        snaps.push(text(file));
      };
      const lineAt = needle => lineOf(text(file), needle);
      const reopen = async (needle, kind = "question") => { if (!(await state(o)).editBox) await clickBlock(o, kind, lineAt(needle)); else if (!(await o.page.locator(block(kind, lineAt(needle)) + ".is-open").count())) await clickBlock(o, kind, lineAt(needle)); };
      const step = async (needle, kind) => { await closeAll(o); await clickBlock(o, kind || "question", lineAt(needle)); };

      // ----- twelve changes of mixed kinds, each a real person's action
      await step("[!choice|fruit]");
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type(" today"); await o.page.keyboard.press("Tab");
      await pushSnap("the title of the fruit question typed and left by Tab");
      await o.page.locator(DESC_F).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("Pick exactly one."); await o.page.keyboard.press("Tab");
      await pushSnap("its description replaced");
      await o.page.locator(`${DV} [data-key='o-add']`).click();
      await pushSnap("an option added by its button");
      await o.page.locator(RW("o3-text")).click(); await o.page.keyboard.type("Fig"); await o.page.keyboard.press("Tab");
      await pushSnap("its words typed");
      await o.page.locator(RW("o0-text")).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type(" pie"); await o.page.keyboard.press("Enter");
      await pushSnap("option 1 reworded and left by Enter");
      // the removal comes before the move: a move first would leave the removal undrawn on the screen (a product bug, shown by check 75, scene L)
      await o.page.locator(RW("o0-remove")).click();
      await pushSnap("option 1 removed");
      await o.page.locator(RW("o2-up")).click();
      await pushSnap("the new option moved up");
      await o.page.locator(RW("o1-correct")).click();
      await pushSnap("a correct-answer switch pressed");
      await step("[!multi|tools");
      await o.page.locator(`${DV} .booklet-design-editbox .booklet-design-strip-item[data-field='open'] button[role=switch]`).click();
      await pushSnap("the flag open switched off on the multi question");
      await step("[!text|why]");
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("Why this one?"); await o.page.keyboard.press("Tab");
      await pushSnap("the text question's title replaced");
      await o.page.locator(`${DV} .booklet-design-editbox .booklet-design-strip-actions .is-down`).click();
      await pushSnap("the text question moved down by the box's own button");
      await closeAll(o); await sleep(300);
      await step("[!multi|tools");
      await o.page.locator(`${DV} .booklet-design-editbox .booklet-design-strip-actions .is-delete`).click();
      await pushSnap("the multi question deleted by the box's own button");
      c.ok(snaps.length === 13, `twelve changes of mixed kinds were made, each one write and each one snapshot (${snaps.length - 1})`);
      c.ok(await W76(o, rel) === 12, `each change was exactly one write to the note (${await W76(o, rel)} writes for 12 changes)`);
      await closeAll(o);
      await shot(o, "undo-after-twelve");

      // ----- Undo all the way, byte for byte at every step (the buttons first, then the keys, alternately)
      let st = await state(o);
      for (let i = snaps.length - 1; i >= 1; i--) {
        if (i % 2) { await blurFocus(o); await o.page.keyboard.press("Control+z"); } else await undoBtn(o).click();
        const r = await waitDisk(file, tx => tx === snaps[i - 1]); await idle(o);
        if (!r.ok) { c.ok(false, `Undo ${snaps.length - i} (${i % 2 ? "Ctrl+Z" : "the button"}): the note is not the snapshot before change ${i}${diffs76(snaps[i - 1], text(file))}`); break; }
        if (i === 1) c.ok(true, `Undo all the way: all ${snaps.length - 1} steps back, by the Undo button and by Ctrl+Z in turn, each equal to its snapshot byte for byte`);
      }
      c.ok(text(file) === N0 && await undoBtn(o).isDisabled() && await redoBtn(o).isEnabled(), "after the last Undo the note is the one it began as, byte for byte, Undo is off and Redo is on");
      // ----- Redo all the way
      for (let i = 1; i < snaps.length; i++) {
        if (i % 2) await redoBtn(o).click(); else { await blurFocus(o); await o.page.keyboard.press("Control+Shift+z"); }
        const r = await waitDisk(file, tx => tx === snaps[i]); await idle(o);
        if (!r.ok) { c.ok(false, `Redo ${i} (${i % 2 ? "the button" : "Ctrl+Shift+Z"}): the note is not the snapshot after change ${i}${diffs76(snaps[i], text(file))}`); break; }
        if (i === snaps.length - 1) c.ok(true, `Redo all the way: all ${snaps.length - 1} steps forward, each equal to its snapshot byte for byte`);
      }
      c.ok(text(file) === snaps[snaps.length - 1] && await redoBtn(o).isDisabled() && await undoBtn(o).isEnabled(), "after the last Redo the note is the last snapshot, byte for byte, Redo is off and Undo is on");
      const END = text(file);

      // ----- Undo with typing pending: the typing is applied first, then that step is undone
      await step("[!text|why]", "question");
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type(" Really?");
      c.ok(text(file) === END, "typing pending: the note is not written while the field has the focus");
      const w0 = await W76(o, rel);
      await undoBtn(o).click(); // a real press: the field is left first (its change), then the press
      let r;
      // the two writes (the typing, then its undo) are waited for by their count, not by watching for the in-between text (which the second write can replace before it is seen) or by a fixed pause
      for (let i = 0; i < 40 && (await W76(o, rel)) < w0 + 2; i++) await sleep(150);
      await sleep(300); await idle(o);
      c.ok(text(file) === END && await W76(o, rel) === w0 + 2, `Undo pressed with typing pending applied the typing (one write) and undid that same step (one more): the note is back to what it was, byte for byte, ${await W76(o, rel) - w0} writes${diffs76(END, text(file))}`);
      await redoBtn(o).click(); r = await waitDisk(file, tx => /Really\?/.test(tx)); await idle(o);
      c.ok(r.ok && text(file).includes("Really?") && !(await redoBtn(o).isEnabled()), "and Redo gives the typed words back (the typing was a step of its own)");
      await undoBtn(o).click(); await waitDisk(file, tx => tx === END); await idle(o);
      // the same with a direct call: the field still holds the focus and its typing, nothing blurs it
      await step("[!text|why]", "question");
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type(" Again?");
      await o.evaluate(async () => { await app.workspace.getLeavesOfType("booklet-design")[0].view.stepBack("undo"); });
      await sleep(500); await idle(o);
      c.ok(text(file) === END, "stepBack('undo') called with typing pending and the focus still in the field applied the typing and undid it: the note is as it was, byte for byte");
      await o.evaluate(async () => { await app.workspace.getLeavesOfType("booklet-design")[0].view.stepBack("redo"); }); await sleep(400); await idle(o);
      await o.evaluate(async () => { await app.workspace.getLeavesOfType("booklet-design")[0].view.stepBack("undo"); }); await sleep(400); await idle(o);
      await closeAll(o);
      c.ok(text(file) === END, "and a direct Redo then Undo is exact too");

      // ----- nothing to undo, nothing to redo: a word in the status line, no error
      const errsN = consoleReport.length;
      const f2 = put(vault, "Undo empty.booklet.md", note76.replace("id: booklet-test/undo-run", "id: booklet-test/undo-empty"));
      await openDesign(o, "Undo empty.booklet.md");
      await goNav(o, "activity", lineOf(note76, "[!activity|a]"));
      c.ok(await undoBtn(o).isDisabled() && await redoBtn(o).isDisabled(), "a view with no change made: Undo and Redo are both off");
      await blurFocus(o); await o.page.keyboard.press("Control+z"); await sleep(300);
      let say1 = (await state(o)).status;
      await o.page.keyboard.press("Control+Shift+z"); await sleep(300);
      let say2 = (await state(o)).status;
      c.ok(say1 === say("status.nothingUndo") && say2 === say("status.nothingRedo") && text(f2) === note76.replace("id: booklet-test/undo-run", "id: booklet-test/undo-empty"), `Ctrl+Z with nothing to undo says ${JSON.stringify(say1)} and Ctrl+Shift+Z says ${JSON.stringify(say2)}; the note is untouched`);
      c.ok(errorsSince(errsN).length === 0, `and nothing is thrown (${errorsSince(errsN).length} errors)`);

      // ----- rapid repeated presses: never interleaved, never applied twice
      // on the view with nothing to undo: six presses in one tick change nothing and throw nothing
      await o.evaluate(() => { const u = document.querySelector(".workspace-leaf.mod-active .booklet-design-undo"), r = document.querySelector(".workspace-leaf.mod-active .booklet-design-redo"); for (let i = 0; i < 6; i++) { u.click(); r.click(); } });
      await sleep(700); await idle(o);
      c.ok(text(f2) === note76.replace("id: booklet-test/undo-run", "id: booklet-test/undo-empty") && errorsSince(errsN).length === 0, "six presses on the disabled Undo and Redo in one tick change nothing and throw nothing");
      await openDesign(o, rel);
      await goNav(o, "activity", lineOf(END, "[!activity|a]"));
      // a real history: three changes, then rapid presses
      const base = text(file);
      await step("[!text|why]", "question");
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type("1"); await o.page.keyboard.press("Tab");
      let s1 = await waitDisk(file, tx => tx !== base); await sleep(300);
      const sA = text(file);
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type("2"); await o.page.keyboard.press("Tab");
      await waitDisk(file, tx => tx !== sA); await sleep(300);
      const sB = text(file);
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type("3"); await o.page.keyboard.press("Tab");
      await waitDisk(file, tx => tx !== sB); await sleep(300); await closeAll(o);
      const sC = text(file), chain = [base, sA, sB, sC];
      void s1;
      await undoBtn(o).dblclick(); // a real double click
      await sleep(900); await idle(o);
      const dIdx = chain.indexOf(text(file));
      c.ok(dIdx === 2 || dIdx === 1, `a real double click on Undo undid one or two steps and stopped on a recorded state (the note is state ${dIdx} of 0..3)`);
      await o.evaluate(() => { const b = document.querySelector(".workspace-leaf.mod-active .booklet-design-undo"); for (let i = 0; i < 10; i++) b.click(); });
      await sleep(1500); await idle(o);
      const rIdx = chain.indexOf(text(file));
      c.ok(rIdx >= 0 && rIdx < dIdx, `ten presses of Undo in one tick went back along the recorded states and stopped on one (state ${rIdx}), never between two`);
      // the stack is whole: more Undo reaches the first state, then Redo reaches the last, byte for byte
      for (let i = 0; i < 6 && await undoBtn(o).isEnabled(); i++) { await undoBtn(o).click(); await sleep(400); await idle(o); }
      c.ok(text(file) === base && await undoBtn(o).isDisabled(), "undone to the start by slow presses: the note is the first state, byte for byte, Undo is off");
      await o.evaluate(() => { const b = document.querySelector(".workspace-leaf.mod-active .booklet-design-redo"); for (let i = 0; i < 10; i++) b.click(); });
      await sleep(1500); await idle(o);
      for (let i = 0; i < 6 && await redoBtn(o).isEnabled(); i++) { await redoBtn(o).click(); await sleep(400); await idle(o); }
      c.ok(text(file) === sC && await redoBtn(o).isDisabled(), "ten Redo presses in one tick and then slow ones: the note is the last state, byte for byte, Redo is off");

      // ----- Undo after an outside edit of the note: refused with a reason, the step stays, nothing thrown
      const errsO = consoleReport.length;
      await undoBtn(o).click(); await waitDisk(file, tx => tx === sB); await idle(o);
      const outside = text(file) + "\nA line added from outside.\n";
      fs.writeFileSync(file, outside);
      await o.page.waitForFunction(() => /A line added from outside/.test(app.workspace.getLeavesOfType("booklet-design")[0].view.getViewData()), null, { timeout: 8000 }).catch(() => {});
      await sleep(500);
      await undoBtn(o).click(); await sleep(700); await idle(o);
      st = await state(o);
      c.ok(text(file) === outside && st.status === say("status.undoChanged"), `Undo after the note changed from outside is refused: the note is as the other writer left it, byte for byte, and the status says ${JSON.stringify(st.status.slice(0, 90))}`);
      c.ok(await undoBtn(o).isEnabled(), "the refused step is still on the stack (Undo stays on)");
      await redoBtn(o).click(); await sleep(700);
      st = await state(o);
      c.ok(text(file) === outside && st.status === say("status.redoChanged"), `Redo is refused the same way (${JSON.stringify(st.status.slice(0, 60))}) and writes nothing`);
      c.ok(errorsSince(errsO).length === 0, `nothing was thrown by the refused steps (${errorsSince(errsO).length})`);
      fs.writeFileSync(file, sB); await sleep(900); await idle(o); // the other writer's line taken out again: the steps can be replayed
      await undoBtn(o).click(); const ro = await waitDisk(file, tx => tx === sA); await idle(o);
      c.ok(ro.ok, "with the outside line gone the same Undo works again: the stack was kept, and the note is the earlier state, byte for byte");

      // ----- Undo with a dialog open does nothing
      const kept = path.join(vault, KEPT), K0 = text(kept);
      await openDesign(o, KEPT);
      await goNav(o, "activity", lineOf(K0, "[!activity|warm-up"));
      await clickBlock(o, "question", lineOf(K0, "[!choice|colour]"));
      await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type("!"); await o.page.keyboard.press("Tab");
      const k1 = await waitDisk(kept, tx => tx !== K0); await sleep(300); await idle(o);
      const K1 = text(kept);
      await o.page.locator(`${DV} .booklet-design-editbox .booklet-design-strip-actions .is-delete`).click();
      c.ok(await waitModal(o, true), "a Delete of a question with a kept answer opens the dialog");
      await o.page.keyboard.press("Control+z"); await sleep(500);
      await o.evaluate(() => { void app.workspace.getLeavesOfType("booklet-design")[0].view.stepBack("undo"); }); // not awaited: a press made while the dialog is open is given the dialog's own promise, which settles when the dialog is answered
      await sleep(600);
      c.ok(k1.ok && text(kept) === K1 && await waitModal(o, true, 500), "Ctrl+Z and a direct Undo with the dialog open change nothing: the note is as it was, byte for byte, and the dialog is still open");
      await clickModal(o, "Cancel"); await idle(o);
      await undoBtn(o).click(); const ku = await waitDisk(kept, tx => tx === K0); await idle(o);
      c.ok(ku.ok, "after the dialog is closed Undo works: the earlier change is taken back, byte for byte");

      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no console error and no page error in the whole check, whatever the app itself says (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.kind + " " + x.text.slice(0, 160))) : ""}`);
      const noise = consoleReport.slice(errs0).filter(r => r.kind !== "pageerror" && r.kind !== "console.error" && r.kind !== "console.warning" && !/harness noise/.test(r.kind));
      c.info(`other collected lines during the check: ${noise.length}; console warnings that do not name the plugin: ${consoleReport.slice(errs0).filter(r => r.kind === "console.warning" && !/booklet/i.test(r.text + r.url)).length}`);
    });
    return c;
  }
  const W76 = (o, rel) => writesOf(o, rel);
  const diffs76 = (want, got) => want === got ? "" : "; DIFFERS " + JSON.stringify(region(want, got)).slice(0, 300);


  /* ================= CHECK 77 ================= */
  // The Design view's header and page stand still. (A) Selecting a block, opening it and closing it does not move the page or change the header's height:
  // the trail above the page is the PAGE's, never the selected block's (beta.4 added the block as one more segment, and in a narrow pane the trail wrapped to
  // another line, so a press moved the page by 20 to 45 px). (B) The status line has a strip of its own, always in the flow and always the same height, so
  // the words of a write move nothing and cover nothing (beta.4 laid it over the top line of the page). Real Chromium geometry, real mouse and keys, at a
  // wide pane (about 1000 px), a pane just above the narrow switch (about 740 px) and the phone layout (390 px), with long titles for the booklet, module,
  // activity and every block, so the trail has to wrap. The rectangles are read with getBoundingClientRect; jsdom cannot see layout.
  async function check77() {
    const c = new Check(77, "the Design view stands still: with long titles, at a wide pane (about 1000 px), a pane just above the narrow switch (about 740 px) and the phone layout (390 px), a real press on a callout, a choice, a matrix, a text question and a listen block, the block opening and closing, change neither the header's rectangle nor the page's place nor the trail (it is the page's, whatever is selected); the status line is a strip in the flow of one fixed height, empty or with a message (a long one cut short with its whole text in its title), that never overlaps the page's first line, and the header, the scroll area, the page's title and the Add-an-option button have the same rectangles before a write, with its message, after the next message and when it is cleared");
    const LB = "The long booklet of a long year", LM = "A module with a long title too", LA = "An activity titled at length";
    const Q = n => `${n} which is asked with a long title that a person might really write, going on over more than one line of a narrow pane`;
    const note = name => [
      "---", "booklet: \"0.20\"", `id: booklet-test/still-${name}`, `title: ${LB}`, "lang: en", "---", "",
      `> [!module|m] ${LM}`, "", `> [!activity|a] ${LA}`, "",
      `> [!note] ${Q("A callout")}`, "> Words in the callout, as a reader sees them.", "",
      `> [!choice|fruit] ${Q("A choice")}`, "- [ ] Apple", "- [x] Pear", "",
      `> [!matrix|sure] ${Q("A matrix")}`, "", "- Spring tides", "- Neap tides", "", "0. Not yet", "1. Sure", "",
      `> [!text|free] ${Q("A text question")}`, "",
      `> [!listen|tone] ${Q("A listen block")}`, "> ![A short tone](media/tone.wav)", "",
      "> [!module|m end]", "",
    ].join("\n");
    const KINDS = [["callout", "callout", "[!note]"], ["choice", "question", "[!choice|fruit]"], ["matrix", "question", "[!matrix|sure]"], ["text", "question", "[!text|free]"], ["listen", "question", "[!listen|tone]"]];
    const rnd = v => v == null ? null : Math.round(v * 10) / 10;
    const rect = e => { const b = e && e.getBoundingClientRect(); return b ? [rnd(b.x), rnd(b.y), rnd(b.width), rnd(b.height)] : null; };
    /** What a person sees of the frame: the header, the status strip, the scroll area, where the page is in its scroller, its first line, the trail. */
    const frame = (o, extra = "") => o.evaluate(([sel, extra]) => {
      const q = s => document.querySelector(sel + " " + s);
      const r = e => { const b = e && e.getBoundingClientRect(); return b ? [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10] : null; };
      const sc = q(".booklet-design-scroll"), pg = q(".booklet-design-page"), st = q(".booklet-design-status"), kind = q(".booklet-design-page-kind"), title = q(".booklet-design-page-title");
      const pr = pg && pg.getBoundingClientRect(), sr = sc && sc.getBoundingClientRect();
      return {
        top: r(q(".booklet-design-top")), crumb: r(q(".booklet-design-crumb")), status: r(st), scroll: r(sc),
        pageAbs: pr && sr ? Math.round((pr.top - sr.top + sc.scrollTop) * 10) / 10 : null,
        kindRect: r(kind), titleRect: r(title), scrollTop: sc ? sc.scrollTop : null,
        trail: [...document.querySelectorAll(sel + " .booklet-design-crumb button")].map(b => b.textContent + (b.getAttribute("aria-current") === "true" ? "*" : "")),
        crumbLines: (() => { const ys = new Set([...document.querySelectorAll(sel + " .booklet-design-crumb button")].map(b => Math.round(b.getBoundingClientRect().y))); return ys.size; })(),
        statusText: st ? st.textContent : null, statusTitle: st ? st.getAttribute("title") : null, statusPos: st ? getComputedStyle(st).position : null,
        statusClip: st ? [st.scrollWidth, st.clientWidth] : null, extra: extra ? r(q(extra)) : null,
        phone: !!document.querySelector(sel + " .view-content.is-phone"),
        paneW: (document.querySelector(sel + " .view-content") || {}).clientWidth,
      };
    }, [DV, extra]);
    const same = (a, b, keys) => keys.every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));
    const pick = (f, keys) => JSON.stringify(Object.fromEntries(keys.map(k => [k, f[k]])));
    await withApp("c77", async (o, vault) => {
      let seq = 0;
      const errs0 = consoleReport.length;
      const mk = () => { const name = "s" + (++seq), rel = `Still ${name}.booklet.md`, t = note(name); return { rel, file: put(vault, rel, t), t }; };
      const start = async (wide) => { const n = mk(); await openDesign(o, n.rel, "tab", true, wide); await goNav(o, "activity", lineOf(n.t, "[!activity|a]")); await armWrites(o, n.rel); await idle(o); return n; };
      const closeBox = async () => { for (let i = 0; i < 3 && (await state(o)).editBox; i++) { await o.page.keyboard.press("Escape"); await sleep(250); } await idle(o); };
      /** Scene A at the width the Obsidian is at now: each kind pressed for real, opened, closed. */
      const sceneA = async (label, n) => {
        const f0 = await frame(o);
        c.info(`${label}: the pane is ${f0.paneW} px wide (${f0.phone ? "phone layout" : "desktop layout"}), the header ${f0.top && f0.top[2]} px wide; the trail of the page is ${f0.trail.length} crumbs on ${f0.crumbLines} line(s), the header ${f0.top && f0.top[3]} px high`);
        c.ok(f0.trail.length >= 3 && f0.trail.filter(t => t.endsWith("*")).length === 1 && f0.trail[f0.trail.length - 1].endsWith("*"), `${label}: the trail names the booklet, the module and the activity, and the activity's own last crumb is the current one (${JSON.stringify(f0.trail.map(t => t.slice(0, 22)))})`);
        const keys = ["top", "crumb", "scroll", "pageAbs", "trail"];
        for (const [tag, kind, needle] of KINDS) {
          try {
            await shot(o, `still-a-${label.replace(/\W+/g, "")}-${tag}-0before`);
            await o.page.locator(block(kind, lineOf(n.t, needle))).scrollIntoViewIfNeeded(); await sleep(150);
            const b0 = await frame(o);
            await o.page.locator(block(kind, lineOf(n.t, needle))).click();
            await o.page.waitForSelector(block(kind, lineOf(n.t, needle)) + ".is-selected", { timeout: 5000 }); await sleep(250); await idle(o);
            const b1 = await frame(o); const open1 = (await state(o)).editBox;
            await shot(o, `still-a-${label.replace(/\W+/g, "")}-${tag}-1selected`);
            await closeBox(); await sleep(200);
            const b2 = await frame(o); const sel2 = (await state(o)).selected;
            const ok = same(b0, b1, keys) && same(b0, b2, keys);
            c.ok(ok, `${label}, ${tag}: a real press ${open1 ? "(the block opened in place) " : ""}and the block closed again (still selected: ${sel2}) change neither the header (${JSON.stringify(b0.top)}), the trail (${b0.crumbLines} line(s), ${b0.trail.length} crumbs), the scroll area, nor the page's place in it (${JSON.stringify(b0.pageAbs)})${ok ? "" : "; DIFFERENT: before " + pick(b0, keys) + ", opened " + pick(b1, keys) + ", closed " + pick(b2, keys)}`);
          } catch (e) { c.ok(false, `script error in scene A, ${label}, ${tag}: ${String(e && e.message || e).slice(0, 300)}`); await closeBox().catch(() => {}); }
        }
        // a press on the page's own last crumb still draws that page, and a press on the module's crumb goes up to the module
        const trailBefore = (await frame(o)).trail;
        await o.page.locator(`${DV} .booklet-design-crumb button`).nth(1).click(); await idle(o);
        const up = await frame(o);
        c.ok(up.trail.length === 2 && up.trail[1].endsWith("*") && up.trail[1].startsWith("Module"), `${label}: a press on the second crumb draws the module's page, whose own last crumb is the current one (${JSON.stringify(up.trail.map(t => t.slice(0, 22)))}; it was ${trailBefore.length} crumbs)`);
        await goNav(o, "activity", lineOf(n.t, "[!activity|a]"));
      };
      /** Scene B at the width Obsidian is at now: the strip, a real write, its message, the next message, the message cleared. */
      const sceneB = async (label, n) => {
        const keys = ["top", "scroll", "status", "extra", "trail"];            // what a write cannot change: the frame, and the Add button when the typed title is already the written one
        const frameKeys = ["top", "scroll", "trail"];
        const ADD = ".booklet-design-editbox [data-key='o-add']";
        const tag = label.replace(/\W+/g, "");
        /** The strip against the first line of the page, measured with the page scrolled to its top (and put back). */
        const firstLine = () => o.evaluate(sel => { const sc = document.querySelector(sel + " .booklet-design-scroll"), was = sc.scrollTop; sc.scrollTop = 0; const r = e => { const b = e.getBoundingClientRect(); return [b.top, b.bottom]; }; const out = { strip: r(document.querySelector(sel + " .booklet-design-status")), scroll: r(sc), kind: r(document.querySelector(sel + " .booklet-design-page-kind")), title: r(document.querySelector(sel + " .booklet-design-page-title")), pad: parseFloat(getComputedStyle(sc).paddingTop) }; sc.scrollTop = was; return out; }, DV);
        try {
          await clickBlock(o, "question", lineOf(n.t, "[!choice|fruit]"));
          await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("Which fruit would you pick?"); await sleep(200);
          await o.page.locator(`${DV} ${ADD}`).scrollIntoViewIfNeeded(); await sleep(250);
          const g0 = await frame(o, ADD);
          const sh = g0.status && g0.status[3];
          c.info(`${label}: the strip is ${sh} px high and ${g0.status && g0.status[2]} px wide, empty, at y ${g0.status && g0.status[1]} (the header ends at ${g0.top && rnd(g0.top[1] + g0.top[3])}, the scroll area starts at ${g0.scroll && g0.scroll[1]})`);
          c.ok(!!g0.status && g0.statusText === "" && g0.statusPos !== "absolute" && g0.statusPos !== "fixed" && g0.status[3] >= 16 && g0.scroll[1] >= g0.status[1] + g0.status[3] - 0.5 && g0.status[1] >= g0.top[1] + g0.top[3] - 0.5, `${label}: before any message the status strip is there (${sh} px high), in the flow (position ${g0.statusPos}), between the header and the scroll area, with nothing in it`);
          const fl0 = await firstLine();
          c.ok(fl0.strip[1] <= fl0.scroll[0] + 0.5 && fl0.strip[1] <= fl0.kind[0] + 0.5, `${label}: empty, the strip ends (${rnd(fl0.strip[1])}) above the scroll area (${rnd(fl0.scroll[0])}) and the page's first line (${rnd(fl0.kind[0])})`);
          await o.page.keyboard.press("Tab");
          await waitDisk(n.file, tx => tx !== n.t); await sleep(500); await idle(o);
          await o.page.locator(`${DV} ${ADD}`).scrollIntoViewIfNeeded(); await sleep(250);
          const g1 = await frame(o, ADD);
          await shot(o, `still-b-${tag}-1message`);
          c.ok(/^Changed /.test(g1.statusText || ""), `${label}: a real write (a typed title left by Tab) put its message in the strip (${JSON.stringify(g1.statusText)})`);
          c.ok(JSON.stringify(g1.status) === JSON.stringify(g0.status), `${label}: the strip has the same rectangle with its message as without (${JSON.stringify(g0.status)} then ${JSON.stringify(g1.status)})`);
          const fl1 = await firstLine();
          c.ok(fl1.strip[1] <= fl1.scroll[0] + 0.5 && fl1.strip[1] <= fl1.kind[0] + 0.5 && fl1.strip[1] <= fl1.title[0] + 0.5 && fl1.kind[0] >= fl1.scroll[0] + fl1.pad - 1, `${label}: with its message the strip ends (${rnd(fl1.strip[1])}) above the page's first line (${rnd(fl1.kind[0])}) and its title (${rnd(fl1.title[0])}) when the page is scrolled to its top: it covers none of the page`);
          c.ok(same(g0, g1, keys), `${label}: a message moved nothing: the header, the strip, the scroll area, the trail and the Add-an-option button have the same rectangles before and after it${same(g0, g1, keys) ? "" : "; DIFFERENT: " + pick(g0, keys) + " then " + pick(g1, keys)}`);
          // the next message (Undo says "Undone."), then none
          await undoBtn(o).click(); await waitDisk(n.file, tx => tx === n.t); await idle(o); await sleep(300);
          const g2 = await frame(o, ADD);
          // (Undo puts the focus back in the box and the browser may scroll the view's own scroller: so what is compared is where things stand against the header's top)
          const rel = f => JSON.stringify({ top: [f.top[2], f.top[3]], strip: [f.status[1] - f.top[1], ...f.status.slice(2)], scroll: [f.scroll[1] - f.top[1], f.scroll[2], f.scroll[3]], trail: f.trail });
          c.ok(/^Undone/.test(g2.statusText || "") && rel(g0) === rel(g2), `${label}: the next message ("${(g2.statusText || "").slice(0, 30)}") changes neither the header, the strip, the scroll area nor the trail, measured from the header's top${rel(g0) === rel(g2) ? "" : "; DIFFERENT: " + rel(g0) + " then " + rel(g2)}`);
          await o.evaluate(() => { app.workspace.getLeavesOfType("booklet-design")[0].view.say(""); });
          await sleep(200);
          const g3 = await frame(o, ADD);
          c.ok(g3.statusText === "" && g3.statusTitle === null && same(g2, g3, [...keys, "pageAbs", "titleRect", "kindRect"]), `${label}: cleared, the strip is empty (no title) and everything is where it was (header, strip, scroll area, trail, the page, its title and first line, the Add button)`);
          // a message too long for the strip: cut short, one line, the whole of it in the title, nothing moves
          const LONG = "Changed Question: " + "a very long title that goes on and on and on ".repeat(8);
          await o.evaluate(w => { app.workspace.getLeavesOfType("booklet-design")[0].view.say(w); }, LONG);
          await sleep(200);
          const g4 = await frame(o, ADD);
          await shot(o, `still-b-${tag}-2long`);
          c.ok(g4.statusText === LONG && g4.statusTitle === LONG && g4.statusClip[0] > g4.statusClip[1] && same(g2, g4, [...keys, "pageAbs", "titleRect", "kindRect"]), `${label}: a message much too long for the strip is cut short on one line (${g4.statusClip[0]} px of text in ${g4.statusClip[1]}), its whole text is the strip's title and the strip has the same rectangle (${JSON.stringify(g4.status)}); nothing else moved`);
          await o.evaluate(() => { app.workspace.getLeavesOfType("booklet-design")[0].view.say(""); });
        } catch (e) { c.ok(false, `script error in scene B, ${label}: ${String(e && e.message || e).slice(0, 300)}`); }
        await closeBox().catch(() => {});
      };
      let n;
      // ----- wide
      try {
        n = await start(true);
        await sceneA("wide", n);
        n = await start(true);
        await sceneB("wide", n);
      } catch (e) { c.ok(false, `script error in the wide pane (the next width goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeBox().catch(() => {}); }
      // ----- a pane just above the narrow switch: the left column still stands beside the page, which is then narrow and its trail wraps
      try {
        const f = await frame(o), vp = await o.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
        const delta = vp.w - f.paneW;
        await o.page.setViewportSize({ width: 740 + delta, height: vp.h }); await sleep(600);
        n = await start(false);
        const f2 = await frame(o);
        c.ok(!f2.phone && f2.paneW >= 700 && f2.paneW <= 780, `the pane is ${f2.paneW} px wide (the window ${740 + delta}) and still the desktop layout, just above the narrow switch (${f2.phone ? "it is the phone layout" : "desktop"})`);
        await sceneA("740 px", n);
        n = await start(false);
        await sceneB("740 px", n);
      } catch (e) { c.ok(false, `script error in the 740 px pane (the next width goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeBox().catch(() => {}); }
      // ----- the phone layout
      try {
        await o.page.setViewportSize({ width: 390, height: 844 });
        await mobile(o, true);
        await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
        n = await start(false);
        const f3 = await frame(o);
        c.ok(f3.phone || (await state(o)).phone, `390 px: the phone layout (the pane is ${f3.paneW} px wide)`);
        await sceneA("phone", n);
        n = await start(false);
        await sceneB("phone", n);
      } catch (e) { c.ok(false, `script error in the phone layout: ${String(e && e.message || e).slice(0, 300)}`); await closeBox().catch(() => {}); }
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* BEGIN STAGE3 */

  /* ================= CHECKS 78 TO 85: STAGE 3 (the other kinds' own settings, and very modest rich text) ================= */
  // Every note is made up here (note3) and written into the check's own copy of the vault, one note per scene, so a scene never reads what an
  // earlier one left. A write is counted with a vault "modify" listener of the page's own; the whole note is compared byte for byte; real mouse and
  // real keys only for what is under test (Playwright's keyboard and mouse), never fill() or a dispatched event.
  //   78 a scale's anchors as rows          79 number, text, lines settings named in words, the values the format fixes
  //   80 the each: picker                   81 a listen's media              82 a widget's data block
  //   83 the formatting bar and keys        84 nothing moves                 85 a phone, and the three looks
  const KEPT3 = { clarity: 1, where: [1] };
  const LONG3 = ", which is asked with a long title that a person might really write, going on over more than one line of a narrow pane";
  /**
   * The note of stages 3's checks: one of each piece. `kept` adds the records section with an answer for the scale `clarity` (the number 1) and for the
   * multi `where`; `long` gives the booklet, the module, the activity and every title long ones (check 84: the header's trail wraps).
   */
  const note3 = (name, { kept = false, long = false } = {}) => {
    const L = s => long ? s + LONG3 : s;
    return [
      "---", "booklet: \"0.20\"", `id: booklet-test/stage3-${name}`, `title: ${long ? "The long booklet of a long year" : "Stage three " + name}`, "lang: en", "---", "",
      `> [!module|m] ${long ? "A module with a long title too" : "Week"}`, "", `> [!activity|a] ${long ? "An activity titled at length" : "The week"}`, "",
      "Plain words of the activity, with a second sentence to select from.", "",
      "> [!tip] Start here", "> Words of the tip, and a second line.", "> A third line of words.", "",
      `> [!scale|clarity] ${L("How clear was the reading?")}`, "> Think of the whole week.", "", "0. Not clear", "1. A little clear", "2. Clear", "",
      "> [!scale|mood] How was the mood?", "1. Low", "2. High", "",
      "> [!scale|fresh] A scale with no anchors yet", "",
      `> [!choice|tools] ${L("Which tools did you use?")}`, "- [ ] Hammer", "- [ ] Saw", "",
      "> [!multi|where each:tools] Where did you use it?", "- [ ] Shed", "- [ ] Garden", "",
      `> [!number|sleep min:0 max:24] ${L("Hours slept")}`, "",
      `> [!text|noticed] ${L("What surprised you?")}`, "",
      "> [!date|when] When did it happen?", "",
      "> [!lines|wins earlier:3] Three things that went well", "",
      "> [!lines|ghost each:ghost] A follow-up of a pick that is not there", "",
      "> [!listen|ep1 left:60] Episode 1", "> ![Episode 1](media/e1.mp3)", "> Listen to the whole of it.", "",
      "> [!listen|ep2] Episode 2", "",
      "> [!listen|ep3] Episode 3", "> [Watch it](https://video.example.org/watch/3)", "",
      "> [!listen|ep4] Episode 4", "> Hear ![the tone](media/e4.mp3) in the middle of the words.", "",
      "> [!widget|body describe] Which muscles did you stretch?", "> ![[#^body-map]]", "",
      "> [!widget|empty] A widget with no data block yet", "",
      "> [!widget|lost] A widget that names a block that is not there", "> ![[#^gone]]", "",
      "> [!module|m end]", "",
      "> [!module|other] Another module", "", "> [!activity|b] Elsewhere", "", "> [!text|aside] A note", "", "> [!module|other end]", "",
      "> [!data|m] Data", "",
      "```booklet widget", "{ \"engine\": \"svg-regions\", \"figures\": [], \"regions\": [] }", "```", "^body-map", "",
      "```booklet widget", "{ \"engine\": \"grid-select\", \"cells\": [], \"items\": [] }", "```", "^board", "",
      "```booklet data", "{\"fields\":{\"title\":{\"label\":\"Name\",\"edit\":\"text\"}},\"idFormat\":\"l-{n}\",\"rows\":[{\"id\":\"l-1\",\"title\":\"First\"}]}", "```", "^logs", "",
      "> [!data|other] Data of the other module", "",
      "```booklet widget", "{ \"engine\": \"grid-select\", \"cells\": [], \"items\": [] }", "```", "^elsewhere", "",
      "```booklet data", "{\"fields\":{\"title\":{\"label\":\"Name\",\"edit\":\"text\"}},\"idFormat\":\"o-{n}\",\"rows\":[{\"id\":\"o-1\",\"title\":\"First\"}]}", "```", "^otherlogs", "",
      "> [!data] Data shared by every module", "",
      "```booklet widget", "{ \"engine\": \"svg-regions\", \"figures\": [], \"regions\": [] }", "```", "^shared", "",
      ...(kept ? ["%%", "> [!records] App record — do not edit below this line", "", "> [!records|m] Week", "", "```booklet answers", JSON.stringify(KEPT3), "```", "%%", ""] : []),
    ].join("\n");
  };
  /** The shared helpers of checks 78 to 85 for one running app: notes made and opened, writes counted, the strip's and the rows' controls, the dialog. */
  const kit3 = (o, c, vault, table) => {
    let seq = 0;
    const say = k => (table[k] ? table[k].en : "?" + k);
    const mk = opts => { const name = "s" + (++seq), rel = `Stage3 ${name}.booklet.md`, t = note3(name, opts); return { rel, file: put(vault, rel, t), t }; };
    const start = async (opts = {}, wide = true) => { const n = mk(opts); await openDesign(o, n.rel, "tab", true, wide); await goNav(o, "activity", lineOf(n.t, "[!activity|a]")); await armWrites(o, n.rel); return n; };
    const open = (n, needle, kind = "question") => clickBlock(o, kind, lineOf(text(n.file), needle));
    const W = n => writesOf(o, n.rel);
    const diffs = (want, got) => want === got ? "" : "; DIFFERS " + JSON.stringify(region(want, got)).slice(0, 300);
    /** After the note has changed from `from`: its text, read again once the write has settled. */
    const settled = async (n, from) => { const r = await waitDisk(n.file, tx => tx !== from); await sleep(450); await idle(o); return { ok: r.ok, text: text(n.file) }; };
    const STRIP = k => `${DV} .booklet-design-editbox .booklet-design-strip-item[data-field='${k}']`;
    const SI = k => `${STRIP(k)} input, ${STRIP(k)} select`;
    /** Real typing in a control of the box (the old text replaced), then Tab: the control is left and what was typed is applied. */
    const typeLeave = async (sel, s) => { const l = o.page.locator(sel); await l.click(); await o.page.keyboard.press("Control+a"); if (s === "") await o.page.keyboard.press("Backspace"); else await o.page.keyboard.type(s); await o.page.keyboard.press("Tab"); };
    const press = async sel => { const l = o.page.locator(sel); await l.scrollIntoViewIfNeeded(); await l.click(); await sleep(200); };
    const refusalOf = () => o.evaluate(sel => { const e = document.querySelector(sel + " .booklet-design-edit-refusal"); return e ? e.textContent : null; }, DV);
    const value = sel => o.page.locator(sel).inputValue();
    const focusKey = () => o.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute("data-key") || a.getAttribute("data-field") || a.className || a.tagName) : null; });
    const closeBox = async () => { for (let i = 0; i < 3 && (await state(o)).editBox; i++) { await o.page.keyboard.press("Escape"); await sleep(250); } await idle(o); };
    /** A press on Undo (a step that moves a kept answer asks, as the change did: answered Change). */
    const undo = async (kept = false) => { await undoBtn(o).click(); if (kept && await waitModal(o, true, 1200)) { c.info("Undo of a step that touched a kept answer opened the count-and-ask dialog; answered Change"); await clickModal(o, "Change"); } };
    /** A change that must ask: the dialog's words and the focus on Cancel; Cancel writes nothing and says so; the note is as it was. */
    const asks = async (n, before, label, words) => {
      const w0 = await W(n);
      const shown = await waitModal(o, true);
      let m = shown ? await modalInfo(o) : null;
      if (m && m.focus !== "Cancel") {
        // Obsidian puts the focus in a dialog a moment after drawing it: read it again for up to 1.5 s, and say what held it first.
        const first = m.focus; const t0 = Date.now();
        while (m.focus !== "Cancel" && Date.now() - t0 < 1500) { await new Promise(r => setTimeout(r, 40)); m = await modalInfo(o) || m; }
        c.info(`${label}: the focus was on ${JSON.stringify(first)} when the dialog appeared and on ${JSON.stringify(m.focus)} ${Date.now() - t0} ms later`);
      }
      c.ok(!!m && words.every(w => w.test(m.text)) && m.focus === "Cancel", `${label}: it opens the count-and-ask dialog (${JSON.stringify(m && m.text.replace(/\s+/g, " ").slice(0, 160))}) with the focus on Cancel`);
      if (shown) {
        await clickModal(o, "Cancel"); await idle(o);
        const st = await state(o);
        c.ok(text(n.file) === before && (await W(n)) === w0 && st.status === say("status.cancelled"), `${label}: Cancel writes nothing (the note is byte for byte as it was, ${await W(n)} writes), and says ${JSON.stringify(st.status)}`);
      }
    };
    /** Runs one scene; a script error is a failed assertion and the next scene goes on. */
    const scene = async (name, fn) => { try { await fn(); } catch (e) { c.ok(false, `script error in scene ${name} (the scene stopped here, the next one goes on): ${String(e && e.message || e).slice(0, 300)}`); await closeAll(o).catch(() => {}); } };
    return { say, mk, start, open, W, diffs, settled, STRIP, SI, typeLeave, press, refusalOf, value, focusKey, closeBox, undo, asks, scene };
  };

  /* ================= CHECK 78 ================= */
  async function check78() {
    const c = new Check(78, "a scale's anchors as rows in the real app, applied as you go: the number and the words of each anchor, move, remove and add, every change one write compared byte for byte with the whole note and one step of Undo (six changes undone and redone back to the exact bytes); a number that is not digits is refused with the reason and the row goes back; with an answer kept for the scale, a change that touches the anchor of that number (reworded, renumbered, removed) asks first and declining writes nothing, a move or an unkept anchor asks nothing; a list that starts at 0 keeps its blank line, and one made to start at 0 gets it");
    const table = tableOf();
    await withApp("c78", async (o, vault) => {
      const k = kit3(o, c, vault, table);
      const { start, open, W, diffs, settled, typeLeave, press, refusalOf, value, focusKey, closeBox, undo, asks, scene } = k;
      const errs0 = consoleReport.length;
      const inputs = () => o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-rows input[data-key]")].map(e => e.getAttribute("data-key") + "=" + e.value), DV);
      const heads = () => o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-rows .setting-item-heading")].map(e => e.textContent.trim()), DV);
      await scene("A. a scale with nothing kept: reword, renumber, add, move, remove, then Undo and Redo", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!scale|clarity]");
        c.ok((await heads()).join() === k.say("rows.anchors"), `A: the scale's box has a section headed ${JSON.stringify(await heads())}`);
        c.ok((await inputs()).join("|") === "a0-number=0|a0-text=Not clear|a1-number=1|a1-text=A little clear|a2-number=2|a2-text=Clear", `A: the three anchors are rows, each with its number and its words (${(await inputs()).join("|")})`);
        c.ok(await value(TITLE_F) === "How clear was the reading?" && await value(DESC_F) === "Think of the whole week.", "A: the scale's own words are the fields above the rows (title and description), the anchors are the rows");
        const names = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-rows button")].slice(0, 4).map(b => b.getAttribute("aria-label")), DV);
        c.ok(names.join("|") === "Anchor 1: move up|Anchor 1: move down|Anchor 1: remove|Anchor 2: move up", `A: every button of a row has its own name for a screen reader (${JSON.stringify(names)})`);
        c.ok(await o.page.locator(RW("a0-up")).isDisabled() && await o.page.locator(RW("a2-down")).isDisabled(), "A: the first anchor cannot move up and the last cannot move down");
        const states = [t0];
        const step = async (label, want) => {
          const r = await settled(n, states[states.length - 1]);
          c.ok(r.ok && r.text === want && await W(n) === states.length, `A: ${label}: one write (${await W(n)} in all), the whole note equals the expected one byte for byte${diffs(want, r.text)}`);
          states.push(want);
        };
        await typeLeave(RW("a1-text"), "Some");
        await step("anchor 2 reworded", sub(t0, "1. A little clear\n", "1. Some\n"));
        await typeLeave(RW("a2-number"), "4");
        await step("anchor 3 renumbered 4", sub(states[1], "2. Clear\n", "4. Clear\n"));
        // a number that is not digits: refused with the reason, nothing written, the row goes back
        const w = await W(n);
        await typeLeave(RW("a2-number"), "x");
        await sleep(400); await idle(o);
        const why = await refusalOf();
        c.ok(text(n.file) === states[2] && await W(n) === w && /^Not changed\. /.test(why || "") && /digits only/.test(why || ""), `A: a number typed as "x" is refused in words (${JSON.stringify(why)}) and nothing is written`);
        c.ok(await value(RW("a2-number")) === "4", `A: and the row goes back to the note's number (${await value(RW("a2-number"))})`);
        await press(RW("a-add"));
        c.ok(await focusKey() === "a3-text", `A: Add an anchor puts the focus in the new row's words (${await focusKey()})`);
        await step("an anchor added after the last, numbered one more", sub(states[2], "4. Clear\n", "4. Clear\n5. \n"));
        await typeLeave(RW("a3-text"), "Very clear");
        await step("its words typed", sub(states[3], "5. \n", "5. Very clear\n"));
        await press(RW("a3-up"));
        await step("the last anchor moved up (numbers and words travel together)", sub(states[4], "4. Clear\n5. Very clear\n", "5. Very clear\n4. Clear\n"));
        await press(RW("a1-remove"));
        await step("anchor 2 removed", sub(states[5], "1. Some\n", ""));
        await shotOk(o, "scale-rows");
        c.ok(await state(o).then(s => s.modal === false), "A: nothing was asked on the way (no answer is kept)");
        // six changes: six steps of Undo, each giving back the state before it
        for (let i = states.length - 1; i >= 1; i--) {
          const before = W(n);
          await undo(); const r = await waitDisk(n.file, tx => tx === states[i - 1]); await idle(o);
          c.ok(r.ok && await W(n) === (await before) + 1, `A: Undo step ${states.length - i} gave back the state before change ${i} byte for byte, in one write`);
        }
        c.ok(text(n.file) === t0, "A: six Undos gave the original note back byte for byte");
        for (let i = 1; i < states.length; i++) { await redoBtn(o).click(); const r = await waitDisk(n.file, tx => tx === states[i]); await idle(o); if (!r.ok) c.ok(false, `A: Redo ${i} did not give the state after change ${i}${diffs(states[i], text(n.file))}`); }
        c.ok(text(n.file) === states[states.length - 1], "A: six Redos made the last state again, byte for byte");
        await closeBox();
      });
      await scene("B. a scale with an answer kept (the number 1): what touches it asks, what does not writes at once", async () => {
        const n = await start({ kept: true }); let cur = n.t;
        await open(n, "[!scale|clarity]");
        await typeLeave(RW("a0-text"), "Not at all clear");
        let r = await settled(n, cur);
        c.ok(r.ok && r.text === sub(cur, "0. Not clear\n", "0. Not at all clear\n") && await W(n) === 1 && !(await state(o)).modal, `B: rewording anchor 0 (nobody kept the number 0) writes at once and asks nothing${diffs(sub(cur, "0. Not clear\n", "0. Not at all clear\n"), r.text)}`);
        cur = r.text;
        await typeLeave(RW("a1-text"), "Somewhat clear");
        await asks(n, cur, "B: rewording the anchor of the kept number 1", [/clarity/, /saved answer/i]);
        c.ok(await value(RW("a1-text")) === "A little clear", `B: after Cancel the row shows the note's words again (${await value(RW("a1-text"))})`);
        await press(RW("a1-remove"));
        await asks(n, cur, "B: removing the anchor of the kept number 1", [/clarity/]);
        await typeLeave(RW("a1-number"), "3");
        await asks(n, cur, "B: renumbering the anchor of the kept number 1 (its words would no longer be the answer's)", [/clarity/]);
        c.ok(await value(RW("a1-number")) === "1" && text(n.file) === cur, "B: the three declined changes left the note as it was and the rows read what the note has");
        // a move keeps every number with its words, so no kept answer changes its meaning: nothing is asked
        await press(RW("a2-up"));
        r = await settled(n, cur);
        c.ok(r.ok && r.text === sub(cur, "1. A little clear\n2. Clear\n", "2. Clear\n1. A little clear\n") && await W(n) === 2 && !(await state(o)).modal, `B: moving anchor 3 up asks nothing (each number travels with its words) and is one write${diffs(sub(cur, "1. A little clear\n2. Clear\n", "2. Clear\n1. A little clear\n"), r.text)}`);
        cur = r.text;
        await press(RW("a1-remove"));
        r = await settled(n, cur);
        c.ok(r.ok && r.text === sub(cur, "2. Clear\n", "") && await W(n) === 3 && !(await state(o)).modal, `B: removing the anchor of the number 2 (not kept) asks nothing${diffs(sub(cur, "2. Clear\n", ""), r.text)}`);
        cur = r.text;
        // the ask answered Change: written, one step
        await typeLeave(RW("a1-text"), "Somewhat clear");
        await waitModal(o, true); await clickModal(o, "Change");
        r = await settled(n, cur);
        c.ok(r.ok && r.text === sub(cur, "1. A little clear\n", "1. Somewhat clear\n") && await W(n) === 4, `B: answered Change, the reworded anchor is written, one write${diffs(sub(cur, "1. A little clear\n", "1. Somewhat clear\n"), r.text)}`);
        for (let i = 0; i < 4; i++) await undo(true);
        const back = await waitDisk(n.file, tx => tx === n.t, 6000); await idle(o);
        c.ok(back.ok && await W(n) === 8, `B: four changes, four Undo steps (${await W(n)} writes in all): the note is the original byte for byte${diffs(n.t, text(n.file))}`);
        await closeBox();
      });
      await scene("C. the blank line of a list that does not start at 1", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!scale|clarity]");
        await typeLeave(RW("a0-text"), "Nil");
        let r = await settled(n, t0);
        c.ok(r.ok && r.text === sub(t0, "0. Not clear\n", "0. Nil\n") && r.text.includes("the whole week.\n\n0. Nil\n"), "C: a scale that starts at 0 keeps the blank line the format needs above its list when an anchor's words are changed");
        await press(RW("a0-remove"));
        r = await settled(n, r.text);
        c.ok(r.ok && r.text.includes("the whole week.\n\n1. A little clear\n2. Clear\n"), "C: and the blank line is still there when the 0 anchor is removed");
        await closeBox();
        // one that starts at 1 and is made to start at 0 gets the blank line; Undo takes it away again
        const m = await start(); const m0 = m.t;
        await open(m, "[!scale|mood]");
        await typeLeave(RW("a0-number"), "0");
        r = await settled(m, m0);
        c.ok(r.ok && r.text === sub(m0, "> [!scale|mood] How was the mood?\n1. Low\n", "> [!scale|mood] How was the mood?\n\n0. Low\n"), `C: the anchor "1. Low" renumbered 0 puts a blank line above the list (a 0 list straight under the question would be read as part of it)${diffs(sub(m0, "> [!scale|mood] How was the mood?\n1. Low\n", "> [!scale|mood] How was the mood?\n\n0. Low\n"), r.text)}`);
        await undo(); const u = await waitDisk(m.file, tx => tx === m0); await idle(o);
        c.ok(u.ok, "C: Undo gives the note back without the blank line, byte for byte");
        await closeBox();
        // a scale with no anchors: a first anchor numbered 1 straight under the question, its words, then 0 and the blank line
        const f = await start(); const f0 = f.t;
        await open(f, "[!scale|fresh]");
        c.ok(await o.evaluate(sel => (document.querySelector(sel + " .booklet-design-rows-none") || {}).textContent, DV) === k.say("rows.none"), `C: a scale with no anchors says ${JSON.stringify(k.say("rows.none"))}`);
        await press(RW("a-add"));
        const f1 = sub(f0, "A scale with no anchors yet\n", "A scale with no anchors yet\n1. \n");
        r = await settled(f, f0);
        c.ok(r.ok && r.text === f1 && await value(RW("a0-number")) === "1", `C: Add an anchor on a scale with none writes "1. " under the question${diffs(f1, r.text)}`);
        await typeLeave(RW("a0-text"), "Low");
        r = await settled(f, f1);
        const f2 = sub(f1, "1. \n", "1. Low\n");
        c.ok(r.ok && r.text === f2, `C: its words typed and left${diffs(f2, r.text)}`);
        await typeLeave(RW("a0-number"), "0");
        r = await settled(f, f2);
        const f3 = sub(f2, "A scale with no anchors yet\n1. Low\n", "A scale with no anchors yet\n\n0. Low\n");
        c.ok(r.ok && r.text === f3, `C: numbering it 0 puts the blank line above it${diffs(f3, r.text)}`);
        for (let i = 0; i < 3; i++) { await undo(); await sleep(350); await idle(o); }
        c.ok(text(f.file) === f0, "C: three Undos give the note back byte for byte");
        await closeBox();
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }
  /** A screenshot of the open view (the harness's own), true when it was taken. */
  const shotOk = async (o, name) => { try { await shot(o, name); return true; } catch (e) { return false; } };

  /* ================= CHECK 79 ================= */
  /** The settings strip of the open box as a person reads it: [data-field, the words that name it]. */
  const stripNames = o => o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-editbox .booklet-design-strip-item")].map(e => [e.getAttribute("data-field"), ((e.querySelector(".booklet-design-strip-label, button[role=switch]") || {}).textContent || "").trim()]), DV);
  async function check79() {
    const c = new Check(79, "the settings of a number, text, date and lines question in words with the line's own word after (Smallest number (min), Big box (long), How many earlier answers to suggest (earlier)), in the real app: min, max and step take a number (-2, 0.5 and 12.5 are written, \"many\" and \"1,5\" are refused with the reason in words, nothing is written and the field goes back), earlier takes digits only (a phone's number pad), empty takes a setting off, the Big box switch writes and takes off `long`; every change one write, one step of Undo, the whole note compared byte for byte, Undo back to the exact original");
    const table = tableOf();
    await withApp("c79", async (o, vault) => {
      const k = kit3(o, c, vault, table);
      const { start, open, W, diffs, settled, SI, STRIP, typeLeave, press, refusalOf, value, closeBox, undo, scene, say } = k;
      const errs0 = consoleReport.length;
      const nm = (key, word) => [word, `${say(key)} (${word})`];
      const inputMode = sel => o.page.locator(sel).evaluate(e => e.inputMode);
      await scene("A. a number question: min, max, step", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!number|sleep");
        const names = await stripNames(o);
        c.ok(JSON.stringify(names) === JSON.stringify([["id", say("form.id")], nm("setting.min", "min"), nm("setting.max", "max"), nm("setting.step", "step"), nm("setting.each", "each")]), `A: the strip names each setting in words, with the line's own word after: ${JSON.stringify(names.map(x => x[1]))}`);
        c.ok(await inputMode(SI("min")) === "decimal" && await inputMode(SI("step")) === "decimal", "A: min, max and step show a phone's decimal keypad");
        c.ok(await value(SI("min")) === "0" && await value(SI("max")) === "24" && await value(SI("step")) === "", "A: min 0 and max 24 are the line's, step is empty");
        await shotOk(o, "number-strip");
        // refused: the reason in words, nothing written, the field goes back
        for (const bad of ["many", "1,5"]) {
          const w = await W(n), strip0 = (await state(o)).status;
          await typeLeave(SI("max"), bad); await sleep(400); await idle(o);
          const why = await refusalOf();
          c.ok((await state(o)).status === strip0, `A: the reason is the red line inside the box; the status strip keeps what it said (${JSON.stringify(strip0)})`);
          c.ok(text(n.file) === t0 && await W(n) === w && /^Not changed\. .max. takes a number, such as 0, 12 or 2\.5\./.test(why || ""), `A: ${JSON.stringify(bad)} in max is refused in words (${JSON.stringify(why)}), nothing is written`);
          c.ok(await value(SI("max")) === "24", `A: and the field goes back to the note's 24 (${await value(SI("max"))})`);
        }
        const states = [t0];
        const step = async (label, want) => {
          const r = await settled(n, states[states.length - 1]);
          c.ok(r.ok && r.text === want && await W(n) === states.length, `A: ${label}: one write (${await W(n)} in all), the whole note equals the expected one${diffs(want, r.text)}`);
          states.push(want);
        };
        await typeLeave(SI("max"), "12.5");
        await step("max 12.5", sub(t0, "min:0 max:24]", "min:0 max:12.5]"));
        await typeLeave(SI("min"), "-2");
        await step("min -2 (a negative number is a number)", sub(states[1], "min:0 max:12.5]", "min:-2 max:12.5]"));
        await typeLeave(SI("step"), "0.5");
        await step("step 0.5 added", sub(states[2], "min:-2 max:12.5]", "min:-2 max:12.5 step:0.5]"));
        await typeLeave(SI("min"), "");
        await step("min emptied: the setting is taken off the line", sub(states[3], "min:-2 max:12.5 step:0.5]", "max:12.5 step:0.5]"));
        for (let i = states.length - 1; i >= 1; i--) { await undo(); const r = await waitDisk(n.file, tx => tx === states[i - 1]); await idle(o); if (!r.ok) c.ok(false, `A: Undo ${states.length - i} did not give back the state before change ${i}${diffs(states[i - 1], text(n.file))}`); }
        c.ok(text(n.file) === t0 && await W(n) === 8, `A: four changes, four Undo steps (${await W(n)} writes in all): the original note byte for byte`);
        await closeBox();
      });
      await scene("B. a lines question: earlier takes digits only", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!lines|wins");
        const names = await stripNames(o);
        c.ok(JSON.stringify(names) === JSON.stringify([["id", say("form.id")], nm("setting.each", "each"), nm("setting.earlier", "earlier")]), `B: the strip is ${JSON.stringify(names.map(x => x[1]))}`);
        c.ok(await inputMode(SI("earlier")) === "numeric" && await value(SI("earlier")) === "3", "B: earlier shows a phone's number pad (digits only) and holds the line's 3");
        for (const bad of ["-1", "x", "2.5"]) {
          const w = await W(n);
          await typeLeave(SI("earlier"), bad); await sleep(400); await idle(o);
          const why = await refusalOf();
          c.ok(text(n.file) === t0 && await W(n) === w && /^Not changed\. .earlier. takes a whole number written in digits/.test(why || "") && await value(SI("earlier")) === "3", `B: ${JSON.stringify(bad)} is refused (${JSON.stringify(why)}), nothing is written, the field is back to 3`);
        }
        await typeLeave(SI("earlier"), "5");
        let r = await settled(n, t0);
        c.ok(r.ok && r.text === sub(t0, "[!lines|wins earlier:3]", "[!lines|wins earlier:5]") && await W(n) === 1, `B: 5 is written, one write${diffs(sub(t0, "[!lines|wins earlier:3]", "[!lines|wins earlier:5]"), r.text)}`);
        await typeLeave(SI("earlier"), "");
        r = await settled(n, r.text);
        c.ok(r.ok && r.text === sub(t0, "[!lines|wins earlier:3]", "[!lines|wins]") && await W(n) === 2, `B: emptied, the setting is taken off the line${diffs(sub(t0, "[!lines|wins earlier:3]", "[!lines|wins]"), r.text)}`);
        await undo(); await waitDisk(n.file, tx => tx === sub(t0, "[!lines|wins earlier:3]", "[!lines|wins earlier:5]")); await undo(); const back = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(back.ok && await W(n) === 4, "B: two changes, two Undo steps: the original note byte for byte");
        await closeBox();
      });
      await scene("C. a text question: the Big box switch; a date question has only an id and each", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!text|noticed]");
        const names = await stripNames(o);
        c.ok(JSON.stringify(names) === JSON.stringify([["id", say("form.id")], nm("setting.long", "long"), nm("setting.each", "each")]), `C: the strip is ${JSON.stringify(names.map(x => x[1]))}`);
        const sw = `${STRIP("long")} button[role='switch']`;
        c.ok(await o.page.locator(sw).getAttribute("aria-checked") === "false", "C: the Big box switch is off");
        await press(sw);
        let r = await settled(n, t0);
        c.ok(r.ok && r.text === sub(t0, "[!text|noticed]", "[!text|noticed long]") && await W(n) === 1 && await o.page.locator(sw).getAttribute("aria-checked") === "true", `C: pressing it writes \`long\` and nothing else (one write), the switch reads on${diffs(sub(t0, "[!text|noticed]", "[!text|noticed long]"), r.text)}`);
        await press(sw);
        r = await settled(n, r.text);
        c.ok(r.ok && r.text === t0 && await W(n) === 2, "C: pressing it again takes `long` off: the original note byte for byte, one more write");
        await undo(); await waitDisk(n.file, tx => tx === sub(t0, "[!text|noticed]", "[!text|noticed long]")); await undo(); await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(text(n.file) === t0 && await W(n) === 4, "C: and two Undos change it forth and back, each one write");
        await closeBox();
        await open(n, "[!date|when]");
        const dn = await stripNames(o);
        c.ok(JSON.stringify(dn) === JSON.stringify([["id", say("form.id")], nm("setting.each", "each")]), `C: a date question's strip is ${JSON.stringify(dn.map(x => x[1]))}`);
        await closeBox();
        c.ok(text(n.file) === t0, "C: opening and closing boxes wrote nothing");
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 80 ================= */
  async function check80() {
    const c = new Check(80, "the each: picker in the real app: a list of only the sources the reader and the linter accept (the choices, multis and widgets of the activity that have no each: of their own, and the data blocks in reach, never the question itself, a scale or a number, or a block of another module), chosen with the keyboard on the real drop-down, one write and one step of Undo, Nothing takes the setting off, a source the line names that is not there is listed as not found; with an answer kept, changing each: asks first and declining writes nothing and puts the picker back");
    const table = tableOf();
    await withApp("c80", async (o, vault) => {
      const k = kit3(o, c, vault, table);
      const { start, open, W, diffs, settled, SI, say, value, closeBox, undo, asks, scene } = k;
      const errs0 = consoleReport.length;
      const optionsOf = sel => o.page.locator(sel).evaluate(e => [...e.options].map(x => [x.value, x.textContent]));
      /** The real drop-down, closed, with the keyboard focus on it: a key changes it as a person's would. */
      const keyOn = async (sel, ...keys) => { await o.page.focus(sel); for (const key of keys) { await o.page.keyboard.press(key); await sleep(120); } };
      await scene("A. nothing kept: the list, choosing, Nothing, Undo", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!number|sleep");
        const sel = SI("each");
        c.ok(await o.page.locator(sel).evaluate(e => e.tagName) === "SELECT" && await value(sel) === "", "A: a number question with no each: has a drop-down on Nothing (a real select element)");
        const opts = await optionsOf(sel);
        // (a widget line that embeds no block is not a question the reader draws, so it is not a source: `empty` is not listed)
        const want = [["", say("each.none")], ["tools", "tools (choice)"], ["body", "body (widget)"], ["lost", "lost (widget)"], ["logs", "logs (data block)"]];
        c.ok(JSON.stringify(opts) === JSON.stringify(want), `A: it lists Nothing, the choice, the widgets and the data block of the module, in the note's order: ${JSON.stringify(opts.map(x => x[1]))}`);
        const bad = ["where", "clarity", "mood", "sleep", "noticed", "when", "wins", "ep1", "elsewhere", "otherlogs", "shared", "board", "body-map"];
        c.ok(!opts.some(x => bad.includes(x[0])), "A: and none of what is not a valid source: not the multi that has an each: of its own, not a scale, number, text, date, lines or listen, not a data block or a widget block of another module or the data blocks a widget embeds");
        await shotOk(o, "each-picker");
        await keyOn(sel, "ArrowDown");
        let r = await settled(n, t0);
        const w1 = sub(t0, "[!number|sleep min:0 max:24]", "[!number|sleep min:0 max:24 each:tools]");
        c.ok(r.ok && r.text === w1 && await W(n) === 1 && await value(sel) === "tools", `A: choosing tools with the Down key writes \`each:tools\` and nothing else, one write${diffs(w1, r.text)}`);
        await keyOn(sel, "ArrowDown");
        const w2 = sub(t0, "[!number|sleep min:0 max:24]", "[!number|sleep min:0 max:24 each:body]");
        r = await settled(n, w1);
        c.ok(r.ok && r.text === w2 && await W(n) === 2, `A: another source with the Down key is one more write (each:body)${diffs(w2, r.text)}`);
        await keyOn(sel, "Home");
        r = await settled(n, w2);
        c.ok(r.ok && r.text === t0 && await W(n) === 3 && await value(sel) === "", `A: Nothing takes the setting off: the original note byte for byte, one more write${diffs(t0, r.text)}`);
        await undo(); await waitDisk(n.file, tx => tx === w2); await undo(); await waitDisk(n.file, tx => tx === w1); await undo(); const back = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(back.ok && await W(n) === 6, `A: three changes, three Undo steps (${await W(n)} writes in all)`);
        await closeBox();
      });
      await scene("B. an answer is kept for the multi that has each:tools: changing it asks", async () => {
        const n = await start({ kept: true }); const t0 = n.t;
        await open(n, "[!multi|where");
        const sel = SI("each");
        c.ok(await value(sel) === "tools", "B: the picker reads tools, the line's");
        const opts = await optionsOf(sel);
        c.ok(JSON.stringify(opts.map(x => x[0])) === JSON.stringify(["", "tools", "body", "lost", "logs"]), `B: its sources are the others, not itself (${JSON.stringify(opts.map(x => x[0]))})`);
        await keyOn(sel, "ArrowDown");
        await asks(n, t0, "B: choosing body for a question with a kept answer (the way it is asked changes)", [/where/, /saved answer/i]);
        await idle(o);
        c.ok(await value(sel) === "tools", `B: after Cancel the picker is back on tools (${await value(sel)})`);
        await keyOn(sel, "Home");
        await asks(n, t0, "B: choosing Nothing for it", [/where/]);
        c.ok(await value(sel) === "tools", "B: the picker is back on tools again");
        await keyOn(sel, "ArrowDown");
        await waitModal(o, true); await clickModal(o, "Change");
        const r = await settled(n, t0);
        c.ok(r.ok && r.text === sub(t0, "[!multi|where each:tools]", "[!multi|where each:body]") && await W(n) === 1, `B: answered Change, \`each:body\` is written, one write${diffs(sub(t0, "[!multi|where each:tools]", "[!multi|where each:body]"), r.text)}`);
        await undo(true); const back = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(back.ok && await W(n) === 2, "B: one Undo (it asks as the change did, answered Change) gives the note back byte for byte");
        await closeBox();
      });
      await scene("C. a source the line names that is not there is listed as not found", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!lines|ghost");
        const sel = SI("each");
        const opts = await optionsOf(sel);
        c.ok(await value(sel) === "ghost" && opts[opts.length - 1][0] === "ghost" && opts[opts.length - 1][1] === say("rows.menu.missing").replace("{id}", "ghost"), `C: each:ghost is listed last and said as not found (${JSON.stringify(opts[opts.length - 1])}), the picker reads it`);
        await closeBox();
        c.ok(text(n.file) === t0 && await W(n) === 0, "C: opening and closing it wrote nothing");
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 81 ================= */
  async function check81() {
    const c = new Check(81, "a listen question's media as controls in the real app: its address and its name under its words, changed one write and one step of Undo each, only the pieces asked for are rewritten (the ! and the brackets, the other lines and bytes stay); an embed whose address is not audio or video is refused with the reason and the field goes back; typing an address under a listen with none adds an embed for an audio or video address and a link for any other; a link says the person answering can only tick it; a media line in the middle of a sentence has no controls, says why and opens the Markdown; seconds-left takes digits only; the whole note compared byte for byte, no dialog (nothing kept is touched)");
    const table = tableOf();
    await withApp("c81", async (o, vault) => {
      const k = kit3(o, c, vault, table);
      const { start, open, W, diffs, settled, SI, STRIP, say, typeLeave, refusalOf, value, closeBox, undo, scene, focusKey } = k;
      const errs0 = consoleReport.length;
      const MT = RW("media-target"), MA = RW("media-alt");
      const mediaHead = () => o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-rows .setting-item-heading")].map(e => e.textContent.trim()), DV);
      await scene("A. an embed: its address and its name", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!listen|ep1");
        c.ok((await mediaHead()).includes(say("media.heading")) && await value(MT) === "media/e1.mp3" && await value(MA) === "Episode 1", `A: a section headed ${JSON.stringify(say("media.heading"))} holds the address (${await value(MT)}) and the name (${await value(MA)}) of the line's embed`);
        c.ok(await value(DESC_F) === "Listen to the whole of it." && await value(TITLE_F) === "Episode 1", "A: the question's words are the fields above, apart from the media line");
        await shotOk(o, "listen-media");
        await typeLeave(MT, "media/e2.m4a");
        let r = await settled(n, t0);
        const s1 = sub(t0, "![Episode 1](media/e1.mp3)", "![Episode 1](media/e2.m4a)");
        c.ok(r.ok && r.text === s1 && await W(n) === 1 && !(await state(o)).modal, `A: a new address is written into the embed and nothing else (one write, nothing asked)${diffs(s1, r.text)}`);
        await typeLeave(MA, "Episode One");
        r = await settled(n, s1);
        const s2 = sub(s1, "![Episode 1](media/e2.m4a)", "![Episode One](media/e2.m4a)");
        c.ok(r.ok && r.text === s2 && await W(n) === 2, `A: a new name is written in the brackets and nothing else${diffs(s2, r.text)}`);
        // refused: an embed's address has to be audio or video
        const w = await W(n);
        await typeLeave(MT, "https://video.example.org/watch"); await sleep(400); await idle(o);
        const why = await refusalOf();
        c.ok(text(n.file) === s2 && await W(n) === w && /^Not changed\. An embed's address ends in an audio or video extension/.test(why || ""), `A: an embed given a web page's address is refused with the reason (${JSON.stringify(why)}) and nothing is written`);
        c.ok(await value(MT) === "media/e2.m4a", `A: and the address field goes back to the note's (${await value(MT)})`);
        await typeLeave(MA, "Bad [name]"); await sleep(400); await idle(o);
        c.ok(text(n.file) === s2 && /^Not changed\. /.test(await refusalOf() || "") && await value(MA) === "Episode One", `A: a name with a bracket is refused too (${JSON.stringify(await refusalOf())}) and the field goes back`);
        await undo(); await waitDisk(n.file, tx => tx === s1); await undo(); const back = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(back.ok && await W(n) === 4, "A: two changes, two Undo steps: the original note byte for byte");
        // seconds left: digits only
        const w3 = await W(n);
        await typeLeave(SI("left"), "1m"); await sleep(400); await idle(o);
        c.ok(text(n.file) === t0 && await W(n) === w3 && /^Not changed\. .left. takes a whole number of seconds written in digits/.test(await refusalOf() || "") && await value(SI("left")) === "60", `A: seconds left typed as "1m" is refused (${JSON.stringify(await refusalOf())}), the field is back to 60`);
        await typeLeave(SI("left"), "90");
        r = await settled(n, t0);
        c.ok(r.ok && r.text === sub(t0, "[!listen|ep1 left:60]", "[!listen|ep1 left:90]") && await W(n) === w3 + 1, `A: 90 is written${diffs(sub(t0, "[!listen|ep1 left:60]", "[!listen|ep1 left:90]"), r.text)}`);
        await undo(); const b2 = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(b2.ok, "A: and one Undo takes it back");
        await closeBox();
      });
      await scene("B. no media yet: an address types an embed, or a link", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!listen|ep2");
        c.ok(await value(MT) === "" && await o.evaluate(sel => (document.querySelector(sel + " .booklet-design-rows .booklet-design-rows-none") || {}).textContent, DV) === say("media.add") && (await o.page.locator(MA).count()) === 0, `B: a listen with no media says ${JSON.stringify(say("media.add"))}, with an empty address field and no name field yet`);
        await typeLeave(MT, "media/e2.mp3");
        let r = await settled(n, t0);
        const e1 = sub(t0, "> [!listen|ep2] Episode 2\n", "> [!listen|ep2] Episode 2\n> ![Episode 2](media/e2.mp3)\n");
        c.ok(r.ok && r.text === e1 && await W(n) === 1, `B: an audio address writes an embed named by the question's words under its line (one write)${diffs(e1, r.text)}`);
        c.ok(await value(MT) === "media/e2.mp3" && await value(MA) === "Episode 2", `B: and the box then shows the address and the name (${await value(MT)}, ${await value(MA)})`);
        await undo(); const b1 = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(b1.ok && await W(n) === 2, "B: Undo takes the added line away again, byte for byte");
        await typeLeave(MT, "https://video.example.org/watch/2");
        r = await settled(n, t0);
        const l1 = sub(t0, "> [!listen|ep2] Episode 2\n", "> [!listen|ep2] Episode 2\n> [Episode 2](https://video.example.org/watch/2)\n");
        c.ok(r.ok && r.text === l1 && await W(n) === 3, `B: a web page's address writes a link, never an embed${diffs(l1, r.text)}`);
        c.ok((await o.page.locator(`${DV} .booklet-design-rows .booklet-design-rows-usedby`).textContent()) === say("media.link"), `B: and the box says what a link means (${JSON.stringify(say("media.link"))})`);
        await undo(); const b3 = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(b3.ok, "B: Undo takes it away");
        // the rest of the note is not touched by adding: a refused address
        const w = await W(n);
        await typeLeave(MT, "a b.mp3"); await sleep(400); await idle(o);
        c.ok(text(n.file) === t0 && await W(n) === w && /^Not changed\. An address has no space/.test(await refusalOf() || ""), `B: an address with a space is refused (${JSON.stringify(await refusalOf())}), nothing is added`);
        await closeBox();
      });
      await scene("C. a link: its address changes, it stays a link", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!listen|ep3");
        c.ok(await value(MT) === "https://video.example.org/watch/3" && await value(MA) === "Watch it" && (await o.page.locator(`${DV} .booklet-design-rows .booklet-design-rows-usedby`).textContent()) === say("media.link"), "C: the link's address and words are the controls, and the box says what a link means");
        await typeLeave(MT, "https://video.example.org/watch/4");
        const r = await settled(n, t0);
        c.ok(r.ok && r.text === sub(t0, "(https://video.example.org/watch/3)", "(https://video.example.org/watch/4)") && await W(n) === 1, `C: the address is written into the link, one write${diffs(sub(t0, "(https://video.example.org/watch/3)", "(https://video.example.org/watch/4)"), r.text)}`);
        await undo(); const b = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(b.ok, "C: and Undo takes it back");
        await closeBox();
      });
      await scene("D. a media line in the middle of a sentence has no controls", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!listen|ep4");
        const why = await o.evaluate(sel => { const e = document.querySelector(sel + " .booklet-design-rows .booklet-design-rows-refused"); return e ? e.textContent : null; }, DV);
        c.ok(why === say("media.unshown") && (await o.page.locator(MT).count()) === 0, `D: the box says why there are no controls (${JSON.stringify(why)}) and shows no address field`);
        c.ok(await o.page.locator(MD_AREA).isVisible() && (await markdownOf(o)).includes("Hear ![the tone](media/e4.mp3) in the middle"), "D: and the Markdown section is open with the block's own lines, so the way to edit it is on the screen");
        await closeBox();
        c.ok(text(n.file) === t0 && await W(n) === 0, "D: opening and closing it wrote nothing");
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 82 ================= */
  async function check82() {
    const c = new Check(82, "a widget question's data block in the real app: a picker of only the data blocks it can see (its module's and the shared ones, not another module's), choosing writes the block embed and nothing else (one write, one step of Undo, the whole note byte for byte), a widget with none offers only a placeholder, a block the widget cannot see is said and listed as not found; \"Open the data block\" opens that block's own Markdown (the JSON is never rewritten by controls) and writes nothing; the widget's own switches name their setting in words");
    const table = tableOf();
    await withApp("c82", async (o, vault) => {
      const k = kit3(o, c, vault, table);
      const { start, open, W, diffs, settled, STRIP, say, press, closeBox, undo, scene } = k;
      const errs0 = consoleReport.length;
      const PICK = `${DV} [data-key='widget-block']`;
      const optionsOf = sel => o.page.locator(sel).evaluate(e => [...e.options].map(x => [x.value, x.textContent]));
      const keyOn = async (sel, ...keys) => { await o.page.focus(sel); for (const key of keys) { await o.page.keyboard.press(key); await sleep(120); } };
      const textOf = sel => o.evaluate(([dv, s]) => { const e = document.querySelector(dv + " " + s); return e ? e.textContent : null; }, [DV, ".booklet-design-rows .booklet-design-rows-usesmenu"]);
      await scene("A. a widget that names a block", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!widget|body");
        c.ok((await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-rows .setting-item-heading")].map(e => e.textContent.trim()), DV)).includes(say("widget.heading")), `A: a section headed ${JSON.stringify(say("widget.heading"))}`);
        const opts = await optionsOf(PICK);
        c.ok(JSON.stringify(opts) === JSON.stringify([["body-map", "body-map (svg-regions)"], ["board", "board (grid-select)"], ["shared", "shared (svg-regions)"]]) && await o.page.locator(PICK).inputValue() === "body-map", `A: the picker reads body-map and lists the blocks of the widget's module and the shared one, not another module's (${JSON.stringify(opts.map(x => x[1]))})`);
        c.ok((await textOf()) && (await textOf()).includes(say("widget.block.engine").replace("{engine}", "svg-regions")) && (await o.page.locator(`${DV} [data-key='widget-open']`).count()) === 1, `A: the box says the data block's engine and that its JSON is edited in its own Markdown, and offers ${JSON.stringify(say("widget.block.open"))}`);
        await shotOk(o, "widget-block");
        await keyOn(PICK, "ArrowDown");
        let r = await settled(n, t0);
        const b1 = sub(t0, "> ![[#^body-map]]\n", "> ![[#^board]]\n");
        c.ok(r.ok && r.text === b1 && await W(n) === 1 && !(await state(o)).modal, `A: choosing board writes the embed's block id and nothing else (one write)${diffs(b1, r.text)}`);
        c.ok((await textOf() || "").includes(say("widget.block.engine").replace("{engine}", "grid-select")), "A: and the line under the picker now names the grid-select engine");
        await undo(); const u = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(u.ok && await W(n) === 2, "A: one Undo gives the note back byte for byte");
        // the switches of a widget are named in words
        const names = await stripNames(o);
        c.ok(names.some(x => x[0] === "readonly" && x[1] === `${say("setting.readonly")} (readonly)`) && names.some(x => x[0] === "describe" && x[1] === `${say("setting.describe")} (describe)`), `A: the widget's switches are named in words: ${JSON.stringify(names.map(x => x[1]))}`);
        await press(`${STRIP("readonly")} button[role='switch']`);
        r = await settled(n, t0);
        const g = region(t0, r.text);
        c.ok(r.ok && g.removed === "" && g.added === " readonly" && r.text.includes("[!widget|body describe readonly]") && await W(n) === 3, `A: the Only shown switch writes \`readonly\` and nothing else (${JSON.stringify(g)})`);
        await undo(); const u2 = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(u2.ok, "A: and Undo takes it off");
        // Open the data block: that block's own Markdown, nothing written
        const w = await W(n);
        await press(`${DV} [data-key='widget-open']`);
        await sleep(400); await idle(o);
        const st = await state(o);
        const md = await markdownOf(o);
        c.ok(st.editBox && /^fence@/.test(st.selected || "") && md !== null && md.startsWith("```booklet widget") && md.includes("\"engine\": \"svg-regions\""), `A: "Open the data block" opens the data block's own box (${st.selected}) with its Markdown, the JSON as written (${JSON.stringify((md || "").slice(0, 80))})`);
        c.ok(await o.page.locator(MD_AREA).isVisible(), "A: and its Markdown section is open, so the JSON is there to read and edit");
        c.ok(text(n.file) === t0 && await W(n) === w, "A: opening it wrote nothing");
        await closeBox();
        c.ok(text(n.file) === t0 && await W(n) === w, "A: closing it wrote nothing either");
      });
      await scene("B. a widget with no data block yet, and one that names a block it cannot see", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!widget|empty");
        const opts = await optionsOf(PICK);
        c.ok(opts[0][0] === "" && opts[0][1] === say("widget.block.none") && await o.page.locator(PICK).inputValue() === "" && (await o.page.locator(`${DV} [data-key='widget-open']`).count()) === 0, `B: a widget with no block has a picker on ${JSON.stringify(opts[0][1])} and no Open button`);
        // (the reader draws a widget only when it embeds a block, so a widget line with none is not a question it can place and its picker has nothing to offer:
        // the way to give it one is its Markdown, which the box shows. Said here so that nobody takes the placeholder for a working picker.)
        c.ok(opts.length === 1, `B: and it offers no block to choose, the reader not placing a widget that embeds none (${JSON.stringify(opts.map(x => x[1]))}); its Markdown is the way`);
        await closeBox();
        c.ok(text(n.file) === t0 && await W(n) === 0, "B: opening and closing it wrote nothing");
        await open(n, "[!widget|lost");
        const o2 = await optionsOf(PICK);
        c.ok(await o.page.locator(PICK).inputValue() === "gone" && o2[o2.length - 1][1] === say("rows.menu.missing").replace("{id}", "gone") && (await textOf() || "").includes(say("widget.block.lost").replace("{id}", "gone")), `B: a block the widget cannot see is listed last as not found and said: ${JSON.stringify(await textOf())}`);
        c.ok((await o.page.locator(`${DV} [data-key='widget-open']`).count()) === 0, "B: and has no Open button");
        await closeBox();
        c.ok(text(n.file) === t0, "B: opening and closing wrote nothing");
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 83 ================= */
  // The formatting keys are Ctrl+B, I, K and Ctrl+Shift+8 on this Linux Obsidian (Obsidian's Mod key is Control). On a Mac the keys are Cmd, not Ctrl (a Ctrl chord
  // there is the caret's own): that mapping is `richKeyOf`'s and is covered by a unit test only, never run here, since no Mac is at hand.
  const BAR = w => `${DV} .booklet-design-richbar .booklet-design-rich-button.is-${w}`;
  async function check83() {
    const c = new Check(83, "the formatting bar and keys in the real app, with a real mouse and real keyboard selection: Bold, Italic and Link on a title, a description and a tip's prose, Bullets in prose only (the button is quiet and the key does nothing in a title or a question's help); the bar's buttons are pressed with the mouse and the field keeps its focus and its selection; the keys Ctrl+B, I, K and Ctrl+Shift+8; none of it in the id field, an anchor's row or the Markdown text area; the bytes on disk change by the markers only (applied then removed gives back the original with no write), one write and one step of Undo; a press right after typing is not lost; a line that would become a rule and a link over several lines are refused with the reason in the status strip and write nothing; native Ctrl+Z in the field reverts one format step");
    const table = tableOf();
    await withApp("c83", async (o, vault) => {
      const k = kit3(o, c, vault, table);
      const { start, open, W, diffs, settled, STRIP, say, closeBox, undo, scene } = k;
      const errs0 = consoleReport.length;
      const fld = () => o.evaluate(() => { const a = document.activeElement; const bar = [...document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-rich-button")].map(b => b.getAttribute("data-rich") + ":" + b.getAttribute("aria-disabled")).join(","); return { tag: a ? a.tagName : null, cls: a ? a.className : null, key: a ? (a.getAttribute("data-field") || a.getAttribute("data-key") || a.className) : null, value: a && "value" in a ? a.value : null, start: a && typeof a.selectionStart === "number" ? a.selectionStart : null, end: a && typeof a.selectionEnd === "number" ? a.selectionEnd : null, bar }; });
      const sel = async (field, from, len) => { await o.page.locator(field).click(); await o.page.keyboard.press("Control+Home"); for (let i = 0; i < from; i++) await o.page.keyboard.press("ArrowRight"); for (let i = 0; i < len; i++) await o.page.keyboard.press("Shift+ArrowRight"); };
      const inField = (label, f) => c.ok(f.cls && /booklet-design-field/.test(f.cls), `${label}: the focus is still in the field (${f.key})`);
      const press = async w => { await o.page.locator(BAR(w)).click(); await sleep(250); };
      await scene("A. a title: the bar by mouse, the keys, Ctrl+Z, a press right after typing", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!scale|clarity]");
        const T = "How clear was the reading?";
        c.ok(await o.page.locator(TITLE_F).inputValue() === T, "A: the title field holds the line's own words");
        await sel(TITLE_F, 4, 5);
        let f = await fld();
        c.ok(f.value.slice(f.start, f.end) === "clear" && f.bar === "bold:false,italic:false,link:false,bullets:true", `A: "clear" is selected with the real keyboard; Bold, Italic and Link are on and Bullets is quiet in a title (${f.bar})`);
        await shotOk(o, "rich-title-selected");
        await press("bold");
        f = await fld();
        c.ok(f.value === "How **clear** was the reading?" && f.start === 6 && f.end === 11, `A: a real press on Bold wraps the word in the markers and keeps it selected (${JSON.stringify(f.value)}, ${f.start}..${f.end})`);
        inField("A: after the press", f);
        c.ok(text(n.file) === t0 && await W(n) === 0, "A: nothing is written while the field has the focus");
        await shotOk(o, "rich-title-bold");
        await press("bold");
        f = await fld();
        c.ok(f.value === T && f.start === 4 && f.end === 9, `A: a second press on Bold takes the markers off and the selection is where it was (${f.start}..${f.end})`);
        // Italic, then the field's own undo takes that one step back
        await press("italic");
        f = await fld();
        c.ok(f.value === "How *clear* was the reading?", `A: Italic wraps in single asterisks (${JSON.stringify(f.value)})`);
        await o.page.keyboard.press("Control+z"); await sleep(250);
        f = await fld();
        c.ok(f.value === T, `A: native Ctrl+Z in the field reverts that one format step (${JSON.stringify(f.value)})`);
        c.ok(text(n.file) === t0 && await W(n) === 0, "A: and still nothing is written (the field's own Undo, not the view's)");
        // the keys, with the selection made again from the keyboard: Ctrl+B
        await sel(TITLE_F, 4, 5);
        await o.page.keyboard.press("Control+b"); await sleep(200);
        f = await fld();
        c.ok(f.value === "How **clear** was the reading?" && f.start === 6 && f.end === 11, `A: Ctrl+B does what the button does (${JSON.stringify(f.value)})`);
        await o.page.keyboard.press("Tab");
        const want = sub(t0, "[!scale|clarity] How clear was", "[!scale|clarity] How **clear** was");
        let r = await settled(n, t0);
        c.ok(r.ok && r.text === want && await W(n) === 1, `A: leaving the field writes the title with the markers and nothing else, one write${diffs(want, r.text)}`);
        c.ok(r.text.replace(/\*/g, "") === t0.replace(/\*/g, ""), "A: the only bytes that changed are asterisks");
        await undo(); const u = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(u.ok && await W(n) === 2, "A: one Undo gives the note back byte for byte");
        // apply then remove: no write at all
        await sel(TITLE_F, 4, 5); await press("bold"); await press("bold");
        await o.page.keyboard.press("Tab"); await sleep(600); await idle(o);
        c.ok(text(n.file) === t0 && await W(n) === 2, "A: Bold on and Bold off, then leaving the field: the note is the same bytes and nothing was written");
        // a press right after typing is not lost
        await o.page.locator(TITLE_F).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type(" today");
        await press("bold");
        f = await fld();
        c.ok(f.value === T + " **today**", `A: a press on Bold right after typing is not swallowed: the word at the caret is marked (${JSON.stringify(f.value)})`);
        await o.page.keyboard.type(" more");
        f = await fld();
        c.ok(f.value === T + " **today more**" && /booklet-design-field/.test(f.cls), `A: and typing goes on in the same field, from the caret that stayed inside the marked word as in any editor (${JSON.stringify(f.value)})`);
        await o.page.keyboard.press("Tab");
        const want2 = sub(t0, `[!scale|clarity] ${T}`, `[!scale|clarity] ${T} **today more**`);
        r = await settled(n, t0);
        c.ok(r.ok && r.text === want2 && await W(n) === 3, `A: leaving writes the typed words with their markers, one write${diffs(want2, r.text)}`);
        await undo(); const u2 = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(u2.ok, "A: and one Undo takes it all back");
        await closeBox();
      });
      await scene("B. a description (a question's help): Italic and Link by key, no bullets", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!scale|clarity]");
        await sel(DESC_F, 13, 5);
        let f = await fld();
        c.ok(f.value.slice(f.start, f.end) === "whole" && f.bar === "bold:false,italic:false,link:false,bullets:true", `B: "whole" selected in the description; Bullets is quiet in a question's help (${f.bar})`);
        await o.page.keyboard.press("Control+i"); await sleep(200);
        f = await fld();
        c.ok(f.value === "Think of the *whole* week." && f.start === 14 && f.end === 19, `B: Ctrl+I wraps it in single asterisks (${JSON.stringify(f.value)})`);
        await o.page.keyboard.press("Control+Shift+8"); await sleep(200);
        const f2 = await fld();
        c.ok(f2.value === f.value && f2.start === f.start, "B: Ctrl+Shift+8 does nothing in a question's help (no bullets there)");
        await o.page.locator(BAR("bullets")).click({ force: true }); await sleep(200);
        c.ok((await fld()).value === f.value, "B: and a press on the quiet Bullets button does nothing either");
        await o.page.keyboard.press("Tab");
        const want = sub(t0, "> Think of the whole week.", "> Think of the *whole* week.");
        let r = await settled(n, t0);
        c.ok(r.ok && r.text === want && await W(n) === 1, `B: leaving writes the description with the markers, one write${diffs(want, r.text)}`);
        await undo(); const u = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(u.ok, "B: Undo gives the note back byte for byte");
        // a link: the address is what is selected after, and typing it finishes the link
        await sel(DESC_F, 13, 5);
        await o.page.keyboard.press("Control+k"); await sleep(200);
        f = await fld();
        c.ok(f.value === "Think of the [whole](https://) week." && f.value.slice(f.start, f.end) === "https://", `B: Ctrl+K makes a link of the words with its address selected (${JSON.stringify(f.value)}, selection ${JSON.stringify(f.value.slice(f.start, f.end))})`);
        await o.page.keyboard.type("example.org/tides"); await sleep(150);
        f = await fld();
        c.ok(f.value === "Think of the [whole](example.org/tides) week.", `B: typing replaces the address (${JSON.stringify(f.value)}); the person's own address is what is written`);
        await o.page.keyboard.press("Tab");
        r = await settled(n, t0);
        const want2 = sub(t0, "> Think of the whole week.", "> Think of the [whole](example.org/tides) week.");
        c.ok(r.ok && r.text === want2 && await W(n) === 3, `B: leaving writes the link, one write${diffs(want2, r.text)}`);
        await undo(); const u2 = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(u2.ok, "B: Undo gives the note back byte for byte");
        await closeBox();
      });
      await scene("C. a tip's prose over two lines: Bold per line, Bullets by button and by key", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!tip]", "callout");
        const P = "Words of the tip, and a second line.\nA third line of words.";
        c.ok(await o.page.locator(DESC_F).inputValue() === P, "C: the tip's words are the prose field");
        await o.page.locator(DESC_F).click(); await o.page.keyboard.press("Control+Home"); await o.page.keyboard.press("Shift+ArrowDown"); await o.page.keyboard.press("Shift+End");
        let f = await fld();
        c.ok(f.value.slice(f.start, f.end) === P && f.bar === "bold:false,italic:false,link:false,bullets:false", `C: both lines are selected; all four buttons are on in prose (${f.bar})`);
        await press("bold");
        f = await fld();
        c.ok(f.value === "**Words of the tip, and a second line.**\n**A third line of words.**", `C: Bold marks each line on its own, never across the break (${JSON.stringify(f.value)})`);
        await press("bullets");
        f = await fld();
        c.ok(f.value === "- **Words of the tip, and a second line.**\n- **A third line of words.**", `C: Bullets puts "- " at the start of each selected line (${JSON.stringify(f.value)})`);
        await shotOk(o, "rich-tip-bullets");
        await o.page.keyboard.press("Control+Shift+8"); await sleep(200);
        f = await fld();
        c.ok(f.value === "**Words of the tip, and a second line.**\n**A third line of words.**", `C: Ctrl+Shift+8 takes the bullets off again (${JSON.stringify(f.value)})`);
        await press("bold");
        f = await fld();
        c.ok(f.value === P, "C: Bold again takes the markers off: the text is as it was");
        await o.page.keyboard.press("Tab"); await sleep(600); await idle(o);
        c.ok(text(n.file) === t0 && await W(n) === 0, "C: leaving the field after format and unformat writes nothing: the note is the same bytes");
        await o.page.locator(DESC_F).click(); await o.page.keyboard.press("Control+Home"); await o.page.keyboard.press("Shift+ArrowDown"); await o.page.keyboard.press("Shift+End");
        await o.page.keyboard.press("Control+b"); await o.page.keyboard.press("Control+Shift+8"); await sleep(200);
        await o.page.keyboard.press("Tab");
        const want = sub(t0, "> Words of the tip, and a second line.\n> A third line of words.\n", "> - **Words of the tip, and a second line.**\n> - **A third line of words.**\n");
        const r = await settled(n, t0);
        c.ok(r.ok && r.text === want && await W(n) === 1, `C: with the keys the note gets the bold bullets, one write, only markers and "- " added${diffs(want, r.text)}`);
        await undo(); const u = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(u.ok, "C: one Undo gives the note back byte for byte");
        await closeBox();
      });
      await scene("D. a plain prose block, a word chosen with a real double click", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "Plain words of the activity", "prose");
        c.ok(/is-desc/.test((await fld()).cls || ""), "D: the prose block opens with its words field focused");
        const box = await o.page.locator(DESC_F).boundingBox();
        await o.page.mouse.dblclick(box.x + 12, box.y + 10);
        await sleep(150);
        let f = await fld();
        c.ok(f.value.slice(f.start, f.end).trim() === "Plain", `D: a real double click on the first word selects it (${JSON.stringify(f.value.slice(f.start, f.end))})`);
        await o.page.keyboard.press("Control+b"); await sleep(150);
        f = await fld();
        c.ok(f.value.startsWith("**Plain** words of the activity"), `D: Ctrl+B marks it (${JSON.stringify(f.value.slice(0, 20))})`);
        await o.page.keyboard.press("Tab");
        const want = sub(t0, "\nPlain words of the activity", "\n**Plain** words of the activity");
        const r = await settled(n, t0);
        c.ok(r.ok && r.text === want && await W(n) === 1, `D: leaving writes the prose with the markers, one write${diffs(want, r.text)}`);
        await undo(); const u = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(u.ok, "D: Undo gives the note back");
        await closeBox();
      });
      await scene("E. no formatting in the id field, an anchor's row or the Markdown text area", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!scale|clarity]");
        const leaf0 = await o.evaluate(() => app.workspace.getLeavesOfType("booklet-design").length);
        const chords = ["Control+b", "Control+i", "Control+k", "Control+Shift+8"];
        const quiet = async (label, locator) => {
          await o.page.locator(locator).click(); await o.page.keyboard.press("Control+a");
          const before = await fld();
          for (const key of chords) { await o.page.keyboard.press(key); await sleep(150); }
          const after = await fld();
          const modal = (await state(o)).modal;
          c.ok(after.value === before.value && after.start === before.start && after.end === before.end && !modal && after.bar === "bold:true,italic:true,link:true,bullets:true", `${label}: four chords change nothing in the field (${JSON.stringify(after.value)}), open no dialog, and the bar is quiet (${after.bar})`);
        };
        await quiet("E: the id", `${STRIP("id")} input`);
        await quiet("E: an anchor's words", RW("a0-text"));
        await openMd(o);
        await quiet("E: the Markdown text area", MD_AREA);
        c.ok(text(n.file) === t0 && await W(n) === 0 && (await o.evaluate(() => app.workspace.getLeavesOfType("booklet-design").length)) === leaf0 && (await o.evaluate(() => app.workspace.activeLeaf.view.getViewType())) === "booklet-design", "E: nothing was written, no pane opened or changed");
        await closeBox();
      });
      await scene("F. refusals: a line that would become a rule, a link over several lines", async () => {
        const n = await start(); const t0 = n.t;
        await open(n, "[!tip]", "callout");
        await o.page.locator(DESC_F).click(); await o.page.keyboard.press("Control+End"); await o.page.keyboard.press("Enter");
        const v0 = (await fld()).value;
        await o.page.keyboard.press("Control+b"); await sleep(250);
        let st = await state(o);
        c.ok((await fld()).value === v0 && st.status === say("rich.no.rule"), `F: Bold on an empty line would leave a rule: refused, the field is as it was and the status strip says ${JSON.stringify(st.status)}`);
        await o.evaluate(() => { app.workspace.getLeavesOfType("booklet-design")[0].view.say(""); });
        await o.page.keyboard.press("Control+a"); await o.page.keyboard.press("Control+k"); await sleep(250);
        st = await state(o);
        c.ok((await fld()).value === v0 && st.status === say("rich.no.linkLines"), `F: a link over several lines is refused with the reason ${JSON.stringify(st.status)}, the field as it was`);
        await o.page.keyboard.press("Tab"); await sleep(600); await idle(o);
        c.ok(text(n.file) === t0 && await W(n) === 0, "F: after two refusals nothing is written: the note is the same bytes");
        await closeBox();
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 84 ================= */
  /** What a person sees of the frame and of the open box: the header, the trail, the status strip, the scroll area, where the page is, the box and its bar and fields. */
  const frame3 = o => o.evaluate(sel => {
    const q = s => document.querySelector(sel + " " + s);
    const r1 = v => Math.round(v * 10) / 10;
    const rr = e => { const b = e && e.getBoundingClientRect(); return b ? [r1(b.x), r1(b.y), r1(b.width), r1(b.height)] : null; };
    const sc = q(".booklet-design-scroll"), pg = q(".booklet-design-page"), box = q(".booklet-design-editbox");
    const pr = pg && pg.getBoundingClientRect(), sr = sc && sc.getBoundingClientRect(), br = rr(box);
    return {
      top: rr(q(".booklet-design-top")), crumb: rr(q(".booklet-design-crumb")), status: rr(q(".booklet-design-status")), scroll: rr(sc),
      pageAbs: pr && sr ? r1(pr.top - sr.top + sc.scrollTop) : null, scrollTop: sc ? sc.scrollTop : null,
      trail: [...document.querySelectorAll(sel + " .booklet-design-crumb button")].map(b => b.textContent),
      boxXYW: br && br.slice(0, 3), boxH: br && br[3], bar: rr(q(".booklet-design-editbox .booklet-design-richbar")), richTitle: rr(q(".booklet-design-editbox .booklet-design-field.is-title")),
      paneW: (document.querySelector(sel + " .view-content") || {}).clientWidth, phone: !!document.querySelector(sel + " .view-content.is-phone"),
    };
  }, DV);
  async function check84() {
    const c = new Check(84, "nothing moves under a press on the new controls and the formatting bar, at a wide pane, a pane of about 740 px and the phone layout (390 px), with long titles that wrap the header's trail: a real press (or a real key) on Add an anchor, an anchor's move button, a number typed and entered, the Big box switch, the each: picker, a listen's address, a widget's data block picker, the Bold button, and Ctrl+B in a title leaves the header, the trail, the status strip, the scroll area, the page's place and the box's left, top and width where they were (and the box's height too, when the press adds no row and no text: a field growing with its own typed text may re-wrap its own field only), the bar where it was, and a write's message moves nothing");
    const table = tableOf();
    await withApp("c84", async (o, vault) => {
      const k = kit3(o, c, vault, table);
      const { start, open, W, SI, STRIP, typeLeave, closeBox, scene } = k;
      const errs0 = consoleReport.length;
      const MT = RW("media-target"), PICK = `${DV} [data-key='widget-block']`;
      const keyOn = async (sel, ...keys) => { await o.page.focus(sel); for (const key of keys) { await o.page.keyboard.press(key); await sleep(150); } };
      const selWord = async (field, from, len) => { await o.page.locator(field).click(); await o.page.keyboard.press("Control+Home"); for (let i = 0; i < from; i++) await o.page.keyboard.press("ArrowRight"); for (let i = 0; i < len; i++) await o.page.keyboard.press("Shift+ArrowRight"); };
      // the control goes to the middle of the scroll area, clear of Obsidian's own phone bar that lies over the foot of the pane (a click on a control under it would make the browser scroll the whole pane to reach it, which is the harness's doing and not the page's)
      const to = async sel => { await o.page.evaluate(([cv, s]) => { const e = document.querySelector(s); const sc = document.querySelector(cv + " .booklet-design-scroll"); if (e && sc) { const r = e.getBoundingClientRect(), q = sc.getBoundingClientRect(); sc.scrollTop += r.top - (q.top + q.height / 2 - r.height / 2); } }, [DV, sel]); await sleep(250); };
      /** Real typing, then Enter: a one-line field applies on Enter and keeps the focus (Tab would move the focus on, and the browser may scroll to the next control). */
      const typeEnter = async (sel, v) => { await o.page.locator(sel).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type(v); await o.page.keyboard.press("Enter"); };
      // grows: the press adds a row or changes the text of a field, so the box's own height may change
      const SPECS = [
        { tag: "scale: Add an anchor", needle: "[!scale|clarity]", prep: () => to(RW("a-add")), act: () => o.page.locator(RW("a-add")).click(), grows: true },
        { tag: "scale: an anchor moved down", needle: "[!scale|clarity]", prep: () => to(RW("a0-down")), act: () => o.page.locator(RW("a0-down")).click(), grows: false },
        { tag: "number: a value typed and entered", needle: "[!number|sleep", prep: () => to(SI("max")), act: () => typeEnter(SI("max"), "25"), grows: false },
        { tag: "text: the Big box switch", needle: "[!text|noticed]", prep: () => to(`${STRIP("long")} button[role='switch']`), act: () => o.page.locator(`${STRIP("long")} button[role='switch']`).click(), grows: false },
        { tag: "each: a source chosen", needle: "[!number|sleep", prep: () => to(SI("each")), act: () => keyOn(SI("each"), "ArrowDown"), grows: false },
        { tag: "listen: an address typed and entered", needle: "[!listen|ep1", prep: () => to(MT), act: () => typeEnter(MT, "media/e2.m4a"), grows: false },
        { tag: "widget: a data block chosen", needle: "[!widget|body", prep: () => to(PICK), act: () => keyOn(PICK, "ArrowDown"), grows: true },
        { tag: "the Bold button on a title", needle: "[!scale|clarity]", prep: () => selWord(TITLE_F, 0, 3), act: () => o.page.locator(BAR("bold")).click(), grows: true, after: true },
        { tag: "Ctrl+B in a title", needle: "[!scale|clarity]", prep: () => selWord(TITLE_F, 0, 3), act: () => o.page.keyboard.press("Control+b"), grows: true, after: true },
      ];
      const stays = ["top", "crumb", "status", "scroll", "trail", "scrollTop", "pageAbs", "boxXYW", "bar"];
      const pick = (f, keys) => JSON.stringify(Object.fromEntries(keys.map(x => [x, f[x]])));
      /** Every spec at the width Obsidian is at now, on one note with long titles. */
      const scenes = async (label, wide) => {
        const n = await start({ long: true }, wide);
        const f0 = await frame3(o);
        c.info(`${label}: the pane is ${f0.paneW} px wide (${f0.phone ? "phone layout" : "desktop layout"}), the header ${f0.top && f0.top[2]} x ${f0.top && f0.top[3]} px, the trail ${f0.trail.length} crumbs`);
        for (const sp of SPECS) {
          try {
            await open(n, sp.needle);
            await sp.prep();
            await sleep(150);
            const b0 = await frame3(o), w0 = await W(n);
            await shotOk(o, `still3-${label.replace(/\W+/g, "")}-${sp.tag.replace(/\W+/g, "-")}-0before`);
            await sp.act();
            await sleep(500); await idle(o);
            const b1 = await frame3(o);
            await shotOk(o, `still3-${label.replace(/\W+/g, "")}-${sp.tag.replace(/\W+/g, "-")}-1after`);
            const keys = sp.grows ? stays : [...stays, "boxH"];
            const ok = JSON.stringify(Object.fromEntries(keys.map(x => [x, b0[x]]))) === JSON.stringify(Object.fromEntries(keys.map(x => [x, b1[x]])));
            c.ok(ok, `${label}, ${sp.tag}: a real press changes nothing of the header (${JSON.stringify(b0.top)}), the trail (${b0.trail.length} crumbs), the status strip, the scroll area, the page's place, the box's left, top and width${sp.grows ? "" : " and height"} and the bar${ok ? "" : "; DIFFERENT: before " + pick(b0, keys) + " after " + pick(b1, keys)}`);
            if (sp.after) {
              await o.page.keyboard.press("Tab"); await sleep(700); await idle(o);
              const b2 = await frame3(o);
              const ok2 = JSON.stringify(Object.fromEntries(stays.map(x => [x, b0[x]]))) === JSON.stringify(Object.fromEntries(stays.map(x => [x, b2[x]])));
              c.ok(ok2 && await W(n) > w0, `${label}, ${sp.tag}: and leaving the field, which writes (${await W(n) - w0} write(s)) and says so in the status strip, moves nothing either${ok2 ? "" : "; DIFFERENT: before " + pick(b0, stays) + " after " + pick(b2, stays)}`);
            }
          } catch (e) { c.ok(false, `script error in ${label}, ${sp.tag}: ${String(e && e.message || e).slice(0, 300)}`); }
          await closeBox().catch(() => {});
        }
      };
      await scene("wide", () => scenes("wide", true));
      await scene("740 px", async () => {
        const f = await frame3(o), vp = await o.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
        await o.page.setViewportSize({ width: 740 + (vp.w - f.paneW), height: vp.h }); await sleep(600);
        await scenes("740 px", false);
      });
      await scene("phone", async () => {
        await o.page.setViewportSize({ width: 390, height: 844 });
        await mobile(o, true);
        await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
        await scenes("phone", false);
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 85 ================= */
  const PIECES3 = [
    ["scale", "[!scale|clarity]", "question"], ["number", "[!number|sleep", "question"], ["text", "[!text|noticed]", "question"], ["date", "[!date|when]", "question"],
    ["lines", "[!lines|wins", "question"], ["each", "[!multi|where", "question"], ["listen with an embed", "[!listen|ep1", "question"], ["listen with none", "[!listen|ep2", "question"],
    ["listen with a link", "[!listen|ep3", "question"], ["widget", "[!widget|body", "question"], ["tip", "[!tip]", "callout"], ["prose", "Plain words of the activity", "prose"],
  ];
  async function check85() {
    const c = new Check(85, "the new controls on a phone and in the three looks: at 390 px every control of the stage-3 pieces (the anchor rows, the number, text, date, lines settings, the each: picker, a listen's address and name, the widget picker and its Open button, the formatting bar's four buttons) is at least 44 px each way, nothing is wider than the screen or cut off, light and dark, screenshots; in Paper and petrol light, Paper and petrol dark and Obsidian's look, in both Obsidian modes, every piece's open box has every text at 4.5 to 1 and every control's edge or fill at 3 to 1 against what is behind it (the Obsidian look is measured and its figures reported, since its colours are the theme's)");
    const table = tableOf();
    await withApp("c85", async (o, vault) => {
      const k = kit3(o, c, vault, table);
      const { start, open, closeBox, scene } = k;
      const errs0 = consoleReport.length;
      const pickLook = async look => { await o.page.selectOption(SEL74, look); await o.page.waitForFunction(([cv, l]) => document.querySelector(cv).getAttribute("data-booklet-look") === l, [CV, look], { timeout: 4000, polling: 30 }); await sleep(250); };
      await scene("looks", async () => {
        const n = await start();
        const obs = {};
        for (const scheme of ["light", "dark"]) {
          await o.setScheme(scheme); await sleep(500);
          for (const [look] of LOOKS74) {
            await pickLook(look);
            await goNav(o, "activity", lineOf(n.t, "[!activity|a]"));
            const tag = `${look}-${scheme}`;
            let nText = 0, nCtl = 0; const lowText = [], lowCtl = [];
            for (const [name, needle, kind] of PIECES3) {
              await open(n, needle, kind); await sleep(200);
              const ed = await edit74(o);
              if (!ed) { c.ok(false, `${tag}: the ${name}'s box could not be measured`); continue; }
              nText += ed.texts.length; nCtl += ed.controls.length;
              for (const t of ed.texts) if (!t.disabled && t.ratio < t.need) lowText.push(`${name}: ${t.n} ${t.ratio}<${t.need}`);
              for (const x of ed.controls) if (x.best < 3) lowCtl.push(`${name}: ${x.n} ${x.best}`);
              if (name === "scale" || name === "each" || name === "listen with an embed" || name === "tip") await shotEl(o, `stage3-looks-${tag}-${name.replace(/\W+/g, "-")}`, `${DV} .booklet-design-editbox`, "start");
              await closeBox();
            }
            if (look !== "obsidian") {
              c.ok(nText > 80 && lowText.length === 0, `${tag}: the ${PIECES3.length} pieces' open boxes: all ${nText} texts reach 4.5 to 1${lowText.length ? "; below: " + JSON.stringify(lowText.slice(0, 10)) : ""}`);
              c.ok(nCtl > 60 && lowCtl.length === 0, `${tag}: and each of the ${nCtl} controls has an edge or fill of 3 to 1 on what is behind it${lowCtl.length ? "; below: " + JSON.stringify(lowCtl.slice(0, 10)) : ""}`);
            } else obs[tag] = { nText, nCtl, lowText, lowCtl };
          }
        }
        for (const [tag, v] of Object.entries(obs)) c.info(`${tag} (Obsidian's own colours, the theme's): ${v.nText} texts, ${v.lowText.length} below 4.5 ${JSON.stringify(v.lowText.slice(0, 6))}; ${v.nCtl} controls, ${v.lowCtl.length} below 3 ${JSON.stringify(v.lowCtl.slice(0, 6))}`);
        // Obsidian's look draws the plugin's controls in the theme's own colours (the accent pair of an on switch, the theme's button edge, which is a shadow and not a border),
        // so the paper looks' 4.5 and 3 are not asked of it, as in check 74: what is asked is that no text is below 3 to 1; the rest is reported
        const dim = Object.entries(obs).filter(([, v]) => v.lowText.some(x => Number(/ ([\d.]+)</.exec(x)[1]) < 3));
        c.ok(dim.length === 0, `Obsidian's look: no text of any new box is below 3 to 1 in either mode${dim.length ? "; below: " + JSON.stringify(dim.map(([t, v]) => [t, v.lowText.slice(0, 5)])) : ""}`);
        await o.setScheme("light"); await sleep(300);
      });
      await scene("phone", async () => {
        await o.page.setViewportSize({ width: 390, height: 844 });
        await mobile(o, true);
        await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
        const n = await start({}, false);
        for (const [name, needle, kind] of PIECES3) {
          await open(n, needle, kind); await sleep(200);
          const pf = await phoneFacts(o), ours = pf.small.filter(x => x.own), fit = await fitOf(o);
          c.ok(pf.bodyMobile && pf.docScroll <= pf.W + 1 && pf.vcScroll <= pf.vcClient + 1 && pf.wideCount === 0, `phone ${name}: nothing is wider than the screen (page ${pf.docScroll} of ${pf.W} px)${pf.wideCount ? ": " + JSON.stringify(pf.wide) : ""}`);
          c.ok(ours.length === 0, `phone ${name}: every control of the plugin's is at least 44 px each way (${pf.controls} looked at)${ours.length ? "; smaller: " + JSON.stringify(ours.slice(0, 8)) : ""}`);
          c.ok(fit.clippedCount === 0 && fit.offCount === 0, `phone ${name}: nothing is cut off or off the screen${fit.clippedCount || fit.offCount ? ": " + JSON.stringify({ clipped: fit.clipped, off: fit.off }) : ""}`);
          if (["scale", "each", "listen with an embed", "widget", "tip", "number"].includes(name)) { await shotEl(o, `stage3-phone-${name.replace(/\W+/g, "-")}-light`, `${DV} .booklet-design-editbox`, "start"); }
          if (name === "scale" || name === "tip") { await o.setScheme("dark"); await sleep(400); await shotEl(o, `stage3-phone-${name}-dark`, `${DV} .booklet-design-editbox`, "start"); await o.setScheme("light"); await sleep(300); }
          if (name === "tip" || name === "scale") {
            const sizes = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-richbar .booklet-design-rich-button")].map(b => { const r = b.getBoundingClientRect(); return [b.getAttribute("data-rich"), Math.round(r.width), Math.round(r.height)]; }), DV);
            c.ok(sizes.length === 4 && sizes.every(s => s[1] >= 44 && s[2] >= 44), `phone ${name}: the bar's four buttons are at least 44 x 44 px (${JSON.stringify(sizes)})`);
          }
          if (name === "each" || name === "widget") {
            const sels = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-editbox select")].map(b => { const r = b.getBoundingClientRect(); return [b.getAttribute("data-key"), Math.round(r.width), Math.round(r.height)]; }), DV);
            c.ok(sels.length >= 1 && sels.every(s => s[2] >= 44), `phone ${name}: the picker is at least 44 px high (${JSON.stringify(sels)})`);
          }
          await closeBox();
        }
        c.ok(text(n.file) === n.t, "phone: nothing was written while the boxes were opened and shut");
      });
      // Obsidian's own half-written config message after a colour-scheme switch (see check 95) is set aside and counted; any other error still fails.
      const own = x => /^failed to read JSON \.obsidian\/(appearance|app)\.json SyntaxError/.test(x.text);
      const all = errorsSince(errs0), errs = all.filter(x => !own(x));
      if (all.length !== errs.length) c.info(`Obsidian's own half-written config message set aside: ${all.length - errs.length}`);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }
  /* END STAGE3 */
  /* BEGIN STAGE4 */

  /* ================= CHECKS 86 TO 95: STAGE 4 (the fold switch, the pickers, hint and solution, notice, picture, figure, citation) ================= */
  // Every note is made up (design-notes4.js), one small booklet for each control family, written into the check's own copy of the vault, one note per scene.
  // Real mouse and real keys only for what is under test: a text is typed with the keyboard and left with Tab, a drop-down is changed with the keys of the
  // closed control (a person's own: the native list cannot be clicked from here), a switch or a button is pressed with the mouse. A write is counted with a
  // vault "modify" listener of the page's own, and the whole note is compared byte for byte. After every change the reference linter
  // (`lint-booklet.py`, the Booklet repository's) is run on the note on disk and must report nothing it did not report on the fixture before the change,
  // except what a check says in words to be expected (a hint written open, a picture with a remote address).
  //   86 the Starts folded switch            87 a tab, a parent page, the kept entries    88 a copy button's list
  //   89 hint and solution under a question  90 a module's notice                         91 a picture
  //   92 a figure                            93 a citation                                 94 focus and Undo (a drop-down, a text field)
  //   95 a phone: 44 px and no sideways scroll
  const N4 = require("./design-notes4");
  const LINT = env.LINT;
  /** The linter's errors and warnings on a note on disk, each with its path and line number taken off (a line moves when a block grows; the words do not). */
  const lintOf = file => {
    const r = cp.spawnSync("python3", ["-I", LINT, file], { encoding: "utf8", timeout: 60000 });
    const out = (r.stdout || "") + (r.stderr || "");
    if (r.error || !/booklet file checked/.test(out)) throw new Error("the reference linter did not run (" + LINT + "): " + (r.error ? r.error.message : out.slice(0, 200)));
    return out.split("\n").filter(l => /^(ERROR|warn)\s/.test(l)).map(l => l.replace(/^(ERROR|warn)\s+.*?\.booklet\.md: (?:line \d+: )?/, "$1 ").trim());
  };
  /** What a note has that the baseline had not, and what the baseline had that it has not (a multiset, so two of the same are two). */
  const lintDiff = (base, now) => {
    const rest = [...base], added = [];
    for (const m of now) { const i = rest.indexOf(m); if (i >= 0) rest.splice(i, 1); else added.push(m); }
    return { added, gone: rest };
  };
  /** The shared helpers of checks 86 to 95 for one running app: a note made, opened on the page it names and measured by the linter; the linter run on a result. */
  const kit4 = (o, c, vault, table) => {
    const k = kit3(o, c, vault, table);
    let seq = 0;
    // one transparent pixel stands for each picture file a note names (a picture that is in the vault, as a person's would be)
    const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const mk = (which, opts) => {
      const name = "s" + (++seq), rel = `Stage4 ${which} ${name}.booklet.md`, t = N4[which](name, opts), file = put(vault, rel, t);
      if (which === "pictures") for (const p of (opts && opts.files) || ["images/harbour.jpg", "images/boats.png"]) put(vault, p, PIXEL);
      return { rel, file, t, lint: lintOf(file) };
    };
    /** A note of the kind asked for, opened in the Design view on the page `go` names ([nav kind, a line the page starts at]). */
    const start = async (which, go, opts = {}, wide = true) => { const n = mk(which, opts); await openDesign(o, n.rel, "tab", true, wide); await goNav(o, go[0], lineOf(n.t, go[1])); await armWrites(o, n.rel); return n; };
    const open = (n, needle, kind = "question") => clickBlock(o, kind, lineOf(text(n.file), needle));
    /** The page's own box (its Edit settings button, a real press). */
    /** A group opened by a press on its own head (a press in the middle of it lands on the block inside it). */
    const openGroup = async (n, needle) => { const sel = block("group", lineOf(text(n.file), needle)); await o.page.locator(sel).scrollIntoViewIfNeeded(); await o.page.locator(sel + " > .booklet-design-group-head").click(); await o.page.waitForSelector(sel + ".is-open > .booklet-design-editbox", { timeout: 5000 }); await sleep(150); };
    const pageBox = async () => { await o.page.locator(`${DV} .booklet-design-page-head .booklet-design-page-edit`).first().click(); await o.page.waitForSelector(`${DV} .booklet-design-page .booklet-design-editbox`, { timeout: 5000 }); await sleep(200); };
    const K = key => `${DV} .booklet-design-editbox [data-key='${key}']`;
    const optionsOf = sel => o.page.locator(sel).evaluate(e => [...e.options].map(x => [x.value, x.textContent]));
    /** The closed drop-down with the keyboard focus on it: a key changes it as a person's would (the list itself cannot be clicked from the harness). */
    const keyOn = async (sel, ...keys) => { await o.page.focus(sel); for (const key of keys) { await o.page.keyboard.press(key); await sleep(150); } };
    /** The reference linter on the note on disk against the fixture's own report: nothing new, but what `expect` (regular expressions) says is expected, and each of those present. */
    const lint = (n, label, expect = []) => {
      const d = lintDiff(n.lint, lintOf(n.file));
      const odd = d.added.filter(m => !expect.some(re => re.test(m))), lacking = expect.filter(re => !d.added.some(m => re.test(m)));
      c.ok(odd.length === 0 && lacking.length === 0, `${label}: the reference linter reports ${expect.length ? "just the expected " + d.added.length + " new (" + JSON.stringify(d.added.map(m => m.slice(0, 90))) + ")" : "nothing new"} (${n.lint.length} of the fixture's own)${odd.length ? "; UNEXPECTED NEW: " + JSON.stringify(odd) : ""}${lacking.length ? "; EXPECTED BUT ABSENT: " + JSON.stringify(lacking.map(String)) : ""}${d.gone.length ? "; no longer reported: " + JSON.stringify(d.gone.map(m => m.slice(0, 80))) : ""}`);
    };
    /**
     * A run of changes on one note: each `step` makes one change with the action it is given (real input), waits for the one write, compares the whole note with
     * the expected one byte for byte and runs the linter; `unwind` takes them back with the app's own Undo, one press for each, and compares each state.
     */
    const run = n => {
      const states = [n.t];
      const api = {
        states,
        async step(label, act, want, expect = []) {
          const from = states[states.length - 1], w0 = await k.W(n);
          await act();
          const r = await k.settled(n, from);
          c.ok(r.ok && r.text === want && await k.W(n) === w0 + 1, `${label}: one write, and the whole note is the expected one byte for byte${k.diffs(want, r.text)}`);
          lint(n, label, expect);
          states.push(want);
          return r.text;
        },
        async unwind(label, keptAsk = false) {
          const w0 = await k.W(n), n0 = states.length - 1;
          for (let i = states.length - 1; i >= 1; i--) {
            await k.undo(keptAsk);
            const r = await waitDisk(n.file, tx => tx === states[i - 1]); await idle(o);
            if (!r.ok) c.ok(false, `${label}: Undo ${states.length - i} did not give the state before change ${i} byte for byte${k.diffs(states[i - 1], text(n.file))}`);
          }
          c.ok(text(n.file) === states[0] && await k.W(n) === w0 + n0, `${label}: ${n0} changes, ${n0} presses of Undo (one step each), ${await k.W(n)} writes in all, and the note is the original byte for byte${k.diffs(states[0], text(n.file))}`);
          lint(n, `${label}, after the Undo`);
        },
      };
      return api;
    };
    return { ...k, mk, start, open, openGroup, pageBox, K, optionsOf, keyOn, lint, run };
  };

  /* ================= CHECK 86 ================= */
  async function check86() {
    const c = new Check(86, "the Starts folded switch in the real app, on a callout (a folded tip, a plain note, one written with a +, a folded group) and on a hint and a solution under a question (a hint nested in a group, a solution straight under the question with no blank line): a real press writes the one character of the mark and nothing else, one write and one step of Undo, the switch reads the note after the press and after the Undo, a mark written + says so in words and is turned to - by the switch, the whole note compared byte for byte, and the reference linter reports nothing new except the one warning it gives for a hint or a solution written open (expected), and nothing after the switch is turned back or Undone");
    const table = tableOf();
    await withApp("c86", async (o, vault) => {
      const k = kit4(o, c, vault, table);
      const { start, open, openGroup, W, K, STRIP, press, settled, diffs, undo, run, scene, closeBox, say, lint } = k;
      const errs0 = consoleReport.length;
      const SW = `${STRIP("fold")} button[role='switch']`;
      const on = async sel => (await o.page.locator(sel).getAttribute("aria-checked")) === "true";
      const label = async () => (await o.page.locator(SW).textContent()).trim();
      const plusShown = () => o.evaluate(sel => { const e = document.querySelector(sel); return !!e && !e.hidden && e.getBoundingClientRect().width > 0; }, `${STRIP("fold")} .booklet-design-strip-label`);
      await scene("A. a callout: folded, plain, written with a +; each press one write, one Undo", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await open(n, "[!tip]- A folded tip", "callout");
        c.ok(await label() === say("fold.switch") && await on(SW), `A: a folded tip has a switch named ${JSON.stringify(say("fold.switch"))} and it is on`);
        await r.step("A: the folded tip's switch pressed (turned off)", () => press(SW), sub(t0, "> [!tip]- A folded tip", "> [!tip] A folded tip"));
        c.ok(!(await on(SW)), "A: and the switch now reads off");
        await r.step("A: and pressed again (on)", () => press(SW), t0);
        c.ok(await on(SW), "A: and on");
        await k.closeBox();
        await open(n, "[!note] A plain note", "callout");
        c.ok(!(await on(SW)) && !(await plusShown()), "A: a plain note's switch is off, with no note about a +");
        const t2 = text(n.file);
        await r.step("A: the plain note's switch pressed: a - is written after the bracket", () => press(SW), sub(t2, "> [!note] A plain note", "> [!note]- A plain note"));
        await k.closeBox();
        await open(n, "[!note]+ An open note", "callout");
        c.ok(!(await on(SW)) && await plusShown(), `A: a note written with a + reads off and says so in words (${JSON.stringify(say("fold.plus").slice(0, 60))}...)`);
        const t3 = text(n.file);
        await r.step("A: the + note's switch pressed: the + becomes a -", () => press(SW), sub(t3, "> [!note]+ An open note", "> [!note]- An open note"));
        c.ok(await on(SW) && !(await plusShown()), "A: and the note about the + is gone, the switch on");
        await k.closeBox();
        await r.unwind("A");
        await closeBox();
      });
      await scene("B. a group folds too", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await openGroup(n, "[!group] Step one");
        c.ok(await o.page.locator(SW).count() === 1 && !(await on(SW)), "B: an open group has the switch, off");
        await r.step("B: the group's switch pressed", () => press(SW), sub(t0, "> [!group] Step one", "> [!group]- Step one"));
        await k.closeBox();
        await openGroup(n, "[!group]- A folded group");
        c.ok(await on(SW), "B: a folded group's switch is on");
        const t1 = text(n.file);
        await r.step("B: and pressed (off)", () => press(SW), sub(t1, "> [!group]- A folded group", "> [!group] A folded group"));
        await k.closeBox();
        await r.unwind("B");
        await closeBox();
      });
      await scene("C. a hint and a solution under a question", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        const HF = K("hint-fold"), SF = K("solution-fold");
        await open(n, "[!text|why long] Why again?");
        c.ok(await o.page.locator(HF).getAttribute("aria-label") === "Hint: starts folded" && await on(HF) && await on(SF), "C: the question's box has a switch for its hint and one for its solution, both on");
        await r.step("C: the hint's switch pressed (written open: the linter says so)", () => press(HF), sub(t0, "> [!hint]- Hint\n> Look at the moon.", "> [!hint] Hint\n> Look at the moon."), [/a hint that is not folded is drawn open/]);
        c.ok(!(await on(HF)) && await on(SF), "C: the hint's switch reads off and the solution's is untouched");
        await r.step("C: and pressed again (folded again: nothing for the linter)", () => press(HF), t0);
        await r.step("C: the solution's switch pressed", () => press(SF), sub(t0, "> [!solution]- Model answer\n> Because.\n> Really.", "> [!solution] Model answer\n> Because.\n> Really."), [/a solution that is not folded is drawn open/]);
        await r.step("C: and again", () => press(SF), t0);
        await r.step("C: the hint's switch once more, for one Undo to take back at once", () => press(HF), sub(t0, "> [!hint]- Hint\n> Look at the moon.", "> [!hint] Hint\n> Look at the moon."), [/a hint that is not folded is drawn open/]);
        await undo(); const u1 = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(u1.ok, "C: ONE Undo gives back the exact bytes of the note before that press");
        lint(n, "C: after that Undo");
        c.ok(await o.evaluate(sel => { const e = document.querySelector(sel); return !!e && e.getAttribute("aria-checked") === "true"; }, HF), "C: and the hint's switch shows the restored value (on)");
        r.states.pop();
        await r.unwind("C");
        await closeBox();
      });
      await scene("D. a solution straight under the question's words (no blank line) and a hint nested in a group", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        const HF = K("hint-fold"), SF = K("solution-fold");
        await open(n, "[!text|q long] Why?");
        c.ok(await on(SF) && await o.page.locator(HF).count() === 0, "D: the question whose solution has no blank line above it shows the solution's switch (on) and has no hint");
        await r.step("D: its solution's switch pressed: only the one character changes, no blank line appears", () => press(SF), sub(t0, "> [!solution]- Model answer\n> Because.", "> [!solution] Model answer\n> Because."), [/a solution that is not folded is drawn open/]);
        await r.step("D: and pressed again", () => press(SF), t0);
        await k.closeBox();
        await open(n, "[!choice|c1] Pick?");
        c.ok(await on(HF), "D: the question inside the group shows its hint (written > > [!hint]-) with the switch on");
        await r.step("D: the nested hint's switch pressed: the group's own > marks stay", () => press(HF), sub(text(n.file), "> > [!hint]-\n", "> > [!hint]\n"), [/a hint that is not folded is drawn open/]);
        await r.step("D: and pressed again", () => press(HF), t0);
        await k.closeBox();
        await r.unwind("D");
        await closeBox();
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 87 ================= */
  async function check87() {
    const c = new Check(87, "the pickers that name another part of the note, in the real app: an activity's tab (its module's tabs, \"no tab\", a tab the line names that the module lacks kept as written and said so, another change leaving it), a page's parent (the other pages of its tab, never itself or its own sub-pages, a parent that is not a page kept and said, a loop already in the note said in words), the kept entries' switch of a repeat activity; each change one write and one Undo step, the whole note byte for byte, the reference linter run on each result; a loop forced into the drop-down is refused in words and nothing is written");
    const table = tableOf();
    await withApp("c87", async (o, vault) => {
      const k = kit4(o, c, vault, table);
      const { start, pageBox, W, K, SI, STRIP, press, typeLeave, settled, diffs, undo, run, scene, closeBox, say, optionsOf, keyOn, refusalOf, value, open } = k;
      const errs0 = consoleReport.length;
      const TAB = K("tab"), PAR = K("parent");
      await scene("A. an activity's tab", async () => {
        const n = await start("structure", ["activity", "[!activity|alpha"]); const r = run(n), t0 = n.t;
        await pageBox();
        const o1 = await optionsOf(TAB);
        c.ok(JSON.stringify(o1) === JSON.stringify([["", say("tab.none")], ["learn", "Learn (learn)"], ["this-month", "This month (this-month)"]]) && await value(TAB) === "learn", `A: the picker lists No tab and the module's two tabs, each with its title and id, and reads learn (${JSON.stringify(o1.map(x => x[1]))})`);
        await r.step("A: this-month chosen with the Down key: only the word after tab: changes", () => keyOn(TAB, "ArrowDown"), sub(t0, "[!activity|alpha tab:learn] Alpha", "[!activity|alpha tab:this-month] Alpha"));
        c.ok(await value(TAB) === "this-month", "A: and the picker reads this-month");
        await r.step("A: No tab chosen (Home): the setting is taken off the line", () => keyOn(TAB, "Home"), sub(t0, "[!activity|alpha tab:learn] Alpha", "[!activity|alpha] Alpha"));
        await r.unwind("A");
        c.ok(await value(TAB) === "learn", `A: after the Undos the picker shows learn again (${await value(TAB)})`);
        await closeBox();
      });
      await scene("B. a tab the module does not have: kept as written, said so, and left by every other change", async () => {
        const n = await start("structure", ["activity", "[!activity|beta"]); const r = run(n), t0 = n.t;
        await pageBox();
        const o1 = await optionsOf(TAB), last = o1[o1.length - 1];
        c.ok(await value(TAB) === "gone" && last[0] === "gone" && last[1] === say("tab.missing").replace("{id}", "gone"), `B: the line's tab:gone is listed last and said in words (${JSON.stringify(last[1])}), and the picker reads it`);
        c.ok(text(n.file) === t0 && await W(n) === 0, "B: showing it wrote nothing");
        // another change of the same line leaves it as written
        await r.step("B: the activity's id changed (typed, Tab): tab:gone stays as it was", () => typeLeave(SI("id"), "beta2"), sub(t0, "[!activity|beta tab:gone] Beta", "[!activity|beta2 tab:gone] Beta"));
        await r.step("B: a real tab chosen with the Up key (the missing one is last in the list) replaces it", () => keyOn(TAB, "ArrowUp"), sub(text(n.file), "tab:gone", "tab:this-month"));
        await r.unwind("B");
        await closeBox();
      });
      await scene("C. a page's parent", async () => {
        const n = await start("structure", ["page", "[!page|p1"]); const r = run(n), t0 = n.t;
        await pageBox();
        const o1 = await optionsOf(PAR);
        c.ok(JSON.stringify(o1) === JSON.stringify([["", say("parent.none")], ["p4", "Fourth (p4)"], ["p5", "Fifth (p5)"]]) && await value(PAR) === "", `C: the first page's picker lists No parent, Fourth and Fifth, not itself, not its sub-pages (Second, Third), not the other tab's page (${JSON.stringify(o1.map(x => x[1]))})`);
        await r.step("C: Fourth chosen: parent:p4 is written", () => keyOn(PAR, "ArrowDown"), sub(t0, "> [!page|p1] First", "> [!page|p1 parent:p4] First"));
        await r.step("C: No parent (Home) takes it off again: the original bytes", () => keyOn(PAR, "Home"), t0);
        // a loop forced into the drop-down: the picker never offers one, so one is put into the control's list by a script and chosen with a real key
        const w0 = await W(n);
        await o.page.locator(PAR).evaluate(e => { const x = document.createElement("option"); x.value = "p3"; x.textContent = "forced"; e.appendChild(x); });
        await keyOn(PAR, "End");
        await sleep(500); await idle(o);
        const why = await refusalOf();
        c.ok(text(n.file) === t0 && await W(n) === w0 && /^Not changed\. A page cannot sit under itself or under one of its own sub-pages: that would make a loop\./.test(why || ""), `C: a loop (First under its own sub-page Third) is refused in words (${JSON.stringify((why || "").slice(0, 120))}) and nothing is written`);
        c.ok(await value(PAR) === "", `C: and the picker goes back to what the note has (${JSON.stringify(await value(PAR))})`);
        await r.unwind("C");
        await closeBox();
      });
      await scene("D. a parent that is not a page, and a loop already in the note", async () => {
        const n = await start("structure", ["page", "[!page|p5"]); const t0 = n.t;
        await pageBox();
        const o1 = await optionsOf(PAR), last = o1[o1.length - 1];
        c.ok(await value(PAR) === "ghost" && last[0] === "ghost" && last[1] === say("parent.missing").replace("{id}", "ghost"), `D: parent:ghost is listed last, said as not a page of this tab (${JSON.stringify(last[1])}), and read`);
        await closeBox();
        const m = await start("structure", ["page", "[!page|p1"], { loop: true });
        await pageBox();
        const o2 = await optionsOf(PAR), l2 = o2[o2.length - 1];
        c.ok(await value(PAR) === "p3" && l2[0] === "p3" && l2[1] === say("parent.loop").replace("{id}", "p3"), `D: a page already in a loop (parent:p3 under its own sub-page) says ${JSON.stringify(l2[1])} and is kept`);
        c.ok(text(m.file) === m.t && text(n.file) === t0 && await W(m) === 0, "D: showing either wrote nothing");
        await closeBox();
      });
      await scene("E. the kept entries' switch of a repeat activity", async () => {
        const n = await start("structure", ["activity", "[!activity|delta"]); const r = run(n), t0 = n.t;
        await pageBox();
        const SW = `${STRIP("entries")} button[role='switch']`, NOTE = `${STRIP("entries")} .booklet-design-strip-label`;
        const on = async () => (await o.page.locator(SW).getAttribute("aria-checked")) === "true";
        c.ok(!(await on()) && !(await o.page.locator(SW).isDisabled()), "E: a repeat activity's switch is off and can be pressed");
        await r.step("E: pressed: entries:folded is written after the other words", () => press(SW), sub(t0, "> [!activity|delta repeat] Delta", "> [!activity|delta repeat entries:folded] Delta"));
        c.ok(await on(), "E: and reads on");
        await r.step("E: pressed again: the setting goes and the line is as it was", () => press(SW), t0);
        await r.unwind("E");
        await closeBox();
        const g = await start("structure", ["activity", "[!activity|gamma"]);
        await pageBox();
        const txt = (await o.page.locator(NOTE).textContent() || "").trim();
        c.ok(await o.page.locator(SW).isDisabled() && txt === say("entries.needsRepeat"), `E: an activity that does not repeat has the switch off and not pressable, and says why (${JSON.stringify(txt.slice(0, 70))}...)`);
        await closeBox();
        const e = await start("structure", ["activity", "[!activity|epsilon"]); const re = run(e), e0 = e.t;
        await pageBox();
        const t2 = (await o.page.locator(NOTE).textContent() || "").trim();
        c.ok(!(await on()) && t2 === say("entries.differs").replace("{value}", "open"), `E: entries:open (a value the format does not take) is kept as written and said (${JSON.stringify(t2.slice(0, 80))}...)`);
        await re.step("E: only turning the switch on replaces it with entries:folded", () => press(SW), sub(e0, "repeat entries:open] Epsilon", "repeat entries:folded] Epsilon"));
        await re.unwind("E, epsilon");
        await closeBox();
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 88 ================= */
  async function check88() {
    const c = new Check(88, "a copy button's list of what it copies, in the real app: a row for each word of of:, in the order written, with a drop-down of the questions of its activity (and their hint and solution); item changed, one added, one moved, one removed, each one write and one Undo step, the whole note byte for byte and the linter run on each result; a word the picker cannot offer (gone) is listed first as kept as written and survives every edit of another item; the last item cannot be taken out and says why; five changes undone with five presses back to the exact bytes");
    const table = tableOf();
    await withApp("c88", async (o, vault) => {
      const k = kit4(o, c, vault, table);
      const { start, open, W, K, press, undo, run, scene, closeBox, say, optionsOf, keyOn, value, refusalOf, settled, diffs } = k;
      const errs0 = consoleReport.length;
      const items = () => o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-editbox [data-key$='-pick']")].map(e => e.value), DV);
      await scene("A. the list: item changed, one added, moved, removed, then Undo", async () => {
        const n = await start("copy", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await open(n, "[!copy|go", "callout");
        c.ok(JSON.stringify(await items()) === JSON.stringify(["why", "gone"]), `A: the list shows the two words of of:why,gone in order (${JSON.stringify(await items())})`);
        const o0 = await optionsOf(K("c0-pick")), o1 = await optionsOf(K("c1-pick"));
        c.ok(JSON.stringify(o0.map(x => x[0])) === JSON.stringify(["why", "why/hint", "why/solution", "pick", "n"]), `A: item 1 can be any question of the activity, and the hint and the solution folded under the first (${JSON.stringify(o0.map(x => x[1]))})`);
        c.ok(o1[0][0] === "gone" && o1[0][1] === say("copy.kept").replace("{item}", "gone") && await o.page.locator(K("c1-pick")).inputValue() === "gone", `A: a word the picker cannot offer is the first thing listed, as written, and chosen (${JSON.stringify(o1[0][1])})`);
        c.ok(await o.page.locator(K("c0-up")).isDisabled() && await o.page.locator(K("c1-down")).isDisabled(), "A: the first item cannot move up and the last cannot move down");
        c.ok(text(n.file) === t0 && await W(n) === 0, "A: showing the list wrote nothing");
        await r.step("A: item 1 changed to the last question (End key): of:n,gone", () => keyOn(K("c0-pick"), "End"), sub(t0, "of:why,gone]", "of:n,gone]"));
        await r.step("A: a question added at the end (Down key on the Add drop-down: the first one offered)", () => keyOn(K("c-add"), "ArrowDown"), sub(text(n.file), "of:n,gone]", "of:n,gone,why]"));
        c.ok(JSON.stringify(await items()) === JSON.stringify(["n", "gone", "why"]), `A: the list now has three rows (${JSON.stringify(await items())})`);
        await r.step("A: item 3 moved up: the kept word is carried as written", () => press(K("c2-up")), sub(text(n.file), "of:n,gone,why]", "of:n,why,gone]"));
        await r.step("A: item 2 changed to its hint (Down key): the kept word is untouched", () => keyOn(K("c1-pick"), "ArrowDown"), sub(text(n.file), "of:n,why,gone]", "of:n,why/hint,gone]"));
        await r.step("A: item 1 removed", () => press(K("c0-remove")), sub(text(n.file), "of:n,why/hint,gone]", "of:why/hint,gone]"));
        c.ok(await o.page.locator(K("c1-pick")).inputValue() === "gone" && (await optionsOf(K("c1-pick")))[0][1] === say("copy.kept").replace("{item}", "gone"), "A: through all of that the word gone is still there, listed as kept as written");
        c.ok((await o.evaluate(sel => document.querySelector(sel + " .booklet-design-edit-md textarea, " + sel + " .booklet-design-textarea").value.split("\n")[0], DV)) === "> [!copy|go of:why/hint,gone] Copy for my tutor", "A: and the Markdown section follows the note");
        await r.unwind("A");
        c.ok(JSON.stringify(await items()) === JSON.stringify(["why", "gone"]), `A: after the Undos the list is the original (${JSON.stringify(await items())})`);
        await closeBox();
      });
      await scene("B. the last item stays; the kept word can be taken out on purpose", async () => {
        const n = await start("copy", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await open(n, "[!copy|go", "callout");
        await r.step("B: the kept item (gone) removed on purpose: only then does it go", () => press(K("c1-remove")), sub(t0, "of:why,gone]", "of:why]"));
        const w = await W(n), t1 = text(n.file);
        await press(K("c0-remove")); await sleep(400); await idle(o);
        const why = await refusalOf();
        c.ok(text(n.file) === t1 && await W(n) === w && /^Not changed\. A copy button needs something to copy, so the last item stays\./.test(why || ""), `B: the last item cannot be removed: ${JSON.stringify((why || "").slice(0, 100))}, and nothing is written`);
        c.ok(await o.page.locator(K("c0-up")).isDisabled() && await o.page.locator(K("c0-down")).isDisabled(), "B: with one item both move buttons are off");
        await r.unwind("B");
        await closeBox();
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 89 ================= */
  async function check89() {
    const c = new Check(89, "a question's Hint and Solution fields in the real app, typed with the real keyboard: add a hint (straight under a question with no blank line before its solution, so none appears and removing it gives the same bytes), type its words (two lines, one of them kept as it was), its title, the Starts folded switch (the linter says so when it is written open), remove it; the same for a solution; a hint nested in a group keeps the group's > marks; a hint holding a list stays in the Markdown with the reason and its title and switch still work; each change one write and one Undo step, the whole note byte for byte, the linter run on each result");
    const table = tableOf();
    await withApp("c89", async (o, vault) => {
      const k = kit4(o, c, vault, table);
      const { start, open, W, K, press, typeLeave, undo, run, scene, closeBox, say, refusalOf, value } = k;
      const errs0 = consoleReport.length;
      /** Real typing in a words box: a new line is Enter (it inserts a newline in a text area), then Tab leaves it. */
      const typeLines = async (sel, lines) => { await o.page.locator(sel).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.press("Backspace"); for (let i = 0; i < lines.length; i++) { if (i) await o.page.keyboard.press("Enter"); if (lines[i]) await o.page.keyboard.type(lines[i]); } await o.page.keyboard.press("Tab"); };
      const OPEN_HINT = [/a hint that is not folded is drawn open/], OPEN_SOL = [/a solution that is not folded is drawn open/];
      await scene("A. a hint added straight under a question that has no blank line before its solution", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await open(n, "[!text|q long] Why?");
        c.ok(await o.page.locator(K("hint-add")).count() === 1 && await o.page.locator(K("solution-add")).count() === 0 && await value(K("solution-words")) === "Because.", "A: the box has an Add a hint button, shows the solution's words, and has no Add a solution");
        const Q = "> [!text|q long] Why?\n> Think about it.\n> [!solution]- Model answer\n> Because.";
        await r.step("A: Add a hint pressed: a folded hint with its title and no words, laid out as the solution is (no blank line)", () => press(K("hint-add")), sub(t0, Q, "> [!text|q long] Why?\n> Think about it.\n> [!hint]- Hint\n> [!solution]- Model answer\n> Because."));
        c.ok(await o.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-key")) === "hint-words", "A: and the focus is in the hint's words, where the typing goes");
        await r.step("A: the hint's words typed with the keyboard, straight into the focused field, and left with Tab", async () => { await o.page.keyboard.type("Look at the sky."); await o.page.keyboard.press("Tab"); }, sub(text(n.file), "> [!hint]- Hint\n", "> [!hint]- Hint\n> Look at the sky.\n"));
        await r.step("A: a second line typed (Enter, then words): the first line keeps its bytes", () => typeLines(K("hint-words"), ["Look at the sky.", "It is blue."]), sub(text(n.file), "> Look at the sky.\n", "> Look at the sky.\n> It is blue.\n"));
        await r.step("A: the hint's title retyped", () => typeLeave(K("hint-title"), "A nudge"), sub(text(n.file), "> [!hint]- Hint\n", "> [!hint]- A nudge\n"));
        await r.step("A: the hint's Starts folded switch pressed (written open: the linter says so)", () => press(K("hint-fold")), sub(text(n.file), "> [!hint]- A nudge", "> [!hint] A nudge"), OPEN_HINT);
        await r.step("A: and pressed again", () => press(K("hint-fold")), sub(text(n.file), "> [!hint] A nudge", "> [!hint]- A nudge"));
        const g = await W(n);
        await r.step("A: Remove the hint: the blank-line-free layout comes back exactly", () => press(K("hint-remove")), t0);
        c.ok(await W(n) === g + 1 && await o.page.locator(K("hint-add")).count() === 1, "A: removing is one write and the Add a hint button is back");
        await r.unwind("A");
        c.ok(await o.page.locator(K("hint-words")).count() === 0 && await o.page.locator(K("hint-add")).count() === 1, "A: after the Undos the box is as it was: an Add a hint button and no hint fields");
        await closeBox();
      });
      await scene("B. a hint and a solution that are there: words, title, switch, remove", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await open(n, "[!text|why long] Why again?");
        c.ok(await value(K("hint-title")) === "Hint" && await value(K("hint-words")) === "Look at the moon." && await value(K("solution-title")) === "Model answer" && await value(K("solution-words")) === "Because.\nReally.", "B: the fields hold the note's own words (the solution's two lines as two lines)");
        await r.step("B: the hint's words typed over", () => typeLines(K("hint-words"), ["Look at the sea."]), sub(t0, "> Look at the moon.", "> Look at the sea."));
        await r.step("B: the solution's second line retyped: the first line is kept as it was", () => typeLines(K("solution-words"), ["Because.", "The moon pulls."]), sub(text(n.file), "> Because.\n> Really.", "> Because.\n> The moon pulls."));
        await r.step("B: the solution's title retyped", () => typeLeave(K("solution-title"), "Why"), sub(text(n.file), "> [!solution]- Model answer\n> Because.\n> The moon pulls.", "> [!solution]- Why\n> Because.\n> The moon pulls."));
        await r.step("B: the solution's switch pressed (written open)", () => press(K("solution-fold")), sub(text(n.file), "> [!solution]- Why\n", "> [!solution] Why\n"), OPEN_SOL);
        await r.step("B: Remove the solution: it goes with the blank line above it", () => press(K("solution-remove")), sub(text(n.file), "\n\n> [!solution] Why\n> Because.\n> The moon pulls.", ""));
        await r.step("B: Remove the hint", () => press(K("hint-remove")), sub(text(n.file), "\n\n> [!hint]- Hint\n> Look at the sea.", ""));
        c.ok(await o.page.locator(K("hint-add")).count() === 1 && await o.page.locator(K("solution-add")).count() === 1, "B: both Add buttons are back");
        await r.step("B: Add a solution", () => press(K("solution-add")), sub(text(n.file), "> Say more.", "> Say more.\n\n> [!solution]- Solution"));
        await r.unwind("B");
        c.ok(await value(K("hint-words")) === "Look at the moon." && await value(K("solution-words")) === "Because.\nReally.", "B: after the Undos the fields show the note's words again");
        await closeBox();
      });
      await scene("C. a hint nested in a group", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await open(n, "[!choice|c1] Pick?");
        c.ok(await value(K("hint-words")) === "Words that help." && await value(K("hint-title")) === "", "C: the nested hint's words are the field's, and it has no title");
        await r.step("C: its words typed: the group's own > > marks stay", () => typeLines(K("hint-words"), ["Other words."]), sub(t0, "> > Words that help.", "> > Other words."));
        await r.step("C: its title typed", () => typeLeave(K("hint-title"), "Nudge"), sub(text(n.file), "> > [!hint]-\n", "> > [!hint]- Nudge\n"));
        await r.step("C: Remove the hint", () => press(K("hint-remove")), sub(text(n.file), "\n>\n> > [!hint]- Nudge\n> > Other words.", ""));
        await r.unwind("C");
        await closeBox();
      });
      await scene("D. a hint that holds a list stays in the Markdown, with the reason; its title and switch still work", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await open(n, "[!choice|lst]");
        const why = await o.evaluate(sel => { const e = document.querySelector(sel + " .booklet-design-editbox [data-help='hint'] .booklet-design-rows-refused"); return e ? e.textContent : null; }, DV);
        c.ok(/The hint is edited in the Markdown below: it holds a list\./.test(why || "") && await o.page.locator(K("hint-words")).count() === 0 && await o.page.locator(K("hint-remove")).count() === 0, `D: no words field and no Remove, with the reason in words (${JSON.stringify((why || "").slice(0, 80))})`);
        c.ok(await o.evaluate(() => !!document.querySelector(".workspace-leaf.mod-active .booklet-design-editbox .booklet-design-edit-md[open]")), "D: the Markdown section is open, with the lines in it");
        c.ok(text(n.file) === t0 && await W(n) === 0, "D: showing it wrote nothing");
        await r.step("D: its title retyped: the list below is as it was", () => typeLeave(K("hint-title"), "Support"), sub(t0, "> [!hint]- Help\n> - first", "> [!hint]- Support\n> - first"));
        await r.step("D: its switch pressed (written open)", () => press(K("hint-fold")), sub(text(n.file), "> [!hint]- Support", "> [!hint] Support"), OPEN_HINT);
        await r.unwind("D");
        await closeBox();
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 90 ================= */
  async function check90() {
    const c = new Check(90, "a module's notice as four fields in the real app (License, Copyright, Source, Version), typed with the real keyboard and left with Tab: an absent field filled (the new line goes after the last line of the notice), one cleared (its line goes, clearing it again writes nothing), a Source with no http:// or https:// said in words and the words going as one is typed, a line that is none of the four (author:) listed as kept as written and byte for byte where it was through every change, a value that would break the line refused in words with nothing written; each change one write and one Undo step, the whole note byte for byte, the linter run on each result (the fixture's author: line is an error of its own, reported before and after alike)");
    const table = tableOf();
    await withApp("c90", async (o, vault) => {
      const k = kit4(o, c, vault, table);
      const { start, open, W, K, typeLeave, run, scene, closeBox, say, refusalOf, value, settled } = k;
      const errs0 = consoleReport.length;
      const NOTE = `${DV} .booklet-design-editbox [data-notice='not-a-link']`, KEPT_L = `${DV} .booklet-design-editbox [data-notice='kept']`;
      const shown = sel => o.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.getBoundingClientRect().width > 0; }, sel);
      await scene("A. fill, clear, an unknown line kept, a source that is no link", async () => {
        const n = await start("notice", ["module", "[!module|m]"]); const r = run(n), t0 = n.t;
        await open(n, "[!notice]", "notice");
        const names = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-editbox [data-field^='notice-'] .setting-item-name")].map(e => e.textContent.trim()), DV);
        c.ok(JSON.stringify(names) === JSON.stringify([say("notice.license"), say("notice.copyright"), say("notice.source"), say("notice.version")]), `A: the four fields are named in words (${JSON.stringify(names)})`);
        c.ok(await value(K("notice-license")) === "Free to copy and share." && await value(K("notice-copyright")) === "" && await value(K("notice-source")) === "example.org/check-in" && await value(K("notice-version")) === "", "A: they hold the note's words, and the two the notice does not say are empty");
        const kept = (await o.page.locator(KEPT_L).textContent() || "");
        c.ok(/author: Kept as written/.test(kept) && kept.includes(say("notice.kept").slice(0, 30)), `A: the line that is none of the four is listed as kept as written (${JSON.stringify(kept.replace(/\s+/g, " ").slice(0, 110))})`);
        c.ok(await shown(NOTE) && (await o.page.locator(NOTE).textContent()).trim() === say("notice.sourceNotLink"), "A: a source that does not start with http:// or https:// is told so in words (it is shown as plain words, not a link)");
        c.ok(text(n.file) === t0 && await W(n) === 0, "A: showing it wrote nothing");
        await r.step("A: an absent Copyright filled: its line goes after the last line of the notice", () => typeLeave(K("notice-copyright"), "Example Press, 2026"), sub(t0, "> source: example.org/check-in\n", "> source: example.org/check-in\n> copyright: Example Press, 2026\n"));
        await r.step("A: the License cleared: its line goes, the others and the unknown line stay", () => typeLeave(K("notice-license"), ""), sub(text(n.file), "> license: Free to copy and share.\n", ""));
        c.ok(/author: Kept as written/.test(await o.page.locator(KEPT_L).textContent()) && text(n.file).includes("> author: Kept as written\n"), "A: the unknown line is still there, and still listed");
        const w = await W(n);
        await o.page.locator(K("notice-license")).click(); await o.page.keyboard.press("Tab"); await sleep(400);
        c.ok(await W(n) === w, "A: leaving an empty License empty writes nothing");
        // typing a link: the words about the plain source go as it is typed (before it is left)
        await o.page.locator(K("notice-source")).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("https://example.org/check-in");
        c.ok(!(await shown(NOTE)), "A: the note about a source that is no link goes as the link is typed, before the field is left");
        await o.page.keyboard.press("Tab");
        const r1 = await settled(n, r.states[r.states.length - 1]);
        r.states.push(r1.text);
        c.ok(r1.ok && r1.text === sub(r.states[r.states.length - 2], "> source: example.org/check-in\n", "> source: https://example.org/check-in\n"), "A: and the link is written, only its line changed");
        k.lint(n, "A: the link written");
        await r.step("A: an absent Version filled: it goes after the last line of the notice, as Copyright did", () => typeLeave(K("notice-version"), "1.2"), sub(text(n.file), "> copyright: Example Press, 2026\n", "> copyright: Example Press, 2026\n> version: 1.2\n"));
        await r.step("A: and cleared again: the line goes", () => typeLeave(K("notice-version"), ""), sub(text(n.file), "> version: 1.2\n", ""));
        // refusals
        const t = text(n.file), w2 = await W(n);
        await typeLeave(K("notice-license"), "a <!-- b"); await sleep(400); await idle(o);
        let why = await refusalOf();
        c.ok(text(n.file) === t && await W(n) === w2 && /comment/.test(why || ""), `A: a value with a comment mark is refused in words (${JSON.stringify((why || "").slice(0, 90))}) and nothing is written`);
        await typeLeave(K("notice-license"), "\"quoted\""); await sleep(400); await idle(o);
        why = await refusalOf();
        c.ok(text(n.file) === t && await W(n) === w2 && /quotation marks/.test(why || ""), `A: a value in quotation marks is refused in words (${JSON.stringify((why || "").slice(0, 90))}) and nothing is written`);
        c.ok(await value(K("notice-license")) === "", "A: and the field goes back to what the note has (nothing)");
        await r.unwind("A");
        c.ok(await value(K("notice-license")) === "Free to copy and share." && await value(K("notice-copyright")) === "", "A: after the Undos the fields show the note's own words again");
        await closeBox();
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 91 ================= */
  async function check91() {
    const c = new Check(91, "a picture's two fields in the real app, typed with the real keyboard: the description and the place of a reference-style picture (the place is the definition line elsewhere in the note, named by its line; changing it is one write that touches that line and no other, and one Undo gives it back with the field following), an inline picture's place; a remote address kept as typed and warned about in words (not refused), the linter's own warning for it expected; a path that breaks the format's rules warned about the same way; an empty description said to be decorative; a reference with no definition line said in words, the line added by a press and taken back by one Undo; nothing fetched; each change one write and one Undo step, the whole note byte for byte, the linter run on each result");
    const table = tableOf();
    await withApp("c91", async (o, vault) => {
      const k = kit4(o, c, vault, table);
      const { start, open, W, K, press, typeLeave, run, scene, closeBox, say, refusalOf, value, settled, undo, diffs } = k;
      const errs0 = consoleReport.length;
      const WARN = `${DV} .booklet-design-editbox [data-reading='path-warning']`, EMPTY = `${DV} .booklet-design-editbox [data-reading='alt-empty']`;
      const shown = sel => o.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.getBoundingClientRect().width > 0; }, sel);
      const said = sel => o.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
      await scene("A. a reference-style picture: its description and its place (a definition line elsewhere)", async () => {
        const n = await start("pictures", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await open(n, "![The harbour at low water][harbour]", "prose");
        c.ok(await value(K("picture-0-alt")) === "The harbour at low water" && await value(K("picture-0-path")) === "images/harbour.jpg", "A: the two fields hold the description and the place the definition line gives");
        const where = await o.evaluate(sel => { const e = document.querySelector(sel + " .booklet-design-editbox [data-reading='picture-0']"); return e ? e.textContent : ""; }, DV);
        const line = lineOf(t0, "[harbour]: images/harbour.jpg") + 1;
        c.ok(where.includes(say("image.where").replace("{line}", String(line)).replace("{id}", "harbour")), `A: and says where the place is written, on line ${line}, as [harbour]`);
        c.ok(where.includes(say("image.note")) || await o.evaluate(sel => (document.querySelector(sel + " .booklet-design-editbox") || { textContent: "" }).textContent.includes("Nothing is fetched or uploaded."), DV), "A: and says that nothing is fetched or uploaded");
        c.ok(!(await shown(WARN)), "A: no warning for a path that keeps the rules");
        await r.step("A: the description typed over", () => typeLeave(K("picture-0-alt"), "Boats at rest"), sub(t0, "![The harbour at low water][harbour]", "![Boats at rest][harbour]"));
        await r.step("A: the place typed over: the definition line, far from the picture, changes and nothing else", () => typeLeave(K("picture-0-path"), "images/boats.png"), sub(text(n.file), "[harbour]: images/harbour.jpg", "[harbour]: images/boats.png"));
        // ONE Undo takes the definition line back, and the field follows although that line is outside the block
        await undo(); const u = await waitDisk(n.file, tx => tx === r.states[r.states.length - 2]); await idle(o);
        c.ok(u.ok && await value(K("picture-0-path")) === "images/harbour.jpg" && await value(K("picture-0-alt")) === "Boats at rest", `A: ONE Undo gives the definition line back byte for byte, and the place field shows images/harbour.jpg again while the description keeps its change${diffs(r.states[r.states.length - 2], text(n.file))}`);
        r.states.pop();
        await r.unwind("A");
        c.ok(await value(K("picture-0-alt")) === "The harbour at low water", "A: after the Undos the description shows the note's words");
        await closeBox();
      });
      await scene("B. an inline picture: a remote address kept and warned about, a path that breaks the rules warned about, a good one", async () => {
        const n = await start("pictures", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await open(n, "![Boats](images/boats.png)", "prose");
        c.ok(await value(K("picture-0-path")) === "images/boats.png" && !(await shown(WARN)), "B: the place field holds images/boats.png and says nothing");
        const w0 = await W(n);
        await r.step("B: a remote address typed: kept as typed, written (not refused)", () => typeLeave(K("picture-0-path"), "https://example.org/boats.png"), sub(t0, "![Boats](images/boats.png)", "![Boats](https://example.org/boats.png)"), [/has a remote address/]);
        c.ok(await refusalOf() === null || (await refusalOf()) === "", `B: nothing is refused (${JSON.stringify(await refusalOf())})`);
        const warn = await said(WARN);
        c.ok(await shown(WARN) && /remote address/.test(warn || "") && /the linter warns/.test(warn || ""), `B: the warning is shown in words under the field (${JSON.stringify((warn || "").slice(0, 150))})`);
        await shotOk(o, "picture-remote");
        await r.step("B: a path with a part that begins with a dot: kept and warned about", () => typeLeave(K("picture-0-path"), "../up/boats.txt"), sub(text(n.file), "(https://example.org/boats.png)", "(../up/boats.txt)"), [/is not a path the renderer reads/]);
        c.ok(await shown(WARN) && /empty part or a part that begins with a dot/.test(await said(WARN) || ""), `B: and says why in words (${JSON.stringify(((await said(WARN)) || "").slice(0, 150))})`);
        await r.step("B: a good path typed: the warning goes", () => typeLeave(K("picture-0-path"), "images/skiffs.webp"), sub(text(n.file), "(../up/boats.txt)", "(images/skiffs.webp)"));
        c.ok(!(await shown(WARN)), "B: the warning is gone");
        // a place that cannot be written in this shape (a space) is refused, not written
        const t = text(n.file), w1 = await W(n);
        await typeLeave(K("picture-0-path"), "images/a b.png"); await sleep(400); await idle(o);
        const why = await refusalOf();
        c.ok(text(n.file) === t && await W(n) === w1 && /no space/.test(why || ""), `B: an address with a space cannot be written in this shape: refused in words (${JSON.stringify((why || "").slice(0, 100))}), nothing written`);
        await r.step("B: the description emptied: a decorative picture, said in words", () => typeLeave(K("picture-0-alt"), ""), sub(text(n.file), "![Boats](images/skiffs.webp)", "![](images/skiffs.webp)"));
        c.ok(await shown(EMPTY) && (await said(EMPTY)) === say("image.alt.empty"), `B: and the field says so (${JSON.stringify((await said(EMPTY) || "").slice(0, 60))})`);
        c.ok(w0 === 0, "B: nothing was written before the first change (nothing is fetched by showing it)");
        await r.unwind("B");
        await closeBox();
      });
      await scene("C. a reference with no definition line", async () => {
        const n = await start("pictures", ["activity", "[!activity|a]"]); const t0 = n.t;
        await open(n, "![Gone][gone]", "prose");
        c.ok(await o.page.locator(K("picture-0-path")).count() === 0 && await o.page.locator(K("picture-0-add")).count() === 1, "C: no place field while there is no line to hold it, and a button to add the line");
        const txt = await o.evaluate(sel => (document.querySelector(sel + " .booklet-design-editbox [data-reading='picture-0']") || { textContent: "" }).textContent, DV);
        c.ok(txt.includes(say("image.missing").replace("{id}", "gone")), "C: it says in words that there is no line saying where [gone] is");
        c.ok(text(n.file) === t0 && await W(n) === 0, "C: showing it wrote nothing");
        await press(K("picture-0-add"));
        const r1 = await settled(n, t0);
        const reg = placed(t0, r1.text);
        c.ok(r1.ok && await W(n) === 1 && reg.removed.trim() === "" && reg.added.trim() === "[gone]: images/gone.jpg" && await value(K("picture-0-path")) === "images/gone.jpg", `C: pressing it writes one line, [gone]: images/gone.jpg, and takes nothing out (${JSON.stringify(reg.added)}); the place field is there now`);
        k.lint(n, "C: the line added");
        await undo(); const u = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(u.ok, "C: ONE Undo gives the note back byte for byte");
        k.lint(n, "C: after the Undo");
        await closeBox();
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 92 ================= */
  async function check92() {
    const c = new Check(92, "a figure's picker in the real app, changed with the keys of the closed drop-down: it lists the diagrams the page can see (its module's own, then the shared one; never another module's), a figure whose diagram is not there is listed last as not found and said in words and is kept as written until another is chosen; choosing rewrites the id inside the embed and nothing else (the diagram's own text is not touched, the rest of the sentence is byte for byte), each change one write and one Undo step, the whole note byte for byte, the linter run on each result");
    const table = tableOf();
    await withApp("c92", async (o, vault) => {
      const k = kit4(o, c, vault, table);
      const { start, open, W, K, run, scene, closeBox, say, optionsOf, keyOn, value } = k;
      const errs0 = consoleReport.length;
      await scene("A. three figures in one sentence", async () => {
        const n = await start("figures", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await open(n, "Here is the cycle", "prose");
        const F0 = K("figure-0"), F1 = K("figure-1"), F2 = K("figure-2");
        const o0 = await optionsOf(F0), o2 = await optionsOf(F2);
        c.ok(JSON.stringify(o0.map(x => x[0])) === JSON.stringify(["own", "shared"]) && !o0.some(x => x[0] === "theirs"), `A: the picker lists the module's own diagram, then the shared one, and not the other module's (${JSON.stringify(o0.map(x => x[0]))})`);
        c.ok(JSON.stringify(o2.map(x => x[0])) === JSON.stringify(["own", "shared", "nowhere"]) && o2[2][1] === say("rows.menu.missing").replace("{id}", "nowhere") && await value(F2) === "nowhere", `A: a figure whose diagram is not there is listed last, said as not found (${JSON.stringify(o2[2][1])}), and read`);
        const lost = await o.evaluate(sel => { const e = document.querySelector(sel + " .booklet-design-editbox [data-reading='figure-lost']"); return e ? e.textContent.trim() : null; }, DV);
        c.ok(lost === say("figure.lost").replace("{id}", "nowhere"), `A: and the box says in words that it is not drawn and is kept as written (${JSON.stringify((lost || "").slice(0, 80))}...)`);
        c.ok(text(n.file) === t0 && await W(n) === 0, "A: showing it wrote nothing");
        await r.step("A: the first figure changed to the shared diagram (Down key): only the id inside the embed changes", () => keyOn(F0, "ArrowDown"), sub(t0, "![[#^own]] and the other", "![[#^shared]] and the other"));
        await r.step("A: the second changed to the module's own (Home)", () => keyOn(F1, "Home"), sub(text(n.file), "the other one ![[#^shared]]", "the other one ![[#^own]]"));
        await r.step("A: the third, whose diagram is missing, changed to the module's own (Home): the missing id is replaced only now", () => keyOn(F2, "Home"), sub(text(n.file), "![[#^nowhere]]", "![[#^own]]"));
        c.ok(text(n.file).includes("graph LR; A --> B") && text(n.file).includes("^own\n") && text(n.file).includes("^shared\n"), "A: the diagrams' own text and their ids are as they were");
        c.ok(await value(F0) === "shared" && await value(F1) === "own" && await value(F2) === "own", "A: the three pickers read the note's embeds");
        await r.unwind("A");
        c.ok(await value(F0) === "own" && await value(F1) === "shared" && await value(F2) === "nowhere", "A: after the Undos the pickers read the original ids (the missing one included)");
        await closeBox();
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 93 ================= */
  async function check93() {
    const c = new Check(93, "a citation's five fields in the real app, typed with the real keyboard, in the box of the sentence that holds the mark: Source title, Edition or detail, Page or place, Quote, Verified date; the page and the verified date changed and the definition line is the original byte for byte apart from those two pieces; the page cleared takes its comma with it and set back gives the same bytes; a value the reader's pattern would not read back (a page that is not a page, a date that is not one, no quote) is refused in words with nothing written; a note outside the source pattern shows the one sentence 'This note is not in the source pattern, so it is edited as words below.' with no fields and its lines untouched; a mark with no note is said in words and a note is added by a press and taken back by one Undo; each change one write and one Undo step, the linter run on each result");
    const table = tableOf();
    await withApp("c93", async (o, vault) => {
      const k = kit4(o, c, vault, table);
      const { start, open, W, K, press, typeLeave, run, scene, closeBox, say, refusalOf, value, settled, undo } = k;
      const errs0 = consoleReport.length;
      const DEF = '[^atlas]: *The Harbour Tide Atlas*, 2nd edition (2019), p. 12: "The tide rises and falls twice in each lunar day." Verified 2026-09-20.';
      await scene("A. the five fields; the page and the verified date changed", async () => {
        const n = await start("citation", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await open(n, "Most harbours", "prose");
        const vals = [await value(K("cite-atlas-title")), await value(K("cite-atlas-detail")), await value(K("cite-atlas-page")), await value(K("cite-atlas-quote")), await value(K("cite-atlas-verified"))];
        c.ok(JSON.stringify(vals) === JSON.stringify(["The Harbour Tide Atlas", "2nd edition (2019)", "p. 12", "The tide rises and falls twice in each lunar day.", "2026-09-20"]), `A: the five fields hold the pieces of the definition (${JSON.stringify(vals)})`);
        const names = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-design-editbox [data-reading='citation-atlas'] .setting-item:not(.setting-item-heading) .setting-item-name")].map(e => e.textContent.trim()), DV);
        c.ok(JSON.stringify(names) === JSON.stringify(["title", "detail", "page", "quote", "verified"].map(f => say("citation." + f))), `A: and are named in words (${JSON.stringify(names)})`);
        const where = await o.evaluate(sel => (document.querySelector(sel + " .booklet-design-editbox [data-reading='citation-atlas']") || { textContent: "" }).textContent, DV);
        c.ok(where.includes(say("citation.where").replace("{line}", String(lineOf(t0, "[^atlas]:") + 1))), "A: and says where the note is, by its line");
        c.ok(text(n.file) === t0 && await W(n) === 0, "A: showing them wrote nothing");
        await r.step("A: the page changed", () => typeLeave(K("cite-atlas-page"), "p. 14"), sub(t0, DEF, DEF.replace("p. 12", "p. 14")));
        await r.step("A: the verified date changed", () => typeLeave(K("cite-atlas-verified"), "2026-11-19"), sub(text(n.file), "Verified 2026-09-20", "Verified 2026-11-19"));
        const line = text(n.file).split("\n").find(l => l.startsWith("[^atlas]:"));
        c.ok(line.replace("p. 14", "p. 12").replace("2026-11-19", "2026-09-20") === DEF && text(n.file).replace("p. 14", "p. 12").replace("2026-11-19", "2026-09-20") === t0, "A: the definition line is the original byte for byte apart from the page and the date, and so is the whole note");
        await r.step("A: the page cleared: its comma goes with it", () => typeLeave(K("cite-atlas-page"), ""), sub(text(n.file), ", p. 14:", ":"));
        await r.step("A: and set back: the same bytes as before it was cleared", () => typeLeave(K("cite-atlas-page"), "p. 14"), sub(text(n.file), "(2019):", "(2019), p. 14:"));
        await r.step("A: the quote changed", () => typeLeave(K("cite-atlas-quote"), "Twice a day."), sub(text(n.file), "The tide rises and falls twice in each lunar day.", "Twice a day."));
        // refusals: nothing written, the field goes back, in words
        const t = text(n.file), w = await W(n);
        for (const [f, v, re, label] of [["page", "14", /begins p\./, "a page that does not begin p."], ["verified", "2026-02-30", /real date/, "a date that is not one"], ["quote", "", /needs its quote/, "no quote"]]) {
          await typeLeave(K("cite-atlas-" + f), v); await sleep(400); await idle(o);
          const why = await refusalOf();
          c.ok(text(n.file) === t && await W(n) === w && re.test(why || ""), `A: ${label} is refused in words (${JSON.stringify((why || "").slice(0, 80))}), nothing is written`);
        }
        c.ok(await value(K("cite-atlas-quote")) === "Twice a day.", "A: and the field goes back to the note's quote");
        await r.unwind("A");
        c.ok(await value(K("cite-atlas-page")) === "p. 12" && await value(K("cite-atlas-verified")) === "2026-09-20", "A: after the Undos the fields show the original page and date");
        await closeBox();
      });
      await scene("B. a note outside the source pattern, and a mark with no note", async () => {
        const n = await start("citation", ["activity", "[!activity|a]"]), t0 = n.t;
        await open(n, "Most harbours", "prose");
        const PL = `${DV} .booklet-design-editbox [data-reading='citation-plain']`;
        const sentence = await o.evaluate(sel => { const e = document.querySelector(sel + " [data-reading='citation-words']"); return e ? e.textContent.trim() : null; }, PL);
        c.ok(sentence === "This note is not in the source pattern, so it is edited as words below." && sentence === say("citation.notPattern"), `B: a note outside the pattern shows the one sentence (${JSON.stringify(sentence)})`);
        c.ok(await o.page.locator(PL + " input").count() === 0, "B: and has no fields");
        const where = await o.evaluate(sel => document.querySelector(sel).textContent, PL);
        c.ok(where.includes(say("citation.where.words").replace("{line}", String(lineOf(t0, "[^plain]:") + 1))), "B: and says where its words are");
        c.ok(text(n.file) === t0 && await W(n) === 0 && text(n.file).includes("[^plain]: Just words, not in the pattern."), "B: its lines are untouched, nothing written");
        const LOST = `${DV} .booklet-design-editbox [data-reading='citation-lost']`;
        const lostWords = await o.evaluate(sel => document.querySelector(sel).textContent, LOST);
        c.ok(lostWords.includes(say("citation.missing").replace("{id}", "lost")) && await o.page.locator(K("cite-lost-add")).count() === 1, "B: a mark with no note says so in words and offers to add one");
        await press(K("cite-lost-add"));
        const r1 = await settled(n, t0);
        const reg = placed(t0, r1.text);
        c.ok(r1.ok && await W(n) === 1 && reg.removed.trim() === "" && /\[\^lost\]: \*Title of the source\*, p\. 1: "The words, copied exactly from the source\."/.test(reg.added) && await o.page.locator(K("cite-lost-quote")).count() === 1, `B: pressing it writes one note, in the pattern, and takes nothing out (${JSON.stringify(reg.added.slice(0, 120))}); its fields are there now`);
        k.lint(n, "B: the note added");
        await undo(); const u = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(u.ok, "B: ONE Undo gives the note back byte for byte");
        k.lint(n, "B: after the Undo");
        await closeBox();
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 94 ================= */
  async function check94() {
    const c = new Check(94, "focus and Undo on the new controls in the real app: a drop-down (a copy button's item, an activity's tab) and a text field (a notice's License) and a words box (a hint's words) each changed with real keys, then the app's own Undo pressed (the button with the mouse, and Ctrl+Z with the drop-down still focused): the control shows the restored value, Redo shows the changed value again, the page is on the same page with the same trail, header and scroll place, the box is still open on the same block, no page error and no console error; Ctrl+Z inside a text field being typed in is the field's own (nothing is written, the note is not undone)");
    const table = tableOf();
    await withApp("c94", async (o, vault) => {
      const k = kit4(o, c, vault, table);
      const { start, open, pageBox, W, K, typeLeave, settled, diffs, undo, scene, closeBox, keyOn, value } = k;
      const errs0 = consoleReport.length;
      const where = async () => { const f = await frame3(o), s = await state(o); const sh = await o.evaluate(sel => { const s = document.querySelector(sel + " .booklet-design-scroll"); const b = document.querySelector(sel + " .booklet-design-editbox"); return [s ? s.scrollHeight : null, s ? s.clientHeight : null, b ? Math.round(b.getBoundingClientRect().height) : null, b ? Math.round(b.getBoundingClientRect().top) : null]; }, DV); return { sh: sh.join(","), scrollTop: f.scrollTop, pageAbs: f.pageAbs, trail: f.trail.join(" > "), top: JSON.stringify(f.top), page: s.page, selected: s.selected, editBox: s.editBox }; };
      const active = () => o.evaluate(() => { const a = document.activeElement; return a ? (a.tagName.toLowerCase() + "[" + (a.getAttribute("data-key") || a.className || "") + "]") : null; });
      const sameWhere = (a, b) => ["scrollTop", "pageAbs", "trail", "top", "page", "selected", "editBox"].filter(x => JSON.stringify(a[x]) !== JSON.stringify(b[x]));
      const redoBtn1 = () => redoBtn(o).click();
      /** One control: changed, Undone by the button, Redone, changed again, Undone by the key with the control still focused. */
      const around = async (label, n, ctl, change, expectBefore, expectAfter) => {
        const t0 = text(n.file), w0 = await W(n);
        // the control is in view first (a real key on a control the page has not shown scrolls the page to it: that is the browser's, not the Undo's)
        await o.page.locator(ctl).scrollIntoViewIfNeeded(); await sleep(250);
        const b0 = await where();
        await change();
        const r1 = await settled(n, t0);
        const t1 = r1.text;
        c.ok(r1.ok && await W(n) === w0 + 1 && await value(ctl) !== expectBefore, `${label}: the control is changed with real keys (one write; it reads ${JSON.stringify(await value(ctl))})`);
        await undo(); const u = await waitDisk(n.file, tx => tx === t0); await idle(o);
        c.ok(u.ok, `${label}: a press on the app's Undo (the button) gives the note back byte for byte${diffs(t0, text(n.file))}`);
        c.ok(await value(ctl) === expectBefore, `${label}: and the control shows the restored value (${JSON.stringify(await value(ctl))}, wanted ${JSON.stringify(expectBefore)})`);
        const b1 = await where();
        const moved = sameWhere(b0, b1);
        c.info(`${label}: before ${JSON.stringify(b0)} after ${JSON.stringify(b1)}`);
        c.ok(moved.length === 0, `${label}: the page has not lost its place: ${moved.length ? "DIFFERENT " + JSON.stringify(moved.map(x => [x, b0[x], b1[x]])) : "same page " + b1.page + ", same trail, header and scroll place (" + b1.scrollTop + "), the box open on " + b1.selected}`);
        c.info(`${label}: the focus after the Undo button was pressed is on ${await active()}`);
        await redoBtn1(); const rd = await waitDisk(n.file, tx => tx === t1); await idle(o);
        c.ok(rd.ok && await value(ctl) === expectAfter, `${label}: Redo gives the changed note back and the control shows ${JSON.stringify(await value(ctl))} again`);
        return { t0, t1 };
      };
      await scene("A. a drop-down: a copy button's item", async () => {
        const n = await start("copy", ["activity", "[!activity|a]"]);
        await open(n, "[!copy|go", "callout");
        const P = K("c0-pick");
        const { t0, t1 } = await around("A", n, P, () => keyOn(P, "End"), "why", "n");
        // the key: the drop-down still has the focus when Ctrl+Z is pressed (Home puts it back to why: a second change)
        await keyOn(P, "Home");
        const r2 = await settled(n, t1);
        c.ok(r2.ok && r2.text === t0 && await value(P) === "why", "A: Home on the drop-down puts it back (the original bytes)");
        await keyOn(P, "End");
        const r3 = await settled(n, t0);
        c.ok(r3.ok && await value(P) === "n", "A: and End changes it again");
        // a drop-down is a field to the view (the key is the field's, as in a text box): Ctrl+Z with it focused does nothing to the note, and says nothing wrong
        await o.page.focus(P);
        const f0 = await active();
        await o.page.keyboard.press("Control+z"); await sleep(600); await idle(o);
        c.ok(text(n.file) === r3.text && await value(P) === "n" && (await state(o)).modal === false, `A: Ctrl+Z with the drop-down focused (${f0}) is left to the drop-down: the note stays as it was, and the drop-down still shows n (by design: the view's rule is that a key in a field is the field's)`);
        // one Escape (it applies and closes the box) and the key is the view's
        await o.page.keyboard.press("Escape"); await sleep(400);
        await o.page.keyboard.press("Control+z");
        const u = await waitDisk(n.file, tx => tx === t0, 4000); await idle(o);
        c.ok(u.ok, "A: after Escape has taken the focus out of the drop-down, Ctrl+Z is the app's Undo: the note is back byte for byte");
        await o.page.keyboard.press("Control+Shift+z");
        const rd = await waitDisk(n.file, tx => tx === r3.text, 4000); await idle(o);
        c.ok(rd.ok, "A: and Ctrl+Shift+Z is Redo: the changed note is back byte for byte");
        c.info(`A: after those keys the box is ${(await state(o)).editBox ? "open" : "closed"} and the view says ${JSON.stringify((await state(o)).status)}`);
        await closeBox();
      });
      await scene("B. a drop-down: an activity's tab", async () => {
        const n = await start("structure", ["activity", "[!activity|alpha"]);
        await pageBox();
        const T = K("tab");
        await around("B", n, T, () => keyOn(T, "ArrowDown"), "learn", "this-month");
        await closeBox();
      });
      await scene("C. a text field: a notice's License", async () => {
        const n = await start("notice", ["module", "[!module|m]"]);
        await open(n, "[!notice]", "notice");
        const L = K("notice-license");
        const { t0 } = await around("C", n, L, () => typeLeave(L, "Share alike."), "Free to copy and share.", "Share alike.");
        // Ctrl+Z inside a field being typed in is the field's own
        await undo(); await waitDisk(n.file, tx => tx === t0); await idle(o);
        const w = await W(n);
        await o.page.locator(L).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("zzz");
        await o.page.keyboard.press("Control+z"); await sleep(300);
        c.ok(text(n.file) === t0 && await W(n) === w, `C: Ctrl+Z while typing in the field reverts the field's own typing (it reads ${JSON.stringify(await value(L))}); nothing is written and the note is not undone`);
        await o.page.keyboard.press("Tab"); await sleep(500); await idle(o);
        c.ok(text(n.file) === t0 && await W(n) === w, "C: and leaving the field with the original words writes nothing");
        await closeBox();
      });
      await scene("D. a words box: a hint's words", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"]);
        await open(n, "[!text|why long] Why again?");
        const H = K("hint-words");
        await around("D", n, H, async () => { await o.page.locator(H).click(); await o.page.keyboard.press("Control+a"); await o.page.keyboard.type("Look at the sea."); await o.page.keyboard.press("Tab"); }, "Look at the moon.", "Look at the sea.");
        await closeBox();
      });
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 95 ================= */
  async function check95() {
    const c = new Check(95, "the stage 4 controls on a phone (Obsidian's phone mode, 390 x 844), real Obsidian: for each box (a tip and a group with the Starts folded switch, a question with its Hint and Solution fields and its Add buttons, an activity's tab and entries, a page's parent, a copy button's list, a notice, a reference-style picture and a missing definition, three figures, a citation and a missing note) every button, switch, drop-down, text field, words box and summary that is shown is measured with getBoundingClientRect, and each must be at least 44 px high AND at least 44 px wide (a smaller one is a failure, listed by name); the page and the view have no sideways scroll, nothing is wider than the screen or cut off; screenshots light and dark");
    const table = tableOf();
    await withApp("c95", async (o, vault) => {
      const k = kit4(o, c, vault, table);
      const { start, open, openGroup, pageBox, closeBox, scene } = k;
      const errs0 = consoleReport.length;
      /** Every control the open box shows, measured: how many, and the ones under 44 px either way. */
      const measure = () => o.evaluate(sel => {
        const root = document.querySelector(sel + " .booklet-design-editbox");
        if (!root) return null;
        const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !e.closest("[hidden]") && !e.closest("details:not([open]) > :not(summary)") && !e.closest(".is-measuring"); };
        const name = e => e.tagName.toLowerCase() + (e.getAttribute("data-key") ? "[" + e.getAttribute("data-key") + "]" : e.getAttribute("aria-label") ? "[" + e.getAttribute("aria-label") + "]" : "(" + (e.textContent || "").trim().slice(0, 20) + ")");
        const all = [...root.querySelectorAll("button, select, input:not([type=hidden]), textarea, summary, [role=switch]")].filter(vis);
        const least = all.map(e => { const r = e.getBoundingClientRect(); return { n: name(e), w: Math.round(r.width), h: Math.round(r.height) }; }).sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h))[0];
        return { n: all.length, least, kinds: [...new Set(all.map(e => e.tagName.toLowerCase() + (e.getAttribute("role") === "switch" ? ":switch" : "")))].sort(), small: all.map(e => { const r = e.getBoundingClientRect(); return { n: name(e), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; }).filter(x => x.w < 43.5 || x.h < 43.5) };
      }, DV);
      const judge = async (label, shotName) => {
        const m = await measure();
        c.ok(!!m && m.n > 0, `${label}: the box shows ${m ? m.n : 0} controls (${m ? m.kinds.join(" ") : ""})`);
        c.ok(m && m.small.length === 0, `${label}: every one is at least 44 x 44 px (the smallest is ${m && m.least ? m.least.n + " at " + m.least.w + " x " + m.least.h : "none"})${m && m.small.length ? "; SMALLER: " + JSON.stringify(m.small.slice(0, 12)) : ""}`);
        const pf = await phoneFacts(o), fit = await fitOf(o);
        c.ok(pf.bodyMobile && pf.docScroll <= pf.W + 1 && pf.vcScroll <= pf.vcClient + 1 && pf.wideCount === 0, `${label}: no sideways scroll, nothing wider than the screen (page ${pf.docScroll} of ${pf.W} px, view ${pf.vcScroll} of ${pf.vcClient})${pf.wideCount ? ": " + JSON.stringify(pf.wide) : ""}`);
        c.ok(fit.clippedCount === 0 && fit.offCount === 0, `${label}: nothing is cut off or off the screen${fit.clippedCount || fit.offCount ? ": " + JSON.stringify({ clipped: fit.clipped, off: fit.off }) : ""}`);
        if (shotName) await shotEl(o, `stage4-phone-${shotName}`, `${DV} .booklet-design-editbox`, "start");
        return m;
      };
      await o.page.setViewportSize({ width: 390, height: 844 });
      await mobile(o, true);
      await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
      await scene("A. a callout and a group: the Starts folded switch", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"], {}, false);
        await open(n, "[!tip]- A folded tip", "callout"); await judge("tip", "tip"); await closeBox();
        await openGroup(n, "[!group] Step one"); await judge("group"); await closeBox();
      });
      await scene("B. a question: Hint and Solution fields, Add buttons, a hint that holds a list", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"], {}, false);
        await open(n, "[!text|why long] Why again?"); await judge("question with a hint and a solution", "question-helps"); await closeBox();
        await open(n, "[!choice|bare] A bare question?"); await judge("question with neither (two Add buttons)"); await closeBox();
        await open(n, "[!choice|lst]"); await judge("question whose hint is a list"); await closeBox();
        await open(n, "[!choice|c1] Pick?"); await judge("question with a hint inside a group"); await closeBox();
      });
      await scene("C. an activity's tab and entries, a page's parent", async () => {
        const n = await start("structure", ["activity", "[!activity|alpha"], {}, false);
        await pageBox(); await judge("activity with a tab picker", "activity-tab"); await closeBox();
        await goNav(o, "activity", lineOf(n.t, "[!activity|delta")); await pageBox(); await judge("repeat activity with the entries switch"); await closeBox();
        await goNav(o, "page", lineOf(n.t, "[!page|p1")); await pageBox(); await judge("page with a parent picker", "page-parent"); await closeBox();
      });
      await scene("D. a copy button's list", async () => {
        const n = await start("copy", ["activity", "[!activity|a]"], {}, false);
        await open(n, "[!copy|go", "callout"); await judge("copy button", "copy"); await closeBox();
      });
      await scene("E. a notice", async () => {
        const n = await start("notice", ["module", "[!module|m]"], {}, false);
        await open(n, "[!notice]", "notice"); await judge("notice", "notice"); await closeBox();
      });
      await scene("F. pictures, figures, citations", async () => {
        const p = await start("pictures", ["activity", "[!activity|a]"], {}, false);
        await open(p, "![The harbour at low water][harbour]", "prose"); await judge("reference-style picture", "picture"); await closeBox();
        await open(p, "![Gone][gone]", "prose"); await judge("picture with no definition line (Add the line)"); await closeBox();
        const f = await start("figures", ["activity", "[!activity|a]"], {}, false);
        await open(f, "Here is the cycle", "prose"); await judge("three figures", "figures"); await closeBox();
        const q = await start("citation", ["activity", "[!activity|a]"], {}, false);
        await open(q, "Most harbours", "prose"); await judge("citations (five fields, a note outside the pattern, a missing note)", "citation"); await closeBox();
      });
      await scene("G. dark", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"], {}, false);
        await o.setScheme("dark"); await sleep(1500);
        await open(n, "[!text|why long] Why again?"); await judge("dark: question with a hint and a solution", "question-helps-dark"); await closeBox();
        await o.setScheme("light"); await sleep(1500);
      });
      // Switching the colour scheme makes Obsidian write .obsidian/appearance.json, and it sometimes reads the file while it is half written; that is the app's own message about its own config file (seen twice in six runs, on both versions), not the plugin's, so only that exact message is set aside and counted.
      const own = x => /^failed to read JSON \.obsidian\/(appearance|app)\.json SyntaxError/.test(x.text);
      const all = errorsSince(errs0), errs = all.filter(x => !own(x));
      if (all.length !== errs.length) c.info(`Obsidian's own half-written config message set aside: ${all.length - errs.length}`);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* ================= CHECK 96 ================= */
  async function check96() {
    const c = new Check(96, "an element the plugin hides stays hidden, in the real app: the sentence about a + under a hint and a solution (\"It is written with a +, so it can fold and starts open...\") is not visible when the callout is written with a -, is visible when it is written with a +, and follows the Starts folded switch (visibility is computed from getBoundingClientRect and offsetParent, not from the attribute); and a sweep of every element that carries the hidden attribute in the Design view, with a box open of each kind (a tip, a note written with a +, a group, a question with hint and solution, a page's box with its pickers, an activity's, a notice, a copy button, a picture, a figure, a citation), finds none that is drawn (a class that gives an element a display, such as the flex row of that sentence, must not beat the attribute)");
    const table = tableOf();
    await withApp("c96", async (o, vault) => {
      const k = kit4(o, c, vault, table);
      const { start, open, openGroup, pageBox, K, press, run, scene, closeBox, say } = k;
      const errs0 = consoleReport.length;
      const PLUS = kind => `${DV} .booklet-design-editbox [data-help='${kind}'] .booklet-design-help-plus`;
      /** Drawn, as a person sees it: it has a layout parent and a box with a size (null: there is no such element). */
      const drawn = sel => o.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return !!e.offsetParent && r.width > 0 && r.height > 0; }, sel);
      const attr = sel => o.evaluate(s => { const e = document.querySelector(s); return e ? e.hidden : null; }, sel);
      let swept = 0, hiddenSeen = 0;
      /** Every element of the Design view that has the hidden attribute: none may be drawn (display other than none, or a box with a size). */
      const sweep = async label => {
        const r = await o.evaluate(dv => {
          const all = [...document.querySelectorAll(dv + " [hidden]")];
          const bad = all.filter(e => { const b = e.getBoundingClientRect(); return getComputedStyle(e).display !== "none" || !!e.offsetParent || b.width > 0 || b.height > 0; });
          return { n: all.length, bad: bad.map(e => `${e.tagName.toLowerCase()}.${String(e.className).replace(/\s+/g, ".")} display ${getComputedStyle(e).display}: ${(e.textContent || "").trim().slice(0, 40)}`) };
        }, DV);
        swept++; hiddenSeen += r.n;
        c.ok(r.bad.length === 0, `${label}: of ${r.n} elements with the hidden attribute in the view none is drawn${r.bad.length ? " (DRAWN: " + JSON.stringify(r.bad) + ")" : ""}`);
      };
      await scene("A. the sentence about a +, under a hint and a solution", async () => {
        const n = await start("helpfolds", ["activity", "[!activity|a]"]); const r = run(n), t0 = n.t;
        await open(n, "[!text|folded long]");
        for (const kind of ["hint", "solution"]) {
          c.ok(await attr(PLUS(kind)) === true && await drawn(PLUS(kind)) === false, `A: written with a -, the ${kind}'s sentence about a + is in the box and not drawn (hidden attribute ${await attr(PLUS(kind))}, drawn ${await drawn(PLUS(kind))})`);
        }
        await sweep("A, a question with a folded hint and solution");
        await closeBox();
        await open(n, "[!text|plus long]");
        for (const kind of ["hint", "solution"]) {
          const txt = (await o.page.locator(PLUS(kind)).textContent() || "").trim();
          c.ok(await attr(PLUS(kind)) === false && await drawn(PLUS(kind)) === true && txt === say("fold.plus"), `A: written with a +, the ${kind}'s sentence is drawn and says ${JSON.stringify(txt.slice(0, 50))}...`);
        }
        await sweep("A, a question with an open (+) hint and solution");
        await r.step("A: the + hint's switch pressed: the + becomes a -", () => press(K("hint-fold")), sub(t0, "> [!hint]+ Hint", "> [!hint]- Hint"));
        c.ok(await drawn(PLUS("hint")) === false && await drawn(PLUS("solution")) === true, `A: and the hint's sentence goes (drawn ${await drawn(PLUS("hint"))}) while the solution's stays (drawn ${await drawn(PLUS("solution"))})`);
        await r.step("A: the + solution's switch pressed too", () => press(K("solution-fold")), sub(text(n.file), "> [!solution]+ Model answer", "> [!solution]- Model answer"));
        c.ok(await drawn(PLUS("hint")) === false && await drawn(PLUS("solution")) === false, "A: and the solution's sentence goes too");
        await r.unwind("A");
        c.ok(await drawn(PLUS("hint")) === true && await drawn(PLUS("solution")) === true, `A: after the Undos both sentences are drawn again (hint ${await drawn(PLUS("hint"))}, solution ${await drawn(PLUS("solution"))})`);
        await closeBox();
        const m = await start("folds", ["activity", "[!activity|a]"]);
        await open(m, "[!text|q long] Why?");
        c.ok(await attr(PLUS("solution")) === true && await drawn(PLUS("solution")) === false, "A: a solution straight under its question's words, written with a -, does not draw the sentence either");
        await closeBox();
      });
      await scene("B. the sweep, with a box open of each kind", async () => {
        const n = await start("folds", ["activity", "[!activity|a]"]);
        await sweep("B, nothing open");
        await open(n, "[!tip]- A folded tip", "callout"); await sweep("B, a folded tip"); await closeBox();
        await open(n, "[!note]+ An open note", "callout"); await sweep("B, a note written with a +"); await closeBox();
        await open(n, "[!note] A plain note", "callout"); await sweep("B, a plain note"); await closeBox();
        await openGroup(n, "[!group] Step one"); await sweep("B, a group"); await closeBox();
        await open(n, "[!choice|bare] A bare question?"); await sweep("B, a question with no hint and no solution"); await closeBox();
        await open(n, "[!choice|lst] A question whose hint is a list?"); await sweep("B, a question whose hint holds more than words"); await closeBox();
        const s = await start("structure", ["activity", "[!activity|alpha"]);
        await pageBox(); await sweep("B, an activity's box"); await closeBox();
        await start("structure", ["page", "[!page|p1"]);
        await pageBox(); await sweep("B, a page's box"); await closeBox();
        const t = await start("notice", ["module", "[!module|m]"]);
        await open(t, "[!notice]", "notice"); await sweep("B, a notice"); await closeBox();
        const y = await start("copy", ["activity", "[!activity|a]"]);
        await open(y, "[!copy|go", "callout"); await sweep("B, a copy button"); await closeBox();
        await open(await start("pictures", ["activity", "[!activity|a]"]), "![The harbour at low water][harbour]", "prose"); await sweep("B, a reference-style picture"); await closeBox();
        const f = await start("figures", ["activity", "[!activity|a]"]);
        await open(f, "Here is the cycle", "prose"); await sweep("B, three figures"); await closeBox();
        const q = await start("citation", ["activity", "[!activity|a]"]);
        await open(q, "Most harbours", "prose"); await sweep("B, citations"); await closeBox();
      });
      c.ok(swept >= 14 && hiddenSeen > 0, `the sweep ran ${swept} times and met ${hiddenSeen} hidden elements in all (it looked at something)`);
      const errs = errorsSince(errs0);
      c.ok(errs.length === 0, `no page or console error in the whole check (${errs.length})${errs.length ? ": " + JSON.stringify(errs.map(x => x.text.slice(0, 120))) : ""}`);
    });
    return c;
  }

  /* END STAGE4 */

  return { 64: check64, 65: check65, 66: check66, 67: check67, 68: check68, 69: check69, 70: check70, 71: check71, 72: check72, 73: check73, 74: check74, 75: check75, 76: check76, 77: check77, 78: check78, 79: check79, 80: check80, 81: check81, 82: check82, 83: check83, 84: check84, 85: check85, 86: check86, 87: check87, 88: check88, 89: check89, 90: check90, 91: check91, 92: check92, 93: check93, 94: check94, 95: check95, 96: check96 };
};
