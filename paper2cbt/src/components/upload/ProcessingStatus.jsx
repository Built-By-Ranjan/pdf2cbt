// ProcessingStatus.jsx — human-readable label + progress bar for each pipeline stage.
import ProgressBar from '../common/ProgressBar';
import { PROCESSING_STAGES } from '../../utils/constants';
import './ProcessingStatus.css';

const STAGE_LABELS = {
  [PROCESSING_STAGES.READING_FILE]: 'Reading PDF file…',
  [PROCESSING_STAGES.DETECTING_TYPE]: 'Detecting PDF type…',
  [PROCESSING_STAGES.EXTRACTING_TEXT]: 'Extracting text…',
  [PROCESSING_STAGES.RUNNING_OCR]: 'Running OCR on scanned pages…',
  [PROCESSING_STAGES.CLEANING]: 'Removing headers, footers & noise…',
  [PROCESSING_STAGES.NORMALIZING]: 'Cleaning up text…',
  [PROCESSING_STAGES.TOKENIZING]: 'Tokenizing content…',
  [PROCESSING_STAGES.DETECTING_SECTIONS]: 'Detecting sections & subjects…',
  [PROCESSING_STAGES.PARSING_QUESTIONS]: 'Detecting questions & options…',
  [PROCESSING_STAGES.PARSING_ANSWER_KEY]: 'Looking for an answer key…',
  [PROCESSING_STAGES.CROPPING_REGIONS]: 'Cropping question images…',
  [PROCESSING_STAGES.SAVING_DATA]: 'Saving to local database…',
  [PROCESSING_STAGES.DONE]: 'Done!',
  [PROCESSING_STAGES.ERROR]: 'Something went wrong.'
};

const STAGE_ORDER = [
  PROCESSING_STAGES.READING_FILE,
  PROCESSING_STAGES.DETECTING_TYPE,
  PROCESSING_STAGES.EXTRACTING_TEXT,
  PROCESSING_STAGES.RUNNING_OCR,
  PROCESSING_STAGES.CLEANING,
  PROCESSING_STAGES.NORMALIZING,
  PROCESSING_STAGES.TOKENIZING,
  PROCESSING_STAGES.DETECTING_SECTIONS,
  PROCESSING_STAGES.PARSING_QUESTIONS,
  PROCESSING_STAGES.PARSING_ANSWER_KEY,
  PROCESSING_STAGES.CROPPING_REGIONS,
  PROCESSING_STAGES.SAVING_DATA,
  PROCESSING_STAGES.DONE
];

export default function ProcessingStatus({ stage, detail, pdfType }) {
  if (!stage || stage === PROCESSING_STAGES.IDLE) return null;

  const stageIndex = STAGE_ORDER.indexOf(stage);
  const percent = stageIndex >= 0 ? ((stageIndex + 1) / STAGE_ORDER.length) * 100 : 0;

  const isOcr = stage === PROCESSING_STAGES.RUNNING_OCR && detail?.total > 0;
  const isCropping = stage === PROCESSING_STAGES.CROPPING_REGIONS && detail?.total > 0;

  return (
    <div className="processing-status card">
      <p className="processing-status__label">{STAGE_LABELS[stage] || stage}</p>
      {isOcr && (
        <p className="processing-status__detail">
          Processed {detail.done || 0} / {detail.total} pages
        </p>
      )}
      {isCropping && (
        <p className="processing-status__detail">
          Cropped {detail.done || 0} / {detail.total} questions
        </p>
      )}
      <ProgressBar
        value={
          isOcr ? detail.done || 0
          : isCropping ? detail.done || 0
          : percent
        }
        max={
          isOcr ? detail.total
          : isCropping ? detail.total
          : 100
        }
        variant={stage === PROCESSING_STAGES.ERROR ? 'danger' : 'primary'}
      />
      {pdfType && (
        <p className="processing-status__type">
          Detected type: <strong>{pdfType.replace('_', ' ')}</strong>
        </p>
      )}
    </div>
  );
}
