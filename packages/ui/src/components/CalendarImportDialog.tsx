import { parseCalendarImport } from "@smoke-notes/core/calendar-import";
import { useRef, useState } from "react";
import { X, Upload, Download } from "lucide-react";
import {
  RecordValidationError,
  type CalendarImportPlan,
  type CalendarImportResult,
} from "@smoke-notes/core";
import { WebDialog } from "./glass/WebDialog";
export function CalendarImportDialog({
  date,
  timeZone,
  onImport,
  onClose,
}: {
  date: string;
  timeZone: string;
  onImport(text: string, timeZone: string): Promise<CalendarImportResult>;
  onClose(): void;
}) {
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<CalendarImportPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CalendarImportResult | null>(null);
  const pending = useRef(false);
  const template = JSON.stringify(
    {
      version: 1,
      timeZone,
      events: [
        {
          id: `example-${date}-study`,
          title: "学习安排（示例）",
          start: `${date}T09:00`,
          end: `${date}T10:00`,
          type: "学习",
          color: "purple",
          notes: "替换成你的实际安排",
        },
      ],
      todos: [
        {
          id: `example-${date}-review`,
          text: "整理今日收获（示例）",
          date,
          time: "20:30",
          type: "生活",
        },
      ],
    },
    null,
    2,
  );
  function download() {
    const url = URL.createObjectURL(
      new Blob([template], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "Jotday日程规划模板.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function read(file?: File) {
    if (!file || pending.current) return;
    pending.current = true;
    setBusy(true);
    setPlan(null);
    setResult(null);
    setText("");
    setError("");
    try {
      if (file.size > 2_000_000) throw new Error("文件不得超过 2 MB。");
      setText(await file.text());
    } catch (error) {
      setError(error instanceof Error ? error.message : "读取文件失败。");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function preview() {
    setError("");
    setResult(null);
    try {
      setPlan(parseCalendarImport(text, timeZone));
    } catch (error) {
      setPlan(null);
      setError(
        error instanceof RecordValidationError
          ? error.message
          : "文件格式无效。",
      );
    }
  }
  async function save() {
    if (pending.current || !plan) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      setResult(await onImport(text, timeZone));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "导入失败，原有日程保持不变。",
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
      label="导入日程规划"
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      <section className="calendar-event-editor calendar-import-editor">
        <header>
          <h2>导入日程规划</h2>
          <button
            type="button"
            aria-label="关闭导入"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="calendar-import-body">
          <fieldset disabled={busy || !!result}>
            <p>
              选择 .ics 或规划
              .json，也可以直接粘贴规划内容。先预览，再导入到本机。
            </p>
            <div className="calendar-import-tools">
              <label className="calendar-file-label">
                <Upload size={16} />
                选择文件
                <input
                  type="file"
                  aria-label="选择日程文件"
                  accept=".ics,.json,text/calendar,application/json"
                  onChange={(e) => void read(e.target.files?.[0])}
                />
              </label>
              <button type="button" onClick={download}>
                <Download size={16} />
                下载规划模板
              </button>
            </div>
            <textarea
              aria-label="日程规划内容"
              rows={7}
              value={text}
              placeholder="粘贴我为你生成的 JSON 规划，或 ICS 文件内容"
              onChange={(e) => {
                setText(e.target.value);
                setPlan(null);
                setError("");
              }}
            />
            <p className="calendar-local-hint">
              最多 500 项／2 MB。重复标识自动跳过；不会覆盖已有安排。JSON
              全天结束日期为不包含的下一天。
            </p>
            <button
              type="button"
              className="planner-save"
              disabled={!text.trim()}
              onClick={preview}
            >
              检查并预览
            </button>
          </fieldset>
          {error && <p role="alert">{error}</p>}
          {plan && (
            <section className="calendar-import-preview" aria-label="导入预览">
              <h3>{plan.items.length} 项安排</h3>
              {plan.warnings.map((warning) => (
                <p key={warning} className="calendar-import-warning">
                  {warning}
                </p>
              ))}
              <ol>
                {plan.items.map((item, index) => (
                  <li key={index}>
                    <strong>
                      {item.kind === "event"
                        ? item.input.title
                        : item.input.text}
                    </strong>
                    <span>
                      {item.kind === "event"
                        ? `${item.input.start.replace("T", " ")} — ${item.input.end.replace("T", " ")} · ${item.input.allDay ? "全天" : item.input.timeZone}`
                        : `${item.input.date} ${item.input.time ?? "全天"} · 待办`}
                      {item.typeName ? ` · ${item.typeName}` : ""}
                      {item.input.repeat ? " · 重复" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {result && (
            <p role="status">
              已导入 {result.imported} 项，跳过 {result.skipped} 项重复安排。
            </p>
          )}
        </div>
        <footer>
          {result ? (
            <button className="planner-save" onClick={onClose}>
              完成
            </button>
          ) : (
            <button
              className="planner-save"
              disabled={!plan || busy}
              onClick={() => void save()}
            >
              {busy ? "处理中…" : "确认导入"}
            </button>
          )}
        </footer>
      </section>
    </WebDialog>
  );
}
