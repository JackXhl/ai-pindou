import { describe, expect, it } from 'vitest';
import {
  filterSamplesByTag,
  paginateSamples,
  takeSampleBatch,
  type SampleMeta,
} from './samples.js';

const fixtures: SampleMeta[] = [
  { id: 'a', title: 'A', tag: '入门', featured: true, cols: 29, rows: 29, totalBeads: 1, totalColors: 1 },
  { id: 'b', title: 'B', tag: '可爱', featured: false, cols: 29, rows: 29, totalBeads: 1, totalColors: 2 },
  { id: 'c', title: 'C', tag: '入门', featured: false, cols: 29, rows: 29, totalBeads: 1, totalColors: 1 },
];

describe('filterSamplesByTag', () => {
  it('returns all for 全部', () => {
    expect(filterSamplesByTag(fixtures, '全部')).toHaveLength(3);
  });
  it('filters by tag', () => {
    expect(filterSamplesByTag(fixtures, '入门').map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('paginateSamples', () => {
  it('pages with size 2', () => {
    const { pageItems, totalPages } = paginateSamples(fixtures, 2, 2);
    expect(totalPages).toBe(2);
    expect(pageItems.map((s) => s.id)).toEqual(['c']);
  });
});

describe('takeSampleBatch', () => {
  it('slices batch', () => {
    expect(takeSampleBatch(fixtures, 1, 2).map((s) => s.id)).toEqual(['b', 'c']);
  });
});
