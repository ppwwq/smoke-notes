import { useEffect, useState, type CSSProperties } from "react";

interface WebViewport {
  style: CSSProperties;
  compactEditing: boolean;
}

// The visual viewport shrinks above the keyboard even when 100vh does not.
export function useWebViewport(enabled: boolean): WebViewport {
  const [viewportState, setViewportState] = useState<WebViewport>({
    style: {},
    compactEditing: false,
  });
  useEffect(() => {
    if (!enabled) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    let disposed = false;
    const update = () => {
      // Leave pinch zoom to the browser instead of resizing the app during zoom.
      if (disposed || viewport.scale !== 1) return;
      const active = document.activeElement;
      const editing = !!active?.matches(
        '.mobile-note-screen .rich-note-title, .mobile-note-screen [contenteditable="true"]',
      );
      const insideEditorScreen = !!active?.closest(".mobile-note-screen");
      const layoutHeight =
        document.documentElement.clientHeight || window.innerHeight;
      const layoutWidth =
        document.documentElement.clientWidth || window.innerWidth;
      const cramped =
        navigator.maxTouchPoints > 0 &&
        layoutWidth > layoutHeight &&
        viewport.height <= 500 &&
        layoutHeight - viewport.height >= 150;
      setViewportState((previous) => ({
        style: {
          "--web-viewport-height": `${viewport.height}px`,
          "--web-viewport-top": `${viewport.offsetTop}px`,
        } as CSSProperties,
        compactEditing:
          cramped &&
          (editing || (previous.compactEditing && insideEditorScreen)),
      }));
    };
    // Wait for the next focus target; body is transiently active during focusout.
    const afterBlur = () => queueMicrotask(update);
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", afterBlur);
    return () => {
      disposed = true;
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", afterBlur);
    };
  }, [enabled]);
  return enabled ? viewportState : { style: {}, compactEditing: false };
}
