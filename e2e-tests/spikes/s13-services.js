// S13 services and embeds. (A) Does stock Obsidian make an embedded player from a video or audio SERVICE address in image syntax? The service host names are pointed at
// the local https server with host-resolver-rules, so the DOM and the requests Obsidian asks for can be seen without loading the real services.
// (B) Does an <iframe> with sandbox and referrerpolicy, inserted into the Booklet view, load a page from the local server, and what do Referer, Origin and the page's
// own document.referrer / location.ancestorOrigins show? (C) with --real: the same iframe aimed at the real YouTube and Vimeo embed addresses, reading what the frame shows.
//   PLAYWRIGHT=<node_modules> node s13-services.js --obsidian <binary> --out <dir> --media <folder> --plugin <built plugin folder> [--real [--only-real]]
// --real talks to the real YouTube and Vimeo over the network (certificates checked as normal); without it nothing leaves the machine except what stock Obsidian itself fetches for its own YouTube embed.
const L = require("./lib");
const HOSTS = ["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtu.be", "vimeo.com", "player.vimeo.com", "soundcloud.com", "w.soundcloud.com", "open.spotify.com", "media.example.org"];
const hostsMap = Object.fromEntries(HOSTS.map(h => [h, 1]));
const FRAME = `<!doctype html><title>frame</title><p id=t>hello from the frame</p><script>
var q=new URLSearchParams(location.search).get("v");
new Image().src="/report?v="+q+"&ref="+encodeURIComponent(document.referrer)+"&origin="+encodeURIComponent(location.origin)+"&win="+encodeURIComponent(window.origin)+"&ao="+encodeURIComponent(JSON.stringify(location.ancestorOrigins?Array.from(location.ancestorOrigins):null))+"&top="+(function(){try{return encodeURIComponent(String(top.location.href))}catch(e){return "blocked"}})();
</script>`;
const dom = el => ({ tag: el.tagName.toLowerCase(), src: el.getAttribute("src") || el.getAttribute("href"), attrs: [...el.attributes].filter(a => a.name !== "src" && a.name !== "href").map(a => a.name + "=" + a.value).join(" ") });

(async () => {
	const o = L.args();
	const forms = [
		["youtube watch", "![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)"], ["youtube short link", "![](https://youtu.be/dQw4w9WgXcQ)"], ["youtube embed address", "![](https://www.youtube.com/embed/dQw4w9WgXcQ)"],
		["vimeo", "![](https://vimeo.com/76979871)"], ["soundcloud (audio)", "![](https://soundcloud.com/artist/track)"], ["spotify episode (audio)", "![](https://open.spotify.com/episode/abc123)"],
		["unknown host, no extension", "![](https://media.example.org/stream)"], ["youtube watch as a link", "[watch](https://www.youtube.com/watch?v=dQw4w9WgXcQ)"],
	];
	const body = forms.map(([l, f], i) => `S${i}: ${f}`).join("\n\n") + "\n";
	// the frame page is a file in the vault; /report is not a file, so it is answered 404, which is fine: the server logs the query
	const mk = () => L.makeVault(o.out + "/v-s13", { "Svc.md": "# Services\n\n" + body, "Svc.booklet.md": L.bookletNote("svc", body), "frame.html": FRAME }, { plugin: o.plugin, copyFrom: o.media });

	// ---- A: stock Obsidian, Reading view
	if (!o["only-real"]) {
		const r = await L.start(o, { vault: mk, name: "s13a", hosts: hostsMap });
		try {
			await L.watchAdded(r.page); r.server.mark("A");
			await L.openNote(r.page, "Svc.md", { mode: "preview", wait: 4000 });
			const out = await r.page.evaluate(() => { const o = {}; for (const p of document.querySelectorAll(".workspace-leaf.mod-active .markdown-reading-view p")) { const m = /^(S\d+):/.exec(p.textContent); if (m) o[m[1]] = [...p.querySelectorAll("iframe,img,audio,video,a,span.internal-embed")].map(e => ({ tag: e.tagName.toLowerCase(), src: e.getAttribute("src") || e.getAttribute("href"), attrs: [...e.attributes].filter(a => a.name !== "src" && a.name !== "href").map(a => a.name + "=" + a.value).join(" ") })); } return o; });
			console.log("=== A. stock Obsidian, Reading view; service names mapped to the local server");
			forms.forEach(([l, f], i) => console.log(`  ${(l + ":").padEnd(30)} ${f}\n      DOM: ${out["S" + i].map(e => `<${e.tag}> src=${e.src} [${e.attrs}]`).join(" ; ") || "(nothing)"}`));
			const reqs = r.server.since("A"); console.log("  requests the app made to the stand-in server (" + reqs.length + "):");
			const seen = new Set(); for (const e of reqs) { const k = e.headers.host + e.url; if (seen.has(k)) continue; seen.add(k); console.log(`    ${e.method} https://${e.headers.host}${e.url}  dest=${e.headers["sec-fetch-dest"]} referer=${e.headers.referer || "-"} origin=${e.headers.origin || "-"}`); }
		} finally { await r.stop(); }
	}
	// ---- B: Booklet view (0.11.0), iframes and the markdown forms
	if (o.plugin && !o["only-real"]) {
		const r = await L.start(o, { vault: mk, plugin: true, name: "s13b", hosts: hostsMap });
		try {
			r.server.mark("B0");
			await L.openNote(r.page, "Svc.booklet.md", { type: "booklet", mode: "", wait: 1500 });
			await r.page.evaluate(() => { const c = app.workspace.getLeavesOfType("booklet")[0].view.contentEl.querySelector(".booklet-cardrow"); c && c.click(); });
			await L.sleep(2500);
			const same = await r.page.evaluate(() => { const o = {}; for (const p of app.workspace.getLeavesOfType("booklet")[0].view.contentEl.querySelectorAll("p")) { const m = /^(S\d+):/.exec(p.textContent); if (m) o[m[1]] = [...p.querySelectorAll("iframe,img,audio,video,a")].map(e => e.tagName.toLowerCase() + " " + (e.getAttribute("src") || e.getAttribute("href") || "").slice(0, 60)); } return o; });
			console.log("\n=== B1. the same forms drawn by the 0.11.0 Booklet view (MarkdownRenderer.render)\n  " + JSON.stringify(same));
			console.log("\n=== B2. iframes inserted into the Booklet view's contentEl");
			console.log("  app window:", JSON.stringify(await r.page.evaluate(() => ({ origin: location.origin, href: location.href }))));
			const variants = [
				["1 sandbox=allow-scripts, referrerpolicy=no-referrer", 'sandbox="allow-scripts" referrerpolicy="no-referrer"'],
				["2 sandbox=allow-scripts allow-same-origin, strict-origin-when-cross-origin", 'sandbox="allow-scripts allow-same-origin" referrerpolicy="strict-origin-when-cross-origin"'],
				["3 sandbox=allow-scripts allow-same-origin, no referrerpolicy attribute", 'sandbox="allow-scripts allow-same-origin"'],
				["4 sandbox=allow-scripts, referrerpolicy=origin", 'sandbox="allow-scripts" referrerpolicy="origin"'],
				["5 sandbox=allow-scripts, referrerpolicy=unsafe-url", 'sandbox="allow-scripts" referrerpolicy="unsafe-url"'],
				["6 sandbox (empty: everything off), referrerpolicy=origin", 'sandbox="" referrerpolicy="origin"'],
				["7 no sandbox, no referrerpolicy", ""],
			];
			for (const [name, attrs] of variants) {
				const v = name[0]; r.server.mark("v" + v);
				await r.page.evaluate(([v, attrs]) => { const view = app.workspace.getLeavesOfType("booklet")[0].view; const box = view.contentEl.createDiv(); box.innerHTML = `<iframe ${attrs} src="https://media.example.org/frame.html?v=${v}" width="300" height="80"></iframe>`; }, [v, attrs]);
				await L.sleep(1500);
				const rq = r.server.since("v" + v), nav = rq.find(e => e.url.startsWith("/frame.html")), rep = rq.find(e => e.url.startsWith("/report"));
				console.log(`  ${name}\n      navigation: ${nav ? `${nav.status} Referer=${nav.headers.referer || "-"} Origin=${nav.headers.origin || "-"} Sec-Fetch-Dest=${nav.headers["sec-fetch-dest"]} Site=${nav.headers["sec-fetch-site"]} Mode=${nav.headers["sec-fetch-mode"]}` : "NO REQUEST"}\n      the page's own report: ${rep ? decodeURIComponent(rep.url.replace(/^\/report\?/, "")) + "   (img request Referer=" + (rep.headers.referer || "-") + ")" : "(none: scripts off or blocked)"}`);
			}
		} finally { await r.stop(); }
	}
	// ---- C: real services. Direct (the app window is the embedder), through an https page of our own (control: a normal embedder), and through the page Obsidian's own embed uses.
	if (o.real) {
		const host = `<!doctype html><title>host</title><iframe id=f sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" width="480" height="300"></iframe><script>document.getElementById("f").src=new URLSearchParams(location.search).get("src")</script>`;
		const vault = L.makeVault(o.out + "/v-s13c", { "x.md": "x", "host.html": host, "Yt.md": "# Yt\n\n![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n\n![](https://www.youtube.com/watch?v=jNQXAC9IVRw)\n" }, { copyFrom: o.media });
		// the local server is only the control's embedder; the certificate check is switched off for the whole run, the real services have valid ones
		const r = await L.start(o, { vault, name: "s13c", hosts: { "media.example.org": 1 } });
		try {
			console.log("\n=== C. real addresses (network on). A = iframe straight in the app window; B = control, the same iframe inside an https page (https://media.example.org/host.html, an ordinary embedder); C = the address Obsidian's own embed uses (releases.obsidian.md/youtube?v=)");
			// D = stock Obsidian's own embed of a youtube address in image syntax, in Reading view, with the network on
			await L.openNote(r.page, "Yt.md", { mode: "preview", wait: 9000 });
			console.log("  D stock embed in Reading view, frames after 9 s:");
			for (const f of r.page.frames()) { if (f === r.page.mainFrame() || /^(about:|app:)/.test(f.url())) continue; let t = ""; try { t = (await f.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 110); } catch (e) { t = "unreadable"; } console.log(`      ${f.url().slice(0, 80)}  ->  ${t}`); }
			const cases = [];
			for (const id of ["dQw4w9WgXcQ", "jNQXAC9IVRw"]) {
				const yt = "https://www.youtube.com/embed/" + id;
				cases.push([`A youtube ${id}, direct`, yt, "direct"], [`B youtube ${id}, via an https page`, yt, "host"], [`C youtube ${id}, Obsidian's wrapper`, "https://releases.obsidian.md/youtube?v=" + id, "direct"]);
			}
			cases.push(["A vimeo 76979871, direct", "https://player.vimeo.com/video/76979871", "direct"], ["B vimeo 76979871, via an https page", "https://player.vimeo.com/video/76979871", "host"]);
			for (const [name, src, how] of cases) {
				const outer = how === "host" ? "https://media.example.org/host.html?src=" + encodeURIComponent(src) : src;
				await r.page.evaluate(outer => { document.querySelectorAll(".s13-box").forEach(b => b.remove()); const d = document.body.appendChild(document.createElement("div")); d.className = "s13-box"; d.style.cssText = "position:fixed;left:10px;top:10px;width:480px;height:300px;z-index:99999;background:#fff"; d.innerHTML = `<iframe sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" src="${outer}" width="480" height="300"></iframe>`; }, outer);
				await L.sleep(8000);
				const frames = r.page.frames().filter(f => /youtube|vimeo/.test(f.url()) && !/releases\.obsidian/.test(f.url()));
				let text = "(no frame)"; for (const f of frames) { try { text = (await f.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 200); } catch (e) { text = "unreadable: " + e.message.slice(0, 80); } }
				console.log(`  ${name}\n      frames: ${r.page.frames().map(f => f.url().slice(0, 70)).filter(u => /youtube|vimeo|obsidian\.md\/y|media\.example/.test(u)).join(" | ")}\n      visible text: ${text}`);
			}
		} finally { await r.stop(); }
	}
})().catch(e => { console.error(e); process.exit(1); });
