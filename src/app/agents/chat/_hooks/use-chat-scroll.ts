import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

type UseChatScrollOptions = {
  bottomThresholdPx: number;
  itemCount: number;
  scrollToLatest: () => void;
  scrollContainerRef?: RefObject<HTMLElement | null>;
};

export function useChatScroll({
  bottomThresholdPx,
  itemCount,
  scrollToLatest,
  scrollContainerRef: externalScrollContainerRef,
}: UseChatScrollOptions) {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const internalScrollContainerRef = useRef<HTMLElement>(null);
  const scrollContainerRef =
    externalScrollContainerRef ?? internalScrollContainerRef;
  const shouldAutoScrollRef = useRef(true);
  const scrollToBottomFrameRef = useRef<number | null>(null);
  const isNearBottomRef = useRef(true);

  const syncScrollFollowState = useCallback(
    (nextIsNearBottom: boolean) => {
      shouldAutoScrollRef.current = nextIsNearBottom;

      if (isNearBottomRef.current === nextIsNearBottom) return;

      isNearBottomRef.current = nextIsNearBottom;
      setShowScrollToBottom(itemCount > 0 && !nextIsNearBottom);
    },
    [itemCount]
  );

  const isNearBottom = useCallback(
    (container: HTMLElement) => {
      const distanceToBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      return distanceToBottom <= bottomThresholdPx;
    },
    [bottomThresholdPx]
  );

  const requestScrollToBottom = useCallback(() => {
    if (scrollToBottomFrameRef.current !== null || itemCount === 0) {
      return;
    }

    scrollToBottomFrameRef.current = window.requestAnimationFrame(() => {
      scrollToBottomFrameRef.current = null;

      const container = scrollContainerRef.current;
      if (!container || itemCount === 0) return;

      scrollToLatest();
      container.scrollTop = container.scrollHeight;
      syncScrollFollowState(true);
    });
  }, [itemCount, scrollContainerRef, scrollToLatest, syncScrollFollowState]);

  const jumpToBottom = useCallback(() => {
    requestScrollToBottom();
  }, [requestScrollToBottom]);

  const handleMessageScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    syncScrollFollowState(isNearBottom(container));
  }, [isNearBottom, scrollContainerRef, syncScrollFollowState]);

  const resetScrollTracking = useCallback(() => {
    shouldAutoScrollRef.current = true;
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  useEffect(() => {
    if (itemCount === 0) {
      shouldAutoScrollRef.current = true;
      isNearBottomRef.current = true;
      window.requestAnimationFrame(() => setShowScrollToBottom(false));
      return;
    }

    if (shouldAutoScrollRef.current) {
      requestScrollToBottom();
      return;
    }

    setShowScrollToBottom(true);
  }, [itemCount, requestScrollToBottom, resetScrollTracking]);

  useEffect(() => {
    return () => {
      if (scrollToBottomFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollToBottomFrameRef.current);
      }
    };
  }, []);

  return {
    handleMessageScroll,
    jumpToBottom,
    resetScrollTracking,
    scrollContainerRef,
    showScrollToBottom,
  };
}
