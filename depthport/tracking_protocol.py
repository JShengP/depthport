# SPDX-License-Identifier: AGPL-3.0-only
"""Bounded, versioned JSONL contract; stdlib only in both Python environments."""
import math

PROTOCOL = 'depthport.tracking-worker.v1'
MAX_LINE = 20 * 1024 * 1024
MAX_REPLY = 64 * 1024
MAX_PNG = 12 * 1024 * 1024
MAX_PIXELS = 4 * 1024 * 1024
MAX_OBJECTS = 64
VERSIONS = {'trackers': '2.6.1', 'supervision': '0.27.0', 'numpy': '2.2.6', 'opencv-python': '4.11.0.86'}


def validate_detections(items, width, height):
    if (type(width) is not int or type(height) is not int or
        not 1 <= width <= 4096 or not 1 <= height <= 4096 or width * height > MAX_PIXELS):
        raise ValueError('Invalid frame dimensions')
    if not isinstance(items, list) or len(items) > MAX_OBJECTS:
        raise ValueError('Invalid detection count')
    for item in items:
        if not isinstance(item, dict) or type(item.get('class_id')) is not int or not 0 <= item['class_id'] <= 10000:
            raise ValueError('Invalid class ID')
        score = item.get('confidence')
        if type(score) not in (int, float) or not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError('Invalid confidence')
        box = item.get('bbox')
        if not isinstance(box, list) or len(box) != 4 or any(type(x) not in (int, float) or not math.isfinite(x) for x in box):
            raise ValueError('Invalid bounding box')
        if not (0 <= box[0] < box[2] <= width and 0 <= box[1] < box[3] <= height):
            raise ValueError('Bounding box outside frame')
