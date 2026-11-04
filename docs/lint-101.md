# Lint for 1.0.1 and 1.0.2: the directory's linter, what it found, what was fixed, what was left

Written 2026-11-03 for the 1.0.1 release; section 0 was added on 2026-11-04 for 1.0.2 and widens the scope that section 1 describes. Section 1 onward is the 1.0.1 record, kept as it was written, except where section 0 says otherwise.

## 0. 1.0.2: a wider lint, and the three scanner findings fixed

The directory's bot found three things in 1.0.1 that `npm run lint` did not: the manifest had no `authorUrl`, the README's first heading (`Booklet for Obsidian`) was not the manifest's name, and `src/now-playing.ts` used the global `document` where the scanner wants `activeDocument`. 1.0.2 fixes all three and widens the lint so the first two are checked here too. Nothing a reader sees changes.

**The new lint scope.** `npm run lint` is now `eslint .` (it was `eslint src`). It lints, with the same plugin version (`eslint-plugin-obsidianmd` 0.4.2) and ESLint 9.39.5:

- `src/`, as before.
- `manifest.json` with `obsidianmd/validate-manifest` (required keys, no disallowed key, types, no `obsidian` or `plugin` in `name`, `description` or `id`, and the description's form: 10 to 250 characters, a capital first, ends with a period, only letters, digits, spaces and `.,!?'"-`). The recommended set names no `manifest.json` in any block, so ESLint skipped it; `eslint.config.mjs` now names it and reads it with the TypeScript parser.
- `package.json`, with `depend/ban-dependencies` (the recommended set already named it, and `npm run lint` over `src` did not reach it).
- `LICENSE` with `obsidianmd/validate-license` (a copyright line of the form `Copyright (C) 2020-2025 by Holder` must be current and not `Dynalist Inc.`). `eslint.config.mjs` reads the file as plain lines with a small parser of its own, since the rule needs line tokens. Booklet's line is `Copyright 2026 Ben Armstrong`, which is not that form, so the rule has nothing to match and reports nothing; it was checked to fire by putting `Copyright (C) 2020 by Dynalist Inc.` in a scratch copy (two warnings, year and holder) and then restoring the file.
- `obsidianmd/prefer-active-doc` is turned on as a warning. The recommended set has it off; the bot has it on (its message is the one quoted above).

Still not linted: `test/`, `e2e-tests/`, `test-vault/`, `main.js`, `node_modules/` and the root `*.mjs` build scripts. They are not plugin code, and the TypeScript project service cannot parse `.mjs` files that are outside the tsconfig (running them through gave parse errors, as in `directory-checklist-101.md` 2.3).

| `npm run lint` | Errors | Warnings | Total |
| --- | --- | --- | --- |
| 1.0.1 source, 1.0.2 config (before the fix) | 0 | 5 | 5 |
| 1.0.2 (after) | 0 | 4 | 4 |

The 5 before: the 4 below plus `obsidianmd/prefer-active-doc` at `src/now-playing.ts:145`. `manifest.json` (with `authorUrl`), `package.json` and `LICENSE` gave no findings. The manifest rule was checked to fire by breaking a scratch copy (a missing `author`, `Obsidian` and `plugin` in the description, an unknown key: three warnings) and restoring it.

**Fixed in 1.0.2.**

- `manifest.json`: `"authorUrl": "https://github.com/benthepsychologist"` (a page about the author, not the plugin's repository). No `fundingUrl`: no donations are taken.
- `README.md`: the first heading is `# Booklet`, the manifest's name. Nothing in the repository links to the old heading's anchor (searched).
- `obsidianmd/prefer-active-doc`, `src/now-playing.ts:145`: `if (typeof document !== "undefined") this.liveOf(document);` is now `if (typeof activeDocument !== "undefined") this.liveOf(activeDocument);`. `activeDocument` is Obsidian's global for the document of the window in front, which at the moment the plugin loads is the main window, the same document as `document`. The live region is still made once per document by `liveOf`, and every later use already works from the document of the element it handles. The test DOM (`test/dom.mjs`) now defines `activeWindow` and `activeDocument` next to `window` and `document`. A search of `src/` for every other bare `document` or `window` found only `window.setTimeout` and `window.clearTimeout`, which the rule exempts on purpose (timers use `window`), and words in comments.

**Left, unchanged from 1.0.1, so the four warnings are the same four:** the three `ui/sentence-case` warnings (`src/allow-card.ts:205`, `src/settings.ts:177` and `:228`) and the `settings-tab/prefer-setting-definitions` warning (`src/settings.ts:160`). Why is in the sections below. They would change words a reader sees, or (the last) need a newer Obsidian API than the 1.11.7 floor and rebuild the settings page.

**Not checked.** The directory's bot may run other rules than these, or a different version of the plugin; the bot's own run on 1.0.2 is the only proof. Real Obsidian was not run for this change by the builder.

## 1. The 1.0.1 record

The linter is `eslint-plugin-obsidianmd` 0.4.2 (the Obsidian plugin directory's own rule set, `configs.recommended`, which also brings the type-checked typescript-eslint rules), with ESLint 9.39.5. Run it with `npm run lint` (in 1.0.1 it linted `src/`; see section 0 for the wider scope; the config is `eslint.config.mjs`). The tests, the e2e scripts and the build scripts are not linted.

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
