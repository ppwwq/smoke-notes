import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  LocalRepository,
  SmokeNotesDatabase,
  type NoteColor,
} from "@smoke-notes/core";
import { SmokeNotesApp } from "@smoke-notes/ui/app";
import { PairingGate } from "@smoke-notes/ui/pairing";
import { LoadingStatus } from "@smoke-notes/ui/loading";
import "@smoke-notes/ui/workspace.css";
import "./brand.css";
import "./review.css";

// A separate origin AND database. This entry never constructs a cloud client.
const database = new SmokeNotesDatabase("smoke-notes-ui-review-v1");
const repository = new LocalRepository(database, {
  workspaceId: "smoke-review-workspace",
  deviceId: "smoke-review-device",
});

async function seedExamples() {
  await database.transaction(
    "rw",
    database.notebooks,
    database.notes,
    database.todos,
    database.operations,
    async () => {
      // Count tombstones too, so deleting every notebook never resets the demo.
      if (await database.notebooks.count()) return;
      const notebook = await repository.createNotebook("日常灵感");
      const work = await repository.createNotebook("工作与计划");
      await repository.createNote(work.id, {
        title: "会前准备",
        body: "确认议题，整理资料。",
        color: "sky",
      });
      await repository.createNote(work.id, {
        title: "本周待办",
        body: "整理反馈\n检查交付",
        kind: "todo",
        color: "sage",
      });
      const life = await repository.createNotebook("生活碎片");
      await repository.createNote(life.id, {
        title: "周末去哪里",
        body: "沿着河边走走，找一家安静的小店。",
        color: "rose",
      });
      await repository.createNotebook("阅读摘记");
      const notes: Array<[string, string, NoteColor]> = [
        [
          "一个轻盈的开始",
          "留一点空白，给今天的新想法。\n把日子过成自己喜欢的样子。",
          "violet",
        ],
        [
          "周末的小计划",
          "去逛一家没去过的书店\n买一束花，散步到河边。",
          "sage",
        ],
        [
          "关于这次设计",
          "让界面安静一些，让内容清楚一些。\n每一次记录，都可以很轻松。",
          "amber",
        ],
        ["读到的一句话", "生活的美，往往藏在那些不经意的小事里。", "rose"],
        [
          "下周见面聊什么",
          "整理新版本的思路和反馈\n把需要确认的问题写在这里。",
          "sky",
        ],
        [
          "旅行清单",
          "相机、一本书、一双舒服的鞋。\n剩下的，留给路上。",
          "graphite",
        ],
      ];
      for (const [title, body, color] of notes)
        await repository.createNote(notebook.id, { title, body, color });
      await repository.createNote(notebook.id, {
        title: "今天慢慢做",
        kind: "todo",
        color: "sage",
        body: "整理书桌\n给绿植浇水\n读二十页书",
      });
      for (const text of [
        "整理这一周的灵感",
        "读二十页喜欢的书",
        "给家人打个电话",
        "出门散步三十分钟",
      ])
        await repository.createTodo(text);
      const todos = await repository.listTodos();
      await repository.toggleTodo(todos[0].id);
    },
  );
}

const root = createRoot(document.getElementById("root")!);
function openReview() {
  if (!localStorage.getItem("smoke-review:skip-pairing")) {
    root.render(
      <PairingGate
        onSkip={() => {
          localStorage.setItem("smoke-review:skip-pairing", "true");
          openReview();
        }}
        onRedeem={async () => {
          throw new Error(
            "此预览使用本机示例记录。请先跳过；实际配对请使用正式网页。",
          );
        }}
      />,
    );
    return;
  }
  root.render(
    <StrictMode>
      <div className="review-shell">
        <div className="review-banner">
          交互预览 · 示例数据 · 修改仅保存在此浏览器
        </div>
        <SmokeNotesApp repository={repository} platform="web" />
      </div>
    </StrictMode>,
  );
}
if (
  new URLSearchParams(window.location.search).get("loading") === "diamond-grid"
) {
  root.render(
    <StrictMode>
      <main className="loading-review" aria-label="Diamond Grid 加载效果预览">
        <LoadingStatus label="正在打开便签…" />
        <p>加载效果预览</p>
        <a href="/review.html">返回便签</a>
      </main>
    </StrictMode>,
  );
} else
  seedExamples()
    .then(openReview)
    .catch(() => {
      root.render(
        <main className="review-error">
          <h1>暂时无法打开预览</h1>
          <p>请允许浏览器使用本地存储后刷新。已有记录不会被清除。</p>
        </main>,
      );
    });
