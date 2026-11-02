/*
 * What `npm test` runs first. The tests are plain JavaScript run by `node --test`, so the TypeScript
 * they test is bundled here with esbuild (no type stripping needed):
 *   test/.build/core.mjs   src/core/index.ts as an ES module (the core imports nothing from Obsidian)
 *   test/.build/main.js    src/main.ts with the release options, for the check that it uses no Node API
 *   test/.build/view.mjs   src/view.ts and the plugin class of src/main.ts (BookletPlugin), with "obsidian" standing for
 *                          the few parts of its API they use (test/obsidian-stub.mjs), run over a jsdom document by
 *                          test/view.test.mjs
 *   test/.build/media.mjs  the media slots and players, the allow card and the settings page from src/, the same way, for the media,
 *                          allow-card and settings tests
 *   test/.build/screens.mjs  drawPicture and Booklet's icon set from src/, the same way, for test/picture.test.mjs
 *                            and numericColumns, drawMarks and the held store, for the leftovers and review tests
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
	stdin: { contents: 'export * from "./src/view"; export { default as BookletPlugin } from "./src/main"; export { MediaAllows } from "./src/settings";', resolveDir: ".", loader: "ts" },
	bundle: true,
	format: "esm",
	platform: "neutral",
	target: "es2021",
	alias: { obsidian: "./test/obsidian-stub.mjs" },
	outfile: "test/.build/view.mjs",
	logLevel: "warning",
});
await esbuild.build({
	stdin: { contents: 'export { drawPicture } from "./src/screens"; export { BOOKLET_ICONS } from "./src/booklet-icons"; export { numericColumns, words } from "./src/query-view"; export { drawMarks } from "./src/reading"; export { mountQuery } from "./src/query-controls"; export { drawChart } from "./src/charts"; export { keepStepsOne, loadStepsOne, moveHeld, keepHeld, loadHeld } from "./src/held-store";', resolveDir: ".", loader: "ts" },
	bundle: true,
	format: "esm",
	platform: "neutral",
	target: "es2021",
	alias: { obsidian: "./test/obsidian-stub.mjs" },
	outfile: "test/.build/screens.mjs",
	logLevel: "warning",
});
await esbuild.build({
	stdin: { contents: 'export { createPlayer, drawMedia, drawLinkHosts, keepLocalPreload, playerHost, isTrustedPress, PressedSlot } from "./src/media-view"; export { openAllowCard } from "./src/allow-card"; export { BookletSettingTab, MediaAllows } from "./src/settings";', resolveDir: ".", loader: "ts" },
	bundle: true,
	format: "esm",
	platform: "neutral",
	target: "es2021",
	alias: { obsidian: "./test/obsidian-stub.mjs" },
	outfile: "test/.build/media.mjs",
	logLevel: "warning",
});
