import { calendarColorOptions } from "./calendar-colors";
import { useEffect, useRef, useState } from "react";
import { X, Plus, Pencil } from "lucide-react";
import {
  RecordValidationError,
  type PlannerType,
  type PlannerPreferences,
  type PlannerTodoInput,
  type Todo,
} from "@smoke-notes/core";
import { WorkspaceSelect } from "./WorkspaceSelect";
import { WebDialog } from "./glass/WebDialog";

export interface PlannerTypeActions {
  preferences?: PlannerPreferences;
  onSavePreferences?(preferences: PlannerPreferences): Promise<void>;
  todoTimes?: Record<string, string | null>;
  types?: PlannerType[];
  todoTypeIds?: Record<string, string | null>;
  onSaveType?(
    name: string,
    color: PlannerType["color"],
    id?: string,
  ): Promise<PlannerType>;
  onDeleteType?(id: string): Promise<void>;
  onSavePlannerTodo?(input: PlannerTodoInput, todo?: Todo): Promise<void>;
  onMovePlannerTodo?(
    todo: Todo,
    date: string,
    time?: string | null,
  ): Promise<void>;
}
export function PlannerTypeField({
  types = [],
  value,
  onChange,
  onSaveType,
  onDeleteType,
}: PlannerTypeActions & {
  value?: string | null;
  onChange(id: string | null): void;
}) {
  const [manage, setManage] = useState(false);
  return (
    <div className="planner-type-field">
      <label>
        类型标签
        <WorkspaceSelect
          label="类型标签"
          value={types.some((t) => t.id === value) ? value! : ""}
          options={[
            { value: "", label: "未分类" },
            ...types.map((t) => {
              const color = calendarColorOptions.find(
                (c) => c.value === t.color,
              );
              return {
                value: t.id,
                label: t.name,
                swatch: color?.swatch,
                swatchInk: color?.swatchInk,
              };
            }),
          ]}
          onChange={(id) => onChange(id || null)}
        />
      </label>
      {onSaveType && onDeleteType && (
        <button
          type="button"
          className="planner-manage-types"
          onClick={() => setManage(true)}
        >
          <Pencil size={15} />
          编辑类型标签
        </button>
      )}
      {manage && onSaveType && onDeleteType && (
        <PlannerTypeManager
          types={types}
          onSaveType={onSaveType}
          onDeleteType={async (id) => {
            await onDeleteType(id);
            if (id === value) onChange(null);
          }}
          onSaved={onChange}
          onClose={() => setManage(false)}
        />
      )}
    </div>
  );
}
function PlannerTypeManager({
  types,
  onSaveType,
  onDeleteType,
  onSaved,
  onClose,
}: {
  types: PlannerType[];
  onSaveType: NonNullable<PlannerTypeActions["onSaveType"]>;
  onDeleteType: NonNullable<PlannerTypeActions["onDeleteType"]>;
  onSaved(id: string): void;
  onClose(): void;
}) {
  const [id, setId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) nameInput.current?.focus();
  }, [editing, id]);
  const [name, setName] = useState("");
  const [color, setColor] = useState<PlannerType["color"]>("violet");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const reset = () => {
    setId(undefined);
    setName("");
    setColor("violet");
    setRemoving(false);
    setError("");
  };
  async function run(remove = false) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (remove && id) {
        await onDeleteType(id);
        reset();
        setEditing(false);
      } else {
        const saved = await onSaveType(name, color, id);
        onSaved(saved.id);
        onClose();
      }
    } catch (e) {
      setError(
        e instanceof RecordValidationError
          ? e.message
          : "保存失败，内容已保留，请重试。",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <WebDialog
      web
      kind="actions"
      label="编辑类型标签"
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      <form
        className="calendar-event-editor planner-type-editor"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void run();
        }}
      >
        <header>
          <h2>类型标签</h2>
          <button
            type="button"
            aria-label="关闭类型编辑"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <fieldset disabled={busy}>
          <div className="planner-type-list">
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-label={`编辑类型：${t.name}`}
                aria-pressed={id === t.id}
                onClick={() => {
                  setId(t.id);
                  setEditing(true);
                  setName(t.name);
                  setColor(t.color);
                  setRemoving(false);
                  setError("");
                }}
              >
                <span className={`planner-type-dot event-${t.color}`} />
                {t.name}
                <Pencil size={15} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="planner-manage-types"
            aria-expanded={editing && !id}
            onClick={() => {
              reset();
              setEditing(true);
              nameInput.current?.focus();
            }}
          >
            <Plus size={16} />
            新增类型标签
          </button>
          {editing && (
            <div className="planner-type-draft">
              <h3>{id ? "编辑类型标签" : "新增类型标签"}</h3>
              <label>
                名称
                <input
                  ref={nameInput}
                  aria-label="类型名称"
                  value={name}
                  maxLength={40}
                  placeholder="例如：工作、学习、生活"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      (e.nativeEvent.isComposing || e.keyCode === 229)
                    )
                      e.preventDefault();
                  }}
                />
              </label>
              <label>
                配色
                <WorkspaceSelect<PlannerType["color"]>
                  label="类型配色"
                  value={color}
                  options={calendarColorOptions}
                  onChange={setColor}
                />
              </label>
            </div>
          )}
          <p className="calendar-local-hint">
            改名或改色会更新所有关联项目。删除标签后，项目保留并显示为未分类。标签保存在本机。
          </p>
          {removing && (
            <p role="status">确定删除“{name}”这个标签？行程与待办都会保留。</p>
          )}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {editing && (
          <footer>
            {id && (
              <button
                type="button"
                className="calendar-delete"
                disabled={busy}
                onClick={() => (removing ? void run(true) : setRemoving(true))}
              >
                {removing ? "确认删除标签" : "删除标签"}
              </button>
            )}
            <button className="planner-save" disabled={busy || !name.trim()}>
              {busy ? "保存中…" : "保存类型"}
            </button>
          </footer>
        )}
      </form>
    </WebDialog>
  );
}
