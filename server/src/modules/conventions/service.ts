import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionList,
  ConventionPatch,
  ConventionSkillInput,
} from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  CONFIG_FILES,
  CONVENTION_LIMITS,
  ConventionExtraction,
  buildExtractionMessages,
  calibrateConfidence,
  capPerFile,
  dedupeRules,
  evidenceFromFile,
  diversifySamples,
  locateSnippet,
  normalizeCategory,
  type RepoFile,
} from './domain.js';
import type { ConventionRepoRef, ConventionsDeps, NewConvention } from './ports.js';

/** Read cap per input file; the prompt gets a truncated view, grounding the full read. */
const MAX_INPUT_FILE_BYTES = 512 * 1024;

/**
 * Conventions extractor use cases (M2). One run: code picks the files (config
 * files + ranked samples), the model is called ONCE, code grounds every
 * candidate against the real file and drops the rest before any write. The
 * user then curates candidates and merges the accepted ones into one skill.
 */
export class ConventionsService {
  constructor(private deps: ConventionsDeps) {}

  async list(workspaceId: string, repoId: string): Promise<ConventionList> {
    await this.repoOrThrow(workspaceId, repoId);
    const [candidates, sampleFiles] = await Promise.all([
      this.deps.store.list(workspaceId, repoId),
      this.deps.store.lastScanSampleFiles(workspaceId, repoId),
    ]);
    return { candidates, last_scan_at: lastScanAt(candidates), sample_files: sampleFiles };
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const repo = await this.repoOrThrow(workspaceId, repoId);
    const clonePath = repo.clonePath;
    if (!clonePath) {
      throw new AppError('repo_not_cloned', 'The repository has not been cloned yet', 409);
    }

    // 1. Input — picked by code, no model.
    const configs = await this.readAll(clonePath, [...CONFIG_FILES]);
    const pool = await this.deps.samples(
      repo.id,
      CONVENTION_LIMITS.sampleFiles * CONVENTION_LIMITS.samplePoolFactor,
    );
    const samplePaths = diversifySamples(
      pool,
      CONVENTION_LIMITS.sampleFiles,
      CONVENTION_LIMITS.maxSamplesPerDir,
    );
    const samples = await this.readAll(clonePath, samplePaths);
    // Only files the model actually saw may be cited: a hallucinated or
    // prompt-injected path to an unsent file (e.g. `.env`) is never read.
    const provided = new Map([...configs, ...samples].map((f) => [f.path, f.content]));

    // 2. Exactly one model call.
    const { provider, model } = await this.deps.resolveModel(workspaceId);
    const llm = await this.deps.llm(provider);
    const result = await llm.completeStructured({
      model,
      schema: ConventionExtraction,
      schemaName: 'ConventionExtraction',
      messages: buildExtractionMessages(repo.fullName, configs, samples),
      temperature: 0,
      maxRetries: 1,
    });

    // 3. Grounding — the cited file must be one we sent, and contain the snippet.
    const grounded: NewConvention[] = [];
    for (const c of result.data.candidates) {
      const path = normalizePath(c.evidence_path);
      const content = provided.get(path);
      if (!content) continue;
      const at = locateSnippet(content, c.evidence_snippet);
      if (!at) continue;
      // Support = evidence file + other files the model saw it in (only files we sent).
      const support = new Set([path]);
      for (const other of c.also_seen_in ?? []) {
        const p = normalizePath(other);
        if (provided.has(p)) support.add(p);
      }
      const evidence = evidenceFromFile(content, at);
      grounded.push({
        rule: c.rule.trim(),
        evidencePath: path,
        evidenceSnippet: evidence.snippet,
        evidenceStartLine: evidence.start,
        evidenceEndLine: evidence.end,
        confidence: calibrateConfidence(c.confidence, support.size),
        category: normalizeCategory(c.category),
        sampleFiles: provided.size,
      });
    }

    // 4. Store — accepted candidates survive; no duplicate of an accepted rule.
    const existing = await this.deps.store.list(workspaceId, repo.id);
    const acceptedRules = existing.filter((c) => c.status === 'accepted').map((c) => c.rule);
    const fresh = capPerFile(
      // Strongest first, so the per-file cap keeps the best-supported rules.
      dedupeRules(
        [...grounded].sort((a, b) => b.confidence - a.confidence),
        acceptedRules,
      ),
      CONVENTION_LIMITS.maxCandidatesPerFile,
    );
    await this.deps.store.replaceAfterScan(workspaceId, repo.id, fresh);

    const candidates = await this.deps.store.list(workspaceId, repo.id);
    return {
      candidates,
      dropped: result.data.candidates.length - grounded.length,
      cost_usd: result.costUsd,
      // `dropped` counts only ungrounded candidates; duplicates and per-file
      // overflow are expected curation, not missing evidence.
    };
  }

  async patch(
    workspaceId: string,
    id: string,
    patch: ConventionPatch,
  ): Promise<ConventionCandidate | undefined> {
    return this.deps.store.update(workspaceId, id, {
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    });
  }

  /** Merge the repo's accepted candidates into one `convention` / `extracted` skill. */
  async saveSkill(workspaceId: string, repoId: string, input: ConventionSkillInput) {
    await this.repoOrThrow(workspaceId, repoId);
    const accepted = (await this.deps.store.list(workspaceId, repoId)).filter(
      (c) => c.status === 'accepted',
    );
    if (accepted.length === 0) {
      throw new ValidationError('Accept at least one convention before creating a skill');
    }
    const evidenceFiles = [...new Set(accepted.map((c) => c.evidence_path).filter(Boolean))];
    return this.deps.skills.upsertExtracted(workspaceId, { ...input, evidenceFiles });
  }

  private async repoOrThrow(workspaceId: string, repoId: string): Promise<ConventionRepoRef> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private async readAll(clonePath: string, paths: string[]): Promise<RepoFile[]> {
    const out: RepoFile[] = [];
    for (const path of paths) {
      const content = await this.deps.readFile(clonePath, path, { maxBytes: MAX_INPUT_FILE_BYTES });
      if (content !== null && content.trim() !== '') out.push({ path, content });
    }
    return out;
  }
}

function lastScanAt(candidates: ConventionCandidate[]): string | null {
  let max: string | null = null;
  for (const c of candidates) if (!max || c.created_at > max) max = c.created_at;
  return max;
}

/** Repo-relative path as the model may write it (`./a/b.ts`, `/a/b.ts`). */
function normalizePath(path: string): string {
  return path.trim().replace(/^\.?\//, '');
}
