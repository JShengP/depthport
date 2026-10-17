# Roadmap / 路線圖

These are priorities, not delivered features or promised deadlines.
以下為優先方向，不是已完成能力或交付期限承諾。

| Priority | Work / 工作 | Evidence required / 驗收證據 |
|---|---|---|
| P0 | Clean Windows / Ubuntu install / 乾淨安裝 | Exact environment and dependency record / 版本記錄 |
| P0 | Four real checkpoint runs / 四套真權重推論 | Shareable input hash, exports and actual PASS per engine / 各模型實際結果 |
| P0 | Camera + GPU + WebGL / 相機與 GPU | Actual device tests, no mock substitution / 實體測試 |
| P1 | Reproducible comparison / 可重現比較 | Fixed inputs, timing boundaries, calibrated truth where needed / 明列條件 |
| P1 | Opt-in manual local Sessions / 可選本地手動 Session | Indexed same-frame snapshots, hash-checked replay, no auto video recording / 同影格原檔、完整性驗證、不自動錄影 |
| P1 | Temporal stability / 時間穩定性 | Scale/shape drift metrics and failure cases / 漂移與失效案例 |
| P2 | Efficient transport / 高效率傳輸 | End-to-end latency and multi-client load results / 實測延遲與負載 |
| P2 | Safe multi-user deployment / 安全多人部署 | Authentication, egress controls, resource and session isolation / 權限與隔離 |

No plan here implies hidden-surface recovery, physical safety certification or a new depth model.
上述方向不代表遮擋區域還原、安全認證或新深度模型。
