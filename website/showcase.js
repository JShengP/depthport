/* SPDX-License-Identifier: AGPL-3.0-only */
/* Static showcase language controls and clearly separate synthetic exercises.
 * Saved inference widgets are handled by real-results.js. */
(() => {
  'use strict';
  const q = (s) => document.querySelector(s);
  const page = document.body?.dataset.showcase;
  const params = new URLSearchParams(location.search);
  let lang = params.get('lang') === 'zh-TW' ? 'zh-TW' : params.get('lang') === 'en' ? 'en' : null;
  if (!lang) {
    try { lang = localStorage.getItem('depthport.showcase.lang'); } catch (_) { /* storage may be blocked */ }
  }
  if (lang !== 'zh-TW' && lang !== 'en') lang = navigator.language?.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en';
  const chinese = () => lang === 'zh-TW';
  const tr = (en, zh) => chinese() ? zh : en;
  const fmt = (v) => Number(v).toFixed(3);
  let refreshPage = () => {};
  function setLanguage(next) {
    lang = next === 'zh-TW' ? 'zh-TW' : 'en';
    document.documentElement.lang = chinese() ? 'zh-Hant' : 'en';
    document.querySelectorAll('[data-en][data-zh]').forEach(node => {
      node.textContent = chinese() ? node.dataset.zh : node.dataset.en;
    });
    const toggle = q('[data-lang-switch]');
    if (toggle) toggle.textContent = chinese() ? 'English' : '繁體中文';
    try { localStorage.setItem('depthport.showcase.lang', lang); } catch (_) { /* disabled storage */ }
    document.querySelectorAll('a[href^="./v0."], a[href^="../v0."]').forEach(a => {
      if (!/^\.\.?\/v0\.[123]\/(?:\?.*)?$/.test(a.getAttribute('href'))) return;
      const path = a.getAttribute('href').split('?')[0];
      a.setAttribute('href', path + '?lang=' + lang);
    });
    document.querySelectorAll('img[data-src-en][data-src-zh]').forEach(img => {
      img.src = chinese() ? img.dataset.srcZh : img.dataset.srcEn;
      img.alt = chinese() ? img.dataset.altZh : img.dataset.altEn;
    });
    refreshPage();
    document.dispatchEvent(new Event('depthport:language'));
  }
  q('[data-lang-switch]')?.addEventListener('click', () => setLanguage(chinese() ? 'en' : 'zh-TW'));

  const W = 640, H = 360;
  const objAt = (u, v) => u >= 220 && u <= 335 && v >= 90 && v <= 285 ? 'A'
    : u >= 418 && u <= 513 && v >= 106 && v <= 270 ? 'B' : null;
  function virtualDepth(u, v) {
    const base = 2.05 + 1.1 * (u / (W - 1)) + .46 * (v / (H - 1)) + .12 * Math.sin(u / 47);
    const item = objAt(u, v);
    return item === 'A' ? 1.35 + .13 * Math.sin(v / 35) : item === 'B' ? 1.85 + .08 * Math.cos(u / 22) : base;
  }
  function rgbColor(u, v) {
    const obj = objAt(u, v);
    if (obj === 'A') return [52 + (v % 9), 183, 173];
    if (obj === 'B') return [221, 146, 100];
    if (v < 172) return [25 + Math.round(v / 10), 47 + Math.round(v / 8), 79 + Math.round(v / 5)];
    const d = Math.round((v - 172) / 12);
    return [46 + d, 70 + d, 86 + d];
  }
  function depthColor(value, stretch = 1) {
    const t = Math.max(0, Math.min(1, .5 + (2.65 - value) * .32 * stretch));
    return [Math.round(35 + 207 * t), Math.round(78 + 109 * (1 - Math.abs(t - .55))), Math.round(190 - 139 * t)];
  }
  function cross(ctx, x, y) {
    ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.shadowBlur = 6; ctx.shadowColor = '#09111c';
    ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11); ctx.stroke(); ctx.restore();
  }
  function setupSpatial() {
    const rgb = q('#rgbField'), depth = q('#depthField'), hist = q('#depthHistogram');
    if (!rgb || !depth || !hist) return;
    const rgbCtx = rgb.getContext('2d'), depthCtx = depth.getContext('2d'), hctx = hist.getContext('2d');
    if (!rgbCtx || !depthCtx || !hctx) return;
    let point = [320, 180], mask = false;
    const rgbPixels = rgbCtx.createImageData(W, H), depthPixels = depthCtx.createImageData(W, H);
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      const at = (v * W + u) * 4, color = rgbColor(u, v);
      for (let c = 0; c < 3; c++) rgbPixels.data[at + c] = color[c];
      rgbPixels.data[at + 3] = 255;
    }
    function redraw() {
      rgbCtx.putImageData(rgbPixels, 0, 0);
      for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
        const at = (v * W + u) * 4;
        const c = depthColor(virtualDepth(u, v));
        const inMask = mask && objAt(u, v);
        depthPixels.data[at] = inMask ? Math.min(255, c[0] + 35) : c[0];
        depthPixels.data[at + 1] = inMask ? Math.min(255, c[1] + 45) : c[1];
        depthPixels.data[at + 2] = inMask ? Math.min(255, c[2] + 20) : c[2];
        depthPixels.data[at + 3] = 255;
      }
      depthCtx.putImageData(depthPixels, 0, 0);
      if (mask) for (const ctx of [rgbCtx, depthCtx]) {
        ctx.save(); ctx.setLineDash([7, 4]); ctx.lineWidth = 2; ctx.strokeStyle = '#fff';
        ctx.strokeRect(220, 90, 115, 195); ctx.strokeRect(418, 106, 95, 164); ctx.restore();
      }
      cross(rgbCtx, ...point); cross(depthCtx, ...point);
      const [u, v] = point, z = virtualDepth(u, v), x = (u - 320) * z / 570, y = (v - 180) * z / 570;
      q('#pixelValue').textContent = '(' + u + ', ' + v + ')';
      q('#depthValue').textContent = fmt(z) + ' ' + tr('virtual', '虛擬');
      q('#xyzValue').textContent = [x, y, z].map(fmt).join(' / ');
      const obj = objAt(u, v);
      q('#semanticValue').textContent = obj ? tr('Synthetic object ', '合成物件 ') + obj : tr('Background', '背景');
      q('#maskToggle').setAttribute('aria-pressed', String(mask));
    }
    function pick(event) {
      const rect = event.currentTarget.getBoundingClientRect();
      const u = Math.max(0, Math.min(W - 1, Math.floor((event.clientX - rect.left) * W / rect.width)));
      const v = Math.max(0, Math.min(H - 1, Math.floor((event.clientY - rect.top) * H / rect.height)));
      point = [u, v]; redraw();
    }
    rgb.addEventListener('click', pick); depth.addEventListener('click', pick);
    q('#maskToggle').addEventListener('click', () => { mask = !mask; redraw(); });
    q('#spatialReset').addEventListener('click', () => { point = [320, 180]; mask = false; redraw(); });
    const bins = Array.from({ length: 30 }, () => 0);
    for (let v = 0; v < H; v += 5) for (let u = 0; u < W; u += 5) {
      const p = Math.min(29, Math.max(0, Math.floor((virtualDepth(u, v) - 1) * 8)));
      bins[p]++;
    }
    const max = Math.max(...bins), barWidth = hist.width / bins.length;
    hctx.fillStyle = '#071523'; hctx.fillRect(0, 0, hist.width, hist.height);
    bins.forEach((n, i) => {
      const h = n / max * (hist.height - 42);
      hctx.fillStyle = `hsl(${177 + i * 2},55%,${70 - i * .7}%)`;
      hctx.fillRect(i * barWidth + 2, hist.height - 20 - h, barWidth - 4, h);
    });
    hctx.fillStyle = '#a5c1ce'; hctx.font = '14px ui-monospace, monospace';
    hctx.fillText('1.0 ' + tr('virtual', '虛擬'), 8, hist.height - 3);
    hctx.fillText('4.5', hist.width - 43, hist.height - 3);
    try {
      const cloud = q('#syntheticCloud');
      const viewer = new window.CloudViewer(cloud);
      const col = 80, row = 45, coords = new Float32Array(col * row * 3), colors = new Uint8Array(col * row * 3);
      for (let v = 0; v < row; v++) for (let u = 0; u < col; u++) {
        const px = Math.round(u * (W - 1) / (col - 1)), py = Math.round(v * (H - 1) / (row - 1));
        const z = virtualDepth(px, py), j = (v * col + u) * 3, c = rgbColor(px, py);
        coords[j] = (px - 320) * z / 570; coords[j + 1] = -(py - 180) * z / 570; coords[j + 2] = -z;
        colors[j] = c[0]; colors[j + 1] = c[1]; colors[j + 2] = c[2];
      }
      viewer.setPoints(coords, colors, true);
    } catch (e) {
      const note = document.createElement('p'); note.className = 'micro-note';
      note.textContent = tr('3D renderer unavailable in this browser.', '此瀏覽器無法使用 3D 繪圖。');
      q('#syntheticCloud').insertAdjacentElement('afterend', note);
    }
    refreshPage = redraw;
    redraw();
  }

  const tracks = [
    { id: 'obj-0001', color: '#68e0c7', label: ['Walker A', '行人 A'], visible: n => n !== 11 && n !== 12,
      box: n => [95 + 19 * n, 150 + 9 * Math.sin(n / 3), 74, 205], z: n => 2.5 - .028 * n + .05 * Math.sin(n / 4) },
    { id: 'obj-0002', color: '#ffa76e', label: ['Walker B', '行人 B'], visible: n => n !== 15,
      box: n => [690 - 19 * n, 165 + 8 * Math.cos(n / 2), 80, 199], z: n => 2.0 + .038 * n + .04 * Math.cos(n / 4) },
    { id: 'obj-0003', color: '#90aaff', label: ['Late entry', '稍晚進入'], visible: n => n >= 15,
      box: n => [18 + (n - 15) * 10, 200, 61, 170], z: n => 3.2 - .045 * (n - 15) }
  ];
  function setupTracking() {
    const screen = q('#trackingCanvas'), history = q('#trackHistory');
    if (!screen || !history) return;
    const ctx = screen.getContext('2d'), hctx = history.getContext('2d');
    if (!ctx || !hctx) return;
    let frame = 0, selected = tracks[0], playing = false, lastTime = 0, raf = 0;
    const btns = q('#trackButtons');
    for (const item of tracks) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = item.id;
      button.setAttribute('aria-pressed', String(item === selected));
      button.addEventListener('click', () => { selected = item; render(); });
      btns.appendChild(button);
    }
    function drawPerson(x, y, w, h, color) {
      ctx.save(); ctx.globalAlpha = .90; ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(x + w * .5, y + h * .17, w * .19, h * .09, 0, 0, 2 * Math.PI); ctx.fill();
      ctx.fillRect(x + w * .30, y + h * .27, w * .40, h * .39);
      ctx.fillRect(x + w * .25, y + h * .66, w * .20, h * .34); ctx.fillRect(x + w * .55, y + h * .66, w * .20, h * .34);
      ctx.restore();
    }
    function scene() {
      const width = screen.width, height = screen.height;
      const sky = ctx.createLinearGradient(0, 0, 0, 420);
      sky.addColorStop(0, '#15314b'); sky.addColorStop(.62, '#36566c'); sky.addColorStop(1, '#263d44');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#243544'; ctx.fillRect(0, 130, 180, 220); ctx.fillRect(725, 100, 235, 260);
      ctx.fillStyle = '#395769'; for (let i = 0; i < 4; i++) { ctx.fillRect(27 + i * 42, 158, 19, 27); ctx.fillRect(770 + i * 48, 137, 23, 35); }
      ctx.fillStyle = '#587482'; ctx.fillRect(0, 351, width, 9);
      ctx.fillStyle = '#2c404c'; ctx.fillRect(0, 360, width, 180);
      ctx.strokeStyle = '#aec7c7'; ctx.lineWidth = 5;
      for (let i = 0; i < 8; i++) { const x = i * 135 + 25; ctx.beginPath(); ctx.moveTo(x, 416); ctx.lineTo(x + 69, 416); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(165,193,195,.28)'; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, 359 + i * 35); ctx.lineTo(width, 359 + i * 35); ctx.stroke(); }
      for (const item of tracks) {
        if (!item.visible(frame)) continue;
        const [x, y, w, h] = item.box(frame), dim = item === selected ? 1 : .38;
        drawPerson(x, y, w, h, item.color);
        ctx.lineWidth = item === selected ? 4 : 2; ctx.strokeStyle = item.color; ctx.globalAlpha = dim + .47;
        ctx.strokeRect(x, y, w, h); ctx.globalAlpha = 1;
        ctx.fillStyle = item.color; ctx.fillRect(x, y - 22, 102, 21);
        ctx.font = 'bold 14px ui-monospace, monospace';ctx.fillStyle = '#0b2532';ctx.fillText(item.id, x + 5, y - 6);
      }
      ctx.fillStyle = 'rgba(9,25,38,.78)';ctx.fillRect(15, 15, 183, 34);ctx.fillStyle = '#cfe9eb';
      ctx.font = 'bold 16px ui-monospace,monospace';ctx.fillText(`SYNTHETIC ${String(frame + 1).padStart(2,'0')} / 24`, 24, 38);
    }
    function chart() {
      const width = history.width, height = history.height;
      hctx.fillStyle = '#071523';hctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 5; i++) {
        const y = 26 + i * 47;
        hctx.strokeStyle = '#1f394e';hctx.lineWidth = 1;hctx.beginPath();hctx.moveTo(35, y);hctx.lineTo(width - 22, y);hctx.stroke();
        hctx.fillStyle = '#789cac';hctx.font = '11px ui-monospace,monospace';hctx.fillText((3.6 - i * .6).toFixed(1), 4, y + 4);
      }
      const px = n => 35 + n / 23 * (width - 56), py = z => 26 + (3.6 - z) / 2.4 * 188;
      hctx.lineWidth = 3;hctx.strokeStyle = selected.color;hctx.beginPath();let started = false;
      for (let n = 0; n < 24; n++) {
        if (!selected.visible(n)) { started = false; continue; }
        const x = px(n), y = py(selected.z(n));
        if (!started) hctx.moveTo(x,y); else hctx.lineTo(x,y);
        started = true;
      }
      hctx.stroke();
      hctx.strokeStyle = '#fff';hctx.lineWidth = 1;hctx.setLineDash([4,4]);
      hctx.beginPath();hctx.moveTo(px(frame), 11);hctx.lineTo(px(frame), height - 12);hctx.stroke();hctx.setLineDash([]);
      if (selected.visible(frame)) {
        hctx.fillStyle = selected.color;hctx.beginPath();hctx.arc(px(frame), py(selected.z(frame)), 6, 0, Math.PI*2);hctx.fill();
      }
    }
    function render() {
      scene(); chart();
      q('#frameBadge').textContent = 'FRAME ' + String(frame + 1).padStart(2, '0') + ' / 24';
      q('#replaySlider').value = String(frame + 1);
      q('#replayPosition').textContent = String(frame + 1).padStart(2, '0') + ' / 24';
      q('#selectedId').textContent = selected.id;
      q('#trackState').textContent = selected.visible(frame) ? tr('Observed', '可觀測') : tr('Not observed', '未觀測');
      q('#trackDepth').textContent = selected.visible(frame) ? fmt(selected.z(frame)) + ' ' + tr('virtual', '虛擬') : '—';
      q('#trackCount').textContent = String(Array.from({length:24},(_,i)=>i).filter(selected.visible).length) + ' / 24';
      [...btns.children].forEach((button,i) => button.setAttribute('aria-pressed', String(tracks[i] === selected)));
      const play = q('#playToggle');
      play.dataset.en = playing ? 'Pause Ⅱ' : 'Play ▶';
      play.dataset.zh = playing ? '暫停 Ⅱ' : '播放 ▶';
      play.textContent = chinese() ? play.dataset.zh : play.dataset.en;
    }
    function tick(now) {
      if (!playing) return;
      if (!lastTime) lastTime = now;
      const delta = 200 / Number(q('#replaySpeed').value);
      if (now - lastTime >= delta) {
        if (frame === 23) { playing = false; render(); return; }
        frame += 1; lastTime = now; render();
      }
      raf = requestAnimationFrame(tick);
    }
    function playToggle() {
      playing = !playing;
      if (playing && frame === 23) frame = 0;
      lastTime = 0; cancelAnimationFrame(raf); render();
      if (playing) raf = requestAnimationFrame(tick);
    }
    q('#playToggle').addEventListener('click', playToggle);
    q('#replaySlider').addEventListener('input', e => { frame = Math.max(0, Math.min(23, Number(e.target.value) - 1)); lastTime = 0; render(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && playing) { playing = false; cancelAnimationFrame(raf);render(); } });
    refreshPage = render; render();
  }

  if (page === 'spatial') setupSpatial();
  if (page === 'tracking') setupTracking();
  setLanguage(lang);
})();
