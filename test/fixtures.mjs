/*
 * The made-up notes the tests (and the Obsidian scripts in e2e-tests/) use, as plain strings. Nothing here is read from disk, and nothing
 * about a real person is in any of them. Each is a whole note: a test that needs a smaller one writes its own inline.
 *
 * fixtureFiles() lists them as { path, text } with the paths they have in a vault (a script writes them to a folder to open that
 * folder in Obsidian). The two .json files are the data files that two of the notes read from beside them.
 */

/** A repeating activity with a grid, a body map, a question asked for each pick, and a query of the week. */
export const CHECKIN = `---
booklet: "0.20"
id: booklet-test/check-in
title: Check-in
lang: en
---

# Check-in

A made-up check-in for testing the Booklet plugin. Nothing in it is about a real person, and any answer will do.

> [!module|day-check] A short check-in

Five short questions about the day, kept once a day. Finalizing again the same day replaces that day's entry.

> [!activity|today repeat daily] Today

Take a moment. There are no right answers here.

> [!widget|places] Where do you notice it?
> ![[#^body-places]]

> [!widget|feelings] How do you feel?
> ![[#^feelings-grid]]

> [!multi|felt each:feelings open menu:body-parts] Where do you feel it?
> Press the places that fit, for each feeling you picked. Add a place of your own if it is not listed.

> [!multi|where open menu:spots] Where were you today?

> [!lines|thoughts earlier:12] What is on your mind?

> [!activity|week] This week

The past seven days of check-ins, worked out each time the page is drawn. Nothing here is saved.

\`\`\`booklet query
from: today
limit: 7 days
summary: on
fields: feelings, felt
\`\`\`

The week's thoughts:

\`\`\`booklet query
from: today
limit: 7 days
fields: thoughts
\`\`\`

> [!module|day-check end] End of A short check-in

> [!data|day-check] Data for A short check-in

\`\`\`booklet widget
{ "engine": "svg-regions",
  "regions": [
    { "id": "head", "label": "Head" },
    { "id": "jaw", "label": "Jaw" },
    { "id": "neck", "label": "Neck" },
    { "id": "shoulders", "label": "Shoulders" },
    { "id": "chest", "label": "Chest" },
    { "id": "arms", "label": "Arms" },
    { "id": "hands", "label": "Hands" },
    { "id": "stomach", "label": "Stomach" },
    { "id": "back", "label": "Back" },
    { "id": "legs", "label": "Legs" },
    { "id": "feet", "label": "Feet" } ],
  "senses": [
    { "id": "temperature", "label": "Temperature", "words": [
      { "id": "warm", "label": "Warm" },
      { "id": "cool", "label": "Cool" } ] },
    { "id": "pressure", "label": "Pressure", "words": [
      { "id": "tight", "label": "Tight" },
      { "id": "heavy", "label": "Heavy" },
      { "id": "loose", "label": "Loose" } ] },
    { "id": "movement", "label": "Movement", "words": [
      { "id": "tingling", "label": "Tingling" },
      { "id": "restless", "label": "Restless" },
      { "id": "still", "label": "Still" } ] } ],
  "chips": ["head", "jaw", "neck", "shoulders", "chest", "arms", "hands", "stomach", "back", "legs", "feet"],
  "copy": {
    "h": "Places",
    "p": "Press a place, then say what it is like there.",
    "pick": "Press any words that fit, or add words of your own.",
    "clear": "Clear this place",
    "none": "Press a place above to begin." } }
\`\`\`
^body-places

\`\`\`booklet widget
{ "engine": "grid-select",
  "axes": { "top": "more energy", "bottom": "less energy", "left": "less pleasant", "right": "more pleasant" },
  "cells": [
    { "id": "agitating", "label": "Agitating", "note": "Lots of energy, and not pleasant.", "color": "warm" },
    { "id": "invigorating", "label": "Invigorating", "note": "Lots of energy, and pleasant.", "color": "green" },
    { "id": "draining", "label": "Draining", "note": "Little energy, and not pleasant.", "color": "blue" },
    { "id": "soothing", "label": "Soothing", "note": "Little energy, and pleasant.", "color": "purple" }
  ],
  "items": [
    { "id": "rushed", "cell": "agitating", "label": "Rushed" },
    { "id": "tense", "cell": "agitating", "label": "Tense" },
    { "id": "lively", "cell": "invigorating", "label": "Lively" },
    { "id": "cheerful", "cell": "invigorating", "label": "Cheerful" },
    { "id": "flat", "cell": "draining", "label": "Flat" },
    { "id": "tired", "cell": "draining", "label": "Tired" },
    { "id": "settled", "cell": "soothing", "label": "Settled" },
    { "id": "content", "cell": "soothing", "label": "Content" } ],
  "copy": { "h": "Four kinds of feeling", "p": "Press the words that fit, in any of the four." } }
\`\`\`
^feelings-grid

> [!menu|spots]
- At home
- At work
- Outdoors
- Travelling

> [!menu|body-parts]
- Head
- Jaw
- Neck
- Shoulders
- Chest
- Arms
- Hands
- Stomach
- Back
- Legs
- Feet
`;

/** A daily tracker with two kept days. */
export const DAILY = `---
booklet: "0.20"
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

\`\`\`booklet entries evening-log
{"items": [
{"ts": "2026-10-24T19:40:00Z", "sky": 1, "busy": 1, "pages": 12, "note": "Read on the bench by the made-up pond."},
{"ts": "2026-10-25T20:05:00Z", "sky": 3, "busy": 2, "pages": 30, "next-walk": "2026-11-01"}
]}
\`\`\`
%%
`;

/** The smallest activity: a choice, a scale and a text. */
export const EVENING = `---
booklet: "0.20"
id: booklet-test/evening-check-in
title: Evening check-in
lang: en
---

> [!activity|evening] How was today?

This is a made-up test note for the Booklet plugin. Nothing in it is about a real person, and any answer will do.

> [!choice|feel] How did today feel?
- [ ] Rough
- [ ] Mixed
- [ ] Good

> [!scale|energy] How much energy is left?

0. None
1. A little
2. Some
3. Plenty
4. Lots

> [!text|note] One line about it
`;

/** One question of each kind, a shared menu, a widget, the parts not drawn yet, and a repeating tally. */
export const EVERY_KIND = `---
booklet: "0.20"
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

\`\`\`booklet widget
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
\`\`\`
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

\`\`\`booklet query
from: tally
as: list
\`\`\`
`;

/** A note that already holds answers and entries. */
export const KEPT = `---
booklet: "0.20"
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

\`\`\`booklet answers
{
 "colour": 2
}
\`\`\`

\`\`\`booklet sync
{"by": "a made-up reader", "kept": "the plugin's test vault"}
\`\`\`

> [!records|walks] Walks

\`\`\`booklet entries walk-log
{"items": [
{"ts": "2026-10-20T18:00:00Z", "pace": 2, "where": "Along the made-up canal"},
{"ts": "2026-10-21T18:30:00Z", "pace": 3, "where": "Round the park and back"}
]}
\`\`\`
%%
`;

/** The sampler the navigation tests open: modules, tabs, pages, a notice and a daily activity. */
export const SKETCH = `---
booklet: "0.20"
id: nav-proto/sketching
title: Learning to sketch
lang: en
---

# Learning to sketch

A made-up booklet for trying out how a booklet moves in Obsidian. Nothing in it is about a real person.

Start with the warm-up, then take the parts in any order.

> [!activity|warm-up icon:pencil] Warm up
> Two minutes, before anything else

Loosen your hand with a page of circles and long lines.

> [!choice|warm-done] Did you fill the page?
- [ ] Yes
- [ ] Not yet

> [!module|basics icon:shapes] The basics

Lines, boxes and light, one at a time, at your own pace.

> [!notice]
> license: Made up for testing; free to copy.
> copyright: Example Press, 2026
> source: https://example.org/sketching
> version: 0.3

> [!tab] Practice

Do these with a pencil and cheap paper.

> [!tab|read] Read first

Short readings to come back to.

> [!activity|lines icon:ruler] Lines that hold
> 3 pages · about 10 minutes

A line drawn fast comes out straighter than a line drawn slowly.

Put two dots on the page and join them in one stroke.

***

## Hold the pencil loosely

Hold it further from the tip than you would to write. Let the elbow move, not the wrist.

> [!scale|steady] How steady were your lines?

1. Wobbly
2. Mostly straight
3. Straight

***

## Ten in a row

Draw ten lines between ten pairs of dots. If a line wobbles, see [[#Hold the pencil loosely]] again.

> [!text|lines-note] What changed between the first line and the tenth?

> [!activity|shapes icon:box tab:practice] Boxes and cylinders

Most things are a box or a cylinder underneath.

> [!tab] Boxes

Draw a box from three lines that meet at a corner.

> [!choice|box-ok] Does it look solid?
- [ ] Yes
- [ ] Not yet

***

Now draw the same box seen from below, as if it sat on a high shelf.

> [!tab] Cylinders

A cylinder is two ellipses joined by two lines.

> [!text|cyl-note] Where did the ellipse go wrong, if it did?

> [!activity|light icon:sun tab:read status:off] Where the light falls

One light, one object, and the shapes the light makes on it.

> [!page|shadow icon:moon] Cast shadows

The shadow falls away from the light, on the ground.

> [!page|reflected parent:shadow] Reflected light

Light bounces back up from the table into the shadow side.

> [!module|basics end] End of The basics

> [!module|journal icon:notebook-pen] A sketch a day

One small sketch a day, kept with its date.

> [!activity|today repeat daily icon:calendar] Today's sketch

> [!text|subject] What did you draw?

> [!scale|enjoyed] How did it go?

1. Hard going
2. All right
3. Good

> [!activity|studies] 🌳 Seven studies

One study for each day of a week, each on a tab of its own.

> [!tab] Hands

Your own hand, open, then closed.

> [!tab] Cups

A cup from above and from the side.

> [!tab] Trees

One tree, only its outline.

> [!tab] Faces

A face in five lines.

> [!tab] Shoes

A shoe, as boxes first.

> [!tab] Chairs

A chair, as a box with legs.

> [!tab] Clouds

A cloud, in soft shading only.

> [!module|journal end] End of A sketch a day
`;

/** The reading kinds, sources, rows, groups and steps. */
export const READING = `---
booklet: "0.20"
id: booklet-test/reading
title: Reading and steps
lang: en
---

# Reading and steps

A made-up booklet for testing how the Booklet plugin draws the reading kinds, sources, rows, groups and steps. Nothing in it is about a real person, and any answer will do.

> [!activity|sources] Reading kinds and sources

Most harbours see two high tides each lunar day.[^atlas-12] A second source is a plain reference.[^leaflet]

> [!diff] Your guide says the tide turns every six hours
> The guide rounds it off. High water comes a little later each day.[^atlas-12]

> [!law] The rule as it stands
> Tide tables give their times in local time.

> [!opinion] One author's view
> The old paper charts were easier to read than the screens.

> [!tip] A tip that holds a question
> A tip may hold a question.
>
> > [!choice|tip-q] Which of these is a tide?
> - [ ] Rising water
> - [x] A sandwich

[^atlas-12]: *The Harbour Tide Atlas*, 2nd edition (2019), p. 12: "The tide rises and falls twice in each lunar day." Verified 2026-09-20.
[^leaflet]: The harbour office's leaflet, spring 2026.

> [!activity|rows] Things side by side

> [!row]

### Spring tides

Large, near the new and the full moon.

### Neap tides

Small, near the quarter moons.

> [!text|neap-note] Say what you notice about neap tides

> [!row|end]

> [!activity|lesson] A lesson in steps

Read this before the steps. It stays above every one of them.

> [!group] Step one: the moon
> The moon pulls the sea towards it.
>
> > [!choice|moon] What pulls the tides most?
> > Pick one.
> - [ ] The moon
>   - Yes, the moon.
> - [ ] The wind

> [!group] Step two: the sun
> The sun pulls too, with less effect.
>
> > [!scale|sun] How sure are you of that?
>
> 0. Not at all
> 1. A bit
> 2. Quite
>
> > [!text|sun-note] Say it in your own words

> [!group] Step three: put it together
> Spring tides come when the sun and the moon line up.

> [!group]- Extra reading
> A folded group, for anyone who wants more.
>
> > [!text|extra] Anything to add?

> [!activity|plain] A page with one group

> [!group]- One group on its own
> A group alone is no step; it is drawn where it stands, and folded when written so.
>
> > [!text|alone] A question in a lone group

> [!activity|around] A row around a group

> [!row]

### The group side

Words before the group.

> [!group] A group in a cell
> It holds a question.
>
> > [!choice|around-q] Does it show?
> - [ ] Yes
> - [ ] No

### The tip side

> [!tip] A tip in a cell
> It holds a question too.
>
> > [!text|around-tip] Say what you see

> [!row|end]

Words after the row.
`;

/** Marked answers, a matrix, and questions asked for each pick. */
export const QUIZ = `---
booklet: "0.20"
id: booklet-test/study-quiz
title: Study quiz
lang: en
---

# Study quiz

A made-up quiz for testing how the Booklet plugin marks answers right and wrong, draws a matrix, and asks a question for each pick. Nothing in it is about a real person, and any answer will do.

> [!activity|marked] Right and wrong

Pick an answer and the question says whether it was right, with a reply for the option you picked.

> [!choice|flyer] Which of these can fly?
> Pick one.
- [ ] A penguin
  - Penguins swim instead of flying.
- [x] A sparrow
  - A sparrow flies, like most small birds.
- [ ] An ostrich
  - An ostrich runs.

> [!multi|primaries] Which are primary colours of paint?
> Pick every one that is, then press Check.
- [x] Red
  - Red is one of the three.
- [ ] Green
  - Green is made by mixing yellow and blue.
- [x] Blue
- [x] Yellow
- [ ] Purple

> [!choice|drink] Which would you rather have? Nothing here is marked.
- [ ] Tea
  - A fine choice.
- [ ] Coffee

> [!activity|grid-quiz] A matrix

> [!matrix|topics] How sure are you of each topic?
> One answer for each topic.

- Spring tides
- Neap tides
- Tidal range

0. Not yet
1. Getting there
2. Sure

> [!activity|each-quiz] Asked for each pick

> [!multi|crops] Which crops did you grow?
- [ ] Carrot
- [ ] Beans
- [ ] Potato

> [!choice|crop-where each:crops] Where does it grow?
> Pick one for each crop.
- [ ] Under the ground
  - The part you eat is under the ground.
- [x] Above the ground
  - The part you eat is above the ground.

> [!scale|crop-rate each:crops] How did it do?

0. Badly
1. Fairly
2. Well

> [!text|crop-note each:crops] A note on it

> [!matrix|crop-pests each:crops] How bad was each pest?

- Slugs
- Birds

0. None
1. A few
2. Many
`;

/** A note with no `booklet:` key. */
export const ORDINARY = `# Ordinary note

A made-up note with no \`booklet:\` key in its front matter. It should open in Obsidian's own Markdown view, as any note does.

- One
- Two
`;

/** A desk of rows to add and remove, in the note and in a file. */
export const DASH_JOBS = `---
booklet: "0.20"
id: example/garden-jobs
title: Garden jobs
lang: en
---

# Garden jobs

A small made-up desk for adding and removing rows. The jobs are written in this note; the beds are in \`garden-jobs.json\`, a file beside it. Everything is invented.

> [!module|desk] Garden jobs

> [!activity|work repeat] The desk

## Jobs, in this note

\`\`\`booklet query
from: jobs
as: table
fields: title, stage
add
delete
\`\`\`

## Beds, in the file

\`\`\`booklet query
from: beds
as: list
label: title
add
delete
\`\`\`

## The same beds, read only

\`\`\`booklet query
from: beds
as: table
fields: title
\`\`\`

\`\`\`booklet data
{"fields":{"title":{"label":"Name","edit":"text"},"stage":{"label":"Stage","edit":"choice","options":["planning","growing"]},"jobs":"Jobs"},"idFormat":"j-{n}","rows":[{"id":"j-1","title":"Prune","stage":"growing","jobs":[{"id":"j-2","title":"Ladder"},{"id":"j-3","title":"Burn"}]},{"id":"j-4","title":"Stakes","stage":"planning"}]}
\`\`\`
^jobs

\`\`\`booklet data garden-jobs.json beds
\`\`\`
^beds

> [!module|desk end]
`;

/** The file beside the garden-jobs desk. */
export const JOBS_JSON = `{"beds":{"fields":{"title":{"label":"Name","edit":"text"}},"idFormat":"ID-{field:title}","rows":[{"id":"ID-herbs","title":"Herbs"},{"id":"ID-beans","title":"Beans"},{"id":"ID-leeks","title":"Leeks"}]}}`;

/** A table wider than a phone. */
export const DASH_WIDE = `---
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

\`\`\`booklet query
from: tasks
as: table
fields: title, stage, owner, due, size
add
delete
\`\`\`

## The same rows as a list

\`\`\`booklet query
from: tasks
as: list
label: title
add
delete
\`\`\`

## The same rows as cards

\`\`\`booklet query
from: tasks
as: cards
label: title
fields: stage, owner, due
add
delete
\`\`\`

\`\`\`booklet data
{"fields":{"title":{"label":"Name","edit":"text"},"stage":{"label":"Stage","edit":"choice","options":["planning","growing"]},"owner":{"label":"Owner","edit":"text"},"due":{"label":"Due date"},"size":{"label":"Hours","edit":"number"},"jobs":"Jobs"},"idFormat":"t-{n}","rows":[{"id":"t-1","title":"Replace the greenhouse glazing","stage":"growing","owner":"Marguerite","due":"2026-12-01","size":12,"jobs":[{"id":"t-2","title":"Order panes","stage":"planning","owner":"Marguerite","due":"2026-11-20","size":2},{"id":"t-3","title":"Remove old panes","stage":"planning","owner":"Idris","due":"2026-11-27","size":3}]},{"id":"t-4","title":"Dig the new bed","stage":"planning","owner":"Idris","due":"2026-12-15","size":8}]}
\`\`\`
^tasks

> [!module|desk end]
`;

/** A dashboard over a file beside the note. */
export const ORCHARD = `---
booklet: "0.20"
id: example/orchard-dashboard
title: Orchard and garden desk
lang: en
---

# Orchard and garden desk

A small example of a dashboard. The booklet holds the pages and says how to draw
them. The rows come from \`orchard-dashboard.json\`, a file beside it that
something else writes and rewrites. Everything is invented.

> [!module|desk] Orchard and garden desk

> [!activity|orchard repeat] The desk

## Plots and their jobs

One table. A plot opens to its text and then its jobs, and a job opens to its steps.
\`Name\`, \`Stage\` and \`Due\` can be edited where they stand, and the second table below
reads the same rows and cannot.

\`\`\`booklet query
from: plots
as: table
fields: title, kind, stage, open, due, notes
\`\`\`

> [!text|notes each:plots long] A note for the gardener

## A read-only roundup

The same rows again, with every field locked. Two views of one set of rows can differ,
because \`readonly\` is a line of the query and not part of the data.

\`\`\`booklet query
from: plots
as: cards
label: title
note: about
fields: stage, due
readonly
\`\`\`

## Harvest

\`\`\`booklet query
from: harvest
as: bars
label: fruit
value: kilos
\`\`\`

## Questions for you

Each request opens to the question asked of it.

\`\`\`booklet query
from: requests
as: list
label: title
note: headline
badge: gate
fields: asked, decision
\`\`\`

> [!choice|decision each:requests] Your call
- [ ] Yes
- [ ] No
- [ ] Ask me again next week

> [!text|reply each:requests long] A word of reply

\`\`\`booklet data orchard-dashboard.json plots
\`\`\`
^plots

\`\`\`booklet data orchard-dashboard.json harvest
\`\`\`
^harvest

\`\`\`booklet data orchard-dashboard.json inbox.requests
\`\`\`
^requests

> [!module|desk end]
`;

/** The file beside the orchard dashboard (indented as a writer would leave it). */
export const ORCHARD_JSON = `{
  "plots": {
    "fields": {
      "title": { "label": "Name", "edit": "text" },
      "kind": "Kind",
      "stage": { "label": "Stage", "edit": "choice", "options": ["planning", "growing", "resting", "done"] },
      "open": "Open jobs",
      "due": { "label": "Due", "edit": "date" },
      "about": { "label": "What it is", "edit": "long" },
      "jobs": "Jobs",
      "pickers": "Pickers",
      "notes": "Notes for the gardener"
    },
    "rows": [
      {
        "id": "p-orchard",
        "title": "Orchard",
        "kind": "Orchard",
        "stage": "growing",
        "open": 3,
        "due": "2026-11-20",
        "badge": "1 decision",
        "tone": "warn",
        "about": "Eight apple trees and two pear trees.\\n\\nThe pears were planted last spring and still need stakes.",
        "notes": [],
        "jobs": [
          {
            "id": "j-prune",
            "title": "Prune the apple trees",
            "kind": "Job",
            "stage": "growing",
            "due": "2026-11-20",
            "about": "Cut out crossing branches and open the middle of each tree.",
            "notes": [],
            "jobs": [
              { "id": "j-prune-ladder", "title": "Borrow the tall ladder", "kind": "Step", "stage": "planning", "due": "2026-11-15", "notes": [] },
              { "id": "j-prune-burn", "title": "Burn or chip the cuttings", "kind": "Step", "stage": "planning", "due": "2026-11-22", "notes": [] }
            ]
          },
          { "id": "j-stakes", "title": "Stake the young pears", "kind": "Job", "stage": "planning", "due": "2026-12-01", "about": "Two stakes per tree, tied loosely.", "notes": [] },
          { "id": "j-mulch", "title": "Mulch under every tree", "kind": "Job", "stage": "done", "due": "2026-10-30", "notes": [] }
        ]
      },
      {
        "id": "p-veg",
        "title": "Vegetable beds",
        "kind": "Garden",
        "stage": "resting",
        "open": 2,
        "due": "2026-12-10",
        "about": "Four raised beds beside the shed. Garlic goes in before the first hard frost.",
        "notes": [],
        "jobs": [
          { "id": "j-garlic", "title": "Plant the garlic", "kind": "Job", "stage": "doing", "due": "2026-11-12", "notes": [] },
          { "id": "j-compost", "title": "Spread the compost", "kind": "Job", "stage": "planning", "due": "2026-12-10", "notes": [] }
        ]
      },
      {
        "id": "p-shed",
        "title": "Tool shed",
        "kind": "Building",
        "stage": "done",
        "open": 0,
        "due": "",
        "about": "Roof mended in October.",
        "notes": []
      }
    ]
  },
  "harvest": {
    "fields": { "fruit": "Fruit", "kilos": "Kilos", "week": "Week" },
    "rows": [
      { "fruit": "Apples", "kilos": 120, "week": "2026-W40" },
      { "fruit": "Pears", "kilos": 18, "week": "2026-W40" },
      { "fruit": "Plums", "kilos": 9, "week": "2026-W38" }
    ]
  },
  "inbox": {
    "requests": [
      {
        "id": "b-ladder",
        "title": "Buy a ladder or borrow one?",
        "headline": "A tall ladder costs about the same as three days of hire",
        "gate": "buy",
        "asked": "2026-11-05",
        "decision": [],
        "reply": []
      },
      {
        "id": "b-hens",
        "title": "Keep hens in the orchard?",
        "headline": "Eggs and pest control, but they scratch the mulch",
        "gate": "plan",
        "asked": "2026-11-03",
        "decision": [],
        "reply": []
      }
    ]
  }
}
`;

/** A check-in with a wiki tab, a quiz tab and a dashboard tab. */
export const WIKI = `---
booklet: "0.20"
id: example/check-in-wiki
title: A calm check-in
lang: en
version: "0.1"
---

<!-- Made up: one activity with three tabs (a wiki, the questions, a dashboard of what was kept). -->

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

\`\`\`booklet query
from: check-in
limit: 7 days
empty: Nothing kept in the past seven days.
\`\`\`

> [!module|calm end] End of A calm check-in

> [!data|calm] Data for A calm check-in

\`\`\`booklet widget
{ "engine": "svg-regions",
  "figures": [ { "id": "front", "label": "Front",
    "svg": "<svg viewBox=\\"0 0 100 200\\"><circle class=\\"rg\\" data-r=\\"head\\" cx=\\"50\\" cy=\\"25\\" r=\\"20\\"/><rect class=\\"rg\\" data-r=\\"chest\\" x=\\"25\\" y=\\"50\\" width=\\"50\\" height=\\"60\\"/></svg>",
    "regions": ["head", "chest"] } ],
  "regions": [ { "id": "head", "label": "Head" }, { "id": "chest", "label": "Chest" } ],
  "senses": [ { "id": "felt", "label": "What it is like",
    "words": [ { "id": "felt:0", "label": "tight" }, { "id": "felt:1", "label": "warm" } ] } ],
  "copy": { "h": "Body", "p": "Tap wherever you notice something, then pick the words that fit." } }
\`\`\`
^body-map
`;

/** A copy callout. */
export const COPY_CALLOUT = `---
booklet: "0.20"
id: booklet-test/copy-callout
title: Tide notes
lang: en
---

> [!activity|tide-notes] Why two tides a day?

Write your answer in your own words, then press the button to copy the question, your answer and the model answer to the clipboard. This note is made up.

> [!text|why-twice long] Why does the tide come in twice a day?

> [!solution]- Model answer
> The moon pulls on the water on the side of the earth facing it, and a little less on the far side, so the sea bulges on both sides. The earth turns through both bulges each day.

> [!choice|which-moon] When is the range of the tide widest?
- [ ] At the quarter moons
- [ ] Near the new and the full moon

> [!hint]- Hint
> Think about when the sun and the moon pull in the same direction.

> [!copy|ask-tutor of:why-twice,why-twice/solution,which-moon,which-moon/hint,marking] Copy for my tutor
> Please mark my answer against the model answer. Say what I got right and what I missed, in three short sentences.

\`\`\`text
Marking notes: a full answer names the moon's pull and says there are two bulges. Give credit for either idea alone.
\`\`\`
^marking
`;

/** Every view of a query, twelve kept days, data blocks. */
export const GARDEN_DASHBOARDS = `---
booklet: "0.20"
id: booklet-test/garden-dashboards
title: Garden dashboards
lang: en
---

<!-- Made up: every view of a query over both kinds of source, twelve kept days and data blocks. -->

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

\`\`\`booklet query
from: log
as: bars
value: sleep
tone: verdict
limit: 7
\`\`\`

Twelve jobs from a data block, one with a very long label:

\`\`\`booklet query
from: chores
as: bars
label: job
value: hrs
tone: tone
\`\`\`

The tools used, one bar for each tool (a question asked for each pick):

\`\`\`booklet query
from: uses
as: bars
\`\`\`

> [!activity|lines] Lines

Two fields over the last seven days:

\`\`\`booklet query
from: log
as: line
fields: sleep, focus
limit: 7
\`\`\`

One field, all twelve days (the mood is a scale, so its number is plotted):

\`\`\`booklet query
from: log
as: line
fields: mood
\`\`\`

A data block as a line (jobs by hours):

\`\`\`booklet query
from: chores
as: line
label: job
fields: hrs
empty: No jobs yet.
\`\`\`

> [!activity|kept] Kept days

The kept days in each view:

\`\`\`booklet query
from: log
as: table
fields: date, sleep, focus, mood, verdict, note
badge: verdict
tone: verdict
\`\`\`

\`\`\`booklet query
from: log
as: list
label: date
value: sleep
note: note
limit: 5
\`\`\`

\`\`\`booklet query
from: log
as: cards
limit: 3
\`\`\`

\`\`\`booklet query
from: log
as: tiles
label: date
value: mood
tone: verdict
limit: 6
\`\`\`

> [!activity|data] Data as a source

A data block as a list, grouped by month, with pills, tones, a link, a picture and a note:

\`\`\`booklet query
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
\`\`\`

As a table, with the declared headings:

\`\`\`booklet query
from: chores
as: table
fields: job, state, hrs, what
badge: state
tone: tone
link: go
icon: pic
group: when
\`\`\`

As cards, then as tiles:

\`\`\`booklet query
from: chores
as: cards
label: job
value: hrs
note: what
badge: state
tone: tone
limit: 4
\`\`\`

\`\`\`booklet query
from: chores
as: tiles
label: job
value: hrs
tone: tone
limit: 6
\`\`\`

A nested list: the rows with a parent sit under it, shut until opened:

\`\`\`booklet query
from: plan
as: list
label: job
value: hrs
badge: state
parent: parent
\`\`\`

Tiles of the tools used, one for each tool:

\`\`\`booklet query
from: uses
as: tiles
\`\`\`

Nothing to draw:

\`\`\`booklet query
from: nothing
as: list
empty: No rows in this block.
\`\`\`

\`\`\`booklet data
{"fields": {"job": "Job", "when": "When", "state": "State", "hrs": "Hours", "tone": "Tone", "go": "Link", "pic": "Picture", "what": "Detail"},
"rows": [
 {"job": "Spring beds", "when": "March", "state": ["open", "blocked"], "hrs": 12, "tone": "warn", "go": "#Bars", "pic": "sprout", "what": "Needs compost"},
 {"job": "Dig bed one", "when": "March", "state": "done", "hrs": 3, "tone": "good", "go": "https://example.org/dig", "pic": "sun"},
 {"job": "Dig bed two", "when": "April", "state": "open", "hrs": 4.5, "tone": "bad", "go": "javascript:alert(1)", "pic": "not-an-icon", "what": "Soil is heavy"},
 {"job": "Mend the fence", "when": "April", "state": "done", "hrs": 2, "tone": "good", "pic": "hammer"},
 {"job": "Orphan row", "when": "April"},
 {"job": "Repaint the potting shed door, the side gate and the two window frames before the first frost", "when": "May", "state": ["open", "needs paint"], "hrs": 14, "tone": "warn", "pic": "palette", "what": "Two coats"},
 {"job": "Plant garlic", "when": "May", "state": "open", "hrs": 1.5, "pic": "leaf"},
 {"job": "Clear the gutters", "when": "May", "state": "done", "hrs": 1, "tone": "good", "pic": "check"},
 {"job": "Order mulch", "when": "June", "state": "blocked", "hrs": 0.5, "tone": "bad", "pic": "calendar", "what": "Supplier is closed"},
 {"job": "Net the berries", "when": "June", "state": "open", "hrs": 2, "tone": "warn", "pic": "bug"},
 {"job": "Turn the compost", "when": "June", "state": "done", "hrs": 3, "tone": "good", "pic": "leaf"},
 {"job": "Sharpen the shears", "when": "June", "state": "open", "hrs": 0.5, "pic": "scissors"}
]}
\`\`\`
^chores

\`\`\`booklet data
{"rows": [
 {"id": "season", "job": "Spring planting", "state": "open", "hrs": 20},
 {"id": "beds", "job": "Prepare the beds", "parent": "season", "state": "open", "hrs": 9},
 {"id": "dig", "job": "Dig the beds", "parent": "beds", "state": "done", "hrs": 5},
 {"id": "feed", "job": "Feed the soil", "parent": "beds", "state": "open", "hrs": 4},
 {"id": "sow", "job": "Sow the seed", "parent": "season", "state": "open", "hrs": 11},
 {"id": "peas", "job": "Sow the peas", "parent": "sow", "state": "done", "hrs": 2},
 {"id": "beans", "job": "Sow the beans", "parent": "sow", "state": "open", "hrs": 3},
 {"id": "water", "job": "Water in", "parent": "sow", "state": "open", "hrs": 6},
 {"id": "tidy", "job": "Tidy the shed", "state": "done", "hrs": 2},
 {"id": "lost", "job": "A job whose parent is not a row", "parent": "nowhere", "state": "open", "hrs": 1}
]}
\`\`\`
^plan
\`\`\`booklet data
{"rows": []}
\`\`\`
^nothing

%%
> [!records] App record. Do not edit below this line

\`\`\`booklet entries log
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
\`\`\`

\`\`\`booklet entries shed
{"items": [
{"ts":"2026-10-26T07:30:00Z","tools":[1,2],"uses":[{"pick":1,"a":3},{"pick":2,"a":1}]},
{"ts":"2026-10-27T07:30:00Z","tools":[1,3],"uses":[{"pick":1,"a":5},{"pick":3,"a":2}]},
{"ts":"2026-10-28T07:30:00Z","tools":[2,3],"uses":[{"pick":2,"a":4},{"pick":3,"a":1}]}
]}
\`\`\`
%%
`;

/** A small wiki as pages of one activity. */
export const HARBOUR = `---
booklet: "0.20"
id: "local/harbour-notes-pages"
title: Harbour notes
lang: en
version: "0.1"
---

<!-- Made up: a small wiki as pages of one activity; it opens on Tides, which has two pages under it. -->

> [!module|harbour icon:anchor] Harbour notes

> [!activity|notes icon:anchor] Harbour notes

> [!page|tides icon:waves] Tides

How the water moves. The two ranges are in [[#Spring tides]].

> [!page|spring parent:tides] Spring tides

The widest range, twice a month. Back to [[#Tides]].

> [!page|neap parent:tides] Neap tides

The narrowest range. Compare [[#Spring tides]].

> [!module|harbour end]
`;

/** One question of each kind, to walk through with the keyboard. */
export const KEYBOARD = `---
booklet: "0.20"
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

\`\`\`booklet widget
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
\`\`\`
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

\`\`\`booklet query
from: tally
as: table
\`\`\`

\`\`\`booklet query
from: tally
as: bars
value: folded
limit: 7
\`\`\`

\`\`\`booklet query
from: tally
as: line
fields: folded
limit: 7
\`\`\`

%%
> [!records] App record. Do not edit below this line

\`\`\`booklet entries tally
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
\`\`\`
%%
`;

/** A reference-style image. */
export const PICTURES = `---
booklet: "0.20"
id: booklet-test/pictures
title: Pictures
lang: en
---

<!-- Made up: the prose holds a reference-style image and the data section its definition. The image file is not here. -->

> [!activity|pictures] Pictures

A made-up harbour, drawn as a small shape: ![The harbour][harbour]

The same shape stands for the sea throughout this note.

> [!data] Data

[harbour]: images/shape.svg "A made-up shape"
`;

/** Audio, a video link and the listen question. */
export const TEA = `---
booklet: "0.20"
id: booklet-test/tea-course
title: Tea in three steps
description: A made-up three-unit course with local tones, one hosted episode, a video link and a short quiz in each unit.
lang: en
version: "0.1"
media-from:
  - https://media.tea-course.invalid
---

<!-- Made up: audio, video and the listen question. The host media.tea-course.invalid never answers, on purpose. -->

# Tea in three steps

Three short units on making a cup of tea. Each has something to listen to or watch, and a question or two.

![Welcome to the course][welcome]

> [!note]- Transcript
> A rising tone and then silence. This is a made-up welcome, and it has no words.

> [!module|unit-1] Unit 1: Choosing leaves

Loose leaves or bags, whole leaves or broken: the first step is the leaf.

> [!activity|u1-listen] Listen and check

> [!listen|u1-e1 left:1] Episode 1: Choosing leaves
> ![Episode 1: Choosing leaves](media/steep-1.wav "Choosing leaves")
> Listen to the whole tone, or to within a second of its end.

> [!note]- Transcript
> A steady middle tone, three seconds long. The made-up host says nothing; the tone stands for the episode.

> [!choice|u1-leaf] Which of these is a tea plant?
> Pick one.
- [ ] A mint plant
  - Mint makes a herbal infusion, not tea.
- [x] Camellia sinensis
  - Every true tea comes from this one plant.
- [ ] A chamomile plant
  - Chamomile makes a herbal infusion too.

> [!module|unit-1 end] End of Unit 1

> [!module|unit-2] Unit 2: Steeping

Water, time and a little patience.

> [!activity|u2-listen] Two episodes

> [!listen|u2-e1] Episode 2: Water and time
> ![Episode 2: Water and time](media/steep-2.wav)

> [!note]- Transcript
> A higher tone, two and a half seconds long.

> [!listen|u2-e2] Episode 3: A longer talk, from the course host
> ![Episode 3, from the course host](https://media.tea-course.invalid/unit-2/steeping.m4a)
> This one is a hosted file. It plays only after the host is allowed, and only after a press.

> [!note]- Transcript
> The host does not exist, so this transcript is all there is.

> [!activity|u2-check] Check your steeping

> [!scale|u2-time] How long do you usually steep black tea, in minutes?

1. One
2. Three
3. Five
4. Ten

> [!module|unit-2 end] End of Unit 2

> [!module|unit-3] Unit 3: Serving

Pouring, and what to do with the leaves.

Listen to a last tone here, written the way Obsidian writes a file embed:

![[media/steep-3.wav]]

> [!note]- Transcript
> A low tone, two seconds long.

> [!activity|u3-watch] Watch and think

> [!listen|u3-v1 left:60] Video: pouring from a height
> [Watch the pouring demonstration](https://www.youtube.com/watch?v=teaDemo0001)
> A video service keeps its player to itself, so this question has only a box to tick.

> [!multi|u3-extras] What can you add to a cup of tea?
> Pick every one that suits you.
- [ ] Milk
- [ ] Lemon
- [ ] Honey
- [ ] Nothing at all

> [!text|u3-note] What will you try first?

> [!module|unit-3 end] End of Unit 3

> [!data] Data

[welcome]: media/steep-3.wav "Welcome"
`;

/** Holds mistakes on purpose, for the opening notice and the gate. The linter reports errors in it, and it is left out of the corpus. */
export const TEA_PROBLEMS = `---
booklet: "0.20"
id: booklet-test/tea-course-problems
title: Tea course with problems
lang: en
media-from:
  - https://media.tea-course.invalid
  - https://media.tea-course.invalid/unit-2/
  - http://media.tea-course.invalid
---

<!-- Made up, with mistakes on purpose (the linter reports errors in it, so it is not in the corpus). One mistake to a line. -->

> [!activity|solo] One sitting

A link whose words are not its address (the view shows the real host after it): [https://bank.example.org](https://evil.tea-course.invalid/login)

A frame, which the view draws as a link and never loads:

<iframe src="https://video.tea-course.invalid/embed/1"></iframe>

Raw media tags, which are drawn as links in this view too:

<audio src="https://media.tea-course.invalid/raw.mp3"></audio>

<video src="https://media.tea-course.invalid/raw.mp4"></video>

> [!listen|bad-left left:abc] A left that is not whole seconds
> ![Tone](media/steep-1.wav)

> [!listen|two-embeds] Two embeds, of which only the first counts
> ![First](media/steep-1.wav)
> ![Second](media/steep-2.wav)

> [!listen|nothing] A listen with no embed and no link
> Only help words here.

> [!listen|remote-undeclared] An embed on a host the note does not declare
> ![Elsewhere](https://elsewhere.example.net/tone.mp3)

> [!activity|tea-log repeat] A tea log

> [!listen|log-listen] A listen in a repeat activity (kept as written, drawn without a tick)
> ![Tone](media/steep-2.wav)

> [!text|log-note] What did you drink?
`;

/** Every form of picture. */
export const PICTURES_DEMO = `---
booklet: "0.20"
id: booklet-test/pictures-demo
title: Pictures demo
lang: en
---

<!-- A made-up note for trying pictures in the Booklet view. Everything here is invented. -->

> [!activity|forms] Picture forms

Each line below should show a small picture, not the text in square brackets.

A file in a subfolder: ![The harbour][harbour]

A file with a space in its name, written inside angle brackets: ![A boat][boat]

A file beside this note, collapsed form: ![dot][]

A file in a subfolder, shortcut form: ![wave]

An inline drawing in the note itself: <svg width="40" height="24" viewBox="0 0 40 24"><rect width="40" height="24" fill="#cfe3f3"/><circle cx="20" cy="12" r="8" fill="#e07b39"/></svg>

A file that is not there (expect a broken picture, drawn with its words): ![Gone][gone]

Obsidian's own forms work too: ![[dot.png]] and ![A boat](my%20boat.png)

> [!activity|links] Links and selection

A link to another note: [[Other note]]. Click it, or Ctrl/Cmd+click for a new pane, or hold Ctrl/Cmd over it for the preview.

Select this sentence with the mouse or by pressing and holding on a phone, then copy it.

> [!choice|mood] How is this going?
- [ ] Fine
- [ ] Not sure

> [!data] Data

[harbour]: images/shape.svg "A made-up shape"
[boat]: <my boat.png>
[dot]: dot.png
[wave]: images/wave.png
[gone]: nothere.png
`;

/** Three tabs to walk through with a screen reader. */
export const SCREEN_READER = `---
booklet: "0.20"
id: booklet-test/screen-reader-walk
title: Screen reader walk
description: A made-up note for walking through the Booklet view with a screen reader. Every word is invented.
lang: en
media-from:
  - https://media.tea-course.invalid
---

<!-- Made up: three tabs (pages, one question of each kind, a tone). The media-from host never answers, on purpose: it only opens the Allow card. -->

> [!activity|walk icon:ear] Screen reader walk

A short made-up activity to walk through. Any answer will do.

> [!tab|read] Read

> [!page|start] The first page

This is the first of three pages. Use the Pages button to go to another one.

[[#The second page]] comes next, and [[#A page under it]] sits inside it.

> [!page|second] The second page

This is the second page. It has a page under it.

> [!page|parent:second] A page under it

This page is inside the second page, so it shows one level in.

> [!tab|answer] Answer

> [!page|choose] Choosing

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

> [!page|write] Writing

> [!text|thoughts long] Anything else about the plan?

> [!number|boxes min:0 max:20] How many boxes did you fold?

> [!date|day] When did you fold them?

> [!tab|listen] Listen

> [!listen|tone] A short tone
> ![A short tone](media/tone.wav "A short tone")
> Play it to the end, or to within a second of its end.

> [!note]- Transcript
> A steady middle tone, three seconds long. It has no words.

Another made-up clip, from a site that is not allowed yet:

![A made-up clip from another site](https://media.tea-course.invalid/clip.mp3)
`;

/** Every fixture as { path, text }: the path it has in a vault, and its text. */
export const fixtureFiles = () => [
	{ path: "Check-in.booklet.md", text: CHECKIN },
	{ path: "Daily tracker.booklet.md", text: DAILY },
	{ path: "Evening check-in.booklet.md", text: EVENING },
	{ path: "Every kind.booklet.md", text: EVERY_KIND },
	{ path: "Kept records.booklet.md", text: KEPT },
	{ path: "Learning to sketch.booklet.md", text: SKETCH },
	{ path: "Reading and steps.booklet.md", text: READING },
	{ path: "Study quiz.booklet.md", text: QUIZ },
	{ path: "Ordinary note.md", text: ORDINARY },
	{ path: "dashboards/garden-jobs.booklet.md", text: DASH_JOBS },
	{ path: "dashboards/garden-jobs.json", text: JOBS_JSON },
	{ path: "dashboards/garden-wide.booklet.md", text: DASH_WIDE },
	{ path: "dashboards/orchard-dashboard.booklet.md", text: ORCHARD },
	{ path: "dashboards/orchard-dashboard.json", text: ORCHARD_JSON },
	{ path: "page-notes/Check-in with a wiki.booklet.md", text: WIKI },
	{ path: "page-notes/Copy callout.booklet.md", text: COPY_CALLOUT },
	{ path: "page-notes/Garden dashboards.booklet.md", text: GARDEN_DASHBOARDS },
	{ path: "page-notes/Harbour notes.booklet.md", text: HARBOUR },
	{ path: "page-notes/Keyboard walk.booklet.md", text: KEYBOARD },
	{ path: "page-notes/Pictures.booklet.md", text: PICTURES },
	{ path: "page-notes/Listen demo/Tea course.booklet.md", text: TEA },
	{ path: "page-notes/Listen demo/Tea course with problems.booklet.md", text: TEA_PROBLEMS },
	{ path: "page-notes/Pictures demo/Pictures demo.booklet.md", text: PICTURES_DEMO },
	{ path: "page-notes/Screen reader walk/Screen reader walk.booklet.md", text: SCREEN_READER },
];

/** The booklet fixtures the corpus test runs over, as { name, text }: all but the one that holds mistakes on purpose. */
export const corpusFixtures = () => fixtureFiles().filter((f) => f.path.endsWith(".booklet.md") && f.text !== TEA_PROBLEMS);

/** The notes of the old test vault that have a .booklet.md name, by file name (the legacy golden file is keyed by these). */
export const vaultNotes = () => Object.fromEntries(fixtureFiles().filter((f) => !f.path.includes("/") && f.path.endsWith(".booklet.md")).map((f) => [f.path, f.text]));
