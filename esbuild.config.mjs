/*
 * Builds main.js (as the official sample plugin does), then copies main.js, manifest.json and
 * styles.css into test-vault/.obsidian/plugins/booklet/, so the test vault opens with the
 * plugin installed and no Node on the machine that opens it.
 *   node esbuild.config.mjs production   one minified build
 *   node esbuild.config.mjs              watch, with an inline source map
 */
import esbuild from "esbuild";
import process from "node:process";
import { copyFileSync, mkdirSync } from "node:fs";
import { pluginOptions } from "./build-options.mjs";

const prod = process.argv[2] === "production";
const VAULT_PLUGIN = "test-vault/.obsidian/plugins/booklet";

function copyIntoVault() {
	mkdirSync(VAULT_PLUGIN, { recursive: true });
	for (const f of ["main.js", "manifest.json", "styles.css"]) copyFileSync(f, `${VAULT_PLUGIN}/${f}`);
	console.log(`copied main.js, manifest.json and styles.css into ${VAULT_PLUGIN}/`);
}

const copyPlugin = {
	name: "copy-into-test-vault",
	setup(build) {
		build.onEnd((result) => {
			if (!result.errors.length) copyIntoVault();
		});
	},
};

const context = await esbuild.context({ ...pluginOptions(prod), plugins: [copyPlugin] });

if (prod) {
	await context.rebuild();
	await context.dispose();
	process.exit(0);
} else {
	await context.watch();
}
