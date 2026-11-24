// Footer.jsx — displays credit and repository link. Hidden during exam.
import { useLocation } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
  const location = useLocation();
  if (location.pathname === '/exam') return null;

  return (
    <footer className="app-footer">
      <span>Made by Ranjan</span>
      <a
        href="https://github.com/Built-By-Ranjan"
        target="_blank"
        rel="noopener noreferrer"
        className="app-footer__link"
      >
        GitHub Repository
      </a>
    </footer>
  );
}
