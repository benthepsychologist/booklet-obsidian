/* Builds styles.css (the file Obsidian loads) from styles.base.css and the theme parts, in this order.
   Run by esbuild.config.mjs and by `node scripts/build-styles.mjs`. styles.css is committed, as before. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const PARTS = [
	"styles.base.css",
	"themes/fonts.css",
	"themes/tokens-paper-light.css",
	"themes/tokens-paper-dark.css",
	"themes/structure.css",
	"themes/pictures.css",
];

export function buildStyles() {
	// every part is required: a missing one is an error, never a silently thinner sheet
	for (const p of PARTS) if (!existsSync(p)) throw new Error(`build-styles: part ${p} is missing`);
	const out = PARTS
		.map((p) => (p === "styles.base.css" ? readFileSync(p, "utf8") : `\n/* ===== ${p} ===== */\n` + readFileSync(p, "utf8")))
		.join("");
	writeFileSync("styles.css", out);
	return out.length;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(`styles.css: ${buildStyles()} characters`);
