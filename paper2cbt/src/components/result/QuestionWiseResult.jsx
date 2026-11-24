// QuestionWiseResult.jsx — per-question breakdown table: selected answer, and
// correctness (only if an answer key exists).
// Phase D: Shows solution images per question when available.
import { useState, useEffect } from 'react';
import './QuestionWiseResult.css';

function SolutionViewer({ questionId, getSolutionImageUrl, solutionText }) {
  const [expanded, setExpanded] = useState(false);
  const [solutionUrl, setSolutionUrl] = useState(null);

  useEffect(() => {
    if (!expanded || !getSolutionImageUrl) return;
    let cancelled = false;
    getSolutionImageUrl(questionId).then((url) => {
      if (!cancelled && url) setSolutionUrl(url);
    });
    return () => { cancelled = true; };
  }, [expanded, questionId, getSolutionImageUrl]);

  const hasSolution = solutionText || (getSolutionImageUrl && questionId);
  if (!hasSolution) return null;

  return (
    <div>
      <button
        type="button"
        className="qwr-solution__toggle"
        onClick={() => setExpanded((p) => !p)}
      >
        {expanded ? '▲ Hide Solution' : '▼ Show Solution'}
      </button>
      {expanded && (
        <div className="qwr-solution">
          {solutionText && <p style={{ fontSize: '13px', marginBottom: '8px' }}>{solutionText}</p>}
          {solutionUrl && (
            <img
              src={solutionUrl}
              alt="Solution"
              className="qwr-solution__img"
              loading="lazy"
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function QuestionWiseResult({ rows, hasAnswerKey, questions = [], getSolutionImageUrl }) {
  const questionMap = new Map(questions.map((q) => [q.number, q]));

  const formatSelected = (selected) => {
    if (!selected) return 'Not Attempted';
    return Array.isArray(selected) ? selected.join(', ') : selected;
  };

  const formatCorrect = (correctAnswer) => {
    if (!correctAnswer) return '—';
    return Array.isArray(correctAnswer) ? correctAnswer.join(', ') : correctAnswer;
  };

  return (
    <div className="qwr card">
      <p className="qwr__title">Question-wise Result</p>
      <div className="qwr__table-wrapper">
        <table className="qwr__table">
          <thead>
            <tr>
              <th>Q#</th>
              <th>Subject</th>
              <th>Selected Answer</th>
              {hasAnswerKey && <th>Correct Answer</th>}
              {hasAnswerKey && <th>Outcome</th>}
              {hasAnswerKey && <th>Solution</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const q = questionMap.get(row.number);
              return (
                <tr key={row.number}>
                  <td>Q{row.number}</td>
                  <td className="qwr__muted">{row.section || q?.subject || '—'}</td>
                  <td className={!row.selected ? 'qwr__muted' : ''}>{formatSelected(row.selected)}</td>
                  {hasAnswerKey && <td>{formatCorrect(row.correctAnswer)}</td>}
                  {hasAnswerKey && (
                    <td>
                      <span className={`qwr__badge qwr__badge--${row.outcome?.toLowerCase().replace(/\s+/g, '-')}`}>
                        {row.outcome}
                      </span>
                    </td>
                  )}
                  {hasAnswerKey && (
                    <td>
                      <SolutionViewer
                        questionId={q?.id}
                        getSolutionImageUrl={getSolutionImageUrl}
                        solutionText={q?.solutionText}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
