import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  LocalRepository,
  SmokeNotesDatabase,
  SupabaseCloud,
  SyncEngine,
  createSyncRuntime,
  type CloudConfig,
  type SyncStatus,
} from "@smoke-notes/core";
import type { PairingController } from "@smoke-notes/ui";
import "@smoke-notes/ui/styles.css";
import "./shell.css";

function persistentId(key: string): string {
  const current = localStorage.getItem(key);
  if (current) return current;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

function cloudConfig(): CloudConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const webUrl = import.meta.env.VITE_WEB_APP_URL;
  return url && publishableKey && webUrl
    ? { url, publishableKey, webUrl }
    : null;
}

async function bootstrap() {
  const noteId = new URLSearchParams(window.location.search).get("noteId");
  const previewMode = (await window.smokeDesktop.getPreviewMode?.()) === true;
  const config = previewMode ? null : cloudConfig();
  // Only the main renderer owns cloud authentication and background sync.
  const cloud = config && !noteId ? new SupabaseCloud(config) : null;
  const workspaceId = persistentId("smoke-notes:workspace-id");
  const deviceId = persistentId("smoke-notes:device-id");
  const database = new SmokeNotesDatabase(
    previewMode ? "smoke-notes-preview" : "smoke-notes-desktop",
  );
  const repository = new LocalRepository(database, { workspaceId, deviceId });
  const dataChannel = new BroadcastChannel("smoke-notes:data");
  dataChannel.onmessage = () =>
    window.dispatchEvent(
      new CustomEvent("smoke-notes:data-changed", { detail: { remote: true } }),
    );
  window.addEventListener("smoke-notes:data-changed", (event) => {
    if (!(event as CustomEvent).detail?.remote)
      dataChannel.postMessage("changed");
  });
  const pairingController: PairingController | undefined = cloud
    ? {
        createPairing: async () => {
          await cloud.enrollLocalWorkspace(workspaceId);
          return cloud.createPairing(workspaceId);
        },
      }
    : undefined;

  const root = createRoot(document.getElementById("root")!);
  let syncStatus: SyncStatus | undefined = cloud
    ? {
        phase: navigator.onLine ? "syncing" : "offline",
        pending: 0,
        initial: true,
      }
    : undefined;
  let renderMain: (() => void) | undefined;
  if (noteId) {
    const { NoteWindowApp } = await import("@smoke-notes/ui/note-window");
    root.render(
      <StrictMode>
        <NoteWindowApp
          repository={repository}
          noteId={noteId}
          bridge={window.smokeDesktop}
        />
      </StrictMode>,
    );
  } else {
    const { SmokeNotesApp } = await import("@smoke-notes/ui/app");
    renderMain = () =>
      root.render(
        <StrictMode>
          <SmokeNotesApp
            repository={repository}
            platform="desktop"
            desktopBridge={window.smokeDesktop}
            pairingController={pairingController}
            syncStatus={syncStatus}
          />
        </StrictMode>,
      );
    renderMain();
  }

  if (cloud && !noteId) {
    const engine = new SyncEngine(database, cloud.syncAdapter, { deviceId });
    // Enrollment retries with each sync cycle; offline startup never blocks rendering.
    const runtime = createSyncRuntime({
      engine: {
        async flush() {
          await cloud.enrollLocalWorkspace(workspaceId);
          return engine.flush();
        },
        pull: (cursor) => engine.pull(cursor),
        getQueueState: () => engine.getQueueState(),
      },
      cloud,
      storage: localStorage,
      notify: () =>
        window.dispatchEvent(new CustomEvent("smoke-notes:data-changed")),
      onError: (error) => console.warn("Background sync paused", error),
      onStatusChange: (status) => {
        syncStatus = status;
        renderMain?.();
      },
    });
    await runtime.start();
    window.addEventListener("beforeunload", () => runtime.stop(), {
      once: true,
    });
  }
  window.addEventListener("beforeunload", () => dataChannel.close(), {
    once: true,
  });
  if (previewMode && !noteId) {
    const notebooks = await repository.listNotebooks();
    const notebook =
      notebooks[0] ?? (await repository.createNotebook("隔离预览 · 示例"));
    const notes = await repository.listNotes(notebook.id);
    const sample =
      notes[0] ??
      (await repository.createNote(notebook.id, {
        title: "留一点空白",
        body: "今天，慢慢做好三件事。\n\n整理桌面，给灵感留个位置。\n读几页书，记下一句喜欢的话。\n傍晚出去走走。",
        color: "sky",
      }));
    await window.smokeDesktop.openNote(sample.id);
  }
}

void bootstrap();
