# Publish a source alpha
[繁體中文](../zh-TW/publishing.md) · [Home](../../README.md)

This source snapshot has **not** created a GitHub repository, pushed commits, released an asset or deployed Pages. The following are maintainer actions, not completed operations.

## Release identity

- Display name: **DepthPort**
- Suggested repository slug: **`depthport`**
- Description: `A local monocular depth and point cloud workbench for RGB images and RTSP cameras, with four model backends and an English / Traditional Chinese UI.`
- Suggested topics: `monocular-depth-estimation`, `point-cloud`, `rtsp`, `computer-vision`, `depth-anything`, `fastapi`, `webgl`, `local-first`
- Initial tag: **`v0.1.0-alpha.1`**, mark it **pre-release**.

The name is a project choice, not a trademark or namespace clearance claim. No personal account, email or employer ownership was inferred for the metadata.

## Before making it public

- [ ] Confirm rights to publish all source, graphics and sample data, including any employer/customer rights.
- [ ] Review AGPL-3.0-only and third-party obligations. Do not relabel the whole tree as MIT.
- [ ] Review `PUBLIC_FILES.txt`, the staged diff and any pre-existing git history; run a full secret scanner separately.
- [ ] Retain the actual validation status. Do not add “four models tested”, performance numbers or CI badges without evidence.
- [ ] Enable private vulnerability reporting and choose the real maintainer/contact policy.
- [ ] Prefer a clean target install and at least one real-model smoke run before promoting this beyond source alpha.

The original prototype has no inherited git history in this archive. A clean source ZIP does not prove that another existing repository's history is safe.

## Build and inspect

```bash
python tools/check_release.py
node tests/test_i18n.cjs
python -m pytest -q
python tools/build_release.py
```

`dist/` contains the manifest-only source ZIP and SHA-256 checksum. It is reproducible for identical input bytes, with fixed archive metadata. A changed checkout's line endings or generated images can change its hash. New public files must be added deliberately to the manifest; the builder does not sweep the working tree.

## Create the repository explicitly

From the reviewed project root, with Git and GitHub CLI already authenticated:

```bash
git init -b main
# Stage only the curated public manifest, not every untracked local file.
python tools/stage_public.py
git diff --cached --stat
git diff --cached --check
git commit -m "Initial DepthPort source alpha"
# This next command CREATES A PUBLIC REPOSITORY and uploads committed source.
gh repo create depthport --public --source=. --remote=origin --push
```

Read the staged content before committing. If the repository exists, add its actual remote instead; do not overwrite another project. Do not include generated outputs or private local configuration. Authentication tokens belong in your credential manager, never a command copied into this repository.

Wait for the GitHub Actions run and review any failure. The included CI is configured, not remotely validated by this package.

## Make a pre-release

After reviewing CI and the release notes:

```bash
git tag -a v0.1.0-alpha.1 -m "DepthPort source alpha"
git push origin v0.1.0-alpha.1
python tools/build_release.py
gh release create v0.1.0-alpha.1 --verify-tag --prerelease --title "DepthPort 0.1.0-alpha.1" --notes-file docs/releases/0.1.0-alpha.1.md dist/depthport-0.1.0-alpha.1-source.zip dist/SHA256SUMS.txt
```

These commands publish externally when **you** execute them. The `Build source release` workflow creates a downloadable artifact only; it never automatically publishes a release.

## Optional GitHub Pages viewer

Set repository **Settings → Pages → Source: GitHub Actions**. From the default branch, manually run **Pages - synthetic viewer only**. It builds `_site` and deploys just those named public assets, including a source ZIP. The page uses synthetic points and disables all AI/RTSP inputs. It is **not** the FastAPI service and cannot connect to a camera.

Do not publish the project root as a static site; it can contain runtime data after local use. Update the repository's website field to the actual Pages URL only after deployment succeeds.

## Workflow references

[GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) · [Checkout](https://github.com/actions/checkout) · [Setup Python](https://github.com/actions/setup-python) · [Upload artifact](https://github.com/actions/upload-artifact)

Core CI actions use full commit pins with version comments; Pages helper actions use the official versioned tags. Dependabot proposes updates; review them, especially runtime/model API changes.
