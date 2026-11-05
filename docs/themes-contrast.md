# Themes: contrast results for the paper looks

Generated 2026-11-05 by `node scripts/contrast.mjs --markdown` from `themes/tokens-paper-light.css` and
`themes/tokens-paper-dark.css` (WCAG 2.x contrast ratio). Text pairs need 4.5:1, focus ring and accent boundaries 3:1,
rules are decorative and only reported. Every required pair passes in both looks; the script exits 0.

## Which light values moved, and why

The reference palette (`design/obsidian-themes/reference-btp-explorable/palette.md`) gives accents for small marks and
illustrations, not for text, so as given they failed when used as coloured words on a wash or on card. The palette also
calls `--sun` "text-safe" (it measured 2.6:1 on its own wash) and uses `--sun-bright` as the focus ring (1.7:1 on paper).
To make every required pair pass, the light look moved these values, same hue, only darkened. The original is kept beside
each token in `themes/tokens-paper-light.css`. The five washes, petrol, paper, card, ink, ink-soft and rule did not move.

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

## Dark

Dark was designed to the thresholds from the start (see `themes/tokens-paper-dark.css`); no value moved. In dark,
`--bk-on-brand` is dark text, because light text fails on the lifted brand and accent fills.

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
| brand on brand-wash (link) | #1E5E6B | #E4EFEF | 6.24 | 4.5 | pass |
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
| rule on paper (decorative) | #E4E0D6 | #F8F6F1 | 1.22 | - | info |
| rule on card (decorative) | #E4E0D6 | #FEFDFB | 1.30 | - | info |

### paper-dark

| pair | fg | bg | ratio | needs | result |
| --- | --- | --- | --- | --- | --- |
| ink on paper | #E8E4DB | #182027 | 12.98 | 4.5 | pass |
| ink on card | #E8E4DB | #212B33 | 11.35 | 4.5 | pass |
| ink-soft on paper | #AAB5BA | #182027 | 7.87 | 4.5 | pass |
| ink-soft on card | #AAB5BA | #212B33 | 6.88 | 4.5 | pass |
| brand on paper (link) | #5FB4C4 | #182027 | 6.91 | 4.5 | pass |
| brand on card (link) | #5FB4C4 | #212B33 | 6.04 | 4.5 | pass |
| brand on brand-wash (link) | #5FB4C4 | #1D3A41 | 5.08 | 4.5 | pass |
| on-brand on brand | #0F191E | #5FB4C4 | 7.48 | 4.5 | pass |
| on-brand on brand-deep | #0F191E | #86CAD6 | 9.70 | 4.5 | pass |
| ink on sky-wash | #E8E4DB | #1F3345 | 10.23 | 4.5 | pass |
| ink on sage-wash | #E8E4DB | #1F3A2D | 9.73 | 4.5 | pass |
| ink on sun-wash | #E8E4DB | #3A3120 | 10.09 | 4.5 | pass |
| ink on rose-wash | #E8E4DB | #3F2630 | 10.81 | 4.5 | pass |
| ink on lilac-wash | #E8E4DB | #2D2A45 | 10.83 | 4.5 | pass |
| ink-soft on sky-wash | #AAB5BA | #1F3345 | 6.20 | 4.5 | pass |
| ink-soft on sage-wash | #AAB5BA | #1F3A2D | 5.89 | 4.5 | pass |
| ink-soft on sun-wash | #AAB5BA | #3A3120 | 6.11 | 4.5 | pass |
| ink-soft on rose-wash | #AAB5BA | #3F2630 | 6.55 | 4.5 | pass |
| ink-soft on lilac-wash | #AAB5BA | #2D2A45 | 6.56 | 4.5 | pass |
| sky text on sky-wash | #7DB5E8 | #1F3345 | 5.96 | 4.5 | pass |
| sage text on sage-wash | #7CC79B | #1F3A2D | 6.17 | 4.5 | pass |
| sun text on sun-wash | #E3B04A | #3A3120 | 6.45 | 4.5 | pass |
| rose text on rose-wash | #E88FA8 | #3F2630 | 5.83 | 4.5 | pass |
| lilac text on lilac-wash | #AB9DE4 | #2D2A45 | 5.67 | 4.5 | pass |
| sky text on card | #7DB5E8 | #212B33 | 6.62 | 4.5 | pass |
| sage text on card | #7CC79B | #212B33 | 7.20 | 4.5 | pass |
| sun text on card | #E3B04A | #212B33 | 7.25 | 4.5 | pass |
| rose text on card | #E88FA8 | #212B33 | 6.12 | 4.5 | pass |
| lilac text on card | #AB9DE4 | #212B33 | 5.95 | 4.5 | pass |
| ink on yes-wash | #E8E4DB | #1D3A2B | 9.78 | 4.5 | pass |
| ink on hmm-wash | #E8E4DB | #3B2F18 | 10.31 | 4.5 | pass |
| yes on yes-wash | #7FD3A2 | #1D3A2B | 6.94 | 4.5 | pass |
| hmm on hmm-wash | #E8B85C | #3B2F18 | 7.13 | 4.5 | pass |
| focus ring on paper | #F2B544 | #182027 | 9.00 | 3 | pass |
| focus ring on card | #F2B544 | #212B33 | 7.87 | 3 | pass |
| brand boundary on card | #5FB4C4 | #212B33 | 6.04 | 3 | pass |
| sky boundary on card | #7DB5E8 | #212B33 | 6.62 | 3 | pass |
| sage boundary on card | #7CC79B | #212B33 | 7.20 | 3 | pass |
| sun boundary on card | #E3B04A | #212B33 | 7.25 | 3 | pass |
| rose boundary on card | #E88FA8 | #212B33 | 6.12 | 3 | pass |
| lilac boundary on card | #AB9DE4 | #212B33 | 5.95 | 3 | pass |
| rule on paper (decorative) | #3A4852 | #182027 | 1.75 | - | info |
| rule on card (decorative) | #3A4852 | #212B33 | 1.53 | - | info |


Result: all required pairs pass in both looks.
