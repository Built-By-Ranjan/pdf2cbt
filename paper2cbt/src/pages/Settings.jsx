// Settings.jsx — collects exam time, correct/negative/skip marks, then shows a
// confirmation screen before starting the CBT.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../context/ExamContext';
import { validateSettings } from '../utils/validators';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import './Settings.css';

export default function Settings() {
  const navigate = useNavigate();
  const { settings, setSettings, questions, startExam } = useExam();
  const [form, setForm] = useState(settings);
  const [errors, setErrors] = useState({});
  const [showConfirm, setShowConfirm] = useState(false);

  if (!questions || questions.length === 0) {
    return (
      <div className="settings-page">
        <p>No parsed questions found. Please upload a PDF first.</p>
        <Button variant="primary" onClick={() => navigate('/')}>Go to Upload</Button>
      </div>
    );
  }

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleReview = () => {
    const { isValid, errors: validationErrors } = validateSettings(form);
    setErrors(validationErrors);
    if (isValid) setShowConfirm(true);
  };

  const handleConfirm = () => {
    setSettings({
      examTimeMinutes: Number(form.examTimeMinutes),
      correctMarks: Number(form.correctMarks),
      negativeMarks: Number(form.negativeMarks),
      skipMarks: Number(form.skipMarks)
    });
    startExam();
    navigate('/exam');
  };

  return (
    <div className="settings-page">
      <h1>Exam Settings</h1>
      <p className="settings-page__subtitle">Configure your test before you begin.</p>

      <div className="settings-form card">
        <Field
          label="Exam Time (minutes)"
          value={form.examTimeMinutes}
          onChange={handleChange('examTimeMinutes')}
          error={errors.examTimeMinutes}
        />
        <Field
          label="Correct Marks (per question)"
          value={form.correctMarks}
          onChange={handleChange('correctMarks')}
          error={errors.correctMarks}
        />
        <Field
          label="Negative Marks (per wrong answer)"
          value={form.negativeMarks}
          onChange={handleChange('negativeMarks')}
          error={errors.negativeMarks}
        />
        <Field
          label="Skip Marks (per unattempted question)"
          value={form.skipMarks}
          onChange={handleChange('skipMarks')}
          error={errors.skipMarks}
        />

        <Button variant="primary" size="lg" fullWidth onClick={handleReview}>
          Review & Start Exam
        </Button>
      </div>

      {showConfirm && (
        <Modal
          title="Confirm Exam Settings"
          onClose={() => setShowConfirm(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setShowConfirm(false)}>Edit</Button>
              <Button variant="success" onClick={handleConfirm}>Start Exam</Button>
            </>
          }
        >
          <ul className="settings-confirm__list">
            <li>Total Questions: <strong>{questions.length}</strong></li>
            <li>Exam Time: <strong>{form.examTimeMinutes} minutes</strong></li>
            <li>Correct Marks: <strong>+{form.correctMarks}</strong></li>
            <li>Negative Marks: <strong>-{form.negativeMarks}</strong></li>
            <li>Skip Marks: <strong>{form.skipMarks}</strong></li>
          </ul>
          <p>Once started, the timer cannot be paused. Good luck!</p>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, value, onChange, error }) {
  return (
    <div className="settings-field">
      <label className="settings-field__label">{label}</label>
      <input
        type="number"
        min="0"
        className="settings-field__input"
        value={value}
        onChange={onChange}
      />
      {error && <p className="settings-field__error">{error}</p>}
    </div>
  );
}
