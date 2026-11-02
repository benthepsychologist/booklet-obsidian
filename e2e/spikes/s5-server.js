// S5 server view: the headers a remote media request carries from the app (Referer, Origin, User-Agent, Range), the range pattern when playing and seeking,
// and whether the server sees any request before a press. The elements are made by script in the app window (the plugin will make its players the same way).
//   PLAYWRIGHT=<node_modules> node s5-server.js --obsidian <binary> --out <dir> --media <folder from make-media.js>
const L = require("./lib");
(async () => {
	const o = L.args();
	const vault = L.makeVault(o.out + "/v-s5", { "x.md": "x", "frame.html": "<!doctype html><p>frame</p>" }, { copyFrom: o.media });
	const r = await L.start(o, { vault, name: "s5", hosts: { "media.example.org": 1 } });
	const { page, server } = r;
	const show = (title, list) => { console.log(`  ${title}: ${list.length} request(s)`); for (const e of list) console.log(`    +${e.t}ms ${e.method} ${e.url.replace(/\?.*/, "")} -> ${e.status}  range=${e.headers.range || "-"}  referer=${e.headers.referer || "-"}  origin=${e.headers.origin || "-"}  sec-fetch-dest=${e.headers["sec-fetch-dest"] || "-"} mode=${e.headers["sec-fetch-mode"] || "-"} site=${e.headers["sec-fetch-site"] || "-"}  accept=${(e.headers.accept || "-").slice(0, 28)}`); };
	try {
		console.log("app window:", JSON.stringify(await page.evaluate(() => ({ origin: location.origin, href: location.href, referrer: document.referrer, ua: navigator.userAgent }))));
		const U = "https://media.example.org";
		const mk = (code, wait) => page.evaluate(async ([code, wait]) => { let a; eval(code); window.__a = a; document.body.appendChild(a); await new Promise(r => setTimeout(r, wait)); }, [code, wait]);

		console.log("\n=== A. an <audio preload=none> given its src: any request before a press?");
		server.mark("A"); await mk(`a=document.createElement("audio");a.preload="none";a.src="${U}/tone-60s.wav?c=A"`, 1500);
		show("before the press (1.5 s)", server.since("A"));
		server.mark("A-press"); await page.evaluate(async () => { window.__a.muted = true; await window.__a.play(); await new Promise(r => setTimeout(r, 1200)); });
		show("after play() (1.2 s)", server.since("A-press"));
		server.mark("A-seek"); await page.evaluate(async () => { window.__a.currentTime = 40; await new Promise(r => setTimeout(r, 1500)); });
		show("after seeking to 40 s (1.5 s)", server.since("A-seek"));
		server.mark("A-seek2"); await page.evaluate(async () => { window.__a.currentTime = 10; await new Promise(r => setTimeout(r, 1500)); });
		show("after seeking back to 10 s", server.since("A-seek2"));
		await page.evaluate(() => { window.__a.pause(); window.__a.remove(); });

		console.log("\n=== B. the same with crossorigin=anonymous (adds an Origin header?)");
		server.mark("B"); await mk(`a=document.createElement("audio");a.preload="none";a.crossOrigin="anonymous";a.src="${U}/tone-10s.wav?c=B"`, 600);
		await page.evaluate(async () => { window.__a.muted = true; await window.__a.play(); await new Promise(r => setTimeout(r, 800)); window.__a.pause(); window.__a.remove(); });
		show("after play()", server.since("B"));

		console.log("\n=== C. <video preload=none>, <img>, <img referrerpolicy=no-referrer>");
		server.mark("C1"); await mk(`a=document.createElement("video");a.preload="none";a.src="${U}/clip.webm?c=C"`, 800);
		show("video before the press", server.since("C1"));
		server.mark("C2"); await page.evaluate(async () => { window.__a.muted = true; await window.__a.play(); await new Promise(r => setTimeout(r, 800)); window.__a.pause(); window.__a.remove(); });
		show("video after play()", server.since("C2"));
		server.mark("C3"); await mk(`a=document.createElement("img");a.src="${U}/pic.png?c=img"`, 600); show("img default", server.since("C3"));
		server.mark("C4"); await mk(`a=document.createElement("img");a.referrerPolicy="no-referrer";a.src="${U}/pic.png?c=imgnr"`, 600); show("img referrerpolicy=no-referrer", server.since("C4"));

		console.log("\n=== D. default preload (metadata): a request without any press");
		server.mark("D"); await mk(`a=document.createElement("audio");a.src="${U}/tone-60s.wav?c=D"`, 1200);
		show("no press", server.since("D"));
		console.log("    state:", JSON.stringify(await page.evaluate(() => ({ readyState: window.__a.readyState, duration: window.__a.duration, paused: window.__a.paused }))));
		await page.evaluate(() => window.__a.remove());
	} finally { await r.stop(); }
})().catch(e => { console.error(e); process.exit(1); });
