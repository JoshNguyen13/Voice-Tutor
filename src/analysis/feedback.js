// Threshold-driven feedback templates. No AI: every message here is an
// if/then over the metrics computed in metrics.js. Positive templates
// always contribute the opening line; at most two improvement templates
// are shown, so a bad take never turns into a wall of criticism.
const TEMPLATES = [
  {
    id: 'strong-overall',
    type: 'positive',
    priority: 10,
    condition: (m) => m.overallScore >= 85,
    message: (m) =>
      `Excellent ${m.mode === 'scripted' ? 'reading' : 'speech'} -- ${m.overallScore}/100 overall. This is genuinely strong, polished delivery.`,
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
    id: 'completed-it',
    type: 'positive',
    priority: 1,
    condition: (m) => m.wordCount > 0,
    message: (m) =>
      m.mode === 'scripted'
        ? `You made it through the whole paragraph out loud -- that's the hardest part of practicing.`
        : `You spoke the whole way through without a script to lean on -- that's the hardest part of practicing.`,
  },
  {
    id: 'too-fast',
    type: 'improvement',
    priority: 9,
    condition: (m) => m.wpm > 170,
    message: (m) => `Try slowing down -- you averaged ${m.wpm} WPM. Comfortable speaking pace sits around 130-160.`,
  },
  {
    id: 'too-slow',
    type: 'improvement',
    priority: 9,
    condition: (m) => m.wpm > 0 && m.wpm < 110,
    message: (m) => `You spoke quite slowly at ${m.wpm} WPM -- a bit more pace will help you sound more natural and confident.`,
  },
  {
    id: 'speeds-up',
    type: 'improvement',
    priority: 8,
    condition: (m) => m.wpmByThird[0] > 0 && m.wpmByThird[2] > m.wpmByThird[0] * 1.25,
    message: (m) =>
      `You sped up noticeably by the end -- the final third came out at ${m.wpmByThird[2]} WPM versus ${m.wpmByThird[0]} at the start. Try pacing yourself evenly throughout.`,
  },
  {
    id: 'many-fillers',
    type: 'improvement',
    priority: 7,
    condition: (m) => m.fillerCount >= 3,
    message: (m) =>
      `You used ${m.fillerCount} filler words ("um", "uh") this time. Pausing silently instead -- even for a beat -- reads as more confident than filling the gap.`,
  },
  {
    id: 'some-fillers',
    type: 'improvement',
    priority: 4,
    condition: (m) => m.fillerCount === 1 || m.fillerCount === 2,
    message: (m) => `A couple of filler words snuck in (${m.fillerCount}). Try replacing them with a brief silent pause.`,
  },
  {
    // In scripted mode the target text's sentence boundaries let the
    // engine confidently call this hesitation rather than a natural
    // pause. Freestyle has no such structure to compare against, so the
    // wording stays deliberately softer and doesn't pinpoint a cause.
    id: 'pauses',
    type: 'improvement',
    priority: 6,
    condition: (m) => m.pauseCount >= 2,
    message: (m) =>
      m.mode === 'scripted'
        ? `You paused mid-sentence ${m.pauseCount} times, which usually signals reading ahead or losing your place. A quick runthrough beforehand can smooth this out.`
        : `You had a few longer pauses while speaking (${m.pauseCount}). That's normal when improvising -- getting a little more comfortable with the topic beforehand can help it flow more smoothly.`,
  },
  {
    id: 'low-accuracy',
    type: 'improvement',
    priority: 5,
    condition: (m) => m.mode === 'scripted' && m.accuracy < 85,
    message: (m) =>
      `Your accuracy came in at ${m.accuracy}% -- this can be a real misread, but it's also often the microphone mishearing you. Try again in a quieter spot before assuming it's you.`,
  },
  {
    id: 'inconsistent-pace',
    type: 'improvement',
    priority: 3,
    condition: (m) => m.subScores.consistency < 70,
    message: () =>
      `Your pace swung noticeably across the paragraph. Aiming for one even, steady speed all the way through will make the read feel more controlled.`,
  },
]

const GENERIC_POSITIVE =
  'Good work getting through a full practice rep -- that repetition is how speaking skill actually improves.'

export function generateFeedback(metrics) {
  const triggered = TEMPLATES.filter((t) => t.condition(metrics))
  const positives = triggered.filter((t) => t.type === 'positive').sort((a, b) => b.priority - a.priority)
  const improvements = triggered.filter((t) => t.type === 'improvement').sort((a, b) => b.priority - a.priority)

  const messages = [
    {
      type: 'positive',
      text: positives.length ? positives[0].message(metrics) : GENERIC_POSITIVE,
    },
  ]

  improvements.slice(0, 2).forEach((t) => {
    messages.push({ type: 'improvement', text: t.message(metrics) })
  })

  return messages
}
