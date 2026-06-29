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
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
