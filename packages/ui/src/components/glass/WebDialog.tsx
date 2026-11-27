import { useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { GlassSurface } from "./GlassSurface";
import { useWebViewport } from "../../useWebViewport";
import { isAndroidApp } from "../../android-host";

// Base UI owns focus trapping, Escape and focus restoration on both platforms. Theme changes
// leave the same modal and children mounted inside the existing app overlay.
export function WebDialog({
  web,
  kind,
  label,
  onClose,
  children,
  placement = "center",
  fallbackFocus,
}: {
  web: boolean;
  kind: "settings" | "pairing" | "actions" | "appearance";
  label: string;
  onClose: () => void;
  children: ReactNode;
  placement?: "center" | "top-end";
  fallbackFocus?: () => HTMLElement | null;
}) {
  const portalHost = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const calendarComposer = placement === "top-end";
  const androidSheet =
    web && isAndroidApp() && (calendarComposer || kind === "settings");
  const measureViewport = calendarComposer || androidSheet;
  const { style: viewportStyle } = useWebViewport(measureViewport);
  const [returnTarget] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const panel = kind === "pairing" ? "pairing-dialog" : `${kind}-panel`;
  // Record actions may originate inside clipped/translated cards. Keep their
  // modal in the themed app root, outside every scrolling card and drag layer.
  const appRoot = web
    ? document.querySelector<HTMLElement>(".platform-web")
    : null;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div ref={portalHost} style={{ display: "contents" }} />
      <Dialog.Portal container={appRoot ?? portalHost}>
        <div
          style={measureViewport ? viewportStyle : undefined}
          className={`${kind}-backdrop${calendarComposer ? " calendar-composer-backdrop" : ""}`}
          data-android-sheet={androidSheet || undefined}
        >
          <Dialog.Popup
            ref={popup}
            className={`${panel}${web ? " web-dialog" : ""}${calendarComposer ? " calendar-composer-panel" : ""}`}
            aria-label={label}
            initialFocus={
              androidSheet ? () => popup.current ?? false : undefined
            }
            finalFocus={() =>
              returnTarget?.closest(".family-popup")
                ? document.querySelector<HTMLElement>(".family-trigger")
                : !returnTarget?.isConnected ||
                    returnTarget.closest("[inert], [hidden]")
                  ? (fallbackFocus?.() ??
                    document.querySelector<HTMLElement>(
                      '.mobile-note-header [aria-label="更多操作"], .web-dock button, [aria-label="打开便签本"]',
                    ))
                  : returnTarget
            }
          >
            {web && !androidSheet && <GlassSurface kind="dialog" />}
            {children}
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
