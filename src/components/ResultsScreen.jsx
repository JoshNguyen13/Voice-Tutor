function SubScore({ label, value }) {
  return (
    <div className="sub-score">
      <div className="sub-score-value">{value}</div>
      <div className="sub-score-label">{label}</div>
    </div>
  )
}

function RawMetric({ label, value }) {
  return (
    <div className="raw-metric">
      <div className="raw-metric-value">{value}</div>
      <div className="raw-metric-label">{label}</div>
    </div>
  )
}

// Phase 2's "retry and compare" view: one score, shown next to what the
// same scenario+mode scored on the last attempt (read from localStorage --
// see src/utils/history.js). The delta is colored green/red/gray purely
// from the sign of (current - previous); there's no notion of a "good"
// or "bad" direction baked in beyond "did the number go up or down".
function CompareStat({ label, current, previous }) {
  const delta = current - previous
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const sign = delta > 0 ? '+' : ''

  return (
    <div className={`compare-stat compare-${direction}`}>
      <div className="compare-label">{label}</div>
      <div className="compare-values">
        <span className="compare-current">{current}</span>
        <span className="compare-delta">
          {sign}
          {delta}
        </span>
      </div>
    </div>
  )
}

export default function ResultsScreen({ results, scenario, onRetry, onNewScenario }) {
  const { metrics, feedback, audioUrl, previousAttempt } = results
  const isScripted = metrics.mode === 'scripted'
  const scoreTier = metrics.overallScore >= 80 ? 'high' : metrics.overallScore >= 50 ? 'mid' : 'low'

  return (
    <div className="results-screen">
      <h2>Results: {scenario.title}</h2>

      <div className={`overall-score score-${scoreTier}`}>
        <span className="score-number">{metrics.overallScore}</span>
        <span className="score-label">/ 100</span>
        <div className="score-mode-label">{isScripted ? 'Scripted Score' : 'Freestyle Score'}</div>
      </div>

      <div className="sub-scores">
        <SubScore label="Pace" value={metrics.subScores.pace} />
        {isScripted && <SubScore label="Accuracy" value={metrics.subScores.accuracy} />}
        <SubScore label="Fluency" value={metrics.subScores.fluency} />
        <SubScore label="Consistency" value={metrics.subScores.consistency} />
      </div>

      <div className="raw-metrics">
        <RawMetric label="Words per minute" value={metrics.wpm} />
        {isScripted && <RawMetric label="Accuracy" value={`${metrics.accuracy}%`} />}
        <RawMetric label="Filler words" value={metrics.fillerCount} />
        <RawMetric label="Pauses" value={metrics.pauseCount} />
        <RawMetric label="Duration" value={`${metrics.durationSeconds}s`} />
      </div>

      {previousAttempt && (
        <div className="compare-section">
          <p className="compare-heading">Compared to last attempt</p>
          <div className="compare-grid">
            <CompareStat label="Overall" current={metrics.overallScore} previous={previousAttempt.overallScore} />
            <CompareStat label="Pace" current={metrics.subScores.pace} previous={previousAttempt.subScores.pace} />
            {isScripted && (
              <CompareStat label="Accuracy" current={metrics.subScores.accuracy} previous={previousAttempt.subScores.accuracy} />
            )}
            <CompareStat label="Fluency" current={metrics.subScores.fluency} previous={previousAttempt.subScores.fluency} />
            <CompareStat
              label="Consistency"
              current={metrics.subScores.consistency}
              previous={previousAttempt.subScores.consistency}
            />
          </div>
        </div>
      )}

      {audioUrl && (
        <div className="audio-playback">
          <p>Listen back</p>
          <audio controls src={audioUrl} />
        </div>
      )}

      <div className="feedback-list">
        {feedback.map((item, idx) => (
          <p key={idx} className={`feedback-item feedback-${item.type}`}>
            {item.text}
          </p>
        ))}
      </div>

      <div className="results-actions">
        <button className="record-button" onClick={onRetry}>
          Try Again
        </button>
        <button className="link-button" onClick={onNewScenario}>
          Choose a different scenario
        </button>
      </div>
    </div>
  )
}
