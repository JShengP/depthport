# 維護者版本發布指南
[English](../en/publishing.md) · [首頁](../../README.zh-TW.md)

目前版本為 [v0.3.0-alpha.1](https://github.com/JShengP/depthport/releases/tag/v0.3.0-alpha.1)，維持 **Alpha 預發行版／實驗性開發預覽**；[v0.2 Alpha](https://github.com/JShengP/depthport/releases/tag/v0.2.0-alpha.1)保留供比較。本頁供後續維護使用；發布版本不表示所有驗收項目通過。

## 建立標籤前的確認

1. 檢視變更、程式與展示素材發布權利、第三方授權，以及本次實際提交的 commit。不可散布現場影像、帳密或模型權重。
2. 執行單元／API／UI 與公開檔案清單檢查；使用假模型的 CI **不能**視為真模型或實機驗收。
3. 根據 Release 宣稱的功能，在目標主機執行必要的真模型、GPU、RTSP、校正與量測驗證；註明實際完成項目及未測項目。
4. 準備英文／繁體中文說明、已知限制。不得將估計公尺解釋成已驗證測距精度。

```bash
python -m pytest -q
node tests/test_i18n.cjs
node tests/test_spatial_i18n.cjs
python tools/check_release.py
python tools/build_release.py
```

封存檔只使用 `PUBLIC_FILES.txt` 所列檔案，輸出在 `dist/`。封存檔通過檢查**不等於**已完整審核 Git 歷史或測試附件。

## 發布已驗證的 Commit

以下是**示例**，`v0.1.0-alpha.1` 已經存在，不要重建或覆寫舊 Tag。只有審核並合併到 `main` 的功能，才依其實際版本建立新標籤：

```bash
git status --short
git fetch origin
git switch main
git pull --ff-only
# 僅示例，請依實際版本替換，並確認 VERSION 一致。
TAG=v0.3.0-alpha.2
git tag -a "$TAG" -m "DepthPort $TAG"
git push origin "$TAG"
python tools/build_release.py
# 發布前檢查 dist/ 與雙語版本說明。
gh release create "$TAG" --verify-tag --prerelease --title "DepthPort $TAG" \
  --notes-file path/to/reviewed-bilingual-release-notes.md \
  dist/depthport-0.3.0-alpha.2-source.zip dist/SHA256SUMS.txt
```

不要在未合併 Draft PR 的情況下執行，也不要強制覆寫既有 Tag／Release。[package workflow](../../.github/workflows/package.yml) 僅產生可下載的 artifact，**不會自動發布 Release**。

## 選配：僅合成資料的 Pages

在 **Settings → Pages → GitHub Actions** 啟用，再從已審核的預設分支手動執行 [Pages workflow](../../.github/workflows/pages.yml)。這只是合成資料靜態示範，**不會**執行 Python 深度模型或即時 RTSP。不可直接公開無登入後端或把本機輸出目錄部署到 Pages。

參考：[GitHub Release 官方文件](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。
