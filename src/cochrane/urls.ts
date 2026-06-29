import { ORDER_BY, SEARCH_FIELDS, type SearchUrlParams } from "../types.js";

const ORIGIN = "https://www.cochranelibrary.com";
const RESULTS_PORTLET = "scolarissearchresultsportlet_WAR_scolarissearchresults";
const SEARCH_PORTLET = "scolarissearchportlet_WAR_scolarissearch";
const CONTENT_PORTLET = "scolariscontentdisplay_WAR_scolariscontentdisplay";

export function buildSearchUrl(p: SearchUrlParams): string {
  const u = new URL(`${ORIGIN}/en/search`);
  const q = u.searchParams;
  q.set("searchText", p.query);
  q.set("searchBy", SEARCH_FIELDS[p.searchField ?? "title-abstract-keyword"]);
  q.set("selectedType", p.type ?? "review");
  q.set("resultPerPage", String(p.resultsPerPage ?? 25));
  q.set("searchType", "basic");
  q.set("orderBy", ORDER_BY[p.orderBy ?? "relevancy"]);
  q.set("forceTypeSelection", "true");
  q.set("cur", String(p.page ?? 1));
  if (p.yearFrom != null) q.set("publishYearFrom", String(p.yearFrom));
  if (p.yearTo != null) q.set("publishYearTo", String(p.yearTo));
  q.set("p_p_id", RESULTS_PORTLET);
  q.set("p_p_lifecycle", "0");
  q.set("p_p_state", "normal");
  q.set("p_p_mode", "view");
  return u.toString();
}

export function buildSuggestUrl(term: string): string {
  const u = new URL(`${ORIGIN}/en/search`);
  const q = u.searchParams;
  q.set("p_p_id", SEARCH_PORTLET);
  q.set("p_p_lifecycle", "2");
  q.set("p_p_state", "normal");
  q.set("p_p_mode", "view");
  q.set("p_p_resource_id", "getSuggestions");
  q.set("p_p_cacheability", "cacheLevelPage");
  q.set(`_${SEARCH_PORTLET}_searchText`, term);
  q.set(`_${SEARCH_PORTLET}_resultPerPage`, "25");
  q.set(`_${SEARCH_PORTLET}_searchType`, "basic");
  q.set(`_${SEARCH_PORTLET}_searchBy`, "1");
  q.set(`_${SEARCH_PORTLET}_selectedType`, "review");
  q.set(`_${SEARCH_PORTLET}_orderBy`, "relevancy");
  q.set("term", term);
  return u.toString();
}

export function detectContentType(doi: string): "cdsr" | "central" | "cca" | "editorial" {
  const d = doi.toLowerCase();
  if (d.includes("/central/") || /\bcn-\d/i.test(d)) return "central";
  if (d.includes("cca.") || d.includes("/cca")) return "cca";
  if (/\.ed\d/i.test(d)) return "editorial";
  return "cdsr"; // reviews + protocols
}

export function buildDetailUrl(doi: string): string {
  const t = detectContentType(doi);
  const seg = t === "central" ? "central" : t === "cca" ? "cca" : "cdsr";
  return `${ORIGIN}/${seg}/doi/${doi}/full`;
}

export function buildJsonResourceUrl(resourceId: string, doi: string): string {
  const u = new URL(`${ORIGIN}/content`);
  const q = u.searchParams;
  q.set("p_p_id", CONTENT_PORTLET);
  q.set("p_p_lifecycle", "2");
  q.set("p_p_state", "exclusive");
  q.set("p_p_mode", "view");
  q.set("p_p_resource_id", resourceId);
  q.set("doi", doi);
  return u.toString();
}
