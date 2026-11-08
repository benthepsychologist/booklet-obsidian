/*
 * The id of a row the reader adds (core/row-id.ts): the format read, every part, the slug, the next number, the matcher, a clash, and what
 * is typed when no format is declared. Time and random bytes are handed in, so every id here is exact.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { parseIdFormat, makeId, nextNumber, slugOf, idMatcher, uuidOf, checkTypedId, ID_WORDS } = core;

/** 2026-11-08 10:42:00 UTC, the moment of every add below unless said. */
const NOW = new Date(Date.UTC(2026, 10, 8, 10, 42, 0));
/** 16 bytes that make a known UUID. */
const BYTES = Uint8Array.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
const UUID = "12345678-9abc-4ef0-9122-334455667788";
const make = (format, over = {}) => makeId(format, { ids: [], values: {}, now: NOW, random: () => BYTES, ...over });

test("a format is read into parts; literal braces, widths and every part name are understood", () => {
	const f = parseIdFormat("ID-{field:title}-{uuid}-{time}-{{x}}");
	assert.equal(f.ok, true);
	assert.deepEqual(
		f.parts.map((p) => (p.kind === "text" ? p.text : p.kind === "field" ? `field:${p.name}` : p.kind === "n" ? `n${p.width}` : p.kind)),
		["ID-", "field:title", "-", "uuid", "-", "time", "-{x}"],
	);
	assert.deepEqual(parseIdFormat("{n:3}").parts, [{ kind: "n", width: 3 }]);
	assert.equal(parseIdFormat("{n}").bare, true, "a bare {n} is a number");
	assert.equal(parseIdFormat("{n:3}").bare, false, "a bare {n:3} has zeros: a string");
	assert.equal(parseIdFormat("j-{n}").bare, false);
	for (const w of ["1", "5", "9"]) assert.equal(parseIdFormat(`{n:${w}}`).ok, true, w);
	for (const part of ["epoch", "date", "parent"]) assert.equal(parseIdFormat(`{${part}}`).ok, true, part);
});

test("a format that cannot be read says why: empty, not text, unknown part, bad width, unclosed or stray brace, empty field name", () => {
	for (const bad of ["", 7, null, undefined, "{nope}", "{n:0}", "{n:10}", "{n:03}", "{n:x}", "a{b", "a}b", "{field:}", "{}", "{ n}"]) {
		const f = parseIdFormat(bad);
		assert.equal(f.ok, false, String(bad));
		assert.ok(f.why.length > 5, `${String(bad)} says why`);
	}
	assert.equal(make("{nope}").ok, false);
	assert.equal(make("{nope}").why, "format");
	assert.equal(make("{nope}").message, ID_WORDS.formatBad);
});

test("{time}, {date} and {epoch} are the moment of the add in UTC", () => {
	assert.equal(make("t-{time}").id, "t-20261108104200");
	assert.equal(make("d-{date}").id, "d-20261108");
	assert.equal(make("e-{epoch}").id, `e-${Math.floor(NOW.getTime() / 1000)}`);
	// a late hour and a single-digit month and day are padded
	assert.equal(make("{time}", { now: new Date(Date.UTC(2027, 0, 2, 3, 4, 5)) }).id, "20270102030405");
});

test("{uuid} is a version-4 UUID made from the random bytes, lowercase; each {uuid} of a format is its own", () => {
	assert.equal(uuidOf(BYTES), UUID);
	assert.equal(make("{uuid}").id, UUID);
	assert.match(uuidOf(new Uint8Array(16).fill(255)), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	let calls = 0;
	const r = make("{uuid}/{uuid}", { random: () => Uint8Array.from({ length: 16 }, (_, i) => (calls++ * 7 + i) & 255) });
	const [a, b] = r.id.split("/");
	assert.notEqual(a, b);
});

test("{field:NAME} is the slug of the new row's value; {parent} is the parent's id and empty for a top row", () => {
	assert.equal(make("ID-{field:title}", { values: { title: "Weed the beds" } }).id, "ID-weed-the-beds");
	assert.equal(make("{parent}/{field:title}", { values: { title: "x" }, parent: "p-orchard" }).id, "p-orchard/x");
	assert.equal(make("{parent}/{field:title}", { values: { title: "x" } }).id, "/x");
	assert.equal(make("{parent}-{n}", { parent: 7 }).id, "7-1", "a number parent is its digits");
});

test("the slug: lowercase, runs of other characters become one hyphen, no accent kept, ends trimmed", () => {
	assert.equal(slugOf("Weed the  beds!"), "weed-the-beds");
	assert.equal(slugOf("  --Hello, World--  "), "hello-world");
	assert.equal(slugOf("A_B/C.D"), "a-b-c-d");
	assert.equal(slugOf("keep-hyphens-and-9"), "keep-hyphens-and-9");
	assert.equal(slugOf("Café"), "cafe", "an accent is removed (NFD, combining marks dropped)");
	assert.equal(slugOf("Crème brûlée"), "creme-brulee");
	assert.equal(slugOf("Ñandú"), "nandu");
	assert.equal(slugOf("日本語"), "", "no a to z or digit at all: empty");
	assert.equal(slugOf("🎉🎉"), "");
	assert.equal(slugOf("Ångström 2"), "angstrom-2");
	assert.equal(slugOf(42), "42");
	assert.equal(slugOf(null), "");
	assert.equal(slugOf(undefined), "");
	assert.equal(slugOf("???"), "");
});

test("an empty slug refuses, naming the field by its label in lower case", () => {
	const r = make("ID-{field:title}", { values: { title: "   " }, labelOf: (k) => (k === "title" ? "Name" : k) });
	assert.deepEqual(r, { ok: false, why: "slug", field: "title", message: "Give it a name first." });
	assert.equal(make("{field:title}", { values: {} }).message, "Give it a title first.", "no label function: the field's own name");
	assert.equal(make("{field:title}", { values: { title: "!!!" } }).ok, false);
});

test("{n} is the highest number found in an id that matches the format plus one; 1 with none", () => {
	assert.equal(make("{n}").id, 1);
	assert.equal(make("{n}", { ids: [1, 2, 7] }).id, 8, "a bare {n} is a JSON number");
	assert.equal(make("{n}", { ids: ["3", 10] }).id, 11, "a string of digits counts too");
	assert.equal(make("j-{n}", { ids: ["j-1", "j-9", "j-x", "k-40", "j-2b"] }).id, "j-10", "ids that do not match the format are not counted");
	assert.equal(make("j-{n:3}", { ids: ["j-007", "j-012"] }).id, "j-013");
	assert.equal(make("j-{n:3}").id, "j-001", "padding to the width");
	assert.equal(make("j-{n:2}", { ids: ["j-99"] }).id, "j-100", "a number wider than the width is written whole");
	assert.equal(make("{n:3}", { ids: [5] }).id, "006", "a bare {n:3} is a string");
});

test("{n} counts over the ids of the block at every depth and the ids of adds still waiting", () => {
	// the caller gives every id: block rows of every depth, then waiting adds
	assert.equal(make("j-{n}", { ids: ["j-1", "j-2", "j-3"] }).id, "j-4");
	assert.equal(nextNumber(parseIdFormat("j-{n}").parts, ["j-1", "j-5"]), 6);
	assert.equal(make("j-{n}", { ids: ["j-1", "j-2", "j-6"] }).id, "j-7", "a waiting add's id (j-6) counts as much as one in the block");
});

test("the matcher: a constant is itself, {n} digits, time/date/epoch digits of their length, {uuid} a UUID, field and parent any text", () => {
	const m = (f) => idMatcher(parseIdFormat(f).parts);
	assert.equal(m("a.b-{n}").test("a.b-12"), true);
	assert.equal(m("a.b-{n}").test("aXb-12"), false, "a dot in a constant is a dot");
	assert.equal(m("{time}").test("20261108104200"), true);
	assert.equal(m("{time}").test("2026110810420"), false);
	assert.equal(m("{date}").test("20261108"), true);
	assert.equal(m("{date}").test("2026110"), false);
	assert.equal(m("{epoch}").test("1"), true);
	assert.equal(m("{epoch}").test(""), false);
	assert.equal(m("{uuid}").test(UUID), true);
	assert.equal(m("{uuid}").test("not-a-uuid"), false);
	assert.equal(m("x-{field:t}-{n}").test("x-anything at all-12"), true);
	assert.equal(m("{parent}/{n}").test("/4"), true, "a parent part may be empty");
	assert.equal(m("j-{n}").test("xj-1"), false, "the whole id must fit");
	assert.equal(m("j-{n}").test("j-1x"), false);
});

test("a format with two number parts is not valid, whatever their widths: the same number written twice", () => {
	for (const bad of ["{n}-{n:3}", "a{n}b{n}", "{n:2}{n:2}", "{n:9}/{n}"]) {
		const f = parseIdFormat(bad);
		assert.equal(f.ok, false, bad);
		assert.match(f.why, /number/i, `${bad} says why`);
		assert.equal(make(bad).ok, false, bad);
		assert.equal(make(bad).why, "format", bad);
		assert.equal(make(bad).message, ID_WORDS.formatBad, bad);
	}
	// one number part, with anything else beside it, is fine
	for (const good of ["{n}", "{n:3}", "j-{n}-{uuid}", "{time}-{n:2}"]) assert.equal(parseIdFormat(good).ok, true, good);
});

test("a bare {n} makes a JSON number; {n:W} and every other format make a string; numbers and text clash as text", () => {
	assert.strictEqual(make("{n}", { ids: [4] }).id, 5);
	assert.strictEqual(make("{n}", { ids: ["4", 2] }).id, 5, "an id written as text counts");
	assert.strictEqual(make("{n:1}", { ids: [4] }).id, "5", "a width makes a string");
	assert.strictEqual(make("{n:3}").id, "001");
	assert.strictEqual(make("n{n}").id, "n1");
	// an existing number 5 and a string "5" are the same id
	assert.equal(make("{field:t}", { ids: [5], values: { t: "5" } }).ok, false, "text against a number");
	assert.equal(make("{field:t}", { ids: ["5"], values: { t: "5" } }).ok, false, "text against text");
	assert.equal(checkTypedId("5", undefined, [5]).ok, false);
	assert.equal(checkTypedId(" 5 ", undefined, ["5"]).ok, false);
});

test("a clash refuses in words that say to add a part that tells rows apart; no silent change", () => {
	const r = make("ID-{field:title}", { ids: ["ID-weed"], values: { title: "Weed" } });
	assert.deepEqual(r, { ok: false, why: "clash", message: ID_WORDS.clash });
	assert.match(ID_WORDS.clash, /Add a part to the id format that tells rows apart \(a number, a time or a UUID\)/);
	// the same id as a number in the block clashes with its text
	assert.equal(make("{field:t}", { ids: [42], values: { t: "42" } }).ok, false);
	// {date} never moves: a second add the same day with a date-only format clashes
	assert.equal(make("{date}", { ids: ["20261108"] }).ok, false);
	// {n} cannot clash: it counts past the ids it matches
	assert.equal(make("{n}", { ids: [1, 2, 3] }).ok, true);
});

test("{time} and {epoch} try the next second, up to 60, when the id exists", () => {
	const taken = (secs) => secs.map((s) => `t-${new Date(NOW.getTime() + s * 1000).toISOString().replace(/\D/g, "").slice(0, 14)}`);
	assert.equal(make("t-{time}", { ids: taken([0]) }).id, "t-20261108104201");
	assert.equal(make("t-{time}", { ids: taken([0, 1, 2]) }).id, "t-20261108104203");
	const all = Array.from({ length: 60 }, (_, i) => i);
	assert.equal(make("t-{time}", { ids: taken(all) }).id, "t-20261108104300", "the 61st try is 60 seconds on");
	assert.equal(make("t-{time}", { ids: taken([...all, 60]) }).ok, false, "past 60 seconds it refuses");
	const e = Math.floor(NOW.getTime() / 1000);
	assert.equal(make("{epoch}", { ids: [String(e), String(e + 1)] }).id, String(e + 2));
	// a time that moves moves the epoch of the same id with it
	assert.equal(make("{time}-{epoch}", { ids: [`20261108104200-${e}`] }).id, `20261108104201-${e + 1}`);
});

test("a long format of every part, in a mixed order", () => {
	const r = make("ID-{field:title}-{uuid}-{time}-{n:2}-{parent}", { ids: ["ID-x-" + UUID + "-20200101000000-09-p"], values: { title: "Weed the beds" }, parent: "p" });
	assert.equal(r.id, `ID-weed-the-beds-${UUID}-20261108104200-10-p`);
});

test("a typed id (no idFormat): not empty, one line, fits the pattern, is new", () => {
	assert.deepEqual(checkTypedId("  j-weed ", undefined, []), { ok: true, id: "j-weed" });
	assert.equal(checkTypedId("   ", undefined, []).message, ID_WORDS.typedEmpty);
	assert.equal(checkTypedId("a\nb", undefined, []).message, ID_WORDS.typedBreak);
	assert.equal(checkTypedId("A B", "^[a-z0-9-]+$", []).message, ID_WORDS.typedPattern("^[a-z0-9-]+$"));
	assert.equal(checkTypedId("a-b", "^[a-z0-9-]+$", []).ok, true);
	assert.equal(checkTypedId("j-1", undefined, ["j-1"]).message, ID_WORDS.typedClash);
	assert.equal(checkTypedId("1", undefined, [1]).ok, false, "a number id clashes with its text");
	assert.equal(checkTypedId("x", "(", []).message, ID_WORDS.patternBad, "a pattern that is no regular expression");
	assert.equal(core.patternOf(undefined).ok, true);
	assert.equal(core.patternOf(5).ok, false);
});

test("a number part must be bounded by a constant: next to a variable text part or digits/hex it is not a valid format", () => {
	for (const bad of ["{parent}{n}", "{n}{parent}", "{field:x}{n}", "{n}{field:x}", "{n:3}{field:x}", "{n}{time}", "{time}{n}", "{n}{date}", "{epoch}{n:2}", "{n}{uuid}", "{uuid}{n}", "a{parent}{n}b"]) {
		const f = parseIdFormat(bad);
		assert.equal(f.ok, false, bad);
		assert.match(f.why, /constant|next to/i, `${bad} says why`);
		assert.equal(make(bad, { values: { x: "v" } }).ok, false, bad);
	}
	for (const good of ["{parent}-{n}", "P{n}", "{n}-{field:x}", "{field:x}-{n:3}", "{n}.{time}", "{uuid}-{n}", "p{n}{{x", "{parent}/{n}"]) assert.equal(parseIdFormat(good).ok, true, good);
	// the digits of {n} are found without a text part to swallow them
	assert.equal(make("{parent}-{n}", { parent: "p", ids: ["p-9", "p-10"] }).id, "p-11");
});

test("an empty made id is refused in words, whatever the format; a parent's id keeps {parent} formats working under a row", () => {
	for (const f of ["{parent}", "{parent}{parent}", "{parent}{parent}{{"]) {
		if (f.endsWith("{{")) continue;
		const r = make(f);
		assert.deepEqual(r, { ok: false, why: "empty", message: ID_WORDS.empty }, f);
	}
	assert.equal(ID_WORDS.empty, "That id format makes an empty id here.");
	assert.equal(make("{parent}", { parent: "p-orchard" }).id, "p-orchard", "under a row it is the parent's id (and clashes only if a row has it)");
	assert.equal(make("p-{parent}").id, "p-", "a constant makes it not empty");
	assert.equal(make("p-{parent}", { parent: "x" }).id, "p-x");
});

test("an empty slug says why: an empty box asks for it; a box with nothing an id can use says so, naming the field", () => {
	const labelOf = (k) => (k === "title" ? "Name" : k);
	assert.equal(make("ID-{field:title}", { values: { title: "" }, labelOf }).message, "Give it a name first.");
	assert.equal(make("ID-{field:title}", { values: {}, labelOf }).message, "Give it a name first.");
	assert.equal(make("ID-{field:title}", { values: { title: "   " }, labelOf }).message, "Give it a name first.", "blanks are an empty box");
	const r = make("ID-{field:title}", { values: { title: "日本語" }, labelOf });
	assert.deepEqual(r, { ok: false, why: "slug", field: "title", message: "'Name' has no letters or digits an id can use. Type an id, or use another part." });
	assert.equal(make("ID-{field:title}", { values: { title: "!!!" }, labelOf }).message, ID_WORDS.noUsable("Name"));
	assert.equal(make("ID-{field:title}", { values: { title: "Café" }, labelOf }).id, "ID-cafe");
});

test("a typed id must match the whole of the pattern (the host anchors it), compiled with the u flag; trimmed; empty or a line break refused", () => {
	const { checkTypedId, patternOf } = core;
	assert.equal(checkTypedId("p-12", "p-\\d+", []).ok, true);
	assert.equal(checkTypedId("p-12x", "p-\\d+", []).ok, false, "a match of a part is not a match");
	assert.equal(checkTypedId("xp-12", "p-\\d+", []).ok, false);
	assert.equal(checkTypedId("a", "a|b", []).ok, true);
	assert.equal(checkTypedId("ab", "a|b", []).ok, false, "an alternative does not escape the anchors");
	assert.equal(checkTypedId("  p-1  ", "p-\\d", []).id, "p-1", "trimmed at both ends");
	assert.equal(checkTypedId("   ", undefined, []).message, core.ID_WORDS.typedEmpty);
	assert.equal(checkTypedId("a\nb", undefined, []).message, core.ID_WORDS.typedBreak);
	// the u flag: a code point is one character, and a pattern the u flag does not allow is a bad pattern
	assert.equal(checkTypedId("\u{1F331}", "^.$", []).ok, true, "one emoji is one character under u");
	assert.equal(patternOf("\\-").ok, false, "an escape u does not allow is no pattern");
	assert.equal(patternOf("(").ok, false);
});
