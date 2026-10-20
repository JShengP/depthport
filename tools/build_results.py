# SPDX-License-Identifier: AGPL-3.0-only
"""Render the reviewed results index from public, dated evidence; no inference."""
from __future__ import annotations
from collections import defaultdict
import hashlib
from html import escape
import json
import math
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


# Fixed plot order is evidence order, never a score-based ranking.
CHART_METRICS = ('HOTA', 'IDSW', 'CLR_FN', 'CLR_FP')
CHART_LABELS = {'HOTA':'HOTA', 'IDSW':'IDSW', 'CLR_FN':'FN', 'CLR_FP':'FP'}


def comparison_series(root, spec, records, approved):
    """Reject cross-cohort/profile data and missing values rather than plotting 0."""
    if spec['source'] not in approved:
        raise ValueError('Comparison source is not public')
    document = json.loads((root / spec['source']).read_text(encoding='utf-8'))
    series, seen = [], set()
    if len(spec['members']) < 2:
        raise ValueError('A comparison needs at least two recorded members')
    for member in spec['members']:
        row = records[member['record']]
        if (row['id'] in seen or row['group'] != spec['group'] or
                row['source'] != spec['source'] or row['kind'] != 'tracking' or
                len(row['trackers']) != 1 or row['trackers'][0] not in {'baseline', 'bytetrack', 'botsort'}):
            raise ValueError('Comparison members must share a source and cohort')
        seen.add(row['id'])
        values = {}
        for key in CHART_METRICS:
            expected = spec['score_root'] + '/' + member['arm'] + '/' + key
            matches = [m for m in row['metrics'] if m['pointer'] == expected]
            if len(matches) != 1:
                raise ValueError('Comparison metric is missing or from a different arm')
            value = pointer(document, expected)
            if isinstance(value, str) or not math.isfinite(value) or value < 0:
                raise ValueError('Invalid comparison value')
            if key == 'HOTA' and value > 1:
                raise ValueError('HOTA must be a fraction in [0,1]')
            if key != 'HOTA' and int(value) != value:
                raise ValueError('Error counts must be integers')
            values[key] = value
        series.append((row, values))
    return document, series


def count_axis_maximum(values):
    maximum = max(values)
    if maximum == 0:
        return 1
    magnitude = 10 ** math.floor(math.log10(maximum))
    return int(math.ceil(maximum / magnitude) * magnitude)


def render_comparison(root, spec, records, approved):
    document, series = comparison_series(root, spec, records, approved)
    identity = 'comparison-' + spec['id']
    frames = sum(s['frames'] for s in document['sequences'])
    sequences = ' / '.join(s['name'] for s in document['sequences'])
    detector = document['frozen_detector']
    conditions = (f"{detector['model']} {detector['ultralytics']} · {detector['device'].upper()} · imgsz {detector['imgsz']} · "
                  f"confidence {detector['confidence']} · NMS IoU {detector['nms_iou']} · "
                  f"max_det {detector['max_det']} · classes {detector['classes']} · trackers {document['runtime']['trackers']}")
    figures = []
    for key in CHART_METRICS:
        values = [v[key] * 100 if key == 'HOTA' else v[key] for _, v in series]
        upper = 100 if key == 'HOTA' else count_axis_maximum(values)
        ticks = [0, 50, 100] if key == 'HOTA' else ([0, upper // 2, upper] if upper % 2 == 0 else [0, upper])
        title = CHART_LABELS[key]
        direction = {'en':'Higher is better (%)', 'zh':'越高越好（%）'} if key == 'HOTA' else {'en':'Lower is better (count)', 'zh':'越低越好（次數）'}
        bars = []
        for (row, _), value in zip(series, values):
            label = {'en':'ByteTrack', 'zh':'ByteTrack'} if row['trackers'] == ['bytetrack'] else {'en':'BoT-SORT (no ReID)', 'zh':'BoT-SORT（無 ReID）'} if row['trackers'] == ['botsort'] else {'en':'Baseline IoU', 'zh':'Baseline IoU'}
            tracker = row['trackers'][0]
            display = f'{value:.2f}%' if key == 'HOTA' else f'{value:,}'
            bars.append(f'<li class="comparison-row tracker-{escape(tracker)}" data-comparison-member="{escape(row["id"])}" data-value="{value}">' +
                        f'<a href="#result-{escape(row["id"])}">' + translated('span', label, ' class="comparison-label"') +
                        f'<strong>{display}</strong><span class="comparison-track" aria-hidden="true"><i style="width:{value / upper * 100:.8f}%"></i></span></a></li>')
        axis = ''.join('<span>' + (f'{t}%' if key == 'HOTA' else f'{t:,}') + '</span>' for t in ticks)
        figures.append(f'<figure class="comparison-metric" data-metric="{key}" data-axis-max="{upper}" aria-labelledby="{identity}-{key}">' +
                       f'<figcaption id="{identity}-{key}"><strong>{title}</strong>' + translated('span', direction) + '</figcaption>' +
                       '<div class="comparison-axis" aria-hidden="true">' + axis + '</div><ul>' + ''.join(bars) + '</ul></figure>')
    report = series[0][0]['report']
    link = (f'<a href="{GITHUB+report["en"]}" data-report-en="{GITHUB+report["en"]}" data-report-zh="{GITHUB+report["zh"]}" '
            'data-en="Full conditions &amp; evidence ↗" data-zh="完整條件與證據 ↗">Full conditions &amp; evidence ↗</a>')
    return (f'<section class="comparison" id="{identity}" data-comparison="{escape(spec["id"])}" data-members="{escape(" ".join(r["id"] for r, _ in series))}" aria-labelledby="{identity}-title">' +
            translated('h3', spec['title'], f' id="{identity}-title"') +
            translated('p', {'en':f'{sequences} · {frames:,} frames · {document["checked_on"]}', 'zh':f'{sequences} · {frames:,} 格 · {document["checked_on"]}'}, ' class="comparison-conditions"') +
            '<p class="comparison-conditions">' + escape(conditions) + '</p>' + translated('p', spec['note'], ' class="comparison-conditions"') +
            '<p class="comparison-visible" role="status" aria-live="polite"></p>' +
            '<div class="comparison-plots">' + ''.join(figures) + '</div>' +
            translated('p', {'en':'Each axis starts at zero; HOTA uses 0–100%. Error-count scales are fixed for this full cohort and stay unchanged when filtering. Bar order follows the records, not scores. No cross-cohort ranking.', 'zh':'各軸從零開始，HOTA 固定 0–100%；錯誤計數比例尺以本場景組完整資料固定，篩選不重算。長條依紀錄順序排列，不按分數排序，不跨組排名。'}, ' class="comparison-note"') +
            translated('p', {'en':'Compressed training clips, no official leaderboard claim. Lower IDSW may accompany more FN/FP. Long-occlusion recovery and general identity stability remain unaccepted.', 'zh':'使用壓縮訓練影片，不作官方排行榜宣稱；較少換 ID 可能伴隨更多漏追／誤報，長遮擋恢復與泛化身分穩定性仍未驗收。'}, ' class="comparison-note"') + link + '</section>')


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
        card = (f'<article class="result-card" id="result-{escape(row["id"])}" {attr}>'
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
    comparisons = defaultdict(list)
    records = {row['id']: row for row in config['records']}
    comparison_ids = set()
    for spec in config.get('comparisons', []):
        if spec['id'] in comparison_ids:
            raise ValueError('Duplicate comparison ID')
        comparison_ids.add(spec['id'])
        comparisons[spec['group']].append(render_comparison(root, spec, records, approved))
    sections = []
    for group in config['groups']:
        if group['id'] not in grouped:
            raise ValueError('Empty results group')
        sections.append(f'<section class="result-group" data-group="{escape(group["id"])}">' +
                        translated('h2', group['title']) + translated('p', group['note'], ' class="group-note"') +
                        ''.join(comparisons.pop(group['id'], [])) +
                        '<div class="result-grid">' + '\n'.join(grouped.pop(group['id'])) + '</div></section>')
    if grouped or comparisons:
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
