// Skin system — color themes for the game and editor
// Single source of truth for lane colors (used by game.js, editor.js, etc.)
const ALL_LANE_COLORS = ['#c060ff', '#40c4ff', '#60ff90', '#ff8040', '#ff4080', '#ffd040', '#80ff40'];

// Shared color utility (used by game.js, skin-editor.js, liveCS.js)
function darkenHex(hex, factor) {
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

// Convert float alpha (0-1) to 2-char hex string (e.g. 0.5 → '80')
function alphaHex(a) {
  return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
}

// Apply a 2-char hex alpha to any color format (hex or rgba).
// For 6-char hex: appends directly. For rgba: multiplies existing alpha.
function withAlpha(color, hexA) {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color + hexA;
  var rm = color.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([^)]+))?\)/);
  if (rm) {
    var ea = rm[4] !== undefined ? parseFloat(rm[4]) : 1;
    var na = Math.round(ea * (parseInt(hexA, 16) / 255) * 100) / 100;
    return 'rgba(' + rm[1] + ', ' + rm[2] + ', ' + rm[3] + ', ' + na + ')';
  }
  return color + hexA;
}

// Resolve miss-note color for a lane based on skin settings
function getMissNoteColor(skin, laneIdx) {
  const mode = skin.missNoteMode || 'darken';
  if (mode === 'flat')   return skin.missNoteFlatColor || '#666666';
  if (mode === 'custom') return (skin.missNoteColors && skin.missNoteColors[laneIdx]) || '#666666';
  // 'darken' — derive from lane color
  const laneCol = (skin.laneColors && skin.laneColors[laneIdx]) || '#666666';
  return darkenHex(laneCol, skin.missNoteDarken ?? 0.35);
}

// Parse a color string into { color (hex), alpha (0-1) }.
// Handles '#rrggbb' (alpha 1.0) and 'rgba(r,g,b,a)' formats.
function parseColorAlpha(val) {
  if (!val) return null;
  const m = val.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (m) {
    const hex = '#' + [m[1], m[2], m[3]].map(v =>
      parseInt(v).toString(16).padStart(2, '0')).join('');
    return { color: hex, alpha: m[4] != null ? parseFloat(m[4]) : 1.0 };
  }
  return { color: val, alpha: 1.0 };
}

// Resolve per-lane note/hold color+opacity for a single lane.
// Called once at setup time (not per-frame). null = inherit from parent.
// Colors may carry embedded alpha via rgba() — Pickr provides this.
function resolveSkinLane(skin, i) {
  const laneColor = (skin.laneColors && skin.laneColors[i]) || ALL_LANE_COLORS[i] || '#ffffff';

  // Note cascade: laneColor -> noteColor
  const noteParsed = parseColorAlpha(skin.noteColors && skin.noteColors[i]);
  const noteColor   = noteParsed ? noteParsed.color : laneColor;
  const noteOpacity = noteParsed ? noteParsed.alpha : 1.0;

  // Hold cascade: noteColor -> holdColor
  const holdParsed = parseColorAlpha(skin.holdColors && skin.holdColors[i]);
  const holdColor   = holdParsed ? holdParsed.color : noteColor;
  const holdOpacity = holdParsed ? holdParsed.alpha : noteOpacity;

  // Helper: resolve a sub-property with a parent fallback
  function sub(arr, parentCol, parentOp) {
    const p = parseColorAlpha(arr && arr[i]);
    return p ? { color: p.color, opacity: p.alpha } : { color: parentCol, opacity: parentOp };
  }

  // Note sub-properties (inherit from noteColor)
  const border = sub(skin.noteBorderColors, noteColor, noteOpacity);
  const shine  = sub(skin.noteShineColors,  '#ffffff', 1.0);
  const glow   = sub(skin.noteGlowColors,   noteColor, noteOpacity);

  // Hold sub-properties (inherit from holdColor)
  const holdBody    = sub(skin.holdBodyColors,    holdColor, holdOpacity);
  const holdBorder  = sub(skin.holdBorderColors,  holdColor, holdOpacity);
  const holdStripe  = sub(skin.holdStripeColors,  holdColor, holdOpacity);
  const holdTailCap = sub(skin.holdTailCapColors, holdColor, holdOpacity);
  const holdTick    = sub(skin.holdTickColors,     '#ffffff', 1.0);

  // Hit zone (inherit from laneColor)
  const hitLine  = sub(skin.hitLineColors,  laneColor, 1.0);
  const hitGlow  = sub(skin.hitGlowColors,  laneColor, 1.0);
  const hitFlash = sub(skin.hitFlashColors,  laneColor, 1.0);
  const hitBurst = sub(skin.hitBurstColors,  laneColor, 1.0);
  const hitRing  = sub(skin.hitRingColors,   laneColor, 1.0);

  // Key box (inherit from laneColor)
  const keyBg     = sub(skin.keyBoxBgColors,     skin.keyBoxColor || '#0c0c18', 1.0);
  const keyBorder = sub(skin.keyBoxBorderColors,  laneColor, 1.0);
  const keyText   = sub(skin.keyBoxTextColors,    laneColor, 1.0);

  // Lane-level (inherit from laneColor)
  const laneBorder = sub(skin.laneBorderColors, laneColor, 1.0);
  const lanePress  = sub(skin.lanePressColors,  laneColor, 1.0);

  return {
    laneColor,
    noteColor, noteOpacity,
    holdColor, holdOpacity,
    noteBorderColor: border.color,    noteBorderOpacity: border.opacity,
    noteShineColor:  shine.color,     noteShineOpacity:  shine.opacity,
    noteGlowColor:   glow.color,      noteGlowOpacity:   glow.opacity,
    holdBodyColor:   holdBody.color,   holdBodyOpacity:   holdBody.opacity,
    holdBorderColor: holdBorder.color, holdBorderOpacity: holdBorder.opacity,
    holdStripeColor: holdStripe.color, holdStripeOpacity: holdStripe.opacity,
    holdTailCapColor: holdTailCap.color, holdTailCapOpacity: holdTailCap.opacity,
    holdTickColor:   holdTick.color,   holdTickOpacity:   holdTick.opacity,
    hitLineColor:  hitLine.color,  hitLineOpacity:  hitLine.opacity,
    hitGlowColor:  hitGlow.color,  hitGlowOpacity:  hitGlow.opacity,
    hitFlashColor: hitFlash.color, hitFlashOpacity: hitFlash.opacity,
    hitBurstColor: hitBurst.color, hitBurstOpacity: hitBurst.opacity,
    hitRingColor:  hitRing.color,  hitRingOpacity:  hitRing.opacity,
    keyBoxBgColor:     keyBg.color,     keyBoxBgOpacity:     keyBg.opacity,
    keyBoxBorderColor: keyBorder.color, keyBoxBorderOpacity: keyBorder.opacity,
    keyBoxTextColor:   keyText.color,   keyBoxTextOpacity:   keyText.opacity,
    laneBorderColor: laneBorder.color, laneBorderOpacity: laneBorder.opacity,
    lanePressColor:  lanePress.color,  lanePressOpacity:  lanePress.opacity,
  };
}

const DEFAULT_SKIN = {
  name:            'Default',
  laneColors:      ALL_LANE_COLORS,
  bgColor:         '#0e0e1c',
  bgImage:         '',         // data URI for custom background image (legacy)
  bgImageOpacity:  0.3,        // 0–1
  bgImageSaturation: 100,      // 0–200%
  bgImageBlur:     0,          // 0–20 px
  bgMediaType:     '',         // 'image'|'video'|'' (empty = legacy bgImage data URI)
  bgMediaMime:     '',         // e.g. 'video/mp4', 'image/gif'
  bgMediaSource:   '',         // 'idb'|'url'|''
  bgMediaUrl:      '',         // URL if source is 'url'
  hitLineColor:    '#ffffff',
  noteShape:       'rounded',  // 'rounded'|'sharp'|'diamond'|'circle'|'hexagon'|'arrow'|'triangle'|'key'
  noteGlow:        12,         // shadowBlur intensity (0–30)
  hitLineWidth:    2,          // hit line stroke width (1–4)
  keyBoxColor:     '#0c0c18',  // key area background
  comboColor:      '#ffffff',  // combo text color
  // Hitsound defaults (empty = no override, settings take priority)
  hitsound:        '',         // global hitsound type
  laneHitsounds:   {},         // per-lane hitsound overrides { 0:'drum', 1:'bell', ... }
  sliderTickSound: '',         // hold body tick sound
  sliderEndSound:  '',         // hold end sound
  noteIcon:        '',         // data URI for custom note icon image
  noteHeight:      1.0,        // note height multiplier (0.5–2.0)
  holdBodyWidth:   0.44,       // hold body width as fraction of lane (0.2–1.0)
  tailCapWidth:    1.0,        // tail cap width multiplier (0.5–2.0)
  tailCapHeight:   1.0,        // tail cap height multiplier (0.5–2.0)
  keyBoxMode:      'solid',    // 'solid' | 'dark' | 'tinted'
  noteIconScale:   1.0,        // 0.5–5.0 multiplier for custom icon rendering
  noteIconOffsetY: 0,          // -20–20 px vertical offset for custom note icon
  holdStripes:     true,       // diagonal stripes on hold note bodies
  // Judgment & HUD
  perfectColor:      '#ffa0e0',
  goodColor:         '#60ff90',
  okColor:           '#40c4ff',
  missColor:         '#ff4060',
  earlyColor:        '#ffa060',
  lateColor:         '#60a0ff',
  holdColor:         '#ffd040',   // hold completion pop color
  breakColor:        '#ff4060',   // hold break pop color
  holdText:          '',          // custom text for hold completion (default: 'HOLD!')
  breakText:         '',          // custom text for hold break (default: 'BREAK')
  scoreColor:        '#ffffff',
  judgeSizeMultiplier: 1.0,       // 0.5–2.0 scale for judgment pop text
  // Custom judgment text (empty = use default)
  perfectText:     '',
  goodText:        '',
  okText:          '',
  missText:        '',
  earlyText:       '',
  lateText:        '',
  showEarlyLate:   true,
  // HP & Progress
  hpHighColor:       '#60ff90',
  hpMidColor:        '#ffd040',
  hpLowColor:        '#ff4060',
  hpBgColor:         '#14142a',
  hpBorderColor:     '#303055',
  progressColors:    ['#c060ff', '#40c4ff', '#60ff90'],
  hpBarHeight:       10,             // 4–20 px
  hpBarWidth:        115,            // 40–200 px
  progressBarHeight: 3,              // 1–8 px
  // Lane Appearance
  missFlashColor:    '#ff3c50',
  missNoteMode:      'darken',   // 'darken' (auto from lane) | 'custom' (per-lane) | 'flat' (single color)
  missNoteColors:    ['#666666','#666666','#666666','#666666','#666666','#666666','#666666'],
  missNoteFlatColor: '#666666',  // used when mode='flat'
  missNoteDarken:    0.35,       // darken factor for 'darken' mode (0–1)
  laneGradientMode:  'fade',     // 'fade' | 'solid' | 'none'
  hitZoneStyle:      'glow',     // 'glow' | 'line' | 'none'
  songInfoColor:     '#383860',
  // Hit Effects
  hitBurstEnabled:   true,
  hitRingEnabled:    true,
  hitBurstIntensity: 1.0,        // 0.5–2.0
  hitFlashIntensity: 1.0,        // 0–2.0
  noteApproachGlow:  22,         // 0–30
  // Note Extras
  noteShine:         0.30,       // 0–1 (shine strip alpha)
  holdTickMarks:     true,
  holdBorderWidth:   1,          // 0–3
  tailCapStyle:      'rounded',  // 'rounded' | 'flat' | 'pointed'
  // Note Borders
  noteBorderWidth:   0,          // 0–4 (0 = no border stroke on tap/hold heads)
  noteBorderColors:  [null,null,null,null,null,null,null],
  // Per-Lane Colors (null = inherit from laneColors[i]; supports rgba for opacity)
  noteColors:            [null,null,null,null,null,null,null],
  holdColors:            [null,null,null,null,null,null,null],
  // Advanced per-lane note colors (null = inherit from noteColors[i])
  noteShineColors:   [null,null,null,null,null,null,null],
  noteGlowColors:    [null,null,null,null,null,null,null],
  // Advanced per-lane hold colors (null = inherit from holdColors[i])
  holdBodyColors:    [null,null,null,null,null,null,null],
  holdBorderColors:  [null,null,null,null,null,null,null],
  holdStripeColors:  [null,null,null,null,null,null,null],
  holdTailCapColors: [null,null,null,null,null,null,null],
  holdTickColors:    [null,null,null,null,null,null,null],
  // Per-lane hit zone colors (null = inherit from laneColors[i])
  hitLineColors:     [null,null,null,null,null,null,null],
  hitGlowColors:     [null,null,null,null,null,null,null],
  hitFlashColors:    [null,null,null,null,null,null,null],
  hitBurstColors:    [null,null,null,null,null,null,null],
  hitRingColors:     [null,null,null,null,null,null,null],
  // Per-lane key box colors (null = inherit from laneColors[i])
  keyBoxBgColors:    [null,null,null,null,null,null,null],
  keyBoxBorderColors:[null,null,null,null,null,null,null],
  keyBoxTextColors:  [null,null,null,null,null,null,null],
  // Per-lane lane colors (null = inherit from laneColors[i])
  laneBorderColors:  [null,null,null,null,null,null,null],
  lanePressColors:   [null,null,null,null,null,null,null],
  // Celebration
  fcColor:           '#ffd040',
  pcSaturation:      100,        // 0–100
  comboEnabled:      true,
  comboText:         '{n} COMBO',
  milestones:        [
    { combo: 50,  text: '{n} COMBO!!', color: '#60ff90' },
    { combo: 100, text: '{n} COMBO!!', color: '#40c4ff' },
    { combo: 200, text: '{n} COMBO!!', color: '#c060ff' },
    { combo: 300, text: '{n} COMBO!!', color: '#ffd040' },
    { combo: 500, text: '{n} COMBO!!', color: '#ff4060' },
  ],
  // Typography
  fontFamily:        'monospace', // 'monospace' | 'sans-serif' | 'serif'
  // Live Overlay
  liveAccentColor:   '#c060ff',
  liveOpacity:       0.95,        // 0.3–1.0 background opacity
  liveBorderRadius:  6,           // 0–20 px
};

const PRESET_SKINS = [
  { ...DEFAULT_SKIN, name: 'Default', desc: 'Clean dark with purple accent' },
  {
    name:            'Neon',
    desc:            'Electric saturated glow',
    laneColors:      ['#ff00ff', '#00ffff', '#00ff00', '#ff6600', '#ff0066', '#ffff00', '#66ff00'],
    bgColor:         '#050510',
    hitLineColor:    '#ffffff',
    noteShape:       'rounded',
    noteGlow:        24,
    hitLineWidth:    2,
    keyBoxColor:     '#080812',
    comboColor:      '#00ffff',
    perfectColor:    '#ffff00',
    goodColor:       '#00ff00',
    missColor:       '#ff0066',
    fcColor:         '#00ffff',
    noteShine:       0.50,
    hitFlashIntensity: 1.5,
    noteApproachGlow: 28,
    liveAccentColor: '#00ffff',
    hpHighColor:     '#00ff00',
    hpMidColor:      '#ffff00',
    hpLowColor:      '#ff0066',
    hpBgColor:       '#080812',
    hpBorderColor:   '#301060',
    progressColors:  ['#ff00ff', '#00ffff', '#00ff00'],
  },
  {
    name:            'Pastel',
    desc:            'Soft desaturated warmth',
    laneColors:      ['#c8a0e8', '#90c8e8', '#a0d8b0', '#e0b898', '#e0a0b0', '#e0d098', '#b0d898'],
    bgColor:         '#181820',
    hitLineColor:    '#d0d0e0',
    noteShape:       'rounded',
    noteGlow:        6,
    hitLineWidth:    2,
    keyBoxColor:     '#101018',
    comboColor:      '#e0e0f0',
    perfectColor:    '#ffe0c0',
    goodColor:       '#a0d8b0',
    missColor:       '#e0a0b0',
    noteShine:       0.15,
    hitBurstIntensity: 0.7,
    fontFamily:      'sans-serif',
    songInfoColor:   '#484860',
    liveAccentColor: '#c8a0e8',
    hpHighColor:     '#a0d8b0',
    hpMidColor:      '#e0d098',
    hpLowColor:      '#e0a0b0',
    hpBgColor:       '#101018',
    hpBorderColor:   '#38384e',
    progressColors:  ['#c8a0e8', '#90c8e8', '#a0d8b0'],
  },
  {
    name:            'Midnight',
    desc:            'Ultra-dark muted jewels',
    laneColors:      ['#6040b0', '#3080a0', '#408060', '#a06030', '#a03050', '#a09030', '#60a030'],
    bgColor:         '#040408',
    hitLineColor:    '#606080',
    noteShape:       'sharp',
    noteGlow:        4,
    hitLineWidth:    1,
    keyBoxColor:     '#06060c',
    comboColor:      '#8080a0',
    perfectColor:    '#8090b0',
    goodColor:       '#408060',
    missColor:       '#a03050',
    scoreColor:      '#606080',
    noteShine:       0.10,
    hitBurstEnabled: false,
    hitRingEnabled:  false,
    hitFlashIntensity: 0.5,
    noteApproachGlow: 8,
    liveAccentColor: '#404080',
    hpHighColor:     '#408060',
    hpMidColor:      '#a09030',
    hpLowColor:      '#a03050',
    hpBgColor:       '#06060c',
    hpBorderColor:   '#1a1a30',
    progressColors:  ['#6040b0', '#3080a0', '#408060'],
  },
  {
    name:            'Synthwave',
    desc:            'Retro 80s sunset',
    laneColors:      ['#ff2090', '#ff6040', '#ffd040', '#ff8020', '#ff40a0', '#ff4060', '#e060ff'],
    bgColor:         '#0c0618',
    hitLineColor:    '#ff80c0',
    noteShape:       'rounded',
    noteGlow:        22,
    hitLineWidth:    2,
    keyBoxColor:     '#08040e',
    comboColor:      '#ff80c0',
    perfectColor:    '#ffd040',
    goodColor:       '#ff8040',
    missColor:       '#ff1060',
    fcColor:         '#ff2090',
    noteShine:       0.45,
    hitFlashIntensity: 1.4,
    noteApproachGlow: 26,
    liveAccentColor: '#ff2090',
    hpHighColor:     '#ffd040',
    hpMidColor:      '#ff8020',
    hpLowColor:      '#ff1060',
    hpBgColor:       '#08040e',
    hpBorderColor:   '#3a1860',
    progressColors:  ['#ff2090', '#ff6040', '#ffd040'],
  },
  {
    name:            'Sakura',
    desc:            'Cherry blossom pink',
    laneColors:      ['#f080a0', '#e0a8c0', '#98c8a0', '#e0c090', '#e87898', '#d0a0d0', '#b8d0a0'],
    bgColor:         '#120a10',
    hitLineColor:    '#e0c0d0',
    noteShape:       'rounded',
    noteGlow:        8,
    hitLineWidth:    2,
    keyBoxColor:     '#0c060a',
    comboColor:      '#f0e0ea',
    perfectColor:    '#f0c0d0',
    goodColor:       '#98c8a0',
    missColor:       '#e06080',
    fcColor:         '#f080a0',
    noteShine:       0.20,
    hitBurstIntensity: 0.8,
    noteApproachGlow: 14,
    liveAccentColor: '#f080a0',
    hpHighColor:     '#98c8a0',
    hpMidColor:      '#e0c090',
    hpLowColor:      '#e06080',
    hpBgColor:       '#0c060a',
    hpBorderColor:   '#3e2838',
    progressColors:  ['#f080a0', '#e0a8c0', '#98c8a0'],
  },
  {
    name:            'Terminal',
    desc:            'Green-on-black CRT',
    laneColors:      ['#30e830', '#20c060', '#40ff40', '#60d020', '#20e080', '#a0e020', '#30ff70'],
    bgColor:         '#000000',
    hitLineColor:    '#30e830',
    noteShape:       'sharp',
    noteGlow:        10,
    hitLineWidth:    1,
    keyBoxColor:     '#020402',
    comboColor:      '#40ff40',
    perfectColor:    '#80ff40',
    goodColor:       '#40ff40',
    missColor:       '#e04040',
    fcColor:         '#40ff40',
    noteShine:       0.15,
    hitBurstIntensity: 0.8,
    hitRingEnabled:  false,
    noteApproachGlow: 14,
    fontFamily:      'monospace',
    liveAccentColor: '#30e830',
    hpHighColor:     '#40ff40',
    hpMidColor:      '#a0e020',
    hpLowColor:      '#e04040',
    hpBgColor:       '#020402',
    hpBorderColor:   '#1a2a1a',
    progressColors:  ['#30e830', '#20c060', '#40ff40'],
  },
  {
    name:            'Cyber',
    desc:            'Cyberpunk yellow edge',
    laneColors:      ['#f0e020', '#00e8e8', '#00e860', '#ff2040', '#f0a000', '#e020e0', '#20f0a0'],
    bgColor:         '#08080a',
    hitLineColor:    '#f0e020',
    noteShape:       'sharp',
    noteGlow:        20,
    hitLineWidth:    2,
    keyBoxColor:     '#04040a',
    comboColor:      '#f0e020',
    perfectColor:    '#f0e020',
    goodColor:       '#00e860',
    missColor:       '#ff2040',
    fcColor:         '#00e8e8',
    noteShine:       0.40,
    hitFlashIntensity: 1.5,
    noteApproachGlow: 24,
    liveAccentColor: '#f0e020',
    hpHighColor:     '#00e860',
    hpMidColor:      '#f0e020',
    hpLowColor:      '#ff2040',
    hpBgColor:       '#04040a',
    hpBorderColor:   '#2a2a38',
    progressColors:  ['#f0e020', '#00e8e8', '#00e860'],
  },
  {
    name:            'Ember',
    desc:            'Smoldering fire warmth',
    laneColors:      ['#e06020', '#e09030', '#c0a030', '#e04020', '#ff6030', '#ffa030', '#c07020'],
    bgColor:         '#100804',
    hitLineColor:    '#e08040',
    noteShape:       'rounded',
    noteGlow:        18,
    hitLineWidth:    2,
    keyBoxColor:     '#0a0604',
    comboColor:      '#f0e0d0',
    perfectColor:    '#ffa030',
    goodColor:       '#c0a030',
    missColor:       '#e03020',
    fcColor:         '#e06020',
    noteShine:       0.35,
    hitFlashIntensity: 1.3,
    noteApproachGlow: 22,
    liveAccentColor: '#e06020',
    hpHighColor:     '#c0a030',
    hpMidColor:      '#e09030',
    hpLowColor:      '#e03020',
    hpBgColor:       '#0a0604',
    hpBorderColor:   '#3a2218',
    progressColors:  ['#e06020', '#e09030', '#c0a030'],
  },
  {
    name:            'Arctic',
    desc:            'Ice cold minimal',
    laneColors:      ['#60c0f0', '#80d8ff', '#a0e8d0', '#90b0d0', '#60a0d0', '#c0e0f0', '#70d0c0'],
    bgColor:         '#040608',
    hitLineColor:    '#a0c8e0',
    noteShape:       'sharp',
    noteGlow:        8,
    hitLineWidth:    1,
    keyBoxColor:     '#020406',
    comboColor:      '#e8f0f8',
    perfectColor:    '#c0e8ff',
    goodColor:       '#a0e8d0',
    missColor:       '#f06080',
    fcColor:         '#80d8ff',
    noteShine:       0.20,
    hitBurstIntensity: 0.8,
    noteApproachGlow: 12,
    liveAccentColor: '#60c0f0',
    hpHighColor:     '#a0e8d0',
    hpMidColor:      '#c0e0f0',
    hpLowColor:      '#f06080',
    hpBgColor:       '#020406',
    hpBorderColor:   '#1e2a34',
    progressColors:  ['#60c0f0', '#80d8ff', '#a0e8d0'],
  },
  {
    name:            'Vaporwave',
    desc:            'Dreamy pink and cyan',
    laneColors:      ['#ff60b0', '#60f0f0', '#b080ff', '#ff80d0', '#80c0ff', '#f0a0e0', '#60d0b0'],
    bgColor:         '#0a0812',
    hitLineColor:    '#d080e0',
    noteShape:       'rounded',
    noteGlow:        16,
    hitLineWidth:    2,
    keyBoxColor:     '#06040a',
    comboColor:      '#e8d8f8',
    perfectColor:    '#ff80d0',
    goodColor:       '#b080ff',
    missColor:       '#ff4080',
    fcColor:         '#60f0f0',
    noteShine:       0.30,
    noteApproachGlow: 20,
    liveAccentColor: '#ff60b0',
    hpHighColor:     '#b080ff',
    hpMidColor:      '#f0a0e0',
    hpLowColor:      '#ff4080',
    hpBgColor:       '#06040a',
    hpBorderColor:   '#302848',
    progressColors:  ['#ff60b0', '#60f0f0', '#b080ff'],
  },
  {
    name:            'Gold',
    desc:            'Luxurious black and gold',
    laneColors:      ['#d4a830', '#c0a040', '#a0b040', '#e0c050', '#b89028', '#d8b838', '#c0c040'],
    bgColor:         '#0a0804',
    hitLineColor:    '#c0a040',
    noteShape:       'rounded',
    noteGlow:        12,
    hitLineWidth:    2,
    keyBoxColor:     '#060402',
    comboColor:      '#f0e8d8',
    perfectColor:    '#e8c840',
    goodColor:       '#a0b040',
    missColor:       '#c04030',
    fcColor:         '#d4a830',
    noteShine:       0.50,
    hitBurstIntensity: 0.9,
    noteApproachGlow: 16,
    liveAccentColor: '#d4a830',
    hpHighColor:     '#a0b040',
    hpMidColor:      '#d4a830',
    hpLowColor:      '#c04030',
    hpBgColor:       '#060402',
    hpBorderColor:   '#30281a',
    progressColors:  ['#d4a830', '#c0a040', '#a0b040'],
  },
  {
    name:            'Toxic',
    desc:            'Radioactive acid glow',
    laneColors:      ['#40ff00', '#ff00c0', '#c0ff00', '#00ff80', '#ff4000', '#80ff00', '#e000ff'],
    bgColor:         '#020402',
    hitLineColor:    '#40ff00',
    noteShape:       'diamond',
    noteGlow:        26,
    hitLineWidth:    2,
    keyBoxColor:     '#010201',
    comboColor:      '#40ff00',
    perfectColor:    '#c0ff00',
    goodColor:       '#40ff00',
    missColor:       '#ff0060',
    fcColor:         '#ff00c0',
    noteShine:       0.35,
    hitFlashIntensity: 1.6,
    noteApproachGlow: 28,
    liveAccentColor: '#40ff00',
    hpHighColor:     '#40ff00',
    hpMidColor:      '#c0ff00',
    hpLowColor:      '#ff0060',
    hpBgColor:       '#010201',
    hpBorderColor:   '#1a2a18',
    progressColors:  ['#40ff00', '#ff00c0', '#c0ff00'],
  },
  {
    name:            'Ocean',
    desc:            'Deep sea bioluminescence',
    laneColors:      ['#00b8f0', '#00e8d0', '#40d8a0', '#2090c0', '#00a0e0', '#60d0d0', '#30c0b0'],
    bgColor:         '#020810',
    hitLineColor:    '#40a0d0',
    noteShape:       'circle',
    noteGlow:        22,
    hitLineWidth:    2,
    keyBoxColor:     '#010408',
    comboColor:      '#80e0ff',
    perfectColor:    '#60f0f0',
    goodColor:       '#40d8a0',
    missColor:       '#f06080',
    fcColor:         '#00e8d0',
    noteShine:       0.30,
    noteApproachGlow: 24,
    liveAccentColor: '#00b8f0',
    hpHighColor:     '#40d8a0',
    hpMidColor:      '#80d0e0',
    hpLowColor:      '#f06080',
    hpBgColor:       '#010408',
    hpBorderColor:   '#103050',
    progressColors:  ['#00b8f0', '#00e8d0', '#40d8a0'],
  },
  {
    name:            'Sunset',
    desc:            'Warm dusk horizon',
    laneColors:      ['#f08030', '#e06090', '#d0a050', '#f06040', '#e08060', '#f0c040', '#d07060'],
    bgColor:         '#10060a',
    hitLineColor:    '#e0a080',
    noteShape:       'rounded',
    noteGlow:        16,
    hitLineWidth:    2,
    keyBoxColor:     '#080408',
    comboColor:      '#f8e0d0',
    perfectColor:    '#ffc060',
    goodColor:       '#d0a050',
    missColor:       '#e04050',
    fcColor:         '#f08030',
    noteShine:       0.40,
    hitFlashIntensity: 1.3,
    noteApproachGlow: 20,
    liveAccentColor: '#f08030',
    hpHighColor:     '#d0a050',
    hpMidColor:      '#f0c040',
    hpLowColor:      '#e04050',
    hpBgColor:       '#080408',
    hpBorderColor:   '#402030',
    progressColors:  ['#f08030', '#e06090', '#d0a050'],
  },
  {
    name:            'Blood Moon',
    desc:            'Deep crimson eclipse',
    laneColors:      ['#e01030', '#c03050', '#d06040', '#b01030', '#e02040', '#c04040', '#d03030'],
    bgColor:         '#0a0204',
    hitLineColor:    '#c03040',
    noteShape:       'triangle',
    noteGlow:        20,
    hitLineWidth:    2,
    keyBoxColor:     '#060102',
    comboColor:      '#f0c0c8',
    perfectColor:    '#ff6060',
    goodColor:       '#d06040',
    missColor:       '#ff1040',
    fcColor:         '#e01030',
    noteShine:       0.35,
    hitFlashIntensity: 1.5,
    noteApproachGlow: 24,
    liveAccentColor: '#e01030',
    hpHighColor:     '#d06040',
    hpMidColor:      '#e08040',
    hpLowColor:      '#ff1040',
    hpBgColor:       '#060102',
    hpBorderColor:   '#3a1020',
    progressColors:  ['#e01030', '#c03050', '#d06040'],
  },
  {
    name:            'Forest',
    desc:            'Earthy woodland floor',
    laneColors:      ['#60a840', '#80b860', '#50c040', '#90a030', '#70b050', '#b0a040', '#60c060'],
    bgColor:         '#060804',
    hitLineColor:    '#70a050',
    noteShape:       'hexagon',
    noteGlow:        10,
    hitLineWidth:    2,
    keyBoxColor:     '#040602',
    comboColor:      '#c8e0c0',
    perfectColor:    '#a0e060',
    goodColor:       '#50c040',
    missColor:       '#c06040',
    fcColor:         '#60a840',
    noteShine:       0.20,
    hitBurstIntensity: 0.8,
    noteApproachGlow: 14,
    liveAccentColor: '#60a840',
    hpHighColor:     '#50c040',
    hpMidColor:      '#b0a040',
    hpLowColor:      '#c06040',
    hpBgColor:       '#040602',
    hpBorderColor:   '#283020',
    progressColors:  ['#60a840', '#80b860', '#50c040'],
  },
  {
    name:            'Lavender',
    desc:            'Soft purple dreams',
    laneColors:      ['#b080e0', '#9090e0', '#a0c0b0', '#c090d0', '#8888d0', '#d0b8e0', '#a0a0d0'],
    bgColor:         '#0c0810',
    hitLineColor:    '#b090c0',
    noteShape:       'rounded',
    noteGlow:        8,
    hitLineWidth:    2,
    keyBoxColor:     '#08060c',
    comboColor:      '#e0d8f0',
    perfectColor:    '#d0b0f0',
    goodColor:       '#a0c0b0',
    missColor:       '#d080a0',
    fcColor:         '#b080e0',
    noteShine:       0.20,
    hitBurstIntensity: 0.7,
    noteApproachGlow: 12,
    fontFamily:      'sans-serif',
    liveAccentColor: '#b080e0',
    hpHighColor:     '#a0c0b0',
    hpMidColor:      '#d0b8e0',
    hpLowColor:      '#d080a0',
    hpBgColor:       '#08060c',
    hpBorderColor:   '#302840',
    progressColors:  ['#b080e0', '#9090e0', '#a0c0b0'],
  },
  {
    name:            'Galaxy',
    desc:            'Deep space nebula',
    laneColors:      ['#8040e0', '#60a0ff', '#a080ff', '#b060d0', '#5080e0', '#c0a0ff', '#7060e0'],
    bgColor:         '#04020a',
    hitLineColor:    '#8060c0',
    noteShape:       'circle',
    noteGlow:        24,
    hitLineWidth:    2,
    keyBoxColor:     '#020108',
    comboColor:      '#d0c8f8',
    perfectColor:    '#c0a0ff',
    goodColor:       '#a080ff',
    missColor:       '#e040a0',
    fcColor:         '#60a0ff',
    noteShine:       0.35,
    hitFlashIntensity: 1.4,
    noteApproachGlow: 26,
    liveAccentColor: '#8040e0',
    hpHighColor:     '#a080ff',
    hpMidColor:      '#c0a0ff',
    hpLowColor:      '#e040a0',
    hpBgColor:       '#020108',
    hpBorderColor:   '#201840',
    progressColors:  ['#8040e0', '#60a0ff', '#a080ff'],
  },
  {
    name:            'Candy',
    desc:            'Sweet playful colors',
    laneColors:      ['#ff60c0', '#60d0ff', '#80ff80', '#ff80a0', '#a0e0ff', '#ffe060', '#80ffc0'],
    bgColor:         '#0e0810',
    hitLineColor:    '#f0a0d0',
    noteShape:       'circle',
    noteGlow:        18,
    hitLineWidth:    2,
    keyBoxColor:     '#08040a',
    comboColor:      '#fff0f8',
    perfectColor:    '#ffe080',
    goodColor:       '#80ff80',
    missColor:       '#ff6080',
    fcColor:         '#ff60c0',
    noteShine:       0.40,
    hitFlashIntensity: 1.3,
    noteApproachGlow: 22,
    liveAccentColor: '#ff60c0',
    hpHighColor:     '#80ff80',
    hpMidColor:      '#ffe060',
    hpLowColor:      '#ff6080',
    hpBgColor:       '#08040a',
    hpBorderColor:   '#342840',
    progressColors:  ['#ff60c0', '#60d0ff', '#80ff80'],
  },
  {
    name:            'Monochrome',
    desc:            'High contrast black and white',
    laneColors:      ['#ffffff', '#c0c0c0', '#a0a0a0', '#e0e0e0', '#b0b0b0', '#d8d8d8', '#909090'],
    bgColor:         '#000000',
    hitLineColor:    '#606060',
    noteShape:       'sharp',
    noteGlow:        6,
    hitLineWidth:    1,
    keyBoxColor:     '#080808',
    comboColor:      '#f8f8f8',
    perfectColor:    '#ffffff',
    goodColor:       '#c0c0c0',
    missColor:       '#606060',
    scoreColor:      '#a0a0a0',
    fcColor:         '#ffffff',
    noteShine:       0.15,
    hitBurstEnabled: true,
    hitRingEnabled:  false,
    hitFlashIntensity: 0.8,
    noteApproachGlow: 10,
    holdStripes:     false,
    liveAccentColor: '#ffffff',
    hpHighColor:     '#f8f8f8',
    hpMidColor:      '#a0a0a0',
    hpLowColor:      '#505050',
    hpBgColor:       '#080808',
    hpBorderColor:   '#303030',
    progressColors:  ['#ffffff', '#c0c0c0', '#a0a0a0'],
  },
  {
    name:            'Jade',
    desc:            'Polished green stone',
    laneColors:      ['#30c090', '#40b0a0', '#40e080', '#28a080', '#50c0a0', '#60d080', '#38b088'],
    bgColor:         '#020806',
    hitLineColor:    '#40a080',
    noteShape:       'hexagon',
    noteGlow:        12,
    hitLineWidth:    2,
    keyBoxColor:     '#010604',
    comboColor:      '#c0f0e0',
    perfectColor:    '#60f0b0',
    goodColor:       '#40e080',
    missColor:       '#c06060',
    fcColor:         '#30c090',
    noteShine:       0.30,
    noteApproachGlow: 16,
    liveAccentColor: '#30c090',
    hpHighColor:     '#40e080',
    hpMidColor:      '#90d080',
    hpLowColor:      '#c06060',
    hpBgColor:       '#010604',
    hpBorderColor:   '#18302a',
    progressColors:  ['#30c090', '#40b0a0', '#40e080'],
  },
  {
    name:            'Coral',
    desc:            'Warm reef tropics',
    laneColors:      ['#f07060', '#f0a080', '#e0b080', '#e06050', '#f08070', '#f0c060', '#e09070'],
    bgColor:         '#0a0608',
    hitLineColor:    '#e09080',
    noteShape:       'rounded',
    noteGlow:        14,
    hitLineWidth:    2,
    keyBoxColor:     '#060404',
    comboColor:      '#f8e8e0',
    perfectColor:    '#ffc080',
    goodColor:       '#e0b080',
    missColor:       '#e05050',
    fcColor:         '#f07060',
    noteShine:       0.35,
    hitFlashIntensity: 1.2,
    noteApproachGlow: 18,
    liveAccentColor: '#f07060',
    hpHighColor:     '#e0b080',
    hpMidColor:      '#f0c060',
    hpLowColor:      '#e05050',
    hpBgColor:       '#060404',
    hpBorderColor:   '#382030',
    progressColors:  ['#f07060', '#f0a080', '#e0b080'],
  },
  {
    name:            'Storm',
    desc:            'Thunderstorm lightning',
    laneColors:      ['#90a0c0', '#80b0e0', '#70a090', '#a0a8c0', '#6898c0', '#b0b8d0', '#78b0a0'],
    bgColor:         '#040408',
    hitLineColor:    '#8090a8',
    noteShape:       'arrow',
    noteGlow:        14,
    hitLineWidth:    2,
    keyBoxColor:     '#020204',
    comboColor:      '#d0d8e8',
    perfectColor:    '#e0e8ff',
    goodColor:       '#70a090',
    missColor:       '#c06080',
    fcColor:         '#80b0e0',
    noteShine:       0.20,
    hitFlashIntensity: 1.6,
    noteApproachGlow: 18,
    liveAccentColor: '#90a0c0',
    hpHighColor:     '#70a090',
    hpMidColor:      '#b0b8d0',
    hpLowColor:      '#c06080',
    hpBgColor:       '#020204',
    hpBorderColor:   '#20202e',
    progressColors:  ['#90a0c0', '#80b0e0', '#70a090'],
  },
  {
    name:            'Cherry',
    desc:            'Bold crimson pop',
    laneColors:      ['#f02060', '#ff6090', '#e08070', '#d01850', '#f04070', '#f0a080', '#e05060'],
    bgColor:         '#0a0406',
    hitLineColor:    '#e04060',
    noteShape:       'rounded',
    noteGlow:        18,
    hitLineWidth:    2,
    keyBoxColor:     '#060204',
    comboColor:      '#f8e0e8',
    perfectColor:    '#ff80a0',
    goodColor:       '#e08070',
    missColor:       '#ff1040',
    fcColor:         '#f02060',
    noteShine:       0.35,
    hitFlashIntensity: 1.4,
    noteApproachGlow: 22,
    liveAccentColor: '#f02060',
    hpHighColor:     '#e08070',
    hpMidColor:      '#f0a080',
    hpLowColor:      '#ff1040',
    hpBgColor:       '#060204',
    hpBorderColor:   '#381822',
    progressColors:  ['#f02060', '#ff6090', '#e08070'],
  },
  {
    name:            'Rainbow',
    desc:            'Full spectrum ROYGBIV',
    laneColors:      ['#ff2020', '#ff8020', '#ffe030', '#20e060', '#2080ff', '#6040e0', '#c030ff'],
    bgColor:         '#0a0a14',
    hitLineColor:    '#ffffff',
    noteShape:       'rounded',
    noteGlow:        20,
    hitLineWidth:    2,
    keyBoxColor:     '#060610',
    comboColor:      '#ffffff',
    perfectColor:    '#ffe040',
    goodColor:       '#40ff80',
    missColor:       '#ff4040',
    fcColor:         '#ff8020',
    noteShine:       0.40,
    hitFlashIntensity: 1.3,
    noteApproachGlow: 20,
    liveAccentColor: '#ff2020',
    hpHighColor:     '#40ff60',
    hpMidColor:      '#ffe040',
    hpLowColor:      '#ff4040',
    hpBgColor:       '#08080e',
    hpBorderColor:   '#28283e',
    progressColors:  ['#ff2020', '#20e060', '#6040e0'],
  },
  {
    name:            'Desert',
    desc:            'Sandy dunes and terra cotta',
    laneColors:      ['#c89860', '#b08050', '#d8b878', '#a07040', '#c0a068', '#d0b080', '#b89058'],
    bgColor:         '#0c0806',
    hitLineColor:    '#b09060',
    noteShape:       'rounded',
    noteGlow:        8,
    hitLineWidth:    2,
    keyBoxColor:     '#080604',
    comboColor:      '#e8dcc8',
    perfectColor:    '#e0c080',
    goodColor:       '#b0a060',
    missColor:       '#a05030',
    fcColor:         '#c89860',
    noteShine:       0.30,
    noteApproachGlow: 12,
    liveAccentColor: '#c89860',
    hpHighColor:     '#b0a060',
    hpMidColor:      '#d0a050',
    hpLowColor:      '#a05030',
    hpBgColor:       '#080604',
    hpBorderColor:   '#302818',
    progressColors:  ['#c89860', '#b08050', '#d8b878'],
  },
  {
    name:            'Aurora',
    desc:            'Northern lights shimmer',
    laneColors:      ['#40e890', '#30d0b0', '#40b0e0', '#6080e0', '#8060d0', '#a040c0', '#60f0a0'],
    bgColor:         '#020610',
    hitLineColor:    '#40c0a0',
    noteShape:       'rounded',
    noteGlow:        18,
    hitLineWidth:    2,
    keyBoxColor:     '#010408',
    comboColor:      '#c0f0e0',
    perfectColor:    '#60f0c0',
    goodColor:       '#40c0a0',
    missColor:       '#d04080',
    fcColor:         '#40e890',
    noteShine:       0.25,
    noteApproachGlow: 22,
    liveAccentColor: '#40e890',
    hpHighColor:     '#40e890',
    hpMidColor:      '#60b0e0',
    hpLowColor:      '#d04080',
    hpBgColor:       '#010408',
    hpBorderColor:   '#18283a',
    progressColors:  ['#40e890', '#40b0e0', '#8060d0'],
  },
  {
    name:            'Firefly',
    desc:            'Summer night bioluminescence',
    laneColors:      ['#c0d020', '#a0c030', '#e0e040', '#80b020', '#d0c030', '#b0d040', '#90c020'],
    bgColor:         '#060804',
    hitLineColor:    '#a0b030',
    noteShape:       'circle',
    noteGlow:        22,
    hitLineWidth:    2,
    keyBoxColor:     '#040602',
    comboColor:      '#e0e8c0',
    perfectColor:    '#e0e040',
    goodColor:       '#a0c030',
    missColor:       '#c05040',
    fcColor:         '#c0d020',
    noteShine:       0.30,
    noteApproachGlow: 24,
    liveAccentColor: '#c0d020',
    hpHighColor:     '#a0c030',
    hpMidColor:      '#d0c030',
    hpLowColor:      '#c05040',
    hpBgColor:       '#040602',
    hpBorderColor:   '#242a18',
    progressColors:  ['#c0d020', '#a0c030', '#e0e040'],
  },
  {
    name:            'Cobalt',
    desc:            'Rich deep blue intensity',
    laneColors:      ['#3060e0', '#2050c0', '#4080ff', '#1840a0', '#3070f0', '#5090ff', '#2060d0'],
    bgColor:         '#020410',
    hitLineColor:    '#4070d0',
    noteShape:       'sharp',
    noteGlow:        16,
    hitLineWidth:    2,
    keyBoxColor:     '#010308',
    comboColor:      '#c0d0f8',
    perfectColor:    '#80b0ff',
    goodColor:       '#4080f0',
    missColor:       '#e04060',
    fcColor:         '#4080ff',
    noteShine:       0.35,
    hitFlashIntensity: 1.2,
    noteApproachGlow: 20,
    liveAccentColor: '#3060e0',
    hpHighColor:     '#4080f0',
    hpMidColor:      '#80a0e0',
    hpLowColor:      '#e04060',
    hpBgColor:       '#010308',
    hpBorderColor:   '#182040',
    progressColors:  ['#3060e0', '#4080ff', '#5090ff'],
  },
  {
    name:            'Glass',
    desc:            'Frosted translucent panes',
    laneColors:      ['#c0d0e0', '#d0c8e0', '#c8d8d0', '#d8d0c0', '#b8c8d8', '#d0d8e0', '#c8d0d0'],
    bgColor:         '#080a0e',
    hitLineColor:    '#a0b0c0',
    noteShape:       'sharp',
    noteGlow:        24,
    hitLineWidth:    1,
    keyBoxColor:     '#060810',
    comboColor:      '#e0e8f0',
    perfectColor:    '#e0f0ff',
    goodColor:       '#c0d8e0',
    missColor:       '#a08090',
    scoreColor:      '#b0b8c8',
    fcColor:         '#d0e0f0',
    noteShine:       0.50,
    noteBorderWidth: 1,
    hitBurstIntensity: 0.6,
    noteApproachGlow: 18,
    liveAccentColor: '#c0d0e0',
    hpHighColor:     '#c0d8e0',
    hpMidColor:      '#d0c8b0',
    hpLowColor:      '#a08090',
    hpBgColor:       '#060810',
    hpBorderColor:   '#283040',
    progressColors:  ['#c0d0e0', '#d0c8e0', '#c8d8d0'],
  },
  {
    name:            'Sunrise',
    desc:            'Dawn sky purple to gold',
    laneColors:      ['#4030a0', '#8040c0', '#e060a0', '#f08060', '#f0a040', '#f0c030', '#ffe040'],
    bgColor:         '#080410',
    hitLineColor:    '#d080a0',
    noteShape:       'rounded',
    noteGlow:        16,
    hitLineWidth:    2,
    keyBoxColor:     '#060210',
    comboColor:      '#f0e0d0',
    perfectColor:    '#f0c060',
    goodColor:       '#e080a0',
    missColor:       '#4030a0',
    fcColor:         '#ffe040',
    noteShine:       0.35,
    hitFlashIntensity: 1.2,
    noteApproachGlow: 18,
    liveAccentColor: '#f08060',
    hpHighColor:     '#f0a040',
    hpMidColor:      '#e060a0',
    hpLowColor:      '#4030a0',
    hpBgColor:       '#060210',
    hpBorderColor:   '#302040',
    progressColors:  ['#4030a0', '#f08060', '#ffe040'],
  },
  {
    name:            'Opal',
    desc:            'Iridescent gemstone shimmer',
    laneColors:      ['#e0a0c0', '#a0d0e0', '#c0e0a0', '#e0c0a0', '#a0b0e0', '#d0a0e0', '#a0e0c0'],
    bgColor:         '#0c0a10',
    hitLineColor:    '#c0b0d0',
    noteShape:       'diamond',
    noteGlow:        14,
    hitLineWidth:    2,
    keyBoxColor:     '#08060c',
    comboColor:      '#f0e8f8',
    perfectColor:    '#e8d0f0',
    goodColor:       '#a0d8c0',
    missColor:       '#c08090',
    fcColor:         '#d0a0e0',
    noteShine:       0.50,
    hitBurstIntensity: 0.9,
    noteApproachGlow: 16,
    liveAccentColor: '#d0a0e0',
    hpHighColor:     '#a0d8c0',
    hpMidColor:      '#e0c0a0',
    hpLowColor:      '#c08090',
    hpBgColor:       '#08060c',
    hpBorderColor:   '#302838',
    progressColors:  ['#e0a0c0', '#a0d0e0', '#c0e0a0'],
  },
  {
    name:            'Crimson',
    desc:            'Deep luxurious red velvet',
    laneColors:      ['#d01020', '#b01830', '#e02030', '#c00820', '#d81028', '#a01020', '#e01838'],
    bgColor:         '#0a0204',
    hitLineColor:    '#c02030',
    noteShape:       'sharp',
    noteGlow:        18,
    hitLineWidth:    2,
    keyBoxColor:     '#080104',
    comboColor:      '#f0d0d8',
    perfectColor:    '#ff6070',
    goodColor:       '#d04050',
    missColor:       '#401018',
    scoreColor:      '#e0a0a0',
    fcColor:         '#e02030',
    noteShine:       0.35,
    hitFlashIntensity: 1.4,
    noteApproachGlow: 20,
    liveAccentColor: '#d01020',
    hpHighColor:     '#d04050',
    hpMidColor:      '#c03040',
    hpLowColor:      '#401018',
    hpBgColor:       '#080104',
    hpBorderColor:   '#381018',
    progressColors:  ['#d01020', '#e02030', '#b01830'],
  },
];

// Returns the merged skin (custom over default)
function applySkin(skinObj) {
  if (!skinObj) return { ...DEFAULT_SKIN };
  const merged = {
    ...DEFAULT_SKIN,
    ...skinObj,
    laneColors: skinObj.laneColors
      ? skinObj.laneColors.concat(DEFAULT_SKIN.laneColors.slice(skinObj.laneColors.length))
      : DEFAULT_SKIN.laneColors,
  };
  if (skinObj.milestones) {
    merged.milestones = skinObj.milestones.map(m => ({ ...m }));
  } else {
    merged.milestones = DEFAULT_SKIN.milestones.map(m => ({ ...m }));
  }
  if (skinObj.progressColors && skinObj.progressColors.length >= 3) {
    merged.progressColors = skinObj.progressColors.slice(0, 3);
  }
  if (skinObj.missNoteColors) {
    merged.missNoteColors = skinObj.missNoteColors.concat(
      DEFAULT_SKIN.missNoteColors.slice(skinObj.missNoteColors.length)
    );
  }
  // Merge per-lane color arrays (null-padded to 7)
  const _nullArr7 = [null,null,null,null,null,null,null];
  [
    'noteColors','holdColors',
    'noteBorderColors','noteShineColors','noteGlowColors',
    'holdBodyColors','holdBorderColors','holdStripeColors','holdTailCapColors','holdTickColors',
    'hitLineColors','hitGlowColors','hitFlashColors','hitBurstColors','hitRingColors',
    'keyBoxBgColors','keyBoxBorderColors','keyBoxTextColors',
    'laneBorderColors','lanePressColors',
  ].forEach(key => {
    const src = skinObj[key];
    if (src && Array.isArray(src)) {
      merged[key] = src.concat(_nullArr7.slice(src.length));
    } else {
      merged[key] = _nullArr7.slice();
    }
  });
  return merged;
}
