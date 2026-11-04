// S2 raw HTML: <audio>, <video>, <iframe>, <img> (and <source>, <embed>) with a remote src, as Obsidian renders them (Reading view; MarkdownRenderer.render
// into an attached and into a detached element), and as plain DOM calls do it (created, given a src, attached later). Is the request made before the element
// is attached? What survives Obsidian's sanitising of the markup?
//   PLAYWRIGHT=<node_modules> node s2-rawhtml.js --obsidian <binary> --out <dir> --media <folder from make-media.js>
const L = require("./lib");
const H = "https://media.example.org";
const tags = c => [
	["audio", `<audio src="${H}/tone-2s.wav?c=${c}-audio" controls></audio>`],
	["audio preload=none", `<audio src="${H}/tone-2s.wav?c=${c}-audionone" preload="none" controls></audio>`],
	["video", `<video src="${H}/clip.webm?c=${c}-video" controls></video>`],
	["video preload=none", `<video src="${H}/clip.webm?c=${c}-videonone" preload="none" controls></video>`],
	["audio with <source>", `<audio controls><source src="${H}/tone-2s.wav?c=${c}-source"></audio>`],
	["iframe", `<iframe src="${H}/frame.html?c=${c}-iframe" sandbox referrerpolicy="no-referrer"></iframe>`],
	["iframe no sandbox", `<iframe src="${H}/frame.html?c=${c}-iframenosb"></iframe>`],
	["img", `<img src="${H}/pic.png?c=${c}-img">`],
	["embed", `<embed src="${H}/tone-2s.wav?c=${c}-embed">`],
];
(async () => {
	const o = L.args();
	const mk = () => L.makeVault(o.out + "/v-s2", {
		"frame.html": "<!doctype html><title>frame</title><p>hello from the frame</p>\n",
		"Raw.md": "# Raw\n\n" + tags("note").map(([n, h]) => `${h}\n`).join("\n"),
	}, { helper: true, copyFrom: o.media });
	const r = await L.start(o, { vault: mk, helper: true, name: "s2", hosts: { "media.example.org": 1 } });
	const { page, server } = r; const res = {};
	const reqsFor = c => server.log.filter(e => e.url && new URL(e.url, "https://x").searchParams.get("c") === c).map(e => `+${e.t}ms ${e.method} ${e.url.replace(/\?.*/, "")} ${e.status}${e.headers.range ? " range " + e.headers.range : ""}`);
	try {
		// 1. Reading view of a note holding the raw tags
		await L.watchAdded(page);
		server.mark("note");
		await L.openNote(page, "Raw.md", { mode: "preview", wait: 3000 });
		res.readingView = await page.evaluate(() => {
			const root = document.querySelector(".workspace-leaf.mod-active .markdown-reading-view");
			return [...root.querySelectorAll("audio,video,iframe,img,embed,source")].map(e => ({ tag: e.tagName.toLowerCase(), src: (e.getAttribute("src") || "").replace(/\?c=.*/, ""), attrs: [...e.attributes].map(a => a.name + (a.value ? "=" + a.value.replace(/https:\/\/[^ ]+/, "<url>") : "")).join(" ") }));
		});
		res.readingViewRequests = tags("note").map(([n]) => n);
		console.log("\n=== Reading view of a note with raw tags: elements in the DOM (what Obsidian kept)");
		for (const e of res.readingView) console.log(`  ${e.tag} [${e.attrs}]`);
		console.log("requests (Reading view; the note is rendered once on open, with a second pass seen in S1):");
		for (const [n] of tags("note")) console.log(`  ${n.padEnd(22)}`, reqsFor("note-" + n.replace(/ preload=none/, "none").replace("audio with <source>", "source").replace("iframe no sandbox", "iframenosb").replace(/ /g, "")).join(" | ") || "(no request)");

		// 2. MarkdownRenderer.render into a detached element, then attached; and into an attached element
		for (const mode of ["detached", "attached"]) {
			server.mark("render-" + mode);
			const text = tags(mode).map(([n, h]) => h).join("\n\n");
			const times = await page.evaluate(async ({ text, mode }) => {
				const el = document.createElement("div"); if (mode === "attached") document.querySelector(".workspace-leaf.mod-active .view-content").appendChild(el);
				const t0 = Date.now(), comp = new window.__obs.Component(); comp.load();
				await window.__obs.MarkdownRenderer.render(app, text, el, "Raw.md", comp);
				window.__t = { t0, resolved: Date.now(), el: window.__mrEl = el };
				return { t0, resolved: Date.now(), nodes: [...el.querySelectorAll("audio,video,iframe,img,embed,source")].map(e => e.tagName.toLowerCase() + "[" + [...e.attributes].map(a => a.name).join(",") + "]") };
			}, { text, mode });
			await L.sleep(1500);
			const before = server.since("render-" + mode).length;
			console.log(`\n=== MarkdownRenderer.render into a ${mode} element: nodes after the promise resolved: ${times.nodes.join(" ")}`);
			console.log(`requests while ${mode} (1.5 s after the render promise resolved): ${before}`);
			for (const [n] of tags(mode)) console.log(`  ${n.padEnd(22)}`, reqsFor(mode + "-" + n.replace(/ preload=none/, "none").replace("audio with <source>", "source").replace("iframe no sandbox", "iframenosb").replace(/ /g, "")).join(" | ") || "(no request)");
			if (mode === "detached") {
				server.mark("then-attach");
				await page.evaluate(() => document.querySelector(".workspace-leaf.mod-active .view-content").appendChild(window.__mrEl));
				await L.sleep(2000);
				console.log("--- then the same element attached to the document, 2 s later; new requests:");
				for (const e of server.since("then-attach")) console.log(`  +${e.t}ms ${e.method} ${e.url.replace(/^.*c=/, "c=")} ${e.status}${e.headers.range ? " range " + e.headers.range : ""}`);
			}
			await page.evaluate(() => window.__mrEl && window.__mrEl.remove());
		}

		// 3. plain DOM: element created and given its src while detached, then attached
		console.log("\n=== Plain DOM: createElement + src while detached, wait 1.5 s, attach, wait 1.5 s");
		const build = {
			"audio": c => `a=document.createElement("audio");a.src="${H}/tone-2s.wav?c=${c}"`,
			"audio preload=none": c => `a=document.createElement("audio");a.preload="none";a.src="${H}/tone-2s.wav?c=${c}"`,
			"video": c => `a=document.createElement("video");a.src="${H}/clip.webm?c=${c}"`,
			"new Audio(src)": c => `a=new Audio("${H}/tone-2s.wav?c=${c}")`,
			"iframe": c => `a=document.createElement("iframe");a.src="${H}/frame.html?c=${c}"`,
			"img": c => `a=document.createElement("img");a.src="${H}/pic.png?c=${c}"`,
		};
		for (const [n, code] of Object.entries(build)) {
			const c = "dom-" + n.replace(/[^a-z]/g, "");
			await page.evaluate(`(() => { let a; ${code(c)}; window.__a = a; })()`);
			await L.sleep(1500);
			const det = reqsFor(c).length;
			await page.evaluate(() => document.querySelector(".workspace-leaf.mod-active .view-content").appendChild(window.__a));
			await L.sleep(1500);
			const att = reqsFor(c);
			console.log(`  ${n.padEnd(22)} requests while detached: ${det}; after attach: ${att.length}  ${att.join(" | ")}`);
			await page.evaluate(() => { window.__a.pause && window.__a.pause(); window.__a.remove(); });
		}
	} finally { await r.stop(); }
})().catch(e => { console.error(e); process.exit(1); });
