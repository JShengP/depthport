# Results Index 與載入恢復 — 2026-10-20

[Results Index](https://jshengp.github.io/depthport/results/?lang=zh-TW) · [展示首頁](https://jshengp.github.io/depthport/?lang=zh-TW) · [ROADMAP](../../ROADMAP.md#current-pages--目前互動展示)

## 統一結果入口

新增 26 筆有日期的結果條目，涵蓋四深度模型、YOLO 偵測／分割、Baseline／ByteTrack／BoT-SORT、控制實驗與只讀診斷、瀏覽器、安裝與未驗證實機項目。可依分類、模型、追蹤器、平台、結果狀態及關鍵字交集篩選；中英切換保留篩選與搜尋，完整報告連結跟隨語言。下方另列全部公開追蹤研究／診斷報告，保留未通過、零曝光與原始限制。

- `website/results-index.json` 只維護來源路徑、JSON pointer、日期、分組與雙語摘要。建置時從明列於 `PUBLIC_FILES.txt` 的公開檔案讀取指標，產生 HTML；不是重新推論、追蹤或讀取原始診斷。
- 指標不手抄進前端；HOTA／IDF1 由來源 0–1 比例轉為百分比，FN／FP／IDSW 保留原計數，並附來源檔 SHA-256 短識別及完整證據連結。
- MOT17 擴大組的三個追蹤器共用輸入；後續參數組、MOT15 worker 整合與 GT-free 控制另外分組。條目數不等於獨立樣本數，未量測不當成零，不做跨資料組排行榜。
- CUDA 模型實際執行、無權重 CI、保存結果網站相容性、未驗收實機分開標示。歷史紀錄不是即時 CI 狀態；瀏覽器模式不重複累加，原凍結矩陣仍為 33 通過／31 未測。
- 所有條目由建置產生，第一次開頁不需等待結果 API 或大型資料包；停用 JavaScript 仍可閱讀全部結果，只有篩選需要 JavaScript。

主 README、各版 README、首頁與三版展示頁都有入口。未改寫既有驗證 JSON、原始資料、歷史 Tag、預設追蹤器或研究門檻。

## 首頁與載入

首頁僅保留易讀的追蹤摘要；完整套件版本、兩次執行數量、原 Session 未找回與來源／限制移入預設收合的「資料來源與驗證限制」。原結果與差異沒有刪除。

v0.1／v0.2 原本需下載完整 Float32 JSON 才顯示點雲。預設 V2 JSON 是 5,824,697 bytes（公開伺服器也提供 gzip；此處是未傳輸壓縮的檔案大小），沒有逾時或重試。這能解釋慢連線上的等待，但沒有重現使用者所見長時間停滯的確切連線原因。

目前改為先讀取小型點雲包，再接著載入完整數值。小型包由已審查原檔在建置時衍生，保留原 `cloud.packed`、點數、顏色範圍與 RGB 路徑，**不減少原點數、不降低 Float32 精度**。V2 小型 JSON 為 147,793 bytes（gzip 約 102,885 bytes），四模型小型包均低於各原 JSON 的 17%。這減少先看到點雲所需的資料量，不宣稱完整深度下載也縮短相同比例。

載入提示改為「正在載入深度與點雲資料…」，顯示目前階段與已讀取 MB。完整數值未就緒時，查詢保持空白、相關控制停用；點雲可先旋轉／縮放。整次載入 45 秒逾時會中止並顯示重試；小型包無法讀取時可回到原完整包。已載入的模型留在當頁記憶體，切回不重下載；更新載入器的 URL 帶版本識別，避免沿用舊 JavaScript 快取。

## 軟體驗證與限制

- 聚焦離線測試：15 通過。包含衍生點雲與原資料完全一致、結果來源指標、Unicode／條件交集篩選，以及真本機 HTTP 的回應標頭／本文停滯、HTTP／JSON 失敗、逾時與重試。
- Linux 無頭 Chrome 155.0.8059.84／Edge 155.0.4283.62／Firefox 157.0：四模型中心 Float32 查詢與物件遮罩、v0.1／v0.2 載入、當頁模型快取、v0.3 觀測缺口／回放速度回歸通過，各正常執行無頁面 JavaScript 錯誤。
- Chrome 人為故障測試：503 後重試、回應本文停滯 45 秒後重試、小型包 404 回退均通過。停滯時約 0.67 秒先顯示點雲，約 45.48 秒顯示逾時；這只是本機受控故障案例，**不是網際網路速度承諾**。第一輪故障測試未隔離快取，完整數值提前就緒，故不作停滯證據；原失敗保留本機。第二輪以 no-store 測試伺服器隔離後完成。
- Results Index 另檢查三套瀏覽器的中英桌面／390px CSS 窄版、篩選交集、無結果／重設、未通過／未驗證可見性、語言保留與來源指標。初輪 Chrome／Edge 發現原生表單 reset 與 microtask 執行順序造成清除後未重畫，Firefox 沒有該現象；已改為明確重設條件後同步更新，再重驗三套，原失敗留本機。這是本次軟體回歸，沒有擴充或改判歷史凍結驗收矩陣。
- 公開清單、文件連結、靜態建置與差異檢查通過。原始瀏覽器診斷、故障伺服器、截圖與環境都只留本機；公開只有程式、索引與彙總。

Safari、實體手機／原生觸控、其他 OS／build、完整新版全新安裝、實體 RTSP、長時資源與校正測距仍未驗證。未執行模型／追蹤器新效能或品質測試；弱偵測延續、參數與研究接受條件保持原樣。

## 同場景組追蹤比較圖 — 2026-10-20

[直接查看三追蹤器比較](https://jshengp.github.io/depthport/results/?lang=zh-TW#comparison-mot17-expanded)。新增兩組獨立圖：

- **MOT17-04／11／13：** Baseline IoU、Roboflow ByteTrack、BoT-SORT（無 ReID），共用原偵測快取與評估器，2,700 格。
- **MOT17-09／10：** ByteTrack／BoT-SORT 的預設對照，1,179 格。啟用門檻 0.7、高偵測門檻 0.6、buffer 參數 30；其他配置仍在各自完整報告，不混入本圖。MOT15 worker 整合不加入這兩組比較。

每組各四個長條面板：HOTA（0–100%，越高越好）、IDSW、FN、FP（計數，越低越好）。所有軸從零起算，長條旁保留完整數字；計數比例尺由該完整場景組決定，篩選只隱藏不符合的追蹤器，不改比例尺、不重算指標、不按成績重排。沒有符合條目時隱藏該圖，不冒充零值。點選長條可跳到同一筆完整結果卡片。

建置從既有兩份彙總 JSON 的相同 `combined/all_sequences` 分支讀取數值，另核對組別、來源與配置路徑；缺值、跨組／跨來源、配置不符、非有限數值或不合法計數會中止建置，不補 0。圖上直接列出序列、影格數、日期、偵測器版本、CPU、輸入尺寸、信心／NMS 門檻、偵測上限、類別與追蹤套件版本，並保留完整條件連結及驗證限制。

這是既有研究結果的視覺呈現，**沒有重新推論、評分、調參或新增獨立證據**。兩組不互排排名，不把較少換 ID 當成長遮擋／泛化追蹤已驗收。模型、追蹤器、原研究輸出、弱偵測延續與預設不變。

驗證：聚焦離線測試 18 通過，涵蓋來源／長條數值與順序、比例尺、禁止混組／混配置、真零值及缺值拒絕。另以 Linux 無頭 Chrome／Edge／Firefox 檢查 20 根長條的數字與實際顯示寬度、兩組圖在中英桌面／390px CSS 窄版的 8 種布局、篩選後比例尺不變、無結果／worker／未驗證條件隱藏圖、語言切換與卡片跳轉。這是軟體回歸，原瀏覽器矩陣與未測項目不改判；原始截圖及診斷只留本機。

## 逐序列切換 — 2026-10-21

兩組比較圖各提供獨立的「全組序列（原彙總）」與逐序列選單：MOT17-04／11／13 三段，以及預設對照組的 MOT17-09／10 兩段。切換一次會同步更新 HOTA、IDSW、FN、FP；當前序列顯示原紀錄日期、影格數、FPS、解析度及固定／移動相機條件。共同的偵測器、追蹤器配置、來源報告及驗證限制繼續可見。

- 共 7 個視圖、28 個指標面板、72 根長條，全部在建置時從原公開 JSON 讀取。逐序列只讀取該組原 `sequences/.../methods/<arm>/metrics`；全組沿用原 `combined/all_sequences`，不從四捨五入後的逐序列值重算，也不改寫歷史證據。
- 全組與逐序列共用本場景組的固定比例尺，切換與篩選均不縮放、不按成績重排，不跨組排名。缺值、錯誤配置或不合法數值會使建置失敗，不補零、不回退為全組分數。
- 兩個選單互不影響；切換語言、追蹤器等篩選、暫時隱藏比較圖與清除篩選，都保留已選序列。清除篩選只清除條件與搜尋，不重設序列。點選長條仍前往明確標示的追蹤器**全組結果卡片**，逐序列分數以當前比較圖及完整報告為準。
- 沒有額外下載大型資料包、讀取原始診斷、重新推論／評分或調參；弱偵測延續與研究控制不變。停用 JavaScript 時保留全組圖與全部結果卡片，逐序列選單停用並附說明。

軟體驗證：聚焦離線測試 **20 通過**，涵蓋全部視圖的來源值／順序／比例尺、真零值、缺值拒絕及逐序列配置一致性。Linux 無頭 Chrome 155.0.8059.84／Edge 155.0.4283.62／Firefox 157.0 均核對 7 視圖的 72 根長條數字與實際寬度、獨立選擇與篩選／語言保留、全組卡片跳轉，以及中英桌面／390px CSS 窄版共 **28 種布局／每瀏覽器**；未發現頁面 JavaScript 錯誤或水平溢出。

以上只驗證網站軟體呈現，不新增追蹤品質或實體手機證據，不改判原瀏覽器凍結矩陣（33 通過／31 未測）。Safari、原生手機／觸控、其他 OS，以及長遮擋恢復與泛化 ID 穩定性仍保留原未驗證／未驗收狀態。原始瀏覽器檢查、截圖與環境紀錄只留本機。

## 逐序列網址還原 — 2026-10-21

兩個場景組的序列選擇現在會各自寫入網址，可重新整理、複製分享，並使用瀏覽器上一頁／下一頁還原。範例：[MOT17-11 與預設對照 MOT17-10](https://jshengp.github.io/depthport/results/?lang=zh-TW&seq-mot17-expanded=MOT17-11-DPM&seq-mot17-parameters-default=MOT17-10-DPM#comparison-mot17-expanded)。兩組仍是獨立條件，不做跨組比較或排名。

- `seq-mot17-expanded` 只接受該組 MOT17-04／11／13；`seq-mot17-parameters-default` 只接受該組 MOT17-09／10。省略參數代表「全組序列（原彙總）」，切回全組會移除對應參數，另一組保持原選擇。
- 每次實際變更選擇會新增瀏覽歷史；讀取連結、重新整理、歷史返回及清理無效值只更新目前紀錄，不新增歷史。網址優先於瀏覽器可能恢復的舊表單值。
- 未知、空白、重複或屬於另一場景組的序列值均回到該組全組，並移除該參數；另一組的有效值保留。只使用原選單白名單，不把網址值插入 HTML，也不更動來源指標、順序或比例尺。
- 保留原網址路徑、其他查詢參數的值及錨點。搜尋、篩選、備註或本機資料不由這個功能寫入網址；篩選重設與語言切換不清除已選序列。分享只還原序列，其他結果篩選仍由訪客自行選擇。

網站持續顯示原序列影格數、FPS、解析度、相機條件、來源日期、配置與驗證限制；全組仍讀原彙總，不重算、不調參、不新增追蹤品質證據。原資料 JSON、弱偵測延續與研究門檻保持原樣。

驗證：20 項聚焦離線測試通過，其中 URL 輔助檢查涵蓋兩組全部 12 種組合、預設省略、編碼、未知／跨組／重複值與查詢／錨點保留。Linux 無頭 Chrome 155.0.8059.84／Edge 155.0.4283.62／Firefox 157.0 另實際檢查直接連結、重新整理、分享至新分頁、上一頁／下一頁、切回全組、無效值清理、篩選／搜尋不寫入網址；並重驗原 7 視圖／72 根長條、每瀏覽器 28 種中英桌面／390px CSS 布局，均通過。Firefox 首輪在換頁時遇到自動化元素失效（StaleElementReference）；將就緒條件改為在單次瀏覽器讀取中檢查新頁面完成與選單可用後重驗通過，網站程式未因此變更，原失敗保留本機。

這仍是網站軟體回歸，原瀏覽器矩陣（33 通過／31 未測）、Safari／原生手機與觸控／其他 OS，以及追蹤品質與實機未驗收項目不改判；原始環境、截圖及瀏覽器紀錄不公開。

## 複製比較連結 — 2026-10-21

每組比較圖的序列選單旁新增「複製比較連結」。按鈕會複製**兩個場景組目前的序列選擇**、目前畫面語言，以及所按比較圖的位置。複製版連結只保留 `lang` 與兩組序列參數；不帶搜尋、篩選、快取識別或其他任意查詢資料，網址列本身仍沿用前節的還原規則。選全組時仍省略該組參數。

- 原生 Clipboard API 成功完成後，才顯示「已複製比較連結」；複製期間停用該按鈕，避免重複操作。提示提供雙語與輔助技術的即時狀態通知。
- 權限拒絕或 Clipboard API 不可用時，顯示明確失敗提示與已選取的唯讀連結，可手動複製或再次嘗試；不把失敗當成功。鍵盤也可操作按鈕。
- 變更任一組序列、重新整理或瀏覽歷史還原時，清除舊複製提示；若較早的非同步複製此時才完成，不顯示過期成功訊息。切換語言時提示跟隨翻譯。

保留所有來源、測試條件與驗證限制，組內比例尺與原指標不變，不跨組排名。未重新推論、評分或調參，弱偵測延續與研究／實機接受條件均未更改。

驗證：20 項聚焦離線測試通過，其中複製連結檢查涵蓋 12 種兩組選擇 × 2 語言 × 2 目標圖（48 組）。Linux 無頭 Chrome 155.0.8059.84／Edge 155.0.4283.62／Firefox 157.0 均完成原生剪貼簿寫入；Chrome／Edge 另在隔離測試瀏覽器授予剪貼簿讀取權限後讀回，確認完整連結。**Firefox 未讀回原生剪貼簿**，不繞過其讀取提示，寫入成功只依原生呼叫完成與畫面提示記錄。

三套另以受控回應檢查成功、權限拒絕、API 缺失、等待期間停用、重試、鍵盤、雙語提示、手動連結選取、分享後新分頁還原與過期提示抑制；重驗 7 視圖／72 根長條、每套 28 種中英桌面／390px CSS 布局，無頁面錯誤或水平溢出。Firefox 首輪的舊網址回歸案例在換頁時遇到自動化「Document was unloaded」；等待 `performance.timeOrigin` 改變且新文件／選單就緒後重驗通過，網站程式未因此更改，原失敗留本機。

以上是網站軟體回歸，不改判凍結矩陣（33 通過／31 未測）、Safari、實體手機／觸控、其他 OS 或追蹤品質／實機限制。原始紀錄、環境與截圖僅留本機。

## English summary

The bilingual Results Index renders 26 dated, source-linked records at build time. Numeric metrics come from allowlisted evidence through JSON pointers; no browser API, raw diagnostic data or inference is used. Cohorts, failed gates, CI without weights and unverified platforms stay separate. This is an evidence index, not a global leaderboard or live CI status.

Homepage tracking details now sit in a closed disclosure. v0.1/v0.2 show the unchanged saved point cloud through a small derived pack before loading exact Float32 queries. Loads show progress, have a 45-second deadline and retry, and cache completed models for the current page. Local three-browser regression and controlled Chrome network-failure tests are scoped software evidence, not new hardware, accuracy or full frozen-matrix acceptance. Raw captures and diagnostics remain local.

Within-cohort charts now show HOTA, IDSW, FN and FP separately for the MOT17-04/11/13 comparison and MOT17-09/10 default controls. Values are read from their original source branches; scales start at zero and stay fixed under filtering. Missing values and mismatched cohorts/profiles fail the build instead of becoming zero. No scores are rerun or ranked across cohorts.

Each cohort also has an independent combined/individual-sequence selector. All four metrics and recorded sequence conditions change together; filtering, resets and language changes preserve the selection. Combined scores remain the original aggregates, bar links are explicitly labelled as combined-cohort cards, and axes stay fixed within each cohort. Twenty focused offline tests and three Linux headless browsers cover all seven views, 72 bar values/widths and 28 bilingual desktop/narrow layouts per browser. This remains scoped software regression, not new accuracy, hardware or full frozen-matrix acceptance.

Sequence choices also round-trip through cohort-specific URL parameters for refresh, sharing and browser Back/Forward. Only an exact choice from the matching cohort is accepted; missing, invalid, duplicate or foreign values use the original combined view. Default values are omitted, unrelated query values and anchors remain intact, and filters/search are not added to the URL. Conditions, source scores, fixed within-cohort scales and validation limits are unchanged.

URL restoration was checked in all three Linux headless browsers, including a new-tab shared link and navigation history. The first Firefox automation attempt hit a stale element during navigation; an atomic document/control readiness wait passed on retry, with the original failure retained locally. This does not change the frozen compatibility matrix or acceptance limits.

Each comparison also has a copy-link button containing both current cohort choices, the current UI language and the clicked comparison anchor. Only shareable query fields are copied. Success is announced only after the native write resolves; rejected/unavailable clipboard access shows a selected read-only URL for manual copy. Changes to sequence/history clear stale feedback. Three Linux headless browsers completed native writes; Chrome/Edge also verified native readback with test-profile permissions, while Firefox readback remains untested. Controlled success/failure/pending/API-unavailable and bilingual keyboard/narrow-layout cases passed. A first Firefox navigation automation failure is retained locally; a new-document identity wait passed on retry. Accuracy, hardware and frozen-matrix acceptance remain unchanged.
