# SPDX-License-Identifier: AGPL-3.0-only
"""Local configuration. OS environment overrides the optional project .env file."""
from __future__ import annotations
import math
import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env', override=False)


def flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name, '1' if default else '0').strip().lower()
    if value not in ('1', '0', 'true', 'false', 'yes', 'no'):
        raise ValueError(f'{name} must be 1/0, true/false or yes/no')
    return value in ('1', 'true', 'yes')


@dataclass(frozen=True)
class Settings:
    max_width: int = int(os.getenv('MAX_IMAGE_WIDTH', '960'))
    target_hz: float = float(os.getenv('TARGET_HZ', '2'))
    grid_width: int = int(os.getenv('GRID_WIDTH', '220'))
    hfov: float = float(os.getenv('CAMERA_HFOV_DEG', '65'))
    min_depth: float = float(os.getenv('MIN_DEPTH_M', '0.1'))
    max_depth: float = float(os.getenv('MAX_DEPTH_M', '80'))
    color_min: float = float(os.getenv('COLOR_MIN_M', '0.1'))
    color_max: float = float(os.getenv('COLOR_MAX_M', '20'))
    calibration_file: str = os.getenv('CAMERA_INTRINSICS_FILE', '').strip()
    open_timeout_ms: int = int(os.getenv('RTSP_OPEN_TIMEOUT_MS', '5000'))
    read_timeout_ms: int = int(os.getenv('RTSP_READ_TIMEOUT_MS', '5000'))

    relative_min: float = float(os.getenv('RELATIVE_MIN_DEPTH', '0.000001'))
    relative_max: float = float(os.getenv('RELATIVE_MAX_DEPTH', '1000000'))
    confidence_percentile: float = float(os.getenv('DA3_CONF_PERCENTILE', '0'))
    exclude_sky: bool = flag('DA3_EXCLUDE_SKY', True)

    def __post_init__(self):
        for name in ('target_hz', 'hfov', 'min_depth', 'max_depth', 'color_min', 'color_max'):
            if not math.isfinite(getattr(self, name)):
                raise ValueError(f'{name} must be finite')
        if not (math.isfinite(self.relative_min) and math.isfinite(self.relative_max)
                and 0 < self.relative_min < self.relative_max):
            raise ValueError('Relative depth bounds must be finite and positive.')
        if not math.isfinite(self.confidence_percentile) or not 0 <= self.confidence_percentile <= 95:
            raise ValueError('DA3_CONF_PERCENTILE must be 0..95; 0 disables confidence filtering.')
        if not 128 <= self.max_width <= 3840:
            raise ValueError('MAX_IMAGE_WIDTH must be 128..3840')
        if not .1 <= self.target_hz <= 30:
            raise ValueError('TARGET_HZ must be 0.1..30')
        if not 16 <= self.grid_width <= 800:
            raise ValueError('GRID_WIDTH must be 16..800')
        if not 15 <= self.hfov <= 140:
            raise ValueError('CAMERA_HFOV_DEG must be 15..140')
        if not 0 < self.min_depth < self.max_depth <= 10000:
            raise ValueError('Require 0 < MIN_DEPTH_M < MAX_DEPTH_M <= 10000')
        if not 0 <= self.color_min < self.color_max:
            raise ValueError('Require 0 <= COLOR_MIN_M < COLOR_MAX_M')
        if not all(500 <= t <= 60000 for t in (self.open_timeout_ms, self.read_timeout_ms)):
            raise ValueError('RTSP timeouts must be 500..60000 ms')

CFG = Settings()
