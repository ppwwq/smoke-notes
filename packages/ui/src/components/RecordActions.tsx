import { useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, Pencil, Trash2, X } from "../icons";
import { WebDialog } from "./glass/WebDialog";

/** Secondary record actions, separate from opening/editing/completing a record. */
export function RecordActions({
  name,
  kind,
  onTrash,
  onRename,
  renameLabel,
  children,
}: {
  name: string;
  kind: "便签" | "待办" | "便签本";
  onTrash(): Promise<void>;
  onRename?(): void;
  renameLabel?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    if (!pending.current) setOpen(false);
  };
  return (
    <div className="record-actions">
      <button
        type="button"
        className="record-actions-trigger"
        ref={trigger}
        aria-label={`更多${kind}操作：${name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <MoreHorizontal size={19} />
      </button>
      {open && (
        <WebDialog
          web
          kind="actions"
          label={`${kind}操作：${name}`}
          onClose={close}
        >
          <header>
            <div>
              <p className="eyebrow">{kind}操作</p>
              <h2>{name}</h2>
            </div>
            <button
              type="button"
              aria-label="关闭操作"
              disabled={busy}
              onClick={close}
            >
              <X size={20} />
            </button>
          </header>
          {children}
          {onRename && (
            <button
              type="button"
              className="action-row"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                requestAnimationFrame(onRename);
              }}
            >
              <Pencil size={19} />
              <span>{renameLabel ?? `重命名${kind}`}</span>
            </button>
          )}
          <button
            type="button"
            className="action-row destructive-action"
            aria-label={`删除${kind}：${name}`}
            disabled={busy}
            onClick={async () => {
              if (pending.current) return;
              pending.current = true;
              setBusy(true);
              setError("");
              try {
                await onTrash();
                setOpen(false);
                // The deleted record may unmount this entire dialog before the
                // modal can restore focus to its now-removed trigger.
                requestAnimationFrame(() => {
                  if (!trigger.current?.isConnected) {
                    document
                      .querySelector<HTMLElement>(
                        '.sidebar-shell.mobile-open .sidebar-close, .web-dock [aria-current="page"]',
                      )
                      ?.focus();
                  }
                });
              } catch {
                setError("删除失败，内容仍然保留，请重试。");
              } finally {
                pending.current = false;
                setBusy(false);
              }
            }}
          >
            <Trash2 size={19} />
            <span>
              {busy ? "正在移入最近删除…" : "移入最近删除"}
              <small>可以撤销，也可以稍后恢复。</small>
            </span>
          </button>
          {error && (
            <p role="alert" className="action-error">
              {error}
            </p>
          )}
        </WebDialog>
      )}
    </div>
  );
}
