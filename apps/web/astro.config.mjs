import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import netlify from "@astrojs/netlify";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  output: "hybrid",
  adapter: netlify(),
  integrations: [
    tailwind({
      applyBaseStyles: false,
      configFile: fileURLToPath(new URL("./tailwind.config.mjs", import.meta.url)),
    }),
  ],
});
