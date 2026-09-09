import solidPlugin from "@solidjs/vite-plugin";
import solidEslint from "eslint-plugin-solid/configs/v2";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  plugins: lazyPlugins(() => [solidPlugin()]),
  pack: {
    platform: "neutral",
    plugins: [
      solidPlugin({
        hot: false,
      }),
    ],
    dts: {
      tsgo: true,
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
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest-setup.ts"],
    // Remove this option when tests need module isolation.
    isolate: false,
  },
});
