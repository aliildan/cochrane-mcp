import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseReviewDetail } from "../src/cochrane/details.js";

const html = readFileSync(new URL("./fixtures/detail-review.html", import.meta.url), "utf8");

describe("parseReviewDetail", () => {
  const d = parseReviewDetail(html, "10.1002/14651858.CD012116.pub2");
  test("core metadata from citation_* meta", () => {
    expect(d.kind).toBe("review");
    expect(d.title).toBe("Acetylsalicylic acid (aspirin) for schizophrenia");
    expect(d.journal).toBe("Cochrane Database of Systematic Reviews");
    expect(d.doi).toBe("10.1002/14651858.CD012116.pub2");
    expect(d.date).toBe("2019");
    expect(d.issn).toBe("1465-1858");
  });
  test("authors with institutions", () => {
    expect(d.authors.length).toBe(4);
    expect(d.authors[0].name).toBe("Lena Schmidt");
    expect(d.authors[0].institution).toContain("Bristol");
  });
  test("keywords parsed", () => {
    expect(d.keywords.join("; ")).toContain("Aspirin");
  });
  test("structured abstract sections", () => {
    expect(Object.keys(d.abstract)).toEqual(
      expect.arrayContaining(["background", "objectives", "mainResults", "authorsConclusions"]),
    );
    expect(d.abstract.background.length).toBeGreaterThan(50);
  });
  test("urls", () => {
    expect(d.urls.pdf).toContain("/pdf/");
  });
});
