import type { FlushResult, SyncQueueState } from "./sync";

export interface SyncStatus {
  phase: "syncing" | "synced" | "retrying" | "offline" | "error" | "unpaired";
  pending: number;
  initial: boolean;
  /** Notes are fine, but the calendar step failed in the last round. */
  calendarFailed?: boolean;
  /** Note changes the server refused; kept on this device, not retried. */
  rejected?: number;
}

interface RuntimeEngine {
  flush(): Promise<FlushResult>;
  pull(cursor: string | null): Promise<string>;
  getQueueState?(): Promise<SyncQueueState>;
}

/** Calendar sync runs after notes as its own step. */
interface RuntimeCalendar {
  synchronize(): Promise<void>;
  pendingCount(): Promise<number>;
}

interface RuntimeCloud {
  subscribe(onChange: () => void): () => void;
}

interface RuntimeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface SyncRuntimeOptions {
  engine: RuntimeEngine;
  calendar?: RuntimeCalendar;
  cloud: RuntimeCloud;
  storage: RuntimeStorage;
  notify: () => void;
  onError?: (error: unknown) => void;
  onStatusChange?: (status: SyncStatus) => void;
  intervalMs?: number;
}

/** True when the server says this device is no longer in its workspace. */
export function isWorkspaceForbidden(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { message?: unknown }).message === "workspace_forbidden"
  );
}

export function createSyncRuntime(options: SyncRuntimeOptions) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let running = false;
  let stopped = false;
  let started = false;
  let generation = 0;
  let wakePending = false;
  let notifying = false;
  let initial = true;
  let pending = 0;
  // Set when the server says this device lost access to its workspace.
  let needsPairing = false;
  let calendarFailed = false;
  let rejected = 0;
  const online = () => typeof navigator === "undefined" || navigator.onLine;
  const publish = (phase: SyncStatus["phase"]) => {
    if (stopped) return;
    options.onStatusChange?.({
      phase,
      pending,
      initial,
      ...(options.calendar ? { calendarFailed } : {}),
      ...(rejected ? { rejected } : {}),
    });
  };
  const offline = () => {
    if (!needsPairing) publish("offline");
  };
  const wake = () => {
    if (running) wakePending = true;
    else void synchronize();
  };
  const visible = () => {
    if (document.visibilityState === "visible") wake();
  };
  const changed = () => {
    if (!notifying) wake();
  };

  async function synchronize() {
    // Retrying cannot fix lost access; wait until pairing calls resume().
    if (stopped || needsPairing) return;
    if (running) {
      wakePending = true;
      return;
    }
    if (!online()) {
      publish("offline");
      return;
    }
    running = true;
    const currentGeneration = generation;
    const active = () => !stopped && generation === currentGeneration;
    publish("syncing");
    try {
      const result = await options.engine.flush();
      if (!active()) return;
      const cursor = await options.engine.pull(
        options.storage.getItem("smoke-notes:sync-cursor"),
      );
      if (!active()) return;
      options.storage.setItem("smoke-notes:sync-cursor", cursor);
      // Calendar is a separate step. If it fails, notes still count as synced
      // and the calendar simply tries again next round.
      calendarFailed = false;
      if (options.calendar) {
        try {
          await options.calendar.synchronize();
        } catch (error) {
          if (isWorkspaceForbidden(error)) throw error;
          calendarFailed = true;
          options.onError?.(error);
        }
        if (!active()) return;
      }
      const queue = await options.engine.getQueueState?.();
      const calendarPending = (await options.calendar?.pendingCount()) ?? 0;
      if (!active()) return;
      const notesPending = queue?.pending ?? 0;
      pending = notesPending + calendarPending;
      // Rejected notes are set aside, so they do not make the round fail.
      rejected = queue?.rejected ?? 0;
      if (!online()) publish("offline");
      else if (result.failed || notesPending) publish("retrying");
      else if (calendarPending && !calendarFailed) publish("retrying");
      else {
        initial = false;
        publish("synced");
      }
      if (!stopped) {
        notifying = true;
        try {
          options.notify();
        } finally {
          notifying = false;
        }
      }
    } catch (error) {
      if (active()) {
        if (isWorkspaceForbidden(error)) {
          needsPairing = true;
          publish("unpaired");
        } else publish(online() ? "error" : "offline");
        options.onError?.(error);
      }
    } finally {
      running = false;
      if (wakePending && !stopped) {
        wakePending = false;
        void synchronize();
      }
    }
  }

  return {
    async start() {
      if (started) return;
      started = true;
      stopped = false;
      const currentGeneration = generation;
      if (typeof window !== "undefined") {
        window.addEventListener("focus", wake);
        window.addEventListener("online", wake);
        window.addEventListener("offline", offline);
        window.addEventListener("smoke-notes:data-changed", changed);
        document.addEventListener("visibilitychange", visible);
      }
      await synchronize();
      if (stopped || generation !== currentGeneration) return;
      unsubscribe = options.cloud.subscribe(() => {
        void synchronize();
      });
      timer = setInterval(() => {
        void synchronize();
      }, options.intervalMs ?? 5000);
    },
    stop() {
      started = false;
      stopped = true;
      generation += 1;
      wakePending = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", wake);
        window.removeEventListener("online", wake);
        window.removeEventListener("offline", offline);
        window.removeEventListener("smoke-notes:data-changed", changed);
        document.removeEventListener("visibilitychange", visible);
      }
      if (timer) clearInterval(timer);
      timer = null;
      unsubscribe?.();
      unsubscribe = null;
    },
    /** Call after pairing succeeds to start syncing again. */
    resume() {
      needsPairing = false;
      void synchronize();
    },
    synchronize,
  };
}
