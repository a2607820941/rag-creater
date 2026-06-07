import { useCallback, useEffect, useRef } from "react";

type UseTypingQueueOptions = {
  chunkCharMax?: number;
  chunkCharMin?: number;
  delayMaxMs?: number;
  delayMinMs?: number;
  onAppendText: (messageId: string, text: string) => void;
};

export function useTypingQueue({
  chunkCharMax = 3,
  chunkCharMin = 1,
  delayMaxMs = 50,
  delayMinMs = 25,
  onAppendText,
}: UseTypingQueueOptions) {
  const typingQueueRef = useRef<string[]>([]);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingMessageIdRef = useRef<string | null>(null);
  const typingSessionIdRef = useRef(0);
  const typingStreamDoneRef = useRef(false);
  const typingDrainResolverRef = useRef<(() => void) | null>(null);

  const clearTypingTimer = useCallback(() => {
    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  const getTypingDelay = useCallback(() => {
    return (
      delayMinMs + Math.floor(Math.random() * (delayMaxMs - delayMinMs + 1))
    );
  }, [delayMaxMs, delayMinMs]);

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
      typingQueueRef.current.length > 0
    ) {
      return;
    }

    typingDrainResolverRef.current?.();
    typingDrainResolverRef.current = null;
  }, []);

  const scheduleTypingTickRef = useRef<(sessionId: number) => void>(() => undefined);

  const scheduleTypingTick = useCallback(
    (sessionId: number) => {
      if (typingTimeoutRef.current !== null) return;
      if (sessionId !== typingSessionIdRef.current) return;

      if (typingQueueRef.current.length === 0) {
        resolveTypingDrainIfReady(sessionId);
        return;
      }

      typingTimeoutRef.current = window.setTimeout(() => {
        typingTimeoutRef.current = null;

        if (sessionId !== typingSessionIdRef.current) return;

        const messageId = typingMessageIdRef.current;
        if (!messageId) return;

        const chunkSize =
          chunkCharMin +
          Math.floor(Math.random() * (chunkCharMax - chunkCharMin + 1));
        const nextSlice = takeNextTypingSlice(chunkSize);

        if (nextSlice) {
          onAppendText(messageId, nextSlice);
        }

        if (typingQueueRef.current.length > 0) {
          scheduleTypingTickRef.current(sessionId);
          return;
        }

        resolveTypingDrainIfReady(sessionId);
      }, getTypingDelay());
    },
    [
      chunkCharMax,
      chunkCharMin,
      getTypingDelay,
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
      clearTypingTimer();
      typingQueueRef.current = [];
      typingMessageIdRef.current = messageId;
      typingSessionIdRef.current += 1;
      typingStreamDoneRef.current = false;
      typingDrainResolverRef.current = null;
      return typingSessionIdRef.current;
    },
    [clearTypingTimer]
  );

  const enqueueTypingChunk = useCallback(
    (sessionId: number, chunk: string) => {
      if (!chunk || sessionId !== typingSessionIdRef.current) return;

      typingQueueRef.current.push(chunk);
      scheduleTypingTick(sessionId);
    },
    [scheduleTypingTick]
  );

  const markTypingStreamDone = useCallback(
    (sessionId: number) => {
      if (sessionId !== typingSessionIdRef.current) return;

      typingStreamDoneRef.current = true;
      if (typingQueueRef.current.length > 0) {
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
      (typingStreamDoneRef.current && typingQueueRef.current.length === 0)
    ) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      typingDrainResolverRef.current = resolve;
    });
  }, []);

  const stopTypingSession = useCallback(() => {
    clearTypingTimer();
    typingQueueRef.current = [];
    typingMessageIdRef.current = null;
    typingStreamDoneRef.current = true;
    typingSessionIdRef.current += 1;
    typingDrainResolverRef.current?.();
    typingDrainResolverRef.current = null;
  }, [clearTypingTimer]);

  return {
    beginTypingSession,
    enqueueTypingChunk,
    markTypingStreamDone,
    stopTypingSession,
    waitForTypingDrain,
  };
}
