/**
 * Adapted from Cult UI Family Button, MIT, Copyright (c) 2023 Jordan-Gilliam.
 * Source: https://www.cult-ui.com/r/family-button.json — see LICENSE.md.
 * Retains the expanding rounded shell, Motion layout spring and rotating toggle.
 * Local additions: controlled state, native buttons, Base UI focus management,
 * persistent children, responsive sizing and reduced-motion support.
 */
import { useId, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { motion, useReducedMotion } from "motion/react";
import { PlusIcon, XIcon } from "lucide-react";
import "./family-button.css";

interface FamilyButtonProps {
  children: ReactNode;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  label?: string;
}

export { FamilyButton };

export default function FamilyButton({
  children,
  open: controlledOpen,
  onOpenChange,
  label = "新建",
}: FamilyButtonProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const reduced = useReducedMotion();
  const portalHost = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const titleId = useId();
  function changeOpen(next: boolean) {
    setLocalOpen(next);
    onOpenChange?.(next);
  }
  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Backdrop className="family-backdrop" />
      <motion.div
        className="family-frame"
        data-expanded={open || undefined}
        layout={!reduced}
        initial={false}
        transition={
          reduced
            ? { duration: 0 }
            : open
              ? { type: "spring", damping: 25, stiffness: 400 }
              : { type: "spring", damping: 36, stiffness: 420, mass: 0.9 }
        }
        style={{ borderRadius: open ? 28 : 24 }}
      >
        <Dialog.Trigger
          ref={trigger}
          className="family-trigger"
          aria-label={label}
          hidden={open}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              changeOpen(true);
            }
          }}
        >
          <PlusIcon size={21} aria-hidden="true" />
          <span>新建</span>
        </Dialog.Trigger>
        <div ref={portalHost} style={{ display: "contents" }} />
        <Dialog.Portal container={portalHost} keepMounted>
          <Dialog.Popup
            ref={popup}
            className="family-popup"
            aria-labelledby={titleId}
            initialFocus={() =>
              popup.current?.querySelector<HTMLElement>(
                "[data-create-focus]:not([hidden])",
              ) ?? true
            }
            finalFocus={() => {
              const editor = document.querySelector<HTMLElement>(
                ".mobile-note-screen .rich-note-title",
              );
              return editor ?? trigger.current;
            }}
          >
            <header className="family-heading">
              <div>
                <p>留住想法，安排日常</p>
                <Dialog.Title id={titleId}>新建一件小事</Dialog.Title>
              </div>
              <Dialog.Close className="family-close" aria-label="收起新建面板">
                <motion.span
                  initial={false}
                  animate={{ rotate: open && !reduced ? 90 : 0 }}
                  transition={{ duration: reduced ? 0 : 0.3 }}
                >
                  <XIcon size={20} aria-hidden="true" />
                </motion.span>
              </Dialog.Close>
            </header>
            <motion.div
              initial={false}
              animate={{ opacity: open ? 1 : 0 }}
              transition={{ duration: reduced ? 0 : 0.18 }}
            >
              {children}
            </motion.div>
          </Dialog.Popup>
        </Dialog.Portal>
      </motion.div>
    </Dialog.Root>
  );
}
