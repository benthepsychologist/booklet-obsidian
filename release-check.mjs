/*
 * Run by the release workflow before it builds. The pushed tag is one of two kinds:
 *   - a plain x.y.z (1.0.1): a real release, the one Obsidian's directory reads. The tag must be the version in package.json,
 *     manifest.json and versions.json.
 *   - x.y.z-<suffix> (1.0.2-beta.1): a pre-release, for testing in BRAT before the real one. The x.y.z in front of the suffix
 *     must be that version in the three files; the suffix is only a name for the test build. The directory never sees it:
 *     it takes plain x.y.z, and GitHub's "latest release" ignores pre-releases.
 * Anything else (a leading v, two numbers, an empty suffix, build metadata with +) stops the release.
 *   node release-check.mjs <tag>
 * It prints the kind it found, and when run by GitHub Actions (GITHUB_OUTPUT set) writes it there as `kind=release` or
 * `kind=prerelease`, for the workflow to choose how to publish and whether the tag has to be on main.
 */
import { appendFileSync, readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

/** x.y.z, then optionally a hyphen and dot-separated names made of letters, digits and hyphens (semver's own shape for a pre-release). */
const TAG = /^(\d+\.\d+\.\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/**
 * Checks a tag against the three version files, given as objects. Returns `{ kind, base, problems }`: kind is "release" (a plain
 * x.y.z), "prerelease" (x.y.z-suffix) or null (not a tag this workflow takes), base is the x.y.z, problems lists what is wrong.
 */
export function checkRelease(tag, { manifest, pkg, versions }) {
	const problems = [];
	const m = TAG.exec(tag);
	if (!m) {
		problems.push(`the tag "${tag}" is neither a plain x.y.z version nor x.y.z-<suffix>`);
		return { kind: null, base: null, problems };
	}
	const base = m[1];
	const kind = m[2] === undefined ? "release" : "prerelease";
	const said = kind === "release" ? `the tag is ${tag}` : `the tag is ${tag}, whose version is ${base}`;
	if (manifest.version !== base) problems.push(`manifest.json says ${manifest.version}, ${said}`);
	if (pkg.version !== base) problems.push(`package.json says ${pkg.version}, ${said}`);
	if (versions[base] !== manifest.minAppVersion)
		problems.push(`versions.json does not give ${base} the manifest's minAppVersion ${manifest.minAppVersion}`);
	return { kind, base, problems };
}

function main() {
	const tag = process.argv[2] ?? "";
	const read = (file) => JSON.parse(readFileSync(file, "utf8"));
	const { kind, base, problems } = checkRelease(tag, { manifest: read("manifest.json"), pkg: read("package.json"), versions: read("versions.json") });

	if (problems.length) {
		for (const p of problems) console.error(`release-check: ${p}`);
		process.exit(1);
	}
	if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `kind=${kind}\n`);
	console.log(
		kind === "release" ? `release-check: ${tag} is the version everywhere (a real release)` : `release-check: ${tag} is a pre-release of ${base}, the version everywhere`,
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
