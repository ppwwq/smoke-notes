import type { FlushResult } from "./sync";

interface RuntimeEngine {
  flush(): Promise<FlushResult>;
  pull(cursor: string | null): Promise<string>;
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
  intervalMs?: number;
}

export function createSyncRuntime(options: SyncRuntimeOptions) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let running = false;
  let stopped = false;
  let wakePending = false;
  const wake = () => {
    if (running) wakePending = true;
    else void synchronize();
  };
  const visible = () => {
    if (document.visibilityState === "visible") wake();
  };

  async function synchronize() {
    if (running || stopped) return;
    running = true;
    try {
      await options.engine.flush();
      const cursor = await options.engine.pull(
        options.storage.getItem("smoke-notes:sync-cursor"),
      );
      options.storage.setItem("smoke-notes:sync-cursor", cursor);
      options.notify();
    } catch (error) {
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
