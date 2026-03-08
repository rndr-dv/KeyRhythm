// ── Hit Detection Contract ──────────────────────────────────────────────────
// Shared between game.js and liveCS.js:
//   PERFECT: ±50ms, GOOD: ±100ms, OK: ±150ms
//   Near-miss zone: ±270ms (beyond OK but consumed to penalize)
//   Hold auto-complete: 120ms before tail
//   Fresh-press consumption: prevents held keys from auto-hitting subsequent notes
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────────
// darkenHex() is now defined in skins.js (loaded before game.js)
let _tc = null;  // theme colors cache (set from getThemeColors())

// ── Hit windows ────────────────────────────────────────────────────────────────
const W_PERFECT  = 0.050;
const W_GOOD     = 0.100;
const W_OK       = 0.150;
const W_NEARMISS = 0.270;   // slightly beyond OK → shows MISS, breaks combo

// ── Scoring constants ─────────────────────────────────────────────────────────
const SCORE_MULT_GOOD = 0.66;
const SCORE_MULT_OK   = 0.33;
const HOLD_HEAD_WEIGHT = 1.05;
const HOLD_TAIL_WEIGHT = 0.45;
const HOLD_TICK_WEIGHT = 0.05;
const HP_MISS_DAMAGE   = 10;
const HOLD_AUTO_COMPLETE_WINDOW = 0.15;

// ── Canvas geometry (fixed) ────────────────────────────────────────────────────
const CANVAS_W = 500;
const CANVAS_H = 700;
const LANE_TOP = 72;
const HIT_Y    = 558;
let   NOTE_H   = 28;
const KEYS_Y   = 572;
const KEYS_H   = 88;

let MILESTONES = new Set([50, 100, 200, 300, 500]);

// ── Dynamic lane geometry (computed after song load) ───────────────────────────
// Lane colors: ALL_LANE_COLORS is defined in skins.js (loaded before game.js)

// Cached gradients (rebuilt in setupLaneLayout)
let _bgGrad       = null;
let _bgHasAlpha   = false; // true when bgColor has alpha < 1
let _bgMedia      = null;  // custom background Image or Video element (from skin)
let _bgMediaObjUrl = null; // object URL for cleanup
let _laneBgGrad   = [];
let _progressGrad = null;
let LANE_COUNT  = 3;
let LANE_W      = 140;
let LANE_X      = [20, 180, 340];
let LANE_COLORS = ['#c060ff', '#40c4ff', '#60ff90'];
let LANE_RESOLVED = [];  // per-lane resolved colors/opacity from resolveSkinLane()
let LANE_KEYS   = ['[', ']', '\\'];
let KEY_LANE    = { '[': 0, ']': 1, '\\': 2 };

// ── Settings-derived (read at boot) ──────────────────────────────────────────
let APPROACH       = 1.5;
let PRACTICE_SPEED = 1.0;
let OFFSET_SEC     = 0;
let PRACTICE_MODE  = false;
let STRICT_RELEASE = false;
let TICK_INTERVAL  = 0.15;
let hitsoundBuffer      = null;
let laneHitsoundBuffers = [];
let sliderTickBuffer    = null;
let sliderEndBuffer     = null;
let laneSliderEndBuffers = [];
let laneSliderEndEnabled = [];
let hitsoundCache  = {};   // { type: AudioBuffer } — built lazily for per-note sounds
let hitsoundVolume = 0.5;
let hitsoundAutoPitch = false;
let hitsoundPitchRange = 0.2;
let masterVolume   = 1.0;
let musicVolume    = 1.0;
let musicGainNode  = null;
let silentMode     = false;
let currentSkin    = { ...DEFAULT_SKIN };
let noteIconImg    = null;

function skinFont(sz, bold) {
  return (bold ? 'bold ' : '') + sz + 'px ' + (currentSkin.fontFamily || 'monospace');
}

// HP scaling (set from song.difficulty after load)
let HP_REGEN_MULT = 1.0;
let HP_DMG_MULT   = 1.0;

// Key display uses shared displayKeyName() from settings.js

// ── DOM ───────────────────────────────────────────────────────────────────────
const canvas           = document.getElementById('gameCanvas');
const gctx             = canvas.getContext('2d');
const loadScreen       = document.getElementById('loadScreen');
const loadMsg          = document.getElementById('loadMsg');
const overlayCountdown = document.getElementById('overlayCountdown');
const overlayPause     = document.getElementById('overlayPause');
const overlayResult    = document.getElementById('overlayResult');
const countdownNum     = document.getElementById('countdownNum');
const songNameDisplay  = document.getElementById('songNameDisplay');
const practiceLabel    = document.getElementById('practiceLabel');
const btnResume        = document.getElementById('btnResume');
const btnRetryPause    = document.getElementById('btnRetryPause');
const btnMenuPause     = document.getElementById('btnMenuPause');
const btnRetry         = document.getElementById('btnRetry');
const btnLoadAudio2    = document.getElementById('btnLoadAudio2');
const btnPlaySilent    = document.getElementById('btnPlaySilent');
const audioFileGame    = document.getElementById('audioFileGame');
const newBestMsg       = document.getElementById('newBestMsg');
const rFullCombo       = document.getElementById('rFullCombo');

canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

// ── State ─────────────────────────────────────────────────────────────────────
let song = null, notes = [];
let audioCtx = null, audioBuffer = null, audioSrc = null;
let gameTime = 0, gameStart = 0;
let playing = false, ended = false, paused = false;
let resuming = false;
let pauseOffset = 0;
let _countdownInterval = null;  // tracked so we can cancel on retry/pause


let songEndTime = 0;

let score = 0, combo = 0, maxCombo = 0, health = 100;
let judgments = { perfect: 0, good: 0, ok: 0, miss: 0 };
let noteStates  = [];
let noteHitTime = [];   // gameTime when note was last hit (state 3 entry or tap hit)
let holdTickTime = [];  // gameTime of last hold tick per note
let holdTickCount = []; // number of ticks awarded per hold note
let hasFullCombo = true;
let baseNoteVal  = 0;
let pressedLanes = new Set();
let firstPendingIdx = 0;
let laneNextPending = [];

// Visual effects
let hitFlashes  = [];
let missFlashes = [];
let judgePops    = [];
let hitRings     = [];
let milestonePop = null;

const _params      = new URLSearchParams(location.search);
const songId       = _params.get('id');
const _startOffset = parseFloat(_params.get('t') || '0');
const _fromEditor  = _params.get('from') === 'editor';
const playlistId   = _params.get('playlistId');
const playlistIdx  = parseInt(_params.get('playlistIdx') || '0');
let   playlist     = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  const cfg = getSettings();

  APPROACH       = 1.5 / Math.max(0.1, Math.min(5.0, cfg.scrollSpeed ?? 1.0));
  PRACTICE_MODE  = cfg.practiceMode ?? false;
  STRICT_RELEASE = cfg.strictRelease ?? false;
  PRACTICE_SPEED = PRACTICE_MODE ? (cfg.practiceSpeed ?? 1.0) : 1.0;
  OFFSET_SEC     = -(cfg.audioOffset ?? 0) / 1000;
  hitsoundVolume = cfg.hitsoundVolume !== undefined ? cfg.hitsoundVolume : 0.5;
  hitsoundAutoPitch = !!cfg.hitsoundAutoPitch;
  hitsoundPitchRange = cfg.hitsoundPitchRange ?? 0.2;
  masterVolume   = cfg.masterVolume    !== undefined ? cfg.masterVolume : 1.0;
  musicVolume    = cfg.musicVolume     !== undefined ? cfg.musicVolume  : 1.0;

  // Resolve song from id or playlist
  let resolvedId = songId;
  if (!resolvedId && playlistId) {
    playlist   = await getPlaylist(playlistId);
    resolvedId = playlist ? playlist.songIds[playlistIdx] : null;
  }
  if (!resolvedId) { loadMsg.textContent = 'No song id in URL'; return; }
  song = await getSong(resolvedId);
  if (!song) { loadMsg.textContent = 'Song not found'; return; }

  LANE_COUNT = song.laneCount || 3;
  TICK_INTERVAL = song.bpm ? Math.max(0.2, 60 / song.bpm) : 0.25;

  // HP scaling by difficulty
  const _diff = song.difficulty || '';
  HP_REGEN_MULT = { easy: 1.5, normal: 1.0, hard: 0.6, expert: 0.3 }[_diff] ?? 1.0;
  HP_DMG_MULT   = { easy: 0.7, normal: 1.0, hard: 1.3, expert: 1.6 }[_diff] ?? 1.0;

  setupLaneLayout(cfg);

  notes       = song.notes.slice().sort((a, b) => a.time - b.time);
  noteStates    = notes.map(() => 0);
  noteHitTime   = notes.map(() => -1);
  holdTickTime  = notes.map(() => -1);
  holdTickCount = notes.map(() => 0);
  songEndTime  = notes.reduce((mx, n) => Math.max(mx, n.time + (n.duration || 0)), 0);
  songNameDisplay.textContent = song.title + (song.artist ? ' — ' + song.artist : '');

  const badges = [];
  if (PRACTICE_SPEED !== 1.0) badges.push(`PRACTICE ${PRACTICE_SPEED}×`);
  if (PRACTICE_MODE)          badges.push('NO DEATH');
  practiceLabel.textContent = badges.join('  ');

  loadMsg.textContent = 'Loading audio…';
  const ab = await getAudio(song.id);
  if (ab) {
    await decodeAudio(ab);
    await setupHitsound();
    startCountdown();
  } else {
    loadMsg.textContent = 'No audio stored.';
    btnLoadAudio2.style.display = 'inline-flex';
    btnPlaySilent.style.display = 'inline-flex';
  }
})();

// ── Lane layout ───────────────────────────────────────────────────────────────
function setupLaneLayout(cfg) {
  // Compute lane geometry based on LANE_COUNT
  const MARGIN      = 10;
  const GAP         = 8;
  const totalUsable = CANVAS_W - 2 * MARGIN - (LANE_COUNT - 1) * GAP;
  LANE_W      = Math.max(60, Math.floor(totalUsable / LANE_COUNT));
  LANE_X      = Array.from({ length: LANE_COUNT }, (_, i) => MARGIN + i * (LANE_W + GAP));
  LANE_COLORS = ALL_LANE_COLORS.slice(0, LANE_COUNT);

  // Apply skin colors if present
  const skin = getSkin();
  currentSkin = applySkin(skin);
  MILESTONES = new Set((currentSkin.milestones || []).map(m => m.combo));
  _tc = getThemeColors();
  // Load custom background media (image or video)
  if (_bgMediaObjUrl) { URL.revokeObjectURL(_bgMediaObjUrl); _bgMediaObjUrl = null; }
  if (_bgMedia && _bgMedia.parentNode) _bgMedia.remove();
  _bgMedia = null;
  if (currentSkin.bgMediaSource === 'idb') {
    getBg('skin_bg').then(entry => {
      if (!entry || !entry.data) return;
      _bgMediaObjUrl = URL.createObjectURL(entry.data);
      if (entry.type === 'video') {
        _bgMedia = document.createElement('video');
        _bgMedia.autoplay = true;
        _bgMedia.loop = true;
        _bgMedia.muted = true;
        _bgMedia.playsInline = true;
        _bgMedia.src = _bgMediaObjUrl;
        _bgMedia.play().catch(() => {});
      } else {
        _bgMedia = new Image();
        _bgMedia.src = _bgMediaObjUrl;
      }
    });
  } else if (currentSkin.bgMediaSource === 'url' && currentSkin.bgMediaUrl) {
    const isVideo = currentSkin.bgMediaType === 'video';
    if (isVideo) {
      _bgMedia = document.createElement('video');
      _bgMedia.autoplay = true;
      _bgMedia.loop = true;
      _bgMedia.muted = true;
      _bgMedia.playsInline = true;
      _bgMedia.src = currentSkin.bgMediaUrl;
      _bgMedia.play().catch(() => {});
    } else {
      _bgMedia = new Image();
      _bgMedia.src = currentSkin.bgMediaUrl;
    }
  } else if (currentSkin.bgImage) {
    _bgMedia = new Image();
    _bgMedia.src = currentSkin.bgImage;
  }
  NOTE_H = Math.round(28 * (currentSkin.noteHeight || 1.0));
  if (currentSkin.laneColors) {
    LANE_COLORS = Array.from({ length: LANE_COUNT },
      (_, i) => currentSkin.laneColors[i] || ALL_LANE_COLORS[i] || '#ffffff');
  }

  // Build per-lane resolved colors/opacity
  LANE_RESOLVED = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    LANE_RESOLVED[i] = resolveSkinLane(currentSkin, i);
  }

  // Build KEY_LANE from per-lane-count keybind profile (falls back to global keybinds)
  const kb  = getKeybindsForLanes(LANE_COUNT);
  KEY_LANE  = {};
  LANE_KEYS = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const k = kb[i] || '';
    LANE_KEYS[i] = k;
    if (k) KEY_LANE[k] = i;
  }

  hitFlashes  = Array(LANE_COUNT).fill(null);
  missFlashes = Array(LANE_COUNT).fill(null);

  // Cache static gradients (avoids per-frame allocation)
  const _rawBg = currentSkin.bgColor || '#0e0e1c';
  const _skinBg = (typeof isGradient === 'function' && isGradient(_rawBg))
    ? resolveColor(_rawBg, '#0e0e1c') : _rawBg;
  _bgHasAlpha = /^rgba\(/.test(_skinBg);
  _bgGrad = gctx.createLinearGradient(0, 0, 0, CANVAS_H);
  _bgGrad.addColorStop(0, _skinBg);
  _bgGrad.addColorStop(1, darkenHex(_skinBg, 0.4));

  const pc = currentSkin.progressColors || ['#c060ff', '#40c4ff', '#60ff90'];
  _progressGrad = gctx.createLinearGradient(0, 0, CANVAS_W, 0);
  _progressGrad.addColorStop(0,   pc[0]);
  _progressGrad.addColorStop(0.5, pc[1]);
  _progressGrad.addColorStop(1,   pc[2]);

  _laneBgGrad = [];
  for (let l = 0; l < LANE_COUNT; l++) {
    const g = gctx.createLinearGradient(0, LANE_TOP, 0, HIT_Y);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, withAlpha(LANE_COLORS[l], '18'));
    _laneBgGrad[l] = g;
  }

  // Preload custom note icon
  noteIconImg = null;
  if (currentSkin.noteIcon) {
    noteIconImg = new Image();
    noteIconImg.src = currentSkin.noteIcon;
  }
}

// ── Hitsound ──────────────────────────────────────────────────────────────────
async function setupHitsound() {
  if (!audioCtx) { hitsoundBuffer = null; laneHitsoundBuffers = []; laneSliderEndBuffers = []; laneSliderEndEnabled = []; hitsoundCache = {}; return; }
  hitsoundCache = {};
  const cfg  = getSettings();
  const skin = currentSkin || {};

  // Priority: settings > skin > 'tick'
  const globalType = cfg.hitsound || skin.hitsound || 'tick';
  if (globalType === 'custom') {
    hitsoundBuffer = await buildCustomHitsoundBuffer(audioCtx);
  } else {
    hitsoundBuffer = buildHitsoundBuffer(audioCtx, globalType);
  }
  hitsoundCache[globalType] = hitsoundBuffer;

  // Per-lane buffers: settings > skin > global
  laneHitsoundBuffers = [];
  const laneHs     = cfg.laneHitsounds  || {};
  const skinLaneHs = skin.laneHitsounds || {};
  for (let i = 0; i < LANE_COUNT; i++) {
    const type = laneHs[i] || skinLaneHs[i] || globalType;
    if (type.startsWith('custom:')) {
      if (!hitsoundCache[type]) {
        hitsoundCache[type] = await buildCustomHitsoundByName(audioCtx, type.slice(7));
      }
      laneHitsoundBuffers[i] = hitsoundCache[type];
    } else {
      laneHitsoundBuffers[i] = hitsoundCache[type] || (hitsoundCache[type] = buildHitsoundBuffer(audioCtx, type));
    }
  }

  // Slider tick / end: settings > skin > global
  const tickType = cfg.sliderTickSound || skin.sliderTickSound || globalType;
  const endType  = cfg.sliderEndSound  || skin.sliderEndSound  || globalType;
  sliderTickBuffer = hitsoundCache[tickType] || (hitsoundCache[tickType] = buildHitsoundBuffer(audioCtx, tickType));
  sliderEndBuffer  = hitsoundCache[endType]  || (hitsoundCache[endType]  = buildHitsoundBuffer(audioCtx, endType));

  // Per-lane slider-end buffers (default: lane hitsound)
  laneSliderEndBuffers = [];
  laneSliderEndEnabled = [];
  const laneSeHs = cfg.laneSliderEndSounds || {};
  const globalEndNone = (cfg.sliderEndSound || skin.sliderEndSound || '') === 'none';
  for (let i = 0; i < LANE_COUNT; i++) {
    const type = laneSeHs[i];
    if (!type) {
      // Default to lane hitsound; respect global 'none' and lane 'none'
      const enabled = !globalEndNone && !!laneHitsoundBuffers[i];
      laneSliderEndEnabled[i] = enabled;
      laneSliderEndBuffers[i] = enabled ? laneHitsoundBuffers[i] : null;
      continue;
    }
    if (type === 'none') {
      laneSliderEndEnabled[i] = false;
      laneSliderEndBuffers[i] = null;
      continue;
    }
    laneSliderEndEnabled[i] = true;
    if (type.startsWith('custom:')) {
      if (!hitsoundCache[type]) {
        hitsoundCache[type] = await buildCustomHitsoundByName(audioCtx, type.slice(7));
      }
      laneSliderEndBuffers[i] = hitsoundCache[type];
    } else {
      laneSliderEndBuffers[i] = hitsoundCache[type] || (hitsoundCache[type] = buildHitsoundBuffer(audioCtx, type));
    }
  }
}

function _playBuffer(buf, rate) {
  if (!buf || !audioCtx || hitsoundVolume <= 0 || masterVolume <= 0) return;
  try {
    const src  = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    src.buffer      = buf;
    if (rate !== undefined) src.playbackRate.value = rate;
    gain.gain.value = Math.min(2, masterVolume * hitsoundVolume * 2);
    src.connect(gain);
    gain.connect(audioCtx.destination);
    src.start(0);
  } catch (_) {}
}

function _autoPitchRate(lane) {
  if (!hitsoundAutoPitch || LANE_COUNT <= 1) return undefined;
  const r = hitsoundPitchRange;
  return (1 - r) + (2 * r * lane / (LANE_COUNT - 1));
}

function playHitsound(lane, note) {
  const rate = _autoPitchRate(lane);
  // Per-note hitsound override
  if (note && note.hitsound) {
    if (!hitsoundCache[note.hitsound]) {
      hitsoundCache[note.hitsound] = buildHitsoundBuffer(audioCtx, note.hitsound);
    }
    _playBuffer(hitsoundCache[note.hitsound], rate);
    return;
  }
  const buf = (lane !== undefined && laneHitsoundBuffers[lane])
    ? laneHitsoundBuffers[lane]
    : hitsoundBuffer;
  _playBuffer(buf, rate);
}

function playSliderEnd(lane) {
  if (laneSliderEndEnabled[lane] === false) return;
  const buf = laneSliderEndBuffers[lane] || sliderEndBuffer || hitsoundBuffer;
  _playBuffer(buf, _autoPitchRate(lane));
}

// ── Audio load ────────────────────────────────────────────────────────────────
btnLoadAudio2.addEventListener('click', () => audioFileGame.click());
audioFileGame.addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  loadMsg.textContent = 'Decoding…';
  const ab  = await f.arrayBuffer();
  const sid = song ? song.id : songId;
  await saveAudio(sid, ab);
  await decodeAudio(ab);
  silentMode = false;
  await setupHitsound();
  audioFileGame.value = '';
  startCountdown();
});

btnPlaySilent.addEventListener('click', async () => {
  silentMode = true;
  btnPlaySilent.style.display  = 'none';
  btnLoadAudio2.style.display  = 'none';
  audioCtx = new AudioContext();
  await setupHitsound();
  startCountdown();
});

btnResume.addEventListener('click',    resumeGame);
btnRetryPause.addEventListener('click', () => { overlayPause.classList.add('hidden'); retryGame(); });
btnMenuPause.addEventListener('click',  () => { window.location.href = 'index.html'; });
const btnEditPause = document.getElementById('btnEditPause');
if (_fromEditor) btnEditPause.style.display = '';
btnEditPause.addEventListener('click', () => {
  if (_fromEditor) { window.close(); return; }
  window.location.href = `editor.html?id=${song ? song.id : songId}`;
});
btnRetry.addEventListener('click',     retryGame);
document.getElementById('btnEdit').addEventListener('click', () => {
  if (_fromEditor) { window.close(); return; }
  window.location.href = `editor.html?id=${song ? song.id : songId}`;
});
document.getElementById('btnMenu').addEventListener('click',
  () => { window.location.href = 'index.html'; });

async function decodeAudio(ab) {
  if (audioCtx) await audioCtx.close();
  audioCtx = new AudioContext();
  try {
    audioBuffer = await audioCtx.decodeAudioData(ab.slice(0));
  } catch (err) {
    loadMsg.textContent = 'Audio decode failed: ' + err.message;
    btnLoadAudio2.style.display = 'inline-flex';
    btnPlaySilent.style.display = 'inline-flex';
    throw err;
  }
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function startCountdown() {
  // Cancel any previous countdown to prevent double-start
  if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
  loadScreen.style.display = 'none';
  canvas.style.display     = 'block';
  overlayCountdown.classList.remove('hidden');
  resetState();
  draw(0);

  let n = _fromEditor ? 1 : 3;
  countdownNum.textContent = n;
  _countdownInterval = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(_countdownInterval);
      _countdownInterval = null;
      overlayCountdown.classList.add('hidden');
      startGame();
    } else {
      countdownNum.textContent = n;
    }
  }, 1000);
}

function resetState() {
  playing  = false;
  ended    = false;
  resuming = false;
  gameTime = 0;
  score = 0; combo = 0; maxCombo = 0; health = 100;
  judgments    = { perfect: 0, good: 0, ok: 0, miss: 0 };

  // Deduplicate: remove notes with same time+lane (keep first)
  const dedup = new Set();
  notes = notes.filter(n => {
    const key = n.time.toFixed(4) + ':' + n.lane;
    if (dedup.has(key)) return false;
    dedup.add(key);
    return true;
  });

  noteStates    = notes.map(() => 0);
  noteHitTime   = notes.map(() => -1);
  holdTickTime  = notes.map(() => -1);
  holdTickCount = notes.map(() => 0);
  hasFullCombo  = true;
  baseNoteVal  = 1_000_000 / calcTotalWeight();
  firstPendingIdx = 0;
  laneNextPending = Array(LANE_COUNT).fill(0);
  pressedLanes.clear();
  hitFlashes   = Array(LANE_COUNT).fill(null);
  missFlashes  = Array(LANE_COUNT).fill(null);
  judgePops    = [];
  hitRings     = [];
  milestonePop = null;
  paused       = false;
}

// ── Weight-based scoring ──────────────────────────────────────────────────────
// Simulates a perfect run to compute the exact weighted total (including combo
// multiplier progression).  This ensures baseNoteVal normalises to 1 000 000.
function calcTotalWeight() {
  let w = 0;
  let combo = 0;
  for (const n of notes) {
    combo++;
    const comboMult = Math.min(1 + combo * 0.003, 1.15);
    if (n.duration > 0) {
      const numTicks = Math.max(0, Math.floor(n.duration / TICK_INTERVAL) - 1);
      // Head uses comboMult; ticks + tail are flat (matches score award code)
      w += HOLD_HEAD_WEIGHT * comboMult + numTicks * HOLD_TICK_WEIGHT + HOLD_TAIL_WEIGHT;
      combo++;  // tail completion also increments combo
    } else {
      w += 1.0 * comboMult;
    }
  }
  return w || 1;
}

// ── Game loop ─────────────────────────────────────────────────────────────────
function startGame() {
  const offset = _fromEditor ? _startOffset : 0;
  if (!silentMode) {
    if (audioSrc) { try { audioSrc.stop(); } catch (_) {} }
    audioSrc = audioCtx.createBufferSource();
    audioSrc.buffer = audioBuffer;
    audioSrc.playbackRate.value = PRACTICE_SPEED;
    musicGainNode = audioCtx.createGain();
    musicGainNode.gain.value = Math.max(0, masterVolume * musicVolume);
    audioSrc.connect(musicGainNode);
    musicGainNode.connect(audioCtx.destination);
    audioSrc.onended = () => { if (playing && !paused && !ended) endGame(true); };
    audioSrc.start(0, offset);
  }
  // gameTime begins at offset so notes before it are already in the past
  gameStart = audioCtx.currentTime - offset / PRACTICE_SPEED;
  // Clear any keys pressed during countdown so they don't ghost into gameplay
  pressedLanes.clear();
  if (offset > 0) {
    // Mark notes fully before offset as skipped; they won't be scored
    for (let i = 0; i < notes.length; i++) {
      if (notes[i].time + (notes[i].duration || 0) < offset - W_OK) noteStates[i] = 1;
    }
    hasFullCombo = false; // partial run can't be a full combo
  }
  playing = true;
  ended   = false;
  requestAnimationFrame(loop);
}

function loop() {
  if (!playing || paused) return;
  gameTime = (audioCtx.currentTime - gameStart) * PRACTICE_SPEED;

  // ── Check missed notes (skip already-resolved prefix) ─────────────────────
  while (firstPendingIdx < notes.length && noteStates[firstPendingIdx] !== 0) firstPendingIdx++;
  for (let i = firstPendingIdx; i < notes.length; i++) {
    if (noteStates[i] !== 0) continue;
    if (notes[i].time - (gameTime + OFFSET_SEC) > W_OK) break; // sorted, rest are in the future
    if (gameTime + OFFSET_SEC > notes[i].time + W_OK) {
      noteStates[i] = 2;
      registerMiss(notes[i].lane);
    }
  }

  // ── Active hold notes ─────────────────────────────────────────────────────
  for (let i = 0; i < notes.length; i++) {
    if (noteStates[i] !== 3) continue;
    const tailTime = notes[i].time + notes[i].duration;

    // For glide notes: player must hold the currently required lane.
    // One lane of tolerance is granted so the player can switch slightly late.
    let holdOk;
    if (notes[i].glide !== undefined) {
      const req = getGlideRequiredLane(notes[i], gameTime + OFFSET_SEC);
      if (pressedLanes.has(req)) {
        holdOk = true;
      } else if (req !== notes[i].lane) {
        // Accept the previous lane for one step (late-switch tolerance)
        const d = notes[i].glide > notes[i].lane ? 1 : -1;
        holdOk = pressedLanes.has(req - d);
      } else {
        holdOk = false;
      }
    } else {
      holdOk = pressedLanes.has(notes[i].lane);
    }

    if (STRICT_RELEASE) {
      // ── Strict release mode ─────────────────────────────────────────────
      // Player must release within judgment windows of tail time.
      if (!holdOk) {
        // Player released — judge timing against tail
        const releaseTime = gameTime + OFFSET_SEC;
        const dist = Math.abs(releaseTime - tailTime);

        if (dist <= W_OK) {
          // Within judgment window — score based on precision
          noteStates[i] = 1;
          hitFlashes[notes[i].lane] = 14;
          playSliderEnd(notes[i].lane);

          const timeDiff = releaseTime - tailTime;
          let earlyLate = null;
          if (currentSkin.showEarlyLate !== false && Math.abs(timeDiff) > 0.02) {
            const isEarly = timeDiff < 0;
            earlyLate = {
              text: isEarly ? (currentSkin.earlyText || 'EARLY') : (currentSkin.lateText || 'LATE'),
              isEarly,
            };
          }

          if (dist <= W_PERFECT) {
            score += baseNoteVal * HOLD_TAIL_WEIGHT;
            combo++;
            maxCombo = Math.max(maxCombo, combo);
            health = Math.min(100, health + 0.75 * HP_REGEN_MULT);
            spawnPop(currentSkin.perfectText || 'PERFECT', currentSkin.perfectColor || '#ffd040', 18, notes[i].lane, earlyLate);
          } else if (dist <= W_GOOD) {
            score += baseNoteVal * HOLD_TAIL_WEIGHT * SCORE_MULT_GOOD;
            combo++;
            maxCombo = Math.max(maxCombo, combo);
            health = Math.min(100, health + 0.5 * HP_REGEN_MULT);
            spawnPop(currentSkin.goodText || 'GOOD', currentSkin.goodColor || '#60ff90', 16, notes[i].lane, earlyLate);
          } else {
            score += baseNoteVal * HOLD_TAIL_WEIGHT * SCORE_MULT_OK;
            combo++;
            maxCombo = Math.max(maxCombo, combo);
            health = Math.min(100, health + 0.15 * HP_REGEN_MULT);
            spawnPop(currentSkin.okText || 'OK', currentSkin.okColor || '#40c4ff', 14, notes[i].lane, earlyLate);
          }
          checkMilestone();
        } else if (noteHitTime[i] < 0 || gameTime - noteHitTime[i] >= 0.1) {
          // Released too early — miss
          noteStates[i] = 2;
          registerMiss(notes[i].lane);
        }
      } else if (gameTime + OFFSET_SEC >= tailTime + W_OK) {
        // Held too long past tail — miss (late release)
        noteStates[i] = 2;
        registerMiss(notes[i].lane);
      } else if (gameTime + OFFSET_SEC >= tailTime) {
        // Past tail but within OK window — keep state 3, wait for release
      }
    } else {
      // ── Default (lenient) release mode ──────────────────────────────────
      if (gameTime + OFFSET_SEC >= tailTime) {
        // Natural hold completion
        noteStates[i] = 1;
        score += baseNoteVal * HOLD_TAIL_WEIGHT;
        combo++;
        maxCombo = Math.max(maxCombo, combo);
        health   = Math.min(100, health + 0.75 * HP_REGEN_MULT);
        hitFlashes[notes[i].lane] = 14;
        playSliderEnd(notes[i].lane);
        spawnPop(currentSkin.holdText || 'HOLD!', currentSkin.holdColor || '#ffd040', 18, notes[i].lane, null);
        checkMilestone();
      } else if (!holdOk) {
        // Released — check if close enough to tail to auto-complete
        const timeToTail = tailTime - (gameTime + OFFSET_SEC);
        if (timeToTail <= HOLD_AUTO_COMPLETE_WINDOW) {
          noteStates[i] = 1;
          score += baseNoteVal * HOLD_TAIL_WEIGHT;
          combo++;
          maxCombo = Math.max(maxCombo, combo);
          health   = Math.min(100, health + 0.75 * HP_REGEN_MULT);
          hitFlashes[notes[i].lane] = 14;
          playSliderEnd(notes[i].lane);
          spawnPop(currentSkin.holdText || 'HOLD!', currentSkin.holdColor || '#ffd040', 18, notes[i].lane, null);
          checkMilestone();
        } else if (noteHitTime[i] < 0 || gameTime - noteHitTime[i] >= 0.1) {
          noteStates[i] = 2;
          hasFullCombo  = false;
          spawnPop(currentSkin.breakText || 'BREAK', currentSkin.breakColor || '#ff4060', 13, notes[i].lane, null);
        }
      }
    }

    // ── Hold ticks (run while note is still actively held) ──────────────────
    if (noteStates[i] === 3) {
      if (holdTickTime[i] < 0) holdTickTime[i] = gameTime;
      const maxTicks = Math.max(0, Math.floor(notes[i].duration / TICK_INTERVAL) - 1);
      if (holdTickCount[i] < maxTicks && gameTime - holdTickTime[i] >= TICK_INTERVAL) {
        holdTickTime[i] = gameTime;
        holdTickCount[i]++;
        score   += baseNoteVal * HOLD_TICK_WEIGHT;
        health   = Math.min(100, health + 0.25 * HP_REGEN_MULT);
        // For glide notes: flash the lane the player must currently be holding
        const tickLane = notes[i].glide !== undefined
          ? getGlideRequiredLane(notes[i], gameTime)
          : notes[i].lane;
        hitFlashes[tickLane] = 8;
        spawnPop('TICK', currentSkin.goodColor || '#60ff90', 12, tickLane, null);
      }
    }
  }

  if (!PRACTICE_MODE && health <= 0 && !ended) { endGame(false); return; }
  if (gameTime > songEndTime + 3)              { endGame(true);  return; }

  // ── Tick effects ──────────────────────────────────────────────────────────
  for (let l = 0; l < LANE_COUNT; l++) {
    if (hitFlashes[l]  !== null && --hitFlashes[l]  <= 0) hitFlashes[l]  = null;
    if (missFlashes[l] !== null && --missFlashes[l] <= 0) missFlashes[l] = null;
  }
  for (let i = judgePops.length - 1; i >= 0; i--) {
    const p = judgePops[i];
    p.timer--;
    p.y -= 0.85;
    if (p.timer <= 0) judgePops.splice(i, 1);
  }
  for (let i = hitRings.length - 1; i >= 0; i--) {
    if (--hitRings[i].timer <= 0) hitRings.splice(i, 1);
  }
  if (milestonePop && --milestonePop.timer <= 0) milestonePop = null;

  draw(gameTime);
  requestAnimationFrame(loop);
}

// ── Pause / Resume ────────────────────────────────────────────────────────────
function pauseGame() {
  if (!playing || ended || paused || resuming) return;
  paused      = true;
  pauseOffset = gameTime;
  if (audioSrc && !silentMode) { try { audioSrc.stop(); } catch (_) {} }
  loadPauseSettings();
  overlayPause.classList.remove('hidden');
}

function resumeGame() {
  if (!paused || resuming) return;
  resuming = true;
  overlayPause.classList.add('hidden');
  overlayCountdown.classList.remove('hidden');

  if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
  let n = 2;
  countdownNum.textContent = n;
  _countdownInterval = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(_countdownInterval);
      _countdownInterval = null;
      overlayCountdown.classList.add('hidden');
      _doResume();
    } else {
      countdownNum.textContent = n;
    }
  }, 1000);
}

function _doResume() {
  resuming = false;
  paused = false;
  // If paused past the end of audio, end the game immediately
  const audioDur = audioBuffer ? audioBuffer.duration * PRACTICE_SPEED : 0;
  if (pauseOffset >= audioDur - 0.05) {
    playing = true;
    endGame(true);
    return;
  }
  const bufferPos = Math.min(pauseOffset, audioBuffer ? audioBuffer.duration - 0.01 : pauseOffset);
  if (!silentMode) {
    audioSrc = audioCtx.createBufferSource();
    audioSrc.buffer = audioBuffer;
    audioSrc.playbackRate.value = PRACTICE_SPEED;
    musicGainNode = audioCtx.createGain();
    musicGainNode.gain.value = Math.max(0, masterVolume * musicVolume);
    audioSrc.connect(musicGainNode);
    musicGainNode.connect(audioCtx.destination);
    audioSrc.start(0, Math.max(0, bufferPos));
    audioSrc.onended = () => { if (playing && !paused && !ended) endGame(true); };
  }
  gameStart = audioCtx.currentTime - pauseOffset / PRACTICE_SPEED;
  requestAnimationFrame(loop);
}

function _refreshPracticeBadge() {
  const badges = [];
  if (PRACTICE_SPEED !== 1.0) badges.push(`PRACTICE ${PRACTICE_SPEED}×`);
  if (PRACTICE_MODE)          badges.push('NO DEATH');
  practiceLabel.textContent = badges.join('  ');
}

// ── Pause settings ────────────────────────────────────────────────────────────
// ── Settings panels (pause + result) ─────────────────────────────────────────
function _wireSettingsPanel(prefix) {
  const el = id => document.getElementById(prefix + id);
  const panel = {
    masterVol: el('MasterVol'), masterVolVal: el('MasterVolVal'),
    musicVol: el('MusicVol'), musicVolVal: el('MusicVolVal'),
    hitsoundVol: el('HitsoundVol'), hitsoundVolVal: el('HitsoundVolVal'),
    audioOffset: el('AudioOffset'), audioOffsetVal: el('AudioOffsetVal'),
    scrollSpeed: el('ScrollSpeed'), scrollSpeedVal: el('ScrollSpeedVal'),
    hitsound: el('Hitsound'),
    practiceSpeed: el('PracticeSpeed'), practiceSpeedVal: el('PracticeSpeedVal'),
    practiceMode: el('PracticeMode'), glide: el('Glide'),
    strictRelease: el('StrictRelease'),
  };

  panel.load = () => {
    const s = getSettings();
    panel.masterVol.value = s.masterVolume ?? 1;
    panel.masterVolVal.textContent = Math.round((s.masterVolume ?? 1) * 100) + '%';
    panel.musicVol.value = s.musicVolume ?? 1;
    panel.musicVolVal.textContent = Math.round((s.musicVolume ?? 1) * 100) + '%';
    panel.hitsoundVol.value = s.hitsoundVolume ?? 0.5;
    panel.hitsoundVolVal.textContent = Math.round((s.hitsoundVolume ?? 0.5) * 100) + '%';
    panel.audioOffset.value = s.audioOffset ?? 0;
    panel.audioOffsetVal.textContent = ((s.audioOffset ?? 0) >= 0 ? '+' : '') + (s.audioOffset ?? 0) + 'ms';
    panel.scrollSpeed.value = s.scrollSpeed ?? 1;
    panel.scrollSpeedVal.textContent = (s.scrollSpeed ?? 1).toFixed(1) + '×';
    panel.hitsound.value = s.hitsound || 'tick';
    panel.practiceSpeed.value = s.practiceSpeed ?? 1;
    panel.practiceSpeedVal.textContent = (s.practiceSpeed ?? 1).toFixed(2) + '×';
    panel.practiceMode.checked = !!s.practiceMode;
    panel.practiceSpeed.disabled = !s.practiceMode;
    panel.glide.checked = s.enableGlide !== false;
    panel.strictRelease.checked = !!s.strictRelease;
  };

  panel.masterVol.addEventListener('input', () => {
    const v = parseFloat(panel.masterVol.value);
    panel.masterVolVal.textContent = Math.round(v * 100) + '%';
    masterVolume = v;
    if (musicGainNode) musicGainNode.gain.value = Math.max(0, masterVolume * musicVolume);
    saveSettings({ masterVolume: v });
  });
  panel.musicVol.addEventListener('input', () => {
    const v = parseFloat(panel.musicVol.value);
    panel.musicVolVal.textContent = Math.round(v * 100) + '%';
    musicVolume = v;
    if (musicGainNode) musicGainNode.gain.value = Math.max(0, masterVolume * musicVolume);
    saveSettings({ musicVolume: v });
  });
  panel.hitsoundVol.addEventListener('input', () => {
    const v = parseFloat(panel.hitsoundVol.value);
    panel.hitsoundVolVal.textContent = Math.round(v * 100) + '%';
    hitsoundVolume = v;
    saveSettings({ hitsoundVolume: v });
  });
  panel.audioOffset.addEventListener('input', () => {
    const v = parseInt(panel.audioOffset.value);
    panel.audioOffsetVal.textContent = (v >= 0 ? '+' : '') + v + 'ms';
    OFFSET_SEC = -v / 1000;
    saveSettings({ audioOffset: v });
  });
  panel.scrollSpeed.addEventListener('input', () => {
    const v = parseFloat(panel.scrollSpeed.value);
    panel.scrollSpeedVal.textContent = v.toFixed(1) + '×';
    APPROACH = 1.5 / Math.max(0.1, Math.min(5.0, v));
    saveSettings({ scrollSpeed: v });
  });
  panel.hitsound.addEventListener('change', () => {
    saveSettings({ hitsound: panel.hitsound.value });
    setupHitsound();
  });
  panel.practiceSpeed.addEventListener('input', () => {
    const v = parseFloat(panel.practiceSpeed.value);
    panel.practiceSpeedVal.textContent = v.toFixed(2) + '×';
    PRACTICE_SPEED = v;
    saveSettings({ practiceSpeed: v });
    _refreshPracticeBadge();
  });
  panel.practiceMode.addEventListener('change', () => {
    PRACTICE_MODE = panel.practiceMode.checked;
    saveSettings({ practiceMode: panel.practiceMode.checked });
    if (!panel.practiceMode.checked && PRACTICE_SPEED !== 1.0) {
      PRACTICE_SPEED = 1.0;
      panel.practiceSpeed.value = 1.0;
      panel.practiceSpeedVal.textContent = '1.00×';
      saveSettings({ practiceSpeed: 1.0 });
    }
    panel.practiceSpeed.disabled = !panel.practiceMode.checked;
    _refreshPracticeBadge();
  });
  panel.glide.addEventListener('change', () => {
    saveSettings({ enableGlide: panel.glide.checked });
  });
  panel.strictRelease.addEventListener('change', () => {
    STRICT_RELEASE = panel.strictRelease.checked;
    saveSettings({ strictRelease: panel.strictRelease.checked });
  });

  return panel;
}

const pausePanel  = _wireSettingsPanel('p');
const resultPanel = _wireSettingsPanel('r');

function loadPauseSettings() {
  pausePanel.load();
  resultPanel.load();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function draw(t) {
  if (_bgHasAlpha) gctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  gctx.fillStyle = _bgGrad;
  gctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Custom background media (image or video)
  if (_bgMedia) {
    const isVid = _bgMedia instanceof HTMLVideoElement;
    const ready = isVid ? _bgMedia.readyState >= 2 : (_bgMedia.complete && _bgMedia.naturalWidth);
    if (ready) {
      const bgA   = currentSkin.bgImageOpacity ?? 0.3;
      const bgSat = currentSkin.bgImageSaturation ?? 100;
      const bgBlr = currentSkin.bgImageBlur ?? 0;
      gctx.save();
      gctx.globalAlpha = bgA;
      if (bgSat !== 100 || bgBlr > 0) {
        const parts = [];
        if (bgSat !== 100) parts.push(`saturate(${bgSat}%)`);
        if (bgBlr > 0)     parts.push(`blur(${bgBlr}px)`);
        gctx.filter = parts.join(' ');
      }
      const iw = isVid ? _bgMedia.videoWidth : _bgMedia.naturalWidth;
      const ih = isVid ? _bgMedia.videoHeight : _bgMedia.naturalHeight;
      const scale = Math.max(CANVAS_W / iw, CANVAS_H / ih);
      const sw = iw * scale, sh = ih * scale;
      gctx.drawImage(_bgMedia, (CANVAS_W - sw) / 2, (CANVAS_H - sh) / 2, sw, sh);
      gctx.restore();
    }
  }

  const vt = t + OFFSET_SEC;  // offset-adjusted time for visual note rendering
  drawProgress(t);
  drawHUD();
  drawLaneBackgrounds();
  drawHitZone();
  drawNotes(vt);
  drawHitEffects();
  drawKeyIndicators();
  drawJudgmentPops();
  drawMilestonePop();
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function drawProgress(t) {
  const dur = (audioBuffer && !silentMode) ? audioBuffer.duration : (songEndTime + 3);
  const pct = Math.min(1, Math.max(0, t / dur));

  const pbH = currentSkin.progressBarHeight ?? 3;
  gctx.fillStyle = _tc.bg3;
  gctx.fillRect(0, 0, CANVAS_W, pbH);

  gctx.fillStyle = _progressGrad;
  gctx.fillRect(0, 0, CANVAS_W * pct, pbH);
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD() {
  const barX = 14, barY = 12, barW = currentSkin.hpBarWidth ?? 115, barH = currentSkin.hpBarHeight ?? 10;

  gctx.fillStyle    = currentSkin.songInfoColor || '#505070';
  gctx.font         = skinFont(9, false);
  gctx.textAlign    = 'left';
  gctx.textBaseline = 'alphabetic';
  gctx.fillText('HP', barX, barY - 2);

  gctx.fillStyle = currentSkin.hpBgColor || '#14142a';
  gctx.fillRect(barX, barY, barW, barH);

  const hpPct = health / 100;
  const hpCol = health > 50 ? (currentSkin.hpHighColor || '#60ff90') : health > 25 ? (currentSkin.hpMidColor || '#ffd040') : (currentSkin.hpLowColor || '#ff4060');
  if (health <= 25) { gctx.shadowBlur = 10; gctx.shadowColor = currentSkin.hpLowColor || '#ff4060'; }
  gctx.fillStyle = hpCol;
  gctx.fillRect(barX, barY, barW * hpPct, barH);
  gctx.shadowBlur = 0;

  gctx.strokeStyle = currentSkin.hpBorderColor || '#303055';
  gctx.lineWidth   = 1;
  gctx.strokeRect(barX + 0.5, barY + 0.5, barW, barH);

  // Score
  const scoreFontSz = score >= 1_000_000 ? 26 : 32;
  gctx.fillStyle    = currentSkin.scoreColor || '#ffffff';
  gctx.font         = skinFont(scoreFontSz, true);
  gctx.textAlign    = 'center';
  const scoreDigits = score >= 1_000_000 ? 7 : 6;
  gctx.fillText(String(Math.round(score)).padStart(scoreDigits, '0'), CANVAS_W / 2, 40);

  // Combo
  if (combo > 1 && currentSkin.comboEnabled !== false) {
    const size = 15 + Math.min(1, combo / 30) * 7;
    gctx.font         = skinFont(size, true);
    gctx.fillStyle    = currentSkin.comboColor || '#ffd040';
    gctx.textAlign    = 'center';
    gctx.fillText((currentSkin.comboText || '{n} COMBO').replace('{n}', combo), CANVAS_W / 2, 60);
  }

  // Practice / no-death badge — below HP bar, top-left
  if (PRACTICE_MODE || PRACTICE_SPEED !== 1.0) {
    const badgeParts = [];
    if (PRACTICE_SPEED !== 1.0) badgeParts.push(PRACTICE_SPEED + '×');
    if (PRACTICE_MODE) badgeParts.push('NO DEATH');
    if (badgeParts.length) {
      gctx.fillStyle  = withAlpha(_tc.red, '80');
      gctx.font       = skinFont(9, true);
      gctx.textAlign  = 'left';
      gctx.fillText(badgeParts.join('  '), barX, barY + barH + 12);
    }
  }

  // Song title
  if (song) {
    gctx.fillStyle    = currentSkin.songInfoColor || '#383860';
    gctx.font         = skinFont(10, false);
    gctx.textAlign    = 'right';
    gctx.fillText(song.title, CANVAS_W - 10, 18);
    if (song.artist) gctx.fillText(song.artist, CANVAS_W - 10, 32);
  }
}

// ── Lane backgrounds ──────────────────────────────────────────────────────────
function drawLaneBackgrounds() {
  const lgm = currentSkin.laneGradientMode || 'fade';
  for (let l = 0; l < LANE_COUNT; l++) {
    const lx  = LANE_X[l];
    const col = LANE_COLORS[l];

    if (lgm !== 'none') {
      if (lgm === 'solid') {
        gctx.fillStyle = withAlpha(col, '17');
        gctx.fillRect(lx, LANE_TOP, LANE_W, HIT_Y - LANE_TOP);
      } else {
        gctx.fillStyle = _laneBgGrad[l];
        gctx.fillRect(lx, LANE_TOP, LANE_W, HIT_Y - LANE_TOP);
      }
    }

    const R = LANE_RESOLVED[l];
    const _lbRaw = currentSkin.laneBorderColors && currentSkin.laneBorderColors[l];
    gctx.strokeStyle = _lbRaw ? withAlpha(R.laneBorderColor, alphaHex(R.laneBorderOpacity)) : withAlpha(col, '36');
    gctx.lineWidth   = 1;
    gctx.strokeRect(lx + 0.5, LANE_TOP, LANE_W, HIT_Y - LANE_TOP);

    if (pressedLanes.has(l)) {
      const _lpRaw = currentSkin.lanePressColors && currentSkin.lanePressColors[l];
      gctx.fillStyle = _lpRaw ? withAlpha(R.lanePressColor, alphaHex(R.lanePressOpacity)) : withAlpha(col, '21');
      gctx.fillRect(lx, LANE_TOP, LANE_W, HIT_Y - LANE_TOP);
    }
    if (missFlashes[l] !== null) {
      const alpha = missFlashes[l] / 14;
      const mfc = currentSkin.missFlashColor || '#ff3c50';
      const mr = parseInt(mfc.slice(1,3), 16), mg = parseInt(mfc.slice(3,5), 16), mb = parseInt(mfc.slice(5,7), 16);
      gctx.fillStyle = `rgba(${mr},${mg},${mb},${alpha * 0.22})`;
      gctx.fillRect(lx, LANE_TOP, LANE_W, HIT_Y - LANE_TOP);
    }
  }
}

// ── Hit zone ──────────────────────────────────────────────────────────────────
function drawHitZone() {
  const hzs = currentSkin.hitZoneStyle || 'glow';
  if (hzs === 'none') return;
  for (let l = 0; l < LANE_COUNT; l++) {
    const lx  = LANE_X[l];
    const col = LANE_COLORS[l];

    const R = LANE_RESOLVED[l];
    if (hzs === 'glow') {
      const _hasGlowOvr = currentSkin.hitGlowColors && currentSkin.hitGlowColors[l];
      gctx.fillStyle = _hasGlowOvr ? withAlpha(R.hitGlowColor, alphaHex(R.hitGlowOpacity * 0.094)) : withAlpha(col, '18');
      gctx.fillRect(lx + 4, HIT_Y - 4, LANE_W - 8, 8);
    }

    const _hasLineOvr = currentSkin.hitLineColors && currentSkin.hitLineColors[l];
    if (_hasLineOvr) {
      gctx.strokeStyle = withAlpha(R.hitLineColor, alphaHex(R.hitLineOpacity));
    } else {
      const hlc = currentSkin.hitLineColor || '#ffffff';
      gctx.strokeStyle = withAlpha(hlc !== '#ffffff' ? hlc : col, 'aa');
    }
    gctx.lineWidth   = currentSkin.hitLineWidth || 2;
    gctx.beginPath();
    gctx.moveTo(lx + 5, HIT_Y);
    gctx.lineTo(lx + LANE_W - 5, HIT_Y);
    gctx.stroke();

    if (hitFlashes[l] !== null) {
      const f = hitFlashes[l] / 20;
      const _flashCol = (currentSkin.hitFlashColors && currentSkin.hitFlashColors[l]) ? R.hitFlashColor : col;
      gctx.shadowBlur  = 18 * f * (currentSkin.hitFlashIntensity ?? 1.0);
      gctx.shadowColor = _flashCol;
      gctx.strokeStyle = _flashCol;
      gctx.lineWidth   = 3;
      gctx.beginPath();
      gctx.moveTo(lx + 5, HIT_Y);
      gctx.lineTo(lx + LANE_W - 5, HIT_Y);
      gctx.stroke();
      gctx.shadowBlur = 0;
    }
  }

  if (currentSkin.hitRingEnabled !== false) {
    for (const ring of hitRings) {
      const lx       = LANE_X[ring.lane];
      const cx       = lx + LANE_W / 2;
      const col      = LANE_COLORS[ring.lane];
      const progress = 1 - ring.timer / ring.maxTimer;
      const radius   = 15 + progress * 55;
      const alpha    = ring.timer / ring.maxTimer;

      const _ringCol = (currentSkin.hitRingColors && currentSkin.hitRingColors[ring.lane])
        ? LANE_RESOLVED[ring.lane].hitRingColor : col;
      gctx.strokeStyle  = _ringCol;
      gctx.globalAlpha  = alpha * 0.65;
      gctx.lineWidth    = 2.5;
      gctx.shadowBlur   = 8 * alpha;
      gctx.shadowColor  = _ringCol;
      gctx.beginPath();
      gctx.arc(cx, HIT_Y, radius, 0, Math.PI * 2);
      gctx.stroke();
      gctx.shadowBlur  = 0;
      gctx.globalAlpha = 1;
    }
  }
}

// ── Note helpers ──────────────────────────────────────────────────────────────
function drawDiagonalStripes(x, y, w, h, color, spacing) {
  if (h <= 0 || w <= 0) return;
  spacing = spacing || 10;
  gctx.save();
  gctx.beginPath();
  gctx.rect(x, y, w, h);
  gctx.clip();
  gctx.strokeStyle = color;
  gctx.lineWidth   = 2;
  gctx.beginPath();
  for (let i = -(h + w); i <= w + h + spacing; i += spacing) {
    gctx.moveTo(x + i, y);
    gctx.lineTo(x + i + h, y + h);
  }
  gctx.stroke();
  gctx.restore();
}

const _shineShapes = new Set(['rounded', 'sharp', 'key', 'hexagon']);

function fillNoteShape(x, y, w, h, shape, label) {
  const cx = x + w / 2, cy = y + h / 2;
  if (shape === 'diamond') {
    gctx.save();
    gctx.translate(cx, cy);
    gctx.rotate(Math.PI / 4);
    gctx.fillRect(-w / 2, -h / 2, w, h);
    gctx.restore();
  } else if (shape === 'sharp') {
    gctx.fillRect(x, y, w, h);
  } else if (shape === 'circle') {
    gctx.beginPath();
    gctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    gctx.fill();
  } else if (shape === 'hexagon') {
    gctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 2;
      const px = cx + (w / 2) * Math.cos(a), py = cy + (h / 2) * Math.sin(a);
      i === 0 ? gctx.moveTo(px, py) : gctx.lineTo(px, py);
    }
    gctx.closePath();
    gctx.fill();
  } else if (shape === 'arrow') {
    gctx.beginPath();
    gctx.moveTo(cx, y + h);
    gctx.lineTo(x, y);
    gctx.lineTo(x + w * 0.3, y);
    gctx.lineTo(cx, y + h * 0.6);
    gctx.lineTo(x + w * 0.7, y);
    gctx.lineTo(x + w, y);
    gctx.closePath();
    gctx.fill();
  } else if (shape === 'triangle') {
    gctx.beginPath();
    gctx.moveTo(cx, y + h);
    gctx.lineTo(x, y);
    gctx.lineTo(x + w, y);
    gctx.closePath();
    gctx.fill();
  } else if (shape === 'key') {
    gctx.beginPath();
    gctx.roundRect(x, y, w, h, 4);
    gctx.fill();
    if (label) {
      const prevFill = gctx.fillStyle;
      gctx.fillStyle = 'rgba(255,255,255,0.85)';
      gctx.font = `bold ${Math.max(10, Math.floor(h * 0.7))}px ${currentSkin.fontFamily || 'monospace'}`;
      gctx.textAlign = 'center';
      gctx.textBaseline = 'middle';
      gctx.fillText(label, cx, cy);
      gctx.fillStyle = prevFill;
      gctx.textAlign = 'start';
      gctx.textBaseline = 'alphabetic';
    }
  } else {
    gctx.beginPath();
    gctx.roundRect(x, y, w, h, 4);
    gctx.fill();
  }
}

function strokeNoteShape(x, y, w, h, shape) {
  const cx = x + w / 2, cy = y + h / 2;
  if (shape === 'diamond') {
    gctx.save();
    gctx.translate(cx, cy);
    gctx.rotate(Math.PI / 4);
    gctx.strokeRect(-w / 2, -h / 2, w, h);
    gctx.restore();
  } else if (shape === 'sharp') {
    gctx.strokeRect(x, y, w, h);
  } else if (shape === 'circle') {
    gctx.beginPath();
    gctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    gctx.stroke();
  } else if (shape === 'hexagon') {
    gctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 2;
      const px = cx + (w / 2) * Math.cos(a), py = cy + (h / 2) * Math.sin(a);
      i === 0 ? gctx.moveTo(px, py) : gctx.lineTo(px, py);
    }
    gctx.closePath();
    gctx.stroke();
  } else if (shape === 'arrow') {
    gctx.beginPath();
    gctx.moveTo(cx, y + h);
    gctx.lineTo(x, y);
    gctx.lineTo(x + w * 0.3, y);
    gctx.lineTo(cx, y + h * 0.6);
    gctx.lineTo(x + w * 0.7, y);
    gctx.lineTo(x + w, y);
    gctx.closePath();
    gctx.stroke();
  } else if (shape === 'triangle') {
    gctx.beginPath();
    gctx.moveTo(cx, y + h);
    gctx.lineTo(x, y);
    gctx.lineTo(x + w, y);
    gctx.closePath();
    gctx.stroke();
  } else {
    gctx.beginPath();
    gctx.roundRect(x, y, w, h, 4);
    gctx.stroke();
  }
}

function drawTapNote(lx, yHead, col, alpha, glow, laneIdx, isMiss) {
  const x = lx + 5, w = LANE_W - 10, h = NOTE_H;
  const shape   = currentSkin.noteShape   || 'rounded';
  // Apply per-lane note color and opacity (skip for missed notes)
  const R = LANE_RESOLVED[laneIdx];
  if (!isMiss && R) { col = R.noteColor; alpha *= R.noteOpacity; }
  gctx.globalAlpha = alpha;
  gctx.shadowBlur  = glow;
  gctx.shadowColor = (!isMiss && R) ? R.noteGlowColor : col;

  if (noteIconImg && noteIconImg.complete && noteIconImg.naturalWidth) {
    const iconScale = currentSkin.noteIconScale !== undefined ? currentSkin.noteIconScale : 1.0;
    const iconOffY  = currentSkin.noteIconOffsetY || 0;
    const sc = Math.min(w / noteIconImg.naturalWidth, h / noteIconImg.naturalHeight) * iconScale;
    const iw = noteIconImg.naturalWidth * sc, ih = noteIconImg.naturalHeight * sc;
    gctx.drawImage(noteIconImg, x + (w - iw) / 2, yHead - h + (h - ih) / 2 + iconOffY, iw, ih);
  } else {
    const ng = gctx.createLinearGradient(0, yHead - h, 0, yHead);
    ng.addColorStop(0, col);
    ng.addColorStop(1, withAlpha(col, 'bb'));
    gctx.fillStyle = ng;
    const kl = (shape === 'key' && LANE_KEYS[laneIdx]) ? displayKeyName(LANE_KEYS[laneIdx]) : null;
    fillNoteShape(x, yHead - h, w, h, shape, kl);

    gctx.shadowBlur = 0;
    const shineA = currentSkin.noteShine ?? 0.30;
    if (shineA > 0 && _shineShapes.has(shape)) {
      const _shineCol = (!isMiss && R) ? R.noteShineColor : '#ffffff';
      const _shineOp  = (!isMiss && R) ? R.noteShineOpacity : 1.0;
      gctx.fillStyle = `rgba(${parseInt(_shineCol.slice(1,3),16)},${parseInt(_shineCol.slice(3,5),16)},${parseInt(_shineCol.slice(5,7),16)},${shineA * _shineOp})`;
      if (shape === 'sharp') {
        gctx.fillRect(x, yHead - h, w, 4);
      } else {
        gctx.beginPath();
        gctx.roundRect(x, yHead - h, w, 4, [4, 4, 0, 0]);
        gctx.fill();
      }
    }

    // Note border stroke
    const _nbw = currentSkin.noteBorderWidth || 0;
    if (_nbw > 0) {
      gctx.shadowBlur = 0;
      const bc = (!isMiss && R) ? R.noteBorderColor : col;
      const bcOp = (!isMiss && R) ? R.noteBorderOpacity : 1.0;
      gctx.strokeStyle = withAlpha(bc, alphaHex(bcOp));
      gctx.lineWidth   = _nbw;
      strokeNoteShape(x, yHead - h, w, h, shape);
    }
  }

  gctx.globalAlpha = 1;
  gctx.shadowBlur  = 0;
}

function drawHoldNote(lx, yHead, yTail, col, alpha, glow, n, t, isMiss) {
  const _hbw = currentSkin.holdBodyWidth !== undefined ? currentSkin.holdBodyWidth : 0.44;
  const bw  = Math.min(Math.floor(LANE_W * _hbw), LANE_W - 4);
  const bx  = lx + Math.floor((LANE_W - bw) / 2);
  const hx  = lx + 4, hw = LANE_W - 8;
  const hh  = NOTE_H + 6;
  const bodyTop = yHead - hh / 2;
  const bodyLen = Math.max(0, bodyTop - yTail);
  // Apply per-lane hold color and opacity (skip for missed notes)
  const R = (n && !isMiss) ? LANE_RESOLVED[n.lane] : null;
  if (R) { col = R.holdColor; alpha *= R.holdOpacity; }
  gctx.globalAlpha = alpha;

  if (bodyLen > 0) {
    const _hasBodyOvr = R && currentSkin.holdBodyColors && currentSkin.holdBodyColors[n.lane];
    if (_hasBodyOvr) {
      gctx.fillStyle = withAlpha(R.holdBodyColor, alphaHex(R.holdBodyOpacity));
    } else {
      gctx.fillStyle = withAlpha(col, '60');
    }
    gctx.fillRect(bx, yTail, bw, bodyLen);
    if (currentSkin.holdStripes !== false) {
      const _hasStripeOvr = R && currentSkin.holdStripeColors && currentSkin.holdStripeColors[n.lane];
      const stripeCol = _hasStripeOvr ? withAlpha(R.holdStripeColor, alphaHex(R.holdStripeOpacity)) : withAlpha(col, '55');
      drawDiagonalStripes(bx, yTail, bw, bodyLen, stripeCol);
    }
    const hbw = currentSkin.holdBorderWidth ?? 1;
    if (hbw > 0) {
      const _hasBdrOvr = R && currentSkin.holdBorderColors && currentSkin.holdBorderColors[n.lane];
      gctx.strokeStyle = _hasBdrOvr ? withAlpha(R.holdBorderColor, alphaHex(R.holdBorderOpacity)) : withAlpha(col, '77');
      gctx.lineWidth = hbw;
      gctx.strokeRect(bx + 0.5, yTail + 0.5, bw - 1, bodyLen - 1);
    }

    // Draw tick marks on body
    if (currentSkin.holdTickMarks !== false && n && t !== undefined) {
      const _tickCol = R ? R.holdTickColor : '#ffffff';
      const _tickOp  = R ? R.holdTickOpacity : 1.0;
      let tickT = n.time + TICK_INTERVAL;
      while (tickT < n.time + n.duration - 0.01) {
        const tta = tickT - t;
        if (tta >= 0 && tta <= APPROACH) {
          const yTick = HIT_Y - (tta / APPROACH) * (HIT_Y - LANE_TOP);
          if (yTick > yTail && yTick < bodyTop - 2) {
            gctx.globalAlpha = alpha * 0.7;
            gctx.fillStyle   = withAlpha(_tickCol, alphaHex(_tickOp));
            gctx.fillRect(bx + 2, yTick - 2, bw - 4, 4);
          }
        }
        tickT += TICK_INTERVAL;
      }
      gctx.globalAlpha = alpha;
    }
  }

  // Bright glowing tail endcap
  const _tcwMul = currentSkin.tailCapWidth  !== undefined ? currentSkin.tailCapWidth  : 1.0;
  const _tchMul = currentSkin.tailCapHeight !== undefined ? currentSkin.tailCapHeight : 1.0;
  const tcOuterW = (bw + 4) * _tcwMul, tcOuterH = 12 * _tchMul;
  const tcInnerW = bw * _tcwMul,       tcInnerH = 8 * _tchMul;
  const tcStyle = currentSkin.tailCapStyle || 'rounded';
  const _tcCx = bx + bw / 2;
  gctx.shadowBlur  = 16;
  gctx.shadowColor = col;
  gctx.fillStyle   = '#ffffff';
  gctx.globalAlpha = alpha;
  if (tcStyle === 'flat') {
    gctx.fillRect(_tcCx - tcOuterW / 2, yTail - tcOuterH / 2, tcOuterW, tcOuterH);
  } else if (tcStyle === 'pointed') {
    gctx.beginPath();
    gctx.moveTo(_tcCx - tcOuterW / 2, yTail - tcOuterH / 2);
    gctx.lineTo(_tcCx + tcOuterW / 2, yTail - tcOuterH / 2);
    gctx.lineTo(_tcCx, yTail + tcOuterH / 2);
    gctx.closePath();
    gctx.fill();
  } else {
    gctx.beginPath();
    gctx.roundRect(bx + (bw - tcOuterW) / 2, yTail - tcOuterH / 2, tcOuterW, tcOuterH, tcOuterH / 2);
    gctx.fill();
  }
  gctx.shadowBlur = 0;
  const _hasTcOvr = R && currentSkin.holdTailCapColors && currentSkin.holdTailCapColors[n.lane];
  gctx.fillStyle = _hasTcOvr ? withAlpha(R.holdTailCapColor, alphaHex(R.holdTailCapOpacity)) : col;
  if (tcStyle === 'flat') {
    gctx.fillRect(_tcCx - tcInnerW / 2, yTail - tcInnerH / 2, tcInnerW, tcInnerH);
  } else if (tcStyle === 'pointed') {
    gctx.beginPath();
    gctx.moveTo(_tcCx - tcInnerW / 2, yTail - tcInnerH / 2);
    gctx.lineTo(_tcCx + tcInnerW / 2, yTail - tcInnerH / 2);
    gctx.lineTo(_tcCx, yTail + tcInnerH / 2);
    gctx.closePath();
    gctx.fill();
  } else {
    gctx.beginPath();
    gctx.roundRect(bx + (bw - tcInnerW) / 2, yTail - tcInnerH / 2, tcInnerW, tcInnerH, tcInnerH / 2);
    gctx.fill();
  }

  // Hold head — custom icon replaces standard head entirely
  if (noteIconImg && noteIconImg.complete && noteIconImg.naturalWidth) {
    const iconScale = currentSkin.noteIconScale !== undefined ? currentSkin.noteIconScale : 1.0;
    const iconOffY  = currentSkin.noteIconOffsetY || 0;
    const sc = Math.min(hw / noteIconImg.naturalWidth, hh / noteIconImg.naturalHeight) * iconScale;
    const iw = noteIconImg.naturalWidth * sc, ih = noteIconImg.naturalHeight * sc;
    gctx.shadowBlur  = glow;
    gctx.shadowColor = col;
    gctx.globalAlpha = alpha;
    gctx.drawImage(noteIconImg, hx + (hw - iw) / 2, yHead - ih + iconOffY, iw, ih);
    gctx.shadowBlur = 0;
  } else {
    const _holdShape = currentSkin.noteShape || 'rounded';
    gctx.shadowBlur  = glow;
    gctx.shadowColor = col;
    const ng = gctx.createLinearGradient(0, yHead - hh, 0, yHead);
    ng.addColorStop(0,   '#ffffff');
    ng.addColorStop(0.3, col);
    ng.addColorStop(1,   withAlpha(col, 'cc'));
    gctx.fillStyle = ng;
    const _holdLabel = (_holdShape === 'key' && n && LANE_KEYS[n.lane]) ? displayKeyName(LANE_KEYS[n.lane]) : null;
    fillNoteShape(hx, yHead - hh, hw, hh, _holdShape, _holdLabel);

    gctx.shadowBlur  = 0;
    gctx.strokeStyle = 'rgba(0,0,0,0.35)';
    gctx.lineWidth   = 1.5;
    for (let g = 0; g < 3; g++) {
      const gy = yHead - 5 - g * 5;
      gctx.beginPath();
      gctx.moveTo(hx + 8,      gy);
      gctx.lineTo(hx + hw - 8, gy);
      gctx.stroke();
    }

    const holdShineA = Math.min(1, (currentSkin.noteShine ?? 0.30) * 1.33);
    if (holdShineA > 0 && _shineShapes.has(_holdShape)) {
      gctx.fillStyle = `rgba(255,255,255,${holdShineA})`;
      if (_holdShape === 'sharp') {
        gctx.fillRect(hx, yHead - hh, hw, 5);
      } else {
        gctx.beginPath();
        gctx.roundRect(hx, yHead - hh, hw, 5, [5, 5, 0, 0]);
        gctx.fill();
      }
    }

    // Hold head border stroke
    const _nbwH = currentSkin.noteBorderWidth || 0;
    if (_nbwH > 0 && n) {
      gctx.shadowBlur = 0;
      const bcH = R ? R.noteBorderColor : col;
      const bcHOp = R ? R.noteBorderOpacity : 1.0;
      gctx.strokeStyle = withAlpha(bcH, alphaHex(bcHOp));
      gctx.lineWidth   = _nbwH;
      strokeNoteShape(hx, yHead - hh, hw, hh, _holdShape);
    }
  }

  gctx.globalAlpha = 1;
  gctx.shadowBlur  = 0;
}

function drawActiveHold(lx, yTail, col, noteIdx, t) {
  const _hbw    = currentSkin.holdBodyWidth !== undefined ? currentSkin.holdBodyWidth : 0.44;
  const bw      = Math.min(Math.floor(LANE_W * _hbw), LANE_W - 4);
  const bx      = lx + Math.floor((LANE_W - bw) / 2);
  const bodyLen = Math.max(0, HIT_Y - yTail);
  if (bodyLen === 0) return;
  // Apply per-lane hold color and opacity
  const n = notes[noteIdx];
  const R = n ? LANE_RESOLVED[n.lane] : null;
  if (R) col = R.holdColor;
  const activeAlpha = 0.9 * (R ? R.holdOpacity : 1);

  gctx.globalAlpha = activeAlpha;
  const _hasBodyOvrA = R && n && currentSkin.holdBodyColors && currentSkin.holdBodyColors[n.lane];
  const bodyCol = _hasBodyOvrA ? R.holdBodyColor : col;
  const tg = gctx.createLinearGradient(0, yTail, 0, HIT_Y);
  tg.addColorStop(0, withAlpha(bodyCol, '55'));
  tg.addColorStop(1, withAlpha(bodyCol, 'dd'));
  gctx.fillStyle   = tg;
  gctx.shadowBlur  = 16;
  gctx.shadowColor = col;
  gctx.fillRect(bx, yTail, bw, bodyLen);

  gctx.shadowBlur = 0;
  if (currentSkin.holdStripes !== false) {
    const _hsOvrA = R && n && currentSkin.holdStripeColors && currentSkin.holdStripeColors[n.lane];
    drawDiagonalStripes(bx, yTail, bw, bodyLen, _hsOvrA ? withAlpha(R.holdStripeColor, alphaHex(R.holdStripeOpacity)) : withAlpha(col, '60'));
  }

  // Draw tick marks in active hold body
  if (currentSkin.holdTickMarks !== false && noteIdx !== undefined && t !== undefined && n) {
    const _tickColA = R ? R.holdTickColor : '#ffffff';
    const _tickOpA  = R ? R.holdTickOpacity : 1.0;
    {
      let tickT = n.time + TICK_INTERVAL;
      while (tickT < n.time + n.duration - 0.01) {
        const tta = tickT - t;
        if (tta >= 0 && tta <= APPROACH) {
          const yTick = HIT_Y - (tta / APPROACH) * (HIT_Y - LANE_TOP);
          if (yTick > yTail && yTick < HIT_Y - 4) {
            gctx.globalAlpha = 0.5;
            gctx.fillStyle   = withAlpha(_tickColA, alphaHex(_tickOpA * 0.5));
            gctx.fillRect(bx + 2, yTick - 2, bw - 4, 4);
          }
        } else if (tta < 0) {
          // Already-passed tick — show as scored
          const yTick = HIT_Y - (tta / APPROACH) * (HIT_Y - LANE_TOP);
          if (yTick > yTail && yTick < HIT_Y - 4) {
            gctx.globalAlpha = 0.3;
            gctx.fillStyle   = withAlpha(col, 'cc');
            gctx.fillRect(bx + 2, yTick - 2, bw - 4, 4);
          }
        }
        tickT += TICK_INTERVAL;
      }
      gctx.globalAlpha = activeAlpha;
    }
  }

  // Bright glowing tail endcap for active hold
  const _atcStyle = currentSkin.tailCapStyle || 'rounded';
  const _atcCx = bx + bw / 2;
  const _atcOW = bw + 4, _atcOH = 12;
  const _atcIW = bw,     _atcIH = 8;
  gctx.shadowBlur  = 20;
  gctx.shadowColor = col;
  gctx.fillStyle   = '#ffffff';
  gctx.globalAlpha = 0.95;
  if (_atcStyle === 'flat') {
    gctx.fillRect(_atcCx - _atcOW / 2, yTail - _atcOH / 2, _atcOW, _atcOH);
  } else if (_atcStyle === 'pointed') {
    gctx.beginPath();
    gctx.moveTo(_atcCx - _atcOW / 2, yTail - _atcOH / 2);
    gctx.lineTo(_atcCx + _atcOW / 2, yTail - _atcOH / 2);
    gctx.lineTo(_atcCx, yTail + _atcOH / 2);
    gctx.closePath();
    gctx.fill();
  } else {
    gctx.beginPath();
    gctx.roundRect(bx - 2, yTail - 6, bw + 4, 12, 6);
    gctx.fill();
  }
  gctx.shadowBlur = 0;
  const _hasTcOvrA = R && n && currentSkin.holdTailCapColors && currentSkin.holdTailCapColors[n.lane];
  gctx.fillStyle = _hasTcOvrA ? withAlpha(R.holdTailCapColor, alphaHex(R.holdTailCapOpacity)) : col;
  if (_atcStyle === 'flat') {
    gctx.fillRect(_atcCx - _atcIW / 2, yTail - _atcIH / 2, _atcIW, _atcIH);
  } else if (_atcStyle === 'pointed') {
    gctx.beginPath();
    gctx.moveTo(_atcCx - _atcIW / 2, yTail - _atcIH / 2);
    gctx.lineTo(_atcCx + _atcIW / 2, yTail - _atcIH / 2);
    gctx.lineTo(_atcCx, yTail + _atcIH / 2);
    gctx.closePath();
    gctx.fill();
  } else {
    gctx.beginPath();
    gctx.roundRect(bx, yTail - 4, bw, 8, 4);
    gctx.fill();
  }

  gctx.globalAlpha = 1;
  gctx.shadowBlur  = 0;
}

// ── Glide helpers ─────────────────────────────────────────────────────────────

// Returns which lane the player must currently be holding for a glide note.
// For multi-step glides (|laneA - laneB| > 1) the glideAt window is divided
// into equal segments — one per lane step — and the required lane advances
// through each intermediate lane in order.
function getGlideRequiredLane(n, t) {
  const laneA = n.lane, laneB = n.glide;
  const dir        = laneB > laneA ? 1 : -1;
  const totalSteps = Math.abs(laneB - laneA);
  const glideAt    = n.glideAt || (n.duration / 2);
  const tNote      = t - n.time;

  if (tNote >= glideAt) return laneB;  // past transition — hold final lane

  const pct  = Math.min(1, Math.max(0, tNote / Math.max(0.001, glideAt)));
  const step = Math.floor(pct * totalSteps);  // 0-indexed intermediate step
  return laneA + step * dir;
}

// ── Glide notes (smooth diagonal two-lane holds) ──────────────────────────────
//
// Visual: one continuous diagonal body (parallelogram) that slides from
// lane A (head, bottom) to lane B (tail, top). A bright stripe marks the
// transition point. Far cleaner than two separate segments.
//
function drawGlideNote(n, t, yHead, yTail, alpha, glow) {
  const laneA = n.lane, laneB = n.glide;
  const colA  = LANE_COLORS[laneA], colB = LANE_COLORS[laneB];
  const _hbw  = currentSkin.holdBodyWidth !== undefined ? currentSkin.holdBodyWidth : 0.44;
  const bw    = Math.min(Math.floor(LANE_W * _hbw), LANE_W - 4);
  const bxA   = LANE_X[laneA] + Math.floor((LANE_W - bw) / 2);
  const bxB   = LANE_X[laneB] + Math.floor((LANE_W - bw) / 2);
  const hh    = NOTE_H + 6;
  const dir   = laneB > laneA ? 1 : -1;  // slide direction: +1=right, -1=left

  // Body: bottom at lane A (near head), top at lane B (tail)
  const bodyBottom = yHead - hh / 2;
  const bodyLen    = bodyBottom - yTail;

  // Helper: x-left-edge of parallelogram at height y
  // frac 0 = yTail (bxB side), frac 1 = bodyBottom (bxA side)
  const bodyX = y => bxB + (bxA - bxB) * ((y - yTail) / bodyLen);

  gctx.globalAlpha = alpha;

  if (bodyLen > 0) {
    // ── Ribbon body (game-style opacity, gradient A→B) ───────────────────────
    const bg = gctx.createLinearGradient(0, bodyBottom, 0, yTail);
    bg.addColorStop(0, withAlpha(colA, '55'));
    bg.addColorStop(1, withAlpha(colB, '55'));
    gctx.fillStyle = bg;
    gctx.beginPath();
    gctx.moveTo(bxA,      bodyBottom);
    gctx.lineTo(bxA + bw, bodyBottom);
    gctx.lineTo(bxB + bw, yTail);
    gctx.lineTo(bxB,      yTail);
    gctx.closePath();
    gctx.fill();

    // ── Center gloss shine stripe (PJSK ribbon highlight) ─────────────────────
    gctx.save();
    gctx.beginPath();
    gctx.moveTo(bxA,      bodyBottom);
    gctx.lineTo(bxA + bw, bodyBottom);
    gctx.lineTo(bxB + bw, yTail);
    gctx.lineTo(bxB,      yTail);
    gctx.closePath();
    gctx.clip();
    const shineMid = (bodyBottom + yTail) / 2;
    const shineH   = bodyLen * 0.28;
    const sg = gctx.createLinearGradient(0, shineMid - shineH * 0.5, 0, shineMid + shineH * 0.5);
    sg.addColorStop(0,   'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.38)');
    sg.addColorStop(1,   'rgba(255,255,255,0)');
    gctx.fillStyle   = sg;
    gctx.globalAlpha = alpha;
    const xSpan = Math.abs(bxB - bxA);
    gctx.fillRect(Math.min(bxA, bxB) - 2, shineMid - shineH * 0.5, bw + xSpan + 4, shineH);
    gctx.restore();

    // ── Chevron arrows pointing toward lane B ─────────────────────────────────
    gctx.save();
    gctx.beginPath();
    gctx.moveTo(bxA,      bodyBottom);
    gctx.lineTo(bxA + bw, bodyBottom);
    gctx.lineTo(bxB + bw, yTail);
    gctx.lineTo(bxB,      yTail);
    gctx.closePath();
    gctx.clip();
    gctx.globalAlpha = alpha * 0.65;
    gctx.strokeStyle = 'rgba(255,255,255,0.60)';
    gctx.lineWidth   = 1.8;
    gctx.lineJoin    = 'round';
    const chSz = 7, chStep = 18;
    for (let y = yTail + chStep * 0.6; y < bodyBottom - chStep * 0.3; y += chStep) {
      const cx = bodyX(y) + bw / 2;
      gctx.beginPath();
      gctx.moveTo(cx - chSz * dir, y - chSz * 0.5);
      gctx.lineTo(cx + chSz * dir, y);
      gctx.lineTo(cx - chSz * dir, y + chSz * 0.5);
      gctx.stroke();
    }
    gctx.restore();

    // ── Glowing outline (neon, matching game's hold note style) ──────────────
    gctx.globalAlpha = alpha;
    gctx.shadowBlur  = 8; gctx.shadowColor = colA;
    gctx.strokeStyle = withAlpha(colA, 'aa');
    gctx.lineWidth   = 1.5;
    gctx.beginPath();
    gctx.moveTo(bxA,      bodyBottom);
    gctx.lineTo(bxA + bw, bodyBottom);
    gctx.lineTo(bxB + bw, yTail);
    gctx.lineTo(bxB,      yTail);
    gctx.closePath();
    gctx.stroke();
    gctx.shadowBlur = 0;

    // ── Lane-step transition stripes (one per lane boundary) ─────────────────
    // Intermediate stripes (dimmer) + final glideAt stripe (bright)
    const totalSteps  = Math.abs(laneB - laneA);
    const glideAtTime = n.glideAt || 0;
    gctx.globalAlpha  = alpha;
    for (let k = 1; k <= totalSteps; k++) {
      const frac    = k / totalSteps;
      const ttaStep = (n.time + glideAtTime * frac) - t;
      const yRaw    = HIT_Y - (ttaStep / APPROACH) * (HIT_Y - LANE_TOP);
      const yS      = Math.max(yTail + 2, Math.min(bodyBottom - 2, yRaw));
      const bxS     = bodyX(yS);
      const isFinal = k === totalSteps;
      gctx.shadowBlur  = isFinal ? 14 : 5;
      gctx.shadowColor = '#ffffff';
      gctx.fillStyle   = isFinal ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.50)';
      gctx.fillRect(bxS, yS - 2, bw, 4);
    }
    gctx.shadowBlur = 0;
  }

  // ── Tail endcap in lane B (PJSK gloss pill) ───────────────────────────────
  gctx.globalAlpha = alpha;
  gctx.shadowBlur  = 18; gctx.shadowColor = colB;
  gctx.fillStyle   = withAlpha(colB, 'cc');
  gctx.beginPath(); gctx.roundRect(bxB - 3, yTail - 7, bw + 6, 14, 7); gctx.fill();
  gctx.shadowBlur  = 0;
  gctx.fillStyle   = 'rgba(255,255,255,0.60)';
  gctx.beginPath(); gctx.roundRect(bxB + 1, yTail - 5, bw - 2, 5, [4, 4, 0, 0]); gctx.fill();

  // ── Head in lane A ────────────────────────────────────────────────────────
  gctx.shadowBlur  = glow; gctx.shadowColor = colA;
  const ng = gctx.createLinearGradient(0, yHead - hh, 0, yHead);
  ng.addColorStop(0, '#ffffff'); ng.addColorStop(0.25, colA); ng.addColorStop(1, withAlpha(colA, 'cc'));
  gctx.fillStyle = ng; gctx.globalAlpha = alpha;
  const hxA = LANE_X[laneA] + 4, hwA = LANE_W - 8;
  gctx.beginPath(); gctx.roundRect(hxA, yHead - hh, hwA, hh, [5, 5, 0, 0]); gctx.fill();
  gctx.shadowBlur  = 0;
  gctx.strokeStyle = 'rgba(0,0,0,0.35)'; gctx.lineWidth = 1.5;
  for (let g = 0; g < 3; g++) {
    const gy = yHead - 5 - g * 5;
    gctx.beginPath(); gctx.moveTo(hxA + 8, gy); gctx.lineTo(hxA + hwA - 8, gy); gctx.stroke();
  }
  gctx.fillStyle = 'rgba(255,255,255,0.45)';
  gctx.beginPath(); gctx.roundRect(hxA, yHead - hh, hwA, 5, [5, 5, 0, 0]); gctx.fill();
  gctx.globalAlpha = 1; gctx.shadowBlur = 0;
}

function drawActiveGlideNote(n, noteIdx, t, yTail) {
  const laneA = n.lane, laneB = n.glide;
  const colA  = LANE_COLORS[laneA], colB = LANE_COLORS[laneB];
  const _hbw  = currentSkin.holdBodyWidth !== undefined ? currentSkin.holdBodyWidth : 0.44;
  const bw    = Math.min(Math.floor(LANE_W * _hbw), LANE_W - 4);
  const bxA   = LANE_X[laneA] + Math.floor((LANE_W - bw) / 2);
  const bxB   = LANE_X[laneB] + Math.floor((LANE_W - bw) / 2);
  const dir   = laneB > laneA ? 1 : -1;

  const glideAt = n.glideAt || (n.duration / 2);
  const tNote   = t - n.time;
  const pct     = Math.min(1, Math.max(0, tNote / Math.max(0.001, glideAt)));
  const bxCur   = bxA + (bxB - bxA) * pct;
  // Color snaps to the currently required lane so the indicator is always correct
  const colCur  = LANE_COLORS[getGlideRequiredLane(n, t)] || colB;

  const bodyLen = Math.max(0, HIT_Y - yTail);
  if (bodyLen === 0) return;

  // Pulse: 0 = no pulse, >0 = time-based oscillation
  const pulse = 0.88 + 0.12 * Math.sin(t * 8);

  // Helper: x-left-edge at height y (bottom=HIT_Y=bxCur, top=yTail=bxB)
  const bodyX = y => bxB + (bxCur - bxB) * ((y - yTail) / bodyLen);

  // ── Active ribbon body (matches drawActiveHold opacity range) ────────────
  gctx.shadowBlur  = Math.round(18 * pulse); gctx.shadowColor = colCur;
  gctx.globalAlpha = 0.9;
  const tg = gctx.createLinearGradient(0, yTail, 0, HIT_Y);
  tg.addColorStop(0, withAlpha(colB, '55'));
  tg.addColorStop(1, withAlpha(colCur, 'dd'));
  gctx.fillStyle = tg;
  gctx.beginPath();
  gctx.moveTo(bxCur,      HIT_Y);
  gctx.lineTo(bxCur + bw, HIT_Y);
  gctx.lineTo(bxB + bw,   yTail);
  gctx.lineTo(bxB,        yTail);
  gctx.closePath();
  gctx.fill();
  gctx.shadowBlur = 0;

  // ── Center gloss shine stripe ─────────────────────────────────────────────
  gctx.save();
  gctx.beginPath();
  gctx.moveTo(bxCur,      HIT_Y);
  gctx.lineTo(bxCur + bw, HIT_Y);
  gctx.lineTo(bxB + bw,   yTail);
  gctx.lineTo(bxB,        yTail);
  gctx.closePath();
  gctx.clip();
  const shineMid = (HIT_Y + yTail) / 2;
  const shineH   = bodyLen * 0.28;
  const sg = gctx.createLinearGradient(0, shineMid - shineH * 0.5, 0, shineMid + shineH * 0.5);
  sg.addColorStop(0,   'rgba(255,255,255,0)');
  sg.addColorStop(0.5, `rgba(255,255,255,${(0.42 * pulse).toFixed(2)})`);
  sg.addColorStop(1,   'rgba(255,255,255,0)');
  gctx.fillStyle   = sg;
  gctx.globalAlpha = 0.95;
  const xSpan = Math.abs(bxCur - bxB);
  gctx.fillRect(Math.min(bxCur, bxB) - 2, shineMid - shineH * 0.5, bw + xSpan + 4, shineH);
  gctx.restore();

  // ── Chevron arrows pointing toward lane B ─────────────────────────────────
  gctx.save();
  gctx.beginPath();
  gctx.moveTo(bxCur,      HIT_Y);
  gctx.lineTo(bxCur + bw, HIT_Y);
  gctx.lineTo(bxB + bw,   yTail);
  gctx.lineTo(bxB,        yTail);
  gctx.closePath();
  gctx.clip();
  gctx.globalAlpha = 0.75;
  gctx.strokeStyle = 'rgba(255,255,255,0.65)';
  gctx.lineWidth   = 2;
  gctx.lineJoin    = 'round';
  const chSz = 8, chStep = 18;
  for (let y = yTail + chStep * 0.6; y < HIT_Y - chStep * 0.3; y += chStep) {
    const cx = bodyX(y) + bw / 2;
    gctx.beginPath();
    gctx.moveTo(cx - chSz * dir, y - chSz * 0.5);
    gctx.lineTo(cx + chSz * dir, y);
    gctx.lineTo(cx - chSz * dir, y + chSz * 0.5);
    gctx.stroke();
  }
  gctx.restore();

  // ── Glowing outline ───────────────────────────────────────────────────────
  gctx.globalAlpha = 0.9;
  gctx.shadowBlur  = Math.round(14 * pulse); gctx.shadowColor = colCur;
  gctx.strokeStyle = withAlpha(colCur, 'cc');
  gctx.lineWidth   = 2;
  gctx.beginPath();
  gctx.moveTo(bxCur,      HIT_Y);
  gctx.lineTo(bxCur + bw, HIT_Y);
  gctx.lineTo(bxB + bw,   yTail);
  gctx.lineTo(bxB,        yTail);
  gctx.closePath();
  gctx.stroke();
  gctx.shadowBlur = 0;

  // ── Tail endcap (PJSK gloss pill in lane B) ───────────────────────────────
  gctx.globalAlpha = 0.95;
  gctx.shadowBlur  = 24; gctx.shadowColor = colB;
  gctx.fillStyle   = withAlpha(colB, 'cc');
  gctx.beginPath(); gctx.roundRect(bxB - 3, yTail - 7, bw + 6, 14, 7); gctx.fill();
  gctx.shadowBlur  = 0;
  gctx.fillStyle   = 'rgba(255,255,255,0.60)';
  gctx.beginPath(); gctx.roundRect(bxB + 1, yTail - 5, bw - 2, 5, [4, 4, 0, 0]); gctx.fill();

  // ── Sliding hold indicator (glowing bar at HIT_Y showing current lane) ────
  gctx.shadowBlur  = Math.round(20 * pulse); gctx.shadowColor = colCur;
  gctx.fillStyle   = colCur; gctx.globalAlpha = 0.95;
  gctx.beginPath(); gctx.roundRect(bxCur - 3, HIT_Y - 7, bw + 6, 14, 7); gctx.fill();
  gctx.shadowBlur  = 0;
  gctx.fillStyle   = 'rgba(255,255,255,0.70)';
  gctx.beginPath(); gctx.roundRect(bxCur + 2, HIT_Y - 5, bw - 4, 5, [3, 3, 0, 0]); gctx.fill();

  gctx.globalAlpha = 1; gctx.shadowBlur = 0;
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function drawNotes(t) {
  for (let i = 0; i < notes.length; i++) {
    const state = noteStates[i];
    const n     = notes[i];
    const lx    = LANE_X[n.lane];
    const col   = LANE_COLORS[n.lane];
    const dur   = n.duration || 0;

    // Bug 2 fix: draw recently-hit (state 1) notes with fade
    if (state === 1) {
      const hitAge = noteHitTime[i] >= 0 ? gameTime - noteHitTime[i] : Infinity;
      if (hitAge < 0.15) {
        const alpha = (1 - hitAge / 0.15) * 0.7;
        const yHead = HIT_Y;
        drawTapNote(lx, yHead, col, alpha, 0, n.lane);
      }
      continue;
    }

    // Draw missed notes grayed out, continuing to fall
    if (state === 2) {
      const cullTime = dur > 0 ? (n.time + dur) : n.time;
      if (cullTime - t < -APPROACH * 0.5) continue;
      const tta = n.time - t;
      const yHead = HIT_Y - (tta / APPROACH) * (HIT_Y - LANE_TOP);
      const missCol = getMissNoteColor(currentSkin, n.lane);
      const missAlpha = 0.45;
      if (dur > 0) {
        const ttaTail = (n.time + dur) - t;
        const yTail = ttaTail > APPROACH
          ? LANE_TOP
          : HIT_Y - (ttaTail / APPROACH) * (HIT_Y - LANE_TOP);
        drawHoldNote(lx, yHead, Math.max(LANE_TOP, yTail), missCol, missAlpha, 0, n, t, true);
      } else {
        drawTapNote(lx, yHead, missCol, missAlpha, 0, n.lane, true);
      }
      continue;
    }

    // Skip other non-pending states
    if (state !== 0 && state !== 3) continue;

    // Active hold
    if (state === 3) {
      const ttaTail = (n.time + dur) - t;
      if (ttaTail <= 0) continue;
      const yTail = HIT_Y - (ttaTail / APPROACH) * (HIT_Y - LANE_TOP);
      if (n.glide !== undefined) {
        drawActiveGlideNote(n, i, t, Math.min(yTail, HIT_Y - 2));
      } else {
        drawActiveHold(lx, Math.min(yTail, HIT_Y - 2), col, i, t);
      }
      continue;
    }

    // Pending
    const tta = n.time - t;
    if (tta > APPROACH) continue;
    if (dur === 0 && tta < -W_OK) continue;

    const yHead    = HIT_Y - (tta / APPROACH) * (HIT_Y - LANE_TOP);
    const approach = 1 - Math.max(0, tta) / APPROACH;
    const alpha    = 0.5 + 0.5 * approach;
    const maxGlow = currentSkin.noteApproachGlow ?? 22;
    const glow     = approach > 0.6 ? ((approach - 0.6) / 0.4) * maxGlow : 0;

    if (dur > 0) {
      const ttaTail = (n.time + dur) - t;
      const yTail   = ttaTail > APPROACH
        ? LANE_TOP
        : HIT_Y - (ttaTail / APPROACH) * (HIT_Y - LANE_TOP);
      if (n.glide !== undefined) {
        drawGlideNote(n, t, yHead, Math.max(LANE_TOP, yTail), alpha, glow);
      } else {
        drawHoldNote(lx, yHead, Math.max(LANE_TOP, yTail), col, alpha, glow, n, t);
      }
    } else {
      drawTapNote(lx, yHead, col, alpha, glow, n.lane);
    }
  }
}

// ── Hit burst ─────────────────────────────────────────────────────────────────
function drawHitEffects() {
  if (currentSkin.hitBurstEnabled === false) return;
  const burstMul = currentSkin.hitBurstIntensity ?? 1.0;
  for (let l = 0; l < LANE_COUNT; l++) {
    if (hitFlashes[l] === null) continue;
    const lx  = LANE_X[l];
    const col = LANE_COLORS[l];
    const R = LANE_RESOLVED[l];
    const _burstCol = (currentSkin.hitBurstColors && currentSkin.hitBurstColors[l]) ? R.hitBurstColor : col;
    const f   = hitFlashes[l] / 20;
    const bH  = (30 + (1 - f) * 80) * burstMul;
    const b   = gctx.createLinearGradient(0, HIT_Y - bH, 0, HIT_Y);
    b.addColorStop(0, withAlpha(_burstCol, '00'));
    b.addColorStop(1, _burstCol);
    gctx.fillStyle   = b;
    gctx.globalAlpha = f * 0.55;
    gctx.fillRect(lx + 3, HIT_Y - bH, LANE_W - 6, bH + 4);
    gctx.globalAlpha = 1;
  }
}

// ── Key indicators ────────────────────────────────────────────────────────────
function drawKeyIndicators() {
  const fontSize = Math.max(14, Math.min(32, Math.floor(LANE_W * 0.22)));
  const kbMode = currentSkin.keyBoxMode || 'solid';
  for (let l = 0; l < LANE_COUNT; l++) {
    const lx      = LANE_X[l];
    const col     = LANE_COLORS[l];
    const pressed = !paused && pressedLanes.has(l);
    const rawKey  = LANE_KEYS[l] || '?';
    const label   = displayKeyName(rawKey);

    const R = LANE_RESOLVED[l];
    // Key box background
    const _hasKbBgOvr = currentSkin.keyBoxBgColors && currentSkin.keyBoxBgColors[l];
    if (pressed) {
      gctx.fillStyle = withAlpha(col, 'cc');
    } else if (kbMode === 'dark') {
      gctx.fillStyle = darkenHex(_hasKbBgOvr ? R.keyBoxBgColor : col, 0.15);
    } else if (kbMode === 'tinted') {
      gctx.fillStyle = _hasKbBgOvr ? R.keyBoxBgColor : (currentSkin.keyBoxColor || '#0c0c18');
      gctx.fillRect(lx, KEYS_Y, LANE_W, KEYS_H);
      gctx.fillStyle = withAlpha(col, '20');
    } else {
      gctx.fillStyle = _hasKbBgOvr ? R.keyBoxBgColor : (currentSkin.keyBoxColor || '#0c0c18');
    }
    gctx.fillRect(lx, KEYS_Y, LANE_W, KEYS_H);

    // Key box border
    const _bdrCol = (currentSkin.keyBoxBorderColors && currentSkin.keyBoxBorderColors[l]) ? R.keyBoxBorderColor : col;
    if (pressed) { gctx.shadowBlur = 14; gctx.shadowColor = _bdrCol; }
    gctx.strokeStyle = pressed ? _bdrCol : withAlpha(_bdrCol, '55');
    gctx.lineWidth   = pressed ? 2.5 : 1;
    gctx.strokeRect(lx + 1, KEYS_Y + 1, LANE_W - 2, KEYS_H - 2);
    gctx.shadowBlur = 0;

    // Key text
    const _txtCol = (currentSkin.keyBoxTextColors && currentSkin.keyBoxTextColors[l]) ? R.keyBoxTextColor : col;
    gctx.fillStyle    = pressed ? darkenHex(_tc.bg, 0.5) : _txtCol;
    gctx.font         = skinFont(fontSize, true);
    gctx.textAlign    = 'center';
    gctx.textBaseline = 'middle';
    gctx.fillText(label, lx + LANE_W / 2, KEYS_Y + KEYS_H / 2);
  }
  gctx.textAlign    = 'start';
  gctx.textBaseline = 'alphabetic';
}

// ── Floating judgment pops ────────────────────────────────────────────────────
function drawJudgmentPops() {
  for (const p of judgePops) {
    const alpha = p.timer / p.maxTimer;
    gctx.globalAlpha  = alpha;
    gctx.fillStyle    = p.color;
    gctx.font         = skinFont(p.size, true);
    gctx.textAlign    = 'center';
    gctx.textBaseline = 'alphabetic';
    gctx.fillText(p.msg, p.x, p.y);

    // EARLY / LATE sub-label
    if (p.earlyLate) {
      gctx.globalAlpha = alpha * 0.8;
      gctx.fillStyle   = p.earlyLate.isEarly ? (currentSkin.earlyColor || '#ffa060') : (currentSkin.lateColor || '#60a0ff');
      gctx.font        = skinFont(11, true);
      gctx.fillText(p.earlyLate.text, p.x, p.y + 15);
    }
  }
  gctx.globalAlpha  = 1;
  gctx.textAlign    = 'start';
  gctx.textBaseline = 'alphabetic';
}

// ── Milestone combo pop ───────────────────────────────────────────────────────
function drawMilestonePop() {
  if (!milestonePop) return;
  const ratio = milestonePop.timer / milestonePop.maxTimer;
  const alpha = ratio > 0.7 ? 1 : ratio / 0.7;
  const scale = 1 + Math.sin((1 - ratio) * Math.PI) * 0.22;
  const sz    = Math.round(38 * scale);
  gctx.save();
  gctx.globalAlpha  = alpha;
  gctx.fillStyle    = milestonePop.color || currentSkin.fcColor || '#ffd040';
  gctx.font         = skinFont(sz, true);
  gctx.textAlign    = 'center';
  gctx.textBaseline = 'middle';
  gctx.shadowBlur   = 28 * ratio;
  gctx.shadowColor  = milestonePop.color || currentSkin.fcColor || '#ffd040';
  gctx.fillText(milestonePop.text, CANVAS_W / 2, CANVAS_H * 0.36);
  gctx.restore();
}

// ── Input ─────────────────────────────────────────────────────────────────────
function _resolveKeyLane(e) {
  // Check e.key first, then e.code for modifier keys (left/right differentiation)
  let lane = KEY_LANE[e.key];
  if (lane === undefined) lane = KEY_LANE[e.code];
  return lane;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (paused) resumeGame();
    else if (playing && !ended) pauseGame();
    return;
  }
  const lane = _resolveKeyLane(e);
  if (lane === undefined) return;
  if (pressedLanes.has(lane)) return;
  pressedLanes.add(lane);
  if (playing && !paused) handleHit(lane);
});

document.addEventListener('keyup', e => {
  const lane = _resolveKeyLane(e);
  if (lane !== undefined) pressedLanes.delete(lane);
});

// ── Hit handling ──────────────────────────────────────────────────────────────
function handleHit(lane) {
  // Search from laneNextPending[lane] with early exit (notes are sorted by time)
  let bestIdx = -1, bestDist = Infinity;
  let nearMissIdx = -1, nearMissDist = Infinity;

  // Advance past resolved notes in this lane
  while (laneNextPending[lane] < notes.length &&
         (noteStates[laneNextPending[lane]] !== 0 || notes[laneNextPending[lane]].lane !== lane)) {
    laneNextPending[lane]++;
  }

  for (let i = laneNextPending[lane]; i < notes.length; i++) {
    if (noteStates[i] !== 0) continue;
    if (notes[i].lane !== lane) continue;
    const dist = Math.abs(notes[i].time - (gameTime + OFFSET_SEC));
    if (notes[i].time - (gameTime + OFFSET_SEC) > W_NEARMISS) break; // sorted, done
    if (dist < W_OK && dist < bestDist) { bestIdx = i; bestDist = dist; }
    else if (dist >= W_OK && dist < W_NEARMISS && dist < nearMissDist) {
      nearMissIdx = i; nearMissDist = dist;
    }
  }

  // Near-miss within W_NEARMISS but outside W_OK → register as MISS
  // Only consume notes that are already past the hit zone (player pressed too late),
  // NOT notes still approaching (player pressed too early would destroy future notes)
  if (bestIdx === -1) {
    if (nearMissIdx !== -1) {
      const noteTime = notes[nearMissIdx].time;
      if (gameTime + OFFSET_SEC > noteTime) {
        noteStates[nearMissIdx] = 2;
        registerMiss(lane);
      }
    }
    return;
  }

  const timeDiff = notes[bestIdx].time - (gameTime + OFFSET_SEC);
  let earlyLate = null;
  if (currentSkin.showEarlyLate !== false && Math.abs(timeDiff) > 0.02) {
    const isEarly = timeDiff > 0;
    earlyLate = {
      text: isEarly ? (currentSkin.earlyText || 'EARLY') : (currentSkin.lateText || 'LATE'),
      isEarly,
    };
  }

  const isHold = notes[bestIdx].duration > 0;
  noteStates[bestIdx] = isHold ? 3 : 1;
  noteHitTime[bestIdx] = gameTime;

  combo++;
  maxCombo = Math.max(maxCombo, combo);
  hitFlashes[lane] = 20;
  playHitsound(lane, notes[bestIdx]);

  const comboMult = Math.min(1 + combo * 0.003, 1.15);
  // Hold head worth HOLD_HEAD_WEIGHT×base, tap worth 1.0×base
  const headVal   = isHold ? baseNoteVal * HOLD_HEAD_WEIGHT : baseNoteVal;

  if (bestDist <= W_PERFECT) {
    score += headVal * comboMult;
    judgments.perfect++;
    health = Math.min(100, health + 1.0 * HP_REGEN_MULT);
    spawnPop(currentSkin.perfectText || 'PERFECT', currentSkin.perfectColor || '#ffd040', Math.round(22 * (currentSkin.judgeSizeMultiplier ?? 1.0)), lane, earlyLate);
    hitRings.push({ lane, timer: 28, maxTimer: 28 });
  } else if (bestDist <= W_GOOD) {
    score += headVal * SCORE_MULT_GOOD * comboMult;
    judgments.good++;
    health = Math.min(100, health + 0.5 * HP_REGEN_MULT);
    spawnPop(currentSkin.goodText || 'GOOD', currentSkin.goodColor || '#60ff90', Math.round(19 * (currentSkin.judgeSizeMultiplier ?? 1.0)), lane, earlyLate);
  } else {
    score += headVal * SCORE_MULT_OK * comboMult;
    judgments.ok++;
    health = Math.min(100, health + 0.15 * HP_REGEN_MULT);
    spawnPop(currentSkin.okText || 'OK', currentSkin.okColor || '#40c4ff', Math.round(17 * (currentSkin.judgeSizeMultiplier ?? 1.0)), lane, earlyLate);
  }

  checkMilestone();
}

function checkMilestone() {
  if (!MILESTONES.has(combo)) return;
  const ms = (currentSkin.milestones || []).find(m => m.combo === combo);
  milestonePop = {
    text:     (ms && ms.text ? ms.text : '{n} COMBO!!').replace('{n}', combo),
    color:    (ms && ms.color) || '#ffd040',
    timer:    90,
    maxTimer: 90,
  };
}

function registerMiss(lane) {
  judgments.miss++;
  combo         = 0;
  hasFullCombo  = false;
  health        = Math.max(0, health - HP_MISS_DAMAGE * HP_DMG_MULT);
  if (lane >= 0 && lane < LANE_COUNT) missFlashes[lane] = 14;
  spawnPop(currentSkin.missText || 'MISS', currentSkin.missColor || '#ff4060', Math.round(17 * (currentSkin.judgeSizeMultiplier ?? 1.0)), lane, null);
}

function spawnPop(msg, color, size, lane, earlyLate) {
  const laneIdx = Math.max(0, Math.min(lane, LANE_COUNT - 1));
  judgePops.push({
    msg, color, size, earlyLate,
    x:        LANE_X[laneIdx] + LANE_W / 2,
    y:        HIT_Y - 28,
    timer:    38,
    maxTimer: 38,
  });
}

// ── End game ──────────────────────────────────────────────────────────────────
// ── FX Canvas (Full Combo / Perfect Clear animations) ─────────────────────────
const fxCanvas = document.getElementById('fxCanvas');
const fxctx    = fxCanvas ? fxCanvas.getContext('2d') : null;
let fxAnim     = null;
let pcParticles = [];

function startFxAnim(type, onComplete) {
  if (!fxCanvas || !fxctx) { if (onComplete) onComplete(); return; }
  fxCanvas.width  = window.innerWidth;
  fxCanvas.height = window.innerHeight;
  fxCanvas.style.display = 'block';
  pcParticles = [];
  const maxTimer = type === 'PC' ? 240 : 180;
  if (type === 'PC') {
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4;
      pcParticles.push({
        x: fxCanvas.width / 2, y: fxCanvas.height / 2,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1,
        hue: Math.random() * 360, size: 2 + Math.random() * 4,
        life: 1.0, decay: 0.005 + Math.random() * 0.008,
      });
    }
  }
  fxAnim = { type, timer: 0, maxTimer, onComplete: onComplete || null };
  requestAnimationFrame(_tickFx);
}

function _tickFx() {
  if (!fxAnim) { if (fxCanvas) fxCanvas.style.display = 'none'; return; }
  fxctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  // Dark backdrop so FX shows on its own
  fxctx.fillStyle = 'rgba(6,6,14,0.85)';
  fxctx.fillRect(0, 0, fxCanvas.width, fxCanvas.height);
  const t = fxAnim.timer / fxAnim.maxTimer;
  fxAnim.timer++;
  const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;

  if (fxAnim.type === 'FC') _drawFcAnim(t, alpha);
  else _drawPcAnim(t, alpha);

  if (fxAnim.timer >= fxAnim.maxTimer) {
    const cb = fxAnim.onComplete;
    fxAnim = null;
    fxCanvas.style.display = 'none';
    if (cb) cb();
    return;
  }
  requestAnimationFrame(_tickFx);
}

function _drawFcAnim(t, alpha) {
  const cx = fxCanvas.width / 2, cy = fxCanvas.height * 0.38;
  let scale;
  if (t < 0.12) scale = (t / 0.12) * (t / 0.12);
  else if (t < 0.2) scale = 1 + (1 - (t - 0.12) / 0.08) * 0.15;
  else scale = 1.0;

  const fcCol = currentSkin.fcColor || '#ffd040';
  const fr = parseInt(fcCol.slice(1,3),16), fg = parseInt(fcCol.slice(3,5),16), fb = parseInt(fcCol.slice(5,7),16);

  fxctx.save();
  fxctx.globalAlpha = alpha;
  fxctx.translate(cx, cy);
  fxctx.scale(scale, scale);
  const sz = Math.min(fxCanvas.width * 0.065, 54);
  fxctx.font = skinFont(sz, true);
  fxctx.textAlign = 'center';
  fxctx.textBaseline = 'middle';
  fxctx.shadowBlur = 40; fxctx.shadowColor = fcCol;
  fxctx.fillStyle = fcCol;
  fxctx.fillText('★ FULL COMBO ★', 0, 0);
  fxctx.shadowBlur = 0;
  fxctx.font = skinFont(Math.round(sz * 0.4), true);
  fxctx.fillStyle = `rgba(${fr},${fg},${fb},0.6)`;
  fxctx.fillText('NO MISSES', 0, sz * 0.85);
  fxctx.restore();
}

function _drawPcAnim(t, alpha) {
  const cx = fxCanvas.width / 2, cy = fxCanvas.height * 0.38;
  const pcSat = currentSkin.pcSaturation ?? 100;

  // Particles
  for (const p of pcParticles) {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.03;
    p.life = Math.max(0, p.life - p.decay);
    p.hue = (p.hue + 2) % 360;
    if (p.life <= 0) continue;
    fxctx.save();
    fxctx.globalAlpha = alpha * p.life;
    fxctx.fillStyle = `hsl(${p.hue},${pcSat}%,65%)`;
    fxctx.shadowBlur = 6; fxctx.shadowColor = `hsl(${p.hue},${pcSat}%,65%)`;
    fxctx.translate(p.x, p.y);
    fxctx.rotate(p.hue * 0.05);
    fxctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const a2 = a1 + (2 * Math.PI) / 10;
      if (i === 0) fxctx.moveTo(Math.cos(a1) * p.size, Math.sin(a1) * p.size);
      else fxctx.lineTo(Math.cos(a1) * p.size, Math.sin(a1) * p.size);
      fxctx.lineTo(Math.cos(a2) * p.size * 0.4, Math.sin(a2) * p.size * 0.4);
    }
    fxctx.closePath(); fxctx.fill();
    fxctx.restore();
  }

  // Rainbow text
  const scale = t < 0.1 ? t / 0.1 : 1 + Math.sin(t * Math.PI * 6) * 0.015;
  const sz = Math.min(fxCanvas.width * 0.06, 50);
  fxctx.save();
  fxctx.globalAlpha = alpha;
  fxctx.translate(cx, cy);
  fxctx.scale(scale, scale);
  const hueShift = (t * 720) % 360;
  const grad = fxctx.createLinearGradient(-200, 0, 200, 0);
  for (let i = 0; i <= 6; i++)
    grad.addColorStop(i / 6, `hsl(${(hueShift + i * 60) % 360},${pcSat}%,65%)`);
  fxctx.font = skinFont(sz, true);
  fxctx.textAlign = 'center'; fxctx.textBaseline = 'middle';
  fxctx.shadowBlur = 24; fxctx.shadowColor = `hsl(${hueShift},${pcSat}%,65%)`;
  fxctx.fillStyle = grad;
  fxctx.fillText('✦ PERFECT CLEAR ✦', 0, 0);
  fxctx.shadowBlur = 0;
  fxctx.font = skinFont(Math.round(sz * 0.38), true);
  fxctx.fillStyle = 'rgba(255,255,255,0.7)';
  fxctx.fillText('ALL PERFECT', 0, sz * 0.85);
  fxctx.restore();
}

// ── Scoring ───────────────────────────────────────────────────────────────────
function calcAcc() {
  const total = judgments.perfect + judgments.good + judgments.ok + judgments.miss;
  return total
    ? ((judgments.perfect * 100 + judgments.good * 50 + judgments.ok * 25) / total).toFixed(1)
    : '100.0';
}

function getRankColors() {
  const tc = getThemeColors();
  return { SSS: null, SS: null, S: tc.yellow, A: tc.green,
           B: tc.cyan, C: tc['text-dim'], D: darkenHex(tc['text-dim'], 0.7), F: null };
}
function calcRank(acc, isPerfectClear) {
  if (isPerfectClear) return 'SSS';
  const a = parseFloat(acc);
  if (a >= 97.5) return 'SS';
  if (a >= 95) return 'S';
  if (a >= 90) return 'A';
  if (a >= 80) return 'B';
  if (a >= 70) return 'C';
  return 'D';
}

async function endGame(win) {
  playing = false;
  ended   = true;
  pressedLanes.clear();
  hitFlashes   = Array(LANE_COUNT).fill(null);
  missFlashes  = Array(LANE_COUNT).fill(null);
  milestonePop = null;
  if (audioSrc && !silentMode) { audioSrc.onended = null; try { audioSrc.stop(); } catch (_) {} }
  if (song) updateLastPlayed(song.id).catch(() => {});

  const acc  = calcAcc();
  const isFC = win && hasFullCombo && judgments.miss === 0;
  const isPerfectClear = isFC && judgments.good === 0 && judgments.ok === 0;
  const rank = win ? calcRank(acc, isPerfectClear) : 'F';

  const _sid     = song ? song.id : songId;
  const prevBest = getHighScore(_sid);
  const isRanked = !PRACTICE_MODE && PRACTICE_SPEED === 1.0;
  if (isRanked && win) {
    setHighScore(_sid, { score: Math.round(score), maxCombo, accuracy: parseFloat(acc) });
  }
  const isNewBest = isRanked && win && (!prevBest || Math.round(score) > prevBest.score);

  document.getElementById('resultTitle').textContent = win ? 'CLEAR' : 'FAILED';
  document.getElementById('resultTitle').className   = 'overlay-title ' + (win ? 'win' : 'fail');
  document.getElementById('resultSong').textContent  = song.title + (song.artist ? ' — ' + song.artist : '');
  document.getElementById('rScore').textContent      = Math.round(score).toLocaleString();
  document.getElementById('rCombo').textContent      = maxCombo;
  document.getElementById('rPerfect').textContent    = judgments.perfect;
  document.getElementById('rGood').textContent       = judgments.good;
  document.getElementById('rOk').textContent         = judgments.ok;
  document.getElementById('rMiss').textContent       = judgments.miss;
  document.getElementById('rAcc').textContent        = acc + '%';
  document.getElementById('rRank').textContent       = rank;

  const rRankEl = document.getElementById('rRank');
  rRankEl.classList.remove('rank-sss', 'rank-ss', 'rank-f');
  rRankEl.style.color = '';
  if (rank === 'SSS') {
    rRankEl.classList.add('rank-sss');
  } else if (rank === 'SS') {
    rRankEl.classList.add('rank-ss');
  } else if (rank === 'F') {
    const fCol = currentSkin.missColor || '#ff4060';
    rRankEl.style.color = fCol;
    rRankEl.style.textShadow = `0 0 10px ${fCol}88, 0 0 24px ${fCol}40`;
  } else {
    rRankEl.style.color = getRankColors()[rank] || '';
  }

  if (rFullCombo) {
    rFullCombo.style.display = isFC ? 'block' : 'none';
  }
  const rPC = document.getElementById('rPerfectClear');
  if (rPC) rPC.style.display = isPerfectClear ? 'block' : 'none';

  if (isNewBest && win) newBestMsg.style.display = 'block';
  else newBestMsg.style.display = 'none';

  const unrankedMsg = document.getElementById('unrankedMsg');
  if (unrankedMsg) unrankedMsg.style.display = isRanked ? 'none' : 'block';

  // Show FC/PC animation first, then reveal result screen after it finishes
  const fxType = isPerfectClear ? 'PC' : isFC ? 'FC' : null;

  const _showResult = async () => {
    // Playlist next-song
    const plNextEl = document.getElementById('playlistNext');
    if (plNextEl) {
      const nextIdx = playlistIdx + 1;
      if (win && playlist && nextIdx < playlist.songIds.length) {
        const nextSong = await getSong(playlist.songIds[nextIdx]);
        document.getElementById('plNextTitle').textContent = nextSong ? nextSong.title : '(unknown)';
        document.getElementById('plNextCountdown').textContent = '5';
        plNextEl.style.display = 'block';

        let countdown = 5;
        const cdTick = setInterval(() => {
          countdown--;
          const el = document.getElementById('plNextCountdown');
          if (el) el.textContent = countdown;
          if (countdown <= 0) {
            clearInterval(cdTick);
            window.location.href = `game.html?playlistId=${playlistId}&playlistIdx=${nextIdx}`;
          }
        }, 1000);

        document.getElementById('btnPlNext').onclick = () => {
          clearInterval(cdTick);
          window.location.href = `game.html?playlistId=${playlistId}&playlistIdx=${nextIdx}`;
        };
        document.getElementById('btnPlStop').onclick = () => {
          clearInterval(cdTick);
          plNextEl.style.display = 'none';
        };
      } else {
        plNextEl.style.display = 'none';
      }
    }

    resultPanel.load();
    overlayResult.classList.remove('hidden');
  };

  if (fxType) {
    setTimeout(() => startFxAnim(fxType, _showResult), 500);
  } else {
    _showResult();
  }
}

function retryGame() {
  overlayResult.classList.add('hidden');
  newBestMsg.style.display = 'none';
  if (rFullCombo) rFullCombo.style.display = 'none';
  const rPC = document.getElementById('rPerfectClear');
  if (rPC) rPC.style.display = 'none';
  const rRankEl = document.getElementById('rRank');
  if (rRankEl) rRankEl.classList.remove('rank-sss', 'rank-ss', 'rank-f');
  const plNext = document.getElementById('playlistNext');
  if (plNext) plNext.style.display = 'none';
  // Stop any running FX animation
  fxAnim = null;
  if (fxCanvas) fxCanvas.style.display = 'none';
  // Clean up previous audio source to prevent stale onended callbacks
  if (audioSrc && !silentMode) { audioSrc.onended = null; try { audioSrc.stop(); } catch (_) {} }
  resetState();
  startCountdown();
}
