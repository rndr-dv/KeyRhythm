// ── Constants ─────────────────────────────────────────────────────────────────
// ALL_LANE_COLORS is defined in skins.js (loaded before editor.js)
const ALL_LANE_NAMES  = ['Left [', 'Mid ]', 'Right \\', 'Lane 4', 'Lane 5', 'Lane 6', 'Lane 7'];
const ALL_DEFAULT_KEYS = ['[', ']', '\\', 'Enter', 'a', 's', 'd'];

const MIN_HOLD_DUR = 0.1;

const HEADER_H   = 24;
const WAVEFORM_H = 80;
const LANE_H     = 70;
const NOTE_W     = 6;
const NOTE_H     = 18;

// ── Dynamic state (set after song load) ───────────────────────────────────────
let LANE_COUNT       = 3;
let TOTAL_H          = HEADER_H + WAVEFORM_H + LANE_H * 3;
let KEY_LANE_MAP     = { '[': 0, ']': 1, '\\': 2 };
let activeLaneColors = ALL_LANE_COLORS.slice(0, 3);  // updated after song+skin load
let _tc = null;  // theme colors cache (set from getThemeColors())

// ── State ─────────────────────────────────────────────────────────────────────
let song     = null;
let notes    = [];
let modified = false;

// ── Autosave ─────────────────────────────────────────────────────────────────
let _autosaveTimer = null;
let _autosaveDebounce = null;

async function doSave() {
  song.notes      = notes.map(serializeNote);
  song.difficulty = diffSelect.value;
  song.bpm        = snapBpm;
  song.bpmOffset  = snapOffset;
  song.bpmSections = dynamicBpmOn ? bpmSections : [];
  song.trimStart  = trimStart;
  song.trimEnd    = trimEnd;
  await saveSong(song);
  modified = false;
}

function showSaved(label) {
  const btn = document.getElementById('btnSave');
  if (!btn) return;
  btn.textContent = label || '✓ Saved';
  setTimeout(() => { btn.textContent = 'Save'; }, 1500);
}

function markModified() {
  modified = true;
  if (getSettings().autosave) {
    clearTimeout(_autosaveDebounce);
    _autosaveDebounce = setTimeout(async () => {
      await doSave();
      showSaved('✓ Auto-saved');
    }, 800);
  }
}

// 30s periodic safety-net timer
setInterval(() => {
  if (modified && getSettings().autosave) {
    doSave().then(() => showSaved('✓ Auto-saved'));
  }
}, 30000);

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', e => {
  if (modified) { e.preventDefault(); e.returnValue = ''; }
});

// Audio
let audioCtx    = null;
let audioBuffer = null;
let audioSrc    = null;
let isPlaying   = false;
let playStartAt = 0;
let playOffset  = 0;
let duration    = 0;
let trimStart   = 0;
let trimEnd     = 0;  // set to duration when audio loads
let draggingTrim = null;  // 'start' | 'end' | null
let trimDragOldStart = 0;

let isSeeking = false;
let editorSpeed = 1.0;

// Waveform
let waveformPeaks       = null;
let waveformPeaksPerSec = 500;

// View
let viewStart = 0;
let pxPerSec  = 150;
const MIN_PPS = 30;
const MAX_PPS = 1200;

// BPM grid snap
let snapBpm    = 0;
let snapOffset = 0;
let snapDiv    = 4;
let snapOn     = false;

// ── Dynamic BPM sections ──────────────────────────────────────────────────────
let bpmSections   = [];       // [{ startTime, endTime, bpm, confidence }]
let dynamicBpmOn  = false;    // dynamic mode toggle state
const SECTION_COLORS = [
  'rgba(192, 96,255,0.08)', 'rgba(64,196,255,0.08)',
  'rgba(96,255,144,0.08)', 'rgba(255,128,64,0.08)',
  'rgba(255,64,128,0.08)', 'rgba(255,208,64,0.08)'
];

// Interaction
let selectedNote  = null;
let selectedIdx   = -1;
let multiSel      = new Set();
let dragging      = false;
let dragStartX    = 0;
let dragOrigTime  = 0;
let dragOrigTimes = [];
let dragRefs      = [];   // other selected notes dragged alongside selectedNote
let selBox        = null; // rubber-band selection box { x0, y0, x1, y1 }
let copyBuffer    = null; // copied notes (time-relative) for paste
let copyBaseTime  = 0;   // time of first note when copied (for beat-offset paste)
let tapMode       = false;
let resizing      = null;  // note reference (not index) to avoid stale index after sort
let resizeStartX  = 0;
let resizeOrigDur = 0;
let preDragState  = null; // snapshot before drag/resize for correct undo
let seekDragging  = false;
let wasPlayingBeforeSeekDrag = false;

// Re-record mode
let reRecording    = false;
let reRecStartTime = 0;
let reRecNotes     = [];   // notes recorded during re-record
let reRecHeld      = {};   // lane → { time } for held keys during re-record
const btnReRecord   = document.getElementById('btnReRecord');
const btnCancelRec  = document.getElementById('btnCancelRec');
let reRecOrigNotes  = null; // snapshot for cancel

// Undo/Redo
const undoStack = [];
const redoStack = [];
const MAX_UNDO  = 80;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas       = document.getElementById('editorCanvas');
const ctx          = canvas.getContext('2d');
const edTitle      = document.getElementById('edTitle');
const audioTimeEl  = document.getElementById('audioTimeEl');
const seekBar      = document.getElementById('seekBar');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnSave      = document.getElementById('btnSave');
const exportSel    = document.getElementById('exportSel');
const btnMenu      = document.getElementById('btnMenu');
const btnLoadAudio = document.getElementById('btnLoadAudio');
const btnZoomIn    = document.getElementById('btnZoomIn');
const btnZoomOut   = document.getElementById('btnZoomOut');
const btnUndo      = document.getElementById('btnUndo');
const btnRedo      = document.getElementById('btnRedo');
const snapMode     = document.getElementById('snapMode');
const btnSnap      = document.getElementById('btnSnap');
const btnTapBpm    = document.getElementById('btnTapBpm');
const btnTest      = document.getElementById('btnTest');
const audioFileIn  = document.getElementById('audioFileInput');
const btnAutotrim  = document.getElementById('btnAutotrim');
const btnResetTrim = document.getElementById('btnResetTrim');
const trimPadBeats = document.getElementById('trimPadBeats');
const infoNotes    = document.getElementById('infoNotes');
const infoSelTime  = document.getElementById('infoSelTime');
const infoSelLane  = document.getElementById('infoSelLane');
const infoSelDur   = document.getElementById('infoSelDur');
const infoMultiSel = document.getElementById('infoMultiSel');
const infoHitsound  = document.getElementById('infoHitsound');
const infoBridgeTo  = document.getElementById('infoBridgeTo');
const infoBridgeAt  = document.getElementById('infoBridgeAt');
const bpmInput     = document.getElementById('bpmInput');
const bpmOffsetIn  = document.getElementById('bpmOffset');
const beatDiv      = document.getElementById('beatDiv');
const snapToggle   = document.getElementById('snapToggle');
const offsetDelta  = document.getElementById('offsetDelta');
const btnOffsetApply = document.getElementById('btnOffsetApply');
const diffSelect   = document.getElementById('diffSelect');

// ── Init ──────────────────────────────────────────────────────────────────────
const songId = new URLSearchParams(location.search).get('id');
if (!songId) { showToast('No song id', 3000, true); history.back(); }

(async () => {
  if (!songId) return;
  song  = await getSong(songId);
  if (!song) { showToast('Song not found', 3000, true); history.back(); return; }

  // Set dynamic lane count
  LANE_COUNT = song.laneCount || 3;
  TOTAL_H    = HEADER_H + WAVEFORM_H + LANE_H * LANE_COUNT;

  // Build KEY_LANE_MAP from per-lane-count keybind profile
  const kb = getKeybindsForLanes(LANE_COUNT);
  KEY_LANE_MAP = {};
  for (let i = 0; i < LANE_COUNT; i++) {
    const k = kb[i] || '';
    if (k) KEY_LANE_MAP[k] = i;
  }

  // Apply skin colors
  const skinObj = getSkin();
  const skin    = applySkin(skinObj);
  activeLaneColors = Array.from({ length: LANE_COUNT },
    (_, i) => (skin.laneColors[i]) || ALL_LANE_COLORS[i] || '#c060ff');

  _tc = getThemeColors();

  // Populate BPM input if song has bpm saved
  if (song.bpm) {
    snapBpm = song.bpm;
    bpmInput.value = song.bpm;
  }
  if (song.bpmOffset) {
    snapOffset = song.bpmOffset;
    bpmOffsetIn.value = song.bpmOffset;
  }

  // Restore dynamic BPM sections if saved
  if (song.bpmSections && song.bpmSections.length > 0) {
    bpmSections = song.bpmSections;
    dynamicBpmOn = true;
    dynamicBpmToggle.checked = true;
    bpmInput.readOnly = true;
    bpmSectionsBar.classList.remove('hidden');
    renderSectionsList();
  }

  notes = song.notes.map(n => ({ ...n }));
  edTitle.textContent = song.title;
  diffSelect.value = song.difficulty || '';
  resizeCanvas();
  draw();
  infoNotes.textContent = notes.length;

  const ab = await getAudio(songId);
  if (ab) {
    try { await decodeAudio(ab); }
    catch (_) { btnLoadAudio.textContent = 'Audio failed — reload'; }
  }
})();

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = TOTAL_H;
}
window.addEventListener('resize', () => { resizeCanvas(); draw(); });

// ── Title editing ─────────────────────────────────────────────────────────────
edTitle.addEventListener('input', () => {
  if (song) {
    song.title = edTitle.textContent.trim() || 'Untitled';
    markModified();
  }
});
// Prevent newlines in title
edTitle.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); edTitle.blur(); }
});

// ── Undo / Redo ───────────────────────────────────────────────────────────────
function pushUndo() {
  undoStack.push(notes.map(n => ({ ...n })));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}

function _shiftNotesForTrim(oldTrimStart, newTrimStart) {
  const delta = oldTrimStart - newTrimStart;
  if (Math.abs(delta) < 0.001) return;
  for (const n of notes) {
    n.time = +(n.time + delta).toFixed(4);
  }
  pushUndo();
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(notes.map(n => ({ ...n })));
  notes = undoStack.pop().map(n => ({ ...n }));
  clearSelection();
  markModified();
  infoNotes.textContent = notes.length;
  updateInfoPanel();
  draw();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(notes.map(n => ({ ...n })));
  notes = redoStack.pop().map(n => ({ ...n }));
  clearSelection();
  markModified();
  infoNotes.textContent = notes.length;
  updateInfoPanel();
  draw();
}

function clearSelection() {
  selectedNote = null;
  selectedIdx  = -1;
  multiSel.clear();
}

function syncIdx() {
  selectedIdx = selectedNote ? notes.indexOf(selectedNote) : -1;
}

btnUndo.addEventListener('click', undo);
btnRedo.addEventListener('click', redo);

// ── BPM snap ──────────────────────────────────────────────────────────────────
bpmInput.addEventListener('input', () => {
  let v = parseFloat(bpmInput.value) || 0;
  if (v > 999) { v = 999; bpmInput.value = 999; }
  snapBpm = v;
  markModified();
  draw();
});
bpmOffsetIn.addEventListener('input', () => {
  snapOffset = parseFloat(bpmOffsetIn.value) || 0;
  markModified();
  draw();
});
beatDiv.addEventListener('change', () => {
  snapDiv = parseInt(beatDiv.value);
  draw();
});
snapToggle.addEventListener('change', () => {
  snapOn = snapToggle.checked;
});

function snapToGrid(t) {
  if (!snapOn) return t;
  let bpm = snapBpm;
  let offset = snapOffset;
  // In dynamic mode, find the section for this time
  if (dynamicBpmOn && bpmSections.length > 0) {
    const sec = bpmSections.find(s => t >= s.startTime && t < s.endTime) || bpmSections[bpmSections.length - 1];
    bpm = sec.bpm;
    offset = sec.startTime; // Each section's grid starts at its boundary
  }
  if (!bpm || bpm <= 0) return t;
  const beatLen = 60 / bpm;
  const subLen  = beatLen / snapDiv;
  const rel     = t - offset;
  return offset + Math.round(rel / subLen) * subLen;
}

// ── Tap-tempo ─────────────────────────────────────────────────────────────────
let _tapTimes = [];

function enterTapMode() {
  tapMode    = true;
  _tapTimes  = [];
  btnTapBpm.textContent    = '⏹ Stop';
  btnTapBpm.style.color    = 'var(--red)';
  if (audioBuffer && !isPlaying) startAudio(playOffset);
}

function exitTapMode() {
  tapMode = false;
  btnTapBpm.textContent = 'Tap';
  btnTapBpm.style.color = '';
  if (isPlaying) pauseAudio();
}

btnTapBpm.addEventListener('click', () => {
  if (tapMode) exitTapMode(); else enterTapMode();
});

// ── BPM Detection ─────────────────────────────────────────────────────────────
const btnDetectBpm     = document.getElementById('btnDetectBpm');
const dynamicBpmToggle = document.getElementById('dynamicBpmToggle');
const bpmSectionsBar   = document.getElementById('bpmSectionsBar');
const bpmSectionsList  = document.getElementById('bpmSectionsList');
const btnAddSection    = document.getElementById('btnAddSection');

btnDetectBpm.addEventListener('click', async () => {
  if (!audioBuffer) return;
  btnDetectBpm.classList.add('btn-detecting');
  btnDetectBpm.textContent = 'Detecting…';

  // Run detection off main thread via setTimeout to allow UI update
  await new Promise(r => setTimeout(r, 50));

  try {
    if (dynamicBpmOn) {
      bpmSections = detectDynamicBPM(audioBuffer);
      renderSectionsList();
      bpmSectionsBar.classList.remove('hidden');
      // Set BPM input to first section
      snapBpm = bpmSections[0]?.bpm || 0;
      bpmInput.value = snapBpm || '';
    } else {
      const result = detectBPM(audioBuffer);
      snapBpm = result.bpm;
      bpmInput.value = result.bpm || '';
      bpmSections = [];
      bpmSectionsBar.classList.add('hidden');
    }
    draw();
  } catch (e) {
    console.error('BPM detection failed:', e);
  }

  btnDetectBpm.classList.remove('btn-detecting');
  btnDetectBpm.textContent = 'Detect';
});

btnAutotrim.addEventListener('click', () => {
  if (!audioBuffer) return;
  const bpm = snapBpm || 0;
  const padBeats = +trimPadBeats.value || 0;
  const result = computeAutotrim(audioBuffer, {
    bpm,
    padBeatsStart: padBeats,
    padBeatsEnd: padBeats
  });
  const oldTrimStart = trimStart;
  trimStart = result.trimStart;
  trimEnd   = result.trimEnd;
  if (notes.length > 0) _shiftNotesForTrim(oldTrimStart, trimStart);
  markModified();
  draw();
});

btnResetTrim.addEventListener('click', () => {
  const oldTrimStart = trimStart;
  trimStart = 0;
  trimEnd   = duration;
  if (notes.length > 0) _shiftNotesForTrim(oldTrimStart, 0);
  markModified();
  draw();
});

dynamicBpmToggle.addEventListener('change', () => {
  dynamicBpmOn = dynamicBpmToggle.checked;
  if (!dynamicBpmOn) {
    bpmSections = [];
    bpmSectionsBar.classList.add('hidden');
    bpmInput.readOnly = false;
    draw();
  } else {
    bpmInput.readOnly = true;
  }
});

btnAddSection.addEventListener('click', () => {
  const t = currentTime();
  if (bpmSections.length === 0) {
    bpmSections.push({ startTime: 0, endTime: duration, bpm: snapBpm || 120, confidence: 1 });
  } else {
    // Split the section containing current time
    const idx = bpmSections.findIndex(s => t >= s.startTime && t < s.endTime);
    if (idx >= 0) {
      const old = bpmSections[idx];
      const newSec = { startTime: t, endTime: old.endTime, bpm: old.bpm, confidence: old.confidence };
      old.endTime = t;
      bpmSections.splice(idx + 1, 0, newSec);
    }
  }
  renderSectionsList();
  draw();
});

// ── Section list rendering ────────────────────────────────────────────────────
function renderSectionsList() {
  bpmSectionsList.innerHTML = '';
  bpmSections.forEach((sec, i) => {
    const el = document.createElement('div');
    el.className = 'bpm-section-item';

    const colorDot = document.createElement('span');
    colorDot.className = 'bpm-section-color';
    colorDot.style.background = SECTION_COLORS[i % SECTION_COLORS.length].replace(/[\d.]+\)$/, '0.6)');
    el.appendChild(colorDot);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'section-time';
    timeSpan.textContent = _fmtTime(sec.startTime) + '–' + _fmtTime(sec.endTime);
    el.appendChild(timeSpan);

    const bpmSpan = document.createElement('span');
    bpmSpan.className = 'section-bpm';
    bpmSpan.textContent = sec.bpm + ' BPM';
    bpmSpan.title = 'Click to edit';
    bpmSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'section-bpm-input';
      input.value = sec.bpm;
      input.min = 1; input.max = 999;
      bpmSpan.replaceWith(input);
      input.focus();
      input.select();
      const finish = () => {
        const v = parseInt(input.value) || sec.bpm;
        sec.bpm = Math.max(1, Math.min(999, v));
        renderSectionsList();
        draw();
      };
      input.addEventListener('blur', finish);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); });
    });
    el.appendChild(bpmSpan);

    if (bpmSections.length > 1) {
      const del = document.createElement('span');
      del.className = 'section-delete';
      del.textContent = '×';
      del.title = 'Remove section boundary';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (i === 0 && bpmSections.length > 1) {
          bpmSections[1].startTime = 0;
          bpmSections.splice(0, 1);
        } else if (i > 0) {
          bpmSections[i - 1].endTime = sec.endTime;
          bpmSections.splice(i, 1);
        }
        renderSectionsList();
        draw();
      });
      el.appendChild(del);
    }

    // Click section → jump playhead
    el.addEventListener('click', () => {
      playOffset = sec.startTime;
      if (!isPlaying) draw();
    });

    bpmSectionsList.appendChild(el);
  });
}

function _fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return m + ':' + s;
}

// ── Snap button (consolidated) ────────────────────────────────────────────────
btnSnap.addEventListener('click', () => {
  if (!snapBpm || snapBpm <= 0) { showToast('Enter a BPM value first.', 3000, true); return; }
  const mode = snapMode.value;

  if (mode === 'all') {
    const minHoldEl  = document.getElementById('minHoldMs');
    const minHoldSec = minHoldEl ? (parseFloat(minHoldEl.value) || 0) / 1000 : 0;
    pushUndo();
    for (const n of notes) {
      const newHead = +snapToGrid(n.time).toFixed(4);
      if (n.duration > 0) {
        const newTail = +snapToGrid(n.time + n.duration).toFixed(4);
        const newDur  = +(newTail - newHead).toFixed(4);
        if (newDur <= 0 || (minHoldSec > 0 && newDur < minHoldSec)) {
          n.duration = 0;  // convert to tap
        } else {
          n.duration = +Math.max(MIN_HOLD_DUR, newDur).toFixed(4);
        }
      }
      n.time = newHead;
    }
    notes.sort((a, b) => a.time - b.time);
    syncIdx();
    if (song) song.bpm = snapBpm;
    markModified();
    infoNotes.textContent = notes.length;
    draw();
  } else if (mode === 'end') {
    const targets = multiSel.size > 0 ? [...multiSel] : (selectedNote ? [selectedNote] : []);
    const holds   = targets.filter(n => n.duration > 0);
    if (!holds.length) { showToast('Select a hold note first.', 3000, true); return; }
    pushUndo();
    for (const n of holds) {
      const subLen      = (60 / snapBpm) / snapDiv;
      const snappedTail = snapOffset + Math.round((n.time + n.duration - snapOffset) / subLen) * subLen;
      n.duration = +Math.max(MIN_HOLD_DUR, snappedTail - n.time).toFixed(4);
    }
    syncIdx();
    markModified();
    updateInfoPanel();
    draw();
  } else if (mode === 'allEnds') {
    const holds = notes.filter(n => n.duration > 0);
    if (!holds.length) { showToast('No hold notes found.', 3000, true); return; }
    pushUndo();
    for (const n of holds) {
      const subLen      = (60 / snapBpm) / snapDiv;
      const snappedTail = snapOffset + Math.round((n.time + n.duration - snapOffset) / subLen) * subLen;
      n.duration = +Math.max(MIN_HOLD_DUR, snappedTail - n.time).toFixed(4);
    }
    syncIdx();
    markModified();
    updateInfoPanel();
    draw();
  }
});

// ── Offset calibration ────────────────────────────────────────────────────────
btnOffsetApply.addEventListener('click', () => {
  const delta = parseFloat(offsetDelta.value) / 1000;
  if (!delta || !isFinite(delta)) return;
  pushUndo();
  for (const n of notes) n.time = +Math.max(0, n.time + delta).toFixed(4);
  notes.sort((a, b) => a.time - b.time);
  syncIdx();
  markModified();
  draw();
});

// ── Difficulty ────────────────────────────────────────────────────────────────
diffSelect.addEventListener('change', () => {
  song.difficulty = diffSelect.value;
  markModified();
});

// ── Audio ─────────────────────────────────────────────────────────────────────
btnMenu.addEventListener('click',      () => { window.location.href = 'index.html'; });
btnLoadAudio.addEventListener('click', () => audioFileIn.click());
audioFileIn.addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  const ab = await f.arrayBuffer();
  await saveAudio(songId, ab);
  try { await decodeAudio(ab); }
  catch (_) { /* button already shows error */ }
  audioFileIn.value = '';
});

async function decodeAudio(ab) {
  // Stop playback before closing context to keep UI state consistent
  if (isPlaying) pauseAudio();
  if (audioCtx) await audioCtx.close();
  audioCtx = new AudioContext();
  try {
    audioBuffer = await audioCtx.decodeAudioData(ab.slice(0));
  } catch (err) {
    btnLoadAudio.textContent = 'Audio failed — reload';
    throw err;
  }
  duration    = audioBuffer.duration;
  trimStart   = song?.trimStart || 0;
  trimEnd     = song?.trimEnd || duration;
  seekBar.max = duration;
  btnLoadAudio.textContent = '✓ Audio loaded';
  buildWaveform(audioBuffer);
  btnDetectBpm.disabled = false;
  btnAutotrim.disabled  = false;
  draw();
}

function buildWaveform(buffer) {
  const sr        = buffer.sampleRate;
  const blockSize = Math.max(1, Math.floor(sr / waveformPeaksPerSec));
  const numBlocks = Math.ceil(buffer.length / blockSize);
  const channels  = [];
  for (let c = 0; c < buffer.numberOfChannels; c++)
    channels.push(buffer.getChannelData(c));
  waveformPeaks = new Float32Array(numBlocks * 2);
  for (let b = 0; b < numBlocks; b++) {
    const start = b * blockSize;
    const end   = Math.min(start + blockSize, buffer.length);
    let mn = 0, mx = 0;
    for (let i = start; i < end; i++) {
      let s = 0;
      for (const ch of channels) s += ch[i];
      s /= channels.length;
      if (s < mn) mn = s;
      if (s > mx) mx = s;
    }
    waveformPeaks[b * 2]     = mn;
    waveformPeaks[b * 2 + 1] = mx;
  }
}

function currentTime() {
  if (!isPlaying || !audioCtx) return playOffset;
  return playOffset + (audioCtx.currentTime - playStartAt) * editorSpeed;
}

function startAudio(offset) {
  if (!audioBuffer) return;
  if (audioSrc) { audioSrc.onended = null; try { audioSrc.stop(); } catch (_) {} }
  audioSrc        = audioCtx.createBufferSource();
  audioSrc.buffer = audioBuffer;
  const cfg2 = getSettings();
  const edMusicGain = audioCtx.createGain();
  const mv = (cfg2.masterVolume !== undefined ? cfg2.masterVolume : 1.0) *
             (cfg2.musicVolume  !== undefined ? cfg2.musicVolume  : 1.0);
  edMusicGain.gain.value = Math.max(0, mv);
  audioSrc.connect(edMusicGain);
  edMusicGain.connect(audioCtx.destination);
  playOffset  = Math.max(trimStart, Math.min(offset, trimEnd));
  playStartAt = audioCtx.currentTime;
  audioSrc.start(0, playOffset);
  audioSrc.playbackRate.value = editorSpeed;
  // Schedule stop at trim end
  const remainSec = (trimEnd - playOffset) / editorSpeed;
  if (remainSec > 0 && trimEnd < duration) audioSrc.stop(audioCtx.currentTime + remainSec);
  audioSrc.onended = () => {
    if (isPlaying) { isPlaying = false; playOffset = trimEnd; btnPlayPause.textContent = '▶ Play'; }
  };
  isPlaying = true;
  btnPlayPause.textContent = '⏸ Pause';
  scheduleDraw();
}

function pauseAudio() {
  playOffset = currentTime();
  if (audioSrc) { audioSrc.onended = null; try { audioSrc.stop(); } catch (_) {} }
  isPlaying = false;
  btnPlayPause.textContent = '▶ Play';
}

btnPlayPause.addEventListener('click', () => {
  if (!audioBuffer) { showToast('Load an audio file first.', 3000, true); return; }
  if (isPlaying) pauseAudio();
  else {
    if (playOffset >= duration && duration > 0) playOffset = 0;
    startAudio(playOffset);
  }
  draw();
});

// ── Speed slider ─────────────────────────────────────────────────────────────
const speedSlider = document.getElementById('speedSlider');
const speedLabel  = document.getElementById('speedLabel');
speedSlider.addEventListener('input', () => {
  editorSpeed = parseFloat(speedSlider.value) || 1.0;
  speedLabel.textContent = 'Speed: ' + editorSpeed + 'x';
  if (isPlaying) {
    const t = currentTime();
    pauseAudio();
    startAudio(t);
  }
});

// ── Re-record mode ───────────────────────────────────────────────────────────
function startReRecord() {
  if (!audioBuffer) { showToast('Load audio first.', 3000, true); return; }
  if (reRecording) { stopReRecord(); return; }
  pushUndo();
  reRecOrigNotes = notes.map(n => ({ ...n }));
  reRecording    = true;
  reRecStartTime = currentTime();
  reRecNotes     = [];
  reRecHeld      = {};
  btnReRecord.classList.remove('hidden');
  btnReRecord.textContent = '⏹ Stop';
  btnCancelRec.classList.remove('hidden');
  if (!isPlaying) startAudio(reRecStartTime);
}

function stopReRecord() {
  if (!reRecording) return;
  const endTime = currentTime();
  reRecording = false;
  reRecOrigNotes = null;
  btnReRecord.textContent = '⏺ Rec';
  btnCancelRec.classList.add('hidden');

  // Finalize any held keys
  for (const [lane, info] of Object.entries(reRecHeld)) {
    const dur = endTime - info.time;
    if (dur > 0.08) {
      reRecNotes.push({ time: +info.time.toFixed(4), lane: parseInt(lane), duration: +dur.toFixed(4) });
    } else {
      reRecNotes.push({ time: +info.time.toFixed(4), lane: parseInt(lane), duration: 0 });
    }
  }
  reRecHeld = {};

  // Remove existing notes in the recorded time range
  const tA = reRecStartTime - 0.001;
  const tB = endTime + 0.001;
  notes = notes.filter(n => n.time < tA || n.time > tB);

  // Add newly recorded notes
  notes.push(...reRecNotes);
  notes.sort((a, b) => a.time - b.time);

  clearSelection();
  markModified();
  infoNotes.textContent = notes.length;
  updateInfoPanel();
  draw();
  if (isPlaying) pauseAudio();
  showToast(`Re-recorded ${reRecNotes.length} notes (${((endTime - reRecStartTime) * 1000).toFixed(0)}ms range)`);
}

function cancelReRecord() {
  if (!reRecording) return;
  reRecording = false;
  reRecHeld   = {};
  reRecNotes  = [];
  btnReRecord.textContent = '⏺ Rec';
  btnCancelRec.classList.add('hidden');
  if (isPlaying) pauseAudio();
  // Restore original notes and pop the undo entry from startReRecord
  if (reRecOrigNotes) {
    notes = reRecOrigNotes;
    reRecOrigNotes = null;
    if (undoStack.length) undoStack.pop();
  }
  clearSelection();
  infoNotes.textContent = notes.length;
  updateInfoPanel();
  draw();
  showToast('Re-recording cancelled');
}

if (btnReRecord) {
  btnReRecord.classList.remove('hidden');
  btnReRecord.addEventListener('click', () => {
    if (reRecording) stopReRecord(); else startReRecord();
  });
}

btnCancelRec.addEventListener('click', () => { cancelReRecord(); });

// ── Seek bar ──────────────────────────────────────────────────────────────────
let wasPlayingBeforeSeek = false;
seekBar.addEventListener('pointerdown', () => {
  isSeeking = true;
  wasPlayingBeforeSeek = isPlaying;
  if (isPlaying) pauseAudio();
});
function _finishSeek() {
  if (!isSeeking) return;
  isSeeking = false;
  const t = +seekBar.value;
  playOffset = t;
  if (wasPlayingBeforeSeek) startAudio(t);
  else draw();
}
seekBar.addEventListener('pointerup', _finishSeek);
document.addEventListener('pointerup', () => { if (isSeeking) _finishSeek(); });
seekBar.addEventListener('input', () => {
  playOffset = +seekBar.value;
  // Jump view to keep playhead visible
  const W = canvas.width;
  const px = (playOffset - viewStart) * pxPerSec;
  if (px < 0 || px > W) {
    viewStart = Math.max(0, playOffset - W / pxPerSec * 0.3);
  }
  draw();
});

// ── Draw ──────────────────────────────────────────────────────────────────────
let rafPending = false;
function scheduleDraw() {
  if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; draw(); }); }
}

function draw() {
  const W   = canvas.width;
  const now = currentTime();

  if (isPlaying) {
    const nowX = timeToX(now);
    if (nowX < W * 0.15 || nowX > W * 0.75) {
      viewStart = Math.max(0, now - W / pxPerSec * 0.3);
    }
  }
  // Quantize viewStart to pixel boundaries so waveform peaks map deterministically
  viewStart = Math.round(viewStart * pxPerSec) / pxPerSec;

  if (!isSeeking) seekBar.value = now;

  const m = Math.floor(now / 60);
  const s = (now % 60).toFixed(3).padStart(6, '0');
  audioTimeEl.textContent = `${m}:${s}`;

  // Update BPM input to show current section's BPM during dynamic mode
  if (dynamicBpmOn && bpmSections.length > 0) {
    const sec = bpmSections.find(s => now >= s.startTime && now < s.endTime) || bpmSections[bpmSections.length - 1];
    if (sec) {
      snapBpm = sec.bpm;
      bpmInput.value = sec.bpm;
    }
  }

  ctx.fillStyle = _tc.bg;
  ctx.fillRect(0, 0, W, TOTAL_H);

  const viewEnd = viewStart + W / pxPerSec;

  // ── Time ruler ─────────────────────────────────────────────────────────────
  ctx.fillStyle = _tc.bg2;
  ctx.fillRect(0, 0, W, HEADER_H);

  const tickStep  = pickTickStep(pxPerSec);
  const firstTick = Math.floor(viewStart / tickStep) * tickStep;
  ctx.font      = '10px ' + _tc.font;
  ctx.textAlign = 'left';
  for (let t = firstTick; t <= viewEnd + tickStep; t += tickStep) {
    const x = timeToX(t);
    ctx.fillStyle = _tc['text-dim'];
    ctx.fillText(t.toFixed(2) + 's', x + 2, 14);
  }

  // ── Waveform ───────────────────────────────────────────────────────────────
  drawWaveform(W, now);

  // ── Lane backgrounds ───────────────────────────────────────────────────────
  for (let i = 0; i < LANE_COUNT; i++) {
    const y   = laneY(i);
    const col = activeLaneColors[i] || _tc.accent;
    ctx.fillStyle = i % 2 === 0 ? darkenHex(_tc.bg, 0.9) : _tc.bg;
    ctx.fillRect(0, y, W, LANE_H);
    ctx.fillStyle = withAlpha(col, '60');
    ctx.font = 'bold 14px ' + _tc.font;
    ctx.textAlign = 'left';
    ctx.fillText(ALL_LANE_NAMES[i] || `Lane ${i + 1}`, 6, y + LANE_H / 2 + 5);
    ctx.fillStyle = _tc.border;
    ctx.fillRect(0, y + LANE_H - 1, W, 1);
  }

  // ── Dynamic BPM section coloring ────────────────────────────────────────
  if (dynamicBpmOn && bpmSections.length > 0) {
    for (let si = 0; si < bpmSections.length; si++) {
      const sec = bpmSections[si];
      if (sec.endTime < viewStart || sec.startTime > viewEnd) continue;
      const x1 = Math.max(0, timeToX(sec.startTime));
      const x2 = Math.min(W, timeToX(sec.endTime));
      // Tinted background
      ctx.fillStyle = SECTION_COLORS[si % SECTION_COLORS.length];
      ctx.fillRect(x1, HEADER_H, x2 - x1, TOTAL_H - HEADER_H);
      // Section boundary line
      if (sec.startTime > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x1, HEADER_H, 1, TOTAL_H - HEADER_H);
      }
      // BPM label at top of section
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '9px ' + _tc.font;
      ctx.textAlign = 'left';
      ctx.fillText(sec.bpm + ' BPM', x1 + 3, HEADER_H + 10);
    }
  }

  // ── BPM grid (beat lines) — supports dynamic sections ───────────────────
  if (dynamicBpmOn && bpmSections.length > 0) {
    for (const sec of bpmSections) {
      if (sec.endTime < viewStart || sec.startTime > viewEnd) continue;
      const beatLen = 60 / sec.bpm;
      const subLen  = beatLen / snapDiv;
      const gridStart = Math.max(viewStart, sec.startTime);
      const gridEnd   = Math.min(viewEnd, sec.endTime);
      const firstB = Math.floor((gridStart - sec.startTime) / subLen) * subLen + sec.startTime;
      for (let bt = firstB; bt <= gridEnd + subLen; bt += subLen) {
        if (bt < sec.startTime || bt > sec.endTime) continue;
        const bx = timeToX(bt);
        const isBeat = Math.abs(((bt - sec.startTime) / beatLen) % 1) < 0.001 ||
                       Math.abs(((bt - sec.startTime) / beatLen) % 1 - 1) < 0.001;
        ctx.fillStyle = isBeat ? withAlpha(_tc.yellow, '40') : withAlpha(_tc.yellow, '18');
        ctx.fillRect(bx, HEADER_H, 1, TOTAL_H - HEADER_H);
      }
    }
  } else if (snapBpm > 0) {
    const beatLen = 60 / snapBpm;
    const subLen  = beatLen / snapDiv;
    const firstB  = Math.floor((viewStart - snapOffset) / subLen) * subLen + snapOffset;
    for (let bt = firstB; bt <= viewEnd + subLen; bt += subLen) {
      const bx    = timeToX(bt);
      const isBeat = Math.abs(((bt - snapOffset) / beatLen) % 1) < 0.001 ||
                     Math.abs(((bt - snapOffset) / beatLen) % 1 - 1) < 0.001;
      ctx.fillStyle = isBeat ? withAlpha(_tc.yellow, '40') : withAlpha(_tc.yellow, '18');
      ctx.fillRect(bx, HEADER_H, 1, TOTAL_H - HEADER_H);
    }
  }

  // ── Regular grid lines ─────────────────────────────────────────────────────
  ctx.fillStyle = _tc.border;
  for (let t = firstTick; t <= viewEnd + tickStep; t += tickStep) {
    ctx.fillRect(timeToX(t), HEADER_H, 1, TOTAL_H - HEADER_H);
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  const reRecLookahead = reRecording ? (snapBpm > 0 ? (240 / snapBpm) : 0.5) : 0;
  for (let i = 0; i < notes.length; i++) {
    const n     = notes[i];
    // Fade/hide notes in the re-record range
    let reRecAlpha = 1;
    if (reRecording && n.time >= reRecStartTime - 0.001) {
      const dist = n.time - now;
      if (dist <= 0) {
        continue;
      } else if (dist <= reRecLookahead) {
        // Ease-out: fades quickly near playhead, gently at the edge
        const t = dist / reRecLookahead;
        reRecAlpha = t * t;
      }
    }
    const isSel = (n === selectedNote) || multiSel.has(n);
    const col   = activeLaneColors[n.lane] || _tc.accent;
    const ly    = laneY(n.lane);
    const midY  = ly + LANE_H / 2;
    const hx    = timeToX(n.time);

    const tailTime = n.time + (n.duration || 0);
    if (tailTime < viewStart - 0.5 || n.time > viewEnd + 0.5) continue;

    if (reRecAlpha < 1) ctx.globalAlpha = reRecAlpha;

    if (n.duration > 0) {
      // Hold note
      const tx    = timeToX(tailTime);
      const isGlide = n.glide !== undefined;
      const colB  = isGlide ? (activeLaneColors[n.glide] || _tc.accent) : col;
      const lyB   = isGlide ? laneY(n.glide) : ly;
      const midYB = lyB + LANE_H / 2;

      // Glide connector: vertical line at xGlide between the two lane rows
      if (isGlide && n.glideAt !== undefined) {
        const xGlide = timeToX(n.time + n.glideAt);
        if (xGlide >= hx && xGlide <= tx) {
          const cg = ctx.createLinearGradient(0, midY, 0, midYB);
          cg.addColorStop(0, withAlpha(col, 'cc'));
          cg.addColorStop(1, withAlpha(colB, 'cc'));
          ctx.strokeStyle = cg;
          ctx.lineWidth   = isSel ? 3 : 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(xGlide, midY);
          ctx.lineTo(xGlide, midYB);
          ctx.stroke();
          ctx.setLineDash([]);
          // Arrow head
          const arrowDir = midYB > midY ? 1 : -1;
          ctx.fillStyle = withAlpha(colB, 'cc');
          ctx.beginPath();
          ctx.moveTo(xGlide,     midYB - arrowDir * 6);
          ctx.lineTo(xGlide - 4, midYB - arrowDir * 11);
          ctx.lineTo(xGlide + 4, midYB - arrowDir * 11);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Body A in lane A (from hx to xGlide or tx)
      const xGlide = (isGlide && n.glideAt !== undefined) ? timeToX(n.time + n.glideAt) : tx;
      const bodyAEnd = Math.min(tx, xGlide);
      if (bodyAEnd > hx) {
        ctx.fillStyle = col + (isSel ? 'cc' : '55');
        ctx.fillRect(hx, midY - NOTE_H / 4, bodyAEnd - hx, NOTE_H / 2);
        if (bodyAEnd - hx > 4) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(hx, midY - NOTE_H / 4, bodyAEnd - hx, NOTE_H / 2);
          ctx.clip();
          ctx.strokeStyle = withAlpha(col, '60');
          ctx.lineWidth   = 1.5;
          ctx.beginPath();
          const bodyH = NOTE_H / 2;
          for (let si = -(bodyH + bodyAEnd - hx); si <= (bodyAEnd - hx) + bodyH; si += 8) {
            ctx.moveTo(hx + si, midY - NOTE_H / 4);
            ctx.lineTo(hx + si + bodyH, midY + NOTE_H / 4);
          }
          ctx.stroke();
          ctx.restore();
        }
        // BPM tick marks on hold body A
        if (snapBpm > 0 && (bodyAEnd - hx) > 2) {
          const subLen  = (60 / snapBpm) / snapDiv;
          const beatLen = 60 / snapBpm;
          ctx.lineWidth = 1;
          for (let sub = Math.ceil((n.time - snapOffset) / subLen) * subLen + snapOffset;
               sub <= n.time + n.duration;
               sub += subLen) {
            const bx2 = timeToX(sub);
            if (bx2 <= hx || bx2 >= bodyAEnd) continue;
            const phase  = Math.abs(((sub - snapOffset) / beatLen) % 1);
            const isBeat = phase < 0.002 || phase > 0.998;
            ctx.strokeStyle = isBeat ? withAlpha(col, 'ee') : withAlpha(col, '70');
            ctx.beginPath();
            ctx.moveTo(bx2, midY - NOTE_H / 4);
            ctx.lineTo(bx2, midY + NOTE_H / 4);
            ctx.stroke();
          }
        }
      }

      // Body B in lane B (from xGlide to tx, different lane row)
      if (isGlide && xGlide < tx) {
        ctx.fillStyle = colB + (isSel ? 'cc' : '55');
        ctx.fillRect(xGlide, midYB - NOTE_H / 4, tx - xGlide, NOTE_H / 2);
        if (tx - xGlide > 4) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(xGlide, midYB - NOTE_H / 4, tx - xGlide, NOTE_H / 2);
          ctx.clip();
          ctx.strokeStyle = withAlpha(colB, '60');
          ctx.lineWidth   = 1.5;
          ctx.beginPath();
          const bodyH = NOTE_H / 2;
          for (let si = -(bodyH + tx - xGlide); si <= (tx - xGlide) + bodyH; si += 8) {
            ctx.moveTo(xGlide + si, midYB - NOTE_H / 4);
            ctx.lineTo(xGlide + si + bodyH, midYB + NOTE_H / 4);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      // Head marker in lane A
      ctx.fillStyle = isSel ? '#fff' : col;
      ctx.beginPath();
      ctx.roundRect(hx - NOTE_W, midY - NOTE_H / 2, NOTE_W * 2, NOTE_H, 3);
      ctx.fill();

      // Tail marker in lane B (or A if no glide)
      ctx.fillStyle = isSel ? colB : withAlpha(colB, 'aa');
      ctx.beginPath();
      ctx.roundRect(tx - NOTE_W / 2, midYB - NOTE_H / 4, NOTE_W, NOTE_H / 2, 2);
      ctx.fill();

      if (isSel) {
        ctx.strokeStyle = col;
        ctx.lineWidth   = 1.5;
        ctx.strokeRect(hx - NOTE_W - 1, midY - NOTE_H / 2 - 1, NOTE_W * 2 + 2, NOTE_H + 2);
        ctx.beginPath();
        ctx.arc(tx, midYB, NOTE_W, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      // Tap note
      const y = midY - NOTE_H / 2;
      if (hx < -NOTE_W || hx > canvas.width + NOTE_W) continue;

      ctx.fillStyle   = isSel ? '#fff' : col;
      ctx.globalAlpha = (isSel ? 1 : 0.9) * reRecAlpha;
      ctx.beginPath();
      ctx.roundRect(hx - NOTE_W, y, NOTE_W * 2, NOTE_H, 3);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isSel) {
        ctx.strokeStyle = col;
        ctx.lineWidth   = 2;
        ctx.strokeRect(hx - NOTE_W - 1, y - 1, NOTE_W * 2 + 2, NOTE_H + 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Re-record live notes ──────────────────────────────────────────────────
  if (reRecording) {
    const allLive = reRecNotes.slice();
    // Add currently-held keys as in-progress notes
    for (const [lane, info] of Object.entries(reRecHeld)) {
      const dur = now - info.time;
      allLive.push({ time: +info.time.toFixed(4), lane: parseInt(lane), duration: dur > 0.08 ? +dur.toFixed(4) : 0 });
    }
    for (const n of allLive) {
      const col  = activeLaneColors[n.lane] || _tc.accent;
      const ly   = laneY(n.lane);
      const midY = ly + LANE_H / 2;
      const hx   = timeToX(n.time);
      const tailTime = n.time + (n.duration || 0);
      if (tailTime < viewStart - 0.5 || n.time > viewEnd + 0.5) continue;

      if (n.duration > 0) {
        const tx = timeToX(tailTime);
        ctx.fillStyle = withAlpha(col, 'aa');
        ctx.fillRect(hx, midY - NOTE_H / 4, tx - hx, NOTE_H / 2);
      }
      const y = midY - NOTE_H / 2;
      const grad = ctx.createLinearGradient(0, y, 0, y + NOTE_H);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(1, col);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(hx - NOTE_W, y, NOTE_W * 2, NOTE_H, 3);
      ctx.fill();
    }
  }

  // ── Playhead ───────────────────────────────────────────────────────────────
  const px = timeToX(now);
  if (px >= 0 && px <= W) {
    ctx.strokeStyle = _tc.yellow;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, TOTAL_H);
    ctx.stroke();
    ctx.fillStyle = _tc.yellow;
    ctx.beginPath();
    ctx.moveTo(px - 6, 0);
    ctx.lineTo(px + 6, 0);
    ctx.lineTo(px, 10);
    ctx.fill();
  }

  // Min hold threshold indicator (shown while resizing)
  if (resizing) {
    const rn      = resizing;
    const threshX = timeToX(rn.time + MIN_HOLD_DUR);
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = withAlpha(_tc.red, 'cc');
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(threshX, laneY(rn.lane));
    ctx.lineTo(threshX, laneY(rn.lane) + LANE_H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font      = '9px ' + _tc.font;
    ctx.fillStyle = withAlpha(_tc.red, 'cc');
    ctx.textAlign = 'left';
    ctx.fillText('min hold', threshX + 2, laneY(rn.lane) + 10);
    ctx.restore();
  }

  // Rubber-band selection box
  if (selBox) {
    const sx = Math.min(selBox.x0, selBox.x1);
    const sy = Math.min(selBox.y0, selBox.y1);
    const sw = Math.abs(selBox.x1 - selBox.x0);
    const sh = Math.abs(selBox.y1 - selBox.y0);
    ctx.save();
    ctx.strokeStyle = withAlpha(_tc.cyan, 'cc');
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.fillStyle = withAlpha(_tc.cyan, '18');
    ctx.fillRect(sx, sy, sw, sh);
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (isPlaying) scheduleDraw();
}

function laneY(i) { return HEADER_H + WAVEFORM_H + i * LANE_H; }

function drawWaveform(W, now) {
  const y0  = HEADER_H;
  const h   = WAVEFORM_H;
  const mid = y0 + h / 2;
  const amp = h / 2 - 4;

  ctx.fillStyle = darkenHex(_tc.bg, 0.85);
  ctx.fillRect(0, y0, W, h);

  // Bottom border
  ctx.fillStyle = _tc.border;
  ctx.fillRect(0, y0 + h - 1, W, 1);

  if (!waveformPeaks) {
    ctx.fillStyle    = _tc['text-dim'];
    ctx.font         = '12px ' + _tc.font;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Load audio to see waveform', W / 2, mid);
    ctx.textBaseline = 'alphabetic';
    return;
  }

  // Build per-pixel symmetric amplitude array
  const peakLen = waveformPeaks.length / 2;
  const amps = new Float32Array(W);
  for (let px = 0; px < W; px++) {
    const tStart = xToTime(px);
    const tEnd   = xToTime(px + 1);
    if (tEnd < 0 || tStart > duration) continue;
    const tA = Math.max(0, tStart);
    const tB = Math.min(duration, tEnd);
    const biStart = Math.max(0, Math.floor(tA * waveformPeaksPerSec));
    const biEnd   = Math.min(Math.ceil(tB * waveformPeaksPerSec), peakLen - 1);
    if (biStart > biEnd) continue;
    let peak = 0;
    for (let bi = biStart; bi <= biEnd; bi++) {
      const v = Math.max(Math.abs(waveformPeaks[bi * 2]), Math.abs(waveformPeaks[bi * 2 + 1]));
      if (v > peak) peak = v;
    }
    amps[px] = peak;
  }

  const playedX = Math.max(0, Math.min(W, timeToX(now)));

  // Draw symmetric mirrored waveform (played / unplayed)
  for (let pass = 0; pass < 2; pass++) {
    const x0 = pass === 0 ? 0 : Math.floor(playedX);
    const x1 = pass === 0 ? Math.min(W, Math.ceil(playedX)) : W;
    if (x0 >= x1) continue;

    ctx.beginPath();
    ctx.moveTo(x0, mid);
    for (let px = x0; px < x1; px++) ctx.lineTo(px, mid - amps[px] * amp);
    ctx.lineTo(x1 - 1, mid);
    for (let px = x1 - 1; px >= x0; px--) ctx.lineTo(px, mid + amps[px] * amp);
    ctx.closePath();

    if (pass === 0) {
      const grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
      grad.addColorStop(0,   hexToRgba(_tc.accent, 0.7));
      grad.addColorStop(0.5, hexToRgba(_tc.accent, 0.95));
      grad.addColorStop(1,   hexToRgba(_tc.accent, 0.7));
      ctx.fillStyle = grad;
    } else {
      const dim = darkenHex(_tc.accent, 0.4);
      const grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
      grad.addColorStop(0,   hexToRgba(dim, 0.5));
      grad.addColorStop(0.5, hexToRgba(dim, 0.8));
      grad.addColorStop(1,   hexToRgba(dim, 0.5));
      ctx.fillStyle = grad;
    }
    ctx.fill();
  }

  // Center line
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, mid, W, 1);

  // ── Trim handles ──────────────────────────────────────────────────────────
  if (trimStart > 0) {
    const tx = timeToX(trimStart);
    if (tx >= 0 && tx <= W) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, y0, tx, h);
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(Math.round(tx) - 1, y0, 3, h);
      ctx.beginPath();
      ctx.moveTo(tx - 6, y0);
      ctx.lineTo(tx + 6, y0);
      ctx.lineTo(tx + 6, y0 + 14);
      ctx.lineTo(tx, y0 + 18);
      ctx.lineTo(tx - 6, y0 + 14);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (trimEnd < duration) {
    const tx = timeToX(trimEnd);
    if (tx >= 0 && tx <= W) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(tx, y0, W - tx, h);
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(Math.round(tx) - 1, y0, 3, h);
      ctx.beginPath();
      ctx.moveTo(tx - 6, y0);
      ctx.lineTo(tx + 6, y0);
      ctx.lineTo(tx + 6, y0 + 14);
      ctx.lineTo(tx, y0 + 18);
      ctx.lineTo(tx - 6, y0 + 14);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function timeToX(t)  { return (t - viewStart) * pxPerSec; }
function xToTime(x)  { return viewStart + x / pxPerSec; }

function _sliceAudioBuffer(buffer, startSec, endSec) {
  const sr      = buffer.sampleRate;
  const startS  = Math.round(startSec * sr);
  const endS    = Math.round(endSec * sr);
  const len     = endS - startS;
  const ch      = buffer.numberOfChannels;
  const offCtx  = new OfflineAudioContext(ch, len, sr);
  const newBuf  = offCtx.createBuffer(ch, len, sr);
  for (let c = 0; c < ch; c++) {
    const src = buffer.getChannelData(c);
    newBuf.getChannelData(c).set(src.subarray(startS, endS));
  }
  return newBuf;
}

function _encodeWav(buffer) {
  const sr    = buffer.sampleRate;
  const ch    = buffer.numberOfChannels;
  const len   = buffer.length;
  const bps   = 16;
  const block = ch * bps / 8;
  const dataLen = len * block;
  const buf   = new ArrayBuffer(44 + dataLen);
  const view  = new DataView(buf);

  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * block, true);
  view.setUint16(32, block, true);
  view.setUint16(34, bps, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return buf;
}

function pickTickStep(pps) {
  const cs = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
  for (const c of cs) { if (c * pps >= 60) return c; }
  return 60;
}

// ── Canvas interactions ───────────────────────────────────────────────────────
canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const mx   = e.clientX - rect.left;
  const my   = e.clientY - rect.top;
  const t    = xToTime(mx);
  const lane = xyToLane(my);

  if (lane === -1) {
    if (my >= HEADER_H && my < HEADER_H + WAVEFORM_H && audioBuffer) {
      // Check trim handle hit first
      const trimStartX = timeToX(trimStart);
      const trimEndX   = timeToX(trimEnd);
      if (Math.abs(mx - trimStartX) < 8) {
        draggingTrim = 'start';
        trimDragOldStart = trimStart;
        e.preventDefault();
        return;
      }
      if (Math.abs(mx - trimEndX) < 8) {
        draggingTrim = 'end';
        trimDragOldStart = trimStart;
        e.preventDefault();
        return;
      }
      // Seek drag fallback
      const seekT = Math.max(0, Math.min(duration, xToTime(mx)));
      wasPlayingBeforeSeekDrag = isPlaying;
      if (isPlaying) pauseAudio();
      playOffset = seekT;
      seekDragging = true;
      draw();
    }
    return;
  }

  const tailIdx = findNoteTail(t, lane, mx);
  if (tailIdx !== -1) {
    if (!e.shiftKey) clearSelection();
    preDragState  = notes.map(n => ({ ...n }));
    selectedNote  = notes[tailIdx];
    selectedIdx   = tailIdx;
    resizing      = notes[tailIdx];
    resizeStartX  = mx;
    resizeOrigDur = notes[tailIdx].duration;
    updateInfoPanel();
    draw();
    return;
  }

  const hitIdx = findNoteAt(t, lane, mx);
  if (hitIdx !== -1) {
    const ref = notes[hitIdx];
    if (e.shiftKey) {
      if (multiSel.has(ref)) multiSel.delete(ref);
      else multiSel.add(ref);
      updateInfoPanel();
      draw();
      return;
    }
    // If note is already in the selection, drag the whole group; else select just this one
    const alreadyInSel = multiSel.has(ref) || ref === selectedNote;
    if (!alreadyInSel) clearSelection();
    preDragState  = notes.map(n => ({ ...n }));
    dragRefs      = alreadyInSel ? [...multiSel].filter(n => n !== ref) : [];
    dragOrigTimes = dragRefs.map(n => n.time);
    selectedNote  = ref;
    selectedIdx   = notes.indexOf(ref);
    dragging      = true;
    dragStartX    = mx;
    dragOrigTime  = ref.time;
  } else {
    if (e.shiftKey) {
      // Shift+drag on empty area → start rubber-band selection box
      selBox = { x0: mx, y0: my, x1: mx, y1: my };
      return;
    }
    clearSelection();
    const snapT = +snapToGrid(t).toFixed(4);
    const duplicate = notes.find(n => Math.abs(n.time - snapT) < 0.001 && n.lane === lane);
    if (duplicate) {
      preDragState  = notes.map(n => ({ ...n }));
      selectedNote  = duplicate;
      selectedIdx   = notes.indexOf(duplicate);
      resizing      = duplicate;
      resizeStartX  = mx;
      resizeOrigDur = duplicate.duration;
      updateInfoPanel();
      draw();
      return;
    }
    const preCreateState = notes.map(n => ({ ...n }));
    const newNote = { time: snapT, lane, duration: 0 };
    notes.push(newNote);
    notes.sort((a, b) => a.time - b.time);
    selectedNote  = newNote;
    selectedIdx   = notes.indexOf(newNote);
    preDragState  = preCreateState; // single undo entry covering both create + resize
    resizing      = newNote;
    resizeStartX  = mx;
    resizeOrigDur = 0;
    markModified();
    infoNotes.textContent = notes.length;
  }
  updateInfoPanel();
  draw();
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const mx   = e.clientX - rect.left;
  const my   = e.clientY - rect.top;

  // Trim handle cursor hint
  if (!draggingTrim && my >= HEADER_H && my < HEADER_H + WAVEFORM_H) {
    const nearStart = Math.abs(mx - timeToX(trimStart)) < 8;
    const nearEnd   = Math.abs(mx - timeToX(trimEnd)) < 8;
    if (nearStart || nearEnd) canvas.style.cursor = 'col-resize';
    else if (!seekDragging && !dragging && !resizing) canvas.style.cursor = '';
  }

  if (draggingTrim) {
    const t = Math.max(0, Math.min(duration, xToTime(mx)));
    if (draggingTrim === 'start') {
      trimStart = Math.min(t, trimEnd - 0.1);
    } else {
      trimEnd = Math.max(t, trimStart + 0.1);
    }
    markModified();
    draw();
    return;
  }

  if (seekDragging) {
    playOffset = Math.max(0, Math.min(duration, xToTime(mx)));
    draw();
    return;
  }

  if (selBox) {
    selBox.x1 = mx;
    selBox.y1 = my;
    draw();
    return;
  }

  if (resizing) {
    const tailSnapped     = snapToGrid(xToTime(mx));
    resizing.duration     = +Math.max(0, tailSnapped - resizing.time).toFixed(4);
    updateInfoPanel();
    draw();
    return;
  }
  if (!dragging || !selectedNote) return;

  const dx          = mx - dragStartX;
  const dt          = dx / pxPerSec;
  const snappedTime = snapToGrid(dragOrigTime + dt);
  const snappedDt   = snappedTime - dragOrigTime;
  selectedNote.time = +Math.max(0, snappedTime).toFixed(4);

  for (let i = 0; i < dragRefs.length; i++) {
    dragRefs[i].time = +Math.max(0, dragOrigTimes[i] + snappedDt).toFixed(4);
  }
  updateInfoPanel();
  draw();
});

canvas.addEventListener('mouseup', finishInteraction);
document.addEventListener('mouseup', e => {
  if (seekDragging || dragging || resizing || draggingTrim) finishInteraction();
});

function finishInteraction() {
  if (draggingTrim) {
    if (draggingTrim === 'start' && notes.length > 0) {
      _shiftNotesForTrim(trimDragOldStart, trimStart);
    }
    draggingTrim = null;
    canvas.style.cursor = '';
    return;
  }
  if (seekDragging) {
    seekDragging = false;
    if (wasPlayingBeforeSeekDrag) startAudio(playOffset);
    return;
  }
  if (selBox) {
    const xMin = Math.min(selBox.x0, selBox.x1);
    const xMax = Math.max(selBox.x0, selBox.x1);
    const yMin = Math.min(selBox.y0, selBox.y1);
    const yMax = Math.max(selBox.y0, selBox.y1);
    if (xMax - xMin > 4 || yMax - yMin > 4) {
      clearSelection();
      for (const n of notes) {
        const nx = timeToX(n.time);
        const ny = laneY(n.lane) + LANE_H / 2;
        const headInBox = nx >= xMin && nx <= xMax && ny >= yMin && ny <= yMax;
        // Also select hold notes whose body passes through the box
        let bodyInBox = false;
        if (n.duration > 0 && ny >= yMin && ny <= yMax) {
          const tailX = timeToX(n.time + n.duration);
          bodyInBox = tailX >= xMin && nx <= xMax;
        }
        if (headInBox || bodyInBox) multiSel.add(n);
      }
      if (multiSel.size === 1) {
        selectedNote = [...multiSel][0];
        selectedIdx  = notes.indexOf(selectedNote);
        multiSel.clear();
      } else if (multiSel.size > 1) {
        selectedNote = [...multiSel][0];
        selectedIdx  = notes.indexOf(selectedNote);
      }
    }
    selBox = null;
    updateInfoPanel();
    draw();
    return;
  }
  if (resizing) {
    if (resizing.duration < MIN_HOLD_DUR) resizing.duration = 0;
    // Clamp glideAt so it doesn't exceed the new duration
    if (resizing.glide !== undefined && resizing.glideAt !== undefined) {
      if (resizing.duration <= 0) {
        delete resizing.glide;
        delete resizing.glideAt;
      } else {
        resizing.glideAt = +Math.min(resizing.glideAt, resizing.duration).toFixed(4);
      }
    }
    notes.sort((a, b) => a.time - b.time);
    syncIdx();
    resizing = null;
    markModified();
    if (preDragState) {
      undoStack.push(preDragState);
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack.length = 0;
      preDragState = null;
    }
    updateInfoPanel();
    draw();
    return;
  }
  if (dragging) {
    dragging = false;
    notes.sort((a, b) => a.time - b.time);
    syncIdx();
    markModified();
    if (preDragState) {
      undoStack.push(preDragState);
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack.length = 0;
      preDragState = null;
    }
    draw();
  }
}

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const rect   = canvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left;
    const t      = xToTime(mx);
    pxPerSec     = Math.max(MIN_PPS, Math.min(MAX_PPS, pxPerSec * factor));
    viewStart    = t - mx / pxPerSec;
  } else {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    viewStart += delta * 0.003 * (canvas.width / pxPerSec) * 0.2;
  }
  viewStart = Math.max(0, viewStart);
  viewStart = Math.round(viewStart * pxPerSec) / pxPerSec;
  draw();
}, { passive: false });

function findNoteAt(t, lane, mx) {
  const SNAP_PX = 12;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].lane !== lane) continue;
    const nx = timeToX(notes[i].time);
    const hd = Math.abs(nx - mx);
    if (hd < SNAP_PX && hd < bestD) { best = i; bestD = hd; }
    if ((notes[i].duration || 0) > 0 && hd > SNAP_PX) {
      const tx = timeToX(notes[i].time + notes[i].duration);
      if (mx >= nx && mx <= tx) {
        const bd = hd + 10;
        if (bd < bestD) { best = i; bestD = bd; }
      }
    }
  }
  return best;
}

function findNoteTail(t, lane, mx) {
  const SNAP_PX = 10;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < notes.length; i++) {
    if (!(notes[i].duration > 0)) continue;
    // Tail is in glide lane if this is a glide note
    const tailLane = (notes[i].glide !== undefined) ? notes[i].glide : notes[i].lane;
    if (tailLane !== lane) continue;
    const tx = timeToX(notes[i].time + notes[i].duration);
    const d  = Math.abs(tx - mx);
    if (d < SNAP_PX && d < bestD) { best = i; bestD = d; }
  }
  return best;
}

function xyToLane(y) {
  for (let i = 0; i < LANE_COUNT; i++) {
    if (y >= laneY(i) && y < laneY(i) + LANE_H) return i;
  }
  return -1;
}

function updateInfoPanel() {
  const selCount = (selectedNote ? 1 : 0) + multiSel.size;
  infoMultiSel.textContent = selCount;
  if (!selectedNote) {
    infoSelTime.textContent = '—';
    infoSelLane.textContent = '—';
    infoSelDur.textContent  = '—';
    if (infoHitsound) infoHitsound.value = '';
    if (infoBridgeTo) { infoBridgeTo.value = ''; _setBridgeVisible(false); }
    if (infoBridgeAt) infoBridgeAt.value = '';
  } else {
    const n = selectedNote;
    infoSelTime.textContent = n.time.toFixed(4) + 's';
    infoSelLane.textContent = ALL_LANE_NAMES[n.lane] || `Lane ${n.lane + 1}`;
    infoSelDur.textContent  = (n.duration > 0) ? n.duration.toFixed(4) + 's (hold)' : 'tap';
    if (infoHitsound) infoHitsound.value = n.hitsound || '';
    if (infoBridgeTo) {
      _setBridgeVisible(n.duration > 0);
      infoBridgeTo.value = n.glide !== undefined ? String(n.glide) : '';
    }
    if (infoBridgeAt) infoBridgeAt.value = n.glide !== undefined ? ((n.glideAt || 0) * 1000).toFixed(0) : '';
  }
}

function _setBridgeVisible(show) {
  const row = document.getElementById('infoBridgeRow');
  if (!row) return;
  row.style.display = show ? '' : 'none';
  if (show && infoBridgeTo) {
    // Rebuild options for current lane count
    const current = infoBridgeTo.value;
    while (infoBridgeTo.options.length > 1) infoBridgeTo.remove(1);
    for (let i = 0; i < LANE_COUNT; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = ALL_LANE_NAMES[i] || `Lane ${i + 1}`;
      infoBridgeTo.appendChild(opt);
    }
    infoBridgeTo.value = current;
  }
}

// Per-note hitsound dropdown handler
if (infoHitsound) {
  infoHitsound.addEventListener('change', () => {
    if (!selectedNote) return;
    pushUndo();
    const val = infoHitsound.value;
    if (val) selectedNote.hitsound = val;
    else     delete selectedNote.hitsound;
    markModified();
  });
}

// Bridge to / glide controls
if (infoBridgeTo) {
  infoBridgeTo.addEventListener('change', () => {
    if (!selectedNote || !(selectedNote.duration > 0)) return;
    pushUndo();
    const val = infoBridgeTo.value;
    if (val === '') {
      delete selectedNote.glide;
      delete selectedNote.glideAt;
    } else {
      const targetLane = parseInt(val);
      selectedNote.glide   = targetLane;
      // Default glideAt to half the duration
      selectedNote.glideAt = +(selectedNote.duration / 2).toFixed(4);
    }
    markModified();
    updateInfoPanel();
    draw();
  });
}
if (infoBridgeAt) {
  infoBridgeAt.addEventListener('change', () => {
    if (!selectedNote || selectedNote.glide === undefined) return;
    pushUndo();
    const ms = parseFloat(infoBridgeAt.value) || 0;
    selectedNote.glideAt = +Math.max(0, Math.min(selectedNote.duration, ms / 1000)).toFixed(4);
    markModified();
    draw();
  });
}

// ── Add Glide from selection ──────────────────────────────────────────────────
document.getElementById('btnAddGlide')?.addEventListener('click', () => {
  // Collect all selected notes (multiSel + selectedNote if not already in multiSel)
  const sel = [...multiSel, ...(selectedNote && !multiSel.has(selectedNote) ? [selectedNote] : [])];
  if (sel.length < 2) { showToast('Select 2 or more notes to create a glide (or chain).', 3000, true); return; }

  // Sort by time to define the chain order
  sel.sort((a, b) => a.time - b.time);

  pushUndo();
  let applied = 0;

  for (let i = 0; i < sel.length - 1; i++) {
    const src = sel[i];
    const tgt = sel[i + 1];

    // Skip consecutive notes in the same lane
    if (src.lane === tgt.lane) continue;

    // Auto-extend tap notes (duration=0) to reach the transition point
    const needed = tgt.time - src.time;
    if (src.duration < needed + 0.05) {
      src.duration = +(needed + 0.1).toFixed(4);
    }

    src.glide   = tgt.lane;
    src.glideAt = +Math.max(0.001, Math.min(src.duration - 0.001, needed)).toFixed(4);
    applied++;
  }

  if (!applied) { showToast('No valid glide pairs found (all selected notes may be in the same lane).', 3000, true); return; }

  markModified();
  multiSel.clear();
  selectedNote = sel[0];
  syncIdx();
  updateInfoPanel();
  draw();
});

// ── Remove Glide from selection ───────────────────────────────────────────────
document.getElementById('btnRemoveGlide')?.addEventListener('click', () => {
  const targets = [
    ...(selectedNote && selectedNote.glide !== undefined ? [selectedNote] : []),
    ...[...multiSel].filter(n => n.glide !== undefined),
  ];
  if (!targets.length) { showToast('No glide note selected.', 3000, true); return; }
  pushUndo();
  targets.forEach(n => { delete n.glide; delete n.glideAt; });
  markModified();
  updateInfoPanel();
  draw();
});

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  // Allow editing in contenteditable title or other inputs
  if (e.target !== document.body && e.target.tagName !== 'CANVAS') return;

  // ── Tap-tempo mode intercepts all keys ──────────────────────────────────────
  if (tapMode) {
    const tapKey = getSettings().tapTempoKey ?? ' ';
    if (e.code === 'Escape') { exitTapMode(); return; }
    if (e.key === tapKey) {
      e.preventDefault();
      const now = performance.now();
      _tapTimes.push(now);
      if (_tapTimes.length >= 2) {
        const intervals = [];
        for (let i = 1; i < _tapTimes.length; i++) intervals.push(_tapTimes[i] - _tapTimes[i - 1]);
        const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        snapBpm = Math.min(999, Math.round(60000 / avgMs));
        bpmInput.value = snapBpm;
        draw();
      }
    }
    return; // block all other keys while in tap mode
  }

  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
    e.preventDefault(); redo(); return;
  }

  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && !e.shiftKey) {
    e.preventDefault();
    const sel = [...multiSel, ...(selectedNote && !multiSel.has(selectedNote) ? [selectedNote] : [])];
    if (!sel.length) return;
    sel.sort((a, b) => a.time - b.time);
    const base = sel[0].time;
    copyBaseTime = base;
    copyBuffer = sel.map(n => ({ ...n, time: +(n.time - base).toFixed(4) }));
    showToast(`Copied ${copyBuffer.length} note${copyBuffer.length !== 1 ? 's' : ''}`);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && !e.shiftKey) {
    e.preventDefault();
    if (!copyBuffer?.length) return;
    const pasteBase  = currentTime();
    pushUndo();
    const pasted = copyBuffer.map(n => ({ ...n, time: +(pasteBase + n.time).toFixed(4) }));
    notes.push(...pasted);
    notes.sort((a, b) => a.time - b.time);
    clearSelection();
    if (pasted.length === 1) {
      selectedNote = pasted[0];
      selectedIdx  = notes.indexOf(pasted[0]);
    } else {
      pasted.forEach(n => multiSel.add(n));
      selectedNote = pasted[0];
      selectedIdx  = notes.indexOf(pasted[0]);
    }
    markModified();
    infoNotes.textContent = notes.length;
    updateInfoPanel();
    draw();
    return;
  }

  // Shift+R to start/stop re-record
  if (e.shiftKey && e.code === 'KeyR') {
    e.preventDefault();
    if (reRecording) stopReRecord(); else startReRecord();
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (reRecording) { stopReRecord(); return; }
    if (!audioBuffer) { showToast('Load an audio file first.', 3000, true); return; }
    if (isPlaying) pauseAudio();
    else {
      let t = currentTime();
      if (t >= duration && duration > 0) t = 0;
      startAudio(t);
    }
    draw();
    return;
  }

  if (e.code === 'Escape' && reRecording) {
    e.preventDefault();
    cancelReRecord();
    return;
  }

  const lane = KEY_LANE_MAP[e.key];
  if (lane !== undefined && reRecording) {
    e.preventDefault();
    if (reRecHeld[lane]) return; // already held
    reRecHeld[lane] = { time: currentTime() };
    return;
  }

  if (lane !== undefined) {
    e.preventDefault();
    const t       = currentTime();
    const snapped = +snapToGrid(t).toFixed(4);
    const dup = notes.find(n => Math.abs(n.time - snapped) < 0.001 && n.lane === lane);
    if (dup) return;
    const newNote = { time: snapped, lane, duration: 0 };
    pushUndo();
    notes.push(newNote);
    notes.sort((a, b) => a.time - b.time);
    selectedNote = newNote;
    selectedIdx  = notes.indexOf(newNote);
    multiSel.clear();
    markModified();
    infoNotes.textContent = notes.length;
    updateInfoPanel();
    draw();
    return;
  }

  if (e.code === 'Delete' || e.code === 'Backspace') {
    const toDelete = new Set(multiSel);
    if (selectedNote) toDelete.add(selectedNote);
    if (toDelete.size > 0) {
      pushUndo();
      notes = notes.filter(n => !toDelete.has(n));
      clearSelection();
      markModified();
      infoNotes.textContent = notes.length;
      updateInfoPanel();
      draw();
    }
    return;
  }

  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    const toNudge = [...multiSel, ...(selectedNote ? [selectedNote] : [])];
    if (!toNudge.length) return;
    e.preventDefault();
    if (!e.repeat) pushUndo();
    const step = e.shiftKey ? 0.001 : 0.01;
    const dir  = e.code === 'ArrowLeft' ? -1 : 1;

    if (e.ctrlKey || e.metaKey) {
      if (selectedNote) {
        selectedNote.duration = +Math.max(0, (selectedNote.duration || 0) + dir * step).toFixed(4);
      }
    } else {
      for (const n of toNudge) {
        n.time = +Math.max(0, n.time + dir * step).toFixed(4);
      }
      notes.sort((a, b) => a.time - b.time);
      syncIdx();
    }
    markModified();
    updateInfoPanel();
    draw();
  }

  if (e.code === 'Escape') {
    clearSelection();
    updateInfoPanel();
    draw();
  }
});

// ── Keyup (re-record hold note completion) ───────────────────────────────────
document.addEventListener('keyup', e => {
  if (!reRecording) return;
  const lane = KEY_LANE_MAP[e.key];
  if (lane === undefined || !reRecHeld[lane]) return;
  const info = reRecHeld[lane];
  const dur  = currentTime() - info.time;
  if (dur > 0.08) {
    reRecNotes.push({ time: +info.time.toFixed(4), lane, duration: +dur.toFixed(4) });
  } else {
    reRecNotes.push({ time: +info.time.toFixed(4), lane, duration: 0 });
  }
  delete reRecHeld[lane];
});

// ── Zoom buttons ───────────────────────────────────────────────────────────────
btnZoomIn.addEventListener('click',  () => { pxPerSec = Math.min(MAX_PPS, pxPerSec * 1.5); draw(); });
btnZoomOut.addEventListener('click', () => { pxPerSec = Math.max(MIN_PPS, pxPerSec / 1.5); draw(); });

// ── Save & Export ──────────────────────────────────────────────────────────────

btnTest.addEventListener('click', async () => {
  clearTimeout(_autosaveDebounce);
  await doSave();
  showSaved();
  window.open(`game.html?id=${songId}&t=${playOffset.toFixed(3)}&from=editor`, '_blank');
});

btnSave.addEventListener('click', async () => {
  clearTimeout(_autosaveDebounce);
  await doSave();
  showSaved();
});

exportSel.addEventListener('change', async () => {
  const fmt = exportSel.value;
  if (!fmt) return;
  exportSel.value = '';

  const safeName = song.title.replace(/[^a-z0-9_\- ]/gi, '_');
  const out = {
    title: song.title, artist: song.artist || '', difficulty: song.difficulty || '',
    offset: song.offset || 0, laneCount: song.laneCount || 3, bpm: song.bpm || 0,
    bpmSections: song.bpmSections || [],
    notes: notes.map(serializeNote),
    trimStart: trimStart || 0,
    trimEnd: trimEnd || duration,
    version: '1.2',
  };

  if (fmt === 'share') {
    exportSel.options[0].text = '📋 Copying…';
    if (exportSel._krSync) exportSel._krSync();
    try {
      const compressed = await compress(JSON.stringify(out));
      await navigator.clipboard.writeText(compressed);
      exportSel.options[0].text = '✓ Copied!';
      if (exportSel._krSync) exportSel._krSync();
      setTimeout(() => { exportSel.options[0].text = '⬇ Export as…'; if (exportSel._krSync) exportSel._krSync(); }, 1800);
    } catch (err) {
      showToast('Share failed: ' + err.message, 3000, true);
      exportSel.options[0].text = '⬇ Export as…';
      if (exportSel._krSync) exportSel._krSync();
    }
  } else if (fmt === 'json') {
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: safeName + '.json',
    });
    a.click(); URL.revokeObjectURL(a.href);
  } else if (fmt === 'krz') {
    exportSel.options[0].text = '⌛ Packing…';
    if (exportSel._krSync) exportSel._krSync();
    try {
      let ab = await getAudio(songId);
      if (ab && audioBuffer && (trimStart > 0 || trimEnd < duration)) {
        const trimmedBuf = _sliceAudioBuffer(audioBuffer, trimStart, trimEnd);
        ab = _encodeWav(trimmedBuf);
        out.notes = out.notes.map(n => ({
          ...n,
          t: +(n.t - trimStart).toFixed(4),
        }));
        out.trimStart = 0;
        out.trimEnd = trimEnd - trimStart;
      }
      const krzAB = await writeKRZ2(out, ab || null);
      const blob  = new Blob([krzAB], { type: 'application/octet-stream' });
      const a     = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob), download: safeName + '.krz',
      });
      a.click(); URL.revokeObjectURL(a.href);
    } catch (err) { showToast('Export failed: ' + err.message, 3000, true); }
    exportSel.options[0].text = '⬇ Export as…';
    if (exportSel._krSync) exportSel._krSync();
  }
});

