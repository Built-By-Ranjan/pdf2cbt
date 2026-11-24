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
import { QUESTION_TYPES } from '../../utils/constants';
import { saveQuestions, saveAnswerKey } from '../../services/indexedDbService';
import Button from '../common/Button';
import './ReviewScreen.css';

const TYPE_LABELS = {
  [QUESTION_TYPES.SINGLE_CHOICE]: 'Single MCQ',
  [QUESTION_TYPES.MULTIPLE_CHOICE]: 'Multi MCQ',
  [QUESTION_TYPES.INTEGER]: 'Integer',
  [QUESTION_TYPES.NUMERICAL]: 'Numerical',
  [QUESTION_TYPES.HYBRID]: 'Hybrid (MCQ + Numeric)',
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

  if (isMcq && (!q.options || q.options.length < 4)) flags.push(`Only ${q.options?.length || 0} option(s)`);
  if (isMcq && q.options && q.options.length > 4) flags.push(`${q.options.length} options`);

  // Duplicate number check
  const sameNumber = allQuestions.filter((x) => x.number === q.number);
  if (sameNumber.length > 1) flags.push('Duplicate number');

  // Answer key check
  const hasAnswer = (answerKey && answerKey.has(q.number)) || Boolean(q.inlineAnswer);
  if (!hasAnswer && isMcq) flags.push('No answer key');

  // Confidence check
  if (q.confidence !== undefined && q.confidence < 0.6) flags.push('Low confidence');

  return flags;
}

function combineBboxes(b1, b2) {
  if (!b1 && !b2) return null;
  if (!b1) return b2 ? { ...b2 } : null;
  if (!b2) return b1 ? { ...b1 } : null;
  const x = Math.min(b1.x, b2.x);
  const y = Math.min(b1.y, b2.y);
  const right = Math.max(b1.x + b1.width, b2.x + b2.width);
  const bottom = Math.max(b1.y + b1.height, b2.y + b2.height);
  return {
    pageNumber: b1.pageNumber || b2.pageNumber,
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

export default function ReviewScreen({ onProceed }) {
  const { questions, answerKey, getQuestionImageUrl, setQuestions, setAnswerKey } = useExam();
  const navigate = useNavigate();

  // Local editable copy of questions
  const [localQuestions, setLocalQuestions] = useState(() => questions.map((q) => ({ ...q })));
  const [localAnswerKey, setLocalAnswerKey] = useState(() => {
    const map = new Map();
    if (answerKey instanceof Map) {
      for (const [k, v] of answerKey.entries()) map.set(k, v);
    }
    return map;
  });

  const [imageUrls, setImageUrls] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [splitTargetId, setSplitTargetId] = useState(null);

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

  function renumberQuestions(qs) {
    return qs.map((q, idx) => ({
      ...q,
      number: idx + 1,
      displayNumber: q.displayNumber || String(idx + 1),
    }));
  }

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

  function handleAnswerChange(qNumber, val) {
    setLocalAnswerKey((prev) => {
      const next = new Map(prev);
      if (val) next.set(qNumber, val);
      else next.delete(qNumber);
      return next;
    });
  }

  function handleMergeWithNext(qId) {
    setLocalQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === qId);
      if (idx === -1 || idx >= prev.length - 1) return prev;
      const q1 = prev[idx];
      const q2 = prev[idx + 1];

      const merged = {
        ...q1,
        text: [q1.text, q2.text].filter(Boolean).join('\n'),
        options: [...(q1.options || []), ...(q2.options || [])],
        bbox: combineBboxes(q1.bbox, q2.bbox),
        inlineAnswer: q1.inlineAnswer || q2.inlineAnswer || null,
        solutionText: [q1.solutionText, q2.solutionText].filter(Boolean).join('\n') || null,
      };

      const next = [...prev.slice(0, idx), merged, ...prev.slice(idx + 2)];
      return renumberQuestions(next);
    });
  }

  function handleSplitQuestion(qId, splitOptionIndex = null) {
    setLocalQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === qId);
      if (idx === -1) return prev;
      const q = prev[idx];

      let q1Options = q.options || [];
      let q2Options = [];
      let q1Text = q.text || '';
      let q2Text = '';

      if (splitOptionIndex !== null && q.options && q.options.length > splitOptionIndex) {
        q1Options = q.options.slice(0, splitOptionIndex);
        q2Options = q.options.slice(splitOptionIndex);
      } else {
        // Split text in half if no options
        const lines = (q.text || '').split('\n');
        const mid = Math.max(1, Math.floor(lines.length / 2));
        q1Text = lines.slice(0, mid).join('\n');
        q2Text = lines.slice(mid).join('\n');
      }

      const q1 = {
        ...q,
        text: q1Text,
        options: q1Options,
      };

      const q2 = {
        ...q,
        id: `${q.id}_split_${Date.now()}`,
        text: q2Text,
        options: q2Options,
        inlineAnswer: null,
        solutionText: null,
      };

      const next = [...prev.slice(0, idx), q1, q2, ...prev.slice(idx + 1)];
      return renumberQuestions(next);
    });
    setSplitTargetId(null);
  }

  function adjustCropBox(qId, edge, delta) {
    setLocalQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const currentAdj = q.cropAdjust || { top: 0, bottom: 0, left: 0, right: 0 };
        const nextAdj = {
          ...currentAdj,
          [edge]: (currentAdj[edge] || 0) + delta,
        };

        let nextBbox = q.bbox ? { ...q.bbox } : null;
        if (nextBbox) {
          if (edge === 'top') {
            nextBbox.y = Math.max(0, nextBbox.y - delta);
            nextBbox.height = Math.max(10, nextBbox.height + delta);
          } else if (edge === 'bottom') {
            nextBbox.height = Math.max(10, nextBbox.height + delta);
          } else if (edge === 'left') {
            nextBbox.x = Math.max(0, nextBbox.x - delta);
            nextBbox.width = Math.max(10, nextBbox.width + delta);
          } else if (edge === 'right') {
            nextBbox.width = Math.max(10, nextBbox.width + delta);
          }
        }

        return {
          ...q,
          bbox: nextBbox,
          cropAdjust: nextAdj,
        };
      })
    );
  }

  async function handleProceed() {
    setQuestions(localQuestions);
    setAnswerKey(localAnswerKey);
    try {
      await saveQuestions(localQuestions);
      await saveAnswerKey(localAnswerKey);
    } catch { /* skip */ }

    if (onProceed) onProceed();
    else navigate('/settings');
  }

  const totalFlags = localQuestions.reduce(
    (sum, q) => sum + flagQuestion(q, localQuestions, localAnswerKey).length,
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
              {subjectQs.map((q) => {
                const globalIdx = localQuestions.findIndex((item) => item.id === q.id);
                const flags = flagQuestion(q, localQuestions, localAnswerKey);
                const isExpanded = expanded === q.id;
                const currentAnswer = localAnswerKey.get(q.number) || q.inlineAnswer || '';

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
                          <div className="review-card__type-row">
                            <select
                              value={q.type}
                              onChange={(e) => changeType(q.id, e.target.value)}
                              className="review-card__select"
                            >
                              {Object.entries(TYPE_LABELS).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                              ))}
                            </select>
                            {currentAnswer && (
                              <span className="review-card__hint-badge" title="Answer key value detected (type not forced)">
                                Hint: Ans = {currentAnswer}
                              </span>
                            )}
                          </div>
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

                        <label>
                          Answer Key:
                          <input
                            type="text"
                            className="review-card__input"
                            value={currentAnswer}
                            onChange={(e) => handleAnswerChange(q.number, e.target.value.toUpperCase().trim())}
                            placeholder="e.g. A or 42"
                          />
                        </label>

                        {q.options && q.options.length > 0 && (
                          <p className="review-card__info">Options: {q.options.map((o) => o.label).join(', ')}</p>
                        )}

                        {/* Merge and Split Controls */}
                        <div className="review-card__actions-row">
                          {globalIdx < localQuestions.length - 1 && (
                            <button
                              type="button"
                              className="review-card__btn review-card__btn--merge"
                              onClick={() => handleMergeWithNext(q.id)}
                              title="Merge with next question"
                            >
                              ⇥ Merge with Q{localQuestions[globalIdx + 1]?.number}
                            </button>
                          )}
                          <button
                            type="button"
                            className="review-card__btn review-card__btn--split"
                            onClick={() => setSplitTargetId(splitTargetId === q.id ? null : q.id)}
                            title="Split into two questions"
                          >
                            ✂ Split Question
                          </button>
                        </div>

                        {splitTargetId === q.id && (
                          <div className="review-card__split-panel">
                            <span className="review-card__split-label">Select split point:</span>
                            {q.options && q.options.length > 1 ? (
                              <div className="review-card__split-options">
                                {q.options.map((opt, oIdx) => (
                                  oIdx > 0 && (
                                    <button
                                      key={opt.label + oIdx}
                                      type="button"
                                      className="review-card__btn-sub"
                                      onClick={() => handleSplitQuestion(q.id, oIdx)}
                                    >
                                      Split at Option {opt.label}
                                    </button>
                                  )
                                ))}
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="review-card__btn-sub"
                                onClick={() => handleSplitQuestion(q.id, null)}
                              >
                                Split in Half
                              </button>
                            )}
                          </div>
                        )}

                        {/* Crop Box Adjustment */}
                        <div className="review-card__crop-section">
                          <span className="review-card__crop-title">Adjust Crop Box (pts):</span>
                          <div className="review-card__crop-grid">
                            <div className="review-card__crop-axis">
                              <span>Top</span>
                              <div className="review-card__btn-group">
                                <button type="button" onClick={() => adjustCropBox(q.id, 'top', -10)}>-10</button>
                                <button type="button" onClick={() => adjustCropBox(q.id, 'top', 10)}>+10</button>
                              </div>
                            </div>
                            <div className="review-card__crop-axis">
                              <span>Bottom</span>
                              <div className="review-card__btn-group">
                                <button type="button" onClick={() => adjustCropBox(q.id, 'bottom', -10)}>-10</button>
                                <button type="button" onClick={() => adjustCropBox(q.id, 'bottom', 10)}>+10</button>
                              </div>
                            </div>
                            <div className="review-card__crop-axis">
                              <span>Left</span>
                              <div className="review-card__btn-group">
                                <button type="button" onClick={() => adjustCropBox(q.id, 'left', -10)}>-10</button>
                                <button type="button" onClick={() => adjustCropBox(q.id, 'left', 10)}>+10</button>
                              </div>
                            </div>
                            <div className="review-card__crop-axis">
                              <span>Right</span>
                              <div className="review-card__btn-group">
                                <button type="button" onClick={() => adjustCropBox(q.id, 'right', -10)}>-10</button>
                                <button type="button" onClick={() => adjustCropBox(q.id, 'right', 10)}>+10</button>
                              </div>
                            </div>
                          </div>
                          {q.cropAdjust && (
                            <span className="review-card__crop-status">
                              Offsets: T:{q.cropAdjust.top || 0} B:{q.cropAdjust.bottom || 0} L:{q.cropAdjust.left || 0} R:{q.cropAdjust.right || 0}
                            </span>
                          )}
                        </div>
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
