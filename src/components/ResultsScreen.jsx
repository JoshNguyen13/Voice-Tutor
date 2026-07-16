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
  const { metrics, feedback } = results

  return (
    <div className="results-screen">
      <h2>Results: {scenario.title}</h2>

      <div className="overall-score">
        <span className="score-number">{metrics.overallScore}</span>
        <span className="score-label">/ 100</span>
      </div>

      <div className="sub-scores">
        <SubScore label="Pace" value={metrics.subScores.pace} />
        <SubScore label="Accuracy" value={metrics.subScores.accuracy} />
        <SubScore label="Fluency" value={metrics.subScores.fluency} />
        <SubScore label="Consistency" value={metrics.subScores.consistency} />
      </div>

      <div className="raw-metrics">
        <RawMetric label="Words per minute" value={metrics.wpm} />
        <RawMetric label="Accuracy" value={`${metrics.accuracy}%`} />
        <RawMetric label="Filler words" value={metrics.fillerCount} />
        <RawMetric label="Duration" value={`${metrics.durationSeconds}s`} />
      </div>

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
