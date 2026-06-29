import { chromium, type BrowserContext } from "patchright";
import type { Minter, Session } from "./session.js";

const ORIGIN = "https://www.cochranelibrary.com";

export function cookiesToHeader(cookies: { name: string; value: string }[]): string {
  return cookies.filter((c) => c.value).map((c) => `${c.name}=${c.value}`).join("; ");
}

export interface CdpMinterOptions {
  cdpEndpoint?: string; // e.g. http://127.0.0.1:9444 — attach mode
  profileDir?: string; // auto-launch persistent profile
  channel?: string; // default "chrome"
  warmUrl?: string; // a search URL to trigger clearance
  timeoutMs?: number; // wait for cf_clearance
}

export class CdpMinter implements Minter {
  constructor(private readonly opts: CdpMinterOptions = {}) {}

  async mint(): Promise<Session> {
    return this.opts.cdpEndpoint ? this.mintViaAttach(this.opts.cdpEndpoint) : this.mintViaLaunch();
  }

  private async readSession(ctx: BrowserContext): Promise<Session> {
    const cookies = await ctx.cookies(ORIGIN);
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const userAgent = await page.evaluate(() => navigator.userAgent);
    return { cookieHeader: cookiesToHeader(cookies), userAgent, mintedAt: Date.now() };
  }

  private async mintViaAttach(endpoint: string): Promise<Session> {
    const browser = await chromium.connectOverCDP(endpoint);
    try {
      const ctx = browser.contexts()[0];
      if (!ctx) throw new Error("No browser context found over CDP");
      return await this.readSession(ctx);
    } finally {
      await browser.close();
    }
  }

  private async mintViaLaunch(): Promise<Session> {
    const profileDir = this.opts.profileDir ?? "./.cochrane-profile";
    const warmUrl =
      this.opts.warmUrl ??
      `${ORIGIN}/en/search?searchText=cochrane&searchBy=1&selectedType=review&forceTypeSelection=true&p_p_id=scolarissearchresultsportlet_WAR_scolarissearchresults&p_p_lifecycle=0`;
    const timeoutMs = this.opts.timeoutMs ?? 60000;
    const ctx = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: this.opts.channel ?? "chrome",
      viewport: { width: 1280, height: 900 },
    });
    try {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
      await page.goto(warmUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const cookies = await ctx.cookies(ORIGIN);
        if (cookies.some((c) => c.name === "cf_clearance")) break;
        await page.waitForTimeout(1500);
      }
      return await this.readSession(ctx);
    } finally {
      await ctx.close();
    }
  }
}
