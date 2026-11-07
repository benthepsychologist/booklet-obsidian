// The Allow card over Obsidian's Settings, in a real Obsidian (plugin 1.0.0, lane E2). Run by hand, once for each Obsidian version:
//   PLAYWRIGHT=<node_modules> node allow-settings-100.js --obsidian <binary> --out <dir> [--tag name] [--vault ../test-vault]
// Not part of plugin-check.js. One Obsidian at a time, on a scratch config and a vault made of one made-up note.
//
// What it measures (the second defect of the accessibility pass, docs/accessibility-100.md): with Obsidian's Settings open, the Allow
// card opened from a note must keep the focus, one Escape must close the card and only the card, a second Escape must close Settings,
// and focus must not be pulled back to Settings while the card is open. On Obsidian 1.11.7 Settings is a modal in the main window and
// the two stack; on 1.14.5 Settings is a window of its own and they do not. It also repeats the keyboard behaviour the card already had
// (Escape and Tab with focus outside the card, focus back to the button, default focus on Not now) so the fix is seen not to cost it.
const fs = require("fs"), path = require("path");
const { launch } = require("./drive");
const { quiet } = require("./waits");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const opt = { obsidian: arg("obsidian"), out: arg("out"), vault: arg("vault", path.join(__dirname, "..", "test-vault")), tag: arg("tag", "run") };
if (!opt.obsidian || !opt.out) { console.error("needs --obsidian <binary> and --out <dir>"); process.exit(2); }
const SRC_VAULT = path.resolve(opt.vault), OUT = path.resolve(opt.out);
fs.mkdirSync(OUT, { recursive: true });
const WORK = path.join(OUT, "work-" + Date.now());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = (...a) => console.log(...a);
let pass = 0, fail = 0;
const fact = (ok, text, extra) => { ok ? pass++ : fail++; say((ok ? "PASS " : "FAIL ") + text + (extra ? "  " + extra : "")); };

const consoleReport = [], sessions = [];
const env = { launch, opt: { obsidian: opt.obsidian }, WORK, consoleReport, sessions, SRC_VAULT, SHOTS: OUT, BOOK: ".workspace-leaf-content[data-type='booklet']" };
const { withMedia } = require("./media-lib")(env);

const note = ctx => `---\nbooklet: "0.19"\nid: booklet-test/allow-settings\ntitle: Listening\nlang: en\n---\n\n> [!activity|a1] Listening and watching\n\nA clip: ![the blocked clip](${ctx.url("blocked.example.net", "tone-5s.wav")})\n\n> [!choice|q1] A question?\n- [ ] Yes\n- [ ] No\n`;
const declaredNote = ctx => `---\nbooklet: "0.19"\nid: booklet-test/allow-declared\ntitle: Declared\nlang: en\nmedia-from:\n  - ${ctx.url("declared.example.org")}\n---\n\n> [!activity|a1] Declared\n\n> [!choice|q1] A question?\n- [ ] Yes\n- [ ] No\n`;

const open = async (o, rel) => {
  await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
  await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, rel, { timeout: 30000, polling: 100 });
  await o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, rel);
  await o.page.waitForFunction(() => { const l = app.workspace.getLeavesOfType("booklet")[0]; return !!(l && l.view.contentEl.querySelector(".booklet-page")); }, null, { timeout: 20000, polling: 100 });
  await sleep(400);
  await quiet(o);
};
const goA1 = async o => { await o.evaluate(async () => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 2, screen: "activity:/a1", part: 0 }, active: true }); }); await sleep(500); await quiet(o); };
const key = async (o, k) => { await o.page.keyboard.press(k); await sleep(250); };
const label = `(() => { const a = document.activeElement; return a ? ((a.getAttribute("class") || a.tagName) + " " + (a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 30)) : "none"; })()`;
const state = o => o.evaluate(l => ({ card: !!document.querySelector(".booklet-allow-card"), inCard: !!(document.activeElement && document.activeElement.closest(".booklet-allow-card")), settings: !!document.querySelector(".modal.mod-settings"), ae: eval(l) }), label);
const pressAllowButton = async o => { await o.evaluate(() => { const b = document.querySelector(".booklet-allow-btn"); b && b.click(); }); await sleep(500); };

(async () => {
  say("Obsidian:", opt.obsidian, "tag", opt.tag);
  await withMedia("allow-settings", { note: "Listening.booklet.md", files: ctx => ({ "Listening.booklet.md": note(ctx), "Declared.booklet.md": declaredNote(ctx) }), data: { allowedMediaHosts: ["vault.example.org"], noteAllows: {} } }, async (o, ctx) => {
    const version = await o.evaluate(() => (navigator.userAgent.match(/obsidian\/([\d.]+)/i) || [])[1]);
    say("version", version);
    await open(o, "Listening.booklet.md");
    await goA1(o);

    // ---- the card on its own: the keys it already had ----
    await pressAllowButton(o);
    let s = await state(o);
    fact(s.card && s.inCard, "the Allow list button opens the card and focus is in it (" + s.ae + ")");
    await key(o, "Escape");
    s = await state(o);
    fact(!s.card && /booklet-allow-btn/.test(s.ae), "Escape closes the card and focus returns to the Allow list button (" + s.ae + ")");
    await pressAllowButton(o);
    await o.evaluate(() => { const q = document.querySelector(".booklet-view button.booklet-choice"); q && q.focus(); });
    const behind = await state(o);
    await key(o, "Escape");
    s = await state(o);
    fact(!behind.inCard && !s.card, "Escape with focus on a control behind the card closes it (focus was: " + behind.ae + ")");
    await pressAllowButton(o);
    await o.evaluate(() => document.activeElement.blur());
    await key(o, "Tab");
    s = await state(o);
    fact(s.card && s.inCard, "Tab with focus on nothing lands inside the card (" + s.ae + ")");
    await o.evaluate(() => document.activeElement.blur());
    await key(o, "Escape");
    s = await state(o);
    fact(!s.card, "Escape with focus on nothing closes the card");

    // ---- a press on blocked media: default focus on Not now, Tab round ----
    await o.page.locator(env.BOOK + " .booklet-media-play").first().click({ timeout: 5000 }).catch(e => say("INFO press: " + e.message.slice(0, 80)));
    await sleep(500);
    s = await state(o);
    fact(s.card && /Not now/.test(s.ae), "a press on blocked media opens the card focused on Not now (" + s.ae + ")");
    const tabs = [];
    for (let i = 0; i < 14; i++) { await key(o, "Tab"); tabs.push((await state(o)).inCard); }
    fact(tabs.every(Boolean), "fourteen Tab presses never leave the card");
    await key(o, "Escape");
    await goA1(o);

    // ---- the card over Settings ----
    const settingsPages = async () => { const out = []; for (const p of o.page.context().pages()) if (await p.evaluate(() => !!document.querySelector(".vertical-tab-content")).catch(() => false)) out.push(p); return out; };
    for (const how of ["Allow list button, focus then left alone", "a click on the card's plain text first"]) {
      await o.evaluate(async () => { await app.setting.open(); await app.setting.openTabById("booklet"); });
      await sleep(1200);
      const sp = (await settingsPages())[0];
      const own = !!sp && sp !== o.page;
      say("INFO [" + how + "] Settings is drawn in " + (own ? "a window of its own" : "the main window"));
      await o.page.bringToFront().catch(() => {});
      await pressAllowButton(o);
      s = await state(o);
      fact(s.card && s.inCard, "[" + how + "] over Settings: the card opens with focus in it (" + s.ae + ")");
      // focus must stay in the card while it is open: sampled over three seconds
      const samples = [];
      for (let i = 0; i < 15; i++) { samples.push((await state(o)).inCard); await sleep(200); }
      fact(samples.every(Boolean), "[" + how + "] focus is not pulled back to Settings over three seconds (" + samples.filter(x => !x).length + " of " + samples.length + " samples outside the card)");
      if (how.startsWith("a click")) {
        await o.page.locator(".booklet-allow-card .booklet-allow-hint").click({ timeout: 4000 }).catch(e => say("INFO click: " + e.message.slice(0, 80)));
        await sleep(400);
      } else {
        const tabs2 = [];
        for (let i = 0; i < 12; i++) { await key(o, "Tab"); tabs2.push((await state(o)).inCard); }
        fact(tabs2.every(Boolean), "[" + how + "] twelve Tab presses stay in the card");
      }
      await o.page.screenshot({ path: path.join(OUT, opt.tag + "-card-over-settings.png") }).catch(() => {});
      await o.page.keyboard.press("Escape"); await sleep(500);
      s = await state(o);
      const settingsLeft = own ? await sp.evaluate(() => !!document.querySelector(".vertical-tab-content")).catch(() => false) : s.settings;
      fact(!s.card && settingsLeft, "[" + how + "] ONE Escape closes the card and only the card (card " + s.card + ", Settings open " + settingsLeft + ")");
      if (settingsLeft) {
        // the second Escape is Settings'
        if (own) { await sp.bringToFront().catch(() => {}); await sp.keyboard.press("Escape"); } else await o.page.keyboard.press("Escape");
        await sleep(500);
        const gone = own ? await sp.evaluate(() => !document.querySelector(".vertical-tab-content")).catch(() => true) : !(await state(o)).settings;
        fact(gone, "[" + how + "] a second Escape closes Settings");
      }
      await o.evaluate(() => { app.setting.close && app.setting.close(); }); await sleep(400);
      await o.page.bringToFront().catch(() => {});
      s = await state(o);
      if (s.card) await o.evaluate(() => document.querySelector(".booklet-allow-card button.booklet-allow-btn-choice:last-of-type").click());
    }

    // ---- the card first, Settings opened over it: Escape closes the topmost, which is now Settings ----
    await goA1(o);
    await pressAllowButton(o);
    await o.evaluate(async () => { await app.setting.open(); await app.setting.openTabById("booklet"); });
    await sleep(1000);
    const settingsOpen = async () => (await settingsPages()).length > 0;
    fact((await state(o)).card && await settingsOpen(), "[Settings over the card] both are open");
    await o.page.keyboard.press("Escape"); await sleep(500);
    s = await state(o);
    fact(s.card && !(await settingsOpen()), "[Settings over the card] one Escape closes Settings only, the card stays (card " + s.card + ", Settings open " + (await settingsOpen()) + ")");
    await o.page.bringToFront().catch(() => {});
    await o.page.keyboard.press("Escape"); await sleep(500);
    s = await state(o);
    fact(!s.card, "[Settings over the card] the next Escape closes the card");
    await o.evaluate(() => { app.setting.close && app.setting.close(); }); await sleep(300);

    // ---- the card that opens on its own for a declared site ----
    await open(o, "Declared.booklet.md");
    const up = await o.page.waitForFunction(() => !!document.querySelector(".booklet-allow-card"), null, { timeout: 6000 }).then(() => true).catch(() => false);
    await sleep(900);
    s = await state(o);
    fact(up && s.inCard && /Not now/.test(s.ae), "a note that names a site opens the card focused on Not now, and keeps it (" + s.ae + ")");
    await key(o, "Escape");
    s = await state(o);
    fact(!s.card, "Escape closes it");
  });
  say(`done; ${pass} passed, ${fail} failed`);
  fs.writeFileSync(path.join(OUT, opt.tag + "-allow-settings.json"), JSON.stringify({ tag: opt.tag, pass, fail, console: consoleReport.filter(c => !/harness noise/.test(c.kind)) }, null, 1));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
