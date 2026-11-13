/**
 * EXPERIMENTAL — not part of the public API (not exported from `src/index.ts`).
 *
 * Comparison variant of `MarkdownAuto` built the way the current `<Markdown>`
 * is built — one async memo — upgraded with `createDeferred` (Solid 2.0's
 * "may lag but never leads" memo, the analogue of React's `useDeferredValue`
 * in the React renderer's PR #397) and backed by the same
 * `createAutoIncrementalParser` + `createSerializedMarkdownParser`.
 *
 * Known structural limits, verified by the tests in
 * `tests/experimental/`:
 * - The parse call sits inside a memo compute. The factory's same-value
 *   dedupe makes speculative re-runs harmless, but the pattern still relies
 *   on the factory being idempotent per value.
 * - There is nowhere principled to hang the idle-finalize timer: a timer is
 *   a side effect and does not belong in a compute. This variant therefore
 *   has no stream-end handling at all.
 */
import type { ParserOptions } from "comark";
import {
  createDeferred,
  createMemo,
  merge,
  Show,
  type Component,
  type ValidComponent,
} from "solid-js";

import { MarkdownDocument } from "../components/MarkdownDocument";
import type { MarkdownDocumentProps } from "../components/MarkdownDocument";
import { createAutoIncrementalParser } from "./auto-incremental";

export interface MarkdownAutoMemoProps extends Omit<MarkdownDocumentProps, "value"> {
  /** Markdown source. Strings only. */
  value: string;
  options?: ParserOptions;
  components?: Record<string, ValidComponent>;
  data?: Record<string, unknown>;
  class?: string;
}

export const MarkdownAutoMemo: Component<MarkdownAutoMemoProps> = (_props) => {
  const props = merge({ components: {}, data: {} }, _props);

  const parser = createMemo(() => createAutoIncrementalParser(props.options));

  const document = createDeferred(() => parser().parse(props.value));

  return (
    <Show when={document()}>
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
