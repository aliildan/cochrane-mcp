import { describe, expect, test, vi } from "vitest";
import { HttpClient, isChallenge, CloudflareChallengeError } from "../src/engine/httpClient.js";
import type { Minter, Session } from "../src/engine/session.js";

const session = (): Session => ({ cookieHeader: "cf_clearance=abc", userAgent: "UA", mintedAt: Date.now() });
const CHALLENGE = "<html>Just a moment... unable to send a cookie</html>";

describe("isChallenge", () => {
  test("412 + marker is a challenge", () => expect(isChallenge(412, CHALLENGE)).toBe(true));
  test("200 large body is not", () => expect(isChallenge(200, "x".repeat(100000))).toBe(false));
  test("200 with embedded challenge-platform string is not (too large)", () =>
    expect(isChallenge(200, "challenge-platform " + "x".repeat(100000))).toBe(false));
});

describe("HttpClient", () => {
  test("mints once then reuses session", async () => {
    const minter: Minter = { mint: vi.fn().mockResolvedValue(session()) };
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, text: async () => "OK-BODY" });
    vi.stubGlobal("fetch", fetchMock);
    const c = new HttpClient(minter);
    expect(await c.fetchText("https://x")).toBe("OK-BODY");
    await c.fetchText("https://y");
    expect(minter.mint).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
  test("refreshes once on challenge then succeeds", async () => {
    const minter: Minter = { mint: vi.fn().mockResolvedValue(session()) };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 412, text: async () => CHALLENGE })
      .mockResolvedValueOnce({ status: 200, text: async () => "GOOD" });
    vi.stubGlobal("fetch", fetchMock);
    const c = new HttpClient(minter);
    expect(await c.fetchText("https://x")).toBe("GOOD");
    expect(minter.mint).toHaveBeenCalledTimes(2); // initial + refresh
    vi.unstubAllGlobals();
  });
  test("throws CloudflareChallengeError if still challenged", async () => {
    const minter: Minter = { mint: vi.fn().mockResolvedValue(session()) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 412, text: async () => CHALLENGE }));
    const c = new HttpClient(minter);
    await expect(c.fetchText("https://x")).rejects.toBeInstanceOf(CloudflareChallengeError);
    vi.unstubAllGlobals();
  });
});
