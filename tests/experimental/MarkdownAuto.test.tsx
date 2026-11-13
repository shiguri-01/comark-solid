import { render, screen } from "@solidjs/testing-library";
import type { ComarkPlugin, ParserOptions } from "comark";
import { createSignal, Errored, flush, Loading } from "solid-js";
import { describe, expect, it } from "vite-plus/test";

import { MarkdownAuto } from "../../src/experimental/MarkdownAuto";
import { MarkdownAutoMemo } from "../../src/experimental/MarkdownAutoMemo";
import { deferred } from "./helpers";

const variants = [
  ["MarkdownAuto (signal + effect)", MarkdownAuto],
  ["MarkdownAutoMemo (createDeferred)", MarkdownAutoMemo],
] as const;

function Boundary(props: { children: any }) {
  return (
    <Errored
      fallback={(err) => {
        const e = err();
        return <div role="alert">{e instanceof Error ? e.message : String(e)}</div>;
      }}
    >
      <Loading fallback={<div>loading</div>}>{props.children}</Loading>
    </Errored>
  );
}

for (const [name, Component] of variants) {
  describe(name, () => {
    it("renders the initial value, then reparses only the tail on later appends", async () => {
      const inputs: string[] = [];
      const plugin: ComarkPlugin = {
        name: "inputs",
        pre: (state) => {
          inputs.push(state.markdown);
        },
      };
      const options: ParserOptions = { plugins: [plugin] };
      const [source, setSource] = createSignal("First\n\nSecond\n\nThird");
      render(() => (
        <Boundary>
          <Component value={source()} options={options} />
        </Boundary>
      ));
      expect(await screen.findByText("Third")).toBeInTheDocument();

      setSource("First\n\nSecond\n\nThird grows");
      expect(await screen.findByText("Third grows")).toBeInTheDocument();

      setSource("First\n\nSecond\n\nThird grows\n\nFourth");
      expect(await screen.findByText("Fourth")).toBeInTheDocument();
      expect(screen.getByText("First")).toBeInTheDocument();
      // initial (full) + priming append (full inside core) + tail-only append
      expect(inputs).toHaveLength(3);
      expect(inputs[2]).not.toContain("First");
    });

    it("a middle edit triggers a full parse and replaces the content", async () => {
      const inputs: string[] = [];
      const plugin: ComarkPlugin = {
        name: "inputs",
        pre: (state) => {
          inputs.push(state.markdown);
        },
      };
      const [source, setSource] = createSignal("AAA\n\nBBB\n\nCCC");
      render(() => (
        <Boundary>
          <Component value={source()} options={{ plugins: [plugin] }} />
        </Boundary>
      ));
      expect(await screen.findByText("CCC")).toBeInTheDocument();

      setSource("XXX\n\nBBB\n\nCCC");
      expect(await screen.findByText("XXX")).toBeInTheDocument();
      expect(screen.queryByText("AAA")).not.toBeInTheDocument();
      expect(inputs[inputs.length - 1]).toBe("XXX\n\nBBB\n\nCCC");
    });

    it("serializes overlapping plugin work and applies the newest update", async () => {
      const { promise: gate, resolve: release } = deferred();
      let active = 0;
      let maxActive = 0;
      const plugin: ComarkPlugin = {
        name: "deferred",
        async pre(state) {
          active++;
          maxActive = Math.max(maxActive, active);
          if (state.markdown.includes("Slow")) await gate;
          active--;
        },
      };
      const [source, setSource] = createSignal("Ready");
      render(() => (
        <Boundary>
          <Component value={source()} options={{ plugins: [plugin] }} />
        </Boundary>
      ));
      expect(await screen.findByText("Ready")).toBeInTheDocument();

      setSource("Slow");
      // Let the Slow parse start and block on the gate before queueing Latest.
      await new Promise((resolve) => setTimeout(resolve, 20));
      setSource("Latest");
      release();

      expect(await screen.findByText("Latest")).toBeInTheDocument();
      expect(maxActive).toBe(1);
      expect(screen.queryByText("Slow")).not.toBeInTheDocument();
    });

    it("ignores a slow result from before an options change", async () => {
      const { promise: gate, resolve: release } = deferred();
      let finished = false;
      const slowPlugin: ComarkPlugin = {
        name: "slow",
        async pre() {
          await gate;
          finished = true;
        },
      };
      const [source, setSource] = createSignal("Old");
      const [options, setOptions] = createSignal<ParserOptions>({ plugins: [slowPlugin] });
      render(() => (
        <Boundary>
          <Component value={source()} options={options()} />
        </Boundary>
      ));
      // Swap config + value while the first parse is still gated.
      setOptions({});
      setSource("New");
      expect(await screen.findByText("New")).toBeInTheDocument();
      release();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(finished).toBe(true);
      expect(screen.getByText("New")).toBeInTheDocument();
      expect(screen.queryByText("Old")).not.toBeInTheDocument();
    });
  });
}

describe("MarkdownAutoMemo error handling (createDeferred variant)", () => {
  it("passes parser errors to the Errored boundary and recovers with working options", async () => {
    const failing: ParserOptions = {
      plugins: [
        {
          name: "fail",
          pre() {
            throw new Error("Plugin failed");
          },
        },
      ],
    };
    const [options, setOptions] = createSignal<ParserOptions>(failing);
    render(() => (
      <Boundary>
        <MarkdownAutoMemo value="Failure" options={options()} />
      </Boundary>
    ));
    expect(await screen.findByRole("alert")).toHaveTextContent("Plugin failed");

    setOptions({});
    expect(await screen.findByText("Failure")).toBeInTheDocument();
  });
});

describe("MarkdownAuto error handling (effect variant)", () => {
  // Throwing to <Errored> from effect-written state deadlocks recovery on
  // Solid 2.0.0-rc.21 (the errored branch's effect is disposed, so no later
  // prop change re-runs the parse). The effect variant therefore surfaces
  // errors inline and keeps the last good document.
  it("shows an inline alert when the first parse fails and recovers with working options", async () => {
    const failing: ParserOptions = {
      plugins: [
        {
          name: "fail",
          pre() {
            throw new Error("Plugin failed");
          },
        },
      ],
    };
    const [options, setOptions] = createSignal<ParserOptions>(failing);
    render(() => (
      <Boundary>
        <MarkdownAuto value="Failure" options={options()} />
      </Boundary>
    ));
    expect(await screen.findByRole("alert")).toHaveTextContent("Plugin failed");

    setOptions({});
    expect(await screen.findByText("Failure")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the last good document when a later parse fails transiently", async () => {
    const plugin: ComarkPlugin = {
      name: "fail-on-bad",
      pre(state) {
        if (state.markdown.includes("Bad")) throw new Error("Bad content");
      },
    };
    const [source, setSource] = createSignal("Good");
    render(() => (
      <Boundary>
        <MarkdownAuto value={source()} options={{ plugins: [plugin] }} />
      </Boundary>
    ));
    expect(await screen.findByText("Good")).toBeInTheDocument();

    setSource("Bad");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText("Good")).toBeInTheDocument(); // not blanked, no alert (a document exists)

    setSource("Good again");
    expect(await screen.findByText("Good again")).toBeInTheDocument();
  });
});

describe("MarkdownAuto stream-end handling (effect variant)", () => {
  it("without finalizeDelayMs, a trailing opener stays dropped (pure auto mode)", async () => {
    const [source, setSource] = createSignal("");
    render(() => (
      <Boundary>
        <MarkdownAuto value={source()} />
      </Boundary>
    ));
    setSource("Hello **");
    expect(await screen.findByText("Hello")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 80));
    flush();
    expect(screen.queryByText("Hello **")).not.toBeInTheDocument();
  });

  it("with finalizeDelayMs, the idle finalize restores exact full-parse rendering", async () => {
    const [source, setSource] = createSignal("");
    render(() => (
      <Boundary>
        <MarkdownAuto value={source()} finalizeDelayMs={30} />
      </Boundary>
    ));
    setSource("Hello **");
    expect(await screen.findByText("Hello")).toBeInTheDocument();
    expect(await screen.findByText("Hello **", {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("rapid synchronous updates coalesce: intermediate values in one flush are never parsed", async () => {
    const inputs: string[] = [];
    const plugin: ComarkPlugin = {
      name: "inputs",
      pre: (state) => {
        inputs.push(state.markdown);
      },
    };
    const [source, setSource] = createSignal("Start");
    render(() => (
      <Boundary>
        <MarkdownAuto value={source()} options={{ plugins: [plugin] }} />
      </Boundary>
    ));
    expect(await screen.findByText("Start")).toBeInTheDocument();
    inputs.length = 0;

    setSource("Start one");
    setSource("Start one two");
    setSource("Start one two three");
    flush();

    expect(await screen.findByText("Start one two three")).toBeInTheDocument();
    expect(inputs).toEqual(["Start one two three"]);
  });

  it("shows the completed update while the next one is still parsing", async () => {
    const { promise: first, resolve: releaseFirst } = deferred();
    const { promise: last, resolve: releaseLast } = deferred();
    const started: string[] = [];
    const plugin: ComarkPlugin = {
      name: "slow",
      async pre(state) {
        started.push(state.markdown);
        if (state.markdown === "First") await first;
        if (state.markdown === "Last") await last;
      },
    };
    const [source, setSource] = createSignal("Ready");
    render(() => (
      <Boundary>
        <MarkdownAuto value={source()} options={{ plugins: [plugin] }} />
      </Boundary>
    ));
    expect(await screen.findByText("Ready")).toBeInTheDocument();

    setSource("First");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toContain("First");
    setSource("Last");
    releaseFirst();
    // First completes and is displayed even though Last is still gated.
    expect(await screen.findByText("First")).toBeInTheDocument();
    releaseLast();
    expect(await screen.findByText("Last")).toBeInTheDocument();
  });
});

describe("rendering integration", () => {
  it("streaming `$` position metadata does not leak into the DOM", async () => {
    const [source, setSource] = createSignal("Alpha\n\nBeta");
    const { container } = render(() => (
      <Boundary>
        <MarkdownAuto value={source()} />
      </Boundary>
    ));
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    setSource("Alpha\n\nBeta\n\nGamma");
    expect(await screen.findByText("Gamma")).toBeInTheDocument();
    setSource("Alpha\n\nBeta\n\nGamma grows");
    expect(await screen.findByText("Gamma grows")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("$");
  });

  it("documents current behaviour: top-level DOM nodes are recreated on append (parser reuse ≠ DOM reuse)", async () => {
    const [source, setSource] = createSignal("Alpha\n\nBeta");
    const { container } = render(() => (
      <Boundary>
        <MarkdownAuto value={source()} />
      </Boundary>
    ));
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    const firstParagraph = container.querySelector("p");
    setSource("Alpha\n\nBeta\n\nGamma");
    expect(await screen.findByText("Gamma")).toBeInTheDocument();
    // MarkdownDocument re-renders every node from scratch on each document,
    // so even AST nodes the parser reused get fresh DOM elements. Fixing
    // this needs keyed per-node rendering in MarkdownDocument, not parser work.
    expect(container.querySelector("p")).not.toBe(firstParagraph);
  });
});
