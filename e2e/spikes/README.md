# Measuring spikes for plugin 0.12.0

These scripts measure what real Obsidian does with media, so the plugin is designed from numbers. They change no plugin source and touch no repository vault: each makes a
scratch vault under `--out` (made-up content only) and a fresh scratch config folder per launch. Only Obsidian 1.14.5 was available when they were written; the 1.8.10
floor has not been measured.

## Common setup
```
cd e2e/spikes
export PLAYWRIGHT=<folder holding node_modules/playwright-core, or the package itself>
OB=<path to the obsidian binary>    OUT=<a scratch folder>
node make-media.js --obsidian $OB --out $OUT --media $OUT/media     # once: records clip.webm, clip.mp4, sound.m4a, sound.webm; writes sound.mp3 (silence)
```
`--plugin <folder>` is a folder holding the built plugin (`main.js`, `manifest.json`, `styles.css`). Build it in the worktree with `node esbuild.config.mjs production`, copy the
three files out, and `git checkout test-vault` afterwards (the build also writes into the committed test vault).
Write each script's output to a file; do not pipe it to `head` or anything that can close the pipe early. If a script dies, its own Obsidian and Xvfb are killed by exact pid
(`lib.js`, the `reap` function); nothing is killed by pattern.

## The pieces
- `../media-server.js`: https server (self-signed certificate made with openssl at run time), Range support, JSON-lines request log with every header, `mark()` / `since()`.
  The scripts start Obsidian with `--ignore-certificate-errors` and `--host-resolver-rules="MAP <host> 127.0.0.1:<port>"`, so `https://media.example.org/...` reaches it.
- `../tones.js`: WAV tones (2, 5, 10, 60 seconds). `node tones.js <folder>`.
- `lib.js`: arguments, scratch vault, launching, `openNote`, `watchAdded`, `generateMedia`, `bookletNote`. It can add a do-nothing "spike-helper" plugin that exposes the
  `obsidian` module as `window.__obs` (to call `MarkdownRenderer` directly).

## The spikes
| Script | Question | Needs |
| --- | --- | --- |
| `s1-render.js` | What Obsidian makes of each media embed form, Reading view and Booklet view, root and subfolder notes; when the element and its request appear | `--media`, `--plugin` |
| `s2-rawhtml.js` | Raw `audio`, `video`, `iframe`, `img`, `embed` with a remote src: what is kept, and is a request made before the element is attached | `--media` |
| `s3-play.js` | Does `play()` advance `currentTime` and fire `play/timeupdate/pause/ended` for each format under Xvfb; is the autoplay flag needed (`--autoplay` to compare) | `--media` |
| `s4-events.js` | Capture-phase listener on the Booklet view's `contentEl`; `currentTime` set on `loadedmetadata`; removing a playing element | `--media`, `--plugin` |
| `s5-server.js` | Headers a remote media request carries, range pattern on play and seek, requests before a press | `--media` |
| `s11-persist.js` | Does playback survive a note switch, a close, a pane or tab change, a page move; the lift trick, its timing and the hooks early enough to use it | `--media`, `--plugin` |
| `s13-services.js` | Does stock Obsidian embed service addresses; do iframes load in the Booklet view and what origin do they show; `--real` also contacts the real YouTube and Vimeo (`--only-real` skips the local parts) | `--media`, `--plugin`; `--real` needs the network |

Example:
```
PLAYWRIGHT=... node s11-persist.js --obsidian $OB --out $OUT --media $OUT/media --plugin $OUT/plugin > $OUT/s11.txt 2>&1
```
