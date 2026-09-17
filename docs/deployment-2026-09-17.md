# 网页发布验证 · 2026-09-17

- 源码提交：`d68a661306dfb5cecf3f1c97d11ab55b7f557eba`，已快进合并并推送到 `main`。
- 正式网址：https://smoke-notes-philip.pages.dev 。
- 本次部署：https://6c07cc9d.smoke-notes-philip.pages.dev 。
- 通过 Cloudflare Pages 直接上传 `apps/web/dist`，生产分支为 `main`。
- 网页构建通过；此前同一源码的 191 个测试、类型检查、ESLint 与桌面构建通过。

## 正式域名文件核验

以下 11 项文件均返回 HTTP 200，SHA-256 与本地构建一致。

| 文件                        | SHA-256                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `index.html`                | `f56a5554fe7d3649d5dc6d050b2212aa24aa9af4e84820f626d1b4c9e01123d7` |
| `sw.js`                     | `25ba5d4d52cc9159021019e80d7c3775fcbf643379830db80d1418f3a9590f5a` |
| `manifest.webmanifest`      | `e8922062a09d2137fee829766de3a90ba3a185c55548dc8cad5338059068b45a` |
| `registerSW.js`             | `9742073ef7fc795e7673d98f272992843298426a0ffd8cb3507784df5143608b` |
| `icon-32.png`               | `2bf411d71c0fc9ce06f736f3bad39b51493e7e7debb68379befefae8d193ae11` |
| `apple-touch-icon.png`      | `59d01a9ff20be64487237ad6d1961f6bfcb7621af9c6d333d87b680b2bae276a` |
| `icon-192.png`              | `dc5ad2283615608e6acbca204b2a700b7ded700fd7d1b50cae7e472695aeec98` |
| `icon-512.png`              | `fce7e3be387dedececbc773a048d9efa38c18f6ff364c8b25a523a51d755804e` |
| `icon-maskable-512.png`     | `56dcc9599132a2fa692030fdab9598c9a1639aee3ace5d27e5f593a356d5bbab` |
| `assets/index-BTeiKPS4.js`  | `5313446fcfa0828f166e78733dc60b76d3273bcaaf9bffadb2dc3ae7d5a6f3c8` |
| `assets/index-BPvrZvrx.css` | `49e404dfde31e9d9c8a611c0750302c7f503ead5c91a9c3b77054fde8d1d0e90` |

## 线上交互检查

隔离浏览器已验证全局纸面配色、左下角设置、本地新建与保存，以及模拟 350px 可视高度下的精简编辑。正文区域为 301px；格式浮层正常，恢复高度后回到常规工具栏，页面脚本错误为零。

验证阻断 Supabase 请求，未改动实际云端便签。此次没有验证真实 iPad 输入法、系统主屏幕图标缓存或 Windows 窗口行为，也未生成安装包。

本地原始记录：`outputs/web-deployment-2026-09-17.json`、`outputs/web-live-2026-09-17-compact.json`；这些文件不随源码提交。
