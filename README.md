# comark-solid

Solid renderer for [Comark](https://comark.dev).

> [!WARNING]
> **Pre-release: Solid 2.0 RC**
>
> This package targets the Solid 2.0 RC versions of `solid-js` and `@solidjs/web`. Solid 2.0 is not stable yet, so bugs and compatibility issues may occur.

## Installation

```bash
npm install comark-solid comark
```

## `<Markdown>`

Parses Markdown strings and renders them directly.

```tsx
import { Markdown } from "comark-solid";

const markdown = "# Hello World";

export default function App() {
  return <Markdown value={markdown} />;
}
```

### Props

| Prop            | Type                                        | Default      | Description                                                                     |
| :-------------- | :------------------------------------------ | :----------- | :------------------------------------------------------------------------------ |
| `value`         | `string \| MarkdownDocument`                | _(Required)_ | Markdown string or pre-parsed document.                                         |
| `options`       | `ParserOptions`                             | `undefined`  | Options for parsing Markdown strings.                                           |
| `streaming`     | `boolean`                                   | `false`      | Enable streaming mode.                                                          |
| `transformNode` | `NodeTransform \| readonly NodeTransform[]` | `undefined`  | Transform resolved element tags and props before rendering.                     |
| `components`    | `Record<string, ValidComponent>`            | `{}`         | Map of AST node names to Solid components.                                      |
| `data`          | `Record<string, unknown>`                   | `{}`         | Runtime values referenced from markdown via `:prop="data.path"`.                |
| `class`         | `JSX.ClassValue`                            | `undefined`  | Additional classes for the wrapper `div` (`comark-content` is always included). |

Other `div` props, except `children`, are passed to the wrapper element.

## `<MarkdownDocument>`

Renders a pre-parsed `MarkdownDocument` AST without invoking the parser. Ideal for server-side rendering (SSR), static site generation, or pre-compiled content.

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
| `transformNode` | `NodeTransform \| readonly NodeTransform[]` | `undefined`  | Transform resolved element tags and props before rendering.                     |
| `components`    | `Record<string, ValidComponent>`            | `{}`         | Map of AST node names to Solid components.                                      |
| `data`          | `Record<string, unknown>`                   | `{}`         | Runtime values referenced from markdown via `:prop="data.path"`.                |
| `class`         | `JSX.ClassValue`                            | `undefined`  | Additional classes for the wrapper `div` (`comark-content` is always included). |

Other `div` props, except `children`, are passed to the wrapper element.

## Custom Components

Map tag to Solid components via the `components` prop:

```tsx
import { Markdown } from "comark-solid";

import { Card } from "./Card";
import { CustomHeading } from "./CustomHeading";

const components = {
  h1: CustomHeading,
  card: Card,
};

export default function App() {
  return <Markdown value={markdown} components={components} />;
}
```

Components can also be loaded asynchronously using Solid's `lazy()`:

```tsx
import { lazy } from "solid-js";

const components = {
  chart: lazy(() => import("./Chart")),
};
```

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

## Acknowledgements

This project is heavily based on the official [Comark React renderer](https://github.com/ComarkDev/comark/tree/main/packages/react),
adapted for Solid's component model and APIs.

The original implementation is licensed under the MIT License.

## License

MIT
