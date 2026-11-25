export interface FindingLike {
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  file: string;
  line: number;
  title: string;
}

export interface RenderOptions {
  /** Prefix each line with an emoji per severity. */
  emoji?: boolean;
}

const EMOJI: Record<FindingLike['severity'], string> = {
  CRITICAL: '🔴',
  WARNING: '🟡',
  SUGGESTION: '🔵',
};

/** One-line plain-text rendering of a finding. */
export function renderFinding(f: FindingLike, options: RenderOptions = {}): string {
  const prefix = options.emoji ? `${EMOJI[f.severity]} ` : '';
  return `${prefix}[${f.severity}] ${f.file}:${f.line} ${f.title}`;
}

/** @deprecated Use `renderFinding`. Will be removed in 2.0.0. */
export function formatFinding(f: FindingLike): string {
  return renderFinding(f);
}
