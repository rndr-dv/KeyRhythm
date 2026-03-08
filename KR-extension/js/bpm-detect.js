// js/bpm-detect.js — BPM Detection (Multi-Band FFT + Independent-Path Voting + Tempogram)
'use strict';

/* ── Shared DSP helpers ──────────────────────────────────────────────────── */

const BPM_FFT_SIZE = 2048;
const BPM_HOP_SIZE = 512;

function _hannWindow(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  return w;
}

const _hann = _hannWindow(BPM_FFT_SIZE);
const _logN = Math.log2(BPM_FFT_SIZE);

// Preallocated buffers for FFT (reused every frame to avoid GC pressure)
const _fftRe  = new Float32Array(BPM_FFT_SIZE);
const _fftIm  = new Float32Array(BPM_FFT_SIZE);
// Ping-pong magnitude buffers: alternate each frame so prevSpec stays valid
const _magA   = new Float32Array(BPM_FFT_SIZE / 2);
const _magB   = new Float32Array(BPM_FFT_SIZE / 2);

// Precomputed bit-reversal table
const _bitRev = new Uint16Array(BPM_FFT_SIZE);
for (let i = 0; i < BPM_FFT_SIZE; i++) {
  let j = 0, x = i;
  for (let b = 0; b < _logN; b++) { j = (j << 1) | (x & 1); x >>= 1; }
  _bitRev[i] = j;
}

// Precomputed twiddle factors for each FFT stage
// Total entries = N/2 + N/4 + ... + 1 = N-1, but we index by stage for cache locality
const _twiddleRe = [];
const _twiddleIm = [];
for (let size = 2; size <= BPM_FFT_SIZE; size *= 2) {
  const half = size / 2, step = -2 * Math.PI / size;
  const wr = new Float32Array(half);
  const wi = new Float32Array(half);
  for (let j = 0; j < half; j++) {
    const a = step * j;
    wr[j] = Math.cos(a);
    wi[j] = Math.sin(a);
  }
  _twiddleRe.push(wr);
  _twiddleIm.push(wi);
}

// Precomputed phase advance for spectral complex difference (bass band)
// Expected phase advance per bin per hop: 2π × k × hopSize / fftSize
const _phaseAdvRe = new Float32Array(BPM_FFT_SIZE / 2);
const _phaseAdvIm = new Float32Array(BPM_FFT_SIZE / 2);
for (let k = 0; k < BPM_FFT_SIZE / 2; k++) {
  const angle = 2 * Math.PI * k * BPM_HOP_SIZE / BPM_FFT_SIZE;
  _phaseAdvRe[k] = Math.cos(angle);
  _phaseAdvIm[k] = Math.sin(angle);
}

// Preallocated buffers for previous frame's complex FFT (bass band only)
const _prevBassRe = new Float32Array(BPM_FFT_SIZE / 2);
const _prevBassIm = new Float32Array(BPM_FFT_SIZE / 2);

/**
 * In-place radix-2 FFT → magnitude into provided output buffer.
 * Uses preallocated re/im buffers and precomputed twiddles.
 */
function _fftMagnitude(frame, magOut) {
  const N = BPM_FFT_SIZE, halfN = N / 2;
  _fftIm.fill(0);
  for (let i = 0; i < N; i++) _fftRe[_bitRev[i]] = frame[i];

  let stageIdx = 0;
  for (let size = 2; size <= N; size *= 2) {
    const half = size / 2;
    const wr = _twiddleRe[stageIdx], wi = _twiddleIm[stageIdx];
    for (let i = 0; i < N; i += size) {
      for (let j = 0; j < half; j++) {
        const tr = _fftRe[i+j+half]*wr[j] - _fftIm[i+j+half]*wi[j];
        const ti = _fftRe[i+j+half]*wi[j] + _fftIm[i+j+half]*wr[j];
        _fftRe[i+j+half] = _fftRe[i+j] - tr;  _fftIm[i+j+half] = _fftIm[i+j] - ti;
        _fftRe[i+j] += tr;                     _fftIm[i+j] += ti;
      }
    }
    stageIdx++;
  }
  for (let k = 0; k < halfN; k++) magOut[k] = Math.sqrt(_fftRe[k]*_fftRe[k] + _fftIm[k]*_fftIm[k]);
}

/** Mix AudioBuffer down to mono Float32Array. */
function _toMono(buffer) {
  const n = buffer.length, ch = buffer.numberOfChannels;
  const mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += d[i];
  }
  if (ch > 1) for (let i = 0; i < n; i++) mono[i] /= ch;
  return mono;
}

/**
 * Compute 4-band onset novelty curves, energy envelope, and energy novelty.
 * Band 1 (0–300 Hz): spectral complex difference (phase-aware, catches kick/bass onsets)
 * Band 2 (300–2000 Hz): half-wave rectified spectral flux (snare, vocals, guitar)
 * Band 3 (2000–8000 Hz): high-frequency content weighted by bin index (hi-hats, percussion)
 * Band 4 (8000+ Hz): high-frequency content (cymbals, sibilance)
 */
function _computeOnsetAndEnergy(mono, sampleRate) {
  const totalFrames = Math.floor((mono.length - BPM_FFT_SIZE) / BPM_HOP_SIZE) + 1;
  const bassOnsetRaw    = new Float32Array(totalFrames);
  const midOnsetRaw     = new Float32Array(totalFrames);
  const highMidOnsetRaw = new Float32Array(totalFrames);
  const highOnsetRaw    = new Float32Array(totalFrames);
  const energyRaw        = new Float32Array(totalFrames);
  const energyNoveltyRaw = new Float32Array(totalFrames);
  const frameTimes       = new Float32Array(totalFrames);

  const rmsSize = Math.round(sampleRate * 0.02);
  const bassBin    = Math.ceil(300 * BPM_FFT_SIZE / sampleRate);
  const midBin     = Math.ceil(2000 * BPM_FFT_SIZE / sampleRate);
  const highMidBin = Math.ceil(8000 * BPM_FFT_SIZE / sampleRate);
  const halfN = BPM_FFT_SIZE / 2;

  const frame = new Float32Array(BPM_FFT_SIZE);
  let curMag = _magA, prevMag = _magB;
  let hasPrev = false;
  let prevEnergy = 0;

  for (let f = 0; f < totalFrames; f++) {
    const start = f * BPM_HOP_SIZE;
    frameTimes[f] = start / sampleRate;

    let rms = 0, rmsCount = 0;
    for (let i = start; i < start + rmsSize && i < mono.length; i++) { rms += mono[i] * mono[i]; rmsCount++; }
    energyRaw[f] = rmsCount > 0 ? Math.sqrt(rms / rmsCount) : 0;
    const eDiff = energyRaw[f] - prevEnergy;
    energyNoveltyRaw[f] = eDiff > 0 ? eDiff : 0;
    prevEnergy = energyRaw[f];

    for (let i = 0; i < BPM_FFT_SIZE; i++) frame[i] = (mono[start + i] || 0) * _hann[i];
    _fftMagnitude(frame, curMag);

    if (hasPrev) {
      // Band 1: Bass (0–300 Hz) — Spectral Complex Difference
      let bassDiff = 0;
      for (let k = 0; k < bassBin && k < halfN; k++) {
        const predRe = _prevBassRe[k] * _phaseAdvRe[k] - _prevBassIm[k] * _phaseAdvIm[k];
        const predIm = _prevBassRe[k] * _phaseAdvIm[k] + _prevBassIm[k] * _phaseAdvRe[k];
        const dRe = _fftRe[k] - predRe;
        const dIm = _fftIm[k] - predIm;
        bassDiff += Math.sqrt(dRe * dRe + dIm * dIm);
      }
      bassOnsetRaw[f] = bassDiff;

      // Band 2: Low-Mid (300–2000 Hz) — Half-wave rectified spectral flux
      let midFlux = 0;
      for (let k = bassBin; k < midBin && k < halfN; k++) {
        const d = curMag[k] - prevMag[k];
        if (d > 0) midFlux += d;
      }
      midOnsetRaw[f] = midFlux;

      // Band 3: High-Mid (2000–8000 Hz) — High Frequency Content
      let hfcMid = 0;
      for (let k = midBin; k < highMidBin && k < halfN; k++) {
        const d = curMag[k] - prevMag[k];
        if (d > 0) hfcMid += d * k;
      }
      highMidOnsetRaw[f] = hfcMid;

      // Band 4: High (8000+ Hz) — High Frequency Content
      let hfcHigh = 0;
      for (let k = highMidBin; k < halfN; k++) {
        const d = curMag[k] - prevMag[k];
        if (d > 0) hfcHigh += d * k;
      }
      highOnsetRaw[f] = hfcHigh;
    }

    // Save complex values for bass band (next frame's complex diff)
    for (let k = 0; k < bassBin && k < halfN; k++) {
      _prevBassRe[k] = _fftRe[k];
      _prevBassIm[k] = _fftIm[k];
    }

    hasPrev = true;
    const tmp = curMag; curMag = prevMag; prevMag = tmp;
  }

  return {
    bassOnsetRaw, midOnsetRaw, highMidOnsetRaw, highOnsetRaw,
    energyRaw, energyNoveltyRaw, frameTimes
  };
}

/* ── Normalize, smooth, downsample ───────────────────────────────────────── */

/**
 * Local z-score normalization: log-compress → rolling mean/std → half-wave rectify.
 * Log compression tames outliers (replaces need for median/MAD).
 * Rolling stats are O(n) instead of O(n*w*log w) from sorting.
 */
function _normalize(arr, windowFrames) {
  const n = arr.length;
  if (n === 0) return new Float32Array(0);

  // Step 1: log-compress to tame outliers
  const log = new Float32Array(n);
  for (let i = 0; i < n; i++) log[i] = Math.log1p(10 * arr[i]);

  // Step 2: rolling mean and std via prefix sums
  const halfWin = windowFrames ? Math.floor(windowFrames / 2) : Math.min(344, Math.floor(n / 2));
  const out = new Float32Array(n);

  // Build prefix sums for O(1) window mean/variance
  const pfxSum  = new Float64Array(n + 1);
  const pfxSumSq = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    pfxSum[i + 1]   = pfxSum[i] + log[i];
    pfxSumSq[i + 1] = pfxSumSq[i] + log[i] * log[i];
  }

  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - halfWin);
    const hi = Math.min(n, i + halfWin + 1);
    const winLen = hi - lo;

    const sum   = pfxSum[hi] - pfxSum[lo];
    const sumSq = pfxSumSq[hi] - pfxSumSq[lo];
    const mean  = sum / winLen;
    const variance = sumSq / winLen - mean * mean;
    const std   = Math.sqrt(Math.max(0, variance)) || 1e-10;

    // Z-score, half-wave rectify (keep magnitude — don't clamp to [0,1],
    // which destroys strong-vs-weak beat contrast needed by ACF/comb)
    const z = (log[i] - mean) / std;
    out[i] = Math.max(z, 0);
  }
  return out;
}

/** Downsample to ~targetHz via block averaging (more stable than picking every Nth). */
function _smoothAndDownsample(signal, frameTimes, targetHz) {
  const origHz = 1 / (frameTimes.length > 1 ? frameTimes[1] - frameTimes[0] : 1);
  const step = Math.max(1, Math.round(origHz / targetHz));
  const len = Math.ceil(signal.length / step);
  const ds = new Float32Array(len);
  const dsTimes = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const bStart = i * step;
    const bEnd = Math.min(bStart + step, signal.length);
    let sum = 0;
    for (let j = bStart; j < bEnd; j++) sum += signal[j];
    ds[i] = sum / (bEnd - bStart);
    dsTimes[i] = frameTimes[Math.min(bStart + ((bEnd - bStart) >> 1), frameTimes.length - 1)];
  }
  return { signal: ds, times: dsTimes, hz: origHz / step };
}

/* ── Peak picking ──────────────────────────────────────────────────────── */

/**
 * Convert continuous novelty curve to sparse weighted peaks.
 * Finds local maxima above dynamic threshold with minimum inter-peak distance.
 * Returns impulse train with peak weights (0 elsewhere), which sharpens
 * periodicity for autocorrelation and comb filter.
 */
function _peakPick(signal, hz) {
  const n = signal.length;
  const peaks = new Float32Array(n); // sparse: 0 except at peaks
  const minDist = Math.round(hz * 0.08); // ~80ms minimum between peaks
  // Dynamic threshold: local mean + 0.5 * local std in a ~0.5s window
  const threshWin = Math.round(hz * 0.5);
  const halfTW = Math.max(1, threshWin >> 1);

  // Prefix sums for fast local mean/std
  const pfx  = new Float64Array(n + 1);
  const pfx2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    pfx[i + 1]  = pfx[i] + signal[i];
    pfx2[i + 1] = pfx2[i] + signal[i] * signal[i];
  }

  // Dynamic threshold at position i
  const _thresh = (i) => {
    const lo = Math.max(0, i - halfTW);
    const hi = Math.min(n, i + halfTW + 1);
    const wLen = hi - lo;
    const mean = (pfx[hi] - pfx[lo]) / wLen;
    const var_ = (pfx2[hi] - pfx2[lo]) / wLen - mean * mean;
    return mean + 0.3 * Math.sqrt(Math.max(0, var_));
  };

  let lastPeak = -minDist;
  let lastPeakVal = 0;
  for (let i = 1; i < n - 1; i++) {
    // Local maximum check
    if (signal[i] <= signal[i - 1] || signal[i] <= signal[i + 1]) continue;

    if (i - lastPeak < minDist) {
      // Within minDist: replace previous peak if this one is stronger
      if (signal[i] > lastPeakVal && signal[i] >= _thresh(i)) {
        peaks[lastPeak] = 0; // remove weaker peak
        peaks[i] = signal[i];
        lastPeak = i;
        lastPeakVal = signal[i];
      }
      continue;
    }

    // Outside minDist: accept if above threshold
    if (signal[i] >= _thresh(i)) {
      peaks[i] = signal[i];
      lastPeak = i;
      lastPeakVal = signal[i];
    }
  }
  return peaks;
}

/* ── Autocorrelation ─────────────────────────────────────────────────────── */

/**
 * Autocorrelation on one or more signals → top N BPM candidates in [minBPM, maxBPM].
 * When multiple signals+weights are given, lag spectra are computed independently
 * and merged with weighted sum, giving multiple independent votes on tempo.
 *
 * @param {Array<{signal: Float32Array, weight: number}>} signals - signals to autocorrelate
 * @param {number} hz - sample rate of signals
 */
function _autocorrelate(signals, hz, minBPM, maxBPM, topN) {
  const minLag = Math.floor(hz * 60 / maxBPM);
  const maxLag = Math.ceil(hz * 60 / minBPM);
  const numLags = maxLag - minLag + 1;
  const merged = new Float64Array(numLags);

  for (const { signal, weight } of signals) {
    // Normalize ACF by zero-lag (energy) to make magnitudes comparable across signals
    let zeroLag = 0;
    for (let i = 0; i < signal.length; i++) zeroLag += signal[i] * signal[i];
    zeroLag /= signal.length;
    if (zeroLag <= 0) continue;

    for (let lag = minLag; lag <= maxLag && lag < signal.length; lag++) {
      let sum = 0;
      for (let i = 0; i + lag < signal.length; i++) sum += signal[i] * signal[i + lag];
      sum /= (signal.length - lag);
      merged[lag - minLag] += weight * (sum / zeroLag);
    }
  }

  // Find local maxima in the lag spectrum (true peaks, not just top-N by score).
  // A peak must exceed both neighbors by a margin relative to the local range,
  // which avoids picking noise ripples on plateaus.
  const peaks = [];
  for (let l = 1; l < numLags - 1; l++) {
    if (merged[l] > merged[l - 1] && merged[l] > merged[l + 1]) {
      const lag = minLag + l;
      peaks.push({ lag, score: merged[l], bpm: (hz * 60) / lag });
    }
  }
  peaks.sort((a, b) => b.score - a.score);

  // Pick top N peaks with a small minimum distance (2 BPM) to avoid near-duplicates
  const candidates = [];
  for (const p of peaks) {
    if (candidates.length >= topN) break;
    if (candidates.every(c => Math.abs(c.bpm - p.bpm) >= 2)) {
      candidates.push(p);
    }
  }

  // If fewer than topN peaks found (very flat spectrum), fill from sorted scores
  if (candidates.length < topN) {
    const allByScore = [];
    for (let l = 0; l < numLags; l++) {
      allByScore.push({ lag: minLag + l, score: merged[l], bpm: (hz * 60) / (minLag + l) });
    }
    allByScore.sort((a, b) => b.score - a.score);
    for (const r of allByScore) {
      if (candidates.length >= topN) break;
      if (candidates.every(c => Math.abs(c.bpm - r.bpm) >= 2)) {
        candidates.push(r);
      }
    }
  }

  return candidates;
}

/* ── Comb filter with phase search ───────────────────────────────────────── */

/**
 * Comb score with subharmonic penalty.
 *
 * Combines average on-beat energy (periodicity strength) with an off-beat
 * penalty (subharmonic discriminator). Pure contrast is too brittle for
 * syncopated/swung music where off-beat positions aren't silent.
 *
 * score = onBeatAvg * (1 + contrast) where contrast = (on - off) / (on + off)
 * This rewards absolute periodicity while giving a bonus to the fundamental
 * over its subharmonics.
 */
function _combScore(signal, hz, bpm, numPhases) {
  const periodSamples = hz * 60 / bpm;
  const KERNEL = 2;
  let bestScore = 0;

  for (let p = 0; p < numPhases; p++) {
    const phaseOffset = (p / numPhases) * periodSamples;

    // On-beat: sample at comb teeth
    let onSum = 0, onCount = 0;
    for (let pos = phaseOffset; pos < signal.length; pos += periodSamples) {
      const center = Math.round(pos);
      let toothVal = 0, toothN = 0;
      for (let k = -KERNEL; k <= KERNEL; k++) {
        const idx = center + k;
        if (idx >= 0 && idx < signal.length) { toothVal += signal[idx]; toothN++; }
      }
      if (toothN > 0) { onSum += toothVal / toothN; onCount++; }
    }

    // Off-beat: sample at midpoints between teeth
    let offSum = 0, offCount = 0;
    for (let pos = phaseOffset + periodSamples / 2; pos < signal.length; pos += periodSamples) {
      const center = Math.round(pos);
      let toothVal = 0, toothN = 0;
      for (let k = -KERNEL; k <= KERNEL; k++) {
        const idx = center + k;
        if (idx >= 0 && idx < signal.length) { toothVal += signal[idx]; toothN++; }
      }
      if (toothN > 0) { offSum += toothVal / toothN; offCount++; }
    }

    const onAvg  = onCount > 0 ? onSum / onCount : 0;
    const offAvg = offCount > 0 ? offSum / offCount : 0;
    // Contrast bonus: ranges from 0 (all off-beat) to 1 (all on-beat)
    // For syncopated music where off-beat is noisy, contrast ≈ 0 → score ≈ onAvg (no penalty)
    // For clean 4/4 where off-beat is silent, contrast ≈ 1 → score ≈ 2 * onAvg (bonus)
    // For subharmonic where off-beat has ghost beats, contrast < 0 → score < onAvg (penalty)
    const denom = onAvg + offAvg + 1e-10;
    const contrast = (onAvg - offAvg) / denom;
    const score = onAvg * (1 + contrast);

    if (score > bestScore) bestScore = score;
  }
  return bestScore;
}

/**
 * Blended comb scoring with adaptive weighting.
 * The signal with stronger periodicity gets proportionally more weight,
 * blended with a default 0.6 energy / 0.4 onset bias, clamped to [0.3, 0.7].
 */
function _blendedCombScore(onsetDS, energyDS, hz, bpm, numPhases) {
  const onsetScore  = _combScore(onsetDS, hz, bpm, numPhases);
  const energyScore = _combScore(energyDS, hz, bpm, numPhases);
  const total = energyScore + onsetScore + 1e-10;
  // 50% adaptive (score-proportional) + 50% default bias (0.6 energy)
  const wE = Math.max(0.3, Math.min(0.7, 0.5 * (energyScore / total) + 0.5 * 0.6));
  return wE * energyScore + (1 - wE) * onsetScore;
}

/* ── Confidence ──────────────────────────────────────────────────────────── */

/**
 * Confidence = relative gap × absolute quality (0–1).
 * Relative gap: how much the best stands out from the runner-up.
 * Absolute quality: how much the best exceeds the median score. When all
 * candidates are weak (no clear periodicity), this pulls confidence down
 * even if the best happens to be slightly ahead by chance.
 */
function _calcConfidence(scores) {
  if (scores.length < 2) return 1;
  const sorted = scores.slice().sort((a, b) => b - a);
  const best = sorted[0], second = sorted[1];
  if (best <= 0) return 0;

  const relGap = (best - second) / best;

  // Absolute quality: ratio of (best - median) to (best + median).
  // Near 0 when best ≈ median (all weak), near 1 when best >> median.
  const median = sorted[Math.floor(sorted.length / 2)];
  const absQuality = (best - median) / (best + median + 1e-10);

  // Combined: 0.4 floor ensures strong relative gaps still produce moderate
  // confidence even when absolute quality is uncertain.
  return Math.round(Math.max(0, Math.min(1, relGap * (0.4 + 0.6 * absQuality))) * 100) / 100;
}

/* ── Tempo-family clustering ──────────────────────────────────────────────── */

const _HARMONIC_MULTS = [1, 2, 1/2, 3/2, 2/3, 4/3, 3/4, 3, 1/3];

/**
 * Check if two BPMs belong to the same tempo family.
 * Returns true if one can be reached from the other via a harmonic multiplier.
 */
function _sameFamily(a, b, tol) {
  for (const m of _HARMONIC_MULTS) {
    if (Math.abs(a * m - b) <= tol) return true;
  }
  return false;
}

/**
 * Expand candidates by generating harmonics of each candidate, scoring them,
 * and adding any that don't duplicate an existing candidate.
 */
function _expandCandidates(candidates, scores, onsetDS, energyDS, hz, numPhases, minBPM, maxBPM, tolerance) {
  const expanded = candidates.map((c, i) => ({ bpm: c.bpm, score: scores[i], origIdx: i }));
  // Must match all ratios in _HARMONIC_MULTS so every family member gets scored
  const EXPAND_MULTS = [2, 1/2, 3/2, 2/3, 4/3, 3/4, 3, 1/3];

  for (const c of candidates) {
    for (const m of EXPAND_MULTS) {
      const hbpm = c.bpm * m;
      if (hbpm < minBPM || hbpm > maxBPM) continue;
      // Skip if already close to an existing candidate
      if (expanded.some(e => Math.abs(e.bpm - hbpm) <= tolerance)) continue;
      const score = _blendedCombScore(onsetDS, energyDS, hz, hbpm, numPhases);
      expanded.push({ bpm: hbpm, score, origIdx: -1 });
    }
  }
  return expanded;
}

/**
 * Gaussian prior for BPM preference: gentle bonus centered on ~120 BPM.
 * σ = 40 gives a smooth falloff: 120 BPM gets full bonus, 80/160 get ~60%, 60/200 get ~14%.
 * Avoids hard-forcing BPM into a range while still preferring typical tempos.
 */
function _tempoPrior(bpm) {
  const center = 120, sigma = 40;
  const d = bpm - center;
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

/**
 * Cluster expanded candidates into tempo families, score each family, pick winner.
 * Uses soft Gaussian prior instead of hard range threshold.
 *
 * @param {Array<{bpm, score, origIdx}>} expanded - from _expandCandidates
 * @param {number[]} origScores - original (pre-expansion) scores for confidence
 * @returns {{ bpm: number, confidence: number }}
 */
function _pickByTempoFamily(expanded, origScores, tolerance) {
  const n = expanded.length;
  if (n === 0) return { bpm: 0, confidence: 0 };

  // Union-Find to cluster into families
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { parent[find(a)] = find(b); };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (_sameFamily(expanded[i].bpm, expanded[j].bpm, tolerance)) {
        union(i, j);
      }
    }
  }

  // Group into families; use max score (not sum) to prevent wrong families
  // with many mediocre members from overpowering correct family with fewer strong members
  const families = {};
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!families[root]) families[root] = { members: [], maxScore: 0 };
    families[root].members.push(i);
    if (expanded[i].score > families[root].maxScore) {
      families[root].maxScore = expanded[i].score;
    }
  }

  // Pick family with highest max score
  let bestFamily = null;
  for (const fam of Object.values(families)) {
    if (!bestFamily || fam.maxScore > bestFamily.maxScore) bestFamily = fam;
  }

  // Inside winning family: pick member with best prior-weighted score
  // prior weight = 0.15 (subtle nudge, doesn't override strong evidence)
  const PRIOR_WEIGHT = 0.15;
  let bestIdx = bestFamily.members[0];
  let bestWeighted = -Infinity;
  // Find max raw score in family for normalization
  let maxFamScore = 0;
  for (const i of bestFamily.members) {
    if (expanded[i].score > maxFamScore) maxFamScore = expanded[i].score;
  }
  for (const i of bestFamily.members) {
    const rawNorm = maxFamScore > 0 ? expanded[i].score / maxFamScore : 0;
    const weighted = rawNorm + PRIOR_WEIGHT * _tempoPrior(expanded[i].bpm);
    if (weighted > bestWeighted) {
      bestWeighted = weighted;
      bestIdx = i;
    }
  }

  return {
    bpm: Math.round(expanded[bestIdx].bpm),
    confidence: _calcConfidence(origScores)
  };
}

/* ── Public API ──────────────────────────────────────────────────────────── */

const TARGET_HZ   = 100;
const NUM_PHASES   = 16;
const MIN_BPM      = 60;
const MAX_BPM      = 200;
const TOP_N        = 5;
const FAMILY_TOL   = 3;    // ±3 BPM tolerance for harmonic family matching
const LOW_CONF     = 0.15; // confidence threshold for dense comb fallback

/**
 * Variance-weighted signal fusion: combine 3 signals into one novelty curve.
 * Adapts weights based on signal variance: signals with more rhythmic content
 * (higher variance) get proportionally more weight. Blended 50/50 with
 * defaults (0.5 / 0.25 / 0.25) to avoid extreme weighting on noisy signals.
 */
function _fuseOnsets(fluxDS, lowFluxDS, energyNovDS) {
  const n = fluxDS.length;
  const fused = new Float32Array(n);

  // Compute variance of each signal
  let mF = 0, mL = 0, mE = 0;
  for (let i = 0; i < n; i++) { mF += fluxDS[i]; mL += lowFluxDS[i]; mE += energyNovDS[i]; }
  mF /= n; mL /= n; mE /= n;
  let vF = 0, vL = 0, vE = 0;
  for (let i = 0; i < n; i++) {
    const df = fluxDS[i] - mF; vF += df * df;
    const dl = lowFluxDS[i] - mL; vL += dl * dl;
    const de = energyNovDS[i] - mE; vE += de * de;
  }

  // Blend 50% default + 50% variance-proportional
  const vTotal = vF + vL + vE + 1e-10;
  const wF = 0.5 * 0.5 + 0.5 * (vF / vTotal);
  const wL = 0.5 * 0.25 + 0.5 * (vL / vTotal);
  const wE = 0.5 * 0.25 + 0.5 * (vE / vTotal);
  const wSum = wF + wL + wE;

  for (let i = 0; i < n; i++) {
    fused[i] = (wF * fluxDS[i] + wL * lowFluxDS[i] + wE * energyNovDS[i]) / wSum;
  }
  return fused;
}

/**
 * Dense comb scan: sweep BPM range in 0.5 BPM steps.
 * Used as fallback when autocorrelation-based confidence is low.
 * Returns top N candidates by blended comb score.
 */
function _denseCombScan(fusedOnset, energyDS, hz, minBPM, maxBPM, topN, numPhases) {
  const results = [];
  for (let bpm = minBPM; bpm <= maxBPM; bpm += 0.5) {
    const score = _blendedCombScore(fusedOnset, energyDS, hz, bpm, numPhases);
    results.push({ bpm, score, lag: Math.round(hz * 60 / bpm) });
  }
  results.sort((a, b) => b.score - a.score);
  const candidates = [];
  for (const r of results) {
    if (candidates.length >= topN) break;
    if (candidates.every(c => Math.abs(c.bpm - r.bpm) >= 3)) {
      candidates.push(r);
    }
  }
  return candidates;
}

/**
 * Fourier Tempogram: sliding-window DFT of novelty curve at BPM frequencies.
 * Provides tempo candidates via a different analysis path than ACF.
 * Uses direct DFT at specific BPM frequencies (more efficient than full FFT
 * since we only need ~71 output bins).
 */
function _fourierTempogram(signal, hz, minBPM, maxBPM, topN, winSec) {
  const winSamples = Math.round(hz * (winSec || 8));
  const hopSamples = Math.round(hz * 0.5);
  const bpmStep = 2;
  const numBPM = Math.floor((maxBPM - minBPM) / bpmStep) + 1;
  const tempoSpectrum = new Float64Array(numBPM);

  const omegas = new Float64Array(numBPM);
  for (let b = 0; b < numBPM; b++) {
    omegas[b] = 2 * Math.PI * ((minBPM + b * bpmStep) / 60) / hz;
  }

  // Hann window for tempogram
  const tWin = new Float32Array(winSamples);
  for (let i = 0; i < winSamples; i++) {
    tWin[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (winSamples - 1)));
  }

  // Precompute cos/sin tables for each BPM frequency
  const cosTable = new Array(numBPM);
  const sinTable = new Array(numBPM);
  for (let b = 0; b < numBPM; b++) {
    cosTable[b] = new Float32Array(winSamples);
    sinTable[b] = new Float32Array(winSamples);
    const omega = omegas[b];
    for (let i = 0; i < winSamples; i++) {
      const angle = omega * i;
      cosTable[b][i] = Math.cos(angle);
      sinTable[b][i] = Math.sin(angle);
    }
  }

  let numWindows = 0;
  for (let wStart = 0; wStart + winSamples <= signal.length; wStart += hopSamples) {
    numWindows++;
    for (let b = 0; b < numBPM; b++) {
      let re = 0, im = 0;
      const ct = cosTable[b], st = sinTable[b];
      for (let i = 0; i < winSamples; i++) {
        const val = signal[wStart + i] * tWin[i];
        re += val * ct[i];
        im -= val * st[i];
      }
      tempoSpectrum[b] += Math.sqrt(re * re + im * im);
    }
  }

  if (numWindows === 0) return [];
  for (let b = 0; b < numBPM; b++) tempoSpectrum[b] /= numWindows;

  const indexed = [];
  for (let b = 0; b < numBPM; b++) {
    indexed.push({ bpm: minBPM + b * bpmStep, score: tempoSpectrum[b] });
  }
  indexed.sort((a, b) => b.score - a.score);

  const candidates = [];
  for (const r of indexed) {
    if (candidates.length >= topN) break;
    if (candidates.every(c => Math.abs(c.bpm - r.bpm) >= 5)) {
      candidates.push(r);
    }
  }
  return candidates;
}

/**
 * Independent-path voting: collect candidates from multiple analysis paths,
 * count harmonic-aware agreement, score by votes × comb strength.
 * Each bucket keeps all member tempos and picks the best representative
 * by comb score rather than using the first-seen BPM.
 */
function _voteAndSelect(pathCandidates, onsetDS, energyDS, hz, tolerance) {
  const buckets = [];

  for (const pathList of pathCandidates) {
    for (const cand of pathList) {
      let matched = false;
      for (const bucket of buckets) {
        if (Math.abs(bucket.bpm - cand.bpm) <= tolerance ||
            _sameFamily(bucket.bpm, cand.bpm, tolerance)) {
          bucket.members.push(cand.bpm);
          bucket.votes++;
          matched = true;
          break;
        }
      }
      if (!matched) {
        buckets.push({ bpm: cand.bpm, members: [cand.bpm], votes: 1 });
      }
    }
  }

  // Pick best representative per bucket by comb-scoring each unique member
  for (const bucket of buckets) {
    const seen = new Set();
    const unique = [];
    for (const b of bucket.members) {
      const rounded = Math.round(b);
      if (!seen.has(rounded)) { seen.add(rounded); unique.push(b); }
    }

    let bestBpm = bucket.bpm;
    let bestScore = -Infinity;
    for (const bpm of unique) {
      const score = _blendedCombScore(onsetDS, energyDS, hz, bpm, NUM_PHASES);
      if (score > bestScore) { bestScore = score; bestBpm = bpm; }
    }
    bucket.bpm = bestBpm;
    bucket.combScore = bestScore;
    bucket.agreementScore = bucket.votes * bucket.combScore;
  }

  buckets.sort((a, b) => b.agreementScore - a.agreementScore);
  return buckets;
}

/**
 * Octave correction via average spectral novelty.
 * High spectral novelty (busy music) → prefer faster tempo.
 * Low spectral novelty (sparse music) → prefer slower tempo.
 */
function _octaveCorrect(winnerBPM, buckets, onsetRaw, minBPM, maxBPM) {
  const winnerBucket = buckets.find(b => Math.abs(b.bpm - winnerBPM) < 1);
  if (!winnerBucket) return winnerBPM;

  const winnerScore = winnerBucket.agreementScore;

  const relatives = [
    { bpm: winnerBPM * 2, type: 'double' },
    { bpm: winnerBPM / 2, type: 'half' }
  ].filter(r => r.bpm >= minBPM && r.bpm <= maxBPM);

  for (const rel of relatives) {
    const relBucket = buckets.find(b => Math.abs(b.bpm - rel.bpm) <= FAMILY_TOL);
    if (!relBucket) continue;
    if (relBucket.agreementScore < winnerScore * 0.8) continue;

    let meanFlux = 0;
    for (let i = 0; i < onsetRaw.length; i++) meanFlux += onsetRaw[i];
    meanFlux /= onsetRaw.length;

    const noveltyScore = Math.log1p(10 * meanFlux);

    console.log(`[BPM] Octave correction: winner=${winnerBPM}, ` +
      `${rel.type}=${rel.bpm.toFixed(0)}, noveltyScore=${noveltyScore.toFixed(3)}`);

    if (rel.type === 'double' && noveltyScore > 1.5) {
      console.log(`[BPM] Octave corrected: ${winnerBPM} → ${rel.bpm.toFixed(0)} (busy music)`);
      return Math.round(rel.bpm);
    }
    if (rel.type === 'half' && noveltyScore < 1.0) {
      console.log(`[BPM] Octave corrected: ${winnerBPM} → ${rel.bpm.toFixed(0)} (sparse music)`);
      return Math.round(rel.bpm);
    }
  }

  return winnerBPM;
}

/**
 * Core BPM analysis pipeline (v2): multi-band independent voting.
 *
 * Stages:
 * 1. Downsample each of 5 signals independently
 * 2. ACF on each → 3 candidates per path = 15 candidates
 * 3. Fourier tempogram on fused signal → 3 candidates
 * 4. Harmonic-aware voting across all 18 candidates
 * 5. Comb filter scoring on top voted candidates
 * 6. Octave correction via spectral novelty
 * 7. Fallback: fused ACF + dense comb if voting is inconclusive
 */
function _analyzeBPM(bassNorm, midNorm, highMidNorm, highNorm, energyNorm, energyNovNorm, frameTimes, onsetRawForOctave, analysisOpts) {
  const aOpts = analysisOpts || {};
  const acfTop        = aOpts.acfTop || 3;
  const tempogramWin  = aOpts.tempogramWinSec || 8;
  const minVoteFallback = aOpts.minVoteFallback || 3;

  // Downsample all to ~100Hz
  const bassDS     = _smoothAndDownsample(bassNorm, frameTimes, TARGET_HZ);
  const midDS      = _smoothAndDownsample(midNorm, frameTimes, TARGET_HZ);
  const highMidDS  = _smoothAndDownsample(highMidNorm, frameTimes, TARGET_HZ);
  const highDS     = _smoothAndDownsample(highNorm, frameTimes, TARGET_HZ);
  const energyDS   = _smoothAndDownsample(energyNorm, frameTimes, TARGET_HZ);
  const energyNovDS = _smoothAndDownsample(energyNovNorm, frameTimes, TARGET_HZ);
  const hz = bassDS.hz;

  // Peak-pick each signal for ACF
  const bassPeaks      = _peakPick(bassDS.signal, hz);
  const midPeaks       = _peakPick(midDS.signal, hz);
  const highMidPeaks   = _peakPick(highMidDS.signal, hz);
  const highPeaks      = _peakPick(highDS.signal, hz);
  const energyNovPeaks = _peakPick(energyNovDS.signal, hz);

  // Independent ACF on each path (continuous + peaked for robustness)
  const pathCandidates = [
    _autocorrelate([{ signal: bassDS.signal, weight: 0.5 }, { signal: bassPeaks, weight: 0.5 }], hz, MIN_BPM, MAX_BPM, acfTop),
    _autocorrelate([{ signal: midDS.signal, weight: 0.5 }, { signal: midPeaks, weight: 0.5 }], hz, MIN_BPM, MAX_BPM, acfTop),
    _autocorrelate([{ signal: highMidDS.signal, weight: 0.5 }, { signal: highMidPeaks, weight: 0.5 }], hz, MIN_BPM, MAX_BPM, acfTop),
    _autocorrelate([{ signal: highDS.signal, weight: 0.5 }, { signal: highPeaks, weight: 0.5 }], hz, MIN_BPM, MAX_BPM, acfTop),
    _autocorrelate([{ signal: energyNovDS.signal, weight: 0.5 }, { signal: energyNovPeaks, weight: 0.5 }], hz, MIN_BPM, MAX_BPM, acfTop),
  ];

  const pathNames = ['bass', 'mid', 'highMid', 'high', 'energyNov'];
  pathCandidates.forEach((cands, i) => {
    console.log(`[BPM] ${pathNames[i]} ACF:`, cands.map(c => c.bpm.toFixed(1)).join(', '));
  });

  // Fuse signals for tempogram + fallback
  const fusedOnset = _fuseOnsets(bassDS.signal, midDS.signal, energyNovDS.signal);

  // Fourier tempogram: supplementary candidates (scale window to available data)
  const availableSec = frameTimes[frameTimes.length - 1] - frameTimes[0];
  const effectiveTempWin = Math.min(tempogramWin, availableSec * 0.9);
  const tempogramCands = effectiveTempWin >= 3
    ? _fourierTempogram(fusedOnset, hz, MIN_BPM, MAX_BPM, 3, effectiveTempWin)
    : [];
  console.log('[BPM] Tempogram candidates:', tempogramCands.map(c => c.bpm.toFixed(1)).join(', '));

  // Vote across all paths (5 ACF + 1 tempogram)
  const allPaths = [...pathCandidates, tempogramCands];
  const buckets = _voteAndSelect(allPaths, fusedOnset, energyDS.signal, hz, FAMILY_TOL);

  if (buckets.length === 0) return { bpm: 0, confidence: 0 };

  console.log('[BPM] Voting results:', buckets.slice(0, 5).map(b =>
    `${b.bpm.toFixed(1)} (votes=${b.votes}, agreement=${b.agreementScore.toFixed(4)})`
  ).join(', '));

  const topBucket = buckets[0];

  // Fallback: if top candidate has < minVoteFallback votes, use fused ACF approach
  if (topBucket.votes < minVoteFallback) {
    console.log('[BPM] Low agreement, falling back to fused ACF...');
    const fusedPeaks = _peakPick(fusedOnset, hz);
    const fusedCands = _autocorrelate([
      { signal: fusedOnset, weight: 0.4 },
      { signal: fusedPeaks, weight: 0.3 },
      { signal: energyNovDS.signal, weight: 0.3 }
    ], hz, MIN_BPM, MAX_BPM, TOP_N);

    if (fusedCands.length === 0) return { bpm: 0, confidence: 0 };

    const scores = fusedCands.map(c => _blendedCombScore(fusedOnset, energyDS.signal, hz, c.bpm, NUM_PHASES));
    const expanded = _expandCandidates(fusedCands, scores, fusedOnset, energyDS.signal, hz, NUM_PHASES, MIN_BPM, MAX_BPM, FAMILY_TOL);
    const result = _pickByTempoFamily(expanded, scores, FAMILY_TOL);

    if (onsetRawForOctave) {
      result.bpm = _octaveCorrect(result.bpm, buckets, onsetRawForOctave, MIN_BPM, MAX_BPM);
    }

    if (result.confidence < LOW_CONF) {
      const denseCands = _denseCombScan(fusedOnset, energyDS.signal, hz, MIN_BPM, MAX_BPM, TOP_N, NUM_PHASES);
      if (denseCands.length > 0) {
        const denseScores = denseCands.map(c => c.score);
        const denseExpanded = _expandCandidates(denseCands, denseScores, fusedOnset, energyDS.signal, hz, NUM_PHASES, MIN_BPM, MAX_BPM, FAMILY_TOL);
        const denseResult = _pickByTempoFamily(denseExpanded, denseScores, FAMILY_TOL);
        if (denseResult.confidence > result.confidence) return denseResult;
      }
    }

    console.log('[BPM] Fallback result:', result.bpm, 'confidence:', result.confidence);
    return result;
  }

  // Expand and cluster the top voted candidates via tempo families
  const topCands = buckets.slice(0, TOP_N).map(b => ({ bpm: b.bpm, score: b.combScore, lag: Math.round(hz * 60 / b.bpm) }));
  const topScores = topCands.map(c => c.score);
  const expanded = _expandCandidates(topCands, topScores, fusedOnset, energyDS.signal, hz, NUM_PHASES, MIN_BPM, MAX_BPM, FAMILY_TOL);
  const result = _pickByTempoFamily(expanded, topScores, FAMILY_TOL);

  // Octave correction
  if (onsetRawForOctave) {
    result.bpm = _octaveCorrect(result.bpm, buckets, onsetRawForOctave, MIN_BPM, MAX_BPM);
  }

  // Boost confidence when voting agreement is high
  const maxPossibleVotes = allPaths.length;
  const voteConfidence = topBucket.votes / maxPossibleVotes;
  result.confidence = Math.round(Math.max(result.confidence, voteConfidence) * 100) / 100;

  console.log('[BPM] Result:', result.bpm, 'confidence:', result.confidence);
  return result;
}

/**
 * Detect single global BPM.
 * @param {AudioBuffer} audioBuffer
 * @param {Object} [opts]
 * @returns {{ bpm: number, confidence: number }}
 */
function detectBPM(audioBuffer, opts = {}) {
  const t0 = performance.now();
  const mono = _toMono(audioBuffer);
  const sr   = audioBuffer.sampleRate;

  const {
    bassOnsetRaw, midOnsetRaw, highMidOnsetRaw, highOnsetRaw,
    energyRaw, energyNoveltyRaw, frameTimes
  } = _computeOnsetAndEnergy(mono, sr);

  const bassNorm     = _normalize(bassOnsetRaw);
  const midNorm      = _normalize(midOnsetRaw);
  const highMidNorm  = _normalize(highMidOnsetRaw);
  const highNorm     = _normalize(highOnsetRaw);
  const energyNorm   = _normalize(energyRaw);
  const energyNovNorm = _normalize(energyNoveltyRaw);

  // Combined raw onset for octave correction
  const combinedOnsetRaw = new Float32Array(frameTimes.length);
  for (let i = 0; i < frameTimes.length; i++) {
    combinedOnsetRaw[i] = bassOnsetRaw[i] + midOnsetRaw[i] + highMidOnsetRaw[i] + highOnsetRaw[i];
  }

  const result = _analyzeBPM(bassNorm, midNorm, highMidNorm, highNorm, energyNorm, energyNovNorm, frameTimes, combinedOnsetRaw);
  console.log(`[BPM] Detection took ${(performance.now() - t0).toFixed(0)}ms`);
  return result;
}

/**
 * Detect dynamic BPM with per-section tempo.
 * Uses wider windows (10s) with finer hop (1.5s) than static analysis,
 * a 5-point median filter, and relaxed vote fallback threshold for
 * shorter data segments.
 * @param {AudioBuffer} audioBuffer
 * @param {Object} [opts]
 * @param {number} [opts.windowSec=10] - analysis window size (wider for stability)
 * @param {number} [opts.hopSec=1.5]   - window hop size (finer for granularity)
 * @param {number} [opts.mergeTol=3]   - BPM tolerance for merging adjacent sections
 * @returns {Array<{ startTime: number, endTime: number, bpm: number, confidence: number }>}
 */
function detectDynamicBPM(audioBuffer, opts = {}) {
  const t0 = performance.now();
  const windowSec = opts.windowSec || 10;
  const hopSec    = opts.hopSec || 1.5;
  const mergeTol  = opts.mergeTol || 3;

  const mono = _toMono(audioBuffer);
  const sr   = audioBuffer.sampleRate;
  const dur  = audioBuffer.duration;

  const {
    bassOnsetRaw, midOnsetRaw, highMidOnsetRaw, highOnsetRaw,
    energyRaw, energyNoveltyRaw, frameTimes
  } = _computeOnsetAndEnergy(mono, sr);

  const bassNorm     = _normalize(bassOnsetRaw);
  const midNorm      = _normalize(midOnsetRaw);
  const highMidNorm  = _normalize(highMidOnsetRaw);
  const highNorm     = _normalize(highOnsetRaw);
  const energyNorm   = _normalize(energyRaw);
  const energyNovNorm = _normalize(energyNoveltyRaw);

  const combinedOnsetRaw = new Float32Array(frameTimes.length);
  for (let i = 0; i < frameTimes.length; i++) {
    combinedOnsetRaw[i] = bassOnsetRaw[i] + midOnsetRaw[i] + highMidOnsetRaw[i] + highOnsetRaw[i];
  }

  const rawHz = frameTimes.length > 1 ? 1 / (frameTimes[1] - frameTimes[0]) : 1;

  // Dynamic-specific analysis options: scale tempogram to window, relax fallback
  const dynAnalysisOpts = {
    acfTop: 3,
    tempogramWinSec: Math.min(6, windowSec * 0.8),
    minVoteFallback: 2  // relaxed: shorter windows yield fewer agreeing paths
  };

  const rawSections = [];
  for (let wStart = 0; wStart + windowSec <= dur; wStart += hopSec) {
    const wEnd = wStart + windowSec;
    const iStart = Math.floor(wStart * rawHz);
    const iEnd   = Math.min(Math.ceil(wEnd * rawHz), bassNorm.length);
    if (iEnd - iStart < 10) continue;

    const result = _analyzeBPM(
      bassNorm.slice(iStart, iEnd),
      midNorm.slice(iStart, iEnd),
      highMidNorm.slice(iStart, iEnd),
      highNorm.slice(iStart, iEnd),
      energyNorm.slice(iStart, iEnd),
      energyNovNorm.slice(iStart, iEnd),
      frameTimes.slice(iStart, iEnd),
      combinedOnsetRaw.slice(iStart, iEnd),
      dynAnalysisOpts
    );

    rawSections.push({
      startTime: wStart,
      endTime: wEnd,
      bpm: result.bpm,
      confidence: result.confidence
    });
  }

  if (rawSections.length === 0) {
    const global = detectBPM(audioBuffer, opts);
    return [{ startTime: 0, endTime: dur, bpm: global.bpm, confidence: global.confidence }];
  }

  // 5-point median filter for dynamic (wider than static's 3-point)
  if (rawSections.length >= 5) {
    const bpms = rawSections.map(s => s.bpm);
    for (let i = 2; i < rawSections.length - 2; i++) {
      const window = [bpms[i - 2], bpms[i - 1], bpms[i], bpms[i + 1], bpms[i + 2]].sort((a, b) => a - b);
      rawSections[i].bpm = window[2];
    }
  } else if (rawSections.length >= 3) {
    const bpms = rawSections.map(s => s.bpm);
    for (let i = 1; i < rawSections.length - 1; i++) {
      const trio = [bpms[i - 1], bpms[i], bpms[i + 1]].sort((a, b) => a - b);
      rawSections[i].bpm = trio[1];
    }
  }

  // Merge adjacent windows into sections (confidence-weighted)
  const sections = [{ ...rawSections[0] }];
  for (let i = 1; i < rawSections.length; i++) {
    const prev = sections[sections.length - 1];
    const cur  = rawSections[i];
    if (Math.abs(prev.bpm - cur.bpm) <= mergeTol) {
      prev.endTime = cur.endTime;
      if (cur.confidence > prev.confidence) prev.bpm = cur.bpm;
      prev.confidence = Math.max(prev.confidence, cur.confidence);
    } else {
      cur.startTime = prev.endTime;
      sections.push({ ...cur });
    }
  }

  // Absorb short sections (< minSectionSec) into neighbors
  const minSectionSec = opts.minSectionSec || 4;
  let si = 0;
  while (si < sections.length) {
    const sec = sections[si];
    if (sec.endTime - sec.startTime < minSectionSec && sections.length > 1) {
      if (si === 0) {
        sections[1].startTime = sec.startTime;
      } else {
        sections[si - 1].endTime = sec.endTime;
      }
      sections.splice(si, 1);
    } else {
      si++;
    }
  }

  sections[0].startTime = 0;
  sections[sections.length - 1].endTime = dur;

  console.log(`[BPM] Dynamic detection took ${(performance.now() - t0).toFixed(0)}ms`);
  return sections;
}
