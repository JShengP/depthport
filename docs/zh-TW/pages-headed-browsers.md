# 原生有視窗模式 Pages 補驗 — 2026-10-20

[English](../en/pages-headed-browsers.md) · [無頭驗證](pages-standalone-browsers.md) · [原內建瀏覽器驗證](pages-browser-compatibility.md) · [ROADMAP](../../ROADMAP.md#current-pages--目前互動展示) · [PR #28](https://github.com/JShengP/depthport/pull/28)

## 凍結範圍與模式

沿用原 [8 項條件／8 個環境列](../validation/pages-browser-protocol.json)，SHA256 `fd0851f025d7b1e3bf6cced37c8553a074ce29e33db64e06e8eccaf3d316d38d` 不變。[有視窗執行設定](../validation/pages-headed-plan.json)與模式支援先於 **`c5060e4` 公開封存，再開始 Pages UI 實測**，對象為部署 main **`2f77579`**。設定階段只開啟 `about:blank`，不算產品案例通過。

本輪是原生 **Linux X11 有視窗執行**，與前輪無頭模式分開。三套廠商瀏覽器在既有 X.Org 21.1.11 桌面（1920×1080×24）依序使用新建臨時設定檔；不使用 Xvfb、日常瀏覽器資料、私人 Session、備註、憑證或 RTSP。原協議及歷史 JSON 清單均不改寫；不推論、不看 GT、不重跑追蹤、不調參、不改預設或保存資料。

## 環境與可見視窗證據

- **CHROME-D：** Google Chrome **155.0.8059.84**，ChromeDriver **155.0.8059.84**。
- **EDGE-D：** Microsoft Edge **155.0.4283.62**，EdgeDriver **155.0.4283.62**。
- **FIREFOX-D：** Mozilla Firefox **157.0**，GeckoDriver **0.37.1**。

執行檔、官方來源／校驗鏈、Selenium 4.51.0／Pillow 13.0.0 獨立環境及應用依賴，均沿用[前輪設定](../validation/pages-standalone-plan.json)。新增 `--headed` 時不加入無頭參數；預設仍保留無頭模式。實際程序參數確認**沒有 headless 開關**，Firefox 另回報 **`moz:headless=false`**。以廠商提供的程序 ID 核對 PID 屬性，再只讀相符瀏覽器視窗的 `IsViewable` 狀態及尺寸。不讀其他視窗標題、不拍桌面；公開 metadata 不含程序／視窗 ID 或設定檔路徑。

桌面 **1280×900、DPR1** 使用真正的原生網頁區域：清除視窗覆寫，再調整原生視窗至 `innerWidth`／`innerHeight` 相符。各瀏覽器外框尺寸不同；網頁區域相容性不等於視窗管理器面板、整個螢幕配置或 OS 瀏覽器外框驗收。B06 補充的 **390×844** 是可見視窗內的原生 WebDriver BiDi **CSS 視窗覆寫**，外框並非390px；不是原生最小視窗尺寸或手機／觸控／OS 測試。返回桌面時清除覆寫，再恢復原生網頁區域尺寸。

有視窗 Chrome／Edge 回報 `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4090/PCIe/SSE2, OpenGL 4.5.0)`，前輪無頭使用 SwiftShader。這只是觀察到的 renderer，不是 GPU 效能或完整本機應用驗收。Firefox 的 `NVIDIA GeForce GTX 980, or similar` 仍是不能辨認／認證實體硬體的泛用回報；不跨模式比較截圖位元來宣稱數值精度。

## 結果

[彙總清單與原證據雜湊](../validation/pages-headed-acceptance.json)：**21 通過／0 失敗／3 未測**。各有視窗瀏覽器 **B01–B07 通過、B08 未測**；不需產品修復或正式案例重跑。凍結矩陣不重複計數，仍為64格中 **33 通過／0 失敗／31 未測**；原無頭21／3紀錄保持不變，不再加一次。完整矩陣仍未通過。

- **B01：** 首頁／三版可載入，各瀏覽器開始時及整輪結束後的53個公開檔案皆逐位元符合封存 repo；被動 console／JavaScript error 未觀察到頁面錯誤。雜湊核對與 UI 實測分開。
- **B02：** 四模型×v0.1／v0.2×三瀏覽器共24組；原生旋轉、滾輪縮放、Shift 平移、點大小、RGB／深度及重設通過，同一 session 重設後點像素可完全還原。24張初始點雲及代表性操作已目視檢查，不宣稱右鍵／觸控手勢驗收。
- **B03：** 48筆 RGB／深度中央與邊緣取樣，獨立核對原生值／最終 Z／Camera XYZ，切換圖種不改查詢值。最大顯示誤差 **4.8547515e-07**，符合原凍結容差。
- **B04：** 24筆 Segment／Detect 公車檢查，遮罩／ROI 子點雲可見且完整點雲可還原；信心值、有效對齊像素數及 Z 中位數符合獨立 RLE／框 oracle，最大中位數顯示誤差 **4.2369080e-07**。模型預測／ROI 不是真值。
- **B05：** obj-0005 的1／6／7／12／19／20／24格共21筆狀態。來源32／43／55、時間戳及保存統計相符；7–19格維持缺失、Z／XYZ 留白，歷史有真缺口且無該段觀測按鈕。0.5×／1×／2×、播放／暫停、逐格／邊界與終點停止通過，不宣稱計時或身分精度。
- **B06：** 原生1280×900及補充390×844覆寫，共48個英文／繁中路徑版面。版本連結／圖片、實際目的地、所選公車／ID 及缺格狀態正確；控制可達、橫向溢出≤1px。代表性雙語窄版已目視檢查，原生字型／滑桿樣式正常不同。
- **B07：** 版本標題／目的地、舊 RGB 引導完整精度查詢的說明、靜態／來源／條款界線，以及新9／209／152／57與舊7／230／125／105保持分開。
- **B08：** 三套皆自然支援 gzip／WebGL，沒有觸發無 gzip 錯誤或實際 Canvas 備援；兩條路徑均保持未驗證，不模擬、不計通過。

### 保留的設定階段失敗

初次 about:blank 探測可啟動 Chrome／Edge，但從 driver 主執行緒的子程序清單找不到瀏覽器 PID，導致可見視窗／無頭參數證據檢查失敗；兩筆原錯誤均封存。公開凍結前改用廠商 `goog:processID`／`moz:processID` 修正辨認，第二輪確認全部可見視窗，第三輪將桌面尺寸由 BiDi 覆寫細化為原生網頁區域調整。這些設定探測沒有執行或通過任何產品案例。三套正式 Pages 驗證均使用同一封存工具，原結果及來源雜湊分別保留。

## 方法與重現

[選用驗證工具](../../tools/pages_browser_acceptance.py)沿用原生指標／選單／鍵盤／滾輪／Shift 平移、各輪不覆寫的輸出、被動 BiDi console／error、原始視窗 PNG 與獨立標準函式庫 Float32／K／RLE／框 oracle。像素查詢容差維持 `abs(error) <= max(5e-6, abs(expected)*5e-7)`。操作／重設只在同一 session 內比對像素，另需目視檢查；[保存資料來源、新舊追蹤限制](real-ai-pages.md)持續適用。

在獨立環境安裝[選用測試依賴](../../requirements-browser-tests.txt)，指定實際執行檔、可用原生顯示環境及全新的忽略輸出資料夾：

```sh
python tools/pages_browser_acceptance.py --headed --browser chrome \
  --binary /path/to/google-chrome --driver /path/to/chromedriver \
  --output artifacts/headed-study/new-chrome-run
```

Edge／Firefox 依序使用相應參數；不加 `--headed` 仍為無頭模式。輸出拒絕覆寫，`--cases` 可單項重驗，其餘維持 `not_run`。一般應用 CI 不執行這套瀏覽器自動化。憑證驗證／沙箱保持啟用，不改寫缺失 API、CSS、應用狀態、網路回應或 globals 來取得通過。

## 計數與未驗證門檻

有視窗／無頭是**相同三個既有桌面列的兩種執行模式**，不是六個獨立瀏覽器，也不增加凍結64格矩陣。每種模式保留各自24個案例格、版本、對象與來源；共用公車匯出及短片不增加獨立追蹤樣本。

若自然無 gzip／實際瀏覽器 Canvas 備援未觸發，維持 `not_run`。Safari／macOS、實體 Android／iOS、原生觸控及其他 OS／build 組合仍待驗證。保存結果檢查不代表標定距離、身分 GT／IDSW／HOTA、長遮擋／移動相機、RTSP、全新 Windows／完整 Alpha 安裝或長時 GPU／VRAM 驗收。

原 PNG、錯誤、逐次事件、driver log、設定檔、執行檔及診斷路徑留在忽略的本機資料夾；只公開審查後的工具、凍結設定、彙總與雜湊。原失敗／未完成輪次與採用重驗結果分開保留。
