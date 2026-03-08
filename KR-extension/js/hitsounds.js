// Synthesized hitsound buffers for game feedback
function buildHitsoundBuffer(ctx, type) {
  if (!type || type === 'none') return null;

  const sr  = ctx.sampleRate;
  const dur = type === 'bell' ? 0.5 : 0.09;
  const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
  const d   = buf.getChannelData(0);

  if (type === 'tick') {
    // Short 880 Hz sine decay
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 45);
    }
  } else if (type === 'click') {
    // 1200 Hz square burst — attenuated to match tick volume
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = (Math.sin(2 * Math.PI * 1200 * t) > 0 ? 1 : -1) * Math.exp(-t * 65) * 0.55;
    }
  } else if (type === 'drum') {
    // Low 80 Hz + noise burst
    for (let i = 0; i < d.length; i++) {
      const t     = i / sr;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 80);
      const tone  = Math.sin(2 * Math.PI * 80 * t) * Math.exp(-t * 25);
      d[i] = noise * 0.4 + tone * 0.6;
    }
  } else if (type === 'bell') {
    // 1200 Hz triangle long decay
    for (let i = 0; i < d.length; i++) {
      const t     = i / sr;
      const phase = (1200 * t) % 1;
      const tri   = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
      d[i] = tri * Math.exp(-t * 9);
    }
  } else if (type === 'bass') {
    // 55 Hz sine + sub-noise (deep thump)
    for (let i = 0; i < d.length; i++) {
      const t     = i / sr;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 60);
      const tone  = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 18);
      d[i] = noise * 0.25 + tone * 0.75;
    }
  } else if (type === 'kick') {
    // 150 Hz sine with fast decay + transient click — punchy low hit
    for (let i = 0; i < d.length; i++) {
      const t     = i / sr;
      const click = (i < sr * 0.004) ? (Math.random() * 2 - 1) * 1.0 : 0;
      const tone  = Math.sin(2 * Math.PI * 150 * t) * Math.exp(-t * 35);
      d[i] = click + tone * 1.0;
    }
  } else if (type === 'snare') {
    // 200 Hz tone + noise burst — snappy percussion
    for (let i = 0; i < d.length; i++) {
      const t     = i / sr;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 50);
      const tone  = Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 40);
      d[i] = noise * 0.75 + tone * 0.6;
    }
  }

  return buf;
}

// Decode a custom hitsound from base64 stored in settings
async function buildCustomHitsoundBuffer(ctx) {
  try {
    const s = getSettings();
    const b64 = s.customHitsound;
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return await ctx.decodeAudioData(bytes.buffer);
  } catch (_) { return null; }
}

// Decode a named custom hitsound from the customHitsounds library
async function buildCustomHitsoundByName(ctx, name) {
  try {
    const s = getSettings();
    const lib = s.customHitsounds || {};
    const b64 = lib[name];
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return await ctx.decodeAudioData(bytes.buffer);
  } catch (_) { return null; }
}
