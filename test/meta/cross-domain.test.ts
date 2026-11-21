import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// Domain names are the directories holding a routes.ts under src/domains.
const names = new Set(
  walk(join(root, "src/domains"))
    .filter((f) => f.endsWith("/routes.ts"))
    .map((f) => f.split("/").at(-2)!),
);

// Route prefixes a test requests through app.request, that its imports do not cover.
export function missingImports(text: string): string[] {
  const requested = new Set(
    [...text.matchAll(/\.request\(\s*["'`]\/([a-z0-9]+)/g)]
      .map((m) => m[1]!)
      .filter((n) => names.has(n)),
  );
  const imported = [
    ...[...text.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map((m) => m[1]!),
    ...[...text.matchAll(/\bimport\s*["']([^"']+)["']/g)].map((m) => m[1]!),
  ].filter((spec) => spec.includes("src/domains/"));
  return [...requested].filter((n) => !imported.some((spec) => spec.includes(`/${n}/`))).sort();
}

describe("cross-domain rule", () => {
  test("a test imports the domain module of every route prefix it requests", () => {
    // smoke/ runs on every PR, meta/ and support/ hold no route tests.
    const offenders = walk(join(root, "test"))
      .filter((f) => f.endsWith(".test.ts"))
      .filter((f) => !/\/test\/(smoke|meta)\//.test(f))
      .flatMap((f) => missingImports(readFileSync(f, "utf8")).map((n) => `${f} requests /${n}`));
    expect(offenders).toEqual([]);
  });

  test("the check catches a request with no matching import", () => {
    const own = `import { create } from "../../src/domains/generated/accounts/service.ts";\n`;
    const text = `${own}await app.request("/accounts");\nawait app.request("/orders/orders_1");\n`;
    expect(missingImports(text)).toEqual(["orders"]);
    expect(missingImports(`${own}import "../../src/domains/orders/service.ts";\n${text}`)).toEqual(
      [],
    );
  });
});
