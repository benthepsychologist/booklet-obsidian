// The measured accessibility pass of plugin 1.0.0, run by hand (not part of plugin-check.js). One real Obsidian at a time, driven over CDP:
//   PLAYWRIGHT=<node_modules> node access-pass-100.js --obsidian <binary> --out <dir> [--tag name] [--vault ../test-vault] [--only walk,contrast,phone,axe]
// It writes <out>/<tag>-results.json and prints a line for every thing it measured. Made-up notes only (the repository's test-vault and
// test/page-notes), copied into a vault of its own for each session.
//   walk      each screen by real key presses (Tab, Shift+Tab, Escape, Enter, arrows), no pointer: the stops, their names, their rings
//   ax        the accessibility tree of each screen (Chrome's Accessibility.getFullAXTree): role, name, state of every control
//   contrast  computed colour of every text and control style the plugin draws, light and dark, with the WCAG ratio
//   phone     Obsidian's phone mode at 390x844 with the larger-text variable at 1 and 2: the Pages drawer, the Allow card, the Now playing bar
//   axe       axe-core (from the Playwright tools folder, never installed into the repository) over each screen
// What it cannot measure: speech. Nothing here hears a screen reader.
const fs = require("fs"), path = require("path");
const { launch } = require("./drive");
const { quiet, mobile } = require("./waits");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const opt = { obsidian: arg("obsidian"), out: arg("out"), vault: arg("vault", path.join(__dirname, "..", "test-vault")), only: (arg("only", "") || "").split(",").filter(Boolean), tag: arg("tag", "run") };
if (!opt.obsidian || !opt.out) { console.error("needs --obsidian <binary> and --out <dir>"); process.exit(2); }
const SRC_VAULT = path.resolve(opt.vault), OUT = path.resolve(opt.out);
fs.mkdirSync(OUT, { recursive: true });
const WORK = path.join(OUT, "work-" + Date.now());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BOOK = ".workspace-leaf-content[data-type='booklet']";
const want = k => !opt.only.length || opt.only.includes(k);
const R = { tag: opt.tag, obsidian: opt.obsidian, screens: {}, phone: {}, facts: [] };
const say = (...a) => console.log(...a);
const fact = (ok, text, extra) => { R.facts.push({ ok, text, extra }); say((ok ? "PASS " : "FAIL ") + text); };
const info = text => { R.facts.push({ info: text }); say("INFO " + text); };

// -------- the vault: the repository's made-up notes --------
const REPO = path.join(__dirname, "..");
const read = f => fs.readFileSync(f, "utf8");
const NOTES = {
  "Every kind.booklet.md": read(path.join(REPO, "test-vault", "Every kind.booklet.md")),
  "Keyboard walk.booklet.md": read(path.join(REPO, "test", "page-notes", "Keyboard walk.booklet.md")),
  "Check-in with a wiki.booklet.md": read(path.join(REPO, "test", "page-notes", "Check-in with a wiki.booklet.md")),
  "Garden dashboards.booklet.md": read(path.join(REPO, "test", "page-notes", "Garden dashboards.booklet.md")),
  // the note of docs/screen-reader-script-100.md, with its tone beside it
  "Screen reader walk.booklet.md": read(path.join(REPO, "test", "page-notes", "Screen reader walk", "Screen reader walk.booklet.md")),
  "media/tone.wav": fs.readFileSync(path.join(REPO, "test", "page-notes", "Screen reader walk", "media", "tone.wav")),
};
const front = (id, title, extra = "") => `---\nbooklet: "0.18"\nid: booklet-test/${id}\ntitle: ${title}\nlang: en\n${extra}---\n\n`;
// the media note: an allowed clip, a blocked one, a listen box; the note declares two sites that are on no list
const mediaNote = ctx => front("access-media", "Listening", `media-from:\n  - ${ctx.url("declared.example.org")}\n  - ${ctx.url("note.example.org")}\n`) + `> [!activity|a1] Listening and watching

Allowed clip: ![the allowed clip](${ctx.url("vault.example.org", "tone-60s.wav")})

Blocked clip: ![the blocked clip](${ctx.url("blocked.example.net", "tone-5s.wav")})

> [!listen|l1] Listen to the tone
> ![[tone-10s.wav]]

> [!choice|q1] A question?
- [ ] Yes
- [ ] No

> [!activity|a2] Second activity

> [!choice|q2] Another question?
- [ ] Yes
- [ ] No
`;

// -------- the media lib's environment (it only needs a launcher, a work folder and the built plugin's vault) --------
const consoleReport = [], sessions = [];
const env = { launch, opt: { obsidian: opt.obsidian }, WORK, consoleReport, sessions, SRC_VAULT };
const { withMedia } = require("./media-lib")(env);

// -------- in the page: colours, text styles, boundaries --------
const LIB = () => {
  if (window.__a11y) return;
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const px = (c, back) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = back; cx.fillRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
  // a CSS colour as {r,g,b,a}, recovered by painting it over white and over black
  const parse = c => {
    if (!c || c === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    const w = px(c, "#fff"), k = px(c, "#000");
    const a = Math.min(1, Math.max(0, 1 - ((w[0] - k[0]) + (w[1] - k[1]) + (w[2] - k[2])) / (3 * 255)));
    if (a <= 0.003) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: Math.round(k[0] / a), g: Math.round(k[1] / a), b: Math.round(k[2] / a), a };
  };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = c => "#" + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
  // the colour behind an element: every background from the top of the page down to it, laid over each other (an image or gradient is told)
  const behind = (el, stopBefore) => {
    const chain = []; let image = false;
    for (let p = stopBefore ? el.parentElement : el; p; p = p.parentElement) chain.push(p);
    let col = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = chain.length - 1; i >= 0; i--) {
      const cs = getComputedStyle(chain[i]);
      const b = parse(cs.backgroundColor);
      if (b.a > 0) col = over(b, col);
      if (cs.backgroundImage && cs.backgroundImage !== "none") image = true;
    }
    return { col, image };
  };
  const opacityOf = el => { let o = 1; for (let p = el; p; p = p.parentElement) o *= parseFloat(getComputedStyle(p).opacity); return o; };
  const shown = (e, root) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let p = e; p && p !== root.parentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (p.parentElement && p.parentElement.tagName === "DETAILS" && !p.parentElement.open && p.tagName !== "SUMMARY") return false;
    }
    return true;
  };
  const key = e => { const c = (e.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 3).join("."); return e.tagName.toLowerCase() + (c ? "." + c : ""); };
  const stateOf = e => [e.disabled ? "disabled" : "", e.getAttribute("aria-pressed") === "true" ? "pressed" : "", e.getAttribute("aria-current") ? "current" : "", e.getAttribute("aria-selected") === "true" ? "selected" : "", e.getAttribute("aria-expanded") === "true" ? "expanded" : "", e.matches && e.matches(":focus") ? "focus" : "", e.matches && e.matches("a") ? "link" : ""].filter(Boolean).join("+");
  // every element with words of its own (a text node child), its placeholder, and SVG text: colour against the colour behind
  const text = root => {
    const out = [];
    const all = [root, ...root.querySelectorAll("*")];
    for (const e of all) {
      if (!shown(e, root) || e.closest(".booklet-sr")) continue;
      const own = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(" ");
      const isSvg = e instanceof SVGElement;
      const cs = getComputedStyle(e);
      if (own && !(isSvg && !(e.tagName === "text" || e.tagName === "tspan"))) {
        let fg = parse(isSvg ? cs.fill : cs.color); const op = opacityOf(e);
        const bg = behind(e, false); fg = { ...fg, a: fg.a * op };
        const solid = over(fg, bg.col);
        const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
        const large = size >= 24 || (size >= 18.66 && bold);
        out.push({ kind: "text", key: key(e) + (stateOf(e) ? "{" + stateOf(e) + "}" : ""), fg: hex(solid), bg: hex(bg.col), ratio: ratio(solid, bg.col), size: Math.round(size * 10) / 10, bold, large, need: large ? 3 : 4.5, image: bg.image, opacity: op, sample: own.slice(0, 40) });
      }
      if ((e.tagName === "INPUT" || e.tagName === "TEXTAREA") && e.placeholder && !e.value) {
        const ph = getComputedStyle(e, "::placeholder"); let fg = parse(ph.color);
        const bg = behind(e, false); fg = { ...fg, a: fg.a * parseFloat(ph.opacity === "" ? 1 : ph.opacity) };
        const solid = over(fg, bg.col);
        out.push({ kind: "placeholder", key: key(e) + "::placeholder", fg: hex(solid), bg: hex(bg.col), ratio: ratio(solid, bg.col), size: parseFloat(cs.fontSize), need: 4.5, sample: e.placeholder.slice(0, 40) });
      }
    }
    return out;
  };
  // a control's edge against what it sits on (WCAG 1.4.11): its border, else the first box-shadow ring; and its fill
  const boundaries = root => {
    const out = [];
    for (const e of root.querySelectorAll("button, input:not([type=checkbox]):not([type=radio]), textarea, select, summary, [role=button]")) {
      if (!shown(e, root) || e.closest(".booklet-sr")) continue;
      const cs = getComputedStyle(e), under = behind(e, true);
      const bw = parseFloat(cs.borderTopWidth) || 0;
      let edge = null, via = "";
      if (bw > 0 && cs.borderTopStyle !== "none") { const c = parse(cs.borderTopColor); if (c.a > 0.01) { edge = over(c, under.col); via = "border " + bw + "px"; } }
      if (!edge && cs.boxShadow && cs.boxShadow !== "none") {
        const m = /(rgba?\([^)]*\)|color\([^)]*\))/.exec(cs.boxShadow);
        if (m) { const c = parse(m[1]); if (c.a > 0.01) { edge = over(c, under.col); via = "shadow ring"; } }
      }
      const fillc = parse(cs.backgroundColor); const fill = fillc.a > 0.01 ? over(fillc, under.col) : null;
      out.push({ kind: "boundary", key: key(e) + (stateOf(e) ? "{" + stateOf(e) + "}" : ""), via, edge: edge ? hex(edge) : null, edgeRatio: edge ? ratio(edge, under.col) : null, fill: fill ? hex(fill) : null, fillRatio: fill ? ratio(fill, under.col) : null, under: hex(under.col), sample: (e.getAttribute("aria-label") || e.textContent || e.placeholder || "").trim().slice(0, 30) });
    }
    for (const e of root.querySelectorAll("input[type=checkbox], input[type=radio]")) {
      if (!shown(e, root)) continue;
      const cs = getComputedStyle(e), under = behind(e, true);
      const bc = parse(cs.borderTopColor); const bw = parseFloat(cs.borderTopWidth) || 0;
      const edge = bc.a > 0.01 && bw > 0 ? over(bc, under.col) : null;
      out.push({ kind: "boundary", key: key(e) + (e.checked ? "{checked}" : ""), via: "checkbox border " + bw + "px", edge: edge ? hex(edge) : null, edgeRatio: edge ? ratio(edge, under.col) : null, under: hex(under.col), sample: (e.closest("label") || e).textContent.trim().slice(0, 30) });
    }
    return out;
  };
  // what a chart draws: every filled or stroked shape against the colour behind the chart
  const graphics = root => {
    const out = [];
    for (const svg of root.querySelectorAll("svg")) {
      if (!shown(svg, root) || svg.closest(".svg-icon, .lucide, .booklet-icon") || svg.classList.contains("svg-icon") || /lucide/.test(svg.getAttribute("class") || "")) continue;
      const under = behind(svg, false);
      for (const s of svg.querySelectorAll("rect, path, line, circle, polyline, polygon, ellipse")) {
        const cs = getComputedStyle(s);
        const r = s.getBoundingClientRect(); if (r.width + r.height < 1) continue;
        const fill = cs.fill !== "none" && s.tagName !== "line" ? parse(cs.fill) : null, stroke = cs.stroke !== "none" && parseFloat(cs.strokeWidth) > 0 ? parse(cs.stroke) : null;
        const op = parseFloat(cs.opacity) * parseFloat(cs.fillOpacity || 1);
        const pick = (c, o) => c && c.a * o > 0.02 ? over({ ...c, a: c.a * o }, under.col) : null;
        const f = pick(fill, op), st = pick(stroke, parseFloat(cs.opacity) * parseFloat(cs.strokeOpacity || 1));
        const owner = svg.closest("[class*=booklet-]");
        out.push({ kind: "graphic", key: (owner ? (owner.getAttribute("class") || "").split(" ")[0] : "svg") + " > " + s.tagName + (s.getAttribute("class") ? "." + s.getAttribute("class").split(" ")[0] : "") + (st && !f ? " (stroke)" : " (fill)"), colour: f ? hex(f) : st ? hex(st) : null, under: hex(under.col), ratio: f ? ratio(f, under.col) : st ? ratio(st, under.col) : null, w: Math.round(r.width), h: Math.round(r.height), sw: parseFloat(cs.strokeWidth) });
      }
    }
    return out;
  };
  // the focus ring of the focused element against what is behind it
  const ring = () => {
    const e = document.activeElement; if (!e || e === document.body) return null;
    const cs = getComputedStyle(e), under = behind(e, true);
    let c = null, via = "";
    if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) { const k = parse(cs.outlineColor); if (k.a > 0.01) { c = over(k, under.col); via = "outline " + cs.outlineWidth; } }
    if (!c && cs.boxShadow !== "none") { const m = /(rgba?\([^)]*\)|color\([^)]*\))/.exec(cs.boxShadow); if (m) { const k = parse(m[1]); if (k.a > 0.01) { c = over(k, under.col); via = "shadow " + cs.boxShadow.replace(/rgba?\([^)]*\)|color\([^)]*\)/g, "").trim(); } } }
    return { key: key(e), via, colour: c ? hex(c) : null, under: hex(under.col), ratio: c ? ratio(c, under.col) : null };
  };
  window.__a11y = { parse, over, ratio, hex, behind, text, boundaries, graphics, ring, shown, key };
};
const ensure = o => o.evaluate(LIB);

// the contrast records of everything inside `sel`, as one list
const contrastOf = async (o, sel) => {
  await ensure(o);
  return o.evaluate(sel => { const root = document.querySelector(sel); if (!root) return null; const L = window.__a11y; return [...L.text(root), ...L.boundaries(root), ...L.graphics(root)]; }, sel);
};

// -------- the accessibility tree: Chrome's own, for the controls and landmarks inside `sel` --------
const cdps = new WeakMap();
const cdpOf = async o => { if (!cdps.has(o)) { const s = await o.page.context().newCDPSession(o.page); await s.send("DOM.enable"); await s.send("Accessibility.enable"); cdps.set(o, s); } return cdps.get(o); };
const CAND = "button, input, textarea, select, summary, a[href], audio, video, [tabindex], [role], h1, h2, h3, h4, nav, dialog, ul[aria-labelledby], img, svg[role], details, table, th, [aria-live], [aria-label]";
const axOf = async (o, sel) => {
  const cdp = await cdpOf(o);
  await o.evaluate(([sel, CAND]) => {
    const root = document.querySelector(sel); if (!root) return;
    let n = 0;
    const shown = e => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let p = e; p && p !== root.parentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === "none" || cs.visibility === "hidden") return false; if (p.parentElement && p.parentElement.tagName === "DETAILS" && !p.parentElement.open && p.tagName !== "SUMMARY") return false; } return true; };
    for (const e of [root, ...root.querySelectorAll(CAND)]) { if (e !== root && !shown(e)) continue; e.setAttribute("data-axid", String(n++)); }
  }, [sel, CAND]);
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-axid]" });
  const back = new Map();
  for (const nodeId of nodeIds) {
    const d = (await cdp.send("DOM.describeNode", { nodeId })).node;
    const a = d.attributes || []; const at = {};
    for (let i = 0; i < a.length; i += 2) at[a[i]] = a[i + 1];
    back.set(d.backendNodeId, { id: +at["data-axid"], tag: d.localName, attrs: at });
  }
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const rows = [];
  for (const nd of nodes) {
    const b = back.get(nd.backendDOMNodeId); if (!b) continue;
    const props = {}; for (const p of nd.properties || []) props[p.name] = p.value && p.value.value;
    rows.push({ id: b.id, tag: b.tag, cls: (b.attrs.class || "").split(" ")[0], ignored: !!nd.ignored, role: nd.role && nd.role.value, name: (nd.name && nd.name.value) || "", desc: (nd.description && nd.description.value) || "", value: nd.value && nd.value.value, props, domAria: Object.fromEntries(Object.entries(b.attrs).filter(([k]) => k.startsWith("aria-") || k === "role" || k === "tabindex")) });
  }
  await o.evaluate(() => document.querySelectorAll("[data-axid]").forEach(e => e.removeAttribute("data-axid")));
  rows.sort((x, y) => x.id - y.id);
  return rows;
};
const INTERACTIVE = new Set(["button", "link", "checkbox", "radio", "textbox", "searchbox", "combobox", "slider", "spinbutton", "tab", "menuitem", "switch", "listbox", "option", "treeitem", "DisclosureTriangle", "PopUpButton", "DateField", "SearchBox", "TextField", "ComboBoxSelect", "Audio", "Video", "date", "InputTime", "menuitemcheckbox", "menuitemradio", "audio", "video"]);
const STATES = ["expanded", "selected", "pressed", "checked", "current", "disabled", "invalid", "required", "level", "haspopup", "controls", "modal"];
const SHOWN_FALSE = new Set(["expanded", "selected", "pressed", "checked"]);
const axLine = r => `${r.role}${r.name ? ` "${r.name.replace(/\s+/g, " ").slice(0, 70)}"` : " (no name)"}${STATES.filter(st => r.props[st] !== undefined && (SHOWN_FALSE.has(st) || (r.props[st] !== false && r.props[st] !== "false"))).map(st => " " + st + "=" + r.props[st]).join("")}${r.domAria["aria-current"] ? " current=" + r.domAria["aria-current"] : ""}${r.desc ? ` {desc: ${r.desc.replace(/\s+/g, " ").slice(0, 60)}}` : ""}`;
const axFindings = (rows, where) => {
  const f = [];
  for (const r of rows) {
    if (r.ignored) continue;
    const interactive = INTERACTIVE.has(r.role);
    if (interactive && !r.name.trim()) f.push({ where, what: "no name", row: axLine(r), tag: r.tag + "." + r.cls });
    if (interactive && /^(button|link|click here|here|more|image|icon|x)$/i.test(r.name.trim())) f.push({ where, what: "generic name", row: axLine(r), tag: r.tag + "." + r.cls });
    if (["generic", "none", "StaticText", "paragraph", "presentation"].includes(r.role) && r.domAria.tabindex !== undefined && r.domAria.tabindex !== "-1") f.push({ where, what: "focusable with no role", row: axLine(r), tag: r.tag + "." + r.cls });
    if ((r.tag === "div" || r.tag === "span") && /^booklet-(choice|tabbtn|pagelink|media-play|pagesbtn)$/.test(r.cls)) f.push({ where, what: "a div or span used as a control", row: axLine(r), tag: r.tag + "." + r.cls });
  }
  return f;
};

// -------- keys --------
const key = async (o, k) => { await o.page.keyboard.press(k); await sleep(45); };
const focusRow = (o, rootSel) => o.evaluate(rootSel => {
  const e = document.activeElement; if (!e || e === document.body) return { none: true, body: true };
  const root = rootSel ? document.querySelector(rootSel) : null;
  const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
  const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 && !/rgba\(\d+, \d+, \d+, 0\)/.test(cs.outlineColor);
  const shadow = cs.boxShadow !== "none";
  const nm = (e.getAttribute("aria-label") || (e.getAttribute("aria-labelledby") ? e.getAttribute("aria-labelledby").split(" ").map(i => (document.getElementById(i) || {}).textContent || "").join(" ") : "") || (e.labels && e.labels[0] && e.labels[0].textContent) || e.getAttribute("placeholder") || e.textContent || e.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const inRoot = root ? root.contains(e) : true;
  window.__wid = window.__wid || 0; if (!e.__wid) e.__wid = ++window.__wid;
  return { ringc: window.__a11y ? window.__a11y.ring() : null, wid: e.__wid, inRoot, tag: e.tagName.toLowerCase(), type: e.type || "", cls: (e.getAttribute("class") || "").split(" ")[0], role: e.getAttribute("role") || "", name: nm, ring: outline || shadow, ringKind: outline ? "outline " + cs.outlineWidth + " " + cs.outlineStyle : shadow ? "shadow" : "none", fv: e.matches(":focus-visible"), onScreen: r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth, expanded: e.getAttribute("aria-expanded"), pressed: e.getAttribute("aria-pressed"), checked: e.getAttribute("aria-checked") || (e.type === "checkbox" ? String(e.checked) : null), current: e.getAttribute("aria-current"), selected: e.getAttribute("aria-selected") };
}, rootSel);
// Tab through `rootSel` from where focus is: stops until focus leaves the root (a view) or comes round to the first stop again (a dialog)
async function walkTab(o, rootSel, { limit = 120, modal = false, first = false } = {}) {
  const stops = [], outside = [];
  let entered = false, left = false, cycled = false, lost = 0;
  if (first) { const s = await focusRow(o, rootSel); if (!s.none && s.inRoot) { entered = true; stops.push(s); } }
  for (let i = 0; i < limit; i++) {
    await key(o, "Tab");
    const s = await focusRow(o, rootSel);
    if (s.none) { lost++; continue; }
    if (s.inRoot) {
      entered = true;
      const dup = stops.length > 2 && stops[0].name === s.name && stops[0].cls === s.cls && stops[0].tag === s.tag;
      if (dup && modal) { cycled = true; break; }
      stops.push(s);
    } else if (entered) { left = true; outside.push(s.cls || s.tag); break; } else outside.push(s.cls || s.tag);
  }
  return { stops, outside, entered, left, cycled, lost };
}
const startAtPaneTab = async o => { await o.evaluate(() => { const h = document.querySelector(".workspace-tab-header.is-active"); if (h) h.focus(); }); await sleep(80); };
const summariseWalk = (w, label) => {
  // a control with several stops (a date field: month, day, year, picker) passes if any one of its stops shows a ring
  const ringed = new Set(w.stops.filter(s => s.ring).map(s => s.wid));
  const noRing = w.stops.filter(s => !ringed.has(s.wid)).filter((s, i, a) => a.findIndex(x => x.wid === s.wid) === i), off = w.stops.filter(s => !s.onScreen), noName = w.stops.filter(s => !s.name && s.tag !== "audio" && s.tag !== "video");
  return { label, stops: w.stops.length, entered: w.entered, left: w.left, cycled: w.cycled, focusLostToBody: w.lost, noRing: noRing.map(s => s.tag + "." + s.cls + ' "' + s.name + '"'), offScreen: off.map(s => s.tag + ' "' + s.name + '"'), noName: noName.map(s => s.tag + "." + s.cls), rings: [...new Map(w.stops.filter(s => s.ringc).map(s => [s.ringc.key + "|" + s.ringc.via + "|" + s.ringc.colour + "|" + s.ringc.under, s.ringc])).values()].map(r => ({ ...r, ratio: r.ratio === null ? null : Math.round(r.ratio * 100) / 100 })), list: w.stops.map(s => `${s.tag}${s.role ? "[" + s.role + "]" : ""}${s.type && s.type !== "submit" && s.type !== "button" ? "(" + s.type + ")" : ""} "${s.name}"${s.expanded ? " expanded=" + s.expanded : ""}${s.pressed ? " pressed=" + s.pressed : ""}${s.checked ? " checked=" + s.checked : ""}${s.current ? " current=" + s.current : ""}${s.selected ? " selected=" + s.selected : ""}${s.ring ? "" : " NO-RING"}`) };
};

// -------- going places --------
const bookletReady = async (o, rel) => {
  // one booklet pane at a time: an earlier one left in the background would be found first
  await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
  await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, rel, { timeout: 30000, polling: 100 });
  await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, rel);
  await o.page.waitForFunction(() => { const l = app.workspace.getLeavesOfType("booklet")[0]; return !!(l && l.view.contentEl.querySelector(".booklet-page")); }, null, { timeout: 20000, polling: 100 });
  await sleep(400);
  await quiet(o);
};
const goPlace = async (o, st) => {
  await o.evaluate(async st => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 2, ...st }, active: true }); }, st);
  await sleep(500); await quiet(o);
};
const shot = async (o, name) => { try { await o.screenshot(path.join(OUT, "shots", opt.tag + "-" + name + ".png")); } catch (e) { /* a picture is a help */ } };
const AXE = [process.env.AXE_CORE, path.join(process.env.PLAYWRIGHT || "", "axe-core", "axe.min.js"), path.join(path.dirname(process.env.PLAYWRIGHT || ""), "axe-core", "axe.min.js")].filter(Boolean).find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
const axeOn = async (o, sel) => {
  if (!AXE) return { error: "axe-core not found" };
  if (!(await o.evaluate(s => !!document.querySelector(s), sel))) return { error: "no element for " + sel };
  // loaded into the window being measured (a settings window of its own is not the main window, and a require would bind axe to that one)
  if (!(await o.evaluate(() => !!window.axe))) await o.page.addScriptTag({ content: fs.readFileSync(AXE, "utf8") }).catch(async () => { await o.evaluate(p => { window.axe = require(p); }, AXE); });
  return o.evaluate(async sel => { const r = await window.axe.run(document.querySelector(sel), { preload: false, runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } }); return { version: window.axe.version, violations: r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => ({ target: n.target.join(" "), summary: (n.failureSummary || "").split("\n").slice(1, 3).join(" ").slice(0, 200) })).slice(0, 6), count: v.nodes.length })), passes: r.passes.length, incomplete: r.incomplete.map(v => ({ id: v.id, count: v.nodes.length })) }; }, sel);
};
const labelOf = `(document.activeElement.getAttribute("class") || document.activeElement.tagName) + " " + (document.activeElement.getAttribute("aria-label") || document.activeElement.textContent || "").trim().slice(0, 30)`;

// one screen: the walk, the tree, axe, contrast in both schemes
async function screen(o, name, { rootSel, setup, walk = true, keys = null, modal = false, schemes = true, limit = 120, startFocus = null }) {
  say("== screen: " + name);
  const S = R.screens[name] = { name };
  if (setup) await setup();
  await ensure(o);
  const rs = rootSel;
  S.ax = (await axOf(o, rs)).filter(r => !r.ignored);
  S.axFindings = axFindings(S.ax, name);
  S.axText = S.ax.filter(r => INTERACTIVE.has(r.role) || ["heading", "navigation", "dialog", "tablist", "tabpanel", "radiogroup", "group", "status", "alert", "list", "region", "img", "table", "columnheader", "rowheader", "cell"].includes(r.role)).map(axLine);
  say(`   tree: ${S.ax.length} nodes, ${S.ax.filter(r => INTERACTIVE.has(r.role)).length} controls, findings ${S.axFindings.length}`);
  for (const f of S.axFindings) say("   AXFINDING " + f.what + ": " + f.row + " <" + f.tag + ">");
  if (walk) {
    if (startFocus) await startFocus(); else if (!modal) await startAtPaneTab(o);
    const w = await walkTab(o, rs, { limit, modal, first: !!startFocus });
    S.walk = summariseWalk(w, name);
    fact(w.entered && (modal ? w.cycled : w.left), `${name}: Tab ${modal ? "stays in the dialog and comes round" : "enters the view and leaves it again"} (${w.stops.length} stops)`);
    fact(S.walk.noRing.length === 0, `${name}: every stop shows a focus ring${S.walk.noRing.length ? " (without: " + S.walk.noRing.join(" | ") + ")" : ""}`);
    fact(w.lost === 0, `${name}: focus never fell to the page body (${w.lost} times)`);
    fact(S.walk.offScreen.length === 0, `${name}: focus always in sight${S.walk.offScreen.length ? " (not: " + S.walk.offScreen.join(" | ") + ")" : ""}`);
    fact(S.walk.noName.length === 0, `${name}: every stop has a name${S.walk.noName.length ? " (not: " + S.walk.noName.join(", ") + ")" : ""}`);
    if (keys) await keys(S);
  }
  if (AXE && want("axe")) {
    S.axe = await axeOn(o, rs).catch(e => ({ error: "axe-core could not run here: " + String(e.message).split("\n")[0] }));
    if (S.axe.error) say("   axe: " + S.axe.error);
    if (S.axe.violations) { say(`   axe-core ${S.axe.version}: ${S.axe.violations.length} violation kinds, ${S.axe.violations.reduce((n, v) => n + v.count, 0)} nodes`); for (const v of S.axe.violations) say("   AXE " + v.id + " (" + v.impact + ") x" + v.count + ": " + v.nodes.map(n => n.target).join(" ; ").slice(0, 200)); }
  }
  if (want("contrast")) {
    S.contrast = {};
    for (const scheme of schemes ? ["light", "dark"] : [null]) {
      if (scheme) { await o.setScheme(scheme); await sleep(350); await ensure(o); }
      S.contrast[scheme || "current"] = await contrastOf(o, rs);
    }
    if (schemes) { await o.setScheme("light"); await sleep(250); }
  }
  await shot(o, name.replace(/[^a-z0-9]+/gi, "-"));
  return S;
}
const save = () => fs.writeFileSync(path.join(OUT, opt.tag + "-results.json"), JSON.stringify(R, null, 1));

(async () => {
  say("Obsidian:", opt.obsidian, "tag", opt.tag, "axe:", AXE || "not found");
  const dataFor = ctx => ({ allowedMediaHosts: [ctx.host("vault.example.org"), ctx.host("media.example.org")], noteAllows: {} });
  const files = ctx => ({ ...NOTES, "Listening.booklet.md": mediaNote(ctx) });
  const cardButton = (text) => o => o.evaluate(t => { const c = document.querySelector(".booklet-allow-card"); const b = c && [...c.querySelectorAll("button")].find(x => x.textContent === t); if (b) b.click(); return !!b; }, text);

  // ================== desktop session: the screens of a note ==================
  await withMedia("desk", { note: "Garden dashboards.booklet.md", data: dataFor, files }, async (o, ctx) => {
    info("user agent: " + await o.evaluate(() => navigator.userAgent));
    R.obsidianVersion = await o.evaluate(() => (navigator.userAgent.match(/obsidian\/([\d.]+)/i) || [])[1]); R.userAgent = await o.evaluate(() => navigator.userAgent);
    const root = BOOK + " .view-content";
    // ---- 1 home (opening screen) ----
    await bookletReady(o, "Every kind.booklet.md");
    await screen(o, "home (Every kind)", { rootSel: root, setup: () => goPlace(o, { screen: "home", part: 0 }) });
    // ---- 2 tab bar, then the Pages button ----
    await bookletReady(o, "Check-in with a wiki.booklet.md");
    const KEY = "activity:calm/check-in";
    await screen(o, "tab bar and a wiki page, Pages closed", {
      rootSel: root, setup: () => goPlace(o, { screen: KEY, tab: "wiki", part: 5 }),
      keys: async S => {
        await o.evaluate(() => { const b = document.querySelector(".booklet-tabbtn.is-active, .booklet-tabbtn[aria-selected=true]"); if (b) b.focus(); });
        const before = await focusRow(o, root); const seq = [before.name + (before.selected ? " selected=" + before.selected : "")];
        for (const k of ["ArrowRight", "ArrowRight", "ArrowLeft", "End", "Home"]) { await key(o, k); const s = await focusRow(o, root); seq.push(k + ":" + (s.none ? "BODY" : s.name + (s.selected ? " selected=" + s.selected : ""))); }
        S.tabArrowKeys = seq; info("tab bar arrow keys: " + seq.join(" | "));
      },
    });
    await screen(o, "Pages side panel open (wide pane)", {
      rootSel: root, setup: async () => { await goPlace(o, { screen: KEY, tab: "wiki", part: 5 }); await o.evaluate(() => { const b = document.querySelector(".booklet-pagesbtn"); if (b.getAttribute("aria-expanded") !== "true") b.click(); }); await sleep(300); },
      keys: async S => {
        const res = {};
        const open = async () => { await o.evaluate(() => { const b = document.querySelector(".booklet-pagesbtn"); if (b.getAttribute("aria-expanded") !== "true") b.click(); }); await sleep(250); };
        const state = () => o.evaluate(l => ({ expanded: document.querySelector(".booklet-pagesbtn").getAttribute("aria-expanded"), hidden: document.querySelector(".booklet-pagemenu").hidden, ae: eval(l) }), labelOf);
        await o.evaluate(() => { const b = document.querySelector(".booklet-pagesbtn"); if (b.getAttribute("aria-expanded") === "true") b.click(); }); await sleep(200);
        await o.evaluate(() => document.querySelector(".booklet-pagesbtn").focus()); await key(o, "Enter"); res.enterOnButton = await state();
        await o.page.keyboard.type("tide"); await key(o, "Escape"); res.escClearsWordsFirst = { ...(await state()), value: await o.evaluate(() => document.querySelector(".booklet-pagemenu input").value) };
        await key(o, "Escape"); res.escFromSearchClosesAndReturnsToButton = await state();
        await open(); await o.evaluate(() => document.querySelector(".booklet-pagelink").focus()); await key(o, "Escape"); res.escFromALink = await state();
        await open(); await o.evaluate(() => document.querySelector(".booklet-pagemenu-close").focus()); await key(o, "Enter"); res.closeButtonByEnter = await state();
        await open(); await o.evaluate(() => document.querySelector(".booklet-pagesbtn").focus()); await key(o, "Escape"); res.escFromTheButtonItself = await state();
        await open(); await o.evaluate(() => { const t = document.querySelector(".booklet-pagetitle"); if (t) { t.setAttribute("tabindex", "-1"); t.focus(); } }); await key(o, "Escape"); res.escFromThePageBody = await state();
        S.pagesKeys = res; info("Pages keys: " + JSON.stringify(res));
        await open();
      },
    });
    await screen(o, "Pages side panel with a search", {
      rootSel: root, walk: false, setup: async () => { await o.evaluate(() => { const i = document.querySelector(".booklet-pagemenu input"); i.focus(); }); await o.page.keyboard.type("grid"); await sleep(250); },
    });
    await o.evaluate(() => { const b = document.querySelector(".booklet-pagesbtn"); if (b.getAttribute("aria-expanded") === "true") b.click(); });
    // ---- 3 question kinds ----
    await bookletReady(o, "Keyboard walk.booklet.md");
    await screen(o, "page with every question kind (Keyboard walk)", { rootSel: root, setup: () => goPlace(o, { screen: "activity:/walk", part: 0 }), limit: 200 });
    await o.evaluate(() => { const v = document.querySelector(".workspace-leaf-content[data-type='booklet']"); for (const q of ["fruit", "tools", "sure"]) { const b = v.querySelector(`[data-booklet-q='${q}'] button`); if (b) b.click(); } });
    await sleep(900); await quiet(o);
    await screen(o, "same page with questions answered", { rootSel: root, walk: false });
    // ---- 3b the note Ben's screen-reader script uses: it must open, show its tabs and pages, and open the card on its own ----
    await bookletReady(o, "Screen reader walk.booklet.md");
    {
      const up = await o.page.waitForFunction(() => !!document.querySelector(".booklet-allow-card"), null, { timeout: 5000 }).then(() => true).catch(() => false);
      fact(up, "Screen reader walk note: the Allow card opens on its own on open (the note names a site that is not allowed)");
      if (up) { await o.evaluate(() => { const c = document.querySelector(".booklet-allow-card"); const b = [...c.querySelectorAll("button")].find(x => x.textContent === "Not now"); b && b.click(); }); await sleep(300); }
      for (const [tab, part] of [["read", 0], ["answer", 0], ["answer", 1], ["listen", 0]]) {
        await goPlace(o, { screen: "activity:/walk", tab, part });
        const d = await o.evaluate(() => ({ tabs: [...document.querySelectorAll(".booklet-tabbtn")].map(b => b.textContent.trim()), title: (document.querySelector(".booklet-pagetitle") || document.querySelector(".booklet-screentitle") || {}).textContent, pagesBtn: !!document.querySelector(".booklet-pagesbtn"), questions: document.querySelectorAll("[data-booklet-q]").length, listen: document.querySelectorAll(".booklet-listen-tick, audio").length }));
        info("Screen reader walk, tab " + tab + " part " + part + ": " + JSON.stringify(d));
      }
      await screen(o, "Screen reader walk note: Listen tab", { rootSel: root, setup: () => goPlace(o, { screen: "activity:/walk", tab: "listen", part: 0 }), schemes: false, walk: false });
      await screen(o, "Screen reader walk note: Answer tab", { rootSel: root, setup: () => goPlace(o, { screen: "activity:/walk", tab: "answer", part: 0 }), schemes: false });
    }
    // ---- 4 table / chart views ----
    await screen(o, "kept days: table, bars, line (Keyboard walk tally)", { rootSel: root, setup: () => goPlace(o, { screen: "activity:/tally", part: 0 }), limit: 200 });
    await bookletReady(o, "Garden dashboards.booklet.md");
    for (const a of ["bars", "lines", "kept", "data"]) await screen(o, "Garden dashboards: " + a, { rootSel: root, setup: () => goPlace(o, { screen: "activity:/" + a, part: 0 }), limit: 200 });
    save();
    // ---- 5 the Allow card and Settings ----
    await bookletReady(o, "Listening.booklet.md");
    const cardUp = await o.page.waitForFunction(() => !!document.querySelector(".booklet-allow-card"), null, { timeout: 6000 }).then(() => true).catch(() => false);
    fact(cardUp, "Allow card: opens on its own on note open for the sites the note names");
    if (cardUp) {
      await screen(o, "Allow card, sites a note names", {
        rootSel: ".booklet-allow", modal: true, keys: async S => {
          const res = {}; const state = () => o.evaluate(l => ({ card: !!document.querySelector(".booklet-allow-card"), ae: eval(l) }), labelOf);
          await o.evaluate(() => document.querySelector(".booklet-allow-card h2").focus()); await key(o, "Shift+Tab"); res.shiftTabFromTitle = await state();
          await o.evaluate(() => { document.activeElement.blur(); }); res.bodyFocus = await state(); await key(o, "Tab"); res.tabFromBody = await state(); await key(o, "Escape"); res.escFromFocusOnBody = await state();
          S.keys = res; info("Allow card keys: " + JSON.stringify(res));
        },
      });
    }
    if (await o.evaluate(() => !!document.querySelector(".booklet-allow-card"))) { await cardButton("Not now")(o); await sleep(300); }
    // the Allow list button, then Escape with focus on a control BEHIND the card (defect i)
    await goPlace(o, { screen: "activity:/a1", part: 0 });
    await o.evaluate(() => { const b = document.querySelector(".booklet-allow-btn"); b && b.click(); }); await sleep(400);
    if (await o.evaluate(() => !!document.querySelector(".booklet-allow-card"))) {
      await o.evaluate(() => { const q = document.querySelector(".booklet-view button.booklet-choice"); if (q) q.focus(); });
      const where = await o.evaluate(() => (document.activeElement.getAttribute("class") || "") + (document.activeElement.closest(".booklet-allow-card") ? " (inside the card)" : " (behind the card)"));
      await key(o, "Escape"); await sleep(250);
      const closed = await o.evaluate(() => !document.querySelector(".booklet-allow-card"));
      R.escOutsideCard = { focusWas: where, closed }; fact(closed, "Allow card defect (i): Escape with focus on " + where + " closes the card");
      if (!closed) await cardButton("Close")(o);
      await sleep(250);
      // Escape from the page body
      await o.evaluate(() => { const b = document.querySelector(".booklet-allow-btn"); b && b.click(); }); await sleep(400);
      await o.evaluate(() => document.activeElement.blur && document.activeElement.blur());
      await key(o, "Escape"); await sleep(250);
      const closed2 = await o.evaluate(() => !document.querySelector(".booklet-allow-card"));
      fact(closed2, "Allow card defect (i): Escape with focus on the page body (nothing focused) closes the card");
      if (!closed2) await cardButton("Close")(o);
      await sleep(250);
    }
    // the media request card
    await goPlace(o, { screen: "activity:/a1", part: 0 });
    await o.page.locator(BOOK + " .booklet-media-play", { hasText: "blocked clip" }).first().click({ timeout: 5000 }).catch(e => info("press on the blocked clip: " + e.message.slice(0, 80)));
    await sleep(500);
    if (await o.evaluate(() => !!document.querySelector(".booklet-allow-card"))) {
      await screen(o, "Allow card, a press on blocked media", { rootSel: ".booklet-allow", modal: true });
      await cardButton("Not now")(o); await sleep(300);
    }
    await o.evaluate(() => { const b = document.querySelector(".booklet-allow-btn"); b && b.click(); }); await sleep(400);
    if (await o.evaluate(() => !!document.querySelector(".booklet-allow-card"))) {
      await screen(o, "Allow card, the Allow list (no request)", { rootSel: ".booklet-allow", modal: true });
      await key(o, "Escape"); await sleep(250);
      const ret = await o.evaluate(l => ({ closed: !document.querySelector(".booklet-allow-card"), ae: eval(l) }), labelOf);
      R.escFromCardReturnsTo = ret; fact(ret.closed && /booklet-allow-btn/.test(ret.ae), "Allow card: Escape closes it and focus returns to the Allow list button (" + ret.ae + ")");
    }
    await o.evaluate(async () => { await app.setting.open(); await app.setting.openTabById("booklet"); });
    await sleep(1200);
    {
      let sp = null;
      for (const p of o.page.context().pages()) if (await p.evaluate(() => !!document.querySelector(".vertical-tab-content")).catch(() => false)) sp = p;
      const own = sp && sp !== o.page;
      info("settings page is drawn in " + (own ? "a window of its own" : "the main window"));
      R.settingsWindow = own ? "own" : "main";
      if (sp) {
        await sp.bringToFront().catch(() => {});
        const so = own ? { page: sp, evaluate: (f, a) => sp.evaluate(f, a), setScheme: o.setScheme, screenshot: async f => { fs.mkdirSync(path.dirname(path.resolve(f)), { recursive: true }); await sp.screenshot({ path: f }); } } : o;
        // only the plugin's own part: Obsidian's sidebar of settings tabs is not ours to measure
        const rootSel = ".vertical-tab-content";
        await screen(so, "Settings page (Booklet allow list)", { rootSel, limit: 60, startFocus: async () => { await so.evaluate(() => { const t = document.querySelector(".vertical-tab-content"); t.scrollTop = 0; const f = t.querySelector("button, input, a[href], [tabindex='0']"); f && f.focus(); }); await sleep(100); } });
        // defect (ii): with Settings open, a card opened in the main window keeps the focus and Escape closes it before Settings
        await o.page.bringToFront().catch(() => {});
        await o.evaluate(() => { const b = document.querySelector(".booklet-allow-btn"); b && b.click(); }); await sleep(600);
        const over = await o.evaluate(l => ({ card: !!document.querySelector(".booklet-allow-card"), focusInCard: !!document.activeElement.closest(".booklet-allow-card"), ae: eval(l), settingsInMain: !!document.querySelector(".vertical-tab-content") }), labelOf);
        if (own) { over.settingsStillOpen = await sp.evaluate(() => !!document.querySelector(".vertical-tab-content")).catch(() => false); }
        await o.page.keyboard.press("Escape"); await sleep(400);
        over.afterEscape = await o.evaluate(() => ({ card: !!document.querySelector(".booklet-allow-card"), settingsInMain: !!document.querySelector(".vertical-tab-content") }));
        if (own) over.afterEscape.settingsStillOpen = await sp.evaluate(() => !!document.querySelector(".vertical-tab-content")).catch(() => false);
        R.overSettings = over; info("over Settings: " + JSON.stringify(over));
        fact(over.card && over.focusInCard && !over.afterEscape.card && (over.afterEscape.settingsInMain || over.afterEscape.settingsStillOpen), "Allow card defect (ii): over an open Settings the card keeps focus and Escape closes the card first (settings stay open)");
        if (await o.evaluate(() => !!document.querySelector(".booklet-allow-card"))) await cardButton("Close")(o);
        await sp.bringToFront().catch(() => {});
        await sp.keyboard.press("Escape"); await sleep(400);
        info("settings page closed by Escape: " + (own ? await sp.evaluate(() => 1).then(() => false).catch(() => true) : await o.evaluate(() => !document.querySelector(".modal-container.mod-settings"))));
        if (!own) await o.evaluate(() => app.setting.close && app.setting.close());
        else await o.evaluate(() => app.setting.close && app.setting.close());
      }
    }
    save();
    // ---- 6 Now playing ----
    await goPlace(o, { screen: "activity:/a1", part: 0 });
    await o.page.locator(BOOK + " .booklet-media-play", { hasText: "allowed clip" }).first().click({ timeout: 5000 }).catch(e => info("press on the allowed clip: " + e.message.slice(0, 80)));
    await sleep(900);
    await goPlace(o, { screen: "activity:/a2", part: 0 });
    const bar = await o.evaluate(() => !!document.querySelector(".booklet-nowplaying"));
    fact(bar, "Now playing bar: shows after the page is left while a clip plays");
    if (bar) {
      await screen(o, "Now playing bar", { rootSel: ".booklet-nowplaying", walk: false });
      await o.evaluate(() => { const v = document.querySelector(".workspace-leaf-content[data-type='booklet']"); const items = [...v.querySelectorAll("button, input, a[href], [tabindex='0']")].filter(e => e.getBoundingClientRect().width > 0); items.at(-1).focus(); });
      const seq = []; let reached = false;
      for (let i = 0; i < 40; i++) { await key(o, "Tab"); const s = await focusRow(o, ".booklet-nowplaying"); if (s.none) { seq.push("BODY"); continue; } if (s.inRoot) { reached = true; seq.push(s); } else if (reached) break; }
      const stops = seq.filter(x => x !== "BODY");
      R.screens["Now playing bar"].walk = summariseWalk({ stops, entered: reached, left: true, lost: seq.length - stops.length, cycled: false }, "Now playing bar");
      fact(reached, "Now playing bar: Tab from the page reaches it (" + stops.length + " stops: " + stops.map(s => s.tag + ' "' + s.name + '"').join(", ") + ")");
      fact(stops.filter(x => !x.ring && x.tag !== "audio").length === 0, "Now playing bar: its buttons show a focus ring");
    }
  }).catch(e => { say("DESK SESSION FAILED " + e.stack); R.deskError = String(e.stack); });
  save();

  // ================== phone session ==================
  if (want("phone")) await withMedia("phone", { note: "Check-in with a wiki.booklet.md", data: dataFor, files }, async (o, ctx) => {
    await o.page.setViewportSize({ width: 390, height: 844 });
    await mobile(o, true);
    const root = ".workspace-leaf.mod-active " + BOOK.slice(0) + " .view-content";
    // overflow, overlap, small targets of the view
    const fit = () => o.evaluate(sel => {
      const view = document.querySelector(sel); const vw = innerWidth;
      const shown = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
      const nm = e => (e.getAttribute("class") || e.tagName).split(" ")[0];
      const sideways = []; for (const b of [document.documentElement, view, view.querySelector(".booklet-view"), document.querySelector(".booklet-allow-card"), document.querySelector(".booklet-pagemenu"), document.querySelector(".booklet-nowplaying")].filter(Boolean)) if (b.scrollWidth > b.clientWidth + 1) sideways.push(nm(b) + " " + b.scrollWidth + ">" + b.clientWidth);
      const wide = [...document.querySelectorAll(sel + " *, .booklet-allow *, .booklet-nowplaying *")].filter(e => shown(e) && !e.closest("svg, .booklet-sr, audio, video") && e.getBoundingClientRect().right > vw + 1).map(e => nm(e) + " +" + Math.round(e.getBoundingClientRect().right - vw)).slice(0, 5);
      const cut = []; for (const e of document.querySelectorAll(sel + " *, .booklet-allow *, .booklet-nowplaying *")) { if (!shown(e) || e.closest("svg, .booklet-sr, .callout")) continue; const c = getComputedStyle(e); if (e.scrollWidth > e.clientWidth + 1 && c.overflowX !== "visible" && !/(auto|scroll)/.test(c.overflowX) && e.clientWidth > 0) cut.push("x " + nm(e) + " " + e.scrollWidth + ">" + e.clientWidth); else if (c.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1) cut.push("ellipsis " + nm(e)); else if (e.scrollHeight > e.clientHeight + 1 && /(hidden|clip)/.test(c.overflowY) && e.clientHeight > 0) cut.push("y " + nm(e) + " " + e.scrollHeight + ">" + e.clientHeight); }
      const card = document.querySelector(".booklet-allow-card"), drawer = document.querySelector(".booklet-pagemenu:not([hidden])");
      const over = card ? ".booklet-allow-card" : document.querySelector(".booklet-nowplaying") ? ".booklet-nowplaying" : drawer && getComputedStyle(drawer).position === "absolute" ? ".booklet-pagenav" : null;
      const ctl = [...document.querySelectorAll(over ? over + " :is(button, input, a[href], summary, select, textarea)" : sel + " :is(button, input, a[href], summary, select, textarea), .booklet-nowplaying :is(button, a[href])")].filter(shown).map(e => ({ e, r: e.getBoundingClientRect(), n: (e.getAttribute("aria-label") || e.textContent || e.placeholder || e.tagName).trim().slice(0, 24) }));
      // what of a control is on screen: its box cut by every box inside the view that scrolls or clips (the view's own scroll is not one: a control below the fold is still laid out)
      const visible = e => { let r = e.getBoundingClientRect(); r = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; for (let p = e.parentElement; p && p !== view && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(c.overflowY + c.overflowX)) { const q = p.getBoundingClientRect(); r = { left: Math.max(r.left, q.left), right: Math.min(r.right, q.right), top: Math.max(r.top, q.top), bottom: Math.min(r.bottom, q.bottom) }; } } return r.right - r.left > 0.5 && r.bottom - r.top > 0.5 ? r : null; };
      for (const c of ctl) c.v = visible(c.e);
      for (let k = ctl.length - 1; k >= 0; k--) if (!ctl[k].v) ctl.splice(k, 1);
      const overlaps = []; for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) { const a = ctl[i], b = ctl[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue; const w = Math.min(a.v.right, b.v.right) - Math.max(a.v.left, b.v.left), h = Math.min(a.v.bottom, b.v.bottom) - Math.max(a.v.top, b.v.top); if (w > 2 && h > 2) overlaps.push(a.n + " x " + b.n); }
      const small = ctl.filter(c => (c.r.height < 44 || c.r.width < 44) && !(c.e.tagName === "A" && c.e.closest("li, p, .booklet-trail, .booklet-pagelist, .booklet-card")) && c.e.type !== "checkbox" && c.e.type !== "radio").map(c => c.n + " " + Math.round(c.r.width) + "x" + Math.round(c.r.height)).slice(0, 8);
      return { vw, vh: innerHeight, font: parseFloat(getComputedStyle(document.body).fontSize), sideways, wide, cut: cut.slice(0, 8), overlaps: overlaps.slice(0, 8), small, controls: ctl.length };
    }, root);
    info("phone body: " + await o.evaluate(() => (document.body.className.match(/is-(phone|tablet)/) || [])[0] + " font " + getComputedStyle(document.body).fontSize));
    for (const zoom of [1, 2]) {
      await o.evaluate(z => document.body.style.setProperty("--preferred-text-scale", String(z)), zoom);
      await sleep(400);
      let px = await o.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
      if (zoom === 2 && px < 30) {
        // this Obsidian does not read the scale variable: its own font size setting, at 32 px (the slider's own top is 30; the config takes more)
        await o.evaluate(() => { app.vault.setConfig("baseFontSizeAction", true); app.vault.setConfig("baseFontSize", 32); if (app.updateFontSize) app.updateFontSize(); app.workspace.trigger("css-change"); });
        await sleep(600);
        px = await o.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
        info("text 200%: the scale variable did not move this Obsidian; its own font size setting at 32 gave a body font of " + px + " px");
      }
      if (zoom === 1 && px > 17) { await o.evaluate(() => { app.vault.setConfig("baseFontSize", 16); if (app.updateFontSize) app.updateFontSize(); }); }
      await sleep(300);
      const tag = zoom === 2 ? "200%" : "100%";
      const rec = R.phone[tag] = { fontPx: await o.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize)) };
      await bookletReady(o, "Check-in with a wiki.booklet.md");
      await goPlace(o, { screen: "activity:calm/check-in", tab: "wiki", part: 5 });
      rec.page = await fit(); say(tag, "wiki page", JSON.stringify(rec.page)); await shot(o, "phone-page-" + zoom);
      await o.evaluate(() => { const b = document.querySelector(".booklet-pagesbtn"); if (b.getAttribute("aria-expanded") !== "true") b.click(); }); await sleep(450);
      rec.drawer = await fit();
      rec.drawerBox = await o.evaluate(l => { const p = document.querySelector(".booklet-pagemenu"), r = p.getBoundingClientRect(), cs = getComputedStyle(p), list = p.querySelector(".booklet-pagelist"); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), vh: innerHeight, position: cs.position, scrollsInside: !!list && list.scrollHeight > list.clientHeight + 1, focus: eval(l) }; }, labelOf);
      say(tag, "drawer", JSON.stringify(rec.drawer), JSON.stringify(rec.drawerBox)); await shot(o, "phone-drawer-" + zoom);
      if (zoom === 1) {
        const S = R.screens["Pages drawer (phone, open)"] = { name: "Pages drawer (phone, open)" };
        S.ax = (await axOf(o, root)).filter(r => !r.ignored); S.axFindings = axFindings(S.ax, S.name);
        S.axText = S.ax.filter(r => INTERACTIVE.has(r.role) || ["heading", "navigation", "list"].includes(r.role)).map(axLine);
        await startAtPaneTab(o); const w = await walkTab(o, root, { limit: 60 }); S.walk = summariseWalk(w, S.name);
        fact(w.entered && w.left, "Pages drawer (phone, open): Tab enters the view and leaves it (" + w.stops.length + " stops)");
        fact(S.walk.noRing.length === 0, "Pages drawer (phone): every stop shows a ring" + (S.walk.noRing.length ? ": " + S.walk.noRing.join(" | ") : ""));
        S.contrast = { light: await contrastOf(o, root) };
        await o.setScheme("dark"); await sleep(300); await ensure(o); S.contrast.dark = await contrastOf(o, root); await shot(o, "phone-drawer-dark"); await o.setScheme("light"); await sleep(300);
      }
      await o.evaluate(() => document.querySelector(".booklet-pagemenu").focus()); await key(o, "Escape");
      rec.escDrawer = await o.evaluate(l => ({ expanded: document.querySelector(".booklet-pagesbtn").getAttribute("aria-expanded"), ae: eval(l) }), labelOf);
      say(tag, "Escape from the drawer panel", JSON.stringify(rec.escDrawer));
      await bookletReady(o, "Keyboard walk.booklet.md");
      await goPlace(o, { screen: "activity:/walk", part: 0 });
      rec.kinds = await fit(); say(tag, "question kinds page", JSON.stringify(rec.kinds));
      await goPlace(o, { screen: "activity:/tally", part: 0 });
      rec.tally = await fit(); say(tag, "kept days page", JSON.stringify(rec.tally));
      await bookletReady(o, "Listening.booklet.md"); await sleep(900);
      let up = await o.evaluate(() => !!document.querySelector(".booklet-allow-card"));
      if (!up) { await goPlace(o, { screen: "activity:/a1", part: 0 }); await o.evaluate(() => { const b = document.querySelector(".booklet-allow-btn"); b && b.click(); }); await sleep(400); up = await o.evaluate(() => !!document.querySelector(".booklet-allow-card")); }
      if (up) {
        rec.card = await fit(); rec.cardBox = await o.evaluate(() => { const c = document.querySelector(".booklet-allow-card"), r = c.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vh: innerHeight, vw: innerWidth, scrollsInside: c.scrollHeight > c.clientHeight + 1, overflowY: getComputedStyle(c).overflowY }; });
        say(tag, "Allow card", JSON.stringify(rec.card), JSON.stringify(rec.cardBox)); await shot(o, "phone-card-" + zoom);
        if (zoom === 1) {
          const S = R.screens["Allow card (phone)"] = { name: "Allow card (phone)" };
          const w = await walkTab(o, ".booklet-allow", { limit: 60, modal: true }); S.walk = summariseWalk(w, S.name);
          fact(w.entered && w.cycled, "Allow card (phone): Tab stays in the card and comes round (" + w.stops.length + " stops)");
          fact(S.walk.noRing.length === 0, "Allow card (phone): every stop shows a ring");
        }
        await key(o, "Escape"); await sleep(250);
      } else info("no Allow card on the phone at " + tag);
      await goPlace(o, { screen: "activity:/a1", part: 0 });
      await o.page.locator(BOOK + " .booklet-media-play", { hasText: "allowed clip" }).first().click({ timeout: 5000 }).catch(e => info("phone press: " + e.message.slice(0, 60)));
      await sleep(900); await goPlace(o, { screen: "activity:/a2", part: 0 });
      if (await o.evaluate(() => !!document.querySelector(".booklet-nowplaying"))) {
        rec.nowplaying = await fit(); rec.nowBox = await o.evaluate(() => { const b = document.querySelector(".booklet-nowplaying"), r = b.getBoundingClientRect(), nav = document.querySelector(".mobile-navbar"), nr = nav && nav.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), navTop: nr && Math.round(nr.top), scrollsInside: b.scrollHeight > b.clientHeight + 1 }; });
        say(tag, "Now playing", JSON.stringify(rec.nowplaying), JSON.stringify(rec.nowBox)); await shot(o, "phone-nowplaying-" + zoom);
        await o.evaluate(() => { const b = document.querySelector(".booklet-nowplaying"); const c = [...b.querySelectorAll("button")].find(x => /close/i.test(x.textContent + x.getAttribute("aria-label"))); c && c.click(); }); await sleep(300);
      }
      save();
    }
  }).catch(e => { say("PHONE SESSION FAILED " + e.stack); R.phoneError = String(e.stack); });

  R.console = consoleReport;
  save();
  say("done; facts " + R.facts.filter(f => f.ok !== undefined).length + ", failed " + R.facts.filter(f => f.ok === false).length);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
