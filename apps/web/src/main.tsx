import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  LocalRepository,
  SmokeNotesDatabase,
  SupabaseCloud,
  SyncEngine,
  PlannerSyncEngine,
  supabasePlannerTransport,
  createSyncRuntime,
  pairingCodeFromUrl,
  type CloudConfig,
  type SyncStatus,
} from "@smoke-notes/core";
import { SmokeNotesApp } from "@smoke-notes/ui/app";
import { PairingGate } from "@smoke-notes/ui/pairing";
import { adoptLocalWorkspace } from "./local-workspace";
import "@smoke-notes/ui/workspace.css";
import "./brand.css";

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
  const deviceId = persistentId("smoke-notes:device-id");
  const database = new SmokeNotesDatabase("smoke-notes-web");
  let runtime: ReturnType<typeof createSyncRuntime> | undefined;
  const isLocal = () =>
    !cloud || localStorage.getItem("smoke-notes:local-only") === workspaceId;
  window.addEventListener(
    "beforeunload",
    () => {
      runtime?.stop();
      database.close();
    },
    { once: true },
  );

  async function redeem(code: string) {
    if (!cloud) throw new Error("当前未启用云端同步，仍可在本机记录。");
    const nextWorkspace = await cloud.redeemPairing(code);
    if (workspaceId && isLocal()) {
      await adoptLocalWorkspace(database, workspaceId, nextWorkspace, deviceId);
    }
    workspaceId = nextWorkspace;
    localStorage.setItem("smoke-notes:workspace-id", workspaceId);
    localStorage.removeItem("smoke-notes:local-only");
    localStorage.removeItem("smoke-notes:sync-cursor");
    window.history.replaceState({}, "", window.location.pathname);
    await openWorkspace();
  }

  function skip() {
    workspaceId = persistentId("smoke-notes:workspace-id");
    localStorage.setItem("smoke-notes:local-only", workspaceId);
    window.history.replaceState({}, "", window.location.pathname);
    return openWorkspace();
  }

  if (cloud && (!workspaceId || (isLocal() && linkCode))) {
    root.render(
      <StrictMode>
        <PairingGate initialCode={linkCode} onRedeem={redeem} onSkip={skip} />
      </StrictMode>,
    );
    return;
  }

  await openWorkspace();

  async function openWorkspace() {
    runtime?.stop();
    const firstLocalWorkspace = !cloud && !workspaceId;
    workspaceId ??= persistentId("smoke-notes:workspace-id");
    if (firstLocalWorkspace)
      localStorage.setItem("smoke-notes:local-only", workspaceId);
    const syncEnabled = cloud && !isLocal();
    const activeWorkspaceId = workspaceId;
    const repository = new LocalRepository(database, { workspaceId, deviceId });
    const pairingController =
      syncEnabled && cloud
        ? { createPairing: () => cloud.createPairing(activeWorkspaceId) }
        : undefined;
    let syncStatus: SyncStatus | undefined = syncEnabled
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
            key={workspaceId}
            repository={repository}
            platform="web"
            syncStatus={syncStatus}
            onRedeemPairing={redeem}
            pairingController={pairingController}
          />
        </StrictMode>,
      );
    renderApp();

    if (syncEnabled && cloud) {
      const engine = new SyncEngine(database, cloud.syncAdapter, { deviceId });
      const planner = new PlannerSyncEngine(
        database,
        supabasePlannerTransport(cloud.client),
        activeWorkspaceId,
      );
      runtime = createSyncRuntime({
        engine: {
          async flush() {
            await cloud.ensureAnonymousSession();
            return engine.flush();
          },
          async pull(cursor) {
            const next = await engine.pull(cursor);
            await planner.synchronize();
            return next;
          },
          async getQueueState() {
            const queue = await engine.getQueueState();
            return {
              ...queue,
              pending: queue.pending + (await planner.pendingCount()),
            };
          },
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
    }
  }
}

void bootstrap();
