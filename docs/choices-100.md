# Plugin 1.0.0: every choice listed once

This is the one list of the choices the Obsidian plugin made where the Booklet format (SPEC 0.18) is silent, so that Ben rules only on the ones that are not already his own recorded words. It folds three sources into one: the README's "Choices made where the format is silent" bullets, the 0.12.0 table in `docs/choices-0120.md`, and what a sweep of `src/` and `styles.css` found that neither names.

**Count.** 168 rows: 24 in A (they change what is written to a note) and 144 in B (C-167 and C-168 were added by lane F on 2026-11-03, for two choices lane E2 made). By tier: 43 `ben-words`, 29 `plan`, 7 `design`, 89 `builder`. 101 source lines were folded into other rows (a row says "merges N source lines"). 20 entries in D are behaviours SPEC 0.18 now defines, so they are not rows; each covers one or more README or table lines. The merge tallies are the list-maker's own count, not a proof that every source line is accounted for. The tiers are only these four. A row is `ben-words` only when his words on that point are quoted with their file and date; a blanket "all as recommended" makes a row `plan`.

Every row says what the plugin does in one sentence, why (quoted where a quote exists), where in the code (file and line, each found by searching the file), the source tier, and a suggestion. A suggestion is the list-maker's, never a ruling.

---

## A. Choices that change what is written to a note

- **C-001** · tier `builder`
  Typed words are written 0.7 seconds after the first key not yet written, however long the typing goes on; closing the pane, switching notes, closing the window and quitting write at once.
  - Why: “a hard stop … loses no more than that.” (code comment)
  - Where: `src/view.ts:134`
  - Source: Only the principle is Ben's, not the 0.7 s figure: Ben, 2026-10-27, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-daily-tracker/work/tracker-weekly-rollup.node.md`: “we save everything anyway every 2 seconds. So... unless there's some issue with doing that in obsidian, we'd just do it.” (the 2-second figure is his; the plugin uses 0.7 s, which is the builder's). Listed as a candidate in `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on), row 53 ("ASK THE FORMAT").
  - Suggestion: keep as the plugin's own; SPEC 8 is silent on timing (it only says words are written when the field is left and the page closed)
  - From: README "What it writes"; hardening list row 53

- **C-002** · tier `builder` (merges 2 source lines)
  When the note is also open as Markdown, a change goes into that Markdown editor; otherwise it is written with Obsidian's Vault.process. Obsidian's editor then saves LF line endings and no byte-order mark.
  - Why: “so nothing typed there is lost” (README). This is the one known place where a save does not keep the file's line endings, which SPEC 8 ("A writer keeps the file's line endings … and keeps a byte order mark") requires.
  - Where: `src/view.ts:1972`; `src/markdown-view.ts:20`
  - Source: Not ruled on: row 54 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on) ("ASK THE FORMAT (contradiction)"). Listed in section D as a contradiction with SPEC 8.
  - Suggestion: propose to SPEC: the writer rule should say what a host's editor may change; or change the plugin to write through Vault.process only when the Markdown pane has no unsaved text
  - From: README "What it writes"; hardening list row 54; also the (P) row of the 0.12.0 table on the listen writer

- **C-003** · tier `builder`
  A daily Finalize after midnight (the view still shows yesterday) is kept on the day the view was drawn, at that day's last second, replacing that day's entry; if that second is taken it moves back one second, not forward.
  - Why: “a daily activity's entry is kept on the day the page shows: past midnight, at that day's last second” (code comment). SPEC 8 defines "today" as the date when the page is drawn and says finishing again replaces that day's entry, but not what `ts` a late entry gets.
  - Where: `src/core/write.ts:459`
  - Source: Not ruled on: row 62 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on) ("ASK THE FORMAT").
  - Suggestion: keep as the plugin's own; propose one line to SPEC 8 saying what `ts` a late daily entry gets
  - From: README "What it draws" (`repeat daily`); hardening list row 62

- **C-004** · tier `builder`
  Pressing a picked choice option, or a picked scale anchor, again clears the answer (the answer is removed from the note).
  - Why: SPEC allows clearing only for a matrix item shown as separate questions; the README table says "press again to clear" for `choice` and `scale`.
  - Where: `src/questions.ts:339`
  - Source: Not ruled on: row 37 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on) ("ASK THE FORMAT to say a reader may clear").
  - Suggestion: propose to SPEC: say a reader may clear any single-answer question
  - From: README "What it draws" table; hardening list row 37

- **C-005** · tier `builder`
  A multi stores its picks in the order the reader picked them (`[3, 1]` if 3 came first), while its replies and its kept-entry words show in the options' order.
  - Why: SPEC 5 says replies show in the options' order and is silent on the stored order.
  - Where: `src/questions.ts:515`
  - Source: Not ruled on: row 38 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on) ("ASK THE FORMAT"). The same "order picked" rule is Ben's for the grid (SPEC 8, "A word typed in a grid cell leaves the answer's order as the reader picked it"), not for a multi.
  - Suggestion: propose to SPEC: state the order of a multi's stored list
  - From: README table; hardening list row 38

- **C-006** · tier `builder`
  A number field keeps what was typed even when it is outside `min` and `max` (with a hint "From 0 to 24"), and text that is not a number clears the answer.
  - Why: SPEC 8 says a number outside its range "is stored as typed"; clearing on non-numeric text is the plugin's.
  - Where: `src/questions.ts:213`
  - Source: Not ruled on: row 41 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on).
  - Suggestion: keep as the plugin's own
  - From: hardening list row 41

- **C-007** · tier `builder` (merges 2 source lines)
  A `lines` question stores every field, including blank ones and the empty field at the end, as `""` in the live answer; a kept entry (Finalize) leaves the blank lines out.
  - Why: “A `lines` answer lists every field as the reference renderer does” (README); SPEC 5 does not say what blank fields do.
  - Where: `src/questions.ts:262`; `src/core/write.ts:477`
  - Source: Not ruled on: row 43 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on). Also README Records bullet 3 ("…a `lines` answer without its blank lines").
  - Suggestion: propose to SPEC: say what a blank line of a `lines` answer does in a draft and in a kept entry
  - From: README Records bullet 3; README table; hardening list row 43

- **C-008** · tier `builder` (merges 2 source lines)
  An entry keeps only the answers that hold something (a draft emptied of every answer is removed as a block; an answer that holds nothing is not copied into the entry).
  - Why: SPEC 8 defines "holding nothing" and that a draft left holding nothing is taken out; copying only filled answers into the entry is the plugin's rule.
  - Where: `src/core/write.ts:473`
  - Source: Not ruled on: README Records bullets 3 and 4 and row 63 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on). Ben's rule that the writer "changes only what the reader changed" is a different rule: Ben, 2026-10-26, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-daily-tracker/work/tracker-plugin-from-spike.node.md`: “in general we don't want it normalizing or standardizing”
  - Suggestion: keep as the plugin's own
  - From: README Records bullets 3 and 4; hardening list row 63

- **C-009** · tier `builder` (merges 2 source lines)
  A matrix whose items are all cleared keeps no answer (the reference renderer keeps `[null, null]`), and pressing the picked anchor again clears an item in both the grid and the separate-questions layout.
  - Why: SPEC 5 allows clearing an item only in the separate-questions layout and stores `null` for an item not answered; it does not say what an all-null list is.
  - Where: `src/matrix.ts:53`
  - Source: Not ruled on: README Records bullet 11 and row 45 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on).
  - Suggestion: propose to SPEC: say whether an all-`null` matrix list is an answer, and whether the grid may clear
  - From: README Records bullet 11; hardening list row 45

- **C-010** · tier `builder`
  Words of the reader's own typed with commas between them are split at the commas into several words, except where the whole text is already a listed item's or sense word's label that holds a comma ("Calm, settled"), or such a word already in the field: that is one word.
  - Why: “a word in `known` whose label holds a comma ("Calm, settled"), typed whole, is one word, not two” (code comment). SPEC 7 and 8 do not mention commas.
  - Where: `src/core/widgets.ts:44`
  - Source: Not ruled on: README Records bullet 8 and row 83 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on) ("ASK THE FORMAT"). The reference renderer's tag field splits on commas; Ben's word on write-ins is “When you write-in, I want the write-ins to STAY.” (see the earlier-words row), not on commas.
  - Suggestion: propose to SPEC: say how typed words with commas are split
  - From: README Records bullet 8; hardening list row 83

- **C-011** · tier `builder`
  A press on the very button the typed words name ("tired" typed in a cell, then its Tired button pressed; "plum" typed in Add your own, then Plum pressed) presses it once, instead of pressing it and taking it back. A press on another button adds the typed words first, then does the press.
  - Why: “the reference renderer holds that press” (README).
  - Where: `src/questions.ts:429`; `src/engines.ts:162`
  - Source: Not ruled on: README Records bullet 8.
  - Suggestion: keep as the plugin's own
  - From: README Records bullet 8

- **C-012** · tier `ben-words`
  Words typed in an Add-your-own or a widget field and not yet added are added when the field is left, when another note opens in the pane, when the pane closes or switches to Markdown, at Finalize, and before Obsidian quits; after a reload they are kept on the device and added when the note is next drawn.
  - Why: SPEC 5 says they are added "when the field is left and when the page is closed or reloaded" (defined). Ben said a hard save is wanted: Ben, 2026-10-27, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-daily-tracker/work/tracker-weekly-rollup.node.md`: “we save everything anyway every 2 seconds. So... unless there's some issue with doing that in obsidian, we'd just do it.”
  - Where: `src/main.ts:84`; `src/held-store.ts:31`
  - Source: Ben, 2026-10-27, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-daily-tracker/work/tracker-weekly-rollup.node.md (gap 2)`: “we save everything anyway every 2 seconds. So... unless there's some issue with doing that in obsidian, we'd just do it.” SPEC 5 and 8 now say the same.
  - Suggestion: keep (already Ben's; SPEC 0.18 states the rule)
  - From: README Records bullet 8; "What it writes"

- **C-013** · tier `builder`
  When a hand edit gives a pick of a question asked for each pick two pairs, the first is shown and changed and the other is kept as written; taking a pick back keeps its pair, undrawn, and picking it again brings it back.
  - Why: SPEC 8 says a draft holding a pair for a pick taken back "stays"; the first-of-two-pairs rule is the plugin's.
  - Where: `src/core/each.ts:88`
  - Source: Not ruled on: README Records bullet 13 ("If a hand edit gives a pick two pairs…"). The "keep the hidden pair" half is Ben's: Ben, 2026-10-27, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-daily-tracker/work/checkin-each-design.node.md (run log)`: “Four calls on each: title once, keep hidden come back if re-pick, keep the widget, ignore the physical step for the roll up.”
  - Suggestion: keep as the plugin's own for the first-of-two rule
  - From: README Records bullet 13; "What it draws" (each:)

- **C-014** · tier `plan`
  A Delete button on each kept entry in the Kept entries list under Finalize (never on a query's cards) asks "Delete this entry?" in place with Yes, delete / No; it writes nothing until Yes.
  - Why: Part of 0.9.0's design calls D1 and D2, Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-dashboards/work/plugin-090-build.node.md`: “Great. approve the calls. go on 0.9.0”.
  - Where: `src/view.ts:1690`
  - Source: `design/obsidian-dashboards/proposal.md` D1 and D2, approved: Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-dashboards/work/plugin-090-build.node.md`: “Great. approve the calls. go on 0.9.0”. SPEC 8 only says a kept entry may be taken out.
  - Suggestion: keep as the plugin's own
  - From: README Dashboards bullet; 0.9.0 plan

- **C-015** · tier `design`
  A deleted entry is named by its place among the activity's kept entries and by how it read when its card was drawn, never by `ts` alone; a stale card (the file changed) deletes nothing and says so; two entries that read exactly alike cannot be told apart; an entry read from items in several blocks goes from all of them.
  - Why: “never found by `ts` alone, because two entries of one block may share one” (README).
  - Where: `src/core/write.ts:544`; `src/view.ts:1759`
  - Source: Listed under "What the plugin chooses where the format is silent (no call needed)" in `design/obsidian-dashboards/proposal.md` and the build item `plugin-090-build.node.md`; D1 and D2 were approved, this detail was not a call.
  - Suggestion: keep as the plugin's own
  - From: README Dashboards bullet "Removal is by position, time and appearance"

- **C-016** · tier `builder` (merges 2 source lines)
  When playback ends, `pos` is taken out of the answer, leaving `{ "done": true }`, instead of being set to 0; a `done` that is true is never cleared by a pause or the end, and a first pause at the very start makes no answer.
  - Why: SPEC 5 allows `pos` to be reset to 0 "or takes it out"; “Smaller; the format allows `0` or none” (0.12.0 table).
  - Where: `src/core/listen.ts:155`
  - Source: Not ruled on: 0.12.0 table rows "`pos` is taken out at the end" and (A) "A `done` that is true is never cleared…". The never-clear rule is in SPEC 5; only "take `pos` out" is a choice among two allowed forms.
  - Suggestion: keep as the plugin's own (SPEC allows either)
  - From: 0.12.0 table §4 and §8 (A)

- **C-017** · tier `ben-words` (merges 3 source lines)
  While media plays the position is kept on the device each whole second; it is written into the note only on pause, end, leaving the page and quit, and a redraw that would replace a playing element waits until it stops.
  - Why: SPEC 5 gives this as a renderer note ("advised"); Ben, 2026-11-01, `design/v018/calls.md, plugin and renderer decisions`: “Serious S6 (listen write cadence) -> keep pos in the plugin's device-local store while playing; write to the file only on pause, end, leaving and quit; whole seconds; never seek on an incoming change while playing; the cadence moves out of the format into a renderer note”
  - Where: `src/listen-view.ts:65`; `src/view.ts:1852`
  - Source: Ben, 2026-11-01, `design/v018/calls.md, plugin and renderer decisions`: “Serious S6 (listen write cadence) -> keep pos in the plugin's device-local store while playing; write to the file only on pause, end, leaving and quit; whole seconds; never seek on an incoming change while playing; the cadence moves out of the format into a renderer note” Also recorded as the 0.12.0 plan item 11 (`design/plugin-0120/plan-v2.md`).
  - Suggestion: keep (already Ben's)
  - From: 0.12.0 table §4 and §8 (C); README "The listen question"

- **C-018** · tier `builder` (merges 2 source lines)
  A Close on a paused element the reader moved (scrubbed) with no view following it writes the place she moved to; a write that cannot be made resolves false, the place stays noted on the device, and the quit hook keeps asking, giving each place 3 seconds.
  - Why: “Close wrote only for an element that was playing” (0.12.0 table, (L)); “flush waited for ever on a write that never answered”.
  - Where: `src/now-playing.ts:94`; `src/now-playing.ts:498`
  - Source: Not ruled on: 0.12.0 table §8 (L) rows.
  - Suggestion: keep as the plugin's own
  - From: 0.12.0 table §8 (L)

- **C-019** · tier `builder`
  A word the reader types in a body-widget place's field that is one of the place's words (in any case) is stored as that word's id; any other word is stored as typed.
  - Why: The reference renderer's rule (README); SPEC 7 says the record holds "word ids, or the reader's own words" and is silent on case.
  - Where: `src/core/widgets.ts:292`
  - Source: Not ruled on: README "What it draws" (two widgets).
  - Suggestion: propose to SPEC: say the matching rule for an own word equal to a listed word
  - From: README "What it draws"

- **C-020** · tier `builder`
  A new entry's `ts` is written to the second (`2026-10-27T18:30:00Z`), first in the entry, and a `ts` that clashes with another entry of the activity is moved on to the next free second.
  - Why: SPEC 8 (line 1160): "the Obsidian plugin writes seconds, the reference renderer milliseconds"; `ts` may stand anywhere in an entry. The clash rule is defined by SPEC; the seconds and the position are allowed either way.
  - Where: `src/core/write.ts:45`
  - Source: Not ruled on: README "Choices made where the format is silent", Records bullet 1. SPEC 8 names this as allowed (line 1160).
  - Suggestion: keep as the plugin's own (SPEC allows either)
  - From: README "Choices made where the format is silent", Records bullet 1

- **C-021** · tier `builder`
  A new block is written in the reference renderer's layout: answers indented by one space, a draft on one line, entries one to a line; a new entry is written compact. An existing block keeps its own layout and a change follows it.
  - Why: SPEC 8 (line 1159): a new entry "may be written compact, as the reference renderer and the Obsidian plugin write one"; a new block's layout beyond that is the writer's.
  - Where: `src/core/write.ts:5`
  - Source: Not ruled on: README "Choices made where the format is silent", Records bullet 2. SPEC 8 allows either (line 1159).
  - Suggestion: keep as the plugin's own (SPEC allows either)
  - From: README "Choices made where the format is silent", Records bullet 2

- **C-022** · tier `builder`
  An `answers` block whose last answer is cleared stays in the note as `{}`; a draft left holding nothing is taken out.
  - Why: SPEC 8 (line 1163): the plugin "keeps an `answers` block as `{}`, and the reference renderer takes both out"; the draft half is defined (a draft the reader's change leaves holding nothing "is taken out").
  - Where: `src/core/write.ts:406`
  - Source: Not ruled on: README "Choices made where the format is silent", Records bullet 4. SPEC 8 allows either (line 1163).
  - Suggestion: keep as the plugin's own (SPEC allows either)
  - From: README "Choices made where the format is silent", Records bullet 4

- **C-023** · tier `builder`
  Finalizing a `repeat daily` entry again with nothing changed is refused with "Today's entry is already kept. Change an answer to keep it again."; an entry that is empty is refused with "Nothing to keep yet: the entry is empty."
  - Why: SPEC 8 (line 1165): finishing again with nothing changed "may be refused (the Obsidian plugin) or kept again with a new `ts` (the reference renderer)".
  - Where: `src/core/write.ts:454`
  - Source: Not ruled on: README "Choices made where the format is silent", Records bullet 6. SPEC 8 allows either (line 1165).
  - Suggestion: keep as the plugin's own (SPEC allows either)
  - From: README "Choices made where the format is silent", Records bullet 6

- **C-024** · tier `builder`
  A note that ends inside a code fence that is never closed gets no new records region: the plugin refuses with "This note ends inside a code fence that is never closed, so an answer cannot be written after it. Close the fence in Markdown first."
  - Why: SPEC 8 (line 1167): a writer "may refuse to add records to such a file and say why (the Obsidian plugin and the reference renderer do)".
  - Where: `src/core/write.ts:111`
  - Source: Not ruled on. SPEC 8 allows either (line 1167).
  - Suggestion: keep as the plugin's own (SPEC allows either)
  - From: `src/core/write.ts`; sweep

---

## B. The rest, by theme

### B. Navigation and pages (31)

- **C-025** · tier `plan`
  A menu of a tab's pages ("Pages in this tab") is drawn for a tab that holds a named page and two or more pages, as a disclosure that starts closed; whether it is open, and the words in its search box, are the pane's, kept while the pane is open and never saved or written.
  - Why: SPEC 3: the menu, its search and the list of linking pages "are a renderer's to draw, and a renderer may draw none."
  - Where: `src/page-menu.ts:20`
  - Source: 0.8.0 Done-when point 3 (the menu with a search), approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-page-trees/_node.md (run log)`: “okay on the six obsidian-page-trees points and go”. Replaced in 1.0.0 by the Pages button (point 8): Ben, 2026-11-03, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-100-release.node.md (point 8)`: “yes to the pages nav button in 1.0.0.”
  - Suggestion: change (already ruled): the closed disclosure becomes the Pages button of 1.0.0 point 8; the search box stays
  - From: README Pages "leads the spec" bullet 1; plugin-lead-notes "Menu"

- **C-026** · tier `plan` (merges 2 source lines)
  The page search keeps the pages whose title or words hold every word typed (case and marks aside; the words are the page's prose and its questions' prompts), the ones with the words in the title first, then the rest in reading order; Enter opens the first, Escape clears; Enter in an empty box does nothing.
  - Why: SPEC 3 leaves the search to the renderer.
  - Where: `src/core/nav.ts:1155`
  - Source: 0.8.0 Done-when point 3 (search), approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-page-trees/_node.md (run log)`: “okay on the six obsidian-page-trees points and go”; the Enter-does-nothing detail is in `design/pages/plugin-lead-notes.md`, not ruled on.
  - Suggestion: keep as the plugin's own
  - From: README Pages "leads the spec" bullet 2; plugin-lead-notes "Search", "Enter in an empty search"

- **C-027** · tier `plan`
  "Mentioned on" lists the pages whose words hold a heading link that opens the page on show, from anywhere in the link's module; a page does not mention itself; a source is listed once; a link counts only where a reader sees it as a link (not in code, a comment, a `<pre>`, a `$$` block, a block link or an embed); a page in another tab or activity is named with its tab or activity first.
  - Why: SPEC 3 leaves the list to the renderer. Obsidian's own backlinks "cannot stand in" (navigation proposal call K).
  - Where: `src/core/nav.ts:1253`
  - Source: Navigation proposal call K and 0.8.0 point 3, approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.” The exact rules of what counts as a link are in the README only.
  - Suggestion: keep as the plugin's own
  - From: README Pages "leads the spec" bullet 3; plugin-lead-notes "Mentioned on"

- **C-028** · tier `design`
  The cards of the pages under a page ("Pages under this one") and "Mentioned on" are drawn after the last section of the page, whatever step is on show; a tab's first page made of the words before its first page line has no cards.
  - Why: SPEC 3: "After a page's own words come the pages under it, as cards" (defined); "whatever step is on show" is the plugin's.
  - Where: `src/view.ts:1337`
  - Source: `design/pages/plugin-lead-notes.md` ("Cards": after the last part of a page only); not a numbered call.
  - Suggestion: keep as the plugin's own
  - From: README Pages silent bullet 1; plugin-lead-notes "Cards"

- **C-029** · tier `plan`
  The trail on a page under another runs from the booklet down: the activity (a link), the tab when the activity has a tab bar (a link to its first page), each page above (links), then the page; a top page's trail ends at the activity.
  - Why: SPEC 3: the trail "may name the pages above it … What it names before them … is the renderer's."
  - Where: `src/screens.ts:50`
  - Source: Navigation proposal Decision 8 call B (the trail starts at the booklet; the tab joins when there is a tree), approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: keep as the plugin's own
  - From: README Pages silent bullet 2; plugin-lead-notes "Trail"

- **C-030** · tier `design`
  The pager and the trail name a page without its leading emoji (as an activity's title is); the page's own title is drawn as written at the head of the page.
  - Why: “The trail and pager use titles without a leading emoji” (plugin-lead-notes).
  - Where: `src/core/nav.ts:218`
  - Source: `design/pages/plugin-lead-notes.md` ("Also: … titles without a leading emoji"); not a numbered call.
  - Suggestion: keep as the plugin's own
  - From: README Pages silent bullet 2

- **C-031** · tier `plan`
  The saved place is `{ version, screen, tab, page, part }`, kept with the pane in Obsidian's workspace file and never in the note; `page` is a named page's id and `part` counts within it; a place with no page key counts every section of the tab.
  - Why: SPEC 3: "which page is showing is never stored" (it means in the file); the shape of the saved place is the plugin's.
  - Where: `src/core/nav.ts:57`
  - Source: Navigation proposal Decision 5 and section 4.1/4.8 (nothing about the place is written into the note), approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: keep as the plugin's own; propose to SPEC: "never stored in the file" (hardening list row 23)
  - From: README Pages silent bullet 3; hardening list row 23

- **C-032** · tier `ben-words`
  The saved place has one shape, version 2; a place of any other version (or garbage) opens the start screen. The older version-1 shape is not read.
  - Why: Pre-1.0 rule: no older shape is kept working.
  - Where: `src/core/nav.ts:19`
  - Source: Ben, 2026-11-01, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-0110-hardening.node.md (run log)`: “Yes drop it and delete the readme promise” (call 2: saved-pane `version 1`) Also Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-dashboards/work/plugin-090-build.node.md (run log)`: “do not preserve backward compatibility as we are pre-stable release until v1.0”
  - Suggestion: keep (already Ben's)
  - From: README Pages silent bullet 3; 0.11.0 call 2

- **C-033** · tier `design`
  A `> [!page` line at the start of a line inside an HTML comment, a `<pre>` block or a `$$` block is read as a page line there, as a `> [!tab]` line is. (This is the row as asked; Ben's ruling and what was built are under "C-033" in the rulings below, and the tab line was widened the same way on 2026-11-03.)
  - Why: SPEC does not cover a comment or `<pre>`, and lists the `$$` case as open (SPEC 1313); the plugin's "Mentioned on" ignores links in the same places, so the two disagree.
  - Where: `src/core/nav.ts:226`
  - Source: `design/pages/plugin-lead-notes.md` ("Page line in a comment, `<pre>` or `$$`"); row 33 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on) says "ASK THE FORMAT, leaning CHANGE". Not ruled on.
  - Suggestion: change or propose to SPEC: read a page line there only where a tab line would be read, and say so in the spec
  - From: README Pages silent bullet 4; hardening list row 33

- **C-034** · tier `design`
  Pressing a page in the menu leaves the menu open and puts focus on the new page's title (a heading); so do Next, Back and a card that lead to another page of the same screen; the first drawing of a note and a step through Obsidian's own Back and Forward do not move focus.
  - Why: A keyboard or screen-reader reader must land on the thing (code comments).
  - Where: `src/view.ts:1159`
  - Source: `design/pages/plugin-lead-notes.md` ("Focus after a move"); not a numbered call.
  - Suggestion: keep as the plugin's own
  - From: README Pages silent bullet 6; plugin-lead-notes

- **C-035** · tier `builder`
  A deep tree scrolls inside its menu; a screen has one `aria-current="page"` (the menu's, with the trail ending in plain words; a tab with no menu keeps the trail's mark).
  - Why: Accessibility choices (README).
  - Where: `src/page-menu.ts:34`
  - Source: Not ruled on; plugin-lead-notes lists the single `aria-current`.
  - Suggestion: keep as the plugin's own
  - From: README Pages silent bullet 6

- **C-036** · tier `plan` (merges 2 source lines)
  A page group's label is the page's name with its count ("The two axes, 1 of 2"); a tab with no page line keeps "Page 2 of 3".
  - Why: SPEC 3 names these two counter words as the plugin's ("the Obsidian plugin writes \"2 of 3\" … and \"Page 2 of 3\""), so the counter is defined; only the group label is a choice.
  - Where: `src/screens.ts:181`
  - Source: Navigation proposal Decision 8 call D (counter words), approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.” The group label is not in a call.
  - Suggestion: keep as the plugin's own
  - From: README Pages silent bullet 6; hardening list row 32

- **C-037** · tier `builder`
  A page with two or more groups can be taken one at a time, and that works on a named page the same way. Back and Next move a step first, then a section, then a page; on the first step Back goes where it went without steps; a move to another section or page opens on its first step, except Back to the section before in the same page, which opens on that section's last step. The step the reader is on is the view's, never a step in Obsidian's Back and Forward and never saved.
  - Why: SPEC 12 ("one at a time") says Next on the last step goes on to the next section; it says nothing of Back (hardening list row 35).
  - Where: `src/view.ts:1540`
  - Source: Not ruled on: README Pages silent bullet 7, row 35 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on).
  - Suggestion: propose to SPEC: say what Back does on a step
  - From: README Pages silent bullet 7; hardening list row 35

- **C-038** · tier `plan`
  Another section or page of a tab is a step in Obsidian's Back and Forward; choosing another tab never is; each tab remembers its last page while the pane is open.
  - Why: SPEC 3: tabs are not Back steps for the pager; the host's history is not mentioned.
  - Where: `src/core/nav.ts:47`
  - Source: Navigation proposal Decision 4 and call J, approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: keep as the plugin's own
  - From: README Pages silent bullet 8; hardening list row 22

- **C-039** · tier `plan`
  Home draws its cards as numbered contents-list rows (number first, a picture tile only if some row has one, the whole row a link, a chevron), not as tiles; a card's number is its place in the module's reading order, so a module's second tab may start at 3.
  - Why: SPEC 3 leaves the layout of cards to the renderer.
  - Where: `src/screens.ts:101`
  - Source: Navigation proposal Decision 1 (cards as rows) and small call d (card numbers), approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: keep as the plugin's own
  - From: hardening list rows 12 and 13 (README "What it draws" Cards)

- **C-040** · tier `plan`
  A card's status line is worked out as "2 questions · Not started", "1 of 2 answered", "Done", "N kept", "N reads"; a module card says "Not started" or "N of M started".
  - Why: SPEC 3 says the status line is "a line the renderer works out" and gives "Not started" and "N of M started" as examples.
  - Where: `src/core/nav.ts:967`
  - Source: Navigation proposal section 2.2/3.1 (the words follow the reference renderer), approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: keep as the plugin's own
  - From: hardening list row 14

- **C-041** · tier `plan`
  A tab bar is a row of wrapping buttons with arrow, Home and End keys; a module's tab bar needs two or more module tabs.
  - Why: SPEC 3 says nothing of how a tab bar looks.
  - Where: `src/screens.ts:136`
  - Source: Navigation proposal Decision 2 (the tab bar), approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: keep as the plugin's own
  - From: hardening list row 18

- **C-042** · tier `plan`
  The pager's words: Back, "Page 2 of 3" or "2 of 3", Next at the foot; leaving the activity reads "Back to the overview"; Next to another activity reads "Next: 3. Title" (no number between bare activities); the last activity of the file has no Next.
  - Why: SPEC 3 names the moves and says Next on a tab's last page goes to the next activity; the words are the renderer's.
  - Where: `src/view.ts:1458`
  - Source: Navigation proposal Decision 3 (where the pager sits) and small call b, approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: keep as the plugin's own
  - From: hardening list rows 19 and 21

- **C-043** · tier `builder`
  Next goes in the file's order of activities, not in the module screen's tab-by-tab order (the two can differ).
  - Why: SPEC 3: Next goes to "the next activity"; the module's tab order is not mentioned (hardening list row 20).
  - Where: `src/core/nav.ts:757`
  - Source: Not ruled on: row 20 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on) ("ASK THE FORMAT").
  - Suggestion: propose to SPEC: say which order Next follows
  - From: hardening list row 20

- **C-044** · tier `plan`
  The start rule counts only offered activities: "exactly one activity" ignores a `hidden` one, so a booklet with one offered and one hidden activity opens straight into the offered one.
  - Why: SPEC 2 says a booklet that holds exactly one activity opens into it, and (in 3) that `hidden` activities are "not offered"; the two lines are ambiguous together.
  - Where: `src/core/nav.ts:698`
  - Source: Navigation proposal small call f (count only offered activities, ask SPEC to say "offered"), approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: propose to SPEC: say "offered" in the start rule
  - From: hardening list row 9

- **C-045** · tier `plan`
  A heading link (`[[#Heading]]`, `[words](#slug)`) is matched ignoring case, white space and Markdown marks, also against GitHub-style slugs, taking the first match in file order over titles, tab names, page titles, headings, question prompts and callout titles; a link from another note looks through the whole file.
  - Why: SPEC 3 says "the first place whose heading or title reads those words"; no case, slug or whole-file rule.
  - Where: `src/core/nav.ts:1020`
  - Source: Navigation proposal section 4.5 and small call c (a heading link from another note looks through the whole file), approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.” The slug and case rules are not in a call.
  - Suggestion: propose to SPEC: say how a heading link is matched
  - From: README "Links"; hardening list rows 24 and 25

- **C-046** · tier `builder`
  Dead links: a heading link nothing matches is plain text; a link to a module the booklet does not hold reads "not in this booklet"; a block link (`#^id`) to a block of the same note does nothing.
  - Why: SPEC 3 covers the first two; the third is on the README's not-drawn list.
  - Where: `src/view.ts:645`
  - Source: Not ruled on: row 26 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on).
  - Suggestion: keep as the plugin's own
  - From: hardening list row 26; README "What it does not draw yet"

- **C-047** · tier `plan`
  Finalize, its notes and the kept entries are drawn under a page only on a tab that holds a question (or when the opening above every tab does); the reference renderer draws its finish row on every tab.
  - Why: SPEC 3 is silent on where Finalize sits.
  - Where: `src/view.ts:1475`
  - Source: Navigation proposal Decision 8 call H, approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: keep as the plugin's own
  - From: hardening list row 27

- **C-048** · tier `plan`
  The view's width is capped at Obsidian's line width (`--file-line-width`) even with "Readable line length" off, and the screen's title is drawn in the inline title's size even with "Show inline title" off.
  - Why: Legibility, which Ben's "leave it to Obsidian" rule allows: Ben, 2026-10-26, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md`: “(a) leave as much as possible up to obsidian. The user will have their own obsidian settings and we don't want to override them except for legibility.”
  - Where: `styles.css:26`
  - Source: Navigation proposal small call h (keep both), approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.” Related rule: Ben, 2026-10-26, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md`: “(a) leave as much as possible up to obsidian. The user will have their own obsidian settings and we don't want to override them except for legibility.”
  - Suggestion: keep as the plugin's own
  - From: hardening list row 16

- **C-049** · tier `plan`
  A folded callout (a "Transcript") is drawn as Obsidian draws a folded callout, not as a card of its own; the status line counts it only for "reads".
  - Why: SPEC 3 names folded callouts among what a renderer that draws cards gives parts to.
  - Where: `src/core/nav.ts:342`
  - Source: Navigation proposal small call g, approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: keep as the plugin's own
  - From: hardening list row 15

- **C-050** · tier `plan`
  Icons are Obsidian's own Lucide drawings, so the 13 icons Obsidian draws differently from Booklet's files look as Obsidian draws them; Booklet's 161 icon names are all accepted.
  - Why: Leave it to Obsidian (Ben, 2026-10-26, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md`: “(a) leave as much as possible up to obsidian. The user will have their own obsidian settings and we don't want to override them except for legibility.”).
  - Where: `src/booklet-icons.ts:2`
  - Source: Navigation proposal small call e (accept Obsidian's drawings), approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: keep as the plugin's own
  - From: navigation proposal 4.7

- **C-051** · tier `ben-words`
  The list of kept entries is a fold ("Kept entries (4)", "Kept days" for a daily activity) that starts open, opens and shuts by press, Enter or Space, remembers its state for each activity while the pane is open and never writes it; `entries:folded` starts it folded.
  - Why: SPEC 3 defines `entries:folded` (the mark); the fold itself is the plugin's, at Ben's request.
  - Where: `src/view.ts:1627`
  - Source: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-cards-and-navigation/_node.md (point 14)`: “the kept entries list needs to be minimizable. Right now, it trails off the bottom of the page. And even with 3 or 4, it seems kind of cumbersome. So it needs to be collapsible.” And on the mark: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-cards-and-navigation/_node.md (point 14)`: “I would do it collapsed by default, but that's not a, I don't believe that's a feature. I think that's just a mark or ID on the actual booklet or activity itself.”
  - Suggestion: keep (already Ben's)
  - From: README "Activities that repeat"; 0.6.0 Done-when point 14

- **C-052** · tier `builder`
  The kept entries list shows ten entries newest first with a "Show all N entries" button; dates are written in the device's locale.
  - Why: SPEC says nothing of the list's length or dates.
  - Where: `src/view.ts:138`
  - Source: Not ruled on: row 67 of `design/obsidian-hardening/choices.md` (2026-11-01 researcher's list, 91 rows; not ruled on).
  - Suggestion: keep as the plugin's own
  - From: hardening list row 67

- **C-053** · tier `builder` (merges 4 source lines)
  Continue appears on home and on a module's screen but not on a booklet that opens straight into one activity; it names its target ("Continue: Episode 3"), hides when nothing is left, and puts focus on the prompt it opened; hidden and `repeat` activities are skipped, and it skips a question the reader cannot answer here (an unread widget, an answer of the wrong shape).
  - Why: SPEC 12 defines Continue's rule (after her place, never holding her back); where it shows, its words and what it skips are the renderer's.
  - Where: `src/view.ts:1279`; `src/core/nav.ts:902`
  - Source: Not ruled on: 0.12.0 table §5 rows 3 to 6 and §8 (A) row on skipped questions. The rule itself is Ben's: Ben, 2026-11-02, `design/plugin-0120/calls.md, second round 2.4`: “no, if it will clearly get trapped there, it  needs to be fixed. that will be very annoying”
  - Suggestion: keep as the plugin's own
  - From: 0.12.0 table §5, §8 (A)

- **C-054** · tier `builder`
  A furthest page that is past the last page of the booklet is no place, and the records' last answered place is used instead.
  - Why: “The device keeps the furthest only, so pages the author took out left Continue gone for good.” (0.12.0 table, (L))
  - Where: `src/core/nav.ts:902`
  - Source: Not ruled on: 0.12.0 table §8 (L).
  - Suggestion: keep as the plugin's own
  - From: 0.12.0 table §8 (L)

- **C-055** · tier `builder`
  A prompt Continue led to shows a focus ring after a key press and none after a mouse press (`:focus-visible`).
  - Why: “It showed none, so a keyboard reader could not see where focus went.” (0.12.0 table, (U))
  - Where: `styles.css:2552`
  - Source: Not ruled on: 0.12.0 table §8 (U).
  - Suggestion: keep as the plugin's own
  - From: 0.12.0 table §8 (U)

### B. Questions and answers (23)

- **C-056** · tier `builder`
  A matrix is drawn as buttons in both layouts (the reference renderer draws a grid of radio buttons); a matrix with no items, or no anchors, is listed among the note's problems and still drawn as a question. A query of one matrix question with `summary: on` gives its distribution for each item, "<item> · <anchor>"; a summary gives a row for each item, "<title> · <item>"; a kept entry shows "<item>: <anchor's words>" with a dash for an item not answered.
  - Why: SPEC is silent on these (README).
  - Where: `src/core/query.ts:408`; `src/core/query.ts:518`
  - Source: Not ruled on: README "Choices made where the format is silent", Records bullet 11 (second half).
  - Suggestion: keep as the plugin's own; propose to SPEC: say how a matrix summarises
  - From: README Records bullet 11

- **C-057** · tier `plan`
  The copies of a question asked for each pick (`each:`) are drawn in the order the source's answer holds the picks; while the view is open a new pick's copy is added at the end and nothing on screen moves, even when the source's answer changes order; a drawing of the view takes the answer's order again. That order is the view's, like the open place, and is not stored. A copy whose pick is taken back while she is in its field stays until she leaves it.
  - Why: Nothing on screen should jump under her hand.
  - Where: `src/each-question.ts:81`
  - Source: `design/obsidian-daily-tracker` each-in-plugin item (Ben, 2026-10-27, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-daily-tracker/work/tracker-each-in-plugin.node.md (run log)`: “When you write-in, I want the write-ins to STAY.”), approved with its build. The ordering detail is in the code header and the README, not a numbered call.
  - Suggestion: keep as the plugin's own
  - From: README "Choices made where the format is silent", Records bullet 13; `src/each-question.ts` header

- **C-058** · tier `ben-words`
  A pick's own words stay: write-ins in an `each:` question stay in the answer and the pair stays hidden when its pick is taken back.
  - Why: “When you write-in, I want the write-ins to STAY.”
  - Where: `src/each-question.ts:21`
  - Source: Ben, 2026-10-27, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-daily-tracker/work/tracker-each-in-plugin.node.md (run log)`: “When you write-in, I want the write-ins to STAY.”
  - Suggestion: keep (already Ben's)
  - From: README "Choices made where the format is silent", Records bullet 13

- **C-059** · tier `ben-words`
  The earlier-answers rules: the Add-your-own field offers the reader's own earlier words as buttons only, newest first, listed options and words already in the answer left out before the limit is counted; the limit is 12 unless the line says `earlier:<n>`; a `lines` question offers none; a pick's own options come first from the other picks' pairs now, in the source's order, then from earlier entries, newest first.
  - Why: “Let's keep the limit of 12 … that limit should be settable in the booklet format.”
  - Where: `src/core/earlier.ts:27`
  - Source: Ben, 2026-10-27, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-daily-tracker/work/checkin-earlier-answers-design.node.md`: “Let's keep the limit of 12. That's not a bad idea. But that limit should be settable in the booklet format.” And Ben, 2026-10-27, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-daily-tracker/work/checkin-earlier-answers-design.node.md (run log)`: “1. (a) stay as today. 2. (a) buttons only is fine 3. (b) only when the line says earlier:<n> 4. earlier: is good 5. yes, that's fine web renderer can lag this feature. yes it's fine to have the guard-test check now”
  - Suggestion: keep (already Ben's)
  - From: README "Choices made where the format is silent", Records bullet 13; `src/core/earlier.ts`

- **C-060** · tier `ben-words`
  Quadrant colours: a quadrant widget's four regions are red, green, blue and purple (agitating, invigorating, draining, soothing), drawn from `--color-red`, `--color-green`, `--color-blue` and `--color-purple` like the other colour names; `blue` and `purple` carry no tone.
  - Why: Ben named the words and the colours.
  - Where: `styles.css:483`
  - Source: Ben, 2026-10-27, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-daily-tracker/work/tracker-each-in-plugin.node.md`: “The quadrants are (from left to right and top to bottom): agitating, invigorating, draining, soothing not the weather words there currently. And they should be red, green, blue, purple.” And Ben, 2026-10-27, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-daily-tracker/work/tracker-each-in-plugin.node.md (run log)`: “keep the colors. sign off on 0.3.0.”
  - Suggestion: keep (already Ben's)
  - From: README "Choices made where the format is silent", Records bullet 18 (`blue` and `purple`)

- **C-061** · tier `plan`
  A widget's other colour names are Obsidian's own colour variables: `warm` is `--color-red` (the colour of `--text-error`), `green` is `--color-green`, `amber` is `--color-orange`, `teal` is `--color-cyan`, `slate` is `--text-muted` on a faint wash of the text colour; a cell is a pale wash of its colour with a band of the full colour along its top, its words in the theme's text colour.
  - Why: Obsidian has no blue-grey; the colours follow the theme in light and dark.
  - Where: `styles.css:450`
  - Source: Leave appearance to Obsidian: Ben, 2026-10-26, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md`: “(a) leave as much as possible up to obsidian. The user will have their own obsidian settings and we don't want to override them except for legibility.” The particular mapping is in `design/obsidian-daily-tracker` and the README, not a numbered call.
  - Suggestion: keep as the plugin's own; propose to SPEC: say what each colour name means in a host that has its own palette
  - From: README "Choices made where the format is silent", Records bullet 7

- **C-062** · tier `design`
  Questions inside any callout (not only a group) are drawn; the reference renderer draws a group's questions only.
  - Why: “because the plugin's brief asks for it; removing them is a few lines in the reader.” SPEC 1310 (known differences) says a question in a note, tip or other callout but a group is drawn as text by the reference renderer and the linter warns, so the plugin is the one that differs.
  - Where: `src/core/reader.ts:1226`
  - Source: Not ruled on as its own call; the plugin's brief asks for it (README Records bullet 14).
  - Suggestion: keep as the plugin's own; propose to SPEC
  - From: README "Choices made where the format is silent", Records bullet 14

- **C-063** · tier `builder`
  Steps default to all at once, with the switch on the page; the step view is the reader's choice on the device. A step is what a group is; a page with fewer than two groups has none; prose between two groups goes with the group after it.
  - Why: The reference renderer does the same.
  - Where: `src/view.ts:1540`
  - Source: Not ruled on: README "Choices made where the format is silent", Records bullet 15.
  - Suggestion: keep as the plugin's own
  - From: README "Choices made where the format is silent", Records bullet 15

- **C-064** · tier `builder`
  A source opens under its paragraph, not in the reference renderer's side panel or bottom sheet; no hover preview and no endnotes in print.
  - Why: Obsidian's panes are narrow and a panel in the flow keeps the page as it is.
  - Where: `src/reading.ts:147`
  - Source: Not ruled on: README "Choices made where the format is silent", Records bullet 16.
  - Suggestion: keep as the plugin's own
  - From: README "Choices made where the format is silent", Records bullet 16

- **C-065** · tier `builder`
  A row is drawn only in an activity's pages; in an opening it is left to Obsidian. A row left open at a page break ends there without a problem listed; one left open at a tab, activity, module or the end of the file is listed.
  - Why: SPEC 7 defines rows; where a renderer draws them is the plugin's.
  - Where: `src/core/reader.ts:725`
  - Source: Not ruled on: README "Choices made where the format is silent", Records bullet 18.
  - Suggestion: keep as the plugin's own
  - From: README "Choices made where the format is silent", Records bullet 18

- **C-066** · tier `builder`
  Words the reader typed in an Add-your-own field are held on the device under `<key>#own:<pick>`, the key 0.5.0 and 0.6.0 used, so an older version's held words are found.
  - Why: A key name kept so older held words are found.
  - Where: `src/each-question.ts:41`
  - Source: Not ruled on: README "Choices made where the format is silent", Records bullet 19. Tension with Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-dashboards/work/plugin-090-build.node.md (run log)`: “do not preserve backward compatibility as we are pre-stable release until v1.0” (pre-1.0: no old shape is kept working); listed in section D.
  - Suggestion: Ben to decide: keep the name, or drop the old-version promise and rename
  - From: README "Choices made where the format is silent", Records bullet 19

- **C-067** · tier `builder`
  The place open in a body widget is the view's, kept across drawings of the view, not part of the answer; the booklet's title is drawn above its opening and a module's title above the module's opening.
  - Why: The open place is not an answer.
  - Where: `src/view.ts:1207`
  - Source: Not ruled on: README "Choices made where the format is silent", Records bullets 20 and 21.
  - Suggestion: keep as the plugin's own
  - From: README "Choices made where the format is silent", Records bullets 20 and 21

- **C-068** · tier `plan`
  Tiles, bars and a line of a question asked for each pick named alone in `from:` have one row for each pick, in the source's order (label is the pick's words, value the answer from the newest entry that answered it), where the reference renderer's tiles of such a question draw a field for each pick of one row. The plugin leads the format here.
  - Why: SPEC 889: "A follow-up named alone in `from:` gives one row per pick and value", and it says the reference renderer draws tiles, bars and a line for it as "a line saying the view does not draw it yet". The plugin draws them, one row per pick, so it is ahead of the renderer and in line with SPEC.
  - Where: `src/core/query.ts:662`
  - Source: `design/obsidian-dashboards/proposal.md` D7, approved: Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-dashboards/work/plugin-090-build.node.md`: “Great. approve the calls. go on 0.9.0”
  - Suggestion: keep as the plugin's own; propose to SPEC
  - From: README "Choices made where the format is silent", Records Dashboards bullet 1; Queries bullet 5

- **C-069** · tier `builder`
  A question asked for each pick named alone in `from:` gives one row per entry, with one field per pick, in a table, list or cards, as the reference renderer does; SPEC 889 says it should give one row per pick and value.
  - Why: SPEC 889 says the reference renderer "does not do this yet" and gives one row per entry; the plugin does as the renderer does.
  - Where: `src/core/query.ts:309`
  - Source: Not ruled on: README "Choices made where the format is silent", Records Queries bullet 5.
  - Suggestion: change (to SPEC 889's one row per pick and value) or propose to SPEC: let the one-row-per-entry form stand
  - From: README "Choices made where the format is silent", Records Queries bullet 5; SPEC 889

- **C-070** · tier `ben-words`
  A plain query over nine or more rows draws a closed "Sort and filter" button that opens a search, a "Sort by" menu with a direction button, a count line and "Original order"; the search reads the fields the view shows (a role's field, the other fields it draws, the date of a kept entry), any case, as "contains"; a match in a nested list is kept with its parents, which stand open while the search is on.
  - Why: SPEC 914: sorting and filtering are the reader's; the reference renderer's `CONTROLS_MIN` is 9.
  - Where: `src/core/query.ts:74`; `src/query-controls.ts:3`
  - Source: Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-dashboards/work/plugin-090-build.node.md (run log)`: “S1. Option A is fine” (S1 in `design/obsidian-dashboards/review.md`: a plain query over nine or more rows now draws a Sort and filter button)
  - Suggestion: keep (already Ben's)
  - From: README "Choices made where the format is silent", Records Dashboards bullet 6; `design/obsidian-dashboards/review.md` S1

- **C-071** · tier `builder`
  A data block that cannot be read is listed among the note's problems and not linked, so a query that names it is listed too and not drawn; which of an activity, a question or a data block a query reads is unchanged (activity, then question, then first block); a block in the shared data section is read by every module and an activity or question of the same id wins only in its own module.
  - Why: SPEC 7 does not allow a data block whose id is also an activity's, a question's or another block's; which wins when it happens is the plugin's.
  - Where: `src/core/data.ts:32`
  - Source: Not ruled on: README "Choices made where the format is silent", Records Dashboards bullet 3.
  - Suggestion: keep as the plugin's own
  - From: README "Choices made where the format is silent", Records Dashboards bullet 3

- **C-072** · tier `plan`
  A line's series colours are Obsidian's named colours (blue, orange, purple, cyan, pink, green), each with its own dash and marker, a bar is the accent colour, none is the booklet's own colour; a theme that redefines a named colour recolours the chart.
  - Why: A chart in a theme's own palette.
  - Where: `src/charts.ts:16`
  - Source: `design/obsidian-dashboards/proposal.md` (series colours), approved: Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-dashboards/work/plugin-090-build.node.md`: “Great. approve the calls. go on 0.9.0” Leave appearance to Obsidian: Ben, 2026-10-26, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md`: “(a) leave as much as possible up to obsidian. The user will have their own obsidian settings and we don't want to override them except for legibility.”
  - Suggestion: keep as the plugin's own
  - From: README "Choices made where the format is silent", Records Dashboards bullet 5

- **C-073** · tier `builder`
  A summary drawn as a table has a column for each statistic any of its rows has, then the note; the `value` field repeats one of the statistics, so it is no column of its own; drawn as a list, tiles or cards, a summary row shows its label, value and note (and badge, tone, link or icon) and its other statistics only in a table.
  - Why: SPEC 925-995 defines the roles and defaults; how extra statistics are drawn is the plugin's.
  - Where: `src/core/query.ts:613`
  - Source: Not ruled on: README "Choices made where the format is silent", Records Queries bullets 2.
  - Suggestion: keep as the plugin's own
  - From: README "Choices made where the format is silent", Records Queries bullet 2

- **C-074** · tier `builder`
  The reader's own options in a note and in a distribution come after the listed ones, in the order first seen going over the entries newest first; an own option whose words equal a listed option's (case and white space at either end aside) counts as that option; a grid's own words are counted by their words whichever cell they were typed in. For a question asked for each pick, its fields and summary rows are in the source's list order and then the reader's own picks as first seen; a pick with no place given has a count of 0 and no value or note.
  - Why: SPEC 8 counts and orders by the source's list; own words and ties are the plugin's.
  - Where: `src/core/query.ts:392`; `src/core/query.ts:502`
  - Source: Not ruled on: README "Choices made where the format is silent", Records Queries bullets 3 and 4.
  - Suggestion: keep as the plugin's own
  - From: README "Choices made where the format is silent", Records Queries bullets 3 and 4

- **C-075** · tier `ben-words`
  Numbers are drawn in English (the view's locale): other statistics are shown as they are, to at most six decimals; the average rule is the format's.
  - Why: SPEC 986 defines the average (one decimal, half away from zero, whole numbers with none) and says numbers are drawn in the renderer's locale; what is left to the plugin is the language (English) and the six-decimal cap on other statistics.
  - Where: `src/core/query.ts:173`; `src/core/query.ts:180`
  - Source: Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/_node.md`: “Skip fr/es. en only for v1.0.” The decimal figures are the builder's.
  - Suggestion: keep (already Ben's for the language only); propose the decimal rule to SPEC
  - From: README "Choices made where the format is silent", Records Queries bullet 6

- **C-076** · tier `builder`
  A `link` that is a heading (`#Heading`) in a query row is plain text: the view has no headings to go to.
  - Why: The view draws screens, not headings.
  - Where: `src/core/query.ts:857`
  - Source: Not ruled on: README "Choices made where the format is silent", Records Queries bullet 7.
  - Suggestion: keep as the plugin's own
  - From: README "Choices made where the format is silent", Records Queries bullet 7

- **C-077** · tier `builder`
  A nested list in a query cell is drawn to a depth of 200 levels; deeper children are drawn in the same list as their parent; a table cell of 32 characters or fewer counts as short and keeps one line.
  - Why: A browser lays out a very deep tree badly; short cells keep a table narrow.
  - Where: `src/query-view.ts:20`; `src/query-view.ts:102`
  - Source: Found by the sweep of `src/`; neither the README nor `docs/choices-0120.md` names it.
  - Suggestion: keep as the plugin's own
  - From: sweep: `src/query-view.ts`

- **C-078** · tier `builder`
  A press that ends with no click (a touch screen) settles 300 ms later; the button under a press is kept until its click so that the press lands when a field is left by pressing another button.
  - Why: A touch screen leaves the field and clicks only after the pointer is lifted (code comment).
  - Where: `src/view.ts:136`
  - Source: Found by the sweep of `src/`; the "button kept until its click" half is in the README (Records bullet 8), the 300 ms is not.
  - Suggestion: keep as the plugin's own
  - From: sweep: `src/view.ts`; README Records bullet 8

### B. Media and listen (33)

- **C-079** · tier `ben-words` (merges 2 source lines)
  Local means a file in the vault. A local audio or video file keeps Obsidian's own player and is never gated or asked about; `http://localhost` and other addresses on the reader's machine are treated as remote.
  - Why: The 0.12.0 table's reason: no asking about the reader's own device (§1). Tension: his first-round words say the local host "is assumed fine"; his second-round 2.1 narrows "local" to vault files.
  - Where: `src/core/media.ts:11`; `src/core/media.ts:32`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, second round 2.1`: “files in the vault only as far as the plugin is concerned.” And Ben, 2026-11-02, `design/plugin-0120/calls.md, first round 1`: “Keep the native player. And keep any locally media referenced. If the booklet references something on the local host or local machine, it is assumed fine. We don't want to ask people to load images on their literal home computer.” The `localhost` reading is the agent's (plan-v2 item 8) and is listed in section D.
  - Suggestion: keep (already Ben's); Ben to confirm the `localhost` reading (section D)
  - From: `docs/choices-0120.md` §1 rows 1 and 2

- **C-080** · tier `builder`
  The extension of an address or path decides what it is (audio, video, picture), read before any `?` or `#`.
  - Why: The format does not say how a query string is read (0.12.0 table §1).
  - Where: `src/core/media.ts:11`
  - Source: Not ruled on: `docs/choices-0120.md` §1.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §1 row 4

- **C-081** · tier `builder`
  `preload="none"` is set on Obsidian's own local audio and video as soon as the element exists, best effort.
  - Why: Honours "nothing before a press" as far as Obsidian lets it (spike S1: the element and its request come at render).
  - Where: `src/media-view.ts:350`
  - Source: Not ruled on: `docs/choices-0120.md` §1 row 3.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §1 row 3

- **C-082** · tier `ben-words`
  A remote embed with no known extension is drawn as a link, not a player.
  - Why: SPEC 0.18 makes an extensionless remote embed a linter error; the plugin draws it as a link.
  - Where: `src/core/gate.ts:922`
  - Source: Ben, 2026-11-01, `design/v018/calls.md, first calls M2`: “Minor M2 -> adopt all three (media-from accepts a YAML list; an extensionless remote embed is a linter error drawn as a link; the write cadence and the Allow prompt wording move to renderer notes)” (SPEC wording since 0.18.)
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §1 row 5

- **C-083** · tier `ben-words`
  Remote pictures are left to Obsidian and are not gated (including pictures from other hosts the booklet does not declare).
  - Why: The 0.12.0 table's reason: image drawing is left alone.
  - Where: `src/core/gate.ts:745`
  - Source: Ben, 2026-11-01, `design/v018/calls.md, first calls 3c`: “Call 3, part c: block remote images from hosts the booklet does not declare -> keep Obsidian's behaviour for images” Tension: SPEC 12 says a renderer requests no remote image from an origin not allowed; see section D.
  - Suggestion: keep (already Ben's); the SPEC wording is the open item (section D)
  - From: `docs/choices-0120.md` §1 row 6

- **C-084** · tier `ben-words`
  Link schemes are not filtered (`obsidian://`, `file:`, custom handlers draw as Obsidian draws them); the plugin does not police what Obsidian itself would draw.
  - Why: The 0.12.0 table's reason: Obsidian is not policed.
  - Where: `src/core/gate.ts:922`
  - Source: Ben, 2026-11-01, `design/v018/calls.md, first calls 3d`: “Call 3, part d: filter link schemes (obsidian://, file:, custom handlers) in booklet prose -> no: leave links to Obsidian” And Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/_node.md`: “I don't think we need to police obsidian with our format. If obsidian can do a callout with a link, do we want to BLOCK that? I think not?”
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §1 row 7

- **C-085** · tier `ben-words` (merges 2 source lines)
  Embedded notes (`![[Other note]]`) and a link's hover preview are drawn by Obsidian's own renderer, remote media inside them included; the gate does not look inside.
  - Why: A documented limit.
  - Where: `README.md:211`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, first round 2`: “yes, that's fine.” (to design.md section 5 call 2: accept embedded notes as Obsidian's and document it)
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §1 row 8 and §8 (B2)

- **C-086** · tier `ben-words` (merges 3 source lines)
  Remote audio or video has no media element in the page until a real press (`isTrusted`) of Play; the address used is `new URL(address).href`, never the file's raw text.
  - Why: A browser fetches when `src` is set; a script must not press for the reader.
  - Where: `src/media-view.ts:31`; `src/media-view.ts:124`
  - Source: Ben, 2026-11-01, `design/v018/calls.md, first calls 3a`: “Call 3, part a: gate remote media until the reader presses play -> yes” The `isTrusted` and `href` details are the builder's (`docs/choices-0120.md` §3 rows 1 to 3).
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §3 rows 1 to 3

- **C-087** · tier `builder` (merges 2 source lines)
  `play()` is called inside the press handler and video is `playsinline`; focus goes to the new player and a polite line says Loading, then the kind of media and the host.
  - Why: iOS needs the gesture and fullscreens otherwise; a keyboard or screen-reader reader must find the player.
  - Where: `src/media-view.ts:58`; `src/media-view.ts:151`
  - Source: Not ruled on: `docs/choices-0120.md` §3 rows 4 and 5.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §3 rows 4 and 5

- **C-088** · tier `builder`
  One error message covers every failure of a remote player ("This could not be played. The file may be missing…") with an Open-in-browser link.
  - Why: A 404 and an unsupported codec look the same to the element.
  - Where: `src/media-view.ts:34`
  - Source: Not ruled on: `docs/choices-0120.md` §3 row 6.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §3 row 6

- **C-089** · tier `builder`
  Leaving the page (a redraw, another page) removes a remote player; the stream stops.
  - Why: A removed element stops the stream.
  - Where: `src/media-view.ts:163`
  - Source: Not ruled on: `docs/choices-0120.md` §3 row 7. Listen audio is the exception: it moves to the Now playing bar (the Now playing bar row).
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §3 row 7

- **C-090** · tier `ben-words` (merges 2 source lines)
  Press-to-load works for known audio and video services (YouTube, Vimeo, Spotify, SoundCloud), once allowed; an unknown service stays a link that names its host.
  - Why: The 0.12.0 table's reason: the third-round call for video and audio services. Unknown services: the plan.
  - Where: `src/core/services.ts:87`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, third round 3C`: “I thikn if we can press to load for allowed video AND AUDIO servies, that would be nice. As we go, we may allow/disallow in code services that we can't in good conscious allow people to approve. But we won't do that yet.” The "unknown service stays a link" half is in `design/plugin-0120/plan-v2.md`.
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §3 rows 9 and 10

- **C-091** · tier `builder` (merges 4 source lines)
  On the press of an allowed YouTube slot the plugin asks Obsidian to render `![](https://www.youtube.com/watch?v=ID)` into the slot (the address built from the id) and makes no frame of its own; the frame is Obsidian's, not told to autoplay, so Play may need a second press inside it. Vimeo, Spotify and SoundCloud keep the plugin's own sandboxed frames.
  - Why: Spike S13: a raw `/embed/` frame may say "unavailable" in the app window where Obsidian's own plays.
  - Where: `src/core/services.ts:45`; `src/media-view.ts:66`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (B2) rows on YouTube and Vimeo/Spotify/SoundCloud; (F) row on `allowfullscreen`.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (B2) rows 6, 7 and 9; (F) row on `allowfullscreen`

- **C-092** · tier `ben-words` (merges 2 source lines)
  Frames (`<iframe>`) are drawn as a link that names the host, followed by "from host:port", and never load; the link's words are the frame's `title`, else the host.
  - Why: “draw it as a link … we won't block it in reader view only in booklet view, because we don't police Obsidian.”
  - Where: `src/media-view.ts:251`
  - Source: Ben, 2026-11-01, `design/v018/calls.md, answered afterwards in chat`: “draw it as a link. We don’t wanna auto load links as described elsewhere, though we won’t block it in reader view only in booklet view, because we don’t police obsidian” The words and the port are the builder's (`docs/choices-0120.md` §8 (E)).
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §3 row 13; §8 (E)

- **C-093** · tier `design` (merges 4 source lines)
  A raw `<audio>` or `<video>` tag with a remote `src`, `source`, `track` or `poster` is treated like a frame: a link, never loaded; a media tag with no address of its own uses its first remote `source` or `track`. A remote `srcset` is gated only when it names audio, video or Obsidian's frame.
  - Why: The design's reading of Ben's frame call; flagged "confirm with Ben" in the 0.12.0 table.
  - Where: `src/core/gate.ts:854`
  - Source: Not ruled on: `docs/choices-0120.md` §3 row 14 ("confirm with Ben") and §8 (B2), (G). The rule they stretch is Ben, 2026-11-01, `design/v018/calls.md, answered afterwards in chat`: “draw it as a link. We don’t wanna auto load links as described elsewhere, though we won’t block it in reader view only in booklet view, because we don’t police obsidian”
  - Suggestion: keep as the plugin's own, once Ben has confirmed
  - From: `docs/choices-0120.md` §3 row 14; §8 (B2) row on media tag with no address; (G) row on poster and srcset

- **C-094** · tier `builder`
  Media in a title, option or label is never drawn; its alt text shows instead.
  - Why: “The issue's item 1” (0.12.0 table §3).
  - Where: `src/view.ts:759`
  - Source: Not ruled on: `docs/choices-0120.md` §3 row 15.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §3 row 15

- **C-095** · tier `ben-words` (merges 4 source lines)
  A link whose words are not its address shows its host in brackets after it ("words (host.org)"); the host is the browser's hostname plus a non-default port; "is the address" means equal after dropping the scheme, `www.` and a trailing slash; only links in prose get it, never a link in a title, option or anchor.
  - Why: The 0.12.0 table's reason: call 3e.
  - Where: `src/media-view.ts:308`; `src/media-view.ts:298`
  - Source: Ben, 2026-11-01, `design/v018/calls.md, first calls 3e`: “Call 3, part e: show the host after an external link whose words are not the address -> yes, in prose” The three refinements are the builder's.
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §3 rows 17 to 19; §8 (E) row on "(host)"

- **C-096** · tier `builder` (merges 3 source lines)
  A `listen`'s tick is a button with `aria-pressed`, 44 px high, with a polite live line ("Marked done" / "Marked not done", not shown) and a check mark in front of the word when pressed, the pressed tick bold.
  - Why: The pattern of the other presses; colour alone is not enough.
  - Where: `src/listen-view.ts:280`; `src/listen-view.ts:268`
  - Source: Not ruled on: `docs/choices-0120.md` §4 row 13, §8 (C) row on the polite line, §8 (U) row on the check mark.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §4 row 13; §8 (C); §8 (U)

- **C-097** · tier `builder` (merges 2 source lines)
  Unknown keys in a `listen` answer are kept, and their key order; a new answer is written `{ "pos": n, "done": b }`, `pos` first.
  - Why: SPEC says write back as read; a stable order for a new answer.
  - Where: `src/core/listen.ts:155`
  - Source: Not ruled on: `docs/choices-0120.md` §4 rows 4 and 6.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §4 rows 4 and 6

- **C-098** · tier `builder`
  A status line for listens only reads "N of M done"; a mix of listens and other questions reads "N of M answered".
  - Why: The format gives the first; the second is the agent's.
  - Where: `src/core/nav.ts:967`
  - Source: Not ruled on: `docs/choices-0120.md` §4 row 9.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §4 row 9

- **C-099** · tier `builder` (merges 3 source lines)
  A `listen` in a `repeat` activity is drawn without a tick and listed in the opening notice; a second embed under a `listen` is listed, only the first is followed; a `left:` that is not whole seconds is ignored and listed.
  - Why: The format says "a plain question" for a `listen` in a `repeat` and makes more than one embed an error, but does not say what to draw.
  - Where: `src/listen-view.ts:280`; `src/core/reader.ts:432`
  - Source: Not ruled on: `docs/choices-0120.md` §4 rows 10 to 12.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §4 rows 10 to 12

- **C-100** · tier `ben-words` (merges 3 source lines)
  A `listen` redraw from Sync is held back while a listen plays, and a drawing that would replace a playing element waits for it to stop; an incoming `pos` never moves playback, and a paused, clean listen may seek.
  - Why: The player is never destroyed under her; never discard her work.
  - Where: `src/view.ts:363`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, second round 2.3`: “yes add a spike, one way or another we need to keep the media playing on move or close and keep the position too when she stops” And Ben, 2026-11-01, `design/v018/calls.md, plugin and renderer decisions`: “Serious S6 (listen write cadence) -> keep pos in the plugin's device-local store while playing; write to the file only on pause, end, leaving and quit; whole seconds; never seek on an incoming change while playing; the cadence moves out of the format into a renderer note” The exact waiting rule is the builder's (`docs/choices-0120.md` §4 rows 14 and 15, §8 (C) first row).
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §4 rows 14 and 15; §8 (C) row 1; README Records bullet

- **C-101** · tier `builder` (merges 3 source lines)
  A device entry that survives a hard kill is used if the file's `pos` still equals the entry's base; otherwise the file wins. The device keeps each second but loses what Chromium had not yet committed (up to a few seconds on a first launch).
  - Why: Another device wrote since otherwise; measured in the real app (check 51).
  - Where: `src/listen-view.ts:249`
  - Source: Not ruled on: `docs/choices-0120.md` §4 row 16 and §8 (E) row on a hard kill.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §4 row 16; §8 (E); (F) header row

- **C-102** · tier `builder`
  A position is shown as `12:34`, or `1:02:03` from an hour on; one that is no number reads `0:00`.
  - Why: Whole seconds are kept; the clock is how a person says a place.
  - Where: `src/core/listen.ts:105`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (A).
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (A) row 5

- **C-103** · tier `builder` (merges 3 source lines)
  A `listen`'s media is the first audio or video in its media part (the `>` embed or link), not the first anywhere in its box; with no embed, the first link is its media; embeds and links in code are help as written; an embed in the help is lifted into the bar like any media and writes nothing.
  - Why: A second embed in the help text was tracked as the listen's media and wrote into its answer.
  - Where: `src/playing.ts:30`; `src/core/listen.ts:46`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (A) row 3 and (L) rows 1 and 9.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (A) row 3; (L) rows 1 and 9

- **C-104** · tier `builder`
  Obsidian's own `audio` and `video` get an `aria-label` (the prompt in plain words in a `listen`, else the embed's alt, else the file name); the plugin's own players and any element that already has a name are left alone.
  - Why: The native controls had no accessible name (check 54).
  - Where: `src/media-view.ts:331`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (F).
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (F) row on `aria-label`

- **C-105** · tier `ben-words` (merges 4 source lines)
  Obsidian's media of a page, local and framed, is lifted into a "Now playing" bar at the window's foot (one per window, one row per element) when its page goes, so it keeps playing on a note switch and on close; a paused element stays in the bar until closed or returned; framed service players are not lifted and stop with their page.
  - Why: Ben asked that media keep playing on a move or close and that the place is kept.
  - Where: `src/now-playing.ts:134`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, second round 2.3`: “yes add a spike, one way or another we need to keep the media playing on move or close and keep the position too when she stops” The bar's detailed behaviour is `docs/choices-0120.md` §8 (P).
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §8 (P) rows 1 to 12

- **C-106** · tier `builder` (merges 11 source lines)
  The bar's rules in detail: a placeholder ("Its player is in the bar at the bottom of the window.") stays where the player was lifted from; a playing element is never put back into a page; a paused one is put back when a drawing makes a slot for the same media (the same media = same note path and source address, less the hash and a `?<digits>` query); Close and the end return a paused element to a showing page and drop it otherwise; "Back to the page" scrolls to a showing placeholder, else opens the note as a booklet at the place of the press; a media error removes the row; the label is the prompt, else the embed's words, else the player's name, else the file name.
  - Why: The plan says only "it stays until she closes it or returns".
  - Where: `src/now-playing.ts:119`; `src/now-playing.ts:299`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (P) rows 1 to 9, (F) rows on a tab behind and an emptied `src`, (L) rows 2, 3, 4, 6.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (P), (F), (L)

- **C-107** · tier `builder`
  The bar's words are announced by one live region per window ("Playing {label}", "Closed {label}", "{label} finished"; Back says nothing), emptied and filled 100 ms later; when a row goes, focus moves to the element if back, else the next or previous row, else the control Play was pressed from, else the note's most recent leaf.
  - Why: Closing left focus on nothing.
  - Where: `src/now-playing.ts:91`; `src/now-playing.ts:145`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (L) rows 8 and 9.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (L)

- **C-108** · tier `builder` (merges 4 source lines)
  A renamed note keeps its bar entry and its device keys; a note deleted stops what plays from it, writes nothing and drops the device's entries; a write that cannot be made resolves false and the quit flush gives each place 3 seconds; after a failed write the place stays noted and the element is not put back at the older place.
  - Why: Playing media kept writing to the old path; the flush waited for ever.
  - Where: `src/now-playing.ts:94`; `src/listen-writer.ts:28`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (L) rows 3, 4, 5 and the §7 rename bullet (media half).
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (L); §7 bullets

- **C-109** · tier `builder`
  The listen writer puts the change into the Markdown editor when the note is also open as Markdown, else uses `vault.process`; a failure says so in a notice.
  - Why: As the view's own write does, so unsaved words in the editor are not lost.
  - Where: `src/listen-writer.ts:81`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (P) row 14. Shares the CRLF and BOM defect of the Markdown-editor write path (C-002, section D).
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (P)

- **C-110** · tier `builder` (merges 6 source lines)
  The Now playing bar sits above Obsidian's own bottom bar on a phone, takes at most 45vh and scrolls inside itself, adds a safe-area inset by Obsidian's variable, and leaves `10em` plus 16 px at the foot of the page while it shows; its two buttons take the page's background.
  - Why: At the foot it covered Obsidian's five buttons; measured at 12 text sizes (check 55).
  - Where: `styles.css:2590`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (M) rows 1 to 5 (and the superseded 8em row).
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (M); (P) 8em row

- **C-111** · tier `builder` (merges 2 source lines)
  On a phone an audio of the plugin's (in a `listen` or in the bar) is 54 px high, not Obsidian's 42 px, and "Open in browser" is a 44 px-high line.
  - Why: At 42 px the browser's controls are squeezed under 44 px; the link was 20.8 px high.
  - Where: `styles.css:2629`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (M) rows 6 and 7. Phones are the 0.13.0 Android/Mac pass: Ben, 2026-11-02, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-android-mac-pass.node.md`: “For the mobile test. Option 3 as part of 0.12 and option 1 after as described”
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (M)

### B. Allow list and safety (29)

- **C-112** · tier `ben-words`
  A site is allowed if it is on the vault list or on the note's list; a booklet need not declare it first ("allowed", not "declared and allowed"). SPEC 12 says the file declares and the reader allows, and the plugin lets a vault-list site load in any booklet.
  - Why: The 0.12.0 table's reason: the third-round call, allow without a declaration.
  - Where: `src/core/allow.ts:72`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, third round 3B`: “You're allowed to put something in your vault's allow list and not have to get asked anymore. allow once, allow for booklet, allow for vault (goes in the plugin settings).” Tension with SPEC 12's "declared and allowed" is listed in section D.
  - Suggestion: keep (already Ben's); propose to SPEC: say a reader's list needs no declaration (SPEC 100 already says so for lists)
  - From: `docs/choices-0120.md` §2 row 1

- **C-113** · tier `ben-words`
  Three scopes: Allow once, Allow for this note, Allow for this vault.
  - Why: The 0.12.0 table's reason: the third-round call.
  - Where: `src/core/allow.ts:27`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, third round 3A`: “This would mean allow this piece of media but DON'T add it to the list. So really we want three: allow once, allow for this note, and allow for this vault. Allow for vault is a plugin setting I believe.”
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §2 row 2

- **C-114** · tier `builder` (merges 3 source lines)
  "Allow once" is kept nowhere and lasts for the piece as drawn: a redraw of the page puts a once-allowed slot back to asking, and it carries nothing over a redraw; it plays the piece inside the card's own press.
  - Why: The plan says "kept nowhere"; how long a drawing lasts is the builder's. The same behaviour is listed three times in the 0.12.0 table.
  - Where: `src/media-view.ts:5`
  - Source: Ben's words: Ben, 2026-11-02, `design/plugin-0120/calls.md, third round 3A`: “This would mean allow this piece of media but DON'T add it to the list. So really we want three: allow once, allow for this note, and allow for this vault. Allow for vault is a plugin setting I believe.” Duration of "once" is not ruled on (`docs/choices-0120.md` §2 row 3, §8 (B2) row 4, §8 (E) row 2).
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §2 row 3; §8 (B2) row 4; §8 (E) row 2

- **C-115** · tier `ben-words` (merges 2 source lines)
  This note's and this vault's allows live in the plugin's `data.json` (`noteAllows` by the note's path, `allowedMediaHosts` for the vault), never in the note.
  - Why: The format forbids a permission in the file; a note's key is its path.
  - Where: `src/settings.ts:24`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, third round 3B`: “You're allowed to put something in your vault's allow list and not have to get asked anymore. allow once, allow for booklet, allow for vault (goes in the plugin settings).” The note-path key is the builder's (`docs/choices-0120.md` §2 row 6).
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §2 rows 5 and 6

- **C-116** · tier `ben-words` (merges 3 source lines)
  An allow-list entry `youtube.com` means `https://*.youtube.com/*`: the host and its subdomains over https; entries are hosts as typed, lower-case, https assumed and said on the card; no path prefix is offered in the write-in.
  - Why: Ben's words are in Source below: the entry is the domain and tld, and it picks up the subdomains by default.
  - Where: `src/core/allow.ts:62`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, second round 3`: “They just need to ad the domain and tld (e.g., youtube.com) and it picks up (https://*.youtube.com/*) by default.” And Ben, 2026-11-02, `design/plugin-0120/calls.md, second round 3`: “https is assumed and that is made clear on the card.”
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §2 rows 7 to 9

- **C-117** · tier `builder` (merges 3 source lines)
  An allow-list entry keeps a non-default port (`media.example.org:8443`) and covers only that port; a numeric (IP) entry covers that one machine and no subdomains; a trailing dot on a site is the same site.
  - Why: `media.example.org` and `media.example.org:8443` are different servers; `1.2.3.4` has no `*.1.2.3.4`.
  - Where: `src/core/allow.ts:27`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (B) rows 1, 2 and (G) last row.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (B) rows 1 and 2; (G) last row

- **C-118** · tier `plan` (merges 3 source lines)
  Allowing a service covers its player's other hosts, and a service counts as allowed only when every site its player loads from is covered: allowing `youtube.com` also covers `youtu.be`, `youtube-nocookie.com` and Obsidian's `releases.obsidian.md`, but `releases.obsidian.md` alone allows no YouTube and `www.vimeo.com` does not allow `player.vimeo.com`. The slot and card name a service with its hosts ("YouTube (youtube.com, releases.obsidian.md)").
  - Why: The player's host is not the link's; the allow was wider than the card said.
  - Where: `src/core/services.ts:102`; `src/core/services.ts:115`
  - Source: `design/plugin-0120/plan-v2.md` (the player's host is not the link's); the exact coverage rules are the builder's (`docs/choices-0120.md` §8 (B2) row 7 and (G) row 8).
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §2 row 10; §8 (B2) row 7; (G) row 8

- **C-119** · tier `ben-words` (merges 3 source lines)
  The card opens on its own when a booklet declares (`media-from`) hosts that are not on the vault list, and on a press of media from a host not allowed; after "Not now" it does not ask again for that note until the app is started again, though the Allow list button still opens it.
  - Why: Ben asked for both openings; not asking again at every redraw (until the app restarts) is the builder's, seen in the real app (check 50).
  - Where: `src/view.ts:893`; `src/view.ts:142`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, second round 3`: “it pops up with suggestions/requests when (1) the booklet asks for it, which it can” And Ben, 2026-11-02, `design/plugin-0120/calls.md, second round 3`: “(2) when you click on a piece of media (allow once, allow for all media from <domain>)” The not-again-until-restart half is the builder's (`docs/choices-0120.md` §8 (E) row 1).
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §2 rows 11 and 12; §8 (E) row 1

- **C-120** · tier `plan` (merges 2 source lines)
  The card's default focus is Not now, each choice states its cost, and focus is put back to Not now if it is lost to nothing in the card's first second (timers at 0, 30, 120, 300 and 700 ms, and on each blur; a press or key of hers ends it).
  - Why: Plan: a safe default; Obsidian blurs a card opened as the note opens about 2 ms later.
  - Where: `src/allow-card.ts:39`; `src/allow-card.ts:275`
  - Source: Default focus: `design/plugin-0120/plan-v2.md`. The five-timer focus recovery is the builder's (`docs/choices-0120.md` §8 (F) row 1).
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §2 row 13; §8 (F) row 1

- **C-121** · tier `ben-words`
  An "Allow list" button at the top of the view opens the card; the card has checkboxes to unallow, which take effect at once, and a write-in blank to add a site.
  - Why: “the allow list is available as a button at the top of the renderer (allow-list) … just has checkboxes to unallow something and a write-in blank to add things manually.”
  - Where: `src/view.ts:881`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, second round 3`: “the allow list is available as a button at the top of the renderer (allow-list), so it's easy to click just has checkboxes to unallow something and a write-in blank to add things manually”
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §2 rows 14 and 17

- **C-122** · tier `ben-words`
  The allow card is built by hand (not with Obsidian's `Modal`); two small defects stay for 1.0.0: Escape does nothing when focus is outside the card, and over Settings on 1.8.10 it loses focus.
  - Why: Measured in 0.13.0 (`docs/modal-0130.md`): `Modal` loses Tab trapping on 1.14.5, exposes no dialog role or name, and needs the same focus timers.
  - Where: `src/allow-card.ts:39`
  - Source: Ben, 2026-11-02, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-modal-measure.node.md`: “keep the handbuilt card for 0.12.0 and measure the modal for the next round”; and, 2026-11-03, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/_node.md`: “Keep the allow card hand-built”
  - Suggestion: keep (already Ben's); the two defects are the 1.0.0 fix list's
  - From: `docs/choices-0120.md` §8 (U) row 1

- **C-123** · tier `builder` (merges 2 source lines)
  On the card of the sites a booklet names, pressing a row's button moves focus to the next row's first button, else to Not now, and says the change in a polite line; when the last site is dealt with the card closes and focus returns to the button that opened it. The write-in says "Added {site} for this note" or "{site} is already on the list for this note".
  - Why: The row, and the button that had focus, is removed; focus fell to the page.
  - Where: `src/allow-card.ts:197`; `src/allow-card.ts:137`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (U) rows 2 and 3.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (U) rows 2 and 3

- **C-124** · tier `builder` (merges 2 source lines)
  Card buttons say their own words and then the site as their accessible name ("Allow for this note: a.example.org"); the names are one set ("Allow once", "Allow for this note", "Allow for this vault", "Add for this note", "Add for this vault", "Allowed for this note", "Allowed for this vault", the "Allow list"), and the README says "site", not "host".
  - Why: The same thing was called three ways; an accessible name must contain the words shown.
  - Where: `src/allow-card.ts:6`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (U) rows 5 and 6.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (U) rows 5 and 6

- **C-125** · tier `ben-words`
  The hint under the write-in is plain ("Add a site by its name, for example youtube.com. https is assumed…"), and for a service the title reads "Allow media from YouTube?" with "Plays from youtube.com and releases.obsidian.md." below it.
  - Why: `https://*.youtube.com/*` and an unexplained `releases.obsidian.md` meant nothing to a reader.
  - Where: `src/allow-card.ts:195`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, second round 3`: “https is assumed and that is made clear on the card.” And Ben, 2026-11-01, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-0110-hardening.node.md (run log)`: “Agreed w both” (call 5: plain option words and reduced motion stay, as the run log labels them) The service-title wording is the builder's (`docs/choices-0120.md` §8 (U) row 6).
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §8 (U) row 6

- **C-126** · tier `ben-words` (merges 4 source lines)
  The card does not draw its motion when the reader asks for less; a card title wraps instead of ending in "..."; a site's name breaks anywhere when it has to; the card's choice buttons wrap and grow; the settings container carries the class `booklet-settings` so these rules reach only this page.
  - Why: At 200% text on a 320 px phone these ran 24 to 64 px past the window.
  - Where: `styles.css:2291`
  - Source: Ben, 2026-11-01, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-0110-hardening.node.md (run log)`: “Agreed w both” (call 5: plain option words and reduced motion stay, as the run log labels them) The wrapping rules are the builder's (`docs/choices-0120.md` §8 (M) rows 8 to 11).
  - Suggestion: keep (already Ben's for reduced motion)
  - From: `docs/choices-0120.md` §8 (B) row 4; (M) rows 8 to 11

- **C-127** · tier `ben-words` (merges 2 source lines)
  The vault list starts empty; nothing is pre-allowed. A settings button "Add suggested services" puts YouTube, Vimeo, Spotify and SoundCloud on the vault list.
  - Why: “I might prepopulate a few safe hosts … I'd put them in the plugin settings as an option.” The 0.12.0 table said Ben strikes the audio ones; the code still holds `spotify.com` and `soundcloud.com`.
  - Where: `src/core/services.ts:43`; `src/settings.ts:249`
  - Source: Ben, 2026-11-02, `design/plugin-0120/calls.md, second round 3b`: “I might prepopulate a few safe hosts: youtube.com, vimeo.com, we can add a few others. known safe sites to load from. I'd put them in the plugin settings as an option.” Which hosts are on the list is open for Ben (section D).
  - Suggestion: keep (already Ben's); Ben to strike or keep the audio services (section D)
  - From: `docs/choices-0120.md` §2 rows 15 and 16

- **C-128** · tier `builder` (merges 2 source lines)
  The settings page redraws only the list after a change, adds keep focus in the (cleared) box, removing puts focus on the next Remove button, else the one before, else the box; it says "Added {site}", "Removed {site}", "{site} is already on the list"; the field's accessible name is "Add a site".
  - Why: The whole-page redraw lost focus and left a new empty field after Enter.
  - Where: `src/settings.ts:160`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (U) rows 3, 4 and 5.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (U) rows 3 to 5

- **C-129** · tier `builder`
  A list that cannot be saved is still in force for the session and the failure is not shown; the next change saves again.
  - Why: A reader who allowed a site should not be told off for a full disk.
  - Where: `src/settings.ts:24`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (B) row 5.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (B) row 5

- **C-130** · tier `builder` (merges 2 source lines)
  A `data.json` that cannot be read lets the plugin load with empty lists and a notice "Booklet could not read its saved settings and started with none."; the bad file is not written over until she changes a list; `data.json` keys the plugin does not know are kept in a store with no prototype.
  - Why: The plugin did not load at all, and booklets opened as plain Markdown with no word why.
  - Where: `src/main.ts:28`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (U) rows 9 and 11.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (U) rows 9 and 11

- **C-131** · tier `builder` (merges 2 source lines)
  A rename of a note moves its entry in `noteAllows` and its device keys with it; a note deleted in Obsidian has its entry removed (a folder deleted removes every entry under it); a note moved outside Obsidian is a note with no list and asks again.
  - Why: A list should not outlive its note, nor start a new note at that path with it.
  - Where: `src/settings.ts:122`; `src/settings.ts:132`
  - Source: Not ruled on: `docs/choices-0120.md` §7 bullet 1 and §8 (U) row 10 (the same behaviour, listed twice).
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §7 bullet 1; §8 (U) row 10

- **C-132** · tier `builder`
  A press re-reads the live allow list before it starts a player, so a site just taken off the list is not played from even before the note redraws.
  - Why: A site she has just taken off the list.
  - Where: `src/media-view.ts:4`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (G) row 10.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (G) row 10

- **C-133** · tier `builder` (merges 3 source lines)
  An address is read the way a browser reads it: character references undone once, tabs and line breaks inside it dropped, `https:/host` and `https:host` as remote as `https://host`, in Markdown targets, definitions and tag attributes. A Markdown destination ends at an ASCII space or control character, a backslash escapes only ASCII punctuation, a reference definition may carry its address on the next line or in `<…>`, and labels match with Unicode case folding.
  - Why: Each of these loaded at render in Obsidian 1.14.5 and the old gate let it through (spike B2).
  - Where: `src/core/gate.ts:575`; `src/core/gate.ts:527`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (B2) row 10, (G) rows 2, 5.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (B2) row 10; (G) rows 2 and 5

- **C-134** · tier `builder` (merges 2 source lines)
  A YouTube or Twitter/X address is never left to Obsidian, in Markdown or a raw `img`, whatever it ends in (`.png` too); it becomes the plugin's player (YouTube, once allowed) or a link naming the host. A raw `img` or `image` tag is gated only when what it loads is audio, video or one of those frames.
  - Why: Obsidian turns any `img` with such an address into a frame that loads `releases.obsidian.md` or `platform.twitter.com` at render.
  - Where: `src/core/services.ts:130`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (B2) rows 11 and 12. It stretches Ben's "pictures are not gated" (Ben, 2026-11-01, `design/v018/calls.md, first calls 3c`: “Call 3, part c: block remote images from hosts the booklet does not declare -> keep Obsidian's behaviour for images”); listed in section D.
  - Suggestion: keep as the plugin's own, once Ben has seen the tension
  - From: `docs/choices-0120.md` §8 (B2) rows 11 and 12

- **C-135** · tier `ben-words` (merges 3 source lines)
  Left alone on purpose: every remote picture (`<img>`, `srcset`, `poster`, an SVG `image`, CSS `url()`, `<input type=image>`, `![](x.png)`), and what Obsidian loads nothing for (`![[https://...]]`, a plain link or autolink, `<iframe srcdoc>`, `<embed>`, `<object>`, `<link>`); not covered: an embedded note and a link's hover preview.
  - Why: Each loads at render or loads nothing in 1.14.5 (spike B2).
  - Where: `src/core/gate.ts:922`
  - Source: Ben, 2026-11-01, `design/v018/calls.md, first calls 3c`: “Call 3, part c: block remote images from hosts the booklet does not declare -> keep Obsidian's behaviour for images” The nothing-loads half is the builder's observation (`docs/choices-0120.md` §8 (B2) rows 13 to 15).
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §8 (B2) rows 13 to 15

- **C-136** · tier `builder` (merges 3 source lines)
  A `$$` block that never closes hides nothing from the gate; an inline `<!--` or `%%` ends at a blank line, an escaped delimiter opens nothing, a fence indented four columns or more is not a fence, a `$..$`, `%%` or comment span is set aside only when its brackets balance, an indented fence counts as code only if it closes, and a fence written inside a quote is not recognised. When it is unclear whether a span is inert, the embed is gated.
  - Why: A false slot costs one press; a missed one is a request before a press. "Not checked in Obsidian": whether it reads links before maths or `%%`.
  - Where: `src/core/gate.ts:922`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (B) row 3, (G) rows 3, 4 and 5.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (B) row 3; (G) rows 3 and 4

- **C-137** · tier `builder`
  Raw media tags are read the way an HTML parser reads them (`/` or no space between attributes, quoted and bare values, character references); a `srcdoc` is read again as markup to depth 8 and gates the whole tag if it holds a remote address; a tag cut short is read to the end and gated.
  - Why: A pattern over the tag text found an attribute inside another attribute's value.
  - Where: `src/core/gate.ts:666`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (G) row 1.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (G) row 1

- **C-138** · tier `builder`
  A `file:` address with a host, or `file:////host/…` (a Windows share), counts as remote: audio and video become a refused slot, a raw audio or video tag a link slot, never a clickable link; a `file:` picture is left to Obsidian.
  - Why: Pictures are Obsidian's own.
  - Where: `src/media-view.ts:83`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (G) row 7. Stretches the SCHEMES call (Ben, 2026-11-01, `design/v018/calls.md, first calls 3d`: “Call 3, part d: filter link schemes (obsidian://, file:, custom handlers) in booklet prose -> no: leave links to Obsidian”).
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (G) row 7

- **C-139** · tier `builder`
  The gate is linear: brackets are paired in one pass, failed searches are remembered, and an address longer than 4096 characters is cut there for evaluating and still gated; a local media path over 256 characters in a title is left to Obsidian.
  - Why: A pasted or downloaded note must not freeze the app; the slowest of 31 hostile texts of about 120 KB took 37 ms (the old gate: 17 to 43 s).
  - Where: `src/core/gate.ts:84`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (G) row 9.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (G) row 9

- **C-140** · tier `builder`
  The rewrite works on the note's text before Obsidian renders it, not on the rendered DOM.
  - Why: A DOM sweep for `iframe` could break an Obsidian embed; the request comes before the render promise resolves.
  - Where: `src/core/gate.ts:922`
  - Source: Not ruled on: `docs/choices-0120.md` §3 row 16; spikes S1 and S2.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §3 row 16

### B. Notices and wording (11)

- **C-141** · tier `ben-words`
  The opening notice names the marker, the plugin and its format, then lists each line the view does not read ("Line N: text (why)") and says the rest of the note works as usual and stays in the file exactly as written; it says "A newer version of the plugin may read this" only for what a later version might read.
  - Why: SPEC 2 says a note's marker and what a host cannot read are reported; the words are the host's.
  - Where: `src/core/notice.ts:36`
  - Source: Ben, 2026-11-01, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-0110-hardening.node.md (run log)`: “Agree w yes” (call 1: report what the format says to report: `start:`, `icon:`, `status:`, `tab:`) And Ben, 2026-11-01, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-0110-hardening.node.md (run log)`: “Not seeing a call to make here. Seems fine. Just make sure we update as the format progresses” (call 4: the notice's words)
  - Suggestion: keep (already Ben's)
  - From: README "What it does not draw yet"; `src/core/notice.ts`

- **C-142** · tier `ben-words`
  The notice appears whenever the note's marker is any earlier or later 0.x than the format the plugin reads (0.18), and says "some of it may not draw" whether or not anything fails.
  - Why: This is what the code does today; Ben's 2026-11-03 words ask for a notice only when something cannot be rendered. That change is plugin 1.0.0 lane D's (plan-100 point 9) and may already be in a later commit; this row records the code in this worktree.
  - Where: `src/core/notice.ts:1`
  - Source: Ben, 2026-11-03, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-100-release.node.md (point 9)`: “It only warns if there's something it actually can't render, not every time.” Earlier: Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/_node.md`: “call 1. (a)” (a note newer than the plugin: draw what it can, still take answers, with a notice)
  - Suggestion: change (already ruled): warn only for something the plugin cannot render
  - From: README "Every 0.x marker reads page lines"; plan-100 point 9

- **C-143** · tier `ben-words`
  A note newer than the plugin is drawn as far as it can be and still takes answers, with a notice.
  - Why: “call 1. (a).”
  - Where: `src/core/reader.ts:464`
  - Source: Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/_node.md`: “call 1. (a)” (a note newer than the plugin: draw what it can, still take answers, with a notice)
  - Suggestion: keep (already Ben's)
  - From: plan-100 point 9; 0.11.0 hardening call 1

- **C-144** · tier `ben-words` (merges 2 source lines)
  `FORMAT_VERSION` is "0.18"; no older-format shim is kept, a "0.17" note gets the earlier-marker notice, and the plugin's own test notes are re-marked rather than read as 0.17.
  - Why: Pre-1.0: no compatibility shim.
  - Where: `src/core/reader.ts:53`
  - Source: Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-dashboards/work/plugin-090-build.node.md (run log)`: “do not preserve backward compatibility as we are pre-stable release until v1.0”
  - Suggestion: keep (already Ben's)
  - From: `docs/choices-0120.md` §6 rows 1 and 2

- **C-145** · tier `builder`
  Raw frame and media tags are listed among the note's problems with the words "drawn as a link in this view; nothing loads", not as unread.
  - Why: A later plugin would not read them either.
  - Where: `src/core/reader.ts:1340`
  - Source: Not ruled on: `docs/choices-0120.md` §6 row 3.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §6 row 3

- **C-146** · tier `ben-words` (merges 3 source lines)
  A malformed `media-from` value is listed and ignored and the rest of a list still counts; a value is one origin, a comma list or a YAML list, an empty value declares nothing and is not bad, a trailing slash is taken off, and the origin kept is the browser's spelling (lower case, punycode); a host with a path is malformed because the vault list takes a host only.
  - Why: SPEC 12 says "an origin" and accepts a YAML list (M2); the spelling and the path rule are the plugin's.
  - Where: `src/core/reader.ts:432`
  - Source: Ben, 2026-11-01, `design/v018/calls.md, first calls M2`: “Minor M2 -> adopt all three (media-from accepts a YAML list; an extensionless remote embed is a linter error drawn as a link; the write cadence and the Allow prompt wording move to renderer notes)” The spelling and trailing-slash rules are the builder's (`docs/choices-0120.md` §8 (A) row 1, §7 bullet 2).
  - Suggestion: keep (already Ben's for the list form)
  - From: `docs/choices-0120.md` §6 row 4; §7 bullet 2; §8 (A) row 1

- **C-147** · tier `ben-words`
  A setting a page line does not take (`> [!page|x hidden]`) is listed in the notice like any other, without the line about updating, since it is the page line's to fix; an activity line's `parent:` is listed as ignored.
  - Why: A mistyped setting is for the note's author to fix (code comment, `looksLikeMistake`).
  - Where: `src/core/unread.ts:46`
  - Source: Ben, 2026-11-01, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-0110-hardening.node.md (run log)`: “Agree w yes” (call 1: report what the format says to report: `start:`, `icon:`, `status:`, `tab:`) And Ben, 2026-11-01, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-0110-hardening.node.md (run log)`: “Not seeing a call to make here. Seems fine. Just make sure we update as the format progresses” (call 4: the notice's words)
  - Suggestion: keep (already Ben's)
  - From: README Pages "Where the spec decides" and "Every 0.x marker"

- **C-148** · tier `builder`
  Reader-facing notices that come as Obsidian pop-ups: "Booklet could not read its saved settings and started with none.", "Booklet: N things in this note could not be read…" (when a note is first opened), "Booklet: that entry is no longer where it was in the note, so nothing was deleted.", "Booklet: today's entry is replaced." / "Booklet: entry kept.", "Booklet: the answer was not saved. The note holds an answer to "…" that is not in the shape this question keeps…", and a write failure that names its reason.
  - Why: The plugin tells her what it did with her words; each notice starts "Booklet:" so a pop-up says whose it is.
  - Where: `src/view.ts:1947`; `src/view.ts:1759`; `src/view.ts:1907`
  - Source: Found by the sweep of `src/`; the wording is not in the README or `docs/choices-0120.md`.
  - Suggestion: keep as the plugin's own
  - From: sweep: `src/view.ts`, `src/main.ts`, `src/listen-writer.ts`

- **C-149** · tier `ben-words`
  A chart's wording ("Cannot draw as bars: Mood is not a number.", "One reading so far.", "Every value is 0, so no bar is drawn."), the sort and filter's ("Sort and filter", "Filter rows", "Sort by", "Original order", "12 rows", "3 of 12 shown", "Nothing matches."), and a query that could not be worked out ("This query could not be drawn: <the reason>") are the plugin's own, in English; the rest of the screen draws.
  - Why: SPEC 6 leaves a renderer's own words to it.
  - Where: `src/core/query.ts:46`; `src/core/query.ts:57`
  - Source: Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/_node.md`: “Skip fr/es. en only for v1.0.” (English only for v1.0) And Ben, 2026-11-02, `design/plugin-0130/design.md`: “Spanish is not important. Just leave it out. The content will be spanish, but we don't need spanish system words. It's fine in english” The wording itself is the builder's.
  - Suggestion: keep (already Ben's for the language)
  - From: README Dashboards bullet 5; `src/core/query.ts`

- **C-150** · tier `ben-words`
  The plugin's own interface words are English only; no French or Spanish words, and the content of a booklet may be in any language.
  - Why: “Skip fr/es. en only for v1.0.”
  - Where: `src/core/query.ts:46`
  - Source: Ben, 2026-10-30, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/_node.md`: “Skip fr/es. en only for v1.0.” And Ben, 2026-11-02, `design/plugin-0130/design.md`: “Spanish is not important. Just leave it out. The content will be spanish, but we don't need spanish system words. It's fine in english”
  - Suggestion: keep (already Ben's)
  - From: plan-100 "Done when"; `design/plugin-0130/design.md`

- **C-151** · tier `plan`
  Counter and status words ("2 of 3", "Page 2 of 3", "1 of 2 answered", "Not started", "N of M started", "Done", "N kept", "N reads") are the plugin's own English.
  - Why: SPEC 3 names "2 of 3" and "Page 2 of 3" as the plugin's; the status words follow the reference renderer.
  - Where: `src/screens.ts:181`
  - Source: Navigation proposal Decision 8 call D, approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: keep as the plugin's own
  - From: hardening list rows 14 and 32

### B. Appearance and mobile (11)

- **C-152** · tier `ben-words`
  The view takes its colours, fonts and tints from Obsidian's own CSS variables only (no colour, shadow or font of its own), so it follows the theme, light and dark, and any community theme; the plugin only lays the view out and keeps it legible.
  - Why: “leave as much as possible up to obsidian … except for legibility.”
  - Where: `styles.css:6`
  - Source: Ben, 2026-10-26, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md`: “(a) leave as much as possible up to obsidian. The user will have their own obsidian settings and we don't want to override them except for legibility.” And Ben, 2026-10-26 (`programmes/booklet/projects/booklet-for-obsidian/booklet-for-obsidian-roadmap.md`, item 8): “we don't want to override them except for legibility”
  - Suggestion: keep (already Ben's)
  - From: `styles.css` header; navigation proposal 4.7

- **C-153** · tier `ben-words`
  A card's look is the "sheets" look (option C): a card with a stronger sense of blocks, plus a brighter border along its left edge; the look is made of five variables with Obsidian's own values (`--booklet-card-bg`, `--booklet-card-border`, `--booklet-card-radius`, `--booklet-card-pad`, `--booklet-block-edge`), which a snippet or a theme can set on `.booklet-view`.
  - Why: “I don't want to override their base styling, but I want a stronger sense of cards and blocks.”
  - Where: `styles.css:13`
  - Source: Ben, 2026-11-02, `design/plugin-0130/design.md`: “I don't want to override their base styling, but I want a stronger sense of cards and blocks than I get currently.” And Ben, 2026-11-03, `design/plugin-0130/design.md`: “Go with C, but I like the brighter border on the left ALSO not instead of the sheets look. But C just with that highlighting on the left.”
  - Suggestion: keep (already Ben's)
  - From: `design/plugin-0130/design.md`; `styles.css` lines 11 to 20

- **C-154** · tier `ben-words`
  Two CSS custom properties are named stable: `--booklet-ch-bar` (the chart bar colour) and `--booklet-mx-text` (the matrix text column's width); a snippet may set them. Plugin names for the command (`toggle-view`) and view type (`booklet`) are frozen too.
  - Why: “yes to freezing plugin names. command ids and view type. Yes definitely.”
  - Where: `styles.css:1222`; `styles.css:823`
  - Source: Ben, 2026-11-01, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-0110-hardening.node.md (run log)`: “Agree” (call 3: list two CSS names as stable) And Ben, 2026-11-01, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-0110-hardening.node.md`: “yes to freezing plugin names. command ids and view type. Yes definitely”
  - Suggestion: keep (already Ben's)
  - From: 0.11.0 hardening calls 3; README "Names"

- **C-155** · tier `plan`
  Tints are mixed from a theme colour with `color-mix`, and a plain fill or border is declared first with the mix inside `@supports`, so an Obsidian that cannot mix draws the plain one; none of the 20 or so deprecated `-rgb` variables are used any longer.
  - Why: The deprecated `-rgb` variables may go in a later Obsidian; 1.0 should not depend on them.
  - Where: `styles.css:124`
  - Source: `design/plugin-0130/design.md` item 5 ("One tint helper"), approved with the 0.13.0 plan; Ben's "Go with C" is on the look, not on this mechanism. Ben, 2026-11-03, `design/plugin-0130/design.md`: “Go with C, but I like the brighter border on the left ALSO not instead of the sheets look. But C just with that highlighting on the left.”
  - Suggestion: keep as the plugin's own
  - From: `design/plugin-0130/design.md` item 5; `styles.css` header

- **C-156** · tier `builder`
  The law kind (a callout) is drawn in the theme's own text colour on a soft ground, and the two other kinds use the theme's cyan and pink; their own edge is the dashed, double or dotted line, and only the picture takes the kind's colour.
  - Why: Obsidian has no slate; the reference renderer's colours are petrol, slate and rose.
  - Where: `styles.css:2014`
  - Source: Not ruled on: README Records bullet 17 (the "law kind" bullet).
  - Suggestion: keep as the plugin's own
  - From: README Records bullet 17

- **C-157** · tier `ben-words`
  A pressed button with a plain option word, a reduced-motion rule and visible focus are kept as the plugin's accessibility defaults: nothing animates when the reader asks for less, and the focus ring shows after a key but not after a mouse press.
  - Why: “Agreed w both.” (reduced motion and plain option words)
  - Where: `styles.css:2291`
  - Source: Ben, 2026-11-01, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-0110-hardening.node.md (run log)`: “Agreed w both” (call 5: plain option words and reduced motion stay, as the run log labels them)
  - Suggestion: keep (already Ben's)
  - From: 0.11.0 hardening call 5

- **C-158** · tier `builder` (merges 3 source lines)
  Touch targets on a phone are at least 44 px high: the Done tick, "Open in browser", the Now playing bar's buttons and the card's choice buttons are sized for a finger; native audio on a phone is 54 px high.
  - Why: At 42 px the browser's controls are squeezed under 44 px.
  - Where: `styles.css:2629`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (M) rows 6 and 7 and (U) row on the tick. Phones are tested in the 0.13.0 Android/Mac pass: Ben, 2026-11-02, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-android-mac-pass.node.md`: “For the mobile test. Option 3 as part of 0.12 and option 1 after as described”
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (M), (U)

- **C-159** · tier `plan` (merges 2 source lines)
  The page's width is capped at Obsidian's line width and its title is drawn at the inline title's size with "Show inline title" off.
  - Why: Legibility, which "leave it to Obsidian" allows.
  - Where: `styles.css:26`
  - Source: Navigation proposal small call h, approved: Ben, 2026-10-29, `programmes/booklet/projects/booklet-for-obsidian/deliverables/../work/plugin-navigation-design.node.md (run log)`: “All as recommended on the reading page.”
  - Suggestion: keep as the plugin's own
  - From: hardening list row 16

- **C-160** · tier `builder` (merges 2 source lines)
  At 200% text on a 320 px phone two things were wrong, and lane E2 (2026-11-03, measured in Obsidian 1.14.5 by `e2e-tests/phone-200-100.js`) fixed both. (1) The Allow card's scrolling part was 275 px of a 568 px window and its last line in view was cut at the scroll area's edge by the Close footer (the footer is in flow under the scroll area, so nothing lay under it); the card now takes the window less a margin on a phone, its headings are the dialog's size, and a rule marks where the scrolling part ends: 327 px. (2) Obsidian's own folded callout (a "Transcript") had its fold arrow 11 px past the window; the callout title's row may now wrap, which it does only when the row is wider than its box.
  - Why: Older than 0.12.0. The callout is Obsidian's own, so the wrap is a rule on `.booklet-view .callout-title` and applies to every callout inside the plugin's view (see C-168).
  - Where: `styles.css:2088` (the callout title); `styles.css:2487` to `2499` (the card on a phone, its headings, the rule over the footer)
  - Source: Ben's ruling of 2026-11-03 is in section E (*"fix, allow the card for the two layout faults"*). Earlier: not ruled on, `docs/choices-0120.md` §8 (M) last two rows ("Not changed"). Built in `0629614`.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (M)

- **C-167** · tier `builder`
  The focus ring of the plugin's own controls is the text colour. The plugin's rules for links, disclosures, `role=button`, cards, charts, sort heads, the kept-entries fold, steps and the Continue prompt draw the ring in `var(--text-normal)`, and one rule gives the buttons, fields and media players inside the view and the Allow card an outline in `var(--text-normal)`, 2 px wide and 3 px off the control. That rule overrides Obsidian's own ring on those controls (Obsidian's pale ring stays inside it, so the control has a double ring). Obsidian's ring on its own controls elsewhere (its settings page, its menus) is not touched. The Now playing bar's accent ring is unchanged.
  - Why: Obsidian's ring is the theme's pale focus border, 1.74 to 1.88 to 1 on the page and cards in the light theme, 1.98 to 2.29 in the dark and 1.47 on a tinted card; a keyboard reader needs 3 to 1 (WCAG 1.4.11). The text colour is Obsidian's own variable, so a theme that changes its colours changes the ring with them.
  - Where: `styles.css:2381` (the one rule for buttons, fields and players); the other rules each carry `var(--text-normal)` in their `:focus-visible` block
  - Source: Not ruled on. Related: Ben, 2026-11-03, hub item `plugin-100-release`, Rulings: *"A is fine, sticking with obsidian's theme colors for now"* (contrast that follows the theme); the same section adds that "the focus ring gets the second look the review page recommended" (the hub item's words, not his). Built in `14889fc`, measured by `e2e-tests/focus-ring-100.js`.
  - Suggestion: keep, Ben to say if he reads Obsidian's own controls more narrowly
  - From: `docs/accessibility-100.md` finding 10; lane E2

- **C-168** · tier `builder`
  The callout-title wrap of C-160 applies to every callout inside the plugin's view, not only a folded "Transcript": `.booklet-view .callout-title { flex-wrap: wrap }`. Obsidian's own rule is a single row of picture, title and fold arrow that does not wrap; with the plugin's rule the row wraps only when the title is wider than its box. A callout outside the plugin's view is not touched.
  - Why: The row is Obsidian's own markup; one rule on the view is the small contained change C-160's ruling allowed. A rule for one callout kind would be a list of one-off views.
  - Where: `styles.css:2088`
  - Source: Not ruled on. Related: Ben, 2026-11-03, hub item `plugin-100-release`, Rulings, item 9 (C-160): *"fix, allow the card for the two layout faults"*, read there (the hub item's reading, not his words) as "the callout is Obsidian's own and is fixed only if a small contained CSS change does it". Built in `0629614`.
  - Suggestion: keep, Ben to say if he reads Obsidian's own controls more narrowly
  - From: lane E2

### B. Settings (1)

- **C-161** · tier `plan`
  The plugin's one settings page is the allow list for media: the vault's list, with a field to add a site, a Remove button for each, and the "Add suggested services" button; it holds no other setting, and nothing about how a booklet looks or reads.
  - Why: Plan-100 point 10 says "no settings tab" among the things 1.0.0 does not add; the page that exists is the allow list's.
  - Where: `src/settings.ts:160`
  - Source: Plan-100, point 10 (`programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-100-release.node.md`), started on Ben's go (2026-11-03 commit `fe299e7`); the wording "no settings tab" sits oddly beside the existing allow-list page (section D).
  - Suggestion: keep as the plugin's own; Ben to confirm what point 10 means by "no settings tab"
  - From: plan-100 point 10; `src/settings.ts`

### B. Other (5)

- **C-162** · tier `builder`
  A Markdown note whose front matter, as Obsidian's metadata cache read it, has a `booklet` key with a non-empty string or a number value opens in the Booklet view; the view checks the version. A toggle switches one pane back to Markdown for that note (the toggle command is `toggle-view`).
  - Why: Obsidian has no API for "open a .md note whose front matter has a key in my view"; the plugin wraps `setViewState` as the Kanban and Excalidraw plugins do.
  - Where: `src/switch.ts:25`; `src/main.ts:53`
  - Source: Not ruled on as a choice (how a booklet note is recognised). Only the names are Ben's: Ben, 2026-11-01, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-0110-hardening.node.md`: “yes to freezing plugin names. command ids and view type. Yes definitely”
  - Suggestion: keep as the plugin's own
  - From: `src/switch.ts` header; sweep

- **C-163** · tier `plan` (merges 2 source lines)
  The furthest page reached is kept on the device beside held words, under `booklet-place:<path>`, and not in the note; a rename made in Obsidian moves it as it moves held words; Continue starts after her place.
  - Why: A place is the device's: two devices read the same note at different pages.
  - Where: `src/listen-store.ts:78`; `src/main.ts:105`
  - Source: Plan item 7 (`design/plugin-0120/plan-v2.md`) approved with the 0.12.0 plan: Ben, 2026-11-02, `programmes/booklet/projects/booklet-for-obsidian/deliverables/obsidian-v1-release/work/plugin-0120-media-listen.node.md (run log)`: “Great, let's run the 0.12.0 plan.” Continue itself is Ben's: Ben, 2026-11-02, `design/plugin-0120/calls.md, second round 2.4`: “no, if it will clearly get trapped there, it  needs to be fixed. that will be very annoying”
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §4 row 17; §8 (C) row 2

- **C-164** · tier `builder` (merges 4 source lines)
  The e2e media checks and the spikes were run on Obsidian 1.14.5 only when 0.12.0 was built (no older Obsidian and no codec tools on the box): a hand-built silent `.mp3` and WAV tones stand in for media, no `.ogg` could be made, and the harness stops only the Obsidian it started. `docs/floor-0130.md` later measured 1.8.10, and the minimum became 1.11.7.
  - Why: A broad `pkill` was refused; other lanes' sessions share the box.
  - Where: `e2e-tests/README.md:1`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (S) rows 1 and 2, (E) row 8; `docs/floor-0130.md` for the floor.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (S), (E); `docs/floor-0130.md`

- **C-165** · tier `builder`
  `ViewHost.nowPlaying` is optional, so that existing view tests that do not exercise the bar run unchanged; the plugin always supplies it.
  - Why: A test convenience in the type.
  - Where: `src/view.ts:126`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (P) last row.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (P)

- **C-166** · tier `builder`
  The `listen-store.ts` header says what a hard kill loses: measured on a first launch of a profile nothing back at 3 to 29 s, on a second a value about 3 s old (Chromium commits `localStorage` late) rather than "no more than a second".
  - Why: Honest wording of a measured limit; a comment, not a behaviour.
  - Where: `src/listen-store.ts:1`
  - Source: Not ruled on: `docs/choices-0120.md` §8 (F) last row; comment only.
  - Suggestion: keep as the plugin's own
  - From: `docs/choices-0120.md` §8 (F)

---

## C. Already yours, not to be asked again (43)

These rows rest on Ben's own recorded words, quoted in each row's Source with the file and date. They are listed here so they are not put to him again. Where SPEC 0.18 now says the same, the row says so.

- **C-012** · Words typed in an Add-your-own or a widget field and not yet added are added when the field is left, when another note opens in the pane, when the...
- **C-017** · While media plays the position is kept on the device each whole second; it is written into the note only on pause, end, leaving the page and quit,...
- **C-032** · The saved place has one shape, version 2; a place of any other version (or garbage) opens the start screen. The older version-1 shape is not read.
- **C-051** · The list of kept entries is a fold ("Kept entries (4)", "Kept days" for a daily activity) that starts open, opens and shuts by press, Enter or...
- **C-058** · A pick's own words stay: write-ins in an `each:` question stay in the answer and the pair stays hidden when its pick is taken back.
- **C-059** · The earlier-answers rules: the Add-your-own field offers the reader's own earlier words as buttons only, newest first, listed options and words...
- **C-060** · Quadrant colours: a quadrant widget's four regions are red, green, blue and purple (agitating, invigorating, draining, soothing), drawn from...
- **C-070** · A plain query over nine or more rows draws a closed "Sort and filter" button that opens a search, a "Sort by" menu with a direction button, a...
- **C-075** · Numbers are drawn in English (the view's locale): other statistics are shown as they are, to at most six decimals; the average rule is the format's.
- **C-079** · Local means a file in the vault. A local audio or video file keeps Obsidian's own player and is never gated or asked about; `http://localhost` and...
- **C-082** · A remote embed with no known extension is drawn as a link, not a player.
- **C-083** · Remote pictures are left to Obsidian and are not gated (including pictures from other hosts the booklet does not declare).
- **C-084** · Link schemes are not filtered (`obsidian://`, `file:`, custom handlers draw as Obsidian draws them); the plugin does not police what Obsidian...
- **C-085** · Embedded notes (`![[Other note]]`) and a link's hover preview are drawn by Obsidian's own renderer, remote media inside them included; the gate...
- **C-086** · Remote audio or video has no media element in the page until a real press (`isTrusted`) of Play; the address used is `new URL(address).href`,...
- **C-090** · Press-to-load works for known audio and video services (YouTube, Vimeo, Spotify, SoundCloud), once allowed; an unknown service stays a link that...
- **C-092** · Frames (`<iframe>`) are drawn as a link that names the host, followed by "from host:port", and never load; the link's words are the frame's...
- **C-095** · A link whose words are not its address shows its host in brackets after it ("words (host.org)"); the host is the browser's hostname plus a...
- **C-100** · A `listen` redraw from Sync is held back while a listen plays, and a drawing that would replace a playing element waits for it to stop; an...
- **C-105** · Obsidian's media of a page, local and framed, is lifted into a "Now playing" bar at the window's foot (one per window, one row per element) when...
- **C-112** · A site is allowed if it is on the vault list or on the note's list; a booklet need not declare it first ("allowed", not "declared and allowed")....
- **C-113** · Three scopes: Allow once, Allow for this note, Allow for this vault.
- **C-115** · This note's and this vault's allows live in the plugin's `data.json` (`noteAllows` by the note's path, `allowedMediaHosts` for the vault), never...
- **C-116** · An allow-list entry `youtube.com` means `https://*.youtube.com/*`: the host and its subdomains over https; entries are hosts as typed, lower-case,...
- **C-119** · The card opens on its own when a booklet declares (`media-from`) hosts that are not on the vault list, and on a press of media from a host not...
- **C-121** · An "Allow list" button at the top of the view opens the card; the card has checkboxes to unallow, which take effect at once, and a write-in blank...
- **C-122** · The allow card is built by hand (not with Obsidian's `Modal`); two small defects stay for 1.0.0: Escape does nothing when focus is outside the...
- **C-125** · The hint under the write-in is plain ("Add a site by its name, for example youtube.com. https is assumed…"), and for a service the title reads...
- **C-126** · The card does not draw its motion when the reader asks for less; a card title wraps instead of ending in "..."; a site's name breaks anywhere when...
- **C-127** · The vault list starts empty; nothing is pre-allowed. A settings button "Add suggested services" puts YouTube, Vimeo, Spotify and SoundCloud on the...
- **C-135** · Left alone on purpose: every remote picture (`<img>`, `srcset`, `poster`, an SVG `image`, CSS `url()`, `<input type=image>`, `![](x.png)`), and...
- **C-141** · The opening notice names the marker, the plugin and its format, then lists each line the view does not read ("Line N: text (why)") and says the...
- **C-142** · The notice appears whenever the note's marker is any earlier or later 0.x than the format the plugin reads (0.18), and says "some of it may not...
- **C-143** · A note newer than the plugin is drawn as far as it can be and still takes answers, with a notice.
- **C-144** · `FORMAT_VERSION` is "0.18"; no older-format shim is kept, a "0.17" note gets the earlier-marker notice, and the plugin's own test notes are...
- **C-146** · A malformed `media-from` value is listed and ignored and the rest of a list still counts; a value is one origin, a comma list or a YAML list, an...
- **C-147** · A setting a page line does not take (`> [!page|x hidden]`) is listed in the notice like any other, without the line about updating, since it is...
- **C-149** · A chart's wording ("Cannot draw as bars: Mood is not a number.", "One reading so far.", "Every value is 0, so no bar is drawn."), the sort and...
- **C-150** · The plugin's own interface words are English only; no French or Spanish words, and the content of a booklet may be in any language.
- **C-152** · The view takes its colours, fonts and tints from Obsidian's own CSS variables only (no colour, shadow or font of its own), so it follows the...
- **C-153** · A card's look is the "sheets" look (option C): a card with a stronger sense of blocks, plus a brighter border along its left edge; the look is...
- **C-154** · Two CSS custom properties are named stable: `--booklet-ch-bar` (the chart bar colour) and `--booklet-mx-text` (the matrix text column's width); a...
- **C-157** · A pressed button with a plain option word, a reduced-motion rule and visible focus are kept as the plugin's accessibility defaults: nothing...

---

## D. Contradictions, what could not be classified, and what SPEC now defines

### D1. Contradictions and tensions

- Counts. The task said 34 README choices and 185 rows in `docs/choices-0120.md`. What is true: the README's two lists headed "Choices where the format is silent" hold 10 (Pages) plus 24 (Records) top-level bullets, which is the 34; the Records section also has 14 nested bullets (7 under Dashboards, 7 under Queries and summaries), and the Pages section has 8 "spec decides" and 3 "plugin leads" bullets besides. `docs/choices-0120.md` has 183 table rows (8, 16, 17, 15, 6, 5 in sections 1 to 6; 9 spike rows in section 7; 107 builder rows in section 8) and 2 bullets under section 7, which is the 185. Of the 185, 9 are spike results and not choices, 2 are superseded (the (P) `8em` row and the (E) row on `![alt][id]`), and a few are not behaviours at all (below).
- README line 5 says "Version 0.12.0"; `manifest.json` and `versions.json` say 0.13.0. (Known: plan-100 point 6.)
- `entries:folded`: SPEC 1314 says "The Obsidian plugin does not read the mark yet". The plugin reads it (`src/view.ts` line 1598 and `src/core/reader.ts` line 314). SPEC's list of known differences is out of date, or the plugin's README is.
- Line endings and byte order mark: SPEC 1159 says a writer "keeps the file's line endings … and keeps a byte order mark". When the note is also open as Markdown the plugin writes through the Markdown editor, which saves LF and no byte order mark (C-002).
- Remote pictures: SPEC 1275 says a conforming reader must "request no remote image and no remote media from an origin the host or the reader has not allowed". The plugin leaves remote pictures to Obsidian, which loads them at render, on Ben's words (C-083, tier `ben-words`). The gap is Ben's to decide for SPEC or for the plugin.
- Each-pick in a query: SPEC 889 says a question named alone in `from:` gives one row per pick and value. The plugin's table, list and cards give one row per entry with a field per pick, as the reference renderer does (C-069). Tiles, bars and line give one row per pick.
- Suggested services: `docs/choices-0120.md` §2 row 16 says the list is YouTube, Vimeo and "a few audio services" and that Ben strikes the audio ones. `src/core/services.ts` line 43 still holds `spotify.com` and `soundcloud.com`. Open for Ben.
- `localhost`: Ben's first-round words say "If the booklet references something on the local host or local machine, it is assumed fine" (`design/plugin-0120/calls.md`, first round 1). The plugin treats `http://localhost` as remote, on the agent's reading of his 2.1 ("files in the vault only as far as the plugin is concerned"); `plan-v2.md` item 8 records the reading. Ben has not been asked this one directly.
- YouTube and Twitter/X addresses are gated even when they end in `.png` (C-134), against Ben's "keep Obsidian's behaviour for images" (v018 calls 3c). The reason given is that Obsidian turns such an `img` into a frame that loads a remote host at render.
- The opening notice: `src/core/notice.ts` still warns on any earlier or later 0.x marker. Ben's 2026-11-03 words ("It only warns if there's something it actually can't render, not every time.") change that; lane D of this release is working on it. The README paragraph "Every 0.x marker …" will change with it.
- Plan-100 point 10 lists "no settings tab" among what 1.0.0 does not add; the plugin already has a settings page for the allow list (C-161). Probably means no new tab, but the words do not say so.
- Plan-100 point 8 (the Pages button) replaces the closed "Pages in this tab" disclosure, so the README's "Pages … leads the spec" bullet 1 and C-025 change when it lands.
- Own options keep the key `<key>#own:<pick>` "as 0.5.0 and 0.6.0 stored it, so words held by an older version are found" (README Records bullet 19), against Ben's "do not preserve backward compatibility as we are pre-stable release until v1.0" (C-066).
- Version floor: `docs/choices-0120.md` and `docs/modal-0130.md` speak of a "1.8.10 floor" or "minimum"; `manifest.json` has `minAppVersion` 1.11.7 since 0.13.0 (`docs/floor-0130.md`).

### D2. Could not be classified, or not checked

- Attribution not found: the 0.12.0 table (§8 (B2) row 1) says "Ben: no second Play press" for the redraw that starts a slot by itself after "This note" or "This vault". A search of the hub for those words found no verbatim record, so the row is tiered `builder`, not `ben-words`.
- Raw `<audio>`/`<video>` with a remote `src` treated like frames is flagged "confirm with Ben" in the 0.12.0 table and in `design.md`; it has not been confirmed (C-093).
- Spike rows with no result: S12 (card and settings on a desktop app and a phone) and S8 (a merged `pos` line from Sync) are marked open in the 0.12.0 table. Nothing to rule on.
- Not behaviours, so given no row: "a transcript is an ordinary callout" (no code; SPEC gives it no kind); the header comment of `listen-store.ts` (lane F: what was measured about a hard kill); `ViewHost.nowPlaying` being optional (a type convenience for tests); the nine spike rows; the two superseded rows named above. The README's "Not done" bullet (a link that opens a booklet at a page; printing) is a limit, not a choice.
- How far the sweep went. The three sources were walked in full. The sweep of `src/` and `styles.css` for behaviours neither source names looked at constants, notice strings, settings, the frozen names, the CSS variables and the chart and query-view constants; it did not read every function of the 43 source files. The hardening list's 91 rows (`design/obsidian-hardening/choices.md`) were used as a pointer, not walked row by row: 52 are in the README already and 39 are hidden; the ones cited in the rows were read, the rest were not.

### D3. Now defined by SPEC 0.18, so not rows

Each of these was a plugin choice once (or a README bullet that says so). SPEC 0.18 now says it, and Ben's words are not on it, so it is listed here and not put to him. SPEC line numbers are for `/workspace/booklet/SPEC.md` as read on 2026-11-03.

- A page line takes `icon:` and `parent:` only; a written page id that is not letters, digits and dashes is said and the id is made from the title (accents dropped, lowercase, each run of other characters one dash, at most 60 characters; `page-N` when nothing is left). (SPEC 310; was: README "Choices made where the format is silent", Pages, "spec decides" bullets 1 and 2)
- A fold marker after a page line's bracket is ignored and said; a page line in an activity's opening, outside every activity, in a group, inside an open row, inside another callout's body or in a data section is not a page. (SPEC 313 and 316 to 322; was: README "Choices made where the format is silent", Pages, "spec decides" bullet 3)
- The words before a tab's first page line are its first page (named by the tab, or by the activity when there is no tab line); a tab with no page line is one page; pages with no `parent:` stand side by side in file order; the cards of a tab's first page made of those words are none. (SPEC 326, 327 and 354; was: README "Choices made where the format is silent", Pages, "spec decides" bullet 4)
- Reading order is depth first, with no depth limit; of two pages with one id the first keeps it and every other page, in file order, takes the next free number (`g`, `g`, `g-2` become `g`, `g-3`, `g-2`), which also settles the README's separate bullet about a repeated `g-2`. (SPEC 329 and 330; was: README "Choices made where the format is silent", Pages, "spec decides" bullet 5 and "silent" bullet 5 (merged here))
- Back goes to the section before, then up to the parent ("Up: …"), then to the top page before it, then out of the activity; Back never goes to another tab and tabs are not Back steps; the counter shows where the reader is between Back and Next and a one-section page shows none; the words ("2 of 3", "Page 2 of 3") are the plugin's. (SPEC 350 to 352; was: README "Choices made where the format is silent", Pages, "spec decides" bullet 8)
- Cards under a page, the blurb rules and a page's title as a place a link by words opens. (SPEC 354 and the Pages section (270 to 364); was: README "Choices made where the format is silent", Pages, "spec decides" bullets 6 and 7)
- A new entry's `ts` is never one another entry of its activity already has: a writer moves a clash on to the next free second. (SPEC 1160; was: README "Choices made where the format is silent", Records bullet 1 (second half))
- Where a change goes: a new entry after the last entry of the activity's last `entries` block; the first `entries` block takes the draft's place; a new `draft` goes after the activity's last `entries` block; a new `answers` block at the end of its group. (SPEC 1161; was: README "Choices made where the format is silent", Records bullet 5)
- `repeat daily` keeps one entry a day: finishing again replaces that day's first entry where it stands, and every copy of the old entry goes with it. (SPEC 1165; was: README "Choices made where the format is silent", Records bullet 6 (the replacing half; the refusal half is C-023 in section A))
- A number outside its question's `min` and `max` is stored as typed. (SPEC 1166; was: README table ("number"); hardening list row 41 (the stored-as-typed half))
- The wrong-shape guard: an answer whose shape is not its kind's is kept as written and its question drawn read-only with a notice; an answer that holds nothing (no answer, `null`, `""`, `[]`, `{}`) is no answer; other keys in a pair, a region's row or a `listen` answer are kept. (SPEC 1130 and 1146; was: README "Choices made where the format is silent", Records bullet 9 (with its table))
- `listen`: `pos` is in whole seconds; `{ "done": true }` alone is valid; `{}` holds nothing; `done` is never cleared by a renderer; a pause counts for `done` only past half of the media's length; a `left:` that is not whole seconds is ignored and reported; `pos` is kept on the device while playing and written on pause, end, leaving and quit; an incoming `pos` never moves playback under way; a `listen` is counted answered by `done` only. (SPEC 571 to 576 and 583; was: `docs/choices-0120.md` §4 rows 2, 5, 8, 14 and §8 (A) row 2, (C) row 4 (merged here))
- A malformed `media-from` value (a path, a query, a wildcard, any scheme but `https:`) is reported in the opening notice among the problems and ignored; the other origins of a list still count; an empty value declares nothing. (SPEC 98 and 101; was: `docs/choices-0120.md` §6 row 4 (the malformed half))
- A reader's own allow list may say more than the file, needs no declaration in any file, and the file declares while the reader or host allows. (SPEC 100 and 1275; was: `docs/choices-0120.md` §2 row 1 (the "no declaration" half))
- Continue offers the first `listen` not done or question not answered after her place; her place is the furthest page on the device, else the last `listen` done or question answered in booklet order; nothing before her place is offered. (SPEC 585 and 1289; was: `docs/choices-0120.md` §5 rows 1 and 2)
- Sorting and filtering are the reader's, may be offered on longer views only, are saved nowhere, and a line chart keeps its order. (SPEC 914; was: README "Choices made where the format is silent", Dashboards bullet (sort and filter))
- A summary's roles and defaults, the average rounded to one decimal half away from zero with whole numbers shown without a decimal, and numbers drawn in the renderer's locale. (SPEC 925 to 996 (average and locale at 986); was: README "Choices made where the format is silent", Queries bullets 1 and 6 (first half))
- Writing records: only what the reader changed is written; line endings and the byte order mark are kept; a draft left holding nothing is taken out; a number outside min and max is stored as typed. (SPEC 1157 to 1167; was: README "Choices made where the format is silent", Records bullet 4 (the draft half), the "changes only what the reader changed" pledge)
- A question asked for each pick (`each:`) of every kind follows SPEC; a pair whose `a` holds nothing is no answer. (SPEC 589 to 627; was: README "Choices made where the format is silent", Records bullet 12)
- Marking (a `choice` with several `[x]` takes the first; a `multi` takes all; an option of your own is never marked; a menu's option has no `[x]`): the README says the plugin does what SPEC section 5 and the reference renderer agree on. Not re-read line by line by this document. (SPEC 469 to 500 (not re-verified); was: README "Choices made where the format is silent", Records bullet 10)

---

## E. Rulings, 2026-11-03

Ben ruled on this list in chat on 2026-11-03, on the choices review page (`briefs/2026-11-03-plugin-100-release-review.md` in the booklet hub; its section numbers are the ones used here). His words below are quoted from the hub item `plugin-100-release`, section "Rulings". Text after "Read as" is the main session's reading, not his, and is marked so. An outcome is one of: **kept as the plugin's own**, **changed**, or **listed for the spec** (`docs/spec-proposals-100.md`). "Changed" says what Ben decided; each "Built" line under it (added 2026-11-03 by lane F) says what lanes E1 and E2 actually built, read from their commits and the code, with the commit.

Lane F edited the row text of C-160 only, and added rows C-167 and C-168; every other row stands as written. One thing in the rows is struck by a ruling (below): C-161's mention of "no settings tab" and plan-100 point 10. The row text of C-161 and the paragraph in D1 that ask what "no settings tab" means stay as they were written, and this section replaces them.

### The 18 for the spec list (review section 1)

Ben: *"yes to all 18 in Section 1"*.

Outcome: **kept as the plugin's own, and listed for the spec.** The 18 rows are C-004, C-005, C-007, C-009, C-010, C-019, C-031, C-037, C-043, C-044, C-045, C-056, C-061, C-062, C-068, C-002, C-033 and C-069. The last three were also ruled on separately (below). The proposed lines are in `docs/spec-proposals-100.md`, with C-033, C-069 and the renderer-follows entry in `docs/spec-proposals-e1.md`.

The 96 plain keeps (review section 2) were not named in his answer. They stand as keeps unless he objects (the hub item's own words, not his).

### The ten calls (Section 2 of Ben's answer, in his numbering)

**C-002. Writing through the Markdown editor loses CRLF and the byte-order mark.**
- Ben: *"A as recommended"*.
- Read as: leave it as it is, and list it for the spec.
- Outcome: **kept as the plugin's own, and listed for the spec.**

**C-033. A page line inside a comment, a `<pre>` block or `$$`.**
- Ben: *"B. A commented out page line should not appear"*.
- Outcome: **changed** (a page line there is not read as a page), **and listed for the spec.**
- Built (`1f32539`): a `> [!page` line that starts inside an HTML comment, a `<pre>` block or a `$$` block starts no page, so a commented-out page is not in the page menu or the trail; the line stays text and is not listed among the note's problems. **Only the page line changed.** A `> [!tab]` line in the same places is still read there, as before. This is an open point for Ben: the row's suggestion was to read a page line only where a tab line is read; the built rule is the other way round (the page line is not read, the tab line still is). The decision is whether a tab line inside a comment, a `<pre>` or a `$$` block should also stop being read. `docs/spec-proposals-e1.md` asks the spec to settle both the same way.
- Built, widened (plugin 1.0.0, branch `feat/100-h-tabs`; Ben, 2026-11-03: *"nothing commented out should appear, take care of those too"*): the open point above is settled. A Booklet line of **any** kind (tab, activity, module, question, row, notice, data, group and the rest), a footnote definition and a heading as a link target are now read only where a reader sees them, by the same scan as the page line (`visibleLines`): nothing inside a closed comment, `<pre>` block or `$$` block is read as structure, and a hidden line says nothing among the note's problems. An opener with no closer hides nothing, as before, and a closer is looked for only in the body, outside fenced code and before the records section (a closer in a saved answer or in a fenced block closes nothing; found by a cold review, fixed in the same branch). A mark that starts its line opens a block that a fence line inside it does not end; a mark further along a line sits in a paragraph, so a fence line ends the search and finds no closer. **Left as they were:** the records section, which is read from the raw file so that a closer in a saved answer cannot hide it (nothing is lost or misplaced); and a page break (`---`), the open item the spec lists. Tests: `test/hidden-structure.test.mjs`.
- Built, `%%` added (plugin 1.0.0; the owner: *"add %% comments to 1.0.0 as a comment too"*): Obsidian's own comment, `%% ... %%`, is a fourth hidden region with the same rules as the HTML comment: inline or over lines, in a callout line too; a closer is the next `%%` in the body; an opener with no closer hides nothing (so a stray `50%% off` is harmless); not an opener inside inline code or a fenced block; a run of percent signs is read in pairs (`%%%` is a `%%` and a plain `%`). The same scan decides the raw media tag check (`rawMediaTags`) and the prose helper (`COMMENT`), so a tag or words inside a `%%` comment are left out there too. Also from the owner, left as known behaviour: *"leave $$ as it is. it's an obsidian problem"* (two far-apart `$$` pair and hide what lies between, as Obsidian does; two `%%` in one paragraph do the same) and *"leave the records oddity and note as a known gap"* (a `> [!records` line inside a comment still starts the records section). Both are listed in the README. Tests: `test/hidden-structure.test.mjs`.

**C-066. The `#own:` key.**
- Ben: *"B. Clean it out and drop the promise. No back compat"*.
- Outcome: **changed**: the key is renamed and the old-version promise is dropped.
- Built (`e8cc579`): the words typed in a copy's *Add your own* field (a question asked for each pick) are held at `<key>#pick:<pick>`. The old key `<key>#own:<pick>` is no longer looked for, so words an earlier version held there are not found. The keys of a grid cell and of a body-map place (`<key>#own:<id>`) and of a plain field (`<key>#own`) are unchanged: they never shared a shape with a copy's key.

**C-069. One row per entry, not per pick.**
- Ben: *"B. Let' the plugin go ahead of the spec in this one case and note it for the next version of the spec."*
- Read as: option B on the page was to change the plugin to the spec's one row per pick; the plugin then goes ahead of the reference renderer. The main session flagged this reading to Ben to confirm.
- Outcome: **changed** (to one row per pick), **and listed for the spec.**
- Built (`6ff2eae`): a question asked for each pick and named alone in `from:` gives one row per pick in a table, a list and cards, as it already did in tiles, bars and a line: in the source's order, the label the pick's words, the value the answer from the newest entry that answered it. The reference renderer still gives one row per entry in table, list and cards, and a "does not draw it yet" line in the other three, so the plugin is ahead of it; `docs/spec-proposals-e1.md` asks the renderer to follow.

**C-093. Raw audio and video tags with a remote address.**
- Ben: *"confirm"*.
- Outcome: **kept as the plugin's own.**

**C-134. YouTube and X addresses that end in `.png`.**
- Ben: *"keep"*.
- Outcome: **kept as the plugin's own.**

**C-079. `localhost`.**
- Ben: *"localhost is local, not treated as remote"*.
- Outcome: **changed.** The row says `http://localhost` and other addresses on the reader's machine are treated as remote; that is no longer the plugin's rule.
- Built (`0a92ee3`): an `http:` or `https:` address that leads to the reader's own machine and nowhere else is local, as a vault file is, with any port: the host `localhost`, an address written as `127.a.b.c` (the whole `127.0.0.0/8` block), or `[::1]`. The host must be written in one of those forms. Forms a browser would turn into 127.0.0.1 (`http://2130706433/`, `http://127.1/`, `http://0x7f.1/`), `[::ffff:127.0.0.1]`, `localhost.` with a trailing dot, a name under `.localhost` (`media.localhost`), an address with a user name in front of the host, a LAN address (`192.168.x.x`, `10.x.x.x`), `0.0.0.0` and a name that merely holds the word (`localhost.example.org`) stay remote and are asked about. For a media embed and a media tag (`audio`, `video`, `source`, `track`, `img`) the address is left to Obsidian, not gated. A frame (`iframe`, `frame`, `object`, `embed`) or anything inside a `srcdoc` on the reader's own machine is a page, not a file to play, and is still held back.

**C-161. The suggested services.**
- Ben: *"spotify and soundcloud can stay as suggested services that's fine"*.
- Read as: all four suggested services stay.
- Outcome: **kept as the plugin's own.**

**C-160. 200% text on a 320 px phone.**
- Ben: *"fix, allow the card for the two layout faults"*.
- Read as: fix the Allow card's footer fault; the callout is Obsidian's own and is fixed only if a small contained CSS change does it, otherwise listed. The main session flagged this reading to Ben.
- Outcome: **changed** (the Allow card), the callout **changed or listed** depending on whether a small CSS change does it.
- Built (`0629614`): both. The card has more room to scroll in on a phone (275 px of 568 before, 327 px after, at 320 x 568 and 200% text) with a rule over its Close footer, and a callout title inside the plugin's view may wrap, so the fold arrow stays in the window (11 px past it before). The callout fix is one rule that applies to every callout in the view (C-168). Measured on Obsidian 1.14.5 only.

**"No settings tab" (point 10 of the block, the subject of C-161's source and of D1's paragraph on it).**
- Ben: *"strike this completely. We have settings, and if we need to add a new one here, it is not disallowed."*
- Outcome: **struck.** C-161's mention of "no settings tab", and plan-100 point 10, are struck from the plan. The plugin's allow-list settings page stays; a new setting is not disallowed.

### The audit calls

- The Allow card's second defect (focus pulled back to Obsidian's Settings, and one Escape closing both, on Obsidian 1.11.7; `docs/accessibility-100.md`, finding 13). Ben: *"option A, do the fix so it doesn't escape to close both the popup and the card. that's annoying and it might actually block the allow-list usage"*. Outcome: **changed** (to be fixed in 1.0.0). Built (`5098737`): the card puts a key scope of its own on Obsidian's key stack while it is open, so Escape goes to the topmost scope only: it closes the card when the card is on top and Settings when Settings is, and Settings no longer pulls focus back from the card. The card's own document listener keeps Tab only. `e2e-tests/allow-settings-100.js`: 9 of 16 facts passed before on 1.11.7, 21 of 21 pass after on both 1.11.7 and 1.14.5.
- Contrast that comes from Obsidian's theme colours (`docs/accessibility-100.md`, findings 7 to 10). Ben: *"A is fine, sticking with obsidian's theme colors for now"*. Outcome: **kept as the plugin's own** (it follows the user's theme) and listed in the README's Accessibility section. The hub item adds that the focus ring gets the second look the review page recommended. Built (`14889fc`): the plugin's own focus rings are the text colour (C-167), the one place the colours were changed; the accent contrasts (findings 7 to 9) still follow the theme.
- The settings page's heading. Not a ruling: lane E2 removed the "Allow list for media" heading from the settings page, which has one section only (`5098737`; no row held it).

---

## F. Adding and removing rows (format 0.20), 2026-11-08

Four choices the plugin made where the contract (`design/dashboards-as-booklets/rows-contract.md`) and SPEC 0.20 are silent, found while building the rows add/delete slice. They are listed here in the file's style; none is a ruling. They are not counted in the totals at the top of this file, which describe the list as it stood on 2026-11-03. Source for each: not ruled on.

- **C-169** · tier `builder`
  A row whose removal was kept and then refused because it had changed since the reader drew it ("You asked to remove this; it changed since.") offers Remove again. Pressing it keeps a new `$delete` entry whose `was` is the row as it stands now, and the newest act on a row wins. A row whose removal is merely waiting ("removing, waiting") or whose add is waiting offers no Remove.
  - Why: the reader can see the row as it is now, so asking again is the natural next step; with no Remove the row could never be removed from the page. Entries are never removed, so the old refused one stays and is simply outranked.
  - Where: `src/row-ask.ts:644`; `src/core/rows-act.ts` (`newestActs`)
  - Source: Not ruled on. SPEC 0.20 says a refused removal "leaves the row with 'You asked to remove this; it changed since.'" and is silent on whether Remove is offered again.
  - Suggestion: keep as the plugin's own; propose one line to SPEC saying a row so marked may be removed again

- **C-170** · tier `builder` (changed again 2026-11-08 by contract section 11)
  Add under this row is offered on a row with one field that takes children. Of the fields whose value is a list whose items are all objects: if exactly one has rows, it takes the child (empty lists beside it are ignored, so `"jobs": [{…}]` with `"tags": []` works); if none has rows and exactly one is empty, that empty list takes the child (the first child of `"jobs": []`); otherwise (two lists with rows, or none with rows and two or more empty, or no list) the row is not offered it. The applier chooses the same list or refuses with "Cannot tell where the new row goes under this one."
  - Why: the contract's section 9 counted an empty list as a candidate, which refused every add under a parent that carries an empty `tags: []` beside its real child list; section 11 prefers the list that has rows.
  - Where: `src/core/data.ts` (`childListKey`); `src/core/apply.ts` (`childList`); `src/core/rows-act.ts` (the copy a pending add stands in); `src/row-ask.ts` (`offersUnder`)
  - Source: Ruled by the contract (section 11, refining section 9, item 3); the earlier choices were the plugin's own.
  - Suggestion: none; the README says it

- **C-171** · tier `builder`
  A row held as a field's single object (`"detail": { "id": ..., ... }`, not in a list) cannot be removed: the removal is refused as "no place": the entry is kept, nothing is written, and the notice says "That row stands in no list of rows, so it cannot be taken out." Removing it would leave a field with no value or a half-written object, and there is no comma and no list to take it out of.
  - Why: a list element can be taken out with its comma and its own line and nothing else; a member's value cannot without choosing what the member becomes. SPEC 0.20 describes removing from "its list" only.
  - Where: `src/core/apply.ts:191`
  - Source: Not ruled on. SPEC 0.20 is silent on a row that is not in a list.
  - Suggestion: keep as the plugin's own; propose to SPEC that only a row in a list can be removed

- **C-172** · tier `builder`
  An edit, an added row and a removed row in a data block written in the note itself (an inline `booklet data` block) are written into the note, between the block's fences and nowhere else, by the same functions as for a file. The notice says "written to the data block".
  - Why: SPEC 0.20 hosting says a host applies the act to the data the block holds; a block in the note is data the plugin hosts, and the alternative (keep the entry and never change the data) leaves every add and remove waiting forever. Before this slice the plugin only kept an edit of an inline block.
  - Where: `src/core/apply.ts:227` (`applyInFence`); `src/view.ts:1253` (`applyInline`)
  - Source: Not ruled on. The brief for this slice asked for it; it reverses the 1.3.0 README line "rows written in the note itself … the plugin does not change".
  - Suggestion: keep as the plugin's own; Ben to confirm

- **C-173** · tier `builder` (resolved 2026-11-08 by contract section 10, item 1)
  Entries did not say which data block an `$add` or `$delete` was for, so when one activity held several data blocks an add to one was drawn "sent, waiting" in the views of the others. Resolved: each pair carries `"in": "<the data block's id>"` (required). A pending add or removal is drawn only in views of that block; `{n}` and clashes count only within that block's rows and waiting adds; the apply changes only that block's data. A pair without `in`, or whose `in` names no block, is kept as written and neither drawn, counted nor applied (the spec's linter reports it). No old shape is kept (pre-1.0).
  - Why: found when check 63's made-up note had two blocks in one activity; the earlier note here asked SPEC to let the pair name its block, and the contract did.
  - Where: `src/core/rows-act.ts` (`addPairs`, `deletePairs`, `withPending`, `rowIds`); `src/core/query.ts` (the `withPending` call); `src/view.ts` (`idsOf`, `inflight`); `src/row-ask.ts` (Add and Remove write `in`)
  - Source: Ruled by the contract (section 10, item 1).
  - Suggestion: none

- **C-174** · tier `builder` (accepted 2026-11-08 by contract section 10, item 3)
  On a narrow screen (600 px or less) the table's column of Remove buttons is pinned to the end of what shows while the table scrolls sideways (`position: sticky`), and the question wraps in a width of its own (10 to 16 em). Remove is not moved into a row's open part, because a table row that does not open has none. The contract accepts this pinned column in place of moving Remove into the lead cell; the spec says nothing about where Remove sits.
  - Why: contract 8.10 says Remove sits in the row's open part on a narrow screen; a flat table's rows have no open part, and drawing the control twice (once hidden) would double every Remove for a screen reader and for the tests. Pinning it keeps it in view and pressable without a sideways scroll, which was the fault.
  - Where: `styles.base.css` (`.booklet-row-remove-q`; the `@media (max-width: 600px)` rule); check 63 measures it at 390 px in both looks
  - Source: Ruled by the contract (section 10, item 3), which accepts the pinned column.
  - Suggestion: none

- **C-175** · tier `builder`
  A number outside JavaScript's exact range in a removed row is a README limit, not handled: the row is read through `JSON.parse` before the removal is compared and recorded, so `was` holds the nearest number the language has. The data file's bytes of the row are removed whole, so nothing else changes.
  - Why: contract 8.11 allows a README limit "if that cannot be done"; recording the file's text instead would change how every row is read (the block's rows are parsed once for the page, in the core's reader), which is far beyond this slice.
  - Where: `README.md` (Known limits of adding and removing)
  - Source: Contract 8.11, second option.
  - Suggestion: keep as the plugin's own

- **C-176** · tier `builder` (changed 2026-11-08 by contract section 10, item 2)
  Ids are text for every act: an in-place edit's pick `{pick, a, was}`, a question asked for each row (its draft pairs, its kept pairs, a row's Finalize), an add's `pick` and `under`, and a removal's `pick` all match a row's `id` as text, so 5 and "5" are one id. A pick is stored as the id is written (a number id gives a number pick). Two rows whose ids are the same as text are two rows with one id (the second is not asked or edited, an edit of that id is refused as ambiguous). A question asked for each pick of another question (a choice's position or a widget's id) keeps a number and its digits as words apart.
  - Why: contract section 10, item 2, replaced the earlier reading that only adds and removals compared as text (the old test "a pick that is a number matches a number id, not the same digits as words" is changed).
  - Where: `src/core/apply.ts` (`rowsWithId`); `src/core/ask.ts` (`pairsFor`); `src/core/each.ts` (`pairFor`, `setPair`, `samePick`, `askedOfRows`); `src/core/write.ts` (`keepRowDraft`); `src/core/query.ts` (repeated ids); `src/view.ts`, `src/row-ask.ts` (draft pairs of a row)
  - Source: Ruled by the contract (section 10, item 2).
  - Suggestion: none