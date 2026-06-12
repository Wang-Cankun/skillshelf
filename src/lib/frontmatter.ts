// Minimal YAML frontmatter parser/serializer.
// Handles the subset real SKILL.md files use:
//   - leading/trailing `---` fences
//   - scalar `key: value`
//   - inline lists `key: [a, b, c]`
//   - block lists (`key:` then `  - item` lines)
//   - block scalars `key: |` and `key: >-` (folded/literal multi-line)
//   - quoted scalars ("..." / '...')
// Robust to missing/extra keys. NOT a general YAML implementation.

export interface Frontmatter {
  data: Record<string, unknown>;
  /** the body after the closing `---` fence (with no leading newline) */
  body: string;
  /** true if a frontmatter block was actually present */
  hasFrontmatter: boolean;
}

const FENCE = "---";

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return t.slice(1, -1);
    }
  }
  return t;
}

function parseInlineList(s: string): string[] {
  // s includes surrounding brackets: [a, "b, with comma", 'c']
  const inner = s.trim().slice(1, -1).trim();
  if (inner === "") return [];
  // Split on commas OUTSIDE quotes so quoted items containing commas stay intact.
  const items: string[] = [];
  let buf = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      buf += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
    } else if (ch === ",") {
      items.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  items.push(buf);
  return items.map((x) => stripQuotes(x.trim())).filter((x) => x.length > 0);
}

function parseScalar(raw: string): unknown {
  const v = stripQuotes(raw.trim());
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~" || v === "") return v === "" ? "" : null;
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

/**
 * Parse a SKILL.md (or any markdown) string into frontmatter data + body.
 * Never throws; on malformed input returns hasFrontmatter:false with full text as body.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith(FENCE)) {
    return { data: {}, body: normalized, hasFrontmatter: false };
  }
  const lines = normalized.split("\n");
  // first line is the opening fence (may have trailing spaces)
  if (lines[0]?.trim() !== FENCE) {
    return { data: {}, body: normalized, hasFrontmatter: false };
  }
  // find closing fence
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === FENCE) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { data: {}, body: normalized, hasFrontmatter: false };
  }

  const fmLines = lines.slice(1, end);
  const body = lines.slice(end + 1).join("\n").replace(/^\n+/, "");
  const data: Record<string, unknown> = {};

  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i]!;
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    // top-level keys are unindented
    const m = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const rest = m[2]!;
    const restTrim = rest.trim();

    // block scalar: | or > with optional chomp indicators
    if (/^[|>][+-]?\s*$/.test(restTrim)) {
      const folded = restTrim[0] === ">";
      const collected: string[] = [];
      let j = i + 1;
      // determine block indentation from first non-empty child line
      let blockIndent = -1;
      while (j < fmLines.length) {
        const cur = fmLines[j]!;
        if (cur.trim() === "") {
          collected.push("");
          j++;
          continue;
        }
        const indent = cur.length - cur.trimStart().length;
        if (blockIndent === -1) {
          if (indent === 0) break; // not part of block
          blockIndent = indent;
        }
        if (indent < blockIndent) break;
        collected.push(cur.slice(blockIndent));
        j++;
      }
      i = j - 1;
      // trim trailing blank lines
      while (collected.length && collected[collected.length - 1] === "") {
        collected.pop();
      }
      data[key] = folded
        ? collected.join(" ").replace(/\s+/g, " ").trim()
        : collected.join("\n");
      continue;
    }

    // inline list
    if (restTrim.startsWith("[") && restTrim.endsWith("]")) {
      data[key] = parseInlineList(restTrim);
      continue;
    }

    // block list: `key:` followed by `  - item` lines
    if (restTrim === "") {
      const items: string[] = [];
      let j = i + 1;
      while (j < fmLines.length) {
        const cur = fmLines[j]!;
        const ct = cur.trim();
        if (ct === "") {
          j++;
          continue;
        }
        const lm = ct.match(/^-\s+(.*)$/);
        if (!lm || cur.length - cur.trimStart().length === 0) break;
        items.push(stripQuotes(lm[1]!.trim()));
        j++;
      }
      if (items.length > 0) {
        data[key] = items;
        i = j - 1;
      } else {
        data[key] = "";
      }
      continue;
    }

    // plain scalar
    data[key] = parseScalar(rest);
  }

  return { data, body, hasFrontmatter: true };
}

function needsQuoting(s: string): boolean {
  return /[:#\[\]{}&*!|>'"%@`,]/.test(s) || /^\s|\s$/.test(s) || s === "";
}

function serializeScalar(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  const s = String(v);
  if (s.includes("\n")) {
    // emit as literal block scalar
    const indented = s
      .split("\n")
      .map((l) => "  " + l)
      .join("\n");
    return "|\n" + indented;
  }
  if (needsQuoting(s)) {
    return JSON.stringify(s);
  }
  return s;
}

/**
 * Serialize frontmatter data + body back into a SKILL.md string.
 * Keys are emitted in insertion order. Arrays become inline lists.
 */
export function serializeFrontmatter(
  data: Record<string, unknown>,
  body: string,
): string {
  const out: string[] = [FENCE];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      const items = value.map((x) =>
        needsQuoting(String(x)) ? JSON.stringify(String(x)) : String(x),
      );
      out.push(`${key}: [${items.join(", ")}]`);
    } else {
      const s = serializeScalar(value);
      if (s.startsWith("|\n")) {
        out.push(`${key}: ${s}`);
      } else {
        out.push(`${key}: ${s}`);
      }
    }
  }
  out.push(FENCE);
  const trimmedBody = body.replace(/^\n+/, "");
  return out.join("\n") + "\n\n" + trimmedBody + (trimmedBody.endsWith("\n") ? "" : "\n");
}
