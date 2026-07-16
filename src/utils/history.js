// Phase 2's "retry and compare" view: remembers only the most recent
// attempt per scenario+mode, so a results screen can show "this attempt
// vs. last time". This is deliberately not a full history log -- Phase 3
// is where real per-session history lives, in a real database. Here we
// only ever need last time's scores, and only until the next attempt
// overwrites them, so a single small localStorage entry per scenario+mode
// is all this calls for.
const STORAGE_PREFIX = 'voice-tutor:last-attempt:'

function keyFor(scenarioId, mode) {
  return `${STORAGE_PREFIX}${scenarioId}:${mode}`
}

/**
 * Reads back the last saved attempt summary for a given scenario+mode, or
 * null if this is the first attempt ever (or storage is unavailable/corrupt).
 *
 * @param {string} scenarioId
 * @param {'scripted'|'freestyle'} mode
 * @returns {{overallScore: number, subScores: object}|null}
 */
export function getLastAttempt(scenarioId, mode) {
  try {
    const raw = localStorage.getItem(keyFor(scenarioId, mode))
    return raw ? JSON.parse(raw) : null
  } catch {
    // Private-browsing storage restrictions, quota errors, or corrupted
    // JSON should just mean "no history available" -- never crash a
    // practice session over a missing comparison feature.
    return null
  }
}

/**
 * Saves a small summary of the just-completed attempt as the new
 * "last attempt" for this scenario+mode, overwriting whatever was there
 * before. Only the scores are kept -- no transcript, no audio -- since
 * that's all a future retry needs to compare against.
 *
 * @param {string} scenarioId
 * @param {'scripted'|'freestyle'} mode
 * @param {{overallScore: number, subScores: object}} summary
 */
export function saveLastAttempt(scenarioId, mode, summary) {
  try {
    localStorage.setItem(keyFor(scenarioId, mode), JSON.stringify(summary))
  } catch {
    // Same reasoning as above: losing the comparison history silently is
    // preferable to surfacing a storage error over a non-essential feature.
  }
}
