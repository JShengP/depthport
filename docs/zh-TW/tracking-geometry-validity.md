# 預測幾何有效性保護控制 — 2026-10-20

[English](../en/tracking-geometry-validity.md) · [ROADMAP](../../ROADMAP.md) · [前輪數值／指派診斷](tracking-estimator-shadow.md) · [凍結定義](../validation/v0.3-geometry-validity-protocol.json) · [原生參考封存](../validation/v0.3-geometry-validity-references.json) · [完整結果](../validation/v0.3-geometry-validity.json)

**新來源組未通過凍結的重現門檻：**0006觸發一次，消除9列非正預測；0007沒有觸發。各場景可觀測傷害檢查都通過，仍不代表追蹤品質或身分驗收。

本輪獨立控制ByteTrack預測幾何，保留原參數、輸入、高／弱階段關聯、接受量測更新與生命週期。**不接入應用程式／worker或更改預設。** 不讀GT或精度分數，可觀測傷害檢查與追蹤品質驗收分開。

## 凍結與來源分離

定義雜湊為 **`733053db5e0a009ae3cdf9841b672dfaf54ff63cc3b28425b7e4f63c7b3b68fe`**。凍結前24項新合成／原生契約及20項既有數值／指派契約通過；只先讀新來源官方影像目錄metadata，尚未讀新PNG、推論輸出或控制結果。先前四個數值異常、五個指派案例皆揭露為已知證據。[方法凍結提交](https://github.com/JShengP/depthport/commit/b61baf8bba7193aab341776019026449635bbfea)在任何控制執行前已公開，當時影像準備已開始；更早的本機凍結不變，非外部預註冊。

固定完整清單為已見KITTI0004／0005（314／297格）做機制核對，未使用的KITTI0006／0007（270／800格）做來源保留控制驗證。新組依已使用0000–0005之後的編號順序選取，不看GT或偵測／追蹤結果；不截片、不換來源、不提早停止、不挑有利結果、不調參，零值與失敗皆保留。同資料集的新序列不代表獨立場域、參與者、模型訓練資料或統計能力。

官方原始PNG只從影像封存讀取，核對不可變ETag／range、完整目錄／CRC及影像雜湊。原生10Hz的FFV1 bgr0影片必須逐格解碼並與PNG像素完全相同。固定YOLO26n／Ultralytics8.4.176 CPU、person類別0、confidence.1、640px、max64、NMS.7及原權重雜湊。不resize／crop／重採樣來源，不讀標註封存／GT／evaluator，不依精度分數選取；碰到偵測上限仍記錄，並阻擋驗收。

## 規則與mean／covariance一致性

對有限且尺寸為正的8D XYXY預測前mean，計算原生下一步 `F(1) @ x`；若下格寬或高非正，將該軸兩角速度都設為算術平均。其他位置與速度不變，兩軸可同格投影；沒有epsilon、擬合時間窗、位置clamp或門檻調整。

`T`原為單位矩陣，受影響軸的兩個速度列，各在該軸兩速度欄填`.5`。原生預測前同步執行 **`x_projected = T @ x`、`P_projected = T @ P @ T.T`**，包含全部cross terms；保留目前位置與中心速度，讓受影響尺寸速度為0。不改F／H／Q／R、motion／noise快取、時鐘、ID、出生／確認／到期、輸入或求解器。

這只是在選定T之下的條件線性矩傳播，沒有描述觸發分支本身的不確定性，也不等於協方差已統計校準。控制組遇到既有非正預測前state即記失敗，不修補接受posterior；原生參考則允許保留原本非正mean。

原生估計器與持續保留的獨立影子套用相同投影；凍結影子程式接著逐次核對原生預測／接受更新，含dtype／shape／值／位元雜湊與原生F*x、F*P*F.T+Q運算。P／Q／R對稱／半正定診斷仍用前輪固定1e-10容差。`state_post/P_post`繼續代表最後真實接受更新；原生預測寫新prior，不改寫歷史posterior來掩蓋投影。

## 接受更新與假說角色

未確認／已確認假說使用相同規則，分開記錄預測前活躍`time_since_update==0`與保留`>0`；不改成熟／等待條件或buffer。每筆高／弱階段接受量測都照原參數進原生Kalman update一次，不clip、拒絕、投影或改道接受更新。接受posterior非正會使逐場景檢查失敗。投影不計為接受觀測、不重設漏格age／hit計數或確認，空輸入仍只預測並照原生到期。保留全部弱輸入與原生弱階段，實際弱接受結果是否改變另行量測，不預設它必然不變。

## 原生封存、重複與逐場景門檻

任何投影控制執行前，先封存全部四段完整未掛觀察器的原生參考與不可變來源／快取。舊0004／0005完整JSON、原生輸出與最終state雜湊必須等於既有封存；新0006／0007是在處置前新建參考，不冒稱先前就存在的歷史結果。

每段再跑兩次完整觀察參考與兩次控制，各獨立程序、OpenCV單執行緒／seed0。觀察參考須等於未掛原生參考的完整JSON／原生輸出／最終state位元，舊生命週期也要等於原封存；各組重複的完整輸出／state／生命週期／數值／投影歷史及事件集合皆須相同。pickle只寫入與計算雜湊、不反序列化；追蹤期間不推論。

每一場景分別要求：

- 數值失敗、控制預測非正與接受posterior非正皆0。
- 原本已接受弱輸入及已確認輸出輸入的遺失皆0，以`(frame,input-index)`識別。
- 原本活躍接受更新配對遺失0，以影格、共同輸入出生事件、目前輸入序號與階段識別；不跨組移轉／等同原生ID數字。
- 新增出生事件0；即使總數相等仍比較遺失／新增事件集合。新增已確認輸入另記，不當成效益或誤追。

不能跨場景互相抵銷。兩段新完整來源各需實際投影至少一次、非正預測列少於各自原生參考、全部重複核對完成且無偵測上限影格。零曝光不能靠相同輸出通過。即使全部達標，也僅成立幾何／代理傷害證據；沒有GT仍無法驗證FP／FN／IDSW／HOTA、真實身分或追蹤傷害。

## 結果與決定

全部 **四段／1,681個不重複原格／20次預定執行** 完成，沒有剔除、來源失敗、重試、偵測上限影格或凍結後修訂。新來源組1,070原格；重複執行只核對一致性，不增加獨立樣本數。來源／程式／環境封存均保持不變。

- **已見機制0004：**191筆輸入、10次出生、102次預測、高17／弱5次接受更新。四次保留且確認的投影（四軸）使非正預測 **18→0**；接受posterior非正0，代理傷害全通過。
- **已見機制0005：**46筆輸入，出生／預測／更新／投影皆0；明列無幾何曝光，此處數值／角色效益未量測。
- **保留來源0006：**496筆輸入、2次出生、29次預測、高0／弱5次接受更新、5筆確認輸入觀測。一次保留且確認投影（一軸）使非正預測 **9→0**。數值與代理傷害全通過；弱／活躍更新／確認輸入遺失、新出生與新增確認輸入皆0。
- **保留來源0007：**208筆輸入、2次出生、48次預測、高8／弱18次接受更新、26筆確認輸入觀測。非正預測 **0→0**、實際投影0。代理傷害全通過，但只有估計器曝光、**沒有幾何控制曝光**；保留為陰性，不能算第二段有效重現。

所有場景的活躍確認、活躍未確認、保留未確認投影列皆0；只有保留且確認角色有觸發（已見四次／新來源一次），不混合分組。接受posterior皆正、數值檢查失敗0，每次原生操作與持續影子精確相同；這驗證既定矩轉換與原生更新執行，不代表協方差校準或未曝光角色的實際安全性。

十二份原生／觀察參考預測檔，含ID／格式，都等於各來源未掛參考封存；其中舊來源六份等於既有原封存，新來源則等於本輪先封存參考。原生輸出／最終state與兩段舊生命週期皆核對。每段兩次控制的完整輸出、state、原始歷史／事件集合相同。四段參考與控制的完整預測／原生回傳／最終state雜湊也相同，但0004／0006中間的估計器歷史確實有投影差異。**沒有新增確認觀測，也未展示恢復或身分效益。**

**決定：不升預設、不放寬兩來源門檻。** 凍結結果`held_out_geometry_proxy_gate_pass=false`：僅0006有有效幾何減少，0007未曝光。雖各場景保守可觀測傷害檢查皆通過，沒有GT仍不能證明真實追蹤傷害或品質。參數、原生關聯、弱延續與應用／worker預設保持不變。

下一步另凍結 **GT-free幾何曝光選取流程**：完整固定來源順序、依自身控制實際投影及角色分組、保留所有零值／失敗，並在輸出前另留未見確認。0006／0007現在都已見，不可重新當獨立確認；不依本輪結果擬合epsilon／時間窗或事後換有利場景。活躍／未確認角色的介入曝光、獨立重現、身分／定位／長遮擋及逐場景真實傷害／HOTA仍未通過。

## 重現與程式檢查

使用原固定NumPy2追蹤環境、封存本機來源／快取／原始歷史與凍結receipt。公開repo刻意不包含原始診斷或推論快取；換環境重建得到新雜湊時，不可冒稱原封存一致。新影像準備另用固定8.4.176模型環境，不與追蹤NumPy2環境混用。

```bash
python tools/validate_tracking_geometry.py run \
  --protocol docs/validation/v0.3-geometry-validity-protocol.json \
  --seal artifacts/tracking-geometry-validity/freeze.local.json \
  --old-inputs artifacts/tracking-past-exposure/confirmation-inputs.local.json \
  --new-inputs artifacts/tracking-geometry-validity/inputs/inputs.local.json \
  --work artifacts/tracking-geometry-validity/new-run \
  --references artifacts/tracking-geometry-validity/new-references.local.json \
  --output artifacts/tracking-geometry-validity/new-results.local.json
```

程式驗證：24項新契約／205項相關固定研究契約通過；同步Pages後的主程式測試 **475 passed／68 optional skipped**，另有既有Starlette／httpx警告一項。公開凍結程式提交的[應用](https://github.com/JShengP/depthport/actions/runs/39353765810)／[模型API](https://github.com/JShengP/depthport/actions/runs/39353764966)共八項CI全通過（Linux／Windows、Python3.11／3.12，CI不跑真權重推論）。另核對公開清單／連結／明顯憑證、未變的凍結／輔助程式／來源封存、全部原始參考與純原始碼封裝。沿用研究／模型環境，不等於完整Alpha全新安裝、硬體或品質驗收。

## 條款與公開邊界

[KITTI官方條款](https://www.cvlibs.net/datasets/kitti/)為CC BY-NC-SA3.0；引用Andreas Geiger、Philip Lenz、Raquel Urtasun，*Are we ready for Autonomous Driving? The KITTI Vision Benchmark Suite*，CVPR2012。限本機非商業研究，不散布來源媒體／GT／原始結果，也不重新授權為專案程式。

只發布審查過的來源層級計數、各場景門檻／零值／失敗及完整來源／程式／輸出雜湊。完整state／covariance／矩陣、個案觸發軸、影格／ID／出生key／事件集合、路徑、媒體、權重、快取與原始診斷都留ignored artifacts；既有Release tag／下載包不改。

[另凍結的GT-free曝光選取及未見確認已完成](tracking-geometry-exposure.md)；本頁原凍結定義與結果不改寫。
