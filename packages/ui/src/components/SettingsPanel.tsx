import { WebDialog } from "./glass/WebDialog";
import { useEffect, useRef, useState } from "react";
import type { TrashRecord } from "@smoke-notes/core";
import {
  ArchiveRestore,
  Link2,
  Pin,
  Power,
  SlidersHorizontal,
  X,
  ArrowLeft,
  ChevronRight,
  Appearance as Palette,
} from "../icons";
import type { DesktopBridge } from "../types";
import type { WebBackground } from "../useWebBackground";

interface SettingsPanelProps {
  bridge?: DesktopBridge;
  webBackground?: WebBackground;
  onWebBackgroundChange?: (value: WebBackground) => void;
  backgroundNotice?: string;
  reduceTransparency?: boolean;
  systemReduced?: boolean;
  onReduceTransparencyChange?: (value: boolean) => void;
  trash: TrashRecord[];
  onClose: () => void;
  onRestore: (item: TrashRecord) => Promise<void>;
  onOpenPairing: () => void;
  onBackgroundOpacityChange?: (value: number) => void;
  todoBoundaryHour?: 0 | 4;
  onTodoBoundaryChange?: (hour: 0 | 4) => Promise<void>;
  syncMessage?: string;
}

export function SettingsPanel({
  bridge,
  webBackground,
  onWebBackgroundChange,
  backgroundNotice,
  reduceTransparency,
  systemReduced,
  onReduceTransparencyChange,
  trash,
  onClose,
  onRestore,
  onOpenPairing,
  onBackgroundOpacityChange,
  todoBoundaryHour = 0,
  onTodoBoundaryChange,
  syncMessage,
}: SettingsPanelProps) {
  const [opacity, setOpacity] = useState(0.82);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [launchAtLoginBusy, setLaunchAtLoginBusy] = useState(Boolean(bridge));
  const launchAtLoginRequest = useRef(0);
  const [section, setSection] = useState<
    "overview" | "appearance" | "sync" | "trash"
  >("overview");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const restorePending = useRef(false);
  const [restoreError, setRestoreError] = useState("");
  const [boundaryBusy, setBoundaryBusy] = useState(false);
  const [boundaryError, setBoundaryError] = useState("");
  const web = webBackground !== undefined;

  useEffect(() => {
    if (!bridge) return;
    void bridge.getWindowState().then((state) => {
      setOpacity(state.backgroundOpacity);
      setAlwaysOnTop(state.alwaysOnTop);
    });
  }, [bridge]);

  useEffect(() => {
    const requestId = ++launchAtLoginRequest.current;
    if (!bridge) {
      setLaunchAtLoginBusy(false);
      return;
    }
    setLaunchAtLoginBusy(true);
    void bridge
      .getLaunchAtLogin()
      .then((value) => {
        if (launchAtLoginRequest.current !== requestId) return;
        setLaunchAtLogin(value);
        setLaunchAtLoginBusy(false);
      })
      .catch(() => {
        if (launchAtLoginRequest.current !== requestId) return;
        setLaunchAtLogin(false);
        setLaunchAtLoginBusy(false);
      });
    return () => {
      launchAtLoginRequest.current += 1;
    };
  }, [bridge]);

  return (
    <WebDialog web={web} kind="settings" label="设置与同步" onClose={onClose}>
      <header>
        <div>
          {web && section !== "overview" && (
            <button
              type="button"
              className="settings-back"
              aria-label="返回设置"
              onClick={() => setSection("overview")}
            >
              <ArrowLeft size={16} />
              设置
            </button>
          )}
          <p className="eyebrow">PREFERENCES</p>
          <h2>
            {web
              ? {
                  overview: "设置",
                  appearance: "外观与阅读",
                  sync: "手机与同步",
                  trash: "最近删除",
                }[section]
              : "设置与同步"}
          </h2>
        </div>
        <button type="button" aria-label="关闭设置" onClick={onClose}>
          <X size={18} />
        </button>
      </header>

      {web && section === "overview" && (
        <div className="settings-sections">
          <button
            type="button"
            className="settings-entry"
            onClick={() => setSection("appearance")}
          >
            <Palette size={22} />
            <span>
              <strong>外观与阅读</strong>
              <small>背景、纸面与透明效果</small>
            </span>
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="settings-entry"
            onClick={() => setSection("sync")}
          >
            <Link2 size={22} />
            <span>
              <strong>手机与同步</strong>
              <small>连接设备，接续记录</small>
            </span>
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="settings-entry"
            onClick={() => {
              setRestoreError("");
              setSection("trash");
            }}
          >
            <ArchiveRestore size={22} />
            <span>
              <strong>最近删除</strong>
              <small>
                {trash.length
                  ? `${trash.length} 项内容可恢复`
                  : "这里收好暂时移走的内容"}
              </small>
            </span>
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {webBackground !== undefined && section === "appearance" && (
        <div className="settings-group">
          <h3>外观</h3>
          <fieldset className="web-background-options">
            <legend>背景</legend>
            {(["default", "paper", "glass"] as const).map((value) => (
              <label className="web-background-option" key={value}>
                <input
                  type="radio"
                  name="web-background"
                  value={value}
                  checked={webBackground === value}
                  onChange={() => onWebBackgroundChange?.(value)}
                />
                <span
                  className={`background-preview background-preview-${value}`}
                  aria-hidden="true"
                />
                <span>
                  {value === "paper"
                    ? "纸面模式"
                    : value === "glass"
                      ? "玻璃模式"
                      : "默认模式"}
                  <small>
                    {value === "paper"
                      ? "米黄色横线纸"
                      : value === "glass"
                        ? "通透边缘与柔和高光"
                        : "暖白底色与柔和色块"}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="switch-setting">
            <span>减少透明效果</span>
            <button
              type="button"
              role="switch"
              aria-label="减少透明效果"
              aria-checked={!!reduceTransparency}
              className={reduceTransparency ? "on" : ""}
              onClick={() => onReduceTransparencyChange?.(!reduceTransparency)}
            >
              <span />
            </button>
          </label>
          {systemReduced && <p>已跟随系统使用清晰实底。</p>}
          <p>应用于整个网页界面，记住此浏览器的选择。</p>
          {backgroundNotice && <p role="status">{backgroundNotice}</p>}
        </div>
      )}

      {onTodoBoundaryChange && (!web || section === "overview") && (
        <details className="planner-disclosure settings-todo-planning">
          <summary>每日待办</summary>
          <div className="planner-disclosure-body">
            <label>
              换日时间（香港时间）
              <select
                aria-label="待办换日时间"
                value={todoBoundaryHour}
                disabled={boundaryBusy}
                onChange={async (event) => {
                  const next = Number(event.target.value) === 4 ? 4 : 0;
                  setBoundaryBusy(true);
                  setBoundaryError("");
                  try {
                    await onTodoBoundaryChange(next);
                  } catch {
                    setBoundaryError(
                      "保存失败，原来的换日设置已保留，请重试。",
                    );
                  } finally {
                    setBoundaryBusy(false);
                  }
                }}
              >
                <option value={0}>00:00</option>
                <option value={4}>04:00</option>
              </select>
            </label>
            <p>每次打开会补算日期；电脑不必一直开着。历史记录会保留。</p>
            <p>关闭网页后不会发送通知。</p>
            {boundaryError && <p role="alert">{boundaryError}</p>}
          </div>
        </details>
      )}

      {bridge && (
        <div className="settings-group">
          <h3>
            <SlidersHorizontal size={16} />
            窗口
          </h3>
          <label className="slider-setting">
            <span>
              透明度 <b>{Math.round(opacity * 100)}%</b>
            </span>
            <input
              type="range"
              min="45"
              max="100"
              value={Math.round(opacity * 100)}
              aria-label="窗口透明度"
              onChange={(event) => {
                const value = Number(event.target.value) / 100;
                setOpacity(value);
                onBackgroundOpacityChange?.(value);
                void bridge.setBackgroundOpacity(value);
              }}
            />
          </label>
          <label className="switch-setting">
            <span>
              <Pin size={15} />
              窗口置顶
            </span>
            <button
              type="button"
              role="switch"
              aria-label="窗口置顶"
              aria-checked={alwaysOnTop}
              className={alwaysOnTop ? "on" : ""}
              onClick={() => {
                const value = !alwaysOnTop;
                setAlwaysOnTop(value);
                void bridge.setAlwaysOnTop(value);
              }}
            >
              <span />
            </button>
          </label>
          <label className="switch-setting launch-setting">
            <span>
              <Power size={15} />
              <span className="setting-copy">
                开机时启动
                <small>登录 Windows 后只恢复已打开便签，主页面保持隐藏</small>
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-label="开机时启动"
              aria-checked={launchAtLogin}
              className={launchAtLogin ? "on" : ""}
              disabled={launchAtLoginBusy}
              onClick={() => {
                if (launchAtLoginBusy) return;
                const previous = launchAtLogin;
                const requested = !previous;
                const requestId = ++launchAtLoginRequest.current;
                setLaunchAtLogin(requested);
                setLaunchAtLoginBusy(true);
                void bridge
                  .setLaunchAtLogin(requested)
                  .then((value) => {
                    if (launchAtLoginRequest.current !== requestId) return;
                    setLaunchAtLogin(value);
                    setLaunchAtLoginBusy(false);
                  })
                  .catch(() => {
                    if (launchAtLoginRequest.current !== requestId) return;
                    setLaunchAtLogin(previous);
                    setLaunchAtLoginBusy(false);
                  });
              }}
            >
              <span />
            </button>
          </label>
        </div>
      )}

      <div className="settings-group" hidden={web && section !== "sync"}>
        <h3>
          <Link2 size={16} />
          手机同步
        </h3>
        {syncMessage && <p role="status">{syncMessage}</p>}
        <p>
          {web
            ? "连接设备，让便签在手机与电脑之间接续。"
            : "生成一次性二维码和 6 位码，将手机加入你的私人空间。"}
        </p>
        <button
          type="button"
          className="pairing-action"
          onClick={onOpenPairing}
        >
          {web ? "配对设备" : "连接手机"}
        </button>
      </div>

      <div
        className="settings-group trash-group"
        hidden={web && section !== "trash"}
      >
        <h3>
          <ArchiveRestore size={16} />
          最近删除
        </h3>
        {trash.length === 0 ? (
          <p>最近删除中没有内容。</p>
        ) : (
          trash.map((item) => (
            <div className="trash-row" key={`${item.entity}-${item.record.id}`}>
              <span>
                {"name" in item.record
                  ? item.record.name
                  : "title" in item.record
                    ? item.record.title
                    : item.record.text}
              </span>
              <button
                type="button"
                disabled={restoreBusy}
                onClick={async () => {
                  if (restorePending.current) return;
                  restorePending.current = true;
                  setRestoreBusy(true);
                  setRestoreError("");
                  try {
                    await onRestore(item);
                  } catch {
                    setRestoreError("恢复失败，内容仍在最近删除中，请重试。");
                  } finally {
                    restorePending.current = false;
                    setRestoreBusy(false);
                  }
                }}
              >
                恢复
              </button>
            </div>
          ))
        )}
        {restoreError && <p role="alert">{restoreError}</p>}
      </div>
    </WebDialog>
  );
}
