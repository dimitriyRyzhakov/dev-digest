/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — skills in the system message (M2)', () => {
  const skills = [
    { name: 'branch-coverage', description: 'Flag untested branches.', body: 'BODY-ONE' },
    { name: 'mocking', description: 'Flag over-mocking.', body: 'BODY-TWO' },
  ];

  it('renders skills after the agent prompt and before the guard, in order', () => {
    const { messages, assembly } = assemblePrompt({ system: 'AGENT-SYS', diff: 'DIFF', skills });
    const sys = messages[0]!.content;
    const agentAt = sys.indexOf('AGENT-SYS');
    const headingAt = sys.indexOf('## Skills (apply in order)');
    const oneAt = sys.indexOf('### Skill 1: branch-coverage');
    const twoAt = sys.indexOf('### Skill 2: mocking');
    const guardAt = sys.indexOf('SECURITY — read carefully');
    expect(agentAt).toBe(0);
    expect(headingAt).toBeGreaterThan(agentAt);
    expect(oneAt).toBeGreaterThan(headingAt);
    expect(twoAt).toBeGreaterThan(oneAt);
    expect(guardAt).toBeGreaterThan(twoAt);
    expect(sys).toContain('Flag untested branches.\n\nBODY-ONE');
    expect(assembly.skills).toContain('### Skill 2: mocking');
  });

  it('never puts skill text into the user message', () => {
    const user = userOf({ system: 'sys', diff: 'DIFF', skills });
    expect(user).not.toContain('BODY-ONE');
    expect(user).not.toMatch(/## Skills/);
  });

  it('leaves the system message unchanged when there are no skills', () => {
    const base = systemOf({ system: 'sys', diff: 'DIFF' });
    expect(systemOf({ system: 'sys', diff: 'DIFF', skills: [] })).toBe(base);
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF', skills: [] }).assembly.skills).toBeNull();
  });
});
