// The focus ring the plugin's screens actually show, measured in a real Obsidian (plugin 1.0.0, lane E2). Run by hand, once for each version:
//   PLAYWRIGHT=<node_modules> node focus-ring-100.js --obsidian <binary> --out <dir> [--tag name] [--vault ../test-vault]
// Not part of plugin-check.js. On a vault of the repository's made-up notes it presses the real Tab key through each screen (the opening screen,
// a wiki page with the Pages panel, every question kind, the kept-days views, the dashboards, the Allow card, the Now playing bar), in the light and
// the dark theme, and for every stop records the ring the control shows: an outline or a box shadow, its colour, the colour of the surface behind
// it (every ancestor's background laid over the others) and the WCAG contrast ratio of the two. WCAG 2.2 asks 3:1 of a focus indicator (1.4.11).
// Whose ring it is is read, not guessed: the ring is measured again with the plugin's own stylesheet switched off, and a ring that changes is
// the plugin's, one that does not is Obsidian's own. The result is a table by control and theme, and `<out>/<tag>-focus-ring.json`.
const fs = require("fs"), path = require("path");
const { launch } = require("./drive");
const { quiet, bookletPage } = require("./waits");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const opt = { obsidian: arg("obsidian"), out: arg("out"), vault: arg("vault", path.join(__dirname, "..", "test-vault")), tag: arg("tag", "run") };
if (!opt.obsidian || !opt.out) { console.error("needs --obsidian <binary> and --out <dir>"); process.exit(2); }
const SRC_VAULT = path.resolve(opt.vault), OUT = path.resolve(opt.out);
fs.mkdirSync(OUT, { recursive: true });
const WORK = path.join(OUT, "work-" + Date.now());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const BOOK = ".workspace-leaf-content[data-type='booklet']";

const consoleReport = [], sessions = [];
const env = { launch, opt: { obsidian: opt.obsidian }, WORK, consoleReport, sessions, SRC_VAULT, SHOTS: OUT, BOOK };
const { withMedia } = require("./media-lib")(env);

const REPO = path.join(__dirname, "..");
const read = f => fs.readFileSync(f, "utf8");
const NOTES = {
  "Every kind.booklet.md": read(path.join(REPO, "test-vault", "Every kind.booklet.md")),
  "Keyboard walk.booklet.md": read(path.join(REPO, "test", "page-notes", "Keyboard walk.booklet.md")),
  "Check-in with a wiki.booklet.md": read(path.join(REPO, "test", "page-notes", "Check-in with a wiki.booklet.md")),
  "Garden dashboards.booklet.md": read(path.join(REPO, "test", "page-notes", "Garden dashboards.booklet.md")),
  "media/tone.wav": fs.readFileSync(path.join(REPO, "test", "page-notes", "Screen reader walk", "media", "tone.wav")),
};
const mediaNote = ctx => `---\nbooklet: "0.19"\nid: booklet-test/ring-media\ntitle: Listening\nlang: en\nmedia-from:\n  - ${ctx.url("declared.example.org")}\n---\n\n> [!activity|a1] Listening and watching\n\nAllowed clip: ![the allowed clip](${ctx.url("vault.example.org", "tone-60s.wav")})\n\nBlocked clip: ![the blocked clip](${ctx.url("blocked.example.net", "tone-5s.wav")})\n\n> [!choice|q1] A question?\n- [ ] Yes\n- [ ] No\n\n> [!activity|a2] Second activity\n\n> [!choice|q2] Another question?\n- [ ] Yes\n- [ ] No\n`;

// in the page: the ring of the focused element and the surface behind it
const RING = () => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const px = (c, back) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = back; cx.fillRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
  const parse = c => {
    if (!c || c === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    const w = px(c, "#fff"), k = px(c, "#000");
    const a = Math.min(1, Math.max(0, 1 - ((w[0] - k[0]) + (w[1] - k[1]) + (w[2] - k[2])) / (3 * 255)));
    if (a <= 0.003) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: Math.round(k[0] / a), g: Math.round(k[1] / a), b: Math.round(k[2] / a), a };
  };
  const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = c => "#" + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
  const behind = el => {
    const chain = []; for (let p = el.parentElement; p; p = p.parentElement) chain.push(p);
    let col = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = chain.length - 1; i >= 0; i--) { const b = parse(getComputedStyle(chain[i]).backgroundColor); if (b.a > 0) col = over(b, col); }
    return col;
  };
  const measure = el => {
    const cs = getComputedStyle(el), surface = behind(el), rings = [];
    if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) { const c = parse(cs.outlineColor); if (c.a > 0.003) rings.push({ kind: "outline " + cs.outlineWidth + (parseFloat(cs.outlineOffset) ? " offset " + cs.outlineOffset : ""), c }); }
    if (cs.boxShadow && cs.boxShadow !== "none") {
      // computed form: "rgb(a, b, c) 0px 0px 0px 2px, rgb(...) ..." (split outside the brackets)
      const parts = []; let depth = 0, cur = "";
      for (const ch of cs.boxShadow) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && !depth) { parts.push(cur.trim()); cur = ""; } else cur += ch; }
      if (cur.trim()) parts.push(cur.trim());
      for (const s of parts) {
        if (/inset/.test(s)) continue;
        const m = /^(rgba?\([^)]*\)|#\w+|\w+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?/.exec(s);
        if (!m) continue;
        const blur = parseFloat(m[4]), spread = parseFloat(m[5] || "0");
        if (spread > 0 && blur === 0) { const c = parse(m[1]); if (c.a > 0.003) rings.push({ kind: "shadow " + spread + "px", c }); }
      }
    }
    return { rings: rings.map(r => { const solid = over(r.c, surface); return { kind: r.kind, color: hex(solid), ratio: ratio(solid, surface) }; }), surface: hex(surface) };
  };
  const key = e => { const c = (e.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 2).join("."); return e.tagName.toLowerCase() + (e.type && e.tagName === "INPUT" ? "[" + e.type + "]" : "") + (c ? "." + c : ""); };
  const e = document.activeElement;
  if (!e || e === document.body) return null;
  window.__rid = window.__rid || 0; if (!e.__rid) e.__rid = ++window.__rid;
  const now = measure(e);
  // the plugin's own stylesheet off: the ring that stays is Obsidian's
  const sheets = [...document.styleSheets].filter(s => s.ownerNode && /\.booklet-view/.test(s.ownerNode.textContent || ""));
  for (const s of sheets) s.disabled = true;
  const off = measure(e);
  for (const s of sheets) s.disabled = false;
  const sig = m => JSON.stringify(m.rings.map(r => [r.kind, r.color]));
  const best = a => a.rings.length ? Math.max(...a.rings.map(r => r.ratio)) : 0;
  return { rid: e.__rid, key: key(e), name: (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40), inCard: !!e.closest(".booklet-allow-card"), inView: !!e.closest(".booklet-view"), surface: now.surface, rings: now.rings, ratio: best(now), owner: sig(now) === sig(off) ? "obsidian" : "plugin", offRatio: best(off), offRings: off.rings, sheets: sheets.length };
};

const key = async (o, k) => { await o.page.keyboard.press(k); await sleep(45); };
const bookletReady = async (o, rel) => {
  await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
  await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, rel, { timeout: 30000, polling: 100 });
  await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, rel);
  await o.page.waitForFunction(() => { const l = app.workspace.getLeavesOfType("booklet")[0]; return !!(l && l.view.contentEl.querySelector(".booklet-page")); }, null, { timeout: 20000, polling: 100 });
  await sleep(400); await quiet(o);
};
const goPlace = async (o, st) => { await o.evaluate(async st => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 2, ...st }, active: true }); }, st); await sleep(500); await quiet(o); };
const closeCard = o => o.evaluate(() => { const c = document.querySelector(".booklet-allow-card"); const b = c && [...c.querySelectorAll("button")].find(x => /^(Not now|Close)$/.test(x.textContent)); b && b.click(); });

const rows = [];
// every stop of a Tab walk through `rootSel`, in both themes
async function walk(o, name, rootSel, { limit = 70, modal = false, start = null } = {}) {
  for (const scheme of ["light", "dark"]) {
    await o.setScheme(scheme); await sleep(350);
    if (start) await start();
    else await o.evaluate(() => { const h = document.querySelector(".workspace-tab-header.is-active"); h && h.focus(); });
    await sleep(80);
    const seen = new Set(); let n = 0;
    for (let i = 0; i < limit; i++) {
      await key(o, "Tab");
      const inRoot = await o.evaluate(sel => { const r = document.querySelector(sel), a = document.activeElement; return !!(r && a && r.contains(a)); }, rootSel);
      if (!inRoot) { if (n) break; else continue; }
      await sleep(260); // Obsidian eases a ring in over 150 ms: the ring is read once it has settled
      const r = await o.evaluate(RING);
      if (!r) continue;
      const id = r.rid;
      if (seen.has(id)) { if (modal) break; continue; }
      seen.add(id); n++;
      rows.push({ screen: name, scheme, ...r });
    }
    say(`${name} (${scheme}): ${n} stops`);
  }
  await o.setScheme("light"); await sleep(200);
}

(async () => {
  await withMedia("ring", { note: "Garden dashboards.booklet.md", data: ctx => ({ allowedMediaHosts: [ctx.host("vault.example.org"), ctx.host("media.example.org")], noteAllows: {} }), files: ctx => ({ ...NOTES, "Listening.booklet.md": mediaNote(ctx) }) }, async (o, ctx) => {
    const version = await o.evaluate(() => (navigator.userAgent.match(/obsidian\/([\d.]+)/i) || [])[1]);
    say("Obsidian " + version);
    const root = BOOK + " .view-content";
    await bookletReady(o, "Every kind.booklet.md");
    await walk(o, "home", root);
    await bookletReady(o, "Check-in with a wiki.booklet.md");
    await goPlace(o, { screen: "activity:calm/check-in", tab: "wiki", part: 5 });
    await walk(o, "wiki page (tabs)", root);
    await o.evaluate(() => { const b = document.querySelector(".booklet-pagesbtn"); if (b.getAttribute("aria-expanded") !== "true") b.click(); }); await sleep(450);
    await walk(o, "Pages panel open", root);
    await o.evaluate(() => { const b = document.querySelector(".booklet-pagesbtn"); if (b.getAttribute("aria-expanded") === "true") b.click(); });
    await bookletReady(o, "Keyboard walk.booklet.md");
    await goPlace(o, { screen: "activity:/walk", part: 0 });
    await walk(o, "every question kind", root, { limit: 120 });
    await goPlace(o, { screen: "activity:/tally", part: 0 });
    await walk(o, "kept days", root, { limit: 120 });
    await bookletReady(o, "Garden dashboards.booklet.md");
    for (const a of ["bars", "lines", "kept", "data"]) { await goPlace(o, { screen: "activity:/" + a, part: 0 }); await walk(o, "dashboards: " + a, root, { limit: 80 }); }
    // the Allow card, in its three forms
    await bookletReady(o, "Listening.booklet.md");
    await o.page.waitForFunction(() => !!document.querySelector(".booklet-allow-card"), null, { timeout: 6000 }).catch(() => {});
    if (await o.evaluate(() => !!document.querySelector(".booklet-allow-card"))) {
      await walk(o, "Allow card: sites a note names", ".booklet-allow", { modal: true, start: async () => { await o.evaluate(() => document.querySelector(".booklet-allow-card h2").focus()); } });
      await closeCard(o); await sleep(300);
    }
    await goPlace(o, { screen: "activity:/a1", part: 0 });
    await o.page.locator(BOOK + " .booklet-media-play", { hasText: "blocked clip" }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(500);
    if (await o.evaluate(() => !!document.querySelector(".booklet-allow-card"))) { await walk(o, "Allow card: a press on blocked media", ".booklet-allow", { modal: true, start: async () => { await o.evaluate(() => document.querySelector(".booklet-allow-card h2").focus()); } }); await closeCard(o); await sleep(300); }
    await o.evaluate(() => { const b = document.querySelector(".booklet-allow-btn"); b && b.click(); }); await sleep(450);
    if (await o.evaluate(() => !!document.querySelector(".booklet-allow-card"))) { await walk(o, "Allow card: the list", ".booklet-allow", { modal: true, start: async () => { await o.evaluate(() => document.querySelector(".booklet-allow-card h2").focus()); } }); await closeCard(o); await sleep(300); }
    // the Now playing bar
    await goPlace(o, { screen: "activity:/a1", part: 0 });
    await o.page.locator(BOOK + " .booklet-media-play", { hasText: "allowed clip" }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(900);
    await goPlace(o, { screen: "activity:/a2", part: 0 });
    if (await o.evaluate(() => !!document.querySelector(".booklet-nowplaying"))) {
      await walk(o, "Now playing bar", ".booklet-nowplaying", { start: async () => { await o.evaluate(() => { const b = document.querySelector(".booklet-nowplaying button, .booklet-nowplaying audio"); b && b.focus(); }); } });
      await o.evaluate(() => { const b = document.querySelector(".booklet-nowplaying"); const c = b && [...b.querySelectorAll("button")].find(x => /close/i.test(x.textContent + x.getAttribute("aria-label"))); c && c.click(); }); await sleep(300);
    }
    // Obsidian's own Settings page: the plugin's rows
    await o.evaluate(async () => { await app.setting.open(); await app.setting.openTabById("booklet"); }); await sleep(1000);
    const inMain = await o.evaluate(() => !!document.querySelector(".vertical-tab-content"));
    if (inMain) await bookletPage(o.page); // Obsidian 1.13 and later: the entry's page holds the rows
    if (inMain) await walk(o, "Settings page (Booklet)", ".vertical-tab-content", { limit: 20, start: async () => { await o.evaluate(() => { const t = document.querySelector(".vertical-tab-content"); const f = t.querySelector("button, input"); f && f.focus(); }); } });
    await o.evaluate(() => app.setting.close && app.setting.close());
    fs.writeFileSync(path.join(OUT, opt.tag + "-focus-ring.json"), JSON.stringify({ version, rows }, null, 1));
  });

  // a table by control and theme: the lowest ratio of the ring it showed, and whose ring it was
  const by = new Map();
  for (const r of rows) {
    const k = [r.owner, r.key, r.scheme].join("|");
    const cur = by.get(k) || { owner: r.owner, key: r.key, scheme: r.scheme, n: 0, min: 99, ring: "", surface: "", screens: new Set() };
    cur.n++; cur.screens.add(r.screen);
    if (r.ratio < cur.min) { cur.min = r.ratio; cur.ring = r.rings.length ? r.rings.map(x => x.kind + " " + x.color).join(" + ") : "none"; cur.surface = r.surface; }
    by.set(k, cur);
  }
  const list = [...by.values()].sort((a, b) => a.min - b.min);
  say("\nowner     control                                   theme  stops  lowest  ring (colour)                       surface");
  for (const c of list) say(`${c.owner.padEnd(9)} ${c.key.slice(0, 40).padEnd(41)} ${c.scheme.padEnd(5)} ${String(c.n).padStart(5)}  ${c.min.toFixed(2).padStart(5)}  ${c.ring.slice(0, 35).padEnd(35)} ${c.surface}`);
  const weakP = list.filter(c => c.owner === "plugin" && c.min < 3), weakO = list.filter(c => c.owner === "obsidian" && c.min < 3);
  say(`\nthe plugin's own rings under 3:1: ${weakP.length} control/theme pairs; Obsidian's own under 3:1: ${weakO.length}; stops measured: ${rows.length}; stops with no ring: ${rows.filter(r => !r.rings.length).length}`);
  fs.writeFileSync(path.join(OUT, opt.tag + "-focus-ring-table.json"), JSON.stringify(list.map(c => ({ ...c, screens: [...c.screens] })), null, 1));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
