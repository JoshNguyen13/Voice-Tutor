import { useState } from 'react'
import ScenarioPicker from './components/ScenarioPicker.jsx'
import PracticeScreen from './components/PracticeScreen.jsx'
import ResultsScreen from './components/ResultsScreen.jsx'
import UnsupportedBrowser from './components/UnsupportedBrowser.jsx'
import { isSpeechRecognitionSupported } from './utils/speechSupport.js'
import scenarios from './data/scenarios.json'

export default function App() {
  const [screen, setScreen] = useState('picker') // picker | practice | results
  const [selectedScenario, setSelectedScenario] = useState(null)
  const [results, setResults] = useState(null)

  if (!isSpeechRecognitionSupported()) {
    return <UnsupportedBrowser />
  }

  function handleSelectScenario(scenario) {
    setSelectedScenario(scenario)
    setScreen('practice')
  }

  function handlePracticeComplete(sessionResults) {
    setResults(sessionResults)
    setScreen('results')
  }

  function handleRetry() {
    setResults(null)
    setScreen('practice')
  }

  function handleNewScenario() {
    setSelectedScenario(null)
    setResults(null)
    setScreen('picker')
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Voice Tutor</h1>
        <p className="app-tagline">Practice speaking out loud. Get real feedback.</p>
      </header>

      {screen === 'picker' && <ScenarioPicker scenarios={scenarios} onSelect={handleSelectScenario} />}

      {screen === 'practice' && selectedScenario && (
        <PracticeScreen scenario={selectedScenario} onComplete={handlePracticeComplete} onCancel={handleNewScenario} />
      )}

      {screen === 'results' && results && selectedScenario && (
        <ResultsScreen results={results} scenario={selectedScenario} onRetry={handleRetry} onNewScenario={handleNewScenario} />
      )}
    </div>
  )
}
