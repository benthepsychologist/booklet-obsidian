# Themes: contrast results for the paper looks

Generated 2026-11-05 (colour pass the same day) by `node scripts/contrast.mjs --markdown` from `themes/tokens-paper-light.css` and
`themes/tokens-paper-dark.css` (WCAG 2.x contrast ratio). Text pairs need 4.5:1, focus ring and accent boundaries 3:1,
rules are decorative and only reported. Every required pair passes in both looks; the script exits 0.

## Which light values moved, and why

The reference palette (`design/obsidian-themes/reference-btp-explorable/palette.md`) gives accents for small marks and
illustrations, not for text, so as given they failed when used as coloured words on a wash or on card. The palette also
calls `--sun` "text-safe" (it measured 2.6:1 on its own wash) and uses `--sun-bright` as the focus ring (1.7:1 on paper).
To make every required pair pass, the light look moved these values, same hue, only darkened. The original is kept beside
each token in `themes/tokens-paper-light.css`. The five washes, petrol, paper, card, ink, ink-soft and rule did not move in the first pass. In the colour pass the five light washes
and these text-safe accents still did not move; light's brand-wash went from #E4EFEF to #DDEFEF.

| token | palette.md | now | why |
| --- | --- | --- | --- |
| sky | #3F7FB5 | #376F9E | 4.5:1 text on wash and card |
| sage | #4F8C6B | #427559 | 4.5:1 text on wash and card |
| sun | #C98A12 | #93650D | 4.5:1 text; 3:1 boundary |
| rose | #BF5470 | #A74962 | 4.5:1 text on wash and card |
| lilac | #7462B5 | #6E5DAC | 4.5:1 text on wash |
| yes | #2F7D55 | #2E7952 | 4.5:1 on yes-wash |
| hmm | #9A6A12 | #8E6211 | 4.5:1 on hmm-wash |
| focus | #F2B544 | #1E5E6B | 3:1 ring; petrol is 6.8:1 on paper |

Measured in light: ink on paper 12.21 (palette says ~12:1), ink-soft on paper 5.67 (palette says ~5.8:1).

## Control boundaries and text on the accent

`--bk-edge` is a new token for the boundary of an unselected control (option pill, secondary button). `--bk-rule` was 1.30:1
on card in light and 1.53:1 in dark, under the 3:1 WCAG 1.4.11 asks of a control's boundary; `--bk-rule` stays for dividers and
card edges. `--bk-edge` is checked against both card and paper in each look (the "edge" rows below).

`--text-on-accent` is set to `--bk-on-brand` on the Paper looks, because `--interactive-accent` is the brand: the citation
number's hover fill is that pair, which is the same pair as "on-brand on brand" below (7.32 in light; in dark the dark
on-brand text on the lifted brand), so no separate row is needed.

## Dark

Dark was designed to the thresholds from the start (see `themes/tokens-paper-dark.css`). In dark, `--bk-on-brand` is dark text,
because light text fails on the lifted brand and accent fills.

## Colour pass (2026-11-05): tiles, and a livelier dark

Ben's feedback was that the teal, pink, green and yellow felt muted, most of all in dark. Two changes, both checked below.

**Tiles.** Six new tokens, `--bk-brand-tile` and `--bk-<accent>-tile`, are vivid fills for decoration: the picture tile, the number
pill, the chevron disc and a selected option. The only text on a tile is ink (the number, an option's words), so "ink on tile"
needs 4.5:1; the accent drawn on its own tile (a line icon or spot drawing) is a graphical object and needs 3:1; the tile on the
card is decorative and only reported. No accent-coloured word sits on a tile. In light a tile is a brighter, more saturated pastel
than the wash; in dark it is a deep rich colour (the dark ink and the bright accent both have to read on it, which caps its lightness).

**Dark lifted.** More chroma and lightness in the dark accents and washes; paper and card did not move.

| token | before | now |
| --- | --- | --- |
| brand | #5FB4C4 | #55D0E8 |
| brand-deep | #86CAD6 | #86E0F0 |
| sky | #7DB5E8 | #7CC0FF |
| sage | #7CC79B | #78DDA2 |
| sun | #E3B04A | #FFC845 |
| rose | #E88FA8 | #FF95B4 |
| lilac | #AB9DE4 | #BCA8FF |
| yes / hmm | #7FD3A2 / #E8B85C | #7FE0A8 / #F5C45A |
| brand-wash | #1D3A41 | #1A4550 |
| sky, sage, sun, rose, lilac wash | #1F3345, #1F3A2D, #3A3120, #3F2630, #2D2A45 | #1F3A57, #1F4531, #46391A, #4C2536, #353057 |
| yes-wash, hmm-wash | #1D3A2B, #3B2F18 | #1F4631, #4A3A16 |

Tiles now: light brand #8FD3DA, sky #A3CDF0, sage #A0DAB5, sun #F8D072, rose #F6AFC2, lilac #C9BCF2; dark brand #246C7B,
sky #2D669A, sage #217343, sun #7E5F14, rose #AA3155, lilac #5E49B8.


## Tables

### paper-light

| pair | fg | bg | ratio | needs | result |
| --- | --- | --- | --- | --- | --- |
| ink on paper | #24323A | #F8F6F1 | 12.21 | 4.5 | pass |
| ink on card | #24323A | #FEFDFB | 12.97 | 4.5 | pass |
| ink-soft on paper | #56646B | #F8F6F1 | 5.67 | 4.5 | pass |
| ink-soft on card | #56646B | #FEFDFB | 6.02 | 4.5 | pass |
| brand on paper (link) | #1E5E6B | #F8F6F1 | 6.78 | 4.5 | pass |
| brand on card (link) | #1E5E6B | #FEFDFB | 7.20 | 4.5 | pass |
| brand on brand-wash (link) | #1E5E6B | #DDEFEF | 6.16 | 4.5 | pass |
| on-brand on brand | #FFFFFF | #1E5E6B | 7.32 | 4.5 | pass |
| on-brand on brand-deep | #FFFFFF | #15464F | 10.39 | 4.5 | pass |
| ink on sky-wash | #24323A | #E3EEF7 | 11.20 | 4.5 | pass |
| ink on sage-wash | #24323A | #E2F0E7 | 11.21 | 4.5 | pass |
| ink on sun-wash | #24323A | #FBF0D6 | 11.64 | 4.5 | pass |
| ink on rose-wash | #24323A | #F9E3E8 | 10.79 | 4.5 | pass |
| ink on lilac-wash | #24323A | #ECE8F6 | 10.95 | 4.5 | pass |
| ink-soft on sky-wash | #56646B | #E3EEF7 | 5.20 | 4.5 | pass |
| ink-soft on sage-wash | #56646B | #E2F0E7 | 5.20 | 4.5 | pass |
| ink-soft on sun-wash | #56646B | #FBF0D6 | 5.40 | 4.5 | pass |
| ink-soft on rose-wash | #56646B | #F9E3E8 | 5.01 | 4.5 | pass |
| ink-soft on lilac-wash | #56646B | #ECE8F6 | 5.08 | 4.5 | pass |
| sky text on sky-wash | #376F9E | #E3EEF7 | 4.54 | 4.5 | pass |
| sage text on sage-wash | #427559 | #E2F0E7 | 4.55 | 4.5 | pass |
| sun text on sun-wash | #93650D | #FBF0D6 | 4.51 | 4.5 | pass |
| rose text on rose-wash | #A74962 | #F9E3E8 | 4.55 | 4.5 | pass |
| lilac text on lilac-wash | #6E5DAC | #ECE8F6 | 4.56 | 4.5 | pass |
| sky text on card | #376F9E | #FEFDFB | 5.26 | 4.5 | pass |
| sage text on card | #427559 | #FEFDFB | 5.27 | 4.5 | pass |
| sun text on card | #93650D | #FEFDFB | 5.03 | 4.5 | pass |
| rose text on card | #A74962 | #FEFDFB | 5.48 | 4.5 | pass |
| lilac text on card | #6E5DAC | #FEFDFB | 5.40 | 4.5 | pass |
| ink on yes-wash | #24323A | #E1F1E7 | 11.26 | 4.5 | pass |
| ink on hmm-wash | #24323A | #F8EBD0 | 11.17 | 4.5 | pass |
| yes on yes-wash | #2E7952 | #E1F1E7 | 4.51 | 4.5 | pass |
| hmm on hmm-wash | #8E6211 | #F8EBD0 | 4.55 | 4.5 | pass |
| focus ring on paper | #1E5E6B | #F8F6F1 | 6.78 | 3 | pass |
| focus ring on card | #1E5E6B | #FEFDFB | 7.20 | 3 | pass |
| brand boundary on card | #1E5E6B | #FEFDFB | 7.20 | 3 | pass |
| sky boundary on card | #376F9E | #FEFDFB | 5.26 | 3 | pass |
| sage boundary on card | #427559 | #FEFDFB | 5.27 | 3 | pass |
| sun boundary on card | #93650D | #FEFDFB | 5.03 | 3 | pass |
| rose boundary on card | #A74962 | #FEFDFB | 5.48 | 3 | pass |
| lilac boundary on card | #6E5DAC | #FEFDFB | 5.40 | 3 | pass |
| edge (control boundary) on paper | #878C8E | #F8F6F1 | 3.15 | 3 | pass |
| edge (control boundary) on card | #878C8E | #FEFDFB | 3.35 | 3 | pass |
| ink on brand-tile | #24323A | #8FD3DA | 7.85 | 4.5 | pass |
| ink on sky-tile | #24323A | #A3CDF0 | 7.88 | 4.5 | pass |
| ink on sage-tile | #24323A | #A0DAB5 | 8.28 | 4.5 | pass |
| ink on sun-tile | #24323A | #F8D072 | 8.95 | 4.5 | pass |
| ink on rose-tile | #24323A | #F6AFC2 | 7.43 | 4.5 | pass |
| ink on lilac-tile | #24323A | #C9BCF2 | 7.51 | 4.5 | pass |
| brand glyph on brand-tile | #1E5E6B | #8FD3DA | 4.36 | 3 | pass |
| sky glyph on sky-tile | #376F9E | #A3CDF0 | 3.19 | 3 | pass |
| sage glyph on sage-tile | #427559 | #A0DAB5 | 3.36 | 3 | pass |
| sun glyph on sun-tile | #93650D | #F8D072 | 3.47 | 3 | pass |
| rose glyph on rose-tile | #A74962 | #F6AFC2 | 3.14 | 3 | pass |
| lilac glyph on lilac-tile | #6E5DAC | #C9BCF2 | 3.13 | 3 | pass |
| brand-tile on card (decorative) | #8FD3DA | #FEFDFB | 1.65 | - | info |
| sky-tile on card (decorative) | #A3CDF0 | #FEFDFB | 1.65 | - | info |
| sage-tile on card (decorative) | #A0DAB5 | #FEFDFB | 1.57 | - | info |
| sun-tile on card (decorative) | #F8D072 | #FEFDFB | 1.45 | - | info |
| rose-tile on card (decorative) | #F6AFC2 | #FEFDFB | 1.75 | - | info |
| lilac-tile on card (decorative) | #C9BCF2 | #FEFDFB | 1.73 | - | info |
| rule on paper (decorative) | #E4E0D6 | #F8F6F1 | 1.22 | - | info |
| rule on card (decorative) | #E4E0D6 | #FEFDFB | 1.30 | - | info |

### paper-dark

| pair | fg | bg | ratio | needs | result |
| --- | --- | --- | --- | --- | --- |
| ink on paper | #E8E4DB | #182027 | 12.98 | 4.5 | pass |
| ink on card | #E8E4DB | #212B33 | 11.35 | 4.5 | pass |
| ink-soft on paper | #AAB5BA | #182027 | 7.87 | 4.5 | pass |
| ink-soft on card | #AAB5BA | #212B33 | 6.88 | 4.5 | pass |
| brand on paper (link) | #55D0E8 | #182027 | 9.08 | 4.5 | pass |
| brand on card (link) | #55D0E8 | #212B33 | 7.94 | 4.5 | pass |
| brand on brand-wash (link) | #55D0E8 | #1A4550 | 5.76 | 4.5 | pass |
| on-brand on brand | #0F191E | #55D0E8 | 9.82 | 4.5 | pass |
| on-brand on brand-deep | #0F191E | #86E0F0 | 11.83 | 4.5 | pass |
| ink on sky-wash | #E8E4DB | #1F3A57 | 9.19 | 4.5 | pass |
| ink on sage-wash | #E8E4DB | #1F4531 | 8.47 | 4.5 | pass |
| ink on sun-wash | #E8E4DB | #46391A | 8.90 | 4.5 | pass |
| ink on rose-wash | #E8E4DB | #4C2536 | 10.18 | 4.5 | pass |
| ink on lilac-wash | #E8E4DB | #353057 | 9.67 | 4.5 | pass |
| ink-soft on sky-wash | #AAB5BA | #1F3A57 | 5.57 | 4.5 | pass |
| ink-soft on sage-wash | #AAB5BA | #1F4531 | 5.13 | 4.5 | pass |
| ink-soft on sun-wash | #AAB5BA | #46391A | 5.39 | 4.5 | pass |
| ink-soft on rose-wash | #AAB5BA | #4C2536 | 6.17 | 4.5 | pass |
| ink-soft on lilac-wash | #AAB5BA | #353057 | 5.86 | 4.5 | pass |
| sky text on sky-wash | #7CC0FF | #1F3A57 | 6.02 | 4.5 | pass |
| sage text on sage-wash | #78DDA2 | #1F4531 | 6.48 | 4.5 | pass |
| sun text on sun-wash | #FFC845 | #46391A | 7.31 | 4.5 | pass |
| rose text on rose-wash | #FF95B4 | #4C2536 | 6.28 | 4.5 | pass |
| lilac text on lilac-wash | #BCA8FF | #353057 | 5.95 | 4.5 | pass |
| sky text on card | #7CC0FF | #212B33 | 7.44 | 4.5 | pass |
| sage text on card | #78DDA2 | #212B33 | 8.69 | 4.5 | pass |
| sun text on card | #FFC845 | #212B33 | 9.33 | 4.5 | pass |
| rose text on card | #FF95B4 | #212B33 | 7.00 | 4.5 | pass |
| lilac text on card | #BCA8FF | #212B33 | 6.98 | 4.5 | pass |
| ink on yes-wash | #E8E4DB | #1F4631 | 8.36 | 4.5 | pass |
| ink on hmm-wash | #E8E4DB | #4A3A16 | 8.67 | 4.5 | pass |
| yes on yes-wash | #7FE0A8 | #1F4631 | 6.64 | 4.5 | pass |
| hmm on hmm-wash | #F5C45A | #4A3A16 | 6.77 | 4.5 | pass |
| focus ring on paper | #F2B544 | #182027 | 9.00 | 3 | pass |
| focus ring on card | #F2B544 | #212B33 | 7.87 | 3 | pass |
| brand boundary on card | #55D0E8 | #212B33 | 7.94 | 3 | pass |
| sky boundary on card | #7CC0FF | #212B33 | 7.44 | 3 | pass |
| sage boundary on card | #78DDA2 | #212B33 | 8.69 | 3 | pass |
| sun boundary on card | #FFC845 | #212B33 | 9.33 | 3 | pass |
| rose boundary on card | #FF95B4 | #212B33 | 7.00 | 3 | pass |
| lilac boundary on card | #BCA8FF | #212B33 | 6.98 | 3 | pass |
| edge (control boundary) on paper | #6B7A83 | #182027 | 3.72 | 3 | pass |
| edge (control boundary) on card | #6B7A83 | #212B33 | 3.25 | 3 | pass |
| ink on brand-tile | #E8E4DB | #246C7B | 4.72 | 4.5 | pass |
| ink on sky-tile | #E8E4DB | #2D669A | 4.76 | 4.5 | pass |
| ink on sage-tile | #E8E4DB | #217343 | 4.60 | 4.5 | pass |
| ink on sun-tile | #E8E4DB | #7E5F14 | 4.68 | 4.5 | pass |
| ink on rose-tile | #E8E4DB | #AA3155 | 5.05 | 4.5 | pass |
| ink on lilac-tile | #E8E4DB | #5E49B8 | 5.30 | 4.5 | pass |
| brand glyph on brand-tile | #55D0E8 | #246C7B | 3.30 | 3 | pass |
| sky glyph on sky-tile | #7CC0FF | #2D669A | 3.12 | 3 | pass |
| sage glyph on sage-tile | #78DDA2 | #217343 | 3.52 | 3 | pass |
| sun glyph on sun-tile | #FFC845 | #7E5F14 | 3.85 | 3 | pass |
| rose glyph on rose-tile | #FF95B4 | #AA3155 | 3.11 | 3 | pass |
| lilac glyph on lilac-tile | #BCA8FF | #5E49B8 | 3.26 | 3 | pass |
| brand-tile on card (decorative) | #246C7B | #212B33 | 2.40 | - | info |
| sky-tile on card (decorative) | #2D669A | #212B33 | 2.39 | - | info |
| sage-tile on card (decorative) | #217343 | #212B33 | 2.47 | - | info |
| sun-tile on card (decorative) | #7E5F14 | #212B33 | 2.42 | - | info |
| rose-tile on card (decorative) | #AA3155 | #212B33 | 2.25 | - | info |
| lilac-tile on card (decorative) | #5E49B8 | #212B33 | 2.14 | - | info |
| rule on paper (decorative) | #3A4852 | #182027 | 1.75 | - | info |
| rule on card (decorative) | #3A4852 | #212B33 | 1.53 | - | info |

Result: all required pairs pass in both looks.
