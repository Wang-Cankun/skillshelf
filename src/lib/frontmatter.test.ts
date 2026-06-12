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
