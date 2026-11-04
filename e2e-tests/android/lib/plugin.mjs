// Gets the plugin build to test into one folder holding main.js, manifest.json and styles.css.
import fs from "node:fs";
import path from "node:path";
import { PLUGIN_FILES, pluginAssetUrl, downloadTo, sha256File } from "./download.mjs";

/** Reads and checks manifest.json in `dir`. Returns the manifest. */
export function readManifest(dir) {
	const file = path.join(dir, "manifest.json");
	let m;
	try {
		m = JSON.parse(fs.readFileSync(file, "utf8"));
	} catch (e) {
		throw new Error(`cannot read ${file}: ${e.message}`);
	}
	for (const k of ["id", "version", "minAppVersion"]) if (typeof m[k] !== "string" || !m[k]) throw new Error(`${file} has no "${k}"`);
	return m;
}

/** What is wrong with a folder as a plugin build, as a list of sentences (empty when it is usable). */
export function problemsWith(dir) {
	const out = [];
	for (const f of PLUGIN_FILES) {
		let st;
		try {
			st = fs.statSync(path.join(dir, f));
		} catch {
			out.push(`${f} is missing from ${dir}${f === "main.js" ? " (run \"npm run build\" in the repository first)" : ""}`);
			continue;
		}
		if (!st.isFile() || st.size === 0) out.push(`${f} in ${dir} is empty`);
	}
	return out;
}

/**
 * Stages the build under test in `stageDir` and returns { dir, source, manifest, files: [{name, bytes, sha256}] }.
 * `release` (a tag) downloads the three files from the plugin's GitHub release; otherwise `pluginDir` is copied.
 */
export async function stagePlugin({ pluginDir, release, stageDir, log = () => {}, download = downloadTo }) {
	fs.rmSync(stageDir, { recursive: true, force: true });
	fs.mkdirSync(stageDir, { recursive: true });
	let source;
	if (release) {
		source = `GitHub release ${release}`;
		for (const f of PLUGIN_FILES) {
			const url = pluginAssetUrl(release, f);
			log(`downloading ${url}`);
			await download(url, path.join(stageDir, f), { log });
		}
	} else {
		source = `folder ${pluginDir}`;
		const bad = problemsWith(pluginDir);
		if (bad.length) throw new Error(bad.join("; "));
		for (const f of PLUGIN_FILES) fs.copyFileSync(path.join(pluginDir, f), path.join(stageDir, f));
	}
	const bad = problemsWith(stageDir);
	if (bad.length) throw new Error(bad.join("; "));
	const manifest = readManifest(stageDir);
	const files = [];
	for (const name of PLUGIN_FILES) {
		const p = path.join(stageDir, name);
		files.push({ name, bytes: fs.statSync(p).size, sha256: await sha256File(p) });
	}
	return { dir: stageDir, source, manifest, files };
}
