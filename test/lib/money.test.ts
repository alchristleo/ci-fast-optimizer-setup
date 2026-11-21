import { describe, expect, test } from "bun:test";
import { addMoney, formatMoney, fromCents, splitMoney, toCents } from "../../src/lib/money.ts";

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
});
