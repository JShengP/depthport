# SPDX-License-Identifier: AGPL-3.0-only
"""Evidence accounting must retain failures and never count skipped/unrun as passes."""
from pathlib import Path
import subprocess
from types import SimpleNamespace
import pytest
from tools.node_stability import CASE, classify, run_trials


def report(path, mode, child=''):
    path.write_text(f'<testsuites><testsuite><testcase name="{CASE}[{mode}]">{child}</testcase></testsuite></testsuites>')


@pytest.mark.parametrize('code,child,expected', [(0, '', 'passed'), (1, '', 'failed'),
    (0, '<skipped/>', 'skipped'), (0, '<failure/>', 'failed'), (0, '<error/>', 'failed')])
def test_status_requires_executed_success(tmp_path, code, child, expected):
    xml = tmp_path / 'trial.xml'
    report(xml, 'normal', child)
    assert classify(code, xml, 'normal') == expected
    assert classify(code, xml, 'delayed_fetch') == 'invalid_report'


def test_missing_and_corrupt_reports_are_not_success(tmp_path):
    xml = tmp_path / 'missing.xml'
    assert classify(0, xml, 'normal') == 'invalid_report'
    xml.write_text('<broken')
    assert classify(0, xml, 'normal') == 'invalid_report'


def test_failure_timeout_and_skip_are_retained_and_do_not_stop_later_trials(tmp_path):
    calls = []
    def execute(command, **kwargs):
        mode = command[4].split('[')[-1][:-1]
        xml = Path(command[5].split('=', 1)[1])
        calls.append(mode)
        if len(calls) == 2:
            raise subprocess.TimeoutExpired(command, 120, output=b'partial output', stderr='partial error')
        report(xml, mode, '<failure/>' if len(calls) == 1 else '<skipped/>' if len(calls) == 3 else '')
        return SimpleNamespace(returncode=int(len(calls) == 1), stdout='output', stderr='error')
    rows = run_trials(tmp_path, 2, 120, 600, execute)
    assert calls == ['normal', 'delayed_fetch', 'delayed_fetch', 'normal']
    assert [r['status'] for r in rows] == ['failed', 'timeout', 'skipped', 'passed']
    assert len((tmp_path / 'trials.jsonl').read_text().splitlines()) == 4
    assert (tmp_path / '01-delayed_fetch.stdout.txt').read_text() == 'partial output'
    assert (tmp_path / '01-delayed_fetch.stderr.txt').read_text() == 'partial error'


def test_exhausted_budget_records_every_unrun_case(tmp_path):
    def unexpected(*args, **kwargs):
        pytest.fail('must not start a trial after budget exhaustion')
    rows = run_trials(tmp_path, 2, 120, 0, unexpected)
    assert len(rows) == 4 and all(r['status'] == 'unrun' for r in rows)
