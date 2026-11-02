/*
 * Media in the Booklet view: the slots the gate left tokens for (core/gate.ts), the players a press brings up, the host shown after a
 * link whose words are not its address, and the rule that no audio or video in the view loads before it is pressed. Nothing here has
 * a media `src` until a press the reader made (`isPress`: a trusted event). Pressing Play on media from a site not allowed asks first,
 * through the allow card; "once" plays that one piece and keeps nothing.
 */
import type { Component } from "obsidian";
import { SLOT_CLOSE, SLOT_OPEN, type MediaSlot } from "./core";

type Playable = Extract<MediaSlot, { type: "media" | "service" }>;

/** What a slot asks of the view it is in. */
export interface MediaDeps {
	/** Is this event a press the reader made? Only a trusted event is: a script cannot start a request by clicking a button. */
	isPress(evt: Event): boolean;
	/** The media is not allowed yet: ask. `once` plays this piece only (given the press that chose it); `opener` is the button to give focus back to. */
	ask(req: { slot: Playable; opener: HTMLElement; once: (evt: Event) => void }): void;
	/** Should a player be left playing when its drawing goes (a page turn)? Asked of each native player as the drawing is torn down; a player kept is the keeper's to stop. */
	keepAlive?: (player: HTMLMediaElement, slot: Playable) => boolean;
}

/** The event that counts as a press. */
export const isTrustedPress = (evt: Event): boolean => evt.isTrusted;

const TOKEN = new RegExp(`${SLOT_OPEN}(\\d+)${SLOT_CLOSE}`, "g");
const FAILED = "This could not be played. The file may be missing, the format may not be supported here, or you may be offline.";
let uid = 0;

/** An address as `new URL` writes it, for a link or a `src`. */
const hrefOf = (addr: string): string => {
	try {
		return new URL(addr).href;
	} catch {
		return "";
	}
};

/**
 * The player for a slot's file: a native `audio` or `video`, nothing loaded until it is asked to (`preload="metadata"` reads its
 * length only once it has a `src`, which it has from here). Made in one place so that a keeper can take it and move it; the caller
 * puts it in the page and plays it.
 */
export function createPlayer(doc: Document, slot: Playable): HTMLAudioElement | HTMLVideoElement {
	const el = doc.createElement(slot.media);
	el.controls = true;
	el.setAttribute("preload", "metadata");
	if (slot.media === "video") el.setAttribute("playsinline", "");
	el.setAttribute("data-booklet-player", slot.media);
	el.setAttribute("aria-label", slot.alt || (slot.media === "audio" ? "Audio" : "Video"));
	el.src = hrefOf(slot.addr);
	return el;
}

/** The framed player of a service: a sandboxed frame on the service's own embed address, with only what that player needs. */
function createFrame(doc: Document, slot: Extract<MediaSlot, { type: "service" }>): HTMLIFrameElement {
	const f = doc.createElement("iframe");
	f.className = `booklet-media-frame is-${slot.media}`;
	f.setAttribute("data-booklet-player", "frame");
	f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
	f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
	f.setAttribute("allow", slot.allow);
	if (slot.media === "video") f.setAttribute("allowfullscreen", "");
	f.title = slot.alt ? `${slot.name}: ${slot.alt}` : slot.name;
	f.src = hrefOf(slot.embedUrl);
	return f;
}

function externalLink(into: HTMLElement, addr: string, text: string): HTMLElement {
	return into.createEl("a", { cls: "external-link", text, attr: { href: hrefOf(addr), target: "_blank", rel: "noopener noreferrer" } });
}

/** The host a slot's file or player is asked for it: the frame's own for a service. */
export function playerHost(slot: Playable): string {
	if (slot.type === "media") return slot.host;
	try {
		return new URL(slot.embedUrl).host;
	} catch {
		return slot.host;
	}
}

function playSlot(doc: Document, slot: Playable, deps: MediaDeps, owner: Component): HTMLElement {
	const box = doc.createElement("div");
	box.className = "booklet-media-slot";
	box.setAttribute("data-booklet-media", slot.media);
	box.setAttribute("data-state", slot.allowed ? "ready" : "blocked");
	const row = box.createDiv({ cls: "booklet-media-row" });
	const hostId = `booklet-media-host-${++uid}`;
	const label = slot.media === "audio" ? "Play audio" : "Play video";
	const play = row.createEl("button", { cls: "booklet-media-play", text: slot.alt ? `${label}: ${slot.alt}` : label, attr: { type: "button", "aria-describedby": hostId } });
	const from = slot.type === "service" ? `from ${slot.name} (${playerHost(slot)})` : `from ${slot.host}`;
	row.createSpan({ cls: "booklet-media-host", text: slot.allowed ? from : `${from}, not allowed yet`, attr: { id: hostId } });
	externalLink(row, slot.addr, "Open in browser");
	const live = box.createDiv({ cls: "booklet-media-live", attr: { "aria-live": "polite" } });

	let started = false;
	const start = (): void => {
		if (started) return;
		started = true;
		const host = playerHost(slot);
		live.setText(`Loading ${slot.media} from ${host}`);
		if (slot.type === "service") {
			const frame = createFrame(doc, slot);
			box.insertBefore(frame, row);
			play.remove();
			frame.focus();
			owner.register(() => {
				frame.src = "about:blank";
				frame.remove();
			});
			return;
		}
		const player = createPlayer(doc, slot);
		let stopped = false;
		const onError = (): void => {
			if (stopped) return;
			stopped = true;
			player.pause();
			player.removeAttribute("src");
			player.remove();
			live.setText(FAILED);
			started = false;
			row.insertBefore(play, row.firstChild);
			play.focus();
		};
		player.addEventListener("error", onError);
		const loaded = (): void => {
			if (live.textContent?.startsWith("Loading")) live.setText("");
		};
		player.addEventListener("playing", loaded);
		player.addEventListener("loadedmetadata", loaded);
		box.insertBefore(player, row);
		play.remove();
		// the press is still on the stack: a phone allows play() only inside it
		const p = player.play() as Promise<void> | undefined;
		if (p && typeof p.catch === "function") p.catch(() => {});
		player.focus();
		owner.register(() => {
			if (stopped || deps.keepAlive?.(player, slot)) return;
			stopped = true;
			player.removeEventListener("error", onError);
			player.pause();
			player.removeAttribute("src");
			player.load();
		});
	};

	play.addEventListener("click", (evt) => {
		if (!deps.isPress(evt)) return;
		if (slot.allowed) start();
		else
			deps.ask({
				slot,
				opener: play,
				once: (e) => {
					if (deps.isPress(e)) start();
				},
			});
	});
	return box;
}

function otherSlot(doc: Document, slot: Exclude<MediaSlot, { type: "media" | "service" }>): HTMLElement {
	const box = doc.createElement("div");
	box.className = "booklet-media-slot";
	box.setAttribute("data-booklet-media", slot.type);
	if (slot.type === "refused") {
		box.setAttribute("data-state", "refused");
		box.createSpan({ cls: "booklet-media-words", text: slot.alt || (slot.media === "audio" ? "Audio" : "Video") });
		box.createSpan({ cls: "booklet-media-host", text: ` from ${slot.host}. This address does not use https, so it cannot be played here. ` });
		externalLink(box, slot.addr, "Open in browser");
		return box;
	}
	// a frame, a raw media tag, an address that is not media: a link naming its host, never loaded
	box.setAttribute("data-state", slot.why);
	externalLink(box, slot.addr, slot.alt || slot.host);
	box.createSpan({ cls: "booklet-media-host", text: ` from ${slot.host}` });
	return box;
}

/**
 * Swaps the tokens the gate left in the rendered text of `el` for their slots. A slot that is alone in its paragraph takes the
 * paragraph's place. `owner` is the drawing: when it unloads, every player the slots started is stopped.
 */
export function drawMedia(el: HTMLElement, slots: readonly MediaSlot[], deps: MediaDeps, owner: Component): void {
	if (!slots.length) return;
	const doc = el.ownerDocument;
	const walker = doc.createTreeWalker(el, 4);
	const texts: Text[] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes(SLOT_OPEN)) texts.push(n as Text);
	for (const t of texts) {
		const parent = t.parentElement;
		const frag = doc.createDocumentFragment();
		t.data.split(TOKEN).forEach((part, n) => {
			if (n % 2 === 0) {
				if (part) frag.appendChild(doc.createTextNode(part));
				return;
			}
			const slot = slots[Number(part)];
			if (slot) frag.appendChild(slot.type === "media" || slot.type === "service" ? playSlot(doc, slot, deps, owner) : otherSlot(doc, slot));
		});
		t.replaceWith(frag);
		if (parent && parent.tagName === "P" && Array.from(parent.childNodes).every((c) => (c.nodeType === 1 && (c as Element).classList.contains("booklet-media-slot")) || (c.nodeType === 3 && !(c.textContent ?? "").trim())))
			parent.replaceWith(...Array.from(parent.childNodes));
	}
}

/** The address a link's words may be without the host shown after it: the address itself, less its scheme, `www.` and a last slash, or the bare host. */
function asAddress(text: string, u: URL): boolean {
	const strip = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
	const t = strip(text);
	return t === strip(u.href) || t === strip(u.host);
}

/**
 * A link out whose words are not its address shows where it goes: " (host)" after it, not inside it, so the link's own words are
 * unchanged. Prose only; a slot's own link is left alone.
 */
export function drawLinkHosts(el: HTMLElement): void {
	for (const a of Array.from(el.querySelectorAll("a"))) {
		const href = a.getAttribute("href") ?? "";
		if (!/^https?:\/\//i.test(href) || a.closest(".booklet-media-slot, .booklet-link-host")) continue;
		let u: URL;
		try {
			u = new URL(href);
		} catch {
			continue;
		}
		if (asAddress(a.textContent ?? "", u) || a.nextElementSibling?.classList.contains("booklet-link-host")) continue;
		const host = a.ownerDocument.createElement("span");
		host.className = "booklet-link-host";
		host.textContent = ` (${u.host})`;
		a.after(host);
	}
}

/** No audio or video of Obsidian's own loads before it is pressed, as far as the page can say so: `preload="none"` on `root` and in it, as soon as it exists. The plugin's own players are left as they are. */
export function keepLocalPreload(root: Element): void {
	for (const m of [root, ...Array.from(root.querySelectorAll("audio, video"))])
		if (m.matches("audio, video") && !m.hasAttribute("data-booklet-player") && m.getAttribute("preload") !== "none") m.setAttribute("preload", "none");
}
