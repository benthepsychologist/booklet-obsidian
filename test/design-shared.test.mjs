/*
 * Runs test/design-shared-cases.json: text in, expected out, with nothing from the tree's own types in the file, so another
 * implementation of the Design view can run the same file. A node is picked by the 0-based line it starts on (the first node in
 * reading order that does, never the implicit activity of a note with no activity line), a position by the 0-based line it sits above,
 * a piece by its file name in the pieces table (or inline as { file, text }).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { core } from "./helpers.mjs";

const { parseDesign, walkDesign, designOutline, legalKinds, positionAtLine, insertPiece, deleteBlock, moveBlock, changeLines, PIECES } = core;
const shared = JSON.parse(readFileSync(new URL("./design-shared-cases.json", import.meta.url), "utf8"));

const impactWords = (r) => r.impact.map((i) => `${i.what}: ${i.entries} entries, ${i.answers} answers, ${i.rows} rows`);

function run(c) {
	const root = parseDesign(c.text);
	const nodeAt = (line) => {
		const n = walkDesign(root).find((x) => x.start === line && x.implicit !== true);
		assert.ok(n, `a node starts on line ${line}`);
		return n;
	};
	switch (c.kind) {
		case "outline":
			return assert.deepEqual(designOutline(root), c.expected);
		case "legal":
			return assert.deepEqual(legalKinds(root, positionAtLine(root, c.line)), c.expected);
		case "op": {
			let r;
			if (c.op === "insert") {
				const piece = typeof c.piece === "string" ? PIECES.find((p) => p.file === c.piece) : c.piece;
				assert.ok(piece, "the piece is in the table");
				r = insertPiece(c.text, positionAtLine(root, c.at.line), piece);
			} else if (c.op === "delete") r = deleteBlock(c.text, nodeAt(c.node.line));
			else if (c.op === "move") r = moveBlock(c.text, nodeAt(c.node.line), positionAtLine(root, c.to.line));
			else r = changeLines(c.text, nodeAt(c.node.line), c.lines);
			assert.equal(r.ok, c.expected.ok);
			if (r.ok) {
				assert.equal(r.text, c.expected.text);
				assert.deepEqual(impactWords(r), c.expected.impact);
			} else assert.equal(r.reason, c.expected.reason);
			return;
		}
		default:
			assert.fail(`unknown kind ${c.kind}`);
	}
}

test("the shared cases file has every kind of case, each named once", () => {
	assert.ok(shared.cases.length >= 30);
	assert.equal(new Set(shared.cases.map((c) => c.name)).size, shared.cases.length);
	for (const kind of ["outline", "legal", "op"]) assert.ok(shared.cases.some((c) => c.kind === kind), kind);
	for (const op of ["insert", "delete", "move", "change"]) {
		assert.ok(shared.cases.some((c) => c.op === op && c.expected.ok), `${op} done`);
	}
	assert.ok(shared.cases.some((c) => c.kind === "op" && !c.expected.ok), "a refusal");
	assert.ok(shared.cases.some((c) => c.kind === "op" && c.expected.ok && c.expected.impact.length), "an impact");
	assert.ok(shared.cases.some((c) => /\r\n/.test(c.text)), "Windows line endings");
});

for (const c of shared.cases) test(c.name, () => run(c));
