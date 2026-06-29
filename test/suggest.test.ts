import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseSuggestions } from "../src/cochrane/suggest.js";

const body = readFileSync(new URL("./fixtures/suggest.json", import.meta.url), "utf8");

test("parses suggestion array", () => {
  const s = parseSuggestions(body);
  expect(Array.isArray(s)).toBe(true);
  expect(s[0].toLowerCase()).toContain("asthma");
});
test("bad body returns empty array", () => {
  expect(parseSuggestions("oops")).toEqual([]);
});
