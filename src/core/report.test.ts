// Unit tests for the pure reporter seam (candidate #4). The mark ladders are pure
// string functions (no fs, no network) so the full verdict union — incl. the safe
// default tail — is covered cheaply; render() is exercised against a fake Ctx that
// captures json/log calls, proving the json-vs-human dispatch and the load-bearing
// "json payload passes through byte-for-byte" contract.

import { test, expect, describe } from "bun:test";
import type { Ctx } from "../types.ts";
import type { OutdatedRow } from "../commands/outdated.ts";
import {
  updateOutcomeMark,
  outdatedStatusMark,
  outdatedRefInfo,
  addDryRunVerdictMark,
  render,
  type CommandResult,
} from "./report.ts";

describe("updateOutcomeMark — total over the Outcome union (incl. default)", () => {
  test("maps each outcome to its left-gutter tag", () => {
    expect(updateOutcomeMark("updated")).toBe("updated  ");
    expect(updateOutcomeMark("uptodate")).toBe("current  ");
    expect(updateOutcomeMark("diverged")).toBe("DIVERGED ");
    expect(updateOutcomeMark("orphaned")).toBe("orphaned ");
    expect(updateOutcomeMark("error")).toBe("ERROR    ");
    // 'skipped' is the explicit default tail of the old ternary.
    expect(updateOutcomeMark("skipped")).toBe("skipped  ");
  });
});

describe("outdatedStatusMark — total over the Status union (incl. default)", () => {
  test("maps each status to its mark", () => {
    expect(outdatedStatusMark("stale")).toBe("STALE   ");
    expect(outdatedStatusMark("diverged")).toBe("DIVERGED");
    expect(outdatedStatusMark("current")).toBe("current ");
    expect(outdatedStatusMark("linked")).toBe("linked  ");
    expect(outdatedStatusMark("adopted")).toBe("adopted ");
    // 'unknown' is the explicit default tail of the old ternary.
    expect(outdatedStatusMark("unknown")).toBe("unknown ");
  });
});

describe("outdatedRefInfo — refInfo + extra ladder per status", () => {
  function row(over: Partial<OutdatedRow>): OutdatedRow {
    return {
      name: "x",
      channel: "github",
      source: "github:o/r",
      installedRef: "abc1234def0",
      latestRef: null,
      status: "current",
      note: "",
      ...over,
    };
  }

  test("stale: installedRef -> latestRef (both short-ref'd), no extra", () => {
    const r = row({ status: "stale", installedRef: "abc1234def0", latestRef: "fed4321cba9" });
    expect(outdatedRefInfo(r, false)).toBe("abc1234def -> fed4321cba");
  });

  test("stale with empty latestRef renders the arrow to empty", () => {
    const r = row({ status: "stale", installedRef: "abc1234def0", latestRef: null });
    expect(outdatedRefInfo(r, false)).toBe("abc1234def -> ");
  });

  test("linked: passes the note through, no extra", () => {
    const r = row({ status: "linked", note: "dev repo owns versioning" });
    expect(outdatedRefInfo(r, false)).toBe("dev repo owns versioning");
  });

  test("adopted: passes the note through, no extra", () => {
    const r = row({ status: "adopted", note: "provenance adopted; baseline unverified" });
    expect(outdatedRefInfo(r, false)).toBe("provenance adopted; baseline unverified");
  });

  test("diverged: passes the note through, no extra", () => {
    const r = row({ status: "diverged", note: "local body diverged from installed baseline (offline)" });
    expect(outdatedRefInfo(r, false)).toBe("local body diverged from installed baseline (offline)");
  });

  test("current online: bare short-ref, no offline suffix, no extra", () => {
    const r = row({ status: "current", installedRef: "abc1234def0", note: "" });
    expect(outdatedRefInfo(r, false)).toBe("abc1234def");
  });

  test("current with checkLocal: appends the (offline) suffix", () => {
    const r = row({ status: "current", installedRef: "abc1234def0", note: "" });
    expect(outdatedRefInfo(r, true)).toBe("abc1234def (offline)");
  });

  test("current with a note: short-ref + [note] extra appended", () => {
    const r = row({ status: "current", installedRef: "abc1234def0", note: "has local edits" });
    expect(outdatedRefInfo(r, false)).toBe("abc1234def  [has local edits]");
  });

  test("unknown: short-ref + (note) refInfo, no [extra]", () => {
    const r = row({ status: "unknown", installedRef: "abc1234def0", note: "network down" });
    expect(outdatedRefInfo(r, false)).toBe("abc1234def (network down)");
  });

  test("non-hash refs are passed through un-truncated by shortRef", () => {
    const r = row({ status: "stale", installedRef: "v1.2.3", latestRef: "v2.0.0" });
    expect(outdatedRefInfo(r, false)).toBe("v1.2.3 -> v2.0.0");
  });
});

describe("addDryRunVerdictMark — total over the verdict union (incl. default)", () => {
  test("maps each verdict to its tag", () => {
    expect(addDryRunVerdictMark("new")).toBe("new      ");
    expect(addDryRunVerdictMark("identical")).toBe("identical");
    expect(addDryRunVerdictMark("differs")).toBe("DIFFERS  ");
    expect(addDryRunVerdictMark("linked")).toBe("linked   ");
    // 'invalid' is the explicit default tail of the old ternary.
    expect(addDryRunVerdictMark("invalid")).toBe("INVALID  ");
  });
});

/** A fake Ctx capturing json() payloads and log() lines; nothing else is touched. */
function fakeCtx(): { ctx: Ctx; jsonCalls: unknown[]; logCalls: string[] } {
  const jsonCalls: unknown[] = [];
  const logCalls: string[] = [];
  const ctx = {
    json: (v: unknown) => jsonCalls.push(v),
    log: (...args: unknown[]) => logCalls.push(args.map(String).join(" ")),
    error: () => {},
  } as unknown as Ctx;
  return { ctx, jsonCalls, logCalls };
}

describe("render — dispatch", () => {
  test("jsonMode=true calls ctx.json with EXACTLY result.json (deep-equal) and never invokes human", () => {
    const { ctx, jsonCalls, logCalls } = fakeCtx();
    let humanCalled = false;
    const payload = { ok: true, checked: 2, stale: 1, rows: [{ name: "a" }] };
    const result: CommandResult = {
      json: payload,
      human: () => {
        humanCalled = true;
      },
    };
    render(ctx, true, result);
    expect(humanCalled).toBe(false);
    expect(logCalls).toEqual([]);
    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]).toEqual(payload);
    // Identity, not just deep-equal: the payload passes through unchanged (the
    // load-bearing --json contract).
    expect(jsonCalls[0]).toBe(payload);
  });

  test("jsonMode=false invokes human with an emitter and never calls ctx.json", () => {
    const { ctx, jsonCalls, logCalls } = fakeCtx();
    const result: CommandResult = {
      json: { should: "not appear" },
      human: (emit) => {
        emit("line one");
        emit(); // blank line
        emit("line two");
      },
    };
    render(ctx, false, result);
    expect(jsonCalls).toEqual([]);
    // emit() with no arg prints a blank line (ctx.log("")).
    expect(logCalls).toEqual(["line one", "", "line two"]);
  });
});
