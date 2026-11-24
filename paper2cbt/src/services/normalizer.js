// normalizer.js
// Single responsibility: clean raw extracted/OCR text per page so downstream
// stages (tokenizer, questionParser) can rely on consistent formatting.
// Pages are normalized independently and returned as an array — normalizer
// never concatenates pages into one string, so page/line attribution is
// preserved all the way to the final JSON.

// Common OCR letter/digit confusions, applied ONLY in contexts where the
// mis-read character is very unlikely to be intentional (e.g. inside a
// mid-word run of digits). Kept conservative to avoid corrupting real content.
const OCR_ARTIFACT_FIXES = [
  // Stray control/replacement characters from bad scans. (Intentional control-char
  // match — this strips corrupted bytes from OCR/garbled PDF text extraction.)
  // eslint-disable-next-line no-control-regex
  [/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''],
  // Repeated punctuation noise ("..", "--" outside of ranges) collapsed.
  [/([.,;:])\1{2,}/g, '$1'],
  // Common bullet glyphs normalized to a single canonical bullet.
  [/[▪▫‣⁃●○]/g, '•'],
];

/**
 * Normalizes one page's raw text:
 * - Unicode-normalizes (NFKC) so visually-identical characters compare equal
 * - Normalizes line endings
 * - Fixes hyphenated line-break word-splits ("exam-\nple" -> "example")
 * - Collapses excessive whitespace (never inside a run of digits, so
 *   question/option numbers are never altered)
 * - Cleans common OCR artifacts and stray control characters
 * - Ensures question/option markers glued to the previous sentence start a
 *   new line, without ever deleting the marker itself
 * @param {string} rawText
 * @returns {string}
 */
export function normalizePageText(rawText) {
  if (!rawText) return '';

  let text = rawText.normalize('NFKC');

  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Fix hyphenated line-breaks, e.g. "exam-\nple" -> "example". Guarded to
  // require a lowercase continuation so we don't merge "PART-\nA" into "PARTA".
  text = text.replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2');

  for (const [pattern, replacement] of OCR_ARTIFACT_FIXES) {
    text = text.replace(pattern, replacement);
  }

  // Stray OCR glyph confusion: section sign (§) misinterpreted for '5' at start of numbered line
  text = text.replace(/^[;:\s]*§\s*(\d{1,3}\s*[.)])/gm, '5$1');

  // Collapse runs of spaces/tabs (never touches digit runs, so "1234" or a
  // question number is never merged/split by this step).
  text = text.replace(/[ \t]+/g, ' ');

  // Break a glued sentence before an obvious next-question marker, e.g.
  // "...end of prev sentence. Q2. Next question" -> break before Q2.
  // These NEVER remove the marker text — only insert a newline before it.
  text = text.replace(/([.?!])\s+(Q\.?\s?\d{1,4}\b)/g, '$1\n$2');
  text = text.replace(/([.?!])\s+(Question\s*\d{1,4}\b)/gi, '$1\n$2');
  text = text.replace(/([.?!])\s+(\d{1,4}[.)]\s)/g, '$1\n$2');
  text = text.replace(/([.?!])\s+(प्रश्न\s*[०-९\d]{1,4}\b)/g, '$1\n$2');

  // Break before an option marker glued to previous text, e.g.
  // "...Paris (B) London" -> newline before (B).
  text = text.replace(/(\S)\s+(\(?[A-Fa-f][.)])\s/g, '$1\n$2 ');

  // Collapse 3+ blank lines into a single blank line (paragraph separator).
  text = text.replace(/\n{3,}/g, '\n\n');

  // Trim trailing/leading whitespace per line.
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

  return text.trim();
}

/**
 * Normalizes every page independently, preserving page identity and, if
 * present, structured line/column data (only the `.text` of each line is
 * normalized — coordinates are untouched).
 * @param {Array<{pageNumber:number, text:string, lines?:Array<object>}>} pages
 * @returns {Array<{pageNumber:number, text:string, lines?:Array<object>}>}
 */
export function normalizePages(pages) {
  return pages.map((page) => {
    if (Array.isArray(page.lines) && page.lines.length > 0) {
      const normalizedLines = page.lines
        .map((line) => ({ ...line, text: normalizePageText(line.text).replace(/\n/g, ' ').trim() }))
        .filter((line) => line.text.length > 0);
      return {
        ...page,
        lines: normalizedLines,
        text: normalizedLines.map((l) => l.text).join('\n'),
      };
    }
    return { ...page, text: normalizePageText(page.text) };
  });
}
