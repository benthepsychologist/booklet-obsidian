# Booklet for Obsidian

An Obsidian plugin for [Booklet](https://github.com/benthepsychologist/booklet) notes. A Markdown note whose front matter says `booklet: "0.16"` opens in a view of its own, drawn with Obsidian's own Markdown renderer, buttons, text fields and theme. The answers given there are written into the note's records section, the `%%` … `%%` block at the end of the file, and nowhere else. Everything stays in the note: you can read it, edit it as Markdown, sync it and search it like any other note.

Version 0.4.1. It reads format 0.16 (`SPEC.md` in the Booklet repository). A note marked with another 0.x version, such as `"0.15"`, opens as it is, with a notice first among its problems: "This file says booklet: 0.15. This view reads format 0.16 and has opened it as it is; some of it may not draw." It is not desktop-only: 0.1.0 to 0.3.0 have been used on an iPhone, and each build is checked under Obsidian's own mobile emulation and at a phone's width.

## What it draws

- **Openings**: the booklet's opening text (the prose before its first module or activity, under the booklet's title) and each module's (the text in the module before its first activity, under the module's title), rendered by Obsidian. A heading that repeats the title is not drawn twice.
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

  A `lines` answer lists every field as the reference renderer does, so a blank line, and the empty field at the end, are in it as `""`; a kept entry leaves them out. A `choice` or `multi` with `open` takes options of your own, stored as their words; your earlier ones are offered again (below, *Earlier words*). Words typed in its *Add your own* field are added as Enter or *Add* would add them when you leave the field, open another note in the pane, close the pane or switch it to Markdown, and before Finalize (SPEC section 5); on a `choice` they replace the pick. White space adds nothing. An option's reply (the indented lines under it) shows when it is picked.
- **Shared lists** (`menu:`): a `choice` or `multi` whose options come from a `menu` callout draws that menu's options, found as the format says: in the question's own module first, then in the data section outside every module. The answer is a position in the menu, from 1, as for options of its own.
- **Two widgets** (`widget`, with its `booklet widget` block found through the `![[#^id]]` line), stored as the reference renderer stores them:

  | Engine | How it is answered | What is stored |
  | --- | --- | --- |
  | `grid-select` | cells under four edge labels; press items, add words | item ids, and `x\|cell\|words` |
  | `svg-regions` | places as buttons; a place's words; a summary | `[{"id": place, "s": [word ids, own words]}]` |

  **The grid** (`grid-select`, the feelings grid) draws each cell with its name in the cell's colour, its items to press and a field for words of your own. The answer keeps the order you picked (SPEC section 8): words of your own typed in a cell go at the end of the list, and taking one out leaves the others where they were, as the reference renderer keeps it. **The body widget** (`svg-regions`) is drawn without its figure: the places listed in `chips` are buttons, pressing one shows its words in their `senses` groups and a field for words of your own, and a summary under it lists each place marked, with its words and a button to clear it. A word you type that is one of the place's words (in any case) is stored as that word's id. With `readonly`, a grid shows its words and the body widget names its places (from `regions`), with nothing to press. With `describe`, the cells' and places' notes are listed. A kept entry shows a grid's answer as its words, and a body widget's as each place with its words.
- **A question asked for each pick of another** (`each:<id>`, SPEC section 5). A `multi` with `each:` names a `choice`, a `multi` or a widget in the same activity, its source, and is asked once for each pick in the source's answer: the question's title and help once, then a copy of its options (its own, or a shared list's, and `open`) under each pick's words (an option's words, an item's or a place's label, or your own words; for a grid's `x|cell|word`, the word). Nothing is drawn while nothing is picked. The answer is a list of pairs, `[{"pick": <the pick as the source stores it>, "a": <the multi's answer>}]`, one for each pick with an answer. Taking a pick back keeps its pair, not drawn, and picking it again brings it back; a kept entry keeps it too and shows one line for each pick its source holds, "<title> · <pick>". A draft whose only answers are pairs for picks taken back counts as empty. Your own options under one pick are offered under every pick, and in later entries. An `each:` that names nothing in its activity, names the question itself, names a question of another kind or chains (names a question that is itself asked for each pick) is listed among the note's problems and ignored.
- **Earlier words**: some of your own words come back as buttons to press (SPEC section 5, "Words the reader wrote before"). An option of your own (`open`) is offered again after the question's options, and under every pick of a question asked for each pick; a word you wrote for a place of the body widget is offered under every place, after the widget's words, in a group named *Earlier words*; and a `lines` question whose line sets `earlier:<n>` offers its earlier lines under its fields, in a group named *Earlier words*. A grid cell's words and a `text` answer are not offered again. The words come from the activity's kept entries, newest first, and from the answer being written (the body widget's other places, the other picks' copies); never from another draft. In a `repeat daily` activity today's kept entry is not a source, since the draft will replace it, and under `each:` only the pairs whose pick the source holds in the same entry are. A body widget's own word is one that is not one of its word ids and does not start with one of its group ids and a colon. At most 12 are offered at each place, or the number `earlier:<n>` gives (digits only; `earlier:0` offers none), counted after leaving out the words listed there and the words already there (an own option or a line compared in any case, white space at either end aside; a body word as the format compares a widget's words). A press stores the words exactly as typing them there would: at the end of the answer or the place's words, or in the empty line at the end of the lines, with a new empty line after it. It never changes what you have typed, Enter never takes an offered word, nothing is written until you press one, and the entries they came from are not touched. A long one is shortened to two lines on screen, and a press takes its full words.
- **Activities that repeat** (`repeat`): what you type is kept as the activity's draft (a `booklet draft <activity>` block), so it is still there when you come back. **Finalize** keeps the draft as a dated entry (in a `booklet entries <activity>` block, with a `ts` such as `2026-10-27T18:30:00Z`) and empties the fields. The kept entries are listed under the activity, newest first, each with its date and its answers in words from the note's own lists.
- **`repeat daily`**: one kept entry a day. Once today's is kept, the fields show it; change an answer and Finalize again to replace it. "Today" is the day on the device's own calendar when the view was drawn (SPEC section 8), so a check-in left open past midnight keeps writing to the day it shows: Finalize then keeps the entry at that day's last second, replacing that day's entry. The view is drawn again, and today moves on, when it comes back into use on a later day (the window or the app shown again, or its pane made active) while no field is being typed in.
- **Queries** (`booklet query` in an activity's prose, SPEC section 6): kept entries drawn as `cards` (the default: one dated card per entry, its questions as lines), a `table` (one column per field), a `list` (one line per row: badge, label, the other fields, value, and the note beneath) or `tiles` (a big value over a label; with no value anywhere, a strip of pills). `from:` names an activity that repeats, or one question (which is then the value); `fields:`, `limit:`, `empty:`, `group:` and the roles (`label`, `value`, `note`, `badge`, `tone`, `link`, `icon`) are read as the format says. Kept entries only, newest first, never a draft; an answer of the wrong shape is left out of its row, and a question asked for each pick is one field per pick, "<title> · <pick>". A tone is also said in words to a screen reader; a `link` that is a web address or a note's path makes the row's label lead there, and any other target is plain text; an `icon` is drawn when Obsidian has an icon of that name.
- **A span of days and summaries** (SPEC section 6, "A span of days, and summaries"): `limit: 7 days` keeps the entries of today and the six dates before it, on the device's calendar, today being the day the view was drawn; an entry whose `ts` will not parse, or that is later than now, is in no span. `summary: on` gives a row for the entries' dates ("Days logged"), then a row per question in the activity's order, with `count`, `days`, `average`, `lowest`, `highest`, `total` and `most` as the kind has them and the default `value` and `note` ("Good", "Rough 1 · Mixed 1 · Good 3"); a grid is summarised like a `multi`, and a question asked for each pick gives a row per pick. A query of one question with `summary: on` gives its distribution, listed options, anchors or items in list order with zeros. With no `as:` a summary is a table. The rows are worked out when the view is drawn and again when the records change, so an entry kept shows at once; nothing is written.

## What it does not draw yet

Each of these says "Not yet supported" in the view, and is left in the note exactly as written:

- `matrix` questions
- a widget's figure (the body widget's drawing): the widget is drawn without it, and says so if the data has one
- widget engines other than `grid-select` and `svg-regions`
- a query drawn as `bars` or a `line`, and a query of a data block: a line saying so stands in place of the view
- `tiles` of a question asked for each pick named alone in `from:` (a table, a list or cards show it), and the summary of a `matrix` question
- sorting and filtering a query's rows on screen
- questions inside a `group`, or inside any other callout (the callout is shown as Obsidian shows it)
- the tab bar: tabs are drawn one under another
- pages: a page break (`***`) is drawn as a rule, with the pages one under another; steps (a group at a time) are not drawn either
- a module's notice
- marking an answer right or wrong (`[x]` options): the options are shown, with a note that marking is not supported
- a question of a kind other than `multi` asked for each pick (`each:`): its answers are kept

A setting a line's kind does not take (`mx:5` for `max:5`, `open` on a `scale`) is listed among the note's problems and ignored, as the format says; `each:` and `earlier:`, which the plugin draws, are not.

Also not done yet: deleting or editing a kept entry, an activity's `icon:`, `parent:`, `status:` and `tab:` settings, data sections, themes, and languages other than English for the view's own words. Activities marked `hidden` are not drawn, as the format says.

## What it writes, and what it never does

- **It sends nothing anywhere and reads nothing from the network.** It has no settings, no telemetry and no account. It uses no Node or Electron API, only Obsidian's.
- **It changes only what you changed.** An answer, a draft or an entry is written into the records region, and inside it only into the one block that holds it, and inside that block only the one answer or entry. Every other byte of the note, every other record block, and every answer or entry you did not touch stay exactly as they were written: no respacing, no re-sorting, no trimming. A note with no records gets a records region added after its text, separated from it by one blank line.
- If the note is also open as Markdown, the change goes into that editor, so nothing typed there is lost; otherwise it is written with Obsidian's `Vault.process`. While the note is open as Markdown, the view reads the note from that editor too, which holds the newest text: the file as last saved can be older, and taking it would take back an answer just given.
- **An answer of the wrong shape is kept as written** (SPEC section 8). An answer whose shape is not its question's kind, such as pairs under a plain `multi`, a list under a `scale` or a number under a `text`, typed by hand or written by another renderer, is never rewritten: its question is drawn read-only with a notice saying what the note holds, no press or Finalize changes it, and a kept entry shows it as written. It can be changed in Markdown. What each kind keeps is under *Choices made* below.
- **A field you are in is never overwritten.** This holds for a widget's fields for words of your own too. When the note changes while you are typing in the view, or have a field selected (words typed in its Markdown pane, a change from Sync or from another plugin), the field keeps what you typed, the caret and the selection. It shows what the note holds once you leave it, and if the change was to the same question, what you typed is written over it, as the newer change. If the change was to the note's text, the view is drawn again once you leave the field and no press is under way. Words typed in *Add your own* and not added yet are kept too, and added when you leave the field.
- **Words typed and not added yet survive closing and reloading.** Before Obsidian quits or its window closes, the view writes what was typed and adds the words typed in *Add your own* and a widget's fields, as leaving the field would. A reload (*Reload app without saving*, or Obsidian reloading itself) gives a plugin no time to write, so those words are also kept on the device as they are typed, in the vault's own local storage (never in the note, and never sent anywhere), and added when the note is next drawn; then they are taken off the device. Until then they are only on that device.

## Try it by hand

1. Copy the `test-vault` folder of this repository somewhere of your own, and open that folder as a vault in Obsidian (*Open another vault*, then *Open folder as vault*).
2. Obsidian asks whether you trust the author of the vault: choose *Trust author and enable plugins*, or turn on community plugins in *Settings → Community plugins*. Booklet is already in the vault's plugin folder and switched on.
3. If the vault also has the earlier "Booklet (spike)" plugin, turn that one off first: both open booklet notes, and only one should.
4. Open `Check-in` (the two widgets and a shared list), `Daily tracker`, `Every kind`, `Kept records` or `Evening check-in`. All their content is made up. The header button switches views (*Show Markdown* on the booklet view, *Open as booklet* on the Markdown view), and so does the command *Booklet: Toggle between booklet view and Markdown*.

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

`npm test` runs the reader, the records writer, drafts and kept entries, the JSON edits, and a check that the plugin uses no HTML sinks, no inline styles and no Node or Electron module. It runs the two widget engines of the reference renderer (`booklet.html`, taken from the Booklet repository as it is) step by step beside the plugin's, and checks that both store the same answer after every step. It also runs the view itself over a jsdom document, with the few parts of Obsidian's API it uses stubbed (`test/obsidian-stub.mjs`), to check that a change to the note arriving while a field is being edited leaves that field and what was typed in it alone. Its corpus test goes over every booklet example in the Booklet repository, every kit starter and every test-vault note: it answers every question of the seven kinds, every widget and every question on a shared list, finalizes every repeating activity (and finishes a daily one twice in a day), clears every answer, and after each step checks that nothing outside the records region changed, that every record it did not need to change is byte for byte the same, and that `lint-booklet.py` passes on the written file. The corpus is found through these environment variables; a folder that is not there is a skipped test, with a message, not a failure:

| Variable | What it points at |
| --- | --- |
| `BOOKLET_REPO` | a checkout of the Booklet repository (default `/workspace/booklet`) |
| `BOOKLET_EXAMPLES` | its examples folder (default `$BOOKLET_REPO/examples`) |
| `BOOKLET_LINTER` | its `lint-booklet.py` (default `$BOOKLET_REPO/lint-booklet.py`); needs `python3` |
| `BOOKLET_STARTERS` | a folder of kit starter booklets |

`npm test` also runs the wrong-shape guard over a corpus of answers of the wrong shape for every kind and widget (in answers, drafts and kept entries), `each:` from the setting's mistakes to the pairs on disk, the empty-draft rule, kept entries and the reader's field as copies come and go, and earlier words: `earlier:`'s values, each place's sources, limit, order and matching, today's entry, pairs whose pick was taken back, a stale word id, and the bytes a press stores. It checks that the settings the plugin reports a kind does not take are the ones the linter reports, on every corpus file. Every test that lints a test-vault note expects no error from the format 0.16 linter: the check-in note's question for each feeling picked, its `blue` and `purple` cells and its earlier thoughts (`earlier:12`) are all format 0.16's.

`npm test` also runs queries: what the reader takes from a query block and reports (a key a query does not have, `limit: week`, `summary: yes`, a span or a summary where no entries are kept, `group:` on a summary, and a query that cannot be drawn), kept entries as rows, a span of days on a faked clock and in more than one time zone (across midnight, and across a change of clocks), and the summary rules (counting, ties, the reader's own options, zeros, rounding, locale, `empty:`), the check-in note's roll-up, the four views drawn in the view, and that drawing writes nothing. Each of the 0.5.0 fixes has a test that fails without it: words typed and not added kept through a reload and added before a quit, a comma label typed whole stored as its item, today taken when the view is drawn, and answers of the wrong shape counted once among the note's problems.

`e2e/` drives the real Obsidian desktop app over the DevTools protocol and checks the plugin there, fifteen checks in all; see `e2e/README.md`.

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
- A widget's colour names are Obsidian's own colour variables, so they follow the theme in light and dark: `warm` is `--color-red` (the colour of `--text-error`; warm is the format's colour for the tone bad), `green` is `--color-green` (`--text-success`, the tone good), `amber` is `--color-orange` (`--text-warning`, the tone warn), `teal` is `--color-cyan`, and `slate` is `--text-muted` on a faint wash of the text colour (Obsidian has no blue-grey). A cell is a pale wash of its colour with a band of the full colour along its top; its words stay in the theme's text colour.
- Words of your own in a widget are added on *Add*, on Enter, on leaving the field, or on leaving the note (opening another note in the pane, closing it, or Finalize), one or several with commas between them; the reference renderer uses a tag field that adds them on a comma, on Enter and on leaving the field, so nothing typed is dropped. When the field is left by a press on another button, the words are added first and then the press, in the reference renderer's order; the button under the press is kept until its click, as that renderer keeps a cell's buttons and the places' summary, so the press lands. A press on the very button the words name ("tired" typed in a cell, then its *Tired* pressed; "cool" typed for a place, then *Cool* pressed) presses it once, as the reference renderer holds that press, rather than pressing it and taking it back. The *Add your own* field of a choice or multi question adds its words the same way, as format 0.16 and the reference renderer do, and a press on the very option its words name ("plum" typed, then *Plum* pressed) presses that option once in the same way. Words typed in either kind of field and not added yet are added before Obsidian quits or its window closes; after a reload they are added when the note is next drawn (above, *What it writes*). Words typed with commas between them are split at the commas, except where they are, whole, a listed item's or sense word's label that holds a comma ("Calm, settled"), or such a word already in the field: that is one word, stored as the item.
- **What each kind keeps** (the wrong-shape guard), from SPEC sections 5 and 7. An answer that holds nothing (no answer, `null`, `""`, `[]`, `{}`) is no answer, never of the wrong shape.

  | Kind | Kept as its shape |
  | --- | --- |
  | `text`, `date` | a string (a date written another way is shown as kept) |
  | `lines` | a list of strings |
  | `number` | a finite number |
  | `scale` | a whole number from 0 |
  | `choice` | a whole number from 1, or a string |
  | `multi` | a list of whole numbers from 1 and strings |
  | `multi` with `each:` | a list of pairs: `pick` a number or a string, `a` a multi's answer |
  | `grid-select` | a list of strings |
  | `svg-regions` | a list of `{"id": string, "s": [strings]}` |

  Other keys in a pair or a place are kept and allowed. A widget of an engine the plugin does not draw is not checked. Finalize keeps an answer of the wrong shape as written, a `lines` one with its blank lines too.
- **`each:`**: the copies are drawn in the order the source's answer holds the picks. While the view is open, a new pick's copy is added at the end and nothing already on screen moves, even when the source's answer changes order (a press or a typed word never reorders it, but a hand edit can); a drawing of the view (opening the note, or a change to its text) takes the answer's order again. That order is the view's, like the open place, and is not stored. A copy whose pick is taken back while you are in its field stays until you leave it. A pick's own options are offered under every pick: first from the other picks' pairs now, in the source's order, then from earlier entries, newest first, each entry's pairs whose pick its source holds; words listed as an option, words already in that pick's answer and repeats are left out before the limit is counted (the same for a plain `open` question). If a hand edit gives a pick two pairs, the first is shown and changed, and the others are kept as written. A `repeat daily` draft holding only pairs for picks taken back shows today's entry, with the draft's pairs over the entry's, pick by pick.
- **`blue` and `purple`** are drawn from `--color-blue` and `--color-purple`, as the other colour names are; like `slate` and `teal`, they carry no tone.
- The booklet's title is drawn above its opening, and a module's title above the module's opening.
- The place open in a body widget is the view's, kept across drawings of the view, not part of the answer.
- **Queries and summaries:**
  - A summary's `fields:` picks its rows and keeps them in the activity's order (the dates row first), as "one row per question, in the activity's order" reads; without a summary, `fields:` also gives the order.
  - A summary drawn as a table has a column for each statistic any of its rows has, then the note; the `value` field repeats one of the statistics, so it is no column of its own. Drawn as a list, tiles or cards, a summary row shows its label, value and note (and badge, tone, link or icon if a key points one at a field), and its other statistics only in a table, since on a summary `fields:` names rows, not the extras.
  - The reader's own options in a note and in a distribution come after the listed ones, in the order first seen going over the entries newest first. An own option whose words are a listed option's (case and white space at either end aside) counts as that option; a grid's own words are counted by their words, whichever cell they were typed in.
  - A question asked for each pick: its fields, and its summary rows, are in the source's list order (its options, items or places), then the reader's own picks as first seen. A summary gives a row for each pick its entries hold, with a count of 0 and no value or note when no place was given for it.
  - A question asked for each pick named alone in `from:` gives one row per entry with a field per pick, as the reference renderer does, not one row per pick and value.
  - Numbers are drawn in English (the view's language): the average to one decimal, half away from zero, and a whole number with none; other statistics as they are, to at most six decimals.
  - A `link` that is a heading (`#Heading`) is plain text: the view has no headings to go to.

## Licence

Apache-2.0. See `LICENSE`.
