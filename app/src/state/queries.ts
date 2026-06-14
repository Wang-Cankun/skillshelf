// TanStack Query hooks = server state for the deterministic `skl --json` feeds
// (ADR-0008 §0). queryFn bodies are the skl.ts loaders (real CLI in Tauri, real
// fixtures in the browser). invalidateQueries on a successful mutation (or a
// future FSEvents tick) is what makes the UI live.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  loadLibrary,
  loadWhere,
  loadScan,
  loadStatus,
  loadAgents,
  loadShow,
} from "../lib/skl";
import type {
  Skill,
  DeploymentReport,
  ScanReport,
  StatusReport,
  AgentsReport,
  ShowReport,
} from "../lib/types";

export const qk = {
  library: ["library"] as const,
  where: ["where"] as const,
  scan: ["scan"] as const,
  status: ["status"] as const,
  agents: ["agents"] as const,
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
export function useShow(
  name: string | null,
  file: string,
): UseQueryResult<ShowReport> {
  return useQuery({
    queryKey: qk.show(name ?? "", file),
    queryFn: () => loadShow(name as string, file),
    enabled: !!name,
  });
}
