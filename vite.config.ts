import solidPlugin from "@solidjs/vite-plugin";
import solidEslint from "eslint-plugin-solid/configs/v2";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  plugins: lazyPlugins(() => [solidPlugin()]),
  pack: {
    deps: {
      // tsdown <0.23 compatibility: resolve external dependency subpaths.
      // Remove to preserve subpath imports as written (the new default).
      // https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
      resolveDepSubpath: true,
    },
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
          environment: "jsdom",
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
