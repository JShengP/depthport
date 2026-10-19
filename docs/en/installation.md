# Installation
[繁體中文](../zh-TW/installation.md) · [Home](../../README.md)

## Choose a path

| Purpose | Installation |
|---|---|
| Synthetic static viewer | `python tools/build_site.py`; no third-party Python dependencies |
| Full four-engine app | `RUN_WINDOWS.bat` or `bash RUN_UBUNTU.sh` |
| V2 only | installer `--v2-only`; set `DEPTH_ENGINE=da2-small`; run `app.py` directly |
| YOLO only | installer `--yolo-only`; run `app.py` directly |
| Contributor tests | base requirements + test requirements + compatible CPU torch |

The full dependency recipe targets Python 3.10–3.12; 3.11/3.12 are recommended. The installer rejects system Python and unsupported Python versions. It does not install Python itself. Fresh Windows/Ubuntu installation has not been validated in this release environment.

## GPU-first manual setup

Create `.venv-depthport`, using an already installed Python:

```powershell
# Windows
py -3.11 -m venv .venv-depthport
.\.venv-depthport\Scripts\python.exe -m pip install --upgrade pip
```

```bash
# Ubuntu (python3.11-venv must be available)
python3.11 -m venv .venv-depthport
.venv-depthport/bin/python -m pip install --upgrade pip
```

Install a matching torch/torchvision pair using the [official PyTorch selector](https://pytorch.org/get-started/locally/), with the **venv's Python**. There is no universal CUDA installation command; match your OS, GPU and driver. This project does not alter other Python environments or install drivers.

Then run `INSTALL_ALL_WINDOWS.bat`, or `bash INSTALL_ALL_UBUNTU.sh`. After setup, start with the matching RUN script. Explicit `DEPTH_DEVICE=cuda:0` fails if CUDA is unavailable; `auto` can use CPU. No GPU speed is promised.

## Dependency boundaries

Core packages live in `requirements-base.txt`; YOLO in `requirements.txt`; V2 in `requirements-v2.txt`; DA3 in `requirements-da3.txt`. `install.py` resolves the combined requirements before installing the pinned DA3 source separately.

Current requirements retain NumPy 1.26.4 / OpenCV 4.11.0.86, require Ultralytics >=8.4.176, pin Transformers 4.57.6 and install the DA3 `3d835ec` source revision. These are reference choices, **not a fully locked dependency graph or a clean-install success claim**. Model revisions may be pinned through `DA2_HF_REVISION` / `DA3_HF_REVISION`; otherwise the upstream default can move. Record exact installed versions and weight hashes before benchmarking.

DA3 is installed with `--no-deps` plus an explicit runtime list. Optional `xformers`, Gradio, GS tooling and development hooks are not installed. Upstream package metadata can consequently make `pip check` complain about omitted optional packages. Do not blindly install an xformers wheel that replaces a working torch. All other dependency conflicts must be investigated; this is an alpha recipe, not a guarantee.

The current NumPy 1 geometry profile uses SciPy `>=1.17.1,<1.18`, e3nn `>=0.5.9,<0.6`, Trimesh `>=4.12.2,<5` and plyfile `>=1.1.3,<1.1.4`. SciPy 1.18.x and plyfile 1.1.4 require NumPy 2 and are deferred for this application profile. BoT-SORT keeps its separate NumPy 2 environment; do not combine its requirements with the depth environment. Use Python 3.11 or 3.12 for the full checked profile. Historical tracking caches used Ultralytics 8.4.115; they are not performance evidence for newer versions. See the [dependency validation record](../validation/v0.3-dependency-followup.json).

## Partial installations

```bat
INSTALL_ALL_WINDOWS.bat --v2-only
```

```bash
bash INSTALL_ALL_UBUNTU.sh --v2-only
```

Set `DEPTH_ENGINE=da2-small` in `.env`, copied from `.env.example`. Then start using `.venv-depthport`'s Python `app.py`. Substitute `--yolo-only` for YOLO. A partial install deliberately does **not** create `.installed-all.json`; RUN without `SKIP_INSTALL=1` will try to complete all engines. Missing backends produce an explicit error.

## Offline operation

After obtaining trusted code, packages and weights, set `MODEL_OFFLINE=1` and configure local model paths. V2 directories need `config.json`, `preprocessor_config.json` and `model.safetensors`; DA3 needs the matching `config.json` and `model.safetensors`; YOLO uses a trusted `.pt`. See [model storage](../../models/README.md).

Launch `.venv-depthport`'s Python `app.py` directly, or set `SKIP_INSTALL=1` for the RUN scripts. Offline model settings do not turn an incomplete environment into a working one. The UI uses local assets; no JS CDN or translation service is required.

## Trusted LAN use

Default `HOST=127.0.0.1` and explicit Host-header allowlist protect the local deployment from accidental exposure. For a controlled LAN, set a reachable bind address and add the server's **actual IP/name** to `DEPTHPORT_ALLOWED_HOSTS`. Restrict the port in your firewall. Wildcard `*` is rejected. This is not authentication, and the app remains a shared-session PoC. Public hosting requires a separate security design.
