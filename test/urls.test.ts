import { describe, expect, test } from "vitest";
import { buildSearchUrl, buildSuggestUrl, buildDetailUrl, buildJsonResourceUrl, detectContentType } from "../src/cochrane/urls.js";

describe("urls", () => {
  test("search url maps params and forces type selection", () => {
    const u = new URL(buildSearchUrl({ query: "aspirin", type: "central", searchField: "all-text", orderBy: "date-desc", page: 2, resultsPerPage: 50 }));
    expect(u.searchParams.get("searchText")).toBe("aspirin");
    expect(u.searchParams.get("selectedType")).toBe("central");
    expect(u.searchParams.get("searchBy")).toBe("6"); // all-text
    expect(u.searchParams.get("orderBy")).toBe("displayDate-true"); // date-desc
    expect(u.searchParams.get("cur")).toBe("2");
    expect(u.searchParams.get("resultPerPage")).toBe("50");
    expect(u.searchParams.get("forceTypeSelection")).toBe("true");
    expect(u.searchParams.get("p_p_id")).toBe("scolarissearchresultsportlet_WAR_scolarissearchresults");
  });
  test("year filters included when provided", () => {
    const u = new URL(buildSearchUrl({ query: "x", yearFrom: 2010, yearTo: 2020 }));
    expect(u.searchParams.get("publishYearFrom")).toBe("2010");
    expect(u.searchParams.get("publishYearTo")).toBe("2020");
  });
  test("suggest url has term", () => {
    expect(buildSuggestUrl("asth")).toContain("term=asth");
    expect(buildSuggestUrl("asth")).toContain("p_p_resource_id=getSuggestions");
  });
  test("detail url path by doi type", () => {
    expect(buildDetailUrl("10.1002/14651858.CD012116.pub2")).toBe("https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD012116.pub2/full");
    expect(buildDetailUrl("10.1002/central/CN-01510974")).toBe("https://www.cochranelibrary.com/central/doi/10.1002/central/CN-01510974/full");
  });
  test("detectContentType", () => {
    expect(detectContentType("10.1002/14651858.CD012116.pub2")).toBe("cdsr");
    expect(detectContentType("10.1002/central/CN-01510974")).toBe("central");
    expect(detectContentType("10.1002/14651858.CD012116.pub2")).not.toBe("central");
  });
  test("json resource url", () => {
    const u = new URL(buildJsonResourceUrl("get-pico-data", "10.1002/14651858.CD012116.pub2"));
    expect(u.searchParams.get("p_p_resource_id")).toBe("get-pico-data");
    expect(u.searchParams.get("doi")).toBe("10.1002/14651858.CD012116.pub2");
    expect(u.searchParams.get("p_p_lifecycle")).toBe("2");
  });
});
