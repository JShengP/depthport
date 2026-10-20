# SPDX-License-Identifier: AGPL-3.0-only
"""Repeat the frozen synthetic Node regression; never retry or overwrite evidence."""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / 'docs/validation/windows-node-stability-plan.json'
CASE = 'test_real_results_browser_helpers_if_node_available'


def classify(returncode, junit, mode):
    """A successful exit alone is insufficient (e.g. skipped Node on PATH)."""
    try:
        cases = ET.parse(junit).getroot().findall('.//testcase')
    except (OSError, ET.ParseError):
        return 'invalid_report'
    if len(cases) != 1 or cases[0].get('name') != f'{CASE}[{mode}]':
        return 'invalid_report'
    case = cases[0]
    if case.find('skipped') is not None:
        return 'skipped'
    if returncode != 0 or case.find('failure') is not None or case.find('error') is not None:
        return 'failed'
    return 'passed'


def as_text(value):
    return value.decode('utf-8', errors='replace') if isinstance(value, bytes) else value or ''


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def run_trials(out, rounds, timeout, budget, execute=subprocess.run):
    started = time.monotonic()
    records = []
    for round_number in range(1, rounds + 1):
        modes = ('normal', 'delayed_fetch') if round_number % 2 else ('delayed_fetch', 'normal')
        for mode in modes:
            stem = f'{round_number:02d}-{mode}'
            junit = out / f'{stem}.xml'
            record = {'round': round_number, 'mode': mode, 'status': 'unrun'}
            if time.monotonic() - started < budget:
                command = [sys.executable, '-m', 'pytest', '-q',
                           f'tests/test_real_results.py::{CASE}[{mode}]', f'--junitxml={junit}']
                tick = time.monotonic()
                try:
                    result = execute(command, cwd=ROOT, capture_output=True, text=True,
                                     encoding='utf-8', errors='replace', timeout=timeout,
                                     env={**os.environ, 'PYTHONUTF8': '1'})
                    stdout, stderr = result.stdout, result.stderr
                    record.update(exit_code=result.returncode, status=classify(result.returncode, junit, mode))
                except subprocess.TimeoutExpired as error:
                    stdout, stderr = error.stdout, error.stderr
                    record['status'] = 'timeout'
                except OSError as error:
                    stdout, stderr = '', str(error)
                    record['status'] = 'launch_failed'
                record['seconds'] = round(time.monotonic() - tick, 3)
                (out / f'{stem}.stdout.txt').write_text(as_text(stdout), encoding='utf-8')
                (out / f'{stem}.stderr.txt').write_text(as_text(stderr), encoding='utf-8')
            records.append(record)
            with (out / 'trials.jsonl').open('a', encoding='utf-8') as stream:
                stream.write(json.dumps(record) + '\n')
                stream.flush()
            print(json.dumps(record), flush=True)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch', type=int, choices=(1, 2, 3), required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    # Refuse overwrites, including a rerun of the same batch at the same path.
    args.output.mkdir(parents=True, exist_ok=False)
    plan = json.loads(PLAN.read_text(encoding='utf-8'))
    actual = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in plan['source_sha256']}
    runtime = {'python': platform.python_version(), 'system': platform.system(), 'release': platform.release(),
               'version': platform.version(), 'machine': platform.machine(),
               'ci': {k: os.environ.get(k) for k in ('GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'ImageOS', 'ImageVersion')},
               'batch': args.batch, 'pytest': importlib.metadata.version('pytest'), 'source_sha256': actual,
               'plan_sha256': hashlib.sha256(PLAN.read_bytes()).hexdigest()}
    node = shutil.which('node')
    if node:
        probe = subprocess.run([node, '--version'], capture_output=True, text=True, timeout=10, check=True)
        runtime['node'] = probe.stdout.strip()
    checks = {'windows': platform.system() == 'Windows', 'python_311': sys.version_info[:2] == (3, 11),
              'node_present': node is not None, 'frozen_source_bytes': actual == plan['source_sha256']}
    eligible = all(checks.values())
    runtime['eligibility_checks'] = checks
    write_json(args.output / 'runtime.json', runtime)
    records = run_trials(args.output, plan['rounds_per_batch'], plan['case_timeout_seconds'],
                         plan['batch_budget_seconds'] if eligible else 0)
    counts = {mode: dict(Counter(r['status'] for r in records if r['mode'] == mode))
              for mode in ('normal', 'delayed_fetch')}
    passed = eligible and all(r['status'] == 'passed' for r in records)
    write_json(args.output / 'summary.json', {'eligible': eligible, 'passed': passed, 'counts': counts,
                                            'trials': records, 'runtime': runtime})
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
