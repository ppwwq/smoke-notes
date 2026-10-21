# GitHub Actions 手動正式發布

本分支只準備流程及離線驗證；**本雲端工作沒有設定 Secrets／權限、建立憑證、合併 main 或執行發布**。2026-10-20 桌面已回報部分設定完成，詳見[獨立復核紀錄](production-release-review-2026-10-20.md)；本環境未獨立核實那些設定。現有應用基線為 `e0b3cb5a19641679a9e2584241ed8d5e9239930f`；倉庫原本沒有 `.github/workflows`。未來由 GitHub 託管 Ubuntu runner 執行，不要求用戶電腦開機。

2026-10-21：已按用戶接受資料損失風險的指示新增明確 `no_backup` 模式。備份是本流程原先的政策，不是 Supabase／GitHub 對每次部署的硬性要求。詳見[無備份發布評估及操作](no-backup-release.md)。

## 流程與真實限制

`.github/workflows/release-production.yml` 只有 `workflow_dispatch`，push／PR 不發布。

新增的 `operation` 預設為 `audit_only`：只做受保護的正式基線唯讀核對，詳見[操作及限制](production-read-only-audit.md)。以下正式發布步驟必須明選 `operation=release`；audit 不會自動轉入發布。

1. 無生產 Secrets 的檢查：拒絕 fork、非 main、非完整 SHA、與當前 main 不同的 SHA 或 workflow SHA；檢查兩個 Environment 的審核／分支規則。執行型別、Lint、應用測試、臨時 PostgreSQL 回歸及 Web build。
2. `production-backend` 獨立審核：預設 `verified_backup` 由審核者核實備份、保留期限及已完成的隔離還原；腳本只驗證聲明。選 `no_backup` 時，必須明確接受資料損失風險，確認字串綁定完整 SHA／目標專案，備份證據 ID 留空；摘要明示沒有備份／還原證據。不偽造聲明，也不略過環境審批。
3. 工具安裝完成後再次檢查 main 與所選發布風險政策，先以唯讀 GET 確認既有 `apply-mutation` 及 Token 讀取權限（不能證明寫入權限），失敗不接觸資料庫。使用既有資料庫連線核對遷移歷史；只容許尚待 `202610200001_todo_planning.sql` 或已全數套用。其他差異立即停止，不自動 repair、補跑未知歷史或 reset。遷移後再次核對完整 history，缺少預期版本即停止，不部署函式。此 SQL 本身有交易；使用 `--skip-vault` 不處理其他 Vault 設定，流程不提供逆向遷移。
4. 比較遷移前後八張應用表的筆數與完整資料雜湊（新增 planning 空值標準化）；差異即停止。這是保留偵測，**不是可還原備份**。建議維護時段暫停寫入；合法的同步寫入也可能導致保守停止，不能因此清空資料或忽略錯誤。
5. 僅部署既有 `apply-mutation`，保留 `supabase/config.toml` 的內部驗證配置，不部署／刪除其他函式。
6. 真實托管 API 探測：建立兩個新的匿名會話和新工作區，先由 A 寫入並讀回真實探測列，再驗證未配對 B 讀不到且寫入回 403、A 原列與版本不變；之後驗證配對、能力回應、A→B／B→A 讀寫、重送冪等、離線舊版本衝突、完成／撤銷／歷史及軟刪除同步。只操作該測試空間；不用 service role。測試帳戶／工作區留存供審核，不做永久清理；失敗可能留下測試記錄，不能盲目重試。此測試**不是** IndexedDB 同步引擎、Realtime 推送、實機手機或 UI 驗收，這些仍需另行驗證。
7. `production-web` 再次獨立審核；重查 main、構建、再次 API 探測。只將 `apps/web/dist` 部署到既有 `smoke-notes-philipwwq`，先核對正式分支為 main。拒絕隱藏檔、來源映射、符號連結、函式及非靜態檔案。要求新正式部署 ID 不同於上傳前 ID，且 environment=production、branch=main、指定 SHA、deploy 階段成功；再核對每個靜態檔的雜湊；摘要回報網址與部署 ID。這不代替實際介面驗收。

全流程使用固定 concurrency group，`cancel-in-progress: false`，避免新任務中斷遷移；不同管理者的外部部署仍需協調。Actions／Node／pnpm／Supabase CLI／Wrangler 固定版本，checkout 不保留 Git 憑證。依賴安裝不接收部署 Secrets，不設定 `set -x`，失敗的服務端回應及 CLI 原始輸出不直接印出。不建立含資料庫、環境檔或會話憑證的公開 Actions artifact。

## 一次性人工設定清單（完成狀態見復核紀錄）

1. 審查本分支完整 diff，特別是 workflow 與 `tools/production/`。獲准後才合併 main；手動工作流程檔須在 default branch 才可正常啟動。保護 main，要求 PR 審核並限制直接寫入；有 main 寫入權的人仍能更改流程，程式內 ref 檢查不能代替倉庫保護。
2. 倉庫 **Settings → Environments** 建立 `production-backend`、`production-web`。兩者均設 **Selected branches and tags → branch: main**，不要新增 tag／萬用字元。設 required reviewer、啟用 Prevent self-review，關閉管理員 bypass。需要另一位可信審核者；目前單人帳戶或套餐不支援時流程會停止，不能刪掉門檻來「先上線」。本次未新增成員或權限。
3. 將下表 Secrets 只放在指定 Environment（Environment secrets → Add secret），**不要放 repository／organization secrets**，不要貼進聊天、issue、dispatch input、程式碼或 `.env`。先確認既有憑證可重用；若須新建 token、增加權限或長期存取，另行取得授權後由用戶在官方頁面建立並手動填入。
4. 填入 Environment variables，確認真實 project ref／帳戶。舊部署文件記載的 Supabase ref 是 `koundrkjeambrcodxkdd`，但不能只憑舊文就當成目前正式目標；須與 Dashboard、正式網站公開配置核對。
5. 審核並對齊既有 Supabase 遷移歷史。歷史文件記載曾在 SQL Editor 手動執行，未必登記 CLI history。先比較實際 schema／函式及各遷移效果，再由授權管理者處理 history；本流程不提供自動 repair。
6. 按所選模式完成真實備份聲明，或明確的無備份風險接受；其他準備就緒後才由擁有人把 `production-backend` 的 `RELEASE_ENABLED` 設為 `true`。

## 實際所需 Secrets

| 名稱                       | Environment                        | 用途／最小可行權限                                                                                                                                                                                                                                                                                                                                                                                                                        | 官方入口                                                                  |
| -------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `SUPABASE_DB_URL`          | production-backend                 | 僅該專案的 PostgreSQL 連線。需讀應用表、讀寫 migration history，及執行已審核 DDL／函式的擁有者權限；一般 read-only 帳號或 publishable key 不足。使用既有 postgres／受審核 migration role；不要自動建立角色或擴權。URL 使用 direct 或 session pooler 5432、資料庫 postgres、`sslmode=require`，密碼須 URL 編碼；不接受 transaction pooler 6543。查詢參數只容許單一 `sslmode=require`，拒絕 host／user 等覆寫；也清除繼承的 libpq PG 參數。 | [Supabase Dashboard](https://supabase.com/dashboard) → 正確專案 → Connect |
| `SUPABASE_ACCESS_TOKEN`    | production-backend                 | 優先 scoped PAT，只選目標專案、**Edge Functions Read/Write**，設短有效期。本流程以 `--project-ref` 及 `--db-url`，不執行 `supabase link`，因此不要求讀 API Key Secrets。CLI 若回報缺權限，先核實具體端點，不盲目改用全權 Legacy token。資料庫 URL 的權限不受 PAT scope 限制。資料庫子程序不繼承 PAT；函式部署子程序不繼承資料庫 URL／密碼或 PG 變數。                                                                                     | [Access Tokens](https://supabase.com/dashboard/account/tokens)            |
| `SUPABASE_PUBLISHABLE_KEY` | 兩個 Environment，各填相同公開 key | 正確專案的 publishable key 或舊 anon JWT；供匿名測試及 Vite 公開瀏覽器配置，最終本來就會在前端可見。**不可填 service_role／secret key**，驗證器拒絕非 anon JWT。                                                                                                                                                                                                                                                                          | Dashboard → 專案 Settings → API Keys                                      |
| `CLOUDFLARE_API_TOKEN`     | production-web                     | Custom token，Account → Cloudflare Pages → Edit；resource 僅既有專案所在帳戶，設有效期。這是帳戶範圍，勿宣稱可以縮到單一 Pages 專案；不需 DNS、Workers、全域 API key 或其他帳戶權限。                                                                                                                                                                                                                                                     | [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)   |

自帶 `GITHUB_TOKEN` 只有 `contents: read`、`actions: read`；用於 checkout、main／環境元資料核對，不需額外 GitHub PAT，也不會合併、推送、改 Secrets 或 GitHub 權限。

Environment variables：

| 名稱                         | 位置               | 值／用途                                            |
| ---------------------------- | ------------------ | --------------------------------------------------- |
| `SUPABASE_PROJECT_REF`       | 兩個 Environment   | 已人工核實、相同的 20 位小寫專案 ref                |
| `CLOUDFLARE_ACCOUNT_ID`      | production-web     | 已核實、32 位十六進位帳戶 ID；不是 token            |
| `RELEASE_ENABLED`            | production-backend | 預設不設；完成設定及授權後才填 `true`               |
| `BACKUP_RESTORE_ATTESTATION` | production-backend | 下述人工證據 JSON；不放私密下載 URL／密碼／用戶資料 |

## verified_backup 模式的備份門檻

此倉庫沒有既有可驗證的遠端備份保留設施。**本流程刻意不自行新建外部儲存、長期 token、GitHub 公開 artifact 備份或付費還原專案**。若現有 Supabase 備份／隔離還原能力不夠，選擇加密儲存、保留政策、費用和必要權限後，須另行授權並實作／驗證，再使用 `verified_backup` 模式發布。用戶明確選擇無備份時走 `no_backup` 模式；不能填假的證據使流程變綠。

由管理者在已授權的雲端環境建立完整可用備份並安全保留，核實 schema、角色／權限、應用資料、身份／關聯及遷移紀錄的還原需求；Supabase Storage 實體檔案不會因一般資料庫備份就自動被備份。將備份還原到**隔離目標**並實際檢查記錄／歷史及權限，絕不覆蓋正式資料庫做演練。審核者應能取回同一備份、核對 SHA-256 及演練報告。只有 `pg_restore --list` 或列出備份名稱並不足以證明還原成功。

證據綁定最終合併後、已審核的 main SHA；備份至演練完成須在 24 小時內，至少繼續保留七天。填入以下結構，全部替換為真實證據；時間需含時區，不要直接複製示例啟用：

```json
{
  "release_sha": "<最終已審核 main 的完整 40 位 SHA>",
  "project_ref": "<已核實專案 ref>",
  "evidence_id": "<8 至 100 位英數字、底線或連字號的內部證據編號>",
  "backup_sha256": "<實際保留備份的 SHA-256>",
  "backup_at": "<含時區的 ISO 時間>",
  "restore_verified_at": "<實際完成隔離還原驗證的 ISO 時間>",
  "retained_until": "<至少七天後的 ISO 時間>",
  "isolated_restore_target": "<隔離目標的內部識別，不是正式庫>",
  "reviewer": "<實際核驗者>",
  "restore_verified": true,
  "retained": true
}
```

`verified_backup` 模式的 Environment reviewer 需親自核實證據；腳本只校驗聲明格式／新鮮度。該模式下備份未做或還原未驗證就停止；`no_backup` 改驗證明確風險接受，其他權限、目標、history 及環境審批仍不可省略。

## 手動執行與失敗處理

準備完成且另行允許執行後：Actions → **Manual production release** → Run workflow；branch 選 **main**，`release_sha` 填當時已審核完整 SHA，`release_mode` 選 `verified_backup` 並填 `backup_evidence_id`，或選 `no_backup`、留空備份證據並按[操作說明](no-backup-release.md)填入精確風險確認字串。審核者先批准 backend，確認 API 測試及保留檢查通過後再批准 web。若等待期間 main 前進，流程停止；重新審核新 SHA 和重新綁定風險確認／備份證據後重新 dispatch，不能套用過期批准。

任何階段失敗立即停止下游；不 `continue-on-error`，不自動重試整次部署。資料庫可能已成功遷移但函式／網頁尚未成功，應先查 Dashboard 的真實狀態與 migration history。資料雜湊不符時先判明是否有合法並行寫入。Cloudflare 上傳超時或版本驗證失敗時先查 deployment ID，不重複盲發。

**永不自動倒退資料庫**。若需要回滾網頁，只回到經審核且相容的前端版本，保留 planning 欄位、唯一索引、歷史及能理解計畫資料的函式；不能回退成會丟棄 planning 的寫入端。從備份恢復正式庫是另一次高影響操作，必須單獨決策，不能作為一般 UI 回滾步驟。

完成後仍須用隔離測試資料做實際網頁／手機 UI、瀏覽器離線佇列、Realtime 及兩客戶端同步引擎驗收，不將腳本 API 測試報成全端驗收。若匿名註冊被 CAPTCHA／速率限制攔下，停止並安排授權測試方案，不能關閉防護或換用 service role 繞過。

## 套餐與費用

官方文件於 2026-10-20 核對：此倉庫目前為 public。標準 GitHub-hosted runner 在 public repo 的 Actions 使用通常免費，但私有庫有分鐘及儲存額度、較大型 runner／額外儲存等可產生費用；不承諾整條流程永久免費。Free／Pro／Team 的 required reviewers 等保護功能限 public repo；私有庫環境與保護能力依方案而異，轉私有前須重查。單人操作還需另一名可信審核者，不在本次自動新增。Supabase 備份、隔離還原目標、儲存、流量及 Cloudflare 用量也須按帳戶方案核對。

## 官方依據

- [Cloudflare Direct Upload CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)：預先構建資產、Pages Edit token。
- [Supabase 環境與遷移](https://supabase.com/docs/guides/deployment/managing-environments)、[CLI](https://supabase.com/docs/reference/cli/supabase-db-push)：history 對齊與 CI 發布。
- [Scoped PAT 權限](https://supabase.com/docs/guides/platform/personal-access-tokens)、[備份限制](https://supabase.com/docs/guides/platform/backups)。
- [手動 workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)、[Environment 保護及方案限制](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)、[Actions 費用](https://docs.github.com/en/billing/concepts/product-billing/github-actions)、[安全使用](https://docs.github.com/en/actions/reference/security/secure-use)。
