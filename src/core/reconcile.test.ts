// Unit tests for the pure reconcile classifier (ADR-0013). ALL inputs are literal
// hashes — no fs, no network, no clone — so the full body-equality / 3-way / stale /
// adopted / offline permutation matrix is covered cheaply at the classify() boundary.
//
// Hash literals: H_local, H_up, H_inst are three DISTINCT body hashes.

import { test, expect, describe } from "bun:test";
import {
  classify,
  editedSinceInstall,
  differsFromUpstream,
  type ReconcileInput,
} from "./reconcile.ts";

const H_local = "aaa";
const H_up = "bbb";
const H_inst = "ccc";

/** A non-adopted, owned, online baseline; override per case. */
function input(over: Partial<ReconcileInput>): ReconcileInput {
  return {
    adopted: false,
    mode: "owned",
    installedHash: H_inst,
    localEdits: false,
    localHash: H_local,
    upstreamHash: H_up,
    installedRef: "ref0",
    latestRef: null,
    structural: null,
    ...over,
  };
}

describe("classify — short-circuits", () => {
  test("linked short-circuits everything (even orphaned/diverged inputs)", () => {
    expect(
      classify(input({ mode: "linked", structural: "orphaned", localHash: H_local, upstreamHash: H_up })),
    ).toBe("linked");
    expect(classify(input({ mode: "linked", adopted: true }))).toBe("linked");
  });

  test("orphaned beats a body verdict (even when local==upstream)", () => {
    expect(
      classify(input({ structural: "orphaned", localHash: H_up, upstreamHash: H_up })),
    ).toBe("orphaned");
  });

  test("relocated is surfaced as its own verdict", () => {
    expect(classify(input({ structural: "relocated" }))).toBe("relocated");
  });
});

describe("classify — local missing", () => {
  test("new: local missing, upstream in view", () => {
    expect(classify(input({ localHash: null, upstreamHash: H_up }))).toBe("new");
  });

  test("unknown(offline-empty): local missing, no upstream, no ref", () => {
    expect(
      classify(input({ localHash: null, upstreamHash: null, latestRef: null })),
    ).toBe("unknown");
  });
});

describe("classify — adopted", () => {
  test("adopted + upstream not in view -> adopted", () => {
    expect(classify(input({ adopted: true, upstreamHash: null }))).toBe("adopted");
  });

  test("adopted + identical -> identical (graduate path)", () => {
    expect(
      classify(input({ adopted: true, localHash: H_up, upstreamHash: H_up })),
    ).toBe("identical");
  });

  test("adopted + differ -> diverged ALWAYS, even when local===installedHash", () => {
    // Proves the unverified baseline always protects: localHash matches the recorded
    // installedHash (so editedSinceInstall would be false) yet bodies differ upstream.
    expect(
      classify(
        input({ adopted: true, localHash: H_inst, installedHash: H_inst, upstreamHash: H_up }),
      ),
    ).toBe("diverged");
  });
});

describe("classify — online body in view (non-adopted)", () => {
  test("online identical + ref known -> identical", () => {
    expect(
      classify(input({ localHash: H_up, upstreamHash: H_up, latestRef: "ref1" })),
    ).toBe("identical");
  });

  test("online diverged: local!==upstream AND local!==installedHash", () => {
    expect(
      classify(input({ localHash: H_local, installedHash: H_inst, upstreamHash: H_up })),
    ).toBe("diverged");
  });

  test("online stalePending: local!==upstream BUT local===installedHash", () => {
    // Upstream moved, the user did NOT edit — safe to apply plainly.
    expect(
      classify(input({ localHash: H_inst, installedHash: H_inst, upstreamHash: H_up })),
    ).toBe("stalePending");
  });
});

describe("classify — ref-only (online, no upstream body)", () => {
  test("ref-only stale: upstreamHash null, latestRef !== installedRef", () => {
    expect(
      classify(input({ upstreamHash: null, installedRef: "ref0", latestRef: "ref1" })),
    ).toBe("stale");
  });

  test("ref-only current: upstreamHash null, latestRef === installedRef", () => {
    expect(
      classify(input({ upstreamHash: null, installedRef: "ref0", latestRef: "ref0" })),
    ).toBe("current");
  });
});

describe("classify — offline (no upstream body, no ref)", () => {
  test("offline edited: installedHash set, local !== installedHash", () => {
    expect(
      classify(
        input({ upstreamHash: null, latestRef: null, localHash: H_local, installedHash: H_inst }),
      ),
    ).toBe("edited");
  });

  test("offline current: local === installedHash", () => {
    expect(
      classify(
        input({ upstreamHash: null, latestRef: null, localHash: H_inst, installedHash: H_inst }),
      ),
    ).toBe("current");
  });

  test("offline legacy unknown: installedHash null, no ref", () => {
    expect(
      classify(input({ upstreamHash: null, latestRef: null, installedHash: null })),
    ).toBe("unknown");
  });
});

describe("classify — legacy localEdits fallback", () => {
  test("installedHash null + localEdits true + upstream differs -> diverged", () => {
    // editedSinceInstall honors the legacy flag, so a differing upstream body lands as
    // a never-clobber diverged for a pre-hash-tracking entry.
    expect(
      classify(
        input({
          installedHash: null,
          localEdits: true,
          localHash: H_local,
          upstreamHash: H_up,
        }),
      ),
    ).toBe("diverged");
  });

  test("installedHash null + localEdits false + upstream differs -> stalePending", () => {
    expect(
      classify(
        input({
          installedHash: null,
          localEdits: false,
          localHash: H_local,
          upstreamHash: H_up,
        }),
      ),
    ).toBe("stalePending");
  });
});

describe("editedSinceInstall — standalone fact", () => {
  test("baseline present: true when local differs from installedHash", () => {
    expect(editedSinceInstall({ installedHash: H_inst, localHash: H_local, localEdits: false })).toBe(true);
  });
  test("baseline present: false when local matches installedHash", () => {
    expect(editedSinceInstall({ installedHash: H_inst, localHash: H_inst, localEdits: true })).toBe(false);
  });
  test("legacy (no baseline): falls back to localEdits flag", () => {
    expect(editedSinceInstall({ installedHash: null, localHash: H_local, localEdits: true })).toBe(true);
    expect(editedSinceInstall({ installedHash: null, localHash: H_local, localEdits: false })).toBe(false);
  });
  test("unreadable body: false (cannot assert an edit)", () => {
    expect(editedSinceInstall({ installedHash: H_inst, localHash: null, localEdits: true })).toBe(false);
  });
});

describe("differsFromUpstream — standalone fact", () => {
  test("upstream not in view -> null", () => {
    expect(differsFromUpstream({ localHash: H_local, upstreamHash: null })).toBeNull();
  });
  test("differs -> true", () => {
    expect(differsFromUpstream({ localHash: H_local, upstreamHash: H_up })).toBe(true);
  });
  test("identical -> false", () => {
    expect(differsFromUpstream({ localHash: H_up, upstreamHash: H_up })).toBe(false);
  });
});
