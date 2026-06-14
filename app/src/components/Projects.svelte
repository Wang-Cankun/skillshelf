<script lang="ts">
  // Per-project DEPLOY surface. Presentational only (ADR-0007): a graphical
  // front for the deterministic `skl` verbs. No data loading, no inference —
  // everything arrives via $props(); every mutating action shows its command
  // echo and is dispatched upward through onDrop.
  import type { StatusReport } from "../lib/types";
  import { cmdEcho } from "../lib/skl";

  let {
    status,
    onDrop,
  }: {
    status: StatusReport;
    onDrop: (name: string) => void;
  } = $props();

  const linkedCount = $derived(status.linkedCount);
  const bundles = $derived(status.bundles ?? []);
  const linked = $derived(status.linked ?? []);
  const unmanaged = $derived(status.unmanaged ?? []);
</script>

<section class="flex h-full flex-col bg-[#FAFAFA] text-[#18181B]">
  <!-- Header: project root + linked count -->
  <header
    class="flex items-baseline justify-between border-b border-[#E7E7E9] bg-[#FFFFFF] px-4 py-3"
  >
    <div class="min-w-0">
      <div
        class="text-[10px] font-medium tracking-wide text-[#9A9AA2] uppercase"
      >
        Project
      </div>
      <div class="mono truncate text-xs text-[#18181B]" title={status.projectRoot}>
        {status.projectRoot}
      </div>
    </div>
    <div class="shrink-0 text-right">
      <span
        class="mono text-sm font-semibold"
        class:text-[#2563EB]={linkedCount > 0}
        class:text-[#71717A]={linkedCount === 0}
      >
        {linkedCount}
      </span>
      <span class="ml-1 text-[11px] text-[#71717A]">linked</span>
    </div>
  </header>

  <div class="flex-1 overflow-auto px-4 py-4">
    <!-- Empty hint when nothing is linked -->
    {#if linkedCount === 0}
      <div
        class="rounded-md border border-dashed border-[#E7E7E9] bg-[#FFFFFF] px-4 py-6 text-center"
      >
        <div class="text-xs font-medium text-[#18181B]">
          No skills linked into this project
        </div>
        <p class="mx-auto mt-1.5 max-w-md text-[11px] leading-relaxed text-[#71717A]">
          Run
          <code class="mono rounded bg-[#FAFAFA] px-1 py-0.5 text-[#2563EB]"
            >skl use &lt;bundle&gt;</code
          >
          to symlink a bundle's skills into
          <code class="mono rounded bg-[#FAFAFA] px-1 py-0.5 text-[#18181B]"
            >./.claude/skills</code
          >. Linked skills stay in sync with the library and never drift.
        </p>
      </div>
    {/if}

    <!-- Unmanaged (real copies that can drift) -->
    {#if unmanaged.length > 0}
      <div
        class="mb-4 rounded-md border border-[#D97706]/40 bg-[#D97706]/[0.06] px-3 py-2.5"
      >
        <div class="flex items-center gap-1.5">
          <span class="text-[11px] font-semibold text-[#D97706]"
            >Unmanaged copies ({unmanaged.length})</span
          >
        </div>
        <p class="mt-1 text-[11px] leading-relaxed text-[#71717A]">
          These are real file copies, not links — they can silently drift out of
          sync with the library.
        </p>
        <ul class="mt-2 space-y-1">
          {#each unmanaged as u (u.name)}
            <li class="flex items-center gap-2 text-xs">
              <span class="mono text-[#18181B]">{u.name}</span>
              {#if u.inLibrary}
                <span class="text-[10px] text-[#71717A]">in library</span>
              {:else}
                <span class="text-[10px] text-[#D97706]">not in library</span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Bundles present -->
    {#if bundles.length > 0}
      <div class="mb-4">
        <div
          class="mb-1.5 text-[10px] font-medium tracking-wide text-[#9A9AA2] uppercase"
        >
          Bundles
        </div>
        <div class="space-y-2">
          {#each bundles as b (b.name)}
            <div
              class="rounded-md border border-[#E7E7E9] bg-[#FFFFFF] px-3 py-2"
            >
              <div class="mono text-xs font-medium text-[#18181B]">{b.name}</div>
              <div class="mt-1.5 flex flex-wrap gap-1">
                {#each b.skills as s (s)}
                  <span
                    class="mono rounded border border-[#E7E7E9] bg-[#FAFAFA] px-1.5 py-0.5 text-[10px] text-[#71717A]"
                    >{s}</span
                  >
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Linked skills list -->
    {#if linked.length > 0}
      <div>
        <div
          class="mb-1.5 text-[10px] font-medium tracking-wide text-[#9A9AA2] uppercase"
        >
          Linked skills
        </div>
        <table class="w-full border-collapse text-xs">
          <tbody>
            {#each linked as l (l.link)}
              <tr class="border-b border-[#E7E7E9] last:border-0 align-top">
                <td class="py-2 pr-3">
                  <div class="mono text-[#18181B]">{l.skill}</div>
                  <div class="mt-1 flex flex-wrap gap-1">
                    {#each l.domains as d (d)}
                      <span
                        class="rounded bg-[#FAFAFA] px-1.5 py-0.5 text-[10px] text-[#71717A]"
                        >{d}</span
                      >
                    {/each}
                    {#if !l.inLibrary}
                      <span class="px-1 text-[10px] text-[#D97706]"
                        >not in library</span
                      >
                    {/if}
                  </div>
                </td>
                <td class="w-px py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    title={cmdEcho(["drop", l.skill])}
                    onclick={() => onDrop(l.skill)}
                    class="rounded border border-[#E7E7E9] px-2 py-1 text-[11px] font-medium text-[#DC2626] transition-colors hover:border-[#DC2626] hover:bg-[#DC2626]/[0.06]"
                  >
                    Drop
                  </button>
                  <div class="mono mt-1 text-[10px] text-[#9A9AA2]">
                    {cmdEcho(["drop", l.skill])}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</section>
