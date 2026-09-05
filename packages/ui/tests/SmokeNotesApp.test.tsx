import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocalRepository, SmokeNotesDatabase } from "@smoke-notes/core";
import { SmokeNotesApp, type DesktopBridge } from "../src/index";
import { notebookTint } from "../src/components/notebook-tint";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function desktopBridge(): DesktopBridge {
  return {
    getWindowState: vi.fn(async () => ({
      backgroundOpacity: 0.82,
      alwaysOnTop: false,
      width: 1000,
      height: 680,
      lastView: "notes" as const,
    })),
    setBackgroundOpacity: vi.fn(async (value) => value),
    setAlwaysOnTop: vi.fn(async (value) => value),
    saveWindowState: vi.fn(async () => undefined),
    getLaunchAtLogin: vi.fn(async () => false),
    setLaunchAtLogin: vi.fn(async (value) => value),
    minimizeWindow: vi.fn(async () => undefined),
    closeCurrentWindow: vi.fn(async () => undefined),
    openNote: vi.fn(async () => undefined),
    closeNote: vi.fn(async () => undefined),
    getRecentNoteIds: vi.fn(async () => []),
    switchNote: vi.fn(async () => undefined),
    setNoteWindowMousePassthrough: vi.fn(async () => undefined),
    getNoteWindowPointer: vi.fn(async () => ({ x: 200, y: 100 })),
    getNoteWindowState: vi.fn(async (noteId) => ({
      noteId,
      width: 360,
      height: 420,
      backgroundOpacity: 0.92,
      alwaysOnTop: false,
      isOpen: true,
    })),
    saveNoteWindowState: vi.fn(async (_noteId, state) => ({
      noteId: _noteId,
      width: 360,
      height: 420,
      backgroundOpacity: 0.92,
      alwaysOnTop: false,
      isOpen: true,
      ...state,
    })),
  };
}

describe("SmokeNotesApp", () => {
  let database: SmokeNotesDatabase;
  let repository: LocalRepository;

  beforeEach(async () => {
    database = new SmokeNotesDatabase(`ui-test-${crypto.randomUUID()}`);
    repository = new LocalRepository(database, {
      workspaceId: "workspace-1",
      deviceId: "desktop-1",
    });
    const work = await repository.createNotebook("工作");
    await repository.createNotebook("生活");
    await repository.createNote(work.id, {
      title: "周会记录",
      body: "确认下周计划",
    });
    await repository.createTodo("交水费");
  });

  afterEach(async () => {
    cleanup();
    await database.delete();
  });

  it("switches between notebooks and the fixed todo view", async () => {
    const user = userEvent.setup();
    render(<SmokeNotesApp repository={repository} platform="desktop" />);

    expect(await screen.findByText("周会记录")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "待办" }));

    const toggle = await screen.findByRole("button", { name: "完成：交水费" });
    await user.click(toggle);
    expect(
      await screen.findByRole("button", { name: "恢复：交水费" }),
    ).toBeInTheDocument();
  });

  it("keeps notebook scrolling while hiding only its scrollbar", async () => {
    const { container } = render(
      <SmokeNotesApp repository={repository} platform="desktop" />,
    );
    await screen.findByText("周会记录");

    const scroll = container.querySelector<HTMLElement>(".notebook-scroll")!;
    expect(scroll).toHaveClass("notebook-scroll");
  });

  it("derives a stable notebook tint from the notebook id", () => {
    expect(notebookTint("book-a")).toBe("105, 114, 123");
    expect(notebookTint("book-a")).toBe(notebookTint("book-a"));
  });

  it("creates a notebook and a note from the interface", async () => {
    const user = userEvent.setup();
    const bridge = desktopBridge();
    render(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={bridge}
      />,
    );

    await screen.findByRole("button", { name: "工作" });
    await user.click(screen.getByRole("button", { name: "新建便签本" }));
    await user.type(
      screen.getByRole("textbox", { name: "便签本名称" }),
      "灵感",
    );
    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("button", { name: "灵感" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新建便签" }));
    await user.click(screen.getByRole("menuitem", { name: "普通便签" }));
    await waitFor(() => expect(bridge.openNote).toHaveBeenCalledOnce());
  });

  it("creates a todo note from the new-note menu and marks its card", async () => {
    const user = userEvent.setup();
    const bridge = desktopBridge();
    render(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={bridge}
      />,
    );

    await screen.findByText("周会记录");
    await user.click(screen.getByRole("button", { name: "新建便签" }));
    await user.click(screen.getByRole("menuitem", { name: "待办便签" }));

    await waitFor(() => expect(bridge.openNote).toHaveBeenCalledOnce());
    const notes = await repository.listNotes(
      (await repository.listNotebooks()).find((book) => book.name === "工作")!
        .id,
    );
    expect(notes.at(-1)?.kind).toBe("todo");
    expect(
      await screen.findByLabelText("待办便签：无标题便签"),
    ).toBeInTheDocument();
  });

  it("opens a desktop note on double click and does not show search or an inline editor", async () => {
    const user = userEvent.setup();
    const bridge = desktopBridge();
    render(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={bridge}
      />,
    );

    const card = await screen.findByRole("button", {
      name: "打开便签：周会记录",
    });
    await user.dblClick(card);

    expect(bridge.openNote).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("textbox", { name: "搜索便签" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "便签标题" }),
    ).not.toBeInTheDocument();
  });

  it("forwards desktop transparency and pin controls through the safe bridge", async () => {
    const user = userEvent.setup();
    const bridge = desktopBridge();
    render(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={bridge}
      />,
    );

    await screen.findByText("周会记录");
    await user.click(screen.getByRole("button", { name: "窗口设置" }));
    fireEvent.change(screen.getByRole("slider", { name: "窗口透明度" }), {
      target: { value: "65" },
    });
    await user.click(screen.getByRole("switch", { name: "窗口置顶" }));

    expect(bridge.setBackgroundOpacity).toHaveBeenCalledWith(0.65);
    expect(document.querySelector(".smoke-app")).toHaveStyle({
      "--background-opacity": "0.65",
    });
    expect(bridge.setAlwaysOnTop).toHaveBeenCalledWith(true);
  });

  it("uses the system launch-at-login value and rolls back failed updates", async () => {
    const user = userEvent.setup();
    const bridge = desktopBridge();
    vi.mocked(bridge.getLaunchAtLogin).mockResolvedValue(true);
    vi.mocked(bridge.setLaunchAtLogin)
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("denied"));
    render(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={bridge}
      />,
    );

    await screen.findByText("周会记录");
    await user.click(screen.getByRole("button", { name: "窗口设置" }));
    const launchAtLogin = screen.getByRole("switch", {
      name: "开机时启动",
    });
    expect(
      screen.getByText("登录 Windows 后只恢复已打开便签，主页面保持隐藏"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(launchAtLogin).toHaveAttribute("aria-checked", "true"),
    );

    await user.click(launchAtLogin);
    await waitFor(() =>
      expect(launchAtLogin).toHaveAttribute("aria-checked", "true"),
    );
    expect(bridge.setLaunchAtLogin).toHaveBeenLastCalledWith(false);

    await user.click(launchAtLogin);
    expect(bridge.setLaunchAtLogin).toHaveBeenLastCalledWith(false);
    await waitFor(() =>
      expect(launchAtLogin).toHaveAttribute("aria-checked", "true"),
    );
  });

  it("ignores a stale launch-at-login read after the desktop bridge changes", async () => {
    const user = userEvent.setup();
    const oldBridge = desktopBridge();
    const newBridge = desktopBridge();
    const oldRead = deferred<boolean>();
    vi.mocked(oldBridge.getLaunchAtLogin).mockReturnValue(oldRead.promise);
    vi.mocked(newBridge.getLaunchAtLogin).mockResolvedValue(true);
    const { rerender } = render(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={oldBridge}
      />,
    );

    await screen.findByText("周会记录");
    await user.click(screen.getByRole("button", { name: "窗口设置" }));
    const launchAtLogin = screen.getByRole("switch", {
      name: "开机时启动",
    });
    expect(launchAtLogin).toBeDisabled();
    rerender(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={newBridge}
      />,
    );
    await waitFor(() =>
      expect(launchAtLogin).toHaveAttribute("aria-checked", "true"),
    );
    expect(launchAtLogin).toBeEnabled();

    await act(async () => {
      oldRead.resolve(false);
      await oldRead.promise;
    });
    expect(launchAtLogin).toHaveAttribute("aria-checked", "true");
  });

  it("disables launch-at-login while a system update is pending", async () => {
    const user = userEvent.setup();
    const bridge = desktopBridge();
    const update = deferred<boolean>();
    vi.mocked(bridge.getLaunchAtLogin).mockResolvedValue(true);
    vi.mocked(bridge.setLaunchAtLogin).mockReturnValue(update.promise);
    render(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={bridge}
      />,
    );

    await screen.findByText("周会记录");
    await user.click(screen.getByRole("button", { name: "窗口设置" }));
    const launchAtLogin = screen.getByRole("switch", {
      name: "开机时启动",
    });
    await waitFor(() => expect(launchAtLogin).toBeEnabled());

    await user.click(launchAtLogin);
    expect(launchAtLogin).toBeDisabled();
    await user.click(launchAtLogin);
    expect(bridge.setLaunchAtLogin).toHaveBeenCalledTimes(1);

    await act(async () => {
      update.resolve(false);
      await update.promise;
    });
    await waitFor(() => expect(launchAtLogin).toBeEnabled());
    expect(launchAtLogin).toHaveAttribute("aria-checked", "false");
  });

  it("restores a deleted note from the immediate undo action", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    window.addEventListener("smoke-notes:data-changed", changed, {
      once: true,
    });
    render(<SmokeNotesApp repository={repository} platform="desktop" />);

    await screen.findByText("周会记录");
    await user.click(
      screen.getByRole("button", { name: "删除便签：周会记录" }),
    );
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    await user.click(await screen.findByRole("button", { name: "撤销删除" }));

    expect(await screen.findByText("周会记录")).toBeInTheDocument();
  });

  it("shows desktop drag controls that minimize or hide the main window", async () => {
    const user = userEvent.setup();
    const bridge = desktopBridge();
    render(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={bridge}
      />,
    );
    await screen.findByText("周会记录");

    await user.click(screen.getByRole("button", { name: "最小化主窗口" }));
    await user.click(screen.getByRole("button", { name: "关闭主窗口" }));

    expect(bridge.minimizeWindow).toHaveBeenCalledOnce();
    expect(bridge.closeCurrentWindow).toHaveBeenCalledOnce();
    expect(
      document.querySelector(".main-window-drag-handle"),
    ).toBeInTheDocument();
  });
});
