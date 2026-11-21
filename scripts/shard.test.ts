import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { planShards } from "./shard";

describe("planShards", () => {
  test("literal example: LPT with path tie-break", () => {
    const timings = {
      "a.test.ts": 9,
      "b.test.ts": 7,
      "c.test.ts": 6,
      "d.test.ts": 5,
      "e.test.ts": 5,
    };
    const files = ["e.test.ts", "d.test.ts", "c.test.ts", "b.test.ts", "a.test.ts"];
    expect(planShards(files, timings, 2)).toEqual([
      ["a.test.ts", "d.test.ts"],
      ["b.test.ts", "c.test.ts", "e.test.ts"],
    ]);
  });

  test("zero-time files still spread across shards", () => {
    expect(planShards(["a", "b"], { a: 0, b: 0 }, 2)).toEqual([["a"], ["b"]]);
  });

  test("unknown files get the median time", () => {
    // median of 10, 20, 30 is 20; new.test.ts (20) ties with b (20) and sorts by path after it
    const timings = { "a.test.ts": 30, "b.test.ts": 20, "c.test.ts": 10 };
    const files = ["a.test.ts", "b.test.ts", "c.test.ts", "new.test.ts"];
    expect(planShards(files, timings, 2)).toEqual([
      ["a.test.ts", "c.test.ts"],
      ["b.test.ts", "new.test.ts"],
    ]);
  });

  test("no timings at all: equal weights, round-robin by path", () => {
    expect(planShards(["b", "c", "a", "d"], {}, 2)).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
  });

  test("empty input gives no shards", () => {
    expect(planShards([], { x: 1 }, 4)).toEqual([]);
  });

  test("n is capped at the file count", () => {
    expect(planShards(["a", "b"], { a: 1, b: 1 }, 5)).toEqual([["a"], ["b"]]);
  });

  test("property: partition, count, balance", () => {
    const fixture = fc
      .tuple(fc.integer({ min: 2, max: 8 }), fc.integer({ min: 5, max: 12 }))
      .chain(([n, perShard]) =>
        fc.record({
          n: fc.constant(n),
          times: fc.array(fc.integer({ min: 1, max: 200 }), {
            minLength: n * perShard,
            maxLength: n * perShard + 20,
          }),
        }),
      );
    fc.assert(
      fc.property(fixture, ({ n, times }) => {
        const files = times.map((_, i) => `t/f${String(i).padStart(3, "0")}.test.ts`);
        const timings = Object.fromEntries(files.map((f, i) => [f, times[i]!]));
        const shards = planShards(files, timings, n);
        expect(shards.length).toBe(Math.min(n, files.length));
        expect(shards.flat().sort()).toEqual([...files].sort());
        const loads = shards.map((s) => s.reduce((a, f) => a + timings[f]!, 0));
        const mean = loads.reduce((a, b) => a + b, 0) / shards.length;
        expect(Math.max(...loads)).toBeLessThanOrEqual(Math.max(Math.max(...times), 1.15 * mean));
      }),
      { seed: 424242, numRuns: 200 },
    );
  });
});
