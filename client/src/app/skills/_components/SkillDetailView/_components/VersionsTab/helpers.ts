export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/**
 * Line diff (LCS) from `from` to `to`. Skill bodies are small (≤ 20k chars),
 * so the O(n·m) table is fine.
 */
export function diffLines(from: string, to: string): DiffLine[] {
  const a = from.split("\n");
  const b = to.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i++]! });
    } else {
      out.push({ kind: "add", text: b[j++]! });
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i++]! });
  while (j < m) out.push({ kind: "add", text: b[j++]! });
  return out;
}

/** YYYY-MM-DD of an ISO timestamp (stable across locales). */
export function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

/** First non-empty line of a body, without a leading markdown heading marker. */
export function firstLine(body: string): string {
  const line = body.split("\n").find((l) => l.trim() !== "") ?? "";
  return line.replace(/^#+\s*/, "").trim();
}
