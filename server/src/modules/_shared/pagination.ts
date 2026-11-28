/** Page of a list returned by list endpoints. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/**
 * Slice an in-memory list into one page.
 * `page` is 1-based; `pageSize` falls back to the default when not given.
 */
export function paginate<T>(items: T[] | undefined, page: number, pageSize?: number): Page<T> {
  const size = pageSize || 50;
  const start = page * size;
  const slice = items!.slice(start, start + size);
  return {
    items: slice,
    page,
    pageSize: size,
    total: items!.length,
    hasMore: start + size < items!.length,
  };
}
