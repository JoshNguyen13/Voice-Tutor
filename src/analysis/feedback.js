// Threshold-driven feedback templates. No AI: every message here is an
// if/then over the metrics computed in metrics.js. Positive templates
// always contribute the opening line; at most two improvement templates
// are shown, so a bad take never turns into a wall of criticism.
//
// Phase 2 adds three kinds of template beyond simple single-metric
// thresholds:
//
//   1. Combination templates -- two metrics read together produce a more
//      insightful observation than either alone (e.g. fast pace *and* low
//      accuracy means "you're rushing", not two separate complaints).
//   2. Positional templates -- metrics.js's Phase 2 additions
//      (fillersFirstHalf/fillersSecondHalf, firstHesitationPhrase) let a
//      template point at *where* in the script something happened, not
//      just how often.
//   3. `supersedes` -- when a more specific/insightful template fires
//      (usually a combo or positional one), it can list the ids of
//      plainer templates it makes redundant. Those are dropped before
//      ranking, so a rushed-and-inaccurate take shows one sharp combined
//      note instead of two generic ones saying almost the same thing.
const TEMPLATES = [
  // ---- Positive templates ----
  {
    id: 'clean-and-accurate',
    type: 'positive',
    priority: 12,
    condition: (m) => m.mode === 'scripted' && m.accuracy >= 95 && m.fillerCount === 0,
    message: () => `Word-perfect and not a single filler word -- that's about as clean as a read gets.`,
    supersedes: ['great-accuracy', 'no-fillers'],
  },
  {
    id: 'strong-overall',
    type: 'positive',
    priority: 11,
    condition: (m) => m.overallScore >= 85,
    message: (m) =>
      `Excellent ${m.mode === 'scripted' ? 'reading' : 'speech'} -- ${m.overallScore}/100 overall. This is genuinely strong, polished delivery.`,
  },
  {
    id: 'great-consistency-and-pace',
    type: 'positive',
    priority: 10,
    condition: (m) => m.subScores.pace >= 90 && m.subScores.consistency >= 90,
    message: (m) =>
      `Both your pace and your rhythm were excellent -- ${m.wpm} WPM held steady the whole way through, which reads as natural and well-controlled.`,
    supersedes: ['great-pace', 'steady-pace'],
  },
  {
    id: 'great-pace',
    type: 'positive',
    priority: 8,
    condition: (m) => m.subScores.pace >= 90,
    message: (m) => `Your pace was right in the sweet spot -- ${m.wpm} words per minute reads as natural and controlled.`,
  },
  {
    id: 'great-accuracy',
    type: 'positive',
    priority: 7,
    condition: (m) => m.mode === 'scripted' && m.accuracy >= 95,
    message: () => `You stayed extremely close to the script -- barely a word out of place.`,
  },
  {
    id: 'no-fillers',
    type: 'positive',
    priority: 6,
    condition: (m) => m.fillerCount === 0 && m.wordCount > 0,
    message: (m) => `Not a single filler word -- that's a clean, confident ${m.mode === 'scripted' ? 'read' : 'delivery'}.`,
  },
  {
    id: 'steady-pace',
    type: 'positive',
    priority: 5,
    condition: (m) => m.subScores.consistency >= 85,
    message: () => `Your pace stayed steady from start to finish -- no rushing at the end.`,
  },
  {
    id: 'great-freestyle-timing',
    type: 'positive',
    priority: 5,
    condition: (m) =>
      m.mode === 'freestyle' && m.targetSeconds != null && Math.abs(m.durationSeconds - m.targetSeconds) <= m.targetSeconds * 0.2,
    message: (m) => `You landed right around the suggested ${m.targetSeconds} seconds -- good sense of pacing for the format.`,
  },
  {
    // m.pitch comes from analysis/pitch.js via PracticeScreen, not
    // metrics.js -- it's optional bonus analysis (see VoiceTutor.md's
    // "Possible directions") and can be null if pitch detection found too
    // little voiced signal to say anything meaningful, so every pitch
    // template guards on m.pitch existing first.
    id: 'good-pitch-variation',
    type: 'positive',
    priority: 4,
    condition: (m) => m.pitch && !m.pitch.isMonotone,
    message: () => `You had good vocal variation throughout -- that expressiveness makes a real difference in how engaging this sounds.`,
  },
  {
    // Section 1's guiding principle is that feedback always leads with a
    // genuine positive, even on a rough attempt -- these two fill the
    // score bands where nothing else specific enough triggers, so the
    // opener is tailored to "this was hard" rather than always falling
    // back to the generic completed-it message below.
    id: 'low-score-encourage',
    type: 'positive',
    priority: 3,
    condition: (m) => m.overallScore < 50,
    message: () => `Every attempt teaches you something concrete to fix -- that's exactly how this gets easier next time.`,
  },
  {
    id: 'mid-pack-encourage',
    type: 'positive',
    priority: 2,
    condition: (m) => m.overallScore >= 50 && m.overallScore < 75,
    message: () => `There's a clear foundation here -- a couple of focused tweaks below will move the score up quickly.`,
  },
  {
    id: 'completed-it',
    type: 'positive',
    priority: 1,
    condition: (m) => m.wordCount > 0,
    message: (m) =>
      m.mode === 'scripted'
        ? `You made it through the whole paragraph out loud -- that's the hardest part of practicing.`
        : `You spoke the whole way through without a script to lean on -- that's the hardest part of practicing.`,
  },

  // ---- Improvement templates ----
  {
    id: 'rush-and-inaccurate',
    type: 'improvement',
    priority: 16,
    condition: (m) => m.mode === 'scripted' && m.wpm > 170 && m.accuracy < 88,
    message: (m) =>
      `You're rushing and it's costing you words -- ${m.wpm} WPM with ${m.accuracy}% accuracy suggests slowing down will fix both at once.`,
    supersedes: ['too-fast', 'low-accuracy', 'accuracy-borderline'],
  },
  {
    id: 'rush-and-fillers',
    type: 'improvement',
    priority: 15,
    condition: (m) => m.wpm > 165 && m.fillerCount >= 3,
    message: (m) =>
      `Talking fast and filling gaps with "um"s often go together -- ${m.wpm} WPM with ${m.fillerCount} filler words suggests a deliberately slower pace would clean up both.`,
    supersedes: ['too-fast', 'many-fillers', 'fillers-clustered-early', 'fillers-clustered-late'],
  },
  {
    id: 'slow-and-hesitant',
    type: 'improvement',
    priority: 15,
    condition: (m) => m.wpm > 0 && m.wpm < 115 && m.pauseCount >= 2,
    message: () =>
      `A slow pace plus frequent pauses can point to uncertainty with the material -- a couple more run-throughs beforehand should help both.`,
    supersedes: ['too-slow', 'pauses', 'hesitation-phrase'],
  },
  {
    id: 'accurate-but-inconsistent',
    type: 'improvement',
    priority: 10,
    condition: (m) => m.mode === 'scripted' && m.accuracy >= 92 && m.subScores.consistency < 70,
    message: () =>
      `You clearly know the words -- accuracy is strong -- but your pace swings around a lot. Smoothing that out is the next thing to work on.`,
    supersedes: ['inconsistent-pace'],
  },
  {
    // Positional (Phase 2): names the specific spot the alignment step
    // flagged as a hesitation, rather than just a count -- see metrics.js's
    // firstHesitationPhrase for how that position is derived.
    id: 'hesitation-phrase',
    type: 'improvement',
    priority: 9,
    condition: (m) => m.mode === 'scripted' && Boolean(m.firstHesitationPhrase),
    message: (m) =>
      `You hesitated right around "${m.firstHesitationPhrase}" -- practicing that phrase on its own a few times usually smooths it out.`,
    supersedes: ['pauses'],
  },
  {
    // Positional (Phase 2): fires only when every filler landed in one
    // half of the paragraph, per metrics.js's fillersFirstHalf/
    // fillersSecondHalf -- a clean, honest signal rather than a fuzzy
    // percentage threshold.
    id: 'fillers-clustered-early',
    type: 'improvement',
    priority: 9,
    condition: (m) => m.mode === 'scripted' && m.fillerCount >= 2 && m.fillersFirstHalf === m.fillerCount,
    message: (m) =>
      `All ${m.fillerCount} of your filler words came in the first half of the paragraph -- nerves at the start are normal; try taking a breath before you begin.`,
    supersedes: ['many-fillers', 'some-fillers'],
  },
  {
    id: 'fillers-clustered-late',
    type: 'improvement',
    priority: 9,
    condition: (m) => m.mode === 'scripted' && m.fillerCount >= 2 && m.fillersSecondHalf === m.fillerCount,
    message: (m) =>
      `All ${m.fillerCount} of your filler words came in the second half -- focus can drift as you near the end; a steady finish helps.`,
    supersedes: ['many-fillers', 'some-fillers'],
  },
  {
    id: 'too-fast',
    type: 'improvement',
    priority: 8,
    condition: (m) => m.wpm > 170,
    message: (m) => `Try slowing down -- you averaged ${m.wpm} WPM. Comfortable speaking pace sits around 130-160.`,
  },
  {
    id: 'too-slow',
    type: 'improvement',
    priority: 8,
    condition: (m) => m.wpm > 0 && m.wpm < 110,
    message: (m) => `You spoke quite slowly at ${m.wpm} WPM -- a bit more pace will help you sound more natural and confident.`,
  },
  {
    id: 'speeds-up',
    type: 'improvement',
    priority: 7,
    condition: (m) => m.wpmByThird[0] > 0 && m.wpmByThird[2] > m.wpmByThird[0] * 1.25,
    message: (m) =>
      `You sped up noticeably by the end -- the final third came out at ${m.wpmByThird[2]} WPM versus ${m.wpmByThird[0]} at the start. Try pacing yourself evenly throughout.`,
  },
  {
    // The mirror image of speeds-up: a fade from the middle rather than an
    // acceleration from the start. The `wpmByThird[2] <= wpmByThird[0]`
    // clause keeps this mutually exclusive with speeds-up -- a session
    // can't simultaneously be "finishing faster than it started" and
    // "losing momentum toward the end".
    id: 'trails-off',
    type: 'improvement',
    priority: 7,
    condition: (m) => m.wpmByThird[1] > 0 && m.wpmByThird[2] < m.wpmByThird[1] * 0.75 && m.wpmByThird[2] <= m.wpmByThird[0],
    message: (m) =>
      `You lost momentum toward the end -- pace dropped from ${m.wpmByThird[1]} WPM in the middle to ${m.wpmByThird[2]} WPM at the close. Push through to the finish with the same energy you started with.`,
  },
  {
    id: 'many-fillers',
    type: 'improvement',
    priority: 6,
    condition: (m) => m.fillerCount >= 3,
    message: (m) =>
      `You used ${m.fillerCount} filler words ("um", "uh") this time. Pausing silently instead -- even for a beat -- reads as more confident than filling the gap.`,
  },
  {
    id: 'low-accuracy',
    type: 'improvement',
    priority: 6,
    condition: (m) => m.mode === 'scripted' && m.accuracy < 85,
    message: (m) =>
      `Your accuracy came in at ${m.accuracy}% -- this can be a real misread, but it's also often the microphone mishearing you. Try again in a quieter spot before assuming it's you.`,
  },
  {
    id: 'accuracy-borderline',
    type: 'improvement',
    priority: 5,
    condition: (m) => m.mode === 'scripted' && m.accuracy >= 85 && m.accuracy < 95,
    message: (m) =>
      `You were close to word-perfect at ${m.accuracy}% accuracy, but a few words drifted from the script -- one more run-through should lock it in.`,
  },
  {
    // In scripted mode the target text's sentence boundaries let the
    // engine confidently call this hesitation rather than a natural
    // pause. Freestyle has no such structure to compare against, so the
    // wording stays deliberately softer and doesn't pinpoint a cause.
    id: 'pauses',
    type: 'improvement',
    priority: 5,
    condition: (m) => m.pauseCount >= 2,
    message: (m) =>
      m.mode === 'scripted'
        ? `You paused mid-sentence ${m.pauseCount} times, which usually signals reading ahead or losing your place. A quick runthrough beforehand can smooth this out.`
        : `You had a few longer pauses while speaking (${m.pauseCount}). That's normal when improvising -- getting a little more comfortable with the topic beforehand can help it flow more smoothly.`,
  },
  {
    id: 'some-fillers',
    type: 'improvement',
    priority: 4,
    condition: (m) => m.fillerCount === 1 || m.fillerCount === 2,
    message: (m) => `A couple of filler words snuck in (${m.fillerCount}). Try replacing them with a brief silent pause.`,
  },
  {
    id: 'freestyle-too-short',
    type: 'improvement',
    priority: 4,
    condition: (m) => m.mode === 'freestyle' && m.targetSeconds != null && m.durationSeconds < m.targetSeconds * 0.5,
    message: (m) =>
      `You wrapped up in about ${m.durationSeconds}s, well under the suggested ${m.targetSeconds}s -- there was room to develop your points further.`,
  },
  {
    id: 'freestyle-too-long',
    type: 'improvement',
    priority: 4,
    condition: (m) => m.mode === 'freestyle' && m.targetSeconds != null && m.durationSeconds > m.targetSeconds * 1.5,
    message: (m) =>
      `You ran to about ${m.durationSeconds}s, well past the suggested ${m.targetSeconds}s -- practice trimming this down to the key points.`,
  },
  {
    id: 'inconsistent-pace',
    type: 'improvement',
    priority: 3,
    condition: (m) => m.subScores.consistency < 70,
    message: () =>
      `Your pace swung noticeably across the paragraph. Aiming for one even, steady speed all the way through will make the read feel more controlled.`,
  },
  {
    // See the comment on good-pitch-variation above: m.pitch is optional
    // bonus analysis, never guaranteed to be present.
    id: 'monotone-delivery',
    type: 'improvement',
    priority: 4,
    condition: (m) => m.pitch?.isMonotone === true,
    message: () =>
      `Your pitch stayed pretty flat throughout -- adding a little more vocal variation, especially on key words, will help this land with more energy.`,
  },
]

const GENERIC_POSITIVE =
  'Good work getting through a full practice rep -- that repetition is how speaking skill actually improves.'

/**
 * Runs every template's condition against this attempt's metrics and picks
 * what to actually show: the single best-fitting positive (always shown,
 * falling back to a generic line if nothing more specific triggers), plus
 * up to two of the highest-priority improvements. Templates listed in a
 * fired template's `supersedes` are dropped first, so a combo or
 * positional template replaces the plainer ones it makes redundant instead
 * of piling on top of them.
 *
 * @param {object} metrics output of computeScriptedMetrics or computeFreestyleMetrics
 * @returns {{type: 'positive'|'improvement', text: string}[]}
 */
export function generateFeedback(metrics) {
  const triggered = TEMPLATES.filter((t) => t.condition(metrics))
  const superseded = new Set(triggered.flatMap((t) => t.supersedes ?? []))
  const eligible = triggered.filter((t) => !superseded.has(t.id))

  const positives = eligible.filter((t) => t.type === 'positive').sort((a, b) => b.priority - a.priority)
  const improvements = eligible.filter((t) => t.type === 'improvement').sort((a, b) => b.priority - a.priority)

  const messages = [
    {
      type: 'positive',
      text: positives.length ? positives[0].message(metrics) : GENERIC_POSITIVE,
    },
  ]

  // Cap criticism at two items per session, even if more conditions fire --
  // encouragement over completeness is the whole design philosophy here.
  improvements.slice(0, 2).forEach((t) => {
    messages.push({ type: 'improvement', text: t.message(metrics) })
  })

  return messages
}
