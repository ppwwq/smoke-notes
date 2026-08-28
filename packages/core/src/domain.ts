import type { Note } from './types';

export const RANK_GAP = 1024;
export const MIN_OPACITY = 0.45;
export const TRASH_RETENTION_DAYS = 30;

export function clampOpacity(value: number): number {
  return Math.min(1, Math.max(MIN_OPACITY, value));
}

export function rankBetween(previous: number | null, next: number | null): number {
  if (previous === null && next === null) return RANK_GAP;
  if (previous === null) return next! - RANK_GAP;
  if (next === null) return previous + RANK_GAP;
  return (previous + next) / 2;
}

export function rebalanceRanks(ids: string[]): Record<string, number> {
  return Object.fromEntries(ids.map((id, index) => [id, (index + 1) * RANK_GAP]));
}

export function isTrashExpired(deletedAt: string | null, now = new Date()): boolean {
  if (!deletedAt) return false;
  const retentionMs = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - new Date(deletedAt).getTime() >= retentionMs;
}

type ConflictSource = Pick<Note, 'id' | 'notebookId' | 'title' | 'body' | 'rank' | 'version'>;

export function createConflictCopy(
  local: ConflictSource,
  serverId: string,
  timestamp = new Date().toISOString(),
): Note {
  const suffix = '（冲突副本）';
  return {
    ...local,
    title: local.title.endsWith(suffix) ? local.title : `${local.title}${suffix}`,
    version: 1,
    conflictOf: serverId,
    updatedAt: timestamp,
    deletedAt: null,
  };
}
