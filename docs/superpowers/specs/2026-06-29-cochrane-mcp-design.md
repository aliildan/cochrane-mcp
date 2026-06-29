# Cochrane Library MCP — Design Spec

**Date:** 2026-06-29
**Status:** Approved (design); pending spec review
**Author:** reverse-engineered live from https://www.cochranelibrary.com

## 1. Goal

A TypeScript MCP server (stdio, runnable as a CLI) that lets an AI client **search** the
Cochrane Library across all content types, retrieve **result lists**, and fetch **rich
result details** (metadata, structured abstract, Plain Language Summary, full body text,
and structured PICO data).

Three tools:
1. `cochrane_search` — search + paginated results + per-type counts.
2. `cochrane_get_details` — type-aware full record for a DOI.
3. `cochrane_suggest_terms` — autocomplete term suggestions.

The server also ships, as a final phase, as an installable **Claude Code plugin** distributed
through a single-plugin **marketplace** repo, bundling a usage **skill** and a `/cochrane`
slash command (see §9).

## 2. Reverse-engineering findings (verified live)

The site is a **Liferay portal** behind **Cloudflare** (managed/JS-detection challenge).
All facts below were confirmed by live inspection through an authenticated Chrome session.

### 2.1 Cloudflare behaviour (critical constraint)

| Client | Result |
|---|---|
| Plain `curl` / Node `fetch` / `impit` (TLS-impersonation), **no cookie** | ❌ HTTP 412 challenge (`jsd/main.js`, "unable to send a cookie") |
| Bundled **headless** Chromium (patchright) | ❌ stuck on "Just a moment…", never mints `cf_clearance` |
| Bundled real **Chrome channel, headful, automation-launched** | ❌ stuck (no human to solve interactive Turnstile) |
| **Attach to a real running Chrome via CDP** | ✅ loads instantly |
| **Direct `fetch` carrying a browser-minted `cf_clearance` cookie + matching UA, same machine/IP** | ✅ HTTP 200, full data, plain `fetch` (no TLS impersonation needed) |

**Conclusions that drive the architecture:**
- A valid `cf_clearance` cookie can **only** be minted by a real (preferably already-running /
  human-reachable) browser executing the challenge JS.
- Once minted, that cookie can be **replayed in plain `fetch`** from the same machine/IP with the
  same User-Agent — fast, no per-request browser.
- `cf_clearance` is bound to **IP + User-Agent**; it expires (≈30 min–few hours). `__cf_bm` ≈30 min.

### 2.2 Search (HTML, GET — no JSON results API)

Canonical results URL:

```
https://www.cochranelibrary.com/en/search
  ?searchText=<query>
  &searchBy=<fieldId>
  &selectedType=<type>
  &resultPerPage=<n>            # default 25
  &searchType=basic
  &orderBy=<orderId>
  &forceTypeSelection=true      # REQUIRED to honour selectedType
  &cur=<page>                   # 1-based page
  &p_p_id=scolarissearchresultsportlet_WAR_scolarissearchresults
  &p_p_lifecycle=0&p_p_state=normal&p_p_mode=view
  # optional date filters: publishYearFrom, publishYearTo, min_year, max_year,
  #   custom_min_year, custom_max_year, publishDateFrom, publishDateTo
```

`selectedType` values (with live "aspirin" counts):

| value | content type | example count |
|---|---|---|
| `review` | Cochrane Reviews (CDSR) | 127 |
| `protocol` | Cochrane Protocols | 7 |
| `central` | Trials (CENTRAL) | 17 202 |
| `editorial` | Editorials | 2 |
| `specialcollections` | Special Collections | 0 |
| `cca` | Clinical Answers | 18 |

`searchBy` values: `1` Title/Abstract/Keyword · `2` Record Title · `3` Abstract · `4` Author ·
`5` Keyword · `6` All Text · `8` Source · `9` DOI · `10` Accession Number · `12` Cochrane Group.

`orderBy` values: `relevancy` · `title_sortable-false` (A→Z) · `title_sortable-true` (Z→A) ·
`displayDate-true` (new→old) · `displayDate-false` (old→new).

**Result HTML:** total count in `.results-number`; each hit is `.search-results-item`:
- `.result-title > a[href]` — title + relative link
- link form per type: Reviews/Protocols → `/cdsr/doi/<DOI>/full`, Trials → `/central/doi/10.1002/central/CN-…/full`, CCA → `/cca/doi/<DOI>/full`
- `.search-result-authors`, `[data-article-doi]`, `.search-result-type`, `.search-result-stage`, access block (`.access … access_free` / subscription)
- **Every results page also renders the per-type tab counts** (`a[href*="selectedType="]`), so one
  request yields the chosen type's items **plus** total counts for all six types.

### 2.3 Autosuggest (JSON)

```
…/en/search?…&p_p_resource_id=getSuggestions&…
  &_scolarissearchportlet_WAR_scolarissearch_searchText=<q>&term=<partial>
```
Returns a JSON array of term strings, e.g. `["Asthma Quality of Life Questionnaire", …]`
(served with `Content-Type: text/html`, body is JSON).

### 2.4 Detail page + DOI-keyed JSON side-APIs

Detail page `GET /cdsr/doi/<DOI>/full` (review/protocol) exposes Highwire `citation_*` meta tags
(`citation_title`, `citation_author` (repeated), `citation_author_institution`, `citation_journal_title`,
`citation_doi`, `citation_date`, `citation_online_date`, `citation_issn`, `citation_issue`,
`citation_keywords`, `citation_pdf_url`, `citation_abstract_html_url`, `citation_fulltext_html_url`),
a **structured abstract** (`.abstract_title` headings: Background, Objectives, Search methods,
Selection criteria, Data collection and analysis, Main results, Authors' conclusions),
a **Plain Language Summary**, and full body sections.

**Trial detail** `GET /central/doi/<DOI>/full` has a *reduced* schema: `citation_*` meta (subset),
**no** structured abstract sections, **no** PLS; `citation_journal_title` is the external registry
URL (e.g. `clinicaltrials.gov/show/NCT…`). → parser must be **type-aware**.

DOI-keyed JSON endpoints (`GET /content?…&p_p_lifecycle=2&p_p_resource_id=<id>&doi=<DOI>`),
all `application/json`:

| resource_id | returns |
|---|---|
| `get-pico-data` | structured PICO: `{Population:{…}, Intervention:{…}, Comparison:{…}, Outcome:{…}}` |
| `get-related-articles` | linked editorials, CCAs derived from CDSR, special collections, podcasts |
| `get-visualsummaries-for-review` | `{count, data[]}` |
| `get-guidelines-count` / `get-approved-comments-count` | counts |

## 3. Architecture

Lightweight Node/TypeScript (ESM). Mostly plain `fetch` + `cheerio`; a browser is touched
**only** to mint/refresh the Cloudflare cookie.

```
src/
  index.ts            # CLI/stdio bootstrap
  server.ts           # MCP tool registration (3 tools)
  engine/
    session.ts        # in-memory SessionStore { cfClearance, cookies, userAgent, mintedAt }
    minter.ts         # CookieMinter — obtains/refreshes cf_clearance via CDP
    httpClient.ts     # fetch + challenge-detection + refresh-and-retry
  cochrane/
    urls.ts           # URL builders + param enums (single source of truth)
    search.ts         # build search URL, parse .search-results-item + typeCounts
    details.ts        # DOI→type dispatch + per-type detail parsers
    suggest.ts        # getSuggestions
    jsonApi.ts        # pico / related / visualsummaries fetchers
  types.ts            # zod input schemas + TS output types
test/
  fixtures/           # saved real HTML/JSON (search-review, search-central, detail-review, detail-trial, pico, suggest)
  *.test.ts           # parser unit tests (no network) + gated live smoke test
README.md

# plugin packaging (final phase, §9)
.claude-plugin/
  plugin.json         # manifest; registers the cochrane MCP server on install
  marketplace.json    # single-plugin marketplace index
commands/
  cochrane.md         # /cochrane <query> slash command
skills/
  cochrane/SKILL.md   # when/how to use the tools (evidence-search guidance)
.mcp.json             # MCP server declaration referenced by the plugin
```

### 3.1 Engine: mint-then-fetch

- **SessionStore** holds the current cookie bundle + UA + mint timestamp.
- **CookieMinter** has two modes (config via env):
  - **Attach** (`COCHRANE_CDP_ENDPOINT` set, e.g. `http://127.0.0.1:9444`): `connectOverCDP`, read
    cookies for `cochranelibrary.com` via `context.cookies()`, copy `cf_clearance`/`__cf_bm`/session
    cookies + the browser's UA into the store. Never launches a browser.
  - **Auto-launch** (default): launch real Chrome (`channel:'chrome'`) headful with a **dedicated
    persistent profile** + remote-debugging; navigate to homepage then a search URL; poll
    `context.cookies()` until `cf_clearance` appears (≤ timeout). If a Turnstile needs a human, the
    window is visible — surface a one-time "please solve the challenge in the open Chrome window"
    message; once solved the cookie persists in the profile for future runs.
- **httpClient.fetch(url, {accept})**: plain `fetch` with `Cookie` + `User-Agent`. Challenge
  detection = HTTP 412 **or** (body < 5 KB and matches `unable to send a cookie|just a moment`). On
  challenge → `minter.refresh()` → retry **once**. Still challenged → throw a descriptive
  `CloudflareChallengeError` (tells the user to open/refresh the browser). Optional TLS-impersonation
  fallback (`impit`) behind a flag, in case Cloudflare later binds clearance to JA3.

### 3.2 Tools (zod input → output)

**`cochrane_search`**
```
input:  { query: string,
          type?: 'review'|'protocol'|'central'|'editorial'|'specialcollections'|'cca'  (default 'review'),
          searchField?: enum→searchBy (default 'title-abstract-keyword'),
          orderBy?: 'relevancy'|'title-asc'|'title-desc'|'date-desc'|'date-asc' (default 'relevancy'),
          page?: number (default 1),
          resultsPerPage?: number (default 25, max 100),
          yearFrom?: number, yearTo?: number }
output: { total: number, page: number, resultsPerPage: number,
          typeCounts: { review, protocol, central, editorial, specialcollections, cca },
          items: SearchResultItem[] }
```
`SearchResultItem = { rank, title, doi, url, authors, contentType, stage?, date?, access }`.

**`cochrane_get_details`**
```
input:  { doi: string }     # type inferred from DOI pattern; path chosen accordingly
output (review/protocol): { doi, title, authors[{name,institution?,email?}], journal, issue?, date,
          onlineDate?, issn?, language?, keywords[], type, stage,
          abstract: { background?, objectives?, searchMethods?, selectionCriteria?,
                      dataCollectionAnalysis?, mainResults?, authorsConclusions? },
          plainLanguageSummary?, fullText?: { heading, text }[],
          pico?, relatedArticles?, urls: { html, abstract, pdf } }
output (trial): { doi, title, authors[], source?/registryUrl?, date?, keywords[], abstract?,
          urls: { html, pdf? } }   # graceful degradation; no PLS/sections/pico
```

**`cochrane_suggest_terms`**
```
input:  { query: string }
output: { suggestions: string[] }
```

## 4. Error handling

- Cloudflare challenge after refresh → `CloudflareChallengeError` with guidance.
- Invalid/unknown DOI → clear "not found / unrecognised DOI" error.
- Zero results → valid response with `total: 0`, empty `items`.
- Network/timeout → wrapped error with the URL.
- No tool ever throws an unstructured crash; all return MCP-formatted errors.

## 5. Testing

- **Parser unit tests** run offline against committed fixtures (real captured HTML/JSON):
  search (review + central), detail (review + trial), pico JSON, suggest JSON. These pin the
  selectors/schema so a site change is caught.
- **Engine tests**: challenge-detection logic, refresh-and-retry, URL builders (param mapping).
- **Live smoke test** (gated by `COCHRANE_LIVE_TEST=1` + a reachable browser): real search +
  details for a known DOI.

## 6. Stack / packaging

- TypeScript (ESM, Node ≥ 18), `@modelcontextprotocol/sdk` (stdio), `cheerio`, `zod`,
  `patchright` (CDP connect + stealth auto-launch). `impit` optional fallback.
- `bin: cochrane-mcp` with shebang; runnable via `npx`. README documents both engine modes and
  the one-time challenge solve.

## 7. Out of scope (YAGNI)

- Advanced/PICO query-builder search syntax (basic search only for v1).
- Authenticated/subscription full-text behind paywalls (we read what the public site serves).
- Exporting citations (RIS/BibTeX), saved searches, alerts.
- A paid unlocker integration (documented as a future option only).

## 8. Risks / open caveats

- Cloudflare may tighten (bind `cf_clearance` to TLS fingerprint) → mitigated by the optional
  `impit` fallback.
- HTML scraping is brittle to site redesign → mitigated by fixture-based parser tests.
- Auto-launch first-run may require a human Turnstile solve → surfaced clearly, then cached.
- `cf_clearance` is IP+UA bound → the MCP and its minting browser must run on the same host.

## 9. Claude Code plugin + marketplace (final phase)

Additive packaging over the built MCP; does not change the core design.

- **`.claude-plugin/plugin.json`** — plugin manifest (`name: cochrane`, version, description). Declares
  the MCP server so installing the plugin auto-registers it, e.g.:
  ```json
  { "name": "cochrane", "version": "0.1.0",
    "description": "Search the Cochrane Library (reviews, trials, CCA…) and fetch rich details.",
    "mcpServers": { "cochrane": { "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/dist/index.js"],
                                  "env": { "COCHRANE_CDP_ENDPOINT": "" } } } }
  ```
  (A sibling top-level `.mcp.json` mirrors this for non-plugin manual installs.)
- **`.claude-plugin/marketplace.json`** — single-plugin marketplace index pointing at this repo, so a
  user runs `/plugin marketplace add <owner>/<repo>` then `/plugin install cochrane@<marketplace>`.
- **`skills/cochrane/SKILL.md`** — usage guidance: when to reach for the tools, how to pick
  `type`/`searchField`, the search→details flow, and the one-time Cloudflare `cf_clearance` setup
  caveat. Description tuned so it triggers on evidence/systematic-review questions.
- **`commands/cochrane.md`** — `/cochrane <query>` slash command: runs a default CDSR search and
  summarises top hits, offering to fetch details.

**Install UX (documented in README):** add marketplace → install plugin → ensure Chrome reachable
(attach via `COCHRANE_CDP_ENDPOINT`, or let it auto-launch and solve the one-time challenge).

**Plugin-phase acceptance:** `/plugin install` registers the server and the three tools appear; the
skill and `/cochrane` command load; a fresh machine can go from install → first successful search
following only the README.
