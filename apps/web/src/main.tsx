import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  LocalRepository,
  SmokeNotesDatabase,
  SupabaseCloud,
  SyncEngine,
  createSyncRuntime,
  pairingCodeFromUrl,
  type CloudConfig,
  type SyncStatus,
} from "@smoke-notes/core";
import { SmokeNotesApp } from "@smoke-notes/ui/app";
import { PairingGate } from "@smoke-notes/ui/pairing";
import "./web.css";
import "./brand.css";
import "./glass.css";

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
  const webUrl = import.meta.env.VITE_WEB_APP_URL || window.location.origin;
  return url && publishableKey ? { url, publishableKey, webUrl } : null;
}

async function bootstrap() {
  const root = createRoot(document.getElementById("root")!);
  const config = cloudConfig();
  const cloud = config ? new SupabaseCloud(config) : null;
  let workspaceId = localStorage.getItem("smoke-notes:workspace-id");
  const linkCode = pairingCodeFromUrl(window.location.href);

  if (cloud && !workspaceId) {
    root.render(
      <StrictMode>
        <PairingGate
          initialCode={linkCode}
          onRedeem={async (code) => {
            workspaceId = await cloud.redeemPairing(code);
            localStorage.setItem("smoke-notes:workspace-id", workspaceId);
            window.history.replaceState({}, "", window.location.pathname);
            window.location.reload();
          }}
        />
      </StrictMode>,
    );
    return;
  }

  workspaceId ??= persistentId("smoke-notes:workspace-id");
  const deviceId = persistentId("smoke-notes:device-id");
  const database = new SmokeNotesDatabase("smoke-notes-web");
  const repository = new LocalRepository(database, { workspaceId, deviceId });
  let syncStatus: SyncStatus | undefined = cloud
    ? {
        phase: navigator.onLine ? "syncing" : "offline",
        pending: 0,
        initial: true,
      }
    : undefined;
  const renderApp = () =>
    root.render(
      <StrictMode>
        <SmokeNotesApp
          repository={repository}
          platform="web"
          syncStatus={syncStatus}
        />
      </StrictMode>,
    );
  renderApp();

  if (cloud) {
    const engine = new SyncEngine(database, cloud.syncAdapter, { deviceId });
    const runtime = createSyncRuntime({
      engine: {
        async flush() {
          await cloud.ensureAnonymousSession();
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
        renderApp();
      },
    });
    await runtime.start();
    window.addEventListener("beforeunload", () => runtime.stop(), {
      once: true,
    });
  }
}

void bootstrap();
