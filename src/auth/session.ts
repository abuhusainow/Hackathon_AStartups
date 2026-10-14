/**
 * Simulated ID Austria login.
 *
 * In production, ID Austria is an OpenID Connect / SAML identity provider (via the Unternehmensserviceportal
 * or E-ID). Here, the citizen picks a fictional persona and the Worker issues a signed session cookie.
 * Everything else in the app treats the cookie exactly like a real login:
 *
 *   - the citizen id ALWAYS comes from the verified cookie, never from the client or the AI model
 *   - the chat agent instance name is bound to the citizen ("<personaId>--<sessionId>"), and the Worker
 *     refuses agent connections whose name does not match the cookie
 */
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

// Works with any Hono app that has the Env bindings (with or without extra variables).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = Context<{ Bindings: Env; Variables: any }>;

export const SESSION_COOKIE = "ida_session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export type Session = {
	/** Persona / citizen id. */
	pid: string;
	/** Random session id (chat agent instance, live sessions, memory sources). */
	sid: string;
	/** Issued at (unix seconds). */
	iat: number;
	/** Level of assurance shown in the UI ("ID Austria: Vollwertig"). */
	loa: "substantial" | "high";
};

const encoder = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
	const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = "";
	for (const b of arr) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
	const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
	const bin = atob(padded);
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function secret(env: Env): string {
	if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 16) return env.SESSION_SECRET;
	// Local development without .dev.vars: still works, but sessions are not secure.
	console.warn("[auth] SESSION_SECRET is missing or too short – using an insecure development secret.");
	return "insecure-development-secret-change-me";
}

async function hmacKey(env: Env): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", encoder.encode(secret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(env: Env, session: Session): Promise<string> {
	const payload = b64url(encoder.encode(JSON.stringify(session)));
	const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), encoder.encode(payload));
	return `${payload}.${b64url(sig)}`;
}

export async function verifySession(env: Env, token: string | undefined | null): Promise<Session | null> {
	if (!token) return null;
	const [payload, sig] = token.split(".");
	if (!payload || !sig) return null;
	try {
		const ok = await crypto.subtle.verify("HMAC", await hmacKey(env), b64urlDecode(sig), encoder.encode(payload));
		if (!ok) return null;
		const session = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as Session;
		if (typeof session.pid !== "string" || typeof session.sid !== "string") return null;
		if (Date.now() / 1000 - session.iat > MAX_AGE_SECONDS) return null;
		return session;
	} catch {
		return null;
	}
}

export function newSession(personaId: string): Session {
	return { pid: personaId, sid: crypto.randomUUID(), iat: Math.floor(Date.now() / 1000), loa: "high" };
}

export async function setSessionCookie(c: AnyContext, session: Session) {
	const secure = new URL(c.req.url).protocol === "https:";
	setCookie(c, SESSION_COOKIE, await signSession(c.env, session), {
		httpOnly: true,
		secure,
		sameSite: "Lax",
		path: "/",
		maxAge: MAX_AGE_SECONDS,
	});
}

export function clearSessionCookie(c: AnyContext) {
	deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function getSession(c: AnyContext): Promise<Session | null> {
	return verifySession(c.env, getCookie(c, SESSION_COOKIE));
}

/** Reads the session from a raw request (used for the agent WebSocket route). */
export async function sessionFromRequest(env: Env, request: Request): Promise<Session | null> {
	const cookie = request.headers.get("cookie") ?? "";
	const match = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
	return verifySession(env, match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null);
}

/** Name of the chat agent instance for a session. The persona id prefix is checked on every connection. */
export function agentNameFor(session: Session): string {
	return `${session.pid}--${session.sid}`;
}

export function personaFromAgentName(name: string): string {
	return name.split("--")[0];
}
