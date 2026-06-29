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

## Cloudflare / browser setup (automatic)

The cookie minting is automatic — you normally don't configure anything. On each mint the server:

1. **Explicit** — if `COCHRANE_CDP_ENDPOINT` is set, attaches to that Chrome (and warms it if needed).
2. **Discover** — otherwise probes `127.0.0.1:9222` and `:9444` (override with `COCHRANE_CDP_PORTS`).
   If a debug Chrome is running and already holds a `cf_clearance` cookie, it's reused. Connecting is
   read-only and does **not** close your browser.
3. **Self-launch** — otherwise launches its own Chrome (system Chrome if present, else the bundled
   Chromium) with a persistent profile (`COCHRANE_PROFILE_DIR`, default `./.cochrane-profile`),
   clears the challenge, and reuses the cookie for later runs.

The bundled Chromium is installed automatically on `npm install` (postinstall) or via `npm run setup`.

**The one manual moment:** if Cloudflare escalates to an *interactive* Turnstile (rare — happens under a
flagged IP / detected automation), the self-launched window will show it and you click once; the cookie
then persists. No software can bypass an interactive Turnstile without a paid CAPTCHA service.

### Environment variables
| var | effect |
|---|---|
| `COCHRANE_CDP_ENDPOINT` | Attach to this CDP endpoint (e.g. `http://127.0.0.1:9444`). Skips discovery. |
| `COCHRANE_CDP_PORTS` | Comma list of localhost ports to probe (default `9222,9444`). |
| `COCHRANE_PROFILE_DIR` | Persistent profile dir for self-launch (default `./.cochrane-profile`). |
| `COCHRANE_HEADLESS` | `1` to self-launch headless (faster, but more likely to be challenged). |

Tip for the most reliable hands-off setup: keep a Chrome running with `--remote-debugging-port=9222`
that has visited cochranelibrary.com once — discovery will reuse its organic clearance every time.

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
