/* global require, __dirname, URL, Response */
/* eslint-disable @typescript-eslint/no-require-imports -- Electron main and sandbox preload use CommonJS. */
const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  protocol,
  net,
} = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const process = require("node:process");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "preview",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
const profile = process.argv.find((arg) => arg.startsWith("--user-data-dir="));
app.setPath(
  "userData",
  profile
    ? profile.slice("--user-data-dir=".length)
    : path.join(app.getPath("appData"), "SmokeNotesWebPreview"),
);
const modes = {
  desktop: [1440, 900],
  portrait: [390, 844],
  ipadPortrait: [820, 1180],
  ipadLandscape: [1180, 820],
};
const sources = {
  local: "preview://app/review.html",
  online: "https://smoke-notes-philipwwq.pages.dev/",
};
let win,
  view,
  closing = false;
let state = {
  mode: "ipadLandscape",
  source: "local",
  status: "正在载入…",
  scale: 1,
};
const mobileUA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36";
const ipadUA =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
function publish() {
  if (win && !win.isDestroyed()) win.webContents.send("preview:state", state);
}
async function layout() {
  if (closing || !view || !win) return;
  const [width, height] = modes[state.mode];
  const [outerW, outerH] = win.getContentSize();
  const scale = Math.min(1, (outerW - 64) / width, (outerH - 214) / height);
  const w = Math.floor(width * scale),
    h = Math.floor(height * scale);
  view.setBounds({
    x: Math.floor((outerW - w) / 2),
    y: 154 + Math.floor((outerH - 214 - h) / 2),
    width: w,
    height: h,
  });
  const mobile = state.mode !== "desktop";
  const ipad = state.mode.startsWith("ipad");
  await view.webContents.debugger.sendCommand(
    "Emulation.setUserAgentOverride",
    {
      userAgent: ipad ? ipadUA : mobile ? mobileUA : app.userAgentFallback,
      platform: ipad ? "MacIntel" : mobile ? "Linux armv8l" : "Win32",
    },
  );
  await view.webContents.debugger.sendCommand(
    "Emulation.setDeviceMetricsOverride",
    {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
      scale,
      screenWidth: width,
      screenHeight: height,
      screenOrientation: {
        type: width > height ? "landscapePrimary" : "portraitPrimary",
        angle: width > height ? 90 : 0,
      },
    },
  );
  await view.webContents.debugger.sendCommand(
    "Emulation.setTouchEmulationEnabled",
    { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 },
  );
  state.scale = Math.round(scale * 100);
  publish();
}
function report(error) {
  state.status = "无法载入：" + error.message;
  publish();
}
function allowed(url) {
  try {
    return (
      new URL(url).origin === new URL(sources[state.source]).origin &&
      (state.source !== "local" || url.startsWith("preview://app/"))
    );
  } catch {
    return false;
  }
}
async function load() {
  state.status = "正在载入…";
  publish();
  await layout();
  await view.webContents.loadURL(sources[state.source]);
}

app
  .whenReady()
  .then(async () => {
    protocol.handle("preview", (request) => {
      const url = new URL(request.url);
      const root = path.join(__dirname, "dist");
      let file;
      try {
        file = path.resolve(root, "." + decodeURIComponent(url.pathname));
      } catch {
        return new Response("Bad path", { status: 400 });
      }
      if (
        url.host !== "app" ||
        !file.startsWith(root + path.sep) ||
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile()
      )
        return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).href);
    });
    win = new BrowserWindow({
      width: 1360,
      height: 940,
      minWidth: 760,
      minHeight: 560,
      title: "Jotday · 网页预览",
      icon: path.join(__dirname, "dist", "icon-192.png"),
      backgroundColor: "#e9e8e2",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.contentView.addChildView(view);
    view.webContents.session.setPermissionRequestHandler(
      (_wc, _permission, callback) => callback(false),
    );
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (event, url) => {
      if (!allowed(url)) event.preventDefault();
    });
    view.webContents.on("will-redirect", (event, url) => {
      if (!allowed(url)) event.preventDefault();
    });
    // Initialize the embedded renderer before sending emulation commands.
    await view.webContents.loadURL("about:blank");
    view.webContents.debugger.attach("1.3");
    view.webContents.on("did-finish-load", () => {
      state.status = "已载入 · 可直接操作";
      layout().catch(report);
    });
    view.webContents.on(
      "did-fail-load",
      (_event, code, description, _url, main) => {
        if (main && code !== -3) report(new Error(description));
      },
    );
    win.on("resize", () => layout().catch(report));
    win.on("close", () => {
      closing = true;
      view.webContents.close();
    });
    let busy = false;
    ipcMain.handle("preview:action", async (event, action, value) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame
      )
        throw new Error("Invalid sender");
      if (action === "state") return state;
      if (busy) return state;
      busy = true;
      try {
        if (action === "mode" && Object.hasOwn(modes, value)) {
          state.mode = value;
          await layout();
        } else if (action === "source" && Object.hasOwn(sources, value)) {
          state.source = value;
          await load();
        } else if (action === "reload") await load();
        else if (action === "rotate") {
          state.mode =
            state.mode === "ipadLandscape" ? "ipadPortrait" : "ipadLandscape";
          await layout();
        }
      } catch (error) {
        report(error);
      } finally {
        busy = false;
      }
      publish();
      return state;
    });
    await win.loadFile(path.join(__dirname, "index.html"));
    await load();
  })
  .catch(report);
app.on("window-all-closed", () => app.quit());
