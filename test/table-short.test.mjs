/*
 * A table cell of a few words (a date, a name) is kept on one line, so a table wider than its card scrolls across instead of
 * breaking a date into five lines; a column with a long cell wraps as before. Made-up rows only.
 */
import { openView, testApp } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { fence, fm } from "./helpers.mjs";

process.env.TZ = "UTC";

const rows = [
	{ crop: "Beet", note: "Sown thinly along the east fence, covered with a little sand against the frost and watered once a week", when: "2026-04-10" },
	{ crop: "Kale", note: "Sown in the cold frame", when: "2026-04-11" },
];
const text = `${fm}\n> [!activity|show] Show\n\n${fence("from: plot\nas: table")}\n\n> [!data] Data\n\n\`\`\`booklet data\n${JSON.stringify({ fields: { crop: "Crop", note: "Note", when: "Sown" }, rows })}\n\`\`\`\n^plot\n`;

test("a column of short cells is kept on one line, and a column with a long cell is not", () => {
	const disk = { text, writes: 0 };
	const v = openView(text, { path: "Note.booklet.md", disk, app: testApp(disk), screen: "activity:/show" });
	const heads = [...v.view.contentEl.querySelectorAll(".booklet-q-table thead th")].map((th) => th.textContent.trim());
	const first = [...v.view.contentEl.querySelectorAll(".booklet-q-table tbody tr")[0].querySelectorAll("td")];
	const kept = Object.fromEntries(heads.map((h, i) => [h, first[i].classList.contains("booklet-q-short")]));
	assert.deepEqual(kept, { Crop: true, Note: false, Sown: true });
	v.close();
});
