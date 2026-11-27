import { describe, it, expect } from 'vitest';
import {
  classifyArchiveEntry,
  detectUploadKind,
  parseFrontmatter,
  parseSkillMarkdown,
  planArchiveImport,
  SKILL_IMPORT_LIMITS,
} from '../src/modules/skills/domain.js';

describe('skills domain — markdown parsing', () => {
  it('reads name / description / type from frontmatter and strips it from the body', () => {
    const parsed = parseSkillMarkdown(
      '---\nname: api-route-breaking-change\ndescription: "Flag breaking route changes."\ntype: convention\n---\n# Rule\nBody text',
      'api.md',
    );
    expect(parsed.name).toBe('api-route-breaking-change');
    expect(parsed.description).toBe('Flag breaking route changes.');
    expect(parsed.type).toBe('convention');
    expect(parsed.body).toBe('# Rule\nBody text');
    expect(parsed.warnings).toEqual([]);
  });

  it('supports folded block descriptions', () => {
    const { fields } = parseFrontmatter('---\ndescription: >\n  Use when tests\n  change.\nname: x\n---\nbody');
    expect(fields.description).toBe('Use when tests change.');
    expect(fields.name).toBe('x');
  });

  it('falls back to the heading, then the folder of SKILL.md, then the file name', () => {
    expect(parseSkillMarkdown('# Heading name\nbody', 'x.md').name).toBe('Heading name');
    expect(parseSkillMarkdown('just body', 'gate/SKILL.md').name).toBe('gate');
    expect(parseSkillMarkdown('just body', 'my-skill.md').name).toBe('my-skill');
  });

  it('warns when there is no description and defaults the type to custom', () => {
    const parsed = parseSkillMarkdown('body', 'x.md');
    expect(parsed.description).toBe('');
    expect(parsed.type).toBe('custom');
    expect(parsed.warnings[0]).toMatch(/No description/);
  });

  it('rejects an empty body', () => {
    expect(() => parseSkillMarkdown('---\nname: a\n---\n   ', 'a.md')).toThrow(/no body/);
  });
});

describe('skills domain — uploads and archives', () => {
  it('detects the upload kind by extension, then by zip magic', () => {
    expect(detectUploadKind('a.md', new Uint8Array())).toBe('markdown');
    expect(detectUploadKind('a.zip', new Uint8Array())).toBe('zip');
    expect(detectUploadKind('blob', new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('zip');
    expect(() => detectUploadKind('a.exe', new Uint8Array([1]))).toThrow(/Unsupported/);
  });

  it('never treats executables or script dirs as skill files', () => {
    expect(classifyArchiveEntry({ path: 'gate/scripts/check.md', size: 1 })).toMatchObject({ kind: 'ignored' });
    expect(classifyArchiveEntry({ path: 'gate/run.sh', size: 1 })).toMatchObject({ kind: 'ignored' });
    expect(classifyArchiveEntry({ path: 'gate/tool.py', size: 1 })).toMatchObject({ kind: 'ignored' });
    expect(classifyArchiveEntry({ path: '__MACOSX/._SKILL.md', size: 1 })).toMatchObject({ kind: 'ignored' });
    expect(classifyArchiveEntry({ path: 'gate/SKILL.md', size: 10 })).toEqual({ kind: 'markdown' });
  });

  it('picks the shallowest SKILL.md and lists every other file as ignored', () => {
    const plan = planArchiveImport([
      { path: 'gate/SKILL.md', size: 10 },
      { path: 'gate/nested/SKILL.md', size: 10 },
      { path: 'gate/reference.md', size: 10 },
      { path: 'gate/scripts/check.sh', size: 10 },
    ]);
    expect(plan.skillPath).toBe('gate/SKILL.md');
    expect(plan.ignored.map((i) => i.path)).toEqual([
      'gate/nested/SKILL.md',
      'gate/reference.md',
      'gate/scripts/check.sh',
    ]);
    expect(plan.ignored.find((i) => i.path.endsWith('check.sh'))!.reason).toMatch(/never run/);
  });

  it('uses the only markdown file when there is no SKILL.md, and fails when ambiguous', () => {
    expect(planArchiveImport([{ path: 'rule.md', size: 1 }]).skillPath).toBe('rule.md');
    expect(() => planArchiveImport([{ path: 'a.md', size: 1 }, { path: 'b.md', size: 1 }])).toThrow(/no SKILL.md/);
    expect(() => planArchiveImport([{ path: 'run.sh', size: 1 }])).toThrow(/no markdown/);
  });

  it('rejects archives whose declared unpacked size is too large (zip bomb)', () => {
    expect(() =>
      planArchiveImport([
        { path: 'SKILL.md', size: 10 },
        { path: 'big.bin', size: SKILL_IMPORT_LIMITS.maxTotalUncompressedBytes },
      ]),
    ).toThrow(/too large/);
  });
});
