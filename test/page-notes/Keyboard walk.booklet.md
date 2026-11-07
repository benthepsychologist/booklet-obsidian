---
booklet: "0.19"
id: booklet-test/keyboard-walk
title: Keyboard walk
lang: en
---

> [!activity|walk] Every kind, by keyboard

A made-up test note with one question of each kind the Booklet plugin draws, for walking through with the keyboard alone. Nothing in it is about a real person, and any answer will do.

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

> [!text|thoughts long] Anything else about the plan?

> [!lines|steps] The steps, one to a line

> [!number|boxes min:0 max:20] How many boxes did you fold?

> [!date|fold-day] When did you fold them?

> [!menu|shapes]
- Circle
- Square
- Triangle

> [!multi|picked menu:shapes] Which shapes did you draw?

> [!widget|board describe] Sort the made-up boxes
> ![[#^boxes]]

```booklet widget
{ "engine": "grid-select",
  "axes": { "top": "taller", "bottom": "shorter", "left": "narrower", "right": "wider" },
  "cells": [
    { "id": "tall-narrow", "label": "Tall and narrow", "note": "Like a chimney.", "color": "warm" },
    { "id": "tall-wide", "label": "Tall and wide", "note": "Like a wardrobe.", "color": "green" },
    { "id": "short-narrow", "label": "Short and narrow", "note": "Like a brick.", "color": "amber" },
    { "id": "short-wide", "label": "Short and wide", "note": "Like a bench.", "color": "teal" }
  ],
  "items": [
    { "id": "red-box", "cell": "tall-wide", "label": "The red box" },
    { "id": "blue-box", "cell": "short-narrow", "label": "The blue box" } ],
  "copy": { "h": "Boxes", "p": "Pick the cell each box fits." } }
```
^boxes

> [!matrix|rate] How do you rate each shape?

- Circle
- Square

0. Not much
1. Somewhat
2. A lot

> [!group] A group with a question in it
> > [!text|in-group] What goes inside the group?

> [!group]- A folded group with a question in it
> Open it to answer.
>
> > [!choice|fold-q] Which of these is a box?
> - [ ] A carton
> - [ ] A cloud

> [!copy|walk-copy of:thoughts,steps] Copy my words
> A made-up lead-in for the walk.

> [!activity|tally repeat] A small tally

A repeating activity: each Finalize keeps a dated entry, and the query lists them, newest first.

> [!number|folded min:0] How many did you fold this time?

> [!text|remark] A word about it

```booklet query
from: tally
as: table
```

```booklet query
from: tally
as: bars
value: folded
limit: 7
```

```booklet query
from: tally
as: line
fields: folded
limit: 7
```

%%
> [!records] App record. Do not edit below this line

```booklet entries tally
{"items": [
{"ts":"2026-10-17T07:30:00Z","folded":3,"remark":"slow start"},
{"ts":"2026-10-18T07:30:00Z","folded":5,"remark":"a good run"},
{"ts":"2026-10-19T07:30:00Z","folded":2,"remark":"tired hands"},
{"ts":"2026-10-20T07:30:00Z","folded":6,"remark":"tidy table"},
{"ts":"2026-10-21T07:30:00Z","folded":4,"remark":"lost the ruler"},
{"ts":"2026-10-22T07:30:00Z","folded":7,"remark":"fresh paper"},
{"ts":"2026-10-23T07:30:00Z","folded":3,"remark":"quiet room"},
{"ts":"2026-10-24T07:30:00Z","folded":8,"remark":"long folds"},
{"ts":"2026-10-25T07:30:00Z","folded":5,"remark":"sharp edges"},
{"ts":"2026-10-26T07:30:00Z","folded":6,"remark":"two at once"},
{"ts":"2026-10-27T07:30:00Z","folded":2,"remark":"a late one"},
{"ts":"2026-10-28T07:30:00Z","folded":9,"remark":"last of the day"}
]}
```
%%
