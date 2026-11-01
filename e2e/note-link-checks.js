// Check 34 of plugin-check.js: links to other notes and selecting words (0.10.0), in the real app. The notes are made up and written into
// the check's own copy of the vault: a booklet note (two modules, a heading link, a module link, links to a note with and without an alias
// and a heading, a web address, a question) and the note the links name. Real mouse and keyboard events, as a reader makes them:
//   a click opens the note; Ctrl+click opens it in a new pane and leaves the booklet where it was; an alias is only the words shown;
//   heading and module links still move within the view; Ctrl+hover shows Obsidian's page preview; a triple click selects a paragraph;
//   a question's button still answers it and writes only the records region.
// On a desktop's width (all of it) and in Obsidian's phone mode (the click, the alias, the moves, the selection and the question; a phone has no hover).
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check function.
const fs = require("fs"), path = require("path");
const { quiet, frames, mobile, untilTrue, kit } = require("./waits");

module.exports = function noteLinkChecks(env) {
  const { withApp, Check, BOOK, sleep } = env;
  const NOTE = "Links.booklet.md", OTHER = "Other note.md", PLAIN = "Plain links.md";
  const { shot, sha, goTo, open } = kit(env, NOTE);
  const OTHER_WORDS = "Made-up words in the other note, about the harbour tides.";
  const PARA = "This paragraph is plain prose with no link in it, and a reader should be able to select every word of it and copy it.";
  const otherText = `# Other note\n\n${OTHER_WORDS}\n\n## Sec heading\n\nMade-up words under the heading.\n`;
  const noteText = () => `---
booklet: "0.16"
id: booklet-test/links
title: Links
lang: en
---

> [!module|one] One

> [!activity|a] Alpha

Visit [[Other note]] today, or use [[Other note|an alias]], or [[Other note#Sec heading]]. Go on to [[#Beta]], then to [[two.booklet]]. A web address is <https://example.org/page>.

${PARA}

> [!choice|mood] How is the water?
- [ ] Calm
- [ ] Rough

> [!activity|b] Beta

Beta words.

> [!module|one end] End

> [!module|two] Two

> [!activity|c] Gamma

Gamma words.

> [!module|two end] End
`;
  // the link whose target is `href` (and, where two links share one, whose words are `text`)
  const link = (o, href, text) => {
    const l = o.page.locator(BOOK + " .booklet-page a[data-href=" + JSON.stringify(href) + "]");
    return (text ? l.filter({ hasText: new RegExp("^" + text + "$") }) : l).first();
  };
  const state = o => o.evaluate(() => {
    const leaves = [];
    app.workspace.iterateRootLeaves(l => { leaves.push({ type: l.view.getViewType(), file: (l.view.file && l.view.file.path) || null, screen: l.view.getViewType() === "booklet" ? l.getViewState().state.screen : null, active: l === app.workspace.activeLeaf }); });
    const f = app.workspace.getActiveFile();
    return { active: f && f.path, activeType: app.workspace.activeLeaf && app.workspace.activeLeaf.view.getViewType(), leaves, notes: app.vault.getMarkdownFiles().map(x => x.path).sort() };
  });
  // back to one booklet pane on the note's first activity, whatever the last step did to the panes
  const fresh = async o => {
    await o.evaluate(() => { const ls = []; app.workspace.iterateRootLeaves(l => { ls.push(l); }); ls.slice(1).forEach(l => l.detach()); app.workspace.setActiveLeaf(ls[0], { focus: true }); });
    await open(o, NOTE);
    await goTo(o, "activity:one/a");
    await o.page.waitForSelector(BOOK + " .booklet-page a.internal-link", { timeout: 8000 });
    await o.page.mouse.move(5, 5);
    await frames(o);
  };
  const waitFor = (o, fn, arg, ms = 6000) => o.page.waitForFunction(fn, arg, { timeout: ms, polling: 30 }).then(() => true, () => false);

  async function check34() {
    const c = new Check(34, "0.10.0 links and selection: a click on `[[Other note]]` opens it (Ctrl+click in a new pane, the booklet left where it was), an alias opens its target, heading and module links still move within the view, Ctrl+hover shows the page preview, a triple click selects a paragraph, a question still answers and writes only the records region; desktop and phone");
    for (const where of ["desktop", "phone"]) {
      const desk = where === "desktop";
      await withApp("c34-" + where, async (o, vault) => {
        const file = path.join(vault, NOTE), orig = noteText();
        fs.writeFileSync(path.join(vault, OTHER), otherText);
        fs.writeFileSync(file, orig);
        await o.page.waitForFunction(r => !!app.vault.getAbstractFileByPath(r), OTHER, { timeout: 15000, polling: 50 });
        if (desk) await o.page.setViewportSize({ width: 1280, height: 900 });
        else { await o.page.setViewportSize({ width: 390, height: 844 }); await mobile(o, true); }
        await fresh(o);
        const links = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-page a")].map(a => ({ cls: a.className, href: a.getAttribute("data-href") || a.getAttribute("href"), text: a.textContent })), BOOK);
        c.info(`[${where}] the links drawn: ${JSON.stringify(links)}`);
        c.ok(links.some(l => l.href === "Other note" && l.text === "Other note") && links.some(l => l.href === "Other note" && l.text === "an alias") && links.some(l => l.href === "Other note#Sec heading") && links.some(l => l.href === "#Beta") && links.some(l => l.href === "two.booklet") && links.some(l => l.href === "https://example.org/page"), `[${where}] the note links, the alias (showing its own words), the heading link, the module link and the web address are all drawn as links`);

        // 1: a click on [[Other note]]
        let before = await state(o);
        await link(o, "Other note", "Other note").click({ timeout: 5000 });
        c.ok(await waitFor(o, () => app.workspace.getActiveFile() && app.workspace.getActiveFile().path === "Other note.md"), `[${where}] (1) a click on \`[[Other note]]\` makes Other note the active file`);
        let s = await state(o);
        c.info(`[${where}] (1) after the click: ${JSON.stringify({ active: s.active, leaves: s.leaves })}`);
        c.ok(s.active === "Other note.md" && s.leaves.length === 1 && before.leaves.length === 1, `[${where}] (1) it opens in the same pane (one pane before and after), active ${s.active}, panes ${s.leaves.length}`);
        await shot(o, `links-click-${where}`);

        // 3: the alias
        await fresh(o);
        await link(o, "Other note", "an alias").click({ timeout: 5000 });
        c.ok(await waitFor(o, () => app.workspace.getActiveFile() && app.workspace.getActiveFile().path === "Other note.md"), `[${where}] (3) the link shown as "an alias" opens Other note`);
        s = await state(o);
        c.ok(!s.notes.some(n => /alias/i.test(n)), `[${where}] (3) and makes no note named for the alias: ${s.notes.filter(n => /alias/i.test(n)).length} found`);
        await fresh(o);
        await link(o, "Other note#Sec heading").click({ timeout: 5000 });
        c.ok(await waitFor(o, () => app.workspace.getActiveFile() && app.workspace.getActiveFile().path === "Other note.md"), `[${where}] (3) \`[[Other note#Sec heading]]\` opens Other note too`);

        // 2: Ctrl+click: desktop only (a phone has no Ctrl key)
        if (desk) {
          await fresh(o);
          before = await state(o);
          const l0 = before.leaves[0];
          await link(o, "Other note", "Other note").click({ modifiers: ["Control"], timeout: 5000 });
          c.ok(await waitFor(o, () => { let n = 0; app.workspace.iterateRootLeaves(() => { n++; }); return n === 2 && app.workspace.getActiveFile() && app.workspace.getActiveFile().path === "Other note.md"; }), `[${where}] (2) Ctrl+click on \`[[Other note]]\` opens it in a new pane and makes it active`);
          s = await state(o);
          const booklet = s.leaves.find(l => l.type === "booklet");
          c.ok(s.leaves.length === 2 && booklet && booklet.file === NOTE && booklet.screen === l0.screen && s.leaves.some(l => l.file === OTHER && l.active), `[${where}] (2) the booklet pane still shows ${NOTE} at ${booklet && booklet.screen} (was ${l0.screen}); the other pane shows Other note: ${JSON.stringify(s.leaves)}`);
          await shot(o, `links-ctrl-click-${where}`);
        }

        // 4: a heading link and a module link move within the view
        await fresh(o);
        before = await state(o);
        await link(o, "#Beta").click({ timeout: 5000 });
        c.ok(await waitFor(o, () => document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-page[data-booklet-screen='activity:one/b']")), `[${where}] (4) \`[[#Beta]]\` moves to Beta's screen within the view`);
        s = await state(o);
        c.ok(s.active === NOTE && s.leaves.length === 1 && s.leaves[0].type === "booklet" && s.leaves[0].screen === "activity:one/b", `[${where}] (4) the pane is still the booklet on ${NOTE}, now at ${s.leaves[0].screen}`);
        await fresh(o);
        const notes0 = (await state(o)).notes;
        await link(o, "two.booklet").click({ timeout: 5000 });
        c.ok(await waitFor(o, () => /^(module:two|activity:two\/)/.test(document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-page")?.getAttribute("data-booklet-screen") || "")), `[${where}] (4) \`[[two.booklet]]\` moves to module two within the view`);
        s = await state(o);
        c.ok(s.active === NOTE && s.leaves.length === 1 && s.leaves[0].type === "booklet" && JSON.stringify(s.notes) === JSON.stringify(notes0), `[${where}] (4) the pane is still the booklet at ${s.leaves[0].screen}; no note was made (${s.notes.length} notes before and after)`);
        await shot(o, `links-module-${where}`);

        // 5: Ctrl+hover shows the page preview: desktop only
        if (desk) {
          await fresh(o);
          const pp = await o.evaluate(() => { const p = app.internalPlugins.getPluginById("page-preview"); return { found: !!p, enabled: !!(p && p.enabled) }; });
          if (pp.found && !pp.enabled) { await o.evaluate(async () => { await app.internalPlugins.getPluginById("page-preview").enable(true); }); await sleep(300); }
          const pp2 = await o.evaluate(() => { const p = app.internalPlugins.getPluginById("page-preview"); return { found: !!p, enabled: !!(p && p.enabled) }; });
          c.ok(pp2.found && pp2.enabled, `[${where}] (5) the Page preview core plugin is on in this copy of the vault (was ${JSON.stringify(pp)}, now ${JSON.stringify(pp2)})`);
          const a = link(o, "Other note", "Other note");
          await a.scrollIntoViewIfNeeded();
          await o.page.mouse.move(5, 300);
          await o.page.keyboard.down("Control");
          await a.hover();
          const got = await waitFor(o, w => [...document.querySelectorAll(".popover.hover-popover")].some(p => p.textContent.includes(w)), OTHER_WORDS, 8000);
          const pops = await o.evaluate(() => [...document.querySelectorAll(".popover.hover-popover")].map(p => p.textContent.replace(/\s+/g, " ").trim().slice(0, 90)));
          c.ok(got, `[${where}] (5) Ctrl+hover on \`[[Other note]]\` shows a .popover.hover-popover with the note's text: ${JSON.stringify(pops)}`);
          await shot(o, `links-hover-${where}`);
          await o.page.keyboard.up("Control");
          await o.page.mouse.move(5, 300);
          await waitFor(o, () => document.querySelectorAll(".popover.hover-popover").length === 0, null, 5000);
          // without Ctrl: Obsidian's own Page preview setting decides, so the same words in Reading view are the measure
          const hoverCount = async sel => {
            await o.page.mouse.move(5, 300); await waitFor(o, () => document.querySelectorAll(".popover.hover-popover").length === 0, null, 5000);
            await o.page.locator(sel + " a[data-href='Other note']").first().hover(); await sleep(1500);
            const n = await o.evaluate(() => document.querySelectorAll(".popover.hover-popover").length);
            await o.page.mouse.move(5, 300); await waitFor(o, () => document.querySelectorAll(".popover.hover-popover").length === 0, null, 5000);
            return n;
          };
          const inBooklet = await hoverCount(BOOK + " .booklet-page");
          fs.writeFileSync(path.join(vault, PLAIN), noteText().replace(/^---[\s\S]*?---\n/, "").replace(/> \[!\w+[^\n]*\n/g, ""));
          await o.page.waitForFunction(r => !!app.vault.getAbstractFileByPath(r), PLAIN, { timeout: 15000, polling: 50 });
          await o.evaluate(async rel => { const l = app.workspace.getLeaf(); await l.openFile(app.vault.getAbstractFileByPath(rel), { state: { mode: "preview" } }); }, PLAIN);
          await o.page.waitForSelector(".workspace-leaf.mod-active .markdown-reading-view a.internal-link", { timeout: 10000 });
          const inReading = await hoverCount(".workspace-leaf.mod-active .markdown-reading-view");
          c.ok(inBooklet === inReading, `[${where}] (5) a hover without Ctrl shows ${inBooklet} previews in the booklet and ${inReading} in Reading view of the same words (Obsidian's setting decides, the view follows it)`);
        }

        // 6: selection
        await fresh(o);
        const p = o.page.locator(BOOK + " .booklet-page p", { hasText: "This paragraph is plain prose" }).first();
        await p.scrollIntoViewIfNeeded();
        await p.click({ clickCount: 3, timeout: 5000 });
        const sel = await o.evaluate(sel => {
          const g = window.getSelection(), para = [...document.querySelectorAll(sel + " .booklet-page p")].find(e => e.textContent.includes("This paragraph is plain prose"));
          return { text: g.toString(), para: para.textContent, inside: !!g.anchorNode && !!g.anchorNode.parentElement.closest(".booklet-page"), us: getComputedStyle(para).userSelect };
        }, BOOK);
        const norm = t => t.replace(/\s+/g, " ").trim();
        c.ok(sel.text.length > 0 && norm(sel.text) === norm(sel.para) && norm(sel.text) === PARA, `[${where}] (6) a triple click on a prose paragraph selects exactly its words (${sel.text.length} characters; user-select ${sel.us}): ${JSON.stringify(norm(sel.text).slice(0, 60))}...`);
        await shot(o, `links-selection-${where}`);

        // 7: a question still answers; only the records region is written
        await fresh(o);
        await o.page.locator(BOOK + " button.booklet-choice", { hasText: "Calm" }).first().click({ timeout: 5000 });
        await quiet(o);
        const written = await untilTrue(() => /```booklet answers/.test(fs.readFileSync(file, "utf8")), 8000);
        const now = fs.readFileSync(file, "utf8"), at = now.search(/%%\n> \[!records\]/), head = at >= 0 ? now.slice(0, at) : now;
        const added = head.startsWith(orig) ? head.slice(orig.length) : null;
        const m = /```booklet answers[^\n]*\n([\s\S]*?)\n```/.exec(now);
        let ans = null; try { ans = m && JSON.parse(m[1]); } catch (e) { ans = "UNPARSEABLE"; }
        c.ok(written && at >= 0 && added !== null && /^(\r?\n){0,2}$/.test(added) && ans && ans.mood === 1, `[${where}] (7) a press on Calm answers the question: the answers on disk are ${JSON.stringify(ans)}; the text before the records region is the note as written plus ${JSON.stringify(added)}`);
        c.ok(now.replace(/\n*%%\n> \[!records\][\s\S]*$/, "").trimEnd() === orig.trimEnd(), `[${where}] (7) nothing outside the records region changed (the note without its region equals the note as written)`);
        const st = await state(o);
        c.ok(st.active === NOTE && st.leaves.length === 1 && st.leaves[0].type === "booklet", `[${where}] (7) the press did not open or move anything: ${JSON.stringify(st.leaves)}`);

        if (!desk) { await o.page.setViewportSize({ width: 1280, height: 900 }); await mobile(o, false); }
      });
    }
    return c;
  }
  return { 34: check34 };
};
