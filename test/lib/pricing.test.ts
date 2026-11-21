import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { addTax, applyDiscount, lineTotal, tierDiscount } from "../../src/lib/pricing.ts";
import { params } from "../support/property.ts";

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
  test("property: discounts never raise a line total and rounding stays whole", () => {
    fc.assert(
      fc.property(fc.nat(100_000), fc.nat(500), (unit, qty) => {
        const total = lineTotal(unit, qty, 0);
        expect(Number.isInteger(total)).toBe(true);
        expect(total).toBeLessThanOrEqual(unit * qty);
        expect(total).toBeGreaterThanOrEqual(Math.floor(unit * qty * 0.85) - 1);
      }),
      params(8),
    );
  });
  test("a 100 unit line takes 15 percent off example", () => {
    expect(lineTotal(100, 100, 0)).toBe(8500);
  });
});
