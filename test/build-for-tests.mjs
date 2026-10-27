/*
 * What `npm test` runs first. The tests are plain JavaScript run by `node --test`, so the TypeScript
 * they test is bundled here with esbuild (no type stripping needed, any Node 18+ will do):
 *   test/.build/core.mjs   src/core/index.ts as an ES module (the core imports nothing from Obsidian)
 *   test/.build/main.js    src/main.ts with the release options, for the check that it uses no Node API
 */
import esbuild from "esbuild";
import { pluginOptions } from "../build-options.mjs";

await esbuild.build({
	entryPoints: ["src/core/index.ts"],
	bundle: true,
	format: "esm",
	platform: "neutral",
	target: "es2021",
	outfile: "test/.build/core.mjs",
	logLevel: "warning",
});
await esbuild.build({ ...pluginOptions(true), outfile: "test/.build/main.js", logLevel: "warning" });
