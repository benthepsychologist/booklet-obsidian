#!/usr/bin/env node
// Runs Booklet in the official Obsidian Android app in an Android emulator, using the community tool wdio-obsidian-service
// (Appium + UiAutomator2) to install the app, the vault and the plugin. See STEPS.md. Options: node e2e-tests/android/run.mjs --help
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";

import { parseArgs, ArgError, usage, systemImage, CHECK_IDS } from "./lib/args.mjs";
import { expectedApkUrl, apkFor, fetchVersions, VERSIONS_URL, NoApkError, pluginAssetUrl, downloadTo, sha256File } from "./lib/download.mjs";
import { Results, stamp } from "./lib/results.mjs";
import { stagePlugin, readManifest } from "./lib/plugin.mjs";
import { buildVault } from "./lib/vault.mjs";
import { findSdk, sdkTool, preflight, Adb, listDevices, avdExists, createAvd, startEmulator, emulatorArgs, waitForBoot, run as runCmd } from "./lib/sdk.mjs";
import { StepError, waitFor, sleep } from "./lib/wait.mjs";
import { Phone, WEBVIEW } from "./lib/phone.mjs";
import * as C from "./lib/checks.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const require = createRequire(import.meta.url);

const LIMITS = [
	"Each run tests one Obsidian Android app version (the folder name and the \"Obsidian app\" line say which). A run on 1.15.0 says nothing about the plugin's minimum supported Obsidian (1.11.7): that needs a second run with --obsidian min.",
	"No emulator answers real lock-screen or background audio: a phone maker's battery killer, a real lock screen's audio rules and Bluetooth are not modelled. The idle-and-lock part is an observation only.",
	"iOS is not covered. Obsidian's iPhone app cannot run in this emulator.",
	"The emulator is one Android version on one screen size; touch is sent by the test tool, not by a finger.",
];

/* ---------------------------------------------------------------- main */

async function main() {
	let o;
	try {
		o = parseArgs(process.argv.slice(2), { repoRoot, here });
	} catch (e) {
		if (e instanceof ArgError) {
			console.error(`error: ${e.message}`);
			process.exit(2);
		}
		throw e;
	}
	if (o.help) return void console.log(usage());
	const sdk = findSdk({ sdk: o.sdk });
	const image = systemImage(o);
	if (o.dryRun) return void dryRun(o, sdk, image);
	const pre = preflight({ sdk, image });
	if (o.check) {
		for (const p of pre) console.log(`${p.ok ? "ok     " : "MISSING"} ${p.what}${p.ok ? "" : `\n         fix: ${p.fix}`}`);
		process.exit(pre.every((p) => p.ok) ? 0 : 1);
	}
	const bad = pre.filter((p) => !p.ok);
	if (bad.length) {
		console.error("This Mac is not set up yet:\n" + bad.map((p) => `  - ${p.what}\n      fix: ${p.fix}`).join("\n") + "\nSee e2e-tests/android/STEPS.md, section 1. \"node e2e-tests/android/run.mjs --check\" shows this list on its own.");
		process.exit(1);
	}
	await runAll(o, sdk, image);
}

/** One run per Obsidian version asked for ("both" = the default version, then the plugin's minAppVersion), sharing one emulator boot. */
async function runAll(o, sdk, image) {
	const shared = { startedEmulator: false, deferKill: o.versions.length > 1 };
	const env = envFor(o, sdk);
	const adb = new Adb({ adbPath: sdkTool(sdk, "adb"), serial: `emulator-${o.emulatorPort}`, env });
	const killIfOwned = async () => {
		if (shared.startedEmulator && !o.keepRunning) {
			shared.startedEmulator = false;
			await adb.raw(["emu", "kill"], { timeout: 20000 }).catch(() => {});
			console.log("emulator stopped");
		}
	};
	shared.killIfOwned = killIfOwned;
	installSignalHandlers(shared);
	let worst = 0;
	for (const [i, v] of o.versions.entries()) {
		let version = v;
		if (v === "min") {
			try {
				version = await minAppVersionOf(o);
			} catch (e) {
				console.error(`error: cannot find the plugin's minAppVersion for --obsidian ${o.obsidian}: ${e.message}`);
				worst = 1;
				break;
			}
			console.log(`The plugin's minAppVersion is ${version}: that is the Obsidian version for this run.`);
		}
		const oi = { ...o, obsidian: version, reuseEmulator: o.reuseEmulator || i > 0 };
		if (i > 0) console.log(`\n===== Run ${i + 1} of ${o.versions.length}: Obsidian ${version} =====`);
		const code = await execute(oi, sdk, image, shared);
		worst = Math.max(worst, code);
	}
	await killIfOwned();
	process.exitCode = worst;
}

/** The manifest's minAppVersion of the build under test (from the folder, or from the release's manifest.json). */
async function minAppVersionOf(o) {
	if (o.pluginDir) return readManifest(o.pluginDir).minAppVersion;
	const url = pluginAssetUrl(o.release, "manifest.json");
	const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60000) });
	if (!res.ok) throw new Error(`GET ${url} answered ${res.status}`);
	const m = await res.json();
	if (typeof m.minAppVersion !== "string") throw new Error(`${url} has no minAppVersion`);
	return m.minAppVersion;
}

/**
 * SIGINT, SIGTERM and SIGHUP all clean up (stop Appium, the emulator we started, write the report). A second signal while that is
 * running does not interrupt it; it says so. A third one quits at once.
 */
function installSignalHandlers(shared) {
	let count = 0;
	const onSignal = (name) => {
		count++;
		if (count === 1) {
			if (!shared.current) process.exit(130);
			shared.current.interrupt(name).then(() => shared.killIfOwned()).finally(() => process.exit(130));
		} else if (count === 2) {
			console.error(`cleanup in progress (stopping Appium and the emulator, writing the report); send ${name} once more to force quit`);
		} else {
			process.exit(130);
		}
	};
	for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => onSignal(sig));
}

function dryRun(o, sdk, image) {
	const out = [];
	const p = (s = "") => out.push(s);
	p("DRY RUN: nothing is downloaded, started or written.");
	p();
	p(`Plugin build     ${o.release ? `GitHub release ${o.release}:` : `folder ${o.pluginDir} (main.js, manifest.json, styles.css; run "npm run build" first)`}`);
	if (o.release) for (const f of ["main.js", "manifest.json", "styles.css"]) p(`                   ${pluginAssetUrl(o.release, f)}`);
	p(`Obsidian app     ${o.versions.map((v) => (v === "min" ? "the plugin's minAppVersion (from its manifest.json)" : v)).join(", then ")} for Android${o.versions.length > 1 ? ", one result folder each" : ""}`);
	for (const v of o.versions) if (v !== "min") p(`                   ${o.apk ? `local file ${o.apk}` : `${expectedApkUrl(v)} (expected; the real address is read at run time from ${VERSIONS_URL}, and a version without an APK is refused)`}`);
	p(`                   kept in ${path.join(o.cache, "apk")} (never committed)`);
	p(`Phone            AVD "${o.avd}", device profile ${o.device}, image ${image}`);
	p(`                   emulator port ${o.emulatorPort}${o.headless ? ", no window" : ""}${o.mute ? ", no audio" : ""}${o.reuseEmulator ? ", reusing a running emulator" : ""}`);
	p(`Android SDK      ${sdk ?? "not found (set ANDROID_HOME or pass --sdk)"}`);
	p(`Appium           local copy from e2e-tests/android/node_modules on port ${o.appiumPort}`);
	p(`Checks           ${(o.only ?? CHECK_IDS).join(", ")}${o.skipLock || o.only ? "" : ", then the idle-and-lock observation"}`);
	p(`Timeout scale    ${o.timeoutScale}`);
	p(`Results          ${path.join(o.out, "<timestamp>")}/ (results.md, results.json, screenshots/, run.log, appium.log, emulator.log)`);
	console.log(out.join("\n"));
}

/* ---------------------------------------------------------------- the run */

async function execute(o, sdk, image, shared) {
	const runDir = path.join(o.out, `${stamp()}-obsidian-${o.obsidian}`);
	fs.mkdirSync(runDir, { recursive: true });
	const logStream = fs.createWriteStream(path.join(runDir, "run.log"));
	const t0 = Date.now();
	const log = (s) => {
		const line = `[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${s}`;
		console.log(line);
		logStream.write(line + "\n");
	};
	const results = new Results({ limits: LIMITS, summary: {} });
	const cleanup = [];
	let finished = false;
	let exitCode = 0;
	const finish = async (code) => {
		if (finished) return exitCode;
		finished = true;
		for (const f of cleanup.reverse()) await Promise.resolve().then(f).catch((e) => log(`cleanup: ${e.message}`));
		results.write(runDir);
		log(`Result: ${results.verdict.toUpperCase()}. Wrote ${path.join(runDir, "results.md")}`);
		zipFolder(runDir, log);
		logStream.end();
		exitCode = code ?? (results.verdict === "pass" ? 0 : 1);
		return exitCode;
	};
	shared.current = {
		interrupt: async (name) => {
			log(`interrupted (${name}): cleaning up`);
			results.add({ id: "interrupted", title: "The run was interrupted", status: "fail", detail: `Stopped by ${name} before it finished.` });
			await finish(130);
		},
	};
	// The service copies the vault to a temporary folder on this Mac and, run as a plain script, never removes it. Give it a folder of ours to remove.
	const tmpRoot = path.join(o.cache, "tmp", path.basename(runDir));
	fs.mkdirSync(tmpRoot, { recursive: true });
	const prevTmp = process.env.TMPDIR;
	process.env.TMPDIR = tmpRoot;
	cleanup.push(() => {
		if (prevTmp === undefined) delete process.env.TMPDIR;
		else process.env.TMPDIR = prevTmp;
		fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	let phone = null;
	try {
		const env = envFor(o, sdk);
		const adbPath = sdkTool(sdk, "adb");
		const serial = `emulator-${o.emulatorPort}`;
		const adb = new Adb({ adbPath, serial, env });

		/* --- the build under test, the vault, the app --- */
		log("Step 1/6: getting the plugin build, the vault and the Obsidian APK");
		const stage = path.join(o.cache, "stage");
		const plugin = await stagePlugin({ pluginDir: o.pluginDir, release: o.release, stageDir: path.join(stage, "plugin"), log });
		const vaultDir = path.join(stage, "vault");
		const written = buildVault({ testVault: path.join(repoRoot, "test-vault"), dest: vaultDir });
		log(`  plugin ${plugin.manifest.id} ${plugin.manifest.version} (minAppVersion ${plugin.manifest.minAppVersion}) from ${plugin.source}; vault notes added: ${written.join(", ")}`);
		const apk = await getApk(o, log);
		const appVersion = apk.apkVersion ?? o.obsidian; // the version the APK really is (1.14.5 has the 1.14.4 APK)
		results.meta.summary = {
			"Run started": new Date(t0).toISOString(),
			"Plugin": `${plugin.manifest.name ?? plugin.manifest.id} ${plugin.manifest.version} from ${plugin.source}; ${plugin.files.map((f) => `${f.name} ${f.bytes} bytes sha256 ${f.sha256.slice(0, 12)}`).join("; ")}`,
			"Obsidian app": `Android ${appVersion}${apk.mapped ? ` (asked for ${o.obsidian}; Obsidian published no separate APK for it)` : ""} (${apk.source}; ${apk.bytes} bytes; sha256 ${apk.sha256})`,
			"Phone": `AVD ${o.avd}, ${image}, profile ${o.device}`,
			"This Mac": `${os.type()} ${os.release()} ${os.arch()}, Node ${process.versions.node}`,
			"Test tool": toolVersions(),
		};

		/* --- the phone --- */
		log("Step 2/6: the phone (Android Virtual Device)");
		const adbBin = adbPath;
		await runCmd(adbBin, ["start-server"], { env, timeout: 30000 });
		const running = (await listDevices(adbBin, env)).find((d) => d.serial === serial);
		if (running && !o.reuseEmulator) throw new StepError("start the emulator", `${serial} is already running. Close it (or pass --reuse-emulator to use it, or --emulator-port to start another).`);
		if (!running) {
			const emulator = sdkTool(sdk, "emulator");
			const avdmanager = sdkTool(sdk, "avdmanager");
			if (o.recreateAvd && (await avdExists(emulator, o.avd, env))) await runCmd(avdmanager, ["delete", "avd", "-n", o.avd], { env, timeout: 60000 });
			if (!(await avdExists(emulator, o.avd, env))) await createAvd({ avdmanager, name: o.avd, image, device: o.device, env, log });
			else log(`  AVD "${o.avd}" exists; using it`);
			log("  starting the emulator (a first boot takes a few minutes)");
			const emu = startEmulator({ emulator, args: emulatorArgs({ avd: o.avd, port: o.emulatorPort, headless: o.headless, mute: o.mute }), env, logFile: path.join(runDir, "emulator.log") });
			shared.startedEmulator = true;
			if (!o.keepRunning && !shared.deferKill) cleanup.push(() => shared.killIfOwned());
			await waitForBoot(adb, adbBin, { scale: o.timeoutScale, log, emuChild: emu.child });
		} else {
			log("  using the emulator that is already running");
		}
		await prepareDevice(adb, log);
		results.meta.summary["Android"] = `${await adb.shell("getprop ro.build.version.release")} (API ${await adb.shell("getprop ro.build.version.sdk")}), ${await adb.shell("getprop ro.product.cpu.abi")}, ${(await adb.shell("wm size", { loose: true })).replace(/\s+/g, " ")}, ${(await adb.shell("wm density", { loose: true })).replace(/\s+/g, " ")}`;

		/* --- Appium and the session --- */
		log("Step 3/6: starting Appium and installing Obsidian, the vault and the plugin (the tool downloads a matching ChromeDriver; the first time takes a while)");
		const appium = await startAppium(o, env, runDir, log);
		cleanup.push(() => appium.stop());
		const browser = await openSession({ o, appVersion, serial, apk, plugin, vaultDir, cache: o.cache, log });
		phone = new Phone({ browser, adb, runDir, scale: o.timeoutScale, log, newSession: () => plainSession({ o, serial, log }) });
		cleanup.push(() => phone.close());
		await waitFor(async () => (await browser.getContexts()).includes(WEBVIEW), { what: `the context ${WEBVIEW}`, timeout: 30000, scale: o.timeoutScale });
		await phone.shot("start");

		/* --- the checks --- */
		log("Step 4/6: the checks");
		const state = {};
		const cenv = { plugin, obsidian: appVersion, adb, state };
		const want = (id) => !o.only || o.only.includes(id);
		const check = async (id, title, fn, { needs, ungraded = false } = {}) => {
			if (!want(id) || finished) return;
			if (needs && needs()) return void results.add({ id, title, status: "skipped", detail: needs() });
			const c0 = Date.now();
			log(`  ${id}: ${title}`);
			phone.takeShots();
			let rec;
			try {
				const r = await fn(phone, cenv);
				rec = { status: r.status ?? "pass", detail: r.detail, facts: r.facts };
			} catch (e) {
				if (e instanceof C.Limit) rec = { status: "limit", detail: e.message, facts: e.facts };
				else {
					const shot = await phone.shot(`FAILED-${id}`);
					const step = e instanceof StepError ? e.step : "unexpected error";
					const why = e instanceof StepError ? e.reason : `${e.message}`;
					rec = { status: ungraded ? "observation" : "fail", step: ungraded ? null : step, detail: `${why}${e.detail ? `\n\nEvidence: ${e.detail}` : ""}\n\nScreenshot of the phone at the failure: ${shot ?? "(could not be taken)"}` };
				}
			}
			results.add({ id, title, ...rec, screenshots: phone.takeShots(), ms: Date.now() - c0 });
			log(`    -> ${rec.status.toUpperCase()}${rec.status === "fail" ? `: ${rec.step}` : ""}`);
		};
		const loaded = () => (results.checks.find((c) => c.id === "plugin-loads")?.status === "fail" ? "skipped because the plugin did not load" : null);
		await check("plugin-loads", "The plugin loads and is enabled", C.pluginLoads);
		await check("booklet-view", "A Booklet note opens in the Booklet view", C.bookletView, { needs: loaded });
		await check("pages-menu", "A page tree shows its Pages button and menu with no sideways scroll at phone width", C.pagesMenu, { needs: loaded });
		await check("allow-card", "The Allow card opens and closes", C.allowCard, { needs: loaded });
		await check("now-playing", "The now-playing bar stays through page moves", C.nowPlaying, { needs: loaded });
		if (want("answers-kept") || want("page-kept")) {
			if (!loaded()) {
				log("  force-stop and reopen (answers-kept, page-kept)");
				await C.forceStopCycle(phone, cenv);
				state.cycleShots = phone.takeShots(); // listed under both of the checks below
			}
		}
		const withCycleShots = (fn) => async (ph, e) => {
			const r = await fn(ph, e);
			ph.shots.push(...(e.state.cycleShots ?? []));
			return r;
		};
		await check("answers-kept", "After a force-stop and reopen, typed answers are kept", withCycleShots(C.answersKept), { needs: () => loaded() || (state.cycle ? null : "the force-stop cycle did not run") });
		await check("page-kept", "After a force-stop and reopen, the open page is kept", withCycleShots(C.pageKept), { needs: () => loaded() || (state.cycle ? null : "the force-stop cycle did not run") });

		if (!o.skipLock && !o.only) {
			log("Step 5/6: observation only: idle and lock with the bar present");
			await check("lock-observation", "Idle and lock with the bar present (observation only, not graded)", C.lockObservation, { ungraded: true, needs: () => loaded() || (state.cycle && !state.cycle.ok ? "the app could not be driven after the force-stop" : null) });
		}
		results.meta.summary["Emulated app"] = JSON.stringify(state.app ?? {});
		if (phone.jsClicks) results.note(`${phone.jsClicks} tap(s) could not be sent as a WebDriver click and were sent as a script click instead.`);
		if (phone.reattachedWithNewSession) results.note("After the force-stop the first Appium session could not switch back to the web view, so a second session was started (this is the fallback, and it worked).");
	} catch (e) {
		log(`SETUP FAILED: ${e.message}`);
		const shot = phone ? await phone.shot("setup-failed") : null;
		results.add({ id: "setup", title: "Setting up the phone, the app and the test tool", status: "fail", step: e instanceof StepError ? e.step : "setup", detail: `${e instanceof StepError ? e.reason : e.stack || e.message}\n\nThe run stopped here; nothing was checked after this. See run.log, appium.log and emulator.log in the result folder.${shot ? `\nScreenshot: ${shot}` : ""}` });
	}
	log("Step 6/6: writing the result and cleaning up");
	shared.current = null;
	return finish();
}

/* ---------------------------------------------------------------- pieces */

/** The environment the Android tools and Appium need. */
function envFor(o, sdk) {
	const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
	delete env.APPIUM_HOME; // so Appium finds the driver installed in e2e-tests/android/node_modules
	if (!env.JAVA_HOME && process.platform === "darwin") {
		const r = spawnSync("/usr/libexec/java_home", [], { encoding: "utf8" });
		if (r.status === 0 && r.stdout.trim()) env.JAVA_HOME = r.stdout.trim();
	}
	env.PATH = [path.join(sdk, "platform-tools"), path.join(sdk, "emulator"), env.PATH].join(path.delimiter);
	return env;
}

function toolVersions() {
	const v = (n) => {
		try {
			return JSON.parse(fs.readFileSync(path.join(here, "node_modules", n, "package.json"), "utf8")).version;
		} catch {
			return "?";
		}
	};
	return ["wdio-obsidian-service", "obsidian-launcher", "webdriverio", "appium", "appium-uiautomator2-driver"].map((n) => `${n} ${v(n)}`).join(", ");
}

async function getApk(o, log) {
	if (o.apk) {
		if (!fs.existsSync(o.apk)) throw new StepError("find the APK", `${o.apk} does not exist`);
		return { path: o.apk, source: `local file ${o.apk}`, bytes: fs.statSync(o.apk).size, sha256: await sha256File(o.apk), apkVersion: null, mapped: false };
	}
	let found;
	try {
		found = apkFor(await fetchVersions(), o.obsidian);
	} catch (e) {
		if (e instanceof NoApkError) throw new StepError("find the Obsidian APK", e.message);
		throw new StepError("find the Obsidian APK", `could not read the version list at ${VERSIONS_URL}: ${e.message}`);
	}
	if (found.mapped) log(`  Obsidian ${o.obsidian} has no APK of its own; the list points to the ${found.apkVersion} APK, which is what will be tested`);
	const dest = path.join(o.cache, "apk", `Obsidian-${found.apkVersion}.apk`);
	if (!fs.existsSync(dest)) {
		log(`  downloading ${found.url}`);
		try {
			await downloadTo(found.url, dest, { log });
		} catch (e) {
			throw new StepError("download the Obsidian APK", `${e.message}. Download the APK yourself and pass --apk <file> (with a matching --obsidian) if this keeps failing.`);
		}
	} else log(`  APK already downloaded: ${dest}`);
	return { path: dest, source: found.url, bytes: fs.statSync(dest).size, sha256: await sha256File(dest), apkVersion: found.apkVersion, mapped: found.mapped };
}

/** Settings that make a test phone steadier and quicker. All reversible by deleting the AVD. */
async function prepareDevice(adb, log) {
	log("  setting the phone up for testing (animations off, stay awake, no lock screen)");
	for (const cmd of [
		"settings put global window_animation_scale 0",
		"settings put global transition_animation_scale 0",
		"settings put global animator_duration_scale 0",
		"settings put system screen_off_timeout 1800000",
		"settings put secure show_ime_with_hard_keyboard 0",
		"svc power stayon true",
		"input keyevent 224",
		"wm dismiss-keyguard",
	]) await adb.shell(cmd, { loose: true });
}

async function startAppium(o, env, runDir, log) {
	const pkgFile = require.resolve("appium/package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
	const main = path.join(path.dirname(pkgFile), typeof pkg.bin === "string" ? pkg.bin : pkg.bin.appium);
	const args = [main, "--address", "127.0.0.1", "--port", String(o.appiumPort), "--allow-insecure", "*:chromedriver_autodownload,*:adb_shell", "--log", path.join(runDir, "appium.log"), "--log-no-colors"];
	const child = spawn(process.execPath, args, { cwd: here, env, stdio: ["ignore", o.verbose ? "inherit" : "ignore", "pipe"] });
	let exited = null;
	child.on("exit", (code, sig) => (exited = `Appium exited early (code ${code}, signal ${sig}); see appium.log`));
	child.on("error", (err) => (exited = `Appium could not be started: ${err.message}`));
	child.stderr.on("data", (d) => fs.appendFileSync(path.join(runDir, "appium.log"), d));
	await waitFor(async () => {
		if (exited) throw new StepError("start Appium", exited, { fatal: true }); // waitFor stops at once: waiting longer cannot help
		const r = await fetch(`http://127.0.0.1:${o.appiumPort}/status`).catch(() => null);
		return !!r && r.ok;
	}, { what: "Appium to answer on /status", timeout: 60000, interval: 500, scale: o.timeoutScale });
	log(`  Appium is up on port ${o.appiumPort}`);
	return { stop: async () => { if (!exited) { child.kill("SIGTERM"); await sleep(500); if (!exited) child.kill("SIGKILL"); log("  Appium stopped"); } } };
}

function appiumCaps({ serial, cache }) {
	fs.mkdirSync(path.join(cache, "appium-chromedriver"), { recursive: true });
	return {
		platformName: "Android",
		"appium:automationName": "UiAutomator2",
		"appium:udid": serial,
		"appium:noReset": true,
		"appium:newCommandTimeout": 1800,
		"appium:adbExecTimeout": 120000,
		"appium:androidInstallTimeout": 300000,
		"appium:uiautomator2ServerInstallTimeout": 180000,
		"appium:uiautomator2ServerLaunchTimeout": 180000,
		"appium:chromedriverExecutableDir": path.join(cache, "appium-chromedriver"),
	};
}

async function openSession({ o, appVersion, serial, apk, plugin, vaultDir, cache, log }) {
	const { startWdioSession } = await import("wdio-obsidian-service");
	const capabilities = {
		browserName: "obsidian",
		browserVersion: appVersion,
		...appiumCaps({ serial, cache }),
		"appium:app": apk.path,
		"wdio:obsidianOptions": { plugins: [plugin.dir], vault: vaultDir, copy: true },
	};
	try {
		return await startWdioSession({ hostname: "127.0.0.1", port: o.appiumPort, path: "/", logLevel: o.verbose ? "info" : "error", rootDir: here, cacheDir: path.join(cache, "wdio"), connectionRetryTimeout: 15 * 60 * 1000, connectionRetryCount: 1, capabilities }, {});
	} catch (e) {
		throw new StepError("start the Appium session (install Obsidian, the vault and the plugin)", `${e.message}`.split("\n").slice(0, 6).join(" | "), { cause: e });
	}
}

/** A session with no service: attaches to Obsidian that is already installed and running, without touching the vault. */
async function plainSession({ o, serial, log }) {
	const { remote } = await import("webdriverio");
	log("  starting a plain Appium session (no install, no vault reset)");
	return remote({
		hostname: "127.0.0.1", port: o.appiumPort, path: "/", logLevel: o.verbose ? "info" : "error", connectionRetryTimeout: 10 * 60 * 1000,
		capabilities: { ...appiumCaps({ serial, cache: o.cache }), "appium:autoLaunch": false, "appium:dontStopAppOnReset": true, "appium:appPackage": "md.obsidian", "appium:ensureWebviewsHavePages": true, "wdio:enforceWebDriverClassic": true },
	});
}

/** Zips the result folder next to it for sending (zip, or ditto on a Mac). Best effort. */
function zipFolder(dir, log) {
	const zip = `${dir}.zip`;
	const tries = [["zip", ["-qr", zip, path.basename(dir)]], ["ditto", ["-c", "-k", "--keepParent", dir, zip]]];
	for (const [cmd, args] of tries) {
		const r = spawnSync(cmd, args, { cwd: path.dirname(dir), encoding: "utf8" });
		if (r.status === 0) return void log(`Zipped for sending: ${zip}`);
	}
	log(`(could not make a zip file; send the folder ${dir} instead)`);
}

main().catch((e) => {
	console.error(e.stack || e);
	process.exit(1);
});
