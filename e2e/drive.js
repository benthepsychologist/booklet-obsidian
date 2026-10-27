// Launch the Obsidian desktop app (Linux tarball build) on a scratch config + a given vault, and drive it over CDP.
//   const { launch } = require("./drive");
//   const o = await launch({ obsidian, vault, configDir });   // -> { page, evaluate(fn, arg), screenshot(path), close(), ... }
// Dependencies are not bundled: playwright-core is required from process.env.PLAYWRIGHT (path to the playwright-core
// package or to a node_modules folder that contains it), else plain "playwright-core".
// How it gets past the two first-run clicks, with no clicking:
//  - vault picker: it writes <configDir>/obsidian/obsidian.json with the vault registered and "open": true, and starts
//    Obsidian with XDG_CONFIG_HOME=<configDir>, so Obsidian opens that vault straight away.
//  - restricted mode: Obsidian shows "Do you trust the author of this vault?" at first open; the harness clicks
//    "Trust author and enable plugins" (fallback: app.plugins.setEnable(true)), then enables each id in
//    <vault>/.obsidian/community-plugins.json.
const { spawn } = require("child_process");
const fs = require("fs"), path = require("path"), net = require("net");

function pw() {
  const p = process.env.PLAYWRIGHT;
  if (!p) return require("playwright-core");
  for (const c of [p, path.join(p, "playwright-core"), path.join(p, "node_modules", "playwright-core")]) {
    try { return require(c); } catch (e) { /* try next */ }
  }
  throw new Error("PLAYWRIGHT=" + p + " does not contain playwright-core");
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => {
  const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); s.on("error", rej);
});

/* Start our own Xvfb when there is no DISPLAY (xvfb-run needs xauth; Xvfb alone does not). */
async function startXvfb() {
  for (let n = 90; n < 130; n++) {
    if (fs.existsSync("/tmp/.X11-unix/X" + n) || fs.existsSync("/tmp/.X" + n + "-lock")) continue;
    const x = spawn("Xvfb", [":" + n, "-screen", "0", "1400x900x24", "-nolisten", "tcp"], { stdio: "ignore" });
    for (let i = 0; i < 50; i++) { if (fs.existsSync("/tmp/.X11-unix/X" + n)) return { proc: x, display: ":" + n }; await sleep(100); }
    x.kill();
  }
  throw new Error("could not start Xvfb");
}

async function launch({ obsidian, vault, configDir, port, args = [], env = {}, enablePlugins = true, timeout = 60000, log }) {
  if (!obsidian || !vault || !configDir) throw new Error("launch needs obsidian (binary path), vault and configDir");
  vault = path.resolve(vault); configDir = path.resolve(configDir); obsidian = path.resolve(obsidian);
  if (!fs.existsSync(obsidian)) throw new Error("no Obsidian binary at " + obsidian);
  if (!fs.existsSync(vault)) throw new Error("no vault folder at " + vault);
  const real = path.join(process.env.HOME || "", ".config");
  if (configDir === real || configDir.startsWith(path.join(real, "obsidian"))) throw new Error("refusing to use the real config folder");
  const cfg = path.join(configDir, "obsidian");
  fs.mkdirSync(cfg, { recursive: true });
  const jf = path.join(cfg, "obsidian.json");
  let j = {}; try { j = JSON.parse(fs.readFileSync(jf, "utf8")); } catch (e) { /* fresh */ }
  j.vaults = j.vaults || {};
  for (const k of Object.keys(j.vaults)) delete j.vaults[k].open;
  const id = "e2e" + Buffer.from(vault).toString("hex").slice(-13);
  j.vaults[id] = { path: vault, ts: Date.now(), open: true };
  fs.writeFileSync(jf, JSON.stringify(j));

  let xvfb = null, display = process.env.DISPLAY;
  if (!display) { xvfb = await startXvfb(); display = xvfb.display; }
  port = port || await freePort();
  const out = [];
  const child = spawn(obsidian, ["--no-sandbox", "--disable-gpu", "--remote-debugging-port=" + port, ...args], {
    env: { ...process.env, ...env, DISPLAY: display, XDG_CONFIG_HOME: configDir },
    stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  const onData = d => { out.push(String(d)); if (log) log(String(d)); };
  child.stdout.on("data", onData); child.stderr.on("data", onData);
  let exited = false; child.on("exit", () => { exited = true; });

  const cleanup = async () => {
    if (!exited) { try { process.kill(-child.pid, "SIGTERM"); } catch (e) { /* gone */ } for (let i = 0; i < 30 && !exited; i++) await sleep(100); }
    if (!exited) { try { process.kill(-child.pid, "SIGKILL"); } catch (e) { /* gone */ } }
    if (xvfb) { try { xvfb.proc.kill(); } catch (e) { /* gone */ } }
  };

  let browser, page;
  try {
    const t0 = Date.now();
    while (true) {
      if (exited) throw new Error("Obsidian exited early:\n" + out.join(""));
      if (Date.now() - t0 > timeout) throw new Error("Obsidian did not open a debugging port in time:\n" + out.join(""));
      try { browser = await pw().chromium.connectOverCDP("http://127.0.0.1:" + port); break; } catch (e) { await sleep(300); }
    }
    // the main window is the page whose app.vault exists
    while (!page) {
      if (Date.now() - t0 > timeout) throw new Error("no Obsidian window with a vault in time:\n" + out.join(""));
      for (const ctx of browser.contexts()) for (const p of ctx.pages()) {
        if (p.url().startsWith("app://obsidian.md/index.html") && await p.evaluate(() => !!(window.app && app.vault && app.workspace && app.plugins)).catch(() => false)) page = p;
      }
      if (!page) await sleep(300);
    }
    await page.evaluate(() => new Promise(r => app.workspace.onLayoutReady(r)));
    if (enablePlugins) {
      // The "Do you trust the author of this vault?" modal opens a moment after layout-ready when the vault has
      // community plugins. Click "Trust author and enable plugins" as a person would; if it never shows, turn them on by call.
      const clicked = await page.waitForFunction(() => {
        const b = [...document.querySelectorAll(".modal-container button")].find(x => /Trust author/i.test(x.textContent));
        if (b) { b.click(); return true; }
        return false;
      }, null, { timeout: 4000, polling: 100 }).then(() => true).catch(() => false);
      await page.evaluate(async () => {
        if (!app.plugins.isEnabled()) await app.plugins.setEnable(true);
        await app.plugins.loadManifests();
      });
      const ids = await page.evaluate(async () => {
        try { return JSON.parse(await app.vault.adapter.read(".obsidian/community-plugins.json")); } catch (e) { return []; }
      });
      for (const pid of ids) {
        await page.evaluate(async pid => { if (!app.plugins.enabledPlugins.has(pid)) await app.plugins.enablePluginAndSave(pid); }, pid);
      }
      await page.waitForFunction(() => !document.querySelector(".modal-container"), null, { timeout: 3000 }).catch(() => {});
      await page.evaluate(() => { const e = document.activeElement; if (e && e.blur) e.blur(); });
    }
  } catch (e) { await cleanup(); throw e; }

  return {
    page, port, display, vault, configDir,
    output: () => out.join(""),
    evaluate: (fn, arg) => page.evaluate(fn, arg),
    screenshot: async file => { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); await page.screenshot({ path: file }); return file; },
    /** "dark" | "light" -> sets Obsidian's base colour scheme (Appearance > Base colour scheme) */
    setScheme: async scheme => {
      await page.evaluate(s => app.changeTheme(s === "dark" ? "obsidian" : "moonstone"), scheme);
      await page.waitForFunction(s => document.body.classList.contains(s === "dark" ? "theme-dark" : "theme-light"), scheme);
    },
    close: async () => { try { await browser.close(); } catch (e) { /* already closed */ } await cleanup(); },
  };
}
module.exports = { launch };
