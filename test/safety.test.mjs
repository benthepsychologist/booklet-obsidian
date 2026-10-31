/*
 * What Obsidian's review rules and Obsidian Mobile need, checked over src/ and the built main.js:
 * no innerHTML, outerHTML or insertAdjacentHTML; no inline styles; no Node or Electron module.
 * Also: the copy of the plugin inside test-vault/ is the current build, and test-vault/.obsidian
 * holds nothing else.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative } from "node:path";
import { ROOT } from "./helpers.mjs";

const HTML_SINKS = /\b(innerHTML|outerHTML|insertAdjacentHTML)\b/;
const NODE_MODULES = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`), "electron", "original-fs"]);

function filesUnder(dir, ext) {
	const out = [];
	for (const f of readdirSync(dir)) {
		const p = join(dir, f);
		if (statSync(p).isDirectory()) out.push(...filesUnder(p, ext));
		else if (p.endsWith(ext)) out.push(p);
	}
	return out;
}

/** Every module specifier a file names: import … from "x", import("x"), require("x"). */
function specifiers(src) {
	const out = [];
	for (const re of [/\bfrom\s*["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, /^\s*import\s+["']([^"']+)["']/gm])
		for (const m of src.matchAll(re)) out.push(m[1]);
	return out;
}

const builtFiles = () =>
	[join(ROOT, "test/.build/main.js"), join(ROOT, "main.js"), join(ROOT, "test-vault/.obsidian/plugins/booklet/main.js")].filter(existsSync);

test("src/: no innerHTML, outerHTML or insertAdjacentHTML, and no inline styles", () => {
	const files = filesUnder(join(ROOT, "src"), ".ts");
	assert.ok(files.length >= 6);
	for (const f of files) {
		const src = readFileSync(f, "utf8");
		assert.ok(!HTML_SINKS.test(src), `${relative(ROOT, f)} uses ${src.match(HTML_SINKS)?.[0]}`);
		assert.ok(!/\.style\b|cssText|setCssStyles|setCssProps|["']style["']/.test(src), `${relative(ROOT, f)} sets a style inline`);
	}
});

test("src/: imports only obsidian, monkey-around and its own files; src/core/ imports nothing but itself", () => {
	for (const f of filesUnder(join(ROOT, "src"), ".ts")) {
		const src = readFileSync(f, "utf8");
		for (const s of specifiers(src)) {
			assert.ok(!NODE_MODULES.has(s), `${relative(ROOT, f)} imports the Node or Electron module "${s}"`);
			// Reference extraction uses the approved Obsidian-compatible Markdown parser.
			const parser = f.endsWith("/src/core/references.ts") && (s === "unified" || s === "@quartz-community/remark-obsidian");
			const allowed = s.startsWith("./") || s.startsWith("../") || parser || (!f.includes("/src/core/") && (s === "obsidian" || s === "monkey-around"));
			assert.ok(allowed, `${relative(ROOT, f)} imports "${s}"`);
		}
		assert.ok(!/\b(window\.)?require\s*\(/.test(src), `${relative(ROOT, f)} calls require`);
	}
});

test("the built main.js: no HTML sinks, and the only module it asks for is obsidian", () => {
	const files = builtFiles();
	assert.ok(files.length >= 1, "no built main.js (npm test builds test/.build/main.js first)");
	for (const f of files) {
		const js = readFileSync(f, "utf8");
		assert.ok(!HTML_SINKS.test(js), `${relative(ROOT, f)} contains ${js.match(HTML_SINKS)?.[0]}`);
		const reqs = [...js.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
		assert.ok(reqs.length >= 1, `${relative(ROOT, f)}: no require("obsidian") found`);
		for (const r of reqs) assert.equal(r, "obsidian", `${relative(ROOT, f)} requires "${r}"`);
		assert.ok(!/\brequire\s*\(\s*[^"'\s)]/.test(js), `${relative(ROOT, f)} calls require with a computed name`);
		assert.ok(!/\b(process\.(env|platform|versions|cwd)|Buffer\.|__dirname|__filename)\b/.test(js), `${relative(ROOT, f)} uses a Node global`);
	}
});

test("test-vault: the plugin copy is the current build, and .obsidian holds nothing else", () => {
	const vault = join(ROOT, "test-vault/.obsidian");
	assert.deepEqual(JSON.parse(readFileSync(join(vault, "community-plugins.json"), "utf8")), ["booklet"]);
	const found = filesUnder(vault, "").map((f) => relative(vault, f)).sort();
	assert.deepEqual(found, ["community-plugins.json", "plugins/booklet/main.js", "plugins/booklet/manifest.json", "plugins/booklet/styles.css"],
		"test-vault/.obsidian should hold only the plugin and community-plugins.json (did Obsidian open this folder as a vault?)");
	for (const f of ["manifest.json", "styles.css", "main.js"]) {
		if (!existsSync(join(ROOT, f))) continue;
		assert.equal(readFileSync(join(vault, "plugins/booklet", f), "utf8"), readFileSync(join(ROOT, f), "utf8"), `${f} in the vault is not the current one: run npm run build`);
	}
});

test("manifest.json follows the submission rules these tests can check; versions.json and package.json agree", () => {
	const m = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
	assert.equal(m.id, "booklet");
	assert.equal(m.name, "Booklet");
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
	assert.equal(m.author, "Ben Armstrong");
	assert.equal(m.isDesktopOnly, false);
	assert.equal(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version, m.version);
	assert.equal(JSON.parse(readFileSync(join(ROOT, "versions.json"), "utf8"))[m.version], m.minAppVersion);
	assert.ok(m.description.length <= 250 && m.description.endsWith("."));
	assert.ok(!/\p{Extended_Pictographic}/u.test(m.description), "no emoji in the description");
	assert.match(m.minAppVersion, /^\d+\.\d+\.\d+$/);
});
