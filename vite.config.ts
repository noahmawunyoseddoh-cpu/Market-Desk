import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  // Use Miniflare's local Request.cf placeholder instead of fetching a live one.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    plugins: [
      vinext(),
      // Reads bindings from wrangler.toml at the project root.
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      }),
    ],
  };
});
