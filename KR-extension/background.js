// Open an extension page in a new tab (called from popup)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'openTab') {
    chrome.tabs.create({ url: chrome.runtime.getURL(msg.path) });
    return false;
  }
  if (msg.type === 'SAVE_RECORDING') {
    bgHandleSaveRecording(msg, sendResponse);
    return true; // keep channel open for async response
  }
});

async function bgHandleSaveRecording(msg, sendResponse) {
  try {
    await chrome.storage.session.set({ kr_pending_rec: msg });
    chrome.tabs.create({ url: chrome.runtime.getURL('record-complete.html') });
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ── Background Music: offscreen document management ──
let _bgMusicOffscreenReady = false;

async function ensureBgMusicOffscreen() {
  if (_bgMusicOffscreenReady) return;
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'bg-music-offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Background music playback across extension pages'
      });
    }
    _bgMusicOffscreenReady = true;
  } catch (e) {
    console.warn('[BG Music] Failed to create offscreen document:', e);
  }
}

// Pages call bgMusic:ensureReady before sending commands.
// All other bgMusic:* messages go directly to the offscreen doc
// (chrome.runtime.sendMessage broadcasts to all contexts).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'bgMusic:ensureReady') {
    ensureBgMusicOffscreen().then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type && msg.type.startsWith('bgMusic:')) {
    // Ensure offscreen exists (fire-and-forget), let offscreen handle the message
    ensureBgMusicOffscreen();
    return false;
  }
});

// ── Pause background music when all extension pages / popup close ──
let _bgMusicPorts = 0;

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'bgMusic') return;
  _bgMusicPorts++;

  port.onDisconnect.addListener(() => {
    _bgMusicPorts--;
    if (_bgMusicPorts <= 0) {
      _bgMusicPorts = 0;
      if (_bgMusicOffscreenReady) {
        chrome.runtime.sendMessage({ type: 'bgMusic:pause' }).catch(() => {});
      }
    }
  });
});
