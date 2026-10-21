# 無備份手動發布：2026-10-21 評估

用戶已明確取消備份並接受資料可能丟失，要求優先跑通雲端部署。本模式把這項選擇記錄為 SHA／目標綁定的風險接受，沒有備份聲明，也不自動刪除或重建資料。備份不是 Supabase／GitHub 對本次 DDL 的平台強制條件；此前要求備份聲明、24 小時新鮮度及七天保留是本倉庫自行設定的發布政策。

## 最小實作

`release-production.yml` 增加 `release_mode`（預設仍為 `verified_backup`）及 `no_backup_risk_ack`。選 `no_backup` 必須留空 `backup_evidence_id`，並精確填寫：

```text
I_ACCEPT_DATA_LOSS_WITHOUT_BACKUP:<最終 main 完整 40 位 SHA>:<目標 20 位 project ref>
```

guard 在 backend 接收部署 Secrets 前、以及 CLI 安裝後再次驗證同一確認字串；成功摘要明示 `NO BACKUP`，不建立、讀取或宣稱任何備份證據。缺少確認、SHA／專案不同、未知模式、混填證據，或 `RELEASE_ENABLED` 非 true 均停止。現有 main／workflow SHA 檢查、只允許 main、兩個 Environment 的獨立審核與防自審／無 admin bypass、Token 預檢、TLS／目標限制、migration history、資料雜湊、RLS 探測及 Pages 驗證全部保留。GitHub 環境保護是平台實際執行的配置，不能因接受資料損失而繞過。

## 遷移風險核對

相對既有 main `43820f0f0aec48c9adf8ad60d62e9f0f8c7b66db`，只有一份新增 migration：`202610200001_todo_planning.sql`，SHA-256 仍為 `5fe5115274fb3ed05742b9c257d850d3513d9b343e55b469bbe905692d238f96`。

| 變更                                                     | 具體效果／風險                                                                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新增 nullable `todos.planning jsonb`，無 DEFAULT         | 舊列得到 NULL；沒有資料回填或刪除。PostgreSQL 不需因此重寫整張表，但 DDL 需要鎖。                                                                                    |
| CHECK 與兩個部分唯一索引                                 | NULL 可通過驗證，舊列不進入 planning 索引；未來計畫記錄受合法格式／同日期唯一限制。普通索引與 CHECK 驗證仍會掃描資料，交易持有的表鎖可暫停待辦讀寫，不能承諾零停機。 |
| `valid_todo_planning`、capability RPC、替換 mutation RPC | 是函式定義／權限變更，遷移時不執行函式內的 INSERT／UPDATE。之後應用寫入行為會改變，故不能只當作「加一欄」。                                                          |
| `REVOKE insert, update, delete`                          | 限制直接操作 receipts 的權限，不是 DELETE 資料。                                                                                                                     |
| DROP／TRUNCATE／RESET／批量覆寫                          | 本份遷移沒有這些正式資料操作；本次也不增加。                                                                                                                         |

SQL 自帶 `BEGIN`／`COMMIT`，本檔所有 DDL 可在同一交易內執行（沒有 `CREATE INDEX CONCURRENTLY`）。提交前出錯可回滾整份 SQL；**history 修復、SQL 提交、Edge／Pages 部署不是一個跨平台交易**。提交後的應用誤寫不會因這個交易而自動還原，沒有備份就沒有已驗證的資料恢復點。若連線中斷而提交結果不明，先查實際欄位／索引／函式／history；不能盲目重跑，因 `ADD COLUMN` 不是冪等。

目前只讀檢視代碼，正式庫「history 缺失、planning 未套用、三個函式僅格式差異」引用父任務已回報的檢查；本雲端沒有重新連正式庫。三個函式相符不等於全部歷史 migration 效果已核對，仍應確認欄位、索引、RLS、grants 等。

## History 修復與最短執行順序

1. 審核本次變更，獲准後推送／合併至 main，記下最終 SHA。確認正式專案及前七份 migration 的實際效果。不要把「history 表不存在」解讀為「資料庫空白」。
2. 若前七份效果已存在，只為明確版本補登 applied：`202608280001`、`202608280002`、`202608290001`、`202609050001`、`202609050002`、`202610150001`、`202610150002`。這會修改管理用 ledger，不重放那些 migration SQL；需獲准執行該具體 metadata 變更。**不能把尚未執行的 `202610200001` 提前標成 applied；不能使用無版本參數的 repair-all、reset 或重放全部 migration。**
3. history 必須與前七份完全相符後，擁有人啟用 `production-backend.RELEASE_ENABLED=true`，手動 dispatch：main、最終 SHA、`operation=release`、`release_mode=no_backup`、空白 evidence ID、精確風險確認。指定 reviewer 先批准 backend。預設的 `operation=audit_only` 只做[唯讀核對](production-read-only-audit.md)，不會接續發布。
4. 按既有順序只套用已審查 planning SQL → 核對完整 history 和舊資料保留 → 部署 planning-aware Edge Function → API 隔離／同步測試 → reviewer 批准 web → 上傳靜態頁面及驗證。失敗停止，不能藉「資料可以丟」跳過未知 schema 或來源／目標不符。

Migration history 是 CLI 的管理紀錄，不是 PostgreSQL 執行指定 SQL 的平台前提；直接執行單份 SQL 在技術上可以不依賴該 ledger。但現有可審核發布路徑使用 CLI 並嚴格核對 history，因此選擇先精確補登，避免另開無紀錄發布途徑。釘選 CLI 的 specific-version repair 會更新管理表；零版本的 repair-all 可能 TRUNCATE ledger，本次不採用。

## 相容回退的邊界

- 舊的普通待辦（planning=NULL）仍可按原格式操作；已含 planning 的待辦由新 RPC 拒絕不懂 planning 的舊客戶端更新，避免清掉計畫／歷史。因此回到舊 UI 可能令部分待辦暫時無法編輯，不能稱為完整功能回滾。
- 部署失敗或 UI 回退時保留新增欄位、索引及 planning-aware RPC／Edge；優先向前修正，或使用理解 planning 的相容前端。不要回退為會丟棄 planning 欄位的舊寫入端。
- 首筆 planning 資料寫入後，DROP 欄位會永久丟失該資料；刪庫、TRUNCATE、清空資料、恢復覆蓋都不在本次授權執行範圍。用戶接受風險不等於主動批准這些操作。

## 驗證與未完成項目

本地發布安全測試共 33 項通過（原 27 項及新增 6 項模式測試），包含 no-backup 不會繞過 main／workflow／environment 保護，錯 SHA／專案／確認拒絕，以及預設備份模式繼續要求有效聲明。actionlint 與 diff／文件格式檢查通過。未修改 SQL／Edge／前端，既有 31 項 PostgreSQL 回歸結果作為既有證據，未冒稱本輪重跑或已驗證正式庫。

此前備份草稿原樣保留在未追蹤的 `.github/workflows/backup-verify.yml`、`tools/backup/`，未提交或啟用，也不包含在本次發布提交。取消前已開始的合成測試在 `RESTORE_NOT_ISOLATED` 檢查失敗（3 項未通過）；已停止修復與進一步備份建設，沒有正式匯出／上傳或備份證據。

本輪只作本地提交；不推送、不 dispatch、不修改遠端 history／權限／Secrets、不部署。現有正式 Token、runner 連線與受保護環境可用性仍不能由離線測試證明。

## 官方依據

- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html)：nullable 無 DEFAULT 欄位及 DDL 鎖。
- [CREATE INDEX](https://www.postgresql.org/docs/17/sql-createindex.html)、[交易](https://www.postgresql.org/docs/17/tutorial-transactions.html)：普通建索引可置於交易內；交易不能撤銷提交後的後續寫入。
- [Supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair)、[釘選 CLI repair 行為](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/commands/migration/repair/SIDE_EFFECTS.md)：ledger 修復與實際執行 migration 的區別。
