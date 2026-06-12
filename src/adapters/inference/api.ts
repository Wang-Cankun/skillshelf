// API inference adapter — closes the loop automatically against any
// OpenAI-compatible chat/completions endpoint. The LLM-FREE core lives in
// agent.ts; this file is the ONLY place a network LLM call happens.
//
// Configuration (base URL, API key, model) resolves from, highest precedence
// first:
//   1. CLI flags        (--base-url, --model; --provider for a base-URL preset)
//   2. Environment vars  (SKILLSHELF_LLM_* , then OPENAI_* fallbacks)
//   3. Optional dotenv   ($SKILLSHELF_ENV_FILE, default ./.env if present)
//
// Nothing here is provider-specific: any server that speaks the OpenAI
// chat/completions schema works (OpenAI, OpenRouter, Groq, Ollama, vLLM,
// a local gateway, …).

import { existsSync } from "node:fs";
import type { InferenceCorpus } from "../../types.ts";
import {
  INFER_INSTRUCTION,
  PROPOSAL_SCHEMA,
  normalizeProposal,
  type InferenceProposal,
} from "./agent.ts";

export interface ProviderConfig {
  /** OpenAI-compatible base, including /v1 */
  base: string;
  /** bearer key */
  apiKey: string;
  /** chat model id */
  model: string;
  /** provider label */
  name: string;
}

/** Sensible default endpoint + model when nothing else is configured. */
const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini"; // placeholder default; override with --model / *_MODEL

/**
 * Generic public provider presets. These set ONLY a default base URL — the API
 * key always comes from the environment (or dotenv). `custom` means "use
 * --base-url / SKILLSHELF_LLM_BASE_URL". No private/institutional presets.
 */
const PROVIDER_BASES: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  ollama: "http://localhost:11434/v1",
  custom: "", // resolved entirely from flags/env
};

export function knownProviders(): string[] {
  return Object.keys(PROVIDER_BASES);
}

/**
 * Parse `export KEY=value` / `KEY=value` lines from a dotenv file.
 * Strips surrounding quotes; ignores comments. Never throws.
 */
async function readEnvFile(file: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  let text = "";
  try {
    text = await Bun.file(file).text();
  } catch {
    return out;
  }
  for (const lineRaw of text.split("\n")) {
    const line = lineRaw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2]!.trim();
    if (
      val.length >= 2 &&
      ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'")))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]!] = val;
  }
  return out;
}

/** Resolve the dotenv path: explicit $SKILLSHELF_ENV_FILE, else ./.env if present. */
function resolveEnvFilePath(env: NodeJS.ProcessEnv, override?: string): string | null {
  const explicit = override?.trim() || env.SKILLSHELF_ENV_FILE?.trim();
  if (explicit) return explicit;
  return existsSync(".env") ? ".env" : null;
}

/** First non-empty trimmed value, or "". */
function firstNonEmpty(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    if (v && v.trim() !== "") return v.trim();
  }
  return "";
}

/**
 * Resolve an LLM config for an OpenAI-compatible endpoint.
 *
 * Precedence (highest first): explicit opts (from CLI flags) > env vars
 * (SKILLSHELF_LLM_* then OPENAI_*) > dotenv file. `opts.provider` only seeds a
 * default base URL; the key is always resolved from env/dotenv. Returns an
 * `error` string instead of throwing when no API key can be resolved.
 */
export async function resolveProvider(
  provider: string | undefined,
  opts: {
    base?: string;
    model?: string;
    env?: NodeJS.ProcessEnv;
    envFile?: string;
  } = {},
): Promise<{ config: ProviderConfig } | { error: string }> {
  const env = opts.env ?? process.env;

  let presetBase = "";
  let providerName = "custom";
  if (provider !== undefined && provider !== "") {
    if (!(provider in PROVIDER_BASES)) {
      return {
        error: `unknown provider "${provider}". known: ${knownProviders().join(", ")}`,
      };
    }
    providerName = provider;
    presetBase = PROVIDER_BASES[provider]!;
  }

  const filePath = resolveEnvFilePath(env, opts.envFile);
  const fileEnv = filePath ? await readEnvFile(filePath) : {};

  // base: flag > SKILLSHELF_LLM_BASE_URL > OPENAI_BASE_URL > provider preset > default
  const base = firstNonEmpty(
    opts.base,
    env.SKILLSHELF_LLM_BASE_URL,
    fileEnv.SKILLSHELF_LLM_BASE_URL,
    env.OPENAI_BASE_URL,
    fileEnv.OPENAI_BASE_URL,
    presetBase,
    DEFAULT_BASE,
  );

  // key: SKILLSHELF_LLM_API_KEY > OPENAI_API_KEY (env then dotenv)
  const apiKey = firstNonEmpty(
    env.SKILLSHELF_LLM_API_KEY,
    fileEnv.SKILLSHELF_LLM_API_KEY,
    env.OPENAI_API_KEY,
    fileEnv.OPENAI_API_KEY,
  );

  // model: flag > SKILLSHELF_LLM_MODEL > OPENAI_MODEL > default
  const model = firstNonEmpty(
    opts.model,
    env.SKILLSHELF_LLM_MODEL,
    fileEnv.SKILLSHELF_LLM_MODEL,
    env.OPENAI_MODEL,
    fileEnv.OPENAI_MODEL,
    DEFAULT_MODEL,
  );

  if (apiKey === "") {
    return {
      error:
        "missing API key. Set SKILLSHELF_LLM_API_KEY (or OPENAI_API_KEY) in the " +
        "environment or a dotenv file ($SKILLSHELF_ENV_FILE, default ./.env).",
    };
  }

  return { config: { base, apiKey, model, name: providerName } };
}

/** Extract the first balanced JSON object from a possibly-fenced string. */
function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  // strip ```json fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  const start = candidate.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * POST the corpus to the endpoint and parse a strict-JSON proposal back.
 * Requests JSON via response_format; falls back to brace-extraction if the
 * model wraps the JSON in prose/fences.
 */
export async function inferViaApi(
  corpus: InferenceCorpus,
  config: ProviderConfig,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ proposal: InferenceProposal } | { error: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const userPayload = JSON.stringify({ schema: PROPOSAL_SCHEMA, corpus });
  const body = {
    model: config.model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          INFER_INSTRUCTION +
          " Respond with ONLY the JSON object — no markdown, no commentary.",
      },
      { role: "user", content: userPayload },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
  let res: Response;
  try {
    res = await fetchImpl(`${config.base.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `LLM request failed: ${msg}` };
  }
  clearTimeout(timeout);

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    return { error: `LLM endpoint returned ${res.status} ${res.statusText}: ${detail}` };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `LLM response was not JSON: ${msg}` };
  }

  const content = extractContent(data);
  if (content === null) {
    return { error: "LLM response had no message content" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const obj = extractJsonObject(content);
    if (!obj) return { error: "could not parse JSON from LLM content" };
    try {
      parsed = JSON.parse(obj);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `could not parse extracted JSON: ${msg}` };
    }
  }

  return { proposal: normalizeProposal(parsed) };
}

/** Pull `choices[0].message.content` from an OpenAI-compatible response. */
function extractContent(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const choices = (data as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === "string") return content;
  // some endpoints return content as an array of parts
  if (Array.isArray(content)) {
    const text = content
      .map((p) => (p && typeof p === "object" ? String((p as Record<string, unknown>).text ?? "") : ""))
      .join("");
    return text || null;
  }
  return null;
}
