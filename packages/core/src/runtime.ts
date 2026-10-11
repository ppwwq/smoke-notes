import type { FlushResult, SyncQueueState } from "./sync";

export interface SyncStatus {
  phase: "syncing" | "synced" | "retrying" | "offline" | "error";
  pending: number;
  initial: boolean;
}

interface RuntimeEngine {
  flush(): Promise<FlushResult>;
  pull(cursor: string | null): Promise<string>;
  getQueueState?(): Promise<SyncQueueState>;
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
  cloud: RuntimeCloud;
  storage: RuntimeStorage;
  notify: () => void;
  onError?: (error: unknown) => void;
  onStatusChange?: (status: SyncStatus) => void;
  intervalMs?: number;
}

export function createSyncRuntime(options: SyncRuntimeOptions) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let running = false;
  let stopped = false;
  let wakePending = false;
  let notifying = false;
  let initial = true;
  let pending = 0;
  const online = () => typeof navigator === "undefined" || navigator.onLine;
  const publish = (phase: SyncStatus["phase"]) => {
    if (!stopped) options.onStatusChange?.({ phase, pending, initial });
  };
  const offline = () => publish("offline");
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
    if (stopped) return;
    if (running) {
      wakePending = true;
      return;
    }
    if (!online()) {
      publish("offline");
      return;
    }
    running = true;
    publish("syncing");
    try {
      const result = await options.engine.flush();
      const cursor = await options.engine.pull(
        options.storage.getItem("smoke-notes:sync-cursor"),
      );
      options.storage.setItem("smoke-notes:sync-cursor", cursor);
      const queue = await options.engine.getQueueState?.();
      pending = queue?.pending ?? 0;
      if (!online()) publish("offline");
      else if (queue?.rejected) publish("error");
      else if (result.failed || pending) publish("retrying");
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
      publish(online() ? "error" : "offline");
      options.onError?.(error);
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
      stopped = false;
      if (typeof window !== "undefined") {
        window.addEventListener("focus", wake);
        window.addEventListener("online", wake);
        window.addEventListener("offline", offline);
        window.addEventListener("smoke-notes:data-changed", changed);
        document.addEventListener("visibilitychange", visible);
      }
      await synchronize();
      if (stopped) return;
      unsubscribe = options.cloud.subscribe(() => {
        void synchronize();
      });
      timer = setInterval(() => {
        void synchronize();
      }, options.intervalMs ?? 5000);
    },
    stop() {
      stopped = true;
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
    synchronize,
  };
}
