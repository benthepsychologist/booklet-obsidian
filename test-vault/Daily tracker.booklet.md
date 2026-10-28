---
booklet: "0.16"
id: booklet-test/daily-tracker
title: Daily tracker
lang: en
---

> [!activity|evening-log repeat daily] Evening log

A made-up daily tracker for testing the Booklet plugin. Nothing in it is about a real person, and any answer will do. Finalize keeps today's entry; finalizing again the same day replaces it.

> [!choice|sky] What was the sky like?
- [ ] Clear
- [ ] Cloudy
- [ ] Rainy

> [!scale|busy] How busy was the day?

0. Quiet
1. Steady
2. Full
3. Packed

> [!number|pages min:0 max:500] How many pages did you read?

> [!date|next-walk] When is the next long walk?

> [!text|note] One line about the day

%%
> [!records] App record — do not edit below this line

```booklet entries evening-log
{"items": [
{"ts": "2026-10-24T19:40:00Z", "sky": 1, "busy": 1, "pages": 12, "note": "Read on the bench by the made-up pond."},
{"ts": "2026-10-25T20:05:00Z", "sky": 3, "busy": 2, "pages": 30, "next-walk": "2026-11-01"}
]}
```
%%
