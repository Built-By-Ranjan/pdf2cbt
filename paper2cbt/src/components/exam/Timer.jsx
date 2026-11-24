// Timer.jsx — displays remaining exam time, turns red under 60 seconds.
import { formatSeconds } from '../../utils/timeUtils';
import './Timer.css';

export default function Timer({ secondsLeft }) {
  const isCritical = secondsLeft <= 60;
  return (
    <div className={`exam-timer ${isCritical ? 'exam-timer--critical' : ''}`}>
      <span className="exam-timer__icon">⏱</span>
      <span className="exam-timer__value">{formatSeconds(secondsLeft)}</span>
    </div>
  );
}
