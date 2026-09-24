import { useEffect, useState } from "react";

export type WebBackground = "default" | "paper" | "glass";
const storageKey = "smoke-notes:web-background";
const reducedKey = "smoke-notes:web-reduced-transparency";

export function useWebBackground(enabled: boolean) {
  const [background, setBackground] = useState<WebBackground>(() => {
    try {
      const value = enabled ? localStorage.getItem(storageKey) : null;
      return value === "paper" || value === "glass" ? value : "default";
    } catch {
      return "default";
    }
  });
  const [reduceTransparency, setReduceTransparency] = useState(() => {
    try {
      return enabled && localStorage.getItem(reducedKey) === "true";
    } catch {
      return false;
    }
  });
  const [systemReduced, setSystemReduced] = useState(false);
  useEffect(() => {
    if (!enabled || typeof window.matchMedia !== "function") return;
    const queries = [
      window.matchMedia("(prefers-reduced-transparency: reduce)"),
      window.matchMedia("(forced-colors: active)"),
    ];
    const update = () =>
      setSystemReduced(queries.some((query) => query.matches));
    update();
    queries.forEach((query) => query.addEventListener("change", update));
    return () =>
      queries.forEach((query) => query.removeEventListener("change", update));
  }, [enabled]);
  const reducedTransparency = enabled && (reduceTransparency || systemReduced);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!enabled) return;
    // Paint browser safe areas too, and restore the host document on teardown.
    const elements = [document.documentElement, document.body];
    const previous = elements.map((element) => ({
      background: element.dataset.webBackground,
      reduced: element.dataset.reducedTransparency,
    }));
    elements.forEach((element) => {
      element.dataset.webBackground = background;
      element.dataset.reducedTransparency = String(reducedTransparency);
    });
    return () => {
      elements.forEach((element, index) => {
        const value = previous[index].background;
        if (value === undefined) delete element.dataset.webBackground;
        else element.dataset.webBackground = value;
        const reduced = previous[index].reduced;
        if (reduced === undefined) delete element.dataset.reducedTransparency;
        else element.dataset.reducedTransparency = reduced;
      });
    };
  }, [background, enabled, reducedTransparency]);
  function changeBackground(value: WebBackground) {
    if (!enabled) return;
    setBackground(value);
    try {
      localStorage.setItem(storageKey, value);
      setNotice("");
    } catch {
      setNotice("背景已应用，本次有效；浏览器暂时无法记住选择。");
    }
  }
  function changeReduceTransparency(value: boolean) {
    if (!enabled) return;
    setReduceTransparency(value);
    try {
      localStorage.setItem(reducedKey, String(value));
      setNotice("");
    } catch {
      setNotice("外观已应用，本次有效；浏览器暂时无法记住选择。");
    }
  }
  return {
    background,
    changeBackground,
    notice,
    reduceTransparency,
    reducedTransparency,
    systemReduced,
    changeReduceTransparency,
  };
}
