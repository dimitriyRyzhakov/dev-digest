export interface FindingLike {
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  file: string;
  line: number;
  title: string;
}

/** One-line plain-text rendering of a finding. */
export function formatFinding(f: FindingLike): string {
  return `[${f.severity}] ${f.file}:${f.line} ${f.title}`;
}
