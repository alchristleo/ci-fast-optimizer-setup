import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { addMoney, formatMoney, fromCents, splitMoney, toCents } from "../../src/lib/money.ts";
import { params } from "../support/property.ts";

describe("money", () => {
  test("converts to and from cents", () => {
    expect(toCents(12.34)).toBe(1234);
    expect(fromCents(1234)).toBe(12.34);
  });
  test("adds values", () => {
    expect(addMoney(100, 250, 5)).toBe(355);
  });
  test.each([
    [123456, "1,234.56 USD"],
    [5, "0.05 USD"],
    [-250, "-2.50 USD"],
  ])("formats %i", (cents, text) => {
    expect(formatMoney(cents)).toBe(text);
  });
  test("splits without losing a cent", () => {
    expect(splitMoney(100, 3)).toEqual([34, 33, 33]);
  });
  test("rejects zero parts", () => {
    expect(() => splitMoney(100, 0)).toThrow("parts must be positive");
  });
  test("property: splitting money keeps the total and stays within one cent", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 1, max: 50 }),
        (total, parts) => {
          const split = splitMoney(total, parts);
          expect(split.length).toBe(parts);
          expect(addMoney(...split)).toBe(total);
          expect(Math.max(...split) - Math.min(...split)).toBeLessThanOrEqual(1);
        },
      ),
      params(8),
    );
  });
  test("splits 10 cents three ways example", () => {
    expect(splitMoney(10, 3)).toEqual([4, 3, 3]);
  });
});
