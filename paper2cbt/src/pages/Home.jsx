// Home.jsx — upload page. Handles file selection, drives the parser pipeline,
// shows live processing status, routes to Review (Phase E) then Settings.
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DropZone from '../components/upload/DropZone';
import PdfPreview from '../components/upload/PdfPreview';
import ProcessingStatus from '../components/upload/ProcessingStatus';
import ReviewScreen from '../components/upload/ReviewScreen';
import Button from '../components/common/Button';
import { parsePdfToQuestions } from '../services/parserService';
import { useExam } from '../context/ExamContext';
import { PROCESSING_STAGES } from '../utils/constants';
import { PRELOADED_EXAMS } from '../data/preloadedExams';
import './Home.css';

const STAGE_ORDER = [
  PROCESSING_STAGES.IDLE,
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
  PROCESSING_STAGES.DONE,
  PROCESSING_STAGES.ERROR,
];

export default function Home() {
  const navigate = useNavigate();
  const { setQuestions, setAnswerKey, setPdfMeta, loadPreloadedExam } = useExam();

  const [file, setFile] = useState(null);
  const [stage, setStage] = useState(PROCESSING_STAGES.IDLE);
  const [detail, setDetail] = useState({});
  const [pdfType, setPdfType] = useState(null);
  const [error, setError] = useState('');
  const [parsedCount, setParsedCount] = useState(null);
  const [showReview, setShowReview] = useState(false);

  const handleSelectPreloaded = useCallback(
    (exam, mode = 'exam') => {
      loadPreloadedExam(exam);
      if (mode === 'review') {
        setShowReview(true);
      } else {
        navigate('/exam');
      }
    },
    [loadPreloadedExam, navigate]
  );

  const handleFileSelected = useCallback(
    async (selectedFile) => {
      setFile(selectedFile);
      setError('');
      setParsedCount(null);
      setShowReview(false);
      setStage(PROCESSING_STAGES.READING_FILE);

      try {
        const { questions, answerKey, pdfType: detectedType, pageCount } = await parsePdfToQuestions(
          selectedFile,
          (nextStage, nextDetail) => {
            setStage(nextStage);
            setDetail(nextDetail || {});
            if (nextDetail?.pdfType) setPdfType(nextDetail.pdfType);
          }
        );

        if (!questions || questions.length === 0) {
          setStage(PROCESSING_STAGES.ERROR);
          setError('No questions could be detected in this PDF. Try a different file.');
          return;
        }

        setQuestions(questions);
        setAnswerKey(answerKey);
        setPdfMeta({ fileName: selectedFile.name, pageCount, pdfType: detectedType });
        setPdfType(detectedType);
        setParsedCount(questions.length);
        setStage(PROCESSING_STAGES.DONE);
        // Phase E: show review screen instead of going directly to settings
        setShowReview(true);
      } catch (err) {
        console.error(err);
        setStage(PROCESSING_STAGES.ERROR);
        setError('Failed to process this PDF. Please try another file.');
      }
    },
    [setQuestions, setAnswerKey, setPdfMeta]
  );

  const isProcessing =
    stage !== PROCESSING_STAGES.IDLE &&
    stage !== PROCESSING_STAGES.DONE &&
    stage !== PROCESSING_STAGES.ERROR;

  if (showReview) {
    return (
      <div className="home-page">
        <ReviewScreen onProceed={() => navigate('/settings')} />
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="home-page__intro">
        <h1>Paper2CBT</h1>
        <p>Convert any exam PDF into a high-performance Computer Based Test with exact question slicing.</p>
      </div>

      {/* Pre-stored Adi Physics Exams Collection */}
      <section className="preloaded-section card">
        <div className="preloaded-header">
          <div className="preloaded-header__text">
            <h2>📚 Stored Physics Collection ({PRELOADED_EXAMS.length} Exam Papers)</h2>
            <p>
              Pre-sliced exact question cards with diagrams and answer keys. Click to start CBT instantly or configure answers.
            </p>
          </div>
          <span className="preloaded-badge">Offline Ready • Instant Load</span>
        </div>

        <div className="preloaded-grid">
          {PRELOADED_EXAMS.map((exam) => {
            const hasKey = exam.answerCount > 0;
            return (
              <div key={exam.id} className="preloaded-card">
                <div className="preloaded-card__body">
                  <h3 className="preloaded-card__title">{exam.title}</h3>
                  <div className="preloaded-card__meta">
                    <span className="preloaded-card__chip preloaded-card__chip--count">
                      📝 {exam.totalQuestions} Questions
                    </span>
                    <span
                      className={`preloaded-card__chip ${
                        hasKey ? 'preloaded-card__chip--key' : 'preloaded-card__chip--nokey'
                      }`}
                    >
                      {hasKey ? `🔑 ${exam.answerCount} Answers Ready` : '⚠️ Configure Key'}
                    </span>
                  </div>
                </div>
                <div className="preloaded-card__actions">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleSelectPreloaded(exam, 'exam')}
                  >
                    🚀 Start CBT
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSelectPreloaded(exam, 'review')}
                  >
                    📋 Review & Key
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="home-page__divider">
        <span>OR UPLOAD A CUSTOM PDF</span>
      </div>

      <DropZone onFileSelected={handleFileSelected} />
      <PdfPreview file={file} pageCount={detail?.pageCount} />

      {(isProcessing || stage === PROCESSING_STAGES.DONE || stage === PROCESSING_STAGES.ERROR) && (
        <ProcessingStatus stage={stage} detail={detail} pdfType={pdfType} />
      )}

      {error && <p className="home-page__error">{error}</p>}

      {stage === PROCESSING_STAGES.DONE && parsedCount !== null && !showReview && (
        <div className="home-page__success card">
          <p>
            Successfully detected <strong>{parsedCount}</strong> question{parsedCount === 1 ? '' : 's'}.
          </p>
          <Button variant="primary" size="lg" onClick={() => navigate('/settings')}>
            Continue to Settings
          </Button>
        </div>
      )}
    </div>
  );
}
