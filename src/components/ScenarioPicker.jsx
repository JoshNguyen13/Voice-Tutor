import { useState } from 'react'

const CATEGORY_LABELS = {
  professional: 'Professional',
  social: 'Social',
  ceremonial: 'Ceremonial',
}

const DIFFICULTIES = ['any', 'beginner', 'intermediate', 'advanced']

export default function ScenarioPicker({ scenarios, onSelect }) {
  const [randomDifficulty, setRandomDifficulty] = useState('any')
  const categories = [...new Set(scenarios.map((s) => s.category))]

  // Picks a scenario at random from whatever pool matches the selected
  // difficulty filter (or the full library if "any"), then jumps straight
  // into practice with it -- reuses the same onSelect(scenario, mode)
  // callback each scenario card's own buttons already call, so App.jsx
  // needs no new wiring for this.
  function pickRandom(mode) {
    const pool = randomDifficulty === 'any' ? scenarios : scenarios.filter((s) => s.difficulty === randomDifficulty)
    if (pool.length === 0) return
    const scenario = pool[Math.floor(Math.random() * pool.length)]
    onSelect(scenario, mode)
  }

  return (
    <div className="scenario-picker">
      <div className="random-picker">
        <p className="random-picker-label">Feeling spontaneous?</p>
        <div className="random-picker-controls">
          <select
            className="difficulty-select"
            value={randomDifficulty}
            onChange={(e) => setRandomDifficulty(e.target.value)}
            aria-label="Difficulty filter for random scenario"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d === 'any' ? 'Any difficulty' : d[0].toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
          <button className="mode-button primary" onClick={() => pickRandom('scripted')}>
            Random Scripted
          </button>
          <button className="mode-button" onClick={() => pickRandom('teleprompter')}>
            Random Teleprompter
          </button>
          <button className="mode-button" onClick={() => pickRandom('freestyle')}>
            Random Freestyle
          </button>
        </div>
      </div>

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
                    <button className="mode-button" onClick={() => onSelect(scenario, 'teleprompter')}>
                      Teleprompter
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
