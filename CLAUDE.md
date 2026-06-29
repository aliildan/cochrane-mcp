# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.

## What this is

`cochrane-mcp` is a **stdio MCP server** (TypeScript, ESM) that searches the
[Cochrane Library](https://www.cochranelibrary.com) and returns structured results and rich,
type-aware details. It is also packaged as a **Claude Code plugin**.

Tools exposed:
- `cochrane_search` — search any content type; returns `total`, per-type `typeCounts`, and a page of items.
- `cochrane_get_details` — full record for a DOI (reviews: metadata + structured abstract + plain-language summary + PICO + related; trials: metadata + source registry).
- `cochrane_suggest_terms` — autocomplete term suggestions.

## ⚠️ The one thing you must understand: Cloudflare

The Cochrane Library is behind a **Cloudflare JS/managed challenge**. This is the defining constraint
of the whole codebase. Empirically (see `docs/superpowers/specs/`):

- Plain `fetch` / `curl` / TLS-impersonation (`impit`) → **HTTP 412** once the IP is flagged.
- A freshly **automation-launched** headless *or* headful Chrome also fails to clear the challenge.
- A **real, already-running Chrome** (or one where a human solves the one-time Turnstile) clears it
  and mints a `cf_clearance` cookie.

So the engine is **mint-then-fetch**:
1. `CdpMinter` obtains `cf_clearance` from a real browser (attach via CDP, or auto-launch).
2. `HttpClient` replays that cookie + the browser's User-Agent in fast plain `fetch` calls.
3. On a 412/challenge it refreshes the cookie once and retries.

**Do not** "simplify" this back to plain HTTP — it will appear to work from a clean IP and then fail
under load. The cookie is **IP + User-Agent bound**, so the server and its minting Chrome must run on
the same machine.

## Architecture

```
src/
  index.ts            # CLI entry: builds CdpMinter → HttpClient → CochraneService → MCP stdio server
  server.ts           # registers the 3 MCP tools (zod shapes from types.ts)
  types.ts            # zod input schemas + TS output types + param enums (single source of truth)
  engine/
    session.ts        # Session + Minter interfaces
    httpClient.ts     # isChallenge(), HttpClient (fetch + refresh-on-412), CloudflareChallengeError
    minter.ts         # CdpMinter: mintViaAttach (CDP) / mintViaLaunch (persistent profile)
  cochrane/
    urls.ts           # buildSearchUrl / buildSuggestUrl / buildDetailUrl / buildJsonResourceUrl, detectContentType
    search.ts         # parseSearchResults — .search-results-item, .results-number, typeCounts
    details.ts        # parseReviewDetail / parseTrialDetail / parseDetail (dispatch by DOI)
    suggest.ts        # parseSuggestions (JSON array)
    jsonApi.ts        # parsePico / parseRelated (JSON side-endpoints)
    service.ts        # CochraneService — orchestrates fetch + parse for each tool
test/
  fixtures/           # REAL captured HTML/JSON — parser tests run fully offline against these
  *.test.ts           # 10 offline suites + 1 gated live smoke test
docs/superpowers/     # spec (design) + plan (task breakdown)
```

Data flows one direction: `service` builds a URL (`urls.ts`) → `httpClient.fetchText` → a `parse*`
function → typed result. Keep parsing pure and fixture-tested; keep network/Cloudflare concerns in `engine/`.

## Reverse-engineered API facts (verified)

- **Search** is GET HTML at `/en/search?...`. The param **`forceTypeSelection=true` is REQUIRED** or
  `selectedType` is ignored (you silently get reviews).
- `selectedType` ∈ `review` · `protocol` · `central` (Trials) · `editorial` · `specialcollections` · `cca`.
- `searchBy` 1–12 (Title/Abstract/Keyword=1 … DOI=9 … Cochrane Group=12); `orderBy` `relevancy` /
  `title_sortable-{false,true}` / `displayDate-{true,false}`. Mappings live in `types.ts`.
- Results: items in `.search-results-item`, total in `.results-number`; per-type counts come from the
  `a[href*="selectedType="]` tabs (so one search yields counts for all types).
- Detail page exposes Highwire `citation_*` meta. The structured abstract is `<section>`s inside
  `.abstract.full_abstract` (each has an `h3.title`); the PLS is `.abstract_plainLanguageSummary`.
  **Trials have no structured abstract / PLS** — parse degrades gracefully.
- JSON side-endpoints (keyed by DOI): `get-pico-data`, `get-related-articles`, `getSuggestions` (autocomplete).

## Commands

```bash
npm install
npm run build            # tsc → dist/
npm test                 # offline parser/engine tests (no network, no browser)
npm run test:watch

# Live end-to-end (needs a real Chrome with remote debugging holding a cf_clearance cookie):
COCHRANE_LIVE_TEST=1 COCHRANE_CDP_ENDPOINT=http://127.0.0.1:9444 npm test
```

Run the server directly: `node dist/index.js` (stdio). Env:
- `COCHRANE_CDP_ENDPOINT` — attach to an existing Chrome (e.g. `http://127.0.0.1:9444`). If unset, the
  minter auto-launches its own Chrome.
- `COCHRANE_PROFILE_DIR` — persistent profile for auto-launch (default `./.cochrane-profile`).

## Conventions

- **TDD.** Every parser/engine change starts with a failing test against a fixture. Match the existing
  test style (`vitest`, fixtures loaded via `new URL("./fixtures/...", import.meta.url)`).
- **ESM + `.js` import specifiers** in TypeScript (e.g. `import { x } from "./urls.js"`), per the
  `moduleResolution: Bundler` setup. Keep `strict` happy.
- **Selectors are fragile by design** — they're pinned by fixtures so a Cochrane redesign breaks tests
  first. If a selector breaks, inspect the fixture (`grep`/`cheerio`) and update parser + fixture together.
- Cheerio element type is `AnyNode` from `domhandler` (cheerio v1 doesn't re-export `Element`).

## Regenerating fixtures

Fixtures are real pages captured through an authenticated Chrome session. To refresh them, fetch the
live URLs (search-review, search-central, detail-review, detail-trial, pico.json, related-articles.json,
suggest.json) while carrying a valid `cf_clearance` cookie, and overwrite `test/fixtures/`. Then make
the offline tests pass against the new markup.

## Don'ts

- Don't replace mint-then-fetch with plain HTTP (it will fail under Cloudflare).
- Don't commit `.cochrane-profile/`, `dist/`, or `node_modules/` (see `.gitignore`).
- Don't hammer the live site in tests — only the gated `live.smoke.test.ts` touches the network.
