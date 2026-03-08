const uploadZone  = document.getElementById('uploadZone');
const audioFileIn = document.getElementById('audioFile');
const uploadText  = document.getElementById('uploadText');
const btnRecord   = document.getElementById('btnRecord');
const btnStop     = document.getElementById('btnStop');
const recStatus   = document.getElementById('recStatus');
const recTime     = document.getElementById('recTime');
const noteCountEl = document.getElementById('noteCount').querySelector('span');
const cdOverlay   = document.getElementById('countdownOverlay');
const cdNum       = document.getElementById('cdNum');
const laneCountEl = document.getElementById('laneCount');

const MIN_HOLD_DUR = 0.1;
const ALL_LANE_NAMES   = ['Left', 'Mid', 'Right', 'Lane 4', 'Lane 5', 'Lane 6', 'Lane 7'];
const ALL_DEFAULT_KEYS = ['[', ']', '\\', 'Enter', 'a', 's', 'd'];

document.getElementById('btnBack').addEventListener('click', () => { window.location.href = 'index.html'; });

let audioBuffer = null;
let audioCtx    = null;
let audioSrc    = null;
let audioAB     = null;
let recording   = false;
let recState    = null; // null | 'recording' | 'paused'
let startTime   = 0;
let pauseOffset = 0;   // accumulated playback position when paused
let notes       = [];
let rafId       = null;
let heldSince   = {};
let metronomeIntervalId = null;

// ── Trim state ───────────────────────────────────────────────────────────────
let trimStartCreate = 0;
let trimEndCreate   = 0;

const btnAutotrimCreate  = document.getElementById('btnAutotrimCreate');
const trimPadBeatsCreate = document.getElementById('trimPadBeatsCreate');
const trimStatusCreate   = document.getElementById('trimStatusCreate');

// ── Dynamic BPM sections ──────────────────────────────────────────────────────
let bpmSectionsCreate = [];
let dynamicBpmOnCreate = false;

const btnUndo5  = document.getElementById('btnUndo5');
const btnCancel = document.getElementById('btnCancel');
const btnPause  = document.getElementById('btnPause');
const recDot    = document.getElementById('recDot');
const recLabel  = document.getElementById('recLabel');
const recToast  = document.getElementById('recToast');

// KEY_LANE built when recording starts
let KEY_LANE = { '[': 0, ']': 1, '\\': 2 };
let kb       = [];   // key indicator DOM elements

// ── Build key hint UI ─────────────────────────────────────────────────────────
function rebuildKeyHints() {
  const laneCount = parseInt(laneCountEl.value) || 3;
  const keybinds  = getKeybindsForLanes(laneCount);
  const skinColors = _getSkinLaneColors();
  const container = document.getElementById('keyHintsContainer');
  container.innerHTML = '';
  kb = [];

  for (let i = 0; i < laneCount; i++) {
    const k    = keybinds[i] || '';
    const col  = skinColors[i % skinColors.length];
    const div  = document.createElement('div');
    div.className = 'key-hint';

    const box = document.createElement('div');
    box.className = 'key-box';
    box.id        = `kb${i}`;
    box.textContent = displayKeyName(k);
    box.style.borderColor = col;
    box.style.color       = col;

    const label = document.createElement('div');
    label.className   = 'key-label';
    label.textContent = ALL_LANE_NAMES[i] || `Lane ${i + 1}`;

    div.appendChild(box);
    div.appendChild(label);
    container.appendChild(div);
    kb.push(box);
  }
}

laneCountEl.addEventListener('change', rebuildKeyHints);
rebuildKeyHints();  // initial build

// ── Upload zone ───────────────────────────────────────────────────────────────
uploadZone.addEventListener('click', () => audioFileIn.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.borderColor = 'var(--accent)'; });
uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.style.borderColor = '';
  const f = e.dataTransfer.files[0];
  if (f) loadAudioFile(f);
});
audioFileIn.addEventListener('change', e => {
  if (e.target.files[0]) loadAudioFile(e.target.files[0]);
});

async function loadAudioFile(file) {
  uploadText.textContent = 'Loading…';
  try {
    audioAB = await file.arrayBuffer();
    const ctx = new AudioContext();
    audioBuffer = await ctx.decodeAudioData(audioAB.slice(0));
    await ctx.close();
    uploadText.textContent = `✓  ${file.name}`;
    uploadZone.classList.add('has-file');
    btnRecord.disabled  = false;
    btnAutoGen.disabled = false;
    btnDetectBpmCreate.disabled = false;
    btnAutotrimCreate.disabled = false;
    trimStartCreate = 0;
    trimEndCreate   = audioBuffer.duration;

    const titleInput = document.getElementById('inputTitle');
    if (!titleInput.value.trim()) {
      titleInput.value = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_\-]+/g, ' ');
    }
  } catch (e) {
    uploadText.textContent = 'Error loading audio – try another file';
    btnRecord.disabled  = true;
    btnAutoGen.disabled = true;
  }
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function doCountdown() {
  return new Promise(resolve => {
    cdOverlay.classList.remove('hidden');
    let n = 3;
    cdNum.textContent = n;
    cdNum.style.animation = 'none';
    cdNum.offsetHeight;
    cdNum.style.animation = '';

    const tick = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(tick);
        cdOverlay.classList.add('hidden');
        resolve();
      } else {
        cdNum.textContent = n;
        cdNum.style.animation = 'none';
        cdNum.offsetHeight;
        cdNum.style.animation = '';
      }
    }, 1000);
  });
}

// ── Metronome (AudioContext-scheduled to avoid setInterval drift) ─────────────
let _metCtx = null;
let _metNextBeat = 0;
let _metInterval = 0;
const _MET_LOOKAHEAD = 0.1;  // schedule 100ms ahead
const _MET_CHECK     = 25;   // check every 25ms

function startMetronome(bpm, ctx) {
  stopMetronome();
  if (!bpm || bpm <= 0) return;
  _metCtx = ctx;
  _metInterval = 60 / bpm;
  _metNextBeat = ctx.currentTime;

  function scheduleBeats() {
    const cfg3 = getSettings();
    const mv   = (cfg3.masterVolume    !== undefined ? cfg3.masterVolume    : 1.0) *
                 (cfg3.metronomeVolume !== undefined ? cfg3.metronomeVolume : 0.5);
    while (_metNextBeat < ctx.currentTime + _MET_LOOKAHEAD) {
      // Dynamic: look up BPM for the current beat time
      let beatBpm = bpm;
      if (dynamicBpmOnCreate && bpmSectionsCreate.length > 0) {
        const elapsed = _metNextBeat - (startTime || 0);
        const sec = bpmSectionsCreate.find(s => elapsed >= s.startTime && elapsed < s.endTime);
        if (sec) beatBpm = sec.bpm;
      }
      const interval = 60 / beatBpm;

      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(Math.max(0, mv * 0.5), _metNextBeat);
      gain.gain.exponentialRampToValueAtTime(0.001, _metNextBeat + 0.06);
      osc.start(_metNextBeat);
      osc.stop(_metNextBeat + 0.08);
      _metNextBeat += interval;
    }
  }

  scheduleBeats();
  metronomeIntervalId = setInterval(scheduleBeats, _MET_CHECK);
}

function stopMetronome() {
  if (metronomeIntervalId !== null) {
    clearInterval(metronomeIntervalId);
    metronomeIntervalId = null;
  }
  _metCtx = null;
}

// "Sync to BPM" sets hold threshold to half a beat at the current metronome BPM
document.getElementById('btnSyncThreshold').addEventListener('click', () => {
  const bpm = parseFloat(document.getElementById('metronomeBpm').value);
  if (!bpm || bpm <= 0) { showToast('Enter a BPM value first.', 3000, true); return; }
  const halfBeatMs = Math.round((60 / bpm / 2) * 1000);
  document.getElementById('holdThresholdMs').value = halfBeatMs;
});

// ── BPM Detection (create page) ──────────────────────────────────────────────
const metronomeBpm           = document.getElementById('metronomeBpm');
const btnDetectBpmCreate     = document.getElementById('btnDetectBpmCreate');
const dynamicBpmToggleCreate = document.getElementById('dynamicBpmToggleCreate');
const bpmSectionsBarCreate   = document.getElementById('bpmSectionsBarCreate');
const bpmSectionsListCreate  = document.getElementById('bpmSectionsListCreate');
const btnAddSectionCreate    = document.getElementById('btnAddSectionCreate');

btnDetectBpmCreate.addEventListener('click', async () => {
  if (!audioBuffer) return;
  btnDetectBpmCreate.classList.add('btn-detecting');
  btnDetectBpmCreate.textContent = 'Detecting…';

  await new Promise(r => setTimeout(r, 50));

  try {
    if (dynamicBpmOnCreate) {
      bpmSectionsCreate = detectDynamicBPM(audioBuffer);
      renderSectionsListCreate();
      bpmSectionsBarCreate.classList.remove('hidden');
      const first = bpmSectionsCreate[0];
      if (first) metronomeBpm.value = first.bpm;
    } else {
      const result = detectBPM(audioBuffer);
      metronomeBpm.value = result.bpm || '';
      bpmSectionsCreate = [];
      bpmSectionsBarCreate.classList.add('hidden');
    }
  } catch (e) {
    console.error('BPM detection failed:', e);
  }

  btnDetectBpmCreate.classList.remove('btn-detecting');
  btnDetectBpmCreate.textContent = 'Detect';
});

btnAutotrimCreate.addEventListener('click', () => {
  if (!audioBuffer) return;
  const bpm = +metronomeBpm.value || 0;
  const padBeats = +trimPadBeatsCreate.value || 0;
  const result = computeAutotrim(audioBuffer, {
    bpm,
    padBeatsStart: padBeats,
    padBeatsEnd: padBeats
  });
  trimStartCreate = result.trimStart;
  trimEndCreate   = result.trimEnd;
  const trimmedDur = (trimEndCreate - trimStartCreate).toFixed(1);
  trimStatusCreate.textContent = `Trimmed: ${trimStartCreate.toFixed(2)}s – ${trimEndCreate.toFixed(2)}s (${trimmedDur}s)`;
});

dynamicBpmToggleCreate.addEventListener('change', () => {
  dynamicBpmOnCreate = dynamicBpmToggleCreate.checked;
  if (!dynamicBpmOnCreate) {
    bpmSectionsCreate = [];
    bpmSectionsBarCreate.classList.add('hidden');
    metronomeBpm.readOnly = false;
  } else {
    metronomeBpm.readOnly = true;
  }
});

btnAddSectionCreate.addEventListener('click', () => {
  const t = recording ? (audioCtx.currentTime - startTime) : 0;
  const dur = audioBuffer ? audioBuffer.duration : 0;
  const curBpm = parseInt(metronomeBpm.value) || 120;
  if (bpmSectionsCreate.length === 0) {
    bpmSectionsCreate.push({ startTime: 0, endTime: dur, bpm: curBpm, confidence: 1 });
  } else {
    const idx = bpmSectionsCreate.findIndex(s => t >= s.startTime && t < s.endTime);
    if (idx >= 0) {
      const old = bpmSectionsCreate[idx];
      const newSec = { startTime: t, endTime: old.endTime, bpm: old.bpm, confidence: old.confidence };
      old.endTime = t;
      bpmSectionsCreate.splice(idx + 1, 0, newSec);
    }
  }
  renderSectionsListCreate();
});

function renderSectionsListCreate() {
  bpmSectionsListCreate.innerHTML = '';
  const SECTION_COLORS = [
    'rgba(192,96,255,0.6)', 'rgba(64,196,255,0.6)',
    'rgba(96,255,144,0.6)', 'rgba(255,128,64,0.6)',
    'rgba(255,64,128,0.6)', 'rgba(255,208,64,0.6)'
  ];
  bpmSectionsCreate.forEach((sec, i) => {
    const el = document.createElement('div');
    el.className = 'bpm-section-item';

    const dot = document.createElement('span');
    dot.className = 'bpm-section-color';
    dot.style.background = SECTION_COLORS[i % SECTION_COLORS.length];
    el.appendChild(dot);

    const time = document.createElement('span');
    time.className = 'section-time';
    const fmt = t => { const m = Math.floor(t/60); return m+':'+(t%60).toFixed(1).padStart(4,'0'); };
    time.textContent = fmt(sec.startTime) + '–' + fmt(sec.endTime);
    el.appendChild(time);

    const bpm = document.createElement('span');
    bpm.className = 'section-bpm';
    bpm.textContent = sec.bpm + ' BPM';
    bpm.title = 'Click to edit';
    bpm.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'number'; input.className = 'section-bpm-input';
      input.value = sec.bpm; input.min = 1; input.max = 999;
      bpm.replaceWith(input);
      input.focus(); input.select();
      const finish = () => {
        sec.bpm = Math.max(1, Math.min(999, parseInt(input.value) || sec.bpm));
        renderSectionsListCreate();
      };
      input.addEventListener('blur', finish);
      input.addEventListener('keydown', ev => { if (ev.key === 'Enter') input.blur(); });
    });
    el.appendChild(bpm);

    if (bpmSectionsCreate.length > 1) {
      const del = document.createElement('span');
      del.className = 'section-delete';
      del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (i === 0 && bpmSectionsCreate.length > 1) {
          bpmSectionsCreate[1].startTime = 0;
          bpmSectionsCreate.splice(0, 1);
        } else if (i > 0) {
          bpmSectionsCreate[i-1].endTime = sec.endTime;
          bpmSectionsCreate.splice(i, 1);
        }
        renderSectionsListCreate();
      });
      el.appendChild(del);
    }

    bpmSectionsListCreate.appendChild(el);
  });
}

// ── Recording ─────────────────────────────────────────────────────────────────
btnRecord.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);
btnCancel.addEventListener('click', cancelRecording);
btnPause.addEventListener('click', togglePauseRecording);

async function startRecording() {
  const title = document.getElementById('inputTitle').value.trim();
  if (!title)  { showToast('Please enter a song title.', 3000, true); return; }
  if (!audioAB) { showToast('Please upload an audio file.', 3000, true); return; }

  // Build KEY_LANE from per-lane-count keybind profile
  const laneCount = parseInt(laneCountEl.value) || 3;
  const kb = getKeybindsForLanes(laneCount);
  KEY_LANE = {};
  for (let i = 0; i < laneCount; i++) {
    const k = kb[i] || '';
    if (k) KEY_LANE[k] = i;
  }

  audioCtx    = new AudioContext();
  audioBuffer = await audioCtx.decodeAudioData(audioAB.slice(0));

  // Pause background music (offscreen doc + local bgVideo)
  chrome.runtime.sendMessage({ type: 'bgMusic:pause' });
  const _bgVid = document.getElementById('_krAppBg');
  if (_bgVid && _bgVid.tagName === 'VIDEO') _bgVid.muted = true;
  btnRecord.disabled = true;
  await doCountdown();
  btnRecord.disabled = false;

  notes       = [];
  heldSince   = {};
  pauseOffset = 0;
  noteCountEl.textContent = '0';
  _startAudioFrom(0);
  recording = true;
  recState  = 'recording';

  const metOn  = document.getElementById('metronomeToggle').checked;
  const metBpm = parseFloat(document.getElementById('metronomeBpm').value);
  if (metOn && metBpm > 0) startMetronome(metBpm, audioCtx);

  btnRecord.classList.add('hidden');
  btnPause.classList.remove('hidden');
  btnPause.textContent = '⏸ Pause';
  btnStop.classList.remove('hidden');
  btnUndo5.classList.remove('hidden');
  btnCancel.classList.remove('hidden');
  recStatus.classList.remove('hidden');
  recDot.style.display = '';
  recLabel.textContent = 'RECORDING';

  rafId = requestAnimationFrame(tickTimer);
  startRisingVis();
}

function _startAudioFrom(offset) {
  audioSrc = audioCtx.createBufferSource();
  audioSrc.buffer = audioBuffer;
  const cfg4 = getSettings();
  const createMusicGain = audioCtx.createGain();
  createMusicGain.gain.value = Math.max(0,
    (cfg4.masterVolume !== undefined ? cfg4.masterVolume : 1.0) *
    (cfg4.musicVolume  !== undefined ? cfg4.musicVolume  : 1.0));
  audioSrc.connect(createMusicGain);
  createMusicGain.connect(audioCtx.destination);
  const actualOffset = trimStartCreate + offset;
  startTime = audioCtx.currentTime - offset;
  audioSrc.start(0, actualOffset);
  // Stop at trim end
  const remainSec = trimEndCreate - actualOffset;
  if (remainSec > 0 && trimEndCreate < audioBuffer.duration) audioSrc.stop(audioCtx.currentTime + remainSec);
  audioSrc.onended = () => { if (recording && recState === 'recording') stopRecording(); };
}

function togglePauseRecording() {
  if (recState === 'recording') pauseRecording();
  else if (recState === 'paused') resumeRecording();
}

function pauseRecording() {
  if (recState !== 'recording') return;
  recState = 'paused';

  // Finalize any held notes
  const t = +(audioCtx.currentTime - startTime).toFixed(4);
  for (const lane of Object.keys(heldSince)) {
    const info = heldSince[lane];
    const dur  = t - info.time;
    const threshEl = document.getElementById('holdThresholdMs');
    const thresh   = threshEl ? (parseFloat(threshEl.value) || 0) / 1000 : 0;
    if (dur >= Math.max(MIN_HOLD_DUR, thresh)) notes[info.idx].duration = +dur.toFixed(4);
  }
  heldSince = {};
  pauseOffset = t;

  try { audioSrc.stop(); } catch (_) {}
  stopMetronome();
  cancelAnimationFrame(rafId);

  // Update timer to show exact paused time
  const m = Math.floor(pauseOffset / 60);
  const s = (pauseOffset % 60).toFixed(3).padStart(6, '0');
  recTime.textContent = `${m}:${s}`;

  recDot.style.display = 'none';
  recLabel.textContent = 'PAUSED';
  btnPause.textContent = '▶ Resume';
}

async function resumeRecording() {
  if (recState !== 'paused') return;

  // Quick countdown
  cdOverlay.classList.remove('hidden');
  cdNum.textContent = 'GO';
  cdNum.style.animation = 'none'; cdNum.offsetHeight; cdNum.style.animation = '';
  await new Promise(r => setTimeout(r, 600));
  cdOverlay.classList.add('hidden');

  _startAudioFrom(pauseOffset);
  recState = 'recording';

  const metOn  = document.getElementById('metronomeToggle').checked;
  const metBpm = parseFloat(document.getElementById('metronomeBpm').value);
  if (metOn && metBpm > 0) startMetronome(metBpm, audioCtx);

  recDot.style.display = '';
  recLabel.textContent = 'RECORDING';
  btnPause.textContent = '⏸ Pause';
  rafId = requestAnimationFrame(tickTimer);
}

function undoLast5s() {
  if (!recording) return;
  const wasPaused = recState === 'paused';

  // Get current time
  let curTime;
  if (wasPaused) {
    curTime = pauseOffset;
  } else {
    curTime = +(audioCtx.currentTime - startTime).toFixed(4);
    // Pause first — detach onended so it doesn't trigger stopRecording
    if (audioSrc) audioSrc.onended = null;
    try { audioSrc.stop(); } catch (_) {}
    stopMetronome();
    cancelAnimationFrame(rafId);
  }

  // Remove notes from last 5 seconds
  const undoTime = Math.max(0, curTime - 5);
  const before = notes.length;
  notes = notes.filter(n => n.time < undoTime);
  const removed = before - notes.length;
  heldSince = {};
  risingNotes = [];
  pauseOffset = undoTime;
  noteCountEl.textContent = notes.length;

  // Update timer display
  const m = Math.floor(undoTime / 60);
  const s = (undoTime % 60).toFixed(3).padStart(6, '0');
  recTime.textContent = `${m}:${s}`;

  // Show toast
  showRecToast(`Removed ${removed} note${removed !== 1 ? 's' : ''}, rewound to ${undoTime.toFixed(1)}s`);

  if (undoTime <= 0 || wasPaused) {
    // Enter paused state
    recState = 'paused';
    recDot.style.display = 'none';
    recLabel.textContent = 'PAUSED';
    btnPause.textContent = '▶ Resume';
  } else {
    // Resume from new position
    _startAudioFrom(undoTime);
    recState = 'recording';
    const metOn  = document.getElementById('metronomeToggle').checked;
    const metBpm = parseFloat(document.getElementById('metronomeBpm').value);
    if (metOn && metBpm > 0) startMetronome(metBpm, audioCtx);
    recDot.style.display = '';
    recLabel.textContent = 'RECORDING';
    btnPause.textContent = '⏸ Pause';
    rafId = requestAnimationFrame(tickTimer);
  }
}

// showToast is now in utils.js; for recording feedback use recToast directly
function showRecToast(msg) {
  recToast.textContent = msg;
  recToast.style.display = 'block';
  setTimeout(() => { recToast.style.display = 'none'; }, 2500);
}

function tickTimer() {
  if (!recording || recState !== 'recording') return;
  const t = audioCtx.currentTime - startTime;
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(3).padStart(6, '0');
  recTime.textContent = `${m}:${s}`;
  rafId = requestAnimationFrame(tickTimer);
}

async function stopRecording() {
  recording = false;
  recState  = null;
  cancelAnimationFrame(rafId);
  stopMetronome();
  stopRisingVis();
  chrome.runtime.sendMessage({ type: 'bgMusic:play' });
  const _bgVid = document.getElementById('_krAppBg');
  if (_bgVid && _bgVid.tagName === 'VIDEO' && getSettings().bgMusicMode === 'bgVideo') _bgVid.muted = false;

  // Finalize any held notes (same logic as pauseRecording)
  if (audioCtx && Object.keys(heldSince).length > 0) {
    const t = +(audioCtx.currentTime - startTime).toFixed(4);
    for (const lane of Object.keys(heldSince)) {
      const info = heldSince[lane];
      const dur  = t - info.time;
      const threshEl = document.getElementById('holdThresholdMs');
      const thresh   = threshEl ? (parseFloat(threshEl.value) || 0) / 1000 : 0;
      if (dur >= Math.max(MIN_HOLD_DUR, thresh)) notes[info.idx].duration = +dur.toFixed(4);
    }
  }
  heldSince = {};

  try { audioSrc.stop(); } catch (_) {}
  await audioCtx.close();
  audioCtx = null;

  // Reset recording UI state
  recDot.style.display = '';
  recLabel.textContent = 'RECORDING';
  recTime.textContent  = '0:00.000';

  btnStop.classList.add('hidden');
  btnPause.classList.add('hidden');
  btnUndo5.classList.add('hidden');
  btnCancel.classList.add('hidden');
  recStatus.classList.add('hidden');

  if (!notes.length) {
    btnRecord.disabled = false;
    btnRecord.classList.remove('hidden');
    noteCountEl.textContent = '0';
    showToast('No notes recorded.', 3000, true);
    return;
  }
  btnRecord.classList.remove('hidden');

  const laneCount = parseInt(laneCountEl.value) || 3;
  const bpm       = parseFloat(document.getElementById('metronomeBpm').value) || 0;

  // Snap recorded notes to BPM grid if enabled
  const doSnap = document.getElementById('snapToBpm').checked;
  const snapDiv = parseInt(document.getElementById('snapDiv').value) || 4;
  if (doSnap && bpm > 0) {
    for (const n of notes) {
      let noteBpm = bpm;
      if (dynamicBpmOnCreate && bpmSectionsCreate.length > 0) {
        const sec = bpmSectionsCreate.find(s => n.time >= s.startTime && n.time < s.endTime);
        if (sec) noteBpm = sec.bpm;
      }
      const beatLen = 60 / noteBpm / snapDiv;
      const snapped = Math.max(0, Math.round(n.time / beatLen) * beatLen);
      if (n.duration > 0) {
        const endSnapped = Math.round((n.time + n.duration) / beatLen) * beatLen;
        n.duration = +Math.max(0, endSnapped - snapped).toFixed(4);
      }
      n.time = +snapped.toFixed(4);
    }
  }

  // Deduplicate notes at same time+lane (keep first occurrence)
  const sortedNotes = notes.slice().sort((a, b) => a.time - b.time);
  const dedupSet = new Set();
  const dedupNotes = sortedNotes.filter(n => {
    const key = n.time.toFixed(4) + ':' + n.lane;
    if (dedupSet.has(key)) return false;
    dedupSet.add(key);
    return true;
  });

  const id = 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const song = {
    id,
    title:     document.getElementById('inputTitle').value.trim(),
    artist:    document.getElementById('inputArtist').value.trim(),
    offset:    0,
    laneCount,
    bpm:       bpm > 0 ? bpm : 0,
    bpmSections: dynamicBpmOnCreate ? bpmSectionsCreate : [],
    notes:     dedupNotes.map(serializeNote),
    trimStart: trimStartCreate,
    trimEnd:   trimEndCreate,
    createdAt: Date.now(),
  };

  await saveSong(song);
  await saveAudio(id, audioAB);
  window.location.href = `editor.html?id=${id}`;
}

async function cancelRecording() {
  recording = false;
  recState  = null;
  cancelAnimationFrame(rafId);
  stopMetronome();
  stopRisingVis();
  chrome.runtime.sendMessage({ type: 'bgMusic:play' });
  const _bgVid = document.getElementById('_krAppBg');
  if (_bgVid && _bgVid.tagName === 'VIDEO' && getSettings().bgMusicMode === 'bgVideo') _bgVid.muted = false;
  heldSince = {};

  try { audioSrc.stop(); } catch (_) {}
  await audioCtx.close();
  audioCtx = null;

  notes       = [];
  pauseOffset = 0;
  noteCountEl.textContent = '0';

  btnStop.classList.add('hidden');
  btnPause.classList.add('hidden');
  btnUndo5.classList.add('hidden');
  btnCancel.classList.add('hidden');
  btnRecord.classList.remove('hidden');
  recStatus.classList.add('hidden');

  showToast('Recording discarded.');
}

// ── Key input ─────────────────────────────────────────────────────────────────
function _resolveCreateKeyLane(e) {
  let lane = KEY_LANE[e.key];
  if (lane === undefined) lane = KEY_LANE[e.code];
  return lane;
}

document.addEventListener('keydown', e => {
  // Space toggles pause/resume (only if Space is not a lane key)
  if (e.key === ' ' && recording && KEY_LANE[' '] === undefined) {
    e.preventDefault();
    if (recState === 'recording') pauseRecording();
    else if (recState === 'paused') resumeRecording();
    return;
  }

  const lane = _resolveCreateKeyLane(e);
  if (lane === undefined) return;
  e.preventDefault();

  if (recording && recState === 'recording' && !(lane in heldSince)) {
    const t = +(audioCtx.currentTime - startTime).toFixed(4);

    notes.push({ time: t, lane, duration: 0 });
    noteCountEl.textContent = notes.length;
    heldSince[lane] = { time: t, idx: notes.length - 1 };
    risingNotes.push({ lane, startMs: Date.now(), endMs: null });
  }
  if (kb[lane]) kb[lane].classList.add('pressed');
});

document.addEventListener('keyup', e => {
  const lane = _resolveCreateKeyLane(e);
  if (lane === undefined) return;
  e.preventDefault();

  if (recording && recState === 'recording' && lane in heldSince) {
    const info     = heldSince[lane];
    const t        = +(audioCtx.currentTime - startTime).toFixed(4);
    const dur      = t - info.time;
    const threshEl = document.getElementById('holdThresholdMs');
    const thresh   = threshEl ? (parseFloat(threshEl.value) || 0) / 1000 : 0;
    const minDur   = Math.max(MIN_HOLD_DUR, thresh);
    if (dur >= minDur) notes[info.idx].duration = +dur.toFixed(4);
    delete heldSince[lane];
    for (let i = risingNotes.length - 1; i >= 0; i--) {
      if (risingNotes[i].lane === lane && risingNotes[i].endMs === null) {
        risingNotes[i].endMs = Date.now();
        break;
      }
    }
  }
  if (kb[lane]) kb[lane].classList.remove('pressed');
});

// Undo 5s button
btnUndo5.addEventListener('click', undoLast5s);

// ── Rising notes visualization ──────────────────────────────────────────────
const risingCanvas    = document.getElementById('risingCanvas');
const risingCtx       = risingCanvas.getContext('2d');
let   risingNotes     = [];
let   risingRafId     = null;

function _getSkinLaneColors() {
  const skin = typeof getSkin === 'function' ? getSkin() : null;
  const full = typeof applySkin === 'function' ? applySkin(skin) : null;
  return (full && full.laneColors) || ALL_LANE_COLORS;
}

function startRisingVis() {
  risingCanvas.style.display = 'block';
  // Apply skin background color
  const skin = typeof getSkin === 'function' ? getSkin() : null;
  const full = typeof applySkin === 'function' ? applySkin(skin) : null;
  if (full && full.bgColor) risingCanvas.style.background = full.bgColor;
  risingNotes = [];
  if (risingRafId) cancelAnimationFrame(risingRafId);
  risingRafId = requestAnimationFrame(drawRisingNotes);
  // Instant jump to the bottom of the page
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
}

function stopRisingVis() {
  risingCanvas.style.display = 'none';
  if (risingRafId) { cancelAnimationFrame(risingRafId); risingRafId = null; }
  risingNotes = [];
}

function drawRisingNotes() {
  if (!recording) { stopRisingVis(); return; }
  risingRafId = requestAnimationFrame(drawRisingNotes);

  const rect = risingCanvas.getBoundingClientRect();
  const W = Math.round(rect.width * devicePixelRatio);
  const H = Math.round(rect.height * devicePixelRatio);
  if (risingCanvas.width !== W || risingCanvas.height !== H) {
    risingCanvas.width = W; risingCanvas.height = H;
  }
  const ctx = risingCtx;
  ctx.clearRect(0, 0, W, H);

  const laneCount = parseInt(laneCountEl.value) || 3;
  const skinColors = _getSkinLaneColors();
  const LW = W / laneCount;
  const now = Date.now();
  const speed = H / 1200; // px per ms — traverse full height in ~1.2s
  const NH = 20;

  // Draw lane dividers
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let l = 1; l < laneCount; l++) {
    ctx.beginPath(); ctx.moveTo(l * LW, 0); ctx.lineTo(l * LW, H); ctx.stroke();
  }

  for (let i = risingNotes.length - 1; i >= 0; i--) {
    const rn = risingNotes[i];
    const col = skinColors[rn.lane % skinColors.length];
    const lx = rn.lane * LW;
    const elapsed = now - rn.startMs;
    const headY = H - elapsed * speed;

    if (rn.endMs === null) {
      // Still held — check if held long enough to show hold body
      const heldMs = now - rn.startMs;
      const threshEl2 = document.getElementById('holdThresholdMs');
      const threshMs2 = threshEl2 ? Math.max(MIN_HOLD_DUR * 1000, parseFloat(threshEl2.value) || 0) : MIN_HOLD_DUR * 1000;
      if (heldMs >= threshMs2) {
        // Draw hold body from headY to bottom (clamp head to canvas)
        const clampedHead = Math.max(-NH, headY);
        const bodyH = Math.max(0, H - clampedHead);
        if (bodyH > 0) {
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = withAlpha(col, '55');
          ctx.fillRect(lx + LW * 0.2, clampedHead, LW * 0.6, bodyH);
          ctx.globalAlpha = 1;
        }
      }
      // Head cap (only draw if visible)
      if (headY > -NH) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.roundRect(lx + 4, headY - NH, LW - 8, NH, 4); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.roundRect(lx + 4, headY - NH, LW - 8, 4, [4, 4, 0, 0]); ctx.fill();
      }
    } else {
      // Released — both ends rise
      const tailElapsed = now - rn.endMs;
      const tailY = H - tailElapsed * speed;
      const alpha = Math.max(0, 1 - tailElapsed / 600);
      if (alpha <= 0 || tailY < -20) { risingNotes.splice(i, 1); continue; }

      ctx.globalAlpha = alpha;
      const holdMs = rn.endMs - rn.startMs;
      const threshEl = document.getElementById('holdThresholdMs');
      const threshMs = threshEl ? Math.max(MIN_HOLD_DUR * 1000, parseFloat(threshEl.value) || 0) : MIN_HOLD_DUR * 1000;
      if (holdMs >= threshMs) {
        const bodyH = Math.max(0, tailY - headY);
        if (bodyH > 4) {
          ctx.fillStyle = withAlpha(col, '44');
          ctx.fillRect(lx + LW * 0.2, headY, LW * 0.6, bodyH);
          // Tail cap
          ctx.fillStyle = withAlpha(col, '88');
          ctx.beginPath(); ctx.roundRect(lx + LW * 0.2 - 2, tailY - 4, LW * 0.6 + 4, 8, 4); ctx.fill();
        }
      }
      // Head cap
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(lx + 4, headY - NH, LW - 8, NH, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.roundRect(lx + 4, headY - NH, LW - 8, 4, [4, 4, 0, 0]); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// ── Auto Generate ──────────────────────────────────────────────────────────────
const btnAutoGen      = document.getElementById('btnAutoGen');
const autoGenDiff     = document.getElementById('autoGenDifficulty');
const agNoteGap       = document.getElementById('agNoteGap');
const agNoteGapVal    = document.getElementById('agNoteGapVal');
const agMaxDensity    = document.getElementById('agMaxDensity');
const agMaxDensityVal = document.getElementById('agMaxDensityVal');
const agClarity       = document.getElementById('agClarity');
const agClarityVal    = document.getElementById('agClarityVal');
const agVolume        = document.getElementById('agVolume');
const agVolumeVal     = document.getElementById('agVolumeVal');
const agHoldMin       = document.getElementById('agHoldMin');
const agHoldMinVal    = document.getElementById('agHoldMinVal');
const agMerging       = document.getElementById('agMerging');
const agFreqLow       = document.getElementById('agFreqLow');
const agFreqHigh      = document.getElementById('agFreqHigh');
const agBpmSnap       = document.getElementById('agBpmSnap');
const agBpmDiv        = document.getElementById('agBpmDiv');
const agChordRate     = document.getElementById('agChordRate');
const agChordRateVal  = document.getElementById('agChordRateVal');
const agPeakThresh    = document.getElementById('agPeakThresh');
const agPeakThreshVal = document.getElementById('agPeakThreshVal');
const agHeldChords    = document.getElementById('agHeldChords');
const agOverlapNotes  = document.getElementById('agOverlapNotes');
const agOverlapDelay  = document.getElementById('agOverlapDelay');
const agOverlapDelayVal = document.getElementById('agOverlapDelayVal');

// Difficulty presets: control Note Gap and Max Density sliders
const AG_DIFFICULTY = {
  easy:   { noteGap: 400, maxDensity: 2.0, chordRate: 0.0  },
  normal: { noteGap: 250, maxDensity: 4.0, chordRate: 0.15 },
  hard:   { noteGap: 150, maxDensity: 6.0, chordRate: 0.4  },
  expert: { noteGap:  80, maxDensity: 8.0, chordRate: 0.7  },
};

function _syncAgDifficulty(diff) {
  const preset   = AG_DIFFICULTY[diff];
  const isCustom = !preset;
  agNoteGap.disabled    = !isCustom;
  agMaxDensity.disabled = !isCustom;
  if (preset) {
    agNoteGap.value = preset.noteGap;
    agNoteGapVal.textContent = preset.noteGap + 'ms';
    agMaxDensity.value = preset.maxDensity;
    agMaxDensityVal.textContent = preset.maxDensity.toFixed(1) + ' /s';
    agChordRate.value = preset.chordRate;
    agChordRateVal.textContent = preset.chordRate.toFixed(2);
  }
}
_syncAgDifficulty('normal');

autoGenDiff.addEventListener('change', () => _syncAgDifficulty(autoGenDiff.value));

agNoteGap.addEventListener('input', () => {
  agNoteGapVal.textContent = agNoteGap.value + 'ms';
  if (autoGenDiff.value !== 'custom') { autoGenDiff.value = 'custom'; _syncAgDifficulty('custom'); }
});
agMaxDensity.addEventListener('input', () => {
  agMaxDensityVal.textContent = parseFloat(agMaxDensity.value).toFixed(1) + ' /s';
  if (autoGenDiff.value !== 'custom') { autoGenDiff.value = 'custom'; _syncAgDifficulty('custom'); }
});
agClarity.addEventListener('input', () => {
  agClarityVal.textContent = parseFloat(agClarity.value).toFixed(2);
});
agVolume.addEventListener('input', () => {
  agVolumeVal.textContent = parseFloat(agVolume.value).toFixed(3);
});
agHoldMin.addEventListener('input', () => {
  agHoldMinVal.textContent = agHoldMin.value + 'ms';
});
agChordRate.addEventListener('input', () => {
  agChordRateVal.textContent = parseFloat(agChordRate.value).toFixed(2);
  if (autoGenDiff.value !== 'custom') { autoGenDiff.value = 'custom'; _syncAgDifficulty('custom'); }
});
agPeakThresh.addEventListener('input', () => {
  agPeakThreshVal.textContent = parseFloat(agPeakThresh.value).toFixed(1) + '×';
});
agOverlapDelay.addEventListener('input', () => {
  agOverlapDelayVal.textContent = agOverlapDelay.value + 'ms';
});

// ── Autocorrelation pitch detection (from live overlay) ─────────────────────
let _acBuf = null;
function detectPitch(data, sampleRate) {
  const n = data.length;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += data[i] * data[i];
  const rms = Math.sqrt(energy / n);

  const maxLag = Math.min(n - 2, Math.ceil(sampleRate / 60));
  const minLag = Math.max(2, Math.floor(sampleRate / 2000));
  let norm = 2 * energy;
  if (norm < 1e-10) return { frequency: 0, clarity: 0, rms };

  if (!_acBuf || _acBuf.length < maxLag + 1) _acBuf = new Float32Array(maxLag + 1);
  const ac = _acBuf;
  for (let lag = 0; lag <= maxLag; lag++) {
    if (lag > 0) norm -= data[lag - 1] * data[lag - 1] + data[n - lag] * data[n - lag];
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += data[i] * data[i + lag];
    ac[lag] = norm > 1e-10 ? 2 * sum / norm : 0;
  }

  const peaks = [];
  let inPos = false, peakVal = -Infinity, peakIdx = -1;
  for (let i = minLag + 1; i <= maxLag; i++) {
    if (!inPos && ac[i - 1] < 0 && ac[i] >= 0) {
      inPos = true; peakVal = ac[i]; peakIdx = i;
    } else if (inPos) {
      if (ac[i] > peakVal) { peakVal = ac[i]; peakIdx = i; }
      if (ac[i - 1] > 0 && ac[i] <= 0) {
        inPos = false;
        if (peakIdx >= 0) peaks.push(peakIdx);
        peakVal = -Infinity; peakIdx = -1;
      }
    }
  }
  if (inPos && peakIdx >= 0) peaks.push(peakIdx);
  if (!peaks.length) return { frequency: 0, clarity: 0, rms };

  const maxClarity = Math.max(...peaks.map(i => ac[i]));
  const best = peaks.find(i => ac[i] >= 0.9 * maxClarity);
  if (best === undefined) return { frequency: 0, clarity: 0, rms };
  return { frequency: sampleRate / best, clarity: ac[best], rms };
}

// ── Chord injection: add simultaneous notes at energy peaks ─────────────────
function _injectChords(notes, mono, sampleRate, laneCount, chordRate, peakThreshold, noteGapSec, heldChords) {
  if (chordRate <= 0 || notes.length === 0) return notes;

  // Compute local energy envelope (~100ms windows)
  const windowSize = Math.round(sampleRate * 0.1);
  const hopSize = Math.round(windowSize / 2);
  const envelope = [];
  for (let i = 0; i + windowSize <= mono.length; i += hopSize) {
    let energy = 0;
    for (let j = i; j < i + windowSize; j++) energy += mono[j] * mono[j];
    envelope.push({ time: (i + windowSize / 2) / sampleRate, energy: Math.sqrt(energy / windowSize) });
  }

  if (envelope.length < 3) return notes;

  // Find ALL local energy maxima as chord candidates
  const localWindow = 20; // ~1 second of context at 50ms hop
  const peaks = [];
  for (let i = 1; i < envelope.length - 1; i++) {
    if (envelope[i].energy <= envelope[i - 1].energy || envelope[i].energy <= envelope[i + 1].energy) continue;

    const start = Math.max(0, i - localWindow);
    const end = Math.min(envelope.length, i + localWindow + 1);
    let sum = 0;
    for (let j = start; j < end; j++) sum += envelope[j].energy;
    const localMean = sum / (end - start);

    peaks.push({ time: envelope[i].time, intensity: envelope[i].energy / localMean });
  }

  // chordRate selects what fraction of peaks become chords (sorted by intensity)
  peaks.sort((a, b) => b.intensity - a.intensity);
  const numChords = Math.max(1, Math.round(peaks.length * chordRate));
  const selectedPeaks = peaks.slice(0, numChords);

  // Build a set of occupied (time, lane) pairs
  const occupied = new Set();
  for (const n of notes) occupied.add(`${n.time}_${n.lane}`);

  // For each selected peak, find the nearest existing note and add extra notes
  const newNotes = [];
  for (const peak of selectedPeaks) {
    let closest = null, closestDist = Infinity;
    for (const n of notes) {
      const dist = Math.abs(n.time - peak.time);
      if (dist < closestDist) { closestDist = dist; closest = n; }
    }
    if (!closest || closestDist > 0.15) continue; // must be within 150ms

    // Determine how many extra notes based on intensity
    const maxExtra = laneCount - 1;
    let extraCount;
    if (peak.intensity > peakThreshold * 1.5) {
      extraCount = Math.min(maxExtra, 3);
    } else if (peak.intensity > peakThreshold * 1.2) {
      extraCount = Math.min(maxExtra, 2);
    } else {
      extraCount = 1;
    }

    // Pick lanes adjacent to the original note's lane, not already occupied
    const usedLanes = new Set();
    for (const n of notes) {
      if (n.time === closest.time) usedLanes.add(n.lane);
    }
    for (const n of newNotes) {
      if (n.time === closest.time) usedLanes.add(n.lane);
    }

    const candidates = [];
    for (let l = 0; l < laneCount; l++) {
      if (usedLanes.has(l)) continue;
      const key = `${closest.time}_${l}`;
      if (occupied.has(key)) continue;
      candidates.push({ lane: l, dist: Math.abs(l - closest.lane) });
    }
    candidates.sort((a, b) => a.dist - b.dist);

    for (let i = 0; i < Math.min(extraCount, candidates.length); i++) {
      const dur = heldChords ? closest.duration : 0;
      const note = { time: closest.time, lane: candidates[i].lane, duration: dur };
      newNotes.push(note);
      occupied.add(`${closest.time}_${candidates[i].lane}`);
    }
  }

  return notes.concat(newNotes).sort((a, b) => a.time - b.time || a.lane - b.lane);
}

// ── Autogen algorithm (pitch-detection, matching live overlay) ──────────────────
function autoGenFromAudio(buffer, laneCount, cfg) {
  const { noteGapMs, fluxMult: clarityMult, minVolume: volumeThreshold, holdMinMs,
          merging: allowMerging, bpmSnap, bpmSnapDiv, bpm, maxDensity,
          chordRate, peakThreshold, heldChords, overlapNotes, overlapDelayMs } = cfg;

  const sampleRate = buffer.sampleRate;

  // Mix down to mono
  const channelCount = buffer.numberOfChannels;
  const totalSamples = buffer.length;
  const mono = new Float32Array(totalSamples);
  for (let c = 0; c < channelCount; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < totalSamples; i++) mono[i] += ch[i];
  }
  if (channelCount > 1) for (let i = 0; i < totalSamples; i++) mono[i] /= channelCount;

  // Frame parameters — match live overlay's ~100ms sample interval
  const FRAME_SIZE = 2048;
  const hopSamples = Math.round(sampleRate * 0.1); // 100ms hops
  const noteGapSec = noteGapMs / 1000;
  const holdMinSec = holdMinMs / 1000;
  const maxNotesPerSec = maxDensity;

  const generatedNotes = [];
  // Per-lane tracking for multi-track note generation
  const activeNotes = new Array(laneCount).fill(null);
  const lastNoteTimePerLane = new Array(laneCount).fill(-Infinity);
  let primaryLane = -1;
  let notesInLastSecond = [];

  for (let frameStart = 0; frameStart + FRAME_SIZE <= totalSamples; frameStart += hopSamples) {
    const timeSec = frameStart / sampleRate;
    const frame = mono.slice(frameStart, frameStart + FRAME_SIZE);

    const { frequency, clarity, rms } = detectPitch(frame, sampleRate);

    // Gate: skip if no clear pitch or too quiet (matches live _sample logic)
    if (clarity < clarityMult || rms < volumeThreshold) {
      continue;
    }

    // Pitch-based lane assignment (same as live overlay)
    const lane = Math.round(((laneCount * Math.log2(frequency / 440) + 69) % laneCount + laneCount)) % laneCount;

    // When pitch shifts, stop extending the old primary lane
    if (primaryLane >= 0 && primaryLane !== lane) {
      if (overlapNotes) {
        activeNotes[primaryLane] = null;
      } else {
        activeNotes.fill(null);
      }
    }
    primaryLane = lane;

    // Extend ALL active holds (primary + chord lanes) while signal is good
    for (let l = 0; l < laneCount; l++) {
      const active = activeNotes[l];
      if (!active) continue;
      if (allowMerging && timeSec - active.time >= holdMinSec) {
        active.endTime = timeSec;
        lastNoteTimePerLane[l] = timeSec;
      }
    }

    // Only allow overlap notes after a hold has sustained long enough
    const overlapDelaySec = (overlapDelayMs || 500) / 1000;
    if (overlapNotes) {
      // Skip spawning on other lanes unless an active hold has sustained past the delay
      const anyLongHold = activeNotes.some((n, l) => n && l !== lane && timeSec - n.time >= overlapDelaySec);
      if (!anyLongHold && activeNotes.some((n, l) => n && l !== lane)) continue;
    } else {
      const hasActiveHold = activeNotes.some((n, l) => n && l !== lane);
      if (hasActiveHold) continue;
    }

    // Skip if this lane already has an active note being extended
    if (activeNotes[lane]) continue;

    // Density limit
    notesInLastSecond = notesInLastSecond.filter(t => timeSec - t < 1);
    if (notesInLastSecond.length >= maxNotesPerSec) continue;

    // Note gap enforcement (per-lane)
    if (timeSec - lastNoteTimePerLane[lane] < noteGapSec) continue;

    // Create note
    const note = { time: timeSec, lane, endTime: timeSec };
    generatedNotes.push(note);
    activeNotes[lane] = note;
    lastNoteTimePerLane[lane] = timeSec;
    notesInLastSecond.push(timeSec);
  }

  // Convert to final format
  let result = generatedNotes.map(n => {
    let dur = n.endTime - n.time;
    if (dur < holdMinSec) dur = 0; // too short -> tap
    return { time: +n.time.toFixed(4), lane: n.lane, duration: +dur.toFixed(4) };
  });

  // Clamp hold notes so they don't overlap the next note in the same lane
  const GAP_BUFFER = 0.05;
  const byLane = {};
  for (const n of result) {
    if (!byLane[n.lane]) byLane[n.lane] = [];
    byLane[n.lane].push(n);
  }
  for (const lane in byLane) {
    const notes = byLane[lane];
    for (let i = 0; i < notes.length - 1; i++) {
      if (notes[i].duration > 0) {
        const holdEnd = notes[i].time + notes[i].duration;
        const nextStart = notes[i + 1].time;
        if (holdEnd > nextStart - GAP_BUFFER) {
          const clamped = nextStart - GAP_BUFFER - notes[i].time;
          notes[i].duration = +(Math.max(0, clamped).toFixed(4));
        }
      }
    }
  }

  // BPM snap
  if (bpmSnap && bpm > 0) {
    for (const n of result) {
      let noteBpm = bpm;
      if (dynamicBpmOnCreate && bpmSectionsCreate.length > 0) {
        const sec = bpmSectionsCreate.find(s => n.time >= s.startTime && n.time < s.endTime);
        if (sec) noteBpm = sec.bpm;
      }
      const beatLen = 60 / noteBpm;
      const subLen = beatLen / bpmSnapDiv;
      n.time = +( Math.round(n.time / subLen) * subLen ).toFixed(4);
      if (n.duration > 0) {
        const end = n.time + n.duration;
        const snappedEnd = Math.round(end / subLen) * subLen;
        n.duration = +Math.max(0.1, snappedEnd - n.time).toFixed(4);
      }
    }
  }

  // Remove duplicates (same time + lane)
  const seen = new Set();
  result = result.filter(n => {
    const key = `${n.time}_${n.lane}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Chord injection pass
  result = _injectChords(result, mono, sampleRate, laneCount, chordRate, peakThreshold, noteGapSec, heldChords !== false);

  return result.sort((a, b) => a.time - b.time);
}

// ── Auto Generate button ───────────────────────────────────────────────────────
btnAutoGen.addEventListener('click', async () => {
  const title = document.getElementById('inputTitle').value.trim();
  if (!title)                   { showToast('Please enter a song title.', 3000, true); return; }
  if (!audioAB || !audioBuffer) { showToast('Please upload an audio file.', 3000, true); return; }

  const laneCount  = parseInt(laneCountEl.value) || 3;
  const bpm        = parseFloat(document.getElementById('metronomeBpm').value) || 0;
  const difficulty = autoGenDiff.value;

  const cfg = {
    noteGapMs:  parseInt(agNoteGap.value),
    fluxMult:   parseFloat(agClarity.value),
    minVolume:  parseFloat(agVolume.value),
    holdMinMs:  parseInt(agHoldMin.value),
    merging:    agMerging.checked,
    maxDensity: parseFloat(agMaxDensity.value),
    freqLow:    Math.max(20,  parseInt(agFreqLow.value)  || 80),
    freqHigh:   Math.max(500, parseInt(agFreqHigh.value) || 4000),
    bpmSnap:    agBpmSnap.checked,
    bpmSnapDiv: parseInt(agBpmDiv.value) || 4,
    bpm,
    chordRate:     parseFloat(agChordRate.value),
    peakThreshold: parseFloat(agPeakThresh.value),
    heldChords:    agHeldChords.checked,
    overlapNotes:  agOverlapNotes.checked,
    overlapDelayMs: parseInt(agOverlapDelay.value),
  };

  btnAutoGen.textContent = '⌛ Generating…';
  btnAutoGen.disabled    = true;
  await new Promise(r => setTimeout(r, 20));

  try {
    const generated = autoGenFromAudio(audioBuffer, laneCount, cfg);
    if (!generated.length) {
      showToast('No notes generated. Try lowering the Volume or Clarity thresholds.', 3000, true);
      return;
    }

    const id   = 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const song = {
      id,
      title,
      artist:    document.getElementById('inputArtist').value.trim(),
      offset:    0,
      laneCount,
      bpm:       bpm > 0 ? bpm : 0,
      bpmSections: dynamicBpmOnCreate ? bpmSectionsCreate : [],
      difficulty: difficulty !== 'custom' ? difficulty : '',
      notes:     generated,
      trimStart: trimStartCreate,
      trimEnd:   trimEndCreate,
      createdAt: Date.now(),
    };

    await saveSong(song);
    await saveAudio(id, audioAB);
    window.location.href = `editor.html?id=${id}`;
  } catch (err) {
    showToast('Generation failed: ' + err.message, 3000, true);
  } finally {
    btnAutoGen.textContent = '🎵 Auto Generate';
    btnAutoGen.disabled    = false;
  }
});
