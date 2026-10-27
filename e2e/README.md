# e2e: drive the real Obsidian desktop app

Launches Obsidian 1.14.5 (Linux x64 tarball, Electron 43.8.3) headless on a scratch config and any vault, and drives it
over Chrome DevTools Protocol with `playwright-core`. Playwright's own `_electron.launch` does NOT work (it times out; the
app does not honour the inspector flag it needs), so the harness starts the binary itself with `--remote-debugging-port`
and uses `chromium.connectOverCDP`.

## One-time setup
```
S=<a scratch folder of your own>
# the app: https://github.com/obsidianmd/obsidian-releases/releases/download/v1.14.5/obsidian-1.14.5.tar.gz
tar -xzf obsidian-1.14.5.tar.gz -C $S/app          # gives $S/app/obsidian-1.14.5/obsidian
cd $S/npm && npm install playwright-core            # 1.64.1
```
System needs: `libgtk-3-0`, `xauth` (only for `xvfb-run`), `Xvfb`. No FUSE, no sudo at run time.

## Run the probe check
```
PLAYWRIGHT=$S/npm/node_modules node probe-check.js \
  --obsidian $S/app/obsidian-1.14.5/obsidian --vault <vault folder> --config $S/cfg [--out $S/shots] [--copy] \
  [--plugin <id>] [--global name=value]
```
`--config` is a scratch folder used as `XDG_CONFIG_HOME` (Obsidian keeps its vault list in `<config>/obsidian/obsidian.json`);
never point it at `~/.config`. `--copy` works on a temp copy of the vault (without it the typing test appends to the first
note, then restores it). With no `DISPLAY` the harness starts its own `Xvfb`; `xvfb-run -a node probe-check.js ...` also works.
It prints `PASS`/`FAIL` lines and exits 1 on any FAIL. A passing run takes about 15 s in all (launch about 3 s).

## API (`drive.js`)
```js
const { launch } = require("./drive");              // needs PLAYWRIGHT=<node_modules path> in the environment
const o = await launch({ obsidian, vault, configDir, port?, args?, env?, enablePlugins = true, timeout = 60000, log? });
o.page                   // Playwright Page for the main window (use o.page.keyboard / locator / waitForSelector)
o.evaluate(fn, arg)      // page.evaluate: `app`, `window`, `require("obsidian")` are all available in fn
o.screenshot(path)       // PNG of the window (1024x800)
o.setScheme("dark"|"light")  // app.changeTheme("obsidian"|"moonstone"), waits for body.theme-dark/-light
o.output()               // Obsidian's stdout/stderr so far
await o.close()          // disconnect, SIGTERM the process group, stop our Xvfb
```
`launch` registers the vault in the scratch `obsidian.json` as open (so no vault picker), clicks "Trust author and enable
plugins" on the restricted-mode prompt (fallback `app.plugins.setEnable(true)`), then enables every id in the vault's
`.obsidian/community-plugins.json`. After editing a plugin's `main.js`, call `launch` again (a fresh process each time).

## Gotchas
- `package.json` here is `{"type":"commonjs"}` because the repository root's is `"type":"module"`.
- Obsidian is single-instance per config folder: a second launch on the same `--config` hands over to the first and exits
  ("Command line interface is not enabled"). Use a different `--config` per parallel run, and make sure the previous one closed.
- Always `await o.close()` (put it in `finally`); a crashed script leaves Obsidian and Xvfb running (`pkill -x obsidian; pkill -x Xvfb`).
- Obsidian checks GitHub for updates at start-up (harmless; network needed only for that).
- Open a note for editing with `openFile(file, { state: { mode: "source" } })`; the real keyboard only reaches the editor
  if no modal is open and the editor has focus (`app.workspace.activeEditor.editor.focus()`).

## Run the plugin check (`plugin-check.js`)
Drives the "Booklet" plugin in the real Obsidian and checks eleven things, each on its own fresh Obsidian launch (check 11 on two),
its own fresh copy of the vault and its own scratch config folder (all under `<out>/work-<time>/`; `--vault` itself is
never written to):
1. a booklet note opens as the `booklet` view (file-explorer click and `getLeaf().openFile`), toggles to `markdown` and back (header actions and the command), and `Ordinary note.md` stays `markdown`;
2. it draws natively: 3 choice buttons, 5 scale buttons, 1 text input, Obsidian-rendered markdown, no `iframe`; screenshots in light and dark in `<out>/shots/`;
3. answers reach the records on disk (read with Node `fs`; text before the records region compared byte for byte; `lint-booklet.py` run), clearing an answer, and `Kept records.booklet.md` keeping every other record block;
4. with the note open in a second pane as Markdown, real keyboard typing in that editor interleaved with answers in the booklet pane (both orders): nothing lost or doubled, buffer equals disk, cursor where typing left it;
5. the booklet text field keeps focus (and every character) across its own debounced write, alone and with a Markdown pane open;
6. `Every kind.booklet.md`: every common kind (choice, multi with an option of the reader's own, scale, long text, lines, number, date) answered and then cleared, with the answers block on disk compared to the expected values and to the reference renderer's layout; the first answer to a note with no records does not draw the view again; a new view shows every answer; each part not drawn yet says so, and a widget and a shared list are no longer among them; the shared list (positions in the menu, in the order pressed) and a grid widget (an item, then a word of the reader's own) answered and cleared with the rest; then, for the number (selected), a long text, a lines field, a date and *Add your own* in turn, a change made on disk with `Vault.process` (as Sync or another plugin would) arrives while the reader is in the field, changing the note's text and that question's answer: the field must be the same element, with focus, its words and its caret; what the reader then types is what lands on disk (12 typed over a selected 7 gives 12, not 912); a field left without typing shows the note's answer; a press that begins while the view waits to be drawn again lands, and the view is then drawn;
7. `Kept records.booklet.md` (`repeat`) and `Daily tracker.booklet.md` (`repeat daily`): answers go into the activity's draft on disk, survive the view being closed and opened again, and Finalize turns the draft into a dated entry (earlier entries byte for byte the same, the list in the view newest first, in words); for the daily one, the fields then show today's entry, Finalize with nothing changed is refused, and finishing again after a change replaces today's entry (still one entry for the day);
8. check 7's two flows again with the note also open in a Markdown pane, with words typed into that editor between the steps: buffer equals disk, each typed word once, one entries block, no draft left, no `ts` twice; then check 6's change-while-editing steps on `Every kind.booklet.md` with the change made in the open Markdown pane's editor (it reaches the view when that pane saves, about 2 s later);
9. layout: in the dark theme a text box's border against its card (contrast measured), room at the view's foot (the last card ends above the status bar when scrolled to the end), each grid cell's name against its colour's wash in light and dark (contrast at least 4.5), and under Obsidian's own mobile emulation every control at least 44 px high, on the daily tracker and on the check-in note with a place open, also with the window made 390 px wide (no sideways scroll); screenshots of the daily tracker (`tracker-light.png`, `tracker-dark.png`, and `-entries` scrolled to the kept days, `tracker-mobile.png`) and of the check-in note answered in part (`checkin-light.png`, `checkin-dark.png`, each with `-grid` and `-list`; `checkin-mobile.png` and `checkin-phone.png`, each with `-places` and `-grid`);
11. `Check-in.booklet.md` (a `repeat daily` activity with both widgets, a question on a shared list and thoughts): what is drawn (both openings, the grid's edge labels, each cell's band in its colour name's theme colour, eleven places as buttons and no figure, the shared list's options, nothing "not yet supported"); the grid, the places and the shared list answered with words of the reader's own, the draft on disk compared to the expected JSON and to booklet.html's one-line layout; a new view shows every answer; opening a place, *Add* with nothing typed and a word already held write nothing; a change made on disk arriving while the reader types in a cell's field and in the open place's field (same element, focus and words; Enter adds them to what the note then holds); words typed and not added kept across a drawing of the view with their place still open; every widget and the list cleared (own words pressed out, an item, *Clear this place*, the summary's x) until no draft is left; then answered again and finished, the kept entry checked on disk and in words. All of it twice: in one pane, and with the note also open in a Markdown pane (words typed into that editor between steps, the changes made in that editor, buffer equals disk at the end), where a change made on disk is then followed into the view through the Markdown pane's editor;
10. no console error or warning that names the plugin, and no uncaught page error, over every check that ran (it runs last, whatever order `--only` gives), and the Obsidian sessions it watched.
It also lists every console error/warning, `pageerror`s and Obsidian's stdout/stderr error lines, and the time each launch and check took.
```
S=<the scratch folder of the setup above>
PLAYWRIGHT=$S/npm/node_modules node plugin-check.js --obsidian $S/app/obsidian-1.14.5/obsidian \
  --vault ../test-vault --out $S/plugin-runs/<name> [--only 1,3] [--lint /workspace/booklet/lint-booklet.py]
```
One `PASS`/`FAIL` line per check with its evidence lines indented under it; exit 1 on any FAIL. A full run takes about four minutes.
Gotchas learned writing it: `executeCommandById` returns `true` for any registered command id even when its `checkCallback`
refuses (use `app.commands.listCommands()` to see availability); a `workspace.iterate*Leaves` callback that returns a truthy
value stops the iteration (so `l => r.push(x)` sees one leaf); with a Markdown pane open, answers go through its editor and
reach disk only after Obsidian's own ~2 s autosave of that pane; Obsidian 1.14 draws a `Notice` in a window of its own, not in
the main document, so the check finds that document through a probe notice; `app.emulateMobile(true)` reloads the app; a Markdown pane saves as soon as it loses focus, so a
press in the booklet pane right after typing in that pane lands in its editor before the saved, older text is handed to the
booklet view (check 11 found the view taking that text and losing the press); on an external change Obsidian hands the
text to the booklet view before the Markdown pane takes it into its editor (then `editor-change` fires); `page.setViewportSize`
works over CDP, and under mobile emulation Obsidian then sets `is-phone` at 390 px.
