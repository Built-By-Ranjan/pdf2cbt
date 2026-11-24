// Simple validation helpers for the Settings page and file upload.

export function isValidPdfFile(file) {
  if (!file) return false;
  const isPdfMime = file.type === 'application/pdf';
  const isPdfExt = file.name?.toLowerCase().endsWith('.pdf');
  return isPdfMime || isPdfExt;
}

export function isPositiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0;
}

export function validateSettings({ examTimeMinutes, correctMarks, negativeMarks, skipMarks }) {
  const errors = {};
  if (!isPositiveNumber(examTimeMinutes) || examTimeMinutes <= 0) {
    errors.examTimeMinutes = 'Exam time must be a positive number of minutes.';
  }
  if (!isPositiveNumber(correctMarks)) {
    errors.correctMarks = 'Correct marks must be a non-negative number.';
  }
  if (!isPositiveNumber(negativeMarks)) {
    errors.negativeMarks = 'Negative marks must be a non-negative number.';
  }
  if (!isPositiveNumber(skipMarks)) {
    errors.skipMarks = 'Skip marks must be a non-negative number.';
  }
  return { isValid: Object.keys(errors).length === 0, errors };
}
