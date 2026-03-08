(function() {
  'use strict';

  let ctx = null;
  let gainNode = null;
  let sourceNode = null;
  let playing = false;
  let currentTrackName = '';
  let mode = 'random';
  let volume = 0.5;
  let masterVolume = 1.0;

  // Random mode state
  let songList = [];
  let remaining = []; // songs not yet played this cycle (shuffle-without-replacement)
  let history = [];
  let historyIdx = -1;

  function ensureCtx() {
    if (!ctx) {
      ctx = new AudioContext();
      gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);
    }
    gainNode.gain.value = volume * masterVolume;
    return ctx;
  }

  function stopCurrent() {
    if (sourceNode) {
      sourceNode.onended = null; // prevent stale callback from triggering playNextRandom
      try { sourceNode.stop(); } catch (_) {}
      sourceNode.disconnect();
      sourceNode = null;
    }
    playing = false;
  }

  async function playBuffer(buffer, trackName, loop) {
    ensureCtx();
    stopCurrent();
    if (ctx.state === 'suspended') await ctx.resume();
    sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.loop = !!loop;
    sourceNode.connect(gainNode);
    sourceNode.start();
    playing = true;
    currentTrackName = trackName || 'Unknown';

    if (!loop) {
      sourceNode.onended = () => {
        if (playing) playNextRandom();
      };
    }
  }

  async function loadAndPlaySong(songId) {

    const song = await getSong(songId);
    const audioBuf = await getAudio(songId);
    if (!audioBuf) return;
    ensureCtx();
    const decoded = await ctx.decodeAudioData(audioBuf.slice(0));
    const name = song ? (song.title || 'Unknown') + (song.artist ? ' — ' + song.artist : '') : 'Unknown';
    await playBuffer(decoded, name, false);
  }

  async function refreshSongList() {
    const all = await getAllSongs();
    const excluded = (getSettings().bgMusicExcluded || []);
    songList = excluded.length ? all.filter(s => !excluded.includes(s.id)) : all;
  }

  async function playNextRandom() {
    if (!songList.length) {
      await refreshSongList();
      if (!songList.length) { playing = false; currentTrackName = 'No songs available'; return; }
    }
    // Refill remaining pool when all songs have been played (shuffle-without-replacement)
    if (!remaining.length) {
      remaining = [...songList];
    }
    let pick;
    if (remaining.length === 1) {
      pick = remaining.splice(0, 1)[0];
    } else {
      // Avoid picking the song that just finished (if possible)
      const currentId = historyIdx >= 0 && history[historyIdx] ? history[historyIdx].id : null;
      const candidates = remaining.filter(s => s.id !== currentId);
      const pool = candidates.length ? candidates : remaining;
      const idx = Math.floor(Math.random() * pool.length);
      pick = pool[idx];
      remaining.splice(remaining.indexOf(pick), 1);
    }
    history = history.slice(0, historyIdx + 1);
    history.push(pick);
    historyIdx = history.length - 1;
    await loadAndPlaySong(pick.id);
  }

  async function playPrevRandom() {
    if (historyIdx > 0) {
      historyIdx--;
      await loadAndPlaySong(history[historyIdx].id);
    }
  }

  async function playCustomAudio() {
    const entry = await getBg('bg_audio');
    if (!entry || !entry.data) { playing = false; currentTrackName = 'No custom audio'; return; }
    ensureCtx();
    const arrayBuf = await entry.data.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuf);
    await playBuffer(decoded, 'Custom Audio', true);
  }

  async function initPlayback(overrides) {
    const cfg = getSettings();
    if (!cfg.bgMusic) { stopCurrent(); return; }
    mode = (overrides && overrides.mode) || cfg.bgMusicMode || 'random';
    volume = (overrides && overrides.volume != null) ? overrides.volume : (cfg.bgMusicVolume ?? 0.5);
    masterVolume = cfg.masterVolume ?? 1.0;
    if (gainNode) gainNode.gain.value = volume * masterVolume;

    if (mode === 'bgVideo') {
      stopCurrent();
      currentTrackName = '';
      return;
    }
    if (mode === 'custom') {
      await playCustomAudio();
      return;
    }
    await refreshSongList();
    remaining = []; // reset cycle so new/deleted/excluded songs are picked up
    await playNextRandom();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg.type || !msg.type.startsWith('bgMusic:')) return false;
    // ensureReady is handled by background.js, ignore here
    if (msg.type === 'bgMusic:ensureReady') return false;

    const handle = async () => {
      switch (msg.type) {
        case 'bgMusic:init':
        case 'bgMusic:settingsChanged':
          await initPlayback(msg.overrides);
          return { ok: true };

        case 'bgMusic:play':
          if (ctx && ctx.state === 'suspended') await ctx.resume();
          if (!sourceNode && mode === 'random') await playNextRandom();
          else if (!sourceNode && mode === 'custom') await playCustomAudio();
          playing = true;
          return { ok: true };

        case 'bgMusic:pause':
          if (ctx && ctx.state === 'running') await ctx.suspend();
          playing = false;
          return { ok: true };

        case 'bgMusic:next':
          if (mode === 'random') await playNextRandom();
          return { ok: true };

        case 'bgMusic:prev':
          if (mode === 'random') await playPrevRandom();
          return { ok: true };

        case 'bgMusic:setVolume':
          volume = msg.volume ?? 0.5;
          if (gainNode) gainNode.gain.value = volume * masterVolume;
          return { ok: true };

        case 'bgMusic:setMasterVolume':
          masterVolume = msg.volume ?? 1.0;
          if (gainNode) gainNode.gain.value = volume * masterVolume;
          return { ok: true };

        case 'bgMusic:getState': {
          let hasCustomAudio = false;
          try { const e = await getBg('bg_audio'); hasCustomAudio = !!e; } catch (_) {}
          const bgMeta = (typeof getAppBgMeta === 'function') ? getAppBgMeta() : null;
          const hasBgVideo = bgMeta && bgMeta.type === 'video';
          return {
            playing,
            trackName: currentTrackName,
            mode,
            volume,
            hasCustomAudio,
            hasBgVideo: !!hasBgVideo
          };
        }

        default:
          return { ok: false };
      }
    };

    handle().then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  });

  initPlayback();
})();
