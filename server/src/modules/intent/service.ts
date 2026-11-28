import { createHash } from 'node:crypto';
import type {
  GitHubClient,
  IntentSource,
  IntentTraceSnapshot,
  IntentUnresolvedRef,
  PrIntentRecord,
  PrIntentResponse,
  UnifiedDiff,
} from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import {
  INTENT_LIMITS,
  INTENT_PROMPT_VERSION,
  PrIntentClassification,
  addedFileFromDiff,
  buildIntentMessages,
  calibrateIntentConfidence,
  canonicalIntentInput,
  deriveRiskAreas,
  groundSignals,
  mergeRiskAreas,
  parseSpecLinks,
  parseTicketRefs,
  raceTimeout,
  stripHtmlComments,
  toIntentTraceSnapshot,
  toPromptIntent,
  type IntentInputs,
  type PromptIntentShape,
  type TicketRef,
} from './domain.js';
import type { IntentDeps, IntentLog, IntentPullRef, IntentRepoRef } from './ports.js';

/** The intent a review run uses: the persisted record + whether it came from cache. */
export type ResolvedIntent = PrIntentRecord & { cached: boolean };

export interface ResolveForReviewInput {
  workspaceId: string;
  pull: IntentPullRef;
  repo: IntentRepoRef;
  diff: UnifiedDiff;
  log: IntentLog;
}

function clip(s: string, max: number): { text: string; truncated: boolean } {
  return s.length > max ? { text: s.slice(0, max), truncated: true } : { text: s, truncated: false };
}

function kb(chars: number): string {
  return `${(chars / 1024).toFixed(1)} KB`;
}

function dedupeUnresolved(refs: IntentUnresolvedRef[]): IntentUnresolvedRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.kind}:${r.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Intent use cases (M3). `resolveForReview` is the shared pre-step of a review
 * run: code collects the inputs (title, description, same-repo tickets and
 * spec files parsed from PR text — never from model output), the classifier
 * is called at most ONCE (skipped on a cache hit by input hash), and code
 * grounds the signals and calibrates the confidence before persisting.
 */
export class IntentService {
  constructor(private deps: IntentDeps) {}

  /** The engine's PromptIntent for a resolved record (PrIntentResolver port). */
  toPromptIntent(intent: ResolvedIntent): PromptIntentShape {
    return toPromptIntent(intent);
  }

  /** The run trace's `intent` snapshot (PrIntentResolver port). */
  toTraceSnapshot(intent: ResolvedIntent): IntentTraceSnapshot {
    return toIntentTraceSnapshot(intent)!;
  }

  /** `GET /pulls/:id/intent`. */
  async get(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const pull = await this.deps.store.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return { intent: (await this.deps.store.get(prId)) ?? null };
  }

  async resolveForReview(input: ResolveForReviewInput): Promise<ResolvedIntent> {
    const { workspaceId, pull, repo, diff, log } = input;
    const ident = { owner: repo.owner, name: repo.name };

    // ---- 1. PR text (code only) ------------------------------------------
    const title = clip(pull.title, INTENT_LIMITS.titleChars);
    const body = stripHtmlComments(pull.body ?? '').trim();
    const description = clip(body, INTENT_LIMITS.descriptionChars);
    const parseBody = body.slice(0, INTENT_LIMITS.bodyParseChars);
    const ticketParse = parseTicketRefs(parseBody, ident, pull.number);
    const bodyLinks = parseSpecLinks(parseBody, ident);
    const externalCount = bodyLinks.unresolved.filter((u) => u.kind === 'link').length;

    log.info(
      [
        'Intent: sources — title',
        ...(body ? [`description ${body.length} chars`] : []),
        `${ticketParse.refs.length} ticket ref(s)`,
        `${bodyLinks.specs.length} spec link(s)`,
        `${externalCount} external link(s)`,
      ].join(' · '),
    );
    if (
      body.length < INTENT_LIMITS.documentedDescriptionChars &&
      ticketParse.refs.length === 0 &&
      bodyLinks.specs.length === 0
    ) {
      log.info(
        'Intent: no description/ticket/spec — deriving from branch, commits, paths; confidence capped at low',
      );
    }

    // ---- 2. Tickets (GitHub, this repo only, in parallel) ------------------
    const tickets = await this.fetchTickets(repo, ticketParse.refs, log);

    // ---- 3. Spec links from the body + fetched ticket bodies ---------------
    const specLinks = parseSpecLinks([parseBody, ...tickets.resolved.map((t) => t.body)].join('\n\n'), ident);
    const preUnresolved = dedupeUnresolved([
      ...ticketParse.unresolved,
      ...tickets.unresolved,
      ...specLinks.unresolved,
    ]);
    for (const u of preUnresolved) {
      if (u.kind === 'link') {
        log.info(`Intent: warning — unresolved ref ${u.ref} (${u.reason}, not fetched; lowers confidence)`);
      } else if (u.kind === 'spec') {
        log.info(`Intent: spec ${u.ref} skipped — ${u.reason}`);
      } else if (u.reason === 'other_repo' || u.reason === 'limit') {
        log.info(`Intent: ticket ${u.ref} skipped — ${u.reason}`);
      }
    }
    const specs = await this.readSpecs(pull, repo, diff, specLinks.specs.map((s) => s.path), log);
    const unresolved = dedupeUnresolved([...preUnresolved, ...specs.unresolved]);

    // ---- 4. Indirect signals + code-derived risk areas ----------------------
    const commits = (await this.deps.store.getCommits(pull.id))
      .map((m) => (m.split('\n', 1)[0] ?? '').trim())
      .filter((m) => m.length > 0)
      .slice(0, INTENT_LIMITS.maxCommits)
      .map((m) => clip(m, INTENT_LIMITS.commitChars).text);
    const paths = diff.files.map((f) => f.path).slice(0, INTENT_LIMITS.maxPaths);
    const branch = clip(pull.branch, INTENT_LIMITS.branchChars).text;
    const codeRisks = deriveRiskAreas(diff);

    const inputs: IntentInputs = {
      repo: repo.fullName,
      prNumber: pull.number,
      title: title.text,
      description: description.text,
      tickets: tickets.resolved,
      specs: specs.read.map((s) => ({ path: s.path, content: s.content })),
      branch,
      commits,
      paths,
      riskAreas: codeRisks,
    };
    const sources: IntentSource[] = [
      { kind: 'title', ref: 'title', via: 'pr', chars: title.text.length, truncated: title.truncated },
      ...(description.text
        ? [
            {
              kind: 'description' as const,
              ref: 'description',
              via: 'pr' as const,
              chars: description.text.length,
              truncated: description.truncated,
            },
          ]
        : []),
      ...tickets.resolved.map((t) => ({
        kind: 'ticket' as const,
        ref: `#${t.number}`,
        via: 'github' as const,
        chars: t.title.length + t.body.length,
        truncated: t.truncated,
      })),
      ...specs.read.map((s) => ({
        kind: 'spec' as const,
        ref: s.path,
        via: s.via,
        chars: s.content.length,
        truncated: s.truncated,
      })),
      ...(branch ? [{ kind: 'branch' as const, ref: branch, via: 'pr' as const, chars: branch.length, truncated: false }] : []),
      ...(commits.length > 0
        ? [
            {
              kind: 'commits' as const,
              ref: `${commits.length} commit(s)`,
              via: 'pr' as const,
              chars: commits.join('\n').length,
              truncated: false,
            },
          ]
        : []),
      ...(paths.length > 0
        ? [
            {
              kind: 'paths' as const,
              ref: `${paths.length} path(s)`,
              via: 'diff' as const,
              chars: paths.join('\n').length,
              truncated: diff.files.length > paths.length,
            },
          ]
        : []),
    ];

    // ---- 5. Cache by input hash ---------------------------------------------
    const { provider, model } = await this.deps.resolveModel(workspaceId);
    const inputHash = createHash('sha256')
      .update(canonicalIntentInput(inputs, provider, model, INTENT_PROMPT_VERSION))
      .digest('hex');
    const existing = await this.deps.store.get(pull.id);
    if (existing && existing.input_hash === inputHash) {
      log.result(
        `Intent cached (hash ${inputHash.slice(0, 8)}, ${existing.provider ?? provider}/${existing.model ?? model}) — no model call`,
      );
      return { ...existing, cached: true };
    }

    // ---- 6. One classifier call ---------------------------------------------
    const llm = await this.deps.llm(provider);
    const timeoutMs = this.deps.timeoutMs;
    const res = await log.step(
      `Classifying intent with ${provider}/${model}`,
      () =>
        raceTimeout(
          llm.completeStructured({
            model,
            schema: PrIntentClassification,
            schemaName: 'PrIntentClassification',
            messages: buildIntentMessages(inputs),
            temperature: 0,
            maxRetries: 1,
            timeoutMs,
            sessionId: `${repo.owner}/${repo.name}#${pull.number}:intent`,
          }),
          timeoutMs,
          'Intent classification',
        ),
      { kind: 'tool' },
    );
    // `.default()` fields are filled by the parse; the provider's generic is
    // inferred from the schema INPUT, so restate the defaults for the type.
    const out = {
      ...res.data,
      in_scope: res.data.in_scope ?? [],
      out_of_scope: res.data.out_of_scope ?? [],
      breaking: res.data.breaking ?? false,
      signals: res.data.signals ?? [],
      risk_areas: res.data.risk_areas ?? [],
    };

    // ---- 7. Ground + calibrate in code --------------------------------------
    const grounded = groundSignals(out.signals, sources);
    if (grounded.dropped > 0) {
      log.info(`Intent: dropped ${grounded.dropped} signal(s) citing a source that was not provided`);
    }
    const cal = calibrateIntentConfidence({
      modelConfidence: out.confidence,
      category: out.category,
      descriptionChars: body.length,
      ticketsResolved: tickets.resolved.length,
      specsRead: specs.read.length,
      unresolved,
    });
    const riskAreas = mergeRiskAreas(codeRisks, out.risk_areas);
    if (riskAreas.length > 0) {
      log.info(
        `Intent: risk areas — ${riskAreas.map((r) => (r.origin === 'model' ? `(model) ${r.label}` : r.label)).join(' · ')}`,
      );
    }

    const saved = await this.deps.store.upsert({
      pr_id: pull.id,
      intent: out.summary.trim(),
      in_scope: out.in_scope,
      out_of_scope: out.out_of_scope,
      category: out.category,
      breaking: out.breaking,
      confidence: cal.confidence,
      confidence_level: cal.level,
      documented: cal.documented,
      signals: grounded.kept,
      sources,
      unresolved_refs: unresolved,
      risk_areas: riskAreas,
      provider,
      model,
      cost_usd: res.costUsd,
      input_hash: inputHash,
      head_sha: pull.headSha,
    });
    log.result(
      `Intent: ${saved.category} · confidence ${cal.level} ${cal.confidence.toFixed(2)} (model ${out.confidence.toFixed(2)}) · ` +
        `breaking=${saved.breaking ? 'yes' : 'no'} · ${res.costUsd == null ? '$—' : `$${res.costUsd.toFixed(4)}`} · ` +
        `${res.tokensIn}→${res.tokensOut} tokens`,
    );
    return { ...saved, cached: false };
  }

  /** Fetch ≤ 3 same-repo issues in parallel; each failure is isolated. */
  private async fetchTickets(
    repo: IntentRepoRef,
    refs: TicketRef[],
    log: IntentLog,
  ): Promise<{
    resolved: { number: number; title: string; body: string; truncated: boolean }[];
    unresolved: IntentUnresolvedRef[];
  }> {
    if (refs.length === 0) return { resolved: [], unresolved: [] };
    let gh: GitHubClient | null = null;
    try {
      gh = await this.deps.github();
    } catch {
      gh = null;
    }
    const results = await Promise.all(
      refs.map(async (r) => {
        if (!gh) return { ref: r, reason: 'no_github_token' as const };
        try {
          const issue = await gh.getIssue({ owner: repo.owner, name: repo.name }, r.number);
          const title = clip(issue.title ?? '', INTENT_LIMITS.ticketTitleChars);
          const body = clip(stripHtmlComments(issue.body ?? '').trim(), INTENT_LIMITS.ticketBodyChars);
          if (!title.text.trim() && !body.text) return { ref: r, reason: 'not_found' as const };
          return {
            ref: r,
            ticket: {
              number: r.number,
              title: title.text,
              body: body.text,
              truncated: title.truncated || body.truncated,
            },
          };
        } catch {
          return { ref: r, reason: 'not_found' as const };
        }
      }),
    );
    const resolved: { number: number; title: string; body: string; truncated: boolean }[] = [];
    const unresolved: IntentUnresolvedRef[] = [];
    for (const r of results) {
      if ('ticket' in r && r.ticket) {
        resolved.push(r.ticket);
        log.tool(`Intent: ticket #${r.ticket.number} fetched ("${r.ticket.title.replace(/\s+/g, ' ').slice(0, 80)}")`);
      } else if ('reason' in r) {
        unresolved.push({ kind: 'ticket', ref: r.ref.ref, host: 'github.com', reason: r.reason });
        log.info(`Intent: ticket #${r.ref.number} skipped — ${r.reason}`);
      }
    }
    return { resolved, unresolved };
  }

  /**
   * Read code-parsed spec paths: blob at headSha → working tree (contained) →
   * an added file in the diff. Per-spec and total char caps.
   */
  private async readSpecs(
    pull: IntentPullRef,
    repo: IntentRepoRef,
    diff: UnifiedDiff,
    paths: string[],
    log: IntentLog,
  ): Promise<{
    read: { path: string; content: string; via: 'head' | 'worktree' | 'diff'; truncated: boolean }[];
    unresolved: IntentUnresolvedRef[];
  }> {
    const read: { path: string; content: string; via: 'head' | 'worktree' | 'diff'; truncated: boolean }[] = [];
    const unresolved: IntentUnresolvedRef[] = [];
    let total = 0;
    const opts = { maxBytes: INTENT_LIMITS.specReadBytes };
    for (const path of paths) {
      const remaining = INTENT_LIMITS.specTotalChars - total;
      if (remaining <= 0) {
        unresolved.push({ kind: 'spec', ref: path, host: null, reason: 'limit' });
        log.info(`Intent: spec ${path} skipped — limit`);
        continue;
      }
      let via: 'head' | 'worktree' | 'diff' = 'head';
      let content = await this.deps.showFile({ owner: repo.owner, name: repo.name }, pull.headSha, path, opts);
      if (content === null && repo.clonePath) {
        via = 'worktree';
        content = await this.deps.readFile(repo.clonePath, path, opts);
      }
      if (content === null) {
        via = 'diff';
        content = addedFileFromDiff(diff.raw, path);
      }
      if (content === null || content.trim() === '') {
        unresolved.push({ kind: 'spec', ref: path, host: null, reason: 'not_found' });
        log.info(`Intent: spec ${path} skipped — not_found`);
        continue;
      }
      const capped = clip(content, Math.min(INTENT_LIMITS.specChars, remaining));
      total += capped.text.length;
      read.push({ path, content: capped.text, via, truncated: capped.truncated });
      const size = kb(content.length);
      log.tool(
        via === 'head'
          ? `Intent: spec ${path} read @${pull.headSha.slice(0, 7)} (${size})`
          : via === 'worktree'
            ? `Intent: spec ${path} read from working tree (head not in clone) (${size})`
            : `Intent: spec ${path} read from PR diff (new file) (${size})`,
      );
      if (capped.truncated) log.info(`Intent: spec ${path} truncated to ${capped.text.length} chars`);
    }
    return { read, unresolved };
  }
}
