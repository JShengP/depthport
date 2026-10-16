# 模型儲存
[English](README.md)・[安裝](../docs/zh-TW/installation.md)

本 repo 不含權重，也不應提交權重。安裝對應 runtime 後在 `.env` 指定可信任的本地路徑；權重格式與授權屬於上游專案。

| 預設 | 環境變數 | 本地格式 |
|---|---|---|
| YOLO26 | `YOLO_MODEL` | 可信任 Depth `.pt`，不是偵測模型或 `.yaml` |
| V2 Small | `DA2_SMALL_MODEL` | 含 config、processor config 與 safetensors 的 HF 目錄 |
| DA3-Small | `DA3_SMALL_MODEL` | 對應 DA3 config 與 safetensors 目錄 |
| DA3Metric | `DA3_METRIC_MODEL` | 對應獨立 Metric 的 config 與 safetensors 目錄 |

`MODEL_OFFLINE=1` 要求模型只從本地載入。需要重現時固定 HF revision 並記錄權重雜湊；勿載入未知來源的 pickle／checkpoint。不能只因檔案能載入，就把另一系列模型填入既有 preset。
