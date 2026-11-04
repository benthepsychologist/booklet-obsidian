// 200% text on a 320 px phone, in a real Obsidian's phone mode (plugin 1.0.0, lane E2). Run by hand:
//   PLAYWRIGHT=<node_modules> node phone-200-100.js --obsidian <binary> --out <dir> [--tag name] [--vault ../test-vault]
// Not part of plugin-check.js. It uses mobile-checks.js's way of being a phone (`app.emulateMobile(true)`, then the window made phone-sized
// with Emulation.setDeviceMetricsOverride, and the larger-text variable `--preferred-text-scale`), on a vault of the made-up Screen reader walk
// note, and measures two faults the older checks only told: (a) the Allow card's Close footer over the content, with the card scrolled to
// its top, in the middle and to its end; (b) Obsidian's folded callout (a "Transcript") against its box and the window. Screenshots go to <out>.
const fs = require("fs"), path = require("path");
const { launch } = require("./drive");
const { quiet } = require("./waits");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const opt = { obsidian: arg("obsidian"), out: arg("out"), vault: arg("vault", path.join(__dirname, "..", "test-vault")), tag: arg("tag", "run") };
if (!opt.obsidian || !opt.out) { console.error("needs --obsidian <binary> and --out <dir>"); process.exit(2); }
const SRC_VAULT = path.resolve(opt.vault), OUT = path.resolve(opt.out);
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = (...a) => console.log(...a);
let pass = 0, fail = 0;
const fact = (ok, text) => { ok ? pass++ : fail++; say((ok ? "PASS " : "FAIL ") + text); };

const WALK = path.join(__dirname, "..", "test", "page-notes", "Screen reader walk");
const NOTE = "Screen reader walk.booklet.md";

// in the page: the card's footer against what lies under it, and the callout against its box and the window
const CARD = () => {
  const card = document.querySelector(".booklet-allow-card"), foot = card && card.querySelector(".modal-button-container");
  if (!card || !foot) return null;
  const f = foot.getBoundingClientRect(), c = card.getBoundingClientRect();
  const under = [];
  for (const e of card.querySelectorAll(".modal-content *")) {
    if (e.children.length && e.tagName !== "LABEL" && e.tagName !== "BUTTON") continue; // leaves only: a box holds its children
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // the part of the element that is in view inside the card (a scroller clips it): under the footer when it reaches into the footer's band
    let vis = { top: Math.max(r.top, c.top), bottom: Math.min(r.bottom, c.bottom) };
    for (let p = e.parentElement; p && p !== card.parentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowY)) { const pr = p.getBoundingClientRect(); vis = { top: Math.max(vis.top, pr.top), bottom: Math.min(vis.bottom, pr.bottom) }; } }
    if (vis.bottom - vis.top > 1 && vis.bottom > f.top + 1 && vis.top < f.bottom - 1) under.push((e.textContent || e.className).trim().slice(0, 28));
  }
  const content = card.querySelector(".modal-content"), cs = getComputedStyle(foot);
  const scrollers = [card, content].filter(x => x && x.scrollHeight > x.clientHeight + 1).map(x => x.className.split(" ")[0]);
  const R = x => { if (!x) return null; const r = x.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
  const geo = { title: R(card.querySelector(".modal-title")), content: R(content), firstH3: R(card.querySelector("h3")), foot: R(foot), footMargin: cs.marginTop + " " + cs.marginBottom, footPad: cs.padding, cardPad: getComputedStyle(card).padding, contentPad: content ? getComputedStyle(content).padding : null, h3: getComputedStyle(card.querySelector("h3")).margin + " / " + getComputedStyle(card.querySelector("h3")).fontSize };
  return { geo, cardTop: Math.round(c.top), cardBottom: Math.round(c.bottom), footTop: Math.round(f.top), footBottom: Math.round(f.bottom), footPosition: cs.position, cardOverflowY: getComputedStyle(card).overflowY, contentOverflowY: content ? getComputedStyle(content).overflowY : null, scrollers, under, vh: innerHeight };
};
const CALLOUT = () => {
  const view = document.querySelector(".workspace-leaf-content[data-type='booklet'] .booklet-view");
  const out = { vw: innerWidth, docScroll: document.documentElement.scrollWidth, viewScroll: view ? view.scrollWidth : null, viewClient: view ? view.clientWidth : null, items: [] };
  for (const co of document.querySelectorAll(".booklet-view .callout")) {
    const r = co.getBoundingClientRect(), t = co.querySelector(".callout-title"), fold = co.querySelector(".callout-fold");
    const tr = t && t.getBoundingClientRect(), fr = fold && fold.getBoundingClientRect(), wrap = co.parentElement.getBoundingClientRect();
    out.items.push({ cls: co.className, callout: [Math.round(r.left), Math.round(r.right)], box: [Math.round(wrap.left), Math.round(wrap.right)], title: tr && [Math.round(tr.left), Math.round(tr.right)], titleScroll: t && [t.scrollWidth, t.clientWidth], parts: t ? [...t.children].map(x => { const q = x.getBoundingClientRect(); return x.className.split(" ")[0] + " " + Math.round(q.left) + "-" + Math.round(q.right); }) : [], titleCss: t ? (({ display, flexWrap, gap, padding }) => ({ display, flexWrap, gap, padding }))(getComputedStyle(t)) : null, fold: fr && [Math.round(fr.left), Math.round(fr.right)], foldPastWindow: fr ? Math.round(fr.right - innerWidth) : null });
  }
  return out;
};

(async () => {
  const dir = path.join(OUT, "work-" + Date.now()), vault = path.join(dir, "vault");
  fs.mkdirSync(path.join(vault, ".obsidian", "plugins", "booklet"), { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(SRC_VAULT, ".obsidian", "plugins", "booklet", f), path.join(vault, ".obsidian", "plugins", "booklet", f));
  fs.writeFileSync(path.join(vault, ".obsidian", "plugins", "booklet", "data.json"), JSON.stringify({ allowedMediaHosts: ["media.tea-course.invalid", "media.example.org", "vimeo.com", "example.net", "youtube.com"], noteAllows: { [NOTE]: ["note.example.org", "other.example.net"] } }));
  fs.writeFileSync(path.join(vault, ".obsidian", "community-plugins.json"), JSON.stringify(["booklet"]));
  fs.writeFileSync(path.join(vault, ".obsidian", "app.json"), JSON.stringify({ promptDelete: false }));
  fs.cpSync(path.join(WALK, "media"), path.join(vault, "media"), { recursive: true });
  fs.copyFileSync(path.join(WALK, NOTE), path.join(vault, NOTE));
  const o = await launch({ obsidian: opt.obsidian, vault, configDir: path.join(dir, "cfg"), timeout: 90000 });
  const reap = () => {
    for (const d of fs.readdirSync("/proc")) if (/^\d+$/.test(d)) {
      let c; try { c = fs.readFileSync("/proc/" + d + "/cmdline", "utf8").split("\0"); } catch (e) { continue; }
      const line = c.join(" ");
      if (line.includes(" --remote-debugging-port=" + o.port + " ") && !/ --type=/.test(line)) { try { process.kill(-d, "SIGKILL"); } catch (e) { /* gone */ } }
      if (!process.env.DISPLAY && /(^|\/)Xvfb$/.test(c[0] || "") && c[1] === o.display && !["91", "92", "93"].includes(String(o.display).replace(/^:/, ""))) { try { process.kill(+d, "SIGKILL"); } catch (e) { /* gone */ } }
    }
  };
  process.on("exit", reap);
  const shot = name => o.screenshot(path.join(OUT, opt.tag + "-" + name + ".png")).catch(() => {});
  const result = { tag: opt.tag, configs: {} };
  try {
    const cdp = await o.page.context().newCDPSession(o.page);
    await o.evaluate(() => app.emulateMobile(true));
    await o.page.waitForFunction(() => !!(window.app && app.workspace && app.workspace.layoutReady) && document.body.classList.contains("is-mobile"), null, { timeout: 30000, polling: 100 });
    await o.page.evaluate(async () => { for (let i = 0; i < 50 && !app.plugins.plugins.booklet; i++) await new Promise(r => setTimeout(r, 100)); });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    for (const [vw, vh, z] of [[320, 568, 2], [320, 568, 1], [390, 844, 2], [390, 844, 1]]) {
      const tag = `${vw}x${vh}-${z * 100}`;
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });
      await o.evaluate(z => { document.documentElement.style.setProperty("--preferred-text-scale", String(z)); }, z);
      await sleep(400);
      const rec = result.configs[tag] = { font: await o.evaluate(() => getComputedStyle(document.documentElement).fontSize) };
      // the note, on its Listen tab (the Transcript is there)
      await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
      await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, NOTE, { timeout: 30000, polling: 100 });
      await o.evaluate(async r => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(r)); }, NOTE);
      await o.page.waitForFunction(() => { const l = app.workspace.getLeavesOfType("booklet")[0]; return !!(l && l.view.contentEl.querySelector(".booklet-page")); }, null, { timeout: 20000, polling: 100 });
      await o.evaluate(async () => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 2, screen: "activity:/walk", tab: "listen", part: 0 }, active: true }); });
      await sleep(600); await quiet(o);
      // a card the note opens on its own is answered first
      if (await o.evaluate(() => !!document.querySelector(".booklet-allow-card"))) { await o.evaluate(() => [...document.querySelectorAll(".booklet-allow-card button")].find(b => b.textContent === "Not now").click()); await sleep(300); }
      // (b) the callout
      await o.evaluate(() => { const c = document.querySelector(".booklet-view .callout"); c && c.scrollIntoView({ block: "center" }); }); await sleep(250);
      rec.callout = await o.evaluate(CALLOUT);
      await shot("callout-" + tag);
      // (a) the card: scrolled to its top, a third of the way down, and to its end
      await o.evaluate(() => { const b = document.querySelector(".booklet-allow-btn"); b && b.click(); }); await sleep(500);
      if (await o.evaluate(() => !!document.querySelector(".booklet-allow-card"))) {
        const scrollTo = f => o.evaluate(f => { const card = document.querySelector(".booklet-allow-card"), content = card.querySelector(".modal-content"); const s = [card, content].find(x => x.scrollHeight > x.clientHeight + 1) || card; s.scrollTop = f === "end" ? s.scrollHeight : f === "mid" ? (s.scrollHeight - s.clientHeight) / 2 : 0; }, f);
        for (const at of ["top", "mid", "end"]) { await scrollTo(at); await sleep(200); rec["card-" + at] = await o.evaluate(CARD); await shot("card-" + at + "-" + tag); }
        await o.evaluate(() => [...document.querySelectorAll(".booklet-allow-card button")].find(b => b.textContent === "Close").click()); await sleep(250);
      } else say("INFO no card at " + tag);
      say(tag, JSON.stringify(rec));
    }
  } finally {
    await o.close().catch(() => {});
    reap();
  }
  // the verdicts
  for (const [tag, rec] of Object.entries(result.configs)) {
    for (const at of ["top", "mid", "end"]) { const c = rec["card-" + at]; if (c) fact(c.under.length === 0, `${tag}: Allow card scrolled to ${at}: nothing lies under the Close footer${c.under.length ? " (" + c.under.join(" | ") + ")" : ""}`); }
    const k = rec.callout;
    fact(k.docScroll <= k.vw && k.items.every(i => i.foldPastWindow === null || i.foldPastWindow <= 0), `${tag}: the folded callout: page does not scroll sideways (${k.docScroll} of ${k.vw}) and its arrow is inside the window (${k.items.map(i => i.foldPastWindow).join(",")} past)`);
    fact(k.items.every(i => !i.title || i.title[1] <= i.box[1] + 1), `${tag}: the callout's title ends inside its box (${k.items.map(i => (i.title ? i.title[1] : "-") + " vs " + i.box[1]).join(",")})`);
  }
  fs.writeFileSync(path.join(OUT, opt.tag + "-phone-200.json"), JSON.stringify(result, null, 1));
  say(`done; ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
