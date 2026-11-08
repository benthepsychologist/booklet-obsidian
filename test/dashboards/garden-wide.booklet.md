---
booklet: "0.20"
id: example/garden-wide
title: Garden wide
lang: en
---

# Garden wide

A made-up desk with a table wider than a phone, to see that Remove can be reached and pressed there. Everything is invented.

> [!module|desk] Garden wide

> [!activity|work repeat] The desk

## A wide table

```booklet query
from: tasks
as: table
fields: title, stage, owner, due, size
add
delete
```

## The same rows as a list

```booklet query
from: tasks
as: list
label: title
add
delete
```

## The same rows as cards

```booklet query
from: tasks
as: cards
label: title
fields: stage, owner, due
add
delete
```

```booklet data
{"fields":{"title":{"label":"Name","edit":"text"},"stage":{"label":"Stage","edit":"choice","options":["planning","growing"]},"owner":{"label":"Owner","edit":"text"},"due":{"label":"Due date"},"size":{"label":"Hours","edit":"number"},"jobs":"Jobs"},"idFormat":"t-{n}","rows":[{"id":"t-1","title":"Replace the greenhouse glazing","stage":"growing","owner":"Marguerite","due":"2026-12-01","size":12,"jobs":[{"id":"t-2","title":"Order panes","stage":"planning","owner":"Marguerite","due":"2026-11-20","size":2},{"id":"t-3","title":"Remove old panes","stage":"planning","owner":"Idris","due":"2026-11-27","size":3}]},{"id":"t-4","title":"Dig the new bed","stage":"planning","owner":"Idris","due":"2026-12-15","size":8}]}
```
^tasks

> [!module|desk end]
