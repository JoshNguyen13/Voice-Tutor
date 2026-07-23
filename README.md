# Voice Tutor

A browser-based public speaking coach. Pick a real-world scenario, read it aloud (or improvise from a premise), and get an instant score with specific, actionable feedback — pace, accuracy, filler words, hesitation pauses, and even vocal monotone detection.

Everything runs entirely in your browser. There's no backend, no database, no accounts, and no paid APIs — the whole app is a static site that costs nothing to host or run.

## How it works

The core design decision is that most practice sessions are read from a **known script**. Because the app knows exactly what you were supposed to say, scoring becomes a comparison problem (how close was what you said to the script, and how was it delivered?) rather than an open-ended judgment problem (was this a good speech?). Comparison problems can be solved with plain, deterministic code instead of AI — that's what makes a zero-cost version of this app possible.

1. **Capture** — the Web Speech API transcribes your voice live as you speak, while MediaRecorder captures the raw audio in parallel for playback.
2. **Alignment** *(Scripted/Teleprompter modes only)* — a hand-implemented Levenshtein edit-distance algorithm aligns your transcript against the target script word-by-word, tolerating near-misses (likely transcription noise) without penalizing you for them.
3. **Metrics** — pace (words per minute, including a per-third breakdown), accuracy, filler-word count, and hesitation-vs-rhetorical pause detection, plus an entirely separate pitch/monotone analysis run on the raw audio via the Web Audio API.
4. **Feedback** — a library of 30 threshold- and combination-based templates turns the raw metrics into plain-English coaching (e.g. "You're rushing and it's costing you words"), always leading with something positive and capped at two pieces of criticism per session.

## Practice modes

- **Scripted** — read a ~90-140 word paragraph aloud; scored on accuracy, pace, fluency, and consistency.
- **Teleprompter** — the same script, auto-scrolling at a speed you choose (Very Slow → Very Fast) so you don't have to track your own position on the page. Scored identically to Scripted mode, with its own separate retry-history.
- **Freestyle** — just a premise and a suggested time limit; you speak in your own words. No accuracy metric (there's no script to compare against), so the score weights pace, fluency, and consistency instead.

A **random scenario picker** (with an optional difficulty filter) is also available if you'd rather not browse the library yourself.

## Features

- 40 scenarios across professional, social, and ceremonial categories, at three difficulty levels
- Real-time, in-browser speech transcription (no server round-trip)
- Word-level accuracy scoring with positional feedback ("all your filler words came in the first half," or the exact phrase you hesitated on)
- Pitch/monotone detection via a hand-rolled autocorrelation pitch detector over raw audio samples
- In-session audio playback and a one-click download of your recording
- "Retry and compare" — see this attempt's scores side-by-side with your last attempt at the same scenario+mode, stored locally
- No accounts, no database, no tracking — your only persistence is your own browser's `localStorage`

## Tech stack

- **React + Vite** for the UI
- **Web Speech API** for speech-to-text (Chrome/Edge only — this API isn't implemented in Firefox)
- **MediaRecorder API** for audio capture/playback
- **Web Audio API** for pitch analysis
- Plain, dependency-free JavaScript for the entire analysis engine (alignment, metrics, feedback, pitch detection) — no ML libraries, no LLM calls, nothing external

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL in **Chrome or Edge** (required for the Web Speech API) and grant microphone access when prompted.

```bash
npm run build      # production build to dist/
npm run preview    # preview the production build locally
```

Because this is a fully static site, `dist/` can be deployed to any static host (GitHub Pages, Netlify, Vercel) with zero configuration — no environment variables, no server, no build-time secrets.

## Project structure

```
src/
  analysis/       Pure, framework-free scoring engine
    tokenize.js     shared word-splitting/sentence-boundary helper
    align.js        Levenshtein alignment between script and transcript
    metrics.js       pace/accuracy/filler/pause metrics + weighted scoring
    feedback.js      threshold/combination feedback template library
    pitch.js         autocorrelation-based pitch/monotone detection
  components/     React UI
    ScenarioPicker.jsx   scenario library, category grouping, random picker
    PracticeScreen.jsx   recording flow, Web Speech/MediaRecorder integration, teleprompter
    ResultsScreen.jsx    scores, feedback, playback, retry-compare
    UnsupportedBrowser.jsx
  utils/          Browser-API glue (kept separate from the pure analysis engine)
    speechSupport.js     Web Speech API feature detection
    audioAnalysis.js     decodes/downsamples recorded audio for pitch.js
    history.js           localStorage retry-compare persistence
  data/
    scenarios.json  the scenario library
```

The `analysis/` modules are plain functions with no React or browser dependency — they take a transcript/audio buffer and return data, which makes them straightforward to test in isolation and, in principle, reusable outside the browser.

## Browser support

Requires Chrome or Edge (desktop) for the Web Speech API. Unsupported browsers see a friendly message rather than a broken page. Microphone access requires a secure context — this is automatic on `localhost` during development and on any HTTPS static host in production.

