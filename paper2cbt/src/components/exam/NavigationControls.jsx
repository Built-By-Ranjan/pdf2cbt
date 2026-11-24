// NavigationControls.jsx — Previous / Next / Mark for review / Clear response / Submit buttons.
import Button from '../common/Button';
import './NavigationControls.css';

export default function NavigationControls({
  onPrevious,
  onNext,
  onMarkForReview,
  onClearResponse,
  onSubmit,
  isFirst,
  isLast
}) {
  return (
    <div className="nav-controls">
      <div className="nav-controls__group">
        <Button variant="secondary" onClick={onMarkForReview}>Mark for Review</Button>
        <Button variant="ghost" onClick={onClearResponse}>Clear Response</Button>
      </div>
      <div className="nav-controls__group">
        <Button variant="secondary" onClick={onPrevious} disabled={isFirst}>Previous</Button>
        {isLast ? (
          <Button variant="success" onClick={onSubmit}>Submit Exam</Button>
        ) : (
          <Button variant="primary" onClick={onNext}>Next</Button>
        )}
      </div>
    </div>
  );
}
