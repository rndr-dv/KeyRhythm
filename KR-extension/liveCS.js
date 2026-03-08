// liveCS.js — KeyRhythm Live Overlay (v3: game.js visual parity)
if (!window._krLiveLoaded) {
  window._krLiveLoaded = true;

  if (!window._krSrcNodes) window._krSrcNodes = [];

  // Duplicated from skins.js — content scripts cannot share module imports
  const DEFAULT_LANE_COLORS = ['#c060ff','#40c4ff','#60ff90','#ff8040','#ff4080','#ffd040','#80ff40'];

  function _darkenHexCS(hex, factor) {
    var rm = hex.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([^)]+)\)/);
    if (rm) {
      return 'rgba(' + [rm[1], rm[2], rm[3]].map(function(v) {
        return Math.max(0, Math.round(+v * factor));
      }).join(', ') + ', ' + rm[4].trim() + ')';
    }
    const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
    if (!m) return '#06060e';
    return '#' + [m[1], m[2], m[3]].map(c =>
      Math.max(0, Math.round(parseInt(c, 16) * factor)).toString(16).padStart(2, '0')
    ).join('');
  }

  function _alphaHexCS(a) {
    return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
  }

  function _withAlphaCS(color, hexA) {
    if (/^#[0-9a-f]{6}$/i.test(color)) return color + hexA;
    var rm = color.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([^)]+))?\)/);
    if (rm) {
      var ea = rm[4] !== undefined ? parseFloat(rm[4]) : 1;
      var na = Math.round(ea * (parseInt(hexA, 16) / 255) * 100) / 100;
      return 'rgba(' + rm[1] + ', ' + rm[2] + ', ' + rm[3] + ', ' + na + ')';
    }
    return color + hexA;
  }

  let _overlay = null;

  // Clean up on page navigation (SPA or full reload)
  window.addEventListener('beforeunload', () => {
    if (_overlay) { _overlay.stop(); _overlay = null; }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      if (msg.type === 'LIVE_START') {
        if (_overlay) _overlay.stop();
        _overlay = new KeyRhythmOverlay(msg.config);
        _overlay.start();
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'LIVE_STOP' || msg.type === 'TOGGLE_OFF') {
        if (_overlay) { _overlay.stop(); _overlay = null; }
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'LIVE_QUERY') {
        sendResponse({ active: !!_overlay, mode: _overlay?.cfg?.mode || null });
        return false;
      }
    } catch (e) {
      // Extension context may be invalidated after update/reload
      console.warn('[KR Live] Message handler error:', e);
    }
  });

  // ── Autocorrelation pitch detection ──────────────────────────────────────────
  let _acBuf = null; // reused autocorrelation buffer to avoid GC pressure
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

  // ── Overlay ───────────────────────────────────────────────────────────────────
  class KeyRhythmOverlay {
    constructor(config) {
      this.cfg = {
        mode:             'AUTO',
        laneCount:        3,
        keybinds:         ['[', ']', '\\'],
        scrollSpeed:      1.0,
        laneColors:       null,
        hitWindowMs:      150,
        noteDelay:        250,
        noteLength:       120,
        holdThresholdMs:  100,
        clarityThreshold: 0.1,  // lower default for typical music
        volumeThreshold:  0.02,
        chordRate:        0.15, // fraction of notes that become chords
        delayLength:      1000,
        allowMerging:     true,
        sampleDelay:      100,
        gutterLength:     250,
        exitKey:          'Escape',
        pauseKey:         ' ',
        horizontalMode:   false,
        strictRelease:    false,
        ...config,
      };

      const N = this.cfg.laneCount;
      this.colors = ((this.cfg.laneColors && this.cfg.laneColors.length >= N)
        ? this.cfg.laneColors : DEFAULT_LANE_COLORS).slice(0, N);

      // Skin properties (merged from config.skin with safe defaults)
      const sk = this.cfg.skin || {};
      this.skin = {
        noteShape:       sk.noteShape       || 'rounded',
        noteGlow:        sk.noteGlow        !== undefined ? sk.noteGlow        : 12,
        bgColor:         sk.bgColor         || '#0e0e1c',
        hitLineColor:    sk.hitLineColor    || '#ffffff',
        hitLineWidth:    sk.hitLineWidth    !== undefined ? sk.hitLineWidth    : 2,
        keyBoxColor:     sk.keyBoxColor     || '#0c0c18',
        comboColor:      sk.comboColor      || '#ffffff',
        comboEnabled:    sk.comboEnabled    !== undefined ? sk.comboEnabled    : true,
        comboText:       sk.comboText       || '{n} COMBO',
        noteIcon:        sk.noteIcon        || '',
        noteHeight:      sk.noteHeight      || 1.0,
        holdBodyWidth:   sk.holdBodyWidth   !== undefined ? sk.holdBodyWidth : 0.44,
        perfectColor:    sk.perfectColor    || '#ffd040',
        goodColor:       sk.goodColor       || '#60ff90',
        okColor:         sk.okColor         || '#40c4ff',
        missColor:       sk.missColor       || '#ff4060',
        scoreColor:      sk.scoreColor      || '#ffffff',
        judgeSizeMultiplier: sk.judgeSizeMultiplier ?? 1.0,
        missFlashColor:     sk.missFlashColor     || '#ff3c50',
        missNoteMode:       sk.missNoteMode       || 'darken',
        missNoteColors:     sk.missNoteColors     || ['#666666','#666666','#666666','#666666','#666666','#666666','#666666'],
        missNoteFlatColor:  sk.missNoteFlatColor  || '#666666',
        missNoteDarken:     sk.missNoteDarken     ?? 0.35,
        laneGradientMode:   sk.laneGradientMode   || 'fade',
        hitZoneStyle:       sk.hitZoneStyle        || 'glow',
        songInfoColor:      sk.songInfoColor       || '#383860',
        hitBurstEnabled:    sk.hitBurstEnabled     !== undefined ? sk.hitBurstEnabled    : true,
        hitRingEnabled:     sk.hitRingEnabled      !== undefined ? sk.hitRingEnabled     : true,
        hitBurstIntensity:  sk.hitBurstIntensity   ?? 1.0,
        hitFlashIntensity:  sk.hitFlashIntensity   ?? 1.0,
        noteApproachGlow:   sk.noteApproachGlow    ?? 22,
        noteShine:          sk.noteShine           ?? 0.30,
        holdTickMarks:      sk.holdTickMarks       !== undefined ? sk.holdTickMarks       : true,
        holdBorderWidth:    sk.holdBorderWidth     ?? 1,
        tailCapStyle:       sk.tailCapStyle        || 'rounded',
        tailCapWidth:       sk.tailCapWidth        !== undefined ? sk.tailCapWidth  : 1.0,
        tailCapHeight:      sk.tailCapHeight       !== undefined ? sk.tailCapHeight : 1.0,
        keyBoxMode:         sk.keyBoxMode          || 'solid',
        noteIconScale:      sk.noteIconScale       !== undefined ? sk.noteIconScale : 1.0,
        noteIconOffsetY:    sk.noteIconOffsetY     || 0,
        holdStripes:        sk.holdStripes         !== undefined ? sk.holdStripes   : true,
        noteBorderWidth:    sk.noteBorderWidth     || 0,
        noteBorderColors:   sk.noteBorderColors    || ['#c060ff','#40c4ff','#60ff90','#ff8040','#ff4080','#ffd040','#80ff40'],
        fontFamily:         sk.fontFamily          || 'monospace',
        // Per-lane colors (supports rgba for embedded opacity)
        noteColors:            sk.noteColors            || [null,null,null,null,null,null,null],
        holdColors:            sk.holdColors            || [null,null,null,null,null,null,null],
        noteShineColors:       sk.noteShineColors       || [null,null,null,null,null,null,null],
        noteGlowColors:        sk.noteGlowColors        || [null,null,null,null,null,null,null],
        holdBodyColors:        sk.holdBodyColors         || [null,null,null,null,null,null,null],
        holdBorderColors:      sk.holdBorderColors       || [null,null,null,null,null,null,null],
        holdStripeColors:      sk.holdStripeColors       || [null,null,null,null,null,null,null],
        holdTailCapColors:     sk.holdTailCapColors      || [null,null,null,null,null,null,null],
        holdTickColors:        sk.holdTickColors         || [null,null,null,null,null,null,null],
        hitLineColors:         sk.hitLineColors          || [null,null,null,null,null,null,null],
        hitGlowColors:         sk.hitGlowColors          || [null,null,null,null,null,null,null],
        hitFlashColors:        sk.hitFlashColors         || [null,null,null,null,null,null,null],
        hitBurstColors:        sk.hitBurstColors         || [null,null,null,null,null,null,null],
        hitRingColors:         sk.hitRingColors          || [null,null,null,null,null,null,null],
        keyBoxBgColors:        sk.keyBoxBgColors         || [null,null,null,null,null,null,null],
        keyBoxBorderColors:    sk.keyBoxBorderColors     || [null,null,null,null,null,null,null],
        keyBoxTextColors:      sk.keyBoxTextColors       || [null,null,null,null,null,null,null],
        laneBorderColors:      sk.laneBorderColors       || [null,null,null,null,null,null,null],
        lanePressColors:       sk.lanePressColors        || [null,null,null,null,null,null,null],
        perfectText:        sk.perfectText         || '',
        goodText:           sk.goodText            || '',
        okText:             sk.okText              || '',
        missText:           sk.missText            || '',
        earlyText:          sk.earlyText           || '',
        lateText:           sk.lateText            || '',
        showEarlyLate:      sk.showEarlyLate       !== undefined ? sk.showEarlyLate : true,
        liveAccentColor:    sk.liveAccentColor     || '#c060ff',
        liveOpacity:        sk.liveOpacity         ?? 0.95,
        liveBorderRadius:   sk.liveBorderRadius    ?? 6,
      };

      // Build per-lane resolved colors/opacity (parse alpha from rgba strings)
      this._laneResolved = [];
      for (let i = 0; i < N; i++) {
        const lc = this.colors[i] || DEFAULT_LANE_COLORS[i] || '#ffffff';
        const _pca = (val) => {
          if (!val) return null;
          const m = val.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
          if (m) {
            const hex = '#' + [m[1], m[2], m[3]].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
            return { color: hex, alpha: m[4] != null ? parseFloat(m[4]) : 1.0 };
          }
          return { color: val, alpha: 1.0 };
        };
        const _sub = (arr, parentCol, parentOp) => {
          const p = _pca(arr && arr[i]);
          return p ? { color: p.color, opacity: p.alpha } : { color: parentCol, opacity: parentOp };
        };

        const noteParsed = _pca(this.skin.noteColors && this.skin.noteColors[i]);
        const noteColor   = noteParsed ? noteParsed.color : lc;
        const noteOpacity = noteParsed ? noteParsed.alpha : 1.0;
        const holdParsed = _pca(this.skin.holdColors && this.skin.holdColors[i]);
        const holdColor   = holdParsed ? holdParsed.color : noteColor;
        const holdOpacity = holdParsed ? holdParsed.alpha : noteOpacity;

        const border = _sub(this.skin.noteBorderColors, noteColor, noteOpacity);
        const shine  = _sub(this.skin.noteShineColors, '#ffffff', 1.0);
        const glow   = _sub(this.skin.noteGlowColors, noteColor, noteOpacity);
        const holdBody    = _sub(this.skin.holdBodyColors, holdColor, holdOpacity);
        const holdBorder  = _sub(this.skin.holdBorderColors, holdColor, holdOpacity);
        const holdStripe  = _sub(this.skin.holdStripeColors, holdColor, holdOpacity);
        const holdTailCap = _sub(this.skin.holdTailCapColors, holdColor, holdOpacity);
        const holdTick    = _sub(this.skin.holdTickColors, '#ffffff', 1.0);
        const hitLine  = _sub(this.skin.hitLineColors, lc, 1.0);
        const hitGlow  = _sub(this.skin.hitGlowColors, lc, 1.0);
        const hitFlash = _sub(this.skin.hitFlashColors, lc, 1.0);
        const hitBurst = _sub(this.skin.hitBurstColors, lc, 1.0);
        const hitRing  = _sub(this.skin.hitRingColors, lc, 1.0);
        const keyBg     = _sub(this.skin.keyBoxBgColors, this.skin.keyBoxColor || '#0c0c18', 1.0);
        const keyBorder = _sub(this.skin.keyBoxBorderColors, lc, 1.0);
        const keyText   = _sub(this.skin.keyBoxTextColors, lc, 1.0);
        const laneBorder = _sub(this.skin.laneBorderColors, lc, 1.0);
        const lanePress  = _sub(this.skin.lanePressColors, lc, 1.0);

        this._laneResolved[i] = {
          laneColor: lc,
          noteColor, noteOpacity,
          holdColor, holdOpacity,
          noteBorderColor: border.color, noteBorderOpacity: border.opacity,
          noteShineColor: shine.color, noteShineOpacity: shine.opacity,
          noteGlowColor: glow.color, noteGlowOpacity: glow.opacity,
          holdBodyColor: holdBody.color, holdBodyOpacity: holdBody.opacity,
          holdBorderColor: holdBorder.color, holdBorderOpacity: holdBorder.opacity,
          holdStripeColor: holdStripe.color, holdStripeOpacity: holdStripe.opacity,
          holdTailCapColor: holdTailCap.color, holdTailCapOpacity: holdTailCap.opacity,
          holdTickColor: holdTick.color, holdTickOpacity: holdTick.opacity,
          hitLineColor: hitLine.color, hitLineOpacity: hitLine.opacity,
          hitGlowColor: hitGlow.color, hitGlowOpacity: hitGlow.opacity,
          hitFlashColor: hitFlash.color, hitFlashOpacity: hitFlash.opacity,
          hitBurstColor: hitBurst.color, hitBurstOpacity: hitBurst.opacity,
          hitRingColor: hitRing.color, hitRingOpacity: hitRing.opacity,
          keyBoxBgColor: keyBg.color, keyBoxBgOpacity: keyBg.opacity,
          keyBoxBorderColor: keyBorder.color, keyBoxBorderOpacity: keyBorder.opacity,
          keyBoxTextColor: keyText.color, keyBoxTextOpacity: keyText.opacity,
          laneBorderColor: laneBorder.color, laneBorderOpacity: laneBorder.opacity,
          lanePressColor: lanePress.color, lanePressOpacity: lanePress.opacity,
        };
      }

      // Preload custom note icon
      this._noteIconImg = null;
      if (this.skin.noteIcon) {
        this._noteIconImg = new Image();
        this._noteIconImg.src = this.skin.noteIcon;
      }

      // Canvas geometry (mirrors game.js proportions)
      this.LANE_W   = 70;
      this.canvasW  = N * this.LANE_W;
      this.canvasH  = 420;
      this._computeGeometry();

      // Game state
      this.notes           = [];
      this.completedNotes  = [];
      this.pressedLanes    = new Set();
      this.freshPressLanes = new Set(); // lanes pressed since last note hit (prevents held keys auto-hitting next note)
      this.risingNotes     = []; // RECORD mode visual feedback: notes that rise upward on key press
      this.keyDownAt       = {};
      this.score        = 0;
      this.combo        = 0;
      this.paused       = false;
      this.running      = false;
      this.hasSignal    = false;

      // Judgment tracking
      this.judgments = { perfect: 0, good: 0, ok: 0, miss: 0 };
      this.maxCombo  = 0;
      this.ended     = false;
      this._endTimer = null;

      // Visual effects (frame-count based, decremented each RAF)
      this.hitFlashes  = new Array(N).fill(null);
      this.missFlashes = new Array(N).fill(null);
      this.judgePops   = [];
      this.hitRings    = [];

      // AUTO note generation (wall-clock ms) — per-lane tracking for multi-track
      this.activeNotes         = new Array(N).fill(null); // per-lane active note ref
      this.lastNoteTimePerLane = new Array(N).fill(0);    // per-lane cooldown
      this._primaryLane        = -1;  // lane currently driven by pitch detection
      this._rmsHistory         = []; // recent RMS values for chord detection
      this._glowActive      = false; // glow state
      this._focused         = false; // overlay has focus (keys captured)
      this._lastGlowKey     = -1;   // cached glow state to skip redundant DOM writes

      // Recording
      this.recorder    = null;
      this.recChunks   = [];
      this.recStartMs  = null;
      this.recNotes    = [];
      this._recStopped = false;

      // Auto-play recording (for SAVE LEVEL)
      this.autoRecorder    = null;
      this.autoRecChunks   = [];
      this.autoRecStartMs  = null;
      this._autoSaved      = false;
      this._saveBtnRect    = null;

      // Hitsound
      this._hitsoundBuf   = null;
      this._hitsoundReady = false;

      // Audio
      this.audioCtx  = null;
      this.analyser  = null;
      this.delayNode = null;
      this._srcNode  = null;
      this._audioEl  = null;
      this._myConns  = [];

      // DOM
      this._raf          = null;
      this._sampleTimer  = null;
      this._pollTimer    = null;
      this._container    = null;
      this._canvas       = null;
      this._ctx          = null;
      this._statusEl     = null;
      this._prevCvW      = 0;
      this._prevCvH      = 0;
      this._lastStatusMs = 0;

      this._onKeyDown = null;
      this._onKeyUp   = null;
      this._resumeCtx = null;
    }

    _computeGeometry() {
      this.NOTE_H   = Math.round(28 * (this.skin ? this.skin.noteHeight : 1.0));
      this.LANE_TOP = 28;
      // Compute bottom-up (like horizontal mode) so lanes always meet key boxes
      this.KEYS_H   = Math.max(20, Math.min(Math.round(this.canvasH * 0.23 - 22), 88));
      this.KEYS_Y   = this.canvasH - this.KEYS_H;
      this.HIT_Y    = this.KEYS_Y - 2;
      // Cached gradients are built after canvas creation (in _buildDOM)
      this._cachedBgGrad     = null;
      this._cachedLaneBgGrad = [];
    }

    _buildGradientCache() {
      const ctx = this._ctx;
      if (!ctx) return;
      this._cachedBgGrad = ctx.createLinearGradient(0, 0, 0, this.canvasH);
      const bgC = this.skin ? this.skin.bgColor : '#0e0e1c';
      const bgOp = this.skin?.liveOpacity ?? 0.95;
      // Parse hex to rgba so canvas background respects liveOpacity
      const _hexToRgba = (hex, a) => {
        const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
        if (!m) return `rgba(14,14,28,${a})`;
        return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`;
      };
      this._cachedBgGrad.addColorStop(0, _hexToRgba(bgC, bgOp));
      this._cachedBgGrad.addColorStop(1, _hexToRgba(bgC, bgOp * 0.6));
      this._cachedLaneBgGrad = [];
      for (let l = 0; l < this.cfg.laneCount; l++) {
        const g = ctx.createLinearGradient(0, this.LANE_TOP, 0, this.HIT_Y);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, _withAlphaCS(this.colors[l], '18'));
        this._cachedLaneBgGrad[l] = g;
      }
    }

    start() {
      this._buildDOM();
      this._bindKeys();
      this._connectAudio();
      this._pollTimer = setInterval(() => this._connectAudio(), 500);
      if (this.cfg.mode === 'AUTO') {
        this._sampleTimer = setInterval(() => this._sample(), this.cfg.sampleDelay);
      }
      this.running = true;
      this._tick();
    }

    stop() {
      this.running = false;
      if (this._raf)         { cancelAnimationFrame(this._raf); this._raf = null; }
      if (this._sampleTimer) { clearInterval(this._sampleTimer); this._sampleTimer = null; }
      if (this._pollTimer)   { clearInterval(this._pollTimer);   this._pollTimer = null; }
      if (this._endTimer)    { clearTimeout(this._endTimer);    this._endTimer = null; }
      if (this._container?.parentNode) this._container.remove();
      if (this._onKeyDown) { document.removeEventListener('keydown', this._onKeyDown, true); document.removeEventListener('keyup', this._onKeyUp, true); }
      if (this._resumeCtx) { document.removeEventListener('keydown', this._resumeCtx); document.removeEventListener('click', this._resumeCtx); }
      if (this._onMediaEnded && this._audioEl) { this._audioEl.removeEventListener('ended', this._onMediaEnded); this._onMediaEnded = null; }
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.stop();
      } else {
        this._disconnectAudio();
      }
    }

    _conn(from, to) {
      from.connect(to);
      this._myConns.push({ from, to });
    }

    _disconnectAudio() {
      if (this._srcNode?._krPass) this._srcNode._krPass.gain.value = 1;
      for (const { from, to } of this._myConns) {
        try { from.disconnect(to); } catch (_) {}
      }
      this._myConns = [];
      this.analyser  = null;
      this.delayNode = null;
    }

    _findMedia(root) {
      const el = root.querySelector('video, audio');
      if (el) return el;
      // Search inside shadow DOMs
      const all = root.querySelectorAll('*');
      for (const node of all) {
        if (node.shadowRoot) {
          const found = this._findMedia(node.shadowRoot);
          if (found) return found;
        }
      }
      return null;
    }

    _connectAudio() {
      const el = this._findMedia(document);
      if (!el) {
        if (this._audioEl) { this._disconnectAudio(); this._audioEl = null; this._ensurePollTimer(); }
        this.hasSignal = false;
        return;
      }
      if (el === this._audioEl && this.analyser) return;
      // Clean up any stale connections before (re)connecting
      if (this._myConns.length > 0) this._disconnectAudio();
      this._audioEl = el;
      // Listen for media end event — more reliable than polling .ended in RAF
      if (this._onMediaEnded) el.removeEventListener('ended', this._onMediaEnded);
      this._onMediaEnded = () => {
        if (!this.ended && !this._endTimer && this.cfg.mode === 'AUTO') {
          this._endTimer = setTimeout(() => { this.ended = true; }, this.cfg.delayLength + 500);
        }
      };
      el.addEventListener('ended', this._onMediaEnded);

      try {
        if (window._krLastCtx && window._krLastCtx.state !== 'closed') {
          this.audioCtx = window._krLastCtx;
          if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
        } else {
          this.audioCtx = new AudioContext({ latencyHint: 'playback' });
          window._krLastCtx = this.audioCtx;
        }

        // Find cached source node for this element
        this._srcNode = window._krSrcNodes.find(n => n.mediaElement === el) || null;
        if (this._srcNode && this._srcNode.context !== this.audioCtx) {
          // Node exists on a different AudioContext — switch to that context if alive
          if (this._srcNode.context.state !== 'closed') {
            this.audioCtx = this._srcNode.context;
            window._krLastCtx = this.audioCtx;
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
          } else {
            // Dead context — remove stale entry, will attempt fresh creation
            window._krSrcNodes = window._krSrcNodes.filter(n => n !== this._srcNode);
            this._srcNode = null;
          }
        }
        if (!this._srcNode) {
          // Prefer captureStream — createMediaElementSource permanently locks the
          // element to one AudioContext which breaks on overlay restart.
          const stream = el.captureStream ? el.captureStream() : el.mozCaptureStream?.();
          if (stream && stream.getAudioTracks().length === 0) {
            // Stream exists but no audio tracks yet — bail and let poll timer retry
            return;
          }
          if (stream) {
            this._srcNode = this.audioCtx.createMediaStreamSource(stream);
            this._srcNode.mediaElement = el;
            this._srcNode._krIsFallback = true;
          } else {
            try {
              this._srcNode = this.audioCtx.createMediaElementSource(el);
            } catch (srcErr) {
              throw srcErr;
            }
          }
          window._krSrcNodes.push(this._srcNode);
          if (!this._srcNode._krIsFallback) {
            const pass = this.audioCtx.createGain();
            pass.gain.value = 1;
            this._srcNode.connect(pass);
            pass.connect(this.audioCtx.destination);
            this._srcNode._krPass = pass;
          }
        }

        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 2048;

        if (this.cfg.mode === 'AUTO') {
          this._conn(this._srcNode, this.analyser);
          if (this._srcNode._krIsFallback) {
            // captureStream fallback: element still plays natively; just analyze, no delay
            this.delayNode = null;
            if (!this.autoRecorder) this._startAutoRecorder(this._srcNode);
          } else {
            if (this._srcNode._krPass) this._srcNode._krPass.gain.value = 0;
            this.delayNode = this.audioCtx.createDelay(10);
            this.delayNode.delayTime.value = this.cfg.delayLength / 1000;
            this._conn(this._srcNode, this.delayNode);
            this._conn(this.delayNode, this.audioCtx.destination);
            if (!this.autoRecorder) this._startAutoRecorder(this.delayNode);
          }
        } else {
          if (this._srcNode._krPass) this._srcNode._krPass.gain.value = 1;
          this._conn(this._srcNode, this.analyser);
          if (!this.recorder) {
            const dest = this.audioCtx.createMediaStreamDestination();
            this._conn(this._srcNode, dest);
            this._startRecorder(dest.stream);
          }
        }
        // Connected successfully — stop polling until disconnect
        if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
      } catch (err) {
        console.warn('[KR Live] Audio connect error:', err.message);
        this.analyser = null;
      }
    }

    _ensurePollTimer() {
      if (this._pollTimer || !this.running) return;
      this._pollTimer = setInterval(() => this._connectAudio(), 500);
    }

    _startRecorder(stream) {
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
      this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      this.recChunks = [];
      this.recorder.ondataavailable = e => { if (e.data?.size > 0) this.recChunks.push(e.data); };
      this.recorder.onstop = () => this._finishRecording();
      this.recorder.start(200);
      this.recStartMs = Date.now();
      this.recAudioOffset = this._audioEl ? this._audioEl.currentTime : 0;
    }

    _startAutoRecorder(sourceNode) {
      if (this.autoRecorder || !this.audioCtx || !sourceNode) return;
      try {
        // Record from the Web Audio graph (works even on DRM-protected media)
        const dest = this.audioCtx.createMediaStreamDestination();
        this._conn(sourceNode, dest);
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
        this.autoRecorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : {});
        this.autoRecChunks = [];
        this.autoRecorder.ondataavailable = e => { if (e.data?.size > 0) this.autoRecChunks.push(e.data); };
        this.autoRecorder.start(200);
        this.autoRecStartMs = Date.now();
      } catch (err) {
        console.warn('[KR Live] Auto recorder failed:', err.message);
      }
    }

    // ── Hitsound synthesis (inlined from hitsounds.js — content scripts can't import) ──
    _synthesizeBuf(type) {
      if (!type || type === 'none' || !this.audioCtx) return null;
      const sr  = this.audioCtx.sampleRate;
      const dur = type === 'bell' ? 0.5 : 0.09;
      const buf = this.audioCtx.createBuffer(1, Math.floor(sr * dur), sr);
      const d   = buf.getChannelData(0);
      if (type === 'tick') {
        for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 45); }
      } else if (type === 'click') {
        for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (Math.sin(2 * Math.PI * 1200 * t) > 0 ? 1 : -1) * Math.exp(-t * 65) * 0.55; }
      } else if (type === 'drum') {
        for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 80) * 0.4 + Math.sin(2 * Math.PI * 80 * t) * Math.exp(-t * 25) * 0.6; }
      } else if (type === 'bell') {
        for (let i = 0; i < d.length; i++) { const t = i / sr; const phase = (1200 * t) % 1; d[i] = (phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase) * Math.exp(-t * 9); }
      } else if (type === 'bass') {
        for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.25 + Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 18) * 0.75; }
      } else if (type === 'kick') {
        for (let i = 0; i < d.length; i++) { const t = i / sr; const click = (i < sr * 0.004) ? (Math.random() * 2 - 1) * 1.0 : 0; d[i] = click + Math.sin(2 * Math.PI * 150 * t) * Math.exp(-t * 35) * 1.0; }
      } else if (type === 'snare') {
        for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 50) * 0.75 + Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 40) * 0.6; }
      } else { return null; }
      return buf;
    }

    _buildHitsound() {
      if (this._hitsoundReady || !this.audioCtx) return;
      this._hitsoundReady = true;
      const globalType = this.cfg.hitsound;
      const cache = {};
      // Global buffer
      this._hitsoundBuf = this._synthesizeBuf(globalType);
      if (this._hitsoundBuf) cache[globalType] = this._hitsoundBuf;
      // Per-lane buffers: settings > skin > global
      this._laneHitsoundBufs = [];
      const laneHs     = this.cfg.laneHitsounds  || {};
      const skinLaneHs = (this.cfg.skin && this.cfg.skin.laneHitsounds) || {};
      for (let i = 0; i < this.cfg.laneCount; i++) {
        const type = laneHs[i] || skinLaneHs[i] || globalType;
        if (!type || type === 'none') { this._laneHitsoundBufs[i] = null; continue; }
        if (!cache[type]) cache[type] = this._synthesizeBuf(type);
        this._laneHitsoundBufs[i] = cache[type];
      }
    }

    _playHitsound(lane) {
      if (!this.cfg.liveHitsound) return;
      const vol = Math.min(2, (this.cfg.masterVolume ?? 1) * (this.cfg.hitsoundVolume ?? 0.5) * 2);
      if (vol <= 0) return;
      if (!this._hitsoundReady) this._buildHitsound();
      const buf = (lane !== undefined && this._laneHitsoundBufs && this._laneHitsoundBufs[lane])
        ? this._laneHitsoundBufs[lane]
        : this._hitsoundBuf;
      if (!buf || !this.audioCtx) return;
      const src  = this.audioCtx.createBufferSource();
      const gain = this.audioCtx.createGain();
      src.buffer      = buf;
      if (this.cfg.hitsoundAutoPitch && lane !== undefined && this.cfg.laneCount > 1) {
        const r = this.cfg.hitsoundPitchRange ?? 0.2;
        src.playbackRate.value = (1 - r) + (2 * r * lane / (this.cfg.laneCount - 1));
      }
      gain.gain.value = vol;
      src.connect(gain);
      gain.connect(this.audioCtx.destination);
      src.start(0);
    }

    // ── Keys ──────────────────────────────────────────────────────────────────────
    _keyLabel(k) {
      const _KD = {
        ShiftLeft:'L-⇧', ShiftRight:'R-⇧', ControlLeft:'L-Ctrl', ControlRight:'R-Ctrl',
        AltLeft:'L-Alt', AltRight:'R-Alt', MetaLeft:'L-⌘', MetaRight:'R-⌘',
        ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→',
        ' ':'Space', Enter:'↵', Tab:'⇥', Escape:'Esc', Backspace:'⌫', Delete:'Del',
        Home:'Home', End:'End', PageUp:'PgUp', PageDown:'PgDn', Insert:'Ins',
        CapsLock:'Caps', NumLock:'Num', ScrollLock:'ScrLk', ContextMenu:'Menu',
        PrintScreen:'PrtSc', Pause:'Pause',
      };
      return _KD[k] || k || '?';
    }

    _resolveKeyLane(e) {
      const kb = this.cfg.keybinds;
      let lane = kb.indexOf(e.key);
      if (lane < 0) lane = kb.indexOf(e.code);
      return lane;
    }

    _matchesKey(e, cfgKey) {
      return e.key === cfgKey || e.code === cfgKey;
    }

    _bindKeys() {
      this._resumeCtx = () => {
        if (this.audioCtx?.state === 'suspended') this.audioCtx.resume().catch(() => {});
      };
      document.addEventListener('keydown', this._resumeCtx);
      document.addEventListener('click',   this._resumeCtx);

      this._onKeyDown = e => {
        // Exit key always works regardless of focus
        if (this._matchesKey(e, this.cfg.exitKey)) {
          e.preventDefault(); e.stopImmediatePropagation();
          if (e.repeat) return;
          if (this.ended) { if (_overlay) { _overlay.stop(); _overlay = null; } return; }
          if (this.cfg.mode === 'RECORD' && !this._recStopped) this._stopRecord();
          else { if (_overlay) { _overlay.stop(); _overlay = null; } }
          return;
        }
        // Only process other keys when overlay is focused
        if (!this._focused) return;
        // Block ALL keys from reaching the host page (including repeats)
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.repeat) return;
        // Resume AudioContext on user interaction
        if (this.audioCtx?.state === 'suspended') this.audioCtx.resume().catch(() => {});
        if (this._matchesKey(e, this.cfg.pauseKey)) { this._togglePause(); return; }
        const lane = this._resolveKeyLane(e);
        if (lane < 0) return;
        this.pressedLanes.add(lane);
        this.freshPressLanes.add(lane);
        this._updateGlow();
        if (this.cfg.mode === 'RECORD') {
          this.hitFlashes[lane] = 20;
          this.risingNotes.push({ lane, startMs: Date.now(), endMs: null });
        }
        if (this.cfg.mode === 'RECORD' && !this.paused && this._audioEl)
          this.keyDownAt[lane] = this._audioEl.currentTime;
      };

      this._onKeyUp = e => {
        if (!this._focused) return;
        e.preventDefault(); e.stopImmediatePropagation();
        const lane = this._resolveKeyLane(e);
        if (lane < 0) return;
        this.pressedLanes.delete(lane);
        this.freshPressLanes.delete(lane);
        this._updateGlow();
        if (this.cfg.mode === 'RECORD') {
          for (let i = this.risingNotes.length - 1; i >= 0; i--) {
            if (this.risingNotes[i].lane === lane && this.risingNotes[i].endMs === null) {
              this.risingNotes[i].endMs = Date.now();
              break;
            }
          }
        }
        if (this.cfg.mode === 'RECORD' && !this.paused && this._audioEl && this.recStartMs !== null) {
          const t0     = this.keyDownAt[lane] !== undefined ? this.keyDownAt[lane] : this._audioEl.currentTime;
          const durSec = Math.max(0, this._audioEl.currentTime - t0);
          this.recNotes.push({ time: t0, lane, duration: durSec * 1000 >= this.cfg.holdThresholdMs ? durSec : 0 });
          delete this.keyDownAt[lane];
        }
      };

      document.addEventListener('keydown', this._onKeyDown, true);
      document.addEventListener('keyup',   this._onKeyUp, true);
    }

    _togglePause() {
      this.paused = !this.paused;
      if (this._audioEl) {
        if (this.paused) this._audioEl.pause();
        else this._audioEl.play().catch(() => {});
      }
    }

    // ── Pitch sampling ────────────────────────────────────────────────────────────
    _sample() {
      if (this.paused || !this.analyser || !this._audioEl) return;
      if (this._audioEl.paused || this._audioEl.ended || this._audioEl.readyState < 2) {
        this.hasSignal = false;
        this.activeNotes.fill(null); // release all active holds
        return;
      }
      this.hasSignal = true;

      if (!this._sampleBuf || this._sampleBuf.length < this.analyser.fftSize)
        this._sampleBuf = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(this._sampleBuf);
      const data = this._sampleBuf;
      const { frequency, clarity, rms } = detectPitch(data, this.audioCtx.sampleRate);

      // Track RMS history for chord detection
      this._rmsHistory.push(rms);
      if (this._rmsHistory.length > 30) this._rmsHistory.shift(); // ~3s window

      if (clarity < this.cfg.clarityThreshold || rms < this.cfg.volumeThreshold) {
        // Signal dropped — resolve active note on whatever lane was last active
        // but keep other lanes' holds alive (they resolve naturally when pitch shifts)
        return;
      }

      const N    = this.cfg.laneCount;
      const lane = Math.round(((N * Math.log2(frequency / 440) + 69) % N + N)) % N;
      const now  = Date.now();

      // When pitch shifts to a new lane, only stop extending the OLD primary lane.
      // Chord lanes keep extending as long as audio energy sustains.
      if (this._primaryLane >= 0 && this._primaryLane !== lane) {
        if (this.cfg.overlapNotes) {
          // Only release the old primary lane; chord lanes keep extending
          this.activeNotes[this._primaryLane] = null;
        } else {
          // No overlap — clear ALL active notes when pitch shifts
          this.activeNotes.fill(null);
        }
      }
      this._primaryLane = lane;

      // Extend ALL active holds (primary + chord lanes) while signal is good
      for (let l = 0; l < N; l++) {
        const active = this.activeNotes[l];
        if (!active) continue;
        // Clear notes that have already been judged (hit/missed)
        if (active.state !== 0) { this.activeNotes[l] = null; continue; }
        if (this.cfg.allowMerging && now - active.startedAt >= this.cfg.noteLength) {
          active.endedAt = now;
          this.lastNoteTimePerLane[l] = now;
        }
      }

      // Only allow overlap notes after a hold has sustained long enough
      const overlapDelayMs = this.cfg.overlapDelay || 500;
      if (this.cfg.overlapNotes) {
        const anyLongHold = this.activeNotes.some((n, l) => n && l !== lane && now - n.startedAt >= overlapDelayMs);
        if (!anyLongHold && this.activeNotes.some((n, l) => n && l !== lane)) return;
      } else {
        const hasActiveHold = this.activeNotes.some((n, l) => n && l !== lane);
        if (hasActiveHold) return;
      }

      // Spawn new note on this lane if no active note and cooldown passed
      if (!this.activeNotes[lane] && now - this.lastNoteTimePerLane[lane] >= this.cfg.noteDelay) {
        const note = { startedAt: now, lane, endedAt: null, state: 0 };
        this.notes.push(note);
        this.activeNotes[lane] = note;
        this.lastNoteTimePerLane[lane] = now;

        // Chord injection: if RMS is above average and random chance passes, add adjacent note(s)
        if (this.cfg.chordRate > 0 && this._rmsHistory.length > 5) {
          const meanRms = this._rmsHistory.reduce((a, b) => a + b, 0) / this._rmsHistory.length;
          const energyThresh = 1.3 - 0.3 * this.cfg.chordRate;
          if (rms > meanRms * energyThresh && Math.random() < this.cfg.chordRate) {
            const candidates = [];
            for (let l = 0; l < N; l++) {
              if (l !== lane && !this.activeNotes[l] && now - this.lastNoteTimePerLane[l] >= this.cfg.noteDelay) {
                candidates.push({ lane: l, dist: Math.abs(l - lane) });
              }
            }
            candidates.sort((a, b) => a.dist - b.dist);
            const maxExtra = this.cfg.chordRate >= 0.8 ? 3 : 2;
            const extraCount = rms > meanRms * 2.0 ? Math.min(maxExtra, candidates.length)
                             : rms > meanRms * 1.5 ? Math.min(2, candidates.length) : 1;
            for (let i = 0; i < extraCount; i++) {
              const chordNote = { startedAt: now, lane: candidates[i].lane, endedAt: null, state: 0 };
              this.notes.push(chordNote);
              // Only track chord notes for hold extension if heldChords is on
              if (this.cfg.heldChords) {
                this.activeNotes[candidates[i].lane] = chordNote;
              }
              this.lastNoteTimePerLane[candidates[i].lane] = now;
            }
          }
        }
      }
    }

    // ── RAF tick ──────────────────────────────────────────────────────────────────
    _tick() {
      if (!this.running) return;
      this._raf = requestAnimationFrame(() => this._tick());
      const wallNow = Date.now();

      if (!this.paused && this.cfg.mode === 'AUTO') {
        this._checkHits(wallNow);
        this._pruneNotes(wallNow);
        // End detection: show result screen after media finishes + grace period
        if (this._audioEl?.ended && !this.ended && !this._endTimer) {
          this._endTimer = setTimeout(() => { this.ended = true; }, this.cfg.delayLength + 500);
        }
      }

      // Decay visual effects each frame
      const N = this.cfg.laneCount;
      for (let l = 0; l < N; l++) {
        if (this.hitFlashes[l]  !== null && --this.hitFlashes[l]  <= 0) this.hitFlashes[l]  = null;
        if (this.missFlashes[l] !== null && --this.missFlashes[l] <= 0) this.missFlashes[l] = null;
      }
      let _jpAlive = 0;
      for (let i = 0; i < this.judgePops.length; i++) {
        const p = this.judgePops[i];
        p.timer--; p.y -= 0.7;
        if (p.timer > 0) this.judgePops[_jpAlive++] = p;
      }
      this.judgePops.length = _jpAlive;
      let _hrAlive = 0;
      for (let i = 0; i < this.hitRings.length; i++) {
        if (--this.hitRings[i].timer > 0) this.hitRings[_hrAlive++] = this.hitRings[i];
      }
      this.hitRings.length = _hrAlive;

      this._render(wallNow);
    }

    // Hit detection mirrors game.js: PERFECT ±50ms, GOOD ±100ms, OK ±150ms
    // Near-miss: ±270ms, Hold auto-complete: 200ms, Fresh-press consumption pattern

    // ── Hit detection (AUTO) ──────────────────────────────────────────────────────
    _checkHits(wallNow) {
      const ordTime    = wallNow - this.cfg.delayLength;
      const W_PERFECT  = 50;
      const W_GOOD     = 100;
      const W_OK       = 150;
      const W_NEARMISS = 270;       // near-miss zone — matches game.js
      // Snapshot fresh presses before note processing — any left over after = ghost press
      const freshThisFrame = new Set(this.freshPressLanes);

      for (const note of this.notes) {
        if (note.state === 1 || note.state === 2) continue;
        const delta = ordTime - note.startedAt;

        if (note.state === 3) {
          const holdEnd = note.endedAt !== null ? note.endedAt : note.startedAt + this.cfg.noteLength;

          if (this.cfg.strictRelease) {
            // ── Strict release mode ───────────────────────────────────────
            if (!this.pressedLanes.has(note.lane)) {
              const dist = Math.abs(ordTime - holdEnd);
              if (dist <= W_OK) {
                note.state = 1;
                this.hitFlashes[note.lane] = 14;
                this._playHitsound(note.lane);
                if (dist <= W_PERFECT) {
                  this.score += 10;
                  this.combo++;
                  this._spawnPop(this.skin.perfectText || 'PERFECT', this.skin.perfectColor || '#ffd040', 16, note.lane);
                } else if (dist <= W_GOOD) {
                  this.score += 6.6;
                  this.combo++;
                  this._spawnPop(this.skin.goodText || 'GOOD', this.skin.goodColor || '#60ff90', 14, note.lane);
                } else {
                  this.score += 3.3;
                  this.combo++;
                  this._spawnPop(this.skin.okText || 'OK', this.skin.okColor || '#40c4ff', 13, note.lane);
                }
              } else {
                // Released too early — miss
                note.state = 2;
                this.combo = 0;
                this.score = Math.max(0, this.score - 5);
                this.missFlashes[note.lane] = 14;
                this.judgments.miss++;
                this._spawnPop(this.skin.missText || 'MISS', this.skin.missColor || '#ff4060', 15, note.lane);
              }
            } else if (ordTime > holdEnd + W_OK) {
              // Held too long past tail — miss
              note.state = 2;
              this.combo = 0;
              this.score = Math.max(0, this.score - 5);
              this.missFlashes[note.lane] = 14;
              this.judgments.miss++;
              this._spawnPop(this.skin.missText || 'MISS', this.skin.missColor || '#ff4060', 15, note.lane);
            } else {
              // Still holding — tick score
              this.score += 0.05;
              this.hitFlashes[note.lane] = 8;
            }
          } else {
            // ── Default (lenient) release mode ────────────────────────────
            if (ordTime > holdEnd + W_OK) {
              // Natural completion
              note.state = 1;
              this.hitFlashes[note.lane] = 14;
              this._spawnPop('HOLD!', this.skin.perfectColor || '#ffd040', 16, note.lane);
              this._playHitsound(note.lane);
            } else if (!this.pressedLanes.has(note.lane)) {
              const timeToTail = holdEnd - ordTime;
              if (timeToTail <= 150) {
                // Let go within 150ms of the tail — auto-complete
                note.state = 1;
                this.hitFlashes[note.lane] = 14;
                this._spawnPop('HOLD!', this.skin.perfectColor || '#ffd040', 16, note.lane);
                this._playHitsound(note.lane);
              } else {
                // True early release — break
                note.state = 2;
                this.combo = 0;
                this._spawnPop('BREAK', this.skin.missColor || '#ff4060', 13, note.lane);
              }
            } else {
              this.score += 0.05;
              this.hitFlashes[note.lane] = 8;
            }
          }
          continue;
        }

        // Skip notes too far in the future (beyond near-miss scan zone)
        if (delta < -W_NEARMISS) continue;

        // Note is past the OK window — auto-miss
        if (delta > W_OK) {
          note.state = 2; this.combo = 0;
          this.score = Math.max(0, this.score - 5);
          this.missFlashes[note.lane] = 14;
          this.judgments.miss++;
          this._spawnPop(this.skin.missText || 'MISS', this.skin.missColor || '#ff4060', Math.round(15 * (this.skin.judgeSizeMultiplier ?? 1.0)), note.lane);
          continue;
        }

        // Note is in early near-miss zone [-W_NEARMISS, -W_OK): too early to score,
        // fresh press here is a near-miss → MISS, consume note so it can't be double-counted
        if (delta < -W_OK) {
          if (this.freshPressLanes.has(note.lane)) {
            this.freshPressLanes.delete(note.lane);
            note.state = 2;               // consume the note
            this.combo = 0;
            this.score = Math.max(0, this.score - 5);
            this.missFlashes[note.lane] = 14;
            this.judgments.miss++;
            this._spawnPop(this.skin.missText || 'MISS', this.skin.missColor || '#ff4060', Math.round(15 * (this.skin.judgeSizeMultiplier ?? 1.0)), note.lane);
          }
          continue;
        }

        // Note is within OK window [-W_OK, +W_OK]
        if (this.pressedLanes.has(note.lane) && this.freshPressLanes.has(note.lane)) {
          this.freshPressLanes.delete(note.lane); // consume — prevents held key auto-hitting next note
          note.state = note.endedAt !== null ? 3 : 1;
          this.combo++;
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          this.hitFlashes[note.lane] = 20;
          this._playHitsound(note.lane);
          const absDelta = Math.abs(delta);
          if (absDelta <= W_PERFECT) {
            this.score += 10;
            this.judgments.perfect++;
            this._spawnPop(this.skin.perfectText || 'PERFECT', this.skin.perfectColor || '#ffd040', Math.round(18 * (this.skin.judgeSizeMultiplier ?? 1.0)), note.lane);
            this.hitRings.push({ lane: note.lane, timer: 28, maxTimer: 28 });
          } else if (absDelta <= W_GOOD) {
            this.score += 7;
            this.judgments.good++;
            this._spawnPop(this.skin.goodText || 'GOOD', this.skin.goodColor || '#60ff90', Math.round(15 * (this.skin.judgeSizeMultiplier ?? 1.0)), note.lane);
          } else {
            // Explicit: absDelta in (W_GOOD, W_OK]
            this.score += 4;
            this.judgments.ok++;
            this._spawnPop(this.skin.okText || 'OK', this.skin.okColor || '#40c4ff', Math.round(13 * (this.skin.judgeSizeMultiplier ?? 1.0)), note.lane);
          }
        }
      }

      // Ghost press — any fresh press not consumed by a note hit or near-miss.
      // Only penalize if there's a pending note within W_NEARMISS in that lane
      // (matches game.js: random presses far from any note do nothing).
      // Build per-lane pending set once instead of .some() per fresh press (O(n²) → O(n))
      let _nearLanes = null;
      for (const lane of freshThisFrame) {
        if (this.freshPressLanes.has(lane)) {
          this.freshPressLanes.delete(lane);
          if (!_nearLanes) {
            _nearLanes = new Set();
            for (const n of this.notes) {
              if (n.state === 0 && Math.abs(ordTime - n.startedAt) <= W_NEARMISS) _nearLanes.add(n.lane);
            }
          }
          if (_nearLanes.has(lane)) {
            this.combo = 0;
            this.score = Math.max(0, this.score - 5);
            this.missFlashes[lane] = 14;
            this.judgments.miss++;
            this._spawnPop(this.skin.missText || 'MISS', this.skin.missColor || '#ff4060', Math.round(15 * (this.skin.judgeSizeMultiplier ?? 1.0)), lane);
          }
        }
      }
    }

    _pruneNotes(wallNow) {
      const cutoff = wallNow - this.cfg.delayLength - this.cfg.gutterLength;
      for (let i = this.notes.length - 1; i >= 0; i--) {
        const n = this.notes[i];
        if ((n.state === 1 || n.state === 2) && (n.endedAt || n.startedAt) < cutoff) {
          this.completedNotes.push(n);
          this.notes.splice(i, 1);
        }
      }
    }

    _getMissNoteColor(lane) {
      const mode = this.skin.missNoteMode || 'darken';
      if (mode === 'flat')   return this.skin.missNoteFlatColor || '#666666';
      if (mode === 'custom') return (this.skin.missNoteColors && this.skin.missNoteColors[lane]) || '#666666';
      const laneCol = this.colors[lane] || '#666666';
      return _darkenHexCS(laneCol, this.skin.missNoteDarken ?? 0.35);
    }

    _spawnPop(msg, color, size, lane) {
      const lx = lane * this.LANE_W;
      this.judgePops.push({
        msg, color, size, lane,
        x:        lx + this.LANE_W / 2,
        y:        this.HIT_Y - 26,
        timer:    36,
        maxTimer: 36,
      });
    }

    _updateGlow() {
      if (!this._container) return;
      const active = this.pressedLanes.size > 0;
      const glowKey = (this._focused ? 2 : 0) | (active ? 1 : 0);
      if (glowKey === this._lastGlowKey) return; // skip redundant DOM writes
      this._lastGlowKey = glowKey;
      const ac = this.skin.liveAccentColor || '#c060ff';
      this._container.style.border = this._focused
        ? `2px solid ${ac}`
        : `1px solid ${ac}30`;
      this._container.style.boxShadow = active
        ? `0 4px 24px rgba(0,0,0,0.9), 0 0 20px ${ac}b3, inset 0 0 0 2px ${ac}80`
        : this._focused
          ? `0 4px 24px rgba(0,0,0,0.9), 0 0 12px ${ac}66, inset 0 0 0 1px ${ac}4d`
          : `0 4px 24px rgba(0,0,0,0.9), 0 0 6px ${ac}26, inset 0 0 0 1px ${ac}1f`;
    }

    // ── Horizontal Render ────────────────────────────────────────────────────────
    _renderHorizontal(wallNow) {
      const cv = this._canvas, ctx = this._ctx;
      const W = this.canvasW, H = this.canvasH;
      const N = this.cfg.laneCount;
      const LANE_H = Math.floor(H / N);
      const HIT_X = Math.min(Math.round(W * 0.22), 100); // hit zone vertical line
      const KEY_W = HIT_X; // key zone fills up to hit line (no gap)
      const textScale = Math.min(1.5, this.LANE_W / 70);

      if (W !== this._prevCvW || H !== this._prevCvH) {
        cv.width = W; cv.height = H;
        this._prevCvW = W; this._prevCvH = H;
        this._buildGradientCache();
      }

      // Background — clear first so semi-transparent gradient doesn't accumulate
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = this._cachedBgGrad || '#0e0e1c';
      ctx.fillRect(0, 0, W, H);

      const ordTime  = wallNow - this.cfg.delayLength;
      const approach = 1500 / Math.max(0.1, Math.min(5.0, this.cfg.scrollSpeed || 1));
      const scrollW = W - HIT_X;

      // Lane backgrounds (matching vertical: gradient + full border + pressed tint)
      const _lgmH = this.skin.laneGradientMode || 'fade';
      for (let l = 0; l < N; l++) {
        const ly = l * LANE_H;
        const col = this.colors[l];
        if (_lgmH !== 'none') {
          if (_lgmH === 'solid') {
            ctx.fillStyle = _withAlphaCS(col, '17');
          } else {
            const lg = ctx.createLinearGradient(HIT_X, 0, W, 0);
            lg.addColorStop(0, 'rgba(0,0,0,0)');
            lg.addColorStop(1, _withAlphaCS(col, '18'));
            ctx.fillStyle = lg;
          }
          ctx.fillRect(HIT_X, ly, scrollW, LANE_H);
        }
        const R = this._laneResolved[l];
        const _lbRaw = this.skin.laneBorderColors && this.skin.laneBorderColors[l];
        ctx.strokeStyle = _lbRaw ? _withAlphaCS(R.laneBorderColor, _alphaHexCS(R.laneBorderOpacity)) : _withAlphaCS(col, '36');
        ctx.lineWidth = 1;
        ctx.strokeRect(HIT_X + 0.5, ly, scrollW, LANE_H);
        if (this.pressedLanes.has(l)) {
          const _lpRaw = this.skin.lanePressColors && this.skin.lanePressColors[l];
          ctx.fillStyle = _lpRaw ? _withAlphaCS(R.lanePressColor, _alphaHexCS(R.lanePressOpacity)) : _withAlphaCS(col, '21');
          ctx.fillRect(HIT_X, ly, scrollW, LANE_H);
        }
        if (this.missFlashes[l] !== null) {
          const _mfcH = this.skin.missFlashColor || '#ff3c50';
          const _mrH = parseInt(_mfcH.slice(1,3), 16), _mgH = parseInt(_mfcH.slice(3,5), 16), _mbH = parseInt(_mfcH.slice(5,7), 16);
          ctx.fillStyle = `rgba(${_mrH},${_mgH},${_mbH},${(this.missFlashes[l]/14)*0.22})`;
          ctx.fillRect(HIT_X, ly, scrollW, LANE_H);
        }
      }

      // Hit zone line — per-lane colored (matching vertical mode)
      const _hzsH = this.skin.hitZoneStyle || 'glow';
      if (_hzsH !== 'none') {
        for (let l = 0; l < N; l++) {
          const ly = l * LANE_H;
          const col = this.colors[l];
          const R = this._laneResolved[l];
          const _hgRaw = this.skin.hitGlowColors && this.skin.hitGlowColors[l];
          if (_hzsH === 'glow') {
            ctx.fillStyle = _hgRaw ? _withAlphaCS(R.hitGlowColor, _alphaHexCS(R.hitGlowOpacity * 0.094)) : _withAlphaCS(col, '18');
            ctx.fillRect(HIT_X - 4, ly, 8, LANE_H);
          }
          const _hlRaw = this.skin.hitLineColors && this.skin.hitLineColors[l];
          ctx.strokeStyle = _hlRaw ? _withAlphaCS(R.hitLineColor, _alphaHexCS(R.hitLineOpacity * 0.667)) : _withAlphaCS(this.skin.hitLineColor, 'aa');
          ctx.lineWidth   = this.skin.hitLineWidth;
          ctx.beginPath();
          ctx.moveTo(HIT_X, ly + 5);
          ctx.lineTo(HIT_X, ly + LANE_H - 5);
          ctx.stroke();
          if (this.hitFlashes[l] !== null) {
            const f = this.hitFlashes[l] / 20;
            const _hfRaw = this.skin.hitFlashColors && this.skin.hitFlashColors[l];
            const _hfCol = _hfRaw ? R.hitFlashColor : col;
            ctx.shadowBlur  = 18 * f * (this.skin.hitFlashIntensity ?? 1.0);
            ctx.shadowColor = _hfCol;
            ctx.strokeStyle = _hfCol;
            ctx.lineWidth   = 3;
            ctx.beginPath();
            ctx.moveTo(HIT_X, ly + 5);
            ctx.lineTo(HIT_X, ly + LANE_H - 5);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      }

      // Notes — full-quality rendering (matching vertical mode)
      const _hbwFrac    = this.skin.holdBodyWidth;
      const _shineSet   = new Set(['rounded', 'sharp', 'key', 'hexagon']);
      const _shineA     = this.skin.noteShine ?? 0.30;
      const _maxGlowH   = this.skin.noteApproachGlow ?? 22;

      for (const note of this.notes) {
        if (note.state === 1) continue;
        const isMissed = note.state === 2;
        let col = isMissed ? this._getMissNoteColor(note.lane) : (this.colors[note.lane] || '#ffffff');
        const _Rh = (!isMissed && this._laneResolved) ? this._laneResolved[note.lane] : null;
        const ly = note.lane * LANE_H;
        const noteX = HIT_X + scrollW * ((note.startedAt - ordTime) / approach);
        const noteH = LANE_H - 8;
        const noteW = Math.max(20, Math.min(28, Math.floor(LANE_H * 0.45)));
        const frac = Math.max(0, Math.min(1, (noteX - HIT_X) / scrollW));
        let alpha = isMissed ? 0.45 : (0.5 + 0.5 * Math.max(0, Math.min(1, 1 - frac)));
        const glow  = isMissed ? 0 : (frac < 0.4 ? ((0.4 - frac) / 0.4) * _maxGlowH : 0);

        if (note.state === 3) {
          // ── Active hold: glowing body + stripes + tail endcap ──────────
          const _holdColA = _Rh ? _Rh.holdColor : col;
          const _holdBodyColA = _Rh ? _Rh.holdBodyColor : _holdColA;
          const _holdStripeColA = _Rh ? _Rh.holdStripeColor : _holdColA;
          const _holdTailCapColA = _Rh ? _Rh.holdTailCapColor : _holdColA;
          if (note.endedAt !== null) {
            const tailX = HIT_X + scrollW * ((note.endedAt - ordTime) / approach);
            const bodyLeft = Math.max(HIT_X, Math.min(noteX, tailX));
            const bodyRight = tailX;
            const bodyW = Math.max(0, bodyRight - bodyLeft);
            if (bodyW > 0) {
              const by = ly + Math.floor(LANE_H * (1 - _hbwFrac) / 2);
              const bh = Math.floor(LANE_H * _hbwFrac);
              ctx.globalAlpha = 0.9 * (_Rh ? _Rh.holdOpacity : 1);
              const tg = ctx.createLinearGradient(bodyLeft, 0, bodyRight, 0);
              tg.addColorStop(0, _withAlphaCS(_holdBodyColA, 'dd'));
              tg.addColorStop(1, _withAlphaCS(_holdBodyColA, '55'));
              ctx.fillStyle = tg;
              ctx.shadowBlur = 16; ctx.shadowColor = _holdColA;
              ctx.fillRect(bodyLeft, by, bodyW, bh);
              ctx.shadowBlur = 0;
              if (this.skin.holdStripes !== false) this._diagonalStripes(ctx, bodyLeft, by, bodyW, bh, _withAlphaCS(_holdStripeColA, '60'));
              // Tail endcap (supports tailCapStyle: rounded/flat/pointed)
              const _tcwM2 = this.skin.tailCapWidth  != null ? this.skin.tailCapWidth  : 1.0;
              const _tchM2 = this.skin.tailCapHeight != null ? this.skin.tailCapHeight : 1.0;
              const tcH2 = (bh + 4) * _tcwM2, tcW2 = 12 * _tchM2;
              const tcIH2 = bh * _tcwM2, tcIW2 = 8 * _tchM2;
              const _tcS2 = this.skin.tailCapStyle || 'rounded';
              const _tcCy2 = ly + LANE_H / 2;
              ctx.shadowBlur = 20; ctx.shadowColor = _holdColA;
              ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.95;
              if (_tcS2 === 'flat') {
                ctx.fillRect(bodyRight - tcW2 / 2, _tcCy2 - tcH2 / 2, tcW2, tcH2);
              } else if (_tcS2 === 'pointed') {
                ctx.beginPath(); ctx.moveTo(bodyRight - tcW2 / 2, _tcCy2 - tcH2 / 2); ctx.lineTo(bodyRight - tcW2 / 2, _tcCy2 + tcH2 / 2); ctx.lineTo(bodyRight + tcW2 / 2, _tcCy2); ctx.closePath(); ctx.fill();
              } else {
                ctx.beginPath(); ctx.roundRect(bodyRight - tcW2 / 2, _tcCy2 - tcH2 / 2, tcW2, tcH2, tcW2 / 2); ctx.fill();
              }
              ctx.shadowBlur = 0;
              ctx.fillStyle = _holdTailCapColA;
              if (_tcS2 === 'flat') {
                ctx.fillRect(bodyRight - tcIW2 / 2, _tcCy2 - tcIH2 / 2, tcIW2, tcIH2);
              } else if (_tcS2 === 'pointed') {
                ctx.beginPath(); ctx.moveTo(bodyRight - tcIW2 / 2, _tcCy2 - tcIH2 / 2); ctx.lineTo(bodyRight - tcIW2 / 2, _tcCy2 + tcIH2 / 2); ctx.lineTo(bodyRight + tcIW2 / 2, _tcCy2); ctx.closePath(); ctx.fill();
              } else {
                ctx.beginPath(); ctx.roundRect(bodyRight - tcIW2 / 2, _tcCy2 - tcIH2 / 2, tcIW2, tcIH2, tcIW2 / 2); ctx.fill();
              }
            }
          }
          ctx.globalAlpha = 1; ctx.shadowBlur = 0;
          continue;
        }

        // ── Pending hold: body + stripes + tail endcap + head ────────────
        if (note.endedAt !== null) {
          const _holdCol = _Rh ? _Rh.holdColor : col;
          const _holdBodyCol = _Rh ? _Rh.holdBodyColor : _holdCol;
          const _holdStripeCol = _Rh ? _Rh.holdStripeColor : _holdCol;
          const _holdBorderCol = _Rh ? _Rh.holdBorderColor : _holdCol;
          const _holdTailCapCol = _Rh ? _Rh.holdTailCapColor : _holdCol;
          const _holdAlpha = alpha * (_Rh ? _Rh.holdOpacity : 1);
          const tailX = HIT_X + scrollW * ((note.endedAt - ordTime) / approach);
          const by = ly + Math.floor(LANE_H * (1 - _hbwFrac) / 2);
          const bh = Math.floor(LANE_H * _hbwFrac);
          const bodyLeft = Math.min(noteX, tailX);
          const bodyW = Math.max(0, Math.abs(tailX - noteX));
          if (bodyW > 0) {
            ctx.globalAlpha = _holdAlpha;
            ctx.fillStyle = _withAlphaCS(_holdBodyCol, '60');
            ctx.fillRect(bodyLeft, by, bodyW, bh);
            if (this.skin.holdStripes !== false) this._diagonalStripes(ctx, bodyLeft, by, bodyW, bh, _withAlphaCS(_holdStripeCol, '55'));
            const _hbwStroke = this.skin.holdBorderWidth ?? 1;
            if (_hbwStroke > 0) {
              ctx.strokeStyle = _withAlphaCS(_holdBorderCol, '77'); ctx.lineWidth = _hbwStroke;
              ctx.strokeRect(bodyLeft + 0.5, by + 0.5, bodyW - 1, bh - 1);
            }
          }
          // Tail endcap (supports tailCapStyle: rounded/flat/pointed)
          const _tcwM = this.skin.tailCapWidth  != null ? this.skin.tailCapWidth  : 1.0;
          const _tchM = this.skin.tailCapHeight != null ? this.skin.tailCapHeight : 1.0;
          const tcH = (bh + 4) * _tcwM, tcW = 12 * _tchM;
          const tcIH = bh * _tcwM, tcIW = 8 * _tchM;
          const _tcS = this.skin.tailCapStyle || 'rounded';
          const _tcCy = ly + LANE_H / 2;
          ctx.shadowBlur = 16; ctx.shadowColor = _holdCol;
          ctx.fillStyle = '#ffffff'; ctx.globalAlpha = _holdAlpha;
          if (_tcS === 'flat') {
            ctx.fillRect(tailX - tcW / 2, _tcCy - tcH / 2, tcW, tcH);
          } else if (_tcS === 'pointed') {
            ctx.beginPath(); ctx.moveTo(tailX - tcW / 2, _tcCy - tcH / 2); ctx.lineTo(tailX - tcW / 2, _tcCy + tcH / 2); ctx.lineTo(tailX + tcW / 2, _tcCy); ctx.closePath(); ctx.fill();
          } else {
            ctx.beginPath(); ctx.roundRect(tailX - tcW / 2, _tcCy - tcH / 2, tcW, tcH, tcW / 2); ctx.fill();
          }
          ctx.shadowBlur = 0;
          ctx.fillStyle = _holdTailCapCol;
          if (_tcS === 'flat') {
            ctx.fillRect(tailX - tcIW / 2, _tcCy - tcIH / 2, tcIW, tcIH);
          } else if (_tcS === 'pointed') {
            ctx.beginPath(); ctx.moveTo(tailX - tcIW / 2, _tcCy - tcIH / 2); ctx.lineTo(tailX - tcIW / 2, _tcCy + tcIH / 2); ctx.lineTo(tailX + tcIW / 2, _tcCy); ctx.closePath(); ctx.fill();
          } else {
            ctx.beginPath(); ctx.roundRect(tailX - tcIW / 2, _tcCy - tcIH / 2, tcIW, tcIH, tcIW / 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }

        // ── Tap note / hold head ─────────────────────────────────────────
        if (noteX >= -noteW * 2 && noteX <= W + noteW) {
          const isHold = note.endedAt !== null;
          const _drawCol = _Rh ? (isHold ? _Rh.holdColor : _Rh.noteColor) : col;
          const _perLaneOp = _Rh ? (isHold ? _Rh.holdOpacity : _Rh.noteOpacity) : 1;
          const _drawAlpha = alpha * _perLaneOp;
          const hw = isHold ? noteW + 4 : noteW;
          const hh = isHold ? noteH + 4 : noteH;
          const hx = noteX - hw;
          const hy = ly + (LANE_H - hh) / 2;

          const _noteGlowCol = _Rh ? _Rh.noteGlowColor : _drawCol;
          ctx.globalAlpha = _drawAlpha;
          ctx.shadowBlur  = glow;
          ctx.shadowColor = _noteGlowCol;

          if (this._drawNoteIcon(ctx, this._noteIconImg, hx, hy, hw, hh)) {
            // custom icon drawn
          } else {
            // Gradient fill (left-to-right for horizontal)
            const ng = isHold
              ? (() => { const g = ctx.createLinearGradient(hx, 0, hx + hw, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, _drawCol); g.addColorStop(1, _withAlphaCS(_drawCol, 'cc')); return g; })()
              : (() => { const g = ctx.createLinearGradient(hx, 0, hx + hw, 0); g.addColorStop(0, _drawCol); g.addColorStop(1, _withAlphaCS(_drawCol, 'bb')); return g; })();
            ctx.fillStyle = ng;
            const kl = (this.skin.noteShape === 'key' && this.cfg.keybinds && this.cfg.keybinds[note.lane])
              ? this._keyLabel(this.cfg.keybinds[note.lane]) : null;
            this._fillNoteShape(ctx, hx, hy, hw, hh, kl);
            ctx.shadowBlur = 0;
            // Grip lines on hold heads
            if (isHold) {
              ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
              for (let g = 0; g < 3; g++) {
                const gx = noteX - 4 - g * 5;
                ctx.beginPath(); ctx.moveTo(gx, hy + 6); ctx.lineTo(gx, hy + hh - 6); ctx.stroke();
              }
            }
            // Shine highlight (top edge — 5px hold, 4px tap, matching vertical)
            const _noteShineCol = _Rh ? _Rh.noteShineColor : '#ffffff';
            const _noteShineOp  = _Rh ? _Rh.noteShineOpacity : 1.0;
            const shA = (isHold ? Math.min(1, _shineA * 1.33) : _shineA) * _noteShineOp;
            const shH = isHold ? 5 : 4;
            if (shA > 0 && _shineSet.has(this.skin.noteShape)) {
              const _shR = parseInt(_noteShineCol.slice(1,3), 16) || 255;
              const _shG = parseInt(_noteShineCol.slice(3,5), 16) || 255;
              const _shB = parseInt(_noteShineCol.slice(5,7), 16) || 255;
              ctx.fillStyle = `rgba(${_shR},${_shG},${_shB},${shA})`;
              if (this.skin.noteShape === 'sharp') {
                ctx.fillRect(hx, hy, hw, shH);
              } else {
                ctx.beginPath(); ctx.roundRect(hx, hy, hw, shH, [shH, shH, 0, 0]); ctx.fill();
              }
            }
            // Note border stroke
            const _nbw = this.skin.noteBorderWidth || 0;
            if (_nbw > 0) {
              ctx.shadowBlur = 0;
              const bc = _Rh ? _Rh.noteBorderColor : ((this.skin.noteBorderColors && this.skin.noteBorderColors[note.lane]) || _drawCol);
              ctx.strokeStyle = bc; ctx.lineWidth = _nbw;
              this._strokeNoteShape(ctx, hx, hy, hw, hh);
            }
          }
          ctx.globalAlpha = 1;
          ctx.shadowBlur  = 0;
        }
      }

      // Key indicators on left
      const fontSize = Math.max(11, Math.min(26, Math.floor(LANE_H * 0.3)));
      for (let l = 0; l < N; l++) {
        const ly = l * LANE_H;
        const col = this.colors[l];
        const R = this._laneResolved[l];
        const pressed = this.pressedLanes.has(l);
        const label = this._keyLabel(this.cfg.keybinds[l]);

        const _kbBgRaw = this.skin.keyBoxBgColors && this.skin.keyBoxBgColors[l];
        const _kbBorderRaw = this.skin.keyBoxBorderColors && this.skin.keyBoxBorderColors[l];
        const _kbTextRaw = this.skin.keyBoxTextColors && this.skin.keyBoxTextColors[l];

        const _kbM = this.skin.keyBoxMode || 'solid';
        if (pressed) {
          ctx.fillStyle = _withAlphaCS(col, 'cc');
        } else if (_kbM === 'dark') {
          ctx.fillStyle = _kbBgRaw ? _withAlphaCS(R.keyBoxBgColor, _alphaHexCS(R.keyBoxBgOpacity)) : _darkenHexCS(col, 0.15);
        } else if (_kbM === 'tinted') {
          ctx.fillStyle = _kbBgRaw ? _withAlphaCS(R.keyBoxBgColor, _alphaHexCS(R.keyBoxBgOpacity)) : this.skin.keyBoxColor;
          ctx.fillRect(0, ly, KEY_W, LANE_H);
          ctx.fillStyle = _withAlphaCS(col, '20');
        } else {
          ctx.fillStyle = _kbBgRaw ? _withAlphaCS(R.keyBoxBgColor, _alphaHexCS(R.keyBoxBgOpacity)) : this.skin.keyBoxColor;
        }
        ctx.fillRect(0, ly, KEY_W, LANE_H);
        const _borderCol = _kbBorderRaw ? _withAlphaCS(R.keyBoxBorderColor, _alphaHexCS(R.keyBoxBorderOpacity)) : _withAlphaCS(col, '55');
        ctx.strokeStyle = pressed ? col : _borderCol;
        ctx.lineWidth = pressed ? 2.5 : 1;
        ctx.strokeRect(1, ly + 1, KEY_W - 2, LANE_H - 2);

        if (pressed) { ctx.shadowBlur = 14; ctx.shadowColor = col; }
        const _textCol = _kbTextRaw ? _withAlphaCS(R.keyBoxTextColor, _alphaHexCS(R.keyBoxTextOpacity)) : col;
        ctx.fillStyle = pressed ? '#080810' : _textCol;
        ctx.font = `bold ${fontSize}px ${this.skin.fontFamily || 'monospace'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, KEY_W / 2, ly + LANE_H / 2);
        ctx.shadowBlur = 0;
      }

      // Hit rings
      if (this.skin.hitRingEnabled !== false) {
        for (const ring of this.hitRings) {
          const ly  = ring.lane * LANE_H;
          const cy  = ly + LANE_H / 2;
          const col = this.colors[ring.lane];
          const R = this._laneResolved[ring.lane];
          const _hrRaw = this.skin.hitRingColors && this.skin.hitRingColors[ring.lane];
          const _hrCol = _hrRaw ? R.hitRingColor : col;
          const progress = 1 - ring.timer / ring.maxTimer;
          const radius   = 12 + progress * 40;
          const ra       = ring.timer / ring.maxTimer;
          ctx.strokeStyle  = _hrCol;
          ctx.globalAlpha  = ra * 0.65;
          ctx.lineWidth    = 2.5;
          ctx.shadowBlur   = 8 * ra;
          ctx.shadowColor  = _hrCol;
          ctx.beginPath();
          ctx.arc(HIT_X, cy, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur  = 0;
          ctx.globalAlpha = 1;
        }
      }

      // Hit burst effect
      if (this.skin.hitBurstEnabled !== false) {
        const _burstMul = this.skin.hitBurstIntensity ?? 1.0;
        for (let l = 0; l < N; l++) {
          if (this.hitFlashes[l] === null) continue;
          const ly  = l * LANE_H;
          const col = this.colors[l];
          const R = this._laneResolved[l];
          const _hbRaw = this.skin.hitBurstColors && this.skin.hitBurstColors[l];
          const _hbCol = _hbRaw ? R.hitBurstColor : col;
          const f   = this.hitFlashes[l] / 20;
          const bW  = (24 + (1 - f) * 60) * _burstMul;
          const b   = ctx.createLinearGradient(HIT_X + bW, 0, HIT_X, 0);
          b.addColorStop(0, _withAlphaCS(_hbCol, '00'));
          b.addColorStop(1, _hbCol);
          ctx.fillStyle   = b;
          ctx.globalAlpha = f * 0.5;
          ctx.fillRect(HIT_X - 4, ly + 3, bW + 4, LANE_H - 6);
          ctx.globalAlpha = 1;
        }
      }

      // Score bar
      const barH = Math.round(26 * textScale);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillStyle = this.skin.scoreColor || '#ffffff';
      ctx.font = `bold ${Math.round(14 * textScale)}px ${this.skin.fontFamily || 'monospace'}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const scoreStr = String(Math.max(0, Math.round(this.score))).padStart(7, '0');
      ctx.fillText(scoreStr, W / 2, 3);
      if (this.combo > 1 && this.skin.comboEnabled !== false) {
        ctx.fillStyle = this.skin.comboColor;
        ctx.font = `${Math.round(9 * textScale)}px ${this.skin.fontFamily || 'monospace'}`;
        ctx.fillText((this.skin.comboText || '{n} COMBO').replace('{n}', this.combo), W / 2, Math.round(16 * textScale));
      }
      ctx.textBaseline = 'alphabetic';

      // Judgment pops — position per lane in horizontal mode
      for (const p of this.judgePops) {
        const alpha = p.timer / p.maxTimer;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.font = `bold ${Math.round(p.size * textScale)}px ${this.skin.fontFamily || 'monospace'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const popY = (p.lane != null) ? p.lane * LANE_H + LANE_H / 2 : p.y;
        ctx.fillText(p.msg, HIT_X + 50, popY - (1 - alpha) * 12);
      }
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';

      // Status messages (no media / activation / no signal)
      if (this.cfg.mode === 'AUTO' && !this.paused) {
        const ctxSuspended = this.audioCtx?.state === 'suspended';
        const _msgBg = _withAlphaCS(this.skin.bgColor || '#0e0e1c', 'dd');
        if (ctxSuspended) {
          ctx.fillStyle = _msgBg;
          ctx.fillRect(HIT_X, H / 2 - 26, scrollW, 52);
          ctx.fillStyle = '#ffd040'; ctx.font = `bold ${Math.round(11 * textScale)}px ${this.skin.fontFamily || 'monospace'}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('CLICK PAGE TO', HIT_X + scrollW / 2, H / 2 - 8);
          ctx.fillText('ACTIVATE AUDIO', HIT_X + scrollW / 2, H / 2 + 10);
        } else if (!this.hasSignal) {
          const label = !this._audioEl ? 'NO MEDIA FOUND'
            : this._audioEl.paused ? 'MEDIA PAUSED' : 'NO SIGNAL';
          ctx.fillStyle = _msgBg;
          ctx.fillRect(HIT_X, H / 2 - 18, scrollW, 36);
          ctx.fillStyle = this.colors[0] || '#c060ff'; ctx.font = `bold ${Math.round(11 * textScale)}px ${this.skin.fontFamily || 'monospace'}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(label, HIT_X + scrollW / 2, H / 2);
        }
        ctx.textBaseline = 'alphabetic';
      }

      // Rising notes (RECORD mode visual feedback)
      if (this.cfg.mode === 'RECORD') this._renderRisingNotesH(ctx, HIT_X, LANE_H, scrollW);

      // REC timer
      if (this.cfg.mode === 'RECORD' && this.recStartMs !== null && !this._recStopped) {
        const elapsed = Math.floor((Date.now() - this.recStartMs) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss = String(elapsed % 60).padStart(2, '0');
        if (wallNow - this._lastStatusMs >= 1000) {
          this._lastStatusMs = wallNow;
          this._statusEl.textContent = `⏺ ${mm}:${ss}`;
        }
        ctx.fillStyle = 'rgba(255,64,96,0.18)';
        ctx.fillRect(W - 54, 4, 50, 16);
        ctx.fillStyle = '#ff4060'; ctx.font = 'bold ' + Math.round(9 * textScale) + 'px ' + (this.skin.fontFamily || 'monospace');
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText(`⏺ ${mm}:${ss}`, W - 4, 5);
      }

      // Result / pause overlays
      if (this.ended) { this._renderResult(ctx, W, H); return; }
      if (this.paused) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(16 * textScale)}px ${this.skin.fontFamily || 'monospace'}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('PAUSED', W / 2, H / 2);
        ctx.font = `${Math.round(9 * textScale)}px ${this.skin.fontFamily || 'monospace'}`; ctx.fillStyle = 'rgba(255,255,255,0.45)';
        const _pauseKeyLabel = this._keyLabel(this.cfg.pauseKey);
        const _exitKeyLabel  = this._keyLabel(this.cfg.exitKey);
        ctx.fillText('[' + _pauseKeyLabel + '] resume · [' + _exitKeyLabel + '] ' + (this.cfg.mode === 'RECORD' ? 'save' : 'close'), W / 2, H / 2 + 18);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // ── Render ────────────────────────────────────────────────────────────────────
    _render(wallNow) {
      if (this.cfg.horizontalMode) { this._renderHorizontal(wallNow); return; }
      const cv  = this._canvas, ctx = this._ctx;
      const W   = this.canvasW, H = this.canvasH;
      const N   = this.cfg.laneCount;
      const LW  = this.LANE_W;
      const HY  = this.HIT_Y;
      const NH  = this.NOTE_H;
      const textScale = Math.min(1.5, LW / 70);

      // Sync canvas resolution if resized
      if (W !== this._prevCvW || H !== this._prevCvH) {
        cv.width = W; cv.height = H;
        this._prevCvW = W; this._prevCvH = H;
        this._buildGradientCache();
      }

      // Background — clear first so semi-transparent gradient doesn't accumulate
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = this._cachedBgGrad || '#0e0e1c';
      ctx.fillRect(0, 0, W, H);

      // Lane backgrounds (game.js style: gradient + border + pressed tint)
      const _lgmV = this.skin.laneGradientMode || 'fade';
      for (let l = 0; l < N; l++) {
        const lx  = l * LW;
        const col = this.colors[l];
        if (_lgmV !== 'none') {
          if (_lgmV === 'solid') {
            ctx.fillStyle = _withAlphaCS(col, '17');
            ctx.fillRect(lx, this.LANE_TOP, LW, HY - this.LANE_TOP);
          } else {
            ctx.fillStyle = this._cachedLaneBgGrad[l] || _withAlphaCS(col, '18');
            ctx.fillRect(lx, this.LANE_TOP, LW, HY - this.LANE_TOP);
          }
        }

        const R = this._laneResolved[l];
        const _lbRaw = this.skin.laneBorderColors && this.skin.laneBorderColors[l];
        ctx.strokeStyle = _lbRaw ? _withAlphaCS(R.laneBorderColor, _alphaHexCS(R.laneBorderOpacity)) : _withAlphaCS(col, '36');
        ctx.lineWidth   = 1;
        ctx.strokeRect(lx + 0.5, this.LANE_TOP, LW, HY - this.LANE_TOP);

        if (this.pressedLanes.has(l)) {
          const _lpRaw = this.skin.lanePressColors && this.skin.lanePressColors[l];
          ctx.fillStyle = _lpRaw ? _withAlphaCS(R.lanePressColor, _alphaHexCS(R.lanePressOpacity)) : _withAlphaCS(col, '21');
          ctx.fillRect(lx, this.LANE_TOP, LW, HY - this.LANE_TOP);
        }
        if (this.missFlashes[l] !== null) {
          const _mfcV = this.skin.missFlashColor || '#ff3c50';
          const _mrV = parseInt(_mfcV.slice(1,3), 16), _mgV = parseInt(_mfcV.slice(3,5), 16), _mbV = parseInt(_mfcV.slice(5,7), 16);
          ctx.fillStyle = `rgba(${_mrV},${_mgV},${_mbV},${(this.missFlashes[l] / 14) * 0.22})`;
          ctx.fillRect(lx, this.LANE_TOP, LW, HY - this.LANE_TOP);
        }
      }

      // Notes — wall-clock timing
      const ordTime  = wallNow - this.cfg.delayLength;
      const approach = 1500 / Math.max(0.1, Math.min(5.0, this.cfg.scrollSpeed || 1));

      for (const note of this.notes) {
        if (note.state === 1) continue;
        const isMissed = note.state === 2;
        const col = isMissed ? this._getMissNoteColor(note.lane) : (this.colors[note.lane] || '#ffffff');
        const lx  = note.lane * LW;
        const noteY = HY * (1 - (note.startedAt - ordTime) / approach);
        const cullRef = (isMissed && note.endedAt !== null) ? note.endedAt : note.startedAt;
        const cullY = HY * (1 - (cullRef - ordTime) / approach);
        if (isMissed && cullY > HY + approach * 0.5) continue;
        const frac  = noteY / HY;                                   // 0=top, 1=at HIT_Y
        const alpha = isMissed ? 0.45 : (0.5 + 0.5 * Math.max(0, Math.min(1, frac)));
        const _maxGlow = this.skin.noteApproachGlow ?? 22;
        const glow  = isMissed ? 0 : (frac > 0.6 ? ((frac - 0.6) / 0.4) * _maxGlow : 0);

        if (note.state === 3) {
          // Active hold
          if (note.endedAt !== null) {
            const tailY = HY * (1 - (note.endedAt - ordTime) / approach);
            if (tailY <= HY) this._drawActiveHold(ctx, lx, Math.min(tailY, HY - 2), LW, col, note.lane);
          }
          continue;
        }

        if (note.endedAt !== null) {
          // Pending hold
          const tailY = HY * (1 - (note.endedAt - ordTime) / approach);
          const clampedTail = Math.max(this.LANE_TOP, tailY);
          if (noteY < -NH * 2 && clampedTail < this.LANE_TOP) continue;
          this._drawHoldNote(ctx, lx, noteY, clampedTail, LW, col, alpha, glow, note.lane, isMissed);
        } else {
          // Tap
          if (noteY < -NH || noteY > H + NH) continue;
          this._drawTapNote(ctx, lx, noteY, LW, col, alpha, glow, note.lane, isMissed);
        }
      }

      // Rising notes (RECORD mode visual feedback)
      if (this.cfg.mode === 'RECORD') this._renderRisingNotes(ctx);

      // Hit zone (game.js: per-lane colored line + hit flash glow)
      const _hzsV = this.skin.hitZoneStyle || 'glow';
      if (_hzsV !== 'none') {
        for (let l = 0; l < N; l++) {
          const lx  = l * LW;
          const col = this.colors[l];
          const R = this._laneResolved[l];
          const _hgRaw = this.skin.hitGlowColors && this.skin.hitGlowColors[l];
          if (_hzsV === 'glow') {
            ctx.fillStyle = _hgRaw ? _withAlphaCS(R.hitGlowColor, _alphaHexCS(R.hitGlowOpacity * 0.094)) : _withAlphaCS(col, '18');
            ctx.fillRect(lx + 4, HY - 4, LW - 8, 8);
          }
          const _hlRaw = this.skin.hitLineColors && this.skin.hitLineColors[l];
          ctx.strokeStyle = _hlRaw ? _withAlphaCS(R.hitLineColor, _alphaHexCS(R.hitLineOpacity * 0.667)) : _withAlphaCS(this.skin.hitLineColor, 'aa');
          ctx.lineWidth   = this.skin.hitLineWidth;
          ctx.beginPath();
          ctx.moveTo(lx + 5, HY);
          ctx.lineTo(lx + LW - 5, HY);
          ctx.stroke();
          if (this.hitFlashes[l] !== null) {
            const f = this.hitFlashes[l] / 20;
            const _hfRaw = this.skin.hitFlashColors && this.skin.hitFlashColors[l];
            const _hfCol = _hfRaw ? R.hitFlashColor : col;
            ctx.shadowBlur  = 18 * f * (this.skin.hitFlashIntensity ?? 1.0);
            ctx.shadowColor = _hfCol;
            ctx.strokeStyle = _hfCol;
            ctx.lineWidth   = 3;
            ctx.beginPath();
            ctx.moveTo(lx + 5, HY);
            ctx.lineTo(lx + LW - 5, HY);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      }

      // Hit rings
      if (this.skin.hitRingEnabled !== false) {
        for (const ring of this.hitRings) {
          const lx       = ring.lane * LW;
          const cx       = lx + LW / 2;
          const col      = this.colors[ring.lane];
          const R = this._laneResolved[ring.lane];
          const _hrRaw = this.skin.hitRingColors && this.skin.hitRingColors[ring.lane];
          const _hrCol = _hrRaw ? R.hitRingColor : col;
          const progress = 1 - ring.timer / ring.maxTimer;
          const radius   = 12 + progress * 40;
          const ra       = ring.timer / ring.maxTimer;
          ctx.strokeStyle  = _hrCol;
          ctx.globalAlpha  = ra * 0.65;
          ctx.lineWidth    = 2.5;
          ctx.shadowBlur   = 8 * ra;
          ctx.shadowColor  = _hrCol;
          ctx.beginPath();
          ctx.arc(cx, HY, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur  = 0;
          ctx.globalAlpha = 1;
        }
      }

      // Hit burst effect
      if (this.skin.hitBurstEnabled !== false) {
      const _burstMul = this.skin.hitBurstIntensity ?? 1.0;
      for (let l = 0; l < N; l++) {
        if (this.hitFlashes[l] === null) continue;
        const lx  = l * LW;
        const col = this.colors[l];
        const R = this._laneResolved[l];
        const _hbRaw = this.skin.hitBurstColors && this.skin.hitBurstColors[l];
        const _hbCol = _hbRaw ? R.hitBurstColor : col;
        const f   = this.hitFlashes[l] / 20;
        const bH  = (24 + (1 - f) * 60) * _burstMul;
        const b   = ctx.createLinearGradient(0, HY - bH, 0, HY);
        b.addColorStop(0, _withAlphaCS(_hbCol, '00'));
        b.addColorStop(1, _hbCol);
        ctx.fillStyle   = b;
        ctx.globalAlpha = f * 0.5;
        ctx.fillRect(lx + 3, HY - bH, LW - 6, bH + 4);
        ctx.globalAlpha = 1;
      }
      }

      // Key boxes (game.js style)
      const KY = this.KEYS_Y, KH = this.KEYS_H;
      const fontSize = Math.max(11, Math.min(26, Math.floor(LW * 0.22)));
      for (let l = 0; l < N; l++) {
        const lx      = l * LW;
        const col     = this.colors[l];
        const R = this._laneResolved[l];
        const pressed = this.pressedLanes.has(l);
        const label   = this._keyLabel(this.cfg.keybinds[l]);

        const _kbBgRaw = this.skin.keyBoxBgColors && this.skin.keyBoxBgColors[l];
        const _kbBorderRaw = this.skin.keyBoxBorderColors && this.skin.keyBoxBorderColors[l];
        const _kbTextRaw = this.skin.keyBoxTextColors && this.skin.keyBoxTextColors[l];

        const _kbM2 = this.skin.keyBoxMode || 'solid';
        if (pressed) {
          ctx.fillStyle = _withAlphaCS(col, 'cc');
        } else if (_kbM2 === 'dark') {
          ctx.fillStyle = _kbBgRaw ? _withAlphaCS(R.keyBoxBgColor, _alphaHexCS(R.keyBoxBgOpacity)) : _darkenHexCS(col, 0.15);
        } else if (_kbM2 === 'tinted') {
          ctx.fillStyle = _kbBgRaw ? _withAlphaCS(R.keyBoxBgColor, _alphaHexCS(R.keyBoxBgOpacity)) : this.skin.keyBoxColor;
          ctx.fillRect(lx, KY, LW, KH);
          ctx.fillStyle = _withAlphaCS(col, '20');
        } else {
          ctx.fillStyle = _kbBgRaw ? _withAlphaCS(R.keyBoxBgColor, _alphaHexCS(R.keyBoxBgOpacity)) : this.skin.keyBoxColor;
        }
        ctx.fillRect(lx, KY, LW, KH);

        if (pressed) { ctx.shadowBlur = 14; ctx.shadowColor = col; }
        const _borderCol = _kbBorderRaw ? _withAlphaCS(R.keyBoxBorderColor, _alphaHexCS(R.keyBoxBorderOpacity)) : _withAlphaCS(col, '55');
        ctx.strokeStyle = pressed ? col : _borderCol;
        ctx.lineWidth   = pressed ? 2.5 : 1;
        ctx.strokeRect(lx + 1, KY + 1, LW - 2, KH - 2);
        ctx.shadowBlur = 0;

        const _textCol = _kbTextRaw ? _withAlphaCS(R.keyBoxTextColor, _alphaHexCS(R.keyBoxTextOpacity)) : col;
        ctx.fillStyle    = pressed ? '#080810' : _textCol;
        ctx.font         = `bold ${fontSize}px ${this.skin.fontFamily || 'monospace'}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, lx + LW / 2, KY + KH / 2);
      }
      ctx.textBaseline = 'alphabetic';

      // Score / combo bar at top
      const barH = Math.round(26 * textScale);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillStyle = this.skin.scoreColor || '#ffffff';
      ctx.font      = 'bold ' + Math.round(14 * textScale) + 'px ' + (this.skin.fontFamily || 'monospace');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const scoreStr = String(Math.max(0, Math.round(this.score))).padStart(7, '0');
      ctx.fillText(scoreStr, W / 2, 3);
      if (this.combo > 1 && this.skin.comboEnabled !== false) {
        ctx.fillStyle = this.skin.comboColor;
        ctx.font      = Math.round(9 * textScale) + 'px ' + (this.skin.fontFamily || 'monospace');
        ctx.fillText((this.skin.comboText || '{n} COMBO').replace('{n}', this.combo), W / 2, Math.round(16 * textScale));
      }
      ctx.textBaseline = 'alphabetic';

      // Judgment pops
      for (const p of this.judgePops) {
        const alpha = p.timer / p.maxTimer;
        ctx.globalAlpha  = alpha;
        ctx.fillStyle    = p.color;
        ctx.font         = 'bold ' + Math.round(p.size * textScale) + 'px ' + (this.skin.fontFamily || 'monospace');
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(p.msg, p.x, p.y);
      }
      ctx.globalAlpha  = 1;
      ctx.textBaseline = 'alphabetic';

      // NO SIGNAL / activation message
      if (this.cfg.mode === 'AUTO' && !this.paused) {
        const ctxSuspended = this.audioCtx?.state === 'suspended';
        const _msgBg = _withAlphaCS(this.skin.bgColor || '#0e0e1c', 'dd');
        if (ctxSuspended) {
          ctx.fillStyle = _msgBg;
          ctx.fillRect(0, HY / 2 - 26, W, 52);
          ctx.fillStyle = '#ffd040'; ctx.font = 'bold ' + Math.round(11 * textScale) + 'px ' + (this.skin.fontFamily || 'monospace');
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('CLICK PAGE TO', W / 2, HY / 2 - 8);
          ctx.fillText('ACTIVATE AUDIO', W / 2, HY / 2 + 10);
        } else if (!this.hasSignal) {
          const label = !this._audioEl ? 'NO MEDIA FOUND'
            : this._audioEl.paused ? 'MEDIA PAUSED' : 'NO SIGNAL';
          ctx.fillStyle = _msgBg;
          ctx.fillRect(0, HY / 2 - 18, W, 36);
          ctx.fillStyle = this.colors[0] || '#c060ff'; ctx.font = 'bold ' + Math.round(11 * textScale) + 'px ' + (this.skin.fontFamily || 'monospace');
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(label, W / 2, HY / 2);
        }
        ctx.textBaseline = 'alphabetic';
      }

      // REC timer
      if (this.cfg.mode === 'RECORD' && this.recStartMs !== null && !this._recStopped) {
        const elapsed = Math.floor((Date.now() - this.recStartMs) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss = String(elapsed % 60).padStart(2, '0');
        if (wallNow - this._lastStatusMs >= 1000) {
          this._lastStatusMs = wallNow;
          this._statusEl.textContent = `⏺ ${mm}:${ss}`;
        }
        ctx.fillStyle = 'rgba(255,64,96,0.18)';
        ctx.fillRect(W - 54, 4, 50, 16);
        ctx.fillStyle = '#ff4060'; ctx.font = 'bold ' + Math.round(9 * textScale) + 'px ' + (this.skin.fontFamily || 'monospace');
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText(`⏺ ${mm}:${ss}`, W - 4, 5);
      }

      // Result screen (AUTO mode end)
      if (this.ended) {
        this._renderResult(ctx, W, H);
        return;
      }

      // Paused overlay
      if (this.paused) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(16 * textScale) + 'px ' + (this.skin.fontFamily || 'monospace');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('PAUSED', W / 2, H / 2);
        ctx.font = Math.round(9 * textScale) + 'px ' + (this.skin.fontFamily || 'monospace'); ctx.fillStyle = 'rgba(255,255,255,0.45)';
        const _pauseKeyLabel = this._keyLabel(this.cfg.pauseKey);
        const _exitKeyLabel  = this._keyLabel(this.cfg.exitKey);
        ctx.fillText('[' + _pauseKeyLabel + '] resume · [' + _exitKeyLabel + '] ' + (this.cfg.mode === 'RECORD' ? 'save' : 'close'), W / 2, H / 2 + 18);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // ── Note drawing (ported from game.js) ────────────────────────────────────────

    _diagonalStripes(ctx, x, y, w, h, color, spacing) {
      if (h <= 0 || w <= 0) return;
      spacing = spacing || 10;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = -(h + w); i <= w + h + spacing; i += spacing) {
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i + h, y + h);
      }
      ctx.stroke();
      ctx.restore();
    }

    _fillNoteShape(ctx, x, y, w, h, label) {
      const shape = this.skin.noteShape;
      const cx = x + w / 2, cy = y + h / 2;
      if (shape === 'diamond') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      } else if (shape === 'sharp') {
        ctx.fillRect(x, y, w, h);
      } else if (shape === 'circle') {
        ctx.beginPath();
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (shape === 'hexagon') {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 3 * i - Math.PI / 2;
          const px = cx + (w / 2) * Math.cos(a), py = cy + (h / 2) * Math.sin(a);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      } else if (shape === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(cx, y + h);
        ctx.lineTo(x, y);
        ctx.lineTo(x + w * 0.3, y);
        ctx.lineTo(cx, y + h * 0.6);
        ctx.lineTo(x + w * 0.7, y);
        ctx.lineTo(x + w, y);
        ctx.closePath();
        ctx.fill();
      } else if (shape === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(cx, y + h);
        ctx.lineTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.closePath();
        ctx.fill();
      } else if (shape === 'key') {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 4);
        ctx.fill();
        if (label) {
          const prevFill = ctx.fillStyle;
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.font = `bold ${Math.max(8, Math.floor(h * 0.7))}px ${this.skin.fontFamily || 'monospace'}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, cx, cy);
          ctx.fillStyle = prevFill;
          ctx.textAlign = 'start';
          ctx.textBaseline = 'alphabetic';
        }
      } else {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 4);
        ctx.fill();
      }
    }

    _strokeNoteShape(ctx, x, y, w, h) {
      const shape = this.skin.noteShape;
      const cx = x + w / 2, cy = y + h / 2;
      if (shape === 'diamond') {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.restore();
      } else if (shape === 'sharp') {
        ctx.strokeRect(x, y, w, h);
      } else if (shape === 'circle') {
        ctx.beginPath(); ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (shape === 'hexagon') {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 3 * i - Math.PI / 2;
          const px = cx + (w / 2) * Math.cos(a), py = cy + (h / 2) * Math.sin(a);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      } else if (shape === 'arrow') {
        ctx.beginPath(); ctx.moveTo(cx, y + h); ctx.lineTo(x, y);
        ctx.lineTo(x + w * 0.3, y); ctx.lineTo(cx, y + h * 0.6);
        ctx.lineTo(x + w * 0.7, y); ctx.lineTo(x + w, y);
        ctx.closePath(); ctx.stroke();
      } else if (shape === 'triangle') {
        ctx.beginPath(); ctx.moveTo(cx, y + h); ctx.lineTo(x, y);
        ctx.lineTo(x + w, y); ctx.closePath(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.stroke();
      }
    }

    _drawNoteIcon(ctx, img, x, y, w, h) {
      if (!img || !img.complete || !img.naturalWidth) return false;
      const iconScale = this.skin.noteIconScale !== undefined ? this.skin.noteIconScale : 1.0;
      const iconOffY  = this.skin.noteIconOffsetY || 0;
      const liveScale = this.LANE_W / 140;
      const sc = Math.min(w / img.naturalWidth, h / img.naturalHeight) * iconScale * liveScale;
      const iw = img.naturalWidth * sc, ih = img.naturalHeight * sc;
      ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2 + iconOffY, iw, ih);
      return true;
    }

    _drawTapNote(ctx, lx, yHead, lw, col, alpha, glow, laneIdx, isMiss) {
      const x = lx + 5, w = lw - 10, h = this.NOTE_H;
      const _shineS = new Set(['rounded', 'sharp', 'key', 'hexagon']);
      // Apply per-lane note color/opacity (skip for missed notes)
      const R = (!isMiss && this._laneResolved) ? this._laneResolved[laneIdx] : null;
      if (R) { col = R.noteColor; alpha *= R.noteOpacity; }
      ctx.globalAlpha = alpha;
      const _noteGlowCol = R ? R.noteGlowColor : col;
      ctx.shadowBlur  = glow;
      ctx.shadowColor = _noteGlowCol;

      if (this._drawNoteIcon(ctx, this._noteIconImg, x, yHead - h, w, h)) {
        // custom icon drawn
      } else {
        const ng = ctx.createLinearGradient(0, yHead - h, 0, yHead);
        ng.addColorStop(0, col);
        ng.addColorStop(1, _withAlphaCS(col, 'bb'));
        ctx.fillStyle = ng;
        const kl = (this.skin.noteShape === 'key' && this.cfg.keybinds && this.cfg.keybinds[laneIdx])
          ? this._keyLabel(this.cfg.keybinds[laneIdx]) : null;
        this._fillNoteShape(ctx, x, yHead - h, w, h, kl);

        ctx.shadowBlur = 0;
        const _noteShineCol = R ? R.noteShineColor : '#ffffff';
        const _noteShineOp  = R ? R.noteShineOpacity : 1.0;
        const _tapShineA = (this.skin.noteShine ?? 0.30) * _noteShineOp;
        if (_tapShineA > 0 && _shineS.has(this.skin.noteShape)) {
          const _shR = parseInt(_noteShineCol.slice(1,3), 16) || 255;
          const _shG = parseInt(_noteShineCol.slice(3,5), 16) || 255;
          const _shB = parseInt(_noteShineCol.slice(5,7), 16) || 255;
          ctx.fillStyle = `rgba(${_shR},${_shG},${_shB},${_tapShineA})`;
          if (this.skin.noteShape === 'sharp') {
            ctx.fillRect(x, yHead - h, w, 4);
          } else {
            ctx.beginPath(); ctx.roundRect(x, yHead - h, w, 4, [4, 4, 0, 0]); ctx.fill();
          }
        }
        // Note border stroke
        const _nbw = this.skin.noteBorderWidth || 0;
        if (_nbw > 0) {
          ctx.shadowBlur = 0;
          const bc = R ? R.noteBorderColor : ((this.skin.noteBorderColors && this.skin.noteBorderColors[laneIdx]) || col);
          ctx.strokeStyle = bc;
          ctx.lineWidth   = _nbw;
          this._strokeNoteShape(ctx, x, yHead - h, w, h);
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
    }

    _drawHoldNote(ctx, lx, yHead, yTail, lw, col, alpha, glow, laneIdx, isMiss) {
      const _hbw = this.skin.holdBodyWidth;
      const bx  = lx + Math.floor(lw * (1 - _hbw) / 2);
      const bw  = Math.floor(lw * _hbw);
      const hx  = lx + 4, hw = lw - 8;
      const hh  = this.NOTE_H + 6;
      const bodyTop = yHead - hh / 2;
      const bodyLen = Math.max(0, bodyTop - yTail);
      const _shineS = new Set(['rounded', 'sharp', 'key', 'hexagon']);
      // Apply per-lane hold color/opacity (skip for missed notes)
      const R = (!isMiss && this._laneResolved) ? this._laneResolved[laneIdx] : null;
      if (R) { col = R.holdColor; alpha *= R.holdOpacity; }
      const _holdBodyCol = R ? R.holdBodyColor : col;
      const _holdStripeCol = R ? R.holdStripeColor : col;
      const _holdBorderCol = R ? R.holdBorderColor : col;
      const _holdTailCapCol = R ? R.holdTailCapColor : col;

      ctx.globalAlpha = alpha;

      if (bodyLen > 0) {
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = _withAlphaCS(_holdBodyCol, '60');
        ctx.fillRect(bx, yTail, bw, bodyLen);
        if (this.skin.holdStripes !== false) this._diagonalStripes(ctx, bx, yTail, bw, bodyLen, _withAlphaCS(_holdStripeCol, '55'));
        const _hbwStroke = this.skin.holdBorderWidth ?? 1;
        if (_hbwStroke > 0) {
          ctx.strokeStyle = _withAlphaCS(_holdBorderCol, '77'); ctx.lineWidth = _hbwStroke;
          ctx.strokeRect(bx + 0.5, yTail + 0.5, bw - 1, bodyLen - 1);
        }
      }

      // Tail endcap
      const _tcwM = this.skin.tailCapWidth  != null ? this.skin.tailCapWidth  : 1.0;
      const _tchM = this.skin.tailCapHeight != null ? this.skin.tailCapHeight : 1.0;
      const tcOW = (bw + 4) * _tcwM, tcOH = 12 * _tchM;
      const tcIW = bw * _tcwM,       tcIH = 8 * _tchM;
      const _tcS = this.skin.tailCapStyle || 'rounded';
      const _tcCx = bx + bw / 2;
      ctx.shadowBlur  = 16; ctx.shadowColor = col;
      ctx.fillStyle   = '#ffffff'; ctx.globalAlpha = alpha;
      if (_tcS === 'flat') {
        ctx.fillRect(_tcCx - tcOW / 2, yTail - tcOH / 2, tcOW, tcOH);
      } else if (_tcS === 'pointed') {
        ctx.beginPath(); ctx.moveTo(_tcCx - tcOW / 2, yTail - tcOH / 2); ctx.lineTo(_tcCx + tcOW / 2, yTail - tcOH / 2); ctx.lineTo(_tcCx, yTail + tcOH / 2); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.roundRect(bx + (bw - tcOW) / 2, yTail - tcOH / 2, tcOW, tcOH, tcOH / 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle  = _holdTailCapCol;
      if (_tcS === 'flat') {
        ctx.fillRect(_tcCx - tcIW / 2, yTail - tcIH / 2, tcIW, tcIH);
      } else if (_tcS === 'pointed') {
        ctx.beginPath(); ctx.moveTo(_tcCx - tcIW / 2, yTail - tcIH / 2); ctx.lineTo(_tcCx + tcIW / 2, yTail - tcIH / 2); ctx.lineTo(_tcCx, yTail + tcIH / 2); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.roundRect(bx + (bw - tcIW) / 2, yTail - tcIH / 2, tcIW, tcIH, tcIH / 2); ctx.fill();
      }

      // Hold head — custom icon replaces standard head entirely
      if (this._noteIconImg && this._noteIconImg.complete && this._noteIconImg.naturalWidth) {
        const _iconSc = this.skin.noteIconScale !== undefined ? this.skin.noteIconScale : 1.0;
        const _liveSc = this.LANE_W / 140;
        const sc = Math.min(hw / this._noteIconImg.naturalWidth, hh / this._noteIconImg.naturalHeight) * _iconSc * _liveSc;
        const iw = this._noteIconImg.naturalWidth * sc, ih = this._noteIconImg.naturalHeight * sc;
        ctx.shadowBlur  = glow; ctx.shadowColor = col;
        ctx.globalAlpha = alpha;
        const _iconOffY = this.skin.noteIconOffsetY || 0;
        ctx.drawImage(this._noteIconImg, hx + (hw - iw) / 2, yHead - ih + _iconOffY, iw, ih);
        ctx.shadowBlur = 0;
      } else {
        ctx.shadowBlur  = glow; ctx.shadowColor = col;
        ctx.globalAlpha = alpha;
        const ng = ctx.createLinearGradient(0, yHead - hh, 0, yHead);
        ng.addColorStop(0,   '#ffffff');
        ng.addColorStop(0.3, col);
        ng.addColorStop(1,   _withAlphaCS(col, 'cc'));
        ctx.fillStyle = ng;
        const kl = (this.skin.noteShape === 'key' && this.cfg.keybinds && this.cfg.keybinds[laneIdx])
          ? this._keyLabel(this.cfg.keybinds[laneIdx]) : null;
        this._fillNoteShape(ctx, hx, yHead - hh, hw, hh, kl);

        ctx.shadowBlur  = 0;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
        for (let g = 0; g < 3; g++) {
          const gy = yHead - 5 - g * 5;
          ctx.beginPath(); ctx.moveTo(hx + 8, gy); ctx.lineTo(hx + hw - 8, gy); ctx.stroke();
        }
        const _noteShineCol = R ? R.noteShineColor : '#ffffff';
        const _noteShineOp  = R ? R.noteShineOpacity : 1.0;
        const _holdShineA = Math.min(1, (this.skin.noteShine ?? 0.30) * 1.33) * _noteShineOp;
        if (_holdShineA > 0 && _shineS.has(this.skin.noteShape)) {
          const _shR = parseInt(_noteShineCol.slice(1,3), 16) || 255;
          const _shG = parseInt(_noteShineCol.slice(3,5), 16) || 255;
          const _shB = parseInt(_noteShineCol.slice(5,7), 16) || 255;
          ctx.fillStyle = `rgba(${_shR},${_shG},${_shB},${_holdShineA})`;
          if (this.skin.noteShape === 'sharp') {
            ctx.fillRect(hx, yHead - hh, hw, 5);
          } else {
            ctx.beginPath(); ctx.roundRect(hx, yHead - hh, hw, 5, [5, 5, 0, 0]); ctx.fill();
          }
        }
        // Hold head border stroke
        const _nbwH = this.skin.noteBorderWidth || 0;
        if (_nbwH > 0) {
          ctx.shadowBlur = 0;
          const bcH = R ? R.noteBorderColor : ((this.skin.noteBorderColors && this.skin.noteBorderColors[laneIdx]) || col);
          ctx.strokeStyle = bcH;
          ctx.lineWidth   = _nbwH;
          this._strokeNoteShape(ctx, hx, yHead - hh, hw, hh);
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
    }

    _drawActiveHold(ctx, lx, yTail, lw, col, laneIdx) {
      const _hbw    = this.skin.holdBodyWidth;
      const bx      = lx + Math.floor(lw * (1 - _hbw) / 2);
      const bw      = Math.floor(lw * _hbw);
      const HY      = this.HIT_Y;
      const bodyLen = Math.max(0, HY - yTail);
      if (bodyLen === 0) return;
      // Apply per-lane hold color/opacity
      const R = (laneIdx != null && this._laneResolved) ? this._laneResolved[laneIdx] : null;
      if (R) col = R.holdColor;
      const _holdBodyCol = R ? R.holdBodyColor : col;
      const _holdStripeCol = R ? R.holdStripeColor : col;
      const _holdTailCapCol = R ? R.holdTailCapColor : col;
      const activeAlpha = 0.9 * (R ? R.holdOpacity : 1);

      ctx.globalAlpha = activeAlpha;
      const tg = ctx.createLinearGradient(0, yTail, 0, HY);
      tg.addColorStop(0, _withAlphaCS(_holdBodyCol, '55'));
      tg.addColorStop(1, _withAlphaCS(_holdBodyCol, 'dd'));
      ctx.fillStyle   = tg;
      ctx.shadowBlur  = 16; ctx.shadowColor = col;
      ctx.fillRect(bx, yTail, bw, bodyLen);
      ctx.shadowBlur = 0;

      if (this.skin.holdStripes !== false) this._diagonalStripes(ctx, bx, yTail, bw, bodyLen, _withAlphaCS(_holdStripeCol, '60'));

      // Tail endcap
      const _tcwM2 = this.skin.tailCapWidth  != null ? this.skin.tailCapWidth  : 1.0;
      const _tchM2 = this.skin.tailCapHeight != null ? this.skin.tailCapHeight : 1.0;
      const tcOW2 = (bw + 4) * _tcwM2, tcOH2 = 12 * _tchM2;
      const tcIW2 = bw * _tcwM2,       tcIH2 = 8 * _tchM2;
      const _tcS2 = this.skin.tailCapStyle || 'rounded';
      const _tcCx2 = bx + bw / 2;
      ctx.shadowBlur  = 20; ctx.shadowColor = col;
      ctx.fillStyle   = '#ffffff'; ctx.globalAlpha = 0.95;
      if (_tcS2 === 'flat') {
        ctx.fillRect(_tcCx2 - tcOW2 / 2, yTail - tcOH2 / 2, tcOW2, tcOH2);
      } else if (_tcS2 === 'pointed') {
        ctx.beginPath(); ctx.moveTo(_tcCx2 - tcOW2 / 2, yTail - tcOH2 / 2); ctx.lineTo(_tcCx2 + tcOW2 / 2, yTail - tcOH2 / 2); ctx.lineTo(_tcCx2, yTail + tcOH2 / 2); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.roundRect(bx + (bw - tcOW2) / 2, yTail - tcOH2 / 2, tcOW2, tcOH2, tcOH2 / 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle  = _holdTailCapCol;
      if (_tcS2 === 'flat') {
        ctx.fillRect(_tcCx2 - tcIW2 / 2, yTail - tcIH2 / 2, tcIW2, tcIH2);
      } else if (_tcS2 === 'pointed') {
        ctx.beginPath(); ctx.moveTo(_tcCx2 - tcIW2 / 2, yTail - tcIH2 / 2); ctx.lineTo(_tcCx2 + tcIW2 / 2, yTail - tcIH2 / 2); ctx.lineTo(_tcCx2, yTail + tcIH2 / 2); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.roundRect(bx + (bw - tcIW2) / 2, yTail - tcIH2 / 2, tcIW2, tcIH2, tcIH2 / 2); ctx.fill();
      }

      ctx.globalAlpha = 1;
    }

    // ── Result screen ─────────────────────────────────────────────────────────────
    _renderResult(ctx, W, H) {
      const textScale = Math.min(1.5, this.LANE_W / 70, H / 280);
      const { perfect, good, ok, miss } = this.judgments;
      const total    = perfect + good + ok + miss;
      const rawAcc   = total > 0 ? (perfect * 100 + good * 67 + ok * 33) / (total * 100) * 100 : 0;
      const accuracy = Math.round(rawAcc * 10) / 10;
      const rank     = accuracy >= 95 ? 'S' : accuracy >= 85 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 50 ? 'C' : 'D';
      const rankColor = { S: '#ffd040', A: '#60ff90', B: '#40c4ff', C: '#c060ff', D: '#ff8040' }[rank];

      // Background
      ctx.fillStyle = 'rgba(6,6,14,0.96)';
      ctx.fillRect(0, 0, W, H);

      // Top accent bar — use skin lane colors
      const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
      const c = this.colors;
      accentGrad.addColorStop(0,   c[0] || '#c060ff');
      accentGrad.addColorStop(0.5, c[Math.floor(c.length / 2)] || '#40c4ff');
      accentGrad.addColorStop(1,   c[c.length - 1] || '#c060ff');
      ctx.fillStyle = accentGrad;
      ctx.fillRect(0, 0, W, 3);

      // CLEAR title
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = 'bold ' + Math.round(20 * textScale) + 'px ' + (this.skin.fontFamily || 'monospace'); ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 14; ctx.shadowColor = this.colors[0] || '#c060ff';
      ctx.fillText('CLEAR', W / 2, 10);
      ctx.shadowBlur = 0;

      // Rank
      const rankSize = Math.min(Math.floor(W * 0.20), Math.round(40 * textScale));
      ctx.font = 'bold ' + rankSize + 'px ' + (this.skin.fontFamily || 'monospace');
      ctx.fillStyle = rankColor;
      ctx.shadowBlur = 20; ctx.shadowColor = rankColor;
      ctx.fillText(rank, W / 2, 36);
      ctx.shadowBlur = 0;

      // Score
      const scoreStr = String(Math.max(0, Math.round(this.score))).padStart(7, '0');
      ctx.font = 'bold ' + Math.min(Math.round(14 * textScale), Math.floor(W * 0.12)) + 'px ' + (this.skin.fontFamily || 'monospace');
      ctx.fillStyle = '#ffffff';
      ctx.fillText(scoreStr, W / 2, 36 + rankSize + 6);

      // Divider
      const divY = 36 + rankSize + 28;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W * 0.1, divY); ctx.lineTo(W * 0.9, divY);
      ctx.stroke();

      // Stats rows
      const rowFontSize = Math.min(Math.round(10 * textScale), Math.floor(W * 0.09));
      const rowH        = rowFontSize + 8;
      ctx.font = rowFontSize + 'px ' + (this.skin.fontFamily || 'monospace');

      const rows = [
        { label: 'MAX COMBO', val: String(this.maxCombo),      color: '#ffd040' },
        { label: 'ACCURACY',  val: accuracy.toFixed(1) + '%',  color: '#ffffff' },
      ];
      let rowY = divY + 8;
      for (const r of rows) {
        ctx.textAlign = 'left';  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(r.label, W * 0.1, rowY + rowFontSize);
        ctx.textAlign = 'right'; ctx.fillStyle = r.color;                  ctx.fillText(r.val,   W * 0.9, rowY + rowFontSize);
        rowY += rowH;
      }

      rowY += 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.moveTo(W * 0.1, rowY); ctx.lineTo(W * 0.9, rowY); ctx.stroke();
      rowY += 6;

      const judgRows = [
        { label: this.skin.perfectText || 'PERFECT', val: perfect, color: this.skin.perfectColor || '#ffd040' },
        { label: this.skin.goodText    || 'GOOD',    val: good,    color: this.skin.goodColor    || '#60ff90' },
        { label: this.skin.okText      || 'OK',      val: ok,      color: this.skin.okColor      || '#40c4ff' },
        { label: this.skin.missText    || 'MISS',    val: miss,    color: this.skin.missColor    || '#ff4060' },
      ];
      for (const r of judgRows) {
        ctx.textAlign = 'left';  ctx.fillStyle = r.color;     ctx.fillText(r.label,       W * 0.1, rowY + rowFontSize);
        ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff';   ctx.fillText(String(r.val), W * 0.9, rowY + rowFontSize);
        rowY += rowH;
      }

      // Save button
      const yPos = rowY + 4;
      if (!this._autoSaved) {
        const btnW = 120, btnH = 30;
        const btnX = (W - btnW) / 2;
        const btnY = yPos + 20;
        ctx.fillStyle = '#60ff90';
        ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 4); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold ' + Math.round(12 * textScale) + 'px ' + (this.skin.fontFamily || 'monospace');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('SAVE LEVEL', W / 2, btnY + btnH / 2);
        this._saveBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
      }
      if (this._autoSaved) {
        ctx.fillStyle = '#ffd040';
        ctx.font = 'bold ' + Math.round(12 * textScale) + 'px ' + (this.skin.fontFamily || 'monospace');
        ctx.textAlign = 'center';
        ctx.fillText('Saved!', W / 2, yPos + 35);
      }

      // Close hint
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.font = Math.min(Math.round(9 * textScale), rowFontSize - 1) + 'px ' + (this.skin.fontFamily || 'monospace');
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      const _resExitLabel = this.cfg.exitKey === 'Escape' ? 'Esc' : this.cfg.exitKey;
      ctx.fillText('[' + _resExitLabel + '] close', W / 2, H - 6);
      ctx.textBaseline = 'alphabetic';
    }

    // ── Rising notes (RECORD mode) ────────────────────────────────────────────────
    _renderRisingNotes(ctx) {
      const now   = Date.now();
      const speed = this.HIT_Y / 1000; // px/ms — travels full lane height in 1 s
      const LW    = this.LANE_W;
      const HY    = this.HIT_Y;
      const NH    = this.NOTE_H;

      for (let i = this.risingNotes.length - 1; i >= 0; i--) {
        const rn  = this.risingNotes[i];
        const col = this.colors[rn.lane] || '#ffffff';
        const lx  = rn.lane * LW;
        const _hbw = this.skin.holdBodyWidth;
        const bx  = lx + Math.floor(LW * (1 - _hbw) / 2);
        const bw  = Math.floor(LW * _hbw);
        const elapsed = now - rn.startMs;
        const headY   = HY - elapsed * speed; // top of note, rising upward

        if (rn.endMs === null) {
          // Still held: glowing bar from headY to HIT_Y, head cap at top
          this._drawActiveHold(ctx, lx, headY, LW, col, rn.lane);
          // Cap at the rising head
          ctx.globalAlpha = 0.95;
          ctx.shadowBlur = 14; ctx.shadowColor = col;
          const hg = ctx.createLinearGradient(0, headY - NH, 0, headY);
          hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.3, col); hg.addColorStop(1, _withAlphaCS(col, 'cc'));
          ctx.fillStyle = hg;
          ctx.beginPath(); ctx.roundRect(lx + 4, headY - NH, LW - 8, NH, [5, 5, 0, 0]); ctx.fill();
          ctx.shadowBlur = 0;
          const _ahShineA = Math.min(1, (this.skin.noteShine ?? 0.30) * 1.33);
          if (_ahShineA > 0) {
            ctx.fillStyle = `rgba(255,255,255,${_ahShineA})`;
            ctx.beginPath(); ctx.roundRect(lx + 4, headY - NH, LW - 8, 5, [5, 5, 0, 0]); ctx.fill();
          }
          ctx.globalAlpha = 1;

          if (headY < this.LANE_TOP - HY) this.risingNotes.splice(i, 1);

        } else {
          // Released: both ends rise, body fades out
          const holdMs     = rn.endMs - rn.startMs;
          const tailElapsed = now - rn.endMs;
          const tailY      = HY - tailElapsed * speed; // bottom of released note rises too
          const alpha      = Math.max(0, 1 - tailElapsed / 500);

          if (alpha <= 0 || tailY < this.LANE_TOP - 20) { this.risingNotes.splice(i, 1); continue; }

          ctx.globalAlpha = alpha;

          const isTap = holdMs < (this.cfg.holdThresholdMs || 100);
          if (!isTap) {
            // Hold body between headY and tailY (both rising)
            const bodyLen = Math.max(0, tailY - headY);
            if (bodyLen > 4) {
              const bg = ctx.createLinearGradient(0, headY, 0, tailY);
              bg.addColorStop(0, _withAlphaCS(col, 'dd')); bg.addColorStop(1, _withAlphaCS(col, '44'));
              ctx.fillStyle  = bg;
              ctx.shadowBlur = 12; ctx.shadowColor = col;
              ctx.fillRect(bx, headY, bw, bodyLen);
              ctx.shadowBlur = 0;
              if (this.skin.holdStripes !== false) this._diagonalStripes(ctx, bx, headY, bw, bodyLen, _withAlphaCS(col, '55'));
              // Tail endcap at bottom
              ctx.fillStyle = _withAlphaCS(col, 'aa');
              const _rtcS = this.skin.tailCapStyle || 'rounded';
              const _rtcCx = bx + bw / 2;
              const _rtcOW = bw + 4, _rtcOH = 10;
              if (_rtcS === 'flat') {
                ctx.fillRect(_rtcCx - _rtcOW / 2, tailY - _rtcOH / 2, _rtcOW, _rtcOH);
              } else if (_rtcS === 'pointed') {
                ctx.beginPath(); ctx.moveTo(_rtcCx - _rtcOW / 2, tailY - _rtcOH / 2); ctx.lineTo(_rtcCx + _rtcOW / 2, tailY - _rtcOH / 2); ctx.lineTo(_rtcCx, tailY + _rtcOH / 2); ctx.closePath(); ctx.fill();
              } else {
                ctx.beginPath(); ctx.roundRect(bx - 2, tailY - 5, bw + 4, 10, 5); ctx.fill();
              }
            }
          }

          // Head cap (top of note)
          ctx.shadowBlur = 10 * alpha; ctx.shadowColor = col;
          const hg = ctx.createLinearGradient(0, headY - NH, 0, headY);
          hg.addColorStop(0, col); hg.addColorStop(1, _withAlphaCS(col, 'bb'));
          ctx.fillStyle = hg;
          ctx.beginPath(); ctx.roundRect(lx + 5, headY - NH, LW - 10, NH, 4); ctx.fill();
          ctx.shadowBlur = 0;
          const _rShineA = this.skin.noteShine ?? 0.30;
          if (_rShineA > 0) {
            ctx.fillStyle = `rgba(255,255,255,${_rShineA})`;
            ctx.beginPath(); ctx.roundRect(lx + 5, headY - NH, LW - 10, 4, [4, 4, 0, 0]); ctx.fill();
          }

          ctx.globalAlpha = 1;
        }
      }
    }

    // ── Rising notes horizontal (RECORD mode) ──────────────────────────────────
    _renderRisingNotesH(ctx, HIT_X, LANE_H, scrollW) {
      const now = Date.now();
      const speed = scrollW / 1000; // px/ms — travels full scroll width in 1 s
      const N = this.cfg.laneCount;

      for (let i = this.risingNotes.length - 1; i >= 0; i--) {
        const rn  = this.risingNotes[i];
        const col = this.colors[rn.lane] || '#ffffff';
        const ly  = rn.lane * LANE_H;
        const _hbw = this.skin.holdBodyWidth;
        const by  = ly + Math.floor(LANE_H * (1 - _hbw) / 2);
        const bh  = Math.floor(LANE_H * _hbw);
        const noteW = Math.max(20, Math.min(28, Math.floor(LANE_H * 0.45)));
        const noteH = LANE_H - 8;
        const elapsed = now - rn.startMs;
        const headX   = HIT_X + elapsed * speed; // head moves rightward

        if (rn.endMs === null) {
          // Still held: glowing bar from HIT_X to headX
          const bodyW = Math.max(0, headX - HIT_X);
          if (bodyW > 0) {
            ctx.globalAlpha = 0.9;
            const tg = ctx.createLinearGradient(HIT_X, 0, headX, 0);
            tg.addColorStop(0, _withAlphaCS(col, 'dd'));
            tg.addColorStop(1, _withAlphaCS(col, '55'));
            ctx.fillStyle = tg;
            ctx.shadowBlur = 16; ctx.shadowColor = col;
            ctx.fillRect(HIT_X, by, bodyW, bh);
            ctx.shadowBlur = 0;
            if (this.skin.holdStripes !== false) this._diagonalStripes(ctx, HIT_X, by, bodyW, bh, _withAlphaCS(col, '60'));
          }
          // Head cap at the growing end
          ctx.globalAlpha = 0.95;
          ctx.shadowBlur = 14; ctx.shadowColor = col;
          const hg = ctx.createLinearGradient(headX, 0, headX + noteW, 0);
          hg.addColorStop(0, col); hg.addColorStop(0.7, col); hg.addColorStop(1, '#ffffff');
          ctx.fillStyle = hg;
          ctx.beginPath(); ctx.roundRect(headX, ly + (LANE_H - noteH) / 2, noteW, noteH, [0, 5, 5, 0]); ctx.fill();
          ctx.shadowBlur = 0;
          const _ahShineA = Math.min(1, (this.skin.noteShine ?? 0.30) * 1.33);
          if (_ahShineA > 0) {
            ctx.fillStyle = `rgba(255,255,255,${_ahShineA})`;
            ctx.beginPath(); ctx.roundRect(headX, ly + (LANE_H - noteH) / 2, noteW, 3, [0, 3, 0, 0]); ctx.fill();
          }
          ctx.globalAlpha = 1;
          if (headX > this.canvasW + scrollW) this.risingNotes.splice(i, 1);

        } else {
          // Released: both ends move right, body fades out
          const holdMs     = rn.endMs - rn.startMs;
          const tailElapsed = now - rn.endMs;
          const tailX      = HIT_X + tailElapsed * speed;
          const alpha      = Math.max(0, 1 - tailElapsed / 500);
          if (alpha <= 0 || tailX > this.canvasW + 20) { this.risingNotes.splice(i, 1); continue; }

          ctx.globalAlpha = alpha;
          const isTap = holdMs < (this.cfg.holdThresholdMs || 100);
          if (!isTap) {
            const bodyW = Math.max(0, headX - tailX);
            if (bodyW > 4) {
              const bg = ctx.createLinearGradient(tailX, 0, headX, 0);
              bg.addColorStop(0, _withAlphaCS(col, '44')); bg.addColorStop(1, _withAlphaCS(col, 'dd'));
              ctx.fillStyle = bg;
              ctx.shadowBlur = 12; ctx.shadowColor = col;
              ctx.fillRect(tailX, by, bodyW, bh);
              ctx.shadowBlur = 0;
              if (this.skin.holdStripes !== false) this._diagonalStripes(ctx, tailX, by, bodyW, bh, _withAlphaCS(col, '55'));
              // Tail endcap
              const _tcS = this.skin.tailCapStyle || 'rounded';
              const _tcwM = this.skin.tailCapWidth ?? 1.0;
              const _tchM = this.skin.tailCapHeight ?? 1.0;
              const tcH = (bh + 4) * _tcwM, tcW = 12 * _tchM;
              ctx.fillStyle = _withAlphaCS(col, 'aa');
              if (_tcS === 'flat') {
                ctx.fillRect(tailX - tcW / 2, ly + (LANE_H - tcH) / 2, tcW, tcH);
              } else if (_tcS === 'pointed') {
                ctx.beginPath(); ctx.moveTo(tailX + tcW / 2, ly + (LANE_H - tcH) / 2); ctx.lineTo(tailX + tcW / 2, ly + (LANE_H + tcH) / 2); ctx.lineTo(tailX - tcW / 2, ly + LANE_H / 2); ctx.closePath(); ctx.fill();
              } else {
                ctx.beginPath(); ctx.roundRect(tailX - tcW / 2, ly + (LANE_H - tcH) / 2, tcW, tcH, tcW / 2); ctx.fill();
              }
            }
          }

          // Head cap
          ctx.shadowBlur = 10 * alpha; ctx.shadowColor = col;
          const hg = ctx.createLinearGradient(headX, 0, headX + noteW, 0);
          hg.addColorStop(0, col); hg.addColorStop(1, _withAlphaCS(col, 'bb'));
          ctx.fillStyle = hg;
          ctx.beginPath(); ctx.roundRect(headX, ly + (LANE_H - noteH) / 2, noteW, noteH, 4); ctx.fill();
          ctx.shadowBlur = 0;
          const _rShineA = this.skin.noteShine ?? 0.30;
          if (_rShineA > 0) {
            ctx.fillStyle = `rgba(255,255,255,${_rShineA})`;
            ctx.beginPath(); ctx.roundRect(headX, ly + (LANE_H - noteH) / 2, noteW, 3, [3, 3, 0, 0]); ctx.fill();
          }

          ctx.globalAlpha = 1;
        }
      }
    }

    // ── DOM ───────────────────────────────────────────────────────────────────────
    _buildDOM() {
      document.getElementById('kr-live-overlay')?.remove();

      const container = document.createElement('div');
      container.id = 'kr-live-overlay';
      const _accent = this.skin.liveAccentColor || '#c060ff';
      const _bRad   = (this.skin.liveBorderRadius ?? 6) + 'px';
      Object.assign(container.style, {
        position: 'fixed', top: '20px', right: '20px',
        zIndex: '2147483647',
        background: 'transparent',
        borderRadius: _bRad,
        border: `1px solid ${_accent}30`,
        boxShadow: `0 4px 24px rgba(0,0,0,0.9), 0 0 6px ${_accent}26, inset 0 0 0 1px ${_accent}1f`,
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
        userSelect: 'none', fontFamily: 'monospace',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        minWidth: '100px', minHeight: '200px',
        outline: 'none',
      });

      container.tabIndex = -1;
      container.addEventListener('focus', () => { this._focused = true; this._updateGlow(); });
      container.addEventListener('blur', () => { this._focused = false; this.pressedLanes.clear(); this.freshPressLanes.clear(); this._updateGlow(); });
      container.addEventListener('mousedown', () => container.focus());

      const titlebar = document.createElement('div');
      Object.assign(titlebar.style, {
        background: 'rgba(0,0,0,0.6)', padding: '4px 8px',
        display: 'flex', alignItems: 'center', gap: '6px',
        cursor: 'grab', flexShrink: '0',
        borderBottom: `1px solid ${_accent}18`,
      });

      const titleSpan = document.createElement('span');
      titleSpan.textContent = 'KeyRhythm';
      Object.assign(titleSpan.style, { color: _accent, fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', flex: '1' });

      this._statusEl = document.createElement('span');
      this._statusEl.textContent = this.cfg.mode === 'RECORD' ? '⏺ REC' : '⚡ AUTO';
      Object.assign(this._statusEl.style, {
        fontSize: '10px', whiteSpace: 'nowrap',
        color: this.cfg.mode === 'RECORD' ? '#ff4060' : '#40c4ff',
      });

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      Object.assign(closeBtn.style, { background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px', padding: '0 2px', lineHeight: '1' });
      closeBtn.addEventListener('click', () => {
        if (this.cfg.mode === 'RECORD' && !this._recStopped) this._stopRecord();
        else { if (_overlay) { _overlay.stop(); _overlay = null; } }
      });

      titlebar.append(titleSpan, this._statusEl, closeBtn);

      this._canvas = document.createElement('canvas');
      this._canvas.width  = this.canvasW;
      this._canvas.height = this.canvasH;
      this._prevCvW = this.canvasW;
      this._prevCvH = this.canvasH;
      Object.assign(this._canvas.style, { display: 'block', width: this.canvasW + 'px', height: this.canvasH + 'px', flexShrink: '0' });
      this._ctx = this._canvas.getContext('2d');
      this._buildGradientCache();

      this._canvas.addEventListener('click', e => {
        if (!this.ended || this._autoSaved || !this._saveBtnRect) return;
        const rect = this._canvas.getBoundingClientRect();
        const scaleX = this.canvasW / rect.width;
        const scaleY = this.canvasH / rect.height;
        const cx = (e.clientX - rect.left) * scaleX;
        const cy = (e.clientY - rect.top) * scaleY;
        const b = this._saveBtnRect;
        if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
          this._saveAutoLevel();
        }
      });

      container.append(titlebar, this._canvas);
      document.body.appendChild(container);
      this._container = container;
      container.focus();

      this._makeDraggable(titlebar, container);
      this._makeResizable(container);
      container.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (this.cfg.mode === 'RECORD' && !this._recStopped) this._stopRecord();
        else { if (_overlay) { _overlay.stop(); _overlay = null; } }
      });
    }

    _makeDraggable(handle, container) {
      let dragging = false, ox = 0, oy = 0;
      handle.addEventListener('pointerdown', e => {
        if (e.target.tagName === 'BUTTON') return;
        dragging = true;
        const r = container.getBoundingClientRect();
        ox = e.clientX - r.left; oy = e.clientY - r.top;
        handle.style.cursor = 'grabbing';
        handle.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      handle.addEventListener('pointermove', e => {
        if (!dragging) return;
        container.style.left   = Math.max(0, Math.min(window.innerWidth  - container.offsetWidth,  e.clientX - ox)) + 'px';
        container.style.top    = Math.max(0, Math.min(window.innerHeight - container.offsetHeight, e.clientY - oy)) + 'px';
        container.style.right  = 'auto';
        container.style.bottom = 'auto';
      });
      handle.addEventListener('pointerup', () => { dragging = false; handle.style.cursor = 'grab'; });
    }

    _makeResizable(container) {
      const EDGE = 8;
      let resizing = false, dir = '', sx, sy, sw, sh;
      container.addEventListener('pointerdown', e => {
        const r = container.getBoundingClientRect();
        const onR = e.clientX - r.left >= r.width  - EDGE;
        const onB = e.clientY - r.top  >= r.height - EDGE;
        if (!onR && !onB) return;
        resizing = true;
        dir = (onR && onB) ? 'both' : (onR ? 'right' : 'bottom');
        sx = e.clientX; sy = e.clientY; sw = r.width; sh = r.height;
        container.setPointerCapture(e.pointerId);
        e.stopPropagation(); e.preventDefault();
      });
      container.addEventListener('pointermove', e => {
        if (!resizing) {
          const r = container.getBoundingClientRect();
          const onR = e.clientX - r.left >= r.width  - EDGE;
          const onB = e.clientY - r.top  >= r.height - EDGE;
          container.style.cursor = (onR && onB) ? 'nwse-resize' : onR ? 'ew-resize' : onB ? 'ns-resize' : 'default';
          return;
        }
        const N = this.cfg.laneCount;
        if (dir === 'right' || dir === 'both') {
          const lw = Math.max(40, Math.floor((sw + e.clientX - sx) / N));
          this.LANE_W = lw; this.canvasW = lw * N;
          container.style.width    = this.canvasW + 'px';
          this._canvas.style.width = this.canvasW + 'px';
        }
        if (dir === 'bottom' || dir === 'both') {
          this.canvasH = Math.max(200, sh + e.clientY - sy - 28);
          container.style.height    = (this.canvasH + 28) + 'px';
          this._canvas.style.height = this.canvasH + 'px';
          this._computeGeometry();
          this.hitFlashes  = new Array(this.cfg.laneCount).fill(null);
          this.missFlashes = new Array(this.cfg.laneCount).fill(null);
        }
      });
      container.addEventListener('pointerup', () => { resizing = false; });
    }

    // ── Save auto level ────────────────────────────────────────────────────────────
    async _saveAutoLevel() {
      if (this._autoSaved) return;
      this._autoSaved = true;

      // Convert auto-generated notes to standard format
      const allDone = this.completedNotes.concat(
        this.notes.filter(n => n.state === 1 || n.state === 2)
      );
      const baseTime = this.autoRecStartMs
        ?? (allDone.length > 0 ? allDone[0].startedAt : Date.now());
      const convertedNotes = allDone
        .map(n => ({
          time: (n.startedAt - baseTime) / 1000,
          lane: n.lane,
          duration: n.endedAt ? Math.max(0, (n.endedAt - n.startedAt) / 1000) : 0,
        }))
        .sort((a, b) => a.time - b.time);

      // Collect audio
      let audioBytes = null;
      if (this.autoRecorder && this.autoRecorder.state !== 'inactive') {
        await new Promise(resolve => {
          this.autoRecorder.onstop = resolve;
          this.autoRecorder.stop();
        });
      }
      if (this.autoRecChunks.length > 0) {
        const blob = new Blob(this.autoRecChunks, { type: 'audio/webm' });
        audioBytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      }

      const title = document.title || 'Live Recording';
      chrome.runtime.sendMessage({
        type: 'SAVE_RECORDING',
        notes: convertedNotes,
        audioBytes,
        title: 'Live: ' + title.slice(0, 60),
        artist: '',
        laneCount: this.cfg.laneCount,
      }, () => { void chrome.runtime.lastError; });
    }

    // ── Recording ─────────────────────────────────────────────────────────────────
    _stopRecord() {
      if (this._recStopped) return;
      this._recStopped = true;
      this._statusEl.textContent = 'Saving…';
      this._statusEl.style.color = '#ffd040';
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.stop();
      } else {
        this._finishRecording();
      }
    }

    async _finishRecording() {
      try {
        let audioBytes = [];
        if (this.recChunks.length > 0) {
          const blob = new Blob(this.recChunks, { type: this.recChunks[0]?.type || 'audio/webm' });
          audioBytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        }
        const offset = this.recAudioOffset || 0;
        const notes = this.recNotes
          .map(n => ({ ...n, time: n.time - offset }))
          .filter(n => n.time >= 0)
          .sort((a, b) => a.time - b.time);
        await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage({
              type:      'SAVE_RECORDING',
              notes,
              audioBytes,
              title:     'Live Rec ' + new Date().toLocaleString(),
              laneCount: this.cfg.laneCount,
            }, (resp) => {
              void chrome.runtime.lastError;
              resolve(resp);
            });
          } catch (e) {
            console.error('[KR Live] sendMessage failed:', e);
            resolve(null);
          }
        });
      } catch (err) {
        console.error('[KR Live] _finishRecording:', err);
      } finally {
        this.stop();
        _overlay = null;
      }
    }
  }
}
