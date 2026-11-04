// URLs and downloads. The Obsidian APK is fetched at run time from Obsidian's own releases and kept only in the cache folder (never committed).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";

export const OBSIDIAN_RELEASES = "https://github.com/obsidianmd/obsidian-releases/releases/download";
export const PLUGIN_REPO = "benthepsychologist/booklet-obsidian";
export const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];

/** The test tool's own list of Obsidian versions and their downloads. The tool reads this same file; it says which versions have an Android APK. */
export const VERSIONS_URL = "https://raw.githubusercontent.com/jesse-r-s-hines/wdio-obsidian-service/HEAD/obsidian-versions.json";

/** Thrown when a version has no APK, with the versions that do. */
export class NoApkError extends Error {}

/** The APK a version would normally have, by Obsidian's naming (tag "v1.15.0", asset "Obsidian-1.15.0.apk"). Used only to show what to expect; the list above decides. */
export function expectedApkUrl(version) {
	if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`not an Obsidian version: ${version}`);
	return `${OBSIDIAN_RELEASES}/v${version}/Obsidian-${version}.apk`;
}

/** The versions in the metadata that have an APK, as strings, oldest first. */
export function versionsWithApk(meta) {
	return (meta?.versions ?? []).filter((v) => v?.downloads?.apk && !v.isBeta).map((v) => v.version);
}

/**
 * The APK for an Obsidian version, from the metadata (obsidian-versions.json). Returns { url, apkVersion, mapped }.
 * `apkVersion` is the version the APK really is: Obsidian sometimes ships a patch release without a new APK, and then
 * the list points at the earlier one (1.14.5 -> Obsidian-1.14.4.apk). A version with no APK is refused, naming those that have one.
 */
export function apkFor(meta, version) {
	if (!/^\d+\.\d+\.\d+$/.test(version)) throw new NoApkError(`not an Obsidian version: ${version}`);
	const entry = (meta?.versions ?? []).find((v) => v?.version === version);
	const url = entry?.downloads?.apk;
	if (!url) {
		const have = versionsWithApk(meta);
		throw new NoApkError(`Obsidian ${version} has no Android APK in the version list (${entry ? "the version exists but has no APK" : "the version is not in the list"}). Versions that have one: ${have.join(", ") || "(none found)"}.`);
	}
	const m = url.match(/\/Obsidian-(\d+\.\d+\.\d+)\.apk$/);
	if (!m || !url.startsWith(`${OBSIDIAN_RELEASES}/`)) throw new NoApkError(`the version list gives an unexpected APK address for ${version}: ${url}`);
	return { url, apkVersion: m[1], mapped: m[1] !== version };
}

/** Fetches the version list. */
export async function fetchVersions({ fetchImpl = fetch, url = VERSIONS_URL, timeoutMs = 60000 } = {}) {
	const res = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
	if (!res.ok) throw new Error(`GET ${url} answered ${res.status} ${res.statusText}`);
	const meta = await res.json();
	if (!Array.isArray(meta?.versions)) throw new Error(`${url} is not a version list (no "versions" array)`);
	return meta;
}

/** One file of a GitHub release of the plugin. The repository's tags have no leading "v". */
export function pluginAssetUrl(tag, name, repo = PLUGIN_REPO) {
	if (!PLUGIN_FILES.includes(name)) throw new Error(`not a release file of the plugin: ${name}`);
	if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error(`not a release tag: ${tag}`);
	return `https://github.com/${repo}/releases/download/${tag}/${name}`;
}

export async function sha256File(file) {
	const h = crypto.createHash("sha256");
	await pipeline(fs.createReadStream(file), h);
	return h.digest("hex");
}

/**
 * Downloads `url` to `dest` (written to a temporary name first, then renamed, so a stopped download is never taken for a whole one).
 * Redirects are followed (GitHub sends release files through one). Returns { bytes }.
 */
export async function downloadTo(url, dest, { log = () => {}, fetchImpl = fetch, timeoutMs = 10 * 60 * 1000 } = {}) {
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	const tmp = `${dest}.part-${process.pid}`;
	const res = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
	if (!res.ok || !res.body) throw new Error(`GET ${url} answered ${res.status} ${res.statusText}`);
	const want = Number(res.headers.get("content-length")) || 0;
	let seen = 0;
	let next = 0;
	const counter = byteCounter((n) => {
		seen += n;
		if (want && seen / want >= next) {
			log(`  ${Math.round((seen / want) * 100)}% of ${(want / 1e6).toFixed(1)} MB`);
			next += 0.25;
		}
	});
	try {
		await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(tmp));
		if (want && seen !== want) throw new Error(`got ${seen} bytes of ${want}`);
		fs.renameSync(tmp, dest);
	} catch (e) {
		fs.rmSync(tmp, { force: true });
		throw e;
	}
	return { bytes: seen };
}

function byteCounter(onBytes) {
	return new Transform({
		transform(chunk, _enc, cb) {
			onBytes(chunk.length);
			cb(null, chunk);
		},
	});
}
