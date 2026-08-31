import type { DesktopBridge } from "@smoke-notes/ui";

declare global {
  interface Window {
    smokeDesktop: DesktopBridge;
  }
}

export {};
