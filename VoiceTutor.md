# Voice Tutor — Project Planning Document

**Working title:** Speaking App (name TBD)
**Author:** Prepared with Claude
**Date:** July 15, 2026
**Budget constraint:** $0 — every technology chosen in this plan is free to use
**Stack:** React web application

---

## 1. Project Overview

### What we're building

A web application that helps people become better speakers through deliberate practice. The app presents the user with a short paragraph tied to a real-world scenario — an award acceptance speech, a self-introduction at a networking event, a toast at a wedding — and the user reads it aloud into their microphone. The app then analyzes the recording and returns a score along with specific, actionable feedback: whether they spoke too fast, where they hesitated, which words they stumbled over, and how many filler words crept in.

### Why this design works

The critical design decision, made early, is that the user reads a *known script* rather than speaking freely. This matters enormously for feasibility. Because the app knows exactly what the user was supposed to say, judging the speech becomes a comparison problem ("how close was what they said to what they should have said, and how was it delivered?") rather than an open-ended understanding problem ("was this a good speech?"). Comparison problems can be solved with straightforward, deterministic code. Open-ended judgment would require expensive AI. This one decision is what makes a $0 version of this app possible.

### Guiding principles

The app should be encouraging, not punishing. Research on habit formation and every successful practice app (Duolingo being the canonical example) shows that people abandon tools that make them feel bad. Feedback will always lead with what went well and limit criticism to the one or two highest-impact improvements per session, even when the analysis detects more problems than that.

The app should also cost nothing to build or run in its early phases. Every component in this plan — speech recognition, hosting, the frontend framework — has been chosen specifically because it is free. AI-generated coaching (an LLM layer) has been deliberately deferred to a later phase; the architecture is designed so it can be added later without rebuilding anything.

---

## 2. How the App Works — The User's Journey

A single practice session looks like this from the user's perspective. They open the app and see a library of scenarios organized loosely by category. They pick one — say, "Accepting an Award." The app displays a paragraph of roughly 80–120 words and a prominent record button. When they press it, the browser asks for microphone permission (a one-time prompt), a countdown gives them a moment to breathe, and then they read the paragraph aloud while the app listens. When they finish and press stop, the app takes a second or two to analyze, then shows a results screen: an overall score, a small set of sub-scores (pace, accuracy, fluency), and two or three plain-English observations such as "You sped up noticeably in the second half — the last three sentences came out at 190 words per minute" or "You paused for almost three seconds before the word 'grateful'; that's usually a sign of reading ahead." From there they can retry the same paragraph to beat their score or pick a new scenario.

That whole loop — pick, read, get feedback, retry — is the product. Everything else in this document is in service of making that loop work well.

---

## 3. Technology Stack and Why Each Piece Was Chosen

### React (frontend framework)

React is the framework for the user interface. The app is a natural fit for React's component model: the scenario picker, the recorder, and the results screen are cleanly separable components, and the app's state (which scenario is active, whether we're recording, what the results were) maps directly onto React state. The project will be scaffolded with **Vite**, the modern standard tool for starting React projects — it's free, fast, and requires almost no configuration. One command (`npm create vite@latest`) produces a working project skeleton.

### Web Speech API (speech-to-text)

This is the most important technology choice in the project. The Web Speech API is a capability *built into the browser itself* — primarily Chrome and Edge — that converts microphone audio into text. There is no API key, no signup, no server, and no cost. Your JavaScript code creates a `SpeechRecognition` object, starts it, and the browser hands back transcribed text as the user speaks, including timestamps and confidence scores.

Its limitations are real and worth understanding upfront. It does not work in Firefox. Its accuracy is lower than paid services like OpenAI's Whisper, particularly with strong accents, background noise, or poor microphones. And despite running "in the browser," the audio is actually processed on the browser vendor's servers, so it requires an internet connection. For this project, none of these limitations are dealbreakers: users are reading a known script (which makes transcription errors easier to detect and forgive), they're practicing deliberately (so they'll be in reasonably quiet environments), and Chrome/Edge covers the large majority of desktop users. The plan treats "upgrade to a paid transcription API" as a future option that only becomes relevant if free-tier accuracy proves to be a genuine problem in testing.

### Rule-based analysis engine (instead of an LLM, for now)

The "intelligence" of the app in its early phases is ordinary code, not AI. The analysis engine takes the transcript and its timestamps, computes objective metrics (described in depth in Section 6), and converts those metrics into feedback sentences using if/then logic and templates. For example: *if* words-per-minute exceeds 170, *then* show "Try slowing down — you averaged {X} WPM; conversational speaking sits around 130–160."

This is not a compromise to be embarrassed about. Most of what a human speech coach tells a beginner *is* rule-based: slow down, cut the "um"s, don't rush the ending. An LLM adds warmth and specificity to how feedback is phrased, but the underlying observations come from the same metrics either way. By building the metrics engine first, the eventual LLM (Phase 4) becomes a thin layer on top rather than a foundation — which means deferring it costs nothing architecturally.

### Hosting: GitHub Pages, Netlify, or Vercel (all free)

Because the entire app runs in the browser — the Web Speech API needs no backend, and there is no database until Phase 3 — the app is a *static site*: just HTML, CSS, and JavaScript files that any free static host can serve. GitHub Pages, Netlify, and Vercel all offer permanently free tiers that are more than sufficient. One note: browsers only allow microphone access on pages served over HTTPS, and all three of these hosts provide HTTPS automatically, so this requirement takes care of itself.

### Browser localStorage (early persistence)

Before real user accounts exist, the app can remember things — past scores, completed scenarios, streaks — using `localStorage`, a small key-value store built into every browser. It's free, requires no server, and persists between visits on the same device. Its limitation is that data lives only on that one browser: clear your cache or switch devices and it's gone. That's acceptable for Phases 1–2 and is replaced by a real database in Phase 3.

---

## 4. The Analysis Pipeline — How a Recording Becomes Feedback

This section explains the app's core machinery end to end, because understanding it makes every phase below make sense.

**Step 1 — Capture.** When the user presses record, the app starts the Web Speech API's `SpeechRecognition` in continuous mode and simultaneously notes the start time. As the user speaks, the API fires events containing *interim results* (its running guess at the transcript, which updates live) and *final results* (chunks of transcript it has committed to). The app collects these along with the times they arrived.

**Step 2 — Transcript assembly.** When the user presses stop, the app has a final transcript of what the browser heard, plus a rough timeline of when each chunk of speech occurred. Total duration is simply stop time minus start time (minus the countdown).

**Step 3 — Alignment.** The engine compares the transcript against the target paragraph word by word, using a standard technique called *edit distance* (also known as Levenshtein alignment). In plain terms: it finds the smallest set of insertions, deletions, and substitutions that would turn one word sequence into the other. The output tells us, for every word in the target paragraph, whether the user said it correctly, said something else in its place, or skipped it entirely. Small, well-tested JavaScript libraries exist for this, or it can be written by hand in ~40 lines — it's a classic algorithm.

One important nuance: transcription errors and speaking errors look identical in the data. If the transcript says "recieve the reward" instead of "receive this award," we can't know whether the user misspoke or the browser misheard. The engine handles this with generosity — near-matches (words that sound similar or differ slightly) are scored as correct or lightly penalized, and accuracy is weighted as only one part of the overall score. When in doubt, the app gives the user the benefit of the doubt.

**Step 4 — Metric computation.** From the aligned transcript and the timeline, the engine computes the core metrics: pace, accuracy, filler words, and pauses (full detail in Section 6).

**Step 5 — Feedback generation.** Each metric passes through a set of thresholds and templates that produce human-readable feedback strings, plus a weighted overall score. The results screen renders these.

Every one of these steps runs in the user's browser in under a second. There is no server round-trip (beyond the browser's own internal speech processing), which is why the app can be hosted for free.

---

## 5. Roadmap — The Four Phases

The project is divided into four phases. Each phase produces something usable on its own, and no phase requires throwing away work from a previous one. Time estimates assume part-time work by one developer with some project experience.

### Phase 1 — MVP: Prove the Loop Works (estimate: 2–4 weeks)

The goal of Phase 1 is a working version of the core loop with the minimum surface area: around ten hardcoded scenarios stored as a simple JSON file inside the app, a recording screen, and a results screen showing an overall score plus the raw metrics (WPM, accuracy percentage, filler-word count). No accounts, no history, no polish beyond basic usability.

The scenario data structure is worth designing carefully even now, because everything later builds on it. Each scenario is an object with an id, a title, a category (professional / social / ceremonial), a difficulty rating, and the target text itself. Storing scenarios as data rather than hardcoding them into components means adding scenario number eleven is a one-line change forever after.

Phase 1's component structure in React is small and clean. An `App` component holds the top-level state (which screen is showing, which scenario is selected, the latest results). A `ScenarioPicker` component renders the library and reports the user's choice upward. A `PracticeScreen` component displays the target paragraph, manages the record/stop button, and owns the interaction with the Web Speech API — this is the most complex component and the right place to concentrate testing effort. A `ResultsScreen` component receives the computed metrics and renders them. Separately from the components, the analysis engine lives in plain JavaScript modules (`analysis/align.js`, `analysis/metrics.js`, `analysis/feedback.js`) with no React dependency at all — this separation matters because pure functions that take a transcript and return metrics are trivially easy to test, and because the engine could later be reused on a server or in a mobile app unchanged.

The Web Speech API integration deserves its own attention within this phase. Practical issues that will come up and need handling: the API sometimes stops listening on its own after a silence and must be restarted mid-session; permission denial needs a graceful explanatory screen rather than a silent failure; and unsupported browsers (Firefox, some older Safari versions) need a friendly "please use Chrome or Edge" message rather than a broken page. Budgeting real time for these edge cases is the difference between a demo and an app.

Phase 1 is done when a stranger can open the URL, pick a scenario, read it aloud, and receive a score with accurate metrics — without anyone explaining the app to them first.

### Phase 2 — Real Coaching: Make the Feedback Feel Smart (estimate: 3–5 weeks)

Phase 2 turns raw numbers into feedback that feels like coaching, still with zero AI and zero cost.

The first piece is the feedback template system. Rather than showing "WPM: 182," the app selects from a library of written feedback messages based on thresholds and combinations of metrics, with the specific numbers slotted in. Combinations are where this gets genuinely good: high pace *plus* low accuracy produces "You're rushing and it's costing you words — slowing down will fix both," which reads like insight even though it's an if-statement. A well-written library of thirty to fifty such templates, each triggered by specific metric conditions, produces feedback that most users will not distinguish from AI. Writing these templates well is a writing task as much as a coding task, and it's the highest-leverage work in the whole phase.

The second piece is positional analysis — feedback about *where* in the paragraph things happened, not just how much. Because the alignment step (Section 4) maps every spoken word to its position in the target text, the app can say "your three filler words all came in the first two sentences — nerves at the start are normal; try taking a breath before you begin" or "you slowed down and hesitated around the phrase 'in recognition of' — practice that phrase on its own." Positional feedback is dramatically more actionable than aggregate counts, and it falls out of data the app already has.

The third piece is the expanded scoring rubric: instead of one number, four sub-scores — pace, accuracy, fluency (a combination of filler words and hesitation pauses), and consistency (did pace stay steady or swing wildly) — each 0–100, combined into the overall score using the weights defined in Section 6. Sub-scores let users see *what specifically* improved between attempts, which is what makes retrying feel rewarding.

Phase 2 also grows the scenario library to forty or more scenarios across categories and difficulty levels, and introduces a "retry and compare" view that shows this attempt's sub-scores next to the previous attempt's, using localStorage.

### Phase 3 — Retention: Accounts, History, and Progress (estimate: 4–6 weeks)

Phase 3 is about giving users a reason to come back, and it introduces the project's first server-side component — while staying on free tiers.

The centerpiece is progress tracking over time: a history of sessions, per-metric trend lines ("your average filler-word count over the last month"), streaks for practicing on consecutive days, and per-category stats. This requires real user accounts and a database, because localStorage can't follow a user across devices. The recommended free path is **Supabase** or **Firebase**, both of which offer generous permanently-free tiers that include authentication (email or Google sign-in, handled entirely by their SDKs — the app never touches passwords) and a hosted database. At this project's realistic early scale, the free tier will not be exhausted. The app remains a static site; it simply makes authenticated calls to Supabase/Firebase from the browser.

The data model stays small: a `sessions` table where each row records the user, the scenario, the timestamp, the sub-scores, and the computed metrics. Storing the metrics (not the audio — audio is large, sensitive, and unnecessary) keeps storage tiny and sidesteps most privacy concerns. All trend lines and streaks are computed from this one table.

Phase 3 also adds light gamification — streaks, personal bests per scenario, and perhaps simple badges ("first 90+ score," "ten sessions completed"). The design principle from Section 1 applies with force here: gamification should reward showing up and improving, never punish or shame a bad session.

### Phase 4 — Stretch: AI Coaching and Impromptu Mode (estimate: open-ended)

Phase 4 contains the features deliberately deferred, to be started only when Phases 1–3 are solid.

**LLM coaching layer.** The rule-based feedback gets an optional AI upgrade: the app sends the metrics, the alignment data, and the transcript to a language model, which writes personalized, natural-language coaching. Because the metrics engine already exists, this is additive — the LLM rephrases and enriches; it doesn't compute. The zero-cost paths at time of writing are the free tiers of hosted APIs (Google's Gemini free tier being the most established) or a small open-source model. One architectural note: calling an LLM API from the browser would expose the API key, so this feature is the natural moment to add a tiny serverless function (free on Vercel/Netlify) that holds the key and proxies the request. Free-tier terms change frequently, so the specific provider should be re-verified when this phase actually begins.

**Impromptu mode.** The app shows only a topic ("give a 30-second toast for a colleague who's leaving") instead of a script. This removes the accuracy metric entirely — there's no target text — so scoring rests on pace, fillers, and pauses, and the feedback leans more heavily on the LLM. It's the closest mode to real-world speaking and the hardest to grade, which is exactly why it's last.

**Possible further directions,** in rough priority order: pitch/monotone analysis using the browser's free Web Audio API (detecting flat delivery by measuring pitch variation — technically feasible without cost but signal-processing-heavy, hence deferred); upgraded transcription via a paid API if accuracy complaints accumulate; and a native mobile app if web traction justifies it.

---

## 6. Metrics and Scoring, Explained in Depth

This section defines exactly what the app measures and how the score is computed. These definitions are the contract between the analysis engine and the feedback system.

**Pace (words per minute).** Total words in the final transcript divided by speaking duration in minutes. Comfortable presentation pace is generally cited as 130–160 WPM; conversational speech runs a bit faster. The engine also computes pace per *third* of the paragraph (beginning/middle/end), because the pattern is often more telling than the average — nervous speakers characteristically start controlled and accelerate.

**Accuracy.** From the alignment step: the percentage of target-paragraph words the user spoke correctly, with skips and substitutions counted against it. Near-matches are forgiven, per the transcription-uncertainty policy in Section 4. Accuracy below roughly 85% more likely indicates a transcription problem or a false start than a reading problem, and the feedback layer softens its language accordingly rather than confidently blaming the user.

**Filler words.** A count of matches against a defined list — "um," "uh," "like" (when not in the target text), "you know," "so" at sentence starts — with their positions retained for positional feedback. Fillers are the single most user-recognizable speech flaw, which makes this metric disproportionately valuable for perceived app quality.

**Pauses.** Gaps in the speech timeline longer than a threshold (around 1.5–2 seconds) that don't correspond to a sentence boundary in the target text. A long pause at a period is rhetorical; a long pause mid-phrase is hesitation. The alignment data is what lets the engine tell these apart — this distinction is a good example of why the known-script design makes everything smarter.

**Overall score.** A weighted combination, on a 0–100 scale: accuracy 35%, pace 25%, fluency (fillers + hesitation pauses) 25%, consistency (pace stability across thirds) 15%. Each sub-score maps its raw metric onto 0–100 using a curve that is gentle near the ideal range and steeper at the extremes. The weights are a starting hypothesis, expected to be tuned during Phase 1 testing — the test is simply whether scores *feel* fair to real users reading real paragraphs.

---

## 7. Risks and How the Plan Addresses Them

**Transcription accuracy is the load-bearing risk.** If the browser mishears users, every downstream metric degrades and feedback feels unfair. Mitigations are layered through the plan: generous near-match scoring, accuracy weighted at only 35%, softened feedback language when accuracy is suspiciously low, and early testing with diverse voices and microphones (explicitly part of Phase 1 acceptance). The escape hatch — a paid transcription API — exists but is deliberately not the default.

**Browser support gaps.** No Firefox support is an accepted limitation, handled with a clear message rather than engineering effort. Chrome + Edge covers the substantial majority of desktop users; mobile Safari support should be tested early in Phase 1 since mobile behavior of the Web Speech API is less consistent.

**Discouraging feedback drives churn.** Addressed structurally: feedback always leads with a genuine positive, criticism is capped at two items per session, scoring curves are gentle near the ideal ranges, and gamification rewards practice rather than perfection.

**Free-tier dependency.** Supabase/Firebase/Vercel free tiers are generous but not contractual guarantees. The mitigation is architectural: the analysis engine is plain portable JavaScript, the database schema is one small table, and the app is a static site — every piece is easy to move if a provider's terms change.

**Scope creep.** The phase structure is the defense. Each phase has a done-condition, and features that don't serve the current phase's goal (including, notably, the LLM) are parked in Phase 4 by default.

---

## 8. Immediate Next Steps

The first working session on this project should: scaffold the React app with Vite; get a minimal proof-of-concept of the Web Speech API running (a button, live transcript appearing on screen — perhaps twenty lines of code); and write five scenario paragraphs into the JSON structure defined in Phase 1. That proof-of-concept de-risks the project's biggest unknown (transcription quality on your actual voice and microphone) before any real investment in UI. From there, Phase 1 proceeds as specified.

