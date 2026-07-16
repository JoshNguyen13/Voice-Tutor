// Pitch (fundamental frequency) analysis, for flagging flat/monotone
// delivery -- one of VoiceTutor.md's optional "possible directions" beyond
// the core two-phase plan. This is deliberately separate from metrics.js:
// it reads the raw audio waveform rather than the transcript/timeline, and
// its result is never folded into the overall score, since Section 6
// defines that score's four sub-scores and weights exhaustively. Pitch is
// an additional, informational signal shown alongside them, not a fifth
// sub-score.
//
// The detector below is time-domain autocorrelation: a classic, well
// understood technique for estimating the pitch of a single voice, with no
// external library needed (matching this project's zero-dependency
// architecture -- the same reasoning that justified hand-rolling the
// Levenshtein alignment in align.js). It's intentionally simpler than a
// production-grade detector like YIN or CREPE: for each short window of
// audio, it looks for the strongest periodic self-similarity within the
// human voice range and reports that lag's corresponding frequency.

const MIN_VOICE_HZ = 80
const MAX_VOICE_HZ = 400
const SILENCE_RMS_THRESHOLD = 0.01
const WINDOW_MS = 40
const HOP_MS = 20

// Below this many Hz of standard deviation across a recording's detected
// pitches, delivery reads as flat/monotone. Like the rest of this engine's
// thresholds (Section 6), this is a starting hypothesis, not a precisely
// tuned value.
const MONOTONE_THRESHOLD_HZ = 15

// Need at least this many voiced windows before reporting anything --
// a handful of stray voiced frames in an otherwise silent/short clip
// isn't enough signal to call a variation number meaningful.
const MIN_VOICED_FRAMES = 10

function rms(buf) {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / buf.length)
}

// Estimates the fundamental frequency of one window via autocorrelation:
// for every candidate lag within the voice-frequency range, measure how
// strongly the signal repeats itself at that lag (the dot product of the
// signal with itself, shifted by the lag), and take the lag with the
// strongest match. Silent or near-silent windows (below the RMS threshold)
// return null rather than a meaningless "pitch".
function detectPitchInWindow(buf, sampleRate) {
  if (rms(buf) < SILENCE_RMS_THRESHOLD) return null

  const minLag = Math.floor(sampleRate / MAX_VOICE_HZ)
  const maxLag = Math.floor(sampleRate / MIN_VOICE_HZ)

  let bestLag = -1
  let bestCorrelation = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0
    for (let i = 0; i < buf.length - lag; i++) {
      correlation += buf[i] * buf[i + lag]
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation
      bestLag = lag
    }
  }

  if (bestLag <= 0) return null
  return sampleRate / bestLag
}

/**
 * Analyzes pitch variation across a full recording by sliding a short
 * window across the audio (with 50% overlap between consecutive windows,
 * per WINDOW_MS/HOP_MS), estimating a fundamental frequency for each
 * voiced window, and summarizing how much that frequency varies overall.
 *
 * @param {Float32Array} samples mono PCM samples, expected to already be
 *   downsampled to something modest (a few kHz) -- see
 *   utils/audioAnalysis.js, which is what actually decodes a recording
 *   into samples before calling this. Kept as a pure function here so the
 *   detection algorithm itself can be tested without a real browser or
 *   real audio hardware.
 * @param {number} sampleRate samples per second
 * @returns {{meanHz: number, variationHz: number, isMonotone: boolean, voicedFrameCount: number} | null}
 *   null when there isn't enough voiced signal to say anything meaningful
 *   (silence, a very short clip, or audio that's mostly noise)
 */
export function analyzePitch(samples, sampleRate) {
  const windowSize = Math.floor((WINDOW_MS / 1000) * sampleRate)
  const hopSize = Math.floor((HOP_MS / 1000) * sampleRate)
  if (windowSize <= 0 || hopSize <= 0) return null

  const pitches = []
  for (let start = 0; start + windowSize <= samples.length; start += hopSize) {
    const window = samples.subarray(start, start + windowSize)
    const hz = detectPitchInWindow(window, sampleRate)
    if (hz !== null) pitches.push(hz)
  }

  if (pitches.length < MIN_VOICED_FRAMES) return null

  const meanHz = pitches.reduce((a, b) => a + b, 0) / pitches.length
  const variance = pitches.reduce((sum, hz) => sum + (hz - meanHz) ** 2, 0) / pitches.length
  const variationHz = Math.sqrt(variance)

  return {
    meanHz: Math.round(meanHz),
    variationHz: Math.round(variationHz),
    isMonotone: variationHz < MONOTONE_THRESHOLD_HZ,
    voicedFrameCount: pitches.length,
  }
}
