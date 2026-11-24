import assert from 'assert';
import { parseQuestions } from '../paper2cbt/src/services/questionParser.js';
import { extractAnswerKey, mapKeyEntriesToQuestions } from '../paper2cbt/src/services/answerKeyService.js';
import { TOKEN_TYPES } from '../paper2cbt/src/utils/constants.js';

function testSubjectOrderMapping() {
  console.log('Testing Answer Mapping by (Subject, Order)...');

  // Simulated tokens for an exam paper that restarts numbering per subject:
  // Maths: Q1, Q2, Q3
  // Physics: Q1, Q2, Q3
  const tokens = [
    // Mathematics
    { type: TOKEN_TYPES.QUESTION_START, text: '1. What is 2 + 2?', page: 1, subject: 'Mathematics' },
    { type: TOKEN_TYPES.OPTION_START, text: '(A) 3 (B) 4 (C) 5 (D) 6', page: 1, subject: 'Mathematics' },
    { type: TOKEN_TYPES.QUESTION_START, text: '2. What is 3 * 3?', page: 1, subject: 'Mathematics' },
    { type: TOKEN_TYPES.OPTION_START, text: '(A) 6 (B) 9 (C) 12 (D) 15', page: 1, subject: 'Mathematics' },
    { type: TOKEN_TYPES.QUESTION_START, text: '3. What is 10 / 2?', page: 1, subject: 'Mathematics' },
    { type: TOKEN_TYPES.OPTION_START, text: '(A) 2 (B) 4 (C) 5 (D) 8', page: 1, subject: 'Mathematics' },

    // Physics (numbering restarts at 1)
    { type: TOKEN_TYPES.QUESTION_START, text: '1. Unit of force?', page: 2, subject: 'Physics' },
    { type: TOKEN_TYPES.OPTION_START, text: '(A) Joule (B) Watt (C) Pascal (D) Newton', page: 2, subject: 'Physics' },
    { type: TOKEN_TYPES.QUESTION_START, text: '2. Speed of light?', page: 2, subject: 'Physics' },
    { type: TOKEN_TYPES.OPTION_START, text: '(A) 3e6 (B) 3e7 (C) 3e8 (D) 3e9', page: 2, subject: 'Physics' },
    { type: TOKEN_TYPES.QUESTION_START, text: '3. Acceleration due to gravity?', page: 2, subject: 'Physics' },
    { type: TOKEN_TYPES.OPTION_START, text: '(A) 8.9 (B) 9.8 (C) 10.8 (D) 11.2', page: 2, subject: 'Physics' },
  ];

  const questions = parseQuestions(tokens);
  assert.strictEqual(questions.length, 6, `Expected 6 questions, got ${questions.length}`);

  // Check unique numbering and display numbering
  assert.strictEqual(questions[0].number, 1);
  assert.strictEqual(questions[0].displayNumber, 1);
  assert.strictEqual(questions[0].subject, 'Mathematics');

  assert.strictEqual(questions[3].number, 4); // Continuous internal number
  assert.strictEqual(questions[3].displayNumber, 1); // Printed number on paper
  assert.strictEqual(questions[3].subject, 'Physics');

  console.log('✓ Questions assigned unique continuous internal numbers (1..6) and preserved display numbers (1..3, 1..3).');

  // Trailing answer key table that also restarts numbering:
  // Maths: 1-B, 2-B, 3-C
  // Physics: 1-D, 2-C, 3-B
  const rawKeyEntries = [
    { number: 1, label: 'B', subject: 'Mathematics' },
    { number: 2, label: 'B', subject: 'Mathematics' },
    { number: 3, label: 'C', subject: 'Mathematics' },
    { number: 1, label: 'D', subject: 'Physics' },
    { number: 2, label: 'C', subject: 'Physics' },
    { number: 3, label: 'B', subject: 'Physics' },
  ];

  const mappedKey = mapKeyEntriesToQuestions(rawKeyEntries, questions);

  // Maths questions (internal number 1, 2, 3)
  assert.strictEqual(mappedKey.get(1), 'B', 'Maths Q1 answer should be B');
  assert.strictEqual(mappedKey.get(2), 'B', 'Maths Q2 answer should be B');
  assert.strictEqual(mappedKey.get(3), 'C', 'Maths Q3 answer should be C');

  // Physics questions (internal number 4, 5, 6 - display number 1, 2, 3)
  assert.strictEqual(mappedKey.get(4), 'D', 'Physics Q1 answer should be D (not overwritten by Maths Q1!)');
  assert.strictEqual(mappedKey.get(5), 'C', 'Physics Q2 answer should be C');
  assert.strictEqual(mappedKey.get(6), 'B', 'Physics Q3 answer should be B');

  console.log('✓ Trailing answer key mapped by (subject, order) without number collision.');
  console.log('ALL SUBJECT-ORDER MAPPING TESTS PASSED!\n');
}

testSubjectOrderMapping();
