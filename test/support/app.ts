import { beforeEach } from "bun:test";
import type { Hono } from "hono";
import { createApp } from "../../src/app.ts";
import { resetStore } from "../../src/lib/store.ts";

let app: Hono | undefined;

// Memoized: built once per module registry (once per `bun test` process, once per file in vitest).
export function getTestApp(): Hono {
  app ??= createApp();
  return app;
}

// Call at the top level of each test file: registers the per-file store reset.
export function useTestApp(): Hono {
  beforeEach(() => resetStore());
  return getTestApp();
}

export function send(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
