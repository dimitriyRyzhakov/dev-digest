import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { FflateSkillArchive } from '../src/adapters/skill-archive/index.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { SkillStore } from '../src/modules/skills/ports.js';

const SKILL_MD = '---\nname: api-versioning-gate\ndescription: Flag unversioned API changes.\n---\n# Gate\nBody';

function demoZip(): Uint8Array {
  return zipSync({
    'api-versioning-gate/SKILL.md': strToU8(SKILL_MD),
    'api-versioning-gate/reference.md': strToU8('# Ref'),
    'api-versioning-gate/scripts/check.sh': strToU8('#!/bin/sh\necho hi'),
  });
}

/** A store that fails the test if the preview tries to persist anything. */
const noWrites: SkillStore = {
  list: async () => [],
  get: async () => undefined,
  getByName: async () => undefined,
  create: async () => {
    throw new Error('preview must not write');
  },
  update: async () => {
    throw new Error('preview must not write');
  },
  delete: async () => {
    throw new Error('preview must not write');
  },
  listVersions: async () => undefined,
  stats: async () => undefined,
};

describe('FflateSkillArchive', () => {
  const archive = new FflateSkillArchive();

  it('lists entries without inflating them', () => {
    const paths = archive.listEntries(demoZip()).map((e) => e.path).sort();
    expect(paths).toEqual([
      'api-versioning-gate/SKILL.md',
      'api-versioning-gate/reference.md',
      'api-versioning-gate/scripts/check.sh',
    ]);
  });

  it('reads exactly the requested entry as UTF-8', () => {
    expect(archive.readText(demoZip(), 'api-versioning-gate/SKILL.md', 64 * 1024)).toBe(SKILL_MD);
  });

  it('refuses an entry larger than the limit', () => {
    expect(() => archive.readText(demoZip(), 'api-versioning-gate/SKILL.md', 10)).toThrow(/too large/);
  });

  it('rejects bytes that are not a zip', () => {
    expect(() => archive.listEntries(strToU8('not a zip at all'))).toThrow(/valid \.zip/);
  });
});

describe('SkillsService.previewImport', () => {
  const service = new SkillsService({ store: noWrites, archive: new FflateSkillArchive() });
  const b64 = (u8: Uint8Array) => Buffer.from(u8).toString('base64');

  it('turns a zip into a draft and lists the script as ignored (nothing persisted)', () => {
    const preview = service.previewImport('gate.zip', b64(demoZip()));
    expect(preview.name).toBe('api-versioning-gate');
    expect(preview.description).toBe('Flag unversioned API changes.');
    expect(preview.body).toBe('# Gate\nBody');
    expect(preview.source_file).toBe('gate.zip:api-versioning-gate/SKILL.md');
    expect(preview.ignored_files).toEqual([
      { path: 'api-versioning-gate/reference.md', reason: 'extra markdown — not imported' },
      { path: 'api-versioning-gate/scripts/check.sh', reason: 'executable directory — never run' },
    ]);
  });

  it('turns a markdown file into a draft', () => {
    const preview = service.previewImport('rule.md', b64(strToU8('# Rule\nDo X')));
    expect(preview.name).toBe('Rule');
    expect(preview.ignored_files).toEqual([]);
    expect(preview.warnings[0]).toMatch(/No description/);
  });

  it('rejects an oversized upload', () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    expect(() => service.previewImport('big.md', b64(big))).toThrow(/too large/);
  });
});
