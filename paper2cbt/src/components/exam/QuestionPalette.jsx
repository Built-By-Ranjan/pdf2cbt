// QuestionPalette.jsx — grid of question numbers colored by status, allows jumping to any question.
// Phase B: Groups questions by subject when multiple subjects are detected.
import { useState } from 'react';
import { QUESTION_STATUS } from '../../utils/constants';
import './QuestionPalette.css';

const STATUS_CLASS_MAP = {
  [QUESTION_STATUS.NOT_VISITED]: 'palette-item--not-visited',
  [QUESTION_STATUS.NOT_ANSWERED]: 'palette-item--not-answered',
  [QUESTION_STATUS.ANSWERED]: 'palette-item--answered',
  [QUESTION_STATUS.MARKED_FOR_REVIEW]: 'palette-item--marked',
  [QUESTION_STATUS.ANSWERED_AND_MARKED]: 'palette-item--answered-marked'
};

export default function QuestionPalette({ questions, statuses, currentIndex, onJump }) {
  const [filterSubject, setFilterSubject] = useState('all');

  // Build subject list
  const subjects = [...new Set(questions.map((q) => q.subject || 'General'))];
  const hasMultipleSubjects = subjects.length > 1;

  const filteredQuestions = hasMultipleSubjects && filterSubject !== 'all'
    ? questions.filter((q) => (q.subject || 'General') === filterSubject)
    : questions;

  return (
    <div className="question-palette card">
      <p className="question-palette__title">Question Palette</p>

      {hasMultipleSubjects && (
        <div className="question-palette__subjects">
          <button
            type="button"
            className={`palette-subject-btn ${filterSubject === 'all' ? 'palette-subject-btn--active' : ''}`}
            onClick={() => setFilterSubject('all')}
          >
            All
          </button>
          {subjects.map((s) => (
            <button
              key={s}
              type="button"
              className={`palette-subject-btn ${filterSubject === s ? 'palette-subject-btn--active' : ''}`}
              onClick={() => setFilterSubject(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="question-palette__grid">
        {filteredQuestions.map((q) => {
          const index = questions.indexOf(q);
          const status = statuses[q.number] || QUESTION_STATUS.NOT_VISITED;
          const isCurrent = index === currentIndex;
          return (
            <button
              key={q.id}
              type="button"
              className={`palette-item ${STATUS_CLASS_MAP[status]} ${isCurrent ? 'palette-item--current' : ''}`}
              onClick={() => onJump(index)}
              aria-label={`Go to question ${index + 1}`}
              title={q.subject ? `${q.subject} — Q${q.number}` : `Q${q.number}`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
      <div className="question-palette__legend">
        <LegendItem className="palette-item--answered" label="Answered" />
        <LegendItem className="palette-item--not-answered" label="Not Answered" />
        <LegendItem className="palette-item--marked" label="Marked" />
        <LegendItem className="palette-item--not-visited" label="Not Visited" />
      </div>
    </div>
  );
}

function LegendItem({ className, label }) {
  return (
    <div className="question-palette__legend-item">
      <span className={`palette-item palette-item--legend ${className}`} />
      <span>{label}</span>
    </div>
  );
}
