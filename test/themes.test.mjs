/* Guards for the Paper looks (themes/*.css): they are the only rules in styles.css allowed colours, fonts and motion of their own,
   and they must never reach outside the booklet view or be on in the Obsidian look. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const parts = readdirSync(join(ROOT, "themes")).filter((f) => f.endsWith(".css"));
const css = (f) => readFileSync(join(ROOT, "themes", f), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

test("the theme parts exist", () => {
	for (const f of ["fonts.css", "tokens-paper-light.css", "tokens-paper-dark.css", "structure.css", "pictures.css"]) assert.ok(parts.includes(f), f);
});

test("every part in PARTS exists", async () => {
	const { PARTS } = await import(join(ROOT, "scripts", "build-styles.mjs"));
	for (const p of PARTS) assert.ok(existsSync(join(ROOT, p)), `${p} is in PARTS but does not exist`);
});

test("styles.css is the base sheet plus the parts, as the build script makes it", async () => {
	const { PARTS } = await import(join(ROOT, "scripts", "build-styles.mjs"));
	const built = readFileSync(join(ROOT, "styles.css"), "utf8");
	assert.ok(built.startsWith(readFileSync(join(ROOT, "styles.base.css"), "utf8")), "styles.css begins with styles.base.css, unchanged");
	for (const p of PARTS.filter((x) => x !== "styles.base.css")) assert.ok(built.includes(readFileSync(join(ROOT, p), "utf8")), `${p} is in styles.css (run node scripts/build-styles.mjs)`);
});

test("no theme part uses !important, a network address or a forbidden property", () => {
	for (const f of parts) {
		const c = strip(css(f));
		assert.ok(!/!important/.test(c), `${f}: !important`);
		assert.ok(!/url\(\s*["']?https?:/.test(c), `${f}: a network address`);
		assert.ok(!/@import/.test(c), `${f}: @import`);
		assert.ok(!/\ball\s*:\s*unset/.test(c), `${f}: all: unset`);
		assert.ok(!/display\s*:\s*contents/.test(c), `${f}: display: contents`);
		assert.ok(!/text-indent/.test(c), `${f}: text-indent`);
	}
});

test("every theme rule is inside .booklet-view and in a Paper look", () => {
	for (const f of ["tokens-paper-light.css", "tokens-paper-dark.css", "structure.css", "pictures.css"]) {
		const c = strip(css(f)).replace(/@media[^{]*\{/g, "").replace(/@supports[^{]*\{/g, "");
		const flat = (x) => { let y = x; for (let k = 0; k < 4; k++) y = y.replace(/\([^()]*\)/g, ""); return y; }; // commas inside :is(...) and :not(...) do not separate selectors
		const selectors = c.split("}").map((b) => flat(b.split("{")[0].trim())).filter(Boolean);
		for (const group of selectors) for (const sel of group.split(",").map((x) => x.trim()).filter(Boolean)) {
			if (f === "pictures.css" && /^\.booklet-spot$/.test(sel)) continue; // hidden by default, so the Obsidian look is unchanged
			assert.ok(/^\.booklet-view\[data-booklet-look/.test(sel), `${f}: "${sel}" is not scoped to a look on .booklet-view`);
		}
	}
});

test("motion sits inside prefers-reduced-motion: no-preference", () => {
	for (const f of ["structure.css", "pictures.css"]) {
		const c = strip(css(f));
		let rest = c, depth = 0, out = "";
		for (let i = 0; i < rest.length; i++) {
			if (rest.startsWith("@media (prefers-reduced-motion: no-preference)", i) && depth === 0) {
				let j = rest.indexOf("{", i), d = 1;
				j++;
				while (d > 0 && j < rest.length) { if (rest[j] === "{") d++; else if (rest[j] === "}") d--; j++; }
				i = j - 1;
				continue;
			}
			out += rest[i];
		}
		assert.ok(!/\b(transition|animation)\s*:/.test(out), `${f}: a transition or animation outside the no-preference block`);
		assert.ok(!/@keyframes/.test(out) || /no-preference/.test(c), `${f}: keyframes`);
	}
});
