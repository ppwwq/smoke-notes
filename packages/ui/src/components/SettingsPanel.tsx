import { useEffect, useRef, useState } from "react";
import type { TrashRecord } from "@smoke-notes/core";
import {
  ArchiveRestore,
  Link2,
  Pin,
  Power,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { DesktopBridge } from "../types";

interface SettingsPanelProps {
  bridge?: DesktopBridge;
  trash: TrashRecord[];
  onClose: () => void;
  onRestore: (item: TrashRecord) => Promise<void>;
  onOpenPairing: () => void;
  onBackgroundOpacityChange?: (value: number) => void;
}

export function SettingsPanel({
  bridge,
  trash,
  onClose,
  onRestore,
  onOpenPairing,
  onBackgroundOpacityChange,
}: SettingsPanelProps) {
  const [opacity, setOpacity] = useState(0.82);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [launchAtLoginBusy, setLaunchAtLoginBusy] = useState(Boolean(bridge));
  const launchAtLoginRequest = useRef(0);

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
    <div className="settings-backdrop" role="presentation">
      <section className="settings-panel" role="dialog" aria-label="设置与同步">
        <header>
          <div>
            <p className="eyebrow">PREFERENCES</p>
            <h2>设置与同步</h2>
          </div>
          <button type="button" aria-label="关闭设置" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

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
                  <small>登录 Windows 后自动显示主窗口</small>
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

        <div className="settings-group">
          <h3>
            <Link2 size={16} />
            手机同步
          </h3>
          <p>生成一次性二维码和 6 位码，将手机加入你的私人空间。</p>
          <button
            type="button"
            className="pairing-action"
            onClick={onOpenPairing}
          >
            连接手机
          </button>
        </div>

        <div className="settings-group trash-group">
          <h3>
            <ArchiveRestore size={16} />
            最近删除
          </h3>
          {trash.length === 0 ? (
            <p>最近删除中没有内容。</p>
          ) : (
            trash.map((item) => (
              <div
                className="trash-row"
                key={`${item.entity}-${item.record.id}`}
              >
                <span>
                  {"name" in item.record
                    ? item.record.name
                    : "title" in item.record
                      ? item.record.title
                      : item.record.text}
                </span>
                <button type="button" onClick={() => void onRestore(item)}>
                  恢复
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
