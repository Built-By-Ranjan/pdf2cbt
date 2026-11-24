// OptionList.jsx — renders selectable options for the current question.
// Supports single-select (radio) and multi-select (checkbox) modes.
import { QUESTION_TYPES } from '../../utils/constants';
import './OptionList.css';

export default function OptionList({ question, selected, onSelect }) {
  const isMultiple = question.type === QUESTION_TYPES.MULTIPLE_CHOICE;
  const selectedSet = new Set(Array.isArray(selected) ? selected : selected ? [selected] : []);

  const handleClick = (label) => {
    if (isMultiple) {
      const next = new Set(selectedSet);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      onSelect(Array.from(next));
    } else {
      onSelect(label);
    }
  };

  return (
    <div className="option-list">
      {question.options.map((opt) => {
        const isChecked = selectedSet.has(opt.label);
        return (
          <button
            key={opt.label}
            type="button"
            className={`option-item ${isChecked ? 'option-item--selected' : ''}`}
            onClick={() => handleClick(opt.label)}
          >
            <span className={`option-item__marker ${isMultiple ? 'option-item__marker--square' : ''}`}>
              {opt.label}
            </span>
            <span className="option-item__text">{opt.text}</span>
          </button>
        );
      })}
    </div>
  );
}
