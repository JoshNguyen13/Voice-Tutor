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
  const [selectedMode, setSelectedMode] = useState(null) // 'scripted' | 'teleprompter' | 'freestyle'
  const [results, setResults] = useState(null)

  if (!isSpeechRecognitionSupported()) {
    return <UnsupportedBrowser />
  }

  function handleSelectScenario(scenario, mode) {
    setSelectedScenario(scenario)
    setSelectedMode(mode)
    setScreen('practice')
  }

  function handlePracticeComplete(sessionResults) {
    setResults(sessionResults)
    setScreen('results')
  }

  // Playback is session-only per the plan -- nothing is persisted, so the
  // in-memory Blob URL is freed the moment we're done showing these results,
  // rather than relying on component-unmount cleanup (which StrictMode's
  // dev-mode double-invoke would trigger before the user ever presses play).
  function releaseAudioUrl() {
    if (results?.audioUrl) URL.revokeObjectURL(results.audioUrl)
  }

  function handleRetry() {
    releaseAudioUrl()
    setResults(null)
    setScreen('practice')
  }

  function handleNewScenario() {
    releaseAudioUrl()
    setSelectedScenario(null)
    setSelectedMode(null)
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
        <PracticeScreen
          scenario={selectedScenario}
          mode={selectedMode}
          onComplete={handlePracticeComplete}
          onCancel={handleNewScenario}
        />
      )}

      {screen === 'results' && results && selectedScenario && (
        <ResultsScreen results={results} scenario={selectedScenario} onRetry={handleRetry} onNewScenario={handleNewScenario} />
      )}
    </div>
  )
}
