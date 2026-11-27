import { SkillType } from '@devdigest/shared';
import type { IgnoredSkillFile, SkillArchiveEntry } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';

/**
 * Pure import rules for skills (M2). A skill is TEXT ONLY: from an archive we
 * read exactly one markdown file and list everything else as ignored. Nothing
 * here touches the archive bytes — the adapter does, behind SkillArchiveReader.
 */

export const SKILL_IMPORT_LIMITS = {
  /** Raw upload (decoded) size cap — .md or .zip. */
  maxUploadBytes: 2 * 1024 * 1024,
  /** Max entries listed in an archive's directory. */
  maxEntries: 200,
  /** Sum of DECLARED uncompressed sizes — zip-bomb guard before any inflate. */
  maxTotalUncompressedBytes: 10 * 1024 * 1024,
  /** The one markdown file we actually read. */
  maxSkillFileBytes: 64 * 1024,
} as const;

const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;

const EXECUTABLE_EXTENSIONS = new Set([
  'sh', 'bash', 'zsh', 'fish', 'py', 'js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx',
  'rb', 'pl', 'php', 'ps1', 'psm1', 'bat', 'cmd', 'com', 'exe', 'bin', 'so', 'dll', 'dylib',
  'jar', 'class', 'wasm', 'app', 'msi', 'deb', 'rpm', 'apk', 'run', 'command',
]);
const EXECUTABLE_DIRS = new Set(['scripts', 'bin']);
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown']);
const SKILL_FILE_NAME = 'skill.md';

export type SkillUploadKind = 'markdown' | 'zip';

function extensionOf(path: string): string {
  const base = path.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Decide how to read an upload: by extension, with the zip magic number as a fallback. */
export function detectUploadKind(filename: string, bytes: Uint8Array): SkillUploadKind {
  const ext = extensionOf(filename);
  if (ext === 'zip') return 'zip';
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown';
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (isZip) return 'zip';
  throw new ValidationError('Unsupported file: upload a .md file or a .zip archive');
}

export type EntryClass = { kind: 'markdown' } | { kind: 'ignored'; reason: string };

/** Classify one archive file entry. Only markdown is ever a candidate. */
export function classifyArchiveEntry(entry: SkillArchiveEntry): EntryClass {
  const segments = entry.path.split('/').filter((s) => s.length > 0);
  const name = segments[segments.length - 1] ?? '';
  if (segments.includes('__MACOSX') || name.startsWith('.')) {
    return { kind: 'ignored', reason: 'metadata file' };
  }
  if (segments.slice(0, -1).some((s) => EXECUTABLE_DIRS.has(s.toLowerCase()))) {
    return { kind: 'ignored', reason: 'executable directory — never run' };
  }
  const ext = extensionOf(entry.path);
  if (EXECUTABLE_EXTENSIONS.has(ext)) {
    return { kind: 'ignored', reason: 'executable file — never run' };
  }
  if (!MARKDOWN_EXTENSIONS.has(ext)) {
    return { kind: 'ignored', reason: 'not a markdown file — only text is imported' };
  }
  if (entry.size > SKILL_IMPORT_LIMITS.maxSkillFileBytes) {
    return { kind: 'ignored', reason: 'markdown file too large' };
  }
  return { kind: 'markdown' };
}

export interface ArchivePlan {
  /** The single markdown entry to read. */
  skillPath: string;
  ignored: IgnoredSkillFile[];
}

/**
 * Pick the skill file from an archive listing: the shallowest `SKILL.md`, else
 * the only markdown file. Every other entry is reported as ignored.
 */
export function planArchiveImport(entries: SkillArchiveEntry[]): ArchivePlan {
  if (entries.length > SKILL_IMPORT_LIMITS.maxEntries) {
    throw new ValidationError(`Archive has too many files (max ${SKILL_IMPORT_LIMITS.maxEntries})`);
  }
  const declared = entries.reduce((n, e) => n + e.size, 0);
  if (declared > SKILL_IMPORT_LIMITS.maxTotalUncompressedBytes) {
    throw new ValidationError('Archive is too large when unpacked');
  }

  const ignored: IgnoredSkillFile[] = [];
  const markdown: SkillArchiveEntry[] = [];
  for (const entry of entries) {
    const cls = classifyArchiveEntry(entry);
    if (cls.kind === 'markdown') markdown.push(entry);
    else ignored.push({ path: entry.path, reason: cls.reason });
  }

  const depth = (p: string) => p.split('/').length;
  const skillFiles = markdown
    .filter((e) => baseName(e.path).toLowerCase() === SKILL_FILE_NAME)
    .sort((a, b) => depth(a.path) - depth(b.path));
  const chosen = skillFiles[0] ?? (markdown.length === 1 ? markdown[0] : undefined);
  if (!chosen) {
    throw new ValidationError(
      markdown.length === 0
        ? 'Archive has no markdown skill file (expected SKILL.md)'
        : 'Archive has several markdown files but no SKILL.md — cannot tell which one is the skill',
    );
  }
  for (const e of markdown) {
    if (e !== chosen) ignored.push({ path: e.path, reason: 'extra markdown — not imported' });
  }
  ignored.sort((a, b) => a.path.localeCompare(b.path));
  return { skillPath: chosen.path, ignored };
}

export interface ParsedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  warnings: string[];
}

const FRONTMATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Minimal frontmatter reader: top-level `key: value` pairs, quoted values, and
 * `>` / `|` block scalars (indented continuation lines). Enough for the
 * Agent-Skill `name` / `description` header; anything else is ignored.
 */
export function parseFrontmatter(text: string): { fields: Record<string, string>; body: string } {
  const match = FRONTMATTER.exec(text);
  if (!match) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  const lines = match[1]!.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]!);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const raw = m[2]!.trim();
    if (raw === '>' || raw === '|' || raw === '>-' || raw === '|-') {
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) block.push(lines[++i]!.trim());
      fields[key] = block.join(raw.startsWith('>') ? ' ' : '\n');
    } else {
      fields[key] = unquote(raw);
    }
  }
  return { fields, body: text.slice(match[0].length) };
}

function nameFromFilename(filename: string): string {
  const base = baseName(filename);
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base).trim();
}

/**
 * Turn a markdown skill file into an editable draft. Name: frontmatter → first
 * `# heading` → file name (for SKILL.md: the folder name). Description:
 * frontmatter, else empty with a warning (the user must write it).
 */
export function parseSkillMarkdown(text: string, sourcePath: string): ParsedSkill {
  const warnings: string[] = [];
  const { fields, body: rawBody } = parseFrontmatter(text);
  const body = rawBody.trim();
  if (body.length === 0) throw new ValidationError('Skill file has no body');

  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  const segments = sourcePath.split('/').filter(Boolean);
  const isSkillFile = baseName(sourcePath).toLowerCase() === SKILL_FILE_NAME;
  const folderName = isSkillFile && segments.length > 1 ? segments[segments.length - 2] : undefined;
  let name = (fields.name || heading || folderName || nameFromFilename(sourcePath)).trim();
  if (name.length > NAME_MAX) {
    name = name.slice(0, NAME_MAX);
    warnings.push(`Name was cut to ${NAME_MAX} characters`);
  }

  let description = (fields.description ?? '').trim();
  if (description.length === 0) {
    warnings.push('No description found — write one as a directive before saving');
  } else if (description.length > DESCRIPTION_MAX) {
    description = description.slice(0, DESCRIPTION_MAX);
    warnings.push(`Description was cut to ${DESCRIPTION_MAX} characters`);
  }

  const parsedType = SkillType.safeParse(fields.type);
  return {
    name,
    description,
    type: parsedType.success ? parsedType.data : 'custom',
    body,
    warnings,
  };
}
