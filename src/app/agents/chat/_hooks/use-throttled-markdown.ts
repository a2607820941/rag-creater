"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STREAM_RENDER_THROTTLE_MS = 80;

export function useThrottledMarkdown(content: string, streaming: boolean) {
  const [visibleContent, setVisibleContent] = useState(content);
  const latestContentRef = useRef(content);
  const visibleContentRef = useRef(content);
  const timerRef = useRef<number | null>(null);

  const updateVisibleContent = useCallback((nextContent: string) => {
    visibleContentRef.current = nextContent;
    setVisibleContent(nextContent);
  }, []);

  useEffect(() => {
    latestContentRef.current = content;

    if (!streaming) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (visibleContentRef.current !== content) {
        updateVisibleContent(content);
      }
      return;
    }

    if (!content) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (visibleContentRef.current) {
        updateVisibleContent("");
      }
      return;
    }

    if (!visibleContentRef.current) {
      updateVisibleContent(content);
      return;
    }

    if (visibleContentRef.current === content) return;
    if (timerRef.current !== null) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      updateVisibleContent(latestContentRef.current);
    }, STREAM_RENDER_THROTTLE_MS);
  }, [content, streaming, updateVisibleContent]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return streaming ? visibleContent : content;
}
