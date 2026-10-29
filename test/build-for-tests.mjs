/*
 * What `npm test` runs first. The tests are plain JavaScript run by `node --test`, so the TypeScript
 * they test is bundled here with esbuild (no type stripping needed):
 *   test/.build/core.mjs   src/core/index.ts as an ES module (the core imports nothing from Obsidian)
 *   test/.build/main.js    src/main.ts with the release options, for the check that it uses no Node API
 *   test/.build/view.mjs   src/view.ts, with "obsidian" standing for the few parts of its API the view uses
 *                          (test/obsidian-stub.mjs), run over a jsdom document by test/view.test.mjs
 *   test/.build/screens.mjs  drawPicture and Booklet's icon set from src/, the same way, for test/picture.test.mjs
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
await esbuild.build({
	entryPoints: ["src/view.ts"],
	bundle: true,
	format: "esm",
	platform: "neutral",
	target: "es2021",
	alias: { obsidian: "./test/obsidian-stub.mjs" },
	outfile: "test/.build/view.mjs",
	logLevel: "warning",
});
await esbuild.build({
	stdin: { contents: 'export { drawPicture } from "./src/screens"; export { BOOKLET_ICONS } from "./src/booklet-icons"; export { numericColumns } from "./src/query-view";', resolveDir: ".", loader: "ts" },
	bundle: true,
	format: "esm",
	platform: "neutral",
	target: "es2021",
	alias: { obsidian: "./test/obsidian-stub.mjs" },
	outfile: "test/.build/screens.mjs",
	logLevel: "warning",
});
