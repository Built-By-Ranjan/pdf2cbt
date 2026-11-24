// Centralized constant values used across the application.
// Keeping these in one place avoids "magic numbers/strings" scattered in code.

export const PDF_TYPES = {
  TEXT: 'TEXT_PDF',
  SCANNED: 'SCANNED_PDF',
  IMAGE: 'IMAGE_PDF',
  MIXED: 'MIXED_PDF'
};

export const QUESTION_TYPES = {
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  TRUE_FALSE: 'TRUE_FALSE',
  ASSERTION_REASON: 'ASSERTION_REASON',
  NUMERICAL: 'NUMERICAL',
  INTEGER: 'INTEGER',
  SUBJECTIVE: 'SUBJECTIVE',
  IMAGE: 'IMAGE_QUESTION'
};

export const QUESTION_STATUS = {
  NOT_VISITED: 'NOT_VISITED',
  NOT_ANSWERED: 'NOT_ANSWERED',
  ANSWERED: 'ANSWERED',
  MARKED_FOR_REVIEW: 'MARKED_FOR_REVIEW',
  ANSWERED_AND_MARKED: 'ANSWERED_AND_MARKED'
};

export const PROCESSING_STAGES = {
  IDLE: 'IDLE',
  READING_FILE: 'READING_FILE',
  DETECTING_TYPE: 'DETECTING_TYPE',
  EXTRACTING_TEXT: 'EXTRACTING_TEXT',
  RUNNING_OCR: 'RUNNING_OCR',
  CLEANING: 'CLEANING',
  NORMALIZING: 'NORMALIZING',
  TOKENIZING: 'TOKENIZING',
  DETECTING_SECTIONS: 'DETECTING_SECTIONS',
  PARSING_QUESTIONS: 'PARSING_QUESTIONS',
  PARSING_ANSWER_KEY: 'PARSING_ANSWER_KEY',
  CROPPING_REGIONS: 'CROPPING_REGIONS',
  SAVING_DATA: 'SAVING_DATA',
  DONE: 'DONE',
  ERROR: 'ERROR'
};

export const STORAGE_KEYS = {
  EXAM_STATE: 'paper2cbt_exam_state',
  EXAM_SETTINGS: 'paper2cbt_exam_settings',
  PARSED_QUESTIONS: 'paper2cbt_parsed_questions',
  ANSWER_KEY: 'paper2cbt_answer_key',
  THEME: 'paper2cbt_theme'
};

export const DEFAULT_SETTINGS = {
  examTimeMinutes: 60,
  correctMarks: 4,
  negativeMarks: 1,
  skipMarks: 0
};

// Large PDF handling thresholds
export const LARGE_PDF_PAGE_THRESHOLD = 100;
export const OCR_BATCH_SIZE = 5; // pages processed per OCR batch to keep memory low

// Alias used by pdfService when deciding to lower render scale for huge documents.
export const LARGE_DOCUMENT_PAGE_THRESHOLD = LARGE_PDF_PAGE_THRESHOLD;

// Scale (in pdf.js viewport units) used when rasterizing a page for OCR.
// Higher = sharper OCR input but more memory; halved automatically on very
// large documents (see pdfService.renderPageToImage).
export const OCR_RENDER_SCALE = 2;

// Column-detection tolerance: two lines are considered to start the same
// column if their left edges differ by less than this fraction of the page
// width. Tuned to separate genuine 2/3-column exam layouts without splitting
// a single column due to minor indentation (e.g. wrapped option text).
export const COLUMN_GAP_RATIO = 0.12;

// Token types produced by tokenizer.js and consumed by sectionDetector.js /
// questionParser.js. Every line of a cleaned page is classified as exactly
// one of these before the question-parsing state machine ever runs.
export const TOKEN_TYPES = {
  QUESTION_START: 'QUESTION_START',
  OPTION_START: 'OPTION_START',
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  SECTION: 'SECTION',
  HEADER: 'HEADER',
  FOOTER: 'FOOTER',
  ANSWER_KEY: 'ANSWER_KEY'
};

// States for questionParser.js's explicit state machine.
export const PARSER_STATES = {
  WAITING: 'WAITING', // before the first question has started
  QUESTION: 'QUESTION', // accumulating the current question's text
  OPTION: 'OPTION', // accumulating the current option's text
  SOLUTION: 'SOLUTION', // accumulating the current question's worked solution
  IMAGE: 'IMAGE', // an image/figure token interrupted QUESTION/OPTION; will resume it
  END: 'END' // an answer-key section was reached; stop parsing questions
};

// Tesseract.js worker pool sizing/retry policy.
export const OCR_WORKER_POOL_SIZE = 2; // reused workers, not spawned per page
export const OCR_MAX_RETRIES = 2; // additional attempts after the first failure

// Supported OCR languages (tesseract.js language codes). HINDI_ENGLISH runs a
// single combined-language pass for mixed Hindi/English papers rather than
// requiring the caller to guess which language a page is in.
export const OCR_LANGUAGES = {
  ENGLISH: 'eng',
  HINDI: 'hin',
  HINDI_ENGLISH: 'eng+hin'
};

// ---------------------------------------------------------------------------
// Image-first region cropping (Phase A)
// ---------------------------------------------------------------------------

// Scale used when cropping question regions. Higher = crisper math/diagrams.
// Lower automatically on very large PDFs (see regionCropper.js).
export const CROP_RENDER_SCALE = 2.5;

// Whitespace margin added around each cropped region (in PDF points at scale 1)
// to ensure nothing is clipped at the edges.
export const CROP_TRIM_MARGIN = 8;

// IndexedDB store names (Phase F)
export const IDB_DB_NAME = 'paper2cbt_v2';

// Processing stage added for cropping
export const PROCESSING_STAGES_EXTRA = {
  CROPPING_REGIONS: 'CROPPING_REGIONS',
};

// INTEGER question type for sections that explicitly say "integer type"
export const INTEGER_SECTION_LABEL_PATTERNS = [
  /integer\s+type|section\s+ii|section\s+2|numerical\s+value/i,
];
