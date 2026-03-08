// js/audio-trim.js — Audio trim utilities
'use strict';

/**
 * Detect silence at start and end of an AudioBuffer.
 * Scans RMS in small windows; first/last window exceeding threshold marks boundary.
 * @param {AudioBuffer} audioBuffer
 * @param {Object} [opts]
 * @param {number} [opts.threshold=-40] — dB threshold (default -40 dB)
 * @param {number} [opts.windowMs=10]   — RMS window size in ms
 * @returns {{ silenceStart: number, silenceEnd: number }}
 *   silenceStart = seconds of silence at the beginning
 *   silenceEnd   = seconds of silence at the end
 */
function detectSilence(audioBuffer, opts = {}) {
  const thresholdDb = opts.threshold || -40;
  const windowMs    = opts.windowMs || 10;
  const sr          = audioBuffer.sampleRate;
  const n           = audioBuffer.length;
  const ch          = audioBuffer.numberOfChannels;

  // Mix to mono for analysis
  const mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = audioBuffer.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += d[i];
  }
  if (ch > 1) for (let i = 0; i < n; i++) mono[i] /= ch;

  const windowSamples = Math.round(sr * windowMs / 1000);
  const thresholdLin  = Math.pow(10, thresholdDb / 20);
  const thresholdSq   = thresholdLin * thresholdLin;

  // Scan from start
  let startSample = 0;
  for (let i = 0; i + windowSamples <= n; i += windowSamples) {
    let sumSq = 0;
    for (let j = i; j < i + windowSamples; j++) sumSq += mono[j] * mono[j];
    if (sumSq / windowSamples >= thresholdSq) {
      startSample = i;
      break;
    }
    startSample = i + windowSamples;
  }

  // Scan from end
  let endSample = n;
  for (let i = n - windowSamples; i >= 0; i -= windowSamples) {
    let sumSq = 0;
    for (let j = i; j < i + windowSamples; j++) sumSq += mono[j] * mono[j];
    if (sumSq / windowSamples >= thresholdSq) {
      endSample = Math.min(n, i + windowSamples);
      break;
    }
    endSample = i;
  }

  return {
    silenceStart: startSample / sr,
    silenceEnd:   Math.max(0, audioBuffer.duration - endSample / sr)
  };
}

/**
 * Compute autotrim points with optional beat padding.
 * @param {AudioBuffer} audioBuffer
 * @param {Object} [opts]
 * @param {number} [opts.bpm]            — BPM for beat padding calculation
 * @param {number} [opts.padBeatsStart=0] — beats of silence to add at start
 * @param {number} [opts.padBeatsEnd=0]   — beats of silence to add at end
 * @returns {{ trimStart: number, trimEnd: number }}
 */
function computeAutotrim(audioBuffer, opts = {}) {
  const { silenceStart, silenceEnd } = detectSilence(audioBuffer);
  const bpm           = opts.bpm || 0;
  const padBeatsStart = opts.padBeatsStart || 0;
  const padBeatsEnd   = opts.padBeatsEnd || 0;

  const beatDur = bpm > 0 ? 60 / bpm : 0;
  const padStart = padBeatsStart * beatDur;
  const padEnd   = padBeatsEnd * beatDur;

  return {
    trimStart: Math.max(0, silenceStart - padStart),
    trimEnd:   Math.min(audioBuffer.duration, audioBuffer.duration - silenceEnd + padEnd)
  };
}
