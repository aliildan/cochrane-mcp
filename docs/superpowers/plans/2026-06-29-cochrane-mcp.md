# Cochrane Library MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript stdio MCP server that searches the Cochrane Library across all content types, returns result lists, and fetches rich type-aware details — distributed as a Claude Code plugin.

**Architecture:** Mostly plain `fetch` + `cheerio` HTML/JSON parsing. A real browser (via CDP) is touched **only** to mint a Cloudflare `cf_clearance` cookie, which is then replayed in fast direct `fetch` calls (same machine/IP, same UA). On a 412/challenge the cookie is auto-refreshed once.

**Tech Stack:** Node ≥ 18, TypeScript (ESM), `@modelcontextprotocol/sdk`, `cheerio`, `zod`, `patchright` (CDP), `vitest`. Optional `impit` fallback.

## Global Constraints

- Node ≥ 18 (native `fetch`), ESM (`"type": "module"`), TypeScript strict mode.
- All HTTP requests send a browser `User-Agent` + the minted `Cookie`; cookie is IP+UA bound — minting browser and fetches run on the same host.
- Search URLs MUST include `forceTypeSelection=true` or `selectedType` is ignored.
- Content types (`selectedType`): `review`, `protocol`, `central`, `editorial`, `specialcollections`, `cca`.
- Never crash a tool; return MCP-formatted errors.
- Real fixtures already committed under `test/fixtures/` (search-review.html, search-central.html, detail-review.html, detail-trial.html, pico.json, related-articles.json, suggest.json). Parser tests run offline against these.
- Spec: `docs/superpowers/specs/2026-06-29-cochrane-mcp-design.md`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/index.ts`, `test/smoke.test.ts`

**Interfaces:**
- Produces: a buildable/testable TS ESM project; `npm test` and `npm run build` work.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "cochrane-mcp",
  "version": "0.1.0",
  "description": "MCP server for searching the Cochrane Library and fetching review/trial details.",
  "type": "module",
  "bin": { "cochrane-mcp": "dist/index.js" },
  "files": ["dist", "skills", "commands", ".claude-plugin", ".mcp.json", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -w -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "cheerio": "^1.0.0",
    "patchright": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "engines": { "node": ">=18" }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts` and `.gitignore`**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 20000 } });
```

`.gitignore`:
```
node_modules/
dist/
*.log
.cochrane-profile/
```

- [ ] **Step 4: Create placeholder `src/index.ts` and a sample test**

`src/index.ts`:
```ts
export const VERSION = "0.1.0";
```

`test/smoke.test.ts`:
```ts
import { expect, test } from "vitest";
import { VERSION } from "../src/index.js";
test("version is set", () => { expect(VERSION).toBe("0.1.0"); });
```

- [ ] **Step 5: Install, build, test**

Run: `npm install && npm run build && npm test`
Expected: build succeeds; 1 test passes.

- [ ] **Step 6: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold cochrane-mcp TypeScript project"
```

---

### Task 2: Types and URL builders

**Files:**
- Create: `src/types.ts`, `src/cochrane/urls.ts`, `test/urls.test.ts`

**Interfaces:**
- Produces:
  - `ContentType = "review"|"protocol"|"central"|"editorial"|"specialcollections"|"cca"`
  - `SearchField`, `OrderBy` string-literal unions (see code).
  - `buildSearchUrl(p: SearchUrlParams): string`
  - `buildSuggestUrl(term: string): string`
  - `buildDetailUrl(doi: string): string`
  - `buildJsonResourceUrl(resourceId: string, doi: string): string`
  - `detectContentType(doi: string): "cdsr"|"central"|"cca"|"editorial"`
  - zod schemas `SearchInput`, `DetailsInput`, `SuggestInput`.

- [ ] **Step 1: Write the failing test** — `test/urls.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { buildSearchUrl, buildSuggestUrl, buildDetailUrl, buildJsonResourceUrl, detectContentType } from "../src/cochrane/urls.js";

describe("urls", () => {
  test("search url maps params and forces type selection", () => {
    const u = new URL(buildSearchUrl({ query: "aspirin", type: "central", searchField: "all-text", orderBy: "date-desc", page: 2, resultsPerPage: 50 }));
    expect(u.searchParams.get("searchText")).toBe("aspirin");
    expect(u.searchParams.get("selectedType")).toBe("central");
    expect(u.searchParams.get("searchBy")).toBe("6");           // all-text
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/urls.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/types.ts`**

```ts
import { z } from "zod";

export const CONTENT_TYPES = ["review", "protocol", "central", "editorial", "specialcollections", "cca"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const SEARCH_FIELDS = {
  "title-abstract-keyword": "1",
  "record-title": "2",
  "abstract": "3",
  "author": "4",
  "keyword": "5",
  "all-text": "6",
  "source": "8",
  "doi": "9",
  "accession-number": "10",
  "cochrane-group": "12",
} as const;
export type SearchField = keyof typeof SEARCH_FIELDS;

export const ORDER_BY = {
  "relevancy": "relevancy",
  "title-asc": "title_sortable-false",
  "title-desc": "title_sortable-true",
  "date-desc": "displayDate-true",
  "date-asc": "displayDate-false",
} as const;
export type OrderBy = keyof typeof ORDER_BY;

export interface SearchUrlParams {
  query: string;
  type?: ContentType;
  searchField?: SearchField;
  orderBy?: OrderBy;
  page?: number;
  resultsPerPage?: number;
  yearFrom?: number;
  yearTo?: number;
}

export interface SearchResultItem {
  rank: number;
  title: string;
  doi: string | null;
  url: string | null;
  authors: string;
  contentType: string;
  stage: string | null;
  date: string | null;
  access: string | null;
}

export interface TypeCounts { [k: string]: number; }

export interface SearchResults {
  total: number;
  page: number;
  resultsPerPage: number;
  typeCounts: TypeCounts;
  items: SearchResultItem[];
}

export interface Author { name: string; institution?: string; email?: string; }

export interface ReviewDetails {
  kind: "review";
  doi: string;
  title: string;
  authors: Author[];
  journal: string | null;
  issue: string | null;
  date: string | null;
  onlineDate: string | null;
  issn: string | null;
  language: string | null;
  keywords: string[];
  abstract: Record<string, string>;
  plainLanguageSummary: string | null;
  pico: unknown | null;
  relatedArticles: unknown | null;
  urls: { html: string; abstract: string | null; pdf: string | null };
}

export interface TrialDetails {
  kind: "trial";
  doi: string;
  title: string;
  authors: Author[];
  source: string | null;
  date: string | null;
  keywords: string[];
  abstract: string | null;
  urls: { html: string; pdf: string | null };
}

export type Details = ReviewDetails | TrialDetails;

export const SearchInput = z.object({
  query: z.string().min(1),
  type: z.enum(CONTENT_TYPES).default("review"),
  searchField: z.enum(Object.keys(SEARCH_FIELDS) as [SearchField, ...SearchField[]]).default("title-abstract-keyword"),
  orderBy: z.enum(Object.keys(ORDER_BY) as [OrderBy, ...OrderBy[]]).default("relevancy"),
  page: z.number().int().min(1).default(1),
  resultsPerPage: z.number().int().min(1).max(100).default(25),
  yearFrom: z.number().int().optional(),
  yearTo: z.number().int().optional(),
});
export const DetailsInput = z.object({ doi: z.string().min(3) });
export const SuggestInput = z.object({ query: z.string().min(1) });
```

- [ ] **Step 4: Write `src/cochrane/urls.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/urls.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/cochrane/urls.ts test/urls.test.ts
git commit -m "feat: url builders, content-type detection, and shared types"
```

---

### Task 3: Search results parser

**Files:**
- Create: `src/cochrane/search.ts`, `test/search.test.ts`

**Interfaces:**
- Consumes: `SearchResults`, `SearchResultItem`, `TypeCounts` from `types.ts`.
- Produces: `parseSearchResults(html: string, page: number, resultsPerPage: number): SearchResults`.

- [ ] **Step 1: Write the failing test** — `test/search.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/search.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/cochrane/search.ts`**

```ts
import * as cheerio from "cheerio";
import type { SearchResultItem, SearchResults, TypeCounts } from "../types.js";

const ORIGIN = "https://www.cochranelibrary.com";

function abs(href: string | undefined): string | null {
  if (!href) return null;
  return href.startsWith("http") ? href : ORIGIN + href;
}

function doiFromHref(href: string | null): string | null {
  if (!href) return null;
  const m = href.match(/\/doi\/(10\.\d{4}\/[^/?]+(?:\/[^/?]+)?)\/full/i);
  return m ? m[1] : null;
}

export function parseSearchResults(html: string, page: number, resultsPerPage: number): SearchResults {
  const $ = cheerio.load(html);

  const totalText = $(".results-number").first().text().replace(/[^\d]/g, "");
  const total = totalText ? parseInt(totalText, 10) : 0;

  const typeCounts: TypeCounts = {};
  $('a[href*="selectedType="]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/selectedType=([a-z_]+)/i);
    if (!m) return;
    const type = m[1];
    if (type in typeCounts) return;
    const num = ($(el).text().match(/([\d,]+)\s*$/) || [])[1];
    if (num) typeCounts[type] = parseInt(num.replace(/,/g, ""), 10);
  });

  const items: SearchResultItem[] = [];
  $(".search-results-item").each((i, el) => {
    const $el = $(el);
    const $a = $el.find(".result-title a").first();
    const href = abs($a.attr("href"));
    const dataDoi = $el.find("[data-article-doi]").first().attr("data-article-doi") || null;
    items.push({
      rank: parseInt($el.find(".search-results-item-tools label").first().text().trim(), 10) || i + 1,
      title: $a.text().replace(/\s+/g, " ").trim(),
      doi: dataDoi || doiFromHref(href),
      url: href,
      authors: $el.find(".search-result-authors").text().replace(/\s+/g, " ").trim(),
      contentType: $el.find(".search-result-type").text().replace(/\s+/g, " ").trim(),
      stage: $el.find(".search-result-stage").text().replace(/\s+/g, " ").trim() || null,
      date: $el.find(".search-result-date").text().replace(/\s+/g, " ").trim() || null,
      access: $el.find(".access-label").first().text().replace(/\s+/g, " ").trim() || null,
    });
  });

  return { total, page, resultsPerPage, typeCounts, items };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/search.test.ts`
Expected: PASS (3 tests). If `date` assertions ever fail, inspect the fixture with a quick `grep -o 'search-result-date[^"]*' test/fixtures/search-review.html` and adjust the selector — `date` is best-effort/optional.

- [ ] **Step 5: Commit**

```bash
git add src/cochrane/search.ts test/search.test.ts
git commit -m "feat: parse search results list, total, and per-type counts"
```

---

### Task 4: Review detail parser

**Files:**
- Create: `src/cochrane/details.ts`, `test/details-review.test.ts`

**Interfaces:**
- Consumes: `ReviewDetails`, `Author` from `types.ts`.
- Produces (this task): `parseReviewDetail(html: string, doi: string): ReviewDetails`, plus the meta helper `collectCitationMeta($)`.

- [ ] **Step 1: Write the failing test** — `test/details-review.test.ts`

```ts
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
      expect.arrayContaining(["background", "objectives", "mainResults", "authorsConclusions"])
    );
    expect(d.abstract.background.length).toBeGreaterThan(50);
  });
  test("urls", () => {
    expect(d.urls.pdf).toContain("/pdf/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/details-review.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/cochrane/details.ts`**

```ts
import * as cheerio from "cheerio";
import type { Author, ReviewDetails } from "../types.js";

type C = cheerio.CheerioAPI;

export function collectCitationMeta($: C): Record<string, string[]> {
  const meta: Record<string, string[]> = {};
  $('meta[name^="citation_"]').each((_, el) => {
    const name = $(el).attr("name")!;
    const content = $(el).attr("content") ?? "";
    (meta[name] ||= []).push(content);
  });
  return meta;
}

const one = (m: Record<string, string[]>, k: string): string | null => (m[k]?.[0] ?? null);

const ABSTRACT_KEYS: Record<string, string> = {
  "background": "background",
  "objectives": "objectives",
  "search methods": "searchMethods",
  "selection criteria": "selectionCriteria",
  "data collection and analysis": "dataCollectionAnalysis",
  "main results": "mainResults",
  "authors' conclusions": "authorsConclusions",
  "authors’ conclusions": "authorsConclusions",
};

export function parseReviewDetail(html: string, doi: string): ReviewDetails {
  const $ = cheerio.load(html);
  const m = collectCitationMeta($);

  const names = m["citation_author"] ?? [];
  const insts = m["citation_author_institution"] ?? [];
  const authors: Author[] = names.map((name, i) => ({
    name,
    institution: insts[i] || undefined,
  }));
  const email = one(m, "citation_author_email");
  if (email && authors[0]) authors[0].email = email;

  const keywords = (one(m, "citation_keywords") ?? "")
    .split(";").map((s) => s.trim()).filter(Boolean);

  // Structured abstract + plain language summary: iterate .abstract_title headings.
  const abstract: Record<string, string> = {};
  let pls: string | null = null;
  $(".abstract_title").each((_, h) => {
    const heading = $(h).text().replace(/\s+/g, " ").trim().toLowerCase();
    const body = $(h).nextUntil(".abstract_title").text().replace(/\s+/g, " ").trim();
    const key = ABSTRACT_KEYS[heading];
    if (key) abstract[key] = body;
    else if (body && !pls) pls = body; // the non-standard heading block is the PLS
  });

  return {
    kind: "review",
    doi: one(m, "citation_doi") ?? doi,
    title: one(m, "citation_title") ?? $("h1").first().text().trim(),
    authors,
    journal: one(m, "citation_journal_title"),
    issue: one(m, "citation_issue"),
    date: one(m, "citation_date"),
    onlineDate: one(m, "citation_online_date"),
    issn: one(m, "citation_issn"),
    language: one(m, "citation_language"),
    keywords,
    abstract,
    plainLanguageSummary: pls,
    pico: null,
    relatedArticles: null,
    urls: {
      html: one(m, "citation_fulltext_html_url") ?? `https://www.cochranelibrary.com/cdsr/doi/${doi}/full`,
      abstract: one(m, "citation_abstract_html_url"),
      pdf: one(m, "citation_pdf_url"),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/details-review.test.ts`
Expected: PASS (5 tests). If `abstract.background` is empty, the `.abstract_title` siblings differ — inspect with `grep -o 'abstract_title[^<]*' test/fixtures/detail-review.html | head` and adjust `nextUntil` target accordingly.

- [ ] **Step 5: Commit**

```bash
git add src/cochrane/details.ts test/details-review.test.ts
git commit -m "feat: parse review detail (citation meta, authors, structured abstract, PLS)"
```

---

### Task 5: Trial detail parser + dispatch

**Files:**
- Modify: `src/cochrane/details.ts`
- Create: `test/details-trial.test.ts`

**Interfaces:**
- Consumes: `Details`, `TrialDetails` from `types.ts`; `detectContentType` from `urls.ts`.
- Produces: `parseTrialDetail(html: string, doi: string): TrialDetails`; `parseDetail(html: string, doi: string): Details` (dispatches by `detectContentType`).

- [ ] **Step 1: Write the failing test** — `test/details-trial.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/details-trial.test.ts`
Expected: FAIL (`parseTrialDetail`/`parseDetail` not exported).

- [ ] **Step 3: Append to `src/cochrane/details.ts`**

```ts
import type { Details, TrialDetails } from "../types.js";
import { detectContentType } from "./urls.js";

export function parseTrialDetail(html: string, doi: string): TrialDetails {
  const $ = cheerio.load(html);
  const m = collectCitationMeta($);
  const authors = (m["citation_author"] ?? []).map((name) => ({ name }));
  const keywords = (one(m, "citation_keywords") ?? "")
    .split(";").map((s) => s.trim()).filter(Boolean);
  // Trials have no .abstract_title sections; take the abstract container text if present.
  const abstractText = $(".abstract, .full_abstract").first().text().replace(/\s+/g, " ").trim();
  return {
    kind: "trial",
    doi: one(m, "citation_doi") ?? doi,
    title: one(m, "citation_title") ?? $("h1").first().text().trim(),
    authors,
    source: one(m, "citation_journal_title"),
    date: one(m, "citation_online_date") ?? one(m, "citation_date"),
    keywords,
    abstract: abstractText || null,
    urls: {
      html: one(m, "citation_fulltext_html_url") ?? `https://www.cochranelibrary.com/central/doi/${doi}/full`,
      pdf: one(m, "citation_pdf_url"),
    },
  };
}

export function parseDetail(html: string, doi: string): Details {
  return detectContentType(doi) === "central"
    ? parseTrialDetail(html, doi)
    : parseReviewDetail(html, doi);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/details-trial.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cochrane/details.ts test/details-trial.test.ts
git commit -m "feat: trial detail parser and doi-based detail dispatch"
```

---

### Task 6: Suggest + JSON side-APIs (PICO, related)

**Files:**
- Create: `src/cochrane/suggest.ts`, `src/cochrane/jsonApi.ts`, `test/suggest.test.ts`, `test/jsonApi.test.ts`

**Interfaces:**
- Produces:
  - `parseSuggestions(body: string): string[]`
  - `parsePico(body: string): unknown`, `parseRelated(body: string): unknown` (safe `JSON.parse`, return `null` on failure).

- [ ] **Step 1: Write the failing tests**

`test/suggest.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseSuggestions } from "../src/cochrane/suggest.js";
const body = readFileSync(new URL("./fixtures/suggest.json", import.meta.url), "utf8");
test("parses suggestion array", () => {
  const s = parseSuggestions(body);
  expect(Array.isArray(s)).toBe(true);
  expect(s[0].toLowerCase()).toContain("asthma");
});
test("bad body returns empty array", () => { expect(parseSuggestions("oops")).toEqual([]); });
```

`test/jsonApi.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parsePico, parseRelated } from "../src/cochrane/jsonApi.js";
const pico = readFileSync(new URL("./fixtures/pico.json", import.meta.url), "utf8");
const related = readFileSync(new URL("./fixtures/related-articles.json", import.meta.url), "utf8");
test("pico parses to object with Population", () => {
  const p = parsePico(pico) as Record<string, unknown>;
  expect(p).toHaveProperty("Population");
});
test("related parses", () => {
  const r = parseRelated(related) as Record<string, unknown>;
  expect(r).toHaveProperty("relatedPodcasts");
});
test("bad json returns null", () => { expect(parsePico("nope")).toBeNull(); });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/suggest.test.ts test/jsonApi.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `src/cochrane/suggest.ts` and `src/cochrane/jsonApi.ts`**

`src/cochrane/suggest.ts`:
```ts
export function parseSuggestions(body: string): string[] {
  try {
    const v = JSON.parse(body.trim());
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
```

`src/cochrane/jsonApi.ts`:
```ts
function safeJson(body: string): unknown {
  try { return JSON.parse(body.trim()); } catch { return null; }
}
export function parsePico(body: string): unknown { return safeJson(body); }
export function parseRelated(body: string): unknown { return safeJson(body); }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/suggest.test.ts test/jsonApi.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cochrane/suggest.ts src/cochrane/jsonApi.ts test/suggest.test.ts test/jsonApi.test.ts
git commit -m "feat: parse autosuggest, PICO, and related-articles JSON"
```

---

### Task 7: Session store + HTTP client with challenge detection

**Files:**
- Create: `src/engine/session.ts`, `src/engine/httpClient.ts`, `test/httpClient.test.ts`

**Interfaces:**
- Produces:
  - `interface Session { cookieHeader: string; userAgent: string; mintedAt: number; }`
  - `interface Minter { mint(): Promise<Session>; }`
  - `isChallenge(status: number, body: string): boolean`
  - `class HttpClient { constructor(minter: Minter); fetchText(url: string, accept?: string): Promise<string>; }`
  - `class CloudflareChallengeError extends Error`

- [ ] **Step 1: Write the failing test** — `test/httpClient.test.ts`

```ts
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
    const fetchMock = vi.fn()
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/httpClient.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `src/engine/session.ts`**

```ts
export interface Session {
  cookieHeader: string;
  userAgent: string;
  mintedAt: number;
}
export interface Minter {
  mint(): Promise<Session>;
}
```

- [ ] **Step 4: Write `src/engine/httpClient.ts`**

```ts
import type { Minter, Session } from "./session.js";

export class CloudflareChallengeError extends Error {
  constructor(url: string) {
    super(
      `Cloudflare challenge could not be cleared for ${url}. ` +
        `Ensure a real Chrome is reachable (set COCHRANE_CDP_ENDPOINT or allow auto-launch) ` +
        `and solve the one-time challenge in the browser window.`,
    );
    this.name = "CloudflareChallengeError";
  }
}

const CHALLENGE_MARKERS = /just a moment|unable to send a cookie|cf-challenge|challenge-platform/i;

export function isChallenge(status: number, body: string): boolean {
  if (status === 200) return false;
  if (status === 412 || status === 403 || status === 503) {
    return body.length < 8000 && CHALLENGE_MARKERS.test(body);
  }
  return false;
}

export class HttpClient {
  private session: Session | null = null;
  constructor(private readonly minter: Minter) {}

  private async ensureSession(): Promise<Session> {
    if (!this.session) this.session = await this.minter.mint();
    return this.session;
  }

  async fetchText(url: string, accept = "text/html,application/json"): Promise<string> {
    let session = await this.ensureSession();
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, {
        headers: { "User-Agent": session.userAgent, Cookie: session.cookieHeader, Accept: accept },
        redirect: "follow",
      });
      const body = await res.text();
      if (!isChallenge(res.status, body)) return body;
      // refresh cookie once and retry
      this.session = await this.minter.mint();
      session = this.session;
    }
    throw new CloudflareChallengeError(url);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/httpClient.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/engine/session.ts src/engine/httpClient.ts test/httpClient.test.ts
git commit -m "feat: http client with cloudflare challenge detection and refresh-retry"
```

---

### Task 8: Cookie minter (CDP attach + auto-launch)

**Files:**
- Create: `src/engine/minter.ts`, `test/minter.test.ts`

**Interfaces:**
- Consumes: `Minter`, `Session`.
- Produces:
  - `cookiesToHeader(cookies: {name:string;value:string}[]): string`
  - `class CdpMinter implements Minter` with options `{ cdpEndpoint?: string; profileDir?: string; channel?: string; homepage?: string; warmUrl?: string; timeoutMs?: number; }`.

- [ ] **Step 1: Write the failing test** (pure helper only — browser paths covered by the gated live test) — `test/minter.test.ts`

```ts
import { expect, test } from "vitest";
import { cookiesToHeader } from "../src/engine/minter.js";
test("cookiesToHeader joins name=value pairs", () => {
  expect(cookiesToHeader([{ name: "cf_clearance", value: "abc" }, { name: "__cf_bm", value: "xy" }]))
    .toBe("cf_clearance=abc; __cf_bm=xy");
});
test("cookiesToHeader skips empties", () => {
  expect(cookiesToHeader([{ name: "a", value: "" }, { name: "b", value: "2" }])).toBe("b=2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/minter.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/engine/minter.ts`**

```ts
import { chromium, type BrowserContext } from "patchright";
import type { Minter, Session } from "./session.js";

const ORIGIN = "https://www.cochranelibrary.com";

export function cookiesToHeader(cookies: { name: string; value: string }[]): string {
  return cookies.filter((c) => c.value).map((c) => `${c.name}=${c.value}`).join("; ");
}

export interface CdpMinterOptions {
  cdpEndpoint?: string;        // e.g. http://127.0.0.1:9444 — attach mode
  profileDir?: string;         // auto-launch persistent profile
  channel?: string;            // default "chrome"
  warmUrl?: string;            // a search URL to trigger clearance
  timeoutMs?: number;          // wait for cf_clearance
}

export class CdpMinter implements Minter {
  constructor(private readonly opts: CdpMinterOptions = {}) {}

  async mint(): Promise<Session> {
    return this.opts.cdpEndpoint ? this.mintViaAttach(this.opts.cdpEndpoint) : this.mintViaLaunch();
  }

  private async readSession(ctx: BrowserContext): Promise<Session> {
    const cookies = await ctx.cookies(ORIGIN);
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const userAgent = await page.evaluate(() => navigator.userAgent);
    return { cookieHeader: cookiesToHeader(cookies), userAgent, mintedAt: Date.now() };
  }

  private async mintViaAttach(endpoint: string): Promise<Session> {
    const browser = await chromium.connectOverCDP(endpoint);
    try {
      const ctx = browser.contexts()[0];
      if (!ctx) throw new Error("No browser context found over CDP");
      return await this.readSession(ctx);
    } finally {
      await browser.close();
    }
  }

  private async mintViaLaunch(): Promise<Session> {
    const profileDir = this.opts.profileDir ?? "./.cochrane-profile";
    const warmUrl = this.opts.warmUrl ?? `${ORIGIN}/en/search?searchText=cochrane&searchBy=1&selectedType=review&forceTypeSelection=true&p_p_id=scolarissearchresultsportlet_WAR_scolarissearchresults&p_p_lifecycle=0`;
    const timeoutMs = this.opts.timeoutMs ?? 60000;
    const ctx = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: this.opts.channel ?? "chrome",
      viewport: { width: 1280, height: 900 },
    });
    try {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
      await page.goto(warmUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const cookies = await ctx.cookies(ORIGIN);
        if (cookies.some((c) => c.name === "cf_clearance")) break;
        await page.waitForTimeout(1500);
      }
      return await this.readSession(ctx);
    } finally {
      await ctx.close();
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/minter.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Build to verify the patchright types compile**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/engine/minter.ts test/minter.test.ts
git commit -m "feat: cookie minter via CDP attach and auto-launch"
```

---

### Task 9: Cochrane service + MCP server wiring + CLI entry

**Files:**
- Create: `src/cochrane/service.ts`, `src/server.ts`
- Modify: `src/index.ts`
- Create: `test/service.test.ts`

**Interfaces:**
- Consumes: `HttpClient`, all parsers, url builders, zod schemas.
- Produces:
  - `class CochraneService { constructor(http: { fetchText(url:string, accept?:string): Promise<string> }); search(input): Promise<SearchResults>; getDetails(input): Promise<Details>; suggest(input): Promise<{suggestions:string[]}>; }`
  - `createServer(service: CochraneService): McpServer`
  - `src/index.ts` bootstraps stdio transport.

- [ ] **Step 1: Write the failing test** — `test/service.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/service.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/cochrane/service.ts`**

```ts
import { z } from "zod";
import { DetailsInput, SearchInput, SuggestInput, type Details, type SearchResults } from "../types.js";
import { buildDetailUrl, buildJsonResourceUrl, buildSearchUrl, buildSuggestUrl, detectContentType } from "./urls.js";
import { parseSearchResults } from "./search.js";
import { parseDetail } from "./details.js";
import { parseSuggestions } from "./suggest.js";
import { parsePico, parseRelated } from "./jsonApi.js";

interface Http { fetchText(url: string, accept?: string): Promise<string>; }

export class CochraneService {
  constructor(private readonly http: Http) {}

  async search(input: z.input<typeof SearchInput>): Promise<SearchResults> {
    const p = SearchInput.parse(input);
    const html = await this.http.fetchText(buildSearchUrl(p));
    return parseSearchResults(html, p.page, p.resultsPerPage);
  }

  async getDetails(input: z.input<typeof DetailsInput>): Promise<Details> {
    const { doi } = DetailsInput.parse(input);
    const html = await this.http.fetchText(buildDetailUrl(doi));
    const details = parseDetail(html, doi);
    if (details.kind === "review" && detectContentType(doi) === "cdsr") {
      const [pico, related] = await Promise.all([
        this.http.fetchText(buildJsonResourceUrl("get-pico-data", doi), "application/json").then(parsePico).catch(() => null),
        this.http.fetchText(buildJsonResourceUrl("get-related-articles", doi), "application/json").then(parseRelated).catch(() => null),
      ]);
      details.pico = pico;
      details.relatedArticles = related;
    }
    return details;
  }

  async suggest(input: z.input<typeof SuggestInput>): Promise<{ suggestions: string[] }> {
    const { query } = SuggestInput.parse(input);
    const body = await this.http.fetchText(buildSuggestUrl(query), "application/json");
    return { suggestions: parseSuggestions(body) };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write `src/server.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CONTENT_TYPES, SEARCH_FIELDS, ORDER_BY } from "./types.js";
import type { CochraneService } from "./cochrane/service.js";

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }] });

export function createServer(service: CochraneService): McpServer {
  const server = new McpServer({ name: "cochrane-mcp", version: "0.1.0" });

  server.tool(
    "cochrane_search",
    "Search the Cochrane Library. Returns total, per-type counts, and a page of results.",
    {
      query: z.string().describe("Search terms"),
      type: z.enum(CONTENT_TYPES).default("review").describe("Content type to list"),
      searchField: z.enum(Object.keys(SEARCH_FIELDS) as [keyof typeof SEARCH_FIELDS]).default("title-abstract-keyword"),
      orderBy: z.enum(Object.keys(ORDER_BY) as [keyof typeof ORDER_BY]).default("relevancy"),
      page: z.number().int().min(1).default(1),
      resultsPerPage: z.number().int().min(1).max(100).default(25),
      yearFrom: z.number().int().optional(),
      yearTo: z.number().int().optional(),
    },
    async (args) => {
      try { return json(await service.search(args)); } catch (e) { return fail(e); }
    },
  );

  server.tool(
    "cochrane_get_details",
    "Fetch full details for a Cochrane DOI (review: metadata + abstract + PLS + PICO; trial: metadata).",
    { doi: z.string().describe("DOI, e.g. 10.1002/14651858.CD012116.pub2") },
    async (args) => {
      try { return json(await service.getDetails(args)); } catch (e) { return fail(e); }
    },
  );

  server.tool(
    "cochrane_suggest_terms",
    "Autocomplete suggestions for a partial query.",
    { query: z.string().describe("Partial search term") },
    async (args) => {
      try { return json(await service.suggest(args)); } catch (e) { return fail(e); }
    },
  );

  return server;
}
```

- [ ] **Step 6: Write `src/index.ts` (bootstrap)**

```ts
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CochraneService } from "./cochrane/service.js";
import { HttpClient } from "./engine/httpClient.js";
import { CdpMinter } from "./engine/minter.js";
import { createServer } from "./server.js";

export const VERSION = "0.1.0";

async function main() {
  const minter = new CdpMinter({
    cdpEndpoint: process.env.COCHRANE_CDP_ENDPOINT || undefined,
    profileDir: process.env.COCHRANE_PROFILE_DIR || undefined,
  });
  const http = new HttpClient(minter);
  const service = new CochraneService(http);
  const server = createServer(service);
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 7: Build, test, and smoke-run the server**

Run: `npm run build && npm test`
Expected: all tests pass; build clean.
Run: `node dist/index.js <<< ''` then Ctrl-C — should start without throwing (it will wait on stdio).

- [ ] **Step 8: Commit**

```bash
git add src/cochrane/service.ts src/server.ts src/index.ts test/service.test.ts
git commit -m "feat: cochrane service, MCP tool wiring, and stdio bootstrap"
```

---

### Task 10: Gated live smoke test

**Files:**
- Create: `test/live.smoke.test.ts`

**Interfaces:**
- Consumes: `CdpMinter`, `HttpClient`, `CochraneService`. Runs only when `COCHRANE_LIVE_TEST=1`.

- [ ] **Step 1: Write the gated live test**

```ts
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
```

- [ ] **Step 2: Run gated test (requires a running Chrome with remote debugging)**

Run (only if you have a debug Chrome): `COCHRANE_LIVE_TEST=1 COCHRANE_CDP_ENDPOINT=http://127.0.0.1:9444 npx vitest run test/live.smoke.test.ts`
Expected: PASS, or skipped when the env var is unset.
Verify default skip: `npx vitest run test/live.smoke.test.ts` → 0 tests run.

- [ ] **Step 3: Commit**

```bash
git add test/live.smoke.test.ts
git commit -m "test: gated live smoke test for search and details"
```

---

### Task 11: Claude Code plugin + marketplace manifests

**Files:**
- Create: `.mcp.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

**Interfaces:**
- Produces: installable plugin that registers the `cochrane` MCP server.

- [ ] **Step 1: Create `.mcp.json` (manual-install mirror)**

```json
{
  "mcpServers": {
    "cochrane": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": { "COCHRANE_CDP_ENDPOINT": "" }
    }
  }
}
```

- [ ] **Step 2: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "cochrane",
  "version": "0.1.0",
  "description": "Search the Cochrane Library (reviews, protocols, trials, clinical answers, editorials) and fetch rich details.",
  "author": { "name": "cochrane-mcp" },
  "mcpServers": {
    "cochrane": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/index.js"],
      "env": { "COCHRANE_CDP_ENDPOINT": "" }
    }
  }
}
```

- [ ] **Step 3: Create `.claude-plugin/marketplace.json`**

```json
{
  "name": "cochrane-marketplace",
  "owner": { "name": "cochrane-mcp" },
  "plugins": [
    { "name": "cochrane", "source": "./", "description": "Cochrane Library search + details MCP." }
  ]
}
```

- [ ] **Step 4: Validate JSON**

Run: `node -e "for (const f of ['.mcp.json','.claude-plugin/plugin.json','.claude-plugin/marketplace.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('valid')"`
Expected: prints `valid`.

- [ ] **Step 5: Commit**

```bash
git add .mcp.json .claude-plugin/
git commit -m "feat: claude code plugin and marketplace manifests"
```

---

### Task 12: Usage skill, /cochrane command, and README

**Files:**
- Create: `skills/cochrane/SKILL.md`, `commands/cochrane.md`, `README.md`

**Interfaces:**
- Produces: model-facing usage guidance + a slash command + human docs.

- [ ] **Step 1: Create `skills/cochrane/SKILL.md`**

```markdown
---
name: cochrane
description: Use when answering clinical/health evidence questions or asked about systematic reviews, randomised trials, or "what does Cochrane say" — searches the Cochrane Library and fetches review/trial details.
---

# Cochrane Library

Use the `cochrane_*` MCP tools for evidence from the Cochrane Library.

## Workflow
1. `cochrane_suggest_terms` (optional) to refine vague terms.
2. `cochrane_search` — default `type: "review"` (CDSR systematic reviews). The response includes
   `typeCounts` for all content types (review, protocol, central, editorial, specialcollections, cca),
   so you can tell the user how much evidence exists per type, then re-search a different `type`.
3. `cochrane_get_details` with a result's `doi` for the structured abstract, Plain Language Summary,
   and PICO (reviews) or the trial record (central).

## Tips
- `searchField` options: title-abstract-keyword (default), record-title, abstract, author, keyword,
  all-text, source, doi, accession-number, cochrane-group.
- Prefer reviews for synthesised evidence; use `central` (trials) for primary studies (often thousands).
- Cite the DOI and link from `urls.html`.

## Setup caveat (Cloudflare)
The server mints a `cf_clearance` cookie via a real Chrome. If a tool returns a Cloudflare-challenge
error, the user must ensure Chrome is reachable (`COCHRANE_CDP_ENDPOINT`) or solve the one-time
challenge in the auto-launched browser window.
```

- [ ] **Step 2: Create `commands/cochrane.md`**

```markdown
---
description: Search the Cochrane Library and summarise top systematic reviews.
argument-hint: <query>
---

Search the Cochrane Library for: **$ARGUMENTS**

1. Call `cochrane_search` with `query: "$ARGUMENTS"`, `type: "review"`.
2. Report the total review count and the `typeCounts` for other content types.
3. List the top 5 results (title, authors, year, DOI).
4. Offer to fetch details (`cochrane_get_details`) for any result the user picks.
```

- [ ] **Step 3: Create `README.md`**

````markdown
# cochrane-mcp

MCP server for searching the **Cochrane Library** and fetching review/trial details.
Tools: `cochrane_search`, `cochrane_get_details`, `cochrane_suggest_terms`.

## How it works
Cochrane is behind Cloudflare. The server mints a `cf_clearance` cookie using a real Chrome
(via the DevTools Protocol), then replays it in fast `fetch` calls. The cookie is IP+UA bound,
so the server and the Chrome it uses must run on the same machine.

## Install (Claude Code plugin)
```
/plugin marketplace add <owner>/<repo>
/plugin install cochrane@cochrane-marketplace
```

## Manual install
```
npm install && npm run build
```
Add to your MCP config:
```json
{ "mcpServers": { "cochrane": { "command": "node", "args": ["/abs/path/dist/index.js"],
  "env": { "COCHRANE_CDP_ENDPOINT": "http://127.0.0.1:9444" } } } }
```

## Cloudflare / browser setup
Two modes:
- **Attach (recommended):** start Chrome with remote debugging and set `COCHRANE_CDP_ENDPOINT`:
  ```
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9444
  ```
  Browse to cochranelibrary.com once so the session holds a `cf_clearance` cookie.
- **Auto-launch (default, no endpoint):** the server launches its own Chrome with a dedicated
  profile (`COCHRANE_PROFILE_DIR`, default `./.cochrane-profile`). Solve the one-time Cloudflare
  challenge in the window; the cookie persists for later runs.

## Develop
```
npm test            # offline parser tests against fixtures
COCHRANE_LIVE_TEST=1 COCHRANE_CDP_ENDPOINT=http://127.0.0.1:9444 npm test   # + live smoke
```
````

- [ ] **Step 4: Build and run the full test suite**

Run: `npm run build && npm test`
Expected: build clean; all offline tests pass.

- [ ] **Step 5: Commit**

```bash
git add skills commands README.md
git commit -m "docs: usage skill, /cochrane command, and README"
```

---

## Self-Review Notes (author)

- **Spec coverage:** search (Task 3/9), all content types via `selectedType` + `typeCounts` (Task 3),
  `forceTypeSelection` (Task 2), searchBy/orderBy enums (Task 2), autosuggest (Task 6), review details +
  abstract + PLS (Task 4), PICO + related JSON (Task 6/9), trial graceful degradation (Task 5),
  mint-then-fetch engine + refresh-on-412 (Task 7/8), error handling (Task 7/9), fixtures + gated live
  test (Tasks 3–6, 10), plugin + marketplace + skill + command (Tasks 11–12). All §-sections covered.
- **Type consistency:** `Minter`/`Session` (Task 7) reused by `CdpMinter` (Task 8) and `HttpClient`;
  `CochraneService` Http interface matches `HttpClient.fetchText` signature; parser function names
  (`parseSearchResults`, `parseDetail`, `parseReviewDetail`, `parseTrialDetail`, `parseSuggestions`,
  `parsePico`, `parseRelated`) are used identically in `service.ts`.
- **Known fragility:** HTML selectors (`.results-number`, `.search-results-item`, `.abstract_title`)
  are pinned by fixtures; a site redesign breaks tests first (intended).
