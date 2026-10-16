/* SPDX-License-Identifier: AGPL-3.0-only */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const i18n = window.DepthPortI18n;
  const t = (key, params) => i18n.t(key, params);
  const demoOnly = document.documentElement.dataset.demoOnly === 'true';
  let viewer = null, lastFrame = 0, uploading = false, updating = false;
  let usingDemo = false, fitNext = true, toastHandle = null, pollMs = 350, displayEpoch = 0;
  let session = null, generation = -1, statusBusy = false, modelChoiceDirty = false;
  let knownModels = [], latestStatus = null, lastPayload = null;

  function notify(message) {
    const box = $('toast'); box.textContent = message; box.classList.add('show');
    clearTimeout(toastHandle); toastHandle = setTimeout(() => box.classList.remove('show'), 6500);
  }
  function errorText(error) { return error && error.message ? error.message : String(error); }
  async function checkedFetch(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try { const body = await response.json(); message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail); } catch (_) {}
      throw Error(message);
    }
    return response;
  }
  async function request(url, options = {}) {
    const response = await checkedFetch(url, options);
    return response.status === 204 ? null : response.json();
  }
  function setBusy(value) {
    ['uploadBtn', 'connectBtn', 'demoBtn', 'inlineDemoBtn', 'applyModelBtn'].forEach(id => { $(id).disabled = value; });
  }
  function setExport(value) {
    ['exportBtn', 'depthExportBtn', 'bundleExportBtn'].forEach(id => { $(id).disabled = !value; });
  }
  function setError(message) { $('statusDetail').textContent = message; document.querySelector('.status-panel').classList.add('has-error'); }
  function clearError() { document.querySelector('.status-panel').classList.remove('has-error'); }
  function clearOutput() {
    displayEpoch++; usingDemo = false; fitNext = true; lastFrame = 0; lastPayload = null; setExport(false);
    if (viewer) viewer.setPoints(new Float32Array(0), new Uint8Array(0));
    ['Rgb', 'Depth'].forEach(kind => { $('preview' + kind).style.display = 'none'; });
    $('rgbPlaceholder').style.display = ''; $('depthPlaceholder').style.display = '';
    $('viewerOverlay').classList.remove('hidden'); $('cloudTag').textContent = t('cloud.waiting');
    $('pointsCount').textContent = '—'; $('inferenceMs').textContent = '—'; $('depthRange').textContent = t('depth.waiting');
    $('inferenceDetail').textContent = t('metrics.pipelineNote'); $('colorRange').textContent = t('depth.byModel');
    $('rgbResolution').textContent = '—'; $('viewCaption').textContent = t('cloud.awaiting');
  }
  function adoptState(sid, nextGeneration) {
    if (session !== sid) { session = sid; generation = nextGeneration; clearOutput(); return true; }
    if (nextGeneration < generation) return false;
    if (nextGeneration > generation) { generation = nextGeneration; clearOutput(); }
    return true;
  }
  function unitKey(units, engine) { return engine === 'da2-small' ? 'unit.virtual' : units === 'relative' ? 'unit.relative' : 'unit.meters'; }
  function badgeKey(units, engine) { return engine === 'da2-small' ? 'unit.virtualBadge' : units === 'relative' ? 'unit.relativeBadge' : 'unit.metricBadge'; }
  function updateHint() {
    const key = $('engineSelect').value, entry = knownModels.find(item => item.key === key);
    $('engineHint').textContent = demoOnly ? t('demo.static') : t('hint.' + key) + (entry && !entry.package_detected ? t('hint.missing') : '');
  }
  function renderDemoText() {
    $('cloudTag').textContent = t('demo.tag'); $('cloudUnits').textContent = t('demo.units');
    $('unitsBadge').textContent = t('demo.units'); $('colorRange').textContent = '—';
    $('intrinsicsInfo').textContent = t('demo.camera'); $('modelInfo').textContent = t('demo.modelInfo');
    $('viewCaption').textContent = t('demo.caption'); $('depthRange').textContent = t('demo.depth');
    $('sourceBadge').textContent = t('source.synthetic'); $('stateText').textContent = t('demo.tag');
    $('statusDetail').textContent = demoOnly ? t('demo.static') : t('demo.status');
    if (demoOnly) $('modelStateChip').textContent = t('demo.staticLabel');
  }
  function renderStatus(state) {
    if (!state) return;
    const loading = state.model_loading;
    $('modelStateChip').textContent = t('state.' + state.model_state);
    $('unitsBadge').textContent = t(badgeKey(state.units, state.selected_engine));
    if (!usingDemo && !lastPayload) $('cloudUnits').textContent = $('unitsBadge').textContent;
    $('reprocessBtn').disabled = !state.image_retained || uploading;
    $('frameCount').textContent = state.frame_id ? Number(state.frame_id).toLocaleString(i18n.language) : '—';
    $('deviceValue').textContent = state.device === 'not loaded' ? t('state.not_loaded') : String(state.device).toUpperCase();
    $('sourceBadge').textContent = t(usingDemo ? 'source.synthetic' : state.mode === 'rtsp' ? 'source.live' : state.mode === 'image' ? 'source.single' : 'source.standby');
    const stateKey = usingDemo ? 'demo.tag' : loading ? 'state.loading' : state.processing ? 'state.inference' : state.error ? 'state.needsAttention' : state.mode === 'rtsp' ? (state.connected ? 'state.connected' : 'state.offline') : state.mode === 'image' ? (state.has_result ? 'state.imageDone' : 'state.imageQueued') : 'state.waiting';
    $('stateText').textContent = t(stateKey);
    const name = String(state.depth_model).split(/[\\/]/).pop();
    $('modelInfo').textContent = `${name} · ${state.model_imgsz || '—'}${state.model_version ? ' · ' + state.model_version : ''}`;
    $('modelTag').textContent = name.replace(/\.pt$/i, '').toUpperCase();
    $('intrinsicsInfo').textContent = t(state.intrinsics_source === 'provided_intrinsics' ? 'camera.provided' : 'camera.estimated');
    if (state.error) setError(state.error); // Preserve original technical diagnostics; never silently mistranslate.
    else {
      clearError();
      const detail = usingDemo ? 'demo.status' : loading ? 'status.loading' : state.processing ? 'status.processing' : state.mode === 'rtsp' ? 'status.rtsp' : state.mode === 'image' ? (state.has_result ? 'status.imageDone' : 'status.imageQueued') : 'status.idle';
      $('statusDetail').textContent = t(detail);
    }
    if (usingDemo) renderDemoText();
    $('updateDetail').textContent = state.last_update_seconds != null ? t('status.updated', { seconds: state.last_update_seconds, hz: state.publish_hz ? ` · ${state.publish_hz} Hz` : '' }) : t('status.version');
  }
  function renderFrameText(data) {
    $('pointsCount').textContent = Number(data.count).toLocaleString(i18n.language);
    $('inferenceMs').textContent = Number(data.timings.pipeline_ms).toLocaleString(i18n.language);
    const infer = data.timings.inference_ms;
    $('inferenceDetail').textContent = t(infer == null ? 'timing.api' : 'timing.infer', { model: infer ?? data.timings.da3_api_wall_ms ?? data.timings.predict_wall_ms, cloud: data.timings.cloud_ms });
    const type = !data.count ? 'cloud.noPoints' : data.engine === 'da2-small' ? 'cloud.v2' : data.units === 'relative' ? 'cloud.relative' : 'cloud.metric';
    $('cloudTag').textContent = t(type);
    const unit = t(unitKey(data.units, data.engine)), stats = data.depth_stats;
    $('viewCaption').textContent = t('cloud.caption', { model: data.model.split(/[\\/]/).pop(), frame: data.frame_id, unit });
    $('depthRange').textContent = t('depth.stats', { min: stats.min.toFixed(2), max: stats.max.toFixed(2), median: stats.median.toFixed(2), unit });
    $('colorRange').textContent = `${data.color_range[0].toFixed(2)}–${data.color_range[1].toFixed(2)} · ${t(data.color_mode === 'fixed' ? 'depth.fixed' : 'depth.auto')}`;
    $('cloudUnits').textContent = t(data.engine === 'da2-small' ? 'unit.virtualCloud' : badgeKey(data.units, data.engine));
  }
  function refreshLanguage() {
    updateHint(); renderStatus(latestStatus);
    if (lastPayload) renderFrameText(lastPayload);
    if (usingDemo) renderDemoText();
    if (viewer && viewer.is2D) document.querySelector('.viewer-panel .sub-tag').textContent = t('viewer.fallback');
    $('rotateBtn').textContent = t(viewer && viewer.autoSpin ? 'viewer.stopRotate' : 'viewer.rotate');
    $('stretchNote').textContent = t(Number($('depthSlider').value) === 1 ? 'viewer.stretchDefault' : 'viewer.stretchChanged');
  }
  async function modelCatalog() {
    try { knownModels = (await request('/api/models')).models; updateHint(); } catch (error) { setError(errorText(error)); }
  }
  async function statusPoll() {
    if (demoOnly || statusBusy) return;
    statusBusy = true;
    try {
      const state = await request('/api/status');
      if (!adoptState(state.session_id, state.generation)) return;
      latestStatus = state;
      if (!modelChoiceDirty) $('engineSelect').value = state.selected_engine;
      pollMs = Math.max(100, 1000 / Math.max(2, Math.min(10, state.target_hz || 2)));
      updateHint(); renderStatus(state);
    } catch (error) { setError(t('error.backend', { detail: errorText(error) })); }
    finally { statusBusy = false; }
  }
  async function latestPoll() {
    if (demoOnly || updating || uploading || usingDemo) return;
    updating = true; const epoch = displayEpoch;
    try {
      const data = await request('/api/latest?after=' + lastFrame);
      if (epoch !== displayEpoch || uploading || usingDemo || !data) return;
      if (!adoptState(data.session_id, data.generation)) return;
      if (!viewer) throw Error(t('error.noViewer'));
      viewer.setPacked(data.points, data.count, fitNext, data.color_range);
      fitNext = false; lastFrame = data.frame_id; lastPayload = data;
      $('viewerOverlay').classList.add('hidden'); $('rgbResolution').textContent = `${data.width} × ${data.height}`;
      ['Rgb', 'Depth'].forEach(kind => { $('preview' + kind).src = 'data:image/jpeg;base64,' + data[kind === 'Rgb' ? 'rgb_jpeg' : 'depth_jpeg']; $('preview' + kind).style.display = 'block'; });
      $('rgbPlaceholder').style.display = 'none'; $('depthPlaceholder').style.display = 'none';
      renderFrameText(data); setExport(true);
      if (data.warning) notify(t('notice.noPoints'));
    } catch (error) { setError(errorText(error)); }
    finally { updating = false; }
  }
  async function latestLoop() { await latestPoll(); setTimeout(latestLoop, pollMs); }
  async function switchModel() {
    setBusy(true);
    try {
      const result = await request('/api/model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: $('engineSelect').value }) });
      clearOutput(); generation = Math.max(generation, result.generation); modelChoiceDirty = false; notify(t('notice.switch'));
    } catch (error) { notify(t('error.switch', { detail: errorText(error) })); }
    finally { setBusy(false); statusPoll(); }
  }
  async function reprocess() {
    try { const result = await request('/api/reprocess', { method: 'POST' }); clearOutput(); generation = Math.max(generation, result.generation); notify(t('notice.reprocess')); }
    catch (error) { notify(errorText(error)); } statusPoll();
  }
  async function connect() {
    const url = $('rtspInput').value.trim();
    if (!/^rtsps?:\/\//i.test(url)) { notify(t('error.url')); return; }
    setBusy(true);
    try {
      const result = await request('/api/source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      clearOutput(); generation = Math.max(generation, result.generation); $('rtspInput').value = ''; notify(t('notice.rtsp'));
    } catch (error) { notify(t('error.connect', { detail: errorText(error) })); }
    finally { setBusy(false); statusPoll(); }
  }
  async function disconnect() {
    try { await request('/api/source/stop', { method: 'POST' }); clearOutput(); notify(t('notice.stop')); }
    catch (error) { notify(errorText(error)); } await statusPoll();
  }
  async function upload(file) {
    if (!file || uploading || demoOnly) return;
    if (file.size > 12 * 1024 * 1024) { notify(t('error.fileSize')); return; }
    uploading = true; setBusy(true); clearError();
    try {
      const form = new FormData(); form.append('file', file, file.name);
      const result = await request('/api/image', { method: 'POST', body: form });
      clearOutput(); generation = Math.max(generation, result.generation); notify(t('notice.upload'));
    } catch (error) { setError(t('error.upload', { detail: errorText(error) })); notify(errorText(error)); }
    finally { uploading = false; setBusy(false); statusPoll(); }
  }
  async function demo() {
    if (!viewer) { notify(t('error.noViewer')); return; }
    if (!demoOnly) {
      try { await request('/api/source/stop', { method: 'POST' }); const state = await request('/api/status'); adoptState(state.session_id, state.generation); }
      catch (_) { notify(t('demo.offline')); }
    }
    clearOutput(); usingDemo = true;
    const count = viewer.syntheticDemo(); $('viewerOverlay').classList.add('hidden'); $('pointsCount').textContent = count.toLocaleString(i18n.language);
    renderDemoText(); notify(t('demo.notice')); statusPoll();
  }
  async function download(url) {
    try {
      const response = await checkedFetch(url), blob = await response.blob();
      const filename = (response.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
      const object = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = object; link.download = filename ? filename[1] : 'depthport_export'; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(object), 10000);
    } catch (error) { notify(t('error.export', { detail: errorText(error) })); }
  }
  function main() {
    i18n.apply();
    $('languageSelect').addEventListener('change', event => i18n.setLanguage(event.target.value));
    window.addEventListener('depthport:language', () => {
      clearTimeout(toastHandle); $('toast').classList.remove('show');
      refreshLanguage();
      if (!lastPayload && !usingDemo) $('colorRange').textContent = t('depth.byModel');
    });
    try { viewer = new CloudViewer($('cloudCanvas')); }
    catch (error) { setError(t('error.viewer', { detail: errorText(error) })); }
    $('engineSelect').addEventListener('change', () => { modelChoiceDirty = true; updateHint(); });
    $('applyModelBtn').addEventListener('click', switchModel); $('reprocessBtn').addEventListener('click', reprocess);
    $('connectBtn').addEventListener('click', connect); $('disconnectBtn').addEventListener('click', disconnect);
    $('rtspInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !demoOnly) connect(); });
    $('uploadBtn').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', event => { upload(event.target.files[0]); event.target.value = ''; });
    $('demoBtn').addEventListener('click', demo); $('inlineDemoBtn').addEventListener('click', demo);
    $('exportBtn').addEventListener('click', () => download('/api/export.ply'));
    $('depthExportBtn').addEventListener('click', () => download('/api/depth.npy'));
    $('bundleExportBtn').addEventListener('click', () => download('/api/export.zip'));
    $('resetBtn').addEventListener('click', () => { if (viewer) viewer.reset(); });
    $('rotateBtn').addEventListener('click', () => { if (viewer) { viewer.autoSpin = !viewer.autoSpin; $('rotateBtn').textContent = t(viewer.autoSpin ? 'viewer.stopRotate' : 'viewer.rotate'); } });
    $('sizeSlider').addEventListener('input', event => { const value = Number(event.target.value); $('sizeValue').textContent = value.toFixed(1) + ' px'; if (viewer) viewer.size = value; });
    $('depthSlider').addEventListener('input', event => { const value = Number(event.target.value); $('depthValue').textContent = value.toFixed(1) + '×'; if (viewer) viewer.exaggeration = value; $('stretchNote').textContent = t(value === 1 ? 'viewer.stretchDefault' : 'viewer.stretchChanged'); });
    ['rgb', 'depth'].forEach(mode => $(mode + 'Mode').addEventListener('click', () => {
      if (viewer) viewer.setColorMode(mode); $('rgbMode').classList.toggle('selected', mode === 'rgb'); $('depthMode').classList.toggle('selected', mode === 'depth');
    }));
    const area = $('cloudCanvas').parentElement;
    area.addEventListener('dragover', event => event.preventDefault());
    area.addEventListener('drop', event => { event.preventDefault(); if (!uploading && event.dataTransfer.files.length) upload(event.dataTransfer.files[0]); });
    if (demoOnly) {
      ['rtspInput', 'connectBtn', 'disconnectBtn', 'uploadBtn', 'fileInput', 'engineSelect', 'applyModelBtn', 'reprocessBtn'].forEach(id => { $(id).disabled = true; });
      $('staticBanner').hidden = false; demo();
    } else { modelCatalog(); statusPoll(); latestLoop(); setInterval(statusPoll, 900); }
    refreshLanguage();
  }
  document.addEventListener('DOMContentLoaded', main);
})();
