import { WebDialog } from "./glass/WebDialog";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
  const [entering, setEntering] = useState(false);
  const redeem = controller?.redeemPairing?.bind(controller);

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
      {redeem &&
        (entering ? (
          <PairingGate
            embedded
            hint="在仍能同步的网页或手机上打开「设置与同步 → 连接手机」，输入出现的 6 位码。本机记录会保留，不会被覆盖。"
            onSkip={() => setEntering(false)}
            onRedeem={async (code) => {
              await redeem(code);
              onClose();
            }}
          />
        ) : (
          <button
            type="button"
            className="pairing-retry"
            onClick={() => setEntering(true)}
          >
            输入另一台设备的配对码
          </button>
        ))}
    </WebDialog>
  );
}

interface PairingGateProps {
  initialCode?: string | null;
  onRedeem: (code: string) => Promise<void>;
  onSkip?: () => void;
  embedded?: boolean;
  hint?: string;
}

export function PairingGate({
  initialCode,
  onRedeem,
  onSkip,
  embedded = false,
  hint,
}: PairingGateProps) {
  const [code, setCode] = useState(initialCode ?? "");
  const [connecting, setConnecting] = useState(
    embedded || !!initialCode || !onSkip,
  );
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);

  async function submit() {
    if (pending.current) return;
    const normalizedCode = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(normalizedCode)) {
      setError("请输入完整的 6 位配对码，可在电脑端的「连接手机」中找到。");
      return;
    }
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
      await onRedeem(normalizedCode);
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
        <span className="brand-mark" aria-hidden="true">
          J
        </span>
        <h1>{connecting ? "连接你的 Jotday" : "从一张便签开始"}</h1>
        {connecting ? (
          <>
            <p>
              {hint ??
                "在电脑端打开「设置与同步 → 连接手机」，然后输入出现的 6 位码。"}
            </p>
            <p>已有本机记录会保留，配对后可以在设备间接着写。</p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              aria-label="6 位配对码"
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              placeholder="000 000"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/[^0-9 ]/g, ""));
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229)
                  return;
                if (event.key === "Enter") void submit();
              }}
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => void submit()}
            >
              {loading ? (
                <span className="pairing-pending">
                  <DiamondGrid />
                  连接中…
                </span>
              ) : (
                "配对并同步"
              )}
            </button>
          </>
        ) : (
          <>
            <p>留住一个想法，写下今天的小计划。</p>
            <p>先在此浏览器保存；需要跨设备使用时，再从设置连接电脑。</p>
            <button type="button" onClick={onSkip}>
              开始记录
            </button>
            <button
              type="button"
              className="pairing-skip"
              onClick={() => setConnecting(true)}
            >
              连接已有设备
            </button>
            <p className="pairing-local-hint">
              本机记录仅在当前浏览器保存，清除网站数据会将它移除。
            </p>
          </>
        )}
        {onSkip && connecting && (
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
          <div id={errorId} className="pairing-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
