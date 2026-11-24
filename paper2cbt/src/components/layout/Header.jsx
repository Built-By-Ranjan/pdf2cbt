// Header.jsx — top app bar with logo and theme toggle. Hidden during active exam via CSS class on CBT page if needed.
import { Link, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import './Header.css';

export default function Header() {
  const location = useLocation();
  const isExamPage = location.pathname === '/exam';

  if (isExamPage) return null; // Keep exam page distraction-free; timer/palette live inside CBT page itself.

  return (
    <header className="app-header">
      <Link to="/" className="app-header__brand">
        <span className="app-header__logo">📄➜💻</span>
        <span className="app-header__title">Paper2CBT</span>
      </Link>
      <ThemeToggle />
    </header>
  );
}
