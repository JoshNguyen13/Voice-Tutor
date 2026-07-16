import { analyzePitch } from '../analysis/pitch.js'

// Pitch detection only needs to resolve frequencies up to a few hundred Hz
// (human voice range), so decoded audio -- typically 44100/48000 Hz -- is
// decimated down to this rate first. That keeps the autocorrelation loop
// in analyzePitch() fast enough to run synchronously without noticeably
// delaying the results screen (see pitch.js for the cost breakdown).
const TARGET_SAMPLE_RATE = 8000

/**
 * Decodes a recorded audio Blob and runs pitch/monotone analysis on it.
 * This is entirely optional, bonus analysis (see VoiceTutor.md's "Possible
 * directions") layered on top of the core two-phase plan -- it must never
 * break or block the practice loop, so any failure (unsupported browser,
 * a decode error, an empty/corrupt blob) resolves to null rather than
 * throwing.
 *
 * @param {Blob} audioBlob the recording captured by MediaRecorder
 * @returns {Promise<{meanHz: number, variationHz: number, isMonotone: boolean, voicedFrameCount: number} | null>}
 */
export async function analyzeAudioPitch(audioBlob) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null

    const audioContext = new AudioContextClass()
    const arrayBuffer = await audioBlob.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const channelData = audioBuffer.getChannelData(0)
    const nativeSampleRate = audioBuffer.sampleRate

    // Naive decimation (take every Nth sample) rather than a proper
    // band-limited resample -- a real DSP pipeline would low-pass filter
    // first to avoid aliasing, but for a rough pitch/monotone signal
    // (not audio quality) this simplification is an acceptable tradeoff,
    // consistent with how forgiving the rest of this engine's heuristics
    // already are (e.g. align.js's near-match scoring).
    const decimationFactor = Math.max(1, Math.floor(nativeSampleRate / TARGET_SAMPLE_RATE))
    const downsampled = new Float32Array(Math.floor(channelData.length / decimationFactor))
    for (let i = 0; i < downsampled.length; i++) {
      downsampled[i] = channelData[i * decimationFactor]
    }
    const effectiveSampleRate = nativeSampleRate / decimationFactor

    audioContext.close()

    return analyzePitch(downsampled, effectiveSampleRate)
  } catch {
    return null
  }
}
