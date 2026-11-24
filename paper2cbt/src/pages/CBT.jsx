// CBT.jsx — the exam-taking page: question display, palette, timer, fullscreen,
// auto-save, and auto-submit when time runs out.
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import QuestionCard from '../components/exam/QuestionCard';
import QuestionPalette from '../components/exam/QuestionPalette';
import NavigationControls from '../components/exam/NavigationControls';
import Timer from '../components/exam/Timer';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import { useExam } from '../context/ExamContext';
import { useTimer } from '../hooks/useTimer';
import { useFullscreen } from '../hooks/useFullscreen';
import { useAutoSave } from '../hooks/useAutoSave';
import { minutesToSeconds } from '../utils/timeUtils';
import './CBT.css';

export default function CBT() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const {
    questions,
    settings,
    examState,
    setResponse,
    clearResponse,
    toggleMarkForReview,
    visitQuestion,
    submitExam
  } = useExam();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const { enter } = useFullscreen(containerRef);

  const handleSubmit = useCallback(() => {
    submitExam();
    navigate('/result');
  }, [submitExam, navigate]);

  const totalSeconds = useMemo(() => minutesToSeconds(settings.examTimeMinutes), [settings.examTimeMinutes]);
  const { secondsLeft } = useTimer(totalSeconds, handleSubmit);

  useAutoSave(
    () => examState,
    () => {}, // examState already persists via useLocalStorage inside ExamContext; this hook exists for future remote sync.
    5000
  );

  useEffect(() => {
    enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentQuestion = questions[currentIndex];

  useEffect(() => {
    if (!currentQuestion) return;
    visitQuestion(currentQuestion.number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.number]);

  if (!questions || questions.length === 0) {
    return (
      <div className="cbt-page">
        <p>No exam in progress. Please upload a PDF first.</p>
        <Button variant="primary" onClick={() => navigate('/')}>Go to Upload</Button>
      </div>
    );
  }

  const goTo = (index) => {
    if (index < 0 || index >= questions.length) return;
    setCurrentIndex(index);
  };

  return (
    <div className="cbt-page" ref={containerRef}>
      <div className="cbt-page__topbar">
        <span className="cbt-page__brand">Paper2CBT — Exam in Progress</span>
        <Timer secondsLeft={secondsLeft} />
      </div>

      <div className="cbt-page__body">
        <div className="cbt-page__main">
          <QuestionCard
            question={currentQuestion}
            selected={examState.responses[currentQuestion.number]}
            onSelect={(value) => setResponse(currentQuestion.number, value)}
            questionIndex={currentIndex}
            total={questions.length}
          />
          <NavigationControls
            isFirst={currentIndex === 0}
            isLast={currentIndex === questions.length - 1}
            onPrevious={() => goTo(currentIndex - 1)}
            onNext={() => goTo(currentIndex + 1)}
            onMarkForReview={() => {
              toggleMarkForReview(currentQuestion.number);
              goTo(currentIndex + 1);
            }}
            onClearResponse={() => clearResponse(currentQuestion.number)}
            onSubmit={() => setShowSubmitConfirm(true)}
          />
        </div>

        <QuestionPalette
          questions={questions}
          statuses={examState.statuses}
          currentIndex={currentIndex}
          onJump={goTo}
        />
      </div>

      {showSubmitConfirm && (
        <Modal
          title="Submit Exam?"
          onClose={() => setShowSubmitConfirm(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setShowSubmitConfirm(false)}>Cancel</Button>
              <Button variant="success" onClick={handleSubmit}>Submit</Button>
            </>
          }
        >
          <p>
            You have attempted {Object.keys(examState.responses).length} out of {questions.length} questions.
            This action cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}
