import { parseMarkdown } from "comark";
import type { ComarkPlugin, MarkdownDocument } from "comark";
import { describe, expect, it } from "vite-plus/test";

import {
  classifyUpdate,
  createAutoIncrementalParser,
} from "../../src/experimental/auto-incremental";
import { deferred, strip } from "./helpers";

async function expectMatchesFullParse(doc: MarkdownDocument, source: string) {
  const truth = await parseMarkdown(source);
  expect(strip(doc)).toEqual(strip(truth));
}

function recordingPlugin(inputs: string[]) {
  const plugin: ComarkPlugin = {
    name: "recorder",
    pre: (state) => {
      inputs.push(state.markdown);
    },
  };
  return plugin;
}

describe("classifyUpdate", () => {
  it("classifies initial, same, append and edit", () => {
    expect(classifyUpdate(null, "a")).toBe("initial");
    expect(classifyUpdate("a", "a")).toBe("same");
    expect(classifyUpdate("a", "ab")).toBe("append");
    expect(classifyUpdate("", "ab")).toBe("append");
    expect(classifyUpdate("abc", "ab")).toBe("edit"); // shrink, even though it is a prefix
    expect(classifyUpdate("abc", "axc")).toBe("edit"); // middle edit
    expect(classifyUpdate("abc", "xyz")).toBe("edit"); // replacement
    expect(classifyUpdate("abc", "abd")).toBe("edit"); // last-char edit is not an append
  });
});

describe("createAutoIncrementalParser correctness vs full parse", () => {
  const sequences: Record<string, string[]> = {
    "append complete blocks": ["First", "First\n\nSecond", "First\n\nSecond\n\nThird grows"],
    "append with headings": ["# Title", "# Title\n\nBody", "# Title\n\nBody\n\n## Next\n\nMore"],
    "append frontmatter": ["---\ntitle: T\n---\n\nA", "---\ntitle: T\n---\n\nA\n\nB"],
    "append table rows": ["| A |\n|---|\n| 1 |", "| A |\n|---|\n| 1 |\n| 2 |"],
    "append then middle edit": [
      "AAA\n\nBBB\n\nCCC",
      "AAA\n\nBBB\n\nCCC grows",
      "AXA\n\nBBB\n\nCCC grows",
    ],
    "append then shrink": ["One\n\nTwo\n\nThree", "One"],
    "append then replace": ["One\n\nTwo", "Completely different"],
    "edit then append again": ["One\n\nTwo", "Edited\n\nTwo", "Edited\n\nTwo\n\nThree"],
    "reference definition arrives late": [
      "[a][r]\n\nText",
      "[a][r]\n\nText\n\n[r]: https://example.com",
    ],
    "duplicate headings": ["# Hello", "# Hello\n\n# Hello"],
  };

  for (const [name, steps] of Object.entries(sequences)) {
    it(`matches a full parse after every step: ${name}`, async () => {
      const auto = createAutoIncrementalParser({});
      for (const step of steps) {
        const doc = await auto.parse(step);
        await expectMatchesFullParse(doc, step);
      }
    });
  }

  it("decides streaming only for appends", async () => {
    const calls: { kind: string; streaming: boolean }[] = [];
    const auto = createAutoIncrementalParser({}, (call) => calls.push(call));
    await auto.parse("One\n\nTwo");
    await auto.parse("One\n\nTwo\n\nThree");
    await auto.parse("Changed\n\nTwo\n\nThree");
    await auto.parse("Changed\n\nTwo\n\nThree grows");
    expect(calls).toEqual([
      { kind: "initial", streaming: false, sourceLength: 8 },
      { kind: "append", streaming: true, sourceLength: 15 },
      { kind: "edit", streaming: false, sourceLength: 19 },
      { kind: "append", streaming: true, sourceLength: 25 },
    ]);
  });
});

describe("incremental reuse (parser input)", () => {
  // Design trade-off of dropping the `streaming` prop: the initial value is
  // parsed non-streaming (exact static semantics), which resets core's
  // cache, so the FIRST append also parses fully inside core (it primes the
  // cache) and reuse starts at the second append. In the canonical streaming
  // scenario the component mounts with "" or a small first chunk, so the
  // priming parse is the cheapest one of the stream.
  it("reparses only the tail for prose appends (from the second append on)", async () => {
    const inputs: string[] = [];
    const auto = createAutoIncrementalParser({ plugins: [recordingPlugin(inputs)] });
    const initial = "First\n\nSecond\n\nThird";
    await auto.parse(initial);
    await auto.parse(`${initial} grows`);
    expect(inputs[1]).toBe(`${initial} grows`); // priming parse: full inside core
    await auto.parse(`${initial} grows\n\nFourth`);
    expect(inputs).toHaveLength(3);
    expect(inputs[2]).not.toContain("First");
    // The tail is the still-open last block plus the new one — far less than the full value.
    expect(inputs[2]).toBe("\nThird grows\n\nFourth");
    expect(inputs[2]!.length).toBeLessThan(`${initial} grows\n\nFourth`.length);
  });

  it("an edit forces a full parse and resets the reusable prefix", async () => {
    const inputs: string[] = [];
    const auto = createAutoIncrementalParser({ plugins: [recordingPlugin(inputs)] });
    await auto.parse("One\n\nTwo\n\nThree");
    await auto.parse("One\n\nTwo\n\nThree grows"); // priming
    await auto.parse("One\n\nTwo\n\nThree grows!"); // tail only
    expect(inputs[2]).not.toContain("One");
    await auto.parse("Edited\n\nTwo\n\nThree grows!");
    expect(inputs[3]).toBe("Edited\n\nTwo\n\nThree grows!");
    // First append after the edit cannot reuse (cache was reset)…
    await auto.parse("Edited\n\nTwo\n\nThree grows!\n\nFour");
    expect(inputs[4]).toContain("Edited");
    // …but the next one can again.
    await auto.parse("Edited\n\nTwo\n\nThree grows!\n\nFour grows");
    expect(inputs[5]).not.toContain("Edited");
  });

  it("setOptions with a new reference recreates the parser; same reference does not", async () => {
    const inputs: string[] = [];
    const options = { plugins: [recordingPlugin(inputs)] };
    const auto = createAutoIncrementalParser(options);
    await auto.parse("One\n\nTwo");
    expect(auto.setOptions(options)).toBe(false);
    await auto.parse("One\n\nTwo grows"); // priming
    await auto.parse("One\n\nTwo grows!");
    expect(inputs[2]).not.toContain("One\n\n"); // still incremental
    expect(auto.setOptions({ plugins: options.plugins })).toBe(true);
    await auto.parse("One\n\nTwo grows! more");
    expect(inputs[3]).toBe("One\n\nTwo grows! more"); // full parse after recreation
  });
});

describe("stream end / finalize", () => {
  it("pure auto mode diverges on trailing openers; finalize converges to the full parse", async () => {
    const auto = createAutoIncrementalParser({});
    await auto.parse("");
    const streamed = await auto.parse("Hello **");
    // Streaming auto-close drops the trailing opener…
    expect(JSON.stringify(strip(streamed.nodes))).toContain("Hello");
    expect(JSON.stringify(strip(streamed.nodes))).not.toContain("**");
    // …while a full parse keeps it as literal text.
    const finalized = await auto.finalize("Hello **");
    await expectMatchesFullParse(finalized, "Hello **");
    expect(JSON.stringify(strip(finalized.nodes))).toContain("Hello **");
  });

  it("finalize is idempotent and a no-op after a non-streaming parse", async () => {
    const calls: unknown[] = [];
    const auto = createAutoIncrementalParser({}, (call) => calls.push(call));
    await auto.parse("Static **");
    await auto.finalize("Static **");
    expect(calls).toHaveLength(1); // initial was already non-streaming

    await auto.parse("Static ** grows");
    const before = calls.length;
    await auto.finalize("Static ** grows");
    await auto.finalize("Static ** grows");
    expect(calls.length).toBe(before + 1); // exactly one finalize parse
    expect(auto.lastCall?.kind).toBe("finalize");
  });

  it("appending after finalize still works (first append reparses fully inside core)", async () => {
    const auto = createAutoIncrementalParser({});
    await auto.parse("One\n\nTwo");
    await auto.parse("One\n\nTwo grows");
    await auto.finalize("One\n\nTwo grows");
    const doc = await auto.parse("One\n\nTwo grows\n\nThree");
    await expectMatchesFullParse(doc, "One\n\nTwo grows\n\nThree");
    const doc2 = await auto.parse("One\n\nTwo grows\n\nThree grows");
    await expectMatchesFullParse(doc2, "One\n\nTwo grows\n\nThree grows");
  });
});

describe("continuous updates and async plugins", () => {
  it("serializes overlapping parses (max one active plugin) and resolves each with its own document", async () => {
    const { promise: gate, resolve: release } = deferred();
    let active = 0;
    let maxActive = 0;
    const inputs: string[] = [];
    const plugin: ComarkPlugin = {
      name: "deferred",
      async pre(state) {
        active++;
        maxActive = Math.max(maxActive, active);
        inputs.push(state.markdown);
        if (state.markdown.includes("Slow")) await gate;
        active--;
      },
    };
    const auto = createAutoIncrementalParser({ plugins: [plugin] });
    await auto.parse("Ready");
    const slow = auto.parse("Slow");
    const latest = auto.parse("Latest");
    release();
    const slowDoc = await slow;
    const latestDoc = await latest;
    expect(maxActive).toBe(1);
    await expectMatchesFullParse(slowDoc, "Slow");
    await expectMatchesFullParse(latestDoc, "Latest");
    expect(inputs).toEqual(["Ready", "Slow", "Latest"]);
  });

  it("dedupes concurrent parses of the same value (one parser call)", async () => {
    const inputs: string[] = [];
    const auto = createAutoIncrementalParser({ plugins: [recordingPlugin(inputs)] });
    const [a, b, c] = await Promise.all([
      auto.parse("Once"),
      auto.parse("Once"),
      auto.parse("Once"),
    ]);
    expect(inputs).toEqual(["Once"]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    await auto.parse("Once");
    expect(inputs).toEqual(["Once"]); // settled same-value parse is also free
  });
});

describe("multiple instances (multi-document pages / SSR requests)", () => {
  it("two interleaved parsers never share streaming state", async () => {
    // A module-scope serialized parser would corrupt both streams: each
    // instance's appends would stop being appends of its own last input.
    // Per-instance parsers (what both component variants create) stay exact.
    const a = createAutoIncrementalParser({});
    const b = createAutoIncrementalParser({});
    const stepsA = ["Doc A", "Doc A\n\nSecond A", "Doc A\n\nSecond A grows"];
    const stepsB = ["Doc B", "Doc B\n\nSecond B", "Doc B\n\nSecond B grows"];
    for (let i = 0; i < stepsA.length; i++) {
      await expectMatchesFullParse(await a.parse(stepsA[i]!), stepsA[i]!);
      await expectMatchesFullParse(await b.parse(stepsB[i]!), stepsB[i]!);
    }
  });
});

describe("error consistency", () => {
  it("a throwing pre plugin rejects, does not become the baseline, and the next parse recovers", async () => {
    let fail = false;
    const plugin: ComarkPlugin = {
      name: "flaky-pre",
      pre() {
        if (fail) throw new Error("boom-pre");
      },
    };
    const auto = createAutoIncrementalParser({ plugins: [plugin] });
    await auto.parse("One\n\nTwo");
    fail = true;
    await expect(auto.parse("One\n\nTwo plus")).rejects.toThrow("boom-pre");
    // Retrying the same failed value must actually re-run the parser.
    await expect(auto.parse("One\n\nTwo plus")).rejects.toThrow("boom-pre");
    fail = false;
    const recovered = await auto.parse("One\n\nTwo plus");
    await expectMatchesFullParse(recovered, "One\n\nTwo plus");
    const appended = await auto.parse("One\n\nTwo plus more");
    await expectMatchesFullParse(appended, "One\n\nTwo plus more");
  });

  it("a throwing post plugin rejects, and a later full parse resyncs exactly", async () => {
    let fail = false;
    const plugin: ComarkPlugin = {
      name: "flaky-post",
      post(state) {
        if (fail) throw new Error("boom-post");
        state.tree.meta.touched = true;
      },
    };
    const auto = createAutoIncrementalParser({ plugins: [plugin] });
    await auto.parse("One\n\nTwo");
    fail = true;
    await expect(auto.parse("One\n\nTwo plus")).rejects.toThrow("boom-post");
    fail = false;
    // Force resync with an edit (full parse) — result must equal ground truth incl. meta.
    const edited = await auto.parse("Edited\n\nTwo plus");
    const truthPlugin: ComarkPlugin = {
      name: "flaky-post",
      post: (s) => {
        (s.tree.meta as Record<string, unknown>).touched = true;
      },
    };
    const truth = await parseMarkdown("Edited\n\nTwo plus", { plugins: [truthPlugin] });
    expect(strip(edited)).toEqual(strip(truth));
  });

  it("a failing non-streaming parse does not poison later streaming appends", async () => {
    let fail = true;
    const plugin: ComarkPlugin = {
      name: "fail-once",
      pre() {
        if (fail) throw new Error("first fails");
      },
    };
    const auto = createAutoIncrementalParser({ plugins: [plugin] });
    await expect(auto.parse("Start")).rejects.toThrow("first fails");
    fail = false;
    const doc = await auto.parse("Start");
    await expectMatchesFullParse(doc, "Start");
    const doc2 = await auto.parse("Start grows");
    await expectMatchesFullParse(doc2, "Start grows");
  });
});
