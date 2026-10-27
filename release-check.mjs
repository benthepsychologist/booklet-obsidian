/*
 * Run by the release workflow before it builds: the pushed tag must be a plain x.y.z version
 * (Obsidian's directory takes no other kind), and package.json, manifest.json and versions.json
 * must all say it. Anything else stops the release.
 *   node release-check.mjs <tag>
 */
import { readFileSync } from "node:fs";
import process from "node:process";

const tag = process.argv[2] ?? "";
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const manifest = read("manifest.json");
const pkg = read("package.json");
const versions = read("versions.json");

const problems = [];
if (!/^\d+\.\d+\.\d+$/.test(tag)) problems.push(`the tag "${tag}" is not a plain x.y.z version`);
if (manifest.version !== tag) problems.push(`manifest.json says ${manifest.version}, the tag is ${tag}`);
if (pkg.version !== tag) problems.push(`package.json says ${pkg.version}, the tag is ${tag}`);
if (versions[tag] !== manifest.minAppVersion)
	problems.push(`versions.json does not give ${tag} the manifest's minAppVersion ${manifest.minAppVersion}`);

if (problems.length) {
	for (const p of problems) console.error(`release-check: ${p}`);
	process.exit(1);
}
console.log(`release-check: ${tag} is the version everywhere`);
