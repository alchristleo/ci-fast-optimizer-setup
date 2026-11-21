import { describe, expect, test } from "bun:test";
import { addTax, applyDiscount, lineTotal, tierDiscount } from "../../src/lib/pricing.ts";

describe("pricing", () => {
  test.each([
    [1, 0],
    [5, 5],
    [20, 10],
    [100, 15],
  ])("tier discount for %i units is %i percent", (qty, pct) => {
    expect(tierDiscount(qty)).toBe(pct);
  });
  test("applies a discount", () => {
    expect(applyDiscount(1000, 10)).toBe(900);
  });
  test("adds tax", () => {
    expect(addTax(1000, 0.08)).toBe(1080);
  });
  test("computes a line total", () => {
    expect(lineTotal(100, 20, 0)).toBe(1800);
  });
});
