import { createSerializedMarkdownParser } from "comark";
import type { MarkdownDocument as MarkdownDocumentType, ParserOptions } from "comark";
import { isMarkdownDocument } from "comark/utils";
import { createMemo, merge, omit, type Component } from "solid-js";

import { MarkdownDocument, type MarkdownDocumentProps } from "./MarkdownDocument";

export interface MarkdownProps extends Omit<MarkdownDocumentProps, "value"> {
  /**
   * Markdown source or an already-parsed Comark document.
   */
  value: string | MarkdownDocumentType;

  /**
   * Options passed to the Comark Markdown parser.
   *
   * Ignored when `value` is an already-parsed document.
   *
   * @default undefined
   */
  options?: ParserOptions;

  /**
   * Enable streaming mode.
   *
   * @default false
   */
  streaming?: boolean;
}

/**
 * Markdown component
 *
 * Renders a Markdown string or an already-parsed Comark document using Solid components.
 * Markdown strings are parsed on the client before rendering.
 *
 * Supports custom component mapping for element tags.
 *
 * @example
 * ```tsx
 * import { Markdown } from "comark-solid";
 * import { Loading } from "solid-js";
 * import { CustomHeading } from "./CustomHeading";
 *
 * const components = {
 *   h1: CustomHeading,
 * };
 *
 * export default function App() {
 *   return (
 *     <Loading fallback={<div>Loading...</div>}>
 *       <Markdown
 *         value={source}
 *         components={components}
 *       />
 *     </Loading>
 *   );
 * }
 * ```
 */
export const Markdown: Component<MarkdownProps> = (_props) => {
  const props = merge({ components: {}, data: {}, streaming: false }, _props);
  const rest = omit(props, "value", "options", "streaming");

  const parse = createMemo(() => createSerializedMarkdownParser(props.options));
  const document = createMemo(() => {
    const value = props.value;
    return isMarkdownDocument(value) ? value : parse()(value, { streaming: props.streaming });
  });

  return <MarkdownDocument value={document()} {...rest} />;
};
