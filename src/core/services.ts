/*
 * The few media services the plugin knows how to play in a press-to-load player (plan: audio and video services). A link to a
 * service is a link in the file and a player here only once the reader has allowed the service; anything not in this table is not a
 * service. Every address a player loads from is built here from an id the pattern below matched, never from the file's own words.
 * Plain TypeScript: nothing here imports Obsidian.
 */
import { entryCovers, isAllowed, type Allows } from "./allow";
import { parseUrl } from "./media";

interface ServiceBase {
	name: string;
	kind: "audio" | "video";
	/** Every host the service's links belong to (a link on any of them is the service's); the first is the entry the allow card offers. */
	hosts: string[];
	/** Every host the player loads from, which the reader is told a press will ask (for YouTube, Obsidian's own frame as well); the service is allowed when the list covers them all (`serviceAllowed`). */
	shown: string[];
	/** What the framed player may use (its `allow` attribute): no more than it needs. */
	allow: string;
}

/**
 * A service is played one of two ways. `native`: the address handed to Obsidian as `![](address)` on the press, when Obsidian draws
 * the service's player itself (YouTube), built from the id alone. `embedUrl`: the address the plugin's own framed player loads.
 */
export type Service = ServiceBase & ({ native: string; embedUrl: null } | { native: null; embedUrl: string });

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOST = /^(?:(?:www|m|music)\.)?youtube\.com$|^(?:www\.)?youtube-nocookie\.com$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SOUNDCLOUD_RESERVED = new Set(["you", "discover", "stream", "search", "upload", "pages", "settings", "feed", "charts", "tags", "terms-of-use", "jobs", "popular"]);

const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];
/** What Obsidian's own YouTube frame loads from (`https://releases.obsidian.md/youtube?v=ID`), and so what a press on a YouTube slot asks as well. */
const OBSIDIAN_FRAME_HOSTS = ["releases.obsidian.md"];
const VIMEO_HOSTS = ["vimeo.com"];
const SPOTIFY_HOSTS = ["spotify.com"];
const SOUNDCLOUD_HOSTS = ["soundcloud.com"];

/** The host of a framed player's address. */
const hostOfUrl = (url: string): string => new URL(url).host;

/** The sites the settings button "Add suggested services" puts on the vault's list. */
export const SUGGESTED_HOSTS: readonly string[] = ["youtube.com", "vimeo.com", "spotify.com", "soundcloud.com"];

function youtube(u: URL): Service | null {
	let id = "";
	const parts = u.pathname.split("/").filter(Boolean);
	if (u.hostname === "youtu.be") id = parts[0] ?? "";
	else if (YT_HOST.test(u.hostname)) {
		if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
		else if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "") && parts.length === 2) id = parts[1] ?? "";
	} else return null;
	if (!YT_ID.test(id)) return null;
	// Obsidian draws YouTube itself where a raw embed of ours may say "unavailable" in the app: on the press the plugin hands it this address
	return { name: "YouTube", kind: "video", embedUrl: null, native: `https://www.youtube.com/watch?v=${id}`, hosts: YOUTUBE_HOSTS, shown: ["youtube.com", ...OBSIDIAN_FRAME_HOSTS], allow: "" };
}

function vimeo(u: URL): Service | null {
	let m: RegExpExecArray | null = null;
	if (u.hostname === "player.vimeo.com") m = /^\/video\/(\d{3,})\/?$/.exec(u.pathname);
	else if (u.hostname === "vimeo.com" || u.hostname === "www.vimeo.com") m = /^\/(?:channels\/[\w-]+\/|groups\/[\w-]+\/videos\/)?(\d{3,})(?:\/([0-9a-f]{6,}))?\/?$/.exec(u.pathname);
	if (!m) return null;
	const hash = u.hostname === "player.vimeo.com" ? u.searchParams.get("h") : m[2];
	const h = hash && /^[0-9a-f]{6,}$/.test(hash) ? `&h=${hash}` : "";
	const embedUrl = `https://player.vimeo.com/video/${m[1]}?autoplay=1${h}`;
	return { name: "Vimeo", kind: "video", embedUrl, native: null, hosts: VIMEO_HOSTS, shown: [hostOfUrl(embedUrl)], allow: "autoplay; picture-in-picture; fullscreen" };
}

function spotify(u: URL): Service | null {
	if (u.hostname !== "open.spotify.com") return null;
	const m = /^\/(?:intl-[a-z]{2,3}\/)?(episode|track|show|album|playlist)\/([^/]+)\/?$/.exec(u.pathname);
	if (!m || !SPOTIFY_ID.test(m[2] ?? "")) return null;
	const embedUrl = `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
	return { name: "Spotify", kind: "audio", embedUrl, native: null, hosts: SPOTIFY_HOSTS, shown: [hostOfUrl(embedUrl)], allow: "encrypted-media; fullscreen; picture-in-picture" };
}

function soundcloud(u: URL): Service | null {
	if (u.hostname !== "soundcloud.com" && u.hostname !== "www.soundcloud.com") return null;
	const m = /^\/([A-Za-z0-9_-]+)\/(?:(sets)\/)?([A-Za-z0-9_-]+)\/?$/.exec(u.pathname);
	if (!m || SOUNDCLOUD_RESERVED.has((m[1] ?? "").toLowerCase())) return null;
	const path = `${m[1]}/${m[2] ? "sets/" : ""}${m[3]}`;
	const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(`https://soundcloud.com/${path}`)}&auto_play=true`;
	return { name: "SoundCloud", kind: "audio", embedUrl, native: null, hosts: SOUNDCLOUD_HOSTS, shown: [hostOfUrl(embedUrl)], allow: "autoplay" };
}

/** The service an `https:` address is a page of (a video, an episode), with its player's address; null for any other address. */
export function serviceOf(url: string): Service | null {
	const u = parseUrl(url);
	if (!u || u.protocol !== "https:" || u.username || u.password) return null;
	return youtube(u) ?? vimeo(u) ?? spotify(u) ?? soundcloud(u);
}

/** Hosts a player loads from that an entry for the service covers (Obsidian's own frame for YouTube): they allow nothing on their own. */
const ALSO_HOSTS: ReadonlySet<string> = new Set(OBSIDIAN_FRAME_HOSTS);

/**
 * Is a service's player allowed: every host it loads from (`shown`) is on the reader's list, so that a press asks nothing more. The
 * link's own host does not decide it (`www.vimeo.com` on the list does not cover `player.vimeo.com`, where the player is, and
 * `www.youtube.com` does not cover `youtube.com`). The one host that is not asked for on its own is Obsidian's frame for YouTube
 * (`FAMILIES`): an entry that covers YouTube covers it, and the allow card says so (`alsoCovers`).
 */
export function serviceAllowed(service: { shown: readonly string[] }, allows: Allows, notePath: string): boolean {
	return service.shown.filter((h) => !ALSO_HOSTS.has(h)).every((h) => isAllowed(`https://${h}/`, allows, notePath));
}

/** A service's hosts, and the hosts its player also uses. */
const FAMILIES: readonly { hosts: string[]; also: string[] }[] = [
	{ hosts: YOUTUBE_HOSTS, also: OBSIDIAN_FRAME_HOSTS },
	{ hosts: VIMEO_HOSTS, also: [] },
	{ hosts: SPOTIFY_HOSTS, also: [] },
	{ hosts: SOUNDCLOUD_HOSTS, also: [] },
];

/** The other hosts a service's player uses that this entry also covers (for `youtube.com`: `youtu.be`, `youtube-nocookie.com` and Obsidian's own frame, `releases.obsidian.md`); none when the entry is not a service's. */
export function alsoCovers(entry: string): string[] {
	for (const f of FAMILIES) if (f.hosts.some((h) => entryCovers(entry, h))) return [...f.hosts, ...f.also].filter((h) => h !== entry);
	return [];
}

/** Hosts in a sentence: "a", "a and b", "a, b and c". */
export function hostList(hosts: readonly string[]): string {
	return hosts.length < 2 ? hosts.join("") : `${hosts.slice(0, -1).join(", ")} and ${hosts[hosts.length - 1]}`;
}

/**
 * Is this address on a host Obsidian itself turns into a frame of its own when it is the address of an image (a post-processor reads
 * every `img` it draws: YouTube's and Twitter's or X's, with or without `www.`, `m.` or `mobile.`, and whatever the rest of the
 * address says, even a picture's ending)? Such a frame is requested at render, so the address is never left to Obsidian (gate.ts).
 */
export function isEmbedAddress(url: string): boolean {
	const u = parseUrl(url);
	if (!u || (u.protocol !== "https:" && u.protocol !== "http:")) return false;
	return YT_HOST.test(u.hostname) || /^(?:www\.|m\.)?youtu\.be$/.test(u.hostname) || /^(?:(?:www|mobile)\.)?(?:twitter|x)\.com$/.test(u.hostname);
}
