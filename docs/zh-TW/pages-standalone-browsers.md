# 獨立無頭瀏覽器 Pages 補驗 — 2026-10-20

[English](../en/pages-standalone-browsers.md) · [原內建瀏覽器驗證](pages-browser-compatibility.md) · [ROADMAP](../../ROADMAP.md#current-pages--目前互動展示) · [PR #27](https://github.com/JShengP/depthport/pull/27)

> 下方維持原無頭驗證範圍；後續[原生有視窗驗證](pages-headed-browsers.md)另記對象、證據與未完成門檻，執行模式不增加瀏覽器列。

## 凍結範圍

沿用原有 [8 項條件／8 個環境列](../validation/pages-browser-protocol.json)，SHA256 為 `fd0851f025d7b1e3bf6cced37c8553a074ce29e33db64e06e8eccaf3d316d38d`。[獨立執行設定](../validation/pages-standalone-plan.json)已在 **`8e94f78` 公開封存後才開始 Pages UI 實測**，對象為部署 **`6498451`**。內建控制介面無法操作獨立瀏覽器後，使用者明確選擇 WebDriver 無頭補驗；原內建瀏覽器清單、更正與失敗不覆寫。

在 Linux x86_64 依序啟動三套真正的廠商瀏覽器，每次使用新建臨時設定檔。不使用日常瀏覽器資料、私人 Session、備註、RTSP 或憑證；不推論、不重跑追蹤、不看 GT、不調參、不改保存資料。

## 環境與限制

- **CHROME-D：** Google Chrome **155.0.8059.84**，ChromeDriver **155.0.8059.84**。
- **EDGE-D：** Microsoft Edge **155.0.4283.62**，EdgeDriver **155.0.4283.62**。
- **FIREFOX-D：** Mozilla Firefox **157.0**，GeckoDriver **0.37.1**。

Selenium **4.51.0** 與 Pillow **13.0.0** 安裝在獨立環境，應用依賴不變。桌面 **1280×900、DPR1**；B06 另補 **390×844** 排版，不新增矩陣列，也不當作手機 OS／實體觸控。Chrome／Edge 回報 **ANGLE／Vulkan SwiftShader 軟體渲染**；Firefox 回報 `NVIDIA GeForce GTX 980, or similar`，這種泛用字串不能辨認或認證實體顯示卡。無頭結果不代表有視窗模式、GPU 效能或完整本機應用的繪圖／安裝驗收。

廠商來源與校驗值保留在凍結設定。Edge 取自 [Microsoft 官方套件索引](https://packages.microsoft.com/repos/edge/dists/stable/main/binary-amd64/Packages.gz)，核對其 SHA256；Firefox 取自 [Mozilla 封存](https://archive.mozilla.org/pub/firefox/releases/157.0/)，核對官方 SHA512SUMS。驅動來源為 [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/155.0.8059.84.json)、[Microsoft Edge WebDriver](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/) 與 [Mozilla GeckoDriver](https://github.com/mozilla/geckodriver/releases/tag/v0.37.1)。只在本機解壓，不取代系統瀏覽器。

## 結果與逐項來源

[彙總清單、逐項來源、所有輪次與雜湊](../validation/pages-standalone-acceptance.json)記錄三列共 **21 通過／0 失敗／3 未測**：各瀏覽器 **B01–B07 通過、B08 未測**。合併原內建瀏覽器的限定證據後，64 格共 **33 通過／0 失敗／31 未測**，**完整矩陣仍未通過**。這是不同日期範圍的證據彙總，不是假設所有環境曾在同一輪執行。Chrome／Edge 共用 Chromium，Firefox 為 Gecko；本輪不需修復產品功能。

- **B01：** 首頁／三版可載入，53 個公開檔案另以逐位元核對封存 repo；此證據與 UI 操作分開。採用輪次的被動 console／JavaScript error 監聽未觀察到頁面錯誤。
- **B02：** **24 組模型／版面**，四模型×v0.1／v0.2×三瀏覽器。真點雲皆可見，原生旋轉、滾輪縮放、**Shift 平移**、大小、RGB／深度與重設實際改變／還原點像素。24 張初始點雲截圖及代表性操作均目視檢查；不宣稱原生右鍵／觸控手勢驗收。
- **B03：** **48 筆 RGB／深度中央與邊緣取樣**，每筆核對原生值／最終 Z／Camera XYZ，切換圖種不改查詢值。最大顯示誤差 **4.8547515e-7**，符合原容差。
- **B04：** **24 筆 Segment／Detect 公車檢查**，遮罩／ROI 子點雲可見，完整點雲可還原，信心值、有效對齊像素數與 Z 中位數符合獨立計算；最大中位數顯示誤差 **4.2369080e-7**。模型預測／ROI 不是真值。
- **B05：** **21 筆回放狀態**，obj-0005 的1／6／7／12／19／20／24格，來源格、時間戳及保存統計相符。7–19格維持未觀測、Z／XYZ 留白、歷史有真缺口，沒有該區間觀測按鈕。三種速度、播放／暫停、逐格／邊界與終點停止通過，不宣稱計時或身分精度。
- **B06：** **48 個雙語路徑版面**，1280×900及補充390×844。版本連結／圖片隨語言切換，原生點擊到達目的地，所選公車／ID 與缺格狀態保留，控制可達且橫向溢出≤1px。已目視代表性英文／繁中窄版；字型／滑桿原生樣式差異正常。
- **B07：** 版本標題／目的地正確，新 **9／209／152／57** 與舊 **7／230／125／105** 保持分開，來源／條款及深度／靜態資料界線保留；舊 RGB 說明引導完整精度查詢。
- **B08：** 三套皆原生支援 gzip／WebGL，**無 gzip 錯誤與實際 Canvas 備援兩條路徑仍未觸發**，不計通過。

Chrome 採 **chrome-03** 的 B01–B05／B07，加 **chrome-04** 的 B06；Edge 採 **edge-01** 加 **edge-02** 的 B03；Firefox 採 **firefox-01**。單項重驗輪次中的其他案例維持未測；逐項明列來源，不捏造一輪全數通過。

### 保留的測試工具失敗

1. **chrome-01：** WebGL 的原生元素截圖逾時，下一模型擷取中止；完整性子項完成，但未到最終彙總。原始輸出不改，待執行項另記未完成；改用原生視窗 PNG 擷取。
2. **chrome-02：** CSS 平滑捲動未結束就取樣，導致重設／子點雲比對失敗；B06 誤選卡片 article 而非連結，並誤要求首頁連結帶語言參數。保留工具斷言／選取錯誤。
3. **chrome-03：** 擷取定位修正後 B02／B04 通過，但畫面外語言按鈕仍倚賴 driver 自動捲動而被攔截。**chrome-04** 在原生點擊前明確定位控制，B06 通過。
4. **edge-01：** 切換深度圖選單後，B03 指標目標超出視窗；**edge-02** 在每次原生點擊前定位畫布，B03 通過。

沒有改寫 globals、CSS、產品行為、資料或通過容差來取得通過；明確指定即時 UI 捲動只修正測試座標，網站平滑捲動樣式不變。設定階段的路徑探測失敗也保留。原堆疊／失敗斷言留本機，以雜湊封存，不改判原輪通過。本機 Pages 回歸測試 **13 通過**，最終 PR／main CI 與部署確認另記 PR #27。

## 方法與重現

選用的[驗證工具](../../tools/pages_browser_acceptance.py)明列 browser／driver 路徑，使用原生 WebDriver 點擊、滾輪、Shift 拖曳、鍵盤與選單。導覽前先訂閱 BiDi console／JavaScript error；DOM／canvas 僅讀取，不改寫 globals、缺失 API、應用狀態、路由或網路回應。保留憑證驗證與瀏覽器沙箱。視窗 PNG 原樣保存，記憶體區域像素比對後另做目視檢查。

將[選用依賴](../../requirements-browser-tests.txt)裝進獨立環境，指定實際執行檔及**全新的、忽略的本機**輸出資料夾：

```sh
python tools/pages_browser_acceptance.py --browser chrome \
  --binary /path/to/google-chrome --driver /path/to/chromedriver \
  --output artifacts/browser-study/new-chrome-run
```

Edge／Firefox 改用 `--browser edge`／`firefox` 與相符執行檔。已有輸出資料夾會拒絕覆寫。預設檢查公開保存資料 Pages，不安裝瀏覽器、不修改應用環境；一般應用 CI 不代表執行過這套瀏覽器測試。

獨立標準函式庫 oracle 解碼原 little-endian Float32、核對雜湊，以保存 K／來源像素映射計算；Segment RLE／Detect 框另外映射至各深度網格。原容差維持 `abs(error) <= max(5e-6, abs(expected)*5e-7)`。同一公車匯出及短片的重用只增加相容性證據，不增加獨立追蹤／精度樣本。

## 保留的嘗試與下一步

補驗紀錄保留每輪嘗試、工具更正及最終逐項結果。原始點擊紀錄、堆疊、driver log、截圖、設定檔與下載執行檔留本機，只公開審查後的彙總及雜湊；先前內建瀏覽器失敗不改寫。

Safari／macOS、實體 Android／iOS、原生觸控、有視窗模式／其他 OS，以及自然不支援 gzip／WebGL 的路徑仍待驗證。三套瀏覽器都有原生 gzip／WebGL，不能因此通過 B08，也不注入缺失 API 假造覆蓋。完整矩陣、標定精度、身分 GT／IDSW／HOTA、長遮擋／移動相機、RTSP、全新 Windows／Alpha 安裝與長時 GPU／VRAM 門檻仍開放。[來源及新舊追蹤限制](real-ai-pages.md)持續適用。
