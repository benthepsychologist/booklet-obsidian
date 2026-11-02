# Choices in 0.12.0 where the format is silent

This is the 0.12.0 sequel to the choices in the README (*Choices made where the format is silent*). Format 0.18 (SPEC draft, booklet pull request #95) says what a `listen` records, what an embed looks like and that "the file declares; the reader or the host allows". It says little about how a reader asks, how long an allow lasts, what a frame does, or when a position is written. The plugin chose in each of those places. Each row is one choice, the reason, and where it lives in the code, so that 1.0.0's review can go through them one at a time.

**How to read it.** The *Source* column says whose call it is: **Ben** (his words are in `design/plugin-0120/calls.md` in the booklet hub), **plan** (the redrawn plan, `plan-v2.md`), **design** (the first design pass, `design.md`, where `plan-v2.md` does not replace it) or **builder** (a lane chose it while building; Ben has not seen it). *Where* names the file and, when it helps, the function. A *Where* marked "planned" is the design's module name and has not been checked against the finished code.

Written by lane D from the plan and the design before the other lanes were merged. Builders add what they chose in the last section.

## 1. What is local, what is remote

| Choice | Why | Where |
| --- | --- | --- |
| Local means a file in the vault. `http://localhost` is remote | Ben: no asking about the reader's own device | `core/media.ts` (`mediaClass`, `originOf`) |
| Local media is never gated and keeps Obsidian's player | Ben: keep the native player | `view.ts` `md()` leaves local forms alone |
| `preload="none"` is set on local media, best effort | Honours "nothing before a press" as far as it can be | `media-view.ts` (planned); spike S1 decides |
| The extension of the path decides, before `?` and `#` | The format does not say how a query string is read | `core/media.ts` `mediaClass` |
| A remote embed with no known extension is a link | The format says so; it also turns a remote picture with no extension into a link | `view.ts` / `gateMedia` (planned) |
| Remote pictures stay Obsidian's and are not gated | Ben: image drawing is left alone | no code: `gateMedia` skips image extensions |
| Link schemes are not filtered (`obsidian://` and the rest) | Ben: Obsidian is not policed | no code |
| Embedded notes (`![[Other note]]`) are Obsidian's | Ben: accepted and documented | no code; README limits |

## 2. The gate, the card and the three scopes

| Choice | Why | Where |
| --- | --- | --- |
| Allowed, not "declared and allowed": a vault host loads in any booklet | Ben, third round: allow without a declaration | `core/allow.ts` `isAllowed` |
| Three scopes: once, this note, this vault | Ben, third round | `core/allow.ts`; the card |
| Once is kept nowhere. It lasts for the piece as drawn | The plan says "kept nowhere"; how long a drawing lasts is the builder's | `media-view.ts` (planned) |
| This note and this vault live in `data.json`, never in the note | Ben; the format forbids a permission in the file | `settings.ts` (planned), keys `noteAllows`, `allowedMediaHosts` |
| A note's allows are keyed by the note's path | The plan says "this note"; the key is the builder's | `settings.ts` (planned); see section 7 for renames |
| An entry `youtube.com` means `https://*.youtube.com/*`: the host and subdomains | Ben: "picks up (https://*.youtube.com/*) by default" | `core/allow.ts` `isAllowed`, `normaliseEntry` |
| Entries are hosts as typed, lower-case; https is assumed and the card says so | Ben: "https is assumed and that is made clear on the card" | `core/allow.ts` `normaliseEntry` |
| A path prefix is not offered in the write-in | Ben: "just add the domain and tld" | `core/allow.ts` `normaliseEntry` |
| An allow for a service also covers its embed host | The plan: the player's host is not the link's | `core/services.ts` `serviceOf` (`hosts`) |
| The card opens on a booklet open for declared hosts not on the vault list | Ben: the booklet may ask; the format lets a reader do so | `view.ts` (planned) |
| It opens on a press of media from a host not allowed | Ben: a request when she clicks | `media-view.ts` (planned) |
| Default focus is Not now, and each choice states its cost | Plan: a safe default; the host will see when and from where | the card (planned) |
| An "Allow list" button at the top of the view opens the card | Ben: "available as a button at the top of the renderer" | `view.ts` (planned) |
| The vault list starts empty; nothing is pre-allowed | Ben: prepopulation is an option, not a default | `settings.ts` (planned) |
| "Add suggested services" is a settings button; the list is YouTube, Vimeo and a few audio services | Ben: "put them in the plugin settings as an option" | `core/services.ts`, `settings.ts` (planned); Ben strikes the audio ones |
| Unticking a host in the card takes effect at once | Plan: checkboxes to unallow | the card (planned) |

## 3. What a slot is, and what a frame is

| Choice | Why | Where |
| --- | --- | --- |
| A remote slot has no media element until a press | A browser fetches when `src` is set | `media-view.ts` (planned) |
| Only a real press (`isTrusted`) loads it | A script cannot press for the reader | `media-view.ts` (planned) |
| `src` is `new URL(addr).href`, never the raw text | One address is checked and used | `media-view.ts` (planned) |
| `play()` is called inside the press handler; video is `playsinline` | iOS needs the gesture and fullscreens otherwise | `media-view.ts` (planned) |
| Focus goes to the new player, and a polite line says "Loading ..." | A keyboard or screen-reader reader must find it | `media-view.ts` (planned) |
| One error message for every failure, with the open-in-browser link | A 404 and an unsupported codec look the same to the element | `media-view.ts` (planned) |
| Leaving the page tears the player down | A removed element stops the stream | `media-view.ts` (planned) |
| Press-to-load for known audio and video services | Ben, third round: "video AND AUDIO services" | `core/services.ts`, `media-view.ts` (planned) |
| An unknown service stays a link that names the host | Plan | `core/services.ts` `serviceOf` returns null |
| A `listen` holding a service link has only the tick | The plugin cannot read a framed player's position | `listen-view.ts` (planned) |
| Frames draw as links naming the host and never load | Ben: frames drawn as links, not policed in Reading view | `core/media.ts` `gateMedia` (planned) |
| Raw `<audio>` and `<video>` with a remote `src` are treated like frames | The design's reading of Ben's frame call | `core/media.ts` `gateMedia` (planned); confirm with Ben |
| Media in a title, option or label is never drawn; its alt text shows | The issue's item 1 | `view.ts` `md()` mode `inline` (planned) |
| The rewrite works on the text before the render, not on the DOM | A DOM sweep for `iframe` could break an Obsidian embed | `core/media.ts` `gateMedia` |
| A link whose words are not its address shows its host after it | Ben, 3e | `view.ts` `fixLinks` (planned) |
| "Is the address" means equal after dropping scheme, `www.` and a trailing slash | Needed to say when the words differ | `view.ts` (planned) |
| The host shown is `new URL(href).hostname` plus a non-default port | Punycode then shows plainly | `view.ts` (planned) |

## 4. The `listen` question

| Choice | Why | Where |
| --- | --- | --- |
| Position is kept on the device while playing and written on pause, end, leave, quit | The format's renderer note (S6) | `listen-store.ts`, `listen-view.ts` (planned) |
| Positions are whole seconds | The format | `core/listen.ts` |
| `pos` is taken out at the end, leaving `{ "done": true }` | Smaller; the format allows `0` or none | `listen-view.ts` (planned) |
| A new answer is written `{ "pos": n, "done": b }`, `pos` first | A stable order for a new answer | `listen-view.ts` (planned) |
| Unticking a `done` that has no `pos` leaves `{}`, so the answer is removed | The format: `{}` holds nothing | `core/write.ts`, `core/shape.ts` |
| Unknown keys in a `listen` answer are kept and key order too | The format's "write back as read" | `core/write.ts` |
| Status wording for listens only is "N of M done"; mixed is "N of M answered" | The format gives the first; the second is the agent's | `core/shape.ts` / `screens.ts` (planned) |
| A `listen` in a `repeat` activity is drawn without a tick and listed in the notice | The format says "a plain question" and does not say what that is | `listen-view.ts`, `core/notice.ts` (planned) |
| Only the first embed under a `listen` is followed; the second is listed | The format makes more than one an error | `core/reader.ts` (planned) |
| A `left:` that is not whole seconds is ignored and listed | The format | `core/reader.ts` |
| An incoming `pos` never moves playback; paused and not dirty, it may seek | The format's renderer note; never discard her work | `listen-view.ts` (planned) |
| A redraw from Sync is held back while a listen plays | The player is never destroyed under her | `view.ts` `busy()` (planned) |
| A surviving device entry is used after a kill if the file's `pos` still equals its base | Another device wrote since otherwise, so the file wins | `listen-store.ts` (planned) |
| The tick is a button with `aria-pressed`, 44 px high, with a polite live line | The pattern of the other presses | `listen-view.ts` (planned) |
| Her place for Continue is the furthest page on this device, key `booklet-place:<path>` | Plan item 7; a rename made in Obsidian moves it as held words do | `held-store.ts` (planned) |

## 5. Continue

| Choice | Why | Where |
| --- | --- | --- |
| Continue starts after her place, so a skipped question is never offered again | Ben: a trap "needs to be fixed" | `core/nav.ts` `continueTarget` |
| Without a device place, her place is the last record in booklet order | The format's wording | `core/nav.ts` `continueTarget` |
| Hidden and `repeat` activities are skipped | Their questions are never "answered" in the usual way | `core/nav.ts` `continueTarget` |
| It shows on home and on a module screen, not on a booklet that opens straight into one activity | There is no home there | `view.ts` (planned) |
| It hides when nothing is left, and names its target ("Continue: Episode 3") | A button that does nothing should not be there | `view.ts` (planned) |
| Focus goes to the prompt it opened | A keyboard reader lands on the thing | `view.ts` `go()` (planned) |

## 6. Version and the opening notice

| Choice | Why | Where |
| --- | --- | --- |
| `FORMAT_VERSION` is "0.18"; a "0.17" note gets the earlier-marker notice | Pre-1.0: no compatibility shim | `core/reader.ts` |
| Test notes are re-marked, not read as 0.17 | The same | `test-vault/`, `test/page-notes/` |
| Raw frame and media tags are listed among the note's problems, not as unread | A later plugin would not read them either | `core/notice.ts` (planned) |
| A malformed `media-from` value is listed and ignored; the rest of a list still counts | The format | `core/reader.ts` `mediaFromOf` |
| A transcript is an ordinary callout; the plugin draws it as one | The format gives it no kind | no code |

## 7. Spikes and open questions

None of the spikes has a result when this file is written. Builders fill the third column.

| Spike | What it decides | Result |
| --- | --- | --- |
| S1 render | How `![[x.mp3]]`, `![](x.mp3)` and `![alt][id]` draw; when a local read starts | (open) |
| S2 raw HTML | Whether the raw tag rewrite is needed; detach-then-attach | (open) |
| S3 headless play | Whether `play()` advances time under Xvfb | (open) |
| S4 event reach | Whether a capture listener sees Obsidian's media events | (open) |
| S5 server | Range requests and request headers for the privacy wording | (open) |
| S11 persistent playback | How playback survives a page move and closing the note | (open) |
| S12 card and settings | The card writes the vault list; the settings page shows it | (open) |
| S13 native services | Whether Obsidian plays service addresses itself; framed players in the apps | (open) |
| S8 sync conflict | What a merged `pos` line looks like | (open, Ben's devices) |

- **A rename of a note** moves the device keys with the note. Whether the plugin also moves a note's entry in `noteAllows` is not stated in the plan and is for the builder of the settings page to say.
- **A host in a `media-from` list with a path** is malformed; the vault list takes a host only. The format allows a reader's own list to carry a path prefix; this plugin's write-in does not offer it.

## 8. Filled by builders

Each lane adds a row here for every place it chose a behaviour the plan does not state: the choice, why, and where. Move a row into a section above if it belongs to one.

| Lane | Choice | Why | Where |
| --- | --- | --- | --- |
| (A) | | | |
| (B) | | | |
| (B2) | After "This note" or "This vault" the slot she pressed starts by itself when the booklet is drawn again. It is the nth slot of the view with the same address; the choice must be a trusted press; and it must come within 5 seconds of the choice | Ben: no second Play press. The 5 seconds stand for a browser's user activation, which is a few seconds. Checked in Obsidian 1.14.5 with real clicks: 0 requests before the press, 0 while the card is up, 1 after the choice, playing, focus on the player | `media-view.ts` `PressedSlot`; `view.ts` `mediaDeps().carry`, `drawn()` |
| (B2) | A drawing made before the list changed (the slot is still not allowed in it) is waited past, not used up | The redraw the allow brings may be preceded by one already under way | `media-view.ts` `PressedSlot.resume` |
| (B2) | If `play()` is refused with `NotAllowedError` after the redraw, the player is taken out, Play comes back with the line "Press Play to start", and her next press makes a new request. Any other refusal is left to the player's `error` event | A phone that wants the press itself cannot be told otherwise; one request more is the price of an honest Play button | `media-view.ts` `giveBack` |
| (B2) | "Allow once" carries nothing over a redraw; it plays the piece inside the card's own press | Once is kept nowhere | `media-view.ts` `once` |
| (B2) | On the press of an allowed YouTube slot the plugin renders `![](https://www.youtube.com/watch?v=ID)` into the slot with `MarkdownRenderer.render`, the address built from the id, not the file's words. It makes no frame of its own. Checked in Obsidian 1.14.5: the slot holds Obsidian's frame on `releases.obsidian.md/youtube?v=ID`, titled "YouTube: <words>", focused | Spike S13: a raw `/embed/` frame may say "unavailable" in the app window where Obsidian's own plays. Nothing is rendered before the press | `media-view.ts` `start`, `view.ts` `mediaDeps().render`, `core/services.ts` `youtube` |
| (B2) | The YouTube frame is Obsidian's: it is not told to autoplay, so after Play appears she may still press the video's own play button | Obsidian's wrapper takes no autoplay flag; the old raw embed asked for `autoplay=1` | `core/services.ts` |
| (B2) | The slot and the card name a service with its hosts: "YouTube (youtube.com, releases.obsidian.md)". Allowing `youtube.com` also covers `youtu.be`, `youtube-nocookie.com` and `releases.obsidian.md`; allowing `releases.obsidian.md` alone allows no YouTube | The frame is loaded from Obsidian's host. A host that is not a YouTube host must not unlock YouTube | `core/services.ts` (`also`, `shown`, `alsoCovers`), `allow-card.ts`, `settings.ts` |
| (B2) | Vimeo, Spotify and SoundCloud keep the plugin's own sandboxed frames | Obsidian does not embed them (spike S13) | `media-view.ts` `createFrame` |
| (B2) | An address is read the way a browser reads it: character references undone once (`&#104;ttps://`, `&colon;`), tabs and line breaks inside it dropped, `https:/host` and `https:host` as remote as `https://host`, in Markdown targets, definitions and tag attributes | Spike B2, Obsidian 1.14.5: each of these loaded at render and the gate let it through. Read once: `&amp;#104;` and `%68ttps` load nothing and are left alone | `core/gate.ts` `addressOf`, `whereIs` |
| (B2) | A YouTube or Twitter/X address is never left to Obsidian, in Markdown or a raw `img` tag, whatever it ends in (`.png` too). It becomes the plugin's player (YouTube, once allowed) or a link naming the host | Obsidian's image post-processor turns any `img` with such an address into a frame that loads `releases.obsidian.md` or `platform.twitter.com` at render (read from the app's own code, and seen at 1.14.5) | `core/services.ts` `isEmbedAddress`, `core/gate.ts` `embed` |
| (B2) | A raw `img` or `image` tag is gated when what it loads is audio, video or one of those frames; any other picture stays Obsidian's | A Markdown embed of the same address is gated; raw pictures are Ben's "image drawing is left alone" | `core/gate.ts` `Gate.image` |
| (B2) | A media tag with no address of its own is played from its first remote `source` or `track`, even after a local one | The browser tries the next source when the first is unusable; spike B2 saw the second load | `core/gate.ts` `rawTags` |
| (B2) | Left alone on purpose, all remote pictures: `<img>`, `srcset`, `poster`, an SVG `image`, CSS `url()`, `<input type=image>`, and `![](x.png)` | Ben: pictures are not gated. Each loads at render in 1.14.5 (spike B2) | no code; README limits |
| (B2) | Left alone because Obsidian loads nothing: `![[https://...]]` (an empty embed), a plain link or autolink, `<iframe srcdoc>` (Obsidian drops the attribute), `<embed>`, `<object>` and `<link>` (it strips them) | Spike B2 saw no request. `<embed>` and `<object>` become links all the same | no code; `core/gate.ts` |
| (B2) | Not covered: an embedded note (`![[Other note]]`) and a link's hover preview draw another note with Obsidian's own renderer, remote media in it included | Already a documented limit (section 1) | no code |
| (C) | | | |
| (S) | | | |
| (P) | A placeholder stays in the page where a player was lifted from: "Its player is in the bar at the bottom of the window." | A listen's box would otherwise look emptied; it is also what a new drawing shows for media that still plays | `now-playing.ts` `lift`, `claim` |
| (P) | An element that plays is never put back into a page; a paused one is, when a drawing makes a slot for the same media | Removing a playing element from a page stops it, and a page can go at any moment (spike S11) | `now-playing.ts` `claim` |
| (P) | Two elements are the same media when the note's path and the source address match, less the hash and a `?<digits>` query (Obsidian's mtime); any other query is kept | A remote address's query can matter; the plan only names the mtime | `now-playing.ts` `keyOf` |
| (P) | A pause leaves the element in the bar even when its page is showing; "Back to the page" or a later drawing returns it | The plan: it stays until she closes it or returns | `now-playing.ts` `onEvent`, `back` |
| (P) | Close returns the paused element to its page when that page is showing, and drops it when not | A placeholder with no player would be a dead end | `now-playing.ts` `close`, `release` |
| (P) | The end writes, then the element goes back to a page that is showing (at its end), else is dropped | The plan says only "remove the element from the bar" | `now-playing.ts` `onEvent`, `release` |
| (P) | "Back to the page" while the page shows a playing element's placeholder only scrolls to it and focuses it; with the page gone it opens the note as a booklet at the place of the press, in the pane that already shows the note, else a new tab | A playing element must not be moved into a page | `now-playing.ts` `back`, `main.ts` `showPage` |
| (P) | Every native audio and video in the Booklet view is lifted, not only a `listen`'s; one outside a `listen` writes nothing | The plan: "every native audio/video the Booklet view hosts" | `view.ts` onload, `now-playing.ts` `lift` |
| (P) | One bar per window with one row per lifted element; paused rows stay until closed or returned. The label is the prompt, else the embed's words, else the player's name, else the file name | More than one can be paused in the bar at once | `now-playing.ts` `labelOf`, `itemOf` |
| (P) | Framed service players (iframes) are not lifted and stop with their page | An iframe cannot move without reloading (spike S13) | `now-playing.ts`: only `audio` and `video` are lifted |
| (P) | A media error after the lift takes the row away; a plugin player's placeholder goes too, Obsidian's element is put back to show its own state | The page keeps its own Play button for a player of ours | `now-playing.ts` `failed` |
| (P) | With no view following the box, the device store keeps each second as a view would, and its `base` is read from the note at the first noted second | Same kill-safety as with a view; the base must be the note's own | `now-playing.ts` `note` |
| (P) | The writer puts the change into the Markdown editor when the note is also open as Markdown, else uses `vault.process`; a failure says so in a notice | As the view's own write does, so unsaved words in the editor are not lost | `listen-writer.ts` `apply` |
| (P) | While the bar shows, the page gets 8em of padding at its foot (`body.booklet-has-nowplaying`) | The fixed bar must not cover the last lines; not checked in real Obsidian | `styles.css` |
| (P) | `ViewHost.nowPlaying` is optional | Only so existing view tests, which do not exercise the bar, run unchanged; the plugin always supplies it | `view.ts` `ViewHost` |
| (E) | After Not now on the card that opens on its own, the same note does not ask again until the app is started again; the Allow list button still opens the card | A reader who said no is not asked at every redraw; seen in the real app (check 50) | `view.ts` `askDeclared`, module-level `putOff`; check 50 |
| (E) | Once lasts for the piece as drawn: a redraw of the page puts a once-allowed slot back to asking | "Kept nowhere" leaves how long a drawing lasts to the builder; seen in the real app (check 50) | `media-view.ts`; check 50 |
| (E) | A frame or raw media tag is a link whose words are its `title` (else its host), followed by "from host:port"; the port shows when the address has one | Names the host the reader would reach; seen in the real app (check 53) | `media-view.ts` `otherSlot`; check 53 |
| (E) | " (host)" is added only to links in prose; a link in a title, option or anchor is words only | Inline pieces are drawn as words, not as links to leave; seen in check 53 | `view.ts` (`drawLinkHosts` runs for `media === "block"` only) |
| (E) | A position is kept on the device each whole second while media plays, and is lost for a kill only back to the browser's last commit of local storage (on a profile's first launch, nothing survives a SIGKILL) | Chromium commits `localStorage` late; measured in check 51 (3 s old on a second launch, nothing on the first) | `listen-store.ts`; check 51; the header comment now says what was measured (lane F) |
| (E) | A `![alt][id]` reference to a local audio file is drawn by Obsidian as a picture, not a player | The gate leaves local forms to Obsidian, which draws a reference embed as `img`; recorded by check 49 | `core/gate.ts`, `view.ts`; plan point 10 says it plays. Fixed by lane F: see its row below |
| (E) | The e2e media checks run on Obsidian 1.14.5 only; the 1.8.10 floor is not measured | No older build is on the box | `e2e/media-checks.js` |
| (F) | The allow card's default focus is put back if it is lost to nothing (`BODY`) in the card's first second, at 0, 30, 120, 300 and 700 ms and on each blur; a press or a key of hers ends this, and focus that sits anywhere else is never taken | Obsidian blurs a card opened as the note opens about 2 ms later (check 50); a fixed "after the leaf is active" hook does not exist | `allow-card.ts` end of `openAllowCard` |
| (F) | `allowfullscreen` is dropped from the framed player; `fullscreen` stays in `allow`, which Vimeo and Spotify already carry. SoundCloud is audio and carries none | A frame with both makes the browser say "Allow attribute will take precedence" in the console on every service player (check 10) | `media-view.ts` `createFrame` |
| (F) | A local `![alt][id]`, `![id][]` or `![id]` of an audio or video file is rewritten by the gate to `![alt](path)` (the path from the definition, in `<...>` if it holds a space or a bracket); in a title, option or anchor it is still its alt text; a definition path with `<` or `>` in it is left alone | Obsidian draws a reference embed of a file as a broken `img` and the inline form as a player (spike S1); the format treats the reference forms like the others | `core/gate.ts` `Gate.embed`; `test/gate.test.mjs`; check 49 |
| (F) | Obsidian's own `audio` and `video` get an `aria-label`: in a `listen` box the prompt in plain words, else the embed's alt, else the file name. The plugin's own players, and any element that already has a name, are left alone; nothing else about Obsidian's player is changed | The native controls had no accessible name (check 54) | `media-view.ts` `nameLocalMedia`; `listen-view.ts` (`data-booklet-name` on the box); check 54 |
| (F) | A drawing no longer waits for Obsidian to settle a local media embed: a piece of Markdown with no slot and no footnote mark to draw counts as finished as soon as its player is in the page. It is polished (host labels, dead links, task boxes) then and again when Obsidian's render resolves | Obsidian's render of `![[x.wav]]` with `preload="none"` on it resolves about 5 s after the player is in the page (measured in the real app), so Continue's focus, a heading's scroll, a restored scroll and the focus after the card all came 5 s late. That was the cause of the focus left on `BODY` after Continue to a `listen` with media | `view.ts` `md`, `mediaThere`, `early`; check 52 |
| (F) | The `listen-store.ts` header says what lane E measured about a hard kill (nothing back at 3 to 29 s on a first launch, a value about 3 s old on a second) instead of "no more than a second" | Chromium commits `localStorage` late | `listen-store.ts` |
| (M) | On a phone (`.is-phone`, Obsidian's bottom bar showing) the Now playing bar stands above Obsidian's own bottom bar (back, search, new tab, tabs, menu), at `bottom: var(--navbar-height)`, plus `--navbar-bottom-offset` when the bar floats. With that bar hidden (`.is-hidden-nav`) or on a tablet it is at the foot of the window | At the foot it covered those five buttons, so a reader listening could not open search or the tab list. Measured at 390x844: the bar was 704 to 844, Obsidian's bar 760 to 812 | `styles.css` `.is-phone:not(.is-hidden-nav) .booklet-nowplaying` |
| (M) | The Now playing bar's bottom padding for a safe area reads `var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))`, not `env()` alone. With Obsidian's bar showing it adds none (that bar has it) | Obsidian sets its own variable to 34px when it emulates a phone and reads `env()` into it on a real one, so the one variable is right in both; `env()` alone read 0 in phone mode | `styles.css` `.booklet-nowplaying` |
| (M) | The bar takes at most 45vh and scrolls inside itself when taller | At 200% text on a 320x568 phone the bar would be 296px of 568; its Close then needs a scroll inside the bar. The alternative, a bar that can cover half the window, was worse | `styles.css` `.booklet-nowplaying` |
| (M) | While the bar shows, the page gets `10em` plus 16px at its foot, instead of the 8em of the (P) row above | The bar is 152px at the normal text size and 266px at 200% on a phone, and it grows with the text, so the room is in em. A measured height needs an inline style, which `test/safety.test.mjs` forbids in `src/`. Checked by the e2e check 55 at 12 sizes | `styles.css` `.booklet-has-nowplaying .booklet-view` |
| (M) | The bar's two buttons get the page's background, so they read as buttons against the bar | They took the bar's own colour and showed as bare words in both themes | `styles.css` `.booklet-nowplaying button` |
| (M) | On a phone, an audio of ours (in a `listen`, or in the bar) is 54px high, not Obsidian's 42px | 54px is the browser's own height for its controls; at 42px they are squeezed and under 44px. What the buttons inside a native player measure is the browser's, and cannot be read from the page | `styles.css` `.is-mobile .booklet-listen-media audio` |
| (M) | On a phone "Open in browser" is a 44px-high line (`inline-flex`), with Obsidian's arrow moved to the middle | It was 20.8px high, a link too small to hit | `styles.css` `.is-mobile .booklet-media-slot a.external-link` |
| (M) | The allow card's title wraps, instead of ending in "..." on one line (Obsidian's phone rule) | "Allow media from media.tea-course.invalid?" showed as "Allow media from media.tea-c...": the site's name is what the reader decides on | `styles.css` `.booklet-allow .booklet-allow-card .modal-title` |
| (M) | A site's name in the card, the settings page, a slot's host line and the card's explanations breaks anywhere when it has to (`overflow-wrap: anywhere`); Obsidian's ellipsis on a setting's name and description is dropped | At 200% text on a 320px phone these ran 24 to 64px past the window, and the settings page scrolled sideways | `styles.css` `.booklet-allow-row > span`, `.booklet-settings`, `.booklet-media-host` |
| (M) | The card's choice buttons, the Allow list button and the settings page's buttons wrap their words and grow (`height: auto`, `white-space: normal`) | "Add for every note" ran 14px past its button at 200% on 320px | `styles.css` |
| (M) | The settings container carries the class `booklet-settings` | The wrap rules above must reach only this page, not Obsidian's other settings | `settings.ts` `display` |
| (M) | Not changed: Obsidian's folded callout (a "Transcript") is 41px wider than its box at 200% text on 320px, and its arrow sits 5px past the window | Older than 0.12.0 and Obsidian's own callout; told in the check's output, not counted | no code |
| (M) | Not changed: with the card scrolled to its top, its Close footer lies over the foot of the content (the last buttons are half hidden until she scrolls) | Obsidian's own phone dialogs do the same; check 55 asserts that with the card scrolled to its end nothing is under the Close | no code |
| (F) | "Back to the page" for a note that is open in a tab behind the active one asks for that tab (the plugin's `showPage`: reveal, then make it the active leaf with focus) and then puts the element back as before. "Behind" is read as an ancestor with `display: none`, which is how Obsidian hides inactive tabs | The placeholder is in the window but not on screen, so the bar took the page for showing and nothing came forward (check 56 d) | `main.ts` `showPage`; `now-playing.ts` `back`, `shown` |
| (F) | An entry whose paused element is out of the document with an empty `src` is forgotten, not handed to the next drawing | Obsidian empties the `src` of the media of a page it closes; the next Play gave "The element has no supported sources" (check 56 d) | `now-playing.ts` `claim` |
| (L) | The media of a `listen` is the first audio or video in its media part (the `>` embed or link), not the first anywhere in its box. An embed in the help is lifted into the bar like any media and writes nothing into the answer, also once the box's own player is in the bar | A second embed in the help text was tracked as the listen's media once lifted, and wrote into its answer | `playing.ts` `firstMedia`, `mediaEvent`; `now-playing.ts` `lift` |
| (L) | The bar keeps an entry per slot: note path, the `listen` it is the media of (else none), and the address. Two embeds of one address outside any `listen` still share an entry | Two `listen`s on one file, or a `listen` and an embed of the file, shared one entry and the newest took the other's slot. Obsidian's own elements do not say where in the note they are drawn, so plain embeds cannot be told apart | `now-playing.ts` `keyOf`, `take`, `restore`; `view.ts` `mediaDeps(piece)` |
| (L) | A note renamed keeps its bar entry (`NowPlaying.rename`); a note deleted stops what plays from it, writes nothing and drops the device's entries (`deleted`, `dropDevice`) | Playing media kept writing to the old path: the pause was lost, an orphan device entry was made, and the renamed note drew a second player | `now-playing.ts`; `listen-store.ts` |
| (L) | A write to the note that cannot be made (a block it cannot write into) resolves the writer's promise false. The quit flush gives each place 3 seconds and goes on | `flush` waited for ever on a write that never answered | `listen-writer.ts` `apply`; `view.ts` `commit`; `now-playing.ts` `flush` |
| (L) | After a failed write the place stays noted (and kept on the device) and the paused element is not put back at the note's older place. The quit hook keeps asking while it is not in the note | The redraw after the failure sought the element back and lost where she was | `listen-view.ts` `settle`; `now-playing.ts` `settle` |
| (L) | Close on a paused element she moved (scrubbed) with no view following writes the place she moved to | Close wrote only for an element that was playing | `now-playing.ts` `close` |
| (L) | Continue: a furthest page past the last page of the booklet is no place, and the records' last answered place is used instead | The device keeps the furthest only, so pages the author took out left Continue gone for good | `core/nav.ts` `continueTarget` |
| (L) | `listen` media is found with code left out: an embed or link in a code span, a fence or an indented block is help as written. The notice counts only the embeds outside code | `Use ![[x.mp3]] to embed` made the example the media | `core/listen.ts` `listenBody` |
| (L) | The bar's words: one empty live region per window, made with the plugin, outside the bar; it is emptied, and filled 100 ms later, so the same news twice is heard twice. It says "Playing {label}", "Closed {label}" and "{label} finished"; Back says nothing (focus moves) | The old region was made in the task of its message and went with the bar | `now-playing.ts` `liveOf`, `say` |
| (L) | When a row goes (Close, the end, an error) and focus was in it, focus goes to the element if it is back in a showing page, else the first button of the next (or previous) row, else the control she pressed Play from if it is still there, else the note's most recent leaf | Closing left focus on nothing | `now-playing.ts` `release`, `refocus` |
