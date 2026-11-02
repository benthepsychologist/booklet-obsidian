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
| (C) | | | |
| (S) | | | |
| (E) | After Not now on the card that opens on its own, the same note does not ask again until the app is started again; the Allow list button still opens the card | A reader who said no is not asked at every redraw; seen in the real app (check 50) | `view.ts` `askDeclared`, module-level `putOff`; check 50 |
| (E) | Once lasts for the piece as drawn: a redraw of the page puts a once-allowed slot back to asking | "Kept nowhere" leaves how long a drawing lasts to the builder; seen in the real app (check 50) | `media-view.ts`; check 50 |
| (E) | A frame or raw media tag is a link whose words are its `title` (else its host), followed by "from host:port"; the port shows when the address has one | Names the host the reader would reach; seen in the real app (check 53) | `media-view.ts` `otherSlot`; check 53 |
| (E) | " (host)" is added only to links in prose; a link in a title, option or anchor is words only | Inline pieces are drawn as words, not as links to leave; seen in check 53 | `view.ts` (`drawLinkHosts` runs for `media === "block"` only) |
| (E) | A position is kept on the device each whole second while media plays, and is lost for a kill only back to the browser's last commit of local storage (on a profile's first launch, nothing survives a SIGKILL) | Chromium commits `localStorage` late; measured in check 51 (3 s old on a second launch, nothing on the first) | `listen-store.ts`; check 51; its header comment ("no more than a second") overstates this |
| (E) | A `![alt][id]` reference to a local audio file is drawn by Obsidian as a picture, not a player | The gate leaves local forms to Obsidian, which draws a reference embed as `img`; recorded by check 49 | `core/gate.ts`, `view.ts`; plan point 10 says it plays |
| (E) | The e2e media checks run on Obsidian 1.14.5 only; the 1.8.10 floor is not measured | No older build is on the box | `e2e/media-checks.js` |
