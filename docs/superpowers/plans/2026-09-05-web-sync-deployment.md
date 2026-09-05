# 手机网页与两端联动实施计划

**Goal:** 上线手机 PWA 并接通现有 Windows 应用的私人空间同步。

**Architecture:** 保留 Electron、共享数据层与 Supabase；手机网页部署到用户的托管账户。已有本地数据必须保留。用户要求不再运行电脑端测试。

**Tech Stack:** Vite、React、Supabase、Cloudflare Pages。

- [x] 检查两端启动入口、配对函数及部署文档。
- [x] 两个 Vite 配置增加 `envDir: fileURLToPath(new URL("../../", import.meta.url))`，读取根目录配置。
- [x] 在部署文档补齐服务端 `WEB_APP_URL` 设置，修正安装包版本说明。
- [x] 手机网页生产构建通过，已生成页面、manifest 和离线缓存；没有运行电脑端测试。
- [x] 已创建 Supabase 项目 koundrkjeambrcodxkdd，并登录 Cloudflare。
- [x] 初始数据库和三项函数已部署，匿名登录已启用，正式地址已设置。
- [x] PWA 已发布到 https://smoke-notes-philip.pages.dev ，配对页面可打开。
- [x] 处理现有电脑离线空间首次接入云端的数据迁移，保留原始内容和待上传记录；登记接口已上线并完成 API 验证。
- [ ] 验证真实配对、双向编辑与断网恢复；报告线上验收结果与未完成项。

后续状态：登记接口和临时 API 验证已获授权并完成，原审批阻碍已解除；真实手机画面、配对和双端实际使用仍未观察。详情见 docs/deployment-status-2026-09-05.md。用户随后要求全项目检查，本地桌面测试已恢复，最新结果见 docs/verification-2026-09-05.md。
