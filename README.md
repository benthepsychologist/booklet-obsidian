# Booklet for Obsidian

An Obsidian plugin for [Booklet](https://github.com/benthepsychologist/booklet) notes. A Markdown note whose front matter says `booklet: "0.15"` opens in a view of its own, drawn with Obsidian's own Markdown renderer, buttons, text fields and theme. The answers given there are written into the note's records section, the `%%` … `%%` block at the end of the file, and nowhere else. Everything stays in the note: you can read it, edit it as Markdown, sync it and search it like any other note.

Version 0.1.0. It reads format 0.15 (`SPEC.md` in the Booklet repository). It is not desktop-only; on a phone-sized screen it has so far been checked only under Obsidian's own mobile emulation.

## What it draws

- **Activities**, each as a card: its title, its prose (rendered by Obsidian, so links, images, callouts, hints and solutions look as they do in Reading view), and its questions.
- **The seven common question kinds**, stored the way the format and its reference renderer store them:

  | Kind | How it is answered | What is stored |
  | --- | --- | --- |
  | `choice` | one button per option; press again to clear | the option's position, from 1 |
  | `multi` | buttons that toggle | a list of positions, in the order picked |
  | `scale` | one button per anchor | the anchor's number |
  | `text` | a text field (`long`: a larger box) | the text as typed |
  | `lines` | one field per line, a new one as you type | a list of strings, one per field |
  | `number` | a number field (`min:`, `max:`, `step:`) | a number |
  | `date` | a date field, with Clear | `YYYY-MM-DD` |

  A `lines` answer lists every field as the reference renderer does, so a blank line, and the empty field at the end, are in it as `""`; a kept entry leaves them out. A `choice` or `multi` with `open` takes options of your own, stored as their words; in a repeating activity, the ones from earlier entries are offered again. An option's reply (the indented lines under it) shows when it is picked.
- **Activities that repeat** (`repeat`): what you type is kept as the activity's draft (a `booklet draft <activity>` block), so it is still there when you come back. **Finalize** keeps the draft as a dated entry (in a `booklet entries <activity>` block, with a `ts` such as `2026-10-27T18:30:00Z`) and empties the fields. The kept entries are listed under the activity, newest first, each with its date and its answers in words from the note's own lists.
- **`repeat daily`**: one kept entry a day. Once today's is kept, the fields show it; change an answer and Finalize again to replace it. "Today" is the device's own calendar day.

## What it does not draw yet

Each of these says "Not yet supported" in the view, and is left in the note exactly as written:

- `matrix` questions
- widgets (`widget` with a `booklet widget` block)
- query views (`booklet query` blocks)
- a `choice` or `multi` whose options come from a shared `menu` (`menu:`)
- questions inside a `group`, or inside any other callout (the callout is shown as Obsidian shows it)
- the tab bar: tabs are drawn one under another
- pages: a page break (`***`) is drawn as a rule, with the pages one under another; steps (a group at a time) are not drawn either
- the booklet's and each module's opening text, and a module's notice
- marking an answer right or wrong (`[x]` options): the options are shown, with a note that marking is not supported

Also not done yet: deleting or editing a kept entry, an activity's `icon:`, `parent:`, `status:` and `tab:` settings, data sections, themes, and languages other than English for the view's own words. Activities marked `hidden` are not drawn, as the format says.

## What it writes, and what it never does

- **It sends nothing anywhere and reads nothing from the network.** It has no settings, no telemetry and no account. It uses no Node or Electron API, only Obsidian's.
- **It changes only what you changed.** An answer, a draft or an entry is written into the records region, and inside it only into the one block that holds it, and inside that block only the one answer or entry. Every other byte of the note, every other record block, and every answer or entry you did not touch stay exactly as they were written: no respacing, no re-sorting, no trimming. A note with no records gets a records region added after its text, separated from it by one blank line.
- If the note is also open as Markdown, the change goes into that editor, so nothing typed there is lost; otherwise it is written with Obsidian's `Vault.process`.
- **A field you are in is never overwritten.** When the note changes while you are typing in the view, or have a field selected (words typed in its Markdown pane, a change from Sync or from another plugin), the field keeps what you typed, the caret and the selection. It shows what the note holds once you leave it, and if the change was to the same question, what you typed is written over it, as the newer change. If the change was to the note's text, the view is drawn again once you leave the field and no press is under way. Words typed in *Add your own* and not added yet are kept too.

## Try it by hand

1. Copy the `test-vault` folder of this repository somewhere of your own, and open that folder as a vault in Obsidian (*Open another vault*, then *Open folder as vault*).
2. Obsidian asks whether you trust the author of the vault: choose *Trust author and enable plugins*, or turn on community plugins in *Settings → Community plugins*. Booklet is already in the vault's plugin folder and switched on.
3. If the vault also has the earlier "Booklet (spike)" plugin, turn that one off first: both open booklet notes, and only one should.
4. Open `Daily tracker`, `Every kind`, `Kept records` or `Evening check-in`. All their content is made up. The header button switches views (*Show Markdown* on the booklet view, *Open as booklet* on the Markdown view), and so does the command *Booklet: Toggle between booklet view and Markdown*.

To use it in a vault of your own, install it with BRAT (below), or copy `main.js`, `manifest.json` and `styles.css` from `test-vault/.obsidian/plugins/booklet/` into `<your vault>/.obsidian/plugins/booklet/`, then turn it on under *Community plugins*.

## Install a test build with BRAT

Booklet is not in Obsidian's Community plugins directory yet. Its test builds are GitHub pre-releases of this repository, which BRAT (Beta Reviewers Auto-update Tool, a plugin in the directory) installs and updates; Obsidian's developer docs recommend it for testing a plugin before it is listed.

1. In *Settings → Community plugins*, browse for **BRAT**, install it and turn it on.
2. In BRAT, add a beta plugin and give it the repository `benthepsychologist/booklet-obsidian`. BRAT installs the newest release; turn Booklet on under *Community plugins* if BRAT has not.
3. To get a later build, check for updates in BRAT.

If the earlier "Booklet (spike)" plugin is in the vault, turn it off first: both open booklet notes.

## Build and test

```
npm install
npm run build    # type-checks, builds main.js, copies main.js, manifest.json and styles.css into test-vault/.obsidian/plugins/booklet/
npm test         # bundles src/core and src/view.ts with esbuild, then runs node --test over test/*.test.mjs
```

`npm test` runs the reader, the records writer, drafts and kept entries, the JSON edits, and a check that the plugin uses no HTML sinks, no inline styles and no Node or Electron module. It also runs the view itself over a jsdom document, with the few parts of Obsidian's API it uses stubbed (`test/obsidian-stub.mjs`), to check that a change to the note arriving while a field is being edited leaves that field and what was typed in it alone. Its corpus test goes over every booklet example in the Booklet repository, every kit starter and every test-vault note: it answers every question of the seven kinds, finalizes every repeating activity (and finishes a daily one twice in a day), clears every answer, and after each step checks that nothing outside the records region changed, that every record it did not need to change is byte for byte the same, and that `lint-booklet.py` passes on the written file. The corpus is found through these environment variables; a folder that is not there is a skipped test, with a message, not a failure:

| Variable | What it points at |
| --- | --- |
| `BOOKLET_REPO` | a checkout of the Booklet repository (default `/workspace/booklet`) |
| `BOOKLET_EXAMPLES` | its examples folder (default `$BOOKLET_REPO/examples`) |
| `BOOKLET_LINTER` | its `lint-booklet.py` (default `$BOOKLET_REPO/lint-booklet.py`); needs `python3` |
| `BOOKLET_STARTERS` | a folder of kit starter booklets |

`e2e/` drives the real Obsidian desktop app over the DevTools protocol and checks the plugin there, ten checks in all; see `e2e/README.md`.

## Releasing

Every build is a GitHub release made by `.github/workflows/release.yml` when a version tag is pushed: `main.js`, `manifest.json` and `styles.css` attached, with a build-provenance attestation, the shape BRAT installs from and Obsidian's directory reads. Until Booklet is listed, every release is marked a pre-release, and nothing is submitted to the directory from here.

1. **Set the version** on the branch that carries the change: `npm version 0.2.0`. npm writes it into `package.json`, and `version-bump.mjs` writes it into `manifest.json` and adds it to `versions.json` with the manifest's `minAppVersion`; `.npmrc` stops npm from committing or tagging. Versions are plain `x.y.z`: Obsidian does not order `0.2.0-beta.1` the way semver does, and its directory takes no other kind.
2. **Test and merge:** `npm test` and the real-Obsidian check (`e2e/`), then merge to `main`.
3. **Tag `main` and push the tag:**
   ```
   git checkout main && git pull --ff-only
   git tag -a 0.2.0 -m 0.2.0
   git push origin 0.2.0
   ```
4. **The workflow** refuses a tag that is not on `main`, is not a plain `x.y.z`, or is not the version in `package.json`, `manifest.json` and `versions.json` (`release-check.mjs`). Then it builds, runs `npm test` (the corpus tests skip there, with no Booklet repository on the runner), attests the three files and publishes them as a pre-release. `gh attestation verify main.js --repo benthepsychologist/booklet-obsidian` checks a downloaded `main.js` against its attestation.

Once Booklet is listed, the directory takes every new release straight from GitHub, so a release is then a release to everyone.

## Choices made where the format is silent

- A kept entry's `ts` is written to the second (`2026-10-27T18:30:00Z`), as in the format's own example, and first in the entry; two entries never share a `ts`.
- A new block is written in the reference renderer's layout (answers indented by one space, a draft on one line, entries one to a line). An existing block keeps its own layout, and a change follows it.
- An entry keeps only the answers that hold something, and a `lines` answer without its blank lines.
- A draft emptied of every answer is removed; an answers block emptied of every answer stays, as `{}`.
- A new draft goes after the activity's entries block; the first entries block takes the draft block's place; an entry is added after the last entry of the activity's last entries block.
- `repeat daily` replaces the first entry kept on the same day where it stands.

## Licence

Apache-2.0. See `LICENSE`.
