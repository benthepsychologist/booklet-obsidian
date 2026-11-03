# Obsidian community directory checklist, Booklet plugin 1.0.1 (re-run of the 1.0.0 list)

Checked 2026-11-03 in the worktree `/workspace/booklet-wt/community` (branch `feat/community-release`, on top of plugin 1.0.0 at `e3cfb19`; the files still say 1.0.0, the 1.0.1 bump has not been made). `docs/directory-checklist-100.md` stays as the dated record of the first run; this file re-checks every row of it against the repository as it is now, and adds the rows the current Guidelines page has that the first run did not list. Nothing is submitted to the directory by this document.

Evidence form: `file:line` was opened and read; "ran" means the command was run in this worktree on 2026-11-03. `src/`, `test-vault/` and `e2e/` were only read (a real-Obsidian run was using them), so the build was not re-run here (item 28).

## 1. Result in one line

**48 PASS, 0 FAIL, 8 NOT APPLICABLE, 1 NOTE (57 rows).** The first run had 1 FAIL (item 39, the settings heading) and 5 COULD NOT CHECK (13, 18, 27, 48, 49); all six now have a result, below. The one NOTE row is a style recommendation, not a failure (async/await, item 56); item 57, the README not naming the one bundled library, was fixed in `f7dc2f9`. What still cannot be checked from here is in section 5.

## 2. The five that could not be checked, and the one that failed

| # | Item | 100 | Now | Evidence |
| --- | --- | --- | --- | --- |
| 13 | LICENSE copyright line | CNC | PASS | `LICENSE:189` is `Copyright 2026 Ben Armstrong` (commit `30157ec`); the template text is gone, nothing else in the file changed |
| 18 | minAppVersion is the true floor | CNC | PASS | see 2.1 |
| 27 | Directory accepts the release | CNC | PASS (workflow sense) | see 2.2 |
| 48 | eslint-plugin-obsidianmd run | CNC | PASS | `npm run lint` over `src/`: 0 errors, 4 warnings (2.3) |
| 49 | Grep hints for linter rules | CNC | PASS | every grep from 100's item 49 and section 1 re-run: 0 hits (2.4) |
| 39 | Settings heading only with several sections | FAIL | PASS | `src/settings.ts` has no `setHeading` at all (ran `grep -rn setHeading src`: no hits); `display()` at `:171-181` opens with a description line and the list, no heading |

Item 13 in detail. The notice sits in the appendix block ("How to apply the Apache License to your work", `LICENSE:178-189`), the only place the template line ever was, so it was filled where it stood. The linter's `obsidianmd/validate-license` rule (read in `node_modules/eslint-plugin-obsidianmd/dist/lib/rules/validateLicense.js`) only parses a line of the shape `Copyright (C) 2020-2025 by Holder`, reports an end year before the current year and the holder `Dynalist Inc.`; the Apache line is not in that shape, so it matches nothing, and the recommended config does not apply the rule to the LICENSE file here (`npx eslint LICENSE`: "File ignored because no matching configuration was supplied"). So the rule was not run on the file; the result rests on the line being filled with the owner and the current year.

### 2.1 Item 18: minAppVersion 1.11.7

- `manifest.json`: `"minAppVersion": "1.11.7"`; `versions.json` maps `1.0.0` to `1.11.7`.
- The linter's `obsidianmd/no-unsupported-api` rule reads the manifest's minAppVersion and the `@since` tags in the `obsidian` typings (1.14.4) and flags an API newer than the floor. It is in the recommended set and `npm run lint` reports nothing from it.
- `docs/floor-0130.md` (section 2, last paragraph): the source was read against the typings; "every API `src/` uses with a tag is at 1.8.10 or older" (0.12.0 build), and the real-Obsidian suite passed 59 of 59 on 1.11.7 (its section 1) and not below it. `README.md:220` says the same ("Nothing below 1.11.7 is promised"), and `README.md:222-224` give the 1.0.0 runs: 1.14.5 59 of 59; 1.11.7 58 of 59 (check 10, the intermittent pop-out `illegal access`, passed on rerun of check 40).
- Since then the imports from `obsidian` are the public classes App, Component, FileView, Keymap, MarkdownRenderer, MarkdownView, Menu, Notice, Plugin, PluginSettingTab, Scope, Setting, TFile, TextFileView, WorkspaceLeaf, ViewState, ViewStateResult, getIcon, setIcon (ran a grep over the import lines); `app.loadLocalStorage` / `saveLocalStorage` (`listen-store.ts:34, :49`, `held-store.ts`) has been in Obsidian since 1.8.7 (`README.md:226`).
- **What this cannot reproduce:** the directory's own review tooling may run more or other rules than the plugin's published linter, and may read the floor differently (for example from the oldest Obsidian it tests against). The 1.0.1 changes did not touch `manifest.json` or the APIs used; the `doc.win.createEl` family added in the lint pass is, by a real-Obsidian probe, present on 1.14.5 and 1.11.7, but the e2e suite was not re-run on the 1.0.1 source for this document.

### 2.2 Item 27: does the directory accept the release

- `.github/workflows/release.yml` now publishes a plain `x.y.z` tag as a normal release (`--latest`, not `--prerelease`), after `release-check.mjs` has confirmed the tag is the version in `package.json`, `manifest.json` and `versions.json` and the tag is on `main`; an `x.y.z-<suffix>` tag is a pre-release for BRAT. `docs/release-flow.md` has the steps. Tested: `test/release-check.test.mjs` (11 tests). Ran `node release-check.mjs`: `1.0.0` "is the version everywhere (a real release)"; `1.0.0-beta.1` "is a pre-release of 1.0.0"; `1.0.1` refused (manifest, package and versions still say 1.0.0); `v1.0.0` refused.
- So the flow the directory reads (a release whose tag equals the manifest version, with `main.js`, `manifest.json`, `styles.css` attached, not marked pre-release) is in place: PASS in the workflow sense.
- **The real release does not exist yet.** `gh release view 1.0.0` shows `isPrerelease: true` with the three assets, and `gh release list` shows every release to date (0.10.0 to 1.0.0) as a pre-release. The 1.0.1 release exists only when Ben tags it.
- **Not checked:** that the directory's reader of releases picks the latest non-pre-release one (the Submit page says installs pull the three files "from the GitHub release whose tag matches the manifest version"; it does not say what it does with pre-releases); that the workflow runs end to end on GitHub (the `if:` condition, the `kind` output and `gh release create --latest` are read, not run).

### 2.3 Item 48: the linter

Ran `npm run lint` (`eslint src`, `eslint-plugin-obsidianmd` 0.4.2 recommended set, ESLint 9.39.5): **`✖ 4 problems (0 errors, 4 warnings)`**. They are the 3 `ui/sentence-case` warnings (`allow-card.ts:205`, `settings.ts:177` and `:228`: the rule wants `youtube.com` as `YouTube.com`, `https` as `HTTPS`, and button names `Play` / `Allow list` lowercased) and 1 `settings-tab/prefer-setting-definitions` (`settings.ts:160`). Each is explained, with the reason it was left, in `docs/lint-101.md`. The first run on 1.0.0 had 5 errors and 26 warnings.

What this does not cover: `npm run lint` lints `src/` only. `package.json` was also linted (`npx eslint package.json`, no findings). The test, e2e and build scripts (`test/`, `e2e/`, root `*.mjs`) are not part of the plugin and were left out; run through the same rule set they give parse errors and Node-global warnings (260 errors and warnings in `e2e/`, 88 in `test/`, ran once and not kept). Whether the directory's tooling reads those files is not known.

### 2.4 Item 49: the greps, re-run over `src/*.ts`

| Hint (rule it points at) | Grep | 100 | Now |
| --- | --- | --- | --- |
| `prefer-create-el` | `createElement(NS)?(` and `createDocumentFragment(` | 14 | 0 (now `doc.win.createEl` etc.) |
| `prefer-window-timers` | a bare `setTimeout`, `clearTimeout`, `setInterval`, `requestAnimationFrame` | 3 | 0 (`window.setTimeout` in `now-playing.ts`) |
| innerHTML | `innerHTML`, `outerHTML`, `insertAdjacentHTML` | 0 | 0 |
| console | `console.` | 0 | 0 |
| `activeLeaf` | `activeLeaf` | 0 | 0 |
| `Vault.modify` | `.modify(` | 0 | 0 |
| default hotkeys | `hotkeys` | 0 | 0 |
| detach in onunload | `detach` | 0 | 0 |
| inline styles | `.style`, `cssText`, `setAttribute("style"` | 0 | 0 |
| global `app` | a bare `app.` or `window.app` | not searched | 0 |
| `prefer-active-doc` | a bare `document` outside comments | not searched | `now-playing.ts:145` `typeof document !== "undefined"` then `this.liveOf(document)`: the one use of the global (the other hits are comments); the linter does not flag it |
| lookbehind | `(?<=`, `(?<!` | not searched | 0 |
| Node modules | `from "fs"`, `"path"`, `"os"`, `"electron"`, `require(` | 0 | 0 |
| `navigator` / `Platform` | `navigator.`, `Platform` | 0 | 0 |

The same greps over the built copy `test-vault/.obsidian/plugins/booklet/main.js` for `fetch(`, `XMLHttpRequest`, `requestUrl`, `WebSocket`, `sendBeacon`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `console.`: 0 hits; the only `require` is `require("obsidian")` (12 times). This is the committed copy; it was not compared with a fresh build here (CI does that, item 28).

## 3. Policies and README

Sources, re-fetched 2026-11-03 (section 4): Submit your plugin, Plugin guidelines, Submission requirements, Developer policies.

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | README says what the plugin is and how to use it | PASS | `README.md:3` purpose; `:7` "What it draws"; `:266` "Try it by hand" |
| 2 | README has install steps | PASS | `README.md:277` manual copy; `:279-287` BRAT. The README says Booklet "is not in Obsidian's Community plugins directory yet" (`:281`); that sentence and the BRAT section need an edit once it is listed |
| 3 | README discloses network use | PASS | `README.md:140` (no request until a host is allowed and Play pressed; no telemetry or account; Node and Electron not used); `:69` and `:100` (nothing remote before a press; only an allowed `https:` host); `:88` (players for services) |
| 4 | Own conduct sends nothing (code) | PASS | 3.1 below |
| 5 | No client-side telemetry | PASS | ran `grep -rniE "telemetry\|analytics\|sendBeacon" src`: no hits; `README.md:140` says none |
| 6 | No ads, no obfuscation | PASS | no ad code (3.1); `main.js` is minified by esbuild (`build-options.mjs:37` `minify: prod`), source is public in `src/` |
| 7 | No self-install or self-update | PASS | no `fetch(`, `XMLHttpRequest`, `requestUrl`, `WebSocket`, `importScripts` in `src/` or in the built copy |
| 8 | Required account or payment disclosed | N/A | none required (`README.md:140`) |
| 9 | No access to files outside the vault | PASS | no `adapter`, no `fs`/`path` import (item 53); the built copy requires only `obsidian` |
| 10 | Closed-source disclosure | N/A | source is public |
| 11 | Fork rules | N/A | not a fork as far as the repository shows (not independently verified) |

### 3.1 Network use: every hit, re-run

Search: `grep -rnE "fetch\(|XMLHttpRequest|requestUrl|WebSocket|EventSource|sendBeacon|importScripts|window\.open|openExternal" src` found nothing. `grep -rnE "https?://" src` found only: address builders and regular expressions (`src/core/services.ts:55, 65, 73, 82, 103`, `core/allow.ts`, `core/gate.ts`, `core/media.ts`) and comments. Nothing is requested by them; `services.ts` builds the address of a YouTube, Vimeo, Spotify or SoundCloud player from a link in the note, used by `media-view.ts` only after the reader has allowed the site and pressed Play. `styles.css`: `grep -nE "@import|url\(|http"` found nothing. `src/screens.ts:224` draws a note's `source:` value as an ordinary link (`rel="noopener"`) that is followed only if clicked. Same conclusion as 100: the plugin makes a request to a third party only after the reader allows a site and presses Play, and `README.md:140`, `:69` and `:100` say that.

## 4. License, manifest, release

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 12 | LICENSE present, type stated | PASS | `LICENSE:1-3` Apache License 2.0; `package.json` `"license": "Apache-2.0"`; `README.md:439-441` |
| 13 | Copyright notice | PASS | 2 above |
| 14 | id: lowercase letters and hyphens, no "obsidian", not ending "plugin" | PASS | `manifest.json` `"id": "booklet"` |
| 15 | name has no "obsidian" | PASS | `"name": "Booklet"` |
| 16 | version is x.y.z and matches package.json | PASS | `1.0.0` in both (ran `node release-check.mjs 1.0.0`). The 1.0.1 bump is not made; it is made by `npm version 1.0.1` (`docs/release-flow.md`) |
| 17 | minAppVersion present | PASS | `"minAppVersion": "1.11.7"` |
| 18 | minAppVersion is the true oldest version | PASS | 2.1 |
| 19 | description: action start, 250 chars or fewer, ends with a period, no emoji | PASS | ran: 110 characters; starts "Opens a Booklet note..."; ends "."; no emoji; it also matches the plugin linter's own `validate-manifest` pattern (letters, digits, spaces and `.,!?'"-` only) |
| 20 | author present | PASS | `"author": "Ben Armstrong"` |
| 21 | authorUrl | N/A | optional, absent |
| 22 | fundingUrl | N/A | absent; the rule says to leave it out if no donations are taken |
| 23 | isDesktopOnly matches the code | PASS | `false`; no Node or Electron import (item 53), `Platform` unused |
| 24 | versions.json valid | PASS | 15 entries, `x.y.z` to a minimum version; `1.0.0` maps to `1.11.7`, same as the manifest (enforced by `release-check.mjs`) |
| 25 | Release carries main.js, manifest.json, styles.css; tag equals version | PASS | `release.yml` attaches the three files; ran `gh release view 1.0.0`: assets `main.js`, `manifest.json`, `styles.css`, tag `1.0.0` (marked pre-release; the 1.0.1 real release does not exist yet) |
| 26 | `release-check.mjs` guards the tag | PASS | now accepts `x.y.z` (a real release) and `x.y.z-<suffix>` (a pre-release), refuses leading zeros, a leading `v` and anything else; the `x.y.z` must be the version in the three files; tests in `test/release-check.test.mjs` |
| 27 | Directory accepts the release | PASS | 2.2 |
| 28 | Built from source | PASS | `package.json` script `build` = `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`. Ran `npx tsc -noEmit -skipLibCheck` now: no errors. `npm run build` was last run before the lint commit (`16a9187`) and left `git status` clean; not re-run here because it rewrites `test-vault/`. CI (`.github/workflows/ci.yml`) diffs the committed test-vault copies against a fresh build |
| 29 | Sample code and placeholder names removed | PASS | ran `grep -rnE "MyPlugin|SampleModal|SampleSettingTab|Sample|Hello" src`: no hits; class is `BookletPlugin` (`src/main.ts:14`) |

## 5. Code against the guidelines

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 30 | No innerHTML, outerHTML, insertAdjacentHTML | PASS | 2.4 |
| 31 | No hardcoded inline styles | PASS | 2.4 |
| 32 | No console noise | PASS | 2.4 |
| 33 | Mobile and Platform | PASS | `isDesktopOnly: false`, no Node or Electron API, no lookbehind regex (2.4). `README.md:234` says it is not desktop-only: "used on an iPhone (0.1.0 to 0.3.0)", every build checked under Obsidian's phone emulation; `:229` "Android. It has not been tried." |
| 34 | Command id and name | PASS | `src/main.ts:53-54`: id `toggle-view`, name "Toggle between the note view and Markdown"; no "command", no plugin id or name |
| 35 | No default hotkey | PASS | 2.4 |
| 36 | Right callback type | PASS | `checkCallback` at `src/main.ts:55` (the command applies only to a booklet note) |
| 37 | Settings headings use `setHeading`, no `<h1>`/`<h2>` in settings | PASS | no `setHeading` in `src/`; the `h2`/`h3` at `src/allow-card.ts:56, :177` and `src/view.ts:1419` are in the Allow card and the reader view, not the settings page |
| 38 | Sentence case in UI text | PASS, 3 warnings | the linter's `ui/sentence-case` ran: the 3 warnings in 2.3 (a lowercase example address and two button names, left on purpose, `docs/lint-101.md`) |
| 39 | Settings heading only if more than one section | PASS | 2 above. The current Guidelines wording: "Avoid adding a top-level heading in the settings tab"; "general settings go at the top without a heading" |
| 40 | `display()` present while minAppVersion is below 1.13 | PASS | `src/settings.ts:171` (`override display()`); the linter's `prefer-setting-definitions` (the 1.13+ API) is the 1 warning in 2.3 |
| 41 | No deprecated or private API | PASS | no `app.commands`, `app.plugins`, `internalPlugins`, `hotkeyManager`, `@ts-ignore`, `as any` (ran grep); the linter's type-checked rules ran with 0 errors. `src/switch.ts:7` wraps public `WorkspaceLeaf.prototype.setViewState` with `monkey-around`, undone on unload |
| 42 | No global `app`, no `activeLeaf` | PASS | 2.4; the Guidelines now say "Avoid using the global app object, `app` (or `window.app`)" |
| 43 | Cleans up on unload | PASS | `src/main.ts:120` `onunload`; 28 `register*(` calls in `src/` (ran grep) |
| 44 | Does not detach leaves in onunload | PASS | `main.ts:125-129` switches booklet leaves back to Markdown with `setViewState`; no `detach` |
| 45 | `Vault.process`, not `Vault.modify` | PASS | no `.modify(`; `vault.process` at `view.ts:1997` and `listen-writer.ts:81`; the open Markdown editor is edited through the editor (`README.md:142`), as the Guidelines say for the active file |
| 46 | No stored references to custom views | PASS | `registerView` returns a new `BookletView` per call (`main.ts:49`); open views found with `getLeavesOfType` (`main.ts:36, 46, 85, 125`) |
| 47 | `normalizePath` for typed paths | N/A | no path is typed by the reader; paths come from `TFile` |
| 48 | `eslint-plugin-obsidianmd` run | PASS | 2.3 |
| 49 | Rules the linter would flag, found by grep | PASS | 2.4 |
| 50 | Submission steps at community.obsidian.md | N/A | see `docs/submission-101.md` |

### Rows the current Guidelines page has that 100 did not list

(They may have been on the page then; 100 quoted a subset.)

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 51 | Do not use the global `app` | PASS | ran `grep` for a bare `app.` and `window.app` over `src/`: no hits (item 42) |
| 52 | Do not iterate `getFiles()` to find a file by path | PASS | no `getFiles(` or `getMarkdownFiles(` in `src/`; `getFileByPath` is used (`listen-writer.ts`) |
| 53 | Prefer `app.vault` to `app.vault.adapter` | PASS | no `adapter` in `src/` |
| 54 | Use `FileManager.processFrontMatter` for front matter | N/A | the plugin edits the note's records section, not YAML front matter |
| 55 | Prefer `const`/`let` to `var` | PASS | no `var` declaration in `src/` (ran grep) |
| 56 | Prefer `async`/`await` to `.then()`/`.catch()` chains | NOTE | 11 `.then(`/`.catch(` sites remain: `view.ts:539, :800, :1966-1968`, `now-playing.ts:125, :550, :568`, `settings.ts:81`, `media-view.ts:178, :220`. It is a stated preference, not in the linter (0 findings), and changing it is a rewrite of working code for no change a reader sees; left as it is |
| 57 | Comply with the licences of code used, with attribution in the README | PASS | `monkey-around` 3.0.0 (author PJ Eby, `"license": "ISC"` in its `package.json`) is the one runtime dependency and is bundled into `main.js`. Fixed in `f7dc2f9`: the README's Licence section now names it ("Third-party code"). The package and its upstream repository carry no LICENSE file or copyright line to retain (checked the npm package folder and the GitHub repository's file list), so there is no notice to copy; the README line is all there is to add |

## 6. What rules changed since the 100 checklist

Re-fetched on 2026-11-03: Submit your plugin, Plugin guidelines, Submission requirements for plugins, Developer policies. The fetch tool returns a summary, not the page text, as in 100, so a diff is against the summaries and the quotes in `directory-checklist-100.md` section 1, not against the raw pages. What differed:

- **Submit.** The same file and release rules as quoted in 100 (`README.md`, `LICENSE`, tag equal to the manifest version, assets `main.js`, `manifest.json`, optional `styles.css`, version only `x.y.z`). The page now gives the route in more detail than 100 recorded: sign in at community.obsidian.md with an Obsidian account, link a GitHub account so the directory can verify the repository, "Add your plugin"; the directory reads `manifest.json` at the HEAD of the default branch; "Only the initial version needs submitting"; automated review, then publish a new release with an incremented version to fix findings. (`docs/submission-101.md` uses these.)
- **Guidelines.** The quoted rules of 100 are all still there. The page now also carries rules 100 did not quote (items 51 to 56 above, and: the word "settings" left out of settings headings; use the Editor, not `Vault.modify`, for the active file; update `registerEditorExtension` arrays in place; `normalizePath` for user-defined paths). Whether they are new is not known.
- **Submission requirements.** The same description rules as 100 (action statement, 250 characters or fewer, ends with a period, no emoji or special characters; acronyms, proper nouns and trademarks capitalised correctly), plus `fundingUrl`, `isDesktopOnly`, command-id and sample-code rules; it still has nothing on id, name, README, LICENSE or release assets.
- **Developer policies.** Same as 100. One line 100 did not record: comply with the licences of code you use, "including required attribution in the README" (item 57); and do not misuse the "Obsidian" trademark.

No rule that made a row of 100 pass now makes it fail.

## 7. Still not checked

- That the directory's own review tooling finds nothing more than the plugin linter (it may run other rules or read files outside `src/`).
- That the real 1.0.1 release workflow runs end to end on GitHub and produces a non-pre-release (it has not run).
- That Obsidian's directory ignores pre-releases when it picks a version.
- The pull-request template route (`obsidian-releases`) is no longer how the Submit page says to submit; whether the old route still works is not known.
- The real-Obsidian suite (`e2e/`) was not re-run on the 1.0.1 source for this document; the 1.0.0 runs are in `README.md:222-226`.
- Android, a real phone and a real screen reader (`README.md:229-231`).
