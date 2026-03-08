(function() {
  'use strict';

  // Determine if this page should pause music instead of showing the player
  const PAUSE_PAGES = ['game.html', 'editor.html'];
  const currentPage = location.pathname.split('/').pop();
  const shouldPause = PAUSE_PAGES.some(p => currentPage === p);

  if (shouldPause) {
    chrome.runtime.sendMessage({ type: 'bgMusic:pause' });
    return;
  }

  // Signal to background.js that a music-friendly page is open.
  // When all ports disconnect (all pages/popup closed), background pauses audio.
  chrome.runtime.connect({ name: 'bgMusic' });

  // Check if widget is hidden via settings
  const _cfg = (typeof getSettings === 'function') ? getSettings() : {};
  if (_cfg.bgMusicWidget === false) return;

  // Detect popup page + separate music mode
  const _isPopupPage = document.body.classList.contains('popup-page');
  const _usePopupMusic = _isPopupPage && _cfg.separatePopupMusic;

  // Get the active background meta (popup-specific if separate bg enabled)
  function _getActiveBgMeta() {
    if (_isPopupPage && _cfg.separatePopupBg && typeof getPopupBgMeta === 'function') {
      return getPopupBgMeta();
    }
    return (typeof getAppBgMeta === 'function') ? getAppBgMeta() : null;
  }

  // ── State ──
  let expanded = false;
  let enabled = _cfg.bgMusic || false;
  let state = {
    playing: false, trackName: '',
    mode: _usePopupMusic ? (_cfg.popupBgMusicMode || 'random') : (_cfg.bgMusicMode || 'random'),
    volume: _usePopupMusic ? (_cfg.popupBgMusicVolume ?? 0.5) : (_cfg.bgMusicVolume ?? 0.5),
    hasBgVideo: false
  };
  let pollTimer = null;
  let bgVideoMode = false;
  let bgVideoEl = null;

  // ── DOM: mini-player ──
  const wrap = document.createElement('div');
  wrap.id = 'bgMusicPlayer';
  wrap.className = 'bgm-wrap';
  wrap.innerHTML = `
    <button class="bgm-btn" id="bgmToggle" title="Background Music">
      <span class="bgm-icon">\u266A</span>
    </button>
    <div class="bgm-panel bgm-hidden" id="bgmPanel">
      <div class="bgm-row bgm-enable-row">
        <label class="bgm-label">Background Music</label>
        <input type="checkbox" id="bgmEnable">
      </div>
      <div class="bgm-inner" id="bgmInner">
        <div class="bgm-row">
          <label class="bgm-label">Mode</label>
          <select id="bgmMode" class="bgm-select select-sm">
            <option value="random">Random Songs</option>
            <option value="bgVideo">BG Video Audio</option>
            <option value="custom">Custom Upload</option>
          </select>
        </div>
        <div class="bgm-divider"></div>
        <div class="bgm-track" id="bgmTrack" title="">\u2014</div>
        <div class="bgm-controls">
          <button class="bgm-ctrl" id="bgmPrev" title="Previous">\u23EE</button>
          <button class="bgm-ctrl bgm-play" id="bgmPlayPause" title="Play/Pause">\u25B6</button>
          <button class="bgm-ctrl" id="bgmNext" title="Next">\u23ED</button>
        </div>
        <div class="bgm-vol-row">
          <span class="bgm-vol-icon">\uD83D\uDD0A</span>
          <input type="range" class="bgm-vol" id="bgmVol" min="0" max="1" step="0.05" value="0.5">
        </div>
        <div class="bgm-pool" id="bgmPool">
          <button class="bgm-pool-hdr" id="bgmPoolHdr">Song Pool <span class="bgm-pool-arrow">\u25BE</span></button>
          <div class="bgm-pool-list bgm-hidden" id="bgmPoolList"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  // Apply the extension's custom select styling
  if (typeof initCustomSelects === 'function') initCustomSelects(wrap);

  const toggleBtn  = wrap.querySelector('#bgmToggle');
  const panel      = wrap.querySelector('#bgmPanel');
  const enableCb   = wrap.querySelector('#bgmEnable');
  const innerDiv   = wrap.querySelector('#bgmInner');
  const modeSelect = wrap.querySelector('#bgmMode');
  const trackEl    = wrap.querySelector('#bgmTrack');
  const prevBtn    = wrap.querySelector('#bgmPrev');
  const playBtn    = wrap.querySelector('#bgmPlayPause');
  const nextBtn    = wrap.querySelector('#bgmNext');
  const volSlider  = wrap.querySelector('#bgmVol');
  const poolDiv    = wrap.querySelector('#bgmPool');
  const poolHdr    = wrap.querySelector('#bgmPoolHdr');
  const poolList   = wrap.querySelector('#bgmPoolList');
  let poolOpen = false;

  // ── Song Pool UI ──
  async function buildPoolList() {
    if (typeof getAllSongs !== 'function') return;
    const songs = await getAllSongs();
    const excluded = (getSettings().bgMusicExcluded || []);
    poolList.innerHTML = '';
    if (!songs.length) {
      poolList.innerHTML = '<div class="bgm-pool-empty">No songs</div>';
      return;
    }
    songs.forEach(s => {
      const row = document.createElement('label');
      row.className = 'bgm-pool-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !excluded.includes(s.id);
      cb.addEventListener('change', () => {
        const ex = (getSettings().bgMusicExcluded || []).filter(id => id !== s.id);
        if (!cb.checked) ex.push(s.id);
        saveSettings({ bgMusicExcluded: ex });
        send('bgMusic:settingsChanged');
      });
      const name = document.createElement('span');
      name.className = 'bgm-pool-name';
      name.textContent = (s.title || 'Untitled') + (s.artist ? ' \u2014 ' + s.artist : '');
      row.appendChild(cb);
      row.appendChild(name);
      poolList.appendChild(row);
    });
  }

  poolHdr.addEventListener('click', (e) => {
    e.stopPropagation();
    poolOpen = !poolOpen;
    poolList.classList.toggle('bgm-hidden', !poolOpen);
    poolHdr.querySelector('.bgm-pool-arrow').textContent = poolOpen ? '\u25B4' : '\u25BE';
    if (poolOpen) buildPoolList();
  });

  // ── Background Video Audio mode (page-local) ──
  function _effectiveVol() {
    const mv = (typeof getSettings === 'function') ? (getSettings().masterVolume ?? 1) : 1;
    return Math.min(1, state.volume * mv);
  }

  function initBgVideoMode() {
    bgVideoMode = true;
    bgVideoEl = document.getElementById('_krAppBg');
    if (bgVideoEl && bgVideoEl.tagName === 'VIDEO') {
      bgVideoEl.muted = false;
      bgVideoEl.volume = _effectiveVol();
      state.playing = true;
      state.trackName = 'Background Video';
    }
  }

  function stopBgVideoMode() {
    if (bgVideoEl && bgVideoEl.tagName === 'VIDEO') {
      bgVideoEl.muted = true;
    }
    bgVideoMode = false;
    bgVideoEl = null;
  }

  function setBgVideoVolume(v) {
    if (bgVideoEl && bgVideoEl.tagName === 'VIDEO') {
      const mv = (typeof getSettings === 'function') ? (getSettings().masterVolume ?? 1) : 1;
      bgVideoEl.volume = Math.min(1, v * mv);
    }
  }

  // ── UI sync ──
  function syncUI() {
    enableCb.checked = enabled;
    innerDiv.style.display = enabled ? '' : 'none';
    modeSelect.value = state.mode;

    playBtn.textContent = state.playing ? '\u23F8' : '\u25B6';
    playBtn.title = state.playing ? 'Pause' : 'Play';
    trackEl.textContent = state.trackName || '\u2014';
    trackEl.title = state.trackName || '';
    volSlider.value = state.volume;
    toggleBtn.classList.toggle('bgm-playing', state.playing && enabled);

    // Hide prev/next and pool for non-random modes
    const showNav = state.mode === 'random';
    prevBtn.style.display = showNav ? '' : 'none';
    nextBtn.style.display = showNav ? '' : 'none';
    poolDiv.style.display = showNav ? '' : 'none';
  }

  function expand() {
    expanded = true;
    panel.classList.remove('bgm-hidden');
    toggleBtn.classList.add('bgm-expanded');
    startPoll();
  }

  function collapse() {
    expanded = false;
    panel.classList.add('bgm-hidden');
    toggleBtn.classList.remove('bgm-expanded');
    stopPoll();
  }

  // ── Messaging ──
  function _popupOverrides() {
    if (!_usePopupMusic) return undefined;
    const c = (typeof getSettings === 'function') ? getSettings() : {};
    return { mode: c.popupBgMusicMode || 'random', volume: c.popupBgMusicVolume ?? 0.5 };
  }

  function send(type, extra) {
    const msg = { type, ...extra };
    // Attach popup overrides for settings-related messages
    if (_usePopupMusic && (type === 'bgMusic:settingsChanged' || type === 'bgMusic:init')) {
      msg.overrides = _popupOverrides();
    }
    return new Promise(resolve => {
      chrome.runtime.sendMessage(msg, resp => {
        // Ignore chrome.runtime.lastError (e.g. no listener yet)
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(resp);
      });
    });
  }

  async function fetchState() {
    const res = await send('bgMusic:getState');
    if (res && !bgVideoMode) {
      Object.assign(state, res);
      syncUI();
    }
  }

  function startPoll() {
    stopPoll();
    if (!bgVideoMode) pollTimer = setInterval(fetchState, 2000);
  }

  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ── Events ──
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    expanded ? collapse() : expand();
  });

  enableCb.addEventListener('change', async () => {
    enabled = enableCb.checked;
    saveSettings({ bgMusic: enabled });
    if (enabled) {
      await send('bgMusic:ensureReady');
      await send('bgMusic:settingsChanged');
      // Small delay for offscreen to init
      setTimeout(fetchState, 300);
    } else {
      await send('bgMusic:pause');
      state.playing = false;
      if (bgVideoMode) stopBgVideoMode();
    }
    syncUI();
  });

  modeSelect.addEventListener('change', async () => {
    const newMode = modeSelect.value;
    state.mode = newMode;
    const modeKey = _usePopupMusic ? 'popupBgMusicMode' : 'bgMusicMode';
    saveSettings({ [modeKey]: newMode });
    if (bgVideoMode) stopBgVideoMode();

    if (newMode === 'bgVideo') {
      // Check if there's a video background
      const meta = _getActiveBgMeta();
      if (meta && meta.type === 'video') {
        initBgVideoMode();
      } else {
        state.trackName = 'No video background';
      }
      await send('bgMusic:pause');
    } else {
      await send('bgMusic:settingsChanged');
      if (expanded) startPoll();
      setTimeout(fetchState, 300);
    }
    syncUI();
  });

  playBtn.addEventListener('click', async () => {
    if (bgVideoMode) {
      if (bgVideoEl) {
        if (state.playing) { bgVideoEl.muted = true; state.playing = false; }
        else { bgVideoEl.muted = false; bgVideoEl.volume = _effectiveVol(); state.playing = true; }
      }
      syncUI();
      return;
    }
    await send(state.playing ? 'bgMusic:pause' : 'bgMusic:play');
    state.playing = !state.playing;
    syncUI();
  });

  prevBtn.addEventListener('click', async () => {
    if (bgVideoMode) return;
    await send('bgMusic:prev');
    setTimeout(fetchState, 200);
  });

  nextBtn.addEventListener('click', async () => {
    if (bgVideoMode) return;
    await send('bgMusic:next');
    setTimeout(fetchState, 200);
  });

  volSlider.addEventListener('input', () => {
    const v = parseFloat(volSlider.value);
    state.volume = v;
    if (bgVideoMode) {
      setBgVideoVolume(v);
    } else {
      send('bgMusic:setVolume', { volume: v });
    }
    const volKey = _usePopupMusic ? 'popupBgMusicVolume' : 'bgMusicVolume';
    saveSettings({ [volKey]: v });
  });

  // Close panel on outside click
  document.addEventListener('click', (e) => {
    if (expanded && !wrap.contains(e.target)) collapse();
  });

  // ── React to master volume changes (update bgVideo element) ──
  window.addEventListener('masterVolumeChanged', () => {
    if (bgVideoMode && bgVideoEl) {
      bgVideoEl.volume = _effectiveVol();
    }
  });

  // ── React to background changes (video element replaced by applyAppBg) ──
  window.addEventListener('appBgChanged', () => {
    if (!enabled || state.mode !== 'bgVideo') return;
    const newEl = document.getElementById('_krAppBg');
    if (newEl && newEl.tagName === 'VIDEO') {
      bgVideoMode = true;
      bgVideoEl = newEl;
      bgVideoEl.muted = false;
      bgVideoEl.volume = _effectiveVol();
      state.playing = true;
      state.trackName = 'Background Video';
    } else {
      if (bgVideoMode) stopBgVideoMode();
      state.trackName = 'No video background';
      state.playing = false;
    }
    syncUI();
  });

  // ── Init ──
  async function init() {
    if (!enabled) { syncUI(); return; }

    // Ensure offscreen document exists before sending commands
    await send('bgMusic:ensureReady');
    // Give offscreen scripts time to execute on first creation
    await new Promise(r => setTimeout(r, 150));

    const res = await send('bgMusic:getState');
    if (res) Object.assign(state, res);

    // If bgVideo mode, handle locally
    if (state.mode === 'bgVideo') {
      const meta = _getActiveBgMeta();
      if (meta && meta.type === 'video') {
        initBgVideoMode();
      } else {
        state.trackName = 'No video background';
      }
    }

    syncUI();

    // If popup with separate music, push overrides to offscreen
    if (_usePopupMusic && !bgVideoMode) {
      await send('bgMusic:settingsChanged');
    }

    // If music was paused (e.g. by game page), resume it
    if (!state.playing && !bgVideoMode && enabled) {
      await send('bgMusic:play');
      state.playing = true;
      setTimeout(fetchState, 300);
    }
  }

  init();
})();
