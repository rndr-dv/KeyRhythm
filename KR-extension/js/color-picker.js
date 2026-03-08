(function() {
  'use strict';

  const RECENT_KEY = 'kr_recent_colors';
  const MAX_RECENT = 12;

  function getRecentColors() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
    catch (_) { return []; }
  }

  function addRecentColor(hex) {
    let recent = getRecentColors();
    recent = recent.filter(c => c !== hex);
    recent.unshift(hex);
    if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (_) {}
  }

  // Normalize HEXA (8-char #RRGGBBAA):
  //   Full opacity → 6-char hex (#RRGGBB)
  //   Partial opacity → rgba(R, G, B, A) string
  function normalizeHex(hexa) {
    if (hexa.length === 9) {
      var aa = hexa.slice(7).toUpperCase();
      if (aa === 'FF') return hexa.slice(0, 7);
      var r = parseInt(hexa.slice(1, 3), 16);
      var g = parseInt(hexa.slice(3, 5), 16);
      var b = parseInt(hexa.slice(5, 7), 16);
      var a = Math.round((parseInt(aa, 16) / 255) * 100) / 100;
      return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
    }
    return hexa;
  }

  // Convert any CSS color to 6-char hex. Handles #hex, rgb(), rgba().
  function toHex6(val) {
    if (!val || typeof val !== 'string') return '#000000';
    val = val.trim();
    // Already 4/7-char hex
    if (/^#([0-9a-f]{3}){1,2}$/i.test(val)) return val.length === 4
      ? '#' + val[1]+val[1] + val[2]+val[2] + val[3]+val[3]
      : val;
    // 9-char hex (#RRGGBBAA) — drop alpha
    if (/^#[0-9a-f]{8}$/i.test(val)) return val.slice(0, 7);
    // rgb/rgba
    var m = val.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
    if (m) return '#' + [m[1], m[2], m[3]].map(function(v) {
      return (+v).toString(16).padStart(2, '0');
    }).join('');
    return val;
  }

  function initColorPicker(container, opts) {
    opts = Object.assign({
      color: '#000000',
      opacity: true,
      swatches: null,
      onChange: null,
      onSave: null,
    }, opts);

    var btn = document.createElement('button');
    btn.className = 'kr-color-swatch';
    btn.style.backgroundColor = opts.color;
    btn.type = 'button';
    container.appendChild(btn);

    var swatches = opts.swatches || getRecentColors();

    var pickr = Pickr.create({
      el: btn,
      theme: 'monolith',
      useAsButton: true,
      default: opts.color,
      defaultRepresentation: 'HEXA',
      position: 'bottom-middle',
      adjustableNumbers: true,
      swatches: swatches,
      components: {
        preview: true,
        opacity: opts.opacity,
        hue: true,
        interaction: {
          hex: true,
          rgba: true,
          input: true,
          save: true,
        },
      },
    });

    pickr.on('change', function(color) {
      var hex = normalizeHex(color.toHEXA().toString());
      btn.style.backgroundColor = hex;
      if (opts.onChange) opts.onChange(hex);
    });

    pickr.on('save', function(color) {
      if (!color) return;
      var hex = normalizeHex(color.toHEXA().toString());
      addRecentColor(hex);
      pickr.hide();
      if (opts.onSave) opts.onSave(hex);
    });

    return {
      setColor: function(c) {
        pickr.setColor(c);
        btn.style.backgroundColor = c;
      },
      getColor: function() {
        return normalizeHex(pickr.getColor().toHEXA().toString());
      },
      destroy: function() {
        pickr.destroyAndRemove();
      },
      pickr: pickr,
      el: btn,
    };
  }

  // ── Gradient helpers ─────────────────────────────────────────────────────────

  function isGradient(val) {
    return typeof val === 'string' && /gradient\(/.test(val.trim());
  }

  // Parse a CSS gradient string into { angle, stops: [{ color, pos }] }
  function parseGradientString(str) {
    str = (str || '').trim();
    var m = str.match(/^linear-gradient\((\d+)deg\s*,\s*(.*)\)$/);
    if (!m) return null;
    var angle = parseInt(m[1]);
    var parts = m[2].split(/,\s*(?=[#a-zA-Z(])/);
    var stops = [];
    parts.forEach(function(part) {
      part = part.trim();
      var pm = part.match(/^(.+?)\s+(\d+)%$/);
      if (pm) stops.push({ color: pm[1].trim(), pos: parseInt(pm[2]) / 100 });
      else stops.push({ color: part, pos: -1 });
    });
    if (stops.length > 0) {
      if (stops[0].pos === -1) stops[0].pos = 0;
      if (stops[stops.length - 1].pos === -1) stops[stops.length - 1].pos = 1;
      for (var i = 0; i < stops.length; i++) {
        if (stops[i].pos === -1) {
          var prev = stops[i - 1].pos;
          var ni = i + 1;
          while (ni < stops.length && stops[ni].pos === -1) ni++;
          stops[i].pos = prev + (stops[ni].pos - prev) / (ni - i + 1);
        }
      }
    }
    return { angle: angle, stops: stops };
  }

  // Extract a solid hex color from any value (gradient string → first stop hex).
  function resolveColor(val, fallback) {
    if (!val) return fallback || '#000000';
    if (!isGradient(val)) return toHex6(val);
    var parsed = parseGradientString(val);
    var color = parsed && parsed.stops[0] ? parsed.stops[0].color : fallback || '#000000';
    return toHex6(color);
  }

  // ── Gradient-aware color picker ─────────────────────────────────────────────
  // If the initial color is a CSS gradient string, extracts the first stop hex.
  // Returns a standard Pickr swatch.
  function initGradientPicker(container, opts) {
    var color = resolveColor(opts.color, '#000000');
    return initColorPicker(container, {
      color: color,
      opacity: false,
      onChange: opts.onChange,
      onSave: opts.onSave,
    });
  }

  // ── Gradient-to-canvas utility ──────────────────────────────────────────────
  function cssGradientToCanvas(ctx, value, x0, y0, x1, y1) {
    if (!isGradient(value)) return value;
    var parsed = parseGradientString(value);
    if (!parsed) return value;
    var rad = (parsed.angle - 90) * Math.PI / 180;
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var len = Math.max(x1 - x0, y1 - y0) / 2;
    var grad = ctx.createLinearGradient(
      cx - Math.cos(rad) * len, cy - Math.sin(rad) * len,
      cx + Math.cos(rad) * len, cy + Math.sin(rad) * len
    );
    parsed.stops.forEach(function(s) {
      grad.addColorStop(Math.max(0, Math.min(1, s.pos)), s.color);
    });
    return grad;
  }

  window.initColorPicker = initColorPicker;
  window.initGradientPicker = initGradientPicker;
  window.getRecentColors = getRecentColors;
  window.isGradient = isGradient;
  window.resolveColor = resolveColor;
  window.toHex6 = toHex6;
  window.cssGradientToCanvas = cssGradientToCanvas;
  window.parseGradientString = parseGradientString;
})();
