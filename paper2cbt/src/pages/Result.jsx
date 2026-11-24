// Result.jsx — shows summary + question-wise responses always; shows score
// (Correct/Wrong/Score/%/Accuracy) ONLY when an answer key was detected in the PDF.
// Phase D: Shows solution images per question from IDB.
// Phase B: Subject-wise breakdown using scoringService sectionWise data.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../context/ExamContext';
import { computeResult } from '../services/scoringService';
import SummaryCard from '../components/result/SummaryCard';
import ScoreCard from '../components/result/ScoreCard';
import QuestionWiseResult from '../components/result/QuestionWiseResult';
import Button from '../components/common/Button';
import './Result.css';

export default function Result() {
  const navigate = useNavigate();
  const { questions, answerKey, examState, settings, resetExam, getSolutionImageUrl } = useExam();

  const result = useMemo(() => {
    if (!questions || questions.length === 0) return null;
    const responseMap = new Map(
      Object.entries(examState.responses).map(([num, val]) => [Number(num), val])
    );
    return computeResult(questions, responseMap, answerKey, settings);
  }, [questions, examState.responses, answerKey, settings]);

  if (!result) {
    return (
      <div className="result-page">
        <p>No result to show. Please complete an exam first.</p>
        <Button variant="primary" onClick={() => navigate('/')}>Go to Upload</Button>
      </div>
    );
  }

  const handleStartNew = () => {
    resetExam();
    navigate('/');
  };

  return (
    <div className="result-page">
      <h1>Your Result</h1>

      <SummaryCard total={result.total} attempted={result.attempted} skipped={result.skipped} />

      {result.hasAnswerKey ? (
        <>
          <ScoreCard
            correct={result.correct}
            wrong={result.wrong}
            score={result.score}
            maxPossibleScore={result.maxPossibleScore}
            percentage={result.percentage}
            accuracy={result.accuracy}
          />
          {/* Phase B: Subject-wise breakdown */}
          {result.sectionWise && result.sectionWise.length > 1 && (
            <div className="result-page__subject-wise card">
              <p className="result-page__section-title">Subject-wise Breakdown</p>
              <table className="result-page__table">
                <thead>
                  <tr>
                    <th>Subject / Section</th>
                    <th>Total</th>
                    <th>Correct</th>
                    <th>Wrong</th>
                    <th>Score</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sectionWise.map((s) => (
                    <tr key={s.section}>
                      <td>{s.section}</td>
                      <td>{s.total}</td>
                      <td className="result-page__correct">{s.correct}</td>
                      <td className="result-page__wrong">{s.wrong}</td>
                      <td>{s.score}</td>
                      <td>{s.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p className="result-page__no-key">
          No answer key was found in the uploaded PDF, so a score could not be calculated.
          Below is a question-wise log of your responses.
        </p>
      )}

      <QuestionWiseResult
        rows={result.questionWise}
        hasAnswerKey={result.hasAnswerKey}
        questions={questions}
        getSolutionImageUrl={getSolutionImageUrl}
      />

      <div className="result-page__actions">
        <Button variant="primary" size="lg" onClick={handleStartNew}>
          Start a New Test
        </Button>
      </div>
    </div>
  );
}
