# Jotday 部署说明

## 1. 创建 Supabase 项目

1. 在 Supabase 创建项目，记录 Project URL、Publishable Key 和 Project Ref。
2. 在 Authentication 设置中启用匿名登录。手机清除浏览器数据后会成为新设备，需要重新配对。
3. 安装并登录 Supabase CLI，然后在项目根目录执行：

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy create-pairing
supabase functions deploy redeem-pairing
supabase functions deploy apply-mutation
```

迁移会创建私人空间、设备成员、便签本、便签、待办、一次性配对码及 RLS 策略，并为便签加入富文本 JSON、颜色和普通/待办类型字段。旧记录会保留内容并默认为普通便签。

## 2. 配置构建变量

两个应用均读取仓库根目录的 `.env`，不要只在 `apps/web` 或 `apps/desktop` 中填写配置。托管平台提供的同名环境变量优先于文件。

在本地 `.env` 以及 Cloudflare Pages 的 Production/Preview 环境中设置：

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_WEB_APP_URL=https://YOUR_PROJECT.pages.dev
```

不要把 Service Role Key 放进 `.env` 或前端。Supabase 托管边缘函数会提供其运行所需的服务端环境变量。

生成二维码的服务器还需要单独设置正式网页地址（`VITE_WEB_APP_URL` 不会自动传到边缘函数）：

```powershell
supabase secrets set WEB_APP_URL=https://YOUR_PROJECT.pages.dev
```

将示例地址替换为实际 HTTPS 地址。网页域名改变时也要更新此值，否则二维码仍会指向旧地址。参考 [Supabase 环境变量文档](https://supabase.com/docs/guides/functions/secrets)。

## 3. 在本机发布网页到现有 Cloudflare Pages

网页由本机构建、上传和验证。GitHub Actions 中的 `web`、`verify_web` 作业已删除；推送代码不会触发网页发布，也不再使用 `production-web` 环境。

先配置根目录 `.env` 的公开浏览器变量，完成本地检查，将应用源码提交并推送到 `main`。本机使用已安装并登录的 Wrangler，执行：

```powershell
node tools/deploy-web.mjs --wrangler "C:/path/to/node_modules/wrangler/bin/wrangler.js"
```

也可通过环境变量 `WRANGLER_CLI` 指定同一路径。脚本会核对本地与远端 main、构建网页、只上传 `apps/web/dist` 到现有 `smoke-notes-philipwwq` 项目的 main，随后核对 Production 记录和全部公开静态文件哈希。不会上传 `.env`、本机资料或仓库目录。结果保存在忽略目录 `outputs/web-local-deploy/`。当前脚本面向 Windows，使用系统 `curl.exe`。

上传结果不确定时先检查现有 deployment，使用同一已构建版本只做核验，不重复上传：

```powershell
node tools/deploy-web.mjs --wrangler "C:/path/to/node_modules/wrangler/bin/wrangler.js" --verify-only
```

网页部署与数据库迁移分开。包含新增云端接口的版本先完成对应后端迁移与验证；本机网页上传不负责改数据库。现有 `Manual backend release` 只负责数据库／Edge Function 发布和检查，不再接续网页部署。

## 4. 构建 Windows 安装包

在已配置相同环境变量的 Windows x64 电脑执行：

```powershell
pnpm --filter @smoke-notes/desktop package
```

输出文件为 `apps/desktop/release/Jotday-Setup-<版本号>.exe`，版本由桌面应用的 package.json 决定。当前构建没有商业代码签名；正式分发前应配置 Windows 代码签名证书。

## 5. 上线验收

1. 电脑创建三个便签本和多张不同颜色便签，拖动排序并打开独立窗口。
2. 手机扫描二维码或输入六位码，确认标题、格式、颜色、顺序和待办双向同步。
3. 手机断网编辑后恢复网络，确认内容上传且没有丢失。
4. 用不属于该空间的 Supabase 用户确认无法读取便签数据。
5. 在 Windows 重启程序，确认上次打开的便签位置、大小、透明度和置顶状态恢复。
