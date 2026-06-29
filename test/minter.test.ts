import { expect, test } from "vitest";
import { cookiesToHeader } from "../src/engine/minter.js";

test("cookiesToHeader joins name=value pairs", () => {
  expect(cookiesToHeader([{ name: "cf_clearance", value: "abc" }, { name: "__cf_bm", value: "xy" }]))
    .toBe("cf_clearance=abc; __cf_bm=xy");
});
test("cookiesToHeader skips empties", () => {
  expect(cookiesToHeader([{ name: "a", value: "" }, { name: "b", value: "2" }])).toBe("b=2");
});
