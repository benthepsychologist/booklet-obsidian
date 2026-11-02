// Checks 48 to 54 of plugin-check.js (0.12.0, audio and video, the allow list and `listen`), in the real app. Every note is made up and
// written into the check's own vault; every remote address is on a made-up host (example.org, example.net) that Obsidian is told to reach
// at the local https server (media-lib.js), so the server's log is the network log.
//   48 nothing remote before a press (every remote form, every position, every state of a host; a press does request)
//   49 local forms play (![[x.wav]], ![](media/x.wav), ![alt][id]) from a root note and a subfolder note, the native player
//   50 the allow card and the three scopes (once, this note, this vault), data.json, the settings page, the keyboard
//   51 `listen`: the tick, the end, a pause, the position, an incoming change, a kill
//   52 Continue: a skipped question is never offered again
//   53 frames and raw media tags are links naming the host; the host after a look-alike link; Reading view and Markdown unchanged
//   54 accessibility of the new controls (keyboard walk, axe when it is installed, reduced motion, 200% zoom)
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check functions.
const fs = require("fs"), path = require("path");
const { quiet, frames } = require("./waits");

module.exports = function mediaChecks(env) {
  const { Check, BOOK, sleep } = env;
  const lib = require("./media-lib")(env);
  const { withMedia, HOSTS, SERVICE_HOSTS } = lib;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const bytes = f => fs.readFileSync(f);
  const answersIn = text => { const out = {}; for (const m of text.matchAll(/```booklet answers([^\n]*)\n([\s\S]*?)\n```/g)) out[m[1].trim()] = JSON.parse(m[2]); return out; };
  // the answers of each module in a note's records: { "": the bare activities', "m1": module m1's, ... }
  const answersByModule = text => { const out = {}; let scope = ""; for (const part of text.split(/^(?=> \[!records)/m)) { const m = /^> \[!records(?:\|([^\]\s]*))?\]/.exec(part); if (m) scope = m[1] || ""; const a = /```booklet answers[^\n]*\n([\s\S]*?)\n```/.exec(part); if (a) out[scope] = JSON.parse(a[1]); } return out; };
  const put = (ctx, rel, text) => { const f = ctx.file(rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
  // every host a check could see a request for: the made-up ones, the services' (mapped to the local server), and Obsidian's own YouTube wrapper
  const WATCHED = new Set([...HOSTS, ...SERVICE_HOSTS, "releases.obsidian.md"]);
  // what the page itself asked for, read from the page's own request events (it sees hosts the local server does not answer for)
  function watchRequests(o) {
    const seen = [];
    o.page.on("request", r => { try { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && WATCHED.has(u.hostname)) seen.push({ t: Date.now(), host: u.hostname, url: r.url(), type: r.resourceType() }); } catch (e) { /* not an address */ } });
    return seen;
  }
  const front = (id, title, extra = "") => `---\nbooklet: "0.18"\nid: booklet-test/${id}\ntitle: ${title}\nlang: en\n${extra}---\n\n`;
  const poll = async (fn, ms = 6000, every = 100) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await sleep(every); } };
  const slotsOf = (o, sel = "") => o.evaluate(s => [...document.querySelectorAll(s + " .booklet-media-slot")].map(e => ({ kind: e.getAttribute("data-booklet-media"), state: e.getAttribute("data-state"), where: e.closest(".booklet-prompt, .booklet-choices, .booklet-scale, .booklet-prose, .booklet-help, .booklet-listen-media") ? e.closest(".booklet-prompt, .booklet-choices, .booklet-scale, .booklet-prose, .booklet-help, .booklet-listen-media").className.split(" ")[0] : "", text: e.textContent.replace(/\s+/g, " ").trim().slice(0, 120) })), BOOK + sel);

  /* ================= CHECK 48 ================= */
  // the matrix: five states of a host, eight forms, four positions. Each address is /<state>-<form>-<position>.<ext>, so a request names its own origin.
  const STATES = [["undeclared", "blocked.example.net"], ["declared", "declared.example.org"], ["vault", "vault.example.org"], ["note", "note.example.org"], ["both", "media.example.org"]];
  const FORMS = ["inline", "ref", "short", "wiki", "audio", "video", "source", "iframe"];
  const POSITIONS = ["prose", "title", "option", "anchor"];
  const EXT = { audio: "wav", video: "mp4", iframe: "html" };
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const NOTE48 = "Nothing before a press.booklet.md";
  function note48(ctx) {
    const defs = [];
    const addr = (s, host, f, p) => ctx.url(host, `${s}-${f}-${p}.${EXT[f] || "wav"}`);
    const form = (s, host, f, p) => {
      const u = addr(s, host, f, p), id = `${s}-${f}-${p}`;
      switch (f) {
        case "inline": return `![a ${p}](${u})`;
        case "ref": defs.push(`[${id}]: ${u}`); return `![a ${p}][${id}]`;
        case "short": defs.push(`[${id}s]: ${u}`); return `![${id}s]`;
        case "wiki": return `![[${u}]]`;
        case "audio": return `<audio src="${u}" controls></audio>`;
        case "video": return `<video src="${u}" controls></video>`;
        case "source": return `<audio controls><source src="${u}"></audio>`;
        default: return `<iframe src="${u}"></iframe>`;
      }
    };
    let t = front("nothing-before-a-press", "Nothing before a press", `media-from:\n  - ${ctx.url("declared.example.org")}\n  - ${ctx.url("media.example.org")}\n`);
    t += "> [!activity|a] Nothing before a press\n\nEvery remote form, in every place, for every state of a host.\n\n";
    for (const [s, host] of STATES) for (const f of FORMS) {
      t += `Prose ${s} ${f}: ${form(s, host, f, "prose")}\n\n`;
      t += `> [!choice|c-${s}-${f}] Title ${s} ${f} ${form(s, host, f, "title")}\n- [ ] Option ${form(s, host, f, "option")}\n- [ ] Plain\n\n`;
      t += `> [!scale|s-${s}-${f}] Scale ${s} ${f}\n\n1. ${form(s, host, f, "anchor")}\n2. Two\n\n`;
    }
    // the services: a link in image syntax, a bare address and a link of words, for a service that is allowed (YouTube) and one that is not (Vimeo)
    t += "YouTube in image syntax: ![the talk](https://www.youtube.com/watch?v=ABCDEFGHIJK)\n\n";
    t += "https://youtu.be/BCDEFGHIJKL\n\n";
    t += "[the other talk](https://www.youtube.com/watch?v=CDEFGHIJKLM)\n\n";
    t += "Vimeo in image syntax: ![the film](https://vimeo.com/123456789)\n\n";
    t += "https://vimeo.com/234567890\n\n";
    t += "> [!choice|c-svc] Pick ![the talk](https://www.youtube.com/watch?v=DEFGHIJKLMN)\n- [ ] Option ![the film](https://vimeo.com/345678901)\n- [ ] Plain\n\n";
    // an image is not media: Obsidian's own
    t += `A picture: <img src="${ctx.url("other.example.org", "pic.png")}">\n\n`;
    // the controls: real files, one for each way a press can go
    t += `Control, allowed: ![control vault](${ctx.url("vault.example.org", "tone-2s.wav")})\n\n`;
    t += `Control, asks: ![control blocked](${ctx.url("blocked.example.net", "tone-5s.wav")})\n\n`;
    t += `> [!text|q] A question?\n\n${defs.join("\n")}\n`;
    return t;
  }
  async function check48() {
    const c = new Check(48, "0.12.0 nothing remote before a press, by the server's log and the page's own request events: every remote form (three embed syntaxes, the wiki form, raw audio, video, source and iframe) in prose, a title, an option and a scale anchor, for a host undeclared and not allowed, declared and not allowed, on the vault list, on the note's list, and declared and on the list; a service link; and a press does request");
    await withMedia("c48", {
      note: NOTE48,
      data: ctx => ({ allowedMediaHosts: [ctx.host("vault.example.org"), ctx.host("media.example.org"), "youtube.com"], noteAllows: { [NOTE48]: [ctx.host("note.example.org")] } }),
      files: ctx => ({ [NOTE48]: note48(ctx), "pic.png": PNG }),
    }, async (o, ctx) => {
      const seen = watchRequests(o);
      ctx.server.mark("before-open");
      await ctx.K.open(o, NOTE48);
      // the card for the declared host opens on its own (check 50 looks at it); here it is put away so the page is the page
      await poll(() => o.evaluate(() => !!document.querySelector(".booklet-allow")), 3000);
      await o.page.locator(".booklet-allow-card button", { hasText: /^Not now$/ }).click({ timeout: 5000 });
      await sleep(2500);   // media is requested a few ms after a render starts; this is long past that
      await quiet(o);
      const urls = (await o.evaluate(() => document.body.innerText.length));
      c.info("the page is drawn (" + urls + " characters of text)");
      const b = n => ctx.hits(n, "before-open");
      for (const [s, host] of STATES) {
        const n = FORMS.length * POSITIONS.length;
        const got = b(host);
        c.ok(got.length === 0, `host ${s} (${host}): ${n} addresses in the note, requests to it before any press: ${got.length}${got.length ? " " + JSON.stringify(got.slice(0, 5).map(e => e.url)) : ""}`);
      }
      const svcServer = SERVICE_HOSTS.flatMap(h => b(h));
      c.ok(svcServer.length === 0, `the services' hosts (YouTube, Vimeo, ...): requests to the local server before a press: ${svcServer.length}${svcServer.length ? " " + JSON.stringify(svcServer.slice(0, 5).map(e => e.headers.host + e.url)) : ""}`);
      const allSeen = seen.filter(r => !/pic\.png$/.test(r.url));
      c.ok(allSeen.length === 0, `the page itself asked for nothing from any made-up host, any service host or Obsidian's YouTube wrapper (releases.obsidian.md) before a press, the one picture apart: ${allSeen.length}${allSeen.length ? " " + JSON.stringify(allSeen.slice(0, 5).map(r => r.type + " " + r.url)) : ""}`);
      // what is on the page: no remote media element, no frame, no source, in the view (the plugin's slots are buttons and links)
      const dom = await o.evaluate(sel => {
        const v = document.querySelector(sel + " .view-content");
        const remote = s => [...v.querySelectorAll(s)].filter(e => /^(https?:)?\/\//i.test(e.getAttribute("src") || e.getAttribute("data") || ""));
        return { audio: remote("audio").length, video: remote("video").length, source: remote("source").length, iframe: remote("iframe").length, object: remote("object, embed").length,
          anyIframe: v.querySelectorAll("iframe").length, anyPlayer: v.querySelectorAll("[data-booklet-player]").length, img: [...v.querySelectorAll("img")].filter(e => /^https?:/.test(e.getAttribute("src") || "")).map(e => e.getAttribute("src").replace(/^https:\/\/[^/]+/, "")) };
      }, BOOK);
      c.ok(dom.audio + dom.video + dom.source + dom.iframe + dom.object === 0 && dom.anyIframe === 0 && dom.anyPlayer === 0, `no remote audio, video, source, frame, object or embed element, no frame and no player of the plugin's on the page: ${JSON.stringify(dom)}`);
      c.info("remote pictures are Obsidian's own and are not gated (plan: pictures stay Obsidian's), so a raw <img> is asked for at once: " + JSON.stringify(dom.img) + ", requests for it: " + ctx.hits("other.example.org", "before-open").length);
      // what the plugin drew in each place
      const slots = await slotsOf(o);
      const by = (kind, state) => slots.filter(x => x.kind === kind && (!state || x.state === state));
      const inPlaces = slots.filter(x => x.where && x.where !== "booklet-prose");
      c.info("slots: " + JSON.stringify(slots.reduce((m, x) => { const k = x.kind + "/" + x.state; m[k] = (m[k] || 0) + 1; return m; }, {})));
      c.ok(inPlaces.length === 0, `in a title, an option or a scale anchor no slot is drawn, whatever the form: ${inPlaces.length} (${inPlaces.slice(0, 3).map(x => x.where + " " + x.text.slice(0, 40)).join(" | ")})`);
      const inlineForms = by("audio").length + by("video").length;
      const wantMedia = STATES.length * 3;   // inline, ref and short in prose, plus the two controls and the services' slots, counted below
      c.ok(by("audio").length >= wantMedia + 2 && by("video").length >= 2, `the three embed syntaxes in prose are slots: ${by("audio").length} audio (at least ${wantMedia} for the matrix and the two controls) and ${by("video").length} video (the allowed YouTube links and the blocked Vimeo ones)`);
      const ready = by("audio", "ready").length, blocked = by("audio", "blocked").length;
      c.ok(ready >= 9 + 1 && blocked >= 6 + 1, `a host on a list is a ready slot and any other a blocked one: audio slots ready ${ready} (vault, note and declared-and-listed hosts, three syntaxes each, and the control), blocked ${blocked} (undeclared and declared hosts, and the control)`);
      const links = by("link");
      c.ok(links.length === STATES.length * 4, `the raw audio, video, source and iframe tags in prose are links naming the host, never loaded: ${links.length} of ${STATES.length * 4}; one reads ${JSON.stringify(links[0] && links[0].text)}`);
      const wiki = await o.evaluate(sel => [...document.querySelectorAll(sel + " .internal-embed.mod-empty-attachment, " + sel + " .internal-embed.file-embed")].filter(e => /^https?:/.test(e.getAttribute("src") || "")).length, BOOK);
      c.info(`the wiki form ![[https://...]]: Obsidian's own, drawn as "could not be found", nothing requested: ${wiki} of ${STATES.length} in prose`);
      const svc = await slotsOf(o);
      const svcSlots = svc.filter(x => /YouTube|Vimeo/.test(x.text));
      const yt = svcSlots.filter(x => /YouTube/.test(x.text)), vm = svcSlots.filter(x => /Vimeo/.test(x.text));
      c.ok(yt.length === 3 && yt.every(x => x.state === "ready"), `an allowed service (YouTube: image syntax, youtu.be alone on its line, a link of words alone on its line) is a Play slot, none loaded: ${yt.length} slots, states ${yt.map(x => x.state)}`);
      c.ok(vm.length === 1 && vm[0].state === "blocked", `a service not allowed (Vimeo) in image syntax is a blocked slot (${vm.map(x => x.state)}), and its bare link stays an ordinary link: ${await o.evaluate(sel => [...document.querySelectorAll(sel + " a.external-link")].filter(a => /vimeo/.test(a.href)).length, BOOK)} link(s)`);

      // the positive controls: a press does request
      ctx.server.mark("press-1");
      const play = text => o.page.locator(BOOK + " .booklet-media-play", { hasText: text }).first();
      await play("control vault").scrollIntoViewIfNeeded();
      await play("control vault").click({ timeout: 5000 });
      const got1 = await poll(() => ctx.hits("vault.example.org", "press-1").length > 0, 6000);
      const r1 = ctx.hits("vault.example.org", "press-1");
      c.ok(got1 && r1.some(e => /tone-2s\.wav/.test(e.url)), `control: a press on an allowed host's Play requests its file: ${JSON.stringify(r1.map(e => e.method + " " + e.url + " " + e.status))}`);
      const playing = await poll(() => o.evaluate(sel => { const a = document.querySelector(sel + " audio[data-booklet-player]"); return a && !a.paused && a.currentTime > 0.2 ? a.currentTime : 0; }, BOOK), 5000);
      c.ok(!!playing, `and it plays: the player's clock moved to ${playing && playing.toFixed ? playing.toFixed(2) : playing} s`);
      ctx.server.mark("press-2");
      await play("control blocked").scrollIntoViewIfNeeded();
      await play("control blocked").click({ timeout: 5000 });
      const card = await poll(() => o.evaluate(() => { const c = document.querySelector(".booklet-allow-card .modal-title"); return c ? c.textContent : null; }), 3000);
      await sleep(800);
      c.ok(!!card && ctx.hits("blocked.example.net", "press-2").length === 0, `control: a press on a host not allowed asks first (the card "${card}") and still requests nothing: ${ctx.hits("blocked.example.net", "press-2").length} requests`);
      await o.page.locator(".booklet-allow-card button", { hasText: /^Allow once$/ }).click({ timeout: 5000 });
      const got2 = await poll(() => ctx.hits("blocked.example.net", "press-2").length > 0, 6000);
      c.ok(got2 && ctx.hits("blocked.example.net", "press-2").some(e => /tone-5s\.wav/.test(e.url)), `and "Allow once" requests it: ${JSON.stringify(ctx.hits("blocked.example.net", "press-2").map(e => e.method + " " + e.url + " " + e.status))}`);
      ctx.server.mark("press-3");
      const ytPlay = o.page.locator(BOOK + " .booklet-media-play", { hasText: "the talk" }).first();
      await ytPlay.scrollIntoViewIfNeeded();
      await ytPlay.click({ timeout: 5000 });
      const got3 = await poll(() => SERVICE_HOSTS.some(h => ctx.hits(h, "press-3").length > 0), 6000);
      const r3 = SERVICE_HOSTS.flatMap(h => ctx.hits(h, "press-3")).map(e => e.headers.host + e.url.slice(0, 60));
      const frame = await o.evaluate(sel => { const f = document.querySelector(sel + " iframe[data-booklet-player]"); return f ? { src: f.getAttribute("src"), sandbox: f.getAttribute("sandbox"), focused: document.activeElement === f } : null; }, BOOK);
      c.ok(got3 && frame && /^https:\/\/www\.youtube-nocookie\.com\/embed\/ABCDEFGHIJK/.test(frame.src), `control: a press on an allowed service's Play makes its player and that is when it is requested: ${JSON.stringify(r3)}; frame ${JSON.stringify(frame)}`);
      const wrapper = seen.filter(r => r.host === "releases.obsidian.md");
      c.ok(wrapper.length === 0, `Obsidian's own YouTube wrapper (releases.obsidian.md) was never asked for, before or after the press: ${wrapper.length}`);
    });
    return c;
  }

  /* ================= CHECK 49 ================= */
  // the local forms, from a note at the root and a note in a folder: Obsidian's own player, never gated
  const ROOT49 = "Local forms.booklet.md", SUB49 = "sub/Local forms in a folder.booklet.md";
  const note49 = id => front(id, "Local forms") + `> [!activity|a] Local forms

The wiki form: ![[tone-2s.wav]]

The path form: ![](media/tone-5s.wav)

The reference form: ![alt words][loc]

A parent path: ![](../tone-2s.wav)

> [!text|q] A question?

[loc]: media/tone-10s.wav
`;
  async function check49() {
    const c = new Check(49, "0.12.0 local forms play with Obsidian's own player: ![[x.wav]], ![](media/x.wav) and ![alt][id] from a note at the root and a note in a folder; none is gated, none asks, preload is none until pressed, nothing is requested from the server");
    await withMedia("c49", { note: ROOT49, files: () => ({ [ROOT49]: note49("local-root"), [SUB49]: note49("local-sub") }) }, async (o, ctx) => {
      ctx.server.mark("start");
      for (const [where, rel] of [["root note", ROOT49], ["note in a folder", SUB49]]) {
        await ctx.K.open(o, rel);
        await sleep(1200);
        const dom = await o.evaluate(sel => {
          const root = document.querySelector(sel + " .booklet-prose");
          const audio = [...root.querySelectorAll("audio")].map(a => ({ src: a.getAttribute("src").replace(/^app:\/\/[^/]+/, "app://id"), preload: a.getAttribute("preload"), ready: a.readyState, ours: a.hasAttribute("data-booklet-player"), native: !!a.closest(".internal-embed.media-embed") }));
          const imgs = [...root.querySelectorAll("img")].map(i => i.getAttribute("src").replace(/^app:\/\/[^/]+/, "app://id"));
          return { audio, imgs, slots: root.querySelectorAll(".booklet-media-slot").length, text: root.textContent.replace(/\s+/g, " ").slice(0, 200), card: !!document.querySelector(".booklet-allow") };
        }, BOOK);
        c.info(`[${where}] drawn: ${JSON.stringify(dom)}`);
        c.ok(dom.slots === 0 && !dom.card, `[${where}] no slot and no card: local media is never gated (${dom.slots} slots, card open ${dom.card})`);
        const names = dom.audio.map(a => (/tone-(\d+)s/.exec(a.src) || [])[1]);
        c.ok(dom.audio.length >= 3 && dom.audio.every(a => a.native && !a.ours), `[${where}] ${dom.audio.length} players are Obsidian's own elements (an audio in an internal-embed media-embed span), none the plugin's: tones ${names}`);
        c.ok(dom.audio.every(a => a.preload === "none" && a.ready === 0), `[${where}] each has preload="none" and has loaded nothing before a press (readyState ${dom.audio.map(a => a.ready)})`);
        const wiki = dom.audio.find(a => /tone-2s/.test(a.src)), path = dom.audio.find(a => /media\/tone-5s/.test(a.src));
        c.ok(!!wiki && !!path, `[${where}] ![[tone-2s.wav]] and ![](media/tone-5s.wav) are players: ${!!wiki}, ${!!path}`);
        const ref = dom.audio.find(a => /tone-10s/.test(a.src));
        // what the code does with a local reference embed (the lane brief: record it). The gate leaves a local address to Obsidian, and Obsidian draws ![alt][id] as an <img>
        c.info(`[${where}] ![alt words][loc] with a local definition (media/tone-10s.wav) is drawn as ${ref ? "an audio element" : dom.imgs.length ? "an <img> whose src is the audio file: a broken picture, not a player (plan-v2 point 10 says it plays)" : "neither: " + dom.text}`);
        // each plays: the real element's clock moves, it is never paused by the view, and it ends or is stopped by us
        const results = await o.evaluate(async sel => {
          const out = [];
          for (const a of document.querySelectorAll(sel + " .booklet-prose audio")) {
            const p = a.play();
            if (p) await p.catch(e => out.push("play rejected: " + e.name));
            await new Promise(r => setTimeout(r, 900));
            out.push({ src: a.getAttribute("src").replace(/^app:\/\/[^/]+/, "app://id").slice(0, 60), paused: a.paused, t: +a.currentTime.toFixed(2), duration: +a.duration.toFixed(2), error: a.error && a.error.code, preload: a.getAttribute("preload") });
            a.pause();
          }
          return out;
        }, BOOK);
        c.ok(results.length >= 3 && results.every(r => typeof r === "object" && r.error === null && r.t > 0.4 && r.duration > 1.5), `[${where}] every player plays: ${JSON.stringify(results.map(r => typeof r === "string" ? r : "tone-" + ((/tone-(\d+)s/.exec(r.src) || [])[1]) + " t=" + r.t + " of " + r.duration))}`);
      }
      c.ok(ctx.hits(null, "start").length === 0, `nothing was asked of the server for any of it: ${ctx.hits(null, "start").length} requests`);
    });
    return c;
  }

  /* ================= CHECK 50 ================= */
  // the allow card and the three scopes. Hosts carry the server's port (an entry that names a port covers that port only).
  const NOTE50 = "Scopes.booklet.md", OTHER50 = "Other note.booklet.md";
  const note50 = (ctx, id, hosts) => front(id, "Scopes") + `> [!activity|a] Scopes

` + hosts.map(([alt, h]) => `${alt}: ![${alt}](${ctx.url(h, "tone-2s.wav")})\n`).join("\n") + `
> [!text|q] A question?
`;
  // data.json as parsed; a read that lands in the middle of a write (the file is empty or cut) is made again
  const dataOf = ctx => { let t; for (let n = 0; n < 8; n++) { t = ctx.data(); try { return t === null ? null : JSON.parse(t); } catch (e) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40); } } return "UNPARSEABLE: " + t; };
  const slotState = (o, alt) => o.evaluate(([sel, alt]) => { const b = [...document.querySelectorAll(sel + " .booklet-media-play")].find(x => x.textContent.includes(alt)); const s = b && b.closest(".booklet-media-slot"); return s ? s.getAttribute("data-state") : null; }, [BOOK, alt]);
  const cardOf = o => o.evaluate(() => {
    const c = document.querySelector(".booklet-allow-card");
    if (!c) return null;
    const t = e => e.textContent.replace(/\s+/g, " ").trim();
    const a = document.activeElement;
    return {
      title: t(c.querySelector(".modal-title")), role: c.getAttribute("role"), modal: c.getAttribute("aria-modal"), labelled: !!document.getElementById(c.getAttribute("aria-labelledby") || "x"),
      buttons: [...c.querySelectorAll("button")].map(t), said: [...c.querySelectorAll(".booklet-allow-said")].map(t), intro: [...c.querySelectorAll(".booklet-allow-request > p")].map(t), hint: c.querySelector(".booklet-allow-hint") ? t(c.querySelector(".booklet-allow-hint")) : null,
      vault: [...c.querySelectorAll(".booklet-allow-section:nth-child(1) li")].map(li => ({ host: t(li.querySelector("label")), on: li.querySelector("input").checked, more: li.querySelector(".booklet-allow-covers") ? t(li.querySelector(".booklet-allow-covers")) : "" })),
      note: [...c.querySelectorAll(".booklet-allow-section:nth-child(2) li")].map(li => ({ host: t(li.querySelector("label")), on: li.querySelector("input").checked })),
      focus: a ? t(a).slice(0, 40) : null, focusIn: !!(a && c.contains(a)), error: c.querySelector(".booklet-allow-error") ? t(c.querySelector(".booklet-allow-error")) : "",
    };
  });
  const cardBtn = (o, name) => o.page.locator(".booklet-allow-card button", { hasText: name });
  const play50 = (o, alt) => o.page.locator(BOOK + " .booklet-media-play", { hasText: alt }).first();
  const closed = o => poll(() => o.evaluate(() => !document.querySelector(".booklet-allow")), 3000);
  async function check50() {
    const c = new Check(50, "0.12.0 the allow card and the three scopes in the real app: opens from the Allow list button, on open for declared sites not on a list and not otherwise, and on a press; once is kept nowhere, this note and this vault are kept in data.json and never in the note; a box removes a site at once; the write-in; the settings page shows the same list; keys, Escape, default focus on Not now");
    // ---- opening on open ----
    await withMedia("c50-open", {
      note: "Declares new.booklet.md",
      data: ctx => ({ allowedMediaHosts: [ctx.host("vault.example.org")], noteAllows: { "Declares for the note.booklet.md": [ctx.host("note.example.org")] } }),
      files: ctx => {
        const mk = (id, from) => front(id, id, from ? `media-from:\n${from.map(h => `  - ${ctx.url(h)}\n`).join("")}` : "") + `> [!activity|a] ${id}\n\nWords: ![x](${ctx.url("vault.example.org", "tone-2s.wav")})\n\n> [!text|q] A question?\n`;
        return { "Declares nothing.booklet.md": mk("nothing", null), "Declares listed.booklet.md": mk("listed", ["vault.example.org"]), "Declares for the note.booklet.md": mk("for-note", ["note.example.org"]), "Declares new.booklet.md": mk("new", ["declared.example.org", "vault.example.org"]) };
      },
    }, async (o, ctx) => {
      const cardNow = () => o.evaluate(() => !!document.querySelector(".booklet-allow"));
      for (const [what, rel] of [["declares nothing", "Declares nothing.booklet.md"], ["declares a site already on the vault list", "Declares listed.booklet.md"], ["declares a site on its own note's list", "Declares for the note.booklet.md"]]) {
        await ctx.K.open(o, rel); await sleep(1500);
        c.ok(!(await cardNow()), `a booklet that ${what}: the card does not open on its own`);
      }
      const before = bytes(ctx.file("Declares new.booklet.md"));
      await ctx.K.open(o, "Declares new.booklet.md");
      const up = await poll(cardNow, 3000);
      await sleep(600);
      const k = await cardOf(o);
      c.ok(up && !!k, `a booklet that declares a site not on any list: the card opens on its own`);
      if (!k) return;
      c.info("the card: " + JSON.stringify(k));
      c.ok(k.title === "This booklet plays media from other sites" && k.role === "dialog" && k.modal === "true" && k.labelled, `it is a dialog named by its title: ${k.title}`);
      c.ok(k.intro.some(t => /A booklet cannot allow a site for you: only you can/.test(t)) && k.said.some(t => t === `${ctx.host("declared.example.org")} will see when you play and from where.`), `it names only the site that is not allowed yet (the listed one is not asked about) and says what each costs: ${JSON.stringify(k.said)}`);
      c.ok(!k.said.some(t => t.includes("vault.example.org")) && k.buttons.includes("Allow for this note") && k.buttons.includes("Allow for this vault") && k.buttons.includes("Not now"), `buttons: ${JSON.stringify(k.buttons)}`);
      c.ok(k.hint && /https is assumed/.test(k.hint), `it says https is assumed: ${k.hint}`);
      c.ok(k.focus === "Not now" && k.focusIn, `the default focus is Not now: focus is on ${JSON.stringify(k.focus)}, inside the card: ${k.focusIn} (the card was opened as the note opened; Obsidian gives the pane focus just after, which takes it from the card)`);
      // the keyboard works once focus is in the card: put it on Not now by hand
      await o.evaluate(() => [...document.querySelectorAll(".booklet-allow-card button")].find(b => b.textContent === "Not now").focus());
      await o.page.keyboard.press("Escape");
      c.ok(await closed(o), "Escape closes it (with focus in it)");
      c.ok(ctx.data() === null || same(dataOf(ctx), { allowedMediaHosts: [ctx.host("vault.example.org")], noteAllows: { "Declares for the note.booklet.md": [ctx.host("note.example.org")] } }), "Not now allowed nothing: data.json is as it was");
      c.ok(bytes(ctx.file("Declares new.booklet.md")).equals(before), "and the note's bytes are unchanged");
      await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
      await ctx.K.open(o, "Declares new.booklet.md"); await sleep(1500);
      c.ok(!(await cardNow()), `opened again in the same session after Not now it does not ask again (the plugin keeps the answer until the app is started again)`);
    });
    // ---- a press, the scopes, the lists, the write-in, the settings page, the keys ----
    await withMedia("c50-scopes", {
      note: NOTE50,
      files: ctx => ({
        [NOTE50]: note50(ctx, "scopes", [["once one", "media.example.org"], ["note one", "note.example.org"], ["vault one", "vault.example.org"]]) + `\nYouTube: ![yt sub](https://m.youtube.com/watch?v=ABCDEFGHIJK)\n\nLook-alike: ![evil one](https://youtube.com.example.net:${ctx.port}/tone-2s.wav)\n`,
        [OTHER50]: note50(ctx, "other", [["note one", "note.example.org"], ["vault one", "vault.example.org"]]),
      }),
    }, async (o, ctx) => {
      const H = ctx.host.bind(ctx), noteBytes = bytes(ctx.file(NOTE50)), otherBytes = bytes(ctx.file(OTHER50));
      await ctx.K.open(o, NOTE50);
      c.ok(ctx.data() === null, "data.json does not exist before anything is allowed");
      const dataWas = ctx.data();
      // a press asks first
      await play50(o, "once one").click();
      await poll(() => cardOf(o), 3000); await sleep(400);
      let k = await cardOf(o);
      c.info("the card on a press: " + JSON.stringify(k));
      c.ok(k && k.title === `Allow media from ${H("media.example.org")}?`, `a press on media from a site not allowed opens the card: ${k && k.title}`);
      c.ok(k && same(k.buttons.slice(0, 4), ["Allow once", "Allow for this note", "Allow for this vault", "Not now"]), `the four choices, in this order: ${k && JSON.stringify(k.buttons.slice(0, 4))}`);
      c.ok(k && k.intro[0] === `${H("media.example.org")} will see when you play and from where.`, `the cost is said first: ${k && k.intro[0]}`);
      c.ok(k && same(k.said.slice(0, 3), ["Plays this piece only. Nothing is kept.", `Kept in this plugin's data for this note: ${H("media.example.org")} and its subdomains.`, `Kept in this plugin's data for every note in this vault: ${H("media.example.org")} and its subdomains.`]), `each choice says what it costs and where it is kept: ${k && JSON.stringify(k.said.slice(0, 3))}`);
      c.ok(k && k.focus === "Not now" && k.focusIn, `default focus is Not now: ${k && k.focus}`);
      c.ok(k && /https is assumed/.test(k.hint) && /\*\.youtube\.com/.test(k.hint), `the write-in says https is assumed and what youtube.com covers: ${k && k.hint}`);
      ctx.server.mark("m1");
      await cardBtn(o, /^Not now$/).click();
      await closed(o); await sleep(500);
      c.ok(ctx.hits("media.example.org", "m1").length === 0 && ctx.data() === dataWas, "Not now: nothing requested, nothing kept");
      c.ok(await o.evaluate(sel => document.activeElement && document.activeElement.classList.contains("booklet-media-play"), BOOK), "and focus goes back to the Play button that asked");
      // once
      await play50(o, "once one").click(); await poll(() => cardOf(o), 3000);
      await cardBtn(o, /^Allow once$/).click();
      const once = await poll(() => ctx.hits("media.example.org", "m1").length > 0, 5000);
      await sleep(600);
      c.ok(once, `Allow once plays the piece: ${JSON.stringify(ctx.hits("media.example.org", "m1").map(e => e.method + " " + e.url + " " + e.status))}`);
      c.ok(ctx.data() === dataWas && bytes(ctx.file(NOTE50)).equals(noteBytes), "and keeps nothing: data.json is as it was (does not exist) and the note's bytes are unchanged");
      c.info(`the slot after Allow once: ${await slotState(o, "once one")}`);
      await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
      await ctx.K.open(o, NOTE50);
      c.ok((await slotState(o, "once one")) === "blocked", `drawn again, the piece asks again: once was kept nowhere (state ${await slotState(o, "once one")})`);
      // this note
      await play50(o, "note one").click(); await poll(() => cardOf(o), 3000);
      await cardBtn(o, /^Allow for this note$/).click();
      await closed(o);
      const wrote1 = await poll(() => { const d = dataOf(ctx); return d && d.noteAllows && d.noteAllows[NOTE50]; }, 5000);
      c.ok(same(dataOf(ctx), { allowedMediaHosts: [], noteAllows: { [NOTE50]: [H("note.example.org")] } }), `Allow for this note: data.json is exactly ${JSON.stringify(dataOf(ctx))}`);
      c.ok(bytes(ctx.file(NOTE50)).equals(noteBytes), "and nothing is written into the note (its bytes are unchanged)");
      await quiet(o);
      c.ok((await slotState(o, "note one")) === "ready", `the slot is ready now (${await slotState(o, "note one")}); a press plays it with no card`);
      ctx.server.mark("m2");
      await play50(o, "note one").click(); await sleep(1200);
      c.ok(ctx.hits("note.example.org", "m2").length > 0 && !(await cardOf(o)), `and it requests the file with no card: ${JSON.stringify(ctx.hits("note.example.org", "m2").map(e => e.method + " " + e.url))}`);
      await ctx.K.open(o, OTHER50);
      c.ok((await slotState(o, "note one")) === "blocked", `another note holding the same address still asks (this note's scope is this note's): ${await slotState(o, "note one")}`);
      // this vault, from that other note: a host the first note declared nowhere
      await play50(o, "vault one").click(); await poll(() => cardOf(o), 3000);
      await cardBtn(o, /^Allow for this vault$/).click();
      await closed(o);
      await poll(() => { const d = dataOf(ctx); return d && d.allowedMediaHosts && d.allowedMediaHosts.length; }, 5000);
      c.ok(same(dataOf(ctx), { allowedMediaHosts: [H("vault.example.org")], noteAllows: { [NOTE50]: [H("note.example.org")] } }), `Allow for this vault: data.json is exactly ${JSON.stringify(dataOf(ctx))}`);
      c.ok(bytes(ctx.file(OTHER50)).equals(otherBytes), "the other note's bytes are unchanged");
      await quiet(o);
      c.ok((await slotState(o, "vault one")) === "ready", `its slot is ready (${await slotState(o, "vault one")})`);
      await ctx.K.open(o, NOTE50);
      c.ok((await slotState(o, "vault one")) === "ready", `and in the first note, which never declared the host, the same host is ready: ${await slotState(o, "vault one")}`);
      // the Allow list button, the lists, a box
      await o.page.locator(BOOK + " .booklet-allow-btn").click();
      await poll(() => cardOf(o), 3000); await sleep(300);
      k = await cardOf(o);
      c.info("the card from the button: " + JSON.stringify(k));
      c.ok(k && k.title === "Allowed media sites" && k.buttons.includes("Close") && !k.buttons.includes("Not now"), `the Allow list button opens the card of lists: ${k && k.title}`);
      c.ok(k && same(k.vault.map(x => [x.host, x.on]), [[H("vault.example.org"), true]]) && same(k.note.map(x => [x.host, x.on]), [[H("note.example.org"), true]]), `it lists the vault's site and this note's site, each ticked: vault ${JSON.stringify(k && k.vault)}, note ${JSON.stringify(k && k.note)}`);
      await o.page.locator(".booklet-allow-card .booklet-allow-section:nth-child(1) input[type=checkbox]").first().uncheck();
      const gone = await poll(() => { const d = dataOf(ctx); return d && d.allowedMediaHosts.length === 0; }, 3000);
      c.ok(gone, `unticking the vault site takes it off at once: data.json ${JSON.stringify(dataOf(ctx))}`);
      await sleep(600);
      c.ok((await slotState(o, "vault one")) === "blocked", `and the note behind the card draws it as not allowed (${await slotState(o, "vault one")})`);
      await o.page.locator(".booklet-allow-card .booklet-allow-section:nth-child(1) input[type=checkbox]").first().check();
      c.ok(await poll(() => { const d = dataOf(ctx); return d && d.allowedMediaHosts.length === 1; }, 3000), "ticking it again allows it again (a slip is one tick to undo)");
      // the blank
      const blank = o.page.locator(".booklet-allow-card .booklet-allow-add input[type=text]");
      const tryEntry = async text => { await blank.fill(text); await blank.press("Enter"); await sleep(250); return (await cardOf(o)).error; };
      c.ok((await tryEntry("https://x.example.org/path")) === "Give the site alone, without a path, like youtube.com.", "a site with a path is refused, in words");
      c.ok((await tryEntry("*.youtube.com")) === "No wildcards: youtube.com already covers its subdomains.", "a wildcard is refused, in words");
      c.ok((await tryEntry("http://youtube.com")) === "Only https sites can be allowed.", "an http address is refused, in words");
      c.ok((await tryEntry("localhost")) === "Add the ending too, like youtube.com.", "a name with no ending is refused, in words");
      c.ok(same(dataOf(ctx), { allowedMediaHosts: [H("vault.example.org")], noteAllows: { [NOTE50]: [H("note.example.org")] } }), "and none of them was kept");
      c.ok((await slotState(o, "yt sub")) === "blocked", `before the write-in a YouTube link (m.youtube.com) is not allowed: ${await slotState(o, "yt sub")}`);
      await blank.fill("https://YouTube.com/");
      await cardBtn(o, /^Add for every note$/).click();
      c.ok(await poll(() => { const d = dataOf(ctx); return d && d.allowedMediaHosts.includes("youtube.com"); }, 3000), `the write-in takes https://YouTube.com/ and keeps youtube.com (which stands for https://*.youtube.com/*): ${JSON.stringify(dataOf(ctx))}`);
      await sleep(600);
      k = await cardOf(o);
      c.ok(k && k.vault.some(x => x.host === "youtube.com" && /also covers youtu\.be and youtube-nocookie\.com, which its player uses/.test(x.more)), `the list says what the site also covers: ${k && JSON.stringify(k.vault.find(x => x.host === "youtube.com"))}`);
      c.ok((await slotState(o, "yt sub")) === "ready", `the subdomain link (m.youtube.com) is allowed by youtube.com: ${await slotState(o, "yt sub")}`);
      c.ok((await slotState(o, "evil one")) === "blocked", `and youtube.com.example.net is not (a look-alike is not a subdomain): ${await slotState(o, "evil one")}`);
      await blank.fill("note.example.net"); await blank.press("Enter");
      c.ok(await poll(() => { const d = dataOf(ctx); return d && (d.noteAllows[NOTE50] || []).includes("note.example.net"); }, 3000), "Enter in the blank adds for this note, the narrower scope");
      // the settings page: the same list, and the suggested services
      await o.page.keyboard.press("Escape");
      await o.evaluate(() => { const b = [...document.querySelectorAll(".booklet-allow-card button")].find(x => x.textContent === "Close"); if (b) b.click(); });
      await closed(o);
      // Obsidian 1.14 draws its settings in a window of its own (a page of its own to the driver): found by what it holds
      const settingsPage = async () => { for (const p of o.page.context().pages()) if (await p.evaluate(() => !!document.querySelector(".vertical-tab-content")).catch(() => false)) return p; return null; };
      const settings = async () => { const sp = await settingsPage(); return sp && sp.evaluate(() => { const t = document.querySelector(".vertical-tab-content"); return { names: [...t.querySelectorAll(".setting-item-name")].map(x => x.textContent.trim()), buttons: [...t.querySelectorAll("button")].map(b => (b.getAttribute("aria-label") || b.textContent).trim()), desc: [...t.querySelectorAll(".setting-item-description")].map(x => x.textContent.trim()).filter(Boolean).join(" | ") }; }); };
      await o.evaluate(async () => { await app.setting.open(); await app.setting.openTabById("booklet"); });
      await sleep(800);
      const sp = await settingsPage();
      let st = await settings();
      c.info("the settings page: " + JSON.stringify(st));
      c.ok(st && st.names.includes("Media from other sites") && st.names.includes(H("vault.example.org")) && st.names.includes("youtube.com") && !st.names.includes(H("note.example.org")), `the settings page lists the vault's sites (what the card wrote) and not the note's: ${st && JSON.stringify(st.names)}`);
      c.ok(st && st.buttons.includes("Add suggested services") && st.buttons.includes("Remove youtube.com"), `it has the Add suggested services button and a Remove for each site: ${st && JSON.stringify(st.buttons)}`);
      await sp.locator(".vertical-tab-content button", { hasText: /^Add suggested services$/ }).click();
      await sleep(500);
      let d = dataOf(ctx);
      c.ok(same(d.allowedMediaHosts, [H("vault.example.org"), "youtube.com", "vimeo.com", "spotify.com", "soundcloud.com"]), `Add suggested services adds the four to the list and repeats nothing: ${JSON.stringify(d.allowedMediaHosts)}`);
      await sp.locator(".vertical-tab-content button", { hasText: /^Add suggested services$/ }).click(); await sleep(400);
      c.ok(same(dataOf(ctx).allowedMediaHosts, d.allowedMediaHosts), "pressed again it adds nothing");
      await sp.locator(".vertical-tab-content button[aria-label='Remove vimeo.com']").click(); await sleep(400);
      c.ok(!dataOf(ctx).allowedMediaHosts.includes("vimeo.com"), "Remove on the settings page takes a site off");
      const field = sp.locator(".vertical-tab-content input[aria-label='Site to allow']");
      await field.fill("media.example.org:" + ctx.port); await field.press("Enter"); await sleep(400);
      c.ok(dataOf(ctx).allowedMediaHosts.includes(H("media.example.org")), "and Add writes one (Enter in its field too)");
      await o.evaluate(() => app.setting.close()); await sleep(300);
      // what the settings page wrote shows in the card
      await o.page.locator(BOOK + " .booklet-allow-btn").click(); await poll(() => cardOf(o), 3000);
      k = await cardOf(o);
      c.ok(k && same(k.vault.map(x => x.host).sort(), dataOf(ctx).allowedMediaHosts.slice().sort()), `the card shows what the settings page wrote: ${k && JSON.stringify(k.vault.map(x => x.host))}`);
      // the keys: Tab stays in the card, Shift+Tab wraps, Space ticks, Escape closes and focus goes back
      const stops = [];
      const index = () => o.evaluate(() => { const c = document.querySelector(".booklet-allow-card"), all = [...c.querySelectorAll("button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")], a = document.activeElement; return c.contains(a) ? all.indexOf(a) : -1; });
      const total = await o.evaluate(() => document.querySelectorAll(".booklet-allow-card button:not([disabled]), .booklet-allow-card input:not([disabled]), .booklet-allow-card a[href], .booklet-allow-card [tabindex]:not([tabindex='-1'])").length);
      await o.evaluate(() => document.querySelector(".booklet-allow-card .modal-title").focus());
      for (let i = 0; i < total * 2 + 3; i++) { await o.page.keyboard.press("Tab"); stops.push(await index()); }
      c.ok(stops.every(x => x >= 0) && new Set(stops).size === total, `Tab goes round inside the card: ${stops.length} presses, none left it, and it came to every one of its ${total} controls (${new Set(stops).size}); the order ${stops.slice(0, total + 1).join(",")}`);
      c.ok(stops[total] === stops[0] && stops[total - 1] === total - 1 && stops[total] === 0, `the last control is followed by the first (the order wraps): ${stops[total - 1]} then ${stops[total]}`);
      await o.page.keyboard.press("Shift+Tab");
      await o.page.keyboard.press("Shift+Tab");
      c.ok(await o.evaluate(() => !!document.activeElement.closest(".booklet-allow-card")), "and Shift+Tab does not leave it");
      const box = o.page.locator(".booklet-allow-card .booklet-allow-section:nth-child(1) input[type=checkbox]").first();
      await box.focus(); await o.page.keyboard.press("Space");
      c.ok(await poll(() => { const d2 = dataOf(ctx); return d2.allowedMediaHosts[0] !== H("vault.example.org") || d2.allowedMediaHosts.length < d.allowedMediaHosts.length + 1; }, 2000), `Space on a box takes the site off (data.json now ${JSON.stringify(dataOf(ctx).allowedMediaHosts)})`);
      await o.page.keyboard.press("Escape");
      c.ok(await closed(o), "Escape closes the card");
      c.ok(await o.evaluate(sel => document.activeElement && document.activeElement.classList.contains("booklet-allow-btn"), BOOK), "and focus goes back to the Allow list button that opened it");
      // the button by keyboard
      await o.evaluate(sel => document.querySelector(sel + " .booklet-allow-btn").focus(), BOOK);
      await o.page.keyboard.press("Enter");
      c.ok(!!(await poll(() => cardOf(o), 3000)), "Enter on the focused Allow list button opens the card");
      await o.page.keyboard.press("Escape"); await closed(o);
      const fin = dataOf(ctx);
      c.ok(Object.keys(fin).sort().join() === "allowedMediaHosts,noteAllows" && bytes(ctx.file(NOTE50)).equals(noteBytes) && bytes(ctx.file(OTHER50)).equals(otherBytes), `through all of it: data.json has the two keys allowedMediaHosts and noteAllows and nothing else, and both notes' bytes are as they were`);
    });
    return c;
  }

  /* ================= CHECK 51 ================= */
  // `listen`: tone files of 2, 10 and 60 seconds, local, and one hosted (an allowed host). Every answer is read from the file on disk.
  const NOTE51 = "Listen.booklet.md";
  const note51 = ctx => front("listen", "Listen") + `> [!activity|a] Listening

> [!listen|e1] Short, two seconds
> ![[tone-2s.wav]]

> [!listen|e2 left:4] Ten seconds, within four of the end counts
> ![[tone-10s.wav]]

> [!listen|e3] Sixty seconds
> ![[tone-60s.wav]]

> [!listen|e4] Hosted, ten seconds
> ![hosted](${ctx.url("vault.example.org", "tone-10s.wav")})
`;
  async function check51() {
    const c = new Check(51, "0.12.0 `listen` in the real app: the tick and untick write; a tone played to its end sets done and takes pos out; a pause past half and within left: sets done; an early pause writes pos in whole seconds without done; resume at pos; an incoming change while playing never moves it; a position is kept on the device while playing and not in the note; kill the app mid-episode and the next start adds it");
    await withMedia("c51", { note: NOTE51, data: ctx => ({ allowedMediaHosts: [ctx.host("vault.example.org")], noteAllows: {} }), files: ctx => ({ [NOTE51]: note51(ctx) }) }, async (o, ctx) => {
      const file = ctx.file(NOTE51);
      const ans = () => { try { return answersIn(fs.readFileSync(file, "utf8"))[""] || {}; } catch (e) { return {}; } };
      const waitAns = (id, pred, ms = 6000) => poll(() => { try { return !!pred(ans()[id]); } catch (e) { return false; } }, ms, 80);
      const box = id => `${BOOK} [data-booklet-listen='/${id}']`;
      const tick = id => o.page.locator(box(id) + " .booklet-listen-tick");
      const el = (id, fn, arg) => o.evaluate(([sel, id, src, arg]) => { const a = document.querySelector(`${sel} [data-booklet-listen='/${id}'] audio`); return a ? new Function("a", "arg", "return (" + src + ")(a, arg)")(a, arg) : null; }, [BOOK, id, fn.toString(), arg]);
      const state = id => el(id, a => ({ t: a.currentTime, paused: a.paused, ended: a.ended, dur: a.duration, rs: a.readyState }));
      const where = id => o.evaluate(([sel, id]) => document.querySelector(`${sel} [data-booklet-listen='/${id}'] .booklet-listen-where`).textContent, [BOOK, id]);
      const store = () => o.evaluate(() => app.loadLocalStorage("booklet-listen:Listen.booklet.md"));
      await ctx.K.open(o, NOTE51);
      const orig = fs.readFileSync(file, "utf8");

      // 1. the tick
      await tick("e1").click();
      c.ok(await waitAns("e1", v => v && v.done === true), `a press on Done writes the answer: ${JSON.stringify(ans().e1)}`);
      c.ok((await tick("e1").getAttribute("aria-pressed")) === "true", "and the button says it is pressed");
      await tick("e1").click();
      c.ok(await waitAns("e1", v => v === undefined), `a second press takes it away again, leaving no mark: ${JSON.stringify(ans())}`);
      c.ok(fs.readFileSync(file, "utf8").startsWith(orig.replace(/\s+$/, "")), "and the note above the records is as it was, byte for byte");

      // 2. the end of the tone: done, and no pos
      await el("e1", a => a.play());
      c.ok(await poll(async () => (await state("e1")).ended, 6000), "the two-second tone played to its end");
      c.ok(await waitAns("e1", v => v && v.done === true && !("pos" in v)), `the end sets done and writes no pos: ${JSON.stringify(ans().e1)}`);
      await sleep(300);
      c.ok((await where("e1")) === "" && (await tick("e1").getAttribute("aria-pressed")) === "true", `the box shows it done and says no place: ${JSON.stringify(await where("e1"))}`);

      // 3. a pause past half and within left: of the end (ten seconds, left: 4: done from the sixth second)
      await el("e2", a => a.play());
      await sleep(1500);
      const st3 = await store();
      c.ok(!ans().e2, `while it plays nothing is written to the note: ${JSON.stringify(ans().e2)}`);
      c.ok(st3 && st3["/e2"] && Number.isInteger(st3["/e2"].pos) && st3["/e2"].pos >= 1 && st3["/e2"].pos <= 2, `the position is kept on the device, each whole second: ${JSON.stringify(st3)}`);
      await poll(async () => (await state("e2")).t >= 6.3, 8000, 100);
      const t3 = (await state("e2")).t;
      await el("e2", a => a.pause());
      c.ok(await waitAns("e2", v => v && v.done === true), `paused at ${t3.toFixed(2)} s of 10 (within 4 of the end, past half): done, and the position: ${JSON.stringify(ans().e2)}`);
      c.ok(Number.isInteger(ans().e2 && ans().e2.pos) && ans().e2.pos === Math.floor(t3), `pos is whole seconds: ${ans().e2 && ans().e2.pos} for ${t3.toFixed(2)}`);
      c.ok(await poll(async () => { const s = await store(); return !s || !s["/e2"]; }, 3000), `and the device's copy is taken out once the note holds it: ${JSON.stringify(await store())}`);

      // 4. an early pause on the sixty-second tone
      await el("e3", a => a.play());
      await poll(async () => (await state("e3")).t >= 2.3, 6000, 100);
      const t4 = (await state("e3")).t;
      await el("e3", a => a.pause());
      c.ok(await waitAns("e3", v => v && Number.isInteger(v.pos)), `an early pause writes pos: ${JSON.stringify(ans().e3)}`);
      const e3 = ans().e3;
      c.ok(e3.pos === Math.floor(t4) && e3.done !== true, `in whole seconds (${e3.pos} for ${t4.toFixed(2)}) and not done`);
      await sleep(300);
      c.ok((await where("e3")) === `Left off at 0:0${e3.pos}`, `the box says where she left off: ${JSON.stringify(await where("e3"))}`);

      // 5. resume at pos: the note is closed and opened again, and the tone starts where she left off
      await o.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
      await ctx.K.open(o, NOTE51);
      c.ok((await where("e3")) === `Left off at 0:0${e3.pos}`, `opened again, the box still says ${JSON.stringify(await where("e3"))}`);
      await el("e3", a => a.play());
      await sleep(900);
      const s5 = await state("e3");
      c.ok(s5.t >= e3.pos && s5.t < e3.pos + 2.2 && !s5.paused, `it resumes at the place: pos ${e3.pos}, the clock reads ${s5.t.toFixed(2)} s 0.9 s after Play`);

      // 6. a change from elsewhere while it plays moves nothing
      await el("e3", a => { a.dataset.mark = "mine"; window.__seeks = []; a.addEventListener("seeking", () => window.__seeks.push(a.currentTime)); return 1; });
      const before6 = (await state("e3")).t;
      const text6 = fs.readFileSync(file, "utf8");
      fs.writeFileSync(file, text6.replace(/("e3": \{\s*"pos": )\d+/, (m, a) => a + "40"));
      await sleep(2600);
      const after6 = await o.evaluate(([sel]) => { const a = document.querySelector(`${sel} [data-booklet-listen='/e3'] audio`); return { mark: a.dataset.mark, t: a.currentTime, paused: a.paused, seeks: window.__seeks.length, connected: a.isConnected }; }, [BOOK]);
      c.ok(after6.mark === "mine" && after6.connected, `the element that plays is the one it was (it was not drawn again under her): ${JSON.stringify(after6)}`);
      c.ok(!after6.paused && after6.seeks === 0 && after6.t > before6 + 1.5 && after6.t < before6 + 4, `an outside change to pos (to 40) while it plays: no seek, and the clock ran on from ${before6.toFixed(2)} to ${after6.t.toFixed(2)} s`);
      await el("e3", a => a.pause());
      c.ok(await waitAns("e3", v => v && v.pos === Math.floor(after6.t) || (v && v.pos > e3.pos && v.pos < 12)), `when she stops, her own place is what is kept (not the 40 from outside): ${JSON.stringify(ans().e3)}`);
      const e3b = ans().e3;

      // 7. a hosted file: the slot's player, followed the same way
      await o.page.locator(box("e4") + " .booklet-media-play").click();
      await poll(async () => { const s = await o.evaluate(([sel]) => { const a = document.querySelector(`${sel} [data-booklet-listen='/e4'] audio`); return a && !a.paused && a.currentTime > 1.2 ? a.currentTime : 0; }, [BOOK]); return s; }, 6000, 100);
      const t7 = await o.evaluate(([sel]) => { const a = document.querySelector(`${sel} [data-booklet-listen='/e4'] audio`); a.pause(); return a.currentTime; }, [BOOK]);
      c.ok(await waitAns("e4", v => v && Number.isInteger(v.pos)), `a hosted file is followed the same way: paused at ${t7.toFixed(2)} s writes ${JSON.stringify(ans().e4)}`);

      // 8. the kill. The browser keeps a changed local-storage value some seconds after the change, and the first launch on a new profile has
      // not kept any (measured: nothing survived a kill 3, 9 or 29 s into playing on it), so the app is killed once to make the profile
      // one that has lived, and the kill that is checked is the second.
      await ctx.kill(o);
      const o2 = await ctx.relaunch("c51-restart");
      let o3 = null;
      try {
        await ctx.K.open(o2, NOTE51);
        const baseNow = ans().e3, baseJson = JSON.stringify(baseNow);
        await o2.evaluate(([sel]) => document.querySelector(`${sel} [data-booklet-listen='/e3'] audio`).play(), [BOOK]);
        await sleep(9500);
        const probe = await o2.evaluate(([sel]) => ({ t: document.querySelector(`${sel} [data-booklet-listen='/e3'] audio`).currentTime, kept: (app.loadLocalStorage("booklet-listen:Listen.booklet.md") || {})["/e3"] }), [BOOK]);
        c.info(`killed mid-episode: the clock reads ${probe.t.toFixed(2)} s, the device store holds ${JSON.stringify(probe.kept)}, the note holds ${baseJson}`);
        await ctx.kill(o2);
        c.ok(JSON.stringify(ans().e3) === baseJson, `the process was killed (SIGKILL) while the episode played, and the note still holds what it held: nothing was written while it played: ${JSON.stringify(ans().e3)}`);
        o3 = await ctx.relaunch("c51-restart-again");
        await ctx.K.open(o3, NOTE51);
        const back = await poll(() => { const v = ans().e3; return v && v.pos !== baseNow.pos ? v : null; }, 8000, 100);
        c.ok(!!back && back.done === false && back.pos > baseNow.pos && back.pos <= probe.kept.pos && back.pos >= probe.kept.pos - 6, `the next start adds the position the device kept to the note: it held pos ${baseNow.pos}, the device last wrote ${probe.kept && probe.kept.pos}, now it holds ${JSON.stringify(back)} (the browser had kept a value ${back ? probe.kept.pos - back.pos : "?"} s old)`);
        await sleep(500);
        const w = await o3.evaluate(([sel]) => document.querySelector(`${sel} [data-booklet-listen='/e3'] .booklet-listen-where`).textContent, [BOOK]);
        c.ok(back && w === `Left off at 0:${String(back.pos).padStart(2, "0")}`, `and the box says where she left off: ${JSON.stringify(w)}`);
        c.ok(await poll(() => o3.evaluate(() => { const st = app.loadLocalStorage("booklet-listen:Listen.booklet.md"); return !st || !st["/e3"]; }), 3000), "and the device's copy is taken out");
        // the other end of it: the note was changed by another device since the session began, so the note wins and the device's copy goes
        await o3.evaluate(() => app.saveLocalStorage("booklet-listen:Listen.booklet.md", { "/e3": { pos: 30, base: 1 } }));
        await o3.evaluate(() => { for (const l of app.workspace.getLeavesOfType("booklet")) l.detach(); });
        const noteNow = JSON.stringify(ans().e3);
        await ctx.K.open(o3, NOTE51); await sleep(1200);
        c.ok(JSON.stringify(ans().e3) === noteNow && (await o3.evaluate(() => { const st = app.loadLocalStorage("booklet-listen:Listen.booklet.md"); return !st || !st["/e3"]; })), `a device copy whose base is not what the note holds (another device wrote since) is dropped and the note wins: ${JSON.stringify(ans().e3)}`);
      } finally { await o2.close().catch(() => {}); if (o3) await o3.close().catch(() => {}); }
    });
    return c;
  }

  /* ================= CHECK 52 ================= */
  // Continue: three activities in two modules; the second question is skipped and the reader goes on
  const NOTE52 = "Course.booklet.md";
  const q52 = (id, t) => `> [!choice|${id}] ${t}\n- [ ] Yes\n- [ ] No\n\n`;
  const note52 = front("course", "A course") + `> [!module|m1] Module one

> [!activity|a1] First activity

${q52("q1", "Question one")}${q52("q2", "Question two")}> [!activity|a2] Second activity

${q52("q3", "Question three")}${q52("q4", "Question four")}> [!module|m1 end] End of module one

> [!module|m2] Module two

> [!activity|a3] Third activity

${q52("q5", "Question five")}> [!module|m2 end] End of module two
`;
  async function check52() {
    const c = new Check(52, "0.12.0 Continue: it names the first question after her place (\"Continue: Question three\"), a question she skipped and read past is never offered again, it puts focus on the prompt it opened, and it is gone when nothing is left");
    await withMedia("c52", { note: NOTE52, files: () => ({ [NOTE52]: note52 }) }, async (o, ctx) => {
      const view = () => o.evaluate(sel => {
        const page = document.querySelector(sel + " .booklet-page"), b = page && page.querySelector(".booklet-continue-button"), holder = page && page.querySelector(".booklet-continue"), a = document.activeElement;
        return { screen: page && page.getAttribute("data-booklet-screen"), label: b ? b.textContent : null, holder: !!holder, holderEmpty: holder ? holder.childElementCount === 0 : null, focus: a && a.closest(sel) ? { text: a.textContent.trim().slice(0, 40), cls: a.className.toString().slice(0, 40), tab: a.tabIndex } : null };
      }, BOOK);
      const press = text => o.page.locator(BOOK + " .booklet-page button", { hasText: text }).first().click({ timeout: 5000 });
      const yes = id => o.page.locator(`${BOOK} [data-booklet-q='${id}'] button.booklet-choice`, { hasText: "Yes" }).click({ timeout: 5000 });
      const wait = async (pred, what) => { const ok = await poll(async () => pred(await view()), 5000, 80); await quiet(o); return ok; };
      await ctx.K.open(o, NOTE52);
      let v = await view();
      c.ok(v.screen === "home" && v.label === "Continue: Question one", `the overview of a booklet with nothing answered: ${JSON.stringify([v.screen, v.label])}`);
      await press("Continue: Question one");
      await wait(x => x.screen === "activity:m1/a1");
      v = await view();
      c.ok(v.screen === "activity:m1/a1" && v.focus && v.focus.text === "Question one" && v.focus.tab === -1, `Continue opens the first question's page and puts focus on its prompt (a heading-like block named by its words): ${JSON.stringify(v.focus)}`);
      await yes("q1");
      await quiet(o);
      // skip question two and read on
      await press("Next: 2. Second activity");
      await wait(x => x.screen === "activity:m1/a2");
      await press("Back to the overview");
      await wait(x => x.screen === "home");
      v = await view();
      c.ok(v.label === "Continue: Question three", `question one answered, question two skipped, the reader has read on to the next activity and is back at the overview: Continue names ${JSON.stringify(v.label)}, not the question she skipped`);
      // a module's own screen says the same
      await ctx.K.goTo(o, "module:m1");
      v = await view();
      c.ok(v.screen === "module:m1" && v.label === "Continue: Question three", `a module's screen has it too: ${JSON.stringify([v.screen, v.label])}`);
      await ctx.K.goTo(o, "home");
      await press("Continue: Question three");
      await wait(x => x.screen === "activity:m1/a2");
      v = await view();
      c.ok(v.focus && v.focus.text === "Question three" && v.focus.tab === -1, `pressed, it goes to question three and focus is on its prompt: ${JSON.stringify(v.focus)}`);
      const place = await o.evaluate(() => app.loadLocalStorage("booklet-place:Course.booklet.md"));
      c.ok(place === 1, `her place is kept on the device as the furthest page reached (the second page, index 1): ${JSON.stringify(place)}`);
      await yes("q3"); await yes("q4");
      await quiet(o);
      await press("Back to the overview");
      await wait(x => x.screen === "home");
      v = await view();
      c.ok(v.label === "Continue: Question five", `with three and four answered, the next question is the one in the second module: ${JSON.stringify(v.label)}`);
      await press("Continue: Question five");
      await wait(x => x.screen === "activity:m2/a3");
      await yes("q5"); await quiet(o);
      await press("Back to the overview");
      await wait(x => x.screen === "home");
      v = await view();
      c.ok(v.label === null && v.holder && v.holderEmpty, `nothing is left after her place, though question two never was answered: the Continue button is not drawn (${JSON.stringify([v.label, v.holder, v.holderEmpty])})`);
      const got = answersByModule(fs.readFileSync(ctx.file(NOTE52), "utf8"));
      c.ok(same(Object.keys(got.m1 || {}), ["q1", "q3", "q4"]) && same(Object.keys(got.m2 || {}), ["q5"]), `the records hold exactly what she answered, question two nowhere: ${JSON.stringify(got)}`);
    });
    return c;
  }

  return { 48: check48, 49: check49, 50: check50, 51: check51, 52: check52 };
};
