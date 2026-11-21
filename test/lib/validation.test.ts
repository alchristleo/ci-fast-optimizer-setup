import { describe, expect, test } from "bun:test";
import { compile } from "../../src/lib/validation.ts";

const validate = compile({
  name: { type: "string", required: true, min: 2, max: 5 },
  age: { type: "number", min: 0, max: 120 },
  code: { type: "string", pattern: "^[A-Z]+$" },
});

describe("validation", () => {
  test("accepts a valid body", () => {
    expect(validate({ name: "abc", age: 4 })).toEqual({ ok: true, value: { name: "abc", age: 4 } });
  });
  test("reports missing required fields", () => {
    expect(validate({})).toEqual({ ok: false, errors: ["name is required"] });
  });
  test("allows a partial body when asked", () => {
    expect(validate({}, true)).toEqual({ ok: true, value: {} });
  });
  test("reports range and pattern errors", () => {
    expect(validate({ name: "abcdefg", age: 200, code: "x" })).toEqual({
      ok: false,
      errors: ["name is too long", "age must be <= 120", "code has an invalid format"],
    });
  });
  test("rejects non-objects", () => {
    expect(validate([])).toEqual({ ok: false, errors: ["body must be an object"] });
  });
});
