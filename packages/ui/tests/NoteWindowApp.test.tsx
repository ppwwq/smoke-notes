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
    sessionStorage.clear();
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

  it("keeps the note and draft open when saving before deletion fails", async () => {
    database.notes.hook("updating", (changes) => {
      if ("title" in changes) throw new Error("storage unavailable");
    });
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    fireEvent.change(await screen.findByRole("textbox", { name: "便签标题" }), {
      target: { value: "不能丢失的草稿" },
    });
    fireEvent.click(screen.getByRole("button", { name: "删除便签" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("删除失败");
    expect(screen.getByRole("textbox", { name: "便签标题" })).toHaveValue(
      "不能丢失的草稿",
    );
    expect(await repository.getNote(noteId)).not.toBeNull();
    expect(bridge.closeNote).not.toHaveBeenCalled();
  });

  it("saves the latest desktop draft before deleting so it can be restored", async () => {
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    fireEvent.change(await screen.findByRole("textbox", { name: "便签标题" }), {
      target: { value: "删除前的最新草稿" },
    });
    fireEvent.click(screen.getByRole("button", { name: "删除便签" }));
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "便签标题" })).toBeNull(),
    );
    await repository.restore("note", noteId);
    expect((await repository.getNote(noteId))?.title).toBe("删除前的最新草稿");
  });

  it("keeps tab positions across switches and document remounts despite recent-order changes", async () => {
    const notebook = (await repository.listNotebooks())[0]!;
    const second = await repository.createNote(notebook.id, {
      title: "第二张",
      body: "",
    });
    const third = await repository.createNote(notebook.id, {
      title: "第三张",
      body: "",
    });
    vi.mocked(bridge.getRecentNoteIds).mockResolvedValue([
      noteId,
      second.id,
      third.id,
    ]);
    const firstWindow = render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    const labels = () =>
      screen
        .getAllByRole("button", { name: /切换便签：/ })
        .map((tab) => tab.getAttribute("aria-label"));
    await screen.findByRole("button", { name: "切换便签：第三张" });
    const original = labels();
    fireEvent.click(screen.getByRole("button", { name: "切换便签：第二张" }));
    await waitFor(() =>
      expect(bridge.switchNote).toHaveBeenCalledWith(second.id),
    );
    firstWindow.unmount();
    vi.mocked(bridge.getRecentNoteIds).mockResolvedValue([
      second.id,
      noteId,
      third.id,
    ]);
    const secondWindow = render(
      <NoteWindowApp
        repository={repository}
        noteId={second.id}
        bridge={bridge}
      />,
    );
    await screen.findByRole("button", { name: "切换便签：第三张" });
    expect(labels()).toEqual(original);
    expect(
      screen.getByRole("button", { name: "切换便签：第二张" }),
    ).toHaveAttribute("aria-current", "page");
    secondWindow.unmount();
    vi.mocked(bridge.getRecentNoteIds).mockResolvedValue([
      third.id,
      second.id,
      noteId,
    ]);
    render(
      <NoteWindowApp
        repository={repository}
        noteId={third.id}
        bridge={bridge}
      />,
    );
    await screen.findByRole("button", { name: "切换便签：第三张" });
    expect(labels()).toEqual(original);
    expect(
      screen.getByRole("button", { name: "切换便签：第三张" }),
    ).toHaveClass("active");
  });

  it("removes deleted tabs and appends a replacement without reordering surviving tabs", async () => {
    const notebook = (await repository.listNotebooks())[0]!;
    const others = await Promise.all(
      ["第二张", "第三张", "第四张", "补位便签"].map((title) =>
        repository.createNote(notebook.id, { title, body: "" }),
      ),
    );
    vi.mocked(bridge.getRecentNoteIds).mockResolvedValue([
      noteId,
      ...others.map((note) => note.id),
    ]);
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    await screen.findByRole("button", { name: "切换便签：第四张" });
    await repository.trashNote(others[0]!.id);
    vi.mocked(bridge.getRecentNoteIds).mockResolvedValue([
      others[3]!.id,
      others[2]!.id,
      others[1]!.id,
      noteId,
    ]);
    window.dispatchEvent(new CustomEvent("smoke-notes:data-changed"));
    await screen.findByRole("button", { name: "切换便签：补位便签" });
    expect(
      screen
        .getAllByRole("button", { name: /切换便签：/ })
        .map((tab) => tab.textContent),
    ).toEqual(["桌面便签", "第三张", "第四张", "补位便签"]);
  });

  it("keeps an externally opened note visible when the stored row already has four tabs", async () => {
    const notebook = (await repository.listNotebooks())[0]!;
    const others = await Promise.all(
      ["第二张", "第三张", "第四张", "新打开的便签"].map((title) =>
        repository.createNote(notebook.id, { title, body: "" }),
      ),
    );
    sessionStorage.setItem(
      "smoke-notes:note-tabs",
      JSON.stringify([noteId, ...others.slice(0, 3).map((note) => note.id)]),
    );
    vi.mocked(bridge.getRecentNoteIds).mockResolvedValue(
      others.map((note) => note.id).reverse(),
    );
    render(
      <NoteWindowApp
        repository={repository}
        noteId={others[3]!.id}
        bridge={bridge}
      />,
    );
    await screen.findByRole("button", { name: "切换便签：新打开的便签" });
    expect(
      screen
        .getAllByRole("button", { name: /切换便签：/ })
        .map((tab) => tab.textContent),
    ).toEqual(["桌面便签", "第二张", "第三张", "新打开的便签"]);
    expect(
      screen.getByRole("button", { name: "切换便签：新打开的便签" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it.each(["{broken", '{"unexpected":true}', '[null, 123, "", "missing"]'])(
    "recovers a usable tab list from invalid stored order %s",
    async (stored) => {
      sessionStorage.setItem("smoke-notes:note-tabs", stored);
      render(
        <NoteWindowApp
          repository={repository}
          noteId={noteId}
          bridge={bridge}
        />,
      );
      expect(
        await screen.findByRole("button", { name: "切换便签：桌面便签" }),
      ).toHaveAttribute("aria-current", "page");
    },
  );

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

  it("allows only one switch at a time and lets the user retry a failed switch", async () => {
    const notebook = (await repository.listNotebooks())[0]!;
    const other = await repository.createNote(notebook.id, {
      title: "另一张",
      body: "",
    });
    vi.mocked(bridge.getRecentNoteIds).mockResolvedValue([noteId, other.id]);
    let rejectSwitch!: (error: Error) => void;
    vi.mocked(bridge.switchNote).mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectSwitch = reject;
        }),
    );
    render(
      <NoteWindowApp repository={repository} noteId={noteId} bridge={bridge} />,
    );
    const tab = await screen.findByRole("button", { name: "切换便签：另一张" });
    fireEvent.click(tab);
    await waitFor(() => expect(bridge.switchNote).toHaveBeenCalledTimes(1));
    fireEvent.click(tab);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bridge.switchNote).toHaveBeenCalledTimes(1);
    rejectSwitch(new Error("load failed"));
    await screen.findByRole("alert");
    fireEvent.click(tab);
    await waitFor(() => expect(bridge.switchNote).toHaveBeenCalledTimes(2));
  });
});
