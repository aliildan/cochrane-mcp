import { describe, expect, test } from "vitest";
import { CochraneService } from "../src/cochrane/service.js";
import { HttpClient } from "../src/engine/httpClient.js";
import { CdpMinter } from "../src/engine/minter.js";

const live = process.env.COCHRANE_LIVE_TEST === "1";

describe.runIf(live)("live smoke", () => {
  const svc = new CochraneService(new HttpClient(new CdpMinter({ cdpEndpoint: process.env.COCHRANE_CDP_ENDPOINT })));
  test("search aspirin reviews returns hits", async () => {
    const r = await svc.search({ query: "aspirin", type: "review" });
    expect(r.total).toBeGreaterThan(0);
    expect(r.items.length).toBeGreaterThan(0);
  }, 120000);
  test("details for a known review", async () => {
    const d = await svc.getDetails({ doi: "10.1002/14651858.CD012116.pub2" });
    expect(d.title.toLowerCase()).toContain("aspirin");
  }, 120000);
});
