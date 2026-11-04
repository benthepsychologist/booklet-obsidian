// Check 55 of plugin-check.js (0.12.0): the layout and the touch targets of what 0.12.0 added, in Obsidian's phone mode at a phone's width.
//
// What it is, and what it is not. `app.emulateMobile(true)` switches Obsidian to its mobile interface inside desktop Chromium, and the
// Chrome DevTools protocol makes the window phone-sized (`Emulation.setDeviceMetricsOverride`, which also makes Obsidian add `is-phone`) with
// touch events on (`Emulation.setTouchEmulationEnabled`). That shows LAYOUT and TOUCH TARGETS. It shows nothing about a phone's web view,
// its media rules, its file system, the lock screen or the app being killed, and it is not a phone's pixel density or a finger's accuracy.
//
// For viewports 390x844, 360x740 and 320x568, each at the normal text size and at 200% (Obsidian's own font size setting, 32 px), in the
// light and the dark theme, it opens the made-up Tea course (test/page-notes/Listen demo) with its tones served from the vault, and for
// every control 0.12.0 added or touched (the Allow list button; the allow card's buttons, boxes, write-in and Close; a media slot's Play
// and Open in browser; a service slot's Play; the listen tick; Continue; the pager; the Now playing bar's Back to the page, Close and its
// native player; the settings page's buttons and write-in) records its size and checks that
//   - it is at least 44 CSS px high and wide, or sits in a hit area that is (a box inside its label, a link inside a 44 px row);
//   - no two controls of one screen overlap, and none is cut off by the window or by a box that clips;
//   - nothing scrolls sideways (the page, the view, the card), and no text is cut off or ellipsised;
//   - the card fits inside the window and scrolls inside itself;
//   - with the Now playing bar showing and the page scrolled to its foot, the last controls are above the bar, the bar is above the phone's
//     own bottom bar (Obsidian's mobile navbar) and keeps clear of a bottom safe area (an inset the protocol sets).
//
// Run alone:   PLAYWRIGHT=<node_modules> node mobile-checks.js --obsidian <binary> --plugin <folder with main.js, manifest.json, styles.css> --out <dir>
//                [--only 390x844] [--zoom 1,2] [--scheme light,dark] [--shots <dir> [--shotsall 1]]
// It prints every failure (and what it tells apart: Obsidian's own folded callout), and writes every control's numbers as JSON next to the vault. Screenshots are
// taken at 390x844 and the normal text size, or at every size with --shotsall. plugin-check.js runs it as check 55 (`--only 55`; `--mobileOnly 390x844` narrows it).
// Text 200%: Obsidian's own font size slider stops at 30 px, so the check sets the variable a phone's "larger text" setting reaches Obsidian as (--preferred-text-scale: 2).
const fs = require("fs"), path = require("path");
const { launch } = require("./drive");
const { writeTones } = require("./tones");
const { bookletPage } = require("./waits");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TAP = 44;
const VIEWPORTS = [[390, 844], [360, 740], [320, 568]];
const NOTE = "Tea course.booklet.md";
let named = 0;
const DEMO = path.join(__dirname, "..", "test", "page-notes", "Listen demo");

/** The settings that make the card, the slots and the lists all have something to show: a few sites on each list, made up. */
const DATA = {
  allowedMediaHosts: ["media.example.org", "vimeo.com", "example.net"],
  noteAllows: { [NOTE]: ["note.example.org"] },
};

/** A made-up note with every kind of slot the Tea course lacks: a video service not allowed and one allowed, hosted media allowed and not, an address that is not https. */
const SLOTS = "Slots.booklet.md";
const SLOTS_TEXT = `---
booklet: "0.18"
id: booklet-test/slots
title: Slots
lang: en
---

> [!activity|svc] Services and hosted files

A video service, not allowed yet:

![A pouring demonstration](https://www.youtube.com/watch?v=teaDemo0001)

A video service that is allowed:

![A talk about steeping](https://vimeo.com/100000001)

Hosted media on an allowed site:

![A hosted clip](https://media.example.org/pouring.mp4)

![A hosted talk](https://media.example.org/talk.mp3)

Hosted media on a site not allowed:

![Another talk](https://other.example.net/talk.mp3)

An address that does not use https:

![An old talk](http://media.example.org/old.mp3)

> [!listen|svc-v] Watch the clip
> ![The clip](https://media.example.org/pouring.mp4)

> [!text|svc-q] What did you notice?
`;

// the controls measured, by what they are. `scope` limits a selector to what is in front of the reader in that screen state.
const SPECS = [
  ["Allow list button", ".booklet-allow-btn"],
  ["Card: choice button", ".booklet-allow-card .booklet-allow-btn-choice"],
  ["Card: list box", ".booklet-allow-card .booklet-allow-row input[type=checkbox]"],
  ["Card: write-in", ".booklet-allow-card .booklet-allow-add input[type=text]"],
  ["Media slot: Play", ".booklet-media-slot .booklet-media-play"],
  ["Media slot: Open in browser", ".booklet-media-slot a.external-link"],
  ["Listen: Done tick", ".booklet-listen-tick"],
  ["Page: native player", ".booklet-listen-media audio, .booklet-listen-media video"],
  ["Continue", ".booklet-continue-button"],
  ["Pager button", ".booklet-pager button"],
  ["Now playing: Back to the page", ".booklet-nowplaying-back"],
  ["Now playing: Close", ".booklet-nowplaying-close"],
  ["Now playing: native player", ".booklet-nowplaying audio, .booklet-nowplaying video"],
  ["Settings: button", ".vertical-tab-content .setting-item button"],
  ["Settings: write-in", ".vertical-tab-content .setting-item input[type=text]"],
];

/** The measuring function, run in the page. `scopeSel` is the element a screen state lives in. Returns plain data. */
const MEASURE = ({ specs, scopeSel, tap }) => {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const shown = e => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let p = e; p && p !== document.body; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (c.display === "none" || c.visibility === "hidden") return false;
      if (p.parentElement && p.parentElement.tagName === "DETAILS" && !p.parentElement.open && p.tagName !== "SUMMARY") return false;
    }
    return true;
  };
  const name = e => (e.tagName.toLowerCase() + "." + (e.getAttribute("class") || "").split(" ")[0] + " \"" + (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 28) + "\"");
  const scopes = [...document.querySelectorAll(scopeSel)];
  const inScope = e => scopes.some(s => s.contains(e));
  const found = [];
  for (const [label, sel] of specs) {
    for (const e of document.querySelectorAll(sel)) {
      if (!inScope(e) || !shown(e) || e.closest(".booklet-sr")) continue;
      // a box is hit through its label; a link or a button is its own hit area unless a row around it is the control
      const row = e.matches("input[type=checkbox]") ? e.closest("label") : null;
      found.push({ label, e, hit: R(row || e), own: R(e), via: row ? "label" : "" });
    }
  }
  const items = found.map(f => ({
    label: f.label, name: name(f.e), text: (f.e.getAttribute("aria-label") || f.e.textContent || f.e.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40),
    w: Math.round(f.own.w * 10) / 10, h: Math.round(f.own.h * 10) / 10, hw: Math.round(f.hit.w * 10) / 10, hh: Math.round(f.hit.h * 10) / 10, via: f.via,
    top: Math.round(f.own.t), left: Math.round(f.own.l),
    small: f.hit.w < tap - 0.5 || f.hit.h < tap - 0.5,
  }));
  // overlap, between controls of one screen (the bar is another layer: reachability is checked below)
  const layer = e => (e.closest(".booklet-nowplaying") ? "bar" : "page");
  const overlaps = [];
  for (let i = 0; i < found.length; i++) for (let j = i + 1; j < found.length; j++) {
    const a = found[i], b = found[j];
    if (a.e.contains(b.e) || b.e.contains(a.e) || layer(a.e) !== layer(b.e)) continue;
    // a card's Close is a footer that stays put while the card scrolls: it lies over the foot of the content at the top, and is checked with the card scrolled to its end
    if (!!a.e.closest(".modal-button-container") !== !!b.e.closest(".modal-button-container")) continue;
    const w = Math.min(a.own.r, b.own.r) - Math.max(a.own.l, b.own.l), h = Math.min(a.own.b, b.own.b) - Math.max(a.own.t, b.own.t);
    if (w > 2 && h > 2) overlaps.push(name(a.e) + " x " + name(b.e) + " " + Math.round(w) + "x" + Math.round(h));
  }
  // a control cut off: outside the window sideways, or outside a box that clips it
  const clipped = [];
  for (const f of found) {
    const r = f.own;
    let why = r.l < -0.5 || r.r > vw + 0.5 ? "outside the window" : "";
    for (let p = f.e.parentElement; p && !why && p !== document.body; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (c.overflowX === "visible" && c.overflowY === "visible") continue;
      const pr = p.getBoundingClientRect();
      if (c.overflowX !== "visible" && (r.l < pr.left - 0.5 || r.r > pr.right + 0.5) && !(/(auto|scroll)/.test(c.overflowX) && p.scrollWidth > p.clientWidth + 1)) why = "clipped by " + name(p);
    }
    if (why) clipped.push(name(f.e) + ": " + why);
  }
  // text cut off in what the plugin draws here. A callout's title (a folded "Transcript") is Obsidian's own and is older than 0.12.0: it is told apart, not counted.
  const cut = [], theirs = [];
  for (const s of scopes) for (const e of s.querySelectorAll("*")) {
    if (!shown(e) || e.closest(".booklet-sr, svg")) continue;
    if (e.closest(".callout")) { if (e.matches(".callout") && e.scrollWidth > e.clientWidth + 1) theirs.push("callout title " + e.scrollWidth + ">" + e.clientWidth); continue; }
    const c = getComputedStyle(e);
    const clips = c.overflowX !== "visible" || c.overflowY !== "visible";
    if (e.scrollWidth > e.clientWidth + 1 && clips && !/(auto|scroll)/.test(c.overflowX) && e.clientWidth > 0) cut.push("x " + name(e) + " " + e.scrollWidth + ">" + e.clientWidth);
    else if (c.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1) cut.push("ellipsis " + name(e));
    else if (e.scrollHeight > e.clientHeight + 1 && /(hidden|clip)/.test(c.overflowY) && e.clientHeight > 0) cut.push("y " + name(e) + " " + e.scrollHeight + ">" + e.clientHeight);
  }
  // a control whose words run past its own edge (a button that does not wrap at a large text size)
  for (const f of found) if (f.e.tagName === "BUTTON" && f.e.scrollWidth > f.e.clientWidth + 1) cut.push("button's words run past it: " + name(f.e) + " " + f.e.scrollWidth + ">" + f.e.clientWidth);
  // sideways scroll: the page, and the boxes this state lives in
  const sideways = [];
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) sideways.push("page " + document.documentElement.scrollWidth + ">" + document.documentElement.clientWidth);
  const boxes = new Set(scopes);
  for (const s of scopes) for (const sel of [".view-content", ".booklet-view", ".booklet-allow-card", ".modal", ".vertical-tab-content", ".booklet-nowplaying"]) { const x = s.matches(sel) ? s : s.querySelector(sel); if (x) boxes.add(x); }
  for (const b of boxes) if (b.scrollWidth > b.clientWidth + 1) {
    // what reaches furthest past the box's right edge
    const edge = b.getBoundingClientRect().left + b.clientWidth;
    const far = [...b.querySelectorAll("*")].filter(e => shown(e) && !e.closest("svg") && e.getBoundingClientRect().right > edge + 1).map(e => ({ n: name(e), over: Math.round(e.getBoundingClientRect().right - edge) })).sort((x, y) => y.over - x.over).slice(0, 3);
    sideways.push(name(b) + " " + b.scrollWidth + ">" + b.clientWidth + (far.length ? " (" + far.map(x => x.n + " +" + x.over).join("; ") + ")" : ""));
  }
  const wide = [];
  for (const s of scopes) for (const e of s.querySelectorAll("*")) if (shown(e) && !e.closest(".booklet-sr, svg, audio, video, .callout") && e.getBoundingClientRect().right > vw + 1 && getComputedStyle(e).position !== "fixed") wide.push(name(e) + " +" + Math.round(e.getBoundingClientRect().right - vw));
  // the card: inside the window, and scrolling inside itself when it is taller than the room
  let card = null;
  const cardEl = document.querySelector(".booklet-allow-card");
  if (cardEl) {
    const r = R(cardEl), c = getComputedStyle(cardEl);
    card = { top: Math.round(r.t), bottom: Math.round(r.b), left: Math.round(r.l), right: Math.round(r.r), w: Math.round(r.w), h: Math.round(r.h), inside: r.t >= -0.5 && r.b <= vh + 0.5 && r.l >= -0.5 && r.r <= vw + 0.5,
      scrolls: cardEl.scrollHeight > cardEl.clientHeight + 1, overflowY: c.overflowY, scrollH: cardEl.scrollHeight, clientH: cardEl.clientHeight };
  }
  const font = parseFloat(getComputedStyle(document.body).fontSize);
  return { vw, vh, font, items, overlaps, clipped, cut, theirs, sideways, wide: wide.slice(0, 5), card, cls: document.body.className.replace(/\s+/g, " ") };
};

/** Where the foot of the page is, with the Now playing bar up: what the last controls are, and what is on top of them. */
const FOOT = ({ tap }) => {
  const vh = window.innerHeight;
  const R = e => e.getBoundingClientRect();
  const view = document.querySelector(".workspace-leaf.mod-active .view-content, .view-content");
  const scroller = (() => { for (let p = view; p; p = p.parentElement) if (p.scrollHeight > p.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p; return view; })();
  scroller.scrollTop = scroller.scrollHeight;
  const bar = document.querySelector(".booklet-nowplaying"), nav = document.querySelector(".mobile-navbar");
  const vis = e => { const r = R(e); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
  const ctl = [...view.querySelectorAll("button, input, a[href], audio, video, summary, [role=link]")].filter(vis);
  const last = ctl.slice(-3).map(e => ({ name: (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30), bottom: Math.round(R(e).bottom) }));
  // a bar that is taller than its share of a small window scrolls inside itself: its buttons are measured with it scrolled to its end, where the last row is
  const barScrolls = !!bar && bar.scrollHeight > bar.clientHeight + 1;
  if (bar) bar.scrollTop = bar.scrollHeight;
  const barR = bar ? R(bar) : null, navR = nav && vis(nav) ? R(nav) : null;
  const ends = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
  const pad = parseFloat(getComputedStyle(view.querySelector(".booklet-view") || view).paddingBottom);
  const inset = (() => { const d = document.createElement("div"); d.style.cssText = "position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)"; document.body.appendChild(d); const v = parseFloat(getComputedStyle(d).paddingBottom); d.remove(); return v; })();
  return {
    scrolledToEnd: ends, last, bar: barR && { top: Math.round(barR.top), bottom: Math.round(barR.bottom), h: Math.round(barR.height), padBottom: parseFloat(getComputedStyle(bar).paddingBottom) },
    nav: navR && { top: Math.round(navR.top), bottom: Math.round(navR.bottom), h: Math.round(navR.height) }, vh, pagePadBottom: Math.round(pad), inset,
    barScrolls, barButtons: bar ? [...bar.querySelectorAll("button")].map(b => ({ text: b.textContent, bottom: Math.round(R(b).bottom), top: Math.round(R(b).top) })) : [],
    tap,
  };
};

module.exports = function mobileChecks(env) {
  const { Check, SHOTS, opt, WORK, SRC_VAULT } = env;
  async function check55() {
    const c = new Check(55, "phone mode (layout and touch targets, at 390x844, 360x740 and 320x568, 100% and 200% text, light and dark): every control 0.12.0 added is 44 px or more, nothing overlaps, is cut off or scrolls sideways, the card fits, the Now playing bar leaves the foot of the page reachable");
    const plugin = path.join(SRC_VAULT, ".obsidian", "plugins", "booklet");
    const out = path.join(WORK, "mobile");
    const r = await run({ obsidian: opt.obsidian, plugin, out, shots: SHOTS, only: opt.mobileOnly, zoom: [1, 2], scheme: ["light", "dark"] });
    for (const f of r.failures) c.ok(false, f);
    c.ok(r.failures.length === 0, `${r.configs} configurations, ${r.measured} controls measured, ${r.failures.length} failures`);
    for (const n of r.notes.slice(0, 6)) c.info(n);
    c.info(`the numbers: ${r.json}`);
    return c;
  }
  return { 55: check55 };
};

/**
 * The whole pass. Returns { failures: string[], rows, configs, measured, json }. One Obsidian, started once and stopped at the end; the app is put
 * in phone mode once (that reloads it), then the window, the text size and the theme change from one configuration to the next.
 */
async function run({ obsidian, plugin, out, shots, shotsAll, only, zoom = [1, 2], scheme = ["light", "dark"], viewports = VIEWPORTS, log = () => {} }) {
  fs.mkdirSync(out, { recursive: true });
  const vault = path.join(out, "vault");
  fs.rmSync(vault, { recursive: true, force: true });
  fs.mkdirSync(path.join(vault, ".obsidian", "plugins", "booklet"), { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(plugin, f), path.join(vault, ".obsidian", "plugins", "booklet", f));
  fs.writeFileSync(path.join(vault, ".obsidian", "plugins", "booklet", "data.json"), JSON.stringify(DATA));
  fs.writeFileSync(path.join(vault, ".obsidian", "community-plugins.json"), JSON.stringify(["booklet"]));
  fs.writeFileSync(path.join(vault, ".obsidian", "app.json"), JSON.stringify({ promptDelete: false }));
  fs.cpSync(path.join(DEMO, "media"), path.join(vault, "media"), { recursive: true });
  writeTones(vault);
  fs.copyFileSync(path.join(DEMO, NOTE), path.join(vault, NOTE));
  fs.writeFileSync(path.join(vault, SLOTS), SLOTS_TEXT);
  if (shots) fs.mkdirSync(shots, { recursive: true });

  const o = await launch({ obsidian, vault, configDir: path.join(out, "cfg-" + Date.now()), args: ["--autoplay-policy=no-user-gesture-required"], timeout: 90000 });
  const reap = () => {
    // Electron rewrites its own title, so /proc holds the main process's whole command line as one string: it is read as one
    for (const d of fs.readdirSync("/proc")) if (/^\d+$/.test(d)) {
      let c; try { c = fs.readFileSync("/proc/" + d + "/cmdline", "utf8").split("\0"); } catch (e) { continue; }
      const line = c.join(" ");
      if (line.includes(" --remote-debugging-port=" + o.port + " ") && !/ --type=/.test(line)) { try { process.kill(-d, "SIGKILL"); } catch (e) { /* gone */ } }
      if (!process.env.DISPLAY && /(^|\/)Xvfb$/.test(c[0] || "") && c[1] === o.display && !["91", "92", "93"].includes(String(o.display).replace(/^:/, ""))) { try { process.kill(+d, "SIGKILL"); } catch (e) { /* gone */ } }
    }
  };
  process.on("exit", reap);
  const failures = [], rows = [], notes = [], feet = [];
  let measured = 0, configs = 0;
  const note = { name: NOTE };
  try {
    const page = o.page;
    const cdp = await page.context().newCDPSession(page);
    o.cdp = cdp;
    // phone mode (the app reloads), then the window
    await o.evaluate(() => app.emulateMobile(true));
    await page.waitForFunction(() => !!(window.app && app.workspace && app.workspace.layoutReady) && document.body.classList.contains("is-mobile"), null, { timeout: 30000, polling: 100 });
    await page.evaluate(async () => { for (let i = 0; i < 50 && !app.plugins.plugins.booklet; i++) await new Promise(r => setTimeout(r, 100)); });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    for (const [vw, vh] of viewports) {
      if (only && only !== vw + "x" + vh) continue;
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });
      for (const z of zoom) {
        // Obsidian's own font size slider stops at 30 px (187%); a phone's "larger text" setting reaches Obsidian as the variable below, which Obsidian multiplies into its root font size
        await o.evaluate(z => { document.documentElement.style.setProperty("--preferred-text-scale", String(z)); }, z);
        for (const sch of scheme) {
          await o.setScheme(sch);
          await sleep(300);
          const tag = `${vw}x${vh} ${z * 100}% ${sch}`;
          configs++;
          const res = await states({ o, cdp, note, notes, tag, vw, vh, z, sch, shots: (vw === 390 && z === 1) || shotsAll ? shots : null });
          for (const s of res) { rows.push(...s.rows); measured += s.rows.length; failures.push(...s.failures); if (s.foot) feet.push({ tag, state: s.state, ...s.foot }); }
          const root = await o.evaluate(() => [getComputedStyle(document.documentElement).fontSize, getComputedStyle(document.body).getPropertyValue("--font-ui-medium"), document.body.className.match(/is-(phone|tablet)/)[0]].join(" "));
          log(tag + ": " + res.reduce((n, s) => n + s.rows.length, 0) + " controls; root font " + root);
        }
      }
    }
  } catch (e) {
    // a window that went away: what Obsidian itself said last
    console.log("INFO  Obsidian's last words: " + o.output().split("\n").slice(-12).join(" | ").slice(-1500));
    throw e;
  } finally {
    await o.close();
    reap();
  }
  const json = path.join(out, "mobile-checks.json");
  fs.writeFileSync(json, JSON.stringify({ rows, failures, notes, feet }, null, 1));
  return { failures, rows, notes, configs, measured, json };
}

/** Opens a screen of the Tea course (a place `screen`), waits until the view has drawn it. */
async function goTo(o, screen, note) {
  await o.evaluate(async ({ note, screen }) => {
    let l = app.workspace.getLeavesOfType("booklet")[0];
    if (!l) { l = app.workspace.getLeaf(); await l.openFile(app.vault.getAbstractFileByPath(note)); await new Promise(r => setTimeout(r, 300)); l = app.workspace.getLeavesOfType("booklet")[0]; }
    await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, file: note, version: 2, screen, part: 0 }, active: true });
  }, { note, screen });
  await o.page.waitForSelector(`.workspace-leaf-content[data-type="booklet"] .booklet-page[data-booklet-screen="${screen}"]`, { timeout: 8000 });
  await o.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await sleep(500);
}

/** A real touch on the nth (negative: from the end) element matching `sel`: the press the plugin trusts. */
async function tap(o, sel, n = 0) {
  const box = await o.evaluate(({ sel, n }) => {
    const all = [...document.querySelectorAll(sel)], e = all.at(n);
    if (!e) return null;
    e.scrollIntoView({ block: "center" });
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { sel, n });
  if (!box) throw new Error("nothing to tap: " + sel);
  await sleep(150);
  const pt = [{ x: box.x, y: box.y, id: 1 }];
  await o.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
  await sleep(40);
  await o.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const closeCard = o => o.evaluate(() => { for (const b of document.querySelectorAll(".booklet-allow button")) if (/^(Not now|Close)$/.test(b.textContent)) { b.click(); return true; } return false; });

/** Every screen state of one configuration: set up, measure, record. Returns [{ state, rows, failures }]. */
async function states(ctx) {
  const { o, tag, shots } = ctx;
  const out = [];
  const notes = ctx.notes;
  const take = async (state, scopeSel, extra = {}) => {
    const m = await o.evaluate(MEASURE, { specs: SPECS, scopeSel, tap: TAP });
    const fails = [];
    const at = `[${tag}, ${state}]`;
    const rows = m.items.map(i => ({ tag, state, ...i }));
    for (const i of m.items) if (i.small) fails.push(`${at} ${i.label} "${i.text}" is ${i.w}x${i.h}${i.via ? " (hit area " + i.hw + "x" + i.hh + ")" : ""}, under ${TAP}`);
    for (const x of m.overlaps) fails.push(`${at} overlap: ${x}`);
    for (const x of m.clipped) fails.push(`${at} cut off: ${x}`);
    for (const x of m.cut) fails.push(`${at} text cut off: ${x}`);
    for (const x of m.sideways) fails.push(`${at} scrolls sideways: ${x}`);
    for (const x of m.wide) fails.push(`${at} pokes out past the window: ${x}`);
    for (const x of m.theirs) notes.push(`${at} (not 0.12.0, Obsidian's folded callout) ${x}`);
    if (m.card && !m.card.inside) fails.push(`${at} the card is not inside the window: ${JSON.stringify(m.card)}`);
    if (m.card && m.card.scrollH > m.card.clientH + 1 && !/(auto|scroll)/.test(m.card.overflowY)) fails.push(`${at} the card is taller than its box and does not scroll`);
    if (shots) await o.screenshot(path.join(shots, `mobile-${tag.replace(/ /g, "-")}-${state.replace(/[^a-z0-9]+/gi, "-")}.png`));
    // a card scrolls inside itself, and its Close sits over the foot: with it scrolled to the end nothing may lie under the Close or overlap
    if (m.card && m.card.scrolls) {
      await o.evaluate(() => { const c = document.querySelector(".booklet-allow-card"); c.scrollTop = c.scrollHeight; });
      await sleep(150);
      const e = await o.evaluate(MEASURE, { specs: SPECS, scopeSel, tap: TAP });
      for (const x of e.overlaps) fails.push(`${at} overlap, card scrolled to its end: ${x}`);
      for (const x of e.clipped) fails.push(`${at} cut off, card scrolled to its end: ${x}`);
      const under = await o.evaluate(() => {
        const card = document.querySelector(".booklet-allow-card"), foot = card.querySelector(".modal-button-container");
        if (!foot || getComputedStyle(foot).position === "static") return null;
        const f = foot.getBoundingClientRect(), hid = [];
        for (const e of card.querySelectorAll(".modal-content button, .modal-content input, .modal-content p, .modal-content label")) { const r = e.getBoundingClientRect(); if (r.height && r.bottom > f.top + 1 && r.top < f.bottom - 1) hid.push((e.textContent || e.className).trim().slice(0, 30)); }
        return { footTop: Math.round(f.top), hid };
      });
      if (under && under.hid.length) fails.push(`${at} under the card's Close when scrolled to its end: ${under.hid.join(" | ")}`);
      await o.evaluate(() => { document.querySelector(".booklet-allow-card").scrollTop = 0; });
    }
    out.push({ state, rows, failures: fails, m, ...extra });
    return m;
  };
  const view = ".workspace-leaf-content[data-type=\"booklet\"] .booklet-view";
  // the card asks about a site a note names once for each note in a run of the app, so each configuration has the note under a new name (the plugin moves its list with it)
  const NOTE_NOW = `Tea course ${++named}.booklet.md`;
  await o.evaluate(async ({ from, to }) => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); await app.fileManager.renameFile(app.vault.getAbstractFileByPath(from), to); }, { from: ctx.note.name, to: NOTE_NOW });
  ctx.note.name = NOTE_NOW;
  await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, NOTE_NOW, { timeout: 15000, polling: 100 });
  // the note opens: it names a site the reader has not allowed, so the card asks first
  await o.evaluate(async note => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(note)); }, NOTE_NOW);
  await o.page.waitForSelector(".booklet-allow-card", { timeout: 8000 });
  await sleep(400);
  await take("card asks about the sites the booklet names", ".booklet-allow");
  await closeCard(o); await sleep(300);
  await goTo(o, "home", NOTE_NOW);
  await take("home", view);
  // the Allow list button opens the card with the lists
  await tap(o, ".booklet-allow-btn");
  await o.page.waitForSelector(".booklet-allow-card", { timeout: 4000 });
  await sleep(300);
  await take("card: the lists", ".booklet-allow");
  await closeCard(o); await sleep(300);
  await goTo(o, "activity:unit-1/u1-listen", NOTE_NOW);
  await take("a listen with local audio", view);
  await goTo(o, "activity:unit-2/u2-listen", NOTE_NOW);
  await take("a hosted file, not allowed yet", view);
  // a press on it asks
  await tap(o, ".booklet-media-play", -1);
  await o.page.waitForSelector(".booklet-allow-card", { timeout: 4000 });
  await sleep(300);
  await take("card: a press on media from a site not allowed", ".booklet-allow");
  await closeCard(o); await sleep(300);
  await goTo(o, "activity:unit-3/u3-watch", NOTE_NOW);
  await take("a link to a video service, and a listen with only a tick", view);
  // the slots the Tea course lacks
  await goTo(o, "activity:/svc", SLOTS);
  await take("service slots and hosted media, allowed and not", view);
  await tap(o, ".booklet-media-play", 0);
  await o.page.waitForSelector(".booklet-allow-card", { timeout: 4000 });
  await sleep(300);
  await take("card: a press on a service not allowed", ".booklet-allow");
  await closeCard(o); await sleep(300);
  // settings
  await o.evaluate(() => { app.setting.open(); app.setting.openTabById("booklet"); });
  await o.page.waitForSelector(".vertical-tab-content .setting-item", { timeout: 4000 });
  await bookletPage(o.page); // Obsidian 1.13 and later: the tab lists one entry, the rows are on its page
  await o.page.waitForSelector(".vertical-tab-content .setting-item button", { timeout: 4000 });
  await sleep(400);
  await take("settings page", ".modal-container:not(.booklet-allow) .modal, .vertical-tab-content");
  await o.evaluate(() => app.setting.close());
  await sleep(300);
  // Now playing: a tone plays from the first listen, which lifts it into the bar
  await goTo(o, "activity:unit-1/u1-listen", NOTE_NOW);
  await o.evaluate(() => { const a = document.querySelector(".booklet-listen-media audio"); a.muted = true; a.loop = true; return a.play(); });
  await o.page.waitForSelector(".booklet-nowplaying audio", { timeout: 4000 });
  await sleep(500);
  await take("now playing bar over a listen", `${view}, .booklet-nowplaying`);
  const foot = await o.evaluate(FOOT, { tap: TAP });
  const f = [];
  const at = `[${tag}, now playing bar over a listen]`;
  if (!foot.scrolledToEnd) f.push(`${at} the page did not scroll to its end (cannot check the foot)`);
  const top = foot.bar ? foot.bar.top : foot.vh;
  for (const l of foot.last) if (l.bottom > top + 0.5) f.push(`${at} at the foot of the page "${l.name}" ends at ${l.bottom}, under the bar that starts at ${top} (the page's bottom padding is ${foot.pagePadBottom}, the bar is ${foot.bar && foot.bar.h} high)`);
  if (foot.nav && foot.bar && foot.bar.bottom > foot.nav.top + 0.5 && foot.bar.top < foot.nav.bottom) f.push(`${at} the bar (${foot.bar.top} to ${foot.bar.bottom}) lies over Obsidian's own bottom bar (${foot.nav.top} to ${foot.nav.bottom})`);
  out.push({ state: "now playing foot", rows: [], failures: f, foot });
  // a bottom safe area (a home indicator): the protocol sets one (Obsidian's phone mode sets its own variable of 34 px as well). With Obsidian's bottom bar
  // showing, the Now playing bar stands above it, and nothing of ours is in the safe area; with that bar hidden, the bar is at the foot of the window and its own padding clears the area.
  const INSET = 34;
  try {
    await ctx.cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: INSET } });
    for (const hidden of [false, true]) {
      await o.evaluate(h => document.body.classList.toggle("is-hidden-nav", h), hidden);
      await sleep(400);
      const f2 = await o.evaluate(FOOT, { tap: TAP });
      const g = [];
      const at2 = `[${tag}, now playing bar with a ${INSET} px bottom safe area${hidden ? ", Obsidian's bottom bar hidden" : ""}]`;
      if (f2.inset !== INSET) g.push(`${at2} the safe area was not applied (env() reads ${f2.inset})`);
      else if (!f2.bar) g.push(`${at2} no bar`);
      else {
        for (const b of f2.barButtons) if (b.bottom > f2.vh - INSET + 0.5) g.push(`${at2} the "${b.text}" button ends at ${b.bottom}, inside the safe area that starts at ${f2.vh - INSET}`);
        if (hidden && f2.bar.bottom < f2.vh - 0.5) g.push(`${at2} the bar ends at ${f2.bar.bottom}, not at the foot of the window (${f2.vh})`);
        if (hidden && f2.bar.padBottom < INSET) g.push(`${at2} the bar's bottom padding is ${f2.bar.padBottom}, under the inset`);
        if (!hidden && f2.bar.bottom > f2.vh - INSET + 0.5) g.push(`${at2} the bar ends at ${f2.bar.bottom}, inside the safe area`);
        for (const l of f2.last) if (l.bottom > f2.bar.top + 0.5) g.push(`${at2} at the foot of the page "${l.name}" ends at ${l.bottom}, under the bar that starts at ${f2.bar.top}`);
      }
      out.push({ state: "now playing safe area" + (hidden ? ", bottom bar hidden" : ""), rows: [], failures: g, foot: f2 });
    }
  } catch (e) {
    // Chromium before Obsidian 1.14's has no Emulation.setSafeAreaInsetsOverride: nothing to measure there, which is not a failure of the plugin
    if (/wasn't found/.test(e.message)) ctx.notes.push(`[${tag}] not measured: this Chromium has no Emulation.setSafeAreaInsetsOverride (the bottom safe area of the Now playing bar)`);
    out.push({ state: "now playing safe area", rows: [], failures: /wasn't found/.test(e.message) ? [] : [`[${tag}] could not set a safe area: ${e.message}`] });
  } finally {
    await o.evaluate(() => document.body.classList.remove("is-hidden-nav"));
    await ctx.cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 0 } }).catch(() => {});
  }
  await tap(o, ".booklet-nowplaying-close");
  await o.page.waitForFunction(() => !document.querySelector(".booklet-nowplaying"), null, { timeout: 4000 }).catch(() => {});
  await sleep(300);
  return out;
}

module.exports.run = run;
module.exports.MEASURE = MEASURE;
module.exports.FOOT = FOOT;
module.exports.states = states;

if (require.main === module) {
  const argv = process.argv.slice(2), a = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[++i];
  if (!a.obsidian || !a.plugin || !a.out) { console.error("need --obsidian, --plugin and --out"); process.exit(2); }
  run({ obsidian: path.resolve(a.obsidian), plugin: path.resolve(a.plugin), out: path.resolve(a.out), shots: a.shots && path.resolve(a.shots), shotsAll: !!a.shotsall, only: a.only,
    zoom: a.zoom ? a.zoom.split(",").map(Number) : [1, 2], scheme: a.scheme ? a.scheme.split(",") : ["light", "dark"], log: s => console.log("INFO  " + s) })
    .then(r => {
      for (const f of r.failures) console.log("FAIL  " + f);
      for (const n of r.notes) console.log("INFO  " + n);
      console.log(`${r.failures.length ? "FAIL" : "PASS"}  ${r.configs} configurations, ${r.measured} controls, ${r.failures.length} failures; numbers in ${r.json}`);
      process.exit(r.failures.length ? 1 : 0);
    }).catch(e => { console.log("FAIL  " + (e && e.stack || e)); process.exit(1); });
}
