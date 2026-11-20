import solidVite from "@solidjs/vite-plugin";
import solidEslint from "eslint-plugin-solid/configs/v2";
import solidRolldown from "unplugin-solid/rolldown";
import { defineConfig, lazyPlugins } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  plugins: lazyPlugins(() => [solidVite()]),
  pack: [
    {
      name: "browser",
      platform: "neutral",
      entry: ["src/index.ts"],
      outDir: "dist/browser",
      dts: { generator: "tsgo" },
      plugins: [
        solidRolldown({
          solid: {
            generate: "dom",
            hydratable: true,
          },
        }),
      ],
    },
    {
      name: "server",
      platform: "neutral",
      entry: ["src/index.ts"],
      outDir: "dist/server",
      dts: false,
      plugins: [
        solidRolldown({
          ssr: true,
          solid: {
            generate: "ssr",
            hydratable: true,
          },
        }),
      ],
    },
  ],
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }, "eslint-plugin-solid"],
    settings: solidEslint.settings,
    rules: { "vite-plus/prefer-vite-plus-imports": "error", ...solidEslint.rules },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: { sortImports: true },
  test: {
    isolate: false,
    projects: [
      {
        extends: true,
        test: {
          name: "client",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
          include: ["tests/*.test.{ts,tsx}"],
          setupFiles: ["./vitest-setup.ts"],
        },
      },
      {
        extends: true,
        test: { name: "ssr", environment: "node", include: ["tests/ssr/**/*.test.tsx"] },
      },
    ],
  },
});
