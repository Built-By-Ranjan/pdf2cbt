// ScoreCard.jsx — shown only when an answer key was detected: Correct/Wrong/Score/%/Accuracy.
import './ScoreCard.css';

export default function ScoreCard({ correct, wrong, score, maxPossibleScore, percentage, accuracy }) {
  const stats = [
    { label: 'Correct', value: correct, variant: 'success' },
    { label: 'Wrong', value: wrong, variant: 'danger' },
    { label: 'Score', value: `${score} / ${maxPossibleScore}`, variant: 'primary' },
    { label: 'Percentage', value: `${percentage}%`, variant: 'primary' },
    { label: 'Accuracy', value: `${accuracy}%`, variant: 'primary' }
  ];

  return (
    <div className="score-card card">
      <p className="score-card__title">Score Summary</p>
      <div className="score-card__grid">
        {stats.map((stat) => (
          <div key={stat.label} className={`score-card__item score-card__item--${stat.variant}`}>
            <p className="score-card__value">{stat.value}</p>
            <p className="score-card__label">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
