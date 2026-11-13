import { createSerializedMarkdownParser, parseMarkdown } from "comark";
import type { ComarkPlugin } from "comark";
import { describe, expect, it } from "vite-plus/test";

import { createAutoIncrementalParser } from "../../src/experimental/auto-incremental";

/**
 * Benchmarks in the style of Comark React PR #397: the primary metric is
 * total parser input (characters handed to plugin `pre` hooks across all
 * updates), which is deterministic; wall time is printed for reference.
 *
 * Strategies per scenario:
 * - naive: one-shot `parseMarkdown` per update (current comark-solid behaviour)
 * - explicit streaming: one serialized parser, `{ streaming: true }` from the first chunk
 * - auto: `createAutoIncrementalParser` (initial full + priming append + incremental appends)
 */

const CHUNK = 70;

function chunksOf(full: string): string[] {
  const chunks: string[] = [];
  for (let i = CHUNK; i < full.length; i += CHUNK) chunks.push(full.slice(0, i));
  chunks.push(full);
  return chunks;
}

function counter() {
  const state = { chars: 0, calls: 0 };
  const plugin: ComarkPlugin = {
    name: "counter",
    pre: (s) => {
      state.chars += s.markdown.length;
      state.calls++;
    },
  };
  return { state, plugin };
}

async function runNaive(chunks: string[]) {
  const { state, plugin } = counter();
  const t0 = performance.now();
  for (const chunk of chunks) await parseMarkdown(chunk, { plugins: [plugin] });
  return { ...state, ms: performance.now() - t0 };
}

async function runExplicit(chunks: string[]) {
  const { state, plugin } = counter();
  const parse = createSerializedMarkdownParser({ plugins: [plugin] });
  const t0 = performance.now();
  for (const chunk of chunks) await parse(chunk, { streaming: true });
  return { ...state, ms: performance.now() - t0 };
}

async function runAuto(chunks: string[]) {
  const { state, plugin } = counter();
  const auto = createAutoIncrementalParser({ plugins: [plugin] });
  const t0 = performance.now();
  for (const chunk of chunks) await auto.parse(chunk);
  return { ...state, ms: performance.now() - t0 };
}

const scenarios: Record<string, string> = {
  prose: Array.from(
    { length: 60 },
    (_, i) => `Paragraph number ${i} with a fair amount of plain prose text to read.`,
  ).join("\n\n"),
  mixed: Array.from({ length: 12 }, (_, s) =>
    [
      `## Section ${s}`,
      ...Array.from(
        { length: 8 },
        (_, i) => `Paragraph ${s}.${i} with a fair amount of plain prose text to read.`,
      ),
    ].join("\n\n"),
  ).join("\n\n"),
  "heading-dense": Array.from({ length: 60 }, (_, i) => `## Section ${i}\n\nShort body ${i}.`).join(
    "\n\n",
  ),
};

describe("benchmarks: parser input per strategy", () => {
  for (const [name, full] of Object.entries(scenarios)) {
    it(name, async () => {
      const chunks = chunksOf(full);
      const naive = await runNaive(chunks);
      const explicit = await runExplicit(chunks);
      const auto = await runAuto(chunks);
      const saving = (a: number) => `${(((naive.chars - a) / naive.chars) * 100).toFixed(1)}%`;
      console.log(
        `[bench] ${name}: doc=${full.length} chars, updates=${chunks.length}\n` +
          `  naive    : ${naive.chars} chars, ${naive.calls} calls, ${naive.ms.toFixed(1)}ms\n` +
          `  explicit : ${explicit.chars} chars (${saving(explicit.chars)} saved), ${explicit.calls} calls, ${explicit.ms.toFixed(1)}ms\n` +
          `  auto     : ${auto.chars} chars (${saving(auto.chars)} saved), ${auto.calls} calls, ${auto.ms.toFixed(1)}ms`,
      );
      // Auto must never hand the parser more input than the naive path
      // (heading-dense content ties: core declines reuse there — see report).
      expect(auto.chars).toBeLessThanOrEqual(naive.chars);
      if (name === "prose") expect(auto.chars / naive.chars).toBeLessThan(0.1);
      if (name === "mixed") expect(auto.chars / naive.chars).toBeLessThan(0.25);
    });
  }
});
