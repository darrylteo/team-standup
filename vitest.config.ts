import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/unit/**/*.test.ts", "tests/demo/**/*.test.ts"], environment: "node" } },
      {
        plugins: [
          cloudflareTest(async () => ({
            main: "./src/worker/index.ts",
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              // Blank Access values, so the tests sign in with DEV_USER (production's values are in wrangler.jsonc).
              bindings: { TEST_MIGRATIONS: await readD1Migrations("./migrations"), DEV_USER: "alex@lab.test", ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" },
            },
          })),
        ],
        test: { name: "worker", include: ["tests/integration/**/*.test.ts"], setupFiles: ["./tests/integration/setup.ts"] },
      },
    ],
  },
});
