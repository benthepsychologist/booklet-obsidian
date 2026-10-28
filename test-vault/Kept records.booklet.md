---
booklet: "0.16"
id: booklet-test/kept-records
title: Kept records
lang: en
---

> [!activity|warm-up] A warm-up

A made-up test note that already holds records, to show the plugin keeps every one of them.

> [!choice|colour] Pick a colour
- [ ] Red
- [ ] Green
- [ ] Blue

> [!text|why] Why that one?

> [!module|walks] Walks

> [!activity|walk-log repeat] Log a walk

> [!scale|pace] How fast was the walk?

1. Slow
2. Steady
3. Brisk

> [!text|where] Where did you go?

> [!activity|walk-review] Look back on the walks

> [!scale|enjoy] How much did you enjoy them?

0. Not at all
1. A little
2. A lot

> [!module|walks end] End of Walks

%%
> [!records] App record — do not edit below this line

```booklet answers
{
 "colour": 2
}
```

```booklet sync
{"by": "a made-up reader", "kept": "the plugin's test vault"}
```

> [!records|walks] Walks

```booklet entries walk-log
{"items": [
{"ts": "2026-10-20T18:00:00Z", "pace": 2, "where": "Along the made-up canal"},
{"ts": "2026-10-21T18:30:00Z", "pace": 3, "where": "Round the park and back"}
]}
```
%%
