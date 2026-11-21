import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "bun:test": fileURLToPath(new URL("./test/support/bun-test.ts", import.meta.url)) },
  },
  test: { include: ["test/**/*.test.ts"] },
});
