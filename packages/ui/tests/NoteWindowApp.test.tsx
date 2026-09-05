import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalRepository, SmokeNotesDatabase } from "@smoke-notes/core";
import { NoteWindowApp, type DesktopBridge } from "../src/index";

describe("NoteWindowApp", () => {
  let database: SmokeNotesDatabase;
  let repository: LocalRepository;
  let noteId: string;
  let bridge: DesktopBridge;

  beforeEach(async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    database = new SmokeNotesDatabase(`note-window-ui-${crypto.randomUUID()}`);
    repository = new LocalRepository(database, {
      workspaceId: "workspace-1",
      deviceId: "desktop-1",
    });
    const notebook = await repository.createNotebook("桌面");
    noteId = (
      await repository.createNote(notebook.id, {
        title: "桌面便签",
        body: "保留内容",
      })
    ).id;
    bridge = {
      getWindowState: vi.fn(),
      setBackgroundOpacity: vi.fn(async (value) => value),
      setAlwaysOnTop: vi.fn(async (value) => value),
      saveWindowState: vi.fn(),
      getLaunchAtLogin: vi.fn(async () => false),
      setLaunchAtLogin: vi.fn(async (value) => value),
      minimizeWindow: vi.fn(async () => undefined),
      closeCurrentWindow: vi.fn(async () => undefined),
      openNote: vi.fn(async () => undefined),
      closeNote: vi.fn(async () => undefined),
      getRecentNoteIds: vi.fn(async () => [noteId]),
      switchNote: vi.fn(async () => undefined),
      setNoteWindowMousePassthrough: vi.fn(async () => undefined),
      getNoteWindowPointer: vi.fn(async () => ({ x: 200, y: 100 })),
      getNoteWindowState: vi.fn(async (id) => ({
        noteId: id,
        width: 360,
        height: 420,
        backgroundOpacity: 0.92,
        alwaysOnTop: false,
        isOpen: true,
      })),
      saveNoteWindowState: vi.fn(async (id, state) => ({
        noteId: id,
        width: 360,
        height: 420,
        backgroundOpacity: 0.92,
        alwaysOnTop: false,
        isOpen: true,
        ...state,
      })),
    };
  });

  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    await database.delete();
  });

  it("closes the window without deleting the note", async () => {
    const user = userEvent.setup();
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    await screen.findByDisplayValue("桌面便签");

    await user.click(screen.getByRole("button", { name: "关闭便签" }));

    expect(bridge.closeNote).toHaveBeenCalledWith(noteId);
    expect(await repository.getNote(noteId)).not.toBeNull();
  });

  it("passes transparent gutter clicks through but keeps tabs and the body interactive", async () => {
    const setPassthrough = vi.fn(async () => undefined);
    Object.assign(bridge, {
      setNoteWindowMousePassthrough: setPassthrough,
      getNoteWindowPointer: vi.fn(async () => ({ x: 200, y: 100 })),
    });
    const { container } = render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    await screen.findByDisplayValue("桌面便签");
    const root = container.querySelector(".note-window")!;
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 460, 420),
    );
    const tab = await screen.findByRole("button", {
      name: "切换便签：桌面便签",
    });
    vi.spyOn(tab, "getBoundingClientRect").mockReturnValue(
      new DOMRect(70, 52, 30, 30),
    );
    fireEvent.mouseMove(document, { clientX: 20, clientY: 120 });
    await waitFor(() => expect(setPassthrough).toHaveBeenLastCalledWith(true));
    fireEvent.mouseMove(document, { clientX: 80, clientY: 60 });
    await waitFor(() => expect(setPassthrough).toHaveBeenLastCalledWith(false));
    fireEvent.mouseMove(document, { clientX: 80, clientY: 85 });
    await waitFor(() => expect(setPassthrough).toHaveBeenLastCalledWith(true));
    fireEvent.mouseMove(document, { clientX: 200, clientY: 120 });
    await waitFor(() => expect(setPassthrough).toHaveBeenLastCalledWith(false));
  });

  it("opens a newly created note and broadcasts it to the main list", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    window.addEventListener("smoke-notes:data-changed", changed, {
      once: true,
    });
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    await screen.findByDisplayValue("桌面便签");

    await user.click(screen.getByRole("button", { name: "新建便签" }));
    await user.click(screen.getByRole("menuitem", { name: "普通便签" }));

    await waitFor(() => expect(bridge.openNote).toHaveBeenCalledOnce());
    expect(changed).toHaveBeenCalledOnce();
  });

  it("creates a todo note from the small-window new-note menu", async () => {
    const user = userEvent.setup();
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    await screen.findByDisplayValue("桌面便签");

    await user.click(screen.getByRole("button", { name: "新建便签" }));
    await user.click(screen.getByRole("menuitem", { name: "待办便签" }));

    await waitFor(() => expect(bridge.openNote).toHaveBeenCalledOnce());
    const createdId = vi.mocked(bridge.openNote).mock.calls[0]![0];
    expect(await repository.getNote(createdId)).toMatchObject({
      kind: "todo",
      contentJson: {
        type: "doc",
        content: [
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [{ type: "paragraph" }],
              },
            ],
          },
        ],
      },
    });
  });

  it("closes the compact create menu on outside click, Escape, and editor focus", async () => {
    const user = userEvent.setup();
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    await screen.findByDisplayValue("桌面便签");
    const createButton = screen.getByRole("button", { name: "新建便签" });

    await user.click(createButton);
    const regularItem = screen.getByRole("menuitem", { name: "普通便签" });
    expect(regularItem.querySelector("svg")).toHaveAttribute("width", "12");
    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(createButton);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(createButton);
    fireEvent.focus(screen.getByRole("textbox", { name: "便签标题" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(createButton);
    fireEvent.focus(screen.getByRole("textbox", { name: "便签正文" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders recent tabs in their dedicated left gutter", async () => {
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    await screen.findByDisplayValue("桌面便签");

    const tabs = screen.getByRole("navigation", { name: "最近便签" });
    const activeTab = await screen.findByRole("button", {
      name: "切换便签：桌面便签",
    });
    expect(tabs).toHaveClass("recent-note-tabs");
    expect(activeTab).toHaveClass("recent-note-tab");
  });

  it("changes only the note background opacity", async () => {
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    await screen.findByDisplayValue("桌面便签");

    fireEvent.change(screen.getByRole("slider", { name: "便签透明度" }), {
      target: { value: "63" },
    });

    await waitFor(() =>
      expect(bridge.setBackgroundOpacity).toHaveBeenCalledWith(0.63),
    );
    expect(document.querySelector(".note-window")).toHaveStyle({
      "--background-opacity": "0.63",
    });
  });

  it("keeps the minimize button while removing the opacity control minus icon", async () => {
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    await screen.findByDisplayValue("桌面便签");

    expect(
      screen.getByRole("button", { name: "最小化便签" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".note-opacity-control svg")).toBeNull();
  });

  it("minimizes the small note without deleting it", async () => {
    const user = userEvent.setup();
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    await screen.findByDisplayValue("桌面便签");

    await user.click(screen.getByRole("button", { name: "最小化便签" }));

    expect(bridge.minimizeWindow).toHaveBeenCalledOnce();
    expect(await repository.getNote(noteId)).not.toBeNull();
  });

  it("shows recent-note tabs, filters missing notes, and saves before switching", async () => {
    const user = userEvent.setup();
    const notebook = (await repository.listNotebooks())[0]!;
    const other = await repository.createNote(notebook.id, {
      title: "另一条记录",
      body: "另一条内容",
      kind: "todo",
      color: "rose",
    });
    vi.mocked(bridge.getRecentNoteIds).mockResolvedValue([
      noteId,
      other.id,
      "missing-note",
    ]);
    vi.mocked(bridge.switchNote).mockImplementation(async (targetId) => {
      expect((await repository.getNote(noteId))?.title).toBe("切换前保存");
      expect(targetId).toBe(other.id);
    });
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    await screen.findByDisplayValue("桌面便签");

    expect(
      await screen.findByRole("button", { name: "切换便签：桌面便签" }),
    ).toHaveClass("active");
    const otherTab = await screen.findByRole("button", {
      name: "切换便签：另一条记录",
    });
    expect(screen.queryByText("missing-note")).not.toBeInTheDocument();

    const title = screen.getByRole("textbox", { name: "便签标题" });
    await user.clear(title);
    await user.type(title, "切换前保存");
    await user.click(otherTab);

    await waitFor(() =>
      expect(bridge.switchNote).toHaveBeenCalledWith(other.id),
    );
  });

  it("backfills the four recent tabs when newer saved ids no longer exist", async () => {
    const notebook = (await repository.listNotebooks())[0]!;
    const validNotes = await Promise.all(
      ["第二条", "第三条", "第四条"].map((title) =>
        repository.createNote(notebook.id, { title, body: "" }),
      ),
    );
    vi.mocked(bridge.getRecentNoteIds).mockResolvedValue([
      noteId,
      "deleted-note",
      ...validNotes.map((item) => item.id),
    ]);

    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );

    expect(
      await screen.findAllByRole("button", { name: /切换便签/ }),
    ).toHaveLength(4);
    expect(
      screen.getByRole("button", { name: "切换便签：第四条" }),
    ).toBeInTheDocument();
  });

  it("keeps the current note visible when switching fails", async () => {
    const user = userEvent.setup();
    const notebook = (await repository.listNotebooks())[0]!;
    const other = await repository.createNote(notebook.id, {
      title: "暂时打不开",
      body: "",
    });
    vi.mocked(bridge.getRecentNoteIds).mockResolvedValue([noteId, other.id]);
    vi.mocked(bridge.switchNote).mockRejectedValue(new Error("load failed"));
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    await screen.findByDisplayValue("桌面便签");

    await user.click(
      await screen.findByRole("button", { name: "切换便签：暂时打不开" }),
    );

    expect(screen.getByDisplayValue("桌面便签")).toBeInTheDocument();
  });
});
