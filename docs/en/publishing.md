# Maintainer release guide
[繁體中文](../zh-TW/publishing.md) · [Home](../../README.md)

The current version is [v0.3.0-alpha.2](https://github.com/JShengP/depthport/releases/tag/v0.3.0-alpha.2), an **Alpha pre-release / experimental development preview**. [v0.2 Alpha](https://github.com/JShengP/depthport/releases/tag/v0.2.0-alpha.1) remains available for comparison. This guide covers future maintenance; a published release does not imply all acceptance gates passed.

## Check before tagging

1. Review the change set, rights to release source and demo assets, licenses, and the exact git commit. Do not ship captured camera frames, credentials or model weights.
2. Run unit/API/UI checks and the manifest check. Model-double CI is not evidence of real model or hardware validation.
3. Run the target-hardware validation appropriate to the claimed features. State precisely which model weights, GPU, RTSP, calibration and accuracy checks were actually executed.
4. Document known limitations and prepare English and Traditional Chinese release notes. Avoid claiming physical distance accuracy from model-estimated metres.

```bash
python -m pytest -q
node tests/test_i18n.cjs
node tests/test_spatial_i18n.cjs
python tools/check_release.py
python tools/build_release.py
```

The source archive is generated **only** from `PUBLIC_FILES.txt`, in `dist/`; a clean ZIP does not replace reviewing tracked file history or test artifacts.

## Release a reviewed commit

Use a version appropriate to the source **after** reviewing its CI and tests. The following commands use a placeholder tag; do not reuse the existing v0.1 tag:

```bash
git status --short
git fetch origin
git switch main
git pull --ff-only
# Replace the value below with the reviewed version (example only).
TAG=v0.3.0-alpha.3
git tag -a "$TAG" -m "DepthPort $TAG"
git push origin "$TAG"
python tools/build_release.py
# Verify the tag matches VERSION and inspect dist/ before upload.
gh release create "$TAG" --verify-tag --prerelease --title "DepthPort $TAG" \
  --notes-file path/to/reviewed-bilingual-release-notes.md \
  dist/depthport-0.3.0-alpha.3-source.zip dist/SHA256SUMS.txt
```

Do not run this on an unmerged draft branch, and do not overwrite an existing tag or published release. The [package workflow](../../.github/workflows/package.yml) builds an artifact but **does not publish** a Release.

## Optional synthetic-only Pages site

Enable GitHub Pages with **Settings → Pages → GitHub Actions**, then manually run the [Pages workflow](../../.github/workflows/pages.yml) from a reviewed default branch. The site is **static and synthetic**; it runs neither the Python depth engines nor live RTSP. Do not publish runtime outputs or use a public unauthenticated backend.

See [GitHub release documentation](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).
