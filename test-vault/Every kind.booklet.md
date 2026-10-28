---
booklet: "0.16"
id: booklet-test/every-kind
title: Every kind
lang: en
---

> [!activity|kinds] Every kind of question

A made-up test note with one question of each kind the Booklet plugin draws. Nothing in it is about a real person, and any answer will do.

> [!choice|fruit] Which fruit would you pack?
> Pick one.
- [ ] Apple
  - A good one for a long day out.
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

> [!activity|shared] A shared list and a widget

A question whose options come from a shared menu, and a grid of cells to press.

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

> [!activity|not-yet] Parts not drawn yet

The parts below are in the format and are not drawn by the plugin yet. Each one says so.

> [!matrix|rate] How do you rate each shape?

- Circle
- Square

0. Not much
1. Somewhat
2. A lot

> [!group] A group with a question in it
> > [!text|in-group] What goes inside the group?

> [!tab|second] A second tab

Text under the second tab.

***

Text on a second page.

> [!activity|tally repeat] A small tally

A repeating activity: each Finalize keeps a dated entry. The query under the question lists them, newest first.

> [!number|folded min:0] How many did you fold this time?

```booklet query
from: tally
as: list
```
