import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DndContextProps, DragEndEvent } from "@dnd-kit/core";
import { SortableStack } from "../src/components/SortableStack";

const drag = vi.hoisted(() => ({
  end: undefined as DndContextProps["onDragEnd"],
}));
vi.mock("@dnd-kit/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dnd-kit/core")>()),
  DndContext: ({ children, onDragEnd }: DndContextProps) => {
    drag.end = onDragEnd;
    return children;
  },
}));
afterEach(cleanup);
const items = [
  { id: "one", rank: 1 },
  { id: "two", rank: 2 },
  { id: "three", rank: 3 },
];
function renderStack(onMove = vi.fn(async () => {})) {
  render(
    <SortableStack
      items={items}
      label={(item) => item.id}
      renderItem={(item) => item.id}
      onMove={onMove}
    />,
  );
  return onMove;
}
function end(activeId: string, overId: string) {
  return drag.end?.({
    active: { id: activeId },
    over: { id: overId },
  } as DragEndEvent);
}
it.each([
  ["deleted", "two"],
  ["one", "deleted"],
])(
  "ignores a drop when %s or %s disappeared during dragging",
  async (active, over) => {
    const onMove = renderStack();
    await act(async () => end(active, over));
    expect(onMove).not.toHaveBeenCalled();
  },
);
it("moves an item using the remaining neighbors", async () => {
  const onMove = renderStack();
  await act(async () => end("one", "two"));
  expect(onMove).toHaveBeenCalledWith("one", 2, 3);
});
it("reports a failed reorder without an unhandled rejection", async () => {
  const onMove = vi.fn(async () => {
    throw new Error("storage unavailable");
  });
  renderStack(onMove);
  await act(async () => end("one", "two"));
  expect(screen.getByRole("alert")).toHaveTextContent("排序失败");
});
