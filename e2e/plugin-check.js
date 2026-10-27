// Plugin check: drives the "Booklet" plugin in a real Obsidian and checks what it does.
//   PLAYWRIGHT=<node_modules path> node plugin-check.js --obsidian <obsidian binary> --vault <test-vault> --out <dir> [--only 1,3] [--lint <lint-booklet.py>]
// It NEVER touches --vault: every check works on its own fresh copy of the vault and its own scratch config folder, both
// under <out>/work-<time>/. Prints one PASS/FAIL line per check (with the evidence under it) and exits 1 on any FAIL.
// Checks: 1 opens and toggles; 2 draws natively (screenshots); 3 answers reach the records on disk; 4 an open Markdown
// editor survives interleaved typing; 5 the text field keeps focus across a write, plus console errors and timings.
const fs = require("fs"), path = require("path"), cp = require("child_process");
const { launch } = require("./drive");

const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
opt.obsidian = opt.obsidian || process.env.OBSIDIAN; opt.vault = opt.vault || process.env.VAULT;
if (!opt.obsidian || !opt.vault || !opt.out) { console.error("need --obsidian, --vault (the repository's test-vault) and --out"); process.exit(2); }
const LINT = opt.lint || process.env.BOOKLET_LINTER || "/workspace/booklet/lint-booklet.py";
const only = opt.only ? opt.only.split(",").map(Number) : [1, 2, 3, 4, 5];
const SRC_VAULT = path.resolve(opt.vault);
const WORK = path.join(path.resolve(opt.out), "work-" + new Date().toISOString().replace(/[:.]/g, "-"));
const SHOTS = path.join(path.resolve(opt.out), "shots");
fs.mkdirSync(WORK, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });

const EVENING = "Evening check-in.booklet.md", KEPT = "Kept records.booklet.md", ORDINARY = "Ordinary note.md";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, runNo = 0;
const consoleReport = [];   // {where, kind, text}
const timings = [];         // {name, ms}

/* ---------- reporting ---------- */
class Check {
  constructor(n, title) { this.n = n; this.title = title; this.items = []; this.bad = 0; }
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
  const launchMs = Date.now() - t0; timings.push({ name: name + " launch", ms: launchMs });
  o.page.on("console", m => { if (m.type() === "error" || m.type() === "warning") consoleReport.push({ where: name, kind: "console." + m.type(), text: m.text().slice(0, 400) }); });
  o.page.on("pageerror", e => consoleReport.push({ where: name, kind: "pageerror", text: String(e && e.message || e).slice(0, 400) }));
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
function lint(file) {
  const r = cp.spawnSync("python3", ["-I", LINT, file], { encoding: "utf8" });
  return { code: r.status, out: ((r.stdout || "") + (r.stderr || "")).trim().split("\n").slice(-3).join(" | ") };
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
// open the Evening note in a second pane as Markdown, with the first pane the booklet. Returns details.
async function splitWithMarkdown(o, c) {
  await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, EVENING);
  await waitActiveType(o, "booklet");
  await o.evaluate(async rel => { const l = app.workspace.getLeaf("split", "vertical"); await l.openFile(app.vault.getAbstractFileByPath(rel)); }, EVENING);
  await waitFile(o, EVENING);
  await sleep(500);
  const mid = await rootLeaves(o);
  await o.page.locator(BOOK + " .view-action[aria-label='Show Markdown']").last().click({ timeout: 5000 });
  await sleep(800);
  const leaves = await rootLeaves(o);
  const types = leaves.map(l => l.type).sort();
  c.info("after split + open: leaf types " + JSON.stringify(mid.map(l => l.type)) + "; after toggling the new leaf: " + JSON.stringify(leaves.map(l => l.type + (l.file ? " " + l.file : ""))));
  const mode = await o.evaluate(() => { let m = null; app.workspace.iterateRootLeaves(l => { if (l.view.getViewType() === "markdown") m = l.view.getMode(); }); return m; });
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
    const kept = await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, KEPT);
    await sleep(1200);
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
    const l = lint(file); c.ok(l.code === 0 && /0 errors/.test(l.out), "lint-booklet.py exit " + l.code + ": " + l.out);
    c.info("region on disk: " + JSON.stringify(now.slice(at)));
    // click Good again -> clears
    await clickChoice(o, "Good"); await sleep(3000);
    now = fs.readFileSync(file, "utf8");
    const a2 = answersOf(now);
    c.ok(a2 && !("feel" in a2) && a2.energy === 3 && a2.note === "made up line", "after clicking Good again: " + JSON.stringify(a2));
    c.ok(now.slice(0, regionAt(now)) === head, "text before the region unchanged between the first write and the clear: true");
    c.info("original is an exact prefix of the file on disk: " + now.startsWith(orig) + "; original file ends with " + JSON.stringify(orig.slice(-12)) + " (no final newline: " + !orig.endsWith("\n") + "); head on disk ends with " + JSON.stringify(head.slice(-12)) + "; head === original + one newline: " + (head === orig + "\n"));
    const l2 = lint(file); c.ok(l2.code === 0 && /0 errors/.test(l2.out), "lint after the clear: exit " + l2.code + ": " + l2.out);

    // Kept records
    const kfile = path.join(vault, KEPT), korig = fs.readFileSync(kfile, "utf8");
    await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, KEPT);
    await o.page.waitForSelector(BOOK + " .booklet-card", { timeout: 8000 }); await sleep(1200);
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
    const lk = lint(kfile); c.ok(lk.code === 0 && /0 errors/.test(lk.out), "lint Kept records: exit " + lk.code + ": " + lk.out);
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
    const shownProse = await o.evaluate(() => (document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-prose") || {}).textContent);
    c.ok(/TYPED-ONETYPED-TWO/.test(shownProse || ""), "A booklet pane's prose redrew with the typed words: " + JSON.stringify((shownProse || "").slice(-45)));

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
    const l = lint(file); c.ok(l.code === 0 && /0 errors/.test(l.out), "lint after both runs: exit " + l.code + ": " + l.out);
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
    const prose = await o.evaluate(() => document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-prose").textContent);
    const diskNote = answersOf(fs.readFileSync(file, "utf8"));
    const afterField = await o.evaluate(() => document.activeElement === document.querySelector(".workspace-leaf-content[data-type='booklet'] input.booklet-text"));
    const want = "abcdefghiXYZUVWRST";
    c.info("two panes: " + log.map(([n, s]) => n + ": focused=" + s.focused + " nodeStillInDom=" + s.sameNode + " value=" + JSON.stringify(s.value)).join(" | "));
    c.ok(prose.includes("API-EDIT"), "booklet prose redrew with the Markdown edit: " + JSON.stringify(prose.slice(-30)));
    c.ok(diskNote && diskNote.note === want, "two panes: note on disk " + JSON.stringify(diskNote && diskNote.note) + " (typed " + want + ")");
    c.ok(afterField, "two panes: the (possibly new) input holds focus at the end: " + afterField);
    const redrawn = log.some(([n, s]) => !s.sameNode);
    c.info("the original input node was " + (redrawn ? "REPLACED by a redraw during the run" : "never replaced (no redraw swapped the node)"));
    c.ok(log.every(([n, s]) => n === "after XYZ" || s.value.startsWith("abcdefghiXYZ")) && log[log.length - 1][1].value === want, "two panes: input value never lost characters; final " + JSON.stringify(log[log.length - 1][1].value));
  });
  return c;
}

(async () => {
  const t00 = Date.now();
  console.log("INFO  vault copies and config under " + WORK + "; screenshots in " + SHOTS);
  const fns = { 1: check1, 2: check2, 3: check3, 4: check4, 5: check5 };
  for (const n of only) {
    const t0 = Date.now();
    let c;
    try { c = await fns[n](); }
    catch (e) { c = new Check(n, "(crashed)"); c.ok(false, "script error: " + (e && e.stack || e)); }
    const ms = Date.now() - t0; timings.push({ name: "check " + n + " (whole, including launch)", ms });
    c.print(ms);
  }
  console.log("INFO  timings: " + timings.map(t => t.name + " " + t.ms + " ms").join("; "));
  console.log("INFO  console/stdout lines of kind error/warning: " + consoleReport.length);
  for (const r of consoleReport) console.log("        [" + r.where + "] " + r.kind + ": " + r.text);
  console.log("INFO  total " + (Date.now() - t00) + " ms; " + (fails ? fails + " check(s) FAILED" : "all checks passed"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL  " + (e && e.stack || e)); process.exit(1); });
