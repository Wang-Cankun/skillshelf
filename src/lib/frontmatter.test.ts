import { describe, expect, test } from "bun:test";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";

describe("parseFrontmatter", () => {
  test("scalar key/value + body", () => {
    const r = parseFrontmatter("---\nname: foo\ndescription: hello world\n---\n# Body\n");
    expect(r.hasFrontmatter).toBe(true);
    expect(r.data.name).toBe("foo");
    expect(r.data.description).toBe("hello world");
    expect(r.body).toBe("# Body\n");
  });

  test("inline list", () => {
    const r = parseFrontmatter('---\ndomains: [bioinfo, "qc-x", coding]\n---\nbody');
    expect(r.data.domains).toEqual(["bioinfo", "qc-x", "coding"]);
  });

  test("block nested mapping (metadata.internal)", () => {
    const r = parseFrontmatter("---\nname: x\nmetadata:\n  internal: true\n---\nbody");
    expect(r.data.metadata).toEqual({ internal: true });
  });

  test("inline flow mapping (metadata: {internal: true})", () => {
    // Flow style must parse to an object too, else the `metadata.internal` signal
    // (ADR-0012) could be bypassed by author style. Both styles are equivalent.
    const r = parseFrontmatter("---\nname: x\nmetadata: {internal: true}\n---\nbody");
    expect(r.data.metadata).toEqual({ internal: true });
  });

  test("flow mapping tolerates spaces and quoted values", () => {
    const r = parseFrontmatter('---\nm: { a: 1, b: "x, y" }\n---\nbody');
    expect(r.data.m).toEqual({ a: 1, b: "x, y" });
  });

  test("block scalar literal |", () => {
    const r = parseFrontmatter(
      "---\nname: x\ndescription: |\n  line one\n  line two\n---\nbody",
    );
    expect(r.data.description).toBe("line one\nline two");
  });

  test("folded block scalar >-", () => {
    const r = parseFrontmatter(
      "---\nname: x\ndescription: >-\n  folded line one\n  folded line two\n---\nbody",
    );
    expect(r.data.description).toBe("folded line one folded line two");
  });

  test("block list with - items", () => {
    const r = parseFrontmatter("---\ndomains:\n  - a\n  - b\n---\nbody");
    expect(r.data.domains).toEqual(["a", "b"]);
  });

  test("no frontmatter returns whole text as body", () => {
    const r = parseFrontmatter("# just markdown\nno fences");
    expect(r.hasFrontmatter).toBe(false);
    expect(r.body).toBe("# just markdown\nno fences");
  });

  test("missing closing fence is treated as no frontmatter", () => {
    const r = parseFrontmatter("---\nname: x\nnever closes");
    expect(r.hasFrontmatter).toBe(false);
  });

  test("round-trips scalars and lists", () => {
    const out = serializeFrontmatter(
      { name: "foo", domains: ["a", "b"] },
      "# Body\n",
    );
    const r = parseFrontmatter(out);
    expect(r.data.name).toBe("foo");
    expect(r.data.domains).toEqual(["a", "b"]);
    expect(r.body.trim()).toBe("# Body");
  });
});
