// KeyRhythm — Custom UI components (selects + tooltips)
// Load LAST in all pages so DOM is ready.
(function() {
  'use strict';

  // Prevent interactive elements from retaining focus (avoids Space/Enter re-triggering them)
  document.addEventListener('mouseup', e => {
    if (e.target.matches('button, input[type="range"], input[type="checkbox"]')) e.target.blur();
  });

  const vDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const iDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  const dDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'disabled');

  // ── Custom Select Dropdowns ─────────────────────────────────────────────────
  function initCustomSelects(root) {
    (root || document).querySelectorAll('select:not(._kr)').forEach(function(sel) {
      sel.classList.add('_kr');

      var isExport = sel.classList.contains('export-sel');

      var wrap = document.createElement('div');
      wrap.className = 'kr-sel';

      if (isExport) {
        wrap.classList.add('kr-export');
        // Transfer width from inline style or parent context
        if (sel.style.width) wrap.style.width = sel.style.width;
      } else {
        // Transfer layout from select → wrapper
        var inRow    = sel.closest('.setting-row');
        var inBpm    = sel.closest('.editor-bpm-bar');
        var inPreset = sel.closest('.preset-row');

        if (inRow || sel.classList.contains('select-flex') || inPreset) {
          wrap.style.flex = '1';
          wrap.style.minWidth = '0';
        }
        if (sel.classList.contains('select-full') || sel.classList.contains('ag-select')) {
          wrap.style.width = '100%';
        }
        if (sel.style.width) wrap.style.width = sel.style.width;
        if (sel.style.flex)  wrap.style.flex  = sel.style.flex;

        // Size variant
        if (sel.classList.contains('select-sm') || inRow || inBpm) {
          wrap.classList.add('sm');
        }
      }

      // Trigger button
      var trig = document.createElement('div');
      trig.className = 'kr-sel-t';
      trig.tabIndex  = sel.disabled ? -1 : 0;
      if (sel.title) trig.title = sel.title;

      if (isExport) {
        // Transfer btn color variant as e-* class
        if (sel.classList.contains('btn-dim'))   trig.classList.add('e-dim');
        if (sel.classList.contains('btn-cyan'))  trig.classList.add('e-cyan');
        if (sel.classList.contains('btn-green')) trig.classList.add('e-green');
        if (sel.classList.contains('btn-red'))   trig.classList.add('e-red');
      }

      // Dropdown panel
      var drop = document.createElement('div');
      drop.className = 'kr-sel-d';

      function build() {
        drop.innerHTML = '';
        for (var j = 0; j < sel.options.length; j++) {
          (function(opt, idx) {
            // Skip the placeholder option for export selects
            if (isExport && idx === 0 && !opt.value) return;
            var d = document.createElement('div');
            d.className = 'kr-sel-o' + (opt.selected && opt.value ? ' sel' : '');
            d.textContent = opt.textContent;
            d.dataset.v = opt.value;
            d.addEventListener('mousedown', function(e) {
              e.preventDefault();
              e.stopPropagation();
              vDesc.set.call(sel, opt.value);
              sync();
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              close();
            });
            drop.appendChild(d);
          })(sel.options[j], j);
        }
      }

      function sync() {
        var idx = iDesc.get.call(sel);
        var opt = sel.options[idx];
        if (isExport) {
          // Always show the first option's text (the placeholder)
          trig.textContent = sel.options[0] ? sel.options[0].textContent : '';
        } else {
          trig.textContent = opt ? opt.textContent : '';
        }
        var cur = vDesc.get.call(sel);
        for (var k = 0; k < drop.children.length; k++) {
          drop.children[k].classList.toggle('sel', drop.children[k].dataset.v === cur);
        }
      }

      function open() {
        if (dDesc.get.call(sel)) return;
        // Close all other dropdowns
        document.querySelectorAll('.kr-sel.open').forEach(function(w) { w.classList.remove('open'); });
        build();
        wrap.classList.add('open');
        requestAnimationFrame(function() {
          var r = drop.getBoundingClientRect();
          drop.classList.toggle('above', r.bottom > window.innerHeight && r.top > r.height);
          var s = drop.querySelector('.sel');
          if (s) s.scrollIntoView({ block: 'nearest' });
        });
      }

      function close() { wrap.classList.remove('open'); }

      trig.addEventListener('mousedown', function(e) {
        e.preventDefault();
        e.stopPropagation();
        wrap.classList.contains('open') ? close() : open();
      });

      // Close on outside click — handled by single delegated listener below
      wrap._krClose = close;

      trig.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          wrap.classList.contains('open') ? close() : open();
        } else if (e.key === 'Escape') {
          close();
        } else if (!isExport && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          e.preventDefault();
          var idx = iDesc.get.call(sel) + (e.key === 'ArrowDown' ? 1 : -1);
          if (idx >= 0 && idx < sel.options.length) {
            iDesc.set.call(sel, idx);
            sync();
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });

      // Intercept programmatic value/selectedIndex/disabled changes
      Object.defineProperty(sel, 'value', {
        get: function() { return vDesc.get.call(this); },
        set: function(v) { vDesc.set.call(this, v); sync(); }
      });
      Object.defineProperty(sel, 'selectedIndex', {
        get: function() { return iDesc.get.call(this); },
        set: function(v) { iDesc.set.call(this, v); sync(); }
      });
      Object.defineProperty(sel, 'disabled', {
        get: function() { return dDesc.get.call(this); },
        set: function(v) { dDesc.set.call(this, v); trig.classList.toggle('disabled', !!v); trig.tabIndex = v ? -1 : 0; }
      });

      // Insert wrapper into DOM
      sel.parentNode.insertBefore(wrap, sel);
      wrap.appendChild(trig);
      wrap.appendChild(drop);
      wrap.appendChild(sel);
      sel.style.display = 'none';

      build();
      sync();

      // Public API for external rebuild/sync
      sel._krSync    = sync;
      sel._krRebuild = function() { build(); sync(); };
    });
  }

  // ── Single delegated listener to close all open custom selects on outside click
  document.addEventListener('mousedown', function(e) {
    document.querySelectorAll('.kr-sel.open').forEach(function(wrap) {
      if (!wrap.contains(e.target) && wrap._krClose) wrap._krClose();
    });
  });

  // ── Custom Tooltips (JS-positioned floating div) ─────────────────────────────
  var _tipEl = null;
  var _tipOwner = null;

  function _ensureTipEl() {
    if (!_tipEl) {
      _tipEl = document.createElement('div');
      _tipEl.className = 'kr-tip';
      document.body.appendChild(_tipEl);
    }
    return _tipEl;
  }

  function initTooltips(root) {
    (root || document).querySelectorAll('[title]:not(._krt)').forEach(function(el) {
      if (el.style.display === 'none') return;
      var t = el.getAttribute('title');
      if (!t) return;
      el.classList.add('_krt');
      el.addEventListener('mouseenter', _tipShow);
      el.addEventListener('mouseleave', _tipHide);
      el.addEventListener('mousedown',  _tipHide);
    });
  }

  function _tipShow() {
    // Check hide setting (exempt .song-title elements — always show full name)
    if (typeof getSettings === 'function' && !this.classList.contains('song-title')) {
      var s = getSettings();
      if (s.hideTooltips) return;
    }

    var t = this.getAttribute('title');
    if (t) {
      this.dataset.tip = t;
      this.removeAttribute('title');
    }
    t = this.dataset.tip;
    if (!t) return;

    var tip = _ensureTipEl();
    _tipOwner = this;
    tip.textContent = t;
    tip.style.left = '-9999px';
    tip.style.top = '0';
    tip.style.display = 'block';
    tip.style.opacity = '0';

    var self = this;
    requestAnimationFrame(function() {
      if (_tipOwner !== self) return;
      var rect = self.getBoundingClientRect();
      var tipR = tip.getBoundingClientRect();

      var left = rect.left + rect.width / 2;
      var top  = rect.top - tipR.height - 8;

      // Show below if doesn't fit above
      if (top < 4) {
        top = rect.bottom + 8;
      }

      // Clamp horizontally
      var halfW = tipR.width / 2;
      if (left - halfW < 4) left = 4 + halfW;
      if (left + halfW > window.innerWidth - 4) left = window.innerWidth - 4 - halfW;

      tip.style.left = left + 'px';
      tip.style.top  = top + 'px';
      tip.style.opacity = '1';
    });
  }

  function _tipHide() {
    var t = this.dataset.tip;
    if (t) {
      this.setAttribute('title', t);
      delete this.dataset.tip;
    }
    if (_tipEl) {
      _tipEl.style.display = 'none';
      _tipEl.style.opacity = '0';
    }
    _tipOwner = null;
  }

  // ── Editable Slider Inputs ───────────────────────────────────────────────────
  // Adds a number input next to each range slider, synced bidirectionally.
  function initSliderInputs() {
    document.querySelectorAll('input[type="range"]').forEach(function(slider) {
      if (slider.id === 'seekBar' || slider.dataset.sliderInit) return;
      slider.dataset.sliderInit = '1';

      // --- Find the associated value <span> ---
      var valSpan = null;

      // Strategy 1: next sibling is a <span> with an id
      var next = slider.nextElementSibling;
      if (next && next.tagName === 'SPAN' && next.id) {
        valSpan = next;
      }

      // Strategy 2: search parent group for a <span id> containing a number
      if (!valSpan) {
        var group = slider.closest('.control-group, .setting-row, .ag-slider, .ag-field, .bpm-group');
        if (group) {
          var spans = group.querySelectorAll('span[id]');
          for (var i = 0; i < spans.length; i++) {
            var t = spans[i].textContent.trim();
            if (/^[0-9+\-.]/.test(t) && t.length < 20) {
              valSpan = spans[i];
              break;
            }
          }
        }
      }

      if (!valSpan) return;

      // --- Detect unit from current span text ---
      var text = valSpan.textContent.trim();
      var unit = '';
      var isPct = false;
      if (text.endsWith('%'))  { unit = '%'; isPct = true; }
      else if (text.endsWith('ms')) { unit = 'ms'; }
      else if (text.endsWith('/s')) { unit = '/s'; }
      else if (text.endsWith('×'))  { unit = '×'; }
      else if (/\dx$/.test(text))   { unit = '×'; }  // "1.0x"

      // --- Parse initial display value ---
      var match = text.match(/([+\-]?\d*\.?\d+)/);
      var initVal = match ? parseFloat(match[1]) : parseFloat(slider.value);

      // --- Create number input ---
      var numInput = document.createElement('input');
      numInput.type = 'number';
      numInput.className = 'slider-num';
      numInput.value = initVal;
      numInput.step = 'any';

      // Hide the original span
      valSpan.style.display = 'none';

      // Create suffix label if there's a unit
      var suffix = null;
      if (unit) {
        suffix = document.createElement('span');
        suffix.className = 'slider-suffix';
        suffix.textContent = unit;
      }

      // Insert after the hidden span
      if (suffix) valSpan.after(numInput, suffix);
      else        valSpan.after(numInput);

      // --- Sync: span text changes → update input ---
      var observer = new MutationObserver(function() {
        var t = valSpan.textContent.trim();
        var m = t.match(/([+\-]?\d*\.?\d+)/);
        if (m) numInput.value = parseFloat(m[1]);
      });
      observer.observe(valSpan, { childList: true, characterData: true, subtree: true });

      // --- Sync: input → slider → existing handler ---
      var sMin = parseFloat(slider.min);
      var sMax = parseFloat(slider.max);

      function applyInput() {
        var v = parseFloat(numInput.value);
        if (isNaN(v)) return;
        var sliderVal = isPct ? v / 100 : v;
        slider.value = Math.max(sMin, Math.min(sMax, sliderVal));
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      }

      numInput.addEventListener('change', applyInput);
      numInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); applyInput(); numInput.blur(); }
      });
    });
  }

  // ── App background (image, animated image, or video — applied on every page)
  var _appBgObjectUrl = null; // track for cleanup

  function _applyAppBgStyles(el, s) {
    var opacity = s.appBgImageOpacity !== undefined ? s.appBgImageOpacity : 0.3;
    var sat     = s.appBgImageSaturation !== undefined ? s.appBgImageSaturation : 100;
    var blur    = s.appBgImageBlur !== undefined ? s.appBgImageBlur : 0;
    el.style.opacity = opacity;
    var filters = [];
    if (sat !== 100) filters.push('saturate(' + sat + '%)');
    if (blur > 0)    filters.push('blur(' + blur + 'px)');
    el.style.filter = filters.length ? filters.join(' ') : 'none';
  }

  function _removeAppBg() {
    var old = document.getElementById('_krAppBg');
    if (old) old.remove();
    if (_appBgObjectUrl) { URL.revokeObjectURL(_appBgObjectUrl); _appBgObjectUrl = null; }
  }

  function _createMediaElement(tag, src) {
    var el = document.createElement(tag);
    el.id = '_krAppBg';
    el.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;object-fit:cover;width:100%;height:100%;will-change:filter,opacity;transform:translateZ(0);';
    if (tag === 'video') {
      el.autoplay = true;
      el.loop = true;
      el.muted = true;
      el.playsInline = true;
    }
    el.src = src;
    return el;
  }

  function applyAppBg() {
    var isPopup = document.body.classList.contains('popup-page');
    var s = (typeof getSettings === 'function') ? getSettings() : {};

    // Use popup-specific background if separate mode is enabled
    var usePopup = isPopup && s.separatePopupBg && typeof getPopupBgMeta === 'function';
    var meta = usePopup
      ? getPopupBgMeta()
      : ((typeof getAppBgMeta === 'function') ? getAppBgMeta() : null);
    var legacyUri = usePopup
      ? ((typeof getPopupBgImage === 'function') ? getPopupBgImage() : '')
      : ((typeof getAppBgImage === 'function') ? getAppBgImage() : '');
    var idbKey = usePopup ? 'popup_bg' : 'app_bg';
    var opacityKey = usePopup ? 'popupBgImageOpacity' : 'appBgImageOpacity';
    var satKey = usePopup ? 'popupBgImageSaturation' : 'appBgImageSaturation';
    var blurKey = usePopup ? 'popupBgImageBlur' : 'appBgImageBlur';

    // Build a style settings object with the correct keys
    var styleS = {
      appBgImageOpacity:    s[opacityKey] ?? 0.3,
      appBgImageSaturation: s[satKey] ?? 100,
      appBgImageBlur:       s[blurKey] ?? 0,
    };

    // No background at all
    if (!meta && !legacyUri) { _removeAppBg(); _notifyBgChanged(); return; }

    // Legacy: static image data URI in localStorage (no meta)
    if (!meta) {
      _removeAppBg();
      var el = document.createElement('div');
      el.id = '_krAppBg';
      el.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background-size:cover;background-position:center;will-change:filter,opacity;transform:translateZ(0);';
      el.style.backgroundImage = 'url(' + legacyUri + ')';
      _applyAppBgStyles(el, styleS);
      document.body.prepend(el);
      _notifyBgChanged();
      return;
    }

    // URL-based background
    if (meta.source === 'url') {
      _removeAppBg();
      var tag = meta.type === 'video' ? 'video' : 'img';
      var el = _createMediaElement(tag, meta.url);
      _applyAppBgStyles(el, styleS);
      document.body.prepend(el);
      if (tag === 'video') el.play().catch(function() {});
      _notifyBgChanged();
      return;
    }

    // IndexedDB-based background
    if (meta.source === 'idb' && typeof getBg === 'function') {
      getBg(idbKey).then(function(entry) {
        if (!entry || !entry.data) { _removeAppBg(); _notifyBgChanged(); return; }
        _removeAppBg();
        _appBgObjectUrl = URL.createObjectURL(entry.data);
        var tag = meta.type === 'video' ? 'video' : 'img';
        var el = _createMediaElement(tag, _appBgObjectUrl);
        _applyAppBgStyles(el, styleS);
        document.body.prepend(el);
        if (tag === 'video') el.play().catch(function() {});
        _notifyBgChanged();
      }).catch(function() { _removeAppBg(); _notifyBgChanged(); });
      return;
    }
  }

  function _notifyBgChanged() {
    window.dispatchEvent(new CustomEvent('appBgChanged'));
  }

  // ── Exports + auto-init ─────────────────────────────────────────────────────
  window.initCustomSelects = initCustomSelects;
  window.initTooltips      = initTooltips;
  window.initSliderInputs  = initSliderInputs;
  window.applyAppBg        = applyAppBg;

  initCustomSelects();
  initTooltips();
  initSliderInputs();
  applyAppBg();
})();
