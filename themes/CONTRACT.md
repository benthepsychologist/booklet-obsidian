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
| `--bk-rule` | dividers and card edges (decorative, not a control boundary) |
| `--bk-edge` | a control's boundary (option pill, secondary button): at least 3:1 on `--bk-card` and `--bk-paper` |
| `--bk-brand`, `--bk-brand-deep`, `--bk-brand-wash` | petrol: primary buttons, links, selected state |
| `--bk-brand-tile` | petrol's vivid fill for decoration (picture tile, number pill, chevron disc, selected-option fill, progress dots); only ink or the brand line drawing sits on it, never brand-coloured words; ink on it 4.5:1, brand drawing on it 3:1 |
| `--bk-on-brand` | text on a brand or accent fill |
| `--bk-focus` | the focus ring colour |
| `--bk-sky`, `--bk-sage`, `--bk-sun`, `--bk-rose`, `--bk-lilac` | five accents |
| `--bk-sky-wash`, `--bk-sage-wash`, `--bk-sun-wash`, `--bk-rose-wash`, `--bk-lilac-wash` | their soft tints (quiet panels, hovers, chips) |
| `--bk-sky-tile`, `--bk-sage-tile`, `--bk-sun-tile`, `--bk-rose-tile`, `--bk-lilac-tile` | their vivid fills, clearly more saturated than the washes (light: brighter pastel; dark: deep rich colour). Same rule as `--bk-brand-tile`: decoration only, ink 4.5:1 and the accent's own drawing 3:1 on it, no accent-coloured words |
| `--bk-slate`, `--bk-slate-wash`, `--bk-slate-tile` | the quiet neutral (a clean cool grey) for a reading block or note of no colour (law, quote, the `slate` colour name). Same three roles and the same checks as an accent (text on wash 4.5:1, glyph on tile 3:1, ink on tile 4.5:1) |
| `--bk-yes`, `--bk-yes-wash`, `--bk-hmm`, `--bk-hmm-wash` | feedback "matches" and "another pick" (amber, never red). `--bk-yes`/`--bk-hmm` are text-safe on their wash (4.5:1) and a boundary on card (3:1); the wash takes ink at 4.5:1 |
| `--bk-yes-tile`, `--bk-hmm-tile` | the feedback colours' vivid fills, decoration only, NO text on them (answered edge, reply edge, the right and incorrect option's border, the dashed answer line): 3:1 on card and on paper in both looks |
| `--bk-r-lg`, `--bk-r-md`, `--bk-r-sm` | corner radii (22px, 14px, 10px) |
| `--bk-shadow` | card shadow (soft; none or a hairline in dark) |
| `--bk-font-head`, `--bk-font-body` | Lexend, Atkinson Hyperlegible, each with a system fallback |
| `--bk-body-size`, `--bk-body-leading` | 1.0625rem, 1.65 |
| `--bk-spot`, `--bk-spot-art` | size of a card's picture tile (4.6rem) and its drawing (3.4rem); smaller on a phone |

`--bk-on-brand` is dark in paper-dark (light text fails on the lifted fills); always use it for text on a brand or accent fill.

structure.css sets `--bk-accent`, `--bk-accent-wash` and `--bk-accent-tile` on each card or section from the booklet's colour name
(`.booklet-colour-warm|green|amber|teal|slate|blue|purple`; map them onto the five accents, the slate neutral and the brand; document the map in
the file) and defaults them to `--bk-brand`, `--bk-brand-wash` and `--bk-brand-tile`. Components use `--bk-accent`, `--bk-accent-wash` (quiet) and `--bk-accent-tile` (vivid decoration).

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
