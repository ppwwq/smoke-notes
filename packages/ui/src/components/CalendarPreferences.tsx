import { CalendarZoneField } from "./CalendarZoneField";
import { useRef, useState } from "react";
import { X } from "lucide-react";
import {
  DEFAULT_PLANNER_PREFERENCES,
  type PlannerPreferences,
  RecordValidationError,
} from "@smoke-notes/core";
import { WebDialog } from "./glass/WebDialog";
import { WorkspaceSelect } from "./WorkspaceSelect";
import { PlannerTypeField, type PlannerTypeActions } from "./PlannerTypeField";

export function CalendarPreferences({
  onClose,
  ...actions
}: PlannerTypeActions & { onClose(): void }) {
  const [draft, setDraft] = useState<PlannerPreferences>(
    () =>
      actions.preferences ?? {
        ...DEFAULT_PLANNER_PREFERENCES,
        workspaceId: "",
      },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const change = (patch: Partial<PlannerPreferences>) =>
    setDraft((current) => ({ ...current, ...patch }));
  async function save() {
    if (pending.current || !actions.onSavePreferences) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await actions.onSavePreferences(draft);
      onClose();
    } catch (error) {
      setError(
        error instanceof RecordValidationError
          ? error.message
          : "保存失败，设置已保留，请重试。",
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
      label="日历显示与默认设置"
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      <form
        className="calendar-event-editor calendar-preferences"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <header>
          <h2>显示与默认设置</h2>
          <button
            type="button"
            aria-label="关闭日历设置"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <fieldset disabled={busy}>
          <legend>日历中显示</legend>
          <label className="calendar-toggle">
            <input
              type="checkbox"
              checked={draft.showReminders}
              onChange={(e) => change({ showReminders: e.target.checked })}
            />
            待办事项
          </label>
          <label className="calendar-toggle">
            <input
              type="checkbox"
              checked={draft.showUnclassified}
              onChange={(e) => change({ showUnclassified: e.target.checked })}
            />
            未分类的安排
          </label>
          {(actions.types ?? []).map((type) => (
            <label className="calendar-toggle" key={type.id}>
              <input
                type="checkbox"
                checked={!draft.hiddenTypeIds.includes(type.id)}
                onChange={(e) =>
                  change({
                    hiddenTypeIds: e.target.checked
                      ? draft.hiddenTypeIds.filter((id) => id !== type.id)
                      : [...draft.hiddenTypeIds, type.id],
                  })
                }
              />
              <span className={`planner-type-dot event-${type.color}`} />
              {type.name}
            </label>
          ))}
          <p className="calendar-local-hint">
            隐藏只影响日历显示，已有内容会保留。
          </p>
          <label>
            查看时区
            <CalendarZoneField
              label="日历查看时区"
              value={draft.timeZone ?? "Asia/Hong_Kong"}
              onChange={(timeZone) => change({ timeZone })}
            />
          </label>
          <p className="calendar-local-hint">
            行程换算到此时区，全天日期不变。待办按清单本地时间显示。
          </p>
          <h3>日历布局</h3>
          <label>
            月历间距
            <WorkspaceSelect
              label="月历间距"
              value={draft.monthDensity ?? "compact"}
              options={[
                { value: "compact", label: "紧凑" },
                { value: "comfortable", label: "宽松" },
              ]}
              onChange={(monthDensity) => change({ monthDensity })}
            />
          </label>
          <p className="calendar-local-hint">
            两种间距都显示 4 条安排，更多项目可展开。
          </p>
          <label>
            每周起始日
            <WorkspaceSelect
              label="每周起始日"
              value={draft.weekStartsOn ?? 1}
              options={Array.from({ length: 7 }, (_, day) => ({
                value: day as NonNullable<PlannerPreferences["weekStartsOn"]>,
                label: `星期${"日一二三四五六"[day]}`,
              }))}
              onChange={(weekStartsOn) => change({ weekStartsOn })}
            />
          </label>
          <label className="calendar-toggle">
            <input
              type="checkbox"
              checked={draft.showWeekNumbers ?? false}
              onChange={(event) =>
                change({ showWeekNumbers: event.target.checked })
              }
            />
            显示周数
          </label>
          <p className="calendar-local-hint">
            周数按 ISO 标准计算，以该行的星期四所属周为准。
          </p>
          <h3>新增安排的默认值</h3>
          <PlannerTypeField
            {...actions}
            value={draft.defaultTypeId}
            onChange={(defaultTypeId) => change({ defaultTypeId })}
            onDeleteType={
              actions.onDeleteType
                ? async (id) => {
                    await actions.onDeleteType!(id);
                    setDraft((current) => ({
                      ...current,
                      defaultTypeId:
                        current.defaultTypeId === id
                          ? null
                          : current.defaultTypeId,
                      hiddenTypeIds: current.hiddenTypeIds.filter(
                        (value) => value !== id,
                      ),
                    }));
                  }
                : undefined
            }
          />
          <label>
            日程时长
            <WorkspaceSelect
              label="默认日程时长"
              value={draft.defaultDuration}
              options={[15, 30, 60, 90, 120].map((value) => ({
                value,
                label: `${value} 分钟`,
              }))}
              onChange={(defaultDuration) => change({ defaultDuration })}
            />
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button className="planner-save" disabled={busy}>
            {busy ? "保存中…" : "保存日历设置"}
          </button>
        </footer>
      </form>
    </WebDialog>
  );
}
