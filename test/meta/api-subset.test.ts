import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

const ALLOWED_TEST_IMPORTS = /^(bun:test|\.{1,2}\/|node:|hono$)/;
const ALLOWED_NAMES = new Set([
  "describe",
  "test",
  "it",
  "expect",
  "beforeEach",
  "afterEach",
  "beforeAll",
  "afterAll",
]);

export function findBunUsage(text: string): boolean {
  return /\bBun\./.test(text);
}

export function findBadTestImports(text: string): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)) {
    if (!ALLOWED_TEST_IMPORTS.test(m[1]!)) bad.push(m[1]!);
  }
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s+["']bun:test["']/g)) {
    for (const name of m[1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (!ALLOWED_NAMES.has(name)) bad.push(`bun:test#${name}`);
    }
  }
  return bad;
}

describe("api subset", () => {
  test("src/ never uses Bun.* APIs", () => {
    const offenders = sources(join(root, "src")).filter((f) =>
      findBunUsage(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
  test("test/ imports only the shared subset", () => {
    // The shim re-exports vitest by design and this file holds violation samples.
    const skip = (f: string) =>
      f.endsWith("support/bun-test.ts") || f.endsWith("api-subset.test.ts");
    const offenders = sources(join(root, "test"))
      .filter((f) => !skip(f))
      .flatMap((f) => findBadTestImports(readFileSync(f, "utf8")).map((i) => `${f}: ${i}`));
    expect(offenders).toEqual([]);
  });
  test("the checks catch violations", () => {
    expect(findBunUsage("const x = Bun.file('a')")).toBe(true);
    expect(findBadTestImports(`import { mock } from "bun:test";`)).toEqual(["bun:test#mock"]);
    expect(findBadTestImports(`import fs from "fs-extra";`)).toEqual(["fs-extra"]);
    expect(findBadTestImports(`import { test } from "bun:test";`)).toEqual([]);
  });
});
