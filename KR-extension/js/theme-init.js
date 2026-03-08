// Early theme application to prevent FOUC (flash of unstyled content).
// Loaded in <head> before body renders so CSS custom properties are set immediately.
try {
  var _t = JSON.parse(localStorage.getItem('keyrhythm_ui_layout')).theme;
  if (_t) {
    var _s = document.documentElement.style;
    for (var _k in _t) if (_t[_k]) _s.setProperty(_k, _t[_k]);
    // Generate select arrow SVGs from theme colors (can't use CSS vars in data URIs)
    var _dim = _t['--text-dim'];
    var _acc = _t['--accent'];
    if (_dim || _acc) {
      var _arrow = function(c) {
        return "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7' fill='none' stroke='" + encodeURIComponent(c) + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M1 1l5 5 5-5'/%3E%3C/svg%3E\")";
      };
      if (_dim) _s.setProperty('--select-arrow', _arrow(_dim));
      if (_acc) _s.setProperty('--select-arrow-active', _arrow(_acc));
    }
  }
} catch (_) {}
