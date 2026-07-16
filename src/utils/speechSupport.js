// The Web Speech API ships unprefixed in some browsers and behind the
// webkit- prefix in Chrome/Edge; check both before deciding it's absent.
export function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function isSpeechRecognitionSupported() {
  return getSpeechRecognition() !== null
}
