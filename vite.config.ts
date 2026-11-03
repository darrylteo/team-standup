import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) =>
  mode === "demo"
    ? // Public demo: a static build whose API runs in the page (src/demo), deployed by `npm run demo:deploy` (wrangler.demo.jsonc).
      {
        plugins: [
          react(),
          // "pre", so the build bundles the demo entry instead of only rewriting the finished page.
          { name: "demo-entry", transformIndexHtml: { order: "pre", handler: (html: string) => html.replace("/src/client/main.tsx", "/src/demo/main.ts") } },
        ],
        build: { outDir: "dist-demo", target: "es2022" },
      }
    : {
        // STANDUP_STATE gives the browser tests their own local database (see scripts/reset-local.mjs).
        plugins: [react(), cloudflare({ persistState: process.env.STANDUP_STATE ? { path: process.env.STANDUP_STATE } : true })],
      },
);
