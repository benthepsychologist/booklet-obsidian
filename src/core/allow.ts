/*
 * The reader's list of hosts media may load from (plan: three scopes, once, this note, this vault). An entry is a host as the
 * reader typed it, in lower case: `youtube.com` stands for `https://*.youtube.com/*`, the host and its subdomains, https only. The
 * lists live in the plugin's data and never in a note. Plain TypeScript: nothing here imports Obsidian.
 */

import { parseUrl } from "./media";

/** The vault's list, and each note's by the note's path. */
export type Allows = { vault: string[]; notes: Record<string, string[]> };

export type EntryResult = { ok: true; entry: string } | { ok: false; why: string };

/** A name of two labels or more, each of letters, digits, `_` and `-`, none starting or ending with `-`. */
const LABELS = /^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?(?:\.[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?)+$/;
/** A host that is a number: it is that one machine, and has no subdomains. */
const isIp = (hostname: string): boolean => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith("[");

/** A host name without the one dot that may end it: `cdn.example.com.` is `cdn.example.com` (the same host; a browser sends the same request). */
const bare = (hostname: string): string => hostname.replace(/\.$/, "");

/**
 * What a reader typed as a site, as the entry it stands for: the host alone (`https://youtube.com/` is taken as `youtube.com`),
 * in lower case, as `new URL` writes it (an accented name shows as its plain punycode). A port is kept when it is not the default. No
 * path, wildcard, user name, scheme but https, or name with no ending is an entry; `why` says in words what to change.
 */
export function normaliseEntry(text: string): EntryResult {
	let t = text.trim();
	if (!t) return { ok: false, why: "Type a site, like youtube.com." };
	const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(t);
	if (scheme) {
		if ((scheme[1] ?? "").toLowerCase() !== "https") return { ok: false, why: "Only https sites can be allowed." };
		t = t.slice(scheme[0].length);
	}
	if (t.includes("*")) return { ok: false, why: "No wildcards: youtube.com already covers its subdomains." };
	if (t.includes("@")) return { ok: false, why: "A site cannot carry a user name or a password." };
	if (/\s/.test(t)) return { ok: false, why: "A site has no spaces in it." };
	t = t.replace(/\/$/, "");
	if (/[/?#\\]/.test(t)) return { ok: false, why: "Give the site alone, without a path, like youtube.com." };
	const u = t ? parseUrl(`https://${t}`) : null;
	if (!u || !u.hostname || u.pathname !== "/" || u.search || u.hash) return { ok: false, why: "That does not look like a site. Try something like youtube.com." };
	// a dot after the name (`youtube.com.`) names the same host: it is left off, before a port too
	const name = bare(u.hostname);
	if (!isIp(name) && !name.includes(".")) return { ok: false, why: "Add the ending too, like youtube.com." };
	if (!isIp(name) && !LABELS.test(name)) return { ok: false, why: "That does not look like a site. Try something like youtube.com." };
	return { ok: true, entry: u.port ? `${name}:${u.port}` : name };
}

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Does the entry cover this address's host: the same host, or a subdomain of it (a number covers itself only), on the same port? A dot ending either name does not matter. */
function covers(entry: string, u: URL): boolean {
	const e = parseUrl(`https://${entry}`);
	if (!e || e.port !== u.port) return false;
	const host = bare(u.hostname);
	const name = bare(e.hostname);
	if (host === name) return true;
	return !isIp(name) && host.endsWith(`.${name}`);
}

/** Does the entry cover this host (a name, with its port if it is not the default)? */
export function entryCovers(entry: string, host: string): boolean {
	const u = parseUrl(`https://${host}`);
	return !!u && covers(entry, u);
}

/**
 * Is this address one the reader has allowed, in the vault's list or the note's? Only an `https:` address with no user name can be:
 * the address is read as written with `new URL`, so `youtube.com.evil.example` and `evilyoutube.com` are not `youtube.com`, and a
 * redirect is never followed in code.
 */
export function isAllowed(url: string, allows: Allows, notePath: string): boolean {
	const u = parseUrl(url);
	if (!u || u.protocol !== "https:" || u.username || u.password) return false;
	if (allows.vault.some((e) => covers(e, u))) return true;
	return own(allows.notes, notePath) && (allows.notes[notePath] ?? []).some((e) => covers(e, u));
}

/** The entry that would allow this address: its host as written, or null for an address that cannot be allowed (not https). */
export function entryFor(url: string): string | null {
	const u = parseUrl(url);
	if (!u || u.protocol !== "https:" || u.username || u.password) return null;
	const n = normaliseEntry(u.host);
	return n.ok ? n.entry : null;
}
