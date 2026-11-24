// ProgressBar.jsx — used for processing status and exam time-remaining indicators.
import './ProgressBar.css';

export default function ProgressBar({ value, max = 100, variant = 'primary' }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="progress-bar" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div
        className={`progress-bar__fill progress-bar__fill--${variant}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
