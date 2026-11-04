# Accessibility pass for Booklet 1.0.0 (lane b)

Date: 2026-11-03. Branch `feat/100-b-access`, on top of `feat/100-release` (which already has the Pages
button and the side panel / drawer).

**Updated 2026-11-03 by lane F**, after lane E2 (`feat/100-e2-allow`, merged in `3127ce5`) fixed the findings
marked *fixed (E2)* below. The measurements in the sections down to "Findings" are the lane b pass, as made; where
lane E2 changed a figure the line says so. What is still open is the list at "What is left".

## What this is, and what it is not

This is a measured pass over every screen the plugin draws: keyboard order and focus, the accessibility
tree (names, roles, states), colour contrast, and 200% text at a phone width. Everything below was
measured by a script driving a real Obsidian, on two versions.

> **Speech was NOT measured.** The harness cannot hear. Nothing here says what VoiceOver, TalkBack or
> any other screen reader actually says. The accessibility tree is what a screen reader is given; it is
> not what it speaks. `docs/screen-reader-script-100.md` is the script for that pass, to be done by a
> person on a Mac and an iPhone. Phone mode here is Obsidian's emulation, not a phone. Android was not
> tried.

## What was run, on which version

| Item | Detail |
| --- | --- |
| Obsidian 1.14.5 | Chrome 150, Electron 43.8.3, real binary under Xvfb |
| Obsidian 1.11.7 | Chrome 142, Electron 39.5.1, real binary under Xvfb |
| Plugin | the committed test-vault build (equal to `npm run build`) |
| Script | `e2e-tests/access-pass-100.js`, run by hand, see `e2e-tests/README.md` |
| axe-core | 4.10.2, from the Playwright tools folder, not installed in this repo |
| Test note | `test/page-notes/Screen reader walk`, made-up content only |

The script drives Obsidian over the Chrome debugging port. Per screen it presses the real Tab key and
records each stop (name, role, state, whether a focus ring shows and the ring's contrast); reads the
accessibility tree from Chrome (`Accessibility.getFullAXTree`); runs axe-core; and computes the colour
of every distinct text, placeholder, control-edge and graphic style in the default light and dark
themes. A second session emulates a phone (390 by 844) at 100% and 200% text.

Each version gave 83 recorded facts. The plugin's own checks (jsdom, `npm test`) were also run.

## Per-screen result

Stops are Tab stops the walk visited. "Ring" means a visible focus indicator on every stop. "Lost"
means focus fell to the page body. Results were identical on both versions unless said.

| Screen | Stops | No ring | Lost | Trap |
| --- | --- | --- | --- | --- |
| Home | 6 | 0 | 0 | none |
| Tab bar and a wiki page | 9 | 0 | 0 | none |
| Pages panel open (wide pane) | 11 | 0 | 0 | none |
| Page with every question kind | 45 | 0 | 0 | none |
| Answer tab (reader walk note) | 17 | 0 | 0 | none |
| Kept days: table | 8 | 0 | 0 | none |
| Dashboards: bars | 8 | 0 | 0 | none |
| Dashboards: lines | 12 | 0 | 0 | none |
| Dashboards: kept | 11 | 0 | 0 | none |
| Dashboards: data | 13 | 0 | 0 | none |
| Allow card (three forms) | 10 / 9 / 6 | 0 | 0 | Tab cycles inside |
| Now playing bar | 8 | 0 | 0 | none |
| Phone: Pages drawer | 12 | 0 | 0 | none |
| Phone: Allow card | 10 | 0 | 0 | Tab cycles inside |
| Obsidian Settings, allow list | 61 | see below | 0 | see below |

- **Tab bar.** Arrow keys, Home and End move between tabs and select them. Each tab reports
  `selected` and what it controls.
- **Pages.** Escape in the search box clears the words first, then closes the panel and returns focus to
  the Pages button. Escape on a link closes it. Escape on the Pages button itself closes it (fixed in
  this pass, it did nothing before). Escape with focus on the page body leaves the panel open: the
  panel does not trap focus, so that is by design (listed below).
- **Allow card.** Opens focused on its title, Tab and Shift+Tab cycle inside it, Escape and Close
  return focus to the control that opened it.
- **Settings page (Obsidian's own).** The plugin's rows (the allow list, Add a site, Remove) are fine.
  The walk reports 2 failures, both in Obsidian's own markup: its `div.setting-item` rows take Tab with
  `tabindex=-1`, show no ring (3 such stops on 1.14.5, none on 1.11.7), and focus sticks on them. The
  plugin does not draw those rows and cannot fix them.

Counts of recorded facts (lane b, before E2): 1.14.5, 81 pass and 2 fail (both Obsidian's Settings walk). 1.11.7,
81 pass and 2 fail (the Settings walk, and allow-card defect (ii) below). Defect (ii) is fixed since (below).

## The accessibility tree

Read for every screen above on both versions. Counts of problems found by the script: no name 0, a
generic name 0, no role 0, a `div` or `span` used as a control 0.

- Pages button: `button`, `expanded` true or false, `controls` the panel. The panel is a
  `navigation` named "Pages in this tab", with a `searchbox`, a Close button and a list of links; the
  current page's link carries `aria-current` (read from the DOM, because Chrome's tree does not expose
  it).
- Tab bar: a named `tablist`, `tab`s with `selected` and `controls`.
- Choices: buttons with `pressed`, in a named group. Number, date, long and short text have names from
  their questions.
- Allow card: `dialog`, `modal` true, named; a `heading`; named `list`s of `checkbox`es; a `textbox`
  "Add a site" with a description; buttons carry a description naming the site.
- Now playing: `region` "Now playing", `audio` players, "Back to the page" and "Close".
- Charts are `image`s with a name; the numbers sit in a table under a fold.
- **Table has no name** (listed, small).

axe-core (4.10.2): after the fixes, the only rule left is `color-contrast`, from Obsidian's accent
colour (below). The one other violation found before the fixes, `target-size` on the Pages tree links (8
nodes), is fixed. axe could not be run on the first Allow-card form (the script's Escape test closed it
first) or inside Obsidian's Settings window on 1.14.5 (a separate window; the script could not attach).
The other two card forms, the Now playing bar and the dashboard data screen give 0 violations.

## Contrast

Computed foreground and background (the colour is recovered by painting it on white and on black, then
compositing over the ancestors), default light and dark themes. Targets: 4.5:1 text, 3:1 large text and
non-text UI parts. 1.14.5 measured 416 distinct styles, 1.11.7 measured 426; the failing set is the
same on both.

Passing, with the lowest figure seen:

| Style | Light | Dark |
| --- | --- | --- |
| Body text | 15.91 | 12.19 |
| Muted text and disabled "Clear" | 5.89 | 5.31 |
| Placeholder (after the fix) | 6.19 | 5.94 |
| Pages button, panel text | pass | pass |

Below the target:

| Style | Colours | Ratio |
| --- | --- | --- |
| White on accent (light) | #fff on #9873f7 | 3.43 |
| White on accent (dark) | #fff on #8a5cf5 | 4.26 |
| Accent text on white (light) | #8a5cf5 on #fff | 4.26 |
| Accent text, dark | #a68af9 on #1c1c1c | 6.19 (passes) |
| Callout title, light | #086ddd on #e6f0fc | 4.30 |
| Text field edge (light) | #e4e4e4 on #fff | 1.01 to 1.28 |
| Text field edge (dark) | #333 / #555 on #1c1c1c | 1.24 to 2.29 |
| Button edge (both) | about #e0e0e0 on #fff | 1.30 to 1.32 |
| Focus ring (light), before E2 | #bdbdbd on #fff | 1.88 |
| Focus ring, on tinted cards, before E2 | #bdbdbd | 1.47 to 1.74 |
| Bar, green (light) | #08b94e on #f6f6f6 | 2.41 |
| Bar, orange (light) | #ec7500 on #f6f6f6 | 2.73 |
| Line and points, orange | #ec7500 on #fff | 2.95 |
| Chart grid (decorative) | #e4e4e4 on #fff | 1.27 |

Where each figure comes from:

- **White on accent** is every `mod-cta` control: Continue, Next, the selected choice, the active tab
  and the number badges. The colour is Obsidian's theme accent, not set by the plugin.
- **Accent text on white** is links and the active page in the Pages panel. The plugin's own rule
  `.booklet-pagelink.is-active { color: var(--text-accent) }` (styles.css:2045) makes the active page
  fail in light.
- **Text field edges** are Obsidian's pale border colour. WCAG 1.4.11 asks that the boundary of an input
  be perceivable at 3:1; a field edge at 1.0 to 1.3 is hard to find for a low-vision reader.
- **Button edges** (1.30 to 1.32) are Obsidian's default for every button. A button with a text label
  is generally treated as identified by its text, so these are noted, not counted as failures.
- **Focus ring (as found in lane b; fixed by E2, see finding 10).** The plugin's ring
  (`:where(.booklet-view) :where(a,[role=button],summary):focus-visible`) and the input edge used
  `--background-modifier-border-focus`, which is a pale grey in both themes (dark input edge #555 on #1c1c1c
  is 2.29). The Now playing bar uses the accent: 3.17, passes, and E2 left it as it was.
- **Chart colours** in the light theme are the theme's green and orange. The dark theme is 3.46 or more.
  In both themes the numbers are available in the table under the fold, so the colour is not the only
  carrier. On 1.11.7 the line chart's guide line is also pale (2.30, decorative).

## 200% text at a phone width

390 by 844, Obsidian phone emulation as `e2e-tests/mobile-checks.js` does it. 1.14.5: 200% is exact (32px
base). 1.11.7 ignores the text-scale variable, so the script sets the base font to 32px, which gives 30px
(about 187%); that is the best that version allows.

| Screen | 100% | 200% |
| --- | --- | --- |
| Pages drawer | no overlap, no side scroll | no overlap, no side scroll |
| Allow card | fits, nothing cut | scrolls inside itself, Close pinned |
| Now playing bar | fits | 225px tall, sits above the nav |
| Pages (questions) | fits | fits |

Sideways scroll 0, overlapping controls 0, cut-off controls 0, targets under 24px 0, on both versions.
At 390 by 844 that was the whole result. Lane E2 then measured a 320 by 568 phone at 200% (`e2e-tests/phone-200-100.js`)
and found two faults there (finding 18, fixed). Two things are listed, both small: data tables are wider than the screen (+339px at 100%, +1000px at
200%) and scroll inside their own box, which is the design; and at 100% the Pages drawer on a short page
runs under Obsidian's floating bottom bar (the list scrolls inside itself).

## Allow-card defects carried from 0.13.0

- **(i) Escape does nothing when focus is outside the card: FIXED.** Before the fix it failed on both
  versions: with focus on a control behind the card (or on nothing), Escape did nothing and Tab from the
  body walked out to Obsidian's "Navigate back". After the fix the card listens at the document, in the
  capture phase (`src/allow-card.ts:233`), so Escape closes it and returns focus to the Allow list
  button, and Tab from outside lands on the card's first control. It leaves an Escape that comes from
  another `.modal-container` alone, and removes its listener on close. Tests: `test/allow-card.test.mjs`
  (new test) and the measured pass on both versions.
- **(ii) Focus lost over Settings (seen on 1.8.10): FIXED by lane E2 (`5098737`).**
  - **Before.** 1.14.5 did not reproduce it: Settings is a window of its own there, the card kept focus and
    Escape closed only the card. 1.11.7 reproduced it: Settings is a modal in the main window with a key
    scope of its own; the card opened, but focus was pulled straight back to Settings' "Remove" button, and
    one Escape closed both Settings and the card. `e2e-tests/allow-settings-100.js` on 1.11.7 before the fix: 9
    facts passed and 7 failed.
  - **The fix.** The card puts a scope of its own on Obsidian's key stack while it is open
    (`new Scope(app.scope)` with `app.keymap.pushScope`, `keyScope` in `src/allow-card.ts` and
    `src/view.ts`). Obsidian hands a key to the topmost scope only, so one Escape closes the card when the
    card is on top and Settings when Settings is, and Settings no longer pulls focus back. The card's
    document listener keeps Tab only.
  - **After.** `e2e-tests/allow-settings-100.js`: 21 of 21 facts pass on 1.11.7 and on 1.14.5 (see "Rerun by lane F"
    below for the runs made on this branch).

## Findings

Severity: **blocks use** (a reader cannot do something), **hurts** (harder, still possible), **small**.

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | Escape / Tab outside the Allow card | hurts | fixed |
| 2 | Kept-entries fold had no focus ring | hurts | fixed |
| 3 | Escape on the Pages button did nothing | small | fixed |
| 4 | Placeholder text 2.1 to 2.4:1 | hurts | fixed |
| 5 | Trail links read as "A calm check-in/" | small | fixed |
| 6 | Pages tree links under 24px tall | small | fixed |
| 7 | White on accent, 3.43 (light) / 4.26 (dark) | hurts | listed |
| 8 | Accent text and the active page, 4.26 | hurts | listed |
| 9 | Text field edges 1.0 to 1.3 (light) | hurts | listed |
| 10 | Focus ring colour 1.88 (pale grey) | hurts | fixed (E2) |
| 11 | Light chart colours 2.4 to 2.95 | small | listed |
| 12 | Tables have no accessible name | small | listed |
| 13 | Defect (ii) on 1.11.7 | hurts | fixed (E2) |
| 14 | Drawer foot under Obsidian's bar (100%, short page) | small | listed |
| 15 | Tables scroll sideways in their own box | small | listed |
| 16 | Escape on page body keeps Pages panel open | small | by design |
| 17 | Obsidian's Settings rows: Tab sticks, no ring | small | Obsidian's |
| 18 | 200% text on a 320 px phone: Allow card's last line cut, callout arrow past the window | hurts | fixed (E2) |

Nothing found blocks use. Nothing touches the pledge (the plugin sends nothing and loses nothing a
reader wrote): none of the fixes changes what is stored or sent.

### Fixed (the numbers are the findings' numbers)

1. **Allow card keys.** `src/allow-card.ts:233` (document capture handler, removed on close). Test
   added in `test/allow-card.test.mjs`.
2. **Fold focus ring.** `styles.css:378`, `.booklet-entries .booklet-fold:focus-visible` gets a 2px ring;
   the fold had `box-shadow: none`.
3. **Pages button Escape.** `src/page-menu.ts:108`, the keydown listener moved from the panel to the
   button plus panel; a shut panel is left alone so Obsidian still sees the key. Test added in
   `test/pages-fixes.test.mjs`.
4. **Placeholder.** `styles.css:2737` sets `color: var(--text-muted); opacity: 1;` on every placeholder
   in the plugin's view, search box, Allow card and settings. Light 6.19 to 6.69, dark 5.94 to 6.48.
5. **Trail slash.** `styles.css:1662`, `content: "/" / "";` so the generated slash is not part of the
   link's name (a plain `content: "/"` stays before it as the fallback for older WebKit).
6. **Pages link height.** `.booklet-pagelink` is now `display:flex; align-items:center; min-height:24px;`
   in all widths (the duplicate phone-only rule is removed).

10. **Focus ring, fixed by E2 in `14889fc`.** The plugin's own focus rings (links, disclosures,
   `role=button`, cards, charts, sort heads, the kept-entries fold, steps and the Continue prompt) are now
   `var(--text-normal)`, and one rule (`styles.css:2381`) gives the buttons, fields and players inside the view
   and the Allow card a 2 px outline in `var(--text-normal)`, 3 px off the control (Obsidian's pale ring stays
   inside it). Evidence: `e2e-tests/focus-ring-100.js` presses the real Tab key through every screen in both themes and
   reads the ring after Obsidian's ease-in; the lowest ratio for a plugin-owned text-colour ring is 12.42 in the
   light theme and 8.02 in the dark (8.23 on 1.11.7), the same figures as lane E2's, rerun by lane F (below). Before: 1.74 to 1.88 on the page and cards in
   light, 1.98 to 2.29 in dark, 1.47 on a tinted card. The Now playing bar's accent ring (3.17 and 3.46) is
   unchanged. Choice recorded as C-167 in `docs/choices-100.md`.
13. **Defect (ii), 1.11.7, fixed by E2 in `5098737`.** See the Allow-card section above.
18. **200% text at 320 by 568, fixed by E2 in `0629614`.** Obsidian 1.14.5, `e2e-tests/phone-200-100.js`.
   The Allow card's scrolling part was 275 px of the 568 px window and its last line in view was cut at the
   scroll area's edge (the Close footer is in flow under the scroll area, so nothing lay under it). On a phone
   the card now takes the window less a margin, its headings are the dialog's size, and a rule over the Close
   footer marks where the scrolling part ends: 327 px. Obsidian's own folded callout (a "Transcript") had its
   fold arrow 11 px past the window; `.booklet-view .callout-title { flex-wrap: wrap }` (`styles.css:2088`)
   lets the row wrap, and the arrow is inside the window. Recorded as C-160 and C-168. Measured at 200% on 1.14.5 only (on 1.11.7 the script's text scale does nothing).

### Listed (not done; 10, 13 and 18 are above, fixed)

7. **White on accent.** The colour is Obsidian's accent. Fix: set the label of `.mod-cta` to a colour
   that clears 4.5 against the accent, or use a darker accent for the plugin's controls. It changes how
   the screens look, so it is for a design call.
8. **Accent text.** `styles.css:2045`, `.booklet-pagelink.is-active { color: var(--text-accent) }`.
   Suggested: `var(--text-normal)` with a weight and a bar at the side; links in page text are
   Obsidian's `a.internal-link` and need the same call.
9. **Field edges.** `.booklet-text` and the Add-a-site and search inputs use the pale border variable.
   Suggested: a border at 3:1 against the card (for example `--background-modifier-border-hover` or a
   mix of `--text-faint`).
11. **Chart colours.** The series colours are the theme's. Suggested: darker orange and green in light,
    or a pattern or direct labels; the numbers are already in the table below.
12. **Table names.** Give each data table a `caption` or `aria-label` from its heading.
14. **Drawer foot.** At 100% on a short page, the drawer (max-height 45vh) can run under the floating
    bottom bar. Suggested: set a CSS variable from the script for the room below the button, or make it
    a fixed bottom sheet.
15. **Table scroll.** Tables scroll inside their own box by design; a note above the box or a sticky
    first column would help. A design call.

### What is left (after lane E2)

- **7, 8 and 9: the accent contrasts and field edges.** White on Obsidian's accent (3.43 light, 4.26 dark),
  accent text on white (4.26 light) and the pale edge of a text field. They follow the user's theme, by the
  maintainer's ruling (*"A is fine, sticking with obsidian's theme colors for now"*, section E of
  `docs/choices-100.md`); they are listed in the README's Accessibility section.
- **17: Obsidian's own Settings rows.** Tab sticks on some rows and the ring on its own controls there is
  Obsidian's: 1.80 (light) and 2.08 (dark) to 1 on 1.11.7 in the focus-ring measurement (6 control and theme
  pairs under 3:1 there; 2 on 1.14.5). The plugin does not draw those rows.
- **The native audio player's focus ring** (the browser's own control inside the plugin's player and the Now
  playing bar) was not measured (the script records no ring for it, 2 stops with no ring on each version): `e2e-tests/focus-ring-100.js` reads the outline or box shadow the page's CSS gives an element, and a media element's own controls draw their ring inside the browser, outside the page's CSS.
- **11, 12, 14, 15:** light chart colours, table names, the Pages drawer's foot at 100% on a short page, and
  tables that scroll in their own box. Unchanged from the list above.
- **16:** Escape on the page body keeps the Pages panel open, by design.
- Line numbers in the Fixed and Listed sections (`styles.css:2045` and the like) are those of the lane b
  build; `styles.css` has moved since.

## Rerun by lane F (2026-11-03, on `feat/100-f-final`, the committed test-vault build)

| Script | Obsidian | Result |
| --- | --- | --- |
| `e2e-tests/allow-settings-100.js` | 1.14.5 | 21 passed, 0 failed |
| `e2e-tests/allow-settings-100.js` | 1.11.7 | 21 passed, 0 failed |
| `e2e-tests/focus-ring-100.js` | 1.14.5 | 331 stops; plugin rings under 3:1: 0 pairs |
| `e2e-tests/focus-ring-100.js` | 1.11.7 | 341 stops; plugin rings under 3:1: 0 pairs |
| `e2e-tests/phone-200-100.js` | 1.14.5 | 20 passed, 0 failed |
| `e2e-tests/phone-200-100.js` | 1.11.7 | 20 passed, 0 failed |

- **Focus ring.** Lowest plugin-owned ring: the Now playing bar's buttons, which keep the accent ring
  (3.17 light and 3.46 dark on 1.14.5; 3.17 and 3.55 on 1.11.7). Lowest of the text-colour rings: 12.42 light
  (a text field, the Add button) and 8.02 dark on 1.14.5 (8.23 on 1.11.7). Obsidian's own rings on its own
  controls (its Settings rows) under 3:1: 2 control and theme pairs on 1.14.5, 6 on 1.11.7 (lowest 1.80 light and
  2.08 dark, a button and a text field).
- **200% text at a phone width.** `phone-200-100.js` passes 20 of 20 on both versions, but on 1.11.7 the
  `--preferred-text-scale` variable does nothing (the root font stays 16 px in the "200" configurations; on
  1.14.5 it is 32 px), so the 1.11.7 run measured the layout at 100% only. The 200% fix is measured on 1.14.5
  only; the script has no fallback for 1.11.7 (`access-pass-100.js` sets the base font instead, about 187%).

## What could not be measured

- **Speech and screen-reader output.** Not measured at all, on any platform.
- **Real devices.** iPhone and Android were not used. Phone mode is Obsidian's emulation.
- **Obsidian 1.8.10** and any version other than 1.14.5 and 1.11.7.
- **Hover, pressed and other transient states** (only rest, focus and disabled were computed).
- **Axe-core in Obsidian's Settings window on 1.14.5** (separate window, could not attach), and on the
  first Allow-card form.
- **Exact 200% text on 1.11.7** (the base font is set to give about 187%).
- **Other themes.** Only Obsidian's default light and dark. A community theme can change every figure
  above.
- **Windows and Linux assistive tech**, high-contrast mode, reduced-motion, voice control.
- Contrast for 1.11.7 was run in full but tabulated here from the same failing set as 1.14.5; the one
  difference found was the chart guide line.

## How to repeat

`e2e-tests/README.md`, section "Run the measured accessibility pass". Results land in a JSON file per version.
The existing end-to-end suite (`e2e-tests/plugin-check.js`, 59 checks) was run in full on both versions with this
lane's changes: 58 pass and 1 fails on each, check 27 (the wiki of 13 pages). The same two lines of
check 27 fail on lane d's committed build without this lane's changes (run by hand on 1.14.5), so they are
not caused by this lane: the check still expects a tree menu that stays open for the pane after a page
is chosen, and a list no taller than half the window; the new Pages panel (lane d) probably opens and sizes
differently. `e2e-tests/nav-checks.js` lines 697 and 757 are the lines to update. Checks 23 and 55 (phone),
28, 42 to 45, 54, 56, 58 and 59, which touch what this lane changed, pass.
