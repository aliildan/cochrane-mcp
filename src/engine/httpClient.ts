import type { Minter, Session } from "./session.js";

export class CloudflareChallengeError extends Error {
  constructor(url: string) {
    super(
      `Cloudflare challenge could not be cleared for ${url}. ` +
        `Ensure a real Chrome is reachable (set COCHRANE_CDP_ENDPOINT or allow auto-launch) ` +
        `and solve the one-time challenge in the browser window.`,
    );
    this.name = "CloudflareChallengeError";
  }
}

const CHALLENGE_MARKERS = /just a moment|unable to send a cookie|cf-challenge|challenge-platform/i;

export function isChallenge(status: number, body: string): boolean {
  if (status === 200) return false;
  if (status === 412 || status === 403 || status === 503) {
    return body.length < 8000 && CHALLENGE_MARKERS.test(body);
  }
  return false;
}

export class HttpClient {
  private session: Session | null = null;
  constructor(private readonly minter: Minter) {}

  private async ensureSession(): Promise<Session> {
    if (!this.session) this.session = await this.minter.mint();
    return this.session;
  }

  async fetchText(url: string, accept = "text/html,application/json"): Promise<string> {
    let session = await this.ensureSession();
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, {
        headers: { "User-Agent": session.userAgent, Cookie: session.cookieHeader, Accept: accept },
        redirect: "follow",
      });
      const body = await res.text();
      if (!isChallenge(res.status, body)) return body;
      // Cookie likely expired — refresh once and retry.
      this.session = await this.minter.mint();
      session = this.session;
    }
    throw new CloudflareChallengeError(url);
  }
}
