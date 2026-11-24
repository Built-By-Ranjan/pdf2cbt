// DropZone.jsx — drag-and-drop + click-to-browse PDF upload area.
import { useRef, useState, useCallback } from 'react';
import { isValidPdfFile } from '../../utils/validators';
import Button from '../common/Button';
import './DropZone.css';

export default function DropZone({ onFileSelected }) {
  const inputRef = useRef(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = useCallback(
    (files) => {
      const file = files?.[0];
      if (!file) return;
      if (!isValidPdfFile(file)) {
        setError('Please upload a valid PDF file.');
        return;
      }
      setError('');
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`dropzone ${isDragActive ? 'dropzone--active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="visually-hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="dropzone__icon">📄</div>
      <p className="dropzone__title">Drag & drop your question PDF here</p>
      <p className="dropzone__subtitle">or</p>
      <Button variant="primary" size="md">Browse Files</Button>
      {error && <p className="dropzone__error">{error}</p>}
    </div>
  );
}
