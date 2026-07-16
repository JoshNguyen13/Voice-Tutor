import { useEffect, useRef, useState } from 'react'
import { getSpeechRecognition } from '../utils/speechSupport.js'
import { alignTranscript } from '../analysis/align.js'
import { computeMetrics } from '../analysis/metrics.js'
import { generateFeedback } from '../analysis/feedback.js'

const COUNTDOWN_SECONDS = 3

export default function PracticeScreen({ scenario, onComplete, onCancel }) {
  const [phase, setPhase] = useState('idle') // idle | countdown | recording | processing | permission-denied | error
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [interimText, setInterimText] = useState('')
  const [errorDetail, setErrorDetail] = useState('')

  const recognitionRef = useRef(null)
  const shouldBeListeningRef = useRef(false)
  const startTimeRef = useRef(0)
  const chunksRef = useRef([]) // { text, time } -- time is ms since recording started

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition()
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        if (result.isFinal) {
          chunksRef.current.push({ text: text.trim(), time: Date.now() - startTimeRef.current })
          setInterimText('')
        } else {
          setInterimText(text)
        }
      }
    }

    recognition.onerror = (event) => {
      console.error('SpeechRecognition error:', event.error, event.message)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldBeListeningRef.current = false
        setPhase('permission-denied')
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        shouldBeListeningRef.current = false
        setErrorDetail(event.error)
        setPhase('error')
      }
    }

    // The API stops itself after a stretch of silence; restart transparently
    // if the user hasn't pressed stop yet, so a mid-speech pause doesn't end
    // the session early.
    recognition.onend = () => {
      if (shouldBeListeningRef.current) {
        recognition.start()
      }
    }

    recognitionRef.current = recognition

    return () => {
      shouldBeListeningRef.current = false
      recognition.onend = null
      recognition.abort()
    }
  }, [])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown === 0) {
      beginRecording()
      return
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown])

  function handleStart() {
    setCountdown(COUNTDOWN_SECONDS)
    setPhase('countdown')
  }

  function beginRecording() {
    chunksRef.current = []
    setInterimText('')
    startTimeRef.current = Date.now()
    shouldBeListeningRef.current = true
    setPhase('recording')
    recognitionRef.current.start()
  }

  function handleStop() {
    shouldBeListeningRef.current = false
    recognitionRef.current.stop()
    setPhase('processing')

    // Give the last onresult event a beat to land before running the
    // analysis pipeline.
    setTimeout(() => {
      const durationMs = Date.now() - startTimeRef.current
      const transcript = chunksRef.current.map((c) => c.text).join(' ').trim()
      const alignment = alignTranscript(scenario.text, transcript)
      const metrics = computeMetrics({
        scenarioText: scenario.text,
        alignment,
        chunks: chunksRef.current,
        durationMs,
      })
      const feedback = generateFeedback(metrics)
      onComplete({ transcript, metrics, feedback })
    }, 400)
  }

  if (phase === 'permission-denied') {
    return (
      <div className="practice-screen practice-message">
        <h2>Microphone access needed</h2>
        <p>
          Voice Tutor needs microphone permission to hear you read. Check your browser's site
          settings to allow microphone access for this page, then try again.
        </p>
        <button className="link-button" onClick={onCancel}>
          Back to scenarios
        </button>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="practice-screen practice-message">
        <h2>Something went wrong</h2>
        <p>Speech recognition hit an unexpected error{errorDetail ? `: "${errorDetail}"` : ''}. Please try again.</p>
        <button className="link-button" onClick={onCancel}>
          Back to scenarios
        </button>
      </div>
    )
  }

  return (
    <div className="practice-screen">
      <div className="target-text">
        <h2>{scenario.title}</h2>
        <p>{scenario.text}</p>
      </div>

      {phase === 'idle' && (
        <div className="practice-controls">
          <button className="record-button" onClick={handleStart}>
            Start Recording
          </button>
          <button className="link-button" onClick={onCancel}>
            Choose a different scenario
          </button>
        </div>
      )}

      {phase === 'countdown' && <div className="countdown">{countdown === 0 ? 'Go!' : countdown}</div>}

      {phase === 'recording' && (
        <div className="practice-controls">
          <div className="live-transcript">
            {chunksRef.current.map((c) => c.text).join(' ')} <span className="interim">{interimText}</span>
          </div>
          <button className="stop-button" onClick={handleStop}>
            Stop
          </button>
        </div>
      )}

      {phase === 'processing' && <div className="processing">Analyzing your reading&hellip;</div>}
    </div>
  )
}
