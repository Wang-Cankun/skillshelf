<script lang="ts">
  // Locations — the WHERE-IS-WHAT surface (the user's core pain).
  // Presentational only (ADR-0007): no data loading, no inference. Everything
  // arrives via $props(). The two parts below are derived deterministically from
  // the `skl where` feed (report) plus the `skl scan` feed (scan):
  //   1. "Needs attention" — built ONLY from report.problems.
  //   2. A skill × surface MATRIX driven by report.sites / report.surfaces.
  import type { DeploymentReport, ScanReport, DeploymentSite } from "../lib/types";

  let {
    report,
    scan,
    onFix,
    onSelect,
    selectedName = null,
  }: {
    report: DeploymentReport;
    scan: ScanReport;
    onFix: (mode: "prune" | "fix") => void;
    onSelect: (name: string) => void;
    selectedName?: string | null;
  } = $props();

  // ---- palette (status-only color; chrome stays neutral) --------------------
  const C = {
    clean: "#15A34A",
    drift: "#D97706",
    linked: "#2563EB",
    dead: "#DC2626",
    sub: "#71717A",
    faint: "#9A9AA2",
  } as const;

  // ---- Part 1: classify each problem row deterministically ------------------
  // report.problems is already the deterministic problem set; we only label it.
  type Kind = "drift" | "2nd-source" | "untracked" | "dead";

  function classify(p: DeploymentSite): Kind {
    if (p.drift) return "drift";
    if (p.kind === "dead") return "dead";
    // A foreign-link is a 2nd source even when not in the library — match the
    // labelFor logic in `skl where` and check kind BEFORE the !inLibrary branch.
    if (p.kind === "foreign-link" || p.kind === "copy") return "2nd-source";
    if (!p.inLibrary) return "untracked";
    return "2nd-source";
  }

  const META: Record<
    Kind,
    { glyph: string; label: string; color: string; sev: number }
  > = {
    dead: { glyph: "✗", label: "Dead link", color: C.dead, sev: 0 },
    drift: { glyph: "⚠", label: "Drift", color: C.drift, sev: 1 },
    "2nd-source": {
      glyph: "□",
      label: "2nd source",
      color: C.drift,
      sev: 2,
    },
    untracked: { glyph: "◆", label: "Untracked", color: C.linked, sev: 3 },
  };

  // tilde-shorten an absolute path for display (home dir only).
  function tilde(p: string): string {
    const m = p.match(/^\/Users\/[^/]+(\/.*)?$/);
    return m ? "~" + (m[1] ?? "") : p;
  }

  type Row = {
    site: DeploymentSite;
    kind: Kind;
    meta: (typeof META)[Kind];
  };

  const rows = $derived<Row[]>(
    (report.problems ?? [])
      .map((site) => {
        const kind = classify(site);
        return { site, kind, meta: META[kind] };
      })
      .sort(
        (a, b) =>
          a.meta.sev - b.meta.sev ||
          a.site.name.localeCompare(b.site.name) ||
          a.site.surface.localeCompare(b.site.surface),
      ),
  );

  const deadCount = $derived(rows.filter((r) => r.kind === "dead").length);
  // Auto-fix safe = remediation is NOT manual: dead links (relink/prune) PLUS
  // content-identical redundant copies (a 2nd-source `copy` with no drift is in
  // sync, so it can be consolidated to a link automatically). A `foreign-link`
  // points elsewhere and a drifted copy diverges — both need a human decision.
  const identicalRedundantCount = $derived(
    rows.filter(
      (r) => r.kind === "2nd-source" && r.site.kind === "copy" && !r.site.drift,
    ).length,
  );
  const safeFixable = $derived(deadCount + identicalRedundantCount);
  const newCount = $derived(scan?.totals?.new ?? 0);

  // ---- Part 2: skill × surface matrix ---------------------------------------
  // Cell glyph by DeploymentSite.kind in a given surface. Per CONTRACT colors.
  type CellState =
    | "linked"
    | "drift"
    | "redundant"
    | "untracked"
    | "dead"
    | "absent";

  const CELL: Record<
    CellState,
    { glyph: string; color: string; title: string }
  > = {
    linked: { glyph: "✓", color: C.clean, title: "linked" },
    drift: { glyph: "⚠", color: C.drift, title: "drift" },
    redundant: { glyph: "□", color: C.drift, title: "redundant / copy" },
    untracked: { glyph: "◆", color: C.linked, title: "untracked" },
    dead: { glyph: "✗", color: C.dead, title: "dead" },
    absent: { glyph: "·", color: C.faint, title: "absent" },
  };

  function cellState(site: DeploymentSite): CellState {
    if (site.kind === "dead") return "dead";
    if (site.drift) return "drift";
    if (!site.inLibrary) return "untracked";
    if (site.kind === "copy" || site.kind === "foreign-link")
      return "redundant";
    return "linked"; // linked | source
  }

  // surfaces are realpath-deduped already by `skl where`.
  const surfaces = $derived(report.surfaces ?? []);

  // unique skill names across all sites, alphabetical.
  const skillNames = $derived(
    [...new Set((report.sites ?? []).map((s) => s.name))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );

  // severity ordering for cell merge: dead > drift > redundant > untracked > linked.
  const CELL_SEV: Record<CellState, number> = {
    dead: 4,
    drift: 3,
    redundant: 2,
    untracked: 1,
    linked: 0,
    absent: -1,
  };

  // lookup: name -> surface -> CellState (keep MAX severity when a (skill,surface)
  // has multiple sites, so a dead/drift never hides behind a linked first-wins).
  const grid = $derived.by(() => {
    const m = new Map<string, Map<string, CellState>>();
    for (const site of report.sites ?? []) {
      let row = m.get(site.name);
      if (!row) {
        row = new Map();
        m.set(site.name, row);
      }
      const next = cellState(site);
      const prev = row.get(site.surface);
      if (prev === undefined || CELL_SEV[next] > CELL_SEV[prev]) {
        row.set(site.surface, next);
      }
    }
    return m;
  });

  function cellOf(name: string, surface: string): CellState {
    return grid.get(name)?.get(surface) ?? "absent";
  }

  // shortened, basename-ish surface header (last 1–2 path segments after tilde).
  function surfaceHead(p: string): string {
    const t = tilde(p);
    const segs = t.split("/").filter(Boolean);
    return segs.length <= 2 ? t : "…/" + segs.slice(-2).join("/");
  }
</script>

<div class="flex h-full flex-col gap-5 overflow-auto p-4 text-[#18181B]">
  <!-- ===================== Part 1: Needs attention ===================== -->
  <section>
    <div class="mb-1 flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold tracking-tight">
        Needs attention
        <span class="ml-1 text-xs font-normal text-[#9A9AA2]">
          {rows.length}
          {rows.length === 1 ? "issue" : "issues"}
        </span>
      </h2>
      <div class="flex items-center gap-2">
        <button
          class="rounded-md border border-[#E7E7E9] bg-white px-2.5 py-1 text-xs font-medium text-[#15A34A] transition-colors hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:text-[#9A9AA2]"
          title="skl where --fix — relink dead links and consolidate identical copies (safe)"
          disabled={safeFixable === 0}
          onclick={() => onFix("fix")}
        >
          Auto-fix safe (dead links + identical copies){safeFixable
            ? ` (${safeFixable})`
            : ""}
        </button>
        <button
          class="rounded-md border border-[#E7E7E9] bg-white px-2.5 py-1 text-xs font-medium text-[#DC2626] transition-colors hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:text-[#9A9AA2]"
          title="skl where --prune — remove dead links"
          disabled={deadCount === 0}
          onclick={() => onFix("prune")}
        >
          Prune dead{deadCount ? ` (${deadCount})` : ""}
        </button>
      </div>
    </div>
    <p class="mb-2 text-xs text-[#9A9AA2]">
      Auto-fix and Prune touch dead links only. Drift and untracked skills need a
      human decision — they are never auto-resolved.
    </p>

    {#if rows.length === 0}
      <div
        class="rounded-md border border-[#E7E7E9] bg-white px-3 py-2.5 text-xs text-[#15A34A]"
      >
        ✓ No problems — every deployed skill is linked and in sync.
      </div>
    {:else}
      <ul
        class="divide-y divide-[#E7E7E9] overflow-hidden rounded-md border border-[#E7E7E9] bg-white"
      >
        {#each rows as r (r.site.surface + "/" + r.site.name + "/" + r.kind)}
          <li
            class="flex items-center gap-3 px-3 py-1.5 text-xs hover:bg-[#FAFAFA]"
          >
            <span
              class="w-3 shrink-0 text-center font-medium"
              style="color:{r.meta.color}"
              title={r.meta.label}>{r.meta.glyph}</span
            >
            <span
              class="w-20 shrink-0 font-medium"
              style="color:{r.meta.color}">{r.meta.label}</span
            >
            <button
              class="mono shrink-0 truncate text-left hover:underline"
              class:font-semibold={selectedName === r.site.name}
              title="Inspect {r.site.name}"
              onclick={() => onSelect(r.site.name)}>{r.site.name}</button
            >
            <span
              class="mono min-w-0 flex-1 truncate text-[#71717A]"
              title={r.site.path}>{tilde(r.site.path)}</span
            >
            <span class="shrink-0">
              {#if r.kind === "drift"}
                <button
                  class="rounded border border-[#E7E7E9] px-1.5 py-0.5 text-[#D97706] hover:bg-[#FAFAFA]"
                  onclick={() => onSelect(r.site.name)}>Diff</button
                >
                <button
                  class="rounded border border-[#E7E7E9] px-1.5 py-0.5 text-[#D97706] hover:bg-[#FAFAFA]"
                  onclick={() => onSelect(r.site.name)}>Resolve</button
                >
              {:else if r.kind === "untracked"}
                <button
                  class="rounded border border-[#E7E7E9] px-1.5 py-0.5 text-[#2563EB] hover:bg-[#FAFAFA]"
                  onclick={() => onSelect(r.site.name)}>Import</button
                >
              {:else if r.kind === "2nd-source"}
                <button
                  class="rounded border border-[#E7E7E9] px-1.5 py-0.5 text-[#D97706] hover:bg-[#FAFAFA]"
                  onclick={() => onSelect(r.site.name)}>Resolve</button
                >
              {:else if r.kind === "dead"}
                <button
                  class="rounded border border-[#E7E7E9] px-1.5 py-0.5 text-[#DC2626] hover:bg-[#FAFAFA]"
                  onclick={() => onFix("prune")}>Prune</button
                >
              {/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- ===================== Part 2: skill × surface matrix ===================== -->
  <section class="min-h-0">
    <div class="mb-1 flex items-baseline justify-between gap-3">
      <h2 class="text-sm font-semibold tracking-tight">
        Where is what
        <span class="ml-1 text-xs font-normal text-[#9A9AA2]">
          {skillNames.length} skills × {surfaces.length} locations
        </span>
      </h2>
      {#if newCount > 0}
        <span class="text-xs text-[#2563EB]">{newCount} new on disk</span>
      {/if}
    </div>
    <p class="mb-2 text-xs text-[#9A9AA2]">
      Location columns come from the live <span class="mono">skl where</span> feed
      (realpath-deduped).
    </p>

    <div class="overflow-auto rounded-md border border-[#E7E7E9] bg-white">
      <table class="min-w-full border-collapse text-xs">
        <thead>
          <tr class="border-b border-[#E7E7E9]">
            <th
              class="sticky left-0 z-10 border-r border-[#E7E7E9] bg-white px-3 py-2 text-left font-medium text-[#71717A]"
            >
              skill
            </th>
            {#each surfaces as s (s)}
              <th
                class="mono whitespace-nowrap px-2 py-2 text-center font-normal text-[#71717A]"
                title={s}
              >
                {surfaceHead(s)}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each skillNames as name (name)}
            {@const selected = selectedName === name}
            <tr class="border-b border-[#F1F1F2] last:border-0 hover:bg-[#FAFAFA]">
              <th
                class="sticky left-0 z-10 border-r border-[#E7E7E9] bg-white px-3 py-1 text-left font-normal"
                class:bg-[#F4F4F5]={selected}
              >
                <button
                  class="mono text-left hover:underline"
                  class:font-semibold={selected}
                  onclick={() => onSelect(name)}>{name}</button
                >
              </th>
              {#each surfaces as s (s)}
                {@const st = cellOf(name, s)}
                <td
                  class="px-2 py-1 text-center font-medium"
                  style="color:{CELL[st].color}"
                  title={`${name} · ${CELL[st].title}`}
                >
                  {CELL[st].glyph}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- legend -->
    <div
      class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#71717A]"
    >
      {#each Object.entries(CELL) as [, c] (c.title)}
        <span class="flex items-center gap-1">
          <span class="font-medium" style="color:{c.color}">{c.glyph}</span>
          <span>{c.title}</span>
        </span>
      {/each}
    </div>
  </section>
</div>
