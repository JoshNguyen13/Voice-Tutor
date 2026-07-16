import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getSpeechRecognition } from '../utils/speechSupport.js'
import { getLastAttempt, saveLastAttempt } from '../utils/history.js'
import { analyzeAudioPitch } from '../utils/audioAnalysis.js'
import { alignTranscript } from '../analysis/align.js'
import { computeScriptedMetrics, computeFreestyleMetrics } from '../analysis/metrics.js'
import { generateFeedback } from '../analysis/feedback.js'

const COUNTDOWN_SECONDS = 3

// Teleprompter mode's scroll speed is chosen from qualitative labels rather
// than a raw WPM number. Moderate stays anchored to the app's existing
// "ideal pace" (145 WPM, see metrics.js's curveScore), but the outer tiers
// deliberately widen far beyond realistic speaking pace -- these numbers
// drive a *visual* scroll rate, not a literal reading-speed simulation, and
// a narrower range (previously 90-210) produced a barely-perceptible
// difference between Very Slow and Very Fast once real scroll distances
// were measured (see the viewport-sizing comment below for the other half
// of that fix).
const SPEED_OPTIONS = [
  { key: 'very-slow', label: 'Very Slow', wpm: 60 },
  { key: 'slow', label: 'Slow', wpm: 90 },
  { key: 'slightly-slow', label: 'Slightly Slow', wpm: 115 },
  { key: 'moderate', label: 'Moderate', wpm: 145 },
  { key: 'slightly-fast', label: 'Slightly Fast', wpm: 180 },
  { key: 'fast', label: 'Fast', wpm: 230 },
  { key: 'very-fast', label: 'Very Fast', wpm: 300 },
]
const DEFAULT_SPEED_KEY = 'moderate'

// Fraction of the rendered script height the teleprompter viewport shows at
// once -- the rest is what actually needs to be scrolled through. Clamped
// so it never gets uncomfortably short (MIN) or unnecessarily tall (MAX)
// regardless of how long a given scenario's script is.
const TELEPROMPTER_VISIBLE_FRACTION = 0.5
const TELEPROMPTER_MIN_HEIGHT_PX = 100
const TELEPROMPTER_MAX_HEIGHT_PX = 260

export default function PracticeScreen({ scenario, mode, onComplete, onCancel }) {
  const [phase, setPhase] = useState('idle') // idle | countdown | recording | processing | permission-denied | error
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [interimText, setInterimText] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [speedKey, setSpeedKey] = useState(DEFAULT_SPEED_KEY) // teleprompter mode only

  const recognitionRef = useRef(null)
  const shouldBeListeningRef = useRef(false)
  const startTimeRef = useRef(0)
  const chunksRef = useRef([]) // { text, time } -- time is ms since recording started

  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  // Teleprompter mode only. viewportRef/textRef are the scrollable window
  // and the text block inside it; maxScrollPxRef/pixelsPerSecondRef are
  // refs (not state) since the scroll animation writes to the DOM directly
  // every frame and neither value should ever trigger a re-render.
  const viewportRef = useRef(null)
  const textRef = useRef(null)
  const maxScrollPxRef = useRef(0)
  const pixelsPerSecondRef = useRef(0)

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
      streamRef.current?.getTracks().forEach((track) => track.stop())
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

  // Teleprompter mode: size the viewport and measure how far the text needs
  // to scroll, once, right after the initial layout (useLayoutEffect runs
  // post-layout/pre-paint, so there's no flash of an unsized viewport).
  // This component fully remounts on every retry, so measuring once on
  // mount is sufficient -- a window resize mid-recording would invalidate
  // this, an accepted, known limitation rather than something worth a
  // ResizeObserver.
  //
  // The viewport height is set as a fraction of the text's own rendered
  // height (via scrollHeight, which reports the full content height
  // regardless of the container's overflow/clipping) rather than a fixed
  // CSS pixel value. A fixed height risked being tall enough to fit an
  // entire (shorter) scenario with zero scroll distance left over -- which
  // is exactly what made every speed option look identical (nothing was
  // scrolling). Sizing relative to the actual text guarantees real,
  // proportional scroll distance for any scenario length.
  useLayoutEffect(() => {
    if (mode !== 'teleprompter') return
    if (!viewportRef.current || !textRef.current) return

    const textHeight = textRef.current.scrollHeight
    const viewportHeight = Math.min(
      TELEPROMPTER_MAX_HEIGHT_PX,
      Math.max(TELEPROMPTER_MIN_HEIGHT_PX, textHeight * TELEPROMPTER_VISIBLE_FRACTION)
    )
    viewportRef.current.style.height = `${viewportHeight}px`
    maxScrollPxRef.current = Math.max(0, textHeight - viewportHeight)
  }, [mode])

  // Teleprompter mode: drives the auto-scroll while actually recording.
  // Position is recomputed from scratch every frame as elapsed wall-clock
  // time (Date.now() - startTimeRef.current, the same origin the speech
  // recognition chunk timestamps already use) times a constant speed --
  // never accumulated across renders -- so this is unaffected by React
  // StrictMode's dev-only double-invoke of effects. The scroll offset is
  // written directly to the DOM via textRef rather than through React state
  // or a JSX-controlled style prop: this component re-renders frequently
  // during recording (every interim transcript update), and if `transform`
  // were ever part of a React-managed style object on this element, those
  // re-renders would stomp the imperative write and the scroll would
  // visibly stutter back to its last rendered position.
  useEffect(() => {
    if (mode !== 'teleprompter' || phase !== 'recording') return

    let rafId = requestAnimationFrame(tick)
    function tick() {
      const elapsedMs = Date.now() - startTimeRef.current
      const scrollPx = Math.min(maxScrollPxRef.current, (elapsedMs / 1000) * pixelsPerSecondRef.current)
      if (textRef.current) {
        textRef.current.style.transform = `translateY(-${scrollPx}px)`
      }
      rafId = requestAnimationFrame(tick)
    }

    return () => cancelAnimationFrame(rafId)
  }, [mode, phase])

  function handleStart() {
    setCountdown(COUNTDOWN_SECONDS)
    setPhase('countdown')
  }

  async function beginRecording() {
    chunksRef.current = []
    audioChunksRef.current = []
    setInterimText('')

    // MediaRecorder captures the raw audio for playback -- a separate API
    // from SpeechRecognition, which manages its own mic access internally.
    // Requesting our own stream here is what lets us record audio at all;
    // if the user has already granted mic permission this resolves near-
    // instantly, and if they haven't, this is what shows the prompt.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      if (typeof MediaRecorder !== 'undefined') {
        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data)
        }
        mediaRecorderRef.current = mediaRecorder
        mediaRecorder.start()
      }
    } catch {
      shouldBeListeningRef.current = false
      setPhase('permission-denied')
      return
    }

    startTimeRef.current = Date.now()

    // Teleprompter mode: derive a constant scroll rate from the chosen
    // speed label and the script's word count, read fresh at this exact
    // moment (rather than captured by a useEffect dependency), so there's
    // no stale-closure risk if the user changed the speed selection right
    // before pressing Start.
    if (mode === 'teleprompter') {
      const wordCount = scenario.text.trim().split(/\s+/).length
      const wpm = SPEED_OPTIONS.find((opt) => opt.key === speedKey)?.wpm ?? 145
      const estimatedSeconds = (wordCount / wpm) * 60 || 1
      pixelsPerSecondRef.current = maxScrollPxRef.current / estimatedSeconds
    }

    shouldBeListeningRef.current = true
    setPhase('recording')
    recognitionRef.current.start()
  }

  // Resolves once the recorder has actually finished writing its last
  // chunk (rather than guessing with a fixed delay), so the resulting
  // Blob is never missing the tail end of the recording. Returns both the
  // Blob itself (needed for pitch analysis) and a playable object URL
  // built from it (needed for the <audio> element and download link).
  function stopMediaRecorder() {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve({ blob: null, url: null })
        return
      }
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' })
        resolve({ blob, url: URL.createObjectURL(blob) })
      }
      mediaRecorder.stop()
    })
  }

  async function handleStop() {
    shouldBeListeningRef.current = false
    recognitionRef.current.stop()
    setPhase('processing')

    const { blob: audioBlob, url: audioUrl } = await stopMediaRecorder()
    streamRef.current?.getTracks().forEach((track) => track.stop())

    // Pitch/monotone analysis (optional bonus feature -- see
    // VoiceTutor.md's "Possible directions"). Runs on the same recorded
    // audio used for playback, entirely separately from the word-level
    // metrics pipeline below. analyzeAudioPitch() never throws -- a
    // failure here should never break the core scoring loop.
    const pitch = audioBlob ? await analyzeAudioPitch(audioBlob) : null

    // Give the last onresult event a beat to land before running the
    // analysis pipeline.
    setTimeout(() => {
      const durationMs = Date.now() - startTimeRef.current
      const transcript = chunksRef.current.map((c) => c.text).join(' ').trim()

      // Alignment only makes sense against a real target script -- both
      // 'scripted' and 'teleprompter' have one (teleprompter is the exact
      // same script, just auto-scrolled), so both take this branch and
      // score identically; only 'freestyle' has no target text to compare
      // against and skips straight to the no-accuracy metrics path.
      const metrics =
        mode === 'freestyle'
          ? computeFreestyleMetrics({
              transcript,
              chunks: chunksRef.current,
              durationMs,
              targetSeconds: scenario.freestyleSeconds,
            })
          : computeScriptedMetrics({
              scenarioText: scenario.text,
              alignment: alignTranscript(scenario.text, transcript),
              chunks: chunksRef.current,
              durationMs,
            })

      // Pitch is merged onto the metrics object (rather than computed
      // inside metrics.js) so feedback templates can reference m.pitch
      // uniformly, while keeping metrics.js itself a pure, Web-Audio-free
      // module that only ever reads the transcript and timing data.
      metrics.pitch = pitch

      const feedback = generateFeedback(metrics)

      // Retry-and-compare (Phase 2): grab whatever was saved from the last
      // attempt at this exact scenario+mode *before* overwriting it with
      // this attempt's scores, so the results screen can show "this time
      // vs. last time" without a real backend -- just one small
      // localStorage entry per scenario+mode.
      const previousAttempt = getLastAttempt(scenario.id, mode)
      saveLastAttempt(scenario.id, mode, { overallScore: metrics.overallScore, subScores: metrics.subScores })

      // uiMode carries the actual selected mode ('scripted' | 'teleprompter'
      // | 'freestyle') through to the results screen. metrics.mode itself
      // stays 'scripted' for teleprompter attempts (see computeScriptedMetrics
      // above) so feedback.js's scripted-only templates keep firing correctly
      // -- uiMode exists purely so ResultsScreen can label the score and name
      // the downloaded recording accurately, without that decision affecting
      // which feedback/accuracy data actually gets computed.
      onComplete({ transcript, metrics, feedback, audioUrl, previousAttempt, uiMode: mode })
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

        {mode === 'scripted' && <p>{scenario.text}</p>}

        {mode === 'freestyle' && (
          <>
            <p className="freestyle-premise">{scenario.premise}</p>
            <p className="freestyle-hint">
              Aim for about {scenario.freestyleSeconds} seconds -- speak in your own words, there's no script to
              read.
            </p>
          </>
        )}

        {mode === 'teleprompter' && (
          <>
            <div className="teleprompter-viewport" ref={viewportRef}>
              <p className="teleprompter-text" ref={textRef}>
                {scenario.text}
              </p>
            </div>

            {phase === 'idle' && (
              <div className="speed-picker">
                <p className="speed-picker-label">Scroll speed</p>
                <div className="speed-picker-options">
                  {SPEED_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`speed-pill${speedKey === option.key ? ' selected' : ''}`}
                      onClick={() => setSpeedKey(option.key)}
                    >
                      {option.label}
                      {option.key === DEFAULT_SPEED_KEY && (
                        <span className="speed-pill-recommended">Recommended</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
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
