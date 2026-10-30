// Plugin check: drives the "Booklet" plugin in a real Obsidian and checks what it does.
//   PLAYWRIGHT=<node_modules path> node plugin-check.js --obsidian <obsidian binary> --vault <test-vault> --out <dir> [--only 1,3] [--lint <lint-booklet.py>]
// It NEVER touches --vault: every check works on its own fresh copy of the vault and its own scratch config folder, both
// under <out>/work-<time>/. Prints one PASS/FAIL line per check (with the evidence under it) and exits 1 on any FAIL.
// Checks: 1 opens and toggles; 2 draws natively (screenshots); 3 answers reach the records on disk; 4 an open Markdown
// editor survives interleaved typing; 5 the text field keeps focus across a write; 6 every common kind, a shared list
// and a widget are answered and cleared, checked on disk, and the first answer to a note with no records does not
// redraw the view, and a change made on disk while a field is being edited leaves that field and what was typed in it
// alone; 7 drafts, Finalize and kept entries, for `repeat` and `repeat daily` (finishing twice in a day replaces that
// day's entry), and a draft survives a reload of the view; 8 the same with the note also open in a Markdown pane
// (nothing lost or doubled, the buffer equals the disk), and a change made in that pane while a field is being edited;
// 9 layout: a text box's border in the dark theme, room at the view's foot, the grid's cell names on their colours,
// touch sizes (the tracker, and the check-in note with a place open, also in a window a phone's width), and the
// tracker's and check-in note's screenshots in light, dark and mobile emulation; 11 the check-in note's widgets and shared list: drawn, answered and
// cleared on disk with words of the reader's own, a widget's own field kept while the note changes, its words added
// when it is left (by a press, in booklet.html's order, a click elsewhere, another note, Finalize, closing the pane), a
// press on the very item or place word the words name held as booklet.html holds it, finished and kept,
// in one pane and with a Markdown pane; 12 the question asked for each feeling picked (each:): answered, a feeling
// taken back and picked again, a copy's field kept while copies come and go around it, Finalize, a wrong-shape answer
// left alone, in one pane and with a Markdown pane; 13 the reader's earlier words offered again (earlier:, format 0.16):
// under every body place and under the thoughts, in a group named Earlier words, a tap storing
// what typing would, today's entry not a source, own options from the pairs whose pick is held, in one pane and with a
// Markdown pane, then touch sizes and screenshots at a phone's width; 14 Add your own adds the words typed when it is
// left (format 0.16), on a choice and a multi, and a note marked 0.15 opens with its notice; 15 the check-in note's weekly
// roll-up (format 0.16 queries: a span of days and a summary) drawn from made-up entries, an older entry and the draft not
// counted, nothing written, an entry kept showing at once, then screenshots at a desktop's and a phone's width, light and
// dark; 16 to 23 (nav-checks.js, the 0.6.0 navigation): 16 the three screens and the moves, 17 Back is free, 18 no step for a
// tab, 19 no move is lost, 20 outside links, 21 icons (all 161), 22 the finish and the kept-entries fold, 23 the phone; 29 to 32 (0.9.0, dashboards; dashboard-checks.js): charts, data blocks and the kept days in every view, the reader's sort and filter, deleting a kept entry; 27 and 28 (0.8.0, page trees, ahead of format 0.17; nav-checks.js): a made-up wiki of 13 pages in three levels, and the check-in as one activity with a wiki tab; 10 (run last) no error or warning from the plugin in Obsidian's console, over every check that ran.
const fs = require("fs"), path = require("path"), cp = require("child_process");
const { launch } = require("./drive");

const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
opt.obsidian = opt.obsidian || process.env.OBSIDIAN; opt.vault = opt.vault || process.env.VAULT;
if (!opt.obsidian || !opt.vault || !opt.out) { console.error("need --obsidian, --vault (the repository's test-vault) and --out"); process.exit(2); }
const LINT = opt.lint || process.env.BOOKLET_LINTER || "/workspace/booklet/lint-booklet.py";
// check 10 reads the console over every check that ran, so it runs last whatever order is asked for
const only = (opt.only ? opt.only.split(",").map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 10]).sort((a, b) => (a === 10) - (b === 10));
const SRC_VAULT = path.resolve(opt.vault);
const WORK = path.join(path.resolve(opt.out), "work-" + new Date().toISOString().replace(/[:.]/g, "-"));
const SHOTS = path.join(path.resolve(opt.out), "shots");
fs.mkdirSync(WORK, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });

const EVENING = "Evening check-in.booklet.md", KEPT = "Kept records.booklet.md", ORDINARY = "Ordinary note.md";
const EVERY = "Every kind.booklet.md", DAILY = "Daily tracker.booklet.md", CHECKIN = "Check-in.booklet.md";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, runNo = 0;
const consoleReport = [];   // {where, kind, text}
const timings = [];         // {name, ms}
const sessions = [];        // the Obsidian sessions whose console was watched, by name

/* ---------- reporting ---------- */
let currentCheck = null;   // the check being run, so a crash keeps what it had found so far
class Check {
  constructor(n, title) { this.n = n; this.title = title; this.items = []; this.bad = 0; currentCheck = this; }
  ok(cond, msg) { this.items.push((cond ? "ok    " : "FAIL  ") + msg); if (!cond) this.bad++; return cond; }
  info(msg) { this.items.push("info  " + msg); }
  print(ms) {
    const pass = this.bad === 0; if (!pass) fails++;
    console.log((pass ? "PASS  " : "FAIL  ") + "check " + this.n + ": " + this.title + "  [" + ms + " ms]");
    for (const i of this.items) console.log("        " + i);
  }
}

/* ---------- a fresh vault copy + fresh config + a launched Obsidian, for one check ---------- */
async function withApp(name, fn) {
  const dir = path.join(WORK, String(++runNo) + "-" + name);
  const vault = path.join(dir, "vault"), configDir = path.join(dir, "config");
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(SRC_VAULT, vault, { recursive: true });
  const t0 = Date.now();
  const o = await launch({ obsidian: path.resolve(opt.obsidian), vault, configDir });
  sessions.push(name);
  const launchMs = Date.now() - t0; timings.push({ name: name + " launch", ms: launchMs });
  o.page.on("console", m => { if (m.type() === "error" || m.type() === "warning") consoleReport.push({ where: name, kind: "console." + m.type(), text: m.text().slice(0, 400), url: (m.location() || {}).url || "" }); });
  o.page.on("pageerror", e => consoleReport.push({ where: name, kind: "pageerror", text: String(e && (e.stack || e.message) || e).slice(0, 600), url: "" }));
  try { return await fn(o, vault, launchMs); }
  finally {
    const out = o.output().trim();
    if (out) for (const line of out.split("\n")) if (/error|exception|fail/i.test(line)) consoleReport.push({ where: name, kind: /^Ignored: Error: ENOENT.*\/obsidian\/e2e\w+\.json/.test(line) ? "stdout/stderr (harness noise: Obsidian looks for a per-vault json it has not written yet)" : "stdout/stderr", text: line.slice(0, 400) });
    await o.close();
  }
}

/* ---------- helpers ---------- */
const rootLeaves = o => o.evaluate(() => { const r = []; app.workspace.iterateRootLeaves(l => { r.push({ type: l.view.getViewType(), file: (l.view.file && l.view.file.path) || null, active: l === app.workspace.activeLeaf }); }); return r;  /* braces: a callback returning truthy stops the iteration */ });
const activeType = o => o.evaluate(() => app.workspace.activeLeaf && app.workspace.activeLeaf.view.getViewType());
async function waitActiveType(o, type, timeout = 6000) {
  try { await o.page.waitForFunction(t => app.workspace.activeLeaf && app.workspace.activeLeaf.view.getViewType() === t, type, { timeout, polling: 50 }); return true; } catch (e) { return false; }
}
async function waitFile(o, rel, timeout = 8000) {   // some root leaf shows that file
  try { await o.page.waitForFunction(p => { let f = false; app.workspace.iterateRootLeaves(l => { if (l.view.file && l.view.file.path === p) f = true; }); return f; }, rel, { timeout, polling: 50 }); return true; } catch (e) { return false; }
}
const BOOK = ".workspace-leaf-content[data-type='booklet']";
const MD = ".workspace-leaf-content[data-type='markdown']";
const read = (vault, rel) => fs.readFileSync(path.join(vault, rel), "utf8");
// The errors the linter is expected to report on a test-vault note, by its file name, and no others: none on any of them
// with the format 0.16 linter (the check-in note's each:, earlier: and blue and purple cells are format 0.16's).
// test/helpers.mjs keeps the same list.
const EXPECTED_LINT = {};
// ok: the linter reports exactly the note's expected errors, each once, and nothing else (none for any other note)
function lint(file) {
  const r = cp.spawnSync("python3", ["-I", LINT, file], { encoding: "utf8" });
  const all = ((r.stdout || "") + (r.stderr || "")).trim().split("\n"), want = EXPECTED_LINT[path.basename(file)] || [];
  const errors = all.filter(l => l.startsWith("ERROR"));
  const ok = r.status === (want.length ? 1 : 0) && errors.length === want.length && want.every(re => errors.filter(l => re.test(l)).length === 1) && new RegExp(" " + want.length + " errors? ").test(all.join("\n"));
  return { code: r.status, ok, out: (want.length ? errors.map(l => l.replace(/^ERROR \S+: /, "ERROR ")).concat(all.slice(-1)) : all.slice(-3)).join(" | ") };
}
const regionAt = text => { const m = /%%\n> \[!records\]/.exec(text); return m ? m.index : -1; };
const blocks = text => { const r = []; const re = /```(booklet [^\n]*)\n([\s\S]*?)\n```/g; let m; while ((m = re.exec(text))) r.push({ head: m[1], body: m[2] }); return r; };
const answersOf = text => { const b = blocks(text).find(x => x.head === "booklet answers"); if (!b) return null; try { return JSON.parse(b.body); } catch (e) { return "UNPARSEABLE: " + b.body; } };
const count = (s, needle) => s.split(needle).length - 1;
const clickChoice = (o, text) => o.page.locator(BOOK + " button.booklet-choice", { hasText: text }).first().click({ timeout: 5000 });
const clickScale = (o, n) => o.page.locator(BOOK + " .booklet-scale button.booklet-choice").nth(n).click({ timeout: 5000 });
const bookletField = o => o.page.locator(BOOK + " input.booklet-text").first();
const cursorOf = o => o.evaluate(() => { let c = null; app.workspace.iterateRootLeaves(l => { if (l.view.getViewType() === "markdown") c = l.view.editor.getCursor(); }); return c; });
const mdBuffer = o => o.evaluate(() => { let v = null; app.workspace.iterateRootLeaves(l => { if (l.view.getViewType() === "markdown") v = l.view.editor.getValue(); }); return v; });
async function focusMdEditor(o, atProseEnd) {
  return o.evaluate(atProseEnd => {
    let leaf = null; app.workspace.iterateRootLeaves(l => { if (l.view.getViewType() === "markdown") leaf = l; });
    app.workspace.setActiveLeaf(leaf, { focus: true });
    const ed = leaf.view.editor;
    if (atProseEnd) { const n = ed.getValue().split("\n").findIndex(x => x.endsWith("any answer will do.")); ed.setCursor({ line: n, ch: ed.getLine(n).length }); }
    ed.focus();
    return { cursor: ed.getCursor(), focused: !!document.activeElement.closest(".cm-editor"), mode: leaf.view.getMode() };
  }, atProseEnd);
}
// open a note (the Evening note unless named) in a second pane as Markdown, with the first pane the booklet. Returns details.
async function splitWithMarkdown(o, c, rel = EVENING) {
  await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, rel);
  await waitActiveType(o, "booklet");
  await o.evaluate(async rel => { const l = app.workspace.getLeaf("split", "vertical"); await l.openFile(app.vault.getAbstractFileByPath(rel)); }, rel);
  await waitFile(o, rel);
  await sleep(500);
  const mid = await rootLeaves(o);
  await o.page.locator(BOOK + " .view-action[aria-label='Show Markdown']").last().click({ timeout: 5000 });
  await sleep(800);
  const leaves = await rootLeaves(o);
  const types = leaves.map(l => l.type).sort();
  c.info("after split + open: leaf types " + JSON.stringify(mid.map(l => l.type)) + "; after toggling the new leaf: " + JSON.stringify(leaves.map(l => l.type + (l.file ? " " + l.file : ""))));
  const mode = await o.evaluate(() => { let m = null; app.workspace.iterateRootLeaves(l => { if (l.view.getViewType() === "markdown") m = l.view.getMode(); }); return m; });
  if (START[rel]) await goTo(o, START[rel]);   // a note of several activities opens on its home or a module's screen
  return { types, mode, leaves };
}

/* ================= CHECK 1 ================= */
async function check1() {
  const c = new Check(1, "the view opens and toggles");
  await withApp("c1", async (o, vault, launchMs) => {
    c.info("launch took " + launchMs + " ms");
    // right after launch: was the metadata cache warm for the note?
    const warm = await o.evaluate(rel => { const f = app.vault.getAbstractFileByPath(rel); return { cached: !!app.metadataCache.getFileCache(f), fm: !!(app.metadataCache.getFileCache(f) || {}).frontmatter }; }, EVENING);
    c.info("metadata cache at first look: " + JSON.stringify(warm));
    // 1a: click in the file explorer
    await o.page.waitForSelector(".nav-file-title[data-path='" + EVENING + "']", { timeout: 10000 });
    const cachedAtClick = await o.evaluate(rel => !!(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(rel)) || {}).frontmatter, EVENING);
    await o.page.click(".nav-file-title[data-path='" + EVENING + "']");
    await waitFile(o, EVENING);
    const t1 = await activeType(o); await sleep(1500); const t1b = await activeType(o);
    c.ok(t1 === "booklet" && t1b === "booklet", "explorer click on Evening: view type " + t1 + " at once, " + t1b + " 1.5 s later (front matter cached at click: " + cachedAtClick + ")");
    // Ordinary note, by explorer click
    await o.page.click(".nav-file-title[data-path='" + ORDINARY + "']");
    await waitFile(o, ORDINARY); await sleep(300);
    const tOrd = await activeType(o);
    const ordAction = await o.page.locator(MD + " .view-action[aria-label='Open as booklet']").count();
    c.ok(tOrd === "markdown", "Ordinary note.md opens as " + tOrd + "; 'Open as booklet' buttons on its view: " + ordAction);
    c.ok(ordAction === 0, "Ordinary note has no 'Open as booklet' action (" + ordAction + ")");
    // 1b: getLeaf().openFile
    await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, EVENING);
    await waitActiveType(o, "booklet", 4000); await sleep(500);
    const t2 = await activeType(o);
    c.ok(t2 === "booklet", "app.workspace.getLeaf().openFile(Evening): view type " + t2);
    // find the command id
    const cmds = await o.evaluate(() => Object.keys(app.commands.commands).filter(k => k.startsWith("booklet")));
    c.info("plugin command ids: " + JSON.stringify(cmds));
    const cmd = cmds.find(k => /toggle/.test(k));
    // toggle: header action -> markdown
    await o.page.locator(BOOK + " .view-action[aria-label='Show Markdown']").first().click({ timeout: 5000 });
    c.ok(await waitActiveType(o, "markdown"), "header action 'Show Markdown' -> view type " + await activeType(o));
    // command -> booklet
    const ok1 = await o.evaluate(id => app.commands.executeCommandById(id), cmd);
    c.ok(await waitActiveType(o, "booklet"), "command " + cmd + " (executeCommandById returned " + ok1 + ") from markdown -> view type " + await activeType(o));
    // command -> markdown
    const ok2 = await o.evaluate(id => app.commands.executeCommandById(id), cmd);
    c.ok(await waitActiveType(o, "markdown"), "command from booklet (returned " + ok2 + ") -> view type " + await activeType(o));
    // header 'Open as booklet' -> booklet
    let btn = await o.page.locator(MD + " .view-action[aria-label='Open as booklet']").count();
    c.info("'Open as booklet' header buttons on the Markdown view: " + btn);
    if (btn) await o.page.locator(MD + " .view-action[aria-label='Open as booklet']").first().click({ timeout: 5000 });
    c.ok(btn > 0 && await waitActiveType(o, "booklet"), "header action 'Open as booklet' -> view type " + await activeType(o));
    // on the Ordinary note the command is not available
    await o.page.click(".nav-file-title[data-path='" + ORDINARY + "']"); await waitFile(o, ORDINARY); await sleep(300);
    const listedOrd = await o.evaluate(id => app.commands.listCommands().some(x => x.id === id), cmd);
    const okOrd = await o.evaluate(id => app.commands.executeCommandById(id), cmd); await sleep(500);
    const tAfter = await activeType(o);
    c.ok(listedOrd === false && tAfter === "markdown", "toggle command on Ordinary note: listed in the palette " + listedOrd + "; running it left the view type " + tAfter + " (executeCommandById itself returns " + okOrd + " for any registered id, even one whose checkCallback refuses)");
    await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, EVENING); await waitActiveType(o, "booklet", 4000); await sleep(300);
    const listedEv = await o.evaluate(id => app.commands.listCommands().some(x => x.id === id), cmd);
    c.ok(listedEv === true, "toggle command is listed in the palette on the booklet note: " + listedEv);
  });
  return c;
}

/* ================= CHECK 2 ================= */
async function check2() {
  const c = new Check(2, "it draws natively (counts, rendered markdown, no iframe, light + dark screenshots)");
  await withApp("c2", async (o, vault, launchMs) => {
    await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, EVENING);
    await waitActiveType(o, "booklet");
    await o.page.waitForSelector(BOOK + " .booklet-card", { timeout: 8000 });
    await sleep(1000);   // rendered markdown is async
    const d = await o.evaluate(() => {
      const v = document.querySelector(".workspace-leaf-content[data-type='booklet']");
      const q = s => v.querySelectorAll(s).length;
      const rendered = [...v.querySelectorAll(".markdown-rendered")];
      return {
        choiceButtons: q(".booklet-choices:not(.booklet-scale) button"), scaleButtons: q(".booklet-scale button"),
        textInputs: q("input[type=text]"), textareas: q("textarea"),
        markdownRendered: rendered.length, renderedWithP: rendered.filter(e => e.querySelector("p")).length, renderedEmpty: rendered.filter(e => !e.textContent.trim()).length,
        proseText: (v.querySelector(".booklet-prose") || {}).textContent, titleText: (v.querySelector(".booklet-card-title") || {}).textContent,
        promptTexts: [...v.querySelectorAll(".booklet-prompt")].map(e => e.textContent),
        calloutOrRaw: /\[!/.test(v.textContent), frontMatterShown: /booklet: "0\.15"/.test(v.textContent), recordsShown: /%%|booklet answers/.test(v.textContent),
        iframesInView: q("iframe"), iframesInDocument: document.querySelectorAll("iframe").length,
        buttonLabels: [...v.querySelectorAll("button.booklet-choice")].map(b => b.textContent),
      };
    });
    c.ok(d.choiceButtons === 3, "choice buttons: " + d.choiceButtons);
    c.ok(d.scaleButtons === 5, "scale buttons: " + d.scaleButtons);
    c.ok(d.textInputs === 1, "text inputs: " + d.textInputs + " (textareas " + d.textareas + ")");
    c.ok(d.markdownRendered > 0 && d.renderedWithP > 0 && d.renderedEmpty === 0, ".markdown-rendered elements: " + d.markdownRendered + ", with a rendered <p>: " + d.renderedWithP + ", empty: " + d.renderedEmpty);
    c.ok(/made-up test note/.test(d.proseText || "") && d.titleText === "How was today?", "prose + title came out rendered: title " + JSON.stringify(d.titleText) + ", prose starts " + JSON.stringify((d.proseText || "").slice(0, 40)));
    c.info("question prompts: " + JSON.stringify(d.promptTexts) + "; button labels: " + JSON.stringify(d.buttonLabels));
    c.ok(!d.calloutOrRaw && !d.frontMatterShown && !d.recordsShown, "no raw callout syntax, front matter or %% records visible in the view");
    c.ok(d.iframesInView === 0, "iframes in the view: " + d.iframesInView + " (in the whole document: " + d.iframesInDocument + ")");
    for (const scheme of ["light", "dark"]) {
      await o.setScheme(scheme); await sleep(700);
      const f = await o.screenshot(path.join(SHOTS, "booklet-" + scheme + ".png"));
      const css = await o.evaluate(() => { const v = document.querySelector(".booklet-view"); const b = document.querySelector(".booklet-choice"); const cs = getComputedStyle(v), bs = getComputedStyle(b); return { bodyClass: document.body.className.match(/theme-(dark|light)/)[0], text: cs.color, bg: cs.backgroundColor, btnBg: bs.backgroundColor, btnColor: bs.color, font: cs.fontFamily.slice(0, 50) }; });
      c.info(scheme + " screenshot " + f + "; computed: " + JSON.stringify(css));
    }
    // and one with answers picked, to see the selected look in both schemes
    await clickChoice(o, "Mixed"); await clickScale(o, 3);
    await bookletField(o).fill("a picked state"); await sleep(2500);
    for (const scheme of ["light", "dark"]) {
      await o.setScheme(scheme); await sleep(700);
      c.info(scheme + " screenshot with answers picked " + await o.screenshot(path.join(SHOTS, "booklet-" + scheme + "-picked.png")));
    }
    await openNote(o, KEPT); await sleep(300);
    c.info("Kept records screenshot (dark) " + await o.screenshot(path.join(SHOTS, "booklet-kept-dark.png")));
    await o.setScheme("light"); await sleep(600);
    c.info("Kept records screenshot (light) " + await o.screenshot(path.join(SHOTS, "booklet-kept-light.png")));
  });
  return c;
}

/* ================= CHECK 3 ================= */
async function check3() {
  const c = new Check(3, "answers reach the records on disk, outside the records region nothing changes");
  await withApp("c3", async (o, vault) => {
    const file = path.join(vault, EVENING), orig = fs.readFileSync(file, "utf8");
    await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, EVENING);
    await waitActiveType(o, "booklet");
    await o.page.waitForSelector(BOOK + " .booklet-choice", { timeout: 8000 }); await sleep(800);
    await clickChoice(o, "Good"); await clickScale(o, 3);
    await bookletField(o).click(); await o.page.keyboard.type("made up line");
    await sleep(700 + 4000);
    let now = fs.readFileSync(file, "utf8");
    const at = regionAt(now), head = at >= 0 ? now.slice(0, at) : now;
    c.ok(at >= 0, "a records region (%% + [!records]) exists at offset " + at + " of " + now.length + " bytes");
    // A new region is separated from the body by one blank line, as the reference renderer writes it (and so that
    // Markdown does not fold the `%%` into the note's last callout): the original must be an exact prefix, and only
    // line endings may follow it before the region.
    const added = head.startsWith(orig) ? head.slice(orig.length) : null;
    const bodyOk = added !== null && /^(\r?\n){0,2}$/.test(added);
    c.ok(bodyOk, "the original is an exact prefix of the text before the records region, followed only by " + JSON.stringify(added) + " (the blank line separating a new region)");
    const a = answersOf(now);
    c.ok(a && a.feel === 3 && a.energy === 3 && a.note === "made up line", "booklet answers on disk: " + JSON.stringify(a));
    const l = lint(file); c.ok(l.ok, "lint-booklet.py exit " + l.code + ": " + l.out);
    c.info("region on disk: " + JSON.stringify(now.slice(at)));
    // click Good again -> clears
    await clickChoice(o, "Good"); await sleep(3000);
    now = fs.readFileSync(file, "utf8");
    const a2 = answersOf(now);
    c.ok(a2 && !("feel" in a2) && a2.energy === 3 && a2.note === "made up line", "after clicking Good again: " + JSON.stringify(a2));
    c.ok(now.slice(0, regionAt(now)) === head, "text before the region unchanged between the first write and the clear: true");
    c.info("original is an exact prefix of the file on disk: " + now.startsWith(orig) + "; original file ends with " + JSON.stringify(orig.slice(-12)) + " (no final newline: " + !orig.endsWith("\n") + "); head on disk ends with " + JSON.stringify(head.slice(-12)) + "; head === original + one newline: " + (head === orig + "\n"));
    const l2 = lint(file); c.ok(l2.ok, "lint after the clear: exit " + l2.code + ": " + l2.out);

    // Kept records
    const kfile = path.join(vault, KEPT), korig = fs.readFileSync(kfile, "utf8");
    await openNote(o, KEPT); await sleep(300);
    c.info("Kept records view type: " + await activeType(o));
    await clickChoice(o, "Red"); await sleep(3000);
    const knew = fs.readFileSync(kfile, "utf8");
    const kBodyEq = knew.slice(0, regionAt(knew)) === korig.slice(0, regionAt(korig));
    c.ok(kBodyEq, "Kept records: body before the region byte-identical: " + kBodyEq);
    const bo = blocks(korig), bn = blocks(knew);
    const sameBlocks = bo.filter(b => b.head !== "booklet answers").every(b => bn.some(x => x.head === b.head && x.body === b.body));
    c.ok(sameBlocks && bn.length === bo.length, "every non-answers record block is still there with identical content (" + bo.filter(b => b.head !== "booklet answers").map(b => b.head).join("; ") + "); blocks " + bo.length + " -> " + bn.length);
    const ka = answersOf(knew); c.ok(ka && ka.colour === 1 && Object.keys(ka).length === 1, "Kept records answers: " + JSON.stringify(ka) + " (was {colour: 2}, clicked Red = 1)");
    // everything in the region except the answers block is identical text
    const strip = t => t.slice(regionAt(t)).replace(/```booklet answers\n[\s\S]*?\n```/, "<answers>");
    c.ok(strip(knew) === strip(korig), "region text outside the answers block byte-identical: " + (strip(knew) === strip(korig)));
    const lk = lint(kfile); c.ok(lk.ok, "lint Kept records: exit " + lk.code + ": " + lk.out);
  });
  return c;
}

/* ================= CHECK 4 ================= */
async function check4() {
  const c = new Check(4, "an open Markdown editor survives interleaved typing and answering");
  await withApp("c4", async (o, vault) => {
    const file = path.join(vault, EVENING);
    await o.page.waitForSelector(".nav-file-title", { timeout: 10000 });
    const s = await splitWithMarkdown(o, c);
    c.ok(JSON.stringify(s.types) === JSON.stringify(["booklet", "markdown"]) && s.leaves.every(l => l.file === EVENING), "two leaves on the same file: " + JSON.stringify(s.leaves.map(l => l.type)) + "; Markdown view mode: " + s.mode);
    await o.page.waitForSelector(BOOK + " .booklet-choice", { timeout: 8000 }); await sleep(800);

    // ---- run A: type, answer, type, answer-by-typing
    const f0 = await focusMdEditor(o, true);
    c.info("A: editor focused " + f0.focused + ", mode " + f0.mode + ", cursor " + JSON.stringify(f0.cursor));
    await o.page.keyboard.type("TYPED-ONE");
    const tTyped = Date.now();
    const c1 = await cursorOf(o);
    await clickChoice(o, "Good");
    const dt = Date.now() - tTyped;
    const c2 = await cursorOf(o); await sleep(500); const c2b = await cursorOf(o);
    c.info("A: typed TYPED-ONE, cursor " + JSON.stringify(c1) + "; clicked Good " + dt + " ms later; cursor right after " + JSON.stringify(c2) + ", 500 ms after " + JSON.stringify(c2b));
    const f1 = await focusMdEditor(o, false);
    c.info("A: refocused editor (cursor " + JSON.stringify(f1.cursor) + ", focused " + f1.focused + ")");
    await o.page.keyboard.type("TYPED-TWO");
    const c3 = await cursorOf(o);
    await bookletField(o).click(); await o.page.keyboard.type("from booklet");
    await sleep(5000);
    let disk = fs.readFileSync(file, "utf8"), buf = await mdBuffer(o), cEnd = await cursorOf(o);
    const A = answersOf(disk);
    c.ok(count(disk, "TYPED-ONE") === 1 && count(disk, "TYPED-TWO") === 1, "A disk: TYPED-ONE x" + count(disk, "TYPED-ONE") + ", TYPED-TWO x" + count(disk, "TYPED-TWO"));
    c.ok(count(buf, "TYPED-ONE") === 1 && count(buf, "TYPED-TWO") === 1, "A buffer: TYPED-ONE x" + count(buf, "TYPED-ONE") + ", TYPED-TWO x" + count(buf, "TYPED-TWO"));
    c.ok(A && A.feel === 3 && A.note === "from booklet", "A answers on disk: " + JSON.stringify(A));
    c.ok(buf === disk, "A buffer equals file on disk: " + (buf === disk) + (buf === disk ? "" : " (buffer " + buf.length + " chars, disk " + disk.length + ")"));
    const exp3 = { line: c1.line, ch: c1.ch + 9 };
    c.ok(JSON.stringify(c1) === JSON.stringify({ line: f0.cursor.line, ch: f0.cursor.ch + 9 }) && JSON.stringify(c2b) === JSON.stringify(c1) && JSON.stringify(c3) === JSON.stringify(exp3) && JSON.stringify(cEnd) === JSON.stringify(exp3),
      "A cursor: start " + JSON.stringify(f0.cursor) + " -> after ONE " + JSON.stringify(c1) + " -> after answer click " + JSON.stringify(c2b) + " -> after TWO " + JSON.stringify(c3) + " -> end " + JSON.stringify(cEnd));
    const proseDisk = (disk.split("\n").find(x => x.includes("any answer will do.")) || "");
    c.info("A prose line on disk: " + JSON.stringify(proseDisk.slice(-40)) + "; lint: " + JSON.stringify(lint(file)));
    // the booklet's text field still has focus, so the view waits to be drawn again with the new prose until it is left
    const stillIn = await o.evaluate(() => { const a = document.activeElement; return !!a && a.matches(".workspace-leaf-content[data-type='booklet'] input.booklet-text") && a.value; });
    c.ok(stillIn === "from booklet", "A: the booklet text field still has focus and its words: " + JSON.stringify(stillIn));
    await o.evaluate(() => document.activeElement && document.activeElement.blur());
    await sleep(400);
    const shownProse = await o.evaluate(() => (document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-prose") || {}).textContent);
    c.ok(/TYPED-ONETYPED-TWO/.test(shownProse || ""), "A booklet pane's prose redrew with the typed words once the text field was left: " + JSON.stringify((shownProse || "").slice(-45)));

    // ---- run B: reversed order (answer first, then type)
    await clickScale(o, 2);
    const tB = Date.now();
    const fB = await focusMdEditor(o, false);
    await o.page.keyboard.type("TYPED-THREE");
    const dtB = Date.now() - tB;
    const cB1 = await cursorOf(o);
    await clickChoice(o, "Mixed");
    const fB2 = await focusMdEditor(o, false);
    await o.page.keyboard.type("TYPED-FOUR");
    const cB2 = await cursorOf(o);
    await bookletField(o).click(); await o.page.keyboard.press("End"); await o.page.keyboard.type(" more");
    await sleep(5000);
    disk = fs.readFileSync(file, "utf8"); buf = await mdBuffer(o); const cBEnd = await cursorOf(o);
    const B = answersOf(disk);
    const all = ["TYPED-ONE", "TYPED-TWO", "TYPED-THREE", "TYPED-FOUR"];
    c.ok(all.every(w => count(disk, w) === 1), "B disk: " + all.map(w => w + " x" + count(disk, w)).join(", "));
    c.ok(all.every(w => count(buf, w) === 1), "B buffer: " + all.map(w => w + " x" + count(buf, w)).join(", "));
    c.ok(B && B.energy === 2 && B.feel === 2 && B.note === "from booklet more", "B answers on disk: " + JSON.stringify(B));
    c.ok(buf === disk, "B buffer equals file on disk: " + (buf === disk) + (buf === disk ? "" : " (buffer " + buf.length + ", disk " + disk.length + ")"));
    const expB = { line: c1.line, ch: exp3.ch + 11 + 10 };
    c.ok(JSON.stringify(cB2) === JSON.stringify(expB) && JSON.stringify(cBEnd) === JSON.stringify(expB), "B cursor: before " + JSON.stringify(fB.cursor) + " -> after THREE " + JSON.stringify(cB1) + " -> after FOUR " + JSON.stringify(cB2) + " (expected " + JSON.stringify(expB) + ") -> end " + JSON.stringify(cBEnd));
    c.info("B: first type " + dtB + " ms after the answer click; prose line on disk: " + JSON.stringify((disk.split("\n").find(x => x.includes("any answer will do.")) || "").slice(-60)));
    const l = lint(file); c.ok(l.ok, "lint after both runs: exit " + l.code + ": " + l.out);
    const reg = regionAt(disk); c.ok(reg > 0 && count(disk, "%%\n> [!records]") === 1 && count(disk, "```booklet answers") === 1, "exactly one records region and one answers block on disk (region at " + reg + ")");
  });
  return c;
}

/* ================= CHECK 5 ================= */
async function check5() {
  const c = new Check(5, "the text field keeps focus across its own write; no characters lost");
  await withApp("c5", async (o, vault) => {
    const file = path.join(vault, EVENING);
    await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, EVENING);
    await waitActiveType(o, "booklet");
    await o.page.waitForSelector(BOOK + " input.booklet-text", { timeout: 8000 }); await sleep(800);
    const field = bookletField(o);
    await field.click();
    await o.evaluate(() => { window.__inp = document.querySelector(".workspace-leaf-content[data-type='booklet'] input.booklet-text"); });
    // the input may have been redrawn (a new node): look it up afresh each time, and say whether it is the node typed into at the start
    const state = () => o.evaluate(() => { const cur = document.querySelector(".workspace-leaf-content[data-type='booklet'] input.booklet-text"); return { focused: !!cur && document.activeElement === cur, sameNode: cur === window.__inp, tag: document.activeElement.tagName + "." + document.activeElement.className, value: cur ? cur.value : null, _t: (window.__inp = cur) && 0 }; });  // each call re-tags the node: sameNode = "not redrawn since the previous look"
    const chunks = ["abc", "def", "ghi"], seen = [];
    for (let i = 0; i < chunks.length; i++) {
      await o.page.keyboard.type(chunks[i], { delay: 120 });
      await sleep(1300);   // past the 700 ms pause: the write happens here
      const disk = answersOf(fs.readFileSync(file, "utf8")), st = await state();
      seen.push({ chunk: i, state: st, onDisk: disk && disk.note });
    }
    for (const s of seen) c.ok(s.state.focused && s.state.value === "abcdefghi".slice(0, (s.chunk + 1) * 3) && s.onDisk === s.state.value, "single pane, after chunk " + (s.chunk + 1) + ": input still focused " + s.state.focused + " (same DOM node as at the previous look: " + s.state.sameNode + "), value " + JSON.stringify(s.state.value) + ", on disk " + JSON.stringify(s.onDisk));
    await sleep(1500);
    const fin = answersOf(fs.readFileSync(file, "utf8")), stF = await state();
    c.ok(stF.focused && stF.value === "abcdefghi" && fin.note === "abcdefghi", "single pane final: focused " + stF.focused + ", value " + JSON.stringify(stF.value) + ", disk " + JSON.stringify(fin.note));

    // with a Markdown pane open, and the Markdown editor changing the prose mid-typing (via the editor API), which makes the booklet redraw
    await o.evaluate(() => { document.activeElement.blur(); });
    const sp = await splitWithMarkdown(o, c);
    await o.page.waitForSelector(BOOK + " input.booklet-text", { timeout: 8000 }); await sleep(800);
    await bookletField(o).click(); await o.page.keyboard.press("End");
    await o.evaluate(() => { window.__inp = document.querySelector(".workspace-leaf-content[data-type='booklet'] input.booklet-text"); });
    const log = [];
    await o.page.keyboard.type("XYZ", { delay: 120 }); await sleep(1300); log.push(["after XYZ", await state()]);
    // an edit in the Markdown pane (API, not keyboard): changes the prose, so Obsidian's save makes the booklet redraw
    await o.evaluate(() => { let ed; app.workspace.iterateRootLeaves(l => { if (l.view.getViewType() === "markdown") ed = l.view.editor; }); const n = ed.getValue().split("\n").findIndex(x => x.endsWith("any answer will do.")); ed.replaceRange(" API-EDIT", { line: n, ch: ed.getLine(n).length }); });
    await o.page.keyboard.type("UVW", { delay: 120 }); log.push(["typing during the edit", await state()]);
    await sleep(3500);   // Obsidian saves the Markdown pane (2 s), the booklet view sees the changed note
    log.push(["after the redraw window", await state()]);
    await o.page.keyboard.type("RST", { delay: 120 }); await sleep(1500); log.push(["after RST", await state()]);
    await sleep(3500);   // with a Markdown pane open the answer goes through its editor, and Obsidian saves that after about 2 s
    const diskNote = answersOf(fs.readFileSync(file, "utf8"));
    const afterField = await o.evaluate(() => document.activeElement === document.querySelector(".workspace-leaf-content[data-type='booklet'] input.booklet-text"));
    const want = "abcdefghiXYZUVWRST";
    c.info("two panes: " + log.map(([n, s]) => n + ": focused=" + s.focused + " nodeStillInDom=" + s.sameNode + " value=" + JSON.stringify(s.value)).join(" | "));
    c.ok(diskNote && diskNote.note === want, "two panes: note on disk " + JSON.stringify(diskNote && diskNote.note) + " (typed " + want + ")");
    c.ok(afterField, "two panes: the input holds focus at the end: " + afterField);
    const redrawn = log.some(([n, s]) => !s.sameNode);
    c.ok(!redrawn, "two panes: the input being typed in was never replaced by a drawing, though the Markdown edit changed the note's prose (" + (redrawn ? "REPLACED during the run" : "the same element throughout") + ")");
    c.ok(log.every(([n, s]) => n === "after XYZ" || s.value.startsWith("abcdefghiXYZ")) && log[log.length - 1][1].value === want, "two panes: input value never lost characters; final " + JSON.stringify(log[log.length - 1][1].value));
    // once the field is left, the view is drawn again with the Markdown edit
    await o.evaluate(() => document.activeElement && document.activeElement.blur());
    await sleep(400);
    const prose = await o.evaluate(() => document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-prose").textContent);
    c.ok(prose.includes("API-EDIT"), "booklet prose redrew with the Markdown edit once the field was left: " + JSON.stringify(prose.slice(-30)));
  });
  return c;
}

/* ---------- helpers for checks 6 to 10 ---------- */
// Where each multi-activity test note is read: 0.6.0 draws one screen at a time, so a check says which activity's screen it wants.
const START = { [EVERY]: "/kinds", [KEPT]: "/warm-up", [CHECKIN]: "day-check/today" };
// the booklet view shows the screen of that activity (by the pane's own state, as Back and Forward do), and waits for it to be drawn
async function goTo(o, key) {
  await o.evaluate(async key => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 1, screen: "activity:" + key, part: 0 }, active: true }); }, key);
  await o.page.waitForSelector(BOOK + " .booklet-page[data-booklet-screen='activity:" + key + "']", { timeout: 8000 });
  await sleep(900);   // rendered markdown is async
}
// The plugin knows a note is a booklet only from its front matter in Obsidian's metadata cache, so a note opened while the cache
// has no entry for it (not read yet, or being read again after the file was written on disk) opens as Markdown and stays one: a
// probe showed a note created and opened in one go stays Markdown for good. A fresh vault copy on a busy box is indexed late,
// which is the likely cause of the one time check 15 timed out waiting for the page (not reproduced: 3 runs in 3 passed). So the
// check opens the note, and if the pane did not become a booklet view it opens it again, once the cache holds the note, until
// it does; a page that still does not come says what the pane shows.
async function openAsBooklet(o, rel, timeout = 30000) {
  const t0 = Date.now();
  for (;;) {
    await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, rel, { timeout, polling: 50 });
    await o.evaluate(async rel => { const f = app.vault.getAbstractFileByPath(rel); const l = app.workspace.activeLeaf; if (l && l.view.file && l.view.file.path === rel) await l.openFile(f); else await app.workspace.getLeaf().openFile(f); }, rel);
    if (await waitActiveType(o, "booklet", 2000)) return;
    if (Date.now() - t0 > timeout) return;
  }
}
async function openNote(o, rel, key) {
  await openAsBooklet(o, rel);
  try { await o.page.waitForSelector(BOOK + " .booklet-page", { timeout: 8000 }); }
  catch (e) {
    const seen = await o.evaluate(() => { const l = app.workspace.activeLeaf; return { type: l && l.view.getViewType(), file: l && l.view.file && l.view.file.path, children: l && l.view.contentEl ? l.view.contentEl.children.length : null, ready: app.workspace.layoutReady }; });
    throw new Error("the note opened but no booklet page was drawn within 8 s: the pane shows " + JSON.stringify(seen) + " (" + e.message.split("\n")[0] + ")");
  }
  key = key || START[rel];
  if (key) await goTo(o, key);
  else { await o.page.waitForSelector(BOOK + " .booklet-card", { timeout: 8000 }); await sleep(900); }   // a note of one activity opens into it
}
// with a Markdown pane open on the check-in note: a word typed at the end of the line that says "There are no right answers here.", in that pane's editor
const typeInMarkdown = o => async word => {
  await o.evaluate(() => {
    let leaf = null; app.workspace.iterateRootLeaves(l => { if (l.view.getViewType() === "markdown") leaf = l; });
    app.workspace.setActiveLeaf(leaf, { focus: true });
    const ed = leaf.view.editor; const n = ed.getValue().split("\n").findIndex(x => x.includes("There are no right answers here."));
    ed.setCursor({ line: n, ch: ed.getLine(n).length }); ed.focus();
  });
  await o.page.keyboard.type(" " + word);
};
// close every booklet leaf and open the note again: a new view, drawn from the file
async function reopen(o, rel, key) {
  await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
  await sleep(300);
  await openNote(o, rel, key);
}
const cardSel = key => BOOK + " .booklet-card[data-booklet-activity='" + key + "']";
const inCard = (o, key, sel) => o.page.locator(cardSel(key) + " " + sel);
const question = (o, key, kind, n = 0) => inCard(o, key, ".booklet-kind-" + kind).nth(n);
const pressedIn = (o, key, kind) => o.evaluate(sel => [...document.querySelectorAll(sel + " button.booklet-choice")].filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.textContent.trim()), cardSel(key) + " .booklet-kind-" + kind);
const blocksNamed = (text, head) => blocks(text).filter(b => b.head === head);
const json = s => { try { return JSON.parse(s); } catch (e) { return "UNPARSEABLE: " + s; } };
// Obsidian 1.14 draws notices in a window of their own, not in the main document: an empty probe notice says which
// document that is, and is hidden at once
const notices = o => o.evaluate(() => {
  const probe = new window.Notice("", 1), d = probe.containerEl ? probe.containerEl.ownerDocument : document;
  const out = [...new Set([document, d])].flatMap(doc => [...doc.querySelectorAll(".notice")].map(n => n.textContent)).filter(t => t);
  probe.hide();
  return out;
});
async function waitDisk(file, pred, timeout = 10000) {
  const t0 = Date.now(); let text = "";
  while (Date.now() - t0 < timeout) {
    text = fs.readFileSync(file, "utf8");
    try { if (pred(text)) return { ok: true, text, ms: Date.now() - t0 }; } catch (e) { /* not yet */ }
    await sleep(150);
  }
  return { ok: false, text, ms: Date.now() - t0 };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const head = text => { const at = regionAt(text); return at >= 0 ? text.slice(0, at) : text; };
// what the view shows for each common kind in a card
const shownIn = (o, key) => o.evaluate(sel => {
  const card = document.querySelector(sel); const out = {};
  for (const q of card.querySelectorAll(".booklet-question")) {
    const kind = [...q.classList].find(c => c.startsWith("booklet-kind-")).slice(13);
    const pressed = [...q.querySelectorAll("button.booklet-choice")].filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.textContent.trim());
    const fields = [...q.querySelectorAll("input.booklet-text, textarea.booklet-text")].filter(f => !f.closest(".booklet-own-row")).map(f => f.value);
    out[(q.querySelector(".booklet-prompt") || {}).textContent] = kind === "choice" || kind === "multi" || kind === "scale" ? pressed : fields;
  }
  return out;
}, cardSel(key));
// the entries the view lists under an activity: the date line and the answers in words
const listedEntries = (o, key) => o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-entry")].map(e => ({ when: (e.querySelector(".booklet-entry-when") || {}).textContent, words: [...e.querySelectorAll("dd")].map(d => d.textContent) })), cardSel(key));
function contrast(a, b) {
  const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const [r, g, bl] = m.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// a colour with alpha (rgba) laid over an opaque one: the colour that is seen
function over(top, under) {
  const t = top.match(/[\d.]+/g).map(Number), u = under.match(/[\d.]+/g).map(Number), a = t.length > 3 ? t[3] : 1;
  return "rgb(" + [0, 1, 2].map(i => Math.round(a * t[i] + (1 - a) * u[i])).join(", ") + ")";
}

/* ================= CHECK 6 ================= */
async function check6() {
  const c = new Check(6, "every common kind, a shared list and a grid are answered and cleared, checked on disk; the first answer does not redraw the view; a change on disk leaves a field being edited alone");
  await withApp("c6", async (o, vault) => {
    const file = path.join(vault, EVERY), orig = fs.readFileSync(file, "utf8");
    await openNote(o, EVERY);
    const K = "/kinds";
    // nothing is left undrawn: a group is a box now, with its question live in it
    await goTo(o, "/not-yet");
    const un = await o.evaluate(() => [...document.querySelectorAll(".workspace-leaf-content[data-type='booklet'] [data-booklet-unsupported]")].map(e => e.getAttribute("data-booklet-unsupported") + ": " + e.querySelector(".booklet-muted").textContent));
    const grp = await o.evaluate(() => { const g = document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-group [data-booklet-q='in-group']"); return !!g; });
    c.ok(un.length === 0 && grp, "no part says it is not yet supported, a matrix, a widget, a shared list, a query and a group are all drawn, and the group holds its question: " + JSON.stringify(un) + ", group drawn " + grp);
    const mx = await o.evaluate(() => document.querySelectorAll(".workspace-leaf-content[data-type='booklet'] .booklet-kind-matrix .booklet-mxitem").length);
    c.ok(mx === 2, "the matrix in the same activity is drawn, one row for each of its two items: " + mx);
    await goTo(o, "/tally");
    const q = await o.evaluate(() => [...document.querySelectorAll(".workspace-leaf-content[data-type='booklet'] .booklet-query")].map(e => e.getAttribute("data-booklet-view")));
    c.ok(q.length === 1 && q[0] === "list", "the tally's query is drawn, as a list: " + JSON.stringify(q));
    // the activity with a shared list and a widget: the menu's options and the grid's cells are drawn
    const S = "/shared";
    await goTo(o, S);
    const drawnShared = await o.evaluate(sel => { const card = document.querySelector(sel); return { options: [...card.querySelectorAll(".booklet-kind-multi button.booklet-choice")].map(b => b.textContent.trim()), cells: [...card.querySelectorAll(".booklet-cell")].map(x => x.getAttribute("data-booklet-cell") + " " + [...x.classList].filter(k => k.startsWith("booklet-colour-")).join("")), notes: card.querySelectorAll(".booklet-note").length, unsupported: /not yet supported/i.test(card.textContent) }; }, cardSel(S));
    c.ok(same(drawnShared.options, ["Circle", "Square", "Triangle"]) && drawnShared.cells.length === 4 && drawnShared.notes === 4 && !drawnShared.unsupported, "the shared list's options and the widget's four cells (with their notes, as `describe` asks) are drawn: " + JSON.stringify(drawnShared));
    // tabs and pages are drawn now (a tab bar, one page at a time), and nothing says they are not
    const notes = await o.evaluate(() => [...document.querySelectorAll(".workspace-leaf-content[data-type='booklet'] .booklet-muted")].map(e => e.textContent).filter(t => /not yet supported/i.test(t)));
    c.ok(!notes.some(t => /tab bar|page by page/.test(t)), "no line says the tab bar or pages are not yet supported: " + JSON.stringify(notes.filter(t => /tab|page/.test(t))));
    // mark the drawing, to see whether the first answer redraws it
    await goTo(o, K);
    await o.evaluate(() => { window.__card = document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-card"); window.__field = document.querySelector(".workspace-leaf-content[data-type='booklet'] textarea"); });

    // choice: Pear, then Apple (its reply shows)
    await question(o, K, "choice").locator("button.booklet-choice", { hasText: "Pear" }).click();
    const first = await waitDisk(file, t => answersOf(t) && answersOf(t).fruit === 2);
    const sameDraw = await o.evaluate(() => document.contains(window.__card) && document.contains(window.__field));
    c.ok(first.ok && sameDraw, "first answer to a note with no records: on disk after " + first.ms + " ms; the view was not drawn again (the same card and field are in the page): " + sameDraw);
    c.ok(head(first.text) === orig + "\n", "the note's text before the new records region is the original plus the one blank line that separates the region: " + (head(first.text) === orig + "\n"));
    await question(o, K, "choice").locator("button.booklet-choice", { hasText: "Apple" }).click();
    await sleep(300);
    const reply = await question(o, K, "choice").locator(".booklet-reply").allTextContents();
    c.ok(reply.join(" ").includes("A good one for a long day out."), "the picked option's reply shows: " + JSON.stringify(reply));
    // multi: Scissors, then Pencil (kept in the order picked), then one of the reader's own
    await question(o, K, "multi").locator("button.booklet-choice", { hasText: "Scissors" }).click();
    await question(o, K, "multi").locator("button.booklet-choice", { hasText: "Pencil" }).click();
    await question(o, K, "multi").locator(".booklet-own-row input").fill("Glue");
    await question(o, K, "multi").locator(".booklet-own-row input").press("Enter");
    // scale: the third anchor
    await question(o, K, "scale").locator("button.booklet-choice").nth(2).click();
    // text (long): typed
    await question(o, K, "text").locator("textarea").click();
    await o.page.keyboard.type("Fold along the line");
    // lines: two lines, Enter moving to the next
    await question(o, K, "lines").locator("input").first().click();
    await o.page.keyboard.type("Cut"); await o.page.keyboard.press("Enter"); await o.page.keyboard.type("Fold");
    // number and date
    await question(o, K, "number").locator("input").click(); await o.page.keyboard.type("7");
    await question(o, K, "date").locator("input[type=date]").fill("2026-10-20");
    await o.evaluate(() => document.activeElement && document.activeElement.blur());
    const sameDraw2 = await o.evaluate(() => document.contains(window.__card));
    c.ok(sameDraw2, "no answer drew the view again: " + sameDraw2);
    await goTo(o, S);
    // the shared list (positions in the menu, in the order pressed) and the grid (an item's id, then a word of the reader's own)
    await question(o, S, "multi").locator("button.booklet-choice", { hasText: "Triangle" }).click();
    await question(o, S, "multi").locator("button.booklet-choice", { hasText: "Circle" }).click();
    await inCard(o, S, ".booklet-cell[data-booklet-cell='tall-wide'] button.booklet-item").click();
    await inCard(o, S, ".booklet-cell[data-booklet-cell='short-wide'] .booklet-own-row input").click();
    await o.page.keyboard.type("The green box"); await o.page.keyboard.press("Enter");
    await o.evaluate(() => document.activeElement && document.activeElement.blur());
    const want = { fruit: 1, tools: [3, 1, "Glue"], sure: 3, thoughts: "Fold along the line", steps: ["Cut", "Fold", ""], boxes: 7, "fold-day": "2026-10-20", picked: [3, 1], board: ["red-box", "x|short-wide|The green box"] };
    const got = await waitDisk(file, t => same(answersOf(t), want));
    c.ok(got.ok, "every common kind on disk: " + JSON.stringify(answersOf(got.text)));
    const body = (blocksNamed(got.text, "booklet answers")[0] || {}).body;
    c.ok(body === JSON.stringify(want, null, 1), "the answers block is the reference renderer's shape, JSON.stringify(answers, null, 1): " + (body === JSON.stringify(want, null, 1)));
    c.ok(head(got.text) === orig + "\n", "text before the records region unchanged: " + (head(got.text) === orig + "\n"));
    const l1 = lint(file); c.ok(l1.ok, "lint after answering: exit " + l1.code + ": " + l1.out);

    // a new view, drawn from the file, shows every answer
    await reopen(o, EVERY);
    const shown = await shownIn(o, K);
    c.info("shown after reopening: " + JSON.stringify(shown));
    const vals = Object.values(shown);
    c.ok(same(vals, [["Apple"], ["Pencil", "Scissors", "Glue"], ["3Certain"], ["Fold along the line"], ["Cut", "Fold", ""], ["7"], ["2026-10-20"]]), "after reopening, each question shows its answer");
    await goTo(o, S);
    const shownShared = await o.evaluate(sel => [...document.querySelectorAll(sel + " button.booklet-choice")].filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.textContent.trim()), cardSel(S));
    c.ok(same(shownShared, ["Circle", "Triangle", "The red box", "The green box"]), "after reopening, the shared list and the grid show their answers: " + JSON.stringify(shownShared));

    // clear every one
    await question(o, S, "multi").locator("button.booklet-choice", { hasText: "Triangle" }).click();
    await question(o, S, "multi").locator("button.booklet-choice", { hasText: "Circle" }).click();
    await inCard(o, S, ".booklet-cell[data-booklet-cell='tall-wide'] button.booklet-item").click();
    await inCard(o, S, ".booklet-cell[data-booklet-cell='short-wide'] button.booklet-own").click();
    await goTo(o, K);
    await question(o, K, "choice").locator("button.booklet-choice", { hasText: "Apple" }).click();
    await question(o, K, "multi").locator("button.booklet-choice", { hasText: "Scissors" }).click();
    await question(o, K, "multi").locator("button.booklet-choice", { hasText: "Pencil" }).click();
    await question(o, K, "multi").locator("button.booklet-own", { hasText: "Glue" }).click();
    await question(o, K, "scale").locator("button.booklet-choice").nth(2).click();
    await question(o, K, "text").locator("textarea").fill("");
    await question(o, K, "lines").locator("input").nth(1).fill("");
    await question(o, K, "lines").locator("input").nth(0).fill("");
    await question(o, K, "number").locator("input").fill("");
    await question(o, K, "date").locator("button.booklet-clear").click();
    await o.evaluate(() => document.activeElement && document.activeElement.blur());
    const cleared = await waitDisk(file, t => same(answersOf(t), {}));
    c.ok(cleared.ok, "every answer cleared on disk: " + JSON.stringify(answersOf(cleared.text)));
    c.ok(head(cleared.text) === orig + "\n", "text before the records region unchanged after clearing: " + (head(cleared.text) === orig + "\n"));
    c.info("records region after clearing: " + JSON.stringify(cleared.text.slice(regionAt(cleared.text))));
    const l2 = lint(file); c.ok(l2.ok, "lint after clearing: exit " + l2.code + ": " + l2.out);
    const shown2 = Object.values(await shownIn(o, K));
    c.ok(shown2.length === 7 && shown2.every(v => v.every(x => x === "")) && same(shown2.slice(0, 3), [[], [], []]), "the view shows nothing answered (no button pressed, every field empty): " + JSON.stringify(shown2));

    // a change to the note on disk (as Sync or another plugin makes it) while a field is being edited
    await underneathFlow(c, o, vault, "changed on disk", "disk");
  });
  return c;
}

/* ---------- a change to the note arrives while a field is being edited: checks 6 (on disk) and 8 (Markdown pane) ---------- */
// The change: `word` added to the note's prose (so its design changes; none for a change to the records alone), and
// the question `id` given `value` in the answers block. `route` "disk" makes it with app.vault.process, as Sync or
// another plugin would; "markdown" in the open Markdown pane's editor, which reaches the view when that pane saves.
// Waits until the booklet view has been handed the change (its text holds `needle`). `rel` is the note (Every kind
// unless named) and `head` the record block the answer is changed in (its answers block unless named); the block keeps
// its layout, one member a line or all on one line.
async function changeUnder(o, route, word, id, value, rel = EVERY, head = "booklet answers") {
  // the words go into prose that the screen being worked on draws: the check-in note's is the Today activity's own opening
  const anchor = rel === CHECKIN ? "There are no right answers here." : "any answer will do.";
  const needle = await o.evaluate(async ({ route, word, id, value, rel, head, anchor }) => {
    const edit = t => {
      let out = word ? t.replace(anchor, anchor + " " + word) : t;
      if (id) out = out.replace(new RegExp("(```" + head + "\\n)([\\s\\S]*?)(\\n```)"), (m, a, body, z) => { const j = JSON.parse(body); j[id] = value; return a + (body.includes("\n") ? JSON.stringify(j, null, 1) : JSON.stringify(j)) + z; });
      return out;
    };
    if (route === "disk") await app.vault.process(app.vault.getAbstractFileByPath(rel), edit);
    else {
      let leaf = null; app.workspace.iterateRootLeaves(l => { if (l.view.getViewType() === "markdown") leaf = l; });
      const ed = leaf.view.editor, before = ed.getValue(), after = edit(before);
      let p = 0; while (p < before.length && before[p] === after[p]) p++;
      let s = 0; while (s < before.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
      ed.replaceRange(after.slice(p, after.length - s), ed.offsetToPos(p), ed.offsetToPos(before.length - s));
    }
    return word || ('"' + id + '": ' + JSON.stringify(value));
  }, { route, word, id, value, rel, head, anchor });
  const t0 = Date.now();
  await o.page.waitForFunction(n => app.workspace.getLeavesOfType("booklet")[0].view.getViewData().includes(n), needle, { timeout: 10000, polling: 50 });
  return Date.now() - t0;
}
// the field that has focus now, marked so that it can be found again: is it still in the page, with focus?
const markFocused = o => o.evaluate(() => { window.__f = document.activeElement; return window.__f && window.__f.className; });
const marked = o => o.evaluate(() => ({ same: !!window.__f && document.contains(window.__f) && document.activeElement === window.__f, value: window.__f && window.__f.value, caret: window.__f && window.__f.type !== "number" && window.__f.type !== "date" ? window.__f.selectionStart : null }));
const viewShows = (o, word) => o.page.waitForFunction(w => document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-page").textContent.includes(w), word, { timeout: 8000, polling: 50 }).then(() => true, () => false);
const blurNow = o => o.evaluate(() => document.activeElement && document.activeElement.blur());

// Each common field in turn: the reader is in it (focus, a selection, typing not yet written), a change arrives that
// changes the design and the same question's answer, and the reader goes on. The field must be the same element,
// with focus and with what the reader had in it; what they typed wins on disk; the view is drawn again once they leave.
async function underneathFlow(c, o, vault, tag, route) {
  const file = path.join(vault, EVERY), K = "/kinds", words = [];
  const say = (cond, msg) => c.ok(cond, tag + ": " + msg);
  // a stored number to begin from
  await question(o, K, "number").locator("input").fill("7"); await blurNow(o);
  const d0 = await waitDisk(file, t => (answersOf(t) || {}).boxes === 7);
  say(d0.ok, "the number 7 is on disk to begin with");
  const before = head(d0.text);

  // number: the reader selects the 7; the change (the design, and boxes 9) arrives; the reader types 12 over the selection
  await question(o, K, "number").locator("input").focus();
  await o.evaluate(() => document.activeElement.select()); await markFocused(o);
  let ms = await changeUnder(o, route, "UNDER-NUMBER", "boxes", 9); words.push("UNDER-NUMBER");
  let m = await marked(o);
  say(m.same && m.value === "7", "the change reached the view after " + ms + " ms while the number field was selected: the same field, with focus, still holds " + JSON.stringify(m.value));
  await o.page.keyboard.insertText("12"); await blurNow(o);
  let d = await waitDisk(file, t => (answersOf(t) || {}).boxes === 12);
  say(d.ok, "typing 12 over the selection gives boxes " + JSON.stringify((answersOf(d.text) || {}).boxes) + " on disk (not 712, and not the change's 9)");
  say(await viewShows(o, "UNDER-NUMBER"), "after the reader left the field, the view is drawn again with the changed prose");

  // number, left without typing: the change (boxes 3, records only) arrives while it has focus; it shows 3 once left
  await question(o, K, "number").locator("input").focus(); await markFocused(o);
  ms = await changeUnder(o, route, null, "boxes", 3);
  m = await marked(o);
  say(m.same && m.value === "12", "a change to the answer alone, while the field has focus: the field is not overwritten (" + JSON.stringify(m.value) + ")");
  await blurNow(o); await sleep(300);
  const shownNow = await question(o, K, "number").locator("input").inputValue();
  await sleep(1500);
  const left = await waitDisk(file, t => (answersOf(t) || {}).boxes === 3, 3000);
  say(shownNow === "3" && left.ok, "left without typing, the field shows the note's " + JSON.stringify(shownNow) + ", and the note keeps boxes 3 (nothing written over it)");

  // text: typing, then the change (the design, and thoughts), then more typing
  await question(o, K, "text").locator("textarea").click(); await o.page.keyboard.type("Half typed"); await markFocused(o);
  ms = await changeUnder(o, route, "UNDER-TEXT", "thoughts", "Changed elsewhere"); words.push("UNDER-TEXT");
  m = await marked(o);
  say(m.same && m.value === "Half typed" && m.caret === 10, "text being typed: the same field, with focus, its words and the caret at their end: " + JSON.stringify(m));
  await o.page.keyboard.type(" and finished"); await blurNow(o);
  d = await waitDisk(file, t => (answersOf(t) || {}).thoughts === "Half typed and finished");
  say(d.ok, "the typed text wins over the change: thoughts " + JSON.stringify((answersOf(d.text) || {}).thoughts));

  // lines: typing in the first line, the change (the design, and steps), more typing
  await question(o, K, "lines").locator("input").first().click(); await o.page.keyboard.type("Half a line"); await markFocused(o);
  ms = await changeUnder(o, route, "UNDER-LINES", "steps", ["Elsewhere"]); words.push("UNDER-LINES");
  m = await marked(o);
  say(m.same && m.value === "Half a line", "a line being typed: the same field, with focus and its words: " + JSON.stringify(m));
  await o.page.keyboard.type(" more"); await blurNow(o);
  d = await waitDisk(file, t => same((answersOf(t) || {}).steps, ["Half a line more", ""]));
  say(d.ok, "the typed lines win over the change: steps " + JSON.stringify((answersOf(d.text) || {}).steps));

  // date: set, then the change (the design, and fold-day) before the reader leaves the field
  await question(o, K, "date").locator("input[type=date]").focus();
  await question(o, K, "date").locator("input[type=date]").fill("2026-12-01"); await markFocused(o);
  ms = await changeUnder(o, route, "UNDER-DATE", "fold-day", "2026-01-02"); words.push("UNDER-DATE");
  m = await marked(o);
  say(m.same && m.value === "2026-12-01", "a date being set: the same field, with focus and its date: " + JSON.stringify(m));
  await blurNow(o);
  d = await waitDisk(file, t => (answersOf(t) || {})["fold-day"] === "2026-12-01");
  say(d.ok, "the date set wins over the change: fold-day " + JSON.stringify((answersOf(d.text) || {})["fold-day"]));

  // Add your own: words typed, the change (the design, and tools), then Enter
  await question(o, K, "multi").locator(".booklet-own-row input").click(); await o.page.keyboard.type("Twine"); await markFocused(o);
  ms = await changeUnder(o, route, "UNDER-OWN", "tools", [2]); words.push("UNDER-OWN");
  m = await marked(o);
  say(m.same && m.value === "Twine", "words typed in Add your own: the same field, with focus and its words: " + JSON.stringify(m));
  await o.page.keyboard.press("Enter");
  d = await waitDisk(file, t => same((answersOf(t) || {}).tools, [2, "Twine"]));
  say(d.ok, "Enter adds them to what the note now holds: tools " + JSON.stringify((answersOf(d.text) || {}).tools));

  // a press that begins while the view waits to be drawn again: the click lands, then the view is drawn
  await question(o, K, "text").locator("textarea").click(); await o.page.keyboard.press("End");
  ms = await changeUnder(o, route, "UNDER-PRESS", null, null); words.push("UNDER-PRESS");
  await question(o, K, "choice").locator("button.booklet-choice", { hasText: "Plum" }).click();
  d = await waitDisk(file, t => (answersOf(t) || {}).fruit === 3);
  say(d.ok, "a press on Plum while the view waited to be drawn again: fruit " + JSON.stringify((answersOf(d.text) || {}).fruit) + " on disk");
  say(await viewShows(o, "UNDER-PRESS"), "then the view is drawn again with the changed prose");

  const after = fs.readFileSync(file, "utf8");
  const stripped = words.reduce((t, w) => t.split(" " + w).join(""), head(after));
  say(stripped === before, "outside the records region, only the words the changes added are new: " + (stripped === before));
  const l = lint(file); say(l.ok, "lint exit " + l.code + ": " + l.out);
}

/* ---------- the two repeating flows, used by checks 7 (one pane) and 8 (with a Markdown pane) ---------- */
// `typeInMd`: with a Markdown pane open, a word is typed into its editor between the steps
async function walkLogFlow(c, o, vault, tag, typeInMd) {
  const file = path.join(vault, KEPT), orig = fs.readFileSync(file, "utf8");
  const K = "walks/walk-log";
  const before = blocksNamed(orig, "booklet entries walk-log")[0].body;
  const where = "Down to the made-up harbour " + tag;
  await question(o, K, "scale").locator("button.booklet-choice").nth(2).click();
  if (typeInMd) await typeInMd("MD-WALK-ONE");
  await question(o, K, "text").locator("input").click(); await o.page.keyboard.type(where);
  await o.evaluate(() => document.activeElement && document.activeElement.blur());
  const d = await waitDisk(file, t => { const b = blocksNamed(t, "booklet draft walk-log"); return b.length === 1 && same(json(b[0].body), { pace: 3, where }); });
  c.ok(d.ok, tag + " walk-log: the draft on disk " + JSON.stringify((blocksNamed(d.text, "booklet draft walk-log")[0] || {}).body));
  const at = s => d.text.indexOf(s);
  c.ok(at("> [!records|walks]") < at("```booklet entries walk-log") && at("```booklet entries walk-log") < at("```booklet draft walk-log"), tag + " walk-log: the draft sits under the module's records line, after its entries block");
  c.ok((blocksNamed(d.text, "booklet entries walk-log")[0] || {}).body === before, tag + " walk-log: the kept entries are untouched while drafting");
  if (!typeInMd) {
    await reopen(o, KEPT, K);
    const s = await shownIn(o, K);
    c.ok(same(Object.values(s), [["3Brisk"], [where]]), tag + " walk-log: after the view is opened again, the draft is still shown: " + JSON.stringify(s));
  }
  const t0 = Date.now();
  await inCard(o, K, "button.booklet-finalize").click();
  const f = await waitDisk(file, t => !blocksNamed(t, "booklet draft walk-log").length && (json((blocksNamed(t, "booklet entries walk-log")[0] || {}).body).items || []).length === 3);
  const items = json((blocksNamed(f.text, "booklet entries walk-log")[0] || {}).body).items || [];
  const e = items[2] || {};
  const fresh = Math.abs(Date.parse(e.ts) - t0) < 15000;
  c.ok(f.ok && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(e.ts) && fresh && e.pace === 3 && e.where === where && Object.keys(e)[0] === "ts", tag + " walk-log: Finalize kept " + JSON.stringify(e) + " and emptied the draft (no draft block on disk)");
  const after = (blocksNamed(f.text, "booklet entries walk-log")[0] || {}).body || "";
  c.ok(after.startsWith(before.replace(/\n\]\}$/, "")) && after.endsWith("\n]}"), tag + " walk-log: the two earlier entries keep their bytes, the new one is added after them");
  await sleep(400);
  const listed = await listedEntries(o, K);
  c.ok(listed.length === 3 && listed[0].words.some(w => w === "Brisk") && listed[0].words.some(w => w === where), tag + " walk-log: the view lists 3 entries, newest first, in words: " + JSON.stringify(listed[0]));
  const s2 = await shownIn(o, K);
  c.ok(same(Object.values(s2), [[], [""]]), tag + " walk-log: the fields are empty again: " + JSON.stringify(s2));
  c.info(tag + " walk-log notices: " + JSON.stringify(await notices(o)));
  return f.text;
}

async function dailyFlow(c, o, vault, tag, typeInMd) {
  const file = path.join(vault, DAILY), orig = fs.readFileSync(file, "utf8");
  const K = "/evening-log";
  const olds = (json(blocksNamed(orig, "booklet entries evening-log")[0].body).items || []).length;
  const oldBody = blocksNamed(orig, "booklet entries evening-log")[0].body;
  const note = "A made-up evening " + tag;
  await question(o, K, "choice").locator("button.booklet-choice", { hasText: "Cloudy" }).click();
  await question(o, K, "scale").locator("button.booklet-choice").nth(2).click();
  if (typeInMd) await typeInMd("MD-DAY-ONE");
  await question(o, K, "number").locator("input").click(); await o.page.keyboard.type("15");
  await question(o, K, "date").locator("input[type=date]").fill("2026-11-08");
  await question(o, K, "text").locator("input").click(); await o.page.keyboard.type(note);
  await o.evaluate(() => document.activeElement && document.activeElement.blur());
  const want = { sky: 2, busy: 2, pages: 15, "next-walk": "2026-11-08", note };
  const d = await waitDisk(file, t => { const b = blocksNamed(t, "booklet draft evening-log"); return b.length === 1 && same(json(b[0].body), want); });
  c.ok(d.ok, tag + " daily: the draft on disk " + JSON.stringify((blocksNamed(d.text, "booklet draft evening-log")[0] || {}).body));
  if (!typeInMd) {
    await reopen(o, DAILY);
    const s = await shownIn(o, K);
    c.ok(same(Object.values(s), [["Cloudy"], ["2Full"], ["15"], ["2026-11-08"], [note]]), tag + " daily: after the view is opened again, the draft is still shown: " + JSON.stringify(s));
  }
  // first Finalize today
  await inCard(o, K, "button.booklet-finalize").click();
  const f1 = await waitDisk(file, t => !blocksNamed(t, "booklet draft evening-log").length && (json((blocksNamed(t, "booklet entries evening-log")[0] || {}).body).items || []).length === olds + 1);
  const items1 = json((blocksNamed(f1.text, "booklet entries evening-log")[0] || {}).body).items || [];
  const today1 = items1[items1.length - 1] || {};
  c.ok(f1.ok && same(Object.keys(today1).slice(1), Object.keys(want)) && today1.pages === 15, tag + " daily: Finalize kept today's entry " + JSON.stringify(today1));
  await sleep(500);
  const seed = await inCard(o, K, ".booklet-seed").textContent();
  const s1 = await shownIn(o, K);
  c.ok(/Showing today's entry/.test(seed) && same(Object.values(s1), [["Cloudy"], ["2Full"], ["15"], ["2026-11-08"], [note]]), tag + " daily: the fields show today's entry, to finish again: " + JSON.stringify(seed));
  // Finalize again with nothing changed: refused, nothing written
  const textBefore = typeInMd ? null : fs.readFileSync(file, "utf8");
  await inCard(o, K, "button.booklet-finalize").click();
  await sleep(1200);
  const n2 = await notices(o);
  c.ok(n2.some(t => /already kept/.test(t)) && (typeInMd || fs.readFileSync(file, "utf8") === textBefore), tag + " daily: Finalize with nothing changed is refused and writes nothing: " + JSON.stringify(n2.filter(t => /Booklet/.test(t))));
  // change one answer, Finalize again the same day: today's entry is replaced
  if (typeInMd) await typeInMd("MD-DAY-TWO");
  await question(o, K, "number").locator("input").fill("20");
  await o.evaluate(() => document.activeElement && document.activeElement.blur());
  const d2 = await waitDisk(file, t => { const b = blocksNamed(t, "booklet draft evening-log"); return b.length === 1 && same(json(b[0].body), { ...want, pages: 20 }); });
  c.ok(d2.ok, tag + " daily: one change writes today's answers and the change into the draft: " + JSON.stringify((blocksNamed(d2.text, "booklet draft evening-log")[0] || {}).body));
  await sleep(1100);   // a new second, so the replacing entry's ts differs
  await inCard(o, K, "button.booklet-finalize").click();
  const f2 = await waitDisk(file, t => !blocksNamed(t, "booklet draft evening-log").length && (json((blocksNamed(t, "booklet entries evening-log")[0] || {}).body).items || []).some(e => e.pages === 20));
  const body2 = (blocksNamed(f2.text, "booklet entries evening-log")[0] || {}).body || "";
  const items2 = json(body2).items || [];
  const today2 = items2[items2.length - 1] || {};
  c.ok(f2.ok && items2.length === olds + 1 && today2.pages === 20 && today2.ts !== today1.ts && items2.filter(e => e.ts.slice(0, 10) === today2.ts.slice(0, 10)).length === 1, tag + " daily: finishing again the same day replaced today's entry (" + items2.length + " entries; today's " + JSON.stringify(today2) + ")");
  c.ok(body2.startsWith(oldBody.replace(/\n\]\}$/, "")), tag + " daily: the earlier days' entries keep their bytes");
  c.ok(blocksNamed(f2.text, "booklet entries evening-log").length === 1 && count(f2.text, "```booklet draft") === 0, tag + " daily: one entries block, no draft block");
  await sleep(400);
  const listed = await listedEntries(o, K);
  c.ok(listed.length === olds + 1 && listed[0].words.includes("20") && listed[0].words.includes("Cloudy"), tag + " daily: the view lists " + listed.length + " days, newest first: " + JSON.stringify(listed[0]));
  c.info(tag + " daily notices: " + JSON.stringify(await notices(o)));
  return f2.text;
}

/* ================= CHECK 7 ================= */
async function check7() {
  const c = new Check(7, "drafts, Finalize and kept entries: repeat, and repeat daily finished twice in a day");
  await withApp("c7", async (o, vault) => {
    await openNote(o, KEPT, "walks/walk-log");
    const kt = await walkLogFlow(c, o, vault, "one pane", null);
    const kOrig = read(SRC_VAULT, KEPT);
    c.ok(head(kt) === head(kOrig), "Kept records: text before the records region unchanged");
    const lk = lint(path.join(vault, KEPT)); c.ok(lk.ok, "lint Kept records: exit " + lk.code + ": " + lk.out);
    await openNote(o, DAILY);
    const dt = await dailyFlow(c, o, vault, "one pane", null);
    c.ok(head(dt) === head(read(SRC_VAULT, DAILY)), "Daily tracker: text before the records region unchanged");
    const ld = lint(path.join(vault, DAILY)); c.ok(ld.ok, "lint Daily tracker: exit " + ld.code + ": " + ld.out);
  });
  return c;
}

/* ================= CHECK 8 ================= */
async function check8() {
  const c = new Check(8, "the same with the note also open in a Markdown pane: nothing lost or doubled, the buffer equals the disk; a change made there leaves a field being edited alone");
  await withApp("c8", async (o, vault) => {
    await o.page.waitForSelector(".nav-file-title", { timeout: 10000 });
    for (const [rel, flow, prose] of [[KEPT, walkLogFlow, "keeps every one of them."], [DAILY, dailyFlow, "replaces it."]]) {
      const file = path.join(vault, rel);
      const s = await splitWithMarkdown(o, c, rel);
      c.ok(JSON.stringify(s.types) === JSON.stringify(["booklet", "markdown"]) && s.leaves.every(l => l.file === rel), rel + ": two leaves on the same file: " + JSON.stringify(s.leaves.map(l => l.type)));
      if (rel === KEPT) await goTo(o, "walks/walk-log");
      await o.page.waitForSelector(BOOK + " .booklet-choice", { timeout: 8000 }); await sleep(800);
      const typed = [];
      const typeInMd = async word => {
        await o.evaluate(prose => {
          let leaf = null; app.workspace.iterateRootLeaves(l => { if (l.view.getViewType() === "markdown") leaf = l; });
          app.workspace.setActiveLeaf(leaf, { focus: true });
          const ed = leaf.view.editor; const n = ed.getValue().split("\n").findIndex(x => x.includes(prose));
          ed.setCursor({ line: n, ch: ed.getLine(n).length }); ed.focus();
        }, prose);
        await o.page.keyboard.type(" " + word);
        typed.push(word);
      };
      const end = await flow(c, o, vault, "with Markdown", typeInMd);
      await sleep(3500);   // the Markdown view saves its editor about 2 s after the last change
      const disk = fs.readFileSync(file, "utf8"), buf = await mdBuffer(o);
      c.ok(buf === disk, rel + ": the Markdown buffer equals the file on disk: " + (buf === disk) + (buf === disk ? "" : " (buffer " + buf.length + ", disk " + disk.length + ")"));
      c.ok(typed.every(w => count(disk, w) === 1 && count(buf, w) === 1), rel + ": words typed in the Markdown pane, once each on disk and in the buffer: " + typed.map(w => w + " x" + count(disk, w)).join(", "));
      const act = rel === KEPT ? "walk-log" : "evening-log";
      c.ok(count(disk, "```booklet entries " + act) === 1 && count(disk, "```booklet draft") === 0 && count(disk, "%%\n> [!records]") === 1, rel + ": one records region, one entries block, no draft left");
      const items = json(blocksNamed(disk, "booklet entries " + act)[0].body).items || [];
      const tss = items.map(e => e.ts);
      c.ok(new Set(tss).size === tss.length && items.length === 3, rel + ": " + items.length + " entries, no ts twice: " + JSON.stringify(tss));
      const origHead = head(read(SRC_VAULT, rel));
      const stripped = typed.reduce((t, w) => t.split(" " + w).join(""), head(disk));
      c.ok(stripped === origHead, rel + ": outside the records region, only the words typed in the Markdown pane changed: " + (stripped === origHead));
      const l = lint(file); c.ok(l.ok, rel + ": lint exit " + l.code + ": " + l.out);
      await o.evaluate(() => { app.workspace.iterateRootLeaves(l => { l.detach(); }); });
      await sleep(500);
    }
    // a change made in the Markdown pane reaches the view while a field is being edited there
    const s = await splitWithMarkdown(o, c, EVERY);
    c.ok(JSON.stringify(s.types) === JSON.stringify(["booklet", "markdown"]), EVERY + ": two leaves on the same file: " + JSON.stringify(s.leaves.map(l => l.type)));
    await goTo(o, "/kinds");
    await o.page.waitForSelector(BOOK + " .booklet-choice", { timeout: 8000 }); await sleep(800);
    await underneathFlow(c, o, vault, "changed in the Markdown pane", "markdown");
    await sleep(3500);   // the Markdown view saves its editor about 2 s after the last change
    const disk = fs.readFileSync(path.join(vault, EVERY), "utf8"), buf = await mdBuffer(o);
    c.ok(buf === disk, EVERY + ": the Markdown buffer equals the file on disk: " + (buf === disk));
  });
  return c;
}

/* ---------- the check-in note's widgets and shared list: check 11, in one pane and with a Markdown pane ---------- */
const CK = "day-check/today";
const draftBlocks = t => blocksNamed(t, "booklet draft today");
const draftOf = t => { const b = draftBlocks(t); return b.length ? json(b[b.length - 1].body) : null; };
const draftBody = t => (draftBlocks(t)[0] || {}).body;
const placesQ = o => question(o, CK, "widget", 0);
const place = (o, label) => placesQ(o).locator("button.booklet-place", { hasText: label });
const sense = (o, label) => placesQ(o).locator(".booklet-panel button.booklet-sense", { hasText: label });
const placeField = o => placesQ(o).locator(".booklet-panel .booklet-own-row input");
const gridCell = (o, id) => inCard(o, CK, ".booklet-cell[data-booklet-cell='" + id + "']");
const gridItem = (o, id, label) => gridCell(o, id).locator("button.booklet-item", { hasText: label });
const cellField = (o, id) => gridCell(o, id).locator(".booklet-own-row input");
// the question asked for each feeling picked (each:), one copy for each pick, by its pick's key (s:tense)
const feltQ = o => inCard(o, CK, "[data-booklet-q='felt']");
const copyOf = (o, pick) => feltQ(o).locator(".booklet-copy[data-booklet-pick='" + pick + "']");
const inCopy = (o, pick, label) => copyOf(o, pick).locator("button.booklet-choice").filter({ hasText: new RegExp("^\\s*" + label + "\\s*$") }).first();
const feltShown = o => o.evaluate(sel => {
  const box = document.querySelector(sel + " [data-booklet-q='felt']"), copies = [...box.querySelectorAll(".booklet-copy")];
  const on = (c, p) => [...c.querySelectorAll("button.booklet-choice")].filter(b => b.getAttribute("aria-pressed") === p).map(b => b.textContent.trim());
  return {
    hidden: box.classList.contains("booklet-each-none"), prompts: box.querySelectorAll(".booklet-prompt").length, helps: box.querySelectorAll(".booklet-help").length,
    heads: copies.map(c => c.querySelector(".booklet-pick-head").textContent),
    pressed: Object.fromEntries(copies.map(c => [c.getAttribute("data-booklet-pick"), on(c, "true")])),
    offered: Object.fromEntries(copies.map(c => [c.getAttribute("data-booklet-pick"), [...c.querySelectorAll("button.booklet-own[aria-pressed=false]")].map(b => b.textContent.trim())])),
    notice: !!box.querySelector(".booklet-kept-note:not(.booklet-none)") && box.querySelector(".booklet-kept-note").textContent,
    disabled: [...box.querySelectorAll("button, input")].every(b => b.disabled), controls: box.querySelectorAll("button, input").length,
  };
}, cardSel(CK));
const spot = (o, label) => inCard(o, CK, "[data-booklet-q='where'] button.booklet-choice").filter({ hasText: label });
async function typeIn(o, field, words, enter = true) { await field.click(); await o.page.keyboard.type(words); if (enter) await o.page.keyboard.press("Enter"); }
// what the check-in card shows: each cell's pressed words, the places marked (with their counts), the place open, the
// summary's rows and the shared list's pressed options
const checkinShown = o => o.evaluate(sel => {
  const card = document.querySelector(sel), [pl, gr] = card.querySelectorAll(".booklet-kind-widget");
  const on = root => [...root.querySelectorAll("button.booklet-choice")].filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.textContent.trim());
  return {
    grid: [...gr.querySelectorAll(".booklet-cell")].map(x => x.getAttribute("data-booklet-cell") + ": " + on(x).join(", ")),
    marked: [...pl.querySelectorAll("button.booklet-place.booklet-marked")].map(b => b.textContent.trim()),
    open: (pl.querySelector(".booklet-panel-title") || {}).textContent || null,
    summary: [...pl.querySelectorAll(".booklet-summary-row")].map(r => r.textContent.trim()),
    where: on(card.querySelector("[data-booklet-q='where']")),
  };
}, cardSel(CK));
const NOTHING = { grid: ["agitating: ", "invigorating: ", "draining: ", "soothing: "], marked: [], summary: [], where: [] };
// some answers, so that the screenshots show pressed words, marked places, an open place and the summary, and two
// feelings picked with the places each is felt in (an own place among them)
async function answerForShots(o) {
  await gridItem(o, "agitating", "Tense").click(); await gridItem(o, "invigorating", "Cheerful").click();
  await inCopy(o, "s:tense", "Chest").click(); await inCopy(o, "s:tense", "Stomach").click();
  await inCopy(o, "s:cheerful", "Head").click();
  await typeIn(o, copyOf(o, "s:cheerful").locator(".booklet-own-row input"), "Face");
  await place(o, "Hands").click(); await sense(o, "Cool").click();
  await place(o, "Shoulders").click(); await sense(o, "Tight").click(); await sense(o, "Warm").click();
  await typeIn(o, placeField(o), "achy");
  await spot(o, "Outdoors").click();
  await blurNow(o); await sleep(1500);
}

// The whole run on the check-in note: what is drawn (one pane), the widgets and the shared list answered with words of
// the reader's own, a change to the note arriving while the reader is in a widget's own field (by `route`, as
// changeUnder makes it), every answer cleared, then answered again and finished. `typeInMd`: with a Markdown pane
// open, a word is typed into its editor between the steps.
async function checkinFlow(c, o, vault, tag, route, typeInMd) {
  const file = path.join(vault, CHECKIN), orig = fs.readFileSync(file, "utf8");
  const say = (cond, msg) => c.ok(cond, tag + ": " + msg);
  const added = [];   // words that the changes and the Markdown pane add to the prose
  const md = async w => { if (typeInMd) { await typeInMd(w); added.push(w); } };
  const strip = t => added.reduce((x, w) => x.split(" " + w).join(""), head(t));
  const W = s => "UNDER-" + s + "-" + route.toUpperCase();
  const lintOk = when => { const l = lint(file); say(l.ok, "lint " + when + ": exit " + l.code + ": " + l.out); };

  if (!typeInMd) {
    // what is drawn: the openings, the grid's cells in the theme's colours with their edge labels, the places as buttons
    const d = await o.evaluate(sel => {
      const v = document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-page"), card = document.querySelector(sel);
      const [pl, gr] = card.querySelectorAll(".booklet-kind-widget");
      const probe = document.body.createDiv(), colour = v => { probe.style.color = "var(" + v + ")"; return getComputedStyle(probe).color; };
      const VARS = { warm: "--color-red", green: "--color-green", amber: "--color-orange", teal: "--color-cyan", slate: "--text-muted", blue: "--color-blue", purple: "--color-purple" };
      const cells = [...gr.querySelectorAll(".booklet-cell")].map(x => { const name = [...x.classList].find(k => k.startsWith("booklet-colour-")).slice(15), cs = getComputedStyle(x); return { id: x.getAttribute("data-booklet-cell"), name, band: cs.borderTopColor, wanted: colour(VARS[name]), wash: cs.backgroundColor, items: [...x.querySelectorAll("button.booklet-item")].map(b => b.textContent), field: !!x.querySelector(".booklet-own-row input") }; });
      probe.remove();
      return {
        openings: [card.textContent.replace(/\s+/g, " ").includes("Take a moment. There are no right answers here.")],
        axes: [...gr.querySelectorAll(".booklet-axis")].map(x => x.textContent), cells,
        places: [...pl.querySelectorAll("button.booklet-place")].map(b => b.textContent),
        figures: pl.querySelectorAll("svg:not(.svg-icon), img, canvas").length,
        panel: pl.querySelector(".booklet-panel").textContent,
        unsupported: [...card.querySelectorAll(".booklet-muted")].map(x => x.textContent).filter(x => /not yet supported/i.test(x)),
        where: [...card.querySelectorAll("[data-booklet-q='where'] button.booklet-choice")].map(b => b.textContent.trim()),
        felt: { hidden: card.querySelector("[data-booklet-q='felt']").classList.contains("booklet-each-none"), shown: !!card.querySelector("[data-booklet-q='felt']").offsetParent, copies: card.querySelectorAll("[data-booklet-q='felt'] .booklet-copy").length },
      };
    }, cardSel(CK));
    c.info(tag + ": drawn " + JSON.stringify(d));
    say(d.openings[0] === true, "the activity's own opening text is drawn on its screen (the booklet's and the module's are on the home and module screens, checked in check 16): " + JSON.stringify(d.openings));
    say(same(d.axes, ["more energy", "less pleasant", "more pleasant", "less energy"]), "the grid's four edge labels: " + JSON.stringify(d.axes));
    say(same(d.cells.map(x => x.id + " " + x.name), ["agitating warm", "invigorating green", "draining blue", "soothing purple"]) && d.cells.every(x => x.band === x.wanted && x.field && x.items.length === 2), "each cell has its colour name's band in the theme's colour, two items to press and a field of its own: " + JSON.stringify(d.cells.map(x => x.name + " band " + x.band + " (" + x.wanted + " wanted)")));
    say(new Set(d.cells.map(x => x.wash)).size === 4, "the four cells' washes differ: " + JSON.stringify(d.cells.map(x => x.wash)));
    say(d.places.length === 11 && d.places[0] === "Head" && d.figures === 0 && d.panel === "Press a place above to begin.", "the places are 11 buttons, no figure is drawn (" + d.figures + "), and the panel waits for a place: " + JSON.stringify(d.panel));
    say(!d.unsupported.length && same(d.where, ["At home", "At work", "Outdoors", "Travelling"]), "nothing in the card says not yet supported, and the shared list's options are drawn: " + JSON.stringify(d.where));
    say(d.felt.hidden && !d.felt.shown && d.felt.copies === 0, "the question asked for each feeling is not drawn while no feeling is picked: " + JSON.stringify(d.felt));
  }

  // answer: the grid (three presses, then a word of the reader's own), the places (sense words, own words), the shared list
  await gridItem(o, "agitating", "Tense").click();
  await gridItem(o, "invigorating", "Cheerful").click();
  await md("MD-GRID");
  await gridItem(o, "invigorating", "Lively").click();
  const pickedBefore = (draftOf((await waitDisk(file, t => ((draftOf(t) || {}).feelings || []).length === 3)).text) || {}).feelings, headsBefore = (await feltShown(o)).heads;
  await typeIn(o, cellField(o, "invigorating"), "fizzy");
  {
    // a word written in a picked feeling's cell goes at the end of the grid's answer, which keeps the order the reader
    // picked (SPEC section 8, booklet.html's order), and the copies asked where each feeling is felt stay where they are
    // on screen, the new pick's at the end
    const dw = await waitDisk(file, t => ((draftOf(t) || {}).feelings || []).length === 4);
    const after = await feltShown(o), focus = await o.evaluate(() => { const a = document.activeElement; return a && a.closest("[data-booklet-cell]") ? a.closest("[data-booklet-cell]").getAttribute("data-booklet-cell") : null; });
    const pickedAfter = (draftOf(dw.text) || {}).feelings;
    say(same(pickedAfter, [...pickedBefore, "x|invigorating|fizzy"]) && same(after.heads, [...headsBefore, "fizzy"]) && focus === "invigorating", "a word written in Invigorating's cell: the grid's answer went from " + JSON.stringify(pickedBefore) + " to " + JSON.stringify(pickedAfter) + ", and the copies on screen went from " + JSON.stringify(headsBefore) + " to " + JSON.stringify(after.heads) + " (none moved, the new one at the end); the cell's field keeps focus: " + focus);
  }
  await place(o, "Shoulders").click();
  await sense(o, "Tight").click(); await sense(o, "Warm").click();
  await typeIn(o, placeField(o), "achy");
  await md("MD-PLACES");
  await place(o, "Hands").click();
  await typeIn(o, placeField(o), "Cool");
  await spot(o, "Outdoors").click(); await spot(o, "At home").click();
  await blurNow(o);
  const want = { feelings: ["tense", "cheerful", "lively", "x|invigorating|fizzy"], places: [{ id: "shoulders", s: ["tight", "warm", "achy"] }, { id: "hands", s: ["cool"] }], where: [3, 1] };
  let d = await waitDisk(file, t => same(draftOf(t), want));
  say(d.ok, "the draft on disk, verbatim: " + draftBody(d.text));
  say(draftBody(d.text) === JSON.stringify(want) && draftBlocks(d.text).length === 1, "one draft block, one line of JSON, as booklet.html writes a draft");
  say(strip(d.text) === (regionAt(orig) >= 0 ? head(orig) : orig + "\n"), "outside the records region nothing changed" + (typeInMd ? " but the words typed in the Markdown pane" : " but the blank line before the new region"));
  lintOk("after answering");
  c.info(tag + ": records region after answering: " + JSON.stringify(d.text.slice(regionAt(d.text))));

  if (!typeInMd) {
    // a new view, drawn from the file, shows every answer
    await reopen(o, CHECKIN);
    const s = await checkinShown(o);
    say(same(s, { grid: ["agitating: Tense", "invigorating: Lively, Cheerful, fizzy", "draining: ", "soothing: "], marked: ["Shoulders3", "Hands1"], open: null, summary: ["Shoulders— Tight, Warm, achy", "Hands— Cool"], where: ["At home", "Outdoors"] }), "a new view shows every answer: " + JSON.stringify(s));
    // what changes no answer writes nothing: opening a place, Add with nothing typed, a word the place or cell already holds
    const bytes = fs.readFileSync(file, "utf8");
    await place(o, "Legs").click();
    await placesQ(o).locator(".booklet-panel button.booklet-add").click();
    await place(o, "Shoulders").click(); await typeIn(o, placeField(o), "TIGHT");
    await typeIn(o, cellField(o, "invigorating"), "lively");
    await blurNow(o); await sleep(2000);
    say(fs.readFileSync(file, "utf8") === bytes, "opening a place, Add with nothing typed, and typing a word already held (TIGHT, lively) leave the file's bytes as they were");
  }

  // the grid: words typed in a cell's own field; a change to the note arrives (its prose, and the grid's answer); Enter
  await typeIn(o, cellField(o, "soothing"), "Unhurried", false); await markFocused(o);
  let ms = await changeUnder(o, route, W("GRID"), "feelings", ["settled", "x|agitating|loud"], CHECKIN, "booklet draft today"); added.push(W("GRID"));
  let m = await marked(o);
  say(m.same && m.value === "Unhurried", "the change reached the view after " + ms + " ms while a cell's own field was being typed in: the same field, with focus, still holds " + JSON.stringify(m.value));
  say(await gridItem(o, "soothing", "Settled").getAttribute("aria-pressed") === "true", "meanwhile the cell's buttons show the changed answer (Settled pressed)");
  await o.page.keyboard.press("Enter");
  // the word goes at the end of what the note now holds, in the order it holds it (SPEC section 8)
  d = await waitDisk(file, t => same((draftOf(t) || {}).feelings, ["settled", "x|agitating|loud", "x|soothing|Unhurried"]));
  say(d.ok, "Enter adds the reader's word at the end of what the note now holds, its order kept: feelings " + JSON.stringify((draftOf(d.text) || {}).feelings));
  await blurNow(o);
  say(await viewShows(o, W("GRID")), "once the reader left the field, the view is drawn again with the changed prose");

  // the places: the same in the open place's field
  await place(o, "Chest").click();
  await typeIn(o, placeField(o), "Flutter", false); await markFocused(o);
  ms = await changeUnder(o, route, W("PLACES"), "places", [{ id: "chest", s: ["heavy"] }], CHECKIN, "booklet draft today"); added.push(W("PLACES"));
  m = await marked(o);
  say(m.same && m.value === "Flutter", "the change reached the view after " + ms + " ms while the open place's field was being typed in: the same field, with focus, still holds " + JSON.stringify(m.value));
  say(await sense(o, "Heavy").getAttribute("aria-pressed") === "true", "meanwhile the panel shows the changed answer (Heavy pressed)");
  await o.page.keyboard.press("Enter");
  d = await waitDisk(file, t => same((draftOf(t) || {}).places, [{ id: "chest", s: ["heavy", "Flutter"] }]));
  say(d.ok, "Enter adds the reader's word to what the note now holds: places " + JSON.stringify((draftOf(d.text) || {}).places));
  await blurNow(o);
  say(await viewShows(o, W("PLACES")), "once the reader left the field, the view is drawn again with the changed prose");

  // words typed and not added: the field keeps them while the note changes; leaving the field adds them, as
  // booklet.html's tag field does, and the view is drawn again with the place they were typed for still open
  await place(o, "Neck").click();
  await typeIn(o, placeField(o), "Stiff", false); await markFocused(o);
  await changeUnder(o, route, W("HELD"), null, null, CHECKIN, "booklet draft today"); added.push(W("HELD"));
  m = await marked(o);
  say(m.same && m.value === "Stiff", "a change to the prose alone, while the field holds words not added: the same field and its words " + JSON.stringify(m.value));
  await blurNow(o);
  d = await waitDisk(file, t => same((draftOf(t) || {}).places, [{ id: "chest", s: ["heavy", "Flutter"] }, { id: "neck", s: ["Stiff"] }]));
  say(d.ok, "leaving the field adds its words, with no Add and no Enter: places " + JSON.stringify((draftOf(d.text) || {}).places));
  say(await viewShows(o, W("HELD")), "the view is drawn again once the field is left");
  const kept = await o.evaluate(sel => { const pl = document.querySelector(sel).querySelectorAll(".booklet-kind-widget")[0], f = pl.querySelector(".booklet-panel .booklet-own-row input"); return { open: (pl.querySelector(".booklet-panel-title") || {}).textContent, value: f && f.value, own: [...pl.querySelectorAll(".booklet-panel .booklet-own-words button.booklet-own")].map(b => b.textContent.trim()) }; }, cardSel(CK));
  say(kept.open === "Neck" && kept.value === "" && same(kept.own, ["Stiff"]), "drawn again, Neck is still open, its field is empty and Stiff is one of its own words: " + JSON.stringify(kept));
  c.info(tag + ": the draft before clearing: " + draftBody(d.text));

  // clear every widget and the shared list: own words pressed out, an item, a place's own word, Clear, the summary's x
  await gridCell(o, "agitating").locator("button.booklet-own").click();
  await gridCell(o, "soothing").locator("button.booklet-own").click();
  await gridItem(o, "soothing", "Settled").click();
  await place(o, "Chest").click();
  await placesQ(o).locator(".booklet-own-words button.booklet-own").click();
  d = await waitDisk(file, t => same((draftOf(t) || {}).places, [{ id: "chest", s: ["heavy"] }, { id: "neck", s: ["Stiff"] }]));
  say(d.ok, "the reader's own word pressed out of the open place: places " + JSON.stringify((draftOf(d.text) || {}).places));
  await placesQ(o).locator(".booklet-panel button.booklet-clear").click();
  d = await waitDisk(file, t => same((draftOf(t) || {}).places, [{ id: "neck", s: ["Stiff"] }]));
  say(d.ok, "Clear this place takes the open place out: places " + JSON.stringify((draftOf(d.text) || {}).places));
  await placesQ(o).locator(".booklet-summary-x").click();
  await spot(o, "Outdoors").click(); await spot(o, "At home").click();
  await blurNow(o);
  d = await waitDisk(file, t => !draftBlocks(t).length && regionAt(t) >= 0);
  say(d.ok, "the summary's x took the last place out, and with everything cleared no draft block is left on disk");
  say(strip(d.text) === (regionAt(orig) >= 0 ? head(orig) : orig + "\n"), "outside the records region, only the words the changes added are new");
  lintOk("after clearing");
  const s0 = await checkinShown(o);
  say(same({ ...s0, open: undefined }, { ...NOTHING, open: undefined }), "the view shows nothing answered: " + JSON.stringify(s0));

  // answered again, with words typed in an own field and never added with Add or Enter: the reader leaves the field
  // by a press elsewhere in the widget (the words are added first, then the press, as booklet.html takes them; its
  // JSON for the same presses, from its own engines, is BH below), by a click elsewhere in the view, by opening
  // another note, and by Finalize
  const BH = {
    1: '["tense","x|invigorating|fizzy","settled"]', 2: '[{"id":"shoulders","s":["tight","achy","warm"]}]', 3: '[{"id":"shoulders","s":["tight","achy","warm"]}]',
    4: '["tense","x|invigorating|fizzy","settled","tired"]', 5: '[{"id":"shoulders","s":["tight","achy","warm"]},{"id":"hands","s":["cool"]}]',
  };
  const typeOnly = (field, words) => typeIn(o, field, words, false);
  const order = (n, what, got) => say(got === BH[n], "press order " + n + ", " + what + ": Obsidian " + got + " | booklet.html " + BH[n] + " | same: " + (got === BH[n]));
  // 1: Tense; "fizzy" typed in Invigorating's field; Settled pressed in Soothing
  await gridItem(o, "agitating", "Tense").click();
  await typeOnly(cellField(o, "invigorating"), "fizzy");
  await gridItem(o, "soothing", "Settled").click();
  d = await waitDisk(file, t => JSON.stringify((draftOf(t) || {}).feelings) === BH[1]);
  order(1, "the grid: Tense; fizzy typed in Invigorating; Settled pressed in Soothing", JSON.stringify((draftOf(d.text) || {}).feelings));
  // 2: Shoulders, Tight; "achy" typed in its field; Warm pressed
  await place(o, "Shoulders").click(); await sense(o, "Tight").click();
  await typeOnly(placeField(o), "achy");
  await sense(o, "Warm").click();
  d = await waitDisk(file, t => JSON.stringify((draftOf(t) || {}).places) === BH[2]);
  order(2, "the places: Shoulders, Tight; achy typed; Warm pressed", JSON.stringify((draftOf(d.text) || {}).places));
  // 3: Hands, Cool; "numb" typed in its field; Clear this place pressed (the words are added, then the place cleared)
  await place(o, "Hands").click(); await sense(o, "Cool").click();
  await waitDisk(file, t => ((draftOf(t) || {}).places || []).some(p => p.id === "hands"));
  await typeOnly(placeField(o), "numb");
  await placesQ(o).locator(".booklet-panel button.booklet-clear").click();
  d = await waitDisk(file, t => JSON.stringify((draftOf(t) || {}).places) === BH[3]);
  order(3, "then Hands, Cool; numb typed; Clear this place pressed", JSON.stringify((draftOf(d.text) || {}).places));
  // 4: "tired" typed in Draining's field, then Tired pressed: the words press it, and the press only confirms it, as
  // booklet.html holds it (holdIn), rather than taking it back; the disk is read again after a pause, so a press that
  // took it back would be seen. Then Tired pressed again is a press again, and takes it out.
  const settledOn = async (pick, want) => { await waitDisk(file, t => JSON.stringify((draftOf(t) || {})[pick]) === want); await sleep(600); return waitDisk(file, t => JSON.stringify((draftOf(t) || {})[pick]) === want); };
  await typeOnly(cellField(o, "draining"), "tired");
  await gridItem(o, "draining", "Tired").click();
  d = await settledOn("feelings", BH[4]);
  order(4, "the grid: tired typed in Draining; Tired pressed (pressed once, not pressed and taken back)", JSON.stringify((draftOf(d.text) || {}).feelings));
  say(await gridItem(o, "draining", "Tired").getAttribute("aria-pressed") === "true", "and Tired is drawn pressed");
  await gridItem(o, "draining", "Tired").click();
  d = await settledOn("feelings", BH[1]);
  say(d.ok, "Tired pressed again takes it out: feelings " + JSON.stringify((draftOf(d.text) || {}).feelings));
  // 5: Hands open; "cool" typed in its field, then Cool pressed: the same for a place's word; then Cool pressed again
  await place(o, "Hands").click();
  await typeOnly(placeField(o), "cool");
  await sense(o, "Cool").click();
  d = await settledOn("places", BH[5]);
  order(5, "the places: Hands; cool typed; Cool pressed (pressed once, not pressed and taken back)", JSON.stringify((draftOf(d.text) || {}).places));
  say(await sense(o, "Cool").getAttribute("aria-pressed") === "true", "and Cool is drawn pressed");
  await sense(o, "Cool").click();
  d = await settledOn("places", BH[3]);
  say(d.ok, "Cool pressed again takes it out: places " + JSON.stringify((draftOf(d.text) || {}).places));
  // a click elsewhere in the view: "Drowsy" typed in Draining's field, then the card's title clicked
  await typeOnly(cellField(o, "draining"), "Drowsy");
  await inCard(o, CK, ".booklet-card-title").click();
  d = await waitDisk(file, t => same((draftOf(t) || {}).feelings, ["tense", "x|invigorating|fizzy", "settled", "x|draining|Drowsy"]));
  say(d.ok, "typed in a cell's field, then a click elsewhere in the view: the words are on disk: feelings " + JSON.stringify((draftOf(d.text) || {}).feelings));
  // another note opened in the booklet's pane: Feet, Restless; "Sore" typed; Every kind opened, then the check-in again
  await place(o, "Feet").click(); await sense(o, "Restless").click();
  await typeOnly(placeField(o), "Sore");
  const openHere = async (rel, key) => { await o.evaluate(async rel => { await app.workspace.getLeavesOfType("booklet")[0].openFile(app.vault.getAbstractFileByPath(rel)); }, rel); await o.page.waitForSelector(BOOK + " .booklet-page", { timeout: 8000 }); await goTo(o, key); };
  await openHere(EVERY, "/kinds");
  const away = await o.page.waitForFunction(rel => { const v = app.workspace.getLeavesOfType("booklet")[0].view; return v.file && v.file.path === rel && !!document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-card[data-booklet-activity='/kinds']"); }, EVERY, { timeout: 8000, polling: 50 }).then(() => true, () => false);
  await openHere(CHECKIN, CK);
  await o.page.waitForSelector(cardSel(CK) + " .booklet-place", { timeout: 8000 }); await sleep(300);
  const back = await checkinShown(o);
  const wantPlaces = [{ id: "shoulders", s: ["tight", "achy", "warm"] }, { id: "feet", s: ["restless", "Sore"] }];
  d = await waitDisk(file, t => same((draftOf(t) || {}).places, wantPlaces));
  say(away && d.ok && same(back.summary, ["Shoulders— Tight, achy, Warm", "Feet— Restless, Sore"]), "typed in a place's field, then another note opened in the pane (" + (away ? "it was drawn" : "it was NOT drawn") + ") and the check-in opened again: the words are on disk and shown: places " + JSON.stringify((draftOf(d.text) || {}).places) + ", summary " + JSON.stringify(back.summary));
  c.info(tag + ": the draft before Finalize: " + draftBody(d.text));
  // Finalize pressed while "Yawning" is typed in Draining's field: the words are in the kept entry
  await typeOnly(cellField(o, "draining"), "Yawning");
  const t0 = Date.now();
  await inCard(o, CK, "button.booklet-finalize").click();
  const f = await waitDisk(file, t => !draftBlocks(t).length && ((json((blocksNamed(t, "booklet entries today")[0] || {}).body) || {}).items || []).length === 1);
  const body = (blocksNamed(f.text, "booklet entries today")[0] || {}).body || "";
  const e = ((json(body) || {}).items || [])[0] || {};
  const wantWeather = ["tense", "x|invigorating|fizzy", "settled", "x|draining|Drowsy", "x|draining|Yawning"];
  say(f.ok && same(Object.keys(e), ["ts", "feelings", "places"]) && same(e.feelings, wantWeather) && same(e.places, wantPlaces) && Math.abs(Date.parse(e.ts) - t0) < 15000, "typed in a cell's field, then Finalize: the words are in the kept entry, verbatim: " + JSON.stringify(body));
  await sleep(500);
  const listed = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-entry")].map(x => [...x.querySelectorAll("dd")].map(dd => dd.querySelector("li") ? [...dd.querySelectorAll("li")].map(l => l.textContent) : dd.textContent)), cardSel(CK));
  say(listed.length === 1 && same(listed[0], [["Shoulders — Tight, achy, Warm", "Feet — Restless, Sore"], "Tense, fizzy, Settled, Drowsy, Yawning"]), "the kept entry shows each place with its words, and the grid's labels and own words: " + JSON.stringify(listed));
  const seeded = await checkinShown(o);
  say(same(seeded.grid, ["agitating: Tense", "invigorating: fizzy", "draining: Drowsy, Yawning", "soothing: Settled"]) && same(seeded.marked, ["Shoulders3", "Feet2"]), "the widgets show today's entry, to finish again: " + JSON.stringify(seeded));
  if (!typeInMd) {
    // the pane closed while "Twitchy" is typed in Draining's field: the words are in the draft on disk, and shown when
    // the note is opened again
    await typeOnly(cellField(o, "draining"), "Twitchy");
    await reopen(o, CHECKIN);
    d = await waitDisk(file, t => ((draftOf(t) || {}).feelings || []).includes("x|draining|Twitchy"));
    const s = await checkinShown(o);
    say(d.ok && s.grid[2] === "draining: Drowsy, Yawning, Twitchy", "typed in a cell's field, then the pane closed: the words are in the draft on disk (" + draftBody(d.text) + ") and shown when the note is opened again: " + JSON.stringify(s.grid[2]));
  }
  if (typeInMd) await sleep(3500);   // the Markdown view saves its editor about 2 s after the last change
  const last = fs.readFileSync(file, "utf8");
  say(strip(last) === (regionAt(orig) >= 0 ? head(orig) : orig + "\n"), "after Finalize, outside the records region only the added words are new");
  lintOk("after Finalize");
  return { last, added };
}

/* ================= CHECK 11 ================= */
async function check11() {
  const c = new Check(11, "the widgets and a shared list on the check-in note: drawn, answered and cleared on disk with words of the reader's own, a field kept while the note changes, own words added when the field is left (a press, in booklet.html's order; a press on the very item or place word they name, held as booklet.html holds it; a click elsewhere; another note; Finalize; the pane closed), a kept entry in words; in one pane and with a Markdown pane");
  await withApp("c11", async (o, vault) => {
    await openNote(o, CHECKIN);
    await checkinFlow(c, o, vault, "one pane", "disk", null);
  });
  await withApp("c11-md", async (o, vault) => {
    await o.page.waitForSelector(".nav-file-title", { timeout: 10000 });
    const s = await splitWithMarkdown(o, c, CHECKIN);
    c.ok(same(s.types, ["booklet", "markdown"]) && s.leaves.every(l => l.file === CHECKIN), "with Markdown: two leaves on the same file: " + JSON.stringify(s.leaves.map(l => l.type)));
    await o.page.waitForSelector(BOOK + " .booklet-place", { timeout: 8000 }); await sleep(800);
    const typeInMd = typeInMarkdown(o);
    const { last, added } = await checkinFlow(c, o, vault, "with Markdown", "markdown", typeInMd);
    const buf = await mdBuffer(o);
    c.ok(buf === last, "with Markdown: the Markdown buffer equals the file on disk: " + (buf === last) + (buf === last ? "" : " (buffer " + buf.length + ", disk " + last.length + ")"));
    c.ok(added.every(w => count(last, w) === 1 && count(buf, w) === 1), "with Markdown: each added word once on disk and in the buffer: " + added.map(w => w + " x" + count(last, w)).join(", "));
    c.ok(count(last, "%%\n> [!records") === 1 && count(last, "```booklet entries today") === 1 && count(last, "```booklet draft") === 0, "with Markdown: one records region, one entries block, no draft left");
    // a change made on disk (as Sync makes it) while the Markdown pane is open: the view is handed it before that pane
    // takes it into its editor, and follows it from there
    const t1 = Date.now();
    await o.evaluate(async rel => { await app.vault.process(app.vault.getAbstractFileByPath(rel), t => t.replace("There are no right answers here.", "There are no right answers here. FROM-SYNC")); }, CHECKIN);
    const seen = await viewShows(o, "FROM-SYNC"), ms = Date.now() - t1;
    await sleep(3000);
    const disk2 = fs.readFileSync(path.join(vault, CHECKIN), "utf8"), buf2 = await mdBuffer(o);
    c.ok(seen && count(disk2, "FROM-SYNC") === 1 && buf2 === disk2, "with Markdown: a change made on disk is drawn in the view after " + ms + " ms, and the Markdown buffer equals the file: " + (buf2 === disk2));
  });
  return c;
}

/* ---------- the question asked for each feeling picked (each:): check 12, in one pane and with a Markdown pane ---------- */
// Answered, a feeling taken back and picked again, a field of a copy kept while copies are added and taken away around
// it (by a change made on disk or in the Markdown pane), Finalize, and an answer of the wrong shape left alone.
async function eachFlow(c, o, vault, tag, route, typeInMd) {
  const file = path.join(vault, CHECKIN), orig = fs.readFileSync(file, "utf8");
  const say = (cond, msg) => c.ok(cond, tag + ": " + msg);
  const added = [];
  const md = async w => { if (typeInMd) { await typeInMd(w); added.push(w); } };
  const strip = t => added.reduce((x, w) => x.split(" " + w).join(""), head(t));
  const W = s => "EACH-" + s + "-" + route.toUpperCase();
  // a word typed in the Markdown pane changes the note's design: the view is drawn again once that pane saves, and a
  // drawing takes the copies' order from the answer, so the next step waits for it
  const mdDrawn = async w => { if (typeInMd) { await viewShows(o, w); await sleep(300); } };
  const felt = t => (draftOf(t) || {}).felt;
  const PAIRS = [{ pick: "tense", a: [5] }, { pick: "lively", a: [1, "Throat"] }];

  let f = await feltShown(o);
  say(f.hidden && !f.heads.length, "nothing is drawn while nothing is picked: " + JSON.stringify(f));
  await gridItem(o, "agitating", "Tense").click();
  await gridItem(o, "invigorating", "Lively").click();
  await md("MD-PICKED"); await mdDrawn("MD-PICKED");
  f = await feltShown(o);
  say(!f.hidden && same(f.heads, ["Tense", "Lively"]) && f.prompts === 1 && f.helps === 1, "two feelings picked: a copy for each, in the grid's order, under its words, the title and help once: " + JSON.stringify(f.heads));
  // a word written in the first feeling's cell goes at the end of the grid's answer, the order as picked (SPEC section 8); no copy moves
  await typeIn(o, cellField(o, "agitating"), "edgy");
  let d = await waitDisk(file, t => ((draftOf(t) || {}).feelings || []).includes("x|agitating|edgy"));
  f = await feltShown(o);
  let focus = await o.evaluate(() => { const a = document.activeElement; return a && a.closest("[data-booklet-cell]") ? a.closest("[data-booklet-cell]").getAttribute("data-booklet-cell") : null; });
  say(same((draftOf(d.text) || {}).feelings, ["tense", "lively", "x|agitating|edgy"]) && same(f.heads, ["Tense", "Lively", "edgy"]) && focus === "agitating", "a word written in Tense's cell: the grid stores " + JSON.stringify((draftOf(d.text) || {}).feelings) + ", the copies stay " + JSON.stringify(f.heads) + " (the new one at the end), and the cell's field keeps focus: " + focus);
  await gridCell(o, "agitating").locator("button.booklet-own").click();
  d = await waitDisk(file, t => same((draftOf(t) || {}).feelings, ["tense", "lively"]));
  f = await feltShown(o);
  say(d.ok && same(f.heads, ["Tense", "Lively"]), "the word pressed out again: the grid stores " + JSON.stringify((draftOf(d.text) || {}).feelings) + ", the copies on screen " + JSON.stringify(f.heads));
  // answered: Chest under Tense; Head and a place of the reader's own under Lively
  await inCopy(o, "s:tense", "Chest").click();
  await inCopy(o, "s:lively", "Head").click();
  await typeIn(o, copyOf(o, "s:lively").locator(".booklet-own-row input"), "Throat");
  await blurNow(o);
  d = await waitDisk(file, t => same(felt(t), PAIRS));
  say(d.ok, "the pairs on disk, verbatim: " + draftBody(d.text));
  say(draftBody(d.text) === JSON.stringify({ feelings: ["tense", "lively"], felt: PAIRS }), "the draft is one line of JSON, the pick as the grid stores it");
  f = await feltShown(o);
  say(same(f.offered["s:tense"], ["Throat"]) && same(f.pressed["s:lively"], ["Head", "Throat"]), "the place written in under Lively is offered under Tense: " + JSON.stringify(f.offered));
  lintOk(c, file, tag, "after answering");
  // Tense taken back: its pair stays on disk, not drawn
  await gridItem(o, "agitating", "Tense").click();
  d = await waitDisk(file, t => same((draftOf(t) || {}).feelings, ["lively"]));
  f = await feltShown(o);
  say(d.ok && same(felt(d.text), PAIRS) && same(f.heads, ["Lively"]), "Tense taken back: its copy goes, and its pair is kept on disk: " + draftBody(d.text));
  await md("MD-UNPICKED"); await mdDrawn("MD-UNPICKED");
  // picked again: the pair comes back, its copy after Lively's
  await gridItem(o, "agitating", "Tense").click();
  d = await waitDisk(file, t => same((draftOf(t) || {}).feelings, ["lively", "tense"]));
  f = await feltShown(o);
  say(d.ok && same(felt(d.text), PAIRS) && same(f.heads, ["Lively", "Tense"]) && same(f.pressed["s:tense"], ["Chest"]), "Tense picked again: its copy comes back with Chest pressed: " + JSON.stringify(f.pressed) + "; on disk " + draftBody(d.text));

  // a field of a copy kept while a copy is added below it (though first in the grid's answer) and the copies above and
  // below it are taken away, each by a change made elsewhere
  await typeIn(o, copyOf(o, "s:tense").locator(".booklet-own-row input"), "Shin", false); await markFocused(o);
  let ms = await changeUnder(o, route, W("ADDED"), "feelings", ["rushed", "lively", "tense"], CHECKIN, "booklet draft today"); added.push(W("ADDED"));
  let m = await marked(o); f = await feltShown(o);
  say(m.same && m.value === "Shin" && same(f.heads, ["Lively", "Tense", "Rushed"]), "a copy added (Rushed, first in the grid's answer, at the end on screen, by a change that reached the view after " + ms + " ms): the field the reader is in is the same, with focus, and holds " + JSON.stringify(m.value) + "; copies " + JSON.stringify(f.heads));
  ms = await changeUnder(o, route, W("AROUND"), "feelings", ["tense"], CHECKIN, "booklet draft today"); added.push(W("AROUND"));
  m = await marked(o); f = await feltShown(o);
  say(m.same && m.value === "Shin" && same(f.heads, ["Tense"]), "the copies above and below taken away (after " + ms + " ms): the same field, with focus, holds " + JSON.stringify(m.value) + "; copies " + JSON.stringify(f.heads));
  await o.page.keyboard.press("Enter");
  d = await waitDisk(file, t => same(felt(t), [{ pick: "tense", a: [5, "Shin"] }, { pick: "lively", a: [1, "Throat"] }]));
  say(d.ok, "Enter adds the place to what the note now holds: " + draftBody(d.text));
  await blurNow(o);
  say(await viewShows(o, W("AROUND")), "once the reader left the field, the view is drawn again with the changed prose");

  // Finalize, Lively taken back: the entry keeps its pair, and lists only Tense's line
  const t0 = Date.now();
  await inCard(o, CK, "button.booklet-finalize").click();
  const fin = await waitDisk(file, t => !draftBlocks(t).length && ((json((blocksNamed(t, "booklet entries today")[0] || {}).body) || {}).items || []).length === 1);
  const body = (blocksNamed(fin.text, "booklet entries today")[0] || {}).body || "";
  const e = ((json(body) || {}).items || [])[0] || {};
  say(fin.ok && same(e.feelings, ["tense"]) && same(e.felt, [{ pick: "tense", a: [5, "Shin"] }, { pick: "lively", a: [1, "Throat"] }]) && Math.abs(Date.parse(e.ts) - t0) < 15000, "Finalize: the kept entry, verbatim: " + body);
  await sleep(500);
  const lines = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-entry dt")].map((dt, i) => dt.textContent + " = " + dt.nextElementSibling.textContent), cardSel(CK));
  say(lines.includes("Where do you feel it? · Tense = Chest, Shin") && !lines.some(l => /· Lively/.test(l)), "the kept entry: one line for Tense, none for Lively (taken back): " + JSON.stringify(lines));
  f = await feltShown(o);
  say(same(f.heads, ["Tense"]) && same(f.pressed["s:tense"], ["Chest", "Shin"]), "the view shows today's entry, to finish again: " + JSON.stringify(f.pressed));
  lintOk(c, file, tag, "after Finalize");

  // an answer of the wrong shape (a plain multi's list), made elsewhere: kept as written, the question read-only
  await gridItem(o, "draining", "Tired").click();
  await waitDisk(file, t => ((draftOf(t) || {}).feelings || []).includes("tired"));
  ms = await changeUnder(o, route, W("WRONG"), "felt", [5, 1], CHECKIN, "booklet draft today"); added.push(W("WRONG"));
  await blurNow(o); await sleep(800);
  f = await feltShown(o);
  say(/Kept as written/.test(f.notice || "") && /\[5,1\]/.test(f.notice) && f.disabled && f.controls > 0, "a wrong-shape answer: the notice says what the note holds, and none of the " + f.controls + " controls can be pressed: " + JSON.stringify(f.notice));
  await gridItem(o, "draining", "Flat").click();
  await inCopy(o, "s:tired", "Chest").click({ force: true, timeout: 3000 }).catch(() => {});
  d = await waitDisk(file, t => ((draftOf(t) || {}).feelings || []).includes("flat"));
  await sleep(1200);
  const now = fs.readFileSync(file, "utf8");
  say(d.ok && same(felt(now), [5, 1]) && draftBody(now).includes('"felt":[5,1]'), "a press in the grid, and one on a disabled place: the wrong-shape answer is left as written: " + draftBody(now));
  await inCard(o, CK, "button.booklet-finalize").click();
  const fin2 = await waitDisk(file, t => !draftBlocks(t).length && (((json((blocksNamed(t, "booklet entries today")[0] || {}).body) || {}).items || [])[0] || {}).felt + "" === "5,1");
  say(fin2.ok, "Finalize keeps it as written in today's entry: " + (blocksNamed(fin2.text, "booklet entries today")[0] || {}).body);
  if (typeInMd) await sleep(3500);
  const last = fs.readFileSync(file, "utf8");
  say(strip(last) === (regionAt(orig) >= 0 ? head(orig) : orig + "\n"), "outside the records region only the added words are new");
  lintOk(c, file, tag, "at the end");
  return { last, added };
}
const lintOk = (c, file, tag, when) => { const l = lint(file); c.ok(l.ok, tag + ": lint " + when + ": exit " + l.code + ": " + l.out); };

/* ================= CHECK 12 ================= */
async function check12() {
  const c = new Check(12, "the question asked for each feeling picked (each:) on the check-in note: answered, a feeling taken back and picked again, a copy's field kept while copies are added and taken away around it, Finalize, a wrong-shape answer left alone; in one pane and with a Markdown pane");
  await withApp("c12", async (o, vault) => {
    await openNote(o, CHECKIN);
    await eachFlow(c, o, vault, "one pane", "disk", null);
  });
  await withApp("c12-md", async (o, vault) => {
    await o.page.waitForSelector(".nav-file-title", { timeout: 10000 });
    const s = await splitWithMarkdown(o, c, CHECKIN);
    c.ok(same(s.types, ["booklet", "markdown"]) && s.leaves.every(l => l.file === CHECKIN), "with Markdown: two leaves on the same file: " + JSON.stringify(s.leaves.map(l => l.type)));
    await o.page.waitForSelector(BOOK + " .booklet-cell", { timeout: 8000 }); await sleep(800);
    const typeInMd = typeInMarkdown(o);
    const { last, added } = await eachFlow(c, o, vault, "with Markdown", "markdown", typeInMd);
    const buf = await mdBuffer(o);
    c.ok(buf === last, "with Markdown: the Markdown buffer equals the file on disk: " + (buf === last) + (buf === last ? "" : " (buffer " + buf.length + ", disk " + last.length + ")"));
    c.ok(added.every(w => count(last, w) === 1 && count(buf, w) === 1), "with Markdown: each added word once on disk and in the buffer: " + added.map(w => w + " x" + count(last, w)).join(", "));
  });
  return c;
}

/* ---------- the reader's earlier words offered again (earlier:): check 13, in one pane, with a Markdown pane, on a phone ---------- */
// The check-in note is given kept entries first, written on disk before it is opened: two earlier days, and today's
// entry (which the daily draft shows, and will replace). Every word in them is made up.
const LONG13 = "A made-up thought that runs on for a long while, about a garden fence and the paint for it and the brushes and the weather " +
  "that week, and then about the shed beside it and the rake and the hose and who might borrow them, so that it needs more than two lines anywhere";
function withEarlier(file) {
  const orig = fs.readFileSync(file, "utf8");
  const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const items = [
    { ts: day(2) + "T09:00:00Z", feelings: ["tense"], felt: [{ pick: "tense", a: [5, "Elbow"] }], places: [{ id: "chest", s: ["prickly", "hollow", "tight"] }], where: [2, "Garden shed"], thoughts: ["The dentist on Friday", "rent"] },
    { ts: day(1) + "T09:00:00Z", feelings: ["lively"], felt: [{ pick: "tense", a: ["Taken-back word"] }, { pick: "lively", a: [1, "Wrist"] }], places: [{ id: "stomach", s: ["buzzing"] }], thoughts: ["The car service", "Seeds to sow", LONG13] },
    { ts: new Date(Date.now() - 60000).toISOString().replace(/\.\d{3}Z$/, "Z"), places: [{ id: "jaw", s: ["today-tingle"] }], thoughts: ["Today's own line"] },
  ];
  const body = '{"items": [\n' + items.map(e => JSON.stringify(e)).join(",\n") + "\n]}";
  const text = orig.replace(/\s*$/, "\n\n") + "%%\n> [!records] App record — do not edit below this line\n\n> [!records|day-check] A short check-in\n\n```booklet entries today\n" + body + "\n```\n%%\n";
  fs.writeFileSync(file, text);
  return { text, body };
}
const thoughtsQ = o => inCard(o, CK, "[data-booklet-q='thoughts']");
// the words offered in a group named Earlier words (none when it is not shown), and the group's name
const earlierIn = (o, sel) => o.evaluate(sel => {
  const g = document.querySelector(sel + " .booklet-earlier");
  if (!g) return { drawn: false, words: [] };
  const label = g.querySelector(".booklet-earlier-label"), row = g.querySelector("[role=group]");
  return { drawn: true, shown: !g.classList.contains("booklet-earlier-none"), label: label && label.textContent, named: !!row && !!label && row.getAttribute("aria-labelledby") === label.id,
    words: g.classList.contains("booklet-earlier-none") ? [] : [...g.querySelectorAll("button")].map(b => b.textContent.trim()), unpressed: [...g.querySelectorAll("button")].every(b => b.getAttribute("aria-pressed") === "false") };
}, sel);
const PANEL = cardSel(CK) + " [data-booklet-q='places'] .booklet-panel", THOUGHTS = cardSel(CK) + " [data-booklet-q='thoughts']";
const earlierButton = (o, sel, words) => o.page.locator(sel + " .booklet-earlier button").filter({ hasText: words.length > 40 ? words.slice(0, 40) : new RegExp("^\\s*" + words + "\\s*$") }).first();
const ownOffered = (o, sel) => o.evaluate(sel => [...document.querySelectorAll(sel + " button.booklet-own[aria-pressed=false]")].map(b => b.textContent.trim()), sel);
// a long earlier word: shortened to two lines on screen, its full words its button's name
const clampOf = (o, sel, words) => o.evaluate(([sel, words]) => {
  const b = [...document.querySelectorAll(sel + " .booklet-earlier-word")].find(x => x.textContent.trim() === words);
  if (!b) return null;
  const s = b.querySelector(".booklet-words"), cs = getComputedStyle(s), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
  return { name: b.getAttribute("aria-label") === words, clamp: cs.webkitLineClamp || cs.getPropertyValue("-webkit-line-clamp"), shown: Math.round(s.clientHeight), full: Math.round(s.scrollHeight), lines: +(s.clientHeight / lh).toFixed(1), height: Math.round(b.getBoundingClientRect().height) };
}, [sel, words]);

async function earlierFlow(c, o, vault, tag, typeInMd, prepped) {
  const file = path.join(vault, CHECKIN);
  const say = (cond, msg) => c.ok(cond, tag + ": " + msg);
  const added = [];
  const md = async w => { if (typeInMd) { await typeInMd(w); added.push(w); await viewShows(o, w); await sleep(400); } };
  const strip = t => added.reduce((x, w) => x.split(" " + w).join(""), head(t));
  const entriesBody = t => (blocksNamed(t, "booklet entries today")[0] || {}).body;
  lintOk(c, file, tag, "with the earlier entries");
  const problems = await o.evaluate(() => [...document.querySelectorAll(".workspace-leaf-content[data-type='booklet'] .booklet-problems li")].map(x => x.textContent));
  say(!problems.some(p => /takes no|earlier/.test(p)), "no setting of the note reported (each: and earlier: are drawn): " + JSON.stringify(problems));

  // a body place: the earlier words under every place, after the widget's words; the answer's other places first
  await place(o, "Feet").click(); await sleep(300);
  let g = await earlierIn(o, PANEL);
  say(g.shown && g.label === "Earlier words" && g.named && g.unpressed && same(g.words, ["today-tingle", "buzzing", "prickly", "hollow"]), "under Feet, a group named Earlier words: today's answer's other place first (it is the answer being written), then the earlier days' words, newest first, no word id: " + JSON.stringify(g));
  const order = await o.evaluate(sel => [...document.querySelector(sel).children].map(x => x.className.split(" ").find(k => /^booklet-(sense-group|earlier|own-words|field-row)$/.test(k)) || "").filter(Boolean), PANEL);
  say(order.lastIndexOf("booklet-sense-group") < order.indexOf("booklet-earlier") && order.indexOf("booklet-earlier") < order.indexOf("booklet-own-words"), "after the widget's words, before the reader's words at the place and the field: " + order.join(", "));
  await place(o, "Jaw").click(); await sleep(300);
  g = await earlierIn(o, PANEL);
  say(same(g.words, ["buzzing", "prickly", "hollow"]), "under Jaw, where today-tingle is: " + JSON.stringify(g.words));
  // today's word taken out: it does not come back from today's kept entry, which the draft will replace
  await placesQ(o).locator(".booklet-panel .booklet-own-words button.booklet-own", { hasText: "today-tingle" }).click();
  let d = await waitDisk(file, t => draftBody(t) === JSON.stringify({ thoughts: ["Today's own line"] }));
  say(d.ok, "today-tingle pressed out: the draft holds today's entry's other answers: " + draftBody(d.text));
  await place(o, "Feet").click(); await sleep(300);
  g = await earlierIn(o, PANEL);
  say(same(g.words, ["buzzing", "prickly", "hollow"]), "under Feet, today's kept entry is not a source: " + JSON.stringify(g.words));
  await place(o, "Jaw").click(); await sleep(300);
  // a tap: the words at the end of the place's row, a new row at the end of the answer, as typing them there stores them
  await earlierButton(o, PANEL, "prickly").click();
  d = await waitDisk(file, t => same((draftOf(t) || {}).places, [{ id: "jaw", s: ["prickly"] }]));
  say(d.ok && draftBody(d.text) === JSON.stringify({ thoughts: ["Today's own line"], places: [{ id: "jaw", s: ["prickly"] }] }), "a tap on prickly under Jaw stores what typing it there stores: " + draftBody(d.text));
  g = await earlierIn(o, PANEL);
  say(same(g.words, ["buzzing", "hollow"]), "prickly is now at Jaw, and no longer offered there: " + JSON.stringify(g.words));
  // half a word typed, then a tap: leaving the field adds what is typed, then the tap adds its words; nothing is dropped
  await typeIn(o, placeField(o), "hol", false);
  await earlierButton(o, PANEL, "hollow").click();
  d = await waitDisk(file, t => same((draftOf(t) || {}).places, [{ id: "jaw", s: ["prickly", "hol", "hollow"] }]));
  say(d.ok, "\"hol\" typed, then a tap on hollow: both stored, the typed words first: " + JSON.stringify((draftOf(d.text) || {}).places));
  // Enter in the empty field takes no offered word
  const was = draftBody(d.text);
  await placeField(o).click(); await o.page.keyboard.press("Enter"); await sleep(1500);
  say(draftBody(fs.readFileSync(file, "utf8")) === was, "Enter in the empty field takes no offered word");
  await md("MD-BODY");

  // the thoughts: earlier lines under the fields, as the line sets earlier:12
  let t = await earlierIn(o, THOUGHTS);
  const under = await o.evaluate(sel => { const g = document.querySelector(sel + " .booklet-earlier"); return !!g && !!g.previousElementSibling && g.previousElementSibling.classList.contains("booklet-lines"); }, THOUGHTS);
  say(t.shown && t.label === "Earlier words" && t.named && under && same(t.words, ["The car service", "Seeds to sow", LONG13, "The dentist on Friday", "rent"]), "the thoughts: a group named Earlier words under the fields, newest first: " + JSON.stringify(t.words.map(w => w.slice(0, 24))));
  const cl = await clampOf(o, THOUGHTS, LONG13);
  say(!!cl && cl.name && String(cl.clamp) === "2" && cl.full > cl.shown + 4 && cl.lines <= 2.2, "the long line is shortened to two lines on screen, its full words its name: " + JSON.stringify(cl));
  // today's line taken out: not offered, from today's entry
  const lineField = n => thoughtsQ(o).locator("input.booklet-line").nth(n);
  await lineField(0).click(); await o.page.keyboard.press("Control+A"); await o.page.keyboard.press("Backspace");
  await blurNow(o);
  d = await waitDisk(file, t => !("thoughts" in (draftOf(t) || {})));
  t = await earlierIn(o, THOUGHTS);
  say(d.ok && same(t.words, ["The car service", "Seeds to sow", LONG13, "The dentist on Friday", "rent"]), "today's line emptied: the draft has no thoughts, and today's kept entry is not a source: " + draftBody(d.text));
  const fields = () => o.evaluate(sel => [...document.querySelectorAll(sel + " input.booklet-line")].map(i => i.value), THOUGHTS);
  let before = await fields();
  // a tap fills the empty line at the end and opens a new one, as typing in it does; the emptied line is left as it is
  await earlierButton(o, THOUGHTS, "rent").click();
  d = await waitDisk(file, t => same((draftOf(t) || {}).thoughts, ["", "rent", ""]));
  say(d.ok && same(await fields(), ["", "rent", ""]), "a tap on rent: the empty last line takes it, a new empty line follows, the line emptied before is untouched (fields were " + JSON.stringify(before) + "): " + draftBody(d.text));
  await typeIn(o, lineField(2), "Plan the week", false); await blurNow(o);
  d = await waitDisk(file, t => same((draftOf(t) || {}).thoughts, ["", "rent", "Plan the week", ""]));
  say(d.ok, "a line typed: " + JSON.stringify((draftOf(d.text) || {}).thoughts));
  await earlierButton(o, THOUGHTS, LONG13).click();
  d = await waitDisk(file, t => same((draftOf(t) || {}).thoughts, ["", "rent", "Plan the week", LONG13, ""]));
  say(d.ok && same(await fields(), ["", "rent", "Plan the week", LONG13, ""]), "a tap on the long line stores its full words, the typed line unchanged");
  const was2 = draftBody(d.text);
  await lineField(4).click(); await o.page.keyboard.press("Enter"); await sleep(1500); await blurNow(o); await sleep(800);
  say(draftBody(fs.readFileSync(file, "utf8")) === was2, "Enter in the empty line takes no offered word");
  t = await earlierIn(o, THOUGHTS);
  say(same(t.words, ["The car service", "Seeds to sow", "The dentist on Friday"]), "what is left offered: " + JSON.stringify(t.words));
  await md("MD-THOUGHTS");

  // own options: a shared list's, and a question asked for each feeling, only from the pairs whose pick is held
  const where = await ownOffered(o, cardSel(CK) + " [data-booklet-q='where']");
  say(same(where, ["Garden shed"]), "the list of places: its earlier own option offered: " + JSON.stringify(where));
  await gridItem(o, "draining", "Tired").click(); await sleep(600);
  const felt = await ownOffered(o, cardSel(CK) + " [data-booklet-q='felt'] .booklet-copy[data-booklet-pick='s:tired']");
  say(same(felt, ["Wrist", "Elbow"]), "under Tired: the own places from the pairs whose feeling the entry holds, not Taken-back word: " + JSON.stringify(felt));
  await copyOf(o, "s:tired").locator("button.booklet-own", { hasText: "Elbow" }).click();
  d = await waitDisk(file, t => same((draftOf(t) || {}).felt, [{ pick: "tired", a: ["Elbow"] }]));
  say(d.ok, "a tap on Elbow under Tired stores it as Add your own would: " + JSON.stringify((draftOf(d.text) || {}).felt));

  if (typeInMd) await sleep(3500);
  const last = fs.readFileSync(file, "utf8");
  say(entriesBody(last) === prepped.body, "the kept entries are byte for byte as written");
  say(strip(last) === head(prepped.text), "outside the records region only the words typed in the Markdown pane are new");
  lintOk(c, file, tag, "at the end");
  return { last, added };
}

/* ================= CHECK 13 ================= */
async function check13() {
  const c = new Check(13, "the reader's earlier words offered again (earlier:) on the check-in note with kept entries: under every body place and under the thoughts in a group named Earlier words, a tap storing what typing stores, today's entry not a source, own options only from pairs whose pick is held, a long line shortened; in one pane, with a Markdown pane, and at a phone's width (touch sizes, screenshots)");
  await withApp("c13", async (o, vault) => {
    const prepped = withEarlier(path.join(vault, CHECKIN));
    await openNote(o, CHECKIN);
    await earlierFlow(c, o, vault, "one pane", null, prepped);
  });
  await withApp("c13-md", async (o, vault) => {
    const prepped = withEarlier(path.join(vault, CHECKIN));
    await o.page.waitForSelector(".nav-file-title", { timeout: 10000 });
    const s = await splitWithMarkdown(o, c, CHECKIN);
    c.ok(same(s.types, ["booklet", "markdown"]) && s.leaves.every(l => l.file === CHECKIN), "with Markdown: two leaves on the same file: " + JSON.stringify(s.leaves.map(l => l.type)));
    await o.page.waitForSelector(BOOK + " .booklet-place", { timeout: 8000 }); await sleep(800);
    const typeInMd = typeInMarkdown(o);
    const { last, added } = await earlierFlow(c, o, vault, "with Markdown", typeInMd, prepped);
    const buf = await mdBuffer(o);
    c.ok(buf === last, "with Markdown: the Markdown buffer equals the file on disk: " + (buf === last) + (buf === last ? "" : " (buffer " + buf.length + ", disk " + last.length + ")"));
    c.ok(added.every(w => count(last, w) === 1 && count(buf, w) === 1), "with Markdown: each added word once on disk and in the buffer: " + added.map(w => w + " x" + count(last, w)).join(", "));
  });
  // at a phone's width, under Obsidian's own mobile emulation: the groups drawn, every control at least 44 px high, no
  // sideways scroll, and screenshots of the Earlier words under a body place and under the thoughts, light and dark
  await withApp("c13-phone", async (o, vault) => {
    withEarlier(path.join(vault, CHECKIN));
    const canEmulate = await o.evaluate(() => typeof app.emulateMobile === "function");
    if (!canEmulate) { c.ok(false, "phone: app.emulateMobile is not there"); return; }
    await o.evaluate(() => app.emulateMobile(true));
    await sleep(3000);
    await o.page.waitForFunction(() => window.app && app.workspace && app.workspace.layoutReady, null, { timeout: 15000 }).catch(() => {});
    const narrowed = await o.page.setViewportSize({ width: 390, height: 844 }).then(() => true, e => String(e).slice(0, 120));
    c.ok(narrowed === true, "phone: the window made 390 px wide: " + narrowed);
    await sleep(1200);
    await openNote(o, CHECKIN);
    await place(o, "Jaw").click(); await sleep(600);
    const w = await o.evaluate(sel => {
      const card = document.querySelector(sel);
      const els = [...card.querySelectorAll("button, input.booklet-text")].filter(e => e.offsetParent);
      const hs = els.map(e => ({ h: Math.round(e.getBoundingClientRect().height), what: e.className + " " + (e.textContent || e.placeholder || "").trim().slice(0, 20) }));
      const view = document.querySelector(".workspace-leaf-content[data-type='booklet'] .view-content");
      return { width: window.innerWidth, phone: document.body.classList.contains("is-phone"), n: els.length, min: Math.min(...hs.map(x => x.h)), small: hs.filter(x => x.h < 44), earlier: els.filter(e => e.closest(".booklet-earlier")).length, sideways: view.scrollWidth > view.clientWidth };
    }, cardSel(CK));
    c.ok(w.phone && w.min >= 44 && !w.sideways && w.earlier === 8, "phone (window " + w.width + " px, is-phone " + w.phone + "): " + w.n + " controls, " + w.earlier + " of them earlier words, the smallest " + w.min + " px high" + (w.small.length ? "; under 44: " + JSON.stringify(w.small) : "") + "; the view scrolls sideways: " + w.sideways);
    const g = await earlierIn(o, PANEL), t = await earlierIn(o, THOUGHTS);
    c.ok(same(g.words, ["buzzing", "prickly", "hollow"]) && same(t.words, ["The car service", "Seeds to sow", LONG13, "The dentist on Friday", "rent"]), "phone: under Jaw " + JSON.stringify(g.words) + "; under the thoughts " + t.words.length + " lines");
    const cl = await clampOf(o, THOUGHTS, LONG13);
    c.ok(!!cl && cl.name && cl.full > cl.shown + 4 && cl.lines <= 2.2 && cl.height >= 44, "phone: the long line shortened to two lines, its full words its name: " + JSON.stringify(cl));
    for (const scheme of ["light", "dark"]) {
      await o.setScheme(scheme); await sleep(700);
      for (const [part, sel] of [["body", PANEL + " .booklet-earlier"], ["thoughts", THOUGHTS]]) {
        await o.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: "center" }), sel); await sleep(400);
        c.info("phone, " + scheme + ", the Earlier words " + (part === "body" ? "under a body place" : "under the thoughts") + ": " + await o.screenshot(path.join(SHOTS, "earlier-" + part + "-phone-" + scheme + ".png")));
        const box = part === "body" ? PANEL : THOUGHTS, f = path.join(SHOTS, "earlier-" + part + "-phone-" + scheme + "-close.png");
        await o.page.locator(box).screenshot({ path: f });
        c.info("phone, " + scheme + ", close up: " + f);
      }
    }
  });
  return c;
}

/* ================= CHECK 14 ================= */
// Add your own adds the words typed and not added when it is left (format 0.16, SPEC section 5), as Enter or Add would.
// This run's copy of Every kind gives its choice `open`, so that a choice and a multi both take an option of the reader's
// own; a copy of it marked "0.15" is opened first, for the notice an older marker gets.
async function check14() {
  const c = new Check(14, "Add your own adds the words typed when it is left (format 0.16): a click elsewhere in the view, Tab, a press on another option (the words first, then the press), a press on the option the words name (pressed once, not taken back), Add (once), another note opened in the pane, the view switched to Markdown, the pane closed; on a choice the words replace the pick; white space adds nothing; a note marked 0.15 opens with its notice");
  await withApp("c14", async (o, vault) => {
    const file = path.join(vault, EVERY), K = "/kinds";
    const orig = fs.readFileSync(file, "utf8").replace("> [!choice|fruit] Which fruit", "> [!choice|fruit open] Which fruit");
    fs.writeFileSync(file, orig);
    const OLDER = "Older marker.booklet.md";
    fs.writeFileSync(path.join(vault, OLDER), orig.replace('booklet: "0.16"', 'booklet: "0.15"'));
    await o.page.waitForSelector(".nav-file-title", { timeout: 10000 });
    // a note marked with the format before this one: opened as it is, the notice first among its problems
    await openNote(o, OLDER, "/kinds");
    const older = await o.evaluate(() => ({ problems: [...document.querySelectorAll(".workspace-leaf-content[data-type='booklet'] .booklet-problems li")].map(l => l.textContent), questions: document.querySelectorAll(".workspace-leaf-content[data-type='booklet'] .booklet-question").length }));
    c.ok(older.problems[0] === "This file says booklet: 0.15. This view reads format 0.16 and has opened it as it is; some of it may not draw." && older.questions >= 7, "a note marked 0.15 opens with " + older.questions + " questions drawn, and first among its problems: " + JSON.stringify(older.problems[0]));
    await openNote(o, EVERY);
    const ownIn = kind => question(o, K, kind).locator(".booklet-own-row input");
    const option = (kind, words) => question(o, K, kind).locator(".booklet-choices > button.booklet-choice", { hasText: words }).first();
    const answers = t => answersOf(t) || {};
    const fieldOf = kind => o.evaluate(sel => { const f = document.querySelector(sel); return { value: f.value, focused: document.activeElement === f }; }, cardSel(K) + " .booklet-kind-" + kind + " .booklet-own-row input");
    const ownShown = kind => o.evaluate(sel => [...document.querySelectorAll(sel + " button.booklet-own[aria-pressed=true]")].map(b => b.textContent.trim()), cardSel(K) + " .booklet-kind-" + kind);
    // a click elsewhere in the view
    await ownIn("multi").click(); await o.page.keyboard.type("Twine");
    await inCard(o, K, ".booklet-card-title").click();
    let d = await waitDisk(file, t => same(answers(t).tools, ["Twine"]));
    let f = await fieldOf("multi");
    c.ok(d.ok && f.value === "" && same(await ownShown("multi"), ["Twine"]), "typed in the multi's field, then a click elsewhere in the view: tools on disk " + JSON.stringify(answers(d.text).tools) + "; the field emptied: " + JSON.stringify(f.value) + "; drawn as an option of the reader's own");
    // a choice: its words replace the pick, the field left by Tab
    await option("choice", "Apple").click();
    await waitDisk(file, t => answers(t).fruit === 1);
    await ownIn("choice").click(); await o.page.keyboard.type("Mango"); await o.page.keyboard.press("Tab");
    d = await waitDisk(file, t => answers(t).fruit === "Mango");
    const apple = await option("choice", "Apple").getAttribute("aria-pressed");
    c.ok(d.ok && apple === "false" && same(await ownShown("choice"), ["Mango"]), "Apple picked, then Mango typed in the choice's field and Tab pressed: fruit on disk " + JSON.stringify(answers(d.text).fruit) + " (the words replace the pick); Apple pressed: " + apple);
    // a press on another option leaves the field: the words, then the press
    await ownIn("multi").click(); await o.page.keyboard.type("Glue");
    await option("multi", "Ruler").click();
    d = await waitDisk(file, t => same(answers(t).tools, ["Twine", "Glue", 2]));
    c.ok(d.ok, "Glue typed, then Ruler pressed: tools on disk " + JSON.stringify(answers(d.text).tools) + " (the words added first, then the press, as booklet.html takes them)");
    // a press on the very option the words name: the words press it, and the press confirms it
    await ownIn("choice").click(); await o.page.keyboard.type("plum");
    await option("choice", "Plum").click();
    d = await waitDisk(file, t => answers(t).fruit === 3);
    await sleep(500);
    const plum = await option("choice", "Plum").getAttribute("aria-pressed");
    d = await waitDisk(file, t => answers(t).fruit === 3);
    c.ok(d.ok && plum === "true", "plum typed, then Plum pressed: fruit on disk " + JSON.stringify(answers(d.text).fruit) + ", Plum pressed: " + plum + " (pressed once, not pressed and taken back)");
    // Add, after the field is left by its own press: added once, and the reader is back in the field
    await ownIn("multi").click(); await o.page.keyboard.type("Wire");
    await question(o, K, "multi").locator(".booklet-add").click();
    d = await waitDisk(file, t => same(answers(t).tools, ["Twine", "Glue", 2, "Wire"]));
    await sleep(400);
    f = await fieldOf("multi");
    c.ok(d.ok && count(fs.readFileSync(file, "utf8"), "Wire") === 1 && f.focused && f.value === "", "Wire typed, then Add: tools on disk " + JSON.stringify(answers(d.text).tools) + ", Wire once; the reader is back in the empty field: " + JSON.stringify(f));
    // white space, left by a click elsewhere: nothing written
    await o.page.keyboard.type("   ");
    const before = fs.readFileSync(file, "utf8");
    await inCard(o, K, ".booklet-card-title").click();
    await sleep(1200);
    c.ok(fs.readFileSync(file, "utf8") === before, "white space typed, then a click elsewhere: the note on disk is unchanged");
    // another note opened in the pane, with the reader still in the field
    await ownIn("multi").click(); await o.page.keyboard.type("Tape");
    await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, EVENING);
    d = await waitDisk(file, t => same(answers(t).tools, ["Twine", "Glue", 2, "Wire", "Tape"]));
    c.ok(d.ok, "Tape typed, then another note opened in the pane: tools on disk " + JSON.stringify(answers(d.text).tools));
    await openNote(o, EVERY);
    f = await fieldOf("multi");
    c.ok(same(await ownShown("multi"), ["Twine", "Glue", "Wire", "Tape"]) && f.value === "", "the note opened again: the reader's own options drawn " + JSON.stringify(await ownShown("multi")) + ", the field empty");
    // the view switched to Markdown, with the reader in the field
    await ownIn("multi").click(); await o.page.keyboard.type("Clip");
    await o.evaluate(() => app.commands.executeCommandById("booklet:toggle-view"));
    d = await waitDisk(file, t => same(answers(t).tools, ["Twine", "Glue", 2, "Wire", "Tape", "Clip"]));
    const mode = await activeType(o);
    c.ok(d.ok && mode === "markdown", "Clip typed, then the view switched to Markdown (" + mode + "): tools on disk " + JSON.stringify(answers(d.text).tools));
    await o.evaluate(() => app.commands.executeCommandById("booklet:toggle-view"));
    await waitActiveType(o, "booklet"); await o.page.waitForSelector(cardSel(K), { timeout: 8000 }); await sleep(900);
    // the pane closed, with the reader in the choice's field
    await ownIn("choice").click(); await o.page.keyboard.type("Fig");
    await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
    d = await waitDisk(file, t => answers(t).fruit === "Fig");
    c.ok(d.ok, "Fig typed in the choice's field, then the pane closed: fruit on disk " + JSON.stringify(answers(d.text).fruit));
    const last = fs.readFileSync(file, "utf8");
    c.ok(head(last) === orig + "\n", "outside the records region nothing changed but the blank line before the new region: " + (head(last) === orig + "\n"));
    c.ok(count(last, "```booklet answers") === 1 && ["Twine", "Glue", "Wire", "Tape", "Clip", "Fig"].every(w => count(last, '"' + w + '"') === 1), "one answers block, each word once: " + (blocksNamed(last, "booklet answers")[0] || {}).body);
    const l = lint(file); c.ok(l.ok, "lint at the end: exit " + l.code + ": " + l.out);
  });
  return c;
}

/* ================= CHECK 9 ================= */
async function check9() {
  const c = new Check(9, "layout: the dark theme's text-box border, room at the view's foot, the grid's cell names on their colours, touch sizes (the tracker; the check-in note, also at a phone's width); the tracker's and check-in note's screenshots");
  await withApp("c9", async (o, vault) => {
    // the tracker, answered and finished once, so the screenshots show a kept day and today's entry
    await openNote(o, DAILY);
    const K = "/evening-log";
    await question(o, K, "choice").locator("button.booklet-choice", { hasText: "Clear" }).click();
    await question(o, K, "scale").locator("button.booklet-choice").nth(1).click();
    await question(o, K, "number").locator("input").fill("42");
    await question(o, K, "date").locator("input[type=date]").fill("2026-11-01");
    await question(o, K, "text").locator("input").fill("A walk round the made-up lake.");
    await o.evaluate(() => document.activeElement && document.activeElement.blur());
    await sleep(1500);
    await inCard(o, K, "button.booklet-finalize").click();
    await sleep(1500);
    for (const scheme of ["light", "dark"]) {
      await o.setScheme(scheme); await sleep(700);
      await o.evaluate(() => document.querySelector(".workspace-leaf-content[data-type='booklet'] .view-content").scrollTo(0, 0)); await sleep(200);
      c.info("tracker, " + scheme + ", top: " + await o.screenshot(path.join(SHOTS, "tracker-" + scheme + ".png")));
      await o.evaluate(() => { const v = document.querySelector(".workspace-leaf-content[data-type='booklet'] .view-content"); v.scrollTo(0, v.scrollHeight); }); await sleep(300);
      c.info("tracker, " + scheme + ", scrolled to the kept days: " + await o.screenshot(path.join(SHOTS, "tracker-" + scheme + "-entries.png")));
    }
    // dark theme: a text box's border can be seen against its card
    await o.setScheme("dark"); await sleep(500);
    const b = await o.evaluate(() => {
      const v = document.querySelector(".workspace-leaf-content[data-type='booklet']");
      const inp = v.querySelector("input.booklet-text"), card = v.querySelector(".booklet-card");
      const probe = document.body.createDiv(); probe.style.color = "var(--background-modifier-border)"; const themeBorder = getComputedStyle(probe).color; probe.remove();
      return { border: getComputedStyle(inp).borderTopColor, width: getComputedStyle(inp).borderTopWidth, card: getComputedStyle(card).backgroundColor, themeBorder };
    });
    const ours = contrast(b.border, b.card), theirs = contrast(b.themeBorder, b.card);
    c.ok(ours >= 1.5 && parseFloat(b.width) >= 1, "dark: a text box's border " + b.border + " (" + b.width + ") on the card " + b.card + ": contrast " + ours.toFixed(2) + " (the theme's plain border colour " + b.themeBorder + " would give " + theirs.toFixed(2) + ")");
    // room at the foot: with the longest note scrolled to the end, the last card ends above the status bar
    await openNote(o, EVERY);
    for (const scheme of ["light", "dark"]) {
      await o.setScheme(scheme); await sleep(500);
      const r = await o.evaluate(() => {
        const v = document.querySelector(".workspace-leaf-content[data-type='booklet'] .view-content"); v.scrollTo(0, v.scrollHeight);
        const parts = v.querySelectorAll(".booklet-card, .booklet-pager"), last = parts[parts.length - 1].getBoundingClientRect(), bar = document.querySelector(".status-bar").getBoundingClientRect(), view = v.getBoundingClientRect();
        return { lastBottom: Math.round(last.bottom), barTop: Math.round(bar.top), viewBottom: Math.round(view.bottom), scrolls: v.scrollHeight > v.clientHeight };
      });
      c.ok(r.scrolls && r.lastBottom <= r.barTop - 8, scheme + ": scrolled to the end, the last part (the pager) ends at " + r.lastBottom + " px, above the status bar at " + r.barTop + " px (view ends at " + r.viewBottom + ")");
      c.info(scheme + " foot: " + await o.screenshot(path.join(SHOTS, "foot-" + scheme + ".png")));
    }
    // the check-in note, answered in part: the cells' names can be read on their washes, and screenshots in both schemes
    await openNote(o, CHECKIN);
    await answerForShots(o);
    for (const scheme of ["light", "dark"]) {
      await o.setScheme(scheme); await sleep(700);
      const r = await o.evaluate(sel => {
        // the first background under the cell that is not see-through
        const solid = el => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor, m = b.match(/[\d.]+/g); if (m && (m.length < 4 || +m[3] === 1)) return b; } return "rgb(255, 255, 255)"; };
        return [...document.querySelectorAll(sel + " .booklet-cell")].map(x => ({ cell: x.getAttribute("data-booklet-cell"), text: getComputedStyle(x.querySelector(".booklet-cell-name")).color, wash: getComputedStyle(x).backgroundColor, card: solid(x.parentElement) }));
      }, cardSel(CK));
      const ratios = r.map(x => [x.cell, contrast(x.text, over(x.wash, x.card))]);
      c.ok(ratios.length === 4 && ratios.every(([, k]) => k >= 4.5), scheme + ": each cell's name against its wash (over the card): " + ratios.map(([id, k]) => id + " " + k.toFixed(2)).join(", "));
      for (const [part, sel] of [["", ".booklet-page"], ["-grid", ".booklet-kind-widget:has(.booklet-grid)"], ["-follow-up", "[data-booklet-q='felt']"], ["-list", "[data-booklet-q='where']"]]) {
        await o.evaluate(sel => document.querySelector(".workspace-leaf-content[data-type='booklet'] " + sel).scrollIntoView({ block: "start" }), sel); await sleep(300);
        c.info("check-in, " + scheme + (part ? ", " + part.slice(1) : ", top") + ": " + await o.screenshot(path.join(SHOTS, "checkin-" + scheme + part + ".png")));
      }
    }
    // a phone: Obsidian's own mobile emulation; every control is at least 44 px high
    const canEmulate = await o.evaluate(() => typeof app.emulateMobile === "function");
    if (!canEmulate) { c.info("app.emulateMobile is not there: touch sizes not checked"); return; }
    await o.evaluate(() => app.emulateMobile(true));
    await sleep(3000);
    await o.page.waitForFunction(() => window.app && app.workspace && app.workspace.layoutReady, null, { timeout: 15000 }).catch(() => {});
    await openNote(o, DAILY).catch(() => {});
    await sleep(800);
    const m = await o.evaluate(() => {
      const v = document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-view");
      if (!v) return null;
      const els = [...v.querySelectorAll("button, input.booklet-text")].filter(e => e.offsetParent);
      const hs = els.map(e => Math.round(e.getBoundingClientRect().height));
      return { mobile: document.body.classList.contains("is-mobile"), phone: document.body.classList.contains("is-phone"), n: els.length, min: Math.min(...hs) };
    });
    if (!m) c.info("mobile emulation: no booklet view after switching (not checked)");
    else {
      c.ok(m.mobile && m.min >= 44, "mobile emulation (is-mobile " + m.mobile + ", is-phone " + m.phone + "): " + m.n + " controls, the smallest " + m.min + " px high");
      c.info("phone-sized screenshot: " + await o.screenshot(path.join(SHOTS, "tracker-mobile.png")));
      // the check-in note: every place, sense word, cell item, own word, field, Add and Clear, with a place open; in the
      // emulation's window (1024 px wide), then in a window as narrow as a phone's (390 px), if the page can be made so
      await openNote(o, CHECKIN).catch(() => {});
      await place(o, "Shoulders").click().catch(() => {});
      await sleep(500);
      const touch = async (what, shot) => {
        const w = await o.evaluate(sel => {
          const card = document.querySelector(sel);
          if (!card) return null;
          const els = [...card.querySelectorAll("button, input.booklet-text")].filter(e => e.offsetParent);
          const hs = els.map(e => ({ h: Math.round(e.getBoundingClientRect().height), what: e.className + " " + (e.textContent || e.placeholder || "").trim().slice(0, 20) }));
          const view = document.querySelector(".workspace-leaf-content[data-type='booklet'] .view-content");
          const copies = [...card.querySelectorAll("[data-booklet-q='felt'] .booklet-copy")].map(x => x.getAttribute("data-booklet-pick")), inCopies = els.filter(e => e.closest(".booklet-copy")).length;
          return { width: window.innerWidth, phone: document.body.classList.contains("is-phone"), n: els.length, min: Math.min(...hs.map(x => x.h)), small: hs.filter(x => x.h < 44), kinds: [...new Set(els.map(e => e.className.split(" ").filter(k => k !== "booklet-choice").join(".")))], sideways: view.scrollWidth > view.clientWidth, copies, inCopies };
        }, cardSel(CK));
        if (!w) { c.info(what + ": the check-in note was not drawn (not checked)"); return; }
        c.ok(w.min >= 44 && !w.sideways && w.copies.length === 2 && w.inCopies >= 24, what + " (window " + w.width + " px wide, is-phone " + w.phone + "), the check-in note with a place open and two feelings asked where they are felt (" + w.copies.join(", ") + ", " + w.inCopies + " controls in their copies): " + w.n + " controls (" + w.kinds.join(", ") + "), the smallest " + w.min + " px high" + (w.small.length ? "; under 44: " + JSON.stringify(w.small) : "") + "; the view scrolls sideways: " + w.sideways);
        for (const [part, sel] of [["", ".booklet-page"], ["-places", ".booklet-panel"], ["-grid", ".booklet-kind-widget:has(.booklet-grid)"], ["-follow-up", "[data-booklet-q='felt']"]]) {
          await o.evaluate(sel => document.querySelector(".workspace-leaf-content[data-type='booklet'] " + sel).scrollIntoView({ block: "start" }), sel).catch(() => {}); await sleep(300);
          c.info("check-in, " + what + (part ? ", " + part.slice(1) : ", top") + ": " + await o.screenshot(path.join(SHOTS, shot + part + ".png")));
        }
      };
      await touch("mobile emulation", "checkin-mobile");
      const narrowed = await o.page.setViewportSize({ width: 390, height: 844 }).then(() => true, e => String(e).slice(0, 120));
      await sleep(1200);
      if (narrowed === true) await touch("mobile emulation at a phone's width", "checkin-phone");
      else c.info("the window could not be made 390 px wide (" + narrowed + "): not checked at a phone's width");
    }
  });
  return c;
}

/* ================= CHECK 10 ================= */
/* ================= CHECK 15 ================= */
// The check-in note's weekly roll-up (SPEC section 6, "A span of days, and summaries"), drawn from made-up kept entries:
// how often each feeling came up and where each is felt, over the past seven days, as a table; then the week's thoughts
// as cards. An entry older than the span and the draft in progress are not counted; drawing writes nothing; an entry
// kept in the view shows in the roll-up at once. Then screenshots at a desktop's width and a phone's, light and dark.
const WK = "day-check/week";
function withWeek(file) {
  const orig = fs.readFileSync(file, "utf8");
  // noon on the reader's own calendar, n days ago
  const at = n => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d.toISOString().replace(/\.\d{3}Z$/, "Z"); };
  const items = [
    { ts: at(10), feelings: ["lively"], thoughts: ["Too old for this week"] },
    { ts: at(6), feelings: ["tense", "tired"], felt: [{ pick: "tense", a: [5] }, { pick: "tired", a: [1] }], thoughts: ["Sorting the made-up shed"] },
    { ts: at(5), feelings: ["tense"], felt: [{ pick: "tense", a: [5, 8] }], thoughts: ["A long call", "Water the plants"] },
    { ts: at(4), feelings: ["settled", "x|soothing|Unhurried"], felt: [{ pick: "settled", a: [5] }] },
    { ts: at(2), feelings: ["tense", "content"], felt: [{ pick: "tense", a: [8] }], thoughts: ["Finish the bookshelf"] },
    { ts: at(1), feelings: ["tired"], thoughts: ["Early night"] },
  ];
  const body = '{"items": [\n' + items.map(e => JSON.stringify(e)).join(",\n") + "\n]}";
  const text = orig.replace(/\s*$/, "\n\n") + "%%\n> [!records] App record — do not edit below this line\n\n> [!records|day-check] A short check-in\n\n```booklet entries today\n" + body + "\n```\n\n```booklet draft today\n{\"feelings\": [\"cheerful\"]}\n```\n%%\n";
  fs.writeFileSync(file, text);
  return text;
}
// the roll-up as drawn: the summary's views, its table's headings and rows, and the thoughts' cards
const rollup = o => o.evaluate(sel => {
  const qs = [...document.querySelectorAll(sel + " .booklet-query")], t = qs[0], c = qs[1];
  return {
    views: qs.map(q => q.getAttribute("data-booklet-view")),
    heads: t ? [...t.querySelectorAll("thead th")].map(x => x.textContent) : [],
    rows: t ? [...t.querySelectorAll("tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.textContent)) : [],
    cards: c ? [...c.querySelectorAll(".booklet-entry")].map(e => [...e.querySelectorAll("dd li")].map(li => li.textContent)) : [],
    dated: c ? c.querySelectorAll(".booklet-entry .booklet-entry-when").length : 0,
    problems: !!document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-problems"),
  };
}, cardSel(WK));
const ROWS15 = [
  ["How do you feel?", "5", "Tense", "Tense 3 · Tired 2 · Settled 1 · Content 1 · Unhurried 1"],
  ["Where do you feel it? · Tense", "3", "Chest", "Chest 2 · Stomach 2"],
  ["Where do you feel it? · Tired", "1", "Head", "Head 1"],
  ["Where do you feel it? · Settled", "1", "Chest", "Chest 1"],
  ["Where do you feel it? · Content", "0", "", ""],
  ["Where do you feel it? · Unhurried", "0", "", ""],
];
const CARDS15 = [["Early night"], ["Finish the bookshelf"], ["A long call", "Water the plants"], ["Sorting the made-up shed"]];
async function rollupShots(c, o, where) {
  for (const scheme of ["light", "dark"]) {
    await o.setScheme(scheme); await sleep(700);
    await o.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: "start" }), cardSel(WK)); await sleep(400);
    c.info(where + ", " + scheme + ": " + await o.screenshot(path.join(SHOTS, "rollup-" + where + "-" + scheme + ".png")));
    const f = path.join(SHOTS, "rollup-" + where + "-" + scheme + "-card.png");
    await o.page.locator(cardSel(WK)).screenshot({ path: f });
    c.info(where + ", " + scheme + ", the roll-up's card: " + f);
  }
}
async function check15() {
  const c = new Check(15, "the check-in note's weekly roll-up (format 0.16: limit: 7 days and summary: on) drawn from made-up entries: the feelings and where each is felt as a table, the week's thoughts as cards; an older entry and the draft not counted; nothing written; an entry kept shows at once; screenshots at a desktop's and a phone's width, light and dark");
  await withApp("c15", async (o, vault) => {
    const file = path.join(vault, CHECKIN);
    const text = withWeek(file);
    await openNote(o, CHECKIN, WK);
    await o.page.waitForSelector(cardSel(WK) + " .booklet-query", { timeout: 8000 }); await sleep(800);
    const r = await rollup(o);
    c.ok(same(r.views, ["table", "cards"]) && !r.problems, "two queries, drawn as a table (a summary with no as:) and as cards, and nothing in the note's problems: " + JSON.stringify(r.views) + ", problems " + r.problems);
    c.ok(same(r.heads, ["Question", "Count", "Most", "Note"]), "the table's columns: " + JSON.stringify(r.heads));
    c.ok(same(r.rows, ROWS15), "the feelings over the past seven days (the one ten days ago and the draft's Cheerful not counted), then one row for each feeling's places: " + JSON.stringify(r.rows));
    c.ok(same(r.cards, CARDS15) && r.dated === 4, "the week's thoughts, newest first, one dated card for each entry that has any: " + JSON.stringify(r.cards));
    await sleep(2500);
    c.ok(read(vault, CHECKIN) === text, "drawing wrote nothing: the file is the same, byte for byte");
    await rollupShots(c, o, "desktop");
    // today's check-in kept in the view: the draft's Cheerful and a press on Rushed, then Finalize
    await o.setScheme("light"); await sleep(300);
    await goTo(o, CK);
    await gridItem(o, "agitating", "Rushed").click(); await sleep(1200);
    await inCard(o, CK, "button.booklet-finalize").click();
    const kept = await waitDisk(file, t => /"feelings":\s*\["cheerful",\s*"rushed"\]/.test(t.slice(t.indexOf("booklet entries today"))) && !/booklet draft today/.test(t));
    await sleep(800);
    await goTo(o, WK);
    const r2 = await rollup(o);
    c.ok(kept.ok && same(r2.rows[0], ["How do you feel?", "6", "Tense", "Rushed 1 · Tense 3 · Cheerful 1 · Tired 2 · Settled 1 · Content 1 · Unhurried 1"]), "the entry kept today shows in the roll-up at once: " + JSON.stringify(r2.rows[0]) + " (kept on disk: " + kept.ok + ")");
    c.ok(same(r2.cards, CARDS15), "today's entry has no thoughts, so the cards are as they were: " + r2.cards.length);
  });
  await withApp("c15-phone", async (o, vault) => {
    withWeek(path.join(vault, CHECKIN));
    const canEmulate = await o.evaluate(() => typeof app.emulateMobile === "function");
    if (!canEmulate) { c.ok(false, "phone: app.emulateMobile is not there"); return; }
    await o.evaluate(() => app.emulateMobile(true));
    await sleep(3000);
    await o.page.waitForFunction(() => window.app && app.workspace && app.workspace.layoutReady, null, { timeout: 15000 }).catch(() => {});
    const narrowed = await o.page.setViewportSize({ width: 390, height: 844 }).then(() => true, e => String(e).slice(0, 120));
    c.ok(narrowed === true, "phone: the window made 390 px wide: " + narrowed);
    await sleep(1200);
    await openNote(o, CHECKIN, WK);
    await o.page.waitForSelector(cardSel(WK) + " .booklet-query", { timeout: 8000 }); await sleep(800);
    const r = await rollup(o);
    c.ok(same(r.rows, ROWS15) && same(r.cards, CARDS15), "phone: the same roll-up: " + r.rows.length + " rows, " + r.cards.length + " cards");
    const w = await o.evaluate(sel => {
      const view = document.querySelector(".workspace-leaf-content[data-type='booklet'] .view-content"), wrap = document.querySelector(sel + " .booklet-q-wrap");
      return { width: window.innerWidth, phone: document.body.classList.contains("is-phone"), sideways: view.scrollWidth > view.clientWidth, table: wrap ? [wrap.scrollWidth, wrap.clientWidth] : null };
    }, cardSel(WK));
    c.ok(w.phone && !w.sideways, "phone (window " + w.width + " px, is-phone " + w.phone + "): the view scrolls sideways: " + w.sideways + "; the table " + JSON.stringify(w.table) + " (scroll width, width: a wider table scrolls inside its card)");
    await rollupShots(c, o, "phone");
  });
  return c;
}

async function check10() {
  const c = new Check(10, "no error or warning from the plugin in Obsidian's console, over every check that ran");
  const fromPlugin = consoleReport.filter(r => /^console\.|^pageerror/.test(r.kind) && /booklet/i.test(r.text + " " + r.url));
  const otherPage = consoleReport.filter(r => /^console\.|^pageerror/.test(r.kind) && !fromPlugin.includes(r));
  c.ok(fromPlugin.length === 0, "console errors and warnings that name the plugin (its code is loaded as plugin:booklet): " + fromPlugin.length + (fromPlugin.length ? " " + JSON.stringify(fromPlugin) : ""));
  c.ok(consoleReport.filter(r => r.kind === "pageerror").length === 0, "uncaught page errors: " + consoleReport.filter(r => r.kind === "pageerror").length);
  c.info("other console errors and warnings (Obsidian's own): " + otherPage.length + (otherPage.length ? " " + JSON.stringify(otherPage.map(r => r.where + ": " + r.text.slice(0, 160))) : ""));
  c.ok(!only.includes(11) || ["c11", "c11-md"].every(x => sessions.includes(x)), "the sessions watched include the widget check's two (one pane, with a Markdown pane): " + sessions.join(", "));
  c.ok(!only.includes(12) || ["c12", "c12-md"].every(x => sessions.includes(x)), "and the each: check's two: " + sessions.join(", "));
  c.ok(!only.includes(13) || ["c13", "c13-md", "c13-phone"].every(x => sessions.includes(x)), "and the earlier words check's three (one pane, with a Markdown pane, at a phone's width): " + sessions.join(", "));
  c.ok(!only.includes(14) || sessions.includes("c14"), "and the Add your own check's: " + sessions.join(", "));
  c.ok(!only.includes(15) || ["c15", "c15-phone"].every(x => sessions.includes(x)), "and the roll-up check's two (a desktop's width, a phone's): " + sessions.join(", "));
  c.ok(!only.includes(16) || sessions.includes("c16"), "and the screens-and-moves check's: " + sessions.join(", "));
  c.ok(!only.includes(22) || sessions.includes("c22"), "and the fold check's: " + sessions.join(", "));
  c.ok(!only.includes(29) || ["c29-desktop", "c29-phone"].every(x => sessions.includes(x)), "and the charts check's two (a desktop's width, a phone's): " + sessions.join(", "));
  c.ok(!only.includes(30) || ["c30-desktop", "c30-phone"].every(x => sessions.includes(x)), "and the data check's two: " + sessions.join(", "));
  c.ok(!only.includes(31) || ["c31-desktop", "c31-phone"].every(x => sessions.includes(x)), "and the sort and filter check's two: " + sessions.join(", "));
  c.ok(!only.includes(32) || ["c32-one-pane", "c32-markdown-pane", "c32-phone"].every(x => sessions.includes(x)), "and the deleting check's three (one pane, with a Markdown pane, a phone's width): " + sessions.join(", "));
  c.info("stdout/stderr lines with error in them: " + consoleReport.filter(r => /^stdout/.test(r.kind)).length + " (listed under INFO below)");
  return c;
}

(async () => {
  const t00 = Date.now();
  console.log("INFO  vault copies and config under " + WORK + "; screenshots in " + SHOTS);
  const nav = require("./nav-checks")({ withApp, Check, launch, opt, SHOTS, sleep, BOOK, read, SRC_VAULT, waitActiveType });
  const study = require("./study-checks")({ withApp, Check, SHOTS, sleep, BOOK, waitActiveType });
  const reading = require("./reading-checks")({ withApp, Check, SHOTS, sleep, BOOK, waitActiveType });
  const leftovers = require("./leftovers-checks")({ withApp, Check, SHOTS, sleep, BOOK, waitActiveType });
  const dashboards = require("./dashboard-checks")({ withApp, Check, SHOTS, sleep, BOOK, waitActiveType });
  const fns = { ...nav, ...study, ...reading, ...leftovers, ...dashboards, 1: check1, 2: check2, 3: check3, 4: check4, 5: check5, 6: check6, 7: check7, 8: check8, 9: check9, 10: check10, 11: check11, 12: check12, 13: check13, 14: check14, 15: check15 };
  for (const n of only) {
    const t0 = Date.now();
    let c;
    try { c = await fns[n](); }
    catch (e) { c = currentCheck && currentCheck.n === n ? currentCheck : new Check(n, "(crashed)"); c.ok(false, "script error (the check stopped here): " + (e && e.stack || e)); }
    const ms = Date.now() - t0; timings.push({ name: "check " + n + " (whole, including launch)", ms });
    c.print(ms);
  }
  console.log("INFO  timings: " + timings.map(t => t.name + " " + t.ms + " ms").join("; "));
  console.log("INFO  console/stdout lines of kind error/warning: " + consoleReport.length);
  for (const r of consoleReport) console.log("        [" + r.where + "] " + r.kind + ": " + r.text + (r.url ? " (at " + r.url + ")" : ""));
  console.log("INFO  total " + (Date.now() - t00) + " ms; " + (fails ? fails + " check(s) FAILED" : "all checks passed"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL  " + (e && e.stack || e)); process.exit(1); });
