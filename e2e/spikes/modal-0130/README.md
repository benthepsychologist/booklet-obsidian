# Lane M spike: the allow card on Obsidian's `Modal` (plugin 0.13.0)

The write-up is `docs/modal-0130.md`. Nothing here ships.

- `allow-card.modal.ts`: the card written on `Modal` (copied over `src/allow-card.ts` for a measuring build only, never committed there). `view-app.patch` adds the one option it needs (`app`) to `src/view.ts`.
- `build-variants.sh <out>`: builds `hand`, `modal`, `modal-plain`, `modal-regain` and leaves the worktree as it was (it restores `src/` and `test-vault/`).
- `measure.js`: one Obsidian, one build; desktop and phone, light and dark; writes `<out>/<label>.json`. `--bare` measures a plain `new Modal(app)`.
- `run-all.sh <builds> <apps> <out>`: every build on 1.14.5 and 1.8.10, one Obsidian at a time (ports 9351 to 9359).
- `results/`: the numbers behind the table. `asis-*` is the first run of the variant, before it put focus back on Not now after `open()`; `popout-click-*` is the popout window run after a real click there.

```
PLAYWRIGHT=<node_modules path> bash build-variants.sh $OUT/plugins     # from the worktree root
PLAYWRIGHT=<node_modules path> bash e2e/spikes/modal-0130/run-all.sh $OUT/plugins <folder with obsidian-1.14.5/ and obsidian-1.8.10/> $OUT/res
```
