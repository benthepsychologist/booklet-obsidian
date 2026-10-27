/*
 * Run by `npm version <x.y.z>` (the "version" script in package.json), as the official sample
 * plugin does: npm has just written the new version into package.json, and this writes it into
 * manifest.json and adds it to versions.json with the manifest's minAppVersion. .npmrc stops npm
 * from committing or tagging; tagging is done on main once the change is merged (README, Releasing).
 */
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const version = process.env.npm_package_version;
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
	console.error(`version-bump: "${version}" is not a plain x.y.z version`);
	process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = version;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[version] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
