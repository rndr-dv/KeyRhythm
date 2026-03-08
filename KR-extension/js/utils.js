// Shared utility functions used by index.js, editor.js, and popup.js

async function compress(str) {
  try {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    writer.write(new TextEncoder().encode(str));
    writer.close();
    const buf   = await new Response(stream.readable).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192)
      bin += String.fromCharCode(...bytes.slice(i, i + 8192));
    return btoa(bin);
  } catch (e) {
    throw new Error('Compression failed: ' + e.message);
  }
}

async function decompress(b64) {
  try {
    const bin   = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Response(stream.readable).text();
  } catch (e) {
    throw new Error('Decompression failed: ' + e.message);
  }
}

function serializeNote(n) {
  const obj = { time: n.time, lane: n.lane, duration: n.duration || 0 };
  if (n.hitsound) obj.hitsound = n.hitsound;
  if (n.glide !== undefined) { obj.glide = n.glide; obj.glideAt = n.glideAt || 0; }
  return obj;
}

// ── Styled modal dialogs (replace prompt/confirm) ────────────────────────────
function krConfirm(message, title) {
  return new Promise(resolve => {
    _krShowModal({
      title: title || 'Confirm',
      message,
      confirmText: 'OK',
      cancelText: 'Cancel',
      onConfirm: () => resolve(true),
      onCancel:  () => resolve(false),
    });
  });
}

function krPrompt(message, placeholder, defaultVal) {
  return new Promise(resolve => {
    _krShowModal({
      title: message,
      input: true,
      inputPlaceholder: placeholder || '',
      inputDefault: defaultVal || '',
      confirmText: 'OK',
      cancelText: 'Cancel',
      onConfirm: val => resolve(val),
      onCancel:  () => resolve(null),
    });
  });
}

function krSelect(message, options) {
  return new Promise(resolve => {
    _krShowModal({
      title: message,
      selectOptions: options,
      confirmText: 'OK',
      cancelText: 'Cancel',
      onConfirm: val => resolve(val),
      onCancel:  () => resolve(null),
    });
  });
}

function _krShowModal(cfg) {
  // Remove any existing modal
  const existing = document.getElementById('kr-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'kr-modal-overlay';
  overlay.className = 'kr-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'kr-modal';

  const titleEl = document.createElement('div');
  titleEl.className = 'kr-modal-title';
  titleEl.textContent = cfg.title || '';
  modal.appendChild(titleEl);

  if (cfg.message) {
    const msgEl = document.createElement('div');
    msgEl.className = 'kr-modal-message';
    msgEl.textContent = cfg.message;
    modal.appendChild(msgEl);
  }

  let inputEl = null;
  let selectEl = null;

  if (cfg.input) {
    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'kr-modal-input';
    inputEl.placeholder = cfg.inputPlaceholder || '';
    inputEl.value = cfg.inputDefault || '';
    modal.appendChild(inputEl);
  }

  if (cfg.selectOptions) {
    selectEl = document.createElement('select');
    selectEl.className = 'kr-modal-select';
    cfg.selectOptions.forEach((opt, i) => {
      const o = document.createElement('option');
      o.value = typeof opt === 'object' ? opt.value : i;
      o.textContent = typeof opt === 'object' ? opt.label : opt;
      selectEl.appendChild(o);
    });
    modal.appendChild(selectEl);
  }

  const btns = document.createElement('div');
  btns.className = 'kr-modal-buttons';

  const btnCancel = document.createElement('button');
  btnCancel.className = 'btn btn-sm btn-dim';
  btnCancel.textContent = cfg.cancelText || 'Cancel';

  const btnConfirm = document.createElement('button');
  btnConfirm.className = 'btn btn-sm btn-green';
  btnConfirm.textContent = cfg.confirmText || 'OK';

  btns.appendChild(btnCancel);
  btns.appendChild(btnConfirm);
  modal.appendChild(btns);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function close() { overlay.remove(); }

  btnCancel.addEventListener('click', () => { close(); cfg.onCancel?.(); });
  btnConfirm.addEventListener('click', () => {
    close();
    if (inputEl) cfg.onConfirm?.(inputEl.value);
    else if (selectEl) cfg.onConfirm?.(selectEl.value);
    else cfg.onConfirm?.();
  });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { close(); cfg.onCancel?.(); }
  });

  // Focus input or confirm button
  requestAnimationFrame(() => {
    if (inputEl) { inputEl.focus(); inputEl.select(); }
    else btnConfirm.focus();
  });

  // Enter key confirms, Escape cancels
  const onKey = e => {
    if (e.key === 'Enter') { e.preventDefault(); btnConfirm.click(); }
    if (e.key === 'Escape') { e.preventDefault(); btnCancel.click(); }
  };
  overlay.addEventListener('keydown', onKey);
}

function showToast(msg, duration, isError) {
  duration = duration || 2500;
  let t = document.getElementById('kr-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'kr-toast';
    t.className = 'kr-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.toggle('error', !!isError);
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, duration);
}
