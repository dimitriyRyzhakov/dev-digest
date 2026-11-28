/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component, the single FileCard (for callers
   that group files themselves, e.g. Smart Diff) + the DiffCommentApi contract. */
export { DiffViewer } from "./DiffViewer";
export { FileCard } from "./FileCard";
export type { DiffCommentApi } from "./comments";
export { worstOpenSeverity, type DiffFindingApi } from "./findings";
