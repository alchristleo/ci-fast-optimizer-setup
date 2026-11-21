import { readFileSync } from "node:fs";
import { Glob } from "bun";

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** LPT greedy: longest file first into the least-loaded shard; ties by path / lowest index. */
export function planShards(
  files: string[],
  timings: Record<string, number>,
  n: number,
): string[][] {
  if (files.length === 0) return [];
  const fallback = median(files.filter((f) => f in timings).map((f) => timings[f]!));
  const time = (f: string) => Math.max(1, timings[f] ?? fallback); // zero-time files must still spread
  const sorted = [...files].sort((a, b) => time(b) - time(a) || (a < b ? -1 : a > b ? 1 : 0));
  const count = Math.min(n, files.length);
  const shards: string[][] = Array.from({ length: count }, () => []);
  const loads = Array.from({ length: count }, () => 0);
  for (const f of sorted) {
    let min = 0;
    for (let i = 1; i < count; i++) if (loads[i]! < loads[min]!) min = i;
    shards[min]!.push(f);
    loads[min]! += time(f);
  }
  return shards;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const arg = (name: string) => args[args.indexOf(name) + 1];
  const index = Number(arg("--index"));
  const total = Number(arg("--total"));
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 0) {
    console.error("usage: bun scripts/shard.ts --index i --total n [--files-from list.txt]");
    process.exit(2);
  }
  const listFile = args.includes("--files-from") ? arg("--files-from")! : undefined;
  const files = listFile
    ? readFileSync(listFile, "utf8").split("\n").filter(Boolean)
    : [...new Glob("{test,scripts}/**/*.test.ts").scanSync(".")];
  let timings: Record<string, number> = {};
  try {
    timings = JSON.parse(readFileSync(".ci/test-timings.json", "utf8"));
  } catch {}
  for (const f of planShards(files, timings, total)[index] ?? []) console.log(f);
}
