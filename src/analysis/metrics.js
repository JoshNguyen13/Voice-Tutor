import { tokenizeWithBoundaries, tokenize } from './tokenize.js'

// Section 6's full filler list also includes "you know" (a two-word
// phrase) and "so" -- but only when "so" opens a sentence, since it's a
// common, legitimate word otherwise ("so much", "so that"). Both of those
// need multi-word/positional matching that single-word set lookups can't
// do; rather than risk false positives from a blanket "so" match, this
// stays a simple single-word list and leaves those two as a known gap.
const FILLER_WORDS = new Set(['um', 'uh', 'er', 'ah', 'like'])
const PAUSE_THRESHOLD_MS = 1500

// Scores 100 inside [idealMin, idealMax] and falls off smoothly outside it --
// gentle near the ideal range, steeper the further out you get.
function curveScore(value, idealMin, idealMax, tolerance) {
  if (value >= idealMin && value <= idealMax) return 100
  const distance = value < idealMin ? idealMin - value : value - idealMax
  const penalty = Math.min(100, 20 * Math.pow(distance / tolerance, 1.5))
  return Math.round(Math.max(0, 100 - penalty))
}

function wordCountOf(text) {
  return text.split(/\s+/).filter(Boolean).length
}

function fluencyScoreFrom(fillerCount, pauseCount) {
  return Math.round(Math.max(0, 100 - fillerCount * 6 - pauseCount * 8))
}

// Pace, pace-by-thirds, and pace consistency depend only on chunk arrival
// timestamps, never on the target script -- so both modes share this.
function computePaceMetrics(chunks, durationMs) {
  const durationMinutes = Math.max(durationMs, 1) / 60000
  const wordCount = chunks.reduce((sum, c) => sum + wordCountOf(c.text), 0)
  const wpm = Math.round(wordCount / durationMinutes)

  const thirdMs = durationMs / 3
  const thirdWordCounts = [0, 0, 0]
  chunks.forEach((chunk) => {
    const bucket = Math.min(2, Math.floor(chunk.time / (thirdMs || 1)))
    thirdWordCounts[bucket] += wordCountOf(chunk.text)
  })
  const wpmByThird = thirdWordCounts.map((count) => Math.round(count / (thirdMs / 60000 || 1)))

  const avgThirdWpm = wpmByThird.reduce((a, b) => a + b, 0) / 3
  const maxDeviationPct = avgThirdWpm
    ? (Math.max(...wpmByThird.map((w) => Math.abs(w - avgThirdWpm))) / avgThirdWpm) * 100
    : 0

  return {
    wordCount,
    wpm,
    wpmByThird,
    paceScore: curveScore(wpm, 130, 160, 40),
    consistencyScore: curveScore(maxDeviationPct, 0, 15, 25),
  }
}

// chunks: [{ text, time }] where time is ms since recording started, one
// entry per "final" Web Speech API result -- the finest-grained timing
// signal the API exposes (it does not give per-word timestamps).

/**
 * Scripted-mode metrics. The target script gives the engine a known word
 * sequence and sentence structure to compare against, which is what makes
 * accuracy and rhetorical-vs-hesitation pause classification possible. It's
 * also what makes positional analysis possible (Phase 2): because every
 * spoken word is aligned to a position in the script, the engine can say
 * not just "3 filler words" but "3 filler words, all in the first half",
 * and not just "1 hesitation" but "hesitated around the phrase X".
 *
 * @param {string} scenarioText the scenario's scripted paragraph
 * @param {{targetWords: string[], ops: object[]}} alignment output of alignTranscript()
 * @param {{text: string, time: number}[]} chunks final speech-recognition results, time in ms since start
 * @param {number} durationMs total recording duration in ms
 */
export function computeScriptedMetrics({ scenarioText, alignment, chunks, durationMs }) {
  const { targetWords, ops } = alignment
  const pace = computePaceMetrics(chunks, durationMs)

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
  //
  // Positional analysis (Phase 2): for each filler, also note *where* in
  // the script it landed, by tracking the most recent target word the
  // alignment had reached ("runningTargetIndex"). Because ops are in
  // chronological order, this running index is always the script position
  // the user had just spoken up to when the filler occurred. Bucketing
  // that into "first half" / "second half" is what lets the feedback layer
  // say something like "all three filler words came in the first half" --
  // that single distinction is what turns a raw count into a location.
  let fillerCount = 0
  let fillersFirstHalf = 0
  let fillersSecondHalf = 0
  let runningTargetIndex = -1
  for (const op of ops) {
    if (op.targetIndex !== null) runningTargetIndex = op.targetIndex
    if (op.status === 'inserted' && FILLER_WORDS.has(op.spokenWord)) {
      fillerCount++
      if (runningTargetIndex < targetWords.length / 2) fillersFirstHalf++
      else fillersSecondHalf++
    }
  }

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
    cumulativeWords += wordCountOf(chunk.text)
    return cumulativeWords
  })

  // Pauses: a gap between chunks longer than the threshold. A gap that
  // lands at a sentence boundary in the script reads as a deliberate,
  // rhetorical pause; anywhere else, it reads as hesitation. pauseCount
  // only tracks the latter -- rhetorical pauses aren't a flaw.
  //
  // Positional analysis (Phase 2): for the first hesitation pause, also
  // capture the few target words immediately around it as a short phrase
  // (already lowercased/punctuation-stripped by tokenize). This is what
  // lets feedback say "you hesitated around the phrase X" instead of just
  // a count -- naming the specific spot is far more actionable than a
  // number, and it falls straight out of data the alignment already has.
  let pauseCount = 0
  let rhetoricalPauseCount = 0
  let firstHesitationPhrase = null
  for (let idx = 0; idx < chunks.length; idx++) {
    const gap = idx === 0 ? chunks[idx].time : chunks[idx].time - chunks[idx - 1].time
    if (gap <= PAUSE_THRESHOLD_MS) continue
    const boundaryWordIndex = idx === 0 ? 0 : chunkEndIndex[idx - 1] - 1
    const targetIndex = spokenTargetIndex[boundaryWordIndex]
    const isRhetorical =
      idx > 0 &&
      targetIndex != null &&
      (targetBoundaries[targetIndex]?.endsSentence || targetIndex === targetWords.length - 1)
    if (isRhetorical) {
      rhetoricalPauseCount++
    } else {
      pauseCount++
      if (!firstHesitationPhrase && targetIndex != null) {
        const phraseStart = Math.max(0, targetIndex - 1)
        const phraseEnd = Math.min(targetWords.length, targetIndex + 2)
        firstHesitationPhrase = targetWords.slice(phraseStart, phraseEnd).join(' ')
      }
    }
  }

  const fluencyScore = fluencyScoreFrom(fillerCount, pauseCount)
  const overallScore = Math.round(
    accuracy * 0.35 + pace.paceScore * 0.25 + fluencyScore * 0.25 + pace.consistencyScore * 0.15
  )

  return {
    mode: 'scripted',
    wpm: pace.wpm,
    wpmByThird: pace.wpmByThird,
    accuracy,
    fillerCount,
    fillersFirstHalf,
    fillersSecondHalf,
    pauseCount,
    rhetoricalPauseCount,
    firstHesitationPhrase,
    wordCount: pace.wordCount,
    durationSeconds: Math.round(durationMs / 1000),
    subScores: {
      pace: pace.paceScore,
      accuracy,
      fluency: fluencyScore,
      consistency: pace.consistencyScore,
    },
    overallScore,
  }
}

/**
 * Freestyle-mode metrics. There's no target script, so there's no accuracy
 * metric at all, no positional analysis (no known word positions to anchor
 * to), and no way to tell a rhetorical pause from a hesitation pause with
 * any confidence -- every long gap is just counted as a pause. Accuracy's
 * 35% weight is redistributed across pace/fluency/consistency.
 *
 * @param {string} transcript full transcript text assembled from final chunks
 * @param {{text: string, time: number}[]} chunks final speech-recognition results, time in ms since start
 * @param {number} durationMs total recording duration in ms
 * @param {number} [targetSeconds] the scenario's suggested freestyle length, if known --
 *   carried through only so the feedback layer can compare actual vs. suggested length.
 */
export function computeFreestyleMetrics({ transcript, chunks, durationMs, targetSeconds }) {
  const pace = computePaceMetrics(chunks, durationMs)

  const fillerCount = tokenize(transcript).filter((word) => FILLER_WORDS.has(word)).length

  let pauseCount = 0
  for (let idx = 0; idx < chunks.length; idx++) {
    const gap = idx === 0 ? chunks[idx].time : chunks[idx].time - chunks[idx - 1].time
    if (gap > PAUSE_THRESHOLD_MS) pauseCount++
  }

  const fluencyScore = fluencyScoreFrom(fillerCount, pauseCount)
  const overallScore = Math.round(pace.paceScore * 0.4 + fluencyScore * 0.4 + pace.consistencyScore * 0.2)

  return {
    mode: 'freestyle',
    wpm: pace.wpm,
    wpmByThird: pace.wpmByThird,
    fillerCount,
    pauseCount,
    wordCount: pace.wordCount,
    durationSeconds: Math.round(durationMs / 1000),
    targetSeconds: targetSeconds ?? null,
    subScores: {
      pace: pace.paceScore,
      fluency: fluencyScore,
      consistency: pace.consistencyScore,
    },
    overallScore,
  }
}
