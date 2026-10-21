# 正式基線唯讀核對（audit_only）

本地準備功能；未連正式庫、未執行 workflow。此模式不是備份、發布、history 修復或修復授權。正式資料與 Secret 不會送入開發工作區。

## 執行路徑

合併此變更後，在 `Manual production release` 選 `main`、當前完整 `release_sha`、`operation=audit_only`（預設）。保留其餘備份／風險欄位預設且不填證據，audit 不使用這些欄位，也不要求 `RELEASE_ENABLED=true`。既有 main／workflow SHA 核對及兩個 Environment 保護核對仍執行；`production-backend` 指定的獨立 reviewer 批准後才啟動 audit job。沒有繞過防自審、管理員限制或分支規則。

audit job 先在不接收正式憑證的步驟，以釘選 digest 的 PostgreSQL 17 容器建立前七份 migration 的合成結構參考。容器 `--network none`，沒有對外 port；結束後移除容器及匿名 volume。參考檔只含倉庫 SQL 生成的合成 metadata，不是正式庫匯出。現有 validate 階段也只跑隔離／mock 測試，不拿正式 Secret。

接著重新核對 main，僅將既有 `production-backend.SUPABASE_DB_URL` 注入唯讀步驟。不注入 Supabase PAT、publishable key 或 Cloudflare token。沿用目標專案、direct／session pooler 5432、`sslmode=require` 限制，拒絕額外 URL 連線覆寫；清除繼承的 PG 參數及其他憑證。`psql -X` 不載入 psqlrc，密碼不進命令列。會話預設 `default_transaction_read_only=on`，查詢另使用 `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` 與固定 `search_path`、超時，並核實唯讀狀態及本連線 TLS。SSL require 與既有發布相同，沒有新增 CA／憑證操作。

只讀系統目錄及 migration ledger 的版本欄，不讀應用列、Auth 使用者、Storage 物件、函式回傳值；不呼叫應用 RPC。正式 metadata 僅在 runner 記憶體比較，不寫檔、不上傳 artifact。標準輸出及 job summary 只含固定 category 與狀態，錯誤抑制原始伺服器／子程序輸出。

`backend`、`web` job 均明確要求 `operation=release`，audit 結束不會接續發布；沒有 DDL、repair、Edge 部署、hosted 寫入探測或 Pages 上傳。將來正式發布須重新手動 dispatch `operation=release`，繼續使用原本的 no-backup 精確確認及 backend／web 兩次環境審批。

## 比對及結果

比對八張應用表的欄位／default、約束、索引有效性、RLS、policy、grants、額外 trigger，以及六個既有應用函式的完整定義／權限、Realtime publication、pgcrypto／plpgsql 版本；檢查 anon／authenticated 的角色屬性及繼承關係。planning 欄位及兩個新增 planning 函式也在檢查範圍。只支援與合成參考一致的 PostgreSQL 17 major；不同 major 直接停止，不能假設不同版本的目錄輸出可互換。

函式 body、ACL 順序、owner、平台預設 grants 等差異一律 `REVIEW_REQUIRED`，不以刪除空白或正則改寫 SQL 來猜語義等價。這可能對合法的 Supabase 平台差異保守停止；需另行審核精確差異，不能為求通過放寬 RLS 或授權。

History 分為 `MISSING_REVIEW_REQUIRED`、`EMPTY_REVIEW_REQUIRED`、`EXACT_PRIOR_SEVEN`、`DIVERGENT_REVIEW_REQUIRED`。前七份版本固定為 `202608280001`、`202608280002`、`202608290001`、`202609050001`、`202609050002`、`202610150001`、`202610150002`；包含尚待執行的 `202610200001` 也不會被當作本次舊基線通過。任何結構差異、planning 已存在或 history 不精確均以 exit 2 停止供審查；連線／解析／版本／TLS 錯誤以 exit 1 停止。只有所有比較相符且 history 精確才 exit 0，仍不代表發布或 history 修改獲准。

本核對無法證明舊 `rich_notes` migration 的逐列回填在過去確實執行，也不測正式 hosted RLS 行為或 Auth／Storage 完整性。三個函式已被其他環境稱為「僅格式差異」不是本模式的通過證據。合成參考不是完整 Supabase 平台副本。全部輸出明示這些限制，不產生 backup attestation 或自動修復證明。

## 下一步

首次 audit 只取得觀察；缺失／部分 history 或任何結構差異都需人工核對。只有前七份的實際效果具備充分證據後，才另行批准針對具體版本的 metadata 補登；不能預標新 migration、repair-all、重放全部舊 SQL 或清空資料。此提交沒有實作任何 history 寫入模式。

## 離線驗證

`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tools/production -p 'test_*.py' -v` 包含發布既有測試及新增 audit 測試。新增案例使用 `--network none` 的合成 PostgreSQL，驗證缺失／空／精確／額外 history、RLS／權限／約束／函式／planning／policy／索引／publication／角色 drift，以及正式查詢所用 READ ONLY 交易對 DDL、INSERT、DELETE、ledger 建立回 SQLSTATE `25006`。單元案例驗證憑證隔離、錯誤遮蔽、固定摘要、TLS／目標拒絕與 workflow 路由。未執行正式資料庫測試。
