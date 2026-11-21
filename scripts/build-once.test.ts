import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const files = [
  "test/domains/customers.test.ts",
  "test/domains/inventory.test.ts",
  "test/domains/orders.test.ts",
];

function builds(cmd: string, args: string[]): number[] {
  const dir = mkdtempSync(join(tmpdir(), "app-builds-"));
  try {
    const r = spawnSync(cmd, args, {
      env: { ...process.env, APP_BUILDS_DIR: dir },
      encoding: "utf8",
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    return readdirSync(dir).map((f) => Number(readFileSync(join(dir, f), "utf8")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("bun test builds the app once for 3 files", () => {
  expect(builds(process.execPath, ["test", ...files])).toEqual([1]);
}, 60_000);

test("vitest builds the app once per file (3 total)", () => {
  const counts = builds("node_modules/.bin/vitest", ["run", ...files]);
  expect(counts.length).toBe(3);
  expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
}, 60_000);
