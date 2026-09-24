import { useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { GlassSurface } from "./GlassSurface";

// Base UI owns web focus trapping, Escape and focus restoration. Theme changes
// leave the same modal and children mounted inside the existing app overlay.
export function WebDialog({
  web,
  kind,
  label,
  onClose,
  children,
}: {
  web: boolean;
  kind: "settings" | "pairing";
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
  const panel = kind === "settings" ? "settings-panel" : "pairing-dialog";
  if (!web)
    return (
      <div className={`${kind}-backdrop`}>
        <section className={panel} role="dialog" aria-label={label}>
          {children}
        </section>
      </div>
    );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div ref={portalHost} style={{ display: "contents" }} />
      <Dialog.Portal container={portalHost}>
        <div className={`${kind}-backdrop`}>
          <Dialog.Popup
            className={`${panel} web-dialog`}
            aria-label={label}
            finalFocus={() => returnTarget}
          >
            <GlassSurface kind="dialog" />
            {children}
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
