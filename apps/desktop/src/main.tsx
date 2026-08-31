import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  LocalRepository,
  SmokeNotesDatabase,
  SupabaseCloud,
  SyncEngine,
  createSyncRuntime,
  type CloudConfig,
} from "@smoke-notes/core";
import {
  NoteWindowApp,
  SmokeNotesApp,
  type PairingController,
} from "@smoke-notes/ui";
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
  const config = cloudConfig();
  const cloud = config ? new SupabaseCloud(config) : null;
  let workspaceId = localStorage.getItem("smoke-notes:workspace-id");
  if (cloud) {
    await cloud.ensureAnonymousSession();
    if (!workspaceId) {
      workspaceId = await cloud.bootstrapWorkspace();
      localStorage.setItem("smoke-notes:workspace-id", workspaceId);
    }
  }
  workspaceId ??= persistentId("smoke-notes:workspace-id");
  const deviceId = persistentId("smoke-notes:device-id");
  const database = new SmokeNotesDatabase("smoke-notes-desktop");
  const repository = new LocalRepository(database, { workspaceId, deviceId });
  const noteId = new URLSearchParams(window.location.search).get("noteId");
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
    ? { createPairing: () => cloud.createPairing(workspaceId!) }
    : undefined;

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {noteId ? (
        <NoteWindowApp
          repository={repository}
          noteId={noteId}
          bridge={window.smokeDesktop}
        />
      ) : (
        <SmokeNotesApp
          repository={repository}
          platform="desktop"
          desktopBridge={window.smokeDesktop}
          pairingController={pairingController}
        />
      )}
    </StrictMode>,
  );

  if (cloud && !noteId) {
    const engine = new SyncEngine(database, cloud.syncAdapter, { deviceId });
    const runtime = createSyncRuntime({
      engine,
      cloud,
      storage: localStorage,
      notify: () =>
        window.dispatchEvent(new CustomEvent("smoke-notes:data-changed")),
      onError: (error) => console.warn("Background sync paused", error),
    });
    await runtime.start();
    window.addEventListener("beforeunload", () => runtime.stop(), {
      once: true,
    });
  }
  window.addEventListener("beforeunload", () => dataChannel.close(), {
    once: true,
  });
}

void bootstrap();
