---
booklet: "0.19"
id: example/garden-jobs
title: Garden jobs
lang: en
---

# Garden jobs

A small made-up desk for adding and removing rows. The jobs are written in this note; the beds are in `garden-jobs.json`, a file beside it. Everything is invented.

> [!module|desk] Garden jobs

> [!activity|work repeat] The desk

## Jobs, in this note

```booklet query
from: jobs
as: table
fields: title, stage
add
delete
```

## Beds, in the file

```booklet query
from: beds
as: list
label: title
add
delete
```

## The same beds, read only

```booklet query
from: beds
as: table
fields: title
```

```booklet data
{"fields":{"title":{"label":"Name","edit":"text"},"stage":{"label":"Stage","edit":"choice","options":["planning","growing"]},"jobs":"Jobs"},"idFormat":"j-{n}","rows":[{"id":"j-1","title":"Prune","stage":"growing","jobs":[{"id":"j-2","title":"Ladder"},{"id":"j-3","title":"Burn"}]},{"id":"j-4","title":"Stakes","stage":"planning"}]}
```
^jobs

```booklet data garden-jobs.json beds
```
^beds

> [!module|desk end]
