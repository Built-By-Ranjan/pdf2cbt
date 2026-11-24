// useFullscreen.js
// Encapsulates the Fullscreen API so components don't touch document.* directly.
import { useState, useEffect, useCallback } from 'react';

export function useFullscreen(targetRef) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const enter = useCallback(async () => {
    const el = targetRef?.current || document.documentElement;
    if (el.requestFullscreen) {
      await el.requestFullscreen().catch(() => {});
    }
  }, [targetRef]);

  const exit = useCallback(async () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen().catch(() => {});
    }
  }, []);

  return { isFullscreen, enter, exit };
}
