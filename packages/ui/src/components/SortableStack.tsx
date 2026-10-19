import { useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "../icons";

interface RankedItem {
  id: string;
  rank: number;
}

interface SortableStackProps<T extends RankedItem> {
  items: T[];
  label: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onMove: (
    id: string,
    previousRank: number | null,
    nextRank: number | null,
  ) => Promise<void>;
  className?: string;
}

function SortableRow<T extends RankedItem>({
  item,
  label,
  children,
}: {
  item: T;
  label: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
  });
  return (
    <div
      ref={setNodeRef}
      className={`sortable-row${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`拖动：${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} strokeWidth={1.8} />
      </button>
      <div className="sortable-content">{children}</div>
    </div>
  );
}

export function SortableStack<T extends RankedItem>({
  items,
  label,
  renderItem,
  onMove,
  className = "",
}: SortableStackProps<T>) {
  const [error, setError] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 260, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    const withoutActive = items.filter((item) => item.id !== activeId);
    const targetIndex = withoutActive.findIndex((item) => item.id === overId);
    const originalIndex = items.findIndex((item) => item.id === activeId);
    // Sync or filtering may remove either item while the drag is in progress.
    if (originalIndex < 0 || targetIndex < 0) return;
    const insertIndex =
      originalIndex < items.findIndex((item) => item.id === overId)
        ? targetIndex + 1
        : targetIndex;
    const previousRank = withoutActive[insertIndex - 1]?.rank ?? null;
    const nextRank = withoutActive[insertIndex]?.rank ?? null;
    setError("");
    try {
      await onMove(activeId, previousRank, nextRank);
    } catch {
      setError("排序失败，请重试");
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={className}>
          {items.map((item, index) => (
            <SortableRow key={item.id} item={item} label={label(item)}>
              {renderItem(item, index)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
      {error && <p role="alert">{error}</p>}
    </DndContext>
  );
}
