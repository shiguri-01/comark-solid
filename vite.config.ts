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
    exports: true,
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
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest-setup.ts"],
    // Remove this option when tests need module isolation.
    isolate: false,
  },
});
