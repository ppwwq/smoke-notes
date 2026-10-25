# Jotday Android

原生 Java / Android Views 日历，最低 Android 8.0（API 26）。首页为月历和当天安排；双指缩放月历、左右滑动换月。大小设置仅在本机保存。紧凑底部编辑器支持草稿、全天、时区、重复日程和单次／此后／系列编辑。

## 构建与签名

需要完整 JDK 17 或更新版本（含 jlink）、Android SDK 35 / Build Tools 35.0.0。在本目录配置忽略的 `local.properties`；Windows 示例：`sdk.dir=D\:/program/Android/SDK`。

```powershell
$env:JAVA_HOME = 'D:/program/Android/Android studio/jbr'
./gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest :app:assembleRelease :app:lintDebug
```

构建只从根目录 `.env` 读取公开的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`；不读取服务端密钥。若 aapt2 下载受限，可加 `-Pandroid.aapt2FromMavenOverride=D:/program/Android/SDK/build-tools/35.0.0/aapt2.exe`。

在仓库根目录运行 `./tools/package-android.ps1`，输出 `outputs/android/Jotday-0.1.0-android.apk`，并验证 v2/v3 签名。签名材料留在忽略的 `work/android-signing`，密码使用当前 Windows 用户的 DPAPI 保护。后续覆盖升级必须保留同一签名密钥并递增 versionCode；不要把签名目录放入交付文件或 Git。

## 验证

- `CalendarProjectorTest` 使用 `packages/core/test-fixtures/calendar-contract.json` 与网页共享 8 组重复／时区样例，并覆盖未来待办、删除和显式编辑。
- 此 Windows 中文路径下 Gradle Test worker 出现 classpath 类查找问题；已通过直接启动 JUnitCore 运行同一编译结果。标准 Gradle 单测任务未据此宣称通过。
- `NativeChecks` 仅在独立、未配对的测试设备运行：`adb -s SERIAL shell am instrument -w app.jotday.calendar.test/app.jotday.calendar.NativeChecks`，验证双指缩放、选择不误触、Activity 重启后大小恢复、编辑器保存入口。
- 数据库协议验证：先 `npm install --prefix work/android-validation --no-audit --no-fund @electric-sql/pglite@0.3.14`，再 `node tools/test-planner-database.mjs`。数据库仅在测试内存里创建。

## 同步与发布边界

SQLite 保存内容和持久待同步状态；RPC 使用服务端版本与幂等操作 ID，冲突保留本机副本和记录。会话由 Android Keystore AES-GCM 加密，备份／设备转移不复制会话。配对复用现有网页版的 6 位码；已配对的不同工作区使用分开的本地数据库。

应用在前台每 15 秒和恢复时同步，关闭应用期间不运行后台同步。网页待办作为只读提醒显示（含未来重复规则），完整编辑在网页版进行。显示时区为香港；事件保留原始时区。不同设备导入同一来源时保留内容并提示核对。

正式双向同步依赖 `202610250001_planner_sync.sql` 及本次网页包同时发布。先迁移后发布网页；在服务端缺少能力时显示未启用／本机已保存，不假报已同步。2026-10-25 此次交付尚未发布迁移、未在真实云工作区做跨设备验收，也未做实体手机验收。
