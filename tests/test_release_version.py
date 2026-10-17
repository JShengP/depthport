# SPDX-License-Identifier: AGPL-3.0-only
"""Release installation marker stays consistent with package version."""
from pathlib import Path
from depthport import __version__


def test_install_marker_uses_package_version():
    content = (Path(__file__).parents[1] / 'install.py').read_text(encoding='utf-8')
    assert "'version': __version__" in content
    assert 'from depthport import __version__' in content
    assert __version__ == (Path(__file__).parents[1] / 'VERSION').read_text().strip()
