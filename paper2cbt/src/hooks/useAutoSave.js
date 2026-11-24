// useAutoSave.js
// Periodically persists a snapshot of exam progress so a refresh/crash doesn't
// lose the student's answers.
import { useEffect, useRef } from 'react';

export function useAutoSave(getSnapshot, saveFn, intervalMs = 5000) {
  const savedRef = useRef();

  useEffect(() => {
    const interval = setInterval(() => {
      const snapshot = getSnapshot();
      const serialized = JSON.stringify(snapshot);
      if (serialized !== savedRef.current) {
        saveFn(snapshot);
        savedRef.current = serialized;
      }
    }, intervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);
}
