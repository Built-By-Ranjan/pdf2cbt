// QuestionCard.jsx
// Phase A: Image-first display. Shows the cropped question image (from IDB)
// as the primary content. Falls back to text rendering when no image is available.
// Phase C: Added INTEGER type support with decimal-capable numeric input.
import { useState, useEffect } from 'react';
import OptionList from './OptionList';
import { QUESTION_TYPES } from '../../utils/constants';
import { useExam } from '../../context/ExamContext';
import './QuestionCard.css';

export default function QuestionCard({ question, selected, onSelect, questionIndex, total }) {
  const { getQuestionImageUrl } = useExam();
  const [imageUrl, setImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);

  const isSubjective = question.type === QUESTION_TYPES.SUBJECTIVE;
  const isNumerical = question.type === QUESTION_TYPES.NUMERICAL || question.type === QUESTION_TYPES.INTEGER;
  const isHybrid = question.type === QUESTION_TYPES.HYBRID;

  // Load the cropped question image lazily when this question is displayed.
  useEffect(() => {
    let cancelled = false;
    if (question.imageUrl) {
      setImageUrl(question.imageUrl);
      setImageLoading(false);
      return;
    }
    if (!question.id) return;

    setImageUrl(null);
    setImageLoading(true);

    getQuestionImageUrl(question.id).then((url) => {
      if (!cancelled) {
        setImageUrl(url);
        setImageLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setImageLoading(false);
    });

    return () => { cancelled = true; };
  }, [question.id, question.imageUrl, getQuestionImageUrl]);

  const subjectBadge = question.subject && (
    <span className="question-card__subject-badge">{question.subject}</span>
  );

  const sectionBadge = question.section && (
    <span className="question-card__section-badge">{question.section}</span>
  );

  const typeBadge = question.type === QUESTION_TYPES.INTEGER ? (
    <span className="question-card__badge question-card__badge--integer">Integer</span>
  ) : question.type === QUESTION_TYPES.NUMERICAL ? (
    <span className="question-card__badge question-card__badge--numerical">Numerical</span>
  ) : question.type === QUESTION_TYPES.HYBRID ? (
    <span className="question-card__badge question-card__badge--hybrid">Hybrid</span>
  ) : null;

  return (
    <div className="question-card card">
      <div className="question-card__header">
        <span className="question-card__count">
          Question {questionIndex + 1} of {total}
        </span>
        <div className="question-card__badges">
          {subjectBadge}
          {sectionBadge}
          {typeBadge}
          {question.hasImage && !imageUrl && !imageLoading && (
            <span className="question-card__badge">Contains Image</span>
          )}
        </div>
      </div>

      {/* Phase A: Show cropped image as primary content */}
      {imageLoading && (
        <div className="question-card__image-loading">Loading question image…</div>
      )}

      {imageUrl && (
        <div className="question-card__image-container">
          <img
            src={imageUrl}
            alt={`Question ${question.number}`}
            className="question-card__image"
            loading="lazy"
          />
        </div>
      )}

      {/* Text fallback: shown when no image is available */}
      {!imageUrl && !imageLoading && (
        <p className="question-card__text">{question.question || '(Question image not available)'}</p>
      )}

      {/* Answer input area */}
      {isSubjective && (
        <textarea
          className="question-card__textarea"
          rows={6}
          placeholder="Type your answer here…"
          value={selected || ''}
          onChange={(e) => onSelect(e.target.value)}
        />
      )}

      {isNumerical && (
        <div className="question-card__numerical-area">
          <label className="question-card__numerical-label">
            {question.type === QUESTION_TYPES.INTEGER
              ? 'Enter integer answer (0–9):'
              : 'Enter numeric answer:'}
          </label>
          <input
            type="number"
            step={question.type === QUESTION_TYPES.INTEGER ? '1' : 'any'}
            className="question-card__number-input"
            placeholder={question.type === QUESTION_TYPES.INTEGER ? '0' : '0.00'}
            value={selected ?? ''}
            onChange={(e) => onSelect(e.target.value)}
          />
        </div>
      )}

      {isHybrid && (
        <div className="question-card__hybrid-area">
          <p className="question-card__hybrid-instruction">
            Select an option (A–D / 1–4) or enter numeric answer:
          </p>
          <OptionList
            question={{
              ...question,
              options: (question.options && question.options.length > 0)
                ? question.options
                : [
                    { label: 'A', text: '(1)', isImageOption: true },
                    { label: 'B', text: '(2)', isImageOption: true },
                    { label: 'C', text: '(3)', isImageOption: true },
                    { label: 'D', text: '(4)', isImageOption: true },
                  ]
            }}
            selected={selected}
            onSelect={onSelect}
          />
          <div className="question-card__hybrid-divider">
            <span>OR</span>
          </div>
          <div className="question-card__numerical-area">
            <label className="question-card__numerical-label">Enter numeric / integer answer:</label>
            <input
              type="text"
              className="question-card__number-input"
              placeholder="e.g. 2 or 14.5"
              value={selected ?? ''}
              onChange={(e) => onSelect(e.target.value)}
            />
          </div>
        </div>
      )}

      {!isSubjective && !isNumerical && !isHybrid && (
        <OptionList question={question} selected={selected} onSelect={onSelect} />
      )}
    </div>
  );
}
