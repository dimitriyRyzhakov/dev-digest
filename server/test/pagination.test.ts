import { describe, expect, it } from 'vitest';
import { paginate } from '../src/modules/_shared/index.js';

describe('paginate', () => {
  it('uses the default page size', () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const page = paginate(items, 1);
    expect(page.pageSize).toBe(50);
    expect(page.total).toBe(120);
  });

  it('reports hasMore = false on the last page', () => {
    const page = paginate([1, 2, 3], 0, 2);
    expect(page.items).toEqual([1, 2]);
  });
});
