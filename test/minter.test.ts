import { afterEach, expect, test, vi } from "vitest";
import { cookiesToHeader, discoverCdpEndpoint } from "../src/engine/minter.js";

afterEach(() => vi.unstubAllGlobals());

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
