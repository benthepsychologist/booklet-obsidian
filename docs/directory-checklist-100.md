# Obsidian community directory checklist, Booklet plugin 1.0.0 (lane c)

> **Superseded in part (2026-11-03, plugin 1.0.1 work).** `.github/workflows/release.yml` no longer publishes only pre-releases: a plain `x.y.z` tag is now a real release and `x.y.z-<suffix>` a pre-release for BRAT, and `release-check.mjs` takes both. Item 26's description of `release-check.mjs` (plain `x.y.z` only) and item 27 and the line in section 4 saying `release.yml` publishes pre-releases only describe the workflow as it was on 1.0.0. `docs/release-flow.md` is the current procedure. This file is a dated record and the rows below are kept as they were written.

Checked 2026-11-03 against the worktree `100-c-directory` (branch `feat/100-c-directory`, based on
`ff87ac8`, plugin 0.13.0). Nothing is submitted to the directory by this document; it only records
whether the plugin would meet the rules as Obsidian publishes them today.

## 1. Where the rules came from

All pages were fetched on 2026-11-03 with a fetch tool that returns a summary of the page, not its raw
text. Quotes below are as that tool returned them and are marked "quoted". Where the tool paraphrased,
the line says "paraphrased". No requirement below is written from memory unless it says so.

| Source | URL | Result |
| --- | --- | --- |
| Submit your plugin | https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin | fetched |
| Plugin guidelines | https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines | fetched |
| Manifest reference | https://docs.obsidian.md/Reference/Manifest | fetched |
| Submission requirements | https://docs.obsidian.md/community-directory/submission-requirements-for-plugins | fetched, paraphrased only; it carried no id or name rules |
| Developer policies | https://docs.obsidian.md/Community+directory/Developer+policies | fetched, paraphrased only (the tool would not quote it) |
| obsidian-releases README | https://github.com/obsidianmd/obsidian-releases | fetched |
| eslint-plugin-obsidianmd | https://github.com/obsidianmd/eslint-plugin | fetched; 42 rules listed |
| Help: community plugins | https://obsidian.md/help/community-plugins | fetched (client guide) |
| Help: sync settings | https://obsidian.md/help/sync/settings | fetched (client guide) |

Could not fetch:

- `docs.obsidian.md/Plugins/Releasing/Developer+policies` and `.../Submission+requirements+for+plugins`
  (the old paths): "File ... does not exist". The new `/Community+directory/...` and
  `/community-directory/...` paths above worked, found through a web search.
- The pull request template (`obsidian-releases/.github/PULL_REQUEST_TEMPLATE/plugin.md`): HTTP 404. The
  Submit page now says to submit at community.obsidian.md, so the template may be retired; not confirmed.
- `help.obsidian.md/...` and `docs.obsidian.md/Plugins/Releasing/Plugin+guidelines` redirect or move;
  the working addresses are `obsidian.md/help/...` and the one in the table.

Rules quoted or paraphrased from those pages, used below:

- Submit: "A `README.md` that describes the purpose of the plugin, and how to use it." / "A `LICENSE` that
  determines how others are allowed to use the plugin and its source code." / "The "Tag version" of the
  release must match the version in your `manifest.json`." / assets "`main.js`", "`manifest.json`", and
  "`styles.css` (optional)" / version "Versions supported only in the format `x.y.z`."
- Manifest: id "must contain only lowercase letters and hyphens, can't end with plugin, and can't contain
  obsidian" / version "using Semantic Versioning in the format x.y.z".
- Submission requirements (paraphrased): description starts with an action statement, not "This is a
  plugin", 250 characters or fewer, ends with a period, no emoji; remove `fundingUrl` if no donations;
  Node/Electron APIs need `isDesktopOnly: true`; do not put the plugin id in command ids; remove sample code.
- Developer policies (paraphrased): no obfuscated code, no ads loaded over the internet, no client-side
  telemetry, no self-install or self-update; the README must disclose network use (which services and
  why), a required account or payment, access to files outside the vault, server-side telemetry (with a
  privacy policy link); a LICENSE file that clearly states the license.
- Guidelines (quoted): "Avoid `innerHTML`, `outerHTML` and `insertAdjacentHTML`" / "Avoid unnecessary
  logging to console" / "Use `setHeading` instead of a `<h1>`, `<h2>`" / "Use sentence case in UI" /
  "Only use headings under settings if you have more than one section." / "Avoid setting a default hotkey
  for commands" / "Don't detach leaves in `onunload`" / "No hardcoded styling" / "Avoid accessing
  `workspace.activeLeaf` directly" / "Avoid managing references to custom views" / "Prefer `Vault.process`
  instead of `Vault.modify` to modify a file in the background".

## 2. Result in one line

37 PASS, 1 FAIL, 7 NOT APPLICABLE, 5 COULD NOT CHECK (50 items).

The one FAIL is small: the settings page has a heading although it has only one section
(`src/settings.ts:176`). The biggest gap is that the linter the directory's own rules come from,
`eslint-plugin-obsidianmd`, is not installed here, so its 42 rules were not run (items 48 and 49).

## 3. The items

Evidence form: `file:line` was opened and read; "ran" means the command was run in this worktree.

### Policies and README

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | README says what the plugin is and how to use it | PASS | `README.md:3` purpose; `:7` onward "What it draws"; `:233` "Try it by hand" |
| 2 | README has install steps | PASS | `README.md:244` manual copy, `:246-254` BRAT. Lists the pre-listing routes only; the directory route is added when listed |
| 3 | README discloses network use | PASS | `README.md:139` (no request until a host is allowed and Play pressed); `:87` (frames) |
| 4 | Own conduct sends nothing (code) | PASS | see 3.1 below |
| 5 | No client-side telemetry | PASS | ran `grep -rniE "telemetry\|analytics\|sendBeacon" src`: no hits; `README.md:139` says none |
| 6 | No ads, no obfuscation | PASS | no ad code (3.1). `main.js` is minified by esbuild (`build-options.mjs:37`, `esbuild.config.mjs` passes `production`), source is public in `src/`; minifying is not hiding purpose |
| 7 | No self-install or self-update | PASS | no fetch or script loading in `src/` (3.1); `main.js` has no `fetch(`, `XMLHttpRequest`, `WebSocket`, `requestUrl` (ran grep on the built file) |
| 8 | Required account or payment disclosed | N/A | none required (`README.md:139` "no ... account") |
| 9 | No access to files outside the vault | PASS | ran grep: no `adapter`, no Node `fs`/`path` import; `main.js` requires only `obsidian` (12 times) |
| 10 | Closed-source disclosure | N/A | source is public |
| 11 | Fork rules | N/A | not a fork as far as the repo shows (not independently verified) |

### 3.1 Network use: every hit, and what it is

The search was `grep -rnE "fetch\(|XMLHttpRequest|requestUrl|WebSocket|EventSource|sendBeacon|https?://|importScripts" src`
plus `iframe`, `createEl("script|link|style|img|audio|video")`, `.src`, `window.open`, `openExternal`. Not truncated.

- No `fetch(`, `XMLHttpRequest`, `requestUrl`, `WebSocket`, `EventSource`, `sendBeacon`, `importScripts`,
  `window.open`, `openExternal` anywhere in `src/`.
- `src/core/gate.ts:76`: a regular expression that recognises `https://` links in note text. Reads, sends nothing.
- `src/core/services.ts:55, 65, 73, 82`: builds the address of a video or audio player (YouTube, Vimeo,
  Spotify, SoundCloud) from a link in the note. An address only; used by `media-view.ts` after the reader
  has allowed that site and pressed Play.
- `src/core/services.ts:34, 103` and `src/core/allow.ts:40-63`: host names for the allow list. Checks only.
- `src/media-view.ts:61`: `el.src` of an `<audio>` or `<video>` element, created only on a press.
- `src/media-view.ts:67-74`: a sandboxed `<iframe>` pointing at a service's embed address, created only on
  a press for an allowed site; set back to `about:blank` on leaving (`:160`, `:189`).
- `src/media-view.ts:78`, called at `:135` and `:259`: an "Open in browser" link (`target=_blank`,
  `rel=noopener noreferrer`). Followed only if the reader clicks it.
- `styles.css`: ran `grep -nE "@import|url\(|http" styles.css`: no hits. No external stylesheet, script or font.

So the plugin makes a request to a third party only after the reader allows a site and presses Play, and
that is what `README.md:139` and `:87` say. PASS.

### License

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 12 | LICENSE present, type stated | PASS | `LICENSE:1-3` Apache License 2.0; `package.json` `"license": "Apache-2.0"`; `README.md:406` |
| 13 | Copyright notice structure valid | COULD NOT CHECK | the linter's `validate-license` was not run. Observation: the only copyright line is the unfilled template text `Copyright [yyyy] [name of copyright owner]` (`LICENSE:189`); no filled notice exists |

### manifest.json (opened: id booklet, name Booklet, version 0.13.0)

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 14 | id: lowercase letters and hyphens, not ending "plugin", no "obsidian" | PASS | `manifest.json` `"id": "booklet"` |
| 15 | name has no "obsidian" | PASS | `"name": "Booklet"` |
| 16 | version is x.y.z and matches package.json | PASS | `0.13.0` in both; ran `node release-check.mjs 0.13.0`: "0.13.0 is the version everywhere" |
| 17 | minAppVersion present | PASS | `"minAppVersion": "1.11.7"` |
| 18 | minAppVersion is the true oldest version | COULD NOT CHECK | `README.md:219` says the real-Obsidian suite passes on 1.11.7; I did not run it, and the linter's `no-unsupported-api` was not run |
| 19 | description: action start, 250 chars or fewer, ends with period, no emoji | PASS | ran: length 110; starts "Opens a Booklet note..."; ends "."; no emoji |
| 20 | author present | PASS | `"author": "Ben Armstrong"` |
| 21 | authorUrl | N/A | optional, absent |
| 22 | fundingUrl | N/A | absent; the rule says to leave it out if no donations are taken |
| 23 | isDesktopOnly matches the code | PASS | `false`; no Node or Electron import in `src/` (ran grep), built `main.js` requires only `obsidian` |
| 24 | versions.json valid | PASS | opened: 14 entries `x.y.z` to a minimum version; `0.13.0` maps to `1.11.7`, same as the manifest (also enforced by `release-check.mjs:20`) |

### Release and build

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 25 | Release carries main.js, manifest.json, styles.css; tag equals version | PASS | `.github/workflows/release.yml` publishes the three files with `gh release create`; ran `gh release view 0.13.0`: assets `main.js`, `manifest.json`, `styles.css`, tag `0.13.0` |
| 26 | `release-check.mjs` guards the tag | PASS | `release-check.mjs:17-21`: tag must be plain x.y.z and equal manifest, package and versions. It does not check that the three files exist; the workflow's `gh release create` would fail without them. Ran with tag 0.12.0: exits 1 with three messages **Superseded 2026-11-03: see the note at the top of this file.** |
| 27 | Directory accepts a release marked pre-release | COULD NOT CHECK | `release.yml` marks every release `--prerelease`; the fetched pages do not say whether the directory reads pre-releases. Needs checking before submitting **Superseded 2026-11-03: see the note at the top of this file.** |
| 28 | Built from source | PASS | `package.json` script `build`: `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`. Ran `npm run build`: no errors, wrote `main.js` (261651 bytes). `git status` afterwards showed the tree not dirty (`main.js` is ignored; the test-vault copy is unchanged), so no `git checkout` was needed |
| 29 | Sample code and placeholder names removed | PASS | ran `grep -rnE "MyPlugin\|SampleModal\|SampleSettingTab\|Sample\|Hello" src`: no hits; class is `BookletPlugin` (`src/main.ts:14`) |

### Code against the guidelines

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 30 | No innerHTML, outerHTML, insertAdjacentHTML | PASS | ran grep on `src/` and on built `main.js`: no hits |
| 31 | No hardcoded inline styles | PASS | ran `grep -rnE "\.style\b\|cssText\|setAttribute\(\"style"` on `src/`: no hits; styling is in `styles.css` |
| 32 | No console noise | PASS | ran `grep -rn "console\." src` and on `main.js`: no hits |
| 33 | Mobile and Platform | PASS | no `Platform` use and none needed: no Node/Electron API (item 23). `README.md:5, :221` say it is not desktop-only; iPhone use of 0.1.0 to 0.3.0 only, Android untried |
| 34 | Command id and name | PASS | `src/main.ts:52-54`: id `toggle-view`, name "Toggle between the note view and Markdown". No "command", no plugin id or name in either |
| 35 | No default hotkey | PASS | ran `grep -rn hotkeys src`: no hits; the only `addCommand` (`src/main.ts:52`) has none |
| 36 | Right callback type | PASS | `checkCallback` at `src/main.ts:55` |
| 37 | Settings headings use `setHeading` | PASS | `src/settings.ts:176` `new Setting(containerEl).setName("Allow list for media").setHeading()`. The `h2`/`h3` in `allow-card.ts:50, 167` and `view.ts:1408` are in a modal card and the reader view, not the settings page |
| 38 | Sentence case in UI text | PASS | read every `setName`, `setButtonText`, `setTitle`, command name: "Allow list for media", "Add a site", "Suggested services", "Add suggested services", "Open as booklet", "Toggle between the note view and Markdown" (read by eye; the linter rule `ui/sentence-case` was not run) |
| 39 | Settings heading only if more than one section | FAIL | `src/settings.ts:176`: the page has one section (`README.md:139` "Its one group of settings") but opens with a heading. Guideline: "Only use headings under settings if you have more than one section." |
| 40 | `display()` present while minAppVersion is below 1.13 | PASS | `src/settings.ts:171` (`override display()`); minAppVersion is 1.11.7 |
| 41 | No deprecated or private API | PASS | grep for `app.commands`, `app.plugins`, `internalPlugins`, `app.dom`, `hotkeyManager`, `app.setting`, `@ts-ignore`, `as any`: no hits. Imports from `obsidian` are all public classes (list: Component, FileView, Keymap, MarkdownRenderer, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, TextFileView, WorkspaceLeaf, getIcon, setIcon). `app.loadLocalStorage` (`held-store.ts:22`, `listen-store.ts:34, :70`) is public. One thing to know: `src/switch.ts:38` wraps `WorkspaceLeaf.prototype.setViewState` with `monkey-around`; it is a public method, and is undone on unload (`switch.ts:52-55`) |
| 42 | No global `app`, no `activeLeaf` | PASS | ran grep: no `activeLeaf`; `app.workspace` hits are a parameter (`markdown-view.ts:11`) |
| 43 | Cleans up on unload | PASS | `src/main.ts:119-131` `onunload`; 26 `register`/`registerEvent` calls in `src/` |
| 44 | Does not detach leaves in onunload | PASS | `main.ts:126-130` switches leaves to Markdown with `setViewState`; no `detach` |
| 45 | `Vault.process`, not `Vault.modify` | PASS | ran grep: no `.modify(`; `view.ts:1986`, `listen-writer.ts:81` use `vault.process` |
| 46 | No stored references to custom views | PASS | `main.ts:16` and `:158` hold built-in `MarkdownView` references only; custom views found with `getLeavesOfType` (`main.ts:36`, `:46`) |
| 47 | `normalizePath` for typed paths | N/A | no path is typed by the reader; the setting takes a site name; paths come from `TFile` |

### Linter

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 48 | `eslint-plugin-obsidianmd` run offline | COULD NOT CHECK | ran `npx --no-install eslint --version`: "npx canceled due to missing packages" (eslint is not installed; no `eslint.config.*` in the repo; `node_modules` is a link to the main checkout and holds neither). Nothing was installed |
| 49 | Rules the linter would probably flag, found by grep | COULD NOT CHECK | `prefer-create-el`: 14 native `createElement(` calls (`media-view.ts` 5, `now-playing.ts` 4, `reading.ts` 4, `view.ts` 1). `prefer-window-timers`: bare `setTimeout`/`clearTimeout` at `now-playing.ts:124-127`. `prefer-active-doc` and `prefer-instanceof` were not searched. These are grep hints only, not linter results, and the rules are not named in the fetched Guidelines page |
| 50 | Submission steps at community.obsidian.md | N/A | out of scope for this lane |

## 4. Other things found (not directory rules)

- `README.md:5` says "Version 0.12.0" and `README.md:129` says "This is Booklet plugin 0.12.0", but
  `manifest.json` and `package.json` say 0.13.0. Stale; not fixed here.
- `LICENSE:189` still holds the unfilled Apache template line (see item 13).
- `release.yml` publishes pre-releases only (item 27). Superseded 2026-11-03: see the note at the top of this file.
- `node_modules` shows as untracked in this worktree because `.gitignore` has `node_modules/`, which
  does not match a link. Not committed.
