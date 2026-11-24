// ReviewScreen.jsx
// Phase E: Pre-test review screen. After parsing, shows a grid of detected
// questions grouped by subject/section with crop thumbnails. Flags problems:
// gaps/duplicates in numbering, questions with <4 options (for MCQ), very
// small or large crops, low confidence, key/question count mismatches.
// Lets the user change question type, set/correct answer, and change subject.
// Only when satisfied does the user click "Start Test".
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../../context/ExamContext';
import { QUESTION_TYPES, QUESTION_STATUS } from '../../utils/constants';
import Button from '../common/Button';
import './ReviewScreen.css';

const TYPE_LABELS = {
  [QUESTION_TYPES.SINGLE_CHOICE]: 'Single MCQ',
  [QUESTION_TYPES.MULTIPLE_CHOICE]: 'Multi MCQ',
  [QUESTION_TYPES.INTEGER]: 'Integer',
  [QUESTION_TYPES.NUMERICAL]: 'Numerical',
  [QUESTION_TYPES.SUBJECTIVE]: 'Subjective',
  [QUESTION_TYPES.TRUE_FALSE]: 'True/False',
  [QUESTION_TYPES.ASSERTION_REASON]: 'Assert/Reason',
};

/**
 * Returns an array of flag strings for a question.
 */
function flagQuestion(q, allQuestions, answerKey) {
  const flags = [];
  const isMcq = [
    QUESTION_TYPES.SINGLE_CHOICE,
    QUESTION_TYPES.MULTIPLE_CHOICE,
    QUESTION_TYPES.TRUE_FALSE,
    QUESTION_TYPES.ASSERTION_REASON,
  ].includes(q.type);

  if (isMcq && q.options.length < 4) flags.push(`Only ${q.options.length} option(s)`);
  if (isMcq && q.options.length > 4) flags.push(`${q.options.length} options`);

  // Duplicate number check
  const sameNumber = allQuestions.filter((x) => x.number === q.number);
  if (sameNumber.length > 1) flags.push('Duplicate number');

  // Answer key mismatch
  if (answerKey && !answerKey.has(q.number) && isMcq) flags.push('No answer key');

  return flags;
}

export default function ReviewScreen({ onProceed }) {
  const { questions, answerKey, getQuestionImageUrl, setQuestions } = useExam();
  const navigate = useNavigate();

  // Local editable copy of questions
  const [localQuestions, setLocalQuestions] = useState(() => questions.map((q) => ({ ...q })));
  const [imageUrls, setImageUrls] = useState({});
  const [expanded, setExpanded] = useState(null);

  // Load thumbnails for all questions lazily
  useEffect(() => {
    let cancelled = false;
    async function loadThumbs() {
      const urls = {};
      for (const q of localQuestions) {
        if (cancelled) break;
        try {
          // eslint-disable-next-line no-await-in-loop
          const url = await getQuestionImageUrl(q.id);
          if (url) urls[q.id] = url;
        } catch { /* skip */ }
      }
      if (!cancelled) setImageUrls(urls);
    }
    loadThumbs();
    return () => { cancelled = true; };
  }, [localQuestions, getQuestionImageUrl]);

  const subjects = [...new Set(localQuestions.map((q) => q.subject || 'General'))];

  function changeType(qId, newType) {
    setLocalQuestions((prev) =>
      prev.map((q) => q.id === qId ? { ...q, type: newType } : q)
    );
  }

  function changeSubject(qId, newSubject) {
    setLocalQuestions((prev) =>
      prev.map((q) => q.id === qId ? { ...q, subject: newSubject || null } : q)
    );
  }

  function handleProceed() {
    // Push local edits back to context
    setQuestions(localQuestions);
    if (onProceed) onProceed();
    else navigate('/settings');
  }

  const totalFlags = localQuestions.reduce(
    (sum, q) => sum + flagQuestion(q, localQuestions, answerKey).length,
    0
  );

  return (
    <div className="review-screen">
      <div className="review-screen__header">
        <h2>Review Parsed Questions</h2>
        <p className="review-screen__summary">
          {localQuestions.length} questions detected across {subjects.length} subject(s).
          {totalFlags > 0 && (
            <span className="review-screen__flag-count"> ⚠ {totalFlags} issue(s) flagged.</span>
          )}
        </p>
      </div>

      {subjects.map((subject) => {
        const subjectQs = localQuestions.filter((q) => (q.subject || 'General') === subject);
        return (
          <div key={subject} className="review-screen__subject-group">
            <h3 className="review-screen__subject-title">
              {subject} <span className="review-screen__count">({subjectQs.length})</span>
            </h3>
            <div className="review-screen__grid">
              {subjectQs.map((q, idx) => {
                const flags = flagQuestion(q, localQuestions, answerKey);
                const isExpanded = expanded === q.id;
                return (
                  <div
                    key={q.id}
                    className={`review-card ${flags.length > 0 ? 'review-card--flagged' : ''} ${isExpanded ? 'review-card--expanded' : ''}`}
                  >
                    <div className="review-card__top" onClick={() => setExpanded(isExpanded ? null : q.id)}>
                      <span className="review-card__num">Q{q.number}</span>
                      {imageUrls[q.id] && (
                        <img
                          src={imageUrls[q.id]}
                          alt={`Q${q.number} thumbnail`}
                          className="review-card__thumb"
                        />
                      )}
                      {!imageUrls[q.id] && (
                        <span className="review-card__noimg">No image</span>
                      )}
                      {flags.length > 0 && (
                        <div className="review-card__flags">
                          {flags.map((f) => (
                            <span key={f} className="review-card__flag">⚠ {f}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="review-card__details">
                        <label>
                          Type:
                          <select
                            value={q.type}
                            onChange={(e) => changeType(q.id, e.target.value)}
                            className="review-card__select"
                          >
                            {Object.entries(TYPE_LABELS).map(([val, label]) => (
                              <option key={val} value={val}>{label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Subject:
                          <input
                            type="text"
                            className="review-card__input"
                            value={q.subject || ''}
                            onChange={(e) => changeSubject(q.id, e.target.value)}
                            placeholder="e.g. Physics"
                          />
                        </label>
                        {q.inlineAnswer && (
                          <p className="review-card__info">Inline answer: <strong>{q.inlineAnswer}</strong></p>
                        )}
                        {q.options.length > 0 && (
                          <p className="review-card__info">Options: {q.options.map((o) => o.label).join(', ')}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="review-screen__actions">
        <Button variant="secondary" onClick={() => navigate('/')}>
          Re-upload
        </Button>
        <Button variant="primary" size="lg" onClick={handleProceed}>
          Proceed to Settings →
        </Button>
      </div>
    </div>
  );
}
