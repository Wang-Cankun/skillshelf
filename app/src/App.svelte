<script lang="ts">
  import { onMount } from "svelte";
  import {
    loadLibrary,
    loadWhere,
    loadScan,
    loadStatus,
    runAction,
    cmdEcho,
    IS_TAURI,
  } from "./lib/skl";
  import type {
    Skill,
    DeploymentReport,
    ScanReport,
    StatusReport,
  } from "./lib/types";
  import Library from "./components/Library.svelte";
  import Locations from "./components/Locations.svelte";
  import Projects from "./components/Projects.svelte";
  import Inspector from "./components/Inspector.svelte";

  type View = "library" | "locations" | "projects";

  // ---- reactive state (Svelte 5 runes) -------------------------------------
  let view = $state<View>("library");
  let selectedName = $state<string | null>(null);

  let skills = $state<Skill[]>([]);
  let where = $state<DeploymentReport | null>(null);
  let scan = $state<ScanReport | null>(null);
  let status = $state<StatusReport | null>(null);

  let loading = $state(true);

  // ---- error surfacing (CONTRACT-C: App owns ALL dispatch + error surfacing) -
  // `error` drives a dismissable banner in the main pane. `loadFailed` records a
  // failed initial/explicit load so we can offer a retry instead of a blank UI.
  let error = $state<string | null>(null);
  let loadFailed = $state(false);

  function showError(msg: string) {
    error = msg;
  }
  function clearError() {
    error = null;
  }

  // ---- derived health counts -----------------------------------------------
  const ownedCount = $derived(skills.filter((s) => s.mode === "owned").length);
  const linkedCount = $derived(
    skills.filter((s) => s.mode === "linked").length,
  );
  const problemCount = $derived(where?.problems?.length ?? 0);
  const driftCount = $derived(
    where?.sites?.filter((s) => s.drift).length ?? 0,
  );
  const newCount = $derived(scan?.totals?.new ?? 0);

  const selectedSkill = $derived(
    selectedName
      ? (skills.find((s) => s.name === selectedName) ?? null)
      : null,
  );

  // Inspector needs the selected skill's deployment sites: derive them from the
  // loaded DeploymentReport by filtering report.sites where site.name === name.
  const selectedSites = $derived(
    selectedName
      ? (where?.sites?.filter((s) => s.name === selectedName) ?? [])
      : [],
  );

  // ---- loaders --------------------------------------------------------------
  // loadAll uses Promise.allSettled so a single failing feed degrades gracefully
  // instead of blanking the whole UI: each settled-fulfilled value is applied,
  // and any rejection is collected into the error banner with a retry affordance.
  async function loadAll() {
    loading = true;
    loadFailed = false;
    clearError();
    try {
      const [lib, w, sc, st] = await Promise.allSettled([
        loadLibrary(),
        loadWhere(),
        loadScan(),
        loadStatus(),
      ]);

      const failures: string[] = [];
      if (lib.status === "fulfilled") skills = lib.value;
      else failures.push("library: " + reason(lib.reason));
      if (w.status === "fulfilled") where = w.value;
      else failures.push("where: " + reason(w.reason));
      if (sc.status === "fulfilled") scan = sc.value;
      else failures.push("scan: " + reason(sc.reason));
      if (st.status === "fulfilled") status = st.value;
      else failures.push("status: " + reason(st.reason));

      if (failures.length > 0) {
        loadFailed = true;
        showError("failed to load — " + failures.join("; "));
      }
    } finally {
      loading = false;
    }
  }

  function reason(r: unknown): string {
    return r instanceof Error ? r.message : String(r);
  }

  // Per-feed reloaders. Each swallows its own failure into the error banner so a
  // post-mutation reload can never crash the UI or wipe existing data.
  async function reloadLibrary() {
    try {
      skills = await loadLibrary();
    } catch (e) {
      showError("reload library failed: " + reason(e));
    }
  }
  async function reloadWhere() {
    try {
      where = await loadWhere();
    } catch (e) {
      showError("reload where failed: " + reason(e));
    }
  }
  async function reloadScan() {
    try {
      scan = await loadScan();
    } catch (e) {
      showError("reload scan failed: " + reason(e));
    }
  }
  async function reloadStatus() {
    try {
      status = await loadStatus();
    } catch (e) {
      showError("reload status failed: " + reason(e));
    }
  }

  onMount(loadAll);

  // ---- dispatch core --------------------------------------------------------
  // CONTRACT-C: App owns ALL dispatch + error surfacing; components only emit
  // intent. Every mutation runs through `dispatch`, which surfaces res.stderr on
  // failure (and does NOT optimistically reload as success) and runs `onOk` to
  // reload only the feeds the verb could have changed.
  async function dispatch(args: string[], onOk: () => Promise<void>) {
    clearError();
    const res = await runAction(args);
    if (!res.ok) {
      showError(res.stderr || cmdEcho(args) + " failed");
      return;
    }
    await onOk();
  }

  function onSelect(name: string) {
    selectedName = name;
  }

  // Inspector emits raw `skl` arg vectors via onAction. App routes the verb to
  // the correct reload set. Forbidden verbs (CONTRACT-E/F: infer/edit/open) are
  // refused here as a defence-in-depth guard even if a component still emits them.
  async function onAction(args: string[]) {
    const verb = args[0];
    if (verb === "edit" || verb === "open" || verb === "infer") {
      showError(`skl ${verb} is not dispatchable from the inspector`);
      return;
    }
    // retire / rename / import / tag / untag -> reload library + where.
    await dispatch(args, async () => {
      await Promise.all([reloadLibrary(), reloadWhere()]);
    });
  }

  // Library bulk bar (CONTRACT-C): action is 'retire' | 'tag'.
  //  - 'retire' loops one ['retire', name] per name (destructive -> confirm).
  //  - 'tag' requires a domain and loops ['tag', name, domain] per name.
  async function onBulkAction(
    action: string,
    names: string[],
    domain?: string,
  ) {
    if (names.length === 0) return;
    clearError();

    if (action !== "retire" && action !== "tag") {
      showError(`bulk action '${action}' is not supported`);
      return;
    }

    if (action === "retire") {
      const ok =
        typeof confirm === "function"
          ? confirm(
              `Retire ${names.length} skill${names.length === 1 ? "" : "s"}? ` +
                names.join(", "),
            )
          : true;
      if (!ok) return;

      const failures: string[] = [];
      for (const name of names) {
        const res = await runAction(["retire", name]);
        if (!res.ok) failures.push(name + ": " + (res.stderr || "failed"));
      }
      if (failures.length > 0)
        showError("retire failed for — " + failures.join("; "));
      await Promise.all([reloadLibrary(), reloadWhere()]);
      return;
    }

    // action === "tag"
    if (!domain) {
      showError("bulk tag requires a domain");
      return;
    }
    const failures: string[] = [];
    for (const name of names) {
      const res = await runAction(["tag", name, domain]);
      if (!res.ok) failures.push(name + ": " + (res.stderr || "failed"));
    }
    if (failures.length > 0)
      showError("tag failed for — " + failures.join("; "));
    await Promise.all([reloadLibrary(), reloadWhere()]);
  }

  // Locations emits a fix mode. CONTRACT-C/F: route through `skl where` flags,
  // never a bare `skl prune`/`skl fix` (the CLI has no such verbs).
  async function onFix(mode: "prune" | "fix") {
    const args = mode === "prune" ? ["where", "--prune"] : ["where", "--fix"];
    await dispatch(args, async () => {
      await Promise.all([reloadWhere(), reloadScan(), reloadLibrary()]);
    });
  }

  // Projects emits a single skill name to drop from the current project.
  async function onDrop(name: string) {
    await dispatch(["drop", name], async () => {
      await Promise.all([reloadStatus(), reloadWhere()]);
    });
  }
</script>

<div class="flex h-screen flex-col bg-[#FAFAFA] text-[#18181B]">
  <!-- top bar -->
  <header
    class="flex items-center gap-4 border-b border-[#E7E7E9] bg-white px-4 py-2.5"
  >
    <div class="flex items-baseline gap-2">
      <span class="text-sm font-semibold tracking-tight">skillshelf</span>
      <span class="text-xs text-[#9A9AA2]">·</span>
      <span class="text-xs text-[#71717A]">workbench</span>
    </div>

    <div class="flex-1"></div>

    <!-- health strip: real counts -->
    <div class="flex items-center gap-3 text-xs">
      <span class="text-[#71717A]">{skills.length} skills</span>
      <span class="text-[#71717A]">{ownedCount} owned</span>
      <span class="text-[#2563EB]">{linkedCount} linked</span>
      {#if driftCount > 0}
        <span class="text-[#D97706]">{driftCount} drift</span>
      {/if}
      {#if problemCount > 0}
        <span class="text-[#DC2626]">{problemCount} problems</span>
      {:else}
        <span class="text-[#15A34A]">clean</span>
      {/if}
      {#if newCount > 0}
        <span class="text-[#2563EB]">{newCount} new</span>
      {/if}
      <span class="text-[#9A9AA2]">{IS_TAURI ? "live" : "dev"}</span>
    </div>
  </header>

  <!-- tab row -->
  <nav class="flex gap-1 border-b border-[#E7E7E9] bg-white px-4">
    {#each [["library", "Library"], ["locations", "Locations"], ["projects", "Projects"]] as [v, label] (v)}
      <button
        class="border-b-2 px-3 py-2 text-xs font-medium transition-colors"
        class:border-[#18181B]={view === v}
        class:text-[#18181B]={view === v}
        class:border-transparent={view !== v}
        class:text-[#71717A]={view !== v}
        onclick={() => (view = v as View)}
      >
        {label}
      </button>
    {/each}
  </nav>

  <!-- 3-pane layout: main + right inspector -->
  <div class="flex min-h-0 flex-1">
    <main class="min-w-0 flex-1 overflow-auto">
      <!-- error banner: visible whenever a load or mutation surfaced an error -->
      {#if error}
        <div
          class="flex items-start gap-3 border-b border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-xs text-[#B91C1C]"
          role="alert"
        >
          <span class="mt-0.5 shrink-0 font-semibold">error</span>
          <span class="min-w-0 flex-1 break-words whitespace-pre-wrap"
            >{error}</span
          >
          {#if loadFailed}
            <button
              class="shrink-0 rounded border border-[#FCA5A5] bg-white px-2 py-0.5 font-medium text-[#B91C1C] hover:bg-[#FEE2E2]"
              onclick={() => loadAll()}>retry</button
            >
          {/if}
          <button
            class="shrink-0 px-1 font-medium text-[#B91C1C] hover:text-[#7F1D1D]"
            aria-label="dismiss error"
            onclick={clearError}>×</button
          >
        </div>
      {/if}

      {#if loading}
        <div class="p-6 text-xs text-[#9A9AA2]">loading…</div>
      {:else if loadFailed && skills.length === 0 && !where && !scan && !status}
        <div class="flex flex-col items-start gap-3 p-6">
          <div class="text-xs text-[#DC2626]">could not load any data.</div>
          <button
            class="rounded border border-[#E7E7E9] bg-white px-3 py-1 text-xs font-medium hover:bg-[#F4F4F5]"
            onclick={() => loadAll()}>retry</button
          >
        </div>
      {:else if view === "library"}
        <Library {skills} {selectedName} {onSelect} {onBulkAction} />
      {:else if view === "locations"}
        {#if where && scan}
          <Locations report={where} {scan} {selectedName} {onSelect} {onFix} />
        {:else}
          <div class="p-6 text-xs text-[#9A9AA2]">no deployment data.</div>
        {/if}
      {:else if view === "projects"}
        {#if status}
          <Projects {status} {onDrop} />
        {:else}
          <div class="p-6 text-xs text-[#9A9AA2]">no project status.</div>
        {/if}
      {/if}
    </main>

    <aside
      class="w-80 shrink-0 overflow-auto border-l border-[#E7E7E9] bg-white"
    >
      <Inspector skill={selectedSkill} sites={selectedSites} {onAction} />
    </aside>
  </div>
</div>
