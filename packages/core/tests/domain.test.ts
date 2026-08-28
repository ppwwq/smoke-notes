import { describe, expect, it } from 'vitest';
import {
  clampOpacity,
  createConflictCopy,
  isTrashExpired,
  rankBetween,
  rebalanceRanks,
} from '../src/index';

describe('clampOpacity', () => {
  it('keeps desktop opacity between 45 and 100 percent', () => {
    expect(clampOpacity(0.2)).toBe(0.45);
    expect(clampOpacity(0.72)).toBe(0.72);
    expect(clampOpacity(2)).toBe(1);
  });
});

describe('rankBetween', () => {
  it('places a moved item between its neighbours', () => {
    expect(rankBetween(1024, 2048)).toBe(1536);
    expect(rankBetween(null, 1024)).toBe(0);
    expect(rankBetween(2048, null)).toBe(3072);
  });

  it('rebalances crowded ranks into stable gaps', () => {
    expect(rebalanceRanks(['c', 'a', 'b'])).toEqual({ c: 1024, a: 2048, b: 3072 });
  });
});

describe('trash retention', () => {
  it('expires deleted records after 30 days', () => {
    const now = new Date('2026-08-28T00:00:00.000Z');
    expect(isTrashExpired('2026-07-28T23:59:59.000Z', now)).toBe(true);
    expect(isTrashExpired('2026-07-30T00:00:00.000Z', now)).toBe(false);
    expect(isTrashExpired(null, now)).toBe(false);
  });
});

describe('conflict preservation', () => {
  it('creates a separate conflict copy without replacing the server record', () => {
    const copy = createConflictCopy(
      {
        id: 'note-local',
        notebookId: 'book-1',
        title: '采购清单',
        body: '牛奶',
        rank: 1024,
        version: 3,
      },
      'note-server',
      '2026-08-28T10:00:00.000Z',
    );

    expect(copy).toMatchObject({
      id: 'note-local',
      title: '采购清单（冲突副本）',
      conflictOf: 'note-server',
      version: 1,
    });
  });
});
