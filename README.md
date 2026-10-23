# comark-solid

Solid renderer for [Comark](https://comark.dev).

## Installation

```bash
npm install comark-solid comark
```

## `<Markdown>`

Parses Markdown strings and renders them directly.

String input is parsed asynchronously. Wrap the component in Solid's `Suspense` to show a fallback while parsing.

```tsx
import { Markdown } from "comark-solid";
import { Suspense } from "solid-js";

const markdown = "# Hello World";

export default function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Markdown value={markdown} />
    </Suspense>
  );
}
```

### Props

| Prop         | Type                             | Default      | Description                                                                        |
| :----------- | :------------------------------- | :----------- | :--------------------------------------------------------------------------------- |
| `value`      | `string \| MarkdownDocument`     | _(Required)_ | Markdown string or pre-parsed document.                                            |
| `options`    | `ParserOptions`                  | `undefined`  | Options passed to `parseMarkdown` (ignored if `value` is a `MarkdownDocument`).    |
| `components` | `Record<string, ValidComponent>` | `{}`         | Map of AST node names to Solid components.                                         |
| `data`       | `Record<string, unknown>`        | `{}`         | Runtime values referenced from markdown via `:prop="data.path"`.                   |
| `class`      | `string`                         | `undefined`  | Additional class name for the wrapper `div` (`comark-content` is always included). |

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

| Prop         | Type                             | Default      | Description                                                                        |
| :----------- | :------------------------------- | :----------- | :--------------------------------------------------------------------------------- |
| `value`      | `MarkdownDocument`               | _(Required)_ | Pre-parsed Comark document AST.                                                    |
| `components` | `Record<string, ValidComponent>` | `{}`         | Map of AST node names to Solid components.                                         |
| `data`       | `Record<string, unknown>`        | `{}`         | Runtime values referenced from markdown via `:prop="data.path"`.                   |
| `class`      | `string`                         | `undefined`  | Additional class name for the wrapper `div` (`comark-content` is always included). |

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
