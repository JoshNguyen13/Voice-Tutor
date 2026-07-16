// Shared tokenizer so alignment and metrics index words identically.
// endsSentence is computed from the raw (punctuated) word before it gets
// lowercased and stripped, so callers can find sentence boundaries by index.
export function tokenizeWithBoundaries(text) {
  const trimmed = text.trim()
  if (!trimmed) return []
  return trimmed.split(/\s+/).map((raw) => ({
    word: raw.toLowerCase().replace(/[^a-z0-9']/g, ''),
    endsSentence: /[.!?]["')]*$/.test(raw),
  }))
}

export function tokenize(text) {
  return tokenizeWithBoundaries(text).map((t) => t.word)
}
