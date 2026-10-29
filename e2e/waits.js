// What a check waits for is a state it can read, not a time: the view has nothing under way (no move, every piece of Markdown
// rendered, every write landed), or it has drawn again since a mark was taken, or the page has applied a theme or a scroll.
// Used by nav-checks.js, study-checks.js and reading-checks.js.

const quiet = o => o.evaluate(async () => {
  const v = app.workspace.getLeavesOfType("booklet")[0]?.view;
  if (!v) return;
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

module.exports = { quiet, drawn, drawing, frames, mobile, untilTrue };
