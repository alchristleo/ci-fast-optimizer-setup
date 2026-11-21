import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { affectedTests, buildGraph, parseNameStatus } from "./affected.ts";

// Fixture repo shaped like the generated tree: tests -> support/app -> app -> domains index -> routes -> service -> lib.
function fixture(extra: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "affected-"));
  const files: Record<string, string> = {
    "src/lib/money.ts": "export const add = (a: number, b: number) => a + b;\n",
    "src/lib/validation.ts": "export type Validator = (v: unknown) => boolean;\n",
    "src/domains/a/service.ts":
      'import { add } from "../../lib/money.ts";\nexport const f = () => add(1, 2);\n',
    "src/domains/a/routes.ts":
      'import type { Validator } from "../../lib/validation.ts";\nimport {\n  f,\n} from "./service.ts";\nexport const r = (v: Validator) => f();\n',
    "src/domains/b/service.ts": 'import { f } from "../a/service.ts";\nexport const g = f;\n',
    "src/domains/c/service.ts": "export const h = 1;\n",
    "src/domains/index.ts": 'import * as a from "./a/routes.ts";\nexport const all = [a];\n',
    "src/app.ts": 'import { all } from "./domains/index.ts";\nexport const app = all;\n',
    "test/support/app.ts":
      'import { app } from "../../src/app.ts";\nexport const get = () => app;\n',
    "test/a.test.ts": 'import { get } from "./support/app.ts";\nget();\n',
    "test/b.test.ts": 'import { g } from "../src/domains/b/service.ts";\ng();\n',
    "test/c.test.ts": 'import { h } from "../src/domains/c/service.ts";\nh;\n',
    "test/money.test.ts": 'import { add } from "../src/lib/money.ts";\nadd(1, 1);\n',
    "test/types.test.ts":
      'import type { Validator } from "../src/lib/validation.ts";\nlet v: Validator;\n',
    ...extra,
  };
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}

function run(changed: [string, string][], extra: Record<string, string> = {}) {
  const root = fixture(extra);
  try {
    return affectedTests(
      changed.map(([path, status]) => ({ path, status })),
      buildGraph(root),
    );
  } finally {
    rmSync(root, { recursive: true });
  }
}

describe("affectedTests", () => {
  test("domain change runs its own tests and importers", () => {
    expect(run([["src/domains/b/service.ts", "M"]])).toEqual({
      mode: "some",
      files: ["test/b.test.ts"],
    });
    expect(run([["src/domains/c/service.ts", "M"]])).toEqual({
      mode: "some",
      files: ["test/c.test.ts"],
    });
  });

  test("lib change runs all transitive dependents", () => {
    expect(run([["src/lib/money.ts", "M"]])).toEqual({
      mode: "some",
      files: ["test/a.test.ts", "test/b.test.ts", "test/money.test.ts"],
    });
  });

  test("a changed test file runs itself", () => {
    expect(run([["test/c.test.ts", "A"]])).toEqual({ mode: "some", files: ["test/c.test.ts"] });
  });

  test("type-only import edges count, including multi-line forms", () => {
    expect(run([["src/lib/validation.ts", "M"]])).toEqual({
      mode: "some",
      files: ["test/a.test.ts", "test/types.test.ts"],
    });
  });

  test("export-from edges count", () => {
    const files = {
      "src/lib/barrel.ts": 'export * from "./money.ts";\n',
      "test/barrel.test.ts": 'import "../src/lib/barrel.ts";\n',
    };
    expect(run([["src/lib/money.ts", "M"]], files).files).toContain("test/barrel.test.ts");
  });

  test.each([
    "package.json",
    "bun.lock",
    ".github/workflows/fast.yml",
    "scripts/shard.ts",
    "tsconfig.json",
    "vitest.config.ts",
    "fixtures/schema/a.json",
    "fixtures/seed/a.json",
    "test/fixtures/data.json",
    "src/lib/data.json",
  ])("%s change runs all", (path) => {
    expect(run([[path, "M"]]).mode).toBe("all");
  });

  test("markdown and docs only run none", () => {
    expect(
      run([
        ["README.md", "M"],
        ["docs/x.html", "A"],
        ["src/lib/NOTES.md", "M"],
      ]),
    ).toEqual({ mode: "some", files: [] });
  });

  test("a deleted file still reaches its dependents from the graph", () => {
    const root = fixture();
    try {
      const graph = buildGraph(root);
      rmSync(join(root, "src/lib/money.ts"));
      const result = affectedTests([{ path: "src/lib/money.ts", status: "D" }], graph);
      expect(result.files).toContain("test/money.test.ts");
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("renames count both paths", () => {
    expect(
      run([
        ["src/domains/c/service.ts", "R"],
        ["src/domains/b/service.ts", "R"],
      ]).files,
    ).toEqual(["test/b.test.ts", "test/c.test.ts"]);
  });

  test("non-literal import in a changed file runs all", () => {
    expect(
      run([["src/lib/dyn.ts", "M"]], {
        "src/lib/dyn.ts": "const n = 'x';\nexport const m = () => import(`./${n}.ts`);\n",
      }).mode,
    ).toBe("all");
    expect(
      run([["src/lib/req.ts", "M"]], {
        "src/lib/req.ts": "export const m = (n: string) => require(n);\n",
      }).mode,
    ).toBe("all");
  });

  test("literal dynamic import is an edge, not unsafe", () => {
    const r = run([["src/lib/money.ts", "M"]], {
      "src/lib/lazy.ts": 'export const m = () => import("./money.ts");\n',
      "test/lazy.test.ts": 'import "../src/lib/lazy.ts";\n',
    });
    expect(r.mode).toBe("some");
    expect(r.files).toContain("test/lazy.test.ts");
  });

  test("unresolvable relative import in a changed file runs all", () => {
    expect(
      run([["src/lib/bad.ts", "M"]], { "src/lib/bad.ts": 'import "./missing.ts";\n' }).mode,
    ).toBe("all");
  });

  test("commented-out imports are ignored", () => {
    const r = run([["src/domains/c/service.ts", "M"]], {
      "test/commented.test.ts":
        '// import "../src/domains/c/service.ts";\n/* import "../src/domains/c/service.ts"; */\n',
    });
    expect(r.files).toEqual(["test/c.test.ts"]);
  });
});

describe("real tree shapes", () => {
  const root = join(import.meta.dirname, "..");
  const graph = buildGraph(root);

  test("a lib change reaches lib and domain tests", () => {
    const r = affectedTests([{ path: "src/lib/money.ts", status: "M" }], graph);
    expect(r.mode).toBe("some");
    expect(r.files).toContain("test/lib/money.test.ts");
    expect(r.files).toContain("test/domains/orders.test.ts");
  });

  test("a type-only import (validation.ts via routes) reaches app tests", () => {
    const r = affectedTests([{ path: "src/lib/validation.ts", status: "M" }], graph);
    expect(r.files).toContain("test/generated/accounts.test.ts");
  });

  test("a generated domain service reaches its own test", () => {
    const r = affectedTests(
      [{ path: "src/domains/generated/accounts/service.ts", status: "M" }],
      graph,
    );
    expect(r.files).toContain("test/generated/accounts.test.ts");
  });
});

describe("parseNameStatus", () => {
  test("a rename lists both paths with status R", () => {
    expect(parseNameStatus("R100\told.ts\tnew.ts\nM\ta.ts\nD\tb.ts\n")).toEqual([
      { path: "old.ts", status: "R" },
      { path: "new.ts", status: "R" },
      { path: "a.ts", status: "M" },
      { path: "b.ts", status: "D" },
    ]);
  });
});

describe("CLI against a git repo", () => {
  const script = join(import.meta.dirname, "affected.ts");
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      cwd,
      encoding: "utf8",
    });
  const commit = (cwd: string, msg: string) => {
    git(cwd, "add", "-A");
    git(cwd, "commit", "-q", "-m", msg);
  };

  // Repo on branch `feature`, forked from `main`; `onMain` commits on main after the fork.
  function cli(edit: (root: string) => void, onMain?: (root: string) => void): string {
    const root = fixture();
    try {
      git(root, "init", "-q", "-b", "main");
      commit(root, "base");
      git(root, "checkout", "-q", "-b", "feature");
      edit(root);
      commit(root, "feature");
      if (onMain) {
        git(root, "checkout", "-q", "main");
        onMain(root);
        commit(root, "main moved");
        git(root, "checkout", "-q", "feature");
      }
      return execFileSync(process.execPath, [script, "--base", "main", "--head", "feature"], {
        cwd: root,
        encoding: "utf8",
      });
    } finally {
      rmSync(root, { recursive: true });
    }
  }

  test("a docs-only diff prints nothing", () => {
    expect(cli((r) => writeFileSync(join(r, "README.md"), "hi\n"))).toBe("");
  });

  test("changes on base after the fork are ignored (merge-base)", () => {
    const out = cli(
      (r) => {
        mkdirSync(join(r, "docs"));
        writeFileSync(join(r, "docs/x.md"), "x\n");
      },
      (r) => writeFileSync(join(r, "src/domains/c/service.ts"), "export const h = 2;\n"),
    );
    expect(out).toBe("");
  });

  test("a deleted file selects the tests that imported it", () => {
    const out = cli((r) => unlinkSync(join(r, "src/domains/c/service.ts")));
    expect(out).toBe("test/c.test.ts\n");
  });

  test("a renamed file selects the tests that imported its old path", () => {
    const out = cli((r) =>
      renameSync(join(r, "src/domains/c/service.ts"), join(r, "src/domains/c/svc.ts")),
    );
    expect(out).toBe("test/c.test.ts\n");
  });
});
