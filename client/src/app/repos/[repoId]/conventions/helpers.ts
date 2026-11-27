/* Pure helpers for the Conventions route (L1: no React, no I/O, no i18n runtime —
   translated text is passed in). Shared by the view, the cards and the skill modal. */
import type { ConventionCandidate } from "@/lib/types";

/** `path:start-end` (or `path:line`, or just `path` when the range is unknown). */
export function evidenceLocation(c: Pick<ConventionCandidate, "evidence_path" | "evidence_start_line" | "evidence_end_line">): string {
  const start = c.evidence_start_line;
  const end = c.evidence_end_line;
  if (start == null) return c.evidence_path;
  if (end == null || end === start) return `${c.evidence_path}:${start}`;
  return `${c.evidence_path}:${start}-${end}`;
}

/** Default skill name for a repo: `<repo>-conventions`. */
export function defaultSkillName(repoName: string): string {
  return `${repoName}-conventions`;
}

/** kebab-case slug for a rule heading (max 6 words), e.g. "Always use async/await …" → "always-use-async-await". */
export function slugifyRule(rule: string): string {
  const slug = rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join("-");
  return slug || "rule";
}

const LANG_BY_EXT: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  py: "python",
  go: "go",
  rb: "ruby",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  cs: "csharp",
  php: "php",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  sql: "sql",
  css: "css",
  md: "md",
};

/** Code-fence language from the file extension ("" when unknown). */
export function fenceLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return path.includes(".") ? LANG_BY_EXT[ext] ?? "" : "";
}

export interface SkillBodyText {
  /** One-line directive under the title (already interpolated with the repo name). */
  intro: string;
  /** "Detected in `{location}`:" line for one rule. */
  detectedIn: (location: string) => string;
}

/**
 * Markdown body of the merged skill: title, directive, then per accepted
 * candidate a `## slug` section with the rule and its evidence snippet.
 */
export function buildSkillBody(name: string, accepted: ConventionCandidate[], text: SkillBodyText): string {
  const parts = [`# ${name}`, text.intro];
  const used = new Map<string, number>();
  for (const c of accepted) {
    const base = slugifyRule(c.rule);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const slug = n === 1 ? base : `${base}-${n}`;
    const fence = fenceFor(c.evidence_snippet);
    parts.push(
      [
        `## ${slug}`,
        c.rule.trim(),
        "",
        text.detectedIn(evidenceLocation(c)),
        `${fence}${fenceLang(c.evidence_path)}`,
        c.evidence_snippet.replace(/\s+$/, ""),
        fence,
      ].join("\n"),
    );
  }
  return parts.join("\n\n") + "\n";
}

/**
 * A code fence that the snippet cannot close: one backtick longer than the
 * longest backtick run inside it (min 3). The snippet is untrusted repo text
 * and the skill body goes into reviewer system prompts, so a stray ``` must
 * not turn the rest of the snippet into prompt markdown.
 */
export function fenceFor(snippet: string): string {
  const longest = Math.max(0, ...(snippet.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/** Accepted candidates, in list order. */
export function acceptedOnly(candidates: ConventionCandidate[]): ConventionCandidate[] {
  return candidates.filter((c) => c.status === "accepted");
}

/** Confidence tone for the bar: ok ≥ 85%, warn ≥ 65%, else crit. */
export function confidenceTone(confidence: number): "ok" | "warn" | "crit" {
  if (confidence >= 0.85) return "ok";
  if (confidence >= 0.65) return "warn";
  return "crit";
}
