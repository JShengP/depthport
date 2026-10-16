# Security / 安全政策

## Supported scope / 支援範圍

DepthPort is an experimental local, single-session application. No stable security-supported release or response-time SLA is promised. The latest alpha is the intended maintenance target. Default loopback binding, explicit Host headers, same-origin writes and redaction do **not** make it safe to host publicly.

DepthPort 是本地、共用狀態的實驗性程式，沒有穩定版資安支援或回應時限承諾；以最新 Alpha 為維護目標。localhost、Host 檢查、同源寫入與遮蔽不是公開服務的安全保證。

## Reporting / 回報

Prefer GitHub **Security → Report a vulnerability** if private vulnerability reporting is enabled on this repository. If unavailable, open an issue asking for a private reporting channel **without** exploit details, credentials or sensitive data. No private contact address is invented in this source snapshot. Maintainers should enable private reporting before public launch. Do not test systems or cameras you do not own or have permission to assess.

優先使用 repo 的 **Security → Report a vulnerability**；若尚未開啟，只提出「請提供私人通報管道」的 Issue，不公開漏洞細節、帳密或敏感資料。此原始碼不虛構聯絡信箱，維護者應在公開前啟用私人回報。不要測試未經授權的系統或相機。

## Known boundaries / 已知界線

Untrusted users who can reach the API can change the shared camera/model and direct the host to an RTSP endpoint. Authentication, network/egress restrictions, resource quotas, reverse-proxy limits and tenant separation are not implemented. Large image/RTSP/model workloads can consume memory or CPU/GPU. Only load trusted checkpoints. Camera streams and exported geometry may reveal private spaces or people. Native FFmpeg/OpenCV logs may expose connection data. No cross-origin remote UI is supported.

能存取 API 的使用者可改共用相機／模型，並要求主機連到指定 RTSP。登入、出站限制、配額、反向代理限制與租戶隔離尚未實作；影像／串流／模型可消耗大量資源。只載入可信任權重；畫面與幾何可能含私人場域或人員，底層日誌也可能帶有連線資訊。不支援跨 origin 的遠端 UI。

The source archive uses an explicit manifest and rejects private paths/symlinks. This mitigates accidental export, not arbitrary file access by a compromised host. Inspect source changes and manifest entries together. Never repurpose predicted depth as a safety-critical signal.

原始碼匯出使用明列清單，拒絕私人路徑及 symlink；這只降低意外匯出，不防範已入侵主機。修改程式與清單需一起審查；不可將預測深度當成安全關鍵訊號。
