import { WebDialog } from "./glass/WebDialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link2, X } from "../icons";
import { LoadingStatus } from "./LoadingStatus";
import { DiamondGrid } from "./diamond-grid/DiamondGrid";
import type { PairingDetails } from "@smoke-notes/core";
import type { PairingController } from "../types";

interface PairingDialogProps {
  web?: boolean;
  controller?: PairingController;
  onClose: () => void;
  onRedeem?: (code: string) => Promise<void>;
}

export function PairingDialog({
  controller,
  onClose,
  web = false,
  onRedeem,
}: PairingDialogProps) {
  const [details, setDetails] = useState<PairingDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const create = useCallback(async () => {
    if (!controller) {
      setError("尚未配置 Supabase。离线记录仍可正常使用。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDetails(await controller.createPairing());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法建立配对码");
    } finally {
      setLoading(false);
    }
  }, [controller]);

  useEffect(() => {
    if (web && !controller) return;
    void create();
  }, [create, web, controller]);

  if (web && !controller) {
    return (
      <WebDialog web kind="pairing" label="配对设备" onClose={onClose}>
        <button
          type="button"
          className="pairing-close"
          aria-label="关闭设备配对"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <PairingGate
          embedded
          onSkip={onClose}
          onRedeem={
            onRedeem ??
            (async () => {
              throw new Error(
                "此本地预览未连接云端。请在正式网页的设置中配对；本机记录仍可正常使用。",
              );
            })
          }
        />
      </WebDialog>
    );
  }

  return (
    <WebDialog web={web} kind="pairing" label="连接手机" onClose={onClose}>
      <button
        type="button"
        className="pairing-close"
        aria-label="关闭手机配对"
        onClick={onClose}
      >
        <X size={18} />
      </button>
      <span className="pairing-icon">
        <Link2 size={21} />
      </span>
      <p className="eyebrow">PAIR A DEVICE</p>
      <h2>连接手机</h2>
      <p className="pairing-copy">
        用手机相机扫描二维码，或在手机网页输入下方 6 位码。
      </p>
      {loading && (
        <div className="pairing-loading">
          <LoadingStatus label="正在生成安全配对码…" />
        </div>
      )}
      {details && (
        <>
          <div className="qr-shell">
            <QRCodeSVG
              value={details.url}
              size={164}
              bgColor="transparent"
              fgColor="#eaf4f8"
              level="M"
            />
          </div>
          <div className="pairing-code" aria-label={`配对码 ${details.code}`}>
            {details.code.slice(0, 3)} <span>{details.code.slice(3)}</span>
          </div>
          <p className="pairing-expiry">5 分钟内有效 · 使用一次后失效</p>
        </>
      )}
      {error && <div className="pairing-error">{error}</div>}
      {!loading && !details && (
        <button
          type="button"
          className="pairing-retry"
          onClick={() => void create()}
        >
          重新尝试
        </button>
      )}
    </WebDialog>
  );
}

interface PairingGateProps {
  initialCode?: string | null;
  onRedeem: (code: string) => Promise<void>;
  onSkip?: () => void;
  embedded?: boolean;
}

export function PairingGate({
  initialCode,
  onRedeem,
  onSkip,
  embedded = false,
}: PairingGateProps) {
  const [code, setCode] = useState(initialCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);

  async function submit() {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
      await onRedeem(code);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "配对失败，请检查配对码",
      );
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return (
    <section
      className={`pairing-gate${embedded ? " pairing-gate-embedded" : ""}`}
    >
      <div className="pairing-gate-card">
        <span className="brand-mark">烟</span>
        <h1>连接你的烟笺</h1>
        <p>在电脑端打开「设置与同步 → 连接手机」，然后输入出现的 6 位码。</p>
        <p>也可以先在本机记录，稍后从「设置 → 手机与同步」配对。</p>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          aria-label="6 位配对码"
          placeholder="000 000"
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/[^0-9 ]/g, ""))
          }
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter") void submit();
          }}
        />
        <button type="button" disabled={loading} onClick={() => void submit()}>
          {loading ? (
            <span className="pairing-pending">
              <DiamondGrid />
              连接中…
            </span>
          ) : (
            "配对并同步"
          )}
        </button>
        {onSkip && (
          <button
            type="button"
            className="pairing-skip"
            disabled={loading}
            onClick={onSkip}
          >
            {embedded ? "稍后再配对" : "暂时跳过，先在本机使用"}
          </button>
        )}
        {error && (
          <div className="pairing-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
