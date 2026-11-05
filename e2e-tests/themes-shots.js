// Screenshots of the real Obsidian app showing Booklet notes in each look (themes prototype), and a pixel compare of two runs.
//
// The looks are the value of `data-booklet-look` on the booklet view's root (`.booklet-view`): "paper-light" | "paper-dark" | "obsidian".
// This harness does not depend on the plugin's own switch: it sets the attribute itself through the page, and sets Obsidian's own
// light/dark scheme to match (paper-light -> light, paper-dark -> dark, obsidian -> dark unless --obsidian-scheme says otherwise).
//
// Shots:   PLAYWRIGHT=<node_modules with playwright-core> node themes-shots.js \
//            --obsidian <binary> --config <scratch folder, never ~/.config> --out <dir> \
//            [--vault ../test-vault] [--plugin-dir <folder with main.js, manifest.json, styles.css>] \
//            [--looks paper-light,paper-dark,obsidian] [--sizes desktop,phone] [--only kinds,quiz] [--obsidian-scheme dark|light]
//   The vault is always copied to a temp folder under --out/.work-<time> and the plugin files are installed into that copy, so
//   nothing in the repository is written. --plugin-dir defaults to the repository root (run `node esbuild.config.mjs production` first);
//   for a before/after pass it a build of main, e.g. /workspace/booklet-obsidian/test-vault/.obsidian/plugins/booklet.
//   Output: <out>/<screen>-<look>-<size>.png, one PASS/FAIL line per shot and a final count.
// Compare: node themes-shots.js --compare <folderA> <folderB> [--looks obsidian] [--only screen,screen] [--max-diff N]
//   Decodes the PNGs (built-in decoder, no packages) and prints how many pixels differ for each file of the given looks (default
//   obsidian) present in both folders; exit code 1 if a file differs by more than --max-diff pixels (default 0) or is missing on one side.
//   Two runs of the same build can differ by a few dozen pixels (a slide-in or a caret caught mid-way): use --max-diff 100 to ignore that.
//
// Sizes: desktop is a 1100x800 window; phone is Obsidian's phone mode (`app.emulateMobile(true)`) at 390x844 with touch, as mobile-checks.js.
// Screens (notes of test-vault): sketch-home, sketch-module, kinds, reading, quiz (one option picked so feedback shows),
// kept (entries open), daily, pages-menu (a page tree with its menu open).
const fs = require("fs"), path = require("path"), zlib = require("zlib");

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const list = s => String(s).split(",").map(x => x.trim()).filter(Boolean);
const say = (...a) => console.log(...a);

/* ---------- PNG decoding (8-bit, non-interlaced, grey/RGB/RGBA: what Chromium writes) ---------- */
function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0, inter = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("latin1", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; inter = data[12]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (depth !== 8 || inter !== 0 || ![0, 2, 6].includes(ctype)) throw new Error("unsupported PNG (depth " + depth + ", type " + ctype + ", interlace " + inter + ")");
  const bpp = { 0: 1, 2: 3, 6: 4 }[ctype], stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[dst - stride + x] : 0, c = x >= bpp && y ? out[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}
/* number of distinct colours (capped) and the share of pixels that are not the most common colour */
function inkOf(img) {
  const seen = new Map();
  for (let i = 0; i < img.px.length; i += img.bpp * 7) {
    const k = img.bpp === 1 ? img.px[i] : (img.px[i] << 16) | (img.px[i + 1] << 8) | img.px[i + 2];
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  let top = 0, n = 0; for (const c of seen.values()) { n += c; if (c > top) top = c; }
  return { colours: seen.size, other: n ? 1 - top / n : 0 };
}

/* ---------- --compare A B ---------- */
if (argv[0] === "--compare") {
  const [A, B] = [argv[1], argv[2]];
  if (!A || !B) { console.error("usage: --compare <folderA> <folderB> [--looks obsidian]"); process.exit(2); }
  const looks = list(arg("looks", "obsidian")), only = arg("only") ? list(arg("only")) : null, maxDiff = +arg("max-diff", "0");
  const files = d => fs.readdirSync(d).filter(f => f.endsWith(".png") && looks.some(l => f.includes("-" + l + "-")) && (!only || only.some(n => f.startsWith(n + "-")))).sort();
  const fa = files(A), fb = new Set(files(B));
  let bad = 0, total = 0, same = 0;
  for (const f of fa) {
    if (!fb.has(f)) { say("FAIL " + f + ": missing in " + B); bad++; continue; }
    const a = decodePng(fs.readFileSync(path.join(A, f))), b = decodePng(fs.readFileSync(path.join(B, f)));
    if (a.w !== b.w || a.h !== b.h) { say(`FAIL ${f}: size ${a.w}x${a.h} vs ${b.w}x${b.h}`); bad++; continue; }
    let diff = 0;
    for (let i = 0; i < a.w * a.h; i++) {
      const j = i * a.bpp; let d = false;
      for (let k = 0; k < Math.min(a.bpp, 3) && !d; k++) if (a.px[j + k] !== b.px[(i * b.bpp) + k]) d = true;
      if (d) diff++;
    }
    total += diff;
    if (diff > maxDiff) { say(`DIFF ${f}: ${diff} of ${a.w * a.h} pixels differ (${(100 * diff / (a.w * a.h)).toFixed(3)}%)`); bad++; } else { say(`SAME ${f}: ${diff} of ${a.w * a.h} pixels differ`); same++; }
  }
  for (const f of fb) if (!fa.includes(f)) { say("FAIL " + f + ": missing in " + A); bad++; }
  say(`compare: ${fa.length} files, ${same} within ${maxDiff} px, ${bad} not, ${total} pixels differ in all`);
  process.exit(bad ? 1 : 0);
}

/* ---------- shots ---------- */
const { launch } = require("./drive");           // needs PLAYWRIGHT=<node_modules path> in the environment
const { quiet, frames, mobile } = require("./waits");

const LOOKS = list(arg("looks", "paper-light,paper-dark,obsidian"));
const SIZES = list(arg("sizes", "desktop,phone"));
const ONLY = arg("only") ? list(arg("only")) : null;
const OBS_SCHEME = arg("obsidian-scheme", "dark");
const opt = {
  obsidian: arg("obsidian"), config: arg("config"), out: arg("out"),
  vault: path.resolve(arg("vault", path.join(__dirname, "..", "test-vault"))),
  pluginDir: path.resolve(arg("plugin-dir", path.join(__dirname, ".."))),
};
if (!opt.obsidian || !opt.config || !opt.out) { console.error("needs --obsidian <binary>, --config <scratch folder> and --out <dir> (or --compare A B); see the header of this file"); process.exit(2); }
for (const l of LOOKS) if (!["paper-light", "paper-dark", "obsidian"].includes(l)) { console.error("unknown look " + l); process.exit(2); }
for (const s of SIZES) if (!["desktop", "phone"].includes(s)) { console.error("unknown size " + s); process.exit(2); }
const OUT = path.resolve(opt.out), CONFIG = path.resolve(opt.config);
if (CONFIG === path.join(process.env.HOME || "", ".config")) { console.error("refusing to use ~/.config"); process.exit(2); }
for (const f of ["main.js", "manifest.json", "styles.css"]) if (!fs.existsSync(path.join(opt.pluginDir, f))) { console.error(`no ${f} in --plugin-dir ${opt.pluginDir} (run: node esbuild.config.mjs production)`); process.exit(2); }

const BOOK = ".workspace-leaf-content[data-type='booklet']";
const SCREENS = [
  { name: "sketch-home", note: "Learning to sketch", screen: "home" },
  { name: "sketch-module", note: "Learning to sketch", screen: "module:basics" },
  { name: "kinds", note: "Every kind", screen: "activity:/kinds" },
  { name: "reading", note: "Reading and steps", screen: "activity:/sources" },
  { name: "reading-steps", note: "Reading and steps", screen: "activity:/lesson", act: "step-next", scrollTo: ".booklet-steps-head" },
  { name: "reading-source", note: "Reading and steps", screen: "activity:/sources", act: "cite", scrollTo: ".booklet-cite-panel" },
  { name: "reading-done", note: "Reading and steps", screen: "activity:/lesson", act: "step-answered", scrollTo: ".booklet-steps-head" },
  { name: "quiz", note: "Study quiz", screen: "activity:/marked", act: "pick" },
  { name: "quiz-multi", note: "Study quiz", screen: "activity:/marked", act: "multi", scrollTo: ".booklet-question[data-booklet-q='primaries']" },
  { name: "kept", note: "Kept records", screen: "activity:walks/walk-log", act: "entries" },
  { name: "daily", note: "Daily tracker", screen: "activity:/evening-log", act: "entries" },
  { name: "pages-menu", note: "Learning to sketch", screen: "activity:basics/light", act: "menu" },
].filter(s => !ONLY || ONLY.includes(s.name));
if (ONLY) for (const n of ONLY) if (!SCREENS.some(s => s.name === n)) { console.error("unknown screen " + n); process.exit(2); }

let pass = 0, fail = 0;
const fact = (ok, text) => { ok ? pass++ : fail++; say((ok ? "PASS " : "FAIL ") + text); };

async function waitActiveBooklet(o, ms) {
  try { await o.page.waitForFunction(() => app.workspace.activeLeaf && app.workspace.activeLeaf.view.getViewType() === "booklet", null, { timeout: ms }); return true; } catch (e) { return false; }
}
async function openNote(o, rel) {
  await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), c = f && app.metadataCache.getFileCache(f); return !!(c && c.frontmatter && c.frontmatter.booklet); }, rel, { timeout: 30000, polling: 100 });
  const openIt = () => o.evaluate(async r => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(r)); }, rel);
  const drawnPage = async ms => { if (!(await waitActiveBooklet(o, ms))) throw new Error("the pane did not become a booklet view"); await o.page.waitForSelector(BOOK + " .booklet-page", { timeout: ms }); };
  await openIt();
  try { await drawnPage(10000); }
  catch (e) {
    await o.evaluate(r => { app.workspace.iterateAllLeaves(l => { const st = l.getViewState(); if (st.type === "booklet" || (st.state && st.state.file === r)) l.detach(); }); }, rel);
    await openIt(); await drawnPage(20000);
  }
  await quiet(o);
}
async function goTo(o, screen) {
  await o.evaluate(async screen => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 2, screen, part: 0 }, active: true }); }, screen);
  await o.page.waitForSelector(BOOK + " .booklet-page[data-booklet-screen='" + screen + "']", { timeout: 8000 });
  await quiet(o);
}
/* what a person does on the screen before it is looked at; each is safe to run twice (the phone pass repeats the desktop pass's answers) */
const ACTS = {
  pick: async o => {   // press the wrong option of the first question so its feedback shows
    const done = await o.evaluate(() => !!document.querySelector(".booklet-question[data-booklet-q='flyer'].booklet-answered-wrong, .booklet-question[data-booklet-q='flyer'].booklet-answered-right"));
    if (!done) { await o.page.locator(BOOK + " .booklet-question[data-booklet-q='flyer'] .booklet-choice", { hasText: "A penguin" }).first().click(); await o.page.waitForSelector(BOOK + " .booklet-question[data-booklet-q='flyer'][class*='booklet-answered']", { timeout: 6000 }); }
  },
  multi: async o => {   // answer the multi-choice question with the right set and press Check, so the right and the missed states show
    const q = BOOK + " .booklet-question[data-booklet-q='primaries']";
    for (const w of ["Red", "Blue", "Yellow"]) {
      const on = await o.evaluate(w => { const c = [...document.querySelectorAll(".booklet-question[data-booklet-q='primaries'] .booklet-choice")].find(x => x.textContent.includes(w)); return c && (c.getAttribute("aria-pressed") === "true" || c.getAttribute("aria-checked") === "true" || c.classList.contains("booklet-picked")); }, w);
      if (!on) await o.page.locator(q + " .booklet-choice", { hasText: w }).first().click();
    }
    await o.page.locator(q + " button", { hasText: "Check" }).first().click().catch(() => {});
    await quiet(o);
  },
  "step-next": async o => {   // one step at a time, answer step one, then press Next so step two shows with step one done
    const one = await o.evaluate(() => !!document.querySelector(".booklet-steps-head"));
    if (!one) { await o.page.locator(BOOK + " .booklet-steps-choice button", { hasText: "One at a time" }).first().click(); await o.page.waitForSelector(BOOK + " .booklet-steps-head", { timeout: 6000 }); await quiet(o); }
    const q = BOOK + " .booklet-step[data-booklet-step='1'] .booklet-question";
    const on = await o.evaluate(() => !!document.querySelector(".booklet-step[data-booklet-step='1'] .booklet-question[class*='booklet-answered']"));
    if (!on) { await o.page.locator(q + " .booklet-choice", { hasText: "The moon" }).first().click().catch(() => {}); await quiet(o); }
    const at = await o.evaluate(() => { const s = document.querySelector(".booklet-step:not([hidden])"); return s && s.getAttribute("data-booklet-step"); });
    if (at === "1") { await o.page.locator(BOOK + " .booklet-pager button", { hasText: "Next" }).first().click(); await quiet(o); }
  },
  cite: async o => {   // the first source number pressed, so its panel (with the verified badge) shows
    const open = await o.evaluate(() => !!document.querySelector(".booklet-cite-panel"));
    if (!open) { await o.page.locator(BOOK + " .booklet-cite-mark").first().click(); await o.page.waitForSelector(BOOK + " .booklet-cite-panel", { timeout: 6000 }); }
  },
  "step-answered": async o => {   // one step at a time, step one answered and left on show, so its card is a done step
    const one = await o.evaluate(() => !!document.querySelector(".booklet-steps-head"));
    if (!one) { await o.page.locator(BOOK + " .booklet-steps-choice button", { hasText: "One at a time" }).first().click(); await o.page.waitForSelector(BOOK + " .booklet-steps-head", { timeout: 6000 }); await quiet(o); }
    const step = await o.evaluate(() => { const s = document.querySelector(".booklet-step:not([hidden])"); return s && s.getAttribute("data-booklet-step"); });
    if (step !== "1") { await o.page.locator(BOOK + " .booklet-pager button", { hasText: "Back" }).first().click(); await quiet(o); }
    const done = await o.evaluate(() => !!document.querySelector(".booklet-step[data-booklet-step='1'] .booklet-question[class*='booklet-answered']"));
    if (!done) { await o.page.locator(BOOK + " .booklet-step[data-booklet-step='1'] .booklet-choice", { hasText: "The moon" }).first().click(); await quiet(o); }
  },
  entries: async o => {   // the kept-entries list open
    await o.evaluate(() => { const b = document.querySelector(".booklet-entries-title"); if (b && b.getAttribute("aria-expanded") !== "true") b.click(); });
    await o.page.waitForSelector(BOOK + " .booklet-entries-title[aria-expanded='true']", { timeout: 6000 });
  },
  menu: async o => {   // the page tree's menu (a drawer on the phone)
    await o.evaluate(() => { const b = document.querySelector(".booklet-pagesbtn"); if (!b) throw new Error("this screen has no Pages button"); if (b.getAttribute("aria-expanded") !== "true") b.click(); });
    await o.page.waitForSelector(BOOK + " .booklet-pagesbtn[aria-expanded='true']", { timeout: 6000 });
  },
};
async function applyLook(o, look) {
  const dark = look === "paper-dark" || (look === "obsidian" && OBS_SCHEME === "dark");
  await o.setScheme(dark ? "dark" : "light");
  await quiet(o);   // a theme change may make the view draw again: only then is the attribute set
  await o.evaluate(l => document.querySelectorAll(".booklet-view").forEach(el => { el.dataset.bookletLook = l; }), look);
  await frames(o);
  await o.evaluate(() => document.fonts.ready);
}

(async () => {
  const t0 = Date.now();
  const work = path.join(OUT, ".work-" + Date.now()), vault = path.join(work, "vault"), plug = path.join(vault, ".obsidian", "plugins", "booklet");
  fs.mkdirSync(OUT, { recursive: true });
  fs.cpSync(opt.vault, vault, { recursive: true });
  fs.mkdirSync(plug, { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(opt.pluginDir, f), path.join(plug, f));
  fs.writeFileSync(path.join(vault, ".obsidian", "community-plugins.json"), JSON.stringify(["booklet"]));
  say(`vault copy ${vault}\nplugin from ${opt.pluginDir} (main.js ${fs.statSync(path.join(plug, "main.js")).size} bytes, styles.css ${fs.statSync(path.join(plug, "styles.css")).size} bytes)\nout ${OUT}`);
  const o = await launch({ obsidian: opt.obsidian, vault, configDir: CONFIG, timeout: 90000 });
  const bye = () => { o.close().catch(() => {}).finally(() => process.exit(130)); };
  process.on("SIGINT", bye); process.on("SIGTERM", bye);
  try {
    const cdp = await o.page.context().newCDPSession(o.page);
    for (const size of SIZES) {
      if (size === "phone") {
        await mobile(o, true);
        await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
      } else {
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
      }
      await o.page.waitForFunction(() => app.plugins.plugins.booklet, null, { timeout: 15000 });
      await new Promise(r => setTimeout(r, 500));
      let lastNote = null;
      for (const sc of SCREENS) {
        try {
          if (lastNote !== sc.note) { await openNote(o, sc.note + ".booklet.md"); lastNote = sc.note; }
          await goTo(o, sc.screen);
          if (await o.evaluate(() => !!document.querySelector(".booklet-allow-card"))) await o.evaluate(() => { const b = [...document.querySelectorAll(".booklet-allow-card button")].find(x => x.textContent === "Not now"); b && b.click(); });
          if (sc.act) { await ACTS[sc.act](o); await quiet(o); }
          await o.evaluate(() => { for (const e of document.querySelectorAll(".booklet-view, .workspace-leaf-content[data-type='booklet'] .view-content")) e.scrollTop = 0; });
          if (sc.scrollTo) { await o.evaluate(sel => { const q = document.querySelector(sel); if (!q) return; q.scrollIntoView({ block: "start" }); for (let e = q.parentElement; e; e = e.parentElement) { const own = e.matches(".booklet-view, .view-content"); if (!own && e.scrollTop) e.scrollTop = 0; if (own && e.scrollTop > 120) e.scrollTop -= 120; } }, sc.scrollTo); await new Promise(r => setTimeout(r, 200)); }
        } catch (e) {
          for (const look of LOOKS) fact(false, `${sc.name}-${look}-${size}: could not reach the screen: ${String(e.message).split("\n")[0]}`);
          lastNote = null; continue;
        }
        for (const look of LOOKS) {
          const file = path.join(OUT, `${sc.name}-${look}-${size}.png`);
          try {
            fs.rmSync(file, { force: true });
            await applyLook(o, look);
            const attr = await o.evaluate(() => [...document.querySelectorAll(".booklet-view")].map(e => e.dataset.bookletLook).join(","));
            // the same pointer and focus state in every shot, so a difference between two builds is a difference in the drawing
            await o.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
            if (o.page && o.page.mouse) await o.page.mouse.move(1, 1);
            await new Promise(r => setTimeout(r, 250));
            await o.screenshot(file);
            const st = fs.statSync(file), img = decodePng(fs.readFileSync(file)), ink = inkOf(img);
            const ok = st.size > 4000 && ink.colours > 8 && ink.other > 0.01 && attr === look;
            fact(ok, `${path.basename(file)} ${img.w}x${img.h}, ${st.size} bytes, ${ink.colours} colours, ${(100 * ink.other).toFixed(0)}% non-background${attr === look ? "" : ", look attribute reads '" + attr + "'"}`);
          } catch (e) { fact(false, `${path.basename(file)}: ${String(e.message).split("\n")[0]}`); }
        }
      }
    }
  } finally {
    await o.close().catch(() => {});
    fs.rmSync(work, { recursive: true, force: true });
  }
  say(`${pass} passed, ${fail} failed, ${pass + fail} shots in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
