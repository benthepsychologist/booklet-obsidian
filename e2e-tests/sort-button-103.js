// The table heading that sorts (`button.booklet-q-sort`), measured in a real Obsidian: pictures and computed styles. Plugin 1.0.3 replaced
// `all: unset` on it with the properties that reset did something to; this is the "before and after" for that change. Run by hand, once on
// each build (the build is the plugin in the vault given by --vault):
//   PLAYWRIGHT=<node_modules> node sort-button-103.js --obsidian <binary> --out <dir> [--tag name] [--vault ../test-vault] [--compare <earlier.json>] [--dry] [--help]
//   after:  ... --vault /workspace/booklet-wt/c103/test-vault --tag after
//   before: ... --vault /workspace/booklet-wt/c102/test-vault --tag before --out <dir>      (the build in that worktree's test-vault copy)
//   then:   ... --tag after --compare <dir>/before-sort-button.json    (prints every value that differs; a difference is not a FAIL)
// Not part of plugin-check.js. One Obsidian at a time, on a scratch config and a vault of the plugin's files and the made-up note
// test/page-notes/Garden dashboards.booklet.md, whose screen "data" has a table of twelve rows, so every heading of it is a sort button.
// (E2E_PORT_RANGE="9341-9349" keeps the debugging port inside a range of your own; drive.js reads it.)
//
// What it does. For two windows, 1280x800 (desktop) and 390x844 (Obsidian's phone mode, as dashboard-checks.js does it), and for the light
// and the dark theme, it takes the first sort button of the table and, in four states, (1) writes a picture of it clipped to its box plus
// and minus 8 px, and (2) reads its computed styles into the JSON: normal (mouse away, nothing focused); hovered (the real mouse over it);
// focused by the real Tab key (so :focus-visible matches; the script presses Tab from the query's "Sort and filter" button until the
// button has the focus, at most 80 times); sorted (after a click, mouse away, no focus: the heading's own state, `is-sorted`). The sort
// is put back to the original order after each pass. Styles read: background-color, border-top-width, box-shadow, padding, margin, height,
// min-height, font-size, font-weight, color, text-align, outline-style, appearance, display, cursor, and some more that `all: unset`
// used to reset (see PROPS), for the button, its heading cell (th) and its icon; and the box (width, height).
// Assertions (PASS/FAIL): the table has sort buttons; Tab reaches the first one; :focus-visible matches it then; it shows an outline then.
// How the button compares with its heading (colour, size, weight) is printed as INFO lines, not asserted.
// Output: <out>/<tag>-<window>-<theme>-<state>.png and <out>/<tag>-sort-button.json. Exit 1 on any FAIL.
const fs = require("fs"), path = require("path");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const USAGE = "usage: PLAYWRIGHT=<node_modules> node sort-button-103.js --obsidian <binary> --out <dir> [--tag name] [--vault ../test-vault] [--compare <earlier.json>] [--dry] [--help]";
if (process.argv.includes("--help") || process.argv.includes("-h")) { console.log(USAGE); process.exit(0); }
const opt = { obsidian: arg("obsidian"), out: arg("out"), vault: arg("vault", path.join(__dirname, "..", "test-vault")), tag: arg("tag", "run"), compare: arg("compare") };
const dry = process.argv.includes("--dry");
if (!opt.out || (!opt.obsidian && !dry)) { console.error("needs --obsidian <binary> and --out <dir>\n" + USAGE); process.exit(2); }
const SRC_VAULT = path.resolve(opt.vault), OUT = path.resolve(opt.out);
const REPO = path.join(__dirname, "..");
const NOTE = "Garden dashboards.booklet.md";
const NOTE_SRC = path.join(REPO, "test", "page-notes", NOTE);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const manifestOf = () => { try { return JSON.parse(fs.readFileSync(path.join(SRC_VAULT, ".obsidian", "plugins", "booklet", "manifest.json"), "utf8")); } catch (e) { return {}; } };

// the computed properties read (the first fifteen are the brief's; the rest are what `all: unset` reset or that the button inherits)
const PROPS = [
  "background-color", "border-top-width", "box-shadow", "padding", "margin", "height", "min-height", "font-size", "font-weight", "color", "text-align", "outline-style", "appearance", "display", "cursor",
  "width", "min-width", "border-top-style", "border-top-color", "border-radius", "outline-width", "outline-color", "outline-offset", "background-image", "line-height", "letter-spacing",
  "font-family", "font-style", "text-transform", "text-decoration-line", "white-space", "gap", "align-items", "justify-content", "transition-property", "transition-duration", "user-select", "box-sizing", "opacity",
];
const WINDOWS = [{ name: "desktop", w: 1280, h: 800, phone: false }, { name: "phone", w: 390, h: 844, phone: true }];
const THEMES = ["light", "dark"];

/* what a comparison with an earlier JSON prints: every value that differs, and keys that exist on one side only */
function compare(before, after) {
  const diffs = []; let same = 0;
  const walk = (a, b, trail) => {
    if (a && b && typeof a === "object" && typeof b === "object") {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!(k in a)) diffs.push(`ONLY-AFTER  ${[...trail, k].join(" ")}: ${JSON.stringify(b[k]).slice(0, 80)}`);
        else if (!(k in b)) diffs.push(`ONLY-BEFORE ${[...trail, k].join(" ")}: ${JSON.stringify(a[k]).slice(0, 80)}`);
        else walk(a[k], b[k], [...trail, k]);
      }
    } else if (a === b) same++;
    else diffs.push(`DIFF ${trail.join(" ")}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  };
  walk(before.configs, after.configs, []);
  return { diffs, same };
}

if (dry) {
  const need = [...["main.js", "manifest.json", "styles.css"].map(f => path.join(SRC_VAULT, ".obsidian", "plugins", "booklet", f)), NOTE_SRC];
  let bad = 0;
  for (const f of need) { const ok = fs.existsSync(f); if (!ok) bad++; say((ok ? "ok   " : "MISSING ") + f); }
  say("plugin in the vault: " + (manifestOf().version || "(unreadable manifest)"));
  if (opt.obsidian) { const ok = fs.existsSync(path.resolve(opt.obsidian)); if (!ok) bad++; say((ok ? "ok   " : "MISSING ") + "obsidian binary " + path.resolve(opt.obsidian)); }
  try { require("./drive"); require("./waits"); require("./media-lib"); say("ok   harness modules load"); } catch (e) { bad++; say("MISSING harness module: " + e.message); }
  const P = process.env.PLAYWRIGHT; let pwOk = false;
  for (const c of P ? [P, path.join(P, "playwright-core"), path.join(P, "node_modules", "playwright-core")] : ["playwright-core"]) { try { require(c); pwOk = true; break; } catch (e) { /* next */ } }
  if (!pwOk) bad++;
  say((pwOk ? "ok   " : "MISSING ") + "playwright-core (PLAYWRIGHT=" + P + ")");
  if (opt.compare) {
    // the comparison runs on two JSON files here, so it can be tried without Obsidian: --compare <a.json> (and the same file as "after" shows 0 differences)
    try { const a = JSON.parse(fs.readFileSync(path.resolve(opt.compare), "utf8")); const r = compare(a, a); say(`ok   --compare reads ${opt.compare}: ${Object.keys(a.configs || {}).length} window(s); against itself ${r.diffs.length} differences, ${r.same} equal values`); } catch (e) { bad++; say("MISSING --compare file: " + e.message); }
  }
  say("windows: " + WINDOWS.map(w => `${w.name} ${w.w}x${w.h}`).join(", ") + "; themes: " + THEMES.join(", ") + "; states: normal, hover, focus, sorted");
  say("would write to " + OUT + " with tag " + opt.tag);
  say(bad ? "dry run: " + bad + " problem(s)" : "dry run: ok");
  process.exit(bad ? 1 : 0);
}

const { launch } = require("./drive");
const { quiet, frames, mobile } = require("./waits");
fs.mkdirSync(OUT, { recursive: true });
const WORK = path.join(OUT, "work-" + Date.now());
let pass = 0, fail = 0;
const fact = (ok, text, extra) => { ok ? pass++ : fail++; say((ok ? "PASS " : "FAIL ") + text + (extra ? "  " + extra : "")); };
const BOOK = ".workspace-leaf-content[data-type='booklet']";

const consoleReport = [], sessions = [];
const env = { launch, opt: { obsidian: opt.obsidian }, WORK, consoleReport, sessions, SRC_VAULT, SHOTS: OUT, BOOK };
const { withMedia } = require("./media-lib")(env);

/* in the page: mark the first sort button of the first table that has them (so Playwright can find it again after the view draws again) */
const MARK = sel => {
  document.querySelectorAll("[data-e2e-sort]").forEach(e => e.removeAttribute("data-e2e-sort"));
  const tables = [...document.querySelectorAll(sel + " table.booklet-q-table")].filter(t => t.querySelector("th button.booklet-q-sort"));
  const t = tables[0];
  if (!t) return { tables: 0, buttons: 0 };
  const bs = [...t.querySelectorAll("th button.booklet-q-sort")];
  bs[0].setAttribute("data-e2e-sort", "1");
  return { tables: tables.length, buttons: bs.length, labels: bs.map(b => b.textContent.trim()), key: bs[0].getAttribute("data-key") };
};
/* in the page: the computed styles of the marked button, its heading cell and its icon, and what the browser says about its state */
const READ = props => {
  const b = document.querySelector("[data-e2e-sort]");
  if (!b) return null;
  const pick = (el, list) => { const cs = getComputedStyle(el), o = {}; for (const p of list) o[p] = cs.getPropertyValue(p); return o; };
  const th = b.closest("th"), icon = b.querySelector(".booklet-q-sort-icon svg"), r = b.getBoundingClientRect();
  return {
    button: pick(b, props),
    th: pick(th, ["font-size", "font-weight", "color", "text-align", "text-transform", "line-height", "padding", "background-color"]),
    icon: icon ? pick(icon, ["width", "height", "color", "stroke"]) : null,
    rect: { width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10 },
    state: { hover: b.matches(":hover"), focus: b.matches(":focus"), focusVisible: b.matches(":focus-visible"), active: document.activeElement === b, sorted: b.classList.contains("is-sorted"), ariaSort: th.getAttribute("aria-sort"), text: b.textContent.trim(), mobile: document.body.classList.contains("is-mobile") },
  };
};

(async () => {
  say("Obsidian:", opt.obsidian, "tag", opt.tag, "plugin in the vault:", manifestOf().version);
  const result = { tag: opt.tag, plugin: manifestOf().version || null, configs: {} };
  await withMedia("sort-button", { note: NOTE, files: { [NOTE]: fs.readFileSync(NOTE_SRC, "utf8") }, data: { allowedMediaHosts: [], noteAllows: {} } }, async (o, ctx) => {
    const version = await o.evaluate(() => (navigator.userAgent.match(/obsidian\/([\d.]+)/i) || [])[1]);
    say("version", version); result.obsidian = version;
    const pluginVersion = await o.evaluate(() => app.plugins.plugins.booklet && app.plugins.plugins.booklet.manifest.version);
    result.pluginLoaded = pluginVersion; say("plugin loaded:", pluginVersion);
    const open = async () => {
      await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
      await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, NOTE, { timeout: 30000, polling: 100 });
      await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, NOTE);
      await o.page.waitForFunction(() => { const l = app.workspace.getLeavesOfType("booklet")[0]; return !!(l && l.view.contentEl.querySelector(".booklet-page")); }, null, { timeout: 20000, polling: 100 });
      await sleep(400); await quiet(o);
      await o.evaluate(async () => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 2, screen: "activity:/data", part: 0 }, active: true }); });
      await o.page.waitForSelector(BOOK + " .booklet-page[data-booklet-screen='activity:/data']", { timeout: 8000 });
      await quiet(o);
    };
    const away = async () => { await o.page.mouse.move(3, 3); await o.evaluate(() => { const a = document.activeElement; a && a.blur && a.blur(); }); await sleep(200); };
    const btn = () => o.page.locator("[data-e2e-sort]").first();
    const remark = () => o.evaluate(MARK, BOOK);
    // a picture of the button's box, 8 px round it
    const snap = async (name) => {
      const f = path.join(OUT, `${opt.tag}-${name}.png`);
      try {
        const bb = await btn().boundingBox(), vp = o.page.viewportSize() || { width: 1280, height: 800 };
        const x = Math.max(0, Math.floor(bb.x - 8)), y = Math.max(0, Math.floor(bb.y - 8));
        await o.page.screenshot({ path: f, clip: { x, y, width: Math.max(1, Math.min(Math.ceil(bb.width + 16), vp.width - x)), height: Math.max(1, Math.min(Math.ceil(bb.height + 16), vp.height - y)) } });
      } catch (e) { say("INFO picture " + name + ": " + e.message.slice(0, 100)); }
    };
    const resetSort = async () => {
      for (let i = 0; i < 4; i++) {
        if (!(await o.evaluate(sel => !!document.querySelector(sel + " th[aria-sort]"), BOOK))) break;
        await o.evaluate(sel => { const th = document.querySelector(sel + " th[aria-sort]"); th.querySelector("button").click(); }, BOOK);
        await sleep(250); await quiet(o);
      }
      await remark();
    };

    for (const win of WINDOWS) {
      await o.page.setViewportSize({ width: win.w, height: win.h });
      if (win.phone) await mobile(o, true);
      await open();
      await sleep(300);
      for (const theme of THEMES) {
        const tag = `${win.name}-${theme}`, label = `[${win.name} ${win.w}x${win.h} ${theme}]`;
        await o.setScheme(theme); await sleep(300); await frames(o);
        const m = await remark();
        say(`INFO ${label} tables with sort buttons ${m.tables}, buttons in the first ${m.buttons}: ${JSON.stringify(m.labels || [])}`);
        fact(m.buttons >= 1, `${label} the table has sort buttons (${m.buttons})`);
        if (m.buttons < 1) continue;
        const rec = ((result.configs[win.name] = result.configs[win.name] || {})[theme] = {});
        await btn().scrollIntoViewIfNeeded().catch(() => {});
        await frames(o);

        // normal
        await away();
        rec.normal = await o.evaluate(READ, PROPS);
        await snap(`${tag}-normal`);

        // hovered
        await btn().hover({ timeout: 4000 }).catch(e => say("INFO hover: " + e.message.slice(0, 80)));
        await sleep(300);
        rec.hover = await o.evaluate(READ, PROPS);
        await snap(`${tag}-hover`);

        // focused by the real Tab key
        await away();
        await o.evaluate(sel => { const q = document.querySelector("[data-e2e-sort]").closest(".booklet-query"), t = q && q.querySelector(".booklet-qc-toggle"); if (t) t.focus(); else document.querySelector(sel + " .view-content").focus(); }, BOOK);
        let reached = false, presses = 0;
        for (; presses < 80 && !reached; presses++) {
          await o.page.keyboard.press("Tab");
          reached = await o.evaluate(() => document.activeElement === document.querySelector("[data-e2e-sort]"));
        }
        await sleep(300);
        if (!reached) await btn().focus().catch(() => {});
        rec.focus = await o.evaluate(READ, PROPS);
        await snap(`${tag}-focus`);
        fact(reached, `${label} Tab reaches the first sort button (${presses} press${presses === 1 ? "" : "es"})`);
        fact(!!rec.focus && rec.focus.state.focusVisible, `${label} :focus-visible matches it after Tab`);
        const f = rec.focus && rec.focus.button;
        fact(!!f && f["outline-style"] !== "none" && parseFloat(f["outline-width"]) > 0, `${label} focused, it shows an outline (${f ? `${f["outline-style"]} ${f["outline-width"]} ${f["outline-color"]}, offset ${f["outline-offset"]}, shadow ${f["box-shadow"].slice(0, 40)}` : "unreadable"})`);

        // sorted: a click, then the mouse and the focus away
        await away();
        await btn().click({ timeout: 4000 }).catch(e => say("INFO click: " + e.message.slice(0, 80)));
        await sleep(300); await quiet(o);
        await remark();
        await away();
        rec.sorted = await o.evaluate(READ, PROPS);
        await snap(`${tag}-sorted`);
        fact(!!rec.sorted && rec.sorted.state.sorted && rec.sorted.state.ariaSort === "ascending", `${label} a click sorts by that heading, ascending (is-sorted ${rec.sorted && rec.sorted.state.sorted}, aria-sort ${rec.sorted && rec.sorted.state.ariaSort})`);
        await resetSort();

        // what to see at a glance: the button against its heading
        const n = rec.normal;
        const same = ["color", "font-size", "font-weight", "text-align"].map(p => `${p} ${n.button[p] === n.th[p] ? "=" : "!="} heading (${n.button[p]}${n.button[p] === n.th[p] ? "" : " vs " + n.th[p]})`).join("; ");
        say(`INFO ${label} normal: ${same}`);
        say(`INFO ${label} normal: background ${n.button["background-color"]}, border ${n.button["border-top-width"]}, shadow ${n.button["box-shadow"].slice(0, 40)}, padding ${n.button.padding}, margin ${n.button.margin}, height ${n.button.height} (min ${n.button["min-height"]}), box ${n.rect.width}x${n.rect.height}`);
        const h = rec.hover;
        say(`INFO ${label} hovered: colour ${n.button.color} -> ${h.button.color} (hover state ${h.state.hover}); sorted colour ${rec.sorted.button.color}`);
      }
    }
  });

  fs.writeFileSync(path.join(OUT, opt.tag + "-sort-button.json"), JSON.stringify({ ...result, pass, fail, console: consoleReport.filter(c => !/harness noise/.test(c.kind)) }, null, 1));
  if (opt.compare) {
    const before = JSON.parse(fs.readFileSync(path.resolve(opt.compare), "utf8"));
    const { diffs, same } = compare(before, result);
    say(`\ncompare with ${opt.compare} (plugin ${before.plugin}, Obsidian ${before.obsidian}) -> this run (plugin ${result.plugin}, Obsidian ${result.obsidian}): ${diffs.length} difference(s), ${same} equal value(s)`);
    for (const d of diffs) say("  " + d);
  }
  say(`done; ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
