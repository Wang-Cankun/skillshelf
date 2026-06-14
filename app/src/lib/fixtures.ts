// AUTO-GENERATED FIXTURES — captured verbatim from the user's machine via the `skl` binary.
// Source commands (all exited 0 on 2026-06-14):
//   skl ls --json        -> realLibrary  (113 skills)
//   skl where --json     -> realWhere
//   skl scan --json      -> realScan
//   skl status --json    -> realStatus   (run from /Users/wang.13246/Documents/GitHub/skillshelf-ui)
// These let the UI render REAL data in browser dev mode without Tauri/Rust.
import type { Skill, DeploymentReport, ScanReport, StatusReport } from './types';

export const realLibrary: Skill[] = [
  {
    "name": "cairn",
    "description": "Record analysis conclusions as grounded claims while you work. Use this skill continuously during any data-analysis, pipeline, or research session — not as a final step. ORIENT at session start (run `cairn head` to read what is already concluded before acting). AUTHOR the instant you conclude anything — a result, a finding, a \"X is higher than Y\", a decision — with one cheap `cairn add-claim` call; capture it NOW, never batch claims to end-of-session (forgetting is the failure mode). REFRESH with `cairn refresh` after any rerun: `tar_make()`, a re-executed pipeline, regenerated outputs, a re-run script, new model fit, then surface newly-stale claims. PUBLISH (`cairn validate` then `cairn publish`) before sharing findings, sending a link, or handing results to a collaborator. Triggers: \"what do we know so far\", \"where are we\", recording a finding, after rerunning anything, before sharing results, claim graph, grounding evidence.",
    "primaryDomain": "bioinfo",
    "domains": [
      "bioinfo",
      "meta"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/cairn",
    "retired": false,
    "mode": "linked",
    "linkTarget": "/Users/wang.13246/Documents/GitHub/cairn/skill/cairn"
  },
  {
    "name": "geo-submission",
    "description": "Prepare and submit high-throughput sequencing data to NCBI GEO. Covers the full pipeline: locate raw FASTQ and processed data, fill the official metadata spreadsheet (seq_template.xlsx), generate MD5 checksums, upload via FTP, and submit. Use this skill whenever the user mentions GEO submission, GEO upload, submitting to GEO, NCBI submission, seq_template, or preparing sequencing data for public repository deposit. Also trigger when the user has FASTQ files and count matrices and wants to make them publicly available, or when a manuscript reviewer asks for a GEO accession number. Supports bulk RNA-seq, scRNA-seq, ChIP-seq, ATAC-seq, and other HTS data types accepted by GEO. 提交GEO, 上传GEO, GEO数据提交.",
    "primaryDomain": "bioinfo",
    "domains": [
      "bioinfo"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/geo-submission",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "h5ad-perf-diagnosis",
    "description": "Diagnose and fix slow H5AD gene expression / plot-data endpoints",
    "primaryDomain": "bioinfo",
    "domains": [
      "bioinfo"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/h5ad-perf-diagnosis",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "init-targets-project",
    "description": "Initialize a new R targets-based bioinformatics project with AI-friendly structure. Triggers on /init-targets-project, \"new targets project\", \"scaffold analysis project\".",
    "primaryDomain": "bioinfo",
    "domains": [
      "bioinfo"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/init-targets-project",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "agent-browser",
    "description": "Use when needing browser automation, E2E testing, screenshots, form filling, or web scraping. Alternative to Playwright MCP - uses Bash commands with ref-based element selection. Triggers on \"browse website\", \"fill form\", \"click button\", \"take screenshot\", \"scrape page\", \"web automation\".",
    "primaryDomain": "browser",
    "domains": [
      "browser"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/agent-browser",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "agent-reach",
    "description": "MUST USE when user wants to research/search/look up/find anything on the internet — e.g. \"research this topic\", \"do a deep dive on X\", \"search the web for X\", \"see what people say about X\", \"look this up\". Also MUST USE when user mentions any platform or shares any URL/link: Twitter/X, Reddit, YouTube, GitHub, Bilibili, XiaoHongShu, Xiaoyuzhou Podcast, LinkedIn/jobs/recruiting, V2EX, Xueqiu (stocks), RSS. 13 platforms, multi-backend routing (OpenCLI / per-platform CLIs / APIs). Zero config for 6 channels. Run `agent-reach doctor --json` to see which backend serves each platform right now. NOT for: writing reports/analysis/translation (this skill only FETCHES internet content); posting/commenting/liking (write operations); platforms that already have a dedicated skill installed (prefer that skill).",
    "primaryDomain": "browser",
    "domains": [
      "browser",
      "media"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/agent-reach",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "bb-browser",
    "description": "Use when needing authenticated web data from sites like Twitter, Xiaohongshu, Zhihu, Weibo, GitHub, YouTube, or any site the user is logged into. Also use when scraping requires login cookies, fetching structured data from social platforms, or when agent-browser fails due to auth requirements. Triggers on \"bb-browser\", \"fetch tweets\", \"get xiaohongshu posts\", \"scrape with login\", \"authenticated scraping\".",
    "primaryDomain": "browser",
    "domains": [
      "browser"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/bb-browser",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "playwriter-mcp",
    "description": "Use when needing browser automation, E2E testing, screenshots, form filling, or web scraping. Requires Chrome extension to be active on target tab (green indicator).",
    "primaryDomain": "browser",
    "domains": [
      "browser"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/playwriter-mcp",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs",
    "description": "dontbesilent 商业工具箱主入口。根据你的问题自动路由到最合适的诊断工具。\n触发方式：/dbs、/商业、「帮我看看」\nMain entry point for dontbesilent business toolkit. Routes to the right diagnostic skill.\nTrigger: /dbs, \"help me with my business\"",
    "primaryDomain": "business",
    "domains": [
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-action",
    "description": "dontbesilent 执行力诊断。用阿德勒心理学框架诊断你「知道该做什么但就是不做」的真正原因。\n触发方式：/dbs-action、/action、「我知道该怎么做但就是不做」「为什么我总是拖延」\nExecution block diagnosis using Adlerian psychology framework.\nTrigger: /dbs-action, \"I know what to do but can't do it\", \"why do I procrastinate\"",
    "primaryDomain": "business",
    "domains": [
      "business",
      "philosophy"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-action",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-benchmark",
    "description": "dontbesilent 对标分析。用五重过滤法帮你找到值得模仿的对标，排除一切关于「我」的噪音。\n触发方式：/dbs-benchmark、/对标、「帮我找对标」「我该模仿谁」\nBenchmark analysis using dontbesilent's five-filter method.\nTrigger: /dbs-benchmark, \"find me a benchmark\", \"who should I copy\"",
    "primaryDomain": "business",
    "domains": [
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-benchmark",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-chatroom",
    "description": "定向聊天室：根据话题推荐或接受用户指定的专家，模拟多角色对话。触发方式：/dbs-chatroom、/定向聊天室、「定向聊天室」",
    "primaryDomain": "business",
    "domains": [
      "business",
      "philosophy"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-chatroom",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-decision",
    "description": "dontbesilent 个人决策系统。把任何一个需要长期跟踪的领域（业务、关系、健康、职业、学习、投资……）做成一个本地知识工程：四层结构、来源标签、写完不改的快照、能炼出规律的概念库。\n触发方式：/dbs-decision、/决策系统、/决策立案、/结果回填、/状态画像\nPersonal decision system. Turns any long-running domain into a local knowledge project with four layers, source tags, immutable snapshots, and a concept library that learns patterns over time.\nTrigger: /dbs-decision, /决策系统, /决策立案, /结果回填, /状态画像",
    "primaryDomain": "business",
    "domains": [
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-decision",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-diagnosis",
    "description": "dontbesilent 商业模式诊断。两种模式：问诊（消解你的问题）和体检（拆解你的商业模式）。\n触发方式：/dbs-diagnosis、/问诊、「帮我看看商业模式」「诊断一下我的业务」「我有个商业问题」\nBusiness model diagnosis using dontbesilent's ontological framework. Two modes: consultation (dissolve your question) and checkup (analyze your business model).\nTrigger: /dbs-diagnosis, \"diagnose my business model\", \"I have a business question\"",
    "primaryDomain": "business",
    "domains": [
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-diagnosis",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-goal",
    "description": "dontbesilent 目标清晰化。用维特根斯坦的语言哲学把模糊的目标审计成可检查的交付物。\n触发方式：/dbs-goal、/目标、「帮我搞清楚目标」「我想做个人 IP」「我的目标是成为...」「我想变得更...」\nGoal clarification using Wittgenstein's philosophy of language. Audits fuzzy goals into checkable deliverables.\nTrigger: /dbs-goal, \"help me clarify my goal\", \"I want to become...\", \"my goal is...\"",
    "primaryDomain": "business",
    "domains": [
      "business",
      "philosophy"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-goal",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-good-question",
    "description": "dontbesilent 好问题生成器。把模糊问题改写成 Agent 可推理、可批评、可验证的问题说明书，并判断它能被自动化解决到什么程度。\n触发方式：/dbs-good-question、/好问题、/问题说明书、/Agent可解性、「这个问题能不能自动化解决」「帮我把问题说清楚」\nTurn fuzzy problems into agent-solvable problem briefs and evaluate automation readiness.\nTrigger: /dbs-good-question, \"clarify this problem\", \"can an agent solve this\"",
    "primaryDomain": "business",
    "domains": [
      "business",
      "meta"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-good-question",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-learning",
    "description": "dontbesilent 交互式学习。把一个课题拆成连续学习文章，根据用户在上一篇中的反馈调整下一篇的深度、角度和节奏。\n触发方式：/dbs-learning、/dbs-learn、/交互式学习、「带我学一个课题」「继续下一篇」「根据我的反馈写下一篇」\nInteractive learning workflow. Builds an adaptive sequence of learning articles based on user feedback.\nTrigger: /dbs-learning, /dbs-learn, \"teach me a topic\", \"continue the next lesson\"",
    "primaryDomain": "business",
    "domains": [
      "business",
      "philosophy"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-learning",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-report",
    "description": "把多次 dbs-save 攒下来的诊断状态合并成一份可交付的 markdown 报告。\n触发方式：/dbs-report、/出报告、「打包」「整理一份」「给合伙人看的」\nGenerate a deliverable diagnosis report by merging all dbs-save snapshots.\nTrigger: /dbs-report, \"package this up\", \"make me a report\"",
    "primaryDomain": "business",
    "domains": [
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-report",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-restore",
    "description": "把上次诊断的状态拉出来，接着用。配合 dbs-save 使用。\n触发方式：/dbs-restore、/续上、「接着上次」「之前的结论」「上次诊断到哪了」\nRestore the most recent diagnosis snapshot saved by dbs-save.\nTrigger: /dbs-restore, \"continue from last time\", \"where did we leave off\"",
    "primaryDomain": "business",
    "domains": [
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-restore",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-save",
    "description": "把当前诊断的关键状态存到本地，下次回来可以接着用。\n触发方式：/dbs-save、/存档、「保存这次诊断」「记下来」「这个结论留着」\nSave the current diagnosis state to disk for cross-session recall.\nTrigger: /dbs-save, \"save this diagnosis\", \"remember this\"",
    "primaryDomain": "business",
    "domains": [
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-save",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-slowisfast",
    "description": "dontbesilent 慢就是快。帮创业者找到看起来更慢但长期更快的方法，用摩擦建造资产。\n触发方式：/dbs-slowisfast、/慢就是快、「有没有更慢的方法」「我是不是太快了」\nSlow-is-fast diagnosis. Help entrepreneurs find seemingly slower methods that build assets through friction.\nTrigger: /dbs-slowisfast, \"is there a slower way\", \"am I going too fast\"",
    "primaryDomain": "business",
    "domains": [
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-slowisfast",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "cognitive-hijack",
    "description": "多哲学家视角分析内容的\"认知劫持\"机制。用于优化标题、封面、正文的点击率和互动率。触发词：\"/cognitive-hijack\"、\"分析认知触发\"、\"优化点击率\"",
    "primaryDomain": "content",
    "domains": [
      "content",
      "philosophy"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/cognitive-hijack",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-ai-check",
    "description": "dontbesilent AI 写作特征识别。扫描文案中的 AI 生成痕迹，输出检测报告。默认只诊断不改。\n触发方式：/dbs-ai-check、/AI检测、「帮我看看有没有 AI 味」「检测一下 AI 特征」\nAI writing fingerprint detection. Scans copy for AI-generated patterns and outputs a diagnostic report. Diagnosis only by default.\nTrigger: /dbs-ai-check, \"check for AI writing\", \"does this sound like AI\"",
    "primaryDomain": "content",
    "domains": [
      "content",
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-ai-check",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-content",
    "description": "dontbesilent 内容创作诊断。选题通过后，诊断怎么把这个选题做成好内容。\n触发方式：/dbs-content、/内容诊断、「这个内容怎么做」「帮我看看这个文案」\nContent creation diagnosis. After topic passes, diagnose how to turn it into good content.\nTrigger: /dbs-content, \"how should I create this content\", \"review my copy\"",
    "primaryDomain": "content",
    "domains": [
      "content",
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-content",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-content-system",
    "description": "dontbesilent 内容结构化系统。把本地大量文稿、推文、选题、案例和课程稿搭成一个可持续生长的内容结构化工程：先审计内容规模与边界，再建立新工程、复制素材、抽取内容单元、生成主题地图与选题装配稿。\n触发方式：/dbs-content-system、/内容结构化系统、「把我的内容做成结构化系统」「把本地素材变成可重组系统」「帮我搭内容资产工程」「我想把旧内容变成可复用资产」\nContent structuring system. Audits local content volume, then builds a reusable content knowledge project with units, topic maps, and assembly drafts.\nTrigger: /dbs-content-system, \"build a content structuring system\", \"turn my archive into reusable assets\"",
    "primaryDomain": "content",
    "domains": [
      "content",
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-content-system",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-hook",
    "description": "dontbesilent 短视频开头优化。诊断开头问题 + 生成优化方案。\n触发方式：/dbs-hook、/hook、「帮我优化开头」「开头怎么写」\nShort video opening optimization with diagnosis and solutions.\nTrigger: /dbs-hook, \"optimize my opening\", \"how to write opening\"",
    "primaryDomain": "content",
    "domains": [
      "content",
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-hook",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-xhs-title",
    "description": "小红书标题公式工具。从 75 个验证过的爆款公式中，帮你挑对的、用对的、理解为什么用这个。\n触发方式：/dbs-xhs-title、/小红书标题、「帮我起个小红书标题」「小红书标题公式」\nXiaohongshu title formula tool. Pick the right formula from 75 proven templates.\nTrigger: /dbs-xhs-title, \"xiaohongshu title\", \"RED title formula\"",
    "primaryDomain": "content",
    "domains": [
      "content",
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-xhs-title",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "editorial-card-screenshot",
    "description": "Generate high-density editorial HTML info cards in a modern magazine and Swiss-international style, then capture them as ratio-specific screenshots. Use when the user provides text or core information and wants: (1) a complete responsive HTML info card, (2) the design to follow the stored editorial prompt, (3) output in fixed visual ratios such as 3:4, 4:3, 1:1, 16:9, 9:16, 2.35:1, 3:1, or 5:2, or (4) both HTML and a rendered PNG cover/card from the same content.",
    "primaryDomain": "content",
    "domains": [
      "content"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/editorial-card-screenshot",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "gpt-image",
    "description": "Generate, edit, and vary images using CATION's gpt-image-2 model via the OpenAI Images API. Use whenever the user wants to create an image, generate a figure, make a diagram, poster, illustration, logo, icon, or any visual content. Also use when the user wants to edit an existing image (inpainting, style change) or create variations. Triggers on: \"generate image\", \"create image\", \"make a figure\", \"draw\", \"illustrate\", \"design a poster\", \"make an icon\", \"image of\", \"picture of\", \"visualize\", \"gpt-image\", or when the user provides a visual description and expects an image file output.",
    "primaryDomain": "content",
    "domains": [
      "content",
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/gpt-image",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "ob-deep-write",
    "description": "Use when user asks to write in-depth technical articles in Obsidian. Triggers on \"/ob-deep-write\", \"写深度文章\", \"写教程\", \"写指南\". Auto-identifies new concepts for /概念/ folder.",
    "primaryDomain": "content",
    "domains": [
      "content",
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/ob-deep-write",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "rednote-case-share",
    "description": "Use when writing 小红书 case share / dp posts for immigration cases (NIW/EB1A). Triggers on \"写案例分享\", \"写dp帖\", \"case share post\", \"/rednote-case-share\".",
    "primaryDomain": "content",
    "domains": [
      "content",
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/rednote-case-share",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "rednote-format",
    "description": "Convert Markdown articles with YAML frontmatter into styled HTML pages optimized for Xiaohongshu (小红书), then screenshot to PNG and slice into 9:16 images. Triggers on /rednote-format, 小红书排版, rednote format, 格式化长文.",
    "primaryDomain": "content",
    "domains": [
      "content"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/rednote-format",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "rednote-title",
    "description": "从内容的逻辑根节点生成小红书标题。不描述内容（叶子），而是找到内容存在的原因（根），用一句话表达。\n触发方式：/rednote-title、「帮我想标题」「这篇文章叫什么」\nGenerate Xiaohongshu titles from the logical root of content, not surface description.\nTrigger: /rednote-title, \"help me with the title\", \"what should this be called\"",
    "primaryDomain": "content",
    "domains": [
      "content"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/rednote-title",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "social-writing",
    "description": "Use when writing social media content (小红书/Twitter X). Triggers on \"/social-writing\", \"写小红书\", \"写推特\", \"写X文章\".",
    "primaryDomain": "content",
    "domains": [
      "content"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/social-writing",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "web-video-presentation",
    "description": "把一篇文章或口播稿，做成\"看起来像视频\"的点击驱动 16:9 网页演示，可选合成口播音频。流程：原始文章 → **一次产出**口播稿 + outline 开发计划 → 用户**一次对齐** 5 件事（稿子 / outline / 主题 / 素材 / 开发模式）→ 网页开发（逐章 / 顺序 / 并行）→ 可选音频合成（provider-agnostic：内置 CATION MAI-Voice-2（默认）/ gpt-audio / Azure 神经音色 / OpenAI TTS，可换 ElevenLabs / edge-tts / 自带 TTS）。**outline 只规划节奏与信息密度，不规划动画** —— 动画由章节开发时按 PRINCIPLES + ANTI-AI 法则即时设计。每次点击推进口播稿的一个节拍，每一步独占整屏，进度条平时隐藏只在悬浮时出现。适用场景：用网页做视频（动态 PPT 但不像 PPT）、把口播稿 / 文章变成可交互的解说、为 B 站 / YouTube / 视频号录屏教程、做有电影感的产品 / talk demo。本 Skill 沉淀的是设计方法论 + 协作流程 —— 不绑定任何特定样式 / 字体 / 颜色 —— 因此能复用到任意主题与美学。",
    "primaryDomain": "content",
    "domains": [
      "content"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/web-video-presentation",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "x-article-figure",
    "description": "Generate cover/figure image prompts for X Articles from article content. Reads the article, infers visual metaphors, outputs structured image generation prompt. Triggers on \"/x-article-figure\", \"article figure\", \"cover image for article\", \"generate figure\".",
    "primaryDomain": "content",
    "domains": [
      "content"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/x-article-figure",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "x-article-publisher",
    "description": "Convert Markdown to X Articles format and copy to clipboard. Use when user wants to prepare an article for X, mentions \"publish to X\", \"X article\", or needs Markdown converted for X Articles editor.",
    "primaryDomain": "content",
    "domains": [
      "content"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/x-article-publisher",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "doc-coauthoring",
    "description": "Guide users through a structured workflow for co-authoring documentation. Use when user wants to write documentation, proposals, technical specs, decision docs, or similar structured content. This workflow helps users efficiently transfer context, refine content through iteration, and verify the doc works for readers. Trigger when user mentions writing docs, creating proposals, drafting specs, or similar documentation tasks.",
    "primaryDomain": "docs",
    "domains": [
      "docs",
      "sci-writing"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/doc-coauthoring",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "docx",
    "description": "Comprehensive document creation, editing, and analysis with support for tracked changes, comments, formatting preservation, and text extraction. When Claude needs to work with professional documents (.docx files) for: (1) Creating new documents, (2) Modifying or editing content, (3) Working with tracked changes, (4) Adding comments, or any other document tasks",
    "primaryDomain": "docs",
    "domains": [
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/docx",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "kami",
    "description": "Typeset any professional document: resumes, one-pagers, white papers, letters, portfolios, slide decks. Warm parchment design system with ink-blue accent, serif-led hierarchy, and tight editorial spacing. Full bilingual support: Chinese docs use TsangerJinKai02 + Source Han, English docs use Newsreader + Inter. Triggers on \"做 PDF / 排版 / 生成报告 / 一页纸 / 白皮书 / 作品集 / 正式信件 / 简历 / PPT / slides / 高质量文档 / 好看的排版\", or \"build me a resume / make a one-pager / design a slide deck / turn this into a PDF / make this presentable / polish typography\", and when raw content is handed over to be \"typeset, designed, made presentable\".",
    "primaryDomain": "docs",
    "domains": [
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/kami",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "markitdown",
    "description": "Convert files and office documents to Markdown using Microsoft's MarkItDown. Supports PDF, DOCX, PPTX, XLSX, images (with OCR), audio (with transcription), HTML, CSV, JSON, XML, ZIP, YouTube URLs, EPubs and more.",
    "primaryDomain": "docs",
    "domains": [
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/markitdown",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "md-to-html",
    "description": "Use when converting markdown files to HTML reports for sharing. Triggers on \"convert to html\", \"make html report\", \"share as html\", \"markdown to html\". Produces self-contained full-width HTML with embedded images using pandoc.",
    "primaryDomain": "docs",
    "domains": [
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/md-to-html",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "obsidian-bases",
    "description": "Create and edit Obsidian Bases (.base files) with views, filters, formulas, and summaries. Use when working with .base files, creating database-like views of notes, or when the user mentions Bases, table views, card views, filters, or formulas in Obsidian.",
    "primaryDomain": "docs",
    "domains": [
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/obsidian-bases",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "obsidian-markdown",
    "description": "Create and edit Obsidian Flavored Markdown with wikilinks, embeds, callouts, properties, and other Obsidian-specific syntax. Use when working with .md files in Obsidian, or when the user mentions wikilinks, callouts, frontmatter, tags, embeds, or Obsidian notes.",
    "primaryDomain": "docs",
    "domains": [
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/obsidian-markdown",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "pdf",
    "description": "Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale.",
    "primaryDomain": "docs",
    "domains": [
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/pdf",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "pptx",
    "description": "Use this skill any time a .pptx file is involved in any way — as input, output, or both. This includes: creating slide decks, pitch decks, or presentations; reading, parsing, or extracting text from any .pptx file (even if the extracted content will be used elsewhere, like in an email or summary); editing, modifying, or updating existing presentations; combining or splitting slide files; working with templates, layouts, speaker notes, or comments. Trigger whenever the user mentions \\\"deck,\\\" \\\"slides,\\\" \\\"presentation,\\\" or references a .pptx filename, regardless of what they plan to do with the content afterward. If a .pptx file needs to be opened, created, or touched, use this skill.",
    "primaryDomain": "docs",
    "domains": [
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/pptx",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "read",
    "description": "Fetches any URL or PDF as clean Markdown. Handles paywalls, JS-heavy pages, X/Twitter, and Chinese platforms via proxy cascade. Always prefer this over WebFetch for any URL. Not for local text files or source code already in the repo.",
    "primaryDomain": "docs",
    "domains": [
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/read",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "read-docx",
    "description": "Read and extract content from DOCX files. Use when Claude needs to read, analyze, or extract text from .docx files that cannot be read directly as binary files.",
    "primaryDomain": "docs",
    "domains": [
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/read-docx",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "xlsx",
    "description": "Use this skill any time a spreadsheet file is the primary input or output. This means any task where the user wants to: open, read, edit, or fix an existing .xlsx, .xlsm, .csv, or .tsv file (e.g., adding columns, computing formulas, formatting, charting, cleaning messy data); create a new spreadsheet from scratch or from other data sources; or convert between tabular file formats. Trigger especially when the user references a spreadsheet file by name or path — even casually (like \\\"the xlsx in my downloads\\\") — and wants something done to it or produced from it. Also trigger for cleaning or restructuring messy tabular data files (malformed rows, misplaced headers, junk data) into proper spreadsheets. The deliverable must be a spreadsheet file. Do NOT trigger when the primary deliverable is a Word document, HTML report, standalone Python script, database pipeline, or Google Sheets API integration, even if tabular data is involved.",
    "primaryDomain": "docs",
    "domains": [
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/xlsx",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon",
    "description": "Top-level router for all Horizon green card petition skills (NIW + EB1A + tools). Triggers on \"horizon\", \"green card skill\", \"petition skill\", \"which skill\", \"Prong 1\", \"national importance\", \"PE\", \"proposed endeavor\", \"NIW\", \"well-positioned\", \"balancing\", \"qualifications\", \"publications\", \"peer review\", \"field projects\", \"cover letter\", \"recommendation letter\", \"EB1A\", \"EB-1A\", \"contributions\", \"original contributions\", \"judging\", \"scholarly articles\", \"awards\", \"high salary\", \"final merits\", \"citation analysis\", \"Google Scholar\", \"collect citations\", \"translate exhibits\", \"green-intel\", \"horizon-intel\", \"build petition\", \"generate docx\", \"run pipeline\", \"assemble exhibits\", \"配图\", \"figure\", \"infographic\", \"visualize section\", \"search AAO\", \"case precedent\", \"AAO decision\", \"whitepaper\", \"SOP\", \"internal document\", \"review this\", \"check this section\".",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-aao",
    "description": "Search AAO (Administrative Appeals Office) decisions for EB1A/NIW cases. Use when researching USCIS adjudication patterns, case precedents, or denial reasons by field, criteria, or keywords.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-aao",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-eb1a-awards",
    "description": "EB1A Awards criterion guide. Use when writing awards section or proving award recognition level.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-awards",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-eb1a-contributions",
    "description": "EB1A Original Contributions guide. Use when writing major significance section or documenting research impact.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-contributions",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-eb1a-final-merits",
    "description": "Use when writing EB1A final merits determination section (Kazarian step 2), the closing section that argues sustained national/international acclaim and top-of-field standing. Triggers on \"final merits\", \"risen to the top\", \"totality of evidence\", \"step 2\".",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-final-merits",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-eb1a-high-salary",
    "description": "EB1A High Salary criterion guide. Use when writing high remuneration section, comparing compensation components, or structuring salary evidence.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-high-salary",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-eb1a-judging",
    "description": "EB1A Judging criterion guide. Use when writing peer review experience section.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-judging",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-eb1a-scholarly-articles",
    "description": "EB1A Scholarly Articles criterion guide. Use when writing publications section or proving venue quality.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-scholarly-articles",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-figure",
    "description": "Use when creating infographic JSON prompts for NIW/EB1A petition sections. Triggers on \"配图\", \"figure\", \"infographic\", \"visualize section\".",
    "primaryDomain": "green-card",
    "domains": [
      "green-card",
      "content"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-figure",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-intel",
    "description": "Use when running any green-intel pipeline for EB1A/NIW immigration petitions — citation analysis, document translation, AAO decision analysis, RFE response analysis, or translation invoicing. Triggers on \"run green-intel\", \"horizon-intel\", \"citation analysis\", \"Google Scholar pipeline\", \"collect citations\", \"translate exhibits\", \"AAO analysis\", \"RFE analysis\", \"translation invoice\", \"green intel\", or when a Google Scholar profile URL is provided for petition work.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card",
      "sci-writing"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-intel",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw",
    "description": "NIW petition writing toolkit entry point. Routes to the right skill based on user intent.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-balancing",
    "description": "NIW Prong 3 balancing test writing guide. Arguing the justification for waiving labor certification.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-balancing",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-cover-letter",
    "description": "NIW Cover Letter writing guide.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-cover-letter",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-evaluate",
    "description": "NIW qualification screening. Pre-filing assessment with field tier, evidence scoring, and go/no-go verdict.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-evaluate",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-field-projects",
    "description": "NIW Prong 2 writing guide for field projects and industry impact.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-field-projects",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-national-importance",
    "description": "NIW Prong 1b national importance writing guide. 5-atom breakdown, Prospective Bridge, Dependency Inversion.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-national-importance",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-peer-review",
    "description": "NIW Prong 2 writing guide for peer review activity and invited presentations.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-peer-review",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-proposed-endeavor",
    "description": "NIW Proposed Endeavor writing guide. Frame A/B framework, pseudo-concept detection, PE structure template.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-proposed-endeavor",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-publications",
    "description": "NIW Prong 2 writing guide for publication record and citation analysis.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-publications",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-qualifications",
    "description": "NIW Prong 2 writing guide for educational background and professional qualifications.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-qualifications",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-recommendation-letter",
    "description": "NIW recommendation letter writing guide. 3 Kill Rules, anti-AI detection, voice test.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-recommendation-letter",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-review",
    "description": "NIW multi-perspective review. 6 agents parallel review + orchestrator verdict.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-review",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-rfe",
    "description": "NIW RFE response writing guide. Point-by-point rebuttal methodology, rebuttal pattern catalog from real submitted cases, new evidence integration, and structural guidance for forcing the officer to write from scratch. Triggers on \"RFE response\", \"request for evidence\", \"USCIS asked for more evidence\", \"respond to RFE\", \"horizon-niw-rfe\", \"how to answer RFE\", \"RFE rebuttal\".",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-rfe",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-style-guide",
    "description": "Global writing style guide for NIW petitions.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-style-guide",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-niw-well-positioned",
    "description": "NIW Prong 2 legal standard and section routing. Use to understand what Prong 2 requires and which skill handles each section.",
    "primaryDomain": "green-card",
    "domains": [
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-niw-well-positioned",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-whitepaper",
    "description": "Use when generating professional internal documents (whitepapers, SOPs, system docs, process documentation) as petition exhibits. Triggers on \"write whitepaper\", \"generate SOP\", \"system documentation\", \"internal document\", \"professional document\", \"white paper\".",
    "primaryDomain": "green-card",
    "domains": [
      "green-card",
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-whitepaper",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "meeting-ai",
    "description": "Process meeting audio/video into markdown transcripts with speaker diarization. Use when user mentions processing audio, transcribing meetings, or asks to transcribe a .wav/.mp3/.m4a/.mov/.mp4 file. Works in any project (writes to `Meeting/` subfolder by convention); Obsidian vault is one such project. Supports both CLI (direct) and web app (upload to meeting-ai-web).",
    "primaryDomain": "media",
    "domains": [
      "media"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/meeting-ai",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "transcribe",
    "description": "Upload audio/video to Meeting AI for transcription and summarization. Use when user mentions \"transcribe\", \"meeting audio\", \"process recording\", or provides an audio/video file path.",
    "primaryDomain": "media",
    "domains": [
      "media"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/transcribe",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "youtube-transcript",
    "description": "Extract transcripts from YouTube videos. Use when the user asks for a transcript, subtitles, or captions of a YouTube video and provides a YouTube URL (youtube.com/watch?v=, youtu.be/, or similar). Supports output with or without timestamps.",
    "primaryDomain": "media",
    "domains": [
      "media"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/youtube-transcript",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "cc-e2e-test",
    "description": "Use when testing MCP agent responses as a real user would, verifying LLM output quality, or before claiming agent features work correctly",
    "primaryDomain": "meta",
    "domains": [
      "meta"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/cc-e2e-test",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-agent-migration",
    "description": "Agent 工作台迁移。把任意项目整理成 Claude Code / Codex / Grok 三端一致、可长期维护的 Agent 工作台：审计规则文件、识别真源、统一命名并生成 bridge。\n触发方式：/dbs-agent-migration、/agent迁移、「迁移到 Codex」「迁移到 Claude Code」「迁移到 Grok」「统一 AGENTS.md」「整理 skill bridge」「我的 Agent 工作台很乱」「帮我统一 Claude 和 Codex 和 Grok」\nAgent workspace migration. Turn any project into a maintainable Claude Code / Codex / Grok three-host workspace by auditing rule files, establishing source-of-truth skills, normalizing names, and generating bridges.\nTrigger: /dbs-agent-migration, /agent-migration, \"migrate to Codex\", \"migrate to Claude Code\", \"migrate to Grok\", \"fix AGENTS.md\", \"organize skill bridges\"",
    "primaryDomain": "meta",
    "domains": [
      "meta",
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-agent-migration",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbskill-upgrade",
    "description": "升级 dbskill 到最新版本",
    "primaryDomain": "meta",
    "domains": [
      "meta",
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbskill-upgrade",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "grill-me",
    "description": "Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions \"grill me\".",
    "primaryDomain": "meta",
    "domains": [
      "meta",
      "global-core"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/grill-me",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "grill-with-docs",
    "description": "Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.",
    "primaryDomain": "meta",
    "domains": [
      "meta",
      "global-core"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/grill-with-docs",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "huashu-nuwa",
    "description": "女娲造人：输入人名/主题/甚至只是模糊需求，自动深度调研→思维框架提炼→生成可运行的人物Skill。\n两种入口：(1)明确人名→直接蒸馏 (2)模糊需求→诊断推荐→再蒸馏。\n触发词：「造skill」「蒸馏XX」「女娲」「造人」「XX的思维方式」「做个XX视角」「更新XX的skill」。\n模糊需求也触发：「我想提升决策质量」「有没有一种思维方式能帮我...」「我需要一个思维顾问」。",
    "primaryDomain": "meta",
    "domains": [
      "meta",
      "philosophy"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/huashu-nuwa",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "learn",
    "description": "Runs a six-phase research workflow to turn unfamiliar domains or collected sources into publish-ready output. Not for quick lookups or single-file reads.",
    "primaryDomain": "meta",
    "domains": [
      "meta",
      "sci-writing"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/learn",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "skill-creator",
    "description": "Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy.",
    "primaryDomain": "meta",
    "domains": [
      "meta"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/skill-creator",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "template-skill",
    "description": "Replace with description of the skill and when Claude should use it.",
    "primaryDomain": "meta",
    "domains": [
      "meta"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/template-skill",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "think",
    "description": "Turns rough ideas into approved, decision-complete plans with validated structure before writing code. Covers new features, architecture decisions, and value judgments about whether to build, keep, or remove something. Not for bug fixes or small edits.",
    "primaryDomain": "meta",
    "domains": [
      "meta"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/think",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "azure-cost-report",
    "description": "Use when generating the monthly Azure cost + usage dashboard for the BMI subscription (or similar). Produces a single-page HTML report in docs/dashboards/azure-cost-{month}-{year}.html. Triggers on \"generate cost report\", \"make the month dashboard\", \"/azure-cost-report\", or a month argument.",
    "primaryDomain": "ops",
    "domains": [
      "ops"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/azure-cost-report",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "backup-dotfiles",
    "description": "Back up this Mac's settings, secrets, and install manifests so a fresh machine can be fully restored from \"read this dir and recover\". Use this skill WHENEVER the user says \"backup\", \"back up\", \"sync dotfiles\", \"save my settings\", mentions migrating to / setting up / restoring a new Mac, or before any major system change (OS upgrade, disk wipe, machine swap). The skill is a living manifest, not a fixed cp-list: it re-discovers new config surfaces every run, so prefer it even when a quick `cp` seems enough — the discovery pass catches what one-off copies miss (and what silently rots).",
    "primaryDomain": "ops",
    "domains": [
      "ops"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/backup-dotfiles",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "diary",
    "description": "Use when generating daily diary with reflection. Triggers on /diary, 写日记, 今天做了什么. Default (no args) backfills missing days in current month (excluding today). Use \"/diary today\" for today only.",
    "primaryDomain": "ops",
    "domains": [
      "ops"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/diary",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "optimizing-cloud-costs",
    "description": "Execute use when you need to work with cloud cost optimization.\nThis skill provides cost analysis and optimization with comprehensive guidance and automation.\nTrigger with phrases like \"optimize costs\", \"analyze spending\",\nor \"reduce costs\".",
    "primaryDomain": "ops",
    "domains": [
      "ops"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/optimizing-cloud-costs",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "translate-invoice",
    "description": "Use when generating translation invoices, pricing CN documents, running invoicing pipeline, or user says \"翻译报价\", \"translation invoice\", \"pricing\", \"/translate-invoice\". Triggers on any invoicing task for EB1A/NIW case exhibits.",
    "primaryDomain": "ops",
    "domains": [
      "ops",
      "green-card"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/translate-invoice",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "behavior",
    "description": "收集行为数据，用 thinking-tools 多视角分析。Use when user says \"分析我的行为\", \"/behavior\".",
    "primaryDomain": "philosophy",
    "domains": [
      "philosophy"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/behavior",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "chatroom-austrian",
    "description": "哈耶克 × 米塞斯 × Codex 三人对话。奥派经济学视角的多角色讨论。\n触发方式：/chatroom-austrian、/奥派、「奥派聊天室」\nAustrian economics chatroom. Hayek × Mises × Codex debate.\nTrigger: /chatroom-austrian, /奥派, \"Austrian chat\"",
    "primaryDomain": "philosophy",
    "domains": [
      "philosophy"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/chatroom-austrian",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-chatroom-austrian",
    "description": "哈耶克 × 米塞斯 × Claude 三人对话。奥派经济学视角的多角色讨论。\n触发方式：/dbs-chatroom-austrian、/chatroom-austrian、/奥派、「奥派聊天室」\nAustrian economics chatroom. Hayek × Mises × Claude debate.\nTrigger: /dbs-chatroom-austrian, /chatroom-austrian, /奥派, \"Austrian chat\"",
    "primaryDomain": "philosophy",
    "domains": [
      "philosophy"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-chatroom-austrian",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "dbs-deconstruct",
    "description": "dontbesilent 概念拆解。用维特根斯坦 + 奥派经济学的方法，把模糊的商业概念拆到原子级别。\n触发方式：/dbs-deconstruct、/拆概念、「帮我拆解这个概念」「这个词到底什么意思」\nConcept deconstruction using Wittgenstein + Austrian economics framework.\nTrigger: /dbs-deconstruct, \"deconstruct this concept\", \"what does this really mean\"",
    "primaryDomain": "philosophy",
    "domains": [
      "philosophy",
      "business"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/dbs-deconstruct",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "polanyi",
    "description": "Michael Polanyi 的思维框架与表达方式。基于7本核心著作、30+学术论文、6个维度的深度调研，\n提炼6个核心心智模型、8条决策启发式和完整的表达DNA。\n用途：作为知识传承与学习顾问，用 Polanyi 的视角分析隐性知识传递、技能习得、科学哲学问题。\n当用户提到「用 Polanyi 的视角」「Polanyi 会怎么看」「隐性知识」「tacit knowledge」时使用。\n即使用户只是说「帮我用 Polanyi 的角度想想」「为什么说不清楚」「怎么传承经验」也应触发。",
    "primaryDomain": "philosophy",
    "domains": [
      "philosophy"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/polanyi",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "thinking-tools",
    "description": "Use when user says \"think tools\", \"think more ways\", \"deep think\", facing complex problems, or need fresh perspectives. Triggers on \"think more ways\", \"deep think\", \"analyze deeply\", strategic decisions, or when single-perspective analysis isn't enough.",
    "primaryDomain": "philosophy",
    "domains": [
      "philosophy",
      "meta"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/thinking-tools",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "academic-writing",
    "description": "Academic manuscript writing assistant for scientific papers. Use when Claude needs to write, edit, or review academic manuscripts following Nature Biotechnology journal standards, with professional formatting and natural prose that avoids AI-generated writing patterns.",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/academic-writing",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "nature-academic-search",
    "description": "Multi-source literature search, citation verification, MeSH search strategy, citation file management (.nbib/.ris/.bib conversion), and reference management (BibTeX, related articles, ID conversion) via MCP tools (PubMed, CrossRef, arXiv). Use when the user needs coordinated multi-step literature workflows beyond a single MCP call.",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing",
      "bioinfo"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/nature-academic-search",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "nature-citation",
    "description": "Add strict Nature/CNS citations to manuscript text by splitting long passages into citable segments, searching only accepted flagship and subjournal titles from Nature Portfolio, the AAAS Science family, and Cell Press, filtering by publication time range, and exporting one reference-manager-ready output by default. Use this skill whenever the user asks to input text and automatically get references, add citations to a paragraph/manuscript, find Nature-series or CNS support for statements, create text-to-reference correspondence, \"分段引用\", \"自动给出引用\", \"Nature系列引用\", \"CNS及子刊\", \"支撑文献\", \"补引用\", \"找引用\", or export EndNote/RIS/ENW/Zotero RDF.",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/nature-citation",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "nature-data",
    "description": "Prepare, audit, or revise Nature-ready Data Availability statements, data repository plans, dataset citations, and FAIR metadata checklists for manuscripts. Use when the user asks about Nature data availability, research data sharing, repository selection, accession numbers, restricted or sensitive data, source data, supplementary datasets, DataCite-style dataset references, FAIR metadata for academic publication, or Chinese-to-English data availability wording for Chinese-speaking authors preparing Nature-family submissions.",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing",
      "bioinfo"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/nature-data",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "nature-figure",
    "description": "Submission-grade Nature/high-impact journal figure workflow for Python or R. Use whenever the user asks to create, revise, audit, or polish manuscript figures, multi-panel scientific plots, figures4papers-style matplotlib plots, or journal-ready SVG/PDF/TIFF outputs, especially for Nature-family or other high-impact journals. Before plotting, define the figure's conclusion, evidence logic, export needs, and review risks. If the user has not chosen Python or R, ask \"Python or R?\" and stop. Use only the selected backend for figure generation, previewing, exporting, and QA. Supports matplotlib/seaborn and ggplot2/patchwork/ComplexHeatmap. Not for dashboards or Illustrator/Figma-first infographics.",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/nature-figure",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "nature-paper2ppt",
    "description": "Build a complete but efficient Nature-style Chinese PPTX presentation from a scientific paper, preprint, PDF, article text, abstract, figure legends, or reading notes. Use this skill whenever the user asks to make slides/PPT/PPTX for journal club, group meeting, paper sharing, thesis seminar, lab meeting, department report, or academic presentation from a research paper, not only medical papers. It identifies the paper type and argument, selects only the figures needed for the story, writes Chinese slide content and speaker notes, creates the actual .pptx deck, and performs lightweight verification with cross-platform Python tooling by default.",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing",
      "docs"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/nature-paper2ppt",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "nature-polishing",
    "description": "Polish, restructure, or translate academic prose into Nature-leaning English using writing-strategy principles, curated Nature/Nature Communications article patterns, and phrase-level support from Academic Phrasebank. Use whenever the user asks to polish a manuscript paragraph, abstract, introduction, results, discussion, conclusion, title, methods section, or Chinese academic draft for publication-quality English.",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/nature-polishing",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "nature-reader",
    "description": "Build full-paper Chinese-English side-by-side, figure/table-aware, source-grounded Markdown readers for journal or conference papers from PDF, DOI, arXiv, publisher HTML, or pasted text. Use whenever the user asks to translate or read a paper, make 中英文对照/原文对照/全文翻译解读, extract figures or tables into the right positions, preserve figure/table placement near relevant prose, or keep exact source anchors for every block. This skill must not degrade into a summary-only output unless the user explicitly asks for a summary.",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/nature-reader",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "nature-response",
    "description": "Draft, audit, or revise point-by-point reviewer response letters for Nature-family manuscript revisions. Use when the user provides reviewer comments, editor decision letters, revision notes, response drafts, or asks how to respond to major/minor revision requests, rebuttal letters, response to reviewers, peer-review reports, 审稿意见回复, 逐点回复, 修回信, 大修回复, 小修回复, or 如何回复 reviewer.",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/nature-response",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "nature-writing",
    "description": "Draft, restructure, or plan Nature-style manuscript sections from author-provided claims, results, figures, notes, or Chinese drafts. Use when the user wants to write or rebuild an abstract, introduction, results narrative, discussion, conclusion, title, or full manuscript argument rather than only polish finished prose.",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/nature-writing",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "sanity-check",
    "description": "Audit AI-generated analysis deliverables (slides, reports, manuscript text) for overclaims, figure errors, evidence gaps, and narrative bias before they reach a PI or reviewer. Covers 15 failure modes learned from real review cycles.",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing",
      "meta"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/sanity-check",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "supp-table-audit",
    "description": "Audit and fix supplementary tables — sheet naming, title rows, and manuscript citation cross-check",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing",
      "bioinfo"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/supp-table-audit",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "zot-cite",
    "description": "Zero-hallucination citation workflow using Zotero CLI (zot) + PubMed MCP\ncross-check. Use this skill ANY TIME citations, references, or bibliography\nare involved — inserting [@key] in manuscript, looking up a paper, adding a\nDOI to Zotero, exporting BibTeX, building refs.bib, or verifying existing\ncitations. Also use when writing manuscript sections that need references,\ndoing literature review, or when the user says \"cite\", \"reference\", \"bib\",\n\"find paper\", \"zot\", \"look up paper\", \"add citation\", \"引用\", \"参考文献\",\n\"查文献\". This skill prevents Claude from fabricating citation metadata —\nevery citation must come from a verified source (Zotero + PubMed), never\nfrom memory or training data. Even if the task seems simple (\"just cite\nthat paper\"), use this skill to ensure the citation is real and correct.",
    "primaryDomain": "sci-writing",
    "domains": [
      "sci-writing",
      "bioinfo"
    ],
    "path": "/Users/wang.13246/.skillshelf/library/zot-cite",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  },
  {
    "name": "horizon-build",
    "description": "Use when building petition DOCX from markdown, generating exhibit PDFs, assembling print packages, or running any step of the petition build pipeline. Triggers on \"build petition\", \"generate docx\", \"run pipeline\", \"assemble exhibits\", \"update page numbers\", \"/horizon-build\".",
    "primaryDomain": null,
    "domains": [],
    "path": "/Users/wang.13246/.skillshelf/library/horizon-build",
    "retired": false,
    "mode": "owned",
    "linkTarget": null
  }
];

export const realWhere: DeploymentReport = {
  "surfaces": [
    "/Users/wang.13246/.claude/skills",
    "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
    "/Volumes/Extreme/Project/BioGuider-writing/skills",
    "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
    "/Users/wang.13246/Documents/GitHub/sskind/.claude/skills",
    "/Users/wang.13246/Documents/GitHub/BMI_infra/.claude/skills",
    "/Users/wang.13246/Documents/GitHub/meeting-ai-web/.claude/skills",
    "/Users/wang.13246/Documents/GitHub/cairn/skill",
    "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
    "/Users/wang.13246/.codex/skills",
    "/Users/wang.13246/.codex/vendor_imports/skills/skills",
    "/Users/wang.13246/.cursor/skills"
  ],
  "sites": [
    {
      "name": "academic-writing",
      "surface": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "path": "/Volumes/Extreme/Project/BioGuider-writing/skills/academic-writing",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/academic-writing",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "agent-reach",
      "surface": "/Users/wang.13246/.claude/skills",
      "path": "/Users/wang.13246/.claude/skills/agent-reach",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/agent-reach",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "azure-cost-report",
      "surface": "/Users/wang.13246/Documents/GitHub/BMI_infra/.claude/skills",
      "path": "/Users/wang.13246/Documents/GitHub/BMI_infra/.claude/skills/azure-cost-report",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/azure-cost-report",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "backup-dotfiles",
      "surface": "/Users/wang.13246/.claude/skills",
      "path": "/Users/wang.13246/.claude/skills/backup-dotfiles",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/backup-dotfiles",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "behavior",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/behavior",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/behavior",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "behavior",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/behavior",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/behavior",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "cairn",
      "surface": "/Users/wang.13246/Documents/GitHub/cairn/skill",
      "path": "/Users/wang.13246/Documents/GitHub/cairn/skill/cairn",
      "kind": "source",
      "target": null,
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "cc-e2e-test",
      "surface": "/Users/wang.13246/Documents/GitHub/sskind/.claude/skills",
      "path": "/Users/wang.13246/Documents/GitHub/sskind/.claude/skills/cc-e2e-test",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/cc-e2e-test",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "chatroom-austrian",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/chatroom-austrian",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/chatroom-austrian",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "cognitive-hijack",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/cognitive-hijack",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/cognitive-hijack",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "cognitive-hijack",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/cognitive-hijack",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/cognitive-hijack",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "dbs",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/dbs",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "dbs-action",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-action",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/dbs-action",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "dbs-benchmark",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-benchmark",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/dbs-benchmark",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "dbs-content",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-content",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/dbs-content",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "dbs-deconstruct",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-deconstruct",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/dbs-deconstruct",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "dbs-diagnosis",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-diagnosis",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/dbs-diagnosis",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "dbs-hook",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-hook",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/dbs-hook",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "dbs-xhs-title",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-xhs-title",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/dbs-xhs-title",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "dbskill-upgrade",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbskill-upgrade",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/dbskill-upgrade",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "diary",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/diary",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/diary",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "diary",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/diary",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/diary",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "doc-coauthoring",
      "surface": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "path": "/Volumes/Extreme/Project/BioGuider-writing/skills/doc-coauthoring",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/doc-coauthoring",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "docx",
      "surface": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "path": "/Volumes/Extreme/Project/BioGuider-writing/skills/docx",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/docx",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "grill-me",
      "surface": "/Users/wang.13246/.claude/skills",
      "path": "/Users/wang.13246/.claude/skills/grill-me",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/grill-me",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "grill-with-docs",
      "surface": "/Users/wang.13246/.claude/skills",
      "path": "/Users/wang.13246/.claude/skills/grill-with-docs",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/grill-with-docs",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-aao",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-aao",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-aao",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-aao",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-aao",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-aao",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-build",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-build",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-build",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-build",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-build",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-build",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-eb1a-awards",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-eb1a-awards",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-awards",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-eb1a-awards",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-eb1a-awards",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-awards",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-eb1a-contributions",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-eb1a-contributions",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-contributions",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-eb1a-contributions",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-eb1a-contributions",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-contributions",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-eb1a-final-merits",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-eb1a-final-merits",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-final-merits",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-eb1a-final-merits",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-eb1a-final-merits",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-final-merits",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-eb1a-high-salary",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-eb1a-high-salary",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-high-salary",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-eb1a-high-salary",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-eb1a-high-salary",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-high-salary",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-eb1a-judging",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-eb1a-judging",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-judging",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-eb1a-judging",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-eb1a-judging",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-judging",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-eb1a-scholarly-articles",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-eb1a-scholarly-articles",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-scholarly-articles",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-eb1a-scholarly-articles",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-eb1a-scholarly-articles",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-eb1a-scholarly-articles",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-figure",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-figure",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-figure",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-figure",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-figure",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-figure",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-intel",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-intel",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-intel",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-intel",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-intel",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-intel",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-balancing",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-balancing",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-balancing",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-cover-letter",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-cover-letter",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-cover-letter",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-evaluate",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-evaluate",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-evaluate",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-field-projects",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-field-projects",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-field-projects",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-national-importance",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-national-importance",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-national-importance",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-peer-review",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-peer-review",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-peer-review",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-proposed-endeavor",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-proposed-endeavor",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-proposed-endeavor",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-publications",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-publications",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-publications",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-qualifications",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-qualifications",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-qualifications",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-recommendation-letter",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-recommendation-letter",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-recommendation-letter",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-review",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-review",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-review",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-rfe",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-niw-rfe",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-rfe",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-rfe",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-rfe",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-rfe",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-style-guide",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-style-guide",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-style-guide",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-niw-well-positioned",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-well-positioned",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-niw-well-positioned",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-whitepaper",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-whitepaper",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-whitepaper",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "horizon-whitepaper",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-whitepaper",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/horizon-whitepaper",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "learn",
      "surface": "/Users/wang.13246/.claude/skills",
      "path": "/Users/wang.13246/.claude/skills/learn",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/learn",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "nature-academic-search",
      "surface": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-academic-search",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/nature-academic-search",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "nature-citation",
      "surface": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-citation",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/nature-citation",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "nature-data",
      "surface": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-data",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/nature-data",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "nature-figure",
      "surface": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-figure",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/nature-figure",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "nature-paper2ppt",
      "surface": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-paper2ppt",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/nature-paper2ppt",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "nature-polishing",
      "surface": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-polishing",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/nature-polishing",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "nature-reader",
      "surface": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-reader",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/nature-reader",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "nature-response",
      "surface": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-response",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/nature-response",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "nature-writing",
      "surface": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-writing",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/nature-writing",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "nuwa",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/nuwa",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/huashu-nuwa",
      "inLibrary": false,
      "drift": false
    },
    {
      "name": "nuwa",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/nuwa",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/huashu-nuwa",
      "inLibrary": false,
      "drift": false
    },
    {
      "name": "ob-deep-write",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/ob-deep-write",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/ob-deep-write",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "ob-deep-write",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/ob-deep-write",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/ob-deep-write",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "obsidian-bases",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/obsidian-bases",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/obsidian-bases",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "obsidian-bases",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/obsidian-bases",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/obsidian-bases",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "obsidian-markdown",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/obsidian-markdown",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/obsidian-markdown",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "obsidian-markdown",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/obsidian-markdown",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/obsidian-markdown",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "optimizing-cloud-costs",
      "surface": "/Users/wang.13246/Documents/GitHub/BMI_infra/.claude/skills",
      "path": "/Users/wang.13246/Documents/GitHub/BMI_infra/.claude/skills/optimizing-cloud-costs",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/optimizing-cloud-costs",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "pdf",
      "surface": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "path": "/Volumes/Extreme/Project/BioGuider-writing/skills/pdf",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/pdf",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "polanyi",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/polanyi",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/polanyi",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "polanyi",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/polanyi",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/polanyi",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "read",
      "surface": "/Users/wang.13246/.claude/skills",
      "path": "/Users/wang.13246/.claude/skills/read",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/read",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "read-docx",
      "surface": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "path": "/Volumes/Extreme/Project/BioGuider-writing/skills/read-docx",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/read-docx",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "rednote-case-share",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/rednote-case-share",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/rednote-case-share",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "rednote-case-share",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/rednote-case-share",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/rednote-case-share",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "rednote-format",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/rednote-format",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/rednote-format",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "rednote-format",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/rednote-format",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/rednote-format",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "rednote-title",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/rednote-title",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/rednote-title",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "rednote-title",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/rednote-title",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/rednote-title",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "sanity-check",
      "surface": "/Users/wang.13246/.claude/skills",
      "path": "/Users/wang.13246/.claude/skills/sanity-check",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/sanity-check",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "skill-creator",
      "surface": "/Users/wang.13246/.claude/skills",
      "path": "/Users/wang.13246/.claude/skills/skill-creator",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/skill-creator",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "social-writing",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/social-writing",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/social-writing",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "social-writing",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/social-writing",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/social-writing",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "template",
      "surface": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "path": "/Volumes/Extreme/Project/BioGuider-writing/skills/template",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/template-skill",
      "inLibrary": false,
      "drift": false
    },
    {
      "name": "think",
      "surface": "/Users/wang.13246/.claude/skills",
      "path": "/Users/wang.13246/.claude/skills/think",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/think",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "thinking-tools",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/thinking-tools",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/thinking-tools",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "thinking-tools",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/thinking-tools",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/thinking-tools",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "transcribe",
      "surface": "/Users/wang.13246/Documents/GitHub/meeting-ai-web/.claude/skills",
      "path": "/Users/wang.13246/Documents/GitHub/meeting-ai-web/.claude/skills/transcribe",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/transcribe",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "translate-invoice",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/translate-invoice",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/translate-invoice",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "translate-invoice",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/translate-invoice",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/translate-invoice",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "x-article-figure",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/x-article-figure",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/x-article-figure",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "x-article-figure",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/x-article-figure",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/x-article-figure",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "x-article-publisher",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/x-article-publisher",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/x-article-publisher",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "x-article-publisher",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/x-article-publisher",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/x-article-publisher",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "youtube-transcript",
      "surface": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/youtube-transcript",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/youtube-transcript",
      "inLibrary": true,
      "drift": false
    },
    {
      "name": "youtube-transcript",
      "surface": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/youtube-transcript",
      "kind": "linked",
      "target": "/Users/wang.13246/.skillshelf/library/youtube-transcript",
      "inLibrary": true,
      "drift": false
    }
  ],
  "problems": []
};

export const realScan: ScanReport = {
  "roots": [
    "/Users/wang.13246/.claude/skills",
    "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
    "/Volumes/Extreme/Project/BioGuider-writing/skills",
    "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
    "/Users/wang.13246/Documents/GitHub/sskind/.claude/skills",
    "/Users/wang.13246/Documents/GitHub/BMI_infra/.claude/skills",
    "/Users/wang.13246/Documents/GitHub/meeting-ai-web/.claude/skills",
    "/Users/wang.13246/Documents/GitHub/cairn/skill",
    "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills"
  ],
  "totals": {
    "roots": 9,
    "candidates": 84,
    "new": 0,
    "duplicateGroups": 0,
    "driftGroups": 0,
    "exactDuplicateGroups": 0
  },
  "perRoot": [
    {
      "root": "/Users/wang.13246/.claude/skills",
      "candidates": 9,
      "new": 0
    },
    {
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "candidates": 41,
      "new": 0
    },
    {
      "root": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "candidates": 6,
      "new": 0
    },
    {
      "root": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "candidates": 9,
      "new": 0
    },
    {
      "root": "/Users/wang.13246/Documents/GitHub/sskind/.claude/skills",
      "candidates": 1,
      "new": 0
    },
    {
      "root": "/Users/wang.13246/Documents/GitHub/BMI_infra/.claude/skills",
      "candidates": 2,
      "new": 0
    },
    {
      "root": "/Users/wang.13246/Documents/GitHub/meeting-ai-web/.claude/skills",
      "candidates": 1,
      "new": 0
    },
    {
      "root": "/Users/wang.13246/Documents/GitHub/cairn/skill",
      "candidates": 1,
      "new": 0
    },
    {
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "candidates": 14,
      "new": 0
    }
  ],
  "dedupedRoots": [],
  "candidates": [
    {
      "name": "learn",
      "description": "Runs a six-phase research workflow to turn unfamiliar domains or collected sources into publish-ready output. Not for quick lookups or single-file reads.",
      "path": "/Users/wang.13246/.claude/skills/learn",
      "root": "/Users/wang.13246/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "think",
      "description": "Turns rough ideas into approved, decision-complete plans with validated structure before writing code. Covers new features, architecture decisions, and value judgments about whether to build, keep, or remove something. Not for bug fixes or small edits.",
      "path": "/Users/wang.13246/.claude/skills/think",
      "root": "/Users/wang.13246/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "backup-dotfiles",
      "description": "Back up this Mac's settings, secrets, and install manifests so a fresh machine can be fully restored from \"read this dir and recover\". Use this skill WHENEVER the user says \"backup\", \"back up\", \"sync dotfiles\", \"save my settings\", mentions migrating to / setting up / restoring a new Mac, or before any major system change (OS upgrade, disk wipe, machine swap). The skill is a living manifest, not a fixed cp-list: it re-discovers new config surfaces every run, so prefer it even when a quick `cp` seems enough — the discovery pass catches what one-off copies miss (and what silently rots).",
      "path": "/Users/wang.13246/.claude/skills/backup-dotfiles",
      "root": "/Users/wang.13246/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "read",
      "description": "Fetches any URL or PDF as clean Markdown. Handles paywalls, JS-heavy pages, X/Twitter, and Chinese platforms via proxy cascade. Always prefer this over WebFetch for any URL. Not for local text files or source code already in the repo.",
      "path": "/Users/wang.13246/.claude/skills/read",
      "root": "/Users/wang.13246/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "skill-creator",
      "description": "Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy.",
      "path": "/Users/wang.13246/.claude/skills/skill-creator",
      "root": "/Users/wang.13246/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "grill-with-docs",
      "description": "Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.",
      "path": "/Users/wang.13246/.claude/skills/grill-with-docs",
      "root": "/Users/wang.13246/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "sanity-check",
      "description": "Audit AI-generated analysis deliverables (slides, reports, manuscript text) for overclaims, figure errors, evidence gaps, and narrative bias before they reach a PI or reviewer. Covers 15 failure modes learned from real review cycles.",
      "path": "/Users/wang.13246/.claude/skills/sanity-check",
      "root": "/Users/wang.13246/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "agent-reach",
      "description": "MUST USE when user wants to research/search/look up/find anything on the internet — e.g. \"research this topic\", \"do a deep dive on X\", \"search the web for X\", \"see what people say about X\", \"look this up\". Also MUST USE when user mentions any platform or shares any URL/link: Twitter/X, Reddit, YouTube, GitHub, Bilibili, XiaoHongShu, Xiaoyuzhou Podcast, LinkedIn/jobs/recruiting, V2EX, Xueqiu (stocks), RSS. 13 platforms, multi-backend routing (OpenCLI / per-platform CLIs / APIs). Zero config for 6 channels. Run `agent-reach doctor --json` to see which backend serves each platform right now. NOT for: writing reports/analysis/translation (this skill only FETCHES internet content); posting/commenting/liking (write operations); platforms that already have a dedicated skill installed (prefer that skill).",
      "path": "/Users/wang.13246/.claude/skills/agent-reach",
      "root": "/Users/wang.13246/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "grill-me",
      "description": "Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions \"grill me\".",
      "path": "/Users/wang.13246/.claude/skills/grill-me",
      "root": "/Users/wang.13246/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "behavior",
      "description": "收集行为数据，用 thinking-tools 多视角分析。Use when user says \"分析我的行为\", \"/behavior\".",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/behavior",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "dbs-deconstruct",
      "description": "dontbesilent 概念拆解。用维特根斯坦 + 奥派经济学的方法，把模糊的商业概念拆到原子级别。\n触发方式：/dbs-deconstruct、/拆概念、「帮我拆解这个概念」「这个词到底什么意思」\nConcept deconstruction using Wittgenstein + Austrian economics framework.\nTrigger: /dbs-deconstruct, \"deconstruct this concept\", \"what does this really mean\"",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-deconstruct",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-eb1a-contributions",
      "description": "EB1A Original Contributions guide. Use when writing major significance section or documenting research impact.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-eb1a-contributions",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "translate-invoice",
      "description": "Use when generating translation invoices, pricing CN documents, running invoicing pipeline, or user says \"翻译报价\", \"translation invoice\", \"pricing\", \"/translate-invoice\". Triggers on any invoicing task for EB1A/NIW case exhibits.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/translate-invoice",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "dbskill-upgrade",
      "description": "升级 dbskill 到最新版本",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbskill-upgrade",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "huashu-nuwa",
      "description": "女娲造人：输入人名/主题/甚至只是模糊需求，自动深度调研→思维框架提炼→生成可运行的人物Skill。\n两种入口：(1)明确人名→直接蒸馏 (2)模糊需求→诊断推荐→再蒸馏。\n触发词：「造skill」「蒸馏XX」「女娲」「造人」「XX的思维方式」「做个XX视角」「更新XX的skill」。\n模糊需求也触发：「我想提升决策质量」「有没有一种思维方式能帮我...」「我需要一个思维顾问」。",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/nuwa",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "chatroom-austrian",
      "description": "哈耶克 × 米塞斯 × Codex 三人对话。奥派经济学视角的多角色讨论。\n触发方式：/chatroom-austrian、/奥派、「奥派聊天室」\nAustrian economics chatroom. Hayek × Mises × Codex debate.\nTrigger: /chatroom-austrian, /奥派, \"Austrian chat\"",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/chatroom-austrian",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-rfe",
      "description": "NIW RFE response writing guide. Point-by-point rebuttal methodology, rebuttal pattern catalog from real submitted cases, new evidence integration, and structural guidance for forcing the officer to write from scratch. Triggers on \"RFE response\", \"request for evidence\", \"USCIS asked for more evidence\", \"respond to RFE\", \"horizon-niw-rfe\", \"how to answer RFE\", \"RFE rebuttal\".",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-niw-rfe",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "dbs",
      "description": "dontbesilent 商业工具箱主入口。根据你的问题自动路由到最合适的诊断工具。\n触发方式：/dbs、/商业、「帮我看看」\nMain entry point for dontbesilent business toolkit. Routes to the right diagnostic skill.\nTrigger: /dbs, \"help me with my business\"",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-eb1a-judging",
      "description": "EB1A Judging criterion guide. Use when writing peer review experience section.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-eb1a-judging",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "obsidian-markdown",
      "description": "Create and edit Obsidian Flavored Markdown with wikilinks, embeds, callouts, properties, and other Obsidian-specific syntax. Use when working with .md files in Obsidian, or when the user mentions wikilinks, callouts, frontmatter, tags, embeds, or Obsidian notes.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/obsidian-markdown",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "dbs-diagnosis",
      "description": "dontbesilent 商业模式诊断。两种模式：问诊（消解你的问题）和体检（拆解你的商业模式）。\n触发方式：/dbs-diagnosis、/问诊、「帮我看看商业模式」「诊断一下我的业务」「我有个商业问题」\nBusiness model diagnosis using dontbesilent's ontological framework. Two modes: consultation (dissolve your question) and checkup (analyze your business model).\nTrigger: /dbs-diagnosis, \"diagnose my business model\", \"I have a business question\"",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-diagnosis",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-aao",
      "description": "Search AAO (Administrative Appeals Office) decisions for EB1A/NIW cases. Use when researching USCIS adjudication patterns, case precedents, or denial reasons by field, criteria, or keywords.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-aao",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "horizon-build",
      "description": "Use when building petition DOCX from markdown, generating exhibit PDFs, assembling print packages, or running any step of the petition build pipeline. Triggers on \"build petition\", \"generate docx\", \"run pipeline\", \"assemble exhibits\", \"update page numbers\", \"/horizon-build\".",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-build",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "polanyi",
      "description": "Michael Polanyi 的思维框架与表达方式。基于7本核心著作、30+学术论文、6个维度的深度调研，\n提炼6个核心心智模型、8条决策启发式和完整的表达DNA。\n用途：作为知识传承与学习顾问，用 Polanyi 的视角分析隐性知识传递、技能习得、科学哲学问题。\n当用户提到「用 Polanyi 的视角」「Polanyi 会怎么看」「隐性知识」「tacit knowledge」时使用。\n即使用户只是说「帮我用 Polanyi 的角度想想」「为什么说不清楚」「怎么传承经验」也应触发。",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/polanyi",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "thinking-tools",
      "description": "Use when user says \"think tools\", \"think more ways\", \"deep think\", facing complex problems, or need fresh perspectives. Triggers on \"think more ways\", \"deep think\", \"analyze deeply\", strategic decisions, or when single-perspective analysis isn't enough.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/thinking-tools",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "horizon-eb1a-scholarly-articles",
      "description": "EB1A Scholarly Articles criterion guide. Use when writing publications section or proving venue quality.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-eb1a-scholarly-articles",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "rednote-title",
      "description": "从内容的逻辑根节点生成小红书标题。不描述内容（叶子），而是找到内容存在的原因（根），用一句话表达。\n触发方式：/rednote-title、「帮我想标题」「这篇文章叫什么」\nGenerate Xiaohongshu titles from the logical root of content, not surface description.\nTrigger: /rednote-title, \"help me with the title\", \"what should this be called\"",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/rednote-title",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "horizon",
      "description": "Top-level router for all Horizon green card petition skills (NIW + EB1A + tools). Triggers on \"horizon\", \"green card skill\", \"petition skill\", \"which skill\", \"Prong 1\", \"national importance\", \"PE\", \"proposed endeavor\", \"NIW\", \"well-positioned\", \"balancing\", \"qualifications\", \"publications\", \"peer review\", \"field projects\", \"cover letter\", \"recommendation letter\", \"EB1A\", \"EB-1A\", \"contributions\", \"original contributions\", \"judging\", \"scholarly articles\", \"awards\", \"high salary\", \"final merits\", \"citation analysis\", \"Google Scholar\", \"collect citations\", \"translate exhibits\", \"green-intel\", \"horizon-intel\", \"build petition\", \"generate docx\", \"run pipeline\", \"assemble exhibits\", \"配图\", \"figure\", \"infographic\", \"visualize section\", \"search AAO\", \"case precedent\", \"AAO decision\", \"whitepaper\", \"SOP\", \"internal document\", \"review this\", \"check this section\".",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "rednote-format",
      "description": "Convert Markdown articles with YAML frontmatter into styled HTML pages optimized for Xiaohongshu (小红书), then screenshot to PNG and slice into 9:16 images. Triggers on /rednote-format, 小红书排版, rednote format, 格式化长文.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/rednote-format",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "horizon-intel",
      "description": "Use when running any green-intel pipeline for EB1A/NIW immigration petitions — citation analysis, document translation, AAO decision analysis, RFE response analysis, or translation invoicing. Triggers on \"run green-intel\", \"horizon-intel\", \"citation analysis\", \"Google Scholar pipeline\", \"collect citations\", \"translate exhibits\", \"AAO analysis\", \"RFE analysis\", \"translation invoice\", \"green intel\", or when a Google Scholar profile URL is provided for petition work.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-intel",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "dbs-action",
      "description": "dontbesilent 执行力诊断。用阿德勒心理学框架诊断你「知道该做什么但就是不做」的真正原因。\n触发方式：/dbs-action、/action、「我知道该怎么做但就是不做」「为什么我总是拖延」\nExecution block diagnosis using Adlerian psychology framework.\nTrigger: /dbs-action, \"I know what to do but can't do it\", \"why do I procrastinate\"",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-action",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "obsidian-bases",
      "description": "Create and edit Obsidian Bases (.base files) with views, filters, formulas, and summaries. Use when working with .base files, creating database-like views of notes, or when the user mentions Bases, table views, card views, filters, or formulas in Obsidian.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/obsidian-bases",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "horizon-eb1a-final-merits",
      "description": "Use when writing EB1A final merits determination section (Kazarian step 2), the closing section that argues sustained national/international acclaim and top-of-field standing. Triggers on \"final merits\", \"risen to the top\", \"totality of evidence\", \"step 2\".",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-eb1a-final-merits",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "rednote-case-share",
      "description": "Use when writing 小红书 case share / dp posts for immigration cases (NIW/EB1A). Triggers on \"写案例分享\", \"写dp帖\", \"case share post\", \"/rednote-case-share\".",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/rednote-case-share",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "dbs-xhs-title",
      "description": "小红书标题公式工具。从 75 个验证过的爆款公式中，帮你挑对的、用对的、理解为什么用这个。\n触发方式：/dbs-xhs-title、/小红书标题、「帮我起个小红书标题」「小红书标题公式」\nXiaohongshu title formula tool. Pick the right formula from 75 proven templates.\nTrigger: /dbs-xhs-title, \"xiaohongshu title\", \"RED title formula\"",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-xhs-title",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "dbs-benchmark",
      "description": "dontbesilent 对标分析。用五重过滤法帮你找到值得模仿的对标，排除一切关于「我」的噪音。\n触发方式：/dbs-benchmark、/对标、「帮我找对标」「我该模仿谁」\nBenchmark analysis using dontbesilent's five-filter method.\nTrigger: /dbs-benchmark, \"find me a benchmark\", \"who should I copy\"",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-benchmark",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "dbs-content",
      "description": "dontbesilent 内容创作诊断。选题通过后，诊断怎么把这个选题做成好内容。\n触发方式：/dbs-content、/内容诊断、「这个内容怎么做」「帮我看看这个文案」\nContent creation diagnosis. After topic passes, diagnose how to turn it into good content.\nTrigger: /dbs-content, \"how should I create this content\", \"review my copy\"",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-content",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "editorial-card-screenshot",
      "description": "Generate high-density editorial HTML info cards in a modern magazine and Swiss-international style, then capture them as ratio-specific screenshots. Use when the user provides text or core information and wants: (1) a complete responsive HTML info card, (2) the design to follow the stored editorial prompt, (3) output in fixed visual ratios such as 3:4, 4:3, 1:1, 16:9, 9:16, 2.35:1, 3:1, or 5:2, or (4) both HTML and a rendered PNG cover/card from the same content.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/infocard-skills/skills/editorial-card-screenshot",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "cognitive-hijack",
      "description": "多哲学家视角分析内容的\"认知劫持\"机制。用于优化标题、封面、正文的点击率和互动率。触发词：\"/cognitive-hijack\"、\"分析认知触发\"、\"优化点击率\"",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/cognitive-hijack",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "ob-deep-write",
      "description": "Use when user asks to write in-depth technical articles in Obsidian. Triggers on \"/ob-deep-write\", \"写深度文章\", \"写教程\", \"写指南\". Auto-identifies new concepts for /概念/ folder.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/ob-deep-write",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "horizon-whitepaper",
      "description": "Use when generating professional internal documents (whitepapers, SOPs, system docs, process documentation) as petition exhibits. Triggers on \"write whitepaper\", \"generate SOP\", \"system documentation\", \"internal document\", \"professional document\", \"white paper\".",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-whitepaper",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "diary",
      "description": "Use when generating daily diary with reflection. Triggers on /diary, 写日记, 今天做了什么. Default (no args) backfills missing days in current month (excluding today). Use \"/diary today\" for today only.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/diary",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "horizon-figure",
      "description": "Use when creating infographic JSON prompts for NIW/EB1A petition sections. Triggers on \"配图\", \"figure\", \"infographic\", \"visualize section\".",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-figure",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "dbs-hook",
      "description": "dontbesilent 短视频开头优化。诊断开头问题 + 生成优化方案。\n触发方式：/dbs-hook、/hook、「帮我优化开头」「开头怎么写」\nShort video opening optimization with diagnosis and solutions.\nTrigger: /dbs-hook, \"optimize my opening\", \"how to write opening\"",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/dbs-hook",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "x-article-publisher",
      "description": "Convert Markdown to X Articles format and copy to clipboard. Use when user wants to prepare an article for X, mentions \"publish to X\", \"X article\", or needs Markdown converted for X Articles editor.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/x-article-publisher",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "x-article-figure",
      "description": "Generate cover/figure image prompts for X Articles from article content. Reads the article, infers visual metaphors, outputs structured image generation prompt. Triggers on \"/x-article-figure\", \"article figure\", \"cover image for article\", \"generate figure\".",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/x-article-figure",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "social-writing",
      "description": "Use when writing social media content (小红书/Twitter X). Triggers on \"/social-writing\", \"写小红书\", \"写推特\", \"写X文章\".",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/social-writing",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "horizon-eb1a-awards",
      "description": "EB1A Awards criterion guide. Use when writing awards section or proving award recognition level.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-eb1a-awards",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "youtube-transcript",
      "description": "Extract transcripts from YouTube videos. Use when the user asks for a transcript, subtitles, or captions of a YouTube video and provides a YouTube URL (youtube.com/watch?v=, youtu.be/, or similar). Supports output with or without timestamps.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/youtube-transcript",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "horizon-eb1a-high-salary",
      "description": "EB1A High Salary criterion guide. Use when writing high remuneration section, comparing compensation components, or structuring salary evidence.",
      "path": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills/horizon-eb1a-high-salary",
      "root": "/Users/wang.13246/Dropbox/Obsidian/.agents/skills",
      "retired": false,
      "mirror": true,
      "imported": true
    },
    {
      "name": "academic-writing",
      "description": "Academic manuscript writing assistant for scientific papers. Use when Claude needs to write, edit, or review academic manuscripts following Nature Biotechnology journal standards, with professional formatting and natural prose that avoids AI-generated writing patterns.",
      "path": "/Volumes/Extreme/Project/BioGuider-writing/skills/academic-writing",
      "root": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "doc-coauthoring",
      "description": "Guide users through a structured workflow for co-authoring documentation. Use when user wants to write documentation, proposals, technical specs, decision docs, or similar structured content. This workflow helps users efficiently transfer context, refine content through iteration, and verify the doc works for readers. Trigger when user mentions writing docs, creating proposals, drafting specs, or similar documentation tasks.",
      "path": "/Volumes/Extreme/Project/BioGuider-writing/skills/doc-coauthoring",
      "root": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "docx",
      "description": "Comprehensive document creation, editing, and analysis with support for tracked changes, comments, formatting preservation, and text extraction. When Claude needs to work with professional documents (.docx files) for: (1) Creating new documents, (2) Modifying or editing content, (3) Working with tracked changes, (4) Adding comments, or any other document tasks",
      "path": "/Volumes/Extreme/Project/BioGuider-writing/skills/docx",
      "root": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "pdf",
      "description": "Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale.",
      "path": "/Volumes/Extreme/Project/BioGuider-writing/skills/pdf",
      "root": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "read-docx",
      "description": "Read and extract content from DOCX files. Use when Claude needs to read, analyze, or extract text from .docx files that cannot be read directly as binary files.",
      "path": "/Volumes/Extreme/Project/BioGuider-writing/skills/read-docx",
      "root": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "template-skill",
      "description": "Replace with description of the skill and when Claude should use it.",
      "path": "/Volumes/Extreme/Project/BioGuider-writing/skills/template",
      "root": "/Volumes/Extreme/Project/BioGuider-writing/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "nature-paper2ppt",
      "description": "Build a complete but efficient Nature-style Chinese PPTX presentation from a scientific paper, preprint, PDF, article text, abstract, figure legends, or reading notes. Use this skill whenever the user asks to make slides/PPT/PPTX for journal club, group meeting, paper sharing, thesis seminar, lab meeting, department report, or academic presentation from a research paper, not only medical papers. It identifies the paper type and argument, selects only the figures needed for the story, writes Chinese slide content and speaker notes, creates the actual .pptx deck, and performs lightweight verification with cross-platform Python tooling by default.",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-paper2ppt",
      "root": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "nature-citation",
      "description": "Add strict Nature/CNS citations to manuscript text by splitting long passages into citable segments, searching only accepted flagship and subjournal titles from Nature Portfolio, the AAAS Science family, and Cell Press, filtering by publication time range, and exporting one reference-manager-ready output by default. Use this skill whenever the user asks to input text and automatically get references, add citations to a paragraph/manuscript, find Nature-series or CNS support for statements, create text-to-reference correspondence, \"分段引用\", \"自动给出引用\", \"Nature系列引用\", \"CNS及子刊\", \"支撑文献\", \"补引用\", \"找引用\", or export EndNote/RIS/ENW/Zotero RDF.",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-citation",
      "root": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "nature-data",
      "description": "Prepare, audit, or revise Nature-ready Data Availability statements, data repository plans, dataset citations, and FAIR metadata checklists for manuscripts. Use when the user asks about Nature data availability, research data sharing, repository selection, accession numbers, restricted or sensitive data, source data, supplementary datasets, DataCite-style dataset references, FAIR metadata for academic publication, or Chinese-to-English data availability wording for Chinese-speaking authors preparing Nature-family submissions.",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-data",
      "root": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "nature-response",
      "description": "Draft, audit, or revise point-by-point reviewer response letters for Nature-family manuscript revisions. Use when the user provides reviewer comments, editor decision letters, revision notes, response drafts, or asks how to respond to major/minor revision requests, rebuttal letters, response to reviewers, peer-review reports, 审稿意见回复, 逐点回复, 修回信, 大修回复, 小修回复, or 如何回复 reviewer.",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-response",
      "root": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "nature-writing",
      "description": "Draft, restructure, or plan Nature-style manuscript sections from author-provided claims, results, figures, notes, or Chinese drafts. Use when the user wants to write or rebuild an abstract, introduction, results narrative, discussion, conclusion, title, or full manuscript argument rather than only polish finished prose.",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-writing",
      "root": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "nature-reader",
      "description": "Build full-paper Chinese-English side-by-side, figure/table-aware, source-grounded Markdown readers for journal or conference papers from PDF, DOI, arXiv, publisher HTML, or pasted text. Use whenever the user asks to translate or read a paper, make 中英文对照/原文对照/全文翻译解读, extract figures or tables into the right positions, preserve figure/table placement near relevant prose, or keep exact source anchors for every block. This skill must not degrade into a summary-only output unless the user explicitly asks for a summary.",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-reader",
      "root": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "nature-academic-search",
      "description": "Multi-source literature search, citation verification, MeSH search strategy, citation file management (.nbib/.ris/.bib conversion), and reference management (BibTeX, related articles, ID conversion) via MCP tools (PubMed, CrossRef, arXiv). Use when the user needs coordinated multi-step literature workflows beyond a single MCP call.",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-academic-search",
      "root": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "nature-polishing",
      "description": "Polish, restructure, or translate academic prose into Nature-leaning English using writing-strategy principles, curated Nature/Nature Communications article patterns, and phrase-level support from Academic Phrasebank. Use whenever the user asks to polish a manuscript paragraph, abstract, introduction, results, discussion, conclusion, title, methods section, or Chinese academic draft for publication-quality English.",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-polishing",
      "root": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "nature-figure",
      "description": "Submission-grade Nature/high-impact journal figure workflow for Python or R. Use whenever the user asks to create, revise, audit, or polish manuscript figures, multi-panel scientific plots, figures4papers-style matplotlib plots, or journal-ready SVG/PDF/TIFF outputs, especially for Nature-family or other high-impact journals. Before plotting, define the figure's conclusion, evidence logic, export needs, and review risks. If the user has not chosen Python or R, ask \"Python or R?\" and stop. Use only the selected backend for figure generation, previewing, exporting, and QA. Supports matplotlib/seaborn and ggplot2/patchwork/ComplexHeatmap. Not for dashboards or Illustrator/Figma-first infographics.",
      "path": "/Users/wang.13246/Documents/GitHub/nature-skills/skills/nature-figure",
      "root": "/Users/wang.13246/Documents/GitHub/nature-skills/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "cc-e2e-test",
      "description": "Use when testing MCP agent responses as a real user would, verifying LLM output quality, or before claiming agent features work correctly",
      "path": "/Users/wang.13246/Documents/GitHub/sskind/.claude/skills/cc-e2e-test",
      "root": "/Users/wang.13246/Documents/GitHub/sskind/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "azure-cost-report",
      "description": "Use when generating the monthly Azure cost + usage dashboard for the BMI subscription (or similar). Produces a single-page HTML report in docs/dashboards/azure-cost-{month}-{year}.html. Triggers on \"generate cost report\", \"make the month dashboard\", \"/azure-cost-report\", or a month argument.",
      "path": "/Users/wang.13246/Documents/GitHub/BMI_infra/.claude/skills/azure-cost-report",
      "root": "/Users/wang.13246/Documents/GitHub/BMI_infra/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "optimizing-cloud-costs",
      "description": "Execute use when you need to work with cloud cost optimization.\nThis skill provides cost analysis and optimization with comprehensive guidance and automation.\nTrigger with phrases like \"optimize costs\", \"analyze spending\",\nor \"reduce costs\".",
      "path": "/Users/wang.13246/Documents/GitHub/BMI_infra/.claude/skills/optimizing-cloud-costs",
      "root": "/Users/wang.13246/Documents/GitHub/BMI_infra/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "transcribe",
      "description": "Upload audio/video to Meeting AI for transcription and summarization. Use when user mentions \"transcribe\", \"meeting audio\", \"process recording\", or provides an audio/video file path.",
      "path": "/Users/wang.13246/Documents/GitHub/meeting-ai-web/.claude/skills/transcribe",
      "root": "/Users/wang.13246/Documents/GitHub/meeting-ai-web/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "cairn",
      "description": "Record analysis conclusions as grounded claims while you work. Use this skill continuously during any data-analysis, pipeline, or research session — not as a final step. ORIENT at session start (run `cairn head` to read what is already concluded before acting). AUTHOR the instant you conclude anything — a result, a finding, a \"X is higher than Y\", a decision — with one cheap `cairn add-claim` call; capture it NOW, never batch claims to end-of-session (forgetting is the failure mode). REFRESH with `cairn refresh` after any rerun: `tar_make()`, a re-executed pipeline, regenerated outputs, a re-run script, new model fit, then surface newly-stale claims. PUBLISH (`cairn validate` then `cairn publish`) before sharing findings, sending a link, or handing results to a collaborator. Triggers: \"what do we know so far\", \"where are we\", recording a finding, after rerunning anything, before sharing results, claim graph, grounding evidence.",
      "path": "/Users/wang.13246/Documents/GitHub/cairn/skill/cairn",
      "root": "/Users/wang.13246/Documents/GitHub/cairn/skill",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-peer-review",
      "description": "NIW Prong 2 writing guide for peer review activity and invited presentations.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-peer-review",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-balancing",
      "description": "NIW Prong 3 balancing test writing guide. Arguing the justification for waiving labor certification.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-balancing",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-style-guide",
      "description": "Global writing style guide for NIW petitions.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-style-guide",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-review",
      "description": "NIW multi-perspective review. 6 agents parallel review + orchestrator verdict.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-review",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-recommendation-letter",
      "description": "NIW recommendation letter writing guide. 3 Kill Rules, anti-AI detection, voice test.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-recommendation-letter",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-proposed-endeavor",
      "description": "NIW Proposed Endeavor writing guide. Frame A/B framework, pseudo-concept detection, PE structure template.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-proposed-endeavor",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-publications",
      "description": "NIW Prong 2 writing guide for publication record and citation analysis.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-publications",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-qualifications",
      "description": "NIW Prong 2 writing guide for educational background and professional qualifications.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-qualifications",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-evaluate",
      "description": "NIW qualification screening. Pre-filing assessment with field tier, evidence scoring, and go/no-go verdict.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-evaluate",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-well-positioned",
      "description": "NIW Prong 2 legal standard and section routing. Use to understand what Prong 2 requires and which skill handles each section.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-well-positioned",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-national-importance",
      "description": "NIW Prong 1b national importance writing guide. 5-atom breakdown, Prospective Bridge, Dependency Inversion.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-national-importance",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-field-projects",
      "description": "NIW Prong 2 writing guide for field projects and industry impact.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-field-projects",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw",
      "description": "NIW petition writing toolkit entry point. Routes to the right skill based on user intent.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    },
    {
      "name": "horizon-niw-cover-letter",
      "description": "NIW Cover Letter writing guide.",
      "path": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills/horizon-niw-cover-letter",
      "root": "/Users/wang.13246/Library/CloudStorage/Dropbox/Obsidian/.claude/skills",
      "retired": false,
      "mirror": false,
      "imported": true
    }
  ],
  "newCandidates": [],
  "duplicateGroups": []
};

export const realStatus: StatusReport = {
  "projectRoot": "/Users/wang.13246/Documents/GitHub/skillshelf-ui",
  "skillsDir": "/Users/wang.13246/Documents/GitHub/skillshelf-ui/.claude/skills",
  "skillsDirExists": false,
  "linkedCount": 0,
  "unmanaged": [],
  "bundles": [],
  "linked": []
};
