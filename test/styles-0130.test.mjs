/*
 * What styles.css may and may not hold (0.13.0). The look is drawn from Obsidian's own variables, so it follows any theme, and the
 * stylesheet is plain CSS an older Obsidian reads: no colour written out, no font, no :has(), no nesting, no shadow but a ring.
 * `lint` is the checker; the cases below give it small stylesheets it must refuse, so a passing real stylesheet means something.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";

const NAMED = new Set(
	`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral
	cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange
	darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey
	dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo
	ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink
	lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine
	mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose
	moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru
	pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
	slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(/\s+/),
);

/** The shadow of a ring or a state: `[inset] 0 0 0 <length> var(--...)`, or none. */
const RING = /^(?:inset\s+)?0\s+0\s+0\s+(?:\d+(?:\.\d+)?px|var\(\s*--[\w-]+\s*\))\s+var\(\s*--[\w-]+\s*\)$/;

/** `css` without its comments, and with each `@supports (...)` condition emptied (the test for color-mix names two colours, red and blue). */
function plain(css) {
	return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@supports\s*[^{]*\{/g, "@supports {");
}

/** Every declaration of `css` with the at-rules around it, and the nesting found while reading. Returns { decls, problems }. */
function read(css) {
	const text = plain(css);
	const problems = [];
	const decls = [];
	const stack = [];
	let buf = "";
	let quote = "";
	const decl = (src) => {
		const t = src.trim();
		if (!t) return;
		const at = t.indexOf(":");
		if (at < 0) return void problems.push(`not a declaration: ${t}`);
		const top = stack[stack.length - 1];
		decls.push({ prop: t.slice(0, at).trim().toLowerCase(), value: t.slice(at + 1).trim(), selector: top.selector, at: stack.filter((x) => x.at).map((x) => x.selector) });
	};
	for (const ch of text) {
		if (quote) {
			buf += ch;
			if (ch === quote) quote = "";
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			buf += ch;
		} else if (ch === "{") {
			const sel = buf.trim();
			buf = "";
			const at = sel.startsWith("@");
			const top = stack[stack.length - 1];
			if (top && !top.at) problems.push(`a rule opened inside a rule: ${sel}`);
			if (!at && /&/.test(sel)) problems.push(`a nesting selector: ${sel}`);
			stack.push({ selector: sel, at });
		} else if (ch === ";") {
			const top = stack[stack.length - 1];
			if (top && !top.at) decl(buf);
			buf = "";
		} else if (ch === "}") {
			const top = stack[stack.length - 1];
			if (top && !top.at) decl(buf);
			buf = "";
			stack.pop();
		} else buf += ch;
	}
	return { decls, problems };
}

/** What is wrong with a stylesheet, one line for each fault. */
function lint(css) {
	const { decls, problems } = read(css);
	const faults = [...problems];
	for (const { prop, value, selector, at } of decls) {
		const where = `${selector} { ${prop}: ${value} }`;
		if (/:has\(/i.test(selector)) faults.push(`:has() in ${selector}`);
		// a font family is the theme's; the one exception is the user's own monospace choice (Appearance > Monospace font), which a code box such as the Design view's Markdown editor uses
		if (prop === "font-family" && value.trim() !== "var(--font-monospace)") faults.push(`font-family in ${selector}`);
		if (/!\s*important/i.test(value) && !at.some((a) => /prefers-reduced-motion/.test(a))) faults.push(`!important outside reduced motion: ${where}`);
		// what is left of a value once its variables are taken out: a colour written out is found in it
		const bare = value.replace(/var\(\s*--[\w-]+\s*(?:,[^()]*)?\)/g, "var()");
		if (/#[0-9a-f]{3,8}\b/i.test(bare)) faults.push(`a hex colour: ${where}`);
		if (/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*[^)]*\d/i.test(bare)) faults.push(`a colour function with a number: ${where}`);
		if (/--[\w-]*-rgb\b|--mono-rgb-\d+/.test(value) || (prop.startsWith("--") && /-rgb\b|-rgb-/.test(prop))) faults.push(`a deprecated -rgb variable: ${where}`);
		for (const word of bare.toLowerCase().match(/[a-z][a-z-]*/g) ?? []) {
			if (NAMED.has(word)) faults.push(`the named colour ${word}: ${where}`);
		}
		if (prop === "box-shadow" && value !== "none" && !RING.test(value)) faults.push(`a box-shadow that is not a ring: ${where}`);
	}
	return faults;
}

// These guards read styles.base.css, the Obsidian look's own rules: the Paper looks (themes/) deliberately carry colours,
// fonts and motion of their own, and are guarded by test/themes.test.mjs.
test("the stylesheet has none of what the look rules out", () => {
	const css = readFileSync(join(ROOT, "styles.base.css"), "utf8");
	assert.ok(css.length > 10000, "the stylesheet was read");
	assert.deepEqual(lint(css), []);
});

test("the stylesheet's colour mixes sit in @supports, after a plain fill or border", () => {
	const { decls } = read(readFileSync(join(ROOT, "styles.base.css"), "utf8"));
	const mixed = decls.filter((d) => /color-mix\(/.test(d.value));
	assert.ok(mixed.length >= 15, `the stylesheet mixes colours (${mixed.length})`);
	for (const d of mixed) assert.ok(d.at.some((a) => a.startsWith("@supports")), `${d.selector} { ${d.prop} } mixes a colour outside @supports`);
});

test("the checker refuses what the look rules out", () => {
	const bad = {
		"a hex colour": ".a { color: #fff; }",
		"a long hex colour": ".a { background: #00ffaa80; }",
		"rgb with numbers": ".a { color: rgb(1, 2, 3); }",
		"rgba with numbers": ".a { color: rgba(0, 0, 0, 0.5); }",
		"hsl with numbers": ".a { color: hsl(10 20% 30%); }",
		"oklch with numbers": ".a { color: oklch(0.5 0.1 200); }",
		"a -rgb variable": ".a { color: rgba(var(--color-green-rgb), 1); }",
		"a -rgb variable by itself": ".a { --tone: var(--color-red-rgb); }",
		"a -rgb property": ".a { --booklet-tone-rgb: var(--color-red); }",
		"the mono variable": ".a { background: rgb(var(--mono-rgb-100)); }",
		"a named colour": ".a { border-color: red; }",
		"a named colour after a length": ".a { border: 1px solid black; }",
		"a named colour in a mix": ".a { background: color-mix(in srgb, var(--x) 70%, black); }",
		"a font family": ".a { font-family: var(--font-text); }",
		"a font family written out, even a monospace one": ".a { font-family: Menlo, monospace; }",
		"important": ".a { color: var(--text-normal) !important; }",
		"important in a media query that is not reduced motion": "@media (min-width: 10px) { .a { color: var(--x) !important; } }",
		":has()": ".a:has(.b) { color: var(--x); }",
		"a nesting selector": ".a { color: var(--x); & .b { color: var(--y); } }",
		"a rule inside a rule": ".a { color: var(--x); .b { color: var(--y); } }",
		"a blurred shadow": ".a { box-shadow: 0 1px 4px var(--background-modifier-box-shadow); }",
		"a shadow with a written colour": ".a { box-shadow: 0 0 0 2px var(--x), 0 0 0 4px var(--y); }",
		"an offset shadow": ".a { box-shadow: inset 2px 0 0 0 var(--x); }",
	};
	for (const [name, css] of Object.entries(bad)) assert.ok(lint(css).length > 0, `refuses ${name}`);
});

test("the checker lets through what the look is made of", () => {
	const good = {
		"variables": ".a { color: var(--text-normal); background: var(--background-secondary); border: var(--border-width) solid var(--background-modifier-border); }",
		"a variable with a fallback": ".a { color: var(--booklet-tone-wash, var(--booklet-tone)); }",
		"a mix in @supports": "@supports (color: color-mix(in srgb, red, blue)) { .a { background: color-mix(in srgb, var(--color-green) 18%, transparent); } }",
		"rgb of a variable": ".a { --c: rgb(var(--callout-color)); }",
		"transparent and currentColor": ".a { background: transparent; border-color: currentColor; color: inherit; }",
		"the user's own monospace font": ".a { font-family: var(--font-monospace); }",
		"a ring": ".a { box-shadow: inset 0 0 0 2px var(--color-green); }",
		"a ring with a variable width": ".a { box-shadow: inset 0 0 0 var(--size-2-1) var(--interactive-accent); }",
		"no shadow": ".a { box-shadow: none; }",
		"important under reduced motion": "@media (prefers-reduced-motion: reduce) { .a * { transition: none !important; } }",
		"a class that has a colour's name": ".booklet-colour-red { --booklet-tone: var(--color-red); }",
		"a media query": "@media (max-height: 360px) { .a { position: static; } }",
		"a container query": "@container (width < 15em) { .a { display: block; } }",
		"a selector with an attribute": '.callout[data-callout="diff"] .b { color: var(--text-normal); }',
	};
	for (const [name, css] of Object.entries(good)) assert.deepEqual(lint(css), [], `lets through ${name}`);
});

test("a look's variables are set once, on the view, and the sheet, group and block rules use them", () => {
	const css = readFileSync(join(ROOT, "styles.base.css"), "utf8");
	const { decls } = read(css);
	const defaults = {
		"--booklet-card-bg": "var(--background-secondary)",
		"--booklet-card-border": "var(--background-modifier-border)",
		"--booklet-card-radius": "var(--radius-l)",
		"--booklet-card-pad": "var(--size-4-4)",
		"--booklet-block-edge": "var(--size-2-3)",
	};
	for (const [name, value] of Object.entries(defaults)) {
		const set = decls.filter((d) => d.prop === name);
		assert.equal(set.length, 1, `${name} is declared once`);
		// the Design view's inert drawings (.booklet-sample) take the same five in the same rule, so the set is still one
		assert.deepEqual(set[0].selector.split(/\s*,\s*/), [".booklet-view", ".booklet-sample"], `${name} is declared on .booklet-view (and the inert drawings)`);
		assert.equal(set[0].value, value, `${name} defaults to Obsidian's ${value}`);
	}
	const used = (name, selector) => decls.some((d) => d.selector.split(/\s*,\s*/).includes(selector) && d.value.includes(`var(${name})`));
	assert.ok(used("--booklet-card-bg", ".booklet-question"), "the sheet's fill");
	assert.ok(used("--booklet-card-border", ".booklet-question"), "the sheet's hairline");
	assert.ok(used("--booklet-card-radius", ".booklet-group"), "the group's radius");
	assert.ok(used("--booklet-card-pad", ".booklet-question"), "the sheet's room");
	assert.ok(used("--booklet-card-pad", ".booklet-group-title"), "the group's room");
	assert.ok(used("--booklet-block-edge", ".booklet-view .callout"), "the block's edge");
	assert.ok(used("--booklet-block-edge", ".booklet-view .booklet-question.booklet-answered-right"), "the answered sheet's edge");
});
