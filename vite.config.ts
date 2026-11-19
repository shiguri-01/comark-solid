import solidPlugin from "@solidjs/vite-plugin";
import solidEslint from "eslint-plugin-solid/configs/v2";
import { defineConfig, lazyPlugins } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  plugins: lazyPlugins(() => [solidPlugin()]),
  pack: {
    platform: "neutral",
    plugins: [
      solidPlugin({
        refresh: false,
      }),
    ],
    dts: {
      generator: "tsgo",
    },
  },
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
