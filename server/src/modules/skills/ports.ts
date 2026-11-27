import type {
  Skill,
  SkillArchiveReader,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';

/**
 * Ports for the skills use cases. The repository implements `SkillStore`; the
 * zip adapter implements `SkillArchiveReader` (declared in vendor/shared so the
 * adapter never imports this module). Wired in platform/container.ts.
 */

export interface NewSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source: SkillSource;
  /** Defaults to true. */
  enabled?: boolean;
  /** Evidence paths for an extracted skill (conventions). */
  evidenceFiles?: string[];
}

export interface SkillChanges {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[];
}

export interface SkillStore {
  list(workspaceId: string): Promise<Skill[]>;
  get(workspaceId: string, id: string): Promise<Skill | undefined>;
  getByName(workspaceId: string, name: string): Promise<Skill | undefined>;
  /** Insert the skill and its version-1 snapshot. Duplicate name → ConflictError. */
  create(workspaceId: string, skill: NewSkill): Promise<Skill>;
  /**
   * Apply changes. When `newVersion` is set, store it on the skill and snapshot
   * the body into skill_versions in the same transaction. Duplicate name → ConflictError.
   */
  update(
    workspaceId: string,
    id: string,
    changes: SkillChanges,
    newVersion?: number,
  ): Promise<Skill | undefined>;
  delete(workspaceId: string, id: string): Promise<boolean>;
  /** Body snapshots, newest first. Undefined when the skill is not in the workspace. */
  listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined>;
  /** Linked agents + usage counted from run traces. Undefined when the skill is not in the workspace. */
  stats(workspaceId: string, id: string): Promise<SkillStats | undefined>;
}

export interface SkillsDeps {
  store: SkillStore;
  archive: SkillArchiveReader;
}
