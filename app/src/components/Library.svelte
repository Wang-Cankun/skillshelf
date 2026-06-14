<script lang="ts">
  import type { Skill } from "../lib/types";
  import { cmdEcho } from "../lib/skl";

  let {
    skills,
    selectedName,
    onSelect,
    onBulkAction,
  }: {
    skills: Skill[];
    selectedName: string | null;
    onSelect: (name: string) => void;
    onBulkAction: (
      action: "retire" | "tag",
      names: string[],
      domain?: string,
    ) => void;
  } = $props();

  type SortKey = "name" | "domain" | "mode";

  let query = $state("");
  let sortKey = $state<SortKey>("name");
  let sortDir = $state<"asc" | "desc">("asc");
  // Set of selected skill names (multi-select via checkboxes).
  let checked = $state<Set<string>>(new Set());
  // Domain entered in the bulk bar; required before a Tag can be dispatched.
  let bulkDomain = $state("");

  const q = $derived(query.trim().toLowerCase());

  // Fuzzy-ish local filter over name + description + domains.
  const filtered = $derived.by(() => {
    if (!q) return skills;
    return skills.filter((s) => {
      const hay = (
        s.name +
        " " +
        s.description +
        " " +
        s.domains.join(" ")
      ).toLowerCase();
      // subsequence match: every query char appears in order (cheap fuzzy)
      let i = 0;
      for (const ch of hay) {
        if (ch === q[i]) i++;
        if (i === q.length) return true;
      }
      // fall back to plain substring across whitespace-split terms
      return q.split(/\s+/).every((t) => hay.includes(t));
    });
  });

  const sorted = $derived.by(() => {
    const rows = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let av = "";
      let bv = "";
      if (sortKey === "name") {
        av = a.name;
        bv = b.name;
      } else if (sortKey === "domain") {
        av = a.primaryDomain ?? a.domains[0] ?? "";
        bv = b.primaryDomain ?? b.domains[0] ?? "";
      } else {
        av = a.mode;
        bv = b.mode;
      }
      const c = av.localeCompare(bv);
      return (c !== 0 ? c : a.name.localeCompare(b.name)) * dir;
    });
    return rows;
  });

  const selectedNames = $derived([...checked]);
  const allVisibleChecked = $derived(
    sorted.length > 0 && sorted.every((s) => checked.has(s.name)),
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = "asc";
    }
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "↑" : "↓";
  }

  function toggleRow(name: string) {
    const next = new Set(checked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    checked = next;
  }

  function toggleAll() {
    if (allVisibleChecked) {
      checked = new Set();
    } else {
      checked = new Set(sorted.map((s) => s.name));
    }
  }

  function clearSelection() {
    checked = new Set();
    bulkDomain = "";
  }

  // Trimmed domain for the bulk Tag action; Tag is gated on this being non-empty.
  const trimmedDomain = $derived(bulkDomain.trim());
  const canTag = $derived(selectedNames.length > 0 && trimmedDomain.length > 0);

  function bulkRetire() {
    if (selectedNames.length === 0) return;
    // App loops one `skl retire <name>` per name (and confirms).
    onBulkAction("retire", selectedNames);
  }

  function bulkTag() {
    if (!canTag) return;
    // App loops one `skl tag <name> <domain>` per name.
    onBulkAction("tag", selectedNames, trimmedDomain);
  }

  function truncate(text: string, n = 96): string {
    if (!text) return "";
    return text.length > n ? text.slice(0, n - 1) + "…" : text;
  }

  // Command echo for the active bulk action bar (ADR-0007 transparency).
  // Reflects EXACTLY what will run: the real verb + the full selected-name
  // vector, no hardcoded verb and no '…'/placeholder tokens.
  //   retire -> 'skl retire a b c'
  //   tag    -> 'skl tag a <domain>; skl tag b <domain>'
  const bulkEcho = $derived.by(() => {
    if (selectedNames.length === 0) return "";
    if (canTag) {
      return selectedNames
        .map((n) => cmdEcho(["tag", n, trimmedDomain]))
        .join("; ");
    }
    // Default pending verb when no domain entered is retire (the only other
    // verb that needs no extra input).
    return cmdEcho(["retire", ...selectedNames]);
  });
</script>

<div class="flex h-full flex-col bg-[#FAFAFA] text-[#18181B]">
  <!-- Search header -->
  <header
    class="flex items-center gap-3 border-b border-[#E7E7E9] bg-[#FFFFFF] px-4 py-3"
  >
    <div class="relative flex-1">
      <span
        class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9AA2]"
        aria-hidden="true">⌕</span
      >
      <input
        type="text"
        bind:value={query}
        placeholder="Search skills by name, description, domain…"
        spellcheck="false"
        autocomplete="off"
        class="w-full rounded-md border border-[#E7E7E9] bg-[#FAFAFA] py-1.5 pl-8 pr-3 text-sm text-[#18181B] placeholder:text-[#9A9AA2] focus:border-[#2563EB] focus:bg-white focus:outline-none"
      />
    </div>
    <div class="shrink-0 text-xs text-[#71717A]">
      {sorted.length}
      <span class="text-[#9A9AA2]">/ {skills.length}</span>
    </div>
  </header>

  <!-- Table -->
  <div class="min-h-0 flex-1 overflow-auto">
    <table class="w-full border-collapse text-sm">
      <thead
        class="sticky top-0 z-10 bg-[#FFFFFF] text-left text-xs text-[#71717A]"
      >
        <tr class="border-b border-[#E7E7E9]">
          <th class="w-9 px-3 py-2">
            <input
              type="checkbox"
              checked={allVisibleChecked}
              onchange={toggleAll}
              aria-label="Select all visible skills"
              class="h-3.5 w-3.5 cursor-pointer accent-[#2563EB]"
            />
          </th>
          <th class="px-3 py-2 font-medium">
            <button
              type="button"
              onclick={() => toggleSort("name")}
              class="flex items-center gap-1 hover:text-[#18181B]"
            >
              Skill <span class="text-[#2563EB]">{sortIndicator("name")}</span>
            </button>
          </th>
          <th class="px-3 py-2 font-medium">
            <button
              type="button"
              onclick={() => toggleSort("domain")}
              class="flex items-center gap-1 hover:text-[#18181B]"
            >
              Domains <span class="text-[#2563EB]">{sortIndicator("domain")}</span
              >
            </button>
          </th>
          <th class="px-3 py-2 font-medium">
            <button
              type="button"
              onclick={() => toggleSort("mode")}
              class="flex items-center gap-1 hover:text-[#18181B]"
            >
              Mode <span class="text-[#2563EB]">{sortIndicator("mode")}</span>
            </button>
          </th>
          <th class="px-3 py-2 font-medium">Status</th>
          <th class="px-3 py-2 font-medium">Description</th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as s (s.name)}
          {@const isSelected = selectedName === s.name}
          {@const isChecked = checked.has(s.name)}
          {@const untagged = s.domains.length === 0}
          <tr
            onclick={() => onSelect(s.name)}
            class="cursor-pointer border-b border-[#E7E7E9] transition-colors {isSelected
              ? 'bg-[#EFF4FE]'
              : isChecked
                ? 'bg-[#F4F8FF]'
                : 'hover:bg-[#F5F5F6]'}"
          >
            <td class="px-3 py-2 align-top" onclick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isChecked}
                onchange={() => toggleRow(s.name)}
                aria-label={`Select ${s.name}`}
                class="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-[#2563EB]"
              />
            </td>
            <td class="px-3 py-2 align-top">
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  onSelect(s.name);
                }}
                aria-pressed={isSelected}
                class="flex w-full items-center gap-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1"
              >
                {#if isSelected}
                  <span
                    class="-ml-1 h-3 w-0.5 rounded-full bg-[#2563EB]"
                    aria-hidden="true"
                  ></span>
                {/if}
                <span class="font-mono text-[13px] text-[#18181B]">{s.name}</span>
                {#if untagged}
                  <span
                    class="text-xs text-[#9A9AA2]"
                    title="Untagged skill — no domains assigned">🏷</span
                  >
                {/if}
              </button>
            </td>
            <td class="px-3 py-2 align-top">
              {#if untagged}
                <span class="text-xs italic text-[#9A9AA2]">untagged</span>
              {:else}
                <div class="flex flex-wrap gap-1">
                  {#each s.domains as d}
                    <span
                      class="rounded border px-1.5 py-0.5 text-[11px] {d ===
                      s.primaryDomain
                        ? 'border-[#C7D7FB] bg-[#EFF4FE] text-[#2563EB]'
                        : 'border-[#E7E7E9] bg-[#FAFAFA] text-[#71717A]'}"
                      >{d}</span
                    >
                  {/each}
                </div>
              {/if}
            </td>
            <td class="px-3 py-2 align-top">
              {#if s.mode === "linked"}
                <span class="font-mono text-xs text-[#2563EB]">linked</span>
              {:else}
                <span class="font-mono text-xs text-[#71717A]">owned</span>
              {/if}
            </td>
            <td class="px-3 py-2 align-top">
              {#if s.retired}
                <span
                  class="rounded border border-[#F3C9C9] bg-[#FCEAEA] px-1.5 py-0.5 text-[11px] font-medium text-[#DC2626]"
                  >retired</span
                >
              {:else}
                <span class="text-xs text-[#9A9AA2]">—</span>
              {/if}
            </td>
            <td class="px-3 py-2 align-top text-[#71717A]">
              <span class="line-clamp-1">{truncate(s.description)}</span>
            </td>
          </tr>
        {/each}
        {#if sorted.length === 0}
          <tr>
            <td colspan="6" class="px-3 py-12 text-center text-sm text-[#9A9AA2]">
              {#if skills.length === 0}
                No skills in the library yet.
              {:else}
                No skills match “{query}”.
              {/if}
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>

  <!-- Sticky bulk action bar (dark) -->
  {#if selectedNames.length > 0}
    <div
      class="sticky bottom-0 z-20 flex items-center gap-3 border-t border-black/20 bg-[#18181B] px-4 py-2.5 text-white shadow-[0_-4px_16px_rgba(0,0,0,0.12)]"
    >
      <span class="text-sm font-medium">
        {selectedNames.length} selected
      </span>
      <button
        type="button"
        onclick={clearSelection}
        class="text-xs text-[#9A9AA2] underline-offset-2 hover:text-white hover:underline"
        >clear</button
      >

      <span
        class="hidden flex-1 truncate font-mono text-[11px] text-[#71717A] sm:block"
        title={bulkEcho}
      >
        {bulkEcho}
      </span>

      <div class="ml-auto flex items-center gap-1.5">
        <input
          type="text"
          bind:value={bulkDomain}
          placeholder="domain…"
          spellcheck="false"
          autocomplete="off"
          aria-label="Domain to tag selected skills with"
          onkeydown={(e) => {
            if (e.key === "Enter") bulkTag();
          }}
          class="w-28 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white placeholder:text-[#71717A] focus:border-[#2563EB] focus:outline-none"
        />
        <button
          type="button"
          onclick={bulkTag}
          disabled={!canTag}
          title={canTag ? "" : "Enter a domain to tag the selected skills"}
          class="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/5"
        >
          Tag
        </button>
        <button
          type="button"
          onclick={bulkRetire}
          class="rounded-md border border-[#DC2626]/40 bg-[#DC2626]/15 px-2.5 py-1 text-xs font-medium text-[#F4A0A0] hover:bg-[#DC2626]/25"
        >
          Retire
        </button>
      </div>
    </div>
  {/if}
</div>
