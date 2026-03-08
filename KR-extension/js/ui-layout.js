// UI Layout data model, storage layer, and element registry
// Stores per-page element overrides and custom elements in localStorage.
// Loaded on all pages (for runtime layout application) and by the UI editor.

(function() {
  'use strict';

  const _UI_K = 'keyrhythm_ui_layout';

  // ─── Storage functions ───────────────────────────────────────────

  function getUILayout() {
    try { return JSON.parse(localStorage.getItem(_UI_K) || '{}'); }
    catch (_) { return {}; }
  }

  function saveUILayout(layout) {
    try {
      localStorage.setItem(_UI_K, JSON.stringify(layout));
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast('Storage full. Remove some custom images.', 3000, true);
      }
    }
  }

  function getPageLayout(pageId) {
    const layout = getUILayout();
    const page = (layout.pages || {})[pageId];
    return page ? { overrides: page.overrides || {}, custom: page.custom || [] }
                : { overrides: {}, custom: [] };
  }

  function savePageLayout(pageId, pageLayout) {
    const layout = getUILayout();
    if (!layout.pages) layout.pages = {};
    layout.pages[pageId] = pageLayout;
    saveUILayout(layout);
  }

  function getThemeOverrides() {
    return getUILayout().theme || {};
  }

  function saveThemeOverrides(theme) {
    const layout = getUILayout();
    layout.theme = theme;
    saveUILayout(layout);
  }

  function clearAllLayouts() {
    localStorage.removeItem(_UI_K);
  }

  // ─── Default property factory ────────────────────────────────────
  // Returns a full defaults object with the 21 standard properties.
  // (placeholder is handled as a type-specific property for input elements)

  function _d(overrides) {
    return Object.assign({
      x: 0,
      y: 0,
      w: 100,
      h: 40,
      textContent:  '',
      textColor:    '#e0e0f0',
      bgColor:      'transparent',
      borderColor:  'transparent',
      borderWidth:  0,
      borderStyle:  'solid',
      borderRadius: 0,
      opacity:      100,
      fontFamily:   'inherit',
      fontSize:     14,
      fontWeight:   'normal',
      fontStyle:    'normal',
      textAlign:    'center',
      padding:      0,
      zIndex:       0,
      rotation:     0,
      _locked:      false,
      _hidden:      false,
    }, overrides);
  }

  // ─── PAGE_DIMENSIONS ─────────────────────────────────────────────
  // Natural canvas size for each page (used by the UI editor viewport).

  const PAGE_DIMENSIONS = {
    index:      { w: 480, h: 700 },
    create:     { w: 640, h: 1050 },
    editor:     { w: 1100, h: 700 },
    popup:      { w: 380, h: 580 },
    skinEditor: { w: 1000, h: 800 },
    settings:   { w: 600, h: 750 },
    game:       { w: 500, h: 700 },
  };

  // ─── PAGE_ELEMENTS ───────────────────────────────────────────────
  // Built-in element registry for the 5 pages.
  // Each element: { id, label, tag, defaults: { ...19 props } }
  // Positions approximate the real flex/grid layouts as rendered.

  const PAGE_ELEMENTS = {

    // ═══ Index Page (400×720) ═══
    // Centered flex column: logo → tagline → single-column buttons → search/sort
    index: [
      {
        id: 'logo', label: 'Logo', tag: 'div',
        defaults: _d({
          x: 20, y: 40, w: 360, h: 64,
          textContent: '[ ] \\ KEYRHYTHM',
          textColor: '#e0e0f0',
          fontSize: 42,
          fontWeight: 'bold',
          textAlign: 'center',
          zIndex: 1,
        }),
      },
      {
        id: 'tagline', label: 'Tagline', tag: 'div',
        defaults: _d({
          x: 20, y: 108, w: 360, h: 24,
          textContent: '[  ]  \\',
          textColor: '#9898c0',
          fontSize: 18,
          textAlign: 'center',
        }),
      },
      {
        id: 'logoK0', label: 'Logo [ Bracket', tag: 'span',
        defaults: _d({ x: 20, y: 40, w: 30, h: 64, textContent: '[', textColor: '#c060ff', fontSize: 52, fontWeight: 'bold' }),
      },
      {
        id: 'logoK1', label: 'Logo ] Bracket', tag: 'span',
        defaults: _d({ x: 55, y: 40, w: 30, h: 64, textContent: ']', textColor: '#40c4ff', fontSize: 52, fontWeight: 'bold' }),
      },
      {
        id: 'logoK2', label: 'Logo \\ Backslash', tag: 'span',
        defaults: _d({ x: 90, y: 40, w: 30, h: 64, textContent: '\\', textColor: '#60ff90', fontSize: 52, fontWeight: 'bold' }),
      },
      // Buttons: single column, 320px wide, centered at x=40
      {
        id: 'btnPlay', label: 'Play Button', tag: 'button',
        defaults: _d({
          x: 40, y: 180, w: 320, h: 52,
          textContent: '\u25B6  PLAY',
          textColor: '#c060ff',
          borderColor: '#c060ff',
          borderWidth: 2,
          borderRadius: 4,
          fontWeight: 'bold',
          fontSize: 16,
          zIndex: 1,
        }),
      },
      {
        id: 'btnCreate', label: 'Create Level Button', tag: 'button',
        defaults: _d({
          x: 40, y: 244, w: 320, h: 52,
          textContent: '+  CREATE LEVEL',
          textColor: '#40c4ff',
          borderColor: '#40c4ff',
          borderWidth: 2,
          borderRadius: 4,
          fontWeight: 'bold',
          fontSize: 16,
          zIndex: 1,
        }),
      },
      {
        id: 'btnImport', label: 'Import File Button', tag: 'button',
        defaults: _d({
          x: 40, y: 308, w: 320, h: 52,
          textContent: '\u2193  IMPORT FILE',
          textColor: '#9898c0',
          borderColor: '#2a2a4a',
          borderWidth: 2,
          borderRadius: 4,
          fontWeight: 'bold',
          fontSize: 16,
          zIndex: 1,
        }),
      },
      {
        id: 'btnImportCode', label: 'Import Code Button', tag: 'button',
        defaults: _d({
          x: 40, y: 372, w: 320, h: 52,
          textContent: '\uD83D\uDCCB  IMPORT CODE',
          textColor: '#9898c0',
          borderColor: '#2a2a4a',
          borderWidth: 2,
          borderRadius: 4,
          fontWeight: 'bold',
          fontSize: 16,
          zIndex: 1,
        }),
      },
      {
        id: 'btnPlaylists', label: 'Playlists Button', tag: 'button',
        defaults: _d({
          x: 40, y: 436, w: 320, h: 52,
          textContent: '\u266B  PLAYLISTS',
          textColor: '#9898c0',
          borderColor: '#2a2a4a',
          borderWidth: 2,
          borderRadius: 4,
          fontWeight: 'bold',
          fontSize: 16,
          zIndex: 1,
        }),
      },
      {
        id: 'btnSettings', label: 'Settings Button', tag: 'button',
        defaults: _d({
          x: 40, y: 500, w: 320, h: 52,
          textContent: '\u2699  SETTINGS',
          textColor: '#9898c0',
          borderColor: '#2a2a4a',
          borderWidth: 2,
          borderRadius: 4,
          fontWeight: 'bold',
          fontSize: 16,
          zIndex: 1,
        }),
      },
      {
        id: 'searchBox', label: 'Search Box', tag: 'input',
        defaults: _d({
          x: 20, y: 600, w: 270, h: 36,
          textContent: '',
          textColor: '#e0e0f0',
          bgColor: '#1a1a2e',
          borderColor: '#2a2a4a',
          borderWidth: 1,
          borderRadius: 4,
          fontSize: 13,
          padding: 8,
          textAlign: 'left',
        }),
      },
      {
        id: 'sortSelect', label: 'Sort Dropdown', tag: 'select',
        defaults: _d({ x: 298, y: 600, w: 82, h: 36, textColor: '#e0e0f0', bgColor: '#1a1a2e', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 4, fontSize: 13, padding: 4, textAlign: 'left' }),
      },
      {
        id: 'menuGrid', label: 'Menu Button Grid', tag: 'div',
        defaults: _d({ x: 40, y: 180, w: 320, h: 400, textColor: '#e0e0f0', bgColor: 'transparent', padding: 0 }),
      },
      {
        id: 'songList', label: 'Song List Section', tag: 'div',
        defaults: _d({ x: 20, y: 580, w: 360, h: 120, textColor: '#e0e0f0', bgColor: 'transparent', fontSize: 13, padding: 0, textAlign: 'left' }),
      },
      {
        id: 'songItems', label: 'Song Items Container', tag: 'div',
        defaults: _d({ x: 20, y: 640, w: 360, h: 60, textColor: '#e0e0f0', bgColor: 'transparent', fontSize: 13, padding: 0, textAlign: 'left' }),
      },
      {
        id: 'playlistSection', label: 'Playlists Section', tag: 'div',
        defaults: _d({ x: 20, y: 580, w: 360, h: 120, textColor: '#e0e0f0', bgColor: 'transparent', fontSize: 13, padding: 0, textAlign: 'left' }),
      },
    ],

    // ═══ Create Page (640×700) ═══
    // Centered column with padding, form groups stacked
    create: [
      {
        id: 'pageHeader', label: 'Page Header', tag: 'div',
        defaults: _d({
          x: 24, y: 36, w: 592, h: 44,
          textContent: 'CREATE LEVEL',
          textColor: '#e0e0f0',
          fontSize: 24,
          fontWeight: 'bold',
          textAlign: 'left',
          zIndex: 2,
        }),
      },
      {
        id: 'songSection', label: 'Song Details Section', tag: 'div',
        defaults: _d({
          x: 24, y: 100, w: 592, h: 220,
          textContent: 'Song Details',
          textColor: '#9898c0',
          bgColor: '#12121e',
          borderColor: '#2a2a4a',
          borderWidth: 1,
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 'bold',
          padding: 16,
          textAlign: 'left',
          zIndex: 0,
        }),
      },
      {
        id: 'inputTitle', label: 'Song Title Input', tag: 'input',
        defaults: _d({
          x: 40, y: 140, w: 560, h: 38,
          textContent: '',
          textColor: '#e0e0f0',
          bgColor: '#0a0a14',
          borderColor: '#2a2a4a',
          borderWidth: 1,
          borderRadius: 4,
          fontSize: 14,
          padding: 8,
          textAlign: 'left',
        }),
      },
      {
        id: 'inputArtist', label: 'Artist Input', tag: 'input',
        defaults: _d({
          x: 40, y: 200, w: 560, h: 38,
          textContent: '',
          textColor: '#e0e0f0',
          bgColor: '#0a0a14',
          borderColor: '#2a2a4a',
          borderWidth: 1,
          borderRadius: 4,
          fontSize: 14,
          padding: 8,
          textAlign: 'left',
        }),
      },
      {
        id: 'uploadZone', label: 'Audio Upload Zone', tag: 'div',
        defaults: _d({
          x: 40, y: 258, w: 560, h: 50,
          textContent: 'Click to choose audio file',
          textColor: '#9898c0',
          bgColor: '#0a0a14',
          borderColor: '#2a2a4a',
          borderWidth: 2,
          borderRadius: 6,
          fontSize: 13,
          padding: 12,
          textAlign: 'center',
        }),
      },
      {
        id: 'optionsSection', label: 'Recording Options Section', tag: 'div',
        defaults: _d({
          x: 24, y: 340, w: 592, h: 200,
          textContent: 'Recording Options',
          textColor: '#9898c0',
          bgColor: '#12121e',
          borderColor: '#2a2a4a',
          borderWidth: 1,
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 'bold',
          padding: 16,
          textAlign: 'left',
          zIndex: 0,
        }),
      },
      {
        id: 'laneCount', label: 'Lane Count Select', tag: 'select',
        defaults: _d({
          x: 40, y: 380, w: 120, h: 34,
          textContent: '',
          textColor: '#e0e0f0',
          bgColor: '#0a0a14',
          borderColor: '#2a2a4a',
          borderWidth: 1,
          borderRadius: 4,
          fontSize: 13,
          padding: 4,
          textAlign: 'left',
        }),
      },
      {
        id: 'btnRecord', label: 'Start Recording Button', tag: 'button',
        defaults: _d({
          x: 24, y: 560, w: 186, h: 48,
          textContent: 'START RECORDING',
          textColor: '#60ff90',
          borderColor: '#60ff90',
          borderWidth: 2,
          borderRadius: 4,
          fontWeight: 'bold',
          fontSize: 14,
          zIndex: 1,
        }),
      },
      {
        id: 'btnStop', label: 'Stop Button', tag: 'button',
        defaults: _d({
          x: 222, y: 560, w: 130, h: 48,
          textContent: 'STOP',
          textColor: '#ff4060',
          borderColor: '#ff4060',
          borderWidth: 2,
          borderRadius: 4,
          fontWeight: 'bold',
          fontSize: 14,
          zIndex: 1,
        }),
      },
      {
        id: 'btnAutoGen', label: 'Auto Generate Button', tag: 'button',
        defaults: _d({ x: 24, y: 640, w: 592, h: 44, textContent: 'AUTO GENERATE', textColor: '#40c4ff', borderColor: '#40c4ff', borderWidth: 2, borderRadius: 4, fontWeight: 'bold', fontSize: 14, zIndex: 1 }),
      },
      {
        id: 'btnBack', label: 'Back Button', tag: 'button',
        defaults: _d({ x: 24, y: 36, w: 70, h: 32, textContent: '\u2190 Back', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12, zIndex: 3 }),
      },
      {
        id: 'metronomeToggle', label: 'Metronome Toggle', tag: 'input',
        defaults: _d({ x: 40, y: 400, w: 18, h: 18, textColor: '#e0e0f0', bgColor: '#0a0a14', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 13 }),
      },
      {
        id: 'metronomeBpm', label: 'Metronome BPM', tag: 'input',
        defaults: _d({ x: 240, y: 396, w: 70, h: 28, textColor: '#e0e0f0', bgColor: '#0a0a14', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 13, padding: 4, textAlign: 'left' }),
      },
      {
        id: 'holdThresholdMs', label: 'Hold Threshold', tag: 'input',
        defaults: _d({ x: 240, y: 470, w: 70, h: 28, textColor: '#e0e0f0', bgColor: '#0a0a14', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 13, padding: 4, textAlign: 'left' }),
      },
      {
        id: 'recStatus', label: 'Recording Status', tag: 'div',
        defaults: _d({ x: 24, y: 530, w: 592, h: 28, textContent: 'RECORDING', textColor: '#ff4060', bgColor: 'transparent', fontSize: 13, fontWeight: 'bold', textAlign: 'center' }),
      },
      {
        id: 'btnPause', label: 'Pause Button', tag: 'button',
        defaults: _d({ x: 222, y: 560, w: 130, h: 48, textContent: '\u23F8 Pause', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 2, borderRadius: 4, fontWeight: 'bold', fontSize: 14, zIndex: 1 }),
      },
      {
        id: 'btnCancel', label: 'Cancel Button', tag: 'button',
        defaults: _d({ x: 364, y: 560, w: 130, h: 48, textContent: '\u2715 Cancel', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 2, borderRadius: 4, fontWeight: 'bold', fontSize: 14, zIndex: 1 }),
      },
      {
        id: 'keyHintsContainer', label: 'Key Hints', tag: 'div',
        defaults: _d({ x: 24, y: 620, w: 592, h: 40, textColor: '#e0e0f0', bgColor: 'transparent', fontSize: 14, fontWeight: 'bold', textAlign: 'center' }),
      },
      {
        id: 'noteCount', label: 'Note Count Display', tag: 'div',
        defaults: _d({ x: 24, y: 660, w: 592, h: 24, textContent: 'Notes recorded: 0', textColor: '#9898c0', fontSize: 12, textAlign: 'center' }),
      },
      {
        id: 'risingCanvas', label: 'Rising Preview Canvas', tag: 'canvas',
        defaults: _d({ x: 24, y: 680, w: 592, h: 320, bgColor: '#0a0a14', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 4 }),
      },
    ],

    // ═══ Editor Page (960×700) ═══
    // Full-width stacked bars: toolbar → audio → bpm → canvas → info
    editor: [
      {
        id: 'toolbar', label: 'Toolbar', tag: 'div',
        defaults: _d({ x: 0, y: 0, w: 960, h: 44, textColor: '#e0e0f0', bgColor: '#12121e', borderColor: '#2a2a4a', fontSize: 14, fontWeight: 'bold', padding: 10, textAlign: 'left', zIndex: 10 }),
      },
      {
        id: 'btnMenu', label: 'Menu Button', tag: 'button',
        defaults: _d({ x: 8, y: 6, w: 70, h: 32, textContent: '\u2190 Menu', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12, zIndex: 11 }),
      },
      {
        id: 'edTitle', label: 'Editor Title', tag: 'span',
        defaults: _d({ x: 90, y: 6, w: 240, h: 32, textContent: 'EDITOR', textColor: '#e0e0f0', fontSize: 16, fontWeight: 'bold', textAlign: 'left', zIndex: 11 }),
      },
      {
        id: 'btnUndo', label: 'Undo Button', tag: 'button',
        defaults: _d({ x: 560, y: 6, w: 60, h: 32, textContent: '\u21A9 Undo', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 11, zIndex: 11 }),
      },
      {
        id: 'btnRedo', label: 'Redo Button', tag: 'button',
        defaults: _d({ x: 626, y: 6, w: 60, h: 32, textContent: '\u21AA Redo', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 11, zIndex: 11 }),
      },
      {
        id: 'btnLoadAudio', label: 'Load Audio Button', tag: 'button',
        defaults: _d({ x: 692, y: 6, w: 80, h: 32, textContent: 'Load Audio', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 11, zIndex: 11 }),
      },
      {
        id: 'btnSave', label: 'Save Button', tag: 'button',
        defaults: _d({ x: 778, y: 6, w: 56, h: 32, textContent: 'Save', textColor: '#60ff90', borderColor: '#60ff90', borderWidth: 2, borderRadius: 3, fontWeight: 'bold', fontSize: 12, zIndex: 11 }),
      },
      {
        id: 'btnTest', label: 'Test Button', tag: 'button',
        defaults: _d({ x: 840, y: 6, w: 56, h: 32, textContent: '\u25B6 Test', textColor: '#c060ff', borderColor: '#c060ff', borderWidth: 2, borderRadius: 3, fontWeight: 'bold', fontSize: 12, zIndex: 11 }),
      },
      {
        id: 'exportSel', label: 'Export Dropdown', tag: 'select',
        defaults: _d({ x: 902, y: 6, w: 52, h: 32, textColor: '#40c4ff', bgColor: '#1a1a2e', borderColor: '#40c4ff', borderWidth: 2, borderRadius: 3, fontSize: 11, zIndex: 11 }),
      },
      {
        id: 'audioBar', label: 'Audio Controls Bar', tag: 'div',
        defaults: _d({ x: 0, y: 44, w: 960, h: 40, textColor: '#e0e0f0', bgColor: '#1a1a2e', borderColor: '#2a2a4a', fontSize: 13, padding: 8, textAlign: 'left', zIndex: 9 }),
      },
      {
        id: 'btnPlayPause', label: 'Play/Pause Button', tag: 'button',
        defaults: _d({ x: 8, y: 50, w: 90, h: 28, textContent: '\u25B6 Play', textColor: '#c060ff', borderColor: '#c060ff', borderWidth: 2, borderRadius: 3, fontWeight: 'bold', fontSize: 12, zIndex: 10 }),
      },
      {
        id: 'seekBar', label: 'Seek Bar', tag: 'input',
        defaults: _d({ x: 200, y: 54, w: 460, h: 20, textColor: '#e0e0f0', bgColor: '#0a0a14', zIndex: 10 }),
      },
      {
        id: 'bpmBar', label: 'BPM / Snap Controls', tag: 'div',
        defaults: _d({ x: 0, y: 84, w: 960, h: 36, textColor: '#9898c0', bgColor: '#0a0a14', borderColor: '#2a2a4a', fontSize: 11, padding: 6, textAlign: 'left', zIndex: 8 }),
      },
      {
        id: 'editorCanvas', label: 'Editor Canvas', tag: 'canvas',
        defaults: _d({ x: 0, y: 120, w: 960, h: 538, textColor: '#e0e0f0', bgColor: '#0a0a14', borderColor: 'transparent', fontSize: 14, padding: 0, zIndex: 0 }),
      },
      {
        id: 'infoBar', label: 'Info / Status Bar', tag: 'div',
        defaults: _d({ x: 0, y: 658, w: 960, h: 42, textColor: '#9898c0', bgColor: '#12121e', borderColor: '#2a2a4a', fontSize: 11, padding: 8, textAlign: 'left', zIndex: 5 }),
      },
    ],

    // ═══ Popup Page (380×420) ═══
    // Compact: header → toolbar → actions → settings/live panels → song list
    popup: [
      {
        id: 'popupHeader', label: 'Popup Header', tag: 'div',
        defaults: _d({ x: 0, y: 0, w: 380, h: 42, textContent: 'KEYRHYTHM', textColor: '#e0e0f0', bgColor: '#12121e', borderColor: '#2a2a4a', fontSize: 16, fontWeight: 'bold', padding: 10, textAlign: 'left', zIndex: 2 }),
      },
      {
        id: 'popLogoK0', label: 'Logo [ Bracket', tag: 'span',
        defaults: _d({ x: 12, y: 10, w: 14, h: 22, textContent: '[', textColor: '#c060ff', fontSize: 16, fontWeight: 'bold' }),
      },
      {
        id: 'popLogoK1', label: 'Logo ] Bracket', tag: 'span',
        defaults: _d({ x: 28, y: 10, w: 14, h: 22, textContent: ']', textColor: '#40c4ff', fontSize: 16, fontWeight: 'bold' }),
      },
      {
        id: 'popLogoK2', label: 'Logo \\ Backslash', tag: 'span',
        defaults: _d({ x: 44, y: 10, w: 14, h: 22, textContent: '\\', textColor: '#60ff90', fontSize: 16, fontWeight: 'bold' }),
      },
      {
        id: 'btnSettings', label: 'Settings Button', tag: 'button',
        defaults: _d({ x: 310, y: 6, w: 30, h: 30, textContent: '\u2699', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 14, zIndex: 3 }),
      },
      {
        id: 'btnFullscreen', label: 'Fullscreen Button', tag: 'button',
        defaults: _d({ x: 346, y: 6, w: 30, h: 30, textContent: '\u26F6', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 14, zIndex: 3 }),
      },
      {
        id: 'popupToolbar', label: 'Search / Sort Toolbar', tag: 'div',
        defaults: _d({ x: 0, y: 42, w: 380, h: 38, textColor: '#e0e0f0', bgColor: '#12121e', padding: 4 }),
      },
      {
        id: 'searchBox', label: 'Search Input', tag: 'input',
        defaults: _d({ x: 12, y: 48, w: 260, h: 32, textColor: '#e0e0f0', bgColor: '#1a1a2e', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 4, fontSize: 12, padding: 6, textAlign: 'left' }),
      },
      {
        id: 'sortSelect', label: 'Sort Dropdown', tag: 'select',
        defaults: _d({ x: 278, y: 48, w: 90, h: 32, textColor: '#e0e0f0', bgColor: '#1a1a2e', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 4, fontSize: 12, padding: 4, textAlign: 'left' }),
      },
      {
        id: 'popupActions', label: 'Action Buttons Grid', tag: 'div',
        defaults: _d({ x: 0, y: 84, w: 380, h: 76, textColor: '#e0e0f0', bgColor: '#12121e', padding: 8 }),
      },
      {
        id: 'btnCreate', label: 'Create Button', tag: 'button',
        defaults: _d({ x: 12, y: 92, w: 175, h: 30, textContent: '+ Create', textColor: '#40c4ff', borderColor: '#40c4ff', borderWidth: 2, borderRadius: 3, fontWeight: 'bold', fontSize: 12, zIndex: 1 }),
      },
      {
        id: 'btnLive', label: 'Live Button', tag: 'button',
        defaults: _d({ x: 193, y: 92, w: 175, h: 30, textContent: '\uD83C\uDFAE Live', textColor: '#60ff90', borderColor: '#60ff90', borderWidth: 2, borderRadius: 3, fontWeight: 'bold', fontSize: 12, zIndex: 1 }),
      },
      {
        id: 'btnImport', label: 'Import File Button', tag: 'button',
        defaults: _d({ x: 12, y: 128, w: 175, h: 30, textContent: '\u2193 File', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 2, borderRadius: 3, fontWeight: 'bold', fontSize: 12, zIndex: 1 }),
      },
      {
        id: 'btnImportCode', label: 'Import Code Button', tag: 'button',
        defaults: _d({ x: 193, y: 128, w: 175, h: 30, textContent: '\uD83D\uDCCB Code', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 2, borderRadius: 3, fontWeight: 'bold', fontSize: 12, zIndex: 1 }),
      },
      {
        id: 'settingsPanel', label: 'Settings Panel', tag: 'div', view: 'settings',
        defaults: _d({ x: 0, y: 164, w: 380, h: 340, textColor: '#e0e0f0', bgColor: '#12121e', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 4, fontSize: 12, padding: 12, textAlign: 'left' }),
      },
      {
        id: 'livePanel', label: 'Live Mode Panel', tag: 'div', view: 'live',
        defaults: _d({ x: 0, y: 164, w: 380, h: 340, textColor: '#e0e0f0', bgColor: '#12121e', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 4, fontSize: 12, padding: 12, textAlign: 'left' }),
      },
      {
        id: 'songItems', label: 'Song List', tag: 'div', view: 'songs',
        defaults: _d({ x: 0, y: 164, w: 380, h: 416, textColor: '#e0e0f0', bgColor: 'transparent', fontSize: 13, padding: 0, textAlign: 'left' }),
      },
    ],

    // ═══ Skin Editor Page (900×750) ═══
    // Split: controls left (400px) + preview right, header + footer full width
    skinEditor: [
      {
        id: 'seHeader', label: 'Header', tag: 'div',
        defaults: _d({ x: 16, y: 16, w: 868, h: 32, textContent: 'SKIN EDITOR', textColor: '#c060ff', fontSize: 18, fontWeight: 'bold', textAlign: 'left', zIndex: 2 }),
      },
      {
        id: 'btnBack', label: 'Back Button', tag: 'button',
        defaults: _d({ x: 16, y: 16, w: 70, h: 28, textContent: '\u2190 Back', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12, zIndex: 3 }),
      },
      {
        id: 'presetSelect', label: 'Preset Dropdown', tag: 'select',
        defaults: _d({ x: 16, y: 56, w: 200, h: 30, textColor: '#e0e0f0', bgColor: '#1a1a2e', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12, padding: 4 }),
      },
      {
        id: 'btnLoadPreset', label: 'Load Preset Button', tag: 'button',
        defaults: _d({ x: 222, y: 56, w: 64, h: 30, textContent: 'Load', textColor: '#40c4ff', borderColor: '#40c4ff', borderWidth: 2, borderRadius: 3, fontWeight: 'bold', fontSize: 11, zIndex: 1 }),
      },
      {
        id: 'skinName', label: 'Skin Name Input', tag: 'input',
        defaults: _d({ x: 292, y: 56, w: 124, h: 30, textColor: '#e0e0f0', bgColor: '#0a0a14', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12, padding: 6, textAlign: 'left' }),
      },
      {
        id: 'seTabBar', label: 'Tab Bar', tag: 'div',
        defaults: _d({ x: 16, y: 96, w: 400, h: 32, textColor: '#9898c0', bgColor: 'transparent', borderColor: '#2a2a4a', fontSize: 10, fontWeight: 'bold', padding: 4, textAlign: 'center', zIndex: 1 }),
      },
      {
        id: 'seControls', label: 'Controls Panel', tag: 'div',
        defaults: _d({ x: 16, y: 136, w: 400, h: 420, textColor: '#e0e0f0', bgColor: 'transparent', fontSize: 12, padding: 0, textAlign: 'left' }),
      },
      {
        id: 'sePreview', label: 'Preview Area', tag: 'div',
        defaults: _d({ x: 440, y: 56, w: 440, h: 680, textColor: '#e0e0f0', bgColor: '#0a0a14', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 6, fontSize: 14, padding: 0, zIndex: 0 }),
      },
      {
        id: 'previewCanvas', label: 'Preview Canvas', tag: 'canvas',
        defaults: _d({ x: 440, y: 56, w: 440, h: 510, textColor: '#e0e0f0', bgColor: '#0a0a14', fontSize: 14, padding: 0, zIndex: 0 }),
      },
      {
        id: 'seFooter', label: 'Footer Actions', tag: 'div',
        defaults: _d({ x: 440, y: 660, w: 340, h: 78, textColor: '#e0e0f0', bgColor: 'transparent', fontSize: 12, fontWeight: 'bold', padding: 0, textAlign: 'center', zIndex: 2 }),
      },
      {
        id: 'btnSaveSkin', label: 'Save Skin Button', tag: 'button',
        defaults: _d({ x: 440, y: 660, w: 167, h: 34, textContent: 'Save', textColor: '#60ff90', borderColor: '#60ff90', borderWidth: 2, borderRadius: 3, fontWeight: 'bold', fontSize: 12, zIndex: 3 }),
      },
      {
        id: 'btnExportSkin', label: 'Export Skin Button', tag: 'button',
        defaults: _d({ x: 613, y: 660, w: 167, h: 34, textContent: 'Export', textColor: '#40c4ff', borderColor: '#40c4ff', borderWidth: 2, borderRadius: 3, fontWeight: 'bold', fontSize: 12, zIndex: 3 }),
      },
      {
        id: 'btnImportSkin', label: 'Import Skin Button', tag: 'button',
        defaults: _d({ x: 440, y: 700, w: 167, h: 34, textContent: 'Import', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12, zIndex: 3 }),
      },
      {
        id: 'btnResetSkin', label: 'Reset Skin Button', tag: 'button',
        defaults: _d({ x: 613, y: 700, w: 167, h: 34, textContent: 'Reset', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12, zIndex: 3 }),
      },
    ],

    // ═══ Settings Overlay (500×700) ═══
    // Modal overlay shown on index page — treated as its own page for customization
    settings: [
      {
        id: 'settingsOverlay', label: 'Overlay Backdrop', tag: 'div',
        defaults: _d({ x: 0, y: 0, w: 500, h: 700, textColor: '#e0e0f0', bgColor: 'rgba(0,0,0,0.7)', fontSize: 13, zIndex: 50 }),
      },
      {
        id: 'settingsModal', label: 'Settings Modal', tag: 'div',
        defaults: _d({ x: 20, y: 20, w: 460, h: 660, textColor: '#e0e0f0', bgColor: '#12121e', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 8, fontSize: 13, padding: 24, zIndex: 51 }),
      },
      // Gameplay tab controls
      {
        id: 'sSpeed', label: 'Scroll Speed Slider', tag: 'input', view: 'gameplay',
        defaults: _d({ x: 180, y: 120, w: 220, h: 20, textColor: '#e0e0f0', bgColor: '#0a0a14' }),
      },
      {
        id: 'sSpeedVal', label: 'Scroll Speed Value', tag: 'span', view: 'gameplay',
        defaults: _d({ x: 410, y: 118, w: 50, h: 24, textContent: '1.0\u00d7', textColor: '#e0e0f0', fontSize: 12 }),
      },
      {
        id: 'sOffset', label: 'Audio Offset Slider', tag: 'input', view: 'gameplay',
        defaults: _d({ x: 180, y: 154, w: 220, h: 20, textColor: '#e0e0f0', bgColor: '#0a0a14' }),
      },
      {
        id: 'sOffsetVal', label: 'Audio Offset Value', tag: 'span', view: 'gameplay',
        defaults: _d({ x: 410, y: 152, w: 50, h: 24, textContent: '0ms', textColor: '#e0e0f0', fontSize: 12 }),
      },
      {
        id: 'btnTapTest', label: 'Tap Test Button', tag: 'button', view: 'gameplay',
        defaults: _d({ x: 180, y: 186, w: 70, h: 28, textContent: 'Tap Test', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 11 }),
      },
      {
        id: 'sPractice', label: 'Practice Speed Slider', tag: 'input', view: 'gameplay',
        defaults: _d({ x: 180, y: 228, w: 220, h: 20, textColor: '#e0e0f0', bgColor: '#0a0a14' }),
      },
      {
        id: 'sPracticeVal', label: 'Practice Speed Value', tag: 'span', view: 'gameplay',
        defaults: _d({ x: 410, y: 226, w: 50, h: 24, textContent: '1.0\u00d7', textColor: '#e0e0f0', fontSize: 12 }),
      },
      {
        id: 'sPracticeMode', label: 'Practice Mode Toggle', tag: 'input', view: 'gameplay',
        defaults: _d({ x: 180, y: 262, w: 18, h: 18, textColor: '#e0e0f0' }),
      },
      {
        id: 'sGlide', label: 'Glide Notes Toggle', tag: 'input', view: 'gameplay',
        defaults: _d({ x: 180, y: 296, w: 18, h: 18, textColor: '#e0e0f0' }),
      },
      {
        id: 'btnResetGameplay', label: 'Reset Gameplay Button', tag: 'button', view: 'gameplay',
        defaults: _d({ x: 40, y: 330, w: 420, h: 32, textContent: '\u21BA Reset Gameplay', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12 }),
      },
      // Audio tab controls
      {
        id: 'sMasterVol', label: 'Master Volume Slider', tag: 'input', view: 'audio',
        defaults: _d({ x: 180, y: 120, w: 220, h: 20, textColor: '#e0e0f0', bgColor: '#0a0a14' }),
      },
      {
        id: 'sMasterVolVal', label: 'Master Volume Value', tag: 'span', view: 'audio',
        defaults: _d({ x: 410, y: 118, w: 50, h: 24, textContent: '100%', textColor: '#e0e0f0', fontSize: 12 }),
      },
      {
        id: 'sMusicVol', label: 'Music Volume Slider', tag: 'input', view: 'audio',
        defaults: _d({ x: 180, y: 154, w: 220, h: 20, textColor: '#e0e0f0', bgColor: '#0a0a14' }),
      },
      {
        id: 'sMusicVolVal', label: 'Music Volume Value', tag: 'span', view: 'audio',
        defaults: _d({ x: 410, y: 152, w: 50, h: 24, textContent: '100%', textColor: '#e0e0f0', fontSize: 12 }),
      },
      {
        id: 'sMetronomeVol', label: 'Metronome Volume Slider', tag: 'input', view: 'audio',
        defaults: _d({ x: 180, y: 188, w: 220, h: 20, textColor: '#e0e0f0', bgColor: '#0a0a14' }),
      },
      {
        id: 'sMetronomeVolVal', label: 'Metronome Volume Value', tag: 'span', view: 'audio',
        defaults: _d({ x: 410, y: 186, w: 50, h: 24, textContent: '50%', textColor: '#e0e0f0', fontSize: 12 }),
      },
      {
        id: 'sHitsound', label: 'Hitsound Select', tag: 'select', view: 'audio',
        defaults: _d({ x: 180, y: 230, w: 160, h: 28, textColor: '#e0e0f0', bgColor: '#1a1a2e', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12, padding: 4 }),
      },
      {
        id: 'btnTestHitsound', label: 'Test Hitsound Button', tag: 'button', view: 'audio',
        defaults: _d({ x: 350, y: 230, w: 52, h: 28, textContent: 'Test', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 11 }),
      },
      {
        id: 'sHitsoundVol', label: 'Hitsound Volume Slider', tag: 'input', view: 'audio',
        defaults: _d({ x: 180, y: 268, w: 220, h: 20, textColor: '#e0e0f0', bgColor: '#0a0a14' }),
      },
      {
        id: 'sHitsoundVolVal', label: 'Hitsound Volume Value', tag: 'span', view: 'audio',
        defaults: _d({ x: 410, y: 266, w: 50, h: 24, textContent: '50%', textColor: '#e0e0f0', fontSize: 12 }),
      },
      {
        id: 'sSliderTick', label: 'Slider Tick Select', tag: 'select', view: 'audio',
        defaults: _d({ x: 180, y: 304, w: 160, h: 28, textColor: '#e0e0f0', bgColor: '#1a1a2e', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12, padding: 4 }),
      },
      {
        id: 'sSliderEnd', label: 'Slider End Select', tag: 'select', view: 'audio',
        defaults: _d({ x: 180, y: 340, w: 160, h: 28, textColor: '#e0e0f0', bgColor: '#1a1a2e', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12, padding: 4 }),
      },
      {
        id: 'btnResetAudio', label: 'Reset Audio Button', tag: 'button', view: 'audio',
        defaults: _d({ x: 40, y: 400, w: 420, h: 32, textContent: '\u21BA Reset Audio', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12 }),
      },
      // Visuals tab controls
      {
        id: 'sHideTooltips', label: 'Hide Tooltips Toggle', tag: 'input', view: 'visuals',
        defaults: _d({ x: 180, y: 120, w: 18, h: 18, textColor: '#e0e0f0' }),
      },
      {
        id: 'btnOpenSkinEditor', label: 'Open Skin Editor Button', tag: 'button', view: 'visuals',
        defaults: _d({ x: 320, y: 166, w: 100, h: 28, textContent: 'Open Editor', textColor: '#40c4ff', borderColor: '#40c4ff', borderWidth: 2, borderRadius: 3, fontWeight: 'bold', fontSize: 11 }),
      },
      {
        id: 'btnResetVisuals', label: 'Reset Visuals Button', tag: 'button', view: 'visuals',
        defaults: _d({ x: 40, y: 430, w: 420, h: 32, textContent: '\u21BA Reset Visuals', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12 }),
      },
      // Controls tab
      {
        id: 'keybindProfile', label: 'Keybind Profile Select', tag: 'select', view: 'controls',
        defaults: _d({ x: 100, y: 120, w: 180, h: 28, textColor: '#e0e0f0', bgColor: '#1a1a2e', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12, padding: 4 }),
      },
      {
        id: 'keybindBtns', label: 'Keybind Buttons', tag: 'div', view: 'controls',
        defaults: _d({ x: 40, y: 158, w: 420, h: 60, textColor: '#e0e0f0', bgColor: 'transparent', fontSize: 12 }),
      },
      {
        id: 'sLiveExitKey', label: 'Live Exit Key Button', tag: 'button', view: 'controls',
        defaults: _d({ x: 180, y: 260, w: 70, h: 28, textContent: 'Escape', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 11 }),
      },
      {
        id: 'sLivePauseKey', label: 'Live Pause Key Button', tag: 'button', view: 'controls',
        defaults: _d({ x: 180, y: 296, w: 70, h: 28, textContent: '␣', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 11 }),
      },
      {
        id: 'btnResetControls', label: 'Reset Controls Button', tag: 'button', view: 'controls',
        defaults: _d({ x: 40, y: 340, w: 420, h: 32, textContent: '\u21BA Reset Controls', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12 }),
      },
      // Footer
      {
        id: 'btnResetAllSettings', label: 'Reset All Settings', tag: 'button',
        defaults: _d({ x: 40, y: 650, w: 200, h: 32, textContent: '\u21BA Reset All', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12 }),
      },
      {
        id: 'btnCloseSettings', label: 'Close Settings Button', tag: 'button',
        defaults: _d({ x: 260, y: 650, w: 200, h: 32, textContent: '\u2715 Close', textColor: '#9898c0', borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 3, fontSize: 12 }),
      },
    ],

    // ═══ Game Page (500×700) — only pause menu is UI-editable ═══
    game: [
      {
        id: 'gpPauseTitle', label: 'Pause Title', tag: 'div',
        defaults: _d({ x: 100, y: 60, w: 300, h: 50, textContent: 'PAUSED', fontSize: 36, fontWeight: 'bold', textAlign: 'center' }),
      },
      {
        id: 'gpPauseButtons', label: 'Pause Buttons', tag: 'div',
        defaults: _d({ x: 50, y: 130, w: 400, h: 50, textAlign: 'center' }),
      },
      {
        id: 'gpPauseSummary', label: 'Settings Summary', tag: 'summary',
        defaults: _d({ x: 50, y: 200, w: 400, h: 28, textContent: '\u2699 SETTINGS', fontSize: 14, textColor: '#9898c0' }),
      },
      {
        id: 'gpPauseHint', label: 'Pause Hint', tag: 'div',
        defaults: _d({ x: 100, y: 650, w: 300, h: 24, textContent: 'ESC to resume', fontSize: 12, textColor: '#9898c0', textAlign: 'center' }),
      },
    ],
  };

  // ─── PAGE_VIEWS (tab/panel view configurations for the editor) ──

  const PAGE_VIEWS = {
    popup: {
      default: 'songs',
      views: [
        { id: 'songs', label: 'Song List',
          actions: [
            { sel: '#songItems', do: 'show' },
            { sel: '#settingsPanel', do: 'hide' },
            { sel: '#livePanel', do: 'hide' },
          ]},
        { id: 'settings', label: 'Settings',
          actions: [
            { sel: '#songItems', do: 'hide' },
            { sel: '#settingsPanel', do: 'show' },
            { sel: '#livePanel', do: 'hide' },
          ]},
        { id: 'live', label: 'Live Mode',
          actions: [
            { sel: '#songItems', do: 'hide' },
            { sel: '#settingsPanel', do: 'hide' },
            { sel: '#livePanel', do: 'show' },
          ]},
      ],
    },
    settings: {
      default: 'gameplay',
      tabBtnSelector: '.settings-tab',
      tabPanelSelector: '.settings-tab-content',
      views: [
        { id: 'gameplay', label: 'Gameplay', tab: 'gameplay' },
        { id: 'audio', label: 'Audio', tab: 'audio' },
        { id: 'visuals', label: 'Visuals', tab: 'visuals' },
        { id: 'controls', label: 'Controls', tab: 'controls' },
      ],
    },
    skinEditor: {
      default: 'colors',
      tabBtnSelector: '.skin-tab-btn',
      tabPanelSelector: '.skin-tab-panel',
      views: [
        { id: 'colors', label: 'Colors', tab: 'colors' },
        { id: 'notes', label: 'Notes', tab: 'notes' },
        { id: 'judgment', label: 'Judgment', tab: 'judgment' },
        { id: 'effects', label: 'Effects', tab: 'effects' },
        { id: 'advanced', label: 'Advanced', tab: 'advanced' },
        { id: 'live', label: 'Live', tab: 'live' },
      ],
    },
    game: {
      default: 'pause',
      views: [
        { id: 'pause', label: 'Pause', actions: [
          { sel: '#overlayPause', do: 'show' }, { sel: '#overlayResult', do: 'hide' },
          { sel: '#overlayCountdown', do: 'hide' }, { sel: '#loadScreen', do: 'hide' },
        ]},
      ],
    },
  };

  // ─── Auto-discovery helpers ────────────────────────────────────

  // Tags to skip during auto-discovery (not meaningful UI elements)
  var _SKIP_TAGS = { SCRIPT:1, STYLE:1, META:1, LINK:1, HEAD:1, HTML:1, BODY:1 };

  /**
   * Scan a document for all [id] elements not in PAGE_ELEMENTS[pageId].
   * Returns array of { id, label, tag, sel, view }.
   */
  function discoverElements(pageId, doc) {
    var registry = PAGE_ELEMENTS[pageId] || [];
    var knownIds = {};
    for (var i = 0; i < registry.length; i++) knownIds[registry[i].id] = true;

    var all = doc.querySelectorAll('[id]');
    var results = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var id = el.id;
      if (!id || knownIds[id]) continue;
      if (_SKIP_TAGS[el.tagName]) continue;
      if (el.tagName === 'INPUT' && el.type === 'file') continue;
      if (id.charAt(0) === '_' || id === 'countdownOverlay' || id === 'cdNum') continue;
      results.push({
        id: id,
        label: _labelFromId(id),
        tag: el.tagName.toLowerCase(),
        sel: '#' + id,
        view: _detectView(el, pageId),
      });
    }
    return results;
  }

  /**
   * Detect which view/tab an element belongs to by walking up the DOM.
   * Returns a view id string or null (global/all views).
   */
  function _detectView(el, pageId) {
    var parent = el.parentElement;
    while (parent) {
      // Settings overlay tabs
      if (parent.classList && parent.classList.contains('settings-tab-content') && parent.dataset && parent.dataset.tab) {
        return parent.dataset.tab;
      }
      // Skin editor tabs
      if (parent.classList && parent.classList.contains('skin-tab-panel') && parent.dataset && parent.dataset.tab) {
        return parent.dataset.tab;
      }
      // Popup panels
      if (pageId === 'popup') {
        if (parent.id === 'settingsPanel') return 'settings';
        if (parent.id === 'livePanel') return 'live';
        if (parent.id === 'songItems') return 'songs';
      }
      // Game pause overlay (only pause is UI-editable; rest via skin editor)
      if (pageId === 'game') {
        if (parent.id === 'overlayPause') return 'pause';
      }
      parent = parent.parentElement;
    }
    return null;
  }

  /**
   * Generate a human-readable label from an element ID.
   * Strips known prefixes and splits camelCase.
   */
  function _labelFromId(id) {
    // Strip known prefixes
    var stripped = id.replace(/^(idx|cr|ed|pop|se|st|btn|lbl)/, '');
    if (!stripped) stripped = id;
    // Split camelCase into words
    var words = stripped.replace(/([a-z])([A-Z])/g, '$1 $2')
                        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    // Capitalize first letter
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  // ─── Runtime Layout Applier ─────────────────────────────────────

  // CSS variable names for theme overrides
  const _THEME_VARS = [
    '--bg', '--bg2', '--bg3', '--border', '--text', '--text-dim',
    '--accent', '--cyan', '--green', '--red', '--yellow',
    '--btn-bg', '--btn-bg-cyan', '--btn-bg-green', '--btn-bg-red', '--btn-bg-dim',
    '--font'
  ];

  /**
   * Apply saved theme CSS variable overrides to <html>.
   * Reads from getThemeOverrides() and sets each CSS custom property.
   */
  function applyThemeOverrides() {
    const theme = getThemeOverrides();
    const root = document.documentElement.style;
    for (let i = 0; i < _THEME_VARS.length; i++) {
      const v = _THEME_VARS[i];
      if (theme[v] !== undefined && theme[v] !== null && theme[v] !== '') {
        root.setProperty(v, theme[v]);
      }
    }
  }

  /**
   * Read all CSS theme variables from :root and return as a plain object.
   * Normalises any rgb() returns to #hex for safe alpha-suffix appending.
   */
  function getThemeColors() {
    const cs = getComputedStyle(document.documentElement);
    const o = {};
    for (const v of _THEME_VARS) {
      let val = cs.getPropertyValue(v).trim();
      // Normalise "rgb(r, g, b)" → "#rrggbb"
      const m = val.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
      if (m) val = '#' + [m[1], m[2], m[3]].map(c => (+c).toString(16).padStart(2, '0')).join('');
      o[v.slice(2)] = val;  // strip leading '--'
    }
    return o;
  }
  window.getThemeColors = getThemeColors;

  /**
   * Convert "#RRGGBB" + float alpha (0-1) to "rgba(r,g,b,a)" string.
   */
  function hexToRgba(hex, alpha) {
    const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
    if (!m) return 'rgba(0,0,0,' + alpha + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + alpha + ')';
  }
  window.hexToRgba = hexToRgba;

  // Container elements that need overflow:auto when they have fixed height
  const OVERFLOW_ELS = new Set(['songList', 'songItems', 'playlistSection', 'seControls']);

  // Style keys that _setupContainer applies (saved/restored during baseline measurement)
  var _CONTAINER_KEYS = ['position', 'width', 'margin', 'padding', 'minHeight', 'height', 'overflowY', 'maxHeight'];

  /**
   * Apply _setupContainer constraints to body (or settings modal).
   * Used both permanently (runtime) and temporarily (baseline measurement).
   */
  function _applyContainerStyles(pageId) {
    var dims = PAGE_DIMENSIONS[pageId];
    if (!dims) return;

    if (pageId === 'settings') {
      var modal = document.getElementById('settingsModal');
      if (modal) {
        modal.style.position = 'relative';
        modal.style.width = dims.w + 'px';
        modal.style.height = dims.h + 'px';
        modal.style.overflow = 'auto';
      }
      return;
    }

    if (pageId === 'game') {
      var b = document.body;
      b.style.position = 'relative';
      b.style.width = dims.w + 'px';
      b.style.height = dims.h + 'px';
      return;
    }

    var b = document.body;
    b.style.position = 'relative';
    b.style.width = dims.w + 'px';
    b.style.margin = '0 auto';

    if (pageId === 'editor') {
      b.style.height = dims.h + 'px';
    } else {
      b.style.minHeight = dims.h + 'px';
    }

    if (pageId === 'popup') {
      b.style.overflowY = 'auto';
      b.style.maxHeight = '600px';
    }
  }

  /**
   * Measure real DOM positions of all registered elements in the
   * _setupContainer layout context. Temporarily applies constraints,
   * measures, then restores original styles (no visual flash).
   * Stores results in localStorage for the editor to use.
   */
  function _measureBaselines(pageId) {
    var dims = PAGE_DIMENSIONS[pageId];
    var registry = PAGE_ELEMENTS[pageId];
    if (!dims || !registry) return {};

    var b = document.body;
    var baselines = {};

    // Settings page: temporarily reveal overlay + modal for measurement
    var settingsOverlay, settingsModal, wasHiddenO, wasHiddenM;
    if (pageId === 'settings') {
      settingsOverlay = document.getElementById('settingsOverlay');
      settingsModal = document.getElementById('settingsModal');
      if (settingsOverlay) { wasHiddenO = settingsOverlay.classList.contains('hidden'); settingsOverlay.classList.remove('hidden'); }
      if (settingsModal) { wasHiddenM = settingsModal.classList.contains('hidden'); settingsModal.classList.remove('hidden'); }
    }

    // Save original body styles
    var orig = {};
    for (var ki = 0; ki < _CONTAINER_KEYS.length; ki++) {
      orig[_CONTAINER_KEYS[ki]] = b.style[_CONTAINER_KEYS[ki]];
    }
    var origTransition = b.style.transition;

    // Temporarily apply constraints (same as runtime _applyContainerStyles)
    b.style.transition = 'none';
    _applyContainerStyles(pageId);

    // Temporarily open closed <details> elements so children can be measured
    var closedDetails = [];
    var allDetails = document.querySelectorAll('details:not([open])');
    for (var di = 0; di < allDetails.length; di++) {
      allDetails[di].setAttribute('open', '');
      closedDetails.push(allDetails[di]);
    }

    // Temporarily reveal inactive tab panels so children can be measured
    var revealedPanels = [];
    var tabPanels = document.querySelectorAll('.skin-tab-panel, .settings-tab-content');
    for (var ti = 0; ti < tabPanels.length; ti++) {
      if (!tabPanels[ti].classList.contains('active')) {
        tabPanels[ti].classList.add('active');
        revealedPanels.push(tabPanels[ti]);
      }
    }

    // Popup: reveal settings/live panels
    var popupRevealed = [];
    if (pageId === 'popup') {
      var sp = document.getElementById('settingsPanel');
      var lp = document.getElementById('livePanel');
      if (sp && sp.classList.contains('hidden')) { sp.classList.remove('hidden'); popupRevealed.push(sp); }
      if (lp && lp.classList.contains('hidden')) { lp.classList.remove('hidden'); popupRevealed.push(lp); }
    }

    // Game: reveal pause overlay for measurement
    var gameRevealed = [];
    if (pageId === 'game') {
      var pauseOv = document.getElementById('overlayPause');
      if (pauseOv && pauseOv.classList.contains('hidden')) {
        pauseOv.classList.remove('hidden');
        gameRevealed.push(pauseOv);
      }
    }

    // Temporarily reveal hidden elements so we can measure their positions.
    // (Elements with class="hidden" have display:none!important)
    var hiddenByClass = [];
    var hiddenByStyle = [];
    for (var ri = 0; ri < registry.length; ri++) {
      var el = document.getElementById(registry[ri].id);
      if (el && el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        hiddenByClass.push(el);
      } else if (el && el.style.display === 'none') {
        el.style.display = '';
        hiddenByStyle.push(el);
      }
    }

    // Force reflow and measure all registered elements
    var bodyRect = b.getBoundingClientRect();
    for (var ri = 0; ri < registry.length; ri++) {
      var reg = registry[ri];
      var el = document.getElementById(reg.id);
      if (el) {
        var rect = el.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          baselines[reg.id] = {
            x: Math.round(rect.left - bodyRect.left),
            y: Math.round(rect.top - bodyRect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height)
          };
        }
      }
    }

    // Second pass: discover and measure elements with IDs not in the registry
    var discovered = discoverElements(pageId, document);
    // Temporarily reveal any hidden discovered elements
    var discHiddenByClass = [];
    var discHiddenByStyle = [];
    for (var di = 0; di < discovered.length; di++) {
      var el = document.getElementById(discovered[di].id);
      if (el && el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        discHiddenByClass.push(el);
      } else if (el && el.style.display === 'none') {
        el.style.display = '';
        discHiddenByStyle.push(el);
      }
    }
    // Re-read bodyRect after potential layout changes
    bodyRect = b.getBoundingClientRect();
    for (var di = 0; di < discovered.length; di++) {
      var el = document.getElementById(discovered[di].id);
      if (el) {
        var rect = el.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          baselines[discovered[di].id] = {
            x: Math.round(rect.left - bodyRect.left),
            y: Math.round(rect.top - bodyRect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height)
          };
        }
      }
    }
    // Restore hidden discovered elements
    for (var hi = 0; hi < discHiddenByClass.length; hi++) discHiddenByClass[hi].classList.add('hidden');
    for (var hi = 0; hi < discHiddenByStyle.length; hi++) discHiddenByStyle[hi].style.display = 'none';

    // Restore hidden elements
    for (var hi = 0; hi < hiddenByClass.length; hi++) hiddenByClass[hi].classList.add('hidden');
    for (var hi = 0; hi < hiddenByStyle.length; hi++) hiddenByStyle[hi].style.display = 'none';

    // Restore closed <details> elements
    for (var di = 0; di < closedDetails.length; di++) closedDetails[di].removeAttribute('open');

    // Restore revealed tab panels
    for (var ti = 0; ti < revealedPanels.length; ti++) revealedPanels[ti].classList.remove('active');

    // Restore popup panels
    for (var pi = 0; pi < popupRevealed.length; pi++) popupRevealed[pi].classList.add('hidden');

    // Restore game overlays
    for (var gi = 0; gi < gameRevealed.length; gi++) gameRevealed[gi].classList.add('hidden');

    // Restore settings overlay/modal visibility
    if (pageId === 'settings') {
      if (settingsOverlay && wasHiddenO) settingsOverlay.classList.add('hidden');
      if (settingsModal && wasHiddenM) settingsModal.classList.add('hidden');
    }

    // Restore original styles (no paint happens between apply and restore)
    for (var ki = 0; ki < _CONTAINER_KEYS.length; ki++) {
      b.style[_CONTAINER_KEYS[ki]] = orig[_CONTAINER_KEYS[ki]];
    }
    b.style.transition = origTransition;

    // Store baselines for the editor (separate from page data so savePageLayout won't erase them)
    try {
      var fullLayout = getUILayout();
      if (!fullLayout.baselines) fullLayout.baselines = {};
      fullLayout.baselines[pageId] = baselines;
      saveUILayout(fullLayout);
    } catch (_) { /* storage full — non-critical */ }

    return baselines;
  }

  /**
   * Apply saved UI layout overrides and custom elements for a page.
   * @param {string} pageId - one of 'index','create','editor','popup','skinEditor'
   */
  function applyUILayout(pageId) {
    if (!pageId) return;
    const pageLayout = getPageLayout(pageId);
    const registry = PAGE_ELEMENTS[pageId];
    if (!registry) return;

    const overrides = pageLayout.overrides || {};
    const custom = pageLayout.custom || [];

    // ── Phase 1: Measure baselines (temporary, invisible) ──
    // This captures real element positions in the _setupContainer layout,
    // giving the editor accurate coordinates for the preview.
    var baselines = _measureBaselines(pageId);

    // ── Phase 2: Apply position/size overrides via CSS transforms ──
    // Uses transform:translate() instead of position:absolute so elements
    // stay in DOM flow.  Delta = (override - baseline) → zero positioning error.
    var hasPosOverrides = false;
    for (var elId in overrides) {
      if (!overrides.hasOwnProperty(elId)) continue;
      var ov = overrides[elId];
      if (ov.x !== undefined || ov.y !== undefined || ov.w !== undefined || ov.h !== undefined) {
        hasPosOverrides = true;
        break;
      }
    }

    if (hasPosOverrides) {
      // Constrain body to match the baseline measurement context
      _applyContainerStyles(pageId);

      var regMap = {};
      for (var ri = 0; ri < registry.length; ri++) regMap[registry[ri].id] = registry[ri];

      for (var elId in overrides) {
        if (!overrides.hasOwnProperty(elId)) continue;
        var ov = overrides[elId];
        if (ov.x === undefined && ov.y === undefined && ov.w === undefined && ov.h === undefined) continue;

        var el = document.getElementById(elId);
        if (!el) continue;
        if (pageId === 'settings' && (elId === 'settingsOverlay' || elId === 'settingsModal')) continue;

        // Resolve baseline (real measured position) or fall back to registry defaults
        var bl = baselines[elId];
        if (!bl) { var reg = regMap[elId]; bl = reg ? reg.defaults : null; }
        if (!bl) continue;

        // Position: compute delta from natural position → relative offset
        // Uses position:relative + left/top instead of transform:translate
        // so CSS animations (like btnTap) don't override the position.
        if (ov.x !== undefined || ov.y !== undefined) {
          var dx = (ov.x !== undefined ? ov.x : bl.x) - bl.x;
          var dy = (ov.y !== undefined ? ov.y : bl.y) - bl.y;
          if (dx !== 0 || dy !== 0) {
            el.style.position = 'relative';
            el.style.left = dx + 'px';
            el.style.top = dy + 'px';
          }
        }

        // Rotation: kept in transform (safe — no conflict with position offset)
        if (ov.rotation !== undefined && ov.rotation !== 0) {
          el.style.transform = 'rotate(' + ov.rotation + 'deg)';
        }

        // Size: set explicit dimensions (element stays in flow)
        if (ov.w !== undefined) el.style.width = ov.w + 'px';
        if (ov.h !== undefined) el.style.height = ov.h + 'px';

        if (OVERFLOW_ELS.has(elId)) el.style.overflow = 'auto';
      }
    }

    // ── Phase 3: Apply visual style overrides ──
    for (var elId in overrides) {
      if (!overrides.hasOwnProperty(elId)) continue;
      var ov = overrides[elId];
      var el = document.getElementById(elId);
      if (!el) continue;

      if (ov._hidden === true) {
        el.style.display = 'none';
        continue;
      }

      // Text content
      if (ov.textContent !== undefined) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.placeholder = ov.textContent;
        } else {
          el.textContent = ov.textContent;
        }
      }

      // Visual style properties
      if (ov.textColor !== undefined)    el.style.color = ov.textColor;
      if (ov.bgColor !== undefined) {
        var bg = ov.bgColor;
        if (bg && (bg.includes('gradient') || bg.includes('linear-') || bg.includes('radial-'))) {
          el.style.background = bg;
        } else {
          el.style.backgroundColor = bg;
        }
      }
      if (ov.borderColor !== undefined)  el.style.borderColor = ov.borderColor;
      if (ov.borderWidth !== undefined) {
        el.style.borderWidth = ov.borderWidth + 'px';
        el.style.borderStyle = ov.borderStyle || 'solid';
      }
      if (ov.borderStyle !== undefined) el.style.borderStyle = ov.borderStyle;
      if (ov.borderRadius !== undefined) el.style.borderRadius = ov.borderRadius + 'px';
      if (ov.opacity !== undefined)      el.style.opacity = ov.opacity / 100;
      if (ov.fontFamily !== undefined)   el.style.fontFamily = ov.fontFamily;
      if (ov.fontSize !== undefined)     el.style.fontSize = ov.fontSize + 'px';
      if (ov.fontWeight !== undefined)   el.style.fontWeight = ov.fontWeight;
      if (ov.fontStyle !== undefined)    el.style.fontStyle = ov.fontStyle;
      if (ov.textAlign !== undefined)    el.style.textAlign = ov.textAlign;
      if (ov.padding !== undefined)      el.style.padding = ov.padding + 'px';
      if (ov.zIndex !== undefined)       el.style.zIndex = ov.zIndex;
      // Rotation (Phase 2 handles it for position-overridden elements;
      // this catches elements with only visual overrides + rotation)
      if (ov.rotation !== undefined && ov.rotation !== 0) {
        if (!el.style.transform || el.style.transform.indexOf('rotate') === -1) {
          el.style.transform = 'rotate(' + ov.rotation + 'deg)';
        }
      }
    }

    // ── Custom elements ──
    if (custom.length === 0) return;

    var container = document.getElementById('_krCustomEls');
    if (!container) {
      container = document.createElement('div');
      container.id = '_krCustomEls';
      container.style.position = 'fixed';
      container.style.inset = '0';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '50';
      document.body.appendChild(container);
    }
    container.innerHTML = '';

    for (var ci = 0; ci < custom.length; ci++) {
      var c = custom[ci];
      // Props may be nested under c.props (editor save format) or flat (legacy)
      var p = c.props || c;
      var div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.pointerEvents = 'auto';

      // Apply all style properties
      if (p.x !== undefined) div.style.left = p.x + 'px';
      if (p.y !== undefined) div.style.top = p.y + 'px';
      if (p.w !== undefined) div.style.width = p.w + 'px';
      if (p.h !== undefined) div.style.height = p.h + 'px';
      if (p.textContent)     div.textContent = p.textContent;
      if (p.textColor)       div.style.color = p.textColor;
      if (p.bgColor) {
        var bg = p.bgColor;
        if (bg && (bg.includes('gradient') || bg.includes('linear-') || bg.includes('radial-'))) {
          div.style.background = bg;
        } else {
          div.style.backgroundColor = bg;
        }
      }
      if (p.borderColor)     div.style.borderColor = p.borderColor;
      if (p.borderWidth) {
        div.style.borderWidth = p.borderWidth + 'px';
        div.style.borderStyle = p.borderStyle || 'solid';
      }
      if (p.borderRadius !== undefined) div.style.borderRadius = p.borderRadius + 'px';
      if (p.opacity !== undefined)      div.style.opacity = p.opacity / 100;
      if (p.fontFamily)                 div.style.fontFamily = p.fontFamily;
      if (p.fontSize !== undefined)     div.style.fontSize = p.fontSize + 'px';
      if (p.fontWeight)                 div.style.fontWeight = p.fontWeight;
      if (p.fontStyle)                  div.style.fontStyle = p.fontStyle;
      if (p.textAlign)                  div.style.textAlign = p.textAlign;
      if (p.padding !== undefined)      div.style.padding = p.padding + 'px';
      if (p.zIndex !== undefined)       div.style.zIndex = p.zIndex;
      if (p.rotation)                   div.style.transform = 'rotate(' + p.rotation + 'deg)';

      // Type-specific rendering
      if (c.type === 'image' && c.typeProps && c.typeProps.imageData) {
        div.style.backgroundImage = 'url(' + c.typeProps.imageData + ')';
        div.style.backgroundSize = c.typeProps.objectFit || 'cover';
        div.style.backgroundPosition = 'center';
        div.style.backgroundRepeat = 'no-repeat';
      }

      // Wire button link targets (safe: only known pages or http(s) URLs)
      if (c.type === 'button' && c.typeProps && c.typeProps.linkTarget) {
        var lt = c.typeProps.linkTarget;
        var PAGES = { index: 'index.html', create: 'create.html', editor: 'editor.html', 'skin-editor': 'skin-editor.html' };
        if (PAGES[lt]) {
          div.style.cursor = 'pointer';
          (function(href) {
            div.addEventListener('click', function() { window.location.href = href; });
          })(PAGES[lt]);
        } else if (lt === 'custom') {
          var url = c.typeProps.customURL || '';
          if (/^https?:\/\//.test(url)) {
            div.style.cursor = 'pointer';
            (function(href) {
              div.addEventListener('click', function() { window.open(href, '_blank'); });
            })(url);
          }
        }
      }

      container.appendChild(div);
    }
  }

  /**
   * Detect which page is currently loaded based on pathname.
   */
  function _detectPage() {
    var p = window.location.pathname;
    if (p.indexOf('skin-editor') !== -1) return 'skinEditor';
    if (p.indexOf('index') !== -1 || p.endsWith('/')) return 'index';
    if (p.indexOf('create') !== -1) return 'create';
    if (p.indexOf('editor') !== -1) return 'editor';
    if (p.indexOf('popup') !== -1) return 'popup';
    if (p.indexOf('game') !== -1) return 'game';
    return null;
  }

  // ─── Auto-apply on page load ───────────────────────────────────

  function _autoApply() {
    applyThemeOverrides();
    var page = _detectPage();
    if (page) applyUILayout(page);
    // Settings overlay lives in index.html — apply its overrides there too
    if (page === 'index') applyUILayout('settings');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoApply);
  } else {
    _autoApply();
  }

  // ─── Export to window ────────────────────────────────────────────

  window.getUILayout       = getUILayout;
  window.saveUILayout      = saveUILayout;
  window.getPageLayout     = getPageLayout;
  window.savePageLayout    = savePageLayout;
  window.getThemeOverrides = getThemeOverrides;
  window.saveThemeOverrides = saveThemeOverrides;
  window.clearAllLayouts   = clearAllLayouts;
  window.PAGE_ELEMENTS     = PAGE_ELEMENTS;
  window.PAGE_DIMENSIONS   = PAGE_DIMENSIONS;
  window.PAGE_VIEWS        = PAGE_VIEWS;
  window.applyThemeOverrides = applyThemeOverrides;
  window._THEME_VARS       = _THEME_VARS;
  window.applyUILayout     = applyUILayout;
  window.discoverElements  = discoverElements;
  window._d                = _d;

})();
