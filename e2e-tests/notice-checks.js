// Checks 46 and 47 of plugin-check.js (0.11.0), in the real app.
// 46: the notice at the top of a note that holds something the plugin does not read. A made-up note (marked with a later version, which says nothing by itself; a kind of line, a setting,
//   a query key and a block the plugin does not read) is written into the check's own copy of the vault and opened. The notice's words, the
//   line numbers it names (the front matter counts) and the plugin's version (read from the app's own manifest, not typed here) are compared
//   with what the file holds; the unread lines are drawn as "Not yet supported"; an answer is still taken and written; and after the write
//   every unread line is in the file byte for byte and the marker is the one the file came with. On a desktop's width and in Obsidian's phone mode.
// 47: the names that stay put. The command `booklet:toggle-view` is registered and toggles the note between the booklet view and Markdown; the
//   view type `booklet` is registered; and a saved pane in every state a hand-edited or older workspace could hold (nothing, a string, a list, a
//   place of a release that is not this one, a part in text, a page that is gone) is handed to the real app as the pane's state: nothing throws
//   and the page error list stays empty, and a state that is not a place opens the home screen.
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check functions.
const fs = require("fs"), path = require("path");
const { quiet, frames, mobile, kit } = require("./waits");

module.exports = function noticeChecks(env) {
  const { withApp, Check, BOOK, sleep } = env;
  const NOTE = "Not read.booklet.md", TWO = "Two activities.booklet.md";
  const { shot, open } = kit(env, NOTE);
  const UPDATE = "To update: Settings, Community plugins, Check for updates.";
  const ODD = [
    "> [!lesson|intro] The lesson  with  odd   spacing\t",
    "> keep this line, trailing space ",
    "```booklet bookmarks",
    '{ "pages": [1,2] }',
    "```",
    "> [!text|u hidden shiny:1] Another",
  ];
  const noteText = () => `---
booklet: "0.19"
id: booklet-test/not-read
title: Not read
lang: en
---

> [!activity|a repeat] A

> [!choice|c] Pick
- [ ] One
- [ ] Two

> [!text|t] Say

${ODD[0]}
${ODD[1]}

${ODD[2]}
${ODD[3]}
${ODD[4]}

${ODD[5]}

\`\`\`booklet query
from: a
shading: soft
\`\`\`
`;
  const lineOf = (text, needle) => text.split("\n").findIndex(l => l.includes(needle)) + 1;
  const two = `---
booklet: "0.18"
id: booklet-test/two
title: Two activities
lang: en
---

> [!activity|a] A

> [!tab|t1] One

> [!page|p1] First

Words.

***

More.

> [!page|p2] Second

Other words.

> [!tab|t2] Two

Two words.

> [!activity|b] B

B words.
`;

  async function check46() {
    const c = new Check(46, "0.11.0 the notice for what the plugin does not read, none for the marker: a kind of line, a setting, a query key and a block, each named by its line in the file, with the plugin's version and how to update, and no sentence about the marker; the rest of the note draws and takes an answer; every unread line is kept byte for byte");
    for (const where of ["desktop", "phone"]) {
      await withApp("c46-" + where, async (o, vault) => {
        const file = path.join(vault, NOTE), orig = noteText();
        fs.writeFileSync(file, orig);
        if (where === "desktop") await o.page.setViewportSize({ width: 1280, height: 900 });
        else { await o.page.setViewportSize({ width: 390, height: 844 }); await mobile(o, true); }
        await open(o, NOTE);
        const version = await o.evaluate(() => app.plugins.manifests.booklet.version);
        c.ok(/^\d+\.\d+\.\d+$/.test(version), `[${where}] the plugin's version is read from the app's manifest: ${version}`);
        const read = () => o.evaluate(sel => {
          const box = document.querySelector(sel + " .booklet-problems");
          if (!box) return null;
          const li = box.querySelector("ul > li.booklet-notice");
          return {
            summary: box.querySelector("summary").textContent,
            first: !!li && li === box.querySelector("ul > li"),
            paragraphs: li ? [...li.querySelectorAll(":scope > p")].map(p => p.textContent) : [],
            entries: li ? [...li.querySelectorAll(":scope > ul > li")].map(l => l.textContent) : [],
            others: [...box.querySelectorAll(":scope > ul > li:not(.booklet-notice)")].map(l => l.textContent),
            muted: [...document.querySelectorAll(sel + " .booklet-unsupported .booklet-muted")].map(e => e.textContent),
          };
        }, BOOK);
        const got = await read();
        c.ok(!!got, `[${where}] the problems list is drawn`);
        if (!got) return;
        const L = n => lineOf(orig, n);
        const want = [
          `Line ${L("[!lesson")}: > [!lesson|intro] The lesson with odd spacing ("lesson" is not a kind this view reads, so it is drawn as "not yet supported")`,
          `Line ${L("```booklet bookmarks")}: \`\`\`booklet bookmarks ("booklet bookmarks" is not a block this view reads, so it is drawn as "not yet supported")`,
          `Line ${L("[!text|u")}: > [!text|u hidden shiny:1] Another (a text line takes no \`shiny:\` setting)`,
          `Line ${L("[!text|u")}: > [!text|u hidden shiny:1] Another (a text line takes no \`hidden\` setting)`,
          `Line ${L("shading")}: shading: soft (a query has no setting "shading", so it was ignored)`,
        ];
        c.info(`[${where}] the notice: ${JSON.stringify(got)}`);
        c.ok(got.first, `[${where}] the notice is the first item of the list`);
        c.ok(got.summary === "5 things in this note could not be read", `[${where}] the list counts the five parts: ${JSON.stringify(got.summary)}`);
        c.ok(JSON.stringify(got.paragraphs) === JSON.stringify([
          `This is Booklet plugin ${version}, which reads format 0.18.`,
          "This view does not read these 5 parts of the note. They stay in the file exactly as written, and the rest of the note works as usual:",
          `A newer version of the plugin may read this note. ${UPDATE}`,
        ]), `[${where}] its sentences, the real plugin's version in them: ${JSON.stringify(got.paragraphs)}`);
        c.ok(JSON.stringify(got.entries) === JSON.stringify(want), `[${where}] its five entries, each with its line number in the file (front matter counted): ${JSON.stringify(got.entries)} against ${JSON.stringify(want)}`);
        c.ok(got.others.length === 0, `[${where}] nothing else among the problems: ${JSON.stringify(got.others)}`);
        c.ok(JSON.stringify(got.muted) === JSON.stringify(['Not yet supported: the kind "lesson".', 'Not yet supported: the block "booklet bookmarks".']), `[${where}] the kind and the block are drawn as not yet supported where they stand: ${JSON.stringify(got.muted)}`);
        await o.evaluate(sel => { document.querySelector(sel + " .booklet-problems").open = true; }, BOOK);
        await frames(o);
        await shot(o, `notice-${where}`);

        // the rest of the note takes answers
        await o.page.waitForSelector(BOOK + " .booklet-page[data-booklet-screen]", { timeout: 8000 });
        const two = o.page.locator(BOOK + " .booklet-choices > button.booklet-choice", { hasText: "Two" }).first();
        await two.scrollIntoViewIfNeeded();
        await two.click({ timeout: 5000 });
        await quiet(o);
        const after = () => fs.readFileSync(file, "utf8");
        let ok = false;
        for (let n = 0; n < 50 && !ok; n++) { ok = /```booklet (answers|draft)/.test(after()); if (!ok) await sleep(100); }
        const written = after();
        c.ok(ok, `[${where}] a press on an option is written to the note's records`);
        c.ok(written.startsWith(orig.replace(/\s+$/, "")), `[${where}] the note above the records is the note as it was, byte for byte`);
        c.ok(ODD.every(l => written.includes(l + "\n")), `[${where}] every unread line is in the file as written: ${ODD.filter(l => !written.includes(l + "\n")).map(l => JSON.stringify(l)).join(", ") || "all six"}`);
        c.ok(written.startsWith('---\nbooklet: "0.19"\n'), `[${where}] the marker is the one the file came with`);
        const again = await read();
        c.ok(again && JSON.stringify(again.entries) === JSON.stringify(want), `[${where}] and the notice still lists the same five parts after the write`);
      });
    }
    return c;
  }

  const BAD = [
    ["nothing", undefined, "home"],
    ["null", null, "home"],
    ["a string", "activity:/a", "home"],
    ["a number", 7, "home"],
    ["a list", [1, "activity:/a"], "home"],
    ["an empty object", {}, "home"],
    ["a screen that is a number", { version: 2, screen: 7, part: 0 }, "home"],
    ["no version", { screen: "activity:/a", part: 0 }, "home"],
    ["a version in text", { version: "1", screen: "activity:/a", part: 0 }, "home"],
    ["a version from the future", { version: 3, screen: "activity:/a", part: 0 }, "home"],
    ["an activity that is gone", { version: 2, screen: "activity:/gone", part: 2 }, "home"],
    ["a part in text", { version: 2, screen: "activity:/a", part: "3" }, "activity:/a"],
    ["a part past the end", { version: 2, screen: "activity:/a", part: 9999 }, "activity:/a"],
    ["a negative part", { version: 2, screen: "activity:/a", part: -5 }, "activity:/a"],
    ["a tab that is an object and a page that is a list", { version: 2, screen: "activity:/a", tab: {}, page: [], part: 0 }, "activity:/a"],
    ["a page that is gone", { version: 2, screen: "activity:/a", tab: "t1", page: "gone", part: 0 }, "activity:/a"],
    ["an older place (version 1)", { version: 1, screen: "activity:/a", tab: "t1", part: 2 }, "home"],
    ["fields no release wrote, beside a good place", { version: 2, screen: "activity:/a", tab: "t1", page: "p1", part: 1, future: { x: [1] } }, "activity:/a"],
  ];

  async function check47() {
    const c = new Check(47, "0.11.0 names that stay put: the command booklet:toggle-view and the view type booklet are registered and work, and a saved pane in any of 18 states that this release did not write opens the home screen or the nearest place, with nothing thrown");
    await withApp("c47", async (o, vault) => {
      fs.writeFileSync(path.join(vault, TWO), two);
      const errors = [];
      o.page.on("pageerror", e => errors.push(String(e && (e.stack || e.message) || e).slice(0, 300)));
      o.page.on("console", m => { if (m.type() === "error") errors.push("console.error: " + m.text().slice(0, 300)); });
      const names = await o.evaluate(() => ({
        manifest: app.plugins.manifests.booklet && app.plugins.manifests.booklet.id,
        command: !!app.commands.commands["booklet:toggle-view"],
        commands: Object.keys(app.commands.commands).filter(k => k.startsWith("booklet:")),
        view: typeof app.viewRegistry.viewByType["booklet"],
      }));
      c.ok(names.manifest === "booklet" && names.command && names.view === "function", `the plugin id is booklet, the command booklet:toggle-view is registered and the view type booklet is: ${JSON.stringify(names)}`);
      c.ok(JSON.stringify(names.commands) === JSON.stringify(["booklet:toggle-view"]), `the plugin's commands: ${JSON.stringify(names.commands)} (a new one may be added; this one stays)`);

      // the command toggles the note between the booklet view and Markdown, both ways
      await open(o, TWO);
      const type = () => o.evaluate(() => app.workspace.activeLeaf.view.getViewType());
      await o.evaluate(() => app.commands.executeCommandById("booklet:toggle-view"));
      let t1 = false;
      for (let n = 0; n < 60 && !t1; n++) { t1 = (await type()) === "markdown"; if (!t1) await sleep(100); }
      await sleep(400); // the pane has finished switching before the command runs again
      await o.evaluate(() => app.commands.executeCommandById("booklet:toggle-view"));
      let t2 = false;
      for (let n = 0; n < 60 && !t2; n++) { t2 = (await type()) === "booklet"; if (!t2) await sleep(100); }
      c.ok(t1 && t2, `booklet:toggle-view shows the note as Markdown, and as a booklet again: ${t1}, ${t2}`);

      for (const [name, state, screen] of BAD) {
        const res = await o.evaluate(async ([rel, state]) => {
          const leaf = app.workspace.getLeaf("tab");
          let threw = null;
          // the pane's state as Obsidian restores it: the note's path beside whatever else the layout held
          const s = state && typeof state === "object" && !Array.isArray(state) ? { file: rel, ...state } : state === undefined ? { file: rel } : state;
          try { await leaf.setViewState({ type: "booklet", state: s === undefined ? undefined : s, active: true }); } catch (e) { threw = String(e && e.message || e); }
          return { threw, type: leaf.view.getViewType() };
        }, [TWO, state]);
        // a state with no file (a string, a number, a list) is not one a pane of a note holds: the app, not the plugin, decides what that pane shows
        const hasFile = state === undefined || (state && typeof state === "object" && !Array.isArray(state));
        if (hasFile) {
          let seen = null;
          for (let n = 0; n < 80 && !seen; n++) { seen = await o.evaluate(sel => { const p = document.querySelector(sel + " .booklet-page"); return p && p.getAttribute("data-booklet-screen"); }, BOOK + ".mod-active, .workspace-leaf.mod-active " + BOOK); if (!seen) await sleep(100); }
          if (seen) await quiet(o);
          c.ok(!res.threw && res.type === "booklet" && seen === screen, `a saved pane that is ${name}: nothing thrown (${res.threw}), the pane is a ${res.type}, opening ${seen} (wanted ${screen})`);
        } else c.ok(!res.threw, `a saved pane that is ${name} (no file in it, so the app decides what it shows): nothing thrown (${res.threw})`);
        await o.evaluate(() => { const ls = []; app.workspace.iterateRootLeaves(l => { ls.push(l); }); ls.slice(1).forEach(l => l.detach()); });
        await frames(o);
      }
      c.ok(errors.length === 0, `and the page raised no error through all of it: ${JSON.stringify(errors)}`);
    });
    return c;
  }

  return { 46: check46, 47: check47 };
};
