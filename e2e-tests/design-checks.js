// Checks 64 to 71 of plugin-check.js (plugin 1.6.0): the Design view, in the real Obsidian (not jsdom). Every note is the repository's test-vault
// note or is made up here and written into the check's own copy of the vault; nothing is written into --vault.
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
//      (its settings rows edit a draft, Save writes, Cancel, Esc twice, Ctrl+Enter, a draft kept, a note changed on disk meanwhile), the
//      navigator, the lines the reader cannot read; each write compared byte for byte
//   68 the same writes with the note also open in a Markdown pane (they go through that editor; its buffer equals the disk)
//   69 a phone (Obsidian's phone mode at 390 x 844): the menu button and the panel, the Add tab on a phone, placing, the editor, the dialog;
//      light and dark, with screenshots
//   70 and 71 Obsidian in Spanish and in French: the view's words in that language, and each scene fits, at a desktop's width and on a phone
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check functions.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { frames, mobile } = require("./waits");

module.exports = function designChecks(env) {
  const { withApp, Check, SHOTS, sleep, waitActiveType, launch, opt, SRC_VAULT } = env;
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
    await o.evaluate(async () => { const v = app.workspace.getLeavesOfType("booklet-design")[0]?.view; if (v) await v.whenIdle(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
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
      editBox: !!el.querySelector(".booklet-design-editbox"), editor: !!el.querySelector(".booklet-design-textarea"),
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
  /** A press on a block: it is selected and opens in place (the box has the focus). */
  async function clickBlock(o, kind, start) {
    const sel = block(kind, start);
    await o.page.locator(sel).scrollIntoViewIfNeeded();
    await o.page.locator(sel).click();
    await o.page.waitForSelector(sel + ".is-open .booklet-design-textarea", { timeout: 5000 });
    await sleep(150);
  }
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
      // a key is the field's in a text field and in the textarea: nothing opens, nothing is written
      const tF = text(file);
      const fruitAt = lineOf(tF, "[!choice|fruit]");
      await clickBlock(o, "question", fruitAt);
      const titleSel = `${block("question", fruitAt)} .booklet-design-settings [data-field='title'] input`;
      const orig = await o.page.locator(titleSel).inputValue();
      await o.page.locator(titleSel).click();
      await o.page.keyboard.press("End");
      await typeFast(o, "sqmrvd");
      const typedIn = await o.page.locator(titleSel).inputValue();
      st = await state(o);
      c.ok(typedIn === orig + "sqmrvd" && !/^Keys/.test(st.status) && st.armed.length === 0, `typing s q m r v d in the settings' Title box goes into the box (${JSON.stringify(typedIn.slice(-8))}); no keys are pending and nothing is picked`);
      await o.page.locator(titleSel).fill(orig); await o.page.locator(titleSel).evaluate(e => e.blur()); await sleep(300);
      c.ok(text(file) === tF, "the box put back and left: the note is as it was (a settings row changes the draft, never the note)");
      await o.page.locator(`${block("question", fruitAt)} .booklet-design-textarea`).focus();
      await typeFast(o, "qmsr");
      const areaVal = await o.page.locator(`${block("question", fruitAt)} .booklet-design-textarea`).inputValue();
      st = await state(o);
      c.ok(areaVal.includes("qmsr") && !/^Keys/.test(st.status) && st.armed.length === 0, "in the Markdown box the letters q m s r are text, and open no keys");
      await o.page.keyboard.press("Escape"); await o.page.keyboard.press("Escape"); await sleep(300);
      st = await state(o);
      c.ok(!st.editBox && text(file) === tF, "Escape twice throws the typed letters away and writes nothing");
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
      const tsel = `${block("question", lineOf(text(file), "[!choice|fruit]"))} .booklet-design-settings [data-field='title'] input`;
      await o.page.locator(tsel).click(); await o.page.keyboard.press("End"); await o.page.keyboard.press("q"); await sleep(300);
      const inField = await o.evaluate(sel => ({ v: document.querySelector(sel).value, side: app.workspace.leftSplit.collapsed }), tsel);
      c.info(`the user's bare-q hotkey while the settings' Title box has the focus: the box ${/q$/.test(inField.v) ? "gets the letter" : "does not get the letter"} and the sidebar ${inField.side !== sideNow ? "toggles too (Obsidian runs a user's own bare-letter hotkey even in a field; the plugin never takes a key from a field)" : "does not toggle"}`);
      await o.evaluate(() => { app.hotkeyManager.setHotkeys("app:toggle-left-sidebar", []); app.hotkeyManager.bake(); });
      c.ok(text(file) === k3, "after the three parts were added by keys, everything else of this run (Escape, filter, a box typed in and put back, the text box, Ctrl+P, Ctrl+O, the palette commands, a user's hotkey) wrote nothing: the note is as the additions left it");
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
  const draftOf = o => o.evaluate(() => { const a = document.querySelector(".workspace-leaf.mod-active .booklet-design-textarea"); return a ? a.value : null; });
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
      // in a field the key is the field's: Ctrl+Z in the settings' Title box does not undo the delete
      const toolsAt = lineOf(E1, "[!multi|tools");
      await clickBlock(o, "question", toolsAt);
      const tIn = `${block("question", toolsAt)} .booklet-design-settings [data-field='title'] input`;
      await o.page.locator(tIn).click(); await o.page.keyboard.press("Control+z"); await sleep(500);
      c.ok(text(every) === E1, "Ctrl+Z while the settings' Title box has the focus is the box's own (the view undoes nothing: the note still has the delete)");
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

      // ---------- the editor in place: the settings rows change a draft, Save writes
      await clickBlock(o, "question", fruit);
      const titleIn = `${block("question", fruit)} .booklet-design-settings [data-field='title'] input`;
      await o.page.locator(titleIn).fill("Which fruit would you take?"); await o.page.locator(titleIn).press("Enter");
      await sleep(500);
      c.ok(text(every) === E0, "changing the Title row changes the draft and writes nothing: the note is still byte for byte as it was");
      let d = await draftOf(o);
      st = await state(o);
      c.ok(d.split("\n")[0] === "> [!choice|fruit] Which fruit would you take?" && (await o.evaluate(() => (document.querySelector(".workspace-leaf.mod-active .booklet-design-edit-mark") || {}).textContent)) === "Unsaved changes", `the Markdown box follows the row at once (${JSON.stringify(d.split("\n")[0])}) and the box says "Unsaved changes"`);
      const prev = await o.evaluate(() => (document.querySelector(".workspace-leaf.mod-active .booklet-design-edit-previewhost") || {}).textContent || "");
      c.ok(/Which fruit would you take\?/.test(prev), `the preview "As the reader sees it" follows the draft: ${JSON.stringify(prev.slice(0, 60))}`);
      await shot(o, "editor-draft-light");
      await o.page.locator(`${DV} .booklet-design-save`).click();
      r = await waitDisk(every, tx => tx !== E0); await idle(o);
      c.ok(r.ok && linesDiffering(E0, r.text) === 1 && r.text.includes("> [!choice|fruit] Which fruit would you take?\n"), `Save writes that block's opening line and no other line (${linesDiffering(E0, r.text)} line differs): ${JSON.stringify(region(E0, r.text))}`);
      st = await state(o);
      c.ok(!st.editBox && /^Changed /.test(st.status) && st.selected === "question@" + fruit, `Save closes the editor, the block stays selected, the status says "${st.status}"`);
      const E2 = r.text;
      await clickBlock(o, "question", fruit);
      await o.page.locator(`${block("question", fruit)} .booklet-design-settings [data-field='open'] .checkbox-container`).click(); await sleep(300);
      c.ok(text(every) === E2, "the switch \"open\" changes the draft and writes nothing");
      await o.page.locator(`${DV} .booklet-design-save`).click();
      r = await waitDisk(every, tx => tx !== E2); await idle(o);
      c.ok(r.ok && linesDiffering(E2, r.text) === 1 && /> \[!choice\|fruit open\] Which fruit would you take\?/.test(r.text), `Save then adds the flag to the opening line only: ${JSON.stringify(r.text.split("\n")[fruit])}`);
      await undoBtn(o).click(); await waitDisk(every, tx => tx === E2); await idle(o);
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      c.ok(r.ok, "two Undos take both saved changes back: the note is whole again, byte for byte");

      // ---------- the Markdown box of the editor
      await clickBlock(o, "question", fruit);
      let area = o.page.locator(`${block("question", fruit)} .booklet-design-textarea`);
      c.ok(await area.count() === 1 && await area.evaluate(e => e === document.activeElement) && await area.inputValue() === fruitBlock, "a press on a block opens its own lines in a text box in place, with the focus in it and nothing but those lines in it");
      const eb = await o.evaluate(sel => { const b = document.querySelector(sel); return { title: (b.querySelector(".booklet-design-edit-title") || {}).textContent, labels: [...b.querySelectorAll(".booklet-design-edit-label")].map(x => x.textContent), rows: b.querySelectorAll(".setting-item").length, buttons: [...b.querySelectorAll(".booklet-design-editor-buttons button")].map(x => x.textContent) }; }, block("question", fruit) + " .booklet-design-editbox");
      c.ok(eb.title === "Editing: Question" && eb.labels.join() === "As the reader sees it,Markdown" && eb.rows >= 4 && eb.buttons.join() === "Cancel,Save", `the editor has the header ${JSON.stringify(eb.title)}, the parts ${JSON.stringify(eb.labels)}, ${eb.rows} setting rows and the buttons ${JSON.stringify(eb.buttons)}`);
      await shot(o, "editor-light");
      await o.page.keyboard.press("Escape"); await sleep(300);
      st = await state(o);
      c.ok(!st.editBox && st.selected === "question@" + fruit, "Escape with nothing changed closes the editor and leaves the block selected");
      await o.page.locator(block("question", fruit)).click(); await o.page.waitForSelector(block("question", fruit) + ".is-open", { timeout: 3000 });
      await o.page.keyboard.press("Control+End"); await typeFast(o, "zz"); await sleep(200);
      await o.page.keyboard.press("Escape"); await sleep(250);
      const armed = await o.evaluate(() => ({ open: !!document.querySelector(".workspace-leaf.mod-active .booklet-design-textarea"), state: (document.querySelector(".workspace-leaf.mod-active .booklet-design-editor-state") || {}).textContent, mark: (document.querySelector(".workspace-leaf.mod-active .booklet-design-edit-mark") || {}).textContent }));
      c.ok(armed.open && /Esc again/.test(armed.state || "") && armed.mark === "Unsaved changes", "the first Escape with changes keeps the box and says so: " + JSON.stringify(armed));
      await o.page.keyboard.press("Escape"); await sleep(300);
      const gone = await state(o);
      c.ok(!gone.editBox && /thrown away/.test(gone.status) && text(every) === E0, `the second Escape throws the changes away (status "${gone.status}") and the note is untouched`);
      // Cancel
      await clickBlock(o, "question", fruit);
      await o.page.locator(`${block("question", fruit)} .booklet-design-textarea`).fill(fruitBlock + "\n- [ ] Cherry"); await sleep(150);
      await o.page.locator(`${DV} .booklet-design-cancel`).click(); await sleep(300);
      st = await state(o);
      c.ok(!st.editBox && /thrown away/.test(st.status) && text(every) === E0 && st.selected === "question@" + fruit, `Cancel throws the changes away and writes nothing; the block stays selected (status "${st.status}")`);
      // Ctrl+Enter saves
      await clickBlock(o, "question", fruit);
      area = o.page.locator(`${block("question", fruit)} .booklet-design-textarea`);
      await area.fill(fruitBlock.replace("Pick one.", "Pick any.")); await sleep(150);
      await o.page.keyboard.press("Control+Enter");
      r = await waitDisk(every, tx => tx !== E0); await idle(o);
      c.ok(r.ok && linesDiffering(E0, r.text) === 1 && r.text.includes("> Pick any.") && !(await state(o)).editBox, `Ctrl+Enter saves: only the one changed line differs, the editor closed: ${JSON.stringify(region(E0, r.text))}`);
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      // Save adds a line: the Markdown box rewrites more than the opening line
      await clickBlock(o, "question", fruit);
      await o.page.locator(`${block("question", fruit)} .booklet-design-textarea`).fill(fruitBlock + "\n- [ ] Cherry"); await sleep(250);
      const rowsAfter = await o.evaluate(sel => document.querySelector(sel).querySelectorAll(".setting-item").length, block("question", fruit) + " .booklet-design-edit-section.is-form");
      c.ok(rowsAfter >= 4 && text(every) === E0, `typing in the Markdown box keeps the settings rows in step and writes nothing (${rowsAfter} rows)`);
      await o.page.locator(`${DV} .booklet-design-save`).click();
      r = await waitDisk(every, tx => tx !== E0); await idle(o);
      rg = region(E0, r.text);
      { const pl = placed(E0, r.text); c.ok(r.ok && pl.removed === "" && pl.added === "- [ ] Cherry" && r.text.split("\n").length === E0.split("\n").length + 1, `Save of a box with one more option puts in just that line, nothing taken out (${JSON.stringify(pl)})`); }
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      // a draft is never lost: to another page, or to a press on another block
      await clickBlock(o, "question", fruit);
      await o.page.locator(`${block("question", fruit)} .booklet-design-textarea`).fill(fruitBlock + "\n- [ ] Cherry"); await sleep(250);
      await goNav(o, "activity", lineOf(E0, "[!activity|shared"));
      st = await state(o);
      const det = await o.evaluate(() => { const b = document.querySelector(".workspace-leaf.mod-active .booklet-design-editbox"); return b ? { detached: b.classList.contains("is-detached"), area: b.querySelector("textarea").value, said: (b.querySelector(".booklet-design-editor-moved") || {}).textContent || "" } : null; });
      c.ok(!!det && det.detached && det.area.includes("Cherry") && text(every) === E0, `another page drawn with a draft open keeps the draft on the screen, above that page, with its words (${JSON.stringify(det && det.said)}) and writes nothing`);
      await goNav(o, "activity", KINDS);
      await o.page.locator(block("question", tools)).scrollIntoViewIfNeeded();
      await o.page.locator(block("question", tools)).click(); await sleep(400);
      st = await state(o);
      c.ok(/Another block is open/.test(st.status) && (await draftOf(o)).includes("Cherry"), `a press on another block while a draft is open says so (${JSON.stringify(st.status)}) and keeps the draft`);
      await o.page.locator(`${DV} .booklet-design-cancel`).click(); await sleep(300);
      c.ok(text(every) === E0, "Cancel of that draft leaves the note as it was");
      // stale: the note changes on disk (the block itself) while the editor is open
      await clickBlock(o, "question", fruit);
      area = o.page.locator(`${block("question", fruit)} .booklet-design-textarea`);
      await area.fill(fruitBlock.replace("Pick one.", "Pick my own.")); await sleep(150);
      const external = E0.replace("> Pick one.\n- [ ] Apple", "> Pick several.\n- [ ] Apple");
      fs.writeFileSync(every, external);
      await o.page.waitForFunction(() => { const v = app.workspace.getLeavesOfType("booklet-design")[0].view; return /Pick several/.test(v.getViewData()); }, null, { timeout: 8000 }).catch(() => {});
      await sleep(400);
      await o.page.locator(`${DV} .booklet-design-textarea`).focus();
      await o.page.keyboard.press("Control+Enter"); await sleep(700);
      const stale = await o.evaluate(() => ({ status: (document.querySelector(".workspace-leaf.mod-active .booklet-design-status") || {}).textContent, area: (document.querySelector(".workspace-leaf.mod-active .booklet-design-textarea") || {}).value || null }));
      c.ok(text(every) === external && /changed since this editor opened/.test(stale.status) && stale.area && stale.area.includes("Pick my own."), `a change made on disk meanwhile is refused as stale: the note is as the other writer left it, the status says "${stale.status}", and the typed text is still in the box`);
      await o.page.keyboard.press("Escape"); await o.page.keyboard.press("Escape"); await sleep(300);
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
      // the editor: a settings row then Save
      await clickBlock(o, "question", fruit);
      const titleIn = `${block("question", fruit)} .booklet-design-settings [data-field='title'] input`;
      await o.page.locator(titleIn).fill("Which fruit would you take?"); await o.page.locator(titleIn).press("Enter"); await sleep(400);
      c.ok(text(every) === E0 && (await md()) === E0, "a settings row changes the draft only: the file and the Markdown pane's buffer are as they were");
      await o.page.locator(`${DV} .booklet-design-save`).click();
      t = await agree("The editor's Save after a settings row", tx => tx !== E0); await idle(o);
      c.ok(linesDiffering(E0, t) === 1 && t.includes("> [!choice|fruit] Which fruit would you take?\n"), "Save changed that block's opening line and no other line (" + linesDiffering(E0, t) + " line differs)");
      await undoBtn(o).click(); t = await agree("Undo of the form", tx => tx === E0); await idle(o);
      // editor with Ctrl+Enter
      const fruitBlock = blockText(E0, "[!choice|fruit]");
      await clickBlock(o, "question", fruit);
      await o.page.locator(`${DV} .booklet-design-textarea`).fill(fruitBlock.replace("Pick one.", "Pick any.")); await sleep(150);
      await o.page.keyboard.press("Control+Enter");
      t = await agree("The text editor's Ctrl+Enter", tx => tx !== E0); await idle(o);
      c.ok(linesDiffering(E0, t) === 1 && t.includes("> Pick any."), "the editor changed the one line the user changed and no other");
      await undoBtn(o).click(); t = await agree("Undo of the editor save", tx => tx === E0); await idle(o);
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
      // a draft in the editor while the Markdown pane changes the note: the draft is kept, and Save is refused as stale when its own block changed
      await undoBtn(o).click(); await agree("Undo of the delete", tx => tx.includes("[!choice|fruit]")); await idle(o);
      const nowText = text(every), fr2 = lineOf(nowText, "[!choice|fruit]");
      await clickBlock(o, "question", fr2);
      await o.page.locator(`${DV} .booklet-design-textarea`).fill(blockText(nowText, "[!choice|fruit]").replace("Pick one.", "Pick my own.")); await sleep(150);
      await o.evaluate(n => { const ed = app.workspace.getLeavesOfType("markdown")[0].view.editor; const l = ed.getLine(n + 1); ed.replaceRange(" and more", { line: n + 1, ch: l.length }); }, fr2);
      await sleep(900);
      await o.page.locator(`${DV} .booklet-design-textarea`).focus();
      await o.page.keyboard.press("Control+Enter"); await sleep(800);
      const sd = await o.evaluate(() => ({ status: (document.querySelector(".workspace-leaf.mod-active .booklet-design-status") || {}).textContent, area: (document.querySelector(".workspace-leaf.mod-active .booklet-design-textarea") || {}).value || null }));
      c.ok(/changed since this editor opened/.test(sd.status) && !!sd.area && sd.area.includes("Pick my own.") && (await md()).includes("Pick one. and more"), `a change typed in the Markdown pane under an open draft: Save is refused as stale (${JSON.stringify(sd.status)}), the draft stays in the box and the typed words stay in the Markdown pane`);
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
      c.ok(st.editBox && st.editor, "the bar's Edit as Markdown opens the editor on the phone");
      await judge("the editor");
      await shot(o, "phone-editor-light");
      await o.setScheme("dark"); await sleep(500); await shot(o, "phone-editor-dark"); await o.setScheme("light"); await sleep(300);
      await o.page.locator(`${DV} .booklet-design-cancel`).click(); await sleep(300);
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
  const STRINGS_TS = path.join(SRC_VAULT, "..", "src", "core", "design-strings.ts");
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
        // the editor in place
        await goNav(o, "activity", KINDS);
        await clickBlock(o, "question", fruit);
        const eitems = await judge(`${tagWidth} editor`, "editor", tagWidth);
        const et = eitems.map(i => i.text);
        c.ok(et.includes(exp("editor.cancel")) && et.includes(exp("editor.save")), `${tagWidth}: the editor's buttons are ${JSON.stringify(exp("editor.cancel"))} and ${JSON.stringify(exp("editor.save"))}`);
        await o.page.keyboard.press("Escape"); await sleep(300);
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

  return { 64: check64, 65: check65, 66: check66, 67: check67, 68: check68, 69: check69, 70: check70, 71: check71 };
};
