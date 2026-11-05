import { type ReadableStream, TransformStream } from "node:stream/web"

import type { Pronunciation } from "@workspace/shared/api/agent-config/types"

type CompiledTerm = {
  chars: RegExp[]
  replacement: string
  startsInWord: boolean
  endsInWord: boolean
}

// Combining marks count as word characters so that a decomposed "mañana" still
// does not match "ana".
const WORD_CHAR = /^[\p{L}\p{M}\p{N}]$/u
const TRAILING_HIGH_SURROGATE = /[\uD800-\uDBFF]$/
const PARTIAL = -1
const NO_MATCH = -2

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isWordChar(char: string | undefined) {
  return char !== undefined && WORD_CHAR.test(char)
}

function charAt(text: string, index: number) {
  return String.fromCodePoint(text.codePointAt(index) ?? 0)
}

// Longest first, so a term still growing at the end of the buffer is seen before
// any shorter term that is already complete.
function compileTerms(pronunciations: readonly Pronunciation[]) {
  return pronunciations
    .map(({ term, replacement, caseSensitive }): CompiledTerm => {
      const chars = Array.from(term.normalize("NFC"))
      return {
        chars: chars.map(
          (char) =>
            new RegExp(`^${escapeRegex(char)}$`, caseSensitive ? "u" : "iu")
        ),
        replacement,
        startsInWord: isWordChar(chars[0]),
        endsInWord: isWordChar(chars.at(-1)),
      }
    })
    .sort((a, b) => b.chars.length - a.chars.length)
}

function matchEnd(term: CompiledTerm, text: string, start: number) {
  let index = start
  for (const char of term.chars) {
    if (index >= text.length) return PARTIAL
    const next = charAt(text, index)
    if (!char.test(next)) return NO_MATCH
    index += next.length
  }
  return index
}

function createReplacer(terms: readonly CompiledTerm[]) {
  let buffer = ""
  // Last source character already consumed. Replacements never become context,
  // and they leave the buffer as soon as they are made, so they are not re-scanned.
  let previous: string | undefined

  function drain(atEnd: boolean) {
    // A chunk can end halfway through a surrogate pair.
    const text = atEnd ? buffer : buffer.replace(TRAILING_HIGH_SURROGATE, "")
    let output = ""
    let position = 0

    scan: while (position < text.length) {
      const atBoundary = !isWordChar(previous)

      let match: { term: CompiledTerm; end: number } | undefined
      for (const term of terms) {
        if (term.startsInWord && !atBoundary) continue

        const end = matchEnd(term, text, position)
        if (end === NO_MATCH) continue
        if (end === PARTIAL) {
          if (atEnd) continue
          break scan
        }

        if (term.endsInWord) {
          if (end === text.length) {
            if (!atEnd) break scan
          } else if (isWordChar(charAt(text, end))) {
            continue
          }
        }

        match = { term, end }
        break
      }

      if (match) {
        output += match.term.replacement
        previous = Array.from(text.slice(position, match.end)).at(-1)
        position = match.end
      } else {
        previous = charAt(text, position)
        output += previous
        position += previous.length
      }
    }

    buffer = buffer.slice(position)
    return output
  }

  return {
    push(chunk: string) {
      buffer += chunk
      return drain(false)
    },
    flush() {
      return drain(true)
    },
  }
}

export function createPronunciationReplacer(
  pronunciations: readonly Pronunciation[]
) {
  return createReplacer(compileTerms(pronunciations))
}

export function createPronunciationTransform(
  pronunciations: readonly Pronunciation[]
) {
  const terms = compileTerms(pronunciations)

  return (text: ReadableStream<string>): ReadableStream<string> => {
    const replacer = createReplacer(terms)

    return text.pipeThrough(
      new TransformStream<string, string>({
        transform(chunk, controller) {
          const output = replacer.push(chunk)
          if (output) controller.enqueue(output)
        },
        flush(controller) {
          const output = replacer.flush()
          if (output) controller.enqueue(output)
        },
      })
    )
  }
}

export function pronunciationSessionOptions(
  pronunciations: readonly Pronunciation[] | undefined
) {
  if (!pronunciations?.length) return {}

  return {
    // Aligned transcripts are the words the TTS read back, so they would put the
    // respelling in the transcript and in the history the LLM sees. Without them
    // the transcript comes from the original LLM text.
    useTtsAlignedTranscript: false,
    // Setting this replaces the SDK defaults, which have to stay ahead of the
    // replacement so that markdown cannot split a term.
    ttsTextTransforms: [
      "filter_markdown",
      "filter_emoji",
      createPronunciationTransform(pronunciations),
    ] as const,
  }
}
