// What a check waits for is a state it can read, not a time: the view has nothing under way (no move, every piece of Markdown
// rendered, every write landed), or it has drawn again since a mark was taken, or the page has applied a theme or a scroll.
// Used by nav-checks.js, study-checks.js, reading-checks.js and leftovers-checks.js.
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const quiet = o => o.evaluate(async () => {
  const v = app.workspace.getLeavesOfType("booklet")[0]?.view;
  // no booklet view, or a view that has lost a field read here, is a failure: returning would pass as if all were quiet
  if (!v) throw new Error("quiet: there is no booklet view to wait for");
  for (const k of ["writes", "moving", "afterMove", "rendering"]) if (!(k in v)) throw new Error("quiet reads the view's " + k + ", which the view no longer has");
  for (let n = 0; n < 2500; n++) {
    await new Promise(r => setTimeout(r, n ? 2 : 0));
    const w = v.writes;
    await w;
    if (v.writes === w && !v.moving && !v.afterMove && !v.rendering) return;
  }
  throw new Error("the booklet view did not settle: moving " + v.moving + ", rendering " + v.rendering);
});
const drawn = o => o.evaluate(() => { const v = app.workspace.getLeavesOfType("booklet")[0]?.view; return v ? v.gen : -1; });
// what `act` does makes the view draw again (a move): wait for that drawing, then for the view to be quiet
const drawing = async (o, act) => {
  const g = await drawn(o);
  const r = await act();
  await o.page.waitForFunction(g => { const v = app.workspace.getLeavesOfType("booklet")[0]?.view; return !!v && v.gen !== g; }, g, { timeout: 6000, polling: 20 });
  await quiet(o);
  return r;
};
const frames = o => o.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
// Obsidian's phone mode reloads the app: wait until it is back in that mode with its layout
const mobile = async (o, on) => {
  await o.evaluate(on => app.emulateMobile(on), on);
  await o.page.waitForFunction(on => !!(window.app && app.workspace && app.workspace.layoutReady) && document.body.classList.contains("is-mobile") === on, on, { timeout: 30000, polling: 100 });
};
// a state the node side can read (a file on disk), polled until it holds or the time is up
const untilTrue = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };

// What the checks that draw one made-up note each share: a screenshot, a note's sha, going to a screen, opening the note as a booklet
// (once the metadata cache has its front matter), and the answers the note holds on disk (`note` is its file name).
const kit = (env, note) => {
  const { SHOTS, BOOK, waitActiveType } = env;
  const shot = (o, name) => o.screenshot(path.join(SHOTS, name + ".png"));
  const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  const goTo = async (o, screen) => {
    await o.evaluate(async screen => { const l = app.workspace.getLeavesOfType("booklet")[0]; await l.setViewState({ type: "booklet", state: { ...l.getViewState().state, version: 1, screen, part: 0 }, active: true }); }, screen);
    await o.page.waitForSelector(BOOK + " .booklet-page[data-booklet-screen='" + screen + "']", { timeout: 8000 });
    await quiet(o);
  };
  const open = async (o, rel) => {
    await o.page.waitForFunction(r => { const f = app.vault.getAbstractFileByPath(r), fm = f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter; return !!(fm && fm.booklet); }, rel, { timeout: 30000, polling: 100 });
    const openIt = () => o.evaluate(async rel => { await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(rel)); }, rel);
    await openIt();
    /* A pane that did not become a booklet view in time gets the note once more (as plugin-check.js's openNote does). */
    try { await waitActiveType(o, "booklet", 10000); await o.page.waitForSelector(BOOK + " .booklet-page", { timeout: 10000 }); }
    catch (e) { await openIt(); await waitActiveType(o, "booklet", 20000); await o.page.waitForSelector(BOOK + " .booklet-page", { timeout: 20000 }); }
    await quiet(o);
  };
  const answers = vault => {
    const text = fs.readFileSync(path.join(vault, note), "utf8"), out = {};
    for (const m of text.matchAll(/```booklet answers([^\n]*)\n([\s\S]*?)```/g)) out[m[1].trim()] = JSON.parse(m[2]);
    return out;
  };
  const recordsOf = (vault, act) => { const a = answers(vault); return a[act] || a[""] || {}; };
  return { shot, sha, goTo, open, answers, recordsOf };
};

module.exports = { quiet, drawn, drawing, frames, mobile, untilTrue, kit };
