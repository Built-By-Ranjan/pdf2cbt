// PdfPreview.jsx — shows basic file info (name, size, page count once known) before/while processing.
import './PdfPreview.css';

export default function PdfPreview({ file, pageCount }) {
  if (!file) return null;
  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);

  return (
    <div className="pdf-preview card">
      <div className="pdf-preview__icon">📄</div>
      <div className="pdf-preview__info">
        <p className="pdf-preview__name">{file.name}</p>
        <p className="pdf-preview__meta">
          {sizeMb} MB{pageCount ? ` • ${pageCount} pages` : ''}
        </p>
      </div>
    </div>
  );
}
