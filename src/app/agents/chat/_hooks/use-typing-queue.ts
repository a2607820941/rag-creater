import { useCallback, useEffect, useRef } from "react";

type UseTypingQueueOptions = {
  chunkCharMax?: number;
  chunkCharMin?: number;
  delayMaxMs?: number;
  delayMinMs?: number;
  onAppendText: (messageId: string, text: string) => void;
};

export function useTypingQueue({
  chunkCharMax = 24,
  chunkCharMin = 8,
  onAppendText,
}: UseTypingQueueOptions) {
  const typingQueueRef = useRef<string[]>([]);
  const typingFrameRef = useRef<number | null>(null);
  const typingMessageIdRef = useRef<string | null>(null);
  const typingPendingCharCountRef = useRef(0);
  const typingSessionIdRef = useRef(0);
  const typingStreamDoneRef = useRef(false);
  const typingDrainResolverRef = useRef<(() => void) | null>(null);

  const cancelTypingFrame = useCallback(() => {
    if (typingFrameRef.current !== null) {
      window.cancelAnimationFrame(typingFrameRef.current);
      typingFrameRef.current = null;
    }
  }, []);

  const getBaseChunkSize = useCallback(() => {
    const minChars = Math.max(1, Math.min(chunkCharMin, chunkCharMax));
    const maxChars = Math.max(minChars, chunkCharMax);
    return minChars + Math.floor(Math.random() * (maxChars - minChars + 1));
  }, [chunkCharMax, chunkCharMin]);

  const getTypingBudget = useCallback(() => {
    const pendingChars = typingPendingCharCountRef.current;
    const baseChunkSize = getBaseChunkSize();

    if (pendingChars > 2000) return Math.min(pendingChars, baseChunkSize * 8);
    if (pendingChars > 800) return Math.min(pendingChars, baseChunkSize * 4);
    if (pendingChars > 240) return Math.min(pendingChars, baseChunkSize * 2);

    return Math.min(pendingChars, baseChunkSize);
  }, [getBaseChunkSize]);

  const takeNextTypingSlice = useCallback((maxChars: number) => {
    let remaining = maxChars;
    let nextText = "";

    while (remaining > 0 && typingQueueRef.current.length > 0) {
      const currentChunk = typingQueueRef.current[0] ?? "";
      if (!currentChunk) {
        typingQueueRef.current.shift();
        continue;
      }

      const slice = currentChunk.slice(0, remaining);
      nextText += slice;
      remaining -= slice.length;
      typingPendingCharCountRef.current = Math.max(
        0,
        typingPendingCharCountRef.current - slice.length
      );

      if (slice.length >= currentChunk.length) {
        typingQueueRef.current.shift();
      } else {
        typingQueueRef.current[0] = currentChunk.slice(slice.length);
      }
    }

    return nextText;
  }, []);

  const resolveTypingDrainIfReady = useCallback((sessionId: number) => {
    if (
      sessionId !== typingSessionIdRef.current ||
      !typingStreamDoneRef.current ||
      typingPendingCharCountRef.current > 0
    ) {
      return;
    }

    typingDrainResolverRef.current?.();
    typingDrainResolverRef.current = null;
  }, []);

  const scheduleTypingTickRef = useRef<(sessionId: number) => void>(
    () => undefined
  );

  const scheduleTypingTick = useCallback(
    (sessionId: number) => {
      if (typingFrameRef.current !== null) return;
      if (sessionId !== typingSessionIdRef.current) return;

      if (typingPendingCharCountRef.current === 0) {
        resolveTypingDrainIfReady(sessionId);
        return;
      }

      typingFrameRef.current = window.requestAnimationFrame(() => {
        typingFrameRef.current = null;

        if (sessionId !== typingSessionIdRef.current) return;

        const messageId = typingMessageIdRef.current;
        if (!messageId) return;

        const nextSlice = takeNextTypingSlice(getTypingBudget());

        if (nextSlice) {
          onAppendText(messageId, nextSlice);
        }

        if (typingPendingCharCountRef.current > 0) {
          scheduleTypingTickRef.current(sessionId);
          return;
        }

        resolveTypingDrainIfReady(sessionId);
      });
    },
    [
      getTypingBudget,
      onAppendText,
      resolveTypingDrainIfReady,
      takeNextTypingSlice,
    ]
  );

  useEffect(() => {
    scheduleTypingTickRef.current = scheduleTypingTick;
  }, [scheduleTypingTick]);

  const beginTypingSession = useCallback(
    (messageId: string) => {
      cancelTypingFrame();
      typingQueueRef.current = [];
      typingMessageIdRef.current = messageId;
      typingPendingCharCountRef.current = 0;
      typingSessionIdRef.current += 1;
      typingStreamDoneRef.current = false;
      typingDrainResolverRef.current = null;
      return typingSessionIdRef.current;
    },
    [cancelTypingFrame]
  );

  const enqueueTypingChunk = useCallback(
    (sessionId: number, chunk: string) => {
      if (!chunk || sessionId !== typingSessionIdRef.current) return;

      typingQueueRef.current.push(chunk);
      typingPendingCharCountRef.current += chunk.length;
      scheduleTypingTick(sessionId);
    },
    [scheduleTypingTick]
  );

  const markTypingStreamDone = useCallback(
    (sessionId: number) => {
      if (sessionId !== typingSessionIdRef.current) return;

      typingStreamDoneRef.current = true;
      if (typingPendingCharCountRef.current > 0) {
        scheduleTypingTick(sessionId);
        return;
      }

      resolveTypingDrainIfReady(sessionId);
    },
    [resolveTypingDrainIfReady, scheduleTypingTick]
  );

  const waitForTypingDrain = useCallback((sessionId: number) => {
    if (
      sessionId !== typingSessionIdRef.current ||
      (typingStreamDoneRef.current && typingPendingCharCountRef.current === 0)
    ) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      typingDrainResolverRef.current = resolve;
    });
  }, []);

  const stopTypingSession = useCallback(() => {
    cancelTypingFrame();
    typingQueueRef.current = [];
    typingMessageIdRef.current = null;
    typingPendingCharCountRef.current = 0;
    typingStreamDoneRef.current = true;
    typingSessionIdRef.current += 1;
    typingDrainResolverRef.current?.();
    typingDrainResolverRef.current = null;
  }, [cancelTypingFrame]);

  return {
    beginTypingSession,
    enqueueTypingChunk,
    markTypingStreamDone,
    stopTypingSession,
    waitForTypingDrain,
  };
}
