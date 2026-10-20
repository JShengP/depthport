# SPDX-License-Identifier: AGPL-3.0-only
"""Render the reviewed results index from public, dated evidence; no inference."""
from __future__ import annotations
from collections import defaultdict
import hashlib
from html import escape
import json
from pathlib import Path
from urllib.parse import quote

GITHUB = 'https://github.com/JShengP/depthport/blob/main/'


def pointer(document, path):
    if not path.startswith('/'):
        raise ValueError('Metric needs an absolute JSON pointer')
    for part in path[1:].split('/'):
        part = part.replace('~1', '/').replace('~0', '~')
        document = document[int(part)] if isinstance(document, list) else document[part]
    if not isinstance(document, (str, int, float)) or isinstance(document, bool):
        raise ValueError('Only scalar public metrics may be indexed')
    return document


def translated(tag, pair, extra=''):
    return (f'<{tag} data-en="{escape(pair["en"], quote=True)}" '
            f'data-zh="{escape(pair["zh"], quote=True)}"{extra}>'
            f'{escape(pair["en"])}</{tag}>')


def render_results(root: Path, approved: set[str]) -> str:
    config = json.loads((root / 'website/results-index.json').read_text(encoding='utf-8'))
    ui, grouped = config['ui'], defaultdict(list)
    seen = set()
    for row in config['records']:
        if row['id'] in seen:
            raise ValueError('Duplicate results ID')
        seen.add(row['id'])
        for field in ('kind', 'status'):
            if row[field] not in ui[field]:
                raise ValueError('Unknown results facet')
        for singular, plural in [('model', 'models'), ('tracker', 'trackers'), ('platform', 'platforms')]:
            if not set(row[plural]) <= ui[singular].keys():
                raise ValueError('Unknown results tag')
        paths = [row['source'], *row['report'].values()]
        if any(path not in approved for path in paths):
            raise ValueError('Result references a file outside the public allowlist')
        source = root / row['source']
        document = json.loads(source.read_text(encoding='utf-8')) if row['metrics'] else None
        metrics = []
        for metric in row['metrics']:
            value = pointer(document, metric['pointer'])
            style = metric['format']
            if style == 'percent':
                if not 0 <= value <= 1:
                    raise ValueError('Expected a fraction, not an already scaled percentage')
                value = f'{value * 100:.2f}%'
            elif style == 'number':
                value = f'{value:,}'
            elif style != 'text':
                raise ValueError('Unknown metric format')
            metrics.append('<div>' + translated('dt', metric['label']) +
                           '<dd>' + escape(str(value)) + '</dd></div>')
        attributes = {'data-result':row['id'], 'data-kind':row['kind'], 'data-status':row['status'],
                      **{'data-'+singular:' '.join(row[plural]) for singular, plural in
                         [('model','models'),('tracker','trackers'),('platform','platforms')]}}
        attr = ' '.join(f'{key}="{escape(value, quote=True)}"' for key, value in attributes.items())
        tags = [translated('span', ui[singular][tag], ' class="result-tag"')
                for singular, plural in [('model','models'),('tracker','trackers'),('platform','platforms')]
                for tag in row[plural]]
        link = GITHUB + quote(row['source'], safe='/')
        report_en = GITHUB + quote(row['report']['en'], safe='/')
        report_zh = GITHUB + quote(row['report']['zh'], safe='/')
        report = (f'<a class="result-detail" href="{report_en}" data-report-en="{report_en}" '
                  f'data-report-zh="{report_zh}" data-en="Read full record →" '
                  'data-zh="查看完整紀錄 →">Read full record →</a>')
        card = (f'<article class="result-card" {attr}>'
                '<div class="result-meta">' + translated('span', ui['kind'][row['kind']]) +
                f'<time datetime="{escape(row["date"])}">{escape(row["date"])}</time></div>' +
                translated('h3', row['title']) + translated('p', ui['status'][row['status']],
                    f' class="result-status status-{row["status"]}"') +
                translated('p', row['scope'], ' class="result-scope"') +
                '<div class="result-tags">' + ''.join(tags) + '</div>' +
                ('<dl class="result-metrics">' + ''.join(metrics) + '</dl>' if metrics else '') +
                translated('p', row['limit'], ' class="result-limit"') +
                '<div class="result-links">' + report +
                f'<a href="{link}" data-en="Evidence ↗" data-zh="來源證據 ↗">Evidence ↗</a></div>' +
                f'<small class="result-hash">SHA-256 · {hashlib.sha256(source.read_bytes()).hexdigest()[:12]}</small></article>')
        grouped[row['group']].append(card)
    sections = []
    for group in config['groups']:
        if group['id'] not in grouped:
            raise ValueError('Empty results group')
        sections.append(f'<section class="result-group" data-group="{escape(group["id"])}">' +
                        translated('h2', group['title']) + translated('p', group['note'], ' class="group-note"') +
                        '<div class="result-grid">' + '\n'.join(grouped.pop(group['id'])) + '</div></section>')
    if grouped:
        raise ValueError('Unknown results group')
    options = {}
    for field, values in ui.items():
        options[field] = ''.join(translated('option', label, f' value="{escape(key)}"')
                                for key, label in values.items())
    # Additional published controls are discoverable without pretending they are
    # new independent benchmark rows or recomputing any historical study.
    archive = []
    for path in sorted([*(root / 'docs/zh-TW').glob('tracking-*.md'), root / 'docs/zh-TW/offline-video-tracking.md']):
        relative = path.relative_to(root).as_posix()
        english = 'docs/en/' + path.name
        if relative not in approved or english not in approved:
            continue
        zh = path.read_text(encoding='utf-8').splitlines()[0].lstrip('# ')
        en = (root / english).read_text(encoding='utf-8').splitlines()[0].lstrip('# ')
        archive.append(f'<li><a href="{GITHUB+english}" data-report-en="{GITHUB+english}" '
                       f'data-report-zh="{GITHUB+relative}" data-en="{escape(en, quote=True)}" '
                       f'data-zh="{escape(zh, quote=True)}">{escape(en)}</a></li>')
    html = (root / 'website/results/index.html').read_text(encoding='utf-8')
    html = html.replace('<!--RESULTS_ROWS-->', '\n'.join(sections)).replace('<!--RESEARCH_LINKS-->', ''.join(archive))
    html = html.replace('{{RESULTS_COUNT}}', str(len(seen))).replace('{{UPDATED}}', escape(config['updated']))
    for field, content in options.items():
        html = html.replace('<!--OPTIONS_'+field.upper()+'-->', content)
    return html
