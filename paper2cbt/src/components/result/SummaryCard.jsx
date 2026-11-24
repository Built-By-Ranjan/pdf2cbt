// SummaryCard.jsx — shows Total / Attempted / Skipped counts. Always shown regardless of answer key.
import './SummaryCard.css';

export default function SummaryCard({ total, attempted, skipped }) {
  const stats = [
    { label: 'Total Questions', value: total },
    { label: 'Attempted', value: attempted },
    { label: 'Skipped', value: skipped }
  ];

  return (
    <div className="summary-card card">
      {stats.map((stat) => (
        <div key={stat.label} className="summary-card__stat">
          <p className="summary-card__value">{stat.value}</p>
          <p className="summary-card__label">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
