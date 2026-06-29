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
