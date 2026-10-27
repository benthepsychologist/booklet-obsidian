// Probe check: launches Obsidian on a vault and proves the harness has control. Prints PASS/FAIL lines; exit 1 on any FAIL.
//   PLAYWRIGHT=/path/to/node_modules node probe-check.js --obsidian /path/to/obsidian --vault /path/to/vault \
//        --config /scratch/cfg [--plugin e2e-probe] [--global __e2eProbe=loaded] [--out /scratch/shots] [--copy]
// --plugin   plugin id that must be enabled (default: every id in the vault's community-plugins.json)
// --global   window.<name> expected to equal <value> after load (repeatable)
// --copy     work on a temporary copy of the vault so the typing test cannot change the original
const fs = require("fs"), path = require("path");
const { launch } = require("./drive");

const argv = process.argv.slice(2), opt = { global: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--copy") opt.copy = true;
  else if (a === "--global") opt.global.push(argv[++i]);
  else if (a.startsWith("--")) opt[a.slice(2)] = argv[++i];
}
opt.obsidian = opt.obsidian || process.env.OBSIDIAN; opt.vault = opt.vault || process.env.VAULT; opt.config = opt.config || process.env.CONFIG_DIR;
if (!opt.obsidian || !opt.vault || !opt.config) { console.error("need --obsidian, --vault, --config (or OBSIDIAN, VAULT, CONFIG_DIR)"); process.exit(2); }
const out = path.resolve(opt.out || path.join(opt.config, "shots"));
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let vault = path.resolve(opt.vault);
  if (opt.copy) { fs.mkdirSync(path.resolve(opt.config), { recursive: true }); const t = fs.mkdtempSync(path.join(path.resolve(opt.config), "vaultcopy-")); fs.cpSync(vault, t, { recursive: true }); vault = t; }
  const t0 = Date.now();
  const o = await launch({ obsidian: opt.obsidian, vault, configDir: opt.config });
  console.log("INFO  launched in " + (Date.now() - t0) + " ms");
  console.log("INFO  " + (await o.evaluate(() => navigator.userAgent.match(/obsidian\/\S+ Chrome\/\S+ Electron\/\S+/)[0])));
  const info = await o.evaluate(() => ({ ver: process.versions.electron, obs: navigator.userAgent.match(/obsidian\/(\S+)/)[1], name: app.vault.getName(), md: app.vault.getMarkdownFiles().map(f => f.path), restricted: !app.plugins.isEnabled() }))
    .catch(async () => o.evaluate(() => ({ ver: null, obs: app.appVersion || null, name: app.vault.getName(), md: app.vault.getMarkdownFiles().map(f => f.path), restricted: false })));
  console.log("INFO  obsidian " + info.obs + ", electron " + info.ver + ", vault " + info.name + ", notes " + info.md.length);
  ok(info.md.length > 0, "app.vault.getMarkdownFiles().length = " + info.md.length);
  ok(info.restricted === false, "community plugins are on (restricted mode off)");

  const ids = opt.plugin ? [opt.plugin] : await o.evaluate(async () => { try { return JSON.parse(await app.vault.adapter.read(".obsidian/community-plugins.json")); } catch (e) { return []; } });
  for (const id of ids) ok(await o.evaluate(id => app.plugins.enabledPlugins.has(id), id), "plugin enabled: " + id);
  const globals = opt.global.length ? opt.global : (ids.includes("e2e-probe") ? ["__e2eProbe=loaded"] : []);
  for (const g of globals) { const [k, val] = g.split("="); const got = await o.evaluate(k => window[k], k); ok(got === val, "window." + k + " === " + JSON.stringify(val) + " (got " + JSON.stringify(got) + ")"); }

  // open a note
  const note = info.md[0];
  await o.evaluate(async p => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(p), { state: { mode: "source" } }); }, note);
  const vt = await o.evaluate(() => app.workspace.activeLeaf.view.getViewType());
  ok(vt === "markdown", "opened " + note + ", view type " + vt);

  // light / dark
  for (const scheme of ["dark", "light"]) {
    try {
      await o.setScheme(scheme); await sleep(500);
      const cls = await o.evaluate(() => document.body.className.match(/theme-(dark|light)/)[0]);
      const f = await o.screenshot(path.join(out, scheme + ".png"));
      ok(cls === "theme-" + scheme, "scheme " + scheme + ": body." + cls + "; screenshot " + f);
    } catch (e) { ok(false, "scheme " + scheme + ": " + e.message); }
  }

  // typing: API, then real keyboard
  const file = path.join(vault, note);
  const before = fs.readFileSync(file, "utf8");
  await o.evaluate(() => { const ed = app.workspace.activeEditor.editor; ed.replaceRange("\nAPI-LINE", { line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); });
  await sleep(2500);
  ok(fs.readFileSync(file, "utf8").includes("API-LINE"), "editor.replaceRange reached the file on disk");
  await o.evaluate(() => { app.workspace.activeEditor.editor.focus(); const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); });
  await o.page.keyboard.press("Enter");
  await o.page.keyboard.type("KEYBOARD-LINE");
  await sleep(2500);
  ok(fs.readFileSync(file, "utf8").includes("KEYBOARD-LINE"), "real keyboard typing reached the file on disk");
  await o.screenshot(path.join(out, "typed.png"));
  if (!opt.copy) fs.writeFileSync(file, before);

  await o.close();
  await sleep(500);
  if (opt.copy) fs.rmSync(vault, { recursive: true, force: true });
  ok(true, "closed");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL  " + e.stack); process.exit(1); });
