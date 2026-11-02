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
