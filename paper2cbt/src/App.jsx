// App.jsx
// Root component: sets up providers and client-side routing.
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ExamProvider } from './context/ExamContext';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import Settings from './pages/Settings';
import CBT from './pages/CBT';
import Result from './pages/Result';

export default function App() {
  return (
    <ThemeProvider>
      <ExamProvider>
        <BrowserRouter>
          <div className="app-shell">
            <Header />
            <main className="app-main">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/exam" element={<CBT />} />
                <Route path="/result" element={<Result />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </BrowserRouter>
      </ExamProvider>
    </ThemeProvider>
  );
}
