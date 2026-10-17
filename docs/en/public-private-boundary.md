# Public / Private Repository Boundary

[繁體中文](../zh-TW/public-private-boundary.md) · [Home](../../README.md)

DepthPort is a **public experimental depth and spatial-analysis tool**. Publish reusable research tools, not employer, customer, or live-deployment material. The `feature/spatial-analysis-v0.2` branch and its Draft PR are public. DepthPort's AGPL-3.0-only software license does **not** grant rights to publish third-party data or software.

## Public (only with publication rights)

- Generic depth adapters, inspector, sequential comparison, 2D-to-3D semantic mapping, calibration **algorithms**, geometry utilities, open APIs, synthetic tests, and bilingual instructions.
- Synthetic test scenes; third-party reference images only with verified permission, applicable license and attribution.
- Authorized non-confidential methodology, aggregate benchmark results, independent ground-truth error reports, and software compatibility observations.
- Model identifiers and upstream package dependencies. **Do not bundle model weights by default**; third-party licenses remain in effect.

## Private (never in this public repository, branch, issue, PR or Actions artifact)

- Customer camera images/video, faces, floor plans, exact sensor locations, recordings, measured site calibration and camera intrinsics/extrinsics, non-public datasets, raw event logs and customer benchmarks.
- RTSP credentials, `.env`, API tokens, passwords, certificates or private keys, internal network configuration, production telemetry and deployment parameters.
- Employer/customer application code, confidential SOPs, business detection rules, deployment adapters, hardware/flight-control integration and unreleased SDK/firmware unless an authorized release is documented.

**Private repositories are access controls, not secret vaults.** Use an appropriate secret manager or encrypted CI secrets; avoid placing credentials into any Git history.

## Pre-push and review checklist

1. Verify ownership and written publication permission, including model weights, screenshots, data and third-party license terms.
2. Prefer synthetic fixtures. For real samples, obtain location/customer approval, privacy/consent review, licenses, attribution and a retention plan **before** publication.
3. Review every staged file, binary asset, commit history, PR description, test artifact and CI log; redaction of a URL in one place does not sanitize copies elsewhere.
4. Run `python -m pytest -q`, `python tools/check_release.py` and both bilingual checks. Update `PUBLIC_FILES.txt` deliberately. The source-archive guard blocks common private paths, recordings, result files and non-approved images, but is **not a comprehensive security scan**.
5. If a secret leaks, **revoke/rotate immediately**, notify affected owners and follow incident procedures; merely deleting a Git commit does not erase public history.
6. Label distances as **relative**, **unverified estimated meters** or **sample error against independent ground truth**. Never represent monocular estimates as certified safety distances.

## Integration boundary

**Public DepthPort → documented APIs / PLY / NPY / JSON / ZIP → private application/deployment repository.** Commercial/private code should retain customer rules and operational data. Using AGPL code from a private repository does **not** automatically avoid AGPL obligations; assess obligations for the actual integration and distribution, or obtain the appropriate commercial license.

Do not commit additional real camera imagery to `docs/assets/` without an explicit review and updated allowlist. Current approved PNG paths are synthetic UI previews only.
