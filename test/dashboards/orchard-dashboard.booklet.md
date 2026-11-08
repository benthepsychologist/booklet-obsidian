---
booklet: "0.20"
id: example/orchard-dashboard
title: Orchard and garden desk
lang: en
---

# Orchard and garden desk

A small example of a dashboard. The booklet holds the pages and says how to draw
them. The rows come from `orchard-dashboard.json`, a file beside it that
something else writes and rewrites. Everything is invented.

> [!module|desk] Orchard and garden desk

> [!activity|orchard repeat] The desk

## Plots and their jobs

One table. A plot opens to its text and then its jobs, and a job opens to its steps.
`Name`, `Stage` and `Due` can be edited where they stand, and the second table below
reads the same rows and cannot.

```booklet query
from: plots
as: table
fields: title, kind, stage, open, due, notes
```

> [!text|notes each:plots long] A note for the gardener

## A read-only roundup

The same rows again, with every field locked. Two views of one set of rows can differ,
because `readonly` is a line of the query and not part of the data.

```booklet query
from: plots
as: cards
label: title
note: about
fields: stage, due
readonly
```

## Harvest

```booklet query
from: harvest
as: bars
label: fruit
value: kilos
```

## Questions for you

Each request opens to the question asked of it.

```booklet query
from: requests
as: list
label: title
note: headline
badge: gate
fields: asked, decision
```

> [!choice|decision each:requests] Your call
- [ ] Yes
- [ ] No
- [ ] Ask me again next week

> [!text|reply each:requests long] A word of reply

```booklet data orchard-dashboard.json plots
```
^plots

```booklet data orchard-dashboard.json harvest
```
^harvest

```booklet data orchard-dashboard.json inbox.requests
```
^requests

> [!module|desk end]
