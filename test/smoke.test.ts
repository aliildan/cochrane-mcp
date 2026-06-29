import { expect, test } from "vitest";
import { VERSION } from "../src/index.js";

test("version is set", () => {
  expect(VERSION).toBe("0.2.1");
});
