# 📄➜💻 PDF2CBT — Instant PDF to Computer Based Test (CBT)

[![React](https://img.shields.io/badge/React-19-blue.svg?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF.svg?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Built by](https://img.shields.io/badge/Author-Built--By--Ranjan-indigo.svg)](https://github.com/Built-By-Ranjan)

> **Convert any question paper PDF into a real-time, interactive Computer Based Test (CBT) instantly — with high-resolution question cropping, official answer key evaluation, and JEE Main PYQ papers ready to practice!  https://pdf-to-cbt-by-ranjan.netlify.app/**

---

## ⚡ Highlights & Key Features

- **🎯 Exact High-Resolution Question Slicing:** Multi-column & single-column smart boundary detection with 2x crisp rendering and auto-trimming to eliminate watermarks and empty margins.
- **🖥️ Realistic NTA/JEE CBT Interface:** 
  - Real-time countdown timer with auto-submit.
  - Interactive **Question Palette** showing Answered, Not Answered, Marked for Review, and Not Visited statuses.
  - Sticky exam header with quick **"Finish Test"** and persistent sidebar palette.
- **🧩 Hybrid Input Widget:** Seamlessly supports both Multiple Choice Options (A–D / 1–4) and Numerical/Integer value inputs.
- **📊 Instant Result & Auto-Evaluation:** Parses official answer keys at the back of PDFs to automatically calculate scores, negative marking, accuracy, and detailed question-wise breakdowns.
- **📚 13 Preloaded Physics PYQ Papers:** Instant access to 1,500+ curated JEE Main Physics questions (2019–2026) ready to test without uploading.
- **🌓 Dark & Light Modes:** Elegant, distraction-free UI with smooth scrolling and responsive design for both desktop and mobile devices.

---

## 📚 Preloaded Exam Papers Collection

| Exam Paper | Questions | Answer Key Status | Format |
| :--- | :---: | :---: | :---: |
| **Challenge 1:** All PYQs of JEE Main 2019 | **70** | ✅ Configured | Slide Mode |
| **Challenge 2:** Top 200 Questions JEE Main 2023 | **200** | ✅ 200 / 200 (100%) | Multi-column |
| **Challenge 3:** Top 200 Questions JEE Main 2024 | **200** | ✅ 200 / 200 (100%) | Multi-column |
| **Challenge 4:** Top 200 Questions JEE Main 2022 | **200** | ✅ 200 / 200 (100%) | Multi-column |
| **Challenge 5:** Top 200 Questions JEE Main 2025 | **200** | ✅ 200 / 200 (100%) | Multi-column |
| **Challenge 6:** Top 200 Questions JEE Main 2021 | **200** | ✅ 200 / 200 (100%) | Multi-column |
| **Challenge 7:** Top 100 Questions JEE Main 2020 | **100** | ✅ 100 / 100 (100%) | Multi-column |
| **Challenge 8:** Top 200 Questions JEE Main 2026 | **200** | ✅ 200 / 200 (100%) | Multi-column |
| **Challenge 9:** Theoretical Questions 2020–2023 | **141** | ✅ 141 / 141 (100%) | Multi-column |
| **Challenge 11:** Rank Booster Questions | **20** | ✅ Configured | Multi-column |
| **Challenge 13:** Top 100 Graphical Questions | **96** | ⚙️ Configurable via Modal | Slide Mode |
| **Challenge 14:** 30 Experiment & Instruments | **30** | ✅ 30 / 30 (100%) | Multi-column |
| **Challenge 15:** Top 50 Circuit Questions | **50** | ✅ 50 / 50 (100%) | Multi-column |

---

## 🛠️ Architecture & Pipeline

```text
Any Question PDF
       │
       ▼
1. Text & Layout Extraction (pdfjs-dist)
       │
       ▼
2. Multi-Column & Slide Detection (Boundary Analyzer)
       │
       ▼
3. High-Res Canvas Rendering & Auto-Trimming (2x Scale)
       │
       ▼
4. Answer Key Parser (Two-pass regex table matching)
       │
       ▼
5. Real-Time CBT Simulation (Timer, Question Palette, Hybrid Input)
       │
       ▼
6. Scorecard & Performance Analytics
```

---

## 🚀 Getting Started



## 🌐 Deploy to Vercel (1-Click Free Hosting)

1. Fork or push this repository to your GitHub.
2. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import your `pdf2cbt` repository.
4. Set **Root Directory** to `paper2cbt`.
5. Keep Build Command as `npm run build` and Output Directory as `dist`.
6. Click **Deploy** — your CBT website is live in 60 seconds!

---

## 🤝 Contributing

Contributions, feedback, and issue reports are always welcome! Feel free to open an issue or submit a pull request.

---

## 👤 Author

Crafted with ❤️ by **[Built-By-Ranjan](https://github.com/Built-By-Ranjan)**  
*Connecting technology with competitive exam preparation.*
