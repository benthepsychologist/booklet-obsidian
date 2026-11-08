---
booklet: "0.20"
id: booklet-test/tea-course-problems
title: Tea course with problems
lang: en
media-from:
  - https://media.tea-course.invalid
  - https://media.tea-course.invalid/unit-2/
  - http://media.tea-course.invalid
---

<!-- A made-up note that holds mistakes on purpose, for the opening notice and the gate. It is NOT in the corpus test: the linter
     reports errors in it, as it should. Everything here is invented. Each mistake is on a line of its own so a test can name it. -->

> [!activity|solo] One sitting

A link whose words are not its address (the view shows the real host after it): [https://bank.example.org](https://evil.tea-course.invalid/login)

A frame, which the view draws as a link and never loads:

<iframe src="https://video.tea-course.invalid/embed/1"></iframe>

Raw media tags, which are drawn as links in this view too:

<audio src="https://media.tea-course.invalid/raw.mp3"></audio>

<video src="https://media.tea-course.invalid/raw.mp4"></video>

> [!listen|bad-left left:abc] A left that is not whole seconds
> ![Tone](media/steep-1.wav)

> [!listen|two-embeds] Two embeds, of which only the first counts
> ![First](media/steep-1.wav)
> ![Second](media/steep-2.wav)

> [!listen|nothing] A listen with no embed and no link
> Only help words here.

> [!listen|remote-undeclared] An embed on a host the note does not declare
> ![Elsewhere](https://elsewhere.example.net/tone.mp3)

> [!activity|tea-log repeat] A tea log

> [!listen|log-listen] A listen in a repeat activity (kept as written, drawn without a tick)
> ![Tone](media/steep-2.wav)

> [!text|log-note] What did you drink?
