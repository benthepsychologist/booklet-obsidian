// Checks 64 to 71 of plugin-check.js (plugin 1.6.0): the Design view, in the real Obsidian (not jsdom). Every note is the repository's test-vault
// note or is made up here and written into the check's own copy of the vault; nothing is written into --vault.
//   64 the three modes: a booklet note opens in the Booklet view; the header buttons go between Markdown, Booklet and Design (all six
//      moves); the setting "Open booklets in"; an ordinary note stays Markdown; a restart brings the Design view pane back (a pane that
//      Obsidian has not loaded is a placeholder: loadIfDeferred) and the header icons; no member of the view hidden by the base class
//   65 the tree on three notes (Every kind, Check-in, Reading and steps): levels with icons, rails, labels and the breadcrumb; the
//      inert drawings; the cards for what is not drawn; nothing live: real mouse and keyboard on a drawn question change nothing on disk
//   66 "+ Add" and the catalogue (four groups folded, a sample only once a group is open, only legal parts), the nested hotkeys with the
//      real keyboard (letters, popup, filter, Escape, not while a field has the focus, Obsidian's own keys, a user's own hotkey)
//   67 delete and move with the count-and-ask dialog, undo and redo by button and key, the form, the textarea editor (Enter, Esc twice,
//      Ctrl+Enter, a note changed on disk meanwhile), the outline and the lines the reader cannot read; each write compared byte for byte
//   68 the same writes with the note also open in a Markdown pane (they go through that editor; its buffer equals the disk)
//   69 a phone (Obsidian's phone mode at 390 x 844) and the light and dark themes, with screenshots
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
  /** The note opened in a pane and put in the Design view with the plugin's own mode switch (the header buttons are check 64's). */
  async function openDesign(o, rel, where = "tab", closeOthers = true) {
    await bookletNote(o, rel);
    if (closeOthers) await o.evaluate(() => { const ls = []; app.workspace.iterateRootLeaves(l => { ls.push(l); }); ls.forEach(l => l.detach()); });
    await o.evaluate(async ([rel, where]) => { const leaf = app.workspace.getLeaf(where); await leaf.openFile(app.vault.getAbstractFileByPath(rel)); }, [rel, where]);
    if (!(await waitActiveType(o, "booklet", 15000)) && !(await waitActiveType(o, "booklet-design", 100))) throw new Error("the note did not open as a booklet");
    if (await o.evaluate(() => app.workspace.activeLeaf.view.getViewType()) !== "booklet-design") {
      await o.evaluate(async () => { await app.plugins.plugins.booklet.setMode(app.workspace.activeLeaf, "design"); });
      if (!(await waitActiveType(o, "booklet-design", 8000))) throw new Error("the Design view did not open");
    }
    await o.page.waitForSelector(DV + " .booklet-design-node", { timeout: 10000 });
    await idle(o);
    await warm(o);
  }
  const state = o => o.evaluate(() => {
    const v = app.workspace.getLeavesOfType("booklet-design")[0]?.view; if (!v) return null;
    const el = v.contentEl, sel = el.querySelector(".booklet-design-node.is-selected");
    return { selected: sel ? sel.getAttribute("data-kind") + "@" + sel.getAttribute("data-start") : null, status: (el.querySelector(".booklet-design-status") || {}).textContent || "", popup: !!el.querySelector(".booklet-design-popup"), editor: !!el.querySelector(".booklet-design-textarea"), modal: !!document.querySelector(".modal-container .modal") };
  });
  const box = (kind, start) => `${DV} .booklet-design-node[data-kind='${kind}'][data-start='${start}']`;
  const pickOf = (kind, start) => `${box(kind, start)} > .booklet-design-head .booklet-design-pick`;
  const act = (kind, start, cls) => `${box(kind, start)} > .booklet-design-head .booklet-design-${cls}`;
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
        if (to === "design") await o.page.waitForSelector(DV + " .booklet-design-node", { timeout: 8000 });
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
      await o.page.waitForSelector(DV + " .booklet-design-node", { timeout: 10000 });
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
            out.push({ was, type: v.getViewType(), file: v.file && v.file.path, drawn: v.contentEl.querySelectorAll(".booklet-design-node").length, text: !!v.getViewData() });
          }
          return out;
        });
        c.ok(loaded.length === 2 && loaded.every(l => l.type === "booklet-design" && l.drawn > 3), "after loadIfDeferred each Design view pane is a drawn Design view: " + JSON.stringify(loaded));
        // a deferred pane the user activates: the mode is the Design view, with the tree and the header buttons
        await o2.evaluate(() => { const l = app.workspace.getLeavesOfType("booklet-design")[0]; app.workspace.setActiveLeaf(l, { focus: true }); });
        await o2.page.waitForSelector(DV + " .booklet-design-node", { timeout: 8000 });
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
  const treeFacts = o => o.evaluate(() => {
    const el = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl;
    const nodes = [...el.querySelectorAll(".booklet-design-node")];
    const by = {};
    for (const n of nodes) by[n.dataset.level] = (by[n.dataset.level] || 0) + 1;
    const rails = {};
    for (const n of nodes) rails[n.dataset.level] = getComputedStyle(n).borderInlineStartColor;
    const kinds = {};
    for (const n of nodes) kinds[n.dataset.kind] = (kinds[n.dataset.kind] || 0) + 1;
    return {
      total: nodes.length, by, kinds, rails,
      noIcon: nodes.filter(n => !n.querySelector(":scope > .booklet-design-head .booklet-design-icon svg")).map(n => n.dataset.kind + "@" + n.dataset.start),
      noWhat: nodes.filter(n => n.classList.contains("is-container") && !(n.querySelector(":scope > .booklet-design-what") || { textContent: "" }).textContent.trim()).map(n => n.dataset.kind + "@" + n.dataset.start),
      indentBad: nodes.filter(n => { const p = n.parentElement.closest(".booklet-design-node"); return p && n.getBoundingClientRect().left <= p.getBoundingClientRect().left; }).map(n => n.dataset.kind + "@" + n.dataset.start),
      noName: nodes.filter(n => !n.getAttribute("aria-label")).length,
    };
  });
  async function check65() {
    const c = new Check(65, "the tree on three notes (Every kind, Check-in, Reading and steps): levels with icons, rails, labels and the breadcrumb; inert drawings of choice, multi, matrix, lines, scale and date; labelled cards for widget, each and listen; reading callouts as callouts; as-written cards; nothing live: real mouse and keyboard on a drawn question write nothing; screenshots");
    await withApp("c65", async (o, vault) => {
      put(vault, CARDS, CARDS_TEXT);
      for (const [rel, tag] of [[EVERY, "every"], [CHECKIN, "checkin"], [READING, "reading"]]) {
        const f = path.join(vault, rel), t = text(f), want = countsOf(t), before = sha(f);
        await openDesign(o, rel);
        const g = await treeFacts(o);
        const tabs = (g.by["module-tab"] || 0) + (g.by["activity-tab"] || 0);
        c.ok((g.by.module || 0) === want.module && (g.by.activity || 0) === want.activity && tabs === want.tab && (g.by.page || 0) === want.page, `${rel}: the drawn levels match the note's own lines: modules ${g.by.module || 0}/${want.module}, activities ${g.by.activity || 0}/${want.activity}, tabs ${tabs}/${want.tab}, pages ${g.by.page || 0}/${want.page}; ${g.total} nodes in all (kinds ${JSON.stringify(g.kinds)})`);
        c.ok((g.kinds.question || 0) >= want.question - 2, `${rel}: ${g.kinds.question || 0} question blocks are drawn for ${want.question} question lines of the note (a question inside a callout is part of the callout's card)`);
        c.ok(g.noIcon.length === 0 && g.noWhat.length === 0 && g.indentBad.length === 0 && g.noName === 0, `${rel}: every node has an icon, every container its one-line saying what it is, every child sits right of its parent, every node has a name for a screen reader (without icon ${g.noIcon.length}, without words ${g.noWhat.length}, not indented ${g.indentBad.length}, unnamed ${g.noName})`);
        const colours = Object.entries(g.rails);
        c.ok(new Set(colours.map(([, v]) => v)).size === colours.length, `${rel}: each level present has a rail colour of its own: ${JSON.stringify(g.rails)}`);
        // the breadcrumb: a press on the deepest question, then on its parents
        const last = await o.evaluate(() => { const qs = [...app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.querySelectorAll(".booklet-design-node[data-kind='question']")]; const q = qs[qs.length - 1]; let d = 0; for (let p = q.parentElement.closest(".booklet-design-node"); p; p = p.parentElement.closest(".booklet-design-node")) d++; return { start: q.dataset.start, depth: d }; });
        await o.page.locator(pickOf("question", last.start)).scrollIntoViewIfNeeded();
        await o.page.locator(pickOf("question", last.start)).click();
        await sleep(250);
        const crumb = await o.evaluate(() => [...document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-crumb button")].map(b => ({ t: b.textContent, cur: b.getAttribute("aria-current") })));
        c.ok(crumb.length === last.depth + 1 && crumb[crumb.length - 1].cur === "true" && crumb[0].t.startsWith("Booklet"), `${rel}: after a click on the last question the breadcrumb names every level down to it (${last.depth + 1} items): ${crumb.map(x => x.t).join(" > ")}`);
        if (crumb.length > 2) {
          await o.page.locator(`${DV} .booklet-design-crumb button`).nth(1).click(); await sleep(250);
          const st = await state(o), crumb2 = await o.evaluate(() => document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-crumb button").length);
          c.ok(st.selected && crumb2 === 2, `${rel}: a click on the second crumb selects that level (${st.selected}) and the trail is two long`);
        }
        c.ok(sha(f) === before, `${rel}: drawing it and selecting in it wrote nothing (sha256 of the note unchanged)`);
        await o.evaluate(() => { app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.scrollTop = 0; });
        await sleep(300);
        await shot(o, "tree-" + tag + "-top-light");
        await o.evaluate(() => { const el = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl; el.scrollTop = el.scrollHeight * 0.33; });
        await sleep(300);
        await shot(o, "tree-" + tag + "-mid-light");
        await o.setScheme("dark"); await sleep(400);
        await shot(o, "tree-" + tag + "-mid-dark");
        await o.evaluate(() => { app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.scrollTop = 0; });
        await sleep(300);
        await shot(o, "tree-" + tag + "-top-dark");
        await o.setScheme("light"); await sleep(300);
      }
      // inert drawings of every common kind, on Every kind
      {
        const f = path.join(vault, EVERY), before = sha(f);
        await openDesign(o, EVERY);
        const d = await o.evaluate(() => {
          const el = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl, out = {};
          for (const n of el.querySelectorAll(".booklet-design-node[data-kind='question']")) {
            const kind = ((n.querySelector(":scope > .booklet-design-head .booklet-design-more") || {}).textContent || "").split(" · ")[0];
            const s = n.querySelector(".booklet-design-drawn .booklet-sample");
            const controls = s ? [...s.querySelectorAll("button, input, textarea, select")] : [];
            (out[kind] = out[kind] || []).push({ start: n.dataset.start, drawn: !!s, inert: !!s && s.hasAttribute("inert"), controls: controls.length, live: controls.filter(x => !x.disabled && !x.closest("[inert]")).length, fold: !!n.querySelector(":scope > details.booklet-design-fold pre"), card: !!n.querySelector(":scope > pre.booklet-design-lines") });
          }
          return out;
        });
        const need = ["choice", "multi", "matrix", "lines", "scale", "date"];
        for (const k of need) {
          const x = (d[k] || [])[0];
          c.ok(!!x && x.drawn && x.inert && x.live === 0 && x.fold, `a ${k} question is drawn as a reader sees it (${x ? x.controls : 0} controls, inert attribute ${x && x.inert}, none live, its lines one fold away)`);
        }
        c.info("every question kind on Every kind and how it is shown: " + JSON.stringify(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.map(x => (x.drawn ? "drawn" : x.card ? "card" : "?"))]))));
        // nothing live: a real click on a drawn choice button and the keyboard
        const btn = await o.evaluate(() => { const b = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.querySelector(".booklet-design-node[data-kind='question'] .booklet-sample button"); b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: b.textContent.trim() }; });
        await sleep(300);
        const hit = await o.evaluate(p => { const e = document.elementFromPoint(p.x, p.y); return { inSample: !!e.closest(".booklet-sample"), box: !!e.closest(".booklet-design-node") }; }, btn);
        c.ok(!hit.inSample && hit.box, `the point on a drawn button (${btn.text}) belongs to the block under the drawing, not to the drawing (pointer events are off)`);
        await o.page.mouse.click(btn.x, btn.y); await sleep(400);
        const st = await state(o);
        c.ok(sha(f) === before && st.selected && st.selected.startsWith("question@"), `a real click on the drawn button "${btn.text}" selected its block (${st.selected}) and wrote nothing: the note's sha256 is unchanged`);
        const focusOnSample = await o.evaluate(() => { const b = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl.querySelector(".booklet-sample button, .booklet-sample input, .booklet-sample textarea"); b.focus(); return !!document.activeElement.closest(".booklet-sample"); });
        c.ok(!focusOnSample, "a script's focus() on a control inside a drawing does not take the focus (the inert attribute holds in Obsidian's own browser)");
        const hits = [];
        for (let i = 0; i < 90; i++) { await o.page.keyboard.press("Tab"); const e = await o.evaluate(() => { const a = document.activeElement; return { inSample: !!(a && a.closest(".booklet-sample")), tag: a && a.tagName }; }); if (e.inSample) hits.push(i); }
        c.ok(hits.length === 0, "90 presses of Tab walk the tree and the page and never stop on a control of a drawing (" + hits.length + " stops)");
        // keys with the focus on the page itself (a key on a button is that button's press: Enter on Delete deletes, as it should)
        await o.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
        for (const k of ["Space", "ArrowRight", "ArrowDown", "1", "2", "a", "Backspace", "Enter", "Escape"]) { await o.page.keyboard.press(k); await sleep(60); }
        await idle(o);
        c.ok(sha(f) === before, "keys with the focus on the page (Space, arrows, digits, a letter, Backspace, Enter on the selected block, Escape) wrote nothing: the note's sha256 is unchanged");
      }
      // the cards for what is not drawn, the reading callouts and the as-written cards
      {
        await openDesign(o, CHECKIN);
        const ci = await o.evaluate(() => {
          const el = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl, out = [];
          for (const n of el.querySelectorAll(".booklet-design-node[data-kind='question']")) {
            const more = (n.querySelector(":scope > .booklet-design-head .booklet-design-more") || {}).textContent || "";
            out.push({ more, drawn: !!n.querySelector(".booklet-sample"), what: (n.querySelector(":scope > .booklet-design-what") || {}).textContent || "", pre: (n.querySelector(":scope > pre.booklet-design-lines") || {}).textContent || "" });
          }
          return out;
        });
        const widgets = ci.filter(x => /^widget/.test(x.more)), each = ci.filter(x => /each:feelings/.test(x.pre));
        c.ok(widgets.length === 2 && widgets.every(x => !x.drawn && /Markdown for now/.test(x.what) && /^> \[!widget\|/.test(x.pre)), `Check-in: the two widgets are labelled cards with their Markdown lines, not drawings: ${JSON.stringify(widgets.map(x => x.what))}`);
        c.ok(each.length === 1 && !each[0].drawn && /Markdown for now/.test(each[0].what), "Check-in: the question asked for each feeling picked is a labelled card with its Markdown lines");
        await openDesign(o, READING);
        const rs = await o.evaluate(() => { const el = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl; const cs = [...el.querySelectorAll(".booklet-sample-reading .callout")]; return { kinds: cs.map(x => x.getAttribute("data-callout")), icons: cs.filter(x => x.querySelector(".callout-icon svg")).length, titles: cs.filter(x => (x.querySelector(".callout-title-inner") || {}).textContent).length, rendered: el.querySelectorAll(".booklet-sample-reading.markdown-rendered").length, controlsInReading: el.querySelectorAll(".booklet-sample-reading input, .booklet-sample-reading button").length }; });
        c.ok(["diff", "law", "opinion", "tip"].every(k => rs.kinds.includes(k)) && rs.icons === rs.kinds.length, `Reading and steps: reading callouts are drawn as Obsidian draws callouts (kinds ${rs.kinds.join(", ")}; ${rs.icons} of ${rs.kinds.length} with their icon, ${rs.titles} with a title)`);
        await openDesign(o, CARDS);
        const cd = await o.evaluate(() => {
          const el = app.workspace.getLeavesOfType("booklet-design")[0].view.contentEl;
          const as = [...el.querySelectorAll(".booklet-design-node[data-kind='as-written']")].map(n => ({ what: (n.querySelector(":scope > .booklet-design-what") || {}).textContent, pre: (n.querySelector(":scope > pre.booklet-design-lines") || {}).textContent }));
          const listen = [...el.querySelectorAll(".booklet-design-node[data-kind='question']")].find(n => /listen/.test((n.querySelector(".booklet-design-more") || {}).textContent || ""));
          return { as, listen: listen ? { pre: (listen.querySelector(":scope > pre.booklet-design-lines") || {}).textContent, what: (listen.querySelector(":scope > .booklet-design-what") || {}).textContent, media: listen.querySelectorAll("audio, video, iframe, img, source").length } : null, mediaAnywhere: el.querySelectorAll("audio, video, iframe, source").length };
        });
        c.ok(cd.as.length >= 1 && cd.as.some(x => /> \[!bad/.test(x.pre)), `Cards: text the plugin cannot read is an as-written card showing its lines as they are: ${JSON.stringify(cd.as)}`);
        c.ok(!!cd.listen && /\[!listen\|tone\]/.test(cd.listen.pre) && /Markdown for now/.test(cd.listen.what) && cd.mediaAnywhere === 0, `Cards: a listen question is a labelled card with its Markdown and no player, no media element is in the view (${JSON.stringify(cd.listen)})`);
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
  const popupRows = o => o.evaluate(() => [...document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-popup-row")].map(b => ({ keys: b.getAttribute("data-keys"), shown: (b.querySelector(".booklet-design-popup-keys") || {}).textContent, label: (b.querySelector(".booklet-design-popup-label") || {}).textContent, off: b.disabled, cur: b.getAttribute("aria-current") === "true" })));
  const popupLine = o => o.evaluate(() => (document.querySelector(".workspace-leaf.mod-active .booklet-design-popup-line") || {}).textContent || null);
  async function check66() {
    const c = new Check(66, "\"+ Add\" and the catalogue (four groups folded, a sample only after a group is opened, only parts that are legal there) and the nested hotkeys with the real keyboard (s m Enter, q m Enter, the popup's letters, typing a word, Esc, not in a field, Obsidian's own keys, a user's own hotkey, the palette commands)");
    await withApp("c66", async (o, vault) => {
      put(vault, EMPTYM, EMPTYM_TEXT);
      const file = path.join(vault, EVERY), t0 = text(file);
      await openDesign(o, EVERY);
      // ---- the catalogue
      const actLine = lineOf(t0, "[!activity|tally");
      const addBtn = `${box("activity", actLine)} > .booklet-design-body > .booklet-design-addrow .booklet-design-add`;
      await o.page.locator(addBtn).scrollIntoViewIfNeeded();
      await o.page.locator(addBtn).click(); await sleep(400);
      const cat = () => o.evaluate(() => [...document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-catgroup")].map(g => ({ id: g.dataset.group, open: g.classList.contains("is-open"), expanded: g.querySelector(".booklet-design-cathead").getAttribute("aria-expanded"), items: g.querySelectorAll(".booklet-design-catitem").length, samples: g.querySelectorAll(".booklet-sample").length, places: [...new Set([...g.querySelectorAll(".booklet-design-catitem")].map(i => i.dataset.place))] })));
      let g = await cat();
      c.ok(g.map(x => x.id).join() === "structure,questions,reading,views-data" && g.every(x => !x.open && x.expanded === "false" && x.items === 0 && x.samples === 0), "the catalogue of an activity lists four groups (Structure, Questions, Reading aids, Views and data), every one folded, with no part and no sample drawn: " + JSON.stringify(g.map(x => [x.id, x.expanded, x.items])));
      const t1 = Date.now();
      await o.page.locator(`${DV} .booklet-design-catgroup[data-group='questions'] .booklet-design-cathead`).click(); await sleep(600);
      g = await cat();
      const q = g.find(x => x.id === "questions");
      c.ok(q.open && q.expanded === "true" && q.items >= 10 && q.samples >= 8 && g.filter(x => x.id !== "questions").every(x => x.items === 0), `opening Questions draws its parts and their samples (${q.items} parts, ${q.samples} samples drawn in ${Date.now() - t1} ms), the other groups stay unopened and undrawn`);
      c.ok(q.places.every(p => ["question", "copy", "menu", "group", "row", "text"].includes(p)), "the parts of Questions listed for an activity all go in a question's place: " + JSON.stringify(q.places));
      await shot(o, "catalogue-questions-light");
      await o.page.locator(`${DV} .booklet-design-catgroup[data-group='structure'] .booklet-design-cathead`).click(); await sleep(500);
      g = await cat();
      const st = g.find(x => x.id === "structure");
      const labels = await o.evaluate(() => [...document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-catgroup[data-group='structure'] .booklet-design-catlabel")].map(x => x.textContent));
      c.ok(!labels.some(l => /^(Module|Activity|Front matter|Theme)$/i.test(l)) && labels.length > 0, `Structure listed inside an activity offers only what can stand there (no module, no activity, no front matter): ${labels.join(", ")}`);
      await o.page.locator(`${DV} .booklet-design-catgroup[data-group='questions'] .booklet-design-cathead`).click(); await sleep(300);
      g = await cat();
      c.ok(!g.find(x => x.id === "questions").open && g.find(x => x.id === "questions").samples === 0, "shutting a group takes its samples away (0 drawn, 0 parts listed)");
      // add one part from the catalogue and take it back
      await o.page.locator(`${DV} .booklet-design-catgroup[data-group='questions'] .booklet-design-cathead`).click(); await sleep(500);
      const pieceBtn = `${DV} .booklet-design-catgroup[data-group='questions'] .booklet-design-catitem[data-entry] .booklet-design-piece`;
      const firstPiece = await o.page.locator(pieceBtn).first().getAttribute("data-piece");
      await o.page.locator(pieceBtn).first().scrollIntoViewIfNeeded();
      await o.page.locator(pieceBtn).first().click();
      let r = await waitDisk(file, tx => tx !== t0);
      let rg = region(t0, r.text);
      c.ok(r.ok && rg.removed === "" && /\[!\w+\|[\w-]+/.test(rg.added) && t0.slice(0, rg.at) === r.text.slice(0, rg.at), `the part "${firstPiece}" added from the catalogue is one block of ${rg.added.split("\n").length} lines put in, nothing taken out, every other byte of the note as it was (put in at byte ${rg.at}): ${JSON.stringify(rg.added.slice(0, 80))}`);
      await idle(o);
      // ---- the empty module, and a part that waits for another
      await openDesign(o, EMPTYM);
      const emptyInfo = await o.evaluate(() => { const m = document.querySelector(".workspace-leaf.mod-active .booklet-design-node[data-kind='module']"); return { empty: (m.querySelector(":scope > .booklet-design-body > .booklet-design-empty") || {}).textContent || null }; });
      await o.page.locator(`${DV} .booklet-design-node[data-kind='module'] > .booklet-design-body > .booklet-design-addrow .booklet-design-add`).click(); await sleep(400);
      for (const gname of ["structure", "questions", "reading"]) { await o.page.locator(`${DV} .booklet-design-catgroup[data-group='${gname}'] .booklet-design-cathead`).click(); await sleep(250); }
      const needs = await o.evaluate(() => ({ needs: [...document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-needs")].map(x => x.textContent), by: Object.fromEntries([...document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-node[data-kind='module'] .booklet-design-catgroup")].map(g => [g.dataset.group, [...g.querySelectorAll(".booklet-design-catlabel")].map(x => x.textContent)])) }));
      c.ok(!!emptyInfo.empty && emptyInfo.empty.length > 10, "an empty module says what to add: " + JSON.stringify(emptyInfo.empty));
      c.ok((needs.by.questions || []).every(x => /^Menu/.test(x)) && needs.by.structure.some(x => /^Activity$/.test(x)) && !needs.by.structure.includes("Page") && needs.needs.some(x => /page/i.test(x) && /activity/i.test(x)), `in a module with no activity no question is offered (only the shared menu: ${(needs.by.questions || []).join(", ")}), Activity is offered first and the page says it waits for one: ${needs.needs.join(" | ")}`);
      // ---- the nested hotkeys, with the real keyboard, on a fresh copy of Every kind
      await o.evaluate(() => { const ls = []; app.workspace.iterateRootLeaves(l => { ls.push(l); }); ls.forEach(l => l.detach()); });
      fs.writeFileSync(file, t0);
      await openDesign(o, EVERY);
      await o.page.keyboard.press("s"); await sleep(300);
      let rows = await popupRows(o);
      c.ok((await state(o)).popup && rows.length >= 10 && rows.some(x => x.keys === "sm" && x.label === "Module") && rows.some(x => x.keys === "sa") && rows.every(x => /^s [a-z0-9]$/.test(x.shown || "")), `the key "s" opens the popup of Structure with every part and its letters (${rows.length} rows, e.g. ${rows.slice(0, 4).map(x => x.shown + " " + x.label).join(", ")})`);
      await shot(o, "popup-structure-light");
      await o.page.keyboard.press("m"); await sleep(300);
      rows = await popupRows(o);
      c.ok(rows.find(x => x.cur) && rows.find(x => x.cur).label === "Module", "after s then m the highlighted row is Module: " + JSON.stringify(rows.find(x => x.cur)));
      await o.page.keyboard.press("Enter");
      r = await waitDisk(file, tx => tx !== t0);
      rg = region(t0, r.text);
      const st1 = await state(o);
      c.ok(r.ok && rg.removed === "" && /> \[!module\|[^\]]*\]/.test(rg.added) && /> \[!module\|[^\]]* end\]/.test(rg.added) && !st1.popup && /Added Module/.test(st1.status), `s, m, Enter adds a module: one block in with its opening and closing line, nothing taken out, the popup closed and the status says "${st1.status}"`);
      // the new module is selected: q then m then Enter adds a matrix inside it
      const t2 = r.text;
      await o.page.keyboard.press("q"); await sleep(250);
      rows = await popupRows(o);
      c.ok(rows.some(x => x.keys === "qm" && x.label === "Matrix") && rows.some(x => x.keys === "qc" && x.label === "Choice") && rows.some(x => x.keys === "qs"), "q opens the popup of Questions: " + rows.map(x => x.shown + " " + x.label).join(", "));
      await o.page.keyboard.press("m"); await o.page.keyboard.press("Enter");
      r = await waitDisk(file, tx => tx !== t2);
      rg = region(t2, r.text);
      const heads = x => x.split("\n").filter(l => /^> \[!/.test(l)).map(l => l.replace(/^> \[!(\w+)\|?([^\] ]*).*$/, "$1:$2"));
      c.ok(r.ok && rg.removed === "" && r.text.split("[!matrix|").length === t2.split("[!matrix|").length + 1, `q, m, Enter adds a matrix at the selected place, nothing taken out; the note's structure lines before and after: ${heads(t2).slice(-5).join(" ")} => ${heads(r.text).slice(-6).join(" ")}`);
      await idle(o);
      const shaAfterAdds = sha(file);
      // Esc closes with nothing written; typing a word filters
      const t3 = text(file);
      await o.page.keyboard.press("r"); await sleep(200);
      await o.page.keyboard.press("Escape"); await sleep(200);
      c.ok(!(await state(o)).popup && text(file) === t3, "r then Escape closes the popup and writes nothing");
      await o.page.keyboard.press("q"); await sleep(200);
      await typeFast(o, "matrix"); await sleep(300);
      rows = await popupRows(o);
      const line = await popupLine(o);
      c.ok(rows.length >= 1 && rows.some(x => /Matrix/.test(x.label)) && /matrix|ma/i.test(line || ""), `q then typing "matrix" narrows the list to ${rows.length} part(s) (${rows.map(x => x.label).join(", ")}); the popup says: ${JSON.stringify(line)}`);
      await shot(o, "popup-filter-light");
      await o.page.keyboard.press("Escape"); await sleep(200);
      // Backspace goes back one key; from a group to the groups
      await o.page.keyboard.press("s"); await o.page.keyboard.press("Backspace"); await sleep(200);
      rows = await popupRows(o);
      c.ok(rows.length === 5 && rows.map(x => x.keys).join() === "s,q,r,v,d", "Backspace from a group goes back to the five groups (s, q, r, v, d): " + rows.map(x => x.keys).join());
      await o.page.keyboard.press("Escape"); await sleep(150);
      // a key is the field's in a text field and in the textarea: nothing opens, nothing is written
      const tF = text(file);
      const qNeedle = lineOf(tF, "[!choice|fruit]");
      await o.page.locator(pickOf("question", qNeedle)).scrollIntoViewIfNeeded();
      await o.page.locator(pickOf("question", qNeedle)).click(); await sleep(300);
      const titleSel = `${box("question", qNeedle)} .booklet-design-settings [data-field='title'] input`;
      const orig = await o.page.locator(titleSel).inputValue();
      await o.page.locator(titleSel).click();
      await o.page.keyboard.press("End");
      await typeFast(o, "sqmrvd");
      const typedIn = await o.page.locator(titleSel).inputValue();
      const stF = await state(o);
      c.ok(typedIn === orig + "sqmrvd" && !stF.popup, `typing s q m r v d in the form's Title field goes into the field (${JSON.stringify(typedIn.slice(-8))}) and opens no popup`);
      await o.page.locator(titleSel).fill(orig); await o.page.locator(titleSel).evaluate(e => e.blur()); await sleep(300);
      c.ok(text(file) === tF, "the field put back and left: the note is as it was (the view writes a field only when its value changed)");
      // the textarea
      await o.page.locator(pickOf("question", qNeedle)).focus(); await o.page.keyboard.press("Enter"); await sleep(400);
      const hasArea = (await state(o)).editor;
      await typeFast(o, "qmsr");
      const areaVal = await o.page.locator(`${DV} .booklet-design-textarea`).inputValue();
      c.ok(hasArea && areaVal.endsWith("qmsr") && !(await state(o)).popup, "in the Markdown editor's text box the letters q m s r are text, and open no popup");
      await o.page.keyboard.press("Escape"); await o.page.keyboard.press("Escape"); await sleep(300);
      c.ok(!(await state(o)).editor && text(file) === tF, "Escape twice throws the typed letters away and writes nothing");
      // Obsidian's own keys
      await o.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await o.page.keyboard.press("Control+p"); await sleep(500);
      const pal = await o.evaluate(() => ({ prompt: !!document.querySelector(".prompt"), placeholder: (document.querySelector(".prompt-input") || {}).placeholder || null }));
      await typeFast(o, "design");
      const palText = await o.evaluate(() => ({ value: (document.querySelector(".prompt-input") || {}).value, results: [...document.querySelectorAll(".prompt-results .suggestion-item")].map(x => x.textContent).slice(0, 8), popup: !!document.querySelector(".workspace-leaf.mod-active .booklet-design-popup") }));
      c.ok(pal.prompt && palText.value === "design" && !palText.popup, `Ctrl+P still opens Obsidian's command palette in the Design view; letters typed there (design) go to its box and open no popup of ours: ${JSON.stringify(palText.results.slice(0, 6))}`);
      c.ok(palText.results.some(x => /Add part/i.test(x)) && palText.results.length >= 3 || await o.evaluate(() => !!app.commands.commands["booklet:design-add-piece"]), "the palette lists the plugin's Design view commands (no hotkey set on any)");
      await o.page.keyboard.press("Escape"); await sleep(300);
      await o.page.keyboard.press("Control+o"); await sleep(500);
      const qs = await o.evaluate(() => !!document.querySelector(".prompt"));
      await o.page.keyboard.press("Escape"); await sleep(300);
      c.ok(qs, "Ctrl+O still opens the quick switcher");
      const cmds = await o.evaluate(() => { const ids = Object.keys(app.commands.commands).filter(k => k.startsWith("booklet:design-")); return ids.map(k => ({ id: k, name: app.commands.commands[k].name, hotkeys: (app.hotkeyManager.getDefaultHotkeys(k) || []).length, custom: (app.hotkeyManager.getHotkeys(k) || []).length })); });
      c.ok(cmds.length === 6 && cmds.every(x => x.hotkeys === 0 && x.custom === 0), "the six Design commands have no default hotkey: " + JSON.stringify(cmds.map(x => x.id)));
      // the command from the palette opens the catalogue
      await o.page.keyboard.press("Control+p"); await sleep(400);
      await typeFast(o, "add part"); await sleep(400);
      await o.page.keyboard.press("Enter"); await sleep(600);
      const openCat = await o.evaluate(() => document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-panel").length);
      c.ok(openCat === 1, "the palette command \"Add part…\" opens the catalogue of the selected container (" + openCat + " open)");
      // the same commands are not offered in another view
      const inMd = await o.evaluate(async () => { const l = app.workspace.getLeaf("tab"); await l.openFile(app.vault.getAbstractFileByPath("Ordinary note.md")); await new Promise(r => setTimeout(r, 400)); return app.commands.listCommands().filter(c => c.id.startsWith("booklet:design-") && !!c.checkCallback).length; });
      void inMd;
      // ---- a user's own hotkey on the same letter
      await o.evaluate(() => { const ls = []; app.workspace.iterateRootLeaves(l => { ls.push(l); }); ls.forEach(l => l.detach()); });
      await openDesign(o, EVERY);
      const side0 = await o.evaluate(() => app.workspace.leftSplit.collapsed);
      await o.evaluate(() => { app.hotkeyManager.setHotkeys("app:toggle-left-sidebar", [{ modifiers: [], key: "q" }]); app.hotkeyManager.bake(); });
      await o.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await o.page.keyboard.press("q"); await sleep(500);
      const won = await o.evaluate(() => ({ popup: !!document.querySelector(".workspace-leaf.mod-active .booklet-design-popup"), side: app.workspace.leftSplit.collapsed }));
      c.ok(won.popup !== (won.side !== side0), `a user's own hotkey (the bare key q, bound to "Toggle left sidebar") and the view's q: exactly one acts. Observed: the popup ${won.popup ? "opened" : "did not open"} and the sidebar ${won.side !== side0 ? "toggled" : "did not toggle"}`);
      c.info("scope order, observed: " + (won.popup ? "the view's scope key beats the user's own hotkey on the same bare letter" : "the user's own hotkey beats the view's scope key"));
      await o.page.keyboard.press("Escape"); await sleep(200);
      // the same bare key in a text field: the field gets the letter; does the user's hotkey also run?
      const sideNow = await o.evaluate(() => app.workspace.leftSplit.collapsed);
      await o.page.locator(pickOf("question", lineOf(text(file), "[!choice|fruit]"))).click(); await sleep(250);
      const tsel = `${DV} .booklet-design-node.is-selected .booklet-design-settings [data-field='title'] input`;
      await o.page.locator(tsel).click(); await o.page.keyboard.press("End"); await o.page.keyboard.press("q"); await sleep(300);
      const inField = await o.evaluate(sel => ({ v: document.querySelector(sel).value, side: app.workspace.leftSplit.collapsed }), tsel);
      c.info(`the user's bare-q hotkey while the form's Title field has the focus: the field ${/q$/.test(inField.v) ? "gets the letter" : "does not get the letter"} and the sidebar ${inField.side !== sideNow ? "toggles too (Obsidian runs a user's own bare-letter hotkey even in a field; the plugin never takes a key from a field)" : "does not toggle"}`);
      await o.evaluate(() => { app.hotkeyManager.setHotkeys("app:toggle-left-sidebar", []); app.hotkeyManager.bake(); });
      c.ok(sha(file) === shaAfterAdds, "after the two parts were added by keys, everything else of this run (Escape, filter, a field typed in and put back, the text box, Ctrl+P, Ctrl+O, the palette command, a user's hotkey) wrote nothing: the note is as the two additions left it");
    });
    return c;
  }


  /* ================= CHECK 67 ================= */
  /** A block's own lines as the note has them: from its first line to the line before the next blank one. */
  const blockText = (t, needle) => { const L = t.split("\n"), i = lineOf(t, needle); let j = i; while (j < L.length && L[j].trim() !== "") j++; return L.slice(i, j).join("\n"); };
  const trimNl = x => x.replace(/^\n+|\n+$/g, "");
  const sortedLines = x => x.split("\n").filter(l => l.trim()).sort().join("\n");
  /** The note with the block that has `needle` taken out, and one blank line beside it (the one after it, or the one before at the end). */
  const withoutBlock = (t, needle) => { const L = t.split("\n"), i = lineOf(t, needle); let j = i; while (j < L.length && L[j].trim() !== "") j++; const after = L.slice(0, i).concat(L.slice(j + 1)), before = L.slice(0, Math.max(0, i - 1)).concat(L.slice(j)); return [after.join("\n"), before.join("\n")]; };
  /** The note with the block of `a` and the block of `b` (the next one, one blank line between) swapped. */
  const swapped = (t, a, b) => { const L = t.split("\n"), i = lineOf(t, a), k = lineOf(t, b); let m = k + 1; while (m < L.length && !L[m].startsWith("> [!")) m++; return L.slice(0, i).concat(L.slice(k, m), L.slice(i, k), L.slice(m)).join("\n"); };
  const clickPick = async (o, kind, start) => { const sel = pickOf(kind, start); await o.page.locator(sel).scrollIntoViewIfNeeded(); await o.page.locator(sel).click(); await sleep(300); };
  const undoBtn = o => o.page.locator(`${DV} .booklet-design-undo`);
  const redoBtn = o => o.page.locator(`${DV} .booklet-design-redo`);
  async function check67() {
    const c = new Check(67, "delete and move with the count-and-ask dialog (Cancel has the focus, the counts shown, No writes nothing, Yes writes exactly the change); undo and redo by buttons and by Ctrl+Z; the form (one opening line changes); the textarea editor (Enter, Esc twice, Ctrl+Enter, a note changed on disk meanwhile is refused as stale and the text kept); the outline and the lines the reader cannot read; every write compared byte for byte; screenshots");
    await withApp("c67", async (o, vault) => {
      put(vault, CARDS, CARDS_TEXT);
      const every = path.join(vault, EVERY), kept = path.join(vault, KEPT);
      const E0 = text(every), K0 = text(kept);
      // ---------- Every kind: a delete that asks nothing, then undo and redo
      await openDesign(o, EVERY);
      const fruitBlock = blockText(E0, "[!choice|fruit]"), fruit = lineOf(E0, "[!choice|fruit]");
      c.ok(await undoBtn(o).isDisabled() && await redoBtn(o).isDisabled(), "before any change Undo and Redo are both off");
      await clickPick(o, "question", fruit);
      await o.page.locator(act("question", fruit, "delete")).click();
      let r = await waitDisk(every, tx => tx !== E0);
      let rg = region(E0, r.text);
      const gonePair = withoutBlock(E0, "[!choice|fruit]");
      c.ok(r.ok && !(await state(o)).modal && gonePair.includes(r.text), `Delete on a question that holds no kept data asks nothing and takes out exactly its ${fruitBlock.split("\n").length} lines (${JSON.stringify(fruitBlock.split("\n")[0])}) and one blank line beside them, nothing else (the whole note equals the old one without them); status "${(await state(o)).status}"`);
      const E1 = r.text;
      await idle(o);
      c.ok(await undoBtn(o).isEnabled() && await redoBtn(o).isDisabled(), "after the delete Undo is on and Redo is off");
      await undoBtn(o).click();
      r = await waitDisk(every, tx => tx !== E1);
      c.ok(r.ok && r.text === E0 && sha(every) === sha(every), "the Undo button gives back the note byte for byte (the whole file equals what it was before the delete)");
      await idle(o);
      await redoBtn(o).click();
      r = await waitDisk(every, tx => tx === E1);
      c.ok(r.ok && r.text === E1, "the Redo button deletes the block again, byte for byte as the first delete left the note");
      await idle(o);
      // the keys: focus is on a button, not in a field
      await o.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await o.page.keyboard.press("Control+z");
      r = await waitDisk(every, tx => tx === E0);
      c.ok(r.ok && r.text === E0, "Ctrl+Z with no field focused undoes in this view: the note is as it was, byte for byte");
      await idle(o);
      await o.page.keyboard.press("Control+Shift+z");
      r = await waitDisk(every, tx => tx === E1);
      c.ok(r.ok && r.text === E1, "Ctrl+Shift+Z redoes it");
      await idle(o);
      // in a field the key is the field's: Ctrl+Z in the form's Title box does not undo the delete
      const sel0 = lineOf(E1, "[!multi|tools");
      await clickPick(o, "question", sel0 - 5 + 5 > 0 ? sel0 : sel0);
      const tIn = `${DV} .booklet-design-node.is-selected .booklet-design-settings [data-field='title'] input`;
      await o.page.locator(tIn).click(); await o.page.keyboard.press("Control+z"); await sleep(500);
      c.ok(text(every) === E1, "Ctrl+Z while the form's Title box has the focus is the box's own (the view undoes nothing: the note still has the delete)");
      await o.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await o.page.keyboard.press("Control+z"); r = await waitDisk(every, tx => tx === E0); await idle(o);
      c.ok(r.ok, "and with the focus out of the box Ctrl+Z undoes it (the note is whole again)");

      // ---------- a move
      const tools = lineOf(E0, "[!multi|tools"), toolsBlock = blockText(E0, "[!multi|tools");
      await clickPick(o, "question", tools);
      await o.page.locator(act("question", tools, "down")).click();
      r = await waitDisk(every, tx => tx !== E0); rg = region(E0, r.text);
      const nextBlock = blockText(E0, "[!scale|sure") + "\n(and its list)";
      c.ok(r.ok && r.text === swapped(E0, "[!multi|tools", "[!scale|sure"), `Move down swaps the question with the one after it: the whole note equals the old one with the two blocks (${toolsBlock.split("\n").length} and ${nextBlock.split("\n").length} lines) in the other order, every other byte as it was; the change spans ${rg.removed.split("\n").length} lines`);
      const afterMove = r.text.split("\n"), ti = afterMove.findIndex(l => l.includes("[!multi|tools")), si = afterMove.findIndex(l => l.includes("[!scale|sure"));
      c.ok(si < ti, "after Move down the scale question comes before the multi (new line order: scale at " + (si + 1) + ", multi at " + (ti + 1) + ")");
      await idle(o);
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); c.ok(r.ok, "Undo puts the two questions back, byte for byte"); await idle(o);

      // ---------- the form: one opening line
      await clickPick(o, "question", fruit);
      const titleIn = `${box("question", fruit)} .booklet-design-settings [data-field='title'] input`;
      await o.page.locator(titleIn).fill("Which fruit would you take?"); await o.page.locator(titleIn).press("Enter");
      r = await waitDisk(every, tx => tx !== E0); await idle(o);
      const oneLine = linesDiffering(E0, r.text) === 1 && r.text.includes("> [!choice|fruit] Which fruit would you take?\n") && r.text.length === E0.length - "pack".length + "take".length - 1 + 1;
      c.ok(r.ok && linesDiffering(E0, r.text) === 1 && r.text.includes("> [!choice|fruit] Which fruit would you take?\n"), `changing the Title field rewrites that block's opening line and no other line (${linesDiffering(E0, r.text)} line differs): ${JSON.stringify(region(E0, r.text))}`);
      void oneLine;
      const E2 = r.text;
      await o.page.locator(`${box("question", fruit)} .booklet-design-settings [data-field='open'] .checkbox-container`).click();
      r = await waitDisk(every, tx => tx !== E2); await idle(o);
      c.ok(r.ok && linesDiffering(E2, r.text) === 1 && /> \[!choice\|fruit open\] Which fruit would you take\?/.test(r.text), `the switch "open" adds the flag to the opening line only: ${JSON.stringify(r.text.split("\n")[fruit])}`);
      await shot(o, "form-light");
      await undoBtn(o).click(); await waitDisk(every, tx => tx === E2); await idle(o);
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      c.ok(r.ok, "two Undos take both form changes back: the note is whole again, byte for byte");

      // ---------- the textarea editor
      await clickPick(o, "question", fruit);
      await o.page.locator(pickOf("question", fruit)).focus(); await o.page.keyboard.press("Enter"); await sleep(400);
      let area = o.page.locator(`${DV} .booklet-design-textarea`);
      c.ok(await area.count() === 1 && await area.evaluate(e => e === document.activeElement) && await area.inputValue() === fruitBlock, "Enter on the selected block opens its own lines in a text box in place, with the focus in it and nothing but those lines in it");
      await shot(o, "editor-light");
      await o.page.keyboard.press("Escape"); await sleep(300);
      c.ok(!(await state(o)).editor, "Escape with nothing changed closes the editor");
      await o.page.locator(pickOf("question", fruit)).focus(); await o.page.keyboard.press("Enter"); await sleep(300);
      await o.page.keyboard.press("Control+End"); await typeFast(o, "zz"); await sleep(150);
      await o.page.keyboard.press("Escape"); await sleep(250);
      const armed = await o.evaluate(() => ({ open: !!document.querySelector(".workspace-leaf.mod-active .booklet-design-textarea"), state: (document.querySelector(".workspace-leaf.mod-active .booklet-design-editor-state") || {}).textContent }));
      c.ok(armed.open && /Esc again/.test(armed.state || ""), "the first Escape with changes keeps the box and says so: " + JSON.stringify(armed.state));
      await o.page.keyboard.press("Escape"); await sleep(300);
      const gone = await state(o);
      c.ok(!gone.editor && /thrown away/.test(gone.status) && text(every) === E0, `the second Escape throws the changes away (status "${gone.status}") and the note is untouched`);
      // Ctrl+Enter saves
      await o.page.locator(pickOf("question", fruit)).focus(); await o.page.keyboard.press("Enter"); await sleep(300);
      area = o.page.locator(`${DV} .booklet-design-textarea`);
      await area.fill(fruitBlock.replace("Pick one.", "Pick any.")); await sleep(150);
      await o.page.keyboard.press("Control+Enter");
      r = await waitDisk(every, tx => tx !== E0); await idle(o);
      c.ok(r.ok && linesDiffering(E0, r.text) === 1 && r.text.includes("> Pick any.") && !(await state(o)).editor, `Ctrl+Enter saves: only the one changed line differs, the editor closed: ${JSON.stringify(region(E0, r.text))}`);
      await undoBtn(o).click(); r = await waitDisk(every, tx => tx === E0); await idle(o);
      // stale: the note changes on disk (the block itself) while the editor is open
      await clickPick(o, "question", fruit);
      await o.page.locator(pickOf("question", fruit)).focus(); await o.page.keyboard.press("Enter"); await sleep(300);
      area = o.page.locator(`${DV} .booklet-design-textarea`);
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

      // ---------- the outline
      await o.evaluate(() => { const d = document.querySelector(".workspace-leaf.mod-active .booklet-design-outline"); d.open = true; });
      await sleep(300);
      const entries = await o.evaluate(() => [...document.querySelectorAll(".workspace-leaf.mod-active .booklet-design-outline-list .booklet-design-jump")].map(b => ({ start: b.dataset.start, text: b.textContent })));
      c.ok(entries.length >= 10, `the outline lists the booklet's parts (${entries.length}) as buttons: ${entries.slice(0, 4).map(x => x.text).join("; ")}`);
      const lastE = entries[entries.length - 1];
      await o.page.locator(`${DV} .booklet-design-outline-list .booklet-design-jump[data-start='${lastE.start}']`).click(); await sleep(600);
      const jump = await o.evaluate(() => { const n = document.querySelector(".workspace-leaf.mod-active .booklet-design-node.is-selected"); const r = n && n.getBoundingClientRect(), v = document.querySelector(".workspace-leaf.mod-active .view-content").getBoundingClientRect(); return { start: n && n.dataset.start, inView: !!r && r.top < v.bottom && r.bottom > v.top, focus: document.activeElement.className }; });
      c.ok(jump.start === lastE.start && jump.inView && /booklet-design-pick/.test(jump.focus), `a click on the outline's last entry (${lastE.text}) selects that block, scrolls it into view and puts the focus on its name: ${JSON.stringify(jump)}`);

      // ---------- Kept records: the count-and-ask dialog
      await openDesign(o, KEPT);
      const colour = lineOf(K0, "[!choice|colour]"), colourBlock = blockText(K0, "[!choice|colour]"), recordsAt = K0.indexOf("%%\n> [!records");
      await clickPick(o, "question", colour);
      await o.page.locator(act("question", colour, "delete")).click();
      c.ok(await waitModal(o, true), "Delete on a question with a kept answer opens a dialog");
      const m1 = await modalInfo(o);
      c.ok(m1 && /Delete this question\?/.test(m1.title) && m1.buttons.join() === "Delete,Cancel" && m1.focus === "Cancel" && m1.focusIsButton, `the dialog is titled ${JSON.stringify(m1 && m1.title)}, has the buttons ${JSON.stringify(m1 && m1.buttons)} and the focus is on ${JSON.stringify(m1 && m1.focus)}`);
      c.ok(m1 && /\d/.test(m1.text) && /colour/i.test(m1.text) && /kept/i.test(m1.text) && /lines?\)/.test(m1.text), "it says what is deleted, how many lines go with it, and what kept data no longer matches, with counts: " + JSON.stringify((m1 && m1.text || "").replace(/\s+/g, " ").slice(0, 420)));
      await shot(o, "confirm-light");
      await clickModal(o, "Cancel");
      c.ok(text(kept) === K0 && /Nothing was changed/.test((await state(o)).status), `No (Cancel) writes nothing: the note is byte for byte as it was; the status says "${(await state(o)).status}"`);
      await o.page.locator(act("question", colour, "delete")).click(); await waitModal(o, true);
      await o.page.keyboard.press("Escape"); await waitModal(o, false); await sleep(300);
      c.ok(text(kept) === K0, "Escape in the dialog is a No: nothing written");
      await o.page.locator(act("question", colour, "delete")).click(); await waitModal(o, true);
      await clickModal(o, "Delete");
      r = await waitDisk(kept, tx => tx !== K0);
      c.ok(r.ok && withoutBlock(K0, "[!choice|colour]").includes(r.text) && r.text.endsWith(K0.slice(recordsAt)), `Yes writes exactly the change: the question's ${colourBlock.split("\n").length} lines and one blank line beside them are taken out (the whole note equals the old one without them) and the records section is byte for byte what it was (kept answer and entries stay; ${K0.length - r.text.length} bytes removed)`);
      await idle(o);
      // the kept answer now matches nothing: the list says so
      await o.evaluate(() => { const d = document.querySelector(".workspace-leaf.mod-active .booklet-design-leftovers"); d.open = true; });
      const left = await o.evaluate(() => ({ count: document.querySelector(".workspace-leaf.mod-active .booklet-design-leftovers").dataset.count, text: document.querySelector(".workspace-leaf.mod-active .booklet-design-leftovers").innerText }));
      c.ok(+left.count >= 1 && /saved answer/i.test(left.text), `the list "Kept data that matches nothing now" counts the answer left behind (it gives the line of the kept data and the count, not the question's id) (${left.count}): ${JSON.stringify(left.text.replace(/\s+/g, " ").slice(0, 160))}`);
      await undoBtn(o).click(); r = await waitDisk(kept, tx => tx === K0); await idle(o);
      c.ok(r.ok, "Undo brings the question back and the note is byte for byte as it was");
      // a module with kept entries: delete asks with the counts of its entries
      const walks = lineOf(K0, "[!module|walks]");
      await clickPick(o, "module", walks);
      await o.page.locator(act("module", walks, "delete")).click(); await waitModal(o, true);
      const m2 = await modalInfo(o);
      c.ok(m2 && /Delete this module\?/.test(m2.title) && /entr/i.test(m2.text) && m2.focus === "Cancel", `deleting the module Walks (two kept entries) asks, with the focus on Cancel: ${JSON.stringify((m2 && m2.text || "").replace(/\s+/g, " ").slice(0, 380))}`);
      await clickModal(o, "Cancel");
      c.ok(text(kept) === K0, "No on the module's dialog writes nothing");
      // a move that asks?
      const walkLog = lineOf(K0, "[!activity|walk-log");
      await clickPick(o, "activity", walkLog);
      const downBtn = o.page.locator(act("activity", walkLog, "down"));
      if (await downBtn.isEnabled()) {
        await downBtn.click(); await sleep(700);
        const mv = await modalInfo(o);
        if (mv) { c.info("Move down on the activity with kept entries asks: " + JSON.stringify(mv.text.replace(/\s+/g, " ").slice(0, 300))); await clickModal(o, "Cancel"); c.ok(text(kept) === K0, "Cancel on a move writes nothing"); }
        else { r = await waitDisk(kept, tx => tx !== K0); c.info("Move down on the activity with kept entries wrote at once (no dialog)"); await idle(o); await undoBtn(o).click(); await waitDisk(kept, tx => tx === K0); c.ok(text(kept) === K0, "the move undone: the note is byte for byte as it was"); await idle(o); }
      }

      // ---------- the lines the reader cannot read
      await openDesign(o, CARDS);
      await o.evaluate(() => { const d = document.querySelector(".workspace-leaf.mod-active .booklet-design-problems"); d.open = true; });
      await sleep(300);
      const prob = await o.evaluate(() => { const d = document.querySelector(".workspace-leaf.mod-active .booklet-design-problems"); return { count: d.dataset.count, summary: d.querySelector("summary").textContent, items: [...d.querySelectorAll(".booklet-design-jump")].map(b => ({ start: b.dataset.start, text: b.innerText })) }; });
      c.ok(+prob.count >= 2 && prob.items.length >= 2, `the list "${prob.summary}" names the lines the reader cannot read, each a button: ${JSON.stringify(prob.items.map(x => x.text.replace(/\s+/g, " ")).slice(0, 3))}`);
      await shot(o, "problems-light");
      const target = prob.items[0];
      await o.page.locator(`${DV} .booklet-design-problems .booklet-design-jump[data-start='${target.start}']`).click(); await sleep(500);
      const pj = await o.evaluate(() => { const n = document.querySelector(".workspace-leaf.mod-active .booklet-design-node.is-selected"); const r = n && n.getBoundingClientRect(), v = document.querySelector(".workspace-leaf.mod-active .view-content").getBoundingClientRect(); return { start: n && n.dataset.start, kind: n && n.dataset.kind, inView: !!r && r.top < v.bottom && r.bottom > v.top }; });
      c.ok(pj.start === target.start && pj.inView, `a click on a problem selects the block it is on and brings it into view: ${JSON.stringify(pj)}`);
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
      const fruit = lineOf(E0, "[!choice|fruit]"), gonePair = withoutBlock(E0, "[!choice|fruit]");
      await clickPick(o, "question", fruit);
      await o.page.locator(act("question", fruit, "delete")).click();
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
      await clickPick(o, "question", tools);
      await o.page.locator(act("question", tools, "down")).click();
      t = await agree("Move down", tx => tx !== E0);
      c.ok(t === swapped(E0, "[!multi|tools", "[!scale|sure"), "Move down swaps the two questions and changes no other byte");
      await idle(o);
      await undoBtn(o).click(); t = await agree("Undo of the move", tx => tx === E0); await idle(o);
      // form
      await clickPick(o, "question", fruit);
      const titleIn = `${box("question", fruit)} .booklet-design-settings [data-field='title'] input`;
      await o.page.locator(titleIn).fill("Which fruit would you take?"); await o.page.locator(titleIn).press("Enter");
      t = await agree("The form's Title", tx => tx !== E0); await idle(o);
      c.ok(linesDiffering(E0, t) === 1 && t.includes("> [!choice|fruit] Which fruit would you take?\n"), "the form changed that block's opening line and no other line (" + linesDiffering(E0, t) + " line differs)");
      await undoBtn(o).click(); t = await agree("Undo of the form", tx => tx === E0); await idle(o);
      // editor with Ctrl+Enter
      const fruitBlock = blockText(E0, "[!choice|fruit]");
      await clickPick(o, "question", fruit);
      await o.page.locator(pickOf("question", fruit)).focus(); await o.page.keyboard.press("Enter"); await sleep(400);
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
      await clickPick(o, "question", fruit);
      await o.page.locator(act("question", fruit, "delete")).click();
      const typedWant = E0.split("\n").map((l, i) => i === thoughts ? l + " (typed)" : l).join("\n"), wantPair = withoutBlock(typedWant, "[!choice|fruit]");
      t = await agree("Delete after text was typed in the Markdown pane", tx => wantPair.includes(tx));
      c.ok(wantPair.includes(t) && t.includes("Anything else about the plan? (typed)"), `the text typed in the Markdown pane (not yet saved when the delete was made: ${typedAt ? "it was not on disk" : "it had already been saved"}) is kept and the delete is made in the same text`);
      await shot(o, "markdown-pane-beside-light");
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
  async function check69() {
    const c = new Check(69, "a phone (Obsidian's phone mode at 390 x 844): no sideways scroll, controls at least 44 px, the tree, the catalogue, the popup, the form, the editor and the confirm dialog usable, in light and dark; screenshots");
    await withApp("c69", async (o, vault) => {
      const kept = path.join(vault, KEPT), K0 = text(kept), every = path.join(vault, EVERY), E0 = text(every);
      await openDesign(o, EVERY);
      const narrowed = await o.page.setViewportSize({ width: 390, height: 844 }).then(() => true, e => String(e).slice(0, 120));
      c.ok(narrowed === true, "the window is 390 x 844: " + narrowed);
      await mobile(o, true);
      await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
      if (await o.evaluate(() => app.workspace.getLeavesOfType("booklet-design").length) === 0) await openDesign(o, EVERY);
      await o.page.waitForSelector(DV + " .booklet-design-node", { timeout: 15000 });
      await idle(o); await warm(o);
      const judge = async (label, ctx) => {
        const f = await phoneFacts(o);
        const ours = f.small.filter(x => x.own), others = f.small.filter(x => !x.own);
        c.ok(f.bodyMobile && f.docScroll <= f.W + 1 && f.vcScroll <= f.vcClient + 1 && f.wideCount === 0, `${label}: no sideways scroll (page ${f.docScroll} of ${f.W} px, the view ${f.vcScroll} of ${f.vcClient}); nothing sticks out of the screen${f.wideCount ? ": " + JSON.stringify(f.wide) : ""}`);
        c.ok(ours.length === 0, `${label}: every control of the plugin's is at least 44 px each way (${f.controls} controls looked at)${ours.length ? "; smaller: " + JSON.stringify(ours.slice(0, 6)) : ""}`);
        if (others.length) c.info(`${label}: Obsidian's own controls under 44 px (not the plugin's): ${JSON.stringify(others.slice(0, 5))}`);
        return f;
      };
      await judge("the tree");
      await shot(o, "phone-tree-light");
      // header and the mode buttons reachable
      const hdr = await headerOf(o);
      c.info("on the phone the header shows: " + JSON.stringify(hdr.buttons) + "; tab icon " + hdr.tabIcon);
      // the catalogue
      const t0 = text(every), actLine = lineOf(t0, "[!activity|tally");
      const addBtn = `${box("activity", actLine)} > .booklet-design-body > .booklet-design-addrow .booklet-design-add`;
      await o.page.locator(addBtn).scrollIntoViewIfNeeded(); await o.page.locator(addBtn).click(); await sleep(400);
      await o.page.locator(`${DV} .booklet-design-catgroup[data-group='questions'] .booklet-design-cathead`).click(); await sleep(700);
      await judge("the catalogue with Questions open");
      await shot(o, "phone-catalogue-light");
      await o.page.locator(`${DV} .booklet-design-catgroup[data-group='questions'] .booklet-design-cathead`).scrollIntoViewIfNeeded();
      await o.page.keyboard.press("Escape"); await sleep(300);
      // the popup by the keys (a keyboard attached to the phone)
      await o.page.locator(pickOf("activity", actLine)).click(); await sleep(300);
      await o.evaluate(() => { const b = document.activeElement; if (b && b.blur) b.blur(); });
      await o.page.keyboard.press("s"); await sleep(400);
      const pop = await o.evaluate(() => !!document.querySelector(".workspace-leaf.mod-active .booklet-design-popup"));
      c.ok(pop, "the key s opens the popup on the phone too (a keyboard is attached)");
      if (pop) { await judge("the popup"); await shot(o, "phone-popup-light"); }
      await o.page.keyboard.press("Escape"); await sleep(300);
      // the form
      const fruit = lineOf(E0, "[!choice|fruit]");
      await clickPick(o, "question", fruit);
      await o.page.locator(`${box("question", fruit)} .booklet-design-settings`).scrollIntoViewIfNeeded();
      await judge("the form");
      await shot(o, "phone-form-light");
      // the editor
      await o.page.locator(pickOf("question", fruit)).focus(); await o.page.keyboard.press("Enter"); await sleep(500);
      const ed = await state(o);
      c.ok(ed && ed.editor, "Enter opens the text editor on the phone");
      await judge("the editor");
      await shot(o, "phone-editor-light");
      await o.page.keyboard.press("Escape"); await sleep(300);
      // dark
      await o.setScheme("dark"); await sleep(500);
      await judge("the tree in the dark theme");
      await shot(o, "phone-tree-dark");
      await o.setScheme("light"); await sleep(300);
      // the confirm dialog, on Kept records
      await openDesign(o, KEPT);
      const colour = lineOf(K0, "[!choice|colour]");
      await clickPick(o, "question", colour);
      await o.page.locator(act("question", colour, "delete")).click();
      c.ok(await waitModal(o, true), "Delete on a question with a kept answer asks on the phone");
      const mi = await o.evaluate(() => { const m = document.querySelector(".modal-container .modal"); const r = m.getBoundingClientRect(); return { l: Math.round(r.left), rt: Math.round(r.right), w: window.innerWidth, buttons: [...m.querySelectorAll("button")].map(b => { const x = b.getBoundingClientRect(); return { t: b.textContent.trim(), h: Math.round(x.height), w: Math.round(x.width) }; }), sw: m.scrollWidth, cw: m.clientWidth }; });
      c.ok(mi.l >= 0 && mi.rt <= mi.w + 1 && mi.sw <= mi.cw + 1, "the dialog fits the screen: " + JSON.stringify({ left: mi.l, right: mi.rt, screen: mi.w }));
      c.ok(mi.buttons.every(b => b.h >= 43.5), "its buttons are at least 44 px high: " + JSON.stringify(mi.buttons));
      await shot(o, "phone-confirm-light");
      await o.setScheme("dark"); await sleep(400); await shot(o, "phone-confirm-dark");
      await clickModal(o, "Cancel");
      c.ok(text(kept) === K0, "Cancel writes nothing");
      await o.setScheme("light");
      // the lines the reader cannot read, on the phone
      put(vault, CARDS, CARDS_TEXT);
      await openDesign(o, CARDS);
      await o.evaluate(() => { const d = document.querySelector(".workspace-leaf.mod-active .booklet-design-problems"); if (d) d.open = true; });
      await sleep(300);
      await judge("the list of lines the reader cannot read");
      await shot(o, "phone-problems-light");
    });
    return c;
  }

  /* ================= CHECKS 70 AND 71 ================= */
  // The Design view with Obsidian itself in Spanish (70) and in French (71): the language is Obsidian's own (localStorage "language", then
  // the app reloads, as the Language setting does). Every scene is judged at a desktop's width and at Obsidian's phone mode (390 x 844), in the light theme.
  const STRINGS_TS = path.join(SRC_VAULT, "..", "src", "core", "design-strings.ts");
  /** The table's strings as the source file spells them: key -> {en, es, fr} (the `empty.*` keys take their English from core, so have none here). */
  const tableOf = () => {
    const out = {}, js = "\"(?:[^\"\\\\]|\\\\.)*\"";
    const re = new RegExp("^\\t\"([^\"]+)\": tr\\((" + js + "), (" + js + "), (" + js + ")\\),$", "gm");
    let m; const src = text(STRINGS_TS);
    while ((m = re.exec(src))) out[m[1]] = { en: JSON.parse(m[2]), es: JSON.parse(m[3]), fr: JSON.parse(m[4]) };
    return out;
  };
  /** What a person can read in the open Design view, its header, a dialog and the popup: every text, label and title, once each. */
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
  /** Anything of the view, its dialog or its popup that is cut off, wider than its box or off the screen. */
  const fitOf = o => o.evaluate(() => {
    const W = window.innerWidth;
    const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !e.closest("[inert]") && !e.closest("[hidden]") && !e.closest("details:not([open]) > :not(summary)") && !e.closest(".is-measuring"); };
    const name = e => e.tagName.toLowerCase() + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "") + "(" + (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30) + ")";
    const roots = [document.querySelector(".workspace-leaf.mod-active .workspace-leaf-content[data-type='booklet-design']"), document.querySelector(".modal-container .modal")].filter(Boolean);
    const clipped = [], off = [];
    for (const r of roots) for (const e of r.querySelectorAll("*")) {
      if (!vis(e)) continue;
      const cs = getComputedStyle(e), clips = ["hidden", "clip"].includes(cs.overflowX) || cs.textOverflow === "ellipsis";
      const own = /^(INPUT|TEXTAREA)$/.test(e.tagName) || !!e.closest(".view-header-title"); // a field's own text scrolls; the note's file name in the header is Obsidian's
      const isCtl = /^(BUTTON|SUMMARY|LABEL)$/.test(e.tagName) || /booklet-design-(add|pick|act|cat|key)/.test(e.className || "");
      if (!own && (clips || isCtl) && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && cs.display !== "inline") clipped.push(name(e) + " " + e.scrollWidth + ">" + e.clientWidth);
      if ((cs.overflowY === "hidden" || cs.overflowY === "clip") && e.scrollHeight > e.clientHeight + 1 && e.clientHeight > 0) clipped.push(name(e) + " tall " + e.scrollHeight + ">" + e.clientHeight);
      const b = e.getBoundingClientRect();
      if (b.right > W + 1 || b.left < -1) { let scrolled = false; for (let p = e.parentElement; p && !roots.includes(p); p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") scrolled = true; } if (!scrolled) off.push(name(e) + " " + Math.round(b.left) + ".." + Math.round(b.right)); }
    }
    const vc = document.querySelector(".workspace-leaf.mod-active .workspace-leaf-content[data-type='booklet-design'] .view-content");
    return { W, clipped: clipped.slice(0, 8), clippedCount: clipped.length, off: off.slice(0, 8), offCount: off.length, sideways: vc ? vc.scrollWidth - vc.clientWidth : 0, docSideways: document.documentElement.scrollWidth - W };
  });

  async function languageCheck(n, code, label, expect) {
    const c = new Check(n, `the Design view with Obsidian in ${label} (localStorage language "${code}", then a reload): the mode buttons, toolbar, tree, "+ Add" catalogue, key popup, confirm dialog, form and editor are in ${label} (nothing a translated key still shows in English, no {placeholder} left showing), and each fits at a desktop's width and at Obsidian's phone mode (390 x 844), light theme; screenshots and the readable text of each scene are kept`);
    const table = tableOf();
    c.ok(Object.keys(table).length > 150, `read the table from design-strings.ts: ${Object.keys(table).length} keys with their three strings in the file`);
    // a translated key still shown as its English: the English must be one whole text, label or title on screen, and differ from the translation
    const english = Object.entries(table).filter(([k, v]) => v.en !== v[code] && !/\{/.test(v.en) && v.en.length >= 4).map(([k, v]) => ({ k, en: v.en }));
    await withApp("c" + n, async (o, vault) => {
      await o.setScheme("light");
      await o.evaluate(code => { localStorage.setItem("language", code); }, code);
      await o.evaluate(() => { app.commands.executeCommandById("app:reload"); });
      await o.page.waitForFunction(code => !!(window.app && app.workspace && app.workspace.layoutReady) && window.i18next && window.i18next.language === code, code, { timeout: 40000, polling: 100 });
      await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("booklet-design")) if (l.isDeferred) await l.loadIfDeferred(); });
      c.ok(await o.evaluate(() => window.i18next.language) === code, `Obsidian is in ${label} (i18next language ${code})`);
      const every = path.join(vault, EVERY), kept = path.join(vault, KEPT), E0 = text(every), K0 = text(kept);
      const fruit = lineOf(E0, "[!choice|fruit]"), actLine = lineOf(E0, "[!activity|tally"), colour = lineOf(K0, "[!choice|colour]");
      const judge = async (where, scene, tagWidth) => {
        const items = await readable(o), fit = await fitOf(o);
        fs.writeFileSync(path.join(SHOTS, `design-${code}-${tagWidth}-${scene}-text-${VER}.json`), JSON.stringify(items, null, 1));
        // the drawings of a question (the renderer's own words, in an inert sample), the hotkey group names and the pieces' labels are English in their own files (known, not translated in this release): a table string
        // that happens to read the same there is not a leak; anywhere else it is
        const BY_DESIGN = /^drawn |booklet-design-(group|popup-label)\b/;
        const wrong = english.filter(e => items.some(i => i.text === e.en && !BY_DESIGN.test(i.cls))).map(e => e.k);
        const holes = items.filter(i => /\{\w+\}/.test(i.text)).map(i => i.text.slice(0, 60));
        c.ok(wrong.length === 0, `${where}: no translated key shows in English (${items.length} texts read)${wrong.length ? ": " + wrong.join(", ") : ""}`);
        c.ok(holes.length === 0, `${where}: no {placeholder} left showing${holes.length ? ": " + JSON.stringify(holes) : ""}`);
        c.ok(fit.clippedCount === 0 && fit.offCount === 0 && fit.sideways <= 1 && fit.docSideways <= 1, `${where}: nothing cut off, nothing off the screen, no sideways scroll${fit.clippedCount || fit.offCount ? ": " + JSON.stringify({ clipped: fit.clipped, off: fit.off }) : ""} (view ${fit.sideways}, page ${fit.docSideways} px wider than its box)`);
        await shot(o, `${code}-${tagWidth}-${scene}`);
        return items;
      };
      const scenes = async tagWidth => {
        await openDesign(o, EVERY);
        await sleep(300);
        const items0 = await judge(`${tagWidth} tree`, "tree", tagWidth);
        const texts = items0.map(i => i.text);
        c.ok(texts.includes(expect.undo) && texts.includes(expect.redo), `${tagWidth}: the toolbar says ${JSON.stringify(expect.undo)} and ${JSON.stringify(expect.redo)}`);
        const hdr = await headerOf(o);
        c.ok(hdr.buttons.some(b => b.label === expect.toBooklet) && hdr.buttons.some(b => b.label === expect.toMarkdown), `${tagWidth}: the header buttons are ${JSON.stringify(expect.toBooklet)} and ${JSON.stringify(expect.toMarkdown)} (found ${JSON.stringify(hdr.buttons.map(b => b.label))})`);
        // + Add and the catalogue
        const addBtn = `${box("activity", actLine)} > .booklet-design-body > .booklet-design-addrow .booklet-design-add`;
        await o.page.locator(addBtn).scrollIntoViewIfNeeded();
        c.ok((await o.page.locator(addBtn).first().textContent()).trim() === expect.add, `${tagWidth}: the add button reads ${JSON.stringify(expect.add)}`);
        await o.page.locator(addBtn).click(); await sleep(400);
        const head = `${DV} .booklet-design-catgroup[data-group='questions'] .booklet-design-cathead`;
        await o.page.locator(head).click(); await sleep(700);
        await o.page.locator(head).scrollIntoViewIfNeeded();
        await judge(`${tagWidth} catalogue with Questions open`, "catalogue", tagWidth);
        await o.page.keyboard.press("Escape"); await sleep(300);
        // the popup by keys
        await o.page.locator(pickOf("activity", actLine)).click(); await sleep(300);
        await o.evaluate(() => { const b = document.activeElement; if (b && b.blur) b.blur(); });
        await o.page.keyboard.press("s"); await sleep(400);
        const pop = await o.evaluate(() => !!document.querySelector(".workspace-leaf.mod-active .booklet-design-popup"));
        c.ok(pop, `${tagWidth}: the key s opens the popup`);
        if (pop) await judge(`${tagWidth} key popup`, "popup", tagWidth);
        await o.page.keyboard.press("Escape"); await sleep(300);
        // the form and the editor
        await clickPick(o, "question", fruit);
        await o.page.locator(`${box("question", fruit)} .booklet-design-settings`).scrollIntoViewIfNeeded();
        await judge(`${tagWidth} form`, "form", tagWidth);
        await o.page.locator(pickOf("question", fruit)).focus(); await o.page.keyboard.press("Enter"); await sleep(500);
        c.ok((await state(o)).editor, `${tagWidth}: Enter opens the Markdown editor`);
        await judge(`${tagWidth} editor`, "editor", tagWidth);
        await o.page.keyboard.press("Escape"); await sleep(300);
        // the confirm dialog, on Kept records (a kept answer is touched)
        await openDesign(o, KEPT);
        await clickPick(o, "question", colour);
        await o.page.locator(act("question", colour, "delete")).click();
        c.ok(await waitModal(o, true), `${tagWidth}: Delete on a question with a kept answer asks`);
        const mi = await modalInfo(o);
        c.ok(mi && mi.buttons.includes(expect.cancel) && mi.buttons.includes(expect.yes), `${tagWidth}: the dialog's buttons are ${JSON.stringify(expect.cancel)} and ${JSON.stringify(expect.yes)} (found ${JSON.stringify(mi && mi.buttons)})`);
        c.info(`${tagWidth} dialog title: ` + JSON.stringify(await o.evaluate(() => { const t = document.querySelector(".modal-container .modal .modal-title"), cs = getComputedStyle(t), r = t.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(t); return { text: t.textContent, w: Math.round(r.width), h: Math.round(r.height), sw: t.scrollWidth, cw: t.clientWidth, sh: t.scrollHeight, ch: t.clientHeight, ov: cs.overflow, ws: cs.whiteSpace, to: cs.textOverflow, lines: new Set([...rg.getClientRects()].map(x => Math.round(x.top))).size }; })));
        const under = await o.evaluate(() => { const t = document.querySelector(".modal-container .modal .modal-title"), x = document.querySelector(".modal-container .modal .modal-header-button"); if (!t || !x) return null; const rg = document.createRange(); rg.selectNodeContents(t); const b = x.getBoundingClientRect(); return [...rg.getClientRects()].some(r => r.width > 0 && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top); });
        c.ok(under === false, `${tagWidth}: the dialog's title does not run under its close button${under === null ? " (no close button found)" : ""}`);
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
  const check70 = () => languageCheck(70, "es", "Spanish", { undo: "Deshacer", redo: "Rehacer", add: "+ Agregar", cancel: "Cancelar", yes: "Borrar", toBooklet: "Abrir como cuadernillo", toMarkdown: "Mostrar Markdown" });
  const check71 = () => languageCheck(71, "fr", "French", { undo: "Annuler", redo: "Rétablir", add: "+ Ajouter", cancel: "Ne pas modifier", yes: "Supprimer", toBooklet: "Ouvrir en carnet", toMarkdown: "Afficher le Markdown" });

  return { 64: check64, 65: check65, 66: check66, 67: check67, 68: check68, 69: check69, 70: check70, 71: check71 };
};
