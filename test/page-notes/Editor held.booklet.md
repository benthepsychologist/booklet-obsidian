---
booklet: "0.20"
id: local/made-up
title: A made-up booklet
lang: en
version: "0.1"
---

> [!module|mood] Mood

> [!activity|log repeat] A mood log

> [!choice|feeling] How do you feel?
- [ ] Calm
- [ ] Tense
- [ ] Low

> [!text|why] Why?

> [!activity|once] Said once

> [!scale|energy] How much energy?

0. None
1. Some
2. Lots

```booklet data
{ "fields": { "title": "Title", "kind": "Kind", "done": "Done" },
  "rows": [{"id":"a","title":"Water the plants","kind":"chore","done":"no"},{"id":"b","title":"Write the report","kind":"work","done":"no"},{"id":"c","title":"Call a friend","kind":"people","done":"yes"},{"id":"d","title":"Walk","kind":"health","done":"yes"},{"id":"e","title":"Read","kind":"health","done":"no"}] }
```
^things

```booklet query
from: things
as: table
```

> [!module|mood end]

%%
> [!records] App record — do not edit below this line

> [!records|mood] Mood

```booklet answers
{ "energy": 2 }
```

```booklet entries log
{"items": [
{"ts": "2026-10-01T09:00:00Z", "feeling": 1, "why": "Day 1"},
{"ts": "2026-10-02T09:00:00Z", "feeling": 2, "why": "Day 2"},
{"ts": "2026-10-03T09:00:00Z", "feeling": 3, "why": "Day 3"},
{"ts": "2026-10-04T09:00:00Z", "feeling": 1, "why": "Day 4"},
{"ts": "2026-10-05T09:00:00Z", "feeling": 2, "why": "Day 5"},
{"ts": "2026-10-06T09:00:00Z", "feeling": 3, "why": "Day 6"},
{"ts": "2026-10-07T09:00:00Z", "feeling": 1, "why": "Day 7"},
{"ts": "2026-10-08T09:00:00Z", "feeling": 2, "why": "Day 8"},
{"ts": "2026-10-09T09:00:00Z", "feeling": 3, "why": "Day 9"},
{"ts": "2026-10-10T09:00:00Z", "feeling": 1, "why": "Day 10"},
{"ts": "2026-10-11T09:00:00Z", "feeling": 2, "why": "Day 11"},
{"ts": "2026-10-12T09:00:00Z", "feeling": 3, "why": "Day 12"}
]}
```

```booklet draft log
{ "why": "half a thought" }
```
%%
