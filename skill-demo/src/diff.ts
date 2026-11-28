export interface FileDiff {
  path: string;
  patch: string;
}

/** Split a unified diff into one entry per file. */
export function parseUnifiedDiff(raw: string): FileDiff[] {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\ndiff --git ')
    .filter(Boolean)
    .map((chunk) => ({
      path: chunk.split('\n')[0]!.split(' b/')[1] ?? '',
      patch: chunk,
    }));
}

/** Older name, kept for existing callers. */
export function parseDiff(raw: string): FileDiff[] {
  return parseUnifiedDiff(raw);
}
