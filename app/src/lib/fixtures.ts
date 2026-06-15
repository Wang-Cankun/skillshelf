// SYNTHETIC FIXTURES — a small, made-up demo dataset for the dev/browser
// fallback path (no Tauri/Rust backend). These mirror the shapes the real
// `skl --json` commands emit so the UI renders meaningful sample data in a
// plain browser. None of this is real user data — names, paths, and skills
// here are invented purely to exercise the UI:
//   realLibrary  -> `skl ls --json`
//   realWhere    -> `skl where --json`
//   realScan     -> `skl scan --json`
//   realStatus   -> `skl status --json`
import type { Skill, DeploymentReport, ScanReport, StatusReport } from "./types";

const LIB = "/Users/dev/.skillshelf/library";
const CLAUDE = "/Users/dev/.claude/skills";
const CODEX = "/Users/dev/.codex/skills";
const PI = "/Users/dev/.pi/skills";
const WEBAPP = "/Users/dev/Projects/webapp/.claude/skills";
const PIPELINE = "/Users/dev/Projects/data-pipeline/.claude/skills";
const DEVKIT = "/Users/dev/Projects/devkit/skills";

export const realLibrary: Skill[] = [
  {
    "name": "api-mock",
    "description": "Spin up a local mock server from an OpenAPI spec so the frontend can develop against stable, fake responses. Use when you need to stub an HTTP API, record/replay requests, or test error states. Triggers on \"mock api\", \"stub endpoint\", \"fake server\".",
    "primaryDomain": "web",
    "domains": ["web"],
    "path": `${LIB}/api-mock`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "local",
    "modifiedAt": "2026-05-30T09:12:00.000Z",
    "createdAt": "2026-02-10T11:00:00.000Z",
    "deployCount": 2
  },
  {
    "name": "changelog-gen",
    "description": "Replace with a description of the skill.",
    "primaryDomain": "meta",
    "domains": ["meta"],
    "path": `${LIB}/changelog-gen`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "local",
    "modifiedAt": "2026-06-01T14:20:00.000Z",
    "createdAt": "2026-06-01T14:20:00.000Z",
    "deployCount": 0
  },
  {
    "name": "csv-profiler",
    "description": "Profile a CSV or Parquet file: column types, null counts, cardinality, and a quick distribution summary. Use when inspecting an unfamiliar dataset before analysis. Triggers on \"profile csv\", \"summarize dataset\", \"data quality check\".",
    "primaryDomain": "data",
    "domains": ["data"],
    "path": `${LIB}/csv-profiler`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "local",
    "modifiedAt": "2026-05-18T08:05:00.000Z",
    "createdAt": "2026-03-02T10:30:00.000Z",
    "deployCount": 1
  },
  {
    "name": "db-doctor",
    "description": "Diagnose slow queries and missing indexes against a local database. Reads EXPLAIN output and suggests fixes. Triggers on \"slow query\", \"explain plan\", \"missing index\".",
    "primaryDomain": "devops",
    "domains": ["devops"],
    "path": `${LIB}/db-doctor`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "local",
    "modifiedAt": "2026-05-22T16:40:00.000Z",
    "createdAt": "2026-03-15T12:00:00.000Z",
    "deployCount": 1
  },
  {
    "name": "db-migrate",
    "description": "Generate and apply forward/rollback SQL migrations from a schema diff. Use when evolving a database schema in a versioned, reviewable way. Triggers on \"new migration\", \"alter table\", \"rollback migration\".",
    "primaryDomain": "devops",
    "domains": ["devops"],
    "path": `${LIB}/db-migrate`,
    "retired": false,
    "mode": "linked",
    "linkTarget": `${DEVKIT}/db-migrate`,
    "source": "local",
    "modifiedAt": "2026-05-28T13:10:00.000Z",
    "createdAt": "2026-04-01T09:45:00.000Z",
    "deployCount": 0
  },
  {
    "name": "db-seed",
    "description": "Populate a database with realistic fake rows for local development and tests, respecting foreign keys. Triggers on \"seed database\", \"fake data\", \"fixtures\".",
    "primaryDomain": "data",
    "domains": ["data"],
    "path": `${LIB}/db-seed`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "local",
    "modifiedAt": "2026-05-12T07:55:00.000Z",
    "createdAt": "2026-04-03T10:00:00.000Z",
    "deployCount": 1
  },
  {
    "name": "db-snapshot",
    "description": "Capture and restore lightweight database snapshots so you can reset local state between experiments. Triggers on \"snapshot db\", \"restore db\", \"reset database\".",
    "primaryDomain": "devops",
    "domains": ["devops"],
    "path": `${LIB}/db-snapshot`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "local",
    "modifiedAt": "2026-05-09T11:25:00.000Z",
    "createdAt": "2026-04-05T11:00:00.000Z",
    "deployCount": 0
  },
  {
    "name": "e2e-runner",
    "description": "Run browser end-to-end tests with retries, screenshots on failure, and a compact HTML report. Use to verify a user flow works in a real browser. Triggers on \"e2e test\", \"run flow\", \"smoke test\".",
    "primaryDomain": "web",
    "domains": ["web"],
    "path": `${LIB}/e2e-runner`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "vendored",
    "modifiedAt": "2026-06-10T02:35:00.000Z",
    "createdAt": "2026-06-10T02:35:00.000Z",
    "deployCount": 1
  },
  {
    "name": "env-doctor",
    "description": "Check that local toolchain versions, env vars, and required services match what a project expects, and print a fix list. Triggers on \"check environment\", \"why won't it build\", \"setup doctor\".",
    "primaryDomain": null,
    "domains": [],
    "path": `${LIB}/env-doctor`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "local",
    "modifiedAt": "2026-06-05T18:00:00.000Z",
    "createdAt": "2026-05-20T09:00:00.000Z",
    "deployCount": 0
  },
  {
    "name": "image-optimizer",
    "description": "Compress and resize images (PNG/JPG/WebP/AVIF) for the web with sensible defaults and a before/after size report. Triggers on \"optimize images\", \"compress png\", \"resize assets\".",
    "primaryDomain": "media",
    "domains": ["media"],
    "path": `${LIB}/image-optimizer`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "vendored",
    "modifiedAt": "2026-06-08T05:14:00.000Z",
    "createdAt": "2026-06-08T05:14:00.000Z",
    "deployCount": 1
  },
  {
    "name": "json-schema-gen",
    "description": "Infer a JSON Schema from example JSON documents, then validate further documents against it. Use when locking down the shape of an API payload or config file. Triggers on \"generate schema\", \"validate json\", \"infer types\".",
    "primaryDomain": "data",
    "domains": ["data"],
    "path": `${LIB}/json-schema-gen`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "local",
    "modifiedAt": "2026-05-25T10:50:00.000Z",
    "createdAt": "2026-03-22T14:30:00.000Z",
    "deployCount": 1
  },
  {
    "name": "link-checker",
    "description": "Crawl a docs site or markdown tree and report broken internal and external links, with status codes. Triggers on \"check links\", \"broken links\", \"dead links\".",
    "primaryDomain": "docs",
    "domains": ["docs"],
    "path": `${LIB}/link-checker`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "vendored",
    "modifiedAt": "2026-06-09T07:42:00.000Z",
    "createdAt": "2026-06-09T07:42:00.000Z",
    "deployCount": 1
  },
  {
    "name": "markdown-toc",
    "description": "Insert and keep an up-to-date table of contents in long markdown files, with anchor links and configurable depth. Triggers on \"add toc\", \"table of contents\", \"update toc\".",
    "primaryDomain": "docs",
    "domains": ["docs"],
    "path": `${LIB}/markdown-toc`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "local",
    "modifiedAt": "2026-04-28T09:30:00.000Z",
    "createdAt": "2026-01-30T08:00:00.000Z",
    "deployCount": 1
  },
  {
    "name": "sample-chatroom",
    "description": "A demo multi-persona discussion skill: three role-played experts debate a question and converge on a recommendation. Use as an example of a conversational skill. Triggers on /sample-chatroom, \"panel discussion\", \"debate this\".",
    "primaryDomain": "meta",
    "domains": ["meta"],
    "path": `${LIB}/sample-chatroom`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "local",
    "modifiedAt": "2026-05-02T12:15:00.000Z",
    "createdAt": "2026-02-18T13:00:00.000Z",
    "deployCount": 1
  },
  {
    "name": "sample-guide",
    "description": "A demo authoring skill that produces a structured how-to guide with sections, callouts, and reference files. Use as an example of a multi-file skill with references. Triggers on /sample-guide, \"write a guide\", \"how-to\".",
    "primaryDomain": "docs",
    "domains": ["docs", "media"],
    "path": `${LIB}/sample-guide`,
    "retired": false,
    "mode": "owned",
    "linkTarget": null,
    "source": "local",
    "modifiedAt": "2026-05-06T15:45:00.000Z",
    "createdAt": "2026-02-25T10:10:00.000Z",
    "deployCount": 1
  }
];

export const realWhere: DeploymentReport = {
  "surfaces": [CLAUDE, CODEX, PI, WEBAPP, PIPELINE, DEVKIT],
  "sites": [
    { "name": "api-mock", "surface": CLAUDE, "path": `${CLAUDE}/api-mock`, "kind": "linked", "target": `${LIB}/api-mock`, "inLibrary": true, "drift": false },
    { "name": "api-mock", "surface": WEBAPP, "path": `${WEBAPP}/api-mock`, "kind": "linked", "target": `${LIB}/api-mock`, "inLibrary": true, "drift": false },
    { "name": "markdown-toc", "surface": CLAUDE, "path": `${CLAUDE}/markdown-toc`, "kind": "linked", "target": `${LIB}/markdown-toc`, "inLibrary": true, "drift": false },
    { "name": "json-schema-gen", "surface": CLAUDE, "path": `${CLAUDE}/json-schema-gen`, "kind": "linked", "target": `${LIB}/json-schema-gen`, "inLibrary": true, "drift": false },
    { "name": "link-checker", "surface": CLAUDE, "path": `${CLAUDE}/link-checker`, "kind": "linked", "target": `${LIB}/link-checker`, "inLibrary": true, "drift": false },
    { "name": "db-doctor", "surface": CLAUDE, "path": `${CLAUDE}/db-doctor`, "kind": "linked", "target": `${LIB}/db-doctor`, "inLibrary": true, "drift": false },
    { "name": "sample-guide", "surface": CLAUDE, "path": `${CLAUDE}/sample-guide`, "kind": "linked", "target": `${LIB}/sample-guide`, "inLibrary": true, "drift": false },
    { "name": "sample-chatroom", "surface": CLAUDE, "path": `${CLAUDE}/sample-chatroom`, "kind": "linked", "target": `${LIB}/sample-chatroom`, "inLibrary": true, "drift": false },
    { "name": "image-optimizer", "surface": CODEX, "path": `${CODEX}/image-optimizer`, "kind": "linked", "target": `${LIB}/image-optimizer`, "inLibrary": true, "drift": false },
    { "name": "e2e-runner", "surface": WEBAPP, "path": `${WEBAPP}/e2e-runner`, "kind": "linked", "target": `${LIB}/e2e-runner`, "inLibrary": true, "drift": false },
    { "name": "csv-profiler", "surface": PIPELINE, "path": `${PIPELINE}/csv-profiler`, "kind": "linked", "target": `${LIB}/csv-profiler`, "inLibrary": true, "drift": false },
    { "name": "db-seed", "surface": PIPELINE, "path": `${PIPELINE}/db-seed`, "kind": "linked", "target": `${LIB}/db-seed`, "inLibrary": true, "drift": false },
    { "name": "db-migrate", "surface": DEVKIT, "path": `${DEVKIT}/db-migrate`, "kind": "source", "target": null, "inLibrary": true, "drift": false }
  ],
  "problems": [
    { "name": "csv-profiler", "surface": WEBAPP, "path": `${WEBAPP}/csv-profiler`, "kind": "linked", "target": `${LIB}/csv-profiler`, "inLibrary": true, "drift": true },
    { "name": "db-snapshot", "surface": PIPELINE, "path": `${PIPELINE}/db-snapshot`, "kind": "dead", "target": `${LIB}/db-snapshot`, "inLibrary": true, "drift": false },
    { "name": "image-optimizer", "surface": WEBAPP, "path": `${WEBAPP}/image-optimizer`, "kind": "foreign-link", "target": "/Users/dev/Projects/vendor/skills/image-optimizer", "inLibrary": true, "drift": false },
    { "name": "legacy-helper", "surface": PIPELINE, "path": `${PIPELINE}/legacy-helper`, "kind": "copy", "target": null, "inLibrary": false, "drift": false },
    { "name": "md-toc", "surface": CLAUDE, "path": `${CLAUDE}/md-toc`, "kind": "aliased", "target": `${LIB}/markdown-toc`, "inLibrary": true, "drift": false }
  ]
};

export const realScan: ScanReport = {
  "roots": [CLAUDE, CODEX, WEBAPP, PIPELINE, DEVKIT],
  "totals": {
    "roots": 5,
    "candidates": 15,
    "new": 0,
    "duplicateGroups": 0,
    "driftGroups": 0,
    "exactDuplicateGroups": 0
  },
  "perRoot": [
    { "root": CLAUDE, "candidates": 7, "new": 0 },
    { "root": CODEX, "candidates": 1, "new": 0 },
    { "root": WEBAPP, "candidates": 3, "new": 0 },
    { "root": PIPELINE, "candidates": 3, "new": 0 },
    { "root": DEVKIT, "candidates": 1, "new": 0 }
  ],
  "duplicateGroups": []
};

export const realStatus: StatusReport = {
  "projectRoot": "/Users/dev/Projects/webapp",
  "skillsDir": WEBAPP,
  "skillsDirExists": true,
  "linkedCount": 2,
  "unmanaged": [],
  "bundles": [],
  "linked": [
    { "link": `${WEBAPP}/api-mock`, "target": `${LIB}/api-mock`, "skill": "api-mock", "inLibrary": true, "domains": ["web"] },
    { "link": `${WEBAPP}/e2e-runner`, "target": `${LIB}/e2e-runner`, "skill": "e2e-runner", "inLibrary": true, "domains": ["web"] }
  ]
};
