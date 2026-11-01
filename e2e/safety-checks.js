// Checks 35 to 41 of plugin-check.js: data safety in the real app (0.11.0). Every note is made up and written into the check's own copy of
// the vault; nothing is written into --vault.
//   35 damaged and duplicated records     38 quit in the middle of typing (the process is killed)
//   36 CRLF, BOM, no final newline        39 the file changes under the open view
//   37 a plugin that rewrites the note    40 the plugin off and on; pop-out window; split panes; restart
//   (the Linter run needs a downloaded     41 a note with three thousand daily entries
//    plugin: it is a scratch run, see the PR)
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check functions.
const fs = require("fs"), path = require("path"), cp = require("child_process");
const { quiet, frames, untilTrue, kit } = require("./waits");

module.exports = function safetyChecks(env) {
  const { withApp, Check, BOOK, sleep, launch, opt, WORK } = env;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const bytes = f => fs.readFileSync(f);
  const put = (vault, rel, data) => { const f = path.join(vault, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
  const blocksOf = text => { const r = []; const re = /```(booklet [^\n]*)\n([\s\S]*?)\n```/g; let m; while ((m = re.exec(text))) r.push({ head: m[1], body: m[2], raw: m[0] }); return r; };
  const json = s => { try { return JSON.parse(s); } catch (e) { return undefined; } };
  async function waitDisk(file, pred, timeout = 10000) {
    const t0 = Date.now(); let text = "";
    while (Date.now() - t0 < timeout) {
      text = fs.readFileSync(file, "utf8");
      try { if (pred(text)) return { ok: true, text, ms: Date.now() - t0 }; } catch (e) { /* not yet */ }
      await sleep(100);
    }
    return { ok: false, text, ms: Date.now() - t0 };
  }
  const cardSel = key => BOOK + " .booklet-card[data-booklet-activity='" + key + "']";
  const inCard = (o, key, sel) => o.page.locator(cardSel(key) + " " + sel);
  // the problems the view lists at its top: [summary, items]
  const problemsOf = o => o.evaluate(sel => {
    const d = document.querySelector(sel + " details.booklet-problems");
    return d ? { summary: d.querySelector("summary").textContent, items: [...d.querySelectorAll("li")].map(l => l.textContent) } : null;
  }, BOOK);
  // the page's own errors that name the plugin, over a stretch of a check: the console watcher of plugin-check.js reports them in check 10
  const consoleCount = () => (env.consoleReport || []).length;

  /* ================= CHECK 35 ================= */
  // damaged and duplicated records
  const DAMAGED = "Damaged records.booklet.md";
  const BAD_DRAFT = '```booklet draft diary\n{"entry": "half written",}\n```';
  const damagedText = () => `---
booklet: "0.17"
id: booklet-test/damaged-records
title: Damaged records
lang: en
---

> [!activity|mood] A mood

> [!choice|feel] How do you feel?
- [ ] Calm
- [ ] Tense
- [ ] Tired

> [!text|why] Why?

> [!activity|diary repeat] A diary

> [!text|entry] Today in a line

%%
> [!records] App record — do not edit below this line

\`\`\`booklet answers
{"why": "A made-up reason"}
\`\`\`

\`\`\`booklet entries diary
{"items": [
{"ts": "2026-10-01T08:00:00Z", "entry": "First day"},
{"ts": "2026-10-02T08:00:00Z", "entry": "Second day"}
]}
\`\`\`

\`\`\`booklet entries diary
{"items": [
{"ts": "2026-10-02T08:00:00Z", "entry": "Second day, again"},
{"ts": "2026-10-03T08:00:00Z", "entry": "Third day"}
]}
\`\`\`

${BAD_DRAFT}
%%
`;
  async function check35() {
    const c = new Check(35, "damaged records: a record that is not JSON and a record written twice are kept byte for byte through answers, a draft and Finalize; the rest is read and answerable; the view lists the damaged one");
    await withApp("c35", async (o, vault) => {
      const file = put(vault, DAMAGED, damagedText());
      const K = kit(env, DAMAGED);
      const orig = fs.readFileSync(file, "utf8");
      const dupes = blocksOf(orig).filter(b => b.head === "booklet entries diary").map(b => b.raw);
      c.ok(dupes.length === 2, "the made-up note holds the same entries block twice and one draft block that is not JSON");
      await K.open(o, DAMAGED);
      const p = await problemsOf(o);
      c.ok(p && /^1 thing in this note could not be read$/.test(p.summary) && /booklet draft block could not be read/.test(p.items[0] || ""), "the view says so at its top, once: " + JSON.stringify(p));
      // the rest is read: the answer shown, the three days (the duplicated block merges by ts) listed
      await K.goTo(o, "activity:/mood");
      const shown = await o.evaluate(sel => {
        const q = document.querySelector(sel + " .booklet-kind-text");
        return { why: q && q.querySelector("input, textarea").value, choices: [...document.querySelectorAll(sel + " .booklet-kind-choice button.booklet-choice")].map(b => b.textContent.trim()) };
      }, BOOK);
      c.ok(shown.why === "A made-up reason" && shown.choices.length === 3, "the rest of the note is read: the answer to the text question is shown, the choice has its three options: " + JSON.stringify(shown));
      // press an answer
      await inCard(o, "/mood", "button.booklet-choice").nth(1).click();
      const a = await waitDisk(file, t => /"feel": 2/.test(t));
      c.ok(a.ok, "the press reached the note (feel = 2)");
      const keptA = blocksOf(a.text).filter(b => b.head === "booklet entries diary").map(b => b.raw);
      c.ok(same(keptA, dupes) && a.text.includes(BAD_DRAFT), "after a press: both copies of the duplicated entries block and the damaged draft are byte for byte as written");
      const fromTo = (x, y) => x.slice(0, x.indexOf("```booklet answers")) === y.slice(0, y.indexOf("```booklet answers")) && x.slice(x.indexOf("```booklet entries")) === y.slice(y.indexOf("```booklet entries"));
      c.ok(fromTo(orig, a.text), "and nothing outside the answers block changed");
      // type in the diary and keep the entry
      await K.goTo(o, "activity:/diary");
      const listed0 = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-entry")].map(e => e.textContent), cardSel("/diary"));
      c.ok(listed0.length === 3 && listed0.some(t => t.includes("Second day, again")) && !listed0.some(t => /Second day(?!,)/.test(t)), "the duplicated block's entries are read as one list (the same ts merges, the later words win): " + listed0.length + " kept days");
      await inCard(o, "/diary", ".booklet-kind-text input, .booklet-kind-text textarea").first().click();
      await o.page.keyboard.type("Typed beside a damaged draft");
      await o.evaluate(() => document.activeElement && document.activeElement.blur());
      const d = await waitDisk(file, t => blocksOf(t).filter(b => b.head === "booklet draft diary").length === 2);
      c.ok(d.ok && d.text.includes(BAD_DRAFT), "the draft was written as a new block beside the damaged one, which is untouched");
      const newDraft = blocksOf(d.text).filter(b => b.head === "booklet draft diary").map(b => json(b.body)).find(v => v);
      c.ok(newDraft && newDraft.entry === "Typed beside a damaged draft", "the new draft holds the typed words: " + JSON.stringify(newDraft));
      await inCard(o, "/diary", "button.booklet-finalize").click();
      const f = await waitDisk(file, t => !blocksOf(t).some(b => b.head === "booklet draft diary" && json(b.body)));
      const entries = blocksOf(f.text).filter(b => b.head === "booklet entries diary");
      c.ok(f.ok && f.text.includes(BAD_DRAFT) && entries.length === 2 && entries[0].raw === dupes[0], "Finalize: the damaged draft is still there as written, the first entries block is as written");
      const lastItems = (json(entries[1].body) || {}).items || [];
      c.ok(lastItems.length === 3 && lastItems[2].entry === "Typed beside a damaged draft" && entries[1].raw.startsWith(dupes[1].replace(/\n\]\}\n```$/, "")), "and the new entry was added after the last entry of the last block: " + JSON.stringify(lastItems.map(e => e.entry)));
      // opened again, the damaged record is still reported and nothing else is
      await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
      await sleep(300);
      await K.open(o, DAMAGED);
      const p2 = await problemsOf(o);
      c.ok(p2 && /^1 thing/.test(p2.summary), "opened again, the view still lists the one damaged record: " + JSON.stringify(p2 && p2.summary));
    });
    return c;
  }

  /* ================= CHECK 36 ================= */
  // the writer's round trip in the real app: line endings, a byte-order mark, no final newline, non-Latin text and emoji
  const noteBytes = ({ eol = "\n", bom = false, finalNewline = true, words = "" } = {}) => {
    const lines = ["---", 'booklet: "0.17"', "id: booklet-test/round-trip", ("title: Round trip " + words).trimEnd(), "lang: en", "---", "",
      "> [!activity|kinds] Every kind", "", ("Made-up words " + words).trimEnd() + ".", "",
      "> [!choice|fruit] Which fruit?", "- [ ] Apple", "- [ ] Pear", "- [ ] Plum", "",
      "> [!scale|sure] How sure?", "", "1. Not sure", "2. Fairly sure", "3. Certain", "",
      "> [!text|thoughts] Anything else?", "",
      "> [!number|boxes min:0 max:20] How many boxes?", "",
      "> [!activity|log repeat] A log", "", "> [!text|line] A line for today"];
    return Buffer.from((bom ? "\uFEFF" : "") + lines.join(eol) + (finalNewline ? eol : ""), "utf8");
  };
  const CASES = {
    "LF": {},
    "CRLF": { eol: "\r\n" },
    "no final newline": { finalNewline: false },
    "CRLF, no final newline": { eol: "\r\n", finalNewline: false },
    "byte-order mark, CRLF": { bom: true, eol: "\r\n" },
    "non-Latin text and emoji": { words: "Спасибо 🌊 感謝" },
  };
  const mixedEndings = (buf, eol) => {
    const s = buf.toString("utf8");
    return eol === "\r\n" ? (/[^\r]\n/.test(s) || /^\n/.test(s) || /\r(?!\n)/.test(s)) : s.includes("\r");
  };
  async function check36() {
    const c = new Check(36, "the writer's round trip in the real app: CRLF, a byte-order mark, no final newline, non-Latin text and emoji, in the booklet view alone and with the note also open as Markdown; every byte not asked to change is as it was");
    for (const mode of ["booklet view", "with a Markdown pane"]) {
      await withApp("c36-" + (mode === "booklet view" ? "view" : "md"), async (o, vault) => {
        for (const [name, opts] of Object.entries(CASES)) {
          const rel = "Round trip " + Object.keys(CASES).indexOf(name) + ".booklet.md";
          // With a Markdown pane open, the answers are written through its editor, and Obsidian's own editor saves a note with LF
          // endings and without a byte-order mark (the control at the end of this check shows it does so for a note it edits itself):
          // what is then compared is the design with that normalisation, and the file must still end up with one kind of ending.
          const viaEditor = mode !== "booklet view";
          const orig = noteBytes(opts), eol = viaEditor ? "\n" : (opts.eol || "\n");
          const expectDesign = viaEditor ? Buffer.from(orig.toString("utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"), "utf8") : orig;
          const file = put(vault, rel, orig);
          const K = kit(env, rel);
          const tag = "[" + mode + "] " + name + ":";
          let opened = true;
          try { await K.open(o, rel); } catch (e) { opened = false; c.ok(false, tag + " the note did not open as a booklet within the wait: " + String(e.message).split("\n")[0]); }
          if (!opened) continue;
          if (mode !== "booklet view") {
            await o.evaluate(async rel => { const l = app.workspace.getLeaf("split", "vertical"); await l.openFile(app.vault.getAbstractFileByPath(rel)); await app.plugins.plugins.booklet.setMode(l, "markdown"); }, rel);
            await sleep(500);
            const types = await o.evaluate(() => { const r = []; app.workspace.iterateRootLeaves(l => { r.push(l.view.getViewType() + ":" + (l.view.file && l.view.file.path)); }); return r.sort(); });
            c.ok(types.length === 2 && types[0].startsWith("booklet:") && types[1].startsWith("markdown:"), tag + " the note is open in two panes, a booklet and a Markdown: " + JSON.stringify(types));
          }
          await K.goTo(o, "activity:/kinds");
          const q = k => inCard(o, "/kinds", ".booklet-kind-" + k);
          await q("choice").locator("button.booklet-choice").nth(1).click();
          await q("scale").locator("button.booklet-choice").nth(2).click();
          await q("number").locator("input").click(); await o.page.keyboard.type("12");
          await q("text").locator("input, textarea").first().click(); await o.page.keyboard.type("Köszönöm 🙂 ありがとう");
          await o.evaluate(() => document.activeElement && document.activeElement.blur());
          const got = await waitDisk(file, t => /Köszönöm 🙂 ありがとう/.test(t) && /"fruit": 2/.test(t) && /"boxes": 12/.test(t) && (!viaEditor || !/\r/.test(t)), viaEditor ? 12000 : 8000);
          const disk = bytes(file);
          c.ok(got.ok, tag + " the four answers reached the file" + (got.ok ? "" : ": " + JSON.stringify(got.text.slice(-300))));
          // outside the records region: the design, byte for byte (compared as Buffers)
          const regionAt = disk.indexOf(Buffer.from("%%" + eol + "> [!records]"));
          const design = expectDesign;
          c.ok(regionAt > 0 && disk.subarray(0, design.length).equals(design), tag + " the bytes of the design (" + design.length + ") are the bytes they were" + (regionAt > 0 ? "" : ": no records region found"));
          if (regionAt > 0 && !disk.subarray(0, design.length).equals(design)) c.info(tag + " first difference at byte " + [...design].findIndex((b, i) => disk[i] !== b) + ": " + JSON.stringify(disk.subarray(0, 60).toString("utf8")) + " against " + JSON.stringify(design.subarray(0, 60).toString("utf8")));
          c.ok(!mixedEndings(disk, eol), tag + " one line ending throughout (" + (eol === "\r\n" ? "CRLF" : "LF") + "): " + (mixedEndings(disk, eol) ? JSON.stringify(disk.toString("utf8").slice(regionAt)) : "no mixed endings"));
          const a = (blocksOf(got.text.replace(/\r\n/g, "\n")).find(b => b.head === "booklet answers") || {}).body;
          c.ok(same(json((a || "").replace(/\r/g, "")), { fruit: 2, sure: 3, boxes: 12, thoughts: "Köszönöm 🙂 ありがとう" }), tag + " the answers block holds the four answers: " + JSON.stringify(a));
          c.ok(disk.toString("utf8").startsWith("\uFEFF") === (!!opts.bom && !viaEditor), tag + " the byte-order mark is " + (opts.bom ? (viaEditor ? "dropped by Obsidian's editor on its save" : "still there") : "not added"));
          // the draft of the repeating activity and a kept entry
          await K.goTo(o, "activity:/log");
          await inCard(o, "/log", ".booklet-kind-text input, .booklet-kind-text textarea").first().click();
          await o.page.keyboard.type("A line 🌙");
          await o.evaluate(() => document.activeElement && document.activeElement.blur());
          await waitDisk(file, t => /booklet draft log/.test(t), 8000);
          await inCard(o, "/log", "button.booklet-finalize").click();
          const fin = await waitDisk(file, t => /booklet entries log/.test(t) && !/booklet draft log/.test(t), 10000);
          const disk2 = bytes(file);
          c.ok(fin.ok && disk2.subarray(0, design.length).equals(design) && !mixedEndings(disk2, eol), tag + " a kept entry: design bytes unchanged, endings still one" + (fin.ok ? "" : " (the entry did not arrive)"));
          if (viaEditor) await sleep(2500);
          await o.evaluate(() => { app.workspace.iterateRootLeaves(l => { l.detach(); }); });
          await sleep(300);
        }
        if (mode !== "booklet view") {
          // the control: no plugin involved in the note, Obsidian's own Markdown editor and the keyboard
          const ctl = put(vault, "Control.md", Buffer.from("\uFEFF# Title\r\n\r\nline one\r\nline two\r\n", "utf8"));
          await o.evaluate(async () => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath("Control.md")); });
          await sleep(600);
          await o.evaluate(() => { const ed = app.workspace.activeLeaf.view.editor; ed.focus(); ed.setCursor({ line: 2, ch: 8 }); });
          await o.page.keyboard.type(" X");
          const r = await waitDisk(ctl, t => /line one X/.test(t), 8000);
          c.ok(r.ok && !/\r/.test(r.text) && !r.text.startsWith("\uFEFF"), "control: a plain CRLF note with a byte-order mark, edited with the keyboard in Obsidian's own Markdown editor (no booklet involved), is saved with LF endings and no byte-order mark: " + JSON.stringify(r.text));
        }
      });
    }
    return c;
  }

  /* ================= CHECK 38 ================= */
  // quit in the middle of typing: the process is killed, then started again on the same vault
  const EVERY = "Every kind.booklet.md";
  const WRITE_PAUSE = 700;   // the view's TYPING_PAUSE_MS: typed words are written this long after the first key not yet written
  const mainPid = port => {
    const pids = cp.execSync(`pgrep -f -- "--remote-debugging-port=${port}"`, { encoding: "utf8" }).trim().split("\n").map(Number);
    return pids.find(p => !/--type=/.test(fs.readFileSync(`/proc/${p}/cmdline`, "utf8").replace(/\0/g, " ")));
  };
  const thoughtsOnDisk = file => { const m = fs.readFileSync(file, "utf8").match(/"thoughts": "((?:[^"\\]|\\.)*)"/); return m ? m[1] : ""; };
  // starts an Obsidian on the vault of a check's session again (the first was killed), with its console watched like the others
  async function relaunch(o, name) {
    const o2 = await launch({ obsidian: path.resolve(opt.obsidian), vault: o.vault, configDir: o.configDir });
    env.sessions.push(name);
    o2.page.on("console", m => { if (m.type() === "error" || m.type() === "warning") env.consoleReport.push({ where: name, kind: "console." + m.type(), text: m.text().slice(0, 400), url: (m.location() || {}).url || "" }); });
    o2.page.on("pageerror", e => env.consoleReport.push({ where: name, kind: "pageerror", text: String((e && (e.stack || e.message)) || e).slice(0, 600), url: "" }));
    return o2;
  }
  async function check38() {
    const c = new Check(38, "quit in the middle of typing: the process killed at half the write delay, just after it, and during typing without a pause (what survives is all but the last " + WRITE_PAUSE + " ms); a normal quit, a closed pane and another note opened write at once");
    // the typing: `chars` typed one by one, `gap` ms apart, returns when each was typed; `stop` is what ends the session `ms` later
    async function session(label, typing, stop) {
      let result = null;
      await withApp("c38-" + label, async (o, vault) => {
        const K = kit(env, EVERY), file = path.join(vault, EVERY);
        o.page.on("dialog", d => { d.accept().catch(() => {}); });   // Obsidian's unload prompt, as the window's close sets it off
        await K.open(o, EVERY);
        await K.goTo(o, "activity:/kinds");
        const field = o.page.locator(BOOK + " .booklet-kind-text textarea, " + BOOK + " .booklet-kind-text input").first();
        await field.click();
        const t0 = Date.now(), times = await typing(o, field);
        const pid = mainPid(o.port);
        const killAt = Date.now() - t0;
        const onDisk = thoughtsOnDisk(file);
        await stop(o, pid);
        for (let i = 0; i < 40; i++) { try { process.kill(pid, 0); } catch (e) { break; } await sleep(100); }
        const gone = (() => { try { process.kill(pid, 0); return false; } catch (e) { return true; } })();
        const afterStop = thoughtsOnDisk(file);
        await o.close();
        const o2 = await relaunch(o, "c38-" + label + "-restart");
        let shown = null;
        try {
          await K.open(o2, EVERY); await K.goTo(o2, "activity:/kinds");
          shown = await o2.evaluate(sel => { const f = document.querySelector(sel + " .booklet-kind-text textarea, " + sel + " .booklet-kind-text input"); return f ? f.value : null; }, BOOK);
        } finally { await o2.close(); }
        result = { times, killAt, onDisk, afterStop, shown, final: thoughtsOnDisk(file), gone };
      });
      return result;
    }
    const typeEach = (text, gap) => async (o, field) => { const times = []; for (const ch of text) { await o.page.keyboard.type(ch); times.push(Date.now()); if (gap) await sleep(gap); } return times; };
    const kill = async (o, pid) => { process.kill(-pid, "SIGKILL"); };
    // (a) half the delay
    let r = await session("half", async (o, f) => { const t = await typeEach("abcdef", 0)(o, f); await sleep(WRITE_PAUSE / 2); return t; }, kill);
    c.ok(r.gone, "(a) the process was killed (SIGKILL to its process group)");
    c.ok(r.afterStop === "" && r.final === "", "(a) killed " + WRITE_PAUSE / 2 + " ms after typing six characters: nothing of them was on disk (lost, within the delay): " + JSON.stringify(r.final));
    // (b) just after the delay
    r = await session("after", async (o, f) => { const t = await typeEach("abcdef", 0)(o, f); await sleep(WRITE_PAUSE + 400); return t; }, kill);
    c.ok(r.final === "abcdef", "(b) killed " + (WRITE_PAUSE + 400) + " ms after typing: all six characters survive: " + JSON.stringify(r.final));
    c.ok(r.shown === "abcdef", "(b) and the restarted Obsidian shows them in the field: " + JSON.stringify(r.shown));
    // (c) typing without a pause, killed at once: everything typed more than the delay (and a margin for the write) before the kill survives
    const text = "The quick brown fox jumps over the lazy dog, again and again and again.";
    r = await session("continuous", typeEach(text, 90), kill);
    const survived = r.final.length;
    const oldEnough = r.times.filter(t => t <= r.times[r.times.length - 1] - (WRITE_PAUSE + 400)).length;
    c.ok(text.startsWith(r.final) && survived >= oldEnough, "(c) " + text.length + " characters typed in " + (r.times[r.times.length - 1] - r.times[0]) + " ms without a pause, killed straight after: " + survived + " survive, and at least the " + oldEnough + " typed more than " + (WRITE_PAUSE + 400) + " ms earlier did: " + JSON.stringify(r.final.slice(-20)));
    // (d) a normal close of the window: Obsidian's quit event runs the plugin's flush before the window goes
    r = await session("quit", async (o, f) => { const t = await typeEach("closing now", 0)(o, f); await sleep(150); return t; }, async (o, pid) => {
      await o.evaluate(log => { const fsx = require("fs"), t0 = Date.now(), w = m => fsx.appendFileSync(log, (Date.now() - t0) + " " + m + "\n"); app.workspace.on("quit", () => w("quit event")); window.addEventListener("beforeunload", () => w("beforeunload")); setTimeout(() => require("electron").remote.getCurrentWindow().close(), 0); }, path.join(WORK, "c38-events.log")).catch(() => {});
    });
    // The page needs a beforeunload listener of its own for the harness's browser to show Obsidian's unload prompt (which the session accepts):
    // without one, Chromium blocks the prompt ("no user gesture") and the window goes before the quit event's tasks are awaited. Obsidian's
    // own app shell has no such limit; this is the harness's.
    c.info("(d) events: " + JSON.stringify(fs.existsSync(path.join(WORK, "c38-events.log")) ? fs.readFileSync(path.join(WORK, "c38-events.log"), "utf8") : "none"));
    c.ok(r.final === "closing now", "(d) the window closed 150 ms after typing (the quit event): the words were written before it went: " + JSON.stringify(r.final));
    // (e) the pane closed, and another note opened in the pane, with words waiting
    await withApp("c38-leave", async (o, vault) => {
      const K = kit(env, EVERY), file = path.join(vault, EVERY);
      await K.open(o, EVERY); await K.goTo(o, "activity:/kinds");
      const field = o.page.locator(BOOK + " .booklet-kind-text textarea, " + BOOK + " .booklet-kind-text input").first();
      await field.click(); await o.page.keyboard.type("pane closing");
      await sleep(150);
      await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
      const a = await waitDisk(file, t => /pane closing/.test(t), 2000);
      c.ok(a.ok && a.ms < 1500, "(e) the pane closed 150 ms after typing: written at once (" + a.ms + " ms): " + JSON.stringify(thoughtsOnDisk(file)));
      await K.open(o, EVERY); await K.goTo(o, "activity:/kinds");
      const f2 = o.page.locator(BOOK + " .booklet-kind-text textarea, " + BOOK + " .booklet-kind-text input").first();
      await f2.click(); await f2.press("End"); await o.page.keyboard.type(" and another note");
      await sleep(150);
      await o.evaluate(async () => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath("Ordinary note.md")); });
      const b = await waitDisk(file, t => /pane closing and another note/.test(t), 2000);
      c.ok(b.ok && b.ms < 1500, "(e) another note opened in the pane 150 ms after typing: written at once (" + b.ms + " ms): " + JSON.stringify(thoughtsOnDisk(file)));
    });
    return c;
  }

  return { 35: check35, 36: check36, 38: check38 };
};
