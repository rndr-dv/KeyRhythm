// Theme Browser — browse, preview, and apply theme + skin presets
(function() {
  'use strict';

  // ─── Built-in theme presets (theme = CSS vars, matched 1:1 with PRESET_SKINS) ──
  const BUILTIN = [
    { name: 'Default',    desc: 'Clean dark with purple accent',
      theme: { '--bg': '#0a0a14', '--bg2': '#12121e', '--bg3': '#1a1a2e', '--border': '#2a2a4a', '--text': '#e0e0f0', '--text-dim': '#9898c0', '--accent': '#c060ff', '--cyan': '#40c4ff', '--green': '#60ff90', '--red': '#ff4060', '--yellow': '#ffd040' } },
    { name: 'Neon',       desc: 'Electric saturated glow',
      theme: { '--bg': '#050510', '--bg2': '#0a0a18', '--bg3': '#10102a', '--border': '#30106a', '--text': '#f0f0ff', '--text-dim': '#b080e0', '--accent': '#ff00ff', '--cyan': '#00ffff', '--green': '#00ff66', '--red': '#ff0066', '--yellow': '#ffff00' } },
    { name: 'Pastel',     desc: 'Soft desaturated warmth',
      theme: { '--bg': '#181820', '--bg2': '#1e1e2a', '--bg3': '#262636', '--border': '#38384e', '--text': '#d0d0e0', '--text-dim': '#9898b0', '--accent': '#c8a0e8', '--cyan': '#90c8e8', '--green': '#a0d8b0', '--red': '#e0a0b0', '--yellow': '#e0d098' } },
    { name: 'Midnight',   desc: 'Ultra-dark muted jewels',
      theme: { '--bg': '#040408', '--bg2': '#08080e', '--bg3': '#0e0e18', '--border': '#1a1a30', '--text': '#8080a0', '--text-dim': '#606080', '--accent': '#6040b0', '--cyan': '#3080a0', '--green': '#408060', '--red': '#a03050', '--yellow': '#a09030' } },
    { name: 'Synthwave',  desc: 'Retro 80s sunset',
      theme: { '--bg': '#0c0618', '--bg2': '#120a22', '--bg3': '#1a1030', '--border': '#3a1860', '--text': '#f0e0ff', '--text-dim': '#b080d0', '--accent': '#ff2090', '--cyan': '#ff8040', '--green': '#ffd040', '--red': '#ff1060', '--yellow': '#ff6020' } },
    { name: 'Sakura',     desc: 'Cherry blossom pink',
      theme: { '--bg': '#120a10', '--bg2': '#1a1018', '--bg3': '#221822', '--border': '#3e2838', '--text': '#f0e0ea', '--text-dim': '#a88898', '--accent': '#f080a0', '--cyan': '#e0a8c0', '--green': '#98c8a0', '--red': '#e06080', '--yellow': '#e0c090' } },
    { name: 'Terminal',   desc: 'Green-on-black CRT',
      theme: { '--bg': '#000000', '--bg2': '#060806', '--bg3': '#0c100c', '--border': '#1a2a1a', '--text': '#40ff40', '--text-dim': '#20a020', '--accent': '#30e830', '--cyan': '#20c060', '--green': '#40ff40', '--red': '#e04040', '--yellow': '#a0e020' } },
    { name: 'Cyber',      desc: 'Cyberpunk yellow edge',
      theme: { '--bg': '#08080a', '--bg2': '#0e0e12', '--bg3': '#16161c', '--border': '#2a2a38', '--text': '#e8e8f0', '--text-dim': '#8888a0', '--accent': '#f0e020', '--cyan': '#00e8e8', '--green': '#00e860', '--red': '#ff2040', '--yellow': '#f0e020' } },
    { name: 'Ember',      desc: 'Smoldering fire warmth',
      theme: { '--bg': '#100804', '--bg2': '#180e08', '--bg3': '#22140c', '--border': '#3a2218', '--text': '#f0e0d0', '--text-dim': '#a08060', '--accent': '#e06020', '--cyan': '#e09030', '--green': '#c0a030', '--red': '#e03020', '--yellow': '#ffa030' } },
    { name: 'Arctic',     desc: 'Ice cold minimal',
      theme: { '--bg': '#040608', '--bg2': '#080c10', '--bg3': '#0e1418', '--border': '#1e2a34', '--text': '#e8f0f8', '--text-dim': '#7090a8', '--accent': '#60c0f0', '--cyan': '#80d8ff', '--green': '#a0e8d0', '--red': '#f06080', '--yellow': '#d0d8e0' } },
    { name: 'Vaporwave',  desc: 'Dreamy pink and cyan',
      theme: { '--bg': '#0a0812', '--bg2': '#12101c', '--bg3': '#1c1828', '--border': '#302848', '--text': '#e8d8f8', '--text-dim': '#9880b8', '--accent': '#ff60b0', '--cyan': '#60f0f0', '--green': '#b080ff', '--red': '#ff4080', '--yellow': '#f0a0e0' } },
    { name: 'Gold',       desc: 'Luxurious black and gold',
      theme: { '--bg': '#0a0804', '--bg2': '#10100a', '--bg3': '#1a1810', '--border': '#30281a', '--text': '#f0e8d8', '--text-dim': '#908060', '--accent': '#d4a830', '--cyan': '#c0a040', '--green': '#a0b040', '--red': '#c04030', '--yellow': '#e8c840' } },
    { name: 'Toxic',      desc: 'Radioactive acid glow',
      theme: { '--bg': '#020402', '--bg2': '#060a06', '--bg3': '#0c120c', '--border': '#1a2a18', '--text': '#d0f0c0', '--text-dim': '#60a040', '--accent': '#40ff00', '--cyan': '#ff00c0', '--green': '#40ff00', '--red': '#ff0060', '--yellow': '#c0ff00' } },
    { name: 'Ocean',      desc: 'Deep sea bioluminescence',
      theme: { '--bg': '#020810', '--bg2': '#041018', '--bg3': '#081822', '--border': '#103050', '--text': '#c0e0f8', '--text-dim': '#5090b8', '--accent': '#00b8f0', '--cyan': '#00e8d0', '--green': '#40d8a0', '--red': '#f06080', '--yellow': '#80d0e0' } },
    { name: 'Sunset',     desc: 'Warm dusk horizon',
      theme: { '--bg': '#10060a', '--bg2': '#180a10', '--bg3': '#221018', '--border': '#402030', '--text': '#f8e8e0', '--text-dim': '#b08070', '--accent': '#f08030', '--cyan': '#e06090', '--green': '#d0a050', '--red': '#e04050', '--yellow': '#f0c040' } },
    { name: 'Monochrome', desc: 'Pure grayscale minimal',
      theme: { '--bg': '#080808', '--bg2': '#0e0e0e', '--bg3': '#161616', '--border': '#2a2a2a', '--text': '#d0d0d0', '--text-dim': '#707070', '--accent': '#b0b0b0', '--cyan': '#909090', '--green': '#a0a0a0', '--red': '#808080', '--yellow': '#c0c0c0' } },
    { name: 'Blood Moon', desc: 'Deep crimson eclipse',
      theme: { '--bg': '#0a0204', '--bg2': '#120408', '--bg3': '#1c080e', '--border': '#3a1020', '--text': '#f0d0d8', '--text-dim': '#a05060', '--accent': '#e01030', '--cyan': '#c03050', '--green': '#d06040', '--red': '#ff1040', '--yellow': '#e08040' } },
    { name: 'Forest',     desc: 'Earthy woodland floor',
      theme: { '--bg': '#060804', '--bg2': '#0c1008', '--bg3': '#14180e', '--border': '#283020', '--text': '#d8e0d0', '--text-dim': '#708060', '--accent': '#60a840', '--cyan': '#80b860', '--green': '#50c040', '--red': '#c06040', '--yellow': '#b0a040' } },
    { name: 'Lavender',   desc: 'Soft purple dreams',
      theme: { '--bg': '#0c0810', '--bg2': '#141018', '--bg3': '#1c1822', '--border': '#302840', '--text': '#e8e0f0', '--text-dim': '#9080a8', '--accent': '#b080e0', '--cyan': '#9090e0', '--green': '#a0c0b0', '--red': '#d080a0', '--yellow': '#d0b8e0' } },
    { name: 'Galaxy',     desc: 'Deep space nebula',
      theme: { '--bg': '#04020a', '--bg2': '#080610', '--bg3': '#100c1c', '--border': '#201840', '--text': '#e0d8f8', '--text-dim': '#8070b0', '--accent': '#8040e0', '--cyan': '#60a0ff', '--green': '#a080ff', '--red': '#e040a0', '--yellow': '#c0a0ff' } },
    { name: 'Candy',      desc: 'Sweet playful colors',
      theme: { '--bg': '#0e0810', '--bg2': '#16101a', '--bg3': '#1e1824', '--border': '#342840', '--text': '#f8e8f8', '--text-dim': '#b088b8', '--accent': '#ff60c0', '--cyan': '#60d0ff', '--green': '#80ff80', '--red': '#ff6080', '--yellow': '#ffe060' } },
    { name: 'Jade',       desc: 'Polished green stone',
      theme: { '--bg': '#020806', '--bg2': '#06100a', '--bg3': '#0c1810', '--border': '#18302a', '--text': '#d0f0e8', '--text-dim': '#509880', '--accent': '#30c090', '--cyan': '#40b0a0', '--green': '#40e080', '--red': '#c06060', '--yellow': '#90d080' } },
    { name: 'Coral',      desc: 'Warm reef tropics',
      theme: { '--bg': '#0a0608', '--bg2': '#140c10', '--bg3': '#1e1218', '--border': '#382030', '--text': '#f8e8e8', '--text-dim': '#a88088', '--accent': '#f07060', '--cyan': '#f0a080', '--green': '#e0b080', '--red': '#e05050', '--yellow': '#f0c060' } },
    { name: 'Storm',      desc: 'Thunderstorm lightning',
      theme: { '--bg': '#040408', '--bg2': '#0a0a12', '--bg3': '#12121e', '--border': '#20202e', '--text': '#d0d0e0', '--text-dim': '#606880', '--accent': '#90a0c0', '--cyan': '#80b0e0', '--green': '#70a090', '--red': '#c06080', '--yellow': '#e0e0a0' } },
    { name: 'Cherry',     desc: 'Bold crimson pop',
      theme: { '--bg': '#0a0406', '--bg2': '#12080c', '--bg3': '#1c0e14', '--border': '#381822', '--text': '#f8e0e8', '--text-dim': '#a06878', '--accent': '#f02060', '--cyan': '#ff6090', '--green': '#e08070', '--red': '#ff1040', '--yellow': '#f0a080' } },
    { name: 'Rainbow',    desc: 'Full spectrum ROYGBIV',
      theme: { '--bg': '#0a0a14', '--bg2': '#10101e', '--bg3': '#18182e', '--border': '#28283e', '--text': '#f0f0ff', '--text-dim': '#9898c0', '--accent': '#ff2020', '--cyan': '#2080ff', '--green': '#20e060', '--red': '#ff4040', '--yellow': '#ffe040' } },
    { name: 'Desert',     desc: 'Sandy dunes and terra cotta',
      theme: { '--bg': '#0c0806', '--bg2': '#14100a', '--bg3': '#1c1810', '--border': '#302818', '--text': '#e8dcc8', '--text-dim': '#907858', '--accent': '#c89860', '--cyan': '#b08050', '--green': '#b0a060', '--red': '#a05030', '--yellow': '#d0a050' } },
    { name: 'Aurora',     desc: 'Northern lights shimmer',
      theme: { '--bg': '#020610', '--bg2': '#060e18', '--bg3': '#0c1624', '--border': '#18283a', '--text': '#c0f0e0', '--text-dim': '#5098a0', '--accent': '#40e890', '--cyan': '#40b0e0', '--green': '#40e890', '--red': '#d04080', '--yellow': '#60f0c0' } },
    { name: 'Firefly',    desc: 'Summer night bioluminescence',
      theme: { '--bg': '#060804', '--bg2': '#0c1008', '--bg3': '#141a0e', '--border': '#242a18', '--text': '#e0e8c0', '--text-dim': '#7a8858', '--accent': '#c0d020', '--cyan': '#a0c030', '--green': '#a0c030', '--red': '#c05040', '--yellow': '#e0e040' } },
    { name: 'Cobalt',     desc: 'Rich deep blue intensity',
      theme: { '--bg': '#020410', '--bg2': '#060a18', '--bg3': '#0c1224', '--border': '#182040', '--text': '#c0d0f8', '--text-dim': '#5070a0', '--accent': '#3060e0', '--cyan': '#4080ff', '--green': '#4080f0', '--red': '#e04060', '--yellow': '#80b0ff' } },
    { name: 'Glass',      desc: 'Frosted translucent panes',
      theme: { '--bg': '#080a0e', '--bg2': '#0e1218', '--bg3': '#161c22', '--border': '#283040', '--text': '#e0e8f0', '--text-dim': '#7888a0', '--accent': '#c0d0e0', '--cyan': '#d0c8e0', '--green': '#c0d8e0', '--red': '#a08090', '--yellow': '#d0c8b0' } },
    { name: 'Sunrise',    desc: 'Dawn sky purple to gold',
      theme: { '--bg': '#080410', '--bg2': '#100a1a', '--bg3': '#1a1226', '--border': '#302040', '--text': '#f0e0d0', '--text-dim': '#9070a0', '--accent': '#f08060', '--cyan': '#8040c0', '--green': '#e080a0', '--red': '#4030a0', '--yellow': '#f0c060' } },
    { name: 'Opal',       desc: 'Iridescent gemstone shimmer',
      theme: { '--bg': '#0c0a10', '--bg2': '#14121c', '--bg3': '#1e1a28', '--border': '#302838', '--text': '#f0e8f8', '--text-dim': '#9080a8', '--accent': '#d0a0e0', '--cyan': '#a0d0e0', '--green': '#a0d8c0', '--red': '#c08090', '--yellow': '#e0c0a0' } },
    { name: 'Crimson',    desc: 'Deep luxurious red velvet',
      theme: { '--bg': '#0a0204', '--bg2': '#120608', '--bg3': '#1c0c10', '--border': '#381018', '--text': '#f0d0d8', '--text-dim': '#a05068', '--accent': '#d01020', '--cyan': '#e02030', '--green': '#d04050', '--red': '#401018', '--yellow': '#ff6070' } },
  ];

  // Name-based skin lookup (robust against reorder/filter)
  function findPresetSkin(name) {
    return PRESET_SKINS.find(function(s) { return s.name === name; }) || null;
  }

  const CSS_VARS = ['--bg', '--bg2', '--bg3', '--border', '--text', '--text-dim', '--accent', '--cyan', '--green', '--red', '--yellow', '--btn-bg', '--btn-bg-cyan', '--btn-bg-green', '--btn-bg-red', '--btn-bg-dim', '--font'];
  const SWATCH_VARS = ['--accent', '--cyan', '--green', '--red', '--yellow'];

  // Generate select arrow SVGs from theme colors (CSS vars can't be used in data URIs)
  function updateSelectArrows(theme) {
    var dim = theme['--text-dim'], acc = theme['--accent'];
    if (!dim && !acc) return;
    var root = document.documentElement.style;
    var svg = function(c) {
      return "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7' fill='none' stroke='" + encodeURIComponent(c) + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M1 1l5 5 5-5'/%3E%3C/svg%3E\")";
    };
    if (dim) root.setProperty('--select-arrow', svg(dim));
    if (acc) root.setProperty('--select-arrow-active', svg(acc));
  }

  const CUSTOM_KEY = 'keyrhythm_custom_themes';

  // ─── Custom theme storage ──────────────────────────────────────────
  function loadCustom() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); }
    catch (_) { return []; }
  }

  function saveCustom(arr) {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr));
    } catch (e) {
      if (typeof showToast === 'function') showToast('Storage full — custom theme not saved.', 3000, true);
    }
  }

  // ─── DOM refs ──────────────────────────────────────────────────────
  const builtinGrid    = document.getElementById('tbBuiltinGrid');
  const customGrid     = document.getElementById('tbCustomGrid');
  const customEmpty    = document.getElementById('tbCustomEmpty');
  const gameCanvas     = document.getElementById('tbGameCanvas');
  const uiCanvas       = document.getElementById('tbUICanvas');
  const btnApply       = document.getElementById('btnApplyTheme');
  const btnCancel      = document.getElementById('btnCancelPreview');
  const btnSaveCurrent = document.getElementById('btnSaveCurrent');
  const searchInput    = document.getElementById('tbSearch');
  const sortSelect     = document.getElementById('tbSort');
  const btnBack        = document.getElementById('btnBack');
  const colorEditor    = document.getElementById('tbColorEditor');
  const colorRows      = document.getElementById('tbColorRows');
  const btnSaveEdited  = document.getElementById('btnSaveEdited');

  let selectedPreset = null;   // { name, desc, theme, skin?, isCustom, idx }
  let selectedCard   = null;   // DOM element
  let savedTheme     = {};     // snapshot before any preview
  let editorPickers  = {};     // { varName: picker instance }
  let editedTheme    = null;   // working copy of theme being edited

  // ── Autosave for theme color edits ────────────────────────────────────────
  let _themeAutosaveDebounce = null;
  let _themeModified = false;

  function _themeAutoSaveTick() {
    _themeModified = true;
    if (!getSettings().autosave || !editedTheme) return;
    clearTimeout(_themeAutosaveDebounce);
    _themeAutosaveDebounce = setTimeout(() => {
      saveThemeOverrides(Object.assign({}, editedTheme));
      _themeModified = false;
      if (typeof showToast === 'function') showToast('Auto-saved theme');
    }, 800);
  }

  setInterval(() => {
    if (_themeModified && getSettings().autosave && editedTheme) {
      saveThemeOverrides(Object.assign({}, editedTheme));
      _themeModified = false;
    }
  }, 30000);

  // Take a snapshot of current CSS vars so we can revert
  function snapshotTheme() {
    const cs = getComputedStyle(document.documentElement);
    const snap = {};
    CSS_VARS.forEach(function(v) {
      var val = cs.getPropertyValue(v).trim();
      // Skip gradient values — they don't need normalisation
      if (val.indexOf('linear-gradient') === -1) {
        // Normalise rgb() to hex
        var m = val.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
        if (m) val = '#' + [m[1], m[2], m[3]].map(function(c) { return (+c).toString(16).padStart(2, '0'); }).join('');
      }
      snap[v] = val;
    });
    return snap;
  }

  savedTheme = snapshotTheme();

  // ─── Color editor labels ───────────────────────────────────────────
  var COLOR_LABELS = {
    '--bg': 'Background', '--bg2': 'BG Panel', '--bg3': 'BG Accent',
    '--border': 'Border', '--text': 'Text', '--text-dim': 'Text Dim',
    '--accent': 'Accent', '--cyan': 'Cyan', '--green': 'Green',
    '--red': 'Red', '--yellow': 'Yellow',
    '--btn-bg': 'Accent Btn', '--btn-bg-cyan': 'Cyan Btn',
    '--btn-bg-green': 'Green Btn', '--btn-bg-red': 'Red Btn',
    '--btn-bg-dim': 'Dim Btn',
  };
  var EDITOR_GROUPS = [
    { label: 'Backgrounds', vars: ['--bg', '--bg2', '--bg3'] },
    { label: 'Text',        vars: ['--text', '--text-dim'] },
    { label: 'Borders',     vars: ['--border'] },
    { label: 'Colors',      vars: ['--accent', '--cyan', '--green', '--red', '--yellow'] },
    { label: 'Button Fills', vars: ['--btn-bg', '--btn-bg-cyan', '--btn-bg-green', '--btn-bg-red', '--btn-bg-dim'] },
  ];
  var EDITABLE_VARS = EDITOR_GROUPS.reduce(function(acc, g) { return acc.concat(g.vars); }, []);

  // ─── Setup color editor pickers ────────────────────────────────────
  function destroyEditorPickers() {
    Object.keys(editorPickers).forEach(function(k) {
      if (editorPickers[k] && editorPickers[k].destroy) editorPickers[k].destroy();
    });
    editorPickers = {};
    colorRows.innerHTML = '';
  }

  function setupColorEditor(theme) {
    destroyEditorPickers();
    editedTheme = Object.assign({}, theme);

    EDITOR_GROUPS.forEach(function(group) {
      var header = document.createElement('div');
      header.className = 'tb-color-group-label collapsed';
      header.textContent = group.label;
      colorRows.appendChild(header);

      var body = document.createElement('div');
      body.className = 'tb-color-group-body collapsed';
      colorRows.appendChild(body);

      header.addEventListener('click', function() {
        header.classList.toggle('collapsed');
        body.classList.toggle('collapsed');
      });

      group.vars.forEach(function(varName) {
        var raw = editedTheme[varName];
        var isTransparent = !raw || raw === 'transparent';
        var pickerColor = isTransparent ? '#00000000' : raw;
        var val = isTransparent ? 'transparent' : raw;

        var row = document.createElement('div');
        row.className = 'tb-color-row';

        var label = document.createElement('label');
        label.textContent = COLOR_LABELS[varName] || varName;
        row.appendChild(label);

        var container = document.createElement('div');
        container.className = 'kr-picker-container';
        row.appendChild(container);

        var hexSpan = document.createElement('span');
        hexSpan.className = 'tb-color-hex';
        hexSpan.textContent = val;
        row.appendChild(hexSpan);

        body.appendChild(row);

        function onColorChange(newVal) {
          editedTheme[varName] = newVal;
          hexSpan.textContent = newVal;
          document.documentElement.style.setProperty(varName, newVal);
          if (varName === '--text-dim' || varName === '--accent') updateSelectArrows(editedTheme);
          var skinObj = selectedPreset && selectedPreset.isCustom ? selectedPreset.skin : (selectedPreset ? findPresetSkin(selectedPreset.name) : null);
          drawGamePreview(skinObj);
          drawUIPreview(editedTheme);
          _themeAutoSaveTick();
        }

        editorPickers[varName] = initColorPicker(container, {
          color: pickerColor,
          opacity: true,
          onChange: onColorChange,
        });
      });
    });

    colorEditor.classList.remove('hidden');
  }

  function hideColorEditor() {
    colorEditor.classList.add('hidden');
    destroyEditorPickers();
    editedTheme = null;
    _themeModified = false;
    clearTimeout(_themeAutosaveDebounce);
  }

  // ─── Save edited theme ─────────────────────────────────────────────
  btnSaveEdited.addEventListener('click', function() {
    if (!editedTheme || !selectedPreset) return;

    if (selectedPreset.isCustom) {
      // Update existing custom theme
      krConfirm('Update "' + selectedPreset.name + '" with edited colors?', 'Save Changes').then(function(ok) {
        if (!ok) return;
        var customs = loadCustom();
        if (customs[selectedPreset.idx]) {
          customs[selectedPreset.idx].theme = Object.assign({}, editedTheme);
          saveCustom(customs);
          renderCards();
          showToast('Updated "' + selectedPreset.name + '"');
        }
      });
    } else {
      // Built-in — save as custom copy
      krPrompt('Save as custom theme', 'Theme name', selectedPreset.name + ' Custom').then(function(name) {
        if (!name) return;
        var customs = loadCustom();
        var skinObj = findPresetSkin(selectedPreset.name);
        customs.push({
          name: name,
          desc: selectedPreset.desc || '',
          theme: Object.assign({}, editedTheme),
          skin: skinObj ? JSON.parse(JSON.stringify(skinObj)) : null,
        });
        saveCustom(customs);
        renderCards();
        showToast('Saved "' + name + '"');
      });
    }
  });

  // ─── roundRect helper ──────────────────────────────────────────────
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ─── Note shape helper ────────────────────────────────────────────
  function fillNoteShape(ctx, x, y, w, h, shape) {
    var cx = x + w / 2, cy = y + h / 2;
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
      for (var i = 0; i < 6; i++) {
        var a = Math.PI / 3 * i - Math.PI / 2;
        var px = cx + (w / 2) * Math.cos(a), py = cy + (h / 2) * Math.sin(a);
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
    } else {
      // 'rounded' (default)
      roundRect(ctx, x, y, w, h, 3);
      ctx.fill();
    }
  }

  // ─── Game preview canvas (260x360) ────────────────────────────────
  function drawGamePreview(skin) {
    var ctx = gameCanvas.getContext('2d');
    var W = 260, H = 360;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    var s = applySkin(skin);
    var bg = s.bgColor || '#0e0e1c';
    var colors = s.laneColors || ['#c060ff', '#40c4ff', '#60ff90'];
    var shape = s.noteShape || 'rounded';
    // Per-lane resolved colors for preview
    var pResolved = [];
    for (var ri = 0; ri < 3; ri++) pResolved[ri] = resolveSkinLane(s, ri);

    // Background gradient
    var bgTop = darkenHex(bg, 0.7);
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, bgTop);
    grad.addColorStop(1, bg);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Lane geometry (3 lanes for preview)
    var laneW = 70, gap = 8, totalW = laneW * 3 + gap * 2;
    var lx = (W - totalW) / 2;
    var hitY = 284;
    var keyH = 56;

    // Lane borders
    for (var i = 0; i <= 3; i++) {
      var bx = lx + i * (laneW + gap) - gap / 2;
      if (i === 3) bx = lx + 3 * laneW + 2 * gap + gap / 2;
      ctx.strokeStyle = colors[i % 3] + alphaHex(0.15);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, 26);
      ctx.lineTo(bx, hitY);
      ctx.stroke();
    }

    // Hit line
    ctx.strokeStyle = s.hitLineColor || '#ffffff';
    ctx.lineWidth = s.hitLineWidth || 2;
    ctx.beginPath();
    ctx.moveTo(lx - 4, hitY);
    ctx.lineTo(lx + totalW + 4, hitY);
    ctx.stroke();

    // Shared note rendering helpers
    var noteH = 22;
    var _shineShapes = { rounded: 1, sharp: 1, hexagon: 1 };

    function drawTapNote(np) {
      var nx = lx + np.lane * (laneW + gap) + 5;
      var nw = laneW - 10;
      var R = pResolved[np.lane % 3];
      var col = R ? R.noteColor : colors[np.lane % colors.length];

      // Glow
      if (s.noteGlow > 0) {
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = s.noteGlow * 0.5;
        ctx.fillStyle = col;
        fillNoteShape(ctx, nx, np.y, nw, noteH, shape);
        ctx.restore();
      }

      // Note body
      var noteGrad = ctx.createLinearGradient(nx, np.y, nx, np.y + noteH);
      noteGrad.addColorStop(0, col);
      noteGrad.addColorStop(1, withAlpha(col, 'bb'));
      ctx.fillStyle = noteGrad;
      fillNoteShape(ctx, nx, np.y, nw, noteH, shape);

      // Shine — thin bar across top (matches game.js)
      var shineA = s.noteShine !== undefined ? s.noteShine : 0.30;
      if (shineA > 0 && _shineShapes[shape]) {
        ctx.fillStyle = 'rgba(255,255,255,' + shineA + ')';
        if (shape === 'sharp') {
          ctx.fillRect(nx, np.y, nw, 4);
        } else {
          ctx.beginPath();
          ctx.roundRect(nx, np.y, nw, 4, [3, 3, 0, 0]);
          ctx.fill();
        }
      }
    }

    // One hold note per lane (staggered)
    var holdBodyW = s.holdBodyWidth !== undefined ? s.holdBodyWidth : 0.44;
    var holdNotes = [
      { lane: 0, headY: 190, tailY: 105 },
      { lane: 1, headY: 220, tailY: 135 },
      { lane: 2, headY: 165, tailY: 80 },
    ];

    var hh = noteH + 6; // hold head height (matches game.js NOTE_H + 6)
    var tcStyle = s.tailCapStyle || 'rounded';
    var tcwMul = s.tailCapWidth !== undefined ? s.tailCapWidth : 1.0;
    var tchMul = s.tailCapHeight !== undefined ? s.tailCapHeight : 1.0;
    var hbwSkin = s.holdBorderWidth !== undefined ? s.holdBorderWidth : 1;

    holdNotes.forEach(function(hn) {
      var R = pResolved[hn.lane % 3];
      var col = R ? R.holdColor : colors[hn.lane % colors.length];
      var bw = Math.min(Math.floor(laneW * holdBodyW), laneW - 4);
      var bx = lx + hn.lane * (laneW + gap) + Math.floor((laneW - bw) / 2);
      var bodyTop = hn.headY - hh / 2; // body ends at head midpoint (matches game.js)
      var bodyLen = Math.max(0, bodyTop - hn.tailY);

      // Hold body
      ctx.fillStyle = withAlpha(col, '60');
      ctx.fillRect(bx, hn.tailY, bw, bodyLen);
      if (s.holdStripes !== false) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx, hn.tailY, bw, bodyLen);
        ctx.clip();
        ctx.strokeStyle = withAlpha(col, '55');
        ctx.lineWidth = 2;
        for (var sy = hn.tailY - bw; sy < hn.tailY + bodyLen; sy += 8) {
          ctx.beginPath();
          ctx.moveTo(bx, sy);
          ctx.lineTo(bx + bw, sy + bw);
          ctx.stroke();
        }
        ctx.restore();
      }
      // Hold body border
      if (hbwSkin > 0) {
        ctx.strokeStyle = withAlpha(col, '77');
        ctx.lineWidth = hbwSkin;
        ctx.strokeRect(bx + 0.5, hn.tailY + 0.5, bw - 1, bodyLen - 1);
      }
      ctx.globalAlpha = 1;

      // Tail endcap — outer (white glow) + inner (colored), respects tailCapStyle
      var tcOuterW = (bw + 4) * tcwMul, tcOuterH = 12 * tchMul;
      var tcInnerW = bw * tcwMul, tcInnerH = 8 * tchMul;
      var tcCx = bx + bw / 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = col;
      ctx.fillStyle = '#ffffff';
      if (tcStyle === 'flat') {
        ctx.fillRect(tcCx - tcOuterW / 2, hn.tailY - tcOuterH / 2, tcOuterW, tcOuterH);
      } else if (tcStyle === 'pointed') {
        ctx.beginPath();
        ctx.moveTo(tcCx - tcOuterW / 2, hn.tailY - tcOuterH / 2);
        ctx.lineTo(tcCx + tcOuterW / 2, hn.tailY - tcOuterH / 2);
        ctx.lineTo(tcCx, hn.tailY + tcOuterH / 2);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.roundRect(tcCx - tcOuterW / 2, hn.tailY - tcOuterH / 2, tcOuterW, tcOuterH, tcOuterH / 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = col;
      if (tcStyle === 'flat') {
        ctx.fillRect(tcCx - tcInnerW / 2, hn.tailY - tcInnerH / 2, tcInnerW, tcInnerH);
      } else if (tcStyle === 'pointed') {
        ctx.beginPath();
        ctx.moveTo(tcCx - tcInnerW / 2, hn.tailY - tcInnerH / 2);
        ctx.lineTo(tcCx + tcInnerW / 2, hn.tailY - tcInnerH / 2);
        ctx.lineTo(tcCx, hn.tailY + tcInnerH / 2);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.roundRect(tcCx - tcInnerW / 2, hn.tailY - tcInnerH / 2, tcInnerW, tcInnerH, tcInnerH / 2);
        ctx.fill();
      }
    });

    // Hold heads (drawn after all bodies so they render on top)
    holdNotes.forEach(function(hn) {
      var R = pResolved[hn.lane % 3];
      var col = R ? R.holdColor : colors[hn.lane % colors.length];
      var nx = lx + hn.lane * (laneW + gap) + 5;
      var nw = laneW - 10;

      if (s.noteGlow > 0) {
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = s.noteGlow * 0.5;
        ctx.fillStyle = col;
        fillNoteShape(ctx, nx, hn.headY - hh, nw, hh, shape);
        ctx.restore();
      }
      var hGrad = ctx.createLinearGradient(nx, hn.headY - hh, nx, hn.headY);
      hGrad.addColorStop(0, '#ffffff');
      hGrad.addColorStop(0.3, col);
      hGrad.addColorStop(1, withAlpha(col, 'cc'));
      ctx.fillStyle = hGrad;
      fillNoteShape(ctx, nx, hn.headY - hh, nw, hh, shape);

      // Grip lines on head
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      for (var g = 0; g < 3; g++) {
        var gy = hn.headY - 5 - g * 5;
        ctx.beginPath();
        ctx.moveTo(nx + 6, gy);
        ctx.lineTo(nx + nw - 6, gy);
        ctx.stroke();
      }

      // Hold head shine
      var holdShineA = s.noteShine !== undefined ? s.noteShine : 0.30;
      if (holdShineA > 0 && _shineShapes[shape]) {
        ctx.fillStyle = 'rgba(255,255,255,' + holdShineA + ')';
        if (shape === 'sharp') {
          ctx.fillRect(nx, hn.headY - hh, nw, 4);
        } else {
          ctx.beginPath();
          ctx.roundRect(nx, hn.headY - hh, nw, 4, [3, 3, 0, 0]);
          ctx.fill();
        }
      }
    });

    // One tap note per lane — below hold heads, staggered
    var tapNotes = [
      { lane: 0, y: 240 },
      { lane: 1, y: 55 },
      { lane: 2, y: 250 },
    ];
    tapNotes.forEach(drawTapNote);

    // Key boxes
    for (var k = 0; k < 3; k++) {
      var kx = lx + k * (laneW + gap);
      ctx.fillStyle = s.keyBoxColor || '#0c0c18';
      roundRect(ctx, kx, hitY + 4, laneW, keyH, 3);
      ctx.fill();
      ctx.strokeStyle = colors[k % colors.length] + alphaHex(0.3);
      ctx.lineWidth = 1;
      roundRect(ctx, kx, hitY + 4, laneW, keyH, 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ─── UI preview canvas (260x180) ──────────────────────────────────
  function drawUIPreview(theme) {
    var ctx = uiCanvas.getContext('2d');
    var W = 260, H = 180;
    ctx.clearRect(0, 0, W, H);

    var bg     = theme['--bg']      || '#0a0a14';
    var bg2    = theme['--bg2']     || '#12121e';
    var bg3    = theme['--bg3']     || '#1a1a2e';
    var border = theme['--border']  || '#2a2a4a';
    var text   = theme['--text']    || '#e0e0f0';
    var dim    = theme['--text-dim']|| '#9898c0';
    var accent = theme['--accent']  || '#c060ff';
    var cyan   = theme['--cyan']    || '#40c4ff';

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Title bar
    ctx.fillStyle = bg2;
    roundRect(ctx, 0, 0, W, 34, 0);
    ctx.fill();
    ctx.fillStyle = text;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('KEYRHYTHM', W / 2, 23);

    // Separator
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 34);
    ctx.lineTo(W, 34);
    ctx.stroke();

    // Two fake buttons
    var btnY = 48, btnH = 26, btnW = 100, gap = 16;
    var bx1 = (W - btnW * 2 - gap) / 2;
    var bx2 = bx1 + btnW + gap;

    // PLAY button (accent-filled)
    ctx.fillStyle = withAlpha(accent, '20');
    roundRect(ctx, bx1, btnY, btnW, btnH, 3);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx1, btnY, btnW, btnH, 3);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PLAY', bx1 + btnW / 2, btnY + 17);

    // CREATE button
    ctx.strokeStyle = cyan;
    roundRect(ctx, bx2, btnY, btnW, btnH, 3);
    ctx.stroke();
    ctx.fillStyle = cyan;
    ctx.fillText('CREATE', bx2 + btnW / 2, btnY + 17);

    // Two fake song list items
    var itemY = 92;
    for (var i = 0; i < 2; i++) {
      var iy = itemY + i * 38;
      ctx.fillStyle = bg2;
      roundRect(ctx, 12, iy, W - 24, 30, 3);
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      roundRect(ctx, 12, iy, W - 24, 30, 3);
      ctx.stroke();

      // Song title text
      ctx.fillStyle = text;
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(i === 0 ? 'Song Title' : 'Another Song', 22, iy + 19);

      // Dim info
      ctx.fillStyle = dim;
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(i === 0 ? '3:24' : '2:10', W - 22, iy + 19);
    }
  }

  // ─── Card builder ──────────────────────────────────────────────────
  function makeCard(preset, isCustom, idx) {
    var theme = preset.theme;
    var skinObj = isCustom ? preset.skin : findPresetSkin(preset.name);
    var skin = applySkin(skinObj);
    var currentName = (getUILayout() || {}).name || '';

    var card = document.createElement('div');
    card.className = 'tb-card';
    if (preset.name === currentName) card.classList.add('active');

    // Card background + border color from theme
    card.style.backgroundColor = theme['--bg2'] || '#12121e';
    card.style.borderColor = theme['--accent'] || '#c060ff';
    card.style.color = theme['--text'] || '#e0e0f0';

    // Swatches area
    var swatchArea = document.createElement('div');
    swatchArea.className = 'tb-card-swatches';
    swatchArea.style.backgroundColor = theme['--bg'] || '#0a0a14';

    SWATCH_VARS.forEach(function(v) {
      var dot = document.createElement('div');
      dot.className = 'tb-swatch';
      dot.style.backgroundColor = theme[v] || '#888';
      swatchArea.appendChild(dot);
    });

    // Also show first 3 lane colors as swatches
    var laneColors = skin.laneColors || [];
    for (var li = 0; li < Math.min(3, laneColors.length); li++) {
      var ldot = document.createElement('div');
      ldot.className = 'tb-swatch';
      ldot.style.backgroundColor = laneColors[li];
      ldot.style.borderColor = 'rgba(255,255,255,0.2)';
      swatchArea.appendChild(ldot);
    }

    card.appendChild(swatchArea);

    // Accent bar
    var bar = document.createElement('div');
    bar.className = 'tb-card-bar';
    bar.style.backgroundColor = theme['--accent'] || '#c060ff';
    card.appendChild(bar);

    // Info area
    var info = document.createElement('div');
    info.className = 'tb-card-info';
    info.style.backgroundColor = theme['--bg2'] || '#12121e';

    var nameEl = document.createElement('div');
    nameEl.className = 'tb-card-name';
    nameEl.textContent = preset.name;
    nameEl.style.color = theme['--text'] || '#e0e0f0';
    info.appendChild(nameEl);

    var descEl = document.createElement('div');
    descEl.className = 'tb-card-desc';
    descEl.textContent = preset.desc || '';
    descEl.style.color = theme['--text-dim'] || '#9898c0';
    info.appendChild(descEl);

    card.appendChild(info);

    // Action buttons
    if (isCustom) {
      var actions = document.createElement('div');
      actions.className = 'tb-card-actions';

      var btnDel = document.createElement('button');
      btnDel.className = 'tb-card-action delete';
      btnDel.textContent = '\u2715';
      btnDel.title = 'Delete';
      btnDel.addEventListener('click', function(e) {
        e.stopPropagation();
        krConfirm('Delete custom theme "' + preset.name + '"?', 'Delete Theme').then(function(ok) {
          if (!ok) return;
          var customs = loadCustom();
          customs.splice(idx, 1);
          saveCustom(customs);
          renderCards();
        });
      });
      actions.appendChild(btnDel);

      var btnEdit = document.createElement('button');
      btnEdit.className = 'tb-card-action';
      btnEdit.textContent = '\u270E';
      btnEdit.title = 'Rename';
      btnEdit.addEventListener('click', function(e) {
        e.stopPropagation();
        krPrompt('Rename theme', 'New name', preset.name).then(function(newName) {
          if (!newName || newName === preset.name) return;
          var customs = loadCustom();
          customs[idx].name = newName;
          saveCustom(customs);
          renderCards();
        });
      });
      actions.appendChild(btnEdit);

      card.appendChild(actions);
    } else {
      // Duplicate button for built-in
      var dupWrap = document.createElement('div');
      dupWrap.className = 'tb-card-dup';

      var btnDup = document.createElement('button');
      btnDup.className = 'tb-card-action';
      btnDup.textContent = '\u2398';
      btnDup.title = 'Duplicate as custom';
      btnDup.addEventListener('click', function(e) {
        e.stopPropagation();
        krPrompt('Save as custom theme', 'Theme name', preset.name + ' Copy').then(function(name) {
          if (!name) return;
          var customs = loadCustom();
          customs.push({
            name: name,
            desc: preset.desc || '',
            theme: Object.assign({}, preset.theme),
            skin: skinObj ? JSON.parse(JSON.stringify(skinObj)) : null,
          });
          saveCustom(customs);
          renderCards();
          showToast('Saved "' + name + '"');
        });
      });
      dupWrap.appendChild(btnDup);
      card.appendChild(dupWrap);
    }

    // Click → select + preview
    card.addEventListener('click', function() {
      selectCard(card, preset, isCustom, idx);
    });

    return card;
  }

  // ─── Select + live preview ─────────────────────────────────────────
  function selectCard(card, preset, isCustom, idx) {
    // Deselect previous
    if (selectedCard) selectedCard.classList.remove('selected');
    selectedCard = card;
    card.classList.add('selected');

    selectedPreset = { name: preset.name, desc: preset.desc, theme: preset.theme, skin: preset.skin || null, isCustom: isCustom, idx: idx };

    // Apply CSS vars to documentElement for live preview
    var root = document.documentElement.style;
    CSS_VARS.forEach(function(v) {
      if (v === '--font') return; // don't change font during preview
      var val = preset.theme[v];
      if (val) root.setProperty(v, val);
    });
    updateSelectArrows(preset.theme);

    // Draw preview canvases
    var skinObj = isCustom ? preset.skin : findPresetSkin(preset.name);
    drawGamePreview(skinObj);
    drawUIPreview(preset.theme);

    // Enable action buttons
    btnApply.disabled = false;
    btnCancel.disabled = false;

    // Setup color editor
    setupColorEditor(preset.theme);
  }

  // ─── Cancel preview → revert ──────────────────────────────────────
  function cancelPreview() {
    // Revert CSS vars
    var root = document.documentElement.style;
    CSS_VARS.forEach(function(v) {
      if (savedTheme[v]) root.setProperty(v, savedTheme[v]);
      else root.removeProperty(v);
    });
    updateSelectArrows(savedTheme);

    // Deselect
    if (selectedCard) selectedCard.classList.remove('selected');
    selectedCard = null;
    selectedPreset = null;

    // Disable buttons
    btnApply.disabled = true;
    btnCancel.disabled = true;

    // Clear canvases
    gameCanvas.getContext('2d').clearRect(0, 0, 260, 360);
    uiCanvas.getContext('2d').clearRect(0, 0, 260, 180);

    // Hide color editor
    hideColorEditor();
  }

  // ─── Hue helper for color sorting ─────────────────────────────────
  function getHue(preset) {
    var hex = (preset.theme['--accent'] || '#888888').replace('#', '');
    var r = parseInt(hex.substr(0,2),16)/255;
    var g = parseInt(hex.substr(2,2),16)/255;
    var b = parseInt(hex.substr(4,2),16)/255;
    var max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
    if (d === 0) return 0;
    var h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }

  // ─── Render all cards ──────────────────────────────────────────────
  function renderCards() {
    cancelPreview();
    builtinGrid.innerHTML = '';
    customGrid.innerHTML = '';

    var query = (searchInput.value || '').trim().toLowerCase();
    var sortMode = sortSelect.value || 'default';

    // Filter built-in themes
    var filtered = BUILTIN.filter(function(p) {
      if (!query) return true;
      return p.name.toLowerCase().indexOf(query) !== -1 ||
             (p.desc || '').toLowerCase().indexOf(query) !== -1;
    });

    // Sort
    if (sortMode === 'alpha') {
      filtered.sort(function(a, b) { return a.name.localeCompare(b.name); });
    } else if (sortMode === 'color') {
      filtered.sort(function(a, b) { return getHue(a) - getHue(b); });
    }

    filtered.forEach(function(preset) {
      builtinGrid.appendChild(makeCard(preset, false));
    });

    // Custom
    var customs = loadCustom();
    if (customs.length === 0) {
      customEmpty.style.display = '';
      customGrid.style.display = 'none';
    } else {
      customEmpty.style.display = 'none';
      customGrid.style.display = '';
      customs.forEach(function(preset, i) {
        customGrid.appendChild(makeCard(preset, true, i));
      });
    }
  }

  // ─── Apply button ──────────────────────────────────────────────────
  btnApply.addEventListener('click', async function() {
    if (!selectedPreset) return;
    var p = selectedPreset;

    var ok = await krConfirm(
      'Apply the "' + p.name + '" theme?\n\nThis will override your current UI theme and game skin. Any custom modifications will be lost.',
      'Apply Theme'
    );
    if (!ok) return;

    // Save theme — use edited colors if user modified them, otherwise original
    var themeToSave = editedTheme ? Object.assign({}, editedTheme) : p.theme;
    saveThemeOverrides(themeToSave);
    var layout = getUILayout();
    layout.name = p.name;
    saveUILayout(layout);

    // Apply matching skin
    var skinObj;
    if (p.isCustom) {
      skinObj = p.skin ? JSON.parse(JSON.stringify(p.skin)) : null;
    } else {
      skinObj = findPresetSkin(p.name);
      if (skinObj) skinObj = JSON.parse(JSON.stringify(skinObj));
    }
    saveSkin(skinObj);

    location.reload();
  });

  // ─── Cancel button ─────────────────────────────────────────────────
  btnCancel.addEventListener('click', function() {
    cancelPreview();
  });

  // ─── Save Current ──────────────────────────────────────────────────
  btnSaveCurrent.addEventListener('click', async function() {
    var name = await krPrompt('Theme name', 'My Theme');
    if (!name) return;
    var desc = await krPrompt('Short description (optional)', 'e.g. Warm sunset vibes');

    // Capture current theme overrides + skin
    var theme = getThemeOverrides();
    // If no overrides saved, read from computed
    if (!theme || Object.keys(theme).length === 0) {
      theme = {};
      var cs = getComputedStyle(document.documentElement);
      CSS_VARS.forEach(function(v) {
        if (v === '--font') return;
        var val = cs.getPropertyValue(v).trim();
        if (val.indexOf('linear-gradient') === -1) {
          var m = val.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
          if (m) val = '#' + [m[1], m[2], m[3]].map(function(c) { return (+c).toString(16).padStart(2, '0'); }).join('');
        }
        theme[v] = val;
      });
    }

    var skinObj = getSkin();

    var customs = loadCustom();
    customs.push({
      name: name,
      desc: desc || '',
      theme: Object.assign({}, theme),
      skin: skinObj ? JSON.parse(JSON.stringify(skinObj)) : null,
    });
    saveCustom(customs);
    renderCards();
    showToast('Saved "' + name + '"');
  });

  // ─── Editor links ─────────────────────────────────────────────────
  document.getElementById('btnOpenSkinEd').addEventListener('click', function() {
    window.location.href = 'skin-editor.html';
  });
  // ─── Back button ───────────────────────────────────────────────────
  btnBack.addEventListener('click', function() {
    // Revert any preview
    var root = document.documentElement.style;
    CSS_VARS.forEach(function(v) {
      if (savedTheme[v]) root.setProperty(v, savedTheme[v]);
      else root.removeProperty(v);
    });
    window.location.href = 'index.html';
  });

  // ─── Search / Sort listeners ─────────────────────────────────────
  searchInput.addEventListener('input', renderCards);
  sortSelect.addEventListener('change', renderCards);

  // ─── Init ──────────────────────────────────────────────────────────
  renderCards();

  // Draw default previews with current skin/theme
  var currentSkin = getSkin();
  drawGamePreview(currentSkin);
  var currentTheme = getThemeOverrides();
  if (!currentTheme || Object.keys(currentTheme).length === 0) {
    currentTheme = savedTheme;
  }
  drawUIPreview(currentTheme);

})();
