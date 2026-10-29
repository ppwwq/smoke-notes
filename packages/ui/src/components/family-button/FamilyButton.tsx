/**
 * Adapted from Cult UI Family Button, MIT, Copyright (c) 2023 Jordan-Gilliam.
 * Source: https://www.cult-ui.com/r/family-button.json — see LICENSE.md.
 * Retains the spring-driven expanding shell and rotating toggle. Animate actual
 * dimensions on the shell so the button's text never stretches. The open popup
 * keeps the original layout spring when switching between note and todo forms.
 * Local additions: controlled state, native buttons, Base UI focus management,
 * persistent children, responsive sizing and reduced-motion support.
 */
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Dialog } from "@base-ui/react/dialog";
import { motion, useReducedMotion } from "motion/react";
import { PlusIcon, XIcon } from "lucide-react";
import "./family-button.css";

interface FamilyButtonProps {
  children: ReactNode;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  label?: string;
  triggerText?: string;
}

export { FamilyButton };

export default function FamilyButton({
  children,
  open: controlledOpen,
  onOpenChange,
  label = "新建",
  triggerText = "新建",
}: FamilyButtonProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const reduced = useReducedMotion();
  const portalHost = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [size, setSize] = useState({ width: 112, height: 54 });
  useLayoutEffect(() => {
    const target = open ? popup.current : trigger.current;
    if (!target) return;
    const measure = () => {
      // Read layout dimensions, not the popup's animated projection bounds.
      const { offsetWidth: width, offsetHeight: height } = target;
      if (!width || !height) return;
      setSize((previous) =>
        previous.width === width + 2 && previous.height === height + 2
          ? previous
          : { width: width + 2, height: height + 2 },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [open]);
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
        initial={false}
        animate={{
          width: size.width,
          height: size.height,
          borderRadius: open ? 28 : 24,
          backgroundColor: open ? "var(--canvas, #fbfaf8)" : "#24241f",
        }}
        transition={
          reduced
            ? { duration: 0 }
            : {
                width: {
                  type: "spring",
                  stiffness: 400,
                  damping: 34,
                  mass: 0.9,
                },
                height: {
                  type: "spring",
                  stiffness: 400,
                  damping: open ? 28 : 34,
                  mass: open ? 1 : 0.9,
                },
                default: { duration: 0.18 },
              }
        }
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
          <span>{triggerText}</span>
        </Dialog.Trigger>
        <div ref={portalHost} style={{ display: "contents" }} />
        <Dialog.Portal container={portalHost} keepMounted>
          <Dialog.Popup
            render={
              <motion.div
                layout={open && !reduced}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 400, damping: 28 }
                }
              />
            }
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
                  animate={{ rotate: open || reduced ? 0 : -45 }}
                  transition={{ duration: reduced ? 0 : 0.22 }}
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
