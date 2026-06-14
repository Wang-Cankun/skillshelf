<script lang="ts">
  // Inspector — the right-pane ACTION COCKPIT for one selected skill.
  //
  // Presentational only (ADR-0007): no data loading, no inference. Every mutating
  // affordance shows its deterministic `skl` command echo and calls onAction([...])
  // with the real arg vector — and ONLY vectors the CLI router can resolve.
  // There is NO per-skill AI affordance: `skl infer` is library-wide with no
  // per-skill mode, so a per-skill "Suggest tags" button cannot work honestly
  // (ADR-0007). There is NO Edit/Open (skl has no edit/open verb; file opening
  // belongs in the Tauri shell, a later task). Valid vectors only:
  //   tag/untag (domains), rename, retire.
  import type { Skill, DeploymentSite } from "../lib/types";

  let {
    skill,
    sites,
    onAction,
  }: {
    skill: Skill | null;
    sites: DeploymentSite[];
    onAction: (args: string[]) => void;
  } = $props();

  // --- pure presentation helpers (no side effects, no data fetching) ---

  /** Collapse the user's home prefix to `~` for compact, scannable paths. */
  function tilde(p: string): string {
    const m = p.match(/^(\/Users\/[^/]+|\/home\/[^/]+)(\/|$)/);
    return m ? "~" + p.slice(m[1].length) : p;
  }

  type SiteView = { glyph: string; label: string; color: string };

  /**
   * Map a DeploymentSite to its CONTRACT kind label + status color.
   * green = clean/intended · amber = needs a human choice · red = broken.
   */
  function siteView(s: DeploymentSite): SiteView {
    switch (s.kind) {
      case "linked":
        return { glyph: "✓", label: "linked", color: "#15A34A" };
      case "source":
        return { glyph: "✓", label: "source", color: "#15A34A" };
      case "foreign-link":
        return { glyph: "⚠", label: "2nd-source", color: "#D97706" };
      case "dead":
        return { glyph: "✗", label: "dead", color: "#DC2626" };
      case "copy":
        if (s.drift) return { glyph: "⚠", label: "drift", color: "#D97706" };
        if (s.inLibrary)
          return { glyph: "⚠", label: "redundant copy", color: "#D97706" };
        return { glyph: "⚠", label: "untracked copy", color: "#D97706" };
      default:
        return { glyph: "·", label: s.kind, color: "#9A9AA2" };
    }
  }

  // Command echoes mirror the exact arg vector handed to onAction.
  function echo(args: string[]): string {
    return "skl " + args.join(" ");
  }

  // --- local UI state for the inline "+ add tag" affordance ---
  let addingTag = $state(false);
  let newTag = $state("");

  function commitTag() {
    const t = newTag.trim();
    if (skill && t) onAction(["tag", skill.name, t]);
    newTag = "";
    addingTag = false;
  }
</script>

{#if !skill}
  <div
    class="flex h-full items-center justify-center p-8 text-center text-xs text-[#9A9AA2]"
  >
    <p>Select a skill to inspect its deployments, tags, and actions.</p>
  </div>
{:else}
  <div class="flex h-full flex-col overflow-y-auto bg-[#FFFFFF]">
    <!-- Header: name + mode badge -->
    <header class="border-b border-[#E7E7E9] px-4 py-3">
      <div class="flex items-start justify-between gap-2">
        <h2
          class="mono text-lg leading-tight font-medium break-all text-[#18181B]"
        >
          {skill.name}
        </h2>
        {#if skill.mode === "linked"}
          <span
            class="shrink-0 rounded border border-[#BFDBFE] bg-[#EFF6FF] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[#2563EB] uppercase"
            title={skill.linkTarget
              ? "Linked → " + tilde(skill.linkTarget)
              : "Linked"}
          >
            linked
          </span>
        {:else}
          <span
            class="shrink-0 rounded border border-[#E7E7E9] bg-[#FAFAFA] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[#71717A] uppercase"
          >
            owned
          </span>
        {/if}
      </div>
      {#if skill.description}
        <p class="mt-1.5 line-clamp-3 text-xs leading-relaxed text-[#71717A]">
          {skill.description}
        </p>
      {/if}
    </header>

    <!-- Domains / tags -->
    <section class="border-b border-[#E7E7E9] px-4 py-3">
      <div
        class="mb-2 text-[11px] font-medium tracking-wide text-[#71717A] uppercase"
      >
        Domains
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        {#each skill.domains as domain (domain)}
          <span
            class="inline-flex items-center gap-1 rounded-full border border-[#E7E7E9] bg-[#FAFAFA] py-0.5 pr-1 pl-2 text-xs text-[#18181B]"
          >
            {domain}
            <button
              type="button"
              class="flex h-4 w-4 items-center justify-center rounded-full text-[#9A9AA2] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
              title={echo(["untag", skill.name, domain])}
              aria-label={"Untag " + domain}
              onclick={() => onAction(["untag", skill!.name, domain])}
            >
              ×
            </button>
          </span>
        {/each}

        {#if addingTag}
          <span
            class="inline-flex items-center rounded-full border border-[#2563EB] bg-[#EFF6FF] py-0.5 pr-1 pl-2"
          >
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="mono w-20 bg-transparent text-xs text-[#18181B] outline-none placeholder:text-[#9A9AA2]"
              placeholder="domain…"
              aria-label="New domain tag"
              autofocus
              bind:value={newTag}
              onkeydown={(e) => {
                if (e.key === "Enter") commitTag();
                if (e.key === "Escape") {
                  newTag = "";
                  addingTag = false;
                }
              }}
            />
            <button
              type="button"
              class="flex h-4 w-4 items-center justify-center rounded-full text-[#2563EB] hover:bg-[#DBEAFE]"
              aria-label="Confirm add tag"
              onclick={commitTag}
            >
              ✓
            </button>
          </span>
        {:else}
          <button
            type="button"
            class="inline-flex items-center gap-0.5 rounded-full border border-dashed border-[#E7E7E9] px-2 py-0.5 text-xs text-[#71717A] hover:border-[#9A9AA2] hover:text-[#18181B]"
            onclick={() => (addingTag = true)}
          >
            + add
          </button>
        {/if}
      </div>
      {#if addingTag && newTag.trim()}
        <p class="mono mt-1.5 text-[11px] text-[#9A9AA2]">
          {echo(["tag", skill.name, newTag.trim()])}
        </p>
      {/if}
    </section>

    <!-- Deployments -->
    <section class="border-b border-[#E7E7E9] px-4 py-3">
      <div
        class="mb-2 text-[11px] font-medium tracking-wide text-[#71717A] uppercase"
      >
        Deployed at {sites.length}
        {sites.length === 1 ? "site" : "sites"}
      </div>
      {#if sites.length === 0}
        <p class="text-xs text-[#9A9AA2]">Not deployed anywhere yet.</p>
      {:else}
        <ul class="space-y-1">
          {#each sites as site (site.surface + "/" + site.name)}
            {@const v = siteView(site)}
            <li class="flex items-baseline gap-2 text-xs">
              <span
                class="inline-flex shrink-0 items-center gap-1 font-medium"
                style="color: {v.color}"
                title={site.kind}
              >
                <span aria-hidden="true">{v.glyph}</span>
                {v.label}
              </span>
              <span class="mono truncate text-[#71717A]" title={site.path}>
                {tilde(site.path)}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Actions -->
    <section class="px-4 py-3">
      <div
        class="mb-2 text-[11px] font-medium tracking-wide text-[#71717A] uppercase"
      >
        Actions
      </div>
      <div class="space-y-2.5">
        <!-- Rename -->
        <div>
          <button
            type="button"
            class="w-full rounded-md border border-[#E7E7E9] bg-[#FFFFFF] px-3 py-1.5 text-left text-xs font-medium text-[#18181B] hover:bg-[#FAFAFA]"
            onclick={() => {
              const next = (
                globalThis.prompt?.(
                  "Rename " + skill!.name + " to:",
                  skill!.name,
                ) ?? ""
              ).trim();
              if (next && next !== skill!.name)
                onAction(["rename", skill!.name, next]);
            }}
          >
            Rename
          </button>
          <p class="mono mt-1 text-[11px] text-[#9A9AA2]">
            {echo(["rename", skill.name, "<newName>"])}
          </p>
        </div>

        <!-- Retire (destructive) -->
        <div>
          <button
            type="button"
            class="w-full rounded-md border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-1.5 text-left text-xs font-medium text-[#DC2626] hover:bg-[#FEE2E2]"
            onclick={() => {
              if (
                globalThis.confirm?.(
                  "Retire " + skill!.name + "? This removes it from the library.",
                )
              )
                onAction(["retire", skill!.name]);
            }}
          >
            Retire
          </button>
          <p class="mono mt-1 text-[11px] text-[#DC2626]/70">
            {echo(["retire", skill.name])}
          </p>
        </div>
      </div>
    </section>
  </div>
{/if}

<style>
  .mono {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
  }
</style>
