import { useEffect, useState } from "react";
import type { SyncStatus } from "@smoke-notes/core";
import { DiamondGrid } from "./diamond-grid/DiamondGrid";

export function SyncIndicator({ status }: { status?: SyncStatus }) {
  const [slow, setSlow] = useState(false);
  const syncing = status?.phase === "syncing";
  useEffect(() => {
    if (!syncing) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 300);
    return () => window.clearTimeout(timer);
  }, [syncing]);
  if (!status) return null;
  const labels = {
    syncing: "正在同步",
    synced: "已同步",
    retrying: "等待重试，内容已保存在本机",
    offline: "离线，内容已保存在本机，联网后自动同步",
    error: "同步失败，内容已保存在本机",
  };
  const label =
    labels[status.phase] +
    (status.pending ? `，${status.pending} 项待同步` : "");
  const visible =
    status.phase !== "synced" && (!syncing || status.initial || slow);
  return (
    <div
      className="sync-indicator"
      data-phase={status.phase}
      role="status"
      aria-live="polite"
      aria-label="同步状态"
      title={label}
    >
      <span className="sr-only">{label}</span>
      {visible &&
        (syncing ? (
          <DiamondGrid />
        ) : (
          <span className="sync-ring" aria-hidden="true" />
        ))}
    </div>
  );
}
