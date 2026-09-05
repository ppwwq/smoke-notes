# 烟笺开机自启动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在桌面版设置中加入默认关闭的“开机时启动”开关，开启后登录 Windows 自动启动烟笺并显示主窗口。

**Architecture:** Windows 登录启动状态由 Electron 主进程直接读取和写入，系统设置是唯一事实来源。渲染进程经受限 IPC 和 preload 桥接访问该能力；UI 乐观更新，但系统调用失败时回退。

**Tech Stack:** Electron、React、TypeScript、Vitest、Testing Library、electron-builder/NSIS

---

## 文件结构

- Create: `apps/desktop/electron/launch-at-login.ts` — 封装安装版判断及 Electron 登录启动读写。
- Create: `apps/desktop/electron/launch-at-login.test.ts` — 测试默认关闭、安装版读写和错误传播。
- Modify: `apps/desktop/electron/main.ts` — 注册仅主窗口可调用的登录启动 IPC。
- Modify: `apps/desktop/electron/preload.ts` — 暴露两个窄桥接方法。
- Modify: `apps/desktop/electron/bundle-output.test.ts` — 验证打包产物保留安全 IPC。
- Modify: `packages/ui/src/types.ts` — 扩展 `DesktopBridge`。
- Modify: `packages/ui/src/components/SettingsPanel.tsx` — 读取、切换并在失败时回退。
- Modify: `packages/ui/src/styles.css` — 排版开关的两行说明。
- Modify: `packages/ui/tests/SmokeNotesApp.test.tsx` — 覆盖设置 UI 行为并补齐桥接 mock。
- Modify: `packages/ui/tests/NoteWindowApp.test.tsx` — 补齐桥接 mock，保持类型检查通过。

### Task 1: 登录启动领域适配器

**Files:**

- Create: `apps/desktop/electron/launch-at-login.ts`
- Create: `apps/desktop/electron/launch-at-login.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, vi } from "vitest";
import { readLaunchAtLogin, writeLaunchAtLogin } from "./launch-at-login";

function fakeApp(isPackaged: boolean, initial = false) {
  let openAtLogin = initial;
  return {
    app: {
      isPackaged,
      getLoginItemSettings: vi.fn(() => ({ openAtLogin })),
      setLoginItemSettings: vi.fn((settings: { openAtLogin: boolean }) => {
        openAtLogin = settings.openAtLogin;
      }),
    },
  };
}

describe("launch at login", () => {
  it("does not read or write a login item in development", () => {
    const { app } = fakeApp(false, true);
    expect(readLaunchAtLogin(app)).toBe(false);
    expect(writeLaunchAtLogin(app, true)).toBe(false);
    expect(app.getLoginItemSettings).not.toHaveBeenCalled();
    expect(app.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it("reads and writes the installed application's actual setting", () => {
    const { app } = fakeApp(true);
    expect(readLaunchAtLogin(app)).toBe(false);
    expect(writeLaunchAtLogin(app, true)).toBe(true);
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
    });
    expect(readLaunchAtLogin(app)).toBe(true);
  });

  it("propagates operating-system failures", () => {
    const { app } = fakeApp(true);
    app.setLoginItemSettings.mockImplementation(() => {
      throw new Error("Windows rejected the login item");
    });
    expect(() => writeLaunchAtLogin(app, true)).toThrow(
      "Windows rejected the login item",
    );
  });
});
```

- [ ] **Step 2: 运行测试并确认因模块缺失而失败**

Run: `node_modules\.bin\vitest.cmd run apps/desktop/electron/launch-at-login.test.ts`

Expected: FAIL，提示无法解析 `./launch-at-login`。

- [ ] **Step 3: 写最小实现**

```ts
export interface LoginItemApp {
  isPackaged: boolean;
  getLoginItemSettings(): { openAtLogin: boolean };
  setLoginItemSettings(settings: { openAtLogin: boolean }): void;
}

export function readLaunchAtLogin(app: LoginItemApp): boolean {
  if (!app.isPackaged) return false;
  return app.getLoginItemSettings().openAtLogin === true;
}

export function writeLaunchAtLogin(
  app: LoginItemApp,
  enabled: boolean,
): boolean {
  if (!app.isPackaged) return false;
  app.setLoginItemSettings({ openAtLogin: enabled });
  return readLaunchAtLogin(app);
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `node_modules\.bin\vitest.cmd run apps/desktop/electron/launch-at-login.test.ts`

Expected: PASS，3 tests passed。

- [ ] **Step 5: 提交本任务**

```powershell
git add -- apps/desktop/electron/launch-at-login.ts apps/desktop/electron/launch-at-login.test.ts
git commit -m "feat: add launch at login adapter"
```

### Task 2: 安全 IPC 与 preload 桥接

**Files:**

- Modify: `apps/desktop/electron/main.ts`
- Modify: `apps/desktop/electron/preload.ts`
- Modify: `apps/desktop/electron/bundle-output.test.ts`
- Modify: `packages/ui/src/types.ts`
- Modify: `packages/ui/tests/SmokeNotesApp.test.tsx`
- Modify: `packages/ui/tests/NoteWindowApp.test.tsx`

- [ ] **Step 1: 先扩展打包产物测试**

在 `bundle-output.test.ts` 的 IPC channel 数组加入：

```ts
"app:get-launch-at-login",
"app:set-launch-at-login",
```

并在同一测试加入：

```ts
expect(main).toContain("Only the main window may change launch settings");
```

- [ ] **Step 2: 构建旧代码并确认测试失败**

Run: `pnpm --filter @smoke-notes/desktop build:electron`

Run: `node_modules\.bin\vitest.cmd run apps/desktop/electron/bundle-output.test.ts`

Expected: FAIL，打包产物不包含新的两个 channel。

- [ ] **Step 3: 扩展桥接类型及所有现有 mock**

在 `DesktopBridge` 加入：

```ts
getLaunchAtLogin(): Promise<boolean>;
setLaunchAtLogin(value: boolean): Promise<boolean>;
```

在 `SmokeNotesApp.test.tsx` 与 `NoteWindowApp.test.tsx` 的桥接对象加入：

```ts
getLaunchAtLogin: vi.fn(async () => false),
setLaunchAtLogin: vi.fn(async (value) => value),
```

- [ ] **Step 4: 在 preload 暴露窄接口**

在 `smokeDesktop` 对象加入：

```ts
getLaunchAtLogin: (): Promise<boolean> =>
  ipcRenderer.invoke("app:get-launch-at-login"),
setLaunchAtLogin: (value: boolean): Promise<boolean> =>
  ipcRenderer.invoke("app:set-launch-at-login", value),
```

- [ ] **Step 5: 在主进程注册仅主窗口可调用的 handler**

在 `main.ts` 导入：

```ts
import { readLaunchAtLogin, writeLaunchAtLogin } from "./launch-at-login";
```

在 `registerIpc()` 加入：

```ts
ipcMain.handle("app:get-launch-at-login", (event) => {
  if (trustedWindow(event) !== mainWindow)
    throw new Error("Only the main window may change launch settings");
  return readLaunchAtLogin(app);
});
ipcMain.handle("app:set-launch-at-login", (event, rawValue: unknown) => {
  if (trustedWindow(event) !== mainWindow)
    throw new Error("Only the main window may change launch settings");
  return writeLaunchAtLogin(app, rawValue === true);
});
```

- [ ] **Step 6: 重建并确认桥接测试通过**

Run: `pnpm --filter @smoke-notes/desktop build:electron`

Run: `node_modules\.bin\vitest.cmd run apps/desktop/electron/launch-at-login.test.ts apps/desktop/electron/bundle-output.test.ts`

Expected: PASS，两个测试文件全部通过。

- [ ] **Step 7: 提交本任务**

```powershell
git add -- apps/desktop/electron/main.ts apps/desktop/electron/preload.ts apps/desktop/electron/bundle-output.test.ts packages/ui/src/types.ts packages/ui/tests/SmokeNotesApp.test.tsx packages/ui/tests/NoteWindowApp.test.tsx
git commit -m "feat: expose launch at login setting"
```

### Task 3: 设置界面开关与失败回退

**Files:**

- Modify: `packages/ui/tests/SmokeNotesApp.test.tsx`
- Modify: `packages/ui/src/components/SettingsPanel.tsx`
- Modify: `packages/ui/src/styles.css`

- [ ] **Step 1: 写 UI 失败测试**

在 `SmokeNotesApp.test.tsx` 增加：

```tsx
it("reads, changes, and rolls back the Windows launch setting", async () => {
  const user = userEvent.setup();
  const bridge = desktopBridge();
  vi.mocked(bridge.getLaunchAtLogin).mockResolvedValue(true);
  vi.mocked(bridge.setLaunchAtLogin)
    .mockResolvedValueOnce(false)
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
  const toggle = await screen.findByRole("switch", { name: "开机时启动" });
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));

  await user.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  expect(bridge.setLaunchAtLogin).toHaveBeenLastCalledWith(false);

  await user.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  expect(bridge.setLaunchAtLogin).toHaveBeenLastCalledWith(true);
});
```

- [ ] **Step 2: 运行 UI 测试并确认找不到开关**

Run: `node_modules\.bin\vitest.cmd run packages/ui/tests/SmokeNotesApp.test.tsx`

Expected: FAIL，找不到名称为“开机时启动”的 switch。

- [ ] **Step 3: 实现状态读取、切换和回退**

在 `SettingsPanel.tsx` 导入 `Power`，增加状态：

```ts
const [launchAtLogin, setLaunchAtLogin] = useState(false);
```

在现有 `useEffect` 中加入：

```ts
void bridge
  .getLaunchAtLogin()
  .then(setLaunchAtLogin)
  .catch(() => setLaunchAtLogin(false));
```

在“窗口置顶”下加入：

```tsx
<label className="switch-setting launch-setting">
  <span>
    <Power size={15} />
    <span className="setting-copy">
      开机时启动
      <small>登录 Windows 后自动显示主窗口</small>
    </span>
  </span>
  <button
    type="button"
    role="switch"
    aria-label="开机时启动"
    aria-checked={launchAtLogin}
    className={launchAtLogin ? "on" : ""}
    onClick={() => {
      const previous = launchAtLogin;
      const requested = !previous;
      setLaunchAtLogin(requested);
      void bridge
        .setLaunchAtLogin(requested)
        .then(setLaunchAtLogin, () => setLaunchAtLogin(previous));
    }}
  >
    <span />
  </button>
</label>
```

在 `styles.css` 加入：

```css
.setting-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.setting-copy small {
  color: var(--muted);
  font-size: 10px;
  font-weight: 400;
}
```

- [ ] **Step 4: 运行 UI 测试并确认通过**

Run: `node_modules\.bin\vitest.cmd run packages/ui/tests/SmokeNotesApp.test.tsx`

Expected: PASS，包含新的登录启动用例。

- [ ] **Step 5: 提交本任务**

```powershell
git add -- packages/ui/tests/SmokeNotesApp.test.tsx packages/ui/src/components/SettingsPanel.tsx packages/ui/src/styles.css
git commit -m "feat: add launch at login toggle"
```

### Task 4: 全量验证与安装包

**Files:**

- Verify only; do not edit source unless a check exposes a defect.

- [ ] **Step 1: 运行全量测试**

Run: `node_modules\.bin\vitest.cmd run`

Expected: PASS，0 failed。

- [ ] **Step 2: 运行类型检查、代码检查和格式检查**

Run: `node_modules\.bin\tsc.cmd -b`

Expected: exit code 0。

Run: `pnpm lint`

Expected: exit code 0，0 errors。

Run: `pnpm format:check`

Expected: exit code 0。

- [ ] **Step 3: 构建所有应用**

Run: `pnpm build`

Expected: exit code 0，桌面端和 Web 端构建完成。

- [ ] **Step 4: 构建 Windows 安装包**

Run: `pnpm --filter @smoke-notes/desktop package -- --config.directories.output=release-autostart`

Expected: exit code 0，并生成 `apps/desktop/release-autostart/SmokeNotes-Setup-0.1.0.exe`。

- [ ] **Step 5: 检查变更范围与安装包**

Run: `git diff --check`

Expected: 无输出，exit code 0。

Run: `Get-Item apps/desktop/release-autostart/SmokeNotes-Setup-0.1.0.exe | Select-Object FullName,Length,LastWriteTime`

Expected: 文件存在且长度大于 0。

- [ ] **Step 6: 报告人工验收边界**

在最终报告中明确列出：安装包已自动化验证；仍需用户安装后开启“开机时启动”，注销或重启 Windows，确认主窗口自动显示；随后关闭开关并再次登录，确认应用不再启动。未执行真实登录循环时，不得把这项写成已通过。
