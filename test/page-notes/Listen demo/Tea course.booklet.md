---
booklet: "0.19"
id: booklet-test/tea-course
title: Tea in three steps
description: A made-up three-unit course with local tones, one hosted episode, a video link and a short quiz in each unit.
lang: en
version: "0.1"
media-from:
  - https://media.tea-course.invalid
---

<!-- A made-up note for trying audio, video and the listen question in the Booklet view. Everything here is invented. The tones are
     in media/ (node make-tones.mjs makes them again); the host media.tea-course.invalid never answers, on purpose. -->

# Tea in three steps

Three short units on making a cup of tea. Each has something to listen to or watch, and a question or two.

![Welcome to the course][welcome]

> [!note]- Transcript
> A rising tone and then silence. This is a made-up welcome, and it has no words.

> [!module|unit-1] Unit 1: Choosing leaves

Loose leaves or bags, whole leaves or broken: the first step is the leaf.

> [!activity|u1-listen] Listen and check

> [!listen|u1-e1 left:1] Episode 1: Choosing leaves
> ![Episode 1: Choosing leaves](media/steep-1.wav "Choosing leaves")
> Listen to the whole tone, or to within a second of its end.

> [!note]- Transcript
> A steady middle tone, three seconds long. The made-up host says nothing; the tone stands for the episode.

> [!choice|u1-leaf] Which of these is a tea plant?
> Pick one.
- [ ] A mint plant
  - Mint makes a herbal infusion, not tea.
- [x] Camellia sinensis
  - Every true tea comes from this one plant.
- [ ] A chamomile plant
  - Chamomile makes a herbal infusion too.

> [!module|unit-1 end] End of Unit 1

> [!module|unit-2] Unit 2: Steeping

Water, time and a little patience.

> [!activity|u2-listen] Two episodes

> [!listen|u2-e1] Episode 2: Water and time
> ![Episode 2: Water and time](media/steep-2.wav)

> [!note]- Transcript
> A higher tone, two and a half seconds long.

> [!listen|u2-e2] Episode 3: A longer talk, from the course host
> ![Episode 3, from the course host](https://media.tea-course.invalid/unit-2/steeping.m4a)
> This one is a hosted file. It plays only after the host is allowed, and only after a press.

> [!note]- Transcript
> The host does not exist, so this transcript is all there is.

> [!activity|u2-check] Check your steeping

> [!scale|u2-time] How long do you usually steep black tea, in minutes?

1. One
2. Three
3. Five
4. Ten

> [!module|unit-2 end] End of Unit 2

> [!module|unit-3] Unit 3: Serving

Pouring, and what to do with the leaves.

Listen to a last tone here, written the way Obsidian writes a file embed:

![[media/steep-3.wav]]

> [!note]- Transcript
> A low tone, two seconds long.

> [!activity|u3-watch] Watch and think

> [!listen|u3-v1 left:60] Video: pouring from a height
> [Watch the pouring demonstration](https://www.youtube.com/watch?v=teaDemo0001)
> A video service keeps its player to itself, so this question has only a box to tick.

> [!multi|u3-extras] What can you add to a cup of tea?
> Pick every one that suits you.
- [ ] Milk
- [ ] Lemon
- [ ] Honey
- [ ] Nothing at all

> [!text|u3-note] What will you try first?

> [!module|unit-3 end] End of Unit 3

> [!data] Data

[welcome]: media/steep-3.wav "Welcome"
