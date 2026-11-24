// Modal.jsx — simple, reusable, accessible modal dialog. Used for confirmations
// (e.g. Settings confirm screen, Submit exam confirmation).
import { useEffect } from 'react';
import './Modal.css';

export default function Modal({ title, children, onClose, actions }) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        {title && <h3 className="modal__title">{title}</h3>}
        <div className="modal__body">{children}</div>
        {actions && <div className="modal__actions">{actions}</div>}
      </div>
    </div>
  );
}
