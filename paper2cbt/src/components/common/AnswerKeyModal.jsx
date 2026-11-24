import { useState, useMemo } from 'react';
import './AnswerKeyModal.css';

/**
 * Parses raw text containing question numbers and answers into a Map(qNum -> answer).
 * Handles formats like:
 * "1. A 2. C 3. B"
 * "1. (2) 2. (4) 3. (1)"
 * "1-A, 2-C, 3-B"
 * "Q1: C, Q2: D"
 * Multi-column table text: "1 B  11 A  21 C"
 */
export function parseAnswerKeyText(text) {
  const map = new Map();
  if (!text) return map;

  // Regex handles:
  // 1. (B), 1. B, 1: B, 1-B, 1) B, Q1: B, 1. 25, 1. (2)
  const regex = /(?:Q\.?\s*)?(\d{1,3})\s*[.:\-–)]\s*\(?([A-Da-d0-9.-]+)\)?/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const qNum = parseInt(match[1], 10);
    const ans = match[2].trim().toUpperCase();
    if (qNum > 0 && qNum <= 500 && ans.length > 0) {
      map.set(qNum, ans);
    }
  }

  return map;
}

export default function AnswerKeyModal({ isOpen, onClose, questions = [], currentAnswerKey, onSaveAnswerKey }) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState('grid'); // 'grid' | 'paste'
  const [pasteText, setPasteText] = useState('');
  const [localKey, setLocalKey] = useState(() => {
    const m = new Map();
    if (currentAnswerKey instanceof Map) {
      for (const [k, v] of currentAnswerKey.entries()) m.set(k, v);
    } else if (currentAnswerKey && typeof currentAnswerKey === 'object') {
      for (const [k, v] of Object.entries(currentAnswerKey)) m.set(Number(k), String(v));
    }
    return m;
  });

  const totalQuestions = questions.length;
  const mappedCount = useMemo(() => {
    let count = 0;
    for (const q of questions) {
      if (localKey.has(q.number)) count++;
    }
    return count;
  }, [questions, localKey]);

  function handleSetOption(qNum, value) {
    setLocalKey((prev) => {
      const next = new Map(prev);
      if (next.get(qNum) === value) {
        next.delete(qNum); // toggle off
      } else {
        next.set(qNum, value);
      }
      return next;
    });
  }

  function handleCustomValue(qNum, value) {
    setLocalKey((prev) => {
      const next = new Map(prev);
      if (value.trim()) {
        next.set(qNum, value.trim().toUpperCase());
      } else {
        next.delete(qNum);
      }
      return next;
    });
  }

  function handleParsePaste() {
    if (!pasteText.trim()) return;
    const parsed = parseAnswerKeyText(pasteText);
    if (parsed.size === 0) {
      alert('Could not find any question answers in the pasted text. Expected format like "1. A, 2. B, 3. C" or "1: 2, 2: 4"');
      return;
    }
    setLocalKey((prev) => {
      const next = new Map(prev);
      for (const [k, v] of parsed.entries()) {
        next.set(k, v);
      }
      return next;
    });
    setActiveTab('grid');
  }

  function handleSave() {
    onSaveAnswerKey(localKey);
    onClose();
  }

  function handleClearAll() {
    if (window.confirm('Clear all configured answers?')) {
      setLocalKey(new Map());
    }
  }

  return (
    <div className="answer-key-modal__overlay" onClick={onClose}>
      <div className="answer-key-modal__dialog" onClick={(e) => e.stopPropagation()}>
        <div className="answer-key-modal__header">
          <div>
            <h2 className="answer-key-modal__title">Configure Answer Key</h2>
            <p className="answer-key-modal__subtitle">
              {mappedCount} of {totalQuestions} questions mapped ({Math.round((mappedCount / (totalQuestions || 1)) * 100)}%)
            </p>
          </div>
          <button type="button" className="answer-key-modal__close-btn" onClick={onClose}>×</button>
        </div>

        <div className="answer-key-modal__tabs">
          <button
            type="button"
            className={`answer-key-modal__tab ${activeTab === 'grid' ? 'answer-key-modal__tab--active' : ''}`}
            onClick={() => setActiveTab('grid')}
          >
            📋 Quick Click Grid
          </button>
          <button
            type="button"
            className={`answer-key-modal__tab ${activeTab === 'paste' ? 'answer-key-modal__tab--active' : ''}`}
            onClick={() => setActiveTab('paste')}
          >
            ✍ Paste Text / Key Table
          </button>
        </div>

        <div className="answer-key-modal__body">
          {activeTab === 'paste' && (
            <div className="answer-key-modal__paste-area">
              <p className="answer-key-modal__instruction">
                Paste your answer key text or copied table from the PDF / website below.
                Formats supported: <code>1. B, 2. C, 3. A</code>, <code>1-(2), 2-(4)</code>, <code>1: 25.5</code>, etc.
              </p>
              <textarea
                className="answer-key-modal__textarea"
                rows={10}
                placeholder="e.g.&#10;1. B   11. C   21. A&#10;2. A   12. D   22. B&#10;3. C   13. A   23. 42"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <button
                type="button"
                className="answer-key-modal__action-btn answer-key-modal__action-btn--primary"
                onClick={handleParsePaste}
              >
                ⚡ Auto-Parse & Apply Answers
              </button>
            </div>
          )}

          {activeTab === 'grid' && (
            <div className="answer-key-modal__grid-container">
              <div className="answer-key-modal__grid">
                {questions.map((q) => {
                  const currentAns = localKey.get(q.number) || '';
                  const isA = currentAns === 'A' || currentAns === '1';
                  const isB = currentAns === 'B' || currentAns === '2';
                  const isC = currentAns === 'C' || currentAns === '3';
                  const isD = currentAns === 'D' || currentAns === '4';
                  const isCustom = currentAns && !isA && !isB && !isC && !isD;

                  return (
                    <div key={q.id || q.number} className={`answer-key-modal__row ${currentAns ? 'answer-key-modal__row--set' : ''}`}>
                      <span className="answer-key-modal__qnum">Q{q.number}</span>
                      <div className="answer-key-modal__options">
                        <button
                          type="button"
                          className={`answer-key-modal__opt-btn ${isA ? 'answer-key-modal__opt-btn--active' : ''}`}
                          onClick={() => handleSetOption(q.number, 'A')}
                          title="Option A / 1"
                        >
                          A (1)
                        </button>
                        <button
                          type="button"
                          className={`answer-key-modal__opt-btn ${isB ? 'answer-key-modal__opt-btn--active' : ''}`}
                          onClick={() => handleSetOption(q.number, 'B')}
                          title="Option B / 2"
                        >
                          B (2)
                        </button>
                        <button
                          type="button"
                          className={`answer-key-modal__opt-btn ${isC ? 'answer-key-modal__opt-btn--active' : ''}`}
                          onClick={() => handleSetOption(q.number, 'C')}
                          title="Option C / 3"
                        >
                          C (3)
                        </button>
                        <button
                          type="button"
                          className={`answer-key-modal__opt-btn ${isD ? 'answer-key-modal__opt-btn--active' : ''}`}
                          onClick={() => handleSetOption(q.number, 'D')}
                          title="Option D / 4"
                        >
                          D (4)
                        </button>
                      </div>
                      <input
                        type="text"
                        className={`answer-key-modal__custom-input ${isCustom ? 'answer-key-modal__custom-input--active' : ''}`}
                        placeholder="Value…"
                        value={isCustom ? currentAns : ''}
                        onChange={(e) => handleCustomValue(q.number, e.target.value)}
                        title="Numeric or integer answer"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="answer-key-modal__footer">
          <button type="button" className="answer-key-modal__btn-secondary" onClick={handleClearAll}>
            Clear All
          </button>
          <div className="answer-key-modal__footer-right">
            <button type="button" className="answer-key-modal__btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="answer-key-modal__btn-primary" onClick={handleSave}>
              ✓ Save & Apply Key ({mappedCount}/{totalQuestions})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
