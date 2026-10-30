---
booklet: "0.17"
id: example/check-in-wiki
title: A calm check-in
lang: en
version: "0.1"
---

<!-- A made-up note for the page-trees tests (ahead of the format: format 0.17, not yet in SPEC). One activity with Ben's three tabs: a wiki
     (a tree of pages), the check-in's own questions, and a dashboard of what was kept. Every word and both widgets are made up. -->

> [!module|calm] A calm check-in

> [!activity|check-in repeat icon:notebook-pen] Calm check-in

Notice, name, keep. Nothing here needs fixing.

> [!tab|wiki] Learn

How the check-in fits together. Read the pages in any order: [[#The body map]], [[#The feelings grid]] and [[#Thoughts as headlines]].

> [!page|map icon:footprints] The body map

The figure is a map of where you notice something. There is nothing to find.

[[#Choosing a place]] says what to do when no place fits.

> [!page|parent:map] Choosing a place

Tap the place that comes nearest. If nothing fits, write it in *Something else* on the Check in tab.

> [!page|parent:map] Words for what you notice

Each place offers the same short list of words. A word of your own is offered again next time.

> [!page|grid icon:layout-grid] The feelings grid

The grid sorts feelings by two questions at once.

> [!page|parent:grid] The two axes

The top edge is more energy and the bottom edge is less.

***

A feeling can sit anywhere on the grid. Where it sits says nothing about whether it should be there.

> [!page|parent:grid] More than one at once

Two feelings from opposite corners can be there together. Pick both.

> [!page] Thoughts as headlines

Write what the mind is on as a headline: a few words, with no explanation.

> [!tab|quiz] Check in

> [!page] Your body

> [!widget|body] Body
> ![[#^body-map]]

> [!page] Your mind

> [!text|other] Something else
> In your own words.

> [!lines|thoughts] Mind is thinking about
> Short headlines. As many lines as you need.

> [!tab|dashboard] Past check-ins

The last seven days, newest first.

```booklet query
from: check-in
limit: 7 days
empty: Nothing kept in the past seven days.
```

> [!module|calm end] End of A calm check-in

> [!data|calm] Data for A calm check-in

```booklet widget
{ "engine": "svg-regions",
  "figures": [ { "id": "front", "label": "Front",
    "svg": "<svg viewBox=\"0 0 100 200\"><circle class=\"rg\" data-r=\"head\" cx=\"50\" cy=\"25\" r=\"20\"/><rect class=\"rg\" data-r=\"chest\" x=\"25\" y=\"50\" width=\"50\" height=\"60\"/></svg>",
    "regions": ["head", "chest"] } ],
  "regions": [ { "id": "head", "label": "Head" }, { "id": "chest", "label": "Chest" } ],
  "senses": [ { "id": "felt", "label": "What it is like",
    "words": [ { "id": "felt:0", "label": "tight" }, { "id": "felt:1", "label": "warm" } ] } ],
  "copy": { "h": "Body", "p": "Tap wherever you notice something, then pick the words that fit." } }
```
^body-map
