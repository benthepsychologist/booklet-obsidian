# The allow card on Obsidian's `Modal`: a measurement (plugin 0.13.0, lane M)

## 1. The question

The allow card (`src/allow-card.ts`) builds Obsidian's modal markup by hand in the window (`div.modal-container.mod-dim.booklet-allow` with a `.modal-bg` and a `.modal.booklet-allow-card`) instead of using Obsidian's own `Modal` class. The owner's rule is *"I don't like replacing obsidian native features without a VERY good reason."* On 2026-11-02 Ben kept the hand-built card for 0.12.0 and said to *"measure the modal for the next round"*. The only reason the file's header gives is that the card must stay up while the note behind it is drawn again after a change. The cost on record is the five-timer focus hack (`docs/choices-0120.md`, rows (F) and (U)).

This document is the measurement and a recommendation. Nothing in `src/` changed.

## 2. How it was measured

- **Two cards.** The shipped card (`hand`), and the same card written on `Modal` (`modal`: `e2e/spikes/modal-0130/allow-card.modal.ts`, 287 lines against 280). The variant keeps the same triggers (the Allow list button, a press on media, a booklet that names sites), the same three scopes, the same words and the same callbacks to the view. It needs one new option, `app`, which a one-line patch to `view.ts` supplies (`view-app.patch`, applied only while building).
- **Three more builds** to separate causes: `modal-plain` (no role or aria attributes added: what `Modal` exposes by itself), `modal-regain` (the variant plus the hand-built card's focus-regain timers) and `bare` (a plain `new Modal(app)` with a few buttons, a box and a text field, no plugin).
- **Real Obsidian**, official builds 1.14.5 and 1.8.10 (the declared minimum), driven over the debugging port (`e2e/spikes/modal-0130/measure.js`). Desktop window (1024x800) and phone (`app.emulateMobile(true)` with the device override at 390x844 and touch on; it exists on both versions), each in light and dark: four passes per build and version. The made-up vault has one long booklet, and one booklet for each way the card opens by itself.
- **Real keys and clicks** (Playwright's keyboard and mouse). The accessibility tree is Chrome's own (`Accessibility.getFullAXTree`): what a screen reader is given, not speech.
- **Light and dark gave the same verdicts on every row.** Counts differ only where a list had grown by a row.
- Raw numbers: `e2e/spikes/modal-0130/results/*.json`. `asis-*` are the first run of the variant, before it put focus back on Not now after `open()` (see 4.1). Rebuild and rerun: `build-variants.sh`, then `run-all.sh`.

## 3. The numbers

`H` is the hand-built card, `M` the Modal variant (role and aria added by hand, no timers). `14` is Obsidian 1.14.5, `18` is 1.8.10. Yes and no are what was seen, in all four passes unless a cell says otherwise.

| What was tried | H 14 | M 14 | H 18 | M 18 |
| --- | --- | --- | --- | --- |
| Escape closes (focus in card) | yes | yes | yes | yes |
| Escape closes (focus on page) | no | yes | no | yes |
| Tab never leaves the card | yes | no | yes | yes |
| Tab presses to cycle (desktop) | 6 | leaves at 8-13 | 6 | 6 |
| Shift+Tab wraps to the last | yes | no | yes | no, sticks |
| Focus back: Esc, Close, outside | yes x3 | yes x3 | yes x3 | yes x3 |
| Header X button | none | yes | none | yes |
| Note drawn again: card stays | yes | yes | yes | yes |
| Note drawn again: rows update | yes | yes | yes | yes |
| Note drawn again: focus kept | yes | yes | yes | yes |
| Opens as note opens: Not now | yes | no, body | yes | no, body |
| Same, with the timers added | n/a | yes | n/a | yes |
| Press: default focus Not now | yes | after open() | yes | after open() |
| Opened while window blurred | in card | in card | not seen | not seen |
| dialog + aria-modal + name | yes | by hand | yes | by hand |
| Title is a heading | h2 | no | h2 | no |
| Phone: fits, 44px, Close, scroll | yes | yes | yes | yes |
| Phone: page behind stays | yes | yes | yes | yes |
| Over Settings: card keeps focus | yes | n/a* | no | yes |
| Over Settings: Esc closes card | yes | n/a* | no | yes |
| Opens in view's own window | yes | no | yes | no |
| Lines of source | 280 | 287 | 280 | 287 |

- "Leaves at 8-13" is the number of Tab presses before focus reaches Obsidian's own navigation buttons, by pass. "Sticks" means Shift+Tab stays on the first control and does not wrap.
- "After open()": on desktop `Modal` puts focus on its first control as it opens (the first checkbox, or Allow once on a press), so the variant has to set focus again after `open()` returns. Taken as it comes it focuses Allow once, which breaks the safe default. On a phone it focuses nothing.
- "Over Settings": on 1.14.5 Settings is its own window, so the two do not stack. The hand-built card opened in the main window with focus in it. The Modal card did not appear in the main window at all (`n/a*`: it opens in the active window, which was Settings; see 4.2). On 1.8.10 Settings is a modal and the two stack.
- "Opened while window blurred" was reached only on 1.14.5 (a second window took the focus); on 1.8.10 the main window kept it.
- "Opens in view's own window": see 4.3, with its caveat.

## 4. What it shows

### 4.1 What the Modal gives free

- **Escape from anywhere.** It closes with focus on the page behind too. The hand-built card listens on its own element, so it ignores Escape once focus is on the body (for instance after a click on plain text in the card). That is a gap in the hand-built card.
- **Focus back to the opener**, after Escape, Close, the backdrop and the X. The card still has to pass `returnFocus`, because the button that opened it is drawn again after a change, and both builds end on the new Allow list button after a redraw. So this saves nothing in the plugin's code.
- **The right order over Settings on 1.8.10.** With Settings open and the card opened on top, the Modal card takes the focus and Escape closes it first. The hand-built card is drawn on top but loses the focus to Settings (it stays on "Remove vault.example.org"), and Escape closes Settings underneath it and leaves the card. That is a real defect in the hand-built card. With the card first and Settings opened over it, both close in the right order.
- **A header X button.** It is a div with no role and no name, so a screen reader is not given it. A mouse reader gets a second way out.
- **Layout.** The phone sheet, the 44px controls, the inner scroll and the page staying still measured the same as the hand-built card's; one pair of phone screenshots was compared and differs only by the X. The card's own styles are unchanged.

### 4.2 What the Modal does not give, or takes away

- **Tab trap (1.14.5).** On the current Obsidian, Tab and Shift+Tab leave the card for the app's navigation buttons within 8 to 19 presses. The bare `Modal` does the same, so it is not the variant's doing. The hand-built card holds focus on both versions and wraps both ways. On 1.8.10 the `Modal` holds focus but Shift+Tab does not wrap.
- **No dialog semantics.** Taken as it comes, the Modal's accessibility tree has no `dialog`, no name and no `aria-modal` (`modal-plain`, and the bare Modal), and its title is a plain div, not a heading. The variant adds `role`, `aria-modal` and `aria-labelledby` by hand: three lines, the same ones the hand-built card sets. It still has no heading. A `role="heading"` on the title would be a fourth line.
- **The safe default focus.** See "After open()" above: a workaround, not a gift.
- **A note that opens with the card.** With the Modal, focus is on the page body from the first moments and stays there. The first moments are the same as for the hand-built card (Obsidian makes the pane active about 2 ms later), so `Modal` needs the same timers; with them (`modal-regain`) focus ends on Not now on both versions. The timers (about 26 lines) are the larger part of what the Modal was meant to save.
- **A different window.** Called from a view in a popout window, the hand-built card opens in that window. The Modal opens in `activeWindow`: in this harness the main window, both when asked for by code and after a real click on the button in the popout. Caveat: there is no window manager on the virtual display, so `activeWindow` may not track a click here as it does on a real desktop. Not verified there.

### 4.3 The one reason the code gives does not hold

The header of `allow-card.ts` says the card sits in the window and not in the note's drawing, so it stays up when the note is drawn again. A `Modal` does too. In every pass both builds kept the card and its focus through a redraw, updated the rows, and said the change in the polite line. That reason is not a reason against `Modal`. The reasons that remain are the ones in 4.2.

### 4.4 Size

Source 280 lines (hand-built) against 287 (variant with timers), about 261 without the timers, which the note-open case needs. The Modal variant drops about 50 lines: the Escape and Tab handler (22), the focus-regain timers (26 if they could go), the backdrop click, the root element's creation and removal. It adds the class, the `finish` hook, the three aria lines and the `open()` wrapper. The built bundle is 142 bytes smaller. Neither is a reason to switch.

## 5. Not verified

- A real phone, a real screen reader, VoiceOver or TalkBack. The phone is Obsidian's phone layout in desktop Chromium, with touch on. The accessibility tree is Chrome's.
- A window that really loses focus on 1.8.10, and the popout window's `activeWindow` on a real desktop (4.2).
- The Now playing bar behind the card with real playback: only the stacking numbers (the bar's `z-index` is 30, the dialog's 50) and Settings were measured.
- The tests: `test/allow-card.test.mjs` (about 35 tests, many of them on the hand-built markup) and checks 50, 52 and 58 were read, not run on the variant.

## 6. Recommendation

**Keep the hand-built card for 0.13.0 and for 1.0.0.** Reasons: on the current Obsidian (1.14.5) the `Modal` does not hold Tab, which is the one thing a keyboard or screen-reader reader needs from a dialog, and the card is where she decides what a site may see. The Modal's own markup gives no dialog and no heading, so the plugin would add them by hand anyway. Its default focus is a control that allows (desktop), so the variant has to override it. A note that opens with the card needs the same timers. Opening in the view's own window is also kept (if the caveat in 4.2 holds). Against that stands the owner's rule. What the Modal removes (about 50 lines, mostly the Tab handler) is not enough for it to override the Tab trap.

**Cost of switching anyway** (frontier model with subagents): about 1 hour to write and fix up the variant, and about 1 hour more for the tests: `allow-card.test.mjs` needs a `Modal` stub in `obsidian-stub.mjs`, and the e2e checks 50, 52, 58 change. 15 minutes of Ben's review. The hard part is steering: the Tab trap would be given up on the current Obsidian.

**Three changes the hand-built card should take from this**, all small (owner of `src/allow-card.ts`: lane L or the integrator):
1. Escape with focus outside the card (listen on the document in the capture phase while the card is open, or register the card in Obsidian's key scope).
2. Over Settings on 1.8.10, take the focus when the card opens and close before Settings on Escape (the same scope).
3. The header's reason should be replaced by the real ones above (the Tab trap on the current Obsidian, the safe default, dialog semantics, the view's own window).

If Obsidian's `Modal` later traps Tab and takes `role` and a heading, revisit.
