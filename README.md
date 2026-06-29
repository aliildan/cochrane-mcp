<div align="center">

# 🩺 Cochrane MCP

**Search the world's gold-standard medical evidence — Cochrane systematic reviews and trials — straight from your AI assistant.**

`cochrane_search` · `cochrane_get_details` · `cochrane_suggest_terms`

[![version](https://img.shields.io/badge/version-0.2.0-blue)](https://github.com/aliildan/cochrane-mcp)
[![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/Model_Context_Protocol-server-7C3AED)](https://modelcontextprotocol.io)

</div>

---

Cochrane MCP turns the [Cochrane Library](https://www.cochranelibrary.com) into a tool your AI agent can
use directly: ask a clinical question and get **real, citeable evidence** — systematic reviews,
randomised trials, plain-language summaries, and structured PICO data — instead of a guess.

It runs as a **Model Context Protocol server** (works in Claude Code, Claude Desktop, and any MCP client)
and ships as a one-command **Claude Code plugin**.

## ✨ What you can do

- **Search every Cochrane database** — Reviews (CDSR), Protocols, Trials (CENTRAL), Editorials,
  Special Collections, and Clinical Answers — and see counts across all of them in one call.
- **Pull rich details by DOI** — structured abstract (Background → Conclusions), the Plain Language
  Summary, PICO (Population/Intervention/Comparison/Outcome), related articles, and PDF/HTML links.
- **Search smarter** — autocomplete suggestions, field-specific search (title, author, keyword, DOI…),
  date ranges, and relevance/date sorting.
- **Just works behind Cloudflare** — the server clears Cochrane's bot protection automatically (see
  [Browser setup](#-browser-setup-automatic)).

## 🚀 Quick start (Claude Code plugin)

```text
/plugin marketplace add aliildan/cochrane-mcp
/plugin install cochrane@cochrane-marketplace
/reload-plugins
```

Then just ask, or use the bundled command:

```text
/cochrane statins for primary prevention
```

> First-time build: the plugin runs from compiled output, so once in the plugin directory run
> `npm install && npm run build` (this also downloads the bundled browser used for Cloudflare).

## 💬 Usage examples

### 1. The `/cochrane` slash command

```text
/cochrane vitamin D for preventing asthma exacerbations
```

> **Claude:** Cochrane has **3 reviews** on this (plus 412 trials, 2 clinical answers).
> | # | Title | Authors | Year | DOI |
> |---|---|---|---|---|
> | 1 | Vitamin D for the management of asthma | Williamson A, et al. | 2023 | `10.1002/14651858.CD011511.pub3` |
> | … | | | | |
> Want the full abstract + plain-language summary for #1, or should I check the trials?

### 2. Let the skill trigger naturally

The bundled **cochrane** skill activates on evidence questions — no command needed:

```text
You: Is paracetamol or ibuprofen better for fever in children, according to Cochrane?
```

> Claude searches CDSR, surfaces the relevant review, calls `cochrane_get_details`, and quotes the
> **Authors' conclusions** with the DOI to cite.

### 3. Call the tools directly

```text
You: Search Cochrane trials (not reviews) for "semaglutide", newest first.
```
→ `cochrane_search({ query: "semaglutide", type: "central", orderBy: "date-desc" })`

```text
You: Give me the plain-language summary and PICO for DOI 10.1002/14651858.CD012116.pub2.
```
→ `cochrane_get_details({ doi: "10.1002/14651858.CD012116.pub2" })`

```text
You: I'm not sure how to spell it — suggest Cochrane terms for "azithro".
```
→ `cochrane_suggest_terms({ query: "azithro" })` → `["azithromycin", "azithromycin dihydrate", …]`

### 4. Refine a search

```text
You: Same search but only reviews from 2020 onward, by title.
```
→ `cochrane_search({ query: "semaglutide", type: "review", searchField: "record-title", yearFrom: 2020, orderBy: "date-desc" })`

## 🧰 Tools

| Tool | Input | Returns |
|---|---|---|
| **`cochrane_search`** | `query`, `type?`, `searchField?`, `orderBy?`, `page?`, `resultsPerPage?`, `yearFrom?`, `yearTo?` | `total`, `typeCounts` (all 6 content types), and a page of `items` |
| **`cochrane_get_details`** | `doi` | Reviews → metadata + structured abstract + plain-language summary + PICO + related articles. Trials → metadata + source registry. (Type inferred from the DOI.) |
| **`cochrane_suggest_terms`** | `query` | `{ suggestions: string[] }` autocomplete |

<details>
<summary><b>Field & sort options</b></summary>

- `type`: `review` · `protocol` · `central` (trials) · `editorial` · `specialcollections` · `cca`
- `searchField`: `title-abstract-keyword` (default) · `record-title` · `abstract` · `author` ·
  `keyword` · `all-text` · `source` · `doi` · `accession-number` · `cochrane-group`
- `orderBy`: `relevancy` (default) · `title-asc` · `title-desc` · `date-desc` · `date-asc`

</details>

<details>
<summary><b>Sample <code>cochrane_search</code> response</b></summary>

```json
{
  "total": 127,
  "page": 1,
  "resultsPerPage": 25,
  "typeCounts": { "review": 127, "protocol": 7, "central": 17202, "editorial": 2, "specialcollections": 0, "cca": 18 },
  "items": [
    {
      "rank": 1,
      "title": "Acetylsalicylic acid (aspirin) for schizophrenia",
      "doi": "10.1002/14651858.CD012116.pub2",
      "url": "https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD012116.pub2/full",
      "authors": "Lena Schmidt, Emma Phelps, Johannes Friedel, Farhad Shokraneh",
      "contentType": "Intervention",
      "stage": "Review",
      "date": "10 August 2019",
      "access": "Free access"
    }
  ]
}
```

</details>

## 🌐 Browser setup (automatic)

Cochrane sits behind a Cloudflare challenge that plain HTTP clients can't pass. Cochrane MCP solves this
with a real browser, then replays the resulting `cf_clearance` cookie in fast `fetch` calls — so most of
the work is lightweight HTTP, not a heavy browser per request. **You normally configure nothing.** On each
mint the server:

1. **Explicit** — attaches to `COCHRANE_CDP_ENDPOINT` if you set it.
2. **Discover** — probes `127.0.0.1:9222` / `:9444`. If a Chrome with remote debugging is already running
   and holds clearance, it's reused. Connecting is **read-only and never closes your browser**.
3. **Self-launch** — otherwise launches its own Chrome (system Chrome, else a bundled Chromium) with a
   persistent profile, clears the challenge, and reuses the cookie for later runs.

> **The one manual moment:** if Cloudflare escalates to an *interactive* Turnstile (rare — flagged IP or
> detected automation), the self-launched window shows it and you click once; the cookie then persists.
> No software bypasses an interactive Turnstile without a paid CAPTCHA service.

**Most reliable hands-off setup:** keep a Chrome running with `--remote-debugging-port=9222` that has
visited cochranelibrary.com once — discovery reuses its organic clearance every time.

The cookie is **IP + User-Agent bound**, so the server and its browser must run on the **same machine**.

## ⚙️ Configuration

| Variable | Default | Effect |
|---|---|---|
| `COCHRANE_CDP_ENDPOINT` | — | Attach to this CDP endpoint (e.g. `http://127.0.0.1:9444`); skips discovery |
| `COCHRANE_CDP_PORTS` | `9222,9444` | Comma-separated localhost ports to probe during discovery |
| `COCHRANE_PROFILE_DIR` | `./.cochrane-profile` | Persistent profile dir for self-launch |
| `COCHRANE_HEADLESS` | `0` | `1` to self-launch headless (faster, but more likely to be challenged) |

## 📦 Manual install (any MCP client)

```bash
git clone git@github.com:aliildan/cochrane-mcp.git
cd cochrane-mcp
npm install && npm run build      # postinstall also fetches the bundled browser
```

```json
{
  "mcpServers": {
    "cochrane": {
      "command": "node",
      "args": ["/absolute/path/to/cochrane-mcp/dist/index.js"],
      "env": { "COCHRANE_CDP_ENDPOINT": "http://127.0.0.1:9444" }
    }
  }
}
```

## 🔄 Updating

```text
/plugin marketplace update cochrane-marketplace
/plugin install cochrane@cochrane-marketplace
/reload-plugins
```

Then rebuild in the plugin directory: `npm install && npm run build`. (Manual installs: `git pull` then
`npm install && npm run build`.)

## 🩹 Troubleshooting

| Symptom | Fix |
|---|---|
| `CloudflareChallengeError` | Start a Chrome with `--remote-debugging-port=9222`, visit cochranelibrary.com once, retry. Or let the self-launched window appear and solve the one-time challenge. |
| Tool returns nothing / 0 results | Check spelling (try `cochrane_suggest_terms`), widen `searchField` to `all-text`, or switch `type`. |
| No browser found / launch fails | Run `npm run setup` to (re)install the bundled Chromium, or install Google Chrome. |

## 🛠️ Develop

```bash
npm test            # offline parser/engine tests against committed fixtures (no network)
npm run test:watch
COCHRANE_LIVE_TEST=1 npm test           # + live smoke (auto-discovers a running Chrome)
```

Architecture and the full reverse-engineering write-up live in [`docs/superpowers/`](docs/superpowers)
and [`CLAUDE.md`](CLAUDE.md).

## 📄 License & disclaimer

Content belongs to Cochrane / John Wiley & Sons. This tool accesses the public website on your behalf;
respect Cochrane's terms of use. Not affiliated with or endorsed by Cochrane.
