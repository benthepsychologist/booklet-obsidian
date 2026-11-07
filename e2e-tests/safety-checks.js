// Checks 35 to 41 of plugin-check.js: data safety in the real app (0.11.0). Every note is made up and written into the check's own copy of
// the vault; nothing is written into --vault.
//   35 damaged and duplicated records     38 quit in the middle of typing (the process is killed)
//   36 CRLF, BOM, no final newline        39 the file changes under the open view
//   37 a plugin that rewrites the note    40 the plugin off and on; pop-out window; split panes; restart
//   (the Linter run needs a downloaded     41 a note with three thousand daily entries
//    plugin: it is run by hand in a scratch vault)
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
booklet: "0.19"
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
    const lines = ["---", 'booklet: "0.19"', "id: booklet-test/round-trip", ("title: Round trip " + words).trimEnd(), "lang: en", "---", "",
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
  // "written at once", measured from 150 ms after the last key (about 100 ms when measured): well below the 550 ms the typing pause still has to run then
  const AT_ONCE = 300;
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
        const exitedAfter = Date.now() - times[times.length - 1];   // from the last key to the process being gone
        const afterStop = thoughtsOnDisk(file);
        await o.close();
        const o2 = await relaunch(o, "c38-" + label + "-restart");
        let shown = null;
        try {
          await K.open(o2, EVERY); await K.goTo(o2, "activity:/kinds");
          shown = await o2.evaluate(sel => { const f = document.querySelector(sel + " .booklet-kind-text textarea, " + sel + " .booklet-kind-text input"); return f ? f.value : null; }, BOOK);
        } finally { await o2.close(); }
        result = { times, killAt, onDisk, afterStop, shown, final: thoughtsOnDisk(file), gone, exitedAfter };
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
    // the typing pause cannot have written them: the process was gone, and the words already on disk, before the pause was up
    c.info("(d) the process was gone " + r.exitedAfter + " ms after the last key");
    c.ok(r.afterStop === "closing now" && r.exitedAfter < WRITE_PAUSE, "(d) the words were on disk when the process went, " + r.exitedAfter + " ms after the last key, before the " + WRITE_PAUSE + " ms typing pause could write them: the quit hook wrote them");
    c.ok(/quit event/.test(fs.existsSync(path.join(WORK, "c38-events.log")) ? fs.readFileSync(path.join(WORK, "c38-events.log"), "utf8") : ""), "(d) the quit event ran");
    // (e) the pane closed, and another note opened in the pane, with words waiting
    await withApp("c38-leave", async (o, vault) => {
      const K = kit(env, EVERY), file = path.join(vault, EVERY);
      await K.open(o, EVERY); await K.goTo(o, "activity:/kinds");
      const field = o.page.locator(BOOK + " .booklet-kind-text textarea, " + BOOK + " .booklet-kind-text input").first();
      await field.click(); await o.page.keyboard.type("pane closing");
      await sleep(150);
      await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
      const a = await waitDisk(file, t => /pane closing/.test(t), 2000);
      c.ok(a.ok && a.ms < AT_ONCE, "(e) the pane closed 150 ms after typing: written at once (" + a.ms + " ms): " + JSON.stringify(thoughtsOnDisk(file)));
      await K.open(o, EVERY); await K.goTo(o, "activity:/kinds");
      const f2 = o.page.locator(BOOK + " .booklet-kind-text textarea, " + BOOK + " .booklet-kind-text input").first();
      await f2.click(); await f2.press("End"); await o.page.keyboard.type(" and another note");
      await sleep(150);
      await o.evaluate(async () => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath("Ordinary note.md")); });
      const b = await waitDisk(file, t => /pane closing and another note/.test(t), 2000);
      c.ok(b.ok && b.ms < AT_ONCE, "(e) another note opened in the pane 150 ms after typing: written at once (" + b.ms + " ms): " + JSON.stringify(thoughtsOnDisk(file)));
    });
    return c;
  }

  /* ================= CHECK 39 ================= */
  // the file changes under the open view: edited on disk by another process, renamed, moved, deleted, restored
  const GARDEN = "Garden log.booklet.md";
  const gardenText = () => `---
booklet: "0.19"
id: booklet-test/garden-log
title: Garden log
lang: en
---

> [!activity|log repeat] A garden log

The garden is quiet today.

> [!choice|weather] What is the weather?
- [ ] Sun
- [ ] Rain
- [ ] Wind

> [!scale|work] How much did you do?

1. A little
2. Some
3. A lot

> [!text|note] A line about it

%%
> [!records] App record — do not edit below this line

\`\`\`booklet entries log
{"items": [
{"ts": "2026-10-01T08:00:00Z", "weather": 1, "note": "Sowed the beans"},
{"ts": "2026-10-02T08:00:00Z", "weather": 2, "note": "Watered the pots"}
]}
\`\`\`

\`\`\`booklet draft log
{"weather": 3}
\`\`\`
%%
`;
  const entryCount = o => o.evaluate(sel => document.querySelectorAll(sel + " .booklet-entry").length, BOOK);
  const pageWords = o => o.evaluate(sel => (document.querySelector(sel + " .booklet-page") || { textContent: "" }).textContent.replace(/\s+/g, " "), BOOK);
  const pressedWords = o => o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-kind-choice button.booklet-choice")].filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.textContent.trim()), BOOK);
  const fieldWords = o => o.evaluate(sel => { const f = document.querySelector(sel + " .booklet-kind-text input, " + sel + " .booklet-kind-text textarea"); return f ? f.value : null; }, BOOK);
  async function check39() {
    const c = new Check(39, "the file changes under the open view: edited on disk by another process, then renamed, moved, deleted and restored from the trash: no answer lost, no stray note, no error");
    await withApp("c39-disk", async (o, vault) => {
      const file = put(vault, GARDEN, gardenText());
      const K = kit(env, GARDEN);
      await K.open(o, GARDEN); await K.goTo(o, "activity:/log");
      c.ok(same(await pressedWords(o), ["Wind"]) && (await entryCount(o)) === 2, "the view shows the draft already in the note (Wind pressed) and two kept days");
      // the reader adds to the draft
      await inCard(o, "/log", ".booklet-kind-text input, .booklet-kind-text textarea").first().click();
      await o.page.keyboard.type("Pruned the roses");
      await o.evaluate(() => document.activeElement && document.activeElement.blur());
      await waitDisk(file, t => /Pruned the roses/.test(t));
      // another process (as Sync would) edits the file: a word of the design, a kept day added, a paragraph at the very end
      const disk0 = fs.readFileSync(file, "utf8");
      let edited = disk0.replace("The garden is quiet today.", "The garden is loud with birds today.");
      edited = edited.replace('{"ts": "2026-10-02T08:00:00Z", "weather": 2, "note": "Watered the pots"}', '{"ts": "2026-10-02T08:00:00Z", "weather": 2, "note": "Watered the pots"},\n{"ts": "2026-10-03T08:00:00Z", "weather": 1, "note": "Written on another device"}');
      edited += "\nA paragraph another device added at the very end.\n";
      fs.writeFileSync(file, edited);
      await o.page.waitForFunction(sel => /loud with birds/.test(document.querySelector(sel + " .booklet-page").textContent) && document.querySelectorAll(sel + " .booklet-entry").length === 3, BOOK, { timeout: 10000, polling: 100 });
      await quiet(o);
      c.info("the view took the outside change: the new words of the design are shown and the kept days are three");
      c.ok(same(await pressedWords(o), ["Wind"]) && (await fieldWords(o)) === "Pruned the roses", "and the draft is still shown as it was: Wind pressed, the typed line in its field: " + JSON.stringify([await pressedWords(o), await fieldWords(o)]));
      await sleep(1500);
      c.ok(fs.readFileSync(file, "utf8") === edited, "and the plugin wrote nothing back over the outside change (the file is the bytes the other process wrote)");
      // a press after it lands on the fresh text, so the outside change stays
      await inCard(o, "/log", ".booklet-kind-scale button.booklet-choice").nth(2).click();
      const a = await waitDisk(file, t => /"work": 3/.test(t));
      c.ok(a.ok && a.text.includes("loud with birds") && a.text.includes("Written on another device") && a.text.endsWith("A paragraph another device added at the very end.\n"), "a press after the outside change is written into the fresh text: the other device's words, entry and paragraph are all still in the file");
      // words typed and not yet written when the outside change arrives
      await inCard(o, "/log", ".booklet-kind-text input, .booklet-kind-text textarea").first().click();
      await o.page.keyboard.press("End");
      await o.page.keyboard.type(" and the lilies");
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("loud with birds", "loud with bees"));
      await o.page.waitForFunction(sel => document.activeElement && /lilies/.test(document.activeElement.value || ""), BOOK, { timeout: 4000 });
      const b = await waitDisk(file, t => /Pruned the roses and the lilies/.test(t) && /loud with bees/.test(t));
      c.ok(b.ok, "words typed while another change arrived: the file ends with both the outside change (bees) and the typed line (and the lilies)");
      c.ok((await fieldWords(o)) === "Pruned the roses and the lilies", "and the field kept the reader's words and focus through it: " + JSON.stringify(await fieldWords(o)));
    });
    await withApp("c39-move", async (o, vault) => {
      const file = put(vault, GARDEN, gardenText());
      const K = kit(env, GARDEN);
      const countFiles = () => o.evaluate(() => app.vault.getFiles().length);
      await K.open(o, GARDEN); await K.goTo(o, "activity:/log");
      const filesBefore = await countFiles();   // counted once the note is in the vault's index
      const typeLine = async text => { await inCard(o, "/log", ".booklet-kind-text input, .booklet-kind-text textarea").first().click(); await o.page.keyboard.type(text); };
      // rename with words waiting to be written
      await typeLine("Renamed mid-word");
      await o.evaluate(async () => { await app.fileManager.renameFile(app.vault.getAbstractFileByPath("Garden log.booklet.md"), "Garden journal.booklet.md"); });
      const renamed = path.join(vault, "Garden journal.booklet.md");
      const r = await waitDisk(renamed, t => /Renamed mid-word/.test(t), 4000);
      c.ok(r.ok && !fs.existsSync(file), "renamed with words waiting: they were written into the renamed note, and no note is left under the old name");
      const sameLeaf = await o.evaluate(() => { const l = app.workspace.getLeavesOfType("booklet")[0]; return l && l.view.file.path; });
      c.ok(sameLeaf === "Garden journal.booklet.md" && (await entryCount(o)) === 2, "and the open view follows the note: " + sameLeaf);
      await inCard(o, "/log", ".booklet-kind-choice button.booklet-choice").nth(0).click();
      const r2 = await waitDisk(renamed, t => /"weather": 1\}?\s*\n```\n%%/.test(t) || /booklet draft log\n\{[^}]*"weather": 1/.test(t));
      c.ok(r2.ok, "a press after the rename is written into the renamed note: " + JSON.stringify((r2.text.match(/```booklet draft log\n[\s\S]*?\n```/) || [])[0]));
      // move to a folder
      await o.evaluate(async () => { await app.vault.createFolder("Beds").catch(() => {}); await app.fileManager.renameFile(app.vault.getAbstractFileByPath("Garden journal.booklet.md"), "Beds/Garden journal.booklet.md"); });
      const moved = path.join(vault, "Beds", "Garden journal.booklet.md");
      await inCard(o, "/log", ".booklet-kind-scale button.booklet-choice").nth(1).click();
      const m = await waitDisk(moved, t => /"work": 2/.test(t));
      c.ok(m.ok && !fs.existsSync(renamed), "moved to a folder: a press lands in the moved note, and none is left behind");
      // delete with words waiting
      await typeLine(" typed as it is deleted");
      await o.evaluate(async () => { await app.fileManager.trashFile(app.vault.getAbstractFileByPath("Beds/Garden journal.booklet.md")); });
      await sleep(2000);
      const stray = [];
      const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === ".obsidian") continue; const r = rel ? rel + "/" + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else stray.push(r); } };
      walk(vault, "");
      const garden = stray.filter(f => /garden/i.test(f));
      c.ok(garden.length === 1 && /^\.trash\//.test(garden[0]), "deleted with words waiting: the only note of that name left is the one in the trash, and none was made again: " + JSON.stringify(garden));
      c.ok((await countFiles()) === filesBefore - 1, "the vault has one file fewer: " + filesBefore + " before, " + (await countFiles()) + " now");
      const gone = await o.evaluate(() => { const r = []; app.workspace.iterateRootLeaves(l => { r.push(l.view.getViewType() + ":" + (l.view.file ? l.view.file.path : "-")); }); return r; });
      c.ok(!gone.some(x => x.startsWith("booklet:")), "and no booklet view is left holding the deleted note: " + JSON.stringify(gone));
      // restore from the trash: moved back by hand, as a person does with the file manager
      const trashed = path.join(vault, ".trash", garden[0].split("/").pop());
      fs.mkdirSync(path.join(vault, "Beds"), { recursive: true });
      fs.renameSync(trashed, moved);
      await o.page.waitForFunction(() => !!app.vault.getAbstractFileByPath("Beds/Garden journal.booklet.md"), null, { timeout: 8000, polling: 100 });
      await K.open(o, "Beds/Garden journal.booklet.md"); await K.goTo(o, "activity:/log");
      const back = await fieldWords(o);
      c.ok((await entryCount(o)) === 2 && /^Renamed mid-word/.test(back || "") && (await countFiles()) === filesBefore, "restored from the trash and opened: the two kept days and the draft's words are there (" + JSON.stringify(back) + "), and the vault has " + filesBefore + " files again");
      await inCard(o, "/log", ".booklet-kind-choice button.booklet-choice").nth(2).click();
      const back2 = await waitDisk(moved, t => /booklet draft log\n\{[^}]*"weather": 3/.test(t));
      c.ok(back2.ok, "and an answer pressed in the restored note is written");
    });
    return c;
  }

  /* ================= CHECK 40 ================= */
  // lifecycle: the plugin off and on, a pop-out window, two panes on one note (one in a stacked group), a restart with the pane open
  const WIKI = "Check-in with a wiki.booklet.md";
  const openAs = (o, rel, opts) => o.evaluate(async ([rel, opts]) => { const l = opts === "new" ? app.workspace.getLeaf("tab") : app.workspace.getLeaf(false); await l.openFile(app.vault.getAbstractFileByPath(rel)); return l.view.getViewType(); }, [rel, opts || ""]);
  const leafTypes = o => o.evaluate(() => { const r = []; app.workspace.iterateRootLeaves(l => { r.push(l.view.getViewType() + ":" + (l.view.file ? l.view.file.path : "-")); }); return r; });
  async function check40() {
    const c = new Check(40, "lifecycle: the plugin turned off and on (notes open as Markdown while off, no stray patch left), a booklet in a pop-out window, two panes on one note with one in a stacked group, a restart with the pane open");
    // (a) off and on
    await withApp("c40-toggle", async (o, vault) => {
      const K = kit(env, EVERY);
      const proto = "Object.getPrototypeOf(app.workspace.activeLeaf || app.workspace.getLeaf(false))";
      const patch = () => o.evaluate(`(${proto}).setViewState.toString()`);
      const info = () => o.evaluate(() => ({ view: !!app.viewRegistry.viewByType["booklet"], command: !!app.commands.commands["booklet:toggle-view"], enabled: !!app.plugins.plugins["booklet"] }));
      const withPlugin = await patch();
      const i0 = await info();
      c.ok(i0.view && i0.command && i0.enabled, "on: the booklet view type and the toggle command are registered: " + JSON.stringify(i0));
      // a pane showing a booklet with words waiting, and the plugin turned off
      await K.open(o, EVERY); await K.goTo(o, "activity:/kinds");
      const field = o.page.locator(BOOK + " .booklet-kind-text textarea").first();
      await field.click(); await o.page.keyboard.type("typed as it goes off");
      await o.evaluate(async () => { await app.plugins.disablePlugin("booklet"); });
      await sleep(600);
      const off = await patch(), i1 = await info();
      c.ok(!i1.view && !i1.command && !i1.enabled, "off: the booklet view type and the command are gone: " + JSON.stringify(i1));
      c.ok(off !== withPlugin && !/booklet/i.test(off), "off: WorkspaceLeaf.setViewState is Obsidian's own again (the plugin's wrap is gone)");
      const t1 = await leafTypes(o);
      c.ok(t1.some(x => x === "markdown:" + EVERY) && !t1.some(x => x.startsWith("booklet:")), "off: the pane that showed the booklet shows the note as Markdown: " + JSON.stringify(t1));
      c.ok(/typed as it goes off/.test(fs.readFileSync(path.join(vault, EVERY), "utf8")), "off: the words typed just before were written into the note");
      // while off: a booklet note opens as Markdown, a plain note too, and the editor works
      const v1 = await openAs(o, "Evening check-in.booklet.md", "new");
      const v2 = await openAs(o, "Ordinary note.md", "new");
      c.ok(v1 === "markdown" && v2 === "markdown", "off: a booklet note opens as Markdown (" + v1 + "), and so does a plain note (" + v2 + ")");
      await o.evaluate(() => { const ed = app.workspace.activeLeaf.view.editor; ed.focus(); ed.setCursor({ line: 0, ch: 0 }); });
      await o.page.keyboard.type("Edited while off. ");
      const plain = await waitDisk(path.join(vault, "Ordinary note.md"), t => t.startsWith("Edited while off. "), 8000);
      c.ok(plain.ok, "off: typing in the Markdown view of a note works and is saved");
      // on again
      await o.evaluate(async () => { await app.plugins.enablePlugin("booklet"); });
      await sleep(800);
      const on = await patch(), i2 = await info();
      c.ok(i2.view && i2.command && i2.enabled && on !== off, "on again: the view type and command are back and the wrap is installed again");
      const v3 = await openAs(o, "Evening check-in.booklet.md", "new");
      const v4 = await openAs(o, "Ordinary note.md", "new");
      c.ok(v3 === "booklet" && v4 === "markdown", "on again: a booklet note opens as a booklet (" + v3 + "), a plain note as Markdown (" + v4 + ")");
      // three more cycles: nothing is registered twice
      for (let n = 0; n < 3; n++) { await o.evaluate(async () => { await app.plugins.disablePlugin("booklet"); await app.plugins.enablePlugin("booklet"); }); await sleep(500); }
      const again = await patch();
      const dup = await o.evaluate(() => ({ commands: Object.keys(app.commands.commands).filter(x => x === "booklet:toggle-view").length, actions: [...document.querySelectorAll(".workspace-leaf-content[data-type='markdown'] .view-action[aria-label='Open as booklet']")].length, mdLeaves: app.workspace.getLeavesOfType("markdown").filter(l => /booklet\.md$/.test(l.view.file ? l.view.file.path : "")).length }));
      c.ok(dup.commands === 1 && dup.actions === dup.mdLeaves, "after three more off and on cycles: one toggle command, and one Open as booklet button for each booklet note shown as Markdown: " + JSON.stringify(dup));
      await o.evaluate(async () => { await app.plugins.disablePlugin("booklet"); });
      await sleep(400);
      c.ok((await patch()) === off, "and turned off again, setViewState is exactly Obsidian's own again (no patch left from any cycle)");
      await o.evaluate(async () => { await app.plugins.enablePlugin("booklet"); });
    });
    // (b) a pop-out window
    await withApp("c40-popout", async (o, vault) => {
      const K = kit(env, EVERY), file = path.join(vault, EVERY);
      await K.open(o, EVERY);
      await o.evaluate(async () => { const l = app.workspace.openPopoutLeaf(); window.__pop = l; await l.openFile(app.vault.getAbstractFileByPath("Every kind.booklet.md")); await l.setViewState({ type: "booklet", state: { file: "Every kind.booklet.md", version: 2, screen: "activity:/kinds", part: 0 }, active: true }); });
      let pop = null;
      for (let n = 0; n < 40 && !pop; n++) { for (const p of o.page.context().pages()) if (p !== o.page && await p.evaluate(() => document.querySelectorAll(".booklet-page").length).catch(() => 0)) pop = p; if (!pop) await sleep(250); }
      c.ok(!!pop, "a booklet note opened in a pop-out window draws there (a second window with a booklet page)");
      if (pop) {
        const info = await o.evaluate(() => { const l = window.__pop; return { type: l.view.getViewType(), own: l.view.contentEl.ownerDocument !== document }; });
        c.ok(info.type === "booklet" && info.own, "its view lives in the other window's document: " + JSON.stringify(info));
        await pop.locator(".booklet-kind-choice button.booklet-choice").nth(1).click();
        const a = await waitDisk(file, t => /"fruit": 2/.test(t));
        c.ok(a.ok, "a press in the pop-out window is written into the note");
        const f = pop.locator(".booklet-kind-text textarea").first();
        await f.click(); await pop.keyboard.type("typed in the other window");
        const b = await waitDisk(file, t => /typed in the other window/.test(t));
        c.ok(b.ok, "words typed there are written after the pause");
        await f.press("End"); await pop.keyboard.type(" and more");
        await sleep(150);
        await o.evaluate(() => { window.__pop.getContainer().win.close(); });
        const d = await waitDisk(file, t => /typed in the other window and more/.test(t), 3000);
        c.ok(d.ok, "words typed and the pop-out window closed 150 ms later: written at once (" + d.ms + " ms)");
        const left = await leafTypes(o);
        for (let n = 0; n < 20 && !pop.isClosed(); n++) await sleep(100);
        c.ok(pop.isClosed() && !o.page.context().pages().includes(pop), "the pop-out window's page is gone from the browser's pages");
        c.ok(left.includes("booklet:" + EVERY), "the main window's booklet view is as it was: " + JSON.stringify(left));
      }
    });
    // (c) two panes on one note, one of them in a stacked tab group
    await withApp("c40-panes", async (o, vault) => {
      const K = kit(env, EVERY), file = path.join(vault, EVERY);
      await K.open(o, EVERY); await K.goTo(o, "activity:/kinds");
      await o.evaluate(async () => { const l = app.workspace.getLeaf("split", "vertical"); window.__b = l; await l.openFile(app.vault.getAbstractFileByPath("Every kind.booklet.md")); await l.setViewState({ type: "booklet", state: { file: "Every kind.booklet.md", version: 2, screen: "activity:/kinds", part: 0 }, active: true }); });
      await o.page.waitForFunction(sel => document.querySelectorAll(sel + " .booklet-page[data-booklet-screen='activity:/kinds']").length === 2, BOOK, { timeout: 8000 });
      // the second pane's tab group is stacked, with a second tab in it
      const stacked = await o.evaluate(async () => {
        const l = window.__b, g = l.parent;
        if (typeof g.setStacked === "function") g.setStacked(true);
        const other = app.workspace.createLeafInParent(g, g.children.length);
        await other.openFile(app.vault.getAbstractFileByPath("Ordinary note.md"));
        app.workspace.setActiveLeaf(l, { focus: true });
        return { stacked: !!g.isStacked, tabs: g.children.length, cls: g.containerEl.className };
      });
      c.ok(stacked.tabs === 2 && stacked.stacked, "the second pane sits in a stacked tab group of two tabs: " + JSON.stringify(stacked));
      await sleep(600);
      const panes = () => o.evaluate(sel => [...document.querySelectorAll(sel)].map(v => ({ pressed: [...v.querySelectorAll(".booklet-kind-choice button.booklet-choice")].filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.textContent.trim()), text: (v.querySelector(".booklet-kind-text textarea") || {}).value })), BOOK);
      const first = o.page.locator(BOOK).nth(0), second = o.page.locator(BOOK).nth(1);
      await first.locator(".booklet-kind-choice button.booklet-choice").nth(1).click();
      await waitDisk(file, t => /"fruit": 2/.test(t));
      await o.page.waitForFunction(sel => [...document.querySelectorAll(sel)].every(v => [...v.querySelectorAll(".booklet-kind-choice button.booklet-choice")].some(b => b.getAttribute("aria-pressed") === "true")), BOOK, { timeout: 6000 });
      let p = await panes();
      c.ok(p.length === 2 && p.every(x => same(x.pressed, ["Pear"])), "a press in one pane shows in the other: " + JSON.stringify(p.map(x => x.pressed)));
      await second.locator(".booklet-kind-text textarea").first().click();
      await o.page.keyboard.type("typed in the stacked pane");
      await o.evaluate(() => document.activeElement && document.activeElement.blur());
      await waitDisk(file, t => /typed in the stacked pane/.test(t));
      await o.page.waitForFunction(sel => [...document.querySelectorAll(sel)].every(v => (v.querySelector(".booklet-kind-text textarea") || {}).value === "typed in the stacked pane"), BOOK, { timeout: 6000 });
      p = await panes();
      c.ok(p.every(x => x.text === "typed in the stacked pane"), "words typed in the other pane show in the first: " + JSON.stringify(p.map(x => x.text)));
      await first.locator(".booklet-kind-scale button.booklet-choice").nth(2).click();
      await first.locator(".booklet-kind-choice button.booklet-choice").nth(2).click();
      const e = await waitDisk(file, t => /"fruit": 3/.test(t) && /"sure": 3/.test(t));
      const text = e.text;
      c.ok(e.ok && text.split("```booklet answers").length === 2 && text.split("%%\n> [!records]").length === 2, "after presses in both panes: one records region, one answers block, nothing doubled");
      await o.page.waitForFunction(sel => { const r = [...document.querySelectorAll(sel)].map(v => [...v.querySelectorAll(".booklet-kind-choice button.booklet-choice")].filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.textContent.trim()).join()); return r.length === 2 && r[0] === r[1] && r[0] === "Plum"; }, BOOK, { timeout: 6000, polling: 100 }).catch(() => {});
      const mixed = await o.evaluate(sel => [...document.querySelectorAll(sel)].map(v => [...v.querySelectorAll(".booklet-kind-choice button.booklet-choice")].filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.textContent.trim()).join()), BOOK);
      c.ok(mixed.length === 2 && mixed[0] === mixed[1] && mixed[0] === "Plum", "and both panes show the same answers: " + JSON.stringify(mixed));
    });
    // (d) restart with the pane open: same screen, tab and page
    await withApp("c40-restart", async (o, vault) => {
      put(vault, WIKI, fs.readFileSync(path.join(__dirname, "..", "test", "page-notes", WIKI)));
      const K = kit(env, WIKI);
      o.page.on("dialog", d => { d.accept().catch(() => {}); });
      await o.evaluate(() => { window.addEventListener("beforeunload", () => {}); });   // see check 38: the harness's browser needs a listener of the page's own to show Obsidian's unload prompt
      await K.open(o, WIKI);
      await o.evaluate(async () => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 2, screen: "activity:calm/check-in", tab: "wiki", page: "grid", part: 0 }, active: true }); });
      await o.page.waitForSelector(BOOK + " .booklet-page[data-booklet-screen='activity:calm/check-in']", { timeout: 8000 });
      await quiet(o);
      const here = () => o.evaluate(sel => { const l = app.workspace.getLeavesOfType("booklet")[0]; const st = l ? l.getViewState().state : null; const v = document.querySelector(sel + " .booklet-page"); return { state: st && { screen: st.screen, tab: st.tab, page: st.page, part: st.part, file: st.file }, title: (v && (v.querySelector(".booklet-page-title, h2, h1") || {}).textContent) || null, text: v ? v.textContent.replace(/\s+/g, " ").slice(0, 200) : null, tabShown: [...document.querySelectorAll(sel + " [role=tab][aria-selected=true]")].map(t => t.textContent.trim()) }; }, BOOK);
      const before = await here();
      c.ok(before.state && before.state.page === "grid" && before.title === "The feelings grid", "before the restart the pane is on the wiki tab, on the page The feelings grid: " + JSON.stringify(before));
      await sleep(3000);   // Obsidian saves the layout a moment after it changes
      const saved = JSON.stringify(JSON.parse(fs.readFileSync(path.join(vault, ".obsidian", "workspace.json"), "utf8")));
      c.ok(/"page":"grid"/.test(saved), "the layout file holds the page, beside the note's name: " + (saved.match(/"type":"booklet","state":\{[^}]*\}/) || ["no booklet leaf found"])[0]);
      await o.evaluate(() => { setTimeout(() => require("electron").remote.getCurrentWindow().close(), 0); }).catch(() => {});
      for (let n = 0; n < 50; n++) { try { process.kill(mainPid(o.port), 0); } catch (e) { break; } await sleep(100); }
      await o.close();
      const o2 = await relaunch(o, "c40-restart-again");
      try {
        await o2.page.waitForSelector(BOOK + " .booklet-page[data-booklet-screen='activity:calm/check-in']", { timeout: 20000 });
        await quiet(o2);
        const after = await o2.evaluate(sel => { const l = app.workspace.getLeavesOfType("booklet")[0]; const st = l ? l.getViewState().state : null; const v = document.querySelector(sel + " .booklet-page"); return { state: st && { screen: st.screen, tab: st.tab, page: st.page, part: st.part, file: st.file }, text: v ? v.textContent.replace(/\s+/g, " ").slice(0, 200) : null }; }, BOOK);
        c.ok(same(after.state, before.state) && after.text === before.text, "after the restart the pane is back on the same note, screen, tab and page, drawn the same: " + JSON.stringify(after.state));
      } finally { await o2.close(); }
    });
    return c;
  }

  /* ================= CHECK 41 ================= */
  // a large note: 3000 kept days (about eight years) of a daily tracker, with a line chart and a table over all of them
  const DAYS = 3000, BIG = "Big tracker.booklet.md";
  const bigText = () => {
    const end = Date.UTC(2026, 9, 30), items = [];
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(end - (DAYS - 1 - i) * 86400000).toISOString().slice(0, 10);
      const sleep = 5 + ((i * 7) % 9), mood = 1 + ((i * 5) % 4), verdict = 1 + ((i * 11) % 3);
      items.push(JSON.stringify({ ts: d + "T08:00:00Z", sleep, mood, verdict, note: "Day " + (i + 1) + ": a made-up line about the garden, the tides and a long walk." }));
    }
    return `---
booklet: "0.19"
id: booklet-test/big-tracker
title: Big tracker
lang: en
---

> [!activity|log repeat daily] Daily log

A made-up daily log with eight years of kept days.

> [!number|sleep min:0 max:14] Hours slept

> [!scale|mood] Mood

1. Low
2. Okay
3. Good
4. Bright

> [!choice|verdict] Verdict on the day
- [ ] good
- [ ] warn
- [ ] bad

> [!text|note] One line about the day

> [!activity|line] Mood over every day

\`\`\`booklet query
from: log
as: line
fields: mood
\`\`\`

> [!activity|bars] The last month

\`\`\`booklet query
from: log
as: bars
value: sleep
tone: verdict
limit: 30
\`\`\`

> [!activity|table] Every kept day

\`\`\`booklet query
from: log
as: table
fields: date, sleep, mood, verdict, note
\`\`\`

%%
> [!records] App record — do not edit below this line

\`\`\`booklet entries log
{"items": [
${items.join(",\n")}
]}
\`\`\`
%%
`;
  };
  async function check41() {
    const c = new Check(41, "a large note: " + DAYS + " kept days of a daily tracker with a line over all of them and a table of all of them: time to draw each screen, from a press to the file written, typing, the heap, console errors");
    // the measured times are in the lines below; each limit is at least three times the slowest measured, so that a loaded box does not fail it
    const LIMIT_VIEW = 2000, LIMIT_PRESS = 500;
    await withApp("c41", async (o, vault) => {
      const text = bigText();
      const file = put(vault, BIG, text);
      c.info("the note is " + (text.length / 1024).toFixed(0) + " KiB, " + text.split("\n").length + " lines, " + DAYS + " kept days (" + new Date(Date.UTC(2026, 9, 30) - (DAYS - 1) * 86400000).toISOString().slice(0, 10) + " to 2026-10-30)");
      const K = kit(env, BIG);
      const heap = () => o.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
      // long tasks (the main thread busy for 50 ms or more) are recorded from here on
      await o.evaluate(() => { window.__long = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ entryTypes: ["longtask"] }); } catch (e) { /* no longtask support */ } });
      const longs = () => o.evaluate(() => { const r = window.__long.slice(); window.__long.length = 0; return r; });
      const h0 = await heap();
      // time to first draw: from the call that opens the note to the page drawn, with every piece of Markdown rendered and no write under way
      await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, BIG, { timeout: 30000, polling: 100 });
      await longs();
      const t0 = Date.now();
      await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, BIG);
      await o.page.waitForSelector(BOOK + " .booklet-page", { timeout: 30000 });
      await quiet(o);
      const firstDraw = Date.now() - t0;
      c.ok(firstDraw < LIMIT_VIEW, "time to first draw of the home screen: " + firstDraw + " ms (limit " + LIMIT_VIEW + "); long tasks " + JSON.stringify(await longs()));
      // each screen, the way a reader gets to it
      const screenTime = async (screen, ready) => {
        const t = Date.now();
        await o.evaluate(async screen => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 2, screen, part: 0 }, active: true }); }, screen);
        await o.page.waitForSelector(BOOK + " .booklet-page[data-booklet-screen='" + screen + "'] " + ready, { timeout: 30000 });
        await quiet(o);
        return Date.now() - t;
      };
      const tLog = await screenTime("activity:/log", ".booklet-kind-number");
      c.ok(tLog < LIMIT_VIEW, "the daily log's screen (its fields, and the newest of the " + DAYS + " kept days): " + tLog + " ms; long tasks " + JSON.stringify(await longs()));
      const nEntries = await entryCount(o);
      c.info("kept days listed on that screen at first: " + nEntries + " of " + DAYS);
      const tLine = await screenTime("activity:/line", "svg");
      c.ok(tLine < LIMIT_VIEW, "the line over all " + DAYS + " days: " + tLine + " ms; long tasks " + JSON.stringify(await longs()));
      const tBars = await screenTime("activity:/bars", ".booklet-query");
      c.ok(tBars < LIMIT_VIEW, "the bars of the last 30 days: " + tBars + " ms; long tasks " + JSON.stringify(await longs()));
      const tTable = await screenTime("activity:/table", "table");
      const rows = await o.evaluate(sel => document.querySelectorAll(sel + " table tbody tr").length, BOOK);
      c.ok(tTable < LIMIT_VIEW, "the table of every kept day (" + rows + " rows drawn): " + tTable + " ms; long tasks " + JSON.stringify(await longs()));
      // the words set without the renderer are the words the renderer gives (the table's choice and scale cells)
      const same2 = await o.evaluate(async sel => {
        const view = app.workspace.getLeavesOfType("booklet")[0].view;
        const cell = document.querySelector(sel + " table tbody tr:nth-child(1)");
        const texts = [...cell.querySelectorAll("td")].map(t => t.textContent);
        const out = [];
        for (const w of [texts[2], texts[3]]) { const d = document.createElement("div"); view.md(w, d); for (let n = 0; n < 200 && !d.textContent; n++) await new Promise(r => setTimeout(r, 10)); out.push([w, d.textContent.trim()]); }
        return { texts, out };
      }, BOOK);
      c.ok(same2.out.every(([a, b]) => a === b && a !== ""), "the choice and scale words in the table's first row are the words Obsidian's renderer gives for them: " + JSON.stringify(same2));
      const h1 = await heap();
      c.info("JS heap used: " + h0 + " MiB before the note was opened, " + h1 + " MiB after drawing every screen");
      // a press: from the click to the file holding it, and to the button showing it
      await K.goTo(o, "activity:/log");
      await longs();
      const press = async (n, label) => {
        const t = Date.now();
        const btn = inCard(o, "/log", ".booklet-kind-choice button.booklet-choice").nth(n);
        await btn.click();
        const shown = await o.page.waitForFunction(([sel, n]) => document.querySelectorAll(sel + " .booklet-kind-choice button.booklet-choice")[n].getAttribute("aria-pressed") === "true", [cardSel("/log"), n], { timeout: 10000, polling: 5 }).then(() => Date.now() - t);
        const w = await waitDisk(file, tx => new RegExp('```booklet draft log\\n[^\\n]*"verdict":\\s*' + (n + 1) + '[,}]').test(tx), 15000);
        return { shown, written: Date.now() - t, ok: w.ok };
      };
      const p1 = await press(1), p2 = await press(2), p3 = await press(0);
      c.ok(p1.ok && p2.ok && p3.ok && Math.max(p1.shown, p2.shown, p3.shown) < LIMIT_PRESS, "a press shows at once (" + [p1, p2, p3].map(x => x.shown + " ms").join(", ") + ") and is in the file after " + [p1, p2, p3].map(x => x.written + " ms").join(", ") + "; long tasks " + JSON.stringify(await longs()));
      // typing: a key every 60 ms for 3 s; how long the main thread stalls, and the text arrives whole
      const word = "Typing into a note of " + DAYS + " kept days";
      const field = inCard(o, "/log", ".booklet-kind-text input, .booklet-kind-text textarea").first();
      await field.click();
      await longs();
      const tt = Date.now();
      for (const ch of word) { await o.page.keyboard.type(ch); await sleep(60); }
      await o.evaluate(() => document.activeElement && document.activeElement.blur());
      const typedAll = await waitDisk(file, t => t.includes('"note":"' + word + '"'), 15000);
      const lg = await longs();
      c.ok(typedAll.ok, "text typed for " + (Date.now() - tt) + " ms arrived whole; long tasks while typing: " + JSON.stringify(lg) + " (a write every 700 ms)");
      c.ok(Math.max(0, ...lg) < LIMIT_PRESS, "no stall of " + LIMIT_PRESS + " ms or more while typing: worst " + Math.max(0, ...lg) + " ms");
      const fin = Date.now();
      await inCard(o, "/log", "button.booklet-finalize").click();
      const kept = await waitDisk(file, t => t.split("\n").filter(l => l.startsWith('{"ts"')).length === DAYS + 1, 20000);
      c.ok(kept.ok, "Finalize keeps the " + (DAYS + 1) + "th day: in the file " + (Date.now() - fin) + " ms after the press");
      // only the records region changed; the earlier days are as they were
      const after = kept.text;
      const lines0 = text.split("\n"), lines1 = after.split("\n");
      c.ok(after.slice(0, text.indexOf("%%\n> [!records]")) === text.slice(0, text.indexOf("%%\n> [!records]")) && lines1.filter(l => l.startsWith('{"ts"')).slice(0, DAYS).every((l, i) => l.replace(/,$/, "") === lines0.filter(x => x.startsWith('{"ts"'))[i].replace(/,$/, "")), "the design and the " + DAYS + " earlier days are as they were after all of it");
      c.info("JS heap used after the presses, typing and Finalize: " + (await heap()) + " MiB, and " + (await (async () => { await sleep(8000); return heap(); })()) + " MiB after 8 s idle");
      c.info("file size after: " + (after.length / 1024).toFixed(0) + " KiB");
    });
    return c;
  }

  /* ================= CHECK 37 ================= */
  // another plugin rewrites the note whenever it is saved. The Linter plugin itself is a downloaded third-party plugin and is run by hand in a
  // scratch vault; this check runs a stand-in that does what a formatter does, on every change to the note: it strips trailing
  // spaces outside code fences, collapses runs of blank lines, puts a blank line round headings, adds a `date modified` key to the front
  // matter and ends the file with one newline.
  const FORMAT = "Formatted.booklet.md";
  const formattedText = () => `---
title: Formatted
booklet: "0.19"
id: booklet-test/formatted
lang: en
---

> [!activity|day repeat] A day   

## A heading in the prose
Words with trailing spaces here.   
	

Words after two blank lines.



> [!choice|feel] How do you feel?
- [ ] Calm  
- [ ] Tense
- [ ] Tired

> [!text|why] Why?

%%
> [!records] App record — do not edit below this line

\`\`\`booklet entries day
{"items": [
{"ts": "2026-10-01T08:00:00Z", "feel": 1, "why": "Kept before"}
]}
\`\`\`
%%`;
  // the stand-in, as source text for the page (it runs there): returns the formatted text
  const FORMATTER = `((t, stamp = "2026-11-01") => {
    const lines = t.replace(/\\r\\n/g, "\\n").split("\\n"); let fence = false; const out = [];
    for (const l of lines) { const mark = /^ {0,3}(\`\`\`|~~~)/.test(l); if (mark) fence = !fence; out.push(fence || mark ? l : l.replace(/[ \\t]+$/, "")); }
    const spaced = [];
    let fenceB = false;
    for (let i = 0; i < out.length; i++) {
      const l = out[i], mark = /^ {0,3}(\`\`\`|~~~)/.test(l); if (mark) fenceB = !fenceB;
      if (!fenceB && !mark && l === "" && spaced[spaced.length - 1] === "") continue;   // runs of blank lines
      if (!fenceB && /^#{1,6} /.test(l)) { if (spaced.length && spaced[spaced.length - 1] !== "") spaced.push(""); spaced.push(l); if (out[i + 1] !== undefined && out[i + 1] !== "") spaced.push(""); continue; }
      spaced.push(l);
    }
    let s = spaced.join("\\n");
    s = /^date modified:/m.test(s.split("\\n---")[0]) ? s.replace(/^date modified:.*$/m, "date modified: " + stamp) : s.replace(/\\n---\\n/, "\\ndate modified: " + stamp + "\\n---\\n");
    return s.replace(/\\n*$/, "\\n");
  })`;
  async function check37() {
    const c = new Check(37, "another plugin rewrites the note whenever it is saved (a stand-in formatter: trailing spaces, blank lines, headings, front matter, final newline): answers given, answers being typed and answers pressed after it all survive; only the records region is ever written by the plugin");
    await withApp("c37", async (o, vault) => {
      const file = put(vault, FORMAT, formattedText());
      const K = kit(env, FORMAT);
      await K.open(o, FORMAT); await K.goTo(o, "activity:/day");
      const fmt = text => o.evaluate(([src, t]) => eval(src)(t), [FORMATTER, text]);
      // 1. the formatter runs once over the note as it is: the kept day, the view, the design
      await o.evaluate(async ([src, rel]) => { const f = app.vault.getAbstractFileByPath(rel); const t = await app.vault.read(f); await app.vault.modify(f, eval(src)(t)); }, [FORMATTER, FORMAT]);
      await sleep(1200);
      const f1 = fs.readFileSync(file, "utf8");
      c.ok(!/[ \t]+\n/.test(f1.replace(/```[\s\S]*?```/g, "")) && /date modified: \d{4}-\d{2}-\d{2}/.test(f1) && f1.endsWith("\n"), "the stand-in rewrote the file: trailing spaces gone, a date modified key added, one newline at the end");
      c.ok((await entryCount(o)) === 1 && !!(await pageWords(o)).match(/Words after two blank lines/), "the open view followed it: the kept day is still listed, the design is still shown");
      c.ok(fs.readFileSync(file, "utf8") === f1, "and the plugin wrote nothing back over the formatter's text");
      // 2. words typed and not yet written when the formatter rewrites the note
      await inCard(o, "/day", ".booklet-kind-text input, .booklet-kind-text textarea").first().click();
      await o.page.keyboard.type("typed while it formats");
      await o.evaluate(async ([src, rel]) => { const f = app.vault.getAbstractFileByPath(rel); const t = await app.vault.read(f); await app.vault.modify(f, eval(src)(t).replace("Words after two blank lines.", "Words after two blank lines, changed.")); }, [FORMATTER, FORMAT]);
      await sleep(300);
      c.ok((await fieldWords(o)) === "typed while it formats", "words being typed when the note was rewritten are still in their field: " + JSON.stringify(await fieldWords(o)));
      const w2 = await waitDisk(file, t => /"why":"typed while it formats"/.test(t) && /changed\./.test(t));
      c.ok(w2.ok, "and are written after the pause into the rewritten note (the formatter's change and the typed words are both in the file)");
      await o.evaluate(() => document.activeElement && document.activeElement.blur());
      // 3. a press after it: only the records region changes
      const before = fs.readFileSync(file, "utf8");
      await inCard(o, "/day", ".booklet-kind-choice button.booklet-choice").nth(1).click();
      const w3 = await waitDisk(file, t => /"feel":\s*2/.test(t));
      const regionAt = t => t.indexOf("%%\n> [!records]");
      c.ok(w3.ok && w3.text.slice(0, regionAt(before)) === before.slice(0, regionAt(before)), "a press after the rewrite changes only the records region: the design above it is the formatter's bytes");
      // 4. a formatter that rewrites after every save: three presses and some typing, each answer in the end
      await o.evaluate(([src, rel]) => {
        window.__fmtRuns = 0; window.__mine = null;
        const f = app.vault.getAbstractFileByPath(rel);
        // a formatter with a "date modified" rule: the note is rewritten after each save of the plugin's (and not after its own rewrite)
        window.__ref = app.vault.on("modify", async file => { if (file !== f) return; const t = await app.vault.read(f); if (t === window.__mine) return; const n = eval(src)(t, "run-" + (++window.__fmtRuns)); window.__mine = n; await app.vault.modify(f, n); });
      }, [FORMATTER, FORMAT]);
      const answerBlock = t => (t.match(/```booklet draft day\n([^\n]*)\n```/) || [])[1];
      await inCard(o, "/day", ".booklet-kind-choice button.booklet-choice").nth(0).click();
      await sleep(400);
      await inCard(o, "/day", ".booklet-kind-choice button.booklet-choice").nth(2).click();
      await sleep(400);
      await inCard(o, "/day", ".booklet-kind-text input, .booklet-kind-text textarea").first().click();
      await o.page.keyboard.press("End");
      await o.page.keyboard.type(" and again");
      await o.evaluate(() => document.activeElement && document.activeElement.blur());
      const w4 = await waitDisk(file, t => { const b = answerBlock(t); return b && /"feel":\s*3/.test(b) && /and again/.test(b); }, 12000);
      await sleep(1500);
      const runs = await o.evaluate(() => { app.vault.offref(window.__ref); return window.__fmtRuns; });
      c.ok(w4.ok, "with the formatter rewriting after every save, the last press and the typed words reached the note: " + JSON.stringify(answerBlock(fs.readFileSync(file, "utf8"))));
      c.ok(runs >= 3 && runs < 20 && /date modified: run-\d+/.test(fs.readFileSync(file, "utf8")), "and it settled: the formatter rewrote the note " + runs + " times in all, once for each save of the plugin's, not in a loop");
      const last = fs.readFileSync(file, "utf8");
      c.ok((await pressedWords(o)).join() === "Tired", "the view shows the last press: " + JSON.stringify(await pressedWords(o)));
      c.ok(JSON.parse(((last.match(/```booklet entries day\n([\s\S]*?)\n```/) || [])[1] || "{}")).items.length === 1, "the kept day is still the one kept day");
    });
    return c;
  }

  return { 35: check35, 36: check36, 37: check37, 38: check38, 39: check39, 40: check40, 41: check41 };
};
