import { afterEach, describe, expect, test, vi } from "vitest";
import { CdpMinter, cookiesToHeader, discoverCdpEndpoint } from "../src/engine/minter.js";
import type { Session } from "../src/engine/session.js";

afterEach(() => vi.unstubAllGlobals());

// Subclass exposing the browser operations so we can test mint()'s fallback orchestration
// without a real browser.
const session = (cookieHeader: string): Session => ({ cookieHeader, userAgent: "UA", mintedAt: 0 });

interface Stubs {
  discover?: string | null;
  attach?: (endpoint: string, allowWarm: boolean) => Promise<Session>;
  launch?: () => Promise<Session>;
}

class StubMinter extends CdpMinter {
  constructor(opts: ConstructorParameters<typeof CdpMinter>[0], private stubs: Stubs) {
    super(opts);
  }
  protected discover(): Promise<string | null> {
    return Promise.resolve(this.stubs.discover ?? null);
  }
  protected mintViaAttach(endpoint: string, allowWarm: boolean): Promise<Session> {
    return (this.stubs.attach ?? (() => Promise.reject(new Error("no attach stub"))))(endpoint, allowWarm);
  }
  protected mintViaLaunch(): Promise<Session> {
    return (this.stubs.launch ?? (() => Promise.resolve(session("cf_clearance=launched"))))();
  }
}

test("cookiesToHeader joins name=value pairs", () => {
  expect(cookiesToHeader([{ name: "cf_clearance", value: "abc" }, { name: "__cf_bm", value: "xy" }]))
    .toBe("cf_clearance=abc; __cf_bm=xy");
});
test("cookiesToHeader skips empties", () => {
  expect(cookiesToHeader([{ name: "a", value: "" }, { name: "b", value: "2" }])).toBe("b=2");
});

test("discoverCdpEndpoint returns first responding CDP endpoint", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes(":9444")) return { ok: true, json: async () => ({ webSocketDebuggerUrl: "ws://x" }) };
      throw new Error("connection refused");
    }),
  );
  expect(await discoverCdpEndpoint([9222, 9444])).toBe("http://127.0.0.1:9444");
});

test("discoverCdpEndpoint returns null when nothing responds", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("connection refused");
  }));
  expect(await discoverCdpEndpoint([9222, 9333])).toBeNull();
});

test("discoverCdpEndpoint ignores non-CDP responders (no webSocketDebuggerUrl)", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ hello: "world" }) })));
  expect(await discoverCdpEndpoint([9222])).toBeNull();
});

describe("mint() fallback orchestration", () => {
  test("reuses a discovered browser that already holds clearance", async () => {
    const launch = vi.fn(() => Promise.resolve(session("cf_clearance=launched")));
    const m = new StubMinter({}, {
      discover: "http://127.0.0.1:9444",
      attach: async () => session("cf_clearance=fromDiscovered"),
      launch,
    });
    expect((await m.mint()).cookieHeader).toBe("cf_clearance=fromDiscovered");
    expect(launch).not.toHaveBeenCalled();
  });

  test("self-launches when the discovered browser attach THROWS (e.g. CDP protocol error)", async () => {
    const launch = vi.fn(() => Promise.resolve(session("cf_clearance=launched")));
    const m = new StubMinter({}, {
      discover: "http://127.0.0.1:9444",
      attach: async () => {
        throw new Error("Browser context management is not supported");
      },
      launch,
    });
    expect((await m.mint()).cookieHeader).toBe("cf_clearance=launched");
    expect(launch).toHaveBeenCalledTimes(1);
  });

  test("self-launches when the discovered browser has no clearance", async () => {
    const m = new StubMinter({}, {
      discover: "http://127.0.0.1:9444",
      attach: async () => session("JSESSIONID=x"), // no cf_clearance
      launch: () => Promise.resolve(session("cf_clearance=launched")),
    });
    expect((await m.mint()).cookieHeader).toBe("cf_clearance=launched");
  });

  test("explicit endpoint attach failure falls through to self-launch", async () => {
    const launch = vi.fn(() => Promise.resolve(session("cf_clearance=launched")));
    const m = new StubMinter({ cdpEndpoint: "http://127.0.0.1:1234" }, {
      attach: async () => {
        throw new Error("connect ECONNREFUSED");
      },
      launch,
    });
    expect((await m.mint()).cookieHeader).toBe("cf_clearance=launched");
    expect(launch).toHaveBeenCalledTimes(1);
  });
});
