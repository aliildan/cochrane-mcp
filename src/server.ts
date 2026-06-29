import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DetailsInput, SearchInput, SuggestInput } from "./types.js";
import type { CochraneService } from "./cochrane/service.js";

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
});

export function createServer(service: CochraneService): McpServer {
  const server = new McpServer({ name: "cochrane-mcp", version: "0.2.1" });

  server.tool(
    "cochrane_search",
    "Search the Cochrane Library. Returns total, per-type counts (review, protocol, central, editorial, specialcollections, cca), and a page of results.",
    SearchInput.shape,
    async (args) => {
      try {
        return json(await service.search(args));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cochrane_get_details",
    "Fetch full details for a Cochrane DOI. Reviews return metadata + structured abstract + plain-language summary + PICO; trials return metadata.",
    DetailsInput.shape,
    async (args) => {
      try {
        return json(await service.getDetails(args));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cochrane_suggest_terms",
    "Autocomplete term suggestions for a partial query.",
    SuggestInput.shape,
    async (args) => {
      try {
        return json(await service.suggest(args));
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}
