import type { Minter, Session } from "./session.js";

export class CloudflareChallengeError extends Error {
  constructor(url: string) {
    super(
      `Cloudflare challenge could not be cleared for ${url}. ` +
        `Ensure a real Chrome is reachable (set COCHRANE_CDP_ENDPOINT, run one on a debug port, ` +
        `or allow auto-launch) and solve the one-time challenge in the browser window.`,
    );
    this.name = "CloudflareChallengeError";
  }
}

const CHALLENGE_MARKERS = /just a moment|unable to send a cookie|cf-challenge|challenge-platform/i;
const MAX_REDIRECTS = 10;

export function isChallenge(status: number, body: string): boolean {
  if (status === 200) return false;
  if (status === 412 || status === 403 || status === 503) {
    return body.length < 8000 && CHALLENGE_MARKERS.test(body);
  }
  return false;
}

// --- minimal cookie jar (name=value only; attributes ignored) ---

function parseCookieHeader(header: string): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (name) jar.set(name, part.slice(i + 1).trim());
  }
  return jar;
}

function serializeJar(jar: Map<string, string>): string {
  return [...jar].filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ");
}

function getSetCookies(res: { headers?: { getSetCookie?: () => string[] } }): string[] {
  return typeof res.headers?.getSetCookie === "function" ? res.headers.getSetCookie() : [];
}

function mergeSetCookies(jar: Map<string, string>, setCookies: string[]): void {
  for (const sc of setCookies) {
    const first = sc.split(";")[0];
    const i = first.indexOf("=");
    if (i < 0) continue;
    const name = first.slice(0, i).trim();
    if (name) jar.set(name, first.slice(i + 1).trim());
  }
}

function locationOf(res: { headers?: { get?: (k: string) => string | null } }): string | null {
  return res.headers?.get?.("location") ?? null;
}

interface FetchResult {
  status: number;
  body: string;
}

export class HttpClient {
  private session: Session | null = null;
  constructor(private readonly minter: Minter) {}

  private async ensureSession(): Promise<Session> {
    if (!this.session) this.session = await this.minter.mint();
    return this.session;
  }

  /**
   * Fetch following redirects manually so Set-Cookie from each hop is carried into the cookie
   * jar — required because Cochrane (Liferay/Atypon) bounces 302→self to establish a fresh
   * JSESSIONID, which `fetch`'s automatic redirect (fixed Cookie header) would loop on forever.
   */
  private async fetchFollowing(url: string, jar: Map<string, string>, userAgent: string, accept: string): Promise<FetchResult> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(current, {
        headers: { "User-Agent": userAgent, Cookie: serializeJar(jar), Accept: accept },
        redirect: "manual",
      });
      mergeSetCookies(jar, getSetCookies(res));
      const location = res.status >= 300 && res.status < 400 ? locationOf(res) : null;
      if (location) {
        current = new URL(location, current).toString();
        continue;
      }
      return { status: res.status, body: await res.text() };
    }
    // Exhausted redirects without resolving — surface as a non-200 so the caller can refresh/retry.
    return { status: 310, body: "" };
  }

  async fetchText(url: string, accept = "text/html,application/json"): Promise<string> {
    let session = await this.ensureSession();
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const jar = parseCookieHeader(session.cookieHeader);
      try {
        const { status, body } = await this.fetchFollowing(url, jar, session.userAgent, accept);
        if (status === 200 || (!isChallenge(status, body) && status < 300)) {
          // Persist refreshed session cookies (e.g. new JSESSIONID) for subsequent requests.
          this.session = { ...session, cookieHeader: serializeJar(jar) };
          return body;
        }
        lastError = undefined; // a challenge/redirect, not a thrown error
      } catch (err) {
        // Raw network failure ("fetch failed", connection reset) — often a stale session.
        lastError = err;
      }
      // Challenge, unresolved redirect, or network error — re-mint the cookie and retry once.
      this.session = await this.minter.mint();
      session = this.session;
    }
    if (lastError) {
      throw new Error(`Request to ${url} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`, {
        cause: lastError,
      });
    }
    throw new CloudflareChallengeError(url);
  }
}
