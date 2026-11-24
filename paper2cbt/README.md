# Paper2CBT

Convert **any question PDF** into a fully working **Computer Based Test (CBT)** — instantly, in the browser.

Upload a PDF → configure exam settings → take the test with a real CBT interface (timer, question palette, mark for review, auto-submit) → get a result (scored automatically if an answer key was found in the PDF, otherwise a full response log).

---

## Tech Stack

- **React 19** + **Vite** (JavaScript, no TypeScript)
- **React Router** for navigation
- **pdfjs-dist** for PDF text extraction & page rendering
- **tesseract.js** for OCR fallback on scanned pages
- Plain **CSS** with CSS variables (light/dark theme) — no Tailwind
- Deployed via **GitHub + Vercel**

---

## Getting Started

```bash
npm install
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`).

### Build for production

```bash
npm run build
npm run preview
```

---

## How the parser works

Every PDF goes through the same pipeline (`src/services/parserService.js`):

```
PDF file
  │
  ▼
Text Extraction (pdfjs-dist reads the embedded text layer, page by page)
  │
  ▼
OCR fallback (tesseract.js) — only runs on pages with no usable text layer,
  in small batches, so 500-page scanned PDFs don't blow up memory
  │
  ▼
Normalization (src/services/normalizer.js) — fixes line breaks, hyphenation,
  glued question/option markers, whitespace
  │
  ▼
Tokenizer (src/services/tokenizer.js) — flattens the document into line tokens
  tagged with their source page
  │
  ▼
Question Parser (src/services/questionParser.js + optionParser.js) — a
  rule-based, multi-pattern engine (never a single regex) that detects question
  starts, options (A./B./①/roman numerals/etc.), wrapped lines, and images
  │
  ▼
Answer Key Detector (src/services/answerKeyService.js) — scans for an
  "Answer Key" section; if none is found, scoring is skipped entirely on
  the Result page (per spec: never guess/calculate a score without a real key)
  │
  ▼
JSON: { questions: [...], answerKey, pdfType, pageCount }
```

### Supported question markers
`Question 1`, `Q1`, `Q.1`, `1.`, `1)`, `01.`

### Supported option markers
`A.` `B.` `C.` `D.`, `A)` `B)`, `(A)` `(B)`, `①②③④`, Roman numerals (`I.`/`II.`)

### Question types detected
Single choice MCQ, multiple choice (via "select all/two/three" hints), True/False,
Assertion–Reason, and image-based questions (flagged via `hasImage`).

---

## Project Structure

```
src/
  assets/              static assets
  components/
    common/            Button, Loader, Modal, ProgressBar — reusable, no duplication
    layout/            Header, Footer, ThemeToggle
    upload/             DropZone, PdfPreview, ProcessingStatus
    exam/              QuestionCard, OptionList, QuestionPalette, Timer, NavigationControls
    result/            SummaryCard, ScoreCard, QuestionWiseResult
  pages/               Home, Settings, CBT, Result — one per route
  services/            pdfService, ocrService, normalizer, tokenizer,
                       questionParser, optionParser, answerKeyService,
                       scoringService, parserService (orchestrator)
  utils/               constants, regexPatterns, idGenerator, timeUtils, validators
  hooks/               useTimer, useFullscreen, useAutoSave, useLocalStorage
  context/             ExamContext (questions/settings/responses), ThemeContext
  styles/              variables.css (design tokens), global.css
```

Each service has a single responsibility, each feature has its own component,
and all shared UI lives in `components/common` — no duplicated styling or logic.

---

## CBT Exam Features

- Question navigation: Next / Previous / jump via palette
- Mark for Review, Clear Response
- Live auto-save of every response to `localStorage` (survives refresh/crash)
- Countdown timer with **auto-submit** when time expires
- Fullscreen mode entered automatically on exam start
- Fully responsive: desktop, laptop, tablet, mobile
- Light/Dark mode (persisted, toggle in header)

## Result Logic

- **No answer key in the PDF** → shows Total / Attempted / Skipped and a
  question-wise log of exactly what was selected (or "Not Attempted").
  **No score is ever calculated or guessed.**
- **Answer key detected in the PDF** → additionally shows Correct, Wrong,
  Score, Percentage, and Accuracy, computed from the marks configured in Settings.

## Performance notes

- OCR runs in batches (`OCR_BATCH_SIZE` in `utils/constants.js`) instead of
  all pages at once, keeping memory bounded on large (500+ page) scans.
- Canvas elements used for OCR rendering are explicitly zeroed and pdf.js
  page objects are `.cleanup()`'d immediately after use.
- Parsing and OCR are the only heavy operations; the exam UI itself only
  ever renders the current question, not the whole question set at once.

## Deployment (Vercel)

1. Push this repository to GitHub.
2. Import the repo in Vercel — framework preset **Vite** is auto-detected.
3. Build command: `npm run build`, output directory: `dist` (Vercel defaults are correct).
4. `vercel.json` includes a SPA rewrite so client-side routes
   (`/settings`, `/exam`, `/result`) work on refresh/direct link.

---

Made by Ranjan
