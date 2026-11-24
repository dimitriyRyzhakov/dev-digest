import type {
  Skill,
  SkillImportPreview,
  SkillInput,
  SkillPatch,
  SkillStats,
  SkillVersion,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  SKILL_IMPORT_LIMITS,
  detectUploadKind,
  parseSkillMarkdown,
  planArchiveImport,
} from './domain.js';
import type { SkillsDeps } from './ports.js';

/**
 * Skills use cases (M2): CRUD over workspace skills with body versioning, and
 * the import preview. A preview parses the upload IN MEMORY and returns an
 * editable draft — it never writes; saving is a normal create after the user
 * confirms. From an archive only one markdown file is inflated; scripts and
 * other files are listed as ignored and never unpacked or run.
 */
export class SkillsService {
  constructor(private deps: SkillsDeps) {}

  list(workspaceId: string): Promise<Skill[]> {
    return this.deps.store.list(workspaceId);
  }

  get(workspaceId: string, id: string): Promise<Skill | undefined> {
    return this.deps.store.get(workspaceId, id);
  }

  create(workspaceId: string, input: SkillInput): Promise<Skill> {
    return this.deps.store.create(workspaceId, {
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      source: input.source ?? 'manual',
    });
  }

  /** A changed body bumps the version and snapshots it; other fields don't. */
  async update(workspaceId: string, id: string, patch: SkillPatch): Promise<Skill | undefined> {
    const existing = await this.deps.store.get(workspaceId, id);
    if (!existing) return undefined;
    // An empty patch is a no-op (Drizzle rejects an empty SET).
    if (Object.values(patch).every((v) => v === undefined)) return existing;
    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    return this.deps.store.update(
      workspaceId,
      id,
      {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      },
      bodyChanged ? existing.version + 1 : undefined,
    );
  }

  delete(workspaceId: string, id: string): Promise<boolean> {
    return this.deps.store.delete(workspaceId, id);
  }

  /** Version history, newest first; undefined when the skill is not in the workspace. */
  versions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    return this.deps.store.listVersions(workspaceId, id);
  }

  /** Linked agents and 30-day usage; undefined when the skill is not in the workspace. */
  stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    return this.deps.store.stats(workspaceId, id);
  }

  /** Parse an uploaded `.md` / `.zip` (base64) into a draft. Persists nothing. */
  previewImport(filename: string, contentBase64: string): SkillImportPreview {
    const bytes = new Uint8Array(Buffer.from(contentBase64, 'base64'));
    if (bytes.length === 0) throw new ValidationError('The file is empty');
    if (bytes.length > SKILL_IMPORT_LIMITS.maxUploadBytes) {
      throw new ValidationError('The file is too large (max 2 MB)');
    }

    if (detectUploadKind(filename, bytes) === 'markdown') {
      if (bytes.length > SKILL_IMPORT_LIMITS.maxSkillFileBytes) {
        throw new ValidationError('The markdown file is too large (max 64 KB)');
      }
      const text = decodeUtf8(bytes);
      const parsed = parseSkillMarkdown(text, filename);
      return { ...parsed, source_file: filename, ignored_files: [] };
    }

    const plan = planArchiveImport(this.deps.archive.listEntries(bytes));
    const text = this.deps.archive.readText(
      bytes,
      plan.skillPath,
      SKILL_IMPORT_LIMITS.maxSkillFileBytes,
    );
    const parsed = parseSkillMarkdown(text, plan.skillPath);
    return { ...parsed, source_file: `${filename}:${plan.skillPath}`, ignored_files: plan.ignored };
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ValidationError('The file is not valid UTF-8 text');
  }
}
