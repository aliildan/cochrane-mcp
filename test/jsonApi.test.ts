import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parsePico, parseRelated } from "../src/cochrane/jsonApi.js";

const pico = readFileSync(new URL("./fixtures/pico.json", import.meta.url), "utf8");
const related = readFileSync(new URL("./fixtures/related-articles.json", import.meta.url), "utf8");

test("pico parses to object with Population", () => {
  const p = parsePico(pico) as Record<string, unknown>;
  expect(p).toHaveProperty("Population");
});
test("related parses", () => {
  const r = parseRelated(related) as Record<string, unknown>;
  expect(r).toHaveProperty("relatedPodcasts");
});
test("bad json returns null", () => {
  expect(parsePico("nope")).toBeNull();
});
