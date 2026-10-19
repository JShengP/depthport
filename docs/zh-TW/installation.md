# 安裝
[English](../en/installation.md)・[首頁](../../README.zh-TW.md)

## 選擇安裝方式

| 用途 | 操作 |
|---|---|
| 合成靜態檢視器 | `python tools/build_site.py`，不需第三方 Python 套件 |
| 四模型完整應用 | `RUN_WINDOWS.bat` 或 `bash RUN_UBUNTU.sh` |
| 僅 V2 | 安裝器加 `--v2-only`；設定 `DEPTH_ENGINE=da2-small`；直接執行 `app.py` |
| 僅 YOLO | 安裝器加 `--yolo-only`；直接執行 `app.py` |
| 開發測試 | base、test requirements 與相容的 CPU torch |

完整依賴配方以 Python 3.10～3.12 為目標，建議 3.11／3.12。安裝器拒絕直接改動系統 Python，也不接受不支援的 Python 版本；它不會替你安裝 Python。本次環境尚未完成 Windows／Ubuntu 乾淨安裝驗證。

## 先準備 GPU 環境

以已安裝的 Python 建立 `.venv-depthport`：

```powershell
# Windows
py -3.11 -m venv .venv-depthport
.\.venv-depthport\Scripts\python.exe -m pip install --upgrade pip
```

```bash
# Ubuntu，需有 python3.11-venv
python3.11 -m venv .venv-depthport
.venv-depthport/bin/python -m pip install --upgrade pip
```

依 [PyTorch 官方選擇器](https://pytorch.org/get-started/locally/)取得相容的 torch／torchvision 安裝指令，並使用**此 venv 的 Python**。CUDA 指令取決於 OS、GPU 與驅動，不能套用單一通用指令。本專案不會更動其他 Python 環境或安裝驅動。

再執行 `INSTALL_ALL_WINDOWS.bat` 或 `bash INSTALL_ALL_UBUNTU.sh`，完成後使用 RUN 腳本。明確指定 `DEPTH_DEVICE=cuda:0` 而 CUDA 不可用時會報錯；`auto` 則可能使用 CPU。目前不承諾 GPU 效能。

## 依賴範圍

共用依賴在 `requirements-base.txt`，YOLO 在 `requirements.txt`，V2 在 `requirements-v2.txt`，DA3 在 `requirements-da3.txt`。`install.py` 先統一解析套件相依，再單獨安裝固定 DA3 來源。

目前配方保留 NumPy 1.26.4／OpenCV 4.11.0.86，要求 Ultralytics >=8.4.176、固定 Transformers 4.57.6 與 DA3 `3d835ec` 來源。這些是參考選擇，**不是完整依賴鎖檔，也不是乾淨安裝已成功的證明**。可透過 `DA2_HF_REVISION`／`DA3_HF_REVISION` 固定權重 revision；未固定時上游預設可能改變。效能測試前應記錄套件版本與權重雜湊。

DA3 以 `--no-deps` 加上明列 runtime 安裝，不裝選配 `xformers`、Gradio、GS 工具或開發 hooks；因此上游 metadata 可能使 `pip check` 回報缺少刻意省略的選配套件。不要為消除提示直接安裝可能替換 torch 的 xformers wheel。其他相依衝突仍需排查；這是 Alpha 配方，不是安裝保證。

目前 NumPy 1 幾何配方為 SciPy `>=1.17.1,<1.18`、e3nn `>=0.5.9,<0.6`、Trimesh `>=4.12.2,<5`、plyfile `>=1.1.3,<1.1.4`。SciPy 1.18.x／plyfile 1.1.4 要求 NumPy 2，此應用配方暫緩；BoT-SORT 保留獨立 NumPy 2 環境，不可混裝到深度環境。完整已檢查配方使用 Python 3.11 或 3.12。歷史追蹤快取使用 Ultralytics 8.4.115，不能當新版效能證據；詳見[依賴驗證紀錄](../validation/v0.3-dependency-followup.json)。

## 部分安裝

```bat
INSTALL_ALL_WINDOWS.bat --v2-only
```

```bash
bash INSTALL_ALL_UBUNTU.sh --v2-only
```

由 `.env.example` 建立 `.env`，設定 `DEPTH_ENGINE=da2-small`，再直接使用 `.venv-depthport` 的 Python 執行 `app.py`。僅 YOLO 改用 `--yolo-only`。部分安裝**不會**建立 `.installed-all.json`；RUN 若未設定 `SKIP_INSTALL=1` 會嘗試安裝完整四模型。缺少的後端會明確報錯。

## 離線模式

先備妥可信任程式、套件與權重，設定 `MODEL_OFFLINE=1` 並指定本地模型路徑。V2 目錄包含 `config.json`、`preprocessor_config.json`、`model.safetensors`；DA3 包含對應 `config.json`、`model.safetensors`；YOLO 使用可信任 `.pt`。詳見[模型儲存](../../models/README.zh-TW.md)。

直接用 venv Python 執行 `app.py`，或設定 `SKIP_INSTALL=1` 後使用 RUN。離線設定不會自動補齊缺少的環境。Web UI 使用本地資產，不需要 JS CDN 或翻譯服務。

## 受控內網使用

預設 `HOST=127.0.0.1` 與明列 Host 標頭允許清單，避免意外暴露。若要在受控 LAN 使用，調整 bind 並將伺服器的**實際 IP／名稱**加入 `DEPTHPORT_ALLOWED_HOSTS`，同時以防火牆限制來源。程式拒絕萬用 `*`。這不是登入驗證，應用仍是共用狀態的 PoC；公開服務需另做資安設計。
