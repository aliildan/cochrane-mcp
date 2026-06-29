# cochrane-mcp

MCP server for searching the **Cochrane Library** and fetching review/trial details.
Tools: `cochrane_search`, `cochrane_get_details`, `cochrane_suggest_terms`.

Repo: <https://github.com/aliildan/cochrane-mcp>

> **Heads-up:** Cochrane sits behind a Cloudflare challenge that plain HTTP clients cannot pass.
> This server clears it with a real Chrome (mint-then-fetch) — see [Cloudflare / browser setup](#cloudflare--browser-setup).

## How it works
Cochrane is behind Cloudflare. The server mints a `cf_clearance` cookie using a real Chrome
(via the DevTools Protocol), then replays it in fast `fetch` calls. The cookie is IP+UA bound,
so the server and the Chrome it uses must run on the same machine.

## Install (Claude Code plugin)
```
/plugin marketplace add aliildan/cochrane-mcp
/plugin install cochrane@cochrane-marketplace
```
The plugin auto-registers the MCP server. You still need a reachable Chrome (see below). Because the
server runs from built output, after installing run `npm install && npm run build` in the plugin dir.

## Manual install
```bash
git clone git@github.com:aliildan/cochrane-mcp.git
cd cochrane-mcp
npm install && npm run build
```
Add to your MCP config (use the absolute path to the clone):
```json
{ "mcpServers": { "cochrane": { "command": "node", "args": ["/absolute/path/to/cochrane-mcp/dist/index.js"],
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
  challenge in the window; the cookie persists for later runs. Requires `npx patchright install chromium`
  (or a Chrome install for `channel: "chrome"`).

## Tools

### `cochrane_search`
`{ query, type?, searchField?, orderBy?, page?, resultsPerPage?, yearFrom?, yearTo? }`
→ `{ total, page, resultsPerPage, typeCounts, items[] }`. `type` ∈ review · protocol · central ·
editorial · specialcollections · cca. Every response includes `typeCounts` for all six types.

### `cochrane_get_details`
`{ doi }` → reviews: metadata + structured abstract + plain-language summary + PICO + related
articles; trials: metadata + source registry. Content type is inferred from the DOI.

### `cochrane_suggest_terms`
`{ query }` → `{ suggestions: string[] }`.

## Develop
```
npm test            # offline parser tests against committed fixtures
COCHRANE_LIVE_TEST=1 COCHRANE_CDP_ENDPOINT=http://127.0.0.1:9444 npm test   # + live smoke
```
Spec and plan live in `docs/superpowers/`.
