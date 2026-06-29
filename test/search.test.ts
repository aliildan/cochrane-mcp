import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseSearchResults } from "../src/cochrane/search.js";

const reviewHtml = readFileSync(new URL("./fixtures/search-review.html", import.meta.url), "utf8");
const centralHtml = readFileSync(new URL("./fixtures/search-central.html", import.meta.url), "utf8");

describe("parseSearchResults", () => {
  test("parses review results", () => {
    const r = parseSearchResults(reviewHtml, 1, 25);
    expect(r.total).toBe(127);
    expect(r.items.length).toBe(25);
    const first = r.items[0];
    expect(first.title.toLowerCase()).toContain("aspirin");
    expect(first.doi).toBe("10.1002/14651858.CD012116.pub2");
    expect(first.url).toBe("https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD012116.pub2/full?highlightAbstract=aspirin");
    expect(first.authors).toContain("Schmidt");
    expect(first.rank).toBe(1);
  });
  test("typeCounts present for all types", () => {
    const r = parseSearchResults(reviewHtml, 1, 25);
    expect(r.typeCounts.review).toBe(127);
    expect(r.typeCounts.central).toBe(17202);
    expect(r.typeCounts.cca).toBe(18);
  });
  test("parses central (trials) results with /central/ links", () => {
    const r = parseSearchResults(centralHtml, 1, 25);
    expect(r.total).toBe(17202);
    expect(r.items[0].url).toContain("/central/doi/");
  });
});
