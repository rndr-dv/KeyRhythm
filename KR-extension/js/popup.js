// Open an extension page in a new tab via background.js
function openPage(path) {
  chrome.runtime.sendMessage({ type: 'openTab', path });
}

// ── DOM ───────────────────────────────────────────────────────────────────────
const searchBox      = document.getElementById('searchBox');
const sortSelect     = document.getElementById('sortSelect');
const songItemsEl    = document.getElementById('songItems');
const btnFullscreen  = document.getElementById('btnFullscreen');
const btnCreate      = document.getElementById('btnCreate');
const btnImport      = document.getElementById('btnImport');
const btnImportCode  = document.getElementById('btnImportCode');
const btnSettings    = document.getElementById('btnSettings');
const settingsPanel  = document.getElementById('settingsPanel');
const importFile     = document.getElementById('importFile');

btnFullscreen.addEventListener('click', () => openPage('index.html'));
btnCreate.addEventListener('click',     () => openPage('create.html'));
btnImport.addEventListener('click',     () => importFile.click());
btnSettings.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
  if (!settingsPanel.classList.contains('hidden')) livePanel.classList.add('hidden');
});

// ── Settings panel ─────────────────────────────────────────────────────────────
const sSpeed          = document.getElementById('sSpeed');
const sSpeedVal       = document.getElementById('sSpeedVal');
const sOffset         = document.getElementById('sOffset');
const sOffsetVal      = document.getElementById('sOffsetVal');
const sPractice       = document.getElementById('sPractice');
const sPracticeVal    = document.getElementById('sPracticeVal');
const sPracticeMode   = document.getElementById('sPracticeMode');
const sHitsound       = document.getElementById('sHitsound');
const sHitsoundVol    = document.getElementById('sHitsoundVol');
const sHitsoundVolVal = document.getElementById('sHitsoundVolVal');
const btnTestHitsound = document.getElementById('btnTestHitsound');
const sMasterVol      = document.getElementById('sMasterVol');
const sMasterVolVal   = document.getElementById('sMasterVolVal');
const sMusicVol       = document.getElementById('sMusicVol');
const sMusicVolVal    = document.getElementById('sMusicVolVal');
const sMetronomeVol   = document.getElementById('sMetronomeVol');
const sMetronomeVolVal= document.getElementById('sMetronomeVolVal');

function loadSettingsUI() {
  const s = getSettings();
  sSpeed.value          = s.scrollSpeed;
  sSpeedVal.textContent = s.scrollSpeed.toFixed(1) + '×';
  sOffset.value         = s.audioOffset;
  sOffsetVal.textContent = (s.audioOffset >= 0 ? '+' : '') + s.audioOffset + 'ms';
  sPractice.value       = s.practiceSpeed;
  sPracticeVal.textContent = parseFloat(s.practiceSpeed).toFixed(2) + '×';
  sPracticeMode.checked = !!s.practiceMode;
  sPractice.disabled = !s.practiceMode;
  const _sGlide = document.getElementById('sGlide');
  if (_sGlide) _sGlide.checked = s.enableGlide !== false;
  const _sHideTips = document.getElementById('sHideTooltips');
  if (_sHideTips) _sHideTips.checked = !!s.hideTooltips;
  sHitsound.value       = s.hitsound || 'tick';
  sHitsoundVol.value    = s.hitsoundVolume !== undefined ? s.hitsoundVolume : 0.5;
  sHitsoundVolVal.textContent = Math.round((s.hitsoundVolume !== undefined ? s.hitsoundVolume : 0.5) * 100) + '%';
  sMasterVol.value      = s.masterVolume !== undefined ? s.masterVolume : 1.0;
  sMasterVolVal.textContent = Math.round((s.masterVolume !== undefined ? s.masterVolume : 1.0) * 100) + '%';
  sMusicVol.value       = s.musicVolume !== undefined ? s.musicVolume : 1.0;
  sMusicVolVal.textContent = Math.round((s.musicVolume !== undefined ? s.musicVolume : 1.0) * 100) + '%';
  sMetronomeVol.value   = s.metronomeVolume !== undefined ? s.metronomeVolume : 0.5;
  sMetronomeVolVal.textContent = Math.round((s.metronomeVolume !== undefined ? s.metronomeVolume : 0.5) * 100) + '%';
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
  if (!sPracticeMode.checked) {
    sPractice.value = 1.0;
    sPracticeVal.textContent = '1.00×';
    saveSettings({ practiceSpeed: 1.0 });
  }
  sPractice.disabled = !sPracticeMode.checked;
});
const sGlide = document.getElementById('sGlide');
if (sGlide) {
  sGlide.addEventListener('change', () => {
    saveSettings({ enableGlide: sGlide.checked });
  });
}
const _pHideTips = document.getElementById('sHideTooltips');
if (_pHideTips) {
  _pHideTips.addEventListener('change', () => {
    saveSettings({ hideTooltips: _pHideTips.checked });
  });
}
sHitsound.addEventListener('change', () => {
  saveSettings({ hitsound: sHitsound.value });
});
sHitsoundVol.addEventListener('input', () => {
  const v = parseFloat(sHitsoundVol.value);
  sHitsoundVolVal.textContent = Math.round(v * 100) + '%';
  saveSettings({ hitsoundVolume: v });
});
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

document.getElementById('btnOpenSkinEditor').addEventListener('click', () => {
  openPage('skin-editor.html');
});
document.getElementById('btnResetAllSettings').addEventListener('click', async () => {
  if (await krConfirm('Reset all settings to defaults?')) {
    resetSettings('all');
    loadSettingsUI();
    loadLiveSettingsUI();
    loadLiveKeybindsUI();
  }
});

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
  src.buffer      = buf;
  gain.gain.value = parseFloat(sHitsoundVol.value);
  src.connect(gain);
  gain.connect(_testCtx.destination);
  src.start(0);
});

async function decodeShareCode(code) {
  try { return JSON.parse(atob(code)); } catch (_) {}
  try { return JSON.parse(await decompress(code)); } catch (_) {}
  throw new Error('Cannot decode share code');
}

// ── Import from file ──────────────────────────────────────────────────────────
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
    await renderList();
  } catch (err) {
    showToast('Import failed: ' + err.message, 3000, true);
  }
  importFile.value = '';
});

// ── Import from share code ────────────────────────────────────────────────────
btnImportCode.addEventListener('click', async () => {
  const code = await krPrompt('Paste share code:', 'Share code...');
  if (!code) return;
  try {
    const data = await decodeShareCode(code.trim());
    await importSongData(data);
    await renderList();
  } catch (_) {
    showToast('Invalid share code.', 3000, true);
  }
});

async function importSongData(data) {
  if (!Array.isArray(data.notes) || !data.title) throw new Error('Missing required fields');
  const id = 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const song = {
    id,
    title:      data.title,
    artist:     data.artist     || '',
    difficulty: data.difficulty || '',
    offset:     data.offset     || 0,
    laneCount:  data.laneCount  || 3,
    bpm:        data.bpm        || 0,
    notes:      data.notes,
    createdAt:  Date.now(),
  };
  await saveSong(song);
  if (data._audioAB) {
    try { await saveAudio(id, data._audioAB); } catch (_) {}
  } else if (data.audio) {
    try {
      const binary = atob(data.audio);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      await saveAudio(id, bytes.buffer);
    } catch (_) {}
  }
}

async function readKRZ2(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 8) return null;
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'KRZ2') return null;
  const gzipLen = new DataView(arrayBuffer).getUint32(4, true);
  const gzipSlice = bytes.slice(8, 8 + gzipLen);
  const stream = new DecompressionStream('gzip');
  const w = stream.writable.getWriter();
  w.write(gzipSlice); w.close();
  const jsonStr = await new Response(stream.readable).text();
  const data = JSON.parse(jsonStr);
  if (8 + gzipLen < bytes.length) {
    data._audioAB = bytes.slice(8 + gzipLen).buffer;
  }
  return data;
}

// ── Song list ─────────────────────────────────────────────────────────────────
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
    songItemsEl.innerHTML = q
      ? '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">No matches</div><div class="empty-state-hint">Try a different search term</div></div>'
      : '<div class="empty-state"><div class="empty-state-icon">♪</div><div class="empty-state-title">No levels yet</div><div class="empty-state-hint">Create a level or import a file to get started</div></div>';
    return;
  }

  songItemsEl.innerHTML = '';
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
          ${hs ? '<span class="hs-tag">★ ' + hs.score.toLocaleString() + '</span>' : ''}
        </div>
      </div>
      <div class="song-actions">
        <button class="btn btn-sm btn-green" data-id="${s.id}" data-act="play"  title="Play">▶</button>
        <button class="btn btn-sm btn-cyan"  data-id="${s.id}" data-act="edit"  title="Edit">✎</button>
        <button class="btn btn-sm btn-dim"   data-id="${s.id}" data-act="share" title="Copy share code">⎘</button>
        <button class="btn btn-sm btn-red"   data-id="${s.id}" data-act="del"   title="Delete">✕</button>
      </div>`;
    songItemsEl.appendChild(div);
  }
  // Re-init tooltips for dynamically created elements
  if (typeof initTooltips === 'function') initTooltips(songItemsEl);
}

songItemsEl.addEventListener('click', async e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const { id, act } = btn.dataset;

  if (act === 'play') {
    openPage(`game.html?id=${id}`);
  } else if (act === 'edit') {
    openPage(`editor.html?id=${id}`);
  } else if (act === 'del') {
    if (await krConfirm('Delete this level?')) {
      await deleteSong(id);
      await renderList();
    }
  } else if (act === 'share') {
    btn.textContent = '…';
    try {
      const s   = await getSong(id);
      const out = {
        version: '1.2', title: s.title, artist: s.artist || '',
        difficulty: s.difficulty || '', offset: s.offset || 0,
        laneCount: s.laneCount || 3, bpm: s.bpm || 0, notes: s.notes,
      };
      // Include audio
      const ab = await getAudio(id);
      if (ab) {
        const bytes = new Uint8Array(ab);
        const sizeMB = bytes.length / 1024 / 1024;
        if (sizeMB <= 5) {
          let bin = '';
          for (let i = 0; i < bytes.length; i += 8192)
            bin += String.fromCharCode(...bytes.slice(i, i + 8192));
          out.audio = btoa(bin);
        }
      }
      const compressed = await compress(JSON.stringify(out));
      await navigator.clipboard.writeText(compressed);
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = '⎘'; }, 1500);
    } catch (_) {
      btn.textContent = '⎘';
    }
  }
});

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function songDuration(notes) {
  if (!notes || !notes.length) return '';
  const secs = Math.max(...notes.map(n => (n.time || 0) + (n.duration || 0)));
  if (!isFinite(secs) || secs <= 0) return '';
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
  return m + ':' + String(s).padStart(2, '0');
}

songItemsEl.innerHTML = '<div class="loading-state"><div class="kr-spinner"></div>Loading…</div>';
renderList();

// ── Live mode ─────────────────────────────────────────────────────────────────
const btnLive         = document.getElementById('btnLive');
const livePanel       = document.getElementById('livePanel');
const liveStatus      = document.getElementById('liveStatus');
const btnAutoPlay     = document.getElementById('btnAutoPlay');
const btnLiveRec      = document.getElementById('btnLiveRec');
const btnLiveStop     = document.getElementById('btnLiveStop');
const btnLiveSettings = document.getElementById('btnLiveSettings');
const liveSettingsDiv = document.getElementById('liveSettings');

btnLiveSettings.addEventListener('click', () => {
  liveSettingsDiv.classList.toggle('hidden');
});

const lDelay    = document.getElementById('lDelay');
const lDelayVal = document.getElementById('lDelayVal');
const lClarity    = document.getElementById('lClarity');
const lClarityVal = document.getElementById('lClarityVal');
const lVolume    = document.getElementById('lVolume');
const lVolumeVal = document.getElementById('lVolumeVal');
const lNoteGap    = document.getElementById('lNoteGap');
const lNoteGapVal = document.getElementById('lNoteGapVal');
const lNoteLen    = document.getElementById('lNoteLen');
const lNoteLenVal = document.getElementById('lNoteLenVal');
const lMerging       = document.getElementById('lMerging');
const lChordRate     = document.getElementById('lChordRate');
const lChordRateVal  = document.getElementById('lChordRateVal');
const lHeldChords    = document.getElementById('lHeldChords');
const lOverlapNotes  = document.getElementById('lOverlapNotes');
const lOverlapDelay  = document.getElementById('lOverlapDelay');
const lOverlapDelayVal = document.getElementById('lOverlapDelayVal');
const lScrollSpeed    = document.getElementById('lScrollSpeed');
const lScrollSpeedVal = document.getElementById('lScrollSpeedVal');
const lDifficulty    = document.getElementById('liveDifficulty');

const LIVE_DIFFICULTY = {
  easy:   { hitWindowMs: 200, scrollSpeed: 0.9, noteDelay: 400 },
  normal: { hitWindowMs: 150, scrollSpeed: 1.0, noteDelay: 250 },
  hard:   { hitWindowMs:  80, scrollSpeed: 1.1, noteDelay: 150 },
  expert: { hitWindowMs:  50, scrollSpeed: 1.25, noteDelay:  80 },
};

function loadLiveSettingsUI() {
  const s = getSettings();
  lDifficulty.value = s.liveDifficulty       ?? 'normal';
  _syncDifficultySliders(lDifficulty.value);
  lDelay.value      = s.liveDelayLength      ?? 1000;
  lDelayVal.textContent = (s.liveDelayLength ?? 1000) + 'ms';
  lClarity.value    = s.liveClarityThreshold ?? 0.4;
  lClarityVal.textContent = (s.liveClarityThreshold ?? 0.4).toFixed(2);
  lVolume.value     = s.liveVolumeThreshold  ?? 0.04;
  lVolumeVal.textContent = (s.liveVolumeThreshold ?? 0.04).toFixed(3);
  lNoteGap.value    = s.liveNoteDelay        ?? 250;
  lNoteGapVal.textContent = (s.liveNoteDelay ?? 250) + 'ms';
  lNoteLen.value    = s.liveNoteLength       ?? 120;
  lNoteLenVal.textContent = (s.liveNoteLength ?? 120) + 'ms';
  lMerging.checked  = s.liveAllowMerging !== false;
  lChordRate.value  = s.liveChordRate ?? 0.15;
  lChordRateVal.textContent = (s.liveChordRate ?? 0.15).toFixed(2);
  lHeldChords.checked   = s.liveHeldChords !== false;
  lOverlapNotes.checked = s.liveOverlapNotes !== false;
  lOverlapDelay.value   = s.liveOverlapDelay ?? 500;
  lOverlapDelayVal.textContent = (s.liveOverlapDelay ?? 500) + 'ms';
  lScrollSpeed.value = s.liveScrollSpeed ?? 1.0;
  lScrollSpeedVal.textContent = (s.liveScrollSpeed ?? 1.0).toFixed(1) + '×';
  const lHoriz = document.getElementById('lHorizontal');
  if (lHoriz) lHoriz.checked = !!s.liveHorizontalMode;
  const lLiveHs = document.getElementById('lLiveHitsound');
  if (lLiveHs) lLiveHs.checked = s.liveHitsound !== false;
  const lLanes = document.getElementById('liveLanes');
  if (lLanes) lLanes.value = s.liveLanes ?? 3;
}
loadLiveSettingsUI();

document.getElementById('liveLanes').addEventListener('change', () => {
  saveSettings({ liveLanes: parseInt(document.getElementById('liveLanes').value) || 3 });
});

lDelay.addEventListener('input', () => {
  const v = parseInt(lDelay.value);
  lDelayVal.textContent = v + 'ms';
  saveSettings({ liveDelayLength: v });
});
lClarity.addEventListener('input', () => {
  const v = parseFloat(lClarity.value);
  lClarityVal.textContent = v.toFixed(2);
  saveSettings({ liveClarityThreshold: v });
});
lVolume.addEventListener('input', () => {
  const v = parseFloat(lVolume.value);
  lVolumeVal.textContent = v.toFixed(3);
  saveSettings({ liveVolumeThreshold: v });
});
lNoteGap.addEventListener('input', () => {
  const v = parseInt(lNoteGap.value);
  lNoteGapVal.textContent = v + 'ms';
  saveSettings({ liveNoteDelay: v });
  // Dragging the slider switches to custom difficulty
  if (lDifficulty.value !== 'custom') {
    lDifficulty.value = 'custom';
    saveSettings({ liveDifficulty: 'custom' });
    lNoteGap.disabled = false;
  }
});
lNoteLen.addEventListener('input', () => {
  const v = parseInt(lNoteLen.value);
  lNoteLenVal.textContent = v + 'ms';
  saveSettings({ liveNoteLength: v });
});
lMerging.addEventListener('change', () => {
  saveSettings({ liveAllowMerging: lMerging.checked });
});
lChordRate.addEventListener('input', () => {
  const v = parseFloat(lChordRate.value);
  lChordRateVal.textContent = v.toFixed(2);
  saveSettings({ liveChordRate: v });
});
lHeldChords.addEventListener('change', () => {
  saveSettings({ liveHeldChords: lHeldChords.checked });
});
lOverlapNotes.addEventListener('change', () => {
  saveSettings({ liveOverlapNotes: lOverlapNotes.checked });
});
lOverlapDelay.addEventListener('input', () => {
  const v = parseInt(lOverlapDelay.value);
  lOverlapDelayVal.textContent = v + 'ms';
  saveSettings({ liveOverlapDelay: v });
});
lScrollSpeed.addEventListener('input', () => {
  const v = parseFloat(lScrollSpeed.value);
  lScrollSpeedVal.textContent = v.toFixed(1) + '×';
  saveSettings({ liveScrollSpeed: v, liveDifficulty: 'custom' });
  lDifficulty.value = 'custom';
});
const lHorizontal = document.getElementById('lHorizontal');
if (lHorizontal) {
  lHorizontal.addEventListener('change', () => {
    saveSettings({ liveHorizontalMode: lHorizontal.checked });
  });
}
const lLiveHitsound = document.getElementById('lLiveHitsound');
if (lLiveHitsound) {
  lLiveHitsound.addEventListener('change', () => {
    saveSettings({ liveHitsound: lLiveHitsound.checked });
  });
}
lDifficulty.addEventListener('change', () => {
  const val = lDifficulty.value;
  saveSettings({ liveDifficulty: val });
  _syncDifficultySliders(val);
});

function _syncDifficultySliders(diff) {
  const preset = LIVE_DIFFICULTY[diff];
  const isCustom = !preset;
  lNoteGap.disabled = !isCustom;
  lScrollSpeed.disabled = !isCustom;
  if (preset) {
    lNoteGap.value = preset.noteDelay;
    lNoteGapVal.textContent = preset.noteDelay + 'ms';
    lScrollSpeed.value = preset.scrollSpeed;
    lScrollSpeedVal.textContent = preset.scrollSpeed.toFixed(1) + '×';
    saveSettings({ liveScrollSpeed: preset.scrollSpeed });
  }
}

btnLive.addEventListener('click', () => {
  livePanel.classList.toggle('hidden');
  const open = !livePanel.classList.contains('hidden');
  if (open) settingsPanel.classList.add('hidden');
  btnLive.classList.toggle('active', open);
});

function setLiveStatus(text, active) {
  liveStatus.textContent = text;
  liveStatus.style.color = active ? '#ff4060' : 'var(--text-dim)';
  btnLiveStop.classList.toggle('hidden', !active);
  btnAutoPlay.disabled = active;
  btnLiveRec.disabled  = active;
}

async function startLive(mode) {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) {}
  if (!tab?.url || /^chrome/i.test(tab.url) || /^about:/i.test(tab.url)) {
    showToast('Cannot use Live mode on this page. Navigate to a page with audio or video first.', 3000, true);
    return;
  }

  // Request host permission for this origin
  const origin = new URL(tab.url).origin + '/*';
  try {
    const already = await chrome.permissions.contains({ origins: [origin] });
    if (!already) {
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) return;
    }
  } catch (_) {
    // optional_host_permissions may not be supported in all configs — proceed anyway
  }

  // Inject content script (guard in liveCS.js prevents double-exec)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['liveCS.js'],
    });
  } catch (err) {
    showToast('Could not inject Live overlay: ' + err.message, 3000, true);
    return;
  }

  // Build config from current settings
  const s         = getSettings();
  const laneCount = parseInt(document.getElementById('liveLanes').value) || 3;
  const keybinds  = Object.values(getKeybindsForLanes(laneCount));
  const skin      = getSkin ? getSkin() : null;
  const fullSkin  = typeof applySkin === 'function' ? applySkin(skin) : null;
  const laneColors = fullSkin && fullSkin.laneColors && fullSkin.laneColors.length >= laneCount
    ? fullSkin.laneColors
    : null;
  const diff = LIVE_DIFFICULTY[s.liveDifficulty] || null;

  chrome.tabs.sendMessage(tab.id, {
    type:   'LIVE_START',
    config: {
      mode,
      laneCount,
      keybinds,
      scrollSpeed:       diff ? diff.scrollSpeed : (s.liveScrollSpeed ?? 1.0),
      laneColors,
      hitWindowMs:       diff ? diff.hitWindowMs  : 150,
      holdThresholdMs:   s.holdThreshold     || 100,
      delayLength:       s.liveDelayLength      ?? 1000,
      clarityThreshold:  s.liveClarityThreshold ?? 0.4,
      volumeThreshold:   s.liveVolumeThreshold  ?? 0.04,
      noteDelay:         diff ? diff.noteDelay   : (s.liveNoteDelay ?? 250),
      noteLength:        s.liveNoteLength       ?? 120,
      allowMerging:      s.liveAllowMerging     !== false,
      chordRate:         s.liveChordRate        ?? 0.15,
      heldChords:        s.liveHeldChords       !== false,
      overlapNotes:      s.liveOverlapNotes     !== false,
      overlapDelay:      s.liveOverlapDelay     ?? 500,
      exitKey:           s.liveExitKey  || 'Escape',
      pauseKey:          s.livePauseKey || ' ',
      horizontalMode:    !!s.liveHorizontalMode,
      hitsound:          s.hitsound || 'tick',
      laneHitsounds:     s.laneHitsounds || {},
      hitsoundVolume:    s.hitsoundVolume ?? 0.5,
      masterVolume:      s.masterVolume ?? 1.0,
      liveHitsound:      s.liveHitsound !== false,
      hitsoundAutoPitch: !!s.hitsoundAutoPitch,
      hitsoundPitchRange: s.hitsoundPitchRange ?? 0.2,
      skin:              fullSkin,
      strictRelease:     !!s.strictRelease,
    },
  }, () => {
    // Ignore "no receiving end" errors (tab may not have loaded yet)
    void chrome.runtime.lastError;
  });

  setLiveStatus(mode === 'AUTO' ? '● AUTO' : '● REC', true);
}

async function stopLive() {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) {}
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'LIVE_STOP' }, () => {
      void chrome.runtime.lastError;
    });
  }
  setLiveStatus('● OFF', false);
}

btnAutoPlay.addEventListener('click', () => startLive('AUTO'));
btnLiveRec.addEventListener('click',  () => startLive('RECORD'));
btnLiveStop.addEventListener('click', stopLive);

// ── Live keybind capture ─────────────────────────────────────────────────────
const lExitKeyBtn  = document.getElementById('lExitKey');
const lPauseKeyBtn = document.getElementById('lPauseKey');

// Key display uses shared displayKeyName() from settings.js
const displayKey = displayKeyName;

function loadLiveKeybindsUI() {
  const s = getSettings();
  lExitKeyBtn.textContent  = displayKey(s.liveExitKey || 'Escape');
  lPauseKeyBtn.textContent = displayKey(s.livePauseKey || ' ');
}
loadLiveKeybindsUI();

function startLiveActionCapture(btn, settingsKey) {
  btn.textContent = '…press key…';
  btn.style.borderColor = 'var(--yellow)';
  const handler = e => {
    e.preventDefault();
    e.stopPropagation();
    const key = e.key;
    btn.textContent = displayKey(key);
    btn.style.borderColor = '';
    saveSettings({ [settingsKey]: key });
    document.removeEventListener('keydown', handler, true);
  };
  document.addEventListener('keydown', handler, true);
}

lExitKeyBtn.addEventListener('click',  () => startLiveActionCapture(lExitKeyBtn, 'liveExitKey'));
lPauseKeyBtn.addEventListener('click', () => startLiveActionCapture(lPauseKeyBtn, 'livePauseKey'));
