import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const seedDir = join(import.meta.dirname, "../../fixtures/seed");
const names = readdirSync(seedDir).map((f) => f.replace(/\.json$/, ""));

describe("seed catalog", () => {
  test("has a seed file for every domain", () => {
    expect(names.length).toBe(123);
  });

  test.each(names)("%s serves read-only seed after a reset", async (name) => {
    const seed = JSON.parse(readFileSync(join(seedDir, `${name}.json`), "utf8"));
    await app.request(`/${name}`, send("POST", { name: "x" }));
    resetStore();
    const res = await app.request(`/${name}/catalog`);
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toEqual(seed);
    expect(rows.length).toBe(60);
    rows[0].name = "mutated";
    rows.pop();
    expect(await (await app.request(`/${name}/catalog`)).json()).toEqual(seed);
  });
});
