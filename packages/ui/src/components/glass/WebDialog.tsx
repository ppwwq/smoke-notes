import { useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { GlassSurface } from "./GlassSurface";

// Base UI owns focus trapping, Escape and focus restoration on both platforms. Theme changes
// leave the same modal and children mounted inside the existing app overlay.
export function WebDialog({
  web,
  kind,
  label,
  onClose,
  children,
}: {
  web: boolean;
  kind: "settings" | "pairing" | "actions" | "appearance";
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const portalHost = useRef<HTMLDivElement>(null);
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
        <div className={`${kind}-backdrop`}>
          <Dialog.Popup
            className={`${panel}${web ? " web-dialog" : ""}`}
            aria-label={label}
            finalFocus={() =>
              !returnTarget?.isConnected || returnTarget.closest("[inert]")
                ? document.querySelector<HTMLElement>(
                    '.sidebar-shell.mobile-open .sidebar-close, .mobile-note-header [aria-label="更多操作"], .web-dock button, [aria-label="打开便签本"]',
                  )
                : returnTarget
            }
          >
            {web && <GlassSurface kind="dialog" />}
            {children}
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
