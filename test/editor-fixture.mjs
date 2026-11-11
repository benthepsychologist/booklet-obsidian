/*
 * A made-up booklet that holds data: twelve kept entries of a repeating activity, an answer given once, a draft, and five rows in a data
 * block with declared fields. The guards are tried on it.
 */
import { bookletAround } from "./helpers.mjs";

const entry = (day, feeling, why) => `{"ts": "2026-10-${String(day).padStart(2, "0")}T09:00:00Z", "feeling": ${feeling}, "why": ${JSON.stringify(why)}}`;
export const ENTRIES = Array.from({ length: 12 }, (_, i) => entry(i + 1, (i % 3) + 1, `Day ${i + 1}`));

export const ROWS = [
	{ id: "a", title: "Water the plants", kind: "chore", done: "no" },
	{ id: "b", title: "Write the report", kind: "work", done: "no" },
	{ id: "c", title: "Call a friend", kind: "people", done: "yes" },
	{ id: "d", title: "Walk", kind: "health", done: "yes" },
	{ id: "e", title: "Read", kind: "health", done: "no" },
];

export const DATA_FENCE = `\`\`\`booklet data\n{ "fields": { "title": { "label": "Title", "edit": "text" }, "kind": "Kind", "done": "Done" },\n  "rows": ${JSON.stringify(ROWS)} }\n\`\`\``;

export const HELD = bookletAround(
	[
		"> [!module|mood] Mood",
		"",
		"> [!activity|log repeat] A mood log",
		"",
		"> [!choice|feeling] How do you feel?",
		"- [ ] Calm",
		"- [ ] Tense",
		"- [ ] Low",
		"",
		"> [!text|why] Why?",
		"",
		"> [!activity|once] Said once",
		"",
		"> [!scale|energy] How much energy?",
		"",
		"0. None",
		"1. Some",
		"2. Lots",
		"",
		DATA_FENCE,
		"^things",
		"",
		"```booklet query",
		"from: things",
		"as: table",
		"```",
		"",
		"> [!module|mood end]",
		"",
		"%%",
		"> [!records] App record — do not edit below this line",
		"",
		"> [!records|mood] Mood",
		"",
		"```booklet answers",
		'{ "energy": 2 }',
		"```",
		"",
		"```booklet entries log",
		`{"items": [\n${ENTRIES.join(",\n")}\n]}`,
		"```",
		"",
		"```booklet draft log",
		'{ "why": "half a thought" }',
		"```",
		"%%",
		"",
	].join("\n"),
);
