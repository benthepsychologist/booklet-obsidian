# Themes: the contract between the lanes (prototype, 2026-11-05)

`styles.css` is BUILT by `node scripts/build-styles.mjs` from `styles.base.css` (today's CSS, untouched) plus the parts in
`scripts/build-styles.mjs` PARTS, in that order. Edit only the part you own. Never edit `styles.css`.

## The looks

`.booklet-view` carries `data-booklet-look="paper-light" | "paper-dark" | "obsidian"` (set by `src/look.ts`, lane switch).
`obsidian` has NO rules at all: it must draw byte-for-byte as `styles.base.css` does. Every theme rule is written as
`.booklet-view[data-booklet-look="paper-light"] X, .booklet-view[data-booklet-look="paper-dark"] X`, or
`.booklet-view[data-booklet-look^="paper"] X`. Nothing outside `.booklet-view` is ever styled. No `!important`.
Motion (transition, animation, transform on hover or press) only inside `@media (prefers-reduced-motion: no-preference)`.

## Tokens (set in themes/tokens-paper-light.css and tokens-paper-dark.css, on `.booklet-view[data-booklet-look="paper-light"]` / `"paper-dark"`; used only by structure.css, pictures.css and fonts.css)

| token | role |
| --- | --- |
| `--bk-paper` | the view's background (warm off-white; deep warm ink in dark) |
| `--bk-card` | card and sheet surfaces, a step off the paper |
| `--bk-ink`, `--bk-ink-soft` | text, secondary text |
| `--bk-rule` | borders and dividers |
| `--bk-brand`, `--bk-brand-deep`, `--bk-brand-wash` | petrol: primary buttons, links, selected state |
| `--bk-on-brand` | text on a brand or accent fill |
| `--bk-focus` | the focus ring colour |
| `--bk-sky`, `--bk-sage`, `--bk-sun`, `--bk-rose`, `--bk-lilac` | five accents |
| `--bk-sky-wash`, `--bk-sage-wash`, `--bk-sun-wash`, `--bk-rose-wash`, `--bk-lilac-wash` | their soft tints |
| `--bk-yes`, `--bk-yes-wash`, `--bk-hmm`, `--bk-hmm-wash` | feedback "matches" and "another pick" (amber, never red) |
| `--bk-r-lg`, `--bk-r-md`, `--bk-r-sm` | corner radii (22px, 14px, 10px) |
| `--bk-shadow` | card shadow (soft; none or a hairline in dark) |
| `--bk-font-head`, `--bk-font-body` | Lexend, Atkinson Hyperlegible, each with a system fallback |
| `--bk-body-size`, `--bk-body-leading` | 1.0625rem, 1.65 |
| `--bk-spot`, `--bk-spot-art` | size of a card's picture tile (4.6rem) and its drawing (3.4rem); smaller on a phone |

`--bk-on-brand` is dark in paper-dark (light text fails on the lifted fills); always use it for text on a brand or accent fill.

structure.css sets `--bk-accent` and `--bk-accent-wash` on each card or section from the booklet's colour name
(`.booklet-colour-warm|green|amber|teal|slate|blue|purple`; map them onto the five accents and the brand; document the map in
the file) and defaults them to `--bk-brand` and `--bk-brand-wash`. Components use `--bk-accent` and `--bk-accent-wash`.

## Files and who owns them

| file | owner lane |
| --- | --- |
| `src/look.ts`, `src/settings.ts`, `src/view.ts` (root attribute and menu), `src/main.ts`, `test/look.test.mjs` | switch |
| `themes/structure.css` | structure |
| `themes/tokens-paper-light.css`, `themes/tokens-paper-dark.css`, `scripts/contrast.mjs`, `docs/themes-contrast.md` | tokens |
| `themes/fonts.css`, `themes/pictures.css`, `src/spots.ts`, the picture drawing in `src/screens.ts` | pictures |
| `e2e-tests/themes-shots.js` | harness |

The reference look is the explorable article: `/workspace/fleet/hubs/booklet-hub/design/obsidian-themes/reference-btp-explorable/`
(`template.html`'s CSS, `palette.md`, `components.md`). It is a mood and a palette, not a layout to copy: Booklet's tabs, groups,
pages and one-at-a-time stay as they are.
