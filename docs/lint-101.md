# Lint for 1.0.1: the directory's linter, what it found, what was fixed, what was left

Written 2026-11-03 for the 1.0.1 release. The linter is `eslint-plugin-obsidianmd` 0.4.2 (the Obsidian plugin directory's own rule set, `configs.recommended`, which also brings the type-checked typescript-eslint rules), with ESLint 9.39.5. Run it with `npm run lint` (it lints `src/`; the config is `eslint.config.mjs`). The tests, the e2e scripts and the build scripts are not linted.

## Counts

| | Errors | Warnings | Total |
| --- | --- | --- | --- |
| First run, on 1.0.0 as released | 5 | 26 | 31 |
| Final run | 0 | 17 | 17 |

First run, per rule:

| Rule | Count | Level |
| --- | --- | --- |
| `obsidianmd/prefer-create-el` | 19 | warn |
| `obsidianmd/ui/sentence-case` | 3 | warn |
| `obsidianmd/prefer-window-timers` | 3 | warn |
| `@typescript-eslint/no-unnecessary-type-assertion` | 3 | error |
| `no-useless-escape` | 1 | error |
| `@typescript-eslint/only-throw-error` | 1 | error |
| `obsidianmd/settings-tab/prefer-setting-definitions` | 1 | warn |

Final run, per rule:

| Rule | Count | Level |
| --- | --- | --- |
| `obsidianmd/prefer-create-el` | 13 | warn |
| `obsidianmd/ui/sentence-case` | 3 | warn |
| `obsidianmd/settings-tab/prefer-setting-definitions` | 1 | warn |

Every error is fixed. The 17 warnings that remain are listed below with the reason each was left.

## Fixed (none of these changes what a reader sees)

- `no-useless-escape`, `src/core/listen.ts:23`: `[(\[:]` became `[([:]` in the embed pattern. The same set of characters; the iOS regex test still passes.
- `no-unnecessary-type-assertion`, `src/listen-view.ts:323`, `src/listen-writer.ts:59` and `:71`: `(next as AnswerValue)` after `holdsSomething(next)`, which already narrows the type. Types only; the built code is the same.
- `only-throw-error`, `src/listen-writer.ts:89`: the saved failure is rethrown as an `Error`. An `Error` (which every failure the records writer raises is, `RecordsWriteError` included) is rethrown as it is, so the message the reader gets is the same.
- `prefer-window-timers`, `src/now-playing.ts` (`within`): `setTimeout` and `clearTimeout` are now `window.setTimeout` and `window.clearTimeout`.
- `prefer-create-el`, the ones with a parent to create in: `src/allow-card.ts` (three `createEl("span", ...)` are `createSpan(...)`), and in `src/now-playing.ts` the bar, the live region and a bar row are made with `createDiv` on the element they go into (`doc.body`, or the bar) instead of made loose and appended on the next line. Same elements, same attributes, same place in the page.

## Left as it is

### `obsidianmd/prefer-create-el`, 13 warnings

Where: `src/media-view.ts:55, 67, 125, 252, 282, 319`; `src/now-playing.ts:322`; `src/reading.ts:184, 195, 239, 247, 249`; `src/view.ts:643`.

These are elements (and two fragments) made loose, in the document of the node they belong to (`doc.createElement(...)`, `a.ownerDocument.createElement(...)`), and put in the page by the caller a moment later, or handed to a caller who moves them. The document is passed on purpose so that an element made for a pop-out window is made in that window.

The rule's suggestion is `doc.win.createEl(...)`, `doc.win.createDiv()`, `doc.win.createFragment()`. Reasons it was not taken:

- It does not compile: in `obsidian` 1.14.4's types `Window` has no `createEl`, `createDiv`, `createSpan` or `createFragment` (checked with `tsc`: TS2339). The rule itself only offers it as a suggestion, not an automatic fix, for that reason.
- That these helpers exist on a pop-out window's `Window` at run time could not be checked here (no Obsidian binary on this machine; the real-Obsidian suite in `e2e/` was not run). A wrong guess breaks the media player, the source panels and the now-playing bar in a pop-out window.
- The jsdom test helper (`test/dom.mjs`) defines the helpers on `Element` only, so a change would also change what the tests stand on.
- The alternative of the global `createEl(...)` would make the element in the main window's document and rely on adoption when it is inserted; that changes where it is made, which is a behaviour change this release does not take.

To take it later: confirm in real Obsidian (pop-out window) that `win.createEl` exists, add the type, update the test helper, run `e2e/`.

### `obsidianmd/ui/sentence-case`, 3 warnings

- `src/allow-card.ts:205` (hint under the Add a site box): the rule wants `youtube.com` written `YouTube.com` and `https` written `HTTPS`.
- `src/settings.ts:177` (settings description): the rule wants `Play` written `play` and `Allow list button` written `allow list button`. Both name buttons as they are labelled on screen, so lowercasing them would no longer match the buttons.
- `src/settings.ts:228` (the Add a site setting): the rule wants `youtube.com` written `YouTube.com`.

An example web address is written the way an address is typed (lowercase), and the button names must match the buttons. The fixes would change the words a reader sees (and strings tests assert), so they are not made in a release that changes no visible behaviour.

### `obsidianmd/settings-tab/prefer-setting-definitions`, 1 warning

`src/settings.ts:160`: the settings tab has no `getSettingDefinitions()`, so its settings are not found by Obsidian's settings search on 1.13 or later. Adopting it is a feature (a new settings API, and the manifest's `minAppVersion` is 1.11.7, below it); it changes how the settings tab is built and shown. Left for a release that is meant to change the settings tab.
