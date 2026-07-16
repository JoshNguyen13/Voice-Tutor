import { tokenizeWithBoundaries } from './tokenize.js'

const FILLER_WORDS = new Set(['um', 'uh', 'er', 'ah'])
const PAUSE_THRESHOLD_MS = 1500

// Scores 100 inside [idealMin, idealMax] and falls off smoothly outside it --
// gentle near the ideal range, steeper the further out you get.
function curveScore(value, idealMin, idealMax, tolerance) {
  if (value >= idealMin && value <= idealMax) return 100
  const distance = value < idealMin ? idealMin - value : value - idealMax
  const penalty = Math.min(100, 20 * Math.pow(distance / tolerance, 1.5))
  return Math.round(Math.max(0, 100 - penalty))
}

// chunks: [{ text, time }] where time is ms since recording started, one
// entry per "final" Web Speech API result. This is the finest-grained
// timing signal the API exposes -- it does not give per-word timestamps.
export function computeMetrics({ scenarioText, alignment, chunks, durationMs }) {
  const { targetWords, spokenWords, ops } = alignment
  const durationMinutes = Math.max(durationMs, 1) / 60000

  const wpm = Math.round(spokenWords.length / durationMinutes)

  // Accuracy: correct words score full credit, near-misses (likely
  // transcription noise rather than a real misread) score partial credit.
  const targetOps = ops.filter((op) => op.targetIndex !== null)
  const accuracyWeight = targetOps.reduce((sum, op) => {
    if (op.status === 'correct') return sum + 1
    if (op.status === 'near') return sum + 0.9
    return sum
  }, 0)
  const accuracy = targetWords.length
    ? Math.round((accuracyWeight / targetWords.length) * 100)
    : 0

  // Filler words only count spoken words with no counterpart in the
  // script -- a script word is never penalized, even if it happens to
  // also appear on the filler list.
  const fillerCount = ops.filter(
    (op) => op.status === 'inserted' && FILLER_WORDS.has(op.spokenWord)
  ).length

  // Map every spoken word, in chronological order, to the target word it
  // aligned to (or null). This lets a chunk-arrival gap be tied back to a
  // position in the script.
  const spokenTargetIndex = []
  for (const op of ops) {
    if (op.spokenWord !== null) spokenTargetIndex.push(op.targetIndex)
  }

  const targetBoundaries = tokenizeWithBoundaries(scenarioText)

  let cumulativeWords = 0
  const chunkEndIndex = chunks.map((chunk) => {
    cumulativeWords += chunk.text.split(/\s+/).filter(Boolean).length
    return cumulativeWords
  })

  // Pace by thirds: bucket each chunk's arrival time into one of three
  // equal windows of the session and count words spoken in it.
  const thirdMs = durationMs / 3
  const thirdWordCounts = [0, 0, 0]
  chunks.forEach((chunk) => {
    const wordCount = chunk.text.split(/\s+/).filter(Boolean).length
    const bucket = Math.min(2, Math.floor(chunk.time / (thirdMs || 1)))
    thirdWordCounts[bucket] += wordCount
  })
  const wpmByThird = thirdWordCounts.map((count) =>
    Math.round(count / (thirdMs / 60000 || 1))
  )

  // Pauses: a gap between chunks longer than the threshold. A gap that
  // lands at a sentence boundary in the script reads as a deliberate,
  // rhetorical pause; anywhere else, it reads as hesitation.
  let hesitationPauseCount = 0
  let rhetoricalPauseCount = 0
  for (let idx = 0; idx < chunks.length; idx++) {
    const gap = idx === 0 ? chunks[idx].time : chunks[idx].time - chunks[idx - 1].time
    if (gap <= PAUSE_THRESHOLD_MS) continue
    const boundaryWordIndex = idx === 0 ? 0 : chunkEndIndex[idx - 1] - 1
    const targetIndex = spokenTargetIndex[boundaryWordIndex]
    const isRhetorical =
      idx > 0 &&
      targetIndex != null &&
      (targetBoundaries[targetIndex]?.endsSentence || targetIndex === targetWords.length - 1)
    if (isRhetorical) rhetoricalPauseCount++
    else hesitationPauseCount++
  }

  const paceScore = curveScore(wpm, 130, 160, 40)
  const accuracyScore = accuracy
  const fluencyScore = Math.round(Math.max(0, 100 - fillerCount * 6 - hesitationPauseCount * 8))
  const avgThirdWpm = wpmByThird.reduce((a, b) => a + b, 0) / 3
  const maxDeviationPct = avgThirdWpm
    ? (Math.max(...wpmByThird.map((w) => Math.abs(w - avgThirdWpm))) / avgThirdWpm) * 100
    : 0
  const consistencyScore = curveScore(maxDeviationPct, 0, 15, 25)

  const overallScore = Math.round(
    accuracyScore * 0.35 + paceScore * 0.25 + fluencyScore * 0.25 + consistencyScore * 0.15
  )

  return {
    wpm,
    wpmByThird,
    accuracy,
    fillerCount,
    hesitationPauseCount,
    rhetoricalPauseCount,
    wordCount: spokenWords.length,
    durationSeconds: Math.round(durationMs / 1000),
    subScores: {
      pace: paceScore,
      accuracy: accuracyScore,
      fluency: fluencyScore,
      consistency: consistencyScore,
    },
    overallScore,
  }
}
