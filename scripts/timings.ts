import { readFileSync } from "node:fs";

const entities: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&amp;": "&",
};
const unescape = (s: string): string => s.replace(/&(lt|gt|quot|apos|amp);/g, (m) => entities[m]!);

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unescape(m[1]!) : undefined;
}

// Per-file ms, summed across testcases. Works for bun (`file`) and vitest (`classname`) junit.
export function mergeJunit(xmls: string[]): Record<string, number> {
  const seconds: Record<string, number> = {};
  for (const xml of xmls) {
    for (const [tag] of xml.matchAll(/<testcase\b[^>]*>/g)) {
      const file = attr(tag, "file") ?? attr(tag, "classname");
      if (!file) continue;
      seconds[file] = (seconds[file] ?? 0) + Number(attr(tag, "time") ?? 0);
    }
  }
  return Object.fromEntries(
    Object.entries(seconds)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([f, s]) => [f, Math.round(s * 1000)]),
  );
}

if (import.meta.main) {
  const [cmd, ...paths] = process.argv.slice(2);
  if (cmd !== "merge" || paths.length === 0) {
    console.error("usage: bun scripts/timings.ts merge <junit.xml...> > timings.json");
    process.exit(2);
  }
  console.log(JSON.stringify(mergeJunit(paths.map((p) => readFileSync(p, "utf8"))), null, 2));
}
