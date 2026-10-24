import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// RubberSegment measures the track in browsers; JSDOM has no layout observer.
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ProseMirror reads browser geometry while handling selections. JSDOM does not
// implement these layout APIs, so tests provide neutral rectangles.
document.elementFromPoint = () => document.body;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Range.prototype.getClientRects = () => {
  const rects = [new DOMRect()] as unknown as DOMRectList;
  Object.defineProperty(rects, "item", {
    value: (index: number) => rects[index] ?? null,
  });
  return rects;
};
