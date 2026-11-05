const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100
const PARAGRAPH_SEPARATOR = "\n\n"
const WORD_SEPARATOR = " "
// Leaves room for the overlap and a separator, so a finished chunk stays within CHUNK_SIZE.
const MAX_PIECE_LENGTH = CHUNK_SIZE - CHUNK_OVERLAP - PARAGRAPH_SEPARATOR.length

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

// JavaScript indexes UTF-16 code units, so a raw slice could cut an emoji or an accent in two.
function graphemeBoundaryBefore(text: string, index: number) {
  if (index >= text.length) {
    return text.length
  }

  const grapheme = graphemes.segment(text).containing(index)
  if (!grapheme) {
    return index
  }

  return grapheme.index > 0
    ? grapheme.index
    : grapheme.index + grapheme.segment.length
}

function findPieceEnd(text: string) {
  const window = text.slice(0, MAX_PIECE_LENGTH)
  const minimum = Math.floor(MAX_PIECE_LENGTH / 2)

  let sentenceEnd = 0
  for (const match of window.matchAll(/[.!?…。！？]["'”’»)\]]*\s/g)) {
    sentenceEnd = match.index + match[0].length
  }
  if (sentenceEnd > minimum) {
    return sentenceEnd
  }

  for (let index = window.length - 1; index > minimum; index--) {
    if (/\s/.test(window[index])) {
      return index + 1
    }
  }

  return graphemeBoundaryBefore(text, MAX_PIECE_LENGTH)
}

function splitParagraph(paragraph: string) {
  const pieces: string[] = []
  let rest = paragraph

  while (rest.length > MAX_PIECE_LENGTH) {
    const end = findPieceEnd(rest)
    pieces.push(rest.slice(0, end).trim())
    rest = rest.slice(end).trimStart()
  }

  if (rest) {
    pieces.push(rest)
  }

  return pieces
}

function overlapOf(chunk: string) {
  const start = graphemeBoundaryBefore(chunk, chunk.length - CHUNK_OVERLAP)
  const tail = chunk.slice(start)
  const wordBreak = tail.search(/\s\S/)

  return wordBreak === -1 ? tail : tail.slice(wordBreak + 1)
}

export function chunkText(text: string) {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ""

  for (const paragraph of paragraphs) {
    splitParagraph(paragraph).forEach((piece, index) => {
      const separator = index === 0 ? PARAGRAPH_SEPARATOR : WORD_SEPARATOR
      const candidate = current ? `${current}${separator}${piece}` : piece

      if (candidate.length <= CHUNK_SIZE) {
        current = candidate
        return
      }

      chunks.push(current)
      current = `${overlapOf(current)}${separator}${piece}`
    })
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}
