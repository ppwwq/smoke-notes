import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";

/** Overlapped cards expose their top strip. Pick the foremost strip under the pointer,
 * rather than comparing the centres of the full, partly hidden cards. */
export const stackedCardCollision: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) return closestCenter(args);
  const hits = pointerWithin(args)
    .sort(
      (a, b) =>
        (args.droppableRects.get(b.id)?.top ?? 0) -
        (args.droppableRects.get(a.id)?.top ?? 0),
    )
    .slice(0, 1);
  if (hits.length) return hits;

  // Auto-scroll can move the first/last card beyond a stationary pointer.
  // Keep the end insertion target while the pointer remains in this column.
  const { x, y } = args.pointerCoordinates;
  const column = args.droppableContainers
    .filter((container) => {
      const rect = args.droppableRects.get(container.id);
      return !container.disabled && rect && x >= rect.left && x <= rect.right;
    })
    .sort(
      (a, b) =>
        args.droppableRects.get(a.id)!.top - args.droppableRects.get(b.id)!.top,
    );
  const first = column[0];
  const last = column.at(-1);
  const edge =
    first && y < args.droppableRects.get(first.id)!.top
      ? first
      : last && y > args.droppableRects.get(last.id)!.bottom
        ? last
        : null;
  return edge ? [{ id: edge.id }] : [];
};
