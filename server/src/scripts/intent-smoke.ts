/**
 * Live smoke check of the M3 intent layer on a real PR — the manual verification,
 * scripted. Makes ONE real call to the `review_intent` feature model (cheap, but
 * not free) and stores the result in `pr_intent`, exactly like a review run does.
 *
 *   pnpm intent:smoke <prId>          # prId = pull_requests.id (uuid)
 *   pnpm intent:smoke <prId> --fresh  # drop the cached pr_intent row first → real model call
 *
 * Automatic checks (exit 1 if any fails):
 *   1. model     — the request used the resolved `review_intent` model, not a review agent's
 *   2. payload   — no diff hunks or secrets; outside the author's own documents (title,
 *                  description, tickets, specs) no added diff code — paths only
 *   3. specs     — every spec/plan linked from the description was sent or is reported unresolved
 *   4. log       — Live Log lines carry no code, PR text or secrets
 *   5. block     — the review-prompt intent block is wrapped and within MAX_INTENT_CHARS
 * Human check: the printed summary / scope / risks must match the PR's purpose.
 * Never prints API keys; secrets found anywhere are reported by kind only.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import type { LLMProvider, StructuredRequest } from '@devdigest/shared';
import { renderIntentBlock, MAX_INTENT_CHARS } from '@devdigest/reviewer-core';
import { loadConfig } from '../platform/config.js';
import { createDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { Container } from '../platform/container.js';
import { loadDiff } from '../modules/reviews/diff-loader.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import { parseSpecLinks, stripHtmlComments, INTENT_LIMITS } from '../modules/intent/domain.js';
import { defaultFeatureModel, getFeatureModelOverride } from '../modules/settings/feature-models.js';

const SECRET_RE = /(sk-or-v1-[\w-]{8,}|sk-ant-[\w-]{8,}|sk_live_\w{4,}|ghp_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY)/;
const HUNK_RE = /^(diff --git |@@ |\+\+\+ |--- a\/)/m;

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

async function main(): Promise<number> {
  const prId = process.argv[2];
  const fresh = process.argv.includes('--fresh');
  if (!prId || !/^[0-9a-f-]{36}$/i.test(prId)) {
    console.error('usage: pnpm intent:smoke <prId (uuid)> [--fresh]');
    return 2;
  }
  const config = loadConfig();
  const handle = createDb(config.databaseUrl);
  try {
    const [pull] = await handle.db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, prId));
    if (!pull) throw new Error(`PR ${prId} not found — open it in the UI once so it is synced`);
    const [repo] = await handle.db.select().from(schema.repos).where(eq(schema.repos.id, pull.repoId));
    if (!repo) throw new Error('repo row missing');
    if (fresh) await handle.db.delete(schema.prIntent).where(eq(schema.prIntent.prId, pull.id));

    const expected =
      (await getFeatureModelOverride({ db: handle.db }, pull.workspaceId, 'review_intent')) ??
      defaultFeatureModel('review_intent');

    // Record the exact classifier request(s) by wrapping the real provider.
    const base = new Container(config, handle.db);
    const real = await base.llm(expected.provider);
    const requests: { provider: string; model: string; text: string }[] = [];
    const recording: LLMProvider = Object.create(real);
    recording.completeStructured = async <T>(req: StructuredRequest<T>) => {
      requests.push({ provider: expected.provider, model: req.model, text: req.messages.map((m) => m.content).join('\n') });
      return real.completeStructured(req);
    };
    const c = new Container(config, handle.db, { llm: { [expected.provider]: recording } });

    const diff = await loadDiff(c, new ReviewRepository(handle.db), pull.workspaceId, pull, repo);
    const log: string[] = [];
    const push = (msg: string) => log.push(msg);
    const intent = await c.intentService.resolveForReview({
      workspaceId: pull.workspaceId,
      pull: { id: pull.id, number: pull.number, title: pull.title, body: pull.body, branch: pull.branch, headSha: pull.headSha },
      repo: { owner: repo.owner, name: repo.name, fullName: repo.fullName, clonePath: repo.clonePath },
      diff,
      log: {
        info: push,
        tool: push,
        result: push,
        error: push,
        step: async (label, fn) => {
          push(`${label}…`);
          return fn();
        },
      },
    });

    const checks: Check[] = [];
    const req = requests[0];
    const specRefs = new Set(intent.sources.filter((s) => s.kind === 'spec').map((s) => s.ref));
    // Added code lines of the diff, excluding files that were read as specs (their text is meant to be sent).
    const addedCode: string[] = [];
    let current = '';
    for (const line of diff.raw.split('\n')) {
      const file = line.match(/^\+\+\+ b\/(.+)$/);
      if (file) current = file[1]!;
      else if (line.startsWith('+') && !specRefs.has(current)) {
        const code = line.slice(1).trim();
        if (code.length >= 16) addedCode.push(code);
      }
    }

    if (intent.cached || !req) {
      checks.push({ name: 'model', ok: true, detail: `cache hit — no model call (${intent.provider}/${intent.model}); payload checks skipped — re-run with --fresh` });
    } else {
      checks.push({
        name: 'model',
        ok: req.model === expected.model && intent.provider === expected.provider,
        detail: `request ${req.provider}/${req.model} · review_intent = ${expected.provider}/${expected.model}`,
      });
      // Author documents (title, description, tickets, specs) are meant to be sent and may quote
      // code; everything else in the request (header, branch, commits, paths) must carry no diff code.
      const nonDocs = req.text.replace(
        /<untrusted source="(?:pr-title|pr-description|ticket-\d+|spec:[^"]+)">[\s\S]*?\n<\/untrusted>/g,
        '',
      );
      const leakedCode = addedCode.filter((l) => nonDocs.includes(l));
      checks.push({
        name: 'payload',
        ok: !HUNK_RE.test(req.text) && leakedCode.length === 0 && !SECRET_RE.test(req.text),
        detail: `${req.text.length} chars sent vs ${diff.raw.length} diff chars · hunks ${HUNK_RE.test(req.text) ? 'FOUND' : 'none'} · diff code outside author docs ${leakedCode.length} · secret ${SECRET_RE.exec(req.text)?.[1]?.slice(0, 4) ?? 'none'}`,
      });
    }

    const body = stripHtmlComments(pull.body ?? '').slice(0, INTENT_LIMITS.bodyParseChars);
    const linked = parseSpecLinks(body, { owner: repo.owner, name: repo.name }).specs.map((s) => s.path);
    const unresolved = new Map(intent.unresolved_refs.filter((u) => u.kind === 'spec').map((u) => [u.ref, u.reason]));
    const missing = linked.filter((p) => !specRefs.has(p) && !unresolved.has(p));
    checks.push({
      name: 'specs',
      ok: missing.length === 0,
      detail: linked.length === 0
        ? 'no spec/plan links in the description'
        : linked.map((p) => `${p}: ${specRefs.has(p) ? 'sent' : unresolved.has(p) ? `unresolved (${unresolved.get(p)})` : 'MISSING'}`).join(' · '),
    });

    const logText = log.join('\n');
    const prSnippet = (pull.body ?? '').trim().slice(0, 60);
    const logLeaks = [
      HUNK_RE.test(logText) && 'hunk lines',
      SECRET_RE.test(logText) && 'secret',
      addedCode.some((l) => logText.includes(l)) && 'added code',
      prSnippet.length >= 40 && logText.includes(prSnippet) && 'PR description text',
    ].filter(Boolean);
    checks.push({ name: 'log', ok: logLeaks.length === 0, detail: logLeaks.length ? `leaks: ${logLeaks.join(', ')}` : `${log.length} lines, no code/PR text/secrets` });

    const block = renderIntentBlock(c.intentService.toPromptIntent(intent));
    const wrapped = /<untrusted source="pr-intent">[\s\S]*<\/untrusted>$/.test(block);
    checks.push({ name: 'block', ok: wrapped && block.length <= MAX_INTENT_CHARS + 600, detail: `${block.length} chars, wrapped=${wrapped}` });

    console.log(`\nPR #${pull.number} — ${pull.title}`);
    console.log(`Intent: ${intent.category} · ${intent.confidence_level} ${intent.confidence.toFixed(2)} · breaking=${intent.breaking} · $${(intent.cost_usd ?? 0).toFixed(4)}${intent.cached ? ' · cached' : ''}`);
    console.log(`Summary: ${intent.intent}`);
    console.log(`In scope:\n${intent.in_scope.map((s) => `  - ${s}`).join('\n') || '  —'}`);
    console.log(`Out of scope:\n${intent.out_of_scope.map((s) => `  - ${s}`).join('\n') || '  —'}`);
    console.log(`Risk areas: ${intent.risk_areas.map((r) => `${r.origin}:${r.label}`).join(' · ') || '—'}`);
    console.log(`Sources: ${intent.sources.map((s) => `${s.kind}:${s.ref}${s.via ? `@${s.via}` : ''}`).join(' · ')}`);
    console.log(`\nLive Log:\n${log.map((l) => `  ${l}`).join('\n')}\n`);
    for (const ch of checks) console.log(`${ch.ok ? 'PASS' : 'FAIL'}  ${ch.name.padEnd(8)} ${ch.detail}`);
    console.log('HUMAN   card    does the summary/scope above match the PR? (not automatable)');
    return checks.every((ch) => ch.ok) ? 0 : 1;
  } finally {
    await handle.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`intent:smoke failed: ${(err as Error).message}`);
    process.exit(1);
  },
);
