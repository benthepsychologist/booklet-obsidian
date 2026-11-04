// Command-line options for run.mjs. Pure: no file or network access, so it is tested in test/args.test.mjs.
import path from "node:path";

export class ArgError extends Error {}

export const DEFAULTS = Object.freeze({
	obsidian: "1.15.0",
	api: "36",
	imageTag: "google_apis",
	abi: "arm64-v8a",
	device: "pixel",
	avd: "booklet-android",
	emulatorPort: 5554,
	appiumPort: 4723,
	timeoutScale: 1,
});

const VALUE_FLAGS = {
	"--plugin-dir": "pluginDir",
	"--release": "release",
	"--obsidian": "obsidian",
	"--apk": "apk",
	"--avd": "avd",
	"--api": "api",
	"--image-tag": "imageTag",
	"--abi": "abi",
	"--device": "device",
	"--sdk": "sdk",
	"--out": "out",
	"--cache": "cache",
	"--emulator-port": "emulatorPort",
	"--appium-port": "appiumPort",
	"--timeout-scale": "timeoutScale",
	"--only": "only",
};
const BOOL_FLAGS = {
	"--help": "help",
	"-h": "help",
	"--dry-run": "dryRun",
	"--check": "check",
	"--headless": "headless",
	"--mute": "mute",
	"--skip-lock": "skipLock",
	"--keep-running": "keepRunning",
	"--recreate-avd": "recreateAvd",
	"--reuse-emulator": "reuseEmulator",
	"--verbose": "verbose",
};
export const CHECK_IDS = ["plugin-loads", "booklet-view", "pages-menu", "allow-card", "now-playing", "answers-kept", "page-kept"];

/** The tag of a GitHub release of the plugin: digits and dots with an optional suffix, no leading "v" (the repository's tags have none). */
export function isReleaseTag(tag) {
	return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag);
}

export function parseArgs(argv, { repoRoot, here }) {
	const o = { ...DEFAULTS };
	for (let i = 0; i < argv.length; i++) {
		const raw = argv[i];
		let flag = raw;
		let inline;
		const eq = raw.startsWith("--") ? raw.indexOf("=") : -1;
		if (eq > 0) {
			flag = raw.slice(0, eq);
			inline = raw.slice(eq + 1);
		}
		if (flag in BOOL_FLAGS) {
			if (inline !== undefined) throw new ArgError(`${flag} takes no value`);
			o[BOOL_FLAGS[flag]] = true;
		} else if (flag in VALUE_FLAGS) {
			const v = inline !== undefined ? inline : argv[++i];
			if (v === undefined || v === "" || (inline === undefined && v.startsWith("--"))) throw new ArgError(`${flag} needs a value`);
			o[VALUE_FLAGS[flag]] = v;
		} else {
			throw new ArgError(`unknown option ${raw} (see --help)`);
		}
	}
	if (o.pluginDir && o.release) throw new ArgError("use --plugin-dir or --release, not both");
	if (o.release && !isReleaseTag(o.release)) throw new ArgError(`--release ${o.release}: expected a tag like 1.0.1 or 1.0.2-beta.1 (no leading "v")`);
	if (!/^(\d+\.\d+\.\d+|min|both)$/.test(String(o.obsidian))) throw new ArgError(`--obsidian ${o.obsidian}: expected a version like 1.15.0, "min" (the plugin's minAppVersion) or "both" (${DEFAULTS.obsidian}, then the minimum)`);
	// "min" is resolved to the plugin's manifest minAppVersion once the build is staged
	o.versions = o.obsidian === "both" ? [DEFAULTS.obsidian, "min"] : [o.obsidian];
	if (!/^[A-Za-z0-9._-]+$/.test(o.avd)) throw new ArgError(`--avd ${o.avd}: use letters, digits, dot, dash or underscore`);
	if (!/^\d+(\.\d+)?(-ext\d+)?$/.test(String(o.api))) throw new ArgError(`--api ${o.api}: expected an Android API level like 36`);
	for (const k of ["emulatorPort", "appiumPort"]) {
		const n = Number(o[k]);
		if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new ArgError(`--${k === "emulatorPort" ? "emulator-port" : "appium-port"} ${o[k]}: expected a port from 1024 to 65535`);
		o[k] = n;
	}
	if (o.emulatorPort % 2 !== 0 || o.emulatorPort < 5554 || o.emulatorPort > 5584) throw new ArgError(`--emulator-port ${o.emulatorPort}: an emulator console port is an even number from 5554 to 5584`);
	const scale = Number(o.timeoutScale);
	if (!(scale >= 0.25 && scale <= 20)) throw new ArgError(`--timeout-scale ${o.timeoutScale}: expected a number from 0.25 to 20`);
	o.timeoutScale = scale;
	if (o.only !== undefined) {
		o.only = String(o.only).split(",").map((s) => s.trim()).filter(Boolean);
		const bad = o.only.filter((s) => !CHECK_IDS.includes(s));
		if (bad.length) throw new ArgError(`--only: unknown check ${bad.join(", ")}; known: ${CHECK_IDS.join(", ")}`);
	}
	if (!o.release) o.pluginDir = path.resolve(o.pluginDir || repoRoot);
	if (o.apk) o.apk = path.resolve(o.apk);
	o.out = path.resolve(o.out || path.join(here, "results"));
	o.cache = path.resolve(o.cache || path.join(here, ".cache"));
	if (o.sdk) o.sdk = path.resolve(o.sdk);
	return o;
}

export function systemImage(o) {
	return `system-images;android-${o.api};${o.imageTag};${o.abi}`;
}

export function usage() {
	return `Usage: node e2e-tests/android/run.mjs [options]

Runs Booklet in the official Obsidian Android app inside an Android emulator, checks it, and writes
results.md, results.json and screenshots to a timestamped folder. Read e2e-tests/android/STEPS.md first.

What to test
  --plugin-dir <dir>     folder with main.js, manifest.json, styles.css (default: this repository, after "npm run build")
  --release <tag>        instead, download those three files from that GitHub release, e.g. 1.0.1
  --obsidian <version>   Obsidian Android app version (default ${DEFAULTS.obsidian}); its APK is fetched from obsidianmd/obsidian-releases.
                         "min" = the plugin's minAppVersion from its manifest (the second run Ben should do);
                         "both" = ${DEFAULTS.obsidian} and then min, into two result folders, one emulator boot
  --apk <file>           use this APK file instead of downloading one

The phone
  --avd <name>           Android Virtual Device name (default ${DEFAULTS.avd}); created if missing
  --api <level>          Android API level (default ${DEFAULTS.api})
  --image-tag <tag>      system image flavour (default ${DEFAULTS.imageTag}); --abi <abi> (default ${DEFAULTS.abi})
  --device <id>          avdmanager hardware profile (default ${DEFAULTS.device})
  --recreate-avd         delete and make the AVD again
  --reuse-emulator       use the emulator already running on --emulator-port instead of starting one
  --headless             no emulator window
  --mute                 start the emulator with -no-audio (then audio may not play; the audio check would say so)
  --keep-running         leave the emulator running at the end

Run control
  --only <ids>           comma list of checks to run: ${CHECK_IDS.join(", ")}
  --skip-lock            skip the idle-and-lock observation
  --timeout-scale <n>    multiply every wait by n (default 1; try 2 on a slow Mac)
  --out <dir>            where timestamped result folders go (default e2e-tests/android/results)
  --cache <dir>          where the APK and the tools' downloads are kept (default e2e-tests/android/.cache)
  --sdk <dir>            Android SDK folder (default: ANDROID_HOME, ANDROID_SDK_ROOT, then the usual places)
  --emulator-port <n>    emulator console port, even, 5554 to 5584 (default ${DEFAULTS.emulatorPort}); --appium-port <n> (default ${DEFAULTS.appiumPort})

Other
  --check                only check that the Mac is set up (Node, Java, SDK, system image); start nothing
  --dry-run              print what a run would do and the exact URLs, change and download nothing
  --verbose              print the tools' own log lines
  -h, --help             this text
`;
}
