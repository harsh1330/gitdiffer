import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npx netlify dev --port 8888",
    port: 8888,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: { baseURL: "http://localhost:8888" },
});
