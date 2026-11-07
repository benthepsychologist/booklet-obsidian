/*
 * A made-up dashboard for the tests of rows that open and rows read from a data file (format 0.19): a garden and an orchard, with
 * programmes that hold projects, projects that hold work items, and work items that hold steps. `make()` returns the data the file
 * holds as a plain object (462 rows at every depth by default), `count(data)` the number of rows at every depth. Nothing is random:
 * the same numbers come out every time. Ported from the format repository's test/dashboard-fixture.js, which makes the same rows.
 */
const PLACES = ["Beds", "Shed", "Orchard", "Pond", "Greenhouse", "Hedge", "Compost", "Path"];
const JOBS = ["Order timber", "Dig a trench", "Prune the plums", "Mend the gate", "Sow the carrots", "Net the berries", "Stake the beans", "Clear the leaves", "Paint the bench", "Fill the water butt", "Thin the apples", "Mulch the roses"];
const STAGES = ["idea", "planned", "doing", "blocked", "done"];
const TONES = ["", "good", "warn", "bad"];
const pick = (a, i) => a[i % a.length];
const day = (i) => "2026-" + String(11 + (Math.floor(i / 28) % 2)).padStart(2, "0") + "-" + String(1 + (i % 28)).padStart(2, "0");

/** A row with `id`, a title, a stage, a due date, a badge and tone, and a long text that shows when the row opens. */
const row = (id, title, i, extra) => ({
	id,
	title,
	kind: "",
	stage: pick(STAGES, i),
	open: i % 5,
	due: day(i),
	moved: pick(["today", "yesterday", "last week"], i),
	badge: i % 7 === 0 ? "needs you" : "",
	tone: pick(TONES, i),
	about: "First paragraph about " + title.toLowerCase() + ".\n\nSecond paragraph, kept apart.\nA third line in the second paragraph.",
	...extra,
});

/** programmes x projects x items x steps: 6 + 6x4 + 6x4x3 + 6x4x3x5 = 462 rows. */
export function make(o = {}) {
	const nProg = o.programmes || 6;
	const nProj = o.projects || 4;
	const nItem = o.items || 3;
	const nStep = o.steps || 5;
	let i = 0;
	const programmes = [];
	for (let p = 0; p < nProg; p++) {
		const projects = [];
		for (let j = 0; j < nProj; j++) {
			const items = [];
			for (let k = 0; k < nItem; k++) {
				const steps = [];
				for (let s = 0; s < nStep; s++) steps.push(row("s" + p + "-" + j + "-" + k + "-" + s, pick(JOBS, i) + " (" + pick(PLACES, i) + ")", i++, { kind: "Step" }));
				items.push(row("i" + p + "-" + j + "-" + k, pick(JOBS, i) + " at the " + pick(PLACES, i).toLowerCase(), i++, { kind: "Work item", steps }));
			}
			projects.push(row("j" + p + "-" + j, pick(PLACES, i) + " project " + (j + 1), i++, { kind: "Project", items }));
		}
		programmes.push(row("p" + p, (p % 2 ? "Orchard" : "Garden") + " programme " + (p + 1), i++, { kind: p % 2 ? "orchard-hub" : "garden-hub", projects }));
	}
	return { programmes };
}

/** Rows at every depth: a row, its projects, their items, their steps. */
export function count(data) {
	let n = 0;
	const todo = [...data.programmes];
	while (todo.length) {
		const r = todo.pop();
		n++;
		for (const v of Object.values(r)) if (Array.isArray(v) && v.length && v[0] && typeof v[0] === "object") todo.push(...v);
	}
	return n;
}

export const FIELDS = { title: "Name", kind: "Kind", stage: "Stage", open: "Open", due: "Due", moved: "Moved", about: "What it says", projects: "Projects", items: "Work items", steps: "Steps" };

/** The small booklet that draws it: one activity, three queries, each drawing the same rows another way (a table, a list, cards). */
export function bookletText(file = "garden.json") {
	return `---
booklet: "0.19"
title: Garden dashboard
lang: en
---

> [!activity|desk] Garden desk

\`\`\`booklet query
from: programmes
as: table
fields: title, kind, stage, open, due, moved
\`\`\`

\`\`\`booklet query
from: programmes
as: list
label: title
fields: kind, stage
\`\`\`

\`\`\`booklet query
from: programmes
as: cards
label: title
fields: kind, stage
\`\`\`

\`\`\`booklet data ${file} programmes
${JSON.stringify({ fields: FIELDS })}
\`\`\`
^programmes
`;
}
