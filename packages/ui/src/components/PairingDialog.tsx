import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link2, RefreshCw, X } from "lucide-react";
import type { PairingDetails } from "@smoke-notes/core";
import type { PairingController } from "../types";

interface PairingDialogProps {
  controller?: PairingController;
  onClose: () => void;
}

export function PairingDialog({ controller, onClose }: PairingDialogProps) {
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
    void create();
  }, [create]);

  return (
    <div className="pairing-backdrop">
      <section className="pairing-dialog" role="dialog" aria-label="连接手机">
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
            <RefreshCw size={18} />
            正在生成安全配对码…
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
      </section>
    </div>
  );
}

interface PairingGateProps {
  initialCode?: string | null;
  onRedeem: (code: string) => Promise<void>;
}

export function PairingGate({ initialCode, onRedeem }: PairingGateProps) {
  const [code, setCode] = useState(initialCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await onRedeem(code);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "配对失败，请检查配对码",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pairing-gate">
      <div className="pairing-gate-card">
        <span className="brand-mark">烟</span>
        <p className="eyebrow">SMOKE NOTES · MOBILE</p>
        <h1>连接你的烟笺</h1>
        <p>在电脑端打开「设置与同步 → 连接手机」，然后输入出现的 6 位码。</p>
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
            if (event.key === "Enter") void submit();
          }}
        />
        <button type="button" disabled={loading} onClick={() => void submit()}>
          {loading ? "连接中…" : "连接这台手机"}
        </button>
        {error && <div className="pairing-error">{error}</div>}
      </div>
    </main>
  );
}
