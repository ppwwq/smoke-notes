import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/react";
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
  const pendingReads = new Set<Promise<unknown>>();
  async function findNote(title: string) {
    await waitFor(() =>
      expect(document.querySelector(".notes-board")).not.toBeNull(),
    );
    if (document.querySelector(".note-stacks")) {
      fireEvent.click(
        await screen.findByRole("button", { name: /^展开便签本：工作/ }),
      );
    }
    return screen.findByRole("button", { name: `打开便签：${title}` });
  }
  async function openNotebookCreation() {
    fireEvent.click(await screen.findByRole("button", { name: "浏览便签本" }));
    fireEvent.click(await screen.findByRole("button", { name: "新增" }));
  }

  function trackRead<Args extends unknown[], Result>(
    read: (...args: Args) => Promise<Result>,
  ) {
    return (...args: Args) => {
      const pending = read(...args).finally(() => pendingReads.delete(pending));
      pendingReads.add(pending);
      return pending;
    };
  }

  beforeEach(async () => {
    localStorage.clear();
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
    vi.spyOn(repository, "listNotebooks").mockImplementation(
      trackRead(LocalRepository.prototype.listNotebooks.bind(repository)),
    );
    vi.spyOn(repository, "listNotes").mockImplementation(
      trackRead(LocalRepository.prototype.listNotes.bind(repository)),
    );
    vi.spyOn(repository, "listTodos").mockImplementation(
      trackRead(LocalRepository.prototype.listTodos.bind(repository)),
    );
    vi.spyOn(repository, "listTrash").mockImplementation(
      trackRead(LocalRepository.prototype.listTrash.bind(repository)),
    );
  });

  afterEach(async () => {
    cleanup();
    // Navigation can render before its data-changed refresh finishes.
    // Finish the observed reads before closing the test database.
    await act(async () => {
      while (pendingReads.size) await Promise.all([...pendingReads]);
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "maxTouchPoints");
    await database.delete();
  });

  it.each(["web", "desktop"] as const)(
    "expands real note stacks and restores the %s browsing state after editing",
    async (platform) => {
      const { container } = render(
        <SmokeNotesApp
          repository={repository}
          platform={platform}
          desktopBridge={platform === "desktop" ? desktopBridge() : undefined}
        />,
      );
      const stack = await screen.findByRole("button", {
        name: "展开便签本：工作，1 张便签",
      });
      expect(
        screen.queryByRole("button", { name: "打开便签：周会记录" }),
      ).not.toBeInTheDocument();
      expect(container.querySelector(".stack-paper")).toHaveTextContent(
        "周会记录",
      );
      expect(
        screen.getAllByRole("button", { name: /^展开便签本：/ }),
      ).toHaveLength(2);
      fireEvent.click(stack);
      const card = await screen.findByRole("button", {
        name: "打开便签：周会记录",
      });
      const list = container.querySelector<HTMLElement>(".notes-board-scroll")!;
      list.scrollTop = 180;
      fireEvent.scroll(list);
      fireEvent.click(card);
      fireEvent.change(
        await screen.findByRole("textbox", { name: "便签标题" }),
        { target: { value: "保存后的标题" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "返回便签列表" }));
      await screen.findByRole("button", { name: "打开便签：保存后的标题" });
      expect(container.querySelector(".notes-board-scroll")!.scrollTop).toBe(
        180,
      );
      fireEvent.click(screen.getByRole("button", { name: "收起便签" }));
      expect(container.querySelector(".stack-paper")).toHaveTextContent(
        "保存后的标题",
      );
      expect(
        screen
          .getByRole("navigation", { name: "主导航" })
          .querySelectorAll("button"),
      ).toHaveLength(4);
    },
  );

  it("finds content across notebooks and preserves the search when returning from an edit", async () => {
    const life = (await repository.listNotebooks()).find(
      (book) => book.name === "生活",
    )!;
    const note = await repository.createNote(life.id, {
      title: "旅行",
      body: "行李和相机",
    });
    render(<SmokeNotesApp repository={repository} platform="web" />);
    const search = await screen.findByRole("searchbox", {
      name: "搜索所有便签",
    });
    fireEvent.change(search, { target: { value: "相机" } });
    fireEvent.click(
      await screen.findByRole("button", { name: "打开便签：旅行" }),
    );
    expect(
      await screen.findByRole("textbox", { name: "便签标题" }),
    ).toHaveValue("旅行");
    fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
      target: { value: "出发前" },
    });
    fireEvent.click(screen.getByRole("button", { name: "返回便签列表" }));
    expect(
      await screen.findByRole("searchbox", { name: "搜索所有便签" }),
    ).toHaveValue("相机");
    expect(
      await screen.findByRole("button", { name: "打开便签：出发前" }),
    ).toBeInTheDocument();
    const returningSearch = screen.getByRole("searchbox");
    returningSearch.focus();
    fireEvent.change(returningSearch, { target: { value: "相" } });
    expect(returningSearch).toHaveFocus();
    expect(
      (await repository.listNotes(life.id)).find((item) => item.id === note.id)
        ?.title,
    ).toBe("出发前");
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "没有这样的记录" },
    });
    expect(
      screen.getByRole("heading", { name: "没有找到这张便签" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("reports a cloud failure on desktop even when the device network is online", async () => {
    render(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={desktopBridge()}
        syncStatus={{ phase: "error", pending: 2, initial: false }}
      />,
    );
    expect(await screen.findByText("同步失败")).toBeInTheDocument();
    expect(screen.queryByText("已连接")).not.toBeInTheDocument();
  });

  it("saves the main editor before acknowledging desktop quit", async () => {
    const bridge = desktopBridge();
    let prepare!: () => Promise<void>;
    let cancel!: (message: string) => void;
    bridge.onPrepareQuit = (listener) => {
      prepare = listener;
      return () => {};
    };
    bridge.onQuitCancelled = (listener) => {
      cancel = listener;
      return () => {};
    };
    const { container } = render(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={bridge}
      />,
    );
    await screen.findByText("周会记录");
    fireEvent.click(screen.getByRole("button", { name: "新建便签" }));
    fireEvent.click(screen.getByRole("button", { name: /文字便签/ }));
    const title = await screen.findByRole("textbox", { name: "便签标题" });
    fireEvent.change(title, { target: { value: "退出前的主窗口草稿" } });
    await act(async () => prepare());
    const notebooks = await repository.listNotebooks();
    const notes = await repository.listNotes(
      notebooks.find((item) => item.name === "工作")!.id,
    );
    expect(notes.some((note) => note.title === "退出前的主窗口草稿")).toBe(
      true,
    );
    expect(container.querySelector(".smoke-app")).toHaveAttribute("inert");
    act(() => cancel("退出已取消"));
    expect(container.querySelector(".smoke-app")).not.toHaveAttribute("inert");
    expect(screen.getByRole("alert")).toHaveTextContent("退出已取消");
  });

  it.each(["caret", "conflict"])(
    "ignores an older background read after saving newer web edits (%s)",
    async (check) => {
      const update = vi.spyOn(repository, "updateNote");
      render(<SmokeNotesApp repository={repository} platform="web" />);
      fireEvent.click(await findNote("周会记录"));
      const body = (await screen.findByRole("textbox", {
        name: "便签正文",
      })) as HTMLElement & { editor: Editor };
      const editor = body.editor;
      const save = async () => {
        const previousSaves = update.mock.calls.length;
        if (check === "conflict")
          fireEvent.click(screen.getByRole("button", { name: "保存" }));
        await waitFor(() =>
          expect(update).toHaveBeenCalledTimes(previousSaves + 1),
        );
        await waitFor(() =>
          expect(screen.queryByRole("button", { name: "保存" })).toBeNull(),
        );
        await act(async () => {
          while (pendingReads.size) await Promise.all([...pendingReads]);
        });
      };
      act(() => editor.commands.insertContent("第一次编辑"));
      await save();

      const notebook = (await repository.listNotebooks())[0];
      const earlier = await repository.listNotes(notebook.id);
      const delayed = deferred<typeof earlier>();
      const readDelayedSnapshot = vi.fn(() => delayed.promise);
      vi.mocked(repository.listNotes).mockImplementationOnce(
        readDelayedSnapshot,
      );
      act(() => {
        window.dispatchEvent(new CustomEvent("smoke-notes:data-changed"));
      });
      await waitFor(() => expect(readDelayedSnapshot).toHaveBeenCalledOnce());
      act(() => {
        editor.commands.splitBlock();
        editor.commands.insertContent("第二次编辑");
      });
      await save();
      const latestText = editor.getText();
      const latestSelection = editor.state.selection.from;
      await act(async () => {
        delayed.resolve(earlier);
        await delayed.promise;
      });

      if (check === "caret") {
        expect(editor.getText()).toBe(latestText);
        expect(editor.state.selection.from).toBe(latestSelection);
      } else {
        act(() => editor.commands.insertContent("继续输入"));
        await save();
        expect(await repository.listNotes(notebook.id)).toHaveLength(1);
      }
    },
  );

  it.each(["note", "notebook"] as const)(
    "preserves the active draft when another device deletes its %s",
    async (entity) => {
      const work = (await repository.listNotebooks()).find(
        (item) => item.name === "工作",
      )!;
      const original = (await repository.listNotes(work.id))[0];
      render(<SmokeNotesApp repository={repository} platform="web" />);
      fireEvent.click(await findNote("周会记录"));
      const body = (await screen.findByRole("textbox", {
        name: "便签正文",
      })) as HTMLElement & { editor: Editor };
      act(() => body.editor.commands.insertContent("尚未保存的草稿"));
      const expectedBody = body.editor.getText();
      if (entity === "note") await repository.trashNote(original.id);
      else await repository.trashNotebook(work.id);
      act(() => {
        window.dispatchEvent(new CustomEvent("smoke-notes:data-changed"));
      });
      await waitFor(async () => {
        const copies = await database.notes
          .filter((item) => item.conflictOf === original.id)
          .toArray();
        expect(copies).toHaveLength(1);
        expect(copies[0].body).toBe(expectedBody);
        expect(copies[0].deletedAt).toBeNull();
        expect(
          (await database.notebooks.get(copies[0].notebookId))?.deletedAt,
        ).toBeNull();
      });
      expect((await database.notes.get(original.id))?.deletedAt).not.toBeNull();
      expect(
        screen.getByRole("textbox", { name: "便签正文" }),
      ).toHaveTextContent(expectedBody);
      act(() => body.editor.commands.insertContent("继续编辑"));
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await waitFor(async () => {
        const copies = await database.notes
          .filter((item) => item.conflictOf === original.id)
          .toArray();
        expect(copies).toHaveLength(1);
        expect(copies[0].body).toContain("继续编辑");
      });
    },
  );

  it("saves a web draft immediately when the page moves to the background", async () => {
    const update = vi.spyOn(repository, "updateNote");
    render(<SmokeNotesApp repository={repository} platform="web" />);
    fireEvent.click(await findNote("周会记录"));
    fireEvent.change(await screen.findByRole("textbox", { name: "便签标题" }), {
      target: { value: "切到后台前的草稿" },
    });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(update).toHaveBeenCalledOnce();
    await act(async () => {
      await update.mock.results[0].value;
    });
    expect(
      await screen.findByRole("textbox", { name: "便签标题" }),
    ).toHaveValue("切到后台前的草稿");
  });

  it("warns before closing a web page with an unsaved draft and stops warning after saving", async () => {
    render(<SmokeNotesApp repository={repository} platform="web" />);
    fireEvent.click(await findNote("周会记录"));
    fireEvent.change(await screen.findByRole("textbox", { name: "便签标题" }), {
      target: { value: "尚未落盘" },
    });
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "保存状态" }),
      ).toHaveTextContent("已保存"),
    );
    const saved = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
  });

  it("remembers the web paper background across remounts and can restore the default", async () => {
    const first = render(
      <SmokeNotesApp repository={repository} platform="web" />,
    );
    await findNote("周会记录");
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: /外观与阅读/ }));
    fireEvent.click(screen.getByRole("radio", { name: /纸面模式/ }));
    expect(screen.getByRole("radio", { name: /纸面模式/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
    fireEvent.click(screen.getByRole("button", { name: "打开便签：周会记录" }));
    const editor = await screen.findByRole("textbox", { name: "便签正文" });
    expect(editor.closest(".platform-web")).toHaveAttribute(
      "data-web-background",
      "paper",
    );
    expect(editor).toHaveTextContent("确认下周计划");
    first.unmount();
    render(<SmokeNotesApp repository={repository} platform="web" />);
    await findNote("周会记录");
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: /外观与阅读/ }));
    expect(screen.getByRole("radio", { name: /纸面模式/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /默认模式/ }));
    expect(document.querySelector(".platform-web")).toHaveAttribute(
      "data-web-background",
      "default",
    );
  });

  it("switches glass and paper without replacing the editor or losing a draft", async () => {
    localStorage.setItem("smoke-notes:web-reduced-transparency", "true");
    render(<SmokeNotesApp repository={repository} platform="web" />);
    fireEvent.click(await findNote("周会记录"));
    const editor = await screen.findByRole("textbox", { name: "便签正文" });
    const title = screen.getByPlaceholderText("输入标题");
    fireEvent.change(title, { target: { value: "仍在编辑的标题" } });
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "应用设置" }));
    fireEvent.click(screen.getByRole("button", { name: /外观与阅读/ }));
    for (const theme of ["玻璃模式", "纸面模式", "默认模式", "玻璃模式"]) {
      fireEvent.click(screen.getByRole("radio", { name: new RegExp(theme) }));
      expect(document.querySelector(".rich-note-content")).toBe(editor);
      expect(title).toHaveValue("仍在编辑的标题");
    }
    expect(screen.getByRole("switch", { name: "减少透明效果" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(async () =>
      expect(
        (
          await repository.listNotes((await repository.listNotebooks())[0].id)
        )[0].title,
      ).toBe("仍在编辑的标题"),
    );
  });

  it.each([false, true])(
    "preserves the editor and formatting selection through appearance, including save failure=%s",
    async (fail) => {
      const user = userEvent.setup();
      render(<SmokeNotesApp repository={repository} platform="web" />);
      await user.click(await findNote("周会记录"));
      const body = (await screen.findByRole("textbox", {
        name: "便签正文",
      })) as HTMLElement & { editor: Editor };
      const title = screen.getByRole("textbox", { name: "便签标题" });
      expect(
        screen.queryByRole("button", { name: "便签颜色：sky" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "粗体" }),
      ).not.toBeInTheDocument();
      act(() => body.editor.commands.setTextSelection({ from: 1, to: 3 }));
      await user.click(screen.getByRole("button", { name: "格式" }));
      await user.click(screen.getByRole("button", { name: "粗体" }));
      expect(body.editor.getJSON().content?.[0].content?.[0].marks).toEqual(
        expect.arrayContaining([{ type: "bold" }]),
      );
      fireEvent.change(title, { target: { value: "外观切换中的草稿" } });
      await user.click(screen.getByRole("button", { name: "更多操作" }));
      await user.click(screen.getByRole("menuitem", { name: "便签外观" }));
      const update = vi.spyOn(repository, "updateNote");
      if (fail) update.mockRejectedValue(new Error("disk full"));
      await user.click(screen.getByRole("button", { name: "便签颜色：sky" }));
      await user.click(screen.getByRole("button", { name: "完成" }));
      if (fail) {
        await waitFor(() =>
          expect(
            within(screen.getByRole("dialog", { name: "便签外观" })).getByRole(
              "status",
            ),
          ).toHaveTextContent("保存失败"),
        );
        expect(title).toHaveValue("外观切换中的草稿");
        expect(document.querySelector(".rich-note-content")).toBe(body);
        update.mockRestore();
        await user.click(screen.getByRole("button", { name: "完成" }));
      }
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(screen.getByRole("textbox", { name: "便签正文" })).toBe(body);
      expect(title).toHaveValue("外观切换中的草稿");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "更多操作" })).toHaveFocus(),
      );
      const saved = (
        await repository.listNotes((await repository.listNotebooks())[0].id)
      )[0];
      expect(saved).toMatchObject({ title: "外观切换中的草稿", color: "sky" });
      expect(saved.contentJson?.content[0].content?.[0].marks).toEqual(
        expect.arrayContaining([{ type: "bold" }]),
      );
    },
  );

  it("shares workspace appearance on desktop while retaining native window controls", async () => {
    localStorage.setItem("smoke-notes:web-background", "glass");
    localStorage.setItem("smoke-notes:web-reduced-transparency", "true");
    render(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={desktopBridge()}
      />,
    );
    await findNote("周会记录");
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    expect(
      screen.queryByRole("radio", { name: /纸面模式/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /外观与阅读/ }));
    expect(screen.getByRole("radio", { name: /玻璃模式/ })).toBeChecked();
    expect(
      screen.getByRole("slider", { name: "窗口透明度" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".platform-desktop")).toHaveAttribute(
      "data-web-background",
      "glass",
    );
  });

  it("applies the background even when browser preference storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    render(<SmokeNotesApp repository={repository} platform="web" />);
    await findNote("周会记录");
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: /外观与阅读/ }));
    fireEvent.click(screen.getByRole("radio", { name: /纸面模式/ }));
    expect(document.querySelector(".platform-web")).toHaveAttribute(
      "data-web-background",
      "paper",
    );
    expect(
      within(screen.getByRole("dialog", { name: "设置与同步" })).getByRole(
        "status",
      ),
    ).toHaveTextContent("本次有效");
  });

  it("keeps appearance open when iPad keyboard focus changes the editor layout", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("innerWidth", 1194);
    vi.stubGlobal("innerHeight", 834);
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    const viewport = Object.assign(new EventTarget(), {
      height: 834,
      offsetTop: 0,
      scale: 1,
    });
    vi.stubGlobal("visualViewport", viewport);
    render(<SmokeNotesApp repository={repository} platform="web" />);
    await user.click(await findNote("周会记录"));
    const body = await screen.findByRole("textbox", { name: "便签正文" });
    act(() => {
      body.focus();
      viewport.height = 350;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(body.closest(".mobile-note-screen")).toHaveClass("compact-editing");
    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "便签外观" }));
    expect(
      await screen.findByRole("dialog", { name: "便签外观" }),
    ).toBeInTheDocument();
    act(() => {
      viewport.height = 834;
      viewport.dispatchEvent(new Event("resize"));
    });
    await user.click(screen.getByRole("button", { name: "便签颜色：sky" }));
    await user.click(screen.getByRole("button", { name: "完成" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "便签外观" })).toBeNull(),
    );
    expect(screen.getByRole("textbox", { name: "便签正文" })).toBe(body);
  });

  it("automatically uses a compact header and restores tools without replacing the editor", async () => {
    vi.stubGlobal("innerWidth", 1194);
    vi.stubGlobal("innerHeight", 834);
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    const viewport = Object.assign(new EventTarget(), {
      height: 834,
      offsetTop: 0,
      scale: 1,
    });
    vi.stubGlobal("visualViewport", viewport);
    render(<SmokeNotesApp repository={repository} platform="web" />);
    fireEvent.click(await findNote("周会记录"));
    const body = await screen.findByRole("textbox", { name: "便签正文" });
    act(() => body.focus());
    act(() => {
      viewport.height = 350;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(
      screen.queryByRole("button", { name: "粗体" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "删除便签" }),
    ).not.toBeInTheDocument();
    const format = screen.getByRole("button", { name: "格式" });
    fireEvent.click(format);
    expect(format).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "粗体" }));
    expect(format).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    expect(screen.getByRole("menuitem", { name: "删除便签" })).toBeVisible();
    act(() => screen.getByRole("menuitem", { name: "删除便签" }).focus());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "更多操作" })).toHaveFocus();
    expect(
      screen.queryByRole("menuitem", { name: "删除便签" }),
    ).not.toBeInTheDocument();
    act(() => {
      viewport.height = 834;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("textbox", { name: "便签正文" })).toBe(body);
    expect(
      screen.queryByRole("button", { name: "粗体" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "格式" }));
    expect(screen.getByRole("button", { name: "粗体" })).toBeVisible();
  });

  const mobileNavigations = ["back", "trash-note"] as const;
  async function leaveMobileEditor(
    destination: (typeof mobileNavigations)[number],
  ) {
    if (destination === "back")
      fireEvent.click(screen.getByRole("button", { name: "返回便签列表" }));
    else {
      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "删除便签" }));
    }
  }

  it.each(mobileNavigations)(
    "saves pending mobile edits before %s navigation",
    async (destination) => {
      const work = (await repository.listNotebooks()).find(
        (item) => item.name === "工作",
      )!;
      const current = (await repository.listNotes(work.id))[0]!;
      const pending = deferred<void>();
      const update = repository.updateNote.bind(repository);
      const save = vi
        .spyOn(repository, "updateNote")
        .mockImplementation(async (id, changes) => {
          await pending.promise;
          return update(id, changes);
        });
      render(<SmokeNotesApp repository={repository} platform="web" />);
      fireEvent.click(await findNote("周会记录"));
      fireEvent.change(
        await screen.findByRole("textbox", { name: "便签标题" }),
        {
          target: { value: "立即离开前的修改" },
        },
      );

      await leaveMobileEditor(destination);

      expect(save).toHaveBeenCalledTimes(1);
      expect(document.querySelector(".rich-note-title")).toHaveValue(
        "立即离开前的修改",
      );
      await act(async () => {
        pending.resolve();
        await pending.promise;
      });
      await waitFor(() =>
        expect(
          screen.queryByRole("textbox", { name: "便签标题" }),
        ).not.toBeInTheDocument(),
      );
      const saved = await database.notes.get(current.id);
      expect(saved?.title).toBe("立即离开前的修改");
    },
  );

  it.each(mobileNavigations)(
    "keeps mobile drafts visible when saving before %s fails",
    async (destination) => {
      const save = vi
        .spyOn(repository, "updateNote")
        .mockRejectedValue(new Error("disk full"));
      render(<SmokeNotesApp repository={repository} platform="web" />);
      fireEvent.click(await findNote("周会记录"));
      fireEvent.change(
        await screen.findByRole("textbox", { name: "便签标题" }),
        {
          target: { value: "保留失败草稿" },
        },
      );

      await leaveMobileEditor(destination);
      await act(async () => {});

      expect(save).toHaveBeenCalledTimes(1);
      expect(document.querySelector(".rich-note-title")).toHaveValue(
        "保留失败草稿",
      );
    },
  );

  it("manually saves once, stays in the editor, and restores navigation on return", async () => {
    const pending = deferred<void>();
    const update = repository.updateNote.bind(repository);
    const save = vi
      .spyOn(repository, "updateNote")
      .mockImplementation(async (id, changes) => {
        await pending.promise;
        return update(id, changes);
      });
    render(<SmokeNotesApp repository={repository} platform="web" />);
    fireEvent.click(await findNote("周会记录"));
    const title = await screen.findByRole("textbox", { name: "便签标题" });
    expect(
      screen.queryByRole("navigation", { name: "主导航" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开便签本" }),
    ).not.toBeInTheDocument();
    fireEvent.change(title, { target: { value: "手动保存的标题" } });
    const button = screen.getByRole("button", { name: "保存" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "保存" })).toBeNull(),
    );
    expect(title).toHaveValue("手动保存的标题");
    fireEvent.click(screen.getByRole("button", { name: "返回便签列表" }));
    expect(
      await screen.findByRole("navigation", { name: "主导航" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "打开便签：手动保存的标题" }),
    ).toBeInTheDocument();
  });

  it("hides manual save after autosave and shows it for a pending edit", async () => {
    render(<SmokeNotesApp repository={repository} platform="web" />);
    fireEvent.click(await findNote("周会记录"));
    const title = await screen.findByRole("textbox", { name: "便签标题" });
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    fireEvent.change(title, { target: { value: "自动保存的标题" } });
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "保存" })).toBeNull(),
    );
    expect(
      screen.getByRole("status", { name: "保存状态" }),
    ).toHaveTextContent("已自动保存");
  });

  it("retains web browsing positions and todo filters across notebook navigation", async () => {
    const { container } = render(
      <SmokeNotesApp repository={repository} platform="web" />,
    );
    await findNote("周会记录");
    const nav = () =>
      within(screen.getByRole("navigation", { name: "主导航" }));
    const list = container.querySelector<HTMLElement>(".notes-board-scroll")!;
    list.scrollTop = 180;
    fireEvent.scroll(list);
    fireEvent.click(screen.getByRole("button", { name: "打开便签：周会记录" }));
    await screen.findByRole("textbox", { name: "便签标题" });
    fireEvent.click(screen.getByRole("button", { name: "返回便签列表" }));
    await findNote("周会记录");
    expect(container.querySelector(".notes-board-scroll")!.scrollTop).toBe(180);
    fireEvent.click(nav().getByRole("button", { name: "待办" }));
    fireEvent.click(await screen.findByRole("button", { name: "筛选" }));
    fireEvent.click(await screen.findByRole("button", { name: "未完成" }));
    fireEvent.click(nav().getByRole("button", { name: "浏览便签本" }));
    fireEvent.click(screen.getByRole("button", { name: "进入便签本：生活" }));
    await screen.findByRole("heading", { name: "生活" });
    expect(container.querySelector(".notes-board-scroll")!.scrollTop).toBe(0);
    fireEvent.click(nav().getByRole("button", { name: "浏览便签本" }));
    expect(
      screen.getByRole("heading", { name: "全部便签本" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "进入便签本：工作" }));
    await findNote("周会记录");
    expect(container.querySelector(".notes-board-scroll")!.scrollTop).toBe(180);
    fireEvent.click(nav().getByRole("button", { name: "待办" }));
    fireEvent.click(await screen.findByRole("button", { name: "未完成" }));
    expect(
      within(screen.getByRole("group", { name: "待办筛选" })).getByRole(
        "button",
        { name: "未完成" },
      ),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a manual save failure and retries without losing the draft", async () => {
    const update = repository.updateNote.bind(repository);
    const save = vi
      .spyOn(repository, "updateNote")
      .mockRejectedValueOnce(new Error("disk full"))
      .mockImplementation(update);
    render(<SmokeNotesApp repository={repository} platform="web" />);
    fireEvent.click(await findNote("周会记录"));
    const title = await screen.findByRole("textbox", { name: "便签标题" });
    fireEvent.change(title, { target: { value: "重试草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText("保存失败，请重试")).toBeInTheDocument();
    expect(title).toHaveValue("重试草稿");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "保存状态" }),
      ).toHaveTextContent("已保存"),
    );
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("switches between notebooks and the fixed todo view", async () => {
    const user = userEvent.setup();
    render(<SmokeNotesApp repository={repository} platform="desktop" />);

    expect(await screen.findByText("周会记录")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "待办" }));

    const toggle = await screen.findByRole("checkbox", {
      name: "完成：交水费",
    });
    await user.click(toggle);
    expect(
      await screen.findByRole("checkbox", { name: "恢复：交水费" }),
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

  it("does not submit a notebook name while confirming an IME candidate", async () => {
    const user = userEvent.setup();
    render(<SmokeNotesApp repository={repository} platform="desktop" />);
    await openNotebookCreation();
    const input = screen.getByRole("textbox", { name: "新便签本名称" });
    fireEvent.change(input, { target: { value: "选字中" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(input).toBeInTheDocument();
    expect(await repository.listNotebooks()).toHaveLength(2);
    await user.click(input);
    await user.keyboard("{Enter}");
    await waitFor(async () =>
      expect(
        (await repository.listNotebooks()).some(
          (book) => book.name === "选字中",
        ),
      ).toBe(true),
    );
  });

  it("supports opening the creation dialog by keyboard, Tab and Escape", async () => {
    const user = userEvent.setup();
    render(<SmokeNotesApp repository={repository} platform="desktop" />);
    await screen.findByText("周会记录");
    const trigger = screen.getByRole("button", { name: "新建便签" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "快速记录内容" }),
      ).toHaveFocus(),
    );
    await user.tab();
    expect(document.activeElement?.tagName).toBe("SUMMARY");
    await user.keyboard("{Enter}");
    await user.tab();
    expect(
      screen.getByRole("combobox", { name: "新便签所属便签本" }),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /文字便签/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /清单便签/ })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
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

    await openNotebookCreation();
    await user.type(
      screen.getByRole("textbox", { name: "新便签本名称" }),
      "灵感",
    );
    await user.keyboard("{Enter}");

    await user.click(
      await screen.findByRole("button", { name: "进入便签本：灵感" }),
    );
    await screen.findByRole("heading", { name: "灵感" });
    await user.click(screen.getByRole("button", { name: "新建便签" }));
    await user.click(screen.getByRole("button", { name: /文字便签/ }));
    await user.click(
      await screen.findByRole("button", { name: "在桌面打开便签" }),
    );
    await waitFor(() => expect(bridge.openNote).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("textbox", { name: "便签正文" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "便签导航" }),
    ).not.toBeInTheDocument();
    const book = (await repository.listNotebooks()).find(
      (item) => item.name === "灵感",
    )!;
    const [created] = await repository.listNotes(book.id);
    expect(bridge.openNote).toHaveBeenCalledWith(created.id);
    await user.type(
      screen.getByRole("textbox", { name: "便签标题" }),
      "主窗口编辑",
    );
    await user.click(screen.getByRole("button", { name: "返回便签列表" }));
    expect(await screen.findByText("主窗口编辑")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /清单便签/ }));

    await user.click(
      await screen.findByRole("button", { name: "在桌面打开便签" }),
    );
    await waitFor(() => expect(bridge.openNote).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("textbox", { name: "便签正文" }),
    ).toBeInTheDocument();
    const notes = await repository.listNotes(
      (await repository.listNotebooks()).find((book) => book.name === "工作")!
        .id,
    );
    expect(notes.at(-1)?.kind).toBe("todo");
    expect(bridge.openNote).toHaveBeenCalledWith(notes.at(-1)?.id);
    await user.click(screen.getByRole("button", { name: "返回便签列表" }));
    expect(
      await screen.findByLabelText("待办便签：无标题便签"),
    ).toBeInTheDocument();
  });

  it("opens the shared desktop detail and keeps the native note action available", async () => {
    const user = userEvent.setup();
    const bridge = desktopBridge();
    render(
      <SmokeNotesApp
        repository={repository}
        platform="desktop"
        desktopBridge={bridge}
      />,
    );

    const card = await findNote("周会记录");
    await user.click(card);
    await user.click(
      await screen.findByRole("button", { name: "在桌面打开便签" }),
    );

    expect(bridge.openNote).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("textbox", { name: "搜索便签" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "便签标题" }),
    ).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "打开设置" }));
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
    await user.click(screen.getByRole("button", { name: "打开设置" }));
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
    await user.click(screen.getByRole("button", { name: "打开设置" }));
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
    await user.click(screen.getByRole("button", { name: "打开设置" }));
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
    await findNote("周会记录");
    await user.click(
      screen.getByRole("button", { name: "更多便签操作：周会记录" }),
    );
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
