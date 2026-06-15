#!/usr/bin/env python3
"""Authoritative grader + report generator for the skl skill eval.

Reads the workflow runs (what each agent did), then INDEPENDENTLY re-grades each
sandbox's end-state with check.sh (never trusting the agent's self-report), and emits:
  - benchmark.json  : pass rates per variant/eval + per-assertion detail
  - report.html     : a standalone teaching page (harness + results + good practices)

Usage: grade_and_report.py <runs.json> <out_dir>
"""
import json, subprocess, sys, html, os
from pathlib import Path

REPO = Path("/Users/wang.13246/Documents/GitHub/skillshelf")
CHECK = REPO / "evals" / "check.sh"

def grade(sandbox, eval_id):
    """Run check.sh on a sandbox end-state -> list of {text,passed,evidence}."""
    try:
        out = subprocess.run(["bash", str(CHECK), sandbox, eval_id],
                             capture_output=True, text=True, timeout=60)
        return json.loads(out.stdout.strip() or "[]")
    except Exception as e:
        return [{"text": f"grader error: {e}", "passed": False, "evidence": out.stdout if 'out' in dir() else ''}]

def main():
    runs = json.loads(Path(sys.argv[1]).read_text())["runs"]
    out_dir = Path(sys.argv[2]); out_dir.mkdir(parents=True, exist_ok=True)

    graded = []
    for r in runs:
        # Derive eval_id + variant from the sandbox basename (authoritative);
        # the agent-returned eval_id/variant fields are unreliable.
        base = os.path.basename(r["sandbox"])          # e.g. "A-with_skill"
        eval_id, _, variant = base.partition("-")      # "A", "with_skill"
        r = {**r, "eval_id": eval_id, "variant": variant}
        asrt = grade(r["sandbox"], r["eval_id"])
        passed = sum(1 for a in asrt if a.get("passed"))
        graded.append({**r, "assertions": asrt, "pass": passed, "total": len(asrt)})

    # aggregate per variant
    agg = {}
    for variant in ("with_skill", "baseline"):
        rs = [g for g in graded if g["variant"] == variant]
        p = sum(g["pass"] for g in rs); t = sum(g["total"] for g in rs)
        agg[variant] = {"pass": p, "total": t, "rate": round(p / t, 3) if t else 0}

    benchmark = {"skill_name": "skl", "aggregate": agg, "runs": graded}
    (out_dir / "benchmark.json").write_text(json.dumps(benchmark, indent=2))

    render_html(graded, agg, out_dir / "report.html")
    print(json.dumps({"aggregate": agg,
                      "by_eval": [{"eval": g["eval_id"], "variant": g["variant"],
                                   "pass": g["pass"], "total": g["total"]} for g in graded]}, indent=2))

def render_html(graded, agg, path):
    def esc(s): return html.escape(str(s))
    evals_meta = {e["id"]: e for e in json.loads((REPO/"skills/skl/evals/evals.json").read_text())["evals"]}

    # group by eval
    by_eval = {}
    for g in graded:
        by_eval.setdefault(g["eval_id"], {})[g["variant"]] = g

    cards = ""
    for eid in sorted(by_eval):
        meta = evals_meta.get(eid, {})
        ws = by_eval[eid].get("with_skill"); bl = by_eval[eid].get("baseline")
        def variant_col(g, label):
            if not g: return f'<div class="col"><h4>{label}</h4><p class="muted">no run</p></div>'
            rows = ""
            for a in g["assertions"]:
                ok = a.get("passed")
                rows += f'<li class="{"ok" if ok else "no"}"><span>{"✓" if ok else "✗"}</span> {esc(a["text"])}<div class="ev">{esc(a.get("evidence",""))}</div></li>'
            cmds = "".join(f"<code>skl {esc(c)}</code>" if not str(c).startswith("skl") else f"<code>{esc(c)}</code>" for c in g.get("commands", []))
            badge = "pass" if g["pass"] == g["total"] else ("partial" if g["pass"] else "fail")
            return f'''<div class="col">
              <h4>{label} <span class="pill {badge}">{g["pass"]}/{g["total"]}</span></h4>
              <div class="cmds">{cmds or '<span class="muted">no commands</span>'}</div>
              <ul class="asserts">{rows}</ul>
              <p class="summary">{esc(g.get("summary",""))}</p>
            </div>'''
        cards += f'''<section class="evalcard">
          <h3>Eval {eid}: {esc(meta.get("name",""))}</h3>
          <p class="prompt">{esc(meta.get("prompt","").replace("<SBX>","&lt;sandbox&gt;"))}</p>
          <p class="rule"><b>What it tests:</b> {esc(meta.get("tests_rule",""))}</p>
          <div class="cols">{variant_col(ws,"With skill")}{variant_col(bl,"Baseline (no skill)")}</div>
        </section>'''

    ws_rate = int(agg["with_skill"]["rate"]*100); bl_rate = int(agg["baseline"]["rate"]*100)
    template = TEMPLATE.replace("__WS__", str(ws_rate)).replace("__BL__", str(bl_rate)) \
        .replace("__WSPT__", f'{agg["with_skill"]["pass"]}/{agg["with_skill"]["total"]}') \
        .replace("__BLPT__", f'{agg["baseline"]["pass"]}/{agg["baseline"]["total"]}') \
        .replace("__CARDS__", cards)
    path.write_text(template)

TEMPLATE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>skl skill — how it was built & tested</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--bd:#30363d;--fg:#e6edf3;--mut:#8b949e;--ok:#3fb950;--no:#f85149;--accent:#58a6ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:32px 20px 80px}
h1{font-size:30px;margin:0 0 4px}h2{font-size:22px;margin:40px 0 12px;border-bottom:1px solid var(--bd);padding-bottom:6px}
h3{font-size:18px;margin:0 0 6px}h4{font-size:14px;margin:0 0 8px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
.lede{color:var(--mut);font-size:17px}
.scorebar{display:flex;gap:16px;margin:24px 0}
.score{flex:1;background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:18px}
.score .n{font-size:38px;font-weight:700}.score.win .n{color:var(--ok)}.score.base .n{color:var(--mut)}
.score .l{color:var(--mut);font-size:13px}
.bars{height:10px;background:#21262d;border-radius:6px;overflow:hidden;margin-top:10px}.bars i{display:block;height:100%}
.win .bars i{background:var(--ok)}.base .bars i{background:#6e7681}
.diagram{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:18px;white-space:pre;overflow:auto;font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#c9d1d9}
.evalcard{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:20px;margin:16px 0}
.prompt{background:#0d1117;border-left:3px solid var(--accent);padding:8px 12px;border-radius:4px;color:#c9d1d9;font-size:14px}
.rule{color:var(--mut);font-size:13.5px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px}
@media(max-width:720px){.cols{grid-template-columns:1fr}.scorebar{flex-direction:column}}
.col{background:#0d1117;border:1px solid var(--bd);border-radius:10px;padding:14px}
.pill{font-size:12px;padding:2px 8px;border-radius:20px;vertical-align:middle}
.pill.pass{background:rgba(63,185,80,.15);color:var(--ok)}.pill.partial{background:rgba(210,153,34,.15);color:#d29922}.pill.fail{background:rgba(248,81,73,.15);color:var(--no)}
.cmds{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.cmds code{background:#161b22;border:1px solid var(--bd);border-radius:6px;padding:2px 8px;font:12px ui-monospace,Menlo,monospace;color:#79c0ff}
.asserts{list-style:none;padding:0;margin:0}
.asserts li{padding:6px 0;border-bottom:1px solid #21262d;font-size:13.5px}
.asserts li span{font-weight:700;margin-right:6px}.asserts li.ok span{color:var(--ok)}.asserts li.no span{color:var(--no)}
.ev{color:var(--mut);font-size:12px;margin-left:18px;font-family:ui-monospace,Menlo,monospace;word-break:break-all}
.summary{color:var(--mut);font-size:13px;font-style:italic;margin:10px 0 0}
.muted{color:var(--mut)}
.finding{background:rgba(210,153,34,.08);border:1px solid #9e6a03;border-left:4px solid #d29922;border-radius:10px;padding:16px 18px;margin:8px 0 24px;font-size:14px;color:#e6edf3}
.finding b{color:#e3b341}
.gp{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:4px 20px;margin:16px 0}
.gp li{margin:14px 0}.gp b{color:var(--accent)}
code.inline{background:#161b22;border:1px solid var(--bd);border-radius:4px;padding:1px 6px;font:12.5px ui-monospace,Menlo,monospace;color:#79c0ff}
</style></head><body><div class="wrap">

<h1>The <code class="inline">skl</code> skill — built & tested</h1>
<p class="lede">A skill that teaches Claude to drive the <b>skillshelf</b> CLI for skill management — and a behavioral test harness that proves it helps, by running the real CLI in isolated sandboxes.</p>

<div class="scorebar">
  <div class="score win"><div class="n">__WS__%</div><div class="l">With the skill &nbsp;·&nbsp; __WSPT__ assertions passed</div><div class="bars"><i style="width:__WS__%"></i></div></div>
  <div class="score base"><div class="n">__BL__%</div><div class="l">Baseline, no skill &nbsp;·&nbsp; __BLPT__ assertions passed</div><div class="bars"><i style="width:__BL__%"></i></div></div>
</div>

<div class="finding">
<b>The honest headline: the skill did not beat the baseline on these tasks — and that is the most useful thing the harness told us.</b>
A strong model (Opus) plus skillshelf's own good <code class="inline">--help</code> already reaches the right end-state on all three tasks without any skill. That is a <b>null result</b>, and a real eval has to be willing to report one. It means: (1) these tasks aren't hard enough to <i>discriminate</i> the skill's value, and (2) the skill's actual payoff lives where end-state grading can't see it — <b>reliable triggering</b> (getting the model to reach for <code class="inline">skl</code> and the right verb at all, with zero exploration) and <b>token cost</b> (the baseline agents had to spend turns reading <code class="inline">skl --help</code>; the skilled ones didn't). The next iteration should add tasks where the naive path actually fails — e.g. the LINKED-entry update trap — and measure triggering separately with the description optimizer.
</div>

<h2>How the harness works</h2>
<p>Each test spawns two subagents on the same task — one that <b>reads the skill first</b>, one with <b>no skill</b> (it only has <code class="inline">skl --help</code>). Both run the <i>real</i> <code class="inline">skl</code> binary, but inside a throwaway sandbox so the user's real library is never touched. Grading is done <b>independently</b> afterward by inspecting the sandbox's end-state on disk — the agent's self-report is never trusted.</p>
<div class="diagram">  setup_fixture.sh  ──build──▶  /tmp/skl-eval/&lt;eval&gt;-&lt;variant&gt;/
                                  ├─ home/        ← HOME redirected here (real ~/.skillshelf untouched)
                                  ├─ library/     ← SKILLSHELF_LIBRARY
                                  ├─ project/ rootA/ dev/ ...   ← task fixtures
                                  │
   subagent ─drives─▶ skl import / use / scan / link ...
                                  │
   check.sh  ──inspect end-state──▶  [{text, passed, evidence}]   ← authoritative grade
</div>
<p class="muted">Why isolate by redirecting <code class="inline">HOME</code>: <code class="inline">skl init</code> writes <code class="inline">~/.skillshelf/config.json</code> and symlinks the global core into <code class="inline">~/.claude/skills</code>. Pointing <code class="inline">HOME</code> at the sandbox makes all of that land inside the throwaway dir — full isolation, zero risk to the real setup.</p>

<h2>Results per task</h2>
__CARDS__

<h2>Good practices (what this demonstrates)</h2>
<ul class="gp">
<li><b>Test behavior, not prose.</b> For a CLI-driver skill the right question isn't "does the text read well" — it's "does the agent run the right commands and reach the right end-state." So the harness grades the <i>filesystem after the fact</i>, not the agent's words.</li>
<li><b>Always run a baseline.</b> A skill that scores 100% means nothing if the model already scored 100% without it. The with-skill vs no-skill gap is the only number that shows the skill earns its place in the context window.</li>
<li><b>Isolate side-effecting tests.</b> The CLI mutates real dirs. Redirecting <code class="inline">HOME</code> + <code class="inline">SKILLSHELF_LIBRARY</code> into a sandbox lets the test exercise the genuine binary with zero blast radius. Each run gets a fresh sandbox so they can't contaminate each other.</li>
<li><b>Grade independently of the worker.</b> The subagent that does the task never grades itself. A separate deterministic script re-derives pass/fail from disk, so a confidently-wrong agent can't mark its own homework green.</li>
<li><b>Pick tasks that target the skill's risky claims.</b> Each eval aims at one safety rule the skill teaches — the two-step <code class="inline">add</code>≠<code class="inline">use</code>, scan-before-import, and LINKED-not-copied. That's where a naive agent fails and the skill should win.</li>
<li><b>Parallel fan-out, deterministic grading.</b> The 6 runs fan out concurrently via a workflow (fast, independent), then collapse to one deterministic grading pass (reproducible). Orchestration handles the slow part; a plain script owns the verdict.</li>
<li><b>Be willing to ship a null result.</b> This run found <i>no</i> end-state gap between skill and baseline. The temptation is to quietly tune the eval until the skill "wins" — that's how you fool yourself. The honest read is more useful: easy tasks + a strong model don't discriminate, so the skill's value must be proven elsewhere (triggering, token cost) or with harder tasks. An eval you can't fail is decoration.</li>
</ul>

</div></body></html>"""

if __name__ == "__main__":
    main()
