/*
 * Audio, video and images by the extension of an address (SPEC section 6, "Audio and video"), and the one way the allow list, the
 * services and the gate read a web address (`parseUrl`, `hostOf`). Plain TypeScript: nothing here imports Obsidian.
 */

const AUDIO = new Set(["mp3", "m4a", "ogg", "opus", "wav", "flac"]);
const VIDEO = new Set(["mp4", "webm", "mov", "mkv", "ogv", "3gp"]);
const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp"]);

/** What an address or a path is, by the extension of its path (before `?` and `#`): audio, video, an image, or none of them. */
export function mediaClass(addrOrPath: string): "audio" | "video" | "image" | null {
	// the path only: a scheme and a host are not part of it (`https://example.png` has no extension), and neither are a query and a fragment
	const path = (addrOrPath.split(/[?#]/, 1)[0] ?? "").replace(/^(?:[a-z][a-z0-9+.-]*:)?\/\/[^/]*/i, "");
	const m = /\.([A-Za-z0-9]+)$/.exec(path);
	const ext = m ? (m[1] ?? "").toLowerCase() : "";
	if (AUDIO.has(ext)) return "audio";
	if (VIDEO.has(ext)) return "video";
	if (IMAGE.has(ext)) return "image";
	return null;
}

/** An address as `new URL` reads it (surrounding spaces dropped), else null. The one place an address is parsed for the allow list, the services and the gate. */
export function parseUrl(url: string): URL | null {
	try {
		return new URL(url.trim());
	} catch {
		return null;
	}
}

/** The host of an `http:` or `https:` address as `new URL` writes it, with its port when it is not the default; else null. */
export function hostOf(url: string): string | null {
	const u = parseUrl(url);
	return u && (u.protocol === "https:" || u.protocol === "http:") ? u.host : null;
}

/** A written web address that names this machine and nothing else: the scheme, `//`, no userinfo, then the host as written (`localhost` or `<name>.localhost`, `127.a.b.c`, `[::1]`) and an optional port. */
const LOOPBACK = /^(https?):\/\/(\[::1\]|(?:[a-z0-9-]+\.)*localhost|127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})(?::(\d{0,5}))?(?=[/?#\\]|$)/i;

/**
 * Does this address lead to the reader's own machine, and only to it? Local, in the plugin's sense: the host `localhost` or a name
 * under `.localhost`, an IPv4 address in 127.0.0.0/8, or IPv6 `::1`, over `http:` or `https:`, with any port. Read the way the gate reads
 * every address (`parseUrl`, which is `new URL`), and then stricter, because a "yes" here means the plugin does not ask:
 * - the host must be WRITTEN as one of those forms. What a browser would turn into 127.0.0.1 (`http://2130706433/`, `http://0x7f.1/`,
 *   `http://0177.0.0.1/`, `http://127.1/`), the long forms of `::1` and IPv4-mapped IPv6 (`[::ffff:127.0.0.1]`) are not recognised, so
 *   they stay remote and ask; and so does a trailing dot (`localhost.`);
 * - an address with userinfo (`http://user@localhost/`) is not recognised, nor one whose parsed host is not the written one;
 * - a LAN address (192.168.x.x, 10.x.x.x), 0.0.0.0, a name that merely holds the word, a `file:` address and a `//host` address are not.
 */
export function isLoopback(url: string): boolean {
	const text = url.trim();
	const m = LOOPBACK.exec(text);
	if (!m) return false;
	const u = parseUrl(text);
	if (!u || u.protocol !== `${(m[1] ?? "").toLowerCase()}:` || u.username !== "" || u.password !== "") return false;
	return u.hostname === (m[2] ?? "").toLowerCase();
}
