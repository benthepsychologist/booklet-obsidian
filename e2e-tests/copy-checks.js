// Check 60 of plugin-check.js: the `copy` callout (format 0.19), in the real app. The note is test/page-notes/Copy callout.booklet.md
// (made up: a long text question with its folded solution, a choice with its folded hint, a fenced block marked ^marking, and one
// copy line naming them), copied into each session's own copy of the vault. Real mouse and keyboard events, as a reader makes them:
//   the button is a real button with the callout's words as its name, and a status region beside it that is empty until a press;
//   a press with nothing answered puts the lead-in, the question, "(no answer typed)", the model answer, the choice, the hint and the
//   block on the system clipboard (read back with Electron's clipboard, not the page's), and the region says "Copied";
//   words typed and a press straight after copy those words, before the 0.7 s pause has written them; a pick is copied as the option's words;
//   Enter and Space on the focused button copy too; the note on disk is the same bytes after a press as before it (nothing written);
//   the accessibility tree names the button and the status region.
// On a desktop's width and in Obsidian's phone mode (the button is inside the window and a tap copies).
// Real iPhone and Android are not driven here. plugin-check.js hands this file what it shares; it returns the check function.
const fs = require("fs"), path = require("path");
const { quiet, mobile, untilTrue, kit } = require("./waits");

module.exports = function copyChecks(env) {
  const { withApp, Check, BOOK, sleep } = env;
  const NOTE = "Copy callout.booklet.md";
  const SRC = path.join(__dirname, "..", "test", "page-notes", NOTE);
  const { shot, sha, goTo, open } = kit(env, NOTE);
  const put = vault => fs.writeFileSync(path.join(vault, NOTE), fs.readFileSync(SRC, "utf8"));
  const LEAD = "Please mark my answer against the model answer. Say what I got right and what I missed, in three short sentences.";
  const QUESTION = "Why does the tide come in twice a day?";
  const MODEL = "The moon pulls on the water on the side of the earth facing it, and a little less on the far side, so the sea bulges on both sides. The earth turns through both bulges each day.";
  const HINT = "Think about when the sun and the moon pull in the same direction.";
  const BLOCK = "marking:\nMarking notes: a full answer names the moon's pull and says there are two bulges. Give credit for either idea alone.";
  const want = (answer, pick) => [LEAD, "Question: " + QUESTION, "My answer: " + answer, "Model answer: " + MODEL, "Question: When is the range of the tide widest?", "My answer: " + pick, "Hint: " + HINT, BLOCK].join("\n\n");

  // the system clipboard, as the page reads and clears it (it is the operating system's clipboard that holds the text, not a copy the plugin keeps)
  const clip = o => o.evaluate(() => navigator.clipboard.readText());
  const clear = o => o.evaluate(() => navigator.clipboard.writeText(""));
  const button = o => o.page.locator(BOOK + " .booklet-clip-button");
  const said = o => o.evaluate(sel => { const e = document.querySelector(sel + " .booklet-clip-said"); return e ? e.textContent : null; }, BOOK);
  // the note's bytes on disk, once its own pending writes have landed
  const disk = vault => fs.readFileSync(path.join(vault, NOTE), "utf8");

  async function check60() {
    const c = new Check(60, "0.19 `copy` callout: one real button named by the callout's words and a status region beside it; a press with nothing answered, with words typed a moment ago, and with a pick puts the lead-in, the question, the answer, the model answer, the choice, the hint and the block on the system clipboard and says Copied; Enter and Space copy too; the note on disk is untouched by a press; desktop and phone");
    for (const where of ["desktop", "phone"]) {
      const desk = where === "desktop";
      await withApp("c60-" + where, async (o, vault) => {
        put(vault);
        if (!desk) { await o.page.setViewportSize({ width: 390, height: 844 }); await mobile(o, true); }
        await open(o, NOTE);
        await goTo(o, "activity:/tide-notes");
        await o.page.waitForSelector(BOOK + " .booklet-clip-button", { timeout: 8000 });

        // what is drawn
        const btn = button(o);
        c.ok((await btn.count()) === 1, `[${where}] one copy button is drawn`);
        c.ok((await btn.evaluate(e => e.tagName + ":" + e.getAttribute("type"))) === "BUTTON:button", `[${where}] it is a real button element`);
        c.ok((await btn.innerText()).trim() === "Copy for my tutor", `[${where}] its words are the callout's: ${JSON.stringify(await btn.innerText())}`);
        c.ok((await said(o)) === "", `[${where}] the status region beside it is empty before a press`);
        const region = await o.evaluate(sel => { const e = document.querySelector(sel + " .booklet-clip-said"); return e && { role: e.getAttribute("role"), live: e.getAttribute("aria-live"), atomic: e.getAttribute("aria-atomic") }; }, BOOK);
        c.ok(region && region.role === "status" && region.live === "polite" && region.atomic === "true", `[${where}] it is a polite status region: ${JSON.stringify(region)}`);
        const text = await o.page.locator(BOOK + " .booklet-page").innerText();
        c.ok(!text.includes("Please mark my answer"), `[${where}] the lead-in is for the clipboard and is not drawn on the page`);
        const box = await btn.boundingBox(), vw = await o.evaluate(() => window.innerWidth);
        c.ok(box && box.width > 0 && box.height >= 20 && box.x >= 0 && box.x + box.width <= vw, `[${where}] the button is inside the window: ${JSON.stringify(box)} in ${vw} px`);
        // the accessibility tree, as a screen reader is given it
        let tree = "";
        try { tree = await o.page.locator(BOOK + " .booklet-clip").ariaSnapshot(); } catch (e) { tree = "(no ariaSnapshot: " + e.message + ")"; }
        c.info(`[${where}] the accessibility tree: ${JSON.stringify(tree)}`);
        c.ok(/button "Copy for my tutor"/.test(tree), `[${where}] the tree names the button`);

        // a press with nothing answered
        const before = sha(path.join(vault, NOTE));
        await clear(o);
        await btn.click();
        await untilTrue(async () => (await said(o)) === "Copied", 4000);
        c.ok((await said(o)) === "Copied", `[${where}] after a press the region says Copied: ${JSON.stringify(await said(o))}`);
        const empty = await clip(o);
        c.ok(empty === want("(no answer typed)", "(no answer typed)"), `[${where}] with nothing answered the clipboard holds the lead-in, both questions with "(no answer typed)", the model answer, the hint and the block: ${JSON.stringify(empty)}`);
        await sleep(1500);
        c.ok(sha(path.join(vault, NOTE)) === before, `[${where}] the note on disk is the same bytes after the press`);

        // words typed, then a press straight after: copied before the pause has written them
        const area = o.page.locator(BOOK + " [data-booklet-q='why-twice'] textarea");
        await area.click();
        await o.page.keyboard.type("Because the moon pulls the sea.");
        await clear(o);
        await btn.click();
        await untilTrue(async () => (await clip(o)) !== "", 4000);
        const typed = await clip(o);
        c.ok(typed === want("Because the moon pulls the sea.", "(no answer typed)"), `[${where}] words typed a moment ago are copied: ${JSON.stringify(typed.slice(0, 260))}`);
        await quiet(o);
        c.ok(/Because the moon pulls the sea\./.test(disk(vault)), `[${where}] and the typed words are written to the note by their own pause`);

        // a pick, as the option's words
        await o.page.locator(BOOK + " [data-booklet-q='which-moon'] .booklet-choice", { hasText: "Near the new and the full moon" }).click();
        await quiet(o);
        await clear(o);
        await btn.click();
        await untilTrue(async () => (await clip(o)) !== "", 4000);
        const picked = await clip(o);
        c.ok(picked === want("Because the moon pulls the sea.", "Near the new and the full moon"), `[${where}] a pick is copied as the option's words: ${JSON.stringify(picked.slice(-420))}`);

        // the keys
        await quiet(o);
        const settled = sha(path.join(vault, NOTE));
        for (const key of ["Enter", "Space"]) {
          await clear(o);
          await o.evaluate(sel => { document.querySelector(sel + " .booklet-clip-said").textContent = ""; document.querySelector(sel + " .booklet-clip-button").focus(); }, BOOK);
          const focused = await o.evaluate(() => document.activeElement && document.activeElement.classList.contains("booklet-clip-button"));
          c.ok(focused, `[${where}] the button takes focus (${key})`);
          await o.page.keyboard.press(key);
          const ok = await untilTrue(async () => (await clip(o)) === picked, 4000);
          c.ok(ok, `[${where}] ${key} on the focused button copies the same text`);
          c.ok((await said(o)) === "Copied", `[${where}] and the region says Copied after ${key}`);
        }
        await sleep(1500);
        c.ok(sha(path.join(vault, NOTE)) === settled, `[${where}] three more presses wrote nothing to the note`);
        await shot(o, "copy-callout-" + where);
      });
    }
    return c;
  }

  return { 60: check60 };
};
