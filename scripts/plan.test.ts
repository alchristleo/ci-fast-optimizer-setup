import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { planFiles, planMatrix, resolveMode } from "./plan.ts";

const names = (n: number) => Array.from({ length: n }, (_, i) => `test/t${i}.test.ts`);

describe("resolveMode", () => {
  test("push is full", () => {
    expect(resolveMode({ EVENT: "push" }, "h")).toEqual({ mode: "full", base: "", head: "h" });
  });
  test("pull_request is pr with PR_BASE", () => {
    expect(resolveMode({ EVENT: "pull_request", PR_BASE: "b" }, "h")).toEqual({
      mode: "pr",
      base: "b",
      head: "h",
    });
  });
  test("dispatch full", () => {
    expect(resolveMode({ EVENT: "workflow_dispatch", IN_MODE: "full" }, "h")).toEqual({
      mode: "full",
      base: "",
      head: "h",
    });
  });
  test("dispatch pr uses IN_BASE and IN_HEAD", () => {
    expect(
      resolveMode({ EVENT: "workflow_dispatch", IN_MODE: "pr", IN_BASE: "b", IN_HEAD: "x" }, "h"),
    ).toEqual({ mode: "pr", base: "b", head: "x" });
  });
  test("dispatch pr with empty base or head throws", () => {
    for (const [b, h] of [
      ["", "x"],
      ["b", ""],
    ])
      expect(() =>
        resolveMode({ EVENT: "workflow_dispatch", IN_MODE: "pr", IN_BASE: b, IN_HEAD: h }, "h"),
      ).toThrow("pr mode needs base and head");
  });
});

describe("planMatrix", () => {
  test("0 files gives count 0 and an empty include", () => {
    expect(planMatrix([], {})).toEqual({ count: 0, matrix: { include: [] } });
  });
  test("3 files give 3 shards", () => {
    const { count, matrix } = planMatrix(names(3), {});
    expect(count).toBe(3);
    expect(matrix.include.map((s) => s.shard)).toEqual([0, 1, 2]);
  });
  test("131 files give 4 shards covering every file once", () => {
    const files = names(131);
    const { count, matrix } = planMatrix(files, {});
    expect(count).toBe(4);
    const all = matrix.include.flatMap((s) => s.files.split(" "));
    expect(all.sort()).toEqual([...files].sort());
  });
  test("a path with whitespace throws and names the path", () => {
    expect(() => planMatrix(["test/a\nx.test.ts"], {})).toThrow("whitespace in test path");
    expect(() => planMatrix(["test/a x.test.ts"], {})).toThrow("test/a x.test.ts");
  });
  test("files are space-joined with no trailing space", () => {
    const { matrix } = planMatrix(["a.test.ts", "b.test.ts"], { "a.test.ts": 5, "b.test.ts": 1 });
    expect(matrix.include).toEqual([
      { shard: 0, files: "a.test.ts" },
      { shard: 1, files: "b.test.ts" },
    ]);
  });
});

describe("equivalence with shard.ts", () => {
  const timings = JSON.parse(readFileSync(".ci/test-timings.json", "utf8"));
  const real = execFileSync("find", ["test", "-name", "*.test.ts"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .sort();
  for (const [label, files] of [
    ["real list", real],
    ["0 files", []],
    ["1 file", real.slice(0, 1)],
    ["3 files", real.slice(0, 3)],
    ["5 files", real.slice(0, 5)],
  ] as const) {
    test(label, () => {
      const dir = mkdtempSync(join(tmpdir(), "plan-eq-"));
      try {
        const list = join(dir, "list.txt");
        writeFileSync(list, files.map((f) => `${f}\n`).join(""));
        const { count, matrix } = planMatrix([...files], timings);
        const n = Math.min(4, files.length);
        expect(count).toBe(n);
        for (let i = 0; i < n; i++) {
          const old = execFileSync(
            "bun",
            ["scripts/shard.ts", "--index", String(i), "--total", String(n), "--files-from", list],
            { encoding: "utf8" },
          )
            .split("\n")
            .filter(Boolean);
          expect(matrix.include[i]).toEqual({ shard: i, files: old.join(" ") });
        }
      } finally {
        rmSync(dir, { recursive: true });
      }
    });
  }
});

describe("planFiles", () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.hooksPath=/dev/null", ...args],
      { cwd, encoding: "utf8" },
    );
  const put = (root: string, p: string, body: string) => {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), body);
  };

  test("full lists test files sorted by code unit, ignoring other dirs", () => {
    const root = mkdtempSync(join(tmpdir(), "plan-"));
    try {
      put(root, "test/b.test.ts", "");
      put(root, "test/B.test.ts", "");
      put(root, "test/sub/a.test.ts", "");
      put(root, "test/support/x.ts", "");
      put(root, "scripts/s.test.ts", "");
      expect(planFiles({ mode: "full", base: "", head: "h" }, root)).toEqual([
        "test/B.test.ts",
        "test/b.test.ts",
        "test/sub/a.test.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("full lists test files under dot-directories", () => {
    const root = mkdtempSync(join(tmpdir(), "plan-"));
    try {
      put(root, "test/.hid/a.test.ts", "");
      expect(planFiles({ mode: "full", base: "", head: "h" }, root)).toEqual([
        "test/.hid/a.test.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("pr mode drops a test deleted at head", () => {
    const root = mkdtempSync(join(tmpdir(), "plan-"));
    try {
      put(root, "src/lib/m.ts", "export const m = 1;\n");
      put(root, "test/a.test.ts", 'import { m } from "../src/lib/m.ts";\nm;\n');
      put(root, "test/b.test.ts", 'import { m } from "../src/lib/m.ts";\nm;\n');
      git(root, "init", "-q", "-b", "main");
      git(root, "add", "-A");
      git(root, "commit", "-qm", "base");
      git(root, "checkout", "-q", "-b", "feature");
      unlinkSync(join(root, "test/b.test.ts"));
      put(root, "src/lib/m.ts", "export const m = 2;\n");
      git(root, "add", "-A");
      git(root, "commit", "-qm", "feature");
      expect(planFiles({ mode: "pr", base: "main", head: "feature" }, root)).toEqual([
        "test/a.test.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});

test("CLI writes count and matrix to GITHUB_OUTPUT", () => {
  const out = join(mkdtempSync(join(tmpdir(), "plan-cli-")), "out");
  const env = { ...process.env, EVENT: "push", GITHUB_OUTPUT: out };
  execFileSync("bun", ["scripts/plan.ts"], { env, encoding: "utf8" });
  const lines = Object.fromEntries(
    readFileSync(out, "utf8")
      .trim()
      .split("\n")
      .map((l) => l.split(/=(.*)/s)),
  );
  const matrix = JSON.parse(lines.matrix!);
  expect(Number(lines.count)).toBe(matrix.include.length);
  expect(matrix.include.length).toBeGreaterThan(0);
});
