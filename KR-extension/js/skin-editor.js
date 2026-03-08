// Skin Editor — animated preview + controls
const PREVIEW_W  = 340;
const PREVIEW_H  = 550;
const P_HIT_Y    = 400;
const P_LANE_TOP = 30;
const P_NOTE_H   = 20;
const P_KEYS_H   = 65;

const pCanvas = document.getElementById('previewCanvas');
const pCtx    = pCanvas.getContext('2d');

// Start from saved skin or default
let previewSkin = applySkin(getSkin());
let previewLanes = 3;

// ── Autosave ─────────────────────────────────────────────────────────────────
let _skinModified = false;
let _skinAutosaveDebounce = null;

function _showSkinAutoSaved() {
  const btn = document.getElementById('btnSaveSkin');
  if (btn) { const orig = btn.textContent; btn.textContent = '✓ Auto-saved'; btn.disabled = true; setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500); }
}

function skinChanged() {
  _skinModified = true;
  if (!getSettings().autosave) return;
  clearTimeout(_skinAutosaveDebounce);
  _skinAutosaveDebounce = setTimeout(() => {
    saveSkin({ ...previewSkin });
    _skinModified = false;
    _showSkinAutoSaved();
  }, 800);
}

setInterval(() => {
  if (_skinModified && getSettings().autosave) {
    saveSkin({ ...previewSkin });
    _skinModified = false;
    _showSkinAutoSaved();
  }
}, 30000);
let animating = true;
let animTime  = 0;
let lastFrame = 0;
let animId    = null;

// ── Preset dropdown ──────────────────────────────────────────────────────────
const presetSelect = document.getElementById('presetSelect');
PRESET_SKINS.forEach((p, i) => {
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = p.name;
  presetSelect.appendChild(opt);
});

document.getElementById('btnLoadPreset').addEventListener('click', () => {
  const idx = parseInt(presetSelect.value);
  const preset = PRESET_SKINS[idx];
  if (!preset) return;
  previewSkin = applySkin({ ...preset });
  populateControls();
  drawPreview(); skinChanged();
});

// ── Back button ──────────────────────────────────────────────────────────────
document.getElementById('btnBack').addEventListener('click', () => {
  window.location.href = 'index.html';
});

// ── Tab switching ────────────────────────────────────────────────────────────
document.querySelector('.skin-tab-bar').addEventListener('click', e => {
  const btn = e.target.closest('.skin-tab-btn');
  if (!btn) return;
  document.querySelectorAll('.skin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.skin-tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.querySelector(`.skin-tab-panel[data-tab="${btn.dataset.tab}"]`).classList.add('active');
});

// ── Store all picker instances for cleanup/update ────────────────────────────
const colorPickers = {};

// ── Build lane color grid ────────────────────────────────────────────────────
const laneColorGrid = document.getElementById('laneColorGrid');
const lanePickers   = [];

for (let i = 0; i < 7; i++) {
  const cell  = document.createElement('div');
  cell.className = 'lane-color-cell';
  const container = document.createElement('div');
  container.className = 'kr-picker-container';
  const picker = initGradientPicker(container, {
    color: previewSkin.laneColors[i] || '#ffffff',
    onChange: (val) => {
      previewSkin.laneColors[i] = val;
      drawPreview(); skinChanged();
    },
  });
  const lbl   = document.createElement('span');
  lbl.textContent = `L${i + 1}`;
  cell.appendChild(container); cell.appendChild(lbl);
  laneColorGrid.appendChild(cell);
  lanePickers.push(picker);
}

// ── Build miss note color grid ───────────────────────────────────────────────
const missNoteColorGrid = document.getElementById('missNoteColorGrid');
const missNotePickers   = [];

for (let i = 0; i < 7; i++) {
  const cell  = document.createElement('div');
  cell.className = 'lane-color-cell';
  const container = document.createElement('div');
  container.className = 'kr-picker-container';
  const picker = initColorPicker(container, {
    color: previewSkin.missNoteColors[i] || '#666666',
    onChange: (hex) => {
      previewSkin.missNoteColors[i] = hex;
      drawPreview(); skinChanged();
    },
  });
  const lbl   = document.createElement('span');
  lbl.textContent = `L${i + 1}`;
  cell.appendChild(container); cell.appendChild(lbl);
  missNoteColorGrid.appendChild(cell);
  missNotePickers.push(picker);
}

const noteBorderWidthInput = document.getElementById('noteBorderWidth');
const noteBorderWidthVal   = document.getElementById('noteBorderWidthVal');

noteBorderWidthInput.addEventListener('input', () => {
  previewSkin.noteBorderWidth = parseFloat(noteBorderWidthInput.value) || 0;
  noteBorderWidthVal.textContent = String(previewSkin.noteBorderWidth);
  drawPreview(); skinChanged();
});

// Helper: build a row of 7 Pickr pickers for a per-lane color array
function buildLanePickrGrid(gridId, arrayKey, getFallback) {
  const grid = document.getElementById(gridId);
  if (!grid) return [];
  const pickers = [];
  for (let i = 0; i < 7; i++) {
    const cell = document.createElement('div');
    cell.className = 'lane-color-cell';
    const container = document.createElement('div');
    container.className = 'kr-picker-container';
    const stored = previewSkin[arrayKey] && previewSkin[arrayKey][i];
    const effectiveColor = stored || getFallback(i);
    const picker = initColorPicker(container, {
      color: effectiveColor,
      opacity: true,
      onChange: (val) => {
        if (!previewSkin[arrayKey]) previewSkin[arrayKey] = [null,null,null,null,null,null,null];
        previewSkin[arrayKey][i] = val;
        drawPreview(); skinChanged();
      },
    });
    const lbl = document.createElement('span');
    lbl.textContent = 'L' + (i + 1);
    cell.appendChild(container); cell.appendChild(lbl);
    grid.appendChild(cell);
    pickers.push(picker);
  }
  return pickers;
}

// Main note/hold grids
const noteColorPickers = buildLanePickrGrid('noteColorGrid', 'noteColors',
  (i) => previewSkin.laneColors[i] || '#ffffff');

const holdColorPickers = buildLanePickrGrid('holdColorGrid', 'holdColors',
  (i) => (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');

// Advanced note grids
const noteBorderColorPickers = buildLanePickrGrid('noteBorderColorGrid', 'noteBorderColors',
  (i) => (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
const noteShineColorPickers = buildLanePickrGrid('noteShineColorGrid', 'noteShineColors',
  () => '#ffffff');
const noteGlowColorPickers = buildLanePickrGrid('noteGlowColorGrid', 'noteGlowColors',
  (i) => (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
const holdBodyColorPickers = buildLanePickrGrid('holdBodyColorGrid', 'holdBodyColors',
  (i) => (previewSkin.holdColors && previewSkin.holdColors[i]) || (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
const holdBorderColorPickers = buildLanePickrGrid('holdBorderColorGrid', 'holdBorderColors',
  (i) => (previewSkin.holdColors && previewSkin.holdColors[i]) || (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
const holdStripeColorPickers = buildLanePickrGrid('holdStripeColorGrid', 'holdStripeColors',
  (i) => (previewSkin.holdColors && previewSkin.holdColors[i]) || (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
const holdTailCapColorPickers = buildLanePickrGrid('holdTailCapColorGrid', 'holdTailCapColors',
  (i) => (previewSkin.holdColors && previewSkin.holdColors[i]) || (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
const holdTickColorPickers = buildLanePickrGrid('holdTickColorGrid', 'holdTickColors',
  () => '#ffffff');

// Hit zone grids
const hitLineColorPickers = buildLanePickrGrid('hitLineColorGrid', 'hitLineColors',
  (i) => previewSkin.laneColors[i] || '#ffffff');
const keyBoxBgColorPickers = buildLanePickrGrid('keyBoxBgColorGrid', 'keyBoxBgColors',
  () => previewSkin.keyBoxColor || '#0c0c18');

// Advanced hit zone grids
const hitGlowColorPickers = buildLanePickrGrid('hitGlowColorGrid', 'hitGlowColors',
  (i) => previewSkin.laneColors[i] || '#ffffff');
const hitFlashColorPickers = buildLanePickrGrid('hitFlashColorGrid', 'hitFlashColors',
  (i) => previewSkin.laneColors[i] || '#ffffff');
const hitBurstColorPickers = buildLanePickrGrid('hitBurstColorGrid', 'hitBurstColors',
  (i) => previewSkin.laneColors[i] || '#ffffff');
const hitRingColorPickers = buildLanePickrGrid('hitRingColorGrid', 'hitRingColors',
  (i) => previewSkin.laneColors[i] || '#ffffff');
const keyBoxBorderColorPickers = buildLanePickrGrid('keyBoxBorderColorGrid', 'keyBoxBorderColors',
  (i) => previewSkin.laneColors[i] || '#ffffff');
const keyBoxTextColorPickers = buildLanePickrGrid('keyBoxTextColorGrid', 'keyBoxTextColors',
  (i) => previewSkin.laneColors[i] || '#ffffff');
const laneBorderColorPickers = buildLanePickrGrid('laneBorderColorGrid', 'laneBorderColors',
  (i) => previewSkin.laneColors[i] || '#ffffff');
const lanePressColorPickers = buildLanePickrGrid('lanePressColorGrid', 'lanePressColors',
  (i) => previewSkin.laneColors[i] || '#ffffff');


const missNoteModeSelect     = document.getElementById('missNoteMode');
const missNoteDarkenGroup    = document.getElementById('missNoteDarkenGroup');
const missNoteCustomGroup    = document.getElementById('missNoteCustomGroup');
const missNoteFlatGroup      = document.getElementById('missNoteFlatGroup');
const missNoteDarkenInput    = document.getElementById('missNoteDarken');
const missNoteDarkenVal      = document.getElementById('missNoteDarkenVal');
const missNoteFlatColorHex   = document.getElementById('missNoteFlatColorHex');

function updateMissNoteVisibility() {
  const mode = missNoteModeSelect.value;
  missNoteDarkenGroup.style.display = mode === 'darken' ? '' : 'none';
  missNoteCustomGroup.style.display = mode === 'custom' ? '' : 'none';
  missNoteFlatGroup.style.display   = mode === 'flat'   ? '' : 'none';
}

missNoteModeSelect.addEventListener('change', () => {
  previewSkin.missNoteMode = missNoteModeSelect.value;
  updateMissNoteVisibility();
  drawPreview(); skinChanged();
});

missNoteDarkenInput.addEventListener('input', () => {
  previewSkin.missNoteDarken = parseFloat(missNoteDarkenInput.value);
  missNoteDarkenVal.textContent = Math.round(previewSkin.missNoteDarken * 100) + '%';
  drawPreview(); skinChanged();
});

colorPickers.missNoteFlatColor = initColorPicker(document.getElementById('missNoteFlatColor'), {
  color: previewSkin.missNoteFlatColor || '#666666',
  onChange: (hex) => {
    previewSkin.missNoteFlatColor = hex;
    missNoteFlatColorHex.textContent = hex;
    drawPreview(); skinChanged();
  },
});

// ── Controls ─────────────────────────────────────────────────────────────────
const skinNameInput     = document.getElementById('skinName');
const bgColorHex        = document.getElementById('bgColorHex');
const hitLineColorHex   = document.getElementById('hitLineColorHex');
const keyBoxColorHex    = document.getElementById('keyBoxColorHex');
const comboColorHex     = document.getElementById('comboColorHex');
const glowInput         = document.getElementById('noteGlow');
const glowVal           = document.getElementById('glowVal');
const hitLineWidthInput = document.getElementById('hitLineWidth');
const hitLineWidthVal   = document.getElementById('hitLineWidthVal');
const noteHeightInput   = document.getElementById('noteHeight');
const noteHeightVal     = document.getElementById('noteHeightVal');
const holdWidthInput    = document.getElementById('holdBodyWidth');
const holdWidthVal      = document.getElementById('holdWidthVal');
const tailCapWidthInput  = document.getElementById('tailCapWidth');
const tailCapWidthVal    = document.getElementById('tailCapWidthVal');
const tailCapHeightInput = document.getElementById('tailCapHeight');
const tailCapHeightVal   = document.getElementById('tailCapHeightVal');
const previewLanesSelect = document.getElementById('previewLanes');
const animateCheck       = document.getElementById('previewAnimate');
const skinHitsoundSel    = document.getElementById('skinHitsound');
const skinSliderTickSel  = document.getElementById('skinSliderTick');
const skinSliderEndSel   = document.getElementById('skinSliderEnd');
const holdStripesCheck   = document.getElementById('holdStripes');
const noteShineInput      = document.getElementById('noteShine');
const noteShineVal        = document.getElementById('noteShineVal');
const holdTickMarksCheck  = document.getElementById('holdTickMarks');
const holdBorderWidthInput = document.getElementById('holdBorderWidth');
const holdBorderWidthVal  = document.getElementById('holdBorderWidthVal');
const tailCapStyleSelect  = document.getElementById('tailCapStyle');
const noteIconScaleInput   = document.getElementById('noteIconScale');
const noteIconScaleVal     = document.getElementById('noteIconScaleVal');
const noteIconOffsetYInput = document.getElementById('noteIconOffsetY');
const noteIconOffsetYVal   = document.getElementById('noteIconOffsetYVal');
const keyBoxModeSelect   = document.getElementById('keyBoxMode');
const perfectColorHex   = document.getElementById('perfectColorHex');
const goodColorHex      = document.getElementById('goodColorHex');
const okColorHex        = document.getElementById('okColorHex');
const missColorHex      = document.getElementById('missColorHex');
const earlyColorHex     = document.getElementById('earlyColorHex');
const lateColorHex      = document.getElementById('lateColorHex');
const holdJudgeColorHex = document.getElementById('holdJudgeColorHex');
const breakColorHex     = document.getElementById('breakColorHex');
const holdTextInput     = document.getElementById('holdText');
const breakTextInput    = document.getElementById('breakText');
const scoreColorHex     = document.getElementById('scoreColorHex');
const judgeSizeInput     = document.getElementById('judgeSizeMultiplier');
const judgeSizeVal       = document.getElementById('judgeSizeVal');
const hpHighColorHex     = document.getElementById('hpHighColorHex');
const hpMidColorHex      = document.getElementById('hpMidColorHex');
const hpLowColorHex      = document.getElementById('hpLowColorHex');
const hpBgColorHex       = document.getElementById('hpBgColorHex');
const hpBorderColorHex   = document.getElementById('hpBorderColorHex');
const missFlashColorHex     = document.getElementById('missFlashColorHex');
const laneGradientModeSelect = document.getElementById('laneGradientMode');
const hitZoneStyleSelect    = document.getElementById('hitZoneStyle');
const songInfoColorHex      = document.getElementById('songInfoColorHex');
const hitBurstEnabledCheck   = document.getElementById('hitBurstEnabled');
const hitRingEnabledCheck    = document.getElementById('hitRingEnabled');
const hitBurstIntensityInput = document.getElementById('hitBurstIntensity');
const hitBurstIntensityVal   = document.getElementById('hitBurstIntensityVal');
const hitFlashIntensityInput = document.getElementById('hitFlashIntensity');
const hitFlashIntensityVal   = document.getElementById('hitFlashIntensityVal');
const noteApproachGlowInput  = document.getElementById('noteApproachGlow');
const noteApproachGlowVal    = document.getElementById('noteApproachGlowVal');
const fcColorHex       = document.getElementById('fcColorHex');
const pcSaturationInput = document.getElementById('pcSaturation');
const pcSaturationVal  = document.getElementById('pcSaturationVal');
const fontFamilySelect = document.getElementById('fontFamily');
const hpBarHeightInput      = document.getElementById('hpBarHeight');
const hpBarHeightVal        = document.getElementById('hpBarHeightVal');
const hpBarWidthInput       = document.getElementById('hpBarWidth');
const hpBarWidthVal         = document.getElementById('hpBarWidthVal');
const progressBarHeightInput = document.getElementById('progressBarHeight');
const progressBarHeightVal   = document.getElementById('progressBarHeightVal');
const perfectTextInput  = document.getElementById('perfectText');
const goodTextInput     = document.getElementById('goodText');
const okTextInput       = document.getElementById('okText');
const missTextInput     = document.getElementById('missText');
const earlyTextInput    = document.getElementById('earlyText');
const lateTextInput     = document.getElementById('lateText');
const showEarlyLateCheck = document.getElementById('showEarlyLate');
const bgImageOpacityInput     = document.getElementById('bgImageOpacity');
const bgImageOpacityVal       = document.getElementById('bgImageOpacityVal');
const bgImageSaturationInput  = document.getElementById('bgImageSaturation');
const bgImageSaturationVal    = document.getElementById('bgImageSaturationVal');
const bgImageBlurInput        = document.getElementById('bgImageBlur');
const bgImageBlurVal          = document.getElementById('bgImageBlurVal');
const liveAccentColorHex   = document.getElementById('liveAccentColorHex');
const liveOpacityInput     = document.getElementById('liveOpacity');
const liveOpacityVal       = document.getElementById('liveOpacityVal');
const liveBorderRadiusInput = document.getElementById('liveBorderRadius');
const liveBorderRadiusVal   = document.getElementById('liveBorderRadiusVal');
const comboEnabledCheck     = document.getElementById('comboEnabled');
const comboTextInput        = document.getElementById('comboText');
const milestoneListEl       = document.getElementById('milestoneList');
const milestonePickers      = [];  // Pickr instances for dynamic milestone rows

// ── Initialize Pickr-based color pickers for static controls ─────────────────
function wireColor(containerId, hexSpan, prop, defaultColor) {
  const container = document.getElementById(containerId);
  const picker = initColorPicker(container, {
    color: defaultColor || '#000000',
    onChange: (hex) => {
      if (hexSpan) hexSpan.textContent = hex;
      previewSkin[prop] = hex;
      drawPreview(); skinChanged();
    },
  });
  colorPickers[prop] = picker;
  return picker;
}

// bgColor picker (with opacity)
(function() {
  const container = document.getElementById('bgColor');
  const picker = initColorPicker(container, {
    color: previewSkin.bgColor || '#0e0e1c',
    opacity: true,
    onChange: (val) => {
      bgColorHex.textContent = val;
      previewSkin.bgColor = val;
      drawPreview(); skinChanged();
    },
  });
  colorPickers.bgColor = picker;
})();
wireColor('hitLineColor',   hitLineColorHex,   'hitLineColor',   previewSkin.hitLineColor || '#ffffff');
wireColor('keyBoxColor',    keyBoxColorHex,    'keyBoxColor',    previewSkin.keyBoxColor || '#0c0c18');
wireColor('comboColor',     comboColorHex,     'comboColor',     previewSkin.comboColor || '#ffffff');
wireColor('perfectColor',   perfectColorHex,   'perfectColor',   previewSkin.perfectColor || '#ffd040');
wireColor('goodColor',      goodColorHex,      'goodColor',      previewSkin.goodColor || '#60ff90');
wireColor('okColor',        okColorHex,        'okColor',        previewSkin.okColor || '#40c4ff');
wireColor('missColor',      missColorHex,      'missColor',      previewSkin.missColor || '#ff4060');
wireColor('earlyColor',     earlyColorHex,     'earlyColor',     previewSkin.earlyColor || '#ffa060');
wireColor('lateColor',      lateColorHex,      'lateColor',      previewSkin.lateColor || '#60a0ff');
wireColor('holdJudgeColor', holdJudgeColorHex, 'holdColor',      previewSkin.holdColor || '#ffd040');
wireColor('breakColor',     breakColorHex,     'breakColor',     previewSkin.breakColor || '#ff4060');
wireColor('scoreColor',     scoreColorHex,     'scoreColor',     previewSkin.scoreColor || '#ffffff');
wireColor('hpHighColor',    hpHighColorHex,    'hpHighColor',    previewSkin.hpHighColor || '#60ff90');
wireColor('hpMidColor',     hpMidColorHex,     'hpMidColor',     previewSkin.hpMidColor || '#ffd040');
wireColor('hpLowColor',     hpLowColorHex,     'hpLowColor',     previewSkin.hpLowColor || '#ff4060');
wireColor('hpBgColor',      hpBgColorHex,      'hpBgColor',      previewSkin.hpBgColor || '#14142a');
wireColor('hpBorderColor',  hpBorderColorHex,  'hpBorderColor',  previewSkin.hpBorderColor || '#303055');
wireColor('missFlashColor', missFlashColorHex, 'missFlashColor', previewSkin.missFlashColor || '#ff3c50');
wireColor('songInfoColor',  songInfoColorHex,  'songInfoColor',  previewSkin.songInfoColor || '#383860');
wireColor('fcColor',        fcColorHex,        'fcColor',        previewSkin.fcColor || '#ffd040');
wireColor('liveAccentColor', liveAccentColorHex, 'liveAccentColor', previewSkin.liveAccentColor || '#c060ff');

// Progress bar color pickers (array of 3)
const progressDefaults = (previewSkin.progressColors || ['#c060ff', '#40c4ff', '#60ff90']);
['progressColor0', 'progressColor1', 'progressColor2'].forEach((id, i) => {
  const container = document.getElementById(id);
  const picker = initGradientPicker(container, {
    color: progressDefaults[i],
    onChange: (val) => {
      if (!previewSkin.progressColors) previewSkin.progressColors = ['#c060ff', '#40c4ff', '#60ff90'];
      previewSkin.progressColors[i] = val;
      drawPreview(); skinChanged();
    },
  });
  colorPickers['progressColor' + i] = picker;
});

// Combo toggle + text
comboEnabledCheck.addEventListener('change', () => {
  previewSkin.comboEnabled = comboEnabledCheck.checked;
  drawPreview(); skinChanged();
});
comboTextInput.addEventListener('input', () => {
  previewSkin.comboText = comboTextInput.value;
  drawPreview(); skinChanged();
});

// Dynamic milestone list
function renderMilestoneList() {
  // Destroy existing Pickr instances
  milestonePickers.forEach(p => p.destroy());
  milestonePickers.length = 0;
  milestoneListEl.innerHTML = '';
  const milestones = previewSkin.milestones || [];
  milestones.forEach((ms, i) => {
    const row = document.createElement('div');
    row.className = 'milestone-row';

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.min = '1';
    numInput.max = '9999';
    numInput.value = ms.combo;
    numInput.title = 'Combo threshold';
    numInput.addEventListener('change', () => {
      ms.combo = Math.max(1, Math.min(9999, parseInt(numInput.value) || 1));
      numInput.value = ms.combo;
      drawPreview(); skinChanged();
    });

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = ms.text || '{n} COMBO!!';
    textInput.maxLength = 30;
    textInput.placeholder = '{n} COMBO!!';
    textInput.title = 'Display text ({n} = combo count)';
    textInput.addEventListener('input', () => {
      ms.text = textInput.value;
      drawPreview(); skinChanged();
    });

    const colorContainer = document.createElement('div');
    colorContainer.className = 'kr-picker-container';
    const picker = initColorPicker(colorContainer, {
      color: ms.color || '#ffd040',
      onChange: (hex) => {
        ms.color = hex;
        drawPreview(); skinChanged();
      },
    });
    milestonePickers.push(picker);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = '\u00d7';
    removeBtn.title = 'Remove milestone';
    removeBtn.addEventListener('click', () => {
      previewSkin.milestones.splice(i, 1);
      renderMilestoneList();
      drawPreview(); skinChanged();
    });

    row.appendChild(numInput);
    row.appendChild(textInput);
    row.appendChild(colorContainer);
    row.appendChild(removeBtn);
    milestoneListEl.appendChild(row);
  });
}

document.getElementById('btnAddMilestone').addEventListener('click', () => {
  if (!previewSkin.milestones) previewSkin.milestones = [];
  if (previewSkin.milestones.length >= 20) return;
  const existing = previewSkin.milestones.map(m => m.combo);
  let next = 50;
  while (existing.includes(next)) next += 50;
  previewSkin.milestones.push({ combo: next, text: '{n} COMBO!!', color: '#ffd040' });
  renderMilestoneList();
  drawPreview(); skinChanged();
});

renderMilestoneList();

populateControls();

function populateControls() {
  skinNameInput.value     = previewSkin.name || 'Custom';

  // Sync Pickr-based color pickers
  function syncPicker(prop, def) {
    const v = previewSkin[prop] || def;
    if (colorPickers[prop]) colorPickers[prop].setColor(v);
  }
  syncPicker('bgColor',        '#0e0e1c');   bgColorHex.textContent = isGradient(previewSkin.bgColor) ? 'gradient' : (previewSkin.bgColor || '#0e0e1c');
  syncPicker('hitLineColor',   '#ffffff');    hitLineColorHex.textContent   = previewSkin.hitLineColor || '#ffffff';
  syncPicker('keyBoxColor',    '#0c0c18');    keyBoxColorHex.textContent    = previewSkin.keyBoxColor || '#0c0c18';
  syncPicker('comboColor',     '#ffffff');    comboColorHex.textContent     = previewSkin.comboColor || '#ffffff';

  glowInput.value         = previewSkin.noteGlow !== undefined ? previewSkin.noteGlow : 12;
  glowVal.textContent     = glowInput.value;
  hitLineWidthInput.value = previewSkin.hitLineWidth !== undefined ? previewSkin.hitLineWidth : 2;
  hitLineWidthVal.textContent = parseFloat(hitLineWidthInput.value).toFixed(1);
  noteHeightInput.value   = previewSkin.noteHeight !== undefined ? previewSkin.noteHeight : 1.0;
  noteHeightVal.textContent = Math.round(parseFloat(noteHeightInput.value) * 100) + '%';
  holdWidthInput.value    = previewSkin.holdBodyWidth !== undefined ? previewSkin.holdBodyWidth : 0.44;
  holdWidthVal.textContent = Math.round(parseFloat(holdWidthInput.value) * 100) + '%';
  tailCapWidthInput.value  = previewSkin.tailCapWidth !== undefined ? previewSkin.tailCapWidth : 1.0;
  tailCapWidthVal.textContent = Math.round(parseFloat(tailCapWidthInput.value) * 100) + '%';
  tailCapHeightInput.value = previewSkin.tailCapHeight !== undefined ? previewSkin.tailCapHeight : 1.0;
  tailCapHeightVal.textContent = Math.round(parseFloat(tailCapHeightInput.value) * 100) + '%';

  // Helper to sync a per-lane picker grid
  function syncGrid(pickers, arrayKey, getFallback) {
    if (!pickers || !pickers.length) return;
    for (let i = 0; i < 7; i++) {
      const stored = previewSkin[arrayKey] && previewSkin[arrayKey][i];
      pickers[i].setColor(stored || getFallback(i));
    }
  }

  // Sync lane/miss grid pickers
  for (let i = 0; i < 7; i++) {
    lanePickers[i].setColor(previewSkin.laneColors[i] || '#ffffff');
    missNotePickers[i].setColor(previewSkin.missNoteColors[i] || '#666666');
  }

  // Sync all per-lane Pickr grids
  syncGrid(noteColorPickers, 'noteColors',
    (i) => previewSkin.laneColors[i] || '#ffffff');
  syncGrid(holdColorPickers, 'holdColors',
    (i) => (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
  syncGrid(noteBorderColorPickers, 'noteBorderColors',
    (i) => (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
  syncGrid(noteShineColorPickers, 'noteShineColors',
    () => '#ffffff');
  syncGrid(noteGlowColorPickers, 'noteGlowColors',
    (i) => (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
  syncGrid(holdBodyColorPickers, 'holdBodyColors',
    (i) => (previewSkin.holdColors && previewSkin.holdColors[i]) || (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
  syncGrid(holdBorderColorPickers, 'holdBorderColors',
    (i) => (previewSkin.holdColors && previewSkin.holdColors[i]) || (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
  syncGrid(holdStripeColorPickers, 'holdStripeColors',
    (i) => (previewSkin.holdColors && previewSkin.holdColors[i]) || (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
  syncGrid(holdTailCapColorPickers, 'holdTailCapColors',
    (i) => (previewSkin.holdColors && previewSkin.holdColors[i]) || (previewSkin.noteColors && previewSkin.noteColors[i]) || previewSkin.laneColors[i] || '#ffffff');
  syncGrid(holdTickColorPickers, 'holdTickColors',
    () => '#ffffff');
  syncGrid(hitLineColorPickers, 'hitLineColors',
    (i) => previewSkin.laneColors[i] || '#ffffff');
  syncGrid(keyBoxBgColorPickers, 'keyBoxBgColors',
    () => previewSkin.keyBoxColor || '#0c0c18');
  syncGrid(hitGlowColorPickers, 'hitGlowColors',
    (i) => previewSkin.laneColors[i] || '#ffffff');
  syncGrid(hitFlashColorPickers, 'hitFlashColors',
    (i) => previewSkin.laneColors[i] || '#ffffff');
  syncGrid(hitBurstColorPickers, 'hitBurstColors',
    (i) => previewSkin.laneColors[i] || '#ffffff');
  syncGrid(hitRingColorPickers, 'hitRingColors',
    (i) => previewSkin.laneColors[i] || '#ffffff');
  syncGrid(keyBoxBorderColorPickers, 'keyBoxBorderColors',
    (i) => previewSkin.laneColors[i] || '#ffffff');
  syncGrid(keyBoxTextColorPickers, 'keyBoxTextColors',
    (i) => previewSkin.laneColors[i] || '#ffffff');
  syncGrid(laneBorderColorPickers, 'laneBorderColors',
    (i) => previewSkin.laneColors[i] || '#ffffff');
  syncGrid(lanePressColorPickers, 'lanePressColors',
    (i) => previewSkin.laneColors[i] || '#ffffff');
  missNoteModeSelect.value = previewSkin.missNoteMode || 'darken';
  missNoteDarkenInput.value = previewSkin.missNoteDarken ?? 0.35;
  missNoteDarkenVal.textContent = Math.round((previewSkin.missNoteDarken ?? 0.35) * 100) + '%';
  const mfColor = previewSkin.missNoteFlatColor || '#666666';
  colorPickers.missNoteFlatColor.setColor(mfColor);
  missNoteFlatColorHex.textContent = mfColor;
  updateMissNoteVisibility();
  document.querySelectorAll('input[name="noteShape"]').forEach(r => {
    r.checked = (r.value === (previewSkin.noteShape || 'rounded'));
  });
  // New controls
  holdStripesCheck.checked   = previewSkin.holdStripes !== false;
  noteShineInput.value = previewSkin.noteShine ?? 0.30;
  noteShineVal.textContent = Math.round((previewSkin.noteShine ?? 0.30) * 100) + '%';
  holdTickMarksCheck.checked = previewSkin.holdTickMarks !== false;
  holdBorderWidthInput.value = previewSkin.holdBorderWidth ?? 1;
  holdBorderWidthVal.textContent = String(previewSkin.holdBorderWidth ?? 1);
  // Note border controls
  noteBorderWidthInput.value = previewSkin.noteBorderWidth || 0;
  noteBorderWidthVal.textContent = String(previewSkin.noteBorderWidth || 0);
  tailCapStyleSelect.value = previewSkin.tailCapStyle || 'rounded';
  noteIconScaleInput.value   = previewSkin.noteIconScale !== undefined ? previewSkin.noteIconScale : 1.0;
  noteIconScaleVal.textContent = Math.round(parseFloat(noteIconScaleInput.value) * 100) + '%';
  noteIconOffsetYInput.value = previewSkin.noteIconOffsetY ?? 0;
  noteIconOffsetYVal.textContent = String(previewSkin.noteIconOffsetY ?? 0);
  keyBoxModeSelect.value     = previewSkin.keyBoxMode || 'solid';
  // Hitsound selects
  if (skinHitsoundSel)  skinHitsoundSel.value  = previewSkin.hitsound || '';
  if (skinSliderTickSel) skinSliderTickSel.value = previewSkin.sliderTickSound || '';
  if (skinSliderEndSel)  skinSliderEndSel.value  = previewSkin.sliderEndSound || '';
  // Judgment & HUD controls
  syncPicker('perfectColor', '#ffd040');  perfectColorHex.textContent = previewSkin.perfectColor || '#ffd040';
  syncPicker('goodColor',    '#60ff90');  goodColorHex.textContent    = previewSkin.goodColor    || '#60ff90';
  syncPicker('okColor',      '#40c4ff');  okColorHex.textContent      = previewSkin.okColor      || '#40c4ff';
  syncPicker('missColor',    '#ff4060');  missColorHex.textContent    = previewSkin.missColor    || '#ff4060';
  syncPicker('earlyColor',   '#ffa060');  earlyColorHex.textContent   = previewSkin.earlyColor   || '#ffa060';
  syncPicker('lateColor',    '#60a0ff');  lateColorHex.textContent    = previewSkin.lateColor    || '#60a0ff';
  syncPicker('scoreColor',   '#ffffff');  scoreColorHex.textContent   = previewSkin.scoreColor   || '#ffffff';
  judgeSizeInput.value     = previewSkin.judgeSizeMultiplier ?? 1.0; judgeSizeVal.textContent    = Math.round((previewSkin.judgeSizeMultiplier ?? 1.0) * 100) + '%';
  // HP & Progress controls
  const pc = previewSkin.progressColors || ['#c060ff', '#40c4ff', '#60ff90'];
  syncPicker('hpHighColor',   '#60ff90');  hpHighColorHex.textContent   = previewSkin.hpHighColor   || '#60ff90';
  syncPicker('hpMidColor',    '#ffd040');  hpMidColorHex.textContent    = previewSkin.hpMidColor    || '#ffd040';
  syncPicker('hpLowColor',    '#ff4060');  hpLowColorHex.textContent    = previewSkin.hpLowColor    || '#ff4060';
  syncPicker('hpBgColor',     '#14142a');  hpBgColorHex.textContent     = previewSkin.hpBgColor     || '#14142a';
  syncPicker('hpBorderColor', '#303055');  hpBorderColorHex.textContent = previewSkin.hpBorderColor || '#303055';
  colorPickers.progressColor0.setColor(pc[0]);
  colorPickers.progressColor1.setColor(pc[1]);
  colorPickers.progressColor2.setColor(pc[2]);
  hpBarHeightInput.value = previewSkin.hpBarHeight ?? 10;    hpBarHeightVal.textContent = previewSkin.hpBarHeight ?? 10;
  hpBarWidthInput.value  = previewSkin.hpBarWidth ?? 115;    hpBarWidthVal.textContent  = previewSkin.hpBarWidth ?? 115;
  progressBarHeightInput.value = previewSkin.progressBarHeight ?? 3; progressBarHeightVal.textContent = previewSkin.progressBarHeight ?? 3;

  // Lane Appearance controls
  syncPicker('missFlashColor', '#ff3c50'); missFlashColorHex.textContent = previewSkin.missFlashColor || '#ff3c50';
  laneGradientModeSelect.value = previewSkin.laneGradientMode || 'fade';
  hitZoneStyleSelect.value = previewSkin.hitZoneStyle || 'glow';
  syncPicker('songInfoColor', '#383860');  songInfoColorHex.textContent  = previewSkin.songInfoColor || '#383860';

  // Hit Effects controls
  hitBurstEnabledCheck.checked = previewSkin.hitBurstEnabled !== false;
  hitRingEnabledCheck.checked  = previewSkin.hitRingEnabled !== false;
  hitBurstIntensityInput.value = previewSkin.hitBurstIntensity ?? 1.0;
  hitBurstIntensityVal.textContent = Math.round((previewSkin.hitBurstIntensity ?? 1.0) * 100) + '%';
  hitFlashIntensityInput.value = previewSkin.hitFlashIntensity ?? 1.0;
  hitFlashIntensityVal.textContent = Math.round((previewSkin.hitFlashIntensity ?? 1.0) * 100) + '%';
  noteApproachGlowInput.value = previewSkin.noteApproachGlow ?? 22;
  noteApproachGlowVal.textContent = String(previewSkin.noteApproachGlow ?? 22);

  // Celebration controls
  syncPicker('fcColor', '#ffd040'); fcColorHex.textContent = previewSkin.fcColor || '#ffd040';
  pcSaturationInput.value = previewSkin.pcSaturation ?? 100;
  pcSaturationVal.textContent = (previewSkin.pcSaturation ?? 100) + '%';
  comboEnabledCheck.checked = previewSkin.comboEnabled !== false;
  comboTextInput.value = previewSkin.comboText || '{n} COMBO';
  renderMilestoneList();

  fontFamilySelect.value = previewSkin.fontFamily || 'monospace';

  // Custom text controls
  perfectTextInput.value  = previewSkin.perfectText || '';
  goodTextInput.value     = previewSkin.goodText    || '';
  okTextInput.value       = previewSkin.okText      || '';
  missTextInput.value     = previewSkin.missText    || '';
  earlyTextInput.value    = previewSkin.earlyText   || '';
  lateTextInput.value     = previewSkin.lateText    || '';
  holdTextInput.value     = previewSkin.holdText    || '';
  breakTextInput.value    = previewSkin.breakText   || '';
  syncPicker('holdJudgeColor', '#ffd040'); holdJudgeColorHex.textContent = previewSkin.holdColor || '#ffd040';
  syncPicker('breakColor',     '#ff4060'); breakColorHex.textContent     = previewSkin.breakColor || '#ff4060';
  showEarlyLateCheck.checked = previewSkin.showEarlyLate !== false;

  // Live overlay controls
  syncPicker('liveAccentColor', '#c060ff'); liveAccentColorHex.textContent = previewSkin.liveAccentColor || '#c060ff';
  liveOpacityInput.value = previewSkin.liveOpacity ?? 0.95;
  liveOpacityVal.textContent = Math.round((previewSkin.liveOpacity ?? 0.95) * 100) + '%';
  liveBorderRadiusInput.value = previewSkin.liveBorderRadius ?? 6;
  liveBorderRadiusVal.textContent = String(previewSkin.liveBorderRadius ?? 6);

  // Background image controls
  bgImageOpacityInput.value = previewSkin.bgImageOpacity ?? 0.3;
  bgImageOpacityVal.textContent = Math.round((previewSkin.bgImageOpacity ?? 0.3) * 100) + '%';
  bgImageSaturationInput.value = previewSkin.bgImageSaturation ?? 100;
  bgImageSaturationVal.textContent = (previewSkin.bgImageSaturation ?? 100) + '%';
  bgImageBlurInput.value = previewSkin.bgImageBlur ?? 0;
  bgImageBlurVal.textContent = String(previewSkin.bgImageBlur ?? 0);
  // Load background media for preview
  _clearBgMedia();
  const bis = document.getElementById('bgImageStatus');
  if (previewSkin.bgMediaSource === 'idb') {
    getBg('skin_bg').then(entry => {
      if (!entry || !entry.data) return;
      _bgMediaObjUrl = URL.createObjectURL(entry.data);
      const isVideo = entry.type === 'video';
      _loadBgMediaElement(_bgMediaObjUrl, isVideo, () => { drawPreview(); skinChanged(); });
      if (bis) bis.textContent = (isVideo ? 'Video' : 'Image') + ' loaded';
    });
  } else if (previewSkin.bgMediaSource === 'url' && previewSkin.bgMediaUrl) {
    const isVideo = previewSkin.bgMediaType === 'video';
    _loadBgMediaElement(previewSkin.bgMediaUrl, isVideo, () => { drawPreview(); skinChanged(); });
    if (bis) bis.textContent = (isVideo ? 'Video' : 'Image') + ' URL loaded';
  } else if (previewSkin.bgImage) {
    _bgMedia = new Image();
    _bgMedia.src = previewSkin.bgImage;
    if (bis) bis.textContent = 'Image loaded';
  } else {
    if (bis) bis.textContent = '';
  }

  // Note icon (var-hoisted, safe to access before definition)
  if (previewSkin.noteIcon) {
    _noteIconImg = new Image();
    _noteIconImg.src = previewSkin.noteIcon;
    const nis = document.getElementById('noteIconStatus');
    if (nis) nis.textContent = 'Custom icon loaded';
  } else {
    _noteIconImg = null;
    const nis = document.getElementById('noteIconStatus');
    if (nis) nis.textContent = '';
  }
}

// Wire up all non-color inputs
skinNameInput.addEventListener('input', () => { previewSkin.name = skinNameInput.value || 'Custom'; });

glowInput.addEventListener('input', () => {
  previewSkin.noteGlow = parseInt(glowInput.value);
  glowVal.textContent = glowInput.value;
  drawPreview(); skinChanged();
});
hitLineWidthInput.addEventListener('input', () => {
  previewSkin.hitLineWidth = parseFloat(hitLineWidthInput.value);
  hitLineWidthVal.textContent = previewSkin.hitLineWidth.toFixed(1);
  drawPreview(); skinChanged();
});
noteHeightInput.addEventListener('input', () => {
  previewSkin.noteHeight = parseFloat(noteHeightInput.value);
  noteHeightVal.textContent = Math.round(previewSkin.noteHeight * 100) + '%';
  drawPreview(); skinChanged();
});
holdWidthInput.addEventListener('input', () => {
  previewSkin.holdBodyWidth = parseFloat(holdWidthInput.value);
  holdWidthVal.textContent = Math.round(previewSkin.holdBodyWidth * 100) + '%';
  drawPreview(); skinChanged();
});
tailCapWidthInput.addEventListener('input', () => {
  previewSkin.tailCapWidth = parseFloat(tailCapWidthInput.value);
  tailCapWidthVal.textContent = Math.round(previewSkin.tailCapWidth * 100) + '%';
  drawPreview(); skinChanged();
});
tailCapHeightInput.addEventListener('input', () => {
  previewSkin.tailCapHeight = parseFloat(tailCapHeightInput.value);
  tailCapHeightVal.textContent = Math.round(previewSkin.tailCapHeight * 100) + '%';
  drawPreview(); skinChanged();
});
holdStripesCheck.addEventListener('change', () => {
  previewSkin.holdStripes = holdStripesCheck.checked;
  drawPreview(); skinChanged();
});
noteShineInput.addEventListener('input', () => {
  noteShineVal.textContent = Math.round(noteShineInput.value * 100) + '%';
  previewSkin.noteShine = parseFloat(noteShineInput.value);
  drawPreview(); skinChanged();
});
holdTickMarksCheck.addEventListener('change', () => {
  previewSkin.holdTickMarks = holdTickMarksCheck.checked;
  drawPreview(); skinChanged();
});
holdBorderWidthInput.addEventListener('input', () => {
  holdBorderWidthVal.textContent = holdBorderWidthInput.value;
  previewSkin.holdBorderWidth = parseFloat(holdBorderWidthInput.value);
  drawPreview(); skinChanged();
});
tailCapStyleSelect.addEventListener('change', () => {
  previewSkin.tailCapStyle = tailCapStyleSelect.value;
  drawPreview(); skinChanged();
});
noteIconScaleInput.addEventListener('input', () => {
  previewSkin.noteIconScale = parseFloat(noteIconScaleInput.value);
  noteIconScaleVal.textContent = Math.round(previewSkin.noteIconScale * 100) + '%';
  drawPreview(); skinChanged();
});
noteIconOffsetYInput.addEventListener('input', () => {
  noteIconOffsetYVal.textContent = noteIconOffsetYInput.value;
  previewSkin.noteIconOffsetY = parseInt(noteIconOffsetYInput.value);
  drawPreview(); skinChanged();
});
keyBoxModeSelect.addEventListener('change', () => {
  previewSkin.keyBoxMode = keyBoxModeSelect.value;
  drawPreview(); skinChanged();
});

judgeSizeInput.addEventListener('input', () => {
  judgeSizeVal.textContent = Math.round(judgeSizeInput.value * 100) + '%';
  previewSkin.judgeSizeMultiplier = parseFloat(judgeSizeInput.value);
  drawPreview(); skinChanged();
});

laneGradientModeSelect.addEventListener('change', () => {
  previewSkin.laneGradientMode = laneGradientModeSelect.value;
  drawPreview(); skinChanged();
});
hitZoneStyleSelect.addEventListener('change', () => {
  previewSkin.hitZoneStyle = hitZoneStyleSelect.value;
  drawPreview(); skinChanged();
});
pcSaturationInput.addEventListener('input', () => {
  pcSaturationVal.textContent = pcSaturationInput.value + '%';
  previewSkin.pcSaturation = parseInt(pcSaturationInput.value);
  drawPreview(); skinChanged();
});

fontFamilySelect.addEventListener('change', () => {
  previewSkin.fontFamily = fontFamilySelect.value;
  drawPreview(); skinChanged();
});

hpBarHeightInput.addEventListener('input', () => {
  hpBarHeightVal.textContent = hpBarHeightInput.value;
  previewSkin.hpBarHeight = parseInt(hpBarHeightInput.value);
  drawPreview(); skinChanged();
});
hpBarWidthInput.addEventListener('input', () => {
  hpBarWidthVal.textContent = hpBarWidthInput.value;
  previewSkin.hpBarWidth = parseInt(hpBarWidthInput.value);
  drawPreview(); skinChanged();
});
progressBarHeightInput.addEventListener('input', () => {
  progressBarHeightVal.textContent = progressBarHeightInput.value;
  previewSkin.progressBarHeight = parseInt(progressBarHeightInput.value);
  drawPreview(); skinChanged();
});

// Live overlay controls
liveOpacityInput.addEventListener('input', () => {
  liveOpacityVal.textContent = Math.round(liveOpacityInput.value * 100) + '%';
  previewSkin.liveOpacity = parseFloat(liveOpacityInput.value);
  drawPreview(); skinChanged();
});
liveBorderRadiusInput.addEventListener('input', () => {
  liveBorderRadiusVal.textContent = liveBorderRadiusInput.value;
  previewSkin.liveBorderRadius = parseInt(liveBorderRadiusInput.value);
  drawPreview(); skinChanged();
});

// Background image controls
bgImageOpacityInput.addEventListener('input', () => {
  bgImageOpacityVal.textContent = Math.round(bgImageOpacityInput.value * 100) + '%';
  previewSkin.bgImageOpacity = parseFloat(bgImageOpacityInput.value);
  drawPreview(); skinChanged();
});
bgImageSaturationInput.addEventListener('input', () => {
  bgImageSaturationVal.textContent = bgImageSaturationInput.value + '%';
  previewSkin.bgImageSaturation = parseInt(bgImageSaturationInput.value);
  drawPreview(); skinChanged();
});
bgImageBlurInput.addEventListener('input', () => {
  bgImageBlurVal.textContent = bgImageBlurInput.value;
  previewSkin.bgImageBlur = parseInt(bgImageBlurInput.value);
  drawPreview(); skinChanged();
});

// Custom text inputs
perfectTextInput.addEventListener('input', () => { previewSkin.perfectText = perfectTextInput.value; drawPreview(); skinChanged(); });
goodTextInput.addEventListener('input', () => { previewSkin.goodText = goodTextInput.value; drawPreview(); skinChanged(); });
okTextInput.addEventListener('input', () => { previewSkin.okText = okTextInput.value; drawPreview(); skinChanged(); });
missTextInput.addEventListener('input', () => { previewSkin.missText = missTextInput.value; drawPreview(); skinChanged(); });
earlyTextInput.addEventListener('input', () => { previewSkin.earlyText = earlyTextInput.value; drawPreview(); skinChanged(); });
lateTextInput.addEventListener('input', () => { previewSkin.lateText = lateTextInput.value; drawPreview(); skinChanged(); });
holdTextInput.addEventListener('input', () => { previewSkin.holdText = holdTextInput.value; drawPreview(); skinChanged(); });
breakTextInput.addEventListener('input', () => { previewSkin.breakText = breakTextInput.value; drawPreview(); skinChanged(); });
showEarlyLateCheck.addEventListener('change', () => { previewSkin.showEarlyLate = showEarlyLateCheck.checked; drawPreview(); skinChanged(); });

hitBurstEnabledCheck.addEventListener('change', () => {
  previewSkin.hitBurstEnabled = hitBurstEnabledCheck.checked;
  drawPreview(); skinChanged();
});
hitRingEnabledCheck.addEventListener('change', () => {
  previewSkin.hitRingEnabled = hitRingEnabledCheck.checked;
  drawPreview(); skinChanged();
});
hitBurstIntensityInput.addEventListener('input', () => {
  hitBurstIntensityVal.textContent = Math.round(hitBurstIntensityInput.value * 100) + '%';
  previewSkin.hitBurstIntensity = parseFloat(hitBurstIntensityInput.value);
  drawPreview(); skinChanged();
});
hitFlashIntensityInput.addEventListener('input', () => {
  hitFlashIntensityVal.textContent = Math.round(hitFlashIntensityInput.value * 100) + '%';
  previewSkin.hitFlashIntensity = parseFloat(hitFlashIntensityInput.value);
  drawPreview(); skinChanged();
});
noteApproachGlowInput.addEventListener('input', () => {
  noteApproachGlowVal.textContent = noteApproachGlowInput.value;
  previewSkin.noteApproachGlow = parseInt(noteApproachGlowInput.value);
  drawPreview(); skinChanged();
});

document.querySelectorAll('input[name="noteShape"]').forEach(r => {
  if (r.value === (previewSkin.noteShape || 'rounded')) r.checked = true;
  r.addEventListener('change', () => {
    previewSkin.noteShape = r.value;
    drawPreview(); skinChanged();
  });
});

animateCheck.addEventListener('change', () => {
  animating = animateCheck.checked;
  if (animating) startAnimation();
  else { if (animId) cancelAnimationFrame(animId); animId = null; }
});

// ── Hitsound controls ────────────────────────────────────────────────────────
skinHitsoundSel.value   = previewSkin.hitsound || '';
skinSliderTickSel.value = previewSkin.sliderTickSound || '';
skinSliderEndSel.value  = previewSkin.sliderEndSound || '';

skinHitsoundSel.addEventListener('change', () => { previewSkin.hitsound = skinHitsoundSel.value; });
skinSliderTickSel.addEventListener('change', () => { previewSkin.sliderTickSound = skinSliderTickSel.value; });
skinSliderEndSel.addEventListener('change', () => { previewSkin.sliderEndSound = skinSliderEndSel.value; });

// Test button: play the selected hitsound
let _testCtx = null;
document.getElementById('btnTestSkinHS').addEventListener('click', () => {
  const type = skinHitsoundSel.value;
  if (!type) return;
  if (!_testCtx) _testCtx = new AudioContext();
  const buf = buildHitsoundBuffer(_testCtx, type);
  if (!buf) return;
  const src = _testCtx.createBufferSource();
  src.buffer = buf;
  src.connect(_testCtx.destination);
  src.start();
});

// ── Background upload (image or video) ──────────────────────────────────────
const bgImageFile   = document.getElementById('bgImageFile');
const bgImageStatus = document.getElementById('bgImageStatus');
var _bgMedia = null;       // <img> or <video> element for preview
var _bgMediaObjUrl = null; // track for cleanup

function _isAnimatedOrVideoSE(mime) {
  return mime.startsWith('video/');
}

function _clearBgMedia() {
  if (_bgMediaObjUrl) { URL.revokeObjectURL(_bgMediaObjUrl); _bgMediaObjUrl = null; }
  if (_bgMedia && _bgMedia.parentNode) _bgMedia.remove();
  _bgMedia = null;
}

function _loadBgMediaElement(src, isVideo, onReady) {
  _clearBgMedia();
  if (isVideo) {
    _bgMedia = document.createElement('video');
    _bgMedia.autoplay = true;
    _bgMedia.loop = true;
    _bgMedia.muted = true;
    _bgMedia.playsInline = true;
    _bgMedia.onloadeddata = onReady;
    _bgMedia.src = src;
    _bgMedia.play().catch(() => {});
  } else {
    _bgMedia = new Image();
    _bgMedia.onload = onReady;
    _bgMedia.src = src;
  }
}

// Init: load existing background media
if (previewSkin.bgMediaSource === 'idb') {
  getBg('skin_bg').then(entry => {
    if (!entry || !entry.data) return;
    _bgMediaObjUrl = URL.createObjectURL(entry.data);
    const isVideo = entry.type === 'video';
    _loadBgMediaElement(_bgMediaObjUrl, isVideo, () => { drawPreview(); skinChanged(); });
    bgImageStatus.textContent = (isVideo ? 'Video' : 'Image') + ' loaded';
  });
} else if (previewSkin.bgMediaSource === 'url' && previewSkin.bgMediaUrl) {
  const isVideo = previewSkin.bgMediaType === 'video';
  _loadBgMediaElement(previewSkin.bgMediaUrl, isVideo, () => { drawPreview(); skinChanged(); });
  bgImageStatus.textContent = (isVideo ? 'Video' : 'Image') + ' URL loaded';
} else if (previewSkin.bgImage) {
  _bgMedia = new Image();
  _bgMedia.src = previewSkin.bgImage;
  bgImageStatus.textContent = 'Image loaded';
}

document.getElementById('btnUploadBgImage').addEventListener('click', () => bgImageFile.click());
document.getElementById('btnClearBgImage').addEventListener('click', () => {
  previewSkin.bgImage = '';
  previewSkin.bgMediaType = '';
  previewSkin.bgMediaMime = '';
  previewSkin.bgMediaSource = '';
  previewSkin.bgMediaUrl = '';
  _clearBgMedia();
  deleteBg('skin_bg');
  bgImageStatus.textContent = '';
  drawPreview(); skinChanged();
});

bgImageFile.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const mime = f.type || '';

  if (_isAnimatedOrVideoSE(mime)) {
    const isVideo = mime.startsWith('video/');
    saveBg({ id: 'skin_bg', data: f, type: isVideo ? 'video' : 'image', mimeType: mime }).then(() => {
      previewSkin.bgImage = '';
      previewSkin.bgMediaType = isVideo ? 'video' : 'image';
      previewSkin.bgMediaMime = mime;
      previewSkin.bgMediaSource = 'idb';
      previewSkin.bgMediaUrl = '';
      _bgMediaObjUrl = URL.createObjectURL(f);
      _loadBgMediaElement(_bgMediaObjUrl, isVideo, () => { drawPreview(); skinChanged(); });
      bgImageStatus.textContent = (isVideo ? 'Video' : 'Image') + ' loaded';
    });
  } else {
    // Static image: resize/compress as before
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 960;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          const s = MAX / Math.max(w, h);
          w = Math.round(w * s);
          h = Math.round(h * s);
        }
        const tc = document.createElement('canvas');
        tc.width = w; tc.height = h;
        tc.getContext('2d').drawImage(img, 0, 0, w, h);
        previewSkin.bgImage = tc.toDataURL('image/jpeg', 0.7);
        previewSkin.bgMediaType = '';
        previewSkin.bgMediaMime = '';
        previewSkin.bgMediaSource = '';
        previewSkin.bgMediaUrl = '';
        deleteBg('skin_bg');
        _clearBgMedia();
        _bgMedia = new Image();
        _bgMedia.onload = () => { drawPreview(); skinChanged(); };
        _bgMedia.src = previewSkin.bgImage;
        bgImageStatus.textContent = `${w}×${h} loaded`;
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  }
  e.target.value = '';
});

// URL-based background loading
document.getElementById('btnLoadBgUrl').addEventListener('click', () => {
  const url = document.getElementById('bgMediaUrl').value.trim();
  if (!url) return;
  const ext = url.split(/[?#]/)[0].split('.').pop().toLowerCase();
  const videoExts = new Set(['mp4', 'webm', 'ogg', 'mov']);
  const isVideo = videoExts.has(ext);
  previewSkin.bgImage = '';
  previewSkin.bgMediaType = isVideo ? 'video' : 'image';
  previewSkin.bgMediaMime = isVideo ? `video/${ext === 'mov' ? 'mp4' : ext}` : `image/${ext}`;
  previewSkin.bgMediaSource = 'url';
  previewSkin.bgMediaUrl = url;
  deleteBg('skin_bg');
  _loadBgMediaElement(url, isVideo, () => { drawPreview(); skinChanged(); });
  bgImageStatus.textContent = (isVideo ? 'Video' : 'Image') + ' URL loaded';
});

// ── Note icon upload ─────────────────────────────────────────────────────────
const noteIconFile   = document.getElementById('noteIconFile');
const noteIconStatus = document.getElementById('noteIconStatus');

document.getElementById('btnUploadNoteIcon').addEventListener('click', () => noteIconFile.click());
document.getElementById('btnClearNoteIcon').addEventListener('click', () => {
  previewSkin.noteIcon = '';
  noteIconStatus.textContent = '';
  _noteIconImg = null;
  drawPreview(); skinChanged();
});

// var so it's hoisted before populateControls() call
var _noteIconImg = null;
if (previewSkin.noteIcon) {
  _noteIconImg = new Image();
  _noteIconImg.src = previewSkin.noteIcon;
  noteIconStatus.textContent = 'Custom icon loaded';
}

noteIconFile.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Scale to fit 140x140 while preserving aspect ratio (high-res for sharp rendering)
      const maxDim = 140;
      const tc = document.createElement('canvas');
      const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
      tc.width = Math.round(img.naturalWidth * scale);
      tc.height = Math.round(img.naturalHeight * scale);
      const tctx = tc.getContext('2d');
      tctx.drawImage(img, 0, 0, tc.width, tc.height);
      previewSkin.noteIcon = tc.toDataURL('image/png');
      _noteIconImg = new Image();
      _noteIconImg.onload = () => { drawPreview(); skinChanged(); };
      _noteIconImg.src = previewSkin.noteIcon;
      noteIconStatus.textContent = 'Custom icon set';
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(f);
  e.target.value = '';
});

// ── Buttons ──────────────────────────────────────────────────────────────────
document.getElementById('btnSaveSkin').addEventListener('click', () => {
  saveSkin({ ...previewSkin });
  const btn = document.getElementById('btnSaveSkin');
  const orig = btn.textContent;
  btn.textContent = '\u2713 Saved!';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
});

document.getElementById('btnExportSkin').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ ...previewSkin }, null, 2)], { type: 'application/json' });
  const a    = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: (previewSkin.name || 'skin').replace(/[^a-z0-9_\- ]/gi, '_') + '.json',
  });
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('btnImportSkin').addEventListener('click', () => {
  document.getElementById('skinImportFile').click();
});

document.getElementById('skinImportFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    previewSkin = applySkin(obj);
    populateControls();
    drawPreview(); skinChanged();
  } catch (_) { showToast('Invalid skin file.', 3000, true); }
  e.target.value = '';
});

document.getElementById('btnResetSkin').addEventListener('click', async () => {
  if (!await krConfirm('Reset skin to default?')) return;
  previewSkin = applySkin({ ...DEFAULT_SKIN });
  populateControls();
  drawPreview(); skinChanged();
});

// ── Preview drawing ──────────────────────────────────────────────────────────
// darkenHex() is defined in skins.js (loaded before skin-editor.js)

function fillNoteShapeP(x, y, w, h, shape, label) {
  const cx = x + w / 2, cy = y + h / 2;
  if (shape === 'diamond') {
    pCtx.save();
    pCtx.translate(cx, cy);
    pCtx.rotate(Math.PI / 4);
    pCtx.fillRect(-w / 2, -h / 2, w, h);
    pCtx.restore();
  } else if (shape === 'sharp') {
    pCtx.fillRect(x, y, w, h);
  } else if (shape === 'circle') {
    pCtx.beginPath();
    pCtx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    pCtx.fill();
  } else if (shape === 'hexagon') {
    pCtx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 2;
      const px = cx + (w / 2) * Math.cos(a), py = cy + (h / 2) * Math.sin(a);
      i === 0 ? pCtx.moveTo(px, py) : pCtx.lineTo(px, py);
    }
    pCtx.closePath();
    pCtx.fill();
  } else if (shape === 'arrow') {
    pCtx.beginPath();
    pCtx.moveTo(cx, y + h);
    pCtx.lineTo(x, y);
    pCtx.lineTo(x + w * 0.3, y);
    pCtx.lineTo(cx, y + h * 0.6);
    pCtx.lineTo(x + w * 0.7, y);
    pCtx.lineTo(x + w, y);
    pCtx.closePath();
    pCtx.fill();
  } else if (shape === 'triangle') {
    pCtx.beginPath();
    pCtx.moveTo(cx, y + h);
    pCtx.lineTo(x, y);
    pCtx.lineTo(x + w, y);
    pCtx.closePath();
    pCtx.fill();
  } else if (shape === 'key') {
    pCtx.beginPath();
    pCtx.roundRect(x, y, w, h, 4);
    pCtx.fill();
    if (label) {
      const prevFill = pCtx.fillStyle;
      pCtx.fillStyle = 'rgba(255,255,255,0.85)';
      pCtx.font = `bold ${Math.max(8, Math.floor(h * 0.7))}px ${previewSkin.fontFamily || 'monospace'}`;
      pCtx.textAlign = 'center';
      pCtx.textBaseline = 'middle';
      pCtx.fillText(label, cx, cy);
      pCtx.fillStyle = prevFill;
      pCtx.textAlign = 'start';
      pCtx.textBaseline = 'alphabetic';
    }
  } else {
    pCtx.beginPath();
    pCtx.roundRect(x, y, w, h, 4);
    pCtx.fill();
  }
}

function strokeNoteShapeP(x, y, w, h, shape) {
  const cx = x + w / 2, cy = y + h / 2;
  if (shape === 'diamond') {
    pCtx.save();
    pCtx.translate(cx, cy);
    pCtx.rotate(Math.PI / 4);
    pCtx.strokeRect(-w / 2, -h / 2, w, h);
    pCtx.restore();
  } else if (shape === 'sharp') {
    pCtx.strokeRect(x, y, w, h);
  } else if (shape === 'circle') {
    pCtx.beginPath();
    pCtx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    pCtx.stroke();
  } else if (shape === 'hexagon') {
    pCtx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 2;
      const px = cx + (w / 2) * Math.cos(a), py = cy + (h / 2) * Math.sin(a);
      i === 0 ? pCtx.moveTo(px, py) : pCtx.lineTo(px, py);
    }
    pCtx.closePath();
    pCtx.stroke();
  } else if (shape === 'arrow') {
    pCtx.beginPath();
    pCtx.moveTo(cx, y + h);
    pCtx.lineTo(x, y);
    pCtx.lineTo(x + w * 0.3, y);
    pCtx.lineTo(cx, y + h * 0.6);
    pCtx.lineTo(x + w * 0.7, y);
    pCtx.lineTo(x + w, y);
    pCtx.closePath();
    pCtx.stroke();
  } else if (shape === 'triangle') {
    pCtx.beginPath();
    pCtx.moveTo(cx, y + h);
    pCtx.lineTo(x, y);
    pCtx.lineTo(x + w, y);
    pCtx.closePath();
    pCtx.stroke();
  } else {
    pCtx.beginPath();
    pCtx.roundRect(x, y, w, h, 4);
    pCtx.stroke();
  }
}

function _drawDiagStripes(x, y, w, h, color, spacing) {
  if (h <= 0 || w <= 0) return;
  spacing = spacing || 10;
  pCtx.save();
  pCtx.beginPath();
  pCtx.rect(x, y, w, h);
  pCtx.clip();
  pCtx.strokeStyle = color;
  pCtx.lineWidth = 2;
  pCtx.beginPath();
  for (let i = -(h + w); i <= w + h + spacing; i += spacing) {
    pCtx.moveTo(x + i, y);
    pCtx.lineTo(x + i + h, y + h);
  }
  pCtx.stroke();
  pCtx.restore();
}

// ── Hit effect particles for preview ──
let _previewHitFx = [];
let _prevHitTimes = new Set(); // track which notes already triggered

function spawnPreviewHitFx(lane) {
  _previewHitFx.push({ type: 'burst', lane, timer: 20, maxTimer: 20 });
  _previewHitFx.push({ type: 'ring',  lane, timer: 22, maxTimer: 22 });
}

function tickPreviewHitFx() {
  for (let i = _previewHitFx.length - 1; i >= 0; i--) {
    if (--_previewHitFx[i].timer <= 0) _previewHitFx.splice(i, 1);
  }
}

// Demo notes for animation — generated per lane count
function makeDemoNotes(nLanes) {
  const notes = [];
  for (let i = 0; i < nLanes; i++) {
    notes.push({ lane: i, time: 0.3 + i * 0.4, dur: 0 });
    notes.push({ lane: i, time: 2.0 + i * 0.25, dur: 0 });
    notes.push({ lane: i, time: 3.5 + i * 0.3, dur: 0.6 + (i % 3) * 0.2 });
  }
  return notes;
}

const CYCLE_DURATION = 6.0;
let demoNotes = makeDemoNotes(previewLanes);

function drawPreview() {
  const skin    = previewSkin;
  const shape   = skin.noteShape   || 'rounded';
  const glow    = skin.noteGlow    !== undefined ? skin.noteGlow    : 12;
  const hlWidth = skin.hitLineWidth !== undefined ? skin.hitLineWidth : 2;
  const nh      = Math.round(P_NOTE_H * (skin.noteHeight || 1.0));
  const nLanes  = previewLanes;
  const margin  = 10, gap = 4;
  const lw      = Math.floor((PREVIEW_W - 2 * margin - (nLanes - 1) * gap) / nLanes);
  const lx      = i => margin + i * (lw + gap);
  const cols = skin.laneColors.slice(0, nLanes).map(c => c || '#ffffff');
  // Per-lane resolved colors/opacity for preview
  const pResolved = [];
  for (let i = 0; i < nLanes; i++) pResolved[i] = resolveSkinLane(skin, i);
  const approach = 1.5;
  const hbw     = skin.holdBodyWidth !== undefined ? skin.holdBodyWidth : 0.44;
  const tcwMul  = skin.tailCapWidth  !== undefined ? skin.tailCapWidth  : 1.0;
  const tchMul  = skin.tailCapHeight !== undefined ? skin.tailCapHeight : 1.0;

  // Background gradient
  const rawBg = skin.bgColor || '#0e0e1c';
  const bgC = (typeof isGradient === 'function' && isGradient(rawBg))
    ? resolveColor(rawBg, '#0e0e1c') : rawBg;
  const bgGrad = pCtx.createLinearGradient(0, 0, 0, PREVIEW_H);
  bgGrad.addColorStop(0, bgC);
  bgGrad.addColorStop(1, darkenHex(bgC, 0.4));
  if (/^rgba\(/.test(bgC)) pCtx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
  pCtx.fillStyle = bgGrad;
  pCtx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

  // Background media (image or video)
  if (_bgMedia) {
    const isVid = _bgMedia instanceof HTMLVideoElement;
    const ready = isVid ? _bgMedia.readyState >= 2 : (_bgMedia.complete && _bgMedia.naturalWidth);
    if (ready) {
      const bgA   = skin.bgImageOpacity ?? 0.3;
      const bgSat = skin.bgImageSaturation ?? 100;
      const bgBlr = skin.bgImageBlur ?? 0;
      pCtx.save();
      pCtx.globalAlpha = bgA;
      if (bgSat !== 100 || bgBlr > 0) {
        const parts = [];
        if (bgSat !== 100) parts.push(`saturate(${bgSat}%)`);
        if (bgBlr > 0)     parts.push(`blur(${bgBlr}px)`);
        pCtx.filter = parts.join(' ');
      }
      const iw = isVid ? _bgMedia.videoWidth : _bgMedia.naturalWidth;
      const ih = isVid ? _bgMedia.videoHeight : _bgMedia.naturalHeight;
      const scale = Math.max(PREVIEW_W / iw, PREVIEW_H / ih);
      const sw = iw * scale, sh = ih * scale;
      pCtx.drawImage(_bgMedia, (PREVIEW_W - sw) / 2, (PREVIEW_H - sh) / 2, sw, sh);
      pCtx.restore();
    }
  }

  // Progress bar preview
  const pColors = skin.progressColors || ['#c060ff', '#40c4ff', '#60ff90'];
  const progGrad = pCtx.createLinearGradient(0, 0, PREVIEW_W, 0);
  progGrad.addColorStop(0,   pColors[0]);
  progGrad.addColorStop(0.5, pColors[1]);
  progGrad.addColorStop(1,   pColors[2]);
  const pbH = Math.round((skin.progressBarHeight ?? 3) * PREVIEW_W / 400);
  pCtx.fillStyle = progGrad;
  pCtx.fillRect(0, 0, PREVIEW_W * 0.6, Math.max(1, pbH));

  // HP bar preview
  const hpBg = skin.hpBgColor || '#14142a';
  const hpBorder = skin.hpBorderColor || '#303055';
  const hpCol = skin.hpHighColor || '#60ff90';
  const hpW = Math.round((skin.hpBarWidth ?? 115) * PREVIEW_W / 400);
  const hpH = Math.round((skin.hpBarHeight ?? 10) * PREVIEW_W / 400);
  pCtx.fillStyle = hpBg;
  pCtx.fillRect(8, 8, hpW, hpH);
  pCtx.fillStyle = hpCol;
  pCtx.fillRect(8, 8, Math.round(hpW * 0.7), hpH);
  pCtx.strokeStyle = hpBorder;
  pCtx.lineWidth = 1;
  pCtx.strokeRect(8, 8, hpW, hpH);

  // Lane backgrounds
  const lgm = skin.laneGradientMode || 'fade';
  for (let i = 0; i < nLanes; i++) {
    const x   = lx(i);
    const col = cols[i] || '#ffffff';
    if (lgm === 'fade') {
      const g = pCtx.createLinearGradient(0, P_LANE_TOP, 0, P_HIT_Y);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, withAlpha(col, '20'));
      pCtx.fillStyle = g;
      pCtx.fillRect(x, P_LANE_TOP, lw, P_HIT_Y - P_LANE_TOP);
    } else if (lgm === 'solid') {
      pCtx.fillStyle = withAlpha(col, '17');
      pCtx.fillRect(x, P_LANE_TOP, lw, P_HIT_Y - P_LANE_TOP);
    }
    // Border
    const R = pResolved[i];
    const _lbRaw = skin.laneBorderColors && skin.laneBorderColors[i];
    pCtx.strokeStyle = _lbRaw ? withAlpha(R.laneBorderColor, alphaHex(R.laneBorderOpacity)) : withAlpha(col, '36');
    pCtx.lineWidth = 1;
    pCtx.strokeRect(x + 0.5, P_LANE_TOP, lw, P_HIT_Y - P_LANE_TOP);
  }

  // Hit zone
  const hzs = skin.hitZoneStyle || 'glow';
  if (hzs !== 'none') {
    for (let i = 0; i < nLanes; i++) {
      const x   = lx(i);
      const col = cols[i] || '#ffffff';
      const R = pResolved[i];
      if (hzs === 'glow') {
        const _hgOvr = skin.hitGlowColors && skin.hitGlowColors[i];
        pCtx.fillStyle = _hgOvr ? withAlpha(R.hitGlowColor, alphaHex(R.hitGlowOpacity * 0.094)) : withAlpha(col, '18');
        pCtx.fillRect(x + 4, P_HIT_Y - 4, lw - 8, 8);
      }
      pCtx.strokeStyle = withAlpha(R.hitLineColor, alphaHex(R.hitLineOpacity));
      pCtx.lineWidth   = hlWidth;
      pCtx.beginPath();
      pCtx.moveTo(x + 4, P_HIT_Y);
      pCtx.lineTo(x + lw - 4, P_HIT_Y);
      pCtx.stroke();
    }
  }

  // ── Helper: draw a tap note ──
  const _shineShapes = new Set(['rounded', 'sharp', 'key', 'hexagon']);
  const iconScale = skin.noteIconScale !== undefined ? skin.noteIconScale : 1.0;
  function drawTap(x, yPos, col, a, laneIdx) {
    // Apply per-lane note color and opacity
    const R = pResolved[laneIdx];
    if (R) { col = R.noteColor; a *= R.noteOpacity; }
    pCtx.globalAlpha = a;
    pCtx.shadowBlur  = glow;
    pCtx.shadowColor = R ? withAlpha(R.noteGlowColor, alphaHex(R.noteGlowOpacity)) : col;
    if (_noteIconImg && _noteIconImg.complete && _noteIconImg.naturalWidth) {
      const bw = lw - 8, bh = nh;
      const iconOffY = skin.noteIconOffsetY || 0;
      const sc = Math.min(bw / _noteIconImg.naturalWidth, bh / _noteIconImg.naturalHeight) * iconScale;
      const iw = _noteIconImg.naturalWidth * sc, ih = _noteIconImg.naturalHeight * sc;
      pCtx.drawImage(_noteIconImg, x + 4 + (bw - iw) / 2, yPos - bh + (bh - ih) / 2 + iconOffY, iw, ih);
    } else {
      const ng = pCtx.createLinearGradient(0, yPos - nh, 0, yPos);
      ng.addColorStop(0, col);
      ng.addColorStop(1, withAlpha(col, 'bb'));
      pCtx.fillStyle = ng;
      const kl = (shape === 'key' && keyLabels[laneIdx]) ? keyLabels[laneIdx] : null;
      fillNoteShapeP(x + 4, yPos - nh, lw - 8, nh, shape, kl);
      pCtx.shadowBlur = 0;
      const _shineCol = R ? R.noteShineColor : '#ffffff';
      const _shineOp = R ? R.noteShineOpacity : 1.0;
      const shineA = (skin.noteShine ?? 0.30) * _shineOp;
      if (shineA > 0 && _shineShapes.has(shape)) {
        pCtx.fillStyle = `rgba(255,255,255,${shineA})`;
        if (shape === 'sharp') {
          pCtx.fillRect(x + 4, yPos - nh, lw - 8, 4);
        } else {
          pCtx.beginPath();
          pCtx.roundRect(x + 4, yPos - nh, lw - 8, 4, [4, 4, 0, 0]);
          pCtx.fill();
        }
      }
      // Note border stroke
      const _nbw = skin.noteBorderWidth || 0;
      if (_nbw > 0) {
        pCtx.shadowBlur = 0;
        const bc = R ? R.noteBorderColor : col;
        const bcOp = R ? R.noteBorderOpacity : 1.0;
        pCtx.strokeStyle = withAlpha(bc, alphaHex(bcOp));
        pCtx.lineWidth   = _nbw;
        strokeNoteShapeP(x + 4, yPos - nh, lw - 8, nh, shape);
      }
    }
    pCtx.shadowBlur  = 0;
    pCtx.globalAlpha = 1;
  }

  // ── Helper: draw a hold note head ──
  function drawHoldHead(hx, hw, hh, yHead, col, a, laneIdx) {
    const Rh = pResolved[laneIdx];
    // Custom icon replaces standard head entirely
    if (_noteIconImg && _noteIconImg.complete && _noteIconImg.naturalWidth) {
      const iconOffY = skin.noteIconOffsetY || 0;
      const sc = Math.min(hw / _noteIconImg.naturalWidth, hh / _noteIconImg.naturalHeight) * iconScale;
      const iw = _noteIconImg.naturalWidth * sc, ih = _noteIconImg.naturalHeight * sc;
      pCtx.globalAlpha = a;
      pCtx.shadowBlur  = glow;
      pCtx.shadowColor = col;
      pCtx.drawImage(_noteIconImg, hx + (hw - iw) / 2, yHead - ih + iconOffY, iw, ih);
      pCtx.shadowBlur = 0;
    } else {
      pCtx.globalAlpha = a * 0.9;
      pCtx.shadowBlur  = glow;
      pCtx.shadowColor = col;
      const ng = pCtx.createLinearGradient(0, yHead - hh, 0, yHead);
      ng.addColorStop(0, '#ffffff');
      ng.addColorStop(0.3, col);
      ng.addColorStop(1, withAlpha(col, 'cc'));
      pCtx.fillStyle = ng;
      const kl = (shape === 'key' && keyLabels[laneIdx]) ? keyLabels[laneIdx] : null;
      fillNoteShapeP(hx, yHead - hh, hw, hh, shape, kl);
      pCtx.shadowBlur = 0;
      // Grip lines
      pCtx.strokeStyle = 'rgba(0,0,0,0.35)';
      pCtx.lineWidth   = 1.5;
      for (let g = 0; g < 3; g++) {
        const gy = yHead - 5 - g * 5;
        if (gy < yHead - hh + 3) break;
        pCtx.beginPath();
        pCtx.moveTo(hx + 8, gy);
        pCtx.lineTo(hx + hw - 8, gy);
        pCtx.stroke();
      }
      // White shine on top
      const _hShineCol = Rh ? Rh.noteShineColor : '#ffffff';
      const _hShineOp = Rh ? Rh.noteShineOpacity : 1.0;
      const holdShineA = Math.min(1, (skin.noteShine ?? 0.30) * 1.33 * _hShineOp);
      if (holdShineA > 0 && _shineShapes.has(shape)) {
        pCtx.fillStyle = `rgba(255,255,255,${holdShineA})`;
        if (shape === 'sharp') {
          pCtx.fillRect(hx, yHead - hh, hw, 4);
        } else {
          pCtx.beginPath();
          pCtx.roundRect(hx, yHead - hh, hw, 4, [4, 4, 0, 0]);
          pCtx.fill();
        }
      }
      // Hold head border stroke
      const _nbwH = skin.noteBorderWidth || 0;
      if (_nbwH > 0) {
        pCtx.shadowBlur = 0;
        const bcH = Rh ? Rh.noteBorderColor : col;
        const bcHOp = Rh ? Rh.noteBorderOpacity : 1.0;
        pCtx.strokeStyle = withAlpha(bcH, alphaHex(bcHOp));
        pCtx.lineWidth   = _nbwH;
        strokeNoteShapeP(hx, yHead - hh, hw, hh, shape);
      }
    }
    pCtx.globalAlpha = 1;
  }

  // ── Helper: draw a tail cap ──
  function _drawCapShape(cx, y, w, h, style) {
    if (style === 'flat') {
      pCtx.fillRect(cx - w / 2, y - h / 2, w, h);
    } else if (style === 'pointed') {
      pCtx.beginPath();
      pCtx.moveTo(cx - w / 2, y - h / 2);
      pCtx.lineTo(cx + w / 2, y - h / 2);
      pCtx.lineTo(cx, y + h / 2);
      pCtx.closePath();
      pCtx.fill();
    } else {
      pCtx.beginPath();
      pCtx.roundRect(cx - w / 2, y - h / 2, w, h, h / 2);
      pCtx.fill();
    }
  }

  function drawTailCap(bx, bw, yTail, col, a) {
    const tcOW = (bw + 4) * tcwMul, tcOH = 10 * tchMul;
    const tcIW = bw * tcwMul,       tcIH = 6 * tchMul;
    const tcStyle = skin.tailCapStyle || 'rounded';
    const cx = bx + bw / 2;
    pCtx.shadowBlur  = 12;
    pCtx.shadowColor = col;
    pCtx.fillStyle   = '#ffffff';
    pCtx.globalAlpha = a;
    _drawCapShape(cx, yTail, tcOW, tcOH, tcStyle);
    pCtx.shadowBlur = 0;
    pCtx.fillStyle  = col;
    pCtx.globalAlpha = a * 0.9;
    _drawCapShape(cx, yTail, tcIW, tcIH, tcStyle);
    pCtx.globalAlpha = 1;
  }

  // ── Compute key labels (needed for 'key' shape and key boxes) ──
  const defaultKeys = ['[', ']', '\\', 'A', 'S', 'D', 'F'];
  let keyLabels = [];
  try {
    const kb = getKeybindsForLanes(nLanes);
    for (let i = 0; i < nLanes; i++) {
      const k = kb[i] || defaultKeys[i] || '?';
      keyLabels.push(displayKeyName(k));
    }
  } catch (_) {
    keyLabels = defaultKeys.slice(0, nLanes);
  }

  // ── Draw notes ──
  const t = animating ? animTime % CYCLE_DURATION : 1.5;
  for (const n of demoNotes) {
    if (n.lane >= nLanes) continue;
    let col = cols[n.lane] || '#ffffff';
    const x   = lx(n.lane);
    const tta = n.time - t;
    const R   = pResolved[n.lane];

    if (n.dur === 0) {
      // Tap note — disappear at hit line
      if (tta < 0 || tta > approach) continue;
      const frac = tta / approach;
      const yPos = P_HIT_Y - frac * (P_HIT_Y - P_LANE_TOP);
      drawTap(x, yPos, col, 1, n.lane);
    } else {
      // Hold note — apply per-lane hold color/opacity
      const holdCol = R ? R.holdColor : col;
      const ttaEnd = (n.time + n.dur) - t;
      if (ttaEnd < 0 || tta > approach) continue;
      const isActive = tta < 0; // head reached hit line

      const bw = Math.min(Math.floor(lw * hbw), lw - 4);
      const bx = x + Math.floor((lw - bw) / 2);
      const hx = x + 4, hw = lw - 8, hh = nh + 4;

      if (isActive) {
        // Active hold: head anchored at HIT_Y, tail rising toward it
        const yTail = P_HIT_Y - Math.max(0, ttaEnd / approach) * (P_HIT_Y - P_LANE_TOP);
        const clampedTail = Math.min(yTail, P_HIT_Y - 2);
        const bodyLen = Math.max(0, P_HIT_Y - clampedTail);

        if (bodyLen > 0) {
          const activeAlpha = 0.9 * (R ? R.holdOpacity : 1);
          pCtx.globalAlpha = activeAlpha;
          const _bodyOvr = skin.holdBodyColors && skin.holdBodyColors[n.lane];
          const bodyCol = _bodyOvr ? R.holdBodyColor : holdCol;
          const tg = pCtx.createLinearGradient(0, clampedTail, 0, P_HIT_Y);
          tg.addColorStop(0, withAlpha(bodyCol, '55'));
          tg.addColorStop(1, withAlpha(bodyCol, 'dd'));
          pCtx.fillStyle   = tg;
          pCtx.shadowBlur  = 16;
          pCtx.shadowColor = bodyCol;
          pCtx.fillRect(bx, clampedTail, bw, bodyLen);
          pCtx.shadowBlur = 0;
          const _stripeOvr = skin.holdStripeColors && skin.holdStripeColors[n.lane];
          if (skin.holdStripes !== false) _drawDiagStripes(bx, clampedTail, bw, bodyLen, _stripeOvr ? withAlpha(R.holdStripeColor, alphaHex(R.holdStripeOpacity)) : withAlpha(holdCol, '60'));
        }

        // Active tail endcap
        const tcOW = (bw + 4) * tcwMul, tcOH = 12 * tchMul;
        const tcIW = bw * tcwMul,       tcIH = 8 * tchMul;
        const _tcStyle = skin.tailCapStyle || 'rounded';
        const _cx = bx + bw / 2;
        pCtx.shadowBlur  = 20;
        pCtx.shadowColor = holdCol;
        pCtx.fillStyle   = '#ffffff';
        pCtx.globalAlpha = 0.95;
        _drawCapShape(_cx, clampedTail, tcOW, tcOH, _tcStyle);
        pCtx.shadowBlur = 0;
        const _tcOvr = skin.holdTailCapColors && skin.holdTailCapColors[n.lane];
        pCtx.fillStyle = _tcOvr ? withAlpha(R.holdTailCapColor, alphaHex(R.holdTailCapOpacity)) : holdCol;
        _drawCapShape(_cx, clampedTail, tcIW, tcIH, _tcStyle);
        pCtx.globalAlpha = 1;
        pCtx.shadowBlur  = 0;
      } else {
        // Pending hold: falling toward hit line
        const fracHead = Math.max(0, tta / approach);
        const fracTail = Math.max(0, Math.min(1, ttaEnd / approach));
        const yHead = P_HIT_Y - fracHead * (P_HIT_Y - P_LANE_TOP);
        const yTail = P_HIT_Y - fracTail * (P_HIT_Y - P_LANE_TOP);
        const bodyTop = yHead - hh / 2;
        const bodyLen = Math.max(0, bodyTop - yTail);

        // Body with stripes (matches game)
        if (bodyLen > 0) {
          pCtx.globalAlpha = (R ? R.holdOpacity : 1);
          const _bodyOvrP = skin.holdBodyColors && skin.holdBodyColors[n.lane];
          const bodyColP = _bodyOvrP ? R.holdBodyColor : holdCol;
          pCtx.fillStyle = withAlpha(bodyColP, '60');
          pCtx.fillRect(bx, yTail, bw, bodyLen);
          const _stripeOvrP = skin.holdStripeColors && skin.holdStripeColors[n.lane];
          if (skin.holdStripes !== false) _drawDiagStripes(bx, yTail, bw, bodyLen, _stripeOvrP ? withAlpha(R.holdStripeColor, alphaHex(R.holdStripeOpacity)) : withAlpha(holdCol, '55'));
          const _hbwStroke = skin.holdBorderWidth ?? 1;
          if (_hbwStroke > 0) {
            const _hbOvr = skin.holdBorderColors && skin.holdBorderColors[n.lane];
            pCtx.strokeStyle = _hbOvr ? withAlpha(R.holdBorderColor, alphaHex(R.holdBorderOpacity)) : withAlpha(holdCol, '77');
            pCtx.lineWidth = _hbwStroke;
            pCtx.strokeRect(bx + 0.5, yTail + 0.5, bw - 1, bodyLen - 1);
          }
          pCtx.globalAlpha = 1;
        }

        // Tail cap
        drawTailCap(bx, bw, yTail, holdCol, 1);

        // Head
        drawHoldHead(hx, hw, hh, yHead, holdCol, R ? R.holdOpacity : 1, n.lane);
      }
    }
  }

  // Key boxes
  const keyY = P_HIT_Y + 10;
  const keyH = P_KEYS_H;
  const keyBoxCol = skin.keyBoxColor || '#0c0c18';
  const kbMode = skin.keyBoxMode || 'solid';

  const fontSize = Math.max(10, Math.min(22, Math.floor(lw * 0.28)));
  for (let i = 0; i < nLanes; i++) {
    const x = lx(i), col = cols[i] || '#ffffff';
    const R = pResolved[i];
    const _kbBgOvr = skin.keyBoxBgColors && skin.keyBoxBgColors[i];
    const _kbBdrOvr = skin.keyBoxBorderColors && skin.keyBoxBorderColors[i];
    const _kbTxtOvr = skin.keyBoxTextColors && skin.keyBoxTextColors[i];
    // Key box fill based on mode
    if (_kbBgOvr) {
      pCtx.fillStyle = R.keyBoxBgColor;
    } else if (kbMode === 'dark') {
      pCtx.fillStyle = darkenHex(col, 0.15);
    } else if (kbMode === 'tinted') {
      pCtx.fillStyle = keyBoxCol;
      pCtx.fillRect(x, keyY, lw, keyH);
      pCtx.fillStyle = withAlpha(col, '20');
    } else {
      pCtx.fillStyle = keyBoxCol;
    }
    pCtx.fillRect(x, keyY, lw, keyH);
    pCtx.strokeStyle = _kbBdrOvr ? withAlpha(R.keyBoxBorderColor, alphaHex(R.keyBoxBorderOpacity)) : withAlpha(col, '55');
    pCtx.lineWidth = 1;
    pCtx.strokeRect(x + 1, keyY + 1, lw - 2, keyH - 2);
    pCtx.fillStyle = _kbTxtOvr ? R.keyBoxTextColor : col;
    pCtx.font = `bold ${fontSize}px ${skin.fontFamily || 'monospace'}`;
    pCtx.textAlign = 'center';
    pCtx.textBaseline = 'middle';
    pCtx.fillText(keyLabels[i] || '?', x + lw / 2, keyY + keyH / 2);
  }
  pCtx.textBaseline = 'alphabetic';

  // ── Hit effects (burst + ring) ──
  const hitEffectY = P_HIT_Y;
  for (const fx of _previewHitFx) {
    const col = cols[fx.lane] || '#ffffff';
    const x   = lx(fx.lane);
    const R = pResolved[fx.lane];

    // Hit burst (vertical column flash)
    if (skin.hitBurstEnabled !== false && fx.type === 'burst') {
      const _burstOvr = skin.hitBurstColors && skin.hitBurstColors[fx.lane];
      const burstCol = _burstOvr ? R.hitBurstColor : col;
      const burstMul = skin.hitBurstIntensity ?? 1.0;
      const f  = fx.timer / fx.maxTimer;
      const bH = (15 + (1 - f) * 40) * burstMul;
      const b  = pCtx.createLinearGradient(0, hitEffectY - bH, 0, hitEffectY);
      b.addColorStop(0, withAlpha(burstCol, '00'));
      b.addColorStop(1, burstCol);
      pCtx.fillStyle   = b;
      pCtx.globalAlpha = f * 0.55;
      pCtx.fillRect(x + 2, hitEffectY - bH, lw - 4, bH + 2);
      pCtx.globalAlpha = 1;
    }

    // Hit ring (expanding circle)
    if (skin.hitRingEnabled !== false && fx.type === 'ring') {
      const _ringOvr = skin.hitRingColors && skin.hitRingColors[fx.lane];
      const ringCol = _ringOvr ? R.hitRingColor : col;
      const ringOp  = _ringOvr ? R.hitRingOpacity : 1;
      const progress = 1 - fx.timer / fx.maxTimer;
      const radius   = 8 + progress * 28;
      const alpha    = fx.timer / fx.maxTimer;
      pCtx.strokeStyle  = withAlpha(ringCol, alphaHex(ringOp));
      pCtx.globalAlpha  = alpha * 0.65;
      pCtx.lineWidth    = 2;
      pCtx.shadowBlur   = 6 * alpha;
      pCtx.shadowColor  = ringCol;
      pCtx.beginPath();
      pCtx.arc(x + lw / 2, hitEffectY, radius, 0, Math.PI * 2);
      pCtx.stroke();
      pCtx.shadowBlur  = 0;
      pCtx.globalAlpha = 1;
    }
  }

  // ── HUD below key boxes ──
  const hudY = keyY + keyH + 12;

  // Judgment color swatches (use custom text if set)
  const jColors = [
    { label: skin.perfectText || 'PERFECT', color: skin.perfectColor || '#ffd040' },
    { label: skin.goodText    || 'GOOD',    color: skin.goodColor    || '#60ff90' },
    { label: skin.okText      || 'OK',      color: skin.okColor      || '#40c4ff' },
    { label: skin.missText    || 'MISS',    color: skin.missColor    || '#ff4060' },
    { label: skin.holdText    || 'HOLD!',   color: skin.holdColor    || '#ffd040' },
    { label: skin.breakText   || 'BREAK',   color: skin.breakColor   || '#ff4060' },
  ];
  const jSize = Math.round(10 * (skin.judgeSizeMultiplier ?? 1.0));
  pCtx.font = `bold ${jSize}px ${skin.fontFamily || 'monospace'}`;
  pCtx.textAlign = 'center';
  pCtx.globalAlpha = 0.85;
  for (let j = 0; j < jColors.length; j++) {
    pCtx.fillStyle = jColors[j].color;
    pCtx.fillText(jColors[j].label, PREVIEW_W / 2 + (j - 2.5) * 40, hudY);
  }

  // Early/Late preview
  if (skin.showEarlyLate !== false) {
    const elSize = Math.round(7 * (skin.judgeSizeMultiplier ?? 1.0));
    pCtx.font = `bold ${elSize}px ${skin.fontFamily || 'monospace'}`;
    pCtx.fillStyle = skin.earlyColor || '#ffa060';
    pCtx.fillText(skin.earlyText || 'EARLY', PREVIEW_W / 2 - 30, hudY + 12);
    pCtx.fillStyle = skin.lateColor || '#60a0ff';
    pCtx.fillText(skin.lateText || 'LATE', PREVIEW_W / 2 + 30, hudY + 12);
  }

  // Combo
  if (skin.comboEnabled !== false) {
    const comboCol = skin.comboColor || '#ffffff';
    pCtx.fillStyle = comboCol;
    pCtx.font = `bold 14px ${skin.fontFamily || 'monospace'}`;
    pCtx.globalAlpha = 0.7;
    pCtx.fillText((skin.comboText || '{n} COMBO').replace('{n}', '128'), PREVIEW_W / 2, hudY + 28);
    pCtx.globalAlpha = 1;
  }

  // Score
  pCtx.font = `bold 10px ${skin.fontFamily || 'monospace'}`;
  pCtx.textAlign = 'right';
  pCtx.fillStyle = skin.scoreColor || '#ffffff';
  pCtx.fillText('1,234,567', PREVIEW_W - 10, hudY + 28);

  // FC
  pCtx.font = `bold 9px ${skin.fontFamily || 'monospace'}`;
  pCtx.fillStyle = skin.fcColor || '#ffd040';
  pCtx.fillText('FC', PREVIEW_W - 10, hudY);

  // Song info
  pCtx.font = `9px ${skin.fontFamily || 'monospace'}`;
  pCtx.textAlign = 'left';
  pCtx.fillStyle = skin.songInfoColor || '#383860';
  pCtx.fillText('Song Title - Artist', 10, PREVIEW_H - 6);

  pCtx.globalAlpha = 1;
  pCtx.textAlign = 'start';
}

// ── Animation loop ───────────────────────────────────────────────────────────
function startAnimation() {
  lastFrame = performance.now();
  function frame(now) {
    if (!animating) return;
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;
    animTime += dt;

    // Detect notes crossing hit line → spawn effects
    const t = animTime % CYCLE_DURATION;
    for (const n of demoNotes) {
      const key = n.lane + '_' + n.time.toFixed(2);
      const tta = n.time - t;
      if (tta < 0 && tta > -0.08 && !_prevHitTimes.has(key)) {
        _prevHitTimes.add(key);
        spawnPreviewHitFx(n.lane);
      }
      if (tta > 0.5) _prevHitTimes.delete(key);
    }
    tickPreviewHitFx();

    drawPreview();
    animId = requestAnimationFrame(frame);
  }
  animId = requestAnimationFrame(frame);
}

// Update demo notes when lane count changes
previewLanesSelect.addEventListener('change', () => {
  previewLanes = parseInt(previewLanesSelect.value);
  demoNotes = makeDemoNotes(previewLanes);
  drawPreview(); skinChanged();
});

// Expose lane color sync for the UI editor iframe integration.
// When the UI editor changes theme --lane0/1/2, it calls this to update the preview.
window._krSyncLaneColors = function(colors) {
  if (!colors || !Array.isArray(colors)) return;
  for (let i = 0; i < colors.length && i < previewSkin.laneColors.length; i++) {
    if (colors[i]) {
      previewSkin.laneColors[i] = colors[i];
      if (lanePickers[i]) lanePickers[i].setColor(colors[i]);
    }
  }
  drawPreview(); skinChanged();
};

// Initial draw + start animation
drawPreview();
if (animating) startAnimation();
