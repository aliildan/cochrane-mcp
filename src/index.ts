#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CochraneService } from "./cochrane/service.js";
import { HttpClient } from "./engine/httpClient.js";
import { CdpMinter } from "./engine/minter.js";
import { createServer } from "./server.js";

export const VERSION = "0.2.0";

function parsePorts(v: string | undefined): number[] | undefined {
  if (!v) return undefined;
  const ports = v.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n));
  return ports.length ? ports : undefined;
}

async function main() {
  const minter = new CdpMinter({
    cdpEndpoint: process.env.COCHRANE_CDP_ENDPOINT || undefined,
    discoverPorts: parsePorts(process.env.COCHRANE_CDP_PORTS),
    profileDir: process.env.COCHRANE_PROFILE_DIR || undefined,
    headless: process.env.COCHRANE_HEADLESS === "1",
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
