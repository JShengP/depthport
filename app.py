# SPDX-License-Identifier: AGPL-3.0-only
"""Run the local DepthPort server from a source checkout."""
from __future__ import annotations

import os
from depthport.api import app


def main() -> None:
    import uvicorn
    uvicorn.run(app, host=os.getenv("HOST", "127.0.0.1"),
                port=int(os.getenv("PORT", "8000")), log_level="info")


if __name__ == "__main__":
    main()
