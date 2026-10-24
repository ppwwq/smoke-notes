import { useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
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
  rectSortingStrategy,
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
  wholeCard?: boolean;
}

function SortableRow<T extends RankedItem>({
  item,
  label,
  children,
  wholeCard,
}: {
  item: T;
  label: string;
  children: ReactNode;
  wholeCard: boolean;
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
      className={`sortable-row${wholeCard ? " whole-card-sort" : ""}${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...(wholeCard
        ? { ...attributes, role: "group", "aria-pressed": undefined }
        : {})}
      aria-label={wholeCard ? `移动便签：${label}` : undefined}
      aria-roledescription={wholeCard ? "可排序便签" : undefined}
      onMouseDown={
        wholeCard
          ? (event) => {
              const control = (event.target as Element).closest(
                "button, input, textarea, select, a",
              );
              if (!control || control.classList.contains("sticky-card-open"))
                listeners?.onMouseDown?.(event);
            }
          : undefined
      }
      onTouchStart={
        wholeCard
          ? (event) => {
              const control = (event.target as Element).closest(
                "button, input, textarea, select, a",
              );
              if (!control || control.classList.contains("sticky-card-open"))
                listeners?.onTouchStart?.(event);
            }
          : undefined
      }
      onKeyDown={
        wholeCard
          ? (event) => {
              if (event.target === event.currentTarget)
                listeners?.onKeyDown?.(event);
            }
          : undefined
      }
      onContextMenu={wholeCard ? (event) => event.preventDefault() : undefined}
    >
      {!wholeCard && (
        <button
          type="button"
          className="drag-handle"
          aria-label={`拖动：${label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} strokeWidth={1.8} />
        </button>
      )}
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
  wholeCard = false,
}: SortableStackProps<T>) {
  const [error, setError] = useState("");
  const handleSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 260, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const cardSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { delay: 300, tolerance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 8 },
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
      sensors={wholeCard ? cardSensors : handleSensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: wholeCard
            ? "按空格拾起便签，方向键移动，再按空格放下。Escape 取消。"
            : "按空格拾起，方向键移动，再按空格放下。Escape 取消。",
        },
      }}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={wholeCard ? rectSortingStrategy : verticalListSortingStrategy}
      >
        <div className={className}>
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              label={label(item)}
              wholeCard={wholeCard}
            >
              {renderItem(item, index)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
      {error && <p role="alert">{error}</p>}
    </DndContext>
  );
}
