// S1 render: what Obsidian makes of each media embed form, in Reading view and in the Booklet view (MarkdownRenderer.render), from a
// root note and a subfolder note. Records the DOM (tag, src, preload, controls), when each element appears, and whether the server was
// asked before or after the render promise resolved.
//   PLAYWRIGHT=<node_modules> node s1-render.js --obsidian <binary> --out <dir> --media <folder from make-media.js> --plugin <folder with the built plugin>
const L = require("./lib");

const forms = port => [
	["F1 wiki embed wav", "![[tone-2s.wav]]"],
	["F2 path wav", "![](media/tone-5s.wav)"],
	["F3 reference wav", "![alt text][loc]"],
	["F4 wiki embed mp3", "![[sound.mp3]]"],
	["F5 wiki embed m4a", "![[sound.m4a]]"],
	["F6 wiki embed webm video", "![[clip.webm]]"],
	["F7 path mp4 video", "![](media/clip.mp4)"],
	["F8 remote wav by ip", `![](https://127.0.0.1:${port}/tone-2s.wav)`],
	["F9 remote wav by name", "![remote alt](https://media.example.org/tone-5s.wav)"],
	["F10 remote reference wav", "![alt text][rem]"],
	["F11 remote webm", "![](https://media.example.org/clip.webm)"],
	["F12 remote mp4", "![](https://media.example.org/clip.mp4)"],
	["F13 remote wav with query and fragment", "![](https://media.example.org/tone-2s.wav?x=1#t=1)"],
	["F14 wiki embed of a url", "![[https://media.example.org/tone-2s.wav]]"],
	["F15 plain link to wav", "[a link](https://media.example.org/tone-5s.wav)"],
	["F16 remote image png", "![](https://media.example.org/pic.png)"],
	["F17 path up one folder", "![](../tone-2s.wav)"],
	["F18 path next to the note", "![](local.wav)"],
	["F19 path with %20", "![](media/tone%20five.wav)"],
	["F20 path in angle brackets", "![](<media/tone five.wav>)"],
	["F21 wiki embed with a folder", "![[media/tone-5s.wav]]"],
	["F22 wiki embed local pdf", "![[doc.pdf]]"],
];
const defs = "\n[loc]: media/tone-5s.wav\n[rem]: https://media.example.org/tone-5s.wav\n";
const body = port => forms(port).map(([l, f]) => `${l.split(" ")[0]}: ${f}`).join("\n\n") + "\n" + defs;
const booklet = (id, port) => `---\nbooklet: "0.17"\nid: spike/${id}\ntitle: Spike ${id}\nlang: en\n---\n\n> [!activity|a] Spike activity\n\nThe forms follow.\n\n${body(port)}\n> [!text|q] A question?\n`;

(async () => {
	const o = L.args(), results = {};
	const mk = port => L.makeVault(o.out + "/v-s1", {
		"sub/local.wav": L.wav(2, 770), "media/tone five.wav": L.wav(2, 880), "doc.pdf": "%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "Root.md": "# Root\n\n" + body(port), "sub/Sub.md": "# Sub\n\n" + body(port),
		"Root.booklet.md": booklet("root", port), "sub/Sub.booklet.md": booklet("sub", port),
	}, { plugin: o.plugin, helper: true, copyFrom: o.media });
	const r = await L.start(o, { vault: mk, plugin: !!o.plugin, helper: true, name: "s1", hosts: { "media.example.org": 1 } });
	const { page, server } = r;
	try {
		await page.evaluate(() => {
			// time every MarkdownRenderer.render call: start, resolve
			window.__renders = []; const MR = window.__obs.MarkdownRenderer, orig = MR.render.bind(MR);
			MR.render = (...a) => { const e = { start: Date.now(), text: String(a[1]).slice(0, 40).replace(/\n/g, "\\n") }; window.__renders.push(e); const p = orig(...a); p.then(() => { e.end = Date.now(); }); return p; };
		});
		const cases = [
			["root note, Reading view", "Root.md", "markdown", "preview", ".markdown-reading-view"],
			["subfolder note, Reading view", "sub/Sub.md", "markdown", "preview", ".markdown-reading-view"],
			["root note, Booklet view", "Root.booklet.md", "booklet", "", ".booklet-view"],
			["subfolder note, Booklet view", "sub/Sub.booklet.md", "booklet", "", ".booklet-view"],
		];
		for (const [label, file, type, mode, sel] of cases) {
			await L.watchAdded(page);
			await page.evaluate(() => { window.__renders.length = 0; });
			server.mark("open " + label);
			const t0 = Date.now();
			await L.openNote(page, file, { type, mode, wait: 3500 });
			const dom = await page.evaluate(({ sel }) => {
				const root = document.querySelector(".workspace-leaf.mod-active " + sel) || document.querySelector(sel);
				const out = {}; if (!root) return { error: "no container " + sel };
				const media = el => ({ tag: el.tagName.toLowerCase(), src: (el.getAttribute("src") || el.getAttribute("href") || "").replace(/^app:\/\/[0-9a-f]+/, "app://<vault>").replace(/\/tmp\/[^?]*\/v-s1/, "").replace(/\?\d+$/, "?<mtime>"), preload: el.getAttribute("preload"), controls: el.hasAttribute("controls"), cls: el.getAttribute("class") || "" });
				for (const p of root.querySelectorAll("p")) {
					const m = /^(F\d+):/.exec(p.textContent); if (!m) continue;
					out[m[1]] = { text: p.textContent.slice(0, 70), els: [...p.querySelectorAll("audio,video,img,iframe,embed,object,a,span.internal-embed,span.image-embed,span.media-embed")].map(media) };
				}
				return out;
			}, { sel });
			const added = await page.evaluate(() => window.__added.map(a => ({ t: a.t, tag: a.tag, src: a.src && a.src.replace(/^app:\/\/[0-9a-f]+.*\/v-s1/, "app://<vault>").replace(/\?\d+$/, ""), preload: a.preload, controls: a.controls })));
			const renders = await page.evaluate(() => window.__renders.map(e => ({ start: e.start, end: e.end, text: e.text })));
			const reqs = server.since("open " + label).map(e => ({ t: e.t, atMs: Date.parse(e.at), method: e.method, url: e.url, status: e.status, range: e.headers.range || null, ua: (e.headers["user-agent"] || "").slice(0, 40), referer: e.headers.referer || null, origin: e.headers.origin || null }));
			results[label] = { t0, dom, added, renders, reqs };
		}
		L.fs.writeFileSync(o.out + "/s1-results.json", JSON.stringify(results, null, 1));
		// summary
		for (const [label, v] of Object.entries(results)) {
			console.log("\n=== " + label);
			for (const [k, f] of Object.entries(v.dom)) console.log(k, "|", (f.els || []).map(e => `${e.tag}${e.src ? " " + e.src.slice(0, 60) : ""}${e.preload ? " preload=" + e.preload : ""}${e.controls ? " controls" : ""}${e.cls ? " ." + e.cls.split(" ")[0] : ""}`).join("  ;  ") || "(nothing)");
			console.log("requests to the server:", v.reqs.length);
			for (const q of v.reqs) {
				const inside = v.renders.filter(x => x.start <= q.atMs && q.atMs <= (x.end || Infinity)).length;
				console.log(`  ${q.method} ${q.url} ${q.status}  at +${q.atMs - v.t0} ms; ${v.renders.length ? `inside ${inside} render call(s) still unresolved` : "no render call (Reading view)"}`);
			}
			console.log("render calls:", v.renders.map(x => `+${x.start - v.t0}..+${x.end - v.t0}`).join(" "));
			const first = {}; for (const a of v.added) first[a.tag] = Math.min(first[a.tag] ?? 1e12, a.t - v.t0);
			console.log("first element of each tag attached at (ms after open):", JSON.stringify(first), " media elements seen (with repeats):", v.added.filter(a => /audio|video/.test(a.tag)).length);
		}
	} finally { await r.stop(); }
})().catch(e => { console.error(e); process.exit(1); });
