# The version floor for 0.13.0

**Question.** `manifest.json` says `minAppVersion` 1.8.10. 0.12.0 was only ever run in Obsidian 1.14.5. Does the plugin, as built from `main` (0.12.0), run and pass the real-Obsidian suite (`e2e-tests/plugin-check.js`, 59 checks) on 1.8.10? If not, what is the oldest official release it does pass on, and what fails below that?

**Answer.** On 1.8.10 the plugin runs and passes 58 of 59 checks once the harness is fixed (check 10 is intermittent there, see 4). The one it does not pass is check 55 (phone layout), for two real reasons in the plugin's own CSS that Obsidian's phone interface exposes. The oldest official release that passes all 59 as built is **1.11.7**. Two other things were found and are not the plugin's: three harness assumptions that only hold on 1.14 (fixed in `e2e-tests/`), and an intermittent uncaught `illegal access` on closing a pop-out window on older Obsidian (cause not found, see 4).

All runs: Obsidian's official Linux tarball, Xvfb, `e2e-tests/plugin-check.js`, the committed build in `test-vault/.obsidian/plugins/booklet/` (a build of `main`), Obsidian's phone emulation for the phone checks. One Obsidian at a time, own config folder, ports 9341 to 9349.

## 1. What was run

| Obsidian | Electron / Chrome | Result (as built from `main`) |
| --- | --- | --- |
| 1.8.10 | 34.2 / 132 | 56 of 59 at first; see 2 |
| 1.10.6 | 37.10 / 138 | not run in full; phone nav same as 1.8.10 |
| 1.11.4 | 39.2 / 142 | 57 of 59: check 55 and check 10 fail |
| 1.11.5 | 39.2 / 142 | check 55 fails the same way as 1.11.4 |
| 1.11.7 | 39.5 / 142 | 59 of 59 (check 14 failed once, passed 3 of 3 reruns) |
| 1.14.5 | 43.8 / 150 | 59 of 59 (the three failing checks of 1.8.10 rerun after the harness fixes) |

- **1.8.10, first full run** (22 minutes, log `f-run-1.8.10.log`): 56 passed. Failed: 48, 53, 55. Check 10 (no error from the plugin in the console) passed.
- **1.8.10, after the harness fixes** (below): 48 and 53 pass. 55 still fails, with 24 failures that are two things (2.3 and 2.4); 12 more failures that were the harness's own are gone.
- **1.8.10 with a CSS patch for the two real causes** (scratch copy of the vault, not committed): full run 57 of 59. Check 55 passed. Check 41 failed once (a timing limit of 2 s exceeded, 2.7 s, while three other lanes were using the machine; passed on three reruns). Check 10 failed on two uncaught `illegal access` errors (4).
- **1.11.4 and 1.11.5**: only check 55 (and 10, see 4) fail, on the Now playing bar lying over Obsidian's bottom bar (2.4).
- **1.11.7**: full run 58 of 59; the one failure was check 14's Tab case (`Apple` still pressed after the Mango words and Tab). It passed on three reruns on 1.11.7, three on 1.14.5 and three on 1.8.10, so it is a flake in a timing-sensitive step, not a version difference.
- **1.10.6**: not run in full. The phone-mode probe shows the same state as 1.8.10 (no `--navbar-height`, `--input-height` 40 px, a classic bottom bar); check 55 with my CSS patch still failed there by 2 px (2.4), which is why a numeric patch is not offered.
- Downloads used: 1.11.7, 1.10.6, 1.11.4, 1.11.5 (four of five allowed). Nothing older than 1.8.10 was run: the question asked for the floor at or above 1.8.10.

## 2. Every failure and its cause

1. **Check 48, 1.8.10: the YouTube control.** Harness (a). On 1.14 Obsidian frames an allowed YouTube video through its wrapper page `releases.obsidian.md/youtube?v=ID`; on 1.8.10 it frames `www.youtube.com/embed/ID` directly. The plugin hands the video to Obsidian's own embed in both, and nothing was requested before the press in both. The check expected the wrapper host. Fixed in `e2e-tests/media-checks.js`: either frame URL is accepted, and the "asked only after the press" count is taken on the frame's own host.
2. **Check 53, 1.8.10: a click that never lands.** Harness (a). Opening a note with six unread things shows the plugin's Notice. Before 1.14 Obsidian draws a Notice in the main window, and keeps it while the pointer is over it; the pointer was still over it, so the Notice covered the "Show Markdown" header button and Playwright's click timed out. Fixed in `e2e-tests/media-checks.js`: the check dismisses the Notice with a click, as a person would, then clicks the button. (A wait for the Notice to expire did not work for that reason.)
3. **Check 55, every phone width, 1.8.10 and 1.10.6: "Add a site" box is 40 px high, under 44.** Plugin (b). `styles.css` gives the settings page's buttons and the allow card's write-in `min-height: max(44px, var(--input-height))`, but the settings page's write-in (`.booklet-settings .setting-item-control input[type="text"]`) has no such rule, so it is Obsidian's own height. Obsidian's phone `--input-height` is 40 px before 1.11 and 44 px from 1.11.
4. **Check 55, every phone width, 1.8.10, 1.10.6, 1.11.4, 1.11.5: the Now playing bar lies over Obsidian's bottom bar.** Plugin (b). `styles.css` lifts the bar above Obsidian's bottom bar with `bottom: var(--navbar-height, 0px)`, plus `--navbar-bottom-offset` when the body has the class `is-floating-nav`. Those names are not part of Obsidian's documented interface and they changed: 
   - 1.8.10 and 1.10.6: the bar is a static strip (74 px high on 1.8.10 and 76 px on 1.10.6 at 390 px) and **no `--navbar-height` exists**, so the fallback `0px` puts the bar over it.
   - 1.11.4 and 1.11.5: `--navbar-height` exists (52 px) and the bar floats 32 px off the foot, but the class `is-floating-nav` and `--navbar-bottom-offset` do not exist yet, so the offset is not added.
   - 1.11.7 and later: both exist; the rules work.
   A CSS-only fix for the older versions means magic numbers (the strip is 74 px on 1.8.10, 76 px on 1.10.6: a patch tuned to one is 2 px wrong on the other), and `src/` may not set an inline style, so the height cannot be measured and written in.
5. **Check 55, 1.8.10 and every older Chromium: "could not set a safe area".** Harness (a). `Emulation.setSafeAreaInsetsOverride` does not exist in Chrome 132. Fixed in `e2e-tests/mobile-checks.js`: a protocol answer of "wasn't found" is no longer a failure; it is written to the check's INFO notes as "not measured" (the 34 px bottom-safe-area part of the Now playing bar is not measured on those versions).
6. **Check 10, 1.8.10 and 1.11.4, intermittent: two uncaught page errors `illegal access`.** Not attributed (section 4). Not seen on 1.14.5 or 1.11.7.
7. **Check 41, 1.8.10, once:** drawing the 3000-day line took 2.7 s against the 2 s limit, with other lanes loading the machine. Passed on every rerun. A flake of load, not of version.
8. **Check 14, 1.11.7, once:** see 1.

The source was also read against the typings: `node_modules/obsidian/obsidian.d.ts` (1.14.4) carries `@since` tags, and every API `src/` uses with a tag is at 1.8.10 or older (for example `Setting.setHeading` is 0.9.16, `app.vault.getFileByPath` 1.5.7). That agrees with the run: no check failed for a missing API.

## 3. The harness changes (in `e2e-tests/`, all keep 1.14.5 passing)

- `drive.js`: if the environment variable `E2E_PORT_RANGE` is set (for example `9341-9349`), `launch` takes the first free port in that range instead of a random one. Unset, nothing changes. This is only so that several lanes on one machine keep to their own ports.
- `media-checks.js`: the YouTube control accepts both frame URLs (2.1); the Reading-view part of check 53 dismisses the Notice before clicking (2.2).
- `mobile-checks.js`: a Chromium without the safe-area override is reported as "not measured", not as a failure (2.5).

After the fixes, checks 48, 53, 55 and 10 were rerun on 1.14.5 and all passed; 48 and 53 pass on 1.8.10.

## 4. What is not known

- **`illegal access` on closing a pop-out window.** It is a bare string thrown in the main window (line 0, no stack, none of the plugin's code in it), twice per occurrence, in check 40's pop-out step (`c40-popout`, a booklet note in a pop-out window, words typed, the window closed 150 ms later). Seen on 1.8.10 in 3 of 5 runs of check 40 and on 1.11.4 in 1 of 1; not seen on 1.11.7 (1 full run) or 1.14.5 (6 runs of check 40). A reduced probe (a pop-out opened and closed: three runs with the plugin and no typing, six without the plugin and with typing) did not reproduce it. So it is not shown to be the plugin's, and not shown to be Obsidian's; check 10 counts it as a failure because it counts every uncaught error. If 1.8.10 stays the floor, someone should decide whether the check should name the source before counting it.
- **Real devices.** Everything here is desktop Obsidian in Xvfb. Phone mode is `app.emulateMobile(true)` plus a 390 x 844 (360 x 740, 320 x 568) window: it has Obsidian's phone classes and layout, not the phone's web view. Not testable by this harness: Android (never tried), iOS (0.1.0 to 0.3.0 were used on an iPhone; nothing since), real touch and the on-screen keyboard, a real safe area (the home indicator; the emulation sets Obsidian's own 34 px variable, and on 1.8.10 even the CDP override is missing), real audio output (no sound card under Xvfb; the audio checks use muted or silent output and the native element's events), the lock-screen and background behaviour of audio, and the Obsidian mobile app's own version numbers (they track the desktop's, but the phone app updates by the store, not by the user choosing a release).
- **Versions between the ones run** (1.8.3 to 1.8.9 apart from 1.8.10, 1.9.x, 1.10.x apart from 1.10.6, 1.11.0 to 1.11.3, 1.11.6, 1.12 and 1.13) were not run. 1.11.6 is not a published tarball in the releases repository.

## 5. Proposal

**Raise `minAppVersion` to 1.11.7 for 0.13.0.** It is the oldest official release on which the whole suite passes with `src/` and `styles.css` as they are. Below it, two things are measured and real: on a phone the Now playing bar covers Obsidian's bottom bar while audio plays (the bar's Close button still works, and nothing is lost), and the settings page's one write-in is 40 px high instead of 44. Neither loses a reader's work. But the bar rule cannot be made right on the older versions in CSS alone (2.4), and the owner's rule is not to build to hide a problem.

The alternative, if Ben wants to keep 1.8.10: add the one-line settings rule (below) and leave the Now playing bar as it is on Obsidian before 1.11.7, and say so in the README. That is a floor with a known, visible layout fault on phones for the versions 1.8.10 to 1.11.6; the desktop is unaffected.

Either way the settings rule is worth adding, because the card's write-in and the settings page's buttons already carry it:

```css
.booklet-settings .setting-item-control input[type="text"] {
	min-height: max(44px, var(--input-height));
}
```

(Checked in a scratch copy on 1.8.10: with it and the harness fixes, "Add a site" measures at least 44 px. It is in `styles.css`, which lane L owns; I did not touch it.)

## 6. Exact edits for the integrator (if 1.11.7 is chosen)

1. `manifest.json`: `"minAppVersion": "1.8.10"` becomes `"minAppVersion": "1.11.7"`. (`version-bump.mjs` writes `versions.json` from the manifest, so run the version bump after changing the manifest, not before.)
2. `versions.json`: after the bump it has `"0.13.0": "1.11.7"` as its last line; `"0.12.0": "1.8.10"` stays, because 0.12.0 was published with that value.
3. `README.md`, the paragraph that starts "Booklet needs Obsidian 1.8.10 or later (`minAppVersion`)." Replace its first sentences with words to this effect (the rest, about 1.5.8, 1.7.7, 1.8.3 and 1.8.7, stays as history):

   > Booklet needs Obsidian 1.11.7 or later (`minAppVersion`). The real-Obsidian suite (`e2e-tests/plugin-check.js`, 59 checks) passes completely on 1.11.7 and on 1.14.5. On 1.8.10 it passes 58 of 59 (and closing a pop-out window sometimes throws an uncaught `illegal access`, cause not found): the one failure is the phone layout, where the Now playing bar covers Obsidian's bottom bar (Obsidian before 1.11.7 has no `--navbar-height` for the bar to stand above, and 1.11.4 and 1.11.5 lack the floating-bar class and offset) and the settings page's write-in is 40 px high. Releases 1.8.10 to 1.11.6 other than 1.8.10, 1.10.6, 1.11.4 and 1.11.5 were not run. The suite runs in desktop Obsidian in a virtual display; Android has not been tried and no phone was used for 0.12.0 or 0.13.0.

   If 1.8.10 is kept instead: leave `manifest.json` and `versions.json` alone and write "1.8.10 passes 58 of 59; the failure is the Now playing bar over Obsidian's bottom bar on a phone".
4. The README's remark that "the 0.12.0 media checks were run on 1.14.5 only, and the 1.8.10 floor for 0.12.0 has not been measured" is now out of date: it was measured here.
5. Nothing else: `e2e-tests/README.md` already carries the note about `E2E_PORT_RANGE` and about the older Obsidian differences (added in this lane's commit).
