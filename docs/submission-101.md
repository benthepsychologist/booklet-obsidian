# Submitting Booklet to the Obsidian community directory: everything to hand

> **DRAFT. NOT SENT.** Nothing has been submitted, tagged, released or pushed. This file collects what the submission needs and what to do before it, written 2026-11-03 in the worktree `/workspace/booklet-wt/community` (branch `feat/community-release`). The plugin files said 1.0.0 when it was written. **Updated 2026-11-04 for 1.0.2** (branch `feat/102-scanner-fixes`): the files now say 1.0.2, which is the version to submit; the directory's bot had flagged three things in 1.0.1 (no `authorUrl`, the README's first heading, the global `document`), fixed in 1.0.2 (`docs/lint-101.md` section 0). Still a draft: nothing is submitted, tagged, released or pushed by this document, and the 1.0.1 and 1.0.2 steps below are the same steps with the version raised.

## 1. What the directory asks for

Read on 2026-11-03 through a fetch tool that returns a summary of a page, not its raw text, so wording below is the tool's:

- **Submit your plugin** (`https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin`). Submit at **community.obsidian.md**. Sign in with an Obsidian account, link a GitHub account to the profile (so the directory can verify the repository is yours), and use "Add your plugin". The repository needs `README.md`, `LICENSE` and `manifest.json` at its root. The directory reads `manifest.json` at the head of the default branch, so it has to be accurate and committed first. The page says "The `id` must be unique across all published plugins and can't contain `obsidian`." Installs pull `main.js`, `manifest.json` and `styles.css` from the GitHub release whose tag matches the manifest version, so that release has to exist. "Only the initial version needs submitting": later releases are read from GitHub. Review is automatic; fix what it reports and publish a new release with a higher version; the plugin cannot be installed in Obsidian until the automated review's errors are resolved.
- **Set up and claim** (`https://docs.obsidian.md/community-directory/set-up-and-claim`). Adding a new plugin: **Plugins** in the sidebar, **New plugin**, a form with two fields: **GitHub repository URL** and **Owner** (the person or organization that will own the entry; it need not be the repository's GitHub owner). Before **Submit**, agree to the Developer policies and confirm you will support the plugin or remove or transfer it if you cannot.
- **Not read / not known:** the pages themselves as raw text (so any field the summary left out); what the signed-in form looks like (it needs Ben's account); what the automated review checks beyond what the plugin linter and `docs/directory-checklist-101.md` cover.

## 2. The values

| Field | Value | Where it comes from |
| --- | --- | --- |
| GitHub repository URL | `https://github.com/benthepsychologist/booklet-obsidian` | `git remote -v` (origin, fetch and push) |
| Owner | Ben Armstrong (personally; the copyright holder in `LICENSE:189`) | Ben's decision, 2026-11-03 |
| Default branch | `main` | `.github/workflows/ci.yml` |
| Plugin id | `booklet` | `manifest.json` |
| Name | Booklet | `manifest.json` |
| Author | Ben Armstrong | `manifest.json` (`authorUrl` is `https://github.com/benthepsychologist` since 1.0.2; `fundingUrl` absent, no donations are taken) |
| Version | 1.0.2 at submission (the files say 1.0.2 on `feat/102-scanner-fixes`, made by `npm version 1.0.2`) | `manifest.json`, `package.json` |
| Release tag the directory will use | `1.0.2`, no leading `v`; **not yet created** | `docs/release-flow.md` |
| minAppVersion | 1.11.7 | `manifest.json`; the evidence is `docs/directory-checklist-101.md` item 18 |
| isDesktopOnly | false | `manifest.json` |
| Licence | Apache-2.0 | `LICENSE`, `package.json` |

**Id.** `booklet` is lowercase letters only, does not end in "plugin" and does not contain "obsidian". Uniqueness: searched the `community-plugins.json` of `github.com/obsidianmd/obsidian-releases` (master, downloaded 2026-11-03, 9,880 entries) for `booklet` in id, name and repo: no entry. That file may not list plugins submitted through community.obsidian.md, so this does not prove the id is free; the directory's own check will say.

**Description.** `manifest.json` says:

> Opens a Booklet note in a view of its own, and writes the answers given there into the note's records section.

Checked against the rules (Submission requirements page; the plugin linter's `validate-manifest` pattern): starts with an action verb ("Opens", not "This is a plugin"); 110 characters, under the 250 limit; ends with a period; no emoji or special characters (letters, spaces, a comma and an apostrophe only); the proper noun "Booklet" is capitalised. **It passes; no correction is proposed and `manifest.json` is not edited.**

## 3. What the plugin does, in plain words

Booklet is a plugin for Booklet notes: ordinary Markdown notes whose front matter says `booklet: "0.18"` and that hold activities, questions and pages written in the Booklet format. Opened in Obsidian, such a note appears in a view of its own, drawn with Obsidian's own Markdown renderer, buttons, text fields and theme. The reader works through it: answers questions, ticks and picks, fills tables and charts, listens to or watches embedded media. The answers are written back into the note itself, in a records section (the `%%` ... `%%` block at the end of the file) and nowhere else, so the note can still be read and edited as Markdown, synced and searched like any other note. The plugin changes only what the reader changed: every other byte of the note stays as it was (`README.md:3`, `:141`).

## 4. Network, telemetry, accounts: what the README says

The Developer policies the plugin has to meet: no client-side telemetry, no ads, no obfuscation, no self-install or self-update, and a README that discloses remote network use, any account or payment required, and access to files outside the vault. The README's lines for these:

- `README.md:140`: "**It sends nothing of its own, and has no telemetry or account.** It makes no network request until you allow a host and press Play on its media; then your device asks that host for the file, and the host sees that you did (see *Audio, video and `listen`*). Its one group of settings is the list of hosts media may load from. It uses only Obsidian's API, no Node or Electron API. Obsidian may load remote images or other content linked by the note, as it normally does."
- `README.md:69`: "Nothing remote is requested when a note opens or a page is drawn. It is requested only when you press Play on that piece of media, and only from a host you have allowed."
- `README.md:100`: "the plugin guarantees that nothing remote is requested before a press, that only an allowed `https:` host is used, that an address with a user name in it is never used, and that an allow names only the host as written. Frames and raw media tags in a booklet are drawn as links that name the host and are never loaded."
- `README.md:88`: a service link (YouTube, Vimeo and the like) becomes a Play button once its site is allowed; the press loads the service's own embedded player in a frame.

The code agrees (re-checked 2026-11-03, `docs/directory-checklist-101.md` section 3.1): no `fetch`, `XMLHttpRequest`, `requestUrl`, `WebSocket`, `sendBeacon` or `importScripts` in `src/` or in the built `main.js`; the built file requires only `obsidian`; the only link followed is one the reader clicks. No files outside the vault are read (no `adapter`, no Node `fs`/`path`). No account, payment or ads. The source is public. Not a fork.

## 5. What was tested, and what was not

From `README.md:218-232` ("Which Obsidian"), `docs/accessibility-100.md` and `docs/floor-0130.md`:

- **Obsidian 1.14.5 and 1.11.7, desktop, real app** (the Obsidian Linux build in a virtual display, driven by `e2e/plugin-check.js`, 59 checks). After the 1.0.0 fixes, on 2026-11-03: 1.14.5 passes 59 of 59; 1.11.7 passes 58 of 59, the one failure being check 10 (an uncaught `illegal access` page error thrown when a pop-out window closes, intermittent, not shown to be the plugin's; check 40 alone then passed three times of three on 1.11.7). Keyboard order and focus, the accessibility tree, contrast and 200% text were measured on both versions (`docs/accessibility-100.md`).
- **Phone layout, by emulation only:** Obsidian's own phone mode in desktop Chromium (390 x 844, and 320 x 568 at 200% text), 20 of 20 on both versions; on 1.11.7 the 200% text scale is not applied by Obsidian, so that run measured 100% only.
- **Unit tests:** `npm test`, 1,016 tests at the last run (1,015 pass, 1 skipped), on the plugin linter's 0 errors (`docs/lint-101.md`).
- **A real phone.** The author (Ben Armstrong) has tried every release of the plugin by hand on an iPhone 17, 1.0.0 included (his statement, 2026-11-04; it is not a measured pass, and what was opened on the phone is not written down). Android and Mac have not been tried. The README says the same (`README.md:5`, `:230`, `:234`).
- **Android:** never tried (`README.md:229`). **Mobile on a Mac or an Android device:** not done.
- **Speech:** no screen reader has been listened to by the harness; the hand script is `docs/screen-reader-script-100.md`, and its results are not recorded in the README (`README.md:254`).
- **Other Obsidian releases:** 1.8.10 and below were run on the 0.12.0 build and fail or partly fail (`README.md:226`); nothing below 1.11.7 is promised.

## 6. Things the draft found that Ben may want to settle before sending

- **README says the plugin is not in the directory** (`README.md:281`, and the BRAT section as the way to install). That is right until it is listed; it needs an edit when it is.
- **README version line** (`README.md:5`) says "Version 1.0.2" on this branch; it has to be raised with each release.
- **Bundled library not named.** `monkey-around` 3.0.0 (author PJ Eby, declared ISC) is bundled into `main.js`; the Developer policies say to comply with the licences of code used, "including required attribution in the README". The package and its upstream repository carry no LICENSE file or copyright line to copy, and the README does not name it. A one-line "Third-party code" entry would settle it (`docs/directory-checklist-101.md` item 57).
- **Linter warnings left:** 4, none an error (`docs/lint-101.md`). The directory's automated review may not accept all four; if it reports them, they are the `youtube.com` / `https` capitalisation (3) and the settings-search API (1).
- **LICENSE notice** is the filled Apache appendix line (`LICENSE:189`); the linter's licence rule does not read that form (`docs/directory-checklist-101.md` item 13).

## 7. Before sending (for Ben)

1. Merge `feat/102-scanner-fixes` to `main` (CI green), then on `main`: `npm version 1.0.2`, `npm run build`, commit including `test-vault/.obsidian/plugins/booklet/`, merge. (`docs/release-flow.md` has the commands.)
2. Optional, to try it first: tag `1.0.2-beta.1` on the branch and install it with BRAT.
3. Tag `main` with `1.0.2` and push the tag. Wait for the Release workflow in Actions to go green.
4. On the release page for `1.0.2`: confirm it is **not** marked Pre-release (and is marked Latest); that it carries `main.js`, `manifest.json` and `styles.css`; that the attached `manifest.json` says `"version": "1.0.2"` and `"minAppVersion": "1.11.7"`; that `gh attestation verify main.js --repo benthepsychologist/booklet-obsidian` passes on a downloaded `main.js`.
5. Confirm `manifest.json` at the head of `main` says 1.0.2 (the directory reads it from there).
6. Decide the open points in section 6 (the phone check record, the README lines, the `monkey-around` line).
7. Sign in at community.obsidian.md, link GitHub, **Plugins > New plugin**, enter the repository URL and the owner, agree to the Developer policies, **Submit**. Then read the automated review's findings; fix with a new release (1.0.3 and so on).
