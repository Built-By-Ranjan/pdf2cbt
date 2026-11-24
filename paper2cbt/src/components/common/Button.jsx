// Button.jsx — reusable button with variants. Never duplicate button styling elsewhere.
import './Button.css';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  type = 'button',
  fullWidth = false
}) {
  const classNames = ['btn', `btn--${variant}`, `btn--${size}`, fullWidth ? 'btn--full' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classNames} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
