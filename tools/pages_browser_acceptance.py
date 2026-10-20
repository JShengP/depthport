#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Opt-in saved-data UI acceptance; never part of application/model CI.

Install requirements-browser-tests.txt in a separate environment. Supply actual
vendor browser/driver executables; no download, profile reuse, inference, GT,
network interception, API substitution or application-state injection occurs.
Each invocation creates a new output directory; raw diagnostics stay local.
Passing automated checks requires separate screenshot review under the frozen
protocol. B08 remains not_run unless a natural unsupported path is exercised.
"""
import argparse
import array
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import re
import statistics
import sys
import time
import traceback
import urllib.request

from PIL import Image, ImageChops
from selenium import webdriver
from selenium.webdriver import ActionChains
from selenium.webdriver.common.actions.wheel_input import ScrollOrigin
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import Select, WebDriverWait

ROOT = Path(__file__).resolve().parents[1]
ENGINES = ['yolo26', 'da2-small', 'da3-small', 'da3-metric']
NUMBER = r'[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?'


def read_json(path):
    return json.loads(Path(path).read_text())


def floats(encoded):
    raw = gzip.decompress(base64.b64decode(encoded['data']))
    assert hashlib.sha256(raw).hexdigest() == encoded['sha256']
    out = array.array('f')
    out.frombytes(raw)
    if sys.byteorder != 'little':
        out.byteswap()
    assert len(out) == math.prod(encoded['shape'])
    return out


def close(actual, expected):
    error = abs(actual - expected)
    assert error <= max(5e-6, abs(expected) * 5e-7), (actual, expected, error)
    return error


class Oracle:
    """Independent Float32/K and RLE/box mapping, not browser sample()."""
    def __init__(self):
        self.models = {}
        self.semantic = read_json(ROOT / 'website/data/bus/semantic.json')
        for name in ENGINES:
            data = read_json(ROOT / f'website/data/bus/{name}.json')
            data['final_values'] = floats(data['depth'])
            data['raw_values'] = (data['final_values'] if data['raw_depth'] == 'depth'
                                  else floats(data['raw_depth']))
            self.models[name] = data
        self.frames = read_json(ROOT / 'website/data/tracking/frames.json')
        self.tracks = read_json(ROOT / 'website/data/tracking/tracks.json')

    def query(self, name, source_u, source_v):
        d = self.models[name]
        x = min(d['width'] - 1, math.floor((source_u + .5) * d['width'] / 810))
        y = min(d['height'] - 1, math.floor((source_v + .5) * d['height'] / 1080))
        i = y * d['width'] + x
        z, k = d['final_values'][i], d['intrinsics']
        return x, y, [d['raw_values'][i], z,
                      (x-k['cx'])*z/k['fx'], (y-k['cy'])*z/k['fy'], z]

    def bus(self, name, mode):
        d, sem = self.models[name], self.semantic[mode]
        ob = next(o for o in sem['objects'] if o['label'] == 'bus')
        mask = bytearray(sem['width'] * sem['height'])
        if mode == 'segment':
            for a, b in ob['runs']:
                mask[a:b] = b'\1' * (b-a)
        zs = []
        for v in range(d['height']):
            y = min(sem['height']-1, math.floor((v+.5)*sem['height']/d['height']))
            for u in range(d['width']):
                x = min(sem['width']-1, math.floor((u+.5)*sem['width']/d['width']))
                wanted = (mask[y*sem['width']+x] if mode == 'segment' else
                          ob['bbox'][0] <= x < ob['bbox'][2] and
                          ob['bbox'][1] <= y < ob['bbox'][3])
                z = d['final_values'][v*d['width']+u]
                if wanted and math.isfinite(z) and z > 0:
                    zs.append(z)
        return {'index': sem['objects'].index(ob), 'count': len(zs),
                'median': statistics.median(zs), 'confidence': ob['confidence']}


def asset_integrity(base):
    paths = [('website/index.html', 'index.html')]
    paths += [(f'website/v0.{v}/index.html', f'v0.{v}/index.html') for v in (1, 2, 3)]
    paths += [(str(p.relative_to(ROOT)), 'data/'+str(p.relative_to(ROOT/'website/data')))
              for p in (ROOT/'website/data').rglob('*') if p.is_file()]
    paths += [('website/'+p, 'assets/'+p) for p in
              ['real-results.js', 'real-results.css', 'showcase.js', 'showcase.css',
               'recorded-examples.js', 'recorded-examples.css']]
    paths += [('static/viewer.js', 'static/viewer.js')]
    paths += [(x['path'], 'media/'+Path(x['path']).name) for x in
              read_json(ROOT/'docs/validation/readme-real-pages.json')['images']]

    def check(pair):
        local, public = pair
        blob = urllib.request.urlopen(base+public, timeout=45).read()
        return {'path': public, 'sha256': hashlib.sha256(blob).hexdigest(),
                'bytes': len(blob), 'matches': blob == (ROOT/local).read_bytes()}
    with ThreadPoolExecutor(4) as pool:
        return list(pool.map(check, paths))


class Study:
    def __init__(self, args):
        self.args, self.out = args, Path(args.output).resolve()
        self.out.mkdir(parents=True, exist_ok=False)
        self.events, self.checks, self.cases, self.screens = [], [], {}, []
        self.driver = None
        self.oracle = Oracle()

    def launch(self):
        from selenium.webdriver.chrome.service import Service as ChromeService
        from selenium.webdriver.edge.service import Service as EdgeService
        from selenium.webdriver.firefox.service import Service as FirefoxService
        name = self.args.browser
        options = {'chrome': webdriver.ChromeOptions, 'edge': webdriver.EdgeOptions,
                   'firefox': webdriver.FirefoxOptions}[name]()
        options.binary_location = str(Path(self.args.binary).resolve())
        options.set_capability('webSocketUrl', True)
        options.accept_insecure_certs = False
        options.add_argument('-headless' if name == 'firefox' else '--headless=new')
        if name != 'firefox':
            options.add_argument('--window-size=1280,900')
        service = {'chrome': ChromeService, 'edge': EdgeService,
                   'firefox': FirefoxService}[name](str(Path(self.args.driver).resolve()),
                                                   log_output=str(self.out/'driver.log'))
        self.driver = getattr(webdriver, name.capitalize())(options=options, service=service)
        self.driver.script.add_console_handler(lambda e: self.event('console', e))
        self.driver.script.add_error_handler(lambda e: self.event('javascript', e))
        self.driver.set_page_load_timeout(60)
        self.viewport(1280, 900)
        caps = self.driver.capabilities
        self.environment = {'version':caps['browserVersion'],
            'driver':caps.get('chrome',{}).get('chromedriverVersion') or
                     caps.get('msedge',{}).get('msedgedriverVersion') or caps.get('moz:geckodriverVersion'),
            'headless':True, 'platform':caps['platformName']}

    def event(self, kind, event):
        self.events.append({'kind': kind, 'data': getattr(event, '__dict__', str(event))})

    def viewport(self, width, height):
        self.driver.browsing_context.set_viewport(context=self.driver.current_window_handle,
            viewport={'width': width, 'height': height}, device_pixel_ratio=1)
        assert self.driver.execute_script('return [innerWidth,innerHeight]') == [width, height]

    def el(self, selector):
        return self.driver.find_element(By.CSS_SELECTOR, selector)

    def text(self, selector):
        return self.el(selector).text

    def wait(self, fn):
        return WebDriverWait(self.driver, 45).until(lambda _: fn())

    def paint(self):
        self.driver.execute_async_script('const done=arguments[0];requestAnimationFrame(()=>requestAnimationFrame(done));')
        time.sleep(.12)

    def scroll(self, element):
        # Explicit instant UI scrolling avoids sampling midway through the
        # page's CSS smooth-scroll animation. No style or browser flag changes.
        self.driver.execute_script('arguments[0].scrollIntoView({block:"center",behavior:"instant"})',element)
        self.paint()

    def click(self, selector):
        element = self.el(selector)
        self.scroll(element)
        element.click()
        self.paint()

    def goto(self, version='', lang='en'):
        self.driver.get(self.args.url.rstrip('/')+'/'+version+'?lang='+lang)
        self.wait(lambda: self.driver.execute_script('return document.readyState') == 'complete')
        if version in ['v0.1/', 'v0.2/']:
            self.wait(lambda: self.el('#realEngine').is_enabled() and
                      'CUDA' in self.text('#realBusStatus'))
        if version == 'v0.3/':
            self.wait(lambda: '209' in self.text('#realReplayStatus'))
        self.paint()
        assert not self.driver.find_elements(By.CSS_SELECTOR, '[role=alert]')

    def select(self, selector, value):
        self.scroll(self.el(selector))
        Select(self.el(selector)).select_by_value(str(value))
        if selector == '#realEngine':
            self.wait(lambda: self.el(selector).is_enabled() and
                      self.oracle.models[value]['model'] in self.text('#realBusStatus'))
        self.paint()

    def shot(self, name, selector):
        element = self.el(selector)
        self.scroll(element)
        self.paint()
        # Use the native viewport screenshot, avoiding Chromium's separate
        # element-capture/repaint path. Save original PNG bytes unchanged.
        raw = self.driver.get_screenshot_as_png()
        path = self.out/(name+'.png')
        path.write_bytes(raw)
        self.screens.append({'file': path.name, 'sha256': hashlib.sha256(raw).hexdigest(),
                             'bytes': len(raw)})
        image = Image.open(io.BytesIO(raw)).convert('RGB')
        rect = self.driver.execute_script('const r=arguments[0].getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]',element)
        # In-memory region only for pixel statistics; no edited image published.
        return image.crop((max(0,round(rect[0])),max(0,round(rect[1])),
                           min(image.width,round(rect[2])),min(image.height,round(rect[3]))))

    def check(self, case, label, fn):
        item = {'case': case, 'label': label}
        try:
            detail = fn()
            item.update(status='pass', detail=detail)
        except Exception as error:
            item.update(status='fail', error=type(error).__name__, message=str(error))
            (self.out/(f'error-{len(self.checks):03d}.txt')).write_text(traceback.format_exc())
        self.checks.append(item)
        (self.out/'progress.json').write_text(json.dumps(self.checks, indent=2, default=str))
        print(case, label, item['status'], flush=True)

    def loads(self):
        for route in ['', 'v0.1/', 'v0.2/', 'v0.3/']:
            self.goto(route)
            images = self.driver.execute_script('return Array.from(document.images).filter(i=>i.getBoundingClientRect().width>0).map(i=>({src:i.currentSrc,ok:i.complete&&i.naturalWidth>0}))')
            # Lazy images are first brought into view natively by WebDriver screenshot.
            for image in self.driver.find_elements(By.CSS_SELECTOR, 'img'):
                if image.is_displayed():
                    self.scroll(image)
                    self.wait(lambda: self.driver.execute_script('return arguments[0].complete&&arguments[0].naturalWidth>0', image))
            assert self.driver.title.startswith('DepthPort')
        assets = asset_integrity(self.args.url.rstrip('/')+'/')
        (self.out/'assets.json').write_text(json.dumps(assets, indent=2))
        assert all(a['matches'] for a in assets)
        return {'public_files': len(assets)}

    def cloud(self, version, engine):
        self.goto(version)
        self.select('#realEngine', engine)
        canvas = self.el('#realCloud')
        self.scroll(canvas)
        prefix = version.strip('/')+'-'+engine
        before = self.shot(prefix+'-cloud', '#realCloud')
        colors = before.get_flattened_data()
        visible = sum(1 for r, g, b in colors if max(r,g,b)-min(r,g,b)>35 and max(r,g,b)>60)
        assert visible > 1000, visible
        differences = {}
        actions = {
            'orbit': lambda: ActionChains(self.driver).move_to_element(canvas).click_and_hold().move_by_offset(65,25).release().perform(),
            'zoom': lambda: ActionChains(self.driver).scroll_from_origin(ScrollOrigin.from_element(canvas),0,-180).perform(),
            'pan': lambda: ActionChains(self.driver).key_down(Keys.SHIFT).move_to_element(canvas).click_and_hold().move_by_offset(55,20).release().key_up(Keys.SHIFT).perform(),
            'size': lambda: self.el('#realPointSize').send_keys(Keys.END),
            'color': lambda: self.select('#realColor', 'depth'),
        }
        for action, invoke in actions.items():
            invoke()
            after = self.shot(prefix+'-'+action, '#realCloud')
            changed = sum(1 for px in ImageChops.difference(before, after).get_flattened_data() if max(px)>8)
            assert changed > 100, (action, changed)
            differences[action] = changed
            self.click('#realHome')
            self.el('#realPointSize').send_keys(Keys.HOME, Keys.ARROW_RIGHT, Keys.ARROW_RIGHT)
            self.select('#realColor', 'rgb')
            restored = self.shot(prefix+'-reset-'+action, '#realCloud')
            # Native render equality within the same session, not a cross-engine hash.
            assert ImageChops.difference(before, restored).getbbox() is None, action
        return {'visible_pixels': visible, 'changed_pixels': differences, 'reset': 'equal'}

    def query(self, engine):
        self.goto('v0.2/')
        self.select('#realEngine', engine)
        errors, samples = [], []
        for selector in ['#realRGB', '#realDepth']:
            canvas = self.el(selector)
            self.scroll(canvas)
            for edge in [False, True]:
                # Map selection scrolls to its toolbar; re-position before
                # every native canvas click, including the edge sample.
                self.scroll(canvas)
                actions = ActionChains(self.driver).move_to_element(canvas)
                if edge:
                    rect = self.driver.execute_script('const r=arguments[0].getBoundingClientRect();return {w:r.width,h:r.height}', canvas)
                    actions.move_by_offset(int(rect['w']*.39), int(rect['h']*.39))
                actions.click().perform()
                pixel = [int(n) for n in re.findall(r'\d+', self.text('#realPixel'))]
                assert len(pixel) == 4
                x, y, expected = self.oracle.query(engine, *pixel[:2])
                assert pixel[2:] == [x, y]
                def values():
                    return [float(re.search(NUMBER, self.text('#realNative')).group()),
                            float(re.search(NUMBER, self.text('#realZ')).group()),
                            *map(float, self.text('#realXYZ').split(','))]
                initial = values()
                errors.extend(close(a,b) for a,b in zip(initial,expected, strict=True))
                for mode in ['final', 'raw']:
                    self.select('#realMapKind', mode)
                    assert values() == initial
                assert ('virtual' in self.text('#realZ') if engine == 'da2-small' else
                        self.oracle.models[engine]['units'] in self.text('#realZ'))
                samples.append({'source': pixel[:2], 'aligned': [x,y]})
        self.shot(engine+'-query', '#realBus')
        return {'samples': samples, 'maximum_error': max(errors)}

    def semantic(self, engine):
        self.goto('v0.2/')
        self.select('#realEngine', engine)
        full = self.shot(engine+'-full', '#realCloud')
        results = []
        for mode in ['segment', 'detect']:
            expected = self.oracle.bus(engine, mode)
            self.select('#realSemanticMode', mode)
            self.select('#realObject', expected['index'])
            text = self.text('#realObjectStats')
            parts = text.split(' · ')
            confidence = float(parts[1])
            count = int(re.search(r'\d+', parts[2]).group())
            median = float(re.search('median Z ('+NUMBER+')', text).group(1))
            assert count == expected['count'], (count, expected)
            assert abs(confidence-expected['confidence']) <= .00005
            error = close(median, expected['median'])
            self.shot(engine+'-'+mode+'-overlay', '#realRGB')
            subset = self.shot(engine+'-'+mode+'-cloud', '#realCloud')
            assert ImageChops.difference(full, subset).getbbox()
            self.select('#realObject', '-1')
            restored = self.shot(engine+'-'+mode+'-all', '#realCloud')
            assert ImageChops.difference(full, restored).getbbox() is None
            results.append({'mode': mode, 'count': count, 'median_error': error})
        return results

    def seek(self, index):
        slider = self.el('#realReplaySlider')
        self.scroll(slider)
        slider.send_keys(Keys.HOME, *([Keys.ARROW_RIGHT]*(index-1)))
        self.wait(lambda: self.text('#realReplayPosition').startswith(str(index)+'/24'))
        self.paint()

    def replay(self):
        self.goto('v0.3/')
        self.select('#realTrack', 'obj-0005')
        states = []
        for index in [1,6,7,12,19,20,24]:
            self.seek(index)
            f = self.oracle.frames[index-1]
            position = self.text('#realReplayPosition')
            assert 'source '+str(f['source_frame']) in position
            assert abs(float(position.split(' · ')[-1].split()[0])-f['timestamp']) <= .50001e-6
            detail = self.text('#realTrackDetail')
            observation = next((o for o in self.oracle.tracks['obj-0005'] if o['index']==index), None)
            if observation:
                values = [float(x) for x in re.findall(NUMBER, detail.split(' · Z ')[1])]
                expected = [observation['depth_median'], *observation['xyz_camera_median']]
                for a,b in zip(values, expected, strict=True):
                    close(a,b)
            else:
                assert detail.endswith('Z — · Camera XYZ —') and ' no ' in detail
            assert self.el('#realReplayPrev').is_enabled() == (index != 1)
            assert self.el('#realReplayNext').is_enabled() == (index != 24)
            states.append({'frame': index, 'observed': bool(observation)})
            if index == 12:
                self.shot('gap-history', '#realHistory')
                self.shot('gap-replay', '#realReplay')
        observed = [int(b.text[1:]) for b in self.driver.find_elements(By.CSS_SELECTOR,'#realObserved button')]
        assert observed == list(range(1,7))+list(range(20,25))
        advancement = []
        for speed in ['0.5','1','2']:
            self.seek(1)
            self.select('#realReplaySpeed', speed)
            self.click('#realReplayPlay')
            self.wait(lambda: int(self.el('#realReplaySlider').get_attribute('value')) >= 2)
            self.click('#realReplayPlay')
            paused = self.el('#realReplaySlider').get_attribute('value')
            time.sleep(.6)
            assert self.el('#realReplaySlider').get_attribute('value') == paused
            advancement.append({'speed': speed, 'paused_frame': int(paused)})
        self.seek(23)
        self.click('#realReplayPlay')
        self.wait(lambda: self.el('#realReplaySlider').get_attribute('value') == '24' and 'Play' in self.text('#realReplayPlay'))
        self.click('#realReplayPrev')
        assert self.el('#realReplaySlider').get_attribute('value') == '23'
        self.click('#realReplayNext')
        assert self.el('#realReplaySlider').get_attribute('value') == '24'
        return {'states': states, 'observed_buttons': observed, 'playback': advancement, 'end': 'stopped'}

    def responsive(self, width, height, route):
        self.viewport(width, height)
        self.goto(route)
        layouts = []
        for lang in ['en', 'zh-TW']:
            if lang == 'zh-TW':
                self.click('[data-lang-switch]')
                if route in ['v0.1/','v0.2/']:
                    assert self.el('#realObject').get_attribute('value') == '1'
                elif route == 'v0.3/':
                    assert self.el('#realTrack').get_attribute('value') == 'obj-0005'
                    assert self.el('#realReplaySlider').get_attribute('value') == '12'
            assert self.driver.execute_script('return document.documentElement.lang') == ('en' if lang == 'en' else 'zh-Hant')
            overflow = self.driver.execute_script('return document.documentElement.scrollWidth-innerWidth')
            assert overflow <= 1, overflow
            selector = ('header nav[aria-label="Version navigation"] a' if route else '.version-card .card-link')
            links = self.driver.find_elements(By.CSS_SELECTOR, selector)
            assert len(links) == 3
            for link in links:
                assert link.is_displayed(), link.get_attribute('href')
                rect = self.driver.execute_script('const r=arguments[0].getBoundingClientRect();return [r.left,r.right]',link)
                assert rect[0] >= -1 and rect[1] <= width+1, rect
                if re.search(r'/v0\.[123]/',link.get_attribute('href')):
                    assert 'lang='+lang in link.get_attribute('href')
            if not route:
                for img in self.driver.find_elements(By.CSS_SELECTOR,'.version-card img'):
                    self.scroll(img)
                    self.wait(lambda: self.driver.execute_script('return arguments[0].complete&&arguments[0].naturalWidth>0',img))
                    assert ('.zh-TW.' if lang == 'zh-TW' else '.en.') in img.get_attribute('src')
            elif route in ['v0.1/', 'v0.2/']:
                self.select('#realObject', '1')
                assert 'bus' in self.text('#realObjectStats')
                for control in ['#realEngine','#realObject','#realHome','#realPointSize','#realColor']:
                    el = self.el(control)
                    assert el.is_displayed() and el.is_enabled()
                    self.scroll(el)
                    rect = self.driver.execute_script('const r=arguments[0].getBoundingClientRect();return [r.left,r.right]',el)
                    assert rect[0] >= -1 and rect[1] <= width+1
            else:
                self.select('#realTrack','obj-0005')
                self.seek(12)
                assert self.el('#realTrack').get_attribute('value') == 'obj-0005'
                assert ('no' if lang=='en' else '否') in self.text('#realTrackDetail')
                assert self.text('#realTrackDetail').endswith('Z — · Camera XYZ —')
            if width == 390:
                prefix=(route.strip('/') or 'home')+'-'+lang+'-mobile'
                self.shot(prefix+'-header', 'header')
                self.shot(prefix, '#realCloud' if route in ['v0.1/','v0.2/'] else '#realHistory' if route else 'main')
            layouts.append({'lang': lang, 'overflow': overflow})
        # Actual native link navigation, not only href inspection.
        if route:
            for destination in [v for v in ['v0.1','v0.2','v0.3'] if v+'/' != route]:
                link = next(a for a in self.driver.find_elements(By.CSS_SELECTOR,selector) if destination+'/' in a.get_attribute('href'))
                self.scroll(link)
                link.click()
                self.wait(lambda: destination+'/' in self.driver.current_url)
                assert 'DepthPort '+destination+' ' in self.driver.title
                self.goto(route, 'zh-TW')
        return {'viewport': [width,height], 'layouts': layouts}

    def boundaries(self):
        texts = []
        for route in ['', 'v0.1/', 'v0.2/', 'v0.3/']:
            self.goto(route)
            text = self.text('body')
            texts.append(text)
            if route:
                assert 'DepthPort '+route.strip('/')+' ' in self.driver.title
            if route in ['v0.1/', 'v0.2/']:
                assert '65' in text and 'calibration' in text and 'No inference' in text
            if route == 'v0.2/':
                assert 'use the real inspector above' in self.text('#recordedBusCoords')
                assert 'unpublished' not in self.text('#recordedBusCoords')
        combined = '\n'.join(texts)
        for number in ['209','152','57','230','125','105']:
            assert number in combined
        assert 'NEW' in combined and 'historical' in combined.lower()
        return {'new': [9,209,152,57], 'historical': [7,230,125,105], 'limits': 'visible'}

    def run(self):
        fatal = None
        try:
            (self.out/'harness.py').write_bytes(Path(__file__).read_bytes())
            self.launch()
            selected = self.args.cases.split(',')
            if 'B01' in selected:
                self.check('B01','routes-and-byte-integrity', self.loads)
            if 'B02' in selected:
                for version in ['v0.1/','v0.2/']:
                    for engine in ENGINES:
                        self.check('B02',version+engine,lambda v=version,e=engine:self.cloud(v,e))
            for engine in ENGINES:
                if 'B03' in selected:
                    self.check('B03',engine,lambda e=engine:self.query(e))
                if 'B04' in selected:
                    self.check('B04',engine,lambda e=engine:self.semantic(e))
            if 'B05' in selected:
                self.check('B05','replay-gaps-and-speeds',self.replay)
            if 'B06' in selected:
                for width,height in [(1280,900),(390,844)]:
                    for route in ['', 'v0.1/','v0.2/','v0.3/']:
                        self.check('B06',f'{width}/'+(route or 'home'),lambda w=width,h=height,r=route:self.responsive(w,h,r))
            self.viewport(1280,900)
            if 'B07' in selected:
                self.check('B07','navigation-and-boundaries',self.boundaries)
            self.check('B01','passive-page-errors',self.page_errors)
            for case in ['B01','B02','B03','B04','B05','B06','B07']:
                group = [c for c in self.checks if c['case']==case]
                self.cases[case] = ('not_run' if case not in selected else
                    'fail' if any(c['status']=='fail' for c in group) else 'pass')
            self.cases['B08'] = 'not_run'
        except BaseException as error:
            fatal = {'type':type(error).__name__, 'message':str(error)}
            (self.out/'fatal.txt').write_text(traceback.format_exc())
            raise
        finally:
            if self.driver:
                self.driver.quit()
            if not self.cases:
                self.cases = {c: 'blocked' for c in ['B01','B02','B03','B04','B05','B06','B07','B08']}
            result = {'format':'depthport.pages-webdriver-raw.v1',
                      'time':datetime.now(timezone.utc).isoformat(), 'browser':self.args.browser,
                      'environment':getattr(self,'environment',{}),
                      'harness_sha256':hashlib.sha256((self.out/'harness.py').read_bytes()).hexdigest(),
                      'cases':self.cases,'checks':self.checks,'screenshots':self.screens,
                      'events':self.events,'visual_review':'pending','fatal':fatal}
            (self.out/'result.json').write_text(json.dumps(result,indent=2,default=str))
            print('RESULT',self.args.browser,self.cases,flush=True)

    def page_errors(self):
        errors = [event for event in self.events if event['kind']=='javascript' or
                  (isinstance(event['data'],dict) and event['data'].get('level')=='error')]
        assert not errors, errors
        return {'page_errors':len(errors),'other_events':len(self.events)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', required=True, choices=['chrome','edge','firefox'])
    parser.add_argument('--binary', required=True)
    parser.add_argument('--driver', required=True)
    parser.add_argument('--output', required=True, help='New local-only directory; refuses overwrite')
    parser.add_argument('--url', default='https://jshengp.github.io/depthport/')
    parser.add_argument('--cases', default='B01,B02,B03,B04,B05,B06,B07,B08',
                        help='Comma-separated frozen case IDs; omitted cases remain not_run')
    Study(parser.parse_args()).run()
