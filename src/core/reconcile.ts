// skl reconcile — the ONE pure verdict classifier shared by `update`, `outdated`,
// and `add`. It answers a single question against a skill's recorded provenance plus
// pre-computed body hashes: given what we know (offline and/or online), what is the
// relationship between the LOCAL body, the install BASELINE, and CURRENT upstream?
//
// PURE: no async, no IO, no network, no node imports. Every input is a literal — a
// LockEntry's facts plus body HASHES the commands already compute (hashContent of the
// frontmatter-stripped body, exactly `hashContent(parseFrontmatter(text).body)`).
// Hashing/clone/fs stays in the commands; this module only reasons over the hashes.
//
// WHY this exists (the flagged divergence): `update`'s old "diverged" (the user
// hand-edited AND the body differs from current upstream) and `outdated --check-local`'s
// "diverged" (just edited-since-install, no upstream in view) were ONE overloaded word
// across two axes. They are now two NAMED verdicts — `diverged` (online) vs `edited`
// (offline) — computed from two explicit, separately-testable facts:
//   - editedSinceInstall : did the USER hand-edit since MY install baseline? (offline)
//   - differsFromUpstream: does the local body differ from CURRENT upstream? (online;
//                          null when upstream is not in view).
// update's never-clobber gate is the AND of both; the convergent-edit case (user
// hand-edits to exactly upstream's new content) is why both facts are load-bearing.

/** Owned = library owns versioning; linked = an external dev repo does (ADR-0004). */
export type EntryMode = "owned" | "linked";

/**
 * Everything the classifier needs, all literal — no LockEntry, no fs, no network.
 * The commands project a LockEntry + their pre-computed hashes onto this shape.
 */
export interface ReconcileInput {
  /** LockEntry.adopted === true: provenance known, baseline NEVER verified (ADR-0011). */
  adopted: boolean;
  /** linked => verdict ALWAYS "linked" (never-clobber, ADR-0004); short-circuits all. */
  mode: EntryMode;
  /** LockEntry.installedHash ?? null — the upstream body recorded at install/update. */
  installedHash: string | null;
  /** LockEntry.localEdits — consulted ONLY as the legacy fallback when installedHash==null. */
  localEdits: boolean;
  /** hash of the on-disk SKILL.md body; null when the file is missing/unreadable. */
  localHash: string | null;
  /** hash of the fetched upstream body; null = upstream body NOT in view (offline) or absent. */
  upstreamHash: string | null;
  /** LockEntry.ref ('' for an adopted entry with no real ref). */
  installedRef: string;
  /** upstream HEAD ref if probed; null when not probed (offline / no ref view). */
  latestRef: string | null;
  /** structural fact the COMMAND already determined from the checkout. Default null. */
  structural?: "orphaned" | "relocated" | null;
}

/**
 * The reconciled verdict union (the superset of outdated.Status + update.Outcome +
 * add.Verdict). Each command projects this DOWN onto its own unchanged public enum.
 */
export type Verdict =
  | "linked" // mode==linked: dev repo owns versioning; never pull (ADR-0004). short-circuit #1.
  | "orphaned" // structural=="orphaned": gone upstream, library copy kept.
  | "relocated" // structural=="relocated": followed a rename (a modifier the command stamps).
  | "new" // localHash==null AND upstreamHash!=null => add would install fresh.
  | "adopted" // adopted && upstreamHash==null: provenance known, baseline UNVERIFIED (ADR-0011).
  | "identical" // localHash===upstreamHash. adopted+online => graduate; add => lossless re-install.
  | "diverged" // ONLINE: differs AND (adopted || editedSinceInstall). never-clobber-without-force.
  | "stale" // ONLINE ref-only (upstreamHash==null, latestRef!=null): latestRef!==installedRef.
  | "edited" // OFFLINE (upstreamHash==null, latestRef==null): editedSinceInstall (old --check-local 'diverged').
  | "stalePending" // ONLINE: differs but NOT editedSinceInstall (upstream moved, user didn't edit; safe-apply).
  | "current" // local matches upstream/baseline and ref unchanged.
  | "unknown"; // localHash==null offline; OR installedHash==null offline (no baseline).

/**
 * Did the USER hand-edit the local body since MY install baseline? Offline-knowable.
 *   - installedHash!=null  => true 3-way baseline compare (localHash !== installedHash).
 *   - installedHash==null  => fall back to the legacy localEdits flag.
 *   - localHash==null      => false (cannot assert an edit on an unreadable body).
 * Lifted verbatim from update.ts's userEdited rule, with the unreadable-body guard.
 */
export function editedSinceInstall(
  input: Pick<ReconcileInput, "installedHash" | "localHash" | "localEdits">,
): boolean {
  if (input.localHash == null) return false;
  return input.installedHash != null
    ? input.localHash !== input.installedHash
    : input.localEdits === true;
}

/**
 * Does the local body differ from CURRENT upstream? Online-only.
 *   - upstreamHash==null => null (unknowable — upstream not in view / offline).
 *   - else               => localHash !== upstreamHash.
 */
export function differsFromUpstream(
  input: Pick<ReconcileInput, "localHash" | "upstreamHash">,
): boolean | null {
  if (input.upstreamHash == null) return null;
  return input.localHash !== input.upstreamHash;
}

/**
 * TOTAL + deterministic. Never throws — every path returns a Verdict. The decision
 * ORDER is fragile and load-bearing (see the INVARIANTS in the ADR-0013 spec):
 *   linked > orphaned > relocated > new(local missing) > adopted > online-body > ref/offline.
 * Checking adopted before linked would re-probe a linked dev repo; checking online
 * body before the local-missing guard would mis-fire on a freshly-installed name.
 */
export function classify(input: ReconcileInput): Verdict {
  // 1. mode==linked — the dev repo owns versioning; never pull (ADR-0004). Beats all.
  if (input.mode === "linked") return "linked";

  // 2-3. Structural facts the command already resolved from the checkout.
  if (input.structural === "orphaned") return "orphaned";
  if (input.structural === "relocated") return "relocated";

  // 4. Local body missing/unreadable: a fresh upstream body means `add` would install;
  //    nothing in view at all is simply unknown.
  if (input.localHash == null) {
    return input.upstreamHash != null ? "new" : "unknown";
  }

  // 5. ADOPTED: the baseline was never verified against real upstream. Be conservative
  //    (ADR-0011) — derive purely from the live local-vs-upstream compare, IGNORING
  //    installedHash/localEdits (which describe the local copy only).
  if (input.adopted) {
    const differs = differsFromUpstream(input);
    if (differs == null) return "adopted"; // baseline unverified, upstream not in view
    return differs ? "diverged" : "identical";
  }

  // 6. ONLINE body in view (non-adopted): the full 3-way. Identical re-installs cleanly;
  //    a difference the USER caused is `diverged` (never-clobber-without-force); a
  //    difference the user did NOT cause (upstream moved on) is `stalePending` (safe-apply).
  const differs = differsFromUpstream(input);
  if (differs != null) {
    if (!differs) return "identical";
    return editedSinceInstall(input) ? "diverged" : "stalePending";
  }

  // 7. Upstream body NOT in view. With a ref probe, compare refs (stale vs current);
  //    without one (fully offline), fall back to the install-baseline edit check.
  if (input.latestRef != null) {
    return input.latestRef !== input.installedRef ? "stale" : "current";
  }
  if (input.installedHash == null) return "unknown"; // no baseline to compare against
  return editedSinceInstall(input) ? "edited" : "current";
}
