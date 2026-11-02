/*
 * The few media services the plugin knows how to play in a press-to-load player (plan: audio and video services). A link to a
 * service is a link in the file and a player here only once the reader has allowed the service; anything not in this table is not a
 * service. Every address a player loads from is built here from an id the pattern below matched, never from the file's own words.
 * Plain TypeScript: nothing here imports Obsidian.
 */
import { entryCovers, isAllowed, type Allows } from "./allow";

export interface Service {
	name: string;
	kind: "audio" | "video";
	/** The address the framed player loads. */
	embedUrl: string;
	/** Every host the service's links and player belong to; allowing any of them allows the service, and the card names them. */
	hosts: string[];
	/** What the framed player may use (its `allow` attribute): no more than it needs. */
	allow: string;
}

function parse(url: string): URL | null {
	try {
		return new URL(url.trim());
	} catch {
		return null;
	}
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOST = /^(?:(?:www|m|music)\.)?youtube\.com$|^(?:www\.)?youtube-nocookie\.com$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SOUNDCLOUD_RESERVED = new Set(["you", "discover", "stream", "search", "upload", "pages", "settings", "feed", "charts", "tags", "terms-of-use", "jobs", "popular"]);

const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];
const VIMEO_HOSTS = ["vimeo.com"];
const SPOTIFY_HOSTS = ["spotify.com"];
const SOUNDCLOUD_HOSTS = ["soundcloud.com"];

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
	return { name: "YouTube", kind: "video", embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, hosts: YOUTUBE_HOSTS, allow: "autoplay; encrypted-media; picture-in-picture; fullscreen" };
}

function vimeo(u: URL): Service | null {
	let m: RegExpExecArray | null = null;
	if (u.hostname === "player.vimeo.com") m = /^\/video\/(\d{3,})\/?$/.exec(u.pathname);
	else if (u.hostname === "vimeo.com" || u.hostname === "www.vimeo.com") m = /^\/(?:channels\/[\w-]+\/|groups\/[\w-]+\/videos\/)?(\d{3,})(?:\/([0-9a-f]{6,}))?\/?$/.exec(u.pathname);
	if (!m) return null;
	const hash = u.hostname === "player.vimeo.com" ? u.searchParams.get("h") : m[2];
	const h = hash && /^[0-9a-f]{6,}$/.test(hash) ? `&h=${hash}` : "";
	return { name: "Vimeo", kind: "video", embedUrl: `https://player.vimeo.com/video/${m[1]}?autoplay=1${h}`, hosts: VIMEO_HOSTS, allow: "autoplay; picture-in-picture; fullscreen" };
}

function spotify(u: URL): Service | null {
	if (u.hostname !== "open.spotify.com") return null;
	const m = /^\/(?:intl-[a-z]{2,3}\/)?(episode|track|show|album|playlist)\/([^/]+)\/?$/.exec(u.pathname);
	if (!m || !SPOTIFY_ID.test(m[2] ?? "")) return null;
	return { name: "Spotify", kind: "audio", embedUrl: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, hosts: SPOTIFY_HOSTS, allow: "encrypted-media; fullscreen; picture-in-picture" };
}

function soundcloud(u: URL): Service | null {
	if (u.hostname !== "soundcloud.com" && u.hostname !== "www.soundcloud.com") return null;
	const m = /^\/([A-Za-z0-9_-]+)\/(?:(sets)\/)?([A-Za-z0-9_-]+)\/?$/.exec(u.pathname);
	if (!m || SOUNDCLOUD_RESERVED.has((m[1] ?? "").toLowerCase())) return null;
	const path = `${m[1]}/${m[2] ? "sets/" : ""}${m[3]}`;
	return { name: "SoundCloud", kind: "audio", embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(`https://soundcloud.com/${path}`)}&auto_play=true`, hosts: SOUNDCLOUD_HOSTS, allow: "autoplay" };
}

/** The service an `https:` address is a page of (a video, an episode), with its player's address; null for any other address. */
export function serviceOf(url: string): Service | null {
	const u = parse(url);
	if (!u || u.protocol !== "https:" || u.username || u.password) return null;
	return youtube(u) ?? vimeo(u) ?? spotify(u) ?? soundcloud(u);
}

/**
 * Is a service's player allowed: the link's own host is on the reader's list, or any host of the service is. So allowing
 * `youtube.com` also allows `youtu.be` links and the player's `youtube-nocookie.com`.
 */
export function serviceAllowed(service: Service, link: string, allows: Allows, notePath: string): boolean {
	return isAllowed(link, allows, notePath) || service.hosts.some((h) => isAllowed(`https://${h}/`, allows, notePath));
}

const FAMILIES: readonly string[][] = [YOUTUBE_HOSTS, VIMEO_HOSTS, SPOTIFY_HOSTS, SOUNDCLOUD_HOSTS];

/** The other hosts a service's player uses that this entry also allows (for `youtube.com`: `youtu.be` and `youtube-nocookie.com`); none when the entry is not a service's. */
export function alsoCovers(entry: string): string[] {
	for (const hosts of FAMILIES) if (hosts.some((h) => entryCovers(entry, h))) return hosts.filter((h) => h !== entry);
	return [];
}
