const btnPlay        = document.getElementById('btnPlay');
const btnCreate      = document.getElementById('btnCreate');
const btnImport      = document.getElementById('btnImport');
const btnImportCode  = document.getElementById('btnImportCode');
const btnSettings    = document.getElementById('btnSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const settingsOverlay  = document.getElementById('settingsOverlay');
const songList       = document.getElementById('songList');
const songItems      = document.getElementById('songItems');
const importFile     = document.getElementById('importFile');
const searchBox      = document.getElementById('searchBox');
const sortSelect     = document.getElementById('sortSelect');

// ── Key helpers (must be before loadSettingsUI → buildKeybindUI) ──────────────
const _MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);
function captureKeyId(e) {
  if (_MODIFIER_KEYS.has(e.key) && e.location > 0) return e.code;
  return e.key;
}
// Key display uses shared displayKeyName() from settings.js

// ── Settings panel ─────────────────────────────────────────────────────────────
const sSpeed         = document.getElementById('sSpeed');
const sSpeedVal      = document.getElementById('sSpeedVal');
const sOffset        = document.getElementById('sOffset');
const sOffsetVal     = document.getElementById('sOffsetVal');
const sPractice      = document.getElementById('sPractice');
const sPracticeVal   = document.getElementById('sPracticeVal');
const sPracticeMode  = document.getElementById('sPracticeMode');
const sHitsound      = document.getElementById('sHitsound');
const sHitsoundVol   = document.getElementById('sHitsoundVol');
const sHitsoundVolVal= document.getElementById('sHitsoundVolVal');
const btnTestHitsound= document.getElementById('btnTestHitsound');
const sMasterVol     = document.getElementById('sMasterVol');
const sMasterVolVal  = document.getElementById('sMasterVolVal');
const sMusicVol      = document.getElementById('sMusicVol');
const sMusicVolVal   = document.getElementById('sMusicVolVal');
const sMetronomeVol  = document.getElementById('sMetronomeVol');
const sMetronomeVolVal = document.getElementById('sMetronomeVolVal');
const sBgMusic         = document.getElementById('sBgMusic');
const sBgMusicMode     = document.getElementById('sBgMusicMode');
const sBgMusicVol      = document.getElementById('sBgMusicVol');
const sBgMusicVolVal   = document.getElementById('sBgMusicVolVal');
const bgMusicModeRow   = document.getElementById('bgMusicModeRow');
const bgMusicCustomRow = document.getElementById('bgMusicCustomRow');
const btnUploadBgAudio = document.getElementById('btnUploadBgAudio');
const bgAudioFile      = document.getElementById('bgAudioFile');
const bgAudioStatus    = document.getElementById('bgAudioStatus');
const sBgMusicWidget   = document.getElementById('sBgMusicWidget');
const sSeparatePopupMusic = document.getElementById('sSeparatePopupMusic');
const popupMusicControls  = document.getElementById('popupMusicControls');
const sPopupBgMusicMode   = document.getElementById('sPopupBgMusicMode');
const sPopupBgMusicVol    = document.getElementById('sPopupBgMusicVol');
const sPopupBgMusicVolVal = document.getElementById('sPopupBgMusicVolVal');
const sSkinName      = document.getElementById('sSkinName');
const btnUploadSkin  = document.getElementById('btnUploadSkin');
const btnResetSkin   = document.getElementById('btnResetSkin');
const skinFile       = document.getElementById('skinFile');

function loadSettingsUI() {
  const s = getSettings();
  sSpeed.value         = s.scrollSpeed;
  sSpeedVal.textContent = s.scrollSpeed.toFixed(1) + '×';
  sOffset.value        = s.audioOffset;
  sOffsetVal.textContent = (s.audioOffset >= 0 ? '+' : '') + s.audioOffset + 'ms';
  sPractice.value      = s.practiceSpeed;
  sPracticeVal.textContent = parseFloat(s.practiceSpeed).toFixed(2) + '×';
  sPracticeMode.checked = !!s.practiceMode;
  const sGlide = document.getElementById('sGlide');
  if (sGlide) sGlide.checked = s.enableGlide !== false;
  const sStrictRelease = document.getElementById('sStrictRelease');
  if (sStrictRelease) sStrictRelease.checked = !!s.strictRelease;
  const sAutosave = document.getElementById('sAutosave');
  if (sAutosave) sAutosave.checked = !!s.autosave;
  sHitsound.value      = s.hitsound || 'tick';
  sHitsoundVol.value   = s.hitsoundVolume !== undefined ? s.hitsoundVolume : 0.5;
  sHitsoundVolVal.textContent = Math.round((s.hitsoundVolume !== undefined ? s.hitsoundVolume : 0.5) * 100) + '%';
  const _sHP = document.getElementById('sHitsoundPitch');
  if (_sHP) _sHP.checked = !!s.hitsoundAutoPitch;
  const _sHPR = document.getElementById('sHitsoundPitchRange');
  const _sHPRV = document.getElementById('sHitsoundPitchRangeVal');
  if (_sHPR) {
    _sHPR.value = s.hitsoundPitchRange ?? 0.2;
    if (_sHPRV) _sHPRV.textContent = '±' + (s.hitsoundPitchRange ?? 0.2).toFixed(2);
  }
  sMasterVol.value     = s.masterVolume !== undefined ? s.masterVolume : 1.0;
  sMasterVolVal.textContent = Math.round((s.masterVolume !== undefined ? s.masterVolume : 1.0) * 100) + '%';
  sMusicVol.value      = s.musicVolume !== undefined ? s.musicVolume : 1.0;
  sMusicVolVal.textContent = Math.round((s.musicVolume !== undefined ? s.musicVolume : 1.0) * 100) + '%';
  sMetronomeVol.value  = s.metronomeVolume !== undefined ? s.metronomeVolume : 0.5;
  sMetronomeVolVal.textContent = Math.round((s.metronomeVolume !== undefined ? s.metronomeVolume : 0.5) * 100) + '%';
  // BG Music
  sBgMusic.checked = !!s.bgMusic;
  sBgMusicMode.value = s.bgMusicMode || 'random';
  sBgMusicVol.value = s.bgMusicVolume !== undefined ? s.bgMusicVolume : 0.5;
  sBgMusicVolVal.textContent = Math.round((s.bgMusicVolume !== undefined ? s.bgMusicVolume : 0.5) * 100) + '%';
  sBgMusicWidget.checked = s.bgMusicWidget !== false;
  // Separate popup music
  sSeparatePopupMusic.checked = !!s.separatePopupMusic;
  sPopupBgMusicMode.value = s.popupBgMusicMode || 'random';
  sPopupBgMusicVol.value = s.popupBgMusicVolume !== undefined ? s.popupBgMusicVolume : 0.5;
  sPopupBgMusicVolVal.textContent = Math.round((s.popupBgMusicVolume !== undefined ? s.popupBgMusicVolume : 0.5) * 100) + '%';
  updateBgMusicUI();
  const skin = getSkin();
  sSkinName.textContent = skin ? (skin.name || 'Custom') : 'Default';
  const _gtLabel = document.getElementById('sGlobalThemeCurrent');
  if (_gtLabel) {
    const _gtName = getUILayout().name || '';
    const _gtPresets = ['Default', 'Neon', 'Pastel', 'Midnight', 'Synthwave', 'Sakura', 'Terminal', 'Cyber', 'Ember', 'Arctic', 'Vaporwave', 'Gold', 'Toxic'];
    _gtLabel.textContent = _gtPresets.includes(_gtName) ? _gtName : 'None';
  }
  const _sHideTips = document.getElementById('sHideTooltips');
  if (_sHideTips) _sHideTips.checked = !!s.hideTooltips;
  buildKeybindUI();
}
loadSettingsUI();

sSpeed.addEventListener('input', () => {
  const v = parseFloat(sSpeed.value);
  sSpeedVal.textContent = v.toFixed(1) + '×';
  saveSettings({ scrollSpeed: v });
});
sOffset.addEventListener('input', () => {
  const v = parseInt(sOffset.value);
  sOffsetVal.textContent = (v >= 0 ? '+' : '') + v + 'ms';
  saveSettings({ audioOffset: v });
});
sPractice.addEventListener('input', () => {
  const v = parseFloat(sPractice.value);
  sPracticeVal.textContent = v.toFixed(2) + '×';
  saveSettings({ practiceSpeed: v });
});
sPracticeMode.addEventListener('change', () => {
  saveSettings({ practiceMode: sPracticeMode.checked });
});
const _sGlideEl = document.getElementById('sGlide');
if (_sGlideEl) {
  _sGlideEl.addEventListener('change', () => {
    saveSettings({ enableGlide: _sGlideEl.checked });
  });
}
const _sStrictReleaseEl = document.getElementById('sStrictRelease');
if (_sStrictReleaseEl) {
  _sStrictReleaseEl.addEventListener('change', () => {
    saveSettings({ strictRelease: _sStrictReleaseEl.checked });
  });
}
const _sAutosaveEl = document.getElementById('sAutosave');
if (_sAutosaveEl) {
  _sAutosaveEl.addEventListener('change', () => {
    saveSettings({ autosave: _sAutosaveEl.checked });
  });
}
// Hide tooltips
const _sHideTips = document.getElementById('sHideTooltips');
if (_sHideTips) {
  _sHideTips.addEventListener('change', () => {
    saveSettings({ hideTooltips: _sHideTips.checked });
  });
}
// Custom hitsound upload
const customHitsoundRow    = document.getElementById('customHitsoundRow');
const customHitsoundFile   = document.getElementById('customHitsoundFile');
const customHitsoundStatus = document.getElementById('customHitsoundStatus');
const btnUploadHitsound    = document.getElementById('btnUploadHitsound');

function _syncCustomRow() {
  if (!customHitsoundRow) return;
  customHitsoundRow.classList.toggle('hidden', sHitsound.value !== 'custom');
  if (sHitsound.value === 'custom') {
    const s = getSettings();
    customHitsoundStatus.textContent = s.customHitsound ? 'Custom loaded' : 'No file';
  }
}
_syncCustomRow();

sHitsound.addEventListener('change', () => {
  saveSettings({ hitsound: sHitsound.value });
  _syncCustomRow();
});

if (btnUploadHitsound) {
  btnUploadHitsound.addEventListener('click', () => customHitsoundFile.click());
}
if (customHitsoundFile) {
  customHitsoundFile.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 500 * 1024) { showToast('File too large (max 500KB).', 3000, true); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 8192)
        bin += String.fromCharCode(...bytes.slice(i, i + 8192));
      saveSettings({ customHitsound: btoa(bin) });
      customHitsoundStatus.textContent = 'Uploaded (' + (f.size / 1024).toFixed(1) + 'KB)';
    };
    reader.readAsArrayBuffer(f);
    e.target.value = '';
  });
}
sHitsoundVol.addEventListener('input', () => {
  const v = parseFloat(sHitsoundVol.value);
  sHitsoundVolVal.textContent = Math.round(v * 100) + '%';
  saveSettings({ hitsoundVolume: v });
});
const sHitsoundPitch = document.getElementById('sHitsoundPitch');
if (sHitsoundPitch) {
  sHitsoundPitch.addEventListener('change', () => {
    saveSettings({ hitsoundAutoPitch: sHitsoundPitch.checked });
  });
}
const sHitsoundPitchRange = document.getElementById('sHitsoundPitchRange');
const sHitsoundPitchRangeVal = document.getElementById('sHitsoundPitchRangeVal');
if (sHitsoundPitchRange) {
  sHitsoundPitchRange.addEventListener('input', () => {
    const v = parseFloat(sHitsoundPitchRange.value);
    if (sHitsoundPitchRangeVal) sHitsoundPitchRangeVal.textContent = '±' + v.toFixed(2);
    saveSettings({ hitsoundPitchRange: v });
  });
}
sMasterVol.addEventListener('input', () => {
  const v = parseFloat(sMasterVol.value);
  sMasterVolVal.textContent = Math.round(v * 100) + '%';
  saveSettings({ masterVolume: v });
  chrome.runtime.sendMessage({ type: 'bgMusic:setMasterVolume', volume: v });
  window.dispatchEvent(new CustomEvent('masterVolumeChanged'));
});
sMusicVol.addEventListener('input', () => {
  const v = parseFloat(sMusicVol.value);
  sMusicVolVal.textContent = Math.round(v * 100) + '%';
  saveSettings({ musicVolume: v });
});
sMetronomeVol.addEventListener('input', () => {
  const v = parseFloat(sMetronomeVol.value);
  sMetronomeVolVal.textContent = Math.round(v * 100) + '%';
  saveSettings({ metronomeVolume: v });
});

// ── Background Music settings ────────────────────────────────────────────────
function updateBgMusicUI() {
  const enabled = sBgMusic.checked;
  bgMusicModeRow.style.display = enabled ? '' : 'none';
  bgMusicCustomRow.classList.toggle('hidden', !enabled || sBgMusicMode.value !== 'custom');
  // Hide popup music section when music is globally disabled
  popupMusicControls.classList.toggle('hidden', !enabled || !sSeparatePopupMusic.checked);
}
updateBgMusicUI();

sBgMusic.addEventListener('change', () => {
  saveSettings({ bgMusic: sBgMusic.checked });
  updateBgMusicUI();
  chrome.runtime.sendMessage({ type: 'bgMusic:settingsChanged' });
});

sBgMusicMode.addEventListener('change', () => {
  saveSettings({ bgMusicMode: sBgMusicMode.value });
  updateBgMusicUI();
  chrome.runtime.sendMessage({ type: 'bgMusic:settingsChanged' });
});

sBgMusicVol.addEventListener('input', () => {
  const v = parseFloat(sBgMusicVol.value);
  sBgMusicVolVal.textContent = Math.round(v * 100) + '%';
  saveSettings({ bgMusicVolume: v });
  chrome.runtime.sendMessage({ type: 'bgMusic:setVolume', volume: v });
});

sBgMusicWidget.addEventListener('change', () => {
  saveSettings({ bgMusicWidget: sBgMusicWidget.checked });
});

// Separate popup music
sSeparatePopupMusic.addEventListener('change', () => {
  saveSettings({ separatePopupMusic: sSeparatePopupMusic.checked });
  updateBgMusicUI();
});

sPopupBgMusicMode.addEventListener('change', () => {
  saveSettings({ popupBgMusicMode: sPopupBgMusicMode.value });
});

sPopupBgMusicVol.addEventListener('input', () => {
  const v = parseFloat(sPopupBgMusicVol.value);
  sPopupBgMusicVolVal.textContent = Math.round(v * 100) + '%';
  saveSettings({ popupBgMusicVolume: v });
});

// Custom audio upload
btnUploadBgAudio.addEventListener('click', () => bgAudioFile.click());
bgAudioFile.addEventListener('change', async () => {
  const file = bgAudioFile.files[0];
  if (!file) return;
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });
  await saveBg({ id: 'bg_audio', data: blob, type: 'audio', mimeType: file.type });
  bgAudioStatus.textContent = file.name;
  chrome.runtime.sendMessage({ type: 'bgMusic:settingsChanged' });
  bgAudioFile.value = '';
});

// Show current custom audio status on load
getBg('bg_audio').then(entry => {
  if (entry) bgAudioStatus.textContent = 'Custom audio loaded';
}).catch(() => {});

// ── Tap Test ─────────────────────────────────────────────────────────────────
const btnTapTest    = document.getElementById('btnTapTest');
const btnTapApply   = document.getElementById('btnTapApply');
const tapTestStatus = document.getElementById('tapTestStatus');
let _tapTestCtx     = null;
let _tapTestBeats   = [];
let _tapTestTaps    = [];
let _tapTestInterval = null;
let _tapTestActive   = false;
let _tapTestResult   = null;

btnTapTest.addEventListener('click', () => {
  if (_tapTestActive) stopTapTest();
  else startTapTest();
});
btnTapApply.addEventListener('click', () => {
  if (_tapTestResult === null) return;
  const v = Math.round(_tapTestResult);
  sOffset.value = v;
  sOffsetVal.textContent = (v >= 0 ? '+' : '') + v + 'ms';
  saveSettings({ audioOffset: v });
  tapTestStatus.textContent = `Applied ${v >= 0 ? '+' : ''}${v}ms`;
  btnTapApply.classList.add('hidden');
});

function startTapTest() {
  _tapTestActive = true;
  _tapTestBeats  = [];
  _tapTestTaps   = [];
  _tapTestResult = null;
  btnTapApply.classList.add('hidden');
  btnTapTest.textContent = '⏹ Stop';
  btnTapTest.classList.remove('btn-dim');
  btnTapTest.classList.add('btn-red');
  tapTestStatus.textContent = 'Tap any key in sync with the beeps…';

  _tapTestCtx = new AudioContext();
  const interval = 500; // 120 BPM
  let beatIdx = 0;

  function beep() {
    const t = _tapTestCtx.currentTime;
    _tapTestBeats.push(t * 1000);
    const osc  = _tapTestCtx.createOscillator();
    const gain = _tapTestCtx.createGain();
    osc.connect(gain); gain.connect(_tapTestCtx.destination);
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.start(t); osc.stop(t + 0.08);
    beatIdx++;
    if (beatIdx >= 16) stopTapTest();
  }

  beep();
  _tapTestInterval = setInterval(beep, interval);

  document.addEventListener('keydown', _tapTestKeyHandler);
}

function _tapTestKeyHandler(e) {
  if (!_tapTestActive || !_tapTestCtx) return;
  e.preventDefault();
  _tapTestTaps.push(_tapTestCtx.currentTime * 1000);
  tapTestStatus.textContent = `Taps: ${_tapTestTaps.length} / Beats: ${_tapTestBeats.length}`;
}

function stopTapTest() {
  _tapTestActive = false;
  if (_tapTestInterval) { clearInterval(_tapTestInterval); _tapTestInterval = null; }
  if (_tapTestCtx) { _tapTestCtx.close().catch(() => {}); _tapTestCtx = null; }
  document.removeEventListener('keydown', _tapTestKeyHandler);
  btnTapTest.textContent = 'Tap Test';
  btnTapTest.classList.remove('btn-red');
  btnTapTest.classList.add('btn-dim');

  if (_tapTestTaps.length < 3) {
    tapTestStatus.textContent = 'Need at least 3 taps. Try again.';
    return;
  }

  // For each tap, find the nearest beat and compute offset
  const offsets = [];
  for (const tap of _tapTestTaps) {
    let minDist = Infinity, best = 0;
    for (const beat of _tapTestBeats) {
      const d = Math.abs(tap - beat);
      if (d < minDist) { minDist = d; best = tap - beat; }
    }
    if (Math.abs(best) < 300) offsets.push(best);
  }

  if (offsets.length < 2) {
    tapTestStatus.textContent = 'Taps too far from beats. Try again.';
    return;
  }

  const avg = offsets.reduce((a, b) => a + b, 0) / offsets.length;
  _tapTestResult = -avg; // negative because positive offset = hit earlier
  const v = Math.round(_tapTestResult);
  tapTestStatus.textContent = `Avg offset: ${v >= 0 ? '+' : ''}${v}ms`;
  btnTapApply.classList.remove('hidden');
}

// Per-lane hitsound rows
const HITSOUND_TYPES = ['', 'none', 'tick', 'click', 'drum', 'bass', 'bell', 'kick', 'snare'];
const HITSOUND_LABELS = { '': '(Global)', none: 'None', tick: 'Tick', click: 'Click', drum: 'Drum', bass: 'Bass', bell: 'Bell', kick: 'Kick', snare: 'Snare' };

function buildLaneHitsoundUI() {
  const container = document.getElementById('laneHitsoundRows');
  if (!container) return;
  container.innerHTML = '';
  const s = getSettings();
  const laneHs = s.laneHitsounds || {};
  const customHs = s.customHitsounds || {};
  const customNames = Object.keys(customHs);
  for (let i = 0; i < 7; i++) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const lbl = document.createElement('label');
    lbl.textContent = `Lane ${i + 1}`;
    const sel = document.createElement('select');
    sel.className = 'select-flex select-sm';
    for (const t of HITSOUND_TYPES) {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = HITSOUND_LABELS[t];
      if ((laneHs[i] || '') === t) opt.selected = true;
      sel.appendChild(opt);
    }
    // Add custom hitsounds from library
    for (const name of customNames) {
      const opt = document.createElement('option');
      opt.value = 'custom:' + name;
      opt.textContent = '\u266a ' + name;
      if ((laneHs[i] || '') === 'custom:' + name) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      const cur = getSettings();
      const lh  = { ...(cur.laneHitsounds || {}) };
      lh[i] = sel.value;
      saveSettings({ laneHitsounds: lh });
    });
    row.appendChild(lbl); row.appendChild(sel);
    container.appendChild(row);
  }
}

// Slider tick/end selects
(function initSliderSounds() {
  const s  = getSettings();
  const st = document.getElementById('sSliderTick');
  const se = document.getElementById('sSliderEnd');
  if (st) { st.value = s.sliderTickSound || ''; st.addEventListener('change', () => saveSettings({ sliderTickSound: st.value })); }
  if (se) { se.value = s.sliderEndSound  || ''; se.addEventListener('change', () => saveSettings({ sliderEndSound:  se.value })); }
})();

buildLaneHitsoundUI();

function buildLaneSliderEndUI() {
  const container = document.getElementById('laneSliderEndRows');
  if (!container) return;
  container.innerHTML = '';
  const s = getSettings();
  const laneSeHs = s.laneSliderEndSounds || {};
  const customHs = s.customHitsounds || {};
  const customNames = Object.keys(customHs);
  for (let i = 0; i < 7; i++) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const lbl = document.createElement('label');
    lbl.textContent = `Lane ${i + 1}`;
    const sel = document.createElement('select');
    sel.className = 'select-flex select-sm';
    for (const t of HITSOUND_TYPES) {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t === '' ? '(Lane Default)' : HITSOUND_LABELS[t];
      if ((laneSeHs[i] || '') === t) opt.selected = true;
      sel.appendChild(opt);
    }
    for (const name of customNames) {
      const opt = document.createElement('option');
      opt.value = 'custom:' + name;
      opt.textContent = '\u266a ' + name;
      if ((laneSeHs[i] || '') === 'custom:' + name) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      const cur = getSettings();
      const lse = { ...(cur.laneSliderEndSounds || {}) };
      lse[i] = sel.value;
      saveSettings({ laneSliderEndSounds: lse });
    });
    row.appendChild(lbl); row.appendChild(sel);
    container.appendChild(row);
  }
}
buildLaneSliderEndUI();

// Hitsound test
let _testCtx = null;
btnTestHitsound.addEventListener('click', async () => {
  const type = sHitsound.value;
  if (type === 'none') return;
  if (!_testCtx) _testCtx = new AudioContext();
  let buf;
  if (type === 'custom') {
    buf = await buildCustomHitsoundBuffer(_testCtx);
  } else {
    buf = buildHitsoundBuffer(_testCtx, type);
  }
  if (!buf) return;
  const src  = _testCtx.createBufferSource();
  const gain = _testCtx.createGain();
  src.buffer    = buf;
  gain.gain.value = parseFloat(sHitsoundVol.value);
  src.connect(gain);
  gain.connect(_testCtx.destination);
  src.start(0);
});

// Skin upload / reset
btnUploadSkin.addEventListener('click', () => skinFile.click());
skinFile.addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const skinObj = JSON.parse(await f.text());
    saveSkin(skinObj);
    sSkinName.textContent = skinObj.name || 'Custom';
  } catch (_) { showToast('Invalid skin file.', 3000, true); }
  skinFile.value = '';
});
btnResetSkin.addEventListener('click', () => {
  saveSkin(null);
  sSkinName.textContent = 'Default';
});
document.getElementById('btnOpenSkinEditor').addEventListener('click', () => {
  window.location.href = 'skin-editor.html';
});

// ── App background ───────────────────────────────────────────────────────────
const appBgFile     = document.getElementById('appBgFile');
const appBgStatus   = document.getElementById('appBgStatus');
const appBgOpacity  = document.getElementById('appBgOpacity');
const appBgOpacityVal   = document.getElementById('appBgOpacityVal');
const appBgSaturation   = document.getElementById('appBgSaturation');
const appBgSaturationVal = document.getElementById('appBgSaturationVal');
const appBgBlur     = document.getElementById('appBgBlur');
const appBgBlurVal  = document.getElementById('appBgBlurVal');
// MIME types that should be stored as raw blobs (animation would be lost by canvas conversion)
const _ANIMATED_IMG_MIMES = new Set(['image/gif', 'image/webp', 'image/apng']);

function _isAnimatedOrVideo(mime) {
  return mime.startsWith('video/') || _ANIMATED_IMG_MIMES.has(mime);
}

// Helper: get the right storage functions for the active background target
const sSeparatePopupBg = document.getElementById('sSeparatePopupBg');
const appBgTargetRow   = document.getElementById('appBgTargetRow');
const appBgTargetSel   = document.getElementById('appBgTarget');

function _bgTarget() {
  const s = getSettings();
  if (s.separatePopupBg && appBgTargetSel && appBgTargetSel.value === 'popup') {
    return {
      idbKey:       'popup_bg',
      getImage:     getPopupBgImage,
      saveImage:    savePopupBgImage,
      getMeta:      getPopupBgMeta,
      saveMeta:     savePopupBgMeta,
      opacityKey:   'popupBgImageOpacity',
      saturationKey:'popupBgImageSaturation',
      blurKey:      'popupBgImageBlur',
    };
  }
  return {
    idbKey:       'app_bg',
    getImage:     getAppBgImage,
    saveImage:    saveAppBgImage,
    getMeta:      getAppBgMeta,
    saveMeta:     saveAppBgMeta,
    opacityKey:   'appBgImageOpacity',
    saturationKey:'appBgImageSaturation',
    blurKey:      'appBgImageBlur',
  };
}

function _loadAppBgUI() {
  const t = _bgTarget();
  const s = getSettings();
  const meta = t.getMeta();
  const hasLegacy = !!t.getImage();
  if (meta) {
    const label = meta.type === 'video' ? 'Video' : 'Image';
    appBgStatus.textContent = meta.source === 'url' ? `${label} URL loaded` : `${label} loaded`;
  } else {
    appBgStatus.textContent = hasLegacy ? 'Image loaded' : '';
  }
  const opacity = s[t.opacityKey] ?? 0.3;
  appBgOpacity.value = opacity;
  appBgOpacityVal.textContent = Math.round(opacity * 100) + '%';
  const sat = s[t.saturationKey] ?? 100;
  appBgSaturation.value = sat;
  appBgSaturationVal.textContent = sat + '%';
  const blur = s[t.blurKey] ?? 0;
  appBgBlur.value = blur;
  appBgBlurVal.textContent = String(blur);
}
// Separate Popup Background toggle + target — init before _loadAppBgUI
sSeparatePopupBg.checked = !!getSettings().separatePopupBg;
appBgTargetRow.classList.toggle('hidden', !sSeparatePopupBg.checked);

_loadAppBgUI();

sSeparatePopupBg.addEventListener('change', () => {
  saveSettings({ separatePopupBg: sSeparatePopupBg.checked });
  appBgTargetRow.classList.toggle('hidden', !sSeparatePopupBg.checked);
  if (!sSeparatePopupBg.checked && appBgTargetSel) appBgTargetSel.value = 'main';
  _loadAppBgUI();
  if (typeof applyAppBg === 'function') applyAppBg();
});

appBgTargetSel.addEventListener('change', () => {
  _loadAppBgUI();
});

document.getElementById('btnUploadAppBg').addEventListener('click', () => appBgFile.click());
document.getElementById('btnClearAppBg').addEventListener('click', () => {
  const t = _bgTarget();
  t.saveImage('');
  t.saveMeta(null);
  deleteBg(t.idbKey);
  appBgStatus.textContent = '';
  if (typeof applyAppBg === 'function') applyAppBg();
});

appBgFile.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const mime = f.type || '';
  const t = _bgTarget();

  if (_isAnimatedOrVideo(mime)) {
    // Store raw blob in IndexedDB (canvas conversion would kill animation/video)
    const isVideo = mime.startsWith('video/');
    saveBg({ id: t.idbKey, data: f, type: isVideo ? 'video' : 'image', mimeType: mime }).then(() => {
      t.saveImage(''); // clear any legacy data URI
      t.saveMeta({ source: 'idb', type: isVideo ? 'video' : 'image', mimeType: mime });
      appBgStatus.textContent = `${isVideo ? 'Video' : 'Image'} loaded`;
      if (typeof applyAppBg === 'function') applyAppBg();
    }).catch(() => { appBgStatus.textContent = 'Failed to save'; });
  } else {
    // Static image: resize/compress as before
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 960;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          const s = MAX / Math.max(w, h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        t.saveImage(c.toDataURL('image/jpeg', 0.7));
        t.saveMeta(null); // clear any previous media meta
        deleteBg(t.idbKey); // clear any previous IndexedDB blob
        appBgStatus.textContent = `${w}×${h} loaded`;
        if (typeof applyAppBg === 'function') applyAppBg();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  }
  e.target.value = '';
});

// URL-based background loading
document.getElementById('btnLoadAppBgUrl').addEventListener('click', () => {
  const url = document.getElementById('appBgUrl').value.trim();
  if (!url) return;
  const t = _bgTarget();
  // Try to detect type from extension
  const ext = url.split(/[?#]/)[0].split('.').pop().toLowerCase();
  const videoExts = new Set(['mp4', 'webm', 'ogg', 'mov']);
  const isVideo = videoExts.has(ext);
  const type = isVideo ? 'video' : 'image';
  const mimeGuess = isVideo ? `video/${ext === 'mov' ? 'mp4' : ext}` : `image/${ext}`;

  t.saveImage(''); // clear legacy
  t.saveMeta({ source: 'url', type, mimeType: mimeGuess, url });
  deleteBg(t.idbKey); // clear any IndexedDB blob
  appBgStatus.textContent = `${type === 'video' ? 'Video' : 'Image'} URL loaded`;
  if (typeof applyAppBg === 'function') applyAppBg();
});

appBgOpacity.addEventListener('input', () => {
  const t = _bgTarget();
  const v = parseFloat(appBgOpacity.value);
  appBgOpacityVal.textContent = Math.round(v * 100) + '%';
  saveSettings({ [t.opacityKey]: v });
  if (typeof applyAppBg === 'function') applyAppBg();
});
appBgSaturation.addEventListener('input', () => {
  const t = _bgTarget();
  const v = parseInt(appBgSaturation.value);
  appBgSaturationVal.textContent = v + '%';
  saveSettings({ [t.saturationKey]: v });
  if (typeof applyAppBg === 'function') applyAppBg();
});
appBgBlur.addEventListener('input', () => {
  const t = _bgTarget();
  const v = parseInt(appBgBlur.value);
  appBgBlurVal.textContent = String(v);
  saveSettings({ [t.blurKey]: v });
  if (typeof applyAppBg === 'function') applyAppBg();
});

// ── Keybind UI ────────────────────────────────────────────────────────────────
const ALL_DEFAULT_KEYS  = ['[', ']', '\\', 'Enter', 'a', 's', 'd'];
let _capturingLane = -1;
let _kbCapHandler  = null;

function _getActiveProfile() {
  const sel = document.getElementById('keybindProfile');
  return sel ? sel.value : '';
}

function buildKeybindUI() {
  const container = document.getElementById('keybindBtns');
  container.innerHTML = '';
  const s       = getSettings();
  const profile = _getActiveProfile();
  const count   = profile ? parseInt(profile) : 7;

  // Effective keys for each shown lane
  const kb = profile
    ? getKeybindsForLanes(count)   // profile-specific (with global fallback)
    : (s.keybinds || {});          // global raw map

  for (let lane = 0; lane < count; lane++) {
    const currentKey = kb[lane] !== undefined ? kb[lane] : ALL_DEFAULT_KEYS[lane];
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-dim';
    btn.dataset.lane = lane;
    btn.textContent  = `L${lane + 1}: ${displayKeyName(currentKey || '—')}`;
    btn.addEventListener('click', () => startKeyCapture(lane, btn));
    container.appendChild(btn);
  }

  // Tap BPM key — separate row below keybind grid
  const tapRow = document.getElementById('tapBpmRow');
  if (tapRow) {
    tapRow.innerHTML = '';
    const tapLbl = document.createElement('label');
    tapLbl.textContent = 'Tap BPM Key';
    const tapKey = s.tapTempoKey ?? ' ';
    const tapBtn = document.createElement('button');
    tapBtn.className   = 'btn btn-sm btn-dim';
    tapBtn.textContent = displayKeyName(tapKey);
    tapBtn.addEventListener('click', () => startActionCapture('tapTempoKey', tapBtn, 'Tap BPM'));
    tapRow.appendChild(tapLbl);
    tapRow.appendChild(tapBtn);
  }
}

function startActionCapture(settingKey, btn, label) {
  const prev = btn.textContent;
  btn.textContent = `${label}: press key…`;
  btn.classList.add('kb-btn-capturing');
  const handler = e => {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') {
      btn.textContent = prev;
      btn.classList.remove('kb-btn-capturing');
      document.removeEventListener('keydown', handler, true);
      return;
    }
    const capturedKey = captureKeyId(e);
    saveSettings({ [settingKey]: capturedKey });
    btn.textContent = `${label}: ${displayKeyName(capturedKey)}`;
    btn.classList.remove('kb-btn-capturing');
    document.removeEventListener('keydown', handler, true);
  };
  document.addEventListener('keydown', handler, true);
}

// Rebuild when profile selector changes
document.getElementById('keybindProfile').addEventListener('change', buildKeybindUI);

function startKeyCapture(lane, btn) {
  if (_kbCapHandler) {
    document.removeEventListener('keydown', _kbCapHandler, true);
    _kbCapHandler = null;
  }
  document.querySelectorAll('#keybindBtns .btn').forEach(b => b.classList.remove('kb-btn-capturing'));

  _capturingLane = lane;
  btn.classList.add('kb-btn-capturing');
  btn.textContent = `L${lane + 1}: Press key…`;

  _kbCapHandler = e => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      btn.classList.remove('kb-btn-capturing');
      document.removeEventListener('keydown', _kbCapHandler, true);
      _kbCapHandler = null;
      buildKeybindUI();
      return;
    }

    const newKey  = captureKeyId(e);
    const s       = getSettings();
    const profile = _getActiveProfile();

    if (profile) {
      // Save to per-lane-count profile
      const count    = parseInt(profile);
      const profiles = { ...(s.keybindProfiles || {}) };
      const current  = { ...((profiles[profile]) || {}) };
      // Swap conflict within this profile
      for (let i = 0; i < count; i++) {
        const effective = current[i] !== undefined ? current[i]
                        : (s.keybinds[i] !== undefined ? s.keybinds[i] : ALL_DEFAULT_KEYS[i]);
        if (i !== lane && effective === newKey) {
          const myKey = current[lane] !== undefined ? current[lane]
                      : (s.keybinds[lane] !== undefined ? s.keybinds[lane] : ALL_DEFAULT_KEYS[lane]);
          current[i] = myKey;
          break;
        }
      }
      current[lane] = newKey;
      profiles[profile] = current;
      saveSettings({ keybindProfiles: profiles });
    } else {
      // Save to global keybinds
      const kb = { ...(s.keybinds || {}) };
      for (let i = 0; i < 7; i++) {
        const existing = kb[i] !== undefined ? kb[i] : ALL_DEFAULT_KEYS[i];
        if (i !== lane && existing === newKey) {
          kb[i] = kb[lane] !== undefined ? kb[lane] : ALL_DEFAULT_KEYS[lane];
          break;
        }
      }
      kb[lane] = newKey;
      saveSettings({ keybinds: kb });
    }

    btn.classList.remove('kb-btn-capturing');
    document.removeEventListener('keydown', _kbCapHandler, true);
    _kbCapHandler = null;
    buildKeybindUI();
  };

  document.addEventListener('keydown', _kbCapHandler, true);
}

// ── Live keybind capture (Controls tab) ──────────────────────────────────────
const sLiveExitKeyBtn  = document.getElementById('sLiveExitKey');
const sLivePauseKeyBtn = document.getElementById('sLivePauseKey');

function loadLiveKeybindsUI() {
  const s = getSettings();
  sLiveExitKeyBtn.textContent  = displayKeyName(s.liveExitKey || 'Escape');
  sLivePauseKeyBtn.textContent = displayKeyName(s.livePauseKey || ' ');
}
loadLiveKeybindsUI();

sLiveExitKeyBtn.addEventListener('click', () => {
  startActionCapture('liveExitKey', sLiveExitKeyBtn, 'Exit Key');
});
sLivePauseKeyBtn.addEventListener('click', () => {
  startActionCapture('livePauseKey', sLivePauseKeyBtn, 'Pause Key');
});

btnSettings.addEventListener('click',      () => settingsOverlay.classList.remove('hidden'));
btnCloseSettings.addEventListener('click', () => settingsOverlay.classList.add('hidden'));

// ── Browse Themes button ─────────────────────────────────────────────────────
document.getElementById('btnBrowseThemes')?.addEventListener('click', () => {
  window.location.href = 'themes.html';
});

// Settings tabs
document.querySelector('.settings-tabs').addEventListener('click', e => {
  const tab = e.target.closest('.settings-tab');
  if (!tab) return;
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
  tab.classList.add('active');
  document.querySelector(`.settings-tab-content[data-tab="${tab.dataset.tab}"]`).classList.add('active');
});

document.getElementById('btnResetAllSettings').addEventListener('click', async () => {
  if (await krConfirm('Reset all settings to defaults?')) {
    resetSettings('all');
    loadSettingsUI();
    loadLiveKeybindsUI();
  }
});
settingsOverlay.addEventListener('click', e => {
  if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
});

// ── Main menu ─────────────────────────────────────────────────────────────────
let listOpen = false;
let playlistsOpen = false;

btnPlay.addEventListener('click', async () => {
  // Close playlists if open
  if (playlistsOpen) {
    playlistsOpen = false;
    document.getElementById('playlistSection').classList.add('hidden');
  }
  listOpen = !listOpen;
  songList.classList.toggle('hidden', !listOpen);
  if (listOpen) {
    songItems.innerHTML = '<div class="loading-state"><div class="kr-spinner"></div>Loading levels…</div>';
    await renderList();
    songList.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

document.getElementById('btnPlaylists').addEventListener('click', async () => {
  // Close song list if open
  if (listOpen) {
    listOpen = false;
    songList.classList.add('hidden');
  }
  playlistsOpen = !playlistsOpen;
  document.getElementById('playlistSection').classList.toggle('hidden', !playlistsOpen);
  if (playlistsOpen) {
    document.getElementById('playlistItems').innerHTML = '<div class="loading-state"><div class="kr-spinner"></div>Loading playlists…</div>';
    await renderPlaylists();
    document.getElementById('playlistSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

btnCreate.addEventListener('click', () => { window.location.href = 'create.html'; });
btnImport.addEventListener('click', () => importFile.click());

btnImportCode.addEventListener('click', async () => {
  const code = await krPrompt('Paste share code:', 'Share code...');
  if (!code) return;
  try {
    const data = await decodeShareCode(code.trim());
    await importSongData(data);
    listOpen = true;
    songList.classList.remove('hidden');
    await renderList();
  } catch (_) { showToast('Invalid share code.', 3000, true); }
});

importFile.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    let data;
    if (file.name.endsWith('.krz')) {
      const ab   = await file.arrayBuffer();
      const krz2 = await readKRZ2(ab);
      if (krz2) {
        data = krz2;
      } else {
        // Legacy KRZ: base64-encoded gzip
        const bytes = new Uint8Array(ab);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 8192)
          bin += String.fromCharCode(...bytes.slice(i, i + 8192));
        data = JSON.parse(await decompress(btoa(bin)));
      }
    } else {
      const text = await file.text();
      try { data = JSON.parse(text); }
      catch (_) { data = JSON.parse(await decompress(btoa(text))); }
    }
    await importSongData(data);
    listOpen = true;
    songList.classList.remove('hidden');
    await renderList();
  } catch (err) { showToast('Import failed: ' + err.message, 3000, true); }
  finally { importFile.value = ''; }
});

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      }
      resolve(btoa(binary));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function decodeShareCode(code) {
  // Try old uncompressed base64 JSON first
  try { return JSON.parse(atob(code)); } catch (_) {}
  // Try new compressed format
  try { return JSON.parse(await decompress(code)); } catch (_) {}
  throw new Error('Cannot decode share code');
}

async function importSongData(data) {
  if (!Array.isArray(data.notes) || !data.title) throw new Error('Missing required fields');
  const id = 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  await saveSong({
    id,
    title:      data.title,
    artist:     data.artist     || '',
    difficulty: data.difficulty || '',
    offset:     data.offset     || 0,
    laneCount:  data.laneCount  || 3,
    bpm:        data.bpm        || 0,
    notes:      data.notes,
    createdAt:  Date.now(),
  });
  // Import audio: raw ArrayBuffer (KRZ2) or base64 (legacy)
  if (data._audioAB) {
    try { await saveAudio(id, data._audioAB); }
    catch (e) { console.warn('Audio save failed:', e); showToast('Warning: audio failed to save', 3000, true); }
  } else if (data.audio) {
    try {
      const binary = atob(data.audio);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      await saveAudio(id, bytes.buffer);
    } catch (e) { console.warn('Audio save failed:', e); showToast('Warning: audio failed to save', 3000, true); }
  }
  return id;
}

// showToast is now in utils.js

async function audioToBase64(id) {
  const ab = await getAudio(id);
  if (!ab) return null;
  const bytes = new Uint8Array(ab);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192)
    bin += String.fromCharCode(...bytes.slice(i, i + 8192));
  return btoa(bin);
}


// ── Search / sort ─────────────────────────────────────────────────────────────
searchBox.addEventListener('input',   renderList);
sortSelect.addEventListener('change', renderList);

async function renderList() {
  const songs = await getAllSongs();
  const q     = searchBox.value.toLowerCase().trim();
  const sort  = sortSelect.value;

  let list = songs.filter(s =>
    s.title.toLowerCase().includes(q) ||
    (s.artist || '').toLowerCase().includes(q)
  );

  if (sort === 'date')   list.sort((a, b) => b.createdAt - a.createdAt);
  if (sort === 'title')  list.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'artist') list.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
  if (sort === 'recent') list.sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));
  if (sort === 'score')  list.sort((a, b) => {
    const sa = getHighScore(a.id)?.score || 0;
    const sb = getHighScore(b.id)?.score || 0;
    return sb - sa;
  });

  if (!list.length) {
    songItems.innerHTML = q
      ? '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">No matches</div><div class="empty-state-hint">Try a different search term</div></div>'
      : '<div class="empty-state"><div class="empty-state-icon">♪</div><div class="empty-state-title">No levels yet</div><div class="empty-state-hint">Create a new level or import a .json / .krz file to get started</div></div>';
    return;
  }

  songItems.innerHTML = '';
  for (const s of list) {
    const hs  = getHighScore(s.id);
    const dur = songDuration(s.notes);
    const div = document.createElement('div');
    div.className = 'song-item';
    div.innerHTML = `
      <div class="song-info">
        <div class="song-title" title="${esc(s.title + (s.artist ? ' — ' + s.artist : ''))}">${esc(s.title)}${s.artist ? ' <span class="song-artist">— ' + esc(s.artist) + '</span>' : ''}</div>
        <div class="song-meta">
          <span class="meta-chip">${s.laneCount || 3}K</span>
          <span class="meta-chip">${s.notes.length} notes</span>
          ${dur ? '<span class="meta-chip">' + dur + '</span>' : ''}
          ${s.bpm ? '<span class="meta-chip">' + s.bpm + ' BPM</span>' : ''}
          ${s.difficulty ? '<span class="diff-tag diff-' + esc(s.difficulty) + '">' + esc(s.difficulty) + '</span>' : ''}
          ${hs ? '<span class="hs-tag">★ ' + hs.score.toLocaleString() + ' (' + hs.accuracy + '%)</span>' : ''}
        </div>
      </div>
      <div class="song-actions">
        <button class="btn btn-sm btn-green" data-id="${s.id}" data-act="play">Play</button>
        <button class="btn btn-sm btn-cyan"  data-id="${s.id}" data-act="edit">Edit</button>
        <button class="btn btn-sm"           data-id="${s.id}" data-act="addtopl" title="Add to playlist">+♫</button>
        <button class="btn btn-sm btn-dim"  data-id="${s.id}" data-act="dup" title="Duplicate">⧉</button>
        <select class="btn btn-sm btn-dim export-sel" data-id="${s.id}" data-act="exportmenu" title="Export">
          <option value="">⬇ Export</option>
          <option value="share">📋 Share code</option>
          <option value="json">.json (notes only)</option>
          <option value="krz">.krz (with audio)</option>
        </select>
        <button class="btn btn-sm btn-red"   data-id="${s.id}" data-act="del">Del</button>
      </div>`;
    songItems.appendChild(div);
  }
  // Re-init custom selects and tooltips for dynamically created elements
  if (typeof initCustomSelects === 'function') initCustomSelects(songItems);
  if (typeof initTooltips === 'function') initTooltips(songItems);
}

songItems.addEventListener('click', async e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const { id, act } = btn.dataset;

  if (act === 'play') {
    window.location.href = `game.html?id=${id}`;
  } else if (act === 'edit') {
    window.location.href = `editor.html?id=${id}`;
  } else if (act === 'del') {
    if (await krConfirm('Delete this level?')) { await deleteSong(id); await renderList(); }
  } else if (act === 'dup') {
    const src = await getSong(id);
    if (!src) { showToast('Level not found', 3000, true); return; }
    const newId = 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const copy = Object.assign({}, src, {
      id: newId,
      title: src.title + ' (Copy)',
      createdAt: Date.now(),
      lastPlayedAt: undefined,
    });
    copy.notes = src.notes.map(n => Object.assign({}, n));
    await saveSong(copy);
    const audio = await getAudio(id);
    if (audio) await saveAudio(newId, audio);
    showToast('Level duplicated');
    await renderList();
  } else if (act === 'addtopl') {
    // Quick-add song to a playlist
    const pls = await getAllPlaylists();
    if (!pls.length) { showToast('No playlists yet — create one with the Playlists button.', 3000, true); return; }
    const options = pls.map(p => ({ value: p.id, label: p.name }));
    const choice = await krSelect('Add to playlist:', options);
    if (choice === null) return;
    const pl = pls.find(p => p.id === choice);
    if (!pl) return;
    if (!pl.songIds.includes(id)) {
      pl.songIds.push(id);
      await savePlaylist(pl);
      showToast(`Added to "${pl.name}"`);
    } else {
      showToast(`Already in "${pl.name}"`);
    }
  }
});

songItems.addEventListener('change', async e => {
  const sel = e.target.closest('select[data-act="exportmenu"]');
  if (!sel || !sel.value) return;
  const fmt = sel.value;
  const id  = sel.dataset.id;
  sel.value = ''; // reset to placeholder

  const s = await getSong(id);
  const safeName = s.title.replace(/[^a-z0-9_\- ]/gi, '_');

  if (fmt === 'share') {
    sel.options[0].text = '📋 Copying…';
    if (sel._krSync) sel._krSync();
    try {
      const out = {
        version: '1.2', title: s.title, artist: s.artist || '',
        difficulty: s.difficulty || '', offset: s.offset || 0,
        laneCount: s.laneCount || 3, bpm: s.bpm || 0, notes: s.notes,
      };
      const compressed = await compress(JSON.stringify(out));
      await navigator.clipboard.writeText(compressed);
      sel.options[0].text = '✓ Copied!';
      if (sel._krSync) sel._krSync();
      setTimeout(() => { sel.options[0].text = '⬇ Export'; if (sel._krSync) sel._krSync(); }, 1500);
      showToast('Share code copied (map only — audio not included)');
      return;
    } catch (err) { showToast('Share failed: ' + err.message, 3000, true); }
    sel.options[0].text = '⬇ Export';
    if (sel._krSync) sel._krSync();
  } else if (fmt === 'json') {
    const out = {
      title: s.title, artist: s.artist || '', difficulty: s.difficulty || '',
      offset: s.offset || 0, laneCount: s.laneCount || 3, bpm: s.bpm || 0,
      notes: s.notes, version: '1.2',
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: safeName + '.json',
    });
    a.click(); URL.revokeObjectURL(a.href);
  } else if (fmt === 'krz') {
    sel.options[0].text = '⌛ Packing…';
    if (sel._krSync) sel._krSync();
    try {
      const ab = await getAudio(id);
      const krzAB = await writeKRZ2(s, ab || null);
      const blob  = new Blob([krzAB], { type: 'application/octet-stream' });
      const a     = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob), download: safeName + '.krz',
      });
      a.click(); URL.revokeObjectURL(a.href);
    } catch (err) { showToast('Export failed: ' + err.message, 3000, true); }
    sel.options[0].text = '⬇ Export';
    if (sel._krSync) sel._krSync();
  }
});

function songDuration(notes) {
  if (!notes || !notes.length) return '';
  const secs = Math.max(...notes.map(n => (n.time || 0) + (n.duration || 0)));
  if (!isFinite(secs) || secs <= 0) return '';
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Playlists ─────────────────────────────────────────────────────────────────
async function renderPlaylists() {
  const container = document.getElementById('playlistItems');
  const pls = await getAllPlaylists();
  if (!pls.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">♫</div><div class="empty-state-title">No playlists</div><div class="empty-state-hint">Create a playlist to organize your levels</div></div>';
    return;
  }
  container.innerHTML = '';
  pls.sort((a, b) => b.createdAt - a.createdAt);
  for (const pl of pls) {
    const div = document.createElement('div');
    div.className = 'song-item';
    div.innerHTML = `
      <div class="song-info">
        <div class="song-title" title="${esc(pl.name)}">${esc(pl.name)}</div>
        <div class="song-meta">${pl.songIds.length} song${pl.songIds.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="song-actions">
        <button class="btn btn-sm btn-green" data-plid="${pl.id}" data-plact="play" title="Play all songs in order">▶ Play All</button>
        <button class="btn btn-sm btn-cyan"  data-plid="${pl.id}" data-plact="edit" title="Edit playlist">Edit</button>
        <select class="btn btn-sm btn-dim export-sel" data-plid="${pl.id}" data-plact="exportmenu" title="Export">
          <option value="">⬇ Export</option>
          <option value="json">.json (notes only)</option>
          <option value="zip">.zip (with audio)</option>
        </select>
        <button class="btn btn-sm btn-red"   data-plid="${pl.id}" data-plact="del" title="Delete playlist">Delete</button>
      </div>`;
    container.appendChild(div);
  }
  if (typeof initCustomSelects === 'function') initCustomSelects(container);
  if (typeof initTooltips === 'function') initTooltips(container);
}

document.getElementById('playlistItems').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-plact]');
  if (!btn) return;
  const { plid, plact } = btn.dataset;
  const pl = await getPlaylist(plid);
  if (!pl) return;

  if (plact === 'play') {
    if (!pl.songIds.length) { showToast('Playlist is empty.', 3000, true); return; }
    window.location.href = `game.html?playlistId=${plid}&playlistIdx=0`;
  } else if (plact === 'edit') {
    openPlaylistEdit(pl);
  } else if (plact === 'del') {
    if (await krConfirm(`Delete playlist "${pl.name}"?`)) {
      await deletePlaylist(plid);
      await renderPlaylists();
    }
  }
});

document.getElementById('playlistItems').addEventListener('change', async e => {
  const sel = e.target.closest('select[data-plact="exportmenu"]');
  if (!sel || !sel.value) return;
  const fmt = sel.value;
  const plid = sel.dataset.plid;
  sel.value = '';
  const pl = await getPlaylist(plid);
  if (!pl) return;

  if (fmt === 'json') {
    await exportPlaylistJson(pl);
  } else if (fmt === 'zip') {
    sel.options[0].text = '⌛ Packing…';
    if (sel._krSync) sel._krSync();
    await exportPlaylistZip(pl, sel);
    sel.options[0].text = '⬇ Export';
    if (sel._krSync) sel._krSync();
  }
});

async function exportPlaylistJson(pl) {
  const songs = [];
  for (const sid of pl.songIds) {
    const s = await getSong(sid);
    if (!s) continue;
    songs.push({
      title: s.title, artist: s.artist || '', notes: s.notes,
      laneCount: s.laneCount || 3, bpm: s.bpm || 0, offset: s.offset || 0,
      difficulty: s.difficulty || '',
    });
  }
  const data = { name: pl.name, songs };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: (pl.name || 'playlist').replace(/[^a-z0-9_\- ]/gi, '_') + '.json',
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportPlaylistZip(pl) {
  if (!pl.songIds.length) { showToast('Playlist is empty.', 3000, true); return; }

  try {
    const entries = [];
    for (const sid of pl.songIds) {
      const s = await getSong(sid);
      if (!s) continue;
      const ab = await getAudio(sid);
      const krzAB = await writeKRZ2(s, ab || null);
      const fname = (s.title || sid).replace(/[^a-z0-9_\- ]/gi, '_') + '.krz';
      entries.push({ name: fname, data: new Uint8Array(krzAB) });
    }

    const zipBlob = buildZip(entries);
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(zipBlob),
      download: (pl.name || 'playlist').replace(/[^a-z0-9_\- ]/gi, '_') + '.zip',
    });
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    showToast('Export failed: ' + err.message, 3000, true);
  }
}

function buildZip(entries) {
  // Build a ZIP file manually using "store" method (no compression)
  const centralDir = [];
  const localParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const dataLen   = entry.data.byteLength;

    // Local file header (30 + nameLen + dataLen)
    const local = new Uint8Array(30 + nameBytes.length + dataLen);
    const lv    = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);  // local file header sig
    lv.setUint16(4, 20, true);          // version needed
    lv.setUint16(6, 0, true);           // flags
    lv.setUint16(8, 0, true);           // compression: store
    lv.setUint16(10, 0, true);          // mod time
    lv.setUint16(12, 0, true);          // mod date
    lv.setUint32(14, crc32(entry.data), true); // crc-32
    lv.setUint32(18, dataLen, true);    // compressed size
    lv.setUint32(22, dataLen, true);    // uncompressed size
    lv.setUint16(26, nameBytes.length, true); // filename length
    lv.setUint16(28, 0, true);          // extra field length
    local.set(nameBytes, 30);
    local.set(entry.data, 30 + nameBytes.length);

    // Central directory entry (46 + nameLen)
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);  // central dir sig
    cv.setUint16(4, 20, true);          // version made by
    cv.setUint16(6, 20, true);          // version needed
    cv.setUint16(8, 0, true);           // flags
    cv.setUint16(10, 0, true);          // compression: store
    cv.setUint16(12, 0, true);          // mod time
    cv.setUint16(14, 0, true);          // mod date
    cv.setUint32(16, crc32(entry.data), true);
    cv.setUint32(20, dataLen, true);
    cv.setUint32(24, dataLen, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);          // extra field length
    cv.setUint16(32, 0, true);          // comment length
    cv.setUint16(34, 0, true);          // disk number
    cv.setUint16(36, 0, true);          // internal attrs
    cv.setUint32(38, 0, true);          // external attrs
    cv.setUint32(42, offset, true);     // local header offset
    cd.set(nameBytes, 46);

    localParts.push(local);
    centralDir.push(cd);
    offset += local.byteLength;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) cdSize += cd.byteLength;

  // End of central directory (22 bytes)
  const eocd = new Uint8Array(22);
  const ev   = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);            // disk number
  ev.setUint16(6, 0, true);            // disk with cd
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);           // comment length

  return new Blob([...localParts, ...centralDir, eocd], { type: 'application/zip' });
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

document.getElementById('btnImportPlaylist').addEventListener('click', () => {
  document.getElementById('importPlaylistFile').click();
});
document.getElementById('importPlaylistFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  e.target.value = '';
  try {
    if (f.name.endsWith('.zip')) {
      await importPlaylistZip(f);
    } else {
      const text = await f.text();
      const data = JSON.parse(text);
      if (!data.name || !Array.isArray(data.songs)) throw new Error('Invalid playlist format');
      // Import each song first
      const songIds = [];
      for (const s of data.songs) {
        if (!s.title || !Array.isArray(s.notes)) continue;
        const id = 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        await saveSong({
          id, title: s.title, artist: s.artist || '', notes: s.notes,
          laneCount: s.laneCount || 3, bpm: s.bpm || 0, offset: s.offset || 0,
          difficulty: s.difficulty || '', createdAt: Date.now(),
        });
        songIds.push(id);
      }
      const pl = { id: 'pl_' + Date.now(), name: data.name, songIds, createdAt: Date.now() };
      await savePlaylist(pl);
      await renderPlaylists();
      await renderList();
      showToast(`Imported playlist "${data.name}" (${songIds.length} songs)`);
    }
  } catch (err) {
    showToast('Import failed: ' + err.message, 3000, true);
  }
});

async function importPlaylistZip(file) {
  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const entries = readZipEntries(bytes);
  if (!entries.length) throw new Error('No files found in zip');

  const songIds = [];
  for (const entry of entries) {
    if (!entry.name.endsWith('.krz')) continue;
    try {
      const data = await readKRZ2(entry.data.buffer);
      if (!data) continue;
      const id = await importSongData(data);
      songIds.push(id);
    } catch (_) { /* skip corrupt entries */ }
  }

  const plName = file.name.replace(/\.zip$/i, '').replace(/[_-]/g, ' ') || 'Imported Playlist';
  const pl = { id: 'pl_' + Date.now(), name: plName, songIds, createdAt: Date.now() };
  await savePlaylist(pl);
  await renderPlaylists();
  await renderList();
  showToast(`Imported playlist "${plName}" (${songIds.length} songs)`);
}

function readZipEntries(bytes) {
  const entries = [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  while (pos + 30 <= bytes.length) {
    const sig = dv.getUint32(pos, true);
    if (sig !== 0x04034b50) break; // not a local file header
    const compMethod = dv.getUint16(pos + 8, true);
    const compSize   = dv.getUint32(pos + 18, true);
    const nameLen    = dv.getUint16(pos + 26, true);
    const extraLen   = dv.getUint16(pos + 28, true);
    const name = new TextDecoder().decode(bytes.slice(pos + 30, pos + 30 + nameLen));
    const dataStart = pos + 30 + nameLen + extraLen;
    const data = bytes.slice(dataStart, dataStart + compSize);
    if (compMethod === 0 && name && !name.endsWith('/')) {
      entries.push({ name, data });
    }
    pos = dataStart + compSize;
  }
  return entries;
}

document.getElementById('btnNewPlaylist').addEventListener('click', async () => {
  const name = await krPrompt('Playlist name:', 'My Playlist');
  if (!name) return;
  const pl = { id: 'pl_' + Date.now(), name, songIds: [], createdAt: Date.now() };
  await savePlaylist(pl);
  await renderPlaylists();
  openPlaylistEdit(pl);
});

let _editingPlaylist = null;

async function openPlaylistEdit(pl) {
  _editingPlaylist = { ...pl, songIds: [...pl.songIds] };
  document.getElementById('plEditTitle').textContent = 'Edit: ' + pl.name;
  document.getElementById('plNameInput').value = pl.name;
  document.getElementById('playlistEditOverlay').classList.remove('hidden');
  await refreshPlEditSongs();
}

async function refreshPlEditSongs() {
  const pl    = _editingPlaylist;
  const songs = await getAllSongs();
  const byId  = Object.fromEntries(songs.map(s => [s.id, s]));

  // Current songs in playlist
  const listEl = document.getElementById('plSongList');
  listEl.innerHTML = '';
  if (!pl.songIds.length) {
    listEl.innerHTML = '<p style="color:var(--text-dim);font-size:12px;margin:0">No songs yet — add from below</p>';
  }
  for (let i = 0; i < pl.songIds.length; i++) {
    const sid = pl.songIds[i];
    const s   = byId[sid];
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
    row.innerHTML = `
      <span style="flex:1;font-size:12px">${esc(s ? s.title : '(unknown)')}</span>
      <button class="btn btn-sm btn-dim" data-moveup="${i}" style="padding:2px 5px">↑</button>
      <button class="btn btn-sm btn-dim" data-movedn="${i}" style="padding:2px 5px">↓</button>
      <button class="btn btn-sm btn-red" data-rem="${i}"    style="padding:2px 5px">✕</button>`;
    listEl.appendChild(row);
  }

  // Buttons in song list
  listEl.querySelectorAll('button[data-moveup]').forEach(b => {
    b.addEventListener('click', () => {
      const i = parseInt(b.dataset.moveup);
      if (i > 0) { [pl.songIds[i - 1], pl.songIds[i]] = [pl.songIds[i], pl.songIds[i - 1]]; refreshPlEditSongs(); }
    });
  });
  listEl.querySelectorAll('button[data-movedn]').forEach(b => {
    b.addEventListener('click', () => {
      const i = parseInt(b.dataset.movedn);
      if (i < pl.songIds.length - 1) { [pl.songIds[i], pl.songIds[i + 1]] = [pl.songIds[i + 1], pl.songIds[i]]; refreshPlEditSongs(); }
    });
  });
  listEl.querySelectorAll('button[data-rem]').forEach(b => {
    b.addEventListener('click', () => {
      pl.songIds.splice(parseInt(b.dataset.rem), 1);
      refreshPlEditSongs();
    });
  });

  // Add songs section
  const addEl = document.getElementById('plAddSongs');
  addEl.innerHTML = '';
  const notIn = songs.filter(s => !pl.songIds.includes(s.id));
  for (const s of notIn) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
    row.innerHTML = `<span style="flex:1;font-size:12px">${esc(s.title)}</span>
      <button class="btn btn-sm btn-cyan" data-addid="${s.id}">+ Add</button>`;
    row.querySelector('button').addEventListener('click', () => {
      pl.songIds.push(s.id);
      refreshPlEditSongs();
    });
    addEl.appendChild(row);
  }
}

document.getElementById('btnSavePlaylist').addEventListener('click', async () => {
  if (!_editingPlaylist) return;
  _editingPlaylist.name = document.getElementById('plNameInput').value.trim() || _editingPlaylist.name;
  await savePlaylist(_editingPlaylist);
  document.getElementById('playlistEditOverlay').classList.add('hidden');
  _editingPlaylist = null;
  await renderPlaylists();
});

document.getElementById('btnCancelPlaylist').addEventListener('click', () => {
  document.getElementById('playlistEditOverlay').classList.add('hidden');
  _editingPlaylist = null;
});

document.getElementById('playlistEditOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('playlistEditOverlay'))
    document.getElementById('playlistEditOverlay').classList.add('hidden');
});

// ── Custom Hitsound Library ───────────────────────────────────────────────────
function renderCustomHitsoundList() {
  const container = document.getElementById('customHitsoundList');
  if (!container) return;
  container.innerHTML = '';
  const s = getSettings();
  const lib = s.customHitsounds || {};
  const names = Object.keys(lib);
  if (!names.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:11px;margin:0">No custom sounds uploaded yet.</p>';
    return;
  }
  for (const name of names) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
    const lbl = document.createElement('span');
    lbl.textContent = '\u266a ' + name;
    lbl.style.cssText = 'flex:1;font-size:12px;color:var(--text)';
    const testBtn = document.createElement('button');
    testBtn.className = 'btn btn-sm btn-dim';
    testBtn.textContent = '\u25b6';
    testBtn.title = 'Preview';
    testBtn.style.cssText = 'padding:2px 6px;font-size:10px';
    testBtn.addEventListener('click', async () => {
      if (!_testCtx) _testCtx = new AudioContext();
      const buf = await buildCustomHitsoundByName(_testCtx, name);
      if (!buf) return;
      const src = _testCtx.createBufferSource();
      src.buffer = buf;
      src.connect(_testCtx.destination);
      src.start(0);
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-red';
    delBtn.textContent = '\u2715';
    delBtn.title = 'Delete';
    delBtn.style.cssText = 'padding:2px 6px;font-size:10px';
    delBtn.addEventListener('click', () => {
      const cur = getSettings();
      const newLib = { ...(cur.customHitsounds || {}) };
      delete newLib[name];
      saveSettings({ customHitsounds: newLib });
      renderCustomHitsoundList();
      buildLaneHitsoundUI();
      buildLaneSliderEndUI();
    });
    row.appendChild(lbl);
    row.appendChild(testBtn);
    row.appendChild(delBtn);
    container.appendChild(row);
  }
}

const _customHitsoundUpload = document.getElementById('customHitsoundUpload');
const _btnAddCustomHitsound = document.getElementById('btnAddCustomHitsound');

if (_btnAddCustomHitsound) {
  _btnAddCustomHitsound.addEventListener('click', () => {
    if (_customHitsoundUpload) _customHitsoundUpload.click();
  });
}

if (_customHitsoundUpload) {
  _customHitsoundUpload.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 500 * 1024) { showToast('File too large (max 500KB).', 3000, true); e.target.value = ''; return; }
    const s = getSettings();
    const lib = s.customHitsounds || {};
    if (Object.keys(lib).length >= 10) { showToast('Max 10 custom sounds. Delete one first.', 3000, true); e.target.value = ''; return; }
    // Use filename without extension as the name
    let name = f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 30);
    // Avoid duplicate names
    if (lib[name]) {
      let n = 2;
      while (lib[name + '_' + n]) n++;
      name = name + '_' + n;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 8192)
        bin += String.fromCharCode(...bytes.slice(i, i + 8192));
      const newLib = { ...(getSettings().customHitsounds || {}), [name]: btoa(bin) };
      saveSettings({ customHitsounds: newLib });
      renderCustomHitsoundList();
      buildLaneHitsoundUI();
      buildLaneSliderEndUI();
    };
    reader.readAsArrayBuffer(f);
    e.target.value = '';
  });
}

renderCustomHitsoundList();

// ── Per-Category Reset Settings ───────────────────────────────────────────────
const CATEGORY_KEYS = {
  gameplay: ['scrollSpeed', 'audioOffset', 'practiceSpeed', 'practiceMode', 'enableGlide', 'strictRelease'],
  audio: ['masterVolume', 'musicVolume', 'metronomeVolume', 'hitsound', 'hitsoundVolume', 'hitsoundAutoPitch', 'hitsoundPitchRange', 'laneHitsounds', 'laneSliderEndSounds', 'sliderTickSound', 'sliderEndSound', 'customHitsounds', 'bgMusic', 'bgMusicMode', 'bgMusicVolume', 'bgMusicWidget', 'separatePopupMusic', 'popupBgMusicMode', 'popupBgMusicVolume'],
  visuals: ['hideTooltips', 'appBgImageOpacity', 'appBgImageSaturation', 'appBgImageBlur', 'popupBgImageOpacity', 'popupBgImageSaturation', 'popupBgImageBlur', 'separatePopupBg'],
  controls: ['keybinds', 'keybindProfiles', 'holdThreshold', 'tapTempoKey'],
};

document.getElementById('btnResetGameplay')?.addEventListener('click', async () => {
  if (await krConfirm('Reset gameplay settings?')) { resetSettings(CATEGORY_KEYS.gameplay); loadSettingsUI(); }
});
document.getElementById('btnResetAudio')?.addEventListener('click', async () => {
  if (await krConfirm('Reset audio settings?')) { resetSettings(CATEGORY_KEYS.audio); loadSettingsUI(); buildLaneHitsoundUI(); buildLaneSliderEndUI(); renderCustomHitsoundList(); }
});
document.getElementById('btnResetVisuals')?.addEventListener('click', async () => {
  if (await krConfirm('Reset visual settings?')) { resetSettings(CATEGORY_KEYS.visuals); saveAppBgImage(''); saveAppBgMeta(null); deleteBg('app_bg'); savePopupBgImage(''); savePopupBgMeta(null); deleteBg('popup_bg'); loadSettingsUI(); _loadAppBgUI(); if (typeof applyAppBg === 'function') applyAppBg(); }
});
document.getElementById('btnResetControls')?.addEventListener('click', async () => {
  if (await krConfirm('Reset control settings?')) { resetSettings(CATEGORY_KEYS.controls); loadSettingsUI(); }
});
