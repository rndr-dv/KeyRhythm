// Shared settings & high-score store (localStorage)
const _SK     = 'keyrhythm_settings';
const _HK     = 'keyrhythm_scores';
const _SKIN_K = 'keyrhythm_skin';

const DEFAULT_SETTINGS = {
  scrollSpeed:      1.0,   // note fall speed
  audioOffset:      0,     // ms: compensates audio/input lag
  practiceSpeed:    1.0,   // audio playback rate
  practiceMode:     false, // no-death mode
  keybinds:         { 0: '[', 1: ']', 2: '\\', 3: 'Enter', 4: 'a', 5: 's', 6: 'd' },
  keybindProfiles:  {},    // { '2': {0:'[',1:']'}, '3': {...}, ... } — per-lane-count overrides
  holdThreshold:    100,   // ms: min key hold time to register as a hold note (create page)
  hitsound:         'tick',
  hitsoundVolume:   0.5,
  masterVolume:     1.0,
  musicVolume:      1.0,
  metronomeVolume:  0.5,
  laneHitsounds:    {},    // per-lane overrides: { 0: 'bass', 1: 'click', ... }
  laneSliderEndSounds: {}, // per-lane hold-end overrides: { 0: 'bell', ... }
  sliderTickSound:  '',    // '' = same as global hitsound
  sliderEndSound:   '',    // '' = same as global hitsound
  enableGlide:      true,  // whether adjacent-lane holds auto-convert to glide notes
  tapTempoKey:      ' ',   // key used to tap BPM in editor tap mode
  liveExitKey:      'Escape', // key to exit/save in Live overlay
  livePauseKey:     ' ',      // key to pause/resume in Live overlay
  liveHorizontalMode: false,  // horizontal scroll mode for Live overlay
  liveHitsound:       true,   // play hitsounds during Live autoplay
  customHitsounds:  {},       // custom hitsound library: { name: base64 }
  hitsoundAutoPitch: false,   // shift hitsound pitch by lane (left=lower, right=higher)
  hitsoundPitchRange: 0.2,   // ±range around 1.0 (0.2 → 0.8×–1.2×)
  appBgImageOpacity:    0.3,  // 0–1 app background image opacity
  appBgImageSaturation: 100,  // 0–200% saturation
  appBgImageBlur:       0,    // 0–20 px blur
  popupBgImageOpacity:    0.3,  // 0–1 popup background image opacity
  popupBgImageSaturation: 100,  // 0–200% saturation
  popupBgImageBlur:       0,    // 0–20 px blur
  bgMusic:        false,   // enable background music on non-game pages
  bgMusicMode:    'random', // 'random' | 'bgVideo' | 'custom'
  bgMusicVolume:  0.5,     // 0–1 background music volume
  bgMusicWidget:  true,    // show the mini-player bubble on non-game pages
  bgMusicExcluded: [],     // song IDs excluded from random pool
  separatePopupBg:    false, // use different background for popup page
  separatePopupMusic: false, // use different bg music settings for popup page
  popupBgMusicMode:   'random', // popup-specific bg music mode
  popupBgMusicVolume: 0.5,     // popup-specific bg music volume
  autosave:           false,   // auto-save changes in editor, skin editor, theme editor
  strictRelease:      false,   // judge hold release timing (Perfect/Good/OK/Miss windows)
};

function getSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(_SK) || '{}');
    const merged = { ...DEFAULT_SETTINGS, ...saved };
    merged.keybinds        = { ...DEFAULT_SETTINGS.keybinds, ...(saved.keybinds || {}) };
    merged.keybindProfiles = saved.keybindProfiles || {};
    merged.laneHitsounds       = saved.laneHitsounds       || {};
    merged.laneSliderEndSounds = saved.laneSliderEndSounds || {};
    merged.customHitsounds     = saved.customHitsounds     || {};
    return merged;
  } catch (_) { return { ...DEFAULT_SETTINGS }; }
}

// Returns the effective keybind map for a given lane count.
// Falls back through: profile[count] → global keybinds → defaults.
function getKeybindsForLanes(count) {
  const cfg = getSettings();
  const DEFAULT_KEYS = ['[', ']', '\\', 'Enter', 'a', 's', 'd'];
  const profile  = (cfg.keybindProfiles || {})[String(count)] || {};
  const fallback = cfg.keybinds || {};
  const result   = {};
  for (let i = 0; i < count; i++) {
    result[i] = profile[i] !== undefined ? profile[i]
              : (fallback[i] !== undefined ? fallback[i] : (DEFAULT_KEYS[i] || ''));
  }
  return result;
}

function saveSettings(partial) {
  localStorage.setItem(_SK, JSON.stringify({ ...getSettings(), ...partial }));
}

// Reset settings to defaults. Pass an array of key names to reset specific keys, or 'all' to reset everything.
function resetSettings(keys) {
  if (keys === 'all') {
    localStorage.setItem(_SK, JSON.stringify({ ...DEFAULT_SETTINGS }));
  } else {
    const current = getSettings();
    const patch = {};
    for (const k of keys) { if (k in DEFAULT_SETTINGS) patch[k] = DEFAULT_SETTINGS[k]; }
    localStorage.setItem(_SK, JSON.stringify({ ...current, ...patch }));
  }
}

function getHighScore(songId) {
  try { return (JSON.parse(localStorage.getItem(_HK) || '{}') || {})[songId] || null; }
  catch (_) { return null; }
}

function setHighScore(songId, data) {
  try {
    const all = JSON.parse(localStorage.getItem(_HK) || '{}');
    const prev = all[songId];
    const better = !prev
      || data.score > (prev.score ?? 0)
      || (data.score === (prev.score ?? 0) && data.accuracy > (prev.accuracy ?? 0))
      || (data.score === (prev.score ?? 0) && data.accuracy === (prev.accuracy ?? 0) && data.maxCombo > (prev.maxCombo ?? 0));
    if (better) {
      all[songId] = data;
      localStorage.setItem(_HK, JSON.stringify(all));
    }
  } catch (e) { console.warn('Failed to save high score:', e); }
}

function getSkin() {
  try { return JSON.parse(localStorage.getItem(_SKIN_K) || 'null'); }
  catch (_) { return null; }
}

function saveSkin(skinObj) {
  if (skinObj === null) localStorage.removeItem(_SKIN_K);
  else localStorage.setItem(_SKIN_K, JSON.stringify(skinObj));
}

// App background image (separate key to avoid bloating settings JSON)
const _APP_BG_K = 'keyrhythm_appbg';
function getAppBgImage()       { return localStorage.getItem(_APP_BG_K) || ''; }
function saveAppBgImage(uri)   { if (!uri) localStorage.removeItem(_APP_BG_K); else localStorage.setItem(_APP_BG_K, uri); }

// App background metadata (source, type, mimeType, url)
const _APP_BG_META_K = 'keyrhythm_appbg_meta';
function getAppBgMeta() {
  try { return JSON.parse(localStorage.getItem(_APP_BG_META_K)) || null; }
  catch { return null; }
}
function saveAppBgMeta(meta) {
  if (!meta) localStorage.removeItem(_APP_BG_META_K);
  else localStorage.setItem(_APP_BG_META_K, JSON.stringify(meta));
}

// Popup background image (separate from main app background)
const _POPUP_BG_K = 'keyrhythm_popup_appbg';
function getPopupBgImage()       { return localStorage.getItem(_POPUP_BG_K) || ''; }
function savePopupBgImage(uri)   { if (!uri) localStorage.removeItem(_POPUP_BG_K); else localStorage.setItem(_POPUP_BG_K, uri); }

const _POPUP_BG_META_K = 'keyrhythm_popup_appbg_meta';
function getPopupBgMeta() {
  try { return JSON.parse(localStorage.getItem(_POPUP_BG_META_K)) || null; }
  catch { return null; }
}
function savePopupBgMeta(meta) {
  if (!meta) localStorage.removeItem(_POPUP_BG_META_K);
  else localStorage.setItem(_POPUP_BG_META_K, JSON.stringify(meta));
}

// Shared key display name mapping
const _KEY_DISPLAY_MAP = {
  // Modifiers
  ShiftLeft: 'L-⇧', ShiftRight: 'R-⇧',
  ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt',
  MetaLeft: 'L-⌘', MetaRight: 'R-⌘',
  // Arrow keys
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  // Whitespace / navigation
  ' ': '␣', Enter: '↵', Tab: '⇥', Escape: 'Esc',
  Backspace: '⌫', Delete: 'Del',
  // Nav cluster
  Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  Insert: 'Ins',
  // Function keys
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
  // Misc
  CapsLock: 'Caps', NumLock: 'Num', ScrollLock: 'ScrLk',
  ContextMenu: 'Menu', PrintScreen: 'PrtSc', Pause: 'Pause',
};

function displayKeyName(k) {
  return _KEY_DISPLAY_MAP[k] || k;
}
