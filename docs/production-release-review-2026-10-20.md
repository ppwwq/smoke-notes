# 2026-10-20 發布準備獨立復核

## 範圍與基線

僅雲端代碼審查、離線測試及原準備分支提交；未連正式資料庫、讀取 Secret 值、建立憑證、dispatch workflow、合併 main 或部署。原本的工作區修改已保留後繼續完成。

- 遠端 main：`43820f0f0aec48c9adf8ad60d62e9f0f8c7b66db`。
- 復核起點 `ci/manual-production-release`：`98bbcf6e32607779003d1e7039b9c8731e030280`。
- `git ls-remote` 再次確認上述兩個 SHA，未覆蓋他人提交。
- 既有 planning SQL SHA-256 仍為 `5fe5115274fb3ed05742b9c257d850d3513d9b343e55b469bbe905692d238f96`；本次沒有修改 migration、Edge Function 或應用功能。

## 已修正

1. **資料庫連線目標覆寫**：原本只檢查 URL 的 hostname 及 sslmode，額外 libpq query 仍可能令 CLI 改用另一目標。現在只接受單一 `sslmode=require`，拒絕額外／重複參數、fragment，並移除繼承的 `PGHOSTADDR`／`PGSERVICE` 等 PG 參數。資料庫子程序不繼承管理 PAT，函式部署不繼承資料庫憑證。
2. **空資料的隔離探測無效**：原本 B 查空工作區，即使沒有 RLS 也會通過。現在 A 先寫入並確認一列，B 必須查不到且 mutation 回 403，A 的列及版本維持不變，才允許配對並繼續同步探測。401 等其他錯誤不能算隔離通過。
3. **避免先改 DB 才發現函式 Token 無效**：新增對既有函式的唯讀 GET preflight，拒絕重導向；失敗不執行任何資料庫命令。這只證明 Token 有效及讀取權限，不能預先證明寫入權限。實際 Token 本輪未取用／驗證。
4. **遷移結果必須有對應 history**：CLI 成功退出後重新讀 history；未符合完整預期即阻止函式部署。保留原本八張表的資料雜湊比較及不自動 rollback 原則。CLI 安裝後、backend 執行前再檢查 main／備份門檻。
5. **避免同 SHA 舊部署誤判**：Pages 必須出現不同於上傳前的 deployment ID，且為 production/main/指定 SHA、deploy stage 成功。舊 ID、preview、錯 branch／SHA／stage 一律不能確認；之後仍逐檔比較正式網址內容。

## 接口及最小權限核對

審查固定版本 Supabase CLI `v2.121.0` 原始碼，commit `8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2`：

- [`functions/deploy.ts`](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/shared/functions/deploy.ts)：命名函式的 `--use-api` 路徑需要列出函式、上傳部署及 bulk function update，均屬 Edge Functions 讀寫。本流程不使用 `--prune`、`supabase link` 或 API key secrets 讀取。
- [`linked-project-cache.layer.ts`](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/telemetry/linked-project-cache.layer.ts)：CLI 仍可能做額外 `GET /v1/projects/{ref}` 更新快取；這是 best effort，非 200 直接返回，錯誤忽略。僅 Edge Functions 權限可能令它 403，不應因此加 Project Settings 或全面權限。
- [`db push 副作用紀錄`](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/commands/db/push/SIDE_EFFECTS.md) 及 handler：密碼式 `--db-url` 走直接 PostgreSQL，不需 linked-path 的臨時角色管理 API；`--skip-vault` 避免同步 Vault 設定。本流程不帶 seed／roles／include-all 旗標。
- [Supabase scoped PAT 文件](https://supabase.com/docs/guides/platform/personal-access-tokens) 支持專案限制與細分讀寫 scope；上述結論是釘選 CLI 程式路徑及文件的對照，不是對已保存 Token 的實際 API 驗證。
- [GitHub environment GET](https://docs.github.com/en/rest/deployments/environments#get-an-environment) 文件列出 Actions read；workflow 保持 `contents: read`、`actions: read`。本地連接器的 Forbidden 不代表未來 runner 已驗證可用；runner 讀不到仍會停止，不繞過。
- [Cloudflare project GET schema](https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/get/) 包含 canonical deployment 的 environment、trigger metadata、latest stage；新的確認條件與該 schema 對應。

## 本次測試證據

| 命令／檢查                                                                                     | 結果      | 實際涵蓋及限制                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tools/production -p 'test_*.py' -v` | 27 項通過 | URL 覆寫／憑證分離、guard、Token preflight 失敗阻止 DB、history／資料變更阻止下游、有效隔離探測的正反例（包含回 403 卻竄改資料）、Pages 舊部署／錯階段／內容不符及失敗不重發。全部 mock／本地檔案，不接平台。                                                         |
| `PYTHONDONTWRITEBYTECODE=1 python3 supabase/tests/database/test_mutation.py`                   | 31 項通過 | 真實 PostgreSQL 17 容器，`--network none`、不開埠，套用倉庫 migrations 及本地 auth fixture。強化 populated planning workspace 測試：owner 可見、非成員不可讀、非成員寫入被拒且原資料不變、成員可見；另涵蓋既有原子性／併發／planning 回歸。這不是正式 Supabase 驗證。 |
| `actionlint .github/workflows/release-production.yml`                                          | 通過      | workflow 語法／表達式；不證明 Environment、Token 或 runner 實際權限。                                                                                                                                                                                                 |
| `git diff --check`                                                                             | 通過      | diff 空白檢查；migration hash 安全測試同步通過。                                                                                                                                                                                                                      |

本次沒有重新跑整套前端型別／Lint／應用單元測試／build；沒有修改前端代碼。正式工作流程仍會執行那些完整檢查。沒有真實備份／還原、托管 API、手機 UI、IndexedDB／Realtime、Token 寫入或正式部署證據。

## 已回報配置與未解阻礙

下列配置**僅引用桌面回報，本環境未獨立驗證**：兩個 Environment 僅 main、reviewer `wangpeien858-hue`、防自審、無 admin bypass；兩側公開 key／專案變數，以及 web 的 Cloudflare token／account 已填；backend token 已換為 90 天專案級 Edge Functions Read/Write。不得把它們寫成此次已實測成功。

本環境對 `GET /repos/ppwwq/smoke-notes/environments/production-backend` 的只讀查詢被 **Forbidden 拒絕**；沒有重試繞過，亦沒有讀取 Secret。尚缺 `SUPABASE_DB_URL`、真實備份保留與隔離還原證據、正式 schema／migration history 核對；`RELEASE_ENABLED` 依回報仍關閉。這些是未完成／待輸入的前置條件，沒有嘗試相關正式變更，也不存在「已發布但不確定」的結果。

## 取得既有 DB 連線資料後的最短路徑

1. 由持有人經已批准的私密管道提供既有 direct/session URL（5432、postgres、唯一 `sslmode=require`、密碼 URL 編碼）並存入 backend Environment；不在聊天／日誌回顯。先做只讀目標、schema、權限及 migration history 核對。歷史若未登記，人工比對已執行 SQL 後另行批准校正；此流程不能自動 repair。
2. 在既有、已批准的設施完成可取回備份、保留至少七天，還原至隔離目標並檢查 schema／資料／角色／身份關聯／history。若沒有適合的既有儲存或隔離目標，先解決該阻礙；不新建付費設施、不用空聲明代替證據。
3. 審查分支 diff，經授權合併 main 後取得最終 SHA，將真實備份／還原聲明綁定該 SHA；確認證據不超過 24 小時及保留期。只有就緒後由擁有人開啟 `RELEASE_ENABLED`。
4. 在 main 手動 dispatch 完整 SHA／證據 ID。不同於發起者的指定 reviewer 先批准 backend，preflight／遷移／保留檢查／托管雙客戶端驗證全部通過後，再批准 web。若指定 reviewer 本人發起，防自審會阻止其批准，應安排符合保護規則的發起人，不關閉保護。
5. 核對部署 ID、SHA、逐檔驗證結果，再做手機與瀏覽器同步驗收。失敗先查真實狀態，不盲重發、不倒退 DB。

已寫好的自動化：dispatch 後的身份／環境／備份聲明門檻、完整 CI、Token GET、history／雜湊保留檢查、指定 migration／函式部署、隔離 API 探測、靜態構建／Pages 上傳及部署內容驗證、失敗停止下游。仍需人工：既有連線資料、備份保留和真實隔離還原、可能的歷史校正、合併／啟用／dispatch、兩次 Environment 批准及實機驗收。此為有人工門檻的發布自動化，尚未實際啟用或發布成功。
