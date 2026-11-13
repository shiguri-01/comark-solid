/**
 * EXPERIMENTAL — not part of the public API (not exported from `src/index.ts`).
 *
 * String-only `<Markdown>` variant that automates Comark incremental parsing
 * without a `streaming` prop, built on an explicit signal + two-arg
 * `createEffect` (the Svelte renderer's `$state`/`$effect` shape, translated
 * to Solid 2.0 idioms):
 *
 * - The parser/classifier state lives in a plain closure per component
 *   instance — never at module scope, where a serialized parser would leak
 *   streaming state across documents (and across SSR requests).
 * - A completed parse is stored in a signal, so while the next parse is in
 *   flight the previous document stays on screen (the behaviour React gets
 *   from `useDeferredValue` and Svelte tests require explicitly).
 * - Results are applied under a *parser-generation* guard: a result is
 *   dropped only if the parser instance changed (options identity) or the
 *   component was disposed while it was in flight. Value changes alone do
 *   NOT invalidate in-flight results — the serialized parser resolves in
 *   call order, so a completed intermediate update is still the newest
 *   *landed* result and is shown while the next parse runs.
 * - Stream end is handled by an optional idle finalize: when the value has
 *   been stable for `finalizeDelayMs`, one non-streaming parse replaces the
 *   last streaming result. Disabled unless a delay is passed.
 * - Errors do NOT throw to an `<Errored>` boundary. Verified on Solid
 *   2.0.0-rc.21: when a memo read in the rendered output throws, the
 *   errored branch's computations are disposed — including this
 *   component's effect — so a later prop change never re-runs the parse
 *   and the boundary can never heal (the `createDeferred` variant, whose
 *   error lives in an async memo, does heal). Instead, a failed parse
 *   keeps the last good document on screen (the same philosophy as core's
 *   streaming tokenize-error handling) and only shows an inline alert
 *   when there is no document to show yet. The next successful parse
 *   clears the error.
 */
import type { MarkdownDocument as MarkdownDocumentType, ParserOptions } from "comark";
import {
  createEffect,
  createMemo,
  createSignal,
  merge,
  Show,
  type Component,
  type ValidComponent,
} from "solid-js";

import { MarkdownDocument } from "../components/MarkdownDocument";
import type { MarkdownDocumentProps } from "../components/MarkdownDocument";
import { createAutoIncrementalParser } from "./auto-incremental";

export interface MarkdownAutoProps extends Omit<MarkdownDocumentProps, "value"> {
  /** Markdown source. Strings only — pre-parsed documents keep using `<Markdown>` / `<MarkdownDocument>`. */
  value: string;
  options?: ParserOptions;
  components?: Record<string, ValidComponent>;
  data?: Record<string, unknown>;
  class?: string;
  /**
   * EXPERIMENTAL stream-end handling: idle milliseconds after the last
   * append before a final non-streaming parse runs. `undefined` disables
   * finalization (pure auto mode).
   */
  finalizeDelayMs?: number;
}

export const MarkdownAuto: Component<MarkdownAutoProps> = (_props) => {
  const props = merge({ components: {}, data: {} }, _props);

  // Parser factory per options identity. Creating a factory is side-effect
  // free (no parse runs), so it is safe inside a memo compute; parsing is not.
  const parser = createMemo(() => createAutoIncrementalParser(props.options));

  const [document, setDocument] = createSignal<MarkdownDocumentType | null>(null);
  const [error, setError] = createSignal<unknown>(null);

  // Bumped when the parser instance changes (options identity) —
  // deliberately NOT bumped on value changes (see header). Disposal needs
  // no bump: the effect cleanup below clears the finalize timer, and
  // writes to disposed signals are dropped by Solid.
  // (An earlier draft bumped this in an `onSettled` cleanup; that cleanup
  // fires when activity settles, which invalidated the idle-finalize timer
  // and late recoveries — exactly the work that lives past a settle.)
  let parserGeneration = 0;
  let activeParser: unknown = null;

  // Newest value requested so far. Parse resolutions arrive in call order
  // (the parser is serialized), so applying every landed result is safe —
  // but scheduling a finalize for a superseded value is not: its timer
  // would fire into a newer stream. Finalize is therefore gated on the
  // value still being the latest, both when scheduled and when fired.
  let latestValue: string | null = null;

  createEffect(
    () => [props.value, props.options] as const,
    ([value]) => {
      latestValue = value;
      const current = parser();
      if (current !== activeParser) {
        activeParser = current;
        parserGeneration++;
      }
      const gen = parserGeneration;
      let timer: ReturnType<typeof setTimeout> | undefined;

      current.parse(value).then(
        (parsed) => {
          if (gen !== parserGeneration) return;
          setError(null);
          setDocument(parsed);

          if (props.finalizeDelayMs !== undefined && value === latestValue) {
            timer = setTimeout(() => {
              if (value !== latestValue) return;
              current.finalize(value).then(
                (finalized) => {
                  if (gen !== parserGeneration || value !== latestValue) return;
                  setError(null);
                  setDocument(finalized);
                },
                (finalizeError) => {
                  if (gen === parserGeneration) setError(finalizeError);
                },
              );
            }, props.finalizeDelayMs);
          }
        },
        (parseError) => {
          if (gen === parserGeneration) setError(parseError);
        },
      );

      return () => {
        if (timer !== undefined) clearTimeout(timer);
      };
    },
  );

  const errorMessage = () => {
    const current = error();
    return current instanceof Error ? current.message : String(current);
  };

  return (
    <Show when={document()} fallback={error() ? <div role="alert">{errorMessage()}</div> : null}>
      {(doc) => (
        <MarkdownDocument
          value={doc()}
          components={props.components}
          data={props.data}
          transformNode={props.transformNode}
          class={props.class}
        />
      )}
    </Show>
  );
};
