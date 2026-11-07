// "Reduce motion" in a real Obsidian (plugin 1.0.3): with prefers-reduced-motion: reduce emulated, nothing the plugin draws may transition,
// animate or scroll smoothly. Run by hand:
//   PLAYWRIGHT=<node_modules> node reduced-motion-103.js --obsidian <binary> --out <dir> [--tag name] [--vault ../test-vault] [--dry] [--help]
// Not part of plugin-check.js. One Obsidian at a time, on a scratch config and a vault made of the repository's made-up notes
// (test-vault/Every kind, test/page-notes/Keyboard walk, Garden dashboards, Check-in with a wiki, and a Listening note with media).
// (E2E_PORT_RANGE="9341-9349" keeps the debugging port inside a range of your own; drive.js reads it.)
//
// How. The media feature is set over the Chrome DevTools Protocol (Emulation.setEmulatedMedia, prefers-reduced-motion: reduce), and
// checked in the page with matchMedia. For each screen the script visits it reads, for EVERY element under the root (and the ::before and
// ::after of each), getComputedStyle: transition-duration, transition-property, animation-name, animation-duration and scroll-behavior,
// once with the feature emulated ('reduce') and once not ('no-preference'). The roots are `.booklet-view` (the view in the pane, the first
// group) and `.booklet-allow` (the Allow card and its dim backdrop, which sit in the window outside the view: the second group). The
// Now playing bar (`.booklet-nowplaying`) is measured too and reported, but is not part of the verdict (it was not in the brief).
// An element is flagged when any value of its transition-duration is not 0s, or its animation-name is not none, or its scroll-behavior is
// not auto. A pseudo-element is flagged as a failure only if it draws something (its content is not none/normal); the others are listed.
// Without the emulation the same reading must find elements that DO transition, or the test could not see an animation and says nothing:
// it fails when that count is 0 (for the view and for the card each). The card is read in its three forms (opened by a note that names a
// site, by the Allow list button, by a press on blocked media).
// Output: <out>/<tag>-<group>-NN-<screen>-reduce.png (one per screen, reduced) and <out>/<tag>-reduced-motion.json (every flagged element).
// Exit 1 on any FAIL.
const fs = require("fs"), path = require("path");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const USAGE = "usage: PLAYWRIGHT=<node_modules> node reduced-motion-103.js --obsidian <binary> --out <dir> [--tag name] [--vault ../test-vault] [--dry] [--help]";
if (process.argv.includes("--help") || process.argv.includes("-h")) { console.log(USAGE); process.exit(0); }
const opt = { obsidian: arg("obsidian"), out: arg("out"), vault: arg("vault", path.join(__dirname, "..", "test-vault")), tag: arg("tag", "run") };
const dry = process.argv.includes("--dry");
if (!opt.out || (!opt.obsidian && !dry)) { console.error("needs --obsidian <binary> and --out <dir>\n" + USAGE); process.exit(2); }
const SRC_VAULT = path.resolve(opt.vault), OUT = path.resolve(opt.out);
const REPO = path.join(__dirname, "..");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const read = f => fs.readFileSync(f, "utf8");
const NOTE_FILES = {
  "Every kind.booklet.md": path.join(REPO, "test-vault", "Every kind.booklet.md"),
  "Keyboard walk.booklet.md": path.join(REPO, "test", "page-notes", "Keyboard walk.booklet.md"),
  "Check-in with a wiki.booklet.md": path.join(REPO, "test", "page-notes", "Check-in with a wiki.booklet.md"),
  "Garden dashboards.booklet.md": path.join(REPO, "test", "page-notes", "Garden dashboards.booklet.md"),
  "media/tone.wav": path.join(REPO, "test", "page-notes", "Screen reader walk", "media", "tone.wav"),
};

if (dry) {
  const need = [...["main.js", "manifest.json", "styles.css"].map(f => path.join(SRC_VAULT, ".obsidian", "plugins", "booklet", f)), ...Object.values(NOTE_FILES)];
  let bad = 0;
  for (const f of need) { const ok = fs.existsSync(f); if (!ok) bad++; say((ok ? "ok   " : "MISSING ") + f); }
  if (opt.obsidian) { const ok = fs.existsSync(path.resolve(opt.obsidian)); if (!ok) bad++; say((ok ? "ok   " : "MISSING ") + "obsidian binary " + path.resolve(opt.obsidian)); }
  try { require("./drive"); require("./waits"); require("./media-lib"); say("ok   harness modules load"); } catch (e) { bad++; say("MISSING harness module: " + e.message); }
  const P = process.env.PLAYWRIGHT; let pwOk = false;
  for (const c of P ? [P, path.join(P, "playwright-core"), path.join(P, "node_modules", "playwright-core")] : ["playwright-core"]) { try { require(c); pwOk = true; break; } catch (e) { /* next */ } }
  if (!pwOk) bad++;
  say((pwOk ? "ok   " : "MISSING ") + "playwright-core (PLAYWRIGHT=" + P + ")");
  say("would write to " + OUT + " with tag " + opt.tag);
  say(bad ? "dry run: " + bad + " problem(s)" : "dry run: ok");
  process.exit(bad ? 1 : 0);
}

const { launch } = require("./drive");
const { quiet } = require("./waits");
fs.mkdirSync(OUT, { recursive: true });
const WORK = path.join(OUT, "work-" + Date.now());
let pass = 0, fail = 0;
const fact = (ok, text, extra) => { ok ? pass++ : fail++; say((ok ? "PASS " : "FAIL ") + text + (extra ? "  " + extra : "")); };
const BOOK = ".workspace-leaf-content[data-type='booklet']";

const consoleReport = [], sessions = [];
const env = { launch, opt: { obsidian: opt.obsidian }, WORK, consoleReport, sessions, SRC_VAULT, SHOTS: OUT, BOOK };
const { withMedia } = require("./media-lib")(env);

const listeningNote = ctx => `---\nbooklet: "0.19"\nid: booklet-test/reduced-motion\ntitle: Listening\nlang: en\nmedia-from:\n  - ${ctx.url("declared.example.org")}\n---\n\n> [!activity|a1] Listening and watching\n\nAllowed clip: ![the allowed clip](${ctx.url("vault.example.org", "tone-60s.wav")})\n\nBlocked clip: ![the blocked clip](${ctx.url("blocked.example.net", "tone-5s.wav")})\n\n> [!choice|q1] A question?\n- [ ] Yes\n- [ ] No\n\n> [!activity|a2] Second activity\n\n> [!choice|q2] Another question?\n- [ ] Yes\n- [ ] No\n`;

/* in the page: every element under the roots, and its ::before and ::after, read for the three kinds of motion */
const MEASURE = roots => {
  const zero = v => String(v).split(",").every(x => parseFloat(x) === 0);
  const nameOf = e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.getAttribute("class") ? "." + String(e.getAttribute("class")).split(/\s+/).filter(Boolean).slice(0, 3).join(".") : "");
  const pathOf = (e, root) => { const p = []; for (let x = e; x && p.length < 5; x = x.parentElement) { p.unshift(nameOf(x)); if (x === root) break; } return p.join(" > "); };
  const out = { elements: 0, pseudos: 0, withTransition: 0, flagged: [], listed: [], oneOffs: 0 };
  const seen = new Set();
  for (const sel of roots) for (const root of document.querySelectorAll(sel)) {
    for (const el of [root, ...root.querySelectorAll("*")]) {
      if (seen.has(el)) continue; seen.add(el);
      out.elements++;
      for (const ps of [null, "::before", "::after"]) {
        const cs = getComputedStyle(el, ps);
        const rendered = ps === null ? true : (cs.content !== "none" && cs.content !== "normal");
        if (ps) out.pseudos++;
        const td = cs.transitionDuration, an = cs.animationName, sb = cs.scrollBehavior;
        if (!ps && !zero(td)) out.withTransition++;
        const bad = [];
        if (!zero(td)) bad.push(["transition-duration", td, cs.transitionProperty]);
        if (!String(an).split(",").every(x => x.trim() === "none")) bad.push(["animation-name", an, cs.animationDuration]);
        if (sb !== "auto") bad.push(["scroll-behavior", sb, ""]);
        for (const [prop, value, extra] of bad) {
          const rec = { path: pathOf(el, root) + (ps || ""), root: sel, property: prop, value, extra, pseudo: ps || "", rendered };
          (rendered ? out.flagged : out.listed).push(rec);
        }
      }
    }
  }
  return out;
};

(async () => {
  say("Obsidian:", opt.obsidian, "tag", opt.tag);
  const result = { tag: opt.tag, screens: [] };
  const files = ctx => {
    const f = { "Listening.booklet.md": listeningNote(ctx) };
    for (const [rel, p] of Object.entries(NOTE_FILES)) f[rel] = rel.endsWith(".wav") ? fs.readFileSync(p) : read(p);
    return f;
  };
  await withMedia("reduced-motion", { note: "Every kind.booklet.md", files, data: ctx => ({ allowedMediaHosts: [ctx.host("vault.example.org"), ctx.host("media.example.org")], noteAllows: {} }) }, async (o, ctx) => {
    const version = await o.evaluate(() => (navigator.userAgent.match(/obsidian\/([\d.]+)/i) || [])[1]);
    say("version", version); result.version = version;
    const cdp = await o.page.context().newCDPSession(o.page);
    const emulate = async reduce => {
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }] });
      await o.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    };
    const reduced = () => o.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    await emulate(true); const on = await reduced();
    await emulate(false); const off = await reduced();
    fact(on === true && off === false, `the emulation works: matchMedia(prefers-reduced-motion: reduce) is ${on} when emulated and ${off} when not`);

    const open = async rel => {
      await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
      await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, rel, { timeout: 30000, polling: 100 });
      await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, rel);
      await o.page.waitForFunction(() => { const l = app.workspace.getLeavesOfType("booklet")[0]; return !!(l && l.view.contentEl.querySelector(".booklet-page")); }, null, { timeout: 20000, polling: 100 });
      await sleep(400); await quiet(o);
    };
    const go = async st => { await o.evaluate(async st => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 2, ...st }, active: true }); }, st); await sleep(500); await quiet(o); };
    const cardOpen = () => o.evaluate(() => !!document.querySelector(".booklet-allow-card"));
    const closeCard = async () => { await o.evaluate(() => { const c = document.querySelector(".booklet-allow-card"); const b = c && [...c.querySelectorAll("button")].find(x => /^(Not now|Close)$/.test(x.textContent)); b && b.click(); }); await sleep(350); };
    // a screen is read under both settings, in the same state: reduced first, then not (so a transition the emulation stopped is not mistaken)
    const measure = async (group, name, roots) => {
      const rec = { group, screen: name, roots };
      await emulate(true); rec.reduce = await o.evaluate(MEASURE, roots);
      await o.screenshot(path.join(OUT, `${opt.tag}-${group}-${String(result.screens.length).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-")}-reduce.png`)).catch(() => {});
      await emulate(false); rec.normal = await o.evaluate(MEASURE, roots);
      result.screens.push(rec);
      say(`INFO [${group}] ${name}: ${rec.reduce.elements} elements (${rec.reduce.pseudos} pseudo-elements read); with reduce: ${rec.reduce.flagged.length} flagged, ${rec.reduce.listed.length} not-drawn pseudo listed; without: ${rec.normal.withTransition} elements transition`);
      return rec;
    };

    // ---- the view ----
    const V = [".booklet-view"];
    await open("Every kind.booklet.md");
    await measure("view", "Every kind: home", V);
    await open("Keyboard walk.booklet.md");
    await go({ screen: "activity:/walk", part: 0 }); await measure("view", "Keyboard walk: every question kind", V);
    await go({ screen: "activity:/tally", part: 0 }); await measure("view", "Keyboard walk: kept days", V);
    await open("Check-in with a wiki.booklet.md");
    await go({ screen: "activity:calm/check-in", tab: "wiki", part: 5 }); await measure("view", "Check-in: a wiki page", V);
    await o.evaluate(() => { const b = document.querySelector(".booklet-pagesbtn"); if (b && b.getAttribute("aria-expanded") !== "true") b.click(); }); await sleep(450);
    await measure("view", "Check-in: Pages panel open", V);
    await o.evaluate(() => { const b = document.querySelector(".booklet-pagesbtn"); if (b && b.getAttribute("aria-expanded") === "true") b.click(); });
    await open("Garden dashboards.booklet.md");
    for (const a of ["bars", "lines", "data", "kept"]) { await go({ screen: "activity:/" + a, part: 0 }); await measure("view", "Garden dashboards: " + a, V); }
    // the query's sort and filter bar opened (its sort buttons carry a `transition: none` of their own)
    await go({ screen: "activity:/kept", part: 0 });
    await o.evaluate(() => { const t = document.querySelector(".booklet-qc-toggle"); t && t.click(); }); await sleep(300);
    await measure("view", "Garden dashboards: kept, sort and filter bar open", V);

    // ---- the Allow card, in its three forms ----
    const C = [".booklet-allow"];
    await open("Listening.booklet.md");
    const auto = await o.page.waitForFunction(() => !!document.querySelector(".booklet-allow-card"), null, { timeout: 6000 }).then(() => true).catch(() => false);
    await sleep(700);
    if (auto) { await measure("card", "Allow card: opened by a note that names a site", C); await closeCard(); } else say("INFO the Listening note did not open the card on its own");
    await go({ screen: "activity:/a1", part: 0 });
    await o.evaluate(() => { const b = document.querySelector(".booklet-allow-btn"); b && b.click(); }); await sleep(500);
    if (await cardOpen()) { await measure("card", "Allow card: the list (Allow list button)", C); await closeCard(); } else say("INFO the Allow list button did not open the card");
    await o.page.locator(BOOK + " .booklet-media-play", { hasText: "blocked clip" }).first().click({ timeout: 5000 }).catch(e => say("INFO press: " + e.message.slice(0, 80))); await sleep(500);
    if (await cardOpen()) { await measure("card", "Allow card: a press on blocked media", C); await closeCard(); } else say("INFO a press on blocked media did not open the card");

    // ---- the Now playing bar (reported, not part of the verdict) ----
    await go({ screen: "activity:/a1", part: 0 });
    await o.page.locator(BOOK + " .booklet-media-play", { hasText: "allowed clip" }).first().click({ timeout: 5000 }).catch(e => say("INFO press: " + e.message.slice(0, 80))); await sleep(900);
    await go({ screen: "activity:/a2", part: 0 });
    if (await o.evaluate(() => !!document.querySelector(".booklet-nowplaying"))) await measure("extra", "Now playing bar", [".booklet-nowplaying"]); else say("INFO no Now playing bar appeared");
    await emulate(false);
  });

  // ---- the verdicts ----
  const sum = (group, mode, key) => result.screens.filter(s => s.group === group).reduce((n, s) => n + (Array.isArray(s[mode][key]) ? s[mode][key].length : s[mode][key]), 0);
  const dedupe = list => { const m = new Map(); for (const r of list) { const k = [r.path, r.property, r.value].join("|"); m.set(k, { ...r, n: (m.get(k)?.n || 0) + 1, screens: [...new Set([...(m.get(k)?.screens || []), r.screen])] }); } return [...m.values()]; };
  for (const group of ["view", "card"]) {
    const label = group === "view" ? "the Booklet view (.booklet-view)" : "the Allow card (.booklet-allow)";
    const screens = result.screens.filter(s => s.group === group);
    const flagged = dedupe(screens.flatMap(s => s.reduce.flagged.map(r => ({ ...r, screen: s.screen }))));
    const listed = dedupe(screens.flatMap(s => s.reduce.listed.map(r => ({ ...r, screen: s.screen }))));
    const nonzero = sum(group, "normal", "withTransition");
    result[group] = { screens: screens.length, elementsReduce: sum(group, "reduce", "elements"), elementsNormal: sum(group, "normal", "elements"), transitioningNormal: nonzero, flagged, listed };
    say(`\n${label}: ${screens.length} screen(s), ${result[group].elementsReduce} element reads with reduce (${sum(group, "reduce", "pseudos")} pseudo-element reads), ${result[group].elementsNormal} without`);
    fact(screens.length > 0 && result[group].elementsReduce > 0, `${label}: elements were measured (${screens.length} screens, ${result[group].elementsReduce} elements)`);
    fact(nonzero > 0, `${label}: without the emulation ${nonzero} element(s) have a non-zero transition, so the test can see motion${nonzero ? "" : " (0: the test is vacuous)"}`);
    fact(flagged.length === 0, `${label}: with reduced motion, no element has a transition-duration other than 0s, an animation-name other than none, or a scroll-behavior other than auto (${flagged.length} distinct, ${screens.reduce((n, s) => n + s.reduce.flagged.length, 0)} reads)`);
    for (const r of flagged.slice(0, 60)) say(`  FLAGGED ${r.path}  ${r.property}: ${r.value}${r.extra ? " (" + r.extra + ")" : ""}  x${r.n}  [${r.screens.join("; ")}]`);
    if (flagged.length > 60) say(`  ... ${flagged.length - 60} more in the JSON`);
    for (const r of listed.slice(0, 10)) say(`  INFO pseudo-element that draws nothing, same values: ${r.path}  ${r.property}: ${r.value}`);
  }
  const extra = result.screens.filter(s => s.group === "extra");
  for (const s of extra) {
    const f = dedupe(s.reduce.flagged.map(r => ({ ...r, screen: s.screen })));
    say(`\nINFO ${s.screen} (not part of the verdict): ${s.reduce.elements} elements; with reduce ${f.length} distinct flagged; without ${s.normal.withTransition} elements transition`);
    for (const r of f.slice(0, 20)) say(`  INFO flagged ${r.path}  ${r.property}: ${r.value}`);
    result.extra = { ...(result.extra || {}), [s.screen]: { flagged: f, transitioningNormal: s.normal.withTransition } };
  }
  say(`done; ${pass} passed, ${fail} failed`);
  fs.writeFileSync(path.join(OUT, opt.tag + "-reduced-motion.json"), JSON.stringify({ ...result, pass, fail, console: consoleReport.filter(c => !/harness noise/.test(c.kind)) }, null, 1));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
