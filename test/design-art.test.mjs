/*
 * The pictures on the Design view's Add tiles (src/design-art.ts): every piece in pieces/ has one, none is for a file that is not
 * there, the drawings are only the shapes the view knows how to make, and no colour is written in them (the stylesheet's custom
 * properties and currentColor are the only colours, so light and dark themes both work).
 * src/design-art.ts imports nothing from Obsidian, so this test bundles it here with esbuild rather than adding it to
 * build-for-tests.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import esbuild from "esbuild";
import { core, ROOT } from "./helpers.mjs";
import { BOOKLET_ICONS } from "./.build/screens.mjs";

mkdirSync(join(ROOT, "test", ".build"), { recursive: true });
await esbuild.build({
	entryPoints: [join(ROOT, "src", "design-art.ts")],
	bundle: true,
	format: "esm",
	platform: "neutral",
	target: "es2021",
	outfile: join(ROOT, "test", ".build", "design-art.mjs"),
	logLevel: "warning",
});
const { artOf, ART_FILES } = await import("./.build/design-art.mjs");

const { PIECES } = core;
const PIECE_FILES = readdirSync(join(ROOT, "pieces")).filter((f) => f.endsWith(".md"));

const ALLOWED_TAGS = new Set(["g", "rect", "circle", "ellipse", "path", "line", "polyline", "polygon", "text"]);
const TONES = new Set(["structure", "question", "reading", "view", "data"]);
// a literal colour: #rgb, #rrggbb, rgb(), rgba(), hsl(), hsla(), or a colour keyword where a paint is expected
const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/i;
const KEYWORD_COLOURS = new Set(["white", "black", "red", "green", "blue", "yellow", "orange", "purple", "pink", "gray", "grey", "teal", "navy", "brown", "silver", "gold"]);
const PAINT_ATTRS = new Set(["fill", "stroke", "stop-color", "color", "flood-color", "lighting-color"]);
// the only custom properties the drawings may use (the stylesheet defines these; src/design-art.ts lists them at its top)
const CUSTOM_PROPERTY = /^var\(--bd-(?:ink|ink-soft|paper|accent|callout-(?:tip|hint|note|warning|example|solution|law|diff|opinion|question|quote|citation))\)$/;

const group = (p) => p.group;

function* walk(parts, trail = []) {
	for (const part of parts) {
		yield [part, trail];
		if (part.children) yield* walk(part.children, [...trail, part.tag]);
	}
}

test("the pieces are the 56 files, in the five groups the art is made for", () => {
	assert.equal(PIECES.length, 56);
	assert.deepEqual(
		PIECE_FILES.slice().sort(),
		PIECES.map((p) => p.file).sort(),
		"pieces/ and PIECES are the same files",
	);
	const count = {};
	for (const p of PIECES) count[p.group] = (count[p.group] ?? 0) + 1;
	assert.deepEqual(count, { structure: 14, questions: 14, reading: 17, views: 8, data: 3 });
});

test("every piece file has art, and no art is kept for a file that is not there", () => {
	for (const p of PIECES) assert.ok(ART_FILES.includes(p.file), `no art for ${p.file}`);
	for (const f of ART_FILES) assert.ok(existsSync(join(ROOT, "pieces", f)), `art for ${f}, which is not in pieces/`);
	assert.equal(new Set(ART_FILES).size, ART_FILES.length, "a file is listed twice");
	assert.equal(ART_FILES.length, PIECES.length);
});

test("artOf gives each piece its own art: a drawing or an icon, never nothing", () => {
	for (const p of PIECES) {
		const art = artOf(p);
		assert.ok(art && (art.kind === "svg" || art.kind === "icon"), `${p.file}: ${JSON.stringify(art)}`);
	}
});

test("every drawing has a valid viewBox and parts made only of the allowed shapes", () => {
	for (const p of PIECES) {
		const art = artOf(p);
		if (art.kind !== "svg") continue;
		assert.match(art.viewBox, /^-?\d+(\.\d+)? -?\d+(\.\d+)? [1-9]\d*(\.\d+)? [1-9]\d*(\.\d+)?$/, `${p.file}: viewBox ${art.viewBox}`);
		assert.ok(Array.isArray(art.parts) && art.parts.length > 0, `${p.file}: no parts`);
		for (const [part] of walk(art.parts)) {
			assert.ok(ALLOWED_TAGS.has(part.tag), `${p.file}: tag <${part.tag}> is not allowed`);
			assert.equal(typeof part.attrs, "object", `${p.file}: <${part.tag}> has no attrs`);
			for (const [name, value] of Object.entries(part.attrs)) {
				assert.ok(typeof value === "string" || (typeof value === "number" && Number.isFinite(value)), `${p.file}: <${part.tag} ${name}> is ${value}`);
				assert.ok(!/^on/i.test(name) && name !== "style" && name !== "href" && name !== "xlink:href", `${p.file}: attribute ${name} is not allowed`);
			}
			if (part.tag === "text") assert.ok(typeof part.text === "string" && part.text.length > 0, `${p.file}: a <text> with no words`);
			else assert.equal(part.text, undefined, `${p.file}: <${part.tag}> carries text`);
		}
	}
});

test("no drawing writes a colour: only none, currentColor and the stylesheet's custom properties", () => {
	for (const p of PIECES) {
		const art = artOf(p);
		if (art.kind !== "svg") continue;
		for (const [part] of walk(art.parts)) {
			for (const [name, value] of Object.entries(part.attrs)) {
				const v = String(value);
				assert.ok(!LITERAL_COLOUR.test(v), `${p.file}: <${part.tag} ${name}="${v}"> is a literal colour`);
				if (PAINT_ATTRS.has(name)) {
					const ok = v === "none" || v === "currentColor" || CUSTOM_PROPERTY.test(v);
					assert.ok(ok, `${p.file}: <${part.tag} ${name}="${v}"> is not none, currentColor or a --bd custom property`);
					assert.ok(!KEYWORD_COLOURS.has(v.toLowerCase()), `${p.file}: ${name}="${v}" is a colour word`);
				}
				if (/var\(/.test(v)) assert.ok(CUSTOM_PROPERTY.test(v), `${p.file}: ${name}="${v}" is not a listed custom property`);
			}
		}
	}
});

test("every icon is a non-empty name and a tone the tiles know; the tone fits the group", () => {
	const toneOf = { structure: "structure", questions: "question", reading: "reading", views: "view", data: "data" };
	for (const p of PIECES) {
		const art = artOf(p);
		if (art.kind !== "icon") continue;
		assert.equal(typeof art.icon, "string");
		assert.match(art.icon, /^[a-z][a-z0-9-]*$/, `${p.file}: icon name "${art.icon}"`);
		assert.ok(TONES.has(art.tone), `${p.file}: tone ${art.tone}`);
		assert.equal(art.tone, toneOf[p.group], `${p.file}: tone ${art.tone} for group ${p.group}`);
	}
});

test("the icons are names Booklet's own icon set has, bar the few that Obsidian itself has had for years", () => {
	const OBSIDIAN_OWN = new Set(["copy", "chevrons-up-down", "table-properties"]);
	for (const p of PIECES) {
		const art = artOf(p);
		if (art.kind !== "icon") continue;
		assert.ok(BOOKLET_ICONS.has(art.icon) || OBSIDIAN_OWN.has(art.icon), `${p.file}: icon "${art.icon}" is in neither`);
	}
});

test("a snapshot count per group: which pieces are drawn and which are icons", () => {
	const tally = {};
	for (const p of PIECES) {
		const art = artOf(p);
		const g = (tally[group(p)] ??= { svg: 0, icon: 0 });
		g[art.kind]++;
	}
	assert.deepEqual(tally, {
		structure: { svg: 14, icon: 0 },
		questions: { svg: 14, icon: 0 },
		reading: { svg: 12, icon: 5 },
		views: { svg: 0, icon: 8 },
		data: { svg: 0, icon: 3 },
	});
});

test("pieces that look alike on a tile are told apart: no two of the structure or question pieces have the same drawing", () => {
	for (const g of ["structure", "questions"]) {
		const seen = new Map();
		for (const p of PIECES.filter((x) => x.group === g)) {
			const key = JSON.stringify(artOf(p));
			assert.ok(!seen.has(key), `${p.file} is drawn the same as ${seen.get(key)}`);
			seen.set(key, p.file);
		}
	}
	const callouts = PIECES.filter((p) => p.group === "reading" && artOf(p).kind === "svg");
	assert.equal(new Set(callouts.map((p) => JSON.stringify(artOf(p)))).size, callouts.length);
});

test("a file with no art falls back to a generic icon for its group, and never throws", () => {
	for (const g of ["structure", "questions", "reading", "views", "data"]) {
		const art = artOf({ file: `${g} - not a piece.md`, group: g });
		assert.equal(art.kind, "icon", g);
		assert.ok(art.icon.length > 0 && TONES.has(art.tone), g);
	}
	assert.equal(artOf({ file: "x.md", group: "no such group" }).kind, "icon");
	assert.equal(artOf({ file: "constructor", group: "reading", kinds: ["nothing"] }).kind, "icon");
	assert.equal(artOf({ file: "__proto__", group: "views", views: ["nothing"] }).kind, "icon");
	// what it holds can say more than the group: a new file holding a known callout or view
	assert.equal(artOf({ file: "Reading - new.md", group: "reading", kinds: ["warning"] }).kind, "svg");
	assert.deepEqual(artOf({ file: "View - new.md", group: "views", views: ["bars"] }), { kind: "icon", icon: "chart-column", tone: "view" });
});
