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

export default function ResultsScreen({ results, scenario, onRetry, onNewScenario }) {
  const { metrics, feedback, audioUrl } = results
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
