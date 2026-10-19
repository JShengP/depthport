# 決策前觀測支援＋更新置換保護的凍結控制 — 2026-10-19

[English](../en/tracking-past-support.md) · [ROADMAP](../../ROADMAP.md) · [前輪跨格診斷](tracking-temporal-support.md) · [Protocol](../validation/v0.3-past-support-protocol.json) · [Input lock](../validation/v0.3-past-support-inputs.json) · [Aggregate](../validation/v0.3-past-support.json) · [Reporting amendment](../validation/v0.3-past-support-report-amendment.json)

後續：[同規則GT-free發現與保留確認](tracking-past-exposure.md)在已見MOT發現組找到三控制實際觸發，但兩段新保留KITTI均零觸發，獨立曝光未驗證。本篇歷史評分、原協定與修補附註保留。

**獨立資料組已跑完，但沒有有效曝光，介入效益仍未驗證。** 四段 KITTI 完整序列都沒有符合原活躍競爭條件的候選，三個新控制均零 veto，預測／官方分數與參考相同。逐場景傷害條件通過、沒有新增漏追或換 ID，但每個控制均未通過凍結的曝光／品質門檻。不放寬資格、不換片、不升預設。

![KITTI 控制次數、資格與分數變化，零值完整保留](../assets/tracking-v03-past-support.png)

## 先凍結與新來源

原協定於 `2026-10-19T14:21:20.822827+00:00` 本機封存，SHA-256：**`ff4a9720a0cf039e39255b49054dd68d5d3e8e092e970f4020fc1b5d6362c395`**，早於首次新偵測／追蹤輸出與解讀 GT 標註；合成與固定套件契約、來源準備先完成。來源意圖另有雜湊：固定訓練序列字典順序前四段 **0000–0003**，不按分數或輸出換片。這是本機事前凍結，不是外部預註冊；先前 MOT 診斷已知。公開驗證紀錄沒有先前 KITTI 追蹤，屬於相對 MOT 歷史的新資料組；共用預訓練偵測器／runtime、四段非隨機選取，不能宣稱獨立場地／人物或統計效力。

保留全部 **978 原格**，不剪片、重採樣或選格。核對 ZIP CRC／逐 PNG 雜湊，FFV1 BGR 回放與每張原圖像素完全一致，**1242×375、10 Hz**，奇數高度也保留。協定鎖定影片／圖片清單雜湊，之後的輸入鎖定綁定每段共用完整偵測快取與未解開標註 ZIP 的雜湊／目錄 CRC／大小；全部追蹤封存後才解開 GT 成員。

固定 YOLO26n 行人0／**Ultralytics8.4.176 CPU**、confidence .10、imgsz640、NMS .70、最多64與相同權重雜湊；沒有影格碰到64上限。ByteTrack 啟用 **.30**／高信心 **.60**／保留 **30格**／確認 **2**／有號差 **.05** 不變。10Hz 的 buffer30 約為 **3秒**，與先前30Hz來源的時間意義不同，不換算調參。研究套件固定 trackers2.6.1／NumPy2.2.6／SciPy 1.18.1／supervision 0.27.0／OpenCV 4.11.0.86。應用／worker／預設未變，弱偵測及活躍軌跡弱延續保留。

## 因果資格、活躍／保留與缺失證據

原弱階段已接受的選中假說須已確認、更新前年齡≥2。同欄競爭者分數須過該階段原門檻，且原選分數−競爭分數≤.05。**活躍**為已確認且更新前年齡1；保留預測與未確認假說分開記錄，不能 veto。

1. **決策前已接受觀測支援：** 兩方在此決策前均有非空的已記錄觀測歷史。沿原選假說最後一次已接受觀測，時間嚴格早於目前格：競爭者當時須在同階段、已確認且活躍，並在同一過去格有自己另一筆真正接受的觀測；對原選觀測的分數須過當時階段原門檻與有號差 .05。核對不可變的「原影格＋完整快取偵測索引」所有權，不靠原生 ID 數字串接，不使用未來 +1…+30 或從前輪擬合 N。
2. **更新置換保護：** 競爭者目前沒有其他已接受的弱更新。假設強制它配到目標欄，再解原始未過濾的一對一剩餘指派，最後才套原門檻；**每一個其他原已接受列／偵測配對都必須保留**，合格更新數不能減少。只保留數目或更新列集合不足以通過。不設機會成本新門檻、不要求最佳值平手，只檢查 solver 回傳的替代。替代不實際安裝。
3. **兩者同時：** 必須由**同一競爭者**符合兩項；任何合格競爭者只移除原選配對，將其列／偵測退回 unmatched，不改配到另一假說。各決定均由未修改的原配對同時判定。原選漏格假說刻意失去的更新不在保護範圍，仍須作為潛在傷害驗收。弱輸入不刪除，被延後偵測仍在上游輸出、ID為−1。

四組為 `activation_control`／`past_support_only`／`update_protection_only`／`past_support_and_protection`。每組分歧後使用自己的只附加歷史，決策後只記真正接受的高／弱邊，保留物件強引用以防所有權重用。無已記錄歷史、缺同階段比較、競爭者沒有接受觀測、保留／未確認、低於門檻及有號差不支援均有不同原因。缺證據是未知，不能當正確／錯誤物理身分；出生索引缺失不虛構補上。

## 事前逐場景傷害標準

每景 **FN／FP／IDSW／Frag 不能增加，IDF1／HOTA 不能下降**，使用確定性精確比較；另要求 **GT×影格配對的新 FN 與新 IDSW 都為零**，不能用其他改善抵銷新增錯誤。也回報 FP 配對但不加「新增FP須零」條件。所有組的官方預處理 GT 順序／框先核對一致，配對數與官方 CLEAR 核對。

有效曝光須有**實際 veto 且有非零可評分行人 GT**；每個有效曝光場景還須至少改善 FN／FP／IDSW／IDF1／HOTA 一項並通過所有傷害條件。整組須四景傷害都過、**至少兩景有效曝光**且各有效景品質都過。零 GT 景仍保留 FP／傷害檢查，不能證明身分效益；沒有曝光的品質為 `null`，不是空集合自動成功，彙總不能蓋過單景傷害。

## 全部獨立來源與結果

下表**四組皆相同**，canonical 預測完全一致；公開 JSON 保留每組完整分數、重複／完整 trace 雜湊、配對錯誤、八個含零風險組與逐景門檻，沒有省略任何組或片段。

| Source | Frames | Cached detections | Evaluated GT | TP | FN | FP | IDSW | Frag | IDF1 | HOTA |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| KITTI-0000 | 154 | 326 | 19 | 5 | 14 | 155 | 0 | 1 | 5.5866% | 8.9587% |
| KITTI-0001 | 447 | 107 | 106 | 25 | 81 | 0 | 0 | 0 | 38.1679% | 18.5598% |
| KITTI-0002 | 233 | 286 | 180 | 101 | 79 | 14 | 0 | 0 | 68.4746% | 43.7264% |
| KITTI-0003 | 144 | 13 | 0 | 0 | 0 | 0 | 0 | 0 | 0.0000% | 0.0000% |

合計 **732筆快取偵測／305筆可評分行人 GT；TP131、FN174、FP169、IDSW0、Frag1**。比率逐景列出，不直接平均。0003 沒有可評分行人 GT，也沒有輸出預測，零身分分數是評分器慣例，不能解讀為完美追蹤；其他三景行人支援有限，參考組換 ID 原本也為零。

| 控制 | 實際 veto | 有效曝光場景 | 新增 FN／IDSW | 四景傷害 | 曝光／品質通過 |
| --- | ---: | ---: | --- | --- | --- |
| 只用過去支援 | 0 | 0 | 0／0 | 通過 | **否** |
| 只用更新保護 | 0 | 0 | 0／0 | 通過 | **否** |
| 同一競爭者同時符合 | 0 | 0 | 0／0 | 通過 | **否** |

四景參考組活躍替代都為零，過去支援／保護／共同資格與八個風險格也全為零。這是適用曝光缺失，**不能說過去資格或保護成功攔下有害競爭，也不能歸因規則太嚴**。缺失證據原因計數同樣為零；該狀態行為由合成契約測過，並非在這批真實合格案例中建立證據。

## 執行、官方評分與報表修補

四組×三次×四段共 **48次完整追蹤**，輪換順序、每次新tracker、OpenCV單執行緒／seed0；各組 canonical 預測與完整 trace 重複雜湊相同。另四次未掛控制的上游輸出與參考相同。**全部來源／組別的預測與三次檢查先一起封存，再解開／解析任何 GT 成員**。官方乾淨 TrackEval `12c8791b303e0a0b50f753af204249e622d0281a`，原生 `Kitti2DBox` 行人前處理及 CLEAR／Identity／HOTA；KITTI 保留零起算 xyxy，不把 GT 臨時轉成 MOT。

官方前處理保留 sitting-person／遮擋／截斷／DontCare 規則，未配對且高度≤25的預測會移除，因此可評分 GT／預測數與原快取不同。來源是10Hz車載拍攝，不主張每格都移動，也沒有完成長遮擋／交會事件端點驗收。TrackEval 匯入時提示無關 BURST 的可選 pycocotools 缺失；KITTI 正常完成，沒有改官方程式，NumPy舊別名只在隔離評分程序補上。

原追蹤、原協定及其控制／測試雜湊保留。首次彙總於空假說影格沒有弱階段時發生 `IndexError`，當時0000參考GT分數已算；報表續跑到0003又發現官方解析器不接受只有換行的空預測檔，當時前三景已評分。兩項修補寫入[報表附註](../validation/v0.3-past-support-report-amendment.json)：沒有audit／veto的空格只計格數、不索引階段；空預測檔改為**零位元組**。新增的 `resume-report` 核對原封存、來源／快取／標註ZIP／預測／trace雜湊與未變控制，完全不呼叫tracker。修報表時 GT 已經看過，不冒稱新的盲測或重凍結。

[可逆修補檔](../validation/v0.3-past-support-report-fix.patch)能還原原封存runner；原雜湊留在協定、修後雜湊留附註。沒有改參數、已接受邊、快取、假說、GT、來源或傷害標準；沒有重跑追蹤。兩次報表續跑由原預測產生逐位元相同的完整彙總。新研究可用修正後 `freeze`／`validate` 另建新協定；不要覆寫此歷史協定，也不要未附報表修補紀錄就把修改後程式當原封存版。

## 決定與下一步

**現行預設與弱偵測延續保留。** 本輪獨立執行完成，但有效曝光與介入效益未驗證；不從陰性擬合時長／margin／啟用／buffer，不把零觸發當安全恢復。

下一步先為**同一凍結規則另訂不看 GT 分數的曝光選取流程**：事前固定完整有序且條款明確的發現清單，以及真正未見的保留確認來源。只看各組自身歷史的實際觸發選取，記錄所有零值／失敗，再對全部預定保留來源套同一逐景傷害標準。這四段 KITTI 現在已見，不能再當新獨立確認。長遮擋／交會端點、原公車HOTA退步、框定位、完整安裝／實機／即時及校準3D精度仍待驗收。

## 條款、重現與公開範圍

[KITTI官方條款](https://www.cvlibs.net/datasets/kitti/)為 CC BY-NC-SA 3.0；[追蹤規格](https://www.cvlibs.net/datasets/kitti/eval_tracking.php)與[10Hz車載配置](https://www.cvlibs.net/datasets/kitti/setup.php)定義本次來源。署名 **Andreas Geiger、Philip Lenz、Raquel Urtasun，Are we ready for Autonomous Driving? The KITTI Vision Benchmark Suite，CVPR 2012**。只作本機非商業研究、不提交leaderboard；原圖／GT／快取／權重／原始預測不重散布，程式AGPL不重新授權資料。條款頁雜湊與官方壓縮檔網址均在協定。

```bash
# Original predictions and traces stay in local ignored artifacts.
# Verify the published protocol plus report-only amendment; this command does not track.
python tools/validate_tracking_past_support.py resume-report \
  --protocol docs/validation/v0.3-past-support-protocol.json \
  --seal artifacts/tracking-past-support/freeze.local.json \
  --manifest artifacts/tracking-past-support/manifest.local.json \
  --input-lock docs/validation/v0.3-past-support-inputs.json \
  --amendment docs/validation/v0.3-past-support-report-amendment.json \
  --trackeval-root artifacts/expanded-tracking-acceptance/TrackEval \
  --work-dir artifacts/tracking-past-support/run \
  --output artifacts/tracking-past-support/reproduced-summary.local.json
python tools/plot_tracking_past_support.py \
  --summary docs/validation/v0.3-past-support.json \
  --output artifacts/tracking-past-support/summary.png
```

應用測試 **401通過／29選配略過**；固定真實套件相關契約 **87通過**，其中新因果控制／報表契約 **33項**，包含真正固定套件的競爭延後、弱延續、過去／保留／缺失證據、同競爭者交集、其他每筆更新保護、hook還原與空影格／空檔回歸。沒有新增UI操作、實體相機或GPU驗收。公開白名單／連結／明顯祕密樣式、來源封裝與純合成網站建置已檢查，統計圖目視確認。公開只含來源雜湊／計數、固定規則、彙總分數／原因與數字圖；原圖、GT、矩陣、ID、歷史、路徑與診斷留在忽略追蹤的本機artifacts。
