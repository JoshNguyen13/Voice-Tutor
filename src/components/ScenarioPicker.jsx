const CATEGORY_LABELS = {
  professional: 'Professional',
  social: 'Social',
  ceremonial: 'Ceremonial',
}

export default function ScenarioPicker({ scenarios, onSelect }) {
  const categories = [...new Set(scenarios.map((s) => s.category))]

  return (
    <div className="scenario-picker">
      {categories.map((category) => (
        <section key={category} className="scenario-category">
          <h2>{CATEGORY_LABELS[category] ?? category}</h2>
          <div className="scenario-grid">
            {scenarios
              .filter((s) => s.category === category)
              .map((scenario) => (
                <div key={scenario.id} className="scenario-card">
                  <h3>{scenario.title}</h3>
                  <span className={`difficulty difficulty-${scenario.difficulty}`}>{scenario.difficulty}</span>
                  <p>{scenario.text.slice(0, 90)}&hellip;</p>
                  <div className="scenario-card-actions">
                    <button className="mode-button primary" onClick={() => onSelect(scenario, 'scripted')}>
                      Read Script
                    </button>
                    <button className="mode-button" onClick={() => onSelect(scenario, 'freestyle')}>
                      Freestyle
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  )
}
