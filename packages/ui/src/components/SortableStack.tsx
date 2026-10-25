import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useReducedMotion } from "motion/react";
import { stackedCardCollision } from "./stacked-card-collision";
import {
  DndContext,
  DragOverlay,
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
  itemKind?: string;
  layout?: "grid" | "stack";
  renderDragOverlay?: (item: T, index: number) => ReactNode;
  animateChanges?: boolean;
}

function SortableRow<T extends RankedItem>({
  item,
  label,
  children,
  wholeCard,
  itemKind,
  disabled,
}: {
  item: T;
  label: string;
  children: ReactNode;
  wholeCard: boolean;
  itemKind: string;
  disabled: boolean;
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
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      data-sortable-id={item.id}
      className={`sortable-row${wholeCard ? " whole-card-sort" : ""}${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...(wholeCard
        ? { ...attributes, role: "group", "aria-pressed": undefined }
        : {})}
      aria-label={wholeCard ? `移动${itemKind}：${label}` : undefined}
      aria-roledescription={wholeCard ? `可排序${itemKind}` : undefined}
      onMouseDown={
        wholeCard
          ? (event) => {
              const control = (event.target as Element).closest(
                "button, input, textarea, select, a",
              );
              if (
                !control ||
                control.matches(".sticky-card-open, [data-sortable-open]")
              )
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
              if (
                !control ||
                control.matches(".sticky-card-open, [data-sortable-open]")
              )
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
  itemKind = "便签",
  layout = "grid",
  renderDragOverlay,
  animateChanges = false,
}: SortableStackProps<T>) {
  const [error, setError] = useState("");
  const reducedMotion = useReducedMotion();
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const pending = useRef(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const draggedIndex = items.findIndex((item) => item.id === draggedId);
  const displayedItems = previewOrder
    ? [...items].sort(
        (a, b) => previewOrder.indexOf(a.id) - previewOrder.indexOf(b.id),
      )
    : items;
  const grid = useRef<HTMLDivElement>(null);
  const previousPositions = useRef(new Map<string, { x: number; y: number }>());
  const reflowAnimations = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    if (!animateChanges || !grid.current) return;
    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
      reducedMotion;
    const previous = previousPositions.current;
    const rows = Array.from(grid.current.children) as HTMLElement[];
    const membershipChanged =
      previous.size !== rows.length ||
      rows.some((row) => !previous.has(row.dataset.sortableId!));
    if (membershipChanged || draggedId || reduce) {
      reflowAnimations.current.forEach((animation) => animation.cancel());
      reflowAnimations.current = [];
    }
    const next = new Map<string, { x: number; y: number }>();
    for (const row of rows) {
      // Offsets ignore scrolling and any in-flight transform from the last reflow.
      const position = { x: row.offsetLeft, y: row.offsetTop };
      const before = previous.get(row.dataset.sortableId!);
      next.set(row.dataset.sortableId!, position);
      if (
        membershipChanged &&
        !reduce &&
        !draggedId &&
        !previewOrder &&
        before &&
        row.animate
      ) {
        const x = before.x - position.x,
          y = before.y - position.y;
        if (x || y)
          reflowAnimations.current.push(
            row.animate(
              [
                { transform: `translate(${x}px, ${y}px)` },
                { transform: "translate(0, 0)" },
              ],
              { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
            ),
          );
      }
    }
    previousPositions.current = next;
  });
  useEffect(
    () => () => {
      reflowAnimations.current.forEach((animation) => animation.cancel());
    },
    [],
  );
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
    setDraggedId(null);
    if (pending.current) return;
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
    pending.current = true;
    const ordered = [...withoutActive];
    ordered.splice(insertIndex, 0, items[originalIndex]);
    setPreviewOrder(ordered.map((item) => item.id));
    try {
      await onMove(activeId, previousRank, nextRank);
    } catch {
      setError("排序失败，请重试");
    } finally {
      pending.current = false;
      setPreviewOrder(null);
    }
  }

  return (
    <DndContext
      sensors={wholeCard ? cardSensors : handleSensors}
      collisionDetection={
        layout === "stack" ? stackedCardCollision : closestCenter
      }
      onDragEnd={handleDragEnd}
      onDragStart={({ active }) => setDraggedId(String(active.id))}
      onDragCancel={() => setDraggedId(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable: wholeCard
            ? `按空格拾起${itemKind}，方向键移动，再按空格放下。Escape 取消。`
            : "按空格拾起，方向键移动，再按空格放下。Escape 取消。",
        },
      }}
    >
      <SortableContext
        items={displayedItems.map((item) => item.id)}
        strategy={
          wholeCard && layout !== "stack"
            ? rectSortingStrategy
            : verticalListSortingStrategy
        }
      >
        <div ref={grid} className={className} aria-busy={previewOrder !== null}>
          {displayedItems.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              label={label(item)}
              wholeCard={wholeCard}
              itemKind={itemKind}
              disabled={previewOrder !== null}
            >
              {renderItem(item, index)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
      {renderDragOverlay && (
        <DragOverlay
          dropAnimation={
            reducedMotion
              ? null
              : {
                  duration: 180,
                  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                }
          }
          zIndex={80}
        >
          {draggedIndex >= 0
            ? renderDragOverlay(items[draggedIndex], draggedIndex)
            : null}
        </DragOverlay>
      )}
      {error && <p role="alert">{error}</p>}
    </DndContext>
  );
}
