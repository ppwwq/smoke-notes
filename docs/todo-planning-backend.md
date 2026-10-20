# 待办计划同步：后端变更与发布条件

当前源码已实现本机保存、排程资料及真实同步协议，但**本任务没有对线上数据库或 Edge Function 作任何变更**。新增计划资料在旧后端不可同步；新客户端在写入前探测能力，保留本机待同步队列并显示状态，不把资料丢弃或假报已同步。

## 变更

- `202610200001_todo_planning.sql` 在现有 `todos` 加入可空的 `planning jsonb`。旧资料不删除、不重建、不改版本；历史 `applied_operations` 回执保留。迁移以一个事务完成。
- `planning.version = 1` 支持一次性任务、重复规则、每日实例、香港换日设置；完整保留规则修订、每字段时钟及完成/跳过/撤销事件。数据库检查结构、有效日期、状态、规则、0/4 点设置及大小。
- 数据库唯一索引约束同一工作区的 `seriesId + date` 只有一个实例，包含软删除记录；恢复历史不会制造第二份实例。实例写入后不能更换所属重复事项或日期。每工作区只有一个规划设置记录。
- 写入仍使用既有 `apply_workspace_mutation` 原子事务、实体锁、乐观版本及幂等回执；同一实例的双设备创建得到一个成功和一个含完整资料的冲突响应，客户端合并后重试。行级安全与现有权限保持。
- 新增经过身份验证的 `workspace_sync_capabilities()` RPC，返回 `{ "todoPlanning": 1 }`。Edge Function 的 `{ "capabilities": true }` 请求返回 `{ "capabilities": { "todoPlanning": 1 } }`；缺少迁移时明确返回 `todo_planning_unavailable`。
- 新版 `apply-mutation` 完整传递计划 JSON，在发送有计划资料的写入前再次检查数据库能力；新 RPC 成功及冲突回执包含 `todoPlanningVersion: 1`。

## 兼容与数据保留

没有计划资料的旧待办仍可由旧客户端更新。已有计划资料的记录，如果收到旧客户端遗漏 `planning` 的更新，会在写入前返回 `todo_planning_client_required`，资料和版本均保持原样。这样不会让旧版 `completed` 字段与新版状态/历史矛盾。应升级参与同步的所有客户端；旧版界面不具备正确展示计划规则和设置的能力。

完成与删除使用不同操作。停止未来重复及历史软删除由客户端明确选择，后端不运行历史清理任务、不提供不可恢复清除，也不会在关闭网页时执行通知。现有旧回执不会补造新能力标记；未知旧结果由客户端保守保留队列，不能凭 HTTP 200 认定资料已被保存。

## 发布顺序（待用户批准后另行执行）

1. 核对既有 Supabase 项目与迁移历史，备份现有资料。先在该项目的测试环境审核并应用 `supabase/migrations/202610200001_todo_planning.sql`；不要重置数据库或修改既有迁移。
2. 部署 `supabase/functions/apply-mutation/index.ts` 及同目录 `planning.ts`。只有迁移和 Edge Function 都完成，能力探测才应返回 1。
3. 用既有已授权账户检验能力探测、一次性任务、重复事项与实例的保存/读取、软删除恢复、离线后重连及两设备合并；确认失败不会清除本机队列。此步骤本任务尚未在托管服务执行。
4. 再发布新版 Web/桌面客户端，并安排其他设备升级。若能力探测失败，先保留本机资料，修复后端后重试；不要改为伪同步或放宽权限。

如需回滚界面，应保留新增资料列、索引及能理解计划资料的 Edge Function；不得以删除 `planning`、清空表或重置数据库回滚。旧客户端会受到上述防覆盖保护。托管环境的迁移及函数发布权限/批准尚未在本任务取得，因此**未达到直接发布新同步功能的条件**。

## 已执行的本机验证

```sh
docker pull postgres:17-alpine
python3 supabase/tests/database/test_mutation.py
node_modules/.bin/vitest run supabase/functions/apply-mutation/planning.test.ts supabase/tests/schema-migration.test.ts
```

SQL 测试运行于临时 PostgreSQL 17 容器，没有公开端口或网络，不读取 Supabase 密钥，完成后自动删除容器。测试包含全部旧原子写入/配对/权限回归，加上规划资料完整往返、跨设备同时创建、已完成实例不被空实例覆盖、日期唯一约束、软删除后防重建、实例身份不可改、规则修订及撤销事件保留、设置 0/4 点、旧资料升级不丢失、旧客户端更新被保护、无效资料不产生成功回执。

本机 PostgreSQL 验证不等同于托管 Supabase Auth、PostgREST、Realtime 和 Edge Function 端到端验证；后者需待获准发布到对应测试环境后执行。
