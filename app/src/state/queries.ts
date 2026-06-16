// TanStack Query hooks = server state for the deterministic `skl --json` feeds
// (ADR-0008 §0). queryFn bodies are the skl.ts loaders (real CLI in Tauri, real
// fixtures in the browser). invalidateQueries on a successful mutation (or a
// future FSEvents tick) is what makes the UI live.

import {
  useQuery,
  keepPreviousData,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  loadLibrary,
  loadWhere,
  loadScan,
  loadStatus,
  loadAgents,
  loadConfig,
  loadShow,
  loadOutdated,
} from "../lib/skl";
import type {
  Skill,
  DeploymentReport,
  ScanReport,
  StatusReport,
  AgentsReport,
  AppConfig,
  ShowReport,
  OutdatedReport,
} from "../lib/types";

export const qk = {
  library: ["library"] as const,
  where: ["where"] as const,
  scan: ["scan"] as const,
  status: ["status"] as const,
  agents: ["agents"] as const,
  config: ["config"] as const,
  outdated: ["outdated"] as const,
  show: (name: string, file?: string) => ["show", name, file ?? null] as const,
};

export function useLibrary(): UseQueryResult<Skill[]> {
  return useQuery({ queryKey: qk.library, queryFn: loadLibrary });
}
export function useWhere(): UseQueryResult<DeploymentReport> {
  return useQuery({ queryKey: qk.where, queryFn: loadWhere });
}
export function useScan(): UseQueryResult<ScanReport> {
  return useQuery({ queryKey: qk.scan, queryFn: loadScan });
}
export function useStatus(): UseQueryResult<StatusReport> {
  return useQuery({ queryKey: qk.status, queryFn: loadStatus });
}
export function useAgents(): UseQueryResult<AgentsReport> {
  return useQuery({ queryKey: qk.agents, queryFn: loadAgents });
}
// Persisted nav-config (§5a custom agents + project scopes). Drives the scope
// switcher's extra projects and the agent-settings popover. Browser-fixture
// fallback lives in loadConfig (skl.ts) so dev mode renders without Tauri.
export function useConfig(): UseQueryResult<AppConfig> {
  return useQuery({ queryKey: qk.config, queryFn: loadConfig });
}
// MANUAL query (ADR-0009): never auto-runs (enabled:false) — triggered by the
// toolbar "Check updates" button via refetch() to avoid hammering GitHub across
// ~20 sources on mount. Cached for the session so badges persist once checked.
export function useOutdated(): UseQueryResult<OutdatedReport> {
  return useQuery({
    queryKey: qk.outdated,
    queryFn: loadOutdated,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
export function useShow(
  name: string | null,
  file: string,
): UseQueryResult<ShowReport> {
  return useQuery({
    queryKey: qk.show(name ?? "", file),
    queryFn: () => loadShow(name as string, file),
    enabled: !!name,
    // Keep the previously-shown file visible while the next one loads, so
    // switching files doesn't blank the tree + content into a "Loading…" flash.
    placeholderData: keepPreviousData,
  });
}
