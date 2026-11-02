// A small https media server for the real-Obsidian checks. The certificate is made at run time (openssl, self-signed, valid for
// 127.0.0.1, localhost and *.example.org / *.example.net) and is never kept; start Obsidian with --ignore-certificate-errors.
// It serves files from <dir> with Range support, plus any `routes` handed to startServer, and logs every request (time, method,
// url, status, bytes sent, all headers) to <logFile> as JSON lines and in memory.
//   node media-server.js --dir <folder> [--port 8443] [--log <file>]
//   const { startServer } = require("./media-server"); const s = await startServer({ dir, logFile }); ... s.log, s.mark("x"), s.close()
const fs = require("fs"), path = require("path"), https = require("https"), os = require("os"), cp = require("child_process");

const TYPES = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".webm": "video/webm", ".mp4": "video/mp4",
	".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain" };

/** { key, cert } as strings, from a throw-away openssl run in a temp folder. */
function makeCert() {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), "bk-cert-"));
	try {
		const conf = "[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n[dn]\nCN=127.0.0.1\n[v3]\nsubjectAltName=IP:127.0.0.1,DNS:localhost,DNS:*.example.org,DNS:example.org,DNS:*.example.net,DNS:example.net\n";
		fs.writeFileSync(path.join(d, "c.cnf"), conf);
		cp.execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-keyout", path.join(d, "k.pem"), "-out", path.join(d, "c.pem"), "-config", path.join(d, "c.cnf")], { stdio: "ignore" });
		return { key: fs.readFileSync(path.join(d, "k.pem"), "utf8"), cert: fs.readFileSync(path.join(d, "c.pem"), "utf8") };
	} finally { fs.rmSync(d, { recursive: true, force: true }); }
}

/** Starts the server. Options: dir (files to serve), port (0 = any), logFile, routes ({ "/path": (req, res) => bool|void }, return true when handled). */
async function startServer({ dir, port = 0, logFile, routes = {} }) {
	let root = dir;
	const t0 = Date.now(), log = [];
	const write = e => { log.push(e); if (logFile) fs.appendFileSync(logFile, JSON.stringify(e) + "\n"); };
	const server = https.createServer(makeCert(), (req, res) => {
		const url = new URL(req.url, "https://x"), entry = { t: Date.now() - t0, at: new Date().toISOString(), method: req.method, url: req.url, headers: { ...req.headers } };
		const done = (status, bytes) => write({ ...entry, status, bytes });
		const send = (status, headers, body) => { res.writeHead(status, headers); res.end(body); done(status, body ? body.length : 0); };
		const route = routes[url.pathname];
		if (route && route(req, res, send, entry) === true) return;
		const file = path.join(root || ".", decodeURIComponent(url.pathname));
		if (!file.startsWith(path.resolve(root || ".")) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(404, { "content-type": "text/plain" }, "not found");
		const size = fs.statSync(file).size, type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
		const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
		const base = { "content-type": type, "accept-ranges": "bytes", "access-control-allow-origin": "*", "cache-control": "no-store" };
		if (m && (m[1] || m[2])) {
			let a = m[1] ? +m[1] : size - +m[2], b = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
			if (a > b || a >= size) return send(416, { ...base, "content-range": "bytes */" + size }, "");
			res.writeHead(206, { ...base, "content-range": `bytes ${a}-${b}/${size}`, "content-length": b - a + 1 });
			if (req.method === "HEAD") { res.end(); return done(206, 0); }
			fs.createReadStream(file, { start: a, end: b }).pipe(res).on("finish", () => done(206, b - a + 1));
		} else {
			res.writeHead(200, { ...base, "content-length": size });
			if (req.method === "HEAD") { res.end(); return done(200, 0); }
			fs.createReadStream(file).pipe(res).on("finish", () => done(200, size));
		}
	});
	await new Promise(r => server.listen(port, "127.0.0.1", r));
	return {
		port: server.address().port, log, t0,
		/** change the folder that is served */
		setDir: d => { root = d; },
		/** put a label in the log, so a stretch of requests can be told apart */
		mark: label => write({ t: Date.now() - t0, at: new Date().toISOString(), mark: label }),
		/** requests (not marks) logged after the last mark with this label (or all, when no such mark) */
		since: label => { const i = log.map(e => e.mark).lastIndexOf(label); return log.slice(i + 1).filter(e => !e.mark); },
		close: () => new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(r); }),
	};
}

module.exports = { startServer };
if (require.main === module) {
	const a = process.argv.slice(2), o = {};
	for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, "")] = a[i + 1];
	if (!o.dir) { console.error("usage: node media-server.js --dir <folder> [--port N] [--log file]"); process.exit(2); }
	startServer({ dir: path.resolve(o.dir), port: +o.port || 0, logFile: o.log }).then(s => console.log("https://127.0.0.1:" + s.port + "/ serving " + o.dir));
}
