// The Android tools on the Mac: where the SDK is, whether it is set up, an adb wrapper, making and booting the AVD.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { StepError, waitFor, sleep } from "./wait.mjs";

const exe = (n) => (process.platform === "win32" ? `${n}.exe` : n);

/** Places an SDK is usually found, in the order tried. `env` is process.env. */
export function sdkCandidates({ sdk, env = process.env, home = os.homedir() } = {}) {
	return [
		sdk,
		env.ANDROID_HOME,
		env.ANDROID_SDK_ROOT,
		path.join(home, "Library/Android/sdk"), // Android Studio on a Mac
		"/opt/homebrew/share/android-commandlinetools", // brew install --cask android-commandlinetools, Apple silicon
		"/usr/local/share/android-commandlinetools", // the same, Intel
		path.join(home, "Android/Sdk"),
	].filter(Boolean);
}

/** The first candidate that holds platform-tools or cmdline-tools, else null. */
export function findSdk(opts = {}, exists = fs.existsSync) {
	for (const c of sdkCandidates(opts)) if (exists(path.join(c, "platform-tools")) || exists(path.join(c, "cmdline-tools")) || exists(path.join(c, "emulator"))) return c;
	return null;
}

/** The path of a command-line tool inside the SDK (cmdline-tools/latest/bin first, then any version folder). Null if absent. */
export function sdkTool(sdk, name, exists = fs.existsSync, readdir = (d) => fs.readdirSync(d)) {
	const direct = {
		adb: path.join(sdk, "platform-tools", exe("adb")),
		emulator: path.join(sdk, "emulator", exe("emulator")),
	};
	if (direct[name]) return exists(direct[name]) ? direct[name] : null;
	const bin = process.platform === "win32" ? `${name}.bat` : name;
	const latest = path.join(sdk, "cmdline-tools", "latest", "bin", bin);
	if (exists(latest)) return latest;
	try {
		for (const v of readdir(path.join(sdk, "cmdline-tools")).sort().reverse()) {
			const p = path.join(sdk, "cmdline-tools", v, "bin", bin);
			if (exists(p)) return p;
		}
	} catch {
		/* no cmdline-tools folder */
	}
	return null;
}

/** Java 17 or newer is needed by sdkmanager, avdmanager and Appium's Android driver. Returns { ok, version, text }. */
export function javaInfo(run = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" }), env = process.env) {
	const r = run(env.JAVA_HOME ? path.join(env.JAVA_HOME, "bin", "java") : "java", ["-version"]);
	if (r.error || r.status === null) return { ok: false, version: null, text: "java was not found on the PATH" };
	const text = `${r.stderr || ""}${r.stdout || ""}`;
	const m = text.match(/version "(\d+)(?:\.(\d+))?/);
	if (!m) return { ok: false, version: null, text: `could not read the Java version from: ${text.split("\n")[0]}` };
	const major = m[1] === "1" ? Number(m[2]) : Number(m[1]);
	return { ok: major >= 17, version: major, text: major >= 17 ? `Java ${major}` : `Java ${major} is too old (17 or newer is needed)` };
}

/** Compares a dotted version "22.23.4" with a minimum. */
export function versionAtLeast(have, min) {
	const a = have.replace(/^v/, "").split(".").map(Number);
	const b = min.split(".").map(Number);
	for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
	return true;
}

/** Node versions webdriverio 9.33.1 accepts (its engines field): 20.20.2+ on 20, 22.23.4+ on 22, 24.22.1+ on 24, 26.12.1+ on 26. */
export function nodeOk(version = process.versions.node) {
	const major = Number(version.split(".")[0]);
	const min = { 20: "20.20.2", 22: "22.23.4", 24: "24.22.1" }[major];
	if (min) return versionAtLeast(version, min);
	return major >= 26 && versionAtLeast(version, major === 26 ? "26.12.1" : "0.0.0");
}

/**
 * Everything that must be in place before a run, as a list of { ok, what, fix }. Never throws.
 * `image` is the system image id; `avd` the AVD name.
 */
export function preflight({ sdk, image, node = process.versions.node, java = javaInfo(), exists = fs.existsSync, toolFinder = sdkTool }) {
	const out = [];
	// webdriverio 9.33.1 lists the Node versions it supports (engines); an older patch release only draws a warning from npm, so only Node before 20 blocks the run
	out.push({ ok: Number(node.split(".")[0]) >= 20, what: `Node ${node}${nodeOk(node) ? "" : " (webdriverio asks for 22.23.4 or newer; it should still work)"}`, fix: "install Node 22.23.4 or newer (STEPS.md, one-time setup)" });
	out.push({ ok: java.ok, what: java.text, fix: "install a Java 17+ JDK, e.g. brew install openjdk@17 (STEPS.md, one-time setup)" });
	out.push({ ok: !!sdk, what: sdk ? `Android SDK at ${sdk}` : "Android SDK not found", fix: "install the Android command-line tools and set ANDROID_HOME, or pass --sdk (STEPS.md)" });
	if (sdk) {
		for (const [tool, pkg] of [["adb", "platform-tools"], ["emulator", "emulator"], ["avdmanager", "cmdline-tools;latest"], ["sdkmanager", "cmdline-tools;latest"]]) {
			const p = toolFinder(sdk, tool);
			out.push({ ok: !!p, what: p ? `${tool}: ${p}` : `${tool} not found in the SDK`, fix: `sdkmanager "${pkg}"` });
		}
		const bt = exists(path.join(sdk, "build-tools"));
		out.push({ ok: bt, what: bt ? "build-tools installed" : "build-tools not installed (Appium needs them to install the app)", fix: 'sdkmanager "build-tools;36.0.0"' });
		const dir = path.join(sdk, ...image.split(";"));
		out.push({ ok: exists(dir), what: exists(dir) ? `system image ${image}` : `system image ${image} not installed`, fix: `sdkmanager "${image}"` });
	}
	return out;
}

/** Edits an AVD's config.ini text: sets each key in `set`, adding the ones that are absent. Order and other lines are kept. */
export function patchAvdConfig(text, set) {
	const seen = new Set();
	const lines = text.split(/\r?\n/).map((line) => {
		const m = line.match(/^([A-Za-z0-9_.]+)\s*=/);
		if (m && Object.hasOwn(set, m[1])) {
			seen.add(m[1]);
			return `${m[1]}=${set[m[1]]}`;
		}
		return line;
	});
	while (lines.length && lines.at(-1) === "") lines.pop();
	for (const [k, v] of Object.entries(set)) if (!seen.has(k)) lines.push(`${k}=${v}`);
	return lines.join("\n") + "\n";
}

/** What the run sets in the AVD: memory and disk for the app, a hardware keyboard so typing works, no camera. */
export const AVD_SETTINGS = Object.freeze({
	"hw.ramSize": "3072",
	"disk.dataPartition.size": "6G",
	"hw.keyboard": "yes",
	"hw.camera.back": "none",
	"hw.camera.front": "none",
});

/** The emulator's command-line arguments. */
export function emulatorArgs({ avd, port, headless, mute }) {
	const a = ["-avd", avd, "-port", String(port), "-no-snapshot", "-no-boot-anim", "-gpu", "auto"];
	if (headless) a.push("-no-window");
	if (mute) a.push("-no-audio");
	return a;
}

/** Runs a command to the end. Resolves { code, stdout, stderr, signal }; rejects only if it cannot be started or `timeout` ms pass. */
export function run(cmd, args, { timeout = 60000, input, env, cwd, binary = false } = {}) {
	return new Promise((resolve, reject) => {
		const p = spawn(cmd, args, { env: env ?? process.env, cwd, stdio: ["pipe", "pipe", "pipe"] });
		const out = [];
		const err = [];
		let timer = setTimeout(() => {
			p.kill("SIGKILL");
			reject(new Error(`${path.basename(cmd)} ${args.join(" ").slice(0, 80)} did not finish in ${Math.round(timeout / 1000)} s`));
		}, timeout);
		p.stdout.on("data", (d) => out.push(d));
		p.stderr.on("data", (d) => err.push(d));
		p.on("error", (e) => {
			clearTimeout(timer);
			reject(e);
		});
		p.on("close", (code, signal) => {
			clearTimeout(timer);
			const so = Buffer.concat(out);
			resolve({ code, signal, stdout: binary ? so : so.toString("utf8"), stderr: Buffer.concat(err).toString("utf8") });
		});
		p.stdin.on("error", () => {});
		p.stdin.end(input ?? "");
	});
}

/** An adb wrapper bound to one device. */
export class Adb {
	constructor({ adbPath, serial, env }) {
		this.adbPath = adbPath;
		this.serial = serial;
		this.env = env;
	}

	async raw(args, opts = {}) {
		return run(this.adbPath, ["-s", this.serial, ...args], { env: this.env, ...opts });
	}

	/** `adb shell <command>` -> stdout (trimmed). Throws on a nonzero exit unless `loose`. */
	async shell(command, { timeout = 30000, loose = false } = {}) {
		const r = await this.raw(["shell", command], { timeout });
		if (r.code !== 0 && !loose) throw new Error(`adb shell ${command} exited ${r.code}: ${(r.stderr || r.stdout).trim().slice(0, 200)}`);
		return r.stdout.trim();
	}

	/** A PNG of the whole screen, as a Buffer. */
	async screenshot() {
		const r = await this.raw(["exec-out", "screencap", "-p"], { timeout: 30000, binary: true });
		if (r.code !== 0 || r.stdout.length < 100 || r.stdout.readUInt32BE(0) !== 0x89504e47) throw new Error(`screencap failed (exit ${r.code}, ${r.stdout.length} bytes): ${r.stderr.trim().slice(0, 200)}`);
		return r.stdout;
	}

	async pidOf(pkg) {
		return (await this.shell(`pidof ${pkg}`, { loose: true })).trim();
	}
}

/** The serials `adb devices` lists as ready. */
export async function listDevices(adbPath, env) {
	const r = await run(adbPath, ["devices"], { env, timeout: 20000 });
	return r.stdout
		.split("\n")
		.slice(1)
		.map((l) => l.trim().split(/\s+/))
		.filter((p) => p.length >= 2)
		.map(([serial, state]) => ({ serial, state }));
}

export async function avdExists(emulatorPath, name, env) {
	const r = await run(emulatorPath, ["-list-avds"], { env, timeout: 30000 });
	return r.stdout.split("\n").map((s) => s.trim()).includes(name);
}

/** Creates the AVD (and sets its memory and disk). Returns the path of its config.ini. */
export async function createAvd({ avdmanager, name, image, device, env, log = () => {} }) {
	const args = ["create", "avd", "-n", name, "-k", image, "-d", device, "--force"];
	log(`creating the AVD: avdmanager ${args.join(" ")}`);
	const r = await run(avdmanager, args, { env, input: "no\n", timeout: 120000 });
	if (r.code !== 0) throw new StepError("create the AVD", `avdmanager exited ${r.code}: ${(r.stderr || r.stdout).trim().slice(0, 400)}`);
	const cfg = path.join(process.env.ANDROID_AVD_HOME || path.join(os.homedir(), ".android", "avd"), `${name}.avd`, "config.ini");
	if (!fs.existsSync(cfg)) throw new StepError("create the AVD", `avdmanager said it worked but ${cfg} does not exist (is ANDROID_AVD_HOME set?)`);
	fs.writeFileSync(cfg, patchAvdConfig(fs.readFileSync(cfg, "utf8"), AVD_SETTINGS));
	return cfg;
}

/** Starts the emulator detached from our output and returns { child, logFile }. */
export function startEmulator({ emulator, args, env, logFile }) {
	fs.mkdirSync(path.dirname(logFile), { recursive: true });
	const fd = fs.openSync(logFile, "a");
	const child = spawn(emulator, args, { env, stdio: ["ignore", fd, fd], detached: true });
	child.unref();
	return { child, logFile };
}

/** Waits until Android has finished booting: adb sees the device, sys.boot_completed is 1 and the package manager answers. */
export async function waitForBoot(adb, adbPath, { scale = 1, log = () => {}, emuChild } = {}) {
	let died = null;
	emuChild?.on("exit", (code, sig) => {
		died = `the emulator process exited early (code ${code}, signal ${sig}); see emulator.log`;
	});
	await waitFor(async () => {
		if (!died && emuChild && emuChild.exitCode !== null && emuChild.exitCode !== undefined) died = `the emulator process exited early (code ${emuChild.exitCode}); see emulator.log`;
		if (died) throw new StepError("boot the emulator", died, { fatal: true }); // waitFor stops at once: waiting longer cannot help
		await run(adbPath, ["start-server"], { env: adb.env, timeout: 20000 }).catch(() => {});
		return (await adb.shell("getprop sys.boot_completed", { loose: true, timeout: 10000 })) === "1";
	}, { what: "emulator finished booting (sys.boot_completed = 1)", timeout: 420000, interval: 3000, scale });
	await waitFor(async () => (await adb.shell("pm path android", { loose: true, timeout: 10000 })).startsWith("package:"), { what: "Android package manager answering", timeout: 120000, interval: 2000, scale });
	log("the phone has booted");
	await sleep(1000);
}
