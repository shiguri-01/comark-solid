/**
 * EXPERIMENTAL — not part of the public API (not exported from `src/index.ts`).
 *
 * Framework-free core of the auto-incremental parsing investigation:
 * given only a stream of string values, decide per update whether Comark's
 * serialized parser should be called with `{ streaming: true }` (incremental
 * reuse + auto-close) or `{ streaming: false }` (full parse, resets the
 * parser's streaming cache), without any `streaming` prop from the caller.
 *
 * Classification (the only signal available without a prop):
 * - `initial`: no previous *successful* value — full parse. Static documents
 *   keep exact non-streaming semantics (no dropped trailing openers, no `$`
 *   position metadata) and a later append sequence still works: the first
 *   append establishes the streaming cache with one internal full parse.
 * - `append`: `next.startsWith(prev)` and `next.length > prev.length` —
 *   streaming parse. This is exactly the precondition Comark core itself
 *   re-checks (`markdown.startsWith(lastInput)`), plus its own guards for
 *   `]:` reference definitions and headings/setext in the tail, so an
 *   over-eager classification degrades to a full parse inside core rather
 *   than to a wrong result.
 * - `edit`: anything else (middle edit, shrink, replacement) — full parse.
 *   A full parse also resets core's `lastInput`/`lastOutput`, so a stale
 *   reusable prefix can never leak into the edited document.
 * - `same`: identical to the last requested value — no parser call at all;
 *   the in-flight promise or last result is returned. This makes the factory
 *   safe to call from a Solid memo compute that may re-run speculatively.
 *
 * Stream end: without a prop there is no end signal. `finalize()` runs one
 * non-streaming parse of the current value; it is the caller's job to decide
 * when (the components in this folder use an idle timer). Finalizing is
 * idempotent per value and per parser generation.
 */
import { createSerializedMarkdownParser } from "comark";
import type { MarkdownDocument, ParserOptions } from "comark";

export type UpdateKind = "initial" | "same" | "append" | "edit";

export function classifyUpdate(prev: string | null, next: string): UpdateKind {
  if (prev === null) return "initial";
  if (next === prev) return "same";
  if (next.length > prev.length && next.startsWith(prev)) return "append";
  return "edit";
}

export interface AutoParseCall {
  kind: UpdateKind | "finalize";
  /** The `streaming` flag actually passed to the Comark parser. */
  streaming: boolean;
  /** Length of the full source value handed to the factory. */
  sourceLength: number;
}

export interface AutoIncrementalParser {
  parse(value: string): Promise<MarkdownDocument>;
  /** Run the final non-streaming parse for `value` if it was last parsed in streaming mode. */
  finalize(value: string): Promise<MarkdownDocument>;
  /** Recreate the underlying parser (invalidates all streaming state) when the options reference changes. Returns whether it recreated. */
  setOptions(options: ParserOptions | undefined): boolean;
  /** Kind/streaming decision of the most recent parse call, for tests and diagnostics. */
  readonly lastCall: AutoParseCall | null;
}

export function createAutoIncrementalParser(
  initialOptions?: ParserOptions,
  onCall?: (call: AutoParseCall) => void,
): AutoIncrementalParser {
  let options = initialOptions;
  let parse = createSerializedMarkdownParser(options ?? {});

  // Baseline for classification: the source of the latest request. Advanced
  // optimistically when a request starts (so overlapping/same-value calls
  // dedupe), rolled back if that request rejects — a failed value never
  // becomes the baseline, mirroring core, whose `lastInput` does not advance
  // when a `pre` plugin throws.
  let lastSource: string | null = null;
  let lastStreaming = false;
  let lastResult: MarkdownDocument | null = null;
  let pending: { source: string; promise: Promise<MarkdownDocument> } | null = null;
  let finalizedSource: string | null = null;
  let lastCall: AutoParseCall | null = null;

  function run(value: string, kind: AutoParseCall["kind"], streaming: boolean) {
    lastCall = { kind, streaming, sourceLength: value.length };
    onCall?.(lastCall);
    const baseline = lastSource;
    lastSource = value;
    const promise = parse(value, { streaming }).then(
      (document) => {
        if (pending?.promise === promise) pending = null;
        lastResult = document;
        lastStreaming = streaming;
        if (!streaming) finalizedSource = value;
        return document;
      },
      (error) => {
        if (pending?.promise === promise) pending = null;
        if (lastSource === value) lastSource = baseline;
        throw error;
      },
    );
    pending = { source: value, promise };
    return promise;
  }

  const api: AutoIncrementalParser = {
    get lastCall() {
      return lastCall;
    },

    parse(value) {
      const kind = classifyUpdate(lastSource, value);
      if (kind === "same") {
        if (pending?.source === value) return pending.promise;
        if (lastResult) return Promise.resolve(lastResult);
      }
      return run(value, kind, kind === "append");
    },

    finalize(value) {
      // Finalizing a superseded value must be a no-op: parsing it would
      // move the baseline backwards and corrupt the current stream state.
      if (value !== lastSource) {
        return lastResult ? Promise.resolve(lastResult) : api.parse(value);
      }
      if (!lastStreaming || finalizedSource === value) {
        return Promise.resolve(lastResult!);
      }
      return run(value, "finalize", false);
    },

    setOptions(next) {
      if (next === options) return false;
      options = next;
      parse = createSerializedMarkdownParser(options ?? {});
      lastSource = null;
      lastStreaming = false;
      lastResult = null;
      pending = null;
      finalizedSource = null;
      return true;
    },
  };

  return api;
}
