import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from "@openai/sites-vite-plugin";

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const cloudflarePlugins = process.env.VITEST === "true"
    ? []
    : [
        (await import("@cloudflare/vite-plugin")).cloudflare({
          viteEnvironment: { name: "server" },
        }),
      ];

  return {
    plugins: [react(), sites(), ...cloudflarePlugins],
    server: {
      host: "127.0.0.1",
    },
    preview: {
      host: "127.0.0.1",
    },
  };
});
