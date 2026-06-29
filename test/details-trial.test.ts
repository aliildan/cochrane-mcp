import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseDetail, parseTrialDetail } from "../src/cochrane/details.js";

const trialHtml = readFileSync(new URL("./fixtures/detail-trial.html", import.meta.url), "utf8");

describe("trial detail", () => {
  test("parseTrialDetail degrades gracefully", () => {
    const d = parseTrialDetail(trialHtml, "10.1002/central/CN-01510974");
    expect(d.kind).toBe("trial");
    expect(d.title.toLowerCase()).toContain("aspirin");
    expect(Array.isArray(d.authors)).toBe(true);
    expect(d.urls.html).toContain("/central/doi/");
  });
  test("parseDetail dispatches by doi", () => {
    const d = parseDetail(trialHtml, "10.1002/central/CN-01510974");
    expect(d.kind).toBe("trial");
  });
});
