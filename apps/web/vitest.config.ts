import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**", ".astro/**"],
  },
  resolve: {
    alias: {
      "@gitdiffer/shared": new URL("../../packages/shared/src/index.ts", import.meta.url).pathname,
    },
  },
});
