# Lint for 1.0.1: the directory's linter, what it found, what was fixed, what was left

Written 2026-11-03 for the 1.0.1 release. The linter is `eslint-plugin-obsidianmd` 0.4.2 (the Obsidian plugin directory's own rule set, `configs.recommended`, which also brings the type-checked typescript-eslint rules), with ESLint 9.39.5. Run it with `npm run lint` (it lints `src/`; the config is `eslint.config.mjs`). The tests, the e2e scripts and the build scripts are not linted.

## Counts

| | Errors | Warnings | Total |
| --- | --- | --- | --- |
| First run, on 1.0.0 as released | 5 | 26 | 31 |
| Final run | 0 | 4 | 4 |

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
| `obsidianmd/ui/sentence-case` | 3 | warn |
| `obsidianmd/settings-tab/prefer-setting-definitions` | 1 | warn |

Every error is fixed. The 4 warnings that remain are listed below with the reason each was left. (A first pass of this work ended at 17 warnings, with 13 `prefer-create-el` left; those were fixed in a second pass, below.)

## Fixed (none of these changes what a reader sees)

- `no-useless-escape`, `src/core/listen.ts:23`: `[(\[:]` became `[([:]` in the embed pattern. The same set of characters; the iOS regex test still passes.
- `no-unnecessary-type-assertion`, `src/listen-view.ts:323`, `src/listen-writer.ts:59` and `:71`: `(next as AnswerValue)` after `holdsSomething(next)`, which already narrows the type. Types only; the built code is the same.
- `only-throw-error`, `src/listen-writer.ts:89`: the saved failure is rethrown as an `Error`. An `Error` (which every failure the records writer raises is, `RecordsWriteError` included) is rethrown as it is, so the message the reader gets is the same.
- `prefer-window-timers`, `src/now-playing.ts` (`within`): `setTimeout` and `clearTimeout` are now `window.setTimeout` and `window.clearTimeout`.
- `prefer-create-el`, the ones with a parent to create in: `src/allow-card.ts` (three `createEl("span", ...)` are `createSpan(...)`), and in `src/now-playing.ts` the bar, the live region and a bar row are made with `createDiv` on the element they go into (`doc.body`, or the bar) instead of made loose and appended on the next line. Same elements, same attributes, same place in the page.

## Fixed in the second pass: the 13 loose-element warnings

`src/media-view.ts` (six), `src/now-playing.ts` (one), `src/reading.ts` (five) and `src/view.ts` (one) made an element loose in a node's own document with `doc.createElement(...)` or `doc.createDocumentFragment()`, on purpose, so that it is made in the right window. They are now `doc.win.createEl(...)`, `createDiv()`, `createSpan()` and `createFragment()`, which the rule asks for. The document is the same one at every call (the `doc` the function was given, or the node's `ownerDocument`), and the window is that document's. The reason it is safe: a real-Obsidian probe (1.14.5 and 1.11.7) showed that in a pop-out window `win.createEl`, `createDiv`, `createSpan` and `createFragment` are functions at run time, `doc.win` is the pop-out window and `popW.createEl("div").ownerDocument` is the pop-out document. TypeScript did not know it (TS2339, `Window` has no such members in the `obsidian` 1.14.4 types), so `src/obsidian-window.d.ts` adds them to `Window` in one place; no cast at any call. The test helper `test/dom.mjs` gets the same four functions on its window, and `win` of a document is its window. One thing to keep: never call `createEl` or `createDiv` on a Document itself (the probe: it throws `HierarchyRequestError`, as it appends to the node it is called on); always on `doc.win`.

## Left as it is

### `obsidianmd/ui/sentence-case`, 3 warnings

- `src/allow-card.ts:205` (hint under the Add a site box): the rule wants `youtube.com` written `YouTube.com` and `https` written `HTTPS`.
- `src/settings.ts:177` (settings description): the rule wants `Play` written `play` and `Allow list button` written `allow list button`. Both name buttons as they are labelled on screen, so lowercasing them would no longer match the buttons.
- `src/settings.ts:228` (the Add a site setting): the rule wants `youtube.com` written `YouTube.com`.

An example web address is written the way an address is typed (lowercase), and the button names must match the buttons. The fixes would change the words a reader sees (and strings tests assert), so they are not made in a release that changes no visible behaviour.

### `obsidianmd/settings-tab/prefer-setting-definitions`, 1 warning

`src/settings.ts:160`: the settings tab has no `getSettingDefinitions()`, so its settings are not found by Obsidian's settings search on 1.13 or later. Adopting it is a feature (a new settings API, and the manifest's `minAppVersion` is 1.11.7, below it); it changes how the settings tab is built and shown. Left for a release that is meant to change the settings tab.
