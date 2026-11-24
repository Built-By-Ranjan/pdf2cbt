// ExamContext.jsx
// Central store for exam data: parsed questions, settings, answer key, and
// live user responses/status while taking the CBT.
//
// Phase F: Questions and answer key are now stored in IndexedDB (via
// indexedDbService) rather than localStorage, to support large question
// crops. Only small session state (settings, responses, statuses, timer
// position) stays in localStorage.
import { createContext, useContext, useMemo, useCallback, useState, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { STORAGE_KEYS, DEFAULT_SETTINGS, QUESTION_STATUS } from '../utils/constants';
import {
  loadQuestions,
  loadAnswerKey,
  loadBlobs,
  clearAll as idbClearAll,
} from '../services/indexedDbService';

const ExamContext = createContext(null);

export function ExamProvider({ children }) {
  // Questions come from IndexedDB; local state holds the in-memory copy.
  const [questions, setQuestionsState] = useState([]);
  const [answerKey, setAnswerKeyState] = useState(null);
  const [idbLoaded, setIdbLoaded] = useState(false);

  // Blobs are loaded on demand per question (lazy, to keep memory bounded).
  // We store a cache of { questionId -> objectURL } so they don't reload on re-render.
  const [blobUrlCache] = useState(() => new Map());

  const [settings, setSettings] = useLocalStorage(STORAGE_KEYS.EXAM_SETTINGS, DEFAULT_SETTINGS);
  const [examState, setExamState] = useLocalStorage(STORAGE_KEYS.EXAM_STATE, {
    responses: {}, // questionId -> label or array of labels
    statuses: {},  // questionId -> QUESTION_STATUS
    startedAt: null,
    submittedAt: null,
    pdfMeta: null
  });

  // On mount: try to load any previously-parsed questions from IDB
  // (so a page refresh mid-test restores the question list).
  useEffect(() => {
    async function restore() {
      try {
        const [qs, ak] = await Promise.all([loadQuestions(), loadAnswerKey()]);
        if (qs && qs.length > 0) setQuestionsState(qs);
        if (ak) setAnswerKeyState(ak);
      } catch {
        // IDB unavailable — no-op, user will need to re-upload.
      } finally {
        setIdbLoaded(true);
      }
    }
    restore();
  }, []);

  /**
   * Called by Home.jsx after a successful parse run.
   * The parserService has already written to IDB; we just update local state.
   */
  const setQuestions = useCallback((qs) => {
    setQuestionsState(Array.isArray(qs) ? qs : []);
  }, []);

  const setAnswerKey = useCallback((ak) => {
    setAnswerKeyState(ak ?? null);
  }, []);

  /**
   * Lazily loads the image blob for a question and returns an object URL.
   * Caches the URL so repeated calls are free. Returns null if no blob.
   * @param {string} questionId
   * @returns {Promise<string|null>}
   */
  const getQuestionImageUrl = useCallback(async (questionId) => {
    if (blobUrlCache.has(questionId)) return blobUrlCache.get(questionId);
    try {
      const record = await loadBlobs(questionId);
      if (!record?.imageBlob) return null;
      const url = URL.createObjectURL(record.imageBlob);
      blobUrlCache.set(questionId, url);
      return url;
    } catch {
      return null;
    }
  }, [blobUrlCache]);

  /**
   * Lazily loads the solution blob for a question.
   * @param {string} questionId
   * @returns {Promise<string|null>}
   */
  const getSolutionImageUrl = useCallback(async (questionId) => {
    const cacheKey = `sol_${questionId}`;
    if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey);
    try {
      const record = await loadBlobs(questionId);
      if (!record?.solutionBlob) return null;
      const url = URL.createObjectURL(record.solutionBlob);
      blobUrlCache.set(cacheKey, url);
      return url;
    } catch {
      return null;
    }
  }, [blobUrlCache]);

  const setResponse = useCallback(
    (questionNumber, value) => {
      setExamState((prev) => ({
        ...prev,
        responses: { ...prev.responses, [questionNumber]: value },
        statuses: {
          ...prev.statuses,
          [questionNumber]:
            prev.statuses[questionNumber] === QUESTION_STATUS.MARKED_FOR_REVIEW ||
            prev.statuses[questionNumber] === QUESTION_STATUS.ANSWERED_AND_MARKED
              ? QUESTION_STATUS.ANSWERED_AND_MARKED
              : QUESTION_STATUS.ANSWERED
        }
      }));
    },
    [setExamState]
  );

  const clearResponse = useCallback(
    (questionNumber) => {
      setExamState((prev) => {
        const responses = { ...prev.responses };
        delete responses[questionNumber];
        return {
          ...prev,
          responses,
          statuses: { ...prev.statuses, [questionNumber]: QUESTION_STATUS.NOT_ANSWERED }
        };
      });
    },
    [setExamState]
  );

  const toggleMarkForReview = useCallback(
    (questionNumber) => {
      setExamState((prev) => {
        const isAnswered = prev.responses[questionNumber] !== undefined;
        const current = prev.statuses[questionNumber];
        const isMarked =
          current === QUESTION_STATUS.MARKED_FOR_REVIEW || current === QUESTION_STATUS.ANSWERED_AND_MARKED;
        const nextStatus = isMarked
          ? isAnswered
            ? QUESTION_STATUS.ANSWERED
            : QUESTION_STATUS.NOT_ANSWERED
          : isAnswered
            ? QUESTION_STATUS.ANSWERED_AND_MARKED
            : QUESTION_STATUS.MARKED_FOR_REVIEW;
        return { ...prev, statuses: { ...prev.statuses, [questionNumber]: nextStatus } };
      });
    },
    [setExamState]
  );

  const visitQuestion = useCallback(
    (questionNumber) => {
      setExamState((prev) => {
        if (prev.statuses[questionNumber]) return prev;
        return { ...prev, statuses: { ...prev.statuses, [questionNumber]: QUESTION_STATUS.NOT_VISITED } };
      });
    },
    [setExamState]
  );

  const startExam = useCallback(() => {
    setExamState((prev) => ({ ...prev, startedAt: Date.now(), submittedAt: null }));
  }, [setExamState]);

  const submitExam = useCallback(() => {
    setExamState((prev) => ({ ...prev, submittedAt: Date.now() }));
  }, [setExamState]);

  const resetExam = useCallback(() => {
    setExamState({ responses: {}, statuses: {}, startedAt: null, submittedAt: null, pdfMeta: null });
    setQuestionsState([]);
    setAnswerKeyState(null);
    // Revoke all cached object URLs
    for (const url of blobUrlCache.values()) URL.revokeObjectURL(url);
    blobUrlCache.clear();
    // Clear IDB
    idbClearAll().catch(() => {});
  }, [setExamState, blobUrlCache]);

  const setPdfMeta = useCallback(
    (meta) => {
      setExamState((prev) => ({ ...prev, pdfMeta: meta }));
    },
    [setExamState]
  );

  const loadPreloadedExam = useCallback(
    (exam) => {
      if (!exam) return;
      setQuestionsState(exam.questions || []);
      const akMap = new Map();
      if (exam.answerKey) {
        for (const [k, v] of Object.entries(exam.answerKey)) {
          akMap.set(Number(k), String(v));
        }
      }
      setAnswerKeyState(akMap);
      setExamState({
        responses: {},
        statuses: {},
        startedAt: Date.now(),
        submittedAt: null,
        pdfMeta: {
          fileName: exam.title,
          pageCount: exam.totalQuestions,
          pdfType: 'PRELOADED',
        },
      });
    },
    [setExamState]
  );

  const value = useMemo(
    () => ({
      questions,
      setQuestions,
      answerKey,
      setAnswerKey,
      settings,
      setSettings,
      examState,
      setResponse,
      clearResponse,
      toggleMarkForReview,
      visitQuestion,
      startExam,
      submitExam,
      resetExam,
      setPdfMeta,
      loadPreloadedExam,
      getQuestionImageUrl,
      getSolutionImageUrl,
      idbLoaded,
    }),
    [
      questions,
      setQuestions,
      answerKey,
      setAnswerKey,
      settings,
      setSettings,
      examState,
      setResponse,
      clearResponse,
      toggleMarkForReview,
      visitQuestion,
      startExam,
      submitExam,
      resetExam,
      setPdfMeta,
      loadPreloadedExam,
      getQuestionImageUrl,
      getSolutionImageUrl,
      idbLoaded,
    ]
  );

  return <ExamContext.Provider value={value}>{children}</ExamContext.Provider>;
}

export function useExam() {
  const ctx = useContext(ExamContext);
  if (!ctx) throw new Error('useExam must be used within ExamProvider');
  return ctx;
}
