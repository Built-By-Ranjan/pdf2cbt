// Loader.jsx — spinner + optional label, used during PDF processing.
import './Loader.css';

export default function Loader({ label }) {
  return (
    <div className="loader">
      <div className="loader__spinner" role="status" aria-label="Loading" />
      {label && <p className="loader__label">{label}</p>}
    </div>
  );
}
