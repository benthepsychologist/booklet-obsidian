---
booklet: "0.16"
id: booklet-test/garden-dashboards
title: Garden dashboards
lang: en
---

<!-- A made-up note for the 0.9.0 dashboards: every view of a query drawn over both kinds of source, the kept days of an activity and
     data blocks written by a generator. Nothing in it is about a real person. The records region below holds twelve made-up days. -->

> [!activity|log repeat daily] Garden log

A made-up daily log of sleep, focus, mood and a verdict on the day. The other activities read its twelve kept days.

> [!number|sleep min:0 max:14] Hours slept

> [!number|focus min:0 max:14] Hours of focused work

> [!scale|mood] Mood

1. Low
2. Okay
3. Good
4. Bright

> [!choice|verdict] Verdict on the day
- [ ] good
- [ ] warn
- [ ] bad

> [!text|note] One line about the day

> [!activity|shed repeat] Shed tools

> [!multi|tools] Which tools did you use?
- [ ] Spade
- [ ] Fork
- [ ] Shears

> [!number|uses each:tools min:0] Times used

> [!activity|bars] Bars

Seven kept days as bars, the verdict as the tone:

```booklet query
from: log
as: bars
value: sleep
tone: verdict
limit: 7
```

Twelve jobs from a data block, one with a very long label:

```booklet query
from: chores
as: bars
label: job
value: hrs
tone: tone
```

The tools used, one bar for each tool (a question asked for each pick):

```booklet query
from: uses
as: bars
```

> [!activity|lines] Lines

Two fields over the last seven days:

```booklet query
from: log
as: line
fields: sleep, focus
limit: 7
```

One field, all twelve days (the mood is a scale, so its number is plotted):

```booklet query
from: log
as: line
fields: mood
```

A data block as a line (jobs by hours):

```booklet query
from: chores
as: line
label: job
fields: hrs
empty: No jobs yet.
```

> [!activity|kept] Kept days

The kept days in each view:

```booklet query
from: log
as: table
fields: date, sleep, focus, mood, verdict, note
badge: verdict
tone: verdict
```

```booklet query
from: log
as: list
label: date
value: sleep
note: note
limit: 5
```

```booklet query
from: log
as: cards
limit: 3
```

```booklet query
from: log
as: tiles
label: date
value: mood
tone: verdict
limit: 6
```

> [!activity|data] Data as a source

A data block as a list, grouped by month, with pills, tones, a link, a picture and a note:

```booklet query
from: chores
as: list
label: job
value: hrs
note: what
badge: state
tone: tone
link: go
icon: pic
group: when
```

As a table, with the declared headings:

```booklet query
from: chores
as: table
fields: job, state, hrs, what
badge: state
tone: tone
link: go
icon: pic
group: when
```

As cards, then as tiles:

```booklet query
from: chores
as: cards
label: job
value: hrs
note: what
badge: state
tone: tone
limit: 4
```

```booklet query
from: chores
as: tiles
label: job
value: hrs
tone: tone
limit: 6
```

A nested list: the rows with a parent sit under it, shut until opened:

```booklet query
from: plan
as: list
label: job
value: hrs
badge: state
parent: parent
```

Tiles of the tools used, one for each tool:

```booklet query
from: uses
as: tiles
```

Nothing to draw:

```booklet query
from: nothing
as: list
empty: No rows in this block.
```

```booklet data
{
 "fields": {
  "job": "Job",
  "when": "When",
  "state": "State",
  "hrs": "Hours",
  "tone": "Tone",
  "go": "Link",
  "pic": "Picture",
  "what": "Detail"
 },
 "rows": [
  {
   "job": "Spring beds",
   "when": "March",
   "state": [
    "open",
    "blocked"
   ],
   "hrs": 12,
   "tone": "warn",
   "go": "#Bars",
   "pic": "sprout",
   "what": "Needs compost"
  },
  {
   "job": "Dig bed one",
   "when": "March",
   "state": "done",
   "hrs": 3,
   "tone": "good",
   "go": "https://example.org/dig",
   "pic": "sun"
  },
  {
   "job": "Dig bed two",
   "when": "April",
   "state": "open",
   "hrs": 4.5,
   "tone": "bad",
   "go": "javascript:alert(1)",
   "pic": "not-an-icon",
   "what": "Soil is heavy"
  },
  {
   "job": "Mend the fence",
   "when": "April",
   "state": "done",
   "hrs": 2,
   "tone": "good",
   "pic": "hammer"
  },
  {
   "job": "Orphan row",
   "when": "April"
  },
  {
   "job": "Repaint the potting shed door, the side gate and the two window frames before the first frost",
   "when": "May",
   "state": [
    "open",
    "needs paint"
   ],
   "hrs": 14,
   "tone": "warn",
   "pic": "palette",
   "what": "Two coats"
  },
  {
   "job": "Plant garlic",
   "when": "May",
   "state": "open",
   "hrs": 1.5,
   "pic": "leaf"
  },
  {
   "job": "Clear the gutters",
   "when": "May",
   "state": "done",
   "hrs": 1,
   "tone": "good",
   "pic": "check"
  },
  {
   "job": "Order mulch",
   "when": "June",
   "state": "blocked",
   "hrs": 0.5,
   "tone": "bad",
   "pic": "calendar",
   "what": "Supplier is closed"
  },
  {
   "job": "Net the berries",
   "when": "June",
   "state": "open",
   "hrs": 2,
   "tone": "warn",
   "pic": "bug"
  },
  {
   "job": "Turn the compost",
   "when": "June",
   "state": "done",
   "hrs": 3,
   "tone": "good",
   "pic": "leaf"
  },
  {
   "job": "Sharpen the shears",
   "when": "June",
   "state": "open",
   "hrs": 0.5,
   "pic": "scissors"
  }
 ]
}
```
^chores

```booklet data
{
 "rows": [
  {
   "id": "season",
   "job": "Spring planting",
   "state": "open",
   "hrs": 20
  },
  {
   "id": "beds",
   "job": "Prepare the beds",
   "parent": "season",
   "state": "open",
   "hrs": 9
  },
  {
   "id": "dig",
   "job": "Dig the beds",
   "parent": "beds",
   "state": "done",
   "hrs": 5
  },
  {
   "id": "feed",
   "job": "Feed the soil",
   "parent": "beds",
   "state": "open",
   "hrs": 4
  },
  {
   "id": "sow",
   "job": "Sow the seed",
   "parent": "season",
   "state": "open",
   "hrs": 11
  },
  {
   "id": "peas",
   "job": "Sow the peas",
   "parent": "sow",
   "state": "done",
   "hrs": 2
  },
  {
   "id": "beans",
   "job": "Sow the beans",
   "parent": "sow",
   "state": "open",
   "hrs": 3
  },
  {
   "id": "water",
   "job": "Water in",
   "parent": "sow",
   "state": "open",
   "hrs": 6
  },
  {
   "id": "tidy",
   "job": "Tidy the shed",
   "state": "done",
   "hrs": 2
  },
  {
   "id": "lost",
   "job": "A job whose parent is not a row",
   "parent": "nowhere",
   "state": "open",
   "hrs": 1
  }
 ]
}
```
^plan
```booklet data
{
 "rows": []
}
```
^nothing

%%
> [!records] App record. Do not edit below this line

```booklet entries log
{"items": [
{"ts":"2026-10-17T07:30:00Z","sleep":6,"focus":2,"mood":1,"verdict":3,"note":"rain all morning"},
{"ts":"2026-10-18T07:30:00Z","sleep":7.5,"focus":3,"mood":2,"verdict":2},
{"ts":"2026-10-19T07:30:00Z","sleep":6,"focus":0,"mood":3,"verdict":1,"note":"good light in the garden"},
{"ts":"2026-10-20T07:30:00Z","sleep":5,"focus":4,"mood":2,"verdict":2,"note":"late coffee"},
{"ts":"2026-10-21T07:30:00Z","sleep":8,"focus":1,"mood":3,"verdict":1,"note":"slept well"},
{"ts":"2026-10-22T07:30:00Z","sleep":7,"focus":3,"mood":4,"verdict":1,"note":"long walk"},
{"ts":"2026-10-23T07:30:00Z","sleep":6.5,"focus":2,"mood":3,"verdict":2},
{"ts":"2026-10-24T07:30:00Z","sleep":4.5,"focus":0,"mood":1,"verdict":3,"note":"woke twice"},
{"ts":"2026-10-25T07:30:00Z","sleep":7,"focus":5,"mood":2,"verdict":1,"note":"bright and calm"},
{"ts":"2026-10-26T07:30:00Z","sleep":8,"focus":2,"mood":4,"verdict":1},
{"ts":"2026-10-27T07:30:00Z","sleep":5.5,"focus":1,"mood":2,"verdict":2,"note":"busy day"},
{"ts":"2026-10-28T07:30:00Z","sleep":7,"focus":4,"mood":3,"verdict":1,"note":"quiet evening"}
]}
```

```booklet entries shed
{"items": [
{"ts":"2026-10-26T07:30:00Z","tools":[1,2],"uses":[{"pick":1,"a":3},{"pick":2,"a":1}]},
{"ts":"2026-10-27T07:30:00Z","tools":[1,3],"uses":[{"pick":1,"a":5},{"pick":3,"a":2}]},
{"ts":"2026-10-28T07:30:00Z","tools":[2,3],"uses":[{"pick":2,"a":4},{"pick":3,"a":1}]}
]}
```
%%
