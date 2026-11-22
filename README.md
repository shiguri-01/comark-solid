# comark-solid

Solid renderer for [Comark](https://comark.dev).

## Installation

```bash
npm install comark-solid comark solid-js @solidjs/web
```

## `<Markdown>`

`<Markdown>` parses Markdown strings and renders them directly.
Parsing is asynchronous, so it suspends to the nearest `<Loading>` boundary.

```tsx
import { Markdown } from "comark-solid";
import { Loading } from "solid-js";

const markdown = "# Hello World";

export default function App() {
  return (
    <Loading fallback={<p>Loading Markdown…</p>}>
      <Markdown value={markdown} />
    </Loading>
  );
}
```

### Props

| Prop            | Type                                        | Default      | Description                                                                     |
| :-------------- | :------------------------------------------ | :----------- | :------------------------------------------------------------------------------ |
| `value`         | `string \| MarkdownDocument`                | _(Required)_ | Markdown string or pre-parsed document.                                         |
| `options`       | `ParserOptions`                             | `undefined`  | Options for parsing Markdown strings.                                           |
| `streaming`     | `boolean`                                   | `false`      | Enable incremental parsing and reuse rendered blocks during streaming.          |
| `transformNode` | `NodeTransform \| readonly NodeTransform[]` | `undefined`  | Transform resolved element tags and props before rendering.                     |
| `components`    | `Record<string, ValidComponent>`            | `{}`         | Map of AST node names to Solid components.                                      |
| `data`          | `Record<string, unknown>`                   | `{}`         | Runtime values referenced from markdown via `:prop="data.path"`.                |
| `class`         | `JSX.ClassValue`                            | `undefined`  | Additional classes for the wrapper `div` (`comark-content` is always included). |

Other `div` props, except `children`, are passed to the wrapper element.

## `<MarkdownDocument>`

`<MarkdownDocument>` renders a `MarkdownDocument` AST produced by `parseMarkdown()`.
It separates rendering from parsing, making it particularly useful for server-side parsing.

```tsx
import { parseMarkdown } from "comark";
import { MarkdownDocument } from "comark-solid";

const document = await parseMarkdown("# Hello World");

export default function App() {
  return <MarkdownDocument value={document} />;
}
```

### Props

| Prop            | Type                                        | Default      | Description                                                                     |
| :-------------- | :------------------------------------------ | :----------- | :------------------------------------------------------------------------------ |
| `value`         | `MarkdownDocument`                          | _(Required)_ | Pre-parsed Comark document AST.                                                 |
| `streaming`     | `boolean`                                   | `false`      | Reuse rendered blocks whose AST node references are retained between updates.   |
| `transformNode` | `NodeTransform \| readonly NodeTransform[]` | `undefined`  | Transform resolved element tags and props before rendering.                     |
| `components`    | `Record<string, ValidComponent>`            | `{}`         | Map of AST node names to Solid components.                                      |
| `data`          | `Record<string, unknown>`                   | `{}`         | Runtime values referenced from markdown via `:prop="data.path"`.                |
| `class`         | `JSX.ClassValue`                            | `undefined`  | Additional classes for the wrapper `div` (`comark-content` is always included). |

Other `div` props, except `children`, are passed to the wrapper element.

## Custom Components

Map tags to Solid components via the `components` prop:

```tsx
import { Markdown } from "comark-solid";
import { Loading } from "solid-js";

import { Card } from "./Card";
import { CustomHeading } from "./CustomHeading";

const markdown = "# Hello World\n\n::card\nCard content\n::";
const components = {
  h1: CustomHeading,
  card: Card,
};

export default function App() {
  return (
    <Loading fallback={<p>Loading Markdown…</p>}>
      <Markdown value={markdown} components={components} />
    </Loading>
  );
}
```

Place `<Loading>` around async content inside a custom component to keep the surrounding Markdown
visible. Wrap the document in `<Loading>` for a shared fallback.
Components can also be loaded on demand with `lazy()`.

## Component bindings

### Props

Attributes in Comark syntax are passed as props to your component.
Use the `:` prefix to pass typed values:

| Markdown                    | Prop value                |
| :-------------------------- | :------------------------ |
| `{type="warning"}`          | `"warning"` (string)      |
| `{:count="5"}`              | `5` (number)              |
| `{:active=true}`            | `true` (boolean)          |
| `{:config='{"key":"val"}'}` | `{ key: "val" }` (object) |

### Slots

The default slot is passed as `children`.
Named slots (e.g. `#header`) are passed as props prefixed with `slot` (`slotHeader`).

```markdown
::card
#header
Header content

#default
Body content
::
```

```tsx
interface CardProps {
  slotHeader?: JSX.Element;
  children?: JSX.Element;
}

export default function Card(props: CardProps) {
  return (
    <div>
      <Show when={props.slotHeader}>{(header) => <div>{header}</div>}</Show>
      <div>{props.children}</div>
    </div>
  );
}
```

## Development

Install the dependencies and the Chromium headless shell before running tests:

```sh
vp install
vp exec playwright install --only-shell chromium
vp test
```

On Linux, add `--with-deps` to the Playwright install command if system libraries are missing.

## Acknowledgements

This project is heavily based on the official [Comark React renderer](https://github.com/comarkdown/comark/tree/main/packages/comark-react),
adapted for Solid's component model and APIs.

The original implementation is licensed under the MIT License.

## License

MIT
