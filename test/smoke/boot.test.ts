import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/app.ts";

const fixtures = join(import.meta.dirname, "../../fixtures");

describe("boot", () => {
  test("throws when a seed row fails its schema", () => {
    const dir = mkdtempSync(join(tmpdir(), "fixtures-"));
    try {
      cpSync(fixtures, dir, { recursive: true });
      const file = join(dir, "seed", "customers.json");
      const rows = JSON.parse(readFileSync(file, "utf8"));
      rows[3].email = "not-an-email";
      writeFileSync(file, JSON.stringify(rows));
      expect(() => createApp(dir)).toThrow("bad seed fixture for customers");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
