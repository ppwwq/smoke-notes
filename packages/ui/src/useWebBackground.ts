import { useEffect, useState } from "react";

export type WebBackground = "default" | "paper";
const storageKey = "smoke-notes:web-background";

export function useWebBackground(enabled: boolean) {
  const [background, setBackground] = useState<WebBackground>(() => {
    try {
      return enabled && localStorage.getItem(storageKey) === "paper"
        ? "paper"
        : "default";
    } catch {
      return "default";
    }
  });
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!enabled) return;
    // Paint browser safe areas too, and restore the host document on teardown.
    const elements = [document.documentElement, document.body];
    const previous = elements.map((element) => element.dataset.webBackground);
    elements.forEach((element) => {
      element.dataset.webBackground = background;
    });
    return () => {
      elements.forEach((element, index) => {
        const value = previous[index];
        if (value === undefined) delete element.dataset.webBackground;
        else element.dataset.webBackground = value;
      });
    };
  }, [background, enabled]);
  function changeBackground(value: WebBackground) {
    setBackground(value);
    try {
      localStorage.setItem(storageKey, value);
      setNotice("");
    } catch {
      setNotice("背景已应用，本次有效；浏览器暂时无法记住选择。");
    }
  }
  return { background, changeBackground, notice };
}
