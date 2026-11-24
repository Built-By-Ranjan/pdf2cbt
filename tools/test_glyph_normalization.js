import assert from 'assert';
import { normalizePageText } from '../paper2cbt/src/services/normalizer.js';
import { matchOptionLine, splitInlineOptions } from '../paper2cbt/src/services/optionParser.js';
import { parseQuestions } from '../paper2cbt/src/services/questionParser.js';

function testGlyphScope() {
  console.log('Testing OCR Glyph Normalization Scoping...');

  // 1. Question text with (0) and (8)
  const questionRaw = '1. A particle starts at t = (0) s with speed (8) m/s. Find the acceleration.\n(A) 2 m/s² (8) 4 m/s² (C) 6 m/s² (0) 8 m/s²';
  
  // Normalizer must NOT touch (0) or (8) in prose
  const normalized = normalizePageText(questionRaw);
  assert(normalized.includes('t = (0) s'), 'Failed: (0) inside question prose was altered!');
  assert(normalized.includes('speed (8) m/s'), 'Failed: (8) inside question prose was altered!');
  console.log('✓ Normalizer leaves (0) and (8) inside question prose untouched.');

  // 2. Option parser MUST parse (8) as B and (0) as D
  const optionLine = '(A) 2 m/s² (8) 4 m/s² (C) 6 m/s² (0) 8 m/s²';
  const inline = splitInlineOptions(optionLine);
  assert.strictEqual(inline.length, 4, `Expected 4 options, got ${inline.length}`);
  assert.strictEqual(inline[0].label, 'A', 'Option 0 should be A');
  assert.strictEqual(inline[1].label, 'B', 'Option 1 (8) should normalize to B');
  assert.strictEqual(inline[2].label, 'C', 'Option 2 should be C');
  assert.strictEqual(inline[3].label, 'D', 'Option 3 (0) should normalize to D');
  console.log('✓ Inline options normalize (8)->B and (0)->D correctly.');

  // 3. Registered trademark ® and copyright © in standalone option lines
  const optB = matchOptionLine('® 2n + 1');
  assert(optB, 'Failed to match ® option line');
  assert.strictEqual(optB.label, 'B', '® should normalize to B');
  assert.strictEqual(optB.text, '2n + 1');

  const optC = matchOptionLine('(©) 2n - 1');
  assert(optC, 'Failed to match (©) option line');
  assert.strictEqual(optC.label, 'C', '(©) should normalize to C');
  console.log('✓ Standalone option lines with ® and © normalize to B and C.');

  console.log('ALL GLYPH NORMALIZATION TESTS PASSED!\n');
}

testGlyphScope();
