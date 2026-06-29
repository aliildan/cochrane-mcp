import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CochraneService } from "../src/cochrane/service.js";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

// Fake http client that returns fixtures based on URL content.
const http = {
  async fetchText(url: string): Promise<string> {
    if (url.includes("getSuggestions")) return fx("suggest.json");
    if (url.includes("get-pico-data")) return fx("pico.json");
    if (url.includes("get-related-articles")) return fx("related-articles.json");
    if (url.includes("/central/doi/")) return fx("detail-trial.html");
    if (url.includes("/cdsr/doi/")) return fx("detail-review.html");
    if (url.includes("selectedType=central")) return fx("search-central.html");
    return fx("search-review.html");
  },
};

describe("CochraneService", () => {
  const svc = new CochraneService(http);
  test("search returns parsed results", async () => {
    const r = await svc.search({ query: "aspirin", type: "review", searchField: "title-abstract-keyword", orderBy: "relevancy", page: 1, resultsPerPage: 25 });
    expect(r.total).toBe(127);
    expect(r.items[0].doi).toBe("10.1002/14651858.CD012116.pub2");
  });
  test("getDetails enriches review with pico", async () => {
    const d = await svc.getDetails({ doi: "10.1002/14651858.CD012116.pub2" });
    expect(d.kind).toBe("review");
    if (d.kind === "review") expect(d.pico).toHaveProperty("Population");
  });
  test("getDetails on trial doi returns trial", async () => {
    const d = await svc.getDetails({ doi: "10.1002/central/CN-01510974" });
    expect(d.kind).toBe("trial");
  });
  test("suggest returns array", async () => {
    const s = await svc.suggest({ query: "asthma" });
    expect(s.suggestions[0].toLowerCase()).toContain("asthma");
  });
});
