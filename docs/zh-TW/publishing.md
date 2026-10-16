# 發布原始碼 Alpha
[English](../en/publishing.md)・[首頁](../../README.zh-TW.md)

這份原始碼快照**尚未**建立 GitHub repo、推送 commit、發布 Release 或部署 Pages。以下是維護者可執行的步驟，不是已完成的外部操作。

## 發布識別

- 展示名稱：**DepthPort**
- 建議 repo 名稱：**`depthport`**
- About：`A local monocular depth and point cloud workbench for RGB images and RTSP cameras, with four model backends and an English / Traditional Chinese UI.`
- 建議 topics：`monocular-depth-estimation`、`point-cloud`、`rtsp`、`computer-vision`、`depth-anything`、`fastapi`、`webgl`、`local-first`
- 首個 tag：**`v0.1.0-alpha.1`**，標記 **pre-release**。

名稱是專案命名選擇，不代表已完成商標或 namespace 權利檢查；metadata 沒有自行推定你的帳號、信箱或雇主歸屬。

## 公開前確認

- [ ] 取得程式、圖像與範例資料的公開權利，包含必要的公司／客戶核准。
- [ ] 確認 AGPL-3.0-only 及第三方義務，不把整包直接改標 MIT。
- [ ] 檢查 `PUBLIC_FILES.txt`、staged diff 與既有 Git 歷史；另跑完整 secret scanner。
- [ ] 保留真實驗證狀態；沒有證據就不加「四模型實測」、效能數字或 CI 成功徽章。
- [ ] 啟用私人漏洞回報，決定真正的維護者與聯絡政策。
- [ ] 超越原始碼 Alpha 前，優先補目標設備乾淨安裝及至少一個真模型 smoke test。

封裝沒有繼承 prototype 的 Git 歷史；乾淨 ZIP 不表示另一個既有 repo 的歷史也沒有秘密。

## 建置與檢查

```bash
python tools/check_release.py
node tests/test_i18n.cjs
python -m pytest -q
python tools/build_release.py
```

`dist/` 產生僅含公開清單的 ZIP 與 SHA-256。相同輸入 bytes 與固定 metadata 可重現；不同 line endings 或生成圖片會改變雜湊。新公開檔案需手動加入清單，建置器不掃整棵工作目錄。

## 明確建立 repo

在已審查的專案根目錄，先備妥 Git 與已登入的 GitHub CLI：

```bash
git init -b main
# 僅加入公開清單，不把所有未追蹤檔案一併加入。
python tools/stage_public.py
git diff --cached --stat
git diff --cached --check
git commit -m "Initial DepthPort source alpha"
# 下一行會建立公開 repo，並上傳已提交的程式。
gh repo create depthport --public --source=. --remote=origin --push
```

提交前閱讀 staged content。若 repo 已存在，改用它的實際 remote，不覆蓋別的專案。不要提交生成結果或私人設定；token 留在 credential manager，不寫進 repo 或範例指令。

推送後查看 GitHub Actions 真實結果。此包只提供 CI 設定，不宣稱遠端已通過。

## 建立 pre-release

審查 CI 與 release notes 後：

```bash
git tag -a v0.1.0-alpha.1 -m "DepthPort source alpha"
git push origin v0.1.0-alpha.1
python tools/build_release.py
gh release create v0.1.0-alpha.1 --verify-tag --prerelease --title "DepthPort 0.1.0-alpha.1" --notes-file docs/releases/0.1.0-alpha.1.md dist/depthport-0.1.0-alpha.1-source.zip dist/SHA256SUMS.txt
```

上述指令在**你實際執行時**會對外發布。內附 `Build source release` workflow 只產生下載用 artifact，不自動發布 Release。

## 選配 GitHub Pages 示範

到 repo **Settings → Pages → Source: GitHub Actions**，從預設分支手動執行 **Pages - synthetic viewer only**。它只部署 `_site` 中指定的公開靜態資產與原始碼 ZIP。頁面使用合成點，停用 AI／RTSP；**不是 FastAPI 服務，也不能直接接相機**。

不要把整個專案根目錄直接發布為靜態網站，因為本機執行後可能有私人資料。部署成功後才將真實 Pages URL 填入 repo website 欄位。

## Workflow 參考

[GitHub Pages 官方流程](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)・[Checkout](https://github.com/actions/checkout)・[Setup Python](https://github.com/actions/setup-python)・[Upload artifact](https://github.com/actions/upload-artifact)

主要 CI actions 使用完整 commit pin 及版本註記；Pages 輔助 actions 使用官方版本 tag。Dependabot 只提出更新，runtime／模型 API 變更需先審查。
