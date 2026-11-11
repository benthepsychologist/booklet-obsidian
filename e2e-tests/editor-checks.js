// The editing panel ("Booklet blocks") and editor mode, in the real Obsidian, on a scratch vault copy.
//
//   PLAYWRIGHT=<node_modules> node editor-checks.js --obsidian <the obsidian binary> --out <folder> [--only A,B,...]
//
// Each session is a fresh launch on its own copy of a made-up vault (the plugin as built in the repository root, a booklet that holds
// kept entries and rows, and a small blank one) with its own scratch config folder, all under <out>/work-<time>/. Nothing here
// touches a real vault or ~/.config.
//   desktop   editor mode on from the Booklet view's button; every piece placed by a click and the note read by the real linter
//             (python3 lint-booklet.py), the title selected; a piece dragged onto the editor; a setting changed and only its line
//             differs; the icon picker; each data guard asked, cancelled and then accepted, with the records section and the rows
//             byte for byte as they were; every control named and reachable; editor mode off with nothing left behind
//   phone     Obsidian's phone mode in a 390 px window: editor mode from the command, a piece placed by a tap, the note linted
// Screenshots go to <out>/shots/. Prints PASS/FAIL lines and exits 1 on any FAIL.
const fs = require("fs"), path = require("path"), cp = require("child_process");
const { launch } = require("./drive");
const { mobile } = require("./waits");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const OBSIDIAN = arg("obsidian"), OUT = path.resolve(arg("out", "editor-checks-out")), ONLY = (arg("only", "") || "").split(",").filter(Boolean);
const LINTER = process.env.BOOKLET_LINTER || "/workspace/booklet/lint-booklet.py";
const REPO = path.join(__dirname, "..");
if (!OBSIDIAN) { console.error("--obsidian <binary> is required"); process.exit(2); }
const WORK = path.join(OUT, "work-" + Date.now()), SHOTS = path.join(OUT, "shots");
fs.mkdirSync(WORK, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VERSION = (/obsidian-(\d+\.\d+\.\d+)/.exec(OBSIDIAN) || [, "x"])[1];

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log("PASS  " + msg); } else { fails++; console.log("FAIL  " + msg); } return !!cond; };
const eq = (a, b, msg) => ok(a === b, msg + (a === b ? "" : `\n      got      ${JSON.stringify(a)}\n      expected ${JSON.stringify(b)}`));

// ---------------------------------------------------------------- the vault and the linter
const FORMAT = fs.readFileSync(path.join(REPO, "src/core/linter-tables.ts"), "utf8").match(/"FORMAT_VERSION":\s*"([^"]+)"/)[1];
const FRONT = `---\nbooklet: "${FORMAT}"\nid: local/made-up\ntitle: A made-up booklet\nlang: en\nversion: "0.1"\n---\n\n`;
const BLANK = FRONT + "> [!module|module-1] M\n\nOne or two sentences about this module.\n\n> [!activity|activity-1] An activity\n\nSome words.\n\n> [!text|text-1] First question\n\n> [!module|module-1 end]\n";
const HELD = fs.readFileSync(path.join(REPO, "test/page-notes/Editor held.booklet.md"), "utf8");

let sessions = 0;
function makeVault() {
  const dir = path.join(WORK, "s" + ++sessions), vault = path.join(dir, "vault"), plug = path.join(vault, ".obsidian/plugins/booklet");
  fs.mkdirSync(plug, { recursive: true });
  fs.writeFileSync(path.join(vault, ".obsidian/community-plugins.json"), '["booklet"]');
  for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(REPO, f), path.join(plug, f));
  fs.writeFileSync(path.join(vault, "Blank.booklet.md"), BLANK);
  fs.writeFileSync(path.join(vault, "Held.booklet.md"), HELD);
  fs.writeFileSync(path.join(vault, "Plain.md"), "# Plain\n\nNot a booklet.\n");
  return { dir, vault, config: path.join(dir, "config") };
}
const focusWindow = o => o.evaluate(() => window.dispatchEvent(new Event("focus")));
async function session(name, fn) {
  const v = makeVault();
  const o = await launch({ obsidian: OBSIDIAN, vault: v.vault, configDir: v.config, timeout: 90000 });
  // Obsidian opens a dialog in the window it calls active, and a headless window gets no focus event: say it has the focus
  await focusWindow(o);
  try { await fn(o, v.vault); } catch (e) { fails++; console.log(`FAIL  [${name}] stopped: ${e && e.stack || e}`); } finally { await o.close(); }
}
function lint(text) {
  const f = path.join(WORK, "lint-" + Math.random().toString(36).slice(2) + ".booklet.md");
  fs.writeFileSync(f, text);
  const r = cp.spawnSync("python3", [LINTER, f], { encoding: "utf8", timeout: 60000 });
  fs.rmSync(f, { force: true });
  const out = (r.stdout || "") + (r.stderr || "");
  return {
    errors: out.split("\n").filter(l => l.startsWith("ERROR")).map(l => l.replace(/^ERROR [^:]*: /, "")),
    warnings: out.split("\n").filter(l => l.startsWith("warn")).map(l => l.replace(/^warn +[^:]*: /, "")),
  };
}
const norm = e => e.replace(/line \d+/g, "line N");
const fresh = (before, after) => { const had = new Map(); for (const e of before.map(norm)) had.set(e, (had.get(e) || 0) + 1); const out = []; for (const e of after) { const n = norm(e); if (had.get(n)) had.set(n, had.get(n) - 1); else out.push(e); } return out; };
const diffLines = (a, b) => { const x = a.split("\n"), y = b.split("\n"); if (x.length !== y.length) return null; return x.map((l, i) => (l === y[i] ? null : i)).filter(i => i !== null); };

// ---------------------------------------------------------------- driving Obsidian
const shot = (o, name) => o.screenshot(path.join(SHOTS, `${VERSION}-${name}.png`));
/** Open a note and show it as Markdown (source) in the active pane. */
const openMarkdown = (o, rel) => o.evaluate(async rel => {
  const f = app.vault.getAbstractFileByPath(rel);
  await new Promise(r => { const t = setInterval(() => { const c = app.metadataCache.getFileCache(f); if (c && c.frontmatter) { clearInterval(t); r(); } }, 50); setTimeout(r, 8000); });
  const leaf = app.workspace.getLeaf();
  await leaf.openFile(f);
  if (leaf.view.getViewType() !== "markdown") await app.plugins.plugins.booklet.setMode(leaf, "markdown");
  await new Promise(r => setTimeout(r, 300));
  app.workspace.setActiveLeaf(leaf, { focus: true });
  return leaf.view.getViewType();
}, rel);
const openBooklet = (o, rel) => o.evaluate(async rel => {
  const f = app.vault.getAbstractFileByPath(rel);
  await new Promise(r => { const t = setInterval(() => { const c = app.metadataCache.getFileCache(f); if (c && c.frontmatter) { clearInterval(t); r(); } }, 50); setTimeout(r, 8000); });
  const leaf = app.workspace.getLeaf();
  await leaf.openFile(f);
  await new Promise(r => setTimeout(r, 500));
  return leaf.view.getViewType();
}, rel);
const doc = o => o.evaluate(() => { const v = app.workspace.getLeavesOfType("markdown").map(l => l.view).find(v => v.editor && v.file); return v ? v.editor.getValue() : null; });
const setDoc = (o, text, line) => o.evaluate(({ text, line }) => {
  const v = app.workspace.getLeavesOfType("markdown").map(l => l.view).find(v => v.editor && v.file);
  v.editor.setValue(text);
  const lines = text.split("\n"); const at = typeof line === "number" ? line : Math.max(0, lines.length - 1);
  v.editor.setCursor({ line: at, ch: 0 });
  app.workspace.setActiveLeaf(v.leaf, { focus: true });
}, { text, line });
const lineOf = (text, needle) => text.split("\n").findIndex(l => l.includes(needle));
const setCursor = (o, line) => o.evaluate(line => { const v = app.workspace.getLeavesOfType("markdown").map(l => l.view).find(v => v.editor && v.file); v.editor.setCursor({ line, ch: 0 }); v.editor.focus(); }, line);
const panel = o => o.page.locator(".booklet-blocks");
const waitPanel = async (o, fn, arg, ms = 6000) => { await o.page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }); };
/** The panel has drawn "This line" for the line the cursor is on (it follows the cursor after a short pause). */
const waitLine = (o, kind) => waitPanel(o, k => { const e = document.querySelector(".booklet-blocks-line .booklet-blocks-kind"); return !!e && e.textContent.startsWith("A " + k + " line"); }, kind);
const turnOn = async o => { await o.evaluate(() => app.commands.executeCommandById("booklet:editor-mode")); await o.page.waitForSelector(".booklet-blocks .booklet-blocks-piece", { timeout: 8000 }); };
const turnOff = async o => { await o.evaluate(() => app.commands.executeCommandById("booklet:editor-mode")); await o.page.waitForFunction(() => app.workspace.getLeavesOfType("booklet-blocks").length === 0, null, { timeout: 8000 }); };

// ---------------------------------------------------------------- the made-up places a piece is put (as test/editor-pieces.test.mjs)
const CONTEXTS = {
  activity: [BLANK, "[!text|text-1]"],
  opening: [FRONT + "> [!module|module-1] M\n\nOne or two sentences about this module.\n\n> [!activity|activity-1] An activity\n\n> [!text|text-1] First question\n\n> [!module|module-1 end]\n", "One or two sentences"],
  after: [FRONT + "> [!module|module-1] M\n\n> [!activity|activity-1] An activity\n\n> [!text|text-1] First question\n\n> [!module|module-1 end]\n", "module-1 end"],
  top: [FRONT + "# A made-up booklet\n\nWords before the first module.\n\n> [!module|module-1] M\n\n> [!activity|activity-1] An activity\n\n> [!text|text-1] First question\n\n> [!module|module-1 end]\n", "# A made-up booklet"],
  empty: ["", null],
};
const HOME = { "Structure - front matter.md": "empty", "Structure - module.md": "after", "Structure - data section.md": "after", "Structure - data section (module).md": "after", "Structure - notice.md": "opening", "Structure - theme.md": "top" };
const baseLint = {};

// ---------------------------------------------------------------- the pieces
const TABLE = fs.readFileSync(path.join(REPO, "src/core/pieces-table.ts"), "utf8");
const PIECES = JSON.parse(TABLE.slice(TABLE.indexOf("= [", TABLE.indexOf("PIECE_SOURCES")) + 2, TABLE.lastIndexOf("]") + 1));
const GT = { structure: "structure", questions: "questions", reading: "reading", data: "data", views: "views of data" };
const pieceButton = (o, f) => o.page.locator(`.booklet-blocks-piece[aria-label="Add ${f.label} (${GT[f.group]})"]`);
const isTitled = f => /^>[ \t]?\[![^\]]*\][+-]?[ \t]*\S/m.test(f.text) || /<!--[ \t]*Piece:/.test(f.text);
const markdownView = () => app.workspace.getLeavesOfType("markdown").map(l => l.view).find(v => v.editor && v.file);
const selection = o => o.evaluate(() => { const v = app.workspace.getLeavesOfType("markdown").map(l => l.view).find(v => v.editor && v.file); return v.editor.getSelection(); });
const cursorLine = o => o.evaluate(() => { const v = app.workspace.getLeavesOfType("markdown").map(l => l.view).find(v => v.editor && v.file); return v.editor.getCursor().line; });
// the phone's right drawer is closed after a tap: open it again
const openDrawer = async o => {
  await sleep(600); // a drawer that was shutting finishes first
  await o.evaluate(async () => { const l = app.workspace.getLeavesOfType("booklet-blocks")[0]; const d = app.workspace.rightSplit; await app.workspace.revealLeaf(l); await new Promise(r => setTimeout(r, 400)); });

  await o.page.waitForFunction(() => { const b = document.querySelector(".booklet-blocks-piece"); return !!b && b.getBoundingClientRect().width > 0 && b.offsetParent !== null; }, null, { timeout: 8000, polling: 50 }).catch(async e => { throw new Error("the drawer did not open: " + JSON.stringify(await o.evaluate(() => { const b = document.querySelector(".booklet-blocks-piece"); const d = app.workspace.rightSplit; return { collapsed: d.collapsed, has: !!b, rect: b && b.getBoundingClientRect().toJSON(), leaves: app.workspace.getLeavesOfType("booklet-blocks").length, cls: d.containerEl && d.containerEl.className, anc: (() => { const out = []; for (let e = b; e && e !== document.body; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === "none" || c.visibility === "hidden" || e.hidden) out.push(e.tagName + "." + e.className + " display:" + c.display + " vis:" + c.visibility); } return out; })(), active: app.workspace.activeLeaf && app.workspace.activeLeaf.view.getViewType() }; }))); });
  await sleep(150);
};

/** Place every piece with a click (or a tap), each in its own place, and lint what that made. */
async function placePieces(o, phone) {
  const how = phone ? "tap" : "click";
  let placedOk = 0; const problems = [];
  const ONLYPIECES = arg("pieces") ? new RegExp(arg("pieces")) : null;
  for (const p of PIECES) {
    if (ONLYPIECES && !ONLYPIECES.test(p.file)) continue;
    const ctx = CONTEXTS[HOME[p.file] || "activity"];
    if (!baseLint[ctx[0]]) baseLint[ctx[0]] = lint(ctx[0]);
    const text0 = ctx[0], at = ctx[1] ? lineOf(text0, ctx[1]) : 0;
    await setDoc(o, text0, at);
    if (phone) await openDrawer(o);
    await pieceButton(o, p).click();
    // on a phone the drawer slides shut after a tap, and Obsidian takes a moment over it
    await sleep(phone ? 600 : 80);
    const after = await doc(o), sel = await selection(o);
    const r = lint(after), b = baseLint[ctx[0]];
    const allowed = p.file === "Structure - front matter.md" ? ["this booklet holds nothing yet: no module and no activity (it opens as an empty booklet with this name)"] : [];
    const newErr = fresh(b.errors, r.errors), newWarn = fresh(b.warnings, r.warnings).filter(w => !allowed.includes(w));
    const inserted = after !== text0 && after.length > text0.length;
    const tokens = (after.match(/(^|[^A-Za-z0-9-])new-[A-Za-z0-9-]+/g) || []).filter(t => !/new-booklet/.test(t));
    if (!newErr.length && !newWarn.length && inserted && (sel.length > 0 || !isTitled(p)) && !tokens.length) placedOk++;
    else problems.push(`${p.file}: ${!inserted ? "nothing placed; " : ""}${newErr.concat(newWarn).join("; ")}${sel.length || !isTitled(p) ? "" : " (no title selected)"}${tokens.length ? " (tokens left " + tokens.join(",") + ")" : ""}`);
  }
  const total = ONLYPIECES ? PIECES.filter(f => ONLYPIECES.test(f.file)).length : PIECES.length;
  ok(placedOk === total, `a ${how} places each of the ${total} pieces at the cursor on its own lines, with its title selected where it has one, and the note lints with no new error or warning (${placedOk} did)` + (problems.length ? "\n      " + problems.join("\n      ") : ""));
}

async function openMarkdownOnly(o, rel) {
  await o.evaluate(async () => { for (const l of app.workspace.getLeavesOfType("markdown").concat(app.workspace.getLeavesOfType("booklet"))) l.detach(); });
  eq(await openMarkdown(o, rel), "markdown", rel + " is open as Markdown");
}
const wrap = o => { o.locator = (sel, opts) => o.page.locator(sel, opts); return o; };
const the = (o, sel, opts) => o.page.locator(sel, opts);

// ---------------------------------------------------------------- the checks
async function desktop(o, vault) {
  // -- the command and the Booklet view's button
  const cmd = await o.evaluate(() => app.commands.commands["booklet:editor-mode"] && app.commands.commands["booklet:editor-mode"].name);
  eq(cmd, "Booklet: Editor mode", "the command is named \"Booklet: Editor mode\"");
  eq(await openBooklet(o, "Held.booklet.md"), "booklet", "Held.booklet.md opens as a booklet");
  await o.page.waitForSelector(".workspace-leaf.mod-active .view-action[aria-label='Editor mode']", { timeout: 8000 });
  eq(await o.evaluate(() => app.workspace.getLeavesOfType("booklet-blocks").length), 0, "editor mode is off to begin with: no panel");
  eq(await the(o, ".view-action[aria-label='Editor mode']").first().getAttribute("aria-pressed"), "false", "the Booklet view's button says it is not pressed");
  const before = fs.readFileSync(path.join(vault, "Held.booklet.md"), "utf8");
  await the(o, ".workspace-leaf.mod-active .view-action[aria-label='Editor mode']").click();
  await o.page.waitForSelector(".booklet-blocks .booklet-blocks-piece", { timeout: 8000 });
  ok(await o.evaluate(() => { const l = app.workspace.getLeavesOfType("booklet-blocks"); return l.length === 1 && l[0].getRoot() === app.workspace.rightSplit; }), "the button turns editor mode on: the panel is open in the right side bar");
  ok(await o.evaluate(() => app.workspace.getLeavesOfType("markdown").length >= 1), "from the reading page, the note's Markdown is opened beside it to place blocks in");
  await sleep(500);
  eq((await the(o, ".booklet-blocks-holds").innerText()).trim(), "This booklet holds 12 kept entries, 2 saved answers and 5 rows. Changing an id, an option or a field can detach them.", "the top line states what the booklet holds");
  eq(fs.readFileSync(path.join(vault, "Held.booklet.md"), "utf8"), before, "turning editor mode on writes nothing");
  eq(await the(o, ".view-action[aria-label='Editor mode']").first().getAttribute("aria-pressed"), "true", "the button now says it is pressed");
  await shot(o, "panel-held");

  // -- every control is named and reachable
  const access = await o.evaluate(() => {
    const root = document.querySelector(".booklet-blocks"); const bad = []; let n = 0;
    for (const e of root.querySelectorAll("button, input, summary")) {
      if (e.offsetParent === null && !e.closest("details:not([open])")) continue;
      n++;
      const name = (e.getAttribute("aria-label") || (e.labels && e.labels[0] && e.labels[0].textContent) || e.textContent || "").trim();
      if (!name) bad.push(e.outerHTML.slice(0, 80));
      if (e.tabIndex < 0) bad.push("not focusable: " + e.outerHTML.slice(0, 80));
    }
    return { n, bad };
  });
  ok(access.n > 50 && access.bad.length === 0, `every one of the ${access.n} controls in the panel has a name and can be reached by keyboard` + (access.bad.length ? ": " + access.bad.join(" | ") : ""));

  // -- place every piece, in its own place, and lint
  eq(await o.evaluate(() => document.querySelectorAll(".booklet-blocks-piece").length), PIECES.length, "the panel lists exactly the pieces/ folder's files (no hand-listed kinds)");
  eq(await o.evaluate(() => new Set([...document.querySelectorAll(".booklet-blocks-piece")].map(b => b.getAttribute("aria-label"))).size), PIECES.length, "each piece has a name of its own");
  await openMarkdownOnly(o, "Blank.booklet.md");
  await placePieces(o, false);
  // a piece goes on lines of its own and never splits one: the cursor in the middle of a line
  await setDoc(o, BLANK, lineOf(BLANK, "Some words."));
  await o.evaluate(() => { const v = app.workspace.getLeavesOfType("markdown").map(l => l.view).find(v => v.editor && v.file); v.editor.setCursor({ line: v.editor.getValue().split("\n").findIndex(l => l.includes("Some words.")), ch: 5 }); });
  const choicePiece = PIECES.find(f => f.file === "Q - choice.md");
  await pieceButton(o, choicePiece).click(); await sleep(80);
  const split = await doc(o);
  ok(split.includes("\nSome words.\n") && !/Some[^\n]*\[!choice/.test(split), "a piece placed with the cursor inside a line goes after that line's paragraph; the line is not split");
  await shot(o, "after-place");

  // -- a piece dragged onto the editor
  await setDoc(o, BLANK, 0);
  await sleep(300);
  const dragBefore = await doc(o);
  const target = the(o, ".workspace-leaf-content[data-type='markdown'] .cm-line", { hasText: "One or two sentences about this module." }).first();
  const source = pieceButton(o, choicePiece);
  await source.scrollIntoViewIfNeeded();
  await source.dragTo(target);
  await sleep(300);
  const dragged = await doc(o);
  const lb = lint(dragBefore), la = lint(dragged);
  const dl = fresh(lb.errors.concat(lb.warnings), la.errors.concat(la.warnings));
  ok(dragged !== dragBefore && lineOf(dragged, "[!choice") > lineOf(dragged, "One or two sentences about this module.") && !/new-/.test(dragged), "dragging a piece onto the editor places it at the line it is dropped on (after the paragraph it landed in)");
  eq(dl.join("; "), "", "the piece placed by dragging lints clean");
  ok((await selection(o)).length > 0, "the dragged piece's title is selected");
  await shot(o, "after-drag");
  // dropped lower down it lands lower down
  await setDoc(o, BLANK, 0); await sleep(300);
  await pieceButton(o, choicePiece).dragTo(the(o, ".workspace-leaf-content[data-type='markdown'] .cm-line", { hasText: "Some words." }).first());
  await sleep(300);
  const dragged2 = await doc(o);
  ok(lineOf(dragged2, "[!choice") > lineOf(dragged2, "Some words.") && lineOf(dragged2, "[!choice") < lineOf(dragged2, "[!text|text-1]"), "dropped on another line, the piece lands there: after \"Some words.\" and before the question below it");

  // -- a setting changed rewrites that line only
  await setDoc(o, BLANK, lineOf(BLANK, "[!activity|activity-1]"));
  await waitLine(o, "activity");
  const s0 = await doc(o), actLine = lineOf(s0, "[!activity|activity-1]");
  await the(o, ".booklet-blocks-line input[data-key='flag-hidden']").check();
  await sleep(150);
  const s1 = await doc(o);
  eq(JSON.stringify(diffLines(s0, s1)), JSON.stringify([actLine]), "turning a switch on changes one line of the note");
  eq(s1.split("\n")[actLine], "> [!activity|activity-1 hidden] An activity", "...and changes only the bar of that line");
  await waitPanel(o, () => document.querySelector(".booklet-blocks-line input[data-key='flag-hidden']")?.checked === true);
  await the(o, ".booklet-blocks-line input[data-key='flag-hidden']").uncheck();
  await sleep(150);
  eq(await doc(o), s0, "turning it off again gives back the note byte for byte");
  const idBox = the(o, ".booklet-blocks-line input[data-key^='id-']");
  await idBox.fill("first-activity"); await idBox.press("Enter"); await sleep(200);
  const s2 = await doc(o);
  eq(JSON.stringify(diffLines(s0, s2)), JSON.stringify([actLine]), "renaming an id (nothing kept under it) changes one line");
  eq(await the(o, ".booklet-blocks-ask").count(), 0, "...and asks nothing");
  await waitLine(o, "activity");
  await the(o, ".booklet-blocks-line button[data-key='pick-icon']").click();
  await o.page.waitForSelector(".booklet-blocks-icons .booklet-blocks-icon", { timeout: 4000 });
  eq(await the(o, ".booklet-blocks-icons .booklet-blocks-icon").count(), 161, "the icon picker offers Booklet's 161 icons, each drawn and named");
  await shot(o, "icon-picker");
  await the(o, ".booklet-blocks-icons .booklet-blocks-icon[aria-label='book-open']").click();
  await sleep(200);
  const s3 = await doc(o);
  eq(s3.split("\n")[actLine], "> [!activity|first-activity icon:book-open] An activity", "choosing an icon writes icon:book-open on that line");
  eq(JSON.stringify(diffLines(s2, s3)), JSON.stringify([actLine]), "...and no other line differs");
  await waitLine(o, "activity");
  await o.evaluate(() => document.querySelector(".booklet-blocks-line input[data-key='flag-repeat']").focus());
  await o.page.keyboard.press("Space"); await sleep(200);
  ok((await doc(o)).includes("[!activity|first-activity icon:book-open repeat]"), "Space on a focused switch turns it on (keyboard)");

  // -- the outline and the problems
  await setDoc(o, BLANK + "\n> [!text|bad hidden] A setting the kind does not take\n", 0);
  await sleep(500);
  await the(o, ".booklet-blocks-outline > summary").click();
  await the(o, ".booklet-blocks-problems > summary").click();
  await sleep(300);
  const outlineText = await the(o, ".booklet-blocks-outline").innerText();
  ok(/module module-1/.test(outlineText) && /activity activity-1/.test(outlineText) && /text text-1/.test(outlineText), "the outline lists the module, the activity and the question");
  const problemsText = await the(o, ".booklet-blocks-problems").innerText();
  ok(/Problems \(\d+\)/.test(problemsText) && /hidden/.test(problemsText), "the problems list names the line the reader cannot read, and why");
  await shot(o, "outline-problems");
  await the(o, ".booklet-blocks-outline .booklet-blocks-jump", { hasText: "text text-1" }).click();
  await sleep(200);
  eq(await cursorLine(o), lineOf(BLANK + "\n", "[!text|text-1]"), "a click on an outline entry puts the cursor on its line");
  await the(o, ".booklet-blocks-problems .booklet-blocks-jump").first().click();
  await sleep(200);
  eq(await o.evaluate(() => { const v = app.workspace.getLeavesOfType("markdown").map(l => l.view).find(v => v.editor && v.file); return v.editor.getValue().split("\n")[v.editor.getCursor().line]; }), "> [!text|bad hidden] A setting the kind does not take", "a click on a problem puts the cursor on its line");
}

async function guards(o, vault) {
  const records = t => t.slice(t.indexOf("%%"));
  const fence = (t, info) => new RegExp("```booklet " + info + "[^\\n]*\\n[\\s\\S]*?```").exec(t)[0];
  await openMarkdownOnly(o, "Held.booklet.md");
  await turnOn(o);
  await sleep(400);
  eq(await doc(o), HELD, "the Markdown pane shows Held.booklet.md as written");
  const modalText = async () => { await o.page.waitForSelector(".booklet-blocks-ask", { timeout: 5000 }); return (await the(o, ".booklet-blocks-ask").innerText()).replace(/\s+/g, " "); };
  const answer = async word => { await the(o, ".booklet-blocks-ask button", { hasText: new RegExp("^" + word + "$") }).click(); await o.page.waitForFunction(() => !document.querySelector(".booklet-blocks-ask"), null, { timeout: 4000 }); await sleep(150); };
  const at = needle => lineOf(HELD, needle);

  // 1. an id that kept entries use
  await setDoc(o, HELD, at("[!activity|log repeat]")); await waitLine(o, "activity");
  const idBox = () => the(o, ".booklet-blocks-line input[data-key^='id-']");
  await idBox().fill("diary"); await idBox().press("Enter");
  let t = await modalText();
  ok(/12 kept entries/.test(t) && /1 saved answer/.test(t) && /activity id `log`/.test(t), "renaming an activity id that 12 kept entries use asks first, and says how many it touches: " + t);
  eq(await o.evaluate(() => document.activeElement && document.activeElement.textContent), "Cancel", "the question opens with Cancel focused");
  await shot(o, "guard-id");
  await answer("Cancel");
  eq(await doc(o), HELD, "Cancel leaves the note exactly as it was");
  await waitLine(o, "activity");
  await idBox().fill("diary"); await idBox().press("Enter");
  await modalText(); await answer("Change");
  const afterId = await doc(o);
  eq(JSON.stringify(diffLines(HELD, afterId)), JSON.stringify([at("[!activity|log repeat]")]), "Change rewrites the one line");
  eq(records(afterId), records(HELD), "...and the records section is the same bytes (the kept entries are not moved, rewritten or deleted)");
  eq(fence(afterId, "entries"), fence(HELD, "entries"), "...the 12 kept entries are still in the note exactly as written");
  await sleep(500);
  ok(/Problems \(\d+\)/.test(await the(o, ".booklet-blocks-problems > summary").innerText()), "the problems list now shows the leftovers: kept entries that match nothing");
  await the(o, ".booklet-blocks-problems > summary").click(); await sleep(200);
  const probs = await the(o, ".booklet-blocks-problems").innerText();
  ok(/12 kept entries for the activity `log`/.test(probs), "...and says which: " + probs.replace(/\s+/g, " ").slice(0, 160));

  // 2. a question id
  await setDoc(o, HELD, at("[!text|why]")); await waitLine(o, "text");
  await idBox().fill("reason"); await idBox().press("Enter");
  t = await modalText();
  ok(/12 kept entries/.test(t) && /question id `why`/.test(t), "renaming a question id that 12 kept entries answer asks first: " + t);
  await o.page.keyboard.press("Escape"); await o.page.waitForFunction(() => !document.querySelector(".booklet-blocks-ask"), null, { timeout: 4000 }); await sleep(150);
  eq(await doc(o), HELD, "Escape is Cancel: the note is as it was");

  // 3. an option kept entries chose: rename, then remove
  await setDoc(o, HELD, at("[!choice|feeling]")); await o.page.waitForSelector(".booklet-blocks-options:not(.booklet-blocks-hidden) input[data-key^='opt-']", { timeout: 5000 });
  const opt2 = the(o, ".booklet-blocks-options input[data-key^='opt-']").nth(1);
  eq(await opt2.inputValue(), "Tense", "the options of the choice are listed, in order");
  await opt2.fill("Worried"); await opt2.press("Enter");
  t = await modalText();
  ok(/4 kept entries/.test(t) && /options of `feeling`/.test(t), "renaming an option 4 of the kept entries chose asks first: " + t);
  await answer("Cancel");
  eq(await doc(o), HELD, "Cancel leaves the option as it was");
  await o.page.waitForSelector(".booklet-blocks-options input[data-key^='orm-'], .booklet-blocks-options button[data-key^='orm-']", { timeout: 5000 });
  await the(o, ".booklet-blocks-options button[data-key^='orm-']").first().click();
  t = await modalText();
  ok(/12 kept entries/.test(t), "removing the first option, which moves the rest up a place, asks first and says all 12: " + t);
  await answer("Change");
  const afterOpt = await doc(o);
  eq(afterOpt, HELD.replace("- [ ] Calm\n", ""), "Change removes that one option line and nothing else");
  eq(records(afterOpt), records(HELD), "...the records section is the same bytes");

  // 4. a data field rows use
  await setDoc(o, HELD, at("```booklet data") + 1); await o.page.waitForSelector(".booklet-blocks-fields:not(.booklet-blocks-hidden) input[data-key^='fkey-']", { timeout: 5000 });
  const rowsOf = x => JSON.parse(/```booklet data\n([\s\S]*?)\n```/.exec(x)[1]).rows;
  const fkey = the(o, ".booklet-blocks-fields input[data-key='fkey-kind']");
  await fkey.fill("group"); await fkey.press("Enter");
  t = await modalText();
  ok(/5 rows/.test(t) && /field `kind`/.test(t), "renaming a field 5 rows use asks first: " + t);
  await shot(o, "guard-field");
  await answer("Cancel");
  eq(await doc(o), HELD, "Cancel leaves the declaration as it was");
  await waitPanel(o, () => !!document.querySelector(".booklet-blocks-fields button[data-key='frm-done']"));
  await the(o, ".booklet-blocks-fields button[data-key='frm-done']").click();
  t = await modalText();
  ok(/5 rows/.test(t) && /field `done`/.test(t), "removing a field 5 rows hold asks first: " + t);
  await answer("Change");
  const afterField = await doc(o);
  ok(!/"done": "Done"/.test(afterField) && /"kind": "Kind"/.test(afterField), "Change takes the field out of the declaration");
  eq(JSON.stringify(rowsOf(afterField)), JSON.stringify(rowsOf(HELD)), "...the 5 rows are untouched, the removed field's values still in them");
  eq(records(afterField), records(HELD), "...and so is the records section");
  // a field nothing uses goes without a question: add one by hand to the declaration, then remove it in the panel
  const spare = HELD.replace('"done": "Done" }', '"done": "Done", "spare": "Spare" }');
  await setDoc(o, spare, lineOf(spare, "```booklet data") + 1);
  await waitPanel(o, () => !!document.querySelector(".booklet-blocks-fields button[data-key='frm-spare']"));
  await the(o, ".booklet-blocks-fields button[data-key='frm-spare']").click(); await sleep(250);
  eq(await the(o, ".booklet-blocks-ask").count(), 0, "a field no row holds is removed without a question");
  eq(await doc(o), HELD, "...and the note is Held.booklet.md again, byte for byte");
  // the whole run never touched the records on disk by itself: only the editor's own save of what was typed
  await sleep(1500);
  const disk = fs.readFileSync(path.join(vault, "Held.booklet.md"), "utf8");
  eq(records(disk), records(HELD), "on disk, after all of that, the records section is exactly as it began");
}

async function off(o, vault) {
  const sha = f => require("crypto").createHash("sha256").update(fs.readFileSync(path.join(vault, f))).digest("hex");
  const s0 = sha("Held.booklet.md");
  eq(await openBooklet(o, "Held.booklet.md"), "booklet", "Held.booklet.md opens as a booklet");
  await o.page.waitForSelector(".booklet-page", { timeout: 10000 });
  await sleep(800);
  const page = () => o.evaluate(() => { const p = document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-page"); return p ? p.innerHTML : null; });
  const reader0 = await page();
  ok(reader0 && reader0.length > 500, "the reading page is drawn");
  await o.evaluate(() => app.commands.executeCommandById("booklet:editor-mode"));
  await o.page.waitForSelector(".booklet-blocks .booklet-blocks-piece", { timeout: 8000 });
  eq(await the(o, ".view-action[aria-label='Editor mode']").first().getAttribute("aria-pressed"), "true", "the command turns editor mode on and the button shows it");
  await sleep(500);
  await o.evaluate(() => app.commands.executeCommandById("booklet:editor-mode"));
  await o.page.waitForFunction(() => app.workspace.getLeavesOfType("booklet-blocks").length === 0, null, { timeout: 8000 });
  eq(await o.evaluate(() => document.querySelectorAll(".booklet-blocks").length), 0, "the command turns it off: the panel is closed and nothing of it is left in the page");
  eq(await the(o, ".view-action[aria-label='Editor mode']").first().getAttribute("aria-pressed"), "false", "the button shows it is off");
  await o.evaluate(() => { const l = app.workspace.getLeavesOfType("booklet")[0]; app.workspace.setActiveLeaf(l, { focus: true }); });
  // the Markdown pane opened for editing is closed; what a reader sees of the note is what it was
  await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("markdown")) l.detach(); });
  await sleep(500);
  eq(await page(), reader0, "with editor mode off the reading page is the same markup as before it was ever on");
  eq(sha("Held.booklet.md"), s0, "the note on disk is the same bytes: turning editor mode on and off writes nothing");
  // closing the panel by hand is editor mode off
  await o.evaluate(() => app.commands.executeCommandById("booklet:editor-mode"));
  await o.page.waitForSelector(".booklet-blocks .booklet-blocks-piece", { timeout: 8000 });
  await o.evaluate(() => app.workspace.getLeavesOfType("booklet-blocks")[0].detach());
  await sleep(400);
  eq(await the(o, ".view-action[aria-label='Editor mode']").first().getAttribute("aria-pressed"), "false", "closing the panel by hand is editor mode off: the button shows it");
  // the plugin has no setting for it
  const settingsText = await o.evaluate(async () => { app.setting.open(); app.setting.openTabById("booklet"); await new Promise(r => setTimeout(r, 600)); const t = app.setting.activeTab && app.setting.activeTab.containerEl; const x = t ? t.innerText : ""; app.setting.close(); return x; });
  ok(settingsText.length > 20 && !/editor/i.test(settingsText), "the plugin's settings page has no option for editor mode" + (settingsText.length > 20 && !/editor/i.test(settingsText) ? "" : ": " + JSON.stringify(settingsText.slice(0, 300))));
  // the guard: a refreshed Held.booklet.md
  eq(sha("Held.booklet.md"), s0, "the note is still the same bytes at the end");
}

async function phone(o, vault) {
  await o.page.setViewportSize({ width: 390, height: 844 });
  await mobile(o, true);
  await focusWindow(o);
  ok(await o.evaluate(() => document.body.classList.contains("is-mobile")), "Obsidian is in phone mode, 390 px wide");
  eq(await openMarkdown(o, "Blank.booklet.md"), "markdown", "Blank.booklet.md is open as Markdown");
  await o.evaluate(() => app.commands.executeCommandById("booklet:editor-mode"));
  await o.page.waitForSelector(".booklet-blocks .booklet-blocks-piece", { timeout: 10000 });
  ok(await o.evaluate(() => app.workspace.getLeavesOfType("booklet-blocks").length === 1), "the command turns editor mode on in phone mode: the panel is open");
  await sleep(500);
  await shot(o, "phone-panel");
  // touch targets
  const small = await o.evaluate(() => { const bad = []; for (const e of document.querySelectorAll(".booklet-blocks button, .booklet-blocks input, .booklet-blocks summary")) { const r = (e.type === "checkbox" && e.labels[0] ? e.labels[0] : e).getBoundingClientRect(); if (r.width === 0) continue; if (r.height < 44 - 0.5) bad.push((e.getAttribute("aria-label") || e.textContent || e.type) + " " + Math.round(r.height)); } return bad; });
  ok(small.length === 0, "every control in the panel is at least 44 px high on a phone" + (small.length ? ": " + small.slice(0, 6).join(" | ") + (small.length > 6 ? " ... (" + small.length + ")" : "") : ""));
  const wide = await o.evaluate(() => { const p = document.querySelector(".booklet-blocks"); const r = p.getBoundingClientRect(); const off = [...p.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > r.right + 1 && e.getBoundingClientRect().width > 0).slice(0, 4).map(e => e.tagName + "." + e.className + " " + (e.textContent || "").slice(0, 30) + " right+" + Math.round(e.getBoundingClientRect().right - r.right) + " w" + Math.round(e.getBoundingClientRect().width) + " panel w" + Math.round(r.width)); return { px: p.scrollWidth - p.clientWidth, off }; });
  ok(wide.px <= 1, "the panel does not scroll sideways on a phone (" + wide.px + " px" + (wide.off.length ? "; " + wide.off.join(" | ") : "") + ")");
  await placePieces(o, true);
  await setDoc(o, BLANK, lineOf(BLANK, "[!text|text-1]"));
  await openDrawer(o);
  await pieceButton(o, PIECES.find(f => f.file === "Q - choice.md")).click(); await sleep(300);
  await shot(o, "phone-after-tap");
  ok(await o.evaluate(() => { const d = app.workspace.rightSplit; return d.collapsed === true; }), "after a tap the drawer closes and the note is in view");
  await o.evaluate(() => app.commands.executeCommandById("booklet:editor-mode"));
  await o.page.waitForFunction(() => app.workspace.getLeavesOfType("booklet-blocks").length === 0, null, { timeout: 8000 });
  ok(true, "the command turns editor mode off in phone mode");
}

(async () => {
  const run = async (name, fn) => { if (ONLY.length && !ONLY.includes(name)) return; console.log(`\n== ${name} (Obsidian ${VERSION})`); await session(name, async (o, v) => fn(wrap(o), v)); };
  await run("desktop", desktop);
  await run("guards", guards);
  await run("off", off);
  await run("phone", phone);
  console.log(`\n${passes} passed, ${fails} failed. Screenshots: ${SHOTS}`);
  process.exit(fails ? 1 : 0);
})();
