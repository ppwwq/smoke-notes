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
import { bindIOSNativeActions } from "@smoke-notes/ui/android-host";
import { PairingGate } from "@smoke-notes/ui/pairing";
import { adoptLocalWorkspace } from "./local-workspace";
import {
  buildAndroidBackupJson,
  getAndroidBridge,
  migrateAndroidLegacyData,
} from "./android-bridge";
import { getIOSBridge } from "./ios-bridge";
import "@smoke-notes/ui/workspace.css";
import "./brand.css";

function persistentId(key: string): string {
  const current = localStorage.getItem(key);
  if (current) return current;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

function cloudConfig(isNative: boolean): CloudConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const webUrl =
    import.meta.env.VITE_WEB_APP_URL ||
    (isNative
      ? "https://smoke-notes-philipwwq.pages.dev"
      : window.location.origin);
  return url && publishableKey ? { url, publishableKey, webUrl } : null;
}

async function bootstrap() {
  const root = createRoot(document.getElementById("root")!);
  const androidBridge = getAndroidBridge();
  const iosBridge =
    import.meta.env.JOTDAY_IOS_HOST === "true"
      ? getIOSBridge(window)
      : undefined;
  if (androidBridge) document.documentElement.dataset.androidApp = "true";
  if (iosBridge) {
    document.documentElement.dataset.iosApp = "true";
    bindIOSNativeActions(iosBridge);
  }
  const nativeBridge = androidBridge ?? iosBridge;
  const config = cloudConfig(!!nativeBridge);
  const cloud = config ? new SupabaseCloud(config) : null;
  const deviceId = persistentId("smoke-notes:device-id");
  const database = new SmokeNotesDatabase("smoke-notes-web");
  if (nativeBridge) {
    window.__jotdayNativeAction = (action) => {
      window.__jotdayPendingAction = action;
      window.dispatchEvent(
        new CustomEvent("jotday:native-action", { detail: action }),
      );
    };
  }
  if (androidBridge) await migrateAndroidLegacyData(database, cloud, deviceId);
  let workspaceId = localStorage.getItem("smoke-notes:workspace-id");
  const linkCode = pairingCodeFromUrl(window.location.href);
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
    let gateListener: ((event: Event) => void) | null = null;
    const clearGateListener = () => {
      if (gateListener) {
        window.removeEventListener("jotday:native-action", gateListener);
        gateListener = null;
      }
    };
    const renderGate = (pairCode: string | null) =>
      root.render(
        <StrictMode>
          <PairingGate
            key={pairCode ?? "gate"}
            initialCode={pairCode}
            onRedeem={async (code) => {
              await redeem(code);
              clearGateListener();
            }}
            onSkip={() => {
              clearGateListener();
              return skip();
            }}
          />
        </StrictMode>,
      );
    if (nativeBridge) {
      gateListener = (event: Event) => {
        const action = (event as CustomEvent<{ pairCode?: string }>).detail;
        if (action?.pairCode) renderGate(action.pairCode);
      };
      window.addEventListener("jotday:native-action", gateListener);
    }
    const initialPairCode =
      linkCode ?? window.__jotdayPendingAction?.pairCode ?? null;
    renderGate(initialPairCode);
    nativeBridge?.onAppReady?.();
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
        ? {
            createPairing: () => cloud.createPairing(activeWorkspaceId),
            redeemPairing: redeem,
          }
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
            androidBridge={nativeBridge}
            onExportBackup={
              nativeBridge
                ? () => buildAndroidBackupJson(database, activeWorkspaceId)
                : undefined
            }
            syncStatus={syncStatus}
            onRedeemPairing={redeem}
            pairingController={pairingController}
          />
        </StrictMode>,
      );
    renderApp();
    nativeBridge?.onAppReady?.();

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
          pull: (cursor) => engine.pull(cursor),
          getQueueState: () => engine.getQueueState(),
        },
        // Calendar runs as its own step so a calendar error cannot block notes.
        calendar: planner,
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
