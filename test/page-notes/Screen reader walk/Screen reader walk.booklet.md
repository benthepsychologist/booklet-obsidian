---
booklet: "0.18"
id: booklet-test/screen-reader-walk
title: Screen reader walk
description: A made-up note for walking through the Booklet view with a screen reader. Every word is invented.
lang: en
media-from:
  - https://media.tea-course.invalid
---

<!-- A made-up note for the screen-reader pass (docs/screen-reader-script-100.md). One activity with three tabs: pages to move through, one question of each kind,
     and a short tone to play. The host in media-from never answers, on purpose: it only makes the Allow card open. Nothing here is about a real person. -->

> [!activity|walk icon:ear] Screen reader walk

A short made-up activity to walk through. Any answer will do.

> [!tab|read] Read

> [!page|start] The first page

This is the first of three pages. Use the Pages button to go to another one.

[[#The second page]] comes next, and [[#A page under it]] sits inside it.

> [!page|second] The second page

This is the second page. It has a page under it.

> [!page|parent:second] A page under it

This page is inside the second page, so it shows one level in.

> [!tab|answer] Answer

> [!page|choose] Choosing

> [!choice|fruit] Which fruit would you pack?
> Pick one.
- [ ] Apple
- [ ] Pear
- [ ] Plum

> [!multi|tools open] Which tools did you use? Add your own.
- [ ] Pencil
- [ ] Ruler
- [ ] Scissors

> [!scale|sure] How sure are you of the plan?

1. Not sure
2. Fairly sure
3. Certain

> [!page|write] Writing

> [!text|thoughts long] Anything else about the plan?

> [!number|boxes min:0 max:20] How many boxes did you fold?

> [!date|day] When did you fold them?

> [!tab|listen] Listen

> [!listen|tone] A short tone
> ![A short tone](media/tone.wav "A short tone")
> Play it to the end, or to within a second of its end.

> [!note]- Transcript
> A steady middle tone, three seconds long. It has no words.

Another made-up clip, from a site that is not allowed yet:

![A made-up clip from another site](https://media.tea-course.invalid/clip.mp3)
