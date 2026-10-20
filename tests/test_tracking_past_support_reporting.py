# SPDX-License-Identifier: AGPL-3.0-only
import json
import pytest
from tools.validate_tracking_past_support import audit_counts


def test_empty_hypothesis_frames_count_without_association_stage(tmp_path):
    path = tmp_path/'empty.jsonl'
    rows = [{'deferred': [], 'past_support_audit': [], 'stages': stages} for stages in ([], [{}], [{}, {'matched': []}])]
    path.write_text(''.join(json.dumps(r)+'\n' for r in rows))
    result = audit_counts(path, reference=True)
    assert result['counts']['frames'] == 3
    assert not any(v for k, v in result['counts'].items() if k != 'frames')
    assert not any(v for g in result['reference_risk_groups'].values() for v in g.values())


def test_missing_stage_cannot_hide_recorded_control_decisions(tmp_path):
    path = tmp_path/'invalid.jsonl'
    path.write_text(json.dumps({'deferred': [], 'past_support_audit': [{'veto': False}], 'stages': []})+'\n')
    with pytest.raises(ValueError, match='Audit requires'):
        audit_counts(path)


def test_empty_kitti_prediction_file_has_zero_bytes_for_official_parser(tmp_path):
    from tools.validate_tracking_past_support import write_kitti_predictions
    path = tmp_path/'empty.txt'
    write_kitti_predictions({'frames': [{'index': 1, 'objects': []}]}, path)
    assert path.read_bytes() == b''
