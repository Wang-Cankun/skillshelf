// `skl infer` — re-run the domain taxonomy pass over the library.
//
// Dual-mode, LLM-FREE core:
//   skl infer --emit                 print {instruction, schema, corpus} for a
//                                    host agent to reason over (no LLM call here).
//   skl infer --apply <file.json>    write the agent's proposal into each skill's
//                                    <name>.shelf.json overlay (never upstream).
//   skl infer --provider openai      API mode: POST the corpus to an
//                                    OpenAI-compatible endpoint and apply the
//                                    strict-JSON result automatically.
//
// API mode is provider-agnostic. Config resolves (highest precedence first)
// from CLI flags (--base-url, --model, --provider) > env vars
// (SKILLSHELF_LLM_BASE_URL / _API_KEY / _MODEL, then OPENAI_* fallbacks) >
// optional dotenv at $SKILLSHELF_ENV_FILE (default ./.env). --provider is sugar
// for a default base URL only (openai, openrouter, groq, ollama, custom); the
// API key always comes from the environment/dotenv.
//
// Auto-detect when no explicit mode/provider is given:
//   - inside a Claude Code agent ($CLAUDECODE) -> default to --emit guidance.
//   - no agent and no provider                 -> error clearly.

import type { Ctx } from "../types.ts";
import {
  buildEmitPayload,
  normalizeProposal,
  applyProposal,
  type ApplyResult,
} from "../adapters/inference/agent.ts";
import {
  resolveProvider,
  inferViaApi,
  knownProviders,
} from "../adapters/inference/api.ts";

export const meta = {
  name: "infer",
  summary: "Re-run AI domain taxonomy over the library (emit/apply/provider modes)",
  usage:
    "skl infer [--emit | --apply <file.json> | --provider <name>] [--base-url <url>] [--model <id>] [--include-retired] [--json]",
} as const;

interface Args {
  emit: boolean;
  applyFile: string | null;
  provider: string | null;
  baseUrl: string | null;
  model: string | null;
  includeRetired: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): { args: Args } | { error: string } {
  const args: Args = {
    emit: false,
    applyFile: null,
    provider: null,
    baseUrl: null,
    model: null,
    includeRetired: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "--emit":
        args.emit = true;
        break;
      case "--apply": {
        const f = argv[++i];
        if (!f) return { error: "--apply requires a <file.json> path" };
        args.applyFile = f;
        break;
      }
      case "--provider": {
        const p = argv[++i];
        if (!p) return { error: "--provider requires a name" };
        args.provider = p;
        break;
      }
      case "--base-url": {
        const b = argv[++i];
        if (!b) return { error: "--base-url requires a url" };
        args.baseUrl = b;
        break;
      }
      case "--model": {
        const m = argv[++i];
        if (!m) return { error: "--model requires an id" };
        args.model = m;
        break;
      }
      case "--include-retired":
        args.includeRetired = true;
        break;
      case "--json":
        args.json = true;
        break;
      default:
        if (a.startsWith("--apply=")) args.applyFile = a.slice("--apply=".length);
        else if (a.startsWith("--provider=")) args.provider = a.slice("--provider=".length);
        else if (a.startsWith("--base-url=")) args.baseUrl = a.slice("--base-url=".length);
        else if (a.startsWith("--model=")) args.model = a.slice("--model=".length);
        else return { error: `unknown argument: ${a}` };
    }
  }
  return { args };
}

function isAgentContext(): boolean {
  return (
    !!process.env.CLAUDECODE ||
    !!process.env.CLAUDE_CODE ||
    !!process.env.CLAUDE_AGENT ||
    !!process.env.ANTHROPIC_AGENT
  );
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    ctx.error(`skl infer: ${parsed.error}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const args = parsed.args;

  // API mode is requested by --provider or --base-url.
  const apiMode = !!args.provider || !!args.baseUrl;

  // Mutually-exclusive modes (apply / api are explicit and primary).
  const modeCount =
    (args.applyFile ? 1 : 0) + (apiMode ? 1 : 0) + (args.emit ? 1 : 0);
  if (modeCount > 1) {
    ctx.error("skl infer: choose only one of --emit, --apply, --provider/--base-url");
    return 1;
  }

  try {
    const skills = await ctx.loadLibrary();

    // --- APPLY MODE -------------------------------------------------------
    if (args.applyFile) {
      let text: string;
      try {
        text = await Bun.file(args.applyFile).text();
      } catch {
        ctx.error(`skl infer: cannot read proposal file: ${args.applyFile}`);
        return 1;
      }
      let rawJson: unknown;
      try {
        rawJson = JSON.parse(text);
      } catch (e) {
        ctx.error(
          `skl infer: proposal file is not valid JSON: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        return 1;
      }
      const proposal = normalizeProposal(rawJson);
      if (proposal.assignments.length === 0) {
        ctx.error("skl infer: proposal contained no assignments");
        return 1;
      }
      const result = await applyProposal(skills, proposal);
      return reportApply(result, args.json, ctx);
    }

    // --- API MODE (--provider / --base-url) ------------------------------
    if (apiMode) {
      const prov = await resolveProvider(args.provider ?? undefined, {
        base: args.baseUrl ?? undefined,
        model: args.model ?? undefined,
      });
      if ("error" in prov) {
        ctx.error(`skl infer: ${prov.error}`);
        return 1;
      }
      const { buildCorpus } = await import("../adapters/inference/agent.ts");
      const corpus = await buildCorpus(skills, { includeRetired: args.includeRetired });
      if (corpus.skills.length === 0) {
        ctx.error("skl infer: library is empty — nothing to infer");
        return 1;
      }
      const inferred = await inferViaApi(corpus, prov.config);
      if ("error" in inferred) {
        ctx.error(`skl infer: ${inferred.error}`);
        return 1;
      }
      if (inferred.proposal.assignments.length === 0) {
        ctx.error("skl infer: gateway returned no assignments");
        return 1;
      }
      const result = await applyProposal(skills, inferred.proposal);
      return reportApply(result, args.json, ctx, prov.config.name, prov.config.model);
    }

    // --- EMIT MODE (explicit or agent-auto-detect) -----------------------
    if (args.emit || isAgentContext()) {
      const payload = await buildEmitPayload(skills, {
        includeRetired: args.includeRetired,
      });
      if (payload.corpus.skills.length === 0) {
        ctx.error("skl infer: library is empty — nothing to infer");
        return 1;
      }
      // emit is inherently machine output; --json is the same single-line form.
      if (args.json) {
        ctx.json(payload);
      } else {
        // pretty multi-line for a human/agent reading stdout
        ctx.log(JSON.stringify(payload, null, 2));
      }
      if (!args.emit) {
        ctx.error(
          `skl infer: agent context detected — emitted ${payload.corpus.skills.length} skills. ` +
            "Reason over `corpus`, produce a proposal that matches `schema`, " +
            "then run: skl infer --apply <file.json>",
        );
      }
      return 0;
    }

    // --- NO MODE, NO AGENT -> error --------------------------------------
    ctx.error(
      "skl infer: no inference mode available. Provide one of:\n" +
        "  --emit                 print corpus for a host agent to reason over\n" +
        "  --apply <file.json>    apply an agent proposal into overlays\n" +
        `  --provider <name>      call an OpenAI-compatible endpoint (${knownProviders().join(", ")})\n` +
        "  --base-url <url>       call a custom OpenAI-compatible endpoint\n" +
        "(auto-emit only activates inside a Claude Code agent context.)",
    );
    return 1;
  } catch (e) {
    ctx.error(`skl infer: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

function reportApply(
  result: ApplyResult,
  asJson: boolean,
  ctx: Ctx,
  provider?: string,
  model?: string,
): number {
  if (asJson) {
    ctx.json({
      ok: true,
      provider: provider ?? null,
      model: model ?? null,
      applied: result.applied,
      unmatched: result.unmatched,
      skipped: result.skipped,
      counts: {
        applied: result.applied.length,
        unmatched: result.unmatched.length,
        skipped: result.skipped.length,
      },
    });
    return 0;
  }
  if (provider) ctx.log(`Inference via ${provider}${model ? ` (${model})` : ""}:`);
  for (const a of result.applied) {
    const addedNote = a.added.length ? `  (+${a.added.join(", ")})` : "  (no change)";
    ctx.log(`  ${a.name}: ${a.domains.join(", ")}${addedNote}`);
  }
  ctx.log(
    `Applied ${result.applied.length} overlay update${
      result.applied.length === 1 ? "" : "s"
    }.`,
  );
  if (result.unmatched.length) {
    ctx.log(`Unmatched (no such skill): ${result.unmatched.join(", ")}`);
  }
  if (result.skipped.length) {
    ctx.log(`Skipped (no domains proposed): ${result.skipped.join(", ")}`);
  }
  return 0;
}
