import {
  normalizeNoteWindowState,
  type NoteWindowState,
} from "@smoke-notes/core";

export interface NoteWindowHandle {
  show(): void;
  focus(): void;
  hide(): void;
  isDestroyed(): boolean;
  destroy(): void;
  navigate?(noteId: string): Promise<void>;
}

export interface NoteWindowStateStore {
  readAll(): NoteWindowState[];
  writeAll(states: NoteWindowState[]): void;
}

export type NoteWindowFactory = (
  state: NoteWindowState,
) => Promise<NoteWindowHandle>;

export class NoteWindowManager {
  private readonly windows = new Map<string, NoteWindowHandle>();
  private readonly pendingStates = new Map<string, NoteWindowState>();
  private readonly switchingNoteIds = new Set<string>();

  constructor(
    private readonly store: NoteWindowStateStore,
    private readonly factory: NoteWindowFactory,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async open(noteId: string): Promise<NoteWindowHandle> {
    const existing = this.windows.get(noteId);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      this.persist(noteId, {
        isOpen: true,
        lastOpenedAt: this.now().toISOString(),
      });
      return existing;
    }

    const state = this.persist(noteId, {
      isOpen: true,
      lastOpenedAt: this.now().toISOString(),
    });
    const created = await this.factory(state);
    this.windows.set(noteId, created);
    return created;
  }

  hide(noteId: string): void {
    const window = this.windows.get(noteId);
    if (window && !window.isDestroyed()) window.hide();
    this.persist(noteId, { isOpen: false });
  }

  update(noteId: string, changes: Partial<NoteWindowState>): NoteWindowState {
    return this.persist(noteId, changes);
  }

  getState(noteId: string): NoteWindowState {
    return (
      this.pendingStates.get(noteId) ??
      this.store.readAll().find((state) => state.noteId === noteId) ??
      normalizeNoteWindowState(noteId, { isOpen: true })
    );
  }

  remove(noteId: string): void {
    const window = this.windows.get(noteId);
    if (window && !window.isDestroyed()) window.destroy?.();
    this.windows.delete(noteId);
    this.store.writeAll(
      this.store.readAll().filter((state) => state.noteId !== noteId),
    );
  }

  async restoreOpen(): Promise<void> {
    for (const state of this.store.readAll()) {
      if (state.isOpen) await this.open(state.noteId);
    }
  }

  getRecentNoteIds(limit = 4): string[] {
    const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
    return this.store
      .readAll()
      .filter((state) => state.lastOpenedAt)
      .sort((a, b) => b.lastOpenedAt!.localeCompare(a.lastOpenedAt!))
      .slice(0, safeLimit)
      .map((state) => state.noteId);
  }

  async switch(
    sourceNoteId: string,
    targetNoteId: string,
    sourceChanges: Partial<
      Omit<NoteWindowState, "noteId" | "isOpen" | "lastOpenedAt">
    > = {},
  ): Promise<void> {
    if (sourceNoteId === targetNoteId) return;
    if (
      this.switchingNoteIds.has(sourceNoteId) ||
      this.switchingNoteIds.has(targetNoteId)
    ) {
      throw new Error("A note window switch is already in progress");
    }
    const source = this.windows.get(sourceNoteId);
    if (!source || source.isDestroyed() || !source.navigate) {
      throw new Error("Source note window cannot be reused");
    }
    const existingTarget = this.windows.get(targetNoteId);
    const currentStates = this.store.readAll();
    const storedSourceState = currentStates.find(
      (state) => state.noteId === sourceNoteId,
    );
    const sourceState = normalizeNoteWindowState(sourceNoteId, {
      ...(storedSourceState ?? { isOpen: true }),
      ...sourceChanges,
      isOpen: true,
    });
    const closedSourceState = normalizeNoteWindowState(sourceNoteId, {
      ...sourceState,
      isOpen: false,
    });
    const targetState = normalizeNoteWindowState(targetNoteId, {
      ...sourceState,
      noteId: targetNoteId,
      isOpen: true,
      lastOpenedAt: this.now().toISOString(),
    });
    this.switchingNoteIds.add(sourceNoteId);
    this.switchingNoteIds.add(targetNoteId);
    this.pendingStates.set(targetNoteId, targetState);
    try {
      await source.navigate(targetNoteId);
      try {
        const latestStates = this.store.readAll();
        const nextStates = [
          ...latestStates.filter(
            (state) =>
              state.noteId !== sourceNoteId && state.noteId !== targetNoteId,
          ),
          closedSourceState,
          targetState,
        ];
        this.store.writeAll(nextStates);
      } catch (writeError) {
        try {
          await source.navigate(sourceNoteId);
        } catch (rollbackError) {
          this.windows.delete(sourceNoteId);
          let cleanupError: unknown;
          try {
            source.destroy();
          } catch (error) {
            cleanupError = error;
          }
          throw new AggregateError(
            [
              writeError,
              rollbackError,
              ...(cleanupError ? [cleanupError] : []),
            ],
            "Failed to save the note switch and restore the source window",
            { cause: rollbackError },
          );
        }
        throw writeError;
      }

      this.windows.delete(sourceNoteId);
      this.windows.set(targetNoteId, source);
      if (
        existingTarget &&
        existingTarget !== source &&
        !existingTarget.isDestroyed()
      ) {
        try {
          existingTarget.destroy();
        } catch {
          try {
            existingTarget.hide();
          } catch {
            // The switch is already committed; cleanup is best effort only.
          }
        }
      }
    } finally {
      this.pendingStates.delete(targetNoteId);
      this.switchingNoteIds.delete(sourceNoteId);
      this.switchingNoteIds.delete(targetNoteId);
    }
  }

  private persist(
    noteId: string,
    changes: Partial<NoteWindowState>,
  ): NoteWindowState {
    const states = this.store.readAll();
    const current = states.find((state) => state.noteId === noteId);
    const next = normalizeNoteWindowState(noteId, {
      ...current,
      ...changes,
      noteId,
    });
    this.store.writeAll([
      ...states.filter((state) => state.noteId !== noteId),
      next,
    ]);
    return next;
  }
}
