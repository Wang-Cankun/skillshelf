import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github.css";
import { stripFrontmatter } from "../lib/derive";
import { MONO } from "../lib/tokens";

export default function FilePreview({ body, file }: { body: string; file: string }) {
  if (!file.toLowerCase().endsWith(".md")) {
    return <CodeView code={body} file={file} />;
  }
  return (
    <div className="md-body" style={{ maxWidth: 760 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {stripFrontmatter(body)}
      </ReactMarkdown>
    </div>
  );
}

// File extension → highlight.js language. Unmapped extensions render plain
// (no auto-detect — predictable beats clever for lockfiles / unknown text).
const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  css: "css",
  scss: "scss",
  less: "less",
  html: "xml",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  lua: "lua",
  r: "r",
  pl: "perl",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

function CodeView({ code, file }: { code: string; file: string }) {
  const base = file.split("/").pop() ?? file;
  const ext = (base.includes(".") ? base.split(".").pop()! : base).toLowerCase();
  const lang = EXT_LANG[ext];
  const html = useMemo(() => {
    if (!lang || !hljs.getLanguage(lang)) return null;
    try {
      return hljs.highlight(code, { language: lang }).value;
    } catch {
      return null;
    }
  }, [code, lang]);
  const preStyle: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: 11.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "#3F3F46",
    lineHeight: 1.6,
    margin: 0,
    background: "transparent",
  };
  if (html) {
    return (
      <pre style={preStyle}>
        <code
          className="hljs"
          style={{ background: "transparent", padding: 0 }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    );
  }
  return <pre style={preStyle}>{code}</pre>;
}
