import { chromium, type BrowserContext } from "patchright";
import type { Minter, Session } from "./session.js";

type PwCookie = Awaited<ReturnType<BrowserContext["cookies"]>>[number];

const ORIGIN = "https://www.cochranelibrary.com";
const DEFAULT_DISCOVER_PORTS = [9222, 9444];
const FALLBACK_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function cookiesToHeader(cookies: { name: string; value: string }[]): string {
  return cookies.filter((c) => c.value).map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * Probe localhost CDP debugging ports and return the first that is a live Chrome
 * DevTools endpoint. Lets the MCP auto-attach to a browser the user is already running
 * (which usually already holds an organic cf_clearance cookie).
 */
export async function discoverCdpEndpoint(ports: number[], timeoutMs = 800): Promise<string | null> {
  for (const port of ports) {
    const endpoint = `http://127.0.0.1:${port}`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${endpoint}/json/version`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const v = (await res.json()) as { webSocketDebuggerUrl?: string };
        if (v && v.webSocketDebuggerUrl) return endpoint;
      }
    } catch {
      // port not open / not a CDP endpoint — keep probing
    }
  }
  return null;
}

async function fetchUserAgent(endpoint: string): Promise<string | null> {
  try {
    const res = await fetch(`${endpoint}/json/version`);
    if (!res.ok) return null;
    const v = (await res.json()) as { "User-Agent"?: string; userAgent?: string };
    return v["User-Agent"] ?? v.userAgent ?? null;
  } catch {
    return null;
  }
}

const hasClearance = (header: string): boolean => /(^|;\s*)cf_clearance=/.test(header);

const errMessage = (err: unknown): string => {
  const m = err instanceof Error ? err.message : String(err);
  return m.split("\n")[0];
};

export interface CdpMinterOptions {
  cdpEndpoint?: string; // explicit endpoint — always used, warmed if needed
  discoverPorts?: number[]; // ports to probe when no explicit endpoint (default 9222, 9444)
  profileDir?: string; // persistent profile for the self-launch fallback
  channel?: string; // default "chrome"; falls back to bundled chromium if unavailable
  warmUrl?: string; // URL that triggers a cf_clearance challenge
  timeoutMs?: number; // wait for cf_clearance
  headless?: boolean; // self-launch headless (default false — more reliable against Cloudflare)
}

export class CdpMinter implements Minter {
  constructor(private readonly opts: CdpMinterOptions = {}) {}

  private warmUrl(): string {
    return (
      this.opts.warmUrl ??
      `${ORIGIN}/en/search?searchText=cochrane&searchBy=1&selectedType=review&forceTypeSelection=true&p_p_id=scolarissearchresultsportlet_WAR_scolarissearchresults&p_p_lifecycle=0`
    );
  }

  protected discover(): Promise<string | null> {
    return discoverCdpEndpoint(this.opts.discoverPorts ?? DEFAULT_DISCOVER_PORTS);
  }

  private warn(message: string): void {
    // MCP uses stdout for protocol — diagnostics must go to stderr.
    console.error(`[cochrane-mcp] ${message}`);
  }

  /**
   * Strategy: explicit endpoint → discovered running Chrome (if it already has clearance)
   * → self-launch a dedicated persistent Chrome. Any attach failure (unreachable, CDP protocol
   * mismatch, no clearance) falls through to the next option so minting always has a path.
   */
  async mint(): Promise<Session> {
    if (this.opts.cdpEndpoint) {
      try {
        return await this.mintViaAttach(this.opts.cdpEndpoint, true);
      } catch (err) {
        this.warn(`attach to ${this.opts.cdpEndpoint} failed (${errMessage(err)}); falling back`);
      }
    }

    try {
      const discovered = await this.discover();
      if (discovered) {
        // Non-intrusive: only reuse a discovered browser if it already holds clearance.
        const session = await this.mintViaAttach(discovered, false);
        if (hasClearance(session.cookieHeader)) return session;
      }
    } catch (err) {
      this.warn(`discovered Chrome unusable (${errMessage(err)}); self-launching instead`);
    }

    return this.mintViaLaunch();
  }

  protected async mintViaAttach(endpoint: string, allowWarm: boolean): Promise<Session> {
    const userAgent = (await fetchUserAgent(endpoint)) ?? FALLBACK_UA;
    const browser = await chromium.connectOverCDP(endpoint);
    try {
      const ctx = browser.contexts()[0];
      if (!ctx) throw new Error("No browser context found over CDP");
      let cookies = await ctx.cookies(ORIGIN);

      if (allowWarm && !cookies.some((c) => c.name === "cf_clearance")) {
        cookies = await this.warmContext(ctx, cookies);
      }
      return { cookieHeader: cookiesToHeader(cookies), userAgent, mintedAt: Date.now() };
    } finally {
      // For a CDP-connected browser this disconnects only — it does NOT close the user's Chrome.
      await browser.close();
    }
  }

  private async warmContext(ctx: BrowserContext, current: PwCookie[]): Promise<PwCookie[]> {
    const timeoutMs = this.opts.timeoutMs ?? 60000;
    const page = await ctx.newPage();
    try {
      await page.goto(this.warmUrl(), { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
      const deadline = Date.now() + timeoutMs;
      let cookies = current;
      while (Date.now() < deadline) {
        cookies = await ctx.cookies(ORIGIN);
        if (cookies.some((c) => c.name === "cf_clearance")) break;
        await page.waitForTimeout(1500);
      }
      return cookies;
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async launchContext(): Promise<BrowserContext> {
    const profileDir = this.opts.profileDir ?? "./.cochrane-profile";
    const base = { headless: this.opts.headless ?? false, viewport: { width: 1280, height: 900 } };
    try {
      return await chromium.launchPersistentContext(profileDir, { ...base, channel: this.opts.channel ?? "chrome" });
    } catch {
      // System Chrome not installed — use patchright's bundled Chromium.
      return await chromium.launchPersistentContext(profileDir, base);
    }
  }

  protected async mintViaLaunch(): Promise<Session> {
    const timeoutMs = this.opts.timeoutMs ?? 60000;
    const ctx = await this.launchContext();
    try {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
      await page.goto(this.warmUrl(), { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const cookies = await ctx.cookies(ORIGIN);
        if (cookies.some((c) => c.name === "cf_clearance")) break;
        await page.waitForTimeout(1500);
      }
      const cookies = await ctx.cookies(ORIGIN);
      const userAgent = await page.evaluate(() => navigator.userAgent);
      return { cookieHeader: cookiesToHeader(cookies), userAgent, mintedAt: Date.now() };
    } finally {
      await ctx.close();
    }
  }
}
