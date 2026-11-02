// What the media checks (media-checks.js, checks 48 to 54) share: an Obsidian launched on a made-up vault with the Booklet plugin and the
// https media server, the hosts the notes name pointed at that server, and the server's request log to read. Nothing here touches --vault:
// each session makes its own vault under the check's work folder, with the built plugin copied from --vault (the repository's test-vault),
// and its own scratch config.
//
// How a remote address reaches the local server: Obsidian is started with --ignore-certificate-errors and --host-resolver-rules="MAP <host>
// 127.0.0.1:<port>", so https://media.example.org:<port>/tone-5s.wav is answered by media-server.js. The port is in every address, and so in
// every allow-list entry (an entry that names a port covers that port only). The service hosts (www.youtube.com and the like) are mapped to
// the same server too, so a press on a service's player never leaves the machine. Which host a request was for is read from its Host header.
// If a check dies, the Obsidian it started and the Xvfb its launch made are killed by exact pid (the reaper), never by a pattern.
const fs = require("fs"), path = require("path");
const { startServer } = require("./media-server");
const { writeTones } = require("./tones");
const { kit } = require("./waits");

const sleep = ms => new Promise(r => setTimeout(r, ms));

// the made-up hosts the notes use, and the real service hosts the plugin builds players for (mapped to the local server so nothing leaves the machine)
const HOSTS = ["media.example.org", "vault.example.org", "note.example.org", "declared.example.org", "blocked.example.net", "other.example.org", "look-alike.example.net"];
const SERVICE_HOSTS = ["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtu.be", "vimeo.com", "www.vimeo.com", "player.vimeo.com", "open.spotify.com", "soundcloud.com", "w.soundcloud.com"];

module.exports = function mediaLib(env) {
  const { launch, opt, WORK, consoleReport, sessions, SRC_VAULT } = env;
  let runNo = 0;

  // the pids this launch started: the Obsidian carrying our debugging port, and the Xvfb on the display drive.js made (never :91 to :93)
  const pidsOf = o => {
    const found = { app: [], xvfb: [] };
    for (const d of fs.readdirSync("/proc")) if (/^\d+$/.test(d)) {
      let c; try { c = fs.readFileSync("/proc/" + d + "/cmdline", "utf8").split("\0"); } catch (e) { continue; }
      // Electron rewrites its own title, so /proc holds the main process's whole command line as one string: it is read as one
      const line = c.join(" ");
      if (line.includes(" --remote-debugging-port=" + o.port + " ") && !/ --type=/.test(line)) found.app.push(+d);
      if (!process.env.DISPLAY && /(^|\/)Xvfb$/.test(c[0] || "") && c[1] === o.display && !["91", "92", "93"].includes(String(o.display).replace(/^:/, ""))) found.xvfb.push(+d);
    }
    return found;
  };
  const reap = o => { const f = pidsOf(o); for (const p of f.app) { try { process.kill(-p, "SIGKILL"); } catch (e) { /* gone */ } } for (const p of f.xvfb) { try { process.kill(p, "SIGKILL"); } catch (e) { /* gone */ } } };
  const reapers = new Set();
  process.on("exit", () => { for (const o of reapers) reap(o); });

  /** The plugin's folder in the check's own copy of the vault, with data.json when `data` is given. */
  function makeVault(dir, { files = {}, data, tones = true } = {}) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, ".obsidian", "plugins", "booklet"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".obsidian", "app.json"), JSON.stringify({ promptDelete: false }));
    fs.writeFileSync(path.join(dir, ".obsidian", "community-plugins.json"), JSON.stringify(["booklet"]));
    for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(SRC_VAULT, ".obsidian", "plugins", "booklet", f), path.join(dir, ".obsidian", "plugins", "booklet", f));
    if (data !== undefined) fs.writeFileSync(path.join(dir, ".obsidian", "plugins", "booklet", "data.json"), typeof data === "string" ? data : JSON.stringify(data, null, 2));
    if (tones) { writeTones(dir); writeTones(path.join(dir, "media")); writeTones(path.join(dir, "sub", "media")); }
    for (const [p, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), c); }
    return dir;
  }

  /** The console of a session is watched like the other checks' (check 10 reads it). */
  function watch(o, name) {
    sessions.push(name);
    o.page.on("console", m => { if (m.type() === "error" || m.type() === "warning") consoleReport.push({ where: name, kind: "console." + m.type(), text: m.text().slice(0, 400), url: (m.location() || {}).url || "" }); });
    o.page.on("pageerror", e => consoleReport.push({ where: name, kind: "pageerror", text: String((e && (e.stack || e.message)) || e).slice(0, 600), url: "" }));
  }

  /**
   * One session: a vault of `files` (a path to text), the plugin, the server serving `serve` (a folder; the vault's tones when not given)
   * and Obsidian started on it with every host mapped to the server. `data` is the plugin's data.json (an object, or text). `note` is a
   * function of the port when the files name addresses: `files` may be a function of `ctx` (see below) that returns the map.
   * fn(o, ctx): ctx = { vault, server, port, url(host, p), host(host), hits(host?), marks, relaunch(name), kill(o), file(rel), K }.
   */
  async function withMedia(name, opts, fn) {
    const dir = path.join(WORK, "m" + (++runNo) + "-" + name), vault = path.join(dir, "vault"), configDir = path.join(dir, "config");
    fs.mkdirSync(dir, { recursive: true });
    const logFile = path.join(dir, "requests.jsonl");
    const server = await startServer({ dir: vault, logFile, routes: opts.routes || {} });
    const port = server.port;
    const ctx = {
      vault, server, port, configDir,
      host: h => `${h}:${port}`,
      url: (h, p = "") => `https://${h}:${port}/${p}`,
      /** requests the server logged, newest last; `host` keeps those for that host (the Host header, port left off), `since` those after a mark */
      hits: (host, since) => (since ? server.since(since) : server.log.filter(e => !e.mark)).filter(e => !host || String(e.headers.host).replace(/:\d+$/, "") === host),
      file: rel => path.join(vault, rel),
      data: () => { try { return fs.readFileSync(path.join(vault, ".obsidian", "plugins", "booklet", "data.json"), "utf8"); } catch (e) { return null; } },
    };
    const files = typeof opts.files === "function" ? opts.files(ctx) : opts.files;
    makeVault(vault, { files, data: typeof opts.data === "function" ? opts.data(ctx) : opts.data });
    const rules = [...HOSTS, ...SERVICE_HOSTS, ...(opts.hosts || [])].map(h => `MAP ${h} 127.0.0.1:${port}`).join(", ");
    const args = ["--ignore-certificate-errors", "--host-resolver-rules=" + rules, ...(opts.args || [])];
    const start = async label => {
      const o = await launch({ obsidian: path.resolve(opt.obsidian), vault, configDir, args });
      reapers.add(o);
      watch(o, label);
      if (opts.width) await o.page.setViewportSize({ width: opts.width, height: opts.height || 900 });
      ctx.K = kit(env, opts.note || "");
      return o;
    };
    // a second Obsidian on the same vault after the first was killed (it keeps its config folder, so it opens the same vault)
    ctx.relaunch = start;
    ctx.kill = async o => {
      const f = pidsOf(o);
      for (const p of f.app) { try { process.kill(-p, "SIGKILL"); } catch (e) { /* gone */ } }
      for (let i = 0; i < 40 && pidsOf(o).app.length; i++) await sleep(100);
      await o.close().catch(() => {});
      reapers.delete(o);
    };
    const o = await start(name);
    try { return await fn(o, ctx); }
    finally {
      const out = o.output().trim();
      if (out) for (const line of out.split("\n")) if (/error|exception|fail/i.test(line)) consoleReport.push({ where: name, kind: /^ALSA lib /.test(line) ? "stdout/stderr (harness noise: no sound card under Xvfb)" : /^Ignored: Error: ENOENT.*\/obsidian\/e2e\w+\.json/.test(line) ? "stdout/stderr (harness noise: Obsidian looks for a per-vault json it has not written yet)" : "stdout/stderr", text: line.slice(0, 400) });
      await o.close().catch(() => {});
      reapers.delete(o);
      reap(o);
      await server.close().catch(() => {});
    }
  }

  return { withMedia, HOSTS, SERVICE_HOSTS, sleep, pidsOf, reap };
};
