import { tokenize } from './tokenize.js'

/**
 * Character-level edit distance (Levenshtein) between two words.
 * Standard dynamic-programming table: dp[i][j] is the minimum number of
 * single-character inserts/deletes/substitutions to turn a[0..i) into
 * b[0..j). Used by substitutionCost() to detect near-matches like
 * "recieve" vs "receive" that are almost certainly the same word.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} minimum number of single-character edits between a and b
 */
function charDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[a.length][b.length]
}

/**
 * Cost of aligning one target word to one spoken word in the DP table
 * below. Transcription noise and a genuine misread look identical in the
 * data, so this is deliberately forgiving rather than a strict match/no-match:
 *
 *   - 0    exact match ("correct")
 *   - 0.5  near-match: a one-character difference on a word longer than
 *          three characters, almost certainly transcription noise rather
 *          than a real misread ("near")
 *   - 1    anything else -- a genuine substitution
 *
 * @param {string} target word from the scenario script
 * @param {string} spoken word from the transcript
 * @returns {number} 0, 0.5, or 1
 */
function substitutionCost(target, spoken) {
  if (target === spoken) return 0
  if (Math.min(target.length, spoken.length) > 3 && charDistance(target, spoken) <= 1) {
    return 0.5
  }
  return 1
}

/**
 * Aligns the target script against the transcript the browser produced,
 * using word-level edit-distance (the same Levenshtein idea as
 * charDistance(), one level up: rows/columns are words instead of
 * characters). This is Section 4's "Alignment" step -- it's what lets the
 * rest of the analysis engine know, for every word in the script, whether
 * the user said it correctly, said something else instead, or skipped it,
 * without needing to understand the sentence at all.
 *
 * @param {string} targetText the scenario's scripted paragraph
 * @param {string} spokenText transcript assembled from the recognizer's final results
 * @returns {{
 *   targetWords: string[],
 *   spokenWords: string[],
 *   ops: Array<{
 *     targetIndex: number|null,
 *     targetWord: string|null,
 *     spokenWord: string|null,
 *     status: 'correct'|'near'|'substituted'|'skipped'|'inserted'
 *   }>
 * }} tokenized word lists plus one op per aligned event, in chronological
 *    order. Every target word produces exactly one op with a non-null
 *    targetIndex ('correct' | 'near' | 'substituted' | 'skipped'); any
 *    extra words the user said that have no counterpart in the script
 *    show up as separate 'inserted' ops (targetIndex: null) -- this is
 *    also where filler words like "um" get caught downstream.
 */
export function alignTranscript(targetText, spokenText) {
  const targetWords = tokenize(targetText)
  const spokenWords = tokenize(spokenText)
  const n = targetWords.length
  const m = spokenWords.length

  // cost[i][j] = cheapest way to align the first i target words against
  // the first j spoken words. Row/column 0 are the base cases: aligning
  // against zero words costs one "skip" or "insert" per remaining word.
  const cost = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 0; i <= n; i++) cost[i][0] = i
  for (let j = 0; j <= m; j++) cost[0][j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const subCost = substitutionCost(targetWords[i - 1], spokenWords[j - 1])
      cost[i][j] = Math.min(
        cost[i - 1][j - 1] + subCost, // match, near-match, or substitution
        cost[i - 1][j] + 1, // target word skipped
        cost[i][j - 1] + 1 // extra spoken word inserted
      )
    }
  }

  // Backtrace from the bottom-right corner to recover which choice was
  // cheapest at each step. Walking backwards naturally visits words in
  // reverse order, so each op is unshifted onto the front to end up with
  // ops in the same chronological order the words were spoken/scripted.
  const ops = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const subCost = i > 0 && j > 0 ? substitutionCost(targetWords[i - 1], spokenWords[j - 1]) : null
    if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + subCost) {
      // Diagonal move: this spoken word aligns to this target word,
      // whether that's an exact match, a forgiven near-match, or a
      // genuine substitution (see substitutionCost's cost values).
      ops.unshift({
        targetIndex: i - 1,
        targetWord: targetWords[i - 1],
        spokenWord: spokenWords[j - 1],
        status: subCost === 0 ? 'correct' : subCost === 0.5 ? 'near' : 'substituted',
      })
      i--
      j--
    } else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) {
      // Vertical move: this target word has no matching spoken word at
      // all -- the user skipped it.
      ops.unshift({
        targetIndex: i - 1,
        targetWord: targetWords[i - 1],
        spokenWord: null,
        status: 'skipped',
      })
      i--
    } else {
      // Horizontal move: this spoken word has no counterpart in the
      // script -- an extra word the user added (candidate filler word,
      // false start, or transcription artifact).
      ops.unshift({
        targetIndex: null,
        targetWord: null,
        spokenWord: spokenWords[j - 1],
        status: 'inserted',
      })
      j--
    }
  }

  return { targetWords, spokenWords, ops }
}
